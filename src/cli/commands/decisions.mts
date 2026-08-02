/**
 * §M-CLI-DECISIONS — The run's record of choices somebody had to make.
 *
 * Implements §A-CRASH-RECOVERY. §20 lists "compact decisions" as a mandatory
 * element of `state.json` for one reason: a fresh orchestrator has to know what
 * was already settled, and an escalation remembered only in a transcript is an
 * escalation that gets asked again — or, worse, answered differently.
 */

import { isoTimestamp } from "../../core/clock.mjs";
import { redactDeep } from "../../core/redact.mjs";
import type { DecisionRecord } from "../../core/types.mjs";
import { identityOf, mutate } from "./run-context.mjs";
import { emit, fail, readStdinJson, requireFlag, type ParsedArgs } from "../args.mjs";

/** §M-CLI-DECISIONS — Categories a recorded decision may fall under. */
const DECISION_CATEGORIES: ReadonlySet<string> = new Set([
  "local_implementation",
  "architecture",
  "business_semantics",
  "irreversible",
  "external_dependency",
  "tooling",
]);

/** §M-CLI-DECISIONS — Who may be recorded as having taken a decision. */
const DECIDERS: ReadonlySet<string> = new Set(["orchestrator", "user", "technicalAdjudicator"]);

/**
 * §M-CLI-DECISIONS — Append one compact decision to the run's record.
 *
 * §20 lists "compact decisions" as a mandatory element of `state.json`, and
 * nothing could write one: the array was initialised empty and never touched
 * again, so the escalation record that is supposed to survive a crash did not
 * exist to survive. Append-only on purpose — a decision that can be edited
 * afterwards is a decision nobody has to stand behind.
 */
export async function commandRecordDecision(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const decision = redactDeep(await readStdinJson<DecisionRecord>());

  const errors: string[] = [];
  if (!decision.id) errors.push("id is required");
  if (!decision.question) errors.push("question is required");
  if (!decision.answer) errors.push("answer is required");
  if (!decision.rationale) errors.push("rationale is required");
  if (!DECISION_CATEGORIES.has(decision.category)) {
    errors.push(`category ${JSON.stringify(decision.category)} is not recognised`);
  }
  if (!DECIDERS.has(decision.decidedBy)) {
    errors.push(`decidedBy ${JSON.stringify(decision.decidedBy)} is not recognised`);
  }
  if (errors.length > 0) fail("invalid_decision", errors.join("; "));

  const next = await mutate(projectKey, runId, (state) => {
    if (state.decisions.some((existing) => existing.id === decision.id)) {
      fail("duplicate_decision", `this run already records decision ${decision.id}`);
    }
    return {
      ...state,
      decisions: [
        ...state.decisions,
        { ...decision, decidedAt: decision.decidedAt || isoTimestamp() },
      ],
    };
  });

  emit({ runId, decisionId: decision.id, decisions: next.decisions.length });
}

/**
 * §M-CLI-DECISIONS — Record that the user allowed this run's E2E set to touch production.
 *
 * Points at a decision already recorded rather than taking a flag, because the
 * decision is the artefact: §20 wants an explicit user choice, and a boolean
 * nobody has to justify is exactly what an unattended session would set.
 */
export async function commandApproveProductionE2e(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const decisionId = requireFlag(args, "decision-id");

  const next = await mutate(projectKey, runId, (state) => {
    const decision = state.decisions.find((item) => item.id === decisionId);
    if (!decision) fail("unknown_decision", `this run records no decision ${decisionId}`);
    if (decision.decidedBy !== "user") {
      fail(
        "not_a_user_decision",
        `decision ${decisionId} was taken by ${decision.decidedBy}; running against production ` +
          "is the user's call and nobody else's",
      );
    }
    return { ...state, productionE2eApproved: { decisionId, approvedAt: isoTimestamp() } };
  });

  emit({ runId, productionE2eApproved: next.productionE2eApproved });
}
