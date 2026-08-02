/**
 * §M-TEST-CAPABILITY-SUITE — The suite's own claims, checked against a backend
 * whose misbehaviour is chosen rather than hoped for.
 *
 * A capability suite is only worth what its checks would catch, and a check
 * written against a cooperative backend proves nothing about the day the
 * backend stops cooperating. The fake here can be told to lose a turn or to
 * hand one session's output to another — the two failures §20's "concurrent
 * completions" exists to name — so the check can be made to fail on demand.
 *
 * Verifies §A-BACKEND-CONTRACT.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { FakeClock } from "../dist/core/clock.mjs";
import { runFullSuite, type SuiteReport } from "../dist/adapters/capability-suite.mjs";
import type {
  AdapterCapabilities,
  CapabilityReport,
  DeliveryResult,
  ExpectedState,
  ModelRef,
  PendingOperation,
  ReconcileResult,
  SessionAdapter,
  SessionOutput,
  SessionRef,
  SessionStatus,
  SpawnRequest,
} from "../dist/core/types.mjs";

/** §M-TEST-CAPABILITY-SUITE — The model every probe session is spawned on. */
const MODEL: ModelRef = { route: "claude", vendor: "anthropic", family: "claude", model: "opus" };

/** §M-TEST-CAPABILITY-SUITE — A backend that claims everything, so behaviour decides. */
const CAPABILITIES: AdapterCapabilities = {
  deliveryReceipt: true,
  idempotencyKey: true,
  statusRead: true,
  wait: true,
  nativeResume: true,
  stop: true,
  concurrentSessions: true,
};

/** §M-TEST-CAPABILITY-SUITE — How the fake backend should mishandle a turn. */
type Misbehaviour = "none" | "cross-wire" | "lose-turn";

/**
 * §M-TEST-CAPABILITY-SUITE — An in-memory backend whose panes are plain strings.
 *
 * Every send appends to the addressed session's pane, which is what a real
 * terminal-backed backend does and what makes the token check meaningful: the
 * prompt lands in the pane whether or not a model ever answers.
 */
class FakeBackend implements SessionAdapter {
  /** §M-TEST-CAPABILITY-SUITE — Pane text per session id, appended to by every send that reaches it. */
  private readonly panes = new Map<string, string>();
  /** §M-TEST-CAPABILITY-SUITE — Monotonic source of session ids, so `fake-2` is always the second spawn. */
  private counter = 0;
  /** §M-TEST-CAPABILITY-SUITE — How this backend mishandles the second session's turn, if at all. */
  private readonly misbehaviour: Misbehaviour;

  constructor(misbehaviour: Misbehaviour = "none") {
    this.misbehaviour = misbehaviour;
  }

  /** §M-TEST-CAPABILITY-SUITE — Claim every capability; the probes decide the truth. */
  async capabilities(): Promise<AdapterCapabilities> {
    return CAPABILITIES;
  }

  /** §M-TEST-CAPABILITY-SUITE — The same claim in matrix form. */
  async capabilityReport(): Promise<CapabilityReport> {
    const matrix = Object.fromEntries(
      Object.keys(CAPABILITIES).map((key) => [key, { grade: "supported", detail: "fake" }]),
    ) as CapabilityReport["matrix"];
    return {
      backend: "herdr",
      capabilities: CAPABILITIES,
      matrix,
      completionCritical: ["statusRead", "stop"],
      blocked: false,
      blockingReasons: [],
    };
  }

  /** §M-TEST-CAPABILITY-SUITE — Open a numbered pane for a role. */
  async spawn(request: SpawnRequest): Promise<SessionRef> {
    this.counter += 1;
    const sessionId = `fake-${this.counter}`;
    this.panes.set(sessionId, `pane for ${request.role}\n`);
    return { backend: "herdr", sessionId, role: request.role, generation: 1 };
  }

