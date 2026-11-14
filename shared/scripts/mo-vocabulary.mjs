#!/usr/bin/env node
/**
 * Refuse vocabulary a reader cannot look up.
 *
 * §A-MEMORY-01 ties every layer of knowledge together by identifier, and an
 * identifier nobody defined is the failure mode of a document written under
 * pressure: a work item mentioned forty times and introduced nowhere, a section
 * number with no document to open, a `§A-` anchor whose area and number were
 * never decided. Each reads like a citation, so a reviewer treats it as one and
 * reasons from a section that is not there.
 *
 * The project's own notation is decided, so citing an undefined one is an
 * error. A section number in first-party source code is decided too: it must
 * name the live canonical document it opens, in the same block of text, and
 * that document's AST must have the section. Everything else is a guess about
 * somebody's coinage and is reported as a warning: a checker that blocks on a
 * guess gets switched off.
 *
 * Where `§A-*` and `§B-*` are defined is not this tool's decision. Given the
 * project's knowledge plan it runs the portable core of §A-MEMORY-05 first,
 * reports that answer unchanged, and resolves the project's own ids against
 * the definitions the core found.
 *
 * The module ships: mo-setup copies its bundle into a consumer project, whose
 * Makefile recipe carries the roots and areas as flags. There is no second
 * algorithm and no configuration file.
 */

import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

import MarkdownIt from "markdown-it";

import { checkKnowledge, knowledgeReport } from "./knowledge-check.mjs";

const markdown = new MarkdownIt();

const DEFAULT_LAYERS = ["A", "B"];
const SOURCE_EXTENSIONS = [".md", ".mjs", ".js", ".cjs", ".ts", ".tsx", ".py", ".sh", ".yml"];
const MARKDOWN = /\.md$/iu;

