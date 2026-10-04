/**
 * Read skill text and helper output exactly as the harnesses recorded them.
 *
 * Attributing a historical session to a skill version means comparing what the
 * agent saw with committed bytes, so the rules for "what did it see" live in
 * one place and are shared by the extractors and the history walk. There is no
 * YAML dependency on purpose: only the literal `metadata.source_tree` line the
 * build writes is read, and anything fancier is not evidence of that line.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

import { excerpt } from "./mo-debug-redact.mjs";

const SOURCE_TREE = /^source_tree:\s*(["']?)([0-9a-f]{40})\1\s*$/u;
const FRONTMATTER_BLOCK = /(?:^|\n)---\n([\s\S]*?)\n---(?:\n|$)/gu;
// A helper counts as run only when it is executed: the script itself, or
// `node [flags]` in front of it, stands at a command position (the start of
// the text or after `;`, `&`, `|`, `(` or a newline), behind at most variable
// assignments and the env/timeout-style wrappers a caller puts in front.
// Reading, grepping, printing or diffing the script's name makes it an
// argument of another program, and that is not a call.
const WRAPPER = String.raw`(?:[A-Za-z_]\w*=\S*\s+)*(?:(?:env|timeout|time|nice|exec|command)(?:\s+(?:-[-\w]*(?:=\S*)?|[A-Za-z_]\w*=\S*|[A-Z_][A-Z0-9_]*|\d+(?:\.\d+)?[smhd]?))*\s+)*`;
const HELPER = new RegExp(
  String.raw`(?:^|[;&|(\n])\s*${WRAPPER}(?:node\s+(?:-[-\w=]*\s+)*)?["']?(?:[^\s"';&|]*\/)?(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\.mjs\b`,
  "gu",
);
const SKILL_DIR = /(?:^|[\s/'"=])(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\/(?:scripts|SKILL\.md)\b/u;
const TYPED_LINE = /^MO-[A-Z0-9-]+(?:\/\d+)?\b.*$/gmu;

/** §A-DIAGNOSTICS-01 validates a Meta-O skill name before it becomes a path. */
export const SKILL_NAME = /^mo-[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * §A-DIAGNOSTICS-01 splits a SKILL.md into its frontmatter and body.
 *
 * @param {string} text complete SKILL.md bytes decoded as UTF-8
 * @returns {{frontmatter: string, body: string} | null} null without a closed block
 */
export function splitFrontmatter(text) {
  if (!text.startsWith("---\n")) return null;
  const close = text.indexOf("\n---\n", 3);
  if (close === -1) return null;
  return { frontmatter: text.slice(4, close), body: text.slice(close + 5) };
}

/**
 * §A-DIAGNOSTICS-01 reads `source_tree` from the `metadata:` mapping only.
 *
 * The value counts only as a direct child of a top-level `metadata:` key, at
 * the indentation of that mapping's first child; the same words in a
 * description or a nested mapping are not the build's stamp.
 *
 * @param {string} frontmatter text between the `---` fences
 * @returns {string|null} the 40-hex tree id, or null when absent
 */
export function metadataSourceTree(frontmatter) {
  const lines = frontmatter.split("\n");
  const start = lines.findIndex((line) => /^metadata:\s*$/u.test(line));
  if (start === -1) return null;
  let indent = null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    const width = line.length - line.trimStart().length;
    if (width === 0) break;
    indent ??= width;
    if (width !== indent) continue;
    const match = SOURCE_TREE.exec(line.trim());
    if (match) return match[2];
  }
  return null;
}

/**
 * §A-DIAGNOSTICS-01 finds the stamp of one named skill inside recorded output.
 *
 * Codex often reads several files in one command, so the frontmatter of the
 * wanted skill may sit in the middle of the output. Only a closed block whose
 * own `name:` is this skill is read.
 *
 * @param {string} text recorded output that may contain the SKILL.md
 * @param {string} name skill name the block must declare
 * @returns {string|null} the 40-hex tree id, or null
 */
