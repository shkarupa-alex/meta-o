/**
 * §M-KNOWLEDGE — Parsing and validation of the causal anchor chain.
 *
 * Implements §A-CAUSAL-KNOWLEDGE. `§B → §A → §M → symbol` is only a real chain
 * if every link is checkable; a prose convention that nothing verifies degrades
 * into decoration within a few features. Parsing structural headings rather
 * than searching for similar-looking strings is what makes "this anchor is
 * defined here" a fact instead of a guess.
 */

/** §M-KNOWLEDGE — Grammar of a business anchor. */
export const BUSINESS_ANCHOR = /§B-[A-Z0-9-]+/g;

/** §M-KNOWLEDGE — Grammar of an architecture anchor. */
export const ARCHITECTURE_ANCHOR = /§A-[A-Z0-9-]+/g;

/** §M-KNOWLEDGE — Grammar of a module anchor. */
export const MODULE_ANCHOR = /§M-[A-Z0-9-]+/g;

/** §M-KNOWLEDGE — Any anchor, used when the level is determined afterwards. */
export const ANY_ANCHOR = /§[BAM]-[A-Z0-9-]+/g;

/** §M-KNOWLEDGE — Which level of the chain an anchor belongs to. */
export type AnchorLevel = "business" | "architecture" | "module";

/** §M-KNOWLEDGE — One anchor defined by a Markdown heading. */
export interface AnchorSection {
  anchor: string;
  level: AnchorLevel;
  headingLevel: number;
  path: string;
  line: number;
  body: string;
  references: string[];
}

/** §M-KNOWLEDGE — Level implied by an anchor's prefix. */
export function levelOf(anchor: string): AnchorLevel {
  if (anchor.startsWith("§B-")) return "business";
  if (anchor.startsWith("§A-")) return "architecture";
  return "module";
}

/** §M-KNOWLEDGE — Every distinct anchor mentioned in a block of text. */
export function referencesIn(text: string): string[] {
  return [...new Set(text.match(ANY_ANCHOR) ?? [])];
}

/**
 * §M-KNOWLEDGE — Extract anchor-defining headings and their section bodies.
 *
 * A section ends at the next heading of the same or a higher level, which is
 * what lets "this `§A` cites its `§B`" be checked locally instead of anywhere
 * in the file.
 */
export function parseDocument(path: string, markdown: string): AnchorSection[] {
  const lines = markdown.split("\n");
  const headings: Array<{ index: number; level: number; anchor?: string }> = [];

  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!match) return;
    const level = match[1]!.length;
    const anchorMatch = /§[BAM]-[A-Z0-9-]+/.exec(match[2]!);
    headings.push(anchorMatch ? { index, level, anchor: anchorMatch[0] } : { index, level });
  });

  const sections: AnchorSection[] = [];
  headings.forEach((heading, position) => {
    if (!heading.anchor) return;
    let end = lines.length;
    for (let next = position + 1; next < headings.length; next += 1) {
      if (headings[next]!.level <= heading.level) {
        end = headings[next]!.index;
        break;
      }
    }
    const body = lines.slice(heading.index + 1, end).join("\n");
    sections.push({
      anchor: heading.anchor,
      level: levelOf(heading.anchor),
      headingLevel: heading.level,
      path,
      line: heading.index + 1,
      body,
      references: referencesIn(body).filter((ref) => ref !== heading.anchor),
    });
  });
  return sections;
}

/** §M-KNOWLEDGE — All anchor definitions across the knowledge layer. */
export interface AnchorIndex {
  sections: AnchorSection[];
  byAnchor: Map<string, AnchorSection[]>;
  duplicates: string[];
}

/** §M-KNOWLEDGE — Build an index over several knowledge documents. */
export function buildAnchorIndex(files: Array<{ path: string; text: string }>): AnchorIndex {
  const sections: AnchorSection[] = [];
  for (const file of files) sections.push(...parseDocument(file.path, file.text));

  const byAnchor = new Map<string, AnchorSection[]>();
  for (const section of sections) {
    const list = byAnchor.get(section.anchor) ?? [];
    list.push(section);
    byAnchor.set(section.anchor, list);
  }
  const duplicates = [...byAnchor.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([anchor]) => anchor)
    .sort();

  return { sections, byAnchor, duplicates };
}

/** §M-KNOWLEDGE — A module anchor defined in code rather than in Markdown. */
export interface ModuleAnchorDefinition {
  anchor: string;
  path: string;
  references: string[];
}

/** §M-KNOWLEDGE — Result of validating the whole causal chain. */
export interface KnowledgeValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * §M-KNOWLEDGE — Validate uniqueness, dangling links and nearest-level citation.
 *
 * The "nearest level" rule is the one worth stating twice: a module may
 * additionally cite a `§B`, but a module that cites *only* a `§B` has skipped
 * architecture, and the chain silently stops explaining how the business need
 * became this boundary.
 */
export function validateChain(
  index: AnchorIndex,
  moduleAnchors: ModuleAnchorDefinition[] = [],
): KnowledgeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const anchor of index.duplicates) {
    const where = index
      .byAnchor.get(anchor)!
      .map((section) => `${section.path}:${section.line}`)
      .join(", ");
    errors.push(`duplicate anchor ${anchor} defined at ${where}`);
  }

  const defined = new Set<string>(index.byAnchor.keys());
  for (const module of moduleAnchors) {
    if (defined.has(module.anchor)) {
      errors.push(`module anchor ${module.anchor} is also defined in Markdown`);
    }
    defined.add(module.anchor);
  }

  for (const section of index.sections) {
    for (const reference of section.references) {
      if (!defined.has(reference) && levelOf(reference) !== "module") {
        errors.push(`${section.path}:${section.line}: ${section.anchor} references unknown ${reference}`);
      }
    }
    if (section.level === "architecture") {
      const cites = section.references.filter((ref) => levelOf(ref) === "business");
      if (cites.length === 0) {
        errors.push(`${section.path}:${section.line}: ${section.anchor} does not cite any §B-*`);
      }
    }
    if (section.level === "business") {
      const upward = section.references.filter((ref) => levelOf(ref) !== "business");
      if (upward.length > 0) {
        warnings.push(
          `${section.path}:${section.line}: business anchor ${section.anchor} ` +
            `cites lower levels (${upward.join(", ")})`,
        );
      }
    }
  }

  for (const module of moduleAnchors) {
    const architecture = module.references.filter((ref) => levelOf(ref) === "architecture");
    if (architecture.length === 0) {
      errors.push(`${module.path}: module anchor ${module.anchor} does not cite any §A-*`);
    }
    for (const reference of module.references) {
      if (!defined.has(reference)) {
        errors.push(`${module.path}: ${module.anchor} references unknown ${reference}`);
      }
    }
    const businessOnly =
      architecture.length === 0 && module.references.some((ref) => levelOf(ref) === "business");
    if (businessOnly) {
      errors.push(
        `${module.path}: ${module.anchor} cites §B-* directly instead of the nearest §A-* level`,
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** §M-KNOWLEDGE — Business anchors available as E2E scenario link targets. */
export function businessAnchors(index: AnchorIndex): Set<string> {
  return new Set(
    index.sections.filter((section) => section.level === "business").map((section) => section.anchor),
  );
}
