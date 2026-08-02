/**
 * §M-FINDINGS — Rules that make a review verdict mean something.
 *
 * Implements §A-INDEPENDENT-REVIEW. Two independent reviewers are the main
 * defence against a plausible but wrong implementation; that defence collapses
 * if a reviewer can pass a candidate with open defects, if taste can block, or
 * if the executor can close its own findings. Those three rules are mechanical,
 * so they are enforced here rather than trusted to a prompt.
 */

import type { Evidence, Finding, FindingRecord, ReviewResult, Role, SessionRef } from "./types.mjs";

/** §M-FINDINGS — Severities that may never be attached to taste. */
const DEFECT_SEVERITIES = new Set(["blocker", "major", "minor"]);

/** §M-FINDINGS — Classifications that must be fixed before a pass. */
const BLOCKING_CLASSIFICATIONS = new Set(["defect", "engineering_risk"]);

/**
 * §M-FINDINGS — The closed vocabularies a finding is written in.
 *
 * Checked explicitly rather than left to the type declaration, because every
 * finding entering this module came from a model through JSON, where the type
 * is advisory. An unrecognised classification would otherwise be waved through
 * by `validateFinding` and then silently dropped by `blockingFindings`, which
 * turns a typo into a blocker that does not block.
 */
const SEVERITIES: ReadonlySet<string> = new Set(["blocker", "major", "minor", "suggestion"]);

/** §M-FINDINGS — How serious a finding claims to be. */
const CLASSIFICATIONS: ReadonlySet<string> = new Set(["defect", "engineering_risk", "taste"]);

/** §M-FINDINGS — Kinds of artefact a reviewer may point at as evidence. */
const EVIDENCE_KINDS: ReadonlySet<string> = new Set(["file", "symbol", "command", "scenario"]);

/**
 * §M-FINDINGS — Everything wrong with a piece of evidence, or nothing.
 *
 * Shared by the finding validator and by the executor's proposed fix, because
 * the two make the same promise: a claim about the code that names where to go
 * and look. A fix whose evidence is weaker than the finding's would let the
 * reviewer's check be cheaper than the objection it settles.
 */
export function evidenceErrors(evidence: Evidence[] | undefined): string[] {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return ["at least one piece of evidence is required"];
  }
  const errors: string[] = [];
  for (const item of evidence) {
    if (!item || !item.reference) errors.push("evidence needs a reference");
    if (!item || !EVIDENCE_KINDS.has(item.kind)) {
      errors.push(`evidence kind ${JSON.stringify(item?.kind)} is not recognised`);
    }
  }
  return errors;
}

/** §M-FINDINGS — Authorities a finding may rest on. */
const BASIS_TYPES: ReadonlySet<string> = new Set([
  "spec",
  "business",
  "architecture",
  "engineering",
]);

/** §M-FINDINGS — The two review slots a result may claim to come from. */
const REVIEWERS: ReadonlySet<string> = new Set(["reviewerPrimary", "reviewerCrossVendor"]);

/** §M-FINDINGS — The two verdicts a review may reach. */
const VERDICTS: ReadonlySet<string> = new Set(["passed", "changes_requested"]);

/** §M-FINDINGS — The two judgements a reviewer may pass on the selection plan. */
const PLAN_VERDICTS: ReadonlySet<string> = new Set(["complete", "incomplete"]);

/** §M-FINDINGS — Validation outcome carrying every problem found. */
export interface FindingValidation {
  ok: boolean;
  errors: string[];
}

/** §M-FINDINGS — The shape of a finding id, matching what `findingPath` will accept. */
const FINDING_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * §M-FINDINGS — Validate one finding's internal consistency.
 *
 * The severity/classification cross-check is the load-bearing part: without it
 * "taste, blocker" and "defect, suggestion" both become available as ways to
 * smuggle an opinion past the fix requirement or to bury a real defect.
 */
