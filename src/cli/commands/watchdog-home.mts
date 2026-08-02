/**
 * §M-CLI-WATCHDOG-HOME — The three files the watchdog owns under `~/.meta-o`.
 *
 * Implements §A-SECURITY. Its log, its single-instance lock and its per-run
 * memory sit in the same tree as run state, are written by a long-lived
 * background process, and were the one group of paths that did not go through
 * the safe filesystem layer: `mkdirSync(..., {recursive: true})` accepts a
 * symlinked parent, and `O_NOFOLLOW` on the final component says nothing about
 * the directories above it. §20 asks for the same checks on every state path,
 * not on the ones that happened to be written by the state store.
 *
 * Separated from `watchdog-cli.mts` so the loop reads as policy and this reads
 * as storage; they were one file until the file outgrew its size limit and the
 * seam was already here.
 */

import { constants as fsConstants, closeSync, lstatSync, writeSync } from "node:fs";
import {
  openSecureFile,
  readSecureJson,
  removeSecureFile,
  renameSecureFile,
  writeSecureJson,
} from "../../core/safe-fs.mjs";
import { redactDeep } from "../../core/redact.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import { watchdogLockPath, watchdogLogPath, watchdogMemoryPath } from "../../core/paths.mjs";
import type { JsonValue } from "../../core/canonical-json.mjs";
import { MEMORY_UNREADABLE } from "../../watchdog/decide.mjs";
import type { MemorySnapshot, RunMemory } from "../../watchdog/decide.mjs";
import type { WatchdogLogEntry } from "../../watchdog/watchdog.mjs";

/** §M-CLI-WATCHDOG-HOME — Maximum watchdog log size before rotation. */
const LOG_ROTATE_BYTES = 4 * 1024 * 1024;

/**
 * §M-CLI-WATCHDOG-HOME — Append one line to the durable watchdog log.
 *
 * Records the decision, never the model text or worker transcript: the log's
 * job is to explain what the watchdog did, and transcripts in a rotating file
 * would be both a privacy problem and useless noise.
 *
 * The entry is redacted anyway. `reason` quotes adapter and backend error
 * messages, and a backend that fails while echoing the command it ran puts a
 * token in that message — the one channel where the "no transcript" rule was
 * not enough on its own.
 */
export function appendLog(unredacted: WatchdogLogEntry): void {
  const entry = redactDeep(unredacted);
  const path = watchdogLogPath();
  try {
    if (lstatSync(path).size > LOG_ROTATE_BYTES) renameSecureFile(path, `${path}.1`);
  } catch {
    /* the log does not exist yet */
  }
  const fd = openSecureFile(
    path,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_APPEND,
  );
  writeFileSyncFd(fd, `${JSON.stringify(entry)}\n`);
}

/** §M-CLI-WATCHDOG-HOME — Durable per-run watchdog bookkeeping, keyed by project/run. */
export function readWatchdogMemory(): MemorySnapshot {
  try {
    return readSecureJson<Record<string, RunMemory>>(watchdogMemoryPath()) ?? {};
  } catch {
    // Not a reason to fail over — refusing to start loses unattended recovery
    // entirely — but not a reason to guess "nothing was sent" either. The
    // caller is told, and answers the way every other lost proof in this system
    // is answered: assume the effect may have happened.
    return MEMORY_UNREADABLE;
  }
}

/** §M-CLI-WATCHDOG-HOME — Persist watchdog bookkeeping so a restart does not re-act. */
export function writeWatchdogMemory(all: Record<string, RunMemory>): void {
  writeSecureJson(watchdogMemoryPath(), all as unknown as JsonValue);
}

/**
 * §M-CLI-WATCHDOG-HOME — Take the watchdog's single-instance lock.
 *
 * Guards the watchdog process only, never projects or runs: two watchdogs would
 * double every wake, but a watchdog must never stop an ordinary run from
 * proceeding. A lock left behind by a dead process is reclaimed, otherwise a
 * crash would disable unattended recovery until someone noticed.
 */
export function acquireSingleInstanceLock(): { release(): void } | undefined {
  const path = watchdogLockPath();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSecureFile(
        path,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
      );
      writeFileSyncFd(fd, JSON.stringify({ pid: process.pid, startedAt: isoTimestamp() }));
      return {
        release: () => {
          removeSecureFile(path);
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // A lock file is created before its pid is written, so a crash inside
      // that window leaves an empty or half-written one. Treating an unreadable
      // holder as dead is what keeps that momentary crash from disabling
      // unattended recovery permanently.
      let holder: { pid?: number } | undefined;
      try {
        holder = readSecureJson<{ pid?: number }>(path);
      } catch {
        holder = undefined;
      }
      if (holder?.pid === undefined || !processAlive(holder.pid)) {
        removeSecureFile(path);
        continue;
      }
      return undefined;
    }
  }
  return undefined;
}

/** §M-CLI-WATCHDOG-HOME — Whether a pid is still running on this host. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** §M-CLI-WATCHDOG-HOME — Write to an open descriptor and close it. */
function writeFileSyncFd(fd: number, content: string): void {
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
}
