#!/usr/bin/env node
/**
 * §M-QC-E2E-GUARD — Prove a completion metadata commit touched only `last_run`.
 *
 * Implements §A-DIGEST-STABILITY. This is the one moment a tracked file may
 * change after the snapshot was attested, and the guard exists because the
 * temptation at that moment is real: the run is finished, everything passed,
 * and one more tiny edit would be so convenient. If anything beyond
 * `scenarios[*].last_run` moved, the four attestations no longer describe what
 * is in the tree.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** §M-QC-E2E-GUARD — The one tracked file a metadata commit is allowed to touch. */
const REGISTRY = "docs/architecture/e2e.json";

/** §M-QC-E2E-GUARD — Repository root, resolved from this script rather than the caller. */
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  encoding: "utf8",
}).trim();

/** §M-QC-E2E-GUARD — Run a Git command, returning undefined when it fails. */
function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  } catch {
    return undefined;
  }
}

/** §M-QC-E2E-GUARD — The catalog with `last_run` removed: the attested part. */
function projection(registry) {
  return {
    ...registry,
    scenarios: (registry.scenarios ?? []).map(({ last_run: _ignored, ...rest }) => rest),
  };
}

/**
 * §M-QC-E2E-GUARD — Serialise with sorted keys, so equality means equal content.
 *
 * Written out rather than leaning on a `JSON.stringify` replacer: passing
 * `Object.keys` as the replacer looks like "compare by keys" and in fact
 * returns `[]` for the root object, so both sides serialise to `"[]"` and the
 * comparison can never fail. A guard that cannot fail is worse than no guard,
 * because it is reported as passing.
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const problems = [];

const changed = git(["diff", "--name-only", "HEAD~1", "HEAD"]);
if (changed === undefined) {
  problems.push("cannot diff HEAD~1..HEAD; run this on the metadata commit");
} else {
  for (const path of changed.split("\n").filter(Boolean)) {
    if (path !== REGISTRY) problems.push(`the metadata commit also changed ${path}`);
  }

  const previous = git(["show", `HEAD~1:${REGISTRY}`]);
  if (previous === undefined) {
    problems.push(`cannot read ${REGISTRY} at HEAD~1`);
  } else {
    const before = canonical(projection(JSON.parse(previous)));
    const after = canonical(projection(JSON.parse(readFileSync(`${ROOT}/${REGISTRY}`, "utf8"))));
    if (before !== after) {
      problems.push("the metadata commit changed catalog fields, not only scenarios[*].last_run");
    }
  }
}

for (const problem of problems) process.stdout.write(`${problem}\n`);
process.stdout.write(
  problems.length ? `verify-e2e-metadata: ${problems.length} problem(s)\n` : "verify-e2e-metadata: ok\n",
);
process.exitCode = problems.length ? 1 : 0;