export function validateFinding(finding: Finding): FindingValidation {
  const errors: string[] = [];
  if (!finding.id) errors.push("finding.id is required");
  else if (!FINDING_ID.test(finding.id)) {
    // An id is a name people type at a CLI and a name the run's `findings/`
    // view writes a file under. An unconstrained one was accepted into
    // `state.json` and then quietly failed to appear in the projection, so a
    // blocker existed that no reader of that directory could see.
    errors.push(
      `${JSON.stringify(finding.id)}: a finding id may hold letters, digits, ` +
        "'.', '_' and '-', and must start with a letter or a digit",
    );
  }
  if (!finding.impact) errors.push(`${finding.id}: impact is required`);

  if (!SEVERITIES.has(finding.severity)) {
    errors.push(
      `${finding.id}: severity ${JSON.stringify(finding.severity)} is not one of ` +
        [...SEVERITIES].join("|"),
    );
  }
  if (!CLASSIFICATIONS.has(finding.classification)) {
    errors.push(
      `${finding.id}: classification ${JSON.stringify(finding.classification)} is not one of ` +
        [...CLASSIFICATIONS].join("|"),
    );
  }

  errors.push(...evidenceErrors(finding.evidence).map((error) => `${finding.id}: ${error}`));

  if (!finding.basis || !finding.basis.type || !finding.basis.reference) {
    errors.push(`${finding.id}: basis type and reference are required`);
  } else if (!BASIS_TYPES.has(finding.basis.type)) {
    errors.push(`${finding.id}: basis type ${JSON.stringify(finding.basis.type)} is not recognised`);
  }

  if (!finding.recommendedFix || !finding.recommendedFix.approach) {
    errors.push(`${finding.id}: a recommended fix approach is required`);
  }
  if (finding.recommendedFix && !finding.recommendedFix.rationale) {
    errors.push(`${finding.id}: the recommended fix needs a rationale`);
  }

  if (finding.classification === "taste" && finding.severity !== "suggestion") {
    errors.push(`${finding.id}: taste may only be raised as a suggestion`);
  }
  if (finding.classification !== "taste" && !DEFECT_SEVERITIES.has(finding.severity)) {
    errors.push(
      `${finding.id}: ${finding.classification} must be blocker, major or minor, not ${finding.severity}`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/** §M-FINDINGS — Findings that block a pass, i.e. real defects and risks. */
export function blockingFindings(findings: Finding[]): Finding[] {
  return findings.filter((finding) => BLOCKING_CLASSIFICATIONS.has(finding.classification));
}

/**
 * §M-FINDINGS — Validate a whole review result, including its verdict.
 *
 * A reviewer that reports defects and still says `passed` is not expressing an
 * opinion, it is malfunctioning; likewise a pass on an incomplete selection
 * plan, which would let unexercised behaviour through both gates at once.
 */
export function validateReviewResult(result: ReviewResult): FindingValidation {
  const errors: string[] = [];
  if (!Array.isArray(result.findings)) {
    return { ok: false, errors: [`${result.reviewer}: findings must be an array`] };
  }
  for (const finding of result.findings) {
    errors.push(...validateFinding(finding).errors);
  }

  if (!REVIEWERS.has(result.reviewer)) {
    errors.push(`reviewer ${JSON.stringify(result.reviewer)} is not one of ${[...REVIEWERS].join("|")}`);
  }
  if (!VERDICTS.has(result.verdict)) {
    errors.push(
      `${result.reviewer}: verdict ${JSON.stringify(result.verdict)} is not one of ` +
        [...VERDICTS].join("|"),
    );
  }
  if (!PLAN_VERDICTS.has(result.selectionPlanVerdict)) {
    errors.push(
      `${result.reviewer}: selectionPlanVerdict ${JSON.stringify(result.selectionPlanVerdict)} ` +
        `is not one of ${[...PLAN_VERDICTS].join("|")}`,
    );
  }

  const blocking = blockingFindings(result.findings);
  if (result.verdict === "passed") {
    if (blocking.length > 0) {
      errors.push(
        `${result.reviewer}: verdict passed is impossible with ${blocking.length} open defect(s)`,
      );
    }
    if (result.selectionPlanVerdict !== "complete") {
      errors.push(`${result.reviewer}: verdict passed requires a complete selection plan verdict`);
    }
  }

  if (!result.snapshotDigest) errors.push(`${result.reviewer}: snapshotDigest is required`);
  if (!result.planDigest) errors.push(`${result.reviewer}: planDigest is required`);
  if (!result.commitOid) errors.push(`${result.reviewer}: commitOid is required`);

  return { ok: errors.length === 0, errors };
}

/**
 * §M-FINDINGS — Decide whether a review result still describes the current candidate.
 *
 * Results are asynchronous, so a reviewer can return a verdict for content that
 * has already been superseded; accepting it would attest a snapshot nobody
 * examined.
 */
export function isStaleResult(
  result: { snapshotDigest: string; planDigest: string },
  current: { snapshotDigest: string; planDigest: string },
): boolean {
  return (
    result.snapshotDigest !== current.snapshotDigest || result.planDigest !== current.planDigest
  );
}

/**
 * §M-FINDINGS — Roles that may never close a finding, whoever raised it.
 *
 * The executor is the point of the rule: it is the party the finding is about,
 * and self-attestation by the author of the code proves nothing. The
 * orchestrator and the reuse researcher are listed because neither ever
 * re-examines an implementation, so a close from them would be a rubber stamp.
 */
const NON_CLOSING_ROLES: ReadonlySet<Role> = new Set<Role>([
  "executor",
  "orchestrator",
  "reuseResearcher",
]);

/**
 * §M-FINDINGS — Whether a role may close a finding raised by another role.
 *
 * Only two parties can: the role that raised it — a fresh generation of the
 * same reviewer or E2E tester still counts, since authority belongs to the role
 * and not to a session that may have died — and the technical adjudicator,
 * whose whole purpose is settling a finding its raiser and the executor cannot.
 * Without this check reviewer A can close reviewer B's blocker, which collapses
 * two independent reviews into one.
 */
function mayClose(resolver: Role, raisedBy: Role, findingId: string, verb: string): void {
  if (NON_CLOSING_ROLES.has(resolver)) {
    throw new FindingTransitionError(findingId, `role ${resolver} may not ${verb} findings`);
  }
  if (resolver !== "technicalAdjudicator" && resolver !== raisedBy) {
    throw new FindingTransitionError(
      findingId,
      `${verb} refused: raised by ${raisedBy}, attempted by ${resolver}; ` +
        "only the raising role or the technical adjudicator may close it",
    );
  }
}

/** §M-FINDINGS — Raised when a role attempts a transition it does not own. */
export class FindingTransitionError extends Error {
  /** §M-FINDINGS — Name the finding and the attempted transition. */
  constructor(findingId: string, message: string) {
    super(`finding ${findingId}: ${message}`);
    this.name = "FindingTransitionError";
  }
}

/**
 * §M-FINDINGS — Record the executor's proposed fix.
 *
 * `fix_proposed` is deliberately the executor's ceiling: self-attestation by
 * the party that wrote the code proves nothing about whether the original
 * problem is gone.
 */
export function proposeFix(
  record: FindingRecord,
  candidateCommit: string,
  evidence: FindingRecord["resolutionEvidence"],
): FindingRecord {
  if (record.status === "resolved") {
    throw new FindingTransitionError(record.finding.id, "already resolved");
  }
  return {
    ...record,
    status: "fix_proposed",
    fixAttempts: (record.fixAttempts ?? 0) + 1,
    resolutionCandidate: candidateCommit,
    ...(evidence ? { resolutionEvidence: evidence } : {}),
  };
}

/**
 * §M-FINDINGS — Re-raise a finding without forgetting what has happened to it.
 *
 * A reviewer restating a finding is the only way, in this CLI, to say "your fix
 * does not settle it" — there is no reject-fix verb. Both restating paths built
 * the record from the payload alone, so the single action that makes a turn a
 * *rebuttal* was also the action that erased the rebuttal count: `fixAttempts`
 * went back to unset on every round, and §30's threshold of two could not be
 * reached through the loop it was written for.
 *
 * The status legitimately returns to `open` — the reviewer has genuinely raised
 * it again, and the proposed fix is no longer on the table. Only the history
 * that survives that judgement is carried, and the resolution fields are not
 * part of it.
 */
export function restateRecord(
  finding: Finding,
  raisedBy: SessionRef,
  previous: FindingRecord | undefined,
): FindingRecord {
  return {
    finding,
    raisedBy,
    status: "open",
    ...(previous?.fixAttempts !== undefined ? { fixAttempts: previous.fixAttempts } : {}),
  };
}

/** §M-FINDINGS — Statuses that mean the argument about a finding is over. */
const SETTLED: ReadonlySet<FindingRecord["status"]> = new Set(["resolved", "taste_dismissed"]);

/**
 * §M-FINDINGS — Findings that have been argued about long enough to adjudicate.
 *
 * §30: "После двух бесплодных rebuttal turns оркестратор может вызвать fresh
 * technical adjudicator." The threshold is two, the decision is the
 * orchestrator's — `может`, not `должен` — and this reports which findings have
 * reached it rather than acting. What it replaces is a sentence in a skill
 * prompt about a number nothing was keeping.
 *
 * A fix that is still `fix_proposed` counts: the reviewer has not accepted it
 * yet. `resolved` and `taste_dismissed` do not — the first ended the argument
 * and the second *is* the adjudicator's ruling, so continuing to nominate it
 * would ask the orchestrator to adjudicate the same finding for ever.
 */
export function adjudicable(records: FindingRecord[], threshold = 2): string[] {
  return records
    .filter((record) => !SETTLED.has(record.status) && (record.fixAttempts ?? 0) >= threshold)
    .map((record) => record.finding.id);
}

/**
 * §M-FINDINGS — Close a finding on the authority of a reviewer or adjudicator.
 *
 * The closing session must be one that can actually re-examine the candidate:
 * the original reviewer generation, a replacement in the same role, or a fresh
 * technical adjudicator.
 */
export function resolveFinding(record: FindingRecord, resolvedBy: SessionRef): FindingRecord {
  mayClose(resolvedBy.role, record.raisedBy.role, record.finding.id, "resolve");
  if (record.status === "open") {
    throw new FindingTransitionError(
      record.finding.id,
      "cannot resolve a finding with no proposed fix",
    );
  }
  // §30 closes a finding "after checking the candidate and the evidence", and
  // both were optional here — a resolution could name neither the commit it
  // examined nor anything it observed there. A verdict that cites nothing is
  // indistinguishable from one nobody reached.
  if (!record.resolutionCandidate) {
    throw new FindingTransitionError(
      record.finding.id,
      "cannot resolve a finding whose proposed fix names no candidate commit",
    );
  }
  if (!record.resolutionEvidence || record.resolutionEvidence.length === 0) {
    throw new FindingTransitionError(
      record.finding.id,
      "cannot resolve a finding whose proposed fix carries no evidence to check",
    );
  }
  return { ...record, status: "resolved", resolvedBy };
}

/**
 * §M-FINDINGS — Dismiss a proven-taste suggestion without a fix.
 *
 * Only the raising reviewer's role may do this, and only for taste; allowing it
 * for defects would reintroduce silent debt through the back door.
 */
export function dismissTaste(record: FindingRecord, dismissedBy: SessionRef): FindingRecord {
  if (record.finding.classification !== "taste") {
    throw new FindingTransitionError(record.finding.id, "only taste may be dismissed");
  }
  mayClose(dismissedBy.role, record.raisedBy.role, record.finding.id, "dismiss");
  return { ...record, status: "taste_dismissed", resolvedBy: dismissedBy };
}

/**
 * §M-FINDINGS — Demote a blocking finding to taste, on an adjudicator's verdict.
 *
 * §20 gives the technical adjudicator exactly three verdicts, and this was the
 * missing one: "the concern is real but it is `taste`, not a defect or a risk."
 * Without it the adjudicator's only exits were upholding a finding nobody
 * agreed was blocking and `resolve`, which asserts the concern is *gone* — so
 * the honest verdict was the one verdict the tool could not record.
 *
 * Only the adjudicator, and only downward. A reviewer reclassifying their own
 * blocker is that reviewer withdrawing it, which `dismiss-taste` already
 * covers once it is taste; a promotion the other way would let a fresh session
 * turn a style note into a completion blocker without re-reviewing anything.
 *
 * The record stays open. Reclassification decides how much the finding weighs,
 * not whether it has been dealt with — it stops blocking completion and the
 * executor may still act on it or the raiser may dismiss it.
 */
export function reclassifyAsTaste(record: FindingRecord, by: SessionRef): FindingRecord {
  if (by.role !== "technicalAdjudicator") {
    throw new FindingTransitionError(
      record.finding.id,
      `only a technical adjudicator may reclassify a finding, not ${by.role}`,
    );
  }
  if (record.finding.classification === "taste") {
    throw new FindingTransitionError(record.finding.id, "already taste");
  }
  if (record.status === "resolved" || record.status === "taste_dismissed") {
    throw new FindingTransitionError(record.finding.id, "already closed");
  }
  // Severity follows classification, because §30 refuses a taste finding that
  // calls itself a blocker — leaving the old severity in place would produce a
  // record `validateFinding` would reject.
  return {
    ...record,
    finding: { ...record.finding, classification: "taste", severity: "suggestion" },
    reclassifiedBy: by,
  };
}

/** §M-FINDINGS — Records that still block completion. */
export function openBlockingRecords(records: FindingRecord[]): FindingRecord[] {
  return records.filter(
    (record) =>
      BLOCKING_CLASSIFICATIONS.has(record.finding.classification) &&
      record.status !== "resolved" &&
      record.status !== "taste_dismissed",
  );
}

/**
 * §M-FINDINGS — Drop closed records so state keeps only what is still open.
 *
 * Findings are working memory, not an archive: keeping resolved ones would
 * grow a project ledger the methodology explicitly refuses to create.
 */
export function pruneClosedRecords(records: FindingRecord[]): FindingRecord[] {
  return records.filter(
    (record) => record.status !== "resolved" && record.status !== "taste_dismissed",
  );
}
