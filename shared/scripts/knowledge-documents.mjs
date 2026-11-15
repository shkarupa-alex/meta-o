/**
 * Project one knowledge document into the fingerprints history checking needs.
 *
 * §A-MEMORY-01 compares sections across commits, so every comparison has to be
 * a projection of one real Markdown AST rather than a text diff: a reflowed
 * paragraph is not a semantic change, and a changed byte inside a fenced literal
 * is. Keeping the projections here, away from the Git traversal, is what lets
 * the traversal parse each unique blob exactly once and reuse the result.
 *
 * Authorization records stay outside the semantic fingerprint on purpose. A
 * newly added record would otherwise demand authorization for itself, which no
 * commit could ever satisfy.
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import yaml from "js-yaml";

/** §A-MEMORY-01 recognises a definition: a heading whose text starts with an identifier. */
export const HEADING_ID = /^§([AB])-[A-Z][A-Z0-9-]*-\d{2}(?=\s|$)/;
const ID = HEADING_ID;

/** §A-MEMORY-01 matches every knowledge identifier written in prose or a heading. */
export const CITATION = /§[AB]-[A-Z][A-Z0-9-]*-\d{2}/gu;

function text(node) {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(text).join("");
}

function authorizationPayload(node) {
  if (node?.type !== "code" || node.lang !== "yaml") return null;
  try {
    const parsed = yaml.load(node.value);
    return parsed?.knowledge_id_changes ?? parsed?.knowledge_id_change ?? null;
  } catch {
    return null;
  }
}

function isAuthorizationBlock(node) {
  return authorizationPayload(node) !== null;
}

function semanticNode(node) {
  if (Array.isArray(node))
    return node.filter((item) => !isAuthorizationBlock(item)).map(semanticNode);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => key !== "position")
      .map(([key, value]) => [key, semanticNode(value)]),
  );
}

function authorizationRecordsFromNodes(nodes) {
  return nodes.flatMap((node) => {
    const payload = authorizationPayload(node);
    if (payload === null) return [];
    return Array.isArray(payload) ? payload : [payload];
  });
}

function normalizedLiteral(value) {
  return value.trim().replaceAll(/\s+/gu, " ");
}

function editorialSurface(nodes) {
  const literals = new Set();
  const citedIds = new Set();
  const visit = (node) => {
    if (isAuthorizationBlock(node)) return;
    if (node.type === "inlineCode" || node.type === "code") {
      literals.add(`${node.type}:${node.lang ?? ""}:${normalizedLiteral(node.value)}`);
    }
    if (typeof node.value === "string") {
      for (const [id] of node.value.matchAll(CITATION)) citedIds.add(id);
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of nodes) visit(node);
  return {
    literals: [...literals].sort(),
    citedIds: [...citedIds].sort(),
  };
}

function strictEditorialNode(node, flexibleText = false) {
  if (Array.isArray(node)) {
    return node
      .filter((item) => !isAuthorizationBlock(item))
      .map((item) => strictEditorialNode(item, flexibleText));
  }
  if (!node || typeof node !== "object") return node;
  const allowLabelChange = flexibleText || node.type === "heading" || node.type === "link";
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => key !== "position")
      .map(([key, value]) => {
        if (key === "value" && typeof value === "string") {
          if (node.type === "text" && allowLabelChange) return [key, "<editorial-text>"];
          if (node.type === "text") return [key, normalizedLiteral(value)];
          // Inline and fenced code are exact interface literals. Whitespace can
          // change their grammar, so strict editorial comparison keeps every byte.
          return [key, value];
        }
        return [key, strictEditorialNode(value, allowLabelChange && key === "children")];
      }),
  );
}

function authorizationFingerprints(nodes) {
  return authorizationRecordsFromNodes(nodes)
    .map((record) => JSON.stringify(stableValue(record)))
    .sort();
}

/** §A-MEMORY-01 parses one knowledge document into the AST every rule reads. */
export function parseDocument(markdown) {
  return fromMarkdown(markdown);
}

/** §A-MEMORY-01 extracts knowledge definitions from a real Markdown AST. */
export function definitionsFromTree(tree, path) {
  const found = new Map();
  const visit = (node) => {
    const children = node.children ?? [];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.type === "heading") {
        const heading = text(child).trim();
        const match = heading.match(ID);
        if (match) {
          const id = match[0];
          if (found.has(id)) throw new Error(`${path}: duplicate ${id}`);
          let end = index + 1;
          while (
            end < children.length &&
            !(children[end].type === "heading" && children[end].depth <= child.depth)
          ) {
            end += 1;
          }
          const section = children.slice(index, end);
          found.set(id, {
            id,
            kind: match[1],
            heading,
            path,
            semantic: JSON.stringify(semanticNode(section)),
            editorial: JSON.stringify(editorialSurface(section)),
            strictEditorial: JSON.stringify(strictEditorialNode(section)),
            authorizations: authorizationFingerprints(section),
          });
        }
      }
      visit(child);
    }
  };
  visit(tree);
  return found;
}

