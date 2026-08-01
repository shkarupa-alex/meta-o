/**
 * §M-FSM — Phase machine and gate routing of one feature run.
 *
 * Implements §A-RUN-LIFECYCLE. The orchestrator is a model, and a model asked
 * to remember "which loop am I in and what invalidated what" will eventually
 * get it wrong in an expensive direction — running two heavy reviews on a
 * candidate whose E2E is already broken, or completing on four attestations
 * that belong to three different snapshots. Routing is therefore computed from
 * state, not recalled.
 */

import type { Confirmations, Phase, RevisionResult, RunState } from "./types.mjs";

/** §M-FSM — Normal forward order of the lifecycle. */
export const HAPPY_PATH: Phase[] = [
  "AWAITING_MODEL_SET",
  "PREFLIGHT",
  "SOLUTION_SCAN",
  "EXECUTING",
  "LOCAL_QC",
  "SMOKE_PREFLIGHT",
  "REVIEW_STABILIZATION",
  "E2E_STABILIZATION",
  "FINALIZE_METADATA",
  "COMPLETE",
];

/** §M-FSM — Pause states a run can leave again. */
export const PAUSE_PHASES: Phase[] = [
  "PAUSED_EXTERNAL",
  "PAUSED_QUOTA",
  "PAUSED_MISSING_TOOLS",
  "PAUSED_MODEL_UNAVAILABLE",
  "PAUSED_TECHNICAL_DISPUTE",
  "PAUSED_ORCHESTRATOR_BUDGET",
  "PAUSED_BACKEND_UNCERTAIN",
];

/** §M-FSM — States from which a run never resumes on its own. */
export const TERMINAL_PHASES: Phase[] = [
  "COMPLETE",
  "CANCELLED",
  "STOPPED_SPEC_IMPOSSIBLE",
  "FAILED_BACKEND",
];

/**
 * §M-FSM — Terminal states any working phase may fall into.
 *
 * `COMPLETE` is deliberately excluded: failure can strike at any moment, but
 * success has exactly one route, through `FINALIZE_METADATA`. Allowing a jump
 * straight to `COMPLETE` would make the four-attestation rule bypassable by a
 * single mis-sequenced transition.
 */
export const ABORT_PHASES: Phase[] = ["CANCELLED", "STOPPED_SPEC_IMPOSSIBLE", "FAILED_BACKEND"];

/** §M-FSM — Whether a phase is a resumable pause. */
export function isPaused(phase: Phase): boolean {
  return PAUSE_PHASES.includes(phase);
}

