/**
 * Extract Meta-O skill evidence from one Codex rollout file.
 *
 * Codex has told the commands it runs in several shapes over time: a
 * `function_call` named `exec_command` or `shell` with a separate
 * `function_call_output`, polled through `write_stdin` while it runs; an
 * `exec` tool call (`custom_tool_call`, or `function_call` with `code`) whose
 * JavaScript program calls those tools and may finish under a later `wait`;
 * and an `item_completed` event holding a `CommandExecution` with the command,
 * its parsed reads, its exit code and its output. The call shapes are followed
 * by `mo-debug-codex-calls.mjs`. A `CommandExecution` is the run itself, so a
 * rollout that writes them tells every run twice; at `finish` a call with an
 * execution record of the same command gives way to it, and each run counts once.
 *
 * A skill attached by the user arrives as a `skill` content item, which is the
 * only structural activation, and then as a user message wrapping the whole
 * SKILL.md in `<skill>…</skill>`, which is a load. A skill named in the user's
 * words is only a mention: "do not invoke mo-x" names it too. Codex reads
 * files whole, so the frontmatter stamp is usually visible, unlike in Claude.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

import {
  commandArgument,
  commandEvidence,
  createCallFollower,
  helperResult,
} from "./mo-debug-codex-calls.mjs";
import { mentionExcerpt } from "./mo-debug-redact.mjs";
import {
  SKILL_NAME,
  createEvidence,
  helperNames,
  owningSkill,
  sourceTreeIn,
} from "./mo-debug-text.mjs";

const SHAPES = new Set(["session_meta", "response_item", "event_msg", "turn_context"]);
const SKILL_WRAPPER = /^<skill>\n<name>([^<\n]*)<\/name>\n<path>[^<\n]*<\/path>\n/u;
const MENTION = /(?<![\w./-])\$?(mo-[a-z0-9]+(?:-[a-z0-9]+)*)(?![\w./-])/gu;

function textsOf(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((part) => typeof part?.text === "string").map((part) => part.text);
}

function wrappedSkill(evidence, text, number) {
  const match = SKILL_WRAPPER.exec(text);
  if (!match || !SKILL_NAME.test(match[1])) return;
  const name = match[1];
  const rest = text.slice(match[0].length);
  const complete = rest.endsWith("\n</skill>");
  const file = complete ? rest.slice(0, -"\n</skill>".length) : rest;
  evidence.event(number, "skill_loaded", name, text);
  evidence.load(number, {
    name,
    sourceTree: sourceTreeIn(file, name),
    complete,
    comparison: "file",
    candidates: complete ? [file] : [],
  });
}

/**
 * Harness-injected context (environment, AGENTS.md, turn notices) is not the
 * user's words, so a skill named there is not even a mention.
 */
function userMessage(evidence, payload, number) {
  for (const text of textsOf(payload.content)) {
    if (text.startsWith("<skill>")) {
      wrappedSkill(evidence, text, number);
      continue;
    }
    if (text.startsWith("<") || text.startsWith("# AGENTS.md instructions")) continue;
    const seen = new Set();
    for (const match of text.matchAll(MENTION)) {
      if (seen.has(match[1])) continue;
      seen.add(match[1]);
      evidence.event(number, "skill_mention", match[1], mentionExcerpt(text, match[0]));
    }
  }
}

function commandExecution(evidence, item, number) {
  const command = commandArgument(item.command);
  const result = {
    output: typeof item.stdout === "string" ? item.stdout : String(item.aggregated_output ?? ""),
    exitCode: item.exit_code,
  };
  if (helperNames(command).length > 0) {
    // The record is the execution itself, so the call is confirmed by it.
    evidence.event(number, "helper_call", owningSkill(command), command, { confirmed: true });
    helperResult(evidence, command, result, number);
  }
  commandEvidence(evidence, command, item.parsed_cmd, result, number);
}

function parsedArguments(raw) {
  try {
    const value = JSON.parse(raw);
    return value !== null && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function userAttachments(evidence, item, number) {
  for (const part of Array.isArray(item.content) ? item.content : []) {
    if (part?.type === "skill" && SKILL_NAME.test(part.name ?? "")) {
      evidence.event(number, "skill_invocation", part.name, `skill attached: ${part.name}`);
    }
  }
}

function responseItem(state, payload, number) {
  if (payload.type === "message" && payload.role === "user") {
    userMessage(state.evidence, payload, number);
  } else if (payload.type === "function_call") {
    state.follower.call(payload, parsedArguments(payload.arguments), number);
  } else if (payload.type === "custom_tool_call") {
    state.follower.call(payload, {}, number);
  } else if (
    payload.type === "function_call_output" ||
    payload.type === "custom_tool_call_output"
  ) {
    state.follower.output(payload, number);
  }
}

function feedPayload(state, record, number) {
  const payload = record.payload;
  if (record.type === "response_item") {
    responseItem(state, payload, number);
    return;
  }
  if (record.type !== "event_msg" || payload.type !== "item_completed") return;
  const item = payload.item;
  if (item?.type === "CommandExecution") {
    state.executed.push(commandArgument(item.command));
    commandExecution(state.evidence, item, number);
  } else if (item?.type === "UserMessage") userAttachments(state.evidence, item, number);
}

/**
 * §A-DIAGNOSTICS-01 creates the extractor for one Codex rollout.
 *
 * @param {string} session session id used in locators
 * @returns {{evidence: object, finish: () => object,
 *   feed: (record: object, number: number, time?: number|null) => void}}
 *   `feed` takes every parsed JSONL record, its 1-based line number and its
 *   timestamp in ms or null, whatever `--since` says: an earlier call still
 *   links a later result. `finish` settles what is still open and returns the
 *   evidence with each run told once
 */
export function createCodexExtractor(session) {
  const evidence = createEvidence(session, "codex");
  const state = { evidence, follower: createCallFollower(evidence), executed: [] };
  const recognizes = (record) =>
    SHAPES.has(record.type) && record.payload !== null && typeof record.payload === "object";
  const feed = (record, number, time = null) => {
    if (!recognizes(record)) return;
    evidence.recognized += 1;
    evidence.enter(time);
    feedPayload(state, record, number);
  };
  const finish = () => {
    state.follower.finish(state.executed);
    return evidence;
  };
  return { evidence, feed, finish };
}
