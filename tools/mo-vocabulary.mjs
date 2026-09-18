#!/usr/bin/env node
/**
 * Refuse vocabulary a reader cannot look up.
 *
 * §A-MEMORY-01 ties every layer of knowledge together by identifier, and an
 * identifier nobody defined is the failure mode of a document written under
 * pressure: `W1.2` mentioned forty times and introduced nowhere, `§17` with no
 * document to open, a `§A-` anchor whose area and number were never decided.
 * Each reads like a citation, so a reviewer treats it as one and reasons from a
 * section that is not there.
 *
 * The project's own notation is decided, so citing an undefined one is an
 * error. Everything else is a guess about somebody's coinage and is reported as
 * a warning: a checker that blocks on a guess gets switched off.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt();

const DEFAULT_LAYERS = ["A", "B"];
const SOURCE_EXTENSIONS = [".md", ".mjs", ".js", ".cjs", ".ts", ".tsx", ".py", ".sh", ".yml"];

// Loose on purpose: a malformed anchor must be caught, not skipped as unknown.
const ANCHOR = /§[A-Za-z][A-Za-z0-9-]*[*<[({\\/"']?/gu;
const BARE_SECTION = /§\d+(?:\.\d+)*/gu;
const COINED = /\b[A-Z]{1,4}\d+(?:\.\d+)+\b/gu;
// A line that says this is showing the notation, not using it. Greppable on
// purpose: a silent exemption is how a gate stops meaning anything.
const SUPPRESS = "mo-vocabulary-ok";
const SUPPRESS_FILE = `${SUPPRESS} file`;

/**
 * What kind of citation a token is, and how sure we are about it.
 *
 * §A-MEMORY-01 owns `§A-*` and `§B-*`: their grammar is decided, so a citation
 * that does not resolve is a defect rather than an opinion. A bare `§9.1` names
 * no document at all and cannot resolve by construction. A coined work-item
 * number might be anything, which is exactly why it is a warning.
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
function citationsOf(text, startLine) {
  const found = [];
  for (const pattern of [ANCHOR, BARE_SECTION, COINED]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      // The character that follows an anchor is not part of it. It is kept by
      // the pattern only long enough to answer one question: is this a citation
      // or the notation itself?
      const body = match[0].replace(/[*<[({\\/"']$/u, "");
      if (body !== match[0] && body.endsWith("-")) continue;
      found.push({ token: body, line: startLine });
    }
  }
  return found;
}

/**
 * The tokens a document introduces rather than cites.
 *
 * §A-MEMORY-01 needs a place a reader can land on. A definition is a position,
 * not a word: a heading that opens with the token, a table row keyed by it, or
 * a list item that leads with it. Prose mentioning the token in the middle of a
 * sentence is a citation no matter how explanatory it sounds, because a reader
 * looking it up has nowhere to land.
 */
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
 * A numbered heading defines the section people cite as `§5.10`.
 *
 * The check is corpus-wide rather than per document: "no document anywhere has
 * this section" is the signal worth having, and it is a warning either way.
 */
function numberedSection(heading) {
  const numbered = /^(\d+(?:\.\d+)*)\.?(?:\s|$)/u.exec(heading.trim());
  return numbered === null ? null : `§${numbered[1]}`;
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
 * sentence is a citation no matter how explanatory it sounds.
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
    const section = opener === "heading_open" ? numberedSection(token.content) : null;
    if (section !== null) defined.add(section);
  }
  return defined;
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

