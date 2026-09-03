/**
 * Prove the embedded per-skill eval corpus and fail-closed evidence workflow.
 *
 * Protects §A-EVAL-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { evaluationDigest, loadCorpus, validateEvidence } from "../tools/skill-evals.mjs";

const ROOT = process.cwd();
const HEAD = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();

function revision(skill) {
  return spawnSync("git", ["rev-parse", `${HEAD}:skills/${skill}`], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout.trim();
}

function envelope(skill, policy = "advisory") {
  const document = loadCorpus(ROOT).get(skill);
  const identity =
    policy === "critical"
      ? { route: "opencode", model: "llamacpp/qwen3.8-27b", effort: "default" }
      : { route: "codex", model: "gpt-5.6-terra", effort: "low" };
  return {
    contract: "meta-o.skill-eval-evidence.v2",
    candidate: HEAD,
    skillRevision: revision(skill),
    skill,
    policy,
    repetition: 1,
    requested: identity,
    harness: {
      name: policy === "critical" ? "OpenCode" : "Codex",
      version: "fixture-1",
      profileVersion: "fixture-profile-1",
      quantization: policy === "critical" ? "UD-Q4-KM" : "provider-managed",
      context: policy === "critical" ? "32768" : "fixture-context",
      sampling: "fixture-defaults",
      toolPermissions: ["read", "shell-readonly"],
    },
    execution: {
      id: `${skill}-native-execution-1`,
      source: identity.route,
      startedAt: "2026-09-02T10:00:00.000Z",
      completedAt: "2026-09-02T10:00:01.000Z",
      exitCode: 0,
      effective: { ...identity },
      identityEvidence: `native ${identity.route} result named ${identity.model}`,
      evaluationDigest: "",
    },
    results: document.cases.map((item) => ({
      caseId: item.id,
      verdict: "PASS",
      observations: [`${item.class} behavior observed`],
      oracleEvidence: [
        ...item.must.map((oracle) => ({
          kind: "must",
          oracle,
          satisfied: true,
          evidence: `observed required behavior: ${oracle}`,
        })),
        ...item.mustNot.map((oracle) => ({
          kind: "mustNot",
          oracle,
          satisfied: true,
          evidence: `observed forbidden behavior absent: ${oracle}`,
        })),
      ],
    })),
  };
}

function finalizedEnvelope(skill, policy = "advisory") {
  const result = envelope(skill, policy);
  result.execution.evaluationDigest = evaluationDigest(loadCorpus(ROOT).get(skill), result);
  return result;
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
  const evidence = [...corpus.values()].map(({ skill, policy }) =>
    finalizedEnvelope(skill, policy),
  );
  assert.deepEqual(
    validateEvidence(ROOT, evidence, HEAD, true, {
      criticalProfile: "opencode/llamacpp/qwen3.8-27b/default",
    }),
    {
      envelopes: 8,
      nonPass: [],
    },
  );
});

test("evidence fails closed on identity drift, missing coverage and sensitive fields", () => {
  const drift = finalizedEnvelope("find-reuse");
  drift.execution.effective.model = "gpt-5.6-sol";
  assert.throws(
    () => validateEvidence(ROOT, drift, HEAD),
    /requested\/effective identity mismatch/,
  );

  const expensive = finalizedEnvelope("find-reuse");
  expensive.requested = { route: "codex", model: "gpt-5.6-sol", effort: "high" };
  expensive.execution.effective = { ...expensive.requested };
  expensive.execution.evaluationDigest = evaluationDigest(
    loadCorpus(ROOT).get("find-reuse"),
    expensive,
  );
  assert.throws(() => validateEvidence(ROOT, expensive, HEAD), /testCodex must be/);

  const sensitive = finalizedEnvelope("find-reuse");
  sensitive.harness.apiToken = "must-not-survive";
  assert.throws(() => validateEvidence(ROOT, sensitive, HEAD), /forbidden evidence field/);

  assert.throws(
    () => validateEvidence(ROOT, finalizedEnvelope("find-reuse"), HEAD, true),
    /missing skill evidence/,
  );

  const wrongCriticalModel = finalizedEnvelope("mo-orchestrate-orca", "critical");
  wrongCriticalModel.requested.model = "remote/qwen2-7b";
  wrongCriticalModel.execution.effective.model = "remote/qwen2-7b";
  wrongCriticalModel.harness.context = "1";
  wrongCriticalModel.execution.evaluationDigest = evaluationDigest(
    loadCorpus(ROOT).get("mo-orchestrate-orca"),
    wrongCriticalModel,
  );
  assert.throws(
    () =>
      validateEvidence(ROOT, wrongCriticalModel, HEAD, false, {
        criticalProfile: "opencode/llamacpp/qwen3.8-27b/default",
      }),
    /configured orchestrator profile/,
  );
});

test("blocking verdicts fail the live gate while evidenced inapplicability is accepted", () => {
  const evidence = finalizedEnvelope("find-reuse");
  evidence.results[2].verdict = "UNKNOWN";
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, [evidence.results[2]]);

  evidence.results[2].verdict = "NOT_APPLICABLE";
  evidence.results[2].observations = ["documented applicability rule did not select this case"];
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, []);

  evidence.results[2].observations = [];
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /needs an observation/);
});

test("PASS cannot be accepted without case-specific oracle evidence", () => {
  const evidence = finalizedEnvelope("find-reuse");
  evidence.results[0].oracleEvidence = [];
  assert.throws(
    () => validateEvidence(ROOT, evidence, HEAD),
    /oracle evidence identities mismatch/u,
  );
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].oracleEvidence[0].satisfied = false;
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /PASS has an unsatisfied oracle/u);
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
  assert.doesNotMatch(result.stdout, /"verdict": "PASS"/u);
  assert.match(result.stdout, /native harness execution id/u);
});
