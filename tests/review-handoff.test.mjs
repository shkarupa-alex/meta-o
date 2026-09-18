/**
 * Exercise the finite caller algorithm for lossless pair delivery.
 *
 * This test-only consumer proves §A-RESPONSE-03 without adding a runtime proxy
 * or a second source of lifecycle state. Publication itself is not reimplemented
 * here: it is the shipped `mo-review-report.mjs`, so what this file holds is the
 * part around it — acknowledgement, re-delivery and cleanup.
 */

import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { test } from "node:test";

import { namespace, pair, stage } from "../shared/scripts/mo-review-report.mjs";

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
