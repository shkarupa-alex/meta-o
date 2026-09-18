#!/usr/bin/env node
/**
 * Decide whether one reviewer's authoritative response has the agreed shape.
 *
 * §A-REVIEW-04 makes that body the whole result of a review, so "is this a
 * report?" has to be answerable by a machine. The rule the caller applied by
 * eye lived inside a test, where the shipped skills could not reach it and
 * where a false `malformed` cost a whole review round.
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

import { fromMarkdown } from "mdast-util-from-markdown";

const MODES = new Set(["fast", "deep", "follow_up"]);
const ORDER = ["Grounding", "Scope and checks", "Findings", "Unknowns", "Residual risks"];
const LABELS = [...ORDER, "Evidence report", "Unknown-Account"];
const UNKNOWN_REASONS = new Set([
  "unreadable",
  "candidate_mismatch",
  "dirty_candidate",
  "malformed_report",
  "retrieval_failure",
  "handoff_failure",
  "review_incomplete",
]);

const fail = (reason, line) => ({ status: "malformed", reason, line: line + 1 });

/**
 * The line numbers that are top-level prose, and nothing else.
 *
 * §A-REVIEW-04 says a marker inside a code span, a quote or a list is body
 * evidence: a reviewer quoting `End-Review` while explaining a finding has not
 * ended the report. Only a top-level paragraph of the block AST can carry a
 * structural marker, so the structure is read from the AST and the text is
 * then indexed by line.
 */
export function topLevelProse(text) {
  const positions = new Set();
  for (const node of fromMarkdown(text).children) {
    if (node.type !== "paragraph") continue;
    for (let line = node.position.start.line; line <= node.position.end.line; line += 1) {
      positions.add(line - 1);
    }
  }
  return positions;
}

/** §A-REVIEW-04 reads the anchored envelope before any body byte is trusted. */
function readEnvelope(lines) {
  const shape = [
    /^Review-Execution: (\S+)$/u,
    /^Candidate: [a-f0-9]{40}$/u,
    /^Mode: requested=(\S+) effective=(\S+)$/u,
    null,
    /^Verdict: (\S+)$/u,
    /^Counts: P0=(\d+) P1=(\d+) P2=(\d+) P3=(\d+)$/u,
  ];
  for (const [row, pattern] of shape.entries()) {
    if (pattern !== null && !pattern.test(lines[row] ?? "")) return fail("header_order", row);
  }
  if (lines[3] !== "Delegation: none") return fail("delegation", 3);
  const mode = shape[2].exec(lines[2]);
  if (!MODES.has(mode[1]) || !MODES.has(mode[2])) return fail("header_order", 2);
  const verdict = shape[4].exec(lines[4])[1];
  if (!["PASS", "FINDINGS", "UNKNOWN"].includes(verdict)) return fail("verdict", 4);
  const execution = shape[0].exec(lines[0])[1];
  const counts = shape[5].exec(lines[5]);
  return {
    execution,
    candidate: lines[1].slice("Candidate: ".length),
    requested: mode[1],
    effective: mode[2],
    verdict,
    counts: counts.slice(1).map(Number),
  };
}

/**
 * Check the envelope against what this caller asked for.
 *
 * §A-REVIEW-04 keeps the expected values with the caller: a report that is
 * internally consistent but answers a different dispatch, candidate or mode is
 * somebody else's report, and a stale one reads exactly like a fresh one.
 */
function readHeader(lines, expected) {
  const envelope = readEnvelope(lines);
  if (envelope.status === "malformed") return envelope;
  if (envelope.execution !== expected.execution) return fail("execution_mismatch", 0);
  if (envelope.candidate !== expected.candidate) return fail("candidate_mismatch", 1);
  if (envelope.requested !== expected.requestedMode) return fail("mode_mismatch", 2);
  if (expected.effectiveMode !== undefined && envelope.effective !== expected.effectiveMode) {
    return fail("mode_mismatch", 2);
  }
  if (lines.at(-1) !== `End-Review: ${envelope.execution}`) {
    return fail("footer_mismatch", lines.length - 1);
  }
  return envelope;
}

