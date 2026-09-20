/**
 * Execute the finite review-placement caller against a recording Orca surface.
 *
 * The fixture proves the caller algorithm required by §A-SESSION-01; it does not
 * claim that a real agent, backend build, or UI behaved this way.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

function recordedRealPath(child) {
  if (child.realPathProvenance !== `realpath -- ${child.path}`) {
    throw new Error("realpath provenance mismatch");
  }
  if (typeof child.realPath !== "string" || !child.realPath.startsWith("/")) {
    throw new Error("recorded realpath output is unreadable");
  }
  return child.realPath;
}

function filesystemRealPath(child) {
  const actual = realpathSync.native(child.path);
  if (child.realPathProvenance !== `realpath -- ${child.path}` || child.realPath !== actual) {
    throw new Error("realpath observation mismatch");
  }
  return actual;
}

function reviewerInventoryReason(surface, candidate, resolveRealPath) {
  const children = surface.children ?? [];
  if (children.length !== 2) return "inventory_partial";
  if (
    children.some(
      (child) =>
        typeof child.id !== "string" ||
        typeof child.path !== "string" ||
        child.kind !== "worktree" ||
        child.projectId !== surface.project.id,
    )
  ) {
    return "inventory_unreadable";
  }
  if (children.some((child) => child.sha !== candidate || child.clean !== true)) {
    return "candidate_unverifiable";
  }
  let realPaths;
  try {
    realPaths = children.map(resolveRealPath);
  } catch {
    return "inventory_unreadable";
  }
  if (realPaths.some((path) => typeof path !== "string" || !path.startsWith("/"))) {
    return "inventory_unreadable";
  }
  if (
    children.some((child) => child.owner !== "candidate-run") ||
    new Set(children.map(({ id }) => id)).size !== 2 ||
    new Set(realPaths).size !== 2
  ) {
    return "inventory_changed";
  }
  return null;
}

/**
 * What `orca worktree create` produced, if it produced an isolated worktree.
 *
 * On a folder project the call can answer `ok:true` with the main checkout's
 * own path and an empty head. That reads like a fresh isolated worktree and is
 * not one, so acceptance is by realpath, `isMainWorktree` and `head`, never by
 * the return code.
 */
function isolatedFromCreate(created) {
  if (created === undefined || created.ok !== true) return null;
  if (created.isMainWorktree === true || created.head === "") return null;
  return created.path;
}

/** The exact existing workspace the second rung starts in, or nothing. */
function acceptedWorkspace(surface, resolveRealPath) {
  if (surface.workspace === undefined) return null;
  try {
    return resolveRealPath(surface.workspace);
  } catch {
    return null;
  }
}

