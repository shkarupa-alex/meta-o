/**
 * §M-CLI-GATES — CLI surface for the mechanical checks around every gate.
 *
 * Implements §A-SNAPSHOT-ATTESTATION and §A-AUTHORITATIVE-QC. Each command here
 * answers one question a model must never answer from memory: what is this
 * candidate's digest, did the QC contract really pass, is this plan consistent
 * with the catalog, did the metadata commit stay inside its permitted field.
 */

import type { Dirent } from "node:fs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { computeSnapshotDigest, verifyMetadataCommit } from "../../core/snapshot.mjs";
import { git, resolveCommit } from "../../core/git.mjs";
import { runPreflight, type PreflightCheck } from "../../core/preflight.mjs";
import { HerdrAdapter } from "../../adapters/herdr.mjs";
import {
  detectCapabilityRegression,
  runSmokeSuite,
  unexercised,
  type CapabilityBaseline,
  type SuiteReport,
} from "../../adapters/capability-suite.mjs";
import { readCapabilityBaseline } from "./backend.mjs";
import {
  baselineSelection,
  computePlanDigest,
  danglingBusinessLinks,
  sealPlan,
  validatePlan,
  validateRegistry,
} from "../../core/e2e-registry.mjs";
import {
  detectWeakening,
  evaluateQc,
  validateManifest,
  validateResult,
  type QcWeakening,
} from "../../core/qc.mjs";
import {
  detectBaselineWeakening,
  detectPolicyWeakening,
  parseMetaOPolicy,
  type PolicyWeakening,
} from "../../core/policy.mjs";
import { validateReviewResult, isStaleResult } from "../../core/findings.mjs";
import { buildAnchorIndex, businessAnchors, validateChain } from "../../core/knowledge.mjs";
import { collectModuleAnchors } from "../../core/module-anchors.mjs";
import { createGateWorktree, withGateWorktree } from "../../core/worktree.mjs";
import { assertCleanWorktree } from "../../core/git.mjs";
import { commitState, readState, withWriterLock } from "../../core/state-store.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import { qcResultPath } from "../../core/paths.mjs";
import { fetchSpec } from "../../core/spec-input.mjs";
import type {
  E2ERegistry,
  E2EScenarioResult,
  E2ESelectionPlan,
  FeatureSpecRef,
  QcManifest,
  QcResult,
  ReviewResult,
} from "../../core/types.mjs";
import {
  boolFlag,
  emit,
  fail,
  optionalFlag,
  readStdinJson,
  requireFlag,
  type ParsedArgs,
} from "../args.mjs";

/** §M-CLI-GATES — Resolve the repository a gate command applies to. */
function repoOf(args: ParsedArgs): { repoDir: string; projectKey: string } {
  const identity = resolveProjectIdentity(optionalFlag(args, "cwd") ?? process.cwd());
  return { repoDir: identity.canonicalPath, projectKey: identity.projectKey };
}

/** §M-CLI-GATES — Read a repository JSON file or fail with its path. */
function readRepoJson<T>(repoDir: string, relative: string): T {
  const path = join(repoDir, relative);
  if (!existsSync(path)) fail("missing_file", `${relative} is absent`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    fail("invalid_json", `${relative} is not valid JSON: ${(error as Error).message}`);
  }
}

/**
 * §M-CLI-GATES — Say what the capability comparison actually covered.
 *
 * Naming the unexercised checks matters more than the verdict. The smoke run
 * re-reads the backend's self-report; it does not re-spawn an agent, so the
 * behavioural checks the full suite proved are last-proven facts, not
 * re-verified ones, and a detail line that omitted the difference read as a
 * verification it was not.
 */
function capabilityDetail(
  baseline: CapabilityBaseline | undefined,
  regressions: string[],
  skipped: string[],
): string {
  if (regressions.length > 0) return regressions.join("; ");
  if (!baseline) return "no capability baseline is recorded; run `meta-o capability-suite run --full`";
  const compared = `no reported capability is worse than the baseline of ${baseline.recordedAt}`;
  return skipped.length === 0
    ? compared
    : `${compared}; not re-exercised at preflight: ${skipped.join(", ")}`;
}

