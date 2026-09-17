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

const ID = /^§([AB])-[A-Z][A-Z0-9-]*-\d{2}(?=\s|$)/;

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
