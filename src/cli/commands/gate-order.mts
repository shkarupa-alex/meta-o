/**
 * §M-CLI-GATE-ORDER — When one gate may run relative to another.
 *
 * Implements §A-SNAPSHOT-ATTESTATION. Separate from the transition command
 * because the rule is about the *work*, not about the phase name: enforcing it
 * only where the phase changes left the command the E2E tester actually calls
 * free to bank a result the ordering forbids, and the two have to answer alike.
 */

import { attests } from "../../core/fsm.mjs";
import { fail } from "../args.mjs";
import type { RunState } from "../../core/types.mjs";

/**
 * §M-CLI-GATE-ORDER — Refuse to open the E2E loop before both reviews have passed.
 *
 * §30: "Heavy E2E начинается после PASS обоих reviewers." The router honoured
 * the second half of that rule — an E2E fix does not drag the run back into a
 * review round — by arming on `activeLoop.kind === "e2e"` alone, and nothing
 * checked how the loop came to be armed. A transition straight from
 * `REVIEW_STABILIZATION` with zero reviews recorded therefore prescribed the
 * full selected set against a candidate no reviewer had read. It could not
 * produce a false green, because completion still needs four attestations on
 * one digest; what it could do is spend a heavy suite twice.
 *
 * Re-entry from `LOCAL_QC` is the E2E fix's return leg and is allowed on the
 * strength of the loop already being open — the reviews that opened it are
 * `invalidated` by then precisely because the fix changed the content.
 */
export function assertE2eLoopMayOpen(state: RunState): void {
  if (state.activeLoop?.kind === "e2e") return;
  const digest = state.candidateSnapshot?.digest;
  const plan = state.e2ePlan?.planDigest;
  if (!digest || !plan) {
    fail("no_candidate", "the E2E loop needs a candidate and a sealed selection plan");
  }
  const missing = (["reviewerPrimary", "reviewerCrossVendor"] as const).filter(
    (gate) => !attests(state.confirmations[gate], digest!, plan),
  );
  if (missing.length > 0) {
    fail(
      "reviews_not_passed",
      `heavy E2E starts after both reviewers pass; ${missing.join(" and ")} ` +
        "have not passed on this snapshot and plan",
      { missingGates: missing },
    );
  }
}

