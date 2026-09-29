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

// A key that *ends* in a credential word; shared by the quoted and bare forms.
const CREDENTIAL_KEY =
  "[A-Za-z0-9_.-]*(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key)";

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
  // A quoted value is a value up to its closing quote, spaces included: a
  // passphrase is several words, and stopping at the first space left the
  // rest in the report. An unclosed quote runs to the end of the text, which
  // fails closed at a window edge. Quotes escaped for JSON, as a tool call
  // carries them, are one more shape of the same value.
  [
    new RegExp(
      `\\b(${CREDENTIAL_KEY})(\\\\?["']?\\s*[=:]\\s*)\\\\(["'])(?!\\[REDACTED)(?:(?!\\\\\\3)[\\s\\S])+(\\\\\\3|$)`,
      "giu",
    ),
    (_, key, separator, quote, close) =>
      `${key}${separator}\\${quote}[REDACTED:assignment]${close}`,
  ],
  [
    new RegExp(
      `\\b(${CREDENTIAL_KEY})(["']?\\s*[=:]\\s*)(["'])(?!\\[REDACTED)(?:\\\\[\\s\\S]|(?!\\3)[^\\\\])+(\\3|$)`,
      "giu",
    ),
    (_, key, separator, quote, close) => `${key}${separator}${quote}[REDACTED:assignment]${close}`,
  ],
  [
    // A key that *ends* in a credential word, then `=` or `:`. Requiring the
    // word at the end keeps `max_output_tokens: 30000` and `token_count` out,
    // so the value needs no minimum length: `pwd=123` is a whole PIN. A value
    // opening an object or a list is structure, not a credential.
    new RegExp(
      `\\b(${CREDENTIAL_KEY})(["']?\\s*[=:]\\s*["']?)(?!\\[REDACTED)(?![[{])([^\\s"'&,;}]+)`,
      "giu",
    ),
    (_, key, separator) => `${key}${separator}[REDACTED:assignment]`,
  ],
  [
    // The same key as a command-line option whose value is the next argument:
    // `--password s3cret`, `--api-key "a b"`. A next argument that is itself an
    // option means the value was prompted for, and nothing follows to redact.
    new RegExp(
      `(?<=^|[\\s"'\`(])(-{1,2}${CREDENTIAL_KEY})(\\s+)(?!-)(?!\\[REDACTED)(?:(\\\\?["'])(?:(?!\\3)[^\\n])*(?:\\3|$)|[^\\s"'&;|)]+)`,
      "gu",
    ),
    (_, flag, space, quote) =>
      quote ? `${flag}${space}${quote}[REDACTED:flag]${quote}` : `${flag}${space}[REDACTED:flag]`,
  ],
  [
    // A MySQL-family client takes its password glued to `-p`; a bare `-p`
    // prompts instead. `-P` is the port and stays.
    /(\b(?:mysql|mysqldump|mysqladmin|mariadb|mariadb-dump)\b[^\n|;&]*?\s-p)(?!\[REDACTED)[^\s"'&;|]+/gu,
    (_, head) => `${head}[REDACTED:flag]`,
  ],
  [
    // `curl -u user:pass` and its kin carry the password after the colon of the
    // user argument, with no URL around it for the scheme rule to catch.
    /((?:^|\s)(?:-u|--user)(?:\s+|=)["']?[^\s:"'@]+:)(?!\[REDACTED)[^\s"'@&;|]+/gu,
    (_, head) => `${head}[REDACTED:user_credentials]`,
  ],
];

// Characters an unquoted path segment may hold. An unquoted space, a quote, a
// backslash or a shell separator ends it; brackets, braces, parentheses, colons
// and commas are legal in a POSIX name and stay inside the path.
const SEGMENT = "[^\\s\"'`<>|;\\\\/]";

// A shell escape keeps the next character inside the segment, so
// `/usr/local/Acme\ Team/tool.mjs` is one token; in a Codex tool call the
// arguments are JSON text and the same escape is written with two backslashes.
// An escaped quote is not a name character: in JSON it closes the string.
const ESCAPED = "\\\\{1,2}[^\\n\\\\\"']";
const POSIX_SEGMENT = `(?:${ESCAPED}|${SEGMENT})`;

// Any absolute POSIX path of two or more segments, whatever its root: a list
// of roots left `/etc/<org>/…`, `/usr/local/<team>/…` and `/nix/store/…`
// verbatim. One segment is a path only under a known root, so a slash command
// such as `/help` stays text, and `//<host>/<share>` is a network root. The
// lookbehinds keep the path part of an `https://host/…` URL and a relative
// `docs/x` out, because a word character, a colon or another slash precedes
// their slash; `file://` is the one scheme whose path is local and is redacted.
// A path already shortened to `<path>/<basename>` is not read again, so a
// basename that happens to be a root name such as `tmp` survives.
const UNIX_PATH = new RegExp(
  `(?<!<path>)(?:(?<=^|[^\\w.~/:-]|file:)//${POSIX_SEGMENT}+/|(?<=^|[^\\w.~/-]|file://)/(?:(?:${PATH_ROOTS})(?!${POSIX_SEGMENT})|${POSIX_SEGMENT}+/))(?:${POSIX_SEGMENT}|/)*`,
  "gu",
);
const WINDOWS_PATH = /(?<![\w])[A-Za-z]:\\[^\s"'`<>|;]*/gu;

// An unquoted space is where the shell splits arguments, so an unquoted path
// with a space in a directory name reads as a path fragment followed by words.
// After a fragment whose last segment is a directory (no extension), up to
// three words ending in a relative-looking token that continues the hierarchy
// are taken as the rest of the path. That can swallow a neighbouring relative
// path, as in `cp /etc/a docs/x`; losing it costs diagnosis a little, while
// leaving `Private Team/…` in the report is the disclosure this module exists
// to prevent.
const WORD = "[^\\s\"'`<>|;&\\\\/]";
const CONTINUATION = {
  "/": new RegExp(`^(?: +${WORD}+){0,2} +(?![.~])[^\\s"'\`<>|;&\\\\/:]+/(?:${SEGMENT}|/)*`, "u"),
  "\\": new RegExp(`^(?: +${WORD}+){0,2} +(?![.~])[^\\s"'\`<>|;&\\\\/:]+\\\\[^\\s"'\`<>|;]*`, "u"),
};

// A quoted string whose content starts as an absolute path is one path, spaces
// and all; quotes escaped for JSON, as a tool call carries them, run first.
const QUOTED = [/\\(["'])([^\n]*?)\\\1/gu, /(?<!\\)(["'])([^\n]*?)(?<!\\)\1/gu];
const ABSOLUTE = new RegExp(`^(file://)?(/(?!/)|//${SEGMENT}|[A-Za-z]:\\\\)`, "u");
// A later argument that is itself an absolute path means the quotes hold a
// command such as `bash -c "/bin/ls /home/<account>"`, not one path. Shortening
// it whole would keep only what its last argument names, the account included,
// so such a string is left to the unquoted passes, which see every path in it.
const LATER_ABSOLUTE = /\s["'\\]*(?:file:\/\/)?(?:\/|[A-Za-z]:\\)/u;

// Claude names a project directory after its absolute path with `/` turned
// into `-`, so `-home-<account>-src` is the same disclosure in another shape.
const PATH_SLUG = new RegExp(`(?<![\\w-])-(?:${PATH_ROOTS})-[^\\s/"'\`<>|;:,()]*`, "gu");
const ACCOUNT_ROOT = /^(?:home|users)$/iu;

/**
 * The last segment of a path, unless that segment is the account name itself:
 * `/home/<account>` keeps nothing, because its basename is the disclosure.
 * The rule looks at the segment before the last wherever it stands, so a path
 * that some other pass joined or extended cannot put the account back.
 */
function basenameOf(path, separator) {
  const segments = path.split(separator).filter((segment) => segment !== "");
  if (segments.length <= 1) return "";
  if (ACCOUNT_ROOT.test(segments.at(-2))) return "";
  return segments.at(-1);
}

function shorten(path, separator) {
  const base = basenameOf(path, separator);
  return base === "" ? "<path>" : `<path>/${base}`;
}

/** Shorten every unquoted path, carrying a directory across the words that continue it. */
function redactUnquoted(text, pattern, separator) {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index < last) continue;
    let path = match[0];
    let end = match.index + path.length;
    const tail = path.split(separator).filter(Boolean).at(-1) ?? "";
    if (!tail.includes(".") && !path.endsWith(separator)) {
      const more = CONTINUATION[separator].exec(text.slice(end));
      if (more) {
        path += more[0];
        end += more[0].length;
      }
    }
    out += `${text.slice(last, match.index)}${shorten(path, separator)}`;
    last = end;
  }
  return out + text.slice(last);
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
  for (const pattern of QUOTED) {
    out = out.replace(pattern, (whole, quote, content) => {
      const absolute = ABSOLUTE.exec(content);
      if (!absolute || LATER_ABSOLUTE.test(content)) return whole;
      const scheme = absolute[1] ?? "";
      const path = content.slice(scheme.length);
      const separator = /^[A-Za-z]:\\/u.test(path) ? "\\" : "/";
      // A function replacement, because a `$&` or `$'` in a file name is literal.
      return whole.replace(content, () => `${scheme}${shorten(path, separator)}`);
    });
  }
  out = redactUnquoted(out, UNIX_PATH, "/");
  out = redactUnquoted(out, WINDOWS_PATH, "\\");
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
