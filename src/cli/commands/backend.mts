/**
 * §M-CLI-BACKEND — CLI surface for the backend adapter and the watchdog.
 *
 * Implements §A-BACKEND-CONTRACT and §A-DETERMINISTIC-WATCHDOG. Capability
 * grading and unattended recovery are the two places where the methodology
 * touches a system it does not own, so both are exposed as explicit commands a
 * human can run and read, rather than as behaviour hidden inside a prompt.
 */

import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  constants as fsConstants,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { HerdrAdapter } from "../../adapters/herdr.mjs";
import { formatCapabilityReport } from "../../adapters/adapter.mjs";
import {
  formatSuiteReport,
  runFullSuite,
  runSmokeSuite,
  type SuiteContext,
} from "../../adapters/capability-suite.mjs";
import { Watchdog, type WatchdogLogEntry } from "../../watchdog/watchdog.mjs";
import { parseResetTime } from "../../watchdog/classifier.mjs";
import { listRuns, readState } from "../../core/state-store.mjs";
import { readSecureJson } from "../../core/safe-fs.mjs";
import { watchdogConfigPath, watchdogLockPath, watchdogLogPath } from "../../core/paths.mjs";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import type { ModelRef, RunState, SessionStatus, WatchdogConfig } from "../../core/types.mjs";
import { boolFlag, emit, fail, optionalFlag, type ParsedArgs } from "../args.mjs";

/** §M-CLI-BACKEND — Maximum watchdog log size before rotation. */
const LOG_ROTATE_BYTES = 4 * 1024 * 1024;

/** §M-CLI-BACKEND — Wake prompt a recovered orchestrator receives. */
export const WAKE_PROMPT =
  "Read the orchestrate-feature-herdr skill, this run's state.json and the backend session " +
  "status, then continue the run from whatever the routing table prescribes.";

/** §M-CLI-BACKEND — Build the adapter for the configured backend. */
function adapterFor(args: ParsedArgs): HerdrAdapter {
  const backend = optionalFlag(args, "backend") ?? "herdr";
  if (backend !== "herdr") {
    fail(
      "unsupported_backend",
      `only the herdr adapter ships today; ${backend} needs its own orchestrate-feature-<backend> skill`,
    );
  }
  return new HerdrAdapter({ binary: process.env["META_O_HERDR_BIN"] });
}

/** §M-CLI-BACKEND — Report what the backend can actually do. */
export async function commandCapabilities(args: ParsedArgs): Promise<void> {
  const report = await adapterFor(args).capabilityReport();
  if (boolFlag(args, "text")) {
    process.stdout.write(`${formatCapabilityReport(report)}\n`);
    if (report.blocked) process.exitCode = 1;
    return;
  }
  emit(report);
  if (report.blocked) process.exitCode = 1;
}

/**
 * §M-CLI-BACKEND — Run the executable capability suite.
 *
 * `--smoke` is the cheap preflight variant; `--full` really creates sessions
 * and is what must be run after installing or upgrading a backend.
 */
export async function commandCapabilitySuite(args: ParsedArgs): Promise<void> {
  const adapter = adapterFor(args);
  const model: ModelRef = {
    route: (optionalFlag(args, "route") ?? "claude") as ModelRef["route"],
    vendor: optionalFlag(args, "vendor") ?? "unknown",
    family: optionalFlag(args, "family") ?? "unknown",
    model: optionalFlag(args, "model") ?? "default",
  };
  const context: SuiteContext = {
    adapter,
    backend: "herdr",
    cwd: optionalFlag(args, "cwd") ?? process.cwd(),
    model,
  };

  const report = boolFlag(args, "full")
    ? await runFullSuite(context)
    : await runSmokeSuite(context);

  if (boolFlag(args, "text")) process.stdout.write(`${formatSuiteReport(report)}\n`);
  else emit(report);
  if (report.blocked) process.exitCode = 1;
}

/** §M-CLI-BACKEND — Load the watchdog configuration, or report that it is absent. */
function loadWatchdogConfig(): WatchdogConfig | undefined {
  return readSecureJson<WatchdogConfig>(watchdogConfigPath());
}

/** §M-CLI-BACKEND — Show whether the watchdog is enabled and what it watches. */
export function commandWatchdogStatus(): void {
  const config = loadWatchdogConfig();
  if (!config) {
    emit({ enabled: false, configured: false, note: "no ~/.meta-o/watchdog.json; watchdog is off" });
    return;
  }
  emit({ configured: true, ...config, logPath: watchdogLogPath() });
}

