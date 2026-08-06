/**
 * §M-HERDR-PROTOCOL — The wire vocabulary of the Herdr CLI, apart from the adapter.
 *
 * Implements §A-BACKEND-CONTRACT. Two things live here that the adapter merely
 * uses: how a session is addressed across process restarts, and how a child
 * process is run and its failure read. Keeping them separate makes the adapter
 * readable as protocol rather than plumbing, and lets a second backend borrow
 * the encoding without borrowing the adapter.
 */

import { execFile } from "node:child_process";
import { sha256Hex } from "../core/hash.mjs";
import { redact } from "../core/redact.mjs";
import type { ModelRef } from "../core/types.mjs";

/** §M-HERDR-PROTOCOL — Result of one CLI invocation. */
export interface HerdrExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * §M-HERDR-PROTOCOL — Exit status of a finished child process.
 *
 * `execFile` reports a non-zero exit through `error.code`, a spawn failure
 * through an error with no numeric code, and success with no error at all;
 * collapsing the three into one number keeps every call site from re-deriving
 * the distinction and getting it subtly different.
 */
function exitCodeOf(error: unknown): number {
  if (!error) return 0;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : 1;
}

/** §M-HERDR-PROTOCOL — Injectable process runner, so the adapter is testable without a server. */
export type HerdrExec = (args: string[], timeoutMs: number) => Promise<HerdrExecResult>;
/** §M-HERDR-PROTOCOL — Raised when the CLI reports a structured error. */
export class HerdrCommandError extends Error {
  /** §M-HERDR-PROTOCOL — Herdr error code, when the CLI supplied one. */
  readonly code: string;
  /** §M-HERDR-PROTOCOL — Process exit status. */
  readonly exitCode: number;

  /** §M-HERDR-PROTOCOL — Preserve both codes so callers can distinguish syntax from server errors. */
  constructor(args: string[], code: string, exitCode: number, message: string) {
    super(`herdr ${args.join(" ")} failed (${code}): ${redact(message)}`);
    this.name = "HerdrCommandError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

/** §M-HERDR-PROTOCOL — Default runner, executing the real binary. */
export function defaultExec(binary: string): HerdrExec {
  return (args, timeoutMs) =>
    new Promise<HerdrExecResult>((resolvePromise) => {
      execFile(
        binary,
        args,
        { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" },
        (error, stdout, stderr) => {
          resolvePromise({ code: exitCodeOf(error), stdout: stdout ?? "", stderr: stderr ?? "" });
        },
      );
    });
}

/** §M-HERDR-PROTOCOL — Run the one CLI command whose success payload is terminal text. */
export async function callHerdrText(
  exec: HerdrExec,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  const result = await exec(args, timeoutMs);
  if (result.code !== 0) {
    const message = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
    throw new HerdrCommandError(
      args,
      result.code === 2 ? "cli_syntax_error" : "herdr_error",
      result.code,
      message,
    );
  }
  return result.stdout;
}

/**
 * §M-HERDR-PROTOCOL — Encode a session handle that survives a process restart.
 *
 * `SessionRef.sessionId` is all a fresh orchestrator gets, so it must carry the
 * pane, the agent name and whether this adapter created the pane; without the
 * ownership flag, `stop` could close a pane the user was working in.
 */
export function encodeSessionId(agentName: string, paneId: string, ownedPane: boolean): string {
  return `agent=${agentName};pane=${paneId};owned=${ownedPane ? "1" : "0"}`;
}

/** §M-HERDR-PROTOCOL — Decode a session handle produced by {@link encodeSessionId}. */
export function decodeSessionId(sessionId: string): {
  agentName: string;
  paneId: string;
  ownedPane: boolean;
} {
  const parts = new Map<string, string>();
  for (const chunk of sessionId.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) parts.set(chunk.slice(0, eq), chunk.slice(eq + 1));
  }
  const agentName = parts.get("agent") ?? "";
  const paneId = parts.get("pane") ?? "";
  if (agentName === "" || paneId === "") {
    throw new Error(`malformed herdr session id: ${sessionId}`);
  }
  return { agentName, paneId, ownedPane: parts.get("owned") === "1" };
}

/**
 * §M-HERDR-PROTOCOL — Derive a valid, deterministic agent name from a role and operation.
 *
 * Herdr requires `[a-z][a-z0-9_-]{0,31}` and uniqueness among live agents. The
 * name is derived from the operation id so that after a crash the same spawn
 * can be recognised instead of duplicated.
 */
export function agentNameFor(prefix: string, role: string, operationId: string): string {
  const roleSlug = role.replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 12);
  const suffix = sha256Hex(operationId).slice(0, 8);
  const name = `${prefix}${roleSlug}-${suffix}`.toLowerCase();
  const trimmed = name.slice(0, 32);
  return /^[a-z]/.test(trimmed) ? trimmed : `m${trimmed}`.slice(0, 32);
}

/** §M-HERDR-PROTOCOL — Evidence captured before a side effect, used by `reconcile`. */
export interface HerdrProbe {
  paneId?: string;
  agentName?: string;
  seq?: number;
  marker?: string;
}

/** §M-HERDR-PROTOCOL — Distinctive prefix of a message, used as delivery evidence. */
export function markerOf(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 48);
}

