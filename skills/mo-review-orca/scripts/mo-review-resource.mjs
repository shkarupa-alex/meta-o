#!/usr/bin/env node
/**
 * Decide from public Orca observations what a review slot's resources are,
 * whether a slot is still hot, and whether a fresh deep pair may start.
 *
 * §A-SESSION-01 keeps a Dispatch, a provider session, a PTY and a worktree as
 * four resources. `worker_done` spends the Dispatch and nothing else, so after
 * a coordinator restart the only way back to its own worktrees is a marker it
 * wrote on them through Orca, compared with the id Orca returns now. A marker
 * that names another worktree is somebody else's resource, however similar.
 *
 * The caller observes; this module only classifies. It stores nothing and
 * runs no command, so an unknown fact stays unknown here instead of becoming a
 * guess about somebody's worktree.
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** §A-SESSION-01 first line of the worktree comment a review slot owns. */
export const RESOURCE_PREFIX = "MO-REVIEW-RESOURCE/1";

// The worktree id is the last field and runs to the end of the line: Orca
// writes it as `<repo>::<absolute path>`, and a path may hold spaces, so a
// whitespace-free field would refuse a real id that release must match exactly.
const MARKER =
  /^MO-REVIEW-RESOURCE\/1 pair=([A-Za-z0-9._-]+) slot=(A|B) candidate=([0-9a-f]{40}) project=(\S+) worktree=([^\r\n]+)$/u;

/** §A-SESSION-01 an hour since the slot's last `worker_done` keeps it hot. */
export const HOT_AGE_MS = 3_600_000;

/** §A-SESSION-01 the ordinary working window the business layer names, in used tokens. */
export const SMALL_CONTEXT_TOKENS = 100_000;

/** §A-REVIEW-02 the only recorded reasons that justify a new deep pair mid-remediation. */
export const DEEP_PAIR_REASONS = Object.freeze([
  "state_transfer_impossible",
  "hypothesis_stuck",
  "requirements_conflict",
  "owner_request",
]);

/**
 * §A-SESSION-01 writes the two comment lines one slot's worktree carries: the
 * marker a restarted coordinator can match, and a line a human can read.
 */
export function resourceComment({ pair, slot, candidate, project, worktree, feature }) {
  const marker = `${RESOURCE_PREFIX} pair=${pair} slot=${slot} candidate=${candidate} project=${project} worktree=${worktree}`;
  if (!MARKER.test(marker) || typeof feature !== "string" || /[\n\r]/u.test(feature)) {
    return { error: "invalid_marker" };
  }
  return { text: `${marker}\n${feature} review slot ${slot} @ ${candidate.slice(0, 12)}\n` };
}

/** §A-SESSION-01 reads the marker from the comment's first line only, or nothing. */
export function parseResourceMarker(comment) {
  if (typeof comment !== "string") return null;
  const match = MARKER.exec(comment.split("\n", 1)[0].replace(/\r$/u, ""));
  if (match === null) return null;
  const [, pair, slot, candidate, project, worktree] = match;
  return { pair, slot, candidate, project, worktree };
}

const known = (value) => value === true || value === false;

/**
 * §A-SESSION-01 decides one worktree: `release`, `reuse`, `keep` or
 * `check_hot`. All four ownership conditions have to be proven before anything
 * is released; a fact nobody observed keeps the resource and names the gap.
 */
export function releaseDecision(facts) {
  const marker = parseResourceMarker(facts.comment);
  if (marker === null) return { action: "keep", reason: "foreign" };
  // A copied or edited marker is not ownership: the worktree Orca shows now has
  // to be the one the marker names.
  if (marker.worktree !== facts.worktreeId) return { action: "keep", reason: "marker_mismatch" };
  if (facts.project !== undefined && marker.project !== facts.project) {
    return { action: "keep", reason: "foreign" };
  }
  const required = [
    facts.sameGitDir,
    facts.projectRegistered,
    facts.bindingsProven,
    facts.liveSession,
    facts.coordinatorCheckout,
    facts.clean,
    facts.dependency,
  ];
  if (!required.every(known)) return { action: "keep", reason: "ownership_unknown" };
  if (!facts.sameGitDir || !facts.projectRegistered) return { action: "keep", reason: "foreign" };
  if (!facts.bindingsProven) return { action: "keep", reason: "ownership_unknown" };
  if (facts.coordinatorCheckout || facts.dependency) return { action: "keep", reason: "in_use" };
  // A marked live session is a slot to test for hotness, never a leftover.
  if (facts.liveSession) return { action: "check_hot", reason: "live_session" };
  if (!facts.clean) return { action: "keep", reason: "dirty" };
  if (typeof facts.head === "string" && facts.head === facts.nextCandidate) {
    return { action: "reuse", reason: "exact_placement" };
  }
  return { action: "release", reason: "owned_orphan" };
}

/**
 * §A-SESSION-01 proves a small context only from a fully parsed absolute count,
 * or from a percentage together with a proven window of that exact model.
 */
export function contextSize(context) {
  if (context?.kind === "absolute" && Number.isSafeInteger(context.used) && context.used >= 0) {
    return context.used <= SMALL_CONTEXT_TOKENS ? "small" : "large";
  }
  if (
    context?.kind === "percent" &&
    Number.isFinite(context.usedPercent) &&
    context.usedPercent >= 0 &&
    context.usedPercent <= 100 &&
    Number.isSafeInteger(context.window) &&
    context.window > 0
  ) {
    return (context.usedPercent / 100) * context.window <= SMALL_CONTEXT_TOKENS ? "small" : "large";
  }
  return "unknown";
}

/**
 * §A-SESSION-01 `hot(slot) = alive_and_ready AND (age < 1h OR context_proven_small)`.
 * An unknown age is not young, and an unknown context is not small.
 */
