#!/usr/bin/env node
/**
 * §M-QC-CODE-HEALTH — Hold the line on file size, line length and nesting.
 *
 * Implements §A-AUTHORITATIVE-QC. None of these numbers is a truth about
 * software; they are a truth about attention. Past a certain size a function is
 * skimmed rather than read, and the bug that hides there is found in
 * production.
 *
 * Structure is measured from indentation rather than from a parsed syntax tree,
 * because buying exactness would mean depending on the TypeScript compiler API
 * from a script that must keep working when `node_modules` is absent.
 *
 * That approximation is why the numbers here are looser than the AST-based ones
 * `templates/python` ships. Indentation also counts a multi-line object literal
 * and a callback body as nesting, which real block depth does not — so the
 * limit is set where it still catches runaway structure without punishing an
 * argument list that happens to span four lines. The limits are stated, not
 * inherited: this project accepted them, and a project copying this file is
 * expected to argue with them.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** §M-QC-CODE-HEALTH — Repository root, resolved from this script rather than the caller. */
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  encoding: "utf8",
}).trim();

/** §M-QC-CODE-HEALTH — Thresholds this project has accepted, deliberately. */
const LIMITS = {
  fileLines: 700,
  lineLength: 118,
  indentation: 7,
  functionLines: 80,
  classLines: 500,
};

/** §M-QC-CODE-HEALTH — Tracked sources this gate applies to. */
function sources() {
  return execFileSync("git", ["ls-files", "src/**/*.mts", "quality/*.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

/** §M-QC-CODE-HEALTH — Indentation level of a line, in two-space steps. */
function depthOf(line) {
  const leading = /^ */.exec(line)[0].length;
  return Math.floor(leading / 2);
}

/**
 * §M-QC-CODE-HEALTH — Length of the block a top-level declaration opens.
 *
 * Counts from a declaration that ends in `{` to the first line that closes it
 * at the same indentation. Comments and blank lines are included, because a
 * reader has to travel past them too.
 */
function blockLength(lines, start) {
  const indent = depthOf(lines[start]);
  for (let cursor = start + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (line.trim() === "") continue;
    if (depthOf(line) <= indent && /^\s*[})\];]/.test(line)) return cursor - start + 1;
  }
  return lines.length - start;
}

/** §M-QC-CODE-HEALTH — Lines that open a declaration whose size this gate measures. */
const DECLARATION = /^\s{0,2}(?:export\s+)?(?:async\s+)?(?:function|class|const\s+\w+\s*=\s*(?:async\s*)?\()/;

const problems = [];
for (const file of sources()) {
  const text = readFileSync(`${ROOT}/${file}`, "utf8");
  const lines = text.split("\n");

  if (lines.length > LIMITS.fileLines) {
    problems.push(`${file}:1: [file-lines] ${lines.length} lines exceeds ${LIMITS.fileLines}`);
  }

  let inComment = false;
  lines.forEach((line, index) => {
    if (line.length > LIMITS.lineLength) {
      problems.push(`${file}:${index + 1}: [line-length] ${line.length} columns exceeds ${LIMITS.lineLength}`);
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("/*")) inComment = true;
    const wasComment = inComment;
    if (trimmed.endsWith("*/")) inComment = false;
    if (wasComment || trimmed.startsWith("//") || trimmed === "") return;

    if (depthOf(line) > LIMITS.indentation) {
      problems.push(
        `${file}:${index + 1}: [indentation] indented ${depthOf(line)} levels, over ${LIMITS.indentation}`,
      );
    }

    if (DECLARATION.test(line) && line.trimEnd().endsWith("{")) {
      const isClass = /\bclass\b/.test(line);
      const limit = isClass ? LIMITS.classLines : LIMITS.functionLines;
      const length = blockLength(lines, index);
      if (length > limit) {
        const rule = isClass ? "class-lines" : "function-lines";
        problems.push(`${file}:${index + 1}: [${rule}] spans ${length} lines, over ${limit}`);
      }
    }
  });
}

for (const problem of problems) process.stdout.write(`${problem}\n`);
process.stdout.write(problems.length ? `code-health: ${problems.length} problem(s)\n` : "code-health: ok\n");
process.exitCode = problems.length ? 1 : 0;
