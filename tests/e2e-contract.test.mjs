/**
 * Keeps the agent-required Make entry point bound to the live fixture ledger.
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
const LEDGER = join(ROOT, "docs", "phase-0-fixtures.md");
const markdown = new MarkdownIt();
const LIVE_TABLE_HEADER = ["ID", "Exact fixture", "Expected observation", "Run status", "Support"];

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

/** Derive every live h2 fixture group and its ordered row IDs from the ledger AST. */
function liveFixtureGroups(source) {
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
      parsed.rows[0].length !== LIVE_TABLE_HEADER.length ||
      parsed.rows[0].some((value, column) => value !== LIVE_TABLE_HEADER[column])
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

test("make mo-e2e names exactly the live ledger groups and cannot report PASS", () => {
  const fixtures = liveFixtureGroups(readFileSync(LEDGER, "utf8")).map(fixtureLabel);
  assert.ok(fixtures.length > 0, "fixture ledger has no live tables");

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
      "Run:       work through docs/phase-0-fixtures.md and record evidence per row",
      "Cleanup:   stop every provider session you started, including on failure",
      "",
    ].join("\n"),
  );
});
