#!/usr/bin/env node
/**
 * Verify stable knowledge identifiers on every Git commit-parent edge.
 *
 * A merge-base diff cannot see a deletion on one side of a merge, and checkout
 * mutation would make the quality gate alter the tree it judges. This checker
 * therefore reads every historical Markdown blob through Git and parses headings
 * with mdast. It creates no baseline or state file.
 *
 * Implements §A-MEMORY-01.
 */

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ID = /^§([AB])-[A-Z][A-Z0-9]*-\d{2}(?=\s|$)/;

/** §A-MEMORY-01 runs one bounded Git command and returns its exact stdout. */
export function git(root, args, allowMissing = false) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0 && !allowMissing) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.status === 0 ? result.stdout : null;
}

function text(node) {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(text).join("");
}

function semanticNode(node) {
  if (Array.isArray(node)) return node.map(semanticNode);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => key !== "position")
      .map(([key, value]) => [key, semanticNode(value)]),
  );
}

/** §A-MEMORY-01 extracts knowledge definitions from a real Markdown AST. */
export function definitions(markdown, path) {
  const found = new Map();
  const visit = (node) => {
    const children = node.children ?? [];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.type === "heading") {
        const heading = text(child).trim();
        const match = heading.match(ID);
        if (match) {
          const id = match[0];
          if (found.has(id)) throw new Error(`${path}: duplicate ${id}`);
          let end = index + 1;
          while (
            end < children.length &&
            !(children[end].type === "heading" && children[end].depth <= child.depth)
          ) {
            end += 1;
          }
          found.set(id, {
            id,
            kind: match[1],
            heading,
            path,
            semantic: JSON.stringify(semanticNode(children.slice(index, end))),
          });
        }
      }
      visit(child);
    }
  };
  visit(fromMarkdown(markdown));
  return found;
}

function knowledgePaths(root, commit) {
  const output = git(root, [
    "ls-tree",
    "-r",
    "--name-only",
    commit,
    "--",
    "docs/business.md",
    "docs/architecture",
  ]);
  return output.split("\n").filter((path) => path.endsWith(".md"));
}

function snapshot(root, commit) {
  const all = new Map();
  for (const path of knowledgePaths(root, commit)) {
    const blob = git(root, ["show", `${commit}:${path}`]);
    for (const [id, entry] of definitions(blob, path)) {
      if (all.has(id))
        throw new Error(`${commit}: duplicate ${id} in ${all.get(id).path}, ${path}`);
      all.set(id, entry);
    }
  }
  return all;
}

function trailers(root, commit) {
  const body = git(root, ["show", "-s", "--format=%B", commit]);
  return body
    .split("\n")
    .map((line) => line.match(/^Knowledge-ID-Change: (remove|reuse) (\S+) via (\S+)$/))
    .filter(Boolean)
    .map((match) => ({ action: match[1], id: match[2], via: match[3] }));
}

function authorized(root, commit, action, id, current) {
  const match = trailers(root, commit).find((entry) => entry.action === action && entry.id === id);
  if (!match || !/^§A-[A-Z][A-Z0-9]*-\d{2}$/.test(match.via)) return false;
  const owner = current.get(match.via);
  if (!owner || owner.kind !== "A") return false;
  const decision = git(root, ["show", `${commit}:${owner.path}`]);
  return decision.includes(id) && decision.includes(match.via);
}

/** §A-MEMORY-01 compares one parent edge and reports unauthorized loss or reuse. */
export function edgeViolations(root, parent, commit, siblingParents = [], enforceSemantic = true) {
  const before = snapshot(root, parent);
  const after = snapshot(root, commit);
  const siblings = siblingParents.map((sha) => snapshot(root, sha));
  const errors = [];
  for (const id of before.keys()) {
    if (!after.has(id) && !authorized(root, commit, "remove", id, after)) {
      errors.push(`${parent}..${commit}: silent deletion ${id}`);
    }
  }
  for (const [id, entry] of after) {
    const prior = before.get(id);
    const sameFromSibling = siblings.some((map) => map.get(id)?.semantic === entry.semantic);
    const changed = prior && prior.semantic !== entry.semantic;
    if (enforceSemantic && changed && !authorized(root, commit, "reuse", id, after)) {
      errors.push(`${parent}..${commit}: semantic reuse ${id}`);
    }
    if (!prior && !sameFromSibling) continue;
  }
  return errors;
}

/** §A-MEMORY-01 verifies the reachable full DAG after an explicit cutoff. */
export function verifyHistory(root, cutoff) {
  if (!git(root, ["rev-parse", "--verify", `${cutoff}^{commit}`], true)) {
    return [`history_unavailable: cutoff ${cutoff} is unreachable`];
  }
  const lines = git(root, ["rev-list", "--topo-order", "--reverse", "--parents", `${cutoff}..HEAD`])
    .trim()
    .split("\n")
    .filter(Boolean);
  const errors = [];
  const activation = git(
    root,
    [
      "log",
      "--diff-filter=A",
      "--reverse",
      "--format=%H",
      `${cutoff}..HEAD`,
      "--",
      "tools/knowledge-history.mjs",
    ],
    true,
  )
    ?.trim()
    .split("\n")[0];
  for (const line of lines) {
    const [commit, ...parents] = line.split(" ");
    for (const parent of parents) {
      const enforceSemantic =
        !activation ||
        git(root, ["merge-base", "--is-ancestor", activation, parent], true) !== null;
      errors.push(
        ...edgeViolations(
          root,
          parent,
          commit,
          parents.filter((sha) => sha !== parent),
          enforceSemantic,
        ),
      );
    }
  }
  return errors;
}

function main() {
  const root = process.argv[2] ? resolve(process.argv[2]) : ROOT;
  const cutoff = process.argv[3];
  if (!cutoff) {
    process.stderr.write("usage: knowledge-history.mjs [repository] <cutoff>\n");
    process.exitCode = 2;
    return;
  }
  const errors = verifyHistory(root, cutoff);
  if (errors.length > 0) {
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`knowledge history ok from ${cutoff}\n`);
}

function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) main();
