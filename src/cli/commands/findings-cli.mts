/**
 * §M-CLI-FINDINGS — CLI surface for a finding's life from raised to closed.
 *
 * Implements §A-INDEPENDENT-REVIEW. Split from the gate results because the
 * two obey different rules: a gate result is a claim about content and is
 * refused unless it names the content it examined, while a finding is a claim
 * about *judgement* and is refused unless it names the authority behind it.
 * Keeping them apart keeps each file's one rule legible.
 */

import {
  dismissTaste,
  openBlockingRecords,
  proposeFix,
  pruneClosedRecords,
  evidenceErrors,
  reclassifyAsTaste,
  resolveFinding,
  restateRecord,
  validateFinding,
} from "../../core/findings.mjs";
import { routeNext } from "../../core/fsm.mjs";
import { redactDeep } from "../../core/redact.mjs";
import { findingSlot, identityOf, mutate, type FindingSlot } from "./run-context.mjs";
import { emit, fail, readStdinJson, requireFlag, type ParsedArgs } from "../args.mjs";
import { dispatchedSession } from "./session-state.mjs";
import type { Evidence, Finding, FindingRecord, RunState, SessionRef } from "../../core/types.mjs";

/**
 * §M-CLI-FINDINGS — Keep blockers a new payload silently dropped.
 *
 * A later review round legitimately restates the slot, and a blocker the
 * reviewer no longer raises has genuinely been re-judged — but only if the
 * reviewer says so by id. Anything still open and still absent is refused
 * rather than quietly carried or quietly lost: carrying it would let a real
 * re-review never clear anything, losing it is the bypass this exists to stop.
 */
export function carryOpenBlockers(
  existing: FindingRecord[],
  incoming: Finding[],
  slot: FindingSlot,
): FindingRecord[] {
  const restated = new Set(incoming.map((finding) => finding.id));
  const dropped = openBlockingRecords(existing).filter((record) => !restated.has(record.finding.id));
  if (dropped.length > 0) {
    fail(
      "findings_dropped",
      `${slot} still holds open blocking finding(s) ${dropped.map((r) => r.finding.id).join(", ")} ` +
        "that this payload neither restates nor closes; close them with `run resolve-finding` " +
        "or `run dismiss-taste` first",
      { dropped: dropped.map((record) => record.finding.id) },
    );
  }
  return existing.filter((record) => !openBlockingRecords([record]).length && !restated.has(record.finding.id));
}

/**
 * §M-CLI-FINDINGS — Store findings raised by one reviewer.
 *
 * Validated on entry so that a malformed finding — taste marked as a blocker, a
 * defect with no evidence — is rejected at the boundary instead of becoming an
 * argument between two model sessions.
 */
export async function commandOpenFindings(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const slot = findingSlot(requireFlag(args, "reviewer"));
  const findings = redactDeep(await readStdinJson<Finding[]>());

  const errors = findings.flatMap((finding) => validateFinding(finding).errors);
  if (errors.length > 0) fail("invalid_finding", errors.join("; "));

  const next = await mutate(projectKey, runId, (state) => {
    const role = slot === "e2e" ? "e2eTester" : slot;
    const raisedBy = dispatchedSession(state, role, `a finding from ${role}`);
    // This command records what a review found; it is not a way to un-find it.
    // Writing the slot wholesale let anyone who could reach the CLI hand in an
    // empty array and erase a reviewer's blocker — after which four gates that
    // were already attested completed the run. Blockers leave only through
    // `resolve-finding` or `dismiss-taste`, which name an authority.
    //
    // Records `record-e2e` derived from scenario statuses are left alone: this
    // caller did not raise them and cannot restate them, and only the next run
    // of that gate can decide they are gone.
    const existing = state.openFindings?.[slot] ?? [];
    const toolOwned = existing.filter((record) => record.derived);
    // The whole `E2E-*` namespace on the `e2e` slot, not only the ids that are
    // derived *right now*. Reserving only the live ones let an author squat a
    // predictable id — they are `E2E-<scenarioId>` — before the gate produced
    // it, and the slot then held two records under one id: every verb that
    // addresses a finding by id closed both, so resolving the squatter's taste
    // note took the real blocker with it.
    /** §M-CLI-FINDINGS — Whether this id belongs to the E2E gate rather than a person. */
    const reserved = (id: string): boolean =>
      (slot === "e2e" && id.startsWith(DERIVED_ID_PREFIX)) ||
      toolOwned.some((record) => record.finding.id === id);
    const collisions = findings.filter((finding) => reserved(finding.id));
    if (collisions.length > 0) {
      fail(
        "finding_id_reserved",
        `${collisions.map((finding) => finding.id).join(", ")}: the E2E gate derives its own ` +
          `findings under \`${DERIVED_ID_PREFIX}*\` on this slot; raise yours under an id of ` +
          "your own so neither can overwrite the other",
      );
    }
    // Two open records under one id make every id-addressed verb ambiguous,
    // whoever raised them.
    const duplicates = findings.filter((finding) =>
      existing.some((record) => record.finding.id === finding.id && record.derived),
    );
    if (duplicates.length > 0) {
      fail("duplicate_finding_id", `${duplicates.map((f) => f.id).join(", ")} is already open in ${slot}`);
    }
    const carried = carryOpenBlockers(
      existing.filter((record) => !record.derived),
      findings,
      slot,
    );
    const records: FindingRecord[] = findings.map((finding) =>
      restateRecord(
        finding,
        raisedBy,
        existing.find((record) => !record.derived && record.finding.id === finding.id),
      ),
    );
    return {
      ...state,
      openFindings: { ...state.openFindings, [slot]: [...toolOwned, ...carried, ...records] },
    };
  });

  emit({
    runId,
    reviewer: slot,
    open: next.openFindings?.[slot]?.length ?? 0,
    blocking: openBlockingRecords(next.openFindings?.[slot] ?? []).length,
  });
}

