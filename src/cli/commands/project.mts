/**
 * §M-CLI-PROJECT — CLI surface for project identity and saved preferences.
 *
 * Implements §A-EXTERNAL-STATE. A skill's first act is always "where is my
 * state and what did the user confirm last time"; exposing that as two small
 * commands keeps every skill from re-deriving the project key with its own
 * slightly different string handling.
 */

import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { ensureProject, readSettings, writeSettings } from "../../core/state-store.mjs";
import { validateModelSet, describeModelSet } from "../../core/model-set.mjs";
import { requireSupportedBackend } from "./backend.mjs";
import { readGlobalConfig, writeGlobalConfig, type GlobalConfig } from "../../core/config.mjs";
import { configPath, projectDir } from "../../core/paths.mjs";
import type { ProjectSettings } from "../../core/types.mjs";
import { emit, fail, optionalFlag, readStdinJson, type ParsedArgs } from "../args.mjs";

/** §M-CLI-PROJECT — Resolve the identity of the project containing `--cwd`. */
function identityOf(args: ParsedArgs): { canonicalPath: string; projectKey: string } {
  return resolveProjectIdentity(optionalFlag(args, "cwd") ?? process.cwd());
}

/**
 * §M-CLI-PROJECT — Report the project key and where its state lives.
 *
 * Read-only and side-effect free, so a skill can call it before deciding
 * whether the project has ever been initialised.
 */
export function commandKey(args: ParsedArgs): void {
  const identity = identityOf(args);
  emit({ ...identity, stateDir: projectDir(identity.projectKey) });
}

/**
 * §M-CLI-PROJECT — Create or validate the project's state directory.
 *
 * Separate from `key` because creating state is an action a user should be able
 * to see, not a side effect of asking a question.
 */
export function commandInit(args: ParsedArgs): void {
  const identity = identityOf(args);
  const metadata = ensureProject(identity.projectKey, identity.canonicalPath);
  emit({ ...metadata, stateDir: projectDir(identity.projectKey) });
}

/** §M-CLI-PROJECT — Show saved settings, including the ModelSet to confirm. */
export function commandSettings(args: ParsedArgs): void {
  const identity = identityOf(args);
  const settings = readSettings(identity.projectKey);
  if (!settings) {
    emit({ projectKey: identity.projectKey, settings: null, confirmed: false });
    return;
  }
  emit({
    projectKey: identity.projectKey,
    settings,
    confirmed: true,
    summary: describeModelSet(settings.modelSet),
  });
}

/**
 * §M-CLI-PROJECT — Persist settings the user has just confirmed.
 *
 * Validates the ModelSet invariants before writing: a saved set that violates
 * cross-vendor independence would be re-offered as a default at every future
 * start, quietly weakening every later review.
 */
export async function commandSetSettings(args: ParsedArgs): Promise<void> {
  const identity = identityOf(args);
  const payload = await readStdinJson<Omit<ProjectSettings, "updatedAt">>();

  const validation = validateModelSet(payload.modelSet);
  if (!validation.ok) fail("invalid_model_set", validation.errors.join("; "));
  if (payload.backend !== "herdr" && payload.backend !== "omnigent") {
    fail("invalid_backend", `backend must be herdr or omnigent, got ${String(payload.backend)}`);
  }
  // `omnigent` is a legal backend in the contract and has no adapter, so
  // storing it produced a project every session and backend command refuses —
  // a setting whose only effect is to make the project unrunnable. Refused at
  // the point of writing rather than at every later use.
  requireSupportedBackend(payload.backend, undefined);

  ensureProject(identity.projectKey, identity.canonicalPath);
  // The watchdog decision is carried over, not re-taken. This command exists to
  // store a ModelSet and a backend; writing a default for a key its callers do
  // not send silently reversed a choice made by `meta-o watchdog enable`.
  const previous = readSettings(identity.projectKey);
  const watchdogEnabled =
    typeof payload.watchdogEnabled === "boolean" ? payload.watchdogEnabled : previous?.watchdogEnabled;
  const stored = writeSettings(identity.projectKey, {
    schemaVersion: 1,
    modelSet: payload.modelSet,
    backend: payload.backend,
    ...(watchdogEnabled === undefined ? {} : { watchdogEnabled }),
    handoffDefault: payload.handoffDefault === true,
  });
  emit({ projectKey: identity.projectKey, settings: stored, summary: describeModelSet(stored.modelSet) });
}

/** §M-CLI-PROJECT — Show the machine-wide defaults, or say there are none. */
export function commandConfigShow(): void {
  const config = readGlobalConfig();
  emit({
    path: configPath(),
    config: (config ?? null) as unknown as Record<string, unknown> | null,
    ...(config?.defaultModelSet ? { summary: describeModelSet(config.defaultModelSet) } : {}),
  });
}

/**
 * §M-CLI-PROJECT — Store machine-wide defaults from a JSON payload on stdin.
 *
 * Same validation as project settings, for the same reason: an invalid default
 * ModelSet here would be offered at the start of every run on the machine, and
 * a default nobody can see is wrong is the most durable kind of wrong. It stays
 * a default — a run seeded from it still begins in `AWAITING_MODEL_SET`.
 */
export async function commandConfigSetDefaults(): Promise<void> {
  const payload = await readStdinJson<Omit<GlobalConfig, "schema_version">>();

  if (payload.defaultModelSet !== undefined) {
    const validation = validateModelSet(payload.defaultModelSet);
    if (!validation.ok) fail("invalid_model_set", validation.errors.join("; "));
  }
  if (payload.defaultBackend !== undefined) {
    if (payload.defaultBackend !== "herdr" && payload.defaultBackend !== "omnigent") {
      fail("invalid_backend", `defaultBackend must be herdr or omnigent, got ${String(payload.defaultBackend)}`);
    }
    requireSupportedBackend(payload.defaultBackend, undefined);
  }

  const stored = writeGlobalConfig({
    schema_version: 1,
    ...(payload.defaultModelSet ? { defaultModelSet: payload.defaultModelSet } : {}),
    ...(payload.defaultBackend ? { defaultBackend: payload.defaultBackend } : {}),
    ...(typeof payload.handoffDefault === "boolean" ? { handoffDefault: payload.handoffDefault } : {}),
  });
  emit({ path: configPath(), config: stored as unknown as Record<string, unknown> });
}