/**
 * §M-CLI-GATES — Ask the backend what it can still do, and compare that to the record.
 *
 * The cheap smoke variant, because preflight runs before every feature and must
 * not cost panes or money. Two things can go wrong and they are reported apart:
 * the backend cannot answer at all, and the backend answers *worse than it used
 * to*. The second is the one worth the machinery — a silently degraded backend
 * produces a run that fails four hours later for reasons nobody connects to an
 * upgrade that happened last week.
 */
async function backendChecks(repoDir: string): Promise<PreflightCheck[]> {
  const adapter = new HerdrAdapter({ binary: process.env["META_O_HERDR_BIN"] });
  let report: SuiteReport;
  try {
    report = await runSmokeSuite({ adapter, backend: "herdr", cwd: repoDir, model: PROBE_MODEL });
  } catch (error) {
    return [
      {
        id: "backend-smoke",
        status: "invalid",
        blocking: true,
        detail: `the backend could not be probed: ${(error as Error).message}`,
        remedy: "install or start the backend, or pass --no-backend to check the project alone",
      },
    ];
  }

  let baseline: CapabilityBaseline | undefined;
  try {
    baseline = readCapabilityBaseline();
  } catch (error) {
    return [
      {
        id: "capability-regression",
        status: "invalid",
        blocking: true,
        detail: (error as Error).message,
        remedy: "re-record the baseline with `meta-o capability-suite run --full`",
      },
    ];
  }

  const regressions = detectCapabilityRegression(baseline, report);
  const skipped = unexercised(baseline, report);
  return [
    {
      id: "backend-smoke",
      status: report.blocked ? "invalid" : "ok",
      blocking: true,
      detail: report.blocked
        ? report.blockingReasons.join("; ")
        : `backend answers and reports every completion-critical capability`,
      remedy: "run `meta-o capability-suite run --full` and resolve what it reports",
    },
    {
      id: "capability-regression",
      status: regressions.length === 0 ? "ok" : "invalid",
      blocking: true,
      // Says what it compared, not merely that it found nothing. The smoke run
      // re-reads the backend's self-report; it does not re-spawn an agent, so
      // the behavioural checks the full suite proved are named as last-proven
      // rather than silently counted as still true.
      detail: capabilityDetail(baseline, regressions, skipped),
      remedy:
        "this backend lost a capability the workflow depends on; fix or downgrade it, then " +
        "re-record the baseline with `meta-o capability-suite run --full`",
    },
  ];
}

/** §M-CLI-GATES — The identity a capability probe presents; it never does real work. */
const PROBE_MODEL = {
  route: "claude",
  vendor: "probe",
  family: "probe",
  model: "default",
} as const;

/**
 * §M-CLI-GATES — Run every mechanical project contract check.
 *
 * Includes the backend, because a project contract the backend cannot execute
 * is not a contract this workflow can honour. `--no-backend` checks the
 * repository alone, which is what adoption needs before a backend exists.
 */
export async function commandPreflight(args: ParsedArgs): Promise<void> {
  const { repoDir } = repoOf(args);
  const report = runPreflight({
    repoDir,
    requireCleanWorktree: optionalFlag(args, "allow-dirty") === undefined,
  });

  const checks = [...report.checks];
  const missingContract = [...report.missingContract];
  if (!boolFlag(args, "no-backend")) {
    for (const check of await backendChecks(repoDir)) {
      checks.push(check);
      if (check.blocking && check.status !== "ok") missingContract.push(check.id);
    }
  }

  const ok = checks.every((check) => !check.blocking || check.status === "ok");
  emit({
    ok,
    checks,
    missingContract,
    recommendedPhase: ok ? "EXECUTING" : "PAUSED_MISSING_TOOLS",
  });
  if (!ok) process.exitCode = 1;
}

/** §M-CLI-GATES — Resolve a revision to its commit OID, or nothing if it names none. */
function tryResolveCommit(repoDir: string, revision: string): string | undefined {
  try {
    return resolveCommit(revision, repoDir);
  } catch {
    return undefined;
  }
}

