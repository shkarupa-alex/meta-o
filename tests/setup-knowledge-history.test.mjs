/**
 * Hold mo-setup to the historical-control contract it applies to other projects.
 *
 * Protects §A-MEMORY-01 and §A-BACKLOG-01.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const skill = readFileSync(join(ROOT, "src", "skills", "mo-setup", "SKILL.md"), "utf8");
const prose = skill.replace(/\s+/gu, " ");
const contract = readFileSync(
  join(ROOT, "src", "skills", "mo-setup", "references", "knowledge-id-history.md"),
  "utf8",
);

test("the probe is declared, clone-only and budgeted, never guessed", () => {
  // Every count here is "exactly one" on purpose: a section with two command
  // blocks is ambiguous, and an ambiguous declaration read as an answer is the
  // one failure this whole form exists to prevent.
  for (const phrase of [
    "Knowledge id history",
    "exactly one fenced one-line command",
    "exactly one `history_cutoff_sha` record",
    "Markdown AST",
    "history=unknown",
  ]) {
    assert.ok(prose.includes(phrase.replace(/\s+/gu, " ")), phrase);
  }
  // The probe may never run in the candidate worktree, and it proves the stage
  // rather than the project's whole quality command.
  assert.match(prose, /never by the project's full QC/u);
  assert.match(prose, /--no-hardlinks --no-local/u);
  assert.match(prose, /never opened for writing/u);
  assert.match(prose, /Delete the clone in a `finally`/u);
  assert.match(prose, /machine-local and never reported/u);
});

test("an exhausted budget is unknown, never a missing gate", () => {
  // Conflating "took too long" with "has no gate" would report a project as
  // ungated on a slow machine, which is a false accusation, not a finding.
  assert.match(prose, /600 s/u);
  assert.match(prose, /120 s/u);
  assert.match(prose, /naming the exhausted budget, never `gate_missing`/u);
});

test("both fixtures are required, because each alone proves half", () => {
  // A checker that rejects everything passes the deletion fixture; one that
  // accepts everything passes the authorized-reuse fixture. Only both together
  // say the gate discriminates.
  assert.match(prose, /exit non-zero and print a typed marker/u);
  assert.match(prose, /MO-KNOWLEDGE-HISTORY\/1 status=violations/u);
  assert.match(prose, /a zero exit or no marker is `gate_missing`/u);
  assert.match(prose, /git reset --hard/u);
  assert.match(prose, /git clean -xdff/u);
  assert.match(prose, /a failure is `gate_failing`/u);
  assert.match(prose, /each prove only half/u);
});

test("staleness is decided by the hash and only explained by the version", () => {
  assert.match(prose, /stale=<yes\|no\|unknown>/u);
  assert.match(prose, /missing, duplicated or unparsable line is `stale=unknown`/u);
  assert.match(prose, /never decides it/u);

  // The hash domain has to be stated, or supplier and copy hash different bytes
  // and every comparison is meaningless. Re-stamping must be a no-op.
  assert.match(contract, /without that line/u);
  const body = 'const value = "bundle";\n';
  const stamp = `// MO-KNOWLEDGE-HISTORY-SOURCE 0.2.0 ${createHash("sha256")
    .update(body)
    .digest("hex")}\n`;
  const stamped = body + stamp;
  const restamped =
    stamped.slice(0, stamped.length - stamp.length) +
    `// MO-KNOWLEDGE-HISTORY-SOURCE 0.2.0 ${createHash("sha256")
      .update(stamped.slice(0, stamped.length - stamp.length))
      .digest("hex")}\n`;
  assert.equal(restamped, stamped);
});

test("the report records name their fields and hide local paths", () => {
  assert.match(
    prose,
    /Knowledge-IDs\/1 current_tree=<ok\|violations\|unknown> history=<gate_present\|gate_missing\|gate_failing\|unknown> stale=<yes\|no\|unknown> qc=<json\|none> cutoff=<sha\|none>/u,
  );
  assert.match(prose, /Papercut\/1 path=<json\|none> linked=<yes\|no>/u);
  assert.match(prose, /history=<full\|shallow\|unknown>/u);
  assert.match(prose, /backlog_job=<yes\|no\|unknown>/u);
});

test("repair never copies this project's own boundary", () => {
  // A foreign cutoff exempts exactly the history the target project needs
  // checked, and the exemption would be invisible in its own gate output.
  assert.match(prose, /tools\/mo-knowledge-history\.mjs/u);
  assert.match(prose, /remove\|reuse\|editorial/u);
  assert.match(prose, /Never copy this project's boundaries or commit ids/u);
});
