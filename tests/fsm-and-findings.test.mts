/**
 * §M-TEST-FSM — Acceptance tests for gate routing and review verdicts.
 *
 * Covers the §00 and §30 acceptance lists: two reviews of different snapshots
 * never produce a joint pass, an E2E fix does not restart review mid-loop, the
 * final snapshot carries four attestations, a reviewer cannot pass with open
 * defects, taste cannot block, and the executor cannot close a finding.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  IllegalTransitionError,
  assertTransition,
  attests,
  completionProven,
  invalidateStaleConfirmations,
  routeNext,
} from "../dist/core/fsm.mjs";
import {
  FindingTransitionError,
  blockingFindings,
  dismissTaste,
  isStaleResult,
  openBlockingRecords,
  proposeFix,
  pruneClosedRecords,
  resolveFinding,
  validateFinding,
  validateReviewResult,
} from "../dist/core/findings.mjs";
import { validateModelSet } from "../dist/core/model-set.mjs";
import type {
  Finding,
  FindingRecord,
  RevisionResult,
  ReviewResult,
  RunState,
  SessionRef,
} from "../dist/core/types.mjs";

/** §M-TEST-FSM — A run positioned just before its gates, with a stored plan. */
function runAtGates(digest: string, commit: string): RunState {
  return {
    schemaVersion: 1,
    runId: "run-1",
    projectKey: "key-1",
    phase: "REVIEW_STABILIZATION",
    stateVersion: 5,
    orchestratorGeneration: 1,
    spec: { kind: "local", locator: "/tmp/s.md", sha256: "a".repeat(64), disposition: "external" },
    specBlob: "/tmp/blob.md",
    baseRevision: "b".repeat(40),
    candidateSnapshot: { digest, provenanceCommit: commit, computedAt: "2026-01-01T00:00:00Z" },
    modelSet: {
      executor: { route: "claude", vendor: "anthropic", family: "claude", model: "opus" },
      reviewerPrimary: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
      reviewerCrossVendor: { route: "codex", vendor: "openai", family: "gpt", model: "gpt-5" },
      e2eTester: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
    },
    sessions: {},
    sessionGeneration: {},
    decisions: [],
    e2ePlan: {
      schemaVersion: 1,
      commitOid: commit,
      selectedScenarioIds: ["E2E-SMOKE-01"],
      selectionRationale: "always required canary",
      impactedBusinessLinks: ["§B-CORE-01"],
      impactedTags: [],
      planDigest: "plan-digest",
    },
    confirmations: {},
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

/** §M-TEST-FSM — A passing gate result for one snapshot. */
function passed(digest: string, commit: string): RevisionResult {
  return {
    commitOid: commit,
    snapshotDigest: digest,
    planDigest: "plan-digest",
    status: "passed",
    completedAt: "2026-01-01T00:00:00Z",
  };
}

/** §M-TEST-FSM — A defect finding with everything the contract requires. */
function defect(id: string): Finding {
  return {
    id,
    severity: "major",
    classification: "defect",
    evidence: [{ kind: "file", reference: "src/app.py:12", detail: "unchecked index" }],
    basis: { type: "spec", reference: "§B-CORE-01" },
    impact: "the request crashes on an empty cart",
    recommendedFix: { approach: "guard the index", rationale: "cheapest correct fix" },
  };
}

test("gate results only count for the snapshot they attest", () => {
  const state = runAtGates("digest-1", "commit-1");
  assert.equal(attests(passed("digest-1", "commit-1"), "digest-1"), true);
  assert.equal(attests(passed("digest-0", "commit-0"), "digest-1"), false);
  assert.equal(completionProven(state), false);
});

test("two reviews of different snapshots never produce a joint pass", () => {
  const state = runAtGates("digest-2", "commit-2");
  state.confirmations = {
    qc: passed("digest-2", "commit-2"),
    smoke: passed("digest-2", "commit-2"),
    reviewerPrimary: passed("digest-2", "commit-2"),
    reviewerCrossVendor: passed("digest-1", "commit-1"),
    e2e: passed("digest-2", "commit-2"),
  };
  assert.equal(completionProven(state), false);
  assert.equal(routeNext(state).action, "run_reviews");
});

test("one snapshot with four attestations completes", () => {
  const state = runAtGates("digest-2", "commit-2");
  state.confirmations = {
    qc: passed("digest-2", "commit-2"),
    smoke: passed("digest-2", "commit-2"),
    reviewerPrimary: passed("digest-2", "commit-2"),
    reviewerCrossVendor: passed("digest-2", "commit-2"),
    e2e: passed("digest-2", "commit-2"),
  };
  assert.equal(completionProven(state), true);
  assert.equal(routeNext(state).action, "finalize_metadata");
});

test("an E2E fix does not pull the run back into a review round", () => {
  const state = runAtGates("digest-3", "commit-3");
  state.phase = "E2E_STABILIZATION";
  state.activeLoop = { kind: "e2e", iteration: 2, changedSinceOtherGate: true };
  state.confirmations = {
    qc: passed("digest-3", "commit-3"),
    reviewerPrimary: passed("digest-2", "commit-2"),
    reviewerCrossVendor: passed("digest-2", "commit-2"),
  };

  const routing = routeNext(state);
  assert.equal(routing.action, "run_selected_e2e");
  assert.equal(routing.phase, "E2E_STABILIZATION");
});

test("once E2E is green on the new snapshot the review loop resumes", () => {
  const state = runAtGates("digest-3", "commit-3");
  state.phase = "E2E_STABILIZATION";
  state.activeLoop = { kind: "e2e", iteration: 2, changedSinceOtherGate: true };
  state.confirmations = {
    qc: passed("digest-3", "commit-3"),
    smoke: passed("digest-3", "commit-3"),
    reviewerPrimary: passed("digest-2", "commit-2"),
    reviewerCrossVendor: passed("digest-2", "commit-2"),
    e2e: passed("digest-3", "commit-3"),
  };
  assert.equal(routeNext(state).action, "run_reviews");
});

test("the smoke gate stands between QC and the reviewers", () => {
  const state = runAtGates("digest-s", "commit-s");
  state.confirmations = { qc: passed("digest-s", "commit-s") };
  const routing = routeNext(state);
  assert.equal(routing.action, "run_smoke");
  assert.equal(routing.phase, "SMOKE_PREFLIGHT");
});

test("a review that attested a superseded plan does not count", () => {
  const state = runAtGates("digest-p", "commit-p");
  state.confirmations = {
    qc: passed("digest-p", "commit-p"),
    smoke: passed("digest-p", "commit-p"),
    reviewerPrimary: passed("digest-p", "commit-p"),
    reviewerCrossVendor: passed("digest-p", "commit-p"),
    e2e: passed("digest-p", "commit-p"),
  };
  assert.equal(completionProven(state), true);

  state.e2ePlan!.planDigest = "a-different-plan";
  assert.equal(completionProven(state), false);
  assert.equal(routeNext(state).action, "run_reviews");
});

test("declined taste does not hold the review loop open", () => {
  const state = runAtGates("digest-t", "commit-t");
  state.confirmations = {
    qc: passed("digest-t", "commit-t"),
    smoke: passed("digest-t", "commit-t"),
  };
  const taste: Finding = {
    id: "F-T",
    severity: "suggestion",
    classification: "taste",
    evidence: [{ kind: "file", reference: "src/app.py:3", detail: "naming" }],
    basis: { type: "engineering", reference: "style" },
    impact: "readability",
    recommendedFix: { approach: "rename", rationale: "clearer" },
  };
  state.openFindings = {
    reviewerPrimary: [
      { finding: taste, raisedBy: { backend: "herdr", sessionId: "s", role: "reviewerPrimary", generation: 1 }, status: "open" },
    ],
  };
  assert.equal(routeNext(state).action, "run_reviews");
});

test("QC is demanded before any review of a new candidate", () => {
  const state = runAtGates("digest-4", "commit-4");
  assert.equal(routeNext(state).action, "run_qc");
});

test("a candidate without a selection plan cannot reach the reviewers", () => {
  const state = runAtGates("digest-5", "commit-5");
  delete state.e2ePlan;
  assert.equal(routeNext(state).action, "await_selection_plan");
});

test("open review findings route to a batched fix rather than another review", () => {
  const state = runAtGates("digest-6", "commit-6");
  state.confirmations = {
    qc: passed("digest-6", "commit-6"),
    smoke: passed("digest-6", "commit-6"),
  };
  state.openFindings = {
    reviewerPrimary: [
      { finding: defect("F-1"), raisedBy: { backend: "herdr", sessionId: "s", role: "reviewerPrimary", generation: 1 }, status: "open" },
    ],
  };
  assert.equal(routeNext(state).action, "fix_review_findings");
});

test("changing content invalidates every attestation that described the old one", () => {
  const before = {
    qc: passed("digest-1", "commit-1"),
    reviewerPrimary: passed("digest-1", "commit-1"),
    e2e: passed("digest-2", "commit-2"),
  };
  const after = invalidateStaleConfirmations(before, "digest-2");
  assert.equal(after.qc?.status, "invalidated");
  assert.equal(after.reviewerPrimary?.status, "invalidated");
  assert.equal(after.e2e?.status, "passed");
});

test("a paused run reports the condition that would release it", () => {
  const state = runAtGates("digest-7", "commit-7");
  state.phase = "PAUSED_BACKEND_UNCERTAIN";
  state.paused = {
    reason: "send could not be proven",
    enteredAt: "2026-01-01T00:00:00Z",
    resumeCondition: "reconcile the pending operation",
  };
  const routing = routeNext(state);
  assert.equal(routing.action, "blocked");
  assert.match(routing.reason, /reconcile/);
});

test("undefined phase transitions are refused", () => {
  assertTransition("EXECUTING", "LOCAL_QC");
  assertTransition("LOCAL_QC", "PAUSED_QUOTA");
  assert.throws(
    () => assertTransition("EXECUTING", "COMPLETE"),
    (error: unknown) => error instanceof IllegalTransitionError,
  );
  assert.throws(() => assertTransition("COMPLETE", "EXECUTING"), IllegalTransitionError);
});

test("taste may only be raised as a suggestion", () => {
  const taste: Finding = { ...defect("F-2"), classification: "taste", severity: "blocker" };
  assert.equal(validateFinding(taste).ok, false);

  const acceptable: Finding = { ...defect("F-3"), classification: "taste", severity: "suggestion" };
  assert.equal(validateFinding(acceptable).ok, true);
  assert.equal(blockingFindings([acceptable]).length, 0);
});

test("a defect may not be filed as a mere suggestion", () => {
  const smuggled: Finding = { ...defect("F-4"), severity: "suggestion" };
  assert.equal(validateFinding(smuggled).ok, false);
});

test("a finding without evidence or a recommended fix is rejected", () => {
  const bare = { ...defect("F-5"), evidence: [] };
  assert.equal(validateFinding(bare).ok, false);

  const noFix = { ...defect("F-6"), recommendedFix: { approach: "", rationale: "" } } as Finding;
  assert.equal(validateFinding(noFix).ok, false);
});

test("a reviewer cannot pass a candidate with open defects", () => {
  const result: ReviewResult = {
    reviewer: "reviewerPrimary",
    commitOid: "commit-1",
    snapshotDigest: "digest-1",
    planDigest: "plan-digest",
    selectionPlanVerdict: "complete",
    verdict: "passed",
    findings: [defect("F-7")],
    completedAt: "2026-01-01T00:00:00Z",
  };
  const validation = validateReviewResult(result);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("open defect")));
});

