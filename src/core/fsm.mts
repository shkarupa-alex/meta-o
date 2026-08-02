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

import { adjudicable, openBlockingRecords } from "./findings.mjs";
import type { ActiveLoop, Confirmations, Phase, RevisionResult, RunState } from "./types.mjs";

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
    // LOCAL_QC → E2E_STABILIZATION is the return leg of an E2E fix. Without it
    // the only way out of LOCAL_QC ran through REVIEW_STABILIZATION, which
    // rewrites `activeLoop` to `review` and so disarms the guard that exists to
    // stop an E2E fix from dragging the run back into a review round — the
    // deadlock and the rule it broke were the same edge.
    LOCAL_QC: ["SMOKE_PREFLIGHT", "E2E_STABILIZATION", "EXECUTING"],
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

/**
 * §M-FSM — Whether one gate result attests the current candidate.
 *
 * Content identity alone is not enough for the three gates that are also bound
 * to a selection plan. A reviewer judged *this plan* complete and the E2E run
 * executed *this plan's* scenarios; swapping the plan afterwards leaves results
 * that look valid and describe a scenario set nobody ran. Passing `planDigest`
 * therefore makes the attestation two-dimensional, and a result recorded before
 * any plan existed can never satisfy it.
 */
export function attests(
  result: RevisionResult | undefined,
  snapshotDigest: string,
  planDigest?: string,
): boolean {
  if (result?.status !== "passed") return false;
  if (result.snapshotDigest !== snapshotDigest) return false;
  if (planDigest !== undefined && result.planDigest !== planDigest) return false;
  return true;
}

/** §M-FSM — Gates whose meaning depends on the E2E selection plan. */
export const PLAN_BOUND_GATES = ["reviewerPrimary", "reviewerCrossVendor", "e2e"] as const;

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

/**
 * §M-FSM — Drop the attestations a new selection plan invalidates.
 *
 * Only the three plan-bound gates are touched: `make qc` says nothing about
 * which scenarios were chosen, so re-running it after a plan change would be
 * pure cost. Reviews and E2E are re-run because they attested a plan that no
 * longer exists.
 */
export function invalidatePlanBoundConfirmations(
  confirmations: Confirmations,
  planDigest: string,
): Confirmations {
  const next: Confirmations = { ...confirmations };
  for (const gate of PLAN_BOUND_GATES) {
    const value = next[gate];
    if (value && value.planDigest !== planDigest) next[gate] = { ...value, status: "invalidated" };
  }
  return next;
}

/**
 * §M-FSM — Which stabilization loop a phase puts the run into.
 *
 * Derived from the phase rather than set by hand at each call site, because the
 * loop guard below is only worth anything if `activeLoop` is written every time
 * the run enters a loop — and a rule a caller has to remember is one that gets
 * forgotten in the recovery path first.
 */
