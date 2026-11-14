/**
 * Follow Codex tool calls from the request to the final result of what ran.
 *
 * A Codex command is told in pieces: an `exec_command` call, an answer that
 * may only say `Process running with session ID <n>`, then `write_stdin`
 * polls on that session until one answers with the exit code; or an `exec`
 * program whose cell may yield `Script running with cell ID <id>` and finish
 * under a later `wait`. Each piece alone is not the result, so the pieces are
 * linked by call id, session id and cell id, and a helper result is recorded
 * only once the final piece arrives. A call is recorded as soon as it is
 * found, `confirmed: false`, and flips to `confirmed: true` only when one
 * result is unambiguously its own.
 *
 * Everything recorded here is tagged `origin: "call"`: it is the call side of
 * a run, which a session with `CommandExecution` records also tells directly.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

import { readExecOutput, readProgram } from "./mo-debug-exec.mjs";
import {
  helperNames,
  installedSkillName,
  owningSkill,
  sourceTreeIn,
  typedOverflow,
  typedResult,
} from "./mo-debug-text.mjs";

const CALL = { origin: "call" };
const INSTALLED_READ =
  /(?:^|[\s'"=/])((?:[^\s'"]*\/)?skills\/(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md)/gu;
const READ_VERB = /(?:^|[\s;&|(])(?:cat|sed|head|nl|awk|less|bat)\s/u;
// Exactly one whole-file read: `cat <file>` or `sed -n '1,<N>p' <file>`.
const SINGLE_READ =
  /^\s*(?:cat|sed -n (['"]?)1,(\d+)p\1)\s+(['"]?)[^\s'"]*skills\/mo-[a-z0-9-]+\/SKILL\.md\3\s*$/u;
const TRUNCATED = /tokens truncated|Warning: truncated output|Total output lines:/u;

/**
 * §A-DIAGNOSTICS-01 names the installed Meta-O skills one command reads.
 *
 * @param {string} command recorded command text
 * @param {object[]|null} parsed Codex `parsed_cmd`, which wins when recorded
 * @returns {string[]} distinct skill names whose installed `SKILL.md` is read
 */
