/**
 * §M-HERDR-STOP — Stop only Herdr panes the workflow owns.
 *
 * Implements §A-BACKEND-CONTRACT. Pane ownership survives in the encoded
 * session id; keeping the decision outside the adapter class makes the small
 * destructive boundary explicit and independently reviewable.
 */

import {
  decodeSessionId,
  HerdrCommandError,
  type HerdrAgentInfo,
} from "./herdr-protocol.mjs";
import type { SessionRef } from "../core/types.mjs";

/** §M-HERDR-STOP — Backend calls the ownership decision is allowed to make. */
export interface HerdrStopContext {
  agentInfo(agentName: string): Promise<HerdrAgentInfo | undefined>;
  closePane(paneId: string): Promise<void>;
}

/** §M-HERDR-STOP — Apply ownership and absence rules before closing a pane. */
export async function stopOwnedHerdrSession(
  context: HerdrStopContext,
  session: SessionRef,
): Promise<"stopped" | "already_terminal" | "unknown"> {
  const { agentName, paneId, ownedPane } = decodeSessionId(session.sessionId);
  const info = await context.agentInfo(agentName);
  if (!info) return "already_terminal";
  if (!ownedPane) return "unknown";
  try {
    await context.closePane(paneId);
    return "stopped";
  } catch (error) {
    if (error instanceof HerdrCommandError && error.exitCode === 1) return "unknown";
    throw error;
  }
}
