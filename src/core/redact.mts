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

/** §M-REDACT — Mask `NAME=value` and `"name": "value"` pairs with secret-looking names. */
function maskNamedAssignments(text: string): string {
  const assignment = /([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*("?)([^\s"',;]+)\2/g;
  return text.replace(assignment, (match, name: string, quote: string, value: string) => {
    if (!SECRET_NAME.test(name)) return match;
    if (value === "") return match;
    return `${name}${match.includes(":") && !match.includes("=") ? ": " : "="}${quote}${MASK}${quote}`;
  });
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
 */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactDeep(item);
    }
    return out as unknown as T;
  }
  return value;
}
