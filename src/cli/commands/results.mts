/**
 * §M-CLI-RESULTS — CLI surface for the evidence a run records against a snapshot.
 *
 * Implements §A-SNAPSHOT-ATTESTATION and §A-INDEPENDENT-REVIEW. Everything here
 * writes a *claim about content*: a gate result, a review verdict, an E2E
 * outcome, a finding's fate. Each is refused unless it names the snapshot — and
 * where the claim depends on a selection, the plan — it actually examined, which
 * is what stops four gates from agreeing about four different trees.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { commitState, withWriterLock } from "../../core/state-store.mjs";
import {
  assertTransition,
  invalidatePlanBoundConfirmations,
  invalidateStaleConfirmations,
  loopForPhase,
  routeNext,
} from "../../core/fsm.mjs";
import { validatePlan } from "../../core/e2e-registry.mjs";
import {
  dismissTaste,
  isStaleResult,
  openBlockingRecords,
  proposeFix,
  pruneClosedRecords,
  resolveFinding,
  validateFinding,
  validateReviewResult,
} from "../../core/findings.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import { readExternalBytes } from "../../core/safe-fs.mjs";
import type {
  E2ERegistry,
  E2EResult,
  E2ESelectionPlan,
  Finding,
  FindingRecord,
  KnowledgeImpactPlan,
  Phase,
  ReviewResult,
  RevisionResult,
  RunState,
  SessionRef,
} from "../../core/types.mjs";
import { identityOf, loadState, mutate, type FindingSlot } from "./run-context.mjs";
import {
  boolFlag,
  emit,
  fail,
  optionalFlag,
  readStdin,
  readStdinJson,
  requireFlag,
  type ParsedArgs,
} from "../args.mjs";

/** §M-CLI-RESULTS — Gates whose PASS must arrive with the evidence that produced it. */
const EVIDENCE_BOUND_GATES = new Set(["reviewerPrimary", "reviewerCrossVendor", "e2e"]);

/**
 * §M-CLI-RESULTS — Record one gate's outcome against the current candidate.
 *
 * A result is stored with the digest it attests, never merely "the latest", so
 * a late-arriving verdict for superseded content is visibly stale instead of
 * silently counted.
 *
 * A *pass* for a reviewer or the E2E set cannot be recorded here at all. This
 * command validates neither the verdict, nor the findings it should have
 * carried, nor the plan judgement, and it stamps the run's own plan digest onto
 * the result — so it always matched. That made it a one-line way to turn a
 * `changes_requested` with an open blocker into a green gate, and a reviewer
 * who never ran into one who approved. Failures and invalidations stay here:
 * they take nothing away from anybody.
 */
export async function commandRecordGate(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const gate = requireFlag(args, "gate") as keyof RunState["confirmations"];
  const status = requireFlag(args, "status") as RevisionResult["status"];

  if (!["qc", "smoke", "reviewerPrimary", "reviewerCrossVendor", "e2e"].includes(gate)) {
    fail(
      "invalid_gate",
      `--gate must be qc|smoke|reviewerPrimary|reviewerCrossVendor|e2e, got ${gate}`,
    );
  }
  if (!["passed", "failed", "invalidated"].includes(status)) {
    fail("invalid_status", `--status must be passed|failed|invalidated, got ${status}`);
  }
  if (status === "passed" && EVIDENCE_BOUND_GATES.has(gate)) {
    fail(
      "evidence_required",
      `${gate} cannot be passed with record-gate; use ` +
        `${gate === "e2e" ? "`meta-o run record-e2e`" : "`meta-o run record-review`"}, ` +
        "which validates the verdict, its findings and the plan it judged",
    );
  }

  const next = await mutate(projectKey, runId, (state) => {
    const snapshot = state.candidateSnapshot;
    if (!snapshot) fail("no_candidate", "record a candidate with `run set-candidate` first");

    const digest = optionalFlag(args, "snapshot-digest") ?? snapshot.digest;
    if (digest !== snapshot.digest) {
      fail(
        "stale_gate_result",
        `result attests snapshot ${digest} but the candidate is ${snapshot.digest}`,
      );
    }
    if (gate !== "qc" && gate !== "smoke" && !state.e2ePlan) {
      fail("no_plan", "reviews and E2E require a stored selection plan");
    }

    const result: RevisionResult = {
      commitOid: optionalFlag(args, "commit") ?? snapshot.provenanceCommit,
      snapshotDigest: digest,
      ...(state.e2ePlan ? { planDigest: state.e2ePlan.planDigest } : {}),
      status,
      completedAt: isoTimestamp(),
      ...(optionalFlag(args, "evidence") ? { evidenceRef: optionalFlag(args, "evidence")! } : {}),
    };
    return { ...state, confirmations: { ...state.confirmations, [gate]: result } };
  });

  emit({ runId, gate, confirmations: next.confirmations, routing: routeNext(next) });
}