/**
 * §M-CLI-BACKEND — Append one line to the durable watchdog log.
 *
 * Records the decision, never the model text or worker transcript: the log's
 * job is to explain what the watchdog did, and transcripts in a rotating file
 * would be both a privacy problem and useless noise.
 */
function appendLog(entry: WatchdogLogEntry): void {
  const path = watchdogLogPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    if (statSync(path).size > LOG_ROTATE_BYTES) renameSync(path, `${path}.1`);
  } catch {
    /* the log does not exist yet */
  }
  appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

/**
 * §M-CLI-BACKEND — Run the watchdog loop.
 *
 * Every recovery path goes through `status`, `read` and `reconcile` first; the
 * watchdog never sends a blind `continue`, never instructs a worker and never
 * edits the FSM itself.
 */
export async function commandWatchdogRun(args: ParsedArgs): Promise<void> {
  const config = loadWatchdogConfig();
  if (!config || !config.enabled) {
    emit({ ran: false, reason: "watchdog is not enabled in ~/.meta-o/watchdog.json" });
    return;
  }

  const instanceLock = acquireSingleInstanceLock();
  if (!instanceLock) {
    emit({ ran: false, reason: "another watchdog instance already holds the single-instance lock" });
    return;
  }

  const adapter = adapterFor(args);
  const maxTicks = Number(optionalFlag(args, "max-ticks") ?? (boolFlag(args, "once") ? 1 : Infinity));

  const orchestratorStatus = async (state: RunState): Promise<SessionStatus | "absent"> => {
    if (!state.orchestratorSession) return "absent";
    try {
      return await adapter.status(state.orchestratorSession);
    } catch {
      return "unknown";
    }
  };

  const watchdog = new Watchdog({
    config,
    listRuns,
    readState,
    orchestratorStatus,
    reconcile: async (_state, operation) => adapter.reconcile(operation),
    wakeOrchestrator: async (state) => {
      if (!state.orchestratorSession) return;
      await adapter.send(state.orchestratorSession, randomUUID(), WAKE_PROMPT);
    },
    spawnOrchestrator: async (state) => {
      const session = await adapter.spawn({
        operationId: randomUUID(),
        role: "orchestrator",
        model: state.modelSet.executor,
        prompt: WAKE_PROMPT,
        cwd: process.cwd(),
      });
      await adapter.send(session, randomUUID(), WAKE_PROMPT);
    },
    quotaResumeAtMs: (state) => parseResetTime(state.paused?.reason ?? ""),
    log: appendLog,
  });

  const handleSignal = (): void => watchdog.stop();
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  try {
    const ticks = await watchdog.run(maxTicks);
    emit({ ran: true, ticks, watching: config.project_keys, startedAt: isoTimestamp() });
  } finally {
    instanceLock.release();
  }
}

/**
 * §M-CLI-BACKEND — Take the watchdog's single-instance lock.
 *
 * Guards the watchdog process only, never projects or runs: two watchdogs would
 * double every wake, but a watchdog must never stop an ordinary run from
 * proceeding. A lock left behind by a dead process is reclaimed, otherwise a
 * crash would disable unattended recovery until someone noticed.
 */
function acquireSingleInstanceLock(): { release(): void } | undefined {
  const path = watchdogLockPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(
        path,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
        0o600,
      );
      writeFileSyncFd(fd, JSON.stringify({ pid: process.pid, startedAt: isoTimestamp() }));
      return {
        release: () => {
          rmSync(path, { force: true });
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const holder = readSecureJson<{ pid?: number }>(path);
      if (holder?.pid === undefined || !processAlive(holder.pid)) {
        rmSync(path, { force: true });
        continue;
      }
      return undefined;
    }
  }
  return undefined;
}

/** §M-CLI-BACKEND — Whether a pid is still running on this host. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** §M-CLI-BACKEND — Write to an open descriptor and close it. */
function writeFileSyncFd(fd: number, content: string): void {
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
}

/** §M-CLI-BACKEND — Report which runs a watchdog would observe right now. */
export function commandWatchdogRuns(args: ParsedArgs): void {
  const config = loadWatchdogConfig();
  const keys =
    config?.project_keys ?? [resolveProjectIdentity(optionalFlag(args, "cwd") ?? process.cwd()).projectKey];
  const runs = keys.flatMap((projectKey) =>
    listRuns(projectKey).map((runId) => {
      const state = readState(projectKey, runId);
      return {
        projectKey,
        runId,
        phase: state?.phase ?? "unreadable",
        stateVersion: state?.stateVersion ?? -1,
        hasOrchestratorSession: Boolean(state?.orchestratorSession),
      };
    }),
  );
  emit({ watching: keys, runs });
}
