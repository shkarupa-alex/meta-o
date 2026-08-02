/**
 * §M-SPEC-INPUT — Acquisition and pinning of the immutable feature spec.
 *
 * Implements §A-IMMUTABLE-SPEC. The spec is the acceptance oracle every role
 * argues from, and the tracked copy is deleted during the same feature. If the
 * bytes could drift — a URL that changes, a file edited mid-run — reviewers and
 * executor would be judging against different requirements without noticing.
 * This module pins the bytes once and treats any later divergence as an error,
 * never as an update.
 */

import { realpathSync } from "node:fs";
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib";
import { request } from "node:https";
import { isAbsolute, join, normalize, resolve, relative } from "node:path";
import type { Duplex, Readable } from "node:stream";
import { atomicWriteFile, readExternalBytes } from "./safe-fs.mjs";
import { specBlobPath } from "./paths.mjs";
import { sha256Hex } from "./hash.mjs";
import type { FeatureSpecRef } from "./types.mjs";

/** §M-SPEC-INPUT — Redirect budget for URL specs. */
export const MAX_REDIRECTS = 3;

/** §M-SPEC-INPUT — Maximum decompressed spec size. */
export const MAX_SPEC_BYTES = 10 * 1024 * 1024;

/** §M-SPEC-INPUT — Raised when the fetched bytes do not match the pinned digest. */
export class SpecMutatedError extends Error {
  /** §M-SPEC-INPUT — Digest the run was pinned to. */
  readonly expected: string;
  /** §M-SPEC-INPUT — Digest the source has now. */
  readonly actual: string;

  /** §M-SPEC-INPUT — Report both digests so the user can decide to start a new run. */
  constructor(expected: string, actual: string) {
    super(
      `SPEC_MUTATED: expected sha256 ${expected}, source now has ${actual}; ` +
        `this run continues from its immutable blob or stops`,
    );
    this.name = "SpecMutatedError";
    this.expected = expected;
    this.actual = actual;
  }
}

/** §M-SPEC-INPUT — Bytes of a spec together with their identity. */
export interface FetchedSpec {
  bytes: Buffer;
  sha256: string;
  sanitizedLocator: string;
}

/**
 * §M-SPEC-INPUT — Remove credentials and query secrets from a URL before storing it.
 *
 * The locator ends up in run state that a watchdog logs and a fresh session
 * reads; a token in a query string would outlive the run in both places.
 */
export function sanitizeLocator(locator: string): string {
  try {
    const url = new URL(locator);
    url.username = "";
    url.password = "";
    if (url.search !== "") url.search = "?[redacted]";
    url.hash = "";
    return url.toString();
  } catch {
    return locator;
  }
}

/** §M-SPEC-INPUT — Read the decompression stream matching a content encoding. */
function decompressorFor(encoding: string | undefined): Duplex | undefined {
  switch ((encoding ?? "").toLowerCase()) {
    case "gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    case "br":
      return createBrotliDecompress();
    default:
      return undefined;
  }
}

/**
 * §M-SPEC-INPUT — Collect a stream while enforcing the decompressed size budget.
 *
 * The limit is applied after decompression on purpose: a small compressed body
 * can expand into gigabytes, and the orchestrator must not be a decompression
 * bomb target.
 */
async function collectLimited(stream: Readable, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buffer.length;
    if (total > limit) {
      stream.destroy();
      throw new Error(`spec exceeds ${limit} bytes after decompression`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * §M-SPEC-INPUT — Fetch an HTTPS spec with bounded redirects and size.
 *
 * Plain HTTP is refused rather than upgraded: a spec fetched over a channel an
 * attacker can rewrite is not an acceptance oracle.
 */
export async function fetchHttpsSpec(url: string, redirectsLeft = MAX_REDIRECTS): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`spec URL must use https, got ${parsed.protocol}`);
  }

  return await new Promise<Buffer>((resolvePromise, rejectPromise) => {
    const call = request(
      parsed,
      { method: "GET", headers: { accept: "text/markdown, text/plain, */*" } },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          response.resume();
          if (redirectsLeft <= 0) {
            rejectPromise(new Error(`spec URL exceeded ${MAX_REDIRECTS} redirects`));
            return;
          }
          const next = new URL(location, parsed).toString();
          fetchHttpsSpec(next, redirectsLeft - 1).then(resolvePromise, rejectPromise);
          return;
        }
        if (status !== 200) {
          response.resume();
          rejectPromise(new Error(`spec URL returned HTTP ${status}`));
          return;
        }
        const decompressor = decompressorFor(response.headers["content-encoding"]);
        const source = decompressor ? response.pipe(decompressor) : response;
        collectLimited(source as Readable, MAX_SPEC_BYTES).then(resolvePromise, rejectPromise);
      },
    );
    call.on("error", rejectPromise);
    call.end();
  });
}

