/**
 * §M-TEST-WATCHDOG — Acceptance tests for the optional multi-project watchdog.
 *
 * Covers the §50 acceptance list end to end with a fake clock: poll, backoff
 * and reset behaviour, exactly-once wake per event, exactly one replacement
 * generation, no replacement while the orchestrator lives or its status is
 * unknown, no resend of an unprovable operation, productive loops not counted
 * as stalls, independent projects, and a disabled watchdog doing nothing.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { FakeClock } from "../dist/core/clock.mjs";
import {
  DEFAULT_STALL_DEADLINE_MS,
  Watchdog,
  decideAction,
  type RunMemory,
  type WatchdogLogEntry,
  type WatchdogObservation,
} from "../dist/watchdog/watchdog.mjs";
import { classifyTail, parseResetTime, sanitizeTail } from "../dist/watchdog/classifier.mjs";
import type {
  PendingOperation,
  ReconcileResult,
  RunState,
  SessionStatus,
  WatchdogConfig,
} from "../dist/core/types.mjs";

/** §M-TEST-WATCHDOG — Build a run state positioned in a working phase. */
function makeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: 1,
    runId: "run-1",
    projectKey: "key-1",
    phase: "REVIEW_STABILIZATION",
    stateVersion: 7,
    orchestratorGeneration: 1,
    spec: { kind: "local", locator: "/tmp/s.md", sha256: "a".repeat(64), disposition: "external" },
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
    orchestratorSession: { backend: "herdr", sessionId: "agent=o;pane=w1:p1;owned=1", role: "orchestrator", generation: 1 },
    decisions: [],
    confirmations: {},
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** §M-TEST-WATCHDOG — Default watchdog configuration for tests. */
function makeConfig(overrides: Partial<WatchdogConfig> = {}): WatchdogConfig {
  return {
    schema_version: 1,
    enabled: true,
    project_keys: ["key-1"],
    poll_interval_seconds: 30,
    max_backoff_seconds: 300,
    classifier_mode: "deterministic",
    ...overrides,
  };
}

/** §M-TEST-WATCHDOG — Fresh per-run memory. */
function makeMemory(overrides: Partial<RunMemory> = {}): RunMemory {
  return { lastStateVersion: 7, lastProgressAtMs: 0, backoffMs: 30_000, ...overrides };
}

/** §M-TEST-WATCHDOG — Build an observation with sensible defaults. */
function makeObservation(overrides: Partial<WatchdogObservation> = {}): WatchdogObservation {
  return {
    projectKey: "key-1",
    runId: "run-1",
    state: makeRun(),
    orchestratorStatus: "waiting",
    progressed: false,
    idleForMs: 0,
    ...overrides,
  };
}

/** §M-TEST-WATCHDOG — Harness wiring a watchdog to controllable fakes. */
interface Harness {
  watchdog: Watchdog;
  clock: FakeClock;
  logs: WatchdogLogEntry[];
  wakes: string[];
  spawns: string[];
  states: Map<string, RunState>;
}

/** §M-TEST-WATCHDOG — Assemble a watchdog over in-memory state. */
function harness(options: {
  states: Array<[string, RunState]>;
  config?: WatchdogConfig;
  status?: (state: RunState) => SessionStatus | "absent";
  reconcile?: (operation: PendingOperation) => ReconcileResult;
}): Harness {
  const clock = new FakeClock(1_000_000);
  const logs: WatchdogLogEntry[] = [];
  const wakes: string[] = [];
  const spawns: string[] = [];
  const states = new Map(options.states);

  const watchdog = new Watchdog({
    config: options.config ?? makeConfig(),
    clock,
    listRuns: (projectKey) =>
      [...states.keys()]
        .filter((key) => key.startsWith(`${projectKey}/`))
        .map((key) => key.slice(projectKey.length + 1)),
    readState: (projectKey, runId) => states.get(`${projectKey}/${runId}`),
    orchestratorStatus: async (state) => options.status?.(state) ?? "waiting",
    reconcile: async (_state, operation) =>
      options.reconcile?.(operation) ?? { operationId: operation.operationId, effect: "applied" },
    wakeOrchestrator: async (state) => {
      wakes.push(`${state.projectKey}/${state.runId}@${state.stateVersion}`);
    },
    spawnOrchestrator: async (state) => {
      spawns.push(`${state.projectKey}/${state.runId}@gen${state.orchestratorGeneration}`);
    },
    log: (entry) => logs.push(entry),
  });

  return { watchdog, clock, logs, wakes, spawns, states };
}

