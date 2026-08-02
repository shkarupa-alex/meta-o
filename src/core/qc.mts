/**
 * §M-QC — Evaluation of the project-owned QC contract.
 *
 * Implements §A-AUTHORITATIVE-QC. `make qc` is the only mandatory mechanical
 * gate and the workflow must work without CI, so a false green here would
 * silently disable the whole quality layer. This module refuses to infer a pass
 * from an exit code alone: every declared gate has to appear in the result the
 * run itself asked for, and any weakening of the contract has to be visible.
 */

import type { QcManifest, QcManifestGate, QcResult, QcResultGate } from "./types.mjs";

/** §M-QC — Gate ids the Python starter profile must declare. */
export const PYTHON_MINIMUM_GATES = [
  "format-check",
  "lint",
  "typecheck-policy",
  "tests",
  "build-policy",
  "purpose",
  "knowledge",
  "import-graph",
  "code-health",
  "e2e-metadata",
] as const;

/** §M-QC — Validation outcome carrying every problem found. */
export interface QcValidation {
  ok: boolean;
  errors: string[];
}

/** §M-QC — Narrow an unknown value to a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** §M-QC — Validate the tracked `.quality/qc-manifest.json`. */
export function validateManifest(value: unknown): QcValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["manifest must be a JSON object"] };
  if (value["schema_version"] !== 1) errors.push("schema_version must be 1");

  const gates = value["gates"];
  if (!Array.isArray(gates) || gates.length === 0) {
    errors.push("gates must be a non-empty array");
    return { ok: false, errors };
  }

  const seen = new Set<string>();
  gates.forEach((raw, index) => {
    if (!isRecord(raw)) {
      errors.push(`gates[${index}] must be an object`);
      return;
    }
    const id = raw["id"];
    if (typeof id !== "string" || id === "") errors.push(`gates[${index}].id must be a string`);
    else if (seen.has(id)) errors.push(`duplicate gate id ${id}`);
    else seen.add(id);

    if (typeof raw["command"] !== "string" || raw["command"] === "") {
      errors.push(`gates[${index}].command must be a non-empty string`);
    }
    const policy = raw["policy"];
    if (policy !== "passed" && policy !== "not_applicable") {
      errors.push(`gates[${index}].policy must be passed|not_applicable`);
    }
    if (policy === "not_applicable" && typeof raw["rationale"] !== "string") {
      errors.push(`gates[${index}] declares not_applicable without a reviewed rationale`);
    }
  });

  return { ok: errors.length === 0, errors };
}

/** §M-QC — Validate the machine-readable result written to `META_O_QC_RESULT`. */
export function validateResult(value: unknown): QcValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["qc result must be a JSON object"] };
  if (value["schema_version"] !== 1) errors.push("schema_version must be 1");
  if (typeof value["snapshot_digest"] !== "string" || value["snapshot_digest"] === "") {
    errors.push("snapshot_digest must be a non-empty string");
  }
  const gates = value["gates"];
  if (!Array.isArray(gates)) {
    errors.push("gates must be an array");
    return { ok: false, errors };
  }
  const reported = new Set<string>();
  gates.forEach((raw, index) => {
    if (!isRecord(raw)) {
      errors.push(`gates[${index}] must be an object`);
      return;
    }
    const id = raw["id"];
    if (typeof id !== "string" || id === "") {
      errors.push(`gates[${index}].id must be a non-empty string`);
    } else if (reported.has(id)) {
      // Two entries for one gate mean the file states two outcomes for it, and
      // whichever one wins is an artefact of ordering. Reading it as "the last
      // one" turns a recorded failure into a pass.
      errors.push(`gate ${id} is reported more than once`);
    } else {
      reported.add(id);
    }
    const status = raw["status"];
    if (status !== "passed" && status !== "failed" && status !== "not_applicable") {
      errors.push(`gates[${index}].status must be passed|failed|not_applicable`);
    }
    if (typeof raw["command"] !== "string") {
      errors.push(`gates[${index}].command must be a string`);
    }
  });
  return { ok: errors.length === 0, errors };
}

