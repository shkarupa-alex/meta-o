/**
 * §M-WATCHDOG — Optional unattended recovery across several projects.
 *
 * Implements §A-DETERMINISTIC-WATCHDOG. The main workflow already has stall
 * deadlines and pause states, so this component is a convenience, never a
 * correctness dependency — disabling it must change nothing about whether a run
 * can complete. What it adds is unattended progress overnight: noticing a
 * finished turn nobody reacted to, a quota window that has reopened, an
 * orchestrator that died.
 *
 * Its whole design is about *not* acting: it observes through `status`, `read`
 * and `reconcile`, it never instructs workers, it never edits the FSM, it never
 * replaces a living orchestrator, and it re-checks `stateVersion` immediately
 * before doing anything so that a crash between observation and action cannot
 * duplicate that action.
 */

import { type Clock, systemClock, isoTimestamp } from "../core/clock.mjs";
import { isTerminal } from "../core/fsm.mjs";
import {
  DEFAULT_STALL_DEADLINE_MS,
  REGRESSION_PREFIX,
  decideAction,
  MEMORY_UNREADABLE,
  type MemorySnapshot,
  type RunMemory,
  type WatchdogDecision,
  type WatchdogLogEntry,
  type WatchdogObservation,
} from "./decide.mjs";

export {
  DEFAULT_STALL_DEADLINE_MS,
  REGRESSION_PREFIX,
  decideAction,
  type RunMemory,
  type WatchdogDecision,
  type WatchdogLogEntry,
  type WatchdogObservation,
};
import type {
  PendingOperation,
  ReconcileResult,
  RunState,
  SessionStatus,
  TailClassification,
  WatchdogConfig,
} from "../core/types.mjs";

/** §M-WATCHDOG — Default poll interval when the config omits one. */
export const DEFAULT_POLL_SECONDS = 30;

/** §M-WATCHDOG — Default backoff ceiling when the config omits one. */
export const DEFAULT_MAX_BACKOFF_SECONDS = 300;

/** §M-WATCHDOG — What a read of the orchestrator's own session produced. */
export interface SessionReading {
  cursor?: string;
  text: string;
  terminal: boolean;
}

/** §M-WATCHDOG — Everything the watchdog needs from the outside world. */
export interface WatchdogDeps {
  config: WatchdogConfig;
  clock?: Clock;
  stallDeadlineMs?: number;
  listRuns(projectKey: string): string[];
  /**
   * Whether this project has opted into being watched.
   *
   * §50 makes the watchdog opt-in, and the config lists project keys — but
   * `ProjectSettings.watchdogEnabled` is the answer the *project* gave, and it
   * was read by nothing. A project that had switched the watchdog off was
   * watched anyway as soon as anyone added its key to `watchdog.json`. Absent,
   * this defaults to watched, so a project with no settings file behaves as it
   * always did.
   */
  watchdogEnabledFor?(projectKey: string): boolean;
  readState(projectKey: string, runId: string): RunState | undefined;
  orchestratorStatus(state: RunState): Promise<SessionStatus | "absent" | "unregistered">;
  reconcile(state: RunState, operation: PendingOperation): Promise<ReconcileResult>;
  wakeOrchestrator(state: RunState): Promise<void>;
  spawnOrchestrator(state: RunState): Promise<void>;
  log(entry: WatchdogLogEntry): void;
  quotaResumeAtMs?(state: RunState, nowMs: number): number | undefined;
  /** Read the orchestrator session's new output, for cursor progress and tail reading. */
  readSession?(state: RunState, cursor?: string): Promise<SessionReading | undefined>;
  /** Classify a tail; supplied so hybrid mode can add a local model behind the same contract. */
  classifyTail?(tail: string): Promise<TailClassification>;
  /**
   * Tell the orchestrator, in its own words, what the watchdog observed.
   *
   * `reason` is the decision's own reason, and it selects the message: an
   * unprovable effect and a lost backend capability call for opposite advice,
   * and choosing between them by "is there a pending operation" delivered the
   * reconcile prompt to a run whose backend had failed. Returns whether anyone
   * was actually told, so a message that reached nobody is not recorded as
   * surfaced and stops the watchdog retrying forever into a dead session.
   */
  surfaceUncertainty?(
    state: RunState,
    operation: PendingOperation | undefined,
    reason: string,
  ): Promise<boolean>;
  /** Blocking capability reasons, if the backend regressed since installation. */
  capabilityRegression?(): Promise<string[]>;
  /** Re-read configuration, so disabling the watchdog does not require killing it. */
  reloadConfig?(): WatchdogConfig | undefined;
  /**
   * Read the whole bookkeeping file, once per tick.
   *
   * Per-key was wrong, and wrong in a way that hid itself: seeding one run's
   * slot rewrites the file, so the very next key in the same tick read a
   * perfectly valid map that simply lacked its entry — indistinguishable from a
   * run that had never been seen. One unreadable file protected the first run
   * and woke every other one.
   */
  loadAllMemory?(): MemorySnapshot;
  saveMemory?(key: string, memory: RunMemory): void;
  forgetMemory?(key: string): void;
}

