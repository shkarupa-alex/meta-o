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
  closeSync,
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { HerdrAdapter } from "../../adapters/herdr.mjs";
import { formatCapabilityReport } from "../../adapters/adapter.mjs";
import {
  baselineOf,
  detectCapabilityRegression,
  formatSuiteReport,
  runFullSuite,
  runSmokeSuite,
  type CapabilityBaseline,
  type SuiteContext,
} from "../../adapters/capability-suite.mjs";
import {
  REGRESSION_PREFIX,
  Watchdog,
  type RunMemory,
  type WatchdogDeps,
  type WatchdogLogEntry,
} from "../../watchdog/watchdog.mjs";
import { classifyWithFallback, parseResetTime, type LocalClassifier } from "../../watchdog/classifier.mjs";
import {
  commitState,
  GENERATION_ENV,
  listRuns,
  readSettings,
  readState,
  withWriterLock,
} from "../../core/state-store.mjs";
import { readSecureJson, writeSecureJson } from "../../core/safe-fs.mjs";
import type { JsonValue } from "../../core/canonical-json.mjs";
import {
  capabilityBaselinePath,
  projectMetadataPath,
  watchdogConfigPath,
  watchdogLockPath,
  watchdogLogPath,
  watchdogMemoryPath,
} from "../../core/paths.mjs";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import type {
  ModelRef,
  ModelSet,
  PendingOperation,
  RunState,
  SessionStatus,
  TailClassification,
  WatchdogConfig,
} from "../../core/types.mjs";
import { boolFlag, emit, fail, optionalFlag, type ParsedArgs } from "../args.mjs";

/** §M-CLI-BACKEND — Maximum watchdog log size before rotation. */
const LOG_ROTATE_BYTES = 4 * 1024 * 1024;

/** §M-CLI-BACKEND — Wake prompt a recovered orchestrator receives. */
export const WAKE_PROMPT =
  "Read the orchestrate-feature-herdr skill, this run's state.json and the backend session " +
  "status, then continue the run from whatever the routing table prescribes.";

/**
 * §M-CLI-BACKEND — What a watchdog-spawned replacement orchestrator is told.
 *
 * A replacement is not a wake: the run it inherits has a generation the
 * watchdog just claimed on its behalf, and until it exports that number the
 * fence in `commitState` reads its writes as "no claim" — which is exactly what
 * a resurrected predecessor's writes would also look like.
 */
export function spawnPrompt(generation: number): string {
  return (
    `export ${GENERATION_ENV}=${generation} before running any meta-o command: you are the ` +
    `replacement orchestrator for this run and that is your generation. ${WAKE_PROMPT}`
  );
}

/**
 * §M-CLI-BACKEND — What an orchestrator is told when an effect cannot be proven.
 *
 * Deliberately different from the wake prompt. "Continue from the routing
 * table" is wrong advice here: the run has an in-flight operation whose effect
 * is unknown, and the only correct next move is to reconcile it and, failing
 * that, pause. A generic wake would invite exactly the blind retry the protocol
 * forbids.
 */
export const UNCERTAINTY_PROMPT =
  "A backend operation on this run cannot be proven applied or not applied. Do not resend " +
  "anything. Run `meta-o session reconcile --run-id <id>`; if it still answers unknown, leave " +
  "the run in PAUSED_BACKEND_UNCERTAIN and tell the user what evidence is missing.";

/** §M-CLI-BACKEND — What an orchestrator is told when the backend lost a capability. */
export const CAPABILITY_REGRESSION_PROMPT =
  "The backend no longer supports a capability this workflow depends on. Do not start new " +
  "sessions. Run `meta-o adapter capabilities`, report the blocking reasons to the user, and " +
  "move the run to FAILED_BACKEND if they cannot be resolved.";

/**
 * §M-CLI-BACKEND — Build the adapter for the backend this project chose.
 *
 * The project's recorded `backend` is consulted, not just the flag. Both were
 * validated and stored and then ignored in favour of a herdr default, so a
 * project configured for omnigent got herdr silently — the one outcome worse
 * than refusing, because the run looked like it was honouring the setting.
 */
