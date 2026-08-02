/**
 * §M-CLI-OWNERSHIP — Who drives this run, and which sessions it has open.
 *
 * Implements §A-CRASH-RECOVERY. Registration and takeover live together because
 * they are two halves of one rule: a run is driven by exactly one orchestrator
 * generation, and the only way to become that generation is either to say so
 * before anyone else has, or to prove the previous one is gone.
 */

import { HerdrAdapter } from "../../adapters/herdr.mjs";
import { GENERATION_ENV, readSettings } from "../../core/state-store.mjs";
import { routeNext } from "../../core/fsm.mjs";
import type { ParsedArgs } from "../args.mjs";
import { emit, fail, optionalFlag, readStdinJson, requireFlag } from "../args.mjs";
import type { Role, RunState, SessionRef } from "../../core/types.mjs";
import { WORKER_ROLES } from "../../core/types.mjs";
import { identityOf, loadState, mutate } from "./run-context.mjs";

/**
 * §M-CLI-OWNERSHIP — Register a session handle for a role, from flags or from stdin.
 *
 * The flag form is what every skill documents and it did not exist: a literal
 * reading of the orchestrator skill produced `unknown_flag`, so the
 * orchestrator never registered itself, the watchdog saw `unregistered` on
 * every tick, and unattended recovery was silently off for the whole run. The
 * stdin form stays for callers that already hold a full `SessionRef`.
 */
export async function commandSetSession(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const session = await sessionFromArgs(args, projectKey, runId);
  const next = await mutate(projectKey, runId, (state) =>
    // The orchestrator lives in its own slot, not in `sessions`. Filing it under
    // `sessions.orchestrator` left `orchestratorSession` empty, so every reader
    // — takeover, the watchdog — saw a live orchestrator as absent and acted on
    // that: one replaced it, the other spawned a second one.
    session.role === "orchestrator"
      ? { ...state, orchestratorSession: session }
      : {
          ...state,
          sessions: { ...state.sessions, [session.role]: session },
          sessionGeneration: { ...state.sessionGeneration, [session.role]: session.generation },
        },
  );
  emit({ runId, sessions: next.sessions, orchestratorSession: next.orchestratorSession ?? null });
}

/**
 * §M-CLI-OWNERSHIP — Build the handle being registered, from `--role`/`--session-id`
 * or from a whole `SessionRef` on stdin.
 *
 * The generation defaults to the one the run already tracks for that role, so
 * the common case — an orchestrator naming its own handle — needs two flags
 * rather than a hand-assembled JSON object with a field it has no way to know.
 */
async function sessionFromArgs(
  args: ParsedArgs,
  projectKey: string,
  runId: string,
): Promise<SessionRef> {
  const role = optionalFlag(args, "role");
  if (role === undefined) return readStdinJson<SessionRef>();

  if (role !== "orchestrator" && !(WORKER_ROLES as readonly string[]).includes(role)) {
    fail("unknown_role", `--role must be orchestrator or one of ${WORKER_ROLES.join(", ")}`);
  }
  const sessionId = requireFlag(args, "session-id");
  const state = loadState(projectKey, runId);
  const declared = optionalFlag(args, "generation");
  const generation =
    declared === undefined
      ? role === "orchestrator"
        ? state.orchestratorGeneration
        : (state.sessionGeneration[role as Role] ?? 1)
      : Number(declared);
  if (!Number.isInteger(generation) || generation < 1) {
    fail("invalid_generation", `--generation must be a positive integer, got ${declared}`);
  }
  const backend = readSettings(projectKey)?.backend ?? "herdr";
  return { backend, sessionId, role: role as Role, generation };
}

/** §M-CLI-OWNERSHIP — Backend statuses that prove an orchestrator will issue nothing further. */
const TERMINAL_ORCHESTRATOR_STATUS = new Set(["complete", "failed", "stopped", "absent"]);

/**
 * §M-CLI-OWNERSHIP — Ask the backend what became of the orchestrator being replaced.
 *
 * Observed, never declared. A caller-supplied status is worth nothing here: the
 * party most likely to supply it is a fresh orchestrator that has no way of
 * knowing, and the cost of being wrong is two live generations driving the same
 * workers. A backend that cannot answer yields `unknown`, which is refused.
 */
async function observePreviousOrchestrator(state: RunState): Promise<string> {
  const session = state.orchestratorSession;
  if (!session) return "absent";
  try {
    return await new HerdrAdapter({ binary: process.env["META_O_HERDR_BIN"] }).status(session);
  } catch (error) {
    return `unreadable: ${(error as Error).message}`;
  }
}

/**
 * §M-CLI-OWNERSHIP — Take over a run with a fresh orchestrator generation.
 *
 * Requires proof that the previous orchestrator is terminal or absent; without
 * that, two generations could drive the same run and issue conflicting
 * instructions to the same workers.
 */
export async function commandTakeover(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const observed = await observePreviousOrchestrator(loadState(projectKey, runId));

  if (!TERMINAL_ORCHESTRATOR_STATUS.has(observed)) {
    fail(
      "takeover_unproven",
      `the backend reports the previous orchestrator as ${observed}; ` +
        "takeover requires it to be complete, failed, stopped or absent",
      { observedStatus: observed },
    );
  }

  // Taking over is allowed to raise the generation past the caller's own claim;
  // that is what taking over means. Every later write is fenced against it.
  const previousClaim = process.env[GENERATION_ENV];
  delete process.env[GENERATION_ENV];
  let next: RunState;
  try {
    next = await mutate(projectKey, runId, (state) => ({
      ...state,
      orchestratorGeneration: state.orchestratorGeneration + 1,
    }));
  } finally {
    if (previousClaim !== undefined) process.env[GENERATION_ENV] = previousClaim;
  }
  emit({
    runId,
    previousStatus: observed,
    orchestratorGeneration: next.orchestratorGeneration,
    exportForThisOrchestrator: `${GENERATION_ENV}=${next.orchestratorGeneration}`,
    routing: routeNext(next),
  });
}
