/**
 * Attribute a skill text an old session loaded to the commits that shipped it.
 *
 * The installed skill today says nothing about what a session saw last month,
 * so attribution reads only committed history: the `metadata.source_tree`
 * stamp when the session shows it, otherwise a byte-exact body comparison.
 * The walk is bounded and reports `partial` instead of silently stopping, and
 * it never touches the checkout — every byte comes from Git objects. A shallow
 * clone ends its history early, and a Git read that failed says nothing about
 * the commits it did not return, so neither may claim a complete search.
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

// A killed, overflowing (`ENOBUFS`) or failing Git leaves partial stdout that
// parses cleanly, so only a zero exit with no spawn error counts as a read.
function succeeded(result) {
  return result.status === 0 && result.error === undefined;
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
  const sha = succeeded(head) ? head.stdout.toString("utf8").trim() : "";
  if (!SHA.test(sha)) return null;
  // A shallow clone's walk stops at its graft, so its history is partial; an
  // answer other than `false` is treated the same way.
  const probe = git(repo, ["rev-parse", "--is-shallow-repository"]);
  const shallow = !succeeded(probe) || probe.stdout.toString("utf8").trim() !== "false";
  return { repo, head: sha, maxHistory, shallow, cache: new Map() };
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
    // An object cut off by a failed read is not an object.
    if (end + 1 + length > buffer.length) break;
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
  const shas = succeeded(listed) ? listed.stdout.toString("utf8").split("\n").filter(Boolean) : [];
  const partial = shas.length > history.maxHistory || history.shallow;
  const walked = shas.slice(0, history.maxHistory);
  const checked = git(
    history.repo,
    ["cat-file", "--batch-check"],
    walked.map((sha) => `${sha}:${path}\n`).join(""),
  );
  // One answer per commit: a blob, or `missing` where that commit deleted the
  // skill. Anything else, or fewer answers, is a failed read.
  const answers = checked.stdout.toString("utf8").split("\n").slice(0, walked.length);
  const oids = answers.map((line) => (/^([0-9a-f]{40}) blob \d+$/u.exec(line) ?? [])[1] ?? null);
  const answered =
    succeeded(checked) &&
    answers.length === walked.length &&
    answers.every((line, index) => oids[index] !== null || /^\S+ missing$/u.test(line));
  const unique = [...new Set(oids.filter(Boolean))];
  const batch =
    unique.length === 0
      ? null
      : git(history.repo, ["cat-file", "--batch"], `${unique.join("\n")}\n`);
  const blobs = batch === null ? new Map() : parseBatch(batch.stdout);
  // A blob the check just confirmed and the batch did not return is a failed
  // read, not an absent version.
  const read = batch === null || (succeeded(batch) && unique.every((oid) => blobs.has(oid)));
  const entries = walked
    .map((sha, index) => ({ sha, text: blobs.get(oids[index]) ?? null }))
    .filter((entry) => entry.text !== null);
  const failed = !succeeded(listed) || !answered || !read;
  const result = { entries, partial, failed };
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
 * Only a complete text is attributed, and only when it equals a committed
 * `SKILL.md` byte for byte under the normalization the harness applied. A
 * visible stamp is a claim, not a version: it narrows the match to commits that
 * carry the same stamp, but a partial read, or an installed file edited after
 * the build, keeps its stamp while its bytes say otherwise. The observed stamp
 * is always named in `stamp`, so evidence survives when the version stays
 * unknown.
 *
 * @param {{name: string, sourceTree: string|null, complete: boolean,
 *   comparison: "file"|"claude_body", candidates: string[]}} load loaded text
 * @param {object|null} history value from `openHistory`, or null
 * @returns {{version: string, commits: string, history: string, stamp: string}} typed fields
 */
export function attribute(load, history) {
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
    (entry) => bodyMatches(load, entry) && (!stamped || stampOf(entry.text) === load.sourceTree),
  );
  if (matches.length === 0) return { version: "unknown", commits: "none", history: state, stamp };
  const version = stamped ? `source_tree:${load.sourceTree}` : "body_match";
  return { version, commits: range(matches), history: state, stamp };
}
