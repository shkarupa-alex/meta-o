/**
 * §M-HERDR — `SessionAdapter` implemented over the real Herdr CLI.
 *
 * Implements §A-BACKEND-CONTRACT for the first supported backend. Herdr owns
 * panes, agent lifecycle, detection and native resume; this adapter translates
 * that vocabulary into the workflow's, and — more importantly — is honest about
 * where Herdr offers no equivalent. Herdr has no idempotency key and no durable
 * delivery receipt, so `reconcile` here is evidence-based: it compares the
 * agent's monotonic `state_change_seq` and inspects the pane tail, and returns
 * `unknown` rather than guessing. That is what keeps a crash from turning into
 * a duplicated prompt.
 *
 * Every command is invoked with an argument array, never a shell string.
 */

import { canonicalize, type JsonValue } from "../core/canonical-json.mjs";
import { redact } from "../core/redact.mjs";
import {
  agentNameFor,
  decodeSessionId,
  defaultExec,
  defaultModelArgs,
  encodeSessionId,
  HerdrCommandError,
  markerOf,
  parseProbe,
  type HerdrExec,
  type HerdrProbe,
} from "./herdr-protocol.mjs";
import { type Clock, systemClock } from "../core/clock.mjs";
import { buildCapabilityReport, entry } from "./adapter.mjs";
import type {
  AdapterCapabilities,
  CapabilityMatrixEntry,
  CapabilityReport,
  DeliveryResult,
  ExpectedState,
  ModelRef,
  PendingOperation,
  ReconcileResult,
  Role,
  SessionAdapter,
  SessionOutput,
  SessionRef,
  SessionStatus,
  SpawnRequest,
  WaitResult,
} from "../core/types.mjs";

/** §M-HERDR — Herdr's own agent lifecycle vocabulary. */
export type HerdrAgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

/** §M-HERDR — Subset of Herdr's `AgentInfo` this adapter depends on. */
export interface HerdrAgentInfo {
  pane_id: string;
  agent_status: HerdrAgentStatus;
  name?: string | null;
  agent?: string | null;
  revision: number;
  state_change_seq?: number;
  interactive_ready?: boolean;
  launch_pending?: boolean;
  cwd?: string | null;
}

/** §M-HERDR — Tuning knobs and seams of the adapter. */
export interface HerdrAdapterOptions {
  binary?: string;
  exec?: HerdrExec;
  clock?: Clock;
  defaultTimeoutMs?: number;
  startupTimeoutMs?: number;
  readLines?: number;
  agentNamePrefix?: string;
  modelArgs?: (model: ModelRef) => string[];
  paneId?: string;
}

/**
 * §M-HERDR — Build the capability matrix from one reachability observation.
 *
 * A free function rather than a method: it needs nothing from the adapter but
 * the answer to "did the socket reply", and every row it writes is either that
 * answer or a fixed fact about what Herdr does not offer.
 */
function herdrCapabilityReport(reachable: boolean, detail: string): CapabilityReport {
  /** §M-HERDR — Grade a capability that only exists when the backend answered at all. */
  const live = (supported: string): CapabilityMatrixEntry =>
    reachable ? entry("supported", supported) : entry("unsupported", detail);

  return buildCapabilityReport("herdr", {
    deliveryReceipt: entry(
      "degraded",
      "agent prompt returns the updated AgentInfo but no receipt id that survives a crash",
    ),
    idempotencyKey: entry("unsupported", "herdr has no client-supplied idempotency key"),
    statusRead: live("agent get / agent read expose status, revision and pane text"),
    wait: live("agent wait supports settled states and --until with a timeout"),
    nativeResume: live("agents persist in panes across client detach and reattach"),
    stop: live("pane close terminates a session this adapter created"),
    concurrentSessions: live("independent panes host independent agents"),
  });
}

/**
 * §M-HERDR — Error codes that prove a prompt was refused before it was acted on.
 *
 * A closed set, because the default has to be `unknown`. Exit status 1 covers a
 * refused request, a server that died mid-request and a connection that dropped
 * after the prompt landed — and only the first of those is safe to treat as
 * "nothing happened".
 */
const REFUSAL_CODES = new Set([
  "agent_not_found",
  "agent_busy",
  "invalid_argument",
  "pane_not_found",
  "cli_syntax_error",
]);

/**
 * §M-HERDR — The Herdr backend adapter.
 *
 * Deliberately stateless beyond its options: everything needed to address a
 * session lives in the `SessionRef`, so a fresh orchestrator process can drive
 * sessions started by a dead one.
 */