export function slotHot({ alive, ready, composerEmpty, ageMs, context }) {
  const size = contextSize(context);
  if (alive !== true || ready !== true || composerEmpty !== true) {
    return { hot: false, context: size, reason: "not_ready" };
  }
  if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < HOT_AGE_MS) {
    return { hot: true, context: size, reason: "age" };
  }
  if (size === "small") return { hot: true, context: size, reason: "context" };
  return { hot: false, context: size, reason: "cold" };
}

/**
 * §A-REVIEW-02 admits a fresh independent deep pair only as the first pair, as
 * the final pair after two PASS reports on one SHA, or for a recorded reason.
 */
export function deepPairDecision({ phase, reason }) {
  if (phase === "first") return { allowed: true, reason: "first_pair" };
  if (phase === "final") return { allowed: true, reason: "two_pass" };
  if (phase === "remediation" && DEEP_PAIR_REASONS.includes(reason)) {
    return { allowed: true, reason };
  }
  return { allowed: false, reason: "no_recorded_reason" };
}

// The calling skills point here for the exact inputs, so the usage names every
// flag and JSON key the commands read; a guessed name would answer a verdict on
// facts nobody gave instead of an error.
const USAGE = `usage: mo-review-resource.mjs <command> …

  comment --pair <id> --slot A|B --candidate <40-hex sha> --project <id>
          --worktree <orca worktree id> --feature <name>
      prints the two-line worktree comment of a review slot

  release < facts.json
      one JSON object on stdin, every boolean observed through Orca and Git:
      {"comment": "<worktree comment>", "worktreeId": "<orca worktree id>",
       "project": "<project id>", "sameGitDir": <bool>, "projectRegistered": <bool>,
       "bindingsProven": <bool>, "liveSession": <bool>, "coordinatorCheckout": <bool>,
       "clean": <bool>, "dependency": <bool>, "head": "<sha>", "nextCandidate": "<sha>"}

  hot --alive yes|no --ready yes|no --composer empty|other [--age-ms <n>]
      [--context-tokens <n> | --context-percent <n> --context-window <n>]

  deep --phase first|final|remediation [--reason <code>]
`;

class UsageError extends Error {}

function options(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag?.startsWith("--") || argv[index + 1] === undefined) {
      throw new UsageError(`expected --flag value, got ${flag}`);
    }
    parsed[flag.slice(2)] = argv[index + 1];
  }
  return parsed;
}

const yesNo = (value) => (value === "yes" ? true : value === "no" ? false : undefined);

// A flag value is a number only when it is written as one. `Number("")` is 0,
// so an empty observation read as age zero, a young slot, or as zero tokens, a
// proven small context, and an old slot stayed hot on nothing; NaN is unknown.
const decimal = (value) =>
  value === undefined ? undefined : /^\d+(?:\.\d+)?$/u.test(value) ? Number(value) : Number.NaN;

function contextOption(parsed) {
  if (parsed["context-tokens"] !== undefined) {
    return { kind: "absolute", used: decimal(parsed["context-tokens"]) };
  }
  if (parsed["context-percent"] !== undefined) {
    return {
      kind: "percent",
      usedPercent: decimal(parsed["context-percent"]),
      window: decimal(parsed["context-window"]),
    };
  }
  return { kind: "unknown" };
}

function releaseFacts() {
  let facts;
  try {
    facts = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    facts = null;
  }
  if (facts === null || typeof facts !== "object" || Array.isArray(facts)) {
    throw new UsageError("release reads one JSON object of facts on stdin");
  }
  return facts;
}

function requireFlags(command, parsed, names) {
  const missing = names.filter((flag) => parsed[flag] === undefined);
  if (missing.length > 0) throw new UsageError(`${command} needs --${missing.join(", --")}`);
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === "--help") {
    process.stdout.write(USAGE);
    return 0;
  }
  const parsed = options(rest);
  if (command === "comment") {
    const result = resourceComment(parsed);
    if (result.error) throw new Error(result.error);
    process.stdout.write(result.text);
    return 0;
  }
  if (command === "release") {
    const facts = releaseFacts();
    const result = releaseDecision(facts);
    process.stdout.write(
      `${RESOURCE_PREFIX} action=${result.action} reason=${result.reason} worktree=${JSON.stringify(String(facts.worktreeId))}\n`,
    );
    return 0;
  }
  if (command === "hot") {
    requireFlags("hot", parsed, ["alive", "ready", "composer"]);
    const result = slotHot({
      alive: yesNo(parsed.alive),
      ready: yesNo(parsed.ready),
      composerEmpty: parsed.composer === "empty" ? true : undefined,
      ageMs: decimal(parsed["age-ms"]),
      context: contextOption(parsed),
    });
    process.stdout.write(
      `MO-REVIEW-SLOT/1 hot=${result.hot ? "yes" : "no"} context=${result.context} reason=${result.reason}\n`,
    );
    return result.hot ? 0 : 1;
  }
  if (command === "deep") {
    const result = deepPairDecision(parsed);
    process.stdout.write(
      `MO-REVIEW-DEEP/1 allowed=${result.allowed ? "yes" : "no"} reason=${result.reason}\n`,
    );
    return result.allowed ? 0 : 1;
  }
  throw new UsageError(`unknown command ${command}`);
}

/**
 * Whether this file is the program Node was asked to run. Both sides go through
 * realpath: Node resolves the main module through symlinks and percent-encodes
 * its URL, while argv keeps the path as typed, so a textual comparison fails
 * silently for a symlinked install or a directory with a space in its name,
 * and a helper that answers by exit status would read as a yes.
 */
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
    if (error instanceof UsageError) process.stderr.write(USAGE);
    process.exitCode = 2;
  }
}
