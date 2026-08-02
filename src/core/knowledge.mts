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

/**
 * §M-KNOWLEDGE — Every token that is trying to be an anchor.
 *
 * Deliberately greedy where the grammar is strict. `§B-BAD_ANCHOR` matches the
 * anchor pattern only up to `§B-BAD`, so a checker built from the grammar alone
 * silently registers a *different* anchor than the author wrote, and
 * `§a-lower-01` registers nothing at all. Both are typos that a knowledge layer
 * must fail on rather than quietly reinterpret.
 */
const ANCHOR_TOKEN = /§[^\s`"'(),;:.\]/]+/g;

/** §M-KNOWLEDGE — The one shape a well-formed anchor may take. */
const WELL_FORMED = /^§[BAM](?:-(?:\*|[A-Z0-9]+(?:-[A-Z0-9]+)*))?$/;

/** §M-KNOWLEDGE — Which level of the chain an anchor belongs to. */
export type AnchorLevel = "business" | "architecture" | "module";

/** §M-KNOWLEDGE — The document that is the single source of business truth. */
export const BUSINESS_DOCUMENT = "docs/knowledge/business.md";

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
  return parseDocumentFully(path, markdown).sections;
}

/**
 * §M-KNOWLEDGE — Parse a document, reporting malformed anchors alongside the good ones.
 *
 * Malformed tokens are collected here rather than in the validator because this
 * is the only place that knows which lines were inside a fenced block: a
 * tutorial showing `§b-wrong` as a counter-example must not fail the gate that
 * the counter-example is teaching about.
 */
export function parseDocumentFully(
  path: string,
  markdown: string,
): { sections: AnchorSection[]; malformed: string[] } {
  const lines = markdown.split("\n");
  const headings: Array<{ index: number; level: number; anchor?: string }> = [];
  const malformed: string[] = [];

  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    for (const token of line.match(ANCHOR_TOKEN) ?? []) {
      if (!WELL_FORMED.test(token)) malformed.push(`${path}:${index + 1}: malformed anchor ${token}`);
    }

    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!match) return;
    const level = match[1]!.length;
    const anchorMatch = /§[BAM]-[A-Z0-9-]+/.exec(match[2]!);
    headings.push(anchorMatch ? { index, level, anchor: anchorMatch[0] } : { index, level });
  });

  const sections: AnchorSection[] = [];
  headings.forEach((heading, position) => {
    if (!heading.anchor) return;
    // A section ends at the next heading of the same or a higher level — or at
    // any nested heading that defines an anchor of its own. Without the second
    // rule a parent absorbs its children's text, so `## §A-ONE` citing nothing
    // passes on a `### §A-TWO` that cites a §B: the citation belongs to the
    // child, and the parent's missing link disappears into it.
    let end = lines.length;
    for (let next = position + 1; next < headings.length; next += 1) {
      if (headings[next]!.level <= heading.level || headings[next]!.anchor !== undefined) {
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
  return { sections, malformed };
}

/** §M-KNOWLEDGE — All anchor definitions across the knowledge layer. */
export interface AnchorIndex {
  sections: AnchorSection[];
  byAnchor: Map<string, AnchorSection[]>;
  duplicates: string[];
  malformed: string[];
}

/** §M-KNOWLEDGE — Build an index over several knowledge documents. */
export function buildAnchorIndex(files: Array<{ path: string; text: string }>): AnchorIndex {
  const sections: AnchorSection[] = [];
  const malformed: string[] = [];
  for (const file of files) {
    const parsed = parseDocumentFully(file.path, file.text);
    sections.push(...parsed.sections);
    malformed.push(...parsed.malformed);
  }

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

  return { sections, byAnchor, duplicates, malformed };
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

/** §M-KNOWLEDGE — Path segments that mark a document as parked rather than current. */
const ARCHIVE_SEGMENT = /(^|\/)(archive|archives|archived|old|legacy-specs|specs?)(\/|$)/i;

/**
 * §M-KNOWLEDGE — Retired feature specs parked inside the knowledge search roots.
 *
 * A feature spec is retired by distributing its durable requirements into the
 * chain and deleting it. Filing it under `docs/knowledge/archive/` instead
 * satisfies nobody's intent and recreates the problem retirement exists to
 * remove: a second, stale source of truth that a future reader finds, believes,
 * and cannot tell has been superseded — while every anchor check still passes,
 * because the archive is full of perfectly well-formed anchors.
 */
export function featureArchives(index: AnchorIndex): string[] {
  const paths = new Set(index.sections.map((section) => section.path));
  return [...paths]
    .filter((path) => ARCHIVE_SEGMENT.test(path))
    .sort()
    .map(
      (path) =>
        `${path}: a feature archive inside the knowledge search roots; retire the spec by ` +
        "distributing its durable requirements into §B/§A/§M and deleting it",
    );
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
  options: { businessDocument?: string } = {},
): KnowledgeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const businessDocument = options.businessDocument ?? BUSINESS_DOCUMENT;

  errors.push(...index.malformed);
  errors.push(...featureArchives(index));

  // A §B defined outside the business document is the failure mode that makes
  // "business truth lives in one file" untrue while every checker still passes:
  // an architecture note quietly becomes a business anchor, and the E2E catalog
  // happily links to it.
  for (const section of index.sections) {
    if (section.level === "business" && section.path !== businessDocument) {
      errors.push(
        `${section.path}:${section.line}: business anchor ${section.anchor} is defined outside ` +
          `${businessDocument}; business truth lives in exactly one document`,
      );
    }
  }

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

  // Module references are only checkable once the caller has collected the §M
  // anchors that live in code. Without them a §M reference in Markdown is
  // unverifiable rather than dangling, and reporting it would train everyone to
  // ignore the gate.
  const modulesKnown = moduleAnchors.length > 0;
  for (const section of index.sections) {
    for (const reference of section.references) {
      if (defined.has(reference)) continue;
      if (levelOf(reference) === "module" && !modulesKnown) continue;
      errors.push(`${section.path}:${section.line}: ${section.anchor} references unknown ${reference}`);
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

  errors.push(...duplicateModuleAnchors(moduleAnchors));

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

/**
 * §M-KNOWLEDGE — Business anchors available as E2E scenario link targets.
 *
 * Restricted to the one business document by default. Accepting `§B` anchors
 * from anywhere in the knowledge tree is how preflight and `e2e validate` came
 * to disagree: the same catalog passed one and failed the other, which makes
 * both untrustworthy.
 */
export function businessAnchors(index: AnchorIndex, document: string = BUSINESS_DOCUMENT): Set<string> {
  return new Set(
    index.sections
      .filter((section) => section.level === "business" && section.path === document)
      .map((section) => section.anchor),
  );
}

/** §M-KNOWLEDGE — Duplicate module anchors declared in more than one source file. */
export function duplicateModuleAnchors(moduleAnchors: ModuleAnchorDefinition[]): string[] {
  const byAnchor = new Map<string, string[]>();
  for (const module of moduleAnchors) {
    byAnchor.set(module.anchor, [...(byAnchor.get(module.anchor) ?? []), module.path]);
  }
  return [...byAnchor.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([anchor, paths]) => `duplicate module anchor ${anchor} declared in ${paths.join(", ")}`)
    .sort();
}
