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
  /** The optional handoff, for the executor only: it is executor narrative. */
  handoff?: string;
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
 *
 * `handoff` is passed in rather than read here so this stays a pure function of
 * state, and it reaches the executor alone: it is the previous executor session's
 * narrative, which is the first thing §30 says a reviewer may not be given.
 */
export function roleView(state: RunState, role: Role, handoff?: string): RoleView {
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
    confirmations: visibleConfirmations(state, role),
    e2eScenarioStatus: state.e2eScenarioStatus,
    findings: visible.flatMap((slot) => open[slot] ?? []),
    withheld: [
      ...slots.filter((slot) => !visible.includes(slot) && (open[slot]?.length ?? 0) > 0),
      ...withheldVerdicts(state, role),
    ].filter((slot, index, all) => all.indexOf(slot) === index),
    ...(role === "executor" && handoff !== undefined ? { handoff } : {}),
    updatedAt: state.updatedAt,
  };
}

/**
 * §M-ROLE-VIEW — Hide one reviewer's verdict from the other.
 *
 * The findings were filtered and the verdicts were not, so a reviewer asking
 * for its own slice was told that the other had already passed and had already
 * called the selection plan complete. That is anchoring of the strongest kind:
 * it does not merely suggest what to find, it removes the need to form a
 * judgement at all — and §30 makes the plan verdict something each reviewer
 * must reach on its own.
 *
 * `qc`, `smoke` and `e2e` stay visible to everyone: they are facts about the
 * candidate, not another reviewer's opinion of it.
 */
function visibleConfirmations(state: RunState, role: Role): RunState["confirmations"] {
  const reviews = ["reviewerPrimary", "reviewerCrossVendor"] as const;
  if (!reviews.includes(role as (typeof reviews)[number])) return state.confirmations;
  const out: RunState["confirmations"] = {};
  for (const [gate, result] of Object.entries(state.confirmations)) {
    if (gate !== role && reviews.includes(gate as (typeof reviews)[number])) continue;
    out[gate as keyof RunState["confirmations"]] = result;
  }
  return out;
}

/** §M-ROLE-VIEW — Review slots whose verdict exists and is being kept from this role. */
function withheldVerdicts(state: RunState, role: Role): string[] {
  const reviews = ["reviewerPrimary", "reviewerCrossVendor"] as const;
  if (!reviews.includes(role as (typeof reviews)[number])) return [];
  return reviews.filter((gate) => gate !== role && state.confirmations[gate] !== undefined);
}

/** §M-ROLE-VIEW — Whether one findings slot belongs to the role asking for it. */
function isVisibleTo(slot: "reviewerPrimary" | "reviewerCrossVendor" | "e2e", role: Role): boolean {
  if (role === "executor" || role === "technicalAdjudicator") return true;
  if (role === "e2eTester") return slot === "e2e";
  if (role === "reuseResearcher") return false;
  return slot === role;
}