/** §A-MEMORY-01 extracts knowledge definitions from one document's source. */
export function definitions(markdown, path) {
  return definitionsFromTree(parseDocument(markdown), path);
}

/** §A-MEMORY-01 reads the append-only authorization journal of one decision. */
export function authorizationRecordsFromTree(tree, architectureId) {
  const children = tree.children;
  const start = children.findIndex(
    (node) => node.type === "heading" && text(node).trim().startsWith(architectureId),
  );
  if (start < 0) return [];
  const depth = children[start].depth;
  const section = children.slice(
    start + 1,
    children.findIndex(
      (node, index) => index > start && node.type === "heading" && node.depth <= depth,
    ) === -1
      ? children.length
      : children.findIndex(
          (node, index) => index > start && node.type === "heading" && node.depth <= depth,
        ),
  );
  const block = section.find((node) => node.type === "code" && node.lang === "yaml");
  if (!block) return [];
  const parsed = yaml.load(block.value);
  const records = parsed?.knowledge_id_changes ?? [parsed?.knowledge_id_change].filter(Boolean);
  return Array.isArray(records) ? records : [];
}

/** §A-MEMORY-01 reads one decision's authorization journal from document source. */
export function authorizationRecords(markdown, architectureId) {
  return authorizationRecordsFromTree(parseDocument(markdown), architectureId);
}

/** §A-MEMORY-01 gives a record one order-independent fingerprint. */
export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function prose(node) {
  // Fenced blocks are records and examples, not citations: an authorization
  // record has to name the id it retires, and the trailer grammar shows a
  // placeholder id. Inline code stays in, because an id written as inline code
  // inside a sentence is an ordinary reference.
  if (node.type === "code") return "";
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(prose).join("\n");
}

/** §A-MEMORY-01 collects every identifier one document cites in ordinary prose. */
export function citedIdsFromTree(tree) {
  const found = new Set();
  for (const [id] of prose(tree).matchAll(CITATION)) found.add(id);
  return found;
}

// The lower boundaries of the verified history are knowledge, not configuration:
// they live in the decision that explains them, and the checker reads them from
// there so a boundary can never be moved by a flag nobody reviewed.
const PINS = {
  program_input_sha: "cutoff",
  semantic_enforcement_sha: "semanticFrom",
  current_record_enforcement_sha: "currentRecordFrom",
  strict_editorial_enforcement_sha: "strictEditorialFrom",
};

function yamlBlocks(node, found = []) {
  if (node.type === "code" && node.lang === "yaml") found.push(node);
  for (const child of node.children ?? []) yamlBlocks(child, found);
  return found;
}

/** §A-MEMORY-01 reads the four history boundaries a decision document pins. */
export function historyPins(markdown, path) {
  const found = new Map();
  for (const block of yamlBlocks(parseDocument(markdown))) {
    let parsed;
    try {
      parsed = yaml.load(block.value);
    } catch {
      throw new Error(`${path} has a YAML block the pin reader cannot parse`);
    }
    if (!parsed || typeof parsed !== "object") continue;
    for (const key of Object.keys(PINS)) {
      if (!Object.hasOwn(parsed, key)) continue;
      if (found.has(key)) throw new Error(`${path} names ${key} more than once`);
      found.set(key, String(parsed[key]));
    }
  }
  const missing = Object.keys(PINS).filter((key) => !found.has(key));
  if (missing.length > 0) throw new Error(`${path} is missing ${missing.join(", ")}`);
  return Object.fromEntries([...found].map(([key, value]) => [PINS[key], value]));
}

/** The heading text that opens the history declaration section. */
const HISTORY_SECTION = "Knowledge id history";
const CUTOFF = /^[0-9a-f]{40}$/u;

/** Every level-two section whose heading names the history declaration. */
function historySections(tree, document) {
  const children = tree.children ?? [];
  const found = [];
  children.forEach((node, index) => {
    if (node.type !== "heading" || node.depth !== 2 || !text(node).includes(HISTORY_SECTION))
      return;
    let end = index + 1;
    while (end < children.length && !(children[end].type === "heading" && children[end].depth <= 2))
      end += 1;
    found.push({ document, line: node.position?.start.line, body: children.slice(index + 1, end) });
  });
  return found;
}

/** Fenced blocks anywhere below the section's own nodes. */
function fencesIn(nodes) {
  return nodes.flatMap((node) => (node.type === "code" ? [node] : fencesIn(node.children ?? [])));
}

