/**
 * Keeps tracked acceptance durable and the agent-required Make entry point
 * bound to the live fixture ledger.
 *
 * `make mo-e2e` intentionally runs no actor. If its printed ranges drift from
 * the ledger, a caller can silently omit a live scenario or chase a fixture
 * family that no longer exists. Markdown-it owns heading and table recognition
 * so this contract cannot mistake prose or fenced examples for ledger rows.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACCEPTANCE = join(ROOT, "docs", "acceptance.md");
const LEDGER = join(ROOT, "docs", "phase-0-fixtures.md");
const markdown = new MarkdownIt();
const FIXTURE_DEFINITION_HEADER = [
  "ID",
  "Exact fixture",
  "Expected observation",
  "Fixture posture",
  "Support",
];

/** Read one Markdown table from AST tokens without interpreting source lines. */
function tableRows(tokens, start) {
  const rows = [];
  let row = null;
  let cell = null;
  let index = start;
  for (; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "table_close") break;
    if (token.type === "tr_open") row = [];
    if (token.type === "th_open" || token.type === "td_open") cell = [];
    if (token.type === "inline" && cell) cell.push(token.content);
    if (token.type === "th_close" || token.type === "td_close") {
      row.push(cell.join(""));
      cell = null;
    }
    if (token.type === "tr_close") {
      rows.push(row);
      row = null;
    }
  }
  return { rows, end: index };
}

/** Associate every AST table with its owning h2 so schema is section-bound. */
function sectionTables(source) {
  const tokens = markdown.parse(source, {});
  const tables = [];
  let heading = null;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "heading_open" && token.tag === "h2") {
      heading = tokens[index + 1].content;
      continue;
    }
    if (token.type !== "table_open" || !heading) continue;
    const parsed = tableRows(tokens, index + 1);
    index = parsed.end;
    tables.push({ heading, rows: parsed.rows });
  }
  return tables;
}

/** Return prose AST nodes only, excluding table cells whose semantics are column-owned. */
function proseNodes(source) {
  const prose = [];
  let inTable = false;
  for (const token of markdown.parse(source, {})) {
    if (token.type === "table_open") inTable = true;
    if (token.type === "table_close") inTable = false;
    if (!inTable && token.type === "inline") prose.push(token.content);
  }
  return prose;
}

/** Enforce that acceptance stores definitions and reusable posture, never run verdicts. */
function assertDurableAcceptance(source) {
  const expected = new Map([
    ["Normative invariants", ["ID", "Requirement", "Durable proof source"]],
    [
      "Preimplementation capability probes",
      ["ID", "Capability", "Evidence required", "Reusable posture"],
    ],
    ["Agent-required Herdr fixtures", ["ID", "Scenario", "Reusable posture"]],
    ["Omnigent acceptance", ["ID", "Requirement", "Reusable posture"]],
    [
      "Completion and cutover definitions",
      ["ID", "Completion definition", "Ephemeral proof source"],
    ],
  ]);
  const tables = sectionTables(source);
  assert.equal(tables.length, expected.size, "acceptance must have one table per durable section");
  assert.deepEqual(
    tables.map(({ heading }) => heading),
    [...expected.keys()],
    "acceptance durable sections must each own exactly one table in canonical order",
  );

  const postureWords = new Set(["PENDING", "SUPPORTED", "UNSUPPORTED"]);
  const candidateVerdicts = new Set(["PASS", "FAIL", "PENDING", "UNKNOWN"]);
  for (const { heading, rows } of tables) {
    const schema = expected.get(heading);
    assert.ok(schema, `unexpected acceptance table under ${heading}`);
    assert.deepEqual(rows[0], schema, `${heading} table schema drifted`);
    assert.ok(rows.length > 1, `${heading} has no definitions`);
    const postureColumn = schema.indexOf("Reusable posture");
    for (const row of rows.slice(1)) {
      assert.equal(row.length, schema.length, `${heading} has an incomplete definition row`);
      assert.ok(
        row.every((cell) => cell.length > 0),
        `${heading} has an empty definition cell`,
      );
      for (const [column, cell] of row.entries()) {
        const words = cell.split(" / ");
        assert.doesNotMatch(cell, /\b[0-9a-f]{40}\b/);
        assert.doesNotMatch(cell, /\bcurrent[- ]run\b/i);
        assert.doesNotMatch(cell, /\bfrozen SHA\b/i);
        if (column === postureColumn) {
          assert.ok(
            words.every((word) => postureWords.has(word)) && new Set(words).size === words.length,
            `${heading} has a non-reusable posture value: ${cell}`,
          );
        } else {
          assert.equal(
            words.every((word) => candidateVerdicts.has(word)),
            false,
            `${heading} stores a candidate verdict outside reusable posture`,
          );
          assert.doesNotMatch(
            cell,
            /(?:[Cc]andidate|[Rr]eviewer(?: A| B)?)[^.\n]{0,80}\b(?:PASS|FAIL|PENDING|UNKNOWN)\b/,
          );
        }
      }
    }
  }

  const prose = proseNodes(source).join("\n");
  assert.match(prose, /no transient SHA/);
  assert.match(prose, /review-freeze state/);
  assert.match(prose, /candidate PASS\/FAIL\/PENDING assertion belongs in this map/);
  assert.doesNotMatch(prose, /\b[0-9a-f]{40}\b/);
  assert.doesNotMatch(prose, /\bcurrent[- ]run\b/i);
  assert.doesNotMatch(prose, /\bfrozen SHA\b/i);
  assert.doesNotMatch(
    prose,
    /(?:candidate|reviewer(?: A| B)?)(?:[^.\n]{0,80})(?:status|verdict)\s*[:=]\s*(?:PASS|FAIL|PENDING|UNKNOWN)/i,
  );
}