/** §M-CLI-GATES — Compute the snapshot digest of a revision. */
export function commandSnapshotDigest(args: ParsedArgs): void {
  const { repoDir } = repoOf(args);
  emit(computeSnapshotDigest(repoDir, optionalFlag(args, "rev") ?? "HEAD"));
}

/**
 * §M-CLI-GATES — Prove a completion metadata commit touched only `last_run`.
 *
 * This is the last check before `COMPLETE`, and the only moment a tracked file
 * may change after attestation; everything it verifies exists because the
 * alternative is a run that edits content it has already claimed to have
 * verified.
 */
export async function commandVerifyMetadata(args: ParsedArgs): Promise<void> {
  const { repoDir, projectKey } = repoOf(args);
  const runId = requireFlag(args, "run-id");
  const state = readState(projectKey, runId);
  if (!state) fail("unknown_run", `run ${runId} has no state`);

  // `--attested` may name the commit, but it may not *choose* it. Left free, it
  // let a run verify one tree, record the verdict against another, and complete
  // with source no reviewer or scenario had ever seen — the whole guard read as
  // a formality the caller filled in.
  const provenance = state.candidateSnapshot?.provenanceCommit;
  const declared = optionalFlag(args, "attested");
  if (declared !== undefined && provenance !== undefined && declared !== provenance) {
    const resolved = tryResolveCommit(repoDir, declared);
    if (resolved !== provenance) {
      fail(
        "attested_commit_mismatch",
        `--attested ${declared} is not the attested candidate ${provenance}`,
        { declared, resolved, attestedCandidate: provenance },
      );
    }
  }
  const attested = declared ?? provenance;
  if (!attested) fail("no_candidate", "the run has no attested candidate commit");

  const observed = state.e2eScenarioStatus;
  if (!observed || observed.length === 0) {
    fail(
      "no_e2e_result",
      "no executed E2E result is recorded for this run; record one with `meta-o run record-e2e` " +
        "before verifying the metadata commit",
    );
  }
  const expected = new Map(observed.map((item) => [item.scenarioId, item.status]));

  const metadataCommit = optionalFlag(args, "metadata") ?? "HEAD";
  const report = verifyMetadataCommit({
    repoDir,
    attestedCommit: attested,
    metadataCommit,
    expectedRunId: runId,
    expectedSpecSha256: state.spec.sha256,
    expectedScenarioStatus: expected,
    ...(state.e2eEnvironment ? { expectedEnvironment: state.e2eEnvironment } : {}),
  });

  if (report.ok && state.candidateSnapshot) {
    await withWriterLock(projectKey, runId, () => {
      const current = readState(projectKey, runId);
      if (!current?.candidateSnapshot) fail("unknown_run", `run ${runId} disappeared`);
      // The digest recorded is the one the guard read, never the one the run
      // happens to hold. Writing the state's digest here would have made the
      // receipt describe a tree this command never looked at.
      if (report.attestedDigest !== current.candidateSnapshot.digest) {
        fail(
          "attested_digest_mismatch",
          `the guard verified ${report.attestedDigest}, the run's candidate is ${current.candidateSnapshot.digest}`,
        );
      }
      return commitState({
        ...current,
        metadataVerified: {
          snapshotDigest: report.attestedDigest,
          metadataCommit,
          verifiedAt: isoTimestamp(),
        },
      });
    });
  }

  emit({ ...report, expectedScenarioStatus: Object.fromEntries(expected) });
  if (!report.ok) process.exitCode = 1;
}

/** §M-CLI-GATES — Validate the E2E registry and its business links. */
export function commandE2eValidate(args: ParsedArgs): void {
  const { repoDir } = repoOf(args);
  const registry = readRepoJson<E2ERegistry>(repoDir, "docs/architecture/e2e.json");
  const schema = validateRegistry(registry);

  const knowledge = ["docs/knowledge/business.md"]
    .filter((relative) => existsSync(join(repoDir, relative)))
    .map((relative) => ({ path: relative, text: readFileSync(join(repoDir, relative), "utf8") }));
  const dangling = danglingBusinessLinks(registry, businessAnchors(buildAnchorIndex(knowledge)));

  const ok = schema.ok && dangling.length === 0;
  emit({ ok, errors: schema.errors, danglingBusinessLinks: dangling });
  if (!ok) process.exitCode = 1;
}

