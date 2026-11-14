#!/usr/bin/env node
/**
 * Deliver a reviewer's specification and intent ledger as exact bytes, and
 * check them before the reviewer reads a word.
 *
 * §A-REVIEW-05 gives the brief's `Spec:` and `Intent-Ledger:` lines four
 * closed forms. A file outside Git reaches a reviewer only as a copy in its own
 * slot directory named by path and sha256; a file closure already deleted is
 * named by the commit whose tree still holds it, its path and its blob. Both
 * values are printed here and checked here, because a value carried by hand is
 * the same class of error as a hand-typed report header: it looks right and
 * names other bytes.
 *
 * `copy` is the caller's half: one read of the source, so both slots receive
 * the same bytes, and an exclusive create, so an existing copy is never
 * replaced. `check` is the reviewer's half: it reads, and writes nothing. It
 * forbids Git's lazy fetch, so a partial clone answers that the object is
 * absent rather than quietly reaching the network from the reviewer's checkout.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** §A-REVIEW-05 the first token of every line this helper prints. */
export const INPUT_PREFIX = "MO-REVIEW-INPUT/1";

/** §A-REVIEW-05 the brief fields whose value may name bytes outside the candidate. */
export const INPUT_FIELDS = Object.freeze(["Spec", "Intent-Ledger"]);

/** §A-REVIEW-05 the closed outcomes of a reviewer's input check besides `ok`. */
export const INPUT_FAILURES = Object.freeze([
  "external_input_missing",
  "external_input_integrity",
  "external_input_unavailable",
]);

const SHA1 = /^[0-9a-f]{40}$/u;
const FILE_STEM = { Spec: "spec", "Intent-Ledger": "intent-ledger" };

const USAGE = `usage: mo-review-input.mjs copy --field <Spec|Intent-Ledger> --source <file> \\
         --slot A=<absolute slot dir> [--slot B=<absolute slot dir>]
       mo-review-input.mjs check --candidate <40-hex> --line '<Spec|Intent-Ledger>: <value>' \\
         [--line …] [--repo <git root>]
       mo-review-input.mjs --help

  copy   reads the source once and creates <dir>/slot-<a|b>-<spec|intent-ledger><ext>
         in each slot directory exclusively, mode 0600; an existing file is refused.
         One line per slot; everything after line= is that slot's brief line:
         ${INPUT_PREFIX} status=copied field=<F> slot=<A|B> bytes=<n> sha256=<hex> line=<F>: file <path> sha256=<hex>
  check  verifies each brief line before its bytes are read, writing nothing:
           <tracked repo path>                      a file of the candidate's tree
           git <commit>:<path> blob=<40-hex>        rev-parse <commit>:<path> equals blob
           file <absolute path> sha256=<64-hex>     the copy's sha256 equals the value
           none
         ${INPUT_PREFIX} status=<ok|${INPUT_FAILURES.join("|")}> field=<F> form=<tracked|git|file|none> detail=<code>

example:
  node "<this skill's directory>/scripts/mo-review-input.mjs" check \\
    --candidate "$CANDIDATE_SHA" --line "Spec: docs/specifications/feature.md"

exit: 0 copied or every line ok | 1 refused or a check failed | 2 call error
`;

class UsageError extends Error {}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// A repository path names a file inside the tree: never absolute, never
// climbing out, and with no byte that would split the brief line.
const repoPath = (path) =>
  path.length > 0 &&
  !isAbsolute(path) &&
  !/[\n\r\0]/u.test(path) &&
  !path.split("/").some((part) => part === ".." || part === "");

/**
 * §A-REVIEW-05 reads one brief line into its form, or names why it has none.
 *
 * `file` takes an absolute path only: a relative one would resolve against the
 * reviewer's checkout, which is exactly the directory the copy is not in.
 */
export function parseInputLine(line) {
  const match = /^(Spec|Intent-Ledger): (.+)$/u.exec(line);
  if (match === null) return { error: "expected <Spec|Intent-Ledger>: <value>" };
  const [, field, value] = match;
  if (value === "none") return { field, form: "none" };
  if (value.startsWith("file ")) {
    const file = /^file (.+) sha256=([0-9a-f]{64})$/u.exec(value);
    if (file === null || !isAbsolute(file[1]) || /[\n\r\0]/u.test(file[1])) {
      return { error: `${field}: expected file <absolute path> sha256=<64-hex>` };
    }
    return { field, form: "file", path: file[1], sha256: file[2] };
  }
  if (value.startsWith("git ")) {
    const object = /^git ([0-9a-f]{40}):(.+) blob=([0-9a-f]{40})$/u.exec(value);
    if (object === null || !repoPath(object[2])) {
      return { error: `${field}: expected git <commit-40-hex>:<path> blob=<40-hex>` };
    }
    return { field, form: "git", commit: object[1], path: object[2], blob: object[3] };
  }
  if (!repoPath(value)) return { error: `${field}: a tracked path is relative to the tree` };
  return { field, form: "tracked", path: value };
}

