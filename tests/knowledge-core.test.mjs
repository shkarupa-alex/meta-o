/**
 * Prove the portable current-tree knowledge checker on disposable repositories.
 *
 * Protects §A-MEMORY-05.
 *
 * Every other identifier below is fixture data for a disposable repository, not
 * a citation of this one, so this file is declared whole: mo-vocabulary-ok file.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { knowledgeLine, knowledgeReport } from "../shared/scripts/mo-knowledge.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const CLI = resolve(ROOT, "shared", "scripts", "mo-knowledge.mjs");
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

// A parent checkout or a hook's GIT_DIR must not decide which repository a
// fixture is; the ceiling keeps discovery inside the temporary directory.
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);
ENV.GIT_CEILING_DIRECTORIES = tmpdir();

const BASE = {
  "docs/business.md":
    "# Зачем существует Demo\n\n" +
    "## §B-CORE-01 — Первый тезис\n\nТекст.\n\n" +
    "## §B-CORE-02 — Второй тезис\n\nТекст.\n",
  "docs/architecture/core.md":
    "# §A-CORE-01 — Решение опирается на тезис\n\nПричина — §B-CORE-01.\n",
  "README.md":
    "# Demo\n\n" +
    "Смысл описан в документе [Зачем существует Demo](docs/business.md), а решение —\n" +
    "в [§A-CORE-01 — Решение опирается на тезис](docs/architecture/core.md#top).\n" +
    "Внешняя [ссылка](https://example.invalid/x.md) не проверяется.\n\n" +
    "```text\n§B-FENCED-01 в блоке кода не является цитатой\n```\n",
  "src/index.js": "export {};\n",
};

const ARGS = [
  "--business",
  "docs/business.md",
  "--architecture",
  "docs/architecture",
  "--docs",
  "README.md",
  "--first-party-root",
  ".",
];

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: ENV });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/** §A-MEMORY-05 builds one committed project so only tracked bytes are judged. */
function fixture(overrides = {}, { symlinks = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mo-knowledge-"));
  roots.push(root);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  for (const [path, content] of Object.entries({ ...BASE, ...overrides })) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  for (const [path, target] of Object.entries(symlinks)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(target, join(root, path));
  }
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "fixture"]);
  return root;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: ENV });
}

function check(root, extra = []) {
  return run(["check", "--repo", root, ...ARGS, ...extra], root);
}

function assertViolation(result, reason, fields = "") {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout.split("\n")[0], /^MO-KNOWLEDGE\/1 status=violations /u);
  const line = result.stdout.split("\n").find((entry) => entry.includes(`reason=${reason} `));
  assert.ok(line, `no ${reason} in:\n${result.stdout}`);
  assert.ok(line.includes(fields), `${line} lacks ${fields}`);
  return line;
}

test("a fresh small project passes with exact counts", () => {
  const result = check(fixture());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout, "MO-KNOWLEDGE/1 status=ok files=3 definitions=3 uncovered=0\n");
});

test("a tracked first-party document neither declared nor excluded is a violation", () => {
  const root = fixture({ "docs/notes.md": "# Notes\n" });
  const result = check(root);
  assert.match(
    result.stdout,
    /^MO-KNOWLEDGE\/1 status=violations files=3 definitions=3 uncovered=1\n/u,
  );
  assertViolation(result, "unclassified_tracked_file", 'path="docs/notes.md" line=1');
});

test("an exact exclusion suppresses the unclassified file and is echoed", () => {
  const root = fixture({ "docs/notes.md": "# Notes\n" });
  const result = check(root, ["--exclude", "docs/notes.md"]);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(
    result.stdout,
    "MO-KNOWLEDGE/1 status=ok files=3 definitions=3 uncovered=0\n" +
      'excluded path="docs/notes.md"\n',
  );
});

test("an exclusion that is not an exact tracked file is a call error", () => {
  const root = fixture({ "docs/notes.md": "# Notes\n" });
  writeFileSync(join(root, "docs", "untracked.md"), "# Untracked\n");
  for (const exclude of ["docs/untracked.md", "docs", "docs/*.md"]) {
    const result = check(root, ["--exclude", exclude]);
    assert.equal(result.status, 2, exclude);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /is not a tracked file\nusage: mo-knowledge\.mjs check/u);
  }
});

test("a link label must contain the target document's H1", () => {
  const readme = BASE["README.md"].replace("[Зачем существует Demo]", "[бизнес]");
  assertViolation(
    check(fixture({ "README.md": readme })),
    "link_label_mismatch",
    'path="README.md" line=3 target="docs/business.md"',
  );
  const spaced = BASE["README.md"].replace(
    "[Зачем существует Demo]",
    "[см.  ЗАЧЕМ\nсуществует demo]",
  );
  assert.equal(check(fixture({ "README.md": spaced })).status, 0);
});

