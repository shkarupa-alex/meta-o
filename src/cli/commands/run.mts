/**
 * §M-CLI-RUN — CLI surface for the lifecycle of one feature run.
 *
 * Implements §A-RUN-LIFECYCLE. These commands are the only way the orchestrator
 * skill is allowed to change run state, which is what keeps the invariants —
 * legal transitions, generation fencing, attestation invalidation — enforced by
 * code rather than by a prompt remembering to enforce them.
 */

import { randomUUID } from "node:crypto";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import {
  cleanupRun,
  commitState,
  ensureProject,
  ensureRunDirectories,
  listRuns,
  readSettings,
  readState,
  withWriterLock,
  writeHandoff,
} from "../../core/state-store.mjs";
import {
  assertTransition,
  completionProven,
  invalidatePlanBoundConfirmations,
  invalidateStaleConfirmations,
  loopForPhase,
  routeNext,
} from "../../core/fsm.mjs";
import { computeSnapshotDigest } from "../../core/snapshot.mjs";
import { resolveCommit } from "../../core/git.mjs";
import { fetchSpec, materializeSpecBlob, assertSpecUnchanged } from "../../core/spec-input.mjs";
import { validateModelSet } from "../../core/model-set.mjs";
import { readGlobalConfig } from "../../core/config.mjs";
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
import { HerdrAdapter } from "../../adapters/herdr.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import { readExternalBytes } from "../../core/safe-fs.mjs";
import { join } from "node:path";
import type {
  E2ERegistry,
  E2EResult,
  E2ESelectionPlan,
  Finding,
  FindingRecord,
  KnowledgeImpactPlan,
  ModelSet,
  PendingOperation,
  Phase,
  ReviewResult,
  RevisionResult,
  RunState,
  SessionRef,
} from "../../core/types.mjs";
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

/** §M-CLI-RUN — Reviewer slots that can hold open findings. */
type FindingSlot = "reviewerPrimary" | "reviewerCrossVendor" | "e2e";

/** §M-CLI-RUN — Resolve the project identity for a command. */
function identityOf(args: ParsedArgs): { canonicalPath: string; projectKey: string; repoDir: string } {
  const cwd = optionalFlag(args, "cwd") ?? process.cwd();
  const identity = resolveProjectIdentity(cwd);
  return { ...identity, repoDir: identity.canonicalPath };
}

/** §M-CLI-RUN — Load a run's state or fail with a precise message. */
function loadState(projectKey: string, runId: string): RunState {
  const state = readState(projectKey, runId);
  if (!state) fail("unknown_run", `run ${runId} has no state under project ${projectKey}`);
  return state;
}

/**
 * §M-CLI-RUN — Apply a transition under the writer lock.
 *
 * Every mutation goes through here so that the lock, the version check and the
 * generation fence can never be forgotten at an individual call site.
 */
async function mutate(
  projectKey: string,
  runId: string,
  change: (state: RunState) => RunState,
): Promise<RunState> {
  return await withWriterLock(projectKey, runId, () => {
    const current = loadState(projectKey, runId);
    return commitState(change(current));
  });
}

/**
 * §M-CLI-RUN — Start a run by pinning its spec and creating recoverable state.
 *
 * The spec blob is materialised before anything else: from this point the run
 * has an acceptance oracle that survives deletion of the tracked spec, which is
 * what makes retirement safe later in the same feature.
 */