/**
 * Run Git read-only in the reviewer's repository.
 *
 * `GIT_NO_LAZY_FETCH` keeps a partial clone from fetching a missing object on
 * demand: the check must answer what this placement holds, and a fetch would
 * both write into the repository and hide the gap it is asked to report.
 */
function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" },
  });
  return { ok: result.status === 0, out: (result.stdout ?? "").trim() };
}

const present = (repo, object) => git(repo, ["cat-file", "-e", object]).ok;

function verdict(parsed, status, detail, extra = "") {
  return {
    status,
    line: `${INPUT_PREFIX} status=${status} field=${parsed.field} form=${parsed.form} detail=${detail}${extra}`,
  };
}

function checkFile(parsed) {
  let directory;
  try {
    directory = statSync(dirname(parsed.path));
  } catch {
    return verdict(parsed, "external_input_unavailable", "directory_absent");
  }
  if (!directory.isDirectory())
    return verdict(parsed, "external_input_unavailable", "directory_absent");
  let entry;
  try {
    entry = statSync(parsed.path);
  } catch (error) {
    return error.code === "ENOENT"
      ? verdict(parsed, "external_input_missing", "file_absent")
      : verdict(parsed, "external_input_unavailable", "unreadable");
  }
  if (!entry.isFile()) return verdict(parsed, "external_input_missing", "not_a_file");
  let bytes;
  try {
    bytes = readFileSync(parsed.path);
  } catch {
    return verdict(parsed, "external_input_unavailable", "unreadable");
  }
  if (sha256(bytes) !== parsed.sha256)
    return verdict(parsed, "external_input_integrity", "sha256_mismatch");
  return verdict(parsed, "ok", "none", ` bytes=${bytes.length}`);
}

// The blob behind a tree entry: the id comes from the tree, which even a
// partial clone holds, and only then is the object itself looked for.
function blobAt(repo, parsed, commit) {
  const id = git(repo, ["rev-parse", "--verify", "--quiet", `${commit}:${parsed.path}`]);
  if (!id.ok || !SHA1.test(id.out))
    return { result: verdict(parsed, "external_input_missing", "path_absent") };
  return { id: id.out };
}

function readableBlob(repo, parsed, id) {
  if (!present(repo, id)) return verdict(parsed, "external_input_unavailable", "object_absent");
  if (git(repo, ["cat-file", "-t", id]).out !== "blob")
    return verdict(parsed, "external_input_missing", "not_a_file");
  const size = git(repo, ["cat-file", "-s", id]).out;
  return verdict(parsed, "ok", "none", ` blob=${id} bytes=${size}`);
}

function checkTracked(repo, parsed, candidate) {
  if (!present(repo, `${candidate}^{commit}`))
    return verdict(parsed, "external_input_unavailable", "commit_absent");
  const found = blobAt(repo, parsed, candidate);
  return found.result ?? readableBlob(repo, parsed, found.id);
}

// A commit this repository does not hold cannot be told apart from one it
// never fetched, so its absence is `unavailable` with the recommendation of a
// full clone; only a path the commit's own tree lacks is `missing`.
function checkGit(repo, parsed) {
  if (!present(repo, `${parsed.commit}^{commit}`)) {
    const shallow = git(repo, ["rev-parse", "--is-shallow-repository"]).out === "true";
    return verdict(
      parsed,
      "external_input_unavailable",
      "commit_absent",
      ` shallow=${shallow ? "yes" : "no"}`,
    );
  }
  const found = blobAt(repo, parsed, parsed.commit);
  if (found.result) return found.result;
  if (found.id !== parsed.blob) return verdict(parsed, "external_input_integrity", "blob_mismatch");
  return readableBlob(repo, parsed, found.id);
}

/** §A-REVIEW-05 checks one parsed brief line on this placement and reads nothing else. */
export function checkInput(parsed, { repo, candidate }) {
  if (parsed.form === "none") return verdict(parsed, "ok", "none");
  if (parsed.form === "file") return checkFile(parsed);
  if (parsed.form === "git") return checkGit(repo, parsed);
  return checkTracked(repo, parsed, candidate);
}

function slotTarget(spec) {
  const match = /^(A|B)=(.+)$/u.exec(spec);
  if (match === null || !isAbsolute(match[2]) || /[\n\r\0]/u.test(match[2])) {
    throw new UsageError("--slot takes A=<absolute dir> or B=<absolute dir>");
  }
  return { slot: match[1], dir: match[2] };
}