/** §A-REVIEW-04 requires exactly one unquoted marker per section, in order. */
function readSections(lines, prose) {
  const found = new Map(LABELS.map((label) => [label, []]));
  for (const index of prose) {
    if (found.has(lines[index])) found.get(lines[index]).push(index);
  }
  for (const label of ["Evidence report", ...ORDER]) {
    if (found.get(label).length !== 1) return fail("section_missing", found.get(label)[1] ?? 0);
  }
  const evidence = found.get("Evidence report")[0];
  const positions = ORDER.map((label) => found.get(label)[0]);
  if (evidence <= 5 || positions.some((position) => position < evidence)) {
    return fail("section_order", evidence);
  }
  for (let step = 1; step < positions.length; step += 1) {
    if (positions[step] < positions[step - 1]) return fail("section_order", positions[step]);
  }
  return { evidence, at: new Map(ORDER.map((label, step) => [label, positions[step]])), found };
}

/** §A-REVIEW-04 keys the index monotonically so a body can answer it one to one. */
function readIndex(lines, from, to, counts) {
  const entries = lines
    .slice(from, to)
    .filter((line) => line && !line.startsWith("Unknown-Reason:"))
    .map((line) => line.match(/^(F-\d{3}) \[(P[0-3])\] .+/u));
  const bad = entries.findIndex((entry) => entry === null);
  if (bad !== -1) return fail("index_key_order", from + bad);
  for (const [step, entry] of entries.entries()) {
    if (entry[1] !== `F-${String(step + 1).padStart(3, "0")}`) return fail("index_key_order", from);
  }
  const severities = [0, 0, 0, 0];
  for (const entry of entries) severities[Number(entry[2].slice(1))] += 1;
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total !== entries.length) return fail("counts_mismatch", 5);
  for (const [step, count] of counts.entries()) {
    if (severities[step] !== count) return fail("counts_mismatch", 5);
  }
  return { keys: entries.map((entry) => ({ key: entry[1], severity: entry[2] })) };
}

/** §A-REVIEW-04 pairs every index key with a body that states its own severity. */
function readFindingBodies(lines, prose, span, keys) {
  const bodies = [...prose]
    .filter((position) => position > span.from && position < span.to)
    .map((position) => ({ match: lines[position].match(/^(F-\d{3})$/u), position }))
    .filter(({ match }) => match);
  if (bodies.length !== keys.length) return fail("index_body_mismatch", span.from);
  for (const [step, body] of bodies.entries()) {
    if (body.match[1] !== keys[step].key) return fail("index_body_mismatch", body.position);
    const next = bodies[step + 1]?.position ?? span.to;
    const detail = [...prose]
      .filter((line) => line > body.position && line < next && lines[line].trim() !== "")
      .map((line) => lines[line]);
    if (detail.length === 0) return fail("index_body_mismatch", body.position);
    if (!new RegExp(`^\\[${keys[step].severity}\\](?:\\s|$)`, "u").test(detail[0])) {
      return fail("index_body_mismatch", body.position);
    }
  }
  return { bodies };
}

/** §A-REVIEW-04 makes an UNKNOWN account for itself rather than only declaring itself. */
function readUnknown(lines, prose, sections, verdict) {
  const account = sections.found.get("Unknown-Account");
  const reasons = [...prose]
    .map((position) => lines[position])
    .filter((line) => line.startsWith("Unknown-Reason:"));
  if (verdict !== "UNKNOWN") {
    if (account.length > 0) return fail("unknown_account", account[0]);
    if (reasons.length > 0) return fail("unknown_reason", 0);
    return {};
  }
  if (account.length !== 1) return fail("unknown_account", account[1] ?? 0);
  const findings = sections.at.get("Findings");
  const unknowns = sections.at.get("Unknowns");
  if (account[0] < findings || account[0] > unknowns) return fail("unknown_account", account[0]);
  const stated = [...prose].some(
    (position) => position > account[0] && position < unknowns && lines[position].trim() !== "",
  );
  if (!stated) return fail("unknown_account", account[0]);
  if (reasons.length !== 1) return fail("unknown_reason", account[0]);
  const reason = reasons[0].match(/^Unknown-Reason: (\S+)$/u)?.[1];
  if (reason === undefined || !UNKNOWN_REASONS.has(reason))
    return fail("unknown_reason", account[0]);
  return {};
}

