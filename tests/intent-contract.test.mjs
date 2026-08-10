/**
 * Keeps the task's complete source intent payload independently accountable.
 *
 * Markdown-it owns fenced-record and intent-unit recognition. The contract
 * compares the source payload itself, so adding, deleting, re-heading, or
 * rewriting an intent cannot be hidden by a maintained list of expected names.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TASK = join(
  ROOT,
  "spec",
  "2026-08-08-herdr-orchestrator-operational-corrections",
  "task-description.md",
);
const SPEC = join(
  ROOT,
  "spec",
  "2026-08-08-herdr-orchestrator-operational-corrections",
  "spec-review.md",
);
const BUSINESS = join(ROOT, "docs", "business.md");
const METHODOLOGY = join(ROOT, "shared", "references", "methodology.md");
const RECORD_INFO = "meta-o-user-intents-v1 task-description.md";
const LEDGER_START = "<!-- meta-o-later-user-intents-v1:start -->";
const LEDGER_END = "<!-- meta-o-later-user-intents-v1:end -->";
const markdown = new MarkdownIt();

/** Return AST tokens inside one exact heading, stopping at its next peer. */
function sectionTokens(source, level, heading) {
  const tokens = markdown.parse(source, {});
  const tag = `h${level}`;
  let start = -1;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (
      tokens[index].type === "heading_open" &&
      tokens[index].tag === tag &&
      tokens[index + 1].type === "inline" &&
      tokens[index + 1].content === heading
    ) {
      start = index + 3;
      break;
    }
  }
  assert.notEqual(start, -1, `missing ${tag} ${heading}`);

  let end = tokens.length;
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].type !== "heading_open") continue;
    if (Number(tokens[index].tag.slice(1)) <= level) {
      end = index;
      break;
    }
  }
  return tokens.slice(start, end);
}

/** Return the only AST-recognized complete task payload in a target document. */
function intentRecord(source, label) {
  const records = markdown
    .parse(source, {})
    .filter((token) => token.type === "fence" && token.info === RECORD_INFO);
  assert.equal(records.length, 1, `${label} must contain one complete task payload`);
  return records[0].content;
}

/** Compare one source payload with both independently tracked records. */
function recordsMatch(source, business, spec) {
  return (
    intentRecord(business, "business framing") === source &&
    intentRecord(spec, "final spec") === source
  );
}

/** Derive ordered later-message payloads between AST-recognized ledger bounds. */
function laterIntentRecords(source, label) {
  const records = [];
  let inside = false;
  let opened = 0;
  let closed = 0;
  let quoteDepth = 0;
  let current = [];

  for (const token of markdown.parse(source, {})) {
    if (token.content.trim() === LEDGER_START) {
      assert.equal(inside, false, `${label} later-intent ledger must not nest`);
      inside = true;
      opened += 1;
      continue;
    }
    if (token.content.trim() === LEDGER_END) {
      assert.equal(quoteDepth, 0, `${label} ledger ended inside an intent`);
      assert.equal(inside, true, `${label} later-intent ledger end has no start`);
      inside = false;
      closed += 1;
      continue;
    }
    if (!inside) continue;
    if (token.type === "blockquote_open") {
      if (quoteDepth === 0) current = [];
      quoteDepth += 1;
    } else if (token.type === "blockquote_close") {
      quoteDepth -= 1;
      if (quoteDepth === 0) records.push(current.join("\n"));
    } else if (quoteDepth > 0 && token.type === "inline") {
      current.push(token.content);
    }
  }

  assert.equal(opened, 1, `${label} must have one later-intent ledger start`);
  assert.equal(closed, 1, `${label} must have one later-intent ledger end`);
  assert.equal(inside, false, `${label} later-intent ledger must close`);
  assert.ok(records.length > 0, `${label} later-intent ledger must not be empty`);
  return records;
}

/** Derive one mutation location from every non-empty source line. */
function intentMutationOffsets(source) {
  const offsets = [];
  let start = 0;
  for (const line of source.split("\n")) {
    const relative = line.search(/\S/u);
    if (relative >= 0) offsets.push(start + relative);
    start += line.length + 1;
  }
  assert.ok(offsets.length > 0, "task source must expose lines to mutate");
  return offsets;
}

test("business and final spec retain the complete task-description payload", () => {
  const task = readFileSync(TASK, "utf8");
  const business = readFileSync(BUSINESS, "utf8");
  const spec = readFileSync(SPEC, "utf8");

  assert.equal(intentRecord(business, "business framing"), task);
  assert.equal(intentRecord(spec, "final spec"), task);
});

test("mutating any non-empty source line invalidates both accountable copies", () => {
  const task = readFileSync(TASK, "utf8");
  const business = readFileSync(BUSINESS, "utf8");
  const spec = readFileSync(SPEC, "utf8");

  for (const offset of intentMutationOffsets(task)) {
    const mutated = `${task.slice(0, offset)}X${task.slice(offset + 1)}`;
    assert.equal(recordsMatch(mutated, business, spec), false);
  }
});

test("every later intent is ordered identically in business and final spec", () => {
  const business = laterIntentRecords(readFileSync(BUSINESS, "utf8"), "business framing");
  const spec = laterIntentRecords(readFileSync(SPEC, "utf8"), "final spec");
  assert.deepEqual(spec, business);

  for (let index = 0; index < business.length; index += 1) {
    const mutated = business.with(index, `${business[index]}X`);
    assert.notDeepEqual(spec, mutated);
  }
});

test("methodology §2.1 owns complete, credential-safe intent accounting", () => {
  const methodology = readFileSync(METHODOLOGY, "utf8");
  const section = sectionTokens(methodology, 3, "2.1 User intents (verbatim)")
    .map((token) => token.content)
    .join("\n");

  assert.match(section, /complete task-description payload/);
  assert.match(section, /explicitly bounded accountable ledger/);
  assert.match(section, /before implementation continues/);
  assert.match(section, /\[REDACTED: deployment token\]/);
  assert.match(section, /sensitive value/);
  for (const projectContract of ["AGENTS.md", "CLAUDE.md"]) {
    assert.match(
      readFileSync(join(ROOT, projectContract), "utf8"),
      /shared\/references\/methodology\.md §2\.1/,
    );
  }
});
