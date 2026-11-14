/**
 * Hold the review brief's division of the backlog gates.
 *
 * A static reviewer read its deferral lens as possibly requiring the project's
 * `MO-BACKLOG/1` command while the protocol forbids executing anything. Both
 * hold once the brief carries the caller's own gate result: the caller runs the
 * gate on the exact SHA (§A-BACKLOG-01), the reviewer judges the committed
 * notebook statically and gains no right to run anything (§A-REVIEW-04).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flat = (path) => readFileSync(join(ROOT, path), "utf8").replace(/\s+/gu, " ");
const FORM = "`Backlog-Gate: <G0|GC|G1|G2> <EMPTY|NOT-EMPTY|UNKNOWN|not_run>`";

test("the brief carries the caller's backlog gate and the reviewer never runs it", () => {
  const brief = flat("shared/references/review-brief.md");
  assert.equal(brief.includes(FORM), true);
  assert.match(brief, /run by the caller on exactly `Target`/u);
  assert.match(brief, /`not_run` is evidence the caller owns, never a check the reviewer skipped/u);
  assert.match(brief, /gains no right to run the gate, QC, a test or any other project command/u);

  for (const path of [
    "shared/references/review-protocol.md",
    "skills/mo-reviewer/references/review-protocol.md",
  ]) {
    const protocol = flat(path);
    assert.equal(protocol.includes(FORM), true, path);
    assert.match(protocol, /Running the backlog gates belongs to the caller/u, path);
    assert.match(protocol, /never run the gate, QC, a test or a linter/u, path);
    assert.match(protocol, /never a duty the reviewer missed/u, path);
    // Diagnostics still allows reading and the shipped helpers only.
    assert.match(
      protocol,
      /Tests, linters, formatters, type checkers and the project's QC gate are not run by a reviewer/u,
      path,
    );
    assert.doesNotMatch(protocol, /reviewer (?:may|can) run (?:the )?(?:gate|QC|backlog)/iu, path);
  }

  for (const path of ["src/skills/mo-reviewer/SKILL.md", "skills/mo-reviewer/SKILL.md"]) {
    const reviewer = flat(path);
    assert.match(reviewer, /`Knowledge-Layer`, `Backlog-Gate` and `E2E`/u, path);
    assert.match(reviewer, /never run the gate yourself/u, path);
  }
  for (const path of ["src/skills/mo-review-orca/SKILL.md", "skills/mo-review-orca/SKILL.md"]) {
    assert.match(
      flat(path),
      /write `Backlog-Gate: G0 not_run`; the reviewers never run the gate/u,
      path,
    );
  }
  assert.match(
    flat("src/skills/mo-orchestrate-orca/SKILL.md"),
    /`Backlog-Gate` line of that candidate/u,
  );
});