export function requireSupportedBackend(configured: string | undefined, flag: string | undefined): void {
  const backend = flag ?? configured ?? "herdr";
  if (backend !== "herdr") {
    fail(
      "unsupported_backend",
      `this project is configured for ${backend}, and only the herdr adapter ships today; ` +
        `${backend} needs its own adapter and an orchestrate-feature-${backend} skill`,
      { configured: configured ?? null, flag: flag ?? null },
    );
  }
}

/** §M-CLI-BACKEND — Build the adapter for the configured backend. */
function adapterFor(args: ParsedArgs): HerdrAdapter {
  const cwd = optionalFlag(args, "cwd") ?? process.cwd();
  let configured: string | undefined;
  try {
    configured = readSettings(resolveProjectIdentity(cwd).projectKey)?.backend;
  } catch {
    /* outside a known project there is nothing recorded to honour */
  }
  requireSupportedBackend(configured, optionalFlag(args, "backend"));
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
 * §M-CLI-BACKEND — Which extra routes this suite run should prove.
 *
 * `--also-routes` wins when given, so a caller can probe a route the project
 * has not adopted yet. Otherwise every distinct route in the confirmed ModelSet
 * is proved, which is exactly the set the run will try to launch.
 */
function routesToProve(
  args: ParsedArgs,
  configured: ModelSet | undefined,
  primary: ModelRef["route"],
): ModelRef["route"][] {
  const declared = optionalFlag(args, "also-routes");
  const candidates =
    declared === undefined
      ? configured
        ? (Object.values(configured) as ModelRef[]).map((ref) => ref.route)
        : []
      : declared.split(",").map((route) => route.trim());
  return [...new Set(candidates)].filter(
    (route): route is ModelRef["route"] => route !== "" && route !== primary,
  );
}

/**
 * §M-CLI-BACKEND — Run the executable capability suite.
 *
 * `--smoke` is the cheap preflight variant; `--full` really creates sessions
 * and is what must be run after installing or upgrading a backend.
 */
export async function commandCapabilitySuite(args: ParsedArgs): Promise<void> {
  const adapter = adapterFor(args);
  const { projectKey } = resolveProjectIdentity(optionalFlag(args, "cwd") ?? process.cwd());
  const configured = readSettings(projectKey)?.modelSet;
  const model: ModelRef = {
    route: (optionalFlag(args, "route") ?? configured?.executor.route ?? "claude") as ModelRef["route"],
    vendor: optionalFlag(args, "vendor") ?? configured?.executor.vendor ?? "unknown",
    family: optionalFlag(args, "family") ?? configured?.executor.family ?? "unknown",
    model: optionalFlag(args, "model") ?? configured?.executor.model ?? "default",
  };
  // The spec asks the full suite to prove *the chosen routes*, plural: a
  // backend can host one CLI perfectly and fail to launch another, and finding
  // that out when the cross-vendor reviewer is spawned costs a whole run.
  //
  // Taken from the project's own ModelSet when the flag is absent, because
  // `install.sh` and `update.sh` pass neither and nobody types `--also-routes`
  // by hand. A suite that only ever proved the default `claude` route recorded
  // a baseline saying nothing about the `codex` the cross-vendor reviewer is
  // pinned to, and preflight then reported no regression against it.
  const additionalModels: ModelRef[] = routesToProve(args, configured, model.route).map((route) => ({
    ...model,
    route,
  }));

  const context: SuiteContext = {
    adapter,
    backend: "herdr",
    cwd: optionalFlag(args, "cwd") ?? process.cwd(),
    model,
    ...(additionalModels.length > 0 ? { additionalModels } : {}),
  };

  const full = boolFlag(args, "full");
  const report = full ? await runFullSuite(context) : await runSmokeSuite(context);

  // Only the full suite may set the baseline. A smoke run proves a subset, and
  // letting it overwrite the record would silently forgive every capability it
  // never checked — which is the same thing as having no baseline at all.
  //
  // A regression blocks the write even when the report is not `blocked`. Most
  // regressions are supported → degraded, which does not block; overwriting on
  // those was how `update.sh` turned a backend that had quietly lost `stop`
  // into the new normal, and reported success while doing it.
  const regressions = full ? detectCapabilityRegression(readCapabilityBaseline(), report) : [];
  let baselineWritten = false;
  if (full && !report.blocked && regressions.length === 0) {
    writeSecureJson(
      capabilityBaselinePath(),
      baselineOf(report, isoTimestamp()) as unknown as JsonValue,
    );
    baselineWritten = true;
  }

  if (boolFlag(args, "text")) {
    process.stdout.write(`${formatSuiteReport(report)}\n`);
    for (const regression of regressions) process.stderr.write(`regression: ${regression}\n`);
  } else {
    emit({ ...report, regressions, baselineWritten, baselinePath: capabilityBaselinePath() });
  }
  if (report.blocked || regressions.length > 0) process.exitCode = 1;
}

/**
 * §M-CLI-BACKEND — Read the recorded capability baseline, tolerating only its absence.
 *
 * A baseline that exists and cannot be read is not the same as no baseline.
 * Swallowing the error returned `undefined`, which the regression check treats
 * as "nothing to compare, therefore fine" — so wrong permissions on one file
 * turned the check off without saying so.
 */
export function readCapabilityBaseline(): CapabilityBaseline | undefined {
  try {
    return readSecureJson<CapabilityBaseline>(capabilityBaselinePath());
  } catch (error) {
    throw new Error(
      `${capabilityBaselinePath()} exists but could not be read: ${(error as Error).message}; ` +
        "re-record it with `meta-o capability-suite run --full` or remove it deliberately",
    );
  }
}

/**
 * §M-CLI-BACKEND — Load the watchdog configuration, or report that it is absent.
 *
 * Validated rather than trusted: the file is hand-edited, and an unreadable one
 * used to surface as `project_keys is not iterable` from deep inside the loop.
 * A configuration problem must read as a configuration problem.
 */
function loadWatchdogConfig(): WatchdogConfig | undefined {
  let raw: unknown;
  try {
    raw = readSecureJson<unknown>(watchdogConfigPath());
  } catch (error) {
    fail("invalid_watchdog_config", `${watchdogConfigPath()}: ${(error as Error).message}`);
  }
  if (raw === undefined) return undefined;

  const config = raw as Partial<WatchdogConfig>;
  const problems: string[] = [];
  if (typeof config.enabled !== "boolean") problems.push("enabled must be a boolean");
  if (!Array.isArray(config.project_keys)) problems.push("project_keys must be an array of keys");
  else if (config.project_keys.some((key) => typeof key !== "string")) {
    problems.push("every entry of project_keys must be a string");
  }
  for (const numeric of ["poll_interval_seconds", "max_backoff_seconds"] as const) {
    const value = config[numeric];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
      problems.push(`${numeric} must be a positive number of seconds`);
    }
  }
  if (config.classifier_mode !== undefined && !["deterministic", "hybrid"].includes(config.classifier_mode)) {
    problems.push("classifier_mode must be deterministic or hybrid");
  }
  if (problems.length > 0) fail("invalid_watchdog_config", problems.join("; "));

  return config as WatchdogConfig;
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
    if (lstatSync(path).size > LOG_ROTATE_BYTES) renameSync(path, `${path}.1`);
  } catch {
    /* the log does not exist yet */
  }
  // `O_NOFOLLOW` rather than a plain append: this file lives in the same
  // directory as run state and is written by a long-lived background process,
  // so a symlink planted at the path would otherwise redirect every line the
  // watchdog writes for as long as it runs.
  const fd = openSync(
    path,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_APPEND | fsConstants.O_NOFOLLOW,
    0o600,
  );
  writeFileSyncFd(fd, `${JSON.stringify(entry)}\n`);
}