/** §M-WATCHDOG — Result of one full pass over all configured projects. */
export interface TickReport {
  observations: number;
  decisions: Array<{ projectKey: string; runId: string } & WatchdogDecision>;
  nextDelayMs: number;
}

/**
 * §M-WATCHDOG — The observation loop.
 *
 * Holds only in-memory bookkeeping: everything durable belongs to the runs it
 * watches. Losing this process therefore loses nothing but timing.
 */
export class Watchdog {
  /** §M-WATCHDOG — Everything the loop is allowed to touch, injected rather than imported. */
  private readonly deps: WatchdogDeps;

  /** §M-WATCHDOG — Time source, so a whole backoff schedule can be tested in microseconds. */
  private readonly clock: Clock;

  /** §M-WATCHDOG — Per-run bookkeeping: last seen version, last progress, current backoff. */
  private readonly memory = new Map<string, RunMemory>();

  /** §M-WATCHDOG — How long a waiting run may make no progress before it counts as stalled. */
  private readonly stallDeadlineMs: number;

  /** §M-WATCHDOG — Set by a signal handler so the loop finishes its tick and exits cleanly. */
  private stopped = false;

  /** §M-WATCHDOG — Bind the watchdog to its environment and clock. */
  constructor(deps: WatchdogDeps) {
    this.deps = deps;
    this.clock = deps.clock ?? systemClock;
    this.stallDeadlineMs = deps.stallDeadlineMs ?? DEFAULT_STALL_DEADLINE_MS;
  }

  /** §M-WATCHDOG — Poll interval in milliseconds. */
  private pollMs(): number {
    return (this.deps.config.poll_interval_seconds || DEFAULT_POLL_SECONDS) * 1000;
  }

  /** §M-WATCHDOG — Backoff ceiling in milliseconds. */
  private maxBackoffMs(): number {
    return (this.deps.config.max_backoff_seconds || DEFAULT_MAX_BACKOFF_SECONDS) * 1000;
  }

  /**
   * §M-WATCHDOG — Fetch or create the memory slot of one run.
   *
   * A new slot dates its last observed progress from the run's own `updatedAt`,
   * not from now. Otherwise a watchdog restarted after a reboot would consider
   * every run freshly active and wait out a full stall deadline before noticing
   * a run that has already been stuck for hours — exactly the unattended case
   * it exists to cover.
   */
  private memoryFor(
    key: string,
    state: RunState,
    snapshot: MemorySnapshot,
    regression: string,
  ): RunMemory {
    const lost = snapshot === MEMORY_UNREADABLE;
    const existing = this.memory.get(key) ?? (lost ? undefined : snapshot[key]);
    if (existing) {
      this.memory.set(key, existing);
      return existing;
    }
    const updatedAtMs = Date.parse(state.updatedAt);
    const created: RunMemory = {
      lastStateVersion: state.stateVersion,
      lastProgressAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : this.clock.now(),
      backoffMs: this.pollMs(),
    };
    if (lost) {
      // The bookkeeping was unreadable when this tick started, which is not the
      // same as this run having none. What was lost is the record of what has already been
      // delivered, so the slot is rebuilt as though the notifications for the
      // state as it stands had already gone out. They are the two effects the
      // watchdog causes without a write-ahead record, precisely because their
      // payloads are idempotent — but "assume it was sent" is still the right
      // direction, and it is the direction every other lost proof here takes.
      // The spawn guard is deliberately not seeded: a spawn has a write-ahead
      // record in durable run state, so its dedupe does not depend on this file
      // and re-protecting it here would only duplicate the weaker half.
      // The seed is durable, so the loss costs one stalled cycle rather than
      // repeating on every tick, and the next thing the orchestrator does moves
      // `stateVersion` and lifts it.
      created.wakeSentForStateVersion = state.stateVersion;
      created.surfacedForStateVersion = state.stateVersion;
      // All three dedupes, not two. This one is keyed by the regression's own
      // text rather than by a state version, so it can only be seeded with the
      // regression that is current — which is why the tick computes it before
      // the run loop and passes it down. Seeded with `""` when there is none,
      // which matches nothing and suppresses nothing.
      if (regression) created.surfacedRegression = regression;
      this.deps.saveMemory?.(key, created);
    }
    this.memory.set(key, created);
    return created;
  }

