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
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { buildUnavailableEvidence } from "./skill-eval-availability.mjs";
import {
  buildEvidenceAggregate,
  canonicalJson,
  registerCompositeIdentities,
} from "./skill-eval-aggregate.mjs";
import { buildEvaluationPrompt } from "./skill-eval-prompt.mjs";
import {
  evaluationCoordinate,
  expectedDigest,
  expectedExecution,
  readExpectedBindings,
  writeExpectation,
} from "./skill-eval-expectations.mjs";

import { EXPECTED_SKILLS, loadCorpus } from "./skill-eval-corpus.mjs";
import {
  assertBoundedString,
  assertString,
  rejectSensitiveOrMachineLocal,
  validateActorIdentity,
  validateExecution,
  validateHarness,
  validateResultProvenance,
} from "./skill-eval-runtime.mjs";

import { diagnoseLegacyEvidenceAtCandidate } from "./skill-eval-legacy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_CONTRACT = "meta-o.skill-eval-evidence.v3";
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
  { matrixProfile: "required-claude-opus", route: "claude", role: "testClaude" },
  { matrixProfile: "required-codex-sol", route: "codex", role: "testCodexSol" },
  { matrixProfile: "required-codex-luna", route: "codex", role: "testCodexLuna" },
];
// §A-EVAL-01: v3 evidence on the replaced required pair stays readable as a
// diagnostic, never as proof, so an old green run cannot close the new matrix.
const LEGACY_REQUIRED_PROFILES = new Set(["required-claude", "required-codex"]);
const DESIRED_MATRIX = [
  { matrixProfile: "desired-codex", route: "codex", role: "testCodexDesired" },
  { matrixProfile: "desired-opencode", route: "opencode", role: "testOpenCodeDesired" },
];
const EXPECTED_MATRIX = [...REQUIRED_MATRIX, ...DESIRED_MATRIX];
const AGGREGATE_MATRIX_ORDER = [
  "required-codex-sol",
  "required-codex-luna",
  "required-claude-opus",
  "desired-codex",
  "desired-opencode",
];
const MATRIX_BY_PROFILE = new Map(
  EXPECTED_MATRIX.map((profile) => [profile.matrixProfile, profile]),
);
const CRITICAL_MATRIX_PROFILE = "critical-orchestration";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

