/**
 * Preserve auditable proof after the temporary closure artifacts are deleted.
 *
 * The previous version of this test compared `closure_sha..HEAD`, so it failed
 * on every commit made after the closure and froze the repository. The proof
 * asked for is the deletion delta, which is a fixed pair of commits, with no
 * hard-coded node count: the map's own totals and bijection are the invariant.
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
const ROLES = new Set([
  "obligation",
  "evidence",
  "duplicate-evidence",
  "positive-control",
  "superseded-workaround",
  "context",
]);
const DISPOSITIONS = new Set([
  "implemented",
  "merged-duplicate",
  "architecture-rejected",
  "upstream-fixed",
  "public-workaround-proven",
]);

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
  for (const key of ["backlog_blob", "real_runs_blob", "closure_sha", "deletion_sha", "map_blob"])
    assert.match(block[key], /^[a-f0-9]{40}$/u, key);
  return block;
}
function closureMap(coordinate) {
  const result = git(["cat-file", "blob", coordinate.map_blob]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const COORDINATES = coordinates();

test("acceptance points to reachable source, closure and map objects", () => {
  for (const commit of [COORDINATES.closure_sha, COORDINATES.deletion_sha])
    assert.equal(git(["merge-base", "--is-ancestor", commit, "HEAD"]).status, 0, commit);
  assert.equal(
    git(["merge-base", "--is-ancestor", COORDINATES.closure_sha, COORDINATES.deletion_sha]).status,
    0,
    "closure must precede its deletion",
  );
  for (const object of [COORDINATES.backlog_blob, COORDINATES.real_runs_blob, COORDINATES.map_blob])
    assert.equal(git(["cat-file", "-e", object]).status, 0, object);
  const map = closureMap(COORDINATES);
  assert.equal(map.contract, "meta-o.backlog-closure-map.v3");
  assert.deepEqual(
    map.sources.map(({ blob }) => blob),
    [COORDINATES.backlog_blob, COORDINATES.real_runs_blob],
  );
  // The map's own totals, not a number written here: a fixed expected count is
  // exactly the check that cannot notice a lost node.
  assert.equal(
    map.rows.length,
    Object.values(map.source_counts).reduce((sum, count) => sum + count, 0),
  );
  assert.equal(new Set(map.rows.map(({ source_locator }) => source_locator)).size, map.rows.length);
  assert.ok(map.semantic_assignments.length > 60);
});

test("every row in the retired map still resolves to a defined obligation and proof", () => {
  const map = closureMap(COORDINATES);
  const obligations = new Set(
    map.rows
      .filter(({ node_role }) => node_role === "obligation")
      .map(({ obligation_id }) => obligation_id),
  );
  assert.ok(obligations.size > 60);
  for (const row of map.rows) {
    assert.ok(ROLES.has(row.node_role), row.source_locator);
    assert.ok(DISPOSITIONS.has(row.disposition), row.source_locator);
    // Including `context`: a row that references an id nobody defines closes
    // against nothing, whatever its role.
    assert.ok(obligations.has(row.obligation_id), `${row.source_locator}: orphan obligation`);
    assert.ok(map.proofs[row.proof_id], `${row.source_locator}: missing proof`);
  }
  for (const role of ROLES)
    assert.ok(
      map.rows.some(({ node_role }) => node_role === role),
      role,
    );
  for (const [proofId, proof] of Object.entries(map.proofs)) {
    assert.ok(obligations.has(proofId), `${proofId}: proof without an obligation`);
    for (const path of proof.durable_paths)
      assert.equal(
        git(["cat-file", "-e", `${COORDINATES.closure_sha}:${path}`]).status,
        0,
        `missing durable proof ${path}`,
      );
  }
});

test("every obligation proof still names one passing assertion in the current tree", () => {
  const map = closureMap(COORDINATES);
  const files = new Set(Object.values(map.proofs).map(({ command }) => command.at(-1)));
  assert.equal(files.size, 1, [...files].join(", "));
  const [file] = [...files];
  for (const commit of [COORDINATES.closure_sha, "HEAD"])
    assert.equal(git(["cat-file", "-e", `${commit}:${file}`]).status, 0, `${commit}:${file}`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", file], {
    cwd: ROOT,
    encoding: "utf8",
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const passing = [...result.stdout.matchAll(/^ok \d+ - (.+)$/gmu)].map(([, name]) => name);
  for (const [proofId, { command }] of Object.entries(map.proofs)) {
    assert.equal(command[0], "node");
    const pattern = new RegExp(command[command.indexOf("--test-name-pattern") + 1], "u");
    assert.equal(passing.filter((name) => pattern.test(name)).length, 1, proofId);
  }
});

test("the closure-to-deletion delta is exactly the authorized retirement", () => {
  const result = git([
    "diff",
    "--name-status",
    `${COORDINATES.closure_sha}..${COORDINATES.deletion_sha}`,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  assert.ok(lines.length > 0, "the deletion delta cannot be empty");
  for (const line of lines) {
    const [status, path] = line.split("\t");
    if (status === "M") assert.equal(path, "docs/acceptance.md", line);
    else if (status === "D")
      assert.ok(
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

test("the retirement itself left no substantive AST content under Open", () => {
  // The provenance fact is historical: the ledger was empty on the deletion
  // commit. Asserting it of the working tree instead would forbid every future
  // real deferral the project instruction requires to be recorded here.
  const result = git(["show", `${COORDINATES.deletion_sha}:docs/backlog.md`]);
  assert.equal(result.status, 0, result.stderr);
  const children = fromMarkdown(result.stdout).children;
  const open = children.findIndex(
    (node) => node.type === "heading" && node.depth === 2 && text(node).trim() === "Открыто",
  );
  assert.ok(open >= 0, "the retired backlog has no Open section");
  assert.deepEqual(children.slice(open + 1), []);
});