/**
 * §M-CLI-FINDINGS — Record the executor's proposed fix for one finding.
 *
 * The evidence comes from stdin. It used to be copied out of the record's own
 * `resolutionEvidence`, which is empty at this point by definition — so the
 * executor had no way to say what it changed, and the reviewer had nothing to
 * check. That is the half of "close after checking candidate and evidence" the
 * executor owes.
 */
export async function commandProposeFix(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const slot = findingSlot(requireFlag(args, "reviewer"));
  const findingId = requireFlag(args, "finding-id");
  const candidate = requireFlag(args, "candidate-commit");
  const evidence = redactDeep(await readStdinJson<Evidence[]>());

  const errors = evidenceErrors(evidence);
  if (errors.length > 0) fail("invalid_evidence", errors.join("; "));

  const next = await mutate(projectKey, runId, (state) => {
    const records = state.openFindings?.[slot] ?? [];
    const target = records.find((record) => record.finding.id === findingId);
    if (!target) fail("unknown_finding", `${slot} holds no open finding ${findingId}`);
    assertNotDerived(target, findingId);
    const updated = records.map((record) =>
      record.finding.id === findingId ? proposeFix(record, candidate, evidence) : record,
    );
    return { ...state, openFindings: { ...state.openFindings, [slot]: updated } };
  });

  emit({ runId, findingId, status: next.openFindings?.[slot]?.find((r) => r.finding.id === findingId)?.status });
}

/**
 * §M-CLI-FINDINGS — The session a `--by-role` claim resolves to.
 *
 * `--by-role` is a claim, and nothing in a CLI invocation proves which model is
 * behind it. The comment here used to argue that comparing the claim against
 * the raising role made the rule safe; it does not — the executor need only
 * claim the raiser's own role, and both checks pass.
 *
 * What is checkable is that the orchestrator actually dispatched a session for
 * that role in this run. So the fabricated `unrecorded-<role>` stand-in is
 * gone: a closure now names a session that exists in state, put there by the
 * orchestrator when it spawned the reviewer. That is authority by dispatch, not
 * authentication, and the honest limit is stated in `docs/knowledge/`: a model
 * that can both reach this CLI and impersonate a dispatched reviewer is not
 * something a local tool can exclude.
 */
function claimedSession(state: RunState, role: SessionRef["role"], findingId: string): SessionRef {
  const session = state.sessions[role];
  if (!session) {
    fail(
      "no_such_session",
      `finding ${findingId}: this run has no ${role} session, so nothing may close a finding on ` +
        `its authority; dispatch one with \`meta-o session spawn --role ${role}\` first`,
    );
  }
  return session;
}

/**
 * §M-CLI-FINDINGS — Refuse to close by hand what only a gate can decide.
 *
 * A record `record-e2e` derived from a scenario status is a projection of that
 * gate, and the code said so while doing the opposite: `propose-fix` plus
 * `resolve-finding` removed the projection of a scenario that was still red,
 * and the router then stopped prescribing `fix_e2e_failures` for it. Re-running
 * the gate is the only thing that can retire one.
 */