/** §M-CLI-GATES — Attach a digest to a selection plan draft. */
export async function commandSealPlan(): Promise<void> {
  const draft = await readStdinJson<Omit<E2ESelectionPlan, "planDigest">>();
  emit(sealPlan(draft));
}

/** §M-CLI-GATES — Validate a sealed plan against the catalog. */
export async function commandValidatePlan(args: ParsedArgs): Promise<void> {
  const { repoDir } = repoOf(args);
  const registry = readRepoJson<E2ERegistry>(repoDir, "docs/architecture/e2e.json");
  const plan = await readStdinJson<E2ESelectionPlan>();
  const validation = validatePlan(plan, registry);
  emit({ ...validation, planDigest: plan.planDigest, recomputed: computePlanDigest(plan) });
  if (!validation.ok) process.exitCode = 1;
}

/**
 * §M-CLI-GATES — Suggest a baseline scenario selection.
 *
 * A starting point for the E2E tester, never the answer: the reviewers still
 * judge completeness, and risk-driven additions are the tester's job.
 */
export function commandBaselineSelection(args: ParsedArgs): void {
  const { repoDir } = repoOf(args);
  const registry = readRepoJson<E2ERegistry>(repoDir, "docs/architecture/e2e.json");
  const links = (optionalFlag(args, "business-links") ?? "").split(",").filter(Boolean);
  const tags = (optionalFlag(args, "tags") ?? "").split(",").filter(Boolean);
  emit({
    selected: baselineSelection(registry, { businessLinks: links, tags }),
    note: "baseline only; add scenarios the diff's risk profile implies",
  });
}

/**
 * §M-CLI-GATES — Decide whether a QC run really passed.
 *
 * Reads the result from the run directory by default, because a result the
 * caller supplies by hand is exactly the false-green this check exists to stop.
 */
export function commandQcEvaluate(args: ParsedArgs): void {
  const { repoDir, projectKey } = repoOf(args);
  const runId = requireFlag(args, "run-id");
  const state = readState(projectKey, runId);
  if (!state) fail("unknown_run", `run ${runId} has no state`);

  const manifest = readRepoJson<QcManifest>(repoDir, ".quality/qc-manifest.json");
  const manifestValidation = validateManifest(manifest);
  if (!manifestValidation.ok) fail("invalid_manifest", manifestValidation.errors.join("; "));

  const resultFile = optionalFlag(args, "result") ?? qcResultPath(projectKey, runId);
  let result: QcResult | undefined;
  if (existsSync(resultFile)) {
    try {
      result = JSON.parse(readFileSync(resultFile, "utf8")) as QcResult;
    } catch (error) {
      fail("invalid_qc_result", `${resultFile}: ${(error as Error).message}`);
    }
    const resultValidation = validateResult(result);
    if (!resultValidation.ok) fail("invalid_qc_result", resultValidation.errors.join("; "));
  }

  const expected = optionalFlag(args, "snapshot-digest") ?? state.candidateSnapshot?.digest;
  if (!expected) fail("no_candidate", "the run has no candidate snapshot to compare against");

  const evaluation = evaluateQc(manifest, result, expected);
  emit({ ...evaluation, resultFile, expectedSnapshotDigest: expected });
  if (!evaluation.pass) process.exitCode = 1;
}


/**
 * §M-CLI-GATES — Validate a reviewer's structured result.
 *
 * Rejects the two verdicts that would quietly break the gate: passing with open
 * defects, and passing on an incomplete selection plan.
 */
