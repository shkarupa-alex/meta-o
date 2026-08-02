/**
 * §M-HERDR-EVIDENCE — What a probe's evidence proves about a Herdr prompt.
 *
 * Implements §A-BACKEND-CONTRACT. Separated from the adapter so that the
 * decision cannot reach the backend: everything it may consider is a parameter,
 * which is what keeps a reconcile from quietly becoming another side effect.
 */

import type { HerdrAgentInfo, HerdrProbe } from "./herdr-protocol.mjs";
import type { ReconcileResult, SessionOutput } from "../core/types.mjs";

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
