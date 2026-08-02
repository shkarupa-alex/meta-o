/**
 * §M-SAFE-FS — Hardened access to the external state tree under `~/.meta-o`.
 *
 * Implements §A-EXTERNAL-STATE and §A-SECURITY. Run state decides whether a
 * gate passed, so an attacker who can redirect one path component through a
 * symlink could forge attestations or read another user's spec. Every open in
 * the state tree goes through here; deleting this module would scatter
 * ownership and permission checks across a dozen call sites, where they would
 * silently rot.
 *
 * §20's descriptor-relative requirement is **not met** by this module, and
 * calling that a deviation understated it. The spec asks for creation and
 * replacement relative to an already verified directory descriptor; Node
 * exposes neither `openat` nor `mkdirat`, and adding a native dependency to a
 * dependency-free tool is a worse trade than saying this plainly. So each
 * component is verified with `lstat` and the leaf is opened with `O_NOFOLLOW`.
 *
 * What that buys: symlink substitution is closed, including a symlink planted
 * at a parent directory. What it does not buy: the check and the open are two
 * operations, and on a host where another process can already write inside
 * `~/.meta-o` the window between them is exploitable. In that case the
 * guarantee is the `0700` requirement on the tree, which is a permission bit
 * someone else's `umask` could have got wrong — not this code. `README.md`'s
 * **Known limits** and `docs/knowledge/architecture/state.md` say the same, so
 * nobody reads one of the three and concludes the rule is satisfied.
 */

import {
  closeSync,
  constants as fsConstants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  fstatSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalize, type JsonValue } from "./canonical-json.mjs";

/** §M-SAFE-FS — Directory permission bits required inside the state tree. */
export const DIR_MODE = 0o700;

/** §M-SAFE-FS — File permission bits required inside the state tree. */
export const FILE_MODE = 0o600;

/** §M-SAFE-FS — Raised when the state tree fails an ownership or permission check. */
export class InsecureStateError extends Error {
  /** §M-SAFE-FS — Path that failed the ownership or permission check. */
  readonly path: string;

  /** §M-SAFE-FS — Preserve the offending path so the user can fix it by hand. */
  constructor(message: string, path: string) {
    super(message);
    this.name = "InsecureStateError";
    this.path = path;
  }
}

/**
 * §M-SAFE-FS — Root of the external state tree.
 *
 * `META_O_HOME` exists for tests and for users who keep state on a different
 * volume; without an override, tests would have to write into the real home
 * directory of whoever runs them.
 */
export function metaOHome(): string {
  const override = process.env["META_O_HOME"];
  if (override !== undefined && override !== "") return resolve(override);
  return join(homedir(), ".meta-o");
}

/** §M-SAFE-FS — Current uid, or `-1` on platforms without one. */
function currentUid(): number {
  return typeof process.getuid === "function" ? process.getuid() : -1;
}

/**
 * §M-SAFE-FS — Assert one existing path component is safe to traverse or open.
 *
 * Rejects symlinks outright rather than resolving them: a resolved symlink may
 * point at a perfectly well-owned file and still mean that state was diverted.
 */
export function assertSecureComponent(path: string, expect: "dir" | "file"): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new InsecureStateError(`refusing to follow symlink in state tree: ${path}`, path);
  }
  const uid = currentUid();
  if (uid >= 0 && stat.uid !== uid) {
    throw new InsecureStateError(
      `state path is owned by uid ${stat.uid}, expected ${uid}: ${path}`,
      path,
    );
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new InsecureStateError(
      `state path is group/world accessible (mode ${(stat.mode & 0o777).toString(8)}): ${path}`,
      path,
    );
  }
  if (expect === "dir" && !stat.isDirectory()) {
    throw new InsecureStateError(`expected a directory: ${path}`, path);
  }
  if (expect === "file" && !stat.isFile()) {
    throw new InsecureStateError(`expected a regular file: ${path}`, path);
  }
}

/**
 * §M-SAFE-FS — Reject paths that escape the state tree.
 *
 * Run ids and project keys are derived values, but they still end up in path
 * joins; a `..` slipping through would move state outside every check above.
 */
export function assertInsideStateTree(path: string): string {
  const home = metaOHome();
  const absolute = isAbsolute(path) ? resolve(path) : resolve(home, path);
  const rel = relative(home, absolute);
  if (absolute !== home && (rel === "" || rel.startsWith("..") || isAbsolute(rel))) {
    throw new InsecureStateError(`path escapes the meta-o state tree: ${path}`, path);
  }
  return absolute;
}

/**
 * §M-SAFE-FS — Create (if needed) and verify every component down to a directory.
 *
 * Verification walks top-down so that the first diverted component is reported,
 * instead of failing later with a confusing error about a leaf file.
 */
export function ensureSecureDir(path: string): string {
  const absolute = assertInsideStateTree(path);
  const home = metaOHome();

  mkdirSync(home, { recursive: true, mode: DIR_MODE });
  assertSecureComponent(home, "dir");

  const rel = relative(home, absolute);
  if (rel === "") return absolute;

  let current = home;
  for (const part of rel.split(sep)) {
    if (part === "") continue;
    current = join(current, part);
    createDirIfMissing(current);
    assertSecureComponent(current, "dir");
  }
  return absolute;
}

/**
 * §M-SAFE-FS — Create one directory, tolerating a concurrent creation.
 *
 * `recursive: true` is deliberately avoided: it would silently accept an
 * existing *symlink* at this position, which is precisely the substitution the
 * component check below is there to catch. An `EEXIST` is therefore swallowed
 * and then re-examined, rather than prevented.
 */
