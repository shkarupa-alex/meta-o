#!/usr/bin/env node
/**
 * Decide from one exact candidate whether a project has a knowledge layer.
 *
 * §A-MEMORY-05 makes the knowledge layer something a project declares, not
 * something every project is assumed to have. A project that never adopted the
 * backlog closure, the papercut document and the identifier history owes no
 * G0/GC/G1/G2 for them; a project that adopted them and then lost one is a gap,
 * not a project without the layer. The two look alike in the current tree, so
 * the answer reads the candidate's tracked files and, for "never", its whole
 * first-parent history.
 *
 * The output is the literal line a reviewer brief carries, so the caller
 * copies an observation instead of retelling one. Every read is by commit, and
 * nothing is written.
 */

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

import { fromMarkdown } from "mdast-util-from-markdown";

const SHA = /^[0-9a-f]{40}$/u;
const MARKER = /^Knowledge-Layer: (enabled|disabled)$/u;
// A papercut document under any name is declared by this line, which mo-setup
// writes on the same human decision as the marker; a file name is only a hint.
const PAPERCUT_LINE = /^Knowledge-Layer-Papercut: (\S+\.md)$/u;
const COMMAND_FILES = ["Makefile", "package.json", "AGENTS.md"];
const DEFAULT_PAPERCUT = "docs/papercut.md";

/**
 * §A-MEMORY-05 names the paths and literals whose history decides
 * `never_enabled`. The search is bounded by these paths, not by a count of
 * commits: "never" is a claim about the whole first-parent path.
 */
export const HISTORY_PATHS = ["AGENTS.md", "Makefile", "package.json", DEFAULT_PAPERCUT];
export const HISTORY_PATTERN = "(MO-BACKLOG/1|history_cutoff_sha:|Knowledge-Layer: enabled)";

const USAGE = `usage: mo-knowledge-layer.mjs --candidate <40hex> [--repo <git-root>]

  --candidate <40hex>  exact commit whose tracked files are read
  --repo <git-root>    repository (default: Git root of the cwd)

output: Knowledge-Layer: state=<enabled|not_enabled|needs_attention> reason=<reason>
        [missing=<backlog,papercut,history subset|none|unknown>]  (needs_attention only)
exit: 0 enabled or not_enabled | 1 needs_attention | 2 call error
`;

