#!/usr/bin/env node
/**
 * Validate the embedded skill eval corpus and portable live evidence envelopes.
 *
 * The runner never starts a model or writes evidence. It produces one bounded
 * prompt for an explicitly selected harness and validates the returned JSON in
 * an external, untracked location.
 *
 * A schema validator cannot enforce disk inventory, Git reachability, corpus
 * identity and the approved-profile function; adding one would duplicate this
 * executable contract without replacing it.
 *
 * Implements §A-EVAL-01.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { buildUnavailableEvidence } from "./skill-eval-availability.mjs";
import { buildEvaluationPrompt } from "./skill-eval-prompt.mjs";

import {
  assertBoundedString,
  diagnoseLegacyEvidenceAtCandidate,
  rejectSensitiveOrMachineLocal,
  validateActorIdentity,
  validateExecution,
  validateHarness,
  validateResultProvenance,
} from "./skill-eval-runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = "meta-o.skill-eval-cases.v2";
const EVIDENCE_CONTRACT = "meta-o.skill-eval-evidence.v3";
const EXPECTED_SKILLS = [
  "find-reuse",
  "mo-e2e",
  "mo-orchestrate-orca",
  "mo-review-orca",
  "mo-setup",
  "mo-watchdog",
  "senior-jsts",
  "senior-python",
];
const EXPECTED_CLASSES = ["degraded", "forbidden", "positive"];
const VERDICTS = new Set([
  "PASS",
  "FAIL",
  "UNKNOWN",
  "BLOCKED",
  "NOT_RUN",
  "NOT_AVAILABLE",
  "NOT_APPLICABLE",
]);
const REQUIRED_MATRIX = [
  { matrixProfile: "required-claude", route: "claude", role: "testClaude" },
  { matrixProfile: "required-codex", route: "codex", role: "testCodex" },
];
const DESIRED_MATRIX = [
  { matrixProfile: "desired-codex", route: "codex", role: "testCodexDesired" },
  { matrixProfile: "desired-opencode", route: "opencode", role: "testOpenCodeDesired" },
];
const EXPECTED_MATRIX = [...REQUIRED_MATRIX, ...DESIRED_MATRIX];
const MATRIX_BY_PROFILE = new Map(
  EXPECTED_MATRIX.map((profile) => [profile.matrixProfile, profile]),
);
const CRITICAL_MATRIX_PROFILE = "critical-orchestration";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is empty`);
}

function validateCase(item, expectedSkill) {
  assertString(item.id, `${expectedSkill}: case id`);
  if (item.id !== `${expectedSkill}.${item.class}`) {
    throw new Error(`${expectedSkill}: case ${item.id} does not match its class`);
  }
  assertString(item.scenario, `${item.id}: scenario`);
  if (!Array.isArray(item.contracts) || item.contracts.length === 0) {
    throw new Error(`${item.id}: contracts needs at least one architecture/business id`);
  }
  for (const contract of item.contracts) {
    if (!/^§[AB]-[A-Z][A-Z0-9-]*-\d{2}$/u.test(contract)) {
      throw new Error(`${item.id}: invalid contract id ${contract}`);
    }
  }
  for (const field of ["must", "mustNot"]) {
    if (!Array.isArray(item[field]) || item[field].length === 0) {
      throw new Error(`${item.id}: ${field} needs at least one oracle`);
    }
    item[field].forEach((entry, index) => assertString(entry, `${item.id}: ${field}[${index}]`));
  }
}

function validateCaseSet(document, expectedSkill) {
  if (!Array.isArray(document.cases) || document.cases.length !== 3) {
    throw new Error(`${expectedSkill}: exactly three bounded cases are required`);
  }
  document.cases.forEach((item) => validateCase(item, expectedSkill));
  const ids = document.cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error(`${expectedSkill}: duplicate case id`);
  const classes = document.cases.map(({ class: value }) => value).sort();
  if (JSON.stringify(classes) !== JSON.stringify(EXPECTED_CLASSES)) {
    throw new Error(`${expectedSkill}: needs positive, forbidden and degraded cases`);
  }
}

function validateEvalPolicy(document, expectedSkill) {
  if (!new Set(["advisory", "critical"]).has(document.policy)) {
    throw new Error(`${expectedSkill}: invalid ownership policy`);
  }
}

function validateCaseFile(document, expectedSkill) {
  if (document.contract !== CONTRACT) throw new Error(`${expectedSkill}: wrong cases contract`);
  if (document.skill !== expectedSkill)
    throw new Error(`${expectedSkill}: skill identity mismatch`);
  assertString(document.owner, `${expectedSkill}: owner`);
  if (!new Set(["advisory", "critical"]).has(document.policy)) {
    throw new Error(`${expectedSkill}: invalid policy`);
  }
  validateCaseSet(document, expectedSkill);
  validateEvalPolicy(document, expectedSkill);
  return document;
}

/** §A-EVAL-01 loads the complete embedded corpus and rejects missing skill owners or cases. */
export function loadCorpus(root = ROOT) {
  const sourceRoot = join(root, "src", "skills");
  const discovered = readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(discovered) !== JSON.stringify(EXPECTED_SKILLS)) {
    throw new Error(`skill inventory mismatch: ${discovered.join(", ")}`);
  }
  return new Map(
    EXPECTED_SKILLS.map((skill) => {
      const path = join(sourceRoot, skill, "evals", "cases.json");
      return [skill, validateCaseFile(JSON.parse(readFileSync(path, "utf8")), skill)];
    }),
  );
}