/**
 * §M-CLI-RESULTS — Record a whole review — verdict, findings and plan judgement — at once.
 *
 * `record-gate` will take a bare `passed` for a reviewer slot, which is fine for
 * a replay or a repair but leaves three checks to the caller's discipline: that
 * the verdict is a real verdict, that a pass carries no open defects, and that
 * the result describes the current snapshot *and* plan. Doing all of it in one
 * command means a reviewer's word only enters state together with the evidence
 * that makes it meaningful.
 */
export async function commandRecordReview(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const result = await readStdinJson<ReviewResult>();

  const validation = validateReviewResult(result);
  if (!validation.ok) fail("invalid_review_result", validation.errors.join("; "));

  const next = await mutate(projectKey, runId, (state) => {
    const snapshot = state.candidateSnapshot;
    if (!snapshot) fail("no_candidate", "record a candidate with `run set-candidate` first");
    if (!state.e2ePlan) fail("no_plan", "a review attests a selection plan; store one first");
    if (isStaleResult(result, { snapshotDigest: snapshot.digest, planDigest: state.e2ePlan.planDigest })) {
      fail(
        "stale_review_result",
        `review attests ${result.snapshotDigest}/${result.planDigest}, ` +
          `the candidate is ${snapshot.digest}/${state.e2ePlan.planDigest}`,
      );
    }

    const records: FindingRecord[] = result.findings.map((finding) => ({
      finding,
      raisedBy: state.sessions[result.reviewer] ?? {
        backend: "herdr",
        sessionId: `unrecorded-${result.reviewer}`,
        role: result.reviewer,
        generation: state.sessionGeneration[result.reviewer] ?? 1,
      },
      status: "open",
    }));

    const gate: RevisionResult = {
      commitOid: result.commitOid,
      snapshotDigest: result.snapshotDigest,
      planDigest: result.planDigest,
      status: result.verdict === "passed" ? "passed" : "failed",
      selectionPlanVerdict: result.selectionPlanVerdict,
      completedAt: result.completedAt || isoTimestamp(),
    };

    return {
      ...state,
      openFindings: { ...state.openFindings, [result.reviewer]: records },
      confirmations: { ...state.confirmations, [result.reviewer]: gate },
    };
  });

  emit({
    runId,
    reviewer: result.reviewer,
    verdict: result.verdict,
    open: next.openFindings?.[result.reviewer]?.length ?? 0,
    blocking: openBlockingRecords(next.openFindings?.[result.reviewer] ?? []).length,
    routing: routeNext(next),
  });
}

/**
 * §M-CLI-RESULTS — Record the outcome of the selected E2E set.
 *
 * Stores the per-scenario statuses as well as the gate, because the completion
 * metadata commit writes exactly those statuses into the catalog and the guard
 * that checks it must have something real to compare against. A failed or
 * blocked scenario is kept, not swallowed: `last_run` is meant to show the last
 * thing that actually happened.
 */