export class HerdrAdapter implements SessionAdapter {
  /** §M-HERDR — How CLI commands are actually run; injectable so tests need no server. */
  private readonly exec: HerdrExec;

  /** §M-HERDR — Time source, so waits and deadlines are testable without sleeping. */
  private readonly clock: Clock;

  /** §M-HERDR — Budget for ordinary commands, after which the call is a failure, not a hang. */
  private readonly defaultTimeoutMs: number;

  /** §M-HERDR — Separate, longer budget for agent startup, which is legitimately slow. */
  private readonly startupTimeoutMs: number;

  /** §M-HERDR — How much pane tail to read; enough for evidence, bounded against a flood. */
  private readonly readLines: number;

  /** §M-HERDR — Agent-name prefix, so this run's agents are distinguishable from a user's own. */
  private readonly prefix: string;

  /** §M-HERDR — Route-specific launch arguments for a model, kept injectable per backend build. */
  private readonly modelArgs: (model: ModelRef) => string[];

  /** §M-HERDR — Pane to split from, when the caller is itself running inside one. */
  private readonly paneId: string | undefined;

  /** §M-HERDR — Wire up the runner and the tunables the CLI needs. */
  constructor(options: HerdrAdapterOptions = {}) {
    this.exec = options.exec ?? defaultExec(options.binary ?? "herdr");
    this.clock = options.clock ?? systemClock;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 60_000;
    this.readLines = options.readLines ?? 400;
    this.prefix = options.agentNamePrefix ?? "mo-";
    this.modelArgs = options.modelArgs ?? defaultModelArgs;
    this.paneId = options.paneId ?? process.env["HERDR_PANE_ID"];
  }

  /**
   * §M-HERDR — Run one CLI command and unwrap its JSON envelope.
   *
   * Herdr reports server errors as JSON on stderr with exit 1 and syntax errors
   * with exit 2; conflating them would hide adapter bugs behind transient
   * backend failures.
   */
  private async call(args: string[], timeoutMs?: number): Promise<Record<string, unknown>> {
    const result = await this.exec(args, timeoutMs ?? this.defaultTimeoutMs);
    if (result.code !== 0) {
      let code = result.code === 2 ? "cli_syntax_error" : "herdr_error";
      let message = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
      try {
        const parsed = JSON.parse(result.stderr) as { error?: { code?: string; message?: string } };
        if (parsed.error) {
          code = parsed.error.code ?? code;
          message = parsed.error.message ?? message;
        }
      } catch {
        /* stderr was not JSON; keep the raw text */
      }
      throw new HerdrCommandError(args, code, result.code, message);
    }
    const text = result.stdout.trim();
    if (text === "") return {};
    try {
      const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
      return parsed.result ?? {};
    } catch (error) {
      throw new HerdrCommandError(args, "unparsable_response", 0, (error as Error).message);
    }
  }

  /** §M-HERDR — Fetch one agent's info, or `undefined` when no such live agent exists. */
  private async agentInfo(target: string): Promise<HerdrAgentInfo | undefined> {
    try {
      const result = await this.call(["agent", "get", target], 15_000);
      return result["agent"] as HerdrAgentInfo | undefined;
    } catch (error) {
      if (error instanceof HerdrCommandError && error.exitCode === 1) return undefined;
      throw error;
    }
  }

  /** §M-HERDR — Whether a pane still exists. */
  private async paneExists(paneId: string): Promise<boolean> {
    try {
      await this.call(["pane", "get", paneId], 15_000);
      return true;
    } catch (error) {
      if (error instanceof HerdrCommandError && error.exitCode === 1) return false;
      throw error;
    }
  }

  /**
   * §M-HERDR — Grade what Herdr actually provides.
   *
   * One probe decides every live row: if the socket answers, the capabilities
   * that depend on it are present, and if it does not, none of them are. The
   * two static `unsupported`/`degraded` rows are the load-bearing honesty of
   * this adapter — no idempotency key and no durable receipt is exactly why the
   * orchestrator is required to reconcile rather than retry.
   */
  async capabilityReport(): Promise<CapabilityReport> {
    let detail = "socket API reachable";
    let reachable = true;
    try {
      await this.call(["agent", "list"], 15_000);
    } catch (error) {
      reachable = false;
      detail = `socket API unreachable: ${(error as Error).message}`;
    }
    return herdrCapabilityReport(reachable, detail);
  }

  /** §M-HERDR — Boolean capability view required by the adapter interface. */
  async capabilities(): Promise<AdapterCapabilities> {
    return (await this.capabilityReport()).capabilities;
  }

