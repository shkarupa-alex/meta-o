#!/usr/bin/env node
/**
 * Check the current tree of a project's knowledge layer: ids, links, headings.
 *
 * §A-MEMORY-05 makes the knowledge layer a capability a project declares
 * rather than a convention it re-implements. Every adopting project needed the
 * same graph core — one H1 per document, links whose label names the document
 * they open, identifiers defined once in the right layer and cited only when
 * defined, decisions that name their business reason — and each wrote it by
 * hand with its own gaps. This module is that core, portable: it reads the
 * tracked tree through `git ls-files`, parses every declared document into one
 * real Markdown AST and answers with one typed line a gate can read.
 *
 * It is exhaustive on purpose. Every tracked Markdown file under a declared
 * first-party root is either checked or excluded by exact path, and the
 * exclusion is echoed, so a gate can never pass by not looking. An unreadable
 * document is `unknown`, and a scope with no definitions at all is a violation:
 * a vacuous gate must not read as a pass.
 *
 * Project-local rules — code purpose comments, the acceptance map, glossary
 * agreement, foreign notations — stay with the project and are not checked.
 *
 * Implements §A-MEMORY-05.
 */

import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, TextDecoder } from "node:util";

import { CITATION, HEADING_ID, parseDocument } from "./knowledge-documents.mjs";

const LIMIT = 50;
const MARKDOWN = /\.md$/iu;
const SCHEME = /^[a-z][a-z0-9+.-]*:/iu;
// The same exemption `mo-vocabulary` honours, so one declaration covers both
// gates: the marker exempts its own line and the next one, and the file form
// counts only inside the opening declaration block.
const SUPPRESS = "mo-vocabulary-ok";
const SUPPRESS_FILE = `${SUPPRESS} file`;

const USAGE = `usage: mo-knowledge.mjs check [--repo <git-root>] --business <path>
         --architecture <dir> --docs <path> [--docs <path> ...]
         --first-party-root <dir> [--first-party-root <dir> ...]
         [--exclude <tracked-path> ...]
       mo-knowledge.mjs --help

  --repo <git-root>          repository to check (default: Git root of the cwd)
  --business <path>          business document; the only home of §B-* ids
  --architecture <dir>       decision directory; the only home of §A-* ids
  --docs <path>              declared knowledge: a tracked .md file or a
                             directory of them (repeatable)
  --first-party-root <dir>   every tracked .md under it must be declared or
                             excluded (repeatable; "." is the whole repository)
  --exclude <tracked-path>   exact tracked file left out of the check, echoed
                             in the output (repeatable; no wildcards)
  --help                     print this grammar and exit

Paths other than --repo are relative to the Git root.

output: MO-KNOWLEDGE/1 status=<ok|violations|unknown> files=<n> definitions=<n> uncovered=<n>
exit: 0 ok | 1 violations | 2 unknown or call error
`;

