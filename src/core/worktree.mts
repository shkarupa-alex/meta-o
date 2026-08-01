/**
 * §M-WORKTREE — Disposable, isolated checkouts in which gates execute.
 *
 * Implements §A-CANDIDATE-ISOLATION. QC, both reviewers and the E2E tester must
 * each look at the same immutable candidate, and none of them may disturb the
 * developer's working tree. A fresh detached worktree per gate is what makes
 * "the result was obtained on this exact content" checkable instead of assumed.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCleanWorktree, git, resolveCommit } from "./git.mjs";

/** §M-WORKTREE — A checked-out candidate plus the means to dispose of it. */
export interface GateWorktree {
  path: string;
  commitOid: string;
  dispose(): void;
}

/**
 * §M-WORKTREE — Create a detached worktree at a candidate commit.
 *
 * Detached on purpose: attaching a branch would let a gate advance a ref, and
 * two concurrent gates would then fight over it.
 */
export function createGateWorktree(repoDir: string, revision: string, label: string): GateWorktree {
  const commitOid = resolveCommit(revision, repoDir);
  const base = mkdtempSync(join(tmpdir(), `meta-o-gate-${label}-`));
  const path = join(base, "worktree");
  git(["worktree", "add", "--detach", "--quiet", path, commitOid], repoDir);
  assertCleanWorktree(path);
  return {
    path,
    commitOid,
    dispose: () => {
      try {
        git(["worktree", "remove", "--force", path], repoDir);
      } catch {
        rmSync(path, { recursive: true, force: true });
        try {
          git(["worktree", "prune"], repoDir);
        } catch {
          /* pruning is best effort; the temp directory is already gone */
        }
      }
      rmSync(base, { recursive: true, force: true });
    },
  };
}

/**
 * §M-WORKTREE — Run a gate body in a fresh worktree and prove it stayed clean.
 *
 * The post-condition is the point: a formatter or a test that writes into the
 * checkout invalidates the gate, and only a check after the body can catch it.
 */
export async function withGateWorktree<T>(
  repoDir: string,
  revision: string,
  label: string,
  body: (worktree: GateWorktree) => Promise<T> | T,
): Promise<{ result: T; commitOid: string }> {
  const worktree = createGateWorktree(repoDir, revision, label);
  try {
    const result = await body(worktree);
    assertCleanWorktree(worktree.path);
    return { result, commitOid: worktree.commitOid };
  } finally {
    worktree.dispose();
  }
}
