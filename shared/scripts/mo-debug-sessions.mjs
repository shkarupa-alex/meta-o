/**
 * Find and open only the invoking user's own local agent session logs.
 *
 * `mo-debug` is a diagnostic over the user's own history, not a file reader.
 * An explicit path is an easy way to point it at another account's transcript,
 * a device, or a symlink planted inside the session directory, so this module
 * decides ownership before a single byte is read and reads the accepted file
 * through the descriptor it verified.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{3,79}$/u;
const CODEX_ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/iu;
const WALK_DEPTH = 6;
const WALK_ENTRIES = 200_000;
const LINE_LIMIT = 64 * 1024 * 1024;

/**
 * §A-DIAGNOSTICS-01 names the only two directories a session may live under.
 *
 * Claude Code keeps its data under `$CLAUDE_CONFIG_DIR` and Codex its rollouts
 * under `$CODEX_HOME/sessions` whenever the variable is set, so each variable
 * replaces its harness's default root rather than adding a second one.
 *
 * @param {string} home the invoking user's home directory
 * @param {{codexHome?: string|null, claudeConfigDir?: string|null} | null} [places]
 *   absolute `CODEX_HOME` and `CLAUDE_CONFIG_DIR`; an absent or null one is unset
 * @returns {{claude: string, codex: string}} absolute root paths
 */
export function sessionRoots(home, places = null) {
  const { codexHome = null, claudeConfigDir = null } = places ?? {};
  return {
    claude: join(claudeConfigDir ?? join(home, ".claude"), "projects"),
    codex: join(codexHome ?? join(home, ".codex"), "sessions"),
  };
}

const FILESYSTEM = { readdir: readdirSync, lstat: lstatSync };
const OPENING = { open: openSync, fstat: fstatSync, stat: statSync, close: closeSync };

// Only ENOENT or ENOTDIR proves a root absent. Any other error, such as a parent
// the user cannot traverse, leaves the root unknown, and a search that could not
// look there is incomplete. A symlinked root is walked at its realpath, the same
// place the ownership check accepts an explicit path under it; nested symlinks
// are still never followed.
function rootProbe(io, root) {
  try {
    const stat = io.lstat(root);
    if (stat.isDirectory()) return { state: "directory", dir: root };
    if (!stat.isSymbolicLink()) return { state: "absent" };
    const real = realpathSync(root);
    return statSync(real).isDirectory() ? { state: "directory", dir: real } : { state: "absent" };
  } catch (error) {
    const absent = error.code === "ENOENT" || error.code === "ENOTDIR";
    return { state: absent ? "absent" : "unknown" };
  }
}

// A directory that could not be read says nothing about what it holds, so a
// search that met one is incomplete rather than a proven absence or a proven
// single match. Any error counts, including one that appears between listing a
// parent and reading its child.
function listed(readdir, dir) {
  try {
    return readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
}

function claudeMatches(root, id, io) {
  if (!UUID.test(id)) return { matches: [], complete: true };
  const probe = rootProbe(io, root);
  if (probe.state !== "directory") return { matches: [], complete: probe.state === "absent" };
  const entries = listed(io.readdir, probe.dir);
  if (entries === null) return { matches: [], complete: false };
  const matches = [];
  let complete = true;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(probe.dir, entry.name, `${id}.jsonl`);
    try {
      io.lstat(candidate);
      matches.push(candidate);
    } catch (error) {
      // Absent in this project directory, unless the directory itself was unreadable.
      if (error.code !== "ENOENT") complete = false;
    }
  }
  return { matches, complete };
}

/**
 * Codex writes `YYYY/MM/DD/rollout-<time>-<id>.jsonl`. The walk never follows
 * a symlinked directory and is bounded, so a pathological tree cannot turn an
 * id lookup into an unbounded scan; a walk stopped by that bound is incomplete.
 * Only the whole thread id taken from the name counts: a fragment such as
 * `2026` or a UUID prefix would otherwise open whichever one session happened
 * to contain it.
 */
