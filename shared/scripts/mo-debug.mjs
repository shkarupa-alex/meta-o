#!/usr/bin/env node
/**
 * Extract how the user's own agents actually used Meta-O skills.
 *
 * `mo-debug` is invoked explicitly by the user to see where orchestration and
 * review deviated from the skills. The helper only extracts evidence from
 * local Claude Code and Codex session logs the user owns: skill invocations,
 * loaded skill texts attributed to committed versions, and `mo-*` helper calls
 * with their typed results. The agent running the skill classifies it. Nothing
 * is published, no session is modified, and the only write is one new local
 * report file the user named.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

import {
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  openSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClaudeExtractor } from "./mo-debug-claude.mjs";
import { createCodexExtractor } from "./mo-debug-codex.mjs";
import { attribute, openHistory } from "./mo-debug-history.mjs";
import { renderReport } from "./mo-debug-report.mjs";
import { token } from "./mo-debug-redact.mjs";
import {
  openOwnedSession,
  resolveSession,
  sessionIdOf,
  sessionLines,
} from "./mo-debug-sessions.mjs";

const USAGE = `usage: mo-debug.mjs scan --session <path-or-id> [--session ...] [options]
       mo-debug.mjs --help

  --session <path-or-id>  a session JSONL path, a Claude session UUID or a
                          Codex thread id; repeatable, at least one
  --since <ISO-8601>      skip records with an earlier timestamp
  --max-records <n>       parsed records per session (default 5000)
  --history <checkout>    Meta-O Git checkout for version attribution
  --max-history <n>       commits inspected per skill (default 2000)
  --out <new-file>        also write a Markdown report; the file must not exist

Only files under ~/.claude/projects/ or ~/.codex/sessions/ that the invoking
user owns are read; anything else is refused as foreign_path, unread. A set
CLAUDE_CONFIG_DIR replaces ~/.claude and a set CODEX_HOME replaces ~/.codex;
each must be an absolute path.

exit: 0 ok or partial | 1 unknown or every session refused | 2 call error
`;

const REFUSALS = new Set(["foreign_path", "session_not_found", "session_ambiguous"]);
const SINCE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u;
const MAX_SESSIONS = 100;

function callError(reason) {
  return { error: reason };
}

function positive(value, fallback) {
  if (value === undefined) return fallback;
  return /^[1-9]\d{0,7}$/u.test(value) ? Number(value) : null;
}

function collectFlags(args) {
  const flags = new Map([["--session", []]]);
  const valued = new Set([
    "--session",
    "--since",
    "--max-records",
    "--history",
    "--max-history",
    "--out",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!valued.has(flag) || index + 1 >= args.length) return null;
    const value = args[(index += 1)];
    if (flag === "--session") flags.get(flag).push(value);
    else if (flags.has(flag)) return null;
    else flags.set(flag, value);
  }
  return flags;
}

/**
 * §A-DIAGNOSTICS-01 parses the scan grammar into validated options.
 *
 * @param {string[]} argv arguments after the script name
 * @returns {{help: true} | {error: string} | object} parsed options
 */
export function parseArguments(argv) {
  if (argv.includes("--help")) return { help: true };
  if (argv[0] !== "scan") return callError("usage");
  const flags = collectFlags(argv.slice(1));
  if (flags === null) return callError("usage");
  const sessions = flags.get("--session");
  if (sessions.length === 0 || sessions.length > MAX_SESSIONS) return callError("usage");
  const since = flags.get("--since");
  const sinceMs = since === undefined ? null : Date.parse(since);
  if (since !== undefined && (!SINCE.test(since) || Number.isNaN(sinceMs))) {
    return callError("since_invalid");
  }
  const maxRecords = positive(flags.get("--max-records"), 5000);
  const maxHistory = positive(flags.get("--max-history"), 2000);
  if (maxRecords === null || maxHistory === null) return callError("usage");
  return {
    sessions,
    since: sinceMs,
    maxRecords,
    maxHistory,
    history: flags.get("--history") ?? null,
    out: flags.get("--out") ?? null,
  };
}

