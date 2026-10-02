/**
 * Extract Meta-O skill evidence from one Claude Code session transcript.
 *
 * The shapes read here were learned from real transcripts: an assistant
 * `tool_use` named `Skill`, the meta user record that follows it with
 * `Base directory for this skill: <dir>` and the loaded body, a typed
 * `/mo-...` slash command, and `Bash` calls of `mo-*.mjs` helpers with their
 * `tool_result`. Anything else is ignored rather than guessed at, because the
 * classifying agent must be able to trust that an event is what it says.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

import {
  SKILL_NAME,
  claudeBodyCandidates,
  createEvidence,
  helperNames,
  installedSkillName,
  owningSkill,
  sourceTreeIn,
  typedLines,
  typedResult,
} from "./mo-debug-text.mjs";

const LOAD_PREFIX = "Base directory for this skill: ";
const COMMAND = /<command-name>\/?(mo-[a-z0-9]+(?:-[a-z0-9]+)*)<\/command-name>/u;
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/u;

function isClaudeRecord(record) {
  return (
    typeof record.type === "string" &&
    (typeof record.sessionId === "string" ||
      (record.message !== null && typeof record.message === "object"))
  );
}

function resultText(item) {
  if (typeof item.content === "string") return item.content;
  if (!Array.isArray(item.content)) return "";
  return item.content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function assistantItem(state, item, number) {
  if (item?.type !== "tool_use" || item.input === null || typeof item.input !== "object") return;
  const { evidence } = state;
  if (item.name === "Skill" && SKILL_NAME.test(item.input.skill ?? "")) {
    const args = typeof item.input.args === "string" ? item.input.args : "";
    evidence.event(
      number,
      "skill_invocation",
      item.input.skill,
      `Skill ${item.input.skill} ${args}`,
    );
    state.skillCalls.set(item.id, { skill: item.input.skill, args });
    return;
  }
  const command = item.input.command;
  if (item.name === "Bash" && typeof command === "string" && helperNames(command).length > 0) {
    const skill = owningSkill(command);
    evidence.event(number, "helper_call", skill, command);
    state.helperCalls.set(item.id, skill);
    return;
  }
  const read = item.name === "Read" ? installedSkillName(String(item.input.file_path ?? "")) : null;
  if (read) state.readCalls.set(item.id, read);
}

/**
 * Claude records the loaded skill as a meta user message. The directory's last
 * segment is the skill name; the text after the blank line is what the model
 * saw, which `claudeBodyCandidates` compares with committed bodies.
 */
function skillLoad(state, record, text, number) {
  const lineEnd = text.indexOf("\n");
  const directory = text.slice(LOAD_PREFIX.length, lineEnd === -1 ? undefined : lineEnd);
  const name = directory.replace(/\/+$/u, "").split("/").at(-1);
  if (!SKILL_NAME.test(name) || lineEnd === -1) return;
  const shown = text.slice(lineEnd + 1).replace(/^\n/u, "");
  // A load answers either its own Skill call or the slash command typed just
  // before it; anything else has no recorded arguments to strip.
  const slash = state.slashCall?.skill === name ? state.slashCall.args : null;
  state.slashCall = null;
  const args = record.sourceToolUseID
    ? (state.skillCalls.get(record.sourceToolUseID)?.args ?? null)
    : slash;
  state.evidence.event(number, "skill_loaded", name, text);
  state.evidence.load(number, {
    name,
    sourceTree: sourceTreeIn(shown, name),
    complete: true,
    comparison: "claude_body",
    candidates: claudeBodyCandidates(shown, args),
  });
}

/**
 * A `Read` result is numbered `cat -n` output and may be a slice, so it can
 * show the frontmatter stamp but never counts as a complete body.
 */
function readResult(state, name, text, number) {
  const plain = text
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\t/u, ""))
    .join("\n");
  state.evidence.event(number, "skill_loaded", name, `Read ${name}/SKILL.md ${plain}`);
  state.evidence.load(number, {
    name,
    sourceTree: sourceTreeIn(plain, name),
    complete: false,
    comparison: "claude_body",
    candidates: [],
  });
}

function toolResult(state, item, number) {
  const text = resultText(item);
  const suffix = item.is_error === true ? " [error]" : "";
  if (state.helperCalls.has(item.tool_use_id)) {
    const skill = state.helperCalls.get(item.tool_use_id);
    state.evidence.event(number, "helper_result", skill, `${typedResult(text)}${suffix}`);
  } else if (state.readCalls.has(item.tool_use_id)) {
    readResult(state, state.readCalls.get(item.tool_use_id), text, number);
  } else if (typedLines(text).length > 0) {
    state.evidence.event(number, "helper_result", "-", `${typedResult(text)}${suffix}`);
  }
}

// A slash command's arguments are what Claude appends to the load that follows
// it, so they are kept until that load; a command without them strips nothing.
function slashCommand(state, text, number, plain) {
  const name = COMMAND.exec(text)[1];
  const args = COMMAND_ARGS.exec(text)?.[1];
  const shown = plain ? `/${name} ${args ?? ""}` : `/${name}`;
  state.evidence.event(number, "skill_invocation", name, shown);
  state.slashCall = args === undefined && !plain ? null : { skill: name, args: args ?? "" };
}

function userRecord(state, record, number) {
  const content = record.message?.content;
  if (typeof content === "string") {
    if (COMMAND.test(content)) slashCommand(state, content, number, true);
    return;
  }
  if (!Array.isArray(content)) return;
  for (const item of content) {
    if (item?.type === "text" && typeof item.text === "string") {
      if (item.text.startsWith(LOAD_PREFIX)) skillLoad(state, record, item.text, number);
      else if (COMMAND.test(item.text)) slashCommand(state, item.text, number, false);
    } else if (item?.type === "tool_result") toolResult(state, item, number);
  }
}

/**
 * §A-DIAGNOSTICS-01 creates the extractor for one Claude Code transcript.
 *
 * @param {string} session session id used in locators
 * @returns {{evidence: object, feed: (record: object, number: number) => void}}
 *   `feed` takes one parsed JSONL record and its 1-based line number
 */
export function createClaudeExtractor(session) {
  const state = {
    evidence: createEvidence(session, "claude"),
    skillCalls: new Map(),
    slashCall: null,
    helperCalls: new Map(),
    readCalls: new Map(),
  };
  const feed = (record, number) => {
    if (!isClaudeRecord(record)) return;
    state.evidence.recognized += 1;
    const content = record.message?.content;
    if (record.type === "assistant") {
      // Claude shows a slash command's skill before the model answers, so an
      // answer ends the command: a later load cannot be its continuation.
      state.slashCall = null;
      if (Array.isArray(content)) for (const item of content) assistantItem(state, item, number);
    } else if (record.type === "user") userRecord(state, record, number);
  };
  return { evidence: state.evidence, feed };
}