  /**
   * §M-WATCHDOG — Observe one run without changing anything.
   *
   * Reconciliation is included in observation on purpose: knowing what became
   * of an in-flight operation is a read, and doing it before any decision keeps
   * "resend" from ever being the first idea available.
   */
  private async observe(
    projectKey: string,
    runId: string,
    memory: RunMemory,
    state: RunState,
  ): Promise<WatchdogObservation> {
    const progressed = state.stateVersion !== memory.lastStateVersion;
    const orchestratorStatus = await this.deps.orchestratorStatus(state);

    let reconcile: ReconcileResult | undefined;
    if (state.pendingOperation) {
      reconcile = await this.deps.reconcile(state, state.pendingOperation);
    }

    let tail: TailClassification | undefined;
    let outputAdvanced: boolean | undefined;
    const reading = this.deps.readSession
      ? await this.deps.readSession(state, memory.lastCursor)
      : undefined;
    if (reading) {
      outputAdvanced = reading.cursor !== undefined && reading.cursor !== memory.lastCursor;
      if (reading.cursor !== undefined) memory.lastCursor = reading.cursor;
      if (reading.text.trim() !== "" && this.deps.classifyTail) {
        tail = await this.deps.classifyTail(reading.text);
      }
    }

    const updatedAtMs = Date.parse(state.updatedAt);
    const referenceMs = Number.isFinite(updatedAtMs) ? updatedAtMs : memory.lastProgressAtMs;
    return {
      projectKey,
      runId,
      state,
      orchestratorStatus,
      ...(reconcile ? { reconcile } : {}),
      ...(tail ? { tail } : {}),
      ...(outputAdvanced === undefined ? {} : { outputAdvanced }),
      progressed,
      idleForMs: Math.max(0, this.clock.now() - Math.max(referenceMs, memory.lastProgressAtMs)),
    };
  }

  /**
   * §M-WATCHDOG — Deliver one wake, recorded before it is attempted.
   *
   * Split out so the write-ahead and its rollback stay next to each other: the
   * guard is only honest if an observed failure gives the record back.
   */
  private async wake(
    observation: WatchdogObservation,
    fresh: RunState,
    memory: RunMemory,
  ): Promise<WatchdogLogEntry["outcome"]> {
    const key = `${observation.projectKey}/${observation.runId}`;
    const previous = memory.wakeSentForStateVersion;
    memory.wakeSentForStateVersion = fresh.stateVersion;
    this.deps.saveMemory?.(key, memory);
    try {
      await this.deps.wakeOrchestrator(fresh);
    } catch (error) {
      memory.wakeSentForStateVersion = previous;
      this.deps.saveMemory?.(key, memory);
      throw error;
    }
    return "performed";
  }

