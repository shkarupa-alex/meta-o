/**
 * Hold the gate that refuses vocabulary a reader cannot look up.
 *
 * The fixtures are modelled on what agents actually write under a specification:
 * a work item cited a hundred times and introduced nowhere, a section number
 * with no document, an identifier that imitates the accepted notation. Protects
 * §A-MEMORY-01.
 *
 * Every anchor below is fixture data rather than a citation, so this file is
 * declared whole: mo-vocabulary-ok file.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  citedInSource,
  classify,
  deliberateFixture,
  definedTokens,
  documentSections,
  sourceSectionFindings,
  vocabularyFindings,
  vocabularyReport,
} from "../shared/scripts/mo-vocabulary.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(ROOT, "shared", "scripts", "mo-vocabulary.mjs");
// The copy mo-setup ships: the consumer runs this bundle, not the source.
const BUNDLE = join(ROOT, "skills", "mo-setup", "scripts", "mo-vocabulary.mjs");
const spaces = [];
after(() => {
  for (const path of spaces) rmSync(path, { recursive: true, force: true });
});

function findings(files, options = {}) {
  return vocabularyFindings({
    files: Object.keys(files),
    read: (path) => files[path],
    ...options,
  });
}

const kinds = (result) => result.map(({ kind, token }) => `${kind} ${token}`);

test("a term introduced somewhere is a term a reader can look up", () => {
  const files = {
    "docs/plan.md": [
      "# Plan",
      "",
      "## W1.2 — the bundle identity",
      "",
      "| Task | What it settles |",
      "| ---- | --------------- |",
      "| T5.1 | screen fixtures |",
      "",
      "- **W4.4** — the paired routing proof",
      "",
      "Resume a W1.2-bound run, keep T5.1 green, and prove W4.4 once.",
    ].join("\n"),
  };
  assert.deepEqual(findings(files), []);
  const defined = definedTokens(files["docs/plan.md"]);
  // The table cell is the regression that matters: stripping punctuation from
  // `T5.1` once produced `T51`, and every task in the plan became undefined.
  assert.ok(defined.has("T5.1"));
  assert.ok(defined.has("W1.2"));
  assert.ok(defined.has("W4.4"));
});

test("a work item cited everywhere and introduced nowhere is one warning", () => {
  const prose = Array.from({ length: 18 }, (_, step) => `Step ${step}: carry the W1.2 bytes.`);
  const result = findings({ "docs/runtime.md": prose.join("\n") });
  assert.deepEqual(kinds(result), ["undefined_vocabulary W1.2"]);
  // One missing definition, not eighteen findings: the count is the evidence.
  assert.equal(result[0].mentions, 18);
  assert.equal(result[0].first, "docs/runtime.md:1");
  assert.equal(result[0].severity, "warning");
});

test("a single mention is an example, not yet a vocabulary", () => {
  assert.deepEqual(findings({ "docs/a.md": "One passing mention of W9.9 here." }), []);
  assert.deepEqual(
    kinds(findings({ "docs/a.md": "W9.9 once.\nAnd W9.9 again." }, { minMentions: 2 })),
    ["undefined_vocabulary W9.9"],
  );
});

test("a citation in a docstring counts as loudly as one in prose", () => {
  const files = {
    "src/runtime.py": [
      "def load():",
      '    """Import one validated W1.2 identity before mutation (§A-RUNTIME-18)."""',
      "    # paired with the §A-RUNTIME-18 probe and the §3.1 retry budget",
      "    return None",
      "",
      "# A second §A-RUNTIME-18 mention and a second §3.1, so neither fails on count.",
    ].join("\n"),
  };
  assert.deepEqual(kinds(findings(files)), [
    "undefined_id §A-RUNTIME-18",
    "unresolvable_section §3.1",
  ]);
  assert.equal(citedInSource(files["src/runtime.py"]).length, 6);
});

test("a section number resolves to a numbered heading or to nothing", () => {
  const cited = { "docs/probe.md": "Run within the §3.1 budget.\nAgain, §3.1." };
  assert.deepEqual(kinds(findings(cited)), ["unresolvable_section §3.1"]);
  assert.deepEqual(
    findings({ ...cited, "docs/design.md": "# Design\n\n## 3.1. Retry budget\n\nText.\n" }),
    [],
  );
});

test("the accepted notation is judged strictly and everything else is not", () => {
  assert.equal(classify("§A-MEMORY-01").kind, "undefined_id");
  assert.equal(classify("§A-MEMORY-01").severity, "error");
  // An undeclared layer wearing the accepted shape is a second notation grown
  // beside the agreed one, which is the thing the sigil was supposed to prevent.
  assert.equal(classify("§T-FEATURE-01").kind, "foreign_layer");
  assert.equal(classify("§A-memory-01").kind, "malformed_id");
  assert.equal(classify("§A-FOO").kind, "malformed_id");
  // `§E`, `§A2`: a section of some document nobody named. Unresolvable, but it
  // never claimed to be the notation, so it does not block a gate.
  for (const token of ["§E", "§A2", "§Clarifications"]) {
    assert.equal(classify(token).severity, "warning", token);
  }
  assert.equal(classify("§A-MEMORY-01", ["B"]).kind, "foreign_layer");
});

test("prose that names the notation is not prose that cites it", () => {
  const files = {
    "docs/contract.md": [
      "# Contract",
      "",
      "Every thesis carries `§B-<AREA>-<NN>` and every decision carries `§A-<AREA>-<NN>`.",
      "A module names `§A-*` and never the business layer.",
      "",
      "```text",
      "§A-INVENTED-07 inside a fence is an example, not a citation",
      "```",
    ].join("\n"),
    "tests/chain.test.mjs": [
      "const ANCHOR = /^§A-[A-Z][A-Z0-9-]*-\\d{2}/u;",
      'const business = ids.filter((id) => id.startsWith("§B-"));',
    ].join("\n"),
  };
  assert.deepEqual(findings(files), []);
});

test("a deliberate example says so where a reader and a grep can both see it", () => {
  const onTheLine = {
    "tests/a.test.mjs": 'throws(() => parse("§A-memory-01")); // mo-vocabulary-ok',
  };
  assert.deepEqual(findings(onTheLine), []);
  const above = {
    "tests/b.test.mjs": [
      "// mo-vocabulary-ok: a deliberately malformed identifier is the fixture here.",
      'throws(() => parse("§A-memory-01"));',
    ].join("\n"),
  };
  assert.deepEqual(findings(above), []);
  // Without the marker the same bytes are a finding, so the marker is doing the
  // work rather than the shape of the line.
  assert.deepEqual(
    kinds(findings({ "tests/c.test.mjs": 'throws(() => parse("§A-memory-01"));' })),
    ["malformed_id §A-memory-01"],
  );
});

test("a file of fixtures declares itself once instead of line by line", () => {
  const corpus = [
    "// A corpus of undefined vocabulary: mo-vocabulary-ok file.",
    'const cases = ["§A-GHOST-01", "§A-GHOST-01", "W9.9", "W9.9"];',
  ].join("\n");
  assert.deepEqual(findings({ "tests/d.test.mjs": corpus }), []);
  assert.ok(deliberateFixture(corpus));
  // The bare marker keeps its line scope: a file-wide claim is a different
  // sentence and has to be written as one.
  const lineOnly = corpus.replace("mo-vocabulary-ok file.", "mo-vocabulary-ok.");
  assert.equal(deliberateFixture(lineOnly), false);
  assert.deepEqual(kinds(findings({ "tests/e.test.mjs": lineOnly })), []);
  const third = `${lineOnly}\nconst more = ["§A-GHOST-01", "W9.9"];`;
  assert.deepEqual(kinds(findings({ "tests/f.test.mjs": third })), ["undefined_id §A-GHOST-01"]);
});

test("a file-wide claim counts only where a reader meets it first", () => {
  const cited = 'const live = ["§A-GHOST-01", "§A-GHOST-01"];';
  // Below the first statement the same bytes are just bytes: a runtime string,
  // a quoted example or a paragraph three screens down must not be able to
  // switch the gate off for a file whose top says nothing about it.
  for (const [where, source] of [
    ["after the first statement", `${cited}\n// mo-vocabulary-ok file`],
    ["inside a string", `${cited}\nconst note = "mo-vocabulary-ok file";`],
    [
      "in later prose",
      `# Title\n\nMentions §A-GHOST-01 and §A-GHOST-01.\n\nmo-vocabulary-ok file\n`,
    ],
  ]) {
    const name = where.endsWith("prose") ? "docs/late.md" : "tests/late.test.mjs";
    assert.equal(deliberateFixture(source), false, `${where}: suppressed anyway`);
    assert.deepEqual(kinds(findings({ [name]: source })), ["undefined_id §A-GHOST-01"], where);
  }
  // The declaration blocks a reader actually opens with.
  for (const [where, header] of [
    ["a JSDoc block", "/**\n * Fixtures: mo-vocabulary-ok file.\n */"],
    ["line comments", "#!/usr/bin/env node\n// mo-vocabulary-ok file"],
    ["an HTML comment", "<!-- mo-vocabulary-ok file -->"],
    ["frontmatter", "---\nname: fixtures mo-vocabulary-ok file\n---"],
  ]) {
    const source = `${header}\n${cited}`;
    assert.ok(deliberateFixture(source), `${where}: declaration not recognized`);
    assert.deepEqual(findings({ "tests/head.test.mjs": source }), [], where);
  }
});

