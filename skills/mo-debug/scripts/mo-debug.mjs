#!/usr/bin/env node

// shared/scripts/mo-debug.mjs
import {
  closeSync as closeSync2,
  constants as constants2,
  fchmodSync,
  fsyncSync,
  openSync as openSync2,
  realpathSync as realpathSync2,
  writeSync
} from "node:fs";
import { resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

// shared/scripts/mo-debug-shell.mjs
var WORD_END = /* @__PURE__ */ new Set([" ", "	", "\n", "\r", ";", "&", "|", "<", ">", "(", ")", "`"]);
function backslashesBefore(text, at) {
  let count = 0;
  while (at - count - 1 >= 0 && text[at - count - 1] === "\\") count += 1;
  return count;
}
function trailingOnes(count) {
  let ones = 0;
  while (count & 1 << ones) ones += 1;
  return ones;
}
function quoteAt(text, at) {
  if (text[at] === "'") return { kind: "'", level: null, start: at, end: at + 1 };
  if (text[at] === "\\") {
    let run = 0;
    while (text[at + run] === "\\") run += 1;
    if (text[at + run] !== '"') return null;
    if (backslashesBefore(text, at) > 0) return null;
    return { kind: '"', level: trailingOnes(run), start: at, end: at + run + 1 };
  }
  if (text[at] === '"' && backslashesBefore(text, at) === 0) {
    return { kind: '"', level: 0, start: at, end: at + 1 };
  }
  return null;
}
var levelOf = (stack) => {
  const doubles = stack.filter((quote) => quote.kind === '"');
  return doubles.length === 0 ? 0 : doubles.at(-1).level + 1;
};
var closes = (open, token2) => token2.kind === open.kind && (token2.kind === "'" || token2.level === open.level);
function quoteContexts(text) {
  const contexts = new Array(text.length + 1);
  let stack = [];
  let at = 0;
  while (at < text.length) {
    const step = contextStep(text, at, stack);
    for (let index = at; index < step.next; index += 1) contexts[index] = stack;
    stack = step.stack;
    at = step.next;
  }
  contexts[text.length] = stack;
  return contexts;
}
var WORD_CHARACTER = /[\p{L}\p{N}]/u;
var AFTER_POSSESSIVE = /^(?:$|[\s.,;:!?)\]}])/u;
function contextStep(text, at, stack) {
  const top = stack.at(-1) ?? null;
  const token2 = quoteAt(text, at);
  if (!token2) {
    const escapes = text[at] === "\\" && top?.kind !== "'" && at + 1 < text.length;
    return { next: at + (escapes ? 2 : 1), stack };
  }
  return { next: token2.end, stack: stackAfter(text, token2, stack, top) };
}
function stackAfter(text, token2, stack, top) {
  if (top?.kind === "'") return token2.kind === "'" ? stack.slice(0, -1) : stack;
  if (token2.kind === "'") {
    const prose = WORD_CHARACTER.test(text[token2.start - 1] ?? "") && (WORD_CHARACTER.test(text[token2.end] ?? "") || AFTER_POSSESSIVE.test(text.slice(token2.end, token2.end + 1)));
    return top || prose ? stack : [...stack, token2];
  }
  if (top && closes(top, token2)) return stack.slice(0, -1);
  return token2.level === levelOf(stack) ? [...stack, token2] : stack;
}
function shellWord(text, start, stack) {
  const context = { enclosing: stack.at(-1) ?? null, level: levelOf(stack) };
  const segments = [];
  let at = start;
  while (at < text.length) {
    const step = wordStep(text, at, at === start, context);
    if (step === null) break;
    if (step.segment) segments.push(step.segment);
    at = step.next;
  }
  return { end: at, segments };
}
var AFTER_CLOSE = /* @__PURE__ */ new Set([...WORD_END, ",", "}", "]", ":", '"', "'", "\\"]);
function wordStep(text, at, first, { enclosing, level }) {
  const token2 = quoteAt(text, at);
  if (!token2) {
    if (WORD_END.has(text[at])) return null;
    return { next: at + (text[at] === "\\" && at + 1 < text.length ? 2 : 1) };
  }
  if (token2.kind === '"' && token2.level > level) return { next: token2.end };
  const own = token2.kind === "'" || token2.level === level;
  const ends = !first && (own ? Boolean(enclosing) && closes(enclosing, token2) : true);
  if (ends) {
    const closing = closingStep(text, token2, enclosing);
    if (closing !== void 0) return closing;
  }
  const end = segmentEnd(text, token2);
  const open = text.slice(token2.start, token2.end);
  return { next: end.at, segment: { open, close: end.closed ? open : "", start: at, end: end.at } };
}
function closingStep(text, token2, enclosing) {
  const again = quoteAt(text, token2.end);
  if (again && again.kind === token2.kind && again.level === token2.level) {
    return { next: again.end };
  }
  if (token2.end < text.length && !AFTER_CLOSE.has(text[token2.end])) return void 0;
  if (enclosing?.kind === "'" && segmentEnd(text, token2).closed) return void 0;
  return null;
}
function segmentEnd(text, token2) {
  let at = token2.end;
  while (at < text.length) {
    const inner = quoteAt(text, at);
    if (inner && closes(token2, inner)) return { at: inner.end, closed: true };
    at = inner ? inner.end : at + 1;
  }
  return { at: text.length, closed: false };
}

