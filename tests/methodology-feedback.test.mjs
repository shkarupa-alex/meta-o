/**
 * Hold who may report methodology friction, where, and who may not write at all.
 *
 * Protects §A-ISSUE-01 and §A-ACTIVATION-01.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ALLOWED_FRONTMATTER, frontmatter } from "../tools/build-skills.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flat = (text) => text.replace(/\s+/gu, " ");
const shipped = (skill, file) => join(ROOT, "skills", skill, file);
const read = (path) => readFileSync(path, "utf8");

const WRITERS = ["mo-orchestrate-orca", "mo-review-orca", "mo-setup"];
const CHANNELS = ["mo-e2e", "mo-watchdog"];
const ADVISORY = ["find-reuse", "senior-jsts", "senior-python"];

test("the routing table carries methodology friction as one ordinary row", () => {
  const table = flat(read(join(ROOT, "shared", "references", "issue-routing.md")));
  assert.match(table, /\| ISS-16 \| methodology_issue \|/u);
  assert.match(table, /Search Meta-O repo; comment on match or create sanitized Issue/u);
  assert.match(table, /Any other repository; write without search/u);
  // The addressee is a field of the installed skill, not a guess from a remote.
  assert.match(table, /`metadata.repository` установленного скила; без него — ISS-02/u);
  assert.match(table, /дефект продукта сюда не направляется/u);
});

test("the five lifecycle skills carry the feedback contract and the three writers its table", () => {
  for (const skill of [...WRITERS, ...CHANNELS]) {
    assert.ok(
      existsSync(shipped(skill, "references/methodology-feedback.md")),
      `${skill}: the feedback contract is not shipped`,
    );
    assert.match(
      read(shipped(skill, "SKILL.md")),
      /references\/methodology-feedback\.md/u,
      `${skill}: the shipped file is never read`,
    );
  }
  for (const skill of WRITERS) {
    assert.ok(
      existsSync(shipped(skill, "references/issue-routing.md")),
      `${skill}: a writer without the routing table`,
    );
  }
});

test("every skill that may report friction names the repository it reports to", () => {
  // The addressee is a field of the installed package, not something inferred
  // from a remote: an installed skill has no idea which project it is sitting
  // in, and guessing would file Meta-O's friction in somebody's product.
  for (const skill of [...WRITERS, ...CHANNELS]) {
    const { data } = frontmatter(read(shipped(skill, "SKILL.md")));
    assert.equal(
      data.metadata?.repository,
      "https://github.com/shkarupa-alex/meta-o",
      `${skill}: no repository in metadata`,
    );
    assert.deepEqual(
      Object.keys(data).filter((key) => !ALLOWED_FRONTMATTER.has(key)),
      [],
      `${skill}: non-canonical frontmatter`,
    );
  }
  for (const skill of ADVISORY) {
    const { data } = frontmatter(read(shipped(skill, "SKILL.md")));
    assert.equal(data.metadata, undefined, `${skill}: an advisory skill has an addressee`);
  }
});

test("an advisory skill gets neither the table nor the channel", () => {
  // These three write no repository file, install nothing and log in nowhere.
  // Shipping them a write contract would be the first step to doing so.
  for (const skill of ADVISORY) {
    for (const file of ["references/issue-routing.md", "references/methodology-feedback.md"]) {
      assert.equal(existsSync(shipped(skill, file)), false, `${skill}: ${file} is shipped`);
    }
  }
});

test("a channel skill reports friction and writes nothing", () => {
  const contract = read(join(ROOT, "shared", "references", "methodology-feedback.md"));
  assert.match(contract, /## Режим записи/u);
  assert.match(contract, /## Режим канала без записи/u);
  assert.match(contract, /Methodology-Friction: <наблюдение>/u);
  assert.match(flat(contract), /В прогоне эвалов и E2E запись во внешний сервис не выполняется/u);
  for (const skill of CHANNELS) {
    const body = read(shipped(skill, "SKILL.md"));
    assert.doesNotMatch(body, /gh issue (?:create|comment)/u, `${skill}: prescribes a write`);
  }
});

test("the reviewer brief still asks for friction as its own line", () => {
  const brief = flat(read(join(ROOT, "shared", "references", "review-brief.md")));
  assert.match(brief, /Methodology-Friction/u);
});

test("no skill outside the activation graph sends anyone to run setup", () => {
  // A readiness gap is the human's decision: setting a project up changes files
  // nobody asked to change. A skill that "just runs" the setup skill has made
  // that decision for them.
  for (const skill of [...WRITERS, ...CHANNELS].filter((name) => name !== "mo-setup")) {
    const body = read(shipped(skill, "SKILL.md"));
    assert.doesNotMatch(
      body,
      /(?:call|invoke|activate|start|run)\s+`mo-setup`/iu,
      `${skill}: activates setup`,
    );
  }
  const methodology = flat(read(join(ROOT, "shared", "references", "methodology.md")));
  assert.match(methodology, /readiness gap: report it as `needs_attention`/u);
  assert.match(methodology, /recommend that the human run the setup skill/u);
  assert.match(methodology, /no lifecycle skill prepares it on its own initiative/u);
});
