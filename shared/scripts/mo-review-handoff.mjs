/**
 * Publish reviewer reports from their slot directories and hand them to one
 * consumer.
 *
 * §A-RESPONSE-03 keeps both reports unchanged, private and readable by exactly
 * the named consumer, and makes every handoff provable by size and content
 * hash. Each reviewer slot has a directory of its own, and its pair id and
 * letter are in that directory's name, so nothing but the name links two slots
 * into a pair. `stage` records what it observed about one validated report in
 * the slot's `stage.json`; `preview` and `pair` read those facts instead of
 * having a coordinator copy sizes, inodes and hashes between calls by hand,
 * and both observe the file again, so a report changed after `stage` is still
 * caught. The report grammar is not decided here: a body is staged only after
 * `mo-review-grammar.mjs` accepted the exact bytes that were read.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { parseRound, roundLine, validateReport } from "./mo-review-grammar.mjs";

/** The two reviewer slots of a pair, in the order a pair names them. */
export const SLOTS = ["A", "B"];
/** §A-RESPONSE-03 the one file of a slot directory that records its staged report. */
export const FACTS_FILE = "stage.json";
/** §A-RESPONSE-03 the name `stage` gives received bytes it publishes itself. */
export const RECEIVED_FILE = "worker-done.md";

const PAIR_ID = /^[a-f0-9]{12}$/u;
const SLOT_DIR = /^mo-review-([a-f0-9]{12})-([AB])-[A-Za-z0-9]{6}$/u;
const VENDOR = /^[a-z0-9][a-z0-9-]{0,31}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const CREATE = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW;
// A report that answers another call is not malformed in itself: it is
// somebody else's report, and the coordinator needs to tell the two apart.
const IDENTITY_REASONS = new Set(["execution_mismatch", "candidate_mismatch", "mode_mismatch"]);

/**
 * Read one report as bytes, refusing a source that is not a plain file.
 *
 * §A-REVIEW-04 treats the report as evidence, and evidence read through a
 * symlink is evidence about whatever the link pointed at when it was followed.
 * The descriptor opened here is the only thing read afterwards, and its
 * identity is returned with the bytes it gave.
 */
