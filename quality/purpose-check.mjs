#!/usr/bin/env node
/**
 * §M-QC-PURPOSE — Prove every TypeScript module and export says why it exists.
 *
 * Implements §A-CAUSAL-KNOWLEDGE for this project's own sources. A module whose
 * reason for existing lives only in someone's head is a module that gets
 * rewritten rather than changed, and the rewrite loses the constraint nobody
 * wrote down.
 *
 * Checks presence and linkage, never wording. Whether a purpose is any good is
 * a judgement for reviewers; a checker that graded prose would produce prose
 * written for the checker.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** §M-QC-PURPOSE — Repository root. */
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  encoding: "utf8",
}).trim();

const MODULE_ANCHOR = /§M-[A-Z0-9-]+/;
const ARCHITECTURE_ANCHOR = /§A-[A-Z0-9-]+/;
const BUSINESS_ANCHOR = /§B-[A-Z0-9-]+/;

/** §M-QC-PURPOSE — Declarations that must carry their own documentation comment. */
const EXPORTED = new RegExp(
  "^export\\s+(?:declare\\s+)?(?:async\\s+)?(?:abstract\\s+)?" +
    "(class|function|const|interface|type|enum)\\s+([A-Za-z_$][\\w$]*)",
);

/** §M-QC-PURPOSE — Members of an exported class, which callers also depend on. */
const MEMBER =
  /^ {2}(?:public |private |protected )?(?:readonly |static |async |override )*([A-Za-z_$][\w$]*)\s*(?:\(|<|:)/;

/** §M-QC-PURPOSE — Every tracked source file the gate is responsible for. */
function sourceFiles() {
  return execFileSync("git", ["ls-files", "src/**/*.mts", "tests/**/*.mts", "quality/*.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

/** §M-QC-PURPOSE — One violation, rendered so an editor can jump to it. */
function violation(found, file, line, rule, message) {
  found.push(`${file}:${line}: [${rule}] ${message}`);
}

/**
 * §M-QC-PURPOSE — Whether the lines immediately above a declaration document it.
 *
 * Walks back over decorators and blank lines to the nearest block comment, so
 * that documentation stays valid when a declaration grows attributes.
 */
function documentedAbove(lines, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const text = lines[cursor].trim();
    if (text === "" || text.startsWith("@")) continue;
    return text.endsWith("*/");
  }
  return false;
}

/** §M-QC-PURPOSE — Check one file's module docstring, exports and class members. */
function checkFile(file, found) {
  const text = readFileSync(`${ROOT}/${file}`, "utf8");
  const lines = text.split("\n");

  const header = text.slice(0, text.indexOf("*/") + 2);
  if (!text.trimStart().startsWith("/**") && !text.trimStart().startsWith("#!")) {
    violation(found, file, 1, "module-purpose", "the file opens with no documentation comment");
  } else if (!MODULE_ANCHOR.test(header)) {
    violation(
      found,
      file,
      1,
      "module-anchor",
      "the module comment declares no §M-* anchor, so nothing links it to the knowledge chain",
    );
  } else if (
    file.startsWith("src/") &&
    !ARCHITECTURE_ANCHOR.test(header) &&
    BUSINESS_ANCHOR.test(header)
  ) {
    violation(
      found,
      file,
      1,
      "level-skipped",
      "the module cites a §B-* directly; it must cite its nearest §A-* level instead",
    );
  }

  let inClass = false;
  lines.forEach((line, index) => {
    const exported = EXPORTED.exec(line);
    if (exported) {
      inClass = exported[1] === "class";
      if (!documentedAbove(lines, index)) {
        violation(
          found,
          file,
          index + 1,
          "symbol-purpose",
          `exported ${exported[1]} ${exported[2]} has no documentation comment`,
        );
      }
      return;
    }
    if (line === "}") inClass = false;
    if (!inClass) return;

    const member = MEMBER.exec(line);
    if (!member || line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    if (!documentedAbove(lines, index)) {
      violation(found, file, index + 1, "member-purpose", `${member[1]} has no documentation comment`);
    }
  });
}

const found = [];
for (const file of sourceFiles()) checkFile(file, found);

for (const message of found) process.stdout.write(`${message}\n`);
process.stdout.write(
  found.length > 0 ? `purpose: ${found.length} violation(s)\n` : "purpose: ok\n",
);
process.exitCode = found.length > 0 ? 1 : 0;
