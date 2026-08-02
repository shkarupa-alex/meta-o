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
  evidenceErrors,
  resolveFinding,
  validateFinding,
  validateReviewResult,
} from "../../core/findings.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import { readExternalBytes } from "../../core/safe-fs.mjs";
import type {
  E2ERegistry,
  E2EResult,
  E2EScenarioResult,
  E2ESelectionPlan,
  Evidence,
  Finding,
  FindingRecord,
  KnowledgeImpactPlan,
  Phase,
  QcManifest,
  QcResult,
  ReviewResult,
  RevisionResult,
  RunState,
  SessionRef,
} from "../../core/types.mjs";
import { existsSync, readFileSync } from "node:fs";
import {
  assertE2eIsolated,
  assertGateIsolated,
  assertQcProven,
} from "./gate-evidence.mjs";
import { gateReceiptPath, qcResultPath } from "../../core/paths.mjs";
import { redactDeep } from "../../core/redact.mjs";
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

/**
 * §M-CLI-RESULTS — Where an E2E set may say it ran.
 *
 * A closed set because `production` has to be nameable to be refusable: §20
 * forbids it without an explicit user decision, and while the result carried no
 * environment at all there was nothing for the rule to bite on.
 */
const E2E_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "local",
  "ephemeral",
  "staging",
  "production",
]);