function git(root, args) {
  return spawnSync("git", ["-C", root, ...args], { maxBuffer: 64 * 1024 * 1024 });
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/** One tracked file at the candidate: its text, `null` when absent, or a failure. */
function readAt(root, candidate, path) {
  const listed = git(root, ["ls-tree", "-z", candidate, "--", path]);
  if (listed.error || listed.status !== 0) return { error: "git_failed" };
  const row = listed.stdout.toString("utf8").split("\0")[0];
  if (row === "") return { text: null };
  if (!/^100(?:644|755) blob /u.test(row)) return { error: "unreadable" };
  const shown = git(root, ["cat-file", "blob", `${candidate}:${path}`]);
  if (shown.error || shown.status !== 0) return { error: "git_failed" };
  try {
    return { text: decoder.decode(shown.stdout) };
  } catch {
    return { error: "unreadable" };
  }
}

/**
 * A target outside the repository, or on another host, is not a tracked file.
 * A query or a fragment names a place inside the file, not another file, so it
 * is dropped before the path is judged.
 */
function localPath(url) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|\.\.\/)/iu.test(url)) return null;
  const path = posix.normalize(url.replace(/[?#].*$/su, "").replace(/^\.\//u, ""));
  return path.startsWith("../") ? null : path;
}

/**
 * A link destination names a file the way mo-knowledge reads the same link:
 * percent-decoded, with one leading `/` meaning the repository root. Decoding
 * comes before the outside-repository check, so an encoded `../` still escapes
 * and declares nothing; an undecodable destination declares nothing either.
 */
function linkPath(url) {
  if (url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/iu.test(url)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(url.replace(/[?#].*$/su, ""));
  } catch {
    return null;
  }
  // Decoded bytes are a file name now: a `%23` or `%3F` stays part of it.
  const path = posix.normalize(decoded.replace(/^\//u, ""));
  return path === ".." || path.startsWith("../") || path.startsWith("/") ? null : path;
}

/**
 * The papercut documents `AGENTS.md` declares.
 *
 * Two forms, because a name cannot carry every project's choice: a link to a
 * tracked Markdown file whose name says it is the papercut document, read with
 * an AST so a mention in prose or code is not a declaration, and the explicit
 * `Knowledge-Layer-Papercut:` line for a document named anything else. More
 * than one explicit line is a contradiction, not a list.
 *
 * @returns {{paths: string[]} | {reason: string}} declared paths or a typed failure
 */
function declaredPapercut(agents) {
  const tree = fromMarkdown(agents);
  // A full, collapsed or shortcut reference link names the same document as an
  // inline one, so its target is resolved through the document's definitions;
  // a definition no link uses declares nothing.
  const targets = new Map();
  const define = (node) => {
    if (node.type === "definition" && !targets.has(node.identifier))
      targets.set(node.identifier, node.url);
    for (const child of node.children ?? []) define(child);
  };
  define(tree);
  const found = [];
  const visit = (node) => {
    const url =
      node.type === "link"
        ? node.url
        : node.type === "linkReference"
          ? targets.get(node.identifier)
          : undefined;
    const path = url === undefined ? null : linkPath(url ?? "");
    if (path && /(?:^|\/)[^/]*papercut[^/]*\.md$/iu.test(path)) found.push(path);
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  const lines = agents
    .split(/\r?\n/u)
    .map((line) => PAPERCUT_LINE.exec(line.trim())?.[1])
    .filter(Boolean);
  // Counted before any deduplication: a repeated identical line is still a
  // second declaration, and the decision calls every second one a contradiction.
  if (lines.length > 1) return { reason: "conflicting_papercut" };
  for (const line of lines) {
    const path = localPath(line);
    if (!path) return { reason: "conflicting_papercut" };
    found.push(path);
  }
  return { paths: found };
}

/**
 * §A-MEMORY-05 reads the four literal signals of the candidate.
 *
 * @returns {{signals: object} | {reason: string}} the signals or a typed failure
 */
function readSignals(root, candidate) {
  const files = {};
  for (const path of [...new Set([...COMMAND_FILES, DEFAULT_PAPERCUT])]) {
    const read = readAt(root, candidate, path);
    if (read.error) return { reason: read.error };
    files[path] = read.text;
  }
  const agents = files["AGENTS.md"] ?? "";
  const markers = agents
    .split(/\r?\n/u)
    .map((line) => MARKER.exec(line.trim())?.[1])
    .filter(Boolean);
  if (new Set(markers).size > 1) return { reason: "conflicting_marker" };
  let papercut = files[DEFAULT_PAPERCUT] !== null;
  const declared = declaredPapercut(agents);
  if (declared.reason) return { reason: declared.reason };
  for (const path of declared.paths) {
    const read = readAt(root, candidate, path);
    if (read.error) return { reason: read.error };
    papercut ||= read.text !== null;
  }
  return {
    signals: {
      backlog: COMMAND_FILES.some((path) => files[path]?.includes("MO-BACKLOG/1")),
      papercut,
      history: /^\s*history_cutoff_sha:/mu.test(agents),
      marker: markers[0] ?? null,
    },
  };
}

/** Whether any first-parent ancestor of the candidate ever carried a signal. */
function everCarried(root, candidate) {
  const shallow = git(root, ["rev-parse", "--is-shallow-repository"]);
  if (shallow.error || shallow.status !== 0) return { reason: "git_failed" };
  if (shallow.stdout.toString("utf8").trim() !== "false") return { reason: "shallow_clone" };
  const found = git(root, [
    "log",
    "--first-parent",
    "-1",
    "--format=%H",
    "-G",
    HISTORY_PATTERN,
    candidate,
    "--",
    ...HISTORY_PATHS,
  ]);
  if (found.error || found.status !== 0) return { reason: "git_failed" };
  return { carried: found.stdout.toString("utf8").trim() !== "" };
}

/** The signals in the fixed order a `missing=` field lists them. */
const SIGNALS = ["backlog", "papercut", "history"];

// A contradiction is not an absence: every signal may be there and the answer
// is still a gap, so these reasons name nothing as missing.
const NOTHING_MISSING = new Set([
  "disabled_with_signals",
  "conflicting_marker",
  "conflicting_papercut",
]);

/**
 * Which signals a `needs_attention` answer lacks, as this helper detected them.
 *
 * §A-MEMORY-05 makes the helper the only authority on the signals: a skill
 * that must tell the human what to prepare copies this field, because
 * re-deriving it from the tree would re-implement the detection rules and get
 * a declared or a dangling papercut document wrong. An answer that read no
 * signals at all says `unknown` rather than guessing a list.
 */
export function missingSignals(reason, signals) {
  if (reason === "partial_signals") return SIGNALS.filter((name) => !signals[name]).join(",");
  if (reason === "enabled_without_signals" || reason === "signals_removed")
    return SIGNALS.join(",");
  return NOTHING_MISSING.has(reason) ? "none" : "unknown";
}

/**
 * §A-MEMORY-05 settles one state from the candidate, in the declared order.
 *
 * @param {string} root resolved Git root
 * @param {string} candidate exact 40-hex commit
 * @returns {{state: string, reason: string, missing?: string}} the typed
 *   answer; `missing` accompanies exactly the `needs_attention` state
 */
export function knowledgeLayer(root, candidate) {
  const { signals, ...answer } = settle(root, candidate);
  if (answer.state !== "needs_attention") return answer;
  return { ...answer, missing: missingSignals(answer.reason, signals) };
}

function settle(root, candidate) {
  const verified = git(root, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]);
  if (verified.error || verified.status !== 0) {
    return { state: "needs_attention", reason: "candidate_unreadable" };
  }
  const read = readSignals(root, candidate);
  if (read.reason) return { state: "needs_attention", reason: read.reason };
  const { backlog, papercut, history, marker } = read.signals;
  const any = backlog || papercut || history;
  if (marker === "disabled") {
    return any
      ? { state: "needs_attention", reason: "disabled_with_signals" }
      : { state: "not_enabled", reason: "declared_disabled" };
  }
  if (backlog && papercut && history) return { state: "enabled", reason: "signals_present" };
  // A marker over some of the signals is still a partial set: naming it
  // "without signals" would tell the human that present signals are missing.
  if (any) return { state: "needs_attention", reason: "partial_signals", signals: read.signals };
  if (marker === "enabled") return { state: "needs_attention", reason: "enabled_without_signals" };
  // Nothing in the tree: "never" must be proven over the whole first-parent
  // path, and a history that cannot be read is not a negative proof.
  const past = everCarried(root, candidate);
  if (past.reason) return { state: "needs_attention", reason: past.reason };
  return past.carried
    ? { state: "needs_attention", reason: "signals_removed" }
    : { state: "not_enabled", reason: "never_enabled" };
}

/** §A-MEMORY-05 renders the literal line a reviewer brief carries. */
export function knowledgeLayerLine({ state, reason, missing }) {
  const line = `Knowledge-Layer: state=${state} reason=${reason}`;
  return missing === undefined ? line : `${line} missing=${missing}`;
}

function resolveRoot(repo) {
  const result = spawnSync("git", ["-C", repo ?? process.cwd(), "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.replace(/\n$/u, "");
}

function main(argv) {
  if (argv.includes("--help")) {
    process.stdout.write(USAGE);
    return 0;
  }
  const given = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (!["--candidate", "--repo"].includes(flag) || value === undefined || given.has(flag)) {
      process.stderr.write(USAGE);
      return 2;
    }
    given.set(flag, value);
  }
  const candidate = given.get("--candidate");
  if (!SHA.test(candidate ?? "")) {
    process.stderr.write(`error: --candidate needs a full 40-hex SHA\n${USAGE}`);
    return 2;
  }
  const root = resolveRoot(given.get("--repo"));
  const result =
    root === null
      ? { state: "needs_attention", reason: "not_git_repository", missing: "unknown" }
      : knowledgeLayer(root, candidate);
  process.stdout.write(`${knowledgeLayerLine(result)}\n`);
  return result.state === "needs_attention" ? 1 : 0;
}

function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) process.exitCode = main(process.argv.slice(2));
