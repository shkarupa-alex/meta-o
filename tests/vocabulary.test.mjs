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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  citedInSource,
  classify,
  deliberateFixture,
  definedTokens,
  vocabularyFindings,
  vocabularyReport,
} from "../tools/mo-vocabulary.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(ROOT, "tools", "mo-vocabulary.mjs");
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
  const result = spawnSync(
    process.execPath,
    [HELPER, "--root", ROOT, "--exclude", "docs/references", "--strict"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout);
});
