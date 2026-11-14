/**
 * Prove that `mo-debug` tells a found call from a run one and never reports
 * a session as complete when evidence in it could not be read.
 *
 * Protects §A-DIAGNOSTICS-01. The first nine cases are the synthetic sequences
 * of Issue #79, with the defect inverted into the required behaviour; the rest
 * pin the closed set of `exec` program forms, the link between a call and its
 * result, and the one account of a run that a `CommandExecution` record gives.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { functionOutput } from "../shared/scripts/mo-debug-codex-calls.mjs";
import { readProgram } from "../shared/scripts/mo-debug-exec.mjs";
import { typedOverflow } from "../shared/scripts/mo-debug-text.mjs";
import { readSession } from "../shared/scripts/mo-debug.mjs";

const HELPER = "node /synthetic/skills/mo-review-orca/scripts/mo-review.mjs check";
const OTHER = "node /synthetic/skills/mo-review-orca/scripts/mo-review-report.mjs validate";
const SKILL_READ = "cat /synthetic/.codex/skills/mo-x/SKILL.md";
const AT = "2026-10-13T00:00:00Z";
const DONE = "Script completed\nWall time 0.1 seconds\nOutput:\n";
const response = (payload, timestamp = AT) => ({ type: "response_item", timestamp, payload });
const call = (name, callId, args) =>
  response({ type: "function_call", name, call_id: callId, arguments: JSON.stringify(args) });
const output = (callId, value) =>
  response({ type: "function_call_output", call_id: callId, output: value });
const exec = (callId, input) =>
  response({ type: "custom_tool_call", name: "exec", call_id: callId, input });
const execOutput = (callId, value) =>
  response({ type: "custom_tool_call_output", call_id: callId, output: value });
const items = (...texts) => [DONE, ...texts].map((text) => ({ type: "input_text", text }));
const execution = (command, stdout) => ({
  type: "event_msg",
  timestamp: AT,
  payload: {
    type: "item_completed",
    item: {
      type: "CommandExecution",
      command: ["/bin/zsh", "-lc", command],
      source: "unified_exec_startup",
      status: "completed",
      aggregated_output: stdout,
      exit_code: 0,
    },
  },
});

/** Feed records to the real reader through a synthetic `read`, never a file. */
function read(records, harness = "codex", since = null) {
  const lines = records.map((record) =>
    typeof record === "string" ? record : JSON.stringify(record),
  );
  const bytes = Buffer.from(`${lines.join("\n")}\n`);
  let offset = 0;
  return readSession(
    { id: "synthetic", harness, fd: -1 },
    {
      maxRecords: 100,
      since,
      read(_fd, chunk) {
        const size = Math.min(chunk.length, bytes.length - offset);
        bytes.copy(chunk, 0, offset, offset + size);
        offset += size;
        return size;
      },
    },
  );
}

const kinds = (session) => session.events.map((event) => event.kind);
const calls = (session) => session.events.filter((event) => event.kind === "helper_call");
const results = (session) => session.events.filter((event) => event.kind === "helper_result");

test("1: an exec program's call is found but unconfirmed without a settled result", () => {
  const program = `text(await tools.exec_command({cmd:${JSON.stringify(HELPER)}}));`;
  // The Issue's output has no `Script …` header, so nothing settles the cell.
  const bare = read([exec("outer", program), execOutput("outer", "MO-REVIEW/1 status=ok")]);
  assert.deepEqual(kinds(bare), ["helper_call"]);
  assert.equal(calls(bare)[0].confirmed, false);
  assert.equal(calls(bare)[0].skill, "mo-review-orca");
  assert.equal(bare.outcome, "partial");
  assert.deepEqual(bare.reasons, ["ambiguous_correlation"]);
  // The recorded shape settles it: one call, a completed script, its result.
  const settled = read([
    exec("outer", program),
    execOutput("outer", items("MO-REVIEW/1 status=ok")),
  ]);
  assert.deepEqual(kinds(settled), ["helper_call", "helper_result"]);
  assert.equal(calls(settled)[0].confirmed, true);
  assert.equal(results(settled)[0].excerpt, "MO-REVIEW/1 status=ok");
  assert.equal(results(settled)[0].locator, "synthetic:2");
  assert.equal(settled.outcome, "ok");
});

test("2: a function_call named exec is read like the custom tool call", () => {
  const code = `text(await tools.exec_command({cmd:${JSON.stringify(HELPER)}}));`;
  const session = read([
    call("exec", "outer", { code }),
    output("outer", items("MO-REVIEW/1 status=ok")),
  ]);
  assert.deepEqual(kinds(session), ["helper_call", "helper_result"]);
  assert.equal(calls(session)[0].confirmed, true);
  assert.equal(session.outcome, "ok");
});