/** §A-EVAL-01 binds a result to the exact candidate, corpus, requested actor and harness inputs. */
export function evaluationDigest(document, envelope) {
  const payload = {
    candidate: envelope.candidate,
    skillRevision: envelope.skillRevision,
    skill: envelope.skill,
    policy: envelope.policy,
    repetition: envelope.repetition,
    tier: envelope.tier,
    matrixProfile: envelope.matrixProfile,
    requested: envelope.requested,
    harness: envelope.harness,
    cases: document.cases,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/** §A-EVAL-01 gives caller-frozen prompt inputs one stable lookup coordinate. */
export function evaluationCoordinate(envelope) {
  return `${envelope.skill}:${envelope.matrixProfile}:${envelope.repetition}`;
}

function expectedDigest(expectedDigests, envelope) {
  const coordinate = evaluationCoordinate(envelope);
  const digest =
    expectedDigests instanceof Map
      ? expectedDigests.get(coordinate)
      : expectedDigests?.[coordinate];
  if (!/^[a-f0-9]{64}$/u.test(digest ?? "")) {
    throw new Error(`${coordinate}: caller-frozen evaluation digest is missing`);
  }
  return digest;
}

function makePrompt(root, corpus, skill, values) {
  const candidate = values.candidate;
  if (!/^[a-f0-9]{40}$/u.test(candidate ?? "")) throw new Error("--candidate must be a full SHA");
  if (git(root, ["rev-parse", "HEAD"]) !== candidate)
    throw new Error("candidate is not current HEAD");
  const document = corpus.get(skill);
  if (!document) throw new Error(`unknown skill ${skill}`);
  const skillRevision = git(root, ["rev-parse", `${candidate}:skills/${skill}`]);
  return buildEvaluationPrompt({
    root,
    contract: EVIDENCE_CONTRACT,
    candidate,
    skillRevision,
    skill,
    document,
    values,
    digest: evaluationDigest,
  });
}

function expectationRecord(envelope) {
  return {
    coordinate: evaluationCoordinate(envelope),
    evaluationDigest: envelope.execution.evaluationDigest,
  };
}

function writeExpectation(path, envelope) {
  if (!path) throw new Error("--expectations-out is required to freeze prompt inputs");
  writeFileSync(resolve(path), `${JSON.stringify([expectationRecord(envelope)], null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
}

async function makeUnavailableEvidence(root, corpus, skill, values) {
  const candidate = values.candidate;
  if (!/^[a-f0-9]{40}$/u.test(candidate ?? "")) throw new Error("--candidate must be a full SHA");
  if (git(root, ["rev-parse", "HEAD"]) !== candidate)
    throw new Error("candidate is not current HEAD");
  const document = corpus.get(skill);
  if (!document) throw new Error(`unknown skill ${skill}`);
  const envelope = await buildUnavailableEvidence({
    candidate,
    skill,
    skillRevision: git(root, ["rev-parse", `${candidate}:skills/${skill}`]),
    document,
    values,
    digest: evaluationDigest,
  });
  validateMatrixCoordinate(envelope);
  return envelope;
}

function oracleKeys(item) {
  return [
    ...item.must.map((oracle) => `must\0${oracle}`),
    ...item.mustNot.map((oracle) => `mustNot\0${oracle}`),
  ].sort();
}

function validateUnobservedVerdict(result, item, unavailable) {
  if (!new Set(["NOT_AVAILABLE", "NOT_APPLICABLE"]).has(result.verdict) && !unavailable) return;
  if (result.oracleEvidence.some(({ satisfied }) => satisfied)) {
    throw new Error(`${result.caseId}: ${result.verdict} cannot claim an observed oracle`);
  }
  if (result.verdict !== "NOT_APPLICABLE") return;
  assertString(item.notApplicableWhen, `${result.caseId}: corpus applicability rule`);
  if (!result.observations.some((observation) => observation.includes(item.notApplicableWhen))) {
    throw new Error(`${result.caseId}: NOT_APPLICABLE must cite its corpus rule`);
  }
}

function validateResult(result, item, unavailable, executionId) {
  if (!VERDICTS.has(result.verdict)) throw new Error(`${result.caseId}: invalid verdict`);
  if (!Array.isArray(result.observations))
    throw new Error(`${result.caseId}: observations missing`);
  if (result.observations.length === 0)
    throw new Error(`${result.caseId}: verdict needs an observation`);
  result.observations.forEach((observation, index) =>
    assertBoundedString(observation, `${result.caseId}: observations[${index}]`, 4096),
  );
  validateResultProvenance(result, unavailable, executionId);
  if (JSON.stringify(result.contractIds) !== JSON.stringify(item.contracts))
    throw new Error(`${result.caseId}: contract identities mismatch`);
  if (!Array.isArray(result.oracleEvidence))
    throw new Error(`${result.caseId}: oracle evidence missing`);
  const actual = result.oracleEvidence.map(({ kind, oracle }) => `${kind}\0${oracle}`).sort();
  if (JSON.stringify(actual) !== JSON.stringify(oracleKeys(item)))
    throw new Error(`${result.caseId}: oracle evidence identities mismatch`);
  for (const oracle of result.oracleEvidence) {
    assertBoundedString(oracle.evidence, `${result.caseId}: oracle evidence`, 4096, {
      allowAngles: true,
    });
    if (typeof oracle.satisfied !== "boolean")
      throw new Error(`${result.caseId}: oracle satisfaction must be boolean`);
  }
  if (result.verdict === "PASS" && result.oracleEvidence.some(({ satisfied }) => !satisfied))
    throw new Error(`${result.caseId}: PASS has an unsatisfied oracle`);
  validateUnobservedVerdict(result, item, unavailable);
}

function validateResults(envelope, document, unavailable) {
  if (!Array.isArray(envelope.results) || envelope.results.length !== document.cases.length)
    throw new Error(`${envelope.skill}: incomplete result set`);
  const expected = document.cases.map(({ id }) => id).sort();
  const actual = envelope.results.map(({ caseId }) => caseId).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${envelope.skill}: result case identities mismatch`);
  for (const result of envelope.results) {
    validateResult(
      result,
      document.cases.find(({ id }) => id === result.caseId),
      unavailable,
      envelope.execution.id,
    );
  }
}

/** §A-EVAL-01 diagnoses a frozen v2 envelope against its own historical candidate. */
export function diagnoseLegacyEvidenceForCandidate(root, evidence, candidate) {
  if (!/^[a-f0-9]{40}$/u.test(candidate ?? "")) throw new Error("candidate must be a full SHA");
  return diagnoseLegacyEvidenceAtCandidate(evidence, candidate, {
    // This allowlist is the trust barrier: reject envelope-controlled skill
    // bytes before they can enter the Git pathspec assembled below.
    readDocument: (skill) =>
      EXPECTED_SKILLS.includes(skill)
        ? JSON.parse(git(root, ["show", `${candidate}:src/skills/${skill}/evals/cases.json`]))
        : null,
    readRevision: (skill) => git(root, ["rev-parse", `${candidate}:skills/${skill}`]),
    digest: evaluationDigest,
  });
}

function validateMatrixCoordinate(envelope) {
  const matrix = MATRIX_BY_PROFILE.get(envelope.matrixProfile);
  if (envelope.tier === "critical") {
    if (
      envelope.skill !== "mo-orchestrate-orca" ||
      envelope.matrixProfile !== CRITICAL_MATRIX_PROFILE
    ) {
      throw new Error(
        `${envelope.skill}: critical evidence is not the orchestration B22 coordinate`,
      );
    }
    return;
  }
  const expectedTier = envelope.matrixProfile.startsWith("desired-") ? "desired" : "required";
  if (!matrix || envelope.tier !== expectedTier) {
    throw new Error(`${envelope.skill}: tier does not match matrix profile`);
  }
}

function envelopeIsUnavailable(envelope) {
  const results = envelope.results ?? [];
  const declaredUnavailable = envelope.execution?.availability?.status === "not_available";
  const hasNotAvailable = results.some(({ verdict }) => verdict === "NOT_AVAILABLE");
  if (!declaredUnavailable) {
    if (hasNotAvailable) {
      throw new Error(`${envelope.skill}: NOT_AVAILABLE needs unavailable execution evidence`);
    }
    return false;
  }
  if (envelope.tier === "desired") {
    if (!results.length || results.some(({ verdict }) => verdict !== "NOT_AVAILABLE")) {
      throw new Error(`${envelope.skill}: NOT_AVAILABLE must cover the whole desired envelope`);
    }
    return true;
  }
  if (envelope.tier === "required") {
    if (
      !results.length ||
      results.some(({ verdict }) => !new Set(["BLOCKED", "NOT_RUN"]).has(verdict))
    ) {
      throw new Error(
        `${envelope.skill}: unavailable required envelope must stay BLOCKED or NOT_RUN`,
      );
    }
    return true;
  }
  throw new Error(`${envelope.skill}: critical evidence cannot claim unavailable execution`);
}

function validateEnvelope(root, corpus, envelope, candidate, criticalProfile, expectedDigests) {
  if (envelope.contract !== EVIDENCE_CONTRACT) throw new Error("wrong evidence contract");
  if (envelope.candidate !== candidate) throw new Error(`${envelope.skill}: candidate mismatch`);
  const document = corpus.get(envelope.skill);
  if (!document) throw new Error(`unknown evidence skill ${envelope.skill}`);
  if (envelope.policy !== document.policy) throw new Error(`${envelope.skill}: policy mismatch`);
  if (!new Set(["required", "desired", "critical"]).has(envelope.tier)) {
    throw new Error(`${envelope.skill}: invalid tier`);
  }
  assertString(envelope.matrixProfile, `${envelope.skill}: matrixProfile`);
  validateMatrixCoordinate(envelope);
  const revision = git(root, ["rev-parse", `${candidate}:skills/${envelope.skill}`]);
  if (envelope.skillRevision !== revision) throw new Error(`${envelope.skill}: revision mismatch`);
  if (envelope.repetition !== 1) {
    throw new Error(`${envelope.skill}: invalid repetition`);
  }
  const unavailable = envelopeIsUnavailable(envelope);
  // Apply every declared author-controlled field bound before the shared
  // classifier scans the envelope (§A-EVAL-01).
  validateResults(envelope, document, unavailable);
  validateActorIdentity(envelope, criticalProfile, unavailable);
  validateHarness(envelope, unavailable);
  rejectSensitiveOrMachineLocal(envelope, envelope.skill);
  const frozenDigest = expectedDigest(expectedDigests, envelope);
  if (evaluationDigest(document, envelope) !== frozenDigest) {
    throw new Error(`${envelope.skill}: returned evaluation inputs do not match frozen digest`);
  }
  validateExecution(envelope, unavailable, frozenDigest);
  return envelope.results.filter(({ verdict }) =>
    new Set(["FAIL", "UNKNOWN", "BLOCKED", "NOT_RUN"]).has(verdict),
  );
}

/** §A-EVAL-01 verifies exact identity, completeness and redaction of live eval evidence. */
export function validateEvidence(root, evidence, candidate, requireAll = false, options = {}) {
  if (!/^[a-f0-9]{40}$/u.test(candidate ?? "")) throw new Error("candidate must be a full SHA");
  const declaredLegacy = (Array.isArray(evidence) ? evidence : [evidence]).some(
    (envelope) => envelope?.contract === "meta-o.skill-eval-evidence.v2",
  );
  if (declaredLegacy) {
    try {
      diagnoseLegacyEvidenceForCandidate(root, evidence, candidate);
    } catch (error) {
      throw new Error(`legacy_v2: diagnostic only; invalid historical evidence: ${error.message}`, {
        cause: error,
      });
    }
    throw new Error("legacy_v2: diagnostic only; the live gate requires evidence v3");
  }
  if (git(root, ["rev-parse", "HEAD"]) !== candidate)
    throw new Error("candidate is not current HEAD");
  const corpus = loadCorpus(root);
  const envelopes = Array.isArray(evidence) ? evidence : [evidence];
  const seen = new Set();
  const nonPass = [];
  for (const envelope of envelopes) {
    const key = `${envelope.skill}:${envelope.matrixProfile}:${envelope.repetition}`;
    if (seen.has(key)) throw new Error(`duplicate evidence ${key}`);
    seen.add(key);
    nonPass.push(
      ...validateEnvelope(
        root,
        corpus,
        envelope,
        candidate,
        options.criticalProfile,
        options.expectedDigests,
      ),
    );
  }
  if (requireAll) {
    const covered = new Set(
      envelopes.map(({ skill, matrixProfile }) => `${skill}:${matrixProfile}`),
    );
    const missing = EXPECTED_SKILLS.flatMap((skill) =>
      EXPECTED_MATRIX.map(({ matrixProfile }) => `${skill}:${matrixProfile}`),
    ).filter((coordinate) => !covered.has(coordinate));
    if (missing.length > 0) throw new Error(`missing skill evidence: ${missing.join(", ")}`);
  }
  return { envelopes: envelopes.length, nonPass };
}

function usage() {
  return `usage:
  node tools/skill-evals.mjs --check
  node tools/skill-evals.mjs --prompt <skill> --expectations-out <json> --candidate <sha> --tier <required|desired|critical> --matrix-profile <name> --route <route> --model <id> --effort <level> --harness <name> --harness-version <version> --profile-version <version> --quantization <value> --context <value> --sampling <value> --tool-permissions <csv> [--repetition 1]
  node tools/skill-evals.mjs --availability-probe <skill> --expectations-out <json> --candidate <sha> --tier desired --matrix-profile <name> --route <route> --model <id> --effort <level> --harness <name> [--repetition 1]
  node tools/skill-evals.mjs --validate-evidence <json> --expectations <json> --candidate <sha> [--require-all] [--critical-profile <route/model/effort>]\n`;
}

async function main() {
  // prettier-ignore
  const stringOptions = ["prompt", "availability-probe", "candidate", "route", "model", "effort", "harness", "harness-version", "profile-version", "quantization", "context", "sampling", "tool-permissions", "repetition", "tier", "matrix-profile", "validate-evidence", "expectations", "expectations-out", "critical-profile"];
  const booleanOptions = ["check", "require-all"];
  const options = Object.fromEntries(stringOptions.map((name) => [name, { type: "string" }]));
  for (const name of booleanOptions) options[name] = { type: "boolean" };
  options.help = { type: "boolean", short: "h" };
  const { values } = parseArgs({
    options,
    strict: true,
  });
  if (values.help) {
    process.stdout.write(usage());
    return;
  }
  // prettier-ignore
  const normalized = { ...values, harnessVersion: values["harness-version"], profileVersion: values["profile-version"], toolPermissions: values["tool-permissions"], matrixProfile: values["matrix-profile"] };
  const corpus = loadCorpus(ROOT);
  if (values.check) {
    const count = [...corpus.values()].reduce((sum, document) => sum + document.cases.length, 0);
    process.stdout.write(`skill eval corpus ok: ${corpus.size} skills, ${count} cases\n`);
    return;
  }
  if (values.prompt) {
    const { prompt, envelope } = makePrompt(ROOT, corpus, values.prompt, normalized);
    writeExpectation(values["expectations-out"], envelope);
    process.stdout.write(`${prompt}\n`);
    return;
  }
  if (values["availability-probe"]) {
    const envelope = await makeUnavailableEvidence(
      ROOT,
      corpus,
      values["availability-probe"],
      normalized,
    );
    writeExpectation(values["expectations-out"], envelope);
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    return;
  }
  if (values["validate-evidence"]) {
    if (!values.expectations) throw new Error("--expectations is required for live evidence");
    const evidence = JSON.parse(readFileSync(resolve(values["validate-evidence"]), "utf8"));
    const expectationRecords = JSON.parse(readFileSync(resolve(values.expectations), "utf8"));
    if (!Array.isArray(expectationRecords)) throw new Error("--expectations must contain an array");
    const expectedDigests = Object.fromEntries(
      expectationRecords.map(({ coordinate, evaluationDigest: digest }) => [coordinate, digest]),
    );
    const legacy = diagnoseLegacyEvidenceForCandidate(ROOT, evidence, values.candidate);
    if (legacy) {
      process.stdout.write(`${JSON.stringify(legacy)}\n`);
      process.exitCode = 1;
      return;
    }
    const result = validateEvidence(ROOT, evidence, values.candidate, values["require-all"], {
      criticalProfile: values["critical-profile"],
      expectedDigests,
    });
    process.stdout.write(
      `skill eval evidence ok: ${result.envelopes} envelopes, ${result.nonPass.length} non-PASS results\n`,
    );
    if (result.nonPass.length > 0) process.exitCode = 1;
    return;
  }
  throw new Error(usage().trim());
}

if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`skill-evals: ${error.message}\n`);
    process.exitCode = 2;
  }
}
