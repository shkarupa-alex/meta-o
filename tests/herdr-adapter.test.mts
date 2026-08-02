/**
 * §M-TEST-HERDR — Acceptance tests for the Herdr backend adapter.
 *
 * Covers the §20 acceptance list for backends: a crash at any point of a side
 * effect must not produce a duplicate action. The adapter has no idempotency
 * key to lean on, so these tests pin down exactly when it is allowed to say
 * `applied`, when `not_applied`, and when it must admit `unknown`.
 *
 * The Herdr CLI is replaced by a scripted runner, so the suite runs without a
 * server while still exercising the real argument construction and JSON parsing.
 *
 * Verifies §A-BACKEND-CONTRACT.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { HerdrAdapter, type HerdrAgentInfo } from "../dist/adapters/herdr.mjs";
import {
  agentNameFor,
  decodeSessionId,
  defaultModelArgs,
  encodeSessionId,
  type HerdrExecResult,
} from "../dist/adapters/herdr-protocol.mjs";
import { COMPLETION_CRITICAL } from "../dist/adapters/adapter.mjs";
import { FakeClock } from "../dist/core/clock.mjs";
import type { ModelRef, PendingOperation, SessionRef } from "../dist/core/types.mjs";

/** §M-TEST-HERDR — A scripted Herdr CLI. */
interface FakeHerdr {
  exec: (args: string[], timeoutMs: number) => Promise<HerdrExecResult>;
  calls: string[][];
  agents: Map<string, HerdrAgentInfo>;
  panes: Set<string>;
  paneText: Map<string, string>;
}

/** §M-TEST-HERDR — Build an agent info record with defaults. */
function agentInfo(overrides: Partial<HerdrAgentInfo> & { pane_id: string }): HerdrAgentInfo {
  return {
    agent_status: "idle",
    revision: 1,
    state_change_seq: 1,
    interactive_ready: true,
    launch_pending: false,
    ...overrides,
  };
}

/** §M-TEST-HERDR — Successful CLI response envelope. */
function ok(result: Record<string, unknown>): HerdrExecResult {
  return { code: 0, stdout: JSON.stringify({ id: "1", result }), stderr: "" };
}

/** §M-TEST-HERDR — Server-error CLI response envelope. */
function serverError(code: string, message: string): HerdrExecResult {
  return { code: 1, stdout: "", stderr: JSON.stringify({ id: "1", error: { code, message } }) };
}

/**
 * §M-TEST-HERDR — A fake Herdr that behaves like the documented CLI.
 *
 * Modelled on the real command surface rather than on the adapter's
 * expectations, so a wrong flag or a misread field shows up as a test failure
 * instead of a mutually consistent fiction.
 */
function fakeHerdr(seed: Partial<FakeHerdr> = {}): FakeHerdr {
  const calls: string[][] = [];
  const agents = seed.agents ?? new Map<string, HerdrAgentInfo>();
  const panes = seed.panes ?? new Set<string>();
  const paneText = seed.paneText ?? new Map<string, string>();
  let nextPane = 1;

  const exec = async (args: string[]): Promise<HerdrExecResult> => {
    calls.push(args);
    const [group, verb, target] = args;

    if (group === "agent" && verb === "list") return ok({ type: "agent_list", agents: [...agents.values()] });

    if (group === "agent" && verb === "get") {
      const info = agents.get(target!);
      return info ? ok({ type: "agent_info", agent: info }) : serverError("agent_not_found", "no such agent");
    }

    if (group === "agent" && verb === "start") {
      const paneIndex = args.indexOf("--pane");
      const pane = args[paneIndex + 1]!;
      agents.set(target!, agentInfo({ pane_id: pane, name: target!, agent_status: "idle" }));
      return ok({ type: "agent_started", agent: agents.get(target!), argv: args });
    }

    if (group === "agent" && verb === "prompt") {
      const info = agents.get(target!);
      if (!info) return serverError("agent_not_found", "no such agent");
      info.state_change_seq = (info.state_change_seq ?? 0) + 1;
      info.revision += 1;
      info.agent_status = "idle";
      paneText.set(info.pane_id, `${paneText.get(info.pane_id) ?? ""}\n${args[3]}`);
      return ok({ type: "agent_prompted", agent: info });
    }

    if (group === "agent" && verb === "read") {
      const info = agents.get(target!);
      if (!info) return serverError("agent_not_found", "no such agent");
      return ok({
        type: "pane_read",
        read: {
          pane_id: info.pane_id,
          text: paneText.get(info.pane_id) ?? "",
          revision: info.revision,
          truncated: false,
        },
      });
    }

    if (group === "agent" && verb === "wait") {
      const info = agents.get(target!);
      return info ? ok({ type: "agent_info", agent: info }) : serverError("agent_not_found", "gone");
    }

    if (group === "pane" && verb === "split") {
      const paneId = `w1:p${(nextPane += 1)}`;
      panes.add(paneId);
      return ok({ type: "pane_info", pane: { pane_id: paneId } });
    }

    if (group === "pane" && verb === "get") {
      return panes.has(target!) ? ok({ type: "pane_info", pane: { pane_id: target } }) : serverError("pane_not_found", "gone");
    }

    if (group === "pane" && verb === "close") {
      panes.delete(target!);
      for (const [name, info] of agents) if (info.pane_id === target) agents.delete(name);
      return ok({ type: "pane_info", pane: { pane_id: target } });
    }

    return serverError("unhandled", `fake herdr does not implement ${args.join(" ")}`);
  };

  return { exec, calls, agents, panes, paneText };
}