function jsonString(value) {
  // JSON escapes line breaks; the Unicode line separators it leaves alone would
  // still split one diagnostic into two for a line-oriented reader.
  return JSON.stringify(String(value)).replace(
    /[\u0080-\u009f\u2028\u2029]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function callError(message) {
  return { status: "call_error", message };
}

function plainText(node) {
  if (typeof node.value === "string") return node.value;
  // A hard break carries no text of its own; without a separator the words on
  // either side of it would be glued and a correct link label rejected.
  if (node.type === "break") return "\n";
  return (node.children ?? []).map(plainText).join("");
}

function normalized(value) {
  return value.normalize("NFC").toLowerCase().replaceAll(/\s+/gu, " ").trim();
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/** The opening declaration block, ported from `mo-vocabulary` for Markdown. */
function leadingHeader(source) {
  const kept = [];
  let closing = null;
  for (const line of source.split("\n")) {
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

function normalizedPath(value) {
  const path = posix.normalize(String(value).replaceAll(/\/+$/gu, "") || ".");
  if (posix.isAbsolute(path) || path === ".." || path.startsWith("../")) return null;
  return path;
}

function under(dir, path) {
  return dir === "." || path.startsWith(`${dir}/`);
}

/** Classify the tracked tree into declared, excluded and uncovered documents. */
function classify(tracked, options) {
  const files = new Set(tracked);
  const markdown = [...files].filter((path) => MARKDOWN.test(path)).sort();
  const isDirectory = (dir) => !files.has(dir) && [...files].some((path) => under(dir, path));
  const excludes = new Set();
  for (const raw of options.excludes ?? []) {
    const path = normalizedPath(raw);
    if (path === null || !files.has(path))
      return callError(`--exclude ${raw} is not a tracked file`);
    excludes.add(path);
  }
  const declared = new Set();
  const declareFile = (flag, raw) => {
    const path = normalizedPath(raw);
    if (path === null || !files.has(path) || !MARKDOWN.test(path))
      return `${flag} ${raw} is not a tracked Markdown file`;
    if (excludes.has(path)) return `${flag} ${raw} is both declared and excluded`;
    declared.add(path);
    return null;
  };
  const declareAny = (flag, raw, directoryOnly = false) => {
    const path = normalizedPath(raw);
    if (path !== null && isDirectory(path)) {
      for (const file of markdown) if (under(path, file) && !excludes.has(file)) declared.add(file);
      return null;
    }
    return directoryOnly ? `${flag} ${raw} is not a tracked directory` : declareFile(flag, raw);
  };
  const problems = [
    declareFile("--business", options.business),
    declareAny("--architecture", options.architecture, true),
    ...(options.docs ?? []).map((raw) => declareAny("--docs", raw)),
  ].filter(Boolean);
  if (problems.length > 0) return callError(problems[0]);
  const roots = [];
  for (const raw of options.firstPartyRoots ?? []) {
    const path = normalizedPath(raw);
    if (path === null || !(path === "." ? files.size > 0 : isDirectory(path)))
      return callError(`--first-party-root ${raw} is not a tracked directory`);
    roots.push(path);
  }
  const uncovered = markdown.filter(
    (path) => roots.some((root) => under(root, path)) && !declared.has(path) && !excludes.has(path),
  );
  return {
    status: "planned",
    declared: [...declared].sort(),
    excluded: [...excludes].sort(),
    uncovered,
    business: normalizedPath(options.business),
    architecture: normalizedPath(options.architecture),
  };
}

function listTracked(root) {
  const result = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (result.error || result.status !== 0) {
    return { error: (result.error?.message ?? result.stderr ?? "").trim() || "git failed" };
  }
  return { tracked: result.stdout.split("\0").filter(Boolean) };
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * The bytes of one tracked document, and only if they live in the repository.
 *
 * A tracked symlink, or a path through a symlinked directory, points at bytes
 * the commit does not hold: they can sit outside the repository and change
 * after the check, and a definition read from them would certify knowledge
 * the project never versioned. Such a path is unreadable rather than followed.
 */
function readSource(root, path) {
  const absolute = posix.join(root, path);
  try {
    const entry = lstatSync(absolute);
    if (entry.isSymbolicLink()) return { error: "symlink" };
    if (!entry.isFile()) return { error: "not_regular_file" };
    if (realpathSync(absolute) !== posix.join(realpathSync(root), path)) {
      return { error: "outside_repository" };
    }
    return { source: decoder.decode(readFileSync(absolute)) };
  } catch (error) {
    return { error: error.code ?? (error instanceof TypeError ? "invalid_utf8" : error.message) };
  }
}

/** Definitions with their line and section, mirroring `knowledge-documents`. */
function definitionsIn(tree) {
  const found = [];
  const visit = (node) => {
    const children = node.children ?? [];
    children.forEach((child, index) => {
      const match = child.type === "heading" ? plainText(child).trim().match(HEADING_ID) : null;
      if (match) {
        let end = index + 1;
        while (
          end < children.length &&
          !(children[end].type === "heading" && children[end].depth <= child.depth)
        ) {
          end += 1;
        }
        const section = children.slice(index, end);
        found.push({ id: match[0], kind: match[1], line: child.position.start.line, section });
      }
      visit(child);
    });
  };
  visit(tree);
  return found;
}

/** Citations in ordinary prose; fenced code is a record, not a citation. */
function citationsIn(nodes, suppressed) {
  const found = [];
  const visit = (node) => {
    if (node.type === "code") return;
    if (typeof node.value === "string" && node.position) {
      for (const match of node.value.matchAll(CITATION)) {
        const before = node.value.slice(0, match.index);
        const line = node.position.start.line + (before.match(/\n/gu)?.length ?? 0);
        if (!suppressed(line)) found.push({ id: match[0], line });
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  nodes.forEach(visit);
  return found;
}

function linksIn(tree) {
  const targets = new Map();
  walk(tree, (node) => {
    if (node.type === "definition") targets.set(node.identifier, node.url);
  });
  const links = [];
  walk(tree, (node) => {
    const url =
      node.type === "link"
        ? node.url
        : node.type === "linkReference"
          ? targets.get(node.identifier)
          : undefined;
    if (url === undefined) return;
    links.push({ url, label: plainText(node), line: node.position.start.line });
  });
  return links;
}

function analyze(path, source) {
  const tree = parseDocument(source);
  const lines = source.split("\n");
  const fileExempt = leadingHeader(source).includes(SUPPRESS_FILE);
  const suppressed = (line) =>
    fileExempt ||
    (lines[line - 1] ?? "").includes(SUPPRESS) ||
    (lines[line - 2] ?? "").includes(SUPPRESS);
  const h1 = [];
  walk(tree, (node) => {
    if (node.type === "heading" && node.depth === 1) h1.push(node);
  });
  // A decision's business reason is read from its whole section: the exemption
  // exists to keep examples from failing resolution, not to hide a reason.
  const definitions = definitionsIn(tree).map((definition) => ({
    ...definition,
    cited: citationsIn(definition.section, () => false),
  }));
  const definitionLines = new Set(definitions.map(({ id, line }) => `${id}:${line}`));
  const citations = citationsIn([tree], suppressed).filter(
    ({ id, line }) => !definitionLines.has(`${id}:${line}`),
  );
  return { path, h1, definitions, citations, links: linksIn(tree) };
}

/** Resolve a relative Markdown link to a repository path, or `null` to skip it. */
function linkTarget(from, url) {
  if (url === "" || url.startsWith("#") || url.startsWith("//") || SCHEME.test(url)) return null;
  const bare = url.replace(/[?#].*$/su, "");
  let decoded;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    return { broken: true, target: bare };
  }
  if (!MARKDOWN.test(decoded)) return null;
  const joined = decoded.startsWith("/")
    ? posix.normalize(decoded.slice(1))
    : posix.join(posix.dirname(from), decoded);
  const target = normalizedPath(joined);
  return target === null ? { broken: true, target: decoded } : { target };
}

function linkViolations(doc, context) {
  const found = [];
  for (const link of doc.links) {
    const resolved = linkTarget(doc.path, link.url);
    if (resolved === null) continue;
    const at = { path: doc.path, line: link.line, target: resolved.target };
    if (resolved.broken || !context.files.has(resolved.target)) {
      found.push({ reason: "broken_link", ...at });
      continue;
    }
    const titles = context.titleOf(resolved.target);
    if (titles === null) continue;
    const label = normalized(link.label);
    if (titles.length !== 1 || !label.includes(normalized(plainText(titles[0])))) {
      found.push({ reason: "link_label_mismatch", ...at });
    }
  }
  return found;
}

function headingViolations(doc) {
  if (doc.h1.length === 0) return [{ reason: "missing_h1", path: doc.path, line: 1 }];
  return doc.h1
    .slice(1)
    .map((node) => ({ reason: "multiple_h1", path: doc.path, line: node.position.start.line }));
}

function homeOf(plan, kind, path) {
  return kind === "B" ? path === plan.business : under(plan.architecture, path);
}

/** Identifier rules across every declared document; returns the defined set. */
function identifierViolations(docs, plan) {
  const found = [];
  const defined = new Map();
  for (const doc of docs) {
    for (const definition of doc.definitions) {
      const at = { path: doc.path, line: definition.line, id: definition.id };
      if (!homeOf(plan, definition.kind, doc.path)) {
        found.push({ reason: "misplaced_definition", ...at });
        continue;
      }
      if (defined.has(definition.id)) found.push({ reason: "duplicate_id", ...at });
      else defined.set(definition.id, at);
      const business = definition.cited.some(({ id }) => id.startsWith("§B-"));
      if (definition.kind === "A" && !business) {
        found.push({ reason: "decision_without_business_reason", ...at });
      }
    }
  }
  for (const doc of docs) {
    for (const { id, line } of doc.citations) {
      if (!defined.has(id)) found.push({ reason: "unresolved_citation", path: doc.path, line, id });
    }
  }
  if (defined.size === 0) found.push({ reason: "no_definitions", path: plan.business, line: 1 });
  return { found, definitions: defined.size, defined: [...defined.keys()].sort() };
}

function readDocuments(root, paths, unknowns) {
  const docs = [];
  for (const path of paths) {
    const read = readSource(root, path);
    if (read.error) {
      unknowns.push({ reason: "unreadable", detail: `${path}: ${read.error}` });
      continue;
    }
    try {
      docs.push(analyze(path, read.source));
    } catch (error) {
      unknowns.push({ reason: "unparseable", detail: `${path}: ${error.message}` });
    }
  }
  return docs;
}

function titleLookup(root, docs, unknowns) {
  const cache = new Map(docs.map((doc) => [doc.path, doc.h1]));
  return (path) => {
    if (cache.has(path)) return cache.get(path);
    const read = readSource(root, path);
    let titles = null;
    if (read.error) {
      unknowns.push({ reason: "unreadable", detail: `${path}: ${read.error}` });
    } else {
      titles = [];
      walk(parseDocument(read.source), (node) => {
        if (node.type === "heading" && node.depth === 1) titles.push(node);
      });
    }
    cache.set(path, titles);
    return titles;
  };
}

function unknownResult(reason, detail) {
  return {
    status: "unknown",
    files: 0,
    definitions: 0,
    defined: [],
    uncovered: 0,
    excluded: [],
    violations: [],
    unknowns: [{ reason, detail }],
  };
}

function byPosition(left, right) {
  return (
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.reason.localeCompare(right.reason) ||
    (left.id ?? "").localeCompare(right.id ?? "")
  );
}

/**
 * Check one repository's current knowledge tree and return a structured answer.
 *
 * §A-MEMORY-05 keeps this pure of process state: `root` is an already resolved
 * Git root, and `tracked` may be injected by a caller that has listed it.
 * A misdeclared call returns `status: "call_error"` with a message.
 */
export function checkKnowledge({ root, tracked, ...options }) {
  let paths = tracked;
  if (paths === undefined) {
    const listed = listTracked(root);
    if (listed.error) return unknownResult("git_failed", listed.error);
    paths = listed.tracked;
  }
  const plan = classify(paths, options);
  if (plan.status === "call_error") return plan;
  const unknowns = [];
  const docs = readDocuments(root, plan.declared, unknowns);
  const context = { files: new Set(paths), titleOf: titleLookup(root, docs, unknowns) };
  const identifiers = identifierViolations(docs, plan);
  const violations = [
    ...plan.uncovered.map((path) => ({ reason: "unclassified_tracked_file", path, line: 1 })),
    ...docs.flatMap((doc) => [...headingViolations(doc), ...linkViolations(doc, context)]),
    ...identifiers.found,
  ].sort(byPosition);
  const status = unknowns.length > 0 ? "unknown" : violations.length > 0 ? "violations" : "ok";
  return {
    status,
    files: plan.declared.length,
    definitions: identifiers.definitions,
    defined: identifiers.defined,
    uncovered: plan.uncovered.length,
    excluded: plan.excluded,
    violations,
    unknowns,
  };
}

/** §A-MEMORY-05 renders the one typed status line a gate reads first. */
export function knowledgeLine(result) {
  return (
    `MO-KNOWLEDGE/1 status=${result.status} files=${result.files} ` +
    `definitions=${result.definitions} uncovered=${result.uncovered}`
  );
}

function violationLine({ reason, path, line, id, target }) {
  let text = `violation reason=${reason} path=${jsonString(path)} line=${line}`;
  if (id !== undefined) text += ` id=${id}`;
  if (target !== undefined) text += ` target=${jsonString(target)}`;
  return text;
}

/** §A-MEMORY-05 renders the whole bounded report: status, exclusions, diagnostics. */
export function knowledgeReport(result) {
  const diagnostics = [
    ...(result.unknowns ?? []).map(
      ({ reason, detail }) => `unknown reason=${reason} detail=${jsonString(detail)}`,
    ),
    ...result.violations.map(violationLine),
  ];
  const lines = [
    knowledgeLine(result),
    ...result.excluded.map((path) => `excluded path=${jsonString(path)}`),
    ...diagnostics.slice(0, LIMIT),
  ];
  if (diagnostics.length > LIMIT) lines.push(`truncated more=${diagnostics.length - LIMIT}`);
  return `${lines.join("\n")}\n`;
}

/** §A-MEMORY-05 finds the Git root the check runs against, or `null` outside Git. */
export function resolveRoot(repo, cwd = process.cwd()) {
  const result = spawnSync("git", ["-C", repo ?? cwd, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.replace(/\n$/u, "");
}

function parseArguments(argv) {
  const multiple = { type: "string", multiple: true };
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      repo: multiple,
      business: multiple,
      architecture: multiple,
      docs: multiple,
      "first-party-root": multiple,
      exclude: multiple,
      help: { type: "boolean" },
    },
  });
  if (values.help) return { help: true };
  if (positionals.length !== 1 || positionals[0] !== "check") {
    throw new Error("expected exactly one command: check");
  }
  for (const single of ["repo", "business", "architecture"]) {
    if ((values[single]?.length ?? 0) > 1) throw new Error(`--${single} given more than once`);
  }
  for (const required of ["business", "architecture", "docs", "first-party-root"]) {
    if (!values[required]) throw new Error(`--${required} is required`);
  }
  return {
    repo: values.repo?.[0],
    business: values.business[0],
    architecture: values.architecture[0],
    docs: values.docs,
    firstPartyRoots: values["first-party-root"],
    excludes: values.exclude ?? [],
  };
}

function main(argv) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  const root = resolveRoot(options.repo);
  const result =
    root === null
      ? unknownResult("not_git_repository", options.repo ?? process.cwd())
      : checkKnowledge({ root, ...options });
  if (result.status === "call_error") {
    process.stderr.write(`error: ${result.message}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(knowledgeReport(result));
  process.exitCode = { ok: 0, violations: 1 }[result.status] ?? 2;
}

function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) main(process.argv.slice(2));
