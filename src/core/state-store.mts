/**
 * §M-STATE-STORE — Durable, single-writer access to run and project state.
 *
 * Implements §A-EXTERNAL-STATE and §A-CRASH-RECOVERY. A fresh orchestrator must
 * be able to take over a run using nothing but these files, and two
 * orchestrator generations must never both believe they own it. This module is
 * where optimistic versioning, generation fencing and the per-run advisory lock
 * live; without it every skill would invent its own half-correct locking.
 */

import { closeSync, constants as fsConstants, openSync, rmSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import { existsSync, readdirSync } from "node:fs";
import type { JsonValue } from "./canonical-json.mjs";
import { type Clock, isoTimestamp, systemClock } from "./clock.mjs";
import {
  ensureSecureDir,
  readSecureJson,
  writeSecureJson,
  atomicWriteFile,
  verifySecureDir,
} from "./safe-fs.mjs";
import {
  handoffPath,
  inputDir,
  gateReceiptsDir,
  projectDir,
  projectMetadataPath,
  projectSettingsPath,
  runDir,
  runsDir,
  statePath,
  writerLockPath,
} from "./paths.mjs";
import type {
  PendingOperation,
  ProjectMetadata,
  ProjectSettings,
  RunState,
} from "./types.mjs";

/** §M-STATE-STORE — Maximum bytes of the optional executor handoff. */
export const HANDOFF_MAX_BYTES = 4096;

/** §M-STATE-STORE — Raised when a state directory belongs to a different project. */
export class ProjectIdentityMismatchError extends Error {
  /** §M-STATE-STORE — Canonical path the caller resolved. */
  readonly expected: string;
  /** §M-STATE-STORE — Canonical path already recorded on disk. */
  readonly found: string;

  /** §M-STATE-STORE — Keep both paths so the user can see the collision. */
  constructor(expected: string, found: string) {
    super(`project.json canonicalPath mismatch: expected ${expected}, found ${found}`);
    this.name = "ProjectIdentityMismatchError";
    this.expected = expected;
    this.found = found;
  }
}

/** §M-STATE-STORE — Raised when an older orchestrator generation tries to write. */
export class StaleGenerationError extends Error {
  /** §M-STATE-STORE — Generation currently owning the run. */
  readonly onDisk: number;
  /** §M-STATE-STORE — Generation that attempted the write. */
  readonly attempted: number;

  /** §M-STATE-STORE — Report both generations so takeover bugs are obvious. */
  constructor(onDisk: number, attempted: number) {
    super(`refusing write from orchestrator generation ${attempted}; disk has ${onDisk}`);
    this.name = "StaleGenerationError";
    this.onDisk = onDisk;
    this.attempted = attempted;
  }
}

/** §M-STATE-STORE — Raised when state changed under a reader between read and write. */
export class ConcurrentWriteError extends Error {
  /** §M-STATE-STORE — Version currently on disk. */
  readonly onDisk: number;
  /** §M-STATE-STORE — Version the writer had read. */
  readonly attempted: number;

  /** §M-STATE-STORE — Report both versions so the caller can re-read and retry. */
  constructor(onDisk: number, attempted: number) {
    super(`state changed concurrently: disk version ${onDisk}, attempted from ${attempted}`);
    this.name = "ConcurrentWriteError";
    this.onDisk = onDisk;
    this.attempted = attempted;
  }
}

/** §M-STATE-STORE — Raised when a handoff exceeds its budget; truncation is forbidden. */
export class HandoffTooLargeError extends Error {
  /** §M-STATE-STORE — Size of the rejected handoff. */
  readonly bytes: number;

  /** §M-STATE-STORE — Report the actual size so the author knows how much to cut. */
  constructor(bytes: number) {
    super(`handoff is ${bytes} bytes, limit is ${HANDOFF_MAX_BYTES}; rewrite it shorter`);
    this.name = "HandoffTooLargeError";
    this.bytes = bytes;
  }
}

/**
 * §M-STATE-STORE — Create or validate the state directory of a project.
 *
 * The stored canonical path is what turns an ambiguous readable directory name
 * into proof of identity; a mismatch means either a hash collision or a
 * corrupted tree, and both must block the run rather than be repaired silently.
 */
export function ensureProject(
  projectKey: string,
  canonicalPath: string,
  clock: Clock = systemClock,
): ProjectMetadata {
  ensureSecureDir(projectDir(projectKey));
  const path = projectMetadataPath(projectKey);
  const existing = readSecureJson<ProjectMetadata>(path);
  if (existing) {
    if (existing.canonicalPath !== canonicalPath) {
      throw new ProjectIdentityMismatchError(canonicalPath, existing.canonicalPath);
    }
    return existing;
  }
  const created: ProjectMetadata = {
    schemaVersion: 1,
    canonicalPath,
    projectKey,
    createdAt: isoTimestamp(clock),
  };
  writeSecureJson(path, created as unknown as JsonValue);
  return created;
}

/** §M-STATE-STORE — Saved project preferences, or `undefined` before first confirmation. */
export function readSettings(projectKey: string): ProjectSettings | undefined {
  return readSecureJson<ProjectSettings>(projectSettingsPath(projectKey));
}

/**
 * §M-STATE-STORE — Persist project preferences after the user confirmed them.
 *
 * Settings are only ever written behind an explicit user confirmation, so this
 * function stamps `updatedAt` rather than letting callers forge an older time.
 */
export function writeSettings(
  projectKey: string,
  settings: Omit<ProjectSettings, "updatedAt">,
  clock: Clock = systemClock,
): ProjectSettings {
  ensureSecureDir(projectDir(projectKey));
  const stored: ProjectSettings = { ...settings, updatedAt: isoTimestamp(clock) };
  writeSecureJson(projectSettingsPath(projectKey), stored as unknown as JsonValue);
  return stored;
}

/** §M-STATE-STORE — Read a run's state, or `undefined` when the run does not exist. */
export function readState(projectKey: string, runId: string): RunState | undefined {
  return readSecureJson<RunState>(statePath(projectKey, runId));
}

/**
 * §M-STATE-STORE — Every run id currently present for a project.
 *
 * A project with no runs directory yet has no runs, and that is an empty list.
 * A runs directory that fails its ownership and symlink checks is a different
 * fact entirely, and it propagates: swallowing it returned `[]`, which read as
 * "nothing to observe" — so replacing `runs/` with a symlink made the watchdog
 * quietly stop watching that project instead of telling anyone.
 */
export function listRuns(projectKey: string): string[] {
  const directory = runsDir(projectKey);
  if (!existsSync(directory)) return [];
  verifySecureDir(directory);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * §M-STATE-STORE — Prepare the directory skeleton of a new run.
 *
 * Creating `input/` and `gate-receipts/` up front means later writes never race
 * on directory creation while holding the writer lock.
 */
export function ensureRunDirectories(projectKey: string, runId: string): string {
  const dir = ensureSecureDir(runDir(projectKey, runId));
  ensureSecureDir(inputDir(projectKey, runId));
  ensureSecureDir(gateReceiptsDir(projectKey, runId));
  return dir;
}

/**
 * §M-STATE-STORE — Generation the calling orchestrator believes it owns.
 *
 * An environment variable rather than a flag on sixty commands: an orchestrator
 * is one long-lived session, and `run takeover` prints the value it should
 * export. Unset means "no claim", which is what a human running a command by
 * hand is doing.
 */
export const GENERATION_ENV = "META_O_ORCHESTRATOR_GENERATION";

/**
 * §M-STATE-STORE — Refuse a write from an orchestrator that has been replaced.
 *
 * The comparison inside `commitState` cannot do this on its own. Every command
 * re-reads state under the lock and mutates *that* object, so the generation it
 * commits is by construction the one on disk — the guard could never fire, and
 * a superseded orchestrator went on writing as if nothing had happened.
 */
function assertOwningGeneration(current: RunState): void {
  const declared = process.env[GENERATION_ENV];
  if (declared === undefined || declared === "") return;
  const claimed = Number.parseInt(declared, 10);
  if (!Number.isFinite(claimed)) return;
  if (claimed < current.orchestratorGeneration) {
    throw new StaleGenerationError(current.orchestratorGeneration, claimed);
  }
}

/**
 * §M-STATE-STORE — Commit a state transition.
 *
 * Enforces two independent guards: an orchestrator of an older generation may
 * never overwrite a newer one, and a writer that read version N may not commit
 * over version N+1. The first prevents a resurrected orchestrator from undoing
 * a takeover; the second prevents lost updates inside one generation.
 */
export function commitState(next: RunState, clock: Clock = systemClock): RunState {
  const path = statePath(next.projectKey, next.runId);
  const current = readSecureJson<RunState>(path);
  if (current) {
    assertOwningGeneration(current);
    if (current.orchestratorGeneration > next.orchestratorGeneration) {
      throw new StaleGenerationError(current.orchestratorGeneration, next.orchestratorGeneration);
    }
    if (current.stateVersion !== next.stateVersion) {
      throw new ConcurrentWriteError(current.stateVersion, next.stateVersion);
    }
  }
  const written: RunState = {
    ...next,
    stateVersion: next.stateVersion + 1,
    updatedAt: isoTimestamp(clock),
  };
  ensureRunDirectories(next.projectKey, next.runId);
  writeSecureJson(path, written as unknown as JsonValue);
  return written;
}

/** §M-STATE-STORE — Handle returned by a successful lock acquisition. */
export interface WriterLock {
  path: string;
  release(): void;
}

/** §M-STATE-STORE — Contents written into the advisory lock file. */
interface LockPayload {
  pid: number;
  host: string;
  acquiredAtMs: number;
}

/**
 * §M-STATE-STORE — Decide whether an existing lock may be taken over.
 *
 * A crashed orchestrator leaves its lock behind, so refusing to ever steal one
 * would strand the run. A lock is only stolen when its owner process is gone on
 * this host, or when it is older than the stale timeout — never merely because
 * it is inconvenient.
 */
function lockIsStale(payload: LockPayload | undefined, nowMs: number, staleMs: number): boolean {
  if (!payload) return true;
  if (payload.host === hostname()) {
    try {
      process.kill(payload.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    }
  }
  return nowMs - payload.acquiredAtMs > staleMs;
}

/**
 * §M-STATE-STORE — Acquire the per-run advisory lock.
 *
 * Scoped to one run on purpose: a project-wide lock would stop two feature
 * branches from running at once, which the methodology explicitly rejects.
 */
export async function acquireWriterLock(
  projectKey: string,
  runId: string,
  options: { clock?: Clock; timeoutMs?: number; staleMs?: number } = {},
): Promise<WriterLock> {
  const clock = options.clock ?? systemClock;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const staleMs = options.staleMs ?? 120_000;
  ensureRunDirectories(projectKey, runId);
  const path = writerLockPath(projectKey, runId);
  const deadline = clock.now() + timeoutMs;

  for (;;) {
    try {
      const fd = openSync(
        path,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
        0o600,
      );
      const payload: LockPayload = { pid: process.pid, host: hostname(), acquiredAtMs: clock.now() };
      writeSync(fd, JSON.stringify(payload));
      closeSync(fd);
      return {
        path,
        release: () => {
          rmSync(path, { force: true });
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const payload = readSecureJson<LockPayload>(path);
      if (lockIsStale(payload, clock.now(), staleMs)) {
        rmSync(path, { force: true });
        continue;
      }
      if (clock.now() >= deadline) {
        throw new Error(`timed out waiting for writer lock of run ${runId}`);
      }
      await clock.sleep(50);
    }
  }
}

/**
 * §M-STATE-STORE — Run a transition while holding the writer lock.
 *
 * Guarantees the lock is released on failure, so a throwing transition cannot
 * wedge a run until the stale timeout expires.
 */
export async function withWriterLock<T>(
  projectKey: string,
  runId: string,
  body: () => Promise<T> | T,
  options: { clock?: Clock; timeoutMs?: number; staleMs?: number } = {},
): Promise<T> {
  const lock = await acquireWriterLock(projectKey, runId, options);
  try {
    return await body();
  } finally {
    lock.release();
  }
}

/**
 * §M-STATE-STORE — Record the single in-flight backend side effect before it happens.
 *
 * Writing the intent first is what allows a fresh orchestrator to ask the
 * backend what became of an operation instead of guessing or resending it.
 */
export function withPendingOperation(state: RunState, operation: PendingOperation): RunState {
  return { ...state, pendingOperation: operation };
}

/** §M-STATE-STORE — Drop the pending operation once its effect is proven. */
export function clearPendingOperation(state: RunState): RunState {
  const next = { ...state };
  delete next.pendingOperation;
  return next;
}

/**
 * §M-STATE-STORE — Write the optional executor handoff.
 *
 * Overflow throws instead of truncating: a silently clipped handoff would lose
 * exactly the trailing context a fresh session needs most.
 */
export function writeHandoff(projectKey: string, runId: string, content: string): void {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > HANDOFF_MAX_BYTES) throw new HandoffTooLargeError(bytes);
  ensureRunDirectories(projectKey, runId);
  atomicWriteFile(handoffPath(projectKey, runId), content);
}

/**
 * §M-STATE-STORE — Delete everything temporary about a finished run.
 *
 * Project settings and tracked knowledge survive; run artefacts must not, or
 * the next feature would inherit a stale acceptance oracle and dead findings.
 */
export function cleanupRun(projectKey: string, runId: string): void {
  const dir = runDir(projectKey, runId);
  verifySecureDir(projectDir(projectKey));
  rmSync(dir, { recursive: true, force: true });
}
