/**
 * Hold where a copied helper looks for its repository: the Git root of the
 * directory it runs in, unless `--repo` says otherwise, and a typed failure
 * outside Git.
 *
 * Protects §A-BACKLOG-01 and §A-MEMORY-01.
 *
 * The identifiers in the fixtures belong to a disposable project, not to this
 * one, so this file is declared whole: mo-vocabulary-ok file.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = join(ROOT, "skills", "mo-setup", "scripts");
const scratch = [];
after(() => scratch.forEach((path) => rmSync(path, { recursive: true, force: true })));

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/** A project that installed both helpers into its own `tools/`, as setup does. */
function project(files) {
  const root = mkdtempSync(join(tmpdir(), "mo-root-"));
  scratch.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "user.name", "Fixture");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  mkdirSync(join(root, "tools"));
  for (const helper of ["mo-backlog.mjs", "mo-knowledge-history.mjs"]) {
    copyFileSync(join(SHIPPED, helper), join(root, "tools", helper));
  }
  mkdirSync(join(root, "src", "deep"), { recursive: true });
  writeFileSync(join(root, "src", "deep", ".keep"), "");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

const KNOWLEDGE = {
  "docs/backlog.md": readFileSync(join(ROOT, "docs", "backlog.md"), "utf8"),
  "docs/business.md": "# Business\n\n## §B-FIXTURE-01 — A thesis\n\nText.\n",
  "docs/architecture/one.md": "# §A-FIXTURE-01 — A decision\n\nServes §B-FIXTURE-01.\n",
};

const run = (root, cwd, helper, args = []) =>
  spawnSync(process.execPath, [join(root, "tools", helper), ...args], { cwd, encoding: "utf8" });

test("a copied backlog checker finds its project from the root and a nested directory", () => {
  const root = project(KNOWLEDGE);
  for (const cwd of [root, join(root, "src", "deep")]) {
    const result = run(root, cwd, "mo-backlog.mjs");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^MO-BACKLOG-EMPTY version=1 sha=[0-9a-f]{40} worktree=clean /u);
  }
});

test("a copied history checker counts definitions from a nested directory", () => {
  const root = project(KNOWLEDGE);
  const cutoff = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "src", "deep", "note.txt"), "change\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "second");
  const result = run(root, join(root, "src", "deep"), "mo-knowledge-history.mjs", [
    "--cutoff",
    cutoff,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, / commits=1 edges=1 definitions=2\n$/u);
});

test("an explicit --repo wins over the working directory", () => {
  const empty = project({
    ...KNOWLEDGE,
    "docs/business.md": "# Business\n",
    "docs/architecture/one.md": "# Plain\n",
  });
  const full = project(KNOWLEDGE);
  const result = run(empty, full, "mo-knowledge-history.mjs", [
    "--repo",
    empty,
    "--cutoff",
    git(empty, "rev-parse", "HEAD"),
  ]);
  // The empty scope is the one that was named, so it is the one refused.
  assert.equal(result.status, 1);
  assert.match(result.stdout, /status=violations .* definitions=0\n$/u);
  assert.match(result.stderr, /^no_definitions: /mu);
});

test("outside Git both helpers answer a typed failure, never a pass", () => {
  const root = project(KNOWLEDGE);
  const outside = mkdtempSync(join(tmpdir(), "mo-root-outside-"));
  scratch.push(outside);
  const backlog = run(root, outside, "mo-backlog.mjs");
  assert.equal(backlog.status, 2);
  assert.match(backlog.stderr, /^MO-BACKLOG-UNKNOWN version=1 reason=not_git_repository /u);
  const history = run(root, outside, "mo-knowledge-history.mjs", ["--cutoff", "a".repeat(40)]);
  assert.equal(history.status, 2);
  assert.match(history.stderr, /^not_git_repository: /u);
});
