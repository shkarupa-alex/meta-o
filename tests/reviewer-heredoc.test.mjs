/**
 * Run the reviewer's documented report command exactly as the built skill
 * prints it.
 *
 * A reviewer allowed to write only its `Body-File` once made a draft file next
 * to it, because the skill showed `prepare … < report` and no way to get the
 * report onto stdin without one. The skill now prints a here-document; this
 * test takes that very block from the built `SKILL.md`, installs the skill under
 * a path with a space, feeds a report holding `$`, backticks and `\`, and
 * proves that the bytes arrived unchanged and that `Body-File` is the only file
 * the command left behind. Protects §A-REVIEW-04.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = join(ROOT, "skills", "mo-reviewer");
const PLACEHOLDER = "<this skill's directory>";
const BODY_PLACEHOLDER = "…the complete report…";
const SHA = "d".repeat(40);
const scratch = [];
after(() => scratch.forEach((path) => rmSync(path, { recursive: true, force: true })));

/** The one shell block of the built skill that prepares the Body-File. */
function documentedCommand() {
  const tree = fromMarkdown(readFileSync(join(SKILL, "SKILL.md"), "utf8"));
  const blocks = tree.children.filter(
    (node) => node.type === "code" && node.value.includes('prepare --file "$BODY_FILE"'),
  );
  assert.equal(blocks.length, 1, "the skill shows exactly one prepare here-document");
  assert.equal(blocks[0].lang, "bash");
  return blocks[0].value;
}

// Every character a shell would otherwise expand or swallow: `$VAR`, `$(…)`,
// backticks, a trailing backslash and `\n` spelled out in prose.
function report() {
  return (
    "Review-Execution: ctx_heredoc\n" +
    `Candidate: ${SHA}\n` +
    "Mode: requested=deep effective=deep\n" +
    "Round: attempt=2/5 deep_reads=1 fragment=heredoc\n" +
    "Delegation: none\nVerdict: FINDINGS\nCounts: P0=0 P1=0 P2=1 P3=0\n\n" +
    "F-001 [P2] The cost $HOME and `$(rm -rf x)` reach the shell unquoted.\n\n" +
    "Evidence report\n\nGrounding\nHEAD: `git rev-parse HEAD` printed the target; status clean.\n\n" +
    "Scope and checks\nRead by SHA: git show, git diff. Path C:\\temp\\ stays \\n literal \\\n\n" +
    "Findings\n\n" +
    "F-001 [P2] confirmed. Causal path: `echo $1` expands `${PATH}` and `` `id` ``.\n" +
    "Impact: a crafted name runs. Location: src/run.sh:3. Proof: trace. Invariant: no\n" +
    "expansion. Direction: quote it; depth: local patch. Regression case: name `$(id)`.\n\n" +
    "Unknowns\nUnproven: none.\n\nResidual risks\nRisks: none.\n\n" +
    "End-Review: ctx_heredoc\n"
  );
}

test("the documented here-document writes the report byte for byte and nothing else", () => {
  const base = mkdtempSync(join(tmpdir(), "mo-heredoc-"));
  scratch.push(base);
  const installed = join(base, "agent skills", "mo-reviewer");
  cpSync(SKILL, installed, { recursive: true });
  const slot = join(base, "slot dir");
  mkdirSync(slot);
  const checkout = join(base, "checkout");
  mkdirSync(checkout);
  const body = join(slot, "slot-a-r2-d1.md");
  const text = report();
  // The placeholder stands for the report the reviewer types; its final line
  // feed is the one that ends the last here-document line.
  const command = documentedCommand()
    .replace(PLACEHOLDER, installed)
    .replace(BODY_PLACEHOLDER, text.slice(0, -1));
  const result = spawnSync("bash", ["-c", command], {
    cwd: checkout,
    encoding: "utf8",
    env: {
      ...process.env,
      BODY_FILE: body,
      DISPATCH_ID: "ctx_heredoc",
      CANDIDATE_SHA: SHA,
      MODE: "deep",
      N: "2",
      LIMIT: "5",
      M: "1",
      FRAGMENT: "heredoc",
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^MO-REVIEW-REPORT\/1 status=valid verdict=FINDINGS /mu);
  assert.match(result.stdout, /^MO-REVIEW-BODY\/1 status=prepared /mu);
  assert.equal(readFileSync(body, "utf8"), text);
  assert.deepEqual(readdirSync(slot), ["slot-a-r2-d1.md"]);
  assert.deepEqual(readdirSync(checkout), []);
});
