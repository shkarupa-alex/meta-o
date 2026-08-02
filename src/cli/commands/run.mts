/**
 * §M-CLI-RUN — CLI surface for the lifecycle of one feature run.
 *
 * Implements §A-RUN-LIFECYCLE. These commands are the only way the orchestrator
 * skill is allowed to change run state, which is what keeps the invariants —
 * legal transitions, generation fencing, attestation invalidation — enforced by
 * code rather than by a prompt remembering to enforce them.
 */

import {
  cleanupRun,
  listRuns,
  readHandoff,
  readState,
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
import { validatePlan } from "../../core/e2e-registry.mjs";
import { HerdrAdapter } from "../../adapters/herdr.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import { readExternalBytes } from "../../core/safe-fs.mjs";
import { join } from "node:path";
import { validateModelSet } from "../../core/model-set.mjs";
import type {
  E2ERegistry,
  E2ESelectionPlan,
  ModelSet,
  PendingOperation,
  Phase,
  Role,
  RunState,
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

import { redact } from "../../core/redact.mjs";
import { identityOf, loadState, mutate, requireUserDecision } from "./run-context.mjs";
import { roleView } from "../../core/role-view.mjs";
export { commandSetSession, commandTakeover } from "./ownership.mjs";
export { commandStart } from "./run-start.mjs";
import { WORKER_ROLES } from "../../core/types.mjs";
import { assertCandidateAdmissible, assertUnpublished } from "./candidate-guards.mjs";
import { assertE2eLoopMayOpen, assertReviewsMayOpen } from "./gate-order.mjs";

/** §M-CLI-RUN — Redact an optional free-text flag before it reaches durable state. */
function redactText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : redact(value);
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

/**
 * §M-CLI-RUN — Show the state of a run, whole or bounded to one role.
 *
 * Without `--as-role` this is the orchestrator's view and holds everything.
 * With it, the caller gets only §30's list for that role — and, for a reviewer,
 * not the other reviewer's findings. Two reviewers who have read each other are
 * one reviewer with extra steps.
 *
 * The bound is a rule the workflow states, not a wall it builds: run state is a
 * readable file, and an agent with a shell can go around it. What it removes is
 * the accident — the reviewer who runs `run show` for the candidate digest and
 * reads a verdict on the way past.
 */
export function commandShow(args: ParsedArgs): void {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const state = loadState(projectKey, runId);
  const handoff = readHandoff(projectKey, runId);
  const role = optionalFlag(args, "as-role");
  if (role === undefined) {
    emit({ ...state, ...(handoff === undefined ? {} : { handoff }) });
    return;
  }
  if (!(WORKER_ROLES as readonly string[]).includes(role)) {
    fail("unknown_role", `--as-role must name a worker role: ${WORKER_ROLES.join(", ")}`);
  }
  emit(roleView(state, role as Role, handoff));
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
    // The loop and its round are reported, not just used internally. The
    // counter was incremented on every re-entry and read by nothing, so the one
    // number that says "this loop has gone round four times" — the signal the
    // skill turns into "spawn an adjudicator rather than let it spin" — was
    // invisible to the only reader who could act on it.
    ...(state.activeLoop ? { activeLoop: state.activeLoop } : {}),
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
  const { projectKey, repoDir } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const phase = requireFlag(args, "phase") as Phase;
  const reason = redactText(optionalFlag(args, "reason"));
  const resumeCondition = optionalFlag(args, "resume-condition");

  const next = await mutate(projectKey, runId, (state) => {
    assertTransition(state.phase, phase);
    // `reuseScanEnabled` was written at `run start` and read by nothing, so the
    // optional phase could be entered whatever the user had said — and the
    // routing table then reported "the user enabled the optional reuse scan"
    // as a fact, with the recorded consent saying the opposite.
    if (phase === "SOLUTION_SCAN" && state.reuseScanEnabled !== true) {
      fail(
        "reuse_scan_not_enabled",
        "this run did not enable the optional reuse scan; start a run with --reuse-scan, or " +
          "transition straight to EXECUTING",
      );
    }
    // Both arrows of §00's order, checked where the phase changes and again
    // where the result is banked: an orchestrator that transitions and one that
    // calls the recording command directly must meet the same bar.
    if (phase === "REVIEW_STABILIZATION" && state.phase !== "E2E_STABILIZATION") {
      assertReviewsMayOpen(state);
    }
    if (phase === "E2E_STABILIZATION") assertE2eLoopMayOpen(state);
    if (phase === "COMPLETE") {
      assertCompletable(state);
      // Re-checked here and not only at `set-candidate`: the metadata commit
      // lands between the two, and a push after attestation is the same
      // forbidden act at a moment nothing else was looking.
      const head = state.candidateSnapshot?.provenanceCommit;
      if (head) assertUnpublished(repoDir, state, head);
    }
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
 *
 * It points at a recorded decision rather than being a bare transition. §00 step
 * 4 makes the orchestrator show the stored ModelSet and ask "these?", and the
 * command took no evidence at all — nothing distinguished a user who answered
 * from an orchestrator that skipped the question, which is the whole content of
 * the phase named `AWAITING_MODEL_SET`. This is the last gate before four
 * external models start costing money, so it is held to the same standard as
 * the production-E2E approval: a decision this run recorded, taken by the user.
 */
export async function commandConfirmModels(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const decisionId = requireFlag(args, "decision-id");
  const next = await mutate(projectKey, runId, (state) => {
    assertTransition(state.phase, "PREFLIGHT");
    requireUserDecision(state, decisionId, "this run's ModelSet");
    return { ...state, phase: "PREFLIGHT", modelSetConfirmedBy: decisionId };
  });
  emit({
    runId,
    phase: next.phase,
    modelSet: next.modelSet,
    modelSetConfirmedBy: next.modelSetConfirmedBy,
  });
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
  const current = loadState(projectKey, runId);
  assertCandidateAdmissible(repoDir, current, computed.provenanceCommit);

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

  const current = loadState(projectKey, runId);
  const candidate = current.candidateSnapshot;
  if (!candidate) fail("no_candidate", "a plan is sealed against a candidate; set one first");

  // The plan names a commit, and the run tracks content. A plan sealed against
  // an amended, rebased or squashed commit describes exactly the same tree, so
  // the commit is compared by what it *contains* rather than by its own oid —
  // otherwise a rebase would invalidate both reviews and the entire selected
  // E2E set, which §00 says explicitly it must not.
  let planned: string;
  try {
    planned = computeSnapshotDigest(repoDir, plan.commitOid).digest;
  } catch (error) {
    fail("unknown_plan_commit", `the plan names ${plan.commitOid}: ${(error as Error).message}`);
  }
  if (planned !== candidate.digest) {
    fail(
      "plan_describes_other_content",
      `the plan was sealed against content ${planned}, the candidate is ${candidate.digest}`,
    );
  }

  const next = await mutate(projectKey, runId, (state) => ({
    ...state,
    e2ePlan: plan,
    e2ePlanSnapshotDigest: candidate.digest,
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
  // `acknowledged` with a receipt, and nothing else. There used to be an
  // `observed` state here too, which no code path ever wrote — a value that
  // only an outside caller could produce, and whose only effect was to make
  // this check pass.
  const proven = pending.state === "acknowledged" && Boolean(pending.backendReceipt);
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
  // This command records an *intent*, and only the two states an intent can be
  // in. Proof that an effect landed is produced by `session reconcile` against
  // the backend, and by nothing else — accepting `observed` here meant a caller
  // could write the proof it was supposed to go and get. Guarding only the
  // clear path was not enough: re-writing the same operationId with
  // `state: "observed"` and then clearing it retired a genuinely unproven
  // operation in two commands.
  if (operation.state !== "prepared" && operation.state !== "uncertain") {
    fail(
      "effect_unproven",
      `\`run pending\` records an intent, so it may only write \`prepared\` or \`uncertain\`, ` +
        `not \`${operation.state}\`; an effect is proven by \`meta-o session reconcile\``,
      { pendingOperation: operation },
    );
  }
  const next = await mutate(projectKey, runId, (state) => {
    // Overwriting is the same act as clearing: the record that named the
    // in-flight effect is gone either way, and the next attempt has nothing to
    // reconcile against. `--clear` refused this and the write path did not, so
    // one `run pending` with a fabricated `state: "observed"` retired a genuine
    // unproven operation.
    //
    // Same id included: a second write under the same id is still a rewrite of
    // the record the next reconcile depends on — a different `probe` or
    // `requestDigest` points it at different evidence.
    if (state.pendingOperation) assertClearable(state.pendingOperation);
    return { ...state, pendingOperation: operation };
  });
  emit({ runId, pendingOperation: next.pendingOperation });
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
  const content = redact(await readStdin());
  try {
    writeHandoff(projectKey, runId, content);
  } catch (error) {
    fail("handoff_too_large", (error as Error).message);
  }
  emit({ runId, handoffBytes: Buffer.byteLength(content, "utf8") });
}

/**
 * §M-CLI-RUN — Replace a paused run's ModelSet with one the user just confirmed.
 *
 * §00 lists "resume, or a newly confirmed ModelSet" as the two exits from
 * `PAUSED_MODEL_UNAVAILABLE`, and the second did not exist: the set was written
 * once at `run start` and by nothing afterwards, so a run pinned to a model the
 * user no longer has could only be cancelled — which is the exit the spec gives
 * to a different state entirely.
 *
 * Confined to the two phases where nothing has attested anything yet. A model
 * swap mid-run would change who judged the candidate without changing the
 * candidate, and four gates would go on describing a review by a model that was
 * no longer in the set.
 */
export async function commandSetModelSet(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const decisionId = requireFlag(args, "decision-id");
  const modelSet = await readStdinJson<ModelSet>();

  const validation = validateModelSet(modelSet);
  if (!validation.ok) fail("invalid_model_set", validation.errors.join("; "));

  const next = await mutate(projectKey, runId, (state) => {
    if (state.phase !== "PAUSED_MODEL_UNAVAILABLE" && state.phase !== "AWAITING_MODEL_SET") {
      fail(
        "model_set_locked",
        `this run is in ${state.phase}; a ModelSet may only be replaced from ` +
          "AWAITING_MODEL_SET or PAUSED_MODEL_UNAVAILABLE, before anything has been attested",
      );
    }
    // §00's pause table lets `PAUSED_MODEL_UNAVAILABLE` exit on a newly
    // *confirmed* ModelSet, and this command took no evidence: the four models
    // could be swapped for four nobody had ever been shown, while
    // `modelSetConfirmedBy` went on naming a decision about the old ones. A run
    // that says "the user confirmed these" has to mean these.
    requireUserDecision(state, decisionId, "the replacement ModelSet");
    return { ...state, modelSet, modelSetConfirmedBy: decisionId };
  });

  emit({
    runId,
    modelSet: next.modelSet,
    phase: next.phase,
    modelSetConfirmedBy: next.modelSetConfirmedBy,
  });
}

/**
 * §M-CLI-RUN — Terminate every worker this run still has open.
 *
 * Best-effort by design: a session the backend has already lost is not a reason
 * to refuse cleanup, and leaving the run directory in place would only mean a
 * second attempt at the same dead handles. What each one did is reported, so a
 * failure to stop is visible rather than swallowed.
 */
async function stopRemainingSessions(state: RunState): Promise<Record<string, string>> {
  const adapter = new HerdrAdapter({ binary: process.env["META_O_HERDR_BIN"] });
  const outcomes: Record<string, string> = {};
  const open = [
    ...Object.values(state.sessions),
    ...(state.orchestratorSession ? [state.orchestratorSession] : []),
  ];
  for (const session of open) {
    try {
      outcomes[session.role] = await adapter.stop(session);
    } catch (error) {
      outcomes[session.role] = `unstopped: ${(error as Error).message}`;
    }
  }
  return outcomes;
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

  // §00 step 5: stop the remaining worker sessions, *then* delete the run.
  // Deleting first destroyed the only record of their handles, so a leaked
  // reviewer sat in a pane that nothing could address any more — and the panes
  // accumulate one per abandoned run.
  const stopped = await stopRemainingSessions(state);
  cleanupRun(projectKey, runId);
  emit({ runId, removed: true, sessions: stopped });
}