function writeExclusive(path, bytes) {
  // O_EXCL refuses an existing name, a symlink included, so a copy never
  // replaces bytes a reviewer may already have checked.
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * §A-REVIEW-05 copies one source into every named slot directory.
 *
 * The source is read once and every slot receives that buffer, so the two
 * reviewers of a pair can never be handed two versions of one specification.
 * Every target is checked before the first byte is written.
 */
export function copyInput({ field, source, slots }) {
  let bytes;
  try {
    if (!statSync(source).isFile()) return { refused: "source_not_file" };
    bytes = readFileSync(source);
  } catch {
    return { refused: "source_unreadable" };
  }
  const digest = sha256(bytes);
  const targets = slots.map(({ slot, dir }) => ({
    slot,
    path: join(dir, `slot-${slot.toLowerCase()}-${FILE_STEM[field]}${extname(source)}`),
    dir,
  }));
  for (const { dir, path } of targets) {
    try {
      if (!statSync(dir).isDirectory()) return { refused: "directory_absent" };
    } catch {
      return { refused: "directory_absent" };
    }
    try {
      lstatSync(path);
      return { refused: "exists" };
    } catch {
      // absent, as required
    }
  }
  const lines = [];
  for (const { slot, path } of targets) {
    try {
      writeExclusive(path, bytes);
      if (sha256(readFileSync(path)) !== digest) return { refused: "verify_failed", lines };
    } catch {
      return { refused: "write_failed", lines };
    }
    lines.push(
      `${INPUT_PREFIX} status=copied field=${field} slot=${slot} bytes=${bytes.length} sha256=${digest} line=${field}: file ${path} sha256=${digest}`,
    );
  }
  return { lines };
}

// Every flag but a repeatable one appears once: a second value would be read
// as the last one wins, and the caller would never learn which one it was.
function parse(args, options) {
  let parsed;
  try {
    parsed = parseArgs({ args, options, strict: true, allowPositionals: false, tokens: true });
  } catch (error) {
    throw new UsageError(error.message);
  }
  for (const [name, option] of Object.entries(options)) {
    const count = parsed.tokens.filter(
      (token) => token.kind === "option" && token.name === name,
    ).length;
    if (!option.multiple && count > 1) throw new UsageError(`--${name} given more than once`);
  }
  return parsed.values;
}

function requireValues(command, values, names) {
  const missing = names.filter((name) => values[name] === undefined);
  if (missing.length > 0) throw new UsageError(`${command} needs --${missing.join(", --")}`);
}

function copyCommand(rest) {
  const values = parse(rest, {
    field: { type: "string" },
    source: { type: "string" },
    slot: { type: "string", multiple: true },
  });
  requireValues("copy", values, ["field", "source", "slot"]);
  if (!INPUT_FIELDS.includes(values.field))
    throw new UsageError(`--field must be one of ${INPUT_FIELDS.join("|")}`);
  const slots = values.slot.map(slotTarget);
  if (new Set(slots.map(({ slot }) => slot)).size !== slots.length)
    throw new UsageError("each slot is named once");
  const result = copyInput({ field: values.field, source: values.source, slots });
  for (const line of result.lines ?? []) process.stdout.write(`${line}\n`);
  if (!result.refused) return 0;
  process.stdout.write(`${INPUT_PREFIX} status=refused reason=${result.refused}\n`);
  return 1;
}

function checkCommand(rest) {
  const values = parse(rest, {
    candidate: { type: "string" },
    line: { type: "string", multiple: true },
    repo: { type: "string" },
  });
  requireValues("check", values, ["candidate", "line"]);
  if (!SHA1.test(values.candidate)) throw new UsageError("--candidate must be a full 40-hex SHA");
  // Every line is parsed before any is checked, so a malformed one is a call
  // error with nothing printed rather than half an answer.
  const parsed = values.line.map(parseInputLine);
  const bad = parsed.find((entry) => entry.error);
  if (bad) throw new UsageError(bad.error);
  const repo = values.repo ?? process.cwd();
  const results = parsed.map((entry) => checkInput(entry, { repo, candidate: values.candidate }));
  for (const result of results) process.stdout.write(`${result.line}\n`);
  return results.every((result) => result.status === "ok") ? 0 : 1;
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === "--help" || rest.includes("--help")) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command === "copy") return copyCommand(rest);
  if (command === "check") return checkCommand(rest);
  throw new UsageError(
    command === undefined ? "a command is required" : `unknown command ${command}`,
  );
}

/**
 * Whether this file is the program Node was asked to run. Both sides go through
 * realpath: Node resolves the main module through symlinks and percent-encodes
 * its URL, while argv keeps the path as typed, so a textual comparison fails
 * silently for a symlinked install or a directory with a space in its name.
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
    if (error instanceof UsageError) process.stderr.write(USAGE);
    process.exitCode = 2;
  }
}
