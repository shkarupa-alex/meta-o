/**
 * §M-TEST-E2E-QC — Acceptance tests for the E2E catalog, plans and the QC contract.
 *
 * Covers the §30 and §40 acceptance lists: an empty plan is impossible because
 * of `always_required`, a plan digest binds the commitments it names, a missing
 * QC result is never a pass, a silently skipped gate fails, and weakening the
 * contract relative to the base revision is detected.
 *
 * Verifies §A-E2E-SELECTION and §A-AUTHORITATIVE-QC.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  baselineSelection,
  computePlanDigest,
  danglingBusinessLinks,
  sealPlan,
  validatePlan,
  validateRegistry,
} from "../dist/core/e2e-registry.mjs";
import {
  detectWeakening,
  evaluateQc,
  validateManifest,
  validateResult,
} from "../dist/core/qc.mjs";
import {
  detectBaselineWeakening,
  detectPolicyWeakening,
  parseMetaOPolicy,
} from "../dist/core/policy.mjs";
import { sampleRegistry } from "./helpers.mts";
import type { E2ERegistry, QcManifest, QcResult } from "../dist/core/types.mjs";

/** §M-TEST-E2E-QC — Parse the shared sample catalog. */
function registry(): E2ERegistry {
  return JSON.parse(sampleRegistry()) as E2ERegistry;
}

/** §M-TEST-E2E-QC — A manifest with two blocking gates. */
function manifest(): QcManifest {
  return {
    schema_version: 1,
    gates: [
      { id: "lint", command: "ruff check .", policy: "passed" },
      { id: "tests", command: "pytest", policy: "passed" },
    ],
  };
}

test("a valid registry passes and reports no errors", () => {
  const outcome = validateRegistry(registry());
  assert.deepEqual(outcome.errors, []);
  assert.equal(outcome.ok, true);
});

test("a catalog with no always_required scenario is rejected", () => {
  const broken = registry();
  broken.scenarios[0]!.always_required = false;
  const outcome = validateRegistry(broken);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((error) => error.includes("always_required")));
});

test("duplicate scenario ids are rejected", () => {
  const broken = registry();
  broken.scenarios[1]!.scenario_id = broken.scenarios[0]!.scenario_id;
  assert.equal(validateRegistry(broken).ok, false);
});

test("a malformed business link is rejected", () => {
  const broken = registry();
  broken.scenarios[0]!.business_links = ["B-CORE-01"];
  assert.equal(validateRegistry(broken).ok, false);
});

test("an invalid last_run status is rejected", () => {
  const broken = registry();
  broken.scenarios[0]!.last_run = {
    snapshot_digest: "d",
    provenance_commit: "c",
    run_id: "r",
    spec_sha256: "s",
    verified_at: "2026-01-01T00:00:00Z",
    status: "flaky" as never,
    environment: "local",
  };
  assert.equal(validateRegistry(broken).ok, false);
});

test("business links that no anchor defines are reported", () => {
  const dangling = danglingBusinessLinks(registry(), new Set(["§B-CORE-01"]));
  assert.deepEqual(dangling, ["E2E-CHECKOUT-01 → §B-CHECKOUT-01"]);
});

test("an empty selection is impossible because always_required must be included", () => {
  const plan = sealPlan({
    schemaVersion: 1,
    commitOid: "commit-1",
    selectedScenarioIds: [],
    selectionRationale: "nothing looked relevant",
    impactedBusinessLinks: [],
    impactedTags: [],
  });
  const outcome = validatePlan(plan, registry());
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((error) => error.includes("at least one")));
  assert.ok(outcome.errors.some((error) => error.includes("always_required")));
});

test("a plan selecting an unknown scenario is rejected", () => {
  const plan = sealPlan({
    schemaVersion: 1,
    commitOid: "commit-1",
    selectedScenarioIds: ["E2E-SMOKE-01", "E2E-GHOST-99"],
    selectionRationale: "typo",
    impactedBusinessLinks: [],
    impactedTags: [],
  });
  assert.equal(validatePlan(plan, registry()).ok, false);
});

test("a tampered plan digest is detected", () => {
  const plan = sealPlan({
    schemaVersion: 1,
    commitOid: "commit-1",
    selectedScenarioIds: ["E2E-SMOKE-01"],
    selectionRationale: "canary only",
    impactedBusinessLinks: [],
    impactedTags: [],
  });
  const tampered = { ...plan, selectedScenarioIds: ["E2E-SMOKE-01", "E2E-CHECKOUT-01"] };
  const outcome = validatePlan(tampered, registry());
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((error) => error.includes("planDigest mismatch")));
});

