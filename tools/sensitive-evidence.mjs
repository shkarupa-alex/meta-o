/**
 * Classify data forbidden from portable eval evidence and public Issue projections.
 *
 * Implements §A-EVAL-01 and §A-ISSUE-01 without retaining or rewriting the
 * sensitive value.
 */

const PATTERNS = [
  [
    "machine_path",
    /(?:\/(?:home|Users|mnt|tmp|root|private)\/|\b[A-Za-z]:\\(?:[Uu][Ss][Ee][Rr][Ss]|[Tt][Ee][Mm][Pp]|[Ww][Ii][Nn][Dd][Oo][Ww][Ss])\\)/u,
  ],
  [
    "credential",
    /\b(?:Authorization|Proxy-Authorization)\s*:\s*(?:Basic|Bearer|Digest|Negotiate)\s+\S+/iu,
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
  ["personal_data", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu, (value) => value.includes("@")],
  [
    "internal_context",
    /(?:internal specification|client context|customer context|session transcript)/iu,
  ],
];

/** §A-EVAL-01 and §A-ISSUE-01 return only a stable class, never sensitive bytes. */
export function forbiddenPublicDataReason(value) {
  if (typeof value !== "string") return null;
  const environmentRows = value
    .split(/\r?\n/u)
    .filter((line) => /^[A-Z_][A-Z0-9_]*=.*$/u.test(line));
  if (environmentRows.length >= 2) return "environment_dump";
  return (
    PATTERNS.find(
      ([, pattern, applies]) => (!applies || applies(value)) && pattern.test(value),
    )?.[0] ?? null
  );
}
