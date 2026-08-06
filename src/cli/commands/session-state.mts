/**
 * §M-CLI-SESSION-STATE — Pure reads and writes of a run's session bookkeeping.
 *
 * Implements §A-BACKEND-CONTRACT. Nothing here talks to a backend or to disk:
 * these are the questions a session command asks about state before it acts —
 * which model a role runs on, which session it already holds, what a request
 * digests to, which role a half-finished spawn was for. Separated so the
 * command file holds only the part that can fail halfway through.
 */

import { canonicalize, type JsonValue } from "../../core/canonical-json.mjs";
import { sha256Hex } from "../../core/hash.mjs";
import { fail, requireFlag, type ParsedArgs } from "../args.mjs";
import type {
  ModelRef,
  PendingOperation,
  Role,
  RunState,
  SessionRef,
  SessionTurn,
} from "../../core/types.mjs";

/** §M-CLI-SESSION-STATE — Every role a session may be opened for. */
export const ROLES: Role[] = [
  "orchestrator",
  "executor",
  "reviewerPrimary",
  "reviewerCrossVendor",
  "e2eTester",
  "reuseResearcher",
  "technicalAdjudicator",
];

/**
 * §M-CLI-SESSION-STATE — Which confirmed model each role runs on.
 *
 * The four named slots come straight from the ModelSet. The two auxiliary roles
 * are mapped rather than added to the ModelSet so that the user still confirms
 * exactly four models: the reuse researcher only reads the existing codebase and
 * can share the executor's model, while the technical adjudicator must be
 * independent of the executor, which is precisely the cross-vendor slot.
 */
export function modelFor(state: RunState, role: Role): ModelRef {
  switch (role) {
    case "executor":
    case "orchestrator":
    case "reuseResearcher":
      return state.modelSet.executor;
    case "reviewerPrimary":
      return state.modelSet.reviewerPrimary;
    case "reviewerCrossVendor":
    case "technicalAdjudicator":
      return state.modelSet.reviewerCrossVendor;
    case "e2eTester":
      return state.modelSet.e2eTester;
  }
}

/** §M-CLI-SESSION-STATE — Read and validate the `--role` flag. */
export function roleOf(args: ParsedArgs): Role {
  const role = requireFlag(args, "role") as Role;
  if (!ROLES.includes(role)) fail("invalid_role", `--role must be one of ${ROLES.join("|")}`);
  return role;
}

/** §M-CLI-SESSION-STATE — The session currently recorded for a role, if any. */
export function sessionFor(state: RunState, role: Role): SessionRef | undefined {
  return role === "orchestrator" ? state.orchestratorSession : state.sessions[role];
}

/**
 * §M-CLI-SESSION-STATE — The session a result must name, or nothing at all.
 *
 * Authority by dispatch. `resolve-finding` has required this since the audit
 * that found the fabricated `unrecorded-<role>` stand-in, and the three
 * commands that *record* a result kept the stand-in — so closing one finding
 * was held to a standard that setting a whole completion attestation was not.
 * A `record-review` against a run with an empty `sessions` map produced two of
 * the four attestations out of nothing.
 *
 * This is dispatch, not authentication: a model that can reach this CLI and
 * impersonate a reviewer the orchestrator did dispatch is not something a local
 * tool can exclude, and `docs/knowledge/` says so. What it does exclude is a
 * result attributed to a worker that never existed.
 *
 * Record the result before stopping the worker that produced it — `session
 * stop` forgets the handle, and an attestation cannot name a session that is
 * gone.
 */
export function dispatchedSession(state: RunState, role: Role, what: string): SessionRef {
  const session = sessionFor(state, role);
  if (!session) {
    fail(
      "no_such_session",
      `this run has no ${role} session, so ${what} cannot be attributed to one; dispatch it ` +
        `with \`meta-o session spawn --role ${role}\` before recording its result`,
    );
  }
  return session;
}

/** §M-CLI-SESSION-STATE — Store a session handle in the slot its role belongs to. */
export function withSession(state: RunState, session: SessionRef): RunState {
  if (session.role === "orchestrator") return { ...state, orchestratorSession: session };
  return {
    ...state,
    sessions: { ...state.sessions, [session.role]: session },
    sessionGeneration: { ...state.sessionGeneration, [session.role]: session.generation },
  };
}

/** §M-CLI-SESSION-STATE — Forget a session handle whose backend session is gone. */
export function withoutSession(state: RunState, role: Role): RunState {
  const sessionTurns = { ...state.sessionTurns };
  delete sessionTurns[role];
  if (role === "orchestrator") {
    const updated = { ...state, sessionTurns };
    delete updated.orchestratorSession;
    return updated;
  }
  const sessions = { ...state.sessions };
  delete sessions[role];
  return { ...state, sessions, sessionTurns };
}

/** §M-CLI-SESSION-STATE — Remember the latest result-bearing turn for recovery and reading. */
export function withSessionTurn(state: RunState, role: Role, turn: SessionTurn): RunState {
  return { ...state, sessionTurns: { ...state.sessionTurns, [role]: turn } };
}

/** §M-CLI-SESSION-STATE — Digest of the request a pending operation stands for. */
export function digestOf(request: unknown): string {
  return sha256Hex(canonicalize(request as JsonValue));
}

/**
 * §M-CLI-SESSION-STATE — Which role an interrupted spawn was creating.
 *
 * Recovered from the probe's agent name, which encodes the role: the state has
 * no session for the role yet, precisely because the spawn never completed.
 */
export function roleOfPendingSpawn(
  adapter: { expectedAgentName(role: Role, operationId: string): string },
  pending: PendingOperation,
): Role | undefined {
  const probe = JSON.parse(pending.probe ?? "{}") as { agentName?: string };
  if (!probe.agentName) return undefined;
  return ROLES.find(
    (role) => adapter.expectedAgentName(role, pending.operationId) === probe.agentName,
  );
}

/** §M-CLI-SESSION-STATE — Which role currently holds a session id. */
export function roleOfSession(state: RunState, sessionId: string): Role | undefined {
  if (state.orchestratorSession?.sessionId === sessionId) return "orchestrator";
  for (const [role, session] of Object.entries(state.sessions)) {
    if (session?.sessionId === sessionId) return role as Role;
  }
  return undefined;
}
