/**
 * §M-FINDINGS — Rules that make a review verdict mean something.
 *
 * Implements §A-INDEPENDENT-REVIEW. Two independent reviewers are the main
 * defence against a plausible but wrong implementation; that defence collapses
 * if a reviewer can pass a candidate with open defects, if taste can block, or
 * if the executor can close its own findings. Those three rules are mechanical,
 * so they are enforced here rather than trusted to a prompt.
 */

import type { Finding, FindingRecord, ReviewResult, Role, SessionRef } from "./types.mjs";

/** §M-FINDINGS — Severities that may never be attached to taste. */
const DEFECT_SEVERITIES = new Set(["blocker", "major", "minor"]);

/** §M-FINDINGS — Classifications that must be fixed before a pass. */
const BLOCKING_CLASSIFICATIONS = new Set(["defect", "engineering_risk"]);

/** §M-FINDINGS — Validation outcome carrying every problem found. */
export interface FindingValidation {
  ok: boolean;
  errors: string[];
}

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
  if (!finding.impact) errors.push(`${finding.id}: impact is required`);

  if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) {
    errors.push(`${finding.id}: at least one piece of evidence is required`);
  } else {
    for (const item of finding.evidence) {
      if (!item.reference) errors.push(`${finding.id}: evidence needs a reference`);
    }
  }

  if (!finding.basis || !finding.basis.type || !finding.basis.reference) {
    errors.push(`${finding.id}: basis type and reference are required`);
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
  for (const finding of result.findings) {
    errors.push(...validateFinding(finding).errors);
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

/** §M-FINDINGS — Roles permitted to move a finding to `resolved`. */
const CLOSING_ROLES: ReadonlySet<Role> = new Set<Role>([
  "reviewerPrimary",
  "reviewerCrossVendor",
  "technicalAdjudicator",
]);

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
    resolutionCandidate: candidateCommit,
    ...(evidence ? { resolutionEvidence: evidence } : {}),
  };
}

/**
 * §M-FINDINGS — Close a finding on the authority of a reviewer or adjudicator.
 *
 * The closing session must be one that can actually re-examine the candidate:
 * the original reviewer generation, a replacement in the same role, or a fresh
 * technical adjudicator.
 */
export function resolveFinding(record: FindingRecord, resolvedBy: SessionRef): FindingRecord {
  if (!CLOSING_ROLES.has(resolvedBy.role)) {
    throw new FindingTransitionError(
      record.finding.id,
      `role ${resolvedBy.role} may not resolve findings`,
    );
  }
  if (record.status === "open") {
    throw new FindingTransitionError(
      record.finding.id,
      "cannot resolve a finding with no proposed fix",
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
  if (!CLOSING_ROLES.has(dismissedBy.role)) {
    throw new FindingTransitionError(
      record.finding.id,
      `role ${dismissedBy.role} may not dismiss findings`,
    );
  }
  return { ...record, status: "taste_dismissed", resolvedBy: dismissedBy };
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
