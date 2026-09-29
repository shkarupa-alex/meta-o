#!/usr/bin/env node
/**
 * Decide whether one reviewer's authoritative response has the agreed shape,
 * and carry it from the reviewer to its consumer without losing a byte.
 *
 * §A-REVIEW-04 makes that body the whole result of a review, so "is this a
 * report?" has to be answerable by a machine. The rule the caller applied by
 * eye lived inside a test, where the shipped skills could not reach it and
 * where a false `malformed` cost a whole review round. The grammar itself
 * lives in `mo-review-grammar.mjs`; this file is the command surface both the
 * reviewer (`template`, `prepare`, `validate`) and the coordinator (`validate`
 * with `--prepared`, `namespace`, `stage`, `pair`) call.
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
  readFileSync,
  readSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { reportLine, reportTemplate, validateReport } from "./mo-review-grammar.mjs";

export {
  reportLine,
  reportTemplate,
  topLevelParagraphs,
  topLevelProse,
  validateReport,
} from "./mo-review-grammar.mjs";

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

/**
 * Write a validated body to the file the brief named, once.
 *
 * §A-REVIEW-04 lets a reviewer prove, before the irreversible `worker_done`,
 * that the bytes it is about to send are a valid report: the bytes are
 * validated in memory first and only a valid body is written, so a malformed
 * draft leaves no file behind and can simply be corrected. The file is created
 * exclusively — an existing file belongs to some other Dispatch, and writing
 * over it would make the coordinator compare against bytes nobody sent.
 */
