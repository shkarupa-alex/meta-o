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
import { changedPaths, git, resolveCommit } from "../../core/git.mjs";
import { outsideClosure, readAdoptionManifest } from "../../core/adoption.mjs";
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

import { identityOf, loadState, mutate } from "./run-context.mjs";

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
 * §M-CLI-RUN — Refuse a candidate that edits source outside the adopted closure.
 *
 * Checked here, at the moment content becomes a candidate, because this is the
 * last point before four gates start attesting it. A feature that quietly
 * reached into uncertified code would otherwise arrive at COMPLETE carrying
 * attestations for files nobody has ever given a purpose, an owner or a test —
 * and the adoption boundary would have been widened by no one's decision.
 */
function assertInsideClosure(repoDir: string, state: RunState, candidateCommit: string): void {
  const manifest = readAdoptionManifest(repoDir);
  if (!manifest) return;
  const touched = changedPaths(state.baseRevision, candidateCommit, repoDir);
  const outside = outsideClosure(touched, manifest);
  if (outside.length === 0) return;
  fail(
    "outside_adopted_closure",
    `the candidate changes source outside the adopted closure: ${outside.join(", ")}`,
    {
      adoptedRoots: manifest.adopted_roots,
      remedy:
        "widen the boundary with a separate reviewed adoption change, or keep this feature " +
        "inside the certified roots",
    },
  );
}

/**
 * §M-CLI-RUN — Refuse a candidate that still carries the tracked feature spec.
 *
 * Retirement happens inside the candidate window, not after it. A spec deleted
 * once the reviews are in would be a semantic change to attested content; a spec
 * left in the tree becomes a second, stale source of truth that outlives the
 * feature and quietly contradicts the knowledge layer. The immutable blob keeps
 * the acceptance oracle available to every role regardless.
 */
function assertSpecRetired(repoDir: string, state: RunState, candidateCommit: string): void {
  if (state.spec.kind !== "tracked" || state.spec.disposition !== "delete_after_sync") return;
  const locator = state.spec.locator;
  const present = git(["ls-tree", "--name-only", candidateCommit, "--", locator], repoDir).trim();
  if (present === "") return;
  fail("spec_not_retired", `the candidate still tracks the feature spec ${locator}`, {
    remedy:
      "distribute the spec's durable requirements into §B/§A/§M, delete the tracked spec in " +
      "this same candidate window, and set the candidate again; the pinned blob remains " +
      "available as the acceptance oracle",
    specBlob: state.specBlob,
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
  assertInsideClosure(repoDir, current, computed.provenanceCommit);
  assertSpecRetired(repoDir, current, computed.provenanceCommit);

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
