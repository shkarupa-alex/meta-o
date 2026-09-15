/**
 * Keep Meta-O activation explicit at the frontmatter surface the harness reads.
 *
 * Protects §A-ACTIVATION-01.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import yaml from "js-yaml";
import { fromMarkdown } from "mdast-util-from-markdown";

const ROOT = resolve(import.meta.dirname, "..");

function moSkills(tree) {
  return readdirSync(join(ROOT, tree), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("mo-"))
    .map((entry) => entry.name)
    .sort();
}

function skillDocument(tree, name) {
  const source = readFileSync(join(ROOT, tree, name, "SKILL.md"), "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/u);
  assert.ok(match, `${tree}/${name}: frontmatter missing`);
  return { frontmatter: yaml.load(match[1]), tree: fromMarkdown(match[2]) };
}

/** §A-ACTIVATION-01 reads one literal list instead of inferring a hidden graph. */
function calls(document, name) {
  const children = document.tree.children;
  const headings = children
    .map((node, index) => ({ node, index }))
    .filter(
      ({ node }) =>
        node.type === "heading" &&
        node.depth === 2 &&
        node.children.map(({ value = "" }) => value).join("") === "Meta-O calls",
    );
  assert.equal(headings.length, 1, `${name}: needs one Meta-O calls section`);
  const list = children[headings[0].index + 1];
  assert.equal(list?.type, "list", `${name}: calls section must contain one list`);
  assert.equal(list.ordered, false, `${name}: calls list must be unordered`);
  assert.equal(children.length, headings[0].index + 2, `${name}: calls list must end the skill`);
  return list.children.map((item) => {
    const paragraph = item.children[0];
    assert.equal(item.children.length, 1, `${name}: call item has extra blocks`);
    assert.equal(paragraph?.type, "paragraph", `${name}: call item is not prose`);
    if (paragraph.children.length === 1 && paragraph.children[0].type === "text") {
      assert.equal(paragraph.children[0].value, "none", `${name}: only literal none is allowed`);
      return "none";
    }
    assert.equal(paragraph.children.length, 1, `${name}: call item must be exact inline code`);
    assert.equal(paragraph.children[0].type, "inlineCode", `${name}: callee must be inline code`);
    return paragraph.children[0].value;
  });
}

test("source and generated Meta-O skills expose the same explicit activation graph", () => {
  const sourceNames = moSkills("src/skills");
  assert.deepEqual(moSkills("skills"), sourceNames);
  const known = new Set(sourceNames);
  for (const name of sourceNames) {
    const source = skillDocument("src/skills", name);
    const generated = skillDocument("skills", name);
    for (const document of [source, generated]) {
      assert.match(document.frontmatter.description, /^Use only when the user explicitly /u);
      assert.doesNotMatch(
        document.frontmatter.description,
        /use when (?:reviewing|setting up|implementing)|generic (?:review|setup)/iu,
      );
      const declared = calls(document, name);
      assert.equal(new Set(declared).size, declared.length, `${name}: duplicate callee`);
      if (declared.includes("none")) assert.deepEqual(declared, ["none"]);
      for (const callee of declared.filter((value) => value !== "none")) {
        assert.ok(known.has(callee), `${name}: unknown callee ${callee}`);
        assert.notEqual(callee, name, `${name}: self-call`);
      }
    }
    assert.deepEqual(calls(source, name), calls(generated, name), `${name}: generated graph drift`);
  }
});
