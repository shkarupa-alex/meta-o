/**
 * §M-TEST-HARDENING-FIXTURES — Shared fixtures for the hardening suites.
 *
 * Implements §A-SNAPSHOT-ATTESTATION. The hardening tests were one 2800-line
 * file, and `node --test` runs the tests inside a file in sequence: that one
 * file was 53 of the suite's 54 wall-clock seconds while twenty-three cores sat
 * idle. They are split into four files that run in parallel, and what all four
 * need lives here — chiefly a run state whose four gates attest one snapshot
 * and one plan, which is the shape every bypass test starts from and then
 * breaks in exactly one place.
 */

import type { SuiteReport } from "../dist/adapters/capability-suite.mjs";
import type { RunState } from "../dist/core/types.mjs";

/** §M-TEST-HARDENING-FIXTURES — A state whose four gates all attest one snapshot and plan. */
export function attestedState(overrides: Partial<RunState> = {}): RunState {
  const gate = {
    commitOid: "c1",
    snapshotDigest: "digest",
    planDigest: "plan",
    status: "passed" as const,
    completedAt: "2026-07-24T12:00:00Z",
  };
  return {
    schemaVersion: 1,
    runId: "r1",
    projectKey: "p1",
    phase: "FINALIZE_METADATA",
    stateVersion: 1,
    orchestratorGeneration: 1,
    spec: { kind: "tracked", locator: "spec.md", sha256: "s", disposition: "delete_after_sync" },
    specBlob: "/tmp/spec",
    baseRevision: "c0",
    modelSet: {} as RunState["modelSet"],
    sessions: {},
    sessionGeneration: {},
    decisions: [],
    candidateSnapshot: { digest: "digest", provenanceCommit: "c1", computedAt: "t" },
    e2ePlan: {
      schemaVersion: 1,
      commitOid: "c1",
      planDigest: "plan",
      selectedScenarioIds: ["E2E-SMOKE-01"],
      selectionRationale: "the canary always runs",
      impactedBusinessLinks: [],
      impactedTags: [],
    },
    e2ePlanSnapshotDigest: "digest",
    confirmations: { qc: gate, reviewerPrimary: gate, reviewerCrossVendor: gate, e2e: gate },
    updatedAt: "t",
    ...overrides,
  } as RunState;
}

/** §M-TEST-HARDENING-FIXTURES — A suite report carrying the given check grades. */
export function report(mode: "smoke" | "full", grades: Record<string, string>): SuiteReport {
  const checks = Object.entries(grades).map(([id, grade]) => ({
    id,
    grade: grade as SuiteReport["checks"][number]["grade"],
    detail: id,
    durationMs: 0,
    completionCritical: false,
  }));
  return { mode, backend: "herdr", checks, blocked: false, blockingReasons: [] };
}

/** §M-TEST-HARDENING-FIXTURES — A well-formed blocking finding, ready for stdin. */
export function blocker(id: string): string {
  return JSON.stringify([
    {
      id,
      severity: "blocker",
      classification: "defect",
      evidence: [{ kind: "file", reference: "src/app.py:1", detail: "the guard is missing" }],
      basis: { type: "architecture", reference: "§A-APP-01" },
      impact: "the endpoint accepts unauthenticated writes",
      recommendedFix: { approach: "check the token first", rationale: "nothing else does" },
    },
  ]);
}
