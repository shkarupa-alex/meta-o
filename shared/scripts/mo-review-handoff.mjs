/**
 * Publish reviewer reports into their slots and hand them to one consumer.
 *
 * §A-RESPONSE-03 keeps both reports unchanged, private and readable by exactly
 * the named consumer, and makes every handoff provable by size and content
 * hash. The report grammar is not decided here: a body is published only after
 * `mo-review-grammar.mjs` accepted the exact bytes that get written.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  mkdtempSync,
  openSync,
  readSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { validateReport } from "./mo-review-grammar.mjs";

/**
 * Read one report as bytes, refusing a source that is not a plain file.
 *
 * §A-REVIEW-04 treats the report as evidence, and evidence read through a
 * symlink is evidence about whatever the link pointed at when it was followed.
 * The descriptor opened here is the only thing read afterwards.
 */
export function readReportBytes(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    return { error: error.code === "ELOOP" ? "symlink" : "unreadable" };
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { error: "not_regular_file" };
    const buffer = Buffer.alloc(stat.size);
    let read = 0;
    while (read < stat.size) {
      const chunk = readSync(fd, buffer, read, stat.size - read, read);
      if (chunk === 0) break;
      read += chunk;
    }
    return { buffer: buffer.subarray(0, read) };
  } finally {
    closeSync(fd);
  }
}

/** §A-REVIEW-04 rejects bytes that are not the UTF-8 the protocol is written in. */
export function decodeReport(buffer) {
  const text = buffer.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buffer)) return { error: "invalid_utf8" };
  return { text };
}

const VENDOR = /^[a-z0-9][a-z0-9-]{0,31}$/u;
const LINK_UNSUPPORTED = new Set(["EPERM", "ENOSYS", "EXDEV", "EMLINK"]);

/**
 * §A-RESPONSE-03 separates "somebody is already there" from "links do not work here".
 *
 * A filesystem that refuses hard links cannot be produced in a test without
 * mounting one, so the classification is a named function rather than an
 * `if` buried in a `catch` that nothing can reach.
 */
export function linkFailureReason(code) {
  if (code === "EEXIST") return "final_exists";
  if (LINK_UNSUPPORTED.has(code)) return "link_unsupported";
  return "permission";
}

/**
 * Create the one-time directory a pair is published into.
 *
 * §A-RESPONSE-03 keeps both reports readable by exactly one consumer, so the
 * name has to be unguessable rather than merely unique: `mkdtemp` adds six
 * random characters to the twelve chosen here, and the mode is narrowed
 * explicitly because a permissive umask would otherwise decide it.
 */
export function namespace() {
  const previous = process.umask(0o077);
  try {
    const dir = mkdtempSync(join(tmpdir(), `mo-review-${randomBytes(6).toString("hex")}-`));
    chmodSync(dir, 0o700);
    return { dir, pairId: basename(dir) };
  } finally {
    process.umask(previous);
  }
}

/** §A-RESPONSE-03 flushes the directory entry; a refusal here is diagnostic only. */
function syncDirectory(dir) {
  let dfd;
  try {
    dfd = openSync(dir, constants.O_RDONLY);
    fsyncSync(dfd);
  } catch {
    // Network and virtual filesystems are entitled to refuse this, and the
    // proof of publication is dev/ino/size/sha256, not durability.
  } finally {
    if (dfd !== undefined) closeSync(dfd);
  }
}

/** §A-RESPONSE-03 publishes the written inode itself, never a path reopened by name. */
function linkIntoPlace(fd, sibling, final, buffer) {
  const first = fstatSync(fd);
  if (first.size !== buffer.length || first.nlink !== 1) {
    return { status: "unknown", reason: "identity_changed" };
  }
  try {
    linkSync(sibling, final);
  } catch (error) {
    return { status: "unknown", reason: linkFailureReason(error.code) };
  }
  const second = fstatSync(fd);
  if (second.dev !== first.dev || second.ino !== first.ino || second.nlink !== 2) {
    return { status: "unknown", reason: "identity_changed" };
  }
  return { status: "staged", dev: first.dev, ino: first.ino };
}

/**
 * Validate exactly the bytes that get published, then publish those bytes.
 *
 * §A-RESPONSE-03 refuses the gap between "checked a file" and "published a
 * file": the buffer is validated, hashed and written once, and the identity of
 * the published inode is proven against the descriptor that wrote it. A
 * rename would overwrite whatever sat at the final path; a hard link fails
 * closed instead, and a failure leaves the existing final path untouched.
 */
