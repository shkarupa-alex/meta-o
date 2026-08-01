#!/usr/bin/env node
/**
 * §M-QC-FORMAT — Enforce the file-level conventions no type checker sees.
 *
 * Implements §A-AUTHORITATIVE-QC. This project has no opinionated formatter, so
 * the gate covers the properties that actually cause diff noise and merge pain:
 * mixed line endings, tabs where the file uses spaces, trailing whitespace and
 * a missing final newline. Each is invisible in review and each poisons every
 * later diff of the same file.
 *
 * Non-mutating by construction: it reports, it never rewrites.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  encoding: "utf8",
}).trim();

/** §M-QC-FORMAT — Files whose format is defined by something other than us. */
const TAB_INDENTED = new Set(["Makefile", "templates/python/Makefile"]);

/** §M-QC-FORMAT — Text files tracked by Git, excluding the imported spec corpus. */
function trackedTextFiles() {
  return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((file) => !file.startsWith("spec/"))
    .filter((file) => /\.(mts|mjs|json|md|py|sh|toml|yml|yaml)$|^Makefile$|Makefile$/.test(file));
}

const problems = [];
for (const file of trackedTextFiles()) {
  const text = readFileSync(`${ROOT}/${file}`, "utf8");
  if (text === "") continue;

  if (text.includes("\r")) problems.push(`${file}:1: carriage return; this repository is LF only`);
  if (!text.endsWith("\n")) problems.push(`${file}:1: no final newline`);

  const markdown = file.endsWith(".md");

  text.split("\n").forEach((line, index) => {
    const trailing = /[ \t]+$/.exec(line);
    // Exactly two trailing spaces are a hard line break in Markdown, so there
    // they are content; everywhere else trailing whitespace is noise in every
    // future diff of the same file.
    const hardBreak = markdown && trailing?.[0] === "  " && line.trim() !== "";
    if (trailing && !hardBreak) problems.push(`${file}:${index + 1}: trailing whitespace`);
    if (line.includes("\t") && !TAB_INDENTED.has(file)) {
      problems.push(`${file}:${index + 1}: tab in a space-indented file`);
    }
  });
}

for (const problem of problems) process.stdout.write(`${problem}\n`);
process.stdout.write(problems.length ? `format-check: ${problems.length} problem(s)\n` : "format-check: ok\n");
process.exitCode = problems.length ? 1 : 0;
