/**
 * Prove the embedded per-skill eval corpus and fail-closed evidence workflow.
 *
 * Protects §A-EVAL-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { loadCorpus, validateEvidence } from "../tools/skill-evals.mjs";

const ROOT = process.cwd();
const HEAD = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();

function revision(skill) {
  return spawnSync("git", ["rev-parse", `${HEAD}:skills/${skill}`], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout.trim();
}

function envelope(skill, policy = "advisory") {
  const identity =
    policy === "critical"
      ? { route: "opencode", model: "llamacpp/qwen3.8-27b", effort: "default" }
      : { route: "codex", model: "gpt-5.6-terra", effort: "low" };
  return {
    contract: "meta-o.skill-eval-evidence.v1",
    candidate: HEAD,
    skillRevision: revision(skill),
    skill,
    policy,
    repetition: 1,
    requested: identity,
    effective: { ...identity },
    harness: {
      name: policy === "critical" ? "OpenCode" : "Codex",
      version: "fixture-1",
      profileVersion: "fixture-profile-1",
      quantization: policy === "critical" ? "UD-Q4-KM" : "provider-managed",
      context: policy === "critical" ? "32768" : "fixture-context",
      sampling: "fixture-defaults",
      toolPermissions: ["read", "shell-readonly"],
    },
    results: ["positive", "forbidden", "degraded"].map((kind) => ({
      caseId: `${skill}.${kind}`,
      verdict: "PASS",
      observations: [`${kind} oracle satisfied`],
    })),
  };
}

test("every installable skill owns three bounded embedded cases", () => {
  const corpus = loadCorpus(ROOT);
  assert.equal(corpus.size, 8);
  assert.equal(
    [...corpus.values()].reduce((sum, document) => sum + document.cases.length, 0),
    24,
  );
  assert.equal(corpus.get("mo-orchestrate-orca").policy, "critical");
});

test("complete evidence binds every skill to candidate, revision and approved identity", () => {
  const corpus = loadCorpus(ROOT);
  const evidence = [...corpus.values()].map(({ skill, policy }) => envelope(skill, policy));
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD, true), {
    envelopes: 8,
    nonPass: [],
  });
});

test("evidence fails closed on identity drift, missing coverage and sensitive fields", () => {
  const drift = envelope("find-reuse");
  drift.effective.model = "gpt-5.6-sol";
  assert.throws(
    () => validateEvidence(ROOT, drift, HEAD),
    /requested\/effective identity mismatch/,
  );

  const expensive = envelope("find-reuse");
  expensive.requested = { route: "codex", model: "gpt-5.6-sol", effort: "high" };
  expensive.effective = { ...expensive.requested };
  assert.throws(() => validateEvidence(ROOT, expensive, HEAD), /testCodex must be/);

  const sensitive = envelope("find-reuse");
  sensitive.harness.apiToken = "must-not-survive";
  assert.throws(() => validateEvidence(ROOT, sensitive, HEAD), /forbidden evidence field/);

  assert.throws(
    () => validateEvidence(ROOT, envelope("find-reuse"), HEAD, true),
    /missing skill evidence/,
  );

  const wrongCriticalModel = envelope("mo-orchestrate-orca", "critical");
  wrongCriticalModel.requested.model = "remote/qwen2-7b";
  wrongCriticalModel.effective.model = "remote/qwen2-7b";
  wrongCriticalModel.harness.context = "1";
  assert.throws(
    () => validateEvidence(ROOT, wrongCriticalModel, HEAD),
    /qualified Qwen 3\.8 27B OpenCode profile/,
  );
});

test("blocking verdicts fail the live gate while evidenced inapplicability is accepted", () => {
  const evidence = envelope("find-reuse");
  evidence.results[2].verdict = "UNKNOWN";
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, [evidence.results[2]]);

  evidence.results[2].verdict = "NOT_APPLICABLE";
  evidence.results[2].observations = ["documented applicability rule did not select this case"];
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, []);

  evidence.results[2].observations = [];
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /needs an observation/);
});

test("the CLI exposes a bounded prompt without launching a model", () => {
  const result = spawnSync(
    process.execPath,
    [
      "tools/skill-evals.mjs",
      "--prompt",
      "find-reuse",
      "--candidate",
      HEAD,
      "--route",
      "codex",
      "--model",
      "gpt-5.6-terra",
      "--effort",
      "low",
      "--harness",
      "Codex",
      "--harness-version",
      "fixture-1",
      "--profile-version",
      "fixture-profile-1",
      "--quantization",
      "provider-managed",
      "--context",
      "fixture-context",
      "--sampling",
      "fixture-defaults",
      "--tool-permissions",
      "read,shell-readonly",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /find-reuse\.positive/);
  assert.match(result.stdout, /INSTALLABLE INSTRUCTIONS/);
  assert.doesNotMatch(result.stdout, /\/home\/|\/mnt\//);
});
