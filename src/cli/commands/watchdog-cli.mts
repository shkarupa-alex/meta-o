/**
 * §M-CLI-WATCHDOG — CLI surface for the unattended watchdog.
 *
 * Implements §A-DETERMINISTIC-WATCHDOG. Split from the backend commands
 * because they answer different questions: that file asks what the backend can
 * do, this one asks what to do when a run has stopped moving and nobody is
 * watching. The policy itself is in `src/watchdog/`; everything here is
 * plumbing — how an observation is obtained, and how an approved action
 * reaches the backend.
 */

import { randomUUID } from "node:crypto";
import { HerdrAdapter } from "../../adapters/herdr.mjs";
import {
  adapterFor,
  CAPABILITY_REGRESSION_PROMPT,
  UNCERTAINTY_PROMPT,
  WAKE_PROMPT,
} from "./backend.mjs";
import {
  DEFAULT_MAX_BACKOFF_SECONDS,
  DEFAULT_POLL_SECONDS,
  REGRESSION_PREFIX,
  Watchdog,
  type WatchdogDeps,
} from "../../watchdog/watchdog.mjs";
import { classifyWithFallback, parseResetTime, type LocalClassifier } from "../../watchdog/classifier.mjs";
import {
  clearPendingOperation,
  listRuns,
  readSettings,
  readState,
  withPendingOperation,
  writeSettings,
} from "../../core/state-store.mjs";
import { digestOf } from "./session-state.mjs";
import {
  finishAdoptedOrchestratorSpawn,
  markUncertain,
  mutate,
  prepare,
  recordPane,
  sendSpawnPrompt,
  settleReconciled,
} from "./write-ahead.mjs";
import { readSecureJson, writeSecureJson } from "../../core/safe-fs.mjs";
import {
  acquireSingleInstanceLock,
  appendLog,
  readWatchdogMemory,
  writeWatchdogMemory,
} from "./watchdog-home.mjs";
import type { JsonValue } from "../../core/canonical-json.mjs";
import { projectMetadataPath, watchdogConfigPath, watchdogLogPath } from "../../core/paths.mjs";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import type {
  PendingOperation,
  ReconcileResult,
  RunState,
  SessionRef,
  SessionStatus,
  TailClassification,
  WatchdogConfig,
} from "../../core/types.mjs";
import { boolFlag, emit, fail, optionalFlag, type ParsedArgs } from "../args.mjs";

/**
 * §M-CLI-WATCHDOG — Load the watchdog configuration, or report that it is absent.
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
  // Written by `watchdog enable` and never read: a file from a future version
  // with a field this build does not understand was run as if it were current,
  // which is the one thing a schema version exists to stop.
  if (config.schema_version !== 1) {
    problems.push(`schema_version must be 1, not ${JSON.stringify(config.schema_version)}`);
  }
  if (typeof config.enabled !== "boolean") problems.push("enabled must be a boolean");
  if (!Array.isArray(config.project_keys)) problems.push("project_keys must be an array of keys");
  else if (config.project_keys.some((key) => typeof key !== "string" || key === "")) {
    problems.push("every entry of project_keys must be a non-empty string");
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

/**
 * §M-CLI-WATCHDOG — Switch the watchdog on for one project, writing the config.
 *
 * §50 makes the watchdog opt-in, and opt-in had no path: the schema existed in
 * the spec and in `WatchdogConfig`, and the only way to adopt it was to guess
 * the file's shape and hand-write `~/.meta-o/watchdog.json` with the right
 * permissions. A user-facing switch has to be a command, not a schema.
 *
 * Additive by default: enabling a second project keeps the first, because the
 * commonest use of this command is adding one, and rewriting the list would
 * silently unwatch everything else.
 */
