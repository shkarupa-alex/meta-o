/**
 * §M-CLASSIFIER — Deterministic reading of a provider's failure tail.
 *
 * Implements §A-DETERMINISTIC-WATCHDOG. The watchdog may wake sessions, so its
 * inputs must never be interpreted probabilistically: a model that guesses
 * "quota, resets in an hour" from ambiguous text could strand a run for an hour
 * or resume it into a rate limit. This classifier only recognises patterns it
 * can defend, and answers `unknown` otherwise — which is a safe, visible state.
 *
 * An optional local model may be consulted in hybrid mode, but it returns one
 * of these same four labels and never a command, a prompt or a transition.
 */

import { redact } from "../core/redact.mjs";
import type { TailClassification } from "../core/types.mjs";

/** §M-CLASSIFIER — Maximum tail handed to any classifier, local model included. */
export const MAX_TAIL_BYTES = 8 * 1024;

/** §M-CLASSIFIER — Patterns proving the provider refused on quota grounds. */
const QUOTA = [
  /\brate[ -]?limit/i,
  /\bquota\b/i,
  /\busage limit\b/i,
  /\bhttp\/?[ ]?429\b/i,
  /\btoo many requests\b/i,
  /\bresets? at\b/i,
];

/** §M-CLASSIFIER — Patterns proving an external dependency was unreachable. */
const EXTERNAL = [
  /\bENOTFOUND\b/,
  /\bECONNREFUSED\b/,
  /\bEHOSTUNREACH\b/,
  /\bENETUNREACH\b/,
  /\bgetaddrinfo\b/,
  /\bhttp\/?[ ]?5\d\d\b/i,
  /\bservice unavailable\b/i,
  /\bbad gateway\b/i,
];

/** §M-CLASSIFIER — Patterns suggesting a retryable hiccup rather than a hard stop. */
const TRANSIENT = [
  /\btimed out\b/i,
  /\btimeout\b/i,
  /\btemporarily\b/i,
  /\btry again\b/i,
  /\bconnection reset\b/i,
  /\bstream (?:closed|interrupted)\b/i,
];

/**
 * §M-CLASSIFIER — Trim and redact a tail before anything else touches it.
 *
 * Applied before both the deterministic classifier and any local model, so a
 * credential printed in a stack trace never reaches either — nor the log.
 */
export function sanitizeTail(tail: string, maxBytes: number = MAX_TAIL_BYTES): string {
  const redacted = redact(tail);
  const bytes = Buffer.from(redacted, "utf8");
  if (bytes.length <= maxBytes) return redacted;
  return bytes.subarray(bytes.length - maxBytes).toString("utf8");
}

/**
 * §M-CLASSIFIER — Classify a sanitized tail.
 *
 * Order matters: quota is checked first because a quota message often also
 * mentions retrying, and treating it as merely transient would produce an
 * immediate, guaranteed-to-fail wake.
 */
export function classifyTail(tail: string): TailClassification {
  const text = sanitizeTail(tail);
  if (QUOTA.some((pattern) => pattern.test(text))) return "quota";
  if (EXTERNAL.some((pattern) => pattern.test(text))) return "external";
  if (TRANSIENT.some((pattern) => pattern.test(text))) return "transient";
  return "unknown";
}

/**
 * §M-CLASSIFIER — Extract a provably stated quota reset time.
 *
 * Only unambiguous machine formats are accepted. "Resets at 3:00" is not
 * parsed, because its timezone and date are guesses, and a guessed wake time is
 * exactly the class of probabilistic action the watchdog must not take.
 */
export function parseResetTime(tail: string): number | undefined {
  const text = sanitizeTail(tail);

  const iso = /\b(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))/.exec(text);
  if (iso) {
    const value = Date.parse(iso[1]!.replace(" ", "T"));
    if (Number.isFinite(value)) return value;
  }

  const epoch = /\b(?:reset|retry)[-_ ]?(?:at|after|time)?["' :=]+(\d{10,13})\b/i.exec(text);
  if (epoch) {
    const raw = Number(epoch[1]);
    const value = epoch[1]!.length <= 10 ? raw * 1000 : raw;
    if (Number.isFinite(value)) return value;
  }

  const retryAfter = /\bretry-after["' :=]+(\d{1,6})\b/i.exec(text);
  if (retryAfter) return Number(retryAfter[1]) * 1000;

  return undefined;
}

/** §M-CLASSIFIER — Hook a hybrid deployment may supply; never an authority. */
export type LocalClassifier = (sanitizedTail: string) => Promise<TailClassification>;

/**
 * §M-CLASSIFIER — Consult a local model only where the deterministic pass abstained.
 *
 * The deterministic answer always wins when it exists, and an unexpected label
 * from the model degrades to `unknown`. The model can therefore only ever turn
 * "I don't know" into a guess the watchdog treats conservatively — it can never
 * overrule evidence.
 */
export async function classifyWithFallback(
  tail: string,
  local: LocalClassifier | undefined,
): Promise<TailClassification> {
  const deterministic = classifyTail(tail);
  if (deterministic !== "unknown" || !local) return deterministic;
  try {
    const suggested = await local(sanitizeTail(tail));
    return suggested === "transient" || suggested === "quota" || suggested === "external"
      ? suggested
      : "unknown";
  } catch {
    return "unknown";
  }
}