export async function commandRecordE2e(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const result = await readStdinJson<E2EResult>();

  const next = await mutate(projectKey, runId, (state) => {
    const snapshot = state.candidateSnapshot;
    if (!snapshot) fail("no_candidate", "record a candidate with `run set-candidate` first");
    if (!state.e2ePlan) fail("no_plan", "an E2E result attests a selection plan; store one first");

    const errors = e2eResultErrors(result, snapshot.digest, state.e2ePlan);
    if (errors.length > 0) fail("invalid_e2e_result", errors.join("; "));

    const failures = result.scenarios.filter((scenario) => scenario.status !== "passed");
    const gate: RevisionResult = {
      commitOid: result.commitOid,
      snapshotDigest: result.snapshotDigest,
      planDigest: result.planDigest,
      status: failures.length === 0 ? "passed" : "failed",
      completedAt: result.completedAt || isoTimestamp(),
    };

    return {
      ...state,
      e2eScenarioStatus: result.scenarios.map((scenario) => ({ ...scenario })),
      confirmations: { ...state.confirmations, e2e: gate },
    };
  });

  emit({
    runId,
    status: next.confirmations.e2e?.status,
    failures: (next.e2eScenarioStatus ?? []).filter((s) => s.status !== "passed"),
    routing: routeNext(next),
  });
}

/** §M-CLI-RESULTS — Everything that makes an E2E result unusable as an attestation. */
function e2eResultErrors(
  result: E2EResult,
  snapshotDigest: string,
  plan: E2ESelectionPlan,
): string[] {
  const errors: string[] = [];
  if (!result.commitOid) errors.push("commitOid is required");
  if (!result.completedAt) errors.push("completedAt is required");
  if (result.snapshotDigest !== snapshotDigest) {
    errors.push(`result attests snapshot ${result.snapshotDigest}, candidate is ${snapshotDigest}`);
  }
  if (result.planDigest !== plan.planDigest) {
    errors.push(`result attests plan ${result.planDigest}, run holds ${plan.planDigest}`);
  }
  if (!Array.isArray(result.scenarios) || result.scenarios.length === 0) {
    errors.push("at least one executed scenario is required");
    return errors;
  }

  const executed = new Set<string>();
  for (const scenario of result.scenarios) {
    if (!["passed", "failed", "blocked"].includes(scenario.status)) {
      errors.push(`${scenario.scenarioId}: status ${JSON.stringify(scenario.status)} is not recognised`);
    }
    if (!scenario.evidence) errors.push(`${scenario.scenarioId}: evidence is required`);
    executed.add(scenario.scenarioId);
  }
  for (const id of plan.selectedScenarioIds) {
    if (!executed.has(id)) errors.push(`selected scenario ${id} was not executed`);
  }
  for (const id of executed) {
    if (!plan.selectedScenarioIds.includes(id)) errors.push(`scenario ${id} is not in the plan`);
  }
  return errors;
}

/**
 * §M-CLI-RESULTS — Store findings raised by one reviewer.
 *
 * Validated on entry so that a malformed finding — taste marked as a blocker, a
 * defect with no evidence — is rejected at the boundary instead of becoming an
 * argument between two model sessions.
 */
export async function commandOpenFindings(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const slot = requireFlag(args, "reviewer") as FindingSlot;
  const findings = await readStdinJson<Finding[]>();

  const errors = findings.flatMap((finding) => validateFinding(finding).errors);
  if (errors.length > 0) fail("invalid_finding", errors.join("; "));

  const next = await mutate(projectKey, runId, (state) => {
    const session = state.sessions[slot === "e2e" ? "e2eTester" : slot];
    const raisedBy: SessionRef = session ?? {
      backend: "herdr",
      sessionId: `unrecorded-${slot}`,
      role: slot === "e2e" ? "e2eTester" : slot,
      generation: state.sessionGeneration[slot === "e2e" ? "e2eTester" : slot] ?? 1,
    };
    const records: FindingRecord[] = findings.map((finding) => ({
      finding,
      raisedBy,
      status: "open",
    }));
    return { ...state, openFindings: { ...state.openFindings, [slot]: records } };
  });

  emit({
    runId,
    reviewer: slot,
    open: next.openFindings?.[slot]?.length ?? 0,
    blocking: openBlockingRecords(next.openFindings?.[slot] ?? []).length,
  });
}