/** §M-TEST-HERDR — Model reference used across the tests. */
const MODEL: ModelRef = { route: "claude", vendor: "anthropic", family: "claude", model: "opus" };

test("session handles round-trip through their encoded form", () => {
  const encoded = encodeSessionId("mo-executor-abc", "w1:p3", true);
  assert.deepEqual(decodeSessionId(encoded), {
    agentName: "mo-executor-abc",
    paneId: "w1:p3",
    ownedPane: true,
  });
  assert.throws(() => decodeSessionId("garbage"), /malformed herdr session id/);
});

test("derived agent names satisfy the Herdr grammar and are deterministic", () => {
  const first = agentNameFor("mo-", "reviewerCrossVendor", "op-1");
  const second = agentNameFor("mo-", "reviewerCrossVendor", "op-1");
  assert.equal(first, second, "the same operation must derive the same agent name");
  assert.notEqual(first, agentNameFor("mo-", "reviewerCrossVendor", "op-2"));
  assert.match(first, /^[a-z][a-z0-9_-]{0,31}$/);
});

test("model arguments are built per route", () => {
  assert.deepEqual(defaultModelArgs(MODEL), ["--model", "opus"]);
  assert.deepEqual(
    defaultModelArgs({ route: "opencode", vendor: "x", family: "y", model: "m", providerId: "p" }),
    ["--model", "p/m"],
  );
});

test("the capability matrix is honest about what Herdr lacks", async () => {
  const herdr = fakeHerdr();
  const adapter = new HerdrAdapter({ exec: herdr.exec });
  const report = await adapter.capabilityReport();

  assert.equal(report.matrix.idempotencyKey.grade, "unsupported");
  assert.equal(report.matrix.deliveryReceipt.grade, "degraded");
  assert.equal(report.matrix.statusRead.grade, "supported");
  assert.equal(report.capabilities.idempotencyKey, false);
  assert.equal(report.blocked, false, "no completion-critical capability is missing");
  assert.deepEqual(report.completionCritical, COMPLETION_CRITICAL);
});

test("an unreachable socket blocks the backend", async () => {
  const adapter = new HerdrAdapter({
    exec: async () => serverError("connection_refused", "socket is not listening"),
  });
  const report = await adapter.capabilityReport();
  assert.equal(report.blocked, true);
  assert.ok(report.blockingReasons.some((reason) => reason.includes("statusRead")));
});

test("spawn creates a pane in the requested directory and starts the agent", async () => {
  const herdr = fakeHerdr();
  const adapter = new HerdrAdapter({ exec: herdr.exec, paneId: "w1:p1" });

  const session = await adapter.spawn({
    operationId: "op-1",
    role: "executor",
    model: MODEL,
    prompt: "do the work",
    cwd: "/repo",
  });

  const split = herdr.calls.find((call) => call[0] === "pane" && call[1] === "split");
  assert.ok(split);
  assert.ok(split.includes("--cwd"));
  assert.equal(split[split.indexOf("--cwd") + 1], "/repo");
  assert.ok(split.includes("--no-focus"), "background work must not steal user focus");

  const start = herdr.calls.find((call) => call[0] === "agent" && call[1] === "start");
  assert.ok(start);
  assert.equal(start[start.indexOf("--kind") + 1], "claude");
  assert.equal(decodeSessionId(session.sessionId).ownedPane, true);
});

