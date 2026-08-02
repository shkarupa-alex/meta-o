/**
 * §M-CLI-GATES — CLI surface for the mechanical checks around every gate.
 *
 * Implements §A-SNAPSHOT-ATTESTATION and §A-AUTHORITATIVE-QC. Each command here
 * answers one question a model must never answer from memory: what is this
 * candidate's digest, did the QC contract really pass, is this plan consistent
 * with the catalog, did the metadata commit stay inside its permitted field.
 */

import type { Dirent } from "node:fs";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { readRepoJson } from "../repo-json.mjs";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { computeSnapshotDigest, verifyMetadataCommit } from "../../core/snapshot.mjs";
import { resolveCommit } from "../../core/git.mjs";
import { e2eResultErrors } from "../../core/e2e-result.mjs";
import { assertE2eLoopMayOpen } from "./gate-order.mjs";
import { assertEnvironmentAllowed } from "./results.mjs";
import {
  baselineSelection,
  computePlanDigest,
  danglingBusinessLinks,
  sealPlan,
  validatePlan,
  validateRegistry,
} from "../../core/e2e-registry.mjs";
import {
  evaluateQc,
  validateManifest,
  validateResult,
} from "../../core/qc.mjs";
import { validateReviewResult, isStaleResult } from "../../core/findings.mjs";
import { buildAnchorIndex, businessAnchors, validateChain } from "../../core/knowledge.mjs";
import { collectModuleAnchors } from "../../core/module-anchors.mjs";
import { createGateWorktree, withGateWorktree } from "../../core/worktree.mjs";
import { assertCleanWorktree } from "../../core/git.mjs";
import { commitState, readState, withWriterLock } from "../../core/state-store.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import { gateReceiptPath, qcResultPath } from "../../core/paths.mjs";
import { fetchSpec } from "../../core/spec-input.mjs";
import type {
  E2ERegistry,
  E2EResult,
  E2ESelectionPlan,
  FeatureSpecRef,
  QcManifest,
  QcResult,
  ReviewResult,
} from "../../core/types.mjs";
import {
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

  const result = await readStdinJson<E2EResult>();
  const snapshot = state.candidateSnapshot;
  if (!snapshot) fail("no_candidate", "record a candidate with `run set-candidate` first");
  if (!state.e2ePlan) fail("no_plan", "an E2E result attests a selection plan; store one first");

  // The same functions `run record-e2e` will call, not a paraphrase of them.
  // This command exists so the tester can find out whether its result is
  // acceptable before handing it in; a check that answered a laxer question
  // would tell it yes and then have the recording command say no — and for the
  // environment gate, only after the suite had already touched production.
  assertE2eLoopMayOpen(state);
  assertEnvironmentAllowed(state, repoOf(args).repoDir, result.environment, snapshot.provenanceCommit);
  const errors = e2eResultErrors(result, snapshot.digest, state.e2ePlan);
  const failures = (result.scenarios ?? []).filter((scenario) => scenario.status !== "passed");

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

  // §40 makes an unexpected skip a FAIL, and this gate had the largest possible
  // one: pointed at a repository with no knowledge documents, or at `--roots`
  // naming a directory that does not exist, it reported `ok: true` over zero
  // documents and zero anchors. The Python profile fails closed here
  // (`assert_discovered`); this did not.
  const discovery = [
    ...(files.length === 0 ? ["no knowledge documents under docs/knowledge"] : []),
    ...(moduleAnchors.length === 0
      ? [`no module anchors under ${roots.length > 0 ? roots.join(", ") : "the tree"}`]
      : []),
  ].map((detail) => `${detail}; a gate that judged nothing is a skip, not a pass`);

  emit({
    ...validation,
    ok: validation.ok && discovery.length === 0,
    errors: [...validation.errors, ...discovery],
    roots: roots.length > 0 ? roots : ["<whole tree>"],
    documents: files.map((file) => file.path),
    anchors: index.sections.length,
    moduleAnchors: moduleAnchors.length,
    duplicates: index.duplicates,
  });
  if (!validation.ok || discovery.length > 0) process.exitCode = 1;
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
  // A detached worktree is a clean checkout, which means it has none of the
  // untracked build inputs a gate needs — no `node_modules`, no `.venv`, no
  // `dist`. Every project hits this the first time it runs a gate the way §00
  // requires, and the answer is not to track build output: it is to let the
  // gate find the checkout it was launched from. What a project does with that
  // is its own business; meta-o's own Makefile borrows a compiler from it.
  environment["META_O_ORIGIN_REPO"] = repoDir;

  const label = optionalFlag(args, "label") ?? "gate";
  try {
    const startedAt = isoTimestamp();
    const outcome = await withGateWorktree(repoDir, revision, label, (worktree) => {
      const child = spawnSync(command[0]!, command.slice(1), {
        cwd: worktree.path,
        env: environment,
        stdio: "inherit",
      });
      if (child.error) throw child.error;
      return child.status ?? 1;
    });
    const receipt = runId
      ? writeGateReceipt(projectKey, runId, label, { ...outcome, startedAt }, command, repoDir)
      : undefined;
    emit({
      command,
      commitOid: outcome.commitOid,
      exitStatus: outcome.result,
      clean: true,
      receipt,
      qcResultPath: environment["META_O_QC_RESULT"],
      snapshotDigest: environment["META_O_SNAPSHOT_DIGEST"],
    });
    if (outcome.result !== 0) process.exitCode = outcome.result;
  } catch (error) {
    fail("gate_mutated_worktree", (error as Error).message, { command, revision });
  }
}

/**
 * §M-CLI-GATES — Record that a labelled gate ran isolated and left nothing behind.
 *
 * Written only on the path where `withGateWorktree` returned, which is the only
 * path on which the pre- and post-checks both passed. The exit status is kept
 * but not judged: an E2E run whose scenarios failed is still a run that
 * happened in isolation, and it is the scenario statuses — not the harness's
 * exit code — that decide the gate.
 */
function writeGateReceipt(
  projectKey: string,
  runId: string,
  label: string,
  outcome: { commitOid: string; result: number; startedAt: string },
  command: string[],
  repoDir: string,
): string {
  const path = gateReceiptPath(projectKey, runId, label);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        label,
        commitOid: outcome.commitOid,
        // Content identity as well as provenance. A receipt matched only by
        // commit oid was thrown away by an amend of an identical tree, which is
        // the churn §00 says a rebase must not cause — and for `qc` and `smoke`
        // that meant re-running a gate whose answer could not have changed.
        snapshotDigest: computeSnapshotDigest(repoDir, outcome.commitOid).digest,
        exitStatus: outcome.result,
        command,
        // Both ends of the run, because a gate's other evidence has to be shown
        // to come from *this* run: a QC result file left by an earlier, failing
        // run of the same label is otherwise still there to be believed.
        startedAt: outcome.startedAt,
        completedAt: isoTimestamp(),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  return path;
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