  /**
   * §M-HERDR — The agent name a spawn with this operation id will use.
   *
   * Exposed because the write-ahead record must be able to name the effect
   * *before* it happens: a crash between writing the intent and creating the
   * pane leaves nothing to look for otherwise, and `reconcile` would have to
   * answer `unknown` for a case that is in fact perfectly decidable.
   */
  expectedAgentName(role: Role, operationId: string): string {
    return agentNameFor(this.prefix, role, operationId);
  }

  /** §M-HERDR — Probe describing the agent a spawn is about to create. */
  spawnProbe(role: Role, operationId: string): string {
    const probe: HerdrProbe = { agentName: this.expectedAgentName(role, operationId) };
    return JSON.stringify(probe);
  }

  /**
   * §M-HERDR — Rebuild a session handle for an agent that already exists.
   *
   * Used after a reconcile proves a spawn was applied: the handle was lost with
   * the crashed process, but the agent it addresses is still running, and
   * starting a second one would be the duplicate this whole protocol forbids.
   */
  async findSession(
    agentName: string,
    role: Role,
    generation = 1,
  ): Promise<SessionRef | undefined> {
    const info = await this.agentInfo(agentName);
    if (!info) return undefined;
    return {
      backend: "herdr",
      sessionId: encodeSessionId(agentName, info.pane_id, true),
      role,
      generation,
    };
  }

  /**
   * §M-HERDR — Create a pane and start an agent in it.
   *
   * The initial prompt is *not* delivered here. Starting a session and giving
   * it work are two separately observable effects, and folding them into one
   * operation would make a crash between them unclassifiable — exactly the
   * ambiguity the no-blind-resend rule must avoid. The orchestrator follows a
   * spawn with a `send` carrying `SpawnRequest.prompt`.
   *
   * `onPaneCreated` exists because a spawn is itself two backend calls. The
   * pane id is unknowable until the first returns, so a probe written before
   * the whole operation cannot name it, and `reconcile` is then unable to prove
   * anything about a spawn that failed — which strands the run in
   * `PAUSED_BACKEND_UNCERTAIN`. Recording the pane the moment it exists closes
   * that gap.
   */
  async spawn(request: SpawnRequest, onPaneCreated?: (paneId: string) => Promise<void>): Promise<SessionRef> {
    const agentName = agentNameFor(this.prefix, request.role, request.operationId);

    const existing = await this.agentInfo(agentName);
    if (existing) {
      return {
        backend: "herdr",
        sessionId: encodeSessionId(agentName, existing.pane_id, true),
        role: request.role,
        generation: 1,
      };
    }

    const splitArgs = ["pane", "split", "--direction", "right", "--cwd", request.cwd, "--no-focus"];
    if (this.paneId) splitArgs.splice(2, 0, "--pane", this.paneId);
    else splitArgs.splice(2, 0, "--current");
    const split = await this.call(splitArgs, 30_000);
    const pane = split["pane"] as { pane_id?: string } | undefined;
    const paneId = pane?.pane_id;
    if (!paneId) throw new Error("herdr pane split did not return a pane id");
    if (onPaneCreated) await onPaneCreated(paneId);

    await this.call(
      [
        "agent",
        "start",
        agentName,
        "--kind",
        request.model.route,
        "--pane",
        paneId,
        "--timeout",
        String(this.startupTimeoutMs),
        "--",
        ...this.modelArgs(request.model),
      ],
      this.startupTimeoutMs + 15_000,
    );

    return {
      backend: "herdr",
      sessionId: encodeSessionId(agentName, paneId, true),
      role: request.role,
      generation: 1,
    };
  }

  /**
   * §M-HERDR — Capture pre-call evidence for a side effect.
   *
   * Written into `PendingOperation.probe` before the call, which is the only
   * way a fresh orchestrator can later tell "delivered" from "never sent".
   */
  async prepareProbe(session: SessionRef, message?: string): Promise<string> {
    const { agentName, paneId } = decodeSessionId(session.sessionId);
    const info = await this.agentInfo(agentName);
    const probe: HerdrProbe = {
      paneId,
      agentName,
      ...(info?.state_change_seq !== undefined ? { seq: info.state_change_seq } : {}),
      ...(message ? { marker: markerOf(message) } : {}),
    };
    return canonicalize(probe as unknown as JsonValue);
  }