test("a productive loop is never treated as a stall", () => {
  const decision = decideAction(makeObservation({ progressed: true, idleForMs: 10 * 3_600_000 }), makeMemory(), {
    stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS,
    nowMs: 1_000_000,
  });
  assert.equal(decision.action, "noop");
  assert.match(decision.reason, /advanced/);
});

test("a working orchestrator is left alone", () => {
  for (const status of ["running", "starting"] as const) {
    const decision = decideAction(makeObservation({ orchestratorStatus: status }), makeMemory(), {
      stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS,
      nowMs: 1_000_000,
    });
    assert.equal(decision.action, "noop");
  }
});

test("a live orchestrator is never replaced, only woken", () => {
  const decision = decideAction(
    makeObservation({ orchestratorStatus: "waiting", idleForMs: DEFAULT_STALL_DEADLINE_MS + 1 }),
    makeMemory(),
    { stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS, nowMs: 1_000_000 },
  );
  assert.equal(decision.action, "wake_orchestrator");
});

test("an unknown orchestrator status never produces a replacement", () => {
  const decision = decideAction(makeObservation({ orchestratorStatus: "unknown" }), makeMemory(), {
    stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS,
    nowMs: 1_000_000,
  });
  assert.equal(decision.action, "backoff");
  assert.match(decision.reason, /must not be created/);
});

test("an unprovable pending operation is surfaced, never resent", () => {
  const state = makeRun({
    pendingOperation: {
      operationId: "op-1",
      kind: "send",
      requestDigest: "d",
      state: "prepared",
    },
  });
  const decision = decideAction(
    makeObservation({ state, reconcile: { operationId: "op-1", effect: "unknown" } }),
    makeMemory(),
    { stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS, nowMs: 1_000_000 },
  );
  assert.equal(decision.action, "surface_uncertainty");
});

test("a quota pause without a provable reset time backs off instead of guessing", () => {
  const state = makeRun({ phase: "PAUSED_QUOTA" });
  const decision = decideAction(makeObservation({ state }), makeMemory(), {
    stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS,
    nowMs: 1_000_000,
  });
  assert.equal(decision.action, "backoff");
  assert.match(decision.reason, /not provably parsed/);
});

test("a quota pause whose window has reopened resumes through the normal path", () => {
  const state = makeRun({ phase: "PAUSED_QUOTA" });
  const decision = decideAction(
    makeObservation({ state, orchestratorStatus: "absent" }),
    makeMemory(),
    { stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS, quotaResumeAtMs: 999_000, nowMs: 1_000_000 },
  );
  assert.equal(decision.action, "spawn_orchestrator");
});

test("a terminal run is ignored", () => {
  const state = makeRun({ phase: "COMPLETE" });
  const decision = decideAction(makeObservation({ state }), makeMemory(), {
    stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS,
    nowMs: 1_000_000,
  });
  assert.equal(decision.action, "noop");
});

test("one settled event wakes the orchestrator at most once", async () => {
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const test1 = harness({ states: [["key-1/run-1", state]], status: () => "waiting" });

  await test1.watchdog.tick();
  assert.deepEqual(test1.wakes, ["key-1/run-1@7"]);

  await test1.watchdog.tick();
  assert.equal(test1.wakes.length, 1, "a second tick must not wake again for the same state");

  const backoffDecision = test1.logs.at(-1);
  assert.equal(backoffDecision?.action, "backoff");
});

test("a dead orchestrator receives exactly one replacement generation", async () => {
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const test1 = harness({ states: [["key-1/run-1", state]], status: () => "failed" });

  await test1.watchdog.tick();
  await test1.watchdog.tick();
  await test1.watchdog.tick();

  assert.deepEqual(test1.spawns, ["key-1/run-1@gen1"]);
});

test("an action is dropped when the run moved on while the watchdog was deciding", async () => {
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const test1 = harness({
    states: [["key-1/run-1", state]],
    status: () => {
      test1.states.set("key-1/run-1", { ...state, stateVersion: state.stateVersion + 1 });
      return "failed";
    },
  });

  await test1.watchdog.tick();
  assert.deepEqual(test1.spawns, [], "a superseded action must not be applied");
  assert.equal(test1.logs.at(-1)?.outcome, "superseded");
});

