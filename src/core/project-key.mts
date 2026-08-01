/**
 * §M-PROJECT-KEY — Deterministic mapping from a Git project root to its state directory.
 *
 * Implements §A-EXTERNAL-STATE. Skills must rediscover a run's external state
 * from nothing but the current working directory, and two different projects
 * must never share a directory. Delete this module and state location would
 * have to be remembered somewhere inside the repository, which the methodology
 * forbids.
 */

import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { shortHash } from "./hash.mjs";

/** §M-PROJECT-KEY — Maximum bytes of the human-readable part of a project key. */
const READABLE_MAX_BYTES = 180;

/**
 * §M-PROJECT-KEY — Characters kept verbatim in the readable component.
 *
 * Everything else, separators included, collapses to `-`; the hash suffix, not
 * the readable text, carries uniqueness.
 */
const SAFE_CHARACTER = /[A-Za-z0-9._]/;

/**
 * §M-PROJECT-KEY — Truncate UTF-8 bytes without splitting a character.
 *
 * A byte-level slice could leave half a multi-byte sequence and produce an
 * undecodable directory name on the very projects with non-ASCII paths that
 * need the readable form most.
 */
export function truncateUtf8(input: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(input).length <= maxBytes) return input;
  let out = "";
  let used = 0;
  for (const char of input) {
    const size = encoder.encode(char).length;
    if (used + size > maxBytes) break;
    out += char;
    used += size;
  }
  return out;
}

/**
 * §M-PROJECT-KEY — Readable component of a project key.
 *
 * Kept separate from {@link projectKeyFor} so tests can prove the documented
 * collapse-and-truncate rules independently of hashing.
 */
export function readableComponent(canonicalPath: string): string {
  let replaced = "";
  for (const char of canonicalPath) {
    replaced += SAFE_CHARACTER.test(char) ? char : "-";
  }
  const collapsed = replaced.replace(/-+/g, "-");
  return truncateUtf8(collapsed, READABLE_MAX_BYTES);
}

/**
 * §M-PROJECT-KEY — Full project key for an already canonical absolute path.
 *
 * Takes the canonical path rather than resolving it, so callers that already
 * hold a `realpath` cannot accidentally key state by a symlinked alias.
 */
export function projectKeyFor(canonicalPath: string): string {
  return `${readableComponent(canonicalPath)}--${shortHash(canonicalPath)}`;
}

/** §M-PROJECT-KEY — Canonical path plus key, the pair every state operation needs. */
export interface ProjectIdentity {
  canonicalPath: string;
  projectKey: string;
}

/**
 * §M-PROJECT-KEY — Resolve the Git root containing `cwd` and key it.
 *
 * Uses `git rev-parse --show-toplevel` because the methodology is defined
 * against the repository root, not against wherever a skill happened to be
 * invoked; a nested subdirectory must reach the same run state.
 */
export function resolveProjectIdentity(cwd: string = process.cwd()): ProjectIdentity {
  let top: string;
  try {
    top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(`not inside a Git repository: ${cwd}`);
  }
  if (top === "") throw new Error(`git reported an empty project root for ${cwd}`);
  const canonicalPath = realpathSync(top);
  return { canonicalPath, projectKey: projectKeyFor(canonicalPath) };
}
