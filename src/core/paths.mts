/**
 * §M-PATHS — The one description of the external state layout.
 *
 * Implements §A-EXTERNAL-STATE. The orchestrator skill, the CLI and the
 * watchdog all have to find the same `state.json`, and they run as separate
 * processes with no shared memory. Centralising the layout means a change to
 * the directory shape is a change in one file rather than a hunt for string
 * concatenations.
 */

import { join } from "node:path";
import { metaOHome } from "./safe-fs.mjs";

/** §M-PATHS — Global configuration shared by all projects. */
export function configPath(): string {
  return join(metaOHome(), "config.json");
}

/** §M-PATHS — Optional watchdog configuration; absent means the watchdog is off. */
export function watchdogConfigPath(): string {
  return join(metaOHome(), "watchdog.json");
}

/** §M-PATHS — Container of every known project state directory. */
export function projectsRoot(): string {
  return join(metaOHome(), "projects");
}

/** §M-PATHS — State directory of one project. */
export function projectDir(projectKey: string): string {
  return join(projectsRoot(), projectKey);
}

/** §M-PATHS — Identity file proving a directory belongs to one canonical path. */
export function projectMetadataPath(projectKey: string): string {
  return join(projectDir(projectKey), "project.json");
}

/** §M-PATHS — Saved ModelSet and backend preferences of one project. */
export function projectSettingsPath(projectKey: string): string {
  return join(projectDir(projectKey), "settings.json");
}

/** §M-PATHS — Container of all runs of one project. */
export function runsDir(projectKey: string): string {
  return join(projectDir(projectKey), "runs");
}

/** §M-PATHS — Directory holding everything temporary about one run. */
export function runDir(projectKey: string, runId: string): string {
  return join(runsDir(projectKey), runId);
}

/** §M-PATHS — The single recoverable state file of a run. */
export function statePath(projectKey: string, runId: string): string {
  return join(runDir(projectKey, runId), "state.json");
}

/** §M-PATHS — Short advisory lock serialising transitions of one run only. */
export function writerLockPath(projectKey: string, runId: string): string {
  return join(runDir(projectKey, runId), "writer.lock");
}

/** §M-PATHS — Directory of immutable inputs copied at preflight. */
export function inputDir(projectKey: string, runId: string): string {
  return join(runDir(projectKey, runId), "input");
}

/** §M-PATHS — Content-addressed copy of the feature spec used as acceptance oracle. */
export function specBlobPath(projectKey: string, runId: string, sha256: string): string {
  return join(inputDir(projectKey, runId), `spec-${sha256}.md`);
}

/** §M-PATHS — Scratch area for open finding payloads too large for state. */
export function findingsDir(projectKey: string, runId: string): string {
  return join(runDir(projectKey, runId), "findings");
}

/** §M-PATHS — Optional executor handoff, capped at 4 KiB by the writer. */
export function handoffPath(projectKey: string, runId: string): string {
  return join(runDir(projectKey, runId), "optional-handoff.md");
}

/**
 * §M-PATHS — Where `make qc` writes its machine-readable result.
 *
 * Lives under the run directory rather than in the repository so that a QC run
 * never dirties the worktree it is attesting.
 */
export function qcResultPath(projectKey: string, runId: string): string {
  return join(runDir(projectKey, runId), "qc-result.json");
}

/** §M-PATHS — Rotating watchdog log; never contains model text or transcripts. */
export function watchdogLogPath(): string {
  return join(metaOHome(), "watchdog.log");
}

/** §M-PATHS — Single-instance lock protecting the watchdog process itself. */
export function watchdogLockPath(): string {
  return join(metaOHome(), "watchdog.lock");
}

/**
 * §M-PATHS — Durable watchdog bookkeeping: which wake and which spawn already happened.
 *
 * Owned by the watchdog, deliberately outside any run directory. It records
 * only what the watchdog itself did, so losing it costs at most one duplicate
 * wake, and a run never depends on it to complete.
 */
export function watchdogMemoryPath(): string {
  return join(metaOHome(), "watchdog-memory.json");
}

/**
 * §M-PATHS — What the backend was last proven able to do, per install.
 *
 * Machine-wide rather than per-project: the backend is a property of the
 * machine, and a regression discovered in one repository is a regression
 * everywhere. Written by the full capability suite after an install or backend
 * update, read by preflight, which refuses to start a run on a backend that has
 * quietly lost something a run depends on.
 */
export function capabilityBaselinePath(): string {
  return join(metaOHome(), "capability-baseline.json");
}