export function stage({ dir, slot, vendor, buffer, expected }) {
  if (!["A", "B"].includes(slot)) return { status: "unknown", reason: "slot" };
  if (!VENDOR.test(vendor)) return { status: "unknown", reason: "vendor" };
  const decoded = decodeReport(buffer);
  if (decoded.error) return { status: "unknown", reason: decoded.error };
  const verdict = validateReport(decoded.text, expected);
  if (verdict.status === "malformed") return { status: "unknown", reason: "malformed", verdict };
  const sibling = join(dir, `.stage-${randomBytes(8).toString("hex")}`);
  const final = join(dir, `${slot}-${vendor}.md`);
  const flags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW;
  const fd = openSync(sibling, flags, 0o600);
  try {
    writeSync(fd, buffer);
    fsyncSync(fd);
    const placed = linkIntoPlace(fd, sibling, final, buffer);
    if (placed.status !== "staged") return placed;
    return {
      status: "staged",
      slot,
      path: final,
      bytes: buffer.length,
      dev: placed.dev,
      ino: placed.ino,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    };
  } finally {
    closeSync(fd);
    unlinkSync(sibling);
    syncDirectory(dir);
  }
}

/**
 * Prove both published slots are still the inodes that were staged.
 *
 * §A-RESPONSE-03 hands a consumer two paths, and a path is a name: between
 * staging and delivery the name can point somewhere else. Device, inode, size
 * and content hash are checked together because each alone is reusable.
 */
export function pair({ dir, pairId, slots }) {
  const parts = verifySlots(dir, slots);
  if (!Array.isArray(parts)) return parts;
  return { status: "paired", line: `Review-Pair: ${pairId} ${parts.join(" ")}` };
}

/**
 * Hand over one slot early, unchanged, as a preview rather than a verdict.
 *
 * §A-RESPONSE-03 names the executor as a second consumer when the owner
 * approved an early repair: it reads the first complete report while the other
 * reviewer still works on the old SHA. The slot is checked exactly as a pair
 * slot is, and the pair handoff still follows once the second report arrives.
 */
export function preview({ dir, pairId, slot }) {
  const parts = verifySlots(dir, [slot]);
  if (!Array.isArray(parts)) return parts;
  return { status: "previewed", line: `Review-Preview: ${pairId} ${parts[0]}` };
}

const ACK = /^Review-(Preview|Handoff)-Ack: (\S+)((?: [AB]=\d+)+)$/u;

/**
 * Whether the expected sizes have the shape the acknowledgement kind needs.
 *
 * §A-RESPONSE-03 acknowledges a pair handoff by both slots and a preview by
 * exactly one, so any other set of sizes is a call that can match nothing.
 */
export function ackSlotsValid(kind, slots) {
  if (kind === "Handoff") return slots.length === 2 && slots.includes("A") && slots.includes("B");
  if (kind === "Preview") return slots.length === 1 && ["A", "B"].includes(slots[0]);
  return false;
}

/**
 * §A-RESPONSE-03 accepts an acknowledgement only for this pair, these slots and
 * the published sizes; anything else is an absent acknowledgement. Each slot
 * appears once: a repeated slot, even with the same size, names two sizes for
 * one report and acknowledges neither.
 */
export function checkAck(line, { kind, pairId, bytes }) {
  const slots = Object.keys(bytes).sort();
  if (!ackSlotsValid(kind, slots)) return { status: "mismatched", reason: "expected" };
  const match = ACK.exec(String(line).trim());
  if (match === null || match[1] !== kind || match[2] !== pairId) {
    return { status: "mismatched", reason: "form" };
  }
  const fields = match[3]
    .trim()
    .split(" ")
    .map((part) => part.split("="));
  const acknowledged = Object.fromEntries(fields);
  if (
    fields.length !== Object.keys(acknowledged).length ||
    JSON.stringify(Object.keys(acknowledged).sort()) !== JSON.stringify(slots)
  ) {
    return { status: "mismatched", reason: "slots" };
  }
  for (const slot of slots) {
    if (Number(acknowledged[slot]) !== bytes[slot])
      return { status: "mismatched", reason: "bytes" };
  }
  return { status: "matched" };
}

function verifySlots(dir, slots) {
  const parts = [];
  for (const expected of slots) {
    const path = join(dir, `${expected.slot}-${expected.vendor}.md`);
    let fd;
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch {
      return { status: "unknown", reason: "identity_changed", slot: expected.slot };
    }
    try {
      const stat = fstatSync(fd);
      const buffer = Buffer.alloc(stat.size);
      readSync(fd, buffer, 0, stat.size, 0);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      if (
        stat.dev !== expected.dev ||
        stat.ino !== expected.ino ||
        stat.size !== expected.bytes ||
        sha256 !== expected.sha256
      ) {
        return { status: "unknown", reason: "identity_changed", slot: expected.slot };
      }
    } finally {
      closeSync(fd);
    }
    parts.push(`${expected.slot}=${JSON.stringify(path)} ${expected.slot}_bytes=${expected.bytes}`);
  }
  return parts;
}