function recordedReview(
  surface,
  {
    candidate = "0123456789abcdef0123456789abcdef01234567",
    failAt = null,
    cleanupFails = false,
    resolveRealPath = filesystemRealPath,
  } = {},
) {
  const calls = [];
  const baselineRegistration = registrationSet(surface);
  const baselineResources = normalized(surface.resources);
  const resources = [...surface.resources];
  const owned = [];
  const reviewerResources = (child) => [
    ...(child.existing ? [] : [child]),
    {
      id: `${child.id}-terminal`,
      kind: "terminal",
      owner: "candidate-run",
      projectId: surface.project.id,
      repoId: child.repoId,
    },
    {
      id: `${child.id}-dispatch`,
      kind: "worker",
      owner: "candidate-run",
      projectId: surface.project.id,
      repoId: child.repoId,
      terminalId: `${child.id}-terminal`,
    },
  ];
  const addReviewerResources = (child) => {
    for (const resource of reviewerResources(child)) {
      assert.equal(resource.projectId, surface.project.id);
      if (surface.project.kind === "git") {
        assert.ok(surface.project.sourceRepoIds.includes(resource.repoId));
      }
      resources.push(resource);
      owned.push(resource);
    }
    calls.push({ operation: "orca orchestration worker-start", id: `${child.id}-dispatch` });
  };
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
  // The ladder is walked before the inventory of isolated worktrees is judged:
  // "no child worktrees" is the condition for the second rung, not a partial
  // inventory of the first.
  if (surface.project.kind === "folder" && children.length === 0) {
    if (isolatedFromCreate(surface.worktreeCreate) !== null) {
      throw new Error("a created worktree must enter the inventory, not the ladder");
    }
    const workspace = acceptedWorkspace(surface, resolveRealPath);
    if (workspace === null) {
      return finish({ status: "unsupported", reason: "placement_unsupported", ownedDelta: [] });
    }
    for (const slot of ["A", "B"]) {
      calls.push({ operation: "orca orchestration worker-start", worktree: workspace, slot });
    }
    return finish({
      status: "started",
      placement: "shared_checkout",
      reason: null,
      ownedDelta: owned,
    });
  }
  const inventoryReason = reviewerInventoryReason(surface, candidate, resolveRealPath);
  if (inventoryReason) {
    return finish({ status: "unsupported", reason: inventoryReason, ownedDelta: [] });
  }
  if (surface.project.kind === "folder") {
    if (!children.every(({ existing }) => existing === true)) {
      return finish({ status: "unsupported", reason: "placement_unsupported", ownedDelta: [] });
    }
    for (const child of children) addReviewerResources(child);
    return finish({ status: "started", placement: "isolated", reason: null, ownedDelta: owned });
  }

  for (const child of surface.children) {
    calls.push({ operation: "orca worktree new-child", projectId: surface.project.id });
    if (failAt === child.id) {
      for (const resource of owned.toReversed()) {
        calls.push({
          operation:
            resource.kind === "worker"
              ? "orca orchestration worker-release"
              : resource.kind === "terminal"
                ? "orca terminal close"
                : "orca worktree delete",
          id: resource.id,
        });
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
    addReviewerResources(child);
  }
  return finish({ status: "started", reason: null, ownedDelta: owned });
}

function replayRecordedReview(surface, options = {}) {
  return recordedReview(surface, { ...options, resolveRealPath: recordedRealPath });
}

test("folder placement accepts two existing clean exact-candidate reviewer worktrees", () => {
  const result = replayRecordedReview(fixture.folder);
  assert.deepEqual(
    { status: result.status, reason: result.reason },
    { status: "started", reason: null },
  );
  assert.deepEqual(
    result.calls.map(({ operation }) => operation),
    ["orca orchestration worker-start", "orca orchestration worker-start"],
  );
  assert.deepEqual(
    result.ownedDelta.map(({ kind }) => kind),
    ["terminal", "worker", "terminal", "worker"],
  );
  assert.equal(result.registrationUnchanged, true);
  assert.notEqual(result.finalResources, result.baselineResources);
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
            realPath: "/recorded/review-a",
            realPathProvenance: "realpath -- /recorded/x/../review-a",
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
    const result = replayRecordedReview(surface);
    assert.equal(result.reason, reason);
    assert.deepEqual(result.calls, []);
    assert.match(result.header, new RegExp(`reason=${reason} `, "u"));
  }
  assert.throws(
    () => reviewStartHeader("reviewer_inventory_invalid", "project-folder", "f".repeat(40)),
    /unknown REVIEW-START reason/u,
  );
  const unsupported = replayRecordedReview({
    ...fixture.folder,
    project: { ...fixture.folder.project, kind: "unknown" },
    children: fixture.folder.children.slice(0, 1),
  });
  assert.equal(unsupported.reason, "placement_unsupported");
});

test("filesystem realpath identity rejects two symlink aliases of one worktree", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-placement-realpath-"));
  try {
    const target = join(root, "review");
    const alias = join(root, "alias");
    mkdirSync(target);
    symlinkSync(target, alias, "dir");
    const realTarget = realpathSync.native(target);
    const children = fixture.folder.children.map((child, index) => ({
      ...child,
      path: index === 0 ? target : alias,
      realPath: realTarget,
      realPathProvenance: `realpath -- ${index === 0 ? target : alias}`,
    }));
    const result = recordedReview({ ...fixture.folder, children });
    assert.equal(result.reason, "inventory_changed");
    assert.deepEqual(result.calls, []);

    for (const mutation of [{ realPath: alias }, { realPathProvenance: `realpath ${alias}` }]) {
      const mutated = children.map((child, index) =>
        index === 1 ? { ...child, ...mutation } : child,
      );
      assert.equal(
        recordedReview({ ...fixture.folder, children: mutated }).reason,
        "inventory_unreadable",
      );
    }

    const second = join(root, "review-b");
    mkdirSync(second);
    const distinct = children.map((child, index) => {
      const path = index === 0 ? target : second;
      return {
        ...child,
        path,
        realPath: realpathSync.native(path),
        realPathProvenance: `realpath -- ${path}`,
      };
    });
    assert.equal(recordedReview({ ...fixture.folder, children: distinct }).status, "started");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing context and remote-only placement are typed before any start", () => {
  for (const [surface, reason] of [
    [fixture.noContext, "no_project_context"],
    [fixture.remote, "remote_placement_unsupported"],
  ]) {
    const result = replayRecordedReview(surface);
    assert.equal(result.status, "unsupported");
    assert.equal(result.reason, reason);
    assert.deepEqual(result.calls, []);
    assert.equal(result.registrationUnchanged, true);
    assert.match(result.header, new RegExp(`reason=${reason} `, "u"));
  }
});

test("Git new-child placement attributes complete worktree, terminal and worker deltas", () => {
  const result = replayRecordedReview(fixture.git);
  assert.equal(result.status, "started");
  assert.equal(result.header, null);
  assert.equal(result.registrationUnchanged, true);
  assert.equal(result.ownedDelta.length, 6);
  assert.deepEqual(
    result.ownedDelta.map(({ kind }) => kind),
    ["worktree", "terminal", "worker", "worktree", "terminal", "worker"],
  );
  assert.ok(result.ownedDelta.every(({ projectId }) => projectId === "project-git"));
  assert.ok(result.ownedDelta.every(({ repoId }) => repoId === "repo-meta-o"));
  assert.deepEqual(
    result.calls.map(({ operation }) => operation),
    [
      "orca worktree new-child",
      "orca orchestration worker-start",
      "orca worktree new-child",
      "orca orchestration worker-start",
    ],
  );
  assert.equal(
    result.calls.some(({ operation }) =>
      new Set(["orca repo add", "git worktree add"]).has(operation),
    ),
    false,
  );
});

test("partial start removes only exact-owned resources and types incomplete cleanup", () => {
  let result = replayRecordedReview(fixture.git, { failAt: "review-b" });
  assert.equal(result.reason, "partial_start_failed");
  assert.equal(result.finalResources, result.baselineResources);
  assert.equal(result.registrationUnchanged, true);

  result = replayRecordedReview(fixture.git, { failAt: "review-b", cleanupFails: true });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.reason, "cleanup_incomplete");
  assert.match(
    result.header,
    /^REVIEW-START version=1 status=unsupported reason=cleanup_incomplete /u,
  );
  assert.equal(result.handover, "needs_attention");
  assert.deepEqual(
    result.ownedDelta.map(({ id }) => id),
    ["review-a", "review-a-terminal", "review-a-dispatch"],
  );
  assert.ok(JSON.parse(result.finalResources).some(({ id }) => id === "foreign-terminal"));
  assert.equal(result.registrationUnchanged, true);
});