/**
 * §M-CLI-BACKEND — Tell somebody that an effect could not be proven.
 *
 * The orchestrator first, because it can act. If there is none, the durable log
 * a human reads: staying silent here is what turned an uncertain operation on a
 * dead orchestrator into a run stuck forever with no trace of why.
 */
async function surfaceUncertainty(
  adapter: HerdrAdapter,
  state: RunState,
  operation: PendingOperation | undefined,
  reason: string,
): Promise<boolean> {
  // The decision's own reason picks the message. It used to be picked by
  // whether a pending operation existed, and since the regression check runs
  // *before* the reconcile branch, "the backend lost a capability" was reliably
  // delivered as "reconcile your pending operation" — advice for a different
  // problem, and the one prompt that names FAILED_BACKEND was never sent.
  const message = reason.startsWith(REGRESSION_PREFIX)
    ? `${CAPABILITY_REGRESSION_PROMPT}\n\n${reason.slice(REGRESSION_PREFIX.length)}`
    : [
        UNCERTAINTY_PROMPT,
        operation
          ? `Pending operation: ${operation.kind} ${operation.operationId} (${operation.state}).`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

  if (state.orchestratorSession) {
    try {
      await adapter.send(state.orchestratorSession, randomUUID(), message);
      return true;
    } catch (error) {
      appendLog({
        timestamp: isoTimestamp(),
        projectKey: state.projectKey,
        runId: state.runId,
        phase: state.phase,
        observedStatus: "unknown",
        action: "surface_uncertainty",
        reason: `could not deliver: ${(error as Error).message}`,
        outcome: "failed",
      });
      return false;
    }
  }
  appendLog({
    timestamp: isoTimestamp(),
    projectKey: state.projectKey,
    runId: state.runId,
    phase: state.phase,
    observedStatus: "unregistered",
    action: "surface_uncertainty",
    reason: `${message} (no orchestrator session to tell; user action required)`,
    outcome: "failed",
  });
  return false;
}

/**
 * §M-CLI-BACKEND — Create the replacement orchestrator for a run.
 *
 * The handle is written to state before the prompt is sent, and written even if
 * the prompt fails. Watchdog memory is deliberately reset when it cannot be
 * parsed, so "exactly one replacement" cannot live only there: deleting one
 * cache file was enough to produce a second live orchestrator for a run that
 * already had one.
 */
async function spawnReplacement(adapter: HerdrAdapter, state: RunState): Promise<void> {
  const session = await adapter.spawn({
    operationId: randomUUID(),
    role: "orchestrator",
    model: state.modelSet.executor,
    prompt: "",
    cwd: projectDirectoryOf(state),
  });
  // The generation is claimed here rather than left alone, because a
  // replacement that inherits the dead orchestrator's number fences nobody out:
  // if the predecessor were only apparently terminal, both would pass the guard
  // in `commitState` and write the same run.
  const generation = await withWriterLock(state.projectKey, state.runId, () => {
    const current = readState(state.projectKey, state.runId);
    if (!current) return state;
    return commitState({
      ...current,
      orchestratorSession: session,
      orchestratorGeneration: current.orchestratorGeneration + 1,
    });
  });
  await adapter.send(session, randomUUID(), spawnPrompt(generation.orchestratorGeneration));
}

/**
 * §M-CLI-BACKEND — Wire the watchdog's deterministic core to the real backend.
 *
 * Separated from the command so that the policy — which action follows which
 * observation — stays in one readable place, and this file holds only the
 * plumbing: how an observation is obtained and how an approved action reaches
 * the backend.
 */
function backendDeps(adapter: HerdrAdapter, config: WatchdogConfig): WatchdogDeps {
  const hybrid = config.classifier_mode === "hybrid";
  /** §M-CLI-BACKEND — Report the orchestrator session's state, or that it never existed. */
  const orchestratorStatus = async (
    state: RunState,
  ): Promise<SessionStatus | "absent" | "unregistered"> => {
    // Not `absent`: the two are opposite claims. `absent` is the backend saying
    // the session it was asked about is gone; `unregistered` is this run never
    // having named one, which proves nothing about whether an orchestrator is
    // sitting in a terminal somewhere driving it right now.
    if (!state.orchestratorSession) return "unregistered";
    try {
      return await adapter.status(state.orchestratorSession);
    } catch {
      return "unknown";
    }
  };

  return {
    config,
    listRuns,
    watchdogEnabledFor: (projectKey) => readSettings(projectKey)?.watchdogEnabled !== false,
    readState,
    orchestratorStatus,
    reconcile: async (_state, operation) => adapter.reconcile(operation),
    readSession: async (state, cursor) => {
      if (!state.orchestratorSession) return undefined;
      try {
        return await adapter.read(state.orchestratorSession, cursor);
      } catch {
        return undefined;
      }
    },
    classifyTail: async (tail) => classifyWithFallback(tail, hybrid ? localClassifier() : undefined),
    wakeOrchestrator: async (state) => {
      if (!state.orchestratorSession) return;
      await adapter.send(state.orchestratorSession, randomUUID(), WAKE_PROMPT);
    },
    surfaceUncertainty: async (state, operation, reason) =>
      surfaceUncertainty(adapter, state, operation, reason),
    spawnOrchestrator: async (state) => spawnReplacement(adapter, state),
    capabilityRegression: async () => (await adapter.capabilityReport()).blockingReasons,
    reloadConfig: loadWatchdogConfig,
    quotaResumeAtMs: (state, nowMs) => parseResetTime(state.paused?.reason ?? "", nowMs),
    loadMemory: (key) => readWatchdogMemory()[key],
    saveMemory: (key, memory) => {
      const all = readWatchdogMemory();
      all[key] = memory;
      writeWatchdogMemory(all);
    },
    forgetMemory: (key) => {
      const all = readWatchdogMemory();
      if (!(key in all)) return;
      delete all[key];
      writeWatchdogMemory(all);
    },
    log: appendLog,
  };
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
  const watchdog = new Watchdog(backendDeps(adapter, config));

  /** §M-CLI-BACKEND — Stop the loop cleanly, so a tick in flight finishes before exit. */
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
 * §M-CLI-BACKEND — The repository a recovered orchestrator must be started in.
 *
 * Taken from the project's own recorded canonical path, never from the
 * watchdog's working directory: run as a service, that directory belongs to
 * launchd or systemd, and every project's replacement orchestrator would open
 * outside the repository it is meant to be driving.
 */
function projectDirectoryOf(state: RunState): string {
  const metadata = readSecureJson<{ canonicalPath?: string }>(projectMetadataPath(state.projectKey));
  if (!metadata?.canonicalPath) {
    throw new Error(`project ${state.projectKey} has no recorded canonical path`);
  }
  return metadata.canonicalPath;
}

/** §M-CLI-BACKEND — Durable per-run watchdog bookkeeping, keyed by project/run. */
function readWatchdogMemory(): Record<string, RunMemory> {
  try {
    return readSecureJson<Record<string, RunMemory>>(watchdogMemoryPath()) ?? {};
  } catch {
    // Corrupt bookkeeping is not worth failing over: the worst case is one
    // duplicate wake, whereas refusing to start loses unattended recovery
    // entirely.
    return {};
  }
}

/** §M-CLI-BACKEND — Persist watchdog bookkeeping so a restart does not re-act. */
function writeWatchdogMemory(all: Record<string, RunMemory>): void {
  writeSecureJson(watchdogMemoryPath(), all as unknown as JsonValue);
}

/**
 * §M-CLI-BACKEND — Local classifier hook for hybrid mode.
 *
 * Hybrid mode is configuration, not code: a deployment that wants a local model
 * points `META_O_LOCAL_CLASSIFIER` at an executable that reads a sanitized tail
 * on stdin and prints one of the four labels. Absent that, hybrid degrades to
 * deterministic, which is the same answer the classifier would give anyway when
 * it abstains.
 */
function localClassifier(): LocalClassifier | undefined {
  const binary = process.env["META_O_LOCAL_CLASSIFIER"];
  if (!binary) return undefined;
  return async (sanitizedTail: string): Promise<TailClassification> => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(binary, [], { input: sanitizedTail, encoding: "utf8", timeout: 20_000 });
    return out.trim() as TailClassification;
  };
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
