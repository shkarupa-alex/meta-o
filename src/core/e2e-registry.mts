/**
 * §M-E2E-REGISTRY — Validation of the E2E catalog and of the selection plan.
 *
 * Implements §A-E2E-SELECTION. The selection plan is the only thing standing
 * between "reviewed code" and "code whose behaviour was actually exercised", so
 * both reviewers attest it. That attestation is meaningless unless the plan and
 * the catalog it draws from are mechanically well formed, which is this
 * module's job.
 */

import { canonicalize, type JsonValue } from "./canonical-json.mjs";
import { sha256Hex } from "./hash.mjs";
import type { E2ERegistry, E2EScenarioEntry, E2ESelectionPlan } from "./types.mjs";

/** §M-E2E-REGISTRY — Grammar of a business anchor referenced by a scenario. */
export const BUSINESS_ANCHOR = /^§B-[A-Z0-9-]+$/;

/** §M-E2E-REGISTRY — Grammar of a `scenario_ref` pointing into `e2e.md`. */
export const SCENARIO_REF = /^[^#\s]+\.md#[a-z0-9][a-z0-9-]*$/;

/** §M-E2E-REGISTRY — Allowed verification outcomes of one scenario. */
const SCENARIO_STATUS = new Set(["passed", "failed", "blocked"]);

/**
 * §M-E2E-REGISTRY — The complete field list of a scenario and of its `last_run`.
 *
 * The catalog is a catalog plus a compact receipt, and the schema is closed so
 * that it stays one. An open schema is how screenshots, raw logs and model
 * reasoning end up in a tracked file that every future diff has to carry — and
 * how a scenario acquires fields no reviewer ever agreed to attest.
 */
const SCENARIO_FIELDS = new Set([
  "scenario_id",
  "scenario_ref",
  "business_links",
  "always_required",
  "tags",
  "last_run",
]);

/** §M-E2E-REGISTRY — The complete field list of one `last_run` receipt. */
const LAST_RUN_FIELDS = new Set([
  "snapshot_digest",
  "provenance_commit",
  "run_id",
  "spec_sha256",
  "verified_at",
  "status",
  "environment",
]);

/** §M-E2E-REGISTRY — Report any field the closed schema does not declare. */
function rejectUnknownFields(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  where: string,
  errors: string[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) errors.push(`${where}: unknown field ${JSON.stringify(key)}`);
  }
}

/** §M-E2E-REGISTRY — Validation outcome with every problem found, not just the first. */
export interface ValidationOutcome {
  ok: boolean;
  errors: string[];
}

/** §M-E2E-REGISTRY — Narrow an unknown value to a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** §M-E2E-REGISTRY — Validate one `last_run` block, which is optional but not free-form. */
function validateLastRun(scenario: Record<string, unknown>, id: string, errors: string[]): void {
  const lastRun = scenario["last_run"];
  if (lastRun === undefined) return;
  if (!isRecord(lastRun)) {
    errors.push(`${id}: last_run must be an object`);
    return;
  }
  for (const field of LAST_RUN_FIELDS) {
    if (typeof lastRun[field] !== "string" || lastRun[field] === "") {
      errors.push(`${id}: last_run.${field} must be a non-empty string`);
    }
  }
  rejectUnknownFields(lastRun, LAST_RUN_FIELDS, `${id}: last_run`, errors);
  const status = lastRun["status"];
  if (typeof status === "string" && !SCENARIO_STATUS.has(status)) {
    errors.push(`${id}: last_run.status must be passed|failed|blocked, got ${status}`);
  }
}

/**
 * §M-E2E-REGISTRY — Validate `docs/architecture/e2e.json` against its normative schema.
 *
 * Also enforces the project-level rule that at least one scenario is
 * `always_required`: without it a feature touching no obvious business link
 * could select an empty set and still claim an E2E pass.
 */
export function validateRegistry(value: unknown): ValidationOutcome {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["registry must be a JSON object"] };
  if (value["schema_version"] !== 1) errors.push("schema_version must be 1");

  const scenarios = value["scenarios"];
  if (!Array.isArray(scenarios)) {
    errors.push("scenarios must be an array");
    return { ok: false, errors };
  }

  const seen = new Set<string>();
  let alwaysRequired = 0;

  scenarios.forEach((raw, index) => {
    if (!isRecord(raw)) {
      errors.push(`scenarios[${index}] must be an object`);
      return;
    }
    const id = typeof raw["scenario_id"] === "string" ? raw["scenario_id"] : `scenarios[${index}]`;
    if (typeof raw["scenario_id"] !== "string" || raw["scenario_id"] === "") {
      errors.push(`${id}: scenario_id must be a non-empty string`);
    } else if (seen.has(raw["scenario_id"])) {
      errors.push(`${id}: duplicate scenario_id`);
    } else {
      seen.add(raw["scenario_id"]);
    }

    const ref = raw["scenario_ref"];
    if (typeof ref !== "string" || !SCENARIO_REF.test(ref)) {
      errors.push(`${id}: scenario_ref must look like docs/architecture/e2e.md#anchor`);
    }

    const links = raw["business_links"];
    if (!Array.isArray(links) || links.length === 0) {
      errors.push(`${id}: business_links must be a non-empty array`);
    } else {
      for (const link of links) {
        if (typeof link !== "string" || !BUSINESS_ANCHOR.test(link)) {
          errors.push(`${id}: business link ${String(link)} does not match §B-[A-Z0-9-]+`);
        }
      }
    }

    if (typeof raw["always_required"] !== "boolean") {
      errors.push(`${id}: always_required must be a boolean`);
    } else if (raw["always_required"]) {
      alwaysRequired += 1;
    }

    const tags = raw["tags"];
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
      errors.push(`${id}: tags must be an array of strings`);
    }

    validateLastRun(raw, id, errors);
    rejectUnknownFields(raw, SCENARIO_FIELDS, id, errors);
  });

  if (alwaysRequired === 0) {
    errors.push("at least one scenario must have always_required: true");
  }

  rejectUnknownFields(value, new Set(["schema_version", "scenarios"]), "registry", errors);
  return { ok: errors.length === 0, errors };
}

