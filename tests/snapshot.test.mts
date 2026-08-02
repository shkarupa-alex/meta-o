/**
 * §M-TEST-SNAPSHOT — Acceptance tests for content identity and the metadata guard.
 *
 * Covers the §00 and §30 acceptance lists: a rebase preserving the tree does
 * not invalidate attestations, changing the E2E catalog does, writing only
 * `last_run` does not, and a metadata commit that touches anything else is
 * rejected.
 *
 * Verifies §A-SNAPSHOT-ATTESTATION and §A-DIGEST-STABILITY.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { computeSnapshotDigest, verifyMetadataCommit } from "../dist/core/snapshot.mjs";
import { createTempRepo, sampleRegistry, seedProjectContract, type TempRepo } from "./helpers.mts";
import type { E2ERegistry } from "../dist/core/types.mjs";

/** §M-TEST-SNAPSHOT — Write a registry with one scenario carrying a `last_run`. */
function registryWithLastRun(
  digest: string,
  runId: string,
  specSha: string,
  provenanceCommit = "0".repeat(40),
): string {
  const registry = JSON.parse(sampleRegistry()) as E2ERegistry;
  registry.scenarios[0]!.last_run = {
    snapshot_digest: digest,
    provenance_commit: provenanceCommit,
    run_id: runId,
    spec_sha256: specSha,
    verified_at: "2026-07-24T18:20:00Z",
    status: "passed",
    environment: "local:docker-compose",
  };
  return `${JSON.stringify(registry, null, 2)}\n`;
}

/** §M-TEST-SNAPSHOT — Seed a repository with a contract and one commit. */
function seeded(): { repo: TempRepo; commit: string } {
  const repo = createTempRepo();
  seedProjectContract(repo);
  repo.write("src/app.py", '"""§M-APP — entry point."""\n');
  return { repo, commit: repo.commit("initial") };
}

test("the snapshot digest is stable across a rebase that preserves the tree", () => {
  const { repo, commit } = seeded();
  try {
    const before = computeSnapshotDigest(repo.dir, commit);

    repo.git(["commit", "--quiet", "--amend", "--allow-empty", "-m", "initial, reworded"]);
    const amended = repo.git(["rev-parse", "HEAD"]).trim();
    const after = computeSnapshotDigest(repo.dir, amended);

    assert.notEqual(amended, commit, "the commit OID must actually change");
    assert.equal(after.digest, before.digest, "identical trees must share one digest");
  } finally {
    repo.dispose();
  }
});

test("changing any tracked source file changes the digest", () => {
  const { repo, commit } = seeded();
  try {
    const before = computeSnapshotDigest(repo.dir, commit);
    repo.write("src/app.py", '"""§M-APP — entry point, revised."""\n');
    const after = computeSnapshotDigest(repo.dir, repo.commit("edit"));
    assert.notEqual(after.digest, before.digest);
  } finally {
    repo.dispose();
  }
});

test("writing only last_run leaves the digest unchanged", () => {
  const { repo, commit } = seeded();
  try {
    const before = computeSnapshotDigest(repo.dir, commit);
    repo.write(
      "docs/architecture/e2e.json",
      registryWithLastRun(before.digest, "run-1", "a".repeat(64)),
    );
    const after = computeSnapshotDigest(repo.dir, repo.commit("record verification"));
    assert.equal(after.digest, before.digest);
  } finally {
    repo.dispose();
  }
});

test("changing a catalog field of the registry does change the digest", () => {
  const { repo, commit } = seeded();
  try {
    const before = computeSnapshotDigest(repo.dir, commit);
    const registry = JSON.parse(sampleRegistry()) as E2ERegistry;
    registry.scenarios[1]!.tags = ["checkout", "payments"];
    repo.write("docs/architecture/e2e.json", `${JSON.stringify(registry, null, 2)}\n`);
    const after = computeSnapshotDigest(repo.dir, repo.commit("extend catalog"));
    assert.notEqual(after.digest, before.digest, "catalog fields stay attested");
  } finally {
    repo.dispose();
  }
});

test("reformatting the registry without changing its content keeps the digest", () => {
  const { repo, commit } = seeded();
  try {
    const before = computeSnapshotDigest(repo.dir, commit);
    const registry = JSON.parse(sampleRegistry()) as E2ERegistry;
    repo.write("docs/architecture/e2e.json", JSON.stringify(registry));
    const after = computeSnapshotDigest(repo.dir, repo.commit("reformat"));
    assert.equal(after.digest, before.digest, "canonical projection ignores formatting");
  } finally {
    repo.dispose();
  }
});

test("a receipt that names another commit is refused", () => {
  const { repo, commit } = seeded();
  try {
    const attested = computeSnapshotDigest(repo.dir, commit);
    // Everything else is right; only the provenance is copied from elsewhere,
    // which is what a receipt carried forward from a previous feature looks like.
    repo.write(
      "docs/architecture/e2e.json",
      registryWithLastRun(attested.digest, "run-1", "a".repeat(64), "f".repeat(40)),
    );
    const metadata = repo.commit("record verification");

    const report = verifyMetadataCommit({
      repoDir: repo.dir,
      attestedCommit: commit,
      metadataCommit: metadata,
      expectedRunId: "run-1",
      expectedSpecSha256: "a".repeat(64),
      expectedScenarioStatus: new Map([["E2E-SMOKE-01", "passed"]]),
    });

    assert.equal(report.ok, false);
    assert.ok(report.violations.some((problem) => problem.includes("records provenance")));
  } finally {
    repo.dispose();
  }
});

