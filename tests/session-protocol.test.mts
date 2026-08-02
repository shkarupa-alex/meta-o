/**
 * §M-TEST-SESSION — Acceptance tests for the write-ahead backend protocol.
 *
 * Covers the §20 acceptance item "a crash at any point of a backend side effect
 * creates no duplicate action". Each test drives the real CLI against a scripted
 * Herdr stand-in and then asks the question that matters after a crash: is the
 * intent still recorded, and does reconciliation reach a defensible verdict
 * rather than a convenient one.
 *
 * Verifies §A-BACKEND-CONTRACT and §A-CRASH-RECOVERY.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempHome, createTempRepo, seedProjectContract, type TempRepo } from "./helpers.mts";

/** §M-TEST-SESSION — The compiled CLI and the fake backend it will talk to. */
const CLI = fileURLToPath(new URL("../dist/cli/meta-o.mjs", import.meta.url));
const FAKE_HERDR = fileURLToPath(new URL("./fixtures/fake-herdr.mjs", import.meta.url));

/** §M-TEST-SESSION — Everything one CLI invocation needs. */
interface Context {
  cwd: string;
  home: string;
  fakeState: string;
  stdin?: string;
  env?: Record<string, string>;
}

/** §M-TEST-SESSION — Outcome of one CLI invocation. */
interface Result {
  code: number;
  json: Record<string, unknown>;
  stderr: string;
}

/** §M-TEST-SESSION — Run the CLI with the fake backend wired in. */
function cli(args: string[], context: Context): Result {
  const env = {
    ...process.env,
    META_O_HOME: context.home,
    META_O_HERDR_BIN: FAKE_HERDR,
    FAKE_HERDR_STATE: context.fakeState,
    ...context.env,
  };
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      cwd: context.cwd,
      encoding: "utf8",
      input: context.stdin ?? "",
      env,
    });
    return { code: 0, json: parse(stdout), stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: failure.status ?? 1,
      json: { ...parse(failure.stderr ?? ""), ...parse(failure.stdout ?? "") },
      stderr: failure.stderr ?? "",
    };
  }
}

/** §M-TEST-SESSION — Parse a JSON envelope, tolerating empty output. */
function parse(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** §M-TEST-SESSION — Assert a command succeeded, quoting its own error if not. */
function ok(result: Result, what: string): Result {
  assert.equal(result.code, 0, `${what} failed: ${result.stderr}`);
  return result;
}

/** §M-TEST-SESSION — The error code of a failure envelope. */
function errorCode(result: Result): string {
  return (result.json["error"] as { code: string } | undefined)?.code ?? "(none)";
}

/** §M-TEST-SESSION — A confirmed ModelSet. */
const SETTINGS = JSON.stringify({
  schemaVersion: 1,
  modelSet: {
    executor: { route: "claude", vendor: "anthropic", family: "claude", model: "opus" },
    reviewerPrimary: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
    reviewerCrossVendor: { route: "codex", vendor: "openai", family: "gpt", model: "gpt-5" },
    e2eTester: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
  },
  backend: "herdr",
  watchdogEnabled: false,
  handoffDefault: false,
});

/** §M-TEST-SESSION — A disposable project, state tree and fake backend. */
interface Fixture {
  context: Context;
  runId: string;
  repo: TempRepo;
  dispose(): void;
}

/** §M-TEST-SESSION — Build a project with one started run. */
function fixture(): Fixture {
  const repo = createTempRepo();
  seedProjectContract(repo);
  repo.write("spec/feature.md", "# Feature\n\nShip the thing.\n");
  repo.commit("seed project");

  const home = createTempHome();
  const fakeDir = mkdtempSync(join(tmpdir(), "meta-o-herdr-"));
  const context: Context = {
    cwd: repo.dir,
    home: home.dir,
    fakeState: join(fakeDir, "state.json"),
  };

  ok(cli(["project", "init"], context), "project init");
  ok(cli(["project", "set-settings"], { ...context, stdin: SETTINGS }), "set-settings");
  const started = ok(
    cli(["run", "start", "--spec-kind", "tracked", "--spec-locator", "spec/feature.md"], context),
    "run start",
  );

  return {
    context,
    repo,
    runId: started.json["runId"] as string,
    dispose() {
      rmSync(fakeDir, { recursive: true, force: true });
      home.dispose();
      repo.dispose();
    },
  };
}

/** §M-TEST-SESSION — The simulated backend's view of the world. */
function backendState(context: Context): {
  agents: Record<string, { pane_id: string; state_change_seq: number }>;
  panes: Record<string, { text: string }>;
} {
  return JSON.parse(readFileSync(context.fakeState, "utf8"));
}

test("a spawn records the session and leaves no operation in flight", () => {
  const it = fixture();
  try {
    const spawned = ok(
      cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], it.context),
      "session spawn",
    );
    const session = spawned.json["session"] as { sessionId: string; generation: number };
    assert.match(session.sessionId, /^agent=mo-executor-[0-9a-f]{8};pane=%\d+;owned=1$/);
    assert.equal(session.generation, 1);

    const shown = ok(cli(["run", "show", "--run-id", it.runId], it.context), "run show");
    assert.equal(shown.json["pendingOperation"], undefined, "a proven effect clears its intent");

    const panes = Object.values(backendState(it.context).panes);
    assert.deepEqual(
      panes.map((pane) => pane.text.trim()),
      [""],
      "spawning must not also deliver a prompt: two effects, two operations",
    );
  } finally {
    it.dispose();
  }
});

