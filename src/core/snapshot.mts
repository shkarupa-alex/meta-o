/**
 * §M-SNAPSHOT — Content identity of a candidate, and the guard protecting it.
 *
 * Implements §A-SNAPSHOT-ATTESTATION. Four independent gates must be able to
 * agree that they examined *the same content*, across rebases, squashes and
 * separate checkouts. A commit SHA cannot express that; this digest can.
 *
 * Normative algorithm — any conforming implementation must produce the same
 * value:
 *
 * ```text
 * for each tracked entry of the commit, sorted ascending by UTF-8 path bytes:
 *     identity = git blob OID
 *     if path == "docs/architecture/e2e.json":
 *         identity = "projection:" + sha256hex(canonicalJson(registry without
 *                                              scenarios[*].last_run))
 *     line = mode + " " + identity + " " + path + "\n"
 * snapshot_digest = sha256hex(concatenation of all lines)
 * ```
 *
 * The single field-level exclusion is what stops the registry from being
 * self-referential: writing a verification result must not change the digest
 * that result attests. Every selection-critical catalog field stays inside.
 */

import { canonicalize, type JsonValue } from "./canonical-json.mjs";
import { sha256Hex } from "./hash.mjs";
import { listTree, readBlob, resolveCommit, changedPaths } from "./git.mjs";
import type { E2ERegistry, E2EScenarioEntry } from "./types.mjs";
import { validateRegistry } from "./e2e-registry.mjs";

/** §M-SNAPSHOT — Repository-relative path of the machine-readable E2E registry. */
export const E2E_REGISTRY_PATH = "docs/architecture/e2e.json";

/**
 * §M-SNAPSHOT — Strip volatile verification results from a registry.
 *
 * Returns a plain JSON value rather than a typed registry because its only
 * purpose is to be canonicalised and hashed.
 */
export function registryProjection(registry: E2ERegistry): JsonValue {
  const scenarios = registry.scenarios.map((scenario) => {
    const copy: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(scenario)) {
      if (key === "last_run") continue;
      copy[key] = value as JsonValue;
    }
    return copy as JsonValue;
  });
  return { schema_version: registry.schema_version, scenarios } as unknown as JsonValue;
}

/** §M-SNAPSHOT — Digest of the registry projection, used in place of its blob OID. */
export function registryProjectionIdentity(registryBytes: Buffer): string {
  let parsed: E2ERegistry;
  try {
    parsed = JSON.parse(registryBytes.toString("utf8")) as E2ERegistry;
  } catch (error) {
    throw new Error(`${E2E_REGISTRY_PATH} is not valid JSON: ${(error as Error).message}`);
  }
  return `projection:${sha256Hex(canonicalize(registryProjection(parsed)))}`;
}

/** §M-SNAPSHOT — Compare two paths by their UTF-8 bytes, not UTF-16 code units. */
function comparePathBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** §M-SNAPSHOT — A digest together with the commit it was computed from. */
export interface SnapshotComputation {
  digest: string;
  provenanceCommit: string;
  entryCount: number;
}

/**
 * §M-SNAPSHOT — Compute the snapshot digest of a commit.
 *
 * Reads the registry blob from Git rather than from the working tree, so the
 * digest describes the commit even when the caller's checkout has drifted.
 */
export function computeSnapshotDigest(repoDir: string, revision: string): SnapshotComputation {
  const commit = resolveCommit(revision, repoDir);
  const entries = listTree(commit, repoDir).sort((a, b) => comparePathBytes(a.path, b.path));
  const lines: string[] = [];
  for (const entry of entries) {
    const identity =
      entry.path === E2E_REGISTRY_PATH && entry.type === "blob"
        ? registryProjectionIdentity(readBlob(entry.oid, repoDir))
        : entry.oid;
    lines.push(`${entry.mode} ${identity} ${entry.path}\n`);
  }
  return {
    digest: sha256Hex(lines.join("")),
    provenanceCommit: commit,
    entryCount: entries.length,
  };
}