export function commandWatchdogEnable(args: ParsedArgs): void {
  const existing = loadWatchdogConfig();
  const projectKey = optionalFlag(args, "project-key") ?? resolveProjectIdentity(
    optionalFlag(args, "cwd") ?? process.cwd(),
  ).projectKey;

  if (projectKey === "") fail("invalid_watchdog_config", "--project-key may not be empty");
  const keys = new Set(existing?.project_keys ?? []);
  keys.add(projectKey);
  // Spread, so a key a later version added — or a human added by hand — is not
  // dropped by the act of enabling one more project.
  const config: WatchdogConfig = {
    ...existing,
    schema_version: 1,
    enabled: true,
    project_keys: [...keys].sort(),
    // The same two defaults the loop itself falls back to (§50's config
    // example). Writing a different pair here would mean `watchdog enable`
    // silently produced a slower watchdog than an empty config does.
    poll_interval_seconds: numericFlag(args, "poll-interval-seconds")
      ?? existing?.poll_interval_seconds ?? DEFAULT_POLL_SECONDS,
    max_backoff_seconds: numericFlag(args, "max-backoff-seconds")
      ?? existing?.max_backoff_seconds ?? DEFAULT_MAX_BACKOFF_SECONDS,
    classifier_mode: (optionalFlag(args, "classifier-mode")
      ?? existing?.classifier_mode ?? "deterministic") as WatchdogConfig["classifier_mode"],
  };
  if (!["deterministic", "hybrid"].includes(config.classifier_mode)) {
    fail("invalid_watchdog_config", "classifier_mode must be deterministic or hybrid");
  }

  writeSecureJson(watchdogConfigPath(), config as unknown as JsonValue);
  const projectSetting = setProjectWatchdog(projectKey, true);
  emit({
    configPath: watchdogConfigPath(),
    ...config,
    projectSettingUpdated: projectSetting,
    // The loop still has to be started by something, and §50 says that is a
    // user service. Naming the files here is the difference between a switch
    // and a switch nobody can reach.
    serviceTemplates: "share/meta-o/service/ (launchd plist, systemd user unit)",
  });
}

/**
 * §M-CLI-WATCHDOG — Stop watching one project, or switch the watchdog off.
 *
 * Removing the last project switches `enabled` off rather than leaving a loop
 * running with nothing to observe, which reads in the log as a watchdog that
 * has decided everything is fine.
 */
export function commandWatchdogDisable(args: ParsedArgs): void {
  const existing = loadWatchdogConfig();
  if (!existing) {
    emit({ enabled: false, configured: false, note: "no ~/.meta-o/watchdog.json; nothing to do" });
    return;
  }
  const all = boolFlag(args, "all");
  const projectKey = all
    ? undefined
    : optionalFlag(args, "project-key")
      ?? resolveProjectIdentity(optionalFlag(args, "cwd") ?? process.cwd()).projectKey;

  const remaining = all
    ? []
    : existing.project_keys.filter((key) => key !== projectKey);
  const config: WatchdogConfig = {
    ...existing,
    enabled: remaining.length > 0,
    project_keys: remaining,
  };
  writeSecureJson(watchdogConfigPath(), config as unknown as JsonValue);
  const touched = all
    ? existing.project_keys.map((key) => setProjectWatchdog(key, false))
    : [setProjectWatchdog(projectKey!, false)];
  emit({ configPath: watchdogConfigPath(), ...config, projectSettingUpdated: touched.some(Boolean) });
}

/**
 * §M-CLI-WATCHDOG — Record the decision in the project's own settings too.
 *
 * There were two switches and the loop read the other one. `watchdog.json`
 * says which projects a watchdog looks at; `ProjectSettings.watchdogEnabled`
 * is the project's own opt-out, and it is what `watchdogEnabledFor` consults.
 * Writing only the first meant `meta-o watchdog enable` printed a success
 * payload naming the project and changed nothing the loop would read.
 *
 * A project with no settings file is left alone: there is nothing to opt out
 * of yet, and absent already means watchable.
 */
function setProjectWatchdog(projectKey: string, enabled: boolean): boolean {
  const settings = readSettings(projectKey);
  if (!settings) return false;
  if (settings.watchdogEnabled === enabled) return false;
  writeSettings(projectKey, { ...settings, watchdogEnabled: enabled });
  return true;
}

/** §M-CLI-WATCHDOG — Read a positive numeric flag, refusing anything else. */
function numericFlag(args: ParsedArgs, name: string): number | undefined {
  const raw = optionalFlag(args, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    fail("invalid_watchdog_config", `--${name} must be a positive number of seconds, got ${raw}`);
  }
  return value;
}

