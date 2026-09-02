/**
 * Preserve auditable proof after temporary backlog closure artifacts are deleted.
 *
 * Protects §A-MEMORY-02.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = process.cwd();
const ACCEPTANCE = readFileSync("docs/acceptance.md", "utf8");

function git(args) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function coordinate(label, pattern) {
  const match = ACCEPTANCE.match(pattern);
  assert.ok(match, `acceptance has no ${label}`);
  return match[1];
}

const BACKLOG_BLOB = coordinate("backlog blob", /Backlog ledger\s+\| `([a-f0-9]{40})`/u);
const REAL_RUNS_BLOB = coordinate("real-runs blob", /Real-runs ledger\s+\| `([a-f0-9]{40})`/u);
const CLOSURE_SHA = coordinate("closure SHA", /зафиксирован коммитом\s+`([a-f0-9]{40})`/u);
const MAP_BLOB = coordinate("closure-map blob", /blob полной карты —\s+`([a-f0-9]{40})`/u);

test("acceptance points to reachable source, closure and map objects", () => {
  assert.equal(git(["merge-base", "--is-ancestor", CLOSURE_SHA, "HEAD"]).status, 0);
  for (const object of [BACKLOG_BLOB, REAL_RUNS_BLOB, MAP_BLOB]) {
    assert.equal(git(["cat-file", "-e", object]).status, 0, object);
  }
  const mapResult = git(["cat-file", "blob", MAP_BLOB]);
  assert.equal(mapResult.status, 0, mapResult.stderr);
  const map = JSON.parse(mapResult.stdout);
  assert.equal(map.contract, "meta-o.backlog-closure-map.v1");
  assert.deepEqual(
    map.sources.map(({ blob }) => blob),
    [BACKLOG_BLOB, REAL_RUNS_BLOB],
  );
  assert.equal(
    map.rows.length,
    Object.values(map.source_counts).reduce((sum, count) => sum + count, 0),
  );
});

test("the post-closure delta is only the authorized deletion and schema transition", () => {
  const result = git(["diff", "--name-status", `${CLOSURE_SHA}..HEAD`]);
  assert.equal(result.status, 0, result.stderr);
  const allowedModified = new Set([
    ".markdownlint-cli2.jsonc",
    ".prettierignore",
    "Makefile",
    "docs/acceptance.md",
    "docs/backlog.md",
    "spec/README.md",
    "tests/backend-transition.test.mjs",
  ]);
  const allowedAdded = new Set(["tests/backlog-provenance.test.mjs"]);
  for (const line of result.stdout.trim().split("\n").filter(Boolean)) {
    const [status, path] = line.split("\t");
    if (status === "M") assert.ok(allowedModified.has(path), line);
    else if (status === "A") assert.ok(allowedAdded.has(path), line);
    else if (status === "D") {
      assert.ok(
        path === "docs/backlog-issues-real-runs.md" ||
          path === "tests/backlog-closure.test.mjs" ||
          path === "tools/backlog-closure.mjs" ||
          path.startsWith("spec/2026-08-31-backlog-zero/") ||
          path.startsWith("spec/2026-09-02-backlog-zero/") ||
          path.startsWith("spec/2026-09-02-backlog-zero-model-testing-amendment/"),
        line,
      );
    } else assert.fail(`unauthorized delta ${line}`);
  }
});

test("the current backlog has no substantive AST content under Open", () => {
  const source = readFileSync("docs/backlog.md", "utf8");
  assert.match(source, /\n## Открыто\s*$/u);
  assert.doesNotMatch(source, /\n### /u);
  assert.equal(
    readFileSync("docs/acceptance.md", "utf8").includes("backlog-provenance.test.mjs"),
    true,
  );
});
