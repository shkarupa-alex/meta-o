#!/usr/bin/env node
/**
 * Prove that the declared feature notebook is empty in one committed candidate.
 *
 * §A-BACKLOG-01 keeps lifecycle closure separate from ordinary mid-feature QC:
 * this reader inspects one Git blob without rewriting the worktree or deciding a
 * disposition for the caller.
 */

import { spawnSync } from "node:child_process";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, posix, resolve } from "node:path";

import { fromMarkdown } from "mdast-util-from-markdown";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REASONS = new Set([
  "not_git_repository",
  "command_unavailable",
  "path_undeclared",
  "path_ambiguous",
  "path_outside_repository",
  "missing_file",
  "not_regular_file",
  "unreadable_file",
  "invalid_utf8",
  "schema_invalid",
  "git_head_unreadable",
  "backlog_path_dirty",
  "snapshot_changed",
  "candidate_mismatch",
  "remote_head_unreadable",
  "internal_error",
]);

/**
 * The notebook schema this project declares for itself.
 *
 * §A-BACKLOG-01 ships the checker to other projects, and their notebook is
 * written in their own language with their own field names. The defaults stay
 * exactly what meta-o had, so a call without schema flags answers byte for byte
 * as before; a foreign project must declare the whole schema rather than inherit
 * half of this one.
 */
export const META_O_SCHEMA = {
  path: "docs/backlog.md",
  title: "Бэклог",
  openHeading: "Открыто",
  intro: [
    "Здесь находится временная записная книжка только активной ветки фичи. Подтверждённая работа вне текущего объёма живёт в Issues проекта или внешнего владельца, а не здесь.",
    "Каждая временная запись — раздел третьего уровня с полями Причина., Практическое влияние. и Следующий шаг.. Перед завершением жизненного цикла для каждой записи определяют исход, после чего раздел открытых записей снова пуст.",
  ],
  entryFields: ["Причина.", "Практическое влияние.", "Следующий шаг."],
};

const USAGE = `usage: mo-backlog.mjs [--candidate <40hex>] [--repo <root>] [schema options]

  --candidate <40hex>    fail unless the observed HEAD is exactly this commit
  --expect-head <sha>    same comparison under the name the gates use
  --remote-head <sha>    fail unless the remote source HEAD is this commit
  --repo <root>          repository to inspect (default: this checkout)
  --path <rel>           notebook path inside the repository
  --title <text>         expected level-one heading
  --open-heading <text>  expected heading of the open section
  --intro <text>         expected introductory paragraph, repeatable in order
  --entry-field <text>   required field label of one entry, repeatable
  --help                 print this grammar and exit

Declaring any schema option requires --path, --title, --open-heading and at
least one --entry-field: a partial schema would check a foreign notebook
against this project's own wording.

exit: 0 empty | 1 not empty | 2 unknown or call error
`;

