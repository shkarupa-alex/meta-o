/**
 * Exercise the finite caller algorithm for lossless pair delivery.
 *
 * This test-only consumer proves §A-RESPONSE-03 without adding a runtime proxy
 * or a second source of lifecycle state.
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

function publish(directory, slot, payload) {
  assert.match(payload, new RegExp(`End-Review: ${slot}\\n$`, "u"));
  const temporary = join(directory, `.${slot}.pending`);
  const final = join(directory, `${slot}.md`);
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeSync(descriptor, payload);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  // A hard-link publishes the already-complete inode atomically and, unlike
  // rename, fails closed when any final path (including a symlink) exists.
  try {
    linkSync(temporary, final);
  } catch (error) {
    unlinkSync(temporary);
    throw new Error(`${slot}: final publication collision; outcome UNKNOWN`, { cause: error });
  }
  unlinkSync(temporary);
  assert.ok(lstatSync(final).isFile());
  assert.equal(statSync(final).mode & 0o777, 0o600);
  assert.equal(readFileSync(final, "utf8"), payload);
  return { path: final, bytes: Buffer.byteLength(payload) };
}

function handoffPair(payloads, consumer, human = false) {
  assert.match(payloads.a, /End-Review: a\n$/u);
  assert.match(payloads.b, /End-Review: b\n$/u);
  const nonce = randomBytes(6).toString("hex");
  const directory = mkdtempSync(join(tmpdir(), `mo-review-pair-${nonce}-`));
  chmodSync(directory, 0o700);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  assert.ok(realpathSync(directory).startsWith(`${realpathSync(tmpdir())}/`));
  assert.match(basename(directory), /^mo-review-pair-[a-f0-9]{12}-.{6}$/u);
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

function consumePair({ pairId, a, b }) {
  const left = readFileSync(a.path, "utf8");
  const right = readFileSync(b.path, "utf8");
  assert.equal(Buffer.byteLength(left), a.bytes);
  assert.equal(Buffer.byteLength(right), b.bytes);
  assert.match(left, /End-Review: a\n$/u);
  assert.match(right, /End-Review: b\n$/u);
  return `Review-Handoff-Ack: ${pairId} A=${a.bytes} B=${b.bytes}`;
}

test("machine handoff cleans only after exact acknowledgement", () => {
  let calls = 0;
  const result = handoffPair({ a: "A\nEnd-Review: a\n", b: "B\nEnd-Review: b\n" }, (delivery) => {
    calls += 1;
    const acknowledgement = consumePair(delivery);
    return calls === 1 ? "wrong" : acknowledgement;
  });
  assert.equal(result.status, "delivered");
  assert.equal(result.attempts, 2);
  assert.equal(existsSync(result.directory), false);
});

test("payload without its complete end marker is rejected before delivery", () => {
  assert.throws(
    () => handoffPair({ a: "truncated", b: "B\nEnd-Review: b\n" }, consumePair),
    /End-Review/u,
  );
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

test("publication collision never overwrites an existing final payload", () => {
  const directory = mkdtempSync(join(tmpdir(), "mo-review-collision-"));
  try {
    const final = join(directory, "a.md");
    const descriptor = openSync(final, "wx", 0o600);
    writeSync(descriptor, "foreign\n");
    closeSync(descriptor);
    assert.throws(() => publish(directory, "a", "A\nEnd-Review: a\n"), /UNKNOWN/u);
    assert.equal(readFileSync(final, "utf8"), "foreign\n");
    assert.equal(existsSync(join(directory, ".a.pending")), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("symlink and non-regular final targets are rejected without mutation", () => {
  const directory = mkdtempSync(join(tmpdir(), "mo-review-target-"));
  try {
    const target = join(directory, "foreign.md");
    const targetDescriptor = openSync(target, "wx", 0o600);
    writeSync(targetDescriptor, "foreign\n");
    closeSync(targetDescriptor);
    symlinkSync(target, join(directory, "a.md"));
    assert.throws(() => publish(directory, "a", "A\nEnd-Review: a\n"), /UNKNOWN/u);
    assert.equal(readFileSync(target, "utf8"), "foreign\n");

    mkdirSync(join(directory, "b.md"));
    assert.throws(() => publish(directory, "b", "B\nEnd-Review: b\n"), /UNKNOWN/u);
    assert.ok(lstatSync(join(directory, "b.md")).isDirectory());
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
