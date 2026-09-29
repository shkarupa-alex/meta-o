/**
 * Hold the setup reference to the grammar the shipped history checker runs:
 * its quoted expressions are the code's, and its worked examples pass that
 * checker on a disposable history while their near misses are refused.
 *
 * Protects §A-MEMORY-01.
 *
 * Every identifier below is fixture data for a disposable repository, not a
 * citation of this one, so this file is declared whole: mo-vocabulary-ok file.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

import { CITATION, HEADING_ID } from "../shared/scripts/knowledge-documents.mjs";
import { TRAILER } from "../shared/scripts/mo-knowledge-history.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE = join(ROOT, "skills", "mo-setup", "references", "knowledge-id-history.md");
const HELPER = join(ROOT, "skills", "mo-setup", "scripts", "mo-knowledge-history.mjs");
const scratch = [];
after(() => scratch.forEach((path) => rmSync(path, { recursive: true, force: true })));

const blocks = fromMarkdown(readFileSync(REFERENCE, "utf8")).children.filter(
  (node) => node.type === "code",
);

/** The worked examples: each trailer block and the YAML record right after it. */
const examples = new Map(
  blocks.flatMap((node, index) => {
    const match = node.lang === "text" ? TRAILER.exec(node.value) : null;
    if (!match) return [];
    const record = blocks[index + 1];
    assert.equal(record?.lang, "yaml", `${node.value} has no record after it`);
    return [[match[1], { trailer: node.value, record: record.value }]];
  }),
);

test("the reference quotes the code's expressions verbatim", () => {
  const quoted = new Set(blocks.filter((node) => node.lang === "text").map((node) => node.value));
  for (const expression of [HEADING_ID, CITATION, TRAILER]) {
    assert.ok(quoted.has(expression.source), `not quoted: ${expression.source}`);
  }
  assert.deepEqual([...examples.keys()].sort(), ["editorial", "remove", "reuse"]);
});

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

const BUSINESS = [
  "# Business",
  "",
  "## §B-RUNTIME-01 — Runtime promise",
  "",
  "The service answers every request.",
  "",
  "## §B-RUNTIME-02 — Restart promise",
  "",
  "The service survives a restart.",
  "",
].join("\n");
const DECISION = "# §A-RUNTIME-01 — Runtime decision\n\nServes §B-RUNTIME-01.\n";

/** A disposable history at the shared starting point; returns root and cutoff. */
function history() {
  const root = mkdtempSync(join(tmpdir(), "mo-grammar-"));
  scratch.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "user.name", "Fixture");
  write(root, { "docs/business.md": BUSINESS, "docs/architecture/runtime.md": DECISION });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  return { root, cutoff: git(root, "rev-parse", "HEAD") };
}

function write(root, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/** Commit an edit with its trailer and record, then run the shipped checker. */
function apply(files, trailer, record) {
  const { root, cutoff } = history();
  const decision = files["docs/architecture/runtime.md"] ?? DECISION;
  write(root, {
    ...files,
    "docs/architecture/runtime.md":
      record === null ? decision : `${decision}\n\`\`\`yaml\n${record}\n\`\`\`\n`,
  });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", `change\n\n${trailer}`);
  return spawnSync(process.execPath, [HELPER, "--cutoff", cutoff], { cwd: root, encoding: "utf8" });
}

const EDITS = {
  reuse: {
    "docs/business.md": BUSINESS.replace(
      "The service answers every request.",
      "The service answers every request, also after a restart.",
    ),
  },
  remove: { "docs/business.md": BUSINESS.split("## §B-RUNTIME-02")[0].trimEnd() + "\n" },
  editorial: {
    "docs/business.md": BUSINESS.replace("— Runtime promise", "— The promise to answer").replace(
      "— Restart promise",
      "— The promise to survive restarts",
    ),
  },
};

test("every worked example passes the shipped checker", () => {
  for (const [action, { trailer, record }] of examples) {
    const result = apply(EDITS[action], trailer, record);
    assert.equal(result.status, 0, `${action}: ${result.stderr}`);
    assert.match(result.stdout, /status=ok .* definitions=\d+\n$/u, action);
  }
});

test("the near misses the reference names are refused", () => {
  const { trailer: reuse, record: reuseRecord } = examples.get("reuse");
  const { trailer: editorial, record: editorialRecord } = examples.get("editorial");
  const refusals = [
    [
      "old notation",
      {
        "docs/business.md": BUSINESS.replaceAll("§B-RUNTIME-0", "B"),
        "docs/architecture/runtime.md": "# D24 — Runtime decision\n\nServes B1.\n",
      },
      "Knowledge-ID-Change: remove §A-RUNTIME-01 via §A-RUNTIME-01",
      null,
      /silent deletion|no_definitions/u,
    ],
    [
      "colon heading",
      { "docs/architecture/runtime.md": DECISION.replace("01 — Runtime", "01: Runtime") },
      "",
      null,
      /silent deletion §A-RUNTIME-01/u,
    ],
    [
      "via a SHA",
      EDITS.reuse,
      reuse.replace("via §A-RUNTIME-01", `via ${"a".repeat(40)}`),
      reuseRecord,
      /semantic reuse §B-RUNTIME-01/u,
    ],
    [
      "editorial with a boundary",
      EDITS.editorial,
      editorial,
      `${editorialRecord}\n  new_boundary: Something else.`,
      /semantic reuse §B-RUNTIME-0[12]/u,
    ],
    [
      "unsorted editorial list",
      EDITS.editorial,
      editorial.replace("§B-RUNTIME-01,§B-RUNTIME-02", "§B-RUNTIME-02,§B-RUNTIME-01"),
      editorialRecord.replace("[§B-RUNTIME-01, §B-RUNTIME-02]", "[§B-RUNTIME-02, §B-RUNTIME-01]"),
      /semantic reuse §B-RUNTIME-0[12]/u,
    ],
  ];
  for (const [name, files, trailer, record, expected] of refusals) {
    const result = apply(files, trailer, record);
    assert.equal(result.status, 1, `${name}: ${result.stdout}`);
    assert.match(result.stderr, expected, name);
  }
  // The old notation leaves nothing to protect: zero is refused on its own.
  const { root } = history();
  write(root, {
    "docs/business.md": "# Business\n\n## B2 — Runtime promise\n",
    "docs/architecture/runtime.md": "# D24 — Runtime decision\n",
  });
  git(root, "add", "-A");
  git(
    root,
    "commit",
    "-q",
    "-m",
    "migrate away\n\n" + "Knowledge-ID-Change: remove §B-RUNTIME-01 via §A-RUNTIME-01",
  );
  const empty = spawnSync(process.execPath, [HELPER, "--cutoff", git(root, "rev-parse", "HEAD")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(empty.status, 1);
  assert.match(empty.stdout, / definitions=0\n$/u);
  assert.match(empty.stderr, /^no_definitions: /mu);
});