function releaseRecordedWorker(resource, result, closeExactTerminal) {
  if (result === "released") return "released";
  if (result !== "no_owned_resource") throw new Error("unknown release result");
  if (resource.kind !== "worker" || typeof resource.terminalId !== "string") {
    return "needs_attention";
  }
  closeExactTerminal(resource.terminalId);
  return "released_exact_terminal";
}

test("no_owned_resource closes only the recorded fallback terminal handle", () => {
  const closed = [];
  const owned = {
    id: "review-a-dispatch",
    kind: "worker",
    terminalId: "review-a-terminal",
  };
  assert.equal(
    releaseRecordedWorker(owned, "no_owned_resource", (handle) => closed.push(handle)),
    "released_exact_terminal",
  );
  assert.deepEqual(closed, ["review-a-terminal"]);
  assert.equal(
    releaseRecordedWorker({ id: "foreign", kind: "worker" }, "no_owned_resource", (handle) =>
      closed.push(handle),
    ),
    "needs_attention",
  );
  assert.deepEqual(closed, ["review-a-terminal"]);
});

/**
 * Compare the baseline snapshots a caller takes around a `shared_checkout` pair.
 *
 * The invariant is about the shared working checkout, not about the repository:
 * a slot's own leftovers make the pair `UNKNOWN`, while somebody else working
 * in parallel is an observation that is recorded and never undone. Confusing
 * the two either hides a reviewer's mess or deletes a colleague's work.
 */
