/**
 * Hold §A-REVIEW-05: a reviewer's specification and intent ledger reach it as
 * exact bytes, and a reviewer checks them before it reads a word.
 *
 * The cases are the three acceptance shapes of the decision: a standalone
 * review whose specification lives outside Git, a fresh final pair after
 * closure deleted the specification, and that same pair in a shallow clone.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkInput,
  copyInput,
  INPUT_FAILURES,
  parseInputLine,
} from "../shared/scripts/mo-review-input.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(ROOT, "shared", "scripts", "mo-review-input.mjs");
const scratch = [];
after(() => scratch.forEach((path) => rmSync(path, { recursive: true, force: true })));

function temp(prefix) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(path);
  return path;
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.invalid",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.invalid",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function helper(args, cwd) {
  const result = spawnSync(process.execPath, [HELPER, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Bytes a retelling would lose: a dollar, backticks, a backslash, no final
// newline and a non-ASCII word.
const SPEC = "# Spec\n\nR1: `$HOME` stays \\ unexpanded — точно\n";

/**
 * A repository whose history holds the specification at one commit and
 * deletes it at the next, as closure does before the final pair.
 */
function closedRepository() {
  const repo = temp("mo-input-repo-");
  git(repo, "init", "-q", "-b", "main");
  mkdirSync(join(repo, "docs", "specifications"), { recursive: true });
  writeFileSync(join(repo, "docs", "specifications", "feature.md"), SPEC);
  writeFileSync(join(repo, "app.txt"), "v1\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "spec");
  const source = git(repo, "rev-parse", "HEAD");
  const blob = git(repo, "rev-parse", "HEAD:docs/specifications/feature.md");
  git(repo, "rm", "-q", "docs/specifications/feature.md");
  writeFileSync(join(repo, "app.txt"), "v2\n");
  git(repo, "commit", "-qam", "closure");
  return { repo, source, blob, candidate: git(repo, "rev-parse", "HEAD") };
}

test("a standalone review copies one buffer into both slot directories with its sha256", () => {
  const outside = temp("mo-input-src-");
  const source = join(outside, "feature spec.md");
  writeFileSync(source, SPEC);
  const run = temp("mo-input-run-");
  const [slotA, slotB] = ["A", "B"].map((slot) => {
    const dir = join(run, `slot ${slot}`);
    mkdirSync(dir, { mode: 0o700 });
    return dir;
  });
  const copied = helper([
    "copy",
    "--field",
    "Spec",
    "--source",
    source,
    "--slot",
    `A=${slotA}`,
    "--slot",
    `B=${slotB}`,
  ]);
  assert.equal(copied.status, 0, copied.stderr);
  const lines = copied.stdout.trim().split("\n");
  assert.equal(lines.length, 2);
  const brief = lines.map((line) => {
    assert.match(
      line,
      /^MO-REVIEW-INPUT\/1 status=copied field=Spec slot=[AB] bytes=\d+ sha256=[0-9a-f]{64} line=Spec: file /u,
    );
    return line.slice(line.indexOf("line=") + "line=".length);
  });
  // Each slot's line names its own copy, and the two copies are one buffer.
  assert.equal(brief[0].includes(slotA), true);
  assert.equal(brief[1].includes(slotB), true);
  assert.equal(brief[0].includes(slotB), false);
  for (const [dir, line] of [
    [slotA, brief[0]],
    [slotB, brief[1]],
  ]) {
    const [copy] = readdirSync(dir);
    assert.equal(readFileSync(join(dir, copy), "utf8"), SPEC);
    assert.equal(statSync(join(dir, copy)).mode & 0o777, 0o600);
    const checked = helper(["check", "--candidate", "a".repeat(40), "--line", line], run);
    assert.equal(checked.status, 0, checked.stdout);
    assert.match(
      checked.stdout,
      /^MO-REVIEW-INPUT\/1 status=ok field=Spec form=file detail=none bytes=\d+\n$/u,
    );
  }
  // A second copy into the same slot never replaces checked bytes.
  const again = helper(["copy", "--field", "Spec", "--source", source, "--slot", `A=${slotA}`]);
  assert.equal(again.status, 1);
  assert.match(again.stdout, /status=refused reason=exists/u);
});

test("a changed copy is external_input_integrity and an unreachable slot is external_input_unavailable", () => {
  const outside = temp("mo-input-src-");
  writeFileSync(join(outside, "spec.md"), SPEC);
  const slot = temp("mo-input-slot-");
  const result = copyInput({
    field: "Intent-Ledger",
    source: join(outside, "spec.md"),
    slots: [{ slot: "A", dir: slot }],
  });
  const line = result.lines[0].slice(result.lines[0].indexOf("line=") + 5);
  assert.match(line, /^Intent-Ledger: file .*slot-a-intent-ledger\.md sha256=/u);
  const parsed = parseInputLine(line);
  writeFileSync(parsed.path, `${SPEC}tampered\n`);
  assert.equal(checkInput(parsed, {}).status, "external_input_integrity");
  rmSync(parsed.path);
  assert.equal(checkInput(parsed, {}).status, "external_input_missing");
  // The slot directory itself is not visible from this placement: another
  // host, or a directory already released.
  rmSync(slot, { recursive: true });
  assert.equal(checkInput(parsed, {}).status, "external_input_unavailable");
});

test("the fresh final pair reads closure's deleted specification as exact bytes", () => {
  const { repo, source, blob, candidate } = closedRepository();
  const line = `Spec: git ${source}:docs/specifications/feature.md blob=${blob}`;
  const checked = helper(["check", "--candidate", candidate, "--line", line], repo);
  assert.equal(checked.status, 0, checked.stdout);
  assert.match(
    checked.stdout,
    new RegExp(`status=ok field=Spec form=git detail=none blob=${blob} `, "u"),
  );
  // The read the protocol names after the check returns the original bytes.
  assert.equal(git(repo, "cat-file", "blob", blob), SPEC.trimEnd());
  const exact = spawnSync("git", ["cat-file", "blob", blob], { cwd: repo });
  assert.equal(exact.stdout.toString("utf8"), SPEC);
  // A blob id that is not the one the commit's tree names is integrity.
  const other = git(repo, "rev-parse", `${source}:app.txt`);
  const swapped = parseInputLine(
    `Spec: git ${source}:docs/specifications/feature.md blob=${other}`,
  );
  assert.equal(checkInput(swapped, { repo, candidate }).status, "external_input_integrity");
  // A path the commit never held is missing, not unavailable.
  const absent = parseInputLine(`Spec: git ${source}:docs/specifications/other.md blob=${blob}`);
  assert.equal(checkInput(absent, { repo, candidate }).status, "external_input_missing");
  // The tracked form reads the candidate's tree, which closure emptied.
  const tracked = parseInputLine("Spec: docs/specifications/feature.md");
  const result = checkInput(tracked, { repo, candidate });
  assert.equal(result.status, "external_input_missing");
  assert.equal(checkInput(tracked, { repo, candidate: source }).status, "ok");
});

test("a shallow clone without the closure source commit is external_input_unavailable", () => {
  const { repo, source, blob, candidate } = closedRepository();
  const shallow = join(temp("mo-input-shallow-"), "clone");
  git(tmpdir(), "clone", "-q", "--depth", "1", `file://${repo}`, shallow);
  assert.equal(git(shallow, "rev-parse", "HEAD"), candidate);
  const line = `Spec: git ${source}:docs/specifications/feature.md blob=${blob}`;
  const checked = helper(["check", "--candidate", candidate, "--line", line], shallow);
  assert.equal(checked.status, 1);
  assert.equal(
    checked.stdout,
    "MO-REVIEW-INPUT/1 status=external_input_unavailable field=Spec form=git detail=commit_absent shallow=yes\n",
  );
});

test("a partial clone missing the blob answers unavailable without fetching it", () => {
  const { repo, source, blob, candidate } = closedRepository();
  git(repo, "config", "uploadpack.allowFilter", "true");
  const partial = join(temp("mo-input-partial-"), "clone");
  git(tmpdir(), "clone", "-q", "--filter=blob:none", `file://${repo}`, partial);
  const line = `Spec: git ${source}:docs/specifications/feature.md blob=${blob}`;
  const checked = helper(["check", "--candidate", candidate, "--line", line], partial);
  assert.equal(
    checked.stdout,
    "MO-REVIEW-INPUT/1 status=external_input_unavailable field=Spec form=git detail=object_absent\n",
  );
  // The check answered what this clone holds instead of fetching the blob.
  const still = spawnSync("git", ["cat-file", "-e", blob], {
    cwd: partial,
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
  });
  assert.notEqual(still.status, 0);
});

test("the check writes nothing and refuses a call it cannot answer", () => {
  const { repo, candidate } = closedRepository();
  const before = git(repo, "count-objects", "-v");
  const none = helper(
    ["check", "--candidate", candidate, "--line", "Spec: none", "--line", "Intent-Ledger: none"],
    repo,
  );
  assert.equal(none.status, 0);
  assert.equal(none.stdout.trim().split("\n").length, 2);
  assert.equal(git(repo, "count-objects", "-v"), before);
  assert.equal(git(repo, "status", "--porcelain"), "");
  for (const args of [
    ["check", "--candidate", candidate],
    ["check", "--candidate", "abc", "--line", "Spec: none"],
    [
      "check",
      "--candidate",
      candidate,
      "--line",
      "Spec: file relative.md sha256=" + "0".repeat(64),
    ],
    ["check", "--candidate", candidate, "--line", "Spec: ../outside.md"],
    ["check", "--candidate", candidate, "--candidate", candidate, "--line", "Spec: none"],
    ["check", "--candidate", candidate, "--line", "Spec: none", "--unknown", "x"],
    ["copy", "--field", "Spec", "--source", "/x", "--slot", "C=/tmp"],
    ["nope"],
  ]) {
    const result = helper(args, repo);
    assert.equal(result.status, 2, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
  }
  const help = helper(["--help"], repo);
  assert.equal(help.status, 0);
  for (const failure of INPUT_FAILURES) assert.match(help.stdout, new RegExp(failure, "u"));
});

test(
  "an unreadable copy is unavailable rather than a pass",
  { skip: process.getuid?.() === 0 },
  () => {
    const slot = temp("mo-input-slot-");
    const file = join(slot, "slot-a-spec.md");
    writeFileSync(file, SPEC);
    chmodSync(file, 0o000);
    const parsed = parseInputLine(`Spec: file ${file} sha256=${"0".repeat(64)}`);
    assert.equal(checkInput(parsed, {}).status, "external_input_unavailable");
    chmodSync(file, 0o600);
  },
);