/** §A-BACKLOG-01 keeps the diagnostic path stable and safe to embed in one line. */
export function asciiJson(value) {
  return JSON.stringify(value).replace(
    /[\u0080-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** §A-BACKLOG-01 extracts visible text from the real Markdown AST. */
function text(node) {
  if (typeof node?.value === "string") return node.value;
  return (node?.children ?? []).map(text).join("");
}

function normalizedText(node) {
  return text(node).replace(/\s+/gu, " ").trim();
}

/** §A-BACKLOG-01 rejects every non-schema node before the open section. */
function isCanonicalPreamble(before, schema) {
  if (before.length !== schema.intro.length + 1) return false;
  const [title, ...paragraphs] = before;
  if (title?.type !== "heading" || title.depth !== 1) return false;
  if (normalizedText(title) !== schema.title) return false;
  return paragraphs.every(
    (node, index) => node?.type === "paragraph" && normalizedText(node) === schema.intro[index],
  );
}

/**
 * §A-BACKLOG-01 owns the one backlog schema used by both closure and tests.
 * Nodes after `Открыто` are deliberately NOT-EMPTY, even when they are not H3.
 */
export function inspectBacklog(source, schema = META_O_SCHEMA) {
  let tree;
  try {
    tree = fromMarkdown(source);
  } catch {
    return { kind: "unknown", reason: "schema_invalid" };
  }
  const children = tree.children;
  const h1 = children.filter((node) => node.type === "heading" && node.depth === 1);
  const open = children.filter(
    (node) =>
      node.type === "heading" && node.depth === 2 && normalizedText(node) === schema.openHeading,
  );
  const openIndex = children.indexOf(open[0]);
  const before = children.slice(0, openIndex);
  if (
    h1.length !== 1 ||
    open.length !== 1 ||
    openIndex < 0 ||
    !isCanonicalPreamble(before, schema)
  ) {
    return { kind: "unknown", reason: "schema_invalid" };
  }
  const content = children.slice(openIndex + 1);
  const entries = content.filter((node) => node.type === "heading" && node.depth === 3).length;
  return content.length === 0
    ? { kind: "empty", entries: 0, contentNodes: 0 }
    : { kind: "not_empty", entries, contentNodes: content.length };
}

/** §A-BACKLOG-01 gives ordinary QC the same AST owner for temporary entry schema. */
export function backlogEntries(source, schema = META_O_SCHEMA) {
  const tree = fromMarkdown(source);
  const entries = [];
  for (let index = 0; index < tree.children.length; index += 1) {
    const node = tree.children[index];
    if (node.type !== "heading" || node.depth !== 3) continue;
    const body = [];
    for (index += 1; index < tree.children.length; index += 1) {
      const child = tree.children[index];
      if (child.type === "heading" && child.depth <= 3) {
        index -= 1;
        break;
      }
      body.push(normalizedText(child));
    }
    const text = body.join("\n");
    entries.push({
      title: normalizedText(node),
      body: text,
      missingFields: schema.entryFields.filter((field) => !text.includes(field)),
    });
  }
  return entries;
}

/** §A-BACKLOG-01 runs Git without a shell so candidate and path bytes cannot become commands. */
function git(root, args, encoding = "utf8") {
  return spawnSync("git", ["-C", root, ...args], { encoding, maxBuffer: 16 * 1024 * 1024 });
}

function worktreeState(root, runGit = git) {
  const status = runGit(root, ["status", "--porcelain=v1"]);
  return status.status === 0 && status.stdout.trim() === "" ? "clean" : "dirty";
}

function unknown(reason, sha, worktree, path) {
  if (!REASONS.has(reason)) reason = "internal_error";
  return {
    status: "UNKNOWN",
    line:
      `MO-BACKLOG-UNKNOWN version=1 reason=${reason} sha=${sha ?? "none"} ` +
      `worktree=${worktree} path=${path === null ? "null" : asciiJson(path)}`,
  };
}

function declaredPath(path) {
  if (typeof path !== "string" || path === "") return { reason: "path_undeclared", path: null };
  const normalized = posix.normalize(path.replaceAll("\\", "/"));
  if (normalized.startsWith("../") || normalized.startsWith("/")) {
    return { reason: "path_outside_repository", path: normalized };
  }
  return normalized === path
    ? { path: normalized }
    : { reason: "path_ambiguous", path: normalized };
}

function headSnapshot(root, runGit = git) {
  const result = runGit(root, ["rev-parse", "--verify", "HEAD"]);
  if (result.error?.code === "ENOENT") return { reason: "command_unavailable" };
  if (result.status !== 0) return { reason: "not_git_repository" };
  const sha = result.stdout.trim();
  return /^[a-f0-9]{40}$/u.test(sha) ? { sha } : { reason: "git_head_unreadable" };
}

function committedSource(root, path, runGit = git) {
  const row = runGit(root, ["ls-tree", "HEAD", "--", path]);
  if (row.status !== 0) return { reason: "unreadable_file" };
  const match = row.stdout.match(/^(\d{6})\s+(\w+)\s+[a-f0-9]{40}\t/u);
  if (!match) return { reason: "missing_file" };
  if (match[1] !== "100644" || match[2] !== "blob") return { reason: "not_regular_file" };
  const blob = runGit(root, ["show", `HEAD:${path}`], null);
  if (blob.status !== 0 || !Buffer.isBuffer(blob.stdout)) return { reason: "unreadable_file" };
  try {
    return { source: new TextDecoder("utf-8", { fatal: true }).decode(blob.stdout) };
  } catch {
    return { reason: "invalid_utf8" };
  }
}

function backlogPathState(root, path, runGit) {
  const result = runGit(root, ["status", "--porcelain=v1", "--", path]);
  if (result.status !== 0) return { reason: "unreadable_file" };
  return result.stdout.trim() === "" ? {} : { reason: "backlog_path_dirty" };
}

function settledResult(inspected, sha, worktree, path) {
  if (inspected.kind === "unknown") return unknown(inspected.reason, sha, worktree, path);
  if (inspected.kind === "not_empty") {
    return {
      status: "NOT_EMPTY",
      line:
        `MO-BACKLOG-NOT-EMPTY version=1 sha=${sha} worktree=${worktree} ` +
        `path=${asciiJson(path)} entries=${inspected.entries} ` +
        `content_nodes=${inspected.contentNodes}`,
    };
  }
  return {
    status: "PASS",
    line:
      `MO-BACKLOG-EMPTY version=1 sha=${sha} worktree=${worktree} ` +
      `path=${asciiJson(path)} entries=0 content_nodes=0`,
  };
}

/**
 * A stable HEAD alone does not freeze checkout bytes, so the exact path probe
 * is repeated after the blob is read: a concurrent edit must not settle closure.
 */
function stillFrozen(root, path, sha, runGit) {
  const after = runGit(root, ["rev-parse", "--verify", "HEAD"]);
  if (after.status !== 0 || after.stdout.trim() !== sha) return "snapshot_changed";
  return backlogPathState(root, path, runGit).reason ?? null;
}

/**
 * The gates bind a merge to the HEAD they actually observed, so a declared
 * remote source HEAD that is not this commit fails the same way a declared
 * candidate does; only the typed reason differs.
 */
function headMismatch(sha, candidate, remoteHead) {
  if (candidate !== null && candidate !== sha) return "candidate_mismatch";
  if (remoteHead !== null && remoteHead !== sha) return "remote_head_unreadable";
  return null;
}

/** §A-BACKLOG-01 proves one immutable committed backlog snapshot and no checkout bytes. */
export function evaluate({
  root = ROOT,
  schema = META_O_SCHEMA,
  path = schema.path,
  candidate = null,
  remoteHead = null,
  runGit = git,
} = {}) {
  const worktree = worktreeState(root, runGit);
  const declared = declaredPath(path);
  if (declared.reason) return unknown(declared.reason, null, worktree, declared.path);
  const normalized = declared.path;
  const before = headSnapshot(root, runGit);
  if (before.reason) return unknown(before.reason, null, "unknown", normalized);
  const { sha } = before;
  const declaredHead = headMismatch(sha, candidate, remoteHead);
  if (declaredHead) return unknown(declaredHead, sha, worktree, normalized);
  const beforePath = backlogPathState(root, normalized, runGit);
  if (beforePath.reason) return unknown(beforePath.reason, sha, worktree, normalized);
  const committed = committedSource(root, normalized, runGit);
  if (committed.reason) return unknown(committed.reason, sha, worktree, normalized);
  const inspected = inspectBacklog(committed.source, schema);
  const moved = stillFrozen(root, normalized, sha, runGit);
  if (moved) return unknown(moved, sha, worktree, normalized);
  return settledResult(inspected, sha, worktree, normalized);
}

const SCHEMA_FLAGS = new Set(["--path", "--title", "--open-heading", "--intro", "--entry-field"]);
const REPEATABLE = new Set(["--intro", "--entry-field"]);
const VALUED = new Set([
  "--candidate",
  "--expect-head",
  "--remote-head",
  "--repo",
  ...SCHEMA_FLAGS,
]);

function collectArguments(args) {
  const given = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--help") return { help: true };
    if (!VALUED.has(flag) || index + 1 >= args.length) return { invalid: true };
    const value = args[(index += 1)];
    if (REPEATABLE.has(flag)) given.set(flag, [...(given.get(flag) ?? []), value]);
    else if (given.has(flag)) return { invalid: true };
    else given.set(flag, value);
  }
  return { given };
}

// Half a schema is worse than none: the missing half falls back to this
// project's own wording and checks a foreign notebook against it.
function schemaComplete(given) {
  return (
    given.has("--path") &&
    given.has("--title") &&
    given.has("--open-heading") &&
    (given.get("--entry-field") ?? []).length > 0
  );
}

function parseArguments(args) {
  const collected = collectArguments(args);
  if (collected.help || collected.invalid) return collected;
  const { given } = collected;
  for (const flag of ["--candidate", "--expect-head", "--remote-head"]) {
    if (given.has(flag) && !/^[a-f0-9]{40}$/u.test(given.get(flag))) return { invalid: true };
  }
  const declared = [...SCHEMA_FLAGS].some((flag) => given.has(flag));
  if (declared && !schemaComplete(given)) return { invalid: true };
  return { given, declared };
}

function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(USAGE);
    return;
  }
  const root = parsed.given?.get("--repo") ?? ROOT;
  if (parsed.invalid) {
    const result = unknown("internal_error", null, worktreeState(root), META_O_SCHEMA.path);
    process.stderr.write(`${result.line}\n`);
    process.exitCode = 2;
    return;
  }
  const { given, declared } = parsed;
  const schema = declared
    ? {
        path: given.get("--path"),
        title: given.get("--title"),
        openHeading: given.get("--open-heading"),
        intro: given.get("--intro") ?? [],
        entryFields: given.get("--entry-field"),
      }
    : META_O_SCHEMA;
  const result = evaluate({
    root,
    schema,
    candidate: given.get("--candidate") ?? given.get("--expect-head") ?? null,
    remoteHead: given.get("--remote-head") ?? null,
  });
  const stream = result.status === "PASS" ? process.stdout : process.stderr;
  stream.write(`${result.line}\n`);
  if (result.status !== "PASS") process.exitCode = result.status === "NOT_EMPTY" ? 1 : 2;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