/**
 * §M-E2E-REGISTRY — Report business links that no knowledge anchor defines.
 *
 * A dangling link silently disconnects behaviour from the reason it exists,
 * which is precisely the drift the knowledge layer is meant to prevent.
 */
export function danglingBusinessLinks(registry: E2ERegistry, knownAnchors: Set<string>): string[] {
  const dangling: string[] = [];
  for (const scenario of registry.scenarios) {
    for (const link of scenario.business_links) {
      if (!knownAnchors.has(link)) dangling.push(`${scenario.scenario_id} → ${link}`);
    }
  }
  return dangling;
}

/**
 * §M-E2E-REGISTRY — Digest identifying a selection plan.
 *
 * Computed over the plan without its own digest field, so the value is a
 * function of the commitments the plan makes and nothing else.
 */
export function computePlanDigest(plan: Omit<E2ESelectionPlan, "planDigest">): string {
  const payload = {
    schemaVersion: plan.schemaVersion,
    commitOid: plan.commitOid,
    selectedScenarioIds: [...plan.selectedScenarioIds].sort(),
    selectionRationale: plan.selectionRationale,
    impactedBusinessLinks: [...plan.impactedBusinessLinks].sort(),
    impactedTags: [...plan.impactedTags].sort(),
  };
  return sha256Hex(canonicalize(payload as unknown as JsonValue));
}

/** §M-E2E-REGISTRY — Attach the computed digest to a plan draft. */
export function sealPlan(plan: Omit<E2ESelectionPlan, "planDigest">): E2ESelectionPlan {
  return { ...plan, planDigest: computePlanDigest(plan) };
}

/**
 * §M-E2E-REGISTRY — Validate a plan against the catalog it claims to draw from.
 *
 * The orchestrator checks only schema and digest — judging *coverage* is the
 * reviewers' job — but an unknown scenario id or a missing `always_required`
 * canary is a mechanical error the orchestrator must not pass on.
 *
 * A plan that contradicts its own declared impact is the same kind of error.
 * §30 says the selection takes every scenario carrying an impacted business
 * link or an impacted tag, and `impactedBusinessLinks`/`impactedTags` were read
 * by nothing: a tester could declare checkout impacted, select one unrelated
 * smoke scenario, and have the plan accepted and digested. Deciding *whether*
 * checkout is impacted is still the reviewers' call — this only holds the plan
 * to what it has already said about itself.
 */
export function validatePlan(plan: E2ESelectionPlan, registry: E2ERegistry): ValidationOutcome {
  const errors: string[] = [];
  if (plan.schemaVersion !== 1) errors.push("plan schemaVersion must be 1");
  if (typeof plan.commitOid !== "string" || plan.commitOid === "") {
    errors.push("plan commitOid must be a non-empty string");
  }
  if (!Array.isArray(plan.selectedScenarioIds) || plan.selectedScenarioIds.length === 0) {
    errors.push("plan must select at least one scenario");
  }

  const known = new Set(registry.scenarios.map((scenario) => scenario.scenario_id));
  for (const id of plan.selectedScenarioIds ?? []) {
    if (!known.has(id)) errors.push(`plan selects unknown scenario ${id}`);
  }

  const duplicates = (plan.selectedScenarioIds ?? []).filter(
    (id, index, all) => all.indexOf(id) !== index,
  );
  for (const id of new Set(duplicates)) errors.push(`plan selects ${id} more than once`);

  for (const scenario of registry.scenarios) {
    if (scenario.always_required && !(plan.selectedScenarioIds ?? []).includes(scenario.scenario_id)) {
      errors.push(`plan omits always_required scenario ${scenario.scenario_id}`);
    }
  }

  const implied = baselineSelection(registry, {
    businessLinks: plan.impactedBusinessLinks ?? [],
    tags: plan.impactedTags ?? [],
  });
  const selected = new Set(plan.selectedScenarioIds ?? []);
  for (const id of implied) {
    if (!selected.has(id) && known.has(id)) {
      errors.push(`plan declares an impact that reaches ${id} but does not select it`);
    }
  }

  const { planDigest, ...rest } = plan;
  const expected = computePlanDigest(rest);
  if (planDigest !== expected) {
    errors.push(`planDigest mismatch: declared ${planDigest}, computed ${expected}`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * §M-E2E-REGISTRY — Mechanical baseline selection from impacted links and tags.
 *
 * Offered to the E2E tester as a starting point, never as the answer: the
 * tester still has to add scenarios that only the diff's risk profile reveals,
 * and the reviewers still have to judge whether the result is complete.
 */
export function baselineSelection(
  registry: E2ERegistry,
  impacted: { businessLinks: string[]; tags: string[] },
): string[] {
  const links = new Set(impacted.businessLinks);
  const tags = new Set(impacted.tags);
  const selected = registry.scenarios.filter(
    (scenario: E2EScenarioEntry) =>
      scenario.always_required ||
      scenario.business_links.some((link) => links.has(link)) ||
      scenario.tags.some((tag) => tags.has(tag)),
  );
  return selected.map((scenario) => scenario.scenario_id).sort();
}