test("backoff grows exponentially and resets on observed progress", async () => {
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const test1 = harness({ states: [["key-1/run-1", state]], status: () => "unknown" });

  const first = await test1.watchdog.tick();
  const second = await test1.watchdog.tick();
  const third = await test1.watchdog.tick();

  assert.equal(first.nextDelayMs, 60_000);
  assert.equal(second.nextDelayMs, 120_000);
  assert.equal(third.nextDelayMs, 240_000);

  test1.states.set("key-1/run-1", { ...state, stateVersion: state.stateVersion + 1 });
  const afterProgress = await test1.watchdog.tick();
  assert.equal(afterProgress.nextDelayMs, 30_000, "progress resets the interval to the poll period");
});

test("backoff is capped by the configured maximum", async () => {
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const test1 = harness({
    states: [["key-1/run-1", state]],
    status: () => "unknown",
    config: makeConfig({ max_backoff_seconds: 90 }),
  });

  let report = await test1.watchdog.tick();
  for (let index = 0; index < 5; index += 1) report = await test1.watchdog.tick();
  assert.equal(report.nextDelayMs, 90_000);
});

test("two project keys are observed independently", async () => {
  const alive = makeRun({ projectKey: "key-1", runId: "run-1", updatedAt: new Date(0).toISOString() });
  const dead = makeRun({ projectKey: "key-2", runId: "run-2", updatedAt: new Date(0).toISOString() });
  const test1 = harness({
    states: [
      ["key-1/run-1", alive],
      ["key-2/run-2", dead],
    ],
    config: makeConfig({ project_keys: ["key-1", "key-2"] }),
    status: (state) => (state.projectKey === "key-1" ? "running" : "stopped"),
  });

  const report = await test1.watchdog.tick();
  assert.equal(report.observations, 2);
  assert.deepEqual(test1.spawns, ["key-2/run-2@gen1"]);
  assert.deepEqual(test1.wakes, []);
});

test("a disabled watchdog performs no ticks at all", async () => {
  const test1 = harness({
    states: [["key-1/run-1", makeRun()]],
    config: makeConfig({ enabled: false }),
  });
  assert.equal(await test1.watchdog.run(5), 0);
  assert.deepEqual(test1.logs, []);
});

test("unreadable state is reported and never acted upon", async () => {
  const clock = new FakeClock(0);
  const logs: WatchdogLogEntry[] = [];
  const watchdog = new Watchdog({
    config: makeConfig(),
    clock,
    listRuns: () => ["run-1"],
    readState: () => {
      throw new Error("corrupt");
    },
    orchestratorStatus: async () => "absent",
    reconcile: async (_state, operation) => ({ operationId: operation.operationId, effect: "applied" }),
    wakeOrchestrator: async () => assert.fail("must not wake on corrupt state"),
    spawnOrchestrator: async () => assert.fail("must not spawn on corrupt state"),
    log: (entry) => logs.push(entry),
  });

  await watchdog.tick();
  assert.equal(logs[0]?.phase, "unreadable");
  assert.equal(logs[0]?.action, "noop");
});

test("the loop honours a bounded tick count with a fake clock", async () => {
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const test1 = harness({ states: [["key-1/run-1", state]], status: () => "running" });
  const ticks = await test1.watchdog.run(3);
  assert.equal(ticks, 3);
  assert.ok(test1.clock.now() > 1_000_000, "sleeping between ticks advances virtual time");
});

test("the classifier only claims what the text proves", () => {
  assert.equal(classifyTail("HTTP 429 rate limit exceeded"), "quota");
  assert.equal(classifyTail("getaddrinfo ENOTFOUND api.example.com"), "external");
  assert.equal(classifyTail("the request timed out, try again"), "transient");
  assert.equal(classifyTail("the model said something unusual"), "unknown");
});

test("only machine-readable reset times are parsed", () => {
  assert.equal(parseResetTime("quota resets at 3pm"), undefined);
  assert.equal(parseResetTime("retry-after: 120"), 120_000);
  assert.equal(
    parseResetTime("limit resets 2026-07-24T18:20:00Z"),
    Date.parse("2026-07-24T18:20:00Z"),
  );
});

test("tails are redacted and bounded before any classifier sees them", () => {
  const tail = `${"x".repeat(20_000)} API_KEY=sk-abcdefghijklmnopqrstuvwxyz`;
  const sanitized = sanitizeTail(tail);
  assert.ok(Buffer.byteLength(sanitized, "utf8") <= 8 * 1024);
  assert.ok(!sanitized.includes("sk-abcdefghijklmnopqrstuvwxyz"));
});
