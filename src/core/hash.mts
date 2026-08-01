/**
 * §M-HASH — SHA-256 helpers shared by spec identity, snapshot and plan digests.
 *
 * Implements §A-DIGEST-STABILITY. Every identity in the workflow — the spec
 * blob name, the project key suffix, the snapshot digest — is a lowercase hex
 * SHA-256; funnelling them through one module keeps encoding and casing
 * uniform. Without it, a single `toUpperCase` somewhere would break equality
 * comparisons that gates rely on.
 */

import { createHash } from "node:crypto";

/** §M-HASH — Lowercase hex SHA-256 of raw bytes or a UTF-8 string. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * §M-HASH — Short project-key suffix.
 *
 * Twelve hex characters of the canonical path hash disambiguate readable forms
 * that collapse to the same string, which is the only job this suffix has.
 */
export function shortHash(data: string, length = 12): string {
  return sha256Hex(data).slice(0, length);
}

/** §M-HASH — Constant-time-ish equality for digests, avoiding accidental prefix matches. */
export function digestEquals(a: string | undefined, b: string | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