  /**
   * §M-WATCHDOG — Perform a decided action after re-proving it is still current.
   *
   * The re-read is the anti-duplication guard: if the orchestrator moved the run
   * on while the watchdog was thinking, the action is dropped as superseded
   * rather than applied to a state that no longer wants it.
   */
  private async perform(
    observation: WatchdogObservation,
    decision: WatchdogDecision,
    memory: RunMemory,
  ): Promise<WatchdogLogEntry["outcome"]> {
    if (decision.action === "noop") return "skipped";

    const fresh = this.deps.readState(observation.projectKey, observation.runId);
    if (!fresh || fresh.stateVersion !== observation.state.stateVersion) return "superseded";

    try {
      switch (decision.action) {
        case "wake_orchestrator":
          // Written ahead for the same reason the spawn below is: "one wake per
          // completion event" is an acceptance criterion, and recording it only
          // after the call left no trace of a wake that had already arrived if
          // the watchdog died in between. The next process re-decided on the
          // unchanged `stateVersion` and delivered a second prompt into the
          // same session.
          //
          // The trade is a wake recorded but never sent, which leaves the run
          // idle while the watchdog backs off saying, every tick, that it
          // already delivered one. That is a stall a human can read in the log
          // rather than an unsolicited prompt in a live orchestrator's context,
          // and it is the same direction every other uncertain effect in this
          // system is resolved. A call that *fails* observably is not that
          // case, so the record is taken back.
          return await this.wake(observation, fresh, memory);

        case "spawn_orchestrator":
          // The generation is claimed *before* the attempt, not after it. A
          // spawn is two backend calls with no write-ahead record, so a failure
          // says nothing about whether an agent now exists; recording only on
          // success turned a failing `agent prompt` into one new orchestrator
          // per tick, indefinitely. One attempt per generation, and if it
          // failed a human decides.
          memory.spawnedForGeneration = fresh.orchestratorGeneration;
          this.deps.saveMemory?.(`${observation.projectKey}/${observation.runId}`, memory);
          await this.deps.spawnOrchestrator(fresh);
          return "performed";

        case "backoff":
          memory.backoffMs = Math.min(Math.max(memory.backoffMs, this.pollMs()) * 2, this.maxBackoffMs());
          return "performed";

        case "surface_uncertainty": {
          if (!this.deps.surfaceUncertainty) return "skipped";
          const told = await this.deps.surfaceUncertainty(
            fresh,
            fresh.pendingOperation,
            decision.reason,
          );
          memory.backoffMs = Math.min(Math.max(memory.backoffMs, this.pollMs()) * 2, this.maxBackoffMs());
          // Only a message somebody received counts as surfaced. Recording it
          // regardless meant a regression announced into a dead session was
          // never mentioned again — the run sat blocked and the only trace was
          // one line in a log nobody reads at 3am.
          if (!told) return "failed";
          if (decision.reason.startsWith(REGRESSION_PREFIX)) {
            memory.surfacedRegression = decision.reason.slice(REGRESSION_PREFIX.length);
          } else {
            memory.surfacedForStateVersion = fresh.stateVersion;
          }
          return "performed";
        }

        default:
          return "skipped";
      }
    } catch {
      memory.backoffMs = Math.min(Math.max(memory.backoffMs, this.pollMs()) * 2, this.maxBackoffMs());
      return "failed";
    }
  }