test("a reviewer cannot pass while calling the selection plan incomplete", () => {
  const result: ReviewResult = {
    reviewer: "reviewerCrossVendor",
    commitOid: "commit-1",
    snapshotDigest: "digest-1",
    planDigest: "plan-digest",
    selectionPlanVerdict: "incomplete",
    verdict: "passed",
    findings: [],
    completedAt: "2026-01-01T00:00:00Z",
  };
  assert.equal(validateReviewResult(result).ok, false);
});

test("a result for a superseded snapshot or plan is stale", () => {
  assert.equal(
    isStaleResult(
      { snapshotDigest: "digest-1", planDigest: "plan-1" },
      { snapshotDigest: "digest-2", planDigest: "plan-1" },
    ),
    true,
  );
  assert.equal(
    isStaleResult(
      { snapshotDigest: "digest-1", planDigest: "plan-1" },
      { snapshotDigest: "digest-1", planDigest: "plan-2" },
    ),
    true,
  );
});

test("the executor may propose a fix but never close a finding", () => {
  const executor: SessionRef = { backend: "herdr", sessionId: "s1", role: "executor", generation: 1 };
  const reviewer: SessionRef = { backend: "herdr", sessionId: "s2", role: "reviewerPrimary", generation: 1 };
  const record: FindingRecord = { finding: defect("F-8"), raisedBy: reviewer, status: "open" };

  const proposed = proposeFix(record, "commit-9", record.resolutionEvidence);
  assert.equal(proposed.status, "fix_proposed");

  assert.throws(
    () => resolveFinding(proposed, executor),
    (error: unknown) => error instanceof FindingTransitionError,
  );

  const resolved = resolveFinding(proposed, reviewer);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolvedBy?.role, "reviewerPrimary");
});