test("3: write_stdin continues the run and only the exit answer is its result", () => {
  const session = read([
    call("exec_command", "cmd", { cmd: HELPER }),
    output("cmd", "Process running with session ID 7"),
    call("write_stdin", "poll", { session_id: 7, chars: "" }),
    output("poll", "Process exited with code 0\nOutput:\nMO-REVIEW/1 status=ok"),
  ]);
  assert.deepEqual(kinds(session), ["helper_call", "helper_result"]);
  assert.equal(results(session)[0].excerpt, "MO-REVIEW/1 status=ok exit=0");
  assert.equal(results(session)[0].locator, "synthetic:4");
  assert.ok(!session.events.some((event) => event.excerpt.includes("Process running")));
  assert.equal(session.outcome, "ok");
});

test("4: a negative mention of a skill is a mention, never an invocation", () => {
  const text = "Do not invoke mo-review-orca; this is only an explanation of its documentation.";
  const session = read([
    response({ type: "message", role: "user", content: [{ type: "input_text", text }] }),
  ]);
  assert.deepEqual(kinds(session), ["skill_mention"]);
  assert.equal(session.events[0].skill, "mo-review-orca");
});

test("5: an unreadable record makes the session partial with its reason and number", () => {
  const session = read([
    { type: "session_meta", timestamp: AT, payload: { id: "x" } },
    "{ invalid JSON",
  ]);
  assert.equal(session.unparsed, 1);
  assert.equal(session.outcome, "partial");
  assert.deepEqual(session.gaps, [{ number: 2, reason: "invalid_json", time: null }]);
});

test("6: a call before --since still links the result inside the window", () => {
  const earlier = call("exec_command", "cmd", { cmd: HELPER });
  earlier.timestamp = "2026-10-11T00:00:00Z";
  const session = read(
    [earlier, output("cmd", "MO-REVIEW/1 status=ok")],
    "codex",
    Date.parse("2026-10-12T00:00:00Z"),
  );
  assert.equal(session.skipped, 1);
  assert.deepEqual(kinds(session), ["helper_result"]);
  assert.equal(results(session)[0].excerpt, "MO-REVIEW/1 status=ok");
  assert.equal(session.outcome, "ok");
});

test("7: typed lines past the bound are counted, not lost silently", () => {
  const text = `${[1, 2, 3, 4].map((n) => `MO-EVIDENCE/1 row=${n}`).join("\n")}\nMO-REVIEW/1 status=failed`;
  assert.equal(typedOverflow(text), 1);
  const session = read([call("exec_command", "cmd", { cmd: HELPER }), output("cmd", text)]);
  assert.equal(results(session)[0].truncated, 1);
  assert.equal(session.truncated, 1);
});

test("8: a structured answer's top-level exit_code is read", () => {
  const decoded = functionOutput(JSON.stringify({ output: "MO-REVIEW/1 status=ok", exit_code: 0 }));
  assert.equal(decoded.exitCode, 0);
  assert.equal(decoded.output, "MO-REVIEW/1 status=ok");
  assert.equal(decoded.session, null);
  const running = functionOutput(JSON.stringify({ output: "", session_id: 9 }));
  assert.equal(running.session, "9");
});

test("9: an untimed result borrows its call's time, so --since places it", () => {
  const claude = [
    {
      type: "assistant",
      sessionId: "synthetic",
      timestamp: AT,
      message: {
        content: [{ type: "tool_use", id: "c", name: "Bash", input: { command: HELPER } }],
      },
    },
    {
      type: "user",
      sessionId: "synthetic",
      message: {
        content: [{ type: "tool_result", tool_use_id: "c", content: "MO-REVIEW/1 status=ok" }],
      },
    },
  ];
  const normal = read(claude, "claude", Date.parse("2026-10-12T00:00:00Z"));
  const future = read(claude, "claude", Date.parse("2100-01-01T00:00:00Z"));
  assert.deepEqual(kinds(normal), ["helper_call", "helper_result"]);
  assert.equal(results(normal)[0].timeSource, "call");
  assert.equal(normal.inheritedTime, 1);
  assert.equal(normal.outcome, "ok");
  // The control no longer hides a state-dependent event: it is before the window.
  assert.deepEqual(kinds(future), []);
  assert.equal(future.outcome, "ok");
  assert.equal(normal.untimed, 1);
  assert.equal(future.untimed, 1);
  // Without a paired call the time stays unknown, and the window says so.
  const orphan = read([claude[1]], "claude", Date.parse("2026-10-12T00:00:00Z"));
  assert.deepEqual(kinds(orphan), []);
  assert.deepEqual(orphan.reasons, ["untimed_with_since"]);
  assert.equal(read([claude[1]], "claude").outcome, "ok");
});

