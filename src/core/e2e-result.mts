/**
 * §M-E2E-RESULT — What a run may accept as the E2E set's verdict.
 *
 * Implements §A-SNAPSHOT-ATTESTATION. §30 names the fields a result carries and
 * the plan it is judged against; keeping that judgement here rather than inside
 * a command means the answer cannot differ depending on which command asked.
 */

import type { E2EResult, E2ESelectionPlan } from "./types.mjs";

/**
 * §M-E2E-RESULT — Where an E2E set may say it ran.
 *
 * A closed set because `production` has to be nameable to be refusable: §20
 * forbids it without an explicit user decision, and while the result carried no
 * environment at all there was nothing for the rule to bite on.
 */
export const E2E_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "local",
  "ephemeral",
  "staging",
  "production",
]);

/**
 * §M-E2E-RESULT — Everything that makes an E2E result unusable as an attestation.
 *
 * One function, called by both commands that judge a result. `meta-o e2e result`
 * is what the tester's skill tells it to run before handing anything in, and it
 * used to check a strict subset of what `run record-e2e` checks — so it printed
 * `pass: true` for payloads the recording command then refused. A pre-flight
 * check more lenient than the gate it stands in front of is worse than none: it
 * tells the worker its result is acceptable, and the worker believes it.
 */
export function e2eResultErrors(
  result: E2EResult,
  snapshotDigest: string,
  plan: E2ESelectionPlan,
): string[] {
  const errors: string[] = [];
  if (!E2E_ENVIRONMENTS.has(result.environment)) {
    errors.push(
      `environment ${JSON.stringify(result.environment)} is not one of ` +
        [...E2E_ENVIRONMENTS].join("|"),
    );
  }
  if (result.snapshotDigest !== snapshotDigest) {
    errors.push(`result attests snapshot ${result.snapshotDigest}, candidate is ${snapshotDigest}`);
  }
  if (result.planDigest !== plan.planDigest) {
    errors.push(`result attests plan ${result.planDigest}, run holds ${plan.planDigest}`);
  }
  if (!Array.isArray(result.scenarios) || result.scenarios.length === 0) {
    errors.push("at least one executed scenario is required");
    return errors;
  }

  const executed = new Set<string>();
  for (const scenario of result.scenarios) {
    if (!["passed", "failed", "blocked"].includes(scenario.status)) {
      errors.push(`${scenario.scenarioId}: status ${JSON.stringify(scenario.status)} is not recognised`);
    }
    if (!scenario.evidence) errors.push(`${scenario.scenarioId}: evidence is required`);
    executed.add(scenario.scenarioId);
  }
  for (const id of plan.selectedScenarioIds) {
    if (!executed.has(id)) errors.push(`selected scenario ${id} was not executed`);
  }
  for (const id of executed) {
    if (!plan.selectedScenarioIds.includes(id)) errors.push(`scenario ${id} is not in the plan`);
  }

  // §30 lists the selection and its rationale among the fields a result carries,
  // and the skill tells the tester "the selection you actually ran is what the
  // plan-bound gates are checked against" — while nothing read either field. A
  // tester obeying the instruction gained nothing and one ignoring it lost
  // nothing. Held against the sealed plan rather than merely required, because
  // a copy that may disagree with the plan is worse than no copy at all.
  const claimed = [...new Set(result.selectedScenarioIds ?? [])].sort();
  const planned = [...plan.selectedScenarioIds].sort();
  if (claimed.length === 0) {
    errors.push("selectedScenarioIds is required: state which set this run actually executed");
  } else if (claimed.join(",") !== planned.join(",")) {
    errors.push(
      `result claims to have run ${claimed.join(", ")}; the sealed plan selects ${planned.join(", ")}`,
    );
  }
  if (!result.selectionRationale?.trim()) {
    errors.push("selectionRationale is required: say why this set is the right one for this change");
  }
  return errors;
}

