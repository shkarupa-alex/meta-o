/**
 * Prove the temporary frozen-ledger closure map is lossless and executable.
 *
 * Protects §A-MEMORY-02.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { buildClosureMap } from "../tools/backlog-closure.mjs";

const ROOT = process.cwd();
const MAP_PATH = join(ROOT, "spec/2026-08-31-backlog-zero/closure-map.json");
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

function storedMap() {
  return JSON.parse(readFileSync(MAP_PATH, "utf8"));
}

test("every frozen AST block has exactly one byte-identical closure row", () => {
  const expected = buildClosureMap(ROOT);
  const actual = storedMap();
  assert.deepEqual(actual.sources, expected.sources);
  assert.deepEqual(actual.source_counts, expected.source_counts);
  assert.deepEqual(actual.rows, expected.rows);
  assert.equal(
    new Set(actual.rows.map(({ source_locator }) => source_locator)).size,
    actual.rows.length,
  );
});

test("roles preserve obligations, evidence, controls, duplicates and workarounds", () => {
  const map = storedMap();
  const obligations = new Set(
    map.rows
      .filter(({ node_role }) => node_role === "obligation")
      .map(({ obligation_id }) => obligation_id),
  );
  for (const row of map.rows) {
    assert.ok(ROLES.has(row.node_role), row.source_locator);
    assert.ok(DISPOSITIONS.has(row.disposition), row.source_locator);
    assert.ok(obligations.has(row.obligation_id), `${row.source_locator}: orphan obligation`);
    assert.ok(map.proofs[row.proof_id], `${row.source_locator}: missing proof`);
    assert.ok(row.owner_workstream && row.durable_obligation, row.source_locator);
    if (row.node_role === "superseded-workaround") assert.ok(row.replacement_contract);
  }
  for (const role of ROLES)
    assert.ok(
      map.rows.some(({ node_role }) => node_role === role),
      `missing ${role}`,
    );
});

test("every adopted proof is an executable passing command", () => {
  const map = storedMap();
  for (const [proofId, { command }] of Object.entries(map.proofs)) {
    const [executable, ...args] = command;
    const result = spawnSync(executable, args, { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 0, `${proofId}: ${result.stdout}\n${result.stderr}`);
  }
});