/** §M-CLI-RESULTS — Record the executor's proposed fix for one finding. */
export async function commandProposeFix(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const slot = requireFlag(args, "reviewer") as FindingSlot;
  const findingId = requireFlag(args, "finding-id");
  const candidate = requireFlag(args, "candidate-commit");

  const next = await mutate(projectKey, runId, (state) => {
    const records = state.openFindings?.[slot] ?? [];
    const updated = records.map((record) =>
      record.finding.id === findingId ? proposeFix(record, candidate, record.resolutionEvidence) : record,
    );
    return { ...state, openFindings: { ...state.openFindings, [slot]: updated } };
  });

  emit({ runId, findingId, status: next.openFindings?.[slot]?.find((r) => r.finding.id === findingId)?.status });
}

/**
 * §M-CLI-RESULTS — The session a `--by-role` claim resolves to.
 *
 * `--by-role` is a claim, not an identity: nothing in a CLI invocation proves
 * which model is behind it. What makes the rule enforceable anyway is the check
 * in `resolveFinding`, which compares the claimed role against the role that
 * raised the finding — so the executor claiming to be a reviewer still cannot
 * close a finding the reviewer raised about the executor's own work.
 */
function claimedSession(state: RunState, role: SessionRef["role"]): SessionRef {
  return (
    state.sessions[role] ?? {
      backend: "herdr",
      sessionId: `unrecorded-${role}`,
      role,
      generation: state.sessionGeneration[role] ?? 1,
    }
  );
}

/** §M-CLI-RESULTS — Apply one closing transition to a single finding record. */
async function closeFinding(
  args: ParsedArgs,
  apply: (record: FindingRecord, by: SessionRef) => FindingRecord,
): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const slot = requireFlag(args, "reviewer") as FindingSlot;
  const findingId = requireFlag(args, "finding-id");
  const byRole = requireFlag(args, "by-role") as SessionRef["role"];

  const next = await mutate(projectKey, runId, (state) => {
    const records = state.openFindings?.[slot] ?? [];
    if (!records.some((record) => record.finding.id === findingId)) {
      fail("unknown_finding", `${slot} holds no open finding ${findingId}`);
    }
    const by = claimedSession(state, byRole);
    const updated = records.map((record) =>
      record.finding.id === findingId ? apply(record, by) : record,
    );
    return { ...state, openFindings: { ...state.openFindings, [slot]: pruneClosedRecords(updated) } };
  });

  emit({
    runId,
    findingId,
    remaining: next.openFindings?.[slot]?.length ?? 0,
    blocking: openBlockingRecords(next.openFindings?.[slot] ?? []).length,
    routing: routeNext(next),
  });
}

/**
 * §M-CLI-RESULTS — Close a finding on the authority of its raiser or an adjudicator.
 *
 * Reviewer A may not close reviewer B's finding, and the executor may close
 * nobody's: both are the same rule, that the party who decides a problem is
 * gone must be a party able to see whether it is.
 */
export async function commandResolveFinding(args: ParsedArgs): Promise<void> {
  await closeFinding(args, (record, by) => resolveFinding(record, by));
}

/**
 * §M-CLI-RESULTS — Drop a taste suggestion the executor declined to act on.
 *
 * Without this verb a declined suggestion has no exit: it is not a defect, so
 * no fix is coming, and `resolve-finding` refuses a record with no proposed
 * fix. The run would sit in the review loop forever over a matter of style.
 */
export async function commandDismissTaste(args: ParsedArgs): Promise<void> {
  await closeFinding(args, (record, by) => dismissTaste(record, by));
}

/** §M-CLI-RESULTS — Store the executor's temporary knowledge impact plan. */
export async function commandKnowledgePlan(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const plan = await readStdinJson<KnowledgeImpactPlan>();
  const next = await mutate(projectKey, runId, (state) => ({ ...state, knowledgeImpactPlan: plan }));
  emit({ runId, knowledgeImpactPlan: next.knowledgeImpactPlan });
}