export async function commandReviewValidate(args: ParsedArgs): Promise<void> {
  const { projectKey } = repoOf(args);
  const result = await readStdinJson<ReviewResult>();
  const validation = validateReviewResult(result);

  let stale = false;
  const runId = optionalFlag(args, "run-id");
  if (runId) {
    const state = readState(projectKey, runId);
    if (state?.candidateSnapshot && state.e2ePlan) {
      stale = isStaleResult(result, {
        snapshotDigest: state.candidateSnapshot.digest,
        planDigest: state.e2ePlan.planDigest,
      });
    }
  }

  emit({ ...validation, stale, verdict: result.verdict });
  if (!validation.ok || stale) process.exitCode = 1;
}

/** §M-CLI-GATES — Validate an E2E result against the plan it claims to execute. */
export async function commandE2eResult(args: ParsedArgs): Promise<void> {
  const { projectKey } = repoOf(args);
  const runId = requireFlag(args, "run-id");
  const state = readState(projectKey, runId);
  if (!state) fail("unknown_run", `run ${runId} has no state`);

  const payload = await readStdinJson<{
    planDigest: string;
    snapshotDigest: string;
    scenarios: E2EScenarioResult[];
  }>();

  const errors: string[] = [];
  if (!state.e2ePlan) errors.push("the run has no stored selection plan");
  else if (payload.planDigest !== state.e2ePlan.planDigest) {
    errors.push(`result attests plan ${payload.planDigest}, run holds ${state.e2ePlan.planDigest}`);
  }
  if (payload.snapshotDigest !== state.candidateSnapshot?.digest) {
    errors.push(`result attests snapshot ${payload.snapshotDigest}, candidate is ${state.candidateSnapshot?.digest}`);
  }

  const executed = new Set(payload.scenarios.map((scenario) => scenario.scenarioId));
  for (const id of state.e2ePlan?.selectedScenarioIds ?? []) {
    if (!executed.has(id)) errors.push(`selected scenario ${id} was not executed`);
  }
  const failures = payload.scenarios.filter((scenario) => scenario.status !== "passed");

  const pass = errors.length === 0 && failures.length === 0;
  emit({ pass, errors, failures });
  if (!pass) process.exitCode = 1;
}

/**
 * §M-CLI-GATES — Validate the knowledge layer's anchors and causal links.
 *
 * `--roots` narrows which tracked directories declare module anchors, and
 * defaults to the whole tree so that forgetting it cannot hide a module. A
 * project needs it when it *ships* source that is not its own — template trees
 * copied into other repositories declare anchors belonging to the project that
 * installs them, and scanning those would report a duplicate for every template
 * whose counterpart exists here. Narrowing it is a change to the gate command,
 * which `meta-o qc weakening` reports.
 */