test("each scanned language can make the declaration in its own comment syntax", () => {
  const ghost = ["§A", "GHOST", "01"].join("-");
  const corpus = (marker) => [marker, "", `first: ${ghost}`, `second: ${ghost}`].join("\n");
  for (const path of ["fixtures/a.py", "fixtures/a.sh", "fixtures/a.yml", "fixtures/a.yaml"]) {
    const declared = corpus("# mo-vocabulary-ok file");
    assert.ok(deliberateFixture(declared, path), `${path}: hash declaration not recognized`);
    assert.deepEqual(findings({ [path]: declared }), [], path);
    // Below the first content line the same words claim nothing.
    const late = [`first: ${ghost}`, `second: ${ghost}`, "# mo-vocabulary-ok file"].join("\n");
    assert.equal(deliberateFixture(late, path), false, `${path}: a late marker suppressed`);
    assert.deepEqual(kinds(findings({ [path]: late })), [`undefined_id ${ghost}`], path);
  }
  // A Markdown heading is content, not a comment: a document may not exempt
  // itself by writing the words in its own title.
  const heading = corpus("# mo-vocabulary-ok file");
  assert.equal(deliberateFixture(heading, "docs/a.md"), false);
  assert.deepEqual(kinds(findings({ "docs/a.md": heading })), [`undefined_id ${ghost}`]);
  // Markdown keeps the syntaxes it does have.
  for (const marker of [
    "<!-- mo-vocabulary-ok file -->",
    "---\nnote: mo-vocabulary-ok file\n---",
  ]) {
    assert.ok(deliberateFixture(corpus(marker), "docs/b.md"), marker);
  }
});