test("a call in a branch that did not run is never confirmed", () => {
  const program = `if (false) {\n  text(await tools.exec_command({cmd:${JSON.stringify(HELPER)}}));\n}`;
  const session = read([exec("outer", program), execOutput("outer", items())]);
  assert.deepEqual(kinds(session), ["helper_call"]);
  assert.equal(calls(session)[0].confirmed, false);
  assert.deepEqual(session.reasons, ["unsupported_payload"]);
  assert.deepEqual(
    session.gaps.map((gap) => [gap.number, gap.reason]),
    [[1, "unsupported_payload"]],
  );
});

test("a SKILL.md read inside exec is a load, not an invocation", () => {
  const program = `text(await tools.exec_command({cmd:${JSON.stringify(SKILL_READ)}}));`;
  const file =
    '---\nname: mo-x\nmetadata:\n  source_tree: "1111111111111111111111111111111111111111"\n---\n# X\n';
  const session = read([
    exec("outer", program),
    execOutput("outer", items(JSON.stringify({ output: file, exit_code: 0 }))),
  ]);
  assert.deepEqual(kinds(session), ["skill_loaded"]);
  assert.equal(session.loads.length, 1);
  assert.equal(session.loads[0].sourceTree, "1111111111111111111111111111111111111111");
  assert.equal(session.loads[0].complete, true);
});

test("two calls with the result of only one confirm neither", () => {
  const program = [
    `text(await tools.exec_command({cmd:${JSON.stringify(HELPER)}}));`,
    `await tools.exec_command({cmd:${JSON.stringify(OTHER)}});`,
  ].join("\n");
  const session = read([
    exec("outer", program),
    execOutput("outer", items("MO-REVIEW/1 status=ok")),
  ]);
  assert.deepEqual(kinds(session), ["helper_call", "helper_call"]);
  assert.deepEqual(
    calls(session).map((event) => event.confirmed),
    [false, false],
  );
  assert.deepEqual(session.reasons, ["ambiguous_correlation"]);
  assert.deepEqual(
    session.gaps.map((gap) => gap.number),
    [2],
  );
});

test("a loop makes the program unsupported", () => {
  const program = `for (const cmd of [${JSON.stringify(HELPER)}]) {\n  text(await tools.exec_command({cmd}));\n}`;
  const session = read([
    exec("outer", program),
    execOutput("outer", items("MO-REVIEW/1 status=ok")),
  ]);
  assert.deepEqual(session.reasons, ["unsupported_payload"]);
  assert.ok(!session.events.some((event) => event.kind === "helper_result"));
});

test("one output item per call, in order, confirms each call with its own item", () => {
  const program = [
    `const first = await tools.exec_command({cmd:${JSON.stringify(HELPER)}, yield_time_ms: 1000});`,
    "text(first.output);",
    `text(await tools.exec_command({cmd:${JSON.stringify(OTHER)}, login: false}));`,
  ].join("\n");
  const second = JSON.stringify({ output: "MO-REVIEW-REPORT/1 status=valid", exit_code: 0 });
  const session = read([
    exec("outer", program),
    execOutput("outer", items("MO-REVIEW/1 status=ok", second)),
  ]);
  assert.deepEqual(
    calls(session).map((event) => event.confirmed),
    [true, true],
  );
  assert.deepEqual(
    results(session).map((event) => event.excerpt),
    ["MO-REVIEW/1 status=ok", "MO-REVIEW-REPORT/1 status=valid exit=0"],
  );
  assert.equal(session.outcome, "ok");
});

test("a yielded cell settles under wait, and a failed script confirms nothing", () => {
  const program = `text(await tools.exec_command({cmd:${JSON.stringify(HELPER)}}));`;
  const running = [
    {
      type: "input_text",
      text: "Script running with cell ID 5\nWall time 30.0 seconds\nOutput:\n",
    },
  ];
  const waited = read([
    exec("outer", program),
    execOutput("outer", running),
    call("wait", "w1", { cell_id: "5" }),
    output("w1", items("MO-REVIEW/1 status=ok")),
  ]);
  assert.deepEqual(kinds(waited), ["helper_call", "helper_result"]);
  assert.equal(calls(waited)[0].confirmed, true);
  assert.equal(results(waited)[0].locator, "synthetic:4");
  const failed = read([
    exec("outer", program),
    execOutput("outer", [
      { type: "input_text", text: "Script failed\nWall time 0.0 seconds\nOutput:\n" },
      { type: "input_text", text: "Script error:\nboom" },
    ]),
  ]);
  assert.equal(calls(failed)[0].confirmed, false);
  assert.deepEqual(failed.reasons, ["ambiguous_correlation"]);
});