export function commandKnowledgeValidate(args: ParsedArgs): void {
  const { repoDir } = repoOf(args);
  const roots = (optionalFlag(args, "roots") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  const files: Array<{ path: string; text: string }> = [];
  const candidates = ["docs/knowledge/business.md", "docs/knowledge/glossary.md"];
  for (const relative of markdownUnder(repoDir, "docs/knowledge")) {
    if (!candidates.includes(relative)) candidates.push(relative);
  }
  for (const relative of candidates) {
    const path = join(repoDir, relative);
    if (existsSync(path)) files.push({ path: relative, text: readFileSync(path, "utf8") });
  }

  const index = buildAnchorIndex(files);
  const moduleAnchors = collectModuleAnchors(repoDir, roots);
  const validation = validateChain(index, moduleAnchors);
  emit({
    ...validation,
    roots: roots.length > 0 ? roots : ["<whole tree>"],
    documents: files.map((file) => file.path),
    anchors: index.sections.length,
    moduleAnchors: moduleAnchors.length,
    duplicates: index.duplicates,
  });
  if (!validation.ok) process.exitCode = 1;
}

/**
 * §M-CLI-GATES — Every Markdown file under a directory, tolerating its absence.
 *
 * Recursive on purpose. A non-recursive listing of `architecture/` made the
 * feature-archive rule unreachable — a retired spec parked in
 * `docs/knowledge/archive/` was never read, so the check that exists to find
 * exactly that could never fire. An unreadable subdirectory must still not abort
 * validation of the business layer, which is the part a human is most likely to
 * be reading.
 */
function markdownUnder(repoDir: string, relative: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(join(repoDir, relative), { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...markdownUnder(repoDir, child));
    else if (entry.isFile() && entry.name.endsWith(".md")) found.push(child);
  }
  return found;
}

/** §M-CLI-GATES — Create a fresh detached worktree for a gate. */
export function commandWorktreeCreate(args: ParsedArgs): void {
  const { repoDir } = repoOf(args);
  const worktree = createGateWorktree(
    repoDir,
    optionalFlag(args, "rev") ?? "HEAD",
    optionalFlag(args, "label") ?? "gate",
  );
  emit({ path: worktree.path, commitOid: worktree.commitOid });
}

/**
 * §M-CLI-GATES — Run a gate command inside a fresh worktree and prove it stayed clean.
 *
 * The three things a gate must not do are all handled here rather than by a
 * skill remembering three steps: it must not run against the developer's
 * working tree, it must not modify the content it is judging, and it must write
 * its machine-readable result where the run — not the repository — can find it.
 * A formatter that rewrites a file it was asked to check invalidates the gate,
 * and the only way to notice is to look afterwards.
 */
export async function commandWorktreeRun(args: ParsedArgs): Promise<void> {
  const { repoDir, projectKey } = repoOf(args);
  // The router has already consumed the command words, so everything left is
  // the gate's own argv — passed as an array and never through a shell.
  const command = args.positional;
  if (command.length === 0) fail("usage", "name the command to run, e.g. `worktree run ... make qc`");

  const runId = optionalFlag(args, "run-id");
  const state = runId ? readState(projectKey, runId) : undefined;
  if (runId && !state) fail("unknown_run", `run ${runId} has no state`);
  const revision =
    optionalFlag(args, "rev") ?? state?.candidateSnapshot?.provenanceCommit ?? "HEAD";

  const environment: Record<string, string> = { ...process.env } as Record<string, string>;
  if (state?.candidateSnapshot) {
    environment["META_O_SNAPSHOT_DIGEST"] = state.candidateSnapshot.digest;
  }
  if (runId) environment["META_O_QC_RESULT"] = qcResultPath(projectKey, runId);

  const label = optionalFlag(args, "label") ?? "gate";
  try {
    const outcome = await withGateWorktree(repoDir, revision, label, (worktree) => {
      const child = spawnSync(command[0]!, command.slice(1), {
        cwd: worktree.path,
        env: environment,
        stdio: "inherit",
      });
      if (child.error) throw child.error;
      return child.status ?? 1;
    });
    emit({
      command,
      commitOid: outcome.commitOid,
      exitStatus: outcome.result,
      clean: true,
      qcResultPath: environment["META_O_QC_RESULT"],
      snapshotDigest: environment["META_O_SNAPSHOT_DIGEST"],
    });
    if (outcome.result !== 0) process.exitCode = outcome.result;
  } catch (error) {
    fail("gate_mutated_worktree", (error as Error).message, { command, revision });
  }
}

/** §M-CLI-GATES — Assert a worktree is clean, as required before and after a gate. */
export function commandWorktreeAssertClean(args: ParsedArgs): void {
  const path = requireFlag(args, "path");
  try {
    assertCleanWorktree(path);
  } catch (error) {
    fail("dirty_worktree", (error as Error).message);
  }
  emit({ path, clean: true });
}

/** §M-CLI-GATES — Fetch a spec's bytes and report its digest without storing it. */
export async function commandSpecDigest(args: ParsedArgs): Promise<void> {
  const { repoDir } = repoOf(args);
  const ref = {
    kind: requireFlag(args, "spec-kind"),
    locator: requireFlag(args, "spec-locator"),
    sha256: "",
    disposition: "external",
  } as FeatureSpecRef;
  const fetched = await fetchSpec(ref, repoDir);
  emit({ sha256: fetched.sha256, bytes: fetched.bytes.length, locator: fetched.sanitizedLocator });
}