/** §M-HERDR-PROTOCOL — Begin prefix a worker joins with its turn id only in the final answer. */
export const RESULT_BEGIN_PREFIX = "META_O_RESULT_BEGIN";

/** §M-HERDR-PROTOCOL — End prefix a worker joins with its turn id only in the final answer. */
export const RESULT_END_PREFIX = "META_O_RESULT_END";

/** §M-HERDR-PROTOCOL — Add a UI-independent final-result contract to a worker prompt. */
export function frameTurnPrompt(message: string, turnId: string): string {
  return (
    `${message.trimEnd()}\n\n` +
    "After all reasoning and tool use is finished, emit the complete final response once, " +
    "inside a result envelope. " +
    "Build each marker by joining the named prefix, one ASCII space, and the turn token below. " +
    "Do not emit either assembled marker before the final response.\n" +
    `Begin prefix: ${RESULT_BEGIN_PREFIX}\n` +
    `End prefix: ${RESULT_END_PREFIX}\n` +
    `Turn token: ${turnId}\n` +
    "The assembled begin marker must be on its own line immediately before the response. " +
    "The assembled end marker must be on its own line immediately after it."
  );
}

/** §M-HERDR-PROTOCOL — Extract the last complete result envelope for one turn. */
export function extractTurnResult(
  transcript: string,
  turnId: string,
): string | undefined {
  const begin = `${RESULT_BEGIN_PREFIX} ${turnId}`;
  const end = `${RESULT_END_PREFIX} ${turnId}`;
  const endAt = transcript.lastIndexOf(end);
  if (endAt < 0) return undefined;
  const beginAt = transcript.lastIndexOf(begin, endAt);
  if (beginAt < 0) return undefined;

  let result = transcript.slice(beginAt + begin.length, endAt);
  result = result.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
  return result;
}

/** §M-HERDR-PROTOCOL — Parse the probe written before a side effect. */
export function parseProbe(raw: string | undefined): HerdrProbe {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as HerdrProbe;
  } catch {
    return {};
  }
}

/**
 * §M-HERDR-PROTOCOL — Default CLI arguments selecting a model for each agent kind.
 *
 * Kept overridable because model flags change faster than this methodology
 * does; a wrong flag must be fixable in configuration, not in a release.
 */
export function defaultModelArgs(model: ModelRef): string[] {
  switch (model.route) {
    case "claude":
      return ["--model", model.model];
    case "codex":
      return ["--model", model.model];
    case "opencode":
      return ["--model", model.providerId ? `${model.providerId}/${model.model}` : model.model];
    default:
      return [];
  }
}

/** §M-HERDR-PROTOCOL — Herdr's own agent lifecycle vocabulary. */
export type HerdrAgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

/** §M-HERDR-PROTOCOL — Subset of Herdr's `AgentInfo` this adapter depends on. */
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
