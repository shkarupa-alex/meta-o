/**
 * §M-CLI-RUN-CONTEXT — The lock, the load and the identity every run command shares.
 *
 * Implements §A-RUN-LIFECYCLE. Extracted so that the two command modules — the
 * lifecycle itself and the gate results recorded against it — cannot drift into
 * two slightly different ideas of how a run is located and mutated. Every
 * mutation goes through `mutate` precisely so the lock, the version check and
 * the generation fence can never be forgotten at an individual call site.
 */

import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { commitState, readState, withWriterLock } from "../../core/state-store.mjs";
import type { RunState } from "../../core/types.mjs";
import { fail, optionalFlag, type ParsedArgs } from "../args.mjs";

/** §M-CLI-RUN-CONTEXT — Reviewer slots that can hold open findings. */
export type FindingSlot = "reviewerPrimary" | "reviewerCrossVendor" | "e2e";

/** §M-CLI-RUN-CONTEXT — Resolve the project identity for a command. */
export function identityOf(args: ParsedArgs): { canonicalPath: string; projectKey: string; repoDir: string } {
  const cwd = optionalFlag(args, "cwd") ?? process.cwd();
  const identity = resolveProjectIdentity(cwd);
  return { ...identity, repoDir: identity.canonicalPath };
}

/** §M-CLI-RUN-CONTEXT — Load a run's state or fail with a precise message. */
export function loadState(projectKey: string, runId: string): RunState {
  const state = readState(projectKey, runId);
  if (!state) fail("unknown_run", `run ${runId} has no state under project ${projectKey}`);
  return state;
}

/**
 * §M-CLI-RUN-CONTEXT — Apply a transition under the writer lock.
 *
 * Every mutation goes through here so that the lock, the version check and the
 * generation fence can never be forgotten at an individual call site.
 */
export async function mutate(
  projectKey: string,
  runId: string,
  change: (state: RunState) => RunState,
): Promise<RunState> {
  return await withWriterLock(projectKey, runId, () => {
    const current = loadState(projectKey, runId);
    return commitState(change(current));
  });
}

