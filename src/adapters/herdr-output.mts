/**
 * §M-HERDR-OUTPUT — Recover one framed worker result from bounded terminal history.
 *
 * Implements §A-BACKEND-CONTRACT. Terminal UI belongs to Herdr and the model
 * clients; meta-o owns only the result envelope it adds to a turn. Keeping the
 * history-growth loop here prevents Claude, Codex or OpenCode rendering rules
 * from leaking into lifecycle management.
 */

import { extractTurnResult } from "./herdr-protocol.mjs";
import { decodeSessionId, type HerdrAgentInfo } from "./herdr-protocol.mjs";
import { redact } from "../core/redact.mjs";
import type { SessionOutput, SessionRef, SessionStatus } from "../core/types.mjs";

/** §M-HERDR-OUTPUT — Inputs needed to grow a recent-history snapshot. */
export interface CompleteTurnReadRequest {
  turnId: string;
  initialLines: number;
  maxLines: number;
  read(lines: number): Promise<string>;
}

/** §M-HERDR-OUTPUT — Result fields the adapter adds to its session observation. */
export interface CompleteTurnReadResult {
  text: string;
  complete: boolean;
  truncated: boolean;
  requestedLines: number;
  incompleteReason?: "history_truncated" | "result_envelope_missing";
}

/** §M-HERDR-OUTPUT — Expand internally, then expose only the selected envelope. */
export async function readCompleteTurnOutput(
  request: CompleteTurnReadRequest,
): Promise<CompleteTurnReadResult> {
  const ceiling = Math.max(request.initialLines, Math.floor(request.maxLines));
  let lines = request.initialLines;
  let previous: string | undefined;
  let transcript = "";

  for (;;) {
    transcript = await request.read(lines);
    if (previous !== undefined && transcript === previous) break;
    if (lines >= ceiling) {
      return {
        text: "",
        complete: false,
        truncated: true,
        requestedLines: lines,
        incompleteReason: "history_truncated",
      };
    }
    previous = transcript;
    lines = Math.min(lines * 2, ceiling);
  }

  const result = extractTurnResult(transcript, request.turnId);
  return {
    text: result ?? "",
    complete: result !== undefined,
    truncated: false,
    requestedLines: lines,
    ...(result === undefined ? { incompleteReason: "result_envelope_missing" as const } : {}),
  };
}

/** §M-HERDR-OUTPUT — Backend observations needed to recover a complete turn. */
export interface HerdrCompleteTurnRequest {
  session: SessionRef;
  turnId: string;
  initialLines: number;
  maxLines: number;
  status(session: SessionRef): Promise<SessionStatus>;
  agentInfo(agentName: string): Promise<HerdrAgentInfo | undefined>;
  readText(args: string[]): Promise<string>;
}

/** §M-HERDR-OUTPUT — Join lifecycle, history growth and envelope extraction. */
export async function readCompleteHerdrTurn(
  request: HerdrCompleteTurnRequest,
): Promise<SessionOutput> {
  const status = await request.status(request.session);
  const { agentName, paneId } = decodeSessionId(request.session.sessionId);
  if (status !== "waiting" && status !== "complete") {
    const revision = (await request.agentInfo(agentName))?.revision ?? 0;
    return {
      cursor: String(revision),
      text: "",
      terminal: false,
      complete: false,
      truncated: false,
      requestedLines: 0,
      turnId: request.turnId,
      incompleteReason: "agent_not_settled",
    };
  }

  const liveAgent = await request.agentInfo(agentName);
  const output = await readCompleteTurnOutput({
    turnId: request.turnId,
    initialLines: request.initialLines,
    maxLines: request.maxLines,
    read: (lines) =>
      request.readText([
        liveAgent ? "agent" : "pane",
        "read",
        liveAgent ? agentName : paneId,
        "--source",
        "recent-unwrapped",
        "--lines",
        String(lines),
        "--format",
        "text",
      ]),
  });
  const revision = (await request.agentInfo(agentName))?.revision ?? liveAgent?.revision ?? 0;
  return {
    cursor: String(revision),
    ...output,
    text: redact(output.text),
    terminal: status === "complete",
    turnId: request.turnId,
  };
}
