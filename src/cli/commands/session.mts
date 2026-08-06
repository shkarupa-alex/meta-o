/**
 * §M-CLI-SESSION — CLI surface for every backend side effect of a run.
 *
 * Implements §A-BACKEND-CONTRACT. The normative sequence around `spawn`, `send`,
 * `wait` and `stop` — write the intent, call the backend, observe the effect,
 * only then clear the intent — is the one part of the methodology a prompt is
 * least able to be trusted with: skipping step one costs nothing until the
 * process dies between steps two and three, and then it costs a duplicated
 * worker or a duplicated instruction. Encoding the sequence here means an
 * orchestrator that simply calls these commands cannot get it wrong, and an
 * orchestrator that calls `herdr` directly is visibly off-protocol.
 */

import { randomUUID } from "node:crypto";
import { HerdrAdapter } from "../../adapters/herdr.mjs";
import { frameTurnPrompt } from "../../adapters/herdr-protocol.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import {
  clearPendingOperation,
  readSettings,
  readState,
  withPendingOperation,
} from "../../core/state-store.mjs";
import { readCapabilityBaseline, requireSupportedBackend } from "./backend.mjs";
import {
  digestOf,
  modelFor,
  roleOf,
  sessionFor,
  withSession,
  withSessionTurn,
  withoutSession,
} from "./session-state.mjs";
import {
  assertNoPendingOperation,
  markUncertain,
  mutate,
  prepare,
  recordPane,
  finishAdoptedOrchestratorSpawn,
  settleReconciled,
} from "./write-ahead.mjs";
import { BackendUnavailableError, COMPLETION_CRITICAL } from "../../adapters/adapter.mjs";
import { REPORTED_PREFIX } from "../../adapters/capability-suite.mjs";
import { assertTransition } from "../../core/fsm.mjs";
import { redact } from "../../core/redact.mjs";
import type {
  DeliveryResult,
  PendingOperation,
  Role,
  RunState,
  SessionRef,
  WaitResult,
} from "../../core/types.mjs";
import {
  boolFlag,
  emit,
  fail,
  optionalFlag,
  readStdin,
  requireFlag,
  type ParsedArgs,
} from "../args.mjs";

/** §M-CLI-SESSION — Resolve project, run and adapter for one command. */
interface SessionContext {
  projectKey: string;
  repoDir: string;
  runId: string;
  state: RunState;
  adapter: HerdrAdapter;
}

/** §M-CLI-SESSION — Build the context every session command needs. */
function contextOf(args: ParsedArgs): SessionContext {
  const identity = resolveProjectIdentity(optionalFlag(args, "cwd") ?? process.cwd());
  const runId = requireFlag(args, "run-id");
  const state = readState(identity.projectKey, runId);
  if (!state) fail("unknown_run", `run ${runId} has no state under project ${identity.projectKey}`);

  requireSupportedBackend(readSettings(identity.projectKey)?.backend, optionalFlag(args, "backend"));
  assertBackendUsable();

  return {
    projectKey: identity.projectKey,
    repoDir: identity.canonicalPath,
    runId,
    state,
    adapter: herdrAdapter(),
  };
}

/**
 * §M-CLI-SESSION — Refuse to drive a backend the last full suite found broken.
 *
 * §20 says an unsupported completion-critical capability blocks the backend,
 * and that rule reached only preflight and the installer — the session commands
 * checked the backend's *name* and nothing else, so a backend that had lost
 * `stop` since the last preflight went on being driven until the run needed the
 * thing it could not do. `BackendUnavailableError` existed for exactly this and
 * was thrown nowhere.
 *
 * Read from the recorded baseline, not by calling the backend: this runs before
 * every session command, and a capability probe per command would be both slow
 * and a side effect of its own. A backend with no baseline is not refused —
 * that is the state before the first full suite, and preflight already says so.
 */
function assertBackendUsable(): void {
  const baseline = readCapabilityBaseline();
  if (!baseline) return;
  const broken = COMPLETION_CRITICAL.filter(
    (capability) => baseline.grades[`${REPORTED_PREFIX}${capability}`] === "unsupported",
  );
  if (broken.length === 0) return;
  const error = new BackendUnavailableError(
    "herdr",
    broken.map((capability) => `completion-critical capability ${capability} is unsupported`),
  );
  fail("backend_unavailable", error.message, {
    recordedAt: baseline.recordedAt,
    remedy: "fix the backend and re-run `meta-o capability-suite run --full`",
  });
}

