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
import { canonicalize, type JsonValue } from "../../core/canonical-json.mjs";
import { sha256Hex } from "../../core/hash.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import {
  clearPendingOperation,
  commitState,
  readState,
  withPendingOperation,
  withWriterLock,
} from "../../core/state-store.mjs";
import { assertTransition } from "../../core/fsm.mjs";
import { redact } from "../../core/redact.mjs";
import type {
  DeliveryResult,
  ModelRef,
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

/** §M-CLI-SESSION — Every role a session may be opened for. */
const ROLES: Role[] = [
  "orchestrator",
  "executor",
  "reviewerPrimary",
  "reviewerCrossVendor",
  "e2eTester",
  "reuseResearcher",
  "technicalAdjudicator",
];

/**
 * §M-CLI-SESSION — Which confirmed model each role runs on.
 *
 * The four named slots come straight from the ModelSet. The two auxiliary roles
 * are mapped rather than added to the ModelSet so that the user still confirms
 * exactly four models: the reuse researcher only reads the existing codebase and
 * can share the executor's model, while the technical adjudicator must be
 * independent of the executor, which is precisely the cross-vendor slot.
 */
function modelFor(state: RunState, role: Role): ModelRef {
  switch (role) {
    case "executor":
    case "orchestrator":
    case "reuseResearcher":
      return state.modelSet.executor;
    case "reviewerPrimary":
      return state.modelSet.reviewerPrimary;
    case "reviewerCrossVendor":
    case "technicalAdjudicator":
      return state.modelSet.reviewerCrossVendor;
    case "e2eTester":
      return state.modelSet.e2eTester;
  }
}

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

  const backend = optionalFlag(args, "backend") ?? "herdr";
  if (backend !== "herdr") {
    fail(
      "unsupported_backend",
      `this skill drives herdr; ${backend} needs its own orchestrate-feature-<backend> skill and adapter`,
    );
  }

  return {
    projectKey: identity.projectKey,
    repoDir: identity.canonicalPath,
    runId,
    state,
    adapter: herdrAdapter(),
  };
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

/** §M-CLI-SESSION — Read and validate the `--role` flag. */
function roleOf(args: ParsedArgs): Role {
  const role = requireFlag(args, "role") as Role;
  if (!ROLES.includes(role)) fail("invalid_role", `--role must be one of ${ROLES.join("|")}`);
  return role;
}

/** §M-CLI-SESSION — The session currently recorded for a role, if any. */
function sessionFor(state: RunState, role: Role): SessionRef | undefined {
  return role === "orchestrator" ? state.orchestratorSession : state.sessions[role];
}

/** §M-CLI-SESSION — Store a session handle in the slot its role belongs to. */
function withSession(state: RunState, session: SessionRef): RunState {
  if (session.role === "orchestrator") return { ...state, orchestratorSession: session };
  return {
    ...state,
    sessions: { ...state.sessions, [session.role]: session },
    sessionGeneration: { ...state.sessionGeneration, [session.role]: session.generation },
  };
}

/** §M-CLI-SESSION — Forget a session handle whose backend session is gone. */
function withoutSession(state: RunState, role: Role): RunState {
  if (role === "orchestrator") {
    const updated = { ...state };
    delete updated.orchestratorSession;
    return updated;
  }
  const sessions = { ...state.sessions };
  delete sessions[role];
  return { ...state, sessions };
}

/** §M-CLI-SESSION — Apply one change to run state under the writer lock. */
async function mutate(
  projectKey: string,
  runId: string,
  change: (state: RunState) => RunState,
): Promise<RunState> {
  return await withWriterLock(projectKey, runId, () => {
    const current = readState(projectKey, runId);
    if (!current) fail("unknown_run", `run ${runId} disappeared while it was being updated`);
    return commitState(change(current));
  });
}

/**
 * §M-CLI-SESSION — Refuse to start a second side effect while one is in flight.
 *
 * One pending operation at a time is what makes reconciliation decidable: with
 * two, an observed effect cannot be attributed to a specific intent.
 */
function assertNoPendingOperation(state: RunState): void {
  const pending = state.pendingOperation;
  if (!pending) return;
  fail(
    "pending_operation",
    `operation ${pending.operationId} (${pending.kind}, ${pending.state}) is still in flight; ` +
      "run `meta-o session reconcile` before causing another effect",
    { pendingOperation: pending },
  );
}

/** §M-CLI-SESSION — Digest of the request a pending operation stands for. */
function digestOf(request: unknown): string {
  return sha256Hex(canonicalize(request as JsonValue));
}

/** §M-CLI-SESSION — Write the intent before the backend is touched. */
async function prepare(
  context: SessionContext,
  operation: Omit<PendingOperation, "state" | "preparedAt">,
): Promise<PendingOperation> {
  const pending: PendingOperation = {
    ...operation,
    state: "prepared",
    preparedAt: isoTimestamp(),
  };
  await mutate(context.projectKey, context.runId, (state) => withPendingOperation(state, pending));
  return pending;
}

/**
 * §M-CLI-SESSION — Leave the intent in place when the backend call itself fails.
 *
 * A thrown call is exactly the ambiguous case: the request may or may not have
 * reached the backend. The record therefore survives, marked `uncertain`, and
 * the only sanctioned next step is `session reconcile`.
 */
async function markUncertain(context: SessionContext, pending: PendingOperation): Promise<void> {
  await mutate(context.projectKey, context.runId, (state) =>
    withPendingOperation(state, { ...pending, state: "uncertain" }),
  );
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
 * §M-CLI-SESSION — Record the pane a spawn just created, mid-operation.
 *
 * The write-ahead record is written before the whole spawn, but a spawn is two
 * backend calls and the pane id only exists after the first. Folding it into
 * the probe as soon as it is known is what lets `reconcile` later distinguish
 * "nothing was created" from "a pane exists and an agent may be starting in it".
 */
async function recordPane(
  context: SessionContext,
  pending: PendingOperation,
  paneId: string,
): Promise<PendingOperation> {
  const probe = { ...(JSON.parse(pending.probe ?? "{}") as Record<string, unknown>), paneId };
  const updated: PendingOperation = { ...pending, probe: JSON.stringify(probe) };
  await mutate(context.projectKey, context.runId, (state) => withPendingOperation(state, updated));
  return updated;
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

  let pending = await prepare(context, {
    operationId,
    kind: "spawn",
    requestDigest: digestOf({ kind: "spawn", role, model, cwd }),
    probe: context.adapter.spawnProbe(role, operationId),
  });

  let session: SessionRef;
  try {
    session = await context.adapter.spawn(request, async (paneId) => {
      pending = await recordPane(context, pending, paneId);
    });
  } catch (error) {
    await markUncertain(context, pending);
    failUncertain(pending, error);
  }

  const generation = (context.state.sessionGeneration[role] ?? 0) + 1;
  const recorded: SessionRef = { ...session, generation };
  await mutate(context.projectKey, context.runId, (state) =>
    withPendingOperation(withSession(state, recorded), {
      ...pending,
      state: "acknowledged",
      sessionId: recorded.sessionId,
    }),
  );

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
  const message = redact(raw);
  const redacted = message !== raw;

  const operationId = randomUUID();
  const pending = await prepare(context, {
    operationId,
    kind: "send",
    sessionId: session.sessionId,
    requestDigest: digestOf({ kind: "send", sessionId: session.sessionId, message }),
    probe: await context.adapter.prepareProbe(session, message),
  });

  let delivery: DeliveryResult;
  try {
    delivery = await context.adapter.send(session, operationId, message);
  } catch (error) {
    await markUncertain(context, pending);
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

  await mutate(context.projectKey, context.runId, (state) =>
    withPendingOperation(state, {
      ...pending,
      state: "acknowledged",
      ...(delivery.receipt ? { backendReceipt: delivery.receipt } : {}),
    }),
  );

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
  emit({
    runId: context.runId,
    role,
    ...(await context.adapter.read(session, optionalFlag(args, "cursor"))),
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
  const pending = await prepare(context, {
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
    await markUncertain(context, pending);
    failUncertain(pending, error);
  }

  await mutate(context.projectKey, context.runId, (state) => clearPendingOperation(state));
  emit({ runId: context.runId, role, ...result, deadlineAt });
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
  const pending = await prepare(context, {
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
    await markUncertain(context, pending);
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
    emit({ runId: context.runId, ...result, phase: next.phase });
    process.exitCode = 1;
    return;
  }

  let recovered: SessionRef | undefined;
  if (result.effect === "applied" && pending.kind === "spawn") {
    const probe = JSON.parse(pending.probe ?? "{}") as { agentName?: string };
    const role = roleOfPendingSpawn(context.state, pending);
    if (probe.agentName && role) {
      recovered = await context.adapter.findSession(
        probe.agentName,
        role,
        (context.state.sessionGeneration[role] ?? 0) + 1,
      );
    }
  }

  await mutate(context.projectKey, context.runId, (state) => {
    const withRecovered = recovered ? withSession(state, recovered) : state;
    if (result.effect === "applied" && pending.kind === "stop") {
      const role = pending.sessionId ? roleOfSession(state, pending.sessionId) : undefined;
      if (role) return clearPendingOperation(withoutSession(withRecovered, role));
    }
    return clearPendingOperation(withRecovered);
  });

  emit({ runId: context.runId, ...result, recoveredSession: recovered ?? null });
}

/**
 * §M-CLI-SESSION — Which role an interrupted spawn was creating.
 *
 * Recovered from the probe's agent name, which encodes the role: the state has
 * no session for the role yet, precisely because the spawn never completed.
 */
function roleOfPendingSpawn(state: RunState, pending: PendingOperation): Role | undefined {
  const probe = JSON.parse(pending.probe ?? "{}") as { agentName?: string };
  if (!probe.agentName) return undefined;
  const adapter = herdrAdapter();
  return ROLES.find(
    (role) => adapter.expectedAgentName(role, pending.operationId) === probe.agentName,
  );
}

/** §M-CLI-SESSION — Which role currently holds a session id. */
function roleOfSession(state: RunState, sessionId: string): Role | undefined {
  if (state.orchestratorSession?.sessionId === sessionId) return "orchestrator";
  for (const [role, session] of Object.entries(state.sessions)) {
    if (session?.sessionId === sessionId) return role as Role;
  }
  return undefined;
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