function createDirIfMissing(path: string): void {
  try {
    mkdirSync(path, { recursive: false, mode: DIR_MODE });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

/**
 * §M-SAFE-FS — Verify an existing directory chain without creating anything.
 *
 * Readers such as the watchdog must not materialise directories for runs that
 * do not exist; a missing path is information, not something to repair.
 */
export function verifySecureDir(path: string): string {
  const absolute = assertInsideStateTree(path);
  const home = metaOHome();
  assertSecureComponent(home, "dir");
  const rel = relative(home, absolute);
  let current = home;
  for (const part of rel === "" ? [] : rel.split(sep)) {
    if (part === "") continue;
    current = join(current, part);
    assertSecureComponent(current, "dir");
  }
  return absolute;
}

/**
 * §M-SAFE-FS — Read a state file after verifying its whole path chain.
 *
 * Opens with `O_NOFOLLOW` so that a symlink swapped in between the `lstat` and
 * the `open` fails the read rather than silently redirecting it.
 */
export function readSecureFile(path: string): Buffer {
  const absolute = assertInsideStateTree(path);
  verifySecureDir(dirname(absolute));
  assertSecureComponent(absolute, "file");
  const fd = openSync(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const size = fstatSync(fd).size;
    const buffer = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const read = readSync(fd, buffer, offset, size - offset, offset);
      if (read <= 0) break;
      offset += read;
    }
    return buffer.subarray(0, offset);
  } finally {
    closeSync(fd);
  }
}

/**
 * §M-SAFE-FS — Durably replace a state file.
 *
 * `temp → fsync(temp) → rename → fsync(parent)` is what makes a crash leave
 * either the old or the new state on disk and never a truncated file; the
 * whole recovery story depends on that guarantee.
 */
export function atomicWriteFile(path: string, data: string | Uint8Array): void {
  const absolute = assertInsideStateTree(path);
  const dir = ensureSecureDir(dirname(absolute));
  const temp = join(dir, `.tmp-${randomUUID()}`);

  const fd = openSync(
    temp,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
    FILE_MODE,
  );
  try {
    const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(fd, bytes, offset, bytes.length - offset, offset);
    }
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(temp, { force: true });
    throw error;
  }
  closeSync(fd);

  try {
    renameSync(temp, absolute);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }

  const dirFd = openSync(dir, fsConstants.O_RDONLY);
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

/** §M-SAFE-FS — Read and parse a JSON state file, or `undefined` when absent. */
export function readSecureJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readSecureFile(path).toString("utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * §M-SAFE-FS — Write a JSON state file in canonical form.
 *
 * Canonical output keeps `state.json` diffable and makes a state file's bytes a
 * function of its content alone, which matters when comparing what two
 * orchestrator generations believe.
 */
export function writeSecureJson(path: string, value: JsonValue): void {
  atomicWriteFile(path, `${canonicalize(value)}\n`);
}

/**
 * §M-SAFE-FS — Open a state file for writing, with the whole chain verified first.
 *
 * For the two files that cannot go through `atomicWriteFile`: an append-only
 * log, and a lock whose entire purpose is `O_EXCL` at a fixed path. Both are
 * inside the state tree and both were opened with a bare `openSync` after a
 * bare `mkdirSync(..., {recursive: true})`, so `O_NOFOLLOW` protected the final
 * component and nothing protected the parents — a symlink one level up
 * redirected every line a long-lived watchdog wrote, for as long as it ran.
 *
 * The caller supplies the flags because the two uses genuinely differ;
 * `O_NOFOLLOW` is added here so no caller can forget it.
 */
export function openSecureFile(path: string, flags: number, mode = FILE_MODE): number {
  const absolute = assertInsideStateTree(path);
  ensureSecureDir(dirname(absolute));
  return openSync(absolute, flags | fsConstants.O_NOFOLLOW, mode);
}

/**
 * §M-SAFE-FS — Rename one state file over another, both inside the tree.
 *
 * Log rotation, and nothing else so far. It exists rather than a raw
 * `renameSync` because the source path's parents deserve the same walk every
 * other write gets: rotating through a diverted directory moves the log
 * somewhere the operator will never read it.
 */
export function renameSecureFile(from: string, to: string): void {
  const source = assertInsideStateTree(from);
  const target = assertInsideStateTree(to);
  verifySecureDir(dirname(source));
  ensureSecureDir(dirname(target));
  renameSync(source, target);
}

/**
 * §M-SAFE-FS — Delete a state file, refusing a diverted path.
 *
 * Releasing a lock and reclaiming a stale one both delete a file that another
 * process may control the name of. `force` keeps a missing file from being an
 * error — the lock may already be gone — but the chain is still walked, so the
 * delete cannot be aimed outside the tree or through a symlinked parent.
 */
export function removeSecureFile(path: string): void {
  const absolute = assertInsideStateTree(path);
  try {
    verifySecureDir(dirname(absolute));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  rmSync(absolute, { force: true });
}

/**
 * §M-SAFE-FS — Read a file outside the state tree without permission requirements.
 *
 * Repository files and user-supplied spec paths are ordinary project data; they
 * must not be forced to `0600`, but they still must not be executed or
 * interpreted, only read as bytes.
 */
export function readExternalBytes(path: string): Buffer {
  return readFileSync(path);
}
