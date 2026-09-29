/**
 * Own the embedded eval corpus: the exact skill inventory, the three bounded
 * cases each skill carries, and the rule that a case's contracts appear in its
 * own oracles.
 *
 * The inventory is a literal so that a skill added to `src/skills/` without
 * cases, or cases left behind by a removed skill, fail the corpus instead of
 * shrinking the matrix silently.
 *
 * Implements §A-EVAL-01.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertString } from "./skill-eval-runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = "meta-o.skill-eval-cases.v2";
export const EXPECTED_SKILLS = [
  "find-reuse",
  "mo-convergence",
  "mo-debug",
  "mo-e2e",
  "mo-orchestrate-orca",
  "mo-review-orca",
  "mo-reviewer",
  "mo-setup",
  "mo-watchdog",
  "senior-jsts",
  "senior-python",
];
const EXPECTED_CLASSES = ["degraded", "forbidden", "positive"];

function validateCase(item, expectedSkill) {
  assertString(item.id, `${expectedSkill}: case id`);
  if (item.id !== `${expectedSkill}.${item.class}`) {
    throw new Error(`${expectedSkill}: case ${item.id} does not match its class`);
  }
  assertString(item.scenario, `${item.id}: scenario`);
  if (!Array.isArray(item.contracts) || item.contracts.length === 0) {
    throw new Error(`${item.id}: contracts needs at least one architecture/business id`);
  }
  for (const contract of item.contracts) {
    if (!/^§[AB]-[A-Z][A-Z0-9-]*-\d{2}$/u.test(contract)) {
      throw new Error(`${item.id}: invalid contract id ${contract}`);
    }
  }
  for (const field of ["must", "mustNot"]) {
    if (!Array.isArray(item[field]) || item[field].length === 0) {
      throw new Error(`${item.id}: ${field} needs at least one oracle`);
    }
    item[field].forEach((entry, index) => assertString(entry, `${item.id}: ${field}[${index}]`));
  }
  const oracleText = [...item.must, ...item.mustNot].join(" ");
  for (const contract of item.contracts) {
    if (!oracleText.includes(contract)) {
      throw new Error(`${item.id}: contract ${contract} has no same-case oracle`);
    }
  }
}

function validateCaseSet(document, expectedSkill) {
  if (!Array.isArray(document.cases) || document.cases.length !== 3) {
    throw new Error(`${expectedSkill}: exactly three bounded cases are required`);
  }
  document.cases.forEach((item) => validateCase(item, expectedSkill));
  const ids = document.cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error(`${expectedSkill}: duplicate case id`);
  const classes = document.cases.map(({ class: value }) => value).sort();
  if (JSON.stringify(classes) !== JSON.stringify(EXPECTED_CLASSES)) {
    throw new Error(`${expectedSkill}: needs positive, forbidden and degraded cases`);
  }
}

function validateEvalPolicy(document, expectedSkill) {
  if (!new Set(["advisory", "critical"]).has(document.policy)) {
    throw new Error(`${expectedSkill}: invalid ownership policy`);
  }
}

function validateCaseFile(document, expectedSkill) {
  if (document.contract !== CONTRACT) throw new Error(`${expectedSkill}: wrong cases contract`);
  if (document.skill !== expectedSkill)
    throw new Error(`${expectedSkill}: skill identity mismatch`);
  assertString(document.owner, `${expectedSkill}: owner`);
  if (!new Set(["advisory", "critical"]).has(document.policy)) {
    throw new Error(`${expectedSkill}: invalid policy`);
  }
  validateCaseSet(document, expectedSkill);
  validateEvalPolicy(document, expectedSkill);
  return document;
}

/** §A-EVAL-01 loads the complete embedded corpus and rejects missing skill owners or cases. */
export function loadCorpus(root = ROOT) {
  const sourceRoot = join(root, "src", "skills");
  const discovered = readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(discovered) !== JSON.stringify(EXPECTED_SKILLS)) {
    throw new Error(`skill inventory mismatch: ${discovered.join(", ")}`);
  }
  return new Map(
    EXPECTED_SKILLS.map((skill) => {
      const path = join(sourceRoot, skill, "evals", "cases.json");
      return [skill, validateCaseFile(JSON.parse(readFileSync(path, "utf8")), skill)];
    }),
  );
}