/**
 * The local Markdown documents a contract links, as repository paths.
 *
 * Read the way the knowledge core reads a link: percent-decoded, relative to
 * the linking document, `/` meaning the repository root; anything that leaves
 * the repository or names another host declares nothing.
 */
function linkedDocuments(tree, from) {
  const targets = new Map();
  const define = (node) => {
    if (node.type === "definition" && !targets.has(node.identifier))
      targets.set(node.identifier, node.url);
    for (const child of node.children ?? []) define(child);
  };
  define(tree);
  const found = new Set();
  const visit = (node) => {
    const url =
      node.type === "link"
        ? node.url
        : node.type === "linkReference"
          ? targets.get(node.identifier)
          : undefined;
    const path = url === undefined ? null : localDocument(url, from);
    if (path !== null && path !== from) found.add(path);
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return [...found].sort();
}

function localDocument(url, from) {
  if (url === "" || url.startsWith("#") || url.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(url)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(url.replace(/[?#].*$/su, ""));
  } catch {
    return null;
  }
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : ".";
  const joined = decoded.startsWith("/") ? decoded.slice(1) : `${base}/${decoded}`;
  const parts = [];
  for (const part of joined.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  const path = parts.join("/");
  return /\.md$/iu.test(path) ? path : null;
}

/** One section judged against the declared form. */
function judgeHistorySection({ document, line, body }) {
  const fences = fencesIn(body);
  const records = fences.filter((node) => node.lang === "yaml");
  const commands = fences.filter((node) => node.lang !== "yaml");
  const invalid = (reason, detail) => ({ state: "invalid", reason, document, line, detail });
  if (records.length > 1) return invalid("ambiguous_declaration", "more than one yaml block");
  if (commands.length > 1) return invalid("ambiguous_declaration", "more than one command block");
  if (commands.length === 0) return invalid("malformed_declaration", "no command block");
  const command = commands[0].value.split("\n").filter((entry) => entry.trim() !== "");
  if (command.length !== 1)
    return invalid("malformed_declaration", "command block is not one line");
  if (records.length === 0) return invalid("malformed_declaration", "no yaml cutoff record");
  let record;
  try {
    // Every scalar a string: an all-digit SHA must not become a number.
    record = yaml.load(records[0].value, { schema: yaml.FAILSAFE_SCHEMA });
  } catch {
    return invalid("malformed_declaration", "yaml record does not parse");
  }
  const keys =
    record && typeof record === "object" && !Array.isArray(record) ? Object.keys(record) : [];
  if (keys.length !== 1 || keys[0] !== "history_cutoff_sha" || !CUTOFF.test(record[keys[0]])) {
    return invalid("malformed_declaration", "yaml block is not one history_cutoff_sha record");
  }
  return {
    state: "declared",
    document,
    stageCommand: command[0].trim(),
    cutoff: record.history_cutoff_sha,
  };
}

/**
 * Read the project's history declaration from one Git candidate.
 *
 * §A-MEMORY-05 counts the history signal only where the contract puts it: a
 * level-two section headed `Knowledge id history`, in `AGENTS.md` or in the
 * one quality document `AGENTS.md` links that holds such a section, with one
 * fenced one-line command and one fenced `yaml` block holding exactly
 * `history_cutoff_sha: <40-hex>`. A cutoff written in a sentence is a
 * declaration in the wrong form, not an absent one, and the answer says so;
 * a record outside the section declares nothing.
 *
 * @param {Function} readAt `(candidate, path)` returning `{text}`, with `null`
 *   text for an absent file, or `{error}`
 * @param {string} candidate exact commit
 * @param {string} entryPath the entry contract, normally `AGENTS.md`
 * @returns {object} `declared`, `absent` or `invalid` with a typed reason
 */
export function readHistoryDeclaration(readAt, candidate, entryPath = "AGENTS.md") {
  const unreadable = (document, detail) => ({
    state: "invalid",
    reason: "contract_unreadable",
    document,
    detail,
  });
  const entry = readAt(candidate, entryPath);
  if (entry.error) return unreadable(entryPath, entry.error);
  if (entry.text === null) return { state: "absent", reason: "section_missing" };
  const tree = parseDocument(entry.text);
  const sections = historySections(tree, entryPath);
  for (const path of linkedDocuments(tree, entryPath)) {
    const linked = readAt(candidate, path);
    if (linked.error) return unreadable(path, linked.error);
    if (linked.text !== null) sections.push(...historySections(parseDocument(linked.text), path));
  }
  if (sections.length === 0) return { state: "absent", reason: "section_missing" };
  if (sections.length > 1) {
    return {
      state: "invalid",
      reason: "ambiguous_declaration",
      document: sections[0].document,
      line: sections[0].line,
      detail: `${sections.length} sections in ${sections.map(({ document }) => document).join(", ")}`,
    };
  }
  return judgeHistorySection(sections[0]);
}