/** §M-CLI-WATCHDOG — Show whether the watchdog is enabled and what it watches. */
export function commandWatchdogStatus(): void {
  const config = loadWatchdogConfig();
  if (!config) {
    emit({ enabled: false, configured: false, note: "no ~/.meta-o/watchdog.json; watchdog is off" });
    return;
  }
  // Say plainly when hybrid is configured and cannot happen. It degrades to
  // deterministic silently, so `watchdog status` reporting `classifier_mode:
  // hybrid` was describing something that was not running.
  const classifierBinary = process.env[LOCAL_CLASSIFIER_ENV];
  const hybridInactive = config.classifier_mode === "hybrid" && !classifierBinary;
  emit({
    configured: true,
    ...config,
    logPath: watchdogLogPath(),
    localClassifier: classifierBinary ?? null,
    ...(hybridInactive
      ? {
          note:
            `classifier_mode is hybrid but ${LOCAL_CLASSIFIER_ENV} names no executable, so ` +
            "classification is deterministic; point it at a local model or set the mode to " +
            "deterministic so the config says what is happening",
        }
      : {}),
  });
}


/**
 * §M-CLI-WATCHDOG — Tell somebody that an effect could not be proven.
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
 * §M-CLI-WATCHDOG — Create the replacement orchestrator for a run.
 *
 * The handle is written to state before the prompt is sent, and written even if
 * the prompt fails. Watchdog memory is deliberately reset when it cannot be
 * parsed, so "exactly one replacement" cannot live only there: deleting one
 * cache file was enough to produce a second live orchestrator for a run that
 * already had one.
 *
 * The whole spawn now goes through the same write-ahead record every other
 * backend effect in this system uses. It did not, and it was the one caller
 * that could not: the protocol lived inside the session commands as private
 * helpers. So the watchdog — the component that exists to act while nobody is
 * watching, and the one most likely to be killed by the same thing that killed
 * the orchestrator — called `spawn` with nothing written down. A crash between
 * the call and the state write left an agent nothing could name: not `run
 * cleanup`, not the next watchdog tick, which saw the same terminal
 * orchestrator and started another.
 */
async function spawnReplacement(adapter: HerdrAdapter, state: RunState): Promise<void> {
  const { projectKey, runId } = state;
  const cwd = projectDirectoryOf(state);
  const model = state.modelSet.executor;

  // Deterministic, so a watchdog that dies after writing the record and is
  // restarted recognises its own interrupted attempt instead of preparing a
  // second one that looks unrelated. The generation is in the key because the
  // next generation is a different operation, not a retry of this one.
  const operationId = digestOf({
    kind: "watchdog-spawn",
    projectKey,
    runId,
    generation: state.orchestratorGeneration,
  });

  let pending = await prepare(projectKey, runId, {
    operationId,
    kind: "spawn",
    requestDigest: digestOf({ kind: "spawn", role: "orchestrator", model, cwd }),
    probe: adapter.spawnProbe("orchestrator", operationId),
  });

  let session: SessionRef;
  try {
    session = await adapter.spawn(
      { operationId, role: "orchestrator", model, prompt: "", cwd },
      async (paneId) => {
        pending = await recordPane(projectKey, runId, pending, paneId);
      },
    );
  } catch (error) {
    // The record stays, marked uncertain: the backend may or may not have
    // created an agent, and the next tick reconciles rather than guessing.
    await markUncertain(projectKey, runId, pending);
    throw error;
  }

  // The generation is claimed here rather than left alone, because a
  // replacement that inherits the dead orchestrator's number fences nobody out:
  // if the predecessor were only apparently terminal, both would pass the guard
  // in `commitState` and write the same run.
  const generation = await mutate(projectKey, runId, (current) =>
    withPendingOperation(
      {
        ...current,
        orchestratorSession: session,
        orchestratorGeneration: current.orchestratorGeneration + 1,
      },
      { ...pending, state: "acknowledged", sessionId: session.sessionId },
    ),
  );
  await mutate(projectKey, runId, (current) => clearPendingOperation(current));

  await sendSpawnPrompt(adapter, projectKey, runId, session, generation.orchestratorGeneration);
}