export async function commandStart(args: ParsedArgs): Promise<void> {
  const { projectKey, canonicalPath, repoDir } = identityOf(args);
  ensureProject(projectKey, canonicalPath);

  const kind = requireFlag(args, "spec-kind");
  if (kind !== "tracked" && kind !== "local" && kind !== "url") {
    fail("invalid_spec_kind", `--spec-kind must be tracked|local|url, got ${kind}`);
  }
  const locator = requireFlag(args, "spec-locator");
  const declaredSha = optionalFlag(args, "spec-sha256");

  const settings = readSettings(projectKey);
  const globalConfig = readGlobalConfig();
  // Project settings win; the machine-wide default only spares the user from
  // re-entering the same four models for every new repository. Either way the
  // run starts in AWAITING_MODEL_SET and is confirmed before anything is spent.
  const modelSet: ModelSet | undefined = settings?.modelSet ?? globalConfig?.defaultModelSet;
  const backend = (optionalFlag(args, "backend") ??
    settings?.backend ??
    globalConfig?.defaultBackend ??
    "herdr") as "herdr" | "omnigent";

  if (!modelSet) {
    fail(
      "no_model_set",
      "this project has no confirmed ModelSet, and ~/.meta-o/config.json declares no " +
        "defaultModelSet; run `meta-o project set-settings` first",
    );
  }
  const validation = validateModelSet(modelSet);
  if (!validation.ok) fail("invalid_model_set", validation.errors.join("; "));

  const specRef = {
    kind,
    locator,
    sha256: declaredSha ?? "",
    disposition: kind === "tracked" ? "delete_after_sync" : "external",
  } as RunState["spec"];

  const fetched = await fetchSpec(specRef, repoDir);
  assertSpecUnchanged(declaredSha, fetched.sha256);

  const runId = randomUUID();
  ensureRunDirectories(projectKey, runId);
  const blobPath = materializeSpecBlob(projectKey, runId, fetched.bytes, fetched.sha256);

  const state: RunState = {
    schemaVersion: 1,
    runId,
    projectKey,
    phase: "AWAITING_MODEL_SET",
    stateVersion: 0,
    orchestratorGeneration: 1,
    spec: { ...specRef, sha256: fetched.sha256, locator: fetched.sanitizedLocator },
    specBlob: blobPath,
    baseRevision: resolveCommit("HEAD", repoDir),
    modelSet,
    sessions: {},
    sessionGeneration: {},
    decisions: [],
    confirmations: {},
    reuseScanEnabled: boolFlag(args, "reuse-scan"),
    handoffEnabled:
      boolFlag(args, "handoff") ||
      settings?.handoffDefault === true ||
      (settings === undefined && globalConfig?.handoffDefault === true),
    updatedAt: isoTimestamp(),
  };

  const written = await withWriterLock(projectKey, runId, () => commitState(state));
  emit({ runId, projectKey, backend, phase: written.phase, specSha256: fetched.sha256, specBlob: blobPath });
}

/** §M-CLI-RUN — List the runs a project currently has state for. */
export function commandList(args: ParsedArgs): void {
  const { projectKey } = identityOf(args);
  const runs = listRuns(projectKey).map((runId) => {
    const state = readState(projectKey, runId);
    return state
      ? { runId, phase: state.phase, stateVersion: state.stateVersion, updatedAt: state.updatedAt }
      : { runId, phase: "unreadable", stateVersion: -1, updatedAt: "" };
  });
  emit({ projectKey, runs });
}

/** §M-CLI-RUN — Show the full recoverable state of a run. */
export function commandShow(args: ParsedArgs): void {
  const { projectKey } = identityOf(args);
  emit(loadState(projectKey, requireFlag(args, "run-id")));
}

/**
 * §M-CLI-RUN — Report the next step the routing table prescribes.
 *
 * The orchestrator is expected to call this instead of reasoning about which
 * loop it is in; that is the whole point of having a routing table.
 */
export function commandRoute(args: ParsedArgs): void {
  const { projectKey } = identityOf(args);
  const state = loadState(projectKey, requireFlag(args, "run-id"));
  emit({
    runId: state.runId,
    phase: state.phase,
    routing: routeNext(state),
    completionProven: completionProven(state),
  });
}

/**
 * §M-CLI-RUN — Refuse `COMPLETE` unless every completion precondition is proven.
 *
 * The four attestations are the headline rule, but the metadata commit is the
 * one tracked change permitted *after* they are collected, so the run has to
 * show that it was inspected. Leaving that step to the orchestrator's prompt
 * would make it the only completion invariant not enforced by code, which is
 * exactly the one that would eventually be skipped under recovery.
 */
function assertCompletable(state: RunState): void {
  if (!completionProven(state)) {
    fail(
      "completion_not_proven",
      "COMPLETE requires QC, both reviews and the selected E2E set to attest one snapshot and one plan",
    );
  }
  const digest = state.candidateSnapshot?.digest;
  if (state.metadataVerified?.snapshotDigest !== digest) {
    fail(
      "metadata_not_verified",
      "COMPLETE requires a passing `meta-o snapshot verify-metadata` for the attested snapshot",
      { attestedSnapshot: digest, metadataVerified: state.metadataVerified ?? null },
    );
  }
}

/** §M-CLI-RUN — Move a run to another phase, refusing undefined transitions. */
export async function commandTransition(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const phase = requireFlag(args, "phase") as Phase;
  const reason = optionalFlag(args, "reason");
  const resumeCondition = optionalFlag(args, "resume-condition");

  const next = await mutate(projectKey, runId, (state) => {
    assertTransition(state.phase, phase);
    if (phase === "COMPLETE") assertCompletable(state);
    const updated: RunState = { ...state, phase };
    const loop = loopForPhase(phase, state.activeLoop);
    if (loop) updated.activeLoop = loop;
    else delete updated.activeLoop;
    if (phase.startsWith("PAUSED_") || phase.startsWith("STOPPED_") || phase === "FAILED_BACKEND") {
      updated.paused = {
        reason: reason ?? phase,
        enteredAt: isoTimestamp(),
        resumeCondition: resumeCondition ?? "user or watchdog resolves the blocking condition",
      };
    } else {
      delete updated.paused;
    }
    return updated;
  });
  emit({ runId, phase: next.phase, stateVersion: next.stateVersion });
}

