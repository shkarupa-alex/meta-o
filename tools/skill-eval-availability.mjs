/**
 * Materialize one desired skill-eval coordinate from a failed native executable
 * probe, so §A-EVAL-01 never asks an unavailable model to describe itself.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import { probeModelProfile } from "../shared/scripts/mo-models.mjs";

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is empty`);
}

function unavailableResult(item, executionId) {
  const evidence = "not evaluated because the approved desired harness was unavailable";
  return {
    caseId: item.id,
    contractIds: item.contracts,
    verdict: "NOT_AVAILABLE",
    observations: ["approved desired harness was unavailable"],
    observedAction: `availability_probe:${executionId}`,
    evidenceRef: `command:${executionId}`,
    oracleEvidence: [
      ...item.must.map((oracle) => ({ kind: "must", oracle, satisfied: false, evidence })),
      ...item.mustNot.map((oracle) => ({ kind: "mustNot", oracle, satisfied: false, evidence })),
    ],
  };
}

/** §A-EVAL-01 keeps an unobserved harness free of invented runtime metadata. */
function unavailableHarness(name) {
  return {
    name,
    version: null,
    profileVersion: null,
    quantization: null,
    context: null,
    sampling: null,
    toolPermissions: [],
  };
}

/** §A-EVAL-01 emits typed NOT_AVAILABLE evidence only after a failed native probe. */
export async function buildUnavailableEvidence({
  candidate,
  skill,
  skillRevision,
  document,
  values,
  digest,
}) {
  if (values.tier !== "desired") {
    throw new Error("--availability-probe materializes only a desired NOT_AVAILABLE coordinate");
  }
  const requested = { route: values.route, model: values.model, effort: values.effort };
  Object.entries(requested).forEach(([key, value]) => requiredString(value, `--${key}`));
  requiredString(values.harness, "--harness");
  requiredString(values.matrixProfile, "--matrix-profile");
  const command = { claude: "claude", codex: "codex", opencode: "opencode" }[requested.route];
  if (!command) throw new Error("--route has no native availability probe");

  const startedAt = new Date().toISOString();
  const probe = spawnSync(command, ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
    stdio: ["ignore", "ignore", "ignore"],
  });
  const completedAt = new Date().toISOString();
  let exitCode;
  let reason;
  if (probe.error?.code === "ENOENT") {
    exitCode = 127;
    reason = "command_unavailable";
  } else {
    const profile = await probeModelProfile(requested.route, requested.model, requested.effort);
    if (profile.status === "available") {
      throw new Error(`${requested.route} exact profile probe succeeded; NOT_AVAILABLE is false`);
    }
    if (profile.status !== "not_available") {
      throw new Error(`${requested.route} catalog could not prove exact profile availability`);
    }
    exitCode = 2;
    reason = "approved_profile_unavailable";
  }
  const executionId = `${requested.route}-availability-${createHash("sha256")
    .update(`${candidate}:${skill}:${values.matrixProfile}:${startedAt}`)
    .digest("hex")
    .slice(0, 16)}`;
  const envelope = {
    contract: "meta-o.skill-eval-evidence.v3",
    candidate,
    skillRevision,
    skill,
    policy: document.policy,
    repetition: Number(values.repetition ?? 1),
    tier: values.tier,
    matrixProfile: values.matrixProfile,
    requested,
    harness: unavailableHarness(values.harness),
    execution: {
      id: executionId,
      source: requested.route,
      startedAt,
      completedAt,
      exitCode,
      effective: null,
      availability: { status: "not_available", reason },
      aliasResolution: null, // No model ran, so no alias resolved: state it.
      identityEvidence: `native ${requested.route} executable probe returned ${reason}`,
      evaluationDigest: "",
    },
    results: document.cases.map((item) => unavailableResult(item, executionId)),
  };
  if (envelope.repetition !== 1) throw new Error("--repetition must be 1");
  envelope.execution.evaluationDigest = digest(document, envelope);
  return envelope;
}
