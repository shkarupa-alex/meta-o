#!/usr/bin/env node

// shared/scripts/mo-review-input.mjs
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
  writeSync
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// shared/scripts/mo-review-slot.mjs
var SLOT_DIR = /^mo-review-([a-f0-9]{12})-([AB])-[A-Za-z0-9]{6}$/u;
function slotDirName(name) {
  const match = SLOT_DIR.exec(name);
  return match === null ? null : { pairId: match[1], slot: match[2] };
}

// shared/scripts/mo-review-input.mjs
var INPUT_PREFIX = "MO-REVIEW-INPUT/1";
var INPUT_FIELDS = Object.freeze(["Spec", "Intent-Ledger"]);
var INPUT_FAILURES = Object.freeze([
  "external_input_missing",
  "external_input_integrity",
  "external_input_unavailable"
]);
var SHA1 = /^[0-9a-f]{40}$/u;
var REGULAR_FILE = /* @__PURE__ */ new Set(["100644", "100755"]);
var FILE_STEM = { Spec: "spec", "Intent-Ledger": "intent-ledger" };
var USAGE = `usage: mo-review-input.mjs copy --field <Spec|Intent-Ledger> --source <file> \\
         --slot A=<absolute slot dir> [--slot B=<absolute slot dir>]
       mo-review-input.mjs check --candidate <40-hex> --line '<Spec|Intent-Ledger>: <value>' \\
         [--line \u2026] [--body-file <the brief's Body-File|none>] [--repo <git root>]
       mo-review-input.mjs --help

  copy   reads the source once and creates <dir>/slot-<a|b>-<spec|intent-ledger><ext>
         in each slot directory exclusively, mode 0600; an existing file is refused,
         and so is a directory whose name mo-review-<pair_id>-<slot>-<random> carries
         another slot letter or, for two slots, another pair id (slot_mismatch).
         One line per slot; everything after line= is that slot's brief line:
         ${INPUT_PREFIX} status=copied field=<F> slot=<A|B> bytes=<n> sha256=<hex> line=<F>: file <path> sha256=<hex>
  check  verifies each brief line before its bytes are read, writing nothing:
           <tracked repo path>                      a file of the candidate's tree
           git <commit>:<path> blob=<40-hex>        rev-parse <commit>:<path> equals blob
           file <absolute path> sha256=<64-hex>     the copy lies in the directory of
                                                    --body-file and its sha256 equals
                                                    the value; a file line needs
                                                    --body-file, and none says this
                                                    placement has no slot directory
           none
         ${INPUT_PREFIX} status=<ok|${INPUT_FAILURES.join("|")}> field=<F> form=<tracked|git|file|none> detail=<code>

example:
  node "<this skill's directory>/scripts/mo-review-input.mjs" check \\
    --candidate "$CANDIDATE_SHA" --line "Spec: docs/specifications/feature.md"
  node "<this skill's directory>/scripts/mo-review-input.mjs" check \\
    --candidate "$CANDIDATE_SHA" \\
    --line "Spec: file /tmp/mo-review-0a1b2c3d4e5f-B-Qw34Cd/slot-b-spec.md sha256=<64-hex>" \\
    --body-file /tmp/mo-review-0a1b2c3d4e5f-B-Qw34Cd/slot-b-r1-d1.md

exit: 0 copied or every line ok | 1 refused or a check failed | 2 call error
`;
var UsageError = class extends Error {
};
var sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
var repoPath = (path) => path.length > 0 && !isAbsolute(path) && !/[\n\r\0]/u.test(path) && !path.split("/").some((part) => part === ".." || part === "");
function parseInputLine(line) {
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
function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" }
  });
  return { ok: result.status === 0, out: (result.stdout ?? "").trim() };
}
var present = (repo, object) => git(repo, ["cat-file", "-e", object]).ok;
function verdict(parsed, status, detail, extra = "") {
  return {
    status,
    line: `${INPUT_PREFIX} status=${status} field=${parsed.field} form=${parsed.form} detail=${detail}${extra}`
  };
}
var directoryAt = (path) => {
  try {
    const stat = statSync(path);
    return stat.isDirectory() ? stat : null;
  } catch {
    return null;
  }
};
function checkFile(parsed, slotDir) {
  if (slotDir === null || slotDir === void 0)
    return verdict(parsed, "external_input_unavailable", "no_slot_dir");
  const directory = directoryAt(dirname(parsed.path));
  if (directory === null) return verdict(parsed, "external_input_unavailable", "directory_absent");
  const own = directoryAt(slotDir);
  if (own === null) return verdict(parsed, "external_input_unavailable", "slot_dir_absent");
  if (own.dev !== directory.dev || own.ino !== directory.ino)
    return verdict(parsed, "external_input_integrity", "slot_mismatch");
  let entry;
  try {
    entry = statSync(parsed.path);
  } catch (error) {
    return error.code === "ENOENT" ? verdict(parsed, "external_input_missing", "file_absent") : verdict(parsed, "external_input_unavailable", "unreadable");
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
function treeEntry(repo, tree, name) {
  const listed = spawnSync("git", ["-C", repo, "ls-tree", "-z", tree], {
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" }
  });
  if (listed.status !== 0) return { error: true };
  for (const row of listed.stdout.toString("utf8").split("\0")) {
    const match = /^(\d{6}) (\w+) ([0-9a-f]{40})\t(.*)$/su.exec(row);
    if (match !== null && match[4] === name)
      return { mode: match[1], type: match[2], id: match[3] };
  }
  return null;
}
function blobAt(repo, parsed, commit) {
  const header = git(repo, ["cat-file", "commit", commit]);
  const root = /^tree ([0-9a-f]{40})$/mu.exec(header.out);
  if (!header.ok || root === null)
    return { result: verdict(parsed, "external_input_unavailable", "commit_absent") };
  let tree = root[1];
  const parts = parsed.path.split("/");
  for (const [index, name] of parts.entries()) {
    if (!present(repo, tree))
      return { result: verdict(parsed, "external_input_unavailable", "tree_absent") };
    const entry = treeEntry(repo, tree, name);
    if (entry?.error)
      return { result: verdict(parsed, "external_input_unavailable", "unreadable") };
    if (entry === null) return { result: verdict(parsed, "external_input_missing", "path_absent") };
    if (index === parts.length - 1) {
      if (entry.type !== "blob" || !REGULAR_FILE.has(entry.mode))
        return { result: verdict(parsed, "external_input_missing", "not_a_file") };
      return { id: entry.id };
    }
    if (entry.type !== "tree")
      return { result: verdict(parsed, "external_input_missing", "path_absent") };
    tree = entry.id;
  }
  return { result: verdict(parsed, "external_input_missing", "path_absent") };
}
function readableBlob(repo, parsed, id) {
  if (!present(repo, id)) return verdict(parsed, "external_input_unavailable", "object_absent");
  const size = git(repo, ["cat-file", "-s", id]).out;
  return verdict(parsed, "ok", "none", ` blob=${id} bytes=${size}`);
}
function checkTracked(repo, parsed, candidate) {
  if (!present(repo, `${candidate}^{commit}`))
    return verdict(parsed, "external_input_unavailable", "commit_absent");
  const found = blobAt(repo, parsed, candidate);
  return found.result ?? readableBlob(repo, parsed, found.id);
}
function checkGit(repo, parsed) {
  if (!present(repo, `${parsed.commit}^{commit}`)) {
    const shallow = git(repo, ["rev-parse", "--is-shallow-repository"]).out === "true";
    return verdict(
      parsed,
      "external_input_unavailable",
      "commit_absent",
      ` shallow=${shallow ? "yes" : "no"}`
    );
  }
  const found = blobAt(repo, parsed, parsed.commit);
  if (found.result) return found.result;
  if (found.id !== parsed.blob) return verdict(parsed, "external_input_integrity", "blob_mismatch");
  return readableBlob(repo, parsed, found.id);
}
function checkInput(parsed, { repo, candidate, slotDir = null }) {
  if (parsed.form === "none") return verdict(parsed, "ok", "none");
  if (parsed.form === "file") return checkFile(parsed, slotDir);
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
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    384
  );
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function slotMismatch(slots) {
  const identities = slots.map(({ dir }) => slotDirName(basename(resolve(dir))));
  if (identities.some((identity, index) => identity?.slot !== slots[index].slot)) return true;
  return new Set(identities.map(({ pairId }) => pairId)).size > 1;
}
function copyInput({ field, source, slots }) {
  let bytes;
  try {
    if (!statSync(source).isFile()) return { refused: "source_not_file" };
    bytes = readFileSync(source);
  } catch {
    return { refused: "source_unreadable" };
  }
  if (slotMismatch(slots)) return { refused: "slot_mismatch" };
  const digest = sha256(bytes);
  const targets = slots.map(({ slot, dir }) => ({
    slot,
    path: join(dir, `slot-${slot.toLowerCase()}-${FILE_STEM[field]}${extname(source)}`),
    dir
  }));
  for (const { dir, path } of targets) {
    try {
      if (!lstatSync(dir).isDirectory()) return { refused: "directory_absent" };
    } catch {
      return { refused: "directory_absent" };
    }
    try {
      lstatSync(path);
      return { refused: "exists" };
    } catch {
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
      `${INPUT_PREFIX} status=copied field=${field} slot=${slot} bytes=${bytes.length} sha256=${digest} line=${field}: file ${path} sha256=${digest}`
    );
  }
  return { lines };
}
function parse(args, options) {
  let parsed;
  try {
    parsed = parseArgs({ args, options, strict: true, allowPositionals: false, tokens: true });
  } catch (error) {
    throw new UsageError(error.message);
  }
  for (const [name, option] of Object.entries(options)) {
    const count = parsed.tokens.filter(
      (token) => token.kind === "option" && token.name === name
    ).length;
    if (!option.multiple && count > 1) throw new UsageError(`--${name} given more than once`);
  }
  return parsed.values;
}
function requireValues(command, values, names) {
  const missing = names.filter((name) => values[name] === void 0);
  if (missing.length > 0) throw new UsageError(`${command} needs --${missing.join(", --")}`);
}
function copyCommand(rest) {
  const values = parse(rest, {
    field: { type: "string" },
    source: { type: "string" },
    slot: { type: "string", multiple: true }
  });
  requireValues("copy", values, ["field", "source", "slot"]);
  if (!INPUT_FIELDS.includes(values.field))
    throw new UsageError(`--field must be one of ${INPUT_FIELDS.join("|")}`);
  const slots = values.slot.map(slotTarget);
  if (new Set(slots.map(({ slot }) => slot)).size !== slots.length)
    throw new UsageError("each slot is named once");
  const result = copyInput({ field: values.field, source: values.source, slots });
  for (const line of result.lines ?? []) process.stdout.write(`${line}
`);
  if (!result.refused) return 0;
  process.stdout.write(`${INPUT_PREFIX} status=refused reason=${result.refused}
`);
  return 1;
}
function checkCommand(rest) {
  const values = parse(rest, {
    candidate: { type: "string" },
    line: { type: "string", multiple: true },
    repo: { type: "string" },
    "body-file": { type: "string" }
  });
  requireValues("check", values, ["candidate", "line"]);
  if (!SHA1.test(values.candidate)) throw new UsageError("--candidate must be a full 40-hex SHA");
  const parsed = values.line.map(parseInputLine);
  const bad = parsed.find((entry) => entry.error);
  if (bad) throw new UsageError(bad.error);
  const bodyFile = values["body-file"];
  if (bodyFile === void 0 && parsed.some((entry) => entry.form === "file"))
    throw new UsageError("a file line needs --body-file <the brief's Body-File|none>");
  if (bodyFile !== void 0 && bodyFile !== "none" && !isAbsolute(bodyFile))
    throw new UsageError("--body-file takes the brief's absolute Body-File or none");
  const slotDir = bodyFile === void 0 || bodyFile === "none" ? null : dirname(bodyFile);
  const repo = values.repo ?? process.cwd();
  const results = parsed.map(
    (entry) => checkInput(entry, { repo, candidate: values.candidate, slotDir })
  );
  for (const result of results) process.stdout.write(`${result.line}
`);
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
    command === void 0 ? "a command is required" : `unknown command ${command}`
  );
}
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
    process.stderr.write(`${error.message}
`);
    if (error instanceof UsageError) process.stderr.write(USAGE);
    process.exitCode = 2;
  }
}
export {
  INPUT_FAILURES,
  INPUT_FIELDS,
  INPUT_PREFIX,
  checkInput,
  copyInput,
  parseInputLine
};
