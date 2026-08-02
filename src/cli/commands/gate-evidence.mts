/**
 * §M-GATE-EVIDENCE — The proof each gate must produce before its PASS is stored.
 *
 * Implements §A-AUTHORITATIVE-QC and §A-CANDIDATE-ISOLATION. Collected here
 * because they answer one question in three places: what, other than the
 * caller's word, makes this gate's verdict true? A reviewer answers it with a
 * validated `ReviewResult`; the other three answer it with a file on disk that
 * only an isolated run could have produced.
 */

import { existsSync, readFileSync } from "node:fs";
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
  candidateCommit: string,
): void {
  const path = gateReceiptPath(projectKey, runId, label);
  let receipt: { commitOid?: string } | undefined;
  try {
    receipt = JSON.parse(readFileSync(path, "utf8")) as { commitOid?: string };
  } catch {
    fail(
      "gate_not_isolated",
      `§00 runs every gate in a fresh detached worktree, and this run has no receipt for the ` +
        `${label} gate; run it with \`meta-o worktree run --run-id ${runId} --label ${label} ` +
        "-- <command>`",
      { expectedReceipt: path },
    );
  }
  if (receipt?.commitOid !== candidateCommit) {
    fail(
      "gate_not_isolated",
      `the ${label} receipt is for ${receipt?.commitOid ?? "an unrecorded commit"}, but the ` +
        `candidate is ${candidateCommit}`,
      { expectedReceipt: path },
    );
  }
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
export function assertE2eIsolated(projectKey: string, runId: string, candidateCommit: string): void {
  const path = gateReceiptPath(projectKey, runId, E2E_RECEIPT_LABEL);
  let receipt: { commitOid?: string; completedAt?: string } | undefined;
  try {
    receipt = JSON.parse(readFileSync(path, "utf8")) as { commitOid?: string };
  } catch {
    fail(
      "e2e_not_isolated",
      "§30 requires the E2E tester to work in a fresh detached worktree, and this run has no " +
        `receipt for one; run the suite with \`meta-o worktree run --run-id ${runId} ` +
        `--label ${E2E_RECEIPT_LABEL} -- <command>\` and record the result afterwards`,
      { expectedReceipt: path },
    );
  }
  if (receipt?.commitOid !== candidateCommit) {
    fail(
      "e2e_not_isolated",
      `the E2E worktree receipt is for ${receipt?.commitOid ?? "an unrecorded commit"}, but the ` +
        `candidate is ${candidateCommit}; re-run the selected set against the candidate`,
      { expectedReceipt: path },
    );
  }
}
