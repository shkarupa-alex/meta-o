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
import { isPaused, isTerminal } from "../core/fsm.mjs";
import type {
  PendingOperation,
  ReconcileResult,
  RunState,
  SessionStatus,
  TailClassification,
  WatchdogAction,
  WatchdogConfig,
} from "../core/types.mjs";

/** §M-WATCHDOG — Default poll interval when the config omits one. */
export const DEFAULT_POLL_SECONDS = 30;

/** §M-WATCHDOG — Default backoff ceiling when the config omits one. */
export const DEFAULT_MAX_BACKOFF_SECONDS = 300;

/**
 * §M-WATCHDOG — How long a settled orchestrator may sit idle before a wake.
 *
 * Long by design: a productive review or E2E loop can be quiet for minutes, and
 * waking an orchestrator that is merely thinking wastes tokens and can
 * interleave two instructions.
 */
export const DEFAULT_STALL_DEADLINE_MS = 15 * 60 * 1000;

/**
 * §M-WATCHDOG — Marks a decision reason as a capability regression.
 *
 * The reason string is the channel between the decision and the message that
 * gets delivered, so the prefix is shared rather than written out twice; the
 * two copies had already drifted apart once.
 */
export const REGRESSION_PREFIX = "backend capability regression: ";

/** §M-WATCHDOG — One line of the durable, transcript-free watchdog log. */
export interface WatchdogLogEntry {
  timestamp: string;
  projectKey: string;
  runId: string;
  phase: string;
  observedStatus: string;
  action: WatchdogAction;
  reason: string;
  outcome: "performed" | "skipped" | "failed" | "superseded";
}

/** §M-WATCHDOG — What the watchdog learned about one run in one tick. */
export interface WatchdogObservation {
  projectKey: string;
  runId: string;
  state: RunState;
  orchestratorStatus: SessionStatus | "absent" | "unregistered";
  reconcile?: ReconcileResult;
  progressed: boolean;
  idleForMs: number;
  /** How the orchestrator's own output tail reads, when it could be read. */
  tail?: TailClassification;
  /** Whether the session produced new output since the previous tick. */
  outputAdvanced?: boolean;
}

/** §M-WATCHDOG — A chosen action with the evidence behind it. */
export interface WatchdogDecision {
  action: WatchdogAction;
  reason: string;
}

/**
 * §M-WATCHDOG — Per-run memory that makes actions idempotent across ticks.
 *
 * Persisted through `loadMemory`/`saveMemory` rather than held only in RAM.
 * "One wake per completion event" and "exactly one new generation" are
 * acceptance criteria, and a criterion that holds only while a process survives
 * is one that fails on the first restart — which, for a component whose whole
 * job is unattended overnight recovery, is the normal case rather than the
 * exception.
 */
export interface RunMemory {
  lastStateVersion: number;
  lastProgressAtMs: number;
  backoffMs: number;
  wakeSentForStateVersion?: number;
  spawnedForGeneration?: number;
  surfacedForStateVersion?: number;
  /**
   * Which capability regression has already been reported to this run.
   *
   * Separate from `surfacedForStateVersion`, and deliberately not cleared when
   * the session produces output: surfacing *is* output, so keying the guard on
   * progress made the message re-send itself on every tick — roughly two
   * unsolicited prompts a minute into a live orchestrator's context.
   */
  surfacedRegression?: string;
  lastCursor?: string;
}

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
  loadMemory?(key: string): RunMemory | undefined;
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
 * §M-WATCHDOG — Choose an action from an observation.
 *
 * Pure, so every rule below is provable with a fake clock and a synthetic
 * state. The ordering encodes the safety argument: progress beats everything,
 * uncertainty is surfaced rather than resolved, a live orchestrator is never
 * replaced, and an *unknown* orchestrator status is treated as possibly-alive.
 */
