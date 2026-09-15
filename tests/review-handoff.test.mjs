/**
 * Exercise the finite caller algorithm for lossless pair delivery.
 *
 * This test-only consumer proves §A-RESPONSE-03 without adding a runtime proxy
 * or a second source of lifecycle state.
 */

import assert from "node:assert/strict";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

function publish(directory, slot, payload) {
  const temporary = join(directory, `.${slot}.pending`);
  const final = join(directory, `${slot}.md`);
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeSync(descriptor, payload);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, final);
  assert.ok(lstatSync(final).isFile());
  assert.equal(statSync(final).mode & 0o777, 0o600);
  assert.equal(readFileSync(final, "utf8"), payload);
  return { path: final, bytes: Buffer.byteLength(payload) };
}

function handoffPair(payloads, consumer, human = false) {
  const directory = mkdtempSync(join(tmpdir(), "mo-review-pair-"));
  chmodSync(directory, 0o700);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  assert.ok(realpathSync(directory).startsWith(`${realpathSync(tmpdir())}/`));
  assert.match(basename(directory), /^mo-review-pair-.{6,}$/u);
  const pairId = basename(directory);
  const a = publish(directory, "a", payloads.a);
  const b = publish(directory, "b", payloads.b);
  const expected = `Review-Handoff-Ack: ${pairId} A=${a.bytes} B=${b.bytes}`;
  if (human) return { status: "delivered", directory, attempts: 0, a, b };
  for (let attempts = 1; attempts <= 2; attempts += 1) {
    if (consumer({ pairId, a, b }) === expected) {
      rmSync(directory, { recursive: true });
      return { status: "delivered", directory, attempts };
    }
  }
  return { status: "UNKNOWN", directory, attempts: 2 };
}

test("machine handoff cleans only after exact acknowledgement", () => {
  let calls = 0;
  const result = handoffPair(
    { a: "A\nEnd-Review: a\n", b: "B\nEnd-Review: b\n" },
    ({ pairId, a, b }) => {
      calls += 1;
      return calls === 1 ? "wrong" : `Review-Handoff-Ack: ${pairId} A=${a.bytes} B=${b.bytes}`;
    },
  );
  assert.equal(result.status, "delivered");
  assert.equal(result.attempts, 2);
  assert.equal(existsSync(result.directory), false);
});

test("a second acknowledgement failure is UNKNOWN and preserves evidence", () => {
  const result = handoffPair({ a: "A\nEnd-Review: a\n", b: "B\nEnd-Review: b\n" }, () => "wrong");
  try {
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.attempts, 2);
    assert.equal(existsSync(result.directory), true);
  } finally {
    rmSync(result.directory, { recursive: true });
  }
});

test("human caller receives paths and never triggers automatic cleanup", () => {
  const result = handoffPair(
    { a: "A\nEnd-Review: a\n", b: "B\nEnd-Review: b\n" },
    () => assert.fail("human mode has no machine acknowledgement"),
    true,
  );
  try {
    assert.equal(result.status, "delivered");
    assert.ok(existsSync(result.a.path));
    assert.ok(existsSync(result.b.path));
  } finally {
    rmSync(result.directory, { recursive: true });
  }
});
