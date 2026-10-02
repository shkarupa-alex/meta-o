/**
 * Extract Meta-O skill evidence from one Codex rollout file.
 *
 * Codex has written two command shapes over time: older rollouts carry a
 * `function_call` named `exec_command` or `shell` with a separate
 * `function_call_output`, newer ones an `item_completed` event holding a
 * `CommandExecution` with the command, its parsed reads and its stdout. A skill
 * attached by the user arrives as a `skill` content item and then as a user
 * message wrapping the whole SKILL.md in `<skill>…</skill>`. Codex reads files
 * whole, so the frontmatter stamp is usually visible here, unlike in Claude.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

import { mentionExcerpt } from "./mo-debug-redact.mjs";
import {
  SKILL_NAME,
  createEvidence,
  helperNames,
  installedSkillName,
  owningSkill,
  sourceTreeIn,
  typedResult,
} from "./mo-debug-text.mjs";

const SHAPES = new Set(["session_meta", "response_item", "event_msg", "turn_context"]);
const SKILL_WRAPPER = /^<skill>\n<name>([^<\n]*)<\/name>\n<path>[^<\n]*<\/path>\n/u;
const MENTION = /(?<![\w./-])\$?(mo-[a-z0-9]+(?:-[a-z0-9]+)*)(?![\w./-])/gu;
const INSTALLED_READ =
  /(?:^|[\s'"=/])((?:[^\s'"]*\/)?skills\/(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md)/gu;
const READ_VERB = /(?:^|[\s;&|(])(?:cat|sed|head|nl|awk|less|bat)\s/u;
// Exactly one whole-file read: `cat <file>` or `sed -n '1,<N>p' <file>`.
const SINGLE_READ =
  /^\s*(?:cat|sed -n (['"]?)1,(\d+)p\1)\s+(['"]?)[^\s'"]*skills\/mo-[a-z0-9-]+\/SKILL\.md\3\s*$/u;
const TRUNCATED = /tokens truncated|Warning: truncated output|Total output lines:/u;

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
 * user's request, so a skill named there is not an invocation.
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
      evidence.event(number, "skill_invocation", match[1], mentionExcerpt(text, match[0]));
    }
  }
}

function commandText(command) {
  if (Array.isArray(command)) return String(command.at(-1) ?? "");
  return typeof command === "string" ? command : "";
}

function skillReads(command, parsed) {
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

function commandEvidence(evidence, command, parsed, result, numbers) {
  const reads = skillReads(command, parsed);
  const complete = readIsComplete(command, reads, result.output, result.exitCode);
  for (const name of reads) {
    evidence.event(numbers.result, "skill_loaded", name, `${command}\n${result.output}`);
    evidence.load(numbers.result, {
      name,
      sourceTree: sourceTreeIn(result.output, name),
      complete,
      comparison: "file",
      candidates: complete ? [result.output] : [],
    });
  }
}

function helperResult(evidence, command, result, number) {
  const suffix = Number.isInteger(result.exitCode) ? ` exit=${result.exitCode}` : "";
  evidence.event(
    number,
    "helper_result",
    owningSkill(command),
    `${typedResult(result.output)}${suffix}`,
  );
}

function commandExecution(evidence, item, number) {
  const command = commandText(item.command);
  const result = {
    output: typeof item.stdout === "string" ? item.stdout : String(item.aggregated_output ?? ""),
    exitCode: item.exit_code,
  };
  if (helperNames(command).length > 0) {
    evidence.event(number, "helper_call", owningSkill(command), command);
    helperResult(evidence, command, result, number);
  }
  commandEvidence(evidence, command, item.parsed_cmd, result, { result: number });
}

function parsedArguments(raw) {
  try {
    const value = JSON.parse(raw);
    return value !== null && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

/** Older rollouts prefix output with `Chunk ID`, timing and exit lines. */
function functionOutput(raw) {
  let text = typeof raw === "string" ? raw : String(raw?.output ?? raw?.content ?? "");
  const wrapped = parsedArguments(text);
  if (typeof wrapped.output === "string") text = wrapped.output;
  const exit = /^Process exited with code (-?\d+)$/mu.exec(text.slice(0, 512));
  const header = text.indexOf("\nOutput:\n");
  const output = header !== -1 && header < 512 ? text.slice(header + "\nOutput:\n".length) : text;
  return { output, exitCode: exit ? Number(exit[1]) : wrapped.metadata?.exit_code };
}

function functionCall(state, payload, number) {
  if (!["exec_command", "shell", "local_shell"].includes(payload.name)) return;
  const args = parsedArguments(payload.arguments);
  const command = commandText(args.cmd ?? args.command);
  if (command === "") return;
  state.calls.set(payload.call_id, { command, number });
  if (helperNames(command).length > 0) {
    state.evidence.event(number, "helper_call", owningSkill(command), command);
  }
}

function functionCallOutput(state, payload, number) {
  const call = state.calls.get(payload.call_id);
  if (!call) return;
  state.calls.delete(payload.call_id);
  const result = functionOutput(payload.output);
  if (helperNames(call.command).length > 0) {
    helperResult(state.evidence, call.command, result, number);
  }
  commandEvidence(state.evidence, call.command, null, result, { result: number });
}

function userAttachments(evidence, item, number) {
  for (const part of Array.isArray(item.content) ? item.content : []) {
    if (part?.type === "skill" && SKILL_NAME.test(part.name ?? "")) {
      evidence.event(number, "skill_invocation", part.name, `skill attached: ${part.name}`);
    }
  }
}

function feedPayload(state, record, number) {
  const payload = record.payload;
  const { evidence } = state;
  if (record.type === "response_item") {
    if (payload.type === "message" && payload.role === "user")
      userMessage(evidence, payload, number);
    else if (payload.type === "function_call") functionCall(state, payload, number);
    else if (payload.type === "function_call_output") functionCallOutput(state, payload, number);
    return;
  }
  if (record.type !== "event_msg" || payload.type !== "item_completed") return;
  const item = payload.item;
  if (item?.type === "CommandExecution") commandExecution(evidence, item, number);
  else if (item?.type === "UserMessage") userAttachments(evidence, item, number);
}

/**
 * §A-DIAGNOSTICS-01 creates the extractor for one Codex rollout.
 *
 * @param {string} session session id used in locators
 * @returns {{evidence: object, feed: (record: object, number: number) => void}}
 *   `feed` takes one parsed JSONL record and its 1-based line number
 */
export function createCodexExtractor(session) {
  const state = { evidence: createEvidence(session, "codex"), calls: new Map() };
  const feed = (record, number) => {
    if (!SHAPES.has(record.type) || record.payload === null || typeof record.payload !== "object") {
      return;
    }
    state.evidence.recognized += 1;
    feedPayload(state, record, number);
  };
  return { evidence: state.evidence, feed };
}
