/**
 * §M-REDACT — Removal of credentials from anything leaving the machine.
 *
 * Implements §A-SECURITY. Prompts, findings and watchdog tails are sent to
 * external model providers and written to durable logs. A single leaked token
 * in an error message is unrecoverable, so redaction happens at the boundary
 * and errs towards over-masking: a masked value that was harmless costs
 * nothing, an unmasked one that was not costs a rotation.
 */

/** §M-REDACT — Replacement written in place of a suspected secret. */
export const MASK = "[redacted]";

/**
 * §M-REDACT — Environment variable names whose values are always masked.
 *
 * Matching is on the name, not the value, because a short token is
 * indistinguishable from ordinary text.
 */
const SECRET_NAME =
  /(SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|SESSION_KEY|AUTH)/i;

/** §M-REDACT — Patterns of secrets recognisable by their own shape. */
const VALUE_PATTERNS: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replace: MASK },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, replace: MASK },
  { pattern: /\bxox[abps]-[A-Za-z0-9-]{10,}\b/g, replace: MASK },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replace: MASK },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replace: MASK },
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: MASK,
  },
];

/**
 * §M-REDACT — Mask `NAME=value` and `"name": "value"` pairs with secret-looking names.
 *
 * The name may be quoted, which is the whole point: the docstring claimed JSON
 * was covered and the pattern could not match it, because a character class
 * starting at `[A-Za-z_]` never survives the opening quote. Every durable thing
 * this project writes — `state.json`, `findings/`, the watchdog log — is JSON,
 * so the level of protection the module calls its main one was off in exactly
 * the format the data lives in.
 *
 * A quoted value is taken up to its closing quote rather than to the first
 * space, and the separator is reproduced as it was found: rebuilding it from
 * `match.includes(":")` turned `token: abc=def` into `token=[redacted]`,
 * rewriting text on its way into a log meant to be read literally.
 */
function maskNamedAssignments(text: string): string {
  const assignment =
    /(["']?)([A-Za-z_][A-Za-z0-9_]*)\1(\s*[:=]\s*)(?:(["'])([^"']*)\4|([^\s"',;]+))/g;
  return text.replace(
    assignment,
    (
      match: string,
      nameQuote: string,
      name: string,
      separator: string,
      valueQuote: string | undefined,
      quoted: string | undefined,
      bare: string | undefined,
    ) => {
      if (!SECRET_NAME.test(name)) return match;
      const value = quoted ?? bare ?? "";
      if (value === "") return match;
      const wrap = valueQuote ?? "";
      return `${nameQuote}${name}${nameQuote}${separator}${wrap}${MASK}${wrap}`;
    },
  );
}

/** §M-REDACT — Mask credentials embedded in URLs, which survive plain name checks. */
function maskUrlCredentials(text: string): string {
  return text.replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, `$1$2:${MASK}@`);
}

/**
 * §M-REDACT — Redact a block of text before it is sent or logged.
 *
 * Applied to model prompts, evidence, adapter errors and watchdog tails alike;
 * one function means a new pattern protects every channel at once.
 */
export function redact(text: string): string {
  let out = text;
  for (const { pattern, replace } of VALUE_PATTERNS) out = out.replace(pattern, replace);
  out = maskUrlCredentials(out);
  out = maskNamedAssignments(out);
  return out;
}

/** §M-REDACT — Whether redaction would change this text, i.e. whether it carries a secret. */
export function containsSecret(text: string): boolean {
  return redact(text) !== text;
}

/**
 * §M-REDACT — Redact every string inside a structure, preserving its shape.
 *
 * Findings and adapter results are objects, and redacting only top-level text
 * would leave secrets in nested evidence details.
 *
 * The key is read, not only the value. In an object the name and the value are
 * already separated, so the text-level rule that matches `password=…` has
 * nothing to match — and applying `redact()` to values alone left name-based
 * protection, which this module calls its main level, doing nothing at all for
 * structured data. An opaque internal token quoted into `evidence[].detail`
 * matches no `VALUE_PATTERNS` shape and reached `state.json` verbatim.
 *
 * Reassembly uses `defineProperty` and not `out[key] = …`, because assignment
 * is not a way of putting a property on an object — it is a way of invoking
 * whatever setter answers to that name. `JSON.parse` happily produces an own
 * `__proto__`, and assignment turned it back into a prototype write: the key
 * left `Object.keys` while its contents stayed readable through the chain. Every
 * validator downstream that decides by enumerating own keys — the knowledge
 * plan's unknown-field check among them — was then reading a different object
 * than the one it went on to store. A plan whose four fields lived on the
 * prototype passed validation and was stored as `{}`, which is precisely the
 * value the same validator rejects.
 */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      Object.defineProperty(out, key, {
        value:
          SECRET_NAME.test(key) && typeof item === "string" && item !== ""
            ? MASK
            : redactDeep(item),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    return out as unknown as T;
  }
  return value;
}