  /**
   * §M-HERDR — Deliver a prompt and wait for the turn to settle.
   *
   * `--wait` is used rather than a bare submit so that a delivery which never
   * changed the agent's lifecycle surfaces as `agent_prompt_stalled` instead of
   * silently succeeding.
   */
  async send(session: SessionRef, operationId: string, message: string): Promise<DeliveryResult> {
    const { agentName } = decodeSessionId(session.sessionId);
    try {
      const result = await this.call([
        "agent",
        "prompt",
        agentName,
        message,
        "--wait",
        "--timeout",
        String(this.defaultTimeoutMs),
      ]);
      const info = result["agent"] as HerdrAgentInfo | undefined;
      return {
        operationId,
        status: "acknowledged",
        receipt: canonicalize({
          seq: info?.state_change_seq ?? null,
          revision: info?.revision ?? null,
          status: info?.agent_status ?? null,
        } as unknown as JsonValue),
      };
    } catch (error) {
      if (error instanceof HerdrCommandError && error.code === "agent_prompt_stalled") {
        return { operationId, status: "unknown", receipt: error.code };
      }
      if (error instanceof HerdrCommandError && REFUSAL_CODES.has(error.code)) {
        return { operationId, status: "rejected", receipt: error.code };
      }
      // Everything else is `unknown`, including a bare exit 1. The backend may
      // have applied the prompt and then lost the connection; treating that as
      // a refusal cleared the write-ahead record and invited the resend this
      // whole protocol exists to prevent.
      if (error instanceof HerdrCommandError) {
        return { operationId, status: "unknown", receipt: error.code };
      }
      throw error;
    }
  }

  /**
   * §M-HERDR — Map Herdr's lifecycle onto the workflow's session status.
   *
   * `idle` and `done` both mean "settled, ready for input", which is `waiting`
   * for a worker that can still be given another turn; `complete` is reserved
   * for an agent that has actually exited while its pane survives.
   */
  async status(session: SessionRef): Promise<SessionStatus> {
    const { agentName, paneId } = decodeSessionId(session.sessionId);
    const info = await this.agentInfo(agentName);
    if (!info) return (await this.paneExists(paneId)) ? "complete" : "stopped";
    if (info.launch_pending === true || info.interactive_ready === false) return "starting";
    switch (info.agent_status) {
      case "working":
        return "running";
      case "blocked":
      case "idle":
      case "done":
        return "waiting";
      default:
        return "unknown";
    }
  }

  /**
   * §M-HERDR — Read recent output from the session's pane.
   *
   * Herdr exposes a monotonic pane `revision` but no byte cursor, so the cursor
   * returned here is that revision and reads are not true deltas. Callers get
   * the recent tail with `truncated` folded into `terminal` only through
   * `status`; pretending otherwise would invent an incremental protocol Herdr
   * does not have.
   */
  async read(session: SessionRef, cursor?: string): Promise<SessionOutput> {
    const { agentName } = decodeSessionId(session.sessionId);
    const result = await this.call([
      "agent",
      "read",
      agentName,
      "--source",
      "recent-unwrapped",
      "--lines",
      String(this.readLines),
      "--format",
      "text",
    ]);
    const read = result["read"] as { text?: string; revision?: number } | undefined;
    const revision = read?.revision ?? 0;
    const status = await this.status(session);
    const unchanged = cursor !== undefined && cursor === String(revision);
    return {
      cursor: String(revision),
      text: unchanged ? "" : redact(read?.text ?? ""),
      terminal: status === "complete" || status === "stopped" || status === "failed",
    };
  }

  /**
   * §M-HERDR — Wait for a settled state, or poll for termination.
   *
   * Herdr can wait for lifecycle states but not for "this agent has exited", so
   * a terminal wait is implemented by polling status until the deadline. The
   * deadline always wins: an unbounded wait would defeat the FSM stall rule.
   */
  async wait(session: SessionRef, expected: ExpectedState): Promise<WaitResult> {
    const deadline = Date.parse(expected.deadlineAt);
    const budget = Number.isFinite(deadline)
      ? Math.max(1_000, deadline - this.clock.now())
      : this.defaultTimeoutMs;

    if (!expected.terminal) {
      const { agentName } = decodeSessionId(session.sessionId);
      try {
        await this.call(["agent", "wait", agentName, "--timeout", String(budget)], budget + 15_000);
      } catch (error) {
        if (!(error instanceof HerdrCommandError)) throw error;
      }
      return { status: await this.status(session) };
    }

    for (;;) {
      const status = await this.status(session);
      if (status === "complete" || status === "stopped" || status === "failed") return { status };
      if (Number.isFinite(deadline) && this.clock.now() >= deadline) return { status };
      await this.clock.sleep(2_000);
    }
  }

