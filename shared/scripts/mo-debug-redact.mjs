/**
 * Strip credentials and filesystem locations from session evidence.
 *
 * `mo-debug` reads the user's own agent sessions, and those sessions carry
 * whatever the agents saw: tokens pasted into a shell, private keys printed by
 * a mistaken `cat`, home directories naming the account. The report is meant
 * to be read and shared by the user, so every byte that leaves a session passes
 * through here first, and an excerpt never grows past a fixed bound.
 *
 * Identifiers that only look random — a 40-hex commit SHA, a UUID, a model id,
 * a package name — are evidence rather than secrets and stay verbatim, because
 * the classifying agent needs them to name a version or a session.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

export const EXCERPT_LIMIT = 240;

// Redaction runs on a bounded window of the source so a multi-megabyte tool
// output costs the same as a short one; see `excerpt` for the boundary rule.
const WINDOW = 4096;

const PATH_ROOTS =
  "home|Users|mnt|tmp|var|private|root|opt|srv|Volumes|media|run|workspace|workspaces|data";

/**
 * Ordered credential shapes. The more specific shapes run first so that, for
 * example, an Anthropic key is named as such rather than as a generic `sk-`.
 */
const SECRETS = [
  [
    /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/gu,
    () => "[REDACTED:private_key]",
  ],
  [
    /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/giu,
    (_, scheme) => `${scheme}[REDACTED:url_credentials]@`,
  ],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/gu, () => "[REDACTED:anthropic_key]"],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}/gu, () => "[REDACTED:api_key]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/gu, () => "[REDACTED:github_token]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/gu, () => "[REDACTED:github_token]"],
  [/\bglpat-[A-Za-z0-9_-]{16,}/gu, () => "[REDACTED:gitlab_token]"],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/gu, () => "[REDACTED:slack_token]"],
  [/\bAKIA[0-9A-Z]{16}\b/gu, () => "[REDACTED:aws_access_key]"],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/giu, (_, prefix) => `${prefix}[REDACTED:bearer_token]`],
  [
    // A key that *ends* in a credential word, then `=` or `:`. Requiring the
    // word at the end keeps `max_output_tokens: 30000` and `token_count` out.
    /\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key))(["']?\s*[=:]\s*["']?)(?!\[REDACTED)([^\s"'&,;}]{4,})/giu,
    (_, key, separator) => `${key}${separator}[REDACTED:assignment]`,
  ],
];

const UNIX_PATH = new RegExp(
  `(?<=^|[^\\w.~/-]|file://)/(?:${PATH_ROOTS})(?:/[^\\s"'\`<>|;:,()\\[\\]{}]*)?`,
  "gu",
);
const WINDOWS_PATH = /(?<![\w])[A-Za-z]:\\[^\s"'`<>|;,()[\]{}]*/gu;
// Claude names a project directory after its absolute path with `/` turned
// into `-`, so `-home-<account>-src` is the same disclosure in another shape.
const PATH_SLUG = new RegExp(`(?<![\\w-])-(?:${PATH_ROOTS})-[^\\s/"'\`<>|;:,()]*`, "gu");
const ACCOUNT_ROOTS = new Set(["home", "Users"]);

/**
 * The last segment of a path, unless that segment is the account name itself:
 * `/home/<account>` keeps nothing, because its basename is the disclosure.
 */
function basenameOf(path, separator) {
  const segments = path.split(separator).filter((segment) => segment !== "");
  if (segments.length <= 1) return "";
  if (separator === "/" && ACCOUNT_ROOTS.has(segments[0]) && segments.length === 2) return "";
  if (separator === "\\" && segments.length <= 3 && /^users$/iu.test(segments[1] ?? "")) {
    return "";
  }
  return segments.at(-1);
}

/**
 * §A-DIAGNOSTICS-01 replaces credentials with `[REDACTED:<kind>]` and absolute
 * paths with `<path>/<basename>`, leaving SHAs, UUIDs and model ids intact.
 *
 * @param {string} text any session-derived text
 * @returns {string} the same text with every recognized secret and path replaced
 */
export function redact(text) {
  let out = String(text);
  for (const [pattern, replace] of SECRETS) out = out.replace(pattern, replace);
  out = out.replace(UNIX_PATH, (path) => {
    const base = basenameOf(path, "/");
    return base === "" ? "<path>" : `<path>/${base}`;
  });
  out = out.replace(WINDOWS_PATH, (path) => {
    const base = basenameOf(path, "\\");
    return base === "" ? "<path>" : `<path>/${base}`;
  });
  return out.replace(PATH_SLUG, "<path>");
}

/**
 * §A-DIAGNOSTICS-01 turns any session text into one redacted line of at most
 * `EXCERPT_LIMIT` characters.
 *
 * Only a fixed window of the source is inspected. When the source is longer
 * than the window, the last whitespace-separated word of the redacted window is
 * dropped: a credential cut in half at the window edge no longer matches its
 * pattern, and dropping the fragment is what keeps it out of the output.
 *
 * @param {string} text session-derived text of any length
 * @returns {string} a single redacted line
 */
export function excerpt(text) {
  const source = String(text ?? "");
  const cut = source.length > WINDOW;
  let line = redact(source.slice(0, WINDOW)).replace(/\s+/gu, " ").trim();
  if (cut) line = line.replace(/\s*\S*$/u, "");
  if (line.length <= EXCERPT_LIMIT) return line;
  return `${line.slice(0, EXCERPT_LIMIT - 1)}…`;
}

/**
 * §A-DIAGNOSTICS-01 makes a redacted value safe as one `key=value` field of a
 * typed line: no spaces, no control characters, bounded length.
 *
 * @param {string} value session-derived identifier or name
 * @returns {string} a token of `[A-Za-z0-9._:<>/@+-]` characters
 */
export function token(value) {
  const cleaned = redact(String(value ?? ""))
    .replace(/[^A-Za-z0-9._:<>/@+-]/gu, "_")
    .slice(0, 120);
  return cleaned === "" ? "-" : cleaned;
}
