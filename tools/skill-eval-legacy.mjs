/**
 * Read frozen v2 skill-eval evidence as a typed diagnostic that can never settle.
 *
 * §A-EVAL-01 keeps the retired envelope readable without letting it close the
 * v3 gate: the whole v2 shape is still validated, so a malformed historical
 * envelope is an error rather than a silent `accepted: false`. It lives beside
 * the v3 runtime rather than inside it because the two contracts change for
 * different reasons and only one of them is still written.
 */

import {
  assertRecord,
  assertString,
  rejectSensitiveOrMachineLocal,
  sameIdentity,
} from "./skill-eval-runtime.mjs";

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

/**
 * §A-EVAL-01 binds a v2 diagnostic to adapters reading its historical candidate.
 * The adapter must return null for an unknown skill before repository lookup so
 * envelope bytes can never become a Git pathspec; null becomes a typed error here.
 */
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