test("a second spawn for the same role is refused without --replace", () => {
  const it = fixture();
  try {
    ok(cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], it.context), "spawn");
    const again = cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], it.context);
    assert.equal(again.code, 1);
    assert.equal(errorCode(again), "session_exists");
  } finally {
    it.dispose();
  }
});

test("a delivered prompt reaches the pane and clears the pending operation", () => {
  const it = fixture();
  try {
    ok(cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], it.context), "spawn");
    const sent = ok(
      cli(["session", "send", "--run-id", it.runId, "--role", "executor"], {
        ...it.context,
        stdin: "Implement the feature described in the spec blob.",
      }),
      "session send",
    );
    assert.equal((sent.json["delivery"] as { status: string }).status, "acknowledged");

    const tail = Object.values(backendState(it.context).panes)[0]!.text;
    assert.match(tail, /Implement the feature/);

    const shown = ok(cli(["run", "show", "--run-id", it.runId], it.context), "run show");
    assert.equal(shown.json["pendingOperation"], undefined);
  } finally {
    it.dispose();
  }
});

test("an empty prompt is refused before any backend call", () => {
  const it = fixture();
  try {
    ok(cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], it.context), "spawn");
    const empty = cli(["session", "send", "--run-id", it.runId, "--role", "executor"], {
      ...it.context,
      stdin: "   \n",
    });
    assert.equal(empty.code, 1);
    assert.equal(errorCode(empty), "empty_message");
  } finally {
    it.dispose();
  }
});

test("a stalled delivery stays pending and reconciles to not_applied", () => {
  const it = fixture();
  try {
    ok(cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], it.context), "spawn");

    const stalled = cli(["session", "send", "--run-id", it.runId, "--role", "executor"], {
      ...it.context,
      stdin: "Review the candidate commit.",
      env: { FAKE_HERDR_STALL: "1" },
    });
    assert.equal(stalled.code, 1);
    assert.equal((stalled.json["delivery"] as { status: string }).status, "unknown");

    const pending = ok(cli(["run", "show", "--run-id", it.runId], it.context), "run show").json[
      "pendingOperation"
    ] as { kind: string; state: string };
    assert.equal(pending.kind, "send");
    assert.equal(pending.state, "uncertain");

    // No second effect may be caused while the first is unresolved.
    const blocked = cli(["session", "send", "--run-id", it.runId, "--role", "executor"], {
      ...it.context,
      stdin: "Try again.",
    });
    assert.equal(blocked.code, 1);
    assert.equal(errorCode(blocked), "pending_operation");

    // The evidence — unchanged sequence, no marker, settled agent — proves it never landed.
    const reconciled = ok(
      cli(["session", "reconcile", "--run-id", it.runId], it.context),
      "session reconcile",
    );
    assert.equal(reconciled.json["effect"], "not_applied");

    const retried = ok(
      cli(["session", "send", "--run-id", it.runId, "--role", "executor"], {
        ...it.context,
        stdin: "Review the candidate commit.",
      }),
      "retry after not_applied",
    );
    assert.equal((retried.json["delivery"] as { status: string }).status, "acknowledged");
  } finally {
    it.dispose();
  }
});

test("a delivery that did land reconciles to applied, never to a resend", () => {
  const it = fixture();
  try {
    ok(cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], it.context), "spawn");
    ok(
      cli(["session", "send", "--run-id", it.runId, "--role", "executor"], {
        ...it.context,
        stdin: "First instruction.",
      }),
      "send",
    );

    // Simulate a crash after the effect by re-planting the intent by hand.
    const before = backendState(it.context);
    const agentName = Object.keys(before.agents)[0]!;
    ok(
      cli(["run", "pending", "--run-id", it.runId], {
        ...it.context,
        stdin: JSON.stringify({
          operationId: "11111111-1111-4111-8111-111111111111",
          kind: "send",
          sessionId: `agent=${agentName};pane=${before.agents[agentName]!.pane_id};owned=1`,
          requestDigest: "deadbeef",
          state: "prepared",
          probe: JSON.stringify({
            agentName,
            paneId: before.agents[agentName]!.pane_id,
            seq: before.agents[agentName]!.state_change_seq - 1,
            marker: "First instruction.",
          }),
        }),
      }),
      "plant a pending operation",
    );

    const reconciled = ok(cli(["session", "reconcile", "--run-id", it.runId], it.context), "reconcile");
    assert.equal(reconciled.json["effect"], "applied");

    const after = backendState(it.context);
    assert.equal(
      after.agents[agentName]!.state_change_seq,
      before.agents[agentName]!.state_change_seq,
      "reconciliation observes; it never re-sends",
    );
  } finally {
    it.dispose();
  }
});

