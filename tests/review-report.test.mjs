/**
 * Hold the validator that decides whether a review actually arrived.
 *
 * Protects §A-REVIEW-04.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  linkFailureReason,
  namespace,
  pair,
  reportLine,
  stage,
  validateReport,
} from "../shared/scripts/mo-review-report.mjs";

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

test("a namespace is unguessable, private, and names itself", () => {
  const created = namespace();
  spaces.push(created.dir);
  assert.equal(statSync(created.dir).mode & 0o777, 0o700);
  assert.equal(basename(created.dir), created.pairId);
  assert.ok(realpathSync(created.dir).startsWith(`${realpathSync(tmpdir())}/`));
  // Twelve hex chosen here plus the six `mkdtemp` appends: a guessable name is
  // a pair somebody else can read or occupy.
  const random = /^mo-review-([a-f0-9]{12})-(.{6})$/u.exec(created.pairId);
  assert.ok(random, created.pairId);
  assert.equal(random[1].length + random[2].length, 18);
});

test("staging publishes the validated buffer and proves it is that inode", () => {
  const created = namespace();
  spaces.push(created.dir);
  const text = report();
  const staged = stage({
    dir: created.dir,
    slot: "A",
    vendor: "claude",
    buffer: Buffer.from(text, "utf8"),
    expected: context(),
  });
  assert.equal(staged.status, "staged");
  assert.equal(staged.bytes, Buffer.byteLength(text));
  assert.equal(staged.path, join(created.dir, "A-claude.md"));
  assert.equal(statSync(staged.path).mode & 0o777, 0o600);
  assert.equal(readFileSync(staged.path, "utf8"), text);
  // The sibling is a step, not a leftover.
  assert.deepEqual(
    readdirSync(created.dir).filter((name) => name.startsWith(".stage-")),
    [],
  );
  const verified = pair({
    dir: created.dir,
    pairId: created.pairId,
    slots: [
      { ...staged, vendor: "claude" },
      { ...staged, slot: "B", vendor: "claude" },
    ],
  });
  assert.equal(verified.status, "unknown");
  assert.equal(verified.slot, "B", "a missing slot is not half a pair");
});

test("an occupied final path keeps its bytes", () => {
  const created = namespace();
  spaces.push(created.dir);
  const final = join(created.dir, "A-claude.md");
  writeFileSync(final, "foreign\n", { mode: 0o600 });
  const staged = stage({
    dir: created.dir,
    slot: "A",
    vendor: "claude",
    buffer: Buffer.from(report(), "utf8"),
    expected: context(),
  });
  assert.equal(staged.reason, "final_exists");
  assert.equal(readFileSync(final, "utf8"), "foreign\n");
  assert.deepEqual(
    readdirSync(created.dir).filter((name) => name.startsWith(".stage-")),
    [],
  );
});

test("a filesystem that cannot link is not a collision", () => {
  assert.equal(linkFailureReason("EEXIST"), "final_exists");
  for (const code of ["EPERM", "ENOSYS", "EXDEV", "EMLINK"]) {
    assert.equal(linkFailureReason(code), "link_unsupported", code);
  }
  assert.equal(linkFailureReason("EACCES"), "permission");
});

test("a report that is not a report is never published", () => {
  const created = namespace();
  spaces.push(created.dir);
  const staged = stage({
    dir: created.dir,
    slot: "A",
    vendor: "claude",
    buffer: Buffer.from(report().replace(/End-Review:.+/u, ""), "utf8"),
    expected: context(),
  });
  assert.equal(staged.reason, "malformed");
  assert.equal(staged.verdict.reason, "footer_mismatch");
  assert.deepEqual(readdirSync(created.dir), []);
  const invalid = stage({
    dir: created.dir,
    slot: "A",
    vendor: "claude",
    buffer: Buffer.concat([Buffer.from(report(), "utf8"), Buffer.from([0xff])]),
    expected: context(),
  });
  assert.equal(invalid.reason, "invalid_utf8");
  const vendor = stage({
    dir: created.dir,
    slot: "A",
    vendor: "Claude Opus",
    buffer: Buffer.from(report(), "utf8"),
    expected: context(),
  });
  assert.equal(vendor.reason, "vendor");
  assert.deepEqual(readdirSync(created.dir), []);
});

test("a slot swapped between staging and delivery is caught by identity, not by name", () => {
  const created = namespace();
  spaces.push(created.dir);
  const slots = ["A", "B"].map((slot) =>
    stage({
      dir: created.dir,
      slot,
      vendor: slot === "A" ? "claude" : "codex",
      buffer: Buffer.from(report({ execution: `ctx_fixture` }), "utf8"),
      expected: context(),
    }),
  );
  const named = slots.map((staged, step) => ({
    ...staged,
    vendor: step === 0 ? "claude" : "codex",
  }));
  assert.equal(pair({ dir: created.dir, pairId: created.pairId, slots: named }).status, "paired");

  // Same length, same inode, different bytes: only the hash can see this.
  const path = join(created.dir, "B-codex.md");
  const bytes = readFileSync(path);
  bytes[bytes.length - 2] = bytes[bytes.length - 2] === 0x78 ? 0x79 : 0x78;
  writeFileSync(path, bytes);
  const tampered = pair({ dir: created.dir, pairId: created.pairId, slots: named });
  assert.equal(tampered.status, "unknown");
  assert.equal(tampered.reason, "identity_changed");
  assert.equal(tampered.slot, "B");

  // A different file at the same path is a different inode.
  rmSync(join(created.dir, "A-claude.md"));
  writeFileSync(join(created.dir, "A-claude.md"), report(), { mode: 0o600 });
  const replaced = pair({ dir: created.dir, pairId: created.pairId, slots: named });
  assert.equal(replaced.reason, "identity_changed");
  assert.equal(replaced.slot, "A");
});

test("the pair line carries both paths and both exact sizes", () => {
  const created = namespace();
  spaces.push(created.dir);
  const slots = [
    { slot: "A", vendor: "claude" },
    { slot: "B", vendor: "codex" },
  ].map(({ slot, vendor }) => ({
    ...stage({
      dir: created.dir,
      slot,
      vendor,
      buffer: Buffer.from(report(), "utf8"),
      expected: context(),
    }),
    vendor,
  }));
  const result = pair({ dir: created.dir, pairId: created.pairId, slots });
  assert.equal(result.status, "paired");
  assert.equal(
    result.line,
    `Review-Pair: ${created.pairId} A=${JSON.stringify(join(created.dir, "A-claude.md"))} ` +
      `A_bytes=${slots[0].bytes} B=${JSON.stringify(join(created.dir, "B-codex.md"))} ` +
      `B_bytes=${slots[1].bytes}`,
  );
});

test("the CLI stages from stdin byte for byte", () => {
  const created = namespace();
  spaces.push(created.dir);
  const text = report();
  const staged = spawnSync(
    process.execPath,
    [
      HELPER,
      "stage",
      "--dir",
      created.dir,
      "--slot",
      "A",
      "--vendor",
      "codex",
      "--dispatch",
      "ctx_fixture",
      "--candidate",
      SHA,
      "--requested",
      "deep",
    ],
    { input: Buffer.from(text, "utf8") },
  );
  assert.equal(staged.status, 0, staged.stderr.toString());
  const line = staged.stdout.toString().trim();
  assert.match(
    line,
    /^MO-REVIEW-STAGE\/1 slot=A path=".*A-codex\.md" bytes=\d+ dev=\d+ ino=\d+ sha256=[a-f0-9]{64}$/u,
  );
  assert.equal(readFileSync(join(created.dir, "A-codex.md"), "utf8"), text);
  assert.match(line, new RegExp(`bytes=${Buffer.byteLength(text)} `, "u"));
});