/**
 * §M-CLI-SESSION — Construct the Herdr adapter.
 *
 * `META_O_HERDR_BIN` exists so the protocol can be exercised against a scripted
 * stand-in: the write-ahead sequence is the part most worth testing and the part
 * hardest to test against a live terminal multiplexer.
 */
function herdrAdapter(): HerdrAdapter {
  return new HerdrAdapter({ binary: process.env["META_O_HERDR_BIN"] });
}

/** §M-CLI-SESSION — Report a failed backend call and point at the only way forward. */
function failUncertain(pending: PendingOperation, error: unknown): never {
  fail("backend_call_failed", redact((error as Error).message), {
    operationId: pending.operationId,
    nextStep: `meta-o session reconcile --run-id <id>`,
  });
}

/** §M-CLI-SESSION — Backend statuses that prove a session will do nothing further. */
const TERMINAL_STATUS = new Set(["complete", "failed", "stopped"]);

/**
 * §M-CLI-SESSION — Refuse a replacement that would leave the old worker running.
 *
 * `--replace` used to be a plain bypass of the "this role already has a
 * session" guard, which is the one thing it must not be: the old agent keeps
 * running, state records only the new handle, and the backend ends up with two
 * workers for one role — the second of which nobody can address or stop. A
 * fresh generation is legitimate only once the previous one is provably over,
 * so the status comes from the backend and `session stop` is the way to make it
 * true.
 */
async function assertReplaceable(
  context: SessionContext,
  role: Role,
  existing: SessionRef,
  replace: boolean,
): Promise<void> {
  if (!replace) {
    fail(
      "session_exists",
      `role ${role} already has session ${existing.sessionId}; stop it, then pass --replace`,
      { session: existing },
    );
  }
  let status: string;
  try {
    status = await context.adapter.status(existing);
  } catch (error) {
    status = `unreadable: ${redact((error as Error).message)}`;
  }
  if (!TERMINAL_STATUS.has(status)) {
    fail(
      "previous_session_live",
      `role ${role} still holds session ${existing.sessionId} in state ${status}; ` +
        "run `meta-o session stop` before starting a fresh generation",
      { session: existing, status },
    );
  }
}

/**
 * §M-CLI-SESSION — Start a worker session for a role.
 *
 * The initial prompt is delivered by a separate `session send`, mirroring the
 * adapter: creating a session and giving it work are two observable effects, and
 * merging them would make a crash between them unclassifiable.
 */
export async function commandSpawn(args: ParsedArgs): Promise<void> {
  const context = contextOf(args);
  const role = roleOf(args);
  assertNoPendingOperation(context.state);

  const existing = sessionFor(context.state, role);
  if (existing) await assertReplaceable(context, role, existing, boolFlag(args, "replace"));

  const operationId = randomUUID();
  const model = modelFor(context.state, role);
  const cwd = optionalFlag(args, "worker-cwd") ?? context.repoDir;
  const request = { operationId, role, model, prompt: "", cwd };

  let pending = await prepare(context.projectKey, context.runId, {
    operationId,
    kind: "spawn",
    requestDigest: digestOf({ kind: "spawn", role, model, cwd }),
    probe: context.adapter.spawnProbe(role, operationId),
  });

  let session: SessionRef;
  try {
    session = await context.adapter.spawn(request, async (paneId) => {
      pending = await recordPane(context.projectKey, context.runId, pending, paneId);
    });
  } catch (error) {
    await markUncertain(context.projectKey, context.runId, pending);
    failUncertain(pending, error);
  }

  // The generation is read under the lock, from the state being written. Taking
  // it from the pre-lock snapshot handed two concurrent spawns the same number,
  // which is a lost update in the one field that distinguishes them.
  let recorded: SessionRef = { ...session, generation: 1 };
  await mutate(context.projectKey, context.runId, (state) => {
    recorded = { ...session, generation: (state.sessionGeneration[role] ?? 0) + 1 };
    return withPendingOperation(withSession(state, recorded), {
      ...pending,
      state: "acknowledged",
      sessionId: recorded.sessionId,
    });
  });

  const status = await context.adapter.status(recorded);
  await mutate(context.projectKey, context.runId, (state) => clearPendingOperation(state));

  emit({ runId: context.runId, session: recorded, status, operationId });
}

