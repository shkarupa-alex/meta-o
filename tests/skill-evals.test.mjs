/**
 * Prove the embedded per-skill eval corpus and fail-closed evidence workflow.
 *
 * Protects §A-EVAL-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { forbiddenPublicDataReason } from "../tools/sensitive-evidence.mjs";
import { diagnoseLegacyEvidence } from "../tools/skill-eval-legacy.mjs";
import { evaluationCoordinate } from "../tools/skill-eval-expectations.mjs";
import {
  caseDocument,
  diagnoseLegacyEvidenceForCandidate,
  evaluationDigest,
  legacyProfileDiagnostic,
  validateEvidence as validateEvidenceRaw,
} from "../tools/skill-evals.mjs";
import { loadCorpus } from "../tools/skill-eval-corpus.mjs";

const ROOT = process.cwd();
const HEAD = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();

function revision(skill) {
  return spawnSync("git", ["rev-parse", `${HEAD}:skills/${skill}`], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout.trim();
}

// One envelope is one case on one profile. `cases: "all"` builds the frozen v2
// shape, which judged a whole skill in one envelope and names no case.
function envelope(
  skill,
  { tier = "required", matrixProfile = "required-codex-sol", caseId, cases } = {},
) {
  const corpus = loadCorpus(ROOT).get(skill);
  const legacy = cases === "all";
  const selected = caseId ?? corpus.cases[0].id;
  const document = legacy ? corpus : caseDocument(corpus, selected);
  const executionId = legacy
    ? `${skill}-native-execution-1`
    : `${selected}-${matrixProfile}-native-execution-1`;
  const identity = {
    "required-claude-opus": { route: "claude", model: "opus[1m]", effort: "low" },
    "required-codex-sol": { route: "codex", model: "gpt-6-sol", effort: "low" },
    "required-codex-luna": { route: "codex", model: "gpt-6-luna", effort: "high" },
    "desired-codex": { route: "codex", model: "gpt-5.6-luna", effort: "max" },
    "desired-opencode": { route: "opencode", model: "provider/qwen3.8-27b", effort: "low" },
    "critical-orchestration": {
      route: "opencode",
      model: "llamacpp/qwen3.8-27b",
      effort: "default",
    },
  }[matrixProfile];
  assert.ok(identity, `unknown fixture matrix profile ${matrixProfile}`);
  // The required Claude coordinate is stored as the catalogue alias and runs as
  // an exact id, so the fixture has to carry both halves; every other route
  // answers with exact ids and therefore resolves nothing.
  const observed =
    identity.route === "claude" ? { ...identity, model: "claude-opus-5-5[1m]" } : { ...identity };
  const aliasResolution =
    observed.model === identity.model
      ? null
      : {
          requested: identity.model,
          effective: observed.model,
          source: `native claude run reported canonical model ${observed.model}`,
        };
  return {
    contract: "meta-o.skill-eval-evidence.v3",
    candidate: HEAD,
    skillRevision: revision(skill),
    skill,
    ...(legacy ? {} : { caseId: selected }),
    policy: document.policy,
    repetition: 1,
    tier,
    matrixProfile,
    requested: identity,
    harness: {
      name:
        tier === "critical" || identity.route === "opencode"
          ? "OpenCode"
          : identity.route === "claude"
            ? "Claude"
            : "Codex",
      version: "fixture-1",
      profileVersion: "fixture-profile-1",
      quantization: tier === "critical" ? "UD-Q4-KM" : "provider-managed",
      context: tier === "critical" ? "32768" : "fixture-context",
      sampling: "fixture-defaults",
      toolPermissions: ["read", "shell-readonly"],
    },
    execution: {
      id: executionId,
      source: identity.route,
      startedAt: "2026-09-02T10:00:00.000Z",
      completedAt: "2026-09-02T10:00:01.000Z",
      exitCode: 0,
      effective: observed,
      aliasResolution,
      identityEvidence: `native ${identity.route} result named ${observed.model}`,
      evaluationDigest: "",
    },
    results: document.cases.map((item) => ({
      caseId: item.id,
      contractIds: item.contracts,
      verdict: "PASS",
      observations: [`${item.class} behavior observed`],
      observedAction: `case_evaluation:${executionId}`,
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

function evaluatedDocument(item) {
  const corpus = loadCorpus(ROOT).get(item.skill);
  return item.caseId === undefined ? corpus : caseDocument(corpus, item.caseId);
}

function finalizedEnvelope(skill, options = {}) {
  const result = envelope(skill, options);
  result.execution.evaluationDigest = evaluationDigest(evaluatedDocument(result), result);
  return result;
}

// Every case of every skill on every listed profile: the complete matrix.
function matrix(profiles, replace = () => undefined) {
  return [...loadCorpus(ROOT).values()].flatMap(({ skill, cases }) =>
    cases.flatMap(({ id }) =>
      profiles.map(
        (matrixProfile) =>
          replace(skill, id, matrixProfile) ??
          finalizedEnvelope(skill, {
            caseId: id,
            matrixProfile,
            tier: matrixProfile.startsWith("desired-") ? "desired" : "required",
          }),
      ),
    ),
  );
}

const FULL_MATRIX = [
  "required-claude-opus",
  "required-codex-sol",
  "required-codex-luna",
  "desired-codex",
  "desired-opencode",
];

function frozenDigests(evidence) {
  return Object.fromEntries(
    (Array.isArray(evidence) ? evidence : [evidence]).map((item) => [
      evaluationCoordinate(item),
      evaluationDigest(evaluatedDocument(item), item),
    ]),
  );
}

function frozenExecutions(evidence) {
  return Object.fromEntries(
    (Array.isArray(evidence) ? evidence : [evidence]).map((item) => [
      evaluationCoordinate(item),
      structuredClone(item.execution),
    ]),
  );
}

function validateEvidence(root, evidence, candidate, requireAll = false, options = {}) {
  return validateEvidenceRaw(root, evidence, candidate, requireAll, {
    ...options,
    expectedDigests: options.expectedDigests ?? frozenDigests(evidence),
    expectedExecutions: options.expectedExecutions ?? frozenExecutions(evidence),
  });
}

test("every installable skill owns three base cases and named regressions", () => {
  const corpus = loadCorpus(ROOT);
  assert.equal(corpus.size, 11);
  assert.equal(
    [...corpus.values()].reduce((sum, document) => sum + document.cases.length, 0),
    37,
  );
  const regressions = [...corpus.values()].flatMap(({ cases }) =>
    cases.filter((item) => item.class === "regression").map(({ id }) => id),
  );
  assert.deepEqual(regressions.sort(), [
    "mo-orchestrate-orca.regression-cleanroom-after-findings",
    "mo-review-orca.regression-hot-follow-up",
    "mo-review-orca.regression-idle-composer",
    "mo-setup.regression-knowledge-layer-absence",
  ]);
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

test("a case that starts actors on one branch forbids them only on the others", () => {
  // Both forbidden cases also carry not_enabled projects whose review pair or
  // lifecycle must start; an unscoped "create workers" oracle made a faithful
  // answer fail its own case.
  const corpus = loadCorpus(ROOT);
  for (const [skill, starts] of [
    ["mo-review-orca", /start the pair for both `not_enabled` projects/u],
    ["mo-orchestrate-orca", /run the lifecycle for both `not_enabled` projects/u],
  ]) {
    const item = corpus.get(skill).cases.find(({ id }) => id === `${skill}.forbidden`);
    assert.ok(
      item.must.some((oracle) => starts.test(oracle)),
      skill,
    );
    const actors = item.mustNot.filter((oracle) =>
      /create (?:Orca workers|an executor)|materialize/u.test(oracle),
    );
    assert.ok(actors.length > 0, skill);
    for (const oracle of actors) assert.match(oracle, /`needs_attention`/u, `${skill}: ${oracle}`);
  }
});

test("complete evidence binds every case to candidate, revision and approved identity", () => {
  const evidence = matrix(FULL_MATRIX);
  const validated = validateEvidence(ROOT, evidence, HEAD, true, {
    criticalProfile: "opencode/llamacpp/qwen3.8-27b/default",
  });
  // 37 cases on five profiles, each its own native execution.
  assert.equal(validated.envelopes, 185);
  assert.deepEqual(validated.nonPass, []);
  assert.equal(validated.aggregate.length, 37);
  for (const group of validated.aggregate) {
    assert.deepEqual(
      group.coordinates.map(({ matrixProfile }) => matrixProfile),
      [
        "required-codex-sol",
        "required-codex-luna",
        "required-claude-opus",
        "desired-codex",
        "desired-opencode",
      ],
    );
  }
});

test("each case is its own execution, and one turn never covers a second case", () => {
  // One model turn that judged every case of a skill is one correlated
  // judgement: the envelope that carries it names no case and is not evidence.
  const skillLevel = finalizedEnvelope("find-reuse", { cases: "all" });
  assert.throws(() => validateEvidence(ROOT, skillLevel, HEAD), /find-reuse: caseId is empty/u);
  const bundled = finalizedEnvelope("find-reuse", { cases: "all" });
  bundled.caseId = "find-reuse.positive";
  assert.throws(() => validateEvidence(ROOT, bundled, HEAD), /incomplete result set/u);

  // The same native execution cannot be counted for two cases.
  const first = finalizedEnvelope("find-reuse", { caseId: "find-reuse.positive" });
  const second = finalizedEnvelope("find-reuse", { caseId: "find-reuse.forbidden" });
  second.execution.id = first.execution.id;
  second.results[0].observedAction = `case_evaluation:${first.execution.id}`;
  assert.throws(
    () => validateEvidence(ROOT, [first, second], HEAD),
    /find-reuse:find-reuse\.forbidden:required-codex-sol:1: execution find-reuse\.positive-required-codex-sol-native-execution-1 already evidences find-reuse:find-reuse\.positive:required-codex-sol:1/u,
  );

  // Full coverage is every case on every profile; one missing case is named.
  const withoutOne = matrix(FULL_MATRIX).filter(
    ({ caseId, matrixProfile }) =>
      !(caseId === "mo-debug.degraded" && matrixProfile === "required-claude-opus"),
  );
  assert.throws(
    () => validateEvidence(ROOT, withoutOne, HEAD, true),
    /^Error: missing case evidence: mo-debug:mo-debug\.degraded:required-claude-opus$/u,
  );
});

test("identity equality is independent of JSON object key order", () => {
  const evidence = finalizedEnvelope("find-reuse");
  const { route, model, effort } = evidence.execution.effective;
  evidence.requested = { effort, route, model };
  const harness = evidence.harness;
  evidence.harness = Object.fromEntries(Object.entries(harness).reverse());
  evidence.execution.effective = { effort, route, model };
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, []);
});

function assertSensitiveValueRejected(value) {
  const evidence = finalizedEnvelope("find-reuse");
  evidence.results[0].oracleEvidence[0].evidence = value;
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /secret-bearing evidence value/u);
}

function assertMachinePathKeyRejected(key) {
  const evidence = finalizedEnvelope("find-reuse");
  evidence.extra = { [key]: "ok" };
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /machine path is forbidden/u);
}

function assertMachinePathValueRejected(value) {
  const evidence = finalizedEnvelope("find-reuse");
  evidence.results[0].oracleEvidence[0].evidence = value;
  assert.throws(
    () => validateEvidence(ROOT, evidence, HEAD),
    /absolute machine path is forbidden/u,
  );
}

const SENSITIVE_CREDENTIALS = [
  "Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==",
  "https://alice:s3cr3t@build-host.internal/api",
  "ssh://alice:s3cr3t@build-host.example/repo",
  "postgresql://alice:s3cr3t@db.example/data",
  "access_token=abcdefghijklmnop",
  "api-token=abcdefghijklmnop",
  "AWS_SECRET_ACCESS_KEY=abcdefghijklmnop",
  "accessToken=abcdefghijklmnop",
  "refresh_token=abcdefghijklmnop",
  "auth-token=abcdefghijklmnop",
  '{"access_token":"abcdefghijklmnop"}',
  '{"api-token":"abcdefghijklmnop"}',
  '{"Authorization":"Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="}',
  '{"Proxy-Authorization":"Digest abcdefghijklmnop"}',
  '{"Authorization":"Negotiate abcdefghijklmnop"}',
  "-----BEGIN PRIVATE KEY-----",
];

const MACHINE_PATH_KEYS = [
  "/home/alex/repo",
  "/tmp/private",
  "/root/private",
  "C:\\Users\\alex\\repo",
  "c:\\users\\alex\\repo",
  "d:\\temp\\private",
  "c:/users/alex/private",
  "\\\\buildserver\\private\\repo",
  "/etc/acme/private.conf",
  "file:///home/alex/repo",
  "at file:///home/alex/app/index.mjs:14:3",
  "cwd:/home/alex/private",
  "Error:/root/secret",
  "--root=/home/alex/x",
  "cwd=/home/alex/project",
  "user@/home/alex/x",
  "https://example.com/?next=file:///home/alex/repo",
];

test("sensitive evidence classification stays bounded on separator-heavy input", () => {
  for (const [input, expected] of [
    ["a1_b2-".repeat(16_000), null],
    [`local-part@${"a.".repeat(48_000)}`, "personal_data"],
  ]) {
    const started = performance.now();
    assert.equal(forbiddenPublicDataReason(input), expected);
    assert.ok(performance.now() - started < 1_000, "96 KB classification exceeded one second");
  }
});

test("machine paths stay distinct from complete public HTTP URLs", () => {
  for (const value of [
    "docs/backlog.md",
    "https://github.com/example/project/issues/1",
    "https://example.com/docs?redirect=/api/v1",
    "https://github.com/example/project?path=/issues",
    "https://[2001:db8::1]/docs?redirect=/api/v1",
    "home-relative:.local/bin/gh",
    "node:internal/modules/esm/module_job:439:25",
    "gh version 2.96.0",
  ]) {
    assert.equal(forbiddenPublicDataReason(value), null, value);
  }
});

test("actor-modified inputs cannot replace caller-frozen prompt inputs", () => {
  for (const actorRecomputesDigest of [false, true]) {
    const provenanceDrift = finalizedEnvelope("find-reuse");
    const callerFrozen = frozenDigests(provenanceDrift);
    provenanceDrift.harness.version = "actor-rewritten-version";
    if (actorRecomputesDigest) {
      provenanceDrift.execution.evaluationDigest = evaluationDigest(
        evaluatedDocument(provenanceDrift),
        provenanceDrift,
      );
    }
    assert.throws(
      () =>
        validateEvidenceRaw(ROOT, provenanceDrift, HEAD, false, {
          expectedDigests: callerFrozen,
        }),
      /returned evaluation inputs do not match frozen digest/u,
    );
  }
});

test("actor-authored native identity cannot replace the caller-owned execution observation", () => {
  const evidence = finalizedEnvelope("find-reuse");
  const expectedDigests = frozenDigests(evidence);
  const expectedExecutions = frozenExecutions(evidence);
  evidence.execution.id = "actor-invented-execution";
  evidence.execution.identityEvidence = "actor invented a self-consistent native identity";
  for (const result of evidence.results) {
    result.observedAction = "case_evaluation:actor-invented-execution";
  }
  assert.throws(
    () =>
      validateEvidenceRaw(ROOT, evidence, HEAD, false, {
        expectedDigests,
        expectedExecutions,
      }),
    /does not match caller-owned observation/u,
  );
});

test("a resolved catalogue alias is proof, and only on the route that has aliases", () => {
  // The happy path: the owner stores `opus[1m]`, `claude-opus-5-5[1m]` actually
  // ran, and the envelope says so. This is the evidence the owner demands, and a
  // verbatim model comparison used to reject it.
  const resolved = finalizedEnvelope("find-reuse", { matrixProfile: "required-claude-opus" });
  assert.deepEqual(validateEvidence(ROOT, resolved, HEAD).nonPass, []);

  // Default closed: drop the record and the difference is the old mismatch again.
  const unrecorded = finalizedEnvelope("find-reuse", { matrixProfile: "required-claude-opus" });
  unrecorded.execution.aliasResolution = null;
  assert.throws(
    () => validateEvidence(ROOT, unrecorded, HEAD),
    /requested\/effective identity mismatch/u,
  );

  // The record may not assert a resolution of its own; it quotes the envelope.
  for (const field of ["requested", "effective"]) {
    const forged = finalizedEnvelope("find-reuse", { matrixProfile: "required-claude-opus" });
    forged.execution.aliasResolution[field] = "claude-sonnet-5-5";
    assert.throws(() => validateEvidence(ROOT, forged, HEAD), /does not quote the envelope/u);
  }

  const unsourced = finalizedEnvelope("find-reuse", { matrixProfile: "required-claude-opus" });
  unsourced.execution.aliasResolution.source = "";
  assert.throws(() => validateEvidence(ROOT, unsourced, HEAD), /aliasResolution\.source is empty/u);

  // A drifting alias is a typed event, not general unavailability: the literal
  // must be updated by a person, so the run stops instead of migrating itself.
  const drifted = finalizedEnvelope("find-reuse", { matrixProfile: "required-claude-opus" });
  drifted.execution.effective.model = "claude-opus-5-6[1m]";
  drifted.execution.aliasResolution.effective = "claude-opus-5-6[1m]";
  drifted.execution.identityEvidence =
    "native claude run reported canonical model claude-opus-5-6[1m]";
  assert.throws(() => validateEvidence(ROOT, drifted, HEAD), /alias_resolution_changed/u);

  // Codex and OpenCode answer with exact ids, so a resolution claim there is a
  // substituted model wearing a nickname.
  const codex = finalizedEnvelope("find-reuse", { matrixProfile: "required-codex-sol" });
  codex.execution.aliasResolution = {
    requested: "gpt-6-sol",
    effective: "gpt-6-sol",
    source: "invented resolution",
  };
  assert.throws(
    () => validateEvidence(ROOT, codex, HEAD),
    /alias_resolution_unsupported_route codex/u,
  );

  // Equal models leave nothing to resolve, so a record there is noise.
  const pointless = finalizedEnvelope("find-reuse", { matrixProfile: "required-claude-opus" });
  pointless.execution.effective.model = "opus[1m]";
  pointless.execution.aliasResolution.effective = "opus[1m]";
  assert.throws(() => validateEvidence(ROOT, pointless, HEAD), /present without a resolved alias/u);

  // And an unresolved alias is still not an approved identity: claiming the
  // alias itself ran leaves the exact generation unproven.
  const unresolved = finalizedEnvelope("find-reuse", { matrixProfile: "required-claude-opus" });
  unresolved.execution.effective.model = "opus[1m]";
  unresolved.execution.aliasResolution = null;
  assert.throws(() => validateEvidence(ROOT, unresolved, HEAD), /alias_resolution_changed/u);

  // Presence is the contract, not only the value. Evidence written before the
  // field was mandatory omits it outright, and reading it with `??` would take that as
  // the very "nothing resolved" a compliant run records on purpose.
  for (const matrixProfile of ["required-claude-opus", "required-codex-sol"]) {
    const omitted = finalizedEnvelope("find-reuse", { matrixProfile });
    delete omitted.execution.aliasResolution;
    assert.throws(
      () => validateEvidence(ROOT, omitted, HEAD),
      /execution\.aliasResolution is required/u,
    );
  }
});

test("evidence fails closed on identity drift, missing coverage and sensitive fields", () => {
  const drift = finalizedEnvelope("find-reuse");
  drift.execution.effective.model = "gpt-6-luna";
  assert.throws(
    () => validateEvidence(ROOT, drift, HEAD),
    /requested\/effective identity mismatch/,
  );

  const expensive = finalizedEnvelope("find-reuse");
  expensive.requested = { route: "codex", model: "gpt-6-sol", effort: "high" };
  expensive.execution.effective = { ...expensive.requested };
  expensive.execution.evaluationDigest = evaluationDigest(evaluatedDocument(expensive), expensive);
  assert.throws(() => validateEvidence(ROOT, expensive, HEAD), /testCodexSol must be/);

  const sensitive = finalizedEnvelope("find-reuse");
  sensitive.harness.apiToken = "must-not-survive";
  assert.throws(() => validateEvidence(ROOT, sensitive, HEAD), /forbidden evidence field/);

  const secretValue = finalizedEnvelope("find-reuse");
  secretValue.results[0].observations = ["Bearer abcdefghijklmnop"];
  assert.throws(() => validateEvidence(ROOT, secretValue, HEAD), /secret-bearing evidence value/u);

  for (const credential of SENSITIVE_CREDENTIALS) assertSensitiveValueRejected(credential);

  for (const path of MACHINE_PATH_KEYS) {
    assertMachinePathKeyRejected(path);
    assertMachinePathValueRejected(path);
  }

  const oversized = finalizedEnvelope("find-reuse");
  oversized.results[0].observations = ["a1_b2-".repeat(16_000)];
  assert.throws(
    () => validateEvidence(ROOT, oversized, HEAD),
    /observations\[0\] exceeds 4096 bytes/u,
  );

  const unknownOversized = finalizedEnvelope("find-reuse");
  unknownOversized.extra = `local-part@${"a.".repeat(48_000)}`;
  assert.throws(() => validateEvidence(ROOT, unknownOversized, HEAD), /portable scan bound/u);

  const wrongHarness = finalizedEnvelope("find-reuse");
  wrongHarness.harness.name = "Claude";
  assert.throws(
    () => validateEvidence(ROOT, wrongHarness, HEAD),
    /does not match the approved route/u,
  );

  const nullObservation = finalizedEnvelope("find-reuse");
  nullObservation.results[0].observations = [null];
  assert.throws(() => validateEvidence(ROOT, nullObservation, HEAD), /observations\[0\] is empty/u);

  const invalidPermission = finalizedEnvelope("find-reuse");
  invalidPermission.harness.toolPermissions = [""];
  assert.throws(
    () => validateEvidence(ROOT, invalidPermission, HEAD),
    /toolPermissions\[0\] is empty/u,
  );

  assert.throws(
    () => validateEvidence(ROOT, finalizedEnvelope("find-reuse"), HEAD, true),
    /missing case evidence/,
  );

  const requiredOnly = matrix([
    "required-claude-opus",
    "required-codex-sol",
    "required-codex-luna",
  ]);
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
    evaluatedDocument(wrongCriticalModel),
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
    evaluatedDocument(selfConsistentNonQwen),
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
      evaluatedDocument(malformedCritical),
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
    evaluatedDocument(configuredNewerQwen),
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
  impersonatedMatrix.matrixProfile = "required-codex-sol";
  impersonatedMatrix.execution.evaluationDigest = evaluationDigest(
    evaluatedDocument(impersonatedMatrix),
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
  repeated.execution.evaluationDigest = evaluationDigest(evaluatedDocument(repeated), repeated);
  assert.throws(() => validateEvidence(ROOT, repeated, HEAD), /invalid repetition/u);
});

test("the two required Codex coordinates stay distinct and replaced evidence stays legacy", () => {
  const requiredOnly = matrix([
    "required-claude-opus",
    "required-codex-sol",
    "required-codex-luna",
  ]);
  // Each required Codex coordinate is its own obligation: the pair shares a
  // route, so covering one of them must not read as covering the other.
  const withoutLuna = requiredOnly.filter(
    ({ matrixProfile }) => matrixProfile !== "required-codex-luna",
  );
  assert.throws(
    () => validateEvidence(ROOT, withoutLuna, HEAD, true),
    /find-reuse:find-reuse\.positive:required-codex-luna/u,
  );

  // A run on one Codex coordinate cannot be relabelled as the other.
  const relabelled = finalizedEnvelope("find-reuse", { matrixProfile: "required-codex-sol" });
  relabelled.matrixProfile = "required-codex-luna";
  relabelled.execution.evaluationDigest = evaluationDigest(
    evaluatedDocument(relabelled),
    relabelled,
  );
  assert.throws(() => validateEvidence(ROOT, relabelled, HEAD), /testCodexLuna must be/u);

  // v3 evidence recorded on the replaced pair is read, typed and never accepted.
  const legacy = finalizedEnvelope("find-reuse", { matrixProfile: "required-codex-sol" });
  legacy.matrixProfile = "required-codex";
  assert.deepEqual(legacyProfileDiagnostic([legacy]), {
    status: "legacy",
    accepted: false,
    profiles: ["required-codex"],
  });
  assert.throws(() => validateEvidence(ROOT, [legacy], HEAD), /^Error: legacy: diagnostic only/u);
  assert.equal(legacyProfileDiagnostic(requiredOnly), null);
});

test("blocking verdicts fail the live gate and applicability cannot be invented", () => {
  const evidence = finalizedEnvelope("find-reuse", { caseId: "find-reuse.degraded" });
  evidence.results[0].verdict = "UNKNOWN";
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, [evidence.results[0]]);

  evidence.results[0].verdict = "NOT_APPLICABLE";
  evidence.results[0].observations = ["documented applicability rule did not select this case"];
  for (const oracle of evidence.results[0].oracleEvidence) oracle.satisfied = false;
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
    aliasResolution: null,
    identityEvidence: "native executable lookup reported command unavailable",
    evaluationDigest: "",
  };
  for (const result of evidence.results) {
    result.observedAction = `availability_probe:${evidence.execution.id}`;
    result.evidenceRef = `command:${evidence.execution.id}`;
  }
  evidence.execution.evaluationDigest = evaluationDigest(evaluatedDocument(evidence), evidence);
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, []);
  // A coordinate where no model ran can neither claim an identity nor explain
  // how an alias resolved: there was nothing to resolve it for.
  evidence.execution.aliasResolution = {
    requested: evidence.requested.model,
    effective: "some-other-model",
    source: "invented",
  };
  assert.throws(
    () => validateEvidence(ROOT, evidence, HEAD),
    /must not invent an alias resolution/u,
  );
  // A coordinate where nothing ran still has to say so: an absent field is not
  // the same evidence as a recorded `null`.
  delete evidence.execution.aliasResolution;
  assert.throws(
    () => validateEvidence(ROOT, evidence, HEAD),
    /execution\.aliasResolution is required/u,
  );
  evidence.execution.aliasResolution = null;
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
    aliasResolution: null,
    identityEvidence: "native provider rejected the approved required model",
    evaluationDigest: "",
  };
  for (const result of evidence.results) {
    result.observedAction = `availability_probe:${evidence.execution.id}`;
    result.evidenceRef = `command:${evidence.execution.id}`;
  }
  evidence.execution.evaluationDigest = evaluationDigest(evaluatedDocument(evidence), evidence);
  assert.deepEqual(validateEvidence(ROOT, evidence, HEAD).nonPass, evidence.results);

  evidence.results[0].oracleEvidence[0].satisfied = true;
  assert.throws(() => validateEvidence(ROOT, evidence, HEAD), /cannot claim an observed oracle/u);
  evidence.results[0].oracleEvidence[0].satisfied = false;

  evidence.results[0].verdict = "PASS";
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
  const legacy = finalizedEnvelope("find-reuse", { cases: "all" });
  legacy.contract = "meta-o.skill-eval-evidence.v2";
  delete legacy.tier;
  delete legacy.matrixProfile;
  delete legacy.execution.availability;
  for (const result of legacy.results) {
    delete result.contractIds;
    delete result.observedAction;
    delete result.evidenceRef;
  }
  legacy.execution.evaluationDigest = evaluationDigest(evaluatedDocument(legacy), legacy);
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
  const temporary = mkdtempSync(join(tmpdir(), "mo-skill-eval-prompt-"));
  const expectations = join(temporary, "expectations.json");
  const args = [
    "tools/skill-evals.mjs",
    "--prompt",
    "find-reuse",
    "--case",
    "find-reuse.positive",
    "--expectations-out",
    expectations,
    "--candidate",
    HEAD,
    "--tier",
    "required",
    "--matrix-profile",
    "required-codex-sol",
    "--route",
    "codex",
    "--model",
    "gpt-6-sol",
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
  // Both mandatory actors once read "do not invoke the skill" as "no run is
  // possible" and answered that their own harness was unavailable. The prompt
  // now says whose execution is being recorded before it describes any
  // unavailable shape.
  assert.match(result.stdout, /documentary judgement, not a live run/u);
  // One mandatory actor wrote an owned identifier split across a space and
  // rejoined it with a string method call: not JSON at all, and the whole
  // coordinate was lost to a parse error.
  assert.match(result.stdout, /Answer with literal JSON only/u);
  // A mandatory actor once marked every oracle satisfied and still answered
  // UNKNOWN, so the rule is stated in both directions.
  assert.match(result.stdout, /that combination is a PASS and nothing else/u);
  // Quoting a documented selector shape cost a coordinate: the placeholder
  // check cannot distinguish it from a field the actor never filled.
  assert.match(result.stdout, /without angle brackets/u);
  assert.match(result.stdout, /describes this evaluation turn/u);
  assert.match(result.stdout, /never report it unavailable, blocked or not run/u);
  const framing = result.stdout.indexOf("describes this evaluation turn");
  assert.ok(framing < result.stdout.indexOf("cannot run, materialize"), "unavailable shapes lead");
  const frozen = JSON.parse(readFileSync(expectations, "utf8"));
  assert.equal(frozen.length, 1);
  assert.equal(frozen[0].coordinate, "find-reuse:find-reuse.positive:required-codex-sol:1");
  assert.match(frozen[0].evaluationDigest, /^[a-f0-9]{64}$/u);
  const repeated = spawnSync(process.execPath, [...args, "--repetition", "2"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(repeated.status, 2);
  assert.match(repeated.stderr, /--repetition must be 1/u);
  rmSync(temporary, { recursive: true, force: true });
});

test("the CLI materializes and validates a missing desired harness without a model turn", () => {
  const temporary = mkdtempSync(join(tmpdir(), "mo-skill-eval-unavailable-"));
  const expectations = join(temporary, "expectations.json");
  const evidencePath = join(temporary, "evidence.json");
  const executionObservations = join(temporary, "execution-observations.json");
  const result = spawnSync(
    process.execPath,
    [
      "tools/skill-evals.mjs",
      "--availability-probe",
      "find-reuse",
      "--case",
      "find-reuse.positive",
      "--expectations-out",
      expectations,
      "--candidate",
      HEAD,
      "--tier",
      "desired",
      "--matrix-profile",
      "desired-opencode",
      "--route",
      "opencode",
      "--model",
      "provider/qwen3.8-27b",
      "--effort",
      "low",
      "--harness",
      "OpenCode",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, PATH: "/usr/bin:/bin" },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.execution.effective, null);
  assert.equal(evidence.execution.exitCode, 127);
  assert.equal(evidence.execution.availability.reason, "command_unavailable");
  assert.equal(evidence.harness.version, null);
  assert.ok(evidence.results.every(({ verdict }) => verdict === "NOT_AVAILABLE"));
  writeFileSync(evidencePath, result.stdout);
  writeFileSync(
    executionObservations,
    `${JSON.stringify([{ coordinate: evaluationCoordinate(evidence), execution: evidence.execution }])}\n`,
  );
  const validated = spawnSync(
    process.execPath,
    [
      "tools/skill-evals.mjs",
      "--validate-evidence",
      evidencePath,
      "--expectations",
      expectations,
      "--execution-observations",
      executionObservations,
      "--candidate",
      HEAD,
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(validated.status, 0, validated.stderr);
  assert.match(validated.stdout, /1 envelopes, 0 non-PASS/u);

  const complete = matrix(FULL_MATRIX, (skill, caseId, matrixProfile) =>
    caseId === "find-reuse.positive" && matrixProfile === "desired-opencode" ? evidence : undefined,
  );
  assert.equal(validateEvidence(ROOT, complete, HEAD, true).envelopes, 185);
  rmSync(temporary, { recursive: true, force: true });
});

test("availability CLI probes the exact desired profile and emits only valid reasons", () => {
  const temporary = mkdtempSync(join(tmpdir(), "mo-skill-eval-profile-probe-"));
  const bin = join(temporary, "bin");
  mkdirSync(bin);
  const executable = join(bin, "opencode");
  const baseArgs = [
    "tools/skill-evals.mjs",
    "--availability-probe",
    "find-reuse",
    "--case",
    "find-reuse.positive",
    "--candidate",
    HEAD,
    "--tier",
    "desired",
    "--matrix-profile",
    "desired-opencode",
    "--route",
    "opencode",
    "--model",
    "provider/qwen3.8-27b",
    "--effort",
    "low",
    "--harness",
    "OpenCode",
  ];
  const runProbe = (script, name, extraEnvironment = {}) => {
    writeFileSync(executable, script);
    chmodSync(executable, 0o755);
    return spawnSync(
      process.execPath,
      [...baseArgs, "--expectations-out", join(temporary, `${name}.json`)],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          ...extraEnvironment,
          PATH: `${bin}${delimiter}/usr/bin:/bin`,
        },
      },
    );
  };

  const absent = runProbe(
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo fixture; else echo provider/other; fi\n',
    "absent",
  );
  assert.equal(absent.status, 0, absent.stderr);
  assert.equal(
    JSON.parse(absent.stdout).execution.availability.reason,
    "approved_profile_unavailable",
  );

  const failed = runProbe("#!/bin/sh\nexit 9\n", "failed");
  assert.equal(failed.status, 2);
  assert.match(failed.stderr, /could not prove exact profile availability/u);
  assert.equal(failed.stdout, "");

  const timedOut = runProbe(
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo fixture; else sleep 1; fi\n',
    "timeout",
    { MO_MODELS_CATALOG_TIMEOUT_MS: "100" },
  );
  assert.equal(timedOut.status, 2);
  assert.match(timedOut.stderr, /could not prove exact profile availability/u);
  assert.equal(timedOut.stdout, "");

  const present = runProbe(
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo fixture; else echo provider/qwen3.8-27b; fi\n',
    "present",
  );
  assert.equal(present.status, 2);
  assert.match(present.stderr, /exact profile probe succeeded/u);
  rmSync(temporary, { recursive: true, force: true });
});