/** §M-QC — Verdict of comparing a QC result against the declared contract. */
export interface QcEvaluation {
  pass: boolean;
  reasons: string[];
  executed: number;
  skipped: string[];
}

/**
 * §M-QC — Decide whether a QC run really passed.
 *
 * The failure modes this exists for are all silent ones: a gate that never ran,
 * a tool that was missing and got skipped, a result left over from an earlier
 * snapshot. Each of them would otherwise look exactly like success.
 */
export function evaluateQc(
  manifest: QcManifest,
  result: QcResult | undefined,
  expectedSnapshotDigest: string,
): QcEvaluation {
  const reasons: string[] = [];
  if (!result) {
    return {
      pass: false,
      reasons: ["no QC result was produced; a missing result is never a pass"],
      executed: 0,
      skipped: manifest.gates.map((gate) => gate.id),
    };
  }

  if (result.snapshot_digest !== expectedSnapshotDigest) {
    reasons.push(
      `QC result attests snapshot ${result.snapshot_digest}, candidate is ${expectedSnapshotDigest}`,
    );
  }

  const byId = new Map<string, QcResultGate>();
  for (const gate of result.gates) {
    if (byId.has(gate.id)) {
      reasons.push(`gate ${gate.id} is reported more than once, so its outcome is ambiguous`);
      continue;
    }
    byId.set(gate.id, gate);
  }

  const skipped: string[] = [];
  for (const declared of manifest.gates) {
    const executed = byId.get(declared.id);
    if (!executed) {
      reasons.push(`declared gate ${declared.id} produced no result`);
      skipped.push(declared.id);
      continue;
    }
    if (executed.status === "failed") {
      reasons.push(`gate ${declared.id} failed`);
      continue;
    }
    if (executed.status === "not_applicable") {
      if (declared.policy !== "not_applicable") {
        reasons.push(
          `gate ${declared.id} reported not_applicable but the manifest requires it to pass`,
        );
      }
      skipped.push(declared.id);
    }
  }

  for (const gate of result.gates) {
    if (!manifest.gates.some((declared) => declared.id === gate.id)) {
      reasons.push(`result reports undeclared gate ${gate.id}`);
    }
  }

  return { pass: reasons.length === 0, reasons, executed: result.gates.length, skipped };
}

/** §M-QC — One way in which a QC contract got weaker than its baseline. */
export interface QcWeakening {
  gateId: string;
  kind: "removed" | "policy_relaxed" | "command_changed";
  detail: string;
}

/**
 * §M-QC — Detect any relaxation of the QC contract relative to `baseRevision`.
 *
 * The executor is the party the gate constrains, so it must not be able to
 * quietly loosen it. Any hit here requires an explicit user decision; a changed
 * command is reported rather than judged, because only a human can say whether
 * a rewrite is equivalent.
 */
export function detectWeakening(baseline: QcManifest, current: QcManifest): QcWeakening[] {
  const weakenings: QcWeakening[] = [];
  const currentById = new Map<string, QcManifestGate>();
  for (const gate of current.gates) currentById.set(gate.id, gate);

  for (const baseGate of baseline.gates) {
    const now = currentById.get(baseGate.id);
    if (!now) {
      weakenings.push({
        gateId: baseGate.id,
        kind: "removed",
        detail: `gate ${baseGate.id} was removed from the manifest`,
      });
      continue;
    }
    if (baseGate.policy === "passed" && now.policy === "not_applicable") {
      weakenings.push({
        gateId: baseGate.id,
        kind: "policy_relaxed",
        detail: `gate ${baseGate.id} was downgraded from passed to not_applicable`,
      });
    }
    if (baseGate.command !== now.command) {
      weakenings.push({
        gateId: baseGate.id,
        kind: "command_changed",
        detail: `gate ${baseGate.id} command changed from ${baseGate.command} to ${now.command}`,
      });
    }
  }
  return weakenings;
}
