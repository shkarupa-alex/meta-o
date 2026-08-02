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
  reclassifyAsTaste,
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
import { git } from "../../core/git.mjs";
import {
  assertE2eIsolated,
  assertGateIsolated,
  assertQcProven,
} from "./gate-evidence.mjs";
import { redactDeep } from "../../core/redact.mjs";
import { carryOpenBlockers } from "./findings-cli.mjs";
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
      assertGateIsolated(projectKey, runId, "qc", snapshot);
      assertQcProven(repoDir, projectKey, runId, digest);
    }
    if (status === "passed" && gate === "smoke") {
      assertGateIsolated(projectKey, runId, "smoke", snapshot);
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
  const { projectKey, repoDir } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const result = redactDeep(await readStdinJson<E2EResult>());

  const next = await mutate(projectKey, runId, (state) => {
    const snapshot = state.candidateSnapshot;
    if (!snapshot) fail("no_candidate", "record a candidate with `run set-candidate` first");
    if (!state.e2ePlan) fail("no_plan", "an E2E result attests a selection plan; store one first");

    const errors = e2eResultErrors(result, snapshot.digest, state.e2ePlan);
    if (errors.length > 0) fail("invalid_e2e_result", errors.join("; "));

    assertE2eIsolated(projectKey, runId, snapshot);

    if (result.environment === "production") {
      if (!state.productionE2eApproved) {
        fail(
          "production_e2e_not_approved",
          "§20 forbids running the E2E set against production without the user saying so for " +
            "this run; record their decision with `meta-o run record-decision` and " +
            "`meta-o run approve-production-e2e` first",
        );
      }
      // §20 asks for two things and only the user's word was checked. The other
      // is a production-safe contract: the project must have written down what
      // running against production means for it — cleanup, blast radius, what
      // may not be touched. A user consenting to a run whose rules nobody wrote
      // is consenting to nothing in particular.
      assertProductionContract(repoDir, snapshot.provenanceCommit);
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

    // The slot holds two kinds of record and they obey opposite rules. What
    // this command derived from scenario statuses is a projection of the gate,
    // so re-running the gate re-computes it — that is the ordinary red → fix →
    // green loop, and carrying those forward would make a passing re-run
    // impossible. What a person raised against the E2E work itself — a
    // scenario that passes only by luck, an environment that leaks — is not a
    // projection of anything, and leaves only by being restated or closed.
    const derived = e2eFailureFindings(state, result, failures);
    const authored = (state.openFindings?.e2e ?? []).filter((record) => !record.derived);
    const carried = carryOpenBlockers(authored, [], "e2e");

    return {
      ...state,
      e2eScenarioStatus: result.scenarios.map((scenario) => ({ ...scenario })),
      e2eEnvironment: result.environment,
      openFindings: { ...state.openFindings, e2e: [...carried, ...derived] },
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
 * §M-CLI-RESULTS — Refuse production when the E2E contract does not cover it.
 *
 * Deliberately shallow: this proves the contract *says something* about
 * production, not that what it says is adequate. Judging adequacy is a reading,
 * and the reviewers do it. What this stops is the case where there is nothing
 * to read at all — where "the user approved a production run" is the only
 * artefact, and the rules of that run exist solely in one session's memory.
 */
function assertProductionContract(repoDir: string, candidateCommit: string): void {
  // Read out of the candidate, never the working tree. Reading the tree let the
  // contract be appended, the gate satisfied, and the file reverted a second
  // later — leaving a passed production E2E gate and no contract anywhere.
  let text: string;
  try {
    text = git(["show", `${candidateCommit}:docs/architecture/e2e.md`], repoDir);
  } catch (error) {
    fail(
      "no_production_contract",
      `the candidate does not carry docs/architecture/e2e.md: ${(error as Error).message}`,
    );
  }
  if (productionHeadings(text).length > 0) return;
  fail(
    "no_production_contract",
    "§20 requires an explicit production-safe contract before the E2E set may run against " +
      "production, and the candidate's docs/architecture/e2e.md has no section about it; write " +
      "down what a production run may touch, how it is namespaced and how it is cleaned up, and " +
      "commit it as part of the candidate",
    { contract: "docs/architecture/e2e.md", candidateCommit },
  );
}

/**
 * §M-CLI-RESULTS — The document's headings that are about production.
 *
 * Written as a small Markdown reader rather than one regular expression, for
 * three reasons each of which was a real wrong answer. A heading inside a
 * fenced block is an example, and an example of a contract is not a contract.
 * A setext heading (`Running against production` underlined with `===`) is a
 * heading, and refusing it told a project with a perfectly good contract that
 * it had none. CommonMark allows up to three leading spaces on an ATX heading.
 *
 * `\b` rather than a substring, because `### Reproduction of a failed
 * scenario` contains the letters and says nothing about production.
 */
function productionHeadings(text: string): string[] {
  const lines = text.split("\n");
  const headings: string[] = [];
  let fence: string | undefined;
  for (const [index, line] of lines.entries()) {
    const marker = /^\s{0,3}(```+|~~~+)/.exec(line);
    if (marker) {
      if (fence === undefined) fence = marker[1]![0];
      else if (marker[1]!.startsWith(fence)) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;

    const atx = /^ {0,3}#{1,6}\s+(.*)$/.exec(line);
    if (atx) {
      headings.push(atx[1]!);
      continue;
    }
    // A setext underline turns the *previous* line into a heading, and only if
    // that line was ordinary text.
    const underlined = /^ {0,3}(=+|-{2,})\s*$/.test(line) ? lines[index - 1] : undefined;
    if (underlined !== undefined && underlined.trim() !== "" && !/^ {0,3}#/.test(underlined)) {
      headings.push(underlined);
    }
  }
  return headings.filter((heading) => /\bproduction\b/i.test(heading));
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
    derived: true,
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

/** §M-CLI-RESULTS — Store the executor's temporary knowledge impact plan. */
export async function commandKnowledgePlan(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const plan = redactDeep(await readStdinJson<KnowledgeImpactPlan>());
  const next = await mutate(projectKey, runId, (state) => ({ ...state, knowledgeImpactPlan: plan }));
  emit({ runId, knowledgeImpactPlan: next.knowledgeImpactPlan });
}