/**
 * §M-CLI-RUN — Record the user's confirmation of the run's ModelSet.
 *
 * Confirmation is a user act, so it is a separate command rather than an
 * implicit consequence of starting; automatic recovery reuses the confirmed set
 * without asking again.
 */
export async function commandConfirmModels(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const next = await mutate(projectKey, runId, (state) => {
    assertTransition(state.phase, "PREFLIGHT");
    return { ...state, phase: "PREFLIGHT" };
  });
  emit({ runId, phase: next.phase, modelSet: next.modelSet });
}

/**
 * §M-CLI-RUN — Point the run at a new candidate commit.
 *
 * Recomputes the snapshot digest and invalidates every attestation that no
 * longer describes it. This is the single place where "the content changed"
 * becomes "the gates must run again", so it cannot be skipped by a forgetful
 * caller.
 */
export async function commandSetCandidate(args: ParsedArgs): Promise<void> {
  const { projectKey, repoDir } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const revision = optionalFlag(args, "rev") ?? "HEAD";
  const computed = computeSnapshotDigest(repoDir, revision);

  const next = await mutate(projectKey, runId, (state) => ({
    ...state,
    candidateSnapshot: {
      digest: computed.digest,
      provenanceCommit: computed.provenanceCommit,
      computedAt: isoTimestamp(),
    },
    confirmations: invalidateStaleConfirmations(state.confirmations, computed.digest),
  }));

  emit({
    runId,
    snapshotDigest: computed.digest,
    provenanceCommit: computed.provenanceCommit,
    trackedEntries: computed.entryCount,
    confirmations: next.confirmations,
    routing: routeNext(next),
  });
}

/**
 * §M-CLI-RUN — Store the E2E selection plan both reviewers will attest.
 *
 * Validated against the catalog before storage; the orchestrator checks schema
 * and digest only, and judging coverage remains the reviewers' responsibility.
 */
export async function commandSetPlan(args: ParsedArgs): Promise<void> {
  const { projectKey, repoDir } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const plan = await readStdinJson<E2ESelectionPlan>();

  const registryPath = join(repoDir, "docs/architecture/e2e.json");
  let registry: E2ERegistry;
  try {
    registry = JSON.parse(readExternalBytes(registryPath).toString("utf8")) as E2ERegistry;
  } catch (error) {
    fail("unreadable_registry", `cannot read ${registryPath}: ${(error as Error).message}`);
  }

  const validation = validatePlan(plan, registry);
  if (!validation.ok) fail("invalid_plan", validation.errors.join("; "));

  const next = await mutate(projectKey, runId, (state) => ({
    ...state,
    e2ePlan: plan,
    confirmations: invalidatePlanBoundConfirmations(state.confirmations, plan.planDigest),
  }));
  emit({
    runId,
    planDigest: plan.planDigest,
    selected: plan.selectedScenarioIds,
    confirmations: next.confirmations,
    routing: routeNext(next),
  });
}

/**
 * §M-CLI-RUN — Record one gate's outcome against the current candidate.
 *
 * A result is stored with the digest it attests, never merely "the latest", so
 * a late-arriving verdict for superseded content is visibly stale instead of
 * silently counted.
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
 * §M-CLI-RUN — Record a whole review — verdict, findings and plan judgement — at once.
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
 * §M-CLI-RUN — Record the outcome of the selected E2E set.
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

/** §M-CLI-RUN — Everything that makes an E2E result unusable as an attestation. */
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
 * §M-CLI-RUN — Store findings raised by one reviewer.
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

/** §M-CLI-RUN — Record the executor's proposed fix for one finding. */
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
 * §M-CLI-RUN — The session a `--by-role` claim resolves to.
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

/** §M-CLI-RUN — Apply one closing transition to a single finding record. */
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
 * §M-CLI-RUN — Close a finding on the authority of its raiser or an adjudicator.
 *
 * Reviewer A may not close reviewer B's finding, and the executor may close
 * nobody's: both are the same rule, that the party who decides a problem is
 * gone must be a party able to see whether it is.
 */
export async function commandResolveFinding(args: ParsedArgs): Promise<void> {
  await closeFinding(args, (record, by) => resolveFinding(record, by));
}

/**
 * §M-CLI-RUN — Drop a taste suggestion the executor declined to act on.
 *
 * Without this verb a declined suggestion has no exit: it is not a defect, so
 * no fix is coming, and `resolve-finding` refuses a record with no proposed
 * fix. The run would sit in the review loop forever over a matter of style.
 */
