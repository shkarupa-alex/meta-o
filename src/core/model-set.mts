/**
 * §M-MODEL-SET — Invariants that keep the second review genuinely independent.
 *
 * Implements §A-CROSS-VENDOR-REVIEW. The methodology's core bet is that two
 * reviewers fail differently; that only holds if one of them comes from a
 * different model developer. Vendor and family therefore cannot be inferred
 * from a CLI route or an alias, and this module refuses to guess them.
 */

import type { ModelRef, ModelSet } from "./types.mjs";

/** §M-MODEL-SET — CLI routes a model may be reached through. */
const ROUTES = new Set(["claude", "codex", "opencode"]);

/** §M-MODEL-SET — Validation outcome carrying every problem found. */
export interface ModelSetValidation {
  ok: boolean;
  errors: string[];
}

/** §M-MODEL-SET — Validate a single model reference. */
export function validateModelRef(label: string, model: ModelRef | undefined): string[] {
  const errors: string[] = [];
  if (!model) return [`${label} is missing`];
  if (!ROUTES.has(model.route)) errors.push(`${label}.route must be claude|codex|opencode`);
  if (!model.vendor) errors.push(`${label}.vendor must name the model developer`);
  if (!model.family) errors.push(`${label}.family must name the provider-native base family`);
  if (!model.model) errors.push(`${label}.model must name a concrete model`);
  return errors;
}

/**
 * §M-MODEL-SET — Validate the four working models and their relationships.
 *
 * The same-family primary reviewer is as deliberate as the cross-vendor one: it
 * keeps a reviewer that shares the executor's blind spots in the loop, so the
 * gate does not become a single-vendor opinion with a rubber stamp.
 */
export function validateModelSet(set: ModelSet | undefined): ModelSetValidation {
  if (!set) return { ok: false, errors: ["model set is missing"] };
  const errors: string[] = [
    ...validateModelRef("executor", set.executor),
    ...validateModelRef("reviewerPrimary", set.reviewerPrimary),
    ...validateModelRef("reviewerCrossVendor", set.reviewerCrossVendor),
    ...validateModelRef("e2eTester", set.e2eTester),
  ];
  if (errors.length > 0) return { ok: false, errors };

  if (set.reviewerPrimary.vendor !== set.executor.vendor) {
    errors.push(
      `reviewerPrimary.vendor (${set.reviewerPrimary.vendor}) must equal executor.vendor (${set.executor.vendor})`,
    );
  }
  if (set.reviewerPrimary.family !== set.executor.family) {
    errors.push(
      `reviewerPrimary.family (${set.reviewerPrimary.family}) must equal executor.family (${set.executor.family})`,
    );
  }
  if (set.reviewerCrossVendor.vendor === set.executor.vendor) {
    errors.push(
      `reviewerCrossVendor.vendor must differ from executor.vendor (${set.executor.vendor})`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/** §M-MODEL-SET — One-line human description of a model, used in confirmations. */
export function describeModel(model: ModelRef): string {
  const effort = model.effort ? ` effort=${model.effort}` : "";
  return `${model.model} (${model.vendor}/${model.family} via ${model.route}${effort})`;
}

/**
 * §M-MODEL-SET — Render the set for the mandatory "these ones?" confirmation.
 *
 * Shows vendor and family explicitly because that is exactly the property the
 * user is being asked to vouch for when an alias's provenance is unclear.
 */
export function describeModelSet(set: ModelSet): string {
  return [
    `executor:            ${describeModel(set.executor)}`,
    `reviewerPrimary:     ${describeModel(set.reviewerPrimary)}`,
    `reviewerCrossVendor: ${describeModel(set.reviewerCrossVendor)}`,
    `e2eTester:           ${describeModel(set.e2eTester)}`,
  ].join("\n");
}
