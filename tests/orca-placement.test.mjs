/**
 * Execute the finite review-placement caller against a recording Orca surface.
 *
 * The fixture proves the caller algorithm required by §A-SESSION-01; it does not
 * claim that a real agent, backend build, or UI behaved this way.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { test } from "node:test";

const fixture = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "fixtures/recorded-surfaces/orca-placement.json"),
    "utf8",
  ),
);

const REVIEW_START_REASONS = new Set([
  "no_project_context",
  "inventory_unreadable",
  "inventory_partial",
  "registration_kind_unknown",
  "placement_unsupported",
  "remote_placement_unsupported",
  "candidate_unverifiable",
  "inventory_changed",
  "partial_start_failed",
  "cleanup_incomplete",
]);

function reviewStartHeader(reason, project, candidate) {
  assert.ok(REVIEW_START_REASONS.has(reason), `unknown REVIEW-START reason ${reason}`);
  return (
    `REVIEW-START version=1 status=unsupported reason=${reason} ` +
    `project=${project ?? "none"} candidate=${candidate ?? "none"}`
  );
}

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

function placementReason(surface) {
  if (!new Set(["git", "folder"]).has(surface.project.kind)) return "placement_unsupported";
  if (surface.project.kind === "git" && surface.project.sourceRepoIds.length !== 1) {
    return "placement_unsupported";
  }
  if (
    surface.currentContext?.projectId !== surface.project.id ||
    (surface.project.kind === "git" &&
      !surface.project.sourceRepoIds.includes(surface.currentContext?.repoId))
  ) {
    return "no_project_context";
  }
  const repository = surface.repositories.find(({ id }) => id === surface.currentContext.repoId);
  return surface.project.kind === "git" && repository?.kind !== "git"
    ? "remote_placement_unsupported"
    : null;
}

function reviewerInventoryReason(surface, candidate) {
  const children = surface.children ?? [];
  if (children.length !== 2) return "inventory_partial";
  if (
    children.some(
      (child) =>
        typeof child.id !== "string" ||
        typeof child.path !== "string" ||
        typeof child.canonicalPath !== "string" ||
        !child.canonicalPath.startsWith("/") ||
        posix.normalize(child.path) !== child.canonicalPath ||
        child.kind !== "worktree" ||
        child.projectId !== surface.project.id,
    )
  ) {
    return "inventory_unreadable";
  }
  if (children.some((child) => child.sha !== candidate || child.clean !== true)) {
    return "candidate_unverifiable";
  }
  if (
    children.some((child) => child.owner !== "candidate-run") ||
    new Set(children.map(({ id }) => id)).size !== 2 ||
    new Set(children.map(({ canonicalPath }) => canonicalPath)).size !== 2
  ) {
    return "inventory_changed";
  }
  return null;
}

function recordedReview(
  surface,
  {
    candidate = "0123456789abcdef0123456789abcdef01234567",
    failAt = null,
    cleanupFails = false,
  } = {},
) {
  const calls = [];
  const baselineRegistration = registrationSet(surface);
  const baselineResources = normalized(surface.resources);
  const resources = [...surface.resources];
  const owned = [];
  const finish = (result) => {
    const unsupported = result.status !== "started";
    return {
      ...result,
      header: unsupported
        ? reviewStartHeader(result.reason, surface.project?.id, surface.children?.[0]?.sha)
        : null,
      handover: result.status === "UNKNOWN" ? "needs_attention" : null,
      calls,
      registrationUnchanged: registrationSet(surface) === baselineRegistration,
      baselineResources,
      finalResources: normalized(resources),
    };
  };

  const unsupportedPlacement = placementReason(surface);
  if (unsupportedPlacement) {
    return finish({ status: "unsupported", reason: unsupportedPlacement, ownedDelta: [] });
  }

  const children = surface.children ?? [];
  const inventoryReason = reviewerInventoryReason(surface, candidate);
  if (inventoryReason) {
    return finish({ status: "unsupported", reason: inventoryReason, ownedDelta: [] });
  }
  if (surface.project.kind === "folder") {
    if (!children.every(({ existing }) => existing === true)) {
      return finish({ status: "unsupported", reason: "placement_unsupported", ownedDelta: [] });
    }
    return finish({ status: "started", reason: null, ownedDelta: [] });
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
        reason: cleanupFails ? "cleanup_incomplete" : "partial_start_failed",
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

test("folder placement accepts two existing clean exact-candidate reviewer worktrees", () => {
  const result = recordedReview(fixture.folder);
  assert.deepEqual(
    { status: result.status, reason: result.reason },
    { status: "started", reason: null },
  );
  assert.deepEqual(result.calls, []);
  assert.deepEqual(result.ownedDelta, []);
  assert.equal(result.registrationUnchanged, true);
  assert.equal(result.finalResources, result.baselineResources);
  assert.equal(result.header, null);
});

test("inventory proof uses the closed reason vocabulary before any reviewer task", () => {
  const variants = [
    [{ children: fixture.folder.children.slice(0, 1) }, "inventory_partial"],
    [
      { children: fixture.folder.children.map((child, index) => ({ ...child, clean: index > 0 })) },
      "candidate_unverifiable",
    ],
    [
      {
        children: [
          fixture.folder.children[0],
          {
            ...fixture.folder.children[1],
            path: "/recorded/x/../review-a",
            canonicalPath: "/recorded/review-a",
          },
        ],
      },
      "inventory_changed",
    ],
    [
      { children: fixture.folder.children.map((child) => ({ ...child, sha: "f".repeat(40) })) },
      "candidate_unverifiable",
    ],
    [
      { children: fixture.folder.children.map((child) => ({ ...child, path: null })) },
      "inventory_unreadable",
    ],
    [
      {
        children: fixture.folder.children.map((child, index) => ({
          ...child,
          owner: index === 0 ? "foreign" : child.owner,
        })),
      },
      "inventory_changed",
    ],
    [
      { children: [fixture.folder.children[0], { ...fixture.folder.children[0] }] },
      "inventory_changed",
    ],
    [
      {
        children: [
          fixture.folder.children[0],
          { ...fixture.folder.children[1], path: fixture.folder.children[0].path },
        ],
      },
      "inventory_unreadable",
    ],
  ];
  for (const [variant, reason] of variants) {
    const surface = { ...fixture.folder, ...variant };
    const result = recordedReview(surface);
    assert.equal(result.reason, reason);
    assert.deepEqual(result.calls, []);
    assert.match(result.header, new RegExp(`reason=${reason} `, "u"));
  }
  assert.throws(
    () => reviewStartHeader("reviewer_inventory_invalid", "project-folder", "f".repeat(40)),
    /unknown REVIEW-START reason/u,
  );
  const unsupported = recordedReview({
    ...fixture.folder,
    project: { ...fixture.folder.project, kind: "unknown" },
    children: fixture.folder.children.slice(0, 1),
  });
  assert.equal(unsupported.reason, "placement_unsupported");
});

test("missing context and remote-only placement are typed before any start", () => {
  for (const [surface, reason] of [
    [fixture.noContext, "no_project_context"],
    [fixture.remote, "remote_placement_unsupported"],
  ]) {
    const result = recordedReview(surface);
    assert.equal(result.status, "unsupported");
    assert.equal(result.reason, reason);
    assert.deepEqual(result.calls, []);
    assert.equal(result.registrationUnchanged, true);
    assert.match(result.header, new RegExp(`reason=${reason} `, "u"));
  }
});

test("Git new-child placement attributes exactly two isolated reviewer resources", () => {
  const result = recordedReview(fixture.git);
  assert.equal(result.status, "started");
  assert.equal(result.header, null);
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
  assert.equal(result.reason, "partial_start_failed");
  assert.equal(result.finalResources, result.baselineResources);
  assert.equal(result.registrationUnchanged, true);

  result = recordedReview(fixture.git, { failAt: "review-b", cleanupFails: true });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.reason, "cleanup_incomplete");
  assert.match(
    result.header,
    /^REVIEW-START version=1 status=unsupported reason=cleanup_incomplete /u,
  );
  assert.equal(result.handover, "needs_attention");
  assert.deepEqual(
    result.ownedDelta.map(({ id }) => id),
    ["review-a"],
  );
  assert.ok(JSON.parse(result.finalResources).some(({ id }) => id === "foreign-terminal"));
  assert.equal(result.registrationUnchanged, true);
});
