/**
 * §M-WATCHDOG-DECIDE — What the watchdog decides, and the shapes it decides from.
 *
 * Implements §A-DETERMINISTIC-WATCHDOG. Kept apart from the loop that carries
 * the decisions out because the two are judged differently: this half is pure
 * and exhaustively testable against a fake clock, while the other half talks to
 * a backend. A recovery policy that can only be exercised through a live
 * adapter is a recovery policy nobody exercises.
 */

import { isPaused, isTerminal } from "../core/fsm.mjs";
import type {
  ReconcileResult,
  RunState,
  SessionStatus,
  TailClassification,
  WatchdogAction,
} from "../core/types.mjs";

/**
 * §M-WATCHDOG-DECIDE — Marks a decision reason as a capability regression.
 *
 * The reason string is the channel between the decision and the message that
 * gets delivered, so the prefix is shared rather than written out twice; the
 * two copies had already drifted apart once.
 */
export const REGRESSION_PREFIX = "backend capability regression: ";

/**
 * §M-WATCHDOG-DECIDE — How long a settled orchestrator may sit idle before a wake.
 *
 * Long by design: a productive review or E2E loop can be quiet for minutes, and
 * waking an orchestrator that is merely thinking wastes tokens and can
 * interleave two instructions.
 */
export const DEFAULT_STALL_DEADLINE_MS = 15 * 60 * 1000;

/** §M-WATCHDOG-DECIDE — One line of the durable, transcript-free watchdog log. */
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

/** §M-WATCHDOG-DECIDE — What the watchdog learned about one run in one tick. */
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

/** §M-WATCHDOG-DECIDE — A chosen action with the evidence behind it. */
export interface WatchdogDecision {
  action: WatchdogAction;
  reason: string;
}

/**
 * §M-WATCHDOG-DECIDE — Per-run memory that makes actions idempotent across ticks.
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
  /**
   * Set when the bookkeeping file could not be read at all, as opposed to
   * holding no record for this run.
   *
   * The two were indistinguishable, and the difference is the whole guard: a
   * corrupt `watchdog-memory.json` answered "no wake has been sent to any run",
   * which is the one answer that causes an effect — an unsolicited prompt into
   * every live orchestrator's context. `memoryFor` consumes this flag and seeds
   * the slot as though a wake had already gone out for the state as it stands,
   * so the loss costs at most one stalled cycle, logged, instead of a duplicate.
   */
  dedupeLost?: boolean;
}


/**
 * §M-WATCHDOG-DECIDE — Choose an action from an observation.
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