/**
 * §M-CLI-SESSION — Deliver one message to an existing session.
 *
 * The message is read from stdin so that a multi-kilobyte role prompt never has
 * to survive shell quoting.
 */
export async function commandSend(args: ParsedArgs): Promise<void> {
  const context = contextOf(args);
  const role = roleOf(args);
  assertNoPendingOperation(context.state);

  const session = sessionFor(context.state, role);
  if (!session) fail("no_session", `role ${role} has no session; run \`meta-o session spawn\` first`);

  const raw = await readStdin();
  if (raw.trim() === "") fail("empty_message", "refusing to deliver an empty prompt");

  // Outbound, not just inbound: a prompt is the channel that actually leaves
  // this machine for a model provider, so redacting only what comes back would
  // protect the logs and leak the secret. Masking rather than refusing keeps a
  // false positive from wedging a run — the prompt still arrives, minus the
  // thing that must not travel.
  const operationId = randomUUID();
  const body = redact(raw);
  const redacted = body !== raw;
  const message = frameTurnPrompt(body, operationId);
  const pending = await prepare(context.projectKey, context.runId, {
    operationId,
    kind: "send",
    sessionId: session.sessionId,
    requestDigest: digestOf({ kind: "send", sessionId: session.sessionId, message }),
    probe: await context.adapter.prepareProbe(session, message),
    turnId: operationId,
  });

  let delivery: DeliveryResult;
  try {
    delivery = await context.adapter.send(session, operationId, message);
  } catch (error) {
    await markUncertain(context.projectKey, context.runId, pending);
    failUncertain(pending, error);
  }

  if (delivery.status === "unknown") {
    await mutate(context.projectKey, context.runId, (state) =>
      withPendingOperation(state, { ...pending, state: "uncertain" }),
    );
    emit({ runId: context.runId, role, delivery, nextStep: "meta-o session reconcile" });
    process.exitCode = 1;
    return;
  }

  await mutate(context.projectKey, context.runId, (state) => {
    const acknowledged = withPendingOperation(state, {
      ...pending,
      state: "acknowledged",
      ...(delivery.receipt ? { backendReceipt: delivery.receipt } : {}),
    });
    return delivery.status === "acknowledged"
      ? withSessionTurn(acknowledged, role, {
          turnId: operationId,
          sessionId: session.sessionId,
          sentAt: isoTimestamp(),
        })
      : acknowledged;
  });

  const status = await context.adapter.status(session);
  await mutate(context.projectKey, context.runId, (state) => clearPendingOperation(state));

  emit({ runId: context.runId, role, delivery, status, redacted });
  if (delivery.status === "rejected") process.exitCode = 1;
}

/** §M-CLI-SESSION — Report the backend's view of a role's session. */
export async function commandStatus(args: ParsedArgs): Promise<void> {
  const context = contextOf(args);
  const role = roleOf(args);
  const session = sessionFor(context.state, role);
  if (!session) {
    emit({ runId: context.runId, role, session: null, status: "absent" });
    return;
  }
  emit({ runId: context.runId, role, session, status: await context.adapter.status(session) });
}

/**
 * §M-CLI-SESSION — Read new output from a session.
 *
 * Read-only, so it takes no pending operation: observing a session cannot
 * change it, and requiring a write-ahead record here would only make the
 * orchestrator reluctant to look.
 */
export async function commandRead(args: ParsedArgs): Promise<void> {
  const context = contextOf(args);
  const role = roleOf(args);
  const session = sessionFor(context.state, role);
  if (!session) fail("no_session", `role ${role} has no session`);
  const complete = boolFlag(args, "complete");
  const explicitTurnId = optionalFlag(args, "turn-id");
  const recordedTurn = context.state.sessionTurns?.[role];
  if (complete && !explicitTurnId && recordedTurn && recordedTurn.sessionId !== session.sessionId) {
    fail("stale_result_turn", `the recorded turn for role ${role} belongs to a replaced session`);
  }
  const turnId = explicitTurnId ?? recordedTurn?.turnId;
  const maxLinesRaw = optionalFlag(args, "max-lines");
  const maxLines = maxLinesRaw === undefined ? undefined : Number(maxLinesRaw);
  if (maxLines !== undefined && (!Number.isInteger(maxLines) || maxLines <= 0)) {
    fail("invalid_max_lines", "--max-lines must be a positive integer");
  }
  if (complete && !turnId) {
    fail("no_result_turn", `role ${role} has no recorded result-bearing turn`);
  }
  const output = complete
    ? await context.adapter.readCompleteTurn(session, turnId!, maxLines)
    : await context.adapter.read(session, optionalFlag(args, "cursor"));
  if (complete && !output.complete) {
    fail(
      "incomplete_session_output",
      `could not read the complete result for turn ${turnId}: ${output.incompleteReason}`,
      {
        turnId,
        truncated: output.truncated ?? false,
        requestedLines: output.requestedLines ?? 0,
      },
    );
  }
  emit({
    runId: context.runId,
    role,
    ...output,
  });
}