export function sourceTreeIn(text, name) {
  for (const match of text.matchAll(FRONTMATTER_BLOCK)) {
    const block = match[1];
    const declared = block.split("\n").some((line) => {
      const value = /^name:\s*(["']?)([^"'\s]+)\1\s*$/u.exec(line);
      return value?.[2] === name;
    });
    if (declared) return metadataSourceTree(block);
  }
  return null;
}

/**
 * §A-DIAGNOSTICS-01 reproduces the text Claude Code shows for a loaded skill.
 *
 * Verified against real transcripts: Claude removes the frontmatter block and
 * every newline directly after its closing fence, and keeps the rest byte for
 * byte, including the final newline. Arguments, when given, are appended after
 * the body as `\n\nARGUMENTS: <args>`; `claudeBodyCandidates` strips that.
 *
 * @param {string} file complete committed SKILL.md
 * @returns {string|null} the body Claude would show, or null without frontmatter
 */
export function claudeBody(file) {
  const split = splitFrontmatter(file);
  return split === null ? null : split.body.replace(/^\n+/u, "");
}

/**
 * §A-DIAGNOSTICS-01 lists the texts a recorded Claude load may be equal to.
 *
 * Only the suffix built from the arguments recorded for this very load is
 * removed. A body may itself contain `ARGUMENTS:`, and a locally edited skill
 * may end with it; cutting at the marker alone would make that edited text
 * equal to an older committed body and attribute bytes the agent never read.
 *
 * @param {string} shown text after the `Base directory for this skill:` line
 * @param {string|null} args arguments recorded for this load, when known
 * @returns {string[]} the shown text, and the text without that exact suffix
 */
export function claudeBodyCandidates(shown, args) {
  const candidates = [shown];
  const suffix = typeof args === "string" && args !== "" ? `\n\nARGUMENTS: ${args}` : null;
  if (suffix && shown.endsWith(suffix)) candidates.push(shown.slice(0, -suffix.length));
  return candidates;
}

/**
 * §A-DIAGNOSTICS-01 names the skill an installed `SKILL.md` read belongs to.
 *
 * Both harness extractors apply this one rule. A harness loads an installed copy
 * under some `skills/<name>/` directory; the authored source under
 * `src/skills/` is what a developer edits, and a `SKILL.md` outside a
 * `skills/<name>/` directory is no install at all, so neither is a skill load.
 *
 * @param {string} path file path the agent read
 * @returns {string|null} the skill name, or null when the read is no load
 */
export function installedSkillName(path) {
  const match = /(?:^|\/)skills\/(mo-[a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md$/u.exec(path);
  return match && !/(?:^|\/)src\/skills\//u.test(path) ? match[1] : null;
}

/**
 * §A-DIAGNOSTICS-01 names the Meta-O helper scripts a shell command runs.
 *
 * @param {string} command recorded command text
 * @returns {string[]} distinct helper names such as `mo-review-report`
 */
export function helperNames(command) {
  return [...new Set([...String(command).matchAll(HELPER)].map((match) => match[1]))];
}

/**
 * §A-DIAGNOSTICS-01 names the skill whose directory a command touches.
 *
 * @param {string} command recorded command text
 * @returns {string} the skill name, or `-` when none is visible
 */
export function owningSkill(command) {
  return SKILL_DIR.exec(String(command))?.[1] ?? "-";
}

/**
 * §A-DIAGNOSTICS-01 finds the typed `MO-*` result lines in helper output.
 *
 * @param {string} output recorded stdout and stderr
 * @returns {string[]} at most four typed lines, in output order
 */
export function typedLines(output) {
  const text = String(output ?? "").slice(0, 65536);
  return [...text.matchAll(TYPED_LINE)].map((match) => match[0].trim()).slice(0, 4);
}

/**
 * §A-DIAGNOSTICS-01 keeps the typed `MO-*` result lines of helper output.
 *
 * @param {string} output recorded stdout and stderr
 * @returns {string} the typed lines joined by ` ; `, or the first non-empty line
 */
export function typedResult(output) {
  const typed = typedLines(output);
  if (typed.length > 0) return typed.join(" ; ");
  return (
    String(output ?? "")
      .slice(0, 65536)
      .split("\n")
      .find((line) => line.trim() !== "") ?? ""
  );
}

/**
 * §A-DIAGNOSTICS-01 collects one session's events and loaded skill texts.
 *
 * Events are redacted at the moment they are recorded, so no unredacted byte
 * is ever held in the result. Loaded texts stay raw only for the byte-exact
 * history comparison and never reach an output.
 *
 * @param {string} session session id used in every locator
 * @param {"claude"|"codex"} harness which harness wrote the session
 * @returns {{session: string, harness: string, recognized: number, events: object[],
 *   loads: object[], event: Function, load: Function}} the collector
 */
export function createEvidence(session, harness) {
  const evidence = { session, harness, recognized: 0, events: [], loads: [] };
  evidence.event = (number, kind, skill, text) => {
    evidence.events.push({
      session,
      harness,
      locator: `${session}:${number}`,
      kind,
      skill: SKILL_NAME.test(skill ?? "") ? skill : "-",
      excerpt: excerpt(text),
    });
  };
  evidence.load = (number, load) => {
    evidence.loads.push({ session, harness, locator: `${session}:${number}`, ...load });
  };
  return evidence;
}