/** §M-SNAPSHOT — Outcome of checking a metadata-only commit. */
export interface MetadataGuardResult {
  ok: boolean;
  violations: string[];
  attestedDigest: string;
  metadataDigest: string;
}

/** §M-SNAPSHOT — Everything the guard needs to judge a metadata commit. */
export interface MetadataGuardInput {
  repoDir: string;
  attestedCommit: string;
  metadataCommit: string;
  expectedRunId: string;
  expectedSpecSha256: string;
  expectedScenarioStatus: Map<string, "passed" | "failed" | "blocked">;
  /**
   * Where the recorded E2E set actually ran. `last_run.environment` was written
   * by the executor and compared against nothing, so the receipt could claim a
   * staging run for a set executed against production — the one environment
   * §20 forbids without the user's say-so.
   */
  expectedEnvironment?: string;
}

/** §M-SNAPSHOT — Read and parse the registry as it exists in one commit. */
function readRegistryAt(repoDir: string, commit: string): E2ERegistry | undefined {
  const entry = listTree(commit, repoDir).find((item) => item.path === E2E_REGISTRY_PATH);
  if (!entry) return undefined;
  return JSON.parse(readBlob(entry.oid, repoDir).toString("utf8")) as E2ERegistry;
}

/** §M-SNAPSHOT — Catalog fields that must survive a metadata commit unchanged. */
function catalogOf(scenario: E2EScenarioEntry): string {
  return canonicalize({
    scenario_id: scenario.scenario_id,
    scenario_ref: scenario.scenario_ref,
    business_links: [...scenario.business_links],
    always_required: scenario.always_required,
    tags: [...scenario.tags],
  } as unknown as JsonValue);
}

/**
 * §M-SNAPSHOT — Receipts the run had no business writing.
 *
 * The main loop proves the receipts of the scenarios this run executed, and
 * nothing looked at the rest. `last_run` is excluded from the projection digest
 * by design and `catalogOf` strips it for the same reason, so a metadata commit
 * could ship — in a tracked file — a receipt claiming that a scenario which was
 * neither selected nor run had passed against this snapshot, this run and this
 * spec.
 */
function untouchedReceiptViolations(
  before: E2ERegistry | undefined,
  after: E2ERegistry,
  input: MetadataGuardInput,
): string[] {
  const executed = new Set(input.expectedScenarioStatus.keys());
  const previous = new Map(
    (before?.scenarios ?? []).map((item) => [item.scenario_id, JSON.stringify(item.last_run ?? null)]),
  );
  const violations: string[] = [];
  for (const scenario of after.scenarios) {
    if (executed.has(scenario.scenario_id)) continue;
    if (JSON.stringify(scenario.last_run ?? null) === (previous.get(scenario.scenario_id) ?? "null")) {
      continue;
    }
    violations.push(
      `metadata commit wrote a last_run for ${scenario.scenario_id}, which this run neither ` +
        "selected nor executed",
    );
  }
  return violations;
}

/**
 * §M-SNAPSHOT — Check one scenario's `last_run` receipt against what was verified.
 *
 * A receipt is only evidence if it says *which* content, *which* run, *which*
 * spec, *which* commit and *when*. Drop any one of those and a `last_run` block
 * copied forward from an earlier feature satisfies every remaining check.
 */