export async function commandDismissTaste(args: ParsedArgs): Promise<void> {
  await closeFinding(args, (record, by) => dismissTaste(record, by));
}

/** §M-CLI-RUN — Store the executor's temporary knowledge impact plan. */
export async function commandKnowledgePlan(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const plan = await readStdinJson<KnowledgeImpactPlan>();
  const next = await mutate(projectKey, runId, (state) => ({ ...state, knowledgeImpactPlan: plan }));
  emit({ runId, knowledgeImpactPlan: next.knowledgeImpactPlan });
}

/**
 * §M-CLI-RUN — Refuse to forget an in-flight operation whose effect is unproven.
 *
 * `prepared` means the backend may or may not have seen the request and
 * `uncertain` means it demonstrably could not be classified; forgetting either
 * turns the next attempt into a blind resend, which is the one thing the
 * write-ahead protocol exists to prevent. `session reconcile` is the only exit,
 * and when it cannot decide, the run pauses instead of guessing.
 */
function assertClearable(pending: PendingOperation | undefined): void {
  if (!pending) return;
  const proven = pending.state === "observed" || (pending.state === "acknowledged" && pending.backendReceipt);
  if (proven) return;
  fail(
    "effect_unproven",
    `operation ${pending.operationId} is ${pending.state}; its effect is not proven, ` +
      "so it may only be cleared through `meta-o session reconcile`",
    { pendingOperation: pending },
  );
}

/**
 * §M-CLI-RUN — Write or clear the single in-flight backend operation.
 *
 * Write-ahead by contract: the orchestrator records the intent, then calls the
 * backend, then proves the effect. Skipping the first step is what makes a
 * crash unrecoverable without guessing.
 */
export async function commandPending(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");

  if (boolFlag(args, "clear")) {
    const next = await mutate(projectKey, runId, (state) => {
      assertClearable(state.pendingOperation);
      const updated = { ...state };
      delete updated.pendingOperation;
      return updated;
    });
    emit({ runId, pendingOperation: null, stateVersion: next.stateVersion });
    return;
  }

  const operation = await readStdinJson<PendingOperation>();
  const next = await mutate(projectKey, runId, (state) => ({ ...state, pendingOperation: operation }));
  emit({ runId, pendingOperation: next.pendingOperation });
}

/** §M-CLI-RUN — Register a worker session handle for a role. */
export async function commandSetSession(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const session = await readStdinJson<SessionRef>();
  const next = await mutate(projectKey, runId, (state) => ({
    ...state,
    sessions: { ...state.sessions, [session.role]: session },
    sessionGeneration: { ...state.sessionGeneration, [session.role]: session.generation },
  }));
  emit({ runId, sessions: next.sessions });
}

/** §M-CLI-RUN — Backend statuses that prove an orchestrator will issue nothing further. */
const TERMINAL_ORCHESTRATOR_STATUS = new Set(["complete", "failed", "stopped", "absent"]);

/**
 * §M-CLI-RUN — Ask the backend what became of the orchestrator being replaced.
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
 * §M-CLI-RUN — Take over a run with a fresh orchestrator generation.
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

  const next = await mutate(projectKey, runId, (state) => ({
    ...state,
    orchestratorGeneration: state.orchestratorGeneration + 1,
  }));
  emit({
    runId,
    previousStatus: observed,
    orchestratorGeneration: next.orchestratorGeneration,
    routing: routeNext(next),
  });
}

/** §M-CLI-RUN — Write the optional executor handoff, refusing to truncate it. */
export async function commandHandoff(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  if (loadState(projectKey, runId).handoffEnabled !== true) {
    fail(
      "handoff_not_enabled",
      "this run did not start with handoff consent; start it with --handoff or set handoffDefault",
    );
  }
  const content = await readStdin();
  try {
    writeHandoff(projectKey, runId, content);
  } catch (error) {
    fail("handoff_too_large", (error as Error).message);
  }
  emit({ runId, handoffBytes: Buffer.byteLength(content, "utf8") });
}

/**
 * §M-CLI-RUN — Delete every temporary artefact of a finished run.
 *
 * Refuses to run while the run is still live, because the state file is the
 * only thing that could recover it.
 */
export async function commandCleanup(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const state = loadState(projectKey, runId);
  const finished =
    state.phase === "COMPLETE" ||
    state.phase === "CANCELLED" ||
    state.phase === "STOPPED_SPEC_IMPOSSIBLE" ||
    state.phase === "FAILED_BACKEND";
  if (!finished && !boolFlag(args, "force")) {
    fail("run_not_finished", `run ${runId} is in ${state.phase}; pass --force to discard it anyway`);
  }
  cleanupRun(projectKey, runId);
  emit({ runId, removed: true });
}
