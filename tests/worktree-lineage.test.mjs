/**
 * Hold the worktree lineage recipe every Orca actor is created by.
 *
 * Executors and reviewers sometimes appeared beside the coordinator's worktree
 * instead of under it. §A-SESSION-01 keeps actors resources of the original
 * project; the recipe makes each new worktree a child of the task's working
 * directory, keeps the Git base a separate decision and takes the proof from
 * Orca's answer. The live half is LIVE-4 in docs/e2e.md.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flat = (path) => readFileSync(join(ROOT, path), "utf8").replace(/\s+/gu, " ");

test("a new actor worktree is a child of the task's working directory", () => {
  for (const path of [
    "shared/references/orca-mechanics.md",
    "skills/mo-orchestrate-orca/references/orca-mechanics.md",
    "skills/mo-review-orca/references/orca-mechanics.md",
  ]) {
    const mechanics = flat(path);
    assert.match(mechanics, /--worktree new-child --from <coordinator handle>/u, path);
    assert.match(mechanics, /--parent-worktree path:<checkout>\|worktree:<id>/u, path);
    assert.match(mechanics, /`--base-branch` alone says where Git starts/u, path);
    assert.match(
      mechanics,
      /reports `parentWorktreeId` equal to the id of the task's worktree/u,
      path,
    );
    assert.match(mechanics, /The project registration inventory does not change/u, path);
  }
  for (const path of ["src/skills/mo-review-orca/SKILL.md", "skills/mo-review-orca/SKILL.md"]) {
    const review = flat(path);
    assert.match(
      review,
      /`orca worktree create --parent-worktree path:<checkout>\|worktree:<id>`/u,
      path,
    );
    assert.match(
      review,
      /`parentWorktreeId` from `orca worktree show --json` proves the parent/u,
      path,
    );
  }
  const orchestrate = flat("src/skills/mo-orchestrate-orca/SKILL.md");
  assert.match(
    orchestrate,
    /`new-child --from` your handle inside a terminal, `--parent-worktree` outside one/u,
  );
  // The live scenario that proves it is announced, so no agent misses it.
  assert.match(flat("docs/e2e.md"), /\| LIVE-4 \| #53: /u);
});
