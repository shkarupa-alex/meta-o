/**
 * §M-HERDR-EVIDENCE — What a probe's evidence proves about a Herdr prompt.
 *
 * Implements §A-BACKEND-CONTRACT. Separated from the adapter so that the
 * decision cannot reach the backend: everything it may consider is a parameter,
 * which is what keeps a reconcile from quietly becoming another side effect.
 */

import { parseProbe, type HerdrAgentInfo, type HerdrProbe } from "./herdr-protocol.mjs";
import type { PendingOperation, ReconcileResult, SessionOutput } from "../core/types.mjs";

/**
 * §M-HERDR-EVIDENCE — Decide what became of a prompt from the evidence the probe left.
 *
 * A free function because it must not be able to reach the adapter: everything
 * it may consider is passed in, so a future change cannot quietly let it issue
 * another call and turn a reconcile into a side effect.
 */
export async function deliveryEffect(
  info: HerdrAgentInfo,
  probe: HerdrProbe,
  readPane: (paneId: string) => Promise<SessionOutput>,
): Promise<ReconcileResult["effect"]> {
  // A moved `state_change_seq` is not evidence that *this* prompt landed. It
  // advances on any lifecycle change, so a worker finishing the turn it was
  // already running looked exactly like a delivery — and the instruction that
  // never arrived was marked applied and dropped. The marker is the only thing
  // that names this operation; where one exists, it decides.
  const advanced = probe.seq !== undefined && (info.state_change_seq ?? 0) > probe.seq;
  if (advanced && !probe.marker) return "unknown";
  if (!probe.marker) return "unknown";

  try {
    const output = await readPane(info.pane_id);
    if (output.text.includes(probe.marker)) return "applied";
    // A settled worker whose visible output never mentions the marker did not
    // receive it — unless the session moved on since the probe, in which case
    // the marker may simply have scrolled out of the tail. That is ambiguous,
    // and ambiguous is `unknown`.
    if (info.agent_status === "idle" || info.agent_status === "done") {
      return advanced ? "unknown" : "not_applied";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

/**
 * §M-HERDR-EVIDENCE — Everything reconciliation is allowed to observe or do.
 *
 * Passed in for the same reason `deliveryEffect`'s inputs are: the decision
 * must not be able to reach the backend on its own. The one effect it may cause
 * — closing a pane it has just proved carries no agent — is here as a named
 * capability rather than as access to the adapter's `call`, so what a reconcile
 * can do to the world is readable from this interface alone.
 */
export interface ReconcileContext {
  agentInfo(agentName: string): Promise<HerdrAgentInfo | undefined>;
  paneExists(paneId: string): Promise<boolean>;
  closePane(paneId: string): Promise<void>;
  readPane(agentName: string, paneId: string): Promise<SessionOutput>;
  now(): number;
  spawnRaceWindowMs: number;
}

/**
 * §M-HERDR-EVIDENCE — Whether `agent start` can still be racing to register.
 *
 * An absent or unparseable `preparedAt` is treated as still racing, because
 * guessing the other way would close a pane an agent might be seconds from
 * claiming.
 */
function raceIsOver(operation: PendingOperation, context: ReconcileContext): boolean {
  const prepared = Date.parse(operation.preparedAt ?? "");
  if (!Number.isFinite(prepared)) return false;
  return context.now() >= prepared + context.spawnRaceWindowMs;
}

/**
 * §M-HERDR-EVIDENCE — Decide what became of an interrupted spawn.
 *
 * Split out from `reconcileOperation` because a spawn is the one operation with
 * two separately observable effects — a pane and an agent in it — and therefore
 * the only one whose evidence has a middle case.
 */
async function spawnEffect(
  operation: PendingOperation,
  probe: HerdrProbe,
  hasAgent: boolean,
  context: ReconcileContext,
): Promise<ReconcileResult["effect"]> {
  if (hasAgent) return "applied";
  if (!probe.paneId) {
    // No agent, and the probe never recorded a pane. `not_applied` is right
    // about the operation — no worker was started, so a retry cannot duplicate
    // one — but it is not the same as "nothing exists": `pane split` may have
    // returned into a process that died before the record caught up, and that
    // pane is not nameable by anything. See `docs/knowledge/architecture/
    // backend.md` for why closing it needs a capability Herdr does not offer.
    return "not_applied";
  }
  if (!(await context.paneExists(probe.paneId))) return "not_applied";

  // The pane exists but carries no agent: `agent start` may still be racing to
  // register, and answering `not_applied` here is how a duplicate worker gets
  // created. But the race is bounded — by exactly the two budgets `startAgent`
  // is given — and answering `unknown` past that bound wedged the run for good.
  // `session reconcile` forced it to PAUSED_BACKEND_UNCERTAIN, `run pending
  // --clear` refused the effect as unproven, spawn and stop both refused a
  // second operation, and the only escape was deleting the pane out of band,
  // which nothing told the operator to do.
  if (!raceIsOver(operation, context)) return "unknown";

  // Past the bound the answer is no longer ambiguous: nothing registered in
  // that pane and nothing now can. The pane is the adapter's own debris, closed
  // for the reason `spawn` closes it on a failed start — no agent was ever in
  // it, so nothing can be lost.
  await context.closePane(probe.paneId);
  return "not_applied";
}

/**
 * §M-HERDR-EVIDENCE — Determine what became of an interrupted side effect.
 *
 * Returns `unknown` whenever the evidence is genuinely ambiguous. That is not a
 * failure of this function: an unknown effect pauses the run, which is strictly
 * better than duplicating a worker or a prompt.
 */
export async function reconcileOperation(
  context: ReconcileContext,
  operation: PendingOperation,
): Promise<ReconcileResult> {
  const probe = parseProbe(operation.probe);
  const operationId = operation.operationId;

  if (operation.kind === "wait") return { operationId, effect: "applied" };

  const agentName = probe.agentName;
  if (!agentName) return { operationId, effect: "unknown" };

  const info = await context.agentInfo(agentName);

  if (operation.kind === "spawn") {
    return { operationId, effect: await spawnEffect(operation, probe, Boolean(info), context) };
  }
  if (operation.kind === "stop") {
    return { operationId, effect: info ? "not_applied" : "applied" };
  }

  if (!info) return { operationId, effect: "unknown" };
  const effect = await deliveryEffect(info, probe, (paneId) => context.readPane(agentName, paneId));
  return { operationId, effect };
}
