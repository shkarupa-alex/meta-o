/**
 * §M-CANONICAL-JSON — Byte-stable JSON serialisation for anything that is hashed.
 *
 * Implements §A-DIGEST-STABILITY. Snapshot digests, plan digests and the
 * `e2e.json` projection are compared across machines and across sessions; if
 * two honest implementations serialised the same object differently, every
 * attestation would be unreproducible and gates would re-run forever. Removing
 * this module would leave digests dependent on incidental key order.
 */

/** §M-CANONICAL-JSON — JSON value domain accepted by the canonical serialiser. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * §M-CANONICAL-JSON — Sort object keys by Unicode code point.
 *
 * `Array.prototype.sort` orders by UTF-16 code unit, which disagrees with code
 * point order for astral characters; anchors and scenario ids are ASCII today,
 * but the digest contract must not silently depend on that.
 */
function compareCodePoints(a: string, b: string): number {
  const aChars = Array.from(a);
  const bChars = Array.from(b);
  const shared = Math.min(aChars.length, bChars.length);
  for (let i = 0; i < shared; i += 1) {
    const left = aChars[i]!.codePointAt(0)!;
    const right = bChars[i]!.codePointAt(0)!;
    if (left !== right) return left < right ? -1 : 1;
  }
  return aChars.length - bChars.length;
}

/**
 * §M-CANONICAL-JSON — Serialise a value with sorted keys and preserved array order.
 *
 * Rejects values JSON cannot round-trip (non-finite numbers, undefined,
 * functions) rather than emitting `null` for them, because a silent coercion
 * would make two different candidates hash identically.
 */
export function canonicalize(value: JsonValue): string {
  if (value === null) return "null";
  const kind = typeof value;
  if (kind === "boolean") return value ? "true" : "false";
  if (kind === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error(`canonical JSON cannot encode non-finite number: ${String(value)}`);
    }
    return JSON.stringify(value);
  }
  if (kind === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (kind === "object") {
    const record = value as { [key: string]: JsonValue };
    const keys = Object.keys(record).sort(compareCodePoints);
    const parts: string[] = [];
    for (const key of keys) {
      const entry = record[key];
      if (entry === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${canonicalize(entry)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new Error(`canonical JSON cannot encode value of type ${kind}`);
}

/**
 * §M-CANONICAL-JSON — Canonical UTF-8 bytes of a value.
 *
 * Hashing works on bytes, not on JavaScript strings; encoding here keeps every
 * caller from repeating the choice of encoding.
 */
export function canonicalBytes(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

/**
 * §M-CANONICAL-JSON — Parse JSON while rejecting anything outside the JSON value domain.
 *
 * Used on untrusted tracked files so that a malformed registry fails loudly at
 * the boundary instead of producing a partially-typed object deep inside a gate.
 */
export function parseJson(text: string): JsonValue {
  return JSON.parse(text) as JsonValue;
}