/** §M-FSM — Whether a phase ends the run. */
export function isTerminal(phase: Phase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

/**
 * §M-FSM — Working phases a run may be resumed into after a pause.
 *
 * A pause remembers where it came from through `resumeCondition`; this list is
 * what a fresh orchestrator is allowed to re-enter without a user decision.
 */
const RESUMABLE_TARGETS = new Set<Phase>([
  "PREFLIGHT",
  "SOLUTION_SCAN",
  "EXECUTING",
  "LOCAL_QC",
  "SMOKE_PREFLIGHT",
  "REVIEW_STABILIZATION",
  "E2E_STABILIZATION",
  "FINALIZE_METADATA",
]);

/**
 * §M-FSM — Legal phase transitions.
 *
 * Every working phase may enter any pause or terminal state, because failures
 * are not scheduled; the interesting constraint is which *forward* moves exist.
 */
export function allowedTransitions(from: Phase): Phase[] {
  if (isTerminal(from)) return [];
  const universal: Phase[] = [...PAUSE_PHASES, ...ABORT_PHASES];
  if (isPaused(from)) return [...RESUMABLE_TARGETS, ...universal];

  const forward: Partial<Record<Phase, Phase[]>> = {
    AWAITING_MODEL_SET: ["PREFLIGHT"],
    PREFLIGHT: ["SOLUTION_SCAN", "EXECUTING"],
    SOLUTION_SCAN: ["EXECUTING"],
    EXECUTING: ["LOCAL_QC"],
    LOCAL_QC: ["SMOKE_PREFLIGHT", "EXECUTING"],
    SMOKE_PREFLIGHT: ["REVIEW_STABILIZATION", "EXECUTING"],
    REVIEW_STABILIZATION: ["E2E_STABILIZATION", "EXECUTING", "LOCAL_QC"],
    E2E_STABILIZATION: ["FINALIZE_METADATA", "REVIEW_STABILIZATION", "EXECUTING", "LOCAL_QC"],
    FINALIZE_METADATA: ["COMPLETE", "EXECUTING"],
  };
  return [...(forward[from] ?? []), ...universal];
}

/** §M-FSM — Raised when a caller attempts an undefined transition. */
export class IllegalTransitionError extends Error {
  /** §M-FSM — Name both phases so the offending call site is obvious. */
  constructor(from: Phase, to: Phase) {
    super(`illegal phase transition ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

/** §M-FSM — Assert a transition is legal before it is committed to state. */
export function assertTransition(from: Phase, to: Phase): void {
  if (from === to) return;
  if (!allowedTransitions(from).includes(to)) throw new IllegalTransitionError(from, to);
}

/** §M-FSM — Whether one gate result attests the current candidate. */
export function attests(result: RevisionResult | undefined, snapshotDigest: string): boolean {
  return result?.status === "passed" && result.snapshotDigest === snapshotDigest;
}

/**
 * §M-FSM — Drop every attestation that no longer describes the candidate.
 *
 * Called whenever a fix changes content. Marking results `invalidated` rather
 * than deleting them keeps the reason visible when a human asks why a gate is
 * running again.
 */
export function invalidateStaleConfirmations(
  confirmations: Confirmations,
  snapshotDigest: string,
): Confirmations {
  const next: Confirmations = {};
  for (const [key, value] of Object.entries(confirmations) as Array<
    [keyof Confirmations, RevisionResult | undefined]
  >) {
    if (!value) continue;
    next[key] =
      value.snapshotDigest === snapshotDigest ? value : { ...value, status: "invalidated" };
  }
  return next;
}

/** §M-FSM — The next thing the orchestrator should cause to happen. */
export type RoutingAction =
  | "await_model_set"
  | "run_preflight"
  | "run_reuse_scan"
  | "await_candidate"
  | "await_selection_plan"
  | "run_qc"
  | "run_smoke"
  | "run_reviews"
  | "fix_review_findings"
  | "run_selected_e2e"
  | "fix_e2e_failures"
  | "finalize_metadata"
  | "complete"
  | "blocked";

/** §M-FSM — A routing decision with the reason that produced it. */
export interface Routing {
  action: RoutingAction;
  phase: Phase;
  reason: string;
  missingGates: Array<keyof Confirmations>;
}

/**
 * §M-FSM — Route a run that has not yet produced a candidate.
 *
 * These are the phases where the answer depends only on where the run is, not
 * on what has been attested; separating them keeps the gate routing below free
 * of phase special cases.
 */
function routeByPhase(state: RunState): Routing | undefined {
  const none: Array<keyof Confirmations> = [];

  if (isTerminal(state.phase)) {
    return {
      action: state.phase === "COMPLETE" ? "complete" : "blocked",
      phase: state.phase,
      reason: `run is in terminal state ${state.phase}`,
      missingGates: none,
    };
  }
  if (isPaused(state.phase)) {
    return {
      action: "blocked",
      phase: state.phase,
      reason: state.paused?.resumeCondition ?? `run is paused in ${state.phase}`,
      missingGates: none,
    };
  }
  if (state.phase === "AWAITING_MODEL_SET") {
    return {
      action: "await_model_set",
      phase: "AWAITING_MODEL_SET",
      reason: "the user has not confirmed a ModelSet for this run",
      missingGates: none,
    };
  }
  if (state.phase === "PREFLIGHT") {
    return {
      action: "run_preflight",
      phase: "PREFLIGHT",
      reason: "preflight has not completed",
      missingGates: none,
    };
  }
  if (state.phase === "SOLUTION_SCAN") {
    return {
      action: "run_reuse_scan",
      phase: "SOLUTION_SCAN",
      reason: "the user enabled the optional reuse scan",
      missingGates: none,
    };
  }
  return undefined;
}

/**
 * §M-FSM — Route a candidate that still needs one or both reviews.
 *
 * Distinguishes "nobody has reviewed this yet" from "the reviewers said
 * something and it has not been addressed": sending a candidate back for review
 * with its findings still open wastes a whole round, which is why findings are
 * fixed as one batch.
 */
function routeReviews(
  state: RunState,
  snapshot: string,
  primaryOk: boolean,
  crossOk: boolean,
): Routing {
  const missing: Array<keyof Confirmations> = [];
  if (!primaryOk) missing.push("reviewerPrimary");
  if (!crossOk) missing.push("reviewerCrossVendor");

  const openFindings =
    (state.openFindings?.reviewerPrimary?.length ?? 0) +
    (state.openFindings?.reviewerCrossVendor?.length ?? 0);

  return {
    action: openFindings > 0 ? "fix_review_findings" : "run_reviews",
    phase: "REVIEW_STABILIZATION",
    reason:
      openFindings > 0
        ? "open review findings must be fixed as one batch before the next review round"
        : `both reviewers must attest snapshot ${snapshot}`,
    missingGates: missing,
  };
}

/**
 * §M-FSM — Compute the next step from state alone.
 *
 * Encodes the normative routing table. The one subtle rule is the E2E loop
 * guard: once E2E stabilization is under way, review attestations invalidated
 * by an E2E fix do *not* pull the run back into a review round, because
 * re-reviewing after every small behavioural fix is exactly the churn the
 * separate loops exist to prevent.
 */
export function routeNext(state: RunState): Routing {
  const none: Array<keyof Confirmations> = [];

  const byPhase = routeByPhase(state);
  if (byPhase) return byPhase;

  const snapshot = state.candidateSnapshot?.digest;
  if (!snapshot) {
    return {
      action: "await_candidate",
      phase: "EXECUTING",
      reason: "no clean candidate commit exists yet",
      missingGates: none,
    };
  }

  if (!state.e2ePlan || state.e2ePlan.commitOid !== state.candidateSnapshot?.provenanceCommit) {
    return {
      action: "await_selection_plan",
      phase: "SMOKE_PREFLIGHT",
      reason: "the E2E tester has not produced a selection plan for this candidate",
      missingGates: none,
    };
  }

  const qcOk = attests(state.confirmations.qc, snapshot);
  const primaryOk = attests(state.confirmations.reviewerPrimary, snapshot);
  const crossOk = attests(state.confirmations.reviewerCrossVendor, snapshot);
  const e2eOk = attests(state.confirmations.e2e, snapshot);

  if (!qcOk) {
    return {
      action: "run_qc",
      phase: "LOCAL_QC",
      reason: "make qc has not passed on the current snapshot",
      missingGates: ["qc"],
    };
  }

  if (state.activeLoop?.kind === "e2e" && !e2eOk) {
    return {
      action: state.openFindings?.e2e?.length ? "fix_e2e_failures" : "run_selected_e2e",
      phase: "E2E_STABILIZATION",
      reason:
        "the E2E loop is active; reviews are not re-run until the selected scenarios are green",
      missingGates: ["e2e"],
    };
  }

  if (!primaryOk || !crossOk) return routeReviews(state, snapshot, primaryOk, crossOk);

  if (!e2eOk) {
    return {
      action: "run_selected_e2e",
      phase: "E2E_STABILIZATION",
      reason: "both reviews passed; the selected E2E set has not passed on this snapshot",
      missingGates: ["e2e"],
    };
  }

  return {
    action: "finalize_metadata",
    phase: "FINALIZE_METADATA",
    reason: "QC, both reviews and the selected E2E set attest one snapshot",
    missingGates: none,
  };
}

/**
 * §M-FSM — Whether completion is provable right now.
 *
 * Deliberately re-derived from the four attestations instead of trusting a
 * `phase === "FINALIZE_METADATA"` flag, so a mis-sequenced transition cannot
 * manufacture a completion.
 */
export function completionProven(state: RunState): boolean {
  const snapshot = state.candidateSnapshot?.digest;
  if (!snapshot) return false;
  return (
    attests(state.confirmations.qc, snapshot) &&
    attests(state.confirmations.reviewerPrimary, snapshot) &&
    attests(state.confirmations.reviewerCrossVendor, snapshot) &&
    attests(state.confirmations.e2e, snapshot)
  );
}
