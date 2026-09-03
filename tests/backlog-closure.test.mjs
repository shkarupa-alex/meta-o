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

import { DURABLE, OBLIGATION_PROOF_FILE, buildClosureMap } from "../tools/backlog-closure.mjs";

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
  assert.equal(map.contract, "meta-o.backlog-closure-map.v3");
  assert.ok(map.semantic_assignments.length > 60);
  const knowledge = JSON.stringify(DURABLE["P-KNOWLEDGE"]);
  const watchdog = JSON.stringify(DURABLE["P-WATCHDOG"]);
  assert.equal(
    map.rows.filter(({ owner_workstream, durable_obligation }) => {
      const durable = JSON.stringify(durable_obligation);
      return (
        (durable === knowledge && owner_workstream !== "Spec 4") ||
        (durable === watchdog && owner_workstream !== "Spec 3")
      );
    }).length,
    0,
  );
  const sibling = map.rows.find(({ source_locator }) =>
    source_locator.includes("docs/backlog.md:L25-L25:"),
  );
  assert.deepEqual(sibling.durable_obligation, DURABLE["P-KNOWLEDGE"]);
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
    // A context row is not exempt: §4.5 makes it reference one concrete
    // obligation, and a synthetic id nobody defines is exactly the hole that
    // let two rows close against nothing.
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

test("every obligation's proof resolves to exactly one passing named assertion", () => {
  const map = storedMap();
  // A test runner child inherits NODE_TEST_CONTEXT and would answer in the
  // internal serialized reporter instead of TAP.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", OBLIGATION_PROOF_FILE],
    { cwd: ROOT, encoding: "utf8", env, maxBuffer: 32 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const passing = [...result.stdout.matchAll(/^ok \d+ - (.+)$/gmu)].map(([, name]) => name);
  assert.ok(passing.length > 60, `${passing.length} passing assertions`);
  const proofs = Object.entries(map.proofs);
  assert.ok(proofs.length > 60, `${proofs.length} proofs`);
  for (const [proofId, { command }] of proofs) {
    assert.equal(command[0], "node");
    assert.equal(command.at(-1), OBLIGATION_PROOF_FILE);
    const pattern = new RegExp(command[command.indexOf("--test-name-pattern") + 1], "u");
    const matched = passing.filter((name) => pattern.test(name));
    assert.equal(matched.length, 1, `${proofId}: ${matched.length} matching assertions`);
  }
});
