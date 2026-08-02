/**
 * §M-ADOPTION — The certified boundary a brownfield project has actually adopted.
 *
 * Implements §A-PROJECT-CONTRACT. Adoption is incremental — a large repository
 * cannot acquire a purpose for every symbol in one change — but "incremental"
 * without a recorded boundary is indistinguishable from "never finished". The
 * manifest names the dependency-closed roots that are certified today, and a
 * feature may change source only inside them; widening the boundary is its own
 * reviewed adoption change, because widening it is exactly the moment the
 * uncertified code enters the workflow's guarantees.
 *
 * A project with no manifest is treated as fully in scope, which is the correct
 * reading for greenfield: everything was written under the contract.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isSourceFile } from "./module-anchors.mjs";

/**
 * §M-ADOPTION — Where the manifest lives.
 *
 * Next to the QC contract rather than in `docs/`, because it is machine-read
 * policy that gates a run, not prose a human browses.
 */
export const ADOPTION_MANIFEST_PATH = ".quality/adoption-manifest.json";

/** §M-ADOPTION — The tracked record of which roots are certified. */
export interface AdoptionManifest {
  schema_version: 1;
  adopted_roots: string[];
  fully_adopted?: boolean;
  notes?: string;
}

/** §M-ADOPTION — Validation outcome carrying every problem found. */
export interface AdoptionValidation {
  ok: boolean;
  errors: string[];
}

/** §M-ADOPTION — Validate a parsed manifest without trusting any of its fields. */
export function validateAdoptionManifest(value: unknown): AdoptionValidation {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["adoption manifest must be a JSON object"] };
  }
  const manifest = value as Partial<AdoptionManifest>;
  if (manifest.schema_version !== 1) errors.push("schema_version must be 1");

  const roots = manifest.adopted_roots;
  if (!Array.isArray(roots) || roots.length === 0) {
    errors.push("adopted_roots must be a non-empty array of repository-relative directories");
  } else {
    roots.forEach((root, index) => {
      if (typeof root !== "string" || root === "") errors.push(`adopted_roots[${index}] must be a path`);
      else if (root.startsWith("/") || root.includes("..")) {
        errors.push(`adopted_roots[${index}] must be a relative path inside the repository`);
      }
    });
  }
  if (manifest.fully_adopted !== undefined && typeof manifest.fully_adopted !== "boolean") {
    errors.push("fully_adopted must be a boolean when present");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * §M-ADOPTION — Read the manifest, or nothing when the project declares none.
 *
 * Throws on a manifest that exists but cannot be trusted. Treating an
 * unparseable boundary as "no boundary" would turn a typo into a silent removal
 * of the very check the file is there to make.
 */
export function readAdoptionManifest(repoDir: string): AdoptionManifest | undefined {
  const path = join(repoDir, ADOPTION_MANIFEST_PATH);
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${ADOPTION_MANIFEST_PATH} is not valid JSON: ${(error as Error).message}`);
  }
  const validation = validateAdoptionManifest(parsed);
  if (!validation.ok) {
    throw new Error(`${ADOPTION_MANIFEST_PATH} is invalid: ${validation.errors.join("; ")}`);
  }
  return parsed as AdoptionManifest;
}

/** §M-ADOPTION — Whether one path lies inside one declared root. */
function within(path: string, root: string): boolean {
  const normalized = root.endsWith("/") ? root : `${root}/`;
  return path === root || path.startsWith(normalized);
}

/**
 * §M-ADOPTION — Source files a change touched outside the certified closure.
 *
 * Only source files are judged. Documentation, the knowledge layer and the
 * project's own contract must stay editable everywhere — a feature that may not
 * update `docs/knowledge` outside an adopted root could not keep the chain true,
 * and the chain is the thing adoption exists to establish.
 */
export function outsideClosure(changed: string[], manifest: AdoptionManifest | undefined): string[] {
  if (!manifest || manifest.fully_adopted === true) return [];
  return changed
    .filter((path) => isSourceFile(path))
    .filter((path) => !manifest.adopted_roots.some((root) => within(path, root)))
    .sort();
}
