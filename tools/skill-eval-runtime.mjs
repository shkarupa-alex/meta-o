/**
 * Validate actor, harness, and native execution evidence for skill evals.
 *
 * §A-EVAL-01 keeps unavailable desired actors distinct from successful model
 * executions so completeness never requires a fabricated effective identity.
 */

import { testingPolicyError } from "../shared/scripts/mo-models.mjs";

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is empty`);
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function sameIdentity(left, right) {
  return ["route", "model", "effort"].every((field) => left?.[field] === right?.[field]);
}

/** §A-EVAL-01 rejects secrets and machine-local paths from portable evidence. */
export function rejectSensitiveOrMachineLocal(value, label) {
  const serialized = JSON.stringify(value);
  if (/\/(?:home|Users|mnt|tmp)\//u.test(serialized)) {
    throw new Error(`${label}: absolute machine path is forbidden`);
  }
  const visit = (node, path = label) => {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (/(?:api.?key|token|secret|transcript|weights?)/iu.test(key)) {
        throw new Error(`${path}.${key}: forbidden evidence field`);
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(value);
}

function validateLegacyResult(result) {
  assertString(result.caseId, "legacy_v2: caseId");
  assertString(result.verdict, `${result.caseId}: legacy verdict`);
  if (!Array.isArray(result.observations) || result.observations.length === 0) {
    throw new Error(`${result.caseId}: legacy observations missing`);
  }
  if (!Array.isArray(result.oracleEvidence)) {
    throw new Error(`${result.caseId}: legacy oracle evidence missing`);
  }
}

function validateLegacyEnvelopeShape(envelope) {
  assertRecord(envelope, "legacy_v2: envelope");
  for (const field of ["candidate", "skillRevision"]) {
    if (!/^[a-f0-9]{40}$/u.test(envelope[field] ?? "")) {
      throw new Error(`legacy_v2: invalid ${field}`);
    }
  }
  for (const field of ["skill", "policy"]) assertString(envelope[field], `legacy_v2: ${field}`);
  if (!Number.isSafeInteger(envelope.repetition) || envelope.repetition < 1) {
    throw new Error("legacy_v2: invalid repetition");
  }
  for (const field of ["requested", "harness", "execution"]) {
    assertRecord(envelope[field], `legacy_v2: ${field}`);
  }
  for (const field of ["route", "model", "effort"]) {
    assertString(envelope.requested[field], `legacy_v2: requested.${field}`);
  }
  assertString(envelope.execution.id, "legacy_v2: execution.id");
  if (!Array.isArray(envelope.results) || envelope.results.length === 0) {
    throw new Error("legacy_v2: results missing");
  }
  envelope.results.forEach(validateLegacyResult);
  rejectSensitiveOrMachineLocal(envelope, "legacy_v2");
}

/** §A-EVAL-01 reads v2 only into a typed diagnostic that cannot settle the v3 gate. */
export function diagnoseLegacyEvidence(evidence) {
  const envelopes = Array.isArray(evidence) ? evidence : [evidence];
  const legacy = envelopes.filter(
    (envelope) => envelope?.contract === "meta-o.skill-eval-evidence.v2",
  );
  if (legacy.length === 0) return null;
  if (legacy.length !== envelopes.length) throw new Error("legacy_v2: mixed evidence contracts");
  legacy.forEach(validateLegacyEnvelopeShape);
  return { status: "legacy_v2", envelopes: legacy.length, accepted: false };
}

function validateCriticalIdentity(envelope, criticalProfile) {
  assertString(criticalProfile, `${envelope.skill}: critical orchestrator profile`);
  const expected = criticalProfile.split("/");
  if (expected.length < 3)
    throw new Error("critical orchestrator profile must be route/model/effort");
  const expectedIdentity = {
    route: expected[0],
    model: expected.slice(1, -1).join("/"),
    effort: expected.at(-1),
  };
  const effective = envelope.execution.effective;
  const harness = envelope.harness?.name?.toLowerCase() ?? "";
  const quantization =
    envelope.harness?.quantization?.toLowerCase().replace(/[^a-z0-9]/gu, "") ?? "";
  const context = Number(envelope.harness?.context);
  const qualified = [
    sameIdentity(envelope.requested, expectedIdentity),
    sameIdentity(effective, expectedIdentity),
    effective.route === "opencode",
    harness.includes("opencode"),
    quantization.includes("q4km"),
    Number.isSafeInteger(context),
    context >= 32768,
  ];
  if (!qualified.every(Boolean)) {
    throw new Error(
      `${envelope.skill}: critical evidence does not match the configured orchestrator profile`,
    );
  }
}

function identityRole(tier, route) {
  return tier === "desired"
    ? { codex: "testCodexDesired", opencode: "testOpenCodeDesired" }[route]
    : { claude: "testClaude", codex: "testCodex" }[route];
}

function validateIdentityFields(envelope, unavailable) {
  for (const side of unavailable ? ["requested"] : ["requested", "effective"]) {
    const identity = side === "requested" ? envelope.requested : envelope.execution?.effective;
    for (const field of ["route", "model", "effort"]) {
      assertString(identity?.[field], `${envelope.skill}: ${side}.${field}`);
    }
  }
}

/** §A-EVAL-01 validates observed identity or an explicit absence of one. */
export function validateActorIdentity(envelope, criticalProfile, unavailable) {
  validateIdentityFields(envelope, unavailable);
  if (unavailable && envelope.execution?.effective !== null) {
    throw new Error(`${envelope.skill}: unavailable profile must not invent effective identity`);
  }
  const identity = unavailable ? envelope.requested : envelope.execution.effective;
  if (!unavailable && !sameIdentity(envelope.requested, identity)) {
    throw new Error(`${envelope.skill}: requested/effective identity mismatch`);
  }
  if (envelope.tier === "critical") return validateCriticalIdentity(envelope, criticalProfile);
  const role = identityRole(envelope.tier, identity.route);
  if (!role) throw new Error(`${envelope.skill}: unapproved testing route`);
  const policyError = testingPolicyError(role, identity);
  if (policyError) throw new Error(`${envelope.skill}: ${policyError}`);
  const expectedProfile = {
    testClaude: "required-claude",
    testCodex: "required-codex",
    testCodexDesired: "desired-codex",
    testOpenCodeDesired: "desired-opencode",
  }[role];
  if (envelope.matrixProfile !== expectedProfile) {
    throw new Error(`${envelope.skill}: matrix profile does not match actor identity`);
  }
}

function validateUnavailableExecution(envelope) {
  const execution = envelope.execution;
  if (!Number.isSafeInteger(execution.exitCode) || execution.exitCode === 0) {
    throw new Error(`${envelope.skill}: unavailable probe needs a nonzero native exit code`);
  }
  if (execution.availability?.status !== "not_available") {
    throw new Error(`${envelope.skill}: unavailable probe status is missing`);
  }
  assertString(execution.availability.reason, `${envelope.skill}: availability.reason`);
  const reasons = new Set([
    "command_unavailable",
    "approved_profile_unavailable",
    "harness_unavailable",
  ]);
  if (!reasons.has(execution.availability.reason)) {
    throw new Error(`${envelope.skill}: unknown unavailable reason`);
  }
}

/** §A-EVAL-01 binds native execution facts to an already computed digest. */
export function validateExecution(envelope, unavailable, expectedDigest) {
  const execution = envelope.execution;
  assertString(execution?.id, `${envelope.skill}: execution.id`);
  assertString(execution?.source, `${envelope.skill}: execution.source`);
  assertString(execution?.identityEvidence, `${envelope.skill}: execution.identityEvidence`);
  const expectedRoute = unavailable ? envelope.requested.route : execution.effective.route;
  if (execution.source !== expectedRoute) {
    throw new Error(`${envelope.skill}: execution source/route mismatch`);
  }
  const started = Date.parse(execution.startedAt);
  const completed = Date.parse(execution.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    throw new Error(`${envelope.skill}: invalid execution interval`);
  }
  if (unavailable) validateUnavailableExecution(envelope);
  else if (execution.exitCode !== 0)
    throw new Error(`${envelope.skill}: native harness did not exit zero`);
  else if (execution.availability !== null && execution.availability !== undefined)
    throw new Error(`${envelope.skill}: successful execution cannot claim unavailable`);
  if (execution.evaluationDigest !== expectedDigest)
    throw new Error(`${envelope.skill}: evaluation digest mismatch`);
  if (JSON.stringify(execution).includes("<"))
    throw new Error(`${envelope.skill}: unresolved execution placeholder`);
}

function validateAvailableHarness(envelope) {
  for (const field of [
    "name",
    "version",
    "profileVersion",
    "quantization",
    "context",
    "sampling",
  ]) {
    assertString(envelope.harness?.[field], `${envelope.skill}: harness.${field}`);
  }
  if (
    !Array.isArray(envelope.harness.toolPermissions) ||
    !envelope.harness.toolPermissions.length
  ) {
    throw new Error(`${envelope.skill}: tool permissions are missing`);
  }
}

/** §A-EVAL-01 prevents an unavailable harness from carrying invented runtime metadata. */
export function validateHarness(envelope, unavailable) {
  if (!unavailable) return validateAvailableHarness(envelope);
  assertString(envelope.harness?.name, `${envelope.skill}: harness.name`);
  for (const field of ["version", "profileVersion", "quantization", "context", "sampling"]) {
    if (envelope.harness[field] !== null) {
      throw new Error(`${envelope.skill}: unavailable harness must not invent ${field}`);
    }
  }
  if (!Array.isArray(envelope.harness.toolPermissions) || envelope.harness.toolPermissions.length) {
    throw new Error(`${envelope.skill}: unavailable harness has no observed tool permissions`);
  }
}