/** §A-MEMORY-01 counts a citation in a comment: it cites just as loudly. */
export function citedInSource(text) {
  const lines = text.split("\n");
  return lines.flatMap((line, index) =>
    suppressed(lines, index) ? [] : citationsOf(line, index + 1),
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
export function leadingHeader(text) {
  const kept = [];
  let closing = null;
  for (const line of String(text).split("\n")) {
    const trimmed = line.trim();
    if (closing !== null) {
      kept.push(line);
      if (trimmed.endsWith(closing)) closing = null;
      continue;
    }
    const opened = openedBlock(trimmed, kept);
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
function openedBlock(trimmed, kept) {
  if (trimmed === "" || trimmed.startsWith("#!") || trimmed.startsWith("//")) return null;
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
export function deliberateFixture(text) {
  return leadingHeader(text).includes(SUPPRESS_FILE);
}

/**
 * Report every token the corpus cites and never introduces.
 *
 * §A-MEMORY-01 needs one answer per token rather than one per mention: a term
 * used forty times is one missing definition, and forty findings would bury it.
 */
export function vocabularyFindings({ files, read, layers = DEFAULT_LAYERS, minMentions = 2 }) {
  const defined = new Set();
  const mentions = new Map();
  for (const path of files) {
    const text = read(path);
    if (deliberateFixture(text)) continue;
    const markdown = path.endsWith(".md");
    if (markdown) for (const token of definedTokens(text)) defined.add(token);
    for (const { token, line } of markdown ? citedTokens(text) : citedInSource(text)) {
      const entry = mentions.get(token) ?? { count: 0, first: `${path}:${line}` };
      entry.count += 1;
      mentions.set(token, entry);
    }
  }
  const findings = [];
  for (const [token, entry] of mentions) {
    if (defined.has(token)) continue;
    const { kind, severity } = classify(token, layers);
    if (severity === "none") continue;
    if (severity === "warning" && entry.count < minMentions) continue;
    findings.push({ severity, kind, token, mentions: entry.count, first: entry.first });
  }
  findings.sort(
    (left, right) =>
      Number(left.severity === "warning") - Number(right.severity === "warning") ||
      right.mentions - left.mentions ||
      left.token.localeCompare(right.token),
  );
  return findings;
}

/** §A-MEMORY-01 reports one line per finding, plus the summary a gate reads. */
export function vocabularyReport(findings) {
  const errors = findings.filter(({ severity }) => severity === "error").length;
  const warnings = findings.length - errors;
  const lines = findings.map(
    (finding) =>
      `${finding.severity} ${finding.kind} ${finding.token} mentions=${finding.mentions} first=${finding.first}`,
  );
  const status = errors > 0 ? "violations" : "ok";
  lines.push(`MO-VOCABULARY/1 status=${status} errors=${errors} warnings=${warnings}`);
  return { status, errors, warnings, text: `${lines.join("\n")}\n` };
}

/** §A-MEMORY-01 reads tracked files only: an untracked draft is nobody's contract yet. */
export function trackedFiles(root) {
  const listed = spawnSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  if (listed.status !== 0) throw new Error(`git ls-files failed in ${root}`);
  return listed.stdout
    .split("\0")
    .filter(Boolean)
    .filter((path) => SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)));
}

function parseArguments(argv) {
  const options = { root: process.cwd(), strict: false, minMentions: 2, layers: DEFAULT_LAYERS };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--strict") options.strict = true;
    else if (flag === "--root") options.root = argv[(index += 1)];
    else if (flag === "--min-mentions") options.minMentions = Number(argv[(index += 1)]);
    else if (flag === "--layers") options.layers = argv[(index += 1)].split(",");
    else if (flag === "--exclude") (options.exclude ??= []).push(argv[(index += 1)]);
    else throw new Error(`unknown flag "${flag}"`);
  }
  if (options.root === undefined) throw new Error("--root requires a path");
  return options;
}

function main(argv) {
  const options = parseArguments(argv);
  const root = resolve(options.root);
  const excluded = (options.exclude ?? []).map((prefix) => prefix.replace(/\/$/u, ""));
  const files = trackedFiles(root).filter(
    (path) => !excluded.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)),
  );
  const findings = vocabularyFindings({
    files,
    read: (path) => readFileSync(join(root, path), "utf8"),
    layers: options.layers,
    minMentions: options.minMentions,
  });
  const report = vocabularyReport(findings);
  process.stdout.write(report.text);
  if (report.errors > 0) return 1;
  return options.strict && report.warnings > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