/**
 * §M-CLI-WATCHDOG — Ask what became of an operation, then finish what it started.
 *
 * A reconcile that only *reports* the effect is not a reconcile. This asked the
 * adapter, logged the answer and left the record exactly where it was, so a run
 * whose orchestrator died mid-spawn kept its pending operation forever — and
 * since a spawn may not start while one is in flight, the watchdog could never
 * legitimately replace it.
 *
 * Settling adopts an `applied` spawn, which turns an orphan agent back into a
 * session this run names and `run cleanup` can stop; an adopted *orchestrator*
 * then needs the two steps the crash skipped, or the run gets an orchestrator
 * that exists, is named, and was never told anything.
 */
async function reconcileAndSettle(
  adapter: HerdrAdapter,
  state: RunState,
  operation: PendingOperation,
): Promise<ReconcileResult> {
  const result = await adapter.reconcile(operation);
  const recovered = await settleReconciled(
    state.projectKey,
    state.runId,
    adapter,
    state,
    operation,
    result,
  );
  if (recovered?.role === "orchestrator") {
    await finishAdoptedOrchestratorSpawn(adapter, state.projectKey, state.runId, recovered);
  }
  return result;
}

/**
 * §M-CLI-WATCHDOG — Wire the watchdog's deterministic core to the real backend.
 *
 * Separated from the command so that the policy — which action follows which
 * observation — stays in one readable place, and this file holds only the
 * plumbing: how an observation is obtained and how an approved action reaches
 * the backend.
 */
function backendDeps(adapter: HerdrAdapter, config: WatchdogConfig): WatchdogDeps {
  const hybrid = config.classifier_mode === "hybrid";
  /** §M-CLI-WATCHDOG — Report the orchestrator session's state, or that it never existed. */
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
    reconcile: (state, operation) => reconcileAndSettle(adapter, state, operation),
    readSession: async (state, cursor) => {
      if (!state.orchestratorSession) return undefined;
      try {
        return await adapter.read(state.orchestratorSession, cursor);
      } catch {
        return undefined;
      }
    },
    classifyTail: async (tail) => classifyWithFallback(tail, hybrid ? localClassifier() : undefined),
    // Deliberately not write-ahead recorded, unlike the spawn below. A wake is
    // decided precisely when a pending operation may still be open — the
    // `waiting` branch reads that operation's own deadline to decide the run is
    // overdue — and one pending operation at a time is what makes reconcile
    // decidable. Recording a second one would trade a duplicate prompt for an
    // undecidable state. The anti-duplication guard is therefore watchdog
    // memory keyed by state version, written before the call and taken back if
    // the call observably fails; the worst case is a wake nobody received,
    // which stalls visibly, rather than one nobody can account for.
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
 * §M-CLI-WATCHDOG — Run the watchdog loop.
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

  /** §M-CLI-WATCHDOG — Stop the loop cleanly, so a tick in flight finishes before exit. */
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
 * §M-CLI-WATCHDOG — The repository a recovered orchestrator must be started in.
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



/** §M-CLI-WATCHDOG — Environment variable naming the local classifier executable. */
export const LOCAL_CLASSIFIER_ENV = "META_O_LOCAL_CLASSIFIER";

/**
 * §M-CLI-WATCHDOG — Local classifier hook for hybrid mode.
 *
 * Hybrid mode is configuration, not code: a deployment that wants a local model
 * points `META_O_LOCAL_CLASSIFIER` at an executable that reads a sanitized tail
 * on stdin and prints one of the four labels. Absent that, hybrid degrades to
 * deterministic, which is the same answer the classifier would give anyway when
 * it abstains.
 */
function localClassifier(): LocalClassifier | undefined {
  const binary = process.env[LOCAL_CLASSIFIER_ENV];
  if (!binary) return undefined;
  return async (sanitizedTail: string): Promise<TailClassification> => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(binary, [], { input: sanitizedTail, encoding: "utf8", timeout: 20_000 });
    return out.trim() as TailClassification;
  };
}




/** §M-CLI-WATCHDOG — Report which runs a watchdog would observe right now. */
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
