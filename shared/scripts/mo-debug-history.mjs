/**
 * Attribute a skill text an old session loaded to the commits that shipped it.
 *
 * The installed skill today says nothing about what a session saw last month,
 * so attribution reads only committed history: the `metadata.source_tree`
 * stamp when the session shows it, otherwise a byte-exact body comparison.
 * The walk is bounded and reports `partial` instead of silently stopping, and
 * it never touches the checkout — every byte comes from Git objects.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

import { spawnSync } from "node:child_process";

import { SKILL_NAME, claudeBody, metadataSourceTree, splitFrontmatter } from "./mo-debug-text.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const SHORT = 12;

function git(repo, args, input) {
  return spawnSync("git", ["-C", repo, ...args], {
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
}

/**
 * §A-DIAGNOSTICS-01 opens a Meta-O checkout as read-only attribution history.
 *
 * @param {string} repo path of a Git checkout of Meta-O
 * @param {number} maxHistory most commits to inspect per skill
 * @returns {{repo: string, head: string, maxHistory: number, cache: Map} | null}
 *   null when the path is not a readable repository with a HEAD commit
 */
export function openHistory(repo, maxHistory) {
  const head = git(repo, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  const sha = head.status === 0 ? head.stdout.toString("utf8").trim() : "";
  if (!SHA.test(sha)) return null;
  return { repo, head: sha, maxHistory, cache: new Map() };
}

/** `git cat-file --batch` output: `<oid> <type> <size>\n<bytes>\n` per object. */
function parseBatch(buffer) {
  const objects = new Map();
  let at = 0;
  while (at < buffer.length) {
    const end = buffer.indexOf(10, at);
    if (end === -1) break;
    const [oid, type, size] = buffer.subarray(at, end).toString("utf8").split(" ");
    if (type === undefined || size === undefined) {
      at = end + 1;
      continue;
    }
    const length = Number(size);
    objects.set(oid, buffer.subarray(end + 1, end + 1 + length).toString("utf8"));
    at = end + 1 + length + 1;
  }
  return objects;
}

/**
 * The committed SKILL.md of one skill at every commit that changed it, newest
 * first. `rev-list` names the commits; two `cat-file` batches read the blobs,
 * so the walk costs three processes however long the history is.
 */
function skillHistory(history, name) {
  if (history.cache.has(name)) return history.cache.get(name);
  const path = `skills/${name}/SKILL.md`;
  const listed = git(history.repo, [
    "rev-list",
    `--max-count=${history.maxHistory + 1}`,
    history.head,
    "--",
    path,
  ]);
  const shas =
    listed.status === 0 ? listed.stdout.toString("utf8").split("\n").filter(Boolean) : [];
  const partial = shas.length > history.maxHistory;
  const walked = shas.slice(0, history.maxHistory);
  const checked = git(
    history.repo,
    ["cat-file", "--batch-check"],
    walked.map((sha) => `${sha}:${path}\n`).join(""),
  );
  const oids = checked.stdout
    .toString("utf8")
    .split("\n")
    .slice(0, walked.length)
    .map((line) => (/^([0-9a-f]{40}) blob /u.exec(line) ?? [])[1] ?? null);
  const unique = [...new Set(oids.filter(Boolean))];
  const blobs =
    unique.length === 0
      ? new Map()
      : parseBatch(git(history.repo, ["cat-file", "--batch"], `${unique.join("\n")}\n`).stdout);
  const entries = walked
    .map((sha, index) => ({ sha, text: blobs.get(oids[index]) ?? null }))
    .filter((entry) => entry.text !== null);
  const result = { entries, partial, failed: listed.status !== 0 };
  history.cache.set(name, result);
  return result;
}

function range(matches) {
  if (matches.length === 0) return "none";
  // `rev-list` is newest first; the range reads oldest..newest.
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

/**
 * §A-DIAGNOSTICS-01 attributes one loaded skill text to a version.
 *
 * A visible stamp wins; without one, only a complete text is compared, and
 * only byte for byte with the same normalization the harness applied. With no
 * history the answer names the stamp but never guesses commits.
 *
 * @param {{name: string, sourceTree: string|null, complete: boolean,
 *   comparison: "file"|"claude_body", candidates: string[]}} load loaded text
 * @param {object|null} history value from `openHistory`, or null
 * @returns {{version: string, commits: string, history: string}} typed fields
 */
export function attribute(load, history) {
  const stamped = typeof load.sourceTree === "string" && SHA.test(load.sourceTree);
  const comparable = load.complete && load.candidates.length > 0;
  if (!SKILL_NAME.test(load.name) || (!stamped && !comparable)) {
    return { version: "unknown", commits: "unknown", history: history ? "unused" : "none" };
  }
  if (history === null) {
    return stamped
      ? { version: `source_tree:${load.sourceTree}`, commits: "unknown", history: "none" }
      : { version: "unknown", commits: "unknown", history: "none" };
  }
  const walked = skillHistory(history, load.name);
  const state = walkState(walked);
  if (stamped) {
    const matches = walked.entries.filter((entry) => stampOf(entry.text) === load.sourceTree);
    return { version: `source_tree:${load.sourceTree}`, commits: range(matches), history: state };
  }
  const matches = walked.entries.filter((entry) => bodyMatches(load, entry));
  return matches.length > 0
    ? { version: "body_match", commits: range(matches), history: state }
    : { version: "unknown", commits: "none", history: state };
}