  /**
   * §M-WATCHDOG — One full pass over every configured project.
   *
   * Projects are independent: a corrupt or unreachable one must not stop the
   * others from being observed.
   */
  async tick(): Promise<TickReport> {
    const decisions: TickReport["decisions"] = [];
    let observations = 0;
    let shortestDelay = this.maxBackoffMs();

    const reloaded = this.deps.reloadConfig?.();
    if (reloaded) this.deps.config = reloaded;
    if (!this.deps.config.enabled) {
      this.stopped = true;
      return { observations: 0, decisions: [], nextDelayMs: this.pollMs() };
    }

    // One read, one verdict, for the whole tick. Asking per run let the first
    // run's own seed repair the file and answer "readable" for the rest.
    const snapshot: MemorySnapshot = this.deps.loadAllMemory?.() ?? {};

    let capabilityRegression: string[] = [];
    try {
      capabilityRegression = (await this.deps.capabilityRegression?.()) ?? [];
    } catch {
      // A capability probe that itself fails is a backend problem, not a reason
      // to stop watching: the runs below still need their status observed.
      capabilityRegression = [];
    }

    for (const projectKey of this.deps.config.project_keys ?? []) {
      if (this.deps.watchdogEnabledFor?.(projectKey) === false) {
        this.deps.log({
          timestamp: isoTimestamp(this.clock),
          projectKey,
          runId: "",
          phase: "unknown",
          observedStatus: "disabled",
          action: "noop",
          reason: "the project's own settings have the watchdog switched off",
          outcome: "skipped",
        });
        continue;
      }
      let runIds: string[];
      try {
        runIds = this.deps.listRuns(projectKey);
      } catch (error) {
        // Not observable is not the same as nothing to observe. A tampered or
        // unreadable state tree used to leave the loop silently skipping the
        // project, which is indistinguishable from "that project is idle".
        this.deps.log({
          timestamp: isoTimestamp(this.clock),
          projectKey,
          runId: "",
          phase: "unknown",
          observedStatus: "unreadable",
          action: "surface_uncertainty",
          reason: `the run list could not be read: ${(error as Error).message}`,
          outcome: "performed",
        });
        continue;
      }

      for (const runId of runIds) {
        const key = `${projectKey}/${runId}`;
        let state: RunState | undefined;
        try {
          state = this.deps.readState(projectKey, runId);
        } catch {
          this.deps.log({
            timestamp: isoTimestamp(this.clock),
            projectKey,
            runId,
            phase: "unreadable",
            observedStatus: "unreadable",
            action: "noop",
            reason: "state is unreadable or corrupt; not acting",
            outcome: "skipped",
          });
          continue;
        }
        if (!state) continue;

        const memory = this.memoryFor(key, state, snapshot, capabilityRegression.join("; "));
        if (isTerminal(state.phase)) {
          this.memory.delete(key);
          this.deps.forgetMemory?.(key);
          continue;
        }

        observations += 1;
        let observation: WatchdogObservation;
        try {
          observation = await this.observe(projectKey, runId, memory, state);
        } catch (error) {
          // Observation talks to a backend this component does not own. A
          // refused connection or a broken adapter is precisely the situation
          // the run needs a watchdog for, so it becomes a backoff for this run
          // rather than an exception that takes the whole loop — and every
          // other project — down with it.
          memory.backoffMs = Math.min(
            Math.max(memory.backoffMs, this.pollMs()) * 2,
            this.maxBackoffMs(),
          );
          this.deps.saveMemory?.(key, memory);
          this.deps.log({
            timestamp: isoTimestamp(this.clock),
            projectKey,
            runId,
            phase: state.phase,
            observedStatus: "unobservable",
            action: "backoff",
            reason: `observation failed: ${(error as Error).message}`,
            outcome: "failed",
          });
          decisions.push({ projectKey, runId, action: "backoff", reason: "observation failed" });
          shortestDelay = Math.min(shortestDelay, memory.backoffMs);
          continue;
        }

        // Two different questions, and they were answered by one branch.
        //
        // "Is this session alive" is answered by either signal: new output is a
        // sign of life even when no state was committed, so it resets the stall
        // clock and the backoff.
        //
        // "Has this orchestrator acted on what we told it" is answered only by
        // the state version moving. A wake writes its own prompt into the pane,
        // so keying the guard on output meant the wake refreshed the permission
        // to wake: a wedged orchestrator got one unsolicited prompt per stall
        // deadline, forever, on a `stateVersion` that never changed. §50 allows
        // one wake per completion event. The same trap was already found for
        // `surfacedForStateVersion`, and the same answer applies to it.
        if (observation.progressed || observation.outputAdvanced) {
          memory.lastProgressAtMs = this.clock.now();
          memory.backoffMs = this.pollMs();
        }
        if (observation.progressed) {
          memory.lastStateVersion = state.stateVersion;
          delete memory.wakeSentForStateVersion;
          delete memory.surfacedForStateVersion;
        }

        const decision = decideAction(observation, memory, {
          stallDeadlineMs: this.stallDeadlineMs,
          ...(this.deps.quotaResumeAtMs
            ? { quotaResumeAtMs: this.deps.quotaResumeAtMs(state, this.clock.now()) }
            : {}),
          nowMs: this.clock.now(),
          ...(capabilityRegression.length > 0 ? { capabilityRegression } : {}),
        });

        const outcome = await this.perform(observation, decision, memory);
        this.deps.saveMemory?.(key, memory);
        decisions.push({ projectKey, runId, ...decision });

        this.deps.log({
          timestamp: isoTimestamp(this.clock),
          projectKey,
          runId,
          phase: state.phase,
          observedStatus: observation.orchestratorStatus,
          action: decision.action,
          reason: decision.reason,
          outcome,
        });

        shortestDelay = Math.min(
          shortestDelay,
          decision.action === "backoff" ? memory.backoffMs : this.pollMs(),
        );
      }
    }

    return {
      observations,
      decisions,
      nextDelayMs: observations === 0 ? this.pollMs() : shortestDelay,
    };
  }

  /** §M-WATCHDOG — Ask a running loop to finish its current tick and exit. */
  stop(): void {
    this.stopped = true;
  }

  /**
   * §M-WATCHDOG — Run until stopped, or for a bounded number of ticks in tests.
   *
   * A disabled config returns immediately: opting out must cost nothing, not
   * even a polling loop.
   */
  async run(maxTicks = Number.POSITIVE_INFINITY): Promise<number> {
    if (!this.deps.config.enabled) return 0;
    let ticks = 0;
    while (!this.stopped && ticks < maxTicks) {
      const report = await this.tick();
      ticks += 1;
      if (this.stopped || ticks >= maxTicks) break;
      await this.clock.sleep(report.nextDelayMs);
    }
    return ticks;
  }
}
