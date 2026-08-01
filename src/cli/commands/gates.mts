/**
 * §M-CLI-GATES — CLI surface for the mechanical checks around every gate.
 *
 * Implements §A-SNAPSHOT-ATTESTATION and §A-AUTHORITATIVE-QC. Each command here
 * answers one question a model must never answer from memory: what is this
 * candidate's digest, did the QC contract really pass, is this plan consistent
 * with the catalog, did the metadata commit stay inside its permitted field.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { computeSnapshotDigest, verifyMetadataCommit } from "../../core/snapshot.mjs";
import { git } from "../../core/git.mjs";
import { runPreflight } from "../../core/preflight.mjs";
import {
  baselineSelection,
  computePlanDigest,
  danglingBusinessLinks,
  sealPlan,
  validatePlan,
  validateRegistry,
} from "../../core/e2e-registry.mjs";
import { detectWeakening, evaluateQc, validateManifest, validateResult } from "../../core/qc.mjs";
import { validateReviewResult, isStaleResult } from "../../core/findings.mjs";
import { buildAnchorIndex, businessAnchors, validateChain } from "../../core/knowledge.mjs";
import { collectModuleAnchors } from "../../core/module-anchors.mjs";
import { createGateWorktree } from "../../core/worktree.mjs";
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
import { emit, fail, optionalFlag, readStdinJson, requireFlag, type ParsedArgs } from "../args.mjs";

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

/** §M-CLI-GATES — Run every mechanical project contract check. */
export function commandPreflight(args: ParsedArgs): void {
  const { repoDir } = repoOf(args);
  const report = runPreflight({
    repoDir,
    requireCleanWorktree: optionalFlag(args, "allow-dirty") === undefined,
  });
  emit(report);
  if (!report.ok) process.exitCode = 1;
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

  const attested = optionalFlag(args, "attested") ?? state.candidateSnapshot?.provenanceCommit;
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
  });

  if (report.ok && state.candidateSnapshot) {
    await withWriterLock(projectKey, runId, () => {
      const current = readState(projectKey, runId);
      if (!current?.candidateSnapshot) fail("unknown_run", `run ${runId} disappeared`);
      return commitState({
        ...current,
        metadataVerified: {
          snapshotDigest: current.candidateSnapshot.digest,
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
 * §M-CLI-GATES — Detect any weakening of the QC contract since the base revision.
 *
 * The executor is the party this gate constrains, so an unexplained relaxation
 * must reach the user rather than be applied by the party it benefits.
 */
export function commandQcWeakening(args: ParsedArgs): void {
  const { repoDir, projectKey } = repoOf(args);
  const runId = optionalFlag(args, "run-id");
  const state = runId ? readState(projectKey, runId) : undefined;
  const baseRevision = optionalFlag(args, "base-rev") ?? state?.baseRevision;
  if (!baseRevision) fail("no_base_revision", "--base-rev or --run-id is required");

  const current = readRepoJson<QcManifest>(repoDir, ".quality/qc-manifest.json");
  let baseline: QcManifest;
  try {
    baseline = JSON.parse(
      git(["show", `${baseRevision}:.quality/qc-manifest.json`], repoDir),
    ) as QcManifest;
  } catch {
    emit({
      weakenings: [],
      note: `no QC manifest existed at ${baseRevision}; nothing to compare`,
      baseRevision,
    });
    return;
  }

  const weakenings = detectWeakening(baseline, current);
  emit({ baseRevision, weakenings, requiresUserDecision: weakenings.length > 0 });
  if (weakenings.length > 0) process.exitCode = 1;
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

/** §M-CLI-GATES — Validate the knowledge layer's anchors and causal links. */
export function commandKnowledgeValidate(args: ParsedArgs): void {
  const { repoDir } = repoOf(args);
  const files: Array<{ path: string; text: string }> = [];
  const candidates = ["docs/knowledge/business.md", "docs/knowledge/glossary.md"];
  const architectureDir = join(repoDir, "docs/knowledge/architecture");
  if (existsSync(architectureDir)) {
    for (const entry of readFileSyncDir(architectureDir)) {
      candidates.push(`docs/knowledge/architecture/${entry}`);
    }
  }
  for (const relative of candidates) {
    const path = join(repoDir, relative);
    if (existsSync(path)) files.push({ path: relative, text: readFileSync(path, "utf8") });
  }

  const index = buildAnchorIndex(files);
  const moduleAnchors = collectModuleAnchors(repoDir);
  const validation = validateChain(index, moduleAnchors);
  emit({
    ...validation,
    documents: files.map((file) => file.path),
    anchors: index.sections.length,
    moduleAnchors: moduleAnchors.length,
    duplicates: index.duplicates,
  });
  if (!validation.ok) process.exitCode = 1;
}

/**
 * §M-CLI-GATES — List Markdown files in a directory, tolerating its absence.
 *
 * An unreadable architecture directory must not abort validation of the
 * business layer, which is the part a human is most likely to be reading.
 */
function readFileSyncDir(path: string): string[] {
  try {
    return readdirSync(path).filter((name: string) => name.endsWith(".md"));
  } catch {
    return [];
  }
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
