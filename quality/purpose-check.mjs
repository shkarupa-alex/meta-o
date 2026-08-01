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

/** §M-QC-PURPOSE — Grammar of the module anchor a file must declare. */
const MODULE_ANCHOR = /§M-[A-Z0-9-]+/;

/** §M-QC-PURPOSE — Grammar of the architecture anchor a module should cite. */
const ARCHITECTURE_ANCHOR = /§A-[A-Z0-9-]+/;

/** §M-QC-PURPOSE — Grammar of a business anchor, cited only to detect a skipped level. */
const BUSINESS_ANCHOR = /§B-[A-Z0-9-]+/;

/**
 * §M-QC-PURPOSE — Declarations that must carry their own documentation comment.
 *
 * Top-level, exported or not. A non-exported helper is still a symbol someone
 * has to understand before changing it, and the old export-only rule meant the
 * functions carrying the trickiest local reasoning — the private ones — were
 * the only ones allowed to say nothing about why they exist.
 */
const DECLARATION = new RegExp(
  "^(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:async\\s+)?(?:abstract\\s+)?" +
    "(class|function|const|let|interface|type|enum)\\s+([A-Za-z_$][\\w$]*)",
);

/**
 * §M-QC-PURPOSE — Whether a binding is a decision or a working variable.
 *
 * Functions, classes and types always carry reasoning worth stating. Bindings
 * do not: an exported one or a named constant encodes a choice someone made and
 * must justify, while `const problems = []` in a script's main flow is
 * scaffolding. Demanding a comment there produces comments that restate the
 * name, and those are what make readers stop trusting the comments that matter.
 */
function requiresPurpose(line, kind, name) {
  if (kind !== "const" && kind !== "let") return true;
  return line.startsWith("export") || /^[A-Z][A-Z0-9_]*$/.test(name);
}

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
  return commentAbove(lines, index) !== undefined;
}

/**
 * §M-QC-PURPOSE — The documentation comment attached to a declaration, if any.
 *
 * Returns the whole block so the caller can ask what it says, not merely
 * whether it exists — the `symbol → §M` link is a property of the text.
 */
function commentAbove(lines, index) {
  let end = -1;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const text = lines[cursor].trim();
    if (text === "" || text.startsWith("@")) continue;
    if (!text.endsWith("*/")) return undefined;
    end = cursor;
    break;
  }
  if (end < 0) return undefined;

  for (let cursor = end; cursor >= 0; cursor -= 1) {
    if (lines[cursor].trim().startsWith("/*")) return lines.slice(cursor, end + 1).join("\n");
  }
  return undefined;
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

  const moduleAnchor = MODULE_ANCHOR.exec(header)?.[0];

  let inClass = false;
  lines.forEach((line, index) => {
    const declaration = DECLARATION.exec(line);
    if (declaration) {
      inClass = declaration[1] === "class";
      if (requiresPurpose(line, declaration[1], declaration[2])) {
        checkSymbol(found, file, lines, index, `${declaration[1]} ${declaration[2]}`, moduleAnchor);
      }
      return;
    }
    if (line === "}") inClass = false;
    if (!inClass) return;

    const member = MEMBER.exec(line);
    if (!member || line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    checkSymbol(found, file, lines, index, member[1], moduleAnchor);
  });
}

/**
 * §M-QC-PURPOSE — Require a symbol to be documented and linked to its module.
 *
 * Presence alone leaves the chain broken at its last link: a docstring that
 * names no `§M-*` documents a symbol in isolation, and the whole point of
 * `§B → §A → §M → symbol` is that someone standing at the symbol can walk back
 * up to the business reason it exists.
 */
function checkSymbol(found, file, lines, index, what, moduleAnchor) {
  const comment = commentAbove(lines, index);
  if (comment === undefined) {
    violation(found, file, index + 1, "symbol-purpose", `${what} has no documentation comment`);
    return;
  }
  if (moduleAnchor && !comment.includes(moduleAnchor)) {
    violation(
      found,
      file,
      index + 1,
      "symbol-anchor",
      `${what} is documented but cites no ${moduleAnchor}, so nothing links it to the chain`,
    );
  }
}

const found = [];
for (const file of sourceFiles()) checkFile(file, found);

for (const message of found) process.stdout.write(`${message}\n`);
process.stdout.write(
  found.length > 0 ? `purpose: ${found.length} violation(s)\n` : "purpose: ok\n",
);
process.exitCode = found.length > 0 ? 1 : 0;