  /**
   * §M-HERDR — Confirm a session is still usable.
   *
   * Herdr resumes agents natively, so resuming is an observation rather than an
   * action; a session whose agent is gone must be replaced by a new generation,
   * which is the caller's decision, not this adapter's.
   */
  async resume(session: SessionRef): Promise<SessionRef> {
    const { agentName } = decodeSessionId(session.sessionId);
    const info = await this.agentInfo(agentName);
    if (!info) throw new Error(`herdr session ${agentName} is gone and cannot be resumed`);
    return session;
  }

  /**
   * §M-HERDR — Determine what became of an interrupted side effect.
   *
   * Returns `unknown` whenever the evidence is genuinely ambiguous. That is not
   * a failure of this function: an unknown effect pauses the run, which is
   * strictly better than duplicating a worker or a prompt.
   */
  async reconcile(operation: PendingOperation): Promise<ReconcileResult> {
    const probe = parseProbe(operation.probe);

    if (operation.kind === "wait") {
      return { operationId: operation.operationId, effect: "applied" };
    }

    const agentName = probe.agentName;
    if (!agentName) return { operationId: operation.operationId, effect: "unknown" };

    const info = await this.agentInfo(agentName);

    if (operation.kind === "spawn") {
      if (info) return { operationId: operation.operationId, effect: "applied" };
      if (!probe.paneId) {
        // No agent, and the probe never recorded a pane — so `pane split` never
        // returned, and nothing this operation would have created exists. A
        // retry cannot duplicate a worker that was never started.
        return { operationId: operation.operationId, effect: "not_applied" };
      }
      if (!(await this.paneExists(probe.paneId))) {
        return { operationId: operation.operationId, effect: "not_applied" };
      }
      // The pane exists but carries no agent: `agent start` may still be racing
      // to register, and answering `not_applied` here is how a duplicate worker
      // gets created.
      return { operationId: operation.operationId, effect: "unknown" };
    }

    if (operation.kind === "stop") {
      return {
        operationId: operation.operationId,
        effect: info ? "not_applied" : "applied",
      };
    }

    if (!info) return { operationId: operation.operationId, effect: "unknown" };

    // A moved `state_change_seq` is not evidence that *this* prompt landed. It
    // advances on any lifecycle change, so a worker finishing the turn it was
    // already running looked exactly like a delivery — and the instruction that
    // never arrived was marked applied and dropped. The marker is the only
    // thing that names this operation; where one exists, it decides.
    const advanced = probe.seq !== undefined && (info.state_change_seq ?? 0) > probe.seq;
    if (advanced && !probe.marker) {
      return { operationId: operation.operationId, effect: "unknown" };
    }

    if (probe.marker) {
      try {
        const output = await this.read({
          backend: "herdr",
          sessionId: encodeSessionId(agentName, info.pane_id, false),
          role: "executor",
          generation: 1,
        });
        if (output.text.includes(probe.marker)) {
          return { operationId: operation.operationId, effect: "applied" };
        }
        // A settled worker whose visible output never mentions the marker did
        // not receive it — unless the session moved on since the probe, in
        // which case the marker may simply have scrolled out of the tail. That
        // is ambiguous, and ambiguous is `unknown`.
        if (info.agent_status === "idle" || info.agent_status === "done") {
          return { operationId: operation.operationId, effect: advanced ? "unknown" : "not_applied" };
        }
      } catch {
        return { operationId: operation.operationId, effect: "unknown" };
      }
    }

    return { operationId: operation.operationId, effect: "unknown" };
  }

  /**
   * §M-HERDR — Terminate a session this adapter created.
   *
   * Only panes marked as owned are closed; a pane the adapter merely borrowed
   * belongs to the user, and closing it would destroy their work.
   */
  async stop(session: SessionRef): Promise<"stopped" | "already_terminal" | "unknown"> {
    const { agentName, paneId, ownedPane } = decodeSessionId(session.sessionId);
    const info = await this.agentInfo(agentName);
    if (!info) return "already_terminal";
    if (!ownedPane) return "unknown";
    try {
      await this.call(["pane", "close", paneId], 30_000);
      return "stopped";
    } catch (error) {
      if (error instanceof HerdrCommandError && error.exitCode === 1) return "unknown";
      throw error;
    }
  }
}

/** §M-HERDR — Matrix entry shape, aliased for readability inside the grading table. */
type CapabilityGradeDetail = ReturnType<typeof entry>;