/** §A-REVIEW-04 refuses a section that is announced and then left empty. */
function bodyOf(lines, from, to) {
  return lines.slice(from + 1, to).filter((line) => line.trim() !== "");
}

/**
 * Validate one authoritative response against what the caller asked for.
 *
 * §A-REVIEW-04 lets the caller own the expected values: a report that is
 * internally consistent but answers a different dispatch, candidate or mode is
 * somebody else's report, and reading it as this one is the failure this
 * function exists to prevent.
 */
export function validateReport(text, expected) {
  const lines = text.trimEnd().split("\n");
  const header = readHeader(lines, expected);
  if (header.status === "malformed") return header;
  const prose = topLevelProse(text);
  const sections = readSections(lines, prose);
  if (sections.status === "malformed") return sections;
  const index = readIndex(lines, 6, sections.evidence, header.counts);
  if (index.status === "malformed") return index;
  const at = sections.at;
  if (bodyOf(lines, at.get("Grounding"), at.get("Scope and checks")).length === 0) {
    return fail("grounding_missing", at.get("Grounding"));
  }
  for (const [label, end] of [
    ["Scope and checks", at.get("Findings")],
    ["Unknowns", at.get("Residual risks")],
    ["Residual risks", lines.length - 1],
  ]) {
    if (bodyOf(lines, at.get(label), end).length === 0)
      return fail("section_missing", at.get(label));
  }
  const unknown = readUnknown(lines, prose, sections, header.verdict);
  if (unknown.status === "malformed") return unknown;
  const findingsEnd =
    header.verdict === "UNKNOWN" ? sections.found.get("Unknown-Account")[0] : at.get("Unknowns");
  const findingBody = bodyOf(lines, at.get("Findings"), findingsEnd);
  if (header.verdict !== "FINDINGS") {
    if (index.keys.length > 0 || findingBody.length > 0) {
      return fail("pass_not_empty", at.get("Findings"));
    }
  } else {
    if (index.keys.length === 0) return fail("counts_mismatch", 5);
    const paired = readFindingBodies(
      lines,
      prose,
      { from: at.get("Findings"), to: findingsEnd },
      index.keys,
    );
    if (paired.status === "malformed") return paired;
  }
  return {
    status: "valid",
    verdict: header.verdict,
    effective: header.effective,
    counts: header.counts,
    bytes: Buffer.byteLength(text),
  };
}

/** §A-REVIEW-04 states one machine-readable verdict line for the caller. */
export function reportLine(result) {
  if (result.status === "valid") {
    const counts = result.counts.map((count, step) => `P${step}=${count}`).join(",");
    return `MO-REVIEW-REPORT/1 status=valid verdict=${result.verdict} effective=${result.effective} counts=${counts} bytes=${result.bytes}`;
  }
  return `MO-REVIEW-REPORT/1 status=malformed reason=${result.reason} line=${result.line}`;
}

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
  return { status: "paired", line: `Review-Pair: ${pairId} ${parts.join(" ")}` };
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
  return result.status === "valid" ? 0 : 1;
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

function commandPair(options) {
  require_(options, ["dir"]);
  const slots = ["A", "B"].map((slot) => {
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
  });
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
  const commands = { validate: commandValidate, stage: commandStage, pair: commandPair };
  if (argv[0] === "namespace") {
    const created = namespace();
    process.stdout.write(
      `MO-REVIEW-NS/1 dir=${JSON.stringify(created.dir)} pair_id=${created.pairId}\n`,
    );
    return 0;
  }
  const command = commands[argv[0]];
  if (command === undefined) {
    throw new Error("usage: mo-review-report.mjs <namespace|validate|stage|pair> …");
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