test("a hard line break inside a link label keeps the words apart", () => {
  const BUNDLE = resolve(ROOT, "skills", "mo-setup", "scripts", "mo-knowledge.mjs");
  const reference = (label) =>
    BASE["README.md"].replace("[Зачем существует Demo](docs/business.md)", `[${label}][business]`) +
    "\n[business]: docs/business.md\n";
  const inline = (label) => BASE["README.md"].replace("[Зачем существует Demo]", `[${label}]`);
  for (const script of [CLI, BUNDLE]) {
    for (const label of ["Зачем  \nсуществует Demo", "Зачем\\\nсуществует Demo"]) {
      for (const readme of [inline(label), reference(label)]) {
        const root = fixture({ "README.md": readme });
        const result = spawnSync(process.execPath, [script, "check", "--repo", root, ...ARGS], {
          cwd: root,
          encoding: "utf8",
          env: ENV,
        });
        assert.equal(result.status, 0, `${script}\n${readme}\n${result.stdout}`);
      }
    }
  }
});

test("a relative Markdown link must resolve to a tracked file", () => {
  const readme = `${BASE["README.md"]}\nСм. [Missing](docs/missing%20file.md).\n`;
  assertViolation(
    check(fixture({ "README.md": readme })),
    "broken_link",
    'target="docs/missing file.md"',
  );
  const outside = `${BASE["README.md"]}\nСм. [Up](../outside.md).\n`;
  assertViolation(
    check(fixture({ "README.md": outside })),
    "broken_link",
    'target="../outside.md"',
  );
});

test("an id defined twice across the business and architecture scope is a duplicate", () => {
  const root = fixture({
    "docs/architecture/other.md": "# §A-CORE-01 — Снова то же\n\nПричина — §B-CORE-02.\n",
  });
  assertViolation(
    check(root),
    "duplicate_id",
    'path="docs/architecture/other.md" line=1 id=§A-CORE-01',
  );
});

test("a definition outside its layer's home is misplaced", () => {
  const readme = `${BASE["README.md"]}\n## §B-CORE-03 — Не на месте\n`;
  const result = check(fixture({ "README.md": readme }));
  assertViolation(result, "misplaced_definition", "id=§B-CORE-03");
  assert.doesNotMatch(result.stdout, /unresolved_citation/u);
});

test("a citation that resolves to no definition is a violation", () => {
  const readme = `${BASE["README.md"]}\nСм. §B-CORE-09.\n`;
  assertViolation(
    check(fixture({ "README.md": readme })),
    "unresolved_citation",
    'path="README.md" line=11 id=§B-CORE-09',
  );
});

test("a decision section must cite a business reason", () => {
  const root = fixture({
    "docs/architecture/core.md":
      "# §A-CORE-01 — Решение без причины\n\nТекст.\n\n## Подробности\n\nСм. §A-CORE-01.\n",
  });
  assertViolation(check(root), "decision_without_business_reason", "id=§A-CORE-01");
});

test("each declared document has exactly one H1", () => {
  const missing = BASE["README.md"].replace("# Demo\n", "## Demo\n");
  assertViolation(
    check(fixture({ "README.md": missing })),
    "missing_h1",
    'path="README.md" line=1',
  );
  const twice = `${BASE["README.md"]}\n# Second\n`;
  assertViolation(
    check(fixture({ "README.md": twice })),
    "multiple_h1",
    'path="README.md" line=11',
  );
});

test("a scope with no definitions is a violation, not a vacuous pass", () => {
  const root = fixture({
    "docs/business.md": "# Зачем существует Demo\n\nТекст.\n",
    "docs/architecture/core.md": "# Решение\n\nТекст.\n",
    "README.md": "# Demo\n",
  });
  const result = check(root);
  assert.match(result.stdout, /^MO-KNOWLEDGE\/1 status=violations files=3 definitions=0 /u);
  assertViolation(result, "no_definitions", 'path="docs/business.md"');
});

test("an unreadable declared document is unknown, never ok", () => {
  const root = fixture({}, { symlinks: { "docs/ghost.md": "nowhere.md" } });
  const result = check(root, ["--docs", "docs/ghost.md"]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /^MO-KNOWLEDGE\/1 status=unknown files=4 /u);
  assert.match(result.stdout, /\nunknown reason=unreadable detail="docs\/ghost\.md: symlink"\n/u);
});