/** §M-CLI-SESSION — Wait for a session to settle, bounded by an explicit deadline. */
export async function commandWait(args: ParsedArgs): Promise<void> {
  const context = contextOf(args);
  const role = roleOf(args);
  assertNoPendingOperation(context.state);

  const session = sessionFor(context.state, role);
  if (!session) fail("no_session", `role ${role} has no session`);

  const timeoutMs = Number(optionalFlag(args, "timeout-ms") ?? 300_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    fail("invalid_timeout", "--timeout-ms must be a positive number of milliseconds");
  }
  const deadlineAt = new Date(Date.now() + timeoutMs).toISOString();
  const terminal = boolFlag(args, "terminal");

  const operationId = randomUUID();
  const pending = await prepare(context.projectKey, context.runId, {
    operationId,
    kind: "wait",
    sessionId: session.sessionId,
    requestDigest: digestOf({ kind: "wait", sessionId: session.sessionId, terminal }),
    probe: await context.adapter.prepareProbe(session),
    deadlineAt,
  });

  let result: WaitResult;
  try {
    result = await context.adapter.wait(session, { terminal, deadlineAt });
  } catch (error) {
    await markUncertain(context.projectKey, context.runId, pending);
    failUncertain(pending, error);
  }

  // §20's step 3 — record the acknowledgement, then clear — and `wait` and
  // `stop` skipped straight to clearing. Crash safety never depended on it (a
  // crash before this leaves `prepared`, which reconcile decides), but a crash
  // *between* the returned result and the clear left a `prepared` record for a
  // call that had already come back, and reconcile then had to re-derive an
  // answer the process already had.
  await mutate(context.projectKey, context.runId, (state) =>
    withPendingOperation(state, {
      ...pending,
      state: "acknowledged",
      backendReceipt: digestOf({ kind: "wait", status: result.status }),
    }),
  );
  await mutate(context.projectKey, context.runId, (state) => clearPendingOperation(state));
  emit({ runId: context.runId, role, ...result, deadlineAt });
}

/**
 * §M-CLI-SESSION — Confirm a worker survived, or say plainly that it did not.
 *
 * The adapter has always had `resume` and nothing could call it: after a
 * backend restart the orchestrator's only options were `status`, which reports
 * a grade, and spawning a replacement, which throws away a worker that may be
 * perfectly alive. §20 lists resumption among the ten operations a backend must
 * support, so it needs a verb.
 *
 * No pending operation is written: resuming reads the backend and changes
 * nothing there, so there is no effect a crash could half-apply.
 */
export async function commandResume(args: ParsedArgs): Promise<void> {
  const context = contextOf(args);
  const role = roleOf(args);

  const session = sessionFor(context.state, role);
  if (!session) fail("no_session", `role ${role} has no session`);

  let resumed: SessionRef;
  try {
    resumed = await context.adapter.resume(session);
  } catch (error) {
    // Not a crash and not an error in this command: the honest report is that
    // the worker is gone, and replacing it is the orchestrator's decision.
    emit({
      runId: context.runId,
      role,
      resumed: false,
      reason: (error as Error).message,
      nextStep: `meta-o session spawn --role ${role} --replace`,
    });
    process.exitCode = 1;
    return;
  }

  const status = await context.adapter.status(resumed);
  emit({ runId: context.runId, role, resumed: true, session: resumed, status });
}

