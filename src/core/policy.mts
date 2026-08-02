/**
 * §M-POLICY — Detect relaxation of the thresholds, ratchets and baselines a gate rests on.
 *
 * Implements §A-AUTHORITATIVE-QC. Comparing gate *commands* across the base
 * revision proves only that the same script still runs; it says nothing about
 * the numbers that script enforces. Raising `max_function_lines` from 60 to 600,
 * flipping `forbid_regressions` off, adding a directory to `exempt_files`, or
 * re-freezing a baseline at a worse value all leave `make qc` green while
 * deleting the constraint it was green about.
 *
 * The executor is the party these numbers constrain, so it must not be the party
 * that quietly changes them. Nothing here decides whether a change is
 * *justified* — a project genuinely may need a higher limit. It decides only
 * that the change is visible and belongs to the user.
 */

import type { JsonValue } from "./canonical-json.mjs";

/** §M-POLICY — A scalar a `[tool.meta_o.*]` key may hold. */
export type TomlScalar = string | number | boolean;

/** §M-POLICY — A value a `[tool.meta_o.*]` key may hold. */
export type TomlValue = TomlScalar | TomlScalar[];

/** §M-POLICY — The `[tool.meta_o.*]` tables of one pyproject.toml, and what failed to parse. */
export interface MetaOPolicy {
  tables: Map<string, Record<string, TomlValue>>;
  errors: string[];
}

/** §M-POLICY — Table prefix this parser is responsible for. */
const PREFIX = "tool.meta_o.";

/** §M-POLICY — Strip a trailing comment, respecting quoted strings. */
function stripComment(line: string): string {
  let quote: string | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "#") return line.slice(0, index);
  }
  return line;
}

/** §M-POLICY — Parse one TOML scalar, or throw when it is outside the supported subset. */
function parseScalar(text: string): TomlScalar {
  const value = text.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^[+-]?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^[+-]?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  if (/^"(?:[^"\\]|\\.)*"$/.test(value)) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\(["\\])/g, "$1");
  }
  if (/^'[^']*'$/.test(value)) return value.slice(1, -1);
  throw new Error(`unsupported value ${value}`);
}

/** §M-POLICY — Split an array body on its top-level commas. */
function splitItems(body: string): string[] {
  const items: string[] = [];
  let quote: string | undefined;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === ",") {
      items.push(body.slice(start, index));
      start = index + 1;
    }
  }
  items.push(body.slice(start));
  return items.map((item) => item.trim()).filter((item) => item !== "");
}

/** §M-POLICY — Parse a value that may be a scalar or a flat array of scalars. */
function parseValue(text: string): TomlValue {
  const value = text.trim();
  if (!value.startsWith("[")) return parseScalar(value);
  if (!value.endsWith("]")) throw new Error(`unterminated array ${value}`);
  return splitItems(value.slice(1, -1)).map(parseScalar);
}

/** §M-POLICY — Whether an array literal that started on this line is still open. */
function unbalanced(text: string): boolean {
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "[") depth += 1;
    else if (char === "]") depth -= 1;
  }
  return depth > 0;
}

/**
 * §M-POLICY — Read the `[tool.meta_o.*]` tables out of a pyproject.toml.
 *
 * A deliberately small subset of TOML — tables, scalars and flat arrays — is
 * all these gates configure. Anything else *inside a captured table* is
 * reported as an error rather than skipped: a key this parser cannot read is a
 * key whose weakening it cannot detect, and silently ignoring it would make the
 * gate claim more than it checked. Tables outside the prefix are not our
 * business and are skipped without comment.
 */