export function skillReads(command, parsed) {
  const paths = Array.isArray(parsed)
    ? parsed.filter((entry) => entry?.type === "read").map((entry) => String(entry.path ?? ""))
    : READ_VERB.test(command)
      ? [...command.matchAll(INSTALLED_READ)].map((match) => match[1])
      : [];
  const names = [];
  for (const path of paths) {
    const name = installedSkillName(path);
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

/**
 * A read is complete only when the output is provably the whole file: one
 * `cat`, or one `sed -n '1,Np'` that printed fewer than N lines, exiting 0
 * with no truncation notice. Anything else can still show the stamp.
 */
function readIsComplete(command, reads, output, exitCode) {
  if (reads.length !== 1 || exitCode !== 0 || TRUNCATED.test(output)) return false;
  const single = SINGLE_READ.exec(command);
  if (!single) return false;
  if (single[2] === undefined) return true;
  return output.split("\n").length - 1 < Number(single[2]);
}

/**
 * §A-DIAGNOSTICS-01 records the skill files one finished command read.
 *
 * @param {object} evidence collector from `createEvidence`
 * @param {string} command recorded command text
 * @param {object[]|null} parsed Codex `parsed_cmd`, when recorded
 * @param {{output: string, exitCode?: number}} result the final result
 * @param {number} number record that carried the result
 * @param {object} [details] fields added to every event, such as `origin`
 */
export function commandEvidence(evidence, command, parsed, result, number, details = {}) {
  const reads = skillReads(command, parsed);
  const complete = readIsComplete(command, reads, result.output, result.exitCode);
  for (const name of reads) {
    evidence.event(number, "skill_loaded", name, `${command}\n${result.output}`, details);
    evidence.load(
      number,
      {
        name,
        sourceTree: sourceTreeIn(result.output, name),
        complete,
        comparison: "file",
        candidates: complete ? [result.output] : [],
      },
      details,
    );
  }
}

/**
 * §A-DIAGNOSTICS-01 records the typed result of one finished helper run.
 *
 * @param {object} evidence collector from `createEvidence`
 * @param {string} command recorded command text
 * @param {{output: string, exitCode?: number}} result the final result
 * @param {number} number record that carried the result
 * @param {object} [details] fields added to the event, such as `origin`
 */
export function helperResult(evidence, command, result, number, details = {}) {
  const suffix = Number.isInteger(result.exitCode) ? ` exit=${result.exitCode}` : "";
  evidence.event(
    number,
    "helper_result",
    owningSkill(command),
    `${typedResult(result.output)}${suffix}`,
    {
      ...details,
      truncated: typedOverflow(result.output),
    },
  );
}

function parsedObject(raw) {
  try {
    const value = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function contentText(raw) {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw))
    return raw.map((item) => (typeof item?.text === "string" ? item.text : "")).join("");
  return String(raw?.output ?? raw?.content ?? "");
}

/**
 * §A-DIAGNOSTICS-01 reads one command answer: its output, its exit code and,
 * while the process still runs, the session id later polls continue.
 *
 * Older rollouts prefix the output with `Chunk ID`, timing and `Process exited
 * with code <n>` or `Process running with session ID <n>` lines; a structured
 * answer is a JSON object whose top-level `exit_code` and `session_id` say the
 * same. An answer naming a running session is not a final result.
 *
 * @param {unknown} raw the recorded `output` field, or one `exec` output item
 * @returns {{output: string, exitCode: number|undefined, session: string|null}}
 *   the output after any header, the exit code when known, and the running session
 */
export function functionOutput(raw) {
  let text = contentText(raw);
  const wrapped = parsedObject(text);
  if (typeof wrapped.output === "string") text = wrapped.output;
  const head = text.slice(0, 512);
  const exit = /^Process exited with code (-?\d+)$/mu.exec(head);
  const running = /^Process running with session ID (\d+)$/mu.exec(head);
  const header = text.indexOf("\nOutput:\n");
  let output = header !== -1 && header < 512 ? text.slice(header + "\nOutput:\n".length) : text;
  if (running && header === -1) output = "";
  const exitCode = exit
    ? Number(exit[1])
    : Number.isInteger(wrapped.exit_code)
      ? wrapped.exit_code
      : wrapped.metadata?.exit_code;
  const structured = wrapped.session_id !== undefined && wrapped.session_id !== null;
  const session = running
    ? running[1]
    : structured && exitCode === undefined
      ? String(wrapped.session_id)
      : null;
  return { output, exitCode, session };
}

function interesting(command) {
  return helperNames(command).length > 0 || skillReads(command, null).length > 0;
}

/** Every event of one run names that run, so its execution record can replace it. */
function ofRun(record) {
  return { ...CALL, run: record.run };
}

/** A found command: a helper call is recorded now, unconfirmed. */
function startCommand(state, command, number) {
  const record = { run: state.records.length, command, number, time: state.evidence.now() };
  record.chunks = [];
  record.event =
    helperNames(command).length > 0
      ? state.evidence.event(number, "helper_call", owningSkill(command), command, {
          ...ofRun(record),
          confirmed: false,
        })
      : null;
  state.records.push(record);
  return record;
}

function settleCommand(state, record, exitCode, number) {
  const result = { output: record.chunks.join(""), exitCode };
  if (record.event) helperResult(state.evidence, record.command, result, number, ofRun(record));
  commandEvidence(state.evidence, record.command, null, result, number, ofRun(record));
}

/**
 * A rollout that writes `CommandExecution` records tells each run twice: once
 * as the call, once as the execution. A call whose exact command text has an
 * execution record left over is that run, and only the execution is kept; a
 * call without one stays, unconfirmed unless its own result arrived. Every
 * command such a rollout runs gets an execution record, so a program that
 * could not be read hides no run there, and its gap is dropped.
 */
function preferExecutions(state, executed) {
  if (executed.length === 0) return;
  const left = new Map();
  for (const command of executed) left.set(command, (left.get(command) ?? 0) + 1);
  const twinned = new Set();
  for (const record of state.records) {
    const count = left.get(record.command) ?? 0;
    if (count === 0) continue;
    left.set(record.command, count - 1);
    twinned.add(record.run);
  }
  const kept = (item) =>
    item.origin !== "call" || (item.run !== undefined && !twinned.has(item.run));
  const { evidence } = state;
  evidence.events = evidence.events.filter(kept);
  evidence.loads = evidence.loads.filter(kept);
  evidence.gaps = evidence.gaps.filter(kept);
}

/** The first answer of a command: final, or the session it keeps running in. */
function commandAnswer(state, record, result, number) {
  if (record.event) record.event.confirmed = true;
  state.evidence.inherit(record.time);
  record.chunks.push(result.output);
  if (result.session !== null) state.processes.set(result.session, record);
  else settleCommand(state, record, result.exitCode, number);
}

/** A poll of a running session: only an answer with an exit code is final. */
function stdinAnswer(state, session, result, number) {
  const record = state.processes.get(session);
  if (!record) return;
  state.evidence.inherit(record.time);
  record.chunks.push(result.output);
  if (result.exitCode === undefined) return;
  state.processes.delete(session);
  settleCommand(state, record, result.exitCode, number);
}

function foundCall(state, call, number) {
  const argument = call.argument;
  if (call.tool === "exec_command" && typeof argument?.cmd === "string") {
    return { record: startCommand(state, argument.cmd, number) };
  }
  const session = argument?.session_id;
  if (call.tool === "write_stdin" && (typeof session === "number" || typeof session === "string")) {
    return { stdin: String(session) };
  }
  return {};
}

const RUNNERS = new Set(["exec_command", "write_stdin"]);

/**
 * Whether the cell can hold evidence of interest. A program out of form may
 * build its command at run time, so it counts when it runs commands at all
 * and names a Meta-O helper or skill directory anywhere; one that only patches
 * a file under `skills/mo-*` runs nothing and hides no run.
 */
function cellInteresting(state, cell) {
  const { program } = cell;
  if (!program.supported)
    return program.marked && program.calls.some((call) => RUNNERS.has(call.tool));
  return cell.calls.some(
    (call) =>
      (call.record && interesting(call.record.command)) ||
      (call.stdin && Boolean(state.processes.get(call.stdin))),
  );
}

/** An `exec` program: every call it names is found now and settled later. */
function startProgram(state, callId, source, number) {
  const program = readProgram(source);
  const cell = { number, time: state.evidence.now(), program, items: [] };
  cell.calls = program.calls.map((call) => foundCall(state, call, number));
  cell.interesting = cellInteresting(state, cell);
  if (!program.supported && cell.interesting)
    state.evidence.gap(number, "unsupported_payload", CALL);
  state.calls.set(callId, { cell });
  state.open.add(cell);
}

function resolveCall(state, call, text, number) {
  if (call.record && text === null) {
    if (call.record.event) call.record.event.confirmed = true;
  } else if (call.record) commandAnswer(state, call.record, functionOutput(text), number);
  else if (call.stdin && text !== null)
    stdinAnswer(state, call.stdin, functionOutput(text), number);
}

/**
 * A call is linked to a result only when nothing else could have produced it:
 * the single call of a supported program that completed, or every call shown
 * by its own output item, in order, with exactly one item per call.
 */
function settleCell(state, cell, status, number) {
  state.open.delete(cell);
  if (!cell.program.supported || cell.calls.length === 0) return;
  state.evidence.inherit(cell.time);
  const { calls, items, program } = cell;
  let results = null;
  if (status === "completed" && calls.length === 1) {
    results = [program.shown[0] ? items.join("\n") : null];
  } else if (status === "completed" && program.perCall && items.length === calls.length) {
    results = items;
  }
  if (results === null) {
    if (cell.interesting) state.evidence.gap(number, "ambiguous_correlation", CALL);
    return;
  }
  calls.forEach((call, index) => resolveCall(state, call, results[index], number));
}

function cellAnswer(state, cell, output, number) {
  const answer = readExecOutput(output);
  cell.items.push(...answer.items);
  if (answer.status === "running") {
    if (answer.cell !== null) state.cells.set(answer.cell, cell);
    return false;
  }
  if (answer.status === null) return false;
  settleCell(state, cell, answer.status, number);
  return true;
}

/**
 * §A-DIAGNOSTICS-01 creates the call follower of one Codex rollout.
 *
 * @param {object} evidence collector from `createEvidence`
 * @returns {{call: Function, output: Function, finish: Function}} `call` takes
 *   a `function_call` or `custom_tool_call` payload, `output` its answer, and
 *   `finish(executed)` turns every cell still open into a named gap, then
 *   keeps one account of each run given the commands of execution records
 */
export function createCallFollower(evidence) {
  const state = {
    evidence,
    calls: new Map(),
    processes: new Map(),
    cells: new Map(),
    open: new Set(),
    records: [],
  };
  const call = (payload, args, number) => {
    const name = payload.name;
    if (["exec_command", "shell", "local_shell"].includes(name)) {
      const command = commandArgument(args.cmd ?? args.command);
      if (command !== "")
        state.calls.set(payload.call_id, { record: startCommand(state, command, number) });
    } else if (name === "write_stdin" && args.session_id !== undefined) {
      state.calls.set(payload.call_id, { stdin: String(args.session_id) });
    } else if (name === "exec") {
      const source = payload.type === "custom_tool_call" ? payload.input : args.code;
      if (typeof source === "string") startProgram(state, payload.call_id, source, number);
    } else if (name === "wait" && state.cells.has(String(args.cell_id))) {
      state.calls.set(payload.call_id, { cell: state.cells.get(String(args.cell_id)) });
    }
  };
  const output = (payload, number) => {
    const entry = state.calls.get(payload.call_id);
    if (!entry) return;
    if (entry.cell) {
      if (cellAnswer(state, entry.cell, payload.output, number))
        state.calls.delete(payload.call_id);
      return;
    }
    state.calls.delete(payload.call_id);
    if (entry.record) commandAnswer(state, entry.record, functionOutput(payload.output), number);
    else stdinAnswer(state, entry.stdin, functionOutput(payload.output), number);
  };
  const finish = (executed = []) => {
    for (const cell of state.open) {
      if (cell.interesting)
        evidence.gap(cell.number, "ambiguous_correlation", { ...CALL, time: cell.time });
    }
    state.open.clear();
    preferExecutions(state, executed);
  };
  return { call, output, finish };
}

/**
 * §A-DIAGNOSTICS-01 turns a recorded command argument into its shell text.
 *
 * @param {unknown} command a string, or an argv array whose last word is the script
 * @returns {string} the command text, or empty when there is none
 */
export function commandArgument(command) {
  if (Array.isArray(command)) return String(command.at(-1) ?? "");
  return typeof command === "string" ? command : "";
}
