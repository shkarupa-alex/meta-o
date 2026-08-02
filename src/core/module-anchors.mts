/**
 * §M-MODULE-ANCHORS — Collection of `§M-*` declarations from tracked source files.
 *
 * Implements §A-CAUSAL-KNOWLEDGE. The chain `§B → §A → §M → symbol` has a link
 * that does not live in Markdown: the module anchor is declared in the source
 * file it describes. Until something reads those declarations, the two rules
 * that matter most about them — every `§M` cites its nearest `§A`, and no `§M`
 * is declared twice — are unenforceable, and `validateChain` receives an empty
 * list that makes it silently skip both.
 *
 * Reading only the file header is deliberate. A module's purpose is stated once,
 * at the top, and scanning the whole file would collect every incidental mention
 * of an anchor in the body as though it were a declaration.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./git.mjs";
import { referencesIn, type ModuleAnchorDefinition } from "./knowledge.mjs";

/** §M-MODULE-ANCHORS — How many leading lines count as the module header. */
export const HEADER_LINES = 60;

/** §M-MODULE-ANCHORS — Extensions whose files are expected to declare a module anchor. */
export const SOURCE_EXTENSIONS = [
  ".mts",
  ".ts",
  ".mjs",
  ".js",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".java",
  ".kt",
  ".cs",
  ".php",
  ".swift",
];

/** §M-MODULE-ANCHORS — Whether a tracked path is a source file this gate reads. */
export function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/**
 * §M-MODULE-ANCHORS — Extract the leading doc comment of a source file.
 *
 * The module's own documentation block, not a fixed slice of lines. Taking the
 * first N lines wholesale reads code as though it were prose: a test whose
 * fixture strings contain example anchors was reported as citing anchors that
 * do not exist, which is a false failure — and false failures are how a gate
 * gets switched off. Supports the three shapes the workflow's languages use: a
 * block comment, a docstring, and a run of line comments.
 */
export function headerOf(text: string): string {
  const lines = text.split("\n").slice(0, HEADER_LINES);
  let index = 0;
  while (index < lines.length && (lines[index]!.trim() === "" || lines[index]!.startsWith("#!"))) {
    index += 1;
  }
  const first = lines[index]?.trim() ?? "";
  const block: string[] = [];

  const closing = /^[rbuf]*("""|''')/.exec(first)?.[1];
  if (closing) {
    const opener = first.slice(first.indexOf(closing) + 3);
    if (opener.includes(closing)) return first;
    for (; index < lines.length; index += 1) {
      block.push(lines[index]!);
      if (block.length > 1 && lines[index]!.includes(closing)) break;
    }
    return block.join("\n");
  }

  if (first.startsWith("/*")) {
    for (; index < lines.length; index += 1) {
      block.push(lines[index]!);
      if (lines[index]!.includes("*/")) break;
    }
    return block.join("\n");
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line.startsWith("//") && !line.startsWith("#")) break;
    block.push(line);
  }
  return block.join("\n");
}

/**
 * §M-MODULE-ANCHORS — Read the `§M` declaration and citations from one header.
 *
 * The first anchor is the declaration and everything else in the header is a
 * citation; a file with no `§M` at all is simply not part of the chain here,
 * because whether it *should* be is the purpose gate's question, not this
 * module's.
 */
export function moduleAnchorOf(path: string, text: string): ModuleAnchorDefinition | undefined {
  const header = headerOf(text);
  const anchors = referencesIn(header);
  const declaration = anchors.find((anchor) => anchor.startsWith("§M-"));
  if (!declaration) return undefined;
  return {
    anchor: declaration,
    path,
    references: anchors.filter((anchor) => anchor !== declaration),
  };
}

/**
 * §M-MODULE-ANCHORS — Collect every module anchor declared in the tracked tree.
 *
 * Tracked files only, from `git ls-files`: an untracked scratch file is not
 * part of the project's knowledge, and a build directory full of generated
 * copies would otherwise register every anchor a second time as a duplicate.
 */
export function collectModuleAnchors(repoDir: string, roots: string[] = []): ModuleAnchorDefinition[] {
  const listed = git(["ls-files", "-z", ...roots], repoDir)
    .split("\0")
    .filter((path) => path !== "" && isSourceFile(path));

  const anchors: ModuleAnchorDefinition[] = [];
  for (const path of listed) {
    let text: string;
    try {
      text = readFileSync(join(repoDir, path), "utf8");
    } catch {
      continue;
    }
    const anchor = moduleAnchorOf(path, text);
    if (anchor) anchors.push(anchor);
  }
  return anchors;
}
