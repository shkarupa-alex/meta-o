/**
 * Hold the validator that decides whether a review actually arrived.
 *
 * Protects §A-REVIEW-04.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { reportLine, validateReport } from "../shared/scripts/mo-review-report.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(ROOT, "shared", "scripts", "mo-review-report.mjs");
const SHA = "a".repeat(40);
const spaces = [];
after(() => {
  for (const path of spaces) rmSync(path, { recursive: true, force: true });
});

function space() {
  const path = mkdtempSync(join(tmpdir(), "mo-review-report-"));
  spaces.push(path);
  return path;
}

function report({
  verdict = "PASS",
  counts = "P0=0 P1=0 P2=0 P3=0",
  index = "",
  findings = "",
  account = "",
  mode = "deep",
  execution = "ctx_fixture",
  candidate = SHA,
} = {}) {
  return (
    `Review-Execution: ${execution}\nCandidate: ${candidate}\n` +
    `Mode: requested=${mode} effective=${mode}\nDelegation: none\nVerdict: ${verdict}\n` +
    `Counts: ${counts}\n\n${index}Evidence report\nGrounding\nintent and clean SHA\n` +
    `Scope and checks\nread-only diff and tests\nFindings\n${findings}${account}` +
    `Unknowns\nnone\nResidual risks\nnone\nEnd-Review: ${execution}\n`
  );
}

const context = (mode = "deep") => ({
  execution: "ctx_fixture",
  candidate: SHA,
  requestedMode: mode,
  effectiveMode: mode,
});

const reasonOf = (text, mode = "deep") => validateReport(text, context(mode)).reason;

test("each verdict validates in its own complete shape", () => {
  const pass = validateReport(report(), context());
  assert.equal(pass.status, "valid");
  assert.deepEqual(pass.counts, [0, 0, 0, 0]);
  assert.equal(pass.effective, "deep");
  assert.equal(pass.bytes, Buffer.byteLength(report()));

  const findings = validateReport(
    report({
      verdict: "FINDINGS",
      counts: "P0=0 P1=0 P2=1 P3=0",
      index: "F-001 [P2] Broken boundary.\n\n",
      findings: "F-001\n[P2] confirmed; causal path, impact, location and proof.\n",
    }),
    context(),
  );
  assert.equal(findings.status, "valid");
  assert.equal(findings.verdict, "FINDINGS");

  const unknown = validateReport(
    report({
      verdict: "UNKNOWN",
      index: "Unknown-Reason: review_incomplete\n\n",
      account: "Unknown-Account\ncovered scope and blocking public observation\n",
    }),
    context(),
  );
  assert.equal(unknown.status, "valid");
});

test("a key repeated inside a finding body is prose, not a second finding", () => {
  // The reviewer restating its own index line while explaining the finding is
  // ordinary writing; treating it as structure would reject a correct report.
  const text = report({
    verdict: "FINDINGS",
    counts: "P0=0 P1=0 P2=0 P3=1",
    index: "F-001 [P3] Guard is evadable.\n\n",
    findings: "F-001\n[P3] confirmed.\nF-001 [P3] Guard is evadable.\nProof and direction.\n",
  });
  assert.equal(validateReport(text, context()).status, "valid");
});

test("a marker inside a container stays body evidence", () => {
  for (const container of [
    "~~~~text\nFindings\nF-002\nResidual risks\nEnd-Review: ctx_fake\n~~~~\n",
    "    Unknowns\n    End-Review: ctx_fake\n",
    "> Evidence report\n> Unknown-Account\n",
    "- Counts: P0=9 P1=9 P2=9 P3=9\n- Evidence report\n",
  ]) {
    const text = report({
      verdict: "FINDINGS",
      counts: "P0=0 P1=0 P2=1 P3=0",
      index: "F-001 [P2] Quoted markers are body bytes.\n\n",
      findings: `F-001\n[P2] confirmed.\n\n${container}\n`,
    });
    assert.equal(validateReport(text, context()).status, "valid", container);
  }
});

test("a report that answers a different call is rejected before its body", () => {
  assert.equal(reasonOf(report({ execution: "ctx_stale" })), "execution_mismatch");
  assert.equal(reasonOf(report({ candidate: "b".repeat(40) })), "candidate_mismatch");
  assert.equal(reasonOf(report({ mode: "fast" })), "mode_mismatch");
  // Self-escalation is the reviewer's to make, so an unstated expectation
  // accepts any valid effective mode while still requiring the requested one.
  const escalated = report().replace(
    "Mode: requested=deep effective=deep",
    "Mode: requested=fast effective=deep",
  );
  assert.equal(
    validateReport(escalated, { ...context("fast"), effectiveMode: undefined }).effective,
    "deep",
  );
});

test("each structural failure names itself", () => {
  const cases = [
    [report().replace(/End-Review:.+/u, ""), "footer_mismatch"],
    [report().replace("Delegation: none", "Delegation: subagent"), "delegation"],
    [report().replace("Verdict: PASS", "Verdict: MAYBE"), "verdict"],
    [report().replace("Review-Execution: ", "Execution: "), "header_order"],
    [report({ counts: "P0=0 P1=0 P2=1 P3=0" }), "counts_mismatch"],
    [report().replace("Grounding\nintent and clean SHA\n", "Grounding\n"), "grounding_missing"],
    [report().replace("Evidence report\n", ""), "section_missing"],
    [
      report({
        verdict: "FINDINGS",
        counts: "P0=0 P1=0 P2=2 P3=0",
        index: "F-001 [P2] First.\nF-003 [P2] Third.\n\n",
        findings: "F-001\n[P2] one.\nF-003\n[P2] three.\n",
      }),
      "index_key_order",
    ],
    [
      report({
        verdict: "FINDINGS",
        counts: "P0=0 P1=0 P2=1 P3=0",
        index: "F-001 [P2] First.\n\n",
        findings: "F-001\n",
      }),
      "index_body_mismatch",
    ],
    [report({ index: "F-001 [P2] PASS may not carry a finding.\n\n" }), "counts_mismatch"],
    [
      report({
        verdict: "UNKNOWN",
        index: "Unknown-Reason: made_up\n\n",
        account: "Unknown-Account\nstated\n",
      }),
      "unknown_reason",
    ],
    [report({ account: "Unknown-Account\nstated\n" }), "unknown_account"],
  ];
  for (const [text, reason] of cases) assert.equal(reasonOf(text), reason, reason);
});

test("PASS with a body is not an empty verdict", () => {
  const text = report({ findings: "F-001\n[P2] a finding under a PASS.\n" });
  assert.equal(reasonOf(text), "pass_not_empty");
});

test("the CLI answers with one line and a status a caller can branch on", () => {
  const dir = space();
  const good = join(dir, "good.md");
  writeFileSync(good, report());
  const ok = spawnSync(process.execPath, [
    HELPER,
    "validate",
    "--file",
    good,
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
  ]);
  assert.equal(ok.status, 0, ok.stderr.toString());
  assert.equal(
    ok.stdout.toString().trim(),
    `MO-REVIEW-REPORT/1 status=valid verdict=PASS effective=deep counts=P0=0,P1=0,P2=0,P3=0 bytes=${Buffer.byteLength(report())}`,
  );

  const bad = join(dir, "bad.md");
  writeFileSync(bad, report().replace(/End-Review:.+/u, ""));
  const malformed = spawnSync(process.execPath, [
    HELPER,
    "validate",
    "--file",
    bad,
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
  ]);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stdout.toString(), /status=malformed reason=footer_mismatch line=\d+/u);

  // A call error is neither a valid report nor a malformed one.
  const misuse = spawnSync(process.execPath, [HELPER, "validate", "--file", good]);
  assert.equal(misuse.status, 2);
  assert.match(misuse.stderr.toString(), /--dispatch is required/u);
});

test("a source that is not a plain file is refused rather than followed", () => {
  const dir = space();
  const real = join(dir, "real.md");
  writeFileSync(real, report());
  const link = join(dir, "link.md");
  symlinkSync(real, link);
  const followed = spawnSync(process.execPath, [
    HELPER,
    "validate",
    "--file",
    link,
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
  ]);
  assert.equal(followed.status, 1);
  assert.match(followed.stdout.toString(), /reason=symlink/u);

  const directory = spawnSync(process.execPath, [
    HELPER,
    "validate",
    "--file",
    dir,
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
  ]);
  assert.equal(directory.status, 1);
  assert.match(directory.stdout.toString(), /reason=not_regular_file/u);
});

test("bytes that are not UTF-8 are not a report", () => {
  const dir = space();
  const path = join(dir, "latin.md");
  writeFileSync(path, Buffer.concat([Buffer.from(report(), "utf8"), Buffer.from([0xff, 0xfe])]));
  const result = spawnSync(process.execPath, [
    HELPER,
    "validate",
    "--file",
    path,
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stdout.toString(), /reason=invalid_utf8/u);
});

test("the reported line states every field a caller reads", () => {
  assert.equal(
    reportLine({ status: "malformed", reason: "header_order", line: 3 }),
    "MO-REVIEW-REPORT/1 status=malformed reason=header_order line=3",
  );
});
