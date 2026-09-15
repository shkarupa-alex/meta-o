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

const LEGACY_POLICIES = new Set(["advisory", "critical"]);
const LEGACY_VERDICTS = new Set(["PASS", "FAIL", "UNKNOWN", "NOT_RUN", "NOT_APPLICABLE"]);
const LEGACY_CLASSES = ["degraded", "forbidden", "positive"];

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} missing`);
  }
  value.forEach((entry, index) => assertString(entry, `${label}[${index}]`));
}

function validateLegacyIdentity(identity, label) {
  assertRecord(identity, label);
  for (const field of ["route", "model", "effort"]) {
    assertString(identity[field], `${label}.${field}`);
  }
}

/** §A-EVAL-01 validates the frozen cases.v1 document used by v2 evidence. */
function validateLegacyCaseDocument(document, expectedSkill) {
  if (document?.contract !== "meta-o.skill-eval-cases.v1") {
    throw new Error(`${expectedSkill}: wrong legacy cases contract`);
  }
  if (document.skill !== expectedSkill) throw new Error(`${expectedSkill}: legacy skill mismatch`);
  assertString(document.owner, `${expectedSkill}: legacy owner`);
  if (!LEGACY_POLICIES.has(document.policy)) throw new Error(`${expectedSkill}: invalid policy`);
  if (!Array.isArray(document.cases) || document.cases.length !== 3) {
    throw new Error(`${expectedSkill}: legacy evidence needs three cases`);
  }
  for (const item of document.cases) {
    assertString(item.id, `${expectedSkill}: legacy case id`);
    if (item.id !== `${expectedSkill}.${item.class}`) {
      throw new Error(`${expectedSkill}: legacy case ${item.id} does not match its class`);
    }
    assertString(item.scenario, `${item.id}: legacy scenario`);
    for (const field of ["must", "mustNot"]) {
      assertStringArray(item[field], `${item.id}: legacy ${field}`);
    }
  }
  const ids = document.cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error(`${expectedSkill}: duplicate legacy case`);
  const classes = document.cases.map(({ class: value }) => value).sort();
  if (JSON.stringify(classes) !== JSON.stringify(LEGACY_CLASSES)) {
    throw new Error(`${expectedSkill}: wrong legacy case classes`);
  }
  const expectedPolicy = expectedSkill === "mo-orchestrate-orca" ? "critical" : "advisory";
  if (document.policy !== expectedPolicy) throw new Error(`${expectedSkill}: wrong legacy policy`);
  return document;
}

function validateLegacyResult(result) {
  assertRecord(result, "legacy_v2: result");
  assertString(result.caseId, "legacy_v2: caseId");
  if (!LEGACY_VERDICTS.has(result.verdict)) {
    throw new Error(`${result.caseId}: invalid legacy verdict`);
  }
  assertStringArray(result.observations, `${result.caseId}: legacy observations`);
  if (!Array.isArray(result.oracleEvidence)) {
    throw new Error(`${result.caseId}: legacy oracle evidence missing`);
  }
  const oracleKeys = new Set();
  for (const oracle of result.oracleEvidence) {
    assertRecord(oracle, `${result.caseId}: legacy oracle`);
    if (!new Set(["must", "mustNot"]).has(oracle.kind)) {
      throw new Error(`${result.caseId}: invalid legacy oracle kind`);
    }
    assertString(oracle.oracle, `${result.caseId}: legacy oracle`);
    assertString(oracle.evidence, `${result.caseId}: legacy oracle evidence`);
    if (typeof oracle.satisfied !== "boolean") {
      throw new Error(`${result.caseId}: legacy oracle satisfaction must be boolean`);
    }
    const key = `${oracle.kind}\0${oracle.oracle}`;
    if (oracleKeys.has(key)) throw new Error(`${result.caseId}: duplicate legacy oracle`);
    oracleKeys.add(key);
  }
  if (result.verdict === "PASS" && result.oracleEvidence.some(({ satisfied }) => !satisfied)) {
    throw new Error(`${result.caseId}: legacy PASS has an unsatisfied oracle`);
  }
  for (const v3Field of ["contractIds", "observedAction", "evidenceRef"]) {
    if (v3Field in result) throw new Error(`${result.caseId}: ${v3Field} is not legacy_v2`);
  }
}

function validateLegacyHarness(harness) {
  assertRecord(harness, "legacy_v2: harness");
  for (const field of [
    "name",
    "version",
    "profileVersion",
    "quantization",
    "context",
    "sampling",
  ]) {
    assertString(harness[field], `legacy_v2: harness.${field}`);
  }
  assertStringArray(harness.toolPermissions, "legacy_v2: harness.toolPermissions");
}

function validateLegacyExecution(envelope) {
  const execution = envelope.execution;
  assertRecord(execution, "legacy_v2: execution");
  if ("availability" in execution) {
    throw new Error("legacy_v2: execution.availability is not part of v2");
  }
  assertString(execution.id, "legacy_v2: execution.id");
  assertString(execution.source, "legacy_v2: execution.source");
  validateLegacyIdentity(execution.effective, "legacy_v2: execution.effective");
  if (!sameIdentity(envelope.requested, execution.effective)) {
    throw new Error("legacy_v2: requested/effective identity mismatch");
  }
  if (execution.source !== execution.effective.route) {
    throw new Error("legacy_v2: execution source/effective route mismatch");
  }
  const started = Date.parse(execution.startedAt);
  const completed = Date.parse(execution.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    throw new Error("legacy_v2: invalid execution interval");
  }
  if (execution.exitCode !== 0) throw new Error("legacy_v2: execution did not exit zero");
  assertString(execution.identityEvidence, "legacy_v2: execution.identityEvidence");
  if (!/^[a-f0-9]{64}$/u.test(execution.evaluationDigest ?? "")) {
    throw new Error("legacy_v2: invalid evaluation digest");
  }
}

function validateLegacyContext(envelope, context, caseIds) {
  if (!context) return;
  if (context.candidate && envelope.candidate !== context.candidate) {
    throw new Error("legacy_v2: candidate mismatch");
  }
  const expected = context.describeSkill?.(envelope.skill);
  if (!expected) throw new Error(`legacy_v2: unknown skill ${envelope.skill}`);
  if (envelope.policy !== expected.policy) throw new Error("legacy_v2: policy mismatch");
  if (envelope.skillRevision !== expected.revision) {
    throw new Error("legacy_v2: skill revision mismatch");
  }
  if (envelope.execution.evaluationDigest !== expected.digest(envelope)) {
    throw new Error("legacy_v2: evaluation digest mismatch");
  }
  const expectedCases = new Map(expected.cases.map((item) => [item.id, item]));
  if (caseIds.length !== expectedCases.size || caseIds.some((id) => !expectedCases.has(id))) {
    throw new Error("legacy_v2: result case identities mismatch");
  }
  for (const result of envelope.results) {
    const item = expectedCases.get(result.caseId);
    const expectedOracles = new Set([
      ...item.must.map((oracle) => `must\0${oracle}`),
      ...item.mustNot.map((oracle) => `mustNot\0${oracle}`),
    ]);
    const actualOracles = new Set(
      result.oracleEvidence.map(({ kind, oracle }) => `${kind}\0${oracle}`),
    );
    if (
      actualOracles.size !== expectedOracles.size ||
      [...actualOracles].some((key) => !expectedOracles.has(key))
    ) {
      throw new Error(`${result.caseId}: legacy oracle identities mismatch`);
    }
  }
}

function validateLegacyEnvelopeShape(envelope, context) {
  assertRecord(envelope, "legacy_v2: envelope");
  for (const field of ["candidate", "skillRevision"]) {
    if (!/^[a-f0-9]{40}$/u.test(envelope[field] ?? "")) {
      throw new Error(`legacy_v2: invalid ${field}`);
    }
  }
  assertString(envelope.skill, "legacy_v2: skill");
  if (!LEGACY_POLICIES.has(envelope.policy)) throw new Error("legacy_v2: invalid policy");
  if (!Number.isSafeInteger(envelope.repetition) || envelope.repetition < 1) {
    throw new Error("legacy_v2: invalid repetition");
  }
  for (const v3Field of ["tier", "matrixProfile"]) {
    if (v3Field in envelope) throw new Error(`legacy_v2: ${v3Field} is not part of v2`);
  }
  validateLegacyIdentity(envelope.requested, "legacy_v2: requested");
  validateLegacyHarness(envelope.harness);
  validateLegacyExecution(envelope);
  if (!Array.isArray(envelope.results) || envelope.results.length === 0) {
    throw new Error("legacy_v2: results missing");
  }
  envelope.results.forEach(validateLegacyResult);
  const caseIds = envelope.results.map(({ caseId }) => caseId);
  if (new Set(caseIds).size !== caseIds.length) throw new Error("legacy_v2: duplicate case id");
  validateLegacyContext(envelope, context, caseIds);
  rejectSensitiveOrMachineLocal(envelope, "legacy_v2");
}

function assertBoundedString(value, label, maxBytes) {
  assertString(value, label);
  if (Buffer.byteLength(value, "utf8") > maxBytes)
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  if (value.includes("<") || value.includes(">"))
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

/** §A-EVAL-01 reads v2 only into a typed diagnostic that cannot settle the v3 gate. */
export function diagnoseLegacyEvidence(evidence, context) {
  const envelopes = Array.isArray(evidence) ? evidence : [evidence];
  const legacy = envelopes.filter(
    (envelope) => envelope?.contract === "meta-o.skill-eval-evidence.v2",
  );
  if (legacy.length === 0) return null;
  if (legacy.length !== envelopes.length) throw new Error("legacy_v2: mixed evidence contracts");
  legacy.forEach((envelope) => validateLegacyEnvelopeShape(envelope, context));
  return { status: "legacy_v2", envelopes: legacy.length, accepted: false };
}

/** §A-EVAL-01 binds a v2 diagnostic to adapters reading its historical candidate. */
export function diagnoseLegacyEvidenceAtCandidate(evidence, candidate, adapter) {
  return diagnoseLegacyEvidence(evidence, {
    candidate,
    describeSkill(skill) {
      const source = adapter.readDocument(skill);
      if (source === null) return null;
      const document = validateLegacyCaseDocument(source, skill);
      return {
        policy: document.policy,
        revision: adapter.readRevision(skill),
        cases: document.cases,
        digest: (envelope) => adapter.digest(document, envelope),
      };
    },
  });
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