/** §A-EVAL-01 binds a result to the exact candidate, corpus, requested actor and harness inputs. */
export function evaluationDigest(document, envelope) {
  const payload = {
    candidate: envelope.candidate,
    skillRevision: envelope.skillRevision,
    skill: envelope.skill,
    // A frozen v2 envelope predates the case-level coordinate and has no case.
    ...(envelope.caseId === undefined ? {} : { caseId: envelope.caseId }),
    policy: envelope.policy,
    repetition: envelope.repetition,
    tier: envelope.tier,
    matrixProfile: envelope.matrixProfile,
    requested: envelope.requested,
    harness: envelope.harness,
    cases: document.cases,
  };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

/**
 * The corpus narrowed to the one case an evidence coordinate evaluates.
 *
 * Prompt, digest and result validation all read this view, so a turn is shown,
 * frozen and checked against exactly its own case, as §A-EVAL-01 fixes it.
 */
export function caseDocument(document, caseId) {
  if (typeof caseId !== "string" || caseId === "") {
    throw new Error(`${document.skill}: --case names the one case to evaluate`);
  }
  const item = document.cases.find(({ id }) => id === caseId);
  if (!item) throw new Error(`${document.skill}: unknown case ${caseId}`);
  return { ...document, cases: [item] };
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
    document: caseDocument(document, values.case),
    values,
    digest: evaluationDigest,
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
    document: caseDocument(document, values.case),
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

function validateEnvelope(
  root,
  corpus,
  envelope,
  candidate,
  criticalProfile,
  expectedDigests,
  expectedExecutions,
) {
  if (envelope.contract !== EVIDENCE_CONTRACT) throw new Error("wrong evidence contract");
  if (envelope.candidate !== candidate) throw new Error(`${envelope.skill}: candidate mismatch`);
  const document = corpus.get(envelope.skill);
  if (!document) throw new Error(`unknown evidence skill ${envelope.skill}`);
  if (envelope.policy !== document.policy) throw new Error(`${envelope.skill}: policy mismatch`);
  assertString(envelope.caseId, `${envelope.skill}: caseId`);
  const evaluated = caseDocument(document, envelope.caseId);
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
  validateResults(envelope, evaluated, unavailable);
  validateActorIdentity(envelope, criticalProfile, unavailable);
  validateHarness(envelope, unavailable);
  rejectSensitiveOrMachineLocal(envelope, envelope.skill);
  const frozenDigest = expectedDigest(expectedDigests, envelope);
  if (evaluationDigest(evaluated, envelope) !== frozenDigest) {
    throw new Error(`${envelope.skill}: returned evaluation inputs do not match frozen digest`);
  }
  validateExecution(envelope, unavailable, frozenDigest);
  const callerExecution = expectedExecution(expectedExecutions, envelope);
  if (canonicalJson(envelope.execution) !== canonicalJson(callerExecution)) {
    throw new Error(`${envelope.skill}: actor execution does not match caller-owned observation`);
  }
  return envelope.results.filter(({ verdict }) =>
    new Set(["FAIL", "UNKNOWN", "BLOCKED", "NOT_RUN"]).has(verdict),
  );
}

/** §A-EVAL-01 names v3 evidence recorded on the replaced required pair, or null. */
export function legacyProfileDiagnostic(evidence) {
  const profiles = (Array.isArray(evidence) ? evidence : [evidence])
    .filter((envelope) => envelope?.contract === EVIDENCE_CONTRACT)
    .map((envelope) => envelope.matrixProfile)
    .filter((profile) => LEGACY_REQUIRED_PROFILES.has(profile));
  if (profiles.length === 0) return null;
  return { status: "legacy", accepted: false, profiles: [...new Set(profiles)].sort() };
}

/**
 * Admit one envelope per coordinate and one coordinate per native execution.
 *
 * A turn reused for a second case or profile would count one judgement as two.
 */
function registerCoordinate(envelope, seen) {
  const key = evaluationCoordinate(envelope);
  const executionId = envelope.execution?.id;
  if (seen.has(key)) throw new Error(`duplicate evidence ${key}`);
  const owner = [...seen.entries()].find(([, id]) => id === executionId);
  if (owner) throw new Error(`${key}: execution ${executionId} already evidences ${owner[0]}`);
  seen.set(key, executionId);
}

/** Fail unless every case of every skill has evidence on every matrix profile. */
function requireEveryCase(corpus, envelopes) {
  const covered = new Set(
    envelopes.map(({ skill, caseId, matrixProfile }) => `${skill}:${caseId}:${matrixProfile}`),
  );
  const missing = EXPECTED_SKILLS.flatMap((skill) =>
    corpus
      .get(skill)
      .cases.flatMap(({ id }) =>
        EXPECTED_MATRIX.map(({ matrixProfile }) => `${skill}:${id}:${matrixProfile}`),
      ),
  ).filter((coordinate) => !covered.has(coordinate));
  if (missing.length > 0) throw new Error(`missing case evidence: ${missing.join(", ")}`);
}

/** §A-EVAL-01 verifies exact identity, completeness and redaction of live eval evidence. */
export function validateEvidence(root, evidence, candidate, requireAll = false, options = {}) {
  if (!/^[a-f0-9]{40}$/u.test(candidate ?? "")) throw new Error("candidate must be a full SHA");
  const legacyProfiles = legacyProfileDiagnostic(evidence);
  if (legacyProfiles) {
    throw new Error(
      `legacy: diagnostic only; ${legacyProfiles.profiles.join(", ")} predate the required matrix`,
    );
  }
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
  const seen = new Map();
  const compositeIdentities = new Set();
  const nonPass = [];
  for (const envelope of envelopes) {
    registerCoordinate(envelope, seen);
    registerCompositeIdentities(envelope, compositeIdentities);
    nonPass.push(
      ...validateEnvelope(
        root,
        corpus,
        envelope,
        candidate,
        options.criticalProfile,
        options.expectedDigests,
        options.expectedExecutions,
      ),
    );
  }
  if (requireAll) requireEveryCase(corpus, envelopes);
  const aggregate = buildEvidenceAggregate(envelopes, AGGREGATE_MATRIX_ORDER);
  return { envelopes: envelopes.length, nonPass, aggregate };
}

function usage() {
  return `usage:
  node tools/skill-evals.mjs --check
  node tools/skill-evals.mjs --prompt <skill> --case <case-id> --expectations-out <json> --candidate <sha> --tier <required|desired|critical> --matrix-profile <name> --route <route> --model <id> --effort <level> --harness <name> --harness-version <version> --profile-version <version> --quantization <value> --context <value> --sampling <value> --tool-permissions <csv> [--repetition 1]
  node tools/skill-evals.mjs --availability-probe <skill> --case <case-id> --expectations-out <json> --candidate <sha> --tier desired --matrix-profile <name> --route <route> --model <id> --effort <level> --harness <name> [--repetition 1]
  node tools/skill-evals.mjs --validate-evidence <json> --expectations <json> --execution-observations <json> --candidate <sha> [--require-all] [--critical-profile <route/model/effort>]\n`;
}

async function main() {
  // prettier-ignore
  const stringOptions = ["prompt", "availability-probe", "case", "candidate", "route", "model", "effort", "harness", "harness-version", "profile-version", "quantization", "context", "sampling", "tool-permissions", "repetition", "tier", "matrix-profile", "validate-evidence", "expectations", "expectations-out", "execution-observations", "critical-profile"];
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
    if (!values["execution-observations"]) {
      throw new Error("--execution-observations is required for live evidence");
    }
    const evidence = JSON.parse(readFileSync(resolve(values["validate-evidence"]), "utf8"));
    const { expectedDigests, expectedExecutions } = readExpectedBindings(
      values.expectations,
      values["execution-observations"],
    );
    const legacy =
      diagnoseLegacyEvidenceForCandidate(ROOT, evidence, values.candidate) ??
      legacyProfileDiagnostic(evidence);
    if (legacy) {
      process.stdout.write(`${JSON.stringify(legacy)}\n`);
      process.exitCode = 1;
      return;
    }
    const result = validateEvidence(ROOT, evidence, values.candidate, values["require-all"], {
      criticalProfile: values["critical-profile"],
      expectedDigests,
      expectedExecutions,
    });
    process.stdout.write(
      `skill eval evidence ok: ${result.envelopes} envelopes, ${result.nonPass.length} non-PASS results\n`,
    );
    process.stdout.write(`${JSON.stringify({ aggregate: result.aggregate })}\n`);
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