test("a metadata commit writing only last_run passes the guard", () => {
  const { repo, commit } = seeded();
  try {
    const attested = computeSnapshotDigest(repo.dir, commit);
    repo.write(
      "docs/architecture/e2e.json",
      registryWithLastRun(attested.digest, "run-1", "a".repeat(64), attested.provenanceCommit),
    );
    const metadata = repo.commit("record verification");

    const report = verifyMetadataCommit({
      repoDir: repo.dir,
      attestedCommit: commit,
      metadataCommit: metadata,
      expectedRunId: "run-1",
      expectedSpecSha256: "a".repeat(64),
      expectedScenarioStatus: new Map([["E2E-SMOKE-01", "passed"]]),
    });

    assert.deepEqual(report.violations, []);
    assert.equal(report.ok, true);
  } finally {
    repo.dispose();
  }
});

test("a metadata commit that also touches source is rejected", () => {
  const { repo, commit } = seeded();
  try {
    const attested = computeSnapshotDigest(repo.dir, commit);
    repo.write(
      "docs/architecture/e2e.json",
      registryWithLastRun(attested.digest, "run-1", "a".repeat(64)),
    );
    repo.write("src/app.py", '"""§M-APP — sneaky change."""\n');
    const metadata = repo.commit("record verification and edit code");

    const report = verifyMetadataCommit({
      repoDir: repo.dir,
      attestedCommit: commit,
      metadataCommit: metadata,
      expectedRunId: "run-1",
      expectedSpecSha256: "a".repeat(64),
      expectedScenarioStatus: new Map([["E2E-SMOKE-01", "passed"]]),
    });

    assert.equal(report.ok, false);
    assert.ok(report.violations.some((violation) => violation.includes("src/app.py")));
  } finally {
    repo.dispose();
  }
});

test("a metadata commit that edits the catalog is rejected", () => {
  const { repo, commit } = seeded();
  try {
    const attested = computeSnapshotDigest(repo.dir, commit);
    const registry = JSON.parse(
      registryWithLastRun(attested.digest, "run-1", "a".repeat(64)),
    ) as E2ERegistry;
    registry.scenarios[1]!.always_required = true;
    repo.write("docs/architecture/e2e.json", `${JSON.stringify(registry, null, 2)}\n`);
    const metadata = repo.commit("record verification and widen the catalog");

    const report = verifyMetadataCommit({
      repoDir: repo.dir,
      attestedCommit: commit,
      metadataCommit: metadata,
      expectedRunId: "run-1",
      expectedSpecSha256: "a".repeat(64),
      expectedScenarioStatus: new Map([["E2E-SMOKE-01", "passed"]]),
    });

    assert.equal(report.ok, false);
    assert.ok(report.violations.some((violation) => violation.includes("catalog")));
  } finally {
    repo.dispose();
  }
});

test("metadata recording a different run or spec is rejected", () => {
  const { repo, commit } = seeded();
  try {
    const attested = computeSnapshotDigest(repo.dir, commit);
    repo.write(
      "docs/architecture/e2e.json",
      registryWithLastRun(attested.digest, "someone-elses-run", "b".repeat(64)),
    );
    const metadata = repo.commit("record verification");

    const report = verifyMetadataCommit({
      repoDir: repo.dir,
      attestedCommit: commit,
      metadataCommit: metadata,
      expectedRunId: "run-1",
      expectedSpecSha256: "a".repeat(64),
      expectedScenarioStatus: new Map([["E2E-SMOKE-01", "passed"]]),
    });

    assert.equal(report.ok, false);
    assert.ok(report.violations.some((violation) => violation.includes("records run")));
    assert.ok(report.violations.some((violation) => violation.includes("spec digest")));
  } finally {
    repo.dispose();
  }
});

test("a malformed registry blocks digest computation instead of being skipped", () => {
  const { repo } = seeded();
  try {
    repo.write("docs/architecture/e2e.json", "{ not json");
    const commit = repo.commit("break the registry");
    assert.throws(() => computeSnapshotDigest(repo.dir, commit), /not valid JSON/);
  } finally {
    repo.dispose();
  }
});

test("a receipt for a scenario the run never executed is refused", () => {
  // `last_run` is excluded from the projection digest by design, and the
  // catalog comparison strips it for the same reason — so the only thing that
  // ever looked at a receipt was the loop over the scenarios this run actually
  // executed. A metadata commit could therefore ship, in a tracked file, a
  // receipt asserting that a scenario which was neither selected nor run had
  // passed against this snapshot, this run and this spec.
  const { repo, commit } = seeded();
  try {
    const attested = computeSnapshotDigest(repo.dir, commit);
    const registry = JSON.parse(sampleRegistry()) as E2ERegistry;
    const receipt = {
      snapshot_digest: attested.digest,
      provenance_commit: attested.provenanceCommit,
      run_id: "run-1",
      spec_sha256: "a".repeat(64),
      verified_at: "2026-07-24T18:20:00Z",
      status: "passed" as const,
      environment: "local:docker-compose",
    };
    registry.scenarios[0]!.last_run = receipt;
    registry.scenarios[1]!.last_run = { ...receipt };
    repo.write("docs/architecture/e2e.json", `${JSON.stringify(registry, null, 2)}\n`);
    const metadata = repo.commit("record one honest receipt and one invented one");

    const report = verifyMetadataCommit({
      repoDir: repo.dir,
      attestedCommit: commit,
      metadataCommit: metadata,
      expectedRunId: "run-1",
      expectedSpecSha256: "a".repeat(64),
      expectedScenarioStatus: new Map([[registry.scenarios[0]!.scenario_id, "passed"]]),
    });

    assert.equal(report.ok, false);
    assert.ok(
      report.violations.some((violation) =>
        violation.includes(`${registry.scenarios[1]!.scenario_id}, which this run neither`),
      ),
      report.violations.join("; "),
    );
  } finally {
    repo.dispose();
  }
});