export function prepareBody({ path, buffer, expected }) {
  const decoded = decodeReport(buffer);
  if (decoded.error) return { status: "malformed", reason: decoded.error, line: 0 };
  const verdict = validateReport(decoded.text, expected);
  if (verdict.status === "malformed") return verdict;
  let fd;
  try {
    fd = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    return { status: "refused", reason: error.code === "EEXIST" ? "exists" : "unwritable" };
  }
  try {
    writeSync(fd, buffer);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const written = readReportBytes(path);
  if (written.error || !written.buffer.equals(buffer)) {
    return { status: "refused", reason: "identity_changed" };
  }
  return { status: "prepared", path, bytes: buffer.length, verdict };
}

/**
 * The only differences delivery may introduce between prepared and received bytes.
 *
 * `final-newline` is what a shell command substitution does to a body read with
 * `--body "$(cat <file>)"`: it strips the line feed after `End-Review`. The
 * grammar allows at most one there, so this names exactly one byte and no more.
 */
export const NORMALIZATIONS = {
  none: (text) => text,
  "final-newline": (text) => (text.endsWith("\n") ? text.slice(0, -1) : text),
};

/**
 * Compare the body Orca delivered with the file the reviewer prepared.
 *
 * §A-REVIEW-04 keeps two claims apart: a received body that validates is a
 * well-formed report, and a received body equal to the prepared file is the
 * report the reviewer checked. Only the second rules out a delivery that
 * truncated or rewrote a body into another valid one, and it is only provable
 * where the file is readable, so an unreadable file is `unverified`, never
 * `identical`.
 */
export function bodyIdentity(received, preparedPath, normalization = "none") {
  const normalize = NORMALIZATIONS[normalization];
  if (normalize === undefined) return { identity: "unverified", reason: "normalization" };
  const prepared = readReportBytes(preparedPath);
  if (prepared.error) return { identity: "unverified", reason: prepared.error };
  const left = normalize(received.toString("utf8"));
  const right = normalize(prepared.buffer.toString("utf8"));
  return { identity: left === right ? "identical" : "different", reason: normalization };
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
 * §A-RESPONSE-03 accepts an acknowledgement only for this pair, these slots and
 * the published sizes; anything else is an absent acknowledgement.
 */
export function checkAck(line, { kind, pairId, bytes }) {
  const match = ACK.exec(String(line).trim());
  if (match === null || match[1] !== kind || match[2] !== pairId) {
    return { status: "mismatched", reason: "form" };
  }
  const acknowledged = Object.fromEntries(
    match[3]
      .trim()
      .split(" ")
      .map((part) => part.split("=")),
  );
  const slots = Object.keys(bytes).sort();
  if (JSON.stringify(Object.keys(acknowledged).sort()) !== JSON.stringify(slots)) {
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

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag.startsWith("--") || argv[index + 1] === undefined) {
      throw new Error(`malformed argument near "${flag}"`);
    }
    options[flag.slice(2)] = argv[index + 1];
  }
  return options;
}

/**
 * The only shape a pair may take on a public surface.
 *
 * §A-REVIEW-04 lets a caller publish that a review happened, not what it
 * found: an index line on a public surface is the finding, and once it is out
 * there the reviewer's boundary has already been crossed. Counts are summed
 * component-wise and duplicates are counted twice, because deduplicating is a
 * judgement the caller is not the one to make.
 */
export function publicSummary({ candidate, verdict, counts }) {
  const summed = [0, 1, 2, 3].map((severity) =>
    counts.reduce((total, slot) => total + slot[severity], 0),
  );
  const parts = summed.map((total, severity) => `P${severity}=${total}`).join(" ");
  return `Review-Pair-Verdict/1 candidate=${candidate} verdict=${verdict} ${parts}`;
}

/**
 * The one question a human requester who asked for one may receive.
 *
 * §A-REVIEW-04 keeps the finding with the reviewer: the requester gets the
 * index line as written, where to read the rest, and a question they can
 * actually answer. Paraphrasing the body here is how a product decision ends
 * up made against a summary nobody reviewed.
 */
export function businessQuestion({ slot, vendor, indexLine, path, question, hypothesis }) {
  const key = /^(F-\d{3})\b/u.exec(indexLine)?.[1];
  if (key === undefined) return { status: "unknown", reason: "index_line" };
  return {
    status: "asked",
    text:
      `${slot}:${key} (${vendor}) ${indexLine}\n` +
      `Full report: ${path}\n` +
      `Question: ${question}\n` +
      `Recommended: ${hypothesis}`,
  };
}

function require_(options, names) {
  for (const name of names) {
    if (options[name] === undefined) throw new Error(`--${name} is required`);
  }
}

function expectationOf(options) {
  require_(options, ["dispatch", "candidate", "requested"]);
  return {
    execution: options.dispatch,
    candidate: options.candidate,
    requestedMode: options.requested,
    effectiveMode: options.effective,
  };
}

function commandValidate(options) {
  require_(options, ["file"]);
  const bytes = options.file === "-" ? { buffer: readFileSync(0) } : readReportBytes(options.file);
  if (bytes.error) {
    process.stdout.write(`MO-REVIEW-REPORT/1 status=malformed reason=${bytes.error} line=0\n`);
    return 1;
  }
  const decoded = decodeReport(bytes.buffer);
  if (decoded.error) {
    process.stdout.write("MO-REVIEW-REPORT/1 status=malformed reason=invalid_utf8 line=0\n");
    return 1;
  }
  const result = validateReport(decoded.text, expectationOf(options));
  process.stdout.write(`${reportLine(result)}\n`);
  if (options.prepared === undefined) return result.status === "valid" ? 0 : 1;
  const normalization = options.normalization ?? "none";
  if (NORMALIZATIONS[normalization] === undefined) {
    throw new Error("--normalization must be none or final-newline");
  }
  const identity = bodyIdentity(bytes.buffer, options.prepared, normalization);
  process.stdout.write(
    `MO-REVIEW-BODY/1 prepared_body_identity=${identity.identity} reason=${identity.reason}\n`,
  );
  return result.status === "valid" && identity.identity !== "different" ? 0 : 1;
}

function commandPrepare(options) {
  require_(options, ["file"]);
  const result = prepareBody({
    path: options.file,
    buffer: readFileSync(0),
    expected: expectationOf(options),
  });
  if (result.status === "prepared") {
    process.stdout.write(`${reportLine(result.verdict)}\n`);
    process.stdout.write(
      `MO-REVIEW-BODY/1 status=prepared path=${JSON.stringify(result.path)} bytes=${result.bytes}\n`,
    );
    return 0;
  }
  if (result.status === "refused") {
    process.stdout.write(`MO-REVIEW-BODY/1 status=refused reason=${result.reason}\n`);
    return 1;
  }
  process.stdout.write(`${reportLine(result)}\n`);
  return 1;
}

function commandTemplate(options) {
  require_(options, ["verdict", "dispatch", "candidate", "requested", "effective"]);
  const template = reportTemplate({
    verdict: options.verdict,
    dispatch: options.dispatch,
    candidate: options.candidate,
    requested: options.requested,
    effective: options.effective,
    reason: options["unknown-reason"],
  });
  if (template.error) throw new Error(template.error);
  process.stdout.write(template.text);
  return 0;
}

function commandStage(options) {
  require_(options, ["dir", "slot", "vendor"]);
  const source = options.file === undefined || options.file === "-" ? null : options.file;
  const bytes = source === null ? { buffer: readFileSync(0) } : readReportBytes(source);
  if (bytes.error) {
    process.stdout.write(`MO-REVIEW-STAGE/1 status=unknown reason=${bytes.error}\n`);
    return 1;
  }
  const result = stage({
    dir: options.dir,
    slot: options.slot,
    vendor: options.vendor,
    buffer: bytes.buffer,
    expected: expectationOf(options),
  });
  if (result.status !== "staged") {
    process.stdout.write(`MO-REVIEW-STAGE/1 status=unknown reason=${result.reason}\n`);
    return 1;
  }
  process.stdout.write(
    `MO-REVIEW-STAGE/1 slot=${result.slot} path=${JSON.stringify(result.path)} ` +
      `bytes=${result.bytes} dev=${result.dev} ino=${result.ino} sha256=${result.sha256}\n`,
  );
  return 0;
}

function slotOption(options, slot) {
  const prefix = slot.toLowerCase();
  require_(options, [
    `${prefix}-vendor`,
    `${prefix}-bytes`,
    `${prefix}-dev`,
    `${prefix}-ino`,
    `${prefix}-sha256`,
  ]);
  return {
    slot,
    vendor: options[`${prefix}-vendor`],
    bytes: Number(options[`${prefix}-bytes`]),
    dev: Number(options[`${prefix}-dev`]),
    ino: Number(options[`${prefix}-ino`]),
    sha256: options[`${prefix}-sha256`],
  };
}

function commandPreview(options) {
  require_(options, ["dir", "slot"]);
  if (!["A", "B"].includes(options.slot)) throw new Error("--slot must be A or B");
  const result = preview({
    dir: options.dir,
    pairId: basename(options.dir),
    slot: slotOption(options, options.slot),
  });
  if (result.status !== "previewed") {
    process.stdout.write(
      `MO-REVIEW-PAIR/1 status=unknown reason=${result.reason} slot=${result.slot}\n`,
    );
    return 1;
  }
  process.stdout.write(`${result.line}\n`);
  return 0;
}

function commandAck(options) {
  require_(options, ["line", "kind", "pair-id"]);
  const bytes = {};
  for (const slot of ["A", "B"]) {
    const value = options[`${slot.toLowerCase()}-bytes`];
    if (value !== undefined) bytes[slot] = Number(value);
  }
  const result = checkAck(options.line, {
    kind: options.kind,
    pairId: options["pair-id"],
    bytes,
  });
  process.stdout.write(
    `MO-REVIEW-ACK/1 status=${result.status}${result.reason ? ` reason=${result.reason}` : ""}\n`,
  );
  return result.status === "matched" ? 0 : 1;
}

function commandPair(options) {
  require_(options, ["dir"]);
  const slots = ["A", "B"].map((slot) => slotOption(options, slot));
  const result = pair({ dir: options.dir, pairId: basename(options.dir), slots });
  if (result.status !== "paired") {
    process.stdout.write(
      `MO-REVIEW-PAIR/1 status=unknown reason=${result.reason} slot=${result.slot}\n`,
    );
    return 1;
  }
  process.stdout.write(`${result.line}\n`);
  return 0;
}

function main(argv) {
  const commands = {
    template: commandTemplate,
    prepare: commandPrepare,
    validate: commandValidate,
    stage: commandStage,
    pair: commandPair,
    preview: commandPreview,
    ack: commandAck,
  };
  if (argv[0] === "namespace") {
    const created = namespace();
    process.stdout.write(
      `MO-REVIEW-NS/1 dir=${JSON.stringify(created.dir)} pair_id=${created.pairId}\n`,
    );
    return 0;
  }
  const command = commands[argv[0]];
  if (command === undefined) {
    throw new Error(
      "usage: mo-review-report.mjs <namespace|template|prepare|validate|stage|pair|preview|ack> …",
    );
  }
  return command(parseArguments(argv.slice(1)));
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