/** §M-CLI-SESSION — Terminate a session this run created. */
export async function commandStop(args: ParsedArgs): Promise<void> {
  const context = contextOf(args);
  const role = roleOf(args);
  assertNoPendingOperation(context.state);

  const session = sessionFor(context.state, role);
  if (!session) {
    emit({ runId: context.runId, role, outcome: "already_terminal", session: null });
    return;
  }

  const operationId = randomUUID();
  const pending = await prepare(context.projectKey, context.runId, {
    operationId,
    kind: "stop",
    sessionId: session.sessionId,
    requestDigest: digestOf({ kind: "stop", sessionId: session.sessionId }),
    probe: await context.adapter.prepareProbe(session),
  });

  let outcome: "stopped" | "already_terminal" | "unknown";
  try {
    outcome = await context.adapter.stop(session);
  } catch (error) {
    await markUncertain(context.projectKey, context.runId, pending);
    failUncertain(pending, error);
  }

  if (outcome === "unknown") {
    await mutate(context.projectKey, context.runId, (state) =>
      withPendingOperation(state, { ...pending, state: "uncertain" }),
    );
    emit({ runId: context.runId, role, outcome, nextStep: "meta-o session reconcile" });
    process.exitCode = 1;
    return;
  }

  await mutate(context.projectKey, context.runId, (state) =>
    withPendingOperation(state, {
      ...pending,
      state: "acknowledged",
      backendReceipt: digestOf({ kind: "stop", outcome }),
    }),
  );
  await mutate(context.projectKey, context.runId, (state) =>
    clearPendingOperation(withoutSession(state, role)),
  );
  emit({ runId: context.runId, role, outcome });
}

/**
 * §M-CLI-SESSION — Decide what became of an interrupted side effect.
 *
 * The only sanctioned way out of a pending operation. `applied` and
 * `not_applied` both clear the record — the difference is that `not_applied`
 * makes a retry legitimate. `unknown` pauses the run instead of guessing,
 * because the alternative is a second worker or a second instruction that
 * nobody can later distinguish from the first.
 */
export async function commandReconcile(args: ParsedArgs): Promise<void> {
  const context = contextOf(args);
  const pending = context.state.pendingOperation;
  if (!pending) {
    emit({ runId: context.runId, pendingOperation: null, effect: "nothing_to_reconcile" });
    return;
  }

  const result = await context.adapter.reconcile(pending);

  if (result.effect === "unknown") {
    const next = await mutate(context.projectKey, context.runId, (state) => {
      assertTransition(state.phase, "PAUSED_BACKEND_UNCERTAIN");
      return {
        ...withPendingOperation(state, { ...pending, state: "uncertain" }),
        phase: "PAUSED_BACKEND_UNCERTAIN" as const,
        paused: {
          reason: `effect of ${pending.kind} operation ${pending.operationId} cannot be proven`,
          enteredAt: isoTimestamp(),
          resumeCondition:
            "a human or a later reconcile establishes whether the backend applied the operation",
        },
      };
    });
    // The probe travels with the answer. An operator told only "unknown" has
    // nothing to act on, and the one thing that would let them act — which pane
    // and which agent name this operation was about — was reachable only by
    // reading the raw record out of `run show`.
    emit({
      runId: context.runId,
      ...result,
      phase: next.phase,
      probe: pending.probe ?? null,
    });
    process.exitCode = 1;
    return;
  }

  const recovered = await settleReconciled(
    context.projectKey,
    context.runId,
    context.adapter,
    context.state,
    pending,
    result,
  );

  // An adopted orchestrator is finished here too, not only on a watchdog tick.
  // A human reconciling by hand adopts the same orphan, and the ticks that
  // follow see a live orchestrator and leave it alone — so without this the
  // manual path is the one that produces a permanently mute orchestrator.
  if (recovered?.role === "orchestrator") {
    await finishAdoptedOrchestratorSpawn(
      context.adapter,
      context.projectKey,
      context.runId,
      recovered,
    );
  }

  emit({ runId: context.runId, ...result, recoveredSession: recovered ?? null });
}

/** §M-CLI-SESSION — List every session this run currently holds. */
export async function commandList(args: ParsedArgs): Promise<void> {
  const context = contextOf(args);
  const entries: Array<{ role: Role; session: SessionRef; status: string }> = [];
  const all: Array<[Role, SessionRef | undefined]> = [
    ["orchestrator", context.state.orchestratorSession],
    ...(Object.entries(context.state.sessions) as Array<[Role, SessionRef | undefined]>),
  ];
  for (const [role, session] of all) {
    if (!session) continue;
    entries.push({ role, session, status: await context.adapter.status(session) });
  }
  emit({
    runId: context.runId,
    sessions: entries,
    pendingOperation: context.state.pendingOperation ?? null,
  });
}
