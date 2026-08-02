/**
 * §M-GATE-EVIDENCE — The proof each gate must produce before its PASS is stored.
 *
 * Implements §A-AUTHORITATIVE-QC and §A-CANDIDATE-ISOLATION. Collected here
 * because they answer one question in three places: what, other than the
 * caller's word, makes this gate's verdict true? A reviewer answers it with a
 * validated `ReviewResult`; the other three answer it with a file on disk that
 * only an isolated run could have produced.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { readRepoJson } from "../repo-json.mjs";
import { evaluateQc, validateManifest, validateResult } from "../../core/qc.mjs";
import { gateReceiptPath, qcResultPath } from "../../core/paths.mjs";
import { fail } from "../args.mjs";
import type { QcManifest, QcResult } from "../../core/types.mjs";

/** §M-GATE-EVIDENCE — The `worktree run` label whose receipt proves E2E isolation. */
export const E2E_RECEIPT_LABEL = "e2e";

/**
 * §M-GATE-EVIDENCE — Refuse a QC pass that no QC run produced.
 *
 * The other three attestations are unforgeable — a reviewer PASS needs a
 * validated `ReviewResult`, an E2E PASS needs a plan-bound result and a
 * worktree receipt — and `qc` had neither guard. `record-gate --gate qc
 * --status passed` was accepted with no `make qc` behind it, no result file in
 * the run directory, and `qc evaluate` never invoked; the command existed and
 * computed a real verdict, but nothing wrote its answer into state and nothing
 * read it back. One of §00's four completion attestations was a bare assertion.
 *
 * So the verdict is recomputed here, from the project's own manifest and the
 * result its own `make qc` wrote to `$META_O_QC_RESULT`. A failure is still
 * recordable through the plain path: it takes nothing away.
 */
export function assertQcProven(repoDir: string, projectKey: string, runId: string, digest: string): void {
  // Tie the result file to the run that just happened. It survives between
  // runs of the same label, so a `make qc` that wrote a passing result and then
  // exited non-zero could be laundered by re-running the label with `true`: the
  // new receipt exits 0, the stale result is still on disk, and the gate reads
  // as passed. A result older than the run that is citing it is not evidence
  // about that run.
  const receiptPath = gateReceiptPath(projectKey, runId, "qc");
  let receipt: { startedAt?: string } | undefined;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as { startedAt?: string };
  } catch {
    /* `assertGateIsolated` has already refused a run with no receipt */
  }
  const manifest = readRepoJson<QcManifest>(repoDir, ".quality/qc-manifest.json");
  const manifestErrors = validateManifest(manifest);
  if (!manifestErrors.ok) fail("invalid_manifest", manifestErrors.errors.join("; "));

  const resultFile = qcResultPath(projectKey, runId);
  let result: QcResult | undefined;
  if (existsSync(resultFile)) {
    try {
      result = JSON.parse(readFileSync(resultFile, "utf8")) as QcResult;
    } catch (error) {
      fail("invalid_qc_result", `${resultFile}: ${(error as Error).message}`);
    }
    const resultErrors = validateResult(result);
    if (!resultErrors.ok) fail("invalid_qc_result", resultErrors.errors.join("; "));
  }

  const startedAt = receipt?.startedAt ? Date.parse(receipt.startedAt) : undefined;
  if (result && startedAt !== undefined && Number.isFinite(startedAt)) {
    const written = statSync(resultFile).mtimeMs;
    // One second of slack: the receipt's timestamp is second-resolution ISO
    // and the file's mtime is not, so an honest run can round the wrong way.
    if (written + 1000 < startedAt) {
      fail(
        "qc_not_proven",
        `the QC result at ${resultFile} was written before this run of the gate started ` +
          `(${receipt?.startedAt}); it describes an earlier run, so re-run \`make qc\` in the ` +
          "gate worktree",
        { resultFile, expectedReceipt: receiptPath },
      );
    }
  }

  const evaluation = evaluateQc(manifest, result, digest);
  if (evaluation.pass) return;
  fail(
    "qc_not_proven",
    "a QC pass is recomputed from the project's manifest and the result `make qc` wrote, not " +
      `taken on the caller's word: ${evaluation.reasons.join("; ")}`,
    { resultFile, expectedSnapshotDigest: digest },
  );
}

/**
 * §M-GATE-EVIDENCE — Refuse a gate pass the run cannot prove ran in isolation.
 *
 * §00 gives every gate a fresh detached worktree at the candidate commit and a
 * clean tree on both sides of it. `worktree run` implements that and leaves a
 * receipt; without one, "the smoke passed" is a sentence rather than a gate.
 */
