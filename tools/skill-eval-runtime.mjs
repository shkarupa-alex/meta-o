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
    JSON.stringify(envelope.requested) === JSON.stringify(expectedIdentity),
    JSON.stringify(effective) === JSON.stringify(expectedIdentity),
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
  if (!unavailable && JSON.stringify(envelope.requested) !== JSON.stringify(identity)) {
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
