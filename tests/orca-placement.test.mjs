/**
 * Execute the finite review-placement caller against a recording Orca surface.
 *
 * The fixture proves the caller algorithm required by §A-REVIEW-04; it does not
 * claim that a real agent, backend build, or UI behaved this way.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const fixture = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "fixtures/recorded-surfaces/orca-placement.json"),
    "utf8",
  ),
);

function normalized(values) {
  return JSON.stringify(
    [...values].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  );
}

function registrationSet(surface) {
  return normalized([
    {
      id: surface.project.id,
      kind: surface.project.kind,
      sourceRepoIds: [...surface.project.sourceRepoIds].sort(),
    },
    ...surface.repositories.map(({ path, kind }) => ({ path, kind })),
  ]);
}

function recordedReview(surface, { failAt = null, cleanupFails = false } = {}) {
  const calls = [];
  const baselineRegistration = registrationSet(surface);
  const baselineResources = normalized(surface.resources);
  const resources = [...surface.resources];
  const owned = [];
  const finish = (result) => ({
    ...result,
    calls,
    registrationUnchanged: registrationSet(surface) === baselineRegistration,
    baselineResources,
    finalResources: normalized(resources),
  });

  if (surface.project.kind !== "git" || surface.project.sourceRepoIds.length !== 1) {
    return finish({
      status: "unsupported",
      reason: "placement_unsupported",
      ownedDelta: [],
    });
  }
  if (
    surface.currentContext?.projectId !== surface.project.id ||
    !surface.project.sourceRepoIds.includes(surface.currentContext?.repoId)
  ) {
    return finish({ status: "unsupported", reason: "no_current_context", ownedDelta: [] });
  }
  const repository = surface.repositories.find(({ id }) => id === surface.currentContext.repoId);
  if (repository?.kind !== "git") {
    return finish({ status: "unsupported", reason: "remote_unsupported", ownedDelta: [] });
  }

  for (const child of surface.children) {
    calls.push({ operation: "orca worktree new-child", projectId: surface.project.id });
    if (failAt === child.id) {
      for (const resource of owned.toReversed()) {
        calls.push({ operation: "orca worktree delete", id: resource.id });
        if (!cleanupFails) resources.splice(resources.indexOf(resource), 1);
      }
      return finish({
        status: cleanupFails ? "UNKNOWN" : "unsupported",
        reason: cleanupFails ? "cleanup_incomplete" : "partial_start_cleaned",
        ownedDelta: resources.filter(({ owner }) => owner === "candidate-run"),
      });
    }
    assert.equal(child.projectId, surface.project.id);
    assert.ok(surface.project.sourceRepoIds.includes(child.repoId));
    resources.push(child);
    owned.push(child);
  }
  return finish({ status: "started", reason: null, ownedDelta: owned });
}

test("folder placement fails before pair artifacts or registry calls", () => {
  const result = recordedReview(fixture.folder);
  assert.deepEqual(
    { status: result.status, reason: result.reason },
    { status: "unsupported", reason: "placement_unsupported" },
  );
  assert.deepEqual(result.calls, []);
  assert.deepEqual(result.ownedDelta, []);
  assert.equal(result.registrationUnchanged, true);
  assert.equal(result.finalResources, result.baselineResources);
});

test("missing context and remote-only placement are typed before any start", () => {
  for (const [surface, reason] of [
    [fixture.noContext, "no_current_context"],
    [fixture.remote, "remote_unsupported"],
  ]) {
    const result = recordedReview(surface);
    assert.equal(result.status, "unsupported");
    assert.equal(result.reason, reason);
    assert.deepEqual(result.calls, []);
    assert.equal(result.registrationUnchanged, true);
  }
});

test("Git new-child placement attributes exactly two isolated reviewer resources", () => {
  const result = recordedReview(fixture.git);
  assert.equal(result.status, "started");
  assert.equal(result.registrationUnchanged, true);
  assert.equal(result.ownedDelta.length, 2);
  assert.deepEqual(
    result.calls.map(({ operation }) => operation),
    ["orca worktree new-child", "orca worktree new-child"],
  );
  assert.equal(
    result.calls.some(({ operation }) =>
      new Set(["orca repo add", "git worktree add"]).has(operation),
    ),
    false,
  );
});

test("partial start removes only exact-owned resources and types incomplete cleanup", () => {
  let result = recordedReview(fixture.git, { failAt: "review-b" });
  assert.equal(result.reason, "partial_start_cleaned");
  assert.equal(result.finalResources, result.baselineResources);
  assert.equal(result.registrationUnchanged, true);

  result = recordedReview(fixture.git, { failAt: "review-b", cleanupFails: true });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.reason, "cleanup_incomplete");
  assert.deepEqual(
    result.ownedDelta.map(({ id }) => id),
    ["review-a"],
  );
  assert.ok(JSON.parse(result.finalResources).some(({ id }) => id === "foreign-terminal"));
  assert.equal(result.registrationUnchanged, true);
});