/** §M-CLI-RESULTS — Gates whose PASS must arrive through the command that validates it. */
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
  const { projectKey, repoDir } = identityOf(args);
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
    if (status === "passed" && gate === "qc") {
      assertGateIsolated(projectKey, runId, "qc", snapshot.provenanceCommit);
      assertQcProven(repoDir, projectKey, runId, digest);
    }
    if (status === "passed" && gate === "smoke") {
      assertGateIsolated(projectKey, runId, "smoke", snapshot.provenanceCommit);
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
 * The only way a reviewer slot can be set to `passed`. Three checks would
 * otherwise be left to the caller's discipline: that the verdict is a real
 * verdict, that a pass carries no open defects, and that the result describes
 * the current snapshot *and* plan. Doing all of it in one command means a
 * reviewer's word only enters state together with the evidence that makes it
 * meaningful.
 *
 * The payload is redacted on the way in. Findings quote code and error output,
 * both of which routinely carry a token, and everything stored here is read
 * back verbatim by the executor and by every fresh orchestrator.
 */
export async function commandRecordReview(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const result = redactDeep(await readStdinJson<ReviewResult>());

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

    // A later round legitimately restates this slot, but "restates" is the
    // operative word: writing it wholesale meant a second `record-review` with
    // `verdict: passed` and an empty findings array erased the blocker the
    // first one raised, and greened the gate on the same unchanged snapshot.
    // Every designed exit — `open-findings`, `resolve-finding`, `record-gate` —
    // refuses that; this one did it in a single command, and the executor has
    // the CLI on its PATH. A blocker leaves only by being restated here or
    // closed by an authority that named itself.
    const carried = carryOpenBlockers(
      state.openFindings?.[result.reviewer] ?? [],
      result.findings,
      result.reviewer,
    );
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
      openFindings: { ...state.openFindings, [result.reviewer]: [...carried, ...records] },
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
  const result = redactDeep(await readStdinJson<E2EResult>());

  const next = await mutate(projectKey, runId, (state) => {
    const snapshot = state.candidateSnapshot;
    if (!snapshot) fail("no_candidate", "record a candidate with `run set-candidate` first");
    if (!state.e2ePlan) fail("no_plan", "an E2E result attests a selection plan; store one first");

    const errors = e2eResultErrors(result, snapshot.digest, state.e2ePlan);
    if (errors.length > 0) fail("invalid_e2e_result", errors.join("; "));

    assertE2eIsolated(projectKey, runId, snapshot.provenanceCommit);

    if (result.environment === "production" && !state.productionE2eApproved) {
      fail(
        "production_e2e_not_approved",
        "§20 forbids running the E2E set against production without the user saying so for this " +
          "run; record their decision with `meta-o run record-decision` and " +
          "`meta-o run approve-production-e2e` first",
      );
    }

    // `commitOid` and `completedAt` are derived, not demanded. The tester knows
    // the digest and the plan it ran; the commit that produced them is already
    // in state, and requiring the tester to restate it made the shape the skill
    // documents unusable against the command meant to consume it.
    const failures = result.scenarios.filter((scenario) => scenario.status !== "passed");
    const gate: RevisionResult = {
      commitOid: result.commitOid || snapshot.provenanceCommit,
      snapshotDigest: result.snapshotDigest,
      planDigest: result.planDigest,
      status: failures.length === 0 ? "passed" : "failed",
      completedAt: result.completedAt || isoTimestamp(),
    };

    return {
      ...state,
      e2eScenarioStatus: result.scenarios.map((scenario) => ({ ...scenario })),
      e2eEnvironment: result.environment,
      openFindings: { ...state.openFindings, e2e: e2eFailureFindings(state, result, failures) },
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

/**
 * §M-CLI-RESULTS — Turn the scenarios that did not pass into open findings.
 *
 * §30's E2E loop is "selected set → failures batch → executor fix → qc →
 * selected set". Nothing wrote the failures anywhere the router could see them,
 * so `fix_e2e_failures` was an action state could not produce and the router
 * kept prescribing the same failing set forever. The findings are derived here
 * rather than typed by the tester: they restate a result the command has
 * already validated, and a second hand-authored copy of it would be one more
 * thing that can disagree.
 */
function e2eFailureFindings(
  state: RunState,
  result: E2EResult,
  failures: readonly E2EScenarioResult[],
): FindingRecord[] {
  const raisedBy: SessionRef = state.sessions["e2eTester"] ?? {
    backend: "herdr",
    sessionId: "unrecorded-e2eTester",
    role: "e2eTester",
    generation: state.sessionGeneration["e2eTester"] ?? 1,
  };
  return failures.map((scenario) => ({
    finding: {
      id: `E2E-${scenario.scenarioId}`,
      severity: scenario.status === "failed" ? "blocker" : "major",
      classification: "defect",
      evidence: [{ kind: "scenario", reference: scenario.scenarioId, detail: scenario.evidence }],
      basis: { type: "spec", reference: scenario.scenarioId },
      impact: `selected scenario ${scenario.scenarioId} ${scenario.status} against ${result.environment}`,
      recommendedFix: {
        approach: "make the scenario pass, or prove the scenario itself is wrong",
        rationale: "a selected scenario is a behaviour the plan says this change must not break",
      },
    },
    raisedBy,
    status: "open",
  }));
}

/** §M-CLI-RESULTS — Everything that makes an E2E result unusable as an attestation. */
function e2eResultErrors(
  result: E2EResult,
  snapshotDigest: string,
  plan: E2ESelectionPlan,
): string[] {
  const errors: string[] = [];
  if (!E2E_ENVIRONMENTS.has(result.environment)) {
    errors.push(
      `environment ${JSON.stringify(result.environment)} is not one of ` +
        [...E2E_ENVIRONMENTS].join("|"),
    );
  }
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
 * §M-CLI-RESULTS — Keep blockers a new payload silently dropped.
 *
 * A later review round legitimately restates the slot, and a blocker the
 * reviewer no longer raises has genuinely been re-judged — but only if the
 * reviewer says so by id. Anything still open and still absent is refused
 * rather than quietly carried or quietly lost: carrying it would let a real
 * re-review never clear anything, losing it is the bypass this exists to stop.
 */
function carryOpenBlockers(
  existing: FindingRecord[],
  incoming: Finding[],
  slot: FindingSlot,
): FindingRecord[] {
  const restated = new Set(incoming.map((finding) => finding.id));
  const dropped = openBlockingRecords(existing).filter((record) => !restated.has(record.finding.id));
  if (dropped.length > 0) {
    fail(
      "findings_dropped",
      `${slot} still holds open blocking finding(s) ${dropped.map((r) => r.finding.id).join(", ")} ` +
        "that this payload neither restates nor closes; close them with `run resolve-finding` " +
        "or `run dismiss-taste` first",
      { dropped: dropped.map((record) => record.finding.id) },
    );
  }
  return existing.filter((record) => !openBlockingRecords([record]).length && !restated.has(record.finding.id));
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
  const findings = redactDeep(await readStdinJson<Finding[]>());

  const errors = findings.flatMap((finding) => validateFinding(finding).errors);
  if (errors.length > 0) fail("invalid_finding", errors.join("; "));

  const next = await mutate(projectKey, runId, (state) => {
    const role = slot === "e2e" ? "e2eTester" : slot;
    const session = state.sessions[role];
    const raisedBy: SessionRef = session ?? {
      backend: "herdr",
      sessionId: `unrecorded-${slot}`,
      role,
      generation: state.sessionGeneration[role] ?? 1,
    };
    // This command records what a review found; it is not a way to un-find it.
    // Writing the slot wholesale let anyone who could reach the CLI hand in an
    // empty array and erase a reviewer's blocker — after which four gates that
    // were already attested completed the run. Blockers leave only through
    // `resolve-finding` or `dismiss-taste`, which name an authority.
    const carried = carryOpenBlockers(state.openFindings?.[slot] ?? [], findings, slot);
    const records: FindingRecord[] = findings.map((finding) => ({
      finding,
      raisedBy,
      status: "open",
    }));
    return { ...state, openFindings: { ...state.openFindings, [slot]: [...carried, ...records] } };
  });

  emit({
    runId,
    reviewer: slot,
    open: next.openFindings?.[slot]?.length ?? 0,
    blocking: openBlockingRecords(next.openFindings?.[slot] ?? []).length,
  });
}

/**
 * §M-CLI-RESULTS — Record the executor's proposed fix for one finding.
 *
 * The evidence comes from stdin. It used to be copied out of the record's own
 * `resolutionEvidence`, which is empty at this point by definition — so the
 * executor had no way to say what it changed, and the reviewer had nothing to
 * check. That is the half of "close after checking candidate and evidence" the
 * executor owes.
 */
export async function commandProposeFix(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const slot = requireFlag(args, "reviewer") as FindingSlot;
  const findingId = requireFlag(args, "finding-id");
  const candidate = requireFlag(args, "candidate-commit");
  const evidence = redactDeep(await readStdinJson<Evidence[]>());

  const errors = evidenceErrors(evidence);
  if (errors.length > 0) fail("invalid_evidence", errors.join("; "));

  const next = await mutate(projectKey, runId, (state) => {
    const records = state.openFindings?.[slot] ?? [];
    if (!records.some((record) => record.finding.id === findingId)) {
      fail("unknown_finding", `${slot} holds no open finding ${findingId}`);
    }
    const updated = records.map((record) =>
      record.finding.id === findingId ? proposeFix(record, candidate, evidence) : record,
    );
    return { ...state, openFindings: { ...state.openFindings, [slot]: updated } };
  });

  emit({ runId, findingId, status: next.openFindings?.[slot]?.find((r) => r.finding.id === findingId)?.status });
}

/**
 * §M-CLI-RESULTS — The session a `--by-role` claim resolves to.
 *
 * `--by-role` is a claim, and nothing in a CLI invocation proves which model is
 * behind it. The comment here used to argue that comparing the claim against
 * the raising role made the rule safe; it does not — the executor need only
 * claim the raiser's own role, and both checks pass.
 *
 * What is checkable is that the orchestrator actually dispatched a session for
 * that role in this run. So the fabricated `unrecorded-<role>` stand-in is
 * gone: a closure now names a session that exists in state, put there by the
 * orchestrator when it spawned the reviewer. That is authority by dispatch, not
 * authentication, and the honest limit is stated in `docs/knowledge/`: a model
 * that can both reach this CLI and impersonate a dispatched reviewer is not
 * something a local tool can exclude.
 */
function claimedSession(state: RunState, role: SessionRef["role"], findingId: string): SessionRef {
  const session = state.sessions[role];
  if (!session) {
    fail(
      "no_such_session",
      `finding ${findingId}: this run has no ${role} session, so nothing may close a finding on ` +
        `its authority; dispatch one with \`meta-o session spawn --role ${role}\` first`,
    );
  }
  return session;
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
    const by = claimedSession(state, byRole, findingId);
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
  const plan = redactDeep(await readStdinJson<KnowledgeImpactPlan>());
  const next = await mutate(projectKey, runId, (state) => ({ ...state, knowledgeImpactPlan: plan }));
  emit({ runId, knowledgeImpactPlan: next.knowledgeImpactPlan });
}