function settlePair(before, after, slots) {
  const owns = (path) =>
    slots.some((slot) => path === slot.path || path.startsWith(`${slot.path}/`));
  // A porcelain record is `XY <path>`: the two status columns are not part of
  // the path, and comparing the whole line would attribute nothing to anybody.
  const ownsEntry = (entry) => owns(entry.slice(3));
  const observations = [];
  const faults = [];
  if (before.head !== after.head) faults.push("shared_head_moved");
  const changed = [
    ...after.status.filter((entry) => !before.status.includes(entry)),
    ...before.status.filter((entry) => !after.status.includes(entry)),
  ];
  for (const entry of changed) {
    if (ownsEntry(entry)) faults.push(`slot_change_left: ${entry}`);
    else observations.push(`foreign_change: ${entry}`);
  }
  for (const ref of after.refs) {
    if (ref.startsWith("refs/meta-o/review/")) faults.push(`slot_ref_left: ${ref}`);
  }
  const leftovers = after.worktrees.filter(
    (path) => owns(path) && !before.worktrees.includes(path),
  );
  for (const path of leftovers) faults.push(`slot_worktree_left: ${path}`);
  for (const path of before.worktrees) {
    // A record nobody's slot owns that vanished between snapshots means
    // somebody ran `prune`; the reviewer reports it rather than restoring it.
    if (!after.worktrees.includes(path) && !owns(path))
      observations.push(`prune_suspected: ${path}`);
  }
  return {
    verdict: faults.length === 0 ? "settled" : "UNKNOWN",
    faults,
    observations,
    handover: leftovers.length > 0 ? "needs_attention" : null,
  };
}

/** §A-SESSION-01 binds a conclusion to the candidate SHA or leaves it unknown. */
function groundingBound(grounding, candidate) {
  const bound = [
    new RegExp(`git show ${candidate}:`, "u"),
    new RegExp(`git diff \\S+\\.\\.${candidate}`, "u"),
    new RegExp(`git grep .* ${candidate}`, "u"),
    new RegExp(`rev-parse HEAD[\\s\\S]*${candidate}`, "u"),
  ];
  return bound.some((pattern) => pattern.test(grounding)) ? "bound" : "UNKNOWN";
}

const SNAPSHOT = {
  head: "0123456789abcdef0123456789abcdef01234567",
  status: ["?? notes.txt"],
  worktrees: ["/recorded/shared", "/recorded/colleague"],
  refs: [],
};
const SLOTS = [{ path: "/recorded/slot-a" }, { path: "/recorded/slot-b" }];

test("a folder project without child worktrees starts in the exact existing workspace", () => {
  const result = replayRecordedReview(fixture.folderSharedCheckout);
  assert.equal(result.status, "started");
  assert.equal(result.placement, "shared_checkout");
  assert.ok(result.registrationUnchanged);
  assert.deepEqual(
    result.calls.map(({ operation }) => operation),
    ["orca orchestration worker-start", "orca orchestration worker-start"],
  );
  // Both reviewers start in the same exact path, and nothing is created there.
  assert.deepEqual(
    new Set(result.calls.map(({ worktree }) => worktree)),
    new Set(["/recorded/shared"]),
  );
});

test("without even an exact workspace the ladder ends in a typed refusal", () => {
  const result = replayRecordedReview(fixture.folderNoWorkspace);
  assert.equal(result.status, "unsupported");
  assert.equal(result.reason, "placement_unsupported");
  assert.equal(
    result.header,
    reviewStartHeader("placement_unsupported", "project-folder", undefined),
  );
  assert.deepEqual(result.calls, [], "no Run and no task before placement is proven");
});

