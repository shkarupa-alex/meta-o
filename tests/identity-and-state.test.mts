/**
 * §M-TEST-IDENTITY — Acceptance tests for project keys and external run state.
 *
 * Covers the §20 acceptance list: colliding readable paths get distinct keys,
 * moving a project creates a new key, a symlinked state directory is refused,
 * a fresh orchestrator recovers a run from `state.json` alone, and two parallel
 * runs never block each other.
 *
 * Verifies §A-EXTERNAL-STATE and §A-CRASH-RECOVERY.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdirSync, symlinkSync, chmodSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { projectKeyFor, readableComponent, truncateUtf8 } from "../dist/core/project-key.mjs";
import {
  InsecureStateError,
  ensureSecureDir,
  metaOHome,
  readSecureJson,
  writeSecureJson,
} from "../dist/core/safe-fs.mjs";
import {
  ConcurrentWriteError,
  HandoffTooLargeError,
  ProjectIdentityMismatchError,
  StaleGenerationError,
  cleanupRun,
  commitState,
  ensureProject,
  ensureRunDirectories,
  listRuns,
  readState,
  withWriterLock,
  writeHandoff,
} from "../dist/core/state-store.mjs";
import { runDir, statePath } from "../dist/core/paths.mjs";
import { createTempHome } from "./helpers.mts";
import type { RunState } from "../dist/core/types.mjs";

/** §M-TEST-IDENTITY — Build a minimal but complete run state for state-store tests. */
function makeState(projectKey: string, runId: string): RunState {
  return {
    schemaVersion: 1,
    runId,
    projectKey,
    phase: "EXECUTING",
    stateVersion: 0,
    orchestratorGeneration: 1,
    spec: { kind: "local", locator: "/tmp/spec.md", sha256: "a".repeat(64), disposition: "external" },
    specBlob: "/tmp/blob.md",
    baseRevision: "b".repeat(40),
    modelSet: {
      executor: { route: "claude", vendor: "anthropic", family: "claude", model: "opus" },
      reviewerPrimary: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
      reviewerCrossVendor: { route: "codex", vendor: "openai", family: "gpt", model: "gpt-5" },
      e2eTester: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
    },
    sessions: {},
    sessionGeneration: {},
    decisions: [],
    confirmations: {},
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

test("readable path forms that collapse identically still get distinct keys", () => {
  const first = "/a-b/c";
  const second = "/a/b-c";
  assert.equal(readableComponent(first), readableComponent(second));
  assert.notEqual(projectKeyFor(first), projectKeyFor(second));
});

test("moving a project produces a different key", () => {
  assert.notEqual(projectKeyFor("/home/dev/app"), projectKeyFor("/srv/dev/app"));
});

test("the readable component is truncated on a character boundary", () => {
  const long = `/${"ю".repeat(400)}`;
  const readable = readableComponent(long);
  assert.ok(Buffer.byteLength(readable, "utf8") <= 180);
  assert.equal(readable, truncateUtf8(readable, 180));
});

test("a symlinked state directory is refused", () => {
  const home = createTempHome();
  try {
    const projects = join(home.dir, "projects");
    mkdirSync(projects, { recursive: true, mode: 0o700 });
    const real = join(home.dir, "elsewhere");
    mkdirSync(real, { recursive: true, mode: 0o700 });
    symlinkSync(real, join(projects, "victim"));

    assert.throws(
      () => ensureSecureDir(join(projects, "victim")),
      (error: unknown) => error instanceof InsecureStateError,
    );
  } finally {
    home.dispose();
  }
});

test("a group-writable state directory is refused", () => {
  const home = createTempHome();
  try {
    const dir = ensureSecureDir(join(metaOHome(), "projects", "loose"));
    chmodSync(dir, 0o770);
    assert.throws(
      () => ensureSecureDir(dir),
      (error: unknown) => error instanceof InsecureStateError,
    );
  } finally {
    home.dispose();
  }
});

test("a path escaping the state tree is refused", () => {
  const home = createTempHome();
  try {
    assert.throws(
      () => ensureSecureDir(join(metaOHome(), "..", "escape")),
      (error: unknown) => error instanceof InsecureStateError,
    );
  } finally {
    home.dispose();
  }
});

test("state files are written atomically and readable back", () => {
  const home = createTempHome();
  try {
    const path = join(metaOHome(), "projects", "p", "probe.json");
    writeSecureJson(path, { b: 2, a: 1 } as never);
    assert.deepEqual(readSecureJson(path), { a: 1, b: 2 });
  } finally {
    home.dispose();
  }
});

test("a project directory belonging to another canonical path blocks the run", () => {
  const home = createTempHome();
  try {
    ensureProject("key-1", "/real/path");
    assert.throws(
      () => ensureProject("key-1", "/other/path"),
      (error: unknown) => error instanceof ProjectIdentityMismatchError,
    );
  } finally {
    home.dispose();
  }
});

test("a fresh orchestrator recovers a run from state.json alone", () => {
  const home = createTempHome();
  try {
    ensureProject("key-1", "/real/path");
    const state = makeState("key-1", "run-1");
    const written = commitState(state);
    assert.equal(written.stateVersion, 1);

    const recovered = readState("key-1", "run-1");
    assert.ok(recovered);
    assert.equal(recovered.phase, "EXECUTING");
    assert.equal(recovered.spec.sha256, state.spec.sha256);
    assert.equal(recovered.baseRevision, state.baseRevision);
  } finally {
    home.dispose();
  }
});

test("an older orchestrator generation cannot overwrite a newer one", () => {
  const home = createTempHome();
  try {
    ensureProject("key-1", "/real/path");
    const first = commitState(makeState("key-1", "run-1"));
    const takeover = commitState({ ...first, orchestratorGeneration: 2 });

    assert.throws(
      () => commitState({ ...takeover, orchestratorGeneration: 1 }),
      (error: unknown) => error instanceof StaleGenerationError,
    );
  } finally {
    home.dispose();
  }
});

test("a lost update is rejected instead of silently overwriting", () => {
  const home = createTempHome();
  try {
    ensureProject("key-1", "/real/path");
    const base = commitState(makeState("key-1", "run-1"));
    commitState({ ...base, phase: "LOCAL_QC" });

    assert.throws(
      () => commitState({ ...base, phase: "SMOKE_PREFLIGHT" }),
      (error: unknown) => error instanceof ConcurrentWriteError,
    );
  } finally {
    home.dispose();
  }
});

test("two runs of one project take their locks independently", async () => {
  const home = createTempHome();
  try {
    ensureProject("key-1", "/real/path");
    ensureRunDirectories("key-1", "run-a");
    ensureRunDirectories("key-1", "run-b");

    let innerRan = false;
    await withWriterLock("key-1", "run-a", async () => {
      await withWriterLock(
        "key-1",
        "run-b",
        () => {
          innerRan = true;
        },
        { timeoutMs: 1_000 },
      );
    });
    assert.equal(innerRan, true);
  } finally {
    home.dispose();
  }
});

test("a stale writer lock left by a dead process is reclaimed", async () => {
  const home = createTempHome();
  try {
    ensureProject("key-1", "/real/path");
    ensureRunDirectories("key-1", "run-a");
    const lockPath = join(runDir("key-1", "run-a"), "writer.lock");
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: 2 ** 30, host: "nowhere", acquiredAtMs: 0 }),
      { mode: 0o600 },
    );

    let ran = false;
    await withWriterLock(
      "key-1",
      "run-a",
      () => {
        ran = true;
      },
      { timeoutMs: 2_000, staleMs: 1 },
    );
    assert.equal(ran, true);
  } finally {
    home.dispose();
  }
});

test("an oversized handoff is rejected rather than truncated", () => {
  const home = createTempHome();
  try {
    ensureProject("key-1", "/real/path");
    ensureRunDirectories("key-1", "run-1");
    assert.throws(
      () => writeHandoff("key-1", "run-1", "x".repeat(4097)),
      (error: unknown) => error instanceof HandoffTooLargeError,
    );
    writeHandoff("key-1", "run-1", "x".repeat(4096));
  } finally {
    home.dispose();
  }
});

test("cleanup removes the run directory but keeps project settings", () => {
  const home = createTempHome();
  try {
    ensureProject("key-1", "/real/path");
    commitState(makeState("key-1", "run-1"));
    assert.deepEqual(listRuns("key-1"), ["run-1"]);

    cleanupRun("key-1", "run-1");
    assert.deepEqual(listRuns("key-1"), []);
    assert.equal(readState("key-1", "run-1"), undefined);
    assert.ok(readSecureJson(join(metaOHome(), "projects", "key-1", "project.json")));
    rmSync(statePath("key-1", "run-1"), { force: true });
  } finally {
    home.dispose();
  }
});