test("errors block and warnings do not, unless asked", () => {
  const warned = vocabularyReport([
    {
      severity: "warning",
      kind: "undefined_vocabulary",
      token: "W1.2",
      mentions: 153,
      first: "a:1",
    },
  ]);
  assert.equal(warned.status, "ok");
  assert.equal(
    warned.text.trim().split("\n").at(-1),
    "MO-VOCABULARY/1 status=ok errors=0 warnings=1",
  );
  const failed = vocabularyReport([
    { severity: "error", kind: "undefined_id", token: "§A-CORE-01", mentions: 38, first: "b:2" },
  ]);
  assert.equal(failed.status, "violations");
  assert.match(failed.text, /^error undefined_id §A-CORE-01 mentions=38 first=b:2$/mu);
});

test("the CLI reads tracked files and answers with a status a gate can branch on", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-vocabulary-"));
  spaces.push(root);
  const git = (...argv) => spawnSync("git", ["-C", root, ...argv], { encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  mkdirSync(join(root, "docs"));
  writeFileSync(
    join(root, "docs", "plan.md"),
    "# Plan\n\nCarry W1.2 bytes.\nResume the W1.2 run.\n",
  );
  writeFileSync(join(root, "docs", "draft.md"), "Untracked §A-GHOST-01 twice: §A-GHOST-01.\n");
  git("add", "docs/plan.md");
  git("commit", "-qm", "plan");

  const warned = spawnSync(process.execPath, [HELPER, "--root", root], { encoding: "utf8" });
  assert.equal(warned.status, 0, warned.stderr);
  assert.match(warned.stdout, /warning undefined_vocabulary W1\.2 mentions=2/u);
  // The untracked draft is nobody's contract yet, so its dangling id is not
  // anybody's defect either.
  assert.doesNotMatch(warned.stdout, /§A-GHOST-01/u);
  assert.match(warned.stdout, /MO-VOCABULARY\/1 status=ok errors=0 warnings=1/u);

  const strict = spawnSync(process.execPath, [HELPER, "--root", root, "--strict"], {
    encoding: "utf8",
  });
  assert.equal(strict.status, 1);

  git("add", "docs/draft.md");
  git("commit", "-qm", "draft");
  const blocked = spawnSync(process.execPath, [HELPER, "--root", root], { encoding: "utf8" });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /error undefined_id §A-GHOST-01 mentions=2/u);

  const excluded = spawnSync(process.execPath, [HELPER, "--root", root, "--exclude", "docs"], {
    encoding: "utf8",
  });
  assert.equal(excluded.status, 0);

  const misuse = spawnSync(process.execPath, [HELPER, "--nope"], { encoding: "utf8" });
  assert.equal(misuse.status, 2);
  assert.match(misuse.stderr, /unknown flag "--nope"/u);
});