export function parseMetaOPolicy(text: string): MetaOPolicy {
  const tables = new Map<string, Record<string, TomlValue>>();
  const errors: string[] = [];
  const lines = text.split("\n");
  let current: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    let line = stripComment(lines[index]!).trim();
    if (line === "") continue;

    if (line.startsWith("[[")) {
      const name = line.slice(2, line.indexOf("]]"));
      if (name.startsWith(PREFIX)) errors.push(`[[${name}]]: arrays of tables are not supported`);
      current = undefined;
      continue;
    }
    if (line.startsWith("[")) {
      const name = line.slice(1, line.indexOf("]")).trim();
      current = name.startsWith(PREFIX) ? name : undefined;
      if (current && !tables.has(current)) tables.set(current, {});
      continue;
    }
    if (!current) continue;

    while (unbalanced(line) && index + 1 < lines.length) {
      index += 1;
      line = `${line} ${stripComment(lines[index]!).trim()}`;
    }
    const equals = line.indexOf("=");
    if (equals < 0) {
      errors.push(`[${current}]: cannot read line ${index + 1}: ${line}`);
      continue;
    }
    const key = line.slice(0, equals).trim().replace(/^["']|["']$/g, "");
    try {
      tables.get(current)![key] = parseValue(line.slice(equals + 1));
    } catch (error) {
      errors.push(`[${current}] ${key}: ${(error as Error).message}`);
    }
  }

  return { tables, errors };
}

/** §M-POLICY — One way a project's quality policy got weaker than its base revision. */
export interface PolicyWeakening {
  source: string;
  key: string;
  kind:
    | "threshold_raised"
    | "minimum_lowered"
    | "ratchet_disabled"
    | "scope_narrowed"
    | "exemption_added"
    | "section_removed"
    | "baseline_added"
    | "baseline_raised"
    | "changed";
  detail: string;
}

/** §M-POLICY — List keys whose members may only be added to, never removed. */
const RESTRICTION_LISTS = /^(source_roots|layers|independent|forbidden_edges|first_party_prefixes)$/;

/** §M-POLICY — List keys whose members are excuses, so growth is the weakening. */
const EXEMPTION_LISTS = /^(exempt_|ignore_|allow_|skip_|permit_)/;

/** §M-POLICY — Booleans that weaken by being switched on rather than off. */
const PERMISSIVE_FLAGS = /^(allow_|permit_|skip_|ignore_|disable_)/;

/** §M-POLICY — Render a TOML value for a human-readable diff. */
function show(value: TomlValue | undefined): string {
  if (value === undefined) return "unset";
  return Array.isArray(value) ? `[${value.join(", ")}]` : String(value);
}

/** §M-POLICY — Classify one changed key of one `[tool.meta_o.*]` table. */
function classifyKey(
  source: string,
  key: string,
  before: TomlValue | undefined,
  after: TomlValue,
): PolicyWeakening | undefined {
  const detail = `${key} changed from ${show(before)} to ${show(after)}`;
  if (Array.isArray(after)) {
    const previous = new Set((Array.isArray(before) ? before : []).map(String));
    const now = new Set(after.map(String));
    if (RESTRICTION_LISTS.test(key) && before !== undefined) {
      const dropped = [...previous].filter((item) => !now.has(item));
      if (dropped.length > 0) {
        return { source, key, kind: "scope_narrowed", detail: `${key} no longer covers ${dropped.join(", ")}` };
      }
      return undefined;
    }
    if (EXEMPTION_LISTS.test(key)) {
      const added = [...now].filter((item) => !previous.has(item));
      if (added.length > 0) {
        return { source, key, kind: "exemption_added", detail: `${key} now excuses ${added.join(", ")}` };
      }
      return undefined;
    }
    return { source, key, kind: "changed", detail };
  }

  if (typeof after === "boolean") {
    const permissive = PERMISSIVE_FLAGS.test(key);
    const weakened = permissive ? after === true && before !== true : after === false && before !== false;
    return weakened ? { source, key, kind: "ratchet_disabled", detail } : undefined;
  }

  if (typeof after === "number" && typeof before === "number") {
    if (/^max_|_max$/.test(key) && after > before) return { source, key, kind: "threshold_raised", detail };
    if (/^min_|_min$/.test(key) && after < before) return { source, key, kind: "minimum_lowered", detail };
    if (/^max_|_max$|^min_|_min$/.test(key)) return undefined;
  }

  return { source, key, kind: "changed", detail };
}

/**
 * §M-POLICY — Compare the `[tool.meta_o.*]` policy of two revisions.
 *
 * A key whose direction of weakening is not knowable — an arbitrary number, a
 * changed baseline path — is reported as `changed` rather than dropped. Only a
 * human can say whether pointing a gate at a different baseline file is a
 * migration or an escape, and this gate exists to put that question in front of
 * one.
 */
export function detectPolicyWeakening(before: MetaOPolicy, after: MetaOPolicy): PolicyWeakening[] {
  const found: PolicyWeakening[] = [];

  for (const [table, previous] of before.tables) {
    const now = after.tables.get(table);
    const source = `pyproject.toml [${table}]`;
    if (!now) {
      found.push({
        source,
        key: "*",
        kind: "section_removed",
        detail: `[${table}] was removed, so the gate falls back to its built-in defaults`,
      });
      continue;
    }
    for (const [key, value] of Object.entries(now)) {
      if (JSON.stringify(previous[key]) === JSON.stringify(value)) continue;
      const weakening = classifyKey(source, key, previous[key], value);
      if (weakening) found.push(weakening);
    }
    for (const key of Object.keys(previous)) {
      if (!(key in now)) {
        found.push({
          source,
          key,
          kind: "changed",
          detail: `${key} was removed, so its built-in default applies instead of ${show(previous[key])}`,
        });
      }
    }
  }

  for (const [table, now] of after.tables) {
    if (before.tables.has(table)) continue;
    const source = `pyproject.toml [${table}]`;
    for (const [key, value] of Object.entries(now)) {
      const weakening = classifyKey(source, key, undefined, value);
      if (weakening) found.push(weakening);
    }
  }

  return found;
}

/**
 * §M-POLICY — Flatten a ratchet baseline to comparable numeric entries.
 *
 * Both baseline shapes reduce to "named things with a magnitude": a
 * `path::rule::symbol` measurement, a fan-in count, or a frozen cycle (present
 * or not, hence magnitude one). Flattening them the same way means a new
 * baseline format cannot slip past this comparison by being shaped differently.
 */
export function flattenBaseline(value: JsonValue, prefix = ""): Map<string, number> {
  const entries = new Map<string, number>();
  const walk = (node: JsonValue, path: string): void => {
    if (typeof node === "number") {
      entries.set(path, node);
      return;
    }
    if (typeof node === "boolean" || typeof node === "string" || node === null) {
      entries.set(`${path}=${JSON.stringify(node)}`, 1);
      return;
    }
    if (Array.isArray(node)) {
      for (const [index, item] of node.entries()) {
        const scalars = Array.isArray(item) && item.every((part) => typeof part === "string");
        walk(item as JsonValue, scalars ? `${path}[${(item as string[]).join("→")}]` : `${path}[${index}]`);
      }
      return;
    }
    for (const [key, item] of Object.entries(node)) {
      walk(item as JsonValue, path === "" ? key : `${path}.${key}`);
    }
  };
  walk(value, prefix);
  return entries;
}

/**
 * §M-POLICY — Compare two revisions of a ratchet baseline file.
 *
 * The checkers already refuse to *write* a worse baseline. This catches the
 * other route: editing the JSON by hand, or restoring an older file. A frozen
 * value that grew, or an entry that appeared, is debt the project agreed to
 * stop accruing.
 */
export function detectBaselineWeakening(
  source: string,
  before: JsonValue,
  after: JsonValue,
): PolicyWeakening[] {
  const previous = flattenBaseline(before);
  const now = flattenBaseline(after);
  const found: PolicyWeakening[] = [];

  for (const [key, value] of now) {
    const was = previous.get(key);
    if (was === undefined) {
      found.push({
        source,
        key,
        kind: "baseline_added",
        detail: `${key} was frozen at ${value}; it was not in the baseline at the base revision`,
      });
      continue;
    }
    if (value > was) {
      found.push({
        source,
        key,
        kind: "baseline_raised",
        detail: `${key} was re-frozen at ${value}, worse than the baselined ${was}`,
      });
    }
  }

  return found;
}
