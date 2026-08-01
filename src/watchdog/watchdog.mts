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
import type {
  PendingOperation,
  ReconcileResult,
  RunState,
  SessionStatus,
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
  orchestratorStatus: SessionStatus | "absent";
  reconcile?: ReconcileResult;
  progressed: boolean;
  idleForMs: number;
}

/** §M-WATCHDOG — A chosen action with the evidence behind it. */
export interface WatchdogDecision {
  action: WatchdogAction;
  reason: string;
}

/** §M-WATCHDOG — Per-run memory that makes actions idempotent across ticks. */
export interface RunMemory {
  lastStateVersion: number;
  lastProgressAtMs: number;
  backoffMs: number;
  wakeSentForStateVersion?: number;
  spawnedForGeneration?: number;
}

/** §M-WATCHDOG — Everything the watchdog needs from the outside world. */
export interface WatchdogDeps {
  config: WatchdogConfig;
  clock?: Clock;
  stallDeadlineMs?: number;
  listRuns(projectKey: string): string[];
  readState(projectKey: string, runId: string): RunState | undefined;
  orchestratorStatus(state: RunState): Promise<SessionStatus | "absent">;
  reconcile(state: RunState, operation: PendingOperation): Promise<ReconcileResult>;
  wakeOrchestrator(state: RunState): Promise<void>;
  spawnOrchestrator(state: RunState): Promise<void>;
  log(entry: WatchdogLogEntry): void;
  quotaResumeAtMs?(state: RunState): number | undefined;
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
  options: { stallDeadlineMs: number; quotaResumeAtMs?: number; nowMs: number },
): WatchdogDecision {
  const { state } = observation;

  if (isTerminal(state.phase)) {
    return { action: "noop", reason: `run is terminal (${state.phase})` };
  }

  if (observation.progressed) {
    return { action: "noop", reason: "state version advanced since the previous tick" };
  }

  if (observation.reconcile?.effect === "unknown") {
    return {
      action: "surface_uncertainty",
      reason: `pending ${state.pendingOperation?.kind ?? "operation"} cannot be proven applied or not applied`,
    };
  }

  if (state.phase === "PAUSED_BACKEND_UNCERTAIN") {
    return { action: "noop", reason: "uncertainty is already surfaced to the user" };
  }

  if (state.phase === "PAUSED_QUOTA") {
    const resumeAt = options.quotaResumeAtMs;
    if (resumeAt !== undefined && options.nowMs < resumeAt) {
      return { action: "backoff", reason: "quota window has not reopened yet" };
    }
    if (resumeAt === undefined) {
      return { action: "backoff", reason: "quota reset time was not provably parsed" };
    }
  }

  switch (observation.orchestratorStatus) {
    case "starting":
    case "running":
      return { action: "noop", reason: "orchestrator session is working" };

    case "waiting": {
      if (observation.idleForMs < options.stallDeadlineMs) {
        return {
          action: "noop",
          reason: `orchestrator settled ${Math.round(observation.idleForMs / 1000)}s ago, within the stall deadline`,
        };
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
    const existing = this.memory.get(key);
    if (existing) return existing;
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
    const updatedAtMs = Date.parse(state.updatedAt);
    const referenceMs = Number.isFinite(updatedAtMs) ? updatedAtMs : memory.lastProgressAtMs;
    return {
      projectKey,
      runId,
      state,
      orchestratorStatus,
      ...(reconcile ? { reconcile } : {}),
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
          await this.deps.spawnOrchestrator(fresh);
          memory.spawnedForGeneration = fresh.orchestratorGeneration;
          return "performed";

        case "backoff":
          memory.backoffMs = Math.min(Math.max(memory.backoffMs, this.pollMs()) * 2, this.maxBackoffMs());
          return "performed";

        case "surface_uncertainty":
          await this.deps.wakeOrchestrator(fresh);
          return "performed";

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

    for (const projectKey of this.deps.config.project_keys) {
      let runIds: string[];
      try {
        runIds = this.deps.listRuns(projectKey);
      } catch {
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
          continue;
        }

        observations += 1;
        const observation = await this.observe(projectKey, runId, memory, state);

        if (observation.progressed) {
          memory.lastStateVersion = state.stateVersion;
          memory.lastProgressAtMs = this.clock.now();
          memory.backoffMs = this.pollMs();
          delete memory.wakeSentForStateVersion;
        }

        const decision = decideAction(observation, memory, {
          stallDeadlineMs: this.stallDeadlineMs,
          ...(this.deps.quotaResumeAtMs
            ? { quotaResumeAtMs: this.deps.quotaResumeAtMs(state) }
            : {}),
          nowMs: this.clock.now(),
        });

        const outcome = await this.perform(observation, decision, memory);
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