export function readReportBytes(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    return { error: error.code === "ELOOP" ? "symlink" : "unreadable" };
  }
  try {
    const stat = fstatSync(fd, { bigint: true });
    if (!stat.isFile()) return { error: "not_regular_file" };
    const size = Number(stat.size);
    const buffer = Buffer.alloc(size);
    let read = 0;
    while (read < size) {
      const chunk = readSync(fd, buffer, read, size - read, read);
      if (chunk === 0) break;
      read += chunk;
    }
    return {
      buffer: buffer.subarray(0, read),
      dev: stat.dev.toString(),
      ino: stat.ino.toString(),
    };
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

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/**
 * Create the two private slot directories of one pair.
 *
 * §A-RESPONSE-03 gives each reviewer a directory of its own, so the brief of
 * slot B never has to name a path under slot A (§A-REVIEW-02 keeps the two
 * reviews independent by instruction, and a shared directory would put the
 * other report one `ls` away). The pair id and the slot letter are encoded in
 * the name `mo-review-<pair_id>-<slot>-<random>`; that name is the only link
 * between the two, and no file records it. `mkdtemp` adds six random
 * characters, and the mode is narrowed explicitly because a permissive umask
 * would otherwise decide it. There is no pair directory yet: `pair` creates it
 * only once both reports are staged.
 */
export function namespace() {
  const previous = process.umask(0o077);
  const created = [];
  try {
    const pairId = randomBytes(6).toString("hex");
    for (const slot of SLOTS) {
      const dir = mkdtempSync(join(tmpdir(), `mo-review-${pairId}-${slot}-`));
      created.push(dir);
      chmodSync(dir, 0o700);
    }
    return { pairId, slots: { A: created[0], B: created[1] } };
  } catch (error) {
    // Half a pair is no pair: the directory already made is ours and empty.
    for (const dir of created) rmdirSync(dir);
    throw error;
  } finally {
    process.umask(previous);
  }
}

/**
 * The pair id and slot letter a slot directory's own name carries, or `null`.
 *
 * §A-RESPONSE-03 reads the link between two slots from where `namespace` wrote
 * it. A symbolic link or anything but a directory is not a slot, whatever its
 * name says.
 */
export function slotIdentity(dir) {
  const match = SLOT_DIR.exec(basename(resolve(dir)));
  if (match === null) return null;
  try {
    if (!lstatSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  return { pairId: match[1], slot: match[2] };
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

/** Write a whole buffer to a descriptor and flush it. */
function writeAll(fd, buffer) {
  let written = 0;
  while (written < buffer.length) written += writeSync(fd, buffer, written);
  fsyncSync(fd);
}

/**
 * The report a slot stages: the reviewer's own file in that slot, or received
 * bytes the coordinator has to publish there itself.
 */
function stagedSource(slotDir, file, buffer) {
  if (buffer !== undefined) return { buffer };
  if (resolve(dirname(file)) !== resolve(slotDir) || basename(file) === FACTS_FILE) {
    return { error: "report_outside_slot" };
  }
  return readReportBytes(file);
}

/** §A-RESPONSE-03 names what a report that fails validation is to `stage`. */
function refusal(verdict) {
  if (verdict.reason === "round_mismatch") return { reason: "round_mismatch", verdict };
  if (IDENTITY_REASONS.has(verdict.reason)) {
    return { reason: "report_identity_mismatch", verdict };
  }
  return { reason: "malformed", verdict };
}

/** Publish received bytes into the slot under a name nobody else uses. */
function publishReceived(slotDir, buffer) {
  const path = join(slotDir, RECEIVED_FILE);
  let fd;
  try {
    fd = openSync(path, CREATE, 0o600);
  } catch (error) {
    return { error: error.code === "EEXIST" ? "final_exists" : "permission" };
  }
  try {
    writeAll(fd, buffer);
    const stat = fstatSync(fd, { bigint: true });
    return { path, buffer, dev: stat.dev.toString(), ino: stat.ino.toString() };
  } finally {
    closeSync(fd);
  }
}

/**
 * Validate one report of a slot and record what was observed about it.
 *
 * §A-RESPONSE-03 binds the coordinator's own values to the report once: the
 * pair id and slot must be the ones the slot directory's name carries, the
 * body must answer this Dispatch, candidate, mode and `Round`, and only then
 * is `stage.json` created, exclusively and `0600`, with the bytes, device,
 * inode and sha256 of the file it describes. It is never rewritten: a second
 * `stage` of the same slot is refused, and a missing or broken record is
 * reported, never recreated by a consumer. Bytes received from a reviewer on
 * another host are written into the slot first, exclusively, so both cases
 * end as one file in the slot that `preview` and `pair` can observe again.
 */
export function stage({ slotDir, slot, pairId, dispatch, vendor, file, buffer, expected }) {
  const identity = slotIdentity(slotDir);
  if (identity === null || identity.pairId !== pairId || identity.slot !== slot) {
    return { status: "unknown", reason: "slot_identity_mismatch" };
  }
  if (!VENDOR.test(vendor ?? "")) return { status: "unknown", reason: "vendor" };
  const source = stagedSource(slotDir, file, buffer);
  if (source.error) return { status: "unknown", reason: source.error };
  const decoded = decodeReport(source.buffer);
  if (decoded.error) return { status: "unknown", reason: decoded.error };
  const verdict = validateReport(decoded.text, { ...expected, execution: dispatch });
  if (verdict.status === "malformed") return { status: "unknown", ...refusal(verdict) };
  const factsPath = join(slotDir, FACTS_FILE);
  let fd;
  try {
    fd = openSync(factsPath, CREATE, 0o600);
  } catch (error) {
    return { status: "unknown", reason: error.code === "EEXIST" ? "stage_exists" : "permission" };
  }
  try {
    const published = buffer === undefined ? { ...source, path: file } : null;
    const report = published ?? publishReceived(slotDir, source.buffer);
    if (report.error) {
      // The record was claimed by this call and is still empty: leaving it
      // would answer `facts_malformed` for a slot nothing was staged in.
      unlinkSync(factsPath);
      return { status: "unknown", reason: report.error };
    }
    const facts = {
      schema_version: 1,
      pair_id: pairId,
      slot,
      dispatch,
      vendor,
      candidate: expected.candidate,
      execution: dispatch,
      round: { ...expected.round },
      report: {
        basename: basename(report.path),
        bytes: source.buffer.length,
        dev: report.dev,
        ino: report.ino,
        sha256: sha256(source.buffer),
      },
    };
    writeAll(fd, Buffer.from(`${JSON.stringify(facts, null, 2)}\n`, "utf8"));
    return {
      status: "staged",
      slot,
      path: join(slotDir, facts.report.basename),
      bytes: facts.report.bytes,
      sha256: facts.report.sha256,
      verdict,
    };
  } finally {
    closeSync(fd);
    syncDirectory(slotDir);
  }
}

/** Whether a recorded round is the integers and fragment `parseRound` gives back. */
function roundShaped(round) {
  const fields = [round?.attempt, round?.limit, round?.deepReads];
  if (!fields.every(Number.isSafeInteger)) return false;
  const line = roundLine(round);
  return roundLine(parseRound(line.slice("Round: ".length)).round) === line;
}

const matches = (pattern) => (value) => typeof value === "string" && pattern.test(value);

// The schema `stage` writes, field by field; a record with any other field, or
// one of these in another shape, was not written by `stage`.
const FACT_FIELDS = {
  schema_version: (value) => value === 1,
  pair_id: matches(PAIR_ID),
  slot: (value) => SLOTS.includes(value),
  dispatch: matches(/^\S+$/u),
  vendor: matches(VENDOR),
  candidate: matches(/^[a-f0-9]{40}$/u),
  execution: matches(/^\S+$/u),
  round: roundShaped,
  report: (report) => fieldsShaped(report, REPORT_FIELDS),
};
const REPORT_FIELDS = {
  basename: (value) =>
    typeof value === "string" && value === basename(value) && value !== FACTS_FILE,
  bytes: Number.isSafeInteger,
  dev: matches(DECIMAL),
  ino: matches(DECIMAL),
  sha256: matches(SHA256),
};

/** Whether an object has exactly the fields of a schema, each in its shape. */
function fieldsShaped(object, schema) {
  if (object === null || typeof object !== "object") return false;
  const keys = Object.keys(object);
  const names = Object.keys(schema);
  return (
    keys.length === names.length &&
    names.every((name) => Object.hasOwn(object, name) && schema[name](object[name]))
  );
}

/** Whether one parsed `stage.json` has exactly the schema `stage` writes. */
function factsShaped(facts) {
  return fieldsShaped(facts, FACT_FIELDS) && facts.execution === facts.dispatch;
}

/**
 * Read the facts `stage` recorded in one slot directory.
 *
 * §A-RESPONSE-03 never recreates them: an absent record is `stage_missing`,
 * and one that does not parse, does not have the schema `stage` writes, or
 * names another pair or slot than its own directory is `facts_malformed`.
 */
export function readFacts(slotDir) {
  const identity = slotIdentity(slotDir);
  if (identity === null) return { status: "unknown", reason: "slot_identity_mismatch" };
  const read = readReportBytes(join(slotDir, FACTS_FILE));
  if (read.error === "unreadable") return { status: "unknown", reason: "stage_missing" };
  if (read.error) return { status: "unknown", reason: "facts_malformed" };
  let facts;
  try {
    facts = JSON.parse(read.buffer.toString("utf8"));
  } catch {
    return { status: "unknown", reason: "facts_malformed" };
  }
  if (!factsShaped(facts) || facts.pair_id !== identity.pairId || facts.slot !== identity.slot) {
    return { status: "unknown", reason: "facts_malformed" };
  }
  return { status: "read", facts };
}

/**
 * Observe a staged report again and prove it is still what `stage` recorded.
 *
 * §A-RESPONSE-03 hands a consumer a path, and a path is a name: between
 * staging and delivery the name can point somewhere else. Device, inode, size
 * and content hash are checked together because each alone is reusable.
 */
function observeReport(slotDir, facts) {
  const path = join(slotDir, facts.report.basename);
  const read = readReportBytes(path);
  if (
    read.error ||
    read.dev !== facts.report.dev ||
    read.ino !== facts.report.ino ||
    read.buffer.length !== facts.report.bytes ||
    sha256(read.buffer) !== facts.report.sha256
  ) {
    return { status: "unknown", reason: "identity_changed" };
  }
  return { status: "observed", path, buffer: read.buffer };
}

/**
 * Hand over one slot early, unchanged, as a preview rather than a verdict.
 *
 * §A-RESPONSE-03 names the executor as a second consumer when the owner
 * approved an early repair: it reads the first complete report straight from
 * its slot while the other reviewer still works on the old SHA. Only the slot's
 * own facts are read, so the preview names no path of the other slot and no
 * pair directory, and the pair handoff still follows the second report.
 */
export function preview({ slotDir, slot }) {
  const identity = slotIdentity(slotDir);
  if (identity === null || identity.slot !== slot) {
    return { status: "unknown", reason: "slot_identity_mismatch", slot };
  }
  const read = readFacts(slotDir);
  if (read.status !== "read") return { ...read, slot };
  const observed = observeReport(slotDir, read.facts);
  if (observed.status !== "observed") return { ...observed, slot };
  return {
    status: "previewed",
    bytes: read.facts.report.bytes,
    line: `Review-Preview: ${read.facts.pair_id} ${slot}=${JSON.stringify(observed.path)} ${slot}_bytes=${read.facts.report.bytes}`,
  };
}

/** §A-RESPONSE-03 names the first way two staged slots fail to be one pair. */
function pairMismatch(identities, facts, expect) {
  for (const slot of SLOTS) {
    if (identities[slot].pairId !== expect.pairId || facts[slot].pair_id !== expect.pairId) {
      return { reason: "pair_mismatch", slot };
    }
  }
  for (const slot of SLOTS) {
    if (facts[slot].candidate !== expect.candidate) return { reason: "candidate_mismatch", slot };
  }
  for (const slot of SLOTS) {
    if (roundLine(facts[slot].round) !== roundLine(expect.round)) {
      return { reason: "round_mismatch", slot };
    }
  }
  if (facts.A.dispatch === facts.B.dispatch) return { reason: "dispatch_reused" };
  if (facts.A.vendor === "unknown" || facts.B.vendor === "unknown") {
    return { reason: "vendor_unproven" };
  }
  if (facts.A.vendor === facts.B.vendor) return { reason: "vendor_not_diverse" };
  return null;
}

/** Copy verified bytes into the new pair directory, exclusively, and prove the copy. */
function copyInto(dir, slot, vendor, buffer, facts) {
  const path = join(dir, `${slot}-${vendor}.md`);
  let fd;
  try {
    fd = openSync(path, CREATE, 0o600);
  } catch (error) {
    return { reason: error.code === "EEXIST" ? "final_exists" : "permission", slot };
  }
  try {
    writeAll(fd, buffer);
  } finally {
    closeSync(fd);
  }
  const copy = readReportBytes(path);
  if (copy.error || copy.buffer.length !== facts.bytes || sha256(copy.buffer) !== facts.sha256) {
    return { reason: "identity_changed", slot };
  }
  return { path };
}

/**
 * Prove two staged slots form the expected pair and publish both reports.
 *
 * §A-RESPONSE-03 lets nothing but the coordinator's own expectation and the
 * two `stage.json` records decide that: slots A and B of one pair id, the
 * expected candidate and `Round`, two different Dispatches and two known,
 * different model vendors (§A-REVIEW-02 makes vendor diversity the point of
 * the pair, and `unknown` proves none). Only then is a pair directory created
 * under system temp with `mkdtemp`, mode `0700`, and both reports are copied
 * into it exclusively from the bytes just observed, with size and sha256 of
 * each copy checked against the facts.
 */
export function pair({ slotA, slotB, expect }) {
  const dirs = { A: slotA, B: slotB };
  const identities = { A: slotIdentity(slotA), B: slotIdentity(slotB) };
  if (identities.A?.slot !== "A" || identities.B?.slot !== "B") {
    return { status: "unknown", reason: "pair_mismatch" };
  }
  const facts = {};
  for (const slot of SLOTS) {
    const read = readFacts(dirs[slot]);
    if (read.status !== "read") return { ...read, slot };
    facts[slot] = read.facts;
  }
  const mismatch = pairMismatch(identities, facts, expect);
  if (mismatch !== null) return { status: "unknown", ...mismatch };
  const observed = {};
  for (const slot of SLOTS) {
    observed[slot] = observeReport(dirs[slot], facts[slot]);
    if (observed[slot].status !== "observed") return { ...observed[slot], slot };
  }
  const previous = process.umask(0o077);
  let dir;
  try {
    dir = mkdtempSync(join(tmpdir(), `mo-review-${expect.pairId}-pair-`));
    chmodSync(dir, 0o700);
  } finally {
    process.umask(previous);
  }
  const copies = {};
  for (const slot of SLOTS) {
    const copied = copyInto(
      dir,
      slot,
      facts[slot].vendor,
      observed[slot].buffer,
      facts[slot].report,
    );
    if (copied.reason) return { status: "unknown", ...copied, dir };
    copies[slot] = { path: copied.path, bytes: facts[slot].report.bytes };
  }
  syncDirectory(dir);
  const parts = SLOTS.map(
    (slot) => `${slot}=${JSON.stringify(copies[slot].path)} ${slot}_bytes=${copies[slot].bytes}`,
  );
  return {
    status: "ok",
    pairId: expect.pairId,
    dir,
    a: copies.A,
    b: copies.B,
    line: `Review-Pair: ${expect.pairId} ${parts.join(" ")}`,
  };
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
  if (kind === "Preview") return slots.length === 1 && SLOTS.includes(slots[0]);
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
