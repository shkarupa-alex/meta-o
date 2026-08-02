/**
 * §M-GIT — Thin, failure-loud wrapper around the Git commands the gates need.
 *
 * Implements §A-CANDIDATE-ISOLATION. Gate correctness depends on Git telling
 * the truth about a candidate: its tree, its cleanliness, its worktrees. Using
 * `execFile` with argument arrays here — never a shell string — is what keeps a
 * branch or path containing shell metacharacters from turning a status check
 * into command execution.
 */

import { execFileSync } from "node:child_process";

/** §M-GIT — Raised when a Git invocation fails, carrying stderr for diagnosis. */
export class GitError extends Error {
  /** §M-GIT — Arguments of the failing invocation. */
  readonly args: string[];
  /** §M-GIT — Standard error of the failing invocation. */
  readonly stderr: string;

  /** §M-GIT — Keep args and stderr so a failing gate can be explained. */
  constructor(args: string[], stderr: string) {
    super(`git ${args.join(" ")} failed: ${stderr.trim()}`);
    this.name = "GitError";
    this.args = args;
    this.stderr = stderr;
  }
}

/**
 * §M-GIT — Run Git and return stdout as UTF-8.
 *
 * A 64 MiB buffer is generous for `ls-tree` on large repositories; overflowing
 * it must fail loudly rather than silently truncate a tree listing that a
 * digest is computed from.
 */
export function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = String((error as { stderr?: Buffer | string }).stderr ?? (error as Error).message);
    throw new GitError(args, stderr);
  }
}

/** §M-GIT — Run Git and return stdout as raw bytes, for blob contents. */
export function gitBytes(args: string[], cwd: string): Buffer {
  try {
    return execFileSync("git", args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = String((error as { stderr?: Buffer | string }).stderr ?? (error as Error).message);
    throw new GitError(args, stderr);
  }
}

/** §M-GIT — Absolute canonical root of the repository containing `cwd`. */
export function repoRoot(cwd: string): string {
  return git(["rev-parse", "--show-toplevel"], cwd).trim();
}

/** §M-GIT — Resolve any revision expression to a full commit OID. */
export function resolveCommit(revision: string, cwd: string): string {
  return git(["rev-parse", "--verify", `${revision}^{commit}`], cwd).trim();
}

/** §M-GIT — One tracked entry of a commit's tree. */
export interface TreeEntry {
  mode: string;
  type: string;
  oid: string;
  path: string;
}

/**
 * §M-GIT — Full recursive listing of a commit's tracked entries.
 *
 * Uses `-z` so that paths with spaces, quotes or newlines arrive verbatim;
 * Git's default quoting would otherwise change the bytes that feed the digest.
 */
export function listTree(commit: string, cwd: string): TreeEntry[] {
  const raw = git(["ls-tree", "-r", "-z", "--full-tree", commit], cwd);
  const entries: TreeEntry[] = [];
  for (const record of raw.split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    if (tab < 0) throw new Error(`unparsable ls-tree record: ${JSON.stringify(record)}`);
    const meta = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    const [mode, type, oid] = meta;
    if (!mode || !type || !oid) {
      throw new Error(`unparsable ls-tree metadata: ${JSON.stringify(record)}`);
    }
    entries.push({ mode, type, oid, path });
  }
  return entries;
}

/** §M-GIT — Read one blob's bytes by OID. */
export function readBlob(oid: string, cwd: string): Buffer {
  return gitBytes(["cat-file", "blob", oid], cwd);
}

/**
 * §M-GIT — Porcelain status including untracked files.
 *
 * Untracked files are included deliberately: a gate that ran with an extra
 * untracked file present did not attest the candidate's content.
 */
export function porcelainStatus(cwd: string): string {
  return git(["status", "--porcelain", "--untracked-files=all"], cwd);
}

/** §M-GIT — Raised when a gate would run on a dirty tree. */
export class DirtyWorktreeError extends Error {
  /** §M-GIT — Worktree that failed the cleanliness check. */
  readonly cwd: string;
  /** §M-GIT — Porcelain status proving what was dirty. */
  readonly status: string;

  /** §M-GIT — Include the offending status so the executor can clean up precisely. */
  constructor(cwd: string, status: string) {
    super(`worktree is not clean at ${cwd}:\n${status}`);
    this.name = "DirtyWorktreeError";
    this.cwd = cwd;
    this.status = status;
  }
}

/**
 * §M-GIT — Assert a worktree is pristine.
 *
 * Called before and after every gate, because a gate that mutated its own
 * checkout has attested something no commit contains.
 */
export function assertCleanWorktree(cwd: string): void {
  const status = porcelainStatus(cwd);
  if (status.trim() !== "") throw new DirtyWorktreeError(cwd, status);
}

/**
 * §M-GIT — Paths that differ between two commits.
 *
 * `--no-renames` on purpose. With rename detection on, `git mv a/x.py b/x.py`
 * reports only the destination, so a boundary check reading this list sees a
 * file appearing inside the permitted area and nothing leaving the forbidden
 * one. Every caller here asks "what did this change touch", and a rename
 * touches both ends.
 */
export function changedPaths(fromCommit: string, toCommit: string, cwd: string): string[] {
  const raw = git(["diff", "--name-only", "--no-renames", "-z", fromCommit, toCommit], cwd);
  return raw.split("\0").filter((path) => path !== "");
}

/**
 * §M-GIT — Tags and remote refs that name a commit this run created.
 *
 * §00 forbids push, remote branch, PR and tag without the user asking, and
 * nothing checked: a run could push its candidate and tag it `v1.0.0` and still
 * reach COMPLETE with every gate green. Asking whether a published ref points
 * into `base..head` is the direct question — it names the offending ref, needs
 * no snapshot taken at run start, and leaves the tags a repository already had
 * on older commits alone.
 *
 * A PR cannot be seen from inside a repository at all; that one stays a rule the
 * orchestrator is told, and this function does not pretend otherwise.
 */
export function publishedRunCommits(baseRevision: string, head: string, cwd: string): string[] {
  const own = new Set(
    git(["rev-list", `${baseRevision}..${head}`], cwd)
      .split("\n")
      .filter((line) => line !== ""),
  );
  if (own.size === 0) return [];

  return git(
    ["for-each-ref", "--format=%(refname) %(objectname)", "refs/tags", "refs/remotes"],
    cwd,
  )
    .split("\n")
    .filter((line) => line !== "")
    .flatMap((line) => {
      const [refname, oid] = line.split(" ");
      return refname && oid && own.has(oid) ? [refname] : [];
    })
    .sort();
}
