/**
 * §M-CLI-RUN-START — The command that brings a run into existence.
 *
 * Implements §A-RUN-LIFECYCLE. Split from the rest of the run commands because
 * it is the only one that answers "what is this run" rather than "what happens
 * next": which bytes are the spec, which models will be spent, which backend
 * the sessions will live in. Everything it decides is immutable for the run's
 * lifetime, which is exactly why it is worth reading on its own.
 */

import { randomUUID } from "node:crypto";
import { isAbsolute, relative as relativePath, resolve } from "node:path";
import { git, resolveCommit } from "../../core/git.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import { readGlobalConfig } from "../../core/config.mjs";
import { validateModelSet } from "../../core/model-set.mjs";
import { fetchSpec, materializeSpecBlob, assertSpecUnchanged } from "../../core/spec-input.mjs";
import {
  commitState,
  ensureProject,
  ensureRunDirectories,
  readSettings,
  withWriterLock,
} from "../../core/state-store.mjs";
import type { Backend, ModelSet, ProjectSettings, RunState } from "../../core/types.mjs";
import { requireSupportedBackend } from "./backend.mjs";
import { identityOf } from "./run-context.mjs";
import {
  boolFlag,
  emit,
  fail,
  optionalFlag,
  requireFlag,
  type ParsedArgs,
} from "../args.mjs";

/**
 * §M-CLI-RUN-START — Resolve what a spec reference really is, not what it was called.
 *
 * `--spec-kind local` pointing at a file git tracks is a tracked spec. Taking
 * the caller's word for it set `disposition: "external"`, which turns off
 * retirement entirely — so the same document could ship in the completed tree
 * simply by being introduced with an absolute path. Kind is a fact about the
 * repository, and this is where it gets established.
 */
function normalizeSpecReference(
  repoDir: string,
  kind: string,
  locator: string,
): ["tracked" | "local" | "url", string] {
  if (kind !== "local") return [kind as "tracked" | "url", locator];
  const absolute = isAbsolute(locator) ? locator : resolve(repoDir, locator);
  const relative = relativePath(repoDir, absolute);
  if (relative.startsWith("..") || isAbsolute(relative)) return ["local", locator];
  try {
    git(["ls-files", "--error-unmatch", "--", relative], repoDir);
  } catch {
    return ["local", locator];
  }
  return ["tracked", relative];
}

/**
 * §M-CLI-RUN-START — Decide which models and which backend this run is being started on.
 *
 * Project settings win; the machine-wide default only spares the user from
 * re-entering the same four models for every new repository. Either way the run
 * starts in `AWAITING_MODEL_SET` and is confirmed before anything is spent.
 *
 * The backend is refused here, not merely resolved. It was computed, printed and
 * discarded, so `run start --backend omnigent` answered `"backend": "omnigent"`
 * and then ran every session on herdr — the outcome the shared check exists to
 * prevent, arriving through the one command that creates runs.
 */
function resolveRunEnvironment(
  args: ParsedArgs,
  settings: ProjectSettings | undefined,
): { modelSet: ModelSet; backend: Backend; handoffDefault: boolean } {
  const globalConfig = readGlobalConfig();
  const modelSet: ModelSet | undefined = settings?.modelSet ?? globalConfig?.defaultModelSet;
  requireSupportedBackend(
    settings?.backend ?? globalConfig?.defaultBackend,
    optionalFlag(args, "backend"),
  );
  const backend = (optionalFlag(args, "backend") ??
    settings?.backend ??
    globalConfig?.defaultBackend ??
    "herdr") as Backend;

  if (!modelSet) {
    fail(
      "no_model_set",
      "this project has no confirmed ModelSet, and ~/.meta-o/config.json declares no " +
        "defaultModelSet; run `meta-o project set-settings` for this project, or " +
        "`meta-o config set-defaults` for every project on this machine",
    );
  }
  const validation = validateModelSet(modelSet);
  if (!validation.ok) fail("invalid_model_set", validation.errors.join("; "));

  // A project that has settings has answered the handoff question, even by
  // leaving it out; the machine-wide default only speaks for a project that has
  // said nothing at all.
  const handoffDefault =
    settings?.handoffDefault === true ||
    (settings === undefined && globalConfig?.handoffDefault === true);
  return { modelSet, backend, handoffDefault };
}

/**
 * §M-CLI-RUN-START — Start a run by pinning its spec and creating recoverable state.
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
  const declaredSha = optionalFlag(args, "spec-sha256");
  const [specKind, locator] = normalizeSpecReference(repoDir, kind, requireFlag(args, "spec-locator"));

  const settings = readSettings(projectKey);
  const { modelSet, backend, handoffDefault } = resolveRunEnvironment(args, settings);

  const specRef = {
    kind: specKind,
    locator,
    sha256: declaredSha ?? "",
    disposition: specKind === "tracked" ? "delete_after_sync" : "external",
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
    backend,
    modelSet,
    sessions: {},
    sessionGeneration: {},
    decisions: [],
    confirmations: {},
    reuseScanEnabled: boolFlag(args, "reuse-scan"),
    handoffEnabled: boolFlag(args, "handoff") || handoffDefault,
    updatedAt: isoTimestamp(),
  };

  const written = await withWriterLock(projectKey, runId, () => commitState(state));
  emit({ runId, projectKey, backend, phase: written.phase, specSha256: fetched.sha256, specBlob: blobPath });
}