function refusedSession(spec, outcome) {
  const id = spec.includes("/") || spec.endsWith(".jsonl") ? sessionIdOf(spec) : spec;
  return {
    id,
    harness: "-",
    outcome,
    records: 0,
    unparsed: 0,
    untimed: 0,
    skipped: 0,
    events: [],
    loads: [],
  };
}

function parsedRecord(text) {
  try {
    const record = JSON.parse(text);
    return record !== null && typeof record === "object" && !Array.isArray(record) ? record : null;
  } catch {
    return null;
  }
}

function consume(extractor, text, number, counts, since) {
  const record = text === null ? null : parsedRecord(text);
  if (record === null) {
    counts.unparsed += 1;
    return;
  }
  const time = Date.parse(record.timestamp);
  if (Number.isNaN(time)) counts.untimed += 1;
  else if (since !== null && time < since) {
    // Whether the format is recognized must not depend on the window: a
    // session whose every record precedes --since is an empty window, not an
    // unknown format.
    counts.skipped += 1;
    extractor.skip(record);
    return;
  }
  try {
    extractor.feed(record, number);
  } catch {
    counts.unparsed += 1;
  }
}

/**
 * Read at most `maxRecords` non-empty lines. Hitting the cap with more lines
 * left marks the session partial; a garbled line counts as unparsed and is
 * never fatal, and a line the extractor chokes on is counted the same way.
 * A record without a readable timestamp is kept and counted as untimed.
 */
function readSession(opened, options) {
  const extractor =
    opened.harness === "claude"
      ? createClaudeExtractor(opened.id)
      : createCodexExtractor(opened.id);
  const counts = { records: 0, unparsed: 0, untimed: 0, skipped: 0 };
  let partial = false;
  for (const { number, text } of sessionLines(opened.fd, options.read)) {
    if (text !== null && text.trim() === "") continue;
    if (counts.records >= options.maxRecords) {
      partial = true;
      break;
    }
    counts.records += 1;
    consume(extractor, text, number, counts, options.since);
  }
  const { evidence } = extractor;
  const outcome = evidence.recognized === 0 ? "unknown" : partial ? "partial" : "ok";
  const recognized = outcome !== "unknown";
  return {
    id: opened.id,
    harness: opened.harness,
    outcome,
    ...counts,
    events: recognized ? evidence.events : [],
    loads: recognized ? evidence.loads : [],
  };
}

function scanSession(spec, options) {
  const resolved = resolveSession(spec, options.home, options.places);
  if (resolved.outcome) return refusedSession(spec, resolved.outcome);
  const opened = openOwnedSession(resolved.path, options.home, options.places);
  if (opened.outcome) return refusedSession(spec, opened.outcome);
  // A read error on one owned log, such as EIO on a failing or network home,
  // settles that session alone: the others keep their results, the status line
  // is still printed and a created report still gets written. Events read
  // before the error are withheld, so a cut read is never shown as complete.
  try {
    return readSession(opened, options);
  } catch {
    return { ...refusedSession(spec, "read_failed"), id: opened.id, harness: opened.harness };
  } finally {
    closeSync(opened.fd);
  }
}

function attributions(sessions, history) {
  const seen = new Map();
  for (const session of sessions) {
    for (const load of session.loads) {
      const result = attribute(load, history);
      const key = [session.id, load.name, result.version, result.commits, result.stamp].join("\0");
      if (!seen.has(key)) seen.set(key, { session: session.id, name: load.name, ...result });
    }
  }
  return [...seen.values()];
}

function overallStatus(sessions, attributed) {
  const readable = sessions.filter(
    (session) => session.outcome === "ok" || session.outcome === "partial",
  );
  if (readable.length === 0) {
    return sessions.every((session) => REFUSALS.has(session.outcome)) ? "refused" : "unknown";
  }
  const degraded =
    readable.length !== sessions.length ||
    readable.some((session) => session.outcome === "partial") ||
    attributed.some((item) => item.history === "partial" || item.history === "unreadable");
  return degraded ? "partial" : "ok";
}

