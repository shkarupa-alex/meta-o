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
    "not a second sign",
    "`id:<repo>::<path>` or `path:<path>`",
    "created without `--from`",
    "orca orchestration check --run <id> --wait",
    "no coordinator title is set",
  ]) {
    assert.ok(mechanics.includes(phrase), `mechanics never says: ${phrase}`);
  }
  // Two probes were tried live and neither discriminated: a relative word is
  // not a handle, and the handle-free read resolves the worktree's focused
  // terminal, so it refuses even a coordinator that holds one. What a
  // coordinator has and an ordinary shell does not is its own handle.
  for (const phrase of [
    'orca terminal read --terminal "$ORCA_TERMINAL_HANDLE" --screen --json',
    "`ORCA_TERMINAL_HANDLE`",
    "means outside, whatever the path said",
    "runtime-issued handle",
    // Observed live: the Run came back bound to an unrelated session's tab, and
    // releasing a worker bound to a caller-made terminal freed no process.
    "may name",
    "neither trusts nor closes that handle",
    "`state=retained processAction=none`",
  ]) {
    assert.ok(mechanics.includes(phrase), `mechanics never confirms the sign: ${phrase}`);
  }
});

/**
 * Ways a document can turn a directory comparison back into a placement sign.
 *
 * Both directions are needed: a sentence may announce itself as the sign before
 * naming the comparison, or name the comparison and then draw the verdict. One
 * predicate decides placement, and a document that offers a second one answers
 * a reachable state — an Orca terminal whose cwd is registered nowhere — twice.
 */
const pathIsNotASign = {
  "verdict first": /(?:\bsign\b|признак)[^.]{0,120}(?:realpath|`orca worktree list --json`)/iu,
  "comparison first":
    /(?:realpath|`orca worktree list --json`)[^.]{0,120}(?:\bmeans\b|значит|признак)/iu,
};

test("the placement sign is the caller's own handle, never a focused terminal", () => {
  // Two earlier signs were written, shipped and frozen by this very test before
  // anyone ran them from inside a real Orca terminal; both refused on both
  // sides. So the rule is now checked in every place that states it, and the
  // two non-discriminating forms may not stand in for it anywhere.
  const probe = 'orca terminal read --terminal "$ORCA_TERMINAL_HANDLE" --screen --json';
  const documents = {
    "orca-mechanics.md": flat(reference("orca-mechanics.md")),
    "src SKILL.md": flat(skillText()),
    "generated SKILL.md": flat(
      readFileSync(join(ROOT, "skills", "mo-orchestrate-orca", "SKILL.md"), "utf8"),
    ),
    "backend-capabilities.md": flat(
      readFileSync(join(ROOT, "docs", "backend-capabilities.md"), "utf8"),
    ),
  };
  for (const [name, text] of Object.entries(documents)) {
    assert.ok(text.includes(probe), `${name} does not name the handle-bound probe`);
    assert.ok(text.includes("ORCA_TERMINAL_HANDLE"), `${name} does not name the variable`);
    // A handle-free read may be described, never used as the sign: the giveaway
    // is the word "means" or its Russian equivalent binding it to a verdict.
    assert.doesNotMatch(
      text,
      /`orca terminal read --screen --json`[^.]{0,40}(?:means|значит)/u,
      `${name} uses a focused-terminal read as the placement sign`,
    );
    for (const [where, pattern] of Object.entries(pathIsNotASign))
      assert.doesNotMatch(text, pattern, `${name} makes a directory comparison a sign (${where})`);
  }

  // The contradiction this guards against survived three revisions of the sign,
  // because the old path sentence and the new handle sentence can both stand in
  // one document and only disagree on a state nobody had reached. Planting that
  // sentence back has to fail, or the two assertions above prove nothing.
  const planted = `${documents["orca-mechanics.md"]} The sign is exact: \`orca status --json\` succeeds, and the realpath of the current directory equals no \`path\` in \`orca worktree list --json\`.`;
  assert.ok(
    Object.values(pathIsNotASign).some((pattern) => pattern.test(planted)),
    "the planted path sentence was not recognized as a second sign",
  );
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
