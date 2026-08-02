/**
 * §M-KNOWLEDGE-FILES — Which Markdown files make up the knowledge layer.
 *
 * Implements §A-CAUSAL-KNOWLEDGE. Two callers ask this question — preflight,
 * which reports whether the chain is sound before a run starts, and the
 * `knowledge validate` gate, which blocks on it — and they answered it
 * differently. The gate walked `docs/knowledge` recursively; preflight read
 * `business.md` and one flat listing of `architecture/`. So a project that
 * parked a retired spec in `docs/knowledge/archive/`, or grouped its
 * architecture documents into subdirectories, got a green preflight and a red
 * gate, with no clue in either message that they had read different trees.
 *
 * Separate from `knowledge.mts` because that module is pure: it takes documents
 * and validates them, and is the easier to test for it.
 */

import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";

/** §M-KNOWLEDGE-FILES — Directory the knowledge layer lives in. */
export const KNOWLEDGE_ROOT = "docs/knowledge";

/**
 * §M-KNOWLEDGE-FILES — Every Markdown file under a directory, tolerating its absence.
 *
 * Recursive on purpose. A non-recursive listing of `architecture/` made the
 * feature-archive rule unreachable — a retired spec parked in
 * `docs/knowledge/archive/` was never read, so the check that exists to find
 * exactly that could never fire. An unreadable subdirectory must still not
 * abort validation of the business layer, which is the part a human is most
 * likely to be reading.
 */
export function markdownUnder(repoDir: string, relative: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(join(repoDir, relative), { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...markdownUnder(repoDir, child));
    else if (entry.isFile() && entry.name.endsWith(".md")) found.push(child);
  }
  return found;
}

/**
 * §M-KNOWLEDGE-FILES — Read the knowledge layer's documents, in a stable order.
 *
 * `business.md` and `glossary.md` come first because they are the two documents
 * a reader is directed to by name, and a stable order keeps the gate's
 * `documents` list diffable between runs.
 */
export function knowledgeDocuments(repoDir: string): Array<{ path: string; text: string }> {
  const ordered = [`${KNOWLEDGE_ROOT}/business.md`, `${KNOWLEDGE_ROOT}/glossary.md`];
  for (const relative of markdownUnder(repoDir, KNOWLEDGE_ROOT)) {
    if (!ordered.includes(relative)) ordered.push(relative);
  }
  const files: Array<{ path: string; text: string }> = [];
  for (const relative of ordered) {
    const path = join(repoDir, relative);
    if (existsSync(path)) files.push({ path: relative, text: readFileSync(path, "utf8") });
  }
  return files;
}