test("the plan digest ignores ordering but not membership", () => {
  const base = {
    schemaVersion: 1 as const,
    commitOid: "commit-1",
    selectedScenarioIds: ["E2E-SMOKE-01", "E2E-CHECKOUT-01"],
    selectionRationale: "both",
    impactedBusinessLinks: ["§B-CORE-01"],
    impactedTags: ["smoke"],
  };
  const reordered = { ...base, selectedScenarioIds: ["E2E-CHECKOUT-01", "E2E-SMOKE-01"] };
  const reduced = { ...base, selectedScenarioIds: ["E2E-SMOKE-01"] };

  assert.equal(computePlanDigest(base), computePlanDigest(reordered));
  assert.notEqual(computePlanDigest(base), computePlanDigest(reduced));
});

test("baseline selection always includes the canary and follows links and tags", () => {
  assert.deepEqual(baselineSelection(registry(), { businessLinks: [], tags: [] }), ["E2E-SMOKE-01"]);
  assert.deepEqual(
    baselineSelection(registry(), { businessLinks: ["§B-CHECKOUT-01"], tags: [] }),
    ["E2E-CHECKOUT-01", "E2E-SMOKE-01"],
  );
  assert.deepEqual(baselineSelection(registry(), { businessLinks: [], tags: ["checkout"] }), [
    "E2E-CHECKOUT-01",
    "E2E-SMOKE-01",
  ]);
});

test("a manifest declaring not_applicable without a rationale is rejected", () => {
  const broken: QcManifest = {
    schema_version: 1,
    gates: [{ id: "build-policy", command: "true", policy: "not_applicable" }],
  };
  assert.equal(validateManifest(broken).ok, false);

  const explained: QcManifest = {
    schema_version: 1,
    gates: [
      {
        id: "build-policy",
        command: "true",
        policy: "not_applicable",
        rationale: "this project produces no distributable artifact",
      },
    ],
  };
  assert.equal(validateManifest(explained).ok, true);
});

test("a missing QC result is never a pass", () => {
  const evaluation = evaluateQc(manifest(), undefined, "digest-1");
  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.reasons.some((reason) => reason.includes("missing result")));
});

test("a declared gate that produced no result fails the run", () => {
  const result: QcResult = {
    schema_version: 1,
    snapshot_digest: "digest-1",
    gates: [{ id: "lint", status: "passed", command: "ruff check ." }],
  };
  const evaluation = evaluateQc(manifest(), result, "digest-1");
  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.reasons.some((reason) => reason.includes("tests")));
});

test("a silently skipped gate fails when the manifest requires it to pass", () => {
  const result: QcResult = {
    schema_version: 1,
    snapshot_digest: "digest-1",
    gates: [
      { id: "lint", status: "not_applicable", command: "ruff check ." },
      { id: "tests", status: "passed", command: "pytest" },
    ],
  };
  const evaluation = evaluateQc(manifest(), result, "digest-1");
  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.reasons.some((reason) => reason.includes("not_applicable")));
});

test("a result computed for another snapshot fails", () => {
  const result: QcResult = {
    schema_version: 1,
    snapshot_digest: "digest-0",
    gates: [
      { id: "lint", status: "passed", command: "ruff check ." },
      { id: "tests", status: "passed", command: "pytest" },
    ],
  };
  assert.equal(evaluateQc(manifest(), result, "digest-1").pass, false);
});

test("a fully executed manifest passes", () => {
  const result: QcResult = {
    schema_version: 1,
    snapshot_digest: "digest-1",
    gates: [
      { id: "lint", status: "passed", command: "ruff check .", tool_version: "ruff 0.6", duration_ms: 12 },
      { id: "tests", status: "passed", command: "pytest", tool_version: "pytest 8", duration_ms: 900 },
    ],
  };
  const evaluation = evaluateQc(manifest(), result, "digest-1");
  assert.deepEqual(evaluation.reasons, []);
  assert.equal(evaluation.pass, true);
});

test("a result reporting an undeclared gate is rejected", () => {
  const result: QcResult = {
    schema_version: 1,
    snapshot_digest: "digest-1",
    gates: [
      { id: "lint", status: "passed", command: "ruff check ." },
      { id: "tests", status: "passed", command: "pytest" },
      { id: "vibes", status: "passed", command: "echo fine" },
    ],
  };
  assert.equal(evaluateQc(manifest(), result, "digest-1").pass, false);
});