test("a finding cannot be resolved before a fix is even proposed", () => {
  const reviewer: SessionRef = { backend: "herdr", sessionId: "s2", role: "reviewerPrimary", generation: 1 };
  const record: FindingRecord = { finding: defect("F-9"), raisedBy: reviewer, status: "open" };
  assert.throws(() => resolveFinding(record, reviewer), FindingTransitionError);
});

test("only taste may be dismissed without a fix", () => {
  const reviewer: SessionRef = { backend: "herdr", sessionId: "s2", role: "reviewerCrossVendor", generation: 1 };
  const defectRecord: FindingRecord = { finding: defect("F-10"), raisedBy: reviewer, status: "open" };
  assert.throws(() => dismissTaste(defectRecord, reviewer), FindingTransitionError);

  const tasteRecord: FindingRecord = {
    finding: { ...defect("F-11"), classification: "taste", severity: "suggestion" },
    raisedBy: reviewer,
    status: "open",
  };
  assert.equal(dismissTaste(tasteRecord, reviewer).status, "taste_dismissed");
});

test("closed findings are pruned and only blocking ones hold up completion", () => {
  const reviewer: SessionRef = { backend: "herdr", sessionId: "s2", role: "reviewerPrimary", generation: 1 };
  const records: FindingRecord[] = [
    { finding: defect("F-12"), raisedBy: reviewer, status: "open" },
    { finding: defect("F-13"), raisedBy: reviewer, status: "resolved" },
    {
      finding: { ...defect("F-14"), classification: "taste", severity: "suggestion" },
      raisedBy: reviewer,
      status: "open",
    },
  ];
  assert.equal(openBlockingRecords(records).length, 1);
  assert.equal(pruneClosedRecords(records).length, 2);
});

test("the ModelSet invariants are enforced", () => {
  const base = {
    executor: { route: "claude", vendor: "anthropic", family: "claude", model: "opus" },
    reviewerPrimary: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
    reviewerCrossVendor: { route: "codex", vendor: "openai", family: "gpt", model: "gpt-5" },
    e2eTester: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
  } as const;

  assert.equal(validateModelSet(base).ok, true);

  const sameVendorCross = {
    ...base,
    reviewerCrossVendor: { route: "claude", vendor: "anthropic", family: "claude", model: "haiku" },
  } as const;
  assert.equal(validateModelSet(sameVendorCross).ok, false);

  const differentFamilyPrimary = {
    ...base,
    reviewerPrimary: { route: "claude", vendor: "anthropic", family: "other", model: "sonnet" },
  } as const;
  assert.equal(validateModelSet(differentFamilyPrimary).ok, false);
});