// Loose on purpose: a malformed anchor must be caught, not skipped as unknown.
const ANCHOR = /§[A-Za-z][A-Za-z0-9-]*[*<[({\\/"']?/gu;
const BARE_SECTION = /§\d+(?:\.\d+)*/gu;
const COINED = /\b[A-Z]{1,4}\d+(?:\.\d+)+\b/gu;
// A label such as `AC-006`, `W2-26` or `OPS-1`. Preceded by a word character, a
// hyphen or a sigil it is the tail of something else (`§A-WAIT-01`,
// `MO-BACKLOG/1`), and followed by more of a word it is a longer name. Opened by
// a quote or a backtick it is a literal value — a protocol key, a string in
// code — rather than a citation of a work item.
const LABEL = /(?<![\w§/.`'"-])[A-Z][A-Z0-9]{0,3}-\d+(?![\w-]|\.\d)/gu;
// Standards keep their own registry; `UTF-8` is nobody's coined vocabulary.
const STANDARDS = new Set(["CVE", "ECMA", "IEC", "IEEE", "ISO", "RFC", "SHA", "UTF"]);
// A line that says this is showing the notation, not using it. Greppable on
// purpose: a silent exemption is how a gate stops meaning anything.
const SUPPRESS = "mo-vocabulary-ok";
const SUPPRESS_FILE = `${SUPPRESS} file`;

// Temporary and archived areas: a feature's specification is deleted at
// closure, so a citation into it dangles the day the feature lands.
const ALWAYS_NON_CANONICAL = ["spec", "docs/specifications"];
// A Markdown path as source code writes it: whole inside backticks, where a
// name may hold spaces, or bare, where any letter or digit of any script may
// form a name. §A-MEMORY-01 names no alphabet for a canonical document, so an
// ASCII-only class would turn `docs/решение.md` into "no document" and
// `docs/my guide.md` into its own tail.
const NAME = "[\\p{L}\\p{N}_.@+-]+";
const PATH_BODY = `(?:\\.\\/)?${NAME}(?:\\/${NAME})*\\.md`;
const BARE_PATH = new RegExp(`(?<![\\p{L}\\p{N}_.@+/-])(${PATH_BODY})(?![\\p{L}\\p{N}_-])`, "giu");
const WHOLE_PATH = new RegExp(`^${PATH_BODY}$`, "u");
const DOCUMENT_PATH = new RegExp(`\`((?:\\.\\/)?[^\`\\n]*?\\.md)\`|${BARE_PATH.source}`, "giu");

const USAGE = `usage: mo-vocabulary.mjs [--root <git-root>] [options]

  --root <git-root>            repository to check (default: cwd)
  --exclude <prefix>           tracked area left out of every check (repeatable)
  --first-party-root <prefix>  the project's own code; the section-number
                               contract applies only under these roots
                               (repeatable; default: every tracked file)
  --non-canonical <prefix>     temporary or archived area a source may not cite
                               (repeatable; spec/ and docs/specifications/ always)
  --strict                     warnings fail too
  --min-mentions <n>           mentions before a guess is reported (default 2)
  --layers <A,B>               layers of the project's own notation
  --business <path> --architecture <dir> --docs <path> --knowledge-exclude <path>
                               the knowledge plan; given, the mo-knowledge core
                               runs first and decides which ids are defined
  --help                       print this grammar and exit

output: MO-VOCABULARY/1 status=<ok|violations> errors=<n> warnings=<n>
exit: 0 ok | 1 violations | 2 call error or unknown knowledge plan
`;

/**
 * What kind of citation a token is, and how sure we are about it.
 *
 * §A-MEMORY-01 owns `§A-*` and `§B-*`: their grammar is decided, so a citation
 * that does not resolve is a defect rather than an opinion. A bare section
 * number in prose names no document at all and cannot resolve by construction.
 * A coined work-item number might be anything, which is exactly why it is a
 * warning.
 */
export function classify(token, layers = DEFAULT_LAYERS) {
  // `§A-*`, `§B-<AREA>-<NN>`, `§A-[A-Z]…` in a regular expression and `"§A-"`
  // as a prefix in code all name the family rather than a member of it; the
  // caller drops them before classification. A bare `§A-` left in prose is read
  // the same way, which is what it means nearly every time somebody writes it.
  if (/-$/u.test(token)) return { kind: "notation", severity: "none", owned: true };
  if (BARE_SECTION.test(token)) {
    BARE_SECTION.lastIndex = 0;
    return { kind: "unresolvable_section", severity: "warning", owned: false };
  }
  if (!token.startsWith("§")) {
    return { kind: "undefined_vocabulary", severity: "warning", owned: false };
  }
  // The accepted shape is decided, so anything wearing it is judged strictly:
  // a declared layer that resolves to nothing is a dangling citation, and an
  // undeclared layer is a notation somebody invented next to the agreed one.
  const shaped = /^§([A-Z])-[A-Z][A-Z0-9-]*-\d{2}$/u.exec(token);
  if (shaped) {
    return layers.includes(shaped[1])
      ? { kind: "undefined_id", severity: "error", owned: true }
      : { kind: "foreign_layer", severity: "error", owned: true };
  }
  const claimed = /^§([A-Z])-/u.exec(token);
  if (claimed) {
    return layers.includes(claimed[1])
      ? { kind: "malformed_id", severity: "error", owned: true }
      : { kind: "foreign_layer", severity: "error", owned: true };
  }
  // `§E`, `§A2`, `§Clarifications`: a section of some document nobody named.
  // It resolves to nothing, but it never claimed to be the accepted notation,
  // so it is reported as a warning rather than blocking a gate on a guess.
  return { kind: "unresolvable_section", severity: "warning", owned: false };
}

/** Every token one line cites, with the line it was cited on. */
function citationsOf(text, startLine, { sections = true } = {}) {
  const found = [];
  for (const pattern of [ANCHOR, sections ? BARE_SECTION : null, COINED, LABEL]) {
    if (pattern === null) continue;
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      // The character that follows an anchor is not part of it. It is kept by
      // the pattern only long enough to answer one question: is this a citation
      // or the notation itself?
      const body = match[0].replace(/[*<[({\\/"']$/u, "");
      if (body !== match[0] && body.endsWith("-")) continue;
      if (pattern === LABEL && STANDARDS.has(body.split("-")[0])) continue;
      found.push({ token: body, line: startLine });
    }
  }
  return found;
}

/**
 * The leading token of a definition position, without its decoration.
 *
 * Trailing punctuation is decoration; an inner dot is part of the name, and
 * stripping it turned `T5.1` into `T51`, making every task an undefined term.
 */
function leadingToken(value) {
  return value
    .trim()
    .split(/[\s—:|,]/u)[0]
    ?.replace(/^[*`_]+/u, "")
    .replace(/[*`_,.:;]+$/u, "");
}

/**
 * The number a heading opens with: digits and inner dots, written bare or
 * after the section sign, followed by anything but another digit.
 */
function headingNumber(heading) {
  const numbered = /^§?(\d+(?:\.\d+)*)(?!\d|\.\d)/u.exec(heading.trim());
  return numbered === null ? null : numbered[1];
}

/** Whether one inline token sits in a position that introduces its first word. */
function introduces(opener, cell, listDepth) {
  if (opener === "heading_open") return true;
  if ((opener === "th_open" || opener === "td_open") && cell === 1) return true;
  return opener === "paragraph_open" && listDepth > 0;
}

/**
 * The tokens a document introduces rather than cites.
 *
 * §A-MEMORY-01 needs a place a reader can land on. A definition is a position,
 * not a word: a heading that opens with the token, a table row keyed by it, or
 * a list item that leads with it. Prose mentioning the token in the middle of a
 * sentence is a citation no matter how explanatory it sounds. A numbered
 * heading defines the section people cite as `§` plus its number; for prose the
 * check is corpus-wide, because "no document anywhere has this section" is the
 * signal worth having and it is a warning either way.
 */
export function definedTokens(source) {
  const defined = new Set();
  const tokens = markdown.parse(source, {});
  let cell = 0;
  let listDepth = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.type === "tr_open") cell = 0;
    if (token.type === "th_open" || token.type === "td_open") cell += 1;
    if (token.type === "list_item_open") listDepth += 1;
    if (token.type === "list_item_close") listDepth -= 1;
    if (token.type !== "inline") continue;
    const opener = tokens[index - 1]?.type;
    if (introduces(opener, cell, listDepth)) {
      const first = leadingToken(token.content);
      if (first) defined.add(first);
    }
    const number = opener === "heading_open" ? headingNumber(token.content) : null;
    if (number !== null) defined.add(`§${number}`);
  }
  return defined;
}

/**
 * The section numbers one document's own headings define.
 *
 * §A-MEMORY-01 resolves a source's section number in the named document's AST
 * only: the same number in another document is another section.
 */
export function documentSections(source) {
  const sections = new Set();
  const tokens = markdown.parse(source, {});
  for (const [index, token] of tokens.entries()) {
    if (token.type !== "inline" || tokens[index - 1]?.type !== "heading_open") continue;
    const number = headingNumber(token.content);
    if (number !== null) sections.add(number);
  }
  return sections;
}

/**
 * Citations outside fenced code, with their line numbers.
 *
 * §A-MEMORY-01 is explained in fenced examples, and a document that shows its
 * own grammar would otherwise fail against it. A line carrying
 * `mo-vocabulary-ok` is a deliberate example too, and says so where a reader
 * and a grep can both see it.
 */
export function citedTokens(source) {
  const fenced = new Set();
  for (const token of markdown.parse(source, {})) {
    if (!["fence", "code_block"].includes(token.type) || !token.map) continue;
    for (let line = token.map[0]; line < token.map[1]; line += 1) fenced.add(line + 1);
  }
  const lines = source.split("\n");
  return lines.flatMap((text, index) =>
    fenced.has(index + 1) || suppressed(lines, index) ? [] : citationsOf(text, index + 1),
  );
}

/**
 * §A-MEMORY-01 counts a citation in a comment: it cites just as loudly. A
 * section number under the source contract is judged there instead, so the
 * caller can leave it out of the corpus-wide guesses.
 */
export function citedInSource(text, { sections = true } = {}) {
  const lines = text.split("\n");
  return lines.flatMap((line, index) =>
    suppressed(lines, index) ? [] : citationsOf(line, index + 1, { sections }),
  );
}

/** The marker suppresses its own line or the next one, as a reader expects. */
function suppressed(lines, index) {
  return lines[index].includes(SUPPRESS) || (lines[index - 1] ?? "").includes(SUPPRESS);
}

/**
 * The declaration block a file opens with, before its first content.
 *
 * §A-MEMORY-01 needs a file-wide claim to be a claim, not a coincidence. A
 * marker anywhere in the bytes would let a runtime string, a quoted example or
 * a paragraph three screens down disable the gate for the whole file, and
 * nobody reading the top would know. Only comments, a shebang and leading
 * frontmatter count; the first line of real content ends the block.
 */
export function leadingHeader(text, path = "") {
  // `#` opens a comment in Python, shell, YAML, Makefiles and ignore files and
  // a heading in Markdown, so the answer depends on which file this is.
  // Getting it wrong either way is bad: a heading that exempts its own
  // document, or a language whose only comment syntax cannot make the
  // declaration at all.
  const hash = !MARKDOWN.test(path) && !/\.(?:[cm]?js|tsx?)$/u.test(path);
  const kept = [];
  let closing = null;
  for (const line of String(text).split("\n")) {
    const trimmed = line.trim();
    if (closing !== null) {
      kept.push(line);
      if (trimmed.endsWith(closing)) closing = null;
      continue;
    }
    const opened = openedBlock(trimmed, kept, hash && path !== "");
    if (opened === undefined) break;
    kept.push(line);
    closing = opened;
  }
  return kept.join("\n");
}

/**
 * What a header line opens, `null` when it opens nothing, `undefined` when the
 * line is already content. §A-MEMORY-01 ends the block at the first such line.
 */
function openedBlock(trimmed, kept, hash) {
  if (trimmed === "" || trimmed.startsWith("#!") || trimmed.startsWith("//")) return null;
  if (hash && trimmed.startsWith("#")) return null;
  if (trimmed === "---" && kept.every((entry) => entry.trim() === "")) return "---";
  const pair = [
    ["/*", "*/"],
    ["<!--", "-->"],
  ].find(([open]) => trimmed.startsWith(open));
  if (pair === undefined) return undefined;
  return trimmed.endsWith(pair[1]) ? null : pair[1];
}

/**
 * Whether a whole file is deliberate examples.
 *
 * §A-MEMORY-01 has to survive the file that tests it: a corpus of undefined
 * identifiers is this checker's input, and marking every fixture line would
 * bury the fixtures. The file-wide form follows `eslint-disable`: the same
 * marker, one extra word, and only in the opening declaration block, so a
 * reader sees the exemption before the first line it covers.
 */
export function deliberateFixture(text, path = "") {
  return leadingHeader(text, path).includes(SUPPRESS_FILE);
}

/** §A-MEMORY-01 normalizes a prefix flag: no trailing slash, `.` for everything. */
function prefixOf(value) {
  const path = posix.normalize(String(value).replace(/\/+$/u, "") || ".");
  return path === "./" ? "." : path;
}

function under(prefix, path) {
  return prefix === "." || path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The block of text a section number is written in: the contiguous non-empty
 * lines ending with the reference's line, cut at the reference itself.
 *
 * §A-MEMORY-01 accepts the path anywhere in that block, because a formatter
 * that rewraps a comment must not turn a resolved citation into a bare one.
 */
function blockBefore(lines, index, column) {
  let start = index;
  while (start > 0 && lines[start - 1].trim() !== "") start -= 1;
  return [...lines.slice(start, index), lines[index].slice(0, column)].join("\n");
}

const pathOf = (raw) => posix.normalize(raw.replace(/^\.\//u, ""));

// A command word as it opens a shell line: no directory, no extension.
const COMMAND_WORD = /^[A-Za-z][\w-]*$/u;

/**
 * The document one backtick span names.
 *
 * Backticks usually hold the path alone, but they may hold a command around
 * it, as in `cat docs/x.md`. The span's form alone decides which: a command
 * word followed by a last argument that is a path with a directory. The
 * boundaries are fixed before any tracked file is consulted, because a span
 * cut to whichever tail exists would let a removed `docs/my guide.md` resolve
 * to some tracked guide.md (§A-MEMORY-01). Any other span is one literal path,
 * spaces included, so an ambiguous span fails closed as unavailable.
 */
function spanDocument(span) {
  const words = span.trim().split(/\s+/u);
  const argument = words.at(-1);
  const command =
    words.length > 1 &&
    COMMAND_WORD.test(words[0]) &&
    argument.includes("/") &&
    WHOLE_PATH.test(argument);
  return pathOf(command ? argument : span);
}

/** The last Markdown path written before the reference in its block. */
function namedDocument(block) {
  const last = [...block.matchAll(DOCUMENT_PATH)].at(-1);
  if (last === undefined) return null;
  return last[1] === undefined ? pathOf(last[2]) : spanDocument(last[1]);
}

/**
 * Judge every section number one first-party source cites.
 *
 * §A-MEMORY-01 allows a section number in code only together with the live,
 * tracked, canonical document it opens, and only when that document's own
 * headings carry the number. Each failure has its own kind because each has
 * its own repair: name the document, restore or drop the citation, move the
 * norm out of a temporary area, or correct the number.
 *
 * @param {object} input the source and how to read the snapshot around it
 * @returns {object[]} one finding per unresolved reference
 */
export function sourceSectionFindings({ path, text, tracked, readDocument, nonCanonical = [] }) {
  if (deliberateFixture(text, path)) return [];
  const areas = [...ALWAYS_NON_CANONICAL, ...nonCanonical.map(prefixOf)];
  const lines = text.split("\n");
  const findings = [];
  lines.forEach((line, index) => {
    if (suppressed(lines, index)) return;
    BARE_SECTION.lastIndex = 0;
    for (const match of line.matchAll(BARE_SECTION)) {
      const number = match[0].slice(1);
      const document = namedDocument(blockBefore(lines, index, match.index));
      const at = { token: match[0], mentions: 1, first: `${path}:${index + 1}` };
      const kind = sectionVerdict(number, document, { tracked, readDocument, areas });
      if (kind === null) continue;
      findings.push({ severity: "error", kind, ...at, ...(document ? { document } : {}) });
    }
  });
  return findings;
}

function sectionVerdict(number, document, { tracked, readDocument, areas }) {
  if (document === null) return "source_section_document_missing";
  if (!tracked.has(document)) return "source_section_document_unavailable";
  if (areas.some((area) => under(area, document))) return "source_section_document_not_canonical";
  const sections = readDocument(document);
  if (sections === null) return "source_section_document_unavailable";
  return sections.has(number) ? null : "source_section_missing";
}

/**
 * Definitions and mentions across the corpus. With the core's definitions, an
 * id of the project's own notation counts as defined only where the core found
 * it, not wherever it happens to open a table row.
 */
function gather(files, read, owned, contracted) {
  const defined = new Set(owned ?? []);
  const mentions = new Map();
  const local = (token) => owned === null || !/^§[AB]-/u.test(token);
  for (const path of files) {
    const text = read(path);
    if (text === null || deliberateFixture(text, path)) continue;
    const isMarkdown = MARKDOWN.test(path);
    if (isMarkdown) for (const token of definedTokens(text)) if (local(token)) defined.add(token);
    const cited = isMarkdown
      ? citedTokens(text)
      : citedInSource(text, { sections: !contracted(path) });
    for (const { token, line } of cited) {
      const entry = mentions.get(token) ?? { count: 0, first: `${path}:${line}` };
      entry.count += 1;
      mentions.set(token, entry);
    }
  }
  return { defined, mentions };
}

/**
 * Report every token the corpus cites and never introduces.
 *
 * §A-MEMORY-01 needs one answer per token rather than one per mention: a term
 * used forty times is one missing definition, and forty findings would bury it.
 * `contracted` names the sources whose section numbers the source contract
 * judges instead.
 */
export function vocabularyFindings({
  files,
  read,
  layers = DEFAULT_LAYERS,
  minMentions = 2,
  owned = null,
  contracted = () => false,
}) {
  const { defined, mentions } = gather(files, read, owned, contracted);
  const findings = [];
  for (const [token, entry] of mentions) {
    if (defined.has(token)) continue;
    const { kind, severity } = classify(token, layers);
    if (severity === "none") continue;
    if (severity === "warning" && entry.count < minMentions) continue;
    findings.push({ severity, kind, token, mentions: entry.count, first: entry.first });
  }
  return sortFindings(findings);
}

/** §A-MEMORY-01 orders findings: errors first, then the loudest, then by name. */
export function sortFindings(findings) {
  return [...findings].sort(
    (left, right) =>
      Number(left.severity === "warning") - Number(right.severity === "warning") ||
      right.mentions - left.mentions ||
      left.token.localeCompare(right.token) ||
      left.first.localeCompare(right.first),
  );
}

/** §A-MEMORY-01 reports one line per finding, plus the summary a gate reads. */
export function vocabularyReport(findings) {
  const errors = findings.filter(({ severity }) => severity === "error").length;
  const warnings = findings.length - errors;
  const lines = findings.map((finding) => {
    const line = `${finding.severity} ${finding.kind} ${finding.token} mentions=${finding.mentions} first=${finding.first}`;
    return finding.document === undefined ? line : `${line} document=${finding.document}`;
  });
  const status = errors > 0 ? "violations" : "ok";
  lines.push(`MO-VOCABULARY/1 status=${status} errors=${errors} warnings=${warnings}`);
  return { status, errors, warnings, text: `${lines.join("\n")}\n` };
}

/** §A-MEMORY-01 reads tracked files only: an untracked draft is nobody's contract yet. */
export function trackedFiles(root) {
  const listed = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (listed.error || listed.status !== 0) throw new Error(`git ls-files failed in ${root}`);
  return listed.stdout.split("\0").filter(Boolean);
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * The text of one tracked file in the checked snapshot, or `null`.
 *
 * A binary file has no citations, and a tracked symlink points at bytes the
 * snapshot does not hold, so neither is read. A deleted but still indexed file
 * is absent from the snapshot the source is checked in.
 */
function readText(root, path) {
  const absolute = join(root, path);
  try {
    const entry = lstatSync(absolute);
    if (!entry.isFile() || entry.isSymbolicLink()) return null;
    if (realpathSync(absolute) !== join(realpathSync(root), path)) return null;
    const bytes = readFileSync(absolute);
    if (bytes.includes(0)) return null;
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

const PLAN_FLAGS = {
  "--business": "business",
  "--architecture": "architecture",
  "--docs": "docs",
  "--knowledge-exclude": "excludes",
};
const LIST_FLAGS = {
  "--exclude": "exclude",
  "--first-party-root": "firstPartyRoots",
  "--non-canonical": "nonCanonical",
};

function parseArguments(argv) {
  const options = {
    root: process.cwd(),
    strict: false,
    minMentions: 2,
    layers: DEFAULT_LAYERS,
    exclude: [],
    firstPartyRoots: [],
    nonCanonical: [],
  };
  const valueOf = (flag, index) => {
    const value = argv[index];
    if (value === undefined) throw new Error(`${flag} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (PLAN_FLAGS[flag]) {
      const key = PLAN_FLAGS[flag];
      const value = valueOf(flag, (index += 1));
      options.plan ??= { docs: [], excludes: [] };
      if (Array.isArray(options.plan[key])) options.plan[key].push(value);
      else options.plan[key] = value;
    } else if (LIST_FLAGS[flag]) options[LIST_FLAGS[flag]].push(valueOf(flag, (index += 1)));
    else if (flag === "--strict") options.strict = true;
    else if (flag === "--help") options.help = true;
    else if (flag === "--root") options.root = valueOf(flag, (index += 1));
    else if (flag === "--min-mentions") options.minMentions = Number(valueOf(flag, (index += 1)));
    else if (flag === "--layers") options.layers = valueOf(flag, (index += 1)).split(",");
    else throw new Error(`unknown flag "${flag}"`);
  }
  return options;
}

/**
 * §A-MEMORY-01 runs the whole check on one root: the knowledge core when a plan
 * is declared, the corpus-wide guesses, and the source section contract.
 */
function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const root = resolve(options.root);
  const excluded = options.exclude.map(prefixOf);
  const roots = options.firstPartyRoots.map(prefixOf);
  const tracked = trackedFiles(root);
  const kept = tracked.filter((path) => !excluded.some((prefix) => under(prefix, path)));
  let knowledge = null;
  if (options.plan) {
    knowledge = checkKnowledge({ root, firstPartyRoots: roots, ...options.plan });
    if (knowledge.status === "call_error") throw new Error(knowledge.message);
    process.stdout.write(knowledgeReport(knowledge));
    if (knowledge.status === "unknown") return 2;
  }
  const texts = new Map();
  const read = (path) => {
    if (!texts.has(path)) texts.set(path, readText(root, path));
    return texts.get(path);
  };
  const firstParty = (path) =>
    !MARKDOWN.test(path) && (roots.length === 0 || roots.some((prefix) => under(prefix, path)));
  const sections = new Map();
  const readDocument = (path) => {
    if (!sections.has(path)) {
      const text = read(path);
      sections.set(path, text === null ? null : documentSections(text));
    }
    return sections.get(path);
  };
  const trackedSet = new Set(tracked);
  const sourceFindings = kept.filter(firstParty).flatMap((path) => {
    const text = read(path);
    if (text === null) return [];
    return sourceSectionFindings({
      path,
      text,
      tracked: trackedSet,
      readDocument,
      nonCanonical: options.nonCanonical,
    });
  });
  const corpus = kept.filter((path) => SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext)));
  const findings = vocabularyFindings({
    files: corpus,
    read,
    layers: options.layers,
    minMentions: options.minMentions,
    owned: knowledge?.defined ?? null,
    contracted: firstParty,
  });
  const report = vocabularyReport(sortFindings([...sourceFindings, ...findings]));
  process.stdout.write(report.text);
  if (report.errors > 0 || knowledge?.status === "violations") return 1;
  return options.strict && report.warnings > 0 ? 1 : 0;
}

function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