/**
 * §M-SPEC-INPUT — Resolve a tracked spec path safely inside the repository.
 *
 * A tracked locator is repository-relative by definition; letting it escape via
 * `..` would turn "read the spec" into "read any file the agent can reach".
 *
 * The lexical check is not enough on its own, and was all there was. A repo
 * containing a symlink — `spec/current.md → /etc/passwd`, or a whole `spec/`
 * pointing outside the tree — passes it, because the string never leaves the
 * repository even though the read does. Both ends are resolved before they are
 * compared, so a repository reached through a symlinked parent (`/tmp` on
 * macOS) is not itself read as an escape.
 *
 * A locator that does not exist yet is returned unchanged: the read that
 * follows reports a missing spec, which is the honest error, and resolving is
 * not this function's way of saying the file is there.
 */
export function resolveTrackedSpecPath(repoDir: string, locator: string): string {
  const candidate = resolve(repoDir, normalize(locator));
  const rel = relative(repoDir, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`tracked spec locator escapes the repository: ${locator}`);
  }

  let real: string;
  try {
    real = realpathSync(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
    throw error;
  }
  const realRel = relative(realpathSync(repoDir), real);
  if (realRel.startsWith("..") || isAbsolute(realRel)) {
    throw new Error(`tracked spec locator resolves outside the repository: ${locator} → ${real}`);
  }
  return candidate;
}

/**
 * §M-SPEC-INPUT — Read the spec's bytes from whichever source declares them.
 *
 * Bytes are read, never executed or templated; a spec is data even when it
 * contains code blocks.
 */
export async function fetchSpec(ref: FeatureSpecRef, repoDir: string): Promise<FetchedSpec> {
  let bytes: Buffer;
  if (ref.kind === "url") {
    bytes = await fetchHttpsSpec(ref.locator);
  } else if (ref.kind === "tracked") {
    bytes = readExternalBytes(resolveTrackedSpecPath(repoDir, ref.locator));
  } else {
    if (!isAbsolute(ref.locator)) {
      throw new Error(`local spec locator must be absolute: ${ref.locator}`);
    }
    bytes = readExternalBytes(ref.locator);
  }
  if (bytes.length > MAX_SPEC_BYTES) {
    throw new Error(`spec exceeds ${MAX_SPEC_BYTES} bytes`);
  }
  return { bytes, sha256: sha256Hex(bytes), sanitizedLocator: sanitizeLocator(ref.locator) };
}

/**
 * §M-SPEC-INPUT — Compare fetched bytes against the pinned digest.
 *
 * Called on resume as well as on first read, because the interesting mutation
 * is the one that happens halfway through a long run.
 */
export function assertSpecUnchanged(expectedSha256: string | undefined, actual: string): void {
  if (expectedSha256 && expectedSha256 !== actual) {
    throw new SpecMutatedError(expectedSha256, actual);
  }
}

/**
 * §M-SPEC-INPUT — Copy the spec into the run's immutable blob.
 *
 * This copy is what lets the tracked spec be deleted during the same feature
 * without leaving later sessions without an acceptance oracle. It is deleted
 * with the rest of the run directory at cleanup, so it never becomes a
 * permanent shadow archive.
 */
export function materializeSpecBlob(
  projectKey: string,
  runId: string,
  bytes: Buffer,
  sha256: string,
): string {
  const path = specBlobPath(projectKey, runId, sha256);
  atomicWriteFile(path, bytes);
  return path;
}

/** §M-SPEC-INPUT — Read the immutable blob back for a role that needs the oracle. */
export function readSpecBlob(blobPath: string): Buffer {
  return readExternalBytes(blobPath);
}

/** §M-SPEC-INPUT — Repository-relative directory a tracked spec must be removed from. */
export function trackedSpecRetirementPath(repoDir: string, locator: string): string {
  return join(repoDir, normalize(locator));
}