function codexMatches(root, id, io) {
  if (!UUID.test(id)) return { matches: [], complete: true };
  const probe = rootProbe(io, root);
  if (probe.state !== "directory") return { matches: [], complete: probe.state === "absent" };
  const wanted = id.toLowerCase();
  const matches = [];
  const pending = [{ dir: probe.dir, depth: 0 }];
  let seen = 0;
  let complete = true;
  while (pending.length > 0 && seen < WALK_ENTRIES) {
    const { dir, depth } = pending.pop();
    const entries = listed(io.readdir, dir);
    if (entries === null) {
      complete = false;
      continue;
    }
    for (const entry of entries) {
      // The entry budget holds inside one wide directory too; what was left
      // unread makes the search incomplete.
      if (seen === WALK_ENTRIES) {
        complete = false;
        break;
      }
      seen += 1;
      const name = entry.name;
      if (entry.isDirectory()) {
        // A directory past the depth bound was not looked into.
        if (depth < WALK_DEPTH) pending.push({ dir: join(dir, name), depth: depth + 1 });
        else complete = false;
      } else if (name.startsWith("rollout-") && CODEX_ID.exec(name)?.[1].toLowerCase() === wanted) {
        matches.push(join(dir, name));
      }
    }
  }
  return { matches, complete: complete && pending.length === 0 };
}

/**
 * §A-DIAGNOSTICS-01 turns one `--session` value into a candidate path.
 *
 * A value with a path separator or a `.jsonl` suffix is a path; anything else
 * is an id searched only inside the two session roots. An id never becomes a
 * glob or a path fragment: it must be a plain token first.
 *
 * @param {string} spec the `--session` argument
 * @param {string} home the invoking user's home directory
 * @param {{codexHome?: string|null, claudeConfigDir?: string|null} | null} [places]
 *   the harness homes `sessionRoots` reads
 * @param {{readdir: Function, lstat: Function}} io directory reads, replaceable so a
 *   test can fail one read
 * @returns {{path: string} | {outcome: "session_not_found"|"session_ambiguous"|"search_incomplete"}}
 */
export function resolveSession(spec, home, places = null, io = FILESYSTEM) {
  if (spec.includes("/") || spec.includes(sep) || spec.endsWith(".jsonl") || isAbsolute(spec)) {
    return { path: resolve(spec) };
  }
  if (!SESSION_ID.test(spec)) return { outcome: "session_not_found" };
  const roots = sessionRoots(home, places);
  const claude = claudeMatches(roots.claude, spec, io);
  const codex = codexMatches(roots.codex, spec, io);
  if (!claude.complete || !codex.complete) return { outcome: "search_incomplete" };
  const matches = [...claude.matches, ...codex.matches];
  if (matches.length === 0) return { outcome: "session_not_found" };
  if (matches.length > 1) return { outcome: "session_ambiguous" };
  return { path: matches[0] };
}

function realRoot(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return true;
  }
}

function containingHarness(real, roots) {
  for (const harness of ["claude", "codex"]) {
    const root = realRoot(roots[harness]);
    if (root !== null && real.startsWith(`${root}${sep}`)) return harness;
  }
  return null;
}

/**
 * Accept a session file only when it is provably the user's own local log.
 *
 * Ownership invariant, checked in this order and never relaxed:
 * 1. the path's realpath lies under the realpath of one of the two roots, so a
 *    symlinked directory or `..` cannot lead outside them;
 * 2. the named path is not itself a symlink, and it is opened with O_NOFOLLOW,
 *    so a link swapped in after the check still cannot be followed;
 * 3. the opened descriptor is a regular file and the very inode whose realpath
 *    was checked, so a rename race cannot substitute another file;
 * 4. the file belongs to the invoking uid wherever the platform has uids.
 * O_NONBLOCK keeps a FIFO or device from hanging the open; it is refused by
 * rule 3 before any read. Until all four hold, not one byte is read.
 */