test("a spawn that never created anything reconciles to not_applied", () => {
  const it = fixture();
  try {
    const failed = cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], {
      ...it.context,
      env: { FAKE_HERDR_FAIL: "pane split" },
    });
    assert.equal(failed.code, 1);
    assert.equal(errorCode(failed), "backend_call_failed");

    // The pane split never returned, so the probe holds no pane and no agent
    // exists: nothing was created, and a retry cannot duplicate a worker.
    const reconciled = ok(cli(["session", "reconcile", "--run-id", it.runId], it.context), "reconcile");
    assert.equal(reconciled.json["effect"], "not_applied");

    const retried = ok(
      cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], it.context),
      "the retry is legitimate once not_applied is proven",
    );
    assert.equal((retried.json["session"] as { role: string }).role, "executor");
  } finally {
    it.dispose();
  }
});

test("an unprovable effect pauses the run instead of guessing", () => {
  const it = fixture();
  try {
    // The pane is created and `agent start` then fails: a pane now exists with
    // no agent in it, which is genuinely ambiguous — the agent may be racing to
    // register — so the run must pause rather than risk a second worker.
    const failed = cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], {
      ...it.context,
      env: { FAKE_HERDR_FAIL: "agent start" },
    });
    assert.equal(failed.code, 1);
    assert.equal(errorCode(failed), "backend_call_failed");

    const reconciled = cli(["session", "reconcile", "--run-id", it.runId], it.context);
    assert.equal(reconciled.code, 1);
    assert.equal(reconciled.json["effect"], "unknown");
    assert.equal(reconciled.json["phase"], "PAUSED_BACKEND_UNCERTAIN");
  } finally {
    it.dispose();
  }
});

test("stopping a session forgets it and closes only the pane the run created", () => {
  const it = fixture();
  try {
    ok(cli(["session", "spawn", "--run-id", it.runId, "--role", "e2eTester"], it.context), "spawn");
    assert.equal(Object.keys(backendState(it.context).panes).length, 1);

    const stopped = ok(
      cli(["session", "stop", "--run-id", it.runId, "--role", "e2eTester"], it.context),
      "session stop",
    );
    assert.equal(stopped.json["outcome"], "stopped");
    assert.deepEqual(backendState(it.context).panes, {});

    const listed = ok(cli(["session", "list", "--run-id", it.runId], it.context), "session list");
    assert.deepEqual(listed.json["sessions"], []);
    assert.equal(listed.json["pendingOperation"], null);
  } finally {
    it.dispose();
  }
});

test("status and read observe a session without recording an intent", () => {
  const it = fixture();
  try {
    ok(cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], it.context), "spawn");
    ok(
      cli(["session", "send", "--run-id", it.runId, "--role", "executor"], {
        ...it.context,
        stdin: "hello",
      }),
      "send",
    );

    const status = ok(
      cli(["session", "status", "--run-id", it.runId, "--role", "executor"], it.context),
      "status",
    );
    assert.equal(status.json["status"], "waiting");

    const read = ok(
      cli(["session", "read", "--run-id", it.runId, "--role", "executor"], it.context),
      "read",
    );
    assert.match(read.json["text"] as string, /hello/);

    const unchanged = ok(
      cli(
        ["session", "read", "--run-id", it.runId, "--role", "executor", "--cursor", read.json["cursor"] as string],
        it.context,
      ),
      "read at the same cursor",
    );
    assert.equal(unchanged.json["text"], "");

    const shown = ok(cli(["run", "show", "--run-id", it.runId], it.context), "run show");
    assert.equal(shown.json["pendingOperation"], undefined);
  } finally {
    it.dispose();
  }
});

test("a role with no session reports absent rather than failing", () => {
  const it = fixture();
  try {
    const status = ok(
      cli(["session", "status", "--run-id", it.runId, "--role", "reviewerPrimary"], it.context),
      "status",
    );
    assert.equal(status.json["status"], "absent");
    assert.equal(status.json["session"], null);

    const reconciled = ok(cli(["session", "reconcile", "--run-id", it.runId], it.context), "reconcile");
    assert.equal(reconciled.json["effect"], "nothing_to_reconcile");
  } finally {
    it.dispose();
  }
});

test("secrets in session output are masked before the orchestrator sees them", () => {
  const it = fixture();
  try {
    ok(cli(["session", "spawn", "--run-id", it.runId, "--role", "executor"], it.context), "spawn");
    ok(
      cli(["session", "send", "--run-id", it.runId, "--role", "executor"], {
        ...it.context,
        stdin: "export ANTHROPIC_API_KEY=sk-abcdefghijklmnopqrstuvwxyz012345",
      }),
      "send",
    );

    const read = ok(
      cli(["session", "read", "--run-id", it.runId, "--role", "executor"], it.context),
      "read",
    );
    assert.ok(!(read.json["text"] as string).includes("sk-abcdefghijklmnopqrstuvwxyz012345"));
  } finally {
    it.dispose();
  }
});