test("a malformed QC result is rejected rather than partially trusted", () => {
  assert.equal(validateResult({ schema_version: 2, snapshot_digest: "d", gates: [] }).ok, false);
  assert.equal(validateResult({ schema_version: 1, gates: [] }).ok, false);
  assert.equal(
    validateResult({
      schema_version: 1,
      snapshot_digest: "d",
      gates: [{ id: "lint", status: "skipped", command: "x" }],
    }).ok,
    false,
  );
});

test("removing, relaxing or rewriting a gate is reported as weakening", () => {
  const baseline = manifest();
  const removed: QcManifest = { schema_version: 1, gates: [baseline.gates[0]!] };
  const relaxed: QcManifest = {
    schema_version: 1,
    gates: [
      baseline.gates[0]!,
      { id: "tests", command: "pytest", policy: "not_applicable", rationale: "slow" },
    ],
  };
  const rewritten: QcManifest = {
    schema_version: 1,
    gates: [baseline.gates[0]!, { id: "tests", command: "pytest -k smoke", policy: "passed" }],
  };

  assert.equal(detectWeakening(baseline, removed)[0]?.kind, "removed");
  assert.equal(detectWeakening(baseline, relaxed)[0]?.kind, "policy_relaxed");
  assert.equal(detectWeakening(baseline, rewritten)[0]?.kind, "command_changed");
  assert.deepEqual(detectWeakening(baseline, manifest()), []);
});

/** §M-TEST-E2E-QC — A pyproject whose `[tool.meta_o.*]` policy is deliberately strict. */
const STRICT_POLICY = `
[project]
name = "demo"

[tool.meta_o.code_health]
source_roots = ["src", "tests"]
max_function_lines = 60
forbid_regressions = true

[tool.meta_o.purpose]
exempt_files = ["src/generated/*.py"]
`;

test("raising a threshold, dropping a root or adding an exemption is weakening", () => {
  const before = parseMetaOPolicy(STRICT_POLICY);
  assert.deepEqual(before.errors, []);
  assert.deepEqual(before.tables.get("tool.meta_o.code_health")?.["source_roots"], ["src", "tests"]);
  assert.deepEqual(detectPolicyWeakening(before, parseMetaOPolicy(STRICT_POLICY)), []);

  const kinds = (text: string): string[] =>
    detectPolicyWeakening(before, parseMetaOPolicy(text)).map((item) => item.kind);

  assert.deepEqual(kinds(STRICT_POLICY.replace("max_function_lines = 60", "max_function_lines = 600")), [
    "threshold_raised",
  ]);
  assert.deepEqual(kinds(STRICT_POLICY.replace("max_function_lines = 60", "max_function_lines = 40")), []);
  assert.deepEqual(kinds(STRICT_POLICY.replace("forbid_regressions = true", "forbid_regressions = false")), [
    "ratchet_disabled",
  ]);
  assert.deepEqual(kinds(STRICT_POLICY.replace(`, "tests"`, "")), ["scope_narrowed"]);
  assert.deepEqual(kinds(STRICT_POLICY.replace(`"src/generated/*.py"`, `"src/generated/*.py", "src/legacy/*.py"`)), [
    "exemption_added",
  ]);
  assert.deepEqual(kinds(STRICT_POLICY.replace("[tool.meta_o.purpose]", "[tool.other.purpose]")), [
    "section_removed",
  ]);
});

test("a policy key this parser cannot read is an error, never a silent pass", () => {
  const parsed = parseMetaOPolicy(`
[tool.meta_o.code_health]
thresholds = { max_function_lines = 60 }
`);
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0]!, /unsupported value/);
});

test("a re-frozen or newly frozen baseline entry is weakening", () => {
  const before = { "src/a.py::complexity::f": 12, cycles: [["a", "b"]], fan_in: { a: 3 } };
  const worse = { "src/a.py::complexity::f": 19, cycles: [["a", "b"]], fan_in: { a: 3 } };
  const grown = { "src/a.py::complexity::f": 12, cycles: [["a", "b"], ["c", "d"]], fan_in: { a: 3 } };
  const better = { "src/a.py::complexity::f": 11, cycles: [], fan_in: { a: 1 } };

  assert.deepEqual(detectBaselineWeakening("b.json", before, before), []);
  assert.deepEqual(detectBaselineWeakening("b.json", before, better), []);
  assert.equal(detectBaselineWeakening("b.json", before, worse)[0]?.kind, "baseline_raised");
  const added = detectBaselineWeakening("b.json", before, grown);
  assert.equal(added[0]?.kind, "baseline_added");
  assert.match(added[0]!.key, /cycles\[c→d\]/);
});
