/**
 * Exercise the finite caller algorithm for lossless pair delivery.
 *
 * This test-only consumer proves §A-RESPONSE-03 without adding a runtime proxy
 * or a second source of lifecycle state. Publication itself is not reimplemented
 * here: it is the shipped `mo-review-report.mjs`, so what this file holds is the
 * part around it — acknowledgement, re-delivery and cleanup.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkAck, namespace, pair, preview, stage } from "../shared/scripts/mo-review-report.mjs";

const SHA = "c".repeat(40);

function report(execution) {
  return (
    `Review-Execution: ${execution}\nCandidate: ${SHA}\n` +
    "Mode: requested=deep effective=deep\nDelegation: none\nVerdict: PASS\n" +
    "Counts: P0=0 P1=0 P2=0 P3=0\n\nEvidence report\nGrounding\nintent and clean SHA\n" +
    "Scope and checks\nread-only diff\nFindings\nUnknowns\nnone\nResidual risks\nnone\n" +
    `End-Review: ${execution}\n`
  );
}

function handoffPair(consumer, human = false) {
  const created = namespace();
  const slots = [
    { slot: "A", vendor: "claude", execution: "ctx_a" },
    { slot: "B", vendor: "codex", execution: "ctx_b" },
  ].map(({ slot, vendor, execution }) => {
    const staged = stage({
      dir: created.dir,
      slot,
      vendor,
      buffer: Buffer.from(report(execution), "utf8"),
      expected: {
        execution,
        candidate: SHA,
        requestedMode: "deep",
        effectiveMode: "deep",
      },
    });
    assert.equal(staged.status, "staged", staged.reason);
    return { ...staged, vendor };
  });
  // The pair is proven before anything is handed over: a consumer that reads a
  // path we never verified is reading whatever is at that name now.
  const verified = pair({ dir: created.dir, pairId: created.pairId, slots });
  assert.equal(verified.status, "paired", verified.reason);
  const [a, b] = slots;
  const expected = `Review-Handoff-Ack: ${created.pairId} A=${a.bytes} B=${b.bytes}`;
  if (human) return { status: "delivered", directory: created.dir, attempts: 0, a, b };
  for (let attempts = 1; attempts <= 2; attempts += 1) {
    if (consumer({ pairId: created.pairId, a, b }) === expected) {
      rmSync(created.dir, { recursive: true });
      return { status: "delivered", directory: created.dir, attempts };
    }
  }
  return { status: "UNKNOWN", directory: created.dir, attempts: 2 };
}

const acknowledge = ({ pairId, a, b }) => `Review-Handoff-Ack: ${pairId} A=${a.bytes} B=${b.bytes}`;

test("machine handoff cleans only after exact acknowledgement", () => {
  let calls = 0;
  const result = handoffPair((delivery) => {
    calls += 1;
    return calls === 1 ? "wrong" : acknowledge(delivery);
  });
  assert.equal(result.status, "delivered");
  assert.equal(result.attempts, 2);
  assert.equal(existsSync(result.directory), false);
});

test("a second acknowledgement failure is UNKNOWN and preserves evidence", () => {
  const result = handoffPair(() => "wrong");
  try {
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.attempts, 2);
    assert.equal(existsSync(result.directory), true);
  } finally {
    rmSync(result.directory, { recursive: true });
  }
});

test("an acknowledgement for the wrong sizes is not an acknowledgement", () => {
  const result = handoffPair(
    ({ pairId, a, b }) => `Review-Handoff-Ack: ${pairId} A=${a.bytes} B=${b.bytes + 1}`,
  );
  try {
    assert.equal(result.status, "UNKNOWN");
  } finally {
    rmSync(result.directory, { recursive: true });
  }
});

test("human caller receives paths and never triggers automatic cleanup", () => {
  const result = handoffPair(() => assert.fail("human mode has no machine acknowledgement"), true);
  try {
    assert.equal(result.status, "delivered");
    assert.ok(existsSync(result.a.path));
    assert.ok(existsSync(result.b.path));
  } finally {
    rmSync(result.directory, { recursive: true });
  }
});

test("an early preview hands over one unchanged slot and is acknowledged by its size", () => {
  const created = namespace();
  try {
    const staged = stage({
      dir: created.dir,
      slot: "A",
      vendor: "claude",
      buffer: Buffer.from(report("ctx_a"), "utf8"),
      expected: {
        execution: "ctx_a",
        candidate: SHA,
        requestedMode: "deep",
        effectiveMode: "deep",
      },
    });
    const slot = { ...staged, vendor: "claude" };
    const shown = preview({ dir: created.dir, pairId: created.pairId, slot });
    assert.equal(shown.status, "previewed");
    assert.match(
      shown.line,
      new RegExp(`^Review-Preview: ${created.pairId} A=".+" A_bytes=${staged.bytes}$`, "u"),
    );
    const expect = { kind: "Preview", pairId: created.pairId, bytes: { A: staged.bytes } };
    assert.equal(
      checkAck(`Review-Preview-Ack: ${created.pairId} A=${staged.bytes}`, expect).status,
      "matched",
    );
    // A preview acknowledgement is not a pair acknowledgement, a wrong size is
    // not an acknowledgement, and the other slot is not this one.
    assert.equal(
      checkAck(`Review-Handoff-Ack: ${created.pairId} A=${staged.bytes}`, expect).reason,
      "form",
    );
    assert.equal(
      checkAck(`Review-Preview-Ack: ${created.pairId} A=${staged.bytes + 1}`, expect).reason,
      "bytes",
    );
    assert.equal(
      checkAck(`Review-Preview-Ack: ${created.pairId} B=${staged.bytes}`, expect).reason,
      "slots",
    );
    assert.equal(checkAck(`Review-Preview-Ack: other A=${staged.bytes}`, expect).reason, "form");
    // The pair handoff still needs both slots after a preview.
    const pairExpect = { kind: "Handoff", pairId: created.pairId, bytes: { A: 10, B: 20 } };
    assert.equal(
      checkAck(`Review-Handoff-Ack: ${created.pairId} A=10 B=20`, pairExpect).status,
      "matched",
    );
    assert.equal(
      checkAck(`Review-Handoff-Ack: ${created.pairId} A=10`, pairExpect).reason,
      "slots",
    );
    // A preview of a slot whose file changed after staging is refused.
    rmSync(staged.path);
    assert.equal(preview({ dir: created.dir, pairId: created.pairId, slot }).status, "unknown");
  } finally {
    rmSync(created.dir, { recursive: true, force: true });
  }
});

test("an acknowledgement names each required slot exactly once", () => {
  const handoff = { kind: "Handoff", pairId: "pair", bytes: { A: 10, B: 20 } };
  const previewA = { kind: "Preview", pairId: "pair", bytes: { A: 10 } };
  const previewB = { kind: "Preview", pairId: "pair", bytes: { B: 20 } };
  const status = (line, expect) => checkAck(line, expect).status;
  assert.equal(status("Review-Handoff-Ack: pair A=10 B=20", handoff), "matched");
  assert.equal(status("Review-Preview-Ack: pair A=10", previewA), "matched");
  assert.equal(status("Review-Preview-Ack: pair B=20", previewB), "matched");
  // A repeated slot names two sizes for one report, whichever comes last.
  for (const line of [
    "Review-Handoff-Ack: pair A=9 A=10 B=20",
    "Review-Handoff-Ack: pair A=10 A=9 B=20",
    "Review-Handoff-Ack: pair A=10 A=10 B=20",
    "Review-Handoff-Ack: pair A=10 B=19 B=20",
    "Review-Handoff-Ack: pair A=10 B=20 B=19",
    "Review-Handoff-Ack: pair A=10 B=20 B=20",
    "Review-Handoff-Ack: pair A=10",
    "Review-Handoff-Ack: pair B=20",
  ]) {
    assert.equal(status(line, handoff), "mismatched", line);
  }
  for (const [line, expect] of [
    ["Review-Preview-Ack: pair A=9 A=10", previewA],
    ["Review-Preview-Ack: pair A=10 A=9", previewA],
    ["Review-Preview-Ack: pair A=10 A=10", previewA],
    ["Review-Preview-Ack: pair B=19 B=20", previewB],
    ["Review-Preview-Ack: pair B=20 B=19", previewB],
    ["Review-Preview-Ack: pair B=20 B=20", previewB],
    ["Review-Preview-Ack: pair A=10 B=20", previewA],
  ]) {
    assert.equal(status(line, expect), "mismatched", line);
  }
  // An expected context of the wrong shape acknowledges nothing.
  const partial = { kind: "Handoff", pairId: "pair", bytes: { A: 10 } };
  assert.equal(checkAck("Review-Handoff-Ack: pair A=10", partial).reason, "expected");
  const both = { kind: "Preview", pairId: "pair", bytes: { A: 10, B: 20 } };
  assert.equal(checkAck("Review-Preview-Ack: pair A=10 B=20", both).reason, "expected");
});

test("the ack command refuses a call whose sizes do not fit its kind, in every shipped copy", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const scripts = [
    "shared/scripts/mo-review-report.mjs",
    "skills/mo-reviewer/scripts/mo-review-report.mjs",
    "skills/mo-review-orca/scripts/mo-review-report.mjs",
    "skills/mo-orchestrate-orca/scripts/mo-review-report.mjs",
  ];
  const ack = (script, kind, line, sizes) =>
    spawnSync(
      process.execPath,
      [join(root, script), "ack", "--kind", kind, "--line", line, "--pair-id", "pair", ...sizes],
      { encoding: "utf8" },
    );
  for (const script of scripts) {
    for (const [kind, line, sizes] of [
      ["Handoff", "Review-Handoff-Ack: pair A=10 B=20", ["--b-bytes", "20"]],
      ["Handoff", "Review-Handoff-Ack: pair A=10", ["--a-bytes", "10"]],
      ["Handoff", "Review-Handoff-Ack: pair A=10 B=20", []],
      ["Preview", "Review-Preview-Ack: pair A=10", []],
      ["Preview", "Review-Preview-Ack: pair A=10 B=20", ["--a-bytes", "10", "--b-bytes", "20"]],
    ]) {
      const result = ack(script, kind, line, sizes);
      assert.equal(result.status, 2, `${script} ${kind} ${sizes.join(" ")}`);
      assert.doesNotMatch(result.stdout, /status=matched/u, script);
    }
    for (const [kind, line, sizes] of [
      ["Handoff", "Review-Handoff-Ack: pair A=10 B=20", ["--a-bytes", "10", "--b-bytes", "20"]],
      ["Preview", "Review-Preview-Ack: pair A=10", ["--a-bytes", "10"]],
      ["Preview", "Review-Preview-Ack: pair B=20", ["--b-bytes", "20"]],
    ]) {
      const result = ack(script, kind, line, sizes);
      assert.equal(result.status, 0, `${script} ${result.stderr}`);
      assert.match(result.stdout, /^MO-REVIEW-ACK\/1 status=matched$/mu, script);
    }
    const repeated = ack(script, "Handoff", "Review-Handoff-Ack: pair A=9 A=10 B=20", [
      "--a-bytes",
      "10",
      "--b-bytes",
      "20",
    ]);
    assert.equal(repeated.status, 1, script);
    assert.match(repeated.stdout, /status=mismatched reason=slots/u, script);
  }
});
