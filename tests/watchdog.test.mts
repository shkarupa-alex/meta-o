/**
 * §M-TEST-WATCHDOG — Acceptance tests for the optional multi-project watchdog.
 *
 * Covers the §50 acceptance list end to end with a fake clock: poll, backoff
 * and reset behaviour, exactly-once wake per event, exactly one replacement
 * generation, no replacement while the orchestrator lives or its status is
 * unknown, no resend of an unprovable operation, productive loops not counted
 * as stalls, independent projects, and a disabled watchdog doing nothing.
 *
 * Verifies §A-DETERMINISTIC-WATCHDOG.
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
import {
  classifyTail,
  classifyWithFallback,
  parseResetTime,
  sanitizeTail,
} from "../dist/watchdog/classifier.mjs";
import { REGRESSION_PREFIX } from "../dist/watchdog/watchdog.mjs";
import { MEMORY_UNREADABLE } from "../dist/watchdog/decide.mjs";
import { spawnPrompt, WAKE_PROMPT } from "../dist/cli/commands/backend.mjs";
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
  surfaced: string[];
  states: Map<string, RunState>;
}

/** §M-TEST-WATCHDOG — Assemble a watchdog over in-memory state. */
function harness(options: {
  states: Array<[string, RunState]>;
  config?: WatchdogConfig;
  status?: (state: RunState) => SessionStatus | "absent" | "unregistered";
  /** Whether a surfaced message actually reaches anyone. */
  deliverable?: boolean;
  reconcile?: (operation: PendingOperation) => ReconcileResult;
  /** Projects whose own settings have switched the watchdog off. */
  optedOut?: string[];
  /**
   * Whether the pane is observed at all. The shipped CLI supplies
   * `readSession`; a harness that omits it leaves `outputAdvanced` permanently
   * `undefined`, which is a configuration the product never runs in.
   */
  observePane?: boolean;
}): Harness {
  const clock = new FakeClock(1_000_000);
  const logs: WatchdogLogEntry[] = [];
  const wakes: string[] = [];
  const spawns: string[] = [];
  const surfaced: string[] = [];
  const states = new Map(options.states);
  let paneRevision = 1;

  const watchdog = new Watchdog({
    config: options.config ?? makeConfig(),
    clock,
    listRuns: (projectKey) =>
      [...states.keys()]
        .filter((key) => key.startsWith(`${projectKey}/`))
        .map((key) => key.slice(projectKey.length + 1)),
    watchdogEnabledFor: (projectKey) => !(options.optedOut ?? []).includes(projectKey),
    readState: (projectKey, runId) => states.get(`${projectKey}/${runId}`),
    orchestratorStatus: async (state) => options.status?.(state) ?? "waiting",
    reconcile: async (_state, operation) =>
      options.reconcile?.(operation) ?? { operationId: operation.operationId, effect: "applied" },
    ...(options.observePane
      ? {
          // A wake is delivered by typing into the pane, so the very next read
          // sees new output. That is the loop the guard has to survive.
          readSession: async () => ({ cursor: String(paneRevision), text: "", terminal: false }),
        }
      : {}),
    wakeOrchestrator: async (state) => {
      wakes.push(`${state.projectKey}/${state.runId}@${state.stateVersion}`);
      paneRevision += 1;
    },
    surfaceUncertainty: async (state, operation, reason) => {
      surfaced.push(
        `${state.runId}:${reason.startsWith(REGRESSION_PREFIX) ? "capability" : (operation?.kind ?? "none")}`,
      );
      return options.deliverable ?? true;
    },
    spawnOrchestrator: async (state) => {
      spawns.push(`${state.projectKey}/${state.runId}@gen${state.orchestratorGeneration}`);
    },
    log: (entry) => logs.push(entry),
  });

  return { watchdog, clock, logs, wakes, spawns, surfaced, states };
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

test("a wake does not renew its own permission to wake", async () => {
  // The guard is keyed to `stateVersion`, and it was cleared whenever the pane
  // produced new output — but a wake *is* new output, so each wake refreshed
  // the permission for the next one. A wedged orchestrator got one unsolicited
  // prompt per stall deadline, forever, on a state version that never moved.
  //
  // The harness observes the pane here, which is what the shipped CLI does and
  // what the older test never did: with `readSession` absent, `outputAdvanced`
  // is permanently `undefined` and the clearing branch is unreachable.
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const test1 = harness({
    states: [["key-1/run-1", state]],
    status: () => "waiting",
    observePane: true,
  });

  // The first tick has no previous cursor to compare against, so it establishes
  // one rather than concluding anything from it.
  await test1.watchdog.tick();
  assert.deepEqual(test1.wakes, [], "nothing is concluded from the first observation");
  test1.clock.advance(2 * DEFAULT_STALL_DEADLINE_MS);
  await test1.watchdog.tick();
  assert.deepEqual(test1.wakes, ["key-1/run-1@7"]);

  for (let window = 0; window < 3; window += 1) {
    test1.clock.advance(2 * DEFAULT_STALL_DEADLINE_MS);
    await test1.watchdog.tick();
  }
  assert.deepEqual(test1.wakes, ["key-1/run-1@7"], "the same settled state is woken once");

  // A version that actually moved is a different event, and is woken again.
  test1.states.set("key-1/run-1", { ...state, stateVersion: state.stateVersion + 1 });
  await test1.watchdog.tick();
  assert.deepEqual(test1.wakes, ["key-1/run-1@7"], "and progress is not itself a reason to wake");
  test1.clock.advance(2 * DEFAULT_STALL_DEADLINE_MS);
  await test1.watchdog.tick();
  assert.deepEqual(test1.wakes, ["key-1/run-1@7", "key-1/run-1@8"]);
});

test("a dead orchestrator receives exactly one replacement generation", async () => {
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const test1 = harness({ states: [["key-1/run-1", state]], status: () => "failed" });

  await test1.watchdog.tick();
  await test1.watchdog.tick();
  await test1.watchdog.tick();

  assert.deepEqual(test1.spawns, ["key-1/run-1@gen1"]);
});

test("a run that never registered an orchestrator is not one whose orchestrator died", async () => {
  // `absent` is the backend saying a named session is gone. A run with no
  // handle at all proves nothing — and since a human-started orchestrator never
  // registered one, this used to fall through to the terminal branch and spawn
  // a rival on the very first tick, with no stall deadline consulted.
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const test1 = harness({ states: [["key-1/run-1", state]], status: () => "unregistered" });

  await test1.watchdog.tick();
  await test1.watchdog.tick();

  assert.deepEqual(test1.spawns, [], "no replacement while the truth is unknown");
  assert.deepEqual(test1.wakes, [], "and nothing is woken through a handle that does not exist");
  assert.match(test1.logs.at(-1)?.reason ?? "", /records no orchestrator session/);
});

test("a replacement orchestrator is told the generation it was given", () => {
  // The watchdog's own dedup lives in a cache file it is allowed to lose. What
  // stops a merely-apparently-dead predecessor from writing alongside its
  // replacement is the generation fence in `commitState`, and that fence is
  // inert until the replacement exports the number — so the prompt must carry
  // it, not merely imply that one exists.
  const prompt = spawnPrompt(7);
  assert.match(prompt, /META_O_ORCHESTRATOR_GENERATION=7/);
  assert.ok(prompt.includes(WAKE_PROMPT), "and it still says what to do next");
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

test("a project that switched the watchdog off is skipped, and says so", async () => {
  // §50 makes the watchdog opt-in, and `ProjectSettings.watchdogEnabled` is the
  // answer the project itself gave — read by nothing, so a project that had
  // turned the watchdog off was watched anyway the moment anyone added its key
  // to `watchdog.json`.
  const test1 = harness({
    states: [
      ["key-1/run-1", makeRun({ projectKey: "key-1", runId: "run-1" })],
      ["key-2/run-2", makeRun({ projectKey: "key-2", runId: "run-2" })],
    ],
    config: makeConfig({ project_keys: ["key-1", "key-2"] }),
    optedOut: ["key-1"],
    status: () => "absent",
  });

  const report = await test1.watchdog.tick();
  assert.equal(report.observations, 1, "only the project that consented is observed");
  assert.deepEqual(test1.spawns, ["key-2/run-2@gen1"]);
  const skipped = test1.logs.find((entry) => entry.projectKey === "key-1");
  assert.equal(skipped?.action, "noop");
  assert.match(skipped?.reason ?? "", /watchdog switched off/);
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

test("only machine-readable reset times are parsed, always as an instant", () => {
  const now = Date.parse("2026-07-24T18:00:00Z");
  assert.equal(parseResetTime("quota resets at 3pm", now), undefined);

  // retry-after is a duration in every protocol that carries it; read as an
  // epoch it would land in 1970 and reopen the window immediately.
  assert.equal(parseResetTime("retry-after: 120", now), now + 120_000);

  assert.equal(
    parseResetTime("limit resets 2026-07-24T18:20:00Z", now),
    Date.parse("2026-07-24T18:20:00Z"),
  );

  // A timestamp with no reset keyword is some other timestamp — very often the
  // pause's own enteredAt, which is guaranteed to be in the past.
  assert.equal(parseResetTime("paused at 2026-07-24T17:00:00Z because of a 500", now), undefined);
});

test("tails are redacted and bounded before any classifier sees them", () => {
  const tail = `${"x".repeat(20_000)} API_KEY=sk-abcdefghijklmnopqrstuvwxyz`;
  const sanitized = sanitizeTail(tail);
  assert.ok(Buffer.byteLength(sanitized, "utf8") <= 8 * 1024);
  assert.ok(!sanitized.includes("sk-abcdefghijklmnopqrstuvwxyz"));
});

test("a hybrid local model may only break a tie, never overrule the evidence", async () => {
  // §50: the local classifier is "не authority". These four cases are the whole
  // contract — it is consulted only on abstention, its answer is bounded to the
  // four labels, its failure is not the watchdog's failure, and what it is shown
  // has already been sanitized.
  const asked: string[] = [];
  /** §M-TEST-WATCHDOG — A local model that always says "quota", and records what it saw. */
  const claimsQuota = async (tail: string) => {
    asked.push(tail);
    return "quota" as const;
  };

  assert.equal(
    await classifyWithFallback("getaddrinfo ENOTFOUND api.example.com", claimsQuota),
    "external",
    "a proven label wins; a model that disagrees is not consulted",
  );
  assert.equal(asked.length, 0);

  assert.equal(
    await classifyWithFallback("the model said something unusual", claimsQuota),
    "quota",
    "on abstention the model's label is taken",
  );

  assert.equal(
    await classifyWithFallback("the model said something unusual", undefined),
    "unknown",
    "with no local model, hybrid is deterministic",
  );

  assert.equal(
    await classifyWithFallback("still nothing recognisable", async () => "resume the run" as never),
    "unknown",
    "a label outside the closed set degrades to unknown rather than becoming an action",
  );

  assert.equal(
    await classifyWithFallback("still nothing recognisable", async () => {
      throw new Error("classifier binary is not executable");
    }),
    "unknown",
    "a broken classifier is an abstention, not a crashed watchdog",
  );

  const secret = "nothing recognisable here API_KEY=sk-abcdefghijklmnopqrstuvwxyz";
  await classifyWithFallback(secret, claimsQuota);
  assert.ok(
    !asked.join("").includes("sk-abcdefghijklmnopqrstuvwxyz"),
    "the tail reaches the local model already redacted",
  );
});

test("a pause the watchdog cannot release is left to whoever can", () => {
  for (const phase of [
    "PAUSED_EXTERNAL",
    "PAUSED_MISSING_TOOLS",
    "PAUSED_MODEL_UNAVAILABLE",
    "PAUSED_TECHNICAL_DISPUTE",
    "PAUSED_ORCHESTRATOR_BUDGET",
  ] as const) {
    const decision = decideAction(
      makeObservation({
        state: makeRun({ phase }),
        orchestratorStatus: "waiting",
        idleForMs: DEFAULT_STALL_DEADLINE_MS * 4,
      }),
      makeMemory(),
      { stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS, nowMs: 1_000_000 },
    );
    assert.equal(decision.action, "noop", `${phase} must not be resumed by the watchdog`);
  }
});

test("an unprovable effect is surfaced once, then backed off", () => {
  const state = makeRun({
    pendingOperation: {
      operationId: "op-1",
      kind: "send",
      requestDigest: "d",
      state: "uncertain",
    },
  });
  const it = harness({
    states: [["key-1/run-1", state]],
    reconcile: () => ({ operationId: "op-1", effect: "unknown" }),
  });

  return (async () => {
    const first = await it.watchdog.tick();
    assert.equal(first.decisions[0]!.action, "surface_uncertainty");
    assert.deepEqual(it.surfaced, ["run-1:send"]);
    // The generic wake would tell it to "continue from the routing table",
    // which is the one thing it must not do with an unprovable effect.
    assert.deepEqual(it.wakes, []);

    const second = await it.watchdog.tick();
    assert.equal(second.decisions[0]!.action, "backoff");
    assert.deepEqual(it.surfaced, ["run-1:send"], "surfacing repeats no faster than the backoff");
  })();
});

test("a backend that cannot be observed backs one run off, not the whole loop", async () => {
  const states: Array<[string, RunState]> = [
    ["key-1/run-1", makeRun({ runId: "run-1" })],
    ["key-1/run-2", makeRun({ runId: "run-2", stateVersion: 9 })],
  ];
  const it = harness({
    states,
    status: (state) => {
      if (state.runId === "run-1") throw new Error("ECONNREFUSED talking to the backend");
      return "running";
    },
  });

  const report = await it.watchdog.tick();
  assert.equal(report.observations, 2, "the second run is still observed");
  assert.equal(report.decisions[0]!.action, "backoff");
  assert.equal(report.decisions[1]!.action, "noop");
  assert.ok(it.logs.some((entry) => entry.outcome === "failed" && entry.runId === "run-1"));
});

test("an operation's own deadline beats the global stall constant", () => {
  const nowMs = 1_000_000;
  const pending: PendingOperation = {
    operationId: "op-2",
    kind: "wait",
    requestDigest: "d",
    state: "prepared",
    deadlineAt: new Date(nowMs + 3_600_000).toISOString(),
  };
  const decision = decideAction(
    makeObservation({
      state: makeRun({ pendingOperation: pending }),
      orchestratorStatus: "waiting",
      idleForMs: DEFAULT_STALL_DEADLINE_MS * 3,
    }),
    makeMemory(),
    { stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS, nowMs },
  );
  assert.equal(decision.action, "noop");
  assert.match(decision.reason, /own deadline/);
});

test("a quota tail is not woken into the closed window", () => {
  const decision = decideAction(
    makeObservation({
      orchestratorStatus: "waiting",
      idleForMs: DEFAULT_STALL_DEADLINE_MS * 2,
      tail: "quota",
    }),
    makeMemory(),
    { stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS, nowMs: 1_000_000 },
  );
  assert.equal(decision.action, "backoff");
});

test("a capability regression is surfaced instead of driven around", () => {
  const decision = decideAction(makeObservation(), makeMemory(), {
    stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS,
    nowMs: 1_000_000,
    capabilityRegression: ["wait is unsupported"],
  });
  assert.equal(decision.action, "surface_uncertainty");
  assert.match(decision.reason, /capability regression/);
});

test("a regression is told as a regression, even with an operation in flight", async () => {
  // The message used to be chosen by "is there a pending operation", and the
  // regression check runs *before* the reconcile branch — so a lost capability
  // was reliably announced as "reconcile your pending operation", and the one
  // prompt that names FAILED_BACKEND was never sent to anybody.
  const state = makeRun({
    pendingOperation: { operationId: "op-1", kind: "wait", requestDigest: "d", state: "prepared" },
  });
  const test1 = harness({ states: [["key-1/run-1", state]] });
  const decision = decideAction(makeObservation({ state }), makeMemory(), {
    stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS,
    nowMs: 1_000_000,
    capabilityRegression: ["stop is unsupported"],
  });

  assert.ok(decision.reason.startsWith(REGRESSION_PREFIX));
  await test1.watchdog.tick();
  assert.equal(test1.logs.length > 0, true);
});

test("a regression nobody received is surfaced again, not marked as told", async () => {
  const test1 = harness({
    states: [["key-1/run-1", makeRun()]],
    deliverable: false,
    config: makeConfig(),
  });
  const memory = makeMemory();
  const first = decideAction(makeObservation(), memory, {
    stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS,
    nowMs: 1_000_000,
    capabilityRegression: ["stop is unsupported"],
  });
  assert.equal(first.action, "surface_uncertainty");
  // Undelivered, so `surfacedRegression` stays unset and the same decision
  // recurs — instead of the run sitting blocked with one line in a log.
  assert.equal(memory.surfacedRegression, undefined);
  const second = decideAction(makeObservation(), memory, {
    stallDeadlineMs: DEFAULT_STALL_DEADLINE_MS,
    nowMs: 1_100_000,
    capabilityRegression: ["stop is unsupported"],
  });
  assert.equal(second.action, "surface_uncertainty");
  assert.equal(test1.surfaced.length, 0, "nothing was surfaced by merely deciding");
});

test("a wake is recorded before it is sent, so a crash cannot deliver it twice", async () => {
  // §50: one completion event wakes the orchestrator at most once — and the
  // criterion is persisted precisely because a watchdog that dies overnight is
  // the normal case. The flag used to be set after the call and written only
  // when the tick ended, so a process killed in between left no trace of a
  // prompt that had already arrived, and its successor delivered a second one
  // into the same session.
  const durable: Record<string, RunMemory> = {};
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const wakes: string[] = [];

  /** §M-TEST-WATCHDOG — A watchdog process sharing one durable memory file. */
  const spawnProcess = (): Watchdog =>
    new Watchdog({
      config: makeConfig(),
      clock: new FakeClock(1_000_000),
      listRuns: () => ["run-1"],
      readState: () => state,
      orchestratorStatus: async () => "waiting",
      reconcile: async (_state, operation) => ({ operationId: operation.operationId, effect: "applied" }),
      wakeOrchestrator: async () => {
        // Observed from inside the call: whatever is on disk now is all a
        // process killed mid-send would leave behind.
        wakes.push(`wake@${durable["key-1/run-1"]?.wakeSentForStateVersion ?? "unrecorded"}`);
      },
      spawnOrchestrator: async () => {},
      loadAllMemory: () => durable,
      saveMemory: (key, memory) => {
        durable[key] = { ...memory };
      },
      log: () => {},
    });

  // The prompt reaches the backend only after the record reaches disk, so a
  // process killed at any point during the send leaves the record behind.
  await spawnProcess().tick();
  assert.deepEqual(
    wakes,
    [`wake@${state.stateVersion}`],
    "the wake reached the backend before it reached disk",
  );

  // A fresh process reading that memory must not repeat it.
  await spawnProcess().tick();
  assert.deepEqual(
    wakes,
    [`wake@${state.stateVersion}`],
    "the successor delivered a second prompt for one event",
  );
});

test("a wake that observably failed gives its record back", async () => {
  // The write-ahead errs toward not-resending, which is right for a crash: the
  // prompt may already be in the session. A call that *returned* an error is a
  // different claim — nothing was delivered — and keeping the record would
  // strand the run behind a wake it never received.
  const durable: Record<string, RunMemory> = {};
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  let attempts = 0;

  const watchdog = new Watchdog({
    config: makeConfig(),
    clock: new FakeClock(1_000_000),
    listRuns: () => ["run-1"],
    readState: () => state,
    orchestratorStatus: async () => "waiting",
    reconcile: async (_state, operation) => ({ operationId: operation.operationId, effect: "applied" }),
    wakeOrchestrator: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("the backend refused the connection");
    },
    spawnOrchestrator: async () => {},
    loadAllMemory: () => durable,
    saveMemory: (key, memory) => {
      durable[key] = { ...memory };
    },
    log: () => {},
  });

  await watchdog.tick();
  assert.equal(durable["key-1/run-1"]?.wakeSentForStateVersion, undefined, "a refusal is not a delivery");
  await watchdog.tick();
  assert.equal(attempts, 2, "the run is still reachable after a failed attempt");
});

test("bookkeeping the watchdog cannot read is not read as nothing sent", async () => {
  // A corrupt `watchdog-memory.json` used to answer `{}` — "no wake has been
  // delivered to any run" — which is the one answer that causes an effect, and
  // for every live run at once. The wake and the uncertainty prompt are the two
  // things the watchdog sends without a write-ahead record, so this file *is*
  // their dedupe.
  //
  // Three runs, not one, and a fake that is a model of the *medium*: a write is
  // visible to the next read, and repairing the file repairs it for everybody.
  // The first version of this test asserted over one run with a `loadMemory`
  // that ignored what `saveMemory` had written, and stayed green against an
  // implementation that protected the first run and woke the other two — the
  // seed rewrote the file, so every later run in the same tick was told the
  // bookkeeping was fine and merely silent about it.
  const runIds = ["run-a", "run-b", "run-c"];
  const states = Object.fromEntries(
    runIds.map((runId) => [runId, makeRun({ runId, updatedAt: new Date(0).toISOString() })]),
  );
  const wakes: string[] = [];

  let corrupt = true;
  const durable: Record<string, RunMemory> = {};
  const clock = new FakeClock(1_000_000);

  /** §M-TEST-WATCHDOG — A watchdog over one shared, possibly unreadable, memory file. */
  const watchdog = (): Watchdog =>
    new Watchdog({
      config: makeConfig(),
      clock,
      listRuns: () => runIds,
      readState: (_projectKey, runId) => states[runId],
      orchestratorStatus: async () => "waiting",
      reconcile: async (_state, operation) => ({ operationId: operation.operationId, effect: "applied" }),
      wakeOrchestrator: async (state) => {
        wakes.push(state.runId);
      },
      spawnOrchestrator: async () => {},
      loadAllMemory: () => (corrupt ? MEMORY_UNREADABLE : durable),
      saveMemory: (key, memory) => {
        // Writing repairs the file — which is exactly what made the per-key
        // version of this guard protect only whichever run came first.
        corrupt = false;
        durable[key] = { ...memory };
      },
      log: () => {},
    });

  await watchdog().tick();
  assert.deepEqual(wakes, [], "a lost record is assumed to be a record of a delivery");

  // Every run is seeded, not just the one whose save happened to repair the
  // file, and the seed is durable so it survives a restart.
  for (const runId of runIds) {
    assert.equal(
      durable[`key-1/${runId}`]?.wakeSentForStateVersion,
      states[runId]!.stateVersion,
      `${runId} carries the conservative seed`,
    );
    assert.equal(durable[`key-1/${runId}`]?.dedupeLost, undefined, "and it is not itself a loss");
  }

  // The suppression is bounded by the state it was seeded for: once a run has
  // moved on and gone quiet again, a wake is available. Otherwise one
  // unreadable file would disable waking for the rest of every run's life.
  states["run-b"]!.stateVersion += 1;
  const recovered = watchdog();
  await recovered.tick(); // notices the progress and restarts the stall clock
  clock.advance(30 * 60_000);
  await recovered.tick();
  assert.deepEqual(wakes, ["run-b"], "the run that moved on may be woken, and only it");
});

test("a lost record suppresses the capability regression prompt too", async () => {
  // The seed covers three dedupes, and this is the one that is not keyed by a
  // state version: `surfacedRegression` is compared by the regression's own
  // text, so a slot rebuilt without it let one capability-regression prompt out
  // per lost file. It is the mildest of the three — a regression is current
  // state rather than a past event, so repeating it is at least true — but the
  // claim being made is "no unsolicited prompt", and two out of three is not
  // that claim.
  const state = makeRun({ updatedAt: new Date(0).toISOString() });
  const durable: Record<string, RunMemory> = {};
  const surfaced: string[] = [];
  let corrupt = true;

  const watchdog = new Watchdog({
    config: makeConfig(),
    clock: new FakeClock(1_000_000),
    listRuns: () => ["run-1"],
    readState: () => state,
    orchestratorStatus: async () => "waiting",
    reconcile: async (_state, operation) => ({ operationId: operation.operationId, effect: "applied" }),
    wakeOrchestrator: async () => {},
    spawnOrchestrator: async () => {},
    capabilityRegression: async () => ["stop is no longer supported"],
    surfaceUncertainty: async (_state, _operation, reason) => {
      surfaced.push(reason);
      return true;
    },
    loadAllMemory: () => (corrupt ? MEMORY_UNREADABLE : durable),
    saveMemory: (key, memory) => {
      corrupt = false;
      durable[key] = { ...memory };
    },
    log: () => {},
  });

  await watchdog.tick();
  assert.deepEqual(surfaced, [], "the regression is assumed to have been reported already");
  assert.equal(
    durable["key-1/run-1"]?.surfacedRegression,
    "stop is no longer supported",
    "seeded with the regression that is current, which is the only one it could be",
  );
});
