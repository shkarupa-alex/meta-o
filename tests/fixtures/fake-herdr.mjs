#!/usr/bin/env node
/**
 * §M-TEST-FAKE-HERDR — A scripted stand-in for the Herdr CLI.
 *
 * Implements §A-EXECUTABLE-ACCEPTANCE. The write-ahead protocol is only
 * interesting at the moments a real terminal multiplexer makes hard to produce
 * on demand: a prompt that stalls, a session that vanished, a call that fails
 * outright. This fake reproduces Herdr's envelope, exit statuses and monotonic
 * counters faithfully enough that the adapter cannot tell the difference, and
 * lets a test ask for those moments directly through `FAKE_HERDR_FAIL`.
 */

import { readFileSync, writeFileSync } from "node:fs";

const statePath = process.env["FAKE_HERDR_STATE"];
if (!statePath) {
  process.stderr.write('{"error":{"code":"no_state","message":"FAKE_HERDR_STATE is unset"}}\n');
  process.exit(2);
}

/** §M-TEST-FAKE-HERDR — Load the simulated server state. */
function load() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return { agents: {}, panes: {}, nextPane: 1 };
  }
}

/** §M-TEST-FAKE-HERDR — Persist the simulated server state. */
function save(state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/** §M-TEST-FAKE-HERDR — Emit Herdr's success envelope. */
function ok(result) {
  process.stdout.write(`${JSON.stringify({ id: "1", result })}\n`);
  process.exit(0);
}

/** §M-TEST-FAKE-HERDR — Emit Herdr's error envelope with its exit status. */
function error(code, message, exitCode = 1) {
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exit(exitCode);
}

/** §M-TEST-FAKE-HERDR — Read a flag's value from the argument vector. */
function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const argv = process.argv.slice(2);
const [group, verb, target] = argv;
const state = load();

// A test asks for a specific failure by naming the command that must break.
const forced = process.env["FAKE_HERDR_FAIL"];
if (forced && forced.split(",").includes(`${group} ${verb}`)) {
  const code = process.env["FAKE_HERDR_FAIL_CODE"] ?? "herdr_error";
  error(code, `forced failure of ${group} ${verb}`);
}

if (group === "agent" && verb === "list") {
  ok({ agents: Object.values(state.agents) });
}

if (group === "agent" && verb === "get") {
  const agent = state.agents[target];
  if (!agent) error("agent_not_found", `no agent named ${target}`);
  ok({ agent });
}

if (group === "pane" && verb === "split") {
  const paneId = `%${state.nextPane}`;
  state.nextPane += 1;
  state.panes[paneId] = { pane_id: paneId, cwd: flag(argv, "--cwd") ?? "", text: "" };
  save(state);
  ok({ pane: state.panes[paneId] });
}

if (group === "pane" && verb === "get") {
  const pane = state.panes[target];
  if (!pane) error("pane_not_found", `no pane ${target}`);
  ok({ pane });
}

if (group === "pane" && verb === "close") {
  if (!state.panes[target]) error("pane_not_found", `no pane ${target}`);
  delete state.panes[target];
  for (const [name, agent] of Object.entries(state.agents)) {
    if (agent.pane_id === target) delete state.agents[name];
  }
  save(state);
  ok({ closed: true });
}

if (group === "agent" && verb === "start") {
  const paneId = flag(argv, "--pane");
  if (!state.panes[paneId]) error("pane_not_found", `no pane ${paneId}`);
  state.agents[target] = {
    name: target,
    agent: flag(argv, "--kind") ?? "claude",
    pane_id: paneId,
    agent_status: "idle",
    revision: 1,
    state_change_seq: 1,
    launch_pending: false,
    interactive_ready: true,
  };
  save(state);
  ok({ agent: state.agents[target] });
}

if (group === "agent" && verb === "prompt") {
  const agent = state.agents[target];
  if (!agent) error("agent_not_found", `no agent named ${target}`);
  if (process.env["FAKE_HERDR_STALL"] === "1") error("agent_prompt_stalled", "the agent never moved");

  const pane = state.panes[agent.pane_id];
  if (pane) pane.text = `${pane.text}\n${argv[3] ?? ""}`.slice(-8192);
  agent.revision += 1;
  agent.state_change_seq += 1;
  agent.agent_status = "idle";
  save(state);
  ok({ agent });
}

if (group === "agent" && verb === "read") {
  const agent = state.agents[target];
  if (!agent) error("agent_not_found", `no agent named ${target}`);
  // Plain terminal text, no JSON envelope and no revision — this is what the
  // real `herdr agent read` prints, and the fake said otherwise for long
  // enough that the adapter shipped a read path that always threw against it.
  process.stdout.write(state.panes[agent.pane_id]?.text ?? "");
  process.exit(0);
}

if (group === "agent" && verb === "wait") {
  const agent = state.agents[target];
  if (!agent) error("agent_not_found", `no agent named ${target}`);
  ok({ agent });
}

if (group === "agent" && verb === "send-keys") {
  ok({ sent: true });
}

error("cli_syntax_error", `unknown command: ${argv.join(" ")}`, 2);
