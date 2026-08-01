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
import { projectDir } from "../../core/paths.mjs";
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

  ensureProject(identity.projectKey, identity.canonicalPath);
  const stored = writeSettings(identity.projectKey, {
    schemaVersion: 1,
    modelSet: payload.modelSet,
    backend: payload.backend,
    watchdogEnabled: payload.watchdogEnabled === true,
    handoffDefault: payload.handoffDefault === true,
  });
  emit({ projectKey: identity.projectKey, settings: stored, summary: describeModelSet(stored.modelSet) });
}