export function loopForPhase(phase: Phase, previous?: ActiveLoop): ActiveLoop | undefined {
  if (phase === "FINALIZE_METADATA" || isTerminal(phase)) return undefined;
  const kind =
    phase === "REVIEW_STABILIZATION" ? "review" : phase === "E2E_STABILIZATION" ? "e2e" : undefined;
  if (!kind) return previous;
  if (previous?.kind === kind) return { ...previous, iteration: previous.iteration + 1 };
  return { kind, iteration: 1 };
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
  /**
   * Findings the executor has failed to settle twice, by §30's threshold.
   *
   * Reported, not acted on: §30 says the orchestrator *may* call an adjudicator,
   * and turning "may" into an automatic dispatch would spend a fourth model on
   * every stubborn finding. What was wrong is that the number the decision rests
   * on existed nowhere, so the rule could only be followed by an orchestrator
   * that happened to remember its own earlier turns — which is the one thing a
   * recovered orchestrator cannot do.
   */
  adjudicable?: string[];
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
      reason: "this run enabled the optional reuse scan",
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
    openBlockingRecords(state.openFindings?.reviewerPrimary ?? []).length +
    openBlockingRecords(state.openFindings?.reviewerCrossVendor ?? []).length;

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
 * §M-FSM — Everything that must exist before any gate can be judged.
 *
 * A plan sealed for an earlier candidate counts as no plan. Reviews and E2E
 * attest a scenario selection derived from a specific diff, so a plan whose
 * commit is not the candidate's describes work nobody re-examined.
 */
function routePrerequisites(state: RunState): Routing | undefined {
  const none: Array<keyof Confirmations> = [];

  const byPhase = routeByPhase(state);
  if (byPhase) return byPhase;

  if (!state.candidateSnapshot?.digest) {
    return {
      action: "await_candidate",
      phase: "EXECUTING",
      reason: "no clean candidate commit exists yet",
      missingGates: none,
    };
  }

  if (!state.e2ePlan || state.e2ePlanSnapshotDigest !== state.candidateSnapshot.digest) {
    return {
      action: "await_selection_plan",
      phase: "SMOKE_PREFLIGHT",
      reason: "the E2E tester has not produced a selection plan for this candidate",
      missingGates: none,
    };
  }
  return undefined;
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
function routeStep(state: RunState): Routing {
  const none: Array<keyof Confirmations> = [];

  const prerequisite = routePrerequisites(state);
  if (prerequisite) return prerequisite;

  const snapshot = state.candidateSnapshot!.digest;
  const plan = state.e2ePlan!.planDigest;
  const qcOk = attests(state.confirmations.qc, snapshot);
  const smokeOk = attests(state.confirmations.smoke, snapshot);
  const primaryOk = attests(state.confirmations.reviewerPrimary, snapshot, plan);
  const crossOk = attests(state.confirmations.reviewerCrossVendor, snapshot, plan);
  const e2eOk = attests(state.confirmations.e2e, snapshot, plan);

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

  if (!smokeOk) {
    return {
      action: "run_smoke",
      phase: "SMOKE_PREFLIGHT",
      reason: "the short build/boot/health smoke has not passed on the current snapshot",
      missingGates: ["smoke"],
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

  const blockers = openBlockingFindings(state);
  if (blockers > 0) {
    return {
      action: "fix_review_findings",
      phase: "REVIEW_STABILIZATION",
      reason: `${blockers} blocking finding(s) are still open; a PASS cannot stand over an open defect`,
      missingGates: none,
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
 * §M-FSM — The routing table's answer, plus the facts that outlive the branch.
 *
 * `adjudicable` is attached here rather than inside the review branch, and the
 * difference is not cosmetic. Proposing a fix is what makes a finding count
 * towards §30's threshold, and it is also what moves the candidate — so the
 * very next routing call goes to `run_qc`, not to the review branch. Computed
 * where it is used, the counter would be visible only in the states a run
 * leaves the moment it earns one. It is a fact about the argument, not about
 * the step, so every envelope carries it.
 */
export function routeNext(state: RunState): Routing {
  const routing = routeStep(state);
  const stuck = adjudicable([
    ...(state.openFindings?.reviewerPrimary ?? []),
    ...(state.openFindings?.reviewerCrossVendor ?? []),
  ]);
  return stuck.length > 0 ? { ...routing, adjudicable: stuck } : routing;
}

/**
 * §M-FSM — Every unresolved blocking finding, whoever raised it.
 *
 * Read from state rather than from the review results, because a verdict is a
 * moment and a finding is a fact that outlives it. A reviewer may attest a
 * snapshot and then, on a later reading of the same tree, open a blocker; the
 * attestation is still true about what it saw and the blocker is still open.
 */
export function openBlockingFindings(state: RunState): number {
  const slots = state.openFindings ?? {};
  return (
    openBlockingRecords(slots.reviewerPrimary ?? []).length +
    openBlockingRecords(slots.reviewerCrossVendor ?? []).length +
    openBlockingRecords(slots.e2e ?? []).length
  );
}

/**
 * §M-FSM — Whether completion is provable right now.
 *
 * Deliberately re-derived from the four attestations instead of trusting a
 * `phase === "FINALIZE_METADATA"` flag, so a mis-sequenced transition cannot
 * manufacture a completion.
 *
 * Open blockers are checked here and not only inside the review round, because
 * the review round is skipped once both reviewer gates read `passed` — which is
 * exactly the state a run is in when someone records a gate directly instead of
 * recording the review that produced it.
 */
export function completionProven(state: RunState): boolean {
  const snapshot = state.candidateSnapshot?.digest;
  const plan = state.e2ePlan?.planDigest;
  if (!snapshot || !plan) return false;
  if (state.e2ePlanSnapshotDigest !== state.candidateSnapshot?.digest) return false;
  if (openBlockingFindings(state) > 0) return false;
  return (
    attests(state.confirmations.qc, snapshot) &&
    attests(state.confirmations.reviewerPrimary, snapshot, plan) &&
    attests(state.confirmations.reviewerCrossVendor, snapshot, plan) &&
    attests(state.confirmations.e2e, snapshot, plan)
  );
}
