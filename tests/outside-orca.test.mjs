/**
 * Hold the coordinator's own placement: an Orca terminal is not a precondition.
 *
 * Protects §A-ORCHESTRATION-01 and §A-SESSION-01.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markdown = new MarkdownIt();
const INSIDE = "Coordinator inside an Orca terminal";
const OUTSIDE = "Coordinator outside an Orca terminal";
// Prose is rewrapped by the formatter, so a phrase is matched against the
// document's words rather than against its line breaks.
const flat = (text) => text.replace(/\s+/gu, " ");
const reference = (name) => readFileSync(join(ROOT, "shared", "references", name), "utf8");
const skillText = () =>
  readFileSync(join(ROOT, "src", "skills", "mo-orchestrate-orca", "SKILL.md"), "utf8");

/**
 * The section titles in which a relative worktree selector is written.
 *
 * `current` and `active` resolve against the caller's own worktree. Outside an
 * Orca terminal the caller has none, so the words name nothing — and a selector
 * that names nothing selects whatever Orca picks, which is the one outcome this
 * lifecycle cannot afford.
 */
function relativeSelectorSections(source) {
  const found = new Set();
  let heading = null;
  let inHeading = false;
  for (const token of markdown.parse(source, {})) {
    if (token.type === "heading_open") inHeading = true;
    if (token.type !== "inline") continue;
    if (inHeading) {
      heading = token.content;
      inHeading = false;
      continue;
    }
    for (const child of token.children ?? []) {
      if (child.type === "code_inline" && ["current", "active"].includes(child.content)) {
        found.add(heading);
      }
    }
  }
  return [...found];
}

/** Rows of one named table, so a neighbouring table answers its own question. */
function tableRows(source, heading) {
  const rows = [];
  let current = null;
  let inHeading = false;
  let cell = 0;
  let row = [];
  for (const token of markdown.parse(source, {})) {
    if (token.type === "heading_open") inHeading = true;
    if (token.type === "tr_open") {
      cell = 0;
      row = [];
    }
    if (token.type === "td_open") cell += 1;
    if (token.type === "inline" && inHeading) {
      current = token.content;
      inHeading = false;
    } else if (token.type === "inline" && cell > 0) {
      row.push(token.content);
    }
    if (token.type === "tr_close" && cell > 0 && current === heading) rows.push(row);
  }
  return rows;
}

test("a relative worktree selector is written only where the coordinator has a worktree", () => {
  const mechanics = reference("orca-mechanics.md");
  assert.deepEqual(relativeSelectorSections(mechanics), [INSIDE]);

  // The guard has to be able to see one. Planting the same selector in the
  // outside section must name that section, or the check above proves nothing.
  const planted = mechanics.replace("Outside, a relative selector", "Outside, `current`");
  assert.notEqual(planted, mechanics, "the planted selector never reached the document");
  assert.deepEqual(relativeSelectorSections(planted).sort(), [OUTSIDE, INSIDE].sort());
});

test("the outside route is named by its sign and by the commands it changes", () => {
  const mechanics = flat(reference("orca-mechanics.md"));
  for (const phrase of [
    "realpath of the current directory equals no `path` in",
    "`id:<repo>::<path>` or `path:<path>`",
    "created without `--from`",
    "orca orchestration check --run <id> --wait",
    "no coordinator title is set",
  ]) {
    assert.ok(mechanics.includes(phrase), `mechanics never says: ${phrase}`);
  }
  // A live rehearsal shell stood inside a registered worktree and still had no
  // terminal: the path matched while `current` answered `terminal_handle_stale`.
  for (const phrase of [
    "orca terminal read --terminal current --screen --json",
    "`terminal_handle_stale`",
    "means outside, whatever the path said",
  ]) {
    assert.ok(mechanics.includes(phrase), `mechanics never confirms the sign: ${phrase}`);
  }
});

test("the watchdog is an option the coordinator names, not a condition it waits on", () => {
  for (const source of [skillText(), reference("orca-mechanics.md")].map(flat)) {
    assert.match(source, /limit is accepted/u);
    assert.match(source, /until a human returns/u);
    assert.match(source, /when the user asks for the watchdog/u);
    assert.match(source, /`jq` and `flock`/u);
    assert.match(source, /typed gap/u);
  }
});

test("intermediate coordinator files never land in a tracked path", () => {
  const skill = flat(skillText());
  assert.match(skill, /where `\.orca\/` is not ignored/u);
  assert.match(skill, /no temporary file into a tracked path and return `needs_attention`/u);
});

test("the capability document answers which skills run without Orca", () => {
  const source = readFileSync(join(ROOT, "docs", "backend-capabilities.md"), "utf8");
  const rows = tableRows(source, "Запуск вне Orca");
  const skills = rows.map(([name]) => name);
  assert.ok(skills.includes("`mo-orchestrate-orca`"), "the orchestrator row is missing");
  assert.ok(skills.includes("`mo-review-orca`"), "the review row is missing");
  assert.ok(skills.includes("`mo-watchdog`"), "the watchdog row is missing");
  for (const [name, outside] of rows) {
    assert.equal(outside, "да", `${name} is listed as unable to run outside Orca`);
  }
  const orchestrator = rows.find(([name]) => name === "`mo-orchestrate-orca`");
  assert.match(orchestrator[2], /наблюдатель не является условием/u);
});