/** Derive every h2 definition/support-posture group and its row IDs from the ledger AST. */
function fixtureDefinitionGroups(source) {
  const tokens = markdown.parse(source, {});
  const groups = [];
  let current = null;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "heading_open" && token.tag === "h2") {
      current = { heading: tokens[index + 1].content, ids: [] };
      continue;
    }
    if (token.type !== "table_open" || !current) continue;
    const parsed = tableRows(tokens, index + 1);
    index = parsed.end;
    if (!parsed.rows[0]) continue;
    if (
      parsed.rows[0].length !== FIXTURE_DEFINITION_HEADER.length ||
      parsed.rows[0].some((value, column) => value !== FIXTURE_DEFINITION_HEADER[column])
    ) {
      continue;
    }
    current.ids.push(...parsed.rows.slice(1).map((row) => row[0]));
    if (!groups.includes(current)) groups.push(current);
  }
  return groups;
}

/** Compact consecutive numeric IDs while keeping real gaps and suffixes visible. */
function compactIds(ids) {
  const parsed = ids.map((id) => /^(?<prefix>[A-Z]+)(?<number>[1-9][0-9]*)$/.exec(id)?.groups);
  if (
    parsed.every(Boolean) &&
    parsed.every(({ prefix }) => prefix === parsed[0].prefix) &&
    parsed.every(
      ({ number }, index) => index === 0 || Number(number) === Number(parsed[index - 1].number) + 1,
    )
  ) {
    return ids.length === 1 ? ids[0] : `${ids[0]}-${ids.at(-1)}`;
  }
  return ids.join("/");
}

/** Keep the ledger's descriptive heading while replacing its optional ID preface. */
function fixtureLabel(group) {
  const separator = group.heading.indexOf(" — ");
  const description = separator === -1 ? group.heading : group.heading.slice(separator + 3);
  return `${compactIds(group.ids)} — ${description}`;
}

/** Reject instructions that would invalidate the candidate merely to log E2E evidence. */
function assertCandidatePreservingOutput(output) {
  assert.doesNotMatch(output, /record evidence per row/i);
  assert.doesNotMatch(
    output,
    /(?:edit|write|update|append|record)[^\n]*docs\/(?:e2e|phase-0-fixtures)\.md/i,
  );
  assert.match(output, /exact SHA and per-scenario actor\/provider facts/);
  assert.match(output, /current run\/final result/);
  assert.match(output, /do not edit tracked docs for run evidence/);
}

test("tracked acceptance contains definitions and reusable posture, never candidate verdicts", () => {
  const source = readFileSync(ACCEPTANCE, "utf8");
  assertDurableAcceptance(source);

  assert.doesNotThrow(() =>
    assertDurableAcceptance(source.replace("PENDING / UNSUPPORTED", "SUPPORTED")),
  );
  assert.throws(() => assertDurableAcceptance(source.replace("Ephemeral proof source", "Status")));
  assert.throws(() =>
    assertDurableAcceptance(
      source.replace("Closed final-result `gates` plus deterministic QC evidence.", "PASS"),
    ),
  );
  assert.throws(() =>
    assertDurableAcceptance(
      source.replace(
        "Intent/approval tests and final-review definition.",
        "Reviewer A verdict=PASS.",
      ),
    ),
  );
  assert.throws(() =>
    assertDurableAcceptance(
      `${source}\nCurrent-run candidate status: PASS; reviewer A verdict=PASS.\n`,
    ),
  );
});

test("make mo-e2e names exactly the live ledger groups and cannot report PASS", () => {
  const fixtures = fixtureDefinitionGroups(readFileSync(LEDGER, "utf8")).map(fixtureLabel);
  assert.ok(fixtures.length > 0, "fixture ledger has no definition/support-posture tables");

  const result = spawnSync("make", ["mo-e2e"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 2, `${result.stdout}${result.stderr}`);
  assert.equal(
    result.stdout,
    [
      "AGENT_REQUIRED: not executed",
      "",
      "Docs:      docs/e2e.md, docs/phase-0-fixtures.md",
      ...fixtures.map(
        (fixture, index) => `${index === 0 ? "Fixtures:  " : "           "}${fixture}`,
      ),
      "Run:       execute the applicable scenarios without changing the frozen candidate",
      "Evidence:  keep exact SHA and per-scenario actor/provider facts in the current run/final result",
      "Ledger:    scenario definitions and support posture only; do not edit tracked docs for run evidence",
      "Cleanup:   stop every provider session you started, including on failure",
      "",
    ].join("\n"),
  );
  assertCandidatePreservingOutput(result.stdout);
  assert.throws(() =>
    assertCandidatePreservingOutput(
      `${result.stdout}Run: edit docs/phase-0-fixtures.md to record evidence per row\n`,
    ),
  );
});