test("ok:true on the shared path is not an isolated worktree", () => {
  assert.equal(isolatedFromCreate(fixture.folderCreateTrap.worktreeCreate), null);
  assert.equal(
    isolatedFromCreate({ ok: true, path: "/recorded/child", head: "abc", isMainWorktree: false }),
    "/recorded/child",
  );
  // The recorded trap still resolves to the shared rung rather than to a
  // worktree that does not exist.
  const result = replayRecordedReview(fixture.folderCreateTrap);
  assert.equal(result.placement, "shared_checkout");
});

test("a reviewer's own leftovers are UNKNOWN; a colleague's work is an observation", () => {
  const clean = settlePair(SNAPSHOT, SNAPSHOT, SLOTS);
  assert.equal(clean.verdict, "settled");
  assert.deepEqual(clean.faults, []);

  const slotFile = settlePair(
    SNAPSHOT,
    { ...SNAPSHOT, status: [...SNAPSHOT.status, "?? /recorded/slot-a/scratch"] },
    SLOTS,
  );
  assert.equal(slotFile.verdict, "UNKNOWN");
  assert.deepEqual(slotFile.faults, ["slot_change_left: ?? /recorded/slot-a/scratch"]);

  const colleague = settlePair(
    SNAPSHOT,
    { ...SNAPSHOT, status: [...SNAPSHOT.status, " M src/app.js"] },
    SLOTS,
  );
  assert.equal(colleague.verdict, "settled");
  assert.deepEqual(colleague.observations, ["foreign_change:  M src/app.js"]);

  assert.equal(
    settlePair(SNAPSHOT, { ...SNAPSHOT, head: "b".repeat(40) }, SLOTS).verdict,
    "UNKNOWN",
  );
});

test("an unremoved slot ref or slot worktree does not settle", () => {
  const ref = settlePair(
    SNAPSHOT,
    { ...SNAPSHOT, refs: ["refs/meta-o/review/A/0123456789abcdef0123456789abcdef01234567"] },
    SLOTS,
  );
  assert.equal(ref.verdict, "UNKNOWN");
  assert.match(ref.faults[0], /^slot_ref_left: refs\/meta-o\/review\/A\//u);
  assert.equal(ref.handover, null);

  const worktree = settlePair(
    SNAPSHOT,
    { ...SNAPSHOT, worktrees: [...SNAPSHOT.worktrees, "/recorded/slot-a"] },
    SLOTS,
  );
  assert.equal(worktree.verdict, "UNKNOWN");
  assert.equal(worktree.handover, "needs_attention");
});

test("a foreign worktree record that vanished is reported, not repaired", () => {
  const pruned = settlePair(SNAPSHOT, { ...SNAPSHOT, worktrees: ["/recorded/shared"] }, SLOTS);
  assert.equal(pruned.verdict, "settled");
  assert.deepEqual(pruned.observations, ["prune_suspected: /recorded/colleague"]);
});

test("no shipped instruction ever tells a reviewer to prune", () => {
  // `prune` drops the administrative record of every currently unreachable
  // worktree, including a colleague's and a temporarily unmounted one.
  for (const path of [
    "src/skills/mo-review-orca/SKILL.md",
    "shared/references/review-brief.md",
    "shared/references/methodology.md",
    "shared/references/orca-mechanics.md",
  ]) {
    const text = readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
    const mentions = text.split("\n").filter((line) => line.includes("worktree prune"));
    for (const line of mentions) {
      assert.match(line, /forbidden|запрещ/u, `${path}: prune is named without being forbidden`);
    }
  }
});

test("a conclusion that is not bound to the candidate is unknown", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(groundingBound(`I read git show ${sha}:src/app.js`, sha), "bound");
  assert.equal(groundingBound(`git diff base..${sha} -- tests`, sha), "bound");
  assert.equal(
    groundingBound(`my checkout /tmp/slot-a, rev-parse HEAD printed ${sha}`, sha),
    "bound",
  );
  assert.equal(groundingBound("I read the files in the shared checkout", sha), "UNKNOWN");
});