test("spawn does not create a second agent for the same operation", async () => {
  const herdr = fakeHerdr();
  const adapter = new HerdrAdapter({ exec: herdr.exec, paneId: "w1:p1" });
  const request = {
    operationId: "op-1",
    role: "executor" as const,
    model: MODEL,
    prompt: "work",
    cwd: "/repo",
  };

  const first = await adapter.spawn(request);
  const second = await adapter.spawn(request);

  assert.equal(first.sessionId, second.sessionId);
  assert.equal(herdr.calls.filter((call) => call[1] === "start").length, 1);
});

test("send acknowledges a delivery and reports a receipt", async () => {
  const herdr = fakeHerdr();
  const adapter = new HerdrAdapter({ exec: herdr.exec, paneId: "w1:p1" });
  const session = await adapter.spawn({
    operationId: "op-1",
    role: "executor",
    model: MODEL,
    prompt: "x",
    cwd: "/repo",
  });

  const delivery = await adapter.send(session, "op-2", "please review the diff");
  assert.equal(delivery.status, "acknowledged");
  assert.ok(delivery.receipt);

  const prompt = herdr.calls.find((call) => call[1] === "prompt");
  assert.ok(prompt?.includes("--wait"));
});

test("a stalled prompt is reported as unknown rather than acknowledged", async () => {
  const adapter = new HerdrAdapter({
    exec: async (args) =>
      args[1] === "prompt"
        ? serverError("agent_prompt_stalled", "no lifecycle change within 5s")
        : ok({ type: "agent_info", agent: agentInfo({ pane_id: "w1:p2", name: "a" }) }),
  });
  const session: SessionRef = {
    backend: "herdr",
    sessionId: encodeSessionId("a", "w1:p2", true),
    role: "executor",
    generation: 1,
  };
  const delivery = await adapter.send(session, "op-3", "hello");
  assert.equal(delivery.status, "unknown");
});

test("Herdr lifecycle states map onto workflow session statuses", async () => {
  const cases: Array<[Partial<HerdrAgentInfo>, string]> = [
    [{ agent_status: "working" }, "running"],
    [{ agent_status: "idle" }, "waiting"],
    [{ agent_status: "done" }, "waiting"],
    [{ agent_status: "blocked" }, "waiting"],
    [{ agent_status: "unknown" }, "unknown"],
    [{ agent_status: "idle", launch_pending: true }, "starting"],
    [{ agent_status: "idle", interactive_ready: false }, "starting"],
  ];

  for (const [overrides, expected] of cases) {
    const agents = new Map([["a", agentInfo({ pane_id: "w1:p2", name: "a", ...overrides })]]);
    const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents }).exec });
    const status = await adapter.status({
      backend: "herdr",
      sessionId: encodeSessionId("a", "w1:p2", true),
      role: "executor",
      generation: 1,
    });
    assert.equal(status, expected, `agent_status ${JSON.stringify(overrides)}`);
  }
});

test("an exited agent whose pane survives is complete, a vanished pane is stopped", async () => {
  const withPane = new HerdrAdapter({ exec: fakeHerdr({ panes: new Set(["w1:p2"]) }).exec });
  const withoutPane = new HerdrAdapter({ exec: fakeHerdr().exec });
  const session: SessionRef = {
    backend: "herdr",
    sessionId: encodeSessionId("gone", "w1:p2", true),
    role: "executor",
    generation: 1,
  };

  assert.equal(await withPane.status(session), "complete");
  assert.equal(await withoutPane.status(session), "stopped");
});

test("reconcile proves a spawn happened by finding the named agent", async () => {
  const agents = new Map([["mo-executor-1", agentInfo({ pane_id: "w1:p2", name: "mo-executor-1" })]]);
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents }).exec });
  const operation: PendingOperation = {
    operationId: "op-1",
    kind: "spawn",
    requestDigest: "d",
    state: "prepared",
    probe: JSON.stringify({ agentName: "mo-executor-1", paneId: "w1:p2" }),
  };
  assert.equal((await adapter.reconcile(operation)).effect, "applied");
});

