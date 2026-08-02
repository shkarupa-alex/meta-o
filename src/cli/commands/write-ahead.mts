/**
 * §M-CLI-WRITE-AHEAD — The write-ahead sequence, owned by one module.
 *
 * Implements §A-BACKEND-CONTRACT. §20's rule is that every backend side effect
 * is recorded in durable state before it is attempted and cleared only once its
 * effect is known, and that reconciliation is the sole exit. The rule lived
 * inside the session commands as private helpers, so the one caller that was
 * not a session command — the watchdog, spawning a replacement orchestrator —
 * had no way to obey it and did not: it called `spawn` with nothing written
 * down, and a crash in between left a live agent that run state did not name
 * and `run cleanup` could not stop.
 *
 * Everything here takes a project key and a run id rather than a command
 * context, because a durable record belongs to a run, not to whichever process
 * happens to be writing it.
 */

import { isoTimestamp } from "../../core/clock.mjs";
import {
  clearPendingOperation,
  commitState,
  readState,
  withPendingOperation,
  withWriterLock,
} from "../../core/state-store.mjs";
import { roleOfPendingSpawn, roleOfSession, withSession, withoutSession } from "./session-state.mjs";
import type { PendingOperation, ReconcileResult, Role, RunState, SessionRef } from "../../core/types.mjs";
import { fail } from "../args.mjs";

/** §M-CLI-WRITE-AHEAD — What reconciliation needs from a backend adapter. */
export interface ReconcilingAdapter {
  expectedAgentName(role: Role, operationId: string): string;
  findSession(agentName: string, role: Role, generation: number): Promise<SessionRef | undefined>;
}

/** §M-CLI-WRITE-AHEAD — Apply one change to run state under the writer lock. */
export async function mutate(
  projectKey: string,
  runId: string,
  change: (state: RunState) => RunState,
): Promise<RunState> {
  return await withWriterLock(projectKey, runId, () => {
    const current = readState(projectKey, runId);
    if (!current) fail("unknown_run", `run ${runId} disappeared while it was being updated`);
    return commitState(change(current));
  });
}

/**
 * §M-CLI-WRITE-AHEAD — Raised when an effect is attempted with one already in flight.
 *
 * Thrown rather than passed to `fail`, which exits the process. That was
 * invisible while only one-shot commands prepared operations; the watchdog is a
 * daemon watching every project on the machine, and one run with a leftover
 * record would have taken the whole loop down. The CLI turns the class name
 * into the same `pending_operation` code the envelope carried before.
 */
export class PendingOperationError extends Error {
  /** §M-CLI-WRITE-AHEAD — The operation that is still in flight. */
  readonly pendingOperation: PendingOperation;

  /** §M-CLI-WRITE-AHEAD — Keep the blocking operation on the error, for the envelope. */
  constructor(pending: PendingOperation) {
    super(
      `operation ${pending.operationId} (${pending.kind}, ${pending.state}) is still in flight; ` +
        "run `meta-o session reconcile` before causing another effect",
    );
    this.name = "PendingOperationError";
    this.pendingOperation = pending;
  }
}

/**
 * §M-CLI-WRITE-AHEAD — Refuse to start a second side effect while one is in flight.
 *
 * One pending operation at a time is what makes reconciliation decidable: with
 * two, an observed effect cannot be attributed to a specific intent.
 */
export function assertNoPendingOperation(state: RunState): void {
  if (state.pendingOperation) throw new PendingOperationError(state.pendingOperation);
}

/**
 * §M-CLI-WRITE-AHEAD — Write the intent before the backend is touched.
 *
 * The "nothing else is in flight" check is re-made here, inside the writer
 * lock, and not only against the snapshot the caller started from. Two
 * `session spawn` calls that read the same pre-lock state both passed the
 * outer guard, both wrote their intent over each other's, and both spawned —
 * leaving one live worker that state does not name and nobody can stop.
 */
export async function prepare(
  projectKey: string,
  runId: string,
  operation: Omit<PendingOperation, "state" | "preparedAt">,
): Promise<PendingOperation> {
  const pending: PendingOperation = {
    ...operation,
    state: "prepared",
    preparedAt: isoTimestamp(),
  };
  await mutate(projectKey, runId, (state) => {
    assertNoPendingOperation(state);
    return withPendingOperation(state, pending);
  });
  return pending;
}

/**
 * §M-CLI-WRITE-AHEAD — Leave the intent in place when the backend call itself fails.
 *
 * A thrown call is exactly the ambiguous case: the request may or may not have
 * reached the backend. The record therefore survives, marked `uncertain`, and
 * the only sanctioned next step is reconciliation.
 */
export async function markUncertain(
  projectKey: string,
  runId: string,
  pending: PendingOperation,
): Promise<void> {
  await mutate(projectKey, runId, (state) =>
    withPendingOperation(state, { ...pending, state: "uncertain" }),
  );
}

/**
 * §M-CLI-WRITE-AHEAD — Record the pane a spawn just created, mid-operation.
 *
 * The write-ahead record is written before the whole spawn, but a spawn is two
 * backend calls and the pane id only exists after the first. Folding it into
 * the probe as soon as it is known is what lets reconciliation later
 * distinguish "nothing was created" from "a pane exists and an agent may be
 * starting in it".
 */
export async function recordPane(
  projectKey: string,
  runId: string,
  pending: PendingOperation,
  paneId: string,
): Promise<PendingOperation> {
  const probe = { ...(JSON.parse(pending.probe ?? "{}") as Record<string, unknown>), paneId };
  const updated: PendingOperation = { ...pending, probe: JSON.stringify(probe) };
  await mutate(projectKey, runId, (state) => withPendingOperation(state, updated));
  return updated;
}

/**
 * §M-CLI-WRITE-AHEAD — Settle a decided operation: adopt its effect, then clear it.
 *
 * Shared between `session reconcile` and the watchdog, because a reconcile that
 * only *reports* the effect is not a reconcile. The watchdog called the
 * adapter, logged the answer and left the record exactly where it was, so a run
 * whose orchestrator had died mid-spawn kept its pending operation forever:
 * every later tick re-asked the same question, and no replacement could be
 * started without violating the one-operation-at-a-time rule.
 *
 * `applied` and `not_applied` both clear the record — the difference is that
 * `not_applied` makes a retry legitimate. An `applied` spawn is looked up and
 * adopted first, which is the whole point: the session exists, so it must
 * become one this run names and can stop.
 */
export async function settleReconciled(
  projectKey: string,
  runId: string,
  adapter: ReconcilingAdapter,
  state: RunState,
  pending: PendingOperation,
  result: ReconcileResult,
): Promise<SessionRef | undefined> {
  if (result.effect === "unknown") return undefined;

  let recovered: SessionRef | undefined;
  if (result.effect === "applied" && pending.kind === "spawn") {
    const probe = JSON.parse(pending.probe ?? "{}") as { agentName?: string };
    const role = roleOfPendingSpawn(adapter, pending);
    if (probe.agentName && role) {
      recovered = await adapter.findSession(
        probe.agentName,
        role,
        (state.sessionGeneration[role] ?? 0) + 1,
      );
    }
  }

  await mutate(projectKey, runId, (current) => {
    const withRecovered = recovered ? withSession(current, recovered) : current;
    if (result.effect === "applied" && pending.kind === "stop") {
      const role = pending.sessionId ? roleOfSession(current, pending.sessionId) : undefined;
      if (role) return clearPendingOperation(withoutSession(withRecovered, role));
    }
    return clearPendingOperation(withRecovered);
  });

  return recovered;
}