/**
 * §A-DIAGNOSTICS-01 scans the requested sessions and settles the typed result.
 *
 * @param {object} options value from `parseArguments` plus `home`
 * @param {object|null} history value from `openHistory`, or null
 * @returns {{status: string, sessions: object[], events: object[],
 *   attributions: object[], lines: string[]}} the scan
 */
export function scan(options, history = null) {
  const sessions = options.sessions.map((spec) => scanSession(spec, options));
  const events = sessions.flatMap((session) => session.events);
  const attributed = attributions(sessions, history);
  const status = overallStatus(sessions, attributed);
  const refused = sessions.filter((session) => REFUSALS.has(session.outcome)).length;
  const lines = [
    `MO-DEBUG/1 status=${status} sessions=${sessions.length} events=${events.length} refused=${refused}`,
    ...sessions.map(
      (session) =>
        `session id=${token(session.id)} harness=${session.harness} outcome=${session.outcome} ` +
        `records=${session.records} unparsed=${session.unparsed} untimed=${session.untimed} ` +
        `skipped_since=${session.skipped}`,
    ),
    ...attributed.map(
      (item) =>
        `skill name=${item.name} session=${token(item.session)} version=${item.version} ` +
        `commits=${item.commits} history=${item.history} stamp=${item.stamp}`,
    ),
  ];
  return { status, sessions, events, attributions: attributed, lines };
}

/**
 * The report is created exclusively, never followed through a symlink and
 * readable only by the user: an existing file is someone's data, not ours.
 */
function createReport(path) {
  try {
    const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
    const fd = openSync(path, flags, 0o600);
    fchmodSync(fd, 0o600);
    return { fd };
  } catch (error) {
    return callError(error.code === "EEXIST" ? "out_exists" : "out_unwritable");
  }
}

function fail(reason) {
  process.stderr.write(`MO-DEBUG/1 status=error reason=${reason}\n`);
  if (reason === "usage") process.stderr.write(USAGE);
  return 2;
}

// A relative CODEX_HOME or CLAUDE_CONFIG_DIR would resolve against whatever
// directory the helper was started in, so it is a call error rather than a guess.
function sessionPlaces(env) {
  if (typeof env.HOME !== "string" || env.HOME === "") return { error: "home_unset" };
  const codexHome = env.CODEX_HOME ? env.CODEX_HOME : null;
  if (codexHome !== null && !isAbsolute(codexHome)) return { error: "codex_home_relative" };
  const claudeConfigDir = env.CLAUDE_CONFIG_DIR ? env.CLAUDE_CONFIG_DIR : null;
  if (claudeConfigDir !== null && !isAbsolute(claudeConfigDir)) {
    return { error: "claude_config_dir_relative" };
  }
  return { home: env.HOME, places: { codexHome, claudeConfigDir } };
}

/**
 * §A-DIAGNOSTICS-01 runs the command line and returns the exit code.
 *
 * @param {string[]} argv arguments after the script name
 * @param {NodeJS.ProcessEnv} env environment; only `HOME`, `CODEX_HOME` and
 *   `CLAUDE_CONFIG_DIR` are read
 * @returns {number} 0 ok or partial, 1 unknown or refused, 2 call error
 */
export function main(argv, env = process.env) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (options.error) return fail(options.error);
  const located = sessionPlaces(env);
  if (located.error) return fail(located.error);
  const { home, places } = located;
  const history =
    options.history === null ? null : openHistory(resolve(options.history), options.maxHistory);
  if (options.history !== null && history === null) return fail("history_unreadable");
  const report = options.out === null ? null : createReport(resolve(options.out));
  if (report?.error) return fail(report.error);
  let result;
  try {
    result = scan({ ...options, home, places }, history);
    if (report) {
      writeSync(report.fd, renderReport(result));
      fsyncSync(report.fd);
    }
  } finally {
    if (report) closeSync(report.fd);
  }
  process.stdout.write(`${result.lines.join("\n")}\n`);
  return result.status === "ok" || result.status === "partial" ? 0 : 1;
}

function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) process.exitCode = main(process.argv.slice(2));
