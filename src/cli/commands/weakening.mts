/**
 * §M-CLI-WEAKENING — Detect relaxation of the QC contract since the base revision.
 *
 * Implements §A-AUTHORITATIVE-QC.
 *
 * Split from the other gate commands because it answers a different question.
 * They ask "did this candidate pass"; this one asks "did passing get easier",
 * and the material it reads — the gate manifest, the `[tool.meta_o.*]`
 * thresholds, the ratchet baselines — belongs to none of them.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../../core/git.mjs";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { readState } from "../../core/state-store.mjs";
import { detectWeakening, type QcWeakening } from "../../core/qc.mjs";
import type { QcManifest } from "../../core/types.mjs";
import {
  detectBaselineWeakening,
  detectPolicyWeakening,
  parseMetaOPolicy,
  type PolicyWeakening,
} from "../../core/policy.mjs";
import { emit, fail, optionalFlag, type ParsedArgs } from "../args.mjs";

/** §M-CLI-WEAKENING — Resolve the repository this command applies to. */
function repoOf(args: ParsedArgs): { repoDir: string; projectKey: string } {
  const identity = resolveProjectIdentity(optionalFlag(args, "cwd") ?? process.cwd());
  return { repoDir: identity.canonicalPath, projectKey: identity.projectKey };
}

/** §M-CLI-WEAKENING — Read a repository JSON file or fail with its path. */
function readRepoJson<T>(repoDir: string, relative: string): T {
  const path = join(repoDir, relative);
  if (!existsSync(path)) fail("missing_file", `${relative} is absent`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    fail("invalid_json", `${relative} is not valid JSON: ${(error as Error).message}`);
  }
}

/** §M-CLI-WEAKENING — Read a repository file at one revision, or nothing if it did not exist. */
function readAt(repoDir: string, revision: string, relative: string): string | undefined {
  try {
    return git(["show", `${revision}:${relative}`], repoDir);
  } catch {
    return undefined;
  }
}

/** §M-CLI-WEAKENING — Read a repository file from the working tree, or nothing if absent. */
function readNow(repoDir: string, relative: string): string | undefined {
  const path = join(repoDir, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** §M-CLI-WEAKENING — Ratchet baselines compared alongside the thresholds that produced them. */
const BASELINE_FILES = [
  ".quality/code-health-baseline.json",
  ".quality/import-graph-baseline.json",
];

/**
 * §M-CLI-WEAKENING — Compare the configured thresholds and frozen baselines across revisions.
 *
 * Separate from the manifest comparison because it fails differently: an
 * unreadable `[tool.meta_o.*]` key is not a weakening, but it *is* a hole in
 * this check, and reporting it as a parse error keeps the answer honest instead
 * of quietly narrow.
 */
function policyWeakenings(
  repoDir: string,
  baseRevision: string,
): { weakenings: PolicyWeakening[]; notes: string[]; blindSpots: string[] } {
  const weakenings: PolicyWeakening[] = [];
  const notes: string[] = [];
  const blindSpots: string[] = [];

  const beforeToml = readAt(repoDir, baseRevision, "pyproject.toml");
  const afterToml = readNow(repoDir, "pyproject.toml");
  if (beforeToml !== undefined && afterToml === undefined) {
    weakenings.push({
      source: "pyproject.toml",
      key: "*",
      kind: "section_removed",
      detail: "pyproject.toml was deleted, so every gate falls back to its built-in defaults",
    });
  } else if (beforeToml === undefined && afterToml !== undefined) {
    notes.push(`pyproject.toml did not exist at ${baseRevision}; there is no policy to compare`);
  } else if (beforeToml !== undefined && afterToml !== undefined) {
    const before = parseMetaOPolicy(beforeToml);
    const after = parseMetaOPolicy(afterToml);
    for (const error of [...before.errors, ...after.errors]) {
      blindSpots.push(`pyproject.toml could not be fully read: ${error}`);
    }
    weakenings.push(...detectPolicyWeakening(before, after));
  }

  for (const relative of BASELINE_FILES) {
    const before = readAt(repoDir, baseRevision, relative);
    const after = readNow(repoDir, relative);
    if (before === undefined && after === undefined) continue;
    if (before === undefined) {
      notes.push(`${relative} did not exist at ${baseRevision}; the first baseline is not a weakening`);
      continue;
    }
    if (after === undefined) {
      // Deleting a baseline is not the same as having none. The ratchet lets a
      // project record the debt it starts with exactly once; removing the file
      // restores that exception, so the next `--write-baseline` may freeze
      // whatever the code has grown into.
      weakenings.push({
        source: relative,
        key: "*",
        kind: "changed",
        detail: `${relative} was deleted, which makes the next freeze a first baseline again`,
      });
      continue;
    }
    try {
      weakenings.push(...detectBaselineWeakening(relative, JSON.parse(before), JSON.parse(after)));
    } catch (error) {
      blindSpots.push(`${relative} could not be compared: ${(error as Error).message}`);
    }
  }

  return { weakenings, notes, blindSpots };
}

/**
 * §M-CLI-WEAKENING — Detect any weakening of the QC contract since the base revision.
 *
 * The executor is the party this gate constrains, so an unexplained relaxation
 * must reach the user rather than be applied by the party it benefits. "The
 * contract" is more than the list of gates: it is also the thresholds they
 * enforce and the debt they were allowed to forgive, because a gate whose limit
 * moved to meet the code has stopped being a limit.
 */
export function commandQcWeakening(args: ParsedArgs): void {
  const { repoDir, projectKey } = repoOf(args);
  const runId = optionalFlag(args, "run-id");
  const state = runId ? readState(projectKey, runId) : undefined;
  const baseRevision = optionalFlag(args, "base-rev") ?? state?.baseRevision;
  if (!baseRevision) fail("no_base_revision", "--base-rev or --run-id is required");

  const policy = policyWeakenings(repoDir, baseRevision);
  const notes = [...policy.notes];
  const blindSpots = [...policy.blindSpots];
  const weakenings: (QcWeakening | PolicyWeakening)[] = [...policy.weakenings];

  const baseManifest = readAt(repoDir, baseRevision, ".quality/qc-manifest.json");
  if (baseManifest === undefined) {
    notes.push(`no QC manifest existed at ${baseRevision}; the gate list has nothing to compare`);
  } else {
    const current = readRepoJson<QcManifest>(repoDir, ".quality/qc-manifest.json");
    weakenings.push(...detectWeakening(JSON.parse(baseManifest) as QcManifest, current));
  }

  // A blind spot decides like a weakening. A key this parser cannot read is a
  // key whose relaxation it cannot see, so answering "no weakening" would be a
  // claim about ground it never covered — and `max_nesting_depth = 0x40` is a
  // perfectly ordinary way to arrive there by accident.
  const requiresUserDecision = weakenings.length > 0 || blindSpots.length > 0;
  emit({ baseRevision, weakenings, notes, blindSpots, requiresUserDecision });
  if (requiresUserDecision) process.exitCode = 1;
}