test("a tracked symlink is never followed, wherever it points", () => {
  const outside = mkdtempSync(join(tmpdir(), "mo-knowledge-outside-"));
  roots.push(outside);
  writeFileSync(join(outside, "business.md"), BASE["docs/business.md"]);
  const targets = {
    external: join(outside, "business.md"),
    inside: "../README.md",
    missing: "gone.md",
  };
  for (const [name, target] of Object.entries(targets)) {
    const root = fixture(
      { "docs/business.md": null },
      { symlinks: { "docs/business.md": target } },
    );
    const result = check(root);
    assert.equal(result.status, 2, `${name}: ${result.stdout}`);
    assert.match(result.stdout, /^MO-KNOWLEDGE\/1 status=unknown /u, name);
    assert.match(result.stdout, /detail="docs\/business\.md: symlink"/u, name);
  }
  // A tracked path whose directory was swapped for a symlink leads the same
  // bytes out of the repository: the index still lists it, the disk does not hold it.
  const root = fixture();
  mkdirSync(join(outside, "architecture"));
  writeFileSync(join(outside, "architecture", "core.md"), BASE["docs/architecture/core.md"]);
  rmSync(join(root, "docs", "architecture"), { recursive: true, force: true });
  symlinkSync(join(outside, "architecture"), join(root, "docs", "architecture"));
  const through = check(root);
  assert.equal(through.status, 2, through.stdout);
  assert.match(through.stdout, /detail="docs\/architecture\/core\.md: outside_repository"/u);
});

test("without --repo the Git root is found from a nested cwd", () => {
  const root = fixture();
  const nested = join(root, "src");
  const result = run(["check", ...ARGS], nested);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^MO-KNOWLEDGE\/1 status=ok files=3 /u);
});

test("an explicit --repo wins over the cwd", () => {
  const good = fixture();
  const bad = fixture({ "docs/notes.md": "# Notes\n" });
  const result = run(["check", "--repo", good, ...ARGS], join(bad, "docs"));
  assert.equal(result.status, 0, result.stdout);
  assert.equal(run(["check", ...ARGS], join(bad, "docs")).status, 1);
});

test("outside Git the answer is a typed unknown", () => {
  const outside = mkdtempSync(join(tmpdir(), "mo-knowledge-outside-"));
  roots.push(outside);
  const result = run(["check", ...ARGS], outside);
  assert.equal(result.status, 2, result.stderr);
  assert.match(
    result.stdout,
    /^MO-KNOWLEDGE\/1 status=unknown files=0 definitions=0 uncovered=0\nunknown reason=not_git_repository detail="/u,
  );
});

test("the mo-vocabulary-ok marker exempts its line, the next line and a declared file", () => {
  const exempt =
    `${BASE["README.md"]}\n` +
    "Пример §B-EXAMPLE-01 <!-- mo-vocabulary-ok -->\n\n" +
    "<!-- mo-vocabulary-ok -->\nПример §B-EXAMPLE-02.\n";
  assert.equal(check(fixture({ "README.md": exempt })).status, 0);
  const fileWide =
    "<!-- mo-vocabulary-ok file -->\n\n# Examples\n\nСм. §A-EXAMPLE-01 и §B-EXAMPLE-03.\n";
  const root = fixture({ "docs/examples.md": fileWide });
  assert.equal(check(root, ["--docs", "docs/examples.md"]).status, 0);
  const tooFar = `${BASE["README.md"]}\n<!-- mo-vocabulary-ok -->\n\nПример §B-EXAMPLE-04.\n`;
  assertViolation(
    check(fixture({ "README.md": tooFar })),
    "unresolved_citation",
    "id=§B-EXAMPLE-04",
  );
  const buried = "# Examples\n\n<!-- mo-vocabulary-ok file -->\n\nСм. §B-EXAMPLE-05.\n";
  const late = fixture({ "docs/examples.md": buried });
  assertViolation(
    check(late, ["--docs", "docs/examples.md"]),
    "unresolved_citation",
    "id=§B-EXAMPLE-05",
  );
});

test("a directory in --docs declares every tracked Markdown file under it", () => {
  const root = fixture({ "docs/guide/a.md": "# A\n", "docs/guide/b.md": "# B\n" });
  const result = check(root, ["--docs", "docs/guide"]);
  assert.equal(result.stdout, "MO-KNOWLEDGE/1 status=ok files=5 definitions=3 uncovered=0\n");
});

test("diagnostics are bounded and the remainder is counted", () => {
  const violations = Array.from({ length: 60 }, (_, index) => ({
    reason: "missing_h1",
    path: `docs/${index}.md`,
    line: 1,
  }));
  const result = {
    status: "violations",
    files: 60,
    definitions: 1,
    uncovered: 0,
    excluded: [],
    violations,
  };
  const lines = knowledgeReport(result).trimEnd().split("\n");
  assert.equal(lines[0], knowledgeLine(result));
  assert.equal(lines.length, 52);
  assert.equal(lines.at(-1), "truncated more=10");
});

test("help prints the grammar and a malformed call is a call error", () => {
  const help = run(["--help"], ROOT);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^usage: mo-knowledge\.mjs check /u);
  const missing = run(["check", "--business", "docs/business.md"], ROOT);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^error: --architecture is required\nusage:/u);
});
