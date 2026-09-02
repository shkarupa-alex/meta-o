/**
 * Preserve auditable proof after temporary backlog closure artifacts are deleted.
 *
 * Protects §A-MEMORY-03.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import yaml from "js-yaml";
import { fromMarkdown } from "mdast-util-from-markdown";

const ROOT = process.cwd();
function git(args) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
function text(node) {
  return typeof node.value === "string" ? node.value : (node.children ?? []).map(text).join("");
}
function coordinates() {
  const document = fromMarkdown(readFileSync("docs/acceptance.md", "utf8"));
  const block = document.children
    .filter(({ type, lang }) => type === "code" && lang === "yaml")
    .map(({ value }) => yaml.load(value)?.backlog_closure)
    .find(Boolean);
  assert.ok(block, "acceptance has no structured backlog_closure coordinates");
  for (const key of ["backlog_blob", "real_runs_blob", "closure_sha", "map_blob"])
    assert.match(block[key], /^[a-f0-9]{40}$/u, key);
  return block;
}

const COORDINATES = coordinates();

test("acceptance points to reachable source, closure and map objects", () => {
  assert.equal(git(["merge-base", "--is-ancestor", COORDINATES.closure_sha, "HEAD"]).status, 0);
  for (const object of [COORDINATES.backlog_blob, COORDINATES.real_runs_blob, COORDINATES.map_blob])
    assert.equal(git(["cat-file", "-e", object]).status, 0, object);
  const mapResult = git(["cat-file", "blob", COORDINATES.map_blob]);
  assert.equal(mapResult.status, 0, mapResult.stderr);
  const map = JSON.parse(mapResult.stdout);
  assert.equal(map.contract, "meta-o.backlog-closure-map.v2");
  assert.deepEqual(
    map.sources.map(({ blob }) => blob),
    [COORDINATES.backlog_blob, COORDINATES.real_runs_blob],
  );
  assert.equal(map.rows.length, 736);
  assert.equal(
    map.rows.length,
    Object.values(map.source_counts).reduce((sum, count) => sum + count, 0),
  );
  assert.ok(map.semantic_assignments.length > 60);
  for (const proof of Object.values(map.proofs)) {
    for (const path of proof.durable_paths)
      assert.equal(
        git(["cat-file", "-e", `${COORDINATES.closure_sha}:${path}`]).status,
        0,
        `missing durable proof ${path}`,
      );
  }
});

test("the post-closure delta is exactly the authorized retirement transition", () => {
  const result = git(["diff", "--name-status", `${COORDINATES.closure_sha}..HEAD`]);
  assert.equal(result.status, 0, result.stderr);
  const allowedModified = new Set([
    "docs/acceptance.md",
    "tests/backlog-provenance.test.mjs",
    "tests/knowledge-history.test.mjs",
    "tests/model-testing-policy.test.mjs",
    "skills/mo-orchestrate-orca/scripts/mo-models.mjs",
    "skills/mo-review-orca/scripts/mo-models.mjs",
  ]);
  for (const line of result.stdout.trim().split("\n").filter(Boolean)) {
    const [status, path] = line.split("\t");
    if (status === "M") assert.ok(allowedModified.has(path), line);
    else if (status === "D")
      assert.ok(
        path === "docs/backlog-issues-real-runs.md" ||
          path === "tests/backlog-closure.test.mjs" ||
          path === "tools/backlog-closure.mjs" ||
          path.startsWith("spec/2026-08-31-backlog-zero/") ||
          path.startsWith("spec/2026-09-02-backlog-zero/") ||
          path.startsWith("spec/2026-09-02-backlog-zero-model-testing-amendment/"),
        line,
      );
    else assert.fail(`unauthorized delta ${line}`);
  }
});

test("the current backlog has no substantive AST content under Open", () => {
  const children = fromMarkdown(readFileSync("docs/backlog.md", "utf8")).children;
  const open = children.findIndex(
    (node) => node.type === "heading" && node.depth === 2 && text(node).trim() === "Открыто",
  );
  assert.ok(open >= 0, "docs/backlog.md has no Open section");
  assert.deepEqual(children.slice(open + 1), []);
});
