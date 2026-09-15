#!/usr/bin/env node
/**
 * Verify stable knowledge identifiers on every Git commit-parent edge.
 *
 * A merge-base diff cannot see a deletion on one side of a merge, and checkout
 * mutation would make the quality gate alter the tree it judges. This checker
 * therefore reads every historical Markdown blob through Git and parses headings
 * with mdast. It creates no baseline or state file.
 *
 * No Markdown linter, ESLint plugin or hook reads earlier commits: they judge
 * the working tree. The subject here is the commit graph itself — one deletion
 * per parent edge, one authorization trailer per commit, one citation per tree
 * — so there is nothing a mature tool's configuration could be pointed at.
 *
 * Implements §A-MEMORY-01.
 */

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";
import yaml from "js-yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ID = /^§([AB])-[A-Z][A-Z0-9-]*-\d{2}(?=\s|$)/;
const CITATION = /§[AB]-[A-Z][A-Z0-9-]*-\d{2}/gu;

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

function authorizationRecords(markdown, architectureId) {
  const children = fromMarkdown(markdown).children;
  const start = children.findIndex(
    (node) => node.type === "heading" && text(node).trim().startsWith(architectureId),
  );
  if (start < 0) return [];
  const depth = children[start].depth;
  const section = children.slice(
    start + 1,
    children.findIndex(
      (node, index) => index > start && node.type === "heading" && node.depth <= depth,
    ) === -1
      ? children.length
      : children.findIndex(
          (node, index) => index > start && node.type === "heading" && node.depth <= depth,
        ),
  );
  const block = section.find((node) => node.type === "code" && node.lang === "yaml");
  if (!block) return [];
  const parsed = yaml.load(block.value);
  const records = parsed?.knowledge_id_changes ?? [parsed?.knowledge_id_change].filter(Boolean);
  return Array.isArray(records) ? records : [];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function authorized(root, parent, commit, action, id, previous, current, enforceCurrentRecord) {
  const match = trailers(root, commit).find((entry) => entry.action === action && entry.id === id);
  if (!match || !/^§A-[A-Z][A-Z0-9-]*-\d{2}$/.test(match.via)) return false;
  const owner = current.get(match.via);
  if (!owner || owner.kind !== "A") return false;
  const decision = git(root, ["show", `${commit}:${owner.path}`]);
  const priorOwner = previous.get(match.via);
  const priorRecords = priorOwner
    ? authorizationRecords(git(root, ["show", `${parent}:${priorOwner.path}`]), match.via)
    : [];
  const priorFingerprints = new Set(
    priorRecords.map((record) => JSON.stringify(stableValue(record))),
  );
  // A historical record may explain only its own parent edge. Requiring a
  // distinct current record prevents one old non-empty boundary from
  // authorizing every later semantic reuse at this trust boundary.
  const record = authorizationRecords(decision, match.via).find(
    (candidate) =>
      candidate?.action === action &&
      candidate?.id === id &&
      (!enforceCurrentRecord || !priorFingerprints.has(JSON.stringify(stableValue(candidate)))),
  );
  return (
    record?.action === action &&
    record?.id === id &&
    typeof record.reason === "string" &&
    record.reason.trim().length > 0 &&
    typeof record.new_boundary === "string" &&
    record.new_boundary.trim().length > 0 &&
    record.references_updated === true
  );
}

function prose(node) {
  // Fenced blocks are records and examples, not citations: an authorization
  // record has to name the id it retires, and the trailer grammar shows a
  // placeholder id. Inline code stays in, because an id written as inline code
  // inside a sentence is an ordinary reference.
  if (node.type === "code") return "";
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(prose).join("\n");
}

/** §A-MEMORY-01 collects the knowledge ids one commit's own documents cite. */
export function citations(root, commit) {
  const found = new Map();
  for (const path of knowledgePaths(root, commit)) {
    const cited = prose(fromMarkdown(git(root, ["show", `${commit}:${path}`])));
    for (const [id] of cited.matchAll(CITATION)) {
      found.set(id, (found.get(id) ?? new Set()).add(path));
    }
  }
  return found;
}

/**
 * §A-MEMORY-01 reports every citation a commit cannot resolve in its own tree.
 *
 * A reference is a property of one tree, not of an edge, and checking only the
 * current `HEAD` hides a commit whose dangling id a later commit repaired. The
 * scope is the two knowledge levels themselves, so `references_updated` in an
 * authorization record stops being a self-assertion.
 */
export function referenceViolations(root, commit) {
  const defined = snapshot(root, commit);
  const errors = [];
  for (const [id, paths] of citations(root, commit)) {
    if (!defined.has(id)) {
      errors.push(`${commit}: broken reference ${id} in ${[...paths].sort().join(", ")}`);
    }
  }
  return errors;
}

/**
 * A merge may drop an id only because the other side deleted it. A sibling that
 * simply branched before the id existed never had it to delete, so treating its
 * absence as inheritance would let a merge lose an id in silence.
 */
function deletedOnSibling(root, parent, id, siblingParents) {
  return siblingParents.some((sibling) => {
    if (snapshot(root, sibling).has(id)) return false;
    const base = git(root, ["merge-base", parent, sibling], true)?.trim();
    return Boolean(base) && snapshot(root, base).has(id);
  });
}

/** §A-MEMORY-01 compares one parent edge and reports unauthorized loss or reuse. */
export function edgeViolations(
  root,
  parent,
  commit,
  siblingParents = [],
  enforceSemantic = true,
  enforceCurrentRecord = true,
) {
  const before = snapshot(root, parent);
  const after = snapshot(root, commit);
  const siblings = siblingParents.map((sha) => snapshot(root, sha));
  const errors = [];
  for (const id of before.keys()) {
    if (after.has(id) || deletedOnSibling(root, parent, id, siblingParents)) continue;
    if (!authorized(root, parent, commit, "remove", id, before, after, enforceCurrentRecord)) {
      errors.push(`${parent}..${commit}: silent deletion ${id}`);
    }
  }
  for (const [id, entry] of after) {
    const prior = before.get(id);
    const sameFromSibling = siblings.some((map) => map.get(id)?.semantic === entry.semantic);
    const changed = prior && prior.semantic !== entry.semantic;
    if (
      enforceSemantic &&
      changed &&
      !sameFromSibling &&
      !authorized(root, parent, commit, "reuse", id, before, after, enforceCurrentRecord)
    ) {
      errors.push(`${parent}..${commit}: semantic reuse ${id}`);
    }
  }
  return errors;
}

/**
 * §A-MEMORY-01 verifies the reachable full DAG after an explicit cutoff.
 *
 * Deletion and reference integrity hold from the cutoff. `semanticFrom` is the
 * explicit, auditable commit from which semantic reuse is also enforced: the
 * two edges between the cutoff and the checker's own introduction changed a
 * section body under a rule that did not exist yet, and history is not
 * rewritten to hide that. An absent `semanticFrom` enforces everywhere.
 * `currentRecordFrom` similarly pins the first parent whose outgoing edges
 * require a distinct authorization record rather than the legacy shape check.
 */
export function verifyHistory(root, cutoff, semanticFrom = null, currentRecordFrom = null) {
  if (!git(root, ["rev-parse", "--verify", `${cutoff}^{commit}`], true)) {
    return [`history_unavailable: cutoff ${cutoff} is unreachable`];
  }
  if (semanticFrom && !git(root, ["rev-parse", "--verify", `${semanticFrom}^{commit}`], true)) {
    return [`history_unavailable: semantic boundary ${semanticFrom} is unreachable`];
  }
  if (
    currentRecordFrom &&
    !git(root, ["rev-parse", "--verify", `${currentRecordFrom}^{commit}`], true)
  ) {
    return [`history_unavailable: current-record boundary ${currentRecordFrom} is unreachable`];
  }
  const lines = git(root, ["rev-list", "--topo-order", "--reverse", "--parents", `${cutoff}..HEAD`])
    .trim()
    .split("\n")
    .filter(Boolean);
  const errors = [];
  for (const line of lines) {
    const [commit, ...parents] = line.split(" ");
    errors.push(...referenceViolations(root, commit));
    for (const parent of parents) {
      const enforceSemantic =
        !semanticFrom ||
        git(root, ["merge-base", "--is-ancestor", semanticFrom, parent], true) !== null;
      const enforceCurrentRecord =
        !currentRecordFrom ||
        git(root, ["merge-base", "--is-ancestor", currentRecordFrom, parent], true) !== null;
      errors.push(
        ...edgeViolations(
          root,
          parent,
          commit,
          parents.filter((sha) => sha !== parent),
          enforceSemantic,
          enforceCurrentRecord,
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
    process.stderr.write(
      "usage: knowledge-history.mjs [repository] <cutoff> [semantic-from] [current-record-from]\n",
    );
    process.exitCode = 2;
    return;
  }
  const errors = verifyHistory(root, cutoff, process.argv[4] ?? null, process.argv[5] ?? null);
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