function receiptViolations(
  scenarioId: string,
  scenario: E2EScenarioEntry | undefined,
  status: "passed" | "failed" | "blocked",
  input: MetadataGuardInput,
  attested: SnapshotComputation,
): string[] {
  if (!scenario) return [`verified scenario ${scenarioId} is absent from the registry`];
  const lastRun = scenario.last_run;
  if (!lastRun) return [`scenario ${scenarioId} has no last_run after verification`];

  const violations: string[] = [];
  if (lastRun.status !== status) {
    violations.push(`scenario ${scenarioId} recorded status ${lastRun.status}, expected ${status}`);
  }
  if (lastRun.snapshot_digest !== attested.digest) {
    violations.push(`scenario ${scenarioId} records a different snapshot digest`);
  }
  if (lastRun.run_id !== input.expectedRunId) {
    violations.push(`scenario ${scenarioId} records run ${lastRun.run_id}`);
  }
  if (lastRun.spec_sha256 !== input.expectedSpecSha256) {
    violations.push(`scenario ${scenarioId} records a different spec digest`);
  }
  if (lastRun.provenance_commit !== attested.provenanceCommit) {
    violations.push(
      `scenario ${scenarioId} records provenance ${lastRun.provenance_commit}, ` +
        `expected the attested commit ${attested.provenanceCommit}`,
    );
  }
  if (!Number.isFinite(Date.parse(lastRun.verified_at))) {
    violations.push(`scenario ${scenarioId} records an unparseable verified_at`);
  }
  if (input.expectedEnvironment !== undefined && lastRun.environment !== input.expectedEnvironment) {
    violations.push(
      `scenario ${scenarioId} records environment ${lastRun.environment}, ` +
        `but the recorded E2E result ran against ${input.expectedEnvironment}`,
    );
  }
  return violations;
}

/**
 * §M-SNAPSHOT — Prove that a completion metadata commit changed nothing but `last_run`.
 *
 * Runs after the four gates have already passed, at the one moment when the
 * executor is allowed to touch a tracked file without re-attesting. Every check
 * here exists because the alternative is a run that claims verification of
 * content it quietly edited afterwards.
 */
export function verifyMetadataCommit(input: MetadataGuardInput): MetadataGuardResult {
  const violations: string[] = [];
  const attested = computeSnapshotDigest(input.repoDir, input.attestedCommit);
  const metadata = computeSnapshotDigest(input.repoDir, input.metadataCommit);

  const touched = changedPaths(input.attestedCommit, input.metadataCommit, input.repoDir);
  for (const path of touched) {
    if (path !== E2E_REGISTRY_PATH) violations.push(`metadata commit changed ${path}`);
  }

  if (attested.digest !== metadata.digest) {
    violations.push(
      `projection digest changed: attested ${attested.digest}, metadata ${metadata.digest}`,
    );
  }

  const before = readRegistryAt(input.repoDir, input.attestedCommit);
  const after = readRegistryAt(input.repoDir, input.metadataCommit);
  if (!after) {
    violations.push(`${E2E_REGISTRY_PATH} is missing from the metadata commit`);
    return {
      ok: false,
      violations,
      attestedDigest: attested.digest,
      metadataDigest: metadata.digest,
    };
  }

  // The registry that ships must still be a valid registry. The projection
  // digest deliberately excludes `last_run`, so anything smuggled inside it is
  // invisible to every later gate — and §30 names exactly what tends to be
  // smuggled: screenshots, raw logs, model reasoning. Re-validating the whole
  // document is the only check that sees them.
  const registryValidation = validateRegistry(after as unknown);
  for (const error of registryValidation.errors) {
    violations.push(`${E2E_REGISTRY_PATH} in the metadata commit is invalid: ${error}`);
  }

  const beforeCatalog = new Map((before?.scenarios ?? []).map((s) => [s.scenario_id, catalogOf(s)]));
  const afterCatalog = new Map(after.scenarios.map((s) => [s.scenario_id, catalogOf(s)]));
  for (const [id, catalog] of afterCatalog) {
    const previous = beforeCatalog.get(id);
    if (previous === undefined) violations.push(`metadata commit added scenario ${id}`);
    else if (previous !== catalog) violations.push(`metadata commit changed catalog of ${id}`);
  }
  for (const id of beforeCatalog.keys()) {
    if (!afterCatalog.has(id)) violations.push(`metadata commit removed scenario ${id}`);
  }

  for (const [scenarioId, status] of input.expectedScenarioStatus) {
    const scenario = after.scenarios.find((item) => item.scenario_id === scenarioId);
    violations.push(...receiptViolations(scenarioId, scenario, status, input, attested));
  }

  violations.push(...untouchedReceiptViolations(before, after, input));

  return {
    ok: violations.length === 0,
    violations,
    attestedDigest: attested.digest,
    metadataDigest: metadata.digest,
  };
}