function assertNotDerived(record: FindingRecord, findingId: string): void {
  if (!record.derived) return;
  fail(
    "derived_finding",
    `${findingId} was derived from a scenario status by the E2E gate, so it is retired by ` +
      "re-running that gate against a candidate where the scenario passes, not by closing it",
  );
}

/** §M-CLI-FINDINGS — The id prefix `record-e2e` gives the findings it derives. */
export const DERIVED_ID_PREFIX = "E2E-";

/** §M-CLI-FINDINGS — Apply one closing transition to a single finding record. */
async function closeFinding(
  args: ParsedArgs,
  apply: (record: FindingRecord, by: SessionRef) => FindingRecord,
): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const slot = findingSlot(requireFlag(args, "reviewer"));
  const findingId = requireFlag(args, "finding-id");
  const byRole = requireFlag(args, "by-role") as SessionRef["role"];

  const next = await mutate(projectKey, runId, (state) => {
    const records = state.openFindings?.[slot] ?? [];
    const target = records.find((record) => record.finding.id === findingId);
    if (!target) fail("unknown_finding", `${slot} holds no open finding ${findingId}`);
    assertNotDerived(target, findingId);
    const by = claimedSession(state, byRole, findingId);
    const updated = records.map((record) =>
      record.finding.id === findingId ? apply(record, by) : record,
    );
    return { ...state, openFindings: { ...state.openFindings, [slot]: pruneClosedRecords(updated) } };
  });

  emit({
    runId,
    findingId,
    remaining: next.openFindings?.[slot]?.length ?? 0,
    blocking: openBlockingRecords(next.openFindings?.[slot] ?? []).length,
    routing: routeNext(next),
  });
}

/**
 * §M-CLI-FINDINGS — Close a finding on the authority of its raiser or an adjudicator.
 *
 * Reviewer A may not close reviewer B's finding, and the executor may close
 * nobody's: both are the same rule, that the party who decides a problem is
 * gone must be a party able to see whether it is.
 */
export async function commandResolveFinding(args: ParsedArgs): Promise<void> {
  await closeFinding(args, (record, by) => resolveFinding(record, by));
}

/**
 * §M-CLI-FINDINGS — Drop a taste suggestion the executor declined to act on.
 *
 * Without this verb a declined suggestion has no exit: it is not a defect, so
 * no fix is coming, and `resolve-finding` refuses a record with no proposed
 * fix. The run would sit in the review loop forever over a matter of style.
 */
export async function commandDismissTaste(args: ParsedArgs): Promise<void> {
  await closeFinding(args, (record, by) => dismissTaste(record, by));
}

/**
 * §M-CLI-FINDINGS — Record the adjudicator's third verdict: real, but taste.
 *
 * The skill names three verdicts and the CLI implemented two, so an adjudicator
 * who agreed the concern was real and disagreed that it blocked had to either
 * uphold a blocker they did not believe in or call it resolved, which says the
 * concern is gone. The finding stays open and stops blocking.
 */
export async function commandReclassifyFinding(args: ParsedArgs): Promise<void> {
  const { projectKey } = identityOf(args);
  const runId = requireFlag(args, "run-id");
  const slot = findingSlot(requireFlag(args, "reviewer"));
  const findingId = requireFlag(args, "finding-id");
  const rationale = requireFlag(args, "rationale");

  const next = await mutate(projectKey, runId, (state) => {
    const records = state.openFindings?.[slot] ?? [];
    const target = records.find((record) => record.finding.id === findingId);
    if (!target) fail("unknown_finding", `${slot} holds no open finding ${findingId}`);
    assertNotDerived(target, findingId);
    const by = claimedSession(state, "technicalAdjudicator", findingId);
    const updated = records.map((record) => {
      if (record.finding.id !== findingId) return record;
      const demoted = reclassifyAsTaste(record, by);
      // The verdict has to survive in the record itself: a reader six months
      // from now sees a taste suggestion, and needs to know it began as a
      // blocker and on what argument it stopped being one.
      return {
        ...demoted,
        finding: {
          ...demoted.finding,
          impact: `${demoted.finding.impact} — reclassified as taste: ${rationale}`,
        },
      };
    });
    return { ...state, openFindings: { ...state.openFindings, [slot]: updated } };
  });

  emit({
    runId,
    findingId,
    classification: "taste",
    blocking: openBlockingRecords(next.openFindings?.[slot] ?? []).length,
    routing: routeNext(next),
  });
}
