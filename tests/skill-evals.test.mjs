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

function envelope(skill, { tier = "required", matrixProfile = "required-codex" } = {}) {
  const document = loadCorpus(ROOT).get(skill);
  const identity = {
    "required-claude": { route: "claude", model: "opus[1m]", effort: "low" },
    "required-codex": { route: "codex", model: "gpt-5.6-sol", effort: "low" },
    "desired-codex": { route: "codex", model: "gpt-5.6-luna", effort: "max" },
    "desired-opencode": { route: "opencode", model: "provider/qwen3.8-27b", effort: "low" },
    critical: { route: "opencode", model: "llamacpp/qwen3.8-27b", effort: "default" },
  }[matrixProfile];
  assert.ok(identity, `unknown fixture matrix profile ${matrixProfile}`);
  return {
    contract: "meta-o.skill-eval-evidence.v3",
    candidate: HEAD,
    skillRevision: revision(skill),
    skill,
    policy: document.policy,
    repetition: 1,
    tier,
    matrixProfile,
    requested: identity,
    harness: {
      name: tier === "critical" ? "OpenCode" : identity.route === "claude" ? "Claude" : "Codex",
      version: "fixture-1",
      profileVersion: "fixture-profile-1",
      quantization: tier === "critical" ? "UD-Q4-KM" : "provider-managed",
      context: tier === "critical" ? "32768" : "fixture-context",
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
      contractIds: item.contracts,
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

function finalizedEnvelope(skill, options = {}) {
  const result = envelope(skill, options);
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
  const evidence = [...corpus.values()].flatMap(({ skill }) =>
    ["required-claude", "required-codex", "desired-codex", "desired-opencode"].map(
      (matrixProfile) =>
        finalizedEnvelope(skill, {
          matrixProfile,
          tier: matrixProfile.startsWith("desired-") ? "desired" : "required",
        }),
    ),
  );
  assert.deepEqual(
    validateEvidence(ROOT, evidence, HEAD, true, {
      criticalProfile: "opencode/llamacpp/qwen3.8-27b/default",
    }),
    {
      envelopes: 32,
      nonPass: [],
    },
  );
});

test("evidence fails closed on identity drift, missing coverage and sensitive fields", () => {
  const drift = finalizedEnvelope("find-reuse");
  drift.execution.effective.model = "gpt-5.6-luna";
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

  const requiredOnly = [...loadCorpus(ROOT).values()].flatMap(({ skill }) =>
    ["required-claude", "required-codex"].map((matrixProfile) =>
      finalizedEnvelope(skill, { matrixProfile }),
    ),
  );
  assert.throws(
    () => validateEvidence(ROOT, requiredOnly, HEAD, true),
    /desired-codex.*desired-opencode/u,
  );

  const wrongCriticalModel = finalizedEnvelope("mo-orchestrate-orca", {
    tier: "critical",
    matrixProfile: "critical",
  });
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

test("desired profile can materialize as evidenced NOT_AVAILABLE", () => {
  const evidence = finalizedEnvelope("find-reuse", {
    tier: "desired",
    matrixProfile: "desired-opencode",
  });
  for (const result of evidence.results) {
    result.verdict = "NOT_AVAILABLE";
    result.observations = ["approved desired harness was unavailable"];
    for (const oracle of result.oracleEvidence) {
      oracle.satisfied = false;
      oracle.evidence = "not evaluated because the approved desired harness was unavailable";
    }
  }
  evidence.harness = {
    name: "OpenCode",
    version: null,
    profileVersion: null,
    quantization: null,
    context: null,
    sampling: null,
    toolPermissions: [],
  };
  evidence.execution = {
    id: "opencode-availability-probe-1",
    source: "opencode",
    startedAt: "2026-09-02T10:00:00.000Z",
    completedAt: "2026-09-02T10:00:00.100Z",
    exitCode: 127,
    effective: null,
    availability: { status: "not_available", reason: "command_unavailable" },
    identityEvidence: "native executable lookup reported command unavailable",
    evaluationDigest: "",
  };
  evidence.execution.evaluationDigest = evaluationDigest(
    loadCorpus(ROOT).get("find-reuse"),
    evidence,
  );
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, []);
  evidence.execution.effective = { ...evidence.requested };
  assert.throws(
    () => validateEvidence(ROOT, evidence, HEAD),
    /must not invent effective identity/u,
  );
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
      "--tier",
      "required",
      "--matrix-profile",
      "required-codex",
      "--route",
      "codex",
      "--model",
      "gpt-5.6-sol",
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
  assert.match(result.stdout, /BLOCKED\|NOT_RUN\|NOT_AVAILABLE/u);
});