  /** §M-TEST-CAPABILITY-SUITE — Append the message wherever the misbehaviour sends it. */
  async send(session: SessionRef, operationId: string, message: string): Promise<DeliveryResult> {
    const target = this.misdirect(session.sessionId);
    if (target !== undefined) this.panes.set(target, `${this.panes.get(target) ?? ""}${message}\n`);
    return { operationId, status: "acknowledged", receipt: `receipt-${operationId}` };
  }

  /** §M-TEST-CAPABILITY-SUITE — Where this send actually lands, if anywhere. */
  private misdirect(sessionId: string): string | undefined {
    if (this.misbehaviour === "none" || sessionId !== "fake-2") return sessionId;
    return this.misbehaviour === "cross-wire" ? "fake-1" : undefined;
  }

  /** §M-TEST-CAPABILITY-SUITE — Always alive; liveness is not what these tests probe. */
  async status(_session: SessionRef): Promise<SessionStatus> {
    return "waiting";
  }

  /** §M-TEST-CAPABILITY-SUITE — The whole pane, cursor at its end. */
  async read(session: SessionRef, _cursor?: string): Promise<SessionOutput> {
    const text = this.panes.get(session.sessionId) ?? "";
    return { cursor: String(text.length), text, terminal: false };
  }

  /** §M-TEST-CAPABILITY-SUITE — Settle immediately; the panes already hold the answer. */
  async wait(_session: SessionRef, _expected: ExpectedState): Promise<SuiteWait> {
    return { status: "waiting" };
  }

  /** §M-TEST-CAPABILITY-SUITE — Native resume returns the same handle. */
  async resume(session: SessionRef): Promise<SessionRef> {
    return session;
  }

  /** §M-TEST-CAPABILITY-SUITE — Nothing here is ever uncertain. */
  async reconcile(operation: PendingOperation): Promise<ReconcileResult> {
    return { effect: "applied", operationId: operation.operationId };
  }

  /** §M-TEST-CAPABILITY-SUITE — Stop always succeeds, so cleanup never masks a failure. */
  async stop(_session: SessionRef): Promise<"stopped" | "already_terminal" | "unknown"> {
    return "stopped";
  }
}

/** §M-TEST-CAPABILITY-SUITE — The narrow shape `wait` owes the suite. */
interface SuiteWait {
  status: SessionStatus;
  cursor?: string;
}

/** §M-TEST-CAPABILITY-SUITE — Run the full suite against a fake and find one check. */
async function gradeOf(misbehaviour: Misbehaviour, id: string): Promise<SuiteReport["checks"][0]> {
  const report = await runFullSuite({
    adapter: new FakeBackend(misbehaviour),
    backend: "herdr",
    cwd: "/nonexistent",
    model: MODEL,
    clock: new FakeClock(),
  });
  const check = report.checks.find((candidate) => candidate.id === id);
  assert.ok(check, `${id} is missing from the report`);
  return check;
}

test("two turns issued together are each proved to have landed in their own session", async () => {
  const check = await gradeOf("none", "concurrent-completions");
  assert.equal(check.grade, "supported");
  assert.match(check.detail, /each completed in their own session/);
});

test("a backend that hands one session's turn to another fails the concurrency check", async () => {
  // §20 asks the suite to exercise concurrent completions, and the check it had
  // only compared two `status()` calls — which a cross-wired backend passes,
  // because both sessions are alive and neither status mentions whose turn it
  // was. The orchestrator would then wait forever on a completion it had
  // already been handed under the wrong session.
  const check = await gradeOf("cross-wire", "concurrent-completions");
  assert.equal(check.grade, "unsupported");
  assert.match(check.detail, /surfaced in the other session's output/);
});

test("a turn that leaves no trace at all is reported, not counted as concurrency", async () => {
  const check = await gradeOf("lose-turn", "concurrent-completions");
  assert.equal(check.grade, "degraded");
  assert.match(check.detail, /left no trace in their own session/);
});
