/**
 * Prove the embedded per-skill eval corpus and fail-closed evidence workflow.
 *
 * Protects §A-EVAL-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { diagnoseLegacyEvidence } from "../tools/skill-eval-runtime.mjs";
import {
  diagnoseLegacyEvidenceForCandidate,
  evaluationDigest,
  loadCorpus,
  validateEvidence,
} from "../tools/skill-evals.mjs";

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
    "critical-orchestration": {
      route: "opencode",
      model: "llamacpp/qwen3.8-27b",
      effort: "default",
    },
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
      observedAction: `case_evaluation:${skill}-native-execution-1`,
      evidenceRef: `fixture:tests/skill-evals.test.mjs#${item.id}`,
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
  const issueRouting = corpus
    .get("mo-orchestrate-orca")
    .cases.find(({ id }) => id === "mo-orchestrate-orca.degraded");
  assert.ok(issueRouting.contracts.includes("§A-ISSUE-01"));
  for (const scenario of ["ISS-12", "ISS-14", "ISS-15"]) {
    assert.ok(
      issueRouting.must.some((oracle) => oracle.includes(scenario)),
      scenario,
    );
  }
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

test("identity equality is independent of JSON object key order", () => {
  const evidence = finalizedEnvelope("find-reuse");
  const { route, model, effort } = evidence.execution.effective;
  evidence.execution.effective = { effort, route, model };
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, []);
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
    matrixProfile: "critical-orchestration",
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

  const selfConsistentNonQwen = finalizedEnvelope("mo-orchestrate-orca", {
    tier: "critical",
    matrixProfile: "critical-orchestration",
  });
  selfConsistentNonQwen.requested.model = "llamacpp/deepseek-v4";
  selfConsistentNonQwen.execution.effective.model = "llamacpp/deepseek-v4";
  selfConsistentNonQwen.execution.evaluationDigest = evaluationDigest(
    loadCorpus(ROOT).get("mo-orchestrate-orca"),
    selfConsistentNonQwen,
  );
  assert.throws(
    () =>
      validateEvidence(ROOT, selfConsistentNonQwen, HEAD, false, {
        criticalProfile: "opencode/llamacpp/deepseek-v4/default",
      }),
    /Qwen model/u,
  );

  for (const malformedQwen of ["qwen-", "qwen.", "qwen_"]) {
    const malformedCritical = finalizedEnvelope("mo-orchestrate-orca", {
      tier: "critical",
      matrixProfile: "critical-orchestration",
    });
    malformedCritical.requested.model = `llamacpp/${malformedQwen}`;
    malformedCritical.execution.effective.model = `llamacpp/${malformedQwen}`;
    malformedCritical.execution.evaluationDigest = evaluationDigest(
      loadCorpus(ROOT).get("mo-orchestrate-orca"),
      malformedCritical,
    );
    assert.throws(
      () =>
        validateEvidence(ROOT, malformedCritical, HEAD, false, {
          criticalProfile: `opencode/llamacpp/${malformedQwen}/default`,
        }),
      /Qwen model/u,
    );
  }

  const configuredNewerQwen = finalizedEnvelope("mo-orchestrate-orca", {
    tier: "critical",
    matrixProfile: "critical-orchestration",
  });
  configuredNewerQwen.requested.model = "llamacpp/qwen3.9-27b";
  configuredNewerQwen.execution.effective.model = "llamacpp/qwen3.9-27b";
  configuredNewerQwen.execution.evaluationDigest = evaluationDigest(
    loadCorpus(ROOT).get("mo-orchestrate-orca"),
    configuredNewerQwen,
  );
  assert.deepEqual(
    validateEvidence(ROOT, configuredNewerQwen, HEAD, false, {
      criticalProfile: "opencode/llamacpp/qwen3.9-27b/default",
    }).nonPass,
    [],
  );

  const impersonatedMatrix = finalizedEnvelope("mo-orchestrate-orca", {
    tier: "critical",
    matrixProfile: "critical-orchestration",
  });
  impersonatedMatrix.matrixProfile = "required-codex";
  impersonatedMatrix.execution.evaluationDigest = evaluationDigest(
    loadCorpus(ROOT).get("mo-orchestrate-orca"),
    impersonatedMatrix,
  );
  assert.throws(
    () =>
      validateEvidence(ROOT, impersonatedMatrix, HEAD, false, {
        criticalProfile: "opencode/llamacpp/qwen3.8-27b/default",
      }),
    /critical evidence is not the orchestration B22 coordinate/u,
  );

  const repeated = finalizedEnvelope("find-reuse");
  repeated.repetition = 2;
  repeated.execution.evaluationDigest = evaluationDigest(
    loadCorpus(ROOT).get("find-reuse"),
    repeated,
  );
  assert.throws(() => validateEvidence(ROOT, repeated, HEAD), /invalid repetition/u);
});

test("blocking verdicts fail the live gate and applicability cannot be invented", () => {
  const evidence = finalizedEnvelope("find-reuse");
  evidence.results[2].verdict = "UNKNOWN";
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, [evidence.results[2]]);

  evidence.results[2].verdict = "NOT_APPLICABLE";
  evidence.results[2].observations = ["documented applicability rule did not select this case"];
  for (const oracle of evidence.results[2].oracleEvidence) oracle.satisfied = false;
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /corpus applicability rule/u);
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
  for (const result of evidence.results) {
    result.observedAction = `availability_probe:${evidence.execution.id}`;
    result.evidenceRef = `command:${evidence.execution.id}`;
  }
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

test("required profile unavailability stays blocking without invented runtime identity", () => {
  const evidence = finalizedEnvelope("find-reuse");
  for (const [index, result] of evidence.results.entries()) {
    result.verdict = index === 0 ? "BLOCKED" : "NOT_RUN";
    result.observations = ["approved required harness was unavailable"];
    for (const oracle of result.oracleEvidence) {
      oracle.satisfied = false;
      oracle.evidence = "not evaluated because the required harness was unavailable";
    }
  }
  evidence.harness = {
    name: "Codex",
    version: null,
    profileVersion: null,
    quantization: null,
    context: null,
    sampling: null,
    toolPermissions: [],
  };
  evidence.execution = {
    id: "codex-required-availability-probe-1",
    source: "codex",
    startedAt: "2026-09-02T10:00:00.000Z",
    completedAt: "2026-09-02T10:00:00.100Z",
    exitCode: 127,
    effective: null,
    availability: { status: "not_available", reason: "approved_profile_unavailable" },
    identityEvidence: "native provider rejected the approved required model",
    evaluationDigest: "",
  };
  for (const result of evidence.results) {
    result.observedAction = `availability_probe:${evidence.execution.id}`;
    result.evidenceRef = `command:${evidence.execution.id}`;
  }
  evidence.execution.evaluationDigest = evaluationDigest(
    loadCorpus(ROOT).get("find-reuse"),
    evidence,
  );
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, evidence.results);

  evidence.results[0].oracleEvidence[0].satisfied = true;
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /cannot claim an observed oracle/u);
  evidence.results[0].oracleEvidence[0].satisfied = false;

  evidence.results[1].verdict = "PASS";
  assert.throws(
    () => validateEvidence(ROOT, evidence, HEAD),
    /unavailable required envelope must stay BLOCKED or NOT_RUN/u,
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
  delete evidence.results[0].observedAction;
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /observed action is empty/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  delete evidence.results[0].evidenceRef;
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /evidence reference is empty/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].evidenceRef = "plausible prose only";
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /bounded public locator/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].observedAction = "<case_evaluation:exact native harness execution id>";
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /unresolved placeholder/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].observedAction = "case_evaluation:another-execution";
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /bound to the envelope execution/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].evidenceRef = "file:/etc/passwd";
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /repository-relative/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].evidenceRef = "file:../../../etc/shadow";
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /repository-relative/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].evidenceRef = "commands";
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /bounded public locator/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].evidenceRef = "files";
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /bounded public locator/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].evidenceRef = "file:tests/report.txt#ok#../../etc/passwd";
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /multiple fragments/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].evidenceRef = "fixture:tests/eval.json#ok# bad-tail";
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /multiple fragments/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].evidenceRef = `command:${"x".repeat(1100)}`;
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /exceeds 1024 bytes/u);
  evidence.results[0] = finalizedEnvelope("find-reuse").results[0];
  evidence.results[0].oracleEvidence[0].satisfied = false;
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /PASS has an unsatisfied oracle/u);
});

test("evidence v2 is readable only as an explicit legacy diagnostic", () => {
  const legacy = finalizedEnvelope("find-reuse");
  legacy.contract = "meta-o.skill-eval-evidence.v2";
  delete legacy.tier;
  delete legacy.matrixProfile;
  delete legacy.execution.availability;
  for (const result of legacy.results) {
    delete result.contractIds;
    delete result.observedAction;
    delete result.evidenceRef;
  }
  legacy.execution.evaluationDigest = evaluationDigest(loadCorpus(ROOT).get("find-reuse"), legacy);
  assert.deepEqual(diagnoseLegacyEvidence(legacy), {
    status: "legacy_v2",
    envelopes: 1,
    accepted: false,
  });
  assert.throws(
    () => validateEvidence(ROOT, legacy, HEAD),
    /legacy_v2: diagnostic only; invalid historical evidence:.*wrong legacy cases contract/u,
  );
  delete legacy.results[0].observations;
  assert.throws(() => diagnoseLegacyEvidence(legacy), /legacy observations missing/u);

  const invalidPolicy = structuredClone(legacy);
  invalidPolicy.results[0].observations = ["restored observation"];
  invalidPolicy.policy = "not-a-policy";
  assert.throws(() => diagnoseLegacyEvidence(invalidPolicy), /invalid policy/u);

  const invalidVerdict = structuredClone(invalidPolicy);
  invalidVerdict.policy = "advisory";
  invalidVerdict.results[0].verdict = "TOTALLY_INVALID";
  assert.throws(() => diagnoseLegacyEvidence(invalidVerdict), /invalid legacy verdict/u);

  const duplicateCase = structuredClone(invalidVerdict);
  duplicateCase.results[0].verdict = "PASS";
  duplicateCase.results[1].caseId = duplicateCase.results[0].caseId;
  assert.throws(() => diagnoseLegacyEvidence(duplicateCase), /duplicate case id/u);

  const historicalCandidate = spawnSync("git", ["rev-parse", "034925f^"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout.trim();
  const historicalDocument = JSON.parse(
    spawnSync("git", ["show", `${historicalCandidate}:src/skills/find-reuse/evals/cases.json`], {
      cwd: ROOT,
      encoding: "utf8",
    }).stdout,
  );
  const historical = structuredClone(legacy);
  historical.candidate = historicalCandidate;
  historical.skillRevision = spawnSync(
    "git",
    ["rev-parse", `${historicalCandidate}:skills/find-reuse`],
    { cwd: ROOT, encoding: "utf8" },
  ).stdout.trim();
  historical.results = historicalDocument.cases.map((item) => ({
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
  }));
  historical.execution.evaluationDigest = evaluationDigest(historicalDocument, historical);
  assert.deepEqual(diagnoseLegacyEvidenceForCandidate(ROOT, historical, historicalCandidate), {
    status: "legacy_v2",
    envelopes: 1,
    accepted: false,
  });
  assert.throws(
    () => validateEvidence(ROOT, historical, historicalCandidate),
    /legacy_v2: diagnostic only; the live gate requires evidence v3/u,
  );
  const wrongRevision = structuredClone(historical);
  wrongRevision.skillRevision = "0".repeat(40);
  assert.throws(
    () => diagnoseLegacyEvidenceForCandidate(ROOT, wrongRevision, historicalCandidate),
    /skill revision mismatch/u,
  );
  const unknownSkill = structuredClone(historical);
  unknownSkill.skill = "../../../etc/passwd";
  assert.throws(
    () => diagnoseLegacyEvidenceForCandidate(ROOT, unknownSkill, historicalCandidate),
    (error) => /legacy_v2: unknown skill/u.test(error.message) && !/git show/u.test(error.message),
  );
});

test("the CLI exposes a bounded prompt without launching a model", () => {
  const args = [
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
  ];
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /find-reuse\.positive/);
  assert.match(result.stdout, /INSTALLABLE INSTRUCTIONS/);
  assert.doesNotMatch(result.stdout, /\/home\/|\/mnt\//);
  assert.doesNotMatch(result.stdout, /"verdict": "PASS"/u);
  assert.match(result.stdout, /native harness execution id/u);
  assert.match(result.stdout, /BLOCKED\|NOT_RUN\|NOT_AVAILABLE/u);
  const repeated = spawnSync(process.execPath, [...args, "--repetition", "2"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(repeated.status, 2);
  assert.match(repeated.stderr, /--repetition must be 1/u);
});