test("this repository has no vocabulary a reader cannot look up", () => {
  // The bundled model SDK is third-party code; the Makefile recipe leaves it
  // out for the same reason.
  const bundled = ["mo-orchestrate-orca", "mo-review-orca"].flatMap((skill) => [
    "--exclude",
    `skills/${skill}/scripts/mo-models.mjs`,
  ]);
  const result = spawnSync(
    process.execPath,
    [
      HELPER,
      "--root",
      ROOT,
      "--exclude",
      "docs/references",
      ...bundled,
      "--non-canonical",
      "docs/references",
      "--strict",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout);
});

const DOCS = {
  "docs/x.md": "# X\n\n## 1.2. Retry budget\n\nText.\n\n### §3 Limits\n\nText.\n",
  "docs/y.md": "# Y\n\n## 9.9 Elsewhere\n\nText.\n",
  "docs/specifications/feature.md": "# Feature\n\n## 1 Scope\n",
  "docs/references/archive.md": "# Archive\n\n## 1 Old\n",
  "docs/решение.md": "# Решение\n\n## 1 Правило\n",
  "docs/my guide.md": "# Guide\n\n## 1 Правило\n",
};

function sourceKinds(path, text, nonCanonical = []) {
  const tracked = new Set([...Object.keys(DOCS), path]);
  const readDocument = (document) =>
    DOCS[document] === undefined ? null : documentSections(DOCS[document]);
  return sourceSectionFindings({ path, text, tracked, readDocument, nonCanonical }).map(
    ({ kind, token, document }) => `${kind} ${token}${document ? ` ${document}` : ""}`,
  );
}

test("a section number in code names its document in the same block of text", () => {
  // The reported shape: a docstring citing a specification nobody can open.
  assert.deepEqual(sourceKinds("src/a.py", '"""Receipt revocation (Graphiti spec §7.5)."""'), [
    "source_section_document_missing §7.5",
  ]);
  assert.deepEqual(sourceKinds("src/a.py", "# bare §7 reference"), [
    "source_section_document_missing §7",
  ]);
  // A path on an earlier line of the same block resolves it: a formatter that
  // rewraps the comment must not turn a citation into a bare number.
  assert.deepEqual(
    sourceKinds("src/a.py", "# the retry budget of `docs/x.md`\n# section §1.2"),
    [],
  );
  assert.deepEqual(sourceKinds("src/a.mjs", "// docs/x.md §1.2 and §3 both exist"), []);
  // An empty line ends the block, so a path two paragraphs up names nothing.
  assert.deepEqual(sourceKinds("src/a.py", "# docs/x.md\n\n# section §1.2"), [
    "source_section_document_missing §1.2",
  ]);
  // The path must come before the number it resolves.
  assert.deepEqual(sourceKinds("src/a.py", "# §1.2 of docs/x.md"), [
    "source_section_document_missing §1.2",
  ]);
});

test("the number resolves only in the named document's own headings", () => {
  // `docs/y.md` has a 9.9 heading; that is another document's section.
  assert.deepEqual(sourceKinds("src/a.py", "# docs/x.md §9.9"), [
    "source_section_missing §9.9 docs/x.md",
  ]);
  assert.deepEqual(sourceKinds("src/a.py", "# docs/x.md §1"), [
    "source_section_missing §1 docs/x.md",
  ]);
  assert.deepEqual(sourceKinds("src/a.py", "# docs/gone.md §1"), [
    "source_section_document_unavailable §1 docs/gone.md",
  ]);
  assert.deepEqual(sourceKinds("src/a.py", "# docs/specifications/feature.md §1"), [
    "source_section_document_not_canonical §1 docs/specifications/feature.md",
  ]);
  assert.deepEqual(sourceKinds("src/a.py", "# docs/references/archive.md §1"), []);
  assert.deepEqual(
    sourceKinds("src/a.py", "# docs/references/archive.md §1", ["docs/references/"]),
    ["source_section_document_not_canonical §1 docs/references/archive.md"],
  );
  assert.deepEqual(sourceKinds("src/a.py", "# spec/plan.md §1"), [
    "source_section_document_unavailable §1 spec/plan.md",
  ]);
  // A deliberate example says so, on its line or for the whole file.
  assert.deepEqual(sourceKinds("src/a.py", "# §7.5 mo-vocabulary-ok"), []);
  assert.deepEqual(sourceKinds("src/a.py", "# mo-vocabulary-ok file\n\nx = '§7.5'"), []);
});

test("a canonical document's path resolves whatever script or spaces its name holds", () => {
  // The whole path names the document: a non-ASCII name is not "no document",
  // and a name with a space is not its own tail.
  for (const text of [
    "// docs/x.md §1.2",
    "// docs/решение.md §1",
    "// `docs/решение.md` §1",
    "// `docs/my guide.md` §1",
    "// `docs/my guide.md`\n// section §1",
  ]) {
    assert.deepEqual(sourceKinds("src/a.mjs", text), [], text);
  }
  assert.deepEqual(sourceKinds("src/a.mjs", "// `docs/нет.md` §1"), [
    "source_section_document_unavailable §1 docs/нет.md",
  ]);
  assert.deepEqual(sourceKinds("src/a.mjs", "// `docs/my guide.md` §2"), [
    "source_section_missing §2 docs/my guide.md",
  ]);
  assert.deepEqual(sourceKinds("src/a.mjs", "// docs/specifications/feature.md §1"), [
    "source_section_document_not_canonical §1 docs/specifications/feature.md",
  ]);
});

test("a heading number matches whole, written bare or after the section sign", () => {
  const sections = documentSections(
    "# T\n\n## 2. Blocks\n\n### 2.8 Dirty tree\n\n## §4.1 Limits\n\n## 2.81 Other\n\n" +
      "```text\n## 5 fenced\n```\n\nProse 6 here.\n",
  );
  assert.deepEqual([...sections].sort(), ["2", "2.8", "2.81", "4.1"]);
});

test("an undefined work-item label is a warning, a standard or a literal is not", () => {
  const prose = "Closes AC-006 and OPS-1.\nAgain AC-006, OPS-1 and W2-26, W2-26.";
  assert.deepEqual(kinds(findings({ "docs/a.md": prose })), [
    "undefined_vocabulary AC-006",
    "undefined_vocabulary OPS-1",
    "undefined_vocabulary W2-26",
  ]);
  const noise = [
    "UTF-8 twice: UTF-8, SHA-256 and SHA-256, ISO-8601 and ISO-8601.",
    'key = "F-001"; other = "F-001"; `F-002` and `F-002`.',
    "§A-WAIT-01 and MO-BACKLOG/1, §A-WAIT-01 and MO-BACKLOG/1.",
  ].join("\n");
  assert.deepEqual(kinds(findings({ "src/a.py": noise }, { owned: ["§A-WAIT-01"] })), []);
  const defined = "# Plan\n\n| Id | What |\n| -- | ---- |\n| AC-006 | one |\n\nAC-006, AC-006.\n";
  assert.deepEqual(findings({ "docs/plan.md": defined }), []);
});

/** One committed disposable project, as a consumer would have it. */
function consumerProject() {
  const root = mkdtempSync(join(tmpdir(), "mo-vocabulary-consumer-"));
  spaces.push(root);
  const files = {
    ...DOCS,
    "src/graph.py": [
      '"""Revocation plan (Graphiti spec §7.5)."""',
      "",
      "# The retry budget of `docs/x.md`",
      "# is section §1.2.",
      "",
      "# docs/x.md §9.9 is a section of another document.",
      "",
      "# docs/specifications/feature.md §1 is deleted at closure.",
      "",
      "# docs/references/archive.md §1 is an archive.",
      "",
      "# Implements §A-GHOST-01.",
      "",
      "# Closes AC-006; AC-006 again.",
      "",
      "# mo-vocabulary-ok: the next line shows the notation.",
      'EXAMPLE = "§4.4 of nothing"',
    ].join("\n"),
    "assets/logo.bin": "\u0000§9.9 binary bytes are not text",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const git = (...argv) => spawnSync("git", ["-C", root, ...argv], { encoding: "utf8" });
  git("init", "-q");
  git("add", ".");
  git("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "fixture");
  return root;
}

test("the shipped bundle judges a consumer project with the recipe's flags", () => {
  const root = consumerProject();
  // The bundle runs from outside this repository, with nothing beside it.
  const alone = mkdtempSync(join(tmpdir(), "mo-vocabulary-bundle-"));
  spaces.push(alone);
  const copy = join(alone, "mo-vocabulary.mjs");
  writeFileSync(copy, readFileSync(BUNDLE));
  for (const helper of [HELPER, copy]) {
    const run = spawnSync(
      process.execPath,
      [helper, "--root", root, "--first-party-root", "src", "--non-canonical", "docs/references"],
      { cwd: alone, encoding: "utf8" },
    );
    assert.equal(run.status, 1, run.stderr);
    const lines = run.stdout.trim().split("\n");
    const found = lines.slice(0, -1).map((line) => line.split(" ").slice(0, 3).join(" "));
    assert.deepEqual(found.sort(), [
      "error source_section_document_missing §7.5",
      "error source_section_document_not_canonical §1",
      "error source_section_document_not_canonical §1",
      "error source_section_missing §9.9",
      "error undefined_id §A-GHOST-01",
      "warning undefined_vocabulary AC-006",
    ]);
    assert.equal(lines.at(-1), "MO-VOCABULARY/1 status=violations errors=5 warnings=1");
    assert.match(
      run.stdout,
      /source_section_missing §9\.9 mentions=1 first=src\/graph\.py:6 document=docs\/x\.md/u,
    );
  }
  // Outside the first-party roots the contract does not apply; the corpus-wide
  // guesses still do.
  const vendored = spawnSync(
    process.execPath,
    [HELPER, "--root", root, "--first-party-root", "lib", "--non-canonical", "docs/references"],
    { encoding: "utf8" },
  );
  assert.doesNotMatch(vendored.stdout, /source_section/u);
  assert.match(vendored.stdout, /error undefined_id §A-GHOST-01/u);
});

test("mo-setup rolls the check out in order and never with a baseline", () => {
  const flat = (path) => readFileSync(join(ROOT, path), "utf8").replace(/\s+/gu, " ");
  const contract = flat("shared/references/project-setup.md");
  const setup = flat("src/skills/mo-setup/SKILL.md");
  for (const phrase of [
    "`--first-party-root <prefix>`",
    "`--non-canonical <prefix>`",
    "There is no configuration file",
    "source_section_document_not_canonical",
    "Run it once on its own",
    "without inventing its norm",
    "report `needs_attention` with the unresolved list and leave the stage out of QC",
    "After a clean run, connect the stage",
    "never disconnected",
    "no baseline, no warn-only mode",
  ]) {
    assert.ok(contract.includes(phrase), phrase);
  }
  assert.match(
    setup,
    /`scripts\/mo-vocabulary\.mjs` goes to `tools\/mo-vocabulary\.mjs` behind a QC target/u,
  );
  assert.match(setup, /the QC stage only after a clean run/u);
  // The shipped skill carries the bundle it tells a project to copy.
  assert.ok(readFileSync(BUNDLE, "utf8").length > 0);
});

test("a specification's architecture decision becomes a live anchor before product code", () => {
  const flat = (path) => readFileSync(join(ROOT, path), "utf8").replace(/\s+/gu, " ");
  const methodology = flat("shared/references/methodology.md");
  assert.match(
    methodology,
    /`checklist\.md` of observable outcomes, tests\/knowledge, the specification's architecture decisions moved to live `§A-\*` anchors/u,
  );
  assert.match(
    methodology,
    /still before substantive product code, the executor moves every architecture decision the specification introduces into the project's architecture directory under its own `§A-\*` identifier/u,
  );
  const protocol = flat("shared/references/review-protocol.md");
  assert.match(protocol, /## Anchor lens Code, tests and comments cite only live anchors/u);
  assert.match(protocol, /never moved into the architecture directory, is a finding/u);
  assert.match(
    flat("src/skills/mo-reviewer/SKILL.md"),
    /the deferral, anchor and E2E lenses the protocol describes/u,
  );
  const cases = JSON.parse(
    readFileSync(join(ROOT, "src/skills/mo-orchestrate-orca/evals/cases.json"), "utf8"),
  ).cases;
  const anchor = cases.find(
    ({ id }) => id === "mo-orchestrate-orca.regression-spec-decision-anchor",
  );
  assert.deepEqual(anchor.contracts, ["§A-MEMORY-01"]);
  for (const oracle of anchor.must) assert.match(oracle, /^under §A-MEMORY-01 /u);
  // The scenario names no section number: the case must not depend on the citation it forbids.
  assert.doesNotMatch(anchor.scenario, /§\d/u);
});