test("reconcile reports not_applied when neither the agent nor its pane exists", async () => {
  const adapter = new HerdrAdapter({ exec: fakeHerdr().exec });
  const operation: PendingOperation = {
    operationId: "op-1",
    kind: "spawn",
    requestDigest: "d",
    state: "prepared",
    probe: JSON.stringify({ agentName: "missing", paneId: "w1:p9" }),
  };
  assert.equal((await adapter.reconcile(operation)).effect, "not_applied");
});

test("reconcile admits it does not know when a pane survived without its agent", async () => {
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ panes: new Set(["w1:p9"]) }).exec });
  const operation: PendingOperation = {
    operationId: "op-1",
    kind: "spawn",
    requestDigest: "d",
    state: "prepared",
    probe: JSON.stringify({ agentName: "missing", paneId: "w1:p9" }),
  };
  assert.equal((await adapter.reconcile(operation)).effect, "unknown");
});

test("an advanced state_change_seq alone never proves a delivery", async () => {
  // The sequence advances on any lifecycle change, so a worker finishing the
  // turn it was already running is indistinguishable from a prompt arriving.
  const agents = new Map([["a", agentInfo({ pane_id: "w1:p2", name: "a", state_change_seq: 9 })]]);
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents }).exec });
  const operation: PendingOperation = {
    operationId: "op-1",
    kind: "send",
    requestDigest: "d",
    state: "prepared",
    probe: JSON.stringify({ agentName: "a", paneId: "w1:p2", seq: 4 }),
  };
  assert.equal((await adapter.reconcile(operation)).effect, "unknown");
});

test("a settled worker that moved on since the probe is unknown, not undelivered", async () => {
  const agents = new Map([
    ["a", agentInfo({ pane_id: "w1:p2", name: "a", state_change_seq: 9, agent_status: "idle" })],
  ]);
  const paneText = new Map([["w1:p2", "unrelated output"]]);
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents, paneText }).exec });
  const operation: PendingOperation = {
    operationId: "op-1",
    kind: "send",
    requestDigest: "d",
    state: "prepared",
    probe: JSON.stringify({ agentName: "a", paneId: "w1:p2", seq: 4, marker: "review the diff" }),
  };
  assert.equal((await adapter.reconcile(operation)).effect, "unknown");
});

test("reconcile finds an undelivered prompt when the tail lacks its marker", async () => {
  const agents = new Map([["a", agentInfo({ pane_id: "w1:p2", name: "a", state_change_seq: 4, agent_status: "idle" })]]);
  const paneText = new Map([["w1:p2", "unrelated output"]]);
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents, paneText }).exec });
  const operation: PendingOperation = {
    operationId: "op-1",
    kind: "send",
    requestDigest: "d",
    state: "prepared",
    probe: JSON.stringify({ agentName: "a", paneId: "w1:p2", seq: 4, marker: "review the diff" }),
  };
  assert.equal((await adapter.reconcile(operation)).effect, "not_applied");
});

test("reconcile accepts a delivery whose marker is visible in the tail", async () => {
  const agents = new Map([["a", agentInfo({ pane_id: "w1:p2", name: "a", state_change_seq: 4, agent_status: "working" })]]);
  const paneText = new Map([["w1:p2", "> please review the diff carefully"]]);
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents, paneText }).exec });
  const operation: PendingOperation = {
    operationId: "op-1",
    kind: "send",
    requestDigest: "d",
    state: "prepared",
    probe: JSON.stringify({ agentName: "a", paneId: "w1:p2", seq: 4, marker: "please review the diff" }),
  };
  assert.equal((await adapter.reconcile(operation)).effect, "applied");
});

test("reconcile without a probe never guesses", async () => {
  const adapter = new HerdrAdapter({ exec: fakeHerdr().exec });
  const operation: PendingOperation = {
    operationId: "op-1",
    kind: "send",
    requestDigest: "d",
    state: "prepared",
  };
  assert.equal((await adapter.reconcile(operation)).effect, "unknown");
});

