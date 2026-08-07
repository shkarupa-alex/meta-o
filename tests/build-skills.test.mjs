/**
 * Tests for the installable-tree build.
 *
 * The properties under test are the ones that keep a committed build artefact
 * honest: every skill installs standalone, the shared files are byte-identical
 * copies, a hand-edited copy is refused, and frontmatter stays portable. A
 * failure here means someone could install a skill that silently disagrees with
 * the methodology.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

import {
  ALLOWED_FRONTMATTER,
  REQUIRED_AT_ROOT,
  SHARED_PLAN,
  frontmatter,
  walk,
} from "../tools/build-skills.mjs";

const markdown = new MarkdownIt();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILDER = join(ROOT, "tools", "build-skills.mjs");
const SOURCES = join(ROOT, "src", "skills");
const SHARED = join(ROOT, "shared");
const OUTPUT = join(ROOT, "skills");

/** Every skill this project ships, spelled out so a silent loss is a failure. */
const EXPECTED_SKILLS = [
  "mo-e2e",
  "mo-herdr",
  "mo-omnigent",
  "mo-reuse",
  "mo-review",
  "mo-setup",
  "mo-watchdog",
];

const clones = [];
after(() => {
  for (const path of clones) rmSync(path, { recursive: true, force: true });
});

/** A full copy of the repository, so a destructive test cannot touch the real one. */
function clone() {
  const target = mkdtempSync(join(tmpdir(), "mo-build-test-"));
  clones.push(target);
  const rootFiles = REQUIRED_AT_ROOT.map(([name]) => name);
  const files = ["src", "shared", "tools", ...rootFiles].join(" ");
  const result = spawnSync(
    "/bin/sh",
    ["-c", `cd "${ROOT}" && tar -cf - ${files} | tar -xf - -C "${target}"`],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  // The build tool imports real parsers now, and a clone has no install of its
  // own; one symlink is cheaper than a second node_modules and keeps the clone a
  // faithful copy of what `make skills` runs.
  symlinkSync(join(ROOT, "node_modules"), join(target, "node_modules"));
  return target;
}

function build(root, args = []) {
  return spawnSync(process.execPath, [join(root, "tools", "build-skills.mjs"), ...args], {
    encoding: "utf8",
    cwd: root,
  });
}

const sourceNames = readdirSync(SOURCES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

test("the committed skills tree matches a fresh build", () => {
  const result = spawnSync(process.execPath, [BUILDER, "--check"], { encoding: "utf8", cwd: ROOT });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("the shipped skills are exactly the seven this project claims", () => {
  assert.deepEqual(sourceNames, EXPECTED_SKILLS);
  const built = readdirSync(OUTPUT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(built, EXPECTED_SKILLS);
  // Anything else in skills/ would be offered to a skill manager as an eighth skill.
  const strays = readdirSync(OUTPUT, { withFileTypes: true }).filter(
    (entry) => !entry.isDirectory(),
  );
  assert.deepEqual(
    strays.map((entry) => entry.name),
    [],
  );
});

test("every source skill has portable frontmatter whose name matches its directory", () => {
  for (const name of sourceNames) {
    const text = readFileSync(join(SOURCES, name, "SKILL.md"), "utf8");
    const { data, error } = frontmatter(text);
    assert.ok(data, `${name} has no readable frontmatter: ${error}`);
    const keys = Object.keys(data);
    assert.ok(keys.includes("name") && keys.includes("description"), `${name} misses a key`);
    for (const key of keys) {
      assert.ok(ALLOWED_FRONTMATTER.has(key), `${name} uses non-canonical frontmatter "${key}"`);
    }
    assert.equal(data.name, name, `${name} declares a different name`);
  }
});

test("the frontmatter reader is a YAML parser, not a line reader", () => {
  const text = '---\nname: "mo-review"\ndescription: x\nmetadata:\n  extra: y\n---\nbody\n';
  assert.deepEqual(Object.keys(frontmatter(text).data), ["name", "description", "metadata"]);
  assert.equal(frontmatter(text).data.name, "mo-review");
  assert.equal(frontmatter("no frontmatter here\n").data, undefined);
  assert.equal(frontmatter("no frontmatter here\n").error, "no frontmatter block");

  // A second `name:` used to be accepted with the first one silently winning, so
  // a skill could pass this gate and install under a name nobody had read.
  const duplicated = "---\nname: mo-review\ndescription: x\nname: something-else\n---\nbody\n";
  assert.equal(frontmatter(duplicated).data, undefined);
  assert.match(frontmatter(duplicated).error, /duplicated mapping key/);

  // Block scalars and folded values are YAML, and a line reader mangles them.
  const folded = "---\nname: mo-review\ndescription: >-\n  one sentence\n  over two lines\n---\n";
  assert.equal(frontmatter(folded).data.description, "one sentence over two lines");
  assert.match(frontmatter("---\nname: [broken\n---\n").error, /.+/);
});

test("the shared files are byte-identical copies in every skill that declares them", () => {
  for (const [skill, pairs] of Object.entries(SHARED_PLAN)) {
    for (const [source, destination] of pairs) {
      const original = readFileSync(join(SHARED, source));
      const copy = readFileSync(join(OUTPUT, skill, destination));
      assert.ok(original.equals(copy), `skills/${skill}/${destination} is not a copy`);
    }
  }
});

test("the methodology has exactly one source owner", () => {
  const shared = walk(SHARED).filter((path) => path.endsWith("methodology.md"));
  assert.deepEqual(shared, ["references/methodology.md"]);
  for (const name of sourceNames) {
    assert.equal(
      existsSync(join(SOURCES, name, "references", "methodology.md")),
      false,
      `src/skills/${name} carries its own methodology copy`,
    );
  }
});

/**
 * The layout of the *project being worked on*, which exists on a user's machine
 * and not here. `mo-setup` defines this layout and the other skills rely on it.
 * Both entries are documented *alternatives* to a single file — `docs/e2e.md` and
 * `docs/business.md` — so a repository that has one will not have the other, and
 * this one has neither split.
 */
const PROJECT_LAYOUT = new Set(["docs/e2e/index.md", "docs/business/index.md"]);

/**
 * Paths that appear inside a worked example and are not references at all.
 *
 * `spec/checkout.md` is part of the sentence the methodology puts in an
 * orchestrator's mouth. Kept separate from `PROJECT_LAYOUT` on purpose: one list
 * is a contract with the user's repository, the other is prose. Merged, a later
 * reader cannot tell which entries may be dropped when the prose changes.
 */
const ILLUSTRATIVE = new Set(["spec/checkout.md"]);

/**
 * Directories of this repository that no install ever carries.
 *
 * `docs/references/` is imported material kept as received; `src/`, `tools/` and
 * `tests/` are how meta-o is built. A shipped file that points into any of them
 * resolves here and nowhere on a user's machine — which is how a reference to
 * `docs/references/grace.md` sat in an installed skill and looked fine locally.
 */
const NEVER_INSTALLED = ["docs/references/", "src/", "tools/", "tests/"];

/**
 * Every document path a Markdown file names, read from the parser's own tokens.
 *
 * Regexes stood here and missed real syntax: `[text](<a b.md>)` is a valid link
 * that no `](...)` pattern matches, so a broken destination written that way was
 * reported as fine. A parser also knows what is *not* prose — a path inside a
 * fenced block is part of a command someone types, not a reference this project
 * can resolve — and the project contract forbids parsing Markdown any other way.
 *
 * Only inline code and link destinations count, because those are the two forms
 * these documents use to point at a file.
 */
function documentPaths(text) {
  const found = [];
  const consider = (raw, allowSpaces) => {
    // A fragment or a query belongs to the link, not to the file: a shape test
    // anchored on `.md` rejected `[x](missing.md#section)` outright, so a dangling
    // link with a heading anchor — the normal way to cite a section — was never
    // checked at all. Split before percent-decoding: a literal `#` in a filename
    // travels as `%23` and is not a delimiter.
    let value = raw.trim().split(/[#?]/, 1)[0].trim();
    if (value === "") return;
    try {
      value = decodeURIComponent(value);
    } catch {
      /* a destination that is not valid percent-encoding is used as written */
    }
    // A space is meaningful in a `<...>` destination and is a word boundary
    // anywhere else: `cmp -s AGENTS.md CLAUDE.md` is a command, not a path.
    const shape = allowSpaces
      ? /^[A-Za-z0-9._][A-Za-z0-9. _/-]*\.(?:md|mjs)$/
      : /^[A-Za-z0-9._][A-Za-z0-9._/-]*\.(?:md|mjs)$/;
    if (shape.test(value)) found.push(value);
  };
  const visit = (tokens) => {
    for (const token of tokens) {
      if (token.type === "fence" || token.type === "code_block") continue;
      // `references/methodology.md §2.1` is how these documents cite a section:
      // the citation is not part of the file name, and a shape test anchored on
      // `.md` threw the whole reference away — which is how `mo-reuse` came to
      // point at a methodology file it does not ship, unnoticed by this gate.
      if (token.type === "code_inline") consider(token.content.replace(/\s+§.*$/, ""), false);
      if (token.type === "link_open") consider(token.attrGet("href") ?? "", true);
      if (token.children) visit(token.children);
    }
  };
  visit(markdown.parse(text, {}));
  return found;
}

test("the document-path reader sees the link forms a regex missed", () => {
  const text = [
    "See `references/methodology.md` and [the spec](<a name.md>).",
    "",
    "[a plain link](docs/e2e.md).",
    "",
    "```bash",
    "node scripts/not-a-reference.mjs --show",
    "```",
    "",
    "| a                | b                 |",
    "| ---------------- | ----------------- |",
    "| `in/a/table.md`  | [linked](cell.md) |",
  ].join("\n");
  const paths = documentPaths(text);
  assert.deepEqual(paths.sort(), [
    "a name.md",
    "cell.md",
    "docs/e2e.md",
    "in/a/table.md",
    "references/methodology.md",
  ]);
  assert.ok(
    !paths.includes("scripts/not-a-reference.mjs"),
    "a path inside a fenced command is not a reference this project resolves",
  );
});

test("a fragment or a query is not part of the file a link points at", () => {
  const text = [
    "[a section](docs/e2e.md#what-is-verified), [a query](docs/business.md?plain=1).",
    "",
    "[this page](#a-heading) points at no file at all.",
    "",
    "A dangling target keeps its anchor: [gone](missing.md#section).",
  ].join("\n");
  // `missing.md` is the point of the row: with the anchor attached it resolved
  // nowhere and was silently skipped, which is how a renamed reference survives.
  assert.deepEqual(documentPaths(text).sort(), ["docs/business.md", "docs/e2e.md", "missing.md"]);
});

test("a section citation is not part of the file it cites", () => {
  const text = [
    "`references/methodology.md §2.1` has the rules, and `docs/e2e.md §3` the gate.",
    "",
    "`cmp -s AGENTS.md CLAUDE.md` is still a command, not two references.",
  ].join("\n");
  assert.deepEqual(documentPaths(text).sort(), ["docs/e2e.md", "references/methodology.md"]);
});

test("each built skill is self-contained, and points at nothing that does not exist", () => {
  for (const name of sourceNames) {
    const skillDir = join(OUTPUT, name);
    const files = walk(skillDir);
    assert.ok(files.includes("SKILL.md"), `${name} has no SKILL.md`);
    // Every document path a shipped file names has to resolve: inside the skill
    // (a single-skill install must carry it), in this repository (the pointers
    // qualified "in the meta-o repository"), or in the project convention above.
    // A path that resolves nowhere reads to an agent as a file it failed to find
    // — that is exactly how a stale `docs/references/grace.md` survived a rename.
    for (const path of files) {
      const text = readFileSync(join(skillDir, path), "utf8");
      for (const target of documentPaths(text)) {
        for (const prefix of NEVER_INSTALLED) {
          assert.ok(
            !target.startsWith(prefix),
            `${name}/${path} points at ${target}, which no install carries`,
          );
        }
        const resolves =
          files.includes(target) ||
          files.includes(join(dirname(path), target).replace(/^\.\//, "")) ||
          PROJECT_LAYOUT.has(target) ||
          ILLUSTRATIVE.has(target) ||
          existsSync(join(ROOT, target));
        assert.ok(resolves, `${name}/${path} points at ${target}, which exists nowhere`);
      }
    }
  }
});

test("the files apm requires beside the skills are at the repository root", () => {
  for (const [required, reason] of REQUIRED_AT_ROOT) {
    assert.ok(existsSync(join(ROOT, required)), `${required} is missing: ${reason}`);
  }
  assert.ok(readFileSync(join(ROOT, "LICENSE"), "utf8").includes("MIT License"));
});

test("a build refuses to run without the files apm validates", () => {
  const root = clone();
  rmSync(join(root, "apm.yml"));
  const result = build(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /apm\.yml is missing from the repository root: apm refuses/);
});

test("a hand-edited built file is reported, and rebuilding restores it", () => {
  const root = clone();
  assert.equal(build(root).status, 0);
  const target = join(root, "skills", "mo-herdr", "references", "methodology.md");
  writeFileSync(target, "hand-edited\n");

  const check = build(root, ["--check"]);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /differs from source: mo-herdr\/references\/methodology\.md/);

  assert.equal(build(root).status, 0);
  assert.equal(build(root, ["--check"]).status, 0);
});

test("a stale built file is reported", () => {
  const root = clone();
  assert.equal(build(root).status, 0);
  writeFileSync(join(root, "skills", "mo-e2e", "leftover.md"), "old\n");
  const check = build(root, ["--check"]);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /stale in skills\/: mo-e2e\/leftover\.md/);
});

test("a source skill that shadows a shared file is refused", () => {
  const root = clone();
  writeFileSync(
    join(root, "src", "skills", "mo-herdr", "references", "methodology.md"),
    "divergent\n",
  );
  const result = build(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /shadows a shared file/);
});

test("non-canonical frontmatter is refused", () => {
  const root = clone();
  const path = join(root, "src", "skills", "mo-review", "SKILL.md");
  const text = readFileSync(path, "utf8");
  writeFileSync(path, text.replace("license: MIT", "license: MIT\nuser-invocable: true"));
  const result = build(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /non-canonical frontmatter keys: user-invocable/);
});

test("a name that disagrees with the directory is refused", () => {
  const root = clone();
  const path = join(root, "src", "skills", "mo-e2e", "SKILL.md");
  const text = readFileSync(path, "utf8");
  writeFileSync(path, text.replace("name: mo-e2e", "name: mo-e2e-tester"));
  const result = build(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must match the directory/);
});

test("an unknown argument is an error", () => {
  const result = spawnSync(process.execPath, [BUILDER, "--force"], { encoding: "utf8", cwd: ROOT });
  assert.equal(result.status, 2);
});

test("nothing shipped mentions the deleted control layer", () => {
  const forbidden = [
    "meta-o run ",
    "meta-o session",
    "meta-o preflight",
    "state.json",
    "qc-manifest",
    "snapshotDigest",
    "install.sh",
    "update.sh",
  ];
  for (const path of walk(OUTPUT)) {
    const text = readFileSync(join(OUTPUT, path), "utf8");
    for (const needle of forbidden) {
      assert.ok(!text.includes(needle), `skills/${path} still mentions "${needle}"`);
    }
  }
});