export function decideAction(
  observation: WatchdogObservation,
  memory: RunMemory,
  options: {
    stallDeadlineMs: number;
    quotaResumeAtMs?: number;
    nowMs: number;
    capabilityRegression?: string[];
  },
): WatchdogDecision {
  const { state } = observation;

  if (isTerminal(state.phase)) {
    return { action: "noop", reason: `run is terminal (${state.phase})` };
  }

  if (options.capabilityRegression?.length) {
    const regression = options.capabilityRegression.join("; ");
    if (memory.surfacedRegression === regression) {
      return { action: "backoff", reason: "the capability regression is already surfaced" };
    }
    return { action: "surface_uncertainty", reason: `${REGRESSION_PREFIX}${regression}` };
  }

  if (observation.progressed) {
    return { action: "noop", reason: "state version advanced since the previous tick" };
  }

  if (observation.reconcile?.effect === "unknown") {
    if (memory.surfacedForStateVersion === state.stateVersion) {
      return { action: "backoff", reason: "the unprovable effect is already surfaced" };
    }
    return {
      action: "surface_uncertainty",
      reason: `pending ${state.pendingOperation?.kind ?? "operation"} cannot be proven applied or not applied`,
    };
  }

  if (state.phase === "PAUSED_QUOTA") {
    const resumeAt = options.quotaResumeAtMs;
    if (resumeAt !== undefined && options.nowMs < resumeAt) {
      return { action: "backoff", reason: "quota window has not reopened yet" };
    }
    if (resumeAt === undefined) {
      return { action: "backoff", reason: "quota reset time was not provably parsed" };
    }
  } else if (isPaused(state.phase)) {
    // The pause table gives the watchdog exactly one pause it may release. Every
    // other one is waiting on a person or an adjudicator, and waking the
    // orchestrator would either burn tokens re-discovering the same block or,
    // for PAUSED_ORCHESTRATOR_BUDGET, wake the very session that ran out of
    // context instead of leaving room for a fresh generation.
    return {
      action: "noop",
      reason: `${state.phase} is released by a user or adjudicator, not by the watchdog`,
    };
  }

  if (observation.tail === "quota" || observation.tail === "external") {
    return {
      action: "backoff",
      reason: `the orchestrator's last output reads as ${observation.tail}; waking it now would fail again`,
    };
  }

  switch (observation.orchestratorStatus) {
    case "starting":
    case "running":
      return { action: "noop", reason: "orchestrator session is working" };

    case "waiting": {
      // A pending operation carries the deadline of the thing actually being
      // waited for. Preferring it to the global constant is the difference
      // between "this backend call is overdue" and "fifteen minutes have passed
      // on the wall clock", which are not the same question and give opposite
      // answers for both a two-hour E2E run and a thirty-second send.
      const deadlineAt = Date.parse(state.pendingOperation?.deadlineAt ?? "");
      if (Number.isFinite(deadlineAt)) {
        if (options.nowMs < deadlineAt) {
          return {
            action: "noop",
            reason: `pending ${state.pendingOperation?.kind} has not reached its own deadline`,
          };
        }
      } else if (observation.idleForMs < options.stallDeadlineMs) {
        return {
          action: "noop",
          reason: `orchestrator settled ${Math.round(observation.idleForMs / 1000)}s ago, within the stall deadline`,
        };
      }
      if (observation.outputAdvanced) {
        return { action: "noop", reason: "the session produced new output since the previous tick" };
      }
      if (memory.wakeSentForStateVersion === state.stateVersion) {
        return {
          action: "backoff",
          reason: "a wake was already delivered for this state version",
        };
      }
      return {
        action: "wake_orchestrator",
        reason: "orchestrator is settled past the stall deadline with work outstanding",
      };
    }

    // Deliberately NOT alongside the terminal states below. "unregistered"
    // means this run never recorded an orchestrator handle, so the watchdog has
    // nothing to observe — which is ignorance, not proof of death. It used to
    // fall through to `absent`, and since a run driven by a human-started
    // orchestrator never registers one, the watchdog spawned a rival on its
    // very first tick, with no stall deadline consulted and both able to write.
    case "unregistered":
      return {
        action: "backoff",
        reason:
          "this run records no orchestrator session, so a live orchestrator cannot be " +
          "distinguished from a dead one; it must register itself with " +
          "`meta-o run set-session --role orchestrator` before the watchdog can recover it",
      };

    case "complete":
    case "failed":
    case "stopped":
    case "absent": {
      if (memory.spawnedForGeneration === state.orchestratorGeneration) {
        return {
          action: "backoff",
          reason: "a replacement generation was already created for this orchestrator",
        };
      }
      return {
        action: "spawn_orchestrator",
        reason: `previous orchestrator is provably ${observation.orchestratorStatus}`,
      };
    }

    default:
      return {
        action: "backoff",
        reason: "orchestrator status is unknown; a replacement must not be created",
      };
  }
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
  private memoryFor(key: string, state: RunState): RunMemory {
    const existing = this.memory.get(key) ?? this.deps.loadMemory?.(key);
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
          await this.deps.wakeOrchestrator(fresh);
          memory.wakeSentForStateVersion = fresh.stateVersion;
          return "performed";

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

    let capabilityRegression: string[] = [];
    try {
      capabilityRegression = (await this.deps.capabilityRegression?.()) ?? [];
    } catch {
      // A capability probe that itself fails is a backend problem, not a reason
      // to stop watching: the runs below still need their status observed.
      capabilityRegression = [];
    }

    for (const projectKey of this.deps.config.project_keys ?? []) {
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

        const memory = this.memoryFor(key, state);
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

        if (observation.progressed || observation.outputAdvanced) {
          memory.lastStateVersion = state.stateVersion;
          memory.lastProgressAtMs = this.clock.now();
          memory.backoffMs = this.pollMs();
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