export function assertGateIsolated(
  projectKey: string,
  runId: string,
  label: string,
  candidate: { digest: string; provenanceCommit: string },
): void {
  const path = gateReceiptPath(projectKey, runId, label);
  let receipt: GateReceipt | undefined;
  try {
    receipt = JSON.parse(readFileSync(path, "utf8")) as GateReceipt;
  } catch {
    fail(
      "gate_not_isolated",
      `§00 runs every gate in a fresh detached worktree, and this run has no receipt for the ` +
        `${label} gate; run it with \`meta-o worktree run --run-id ${runId} --label ${label} ` +
        "-- <command>`",
      { expectedReceipt: path },
    );
  }
  assertSameContent(receipt, candidate, `the ${label} receipt`, "gate_not_isolated", path);
  // A PASS whose own receipt records a non-zero exit is the caller's word
  // contradicting the evidence they cited. `worktree run --label smoke -- false`
  // produced a perfectly valid receipt, and `record-gate --gate smoke --status
  // passed` accepted it — the isolation was proved and the outcome was not.
  //
  // Only for a claimed pass: a receipt for a failing run is exactly what
  // recording a failure should cite.
  if (receipt?.exitStatus !== 0) {
    fail(
      "gate_did_not_pass",
      `the ${label} receipt records exit status ${receipt?.exitStatus ?? "(unrecorded)"} for ` +
        `\`${receipt?.command ?? "an unrecorded command"}\`; a gate cannot be recorded as passed ` +
        "against a run that did not pass",
      { expectedReceipt: path },
    );
  }
}

/** §M-GATE-EVIDENCE — What `worktree run` records about an isolated gate. */
interface GateReceipt {
  commitOid?: string;
  snapshotDigest?: string;
  exitStatus?: number;
  command?: string;
}

/**
 * §M-GATE-EVIDENCE — Hold a receipt to the content it ran against, not the commit.
 *
 * A receipt matched by commit oid was discarded by an amend, rebase or squash
 * of a byte-identical tree — the churn §00 says explicitly must not happen, and
 * for the E2E gate it meant re-running the whole selected set for a reworded
 * commit message. Receipts written before this carried no digest, and are
 * refused rather than assumed to match: a gate whose evidence cannot be tied to
 * content is a gate that has to run again.
 */
function assertSameContent(
  receipt: GateReceipt | undefined,
  candidate: { digest: string; provenanceCommit: string },
  subject: string,
  code: string,
  path: string,
): void {
  if (receipt?.snapshotDigest === candidate.digest) return;
  const ran = receipt?.snapshotDigest ?? `an unrecorded snapshot (commit ${receipt?.commitOid})`;
  fail(
    code,
    `${subject} is for ${ran}, but the candidate's content is ${candidate.digest}; re-run the ` +
      "gate against the candidate",
    { expectedReceipt: path },
  );
}

/**
 * §M-GATE-EVIDENCE — Refuse an E2E result the run has no proof was isolated.
 *
 * §30 requires the tester to work in a fresh detached worktree and to change no
 * tracked file, and that requirement lived only in the skill: `record-e2e`
 * accepted whatever JSON arrived on stdin, so a tester who ran the suite in the
 * developer's checkout — picking up uncommitted edits, and possibly leaving
 * some behind — produced a gate indistinguishable from an isolated one. The
 * receipt `worktree run --label e2e` leaves is the only durable evidence that
 * the run happened somewhere else and that the tree was clean on both sides of
 * it, so this asks for that rather than for the tester's word.
 *
 * The receipt's exit status is deliberately not judged. A suite that exits
 * non-zero because scenarios failed still ran in isolation, and it is the
 * per-scenario statuses that decide the gate.
 */
export function assertE2eIsolated(
  projectKey: string,
  runId: string,
  candidate: { digest: string; provenanceCommit: string },
): void {
  const path = gateReceiptPath(projectKey, runId, E2E_RECEIPT_LABEL);
  let receipt: GateReceipt | undefined;
  try {
    receipt = JSON.parse(readFileSync(path, "utf8")) as GateReceipt;
  } catch {
    fail(
      "e2e_not_isolated",
      "§30 requires the E2E tester to work in a fresh detached worktree, and this run has no " +
        `receipt for one; run the suite with \`meta-o worktree run --run-id ${runId} ` +
        `--label ${E2E_RECEIPT_LABEL} -- <command>\` and record the result afterwards`,
      { expectedReceipt: path },
    );
  }
  assertSameContent(receipt, candidate, "the E2E worktree receipt", "e2e_not_isolated", path);
}
