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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PATH = "docs/backlog.md";
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

const INTRO = [
  "Здесь находится временная записная книжка только активной feature branch. Подтверждённая работа вне scope живёт в project или upstream Issues, а не здесь.",
  "Каждая временная запись — раздел третьего уровня с полями Причина., Практическое влияние. и Следующий шаг.. Перед завершением lifecycle каждая запись получает disposition, после чего раздел открытых записей снова пуст.",
];

/** §A-BACKLOG-01 keeps the diagnostic path stable and safe to embed in one line. */
export function asciiJson(value) {
  return JSON.stringify(value).replace(
    /[\u0080-\uffff]/gu,
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

/**
 * §A-BACKLOG-01 owns the one backlog schema used by both closure and tests.
 * Nodes after `Открыто` are deliberately NOT-EMPTY, even when they are not H3.
 */
export function inspectBacklog(source) {
  let tree;
  try {
    tree = fromMarkdown(source);
  } catch {
    return { kind: "unknown", reason: "schema_invalid" };
  }
  const children = tree.children;
  const h1 = children.filter((node) => node.type === "heading" && node.depth === 1);
  const open = children.filter(
    (node) => node.type === "heading" && node.depth === 2 && normalizedText(node) === "Открыто",
  );
  const openIndex = children.indexOf(open[0]);
  const before = children.slice(0, openIndex);
  const intro = before.filter((node) => node.type === "paragraph").map(normalizedText);
  const invalidHeading = before.some(
    (node) => node.type === "heading" && !(node.depth === 1 && normalizedText(node) === "Бэклог"),
  );
  if (
    h1.length !== 1 ||
    normalizedText(h1[0]) !== "Бэклог" ||
    open.length !== 1 ||
    openIndex < 0 ||
    children[0] !== h1[0] ||
    invalidHeading ||
    JSON.stringify(intro) !== JSON.stringify(INTRO)
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
export function backlogEntries(source) {
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
    entries.push({ title: normalizedText(node), body: body.join("\n") });
  }
  return entries;
}

/** §A-BACKLOG-01 runs Git without a shell so candidate and path bytes cannot become commands. */
function git(root, args, encoding = "utf8") {
  return spawnSync("git", ["-C", root, ...args], { encoding, maxBuffer: 16 * 1024 * 1024 });
}

function worktreeState(root) {
  const status = git(root, ["status", "--porcelain=v1"]);
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
  const outside = normalized !== path || normalized.startsWith("../") || normalized.startsWith("/");
  return outside ? { reason: "path_outside_repository", path: normalized } : { path: normalized };
}

function headSnapshot(root) {
  const result = git(root, ["rev-parse", "--verify", "HEAD"]);
  if (result.error?.code === "ENOENT") return { reason: "command_unavailable" };
  if (result.status !== 0) return { reason: "not_git_repository" };
  const sha = result.stdout.trim();
  return /^[a-f0-9]{40}$/u.test(sha) ? { sha } : { reason: "git_head_unreadable" };
}

function committedSource(root, path) {
  const row = git(root, ["ls-tree", "HEAD", "--", path]);
  if (row.status !== 0) return { reason: "unreadable_file" };
  const match = row.stdout.match(/^(\d{6})\s+(\w+)\s+[a-f0-9]{40}\t/u);
  if (!match) return { reason: "missing_file" };
  if (match[1] !== "100644" || match[2] !== "blob") return { reason: "not_regular_file" };
  const blob = git(root, ["show", `HEAD:${path}`], null);
  if (blob.status !== 0 || !Buffer.isBuffer(blob.stdout)) return { reason: "unreadable_file" };
  try {
    return { source: new TextDecoder("utf-8", { fatal: true }).decode(blob.stdout) };
  } catch {
    return { reason: "invalid_utf8" };
  }
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

/** §A-BACKLOG-01 proves one immutable committed backlog snapshot and no checkout bytes. */
export function evaluate({ root = ROOT, path = DEFAULT_PATH, candidate = null } = {}) {
  const worktree = worktreeState(root);
  const declared = declaredPath(path);
  if (declared.reason) return unknown(declared.reason, null, worktree, declared.path);
  const normalized = declared.path;
  const before = headSnapshot(root);
  if (before.reason) return unknown(before.reason, null, "unknown", normalized);
  const { sha } = before;
  if (candidate !== null && candidate !== sha)
    return unknown("candidate_mismatch", sha, worktree, normalized);
  const dirty = git(root, ["status", "--porcelain=v1", "--", normalized]);
  if (dirty.status !== 0) return unknown("unreadable_file", sha, worktree, normalized);
  if (dirty.stdout.trim() !== "") return unknown("backlog_path_dirty", sha, worktree, normalized);
  const committed = committedSource(root, normalized);
  if (committed.reason) return unknown(committed.reason, sha, worktree, normalized);
  const inspected = inspectBacklog(committed.source);
  const after = git(root, ["rev-parse", "--verify", "HEAD"]);
  if (after.status !== 0 || after.stdout.trim() !== sha) {
    return unknown("snapshot_changed", sha, worktree, normalized);
  }
  return settledResult(inspected, sha, worktree, normalized);
}

function main() {
  const args = process.argv.slice(2);
  let candidate = null;
  if (args.length > 0) {
    if (args.length !== 2 || args[0] !== "--candidate" || !/^[a-f0-9]{40}$/u.test(args[1])) {
      const result = unknown("path_ambiguous", null, worktreeState(ROOT), DEFAULT_PATH);
      process.stderr.write(`${result.line}\n`);
      process.exitCode = 2;
      return;
    }
    candidate = args[1];
  }
  const result = evaluate({ candidate });
  const stream = result.status === "PASS" ? process.stdout : process.stderr;
  stream.write(`${result.line}\n`);
  if (result.status !== "PASS") process.exitCode = result.status === "NOT_EMPTY" ? 1 : 2;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
