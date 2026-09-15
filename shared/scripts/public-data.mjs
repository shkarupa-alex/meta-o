/**
 * Classify bytes that may not cross Meta-O portable/public data boundaries.
 *
 * Shared by model discovery, eval evidence and Issue projection so every
 * public surface enforces the same §A-EVAL-01 / §A-ISSUE-01 trust boundary.
 */

import { posix, win32 } from "node:path";

const PATTERNS = [
  [
    "credential",
    /\b(?:Authorization|Proxy-Authorization)\s*["']?\s*:\s*["']?\s*(?:Basic|Bearer|Digest|Negotiate)\s+\S+/iu,
  ],
  [
    "credential",
    /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]+@/iu,
    (value) => value.includes("://") && value.includes("@"),
  ],
  ["credential", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u],
  [
    "credential",
    /(?:\bBearer\s+|(?:(?:access|refresh|auth|api|id)[_-]?token|secret[_-]?access[_-]?key|client[_-]?secret|private[_-]?key|api[_-]?key|password|passphrase|credential|token|secret)\s*["']?\s*[:=]|\b(?:gh[opsu]_[A-Za-z0-9]{8,}|glpat-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{8,}))/iu,
  ],
  ["environment_dump", /\b(?:HOME|PATH|USER|HOSTNAME|SHELL|LANG|CI)=\S+/u],
  ["private_hostname", /\b[a-z0-9-]+\.(?:internal|local|lan|corp)\b/iu],
  [
    "personal_data",
    /\b[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+\b/iu,
    (value) => value.includes("@"),
  ],
  [
    "internal_context",
    /(?:internal specification|client context|customer context|session transcript)/iu,
  ],
];

function containsAbsoluteMachinePath(value) {
  if (value.toLowerCase().includes("file://")) return true;
  return value.split(/[\s"'`()<>{},;]+/u).some((token) => {
    try {
      const url = new URL(token);
      if (url.protocol === "http:" || url.protocol === "https:") return false;
    } catch {
      // A non-URL token may still contain a standalone or labelled path.
    }
    if (posix.isAbsolute(token) || win32.isAbsolute(token)) return true;
    return (
      /(?:^|[^A-Za-z0-9._/\\])\/(?!\/)/u.test(token) ||
      /(?:^|[^A-Za-z0-9._/\\])\\\\[^\\]/u.test(token) ||
      /[A-Za-z]:[\\/]/u.test(token)
    );
  });
}

/** §A-EVAL-01 returns only a stable class and never retains or rewrites rejected bytes. */
export function forbiddenPublicDataReason(value) {
  if (typeof value !== "string") return null;
  const environmentRows = value
    .split(/\r?\n/u)
    .filter((line) => /^[A-Z_][A-Z0-9_]*=.*$/u.test(line));
  if (environmentRows.length >= 2) return "environment_dump";
  const patternReason =
    PATTERNS.find(
      ([, pattern, applies]) => (!applies || applies(value)) && pattern.test(value),
    )?.[0] ?? null;
  return patternReason ?? (containsAbsoluteMachinePath(value) ? "machine_path" : null);
}