test("a program that names no Meta-O helper never lowers completeness", () => {
  const program = "for (const cmd of ['git status']) text(await tools.exec_command({cmd}));";
  const session = read([exec("outer", program), execOutput("outer", items("clean"))]);
  assert.deepEqual(session.events, []);
  assert.equal(session.outcome, "ok");
});

test("a run with an execution record is counted once, from that record", () => {
  const program = `text(await tools.exec_command({cmd:${JSON.stringify(HELPER)}}));`;
  const loop = `for (const cmd of [${JSON.stringify(OTHER)}]) text(await tools.exec_command({cmd}));`;
  const session = read([
    exec("outer", program),
    execution(HELPER, "MO-REVIEW/1 status=ok\n"),
    execOutput("outer", items("MO-REVIEW/1 status=ok")),
    exec("loop", loop),
    execution(OTHER, "MO-REVIEW-REPORT/1 status=valid\n"),
    execOutput("loop", items("MO-REVIEW-REPORT/1 status=valid")),
  ]);
  assert.deepEqual(
    session.events.map((event) => [event.locator, event.kind, event.confirmed]),
    [
      ["synthetic:2", "helper_call", true],
      ["synthetic:2", "helper_result", undefined],
      ["synthetic:5", "helper_call", true],
      ["synthetic:5", "helper_result", undefined],
    ],
  );
  // Every run there has its record, so a loop hides none and is no gap.
  assert.equal(session.outcome, "ok");
  // A direct call whose command never got a record stays, unconfirmed.
  const orphan = read([execution(OTHER, "x\n"), call("exec_command", "c", { cmd: HELPER })]);
  assert.deepEqual(
    orphan.events.map((event) => [event.kind, event.confirmed]),
    [
      ["helper_call", true],
      ["helper_result", undefined],
      ["helper_call", false],
    ],
  );
});

test("a line too long and an extractor error are named gaps", () => {
  const session = read([
    { type: "session_meta", timestamp: AT, payload: { id: "x" } },
    `{"pad":"${"x".repeat(64 * 1024 * 1024 + 1)}"}`,
    call("wait", "w", { cell_id: { toString: 1 } }),
  ]);
  assert.equal(session.unparsed, 2);
  assert.deepEqual(
    session.gaps.map((gap) => [gap.number, gap.reason]),
    [
      [2, "line_too_long"],
      [3, "extractor_error"],
    ],
  );
  assert.deepEqual(session.reasons, ["line_too_long", "extractor_error"]);
});

test("only the closed straight-line forms are supported exec programs", () => {
  const cmd = JSON.stringify(HELPER);
  const supported = [
    `await tools.exec_command({cmd:${cmd}});`,
    `// @exec: {"yield_time_ms": 1000}\ntext(await tools.exec_command({cmd:${cmd}, n: -1, ok: true, a: [1, \`x\`]}));`,
    `const r = await tools.exec_command({cmd:${cmd}});\nconsole.log(r);`,
    `let r = text(await tools.exec_command({cmd:${cmd}}));`,
    `const r = await tools.exec_command({cmd:${cmd}});\ntext(r.output);`,
  ];
  for (const source of supported) {
    const program = readProgram(source);
    assert.equal(program.supported, true, source);
    assert.deepEqual(program.calls[0], {
      tool: "exec_command",
      argument: program.calls[0].argument,
    });
    assert.equal(program.calls[0].argument.cmd, HELPER, source);
  }
  const unsupported = [
    `try { await tools.exec_command({cmd:${cmd}}); } catch {}`,
    `await Promise.all([tools.exec_command({cmd:${cmd}})]);`,
    `function go() { return tools.exec_command({cmd:${cmd}}); }`,
    `const c = ${cmd};\nawait tools.exec_command({cmd: c});`,
    `await tools.exec_command({cmd: \`node \${"x"}\`});`,
    `await tools.exec_command({["cmd"]: ${cmd}});`,
    `while (true) { await tools.exec_command({cmd:${cmd}}); }`,
    `text(await tools.exec_command({cmd:${cmd}}))) syntax error`,
    `const r = await tools.exec_command({cmd:${cmd}});\nr = 1;`,
  ];
  for (const source of unsupported) assert.equal(readProgram(source).supported, false, source);
  // Calls found in an unsupported program keep a literal command when it has one.
  const found = readProgram(`if (x) { await tools.exec_command({cmd:${cmd}}); }`);
  assert.deepEqual(found.calls, [{ tool: "exec_command", argument: { cmd: HELPER } }]);
  assert.equal(found.marked, true);
});
