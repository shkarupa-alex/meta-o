/**
 * Validate actor, harness, and native execution evidence for skill evals.
 *
 * §A-EVAL-01 keeps unavailable desired actors distinct from successful model
 * executions so completeness never requires a fabricated effective identity.
 */

import { testingEffectiveIdentityError, testingPolicyError } from "../shared/scripts/mo-models.mjs";
import { forbiddenPublicDataReason } from "./sensitive-evidence.mjs";

/** §A-EVAL-01 refuses an empty string where portable evidence needs a value. */
export function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is empty`);
}

/** §A-EVAL-01 refuses an array or scalar where the contract declares an object. */
export function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

/** §A-EVAL-01 compares a full route/model/effort coordinate verbatim. */
export function sameIdentity(left, right) {
  return ["route", "model", "effort"].every((field) => left?.[field] === right?.[field]);
}

// §A-EVAL-01: only the Claude catalogue answers with family aliases (`opus`,
// `sonnet`, `opus[1m]`), so only there can a requested model legitimately differ
// from the one that ran. Every other route returns exact ids, where a difference
// is a substituted model rather than a resolved name.
const ALIAS_RESOLVING_ROUTES = new Set(["claude"]);

function sameCoordinate(left, right) {
  return ["route", "effort"].every((field) => left?.[field] === right?.[field]);
}

/**
 * §A-EVAL-01 reads the alias resolution every v3 execution has to record.
 *
 * `??` cannot tell an envelope that recorded "nothing resolved" from one whose
 * schema predates the field, so both would prove the same thing. The field is
 * mandatory exactly so a consumer knows the question was asked, and presence is
 * the half of that a checker can still verify after the fact.
 */
function recordedAliasResolution(envelope) {
  const execution = envelope.execution;
  if (!execution || !Object.hasOwn(execution, "aliasResolution")) {
    throw new Error(`${envelope.skill}: execution.aliasResolution is required`);
  }
  return execution.aliasResolution ?? null;
}

/**
 * §A-EVAL-01 accepts a resolved catalogue alias without loosening identity.
 *
 * The owner records the Claude coordinate as the alias the catalogue offers and
 * proves the exact id with a live run, so a verbatim model comparison would
 * reject the very evidence the policy demands. The contract stays closed by
 * default: a differing model with no `aliasResolution` is still the historical
 * mismatch, and the record has to quote both envelope fields rather than assert
 * a resolution of its own.
 */
function validateAliasResolution(envelope, requested, effective) {
  const resolution = recordedAliasResolution(envelope);
  const label = `${envelope.skill}: execution.aliasResolution`;
  if (resolution !== null && !ALIAS_RESOLVING_ROUTES.has(effective.route)) {
    throw new Error(
      `${envelope.skill}: alias_resolution_unsupported_route ${effective.route}` +
        " does not answer with aliases",
    );
  }
  if (requested.model === effective.model) {
    if (resolution !== null) {
      throw new Error(`${label} is present without a resolved alias`);
    }
    return;
  }
  if (resolution === null)
    throw new Error(`${envelope.skill}: requested/effective identity mismatch`);
  assertRecord(resolution, label);
  if (resolution.requested !== requested.model || resolution.effective !== effective.model) {
    throw new Error(`${label} does not quote the envelope identity verbatim`);
  }
  assertString(resolution.source, `${label}.source`);
  rejectSensitiveOrMachineLocal(resolution, label);
}

/** §A-EVAL-01 rejects secrets and machine-local paths from portable evidence. */
export function rejectSensitiveOrMachineLocal(value, label) {
  const visit = (node, path = label) => {
    if (typeof node === "string") {
      if (Buffer.byteLength(node, "utf8") > 16_384) {
        throw new Error(`${path}: evidence value exceeds portable scan bound`);
      }
      const reason = forbiddenPublicDataReason(node);
      if (reason === "machine_path") {
        throw new Error(`${path}: absolute machine path is forbidden`);
      }
      if (reason) throw new Error(`${path}: secret-bearing evidence value is forbidden`);
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (Buffer.byteLength(key, "utf8") > 1_024) {
        throw new Error(`${path}: evidence key exceeds portable scan bound`);
      }
      const keyReason = forbiddenPublicDataReason(key);
      if (keyReason === "machine_path") {
        throw new Error(`${path}: absolute machine path is forbidden in an evidence key`);
      }
      if (keyReason) throw new Error(`${path}: sensitive evidence key is forbidden`);
      if (/(?:api.?key|token|secret|transcript|weights?)/iu.test(key)) {
        throw new Error(`${path}.${key}: forbidden evidence field`);
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(value);
}

/** §A-EVAL-01 bounds portable evidence strings and rejects template placeholders by default. */
export function assertBoundedString(value, label, maxBytes, { allowAngles = false } = {}) {
  assertString(value, label);
  if (Buffer.byteLength(value, "utf8") > maxBytes)
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  if (!allowAngles && (value.includes("<") || value.includes(">")))
    throw new Error(`${label} has an unresolved placeholder`);
}

function validateEvidenceRef(value, caseId) {
  assertBoundedString(value, `${caseId}: evidence reference`, 1024);
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`${caseId}: evidence reference is not a bounded public locator`);
  }
  const kind = value.slice(0, separator);
  const locator = value.slice(separator + 1);
  if (!new Set(["fixture", "command", "dispatch", "terminal", "artifact", "file"]).has(kind)) {
    throw new Error(`${caseId}: evidence reference is not a bounded public locator`);
  }
  if (!["fixture", "file"].includes(kind)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/u.test(locator)) {
      throw new Error(`${caseId}: evidence reference is not a bounded public locator`);
    }
    return;
  }
  const fragmentIndex = locator.indexOf("#");
  if (fragmentIndex >= 0 && locator.indexOf("#", fragmentIndex + 1) >= 0) {
    throw new Error(`${caseId}: file evidence locator has multiple fragments`);
  }
  const path = fragmentIndex < 0 ? locator : locator.slice(0, fragmentIndex);
  const fragment = fragmentIndex < 0 ? undefined : locator.slice(fragmentIndex + 1);
  const segments = path.split("/");
  if (
    path.startsWith("/") ||
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    !segments.every((segment) => /^[A-Za-z0-9._-]+$/u.test(segment)) ||
    (fragment !== undefined && !/^[A-Za-z0-9._:-]+$/u.test(fragment))
  ) {
    throw new Error(`${caseId}: file evidence locator must be repository-relative`);
  }
}

/** §A-EVAL-01 binds bounded result provenance to the envelope's native execution. */
export function validateResultProvenance(result, unavailable, executionId) {
  assertBoundedString(result.observedAction, `${result.caseId}: observed action`, 256);
  const expectedAction = `${unavailable ? "availability_probe" : "case_evaluation"}:${executionId}`;
  if (result.observedAction !== expectedAction) {
    throw new Error(`${result.caseId}: observed action is not bound to the envelope execution`);
  }
  validateEvidenceRef(result.evidenceRef, result.caseId);
}

/** §A-EVAL-01 keeps critical B22 on a configured Qwen without coupling its generation to evals. */
function isQwenModel(model) {
  const identifier = String(model).split("/").at(-1)?.toLowerCase() ?? "";
  return /^qwen(?:\d[a-z0-9._-]*|[-_.][a-z0-9][a-z0-9._-]*)$/u.test(identifier);
}

/** §A-EVAL-01 parses the user-owned critical coordinate independently of evidence. */
function criticalProfileIdentity(envelope, criticalProfile) {
  assertString(criticalProfile, `${envelope.skill}: critical orchestrator profile`);
  const expected = criticalProfile.split("/");
  if (expected.length < 3)
    throw new Error("critical orchestrator profile must be route/model/effort");
  return {
    route: expected[0],
    model: expected.slice(1, -1).join("/"),
    effort: expected.at(-1),
  };
}

/** §A-EVAL-01 proves the configured identity also ran on the required local Qwen harness. */
function validateCriticalHarness(envelope, effective) {
  const harness = envelope.harness?.name?.toLowerCase() ?? "";
  const quantization =
    envelope.harness?.quantization?.toLowerCase().replace(/[^a-z0-9]/gu, "") ?? "";
  const context = Number(envelope.harness?.context);
  if (effective.route !== "opencode" || !harness.includes("opencode")) {
    throw new Error(`${envelope.skill}: critical orchestrator must run through OpenCode`);
  }
  if (!isQwenModel(effective.model)) {
    throw new Error(`${envelope.skill}: critical orchestrator profile must name a Qwen model`);
  }
  if (!quantization.includes("q4km")) {
    throw new Error(`${envelope.skill}: critical orchestrator must report Q4_K_M quantization`);
  }
  if (!Number.isSafeInteger(context) || context < 32768) {
    throw new Error(`${envelope.skill}: critical orchestrator context must be at least 32768`);
  }
}

function validateCriticalIdentity(envelope, criticalProfile) {
  const expectedIdentity = criticalProfileIdentity(envelope, criticalProfile);
  const effective = envelope.execution.effective;
  if (
    !sameIdentity(envelope.requested, expectedIdentity) ||
    !sameIdentity(effective, expectedIdentity)
  ) {
    throw new Error(
      `${envelope.skill}: critical evidence does not match the configured orchestrator profile`,
    );
  }
  validateCriticalHarness(envelope, effective);
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

/** §A-EVAL-01 holds one role to both halves of its approved identity. */
function validateApprovedProfile(envelope, identity, unavailable) {
  const role = identityRole(envelope.tier, identity.route);
  if (!role) throw new Error(`${envelope.skill}: unapproved testing route`);
  // The settings guard judges what was requested, because that is what a user
  // may legally store; the observed model is judged separately, because an alias
  // is allowed to be stored and is never allowed to have run as anything else.
  const policyError = testingPolicyError(role, envelope.requested);
  if (policyError) throw new Error(`${envelope.skill}: ${policyError}`);
  if (!unavailable) {
    const drift = testingEffectiveIdentityError(role, envelope.requested.model, identity.model);
    if (drift) throw new Error(`${envelope.skill}: ${drift}`);
  }
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

/** §A-EVAL-01 validates observed identity or an explicit absence of one. */
export function validateActorIdentity(envelope, criticalProfile, unavailable) {
  validateIdentityFields(envelope, unavailable);
  if (unavailable && envelope.execution?.effective !== null) {
    throw new Error(`${envelope.skill}: unavailable profile must not invent effective identity`);
  }
  const identity = unavailable ? envelope.requested : envelope.execution.effective;
  if (unavailable) {
    // An unavailable coordinate observed no model at all, so it can neither
    // claim an effective identity nor explain how an alias resolved.
    if (recordedAliasResolution(envelope) !== null) {
      throw new Error(`${envelope.skill}: unavailable profile must not invent an alias resolution`);
    }
  } else {
    if (!sameCoordinate(envelope.requested, identity)) {
      throw new Error(`${envelope.skill}: requested/effective identity mismatch`);
    }
    validateAliasResolution(envelope, envelope.requested, identity);
  }
  if (envelope.tier === "critical") return validateCriticalIdentity(envelope, criticalProfile);
  return validateApprovedProfile(envelope, identity, unavailable);
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
  const expectedHarness = { claude: "Claude", codex: "Codex", opencode: "OpenCode" }[
    envelope.requested?.route
  ];
  if (!expectedHarness || envelope.harness?.name !== expectedHarness) {
    throw new Error(`${envelope.skill}: harness.name does not match the approved route`);
  }
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
  envelope.harness.toolPermissions.forEach((permission, index) =>
    assertBoundedString(permission, `${envelope.skill}: toolPermissions[${index}]`, 128),
  );
}

/** §A-EVAL-01 prevents an unavailable harness from carrying invented runtime metadata. */
export function validateHarness(envelope, unavailable) {
  if (!unavailable) return validateAvailableHarness(envelope);
  assertString(envelope.harness?.name, `${envelope.skill}: harness.name`);
  const expectedHarness = { claude: "Claude", codex: "Codex", opencode: "OpenCode" }[
    envelope.requested?.route
  ];
  if (envelope.harness.name !== expectedHarness) {
    throw new Error(`${envelope.skill}: harness.name does not match the approved route`);
  }
  for (const field of ["version", "profileVersion", "quantization", "context", "sampling"]) {
    if (envelope.harness[field] !== null) {
      throw new Error(`${envelope.skill}: unavailable harness must not invent ${field}`);
    }
  }
  if (!Array.isArray(envelope.harness.toolPermissions) || envelope.harness.toolPermissions.length) {
    throw new Error(`${envelope.skill}: unavailable harness has no observed tool permissions`);
  }
}
