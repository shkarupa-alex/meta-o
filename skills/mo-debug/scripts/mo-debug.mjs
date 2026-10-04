#!/usr/bin/env node

// shared/scripts/mo-debug.mjs
import {
  closeSync as closeSync2,
  constants as constants2,
  fchmodSync,
  fsyncSync,
  ftruncateSync,
  openSync as openSync2,
  realpathSync as realpathSync2,
  writeSync
} from "node:fs";
import { isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

// shared/scripts/mo-debug-redact.mjs
var EXCERPT_LIMIT = 240;
var WINDOW = 4096;
var PATH_ROOTS = "home|Users|mnt|tmp|var|private|root|opt|srv|Volumes|media|run|workspace|workspaces|data";
var TOKEN_SHAPES = [
  [
    /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/gu,
    () => "[REDACTED:private_key]"
  ],
  [
    // The user name may be empty, as in `redis://:<password>@host`.
    /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]*:[^\s@/]+@/giu,
    (_, scheme) => `${scheme}[REDACTED:url_credentials]@`
  ],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/gu, () => "[REDACTED:anthropic_key]"],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}/gu, () => "[REDACTED:api_key]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/gu, () => "[REDACTED:github_token]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/gu, () => "[REDACTED:github_token]"],
  [/\bglpat-[A-Za-z0-9_-]{16,}/gu, () => "[REDACTED:gitlab_token]"],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/gu, () => "[REDACTED:slack_token]"],
  [/\bAKIA[0-9A-Z]{16}\b/gu, () => "[REDACTED:aws_access_key]"],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/giu, (_, prefix) => `${prefix}[REDACTED:bearer_token]`]
];
var CREDENTIAL_KEY = String.raw`(?:[A-Za-z0-9_.-]*(?:password|passwd|passphrase|pwd|token|secret|secret[_-]?key|api[_-]?key|access[_-]?key|private[_-]?key)|(?:[A-Za-z0-9_.-]*[_.-])?pass)`;
var TRIGGERS = [
  ["assignment", String.raw`\b${CREDENTIAL_KEY}(?:\\?["'])?[ \t]*[=:][ \t]*(?=\S)`, "giu"],
  ["flag", String.raw`(?<=^|[\s"'${"`"}(])-{1,2}${CREDENTIAL_KEY}[ \t]+(?=[^\s-])`, "giu"],
  [
    "flag",
    String.raw`\b(?:mysql|mysqldump|mysqladmin|mariadb|mariadb-dump)\b[^\n|;&]{0,512}?[ \t]-p(?=\S)`,
    "gu"
  ],
  [
    "user_credentials",
    String.raw`(?<=^|\s)(?:--?user(?:[ \t]+|=)|-u[ \t]+)(?:\\?["'])?(?:[^\s:"'\\]|\\(?!["']))+:(?=\S)`,
    "gu"
  ],
  [
    "user_credentials",
    String.raw`(?<=^|\s)-u(?:\\?["'])?(?:[^\s:"'\\=/-]|\\(?!["']))(?:[^\s:"'\\=/]|\\(?!["']))*:(?=\S)`,
    "gu"
  ]
].map(([kind, trigger, flags]) => ({
  kind,
  // The trigger, then the rest of its line. A value a token shape already
  // typed keeps that placeholder, which also makes a second pass change nothing.
  pattern: new RegExp(String.raw`(${trigger})(?:\\?["'])?(\[REDACTED:[a-z_]+\])?[^\n]*`, flags)
}));
function redactCredentials(text) {
  let out = text;
  for (const { kind, pattern } of TRIGGERS) {
    out = out.replace(pattern, (_, trigger, typed) => `${trigger}${typed ?? `[REDACTED:${kind}]`}`);
  }
  return out;
}
var SEGMENT = "[^\\s\"'`<>|;\\\\/]";
var ESCAPED = `\\\\{1,2}[^\\n\\\\"']`;
var POSIX_SEGMENT = `(?:${ESCAPED}|${SEGMENT})`;
var UNIX_PATH = new RegExp(
  `(?<!<path>)(?:(?<=^|[^\\w.~/:-]|file:)//${POSIX_SEGMENT}+/|(?<=^|[^\\w.~/-]|file://)/(?:(?:${PATH_ROOTS})(?!${POSIX_SEGMENT})|${POSIX_SEGMENT}+/))(?:${POSIX_SEGMENT}|/)*`,
  "gu"
);
var WINDOWS_PATH = /(?<![\w])[A-Za-z]:\\[^\s"'`<>|;]*/gu;
var WORD = "[^\\s\"'`<>|;&\\\\/]";
var CONTINUATION = {
  "/": new RegExp(`^(?: +${WORD}+){0,2} +(?![.~])[^\\s"'\`<>|;&\\\\/:]+/(?:${SEGMENT}|/)*`, "u"),
  "\\": new RegExp(`^(?: +${WORD}+){0,2} +(?![.~])[^\\s"'\`<>|;&\\\\/:]+\\\\[^\\s"'\`<>|;]*`, "u")
};
var QUOTED = [/\\(["'])([^\n]*?)\\\1/gu, /(?<!\\)(["'])([^\n]*?)(?<!\\)\1/gu];
var ABSOLUTE = new RegExp(`^(file://)?(/(?!/)|//${SEGMENT}|[A-Za-z]:\\\\)`, "u");
var LATER_ABSOLUTE = /\s["'\\]*(?:file:\/\/)?(?:\/|[A-Za-z]:\\)/u;
var PATH_SLUG = new RegExp(`(?<![\\w-])-(?:${PATH_ROOTS})-[^\\s/"'\`<>|;:,()]*`, "gu");
var ACCOUNT_ROOT = /^(?:home|users)$/iu;
function basenameOf(path, separator) {
  const segments = path.split(separator).filter((segment) => segment !== "");
  if (segments.length <= 1) return "";
  if (ACCOUNT_ROOT.test(segments.at(-2))) return "";
  return segments.at(-1);
}
function shorten(path, separator) {
  const base = basenameOf(path, separator);
  return base === "" ? "<path>" : `<path>/${base}`;
}
function redactUnquoted(text, pattern, separator) {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index < last) continue;
    let path = match[0];
    let end = match.index + path.length;
    const tail = path.split(separator).filter(Boolean).at(-1) ?? "";
    if (!tail.includes(".") && !path.endsWith(separator)) {
      const more = CONTINUATION[separator].exec(text.slice(end));
      if (more) {
        path += more[0];
        end += more[0].length;
      }
    }
    out += `${text.slice(last, match.index)}${shorten(path, separator)}`;
    last = end;
  }
  return out + text.slice(last);
}
function redact(text) {
  let out = String(text);
  for (const [pattern, replace] of TOKEN_SHAPES) out = out.replace(pattern, replace);
  out = redactCredentials(out);
  for (const pattern of QUOTED) {
    out = out.replace(pattern, (whole, quote, content) => {
      const absolute = ABSOLUTE.exec(content);
      if (!absolute || LATER_ABSOLUTE.test(content)) return whole;
      const scheme = absolute[1] ?? "";
      const path = content.slice(scheme.length);
      const separator = /^[A-Za-z]:\\/u.test(path) ? "\\" : "/";
      return whole.replace(content, () => `${scheme}${shorten(path, separator)}`);
    });
  }
  out = redactUnquoted(out, UNIX_PATH, "/");
  out = redactUnquoted(out, WINDOWS_PATH, "\\");
  return out.replace(PATH_SLUG, "<path>");
}
function excerpt(text) {
  const source = String(text ?? "");
  const cut = source.length > WINDOW;
  let line = redact(source.slice(0, WINDOW)).replace(/\s+/gu, " ").trim();
  if (cut) line = line.replace(/\s*\S*$/u, "");
  if (line.length <= EXCERPT_LIMIT) return line;
  return `${line.slice(0, EXCERPT_LIMIT - 1)}\u2026`;
}
var MESSAGE = 65536;
function mentionExcerpt(text, mention) {
  const source = String(text ?? "");
  let clean = redact(source.slice(0, MESSAGE));
  if (source.length > MESSAGE) clean = clean.replace(/\s*\S*$/u, "");
  const at = Math.max(0, clean.indexOf(mention));
  const from = Math.max(0, at - 80);
  const to = at + 160;
  let window = clean.slice(from, to);
  if (from > 0) window = window.replace(/^\S*\s*/u, "");
  if (to < clean.length) window = window.replace(/\s*\S*$/u, "");
  return window;
}
function token(value) {
  const cleaned = redact(String(value ?? "")).replace(/[^A-Za-z0-9._:<>/@+-]/gu, "_").slice(0, 120);
  return cleaned === "" ? "-" : cleaned;
}

// shared/scripts/mo-debug-text.mjs
var SOURCE_TREE = /^source_tree:\s*(["']?)([0-9a-f]{40})\1\s*$/u;
var FRONTMATTER_BLOCK = /(?:^|\n)---\n([\s\S]*?)\n---(?:\n|$)/gu;
var RESERVED = String.raw`(?:(?:[!{]|if|then|else|elif|do|while|until)[ \t]+)*`;
var WRAPPER = String.raw`(?:[A-Za-z_]\w*=\S*[ \t]+)*(?:(?:env|timeout|time|nice|exec|command)(?:[ \t]+(?:-[-\w]*(?:=\S*)?|[A-Za-z_]\w*=\S*|[A-Z_][A-Z0-9_]*|\d+(?:\.\d+)?[smhd]?))*[ \t]+)*`;
var HELPER = new RegExp(
  String.raw`(?:^|[;&|(\n])[ \t]*${RESERVED}${WRAPPER}(?:node[ \t]+(?:-[-\w=]*[ \t]+)*)?["']?(?:[^\s"';&|=]*\/)?(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\.mjs\b`,
  "gu"
);
var SKILL_DIR = /(?:^|[\s/'"=])(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\/(?:scripts|SKILL\.md)\b/u;
var TYPED_LINE = /^MO-[A-Z0-9-]+(?:\/\d+)?\b.*$/gmu;
var SKILL_NAME = /^mo-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
function splitFrontmatter(text) {
  if (!text.startsWith("---\n")) return null;
  const close = text.indexOf("\n---\n", 3);
  if (close === -1) return null;
  return { frontmatter: text.slice(4, close), body: text.slice(close + 5) };
}
function metadataSourceTree(frontmatter) {
  const lines = frontmatter.split("\n");
  const start = lines.findIndex((line) => /^metadata:\s*$/u.test(line));
  if (start === -1) return null;
  let indent = null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    const width = line.length - line.trimStart().length;
    if (width === 0) break;
    indent ??= width;
    if (width !== indent) continue;
    const match = SOURCE_TREE.exec(line.trim());
    if (match) return match[2];
  }
  return null;
}
function sourceTreeIn(text, name) {
  for (const match of text.matchAll(FRONTMATTER_BLOCK)) {
    const block = match[1];
    const declared = block.split("\n").some((line) => {
      const value = /^name:\s*(["']?)([^"'\s]+)\1\s*$/u.exec(line);
      return value?.[2] === name;
    });
    if (declared) return metadataSourceTree(block);
  }
  return null;
}
function claudeBody(file) {
  const split = splitFrontmatter(file);
  return split === null ? null : split.body.replace(/^\n+/u, "");
}
function claudeBodyCandidates(shown, args) {
  const candidates = [shown];
  const suffix = typeof args === "string" && args !== "" ? `

ARGUMENTS: ${args}` : null;
  if (suffix && shown.endsWith(suffix)) candidates.push(shown.slice(0, -suffix.length));
  return candidates;
}
function installedSkillName(path) {
  const match = /(?:^|\/)skills\/(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md$/u.exec(path);
  return match && !/(?:^|\/)src\/skills\//u.test(path) ? match[1] : null;
}
function helperNames(command) {
  const text = substitutionsOpened(String(command));
  return [...new Set([...text.matchAll(HELPER)].map((match) => match[1]))];
}
var HEREDOC = /^<<-?[ \t]*(['"]?)([A-Za-z0-9_.-]+)\1/u;
var DATA = "";
function heredocBody(command, start, pending) {
  let index = start;
  let out = "";
  for (const { delimiter, quoted, strip } of pending) {
    while (index < command.length) {
      let end = command.indexOf("\n", index);
      if (end === -1) end = command.length;
      const line = command.slice(index, end);
      const body = quoted ? line.replace(/[\x60;&|(]/gu, " ") : line.replace(/[;&|]|(?<!\$)\(/gu, " ").replace(/\x60/gu, "\n");
      out += `${body} `;
      index = end + 1;
      if ((strip ? line.replace(/^\t+/u, "") : line) === delimiter) break;
    }
  }
  return { out, index };
}
function opensComment(command, index) {
  return index === 0 || /[\s;&|(]/u.test(command[index - 1]);
}
function unquotedSpan(command, index, state) {
  const char = command[index];
  if (char === "\\" && !state.single) {
    if (command[index + 1] === "\n") return { text: " ", next: index + 2 };
    const pair = command.slice(index, index + 2);
    return { text: pair.replace(/[\s\x60;&|()]/u, DATA), next: index + 2 };
  }
  if (state.single || state.double) return null;
  if (char === "#" && opensComment(command, index)) {
    let end = command.indexOf("\n", index);
    if (end === -1) end = command.length;
    return { text: " ".repeat(end - index), next: end };
  }
  const heredoc = char === "<" ? HEREDOC.exec(command.slice(index, index + 256)) : null;
  if (heredoc) {
    const [operator, quote, delimiter] = heredoc;
    state.pending.push({ delimiter, quoted: quote !== "", strip: operator[2] === "-" });
    return { text: operator, next: index + operator.length };
  }
  if (char === "\n" && state.pending.length > 0) {
    const body = heredocBody(command, index + 1, state.pending);
    state.pending = [];
    return { text: ` ${body.out}
`, next: body.index };
  }
  return null;
}
function backtick(state) {
  if (state.frames.at(-1)?.close === "`") state.double = state.frames.pop().double;
  else {
    state.frames.push({ close: "`", double: state.double });
    state.double = false;
  }
  return "\n";
}
function parenthesis(command, index, state) {
  const char = command[index];
  if (char === "(" && (!state.double || command[index - 1] === "$")) {
    state.frames.push({ close: ")", double: state.double });
    state.double = false;
    return true;
  }
  if (char === ")" && !state.double && state.frames.at(-1)?.close === ")") {
    state.double = state.frames.pop().double;
    return true;
  }
  return false;
}
function plainChar(command, index, state) {
  const char = command[index];
  if (char === "'" && !state.double) state.single = !state.single;
  else if (char === '"' && !state.single) state.double = !state.double;
  else if (state.single) return /[\s\x60;&|()]/u.test(char) ? DATA : char;
  else if (char === "`") return backtick(state);
  else if (parenthesis(command, index, state)) return char;
  else if (state.double) return /[\s;&|()]/u.test(char) ? DATA : char;
  return char;
}
function substitutionsOpened(command) {
  const state = { single: false, double: false, pending: [], frames: [] };
  let out = "";
  let index = 0;
  while (index < command.length) {
    const span = unquotedSpan(command, index, state);
    if (span) {
      out += span.text;
      index = span.next;
      continue;
    }
    out += plainChar(command, index, state);
    index += 1;
  }
  return out;
}
function owningSkill(command) {
  return SKILL_DIR.exec(String(command))?.[1] ?? "-";
}
function typedLines(output) {
  const text = String(output ?? "").slice(0, 65536);
  return [...text.matchAll(TYPED_LINE)].map((match) => match[0].trim()).slice(0, 4);
}
function typedResult(output) {
  const typed = typedLines(output);
  if (typed.length > 0) return typed.join(" ; ");
  return String(output ?? "").slice(0, 65536).split("\n").find((line) => line.trim() !== "") ?? "";
}
function createEvidence(session, harness) {
  const evidence = { session, harness, recognized: 0, events: [], loads: [] };
  evidence.event = (number, kind, skill, text) => {
    evidence.events.push({
      session,
      harness,
      locator: `${session}:${number}`,
      kind,
      skill: SKILL_NAME.test(skill ?? "") ? skill : "-",
      excerpt: excerpt(text)
    });
  };
  evidence.load = (number, load) => {
    evidence.loads.push({ session, harness, locator: `${session}:${number}`, ...load });
  };
  return evidence;
}

// shared/scripts/mo-debug-claude.mjs
var LOAD_PREFIX = "Base directory for this skill: ";
var COMMAND = /<command-name>\/?(mo-[a-z0-9]+(?:-[a-z0-9]+)*)<\/command-name>/u;
var COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/u;
function isClaudeRecord(record) {
  return typeof record.type === "string" && (typeof record.sessionId === "string" || record.message !== null && typeof record.message === "object");
}
function resultText(item) {
  if (typeof item.content === "string") return item.content;
  if (!Array.isArray(item.content)) return "";
  return item.content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
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
      `Skill ${item.input.skill} ${args}`
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
function skillLoad(state, record, text, number) {
  const lineEnd = text.indexOf("\n");
  const directory = text.slice(LOAD_PREFIX.length, lineEnd === -1 ? void 0 : lineEnd);
  const name = directory.replace(/\/+$/u, "").split("/").at(-1);
  if (!SKILL_NAME.test(name) || lineEnd === -1) return;
  const shown = text.slice(lineEnd + 1).replace(/^\n/u, "");
  const slash = state.slashCall?.skill === name ? state.slashCall.args : null;
  state.slashCall = null;
  const args = record.sourceToolUseID ? state.skillCalls.get(record.sourceToolUseID)?.args ?? null : slash;
  state.evidence.event(number, "skill_loaded", name, text);
  state.evidence.load(number, {
    name,
    sourceTree: sourceTreeIn(shown, name),
    complete: true,
    comparison: "claude_body",
    candidates: claudeBodyCandidates(shown, args)
  });
}
function readResult(state, name, text, number) {
  const plain = text.split("\n").map((line) => line.replace(/^\s*\d+\t/u, "")).join("\n");
  state.evidence.event(number, "skill_loaded", name, `Read ${name}/SKILL.md ${plain}`);
  state.evidence.load(number, {
    name,
    sourceTree: sourceTreeIn(plain, name),
    complete: false,
    comparison: "claude_body",
    candidates: []
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
function slashCommand(state, text, number, plain) {
  const name = COMMAND.exec(text)[1];
  const args = COMMAND_ARGS.exec(text)?.[1];
  const shown = plain ? `/${name} ${args ?? ""}` : `/${name}`;
  state.evidence.event(number, "skill_invocation", name, shown);
  state.slashCall = args === void 0 && !plain ? null : { skill: name, args: args ?? "" };
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
function createClaudeExtractor(session) {
  const state = {
    evidence: createEvidence(session, "claude"),
    skillCalls: /* @__PURE__ */ new Map(),
    slashCall: null,
    helperCalls: /* @__PURE__ */ new Map(),
    readCalls: /* @__PURE__ */ new Map()
  };
  const feed = (record, number) => {
    if (!isClaudeRecord(record)) return;
    state.evidence.recognized += 1;
    const content = record.message?.content;
    if (record.type === "assistant") {
      state.slashCall = null;
      if (Array.isArray(content)) for (const item of content) assistantItem(state, item, number);
    } else if (record.type === "user") userRecord(state, record, number);
  };
  const skip = (record) => {
    if (isClaudeRecord(record)) state.evidence.recognized += 1;
  };
  return { evidence: state.evidence, feed, skip };
}

// shared/scripts/mo-debug-codex.mjs
var SHAPES = /* @__PURE__ */ new Set(["session_meta", "response_item", "event_msg", "turn_context"]);
var SKILL_WRAPPER = /^<skill>\n<name>([^<\n]*)<\/name>\n<path>[^<\n]*<\/path>\n/u;
var MENTION = /(?<![\w./-])\$?(mo-[a-z0-9]+(?:-[a-z0-9]+)*)(?![\w./-])/gu;
var INSTALLED_READ = /(?:^|[\s'"=/])((?:[^\s'"]*\/)?skills\/(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md)/gu;
var READ_VERB = /(?:^|[\s;&|(])(?:cat|sed|head|nl|awk|less|bat)\s/u;
var SINGLE_READ = /^\s*(?:cat|sed -n (['"]?)1,(\d+)p\1)\s+(['"]?)[^\s'"]*skills\/mo-[a-z0-9-]+\/SKILL\.md\3\s*$/u;
var TRUNCATED = /tokens truncated|Warning: truncated output|Total output lines:/u;
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
    candidates: complete ? [file] : []
  });
}
function userMessage(evidence, payload, number) {
  for (const text of textsOf(payload.content)) {
    if (text.startsWith("<skill>")) {
      wrappedSkill(evidence, text, number);
      continue;
    }
    if (text.startsWith("<") || text.startsWith("# AGENTS.md instructions")) continue;
    const seen = /* @__PURE__ */ new Set();
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
  const paths = Array.isArray(parsed) ? parsed.filter((entry) => entry?.type === "read").map((entry) => String(entry.path ?? "")) : READ_VERB.test(command) ? [...command.matchAll(INSTALLED_READ)].map((match) => match[1]) : [];
  const names = [];
  for (const path of paths) {
    const name = installedSkillName(path);
    if (name) names.push(name);
  }
  return [...new Set(names)];
}
function readIsComplete(command, reads, output, exitCode) {
  if (reads.length !== 1 || exitCode !== 0 || TRUNCATED.test(output)) return false;
  const single = SINGLE_READ.exec(command);
  if (!single) return false;
  if (single[2] === void 0) return true;
  return output.split("\n").length - 1 < Number(single[2]);
}
function commandEvidence(evidence, command, parsed, result, numbers) {
  const reads = skillReads(command, parsed);
  const complete = readIsComplete(command, reads, result.output, result.exitCode);
  for (const name of reads) {
    evidence.event(numbers.result, "skill_loaded", name, `${command}
${result.output}`);
    evidence.load(numbers.result, {
      name,
      sourceTree: sourceTreeIn(result.output, name),
      complete,
      comparison: "file",
      candidates: complete ? [result.output] : []
    });
  }
}
function helperResult(evidence, command, result, number) {
  const suffix = Number.isInteger(result.exitCode) ? ` exit=${result.exitCode}` : "";
  evidence.event(
    number,
    "helper_result",
    owningSkill(command),
    `${typedResult(result.output)}${suffix}`
  );
}
function commandExecution(evidence, item, number) {
  const command = commandText(item.command);
  const result = {
    output: typeof item.stdout === "string" ? item.stdout : String(item.aggregated_output ?? ""),
    exitCode: item.exit_code
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
function createCodexExtractor(session) {
  const state = { evidence: createEvidence(session, "codex"), calls: /* @__PURE__ */ new Map() };
  const recognizes = (record) => SHAPES.has(record.type) && record.payload !== null && typeof record.payload === "object";
  const feed = (record, number) => {
    if (!recognizes(record)) return;
    state.evidence.recognized += 1;
    feedPayload(state, record, number);
  };
  const skip = (record) => {
    if (recognizes(record)) state.evidence.recognized += 1;
  };
  return { evidence: state.evidence, feed, skip };
}

// shared/scripts/mo-debug-history.mjs
import { spawnSync } from "node:child_process";
var SHA = /^[0-9a-f]{40}$/u;
var SHORT = 12;
function git(repo, args, input) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    input,
    maxBuffer: 256 * 1024 * 1024
  });
  return { ...result, stdout: result.stdout ?? Buffer.alloc(0) };
}
function succeeded(result) {
  return result.status === 0 && result.error === void 0;
}
function openHistory(repo, maxHistory) {
  const head = git(repo, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  const sha = succeeded(head) ? head.stdout.toString("utf8").trim() : "";
  if (!SHA.test(sha)) return null;
  const probe = git(repo, ["rev-parse", "--is-shallow-repository"]);
  const shallow = !succeeded(probe) || probe.stdout.toString("utf8").trim() !== "false";
  return { repo, head: sha, maxHistory, shallow, cache: /* @__PURE__ */ new Map() };
}
function parseBatch(buffer) {
  const objects = /* @__PURE__ */ new Map();
  let at = 0;
  while (at < buffer.length) {
    const end = buffer.indexOf(10, at);
    if (end === -1) break;
    const [oid, type, size] = buffer.subarray(at, end).toString("utf8").split(" ");
    if (type === void 0 || size === void 0) {
      at = end + 1;
      continue;
    }
    const length = Number(size);
    if (end + 1 + length > buffer.length) break;
    objects.set(oid, buffer.subarray(end + 1, end + 1 + length).toString("utf8"));
    at = end + 1 + length + 1;
  }
  return objects;
}
function skillHistory(history, name) {
  if (history.cache.has(name)) return history.cache.get(name);
  const path = `skills/${name}/SKILL.md`;
  const listed2 = git(history.repo, [
    "rev-list",
    `--max-count=${history.maxHistory + 1}`,
    history.head,
    "--",
    path
  ]);
  const shas = succeeded(listed2) ? listed2.stdout.toString("utf8").split("\n").filter(Boolean) : [];
  const partial = shas.length > history.maxHistory || history.shallow;
  const walked = shas.slice(0, history.maxHistory);
  const checked = git(
    history.repo,
    ["cat-file", "--batch-check"],
    walked.map((sha) => `${sha}:${path}
`).join("")
  );
  const answers = checked.stdout.toString("utf8").split("\n").slice(0, walked.length);
  const oids = answers.map((line) => (/^([0-9a-f]{40}) blob \d+$/u.exec(line) ?? [])[1] ?? null);
  const answered = succeeded(checked) && answers.length === walked.length && answers.every((line, index) => oids[index] !== null || /^\S+ missing$/u.test(line));
  const unique = [...new Set(oids.filter(Boolean))];
  const batch = unique.length === 0 ? null : git(history.repo, ["cat-file", "--batch"], `${unique.join("\n")}
`);
  const blobs = batch === null ? /* @__PURE__ */ new Map() : parseBatch(batch.stdout);
  const read = batch === null || succeeded(batch) && unique.every((oid) => blobs.has(oid));
  const entries = walked.map((sha, index) => ({ sha, text: blobs.get(oids[index]) ?? null })).filter((entry) => entry.text !== null);
  const failed = !succeeded(listed2) || !answered || !read;
  const result = { entries, partial, failed };
  history.cache.set(name, result);
  return result;
}
function range(matches) {
  if (matches.length === 0) return "none";
  return `${matches.at(-1).sha.slice(0, SHORT)}..${matches[0].sha.slice(0, SHORT)}`;
}
function stampOf(text) {
  const split = splitFrontmatter(text);
  return split === null ? null : metadataSourceTree(split.frontmatter);
}
function bodyMatches(load, entry) {
  const committed = load.comparison === "file" ? entry.text : claudeBody(entry.text);
  return committed !== null && load.candidates.includes(committed);
}
function walkState(walked) {
  if (walked.failed) return "unreadable";
  return walked.partial ? "partial" : "complete";
}
function attribute(load, history) {
  const stamped = typeof load.sourceTree === "string" && SHA.test(load.sourceTree);
  const stamp = stamped ? load.sourceTree : "none";
  const comparable = load.complete && load.candidates.length > 0;
  if (!SKILL_NAME.test(load.name) || !comparable) {
    return { version: "unknown", commits: "unknown", history: history ? "unused" : "none", stamp };
  }
  if (history === null) return { version: "unknown", commits: "unknown", history: "none", stamp };
  const walked = skillHistory(history, load.name);
  const state = walkState(walked);
  const matches = walked.entries.filter(
    (entry) => bodyMatches(load, entry) && (!stamped || stampOf(entry.text) === load.sourceTree)
  );
  if (matches.length === 0) return { version: "unknown", commits: "none", history: state, stamp };
  const version = stamped ? `source_tree:${load.sourceTree}` : "body_match";
  return { version, commits: range(matches), history: state, stamp };
}

// shared/scripts/mo-debug-report.mjs
var CATEGORIES = [
  "skill_text_defect",
  "agent_deviation",
  "backend_defect",
  "harness_defect",
  "unknown"
];
function cell(value) {
  return String(value ?? "").replace(/[\r\n]+/gu, " ").replace(/[\\`*_{}[\]()#+!|<>~]/gu, (character) => `\\${character}`);
}
function table(header, rows) {
  if (rows.length === 0) return ["_None._"];
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)
  ];
}
function renderReport(result) {
  const lines = [
    "# mo-debug report",
    "",
    "Evidence extracted from local session logs. Every excerpt is redacted and",
    "bounded; absolute paths are reduced to `<path>/<basename>`.",
    "",
    "```text",
    ...result.lines.filter((line) => !line.startsWith("skill ")),
    "```",
    "",
    "## Classification",
    ""
  ];
  for (const category of CATEGORIES) {
    lines.push(`### ${category}`, "", "_To classify._", "");
  }
  lines.push("## Events", "");
  lines.push(
    ...table(
      ["Locator", "Kind", "Skill", "Excerpt"],
      result.events.map((event) => [token(event.locator), event.kind, event.skill, event.excerpt])
    )
  );
  lines.push("", "## Version attributions", "");
  lines.push(
    ...table(
      // The same fields as the stdout `skill` line: a stamp that stays unproven
      // is the only evidence of what was loaded, and two different stamps must
      // not collapse into identical rows.
      ["Session", "Skill", "Version", "Commits", "History", "Stamp"],
      result.attributions.map((item) => [
        token(item.session),
        item.name,
        item.version,
        item.commits,
        item.history,
        item.stamp
      ])
    )
  );
  return `${lines.join("\n")}
`;
}

// shared/scripts/mo-debug-sessions.mjs
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync
} from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
var SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{3,79}$/u;
var CODEX_ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/iu;
var WALK_DEPTH = 6;
var WALK_ENTRIES = 2e5;
var LINE_LIMIT = 64 * 1024 * 1024;
function sessionRoots(home, places = null) {
  const { codexHome = null, claudeConfigDir = null } = places ?? {};
  return {
    claude: join(claudeConfigDir ?? join(home, ".claude"), "projects"),
    codex: join(codexHome ?? join(home, ".codex"), "sessions")
  };
}
var FILESYSTEM = { readdir: readdirSync, lstat: lstatSync };
function descriptorPath(fd) {
  try {
    return readlinkSync(`/proc/self/fd/${fd}`);
  } catch {
    return null;
  }
}
var OPENING = {
  open: openSync,
  fstat: fstatSync,
  stat: statSync,
  close: closeSync,
  locate: descriptorPath,
  resolve: realpathSync
};
function rootProbe(io, root) {
  try {
    const stat = io.lstat(root);
    if (stat.isDirectory()) return { state: "directory", dir: root };
    if (!stat.isSymbolicLink()) return { state: "absent" };
    const real = realpathSync(root);
    return statSync(real).isDirectory() ? { state: "directory", dir: real } : { state: "absent" };
  } catch (error) {
    const absent = error.code === "ENOENT" || error.code === "ENOTDIR";
    return { state: absent ? "absent" : "unknown" };
  }
}
function listed(readdir, dir) {
  try {
    return readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
}
function claudeMatches(root, id, io) {
  if (!UUID.test(id)) return { matches: [], complete: true };
  const probe = rootProbe(io, root);
  if (probe.state !== "directory") return { matches: [], complete: probe.state === "absent" };
  const entries = listed(io.readdir, probe.dir);
  if (entries === null) return { matches: [], complete: false };
  const matches = [];
  let complete = true;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(probe.dir, entry.name, `${id}.jsonl`);
    try {
      io.lstat(candidate);
      matches.push(candidate);
    } catch (error) {
      if (error.code !== "ENOENT") complete = false;
    }
  }
  return { matches, complete };
}
function codexMatches(root, id, io) {
  if (!UUID.test(id)) return { matches: [], complete: true };
  const probe = rootProbe(io, root);
  if (probe.state !== "directory") return { matches: [], complete: probe.state === "absent" };
  const wanted = id.toLowerCase();
  const matches = [];
  const pending = [{ dir: probe.dir, depth: 0 }];
  let seen = 0;
  let complete = true;
  while (pending.length > 0 && seen < WALK_ENTRIES) {
    const { dir, depth } = pending.pop();
    const entries = listed(io.readdir, dir);
    if (entries === null) {
      complete = false;
      continue;
    }
    for (const entry of entries) {
      if (seen === WALK_ENTRIES) {
        complete = false;
        break;
      }
      seen += 1;
      const name = entry.name;
      if (entry.isDirectory()) {
        if (depth < WALK_DEPTH) pending.push({ dir: join(dir, name), depth: depth + 1 });
        else complete = false;
      } else if (name.startsWith("rollout-") && CODEX_ID.exec(name)?.[1].toLowerCase() === wanted) {
        matches.push(join(dir, name));
      }
    }
  }
  return { matches, complete: complete && pending.length === 0 };
}
function resolveSession(spec, home, places = null, io = FILESYSTEM) {
  if (spec.includes("/") || spec.includes(sep) || spec.endsWith(".jsonl") || isAbsolute(spec)) {
    return { path: resolve(spec) };
  }
  if (!SESSION_ID.test(spec)) return { outcome: "session_not_found" };
  const roots = sessionRoots(home, places);
  const claude = claudeMatches(roots.claude, spec, io);
  const codex = codexMatches(roots.codex, spec, io);
  if (!claude.complete || !codex.complete) return { outcome: "search_incomplete" };
  const matches = [...claude.matches, ...codex.matches];
  if (matches.length === 0) return { outcome: "session_not_found" };
  if (matches.length > 1) return { outcome: "session_ambiguous" };
  return { path: matches[0] };
}
function realRoot(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}
function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return true;
  }
}
function containingHarness(real, roots) {
  for (const harness of ["claude", "codex"]) {
    const root = realRoot(roots[harness]);
    if (root !== null && real.startsWith(`${root}${sep}`)) return harness;
  }
  return null;
}
function stillAt(fd, path, real, io) {
  const located = io.locate(fd);
  return located === null ? io.resolve(path) === real : located === real;
}
function verifiedDescriptor(path, roots, opening) {
  const io = { ...OPENING, ...opening };
  let real;
  try {
    real = realpathSync(path);
  } catch {
    return { outcome: "session_not_found" };
  }
  const harness = containingHarness(real, roots);
  if (harness === null || isSymlink(path)) return { outcome: "foreign_path" };
  let fd;
  try {
    fd = io.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    return { outcome: "foreign_path" };
  }
  let owned;
  try {
    const opened = io.fstat(fd);
    const checked = io.stat(real);
    const ownUid = typeof process.getuid === "function" ? process.getuid() : opened.uid;
    owned = opened.isFile() && opened.dev === checked.dev && opened.ino === checked.ino && opened.uid === ownUid && stillAt(fd, path, real, io);
  } catch {
    owned = false;
  }
  if (!owned) {
    io.close(fd);
    return { outcome: "foreign_path" };
  }
  return { fd, harness, real };
}
function openOwnedSession(path, home, places = null, io = OPENING) {
  const verified = verifiedDescriptor(path, sessionRoots(home, places), io);
  if (verified.outcome) return verified;
  return { fd: verified.fd, harness: verified.harness, id: sessionIdOf(verified.real) };
}
function sessionIdOf(path) {
  const name = basename(path);
  const codex = CODEX_ID.exec(name);
  if (name.startsWith("rollout-") && codex) return codex[1];
  return name.replace(/\.jsonl$/u, "");
}
function* sessionLines(fd, read = readSync) {
  const chunk = Buffer.alloc(1 << 16);
  const decoder = new TextDecoder("utf-8");
  let pending = [];
  let pendingBytes = 0;
  let number = 0;
  const flush = () => {
    number += 1;
    const text = pendingBytes > LINE_LIMIT ? null : decoder.decode(Buffer.concat(pending));
    pending = [];
    pendingBytes = 0;
    return { number, text };
  };
  for (let got = read(fd, chunk); got > 0; got = read(fd, chunk)) {
    const view = chunk.subarray(0, got);
    let start = 0;
    for (let at = view.indexOf(10); at !== -1; at = view.indexOf(10, start)) {
      if (pendingBytes <= LINE_LIMIT) pending.push(Buffer.from(view.subarray(start, at)));
      pendingBytes += at - start;
      yield flush();
      start = at + 1;
    }
    if (pendingBytes <= LINE_LIMIT) pending.push(Buffer.from(view.subarray(start)));
    pendingBytes += got - start;
  }
  if (pendingBytes > 0) yield flush();
}

// shared/scripts/mo-debug.mjs
var USAGE = `usage: mo-debug.mjs scan --session <path-or-id> [--session ...] [options]
       mo-debug.mjs --help

  --session <path-or-id>  a session JSONL path, a Claude session UUID or a
                          Codex thread id; repeatable, at least one
  --since <ISO-8601>      skip records with an earlier timestamp
  --max-records <n>       parsed records per session (default 5000)
  --history <checkout>    Meta-O Git checkout for version attribution
  --max-history <n>       commits inspected per skill (default 2000)
  --out <new-file>        also write a Markdown report; the file must not exist.
                          A report that cannot be written whole is emptied and
                          answers out_write_failed after the scan lines

Only files under ~/.claude/projects/ or ~/.codex/sessions/ that the invoking
user owns are read; anything else is refused as foreign_path, unread. A set
CLAUDE_CONFIG_DIR replaces ~/.claude and a set CODEX_HOME replaces ~/.codex;
each must be an absolute path.

exit: 0 ok or partial | 1 unknown or every session refused | 2 call error or
      out_write_failed
`;
var REFUSALS = /* @__PURE__ */ new Set(["foreign_path", "session_not_found", "session_ambiguous"]);
var SINCE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u;
var MAX_SESSIONS = 100;
function callError(reason) {
  return { error: reason };
}
function positive(value, fallback) {
  if (value === void 0) return fallback;
  return /^[1-9]\d{0,7}$/u.test(value) ? Number(value) : null;
}
function collectFlags(args) {
  const flags = /* @__PURE__ */ new Map([["--session", []]]);
  const valued = /* @__PURE__ */ new Set([
    "--session",
    "--since",
    "--max-records",
    "--history",
    "--max-history",
    "--out"
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!valued.has(flag) || index + 1 >= args.length) return null;
    const value = args[index += 1];
    if (flag === "--session") flags.get(flag).push(value);
    else if (flags.has(flag)) return null;
    else flags.set(flag, value);
  }
  return flags;
}
function parseArguments(argv) {
  if (argv.includes("--help")) return { help: true };
  if (argv[0] !== "scan") return callError("usage");
  const flags = collectFlags(argv.slice(1));
  if (flags === null) return callError("usage");
  const sessions = flags.get("--session");
  if (sessions.length === 0 || sessions.length > MAX_SESSIONS) return callError("usage");
  const since = flags.get("--since");
  const sinceMs = since === void 0 ? null : Date.parse(since);
  if (since !== void 0 && (!SINCE.test(since) || Number.isNaN(sinceMs))) {
    return callError("since_invalid");
  }
  const maxRecords = positive(flags.get("--max-records"), 5e3);
  const maxHistory = positive(flags.get("--max-history"), 2e3);
  if (maxRecords === null || maxHistory === null) return callError("usage");
  return {
    sessions,
    since: sinceMs,
    maxRecords,
    maxHistory,
    history: flags.get("--history") ?? null,
    out: flags.get("--out") ?? null
  };
}
function refusedSession(spec, outcome) {
  const id = spec.includes("/") || spec.endsWith(".jsonl") ? sessionIdOf(spec) : spec;
  return {
    id,
    harness: "-",
    outcome,
    records: 0,
    unparsed: 0,
    untimed: 0,
    skipped: 0,
    events: [],
    loads: []
  };
}
function parsedRecord(text) {
  try {
    const record = JSON.parse(text);
    return record !== null && typeof record === "object" && !Array.isArray(record) ? record : null;
  } catch {
    return null;
  }
}
function consume(extractor, text, number, counts, since) {
  const record = text === null ? null : parsedRecord(text);
  if (record === null) {
    counts.unparsed += 1;
    return;
  }
  const time = Date.parse(record.timestamp);
  if (Number.isNaN(time)) counts.untimed += 1;
  else if (since !== null && time < since) {
    counts.skipped += 1;
    extractor.skip(record);
    return;
  }
  try {
    extractor.feed(record, number);
  } catch {
    counts.unparsed += 1;
  }
}
function readSession(opened, options) {
  const extractor = opened.harness === "claude" ? createClaudeExtractor(opened.id) : createCodexExtractor(opened.id);
  const counts = { records: 0, unparsed: 0, untimed: 0, skipped: 0 };
  let partial = false;
  for (const { number, text } of sessionLines(opened.fd, options.read)) {
    if (text !== null && text.trim() === "") continue;
    if (counts.records >= options.maxRecords) {
      partial = true;
      break;
    }
    counts.records += 1;
    consume(extractor, text, number, counts, options.since);
  }
  const { evidence } = extractor;
  const outcome = evidence.recognized === 0 ? "unknown" : partial ? "partial" : "ok";
  const recognized = outcome !== "unknown";
  return {
    id: opened.id,
    harness: opened.harness,
    outcome,
    ...counts,
    events: recognized ? evidence.events : [],
    loads: recognized ? evidence.loads : []
  };
}
function scanSession(spec, options) {
  const resolved = resolveSession(spec, options.home, options.places);
  if (resolved.outcome) return refusedSession(spec, resolved.outcome);
  const opened = openOwnedSession(resolved.path, options.home, options.places);
  if (opened.outcome) return refusedSession(spec, opened.outcome);
  try {
    return readSession(opened, options);
  } catch {
    return { ...refusedSession(spec, "read_failed"), id: opened.id, harness: opened.harness };
  } finally {
    closeSync2(opened.fd);
  }
}
function attributions(sessions, history) {
  const seen = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    for (const load of session.loads) {
      const result = attribute(load, history);
      const key = [session.id, load.name, result.version, result.commits, result.stamp].join("\0");
      if (!seen.has(key)) seen.set(key, { session: session.id, name: load.name, ...result });
    }
  }
  return [...seen.values()];
}
function overallStatus(sessions, attributed) {
  const readable = sessions.filter(
    (session) => session.outcome === "ok" || session.outcome === "partial"
  );
  if (readable.length === 0) {
    return sessions.every((session) => REFUSALS.has(session.outcome)) ? "refused" : "unknown";
  }
  const degraded = readable.length !== sessions.length || readable.some((session) => session.outcome === "partial") || attributed.some((item) => item.history === "partial" || item.history === "unreadable");
  return degraded ? "partial" : "ok";
}
function scan(options, history = null) {
  const sessions = options.sessions.map((spec) => scanSession(spec, options));
  const events = sessions.flatMap((session) => session.events);
  const attributed = attributions(sessions, history);
  const status = overallStatus(sessions, attributed);
  const refused = sessions.filter((session) => REFUSALS.has(session.outcome)).length;
  const lines = [
    `MO-DEBUG/1 status=${status} sessions=${sessions.length} events=${events.length} refused=${refused}`,
    ...sessions.map(
      (session) => `session id=${token(session.id)} harness=${session.harness} outcome=${session.outcome} records=${session.records} unparsed=${session.unparsed} untimed=${session.untimed} skipped_since=${session.skipped}`
    ),
    ...attributed.map(
      (item) => `skill name=${item.name} session=${token(item.session)} version=${item.version} commits=${item.commits} history=${item.history} stamp=${item.stamp}`
    )
  ];
  return { status, sessions, events, attributions: attributed, lines };
}
function createReport(path) {
  try {
    const flags = constants2.O_WRONLY | constants2.O_CREAT | constants2.O_EXCL | constants2.O_NOFOLLOW;
    const fd = openSync2(path, flags, 384);
    fchmodSync(fd, 384);
    return { fd };
  } catch (error) {
    return callError(error.code === "EEXIST" ? "out_exists" : "out_unwritable");
  }
}
function writeReport(fd, text, io) {
  const bytes = Buffer.from(text, "utf8");
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = io.write(fd, bytes, offset, bytes.length - offset);
      if (!(written > 0)) throw new Error("no progress");
      offset += written;
    }
    io.fsync(fd);
    return true;
  } catch {
    try {
      ftruncateSync(fd, 0);
    } catch {
    }
    return false;
  }
}
function scanInto(report, options, history, io) {
  let result;
  let written = true;
  try {
    result = scan(options, history);
    if (report) written = writeReport(report.fd, renderReport(result), io);
  } finally {
    if (report) closeSync2(report.fd);
  }
  return { result, written };
}
function fail(reason) {
  process.stderr.write(`MO-DEBUG/1 status=error reason=${reason}
`);
  if (reason === "usage") process.stderr.write(USAGE);
  return 2;
}
function sessionPlaces(env) {
  if (typeof env.HOME !== "string" || env.HOME === "") return { error: "home_unset" };
  const codexHome = env.CODEX_HOME ? env.CODEX_HOME : null;
  if (codexHome !== null && !isAbsolute2(codexHome)) return { error: "codex_home_relative" };
  const claudeConfigDir = env.CLAUDE_CONFIG_DIR ? env.CLAUDE_CONFIG_DIR : null;
  if (claudeConfigDir !== null && !isAbsolute2(claudeConfigDir)) {
    return { error: "claude_config_dir_relative" };
  }
  return { home: env.HOME, places: { codexHome, claudeConfigDir } };
}
function main(argv, env = process.env, io = { write: writeSync, fsync: fsyncSync }) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (options.error) return fail(options.error);
  const located = sessionPlaces(env);
  if (located.error) return fail(located.error);
  const { home, places } = located;
  const history = options.history === null ? null : openHistory(resolve2(options.history), options.maxHistory);
  if (options.history !== null && history === null) return fail("history_unreadable");
  const report = options.out === null ? null : createReport(resolve2(options.out));
  if (report?.error) return fail(report.error);
  const { result, written } = scanInto(report, { ...options, home, places }, history, io);
  process.stdout.write(`${result.lines.join("\n")}
`);
  if (!written) return fail("out_write_failed");
  return result.status === "ok" || result.status === "partial" ? 0 : 1;
}
function invokedDirectly() {
  try {
    return realpathSync2(process.argv[1]) === realpathSync2(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (invokedDirectly()) process.exitCode = main(process.argv.slice(2));
export {
  main,
  parseArguments,
  scan
};