// shared/scripts/mo-debug-redact.mjs
var EXCERPT_LIMIT = 240;
var WINDOW = 4096;
var PATH_ROOTS = "home|Users|mnt|tmp|var|private|root|opt|srv|Volumes|media|run|workspace|workspaces|data";
var CREDENTIAL_KEY = "[A-Za-z0-9_.-]*(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key)";
var PLACEHOLDER = /^\[REDACTED:[a-z_]+\]$/u;
var WORD_TRIGGERS = [
  { kind: "assignment", pattern: new RegExp(String.raw`\b${CREDENTIAL_KEY}=(?=\S)`, "giu") },
  {
    kind: "flag",
    // A next word that is itself an option means the value was prompted for.
    pattern: new RegExp(
      String.raw`(?<=^|[\s"'${"`"}(])-{1,2}${CREDENTIAL_KEY}\s+(?=[^\s-])`,
      "giu"
    )
  },
  {
    kind: "flag",
    // A bare `-p` prompts instead; `-P` is the port and stays.
    pattern: /\b(?:mysql|mysqldump|mysqladmin|mariadb|mariadb-dump)\b[^\n|;&]*?\s-p(?=\S)/gu
  },
  { kind: "user", pattern: /(?<=^|\s)(?:--?user(?:\s+|=)|-u\s+)(?=[^\s-])/gu },
  // Glued, `-u` is ambiguous with other single-dash options such as Go's
  // `-url=…`, so a glued name that carries `=` or `/` is not a user.
  { kind: "user", glued: true, pattern: /(?<=^|\s)-u(?=[^\s-])/gu }
];
function mask(text, start, word, kind) {
  const only = word.segments.length === 1 ? word.segments[0] : null;
  const whole = only && only.start === start && only.end === word.end && only.close;
  const inner = whole ? text.slice(start + only.open.length, word.end - only.close.length) : text.slice(start, word.end);
  if (PLACEHOLDER.test(inner)) return text.slice(start, word.end);
  return whole ? `${only.open}[REDACTED:${kind}]${only.close}` : `[REDACTED:${kind}]`;
}
function maskUser(text, start, word, glued) {
  const value = text.slice(start, word.end);
  const colon = value.indexOf(":");
  if (colon <= 0) return null;
  if (glued && /[=/]/u.test(value.slice(0, colon))) return null;
  const at = start + colon;
  const inside = word.segments.find((segment) => segment.start < at && at < segment.end);
  if (inside) {
    const secret = text.slice(at + 1, inside.end - inside.close.length);
    const whole = inside.end === word.end;
    if (whole && (secret === "" || PLACEHOLDER.test(secret))) return value;
    return `${text.slice(start, at + 1)}[REDACTED:user_credentials]${inside.close}`;
  }
  if (at + 1 >= word.end) return null;
  const rest = { end: word.end, segments: word.segments.filter((segment) => segment.start > at) };
  return `${text.slice(start, at + 1)}${mask(text, at + 1, rest, "user_credentials")}`;
}
function redactShellWords(text) {
  const starts = [];
  for (const trigger of WORD_TRIGGERS) {
    for (const match of text.matchAll(trigger.pattern)) {
      starts.push({ ...trigger, start: match.index + match[0].length });
    }
  }
  if (starts.length === 0) return text;
  starts.sort((left, right) => left.start - right.start);
  const contexts = quoteContexts(text);
  let out = "";
  let copied = 0;
  for (const { kind, glued, start } of starts) {
    if (start < copied) continue;
    const word = shellWord(text, start, contexts[start]);
    if (word.end === start) continue;
    const masked = kind === "user" ? maskUser(text, start, word, glued) : mask(text, start, word, kind);
    if (masked === null) continue;
    out += text.slice(copied, start) + masked;
    copied = word.end;
  }
  return out + text.slice(copied);
}
var TOKEN_SHAPES = [
  [
    /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/gu,
    () => "[REDACTED:private_key]"
  ],
  [
    /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/giu,
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
var ASSIGNMENTS = [
  // A quoted value is a value up to its closing quote, spaces included: a
  // passphrase is several words, and stopping at the first space left the
  // rest in the report. An unclosed quote runs to the end of the text, which
  // fails closed at a window edge. Quotes escaped for JSON, as a tool call
  // carries them, are one more shape of the same value.
  [
    new RegExp(
      `\\b(${CREDENTIAL_KEY})(\\\\?["']?\\s*[=:]\\s*)\\\\(["'])(?!\\[REDACTED)(?:(?!\\\\\\3)[\\s\\S])+(\\\\\\3|$)`,
      "giu"
    ),
    (_, key, separator, quote, close) => `${key}${separator}\\${quote}[REDACTED:assignment]${close}`
  ],
  [
    new RegExp(
      `\\b(${CREDENTIAL_KEY})(["']?\\s*[=:]\\s*)(["'])(?!\\[REDACTED)(?:\\\\[\\s\\S]|(?!\\3)[^\\\\])+(\\3|$)`,
      "giu"
    ),
    (_, key, separator, quote, close) => `${key}${separator}${quote}[REDACTED:assignment]${close}`
  ],
  [
    // A key that *ends* in a credential word, then `=` or `:`. Requiring the
    // word at the end keeps `max_output_tokens: 30000` and `token_count` out,
    // so the value needs no minimum length: `pwd=123` is a whole PIN. A value
    // opening an object or a list is structure, not a credential.
    new RegExp(
      `\\b(${CREDENTIAL_KEY})(["']?\\s*[=:]\\s*["']?)(?!\\[REDACTED)(?![[{])([^\\s"'&,;}]+)`,
      "giu"
    ),
    (_, key, separator) => `${key}${separator}[REDACTED:assignment]`
  ]
];
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
  out = redactShellWords(out);
  for (const [pattern, replace] of ASSIGNMENTS) out = out.replace(pattern, replace);
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
function token(value) {
  const cleaned = redact(String(value ?? "")).replace(/[^A-Za-z0-9._:<>/@+-]/gu, "_").slice(0, 120);
  return cleaned === "" ? "-" : cleaned;
}

// shared/scripts/mo-debug-text.mjs
var SOURCE_TREE = /^source_tree:\s*(["']?)([0-9a-f]{40})\1\s*$/u;
var FRONTMATTER_BLOCK = /(?:^|\n)---\n([\s\S]*?)\n---(?:\n|$)/gu;
var HELPER = /(?:\bnode\s+(?:-[-\w=]*\s+)*|(?:^|[;&|(\n])\s*)["']?(?:[^\s"';&|]*\/)?(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\.mjs\b/gu;
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
  const marker = shown.lastIndexOf("\n\nARGUMENTS: ");
  if (marker !== -1) candidates.push(shown.slice(0, marker));
  return [...new Set(candidates)];
}
function helperNames(command) {
  return [...new Set([...String(command).matchAll(HELPER)].map((match) => match[1]))];
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
var SKILL_FILE = /(?:^|\/)(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md$/u;
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
  const read = item.name === "Read" ? SKILL_FILE.exec(item.input.file_path ?? "") : null;
  if (read) state.readCalls.set(item.id, read[1]);
}
function skillLoad(state, record, text, number) {
  const lineEnd = text.indexOf("\n");
  const directory = text.slice(LOAD_PREFIX.length, lineEnd === -1 ? void 0 : lineEnd);
  const name = directory.replace(/\/+$/u, "").split("/").at(-1);
  if (!SKILL_NAME.test(name) || lineEnd === -1) return;
  const shown = text.slice(lineEnd + 1).replace(/^\n/u, "");
  const args = state.skillCalls.get(record.sourceToolUseID)?.args ?? null;
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
function userRecord(state, record, number) {
  const content = record.message?.content;
  if (typeof content === "string") {
    const command = COMMAND.exec(content);
    if (command) {
      const args = COMMAND_ARGS.exec(content)?.[1] ?? "";
      state.evidence.event(number, "skill_invocation", command[1], `/${command[1]} ${args}`);
    }
    return;
  }
  if (!Array.isArray(content)) return;
  for (const item of content) {
    if (item?.type === "text" && typeof item.text === "string") {
      if (item.text.startsWith(LOAD_PREFIX)) skillLoad(state, record, item.text, number);
      else if (COMMAND.test(item.text)) {
        const name = COMMAND.exec(item.text)[1];
        state.evidence.event(number, "skill_invocation", name, `/${name}`);
      }
    } else if (item?.type === "tool_result") toolResult(state, item, number);
  }
}
function createClaudeExtractor(session) {
  const state = {
    evidence: createEvidence(session, "claude"),
    skillCalls: /* @__PURE__ */ new Map(),
    helperCalls: /* @__PURE__ */ new Map(),
    readCalls: /* @__PURE__ */ new Map()
  };
  const feed = (record, number) => {
    if (!isClaudeRecord(record)) return;
    state.evidence.recognized += 1;
    const content = record.message?.content;
    if (record.type === "assistant" && Array.isArray(content)) {
      for (const item of content) assistantItem(state, item, number);
    } else if (record.type === "user") userRecord(state, record, number);
  };
  return { evidence: state.evidence, feed };
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
      const from = Math.max(0, match.index - 80);
      evidence.event(number, "skill_invocation", match[1], text.slice(from, match.index + 160));
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
    const match = /(?:^|\/)skills\/(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md$/u.exec(path);
    if (match && !/(?:^|\/)src\/skills\//u.test(path)) names.push(match[1]);
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
  const feed = (record, number) => {
    if (!SHAPES.has(record.type) || record.payload === null || typeof record.payload !== "object") {
      return;
    }
    state.evidence.recognized += 1;
    feedPayload(state, record, number);
  };
  return { evidence: state.evidence, feed };
}

// shared/scripts/mo-debug-history.mjs
import { spawnSync } from "node:child_process";
var SHA = /^[0-9a-f]{40}$/u;
var SHORT = 12;
function git(repo, args, input) {
  return spawnSync("git", ["-C", repo, ...args], {
    input,
    maxBuffer: 256 * 1024 * 1024
  });
}
function openHistory(repo, maxHistory) {
  const head = git(repo, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  const sha = head.status === 0 ? head.stdout.toString("utf8").trim() : "";
  if (!SHA.test(sha)) return null;
  return { repo, head: sha, maxHistory, cache: /* @__PURE__ */ new Map() };
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
    objects.set(oid, buffer.subarray(end + 1, end + 1 + length).toString("utf8"));
    at = end + 1 + length + 1;
  }
  return objects;
}
function skillHistory(history, name) {
  if (history.cache.has(name)) return history.cache.get(name);
  const path = `skills/${name}/SKILL.md`;
  const listed = git(history.repo, [
    "rev-list",
    `--max-count=${history.maxHistory + 1}`,
    history.head,
    "--",
    path
  ]);
  const shas = listed.status === 0 ? listed.stdout.toString("utf8").split("\n").filter(Boolean) : [];
  const partial = shas.length > history.maxHistory;
  const walked = shas.slice(0, history.maxHistory);
  const checked = git(
    history.repo,
    ["cat-file", "--batch-check"],
    walked.map((sha) => `${sha}:${path}
`).join("")
  );
  const oids = checked.stdout.toString("utf8").split("\n").slice(0, walked.length).map((line) => (/^([0-9a-f]{40}) blob /u.exec(line) ?? [])[1] ?? null);
  const unique = [...new Set(oids.filter(Boolean))];
  const blobs = unique.length === 0 ? /* @__PURE__ */ new Map() : parseBatch(git(history.repo, ["cat-file", "--batch"], `${unique.join("\n")}
`).stdout);
  const entries = walked.map((sha, index) => ({ sha, text: blobs.get(oids[index]) ?? null })).filter((entry) => entry.text !== null);
  const result = { entries, partial, failed: listed.status !== 0 };
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
function sessionRoots(home) {
  return {
    claude: join(home, ".claude", "projects"),
    codex: join(home, ".codex", "sessions")
  };
}
function isDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}
function claudeMatches(root, id) {
  if (!UUID.test(id) || !isDirectory(root)) return [];
  const matches = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name, `${id}.jsonl`);
    try {
      lstatSync(candidate);
      matches.push(candidate);
    } catch {
    }
  }
  return matches;
}
function codexMatches(root, id) {
  if (!UUID.test(id) || !isDirectory(root)) return [];
  const wanted = id.toLowerCase();
  const matches = [];
  const pending = [{ dir: root, depth: 0 }];
  let seen = 0;
  while (pending.length > 0 && seen < WALK_ENTRIES) {
    const { dir, depth } = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      seen += 1;
      const name = entry.name;
      if (entry.isDirectory() && depth < WALK_DEPTH)
        pending.push({ dir: join(dir, name), depth: depth + 1 });
      else if (name.startsWith("rollout-") && CODEX_ID.exec(name)?.[1].toLowerCase() === wanted) {
        matches.push(join(dir, name));
      }
    }
  }
  return matches;
}
function resolveSession(spec, home) {
  if (spec.includes("/") || spec.includes(sep) || spec.endsWith(".jsonl") || isAbsolute(spec)) {
    return { path: resolve(spec) };
  }
  if (!SESSION_ID.test(spec)) return { outcome: "session_not_found" };
  const roots = sessionRoots(home);
  const matches = [...claudeMatches(roots.claude, spec), ...codexMatches(roots.codex, spec)];
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
function verifiedDescriptor(path, roots) {
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
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    return { outcome: "foreign_path" };
  }
  const opened = fstatSync(fd);
  const checked = statSync(real);
  const ownUid = typeof process.getuid === "function" ? process.getuid() : opened.uid;
  if (!opened.isFile() || opened.dev !== checked.dev || opened.ino !== checked.ino || opened.uid !== ownUid) {
    closeSync(fd);
    return { outcome: "foreign_path" };
  }
  return { fd, harness, real };
}
function openOwnedSession(path, home) {
  const verified = verifiedDescriptor(path, sessionRoots(home));
  if (verified.outcome) return verified;
  return { fd: verified.fd, harness: verified.harness, id: sessionIdOf(verified.real) };
}
function sessionIdOf(path) {
  const name = basename(path);
  const codex = CODEX_ID.exec(name);
  if (name.startsWith("rollout-") && codex) return codex[1];
  return name.replace(/\.jsonl$/u, "");
}
function* sessionLines(fd) {
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
  for (let read = readSync(fd, chunk); read > 0; read = readSync(fd, chunk)) {
    const view = chunk.subarray(0, read);
    let start = 0;
    for (let at = view.indexOf(10); at !== -1; at = view.indexOf(10, start)) {
      if (pendingBytes <= LINE_LIMIT) pending.push(Buffer.from(view.subarray(start, at)));
      pendingBytes += at - start;
      yield flush();
      start = at + 1;
    }
    if (pendingBytes <= LINE_LIMIT) pending.push(Buffer.from(view.subarray(start)));
    pendingBytes += read - start;
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
  --out <new-file>        also write a Markdown report; the file must not exist

Only files under ~/.claude/projects/ or ~/.codex/sessions/ that the invoking
user owns are read; anything else is refused as foreign_path, unread.

exit: 0 ok or partial | 1 unknown or every session refused | 2 call error
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
  for (const { number, text } of sessionLines(opened.fd)) {
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
  const resolved = resolveSession(spec, options.home);
  if (resolved.outcome) return refusedSession(spec, resolved.outcome);
  const opened = openOwnedSession(resolved.path, options.home);
  if (opened.outcome) return refusedSession(spec, opened.outcome);
  try {
    return readSession(opened, options);
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
function fail(reason) {
  process.stderr.write(`MO-DEBUG/1 status=error reason=${reason}
`);
  if (reason === "usage") process.stderr.write(USAGE);
  return 2;
}
function main(argv, env = process.env) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (options.error) return fail(options.error);
  if (typeof env.HOME !== "string" || env.HOME === "") return fail("home_unset");
  const history = options.history === null ? null : openHistory(resolve2(options.history), options.maxHistory);
  if (options.history !== null && history === null) return fail("history_unreadable");
  const report = options.out === null ? null : createReport(resolve2(options.out));
  if (report?.error) return fail(report.error);
  const result = scan({ ...options, home: env.HOME }, history);
  if (report) {
    writeSync(report.fd, renderReport(result));
    fsyncSync(report.fd);
    closeSync2(report.fd);
  }
  process.stdout.write(`${result.lines.join("\n")}
`);
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
