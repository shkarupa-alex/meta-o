/**
 * Render the `mo-debug` Markdown report the classifying agent fills in.
 *
 * The helper extracts and the agent classifies, so the report carries the
 * category headings empty and the evidence below them. Every value placed here
 * was redacted when it was recorded; this module adds only Markdown escaping,
 * so a session byte cannot turn into a heading, a link or a table break.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

import { token } from "./mo-debug-redact.mjs";

/** §A-DIAGNOSTICS-01 names the only verdicts the classifying agent may assign. */
export const CATEGORIES = [
  "skill_text_defect",
  "agent_deviation",
  "backend_defect",
  "harness_defect",
  "unknown",
];

function cell(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/gu, " ")
    .replace(/[\\`*_{}[\]()#+!|<>~]/gu, (character) => `\\${character}`);
}

function table(header, rows) {
  if (rows.length === 0) return ["_None._"];
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ];
}

/**
 * §A-DIAGNOSTICS-01 renders one scan result as the report Markdown.
 *
 * @param {{lines: string[], sessions: object[], events: object[],
 *   attributions: object[]}} result value returned by `scan`
 * @returns {string} Markdown text ending in a newline
 */
export function renderReport(result) {
  const lines = [
    "# mo-debug report",
    "",
    "Evidence extracted from local session logs. Every excerpt is redacted and",
    "bounded; absolute paths are reduced to `<path>/<basename>`.",
    "",
    "```text",
    ...result.lines.filter((line) => !line.startsWith("skill ")),
    "```",
    "",
    "## Classification",
    "",
  ];
  for (const category of CATEGORIES) {
    lines.push(`### ${category}`, "", "_To classify._", "");
  }
  lines.push("## Events", "");
  lines.push(
    ...table(
      ["Locator", "Kind", "Skill", "Excerpt"],
      result.events.map((event) => [token(event.locator), event.kind, event.skill, event.excerpt]),
    ),
  );
  lines.push("", "## Version attributions", "");
  lines.push(
    ...table(
      ["Session", "Skill", "Version", "Commits", "History"],
      result.attributions.map((item) => [
        token(item.session),
        item.name,
        item.version,
        item.commits,
        item.history,
      ]),
    ),
  );
  return `${lines.join("\n")}\n`;
}
