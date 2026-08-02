/**
 * §M-ROLE-VIEW — The bounded slice of run state one worker role is entitled to.
 *
 * Implements §A-INDEPENDENT-REVIEW. §30 lists exactly what each reviewer
 * receives — the spec blob, the candidate and its digest, the diff and touched
 * knowledge, the QC manifest and result, the selection plan — and then says
 * what they must not receive: executor reasoning, implementation narrative, and
 * each other's findings. Two reviewers who have read each other are one
 * reviewer with extra steps, and the cross-vendor gate stops meaning anything.
 *
 * This is a boundary the workflow draws, not one it can enforce. Run state is a
 * readable file on the same machine, so an agent with a shell can always go
 * around it. What this removes is the accident: the reviewer who runs
 * `run show` to find the candidate digest and reads the other reviewer's
 * verdict on the way past.
 */

import type { FindingRecord, Role, RunState } from "./types.mjs";

/** §M-ROLE-VIEW — What a worker role may be told about the run it is serving. */
export interface RoleView {
  runId: string;
  role: Role;
  phase: RunState["phase"];
  specBlob: string;
  baseRevision: string;
  candidateSnapshot?: RunState["candidateSnapshot"];
  e2ePlan?: RunState["e2ePlan"];
  confirmations: RunState["confirmations"];
  e2eScenarioStatus?: RunState["e2eScenarioStatus"];
  /** Findings this role is answerable for: its own, or — for the executor — all of them. */
  findings: FindingRecord[];
  /** Named so a worker can tell "no findings yet" from "findings you may not see". */
  withheld: string[];
  updatedAt: string;
}

/**
 * §M-ROLE-VIEW — Project run state down to what one role may see.
 *
 * The executor receives every open finding, because every one of them is work
 * it has been asked to do, and the technical adjudicator receives them for the
 * same reason: it is called in to judge one, and cannot do that blind. The E2E
 * tester receives the findings its own run produced; the reuse researcher, who
 * works before there is a candidate, receives none. A reviewer receives its own
 * and is told, by name, which slots were withheld — silence there would read as
 * "the other reviewer found nothing", which is a different and much more
 * dangerous claim.
 */
export function roleView(state: RunState, role: Role): RoleView {
  const open = state.openFindings ?? {};
  const slots = ["reviewerPrimary", "reviewerCrossVendor", "e2e"] as const;
  const visible = slots.filter((slot) => isVisibleTo(slot, role));

  return {
    runId: state.runId,
    role,
    phase: state.phase,
    specBlob: state.specBlob,
    baseRevision: state.baseRevision,
    candidateSnapshot: state.candidateSnapshot,
    e2ePlan: state.e2ePlan,
    confirmations: state.confirmations,
    e2eScenarioStatus: state.e2eScenarioStatus,
    findings: visible.flatMap((slot) => open[slot] ?? []),
    withheld: slots.filter((slot) => !visible.includes(slot) && (open[slot]?.length ?? 0) > 0),
    updatedAt: state.updatedAt,
  };
}

/** §M-ROLE-VIEW — Whether one findings slot belongs to the role asking for it. */
function isVisibleTo(slot: "reviewerPrimary" | "reviewerCrossVendor" | "e2e", role: Role): boolean {
  if (role === "executor" || role === "technicalAdjudicator") return true;
  if (role === "e2eTester") return slot === "e2e";
  if (role === "reuseResearcher") return false;
  return slot === role;
}