function verifiedDescriptor(path, roots, io) {
  let real;
  try {
    real = realpathSync(path);
  } catch {
    return { outcome: "session_not_found" };
  }
  const harness = containingHarness(real, roots);
  if (harness === null || isSymlink(path)) return { outcome: "foreign_path" };
  let fd;
  try {
    fd = io.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    return { outcome: "foreign_path" };
  }
  // Until ownership is proved the descriptor is this check's to close: a log
  // renamed or removed after the open makes the stat throw, and that refuses
  // this one session instead of ending every other session's scan with it.
  let owned;
  try {
    const opened = io.fstat(fd);
    const checked = io.stat(real);
    const ownUid = typeof process.getuid === "function" ? process.getuid() : opened.uid;
    owned =
      opened.isFile() &&
      opened.dev === checked.dev &&
      opened.ino === checked.ino &&
      opened.uid === ownUid;
  } catch {
    owned = false;
  }
  if (!owned) {
    io.close(fd);
    return { outcome: "foreign_path" };
  }
  return { fd, harness, real };
}

/**
 * §A-DIAGNOSTICS-01 opens one resolved session under the ownership invariant.
 *
 * @param {string} path candidate path from `resolveSession`
 * @param {string} home the invoking user's home directory
 * @param {{codexHome?: string|null, claudeConfigDir?: string|null} | null} [places]
 *   the harness homes `sessionRoots` reads
 * @param {{open: Function, fstat: Function, stat: Function, close: Function}} [io]
 *   the descriptor operations, replaced only by tests of the race after open
 * @returns {{fd: number, harness: "claude"|"codex", id: string} | {outcome: string}}
 */
export function openOwnedSession(path, home, places = null, io = OPENING) {
  const verified = verifiedDescriptor(path, sessionRoots(home, places), io);
  if (verified.outcome) return verified;
  return { fd: verified.fd, harness: verified.harness, id: sessionIdOf(verified.real) };
}

/**
 * §A-DIAGNOSTICS-01 names a session for locators: the Claude UUID file name or
 * the Codex thread id at the end of a rollout file name.
 *
 * @param {string} path session file path
 * @returns {string} the session id, or the file name without `.jsonl`
 */
export function sessionIdOf(path) {
  const name = basename(path);
  const codex = CODEX_ID.exec(name);
  if (name.startsWith("rollout-") && codex) return codex[1];
  return name.replace(/\.jsonl$/u, "");
}

/**
 * §A-DIAGNOSTICS-01 yields the lines of an opened session in bounded chunks.
 *
 * The file is never loaded whole: a transcript can be hundreds of megabytes and
 * the caller usually stops at `--max-records`. A single line longer than the
 * line limit is yielded as `null` so the caller counts it as unparsed.
 *
 * @param {number} fd descriptor from `openOwnedSession`
 * @param {Function} [read] `readSync`, replaced only by tests of a failing read
 * @yields {{number: number, text: string|null}} 1-based line number and text
 */
export function* sessionLines(fd, read = readSync) {
  const chunk = Buffer.alloc(1 << 16);
  const decoder = new TextDecoder("utf-8");
  let pending = [];
  let pendingBytes = 0;
  let number = 0;
  const flush = () => {
    number += 1;
    const text = pendingBytes > LINE_LIMIT ? null : decoder.decode(Buffer.concat(pending));
    pending = [];
    pendingBytes = 0;
    return { number, text };
  };
  for (let got = read(fd, chunk); got > 0; got = read(fd, chunk)) {
    const view = chunk.subarray(0, got);
    let start = 0;
    for (let at = view.indexOf(10); at !== -1; at = view.indexOf(10, start)) {
      if (pendingBytes <= LINE_LIMIT) pending.push(Buffer.from(view.subarray(start, at)));
      pendingBytes += at - start;
      yield flush();
      start = at + 1;
    }
    if (pendingBytes <= LINE_LIMIT) pending.push(Buffer.from(view.subarray(start)));
    pendingBytes += got - start;
  }
  if (pendingBytes > 0) yield flush();
}