test("a prepared probe captures the pre-send sequence and marker", async () => {
  const agents = new Map([["a", agentInfo({ pane_id: "w1:p2", name: "a", state_change_seq: 11 })]]);
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents }).exec });
  const probe = JSON.parse(
    await adapter.prepareProbe(
      { backend: "herdr", sessionId: encodeSessionId("a", "w1:p2", true), role: "executor", generation: 1 },
      "  Review   the diff  ",
    ),
  );
  assert.equal(probe.seq, 11);
  assert.equal(probe.marker, "Review the diff");
});

test("stop closes only panes the adapter created", async () => {
  const herdr = fakeHerdr({
    agents: new Map([["a", agentInfo({ pane_id: "w1:p2", name: "a" })]]),
    panes: new Set(["w1:p2"]),
  });
  const adapter = new HerdrAdapter({ exec: herdr.exec });

  const borrowed: SessionRef = {
    backend: "herdr",
    sessionId: encodeSessionId("a", "w1:p2", false),
    role: "executor",
    generation: 1,
  };
  assert.equal(await adapter.stop(borrowed), "unknown");
  assert.equal(herdr.panes.has("w1:p2"), true, "a borrowed pane must survive");

  const owned: SessionRef = { ...borrowed, sessionId: encodeSessionId("a", "w1:p2", true) };
  assert.equal(await adapter.stop(owned), "stopped");
  assert.equal(herdr.panes.has("w1:p2"), false);
});

test("stopping an already gone session is reported as terminal, not an error", async () => {
  const adapter = new HerdrAdapter({ exec: fakeHerdr().exec });
  const session: SessionRef = {
    backend: "herdr",
    sessionId: encodeSessionId("gone", "w1:p2", true),
    role: "executor",
    generation: 1,
  };
  assert.equal(await adapter.stop(session), "already_terminal");
});

test("resume confirms liveness and refuses to invent a session", async () => {
  const agents = new Map([["a", agentInfo({ pane_id: "w1:p2", name: "a" })]]);
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents }).exec });
  const alive: SessionRef = {
    backend: "herdr",
    sessionId: encodeSessionId("a", "w1:p2", true),
    role: "executor",
    generation: 1,
  };
  assert.equal((await adapter.resume(alive)).sessionId, alive.sessionId);

  const dead: SessionRef = { ...alive, sessionId: encodeSessionId("gone", "w1:p2", true) };
  await assert.rejects(() => adapter.resume(dead), /cannot be resumed/);
});

test("a terminal wait stops at its deadline instead of hanging", async () => {
  const clock = new FakeClock(0);
  const agents = new Map([["a", agentInfo({ pane_id: "w1:p2", name: "a", agent_status: "working" })]]);
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents }).exec, clock });

  const result = await adapter.wait(
    { backend: "herdr", sessionId: encodeSessionId("a", "w1:p2", true), role: "executor", generation: 1 },
    { terminal: true, deadlineAt: new Date(10_000).toISOString() },
  );
  assert.equal(result.status, "running");
  assert.ok(clock.now() >= 10_000);
});

test("reads return the pane revision as a cursor and suppress unchanged text", async () => {
  const agents = new Map([["a", agentInfo({ pane_id: "w1:p2", name: "a", revision: 42 })]]);
  const paneText = new Map([["w1:p2", "some output"]]);
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents, paneText }).exec });
  const session: SessionRef = {
    backend: "herdr",
    sessionId: encodeSessionId("a", "w1:p2", true),
    role: "executor",
    generation: 1,
  };

  const first = await adapter.read(session);
  assert.equal(first.cursor, "42");
  assert.equal(first.text, "some output");

  const second = await adapter.read(session, "42");
  assert.equal(second.text, "", "an unchanged revision yields no new text");
});

test("secrets in pane output are redacted before the orchestrator sees them", async () => {
  const agents = new Map([["a", agentInfo({ pane_id: "w1:p2", name: "a" })]]);
  const paneText = new Map([["w1:p2", "export API_TOKEN=sk-abcdefghijklmnopqrstuvwx"]]);
  const adapter = new HerdrAdapter({ exec: fakeHerdr({ agents, paneText }).exec });
  const output = await adapter.read({
    backend: "herdr",
    sessionId: encodeSessionId("a", "w1:p2", true),
    role: "executor",
    generation: 1,
  });
  assert.ok(!output.text.includes("sk-abcdefghijklmnopqrstuvwx"));
  assert.ok(output.text.includes("[redacted]"));
});
