/**
 * Prove the temporary frozen-ledger closure map is lossless and executable.
 *
 * Protects §A-MEMORY-03.
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

test("semantic assignments are explicit and never inherited from heading keywords", () => {
  const map = storedMap();
  assert.equal(map.contract, "meta-o.backlog-closure-map.v2");
  assert.ok(map.semantic_assignments.length > 60);
  assert.equal(
    map.rows.filter(
      ({ owner_workstream, proof_id }) =>
        (proof_id === "P-KNOWLEDGE" && owner_workstream !== "Spec 4") ||
        (proof_id === "P-WATCHDOG" && owner_workstream !== "Spec 3"),
    ).length,
    0,
  );
  const sibling = map.rows.find(({ source_locator }) =>
    source_locator.includes("docs/backlog.md:L25-L25:"),
  );
  assert.equal(sibling.proof_id, "P-KNOWLEDGE");
  assert.doesNotMatch(sibling.source_locator, /Watchdog[^:]* > Цепочка/u);
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
    if (row.node_role !== "context")
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
  assert.ok(map.rows.some(({ disposition }) => disposition === "architecture-rejected"));
  assert.ok(map.rows.some(({ disposition }) => disposition === "merged-duplicate"));
  for (const { durable_obligation } of map.rows) {
    assert.ok(Array.isArray(durable_obligation));
    for (const path of durable_obligation)
      assert.equal(readFileSync(join(ROOT, path), "utf8").length > 0, true, path);
  }
});

test("every adopted proof is an executable passing command", () => {
  const map = storedMap();
  for (const [proofId, { command }] of Object.entries(map.proofs)) {
    const [executable, ...args] = command;
    const result = spawnSync(executable, args, { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 0, `${proofId}: ${result.stdout}\n${result.stderr}`);
  }
});
