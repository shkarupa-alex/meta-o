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
 * with `--prepared`, `namespace`, `stage`, `pair`) call; publication into slots
 * lives in `mo-review-handoff.mjs`.
 */

import {
  closeSync,
  constants,
  fsyncSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { parseRound, reportLine, reportTemplate, validateReport } from "./mo-review-grammar.mjs";
import {
  ackSlotsValid,
  checkAck,
  decodeReport,
  namespace,
  pair,
  preview,
  readReportBytes,
  stage,
} from "./mo-review-handoff.mjs";

export {
  parseRound,
  reportLine,
  roundLine,
  reportTemplate,
  topLevelParagraphs,
  topLevelProse,
  validateReport,
} from "./mo-review-grammar.mjs";
export {
  checkAck,
  decodeReport,
  linkFailureReason,
  namespace,
  pair,
  preview,
  readReportBytes,
  stage,
} from "./mo-review-handoff.mjs";

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
 * Both work on bytes: decoding first would turn different invalid sequences into
 * the same replacement character and call two files one.
 */
export const NORMALIZATIONS = {
  none: (bytes) => bytes,
  "final-newline": (bytes) => (bytes.at(-1) === 0x0a ? bytes.subarray(0, -1) : bytes),
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
  const left = normalize(received);
  const right = normalize(prepared.buffer);
  return { identity: left.equals(right) ? "identical" : "different", reason: normalization };
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

/** A call the helper refuses before it reads stdin or touches the filesystem. */
class UsageError extends Error {}

const SHA_VALUE = /^[a-f0-9]{40}$/u;
const MODE_VALUE = /^(?:fast|deep|follow_up)$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;

// What a flag's value must look like wherever it is taken. A value the caller
// owns and got wrong is a call error, never a report that "does not match".
const VALUES = {
  candidate: [SHA_VALUE, "a full 40-hex SHA"],
  requested: [MODE_VALUE, "fast, deep or follow_up"],
  effective: [MODE_VALUE, "fast, deep or follow_up"],
  verdict: [/^(?:PASS|FINDINGS|UNKNOWN)$/u, "PASS, FINDINGS or UNKNOWN"],
  slot: [/^[AB]$/u, "A or B"],
  kind: [/^(?:Preview|Handoff)$/u, "Preview or Handoff"],
  normalization: [/^(?:none|final-newline)$/u, "none or final-newline"],
  "a-bytes": [DECIMAL, "a decimal size"],
  "b-bytes": [DECIMAL, "a decimal size"],
};

const EXPECTATION = "--dispatch <id> --candidate <40-hex> --requested <fast|deep|follow_up>";
const ROUND_FLAGS = ["attempt", "attempt-limit", "deep-reads", "fragment"];
const ROUND_USAGE = "--attempt <n> --attempt-limit <limit> --deep-reads <m> --fragment <id>";
const ROUND_EXAMPLE = "--attempt 1 --attempt-limit 5 --deep-reads 1 --fragment f1";
const SLOT_FLAGS = ["a", "b"].flatMap((prefix) =>
  ["vendor", "bytes", "dev", "ino", "sha256"].map((field) => `${prefix}-${field}`),
);

/**
 * Every command, the flags it takes and how it is called.
 *
 * §A-REVIEW-04 makes a documented helper call part of the protocol, so the
 * skill texts are checked against this table, `<command> --help` prints it, and
 * a call copied from either is never refused. A flag outside the table is a
 * call error: a misspelled optional flag such as `--prepare` would otherwise
 * skip the check it names and still answer valid.
 */
export const COMMANDS = {
  namespace: {
    required: [],
    optional: [],
    usage: "namespace",
    about: "creates one private run directory under system temp and prints it",
    example: "namespace",
  },
  template: {
    required: ["verdict", "dispatch", "candidate", "requested", "effective", ...ROUND_FLAGS],
    optional: ["unknown-reason"],
    usage: `template --verdict <PASS|FINDINGS|UNKNOWN> ${EXPECTATION} --effective <mode> ${ROUND_USAGE} [--unknown-reason <reason>]`,
    about:
      "prints a complete report body, Round line included, that the validator accepts as printed",
    example: `template --verdict PASS --dispatch ctx_1 --candidate ${"a".repeat(40)} --requested deep --effective deep ${ROUND_EXAMPLE}`,
  },
  prepare: {
    required: ["file", "dispatch", "candidate", "requested", ...ROUND_FLAGS],
    optional: ["effective"],
    usage: `prepare --file <Body-File> ${EXPECTATION} [--effective <mode>] ${ROUND_USAGE}   < report bytes on stdin`,
    about: "validates the stdin bytes, then creates the Body-File once (never overwrites)",
    example: `prepare --file /tmp/run/slot-a-r1-d1.md --dispatch ctx_1 --candidate ${"a".repeat(40)} --requested deep ${ROUND_EXAMPLE} < report.md`,
  },
  validate: {
    required: ["file", "dispatch", "candidate", "requested", ...ROUND_FLAGS],
    optional: ["effective", "prepared", "normalization"],
    usage: `validate --file <path|-> ${EXPECTATION} [--effective <mode>] ${ROUND_USAGE} [--prepared <Body-File> [--normalization none|final-newline]]`,
    about:
      "checks one report; with --prepared also compares it byte for byte with the prepared file",
    example: `validate --file - --dispatch ctx_1 --candidate ${"a".repeat(40)} --requested deep ${ROUND_EXAMPLE} < report.md`,
  },
  stage: {
    required: ["dir", "slot", "vendor", "dispatch", "candidate", "requested", ...ROUND_FLAGS],
    optional: ["file", "effective"],
    usage: `stage --dir <run dir> --slot A|B --vendor <slug> ${EXPECTATION} [--effective <mode>] ${ROUND_USAGE} [--file <path|->]`,
    about: "validates one report and publishes it into its slot create-if-absent",
    example: `stage --dir /tmp/mo-review-x --slot A --vendor anthropic --dispatch ctx_1 --candidate ${"a".repeat(40)} --requested deep ${ROUND_EXAMPLE} < report.md`,
  },
  pair: {
    required: ["dir", ...SLOT_FLAGS],
    optional: [],
    usage:
      "pair --dir <run dir> --a-vendor <slug> --a-bytes <n> --a-dev <n> --a-ino <n> --a-sha256 <hex> --b-vendor <slug> --b-bytes <n> --b-dev <n> --b-ino <n> --b-sha256 <hex>",
    about: "proves both staged slots are still the published inodes and prints the pair line",
    example:
      "pair --dir /tmp/mo-review-x --a-vendor anthropic --a-bytes 1 --a-dev 1 --a-ino 1 --a-sha256 <hex> --b-vendor openai --b-bytes 1 --b-dev 1 --b-ino 1 --b-sha256 <hex>",
  },
  preview: {
    required: ["dir", "slot"],
    optional: SLOT_FLAGS,
    usage:
      "preview --dir <run dir> --slot A|B, with the five facts of that slot: --a-vendor --a-bytes --a-dev --a-ino --a-sha256 for A, --b-vendor --b-bytes --b-dev --b-ino --b-sha256 for B",
    about: "proves one staged slot and prints the early preview line",
    example:
      "preview --dir /tmp/mo-review-x --slot A --a-vendor anthropic --a-bytes 1 --a-dev 1 --a-ino 1 --a-sha256 <hex>",
  },
  ack: {
    required: ["line", "kind", "pair-id"],
    optional: ["a-bytes", "b-bytes"],
    usage:
      "ack --kind Preview|Handoff --line <ack text> --pair-id <id> [--a-bytes <n>] [--b-bytes <n>]",
    about: "checks a consumer's acknowledgement against the published sizes",
    example:
      "ack --kind Handoff --line 'Review-Handoff-Ack: mo-review-x A=10 B=20' --pair-id mo-review-x --a-bytes 10 --b-bytes 20",
  },
};

/** The flags each command reads, derived from the one table above. */
export const FLAGS = Object.fromEntries(
  Object.entries(COMMANDS).map(([name, spec]) => [name, [...spec.required, ...spec.optional]]),
);

const PROGRAM = "mo-review-report.mjs";
const OVERVIEW = `usage: ${PROGRAM} <${Object.keys(COMMANDS).join("|")}> … | <command> --help\n`;

/** §A-REVIEW-04 help names a command's inputs and one call that works. */
export function commandHelp(name) {
  const spec = COMMANDS[name];
  return `usage: ${PROGRAM} ${spec.usage}\n\n  ${spec.about}\n\nexample:\n  node ${PROGRAM} ${spec.example}\n`;
}

/**
 * Read one command line completely before anything acts on it.
 *
 * §A-REVIEW-04 lets a coordinator learn a call by asking for it: `--help`
 * answers and creates nothing, and an unknown, repeated or missing flag is a
 * call error found before stdin is read or a directory is made, so a wrong call
 * leaves no artefact a later step could mistake for a run.
 */
export function parseCommandLine(argv) {
  const [name, ...rest] = argv;
  if (name === "--help") return { help: OVERVIEW };
  const spec = COMMANDS[name];
  if (spec === undefined) throw new UsageError(OVERVIEW.trimEnd());
  const options = {
    ...Object.fromEntries(FLAGS[name].map((flag) => [flag, { type: "string" }])),
    help: { type: "boolean" },
  };
  // A first lenient pass only lists the names, so an unknown flag is named as
  // one rather than reported as whatever the strict parser trips on first.
  const names = parseArgs({ args: rest, options, strict: false, tokens: true })
    .tokens.filter((token) => token.kind === "option")
    .map((token) => token.name);
  const unknown = [...new Set(names.filter((flag) => !Object.hasOwn(options, flag)))];
  if (unknown.length > 0) throw new UsageError(`${name} does not take --${unknown.join(", --")}`);
  let parsed;
  try {
    parsed = parseArgs({ args: rest, options, strict: true, allowPositionals: false });
  } catch (error) {
    throw new UsageError(`${name}: ${error.message.split("\n")[0]}`);
  }
  if (parsed.values.help) return { help: commandHelp(name) };
  const repeated = names.find((flag, index) => names.indexOf(flag) !== index);
  if (repeated !== undefined) throw new UsageError(`${name}: --${repeated} is given twice`);
  const values = { ...parsed.values };
  const missing = spec.required.filter((flag) => values[flag] === undefined);
  if (missing.length > 0) {
    const verb = missing.length === 1 ? "is" : "are";
    throw new UsageError(`${name}: --${missing.join(", --")} ${verb} required`);
  }
  for (const [flag, value] of Object.entries(values)) {
    const rule = VALUES[flag];
    if (rule !== undefined && !rule[0].test(value)) {
      throw new UsageError(`${name}: --${flag} must be ${rule[1]}`);
    }
  }
  if (ROUND_FLAGS.every((flag) => values[flag] !== undefined)) {
    const counters = parseRound(
      `attempt=${values.attempt}/${values["attempt-limit"]} ` +
        `deep_reads=${values["deep-reads"]} fragment=${values.fragment}`,
    );
    if (counters.error) throw new UsageError(`${name}: the round flags give ${counters.error}`);
    values.round = counters.round;
  }
  return { name, options: values };
}

function expectationOf(options) {
  return {
    execution: options.dispatch,
    candidate: options.candidate,
    requestedMode: options.requested,
    effectiveMode: options.effective,
    round: options.round,
  };
}

function commandValidate(options) {
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
  const identity = bodyIdentity(bytes.buffer, options.prepared, options.normalization ?? "none");
  process.stdout.write(
    `MO-REVIEW-BODY/1 prepared_body_identity=${identity.identity} reason=${identity.reason}\n`,
  );
  return result.status === "valid" && identity.identity !== "different" ? 0 : 1;
}

function commandPrepare(options) {
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
  const template = reportTemplate({
    verdict: options.verdict,
    dispatch: options.dispatch,
    candidate: options.candidate,
    requested: options.requested,
    effective: options.effective,
    round: options.round,
    reason: options["unknown-reason"],
  });
  if (template.error) throw new UsageError(`template: ${template.error}`);
  process.stdout.write(template.text);
  return 0;
}

function commandStage(options) {
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
  const missing = ["vendor", "bytes", "dev", "ino", "sha256"]
    .map((field) => `${prefix}-${field}`)
    .filter((flag) => options[flag] === undefined);
  if (missing.length > 0) throw new UsageError(`--${missing.join(", --")} is required`);
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
  const bytes = {};
  for (const slot of ["A", "B"]) {
    const value = options[`${slot.toLowerCase()}-bytes`];
    if (value !== undefined) bytes[slot] = Number(value);
  }
  if (!ackSlotsValid(options.kind, Object.keys(bytes).sort())) {
    throw new UsageError(
      "--kind Handoff needs --a-bytes and --b-bytes, --kind Preview exactly one of them",
    );
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

function commandNamespace() {
  const created = namespace();
  process.stdout.write(
    `MO-REVIEW-NS/1 dir=${JSON.stringify(created.dir)} pair_id=${created.pairId}\n`,
  );
  return 0;
}

const RUN = {
  namespace: commandNamespace,
  template: commandTemplate,
  prepare: commandPrepare,
  validate: commandValidate,
  stage: commandStage,
  pair: commandPair,
  preview: commandPreview,
  ack: commandAck,
};

function main(argv) {
  const call = parseCommandLine(argv);
  if (call.help !== undefined) {
    process.stdout.write(call.help);
    return 0;
  }
  return RUN[call.name](call.options);
}

/**
 * Whether this file is the program Node was asked to run. Both sides go through
 * realpath: Node resolves the main module through symlinks and percent-encodes
 * its URL, while argv keeps the path as typed, so a textual comparison fails
 * silently for a symlinked install or a directory with a space in its name,
 * and a helper that answers by exit status would read as a yes.
 */
function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
