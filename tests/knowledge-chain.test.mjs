/**
 * Prove the knowledge chain: business thesis, architecture decision, module.
 *
 * A chain that only exists in prose breaks silently — a decision keeps citing a
 * thesis that was reworded, and nobody notices until someone asks why the code
 * exists. These checks make the break mechanical instead of editorial.
 *
 * Protects §A-MEMORY-01.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markdown = new MarkdownIt();
const REFERENCE = /§[AB]-[A-Z][A-Z0-9]*-\d{2}/g;
const BUSINESS = join(ROOT, "docs", "business.md");
const ARCHITECTURE = join(ROOT, "docs", "architecture");

/** Collect files recursively; the caller filters, because each check owns a different scope. */
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return files(child);
    return entry.isFile() ? [child] : [];
  });
}

/** Split a document into heading sections; a section owns the prose under its own heading. */
function sections(path) {
  const tokens = markdown.parse(readFileSync(path, "utf8"), {});
  const collected = [];
  let current = { level: 0, title: "", body: [] };
  let heading = false;
  for (const token of tokens) {
    if (token.type === "heading_open") {
      collected.push(current);
      current = { level: Number(token.tag.slice(1)), title: "", body: [] };
      heading = true;
      continue;
    }
    if (heading && token.type === "inline") {
      current.title = token.content;
      heading = false;
      continue;
    }
    if (token.type === "inline" || token.type === "fence" || token.type === "code_block") {
      current.body.push(token.content);
    }
  }
  collected.push(current);
  return collected.map((section) => ({ ...section, body: section.body.join("\n") }));
}

function references(text) {
  return text.match(REFERENCE) ?? [];
}

/** The purpose header: every comment line before the first statement of the file. */
function header(path) {
  const collected = [];
  let block = false;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const text = line.trim();
    if (block) {
      collected.push(line);
      if (text.includes("*/")) block = false;
      continue;
    }
    if (text === "") continue;
    if (text.startsWith("/*")) {
      collected.push(line);
      block = !text.includes("*/");
      continue;
    }
    if (text.startsWith("//") || text.startsWith("#")) {
      collected.push(line);
      continue;
    }
    break;
  }
  return collected.join("\n");
}

function theses() {
  return sections(BUSINESS)
    .filter((section) => section.level === 3)
    .map((section) => section.title);
}

/**
 * Decisions with the prose they own.
 *
 * A decision owns its own section and every deeper section that does not start
 * another decision, because a document states the decision in one heading and
 * its business reason in the next.
 */
function decisions() {
  const collected = [];
  for (const path of files(ARCHITECTURE).filter((entry) => extname(entry) === ".md")) {
    const owners = new Map();
    const stack = [];
    for (const section of sections(path)) {
      while (stack.length > 0 && stack.at(-1).level >= section.level) stack.pop();
      const own = section.title.match(/^§A-[A-Z][A-Z0-9]*-\d{2}/);
      if (own) {
        const decision = { path, title: section.title, body: [] };
        owners.set(own[0], decision);
        collected.push(decision);
        stack.push({ level: section.level, id: own[0] });
      }
      if (stack.length > 0) owners.get(stack.at(-1).id).body.push(section.title, section.body);
    }
  }
  return collected.map((decision) => ({ ...decision, body: decision.body.join("\n") }));
}

/** Every module whose purpose must name the decision it implements. */
function modules() {
  return [
    ...files(join(ROOT, "shared", "scripts")),
    ...files(join(ROOT, "tools")),
    ...files(join(ROOT, "tests")).filter((path) => path.endsWith(".test.mjs")),
  ];
}

test("every business thesis carries a unique grammatical id", () => {
  const titles = theses();
  assert.ok(titles.length > 40, "the business framing lost its theses");
  const ids = [];
  for (const title of titles) {
    const match = title.match(/^(§B-[A-Z][A-Z0-9]*-\d{2}) — \S/);
    assert.ok(match, `thesis without an id: ${title}`);
    ids.push(match[1]);
  }
  assert.equal(new Set(ids).size, ids.length, "a business id is used twice");
});

test("every architecture decision carries a unique id and names an existing thesis", () => {
  const defined = new Set(theses().map((title) => title.split(" ")[0]));
  const found = decisions();
  assert.ok(found.length > 5, "the architecture layer lost its decisions");
  const ids = [];
  for (const decision of found) {
    const match = decision.title.match(/^(§A-[A-Z][A-Z0-9]*-\d{2}) — \S/);
    assert.ok(match, `${decision.path}: decision without an id: ${decision.title}`);
    ids.push(match[1]);
    const cited = references(decision.body).filter((id) => id.startsWith("§B-"));
    assert.ok(cited.length > 0, `${match[1]}: names no business thesis`);
    for (const id of cited) assert.ok(defined.has(id), `${match[1]}: cites unknown ${id}`);
  }
  assert.equal(new Set(ids).size, ids.length, "an architecture id is used twice");
  for (const path of files(ARCHITECTURE).filter((entry) => extname(entry) === ".md")) {
    assert.ok(
      found.some((decision) => decision.path === path),
      `${path}: architecture document without a decision id`,
    );
  }
});

test("every anchor reference in the project resolves to a defined id", () => {
  const defined = new Set([
    ...theses().map((title) => title.split(" ")[0]),
    ...decisions().map((decision) => decision.title.split(" ")[0]),
  ]);
  const sources = [
    join(ROOT, "README.md"),
    join(ROOT, "AGENTS.md"),
    join(ROOT, "CLAUDE.md"),
    ...files(join(ROOT, "docs")).filter(
      (path) => extname(path) === ".md" && !path.startsWith(join(ROOT, "docs", "references")),
    ),
    ...modules(),
  ];
  for (const path of sources) {
    for (const id of references(readFileSync(path, "utf8"))) {
      assert.ok(defined.has(id), `${path}: dangling reference ${id}`);
    }
  }
});

test("every first-party module names a decision and never the business layer", () => {
  const defined = new Set(decisions().map((decision) => decision.title.split(" ")[0]));
  const found = modules();
  assert.ok(found.length > 10, "module discovery lost files");
  for (const path of found) {
    const cited = references(header(path)).filter((id) => id.startsWith("§A-"));
    assert.ok(cited.length > 0, `${path}: purpose names no architecture decision`);
    for (const id of cited) assert.ok(defined.has(id), `${path}: cites unknown ${id}`);
    const business = references(readFileSync(path, "utf8")).filter((id) => id.startsWith("§B-"));
    assert.deepEqual(business, [], `${path}: code cites the business layer directly`);
  }
});

test("distributed skill text carries no project ids", () => {
  const shipped = [
    ...files(join(ROOT, "skills")),
    ...files(join(ROOT, "src", "skills")),
    ...files(join(ROOT, "shared", "references")),
  ].filter((path) => extname(path) === ".md");
  assert.ok(shipped.length > 20, "shipped document discovery lost files");
  for (const path of shipped) {
    assert.deepEqual(
      references(readFileSync(path, "utf8")),
      [],
      `${path}: shipped text carries an id the consumer cannot resolve`,
    );
  }
});
