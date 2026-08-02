#!/usr/bin/env node
/**
 * §M-QC-PURPOSE — Prove every TypeScript module and symbol says why it exists.
 *
 * Implements §A-CAUSAL-KNOWLEDGE for this project's own sources. A module whose
 * reason for existing lives only in someone's head is a module that gets
 * rewritten rather than changed, and the rewrite loses the constraint nobody
 * wrote down.
 *
 * Checks presence and linkage, never wording. Whether a purpose is any good is
 * a judgement for reviewers; a checker that graded prose would produce prose
 * written for the checker.
 *
 * Symbols are found through the TypeScript parser rather than by matching
 * column-0 text. The line-anchored version could only see top-level
 * declarations, which exempted exactly the functions carrying the trickiest
 * local reasoning — the nested helpers — and made every fixture inside a
 * template literal look like real code.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

/** §M-QC-PURPOSE — Every tracked source file the gate is responsible for. */
function sourceFiles() {
  // `*` and not `**/`: git's `**/` requires at least one intermediate
  // directory, so `tests/**/*.mts` matched none of the thirteen files sitting
  // directly in `tests/` and the gate ran blind over its own test suite.
  return execFileSync("git", ["ls-files", "src/**", "tests/**", "quality/*.mjs"], {
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
 * §M-QC-PURPOSE — The documentation comment attached to a node, if any.
 *
 * Returns the whole block so the caller can ask what it says, not merely
 * whether it exists — the `symbol → §M` link is a property of the text.
 */
function commentOf(text, node) {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  const blocks = ranges.filter((range) => range.kind === ts.SyntaxKind.MultiLineCommentTrivia);
  const last = blocks[blocks.length - 1];
  return last ? text.slice(last.pos, last.end) : undefined;
}

/**
 * §M-QC-PURPOSE — Whether a variable binding is a decision or a working variable.
 *
 * Functions, classes and types always carry reasoning worth stating. Bindings
 * do not: an exported one, a named constant, or one holding a function encodes
 * a choice someone made and must justify, while `const problems = []` in a
 * script's main flow is scaffolding. Demanding a comment there produces
 * comments that restate the name, and those are what make readers stop trusting
 * the comments that matter.
 */
function bindingRequiresPurpose(declaration, exported) {
  if (exported) return true;
  const name = declaration.name;
  if (ts.isIdentifier(name) && /^[A-Z][A-Z0-9_]*$/.test(name.text)) return true;
  const initializer = declaration.initializer;
  return Boolean(
    initializer &&
      (ts.isArrowFunction(initializer) ||
        ts.isFunctionExpression(initializer) ||
        ts.isClassExpression(initializer)),
  );
}

/** §M-QC-PURPOSE — Whether a node carries the `export` modifier. */
function isExported(node) {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
}

/** §M-QC-PURPOSE — Name a declaration the way a reader would refer to it. */
function describe(node) {
  const name = node.name && ts.isIdentifier(node.name) ? node.name.text : "«anonymous»";
  if (ts.isFunctionDeclaration(node)) return `function ${name}`;
  if (ts.isClassDeclaration(node)) return `class ${name}`;
  if (ts.isInterfaceDeclaration(node)) return `interface ${name}`;
  if (ts.isTypeAliasDeclaration(node)) return `type ${name}`;
  if (ts.isEnumDeclaration(node)) return `enum ${name}`;
  if (ts.isVariableDeclaration(node)) return `binding ${name}`;
  return `member ${name}`;
}

/**
 * §M-QC-PURPOSE — Every declaration in one file that owes the reader a reason.
 *
 * Class members count because callers depend on them; nested functions count
 * because someone has to understand them before changing them. Anonymous
 * callbacks do not: they are an expression's shape, not a named thing anyone
 * navigates to.
 */
function declarationsOf(source) {
  const nodes = [];
  /** §M-QC-PURPOSE — Recurse into every child, so nesting depth never grants an exemption. */
  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      if (node.name) nodes.push({ node, documented: node });
    } else if (ts.isVariableStatement(node)) {
      const exported = isExported(node);
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && bindingRequiresPurpose(declaration, exported)) {
          nodes.push({ node: declaration, documented: node });
        }
      }
    } else if (
      (ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isPropertyDeclaration(node)) &&
      node.parent &&
      (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent)) &&
      ts.isIdentifier(node.name)
    ) {
      nodes.push({ node, documented: node });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return nodes;
}

/** §M-QC-PURPOSE — Check one file's module comment and every symbol it declares. */
function checkFile(file, found) {
  const text = readFileSync(`${ROOT}/${file}`, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true);
  /** §M-QC-PURPOSE — Turn a source offset into the 1-based line an editor jumps to. */
  const lineOf = (position) => source.getLineAndCharacterOfPosition(position).line + 1;

  const headerRanges = ts.getLeadingCommentRanges(text, text.startsWith("#!") ? text.indexOf("\n") : 0);
  const headerRange = (headerRanges ?? []).find(
    (range) => range.kind === ts.SyntaxKind.MultiLineCommentTrivia,
  );
  const header = headerRange ? text.slice(headerRange.pos, headerRange.end) : "";

  if (header === "") {
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
  for (const { node, documented } of declarationsOf(source)) {
    const comment = commentOf(text, documented);
    const what = describe(node);
    const line = lineOf(node.getStart(source));
    if (comment === undefined) {
      violation(found, file, line, "symbol-purpose", `${what} has no documentation comment`);
      continue;
    }
    if (moduleAnchor && !comment.includes(moduleAnchor)) {
      violation(
        found,
        file,
        line,
        "symbol-anchor",
        `${what} is documented but cites no ${moduleAnchor}, so nothing links it to the chain`,
      );
    }
  }
}

/** §M-QC-PURPOSE — Violations found across every tracked source file. */
const found = [];
for (const file of sourceFiles()) checkFile(file, found);

for (const message of found) process.stdout.write(`${message}\n`);
process.stdout.write(
  found.length > 0 ? `purpose: ${found.length} violation(s)\n` : "purpose: ok\n",
);
process.exitCode = found.length > 0 ? 1 : 0;
