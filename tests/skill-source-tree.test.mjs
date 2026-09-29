/**
 * Prove that the source tree id is the one Git itself computes.
 *
 * Protects §A-DISTRIBUTION-06: a generated skill names its build inputs by a
 * Git tree id, and an id that differs from Git's own would attribute a session
 * to no commit at all.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import {
  gitBlobId,
  gitTreeId,
  sourceTreeOfCommit,
  sourceTreeOfFiles,
} from "../shared/scripts/skill-source-tree.mjs";

const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function git(root, args, input) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", input });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function repository() {
  const root = mkdtempSync(join(tmpdir(), "mo-source-tree-"));
  roots.push(root);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "core.autocrlf", "false"]);
  git(root, ["config", "core.fileMode", "true"]);
  return root;
}

function write(root, path, content, executable = false) {
  const absolute = join(root, ...path.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  if (executable) chmodSync(absolute, 0o755);
}

// Names chosen so that a plain name sort and Git's "directory as name/" sort
// disagree: `a.b` < `a/` < `a0` only under Git's rule.
const FILES = [
  ["src/skills/mo-x/SKILL.md", "---\nname: mo-x\n---\n\n# X\n"],
  ["src/skills/mo-x/scripts/run.mjs", "#!/usr/bin/env node\nconsole.log(1);\n", true],
  ["src/skills/mo-x/a.b", "dot\n"],
  ["src/skills/mo-x/a/inner.md", "inner\n"],
  ["src/skills/mo-x/a0", "zero\n"],
  ["shared/references/methodology.md", "# Methodology\n\nтекст\n"],
  ["shared/empty.txt", ""],
];

function populated() {
  const root = repository();
  for (const [path, content, executable] of FILES) write(root, path, content, executable);
  write(root, "unrelated.md", "not an input\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture"]);
  return root;
}

test("gitBlobId equals git hash-object for text, binary and empty bytes", () => {
  const root = repository();
  const samples = ["", "hello\n", "юникод\n", Buffer.from([0, 1, 2, 255, 10, 13])];
  for (const [index, sample] of samples.entries()) {
    const path = join(root, `sample-${index}`);
    writeFileSync(path, sample);
    assert.equal(gitBlobId(sample), git(root, ["hash-object", path]));
  }
});

test("gitTreeId equals the tree Git writes for the same files, including the sort rule", () => {
  const root = populated();
  const paths = FILES.map(([path]) => path);
  const entries = paths.map((path) => {
    const [mode, oid] = git(root, ["ls-files", "-s", "--", path]).split(/\s+/u);
    return { path, mode, oid };
  });
  assert.equal(entries.find((entry) => entry.path.endsWith("run.mjs")).mode, "100755");
  // An index holding exactly these files writes exactly this tree.
  const index = join(root, ".git", "only-inputs");
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const info = entries.map(({ path, mode, oid }) => `${mode} ${oid}\t${path}`).join("\n");
  const update = spawnSync("git", ["-C", root, "update-index", "--add", "--index-info"], {
    env,
    input: `${info}\n`,
    encoding: "utf8",
  });
  assert.equal(update.status, 0, update.stderr);
  const written = spawnSync("git", ["-C", root, "write-tree"], { env, encoding: "utf8" });
  assert.equal(written.status, 0, written.stderr);
  assert.equal(gitTreeId(entries), written.stdout.trim());
  // Order of the input list does not matter; Git's order is imposed.
  assert.equal(gitTreeId([...entries].reverse()), written.stdout.trim());
  // A subtree id matches Git's own subtree, proving nested serialization.
  const subtree = entries
    .filter((entry) => entry.path.startsWith("src/skills/mo-x/"))
    .map((entry) => ({ ...entry, path: entry.path.slice("src/skills/mo-x/".length) }));
  assert.equal(gitTreeId(subtree), git(root, ["rev-parse", "HEAD:src/skills/mo-x"]));
  assert.equal(gitTreeId([]), git(root, ["hash-object", "-t", "tree", "/dev/null"]));
});

test("gitTreeId refuses paths and entries a Git tree cannot hold", () => {
  const oid = gitBlobId("x");
  const cases = [
    [[{ path: "/abs", mode: "100644", oid }], "invalid_path"],
    [[{ path: "a/../b", mode: "100644", oid }], "invalid_path"],
    [[{ path: "a//b", mode: "100644", oid }], "invalid_path"],
    [[{ path: "a", mode: "120000", oid }], "invalid_mode"],
    [[{ path: "a", mode: "100644", oid: "xyz" }], "invalid_oid"],
    [
      [
        { path: "a", mode: "100644", oid },
        { path: "a", mode: "100644", oid },
      ],
      "duplicate_path",
    ],
    [
      [
        { path: "a", mode: "100644", oid },
        { path: "a/b", mode: "100644", oid },
      ],
      "path_conflict",
    ],
    [
      [
        { path: "a/b", mode: "100644", oid },
        { path: "a", mode: "100644", oid },
      ],
      "path_conflict",
    ],
  ];
  for (const [entries, reason] of cases) {
    assert.throws(() => gitTreeId(entries), { reason });
  }
});

test("the checkout and the commit give one id, and a change moves it", () => {
  const root = populated();
  const paths = FILES.map(([path]) => path);
  const fromCommit = sourceTreeOfCommit(root, "HEAD", paths);
  assert.equal(sourceTreeOfFiles(root, paths), fromCommit);
  assert.equal(sourceTreeOfFiles(root, [...paths].reverse()), fromCommit);
  // Files outside the declared inputs never move the id.
  write(root, "unrelated.md", "changed\n");
  assert.equal(sourceTreeOfFiles(root, paths), fromCommit);
  // An input byte or an execute bit does.
  write(root, "src/skills/mo-x/a0", "changed\n");
  assert.notEqual(sourceTreeOfFiles(root, paths), fromCommit);
  write(root, "src/skills/mo-x/a0", "zero\n");
  chmodSync(join(root, "src", "skills", "mo-x", "a0"), 0o755);
  assert.notEqual(sourceTreeOfFiles(root, paths), fromCommit);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "mode"]);
  assert.equal(sourceTreeOfFiles(root, paths), sourceTreeOfCommit(root, "HEAD", paths));
  assert.equal(sourceTreeOfCommit(root, "HEAD~1", paths), fromCommit);
});

test("missing, non-regular and hostile inputs fail typed", () => {
  const root = populated();
  const paths = FILES.map(([path]) => path);
  assert.throws(() => sourceTreeOfFiles(root, [...paths, "absent.md"]), {
    reason: "missing_path",
  });
  assert.throws(() => sourceTreeOfCommit(root, "HEAD", [...paths, "absent.md"]), {
    reason: "missing_path",
  });
  assert.throws(() => sourceTreeOfCommit(root, "HEAD", ["src/skills/mo-x/a"]), {
    reason: "not_regular_file",
  });
  assert.throws(() => sourceTreeOfFiles(root, ["src/skills/mo-x/a"]), {
    reason: "not_regular_file",
  });
  symlinkSync("a0", join(root, "src", "skills", "mo-x", "link"));
  assert.throws(() => sourceTreeOfFiles(root, ["src/skills/mo-x/link"]), {
    reason: "not_regular_file",
  });
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "link"]);
  assert.throws(() => sourceTreeOfCommit(root, "HEAD", ["src/skills/mo-x/link"]), {
    reason: "not_regular_file",
  });
  // A path that only exists after this commit is missing at the earlier one.
  assert.throws(() => sourceTreeOfCommit(root, "HEAD~1", ["src/skills/mo-x/link"]), {
    reason: "missing_path",
  });
  assert.throws(() => sourceTreeOfCommit(root, "--output=/dev/null", paths), {
    reason: "invalid_commit",
  });
  assert.throws(() => sourceTreeOfCommit(root, "no-such-ref", paths), {
    reason: "invalid_commit",
  });
  // Pathspec magic is literal: a glob never widens the input set.
  assert.throws(() => sourceTreeOfCommit(root, "HEAD", ["src/skills/mo-x/a*"]), {
    reason: "missing_path",
  });
});
