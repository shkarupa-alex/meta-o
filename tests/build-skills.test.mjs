/**
 * Protect the exact skill distribution and shared source ownership.
 *
 * Protects §A-DISTRIBUTION-01, §A-DISTRIBUTION-03 and §A-DISTRIBUTION-06.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

import {
  ALLOWED_FRONTMATTER,
  BUNDLES,
  LICENSE_ALLOWLIST,
  LICENSE_EXCEPTIONS,
  SHARED_PLAN,
  licenseSlug,
  frontmatter,
  stripSourceAnchors,
  walk,
} from "../tools/build-skills.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = join(ROOT, "src", "skills");
const OUTPUT = join(ROOT, "skills");
const EXPECTED = [
  "find-reuse",
  "mo-e2e",
  "mo-orchestrate-orca",
  "mo-review-orca",
  "mo-setup",
  "mo-watchdog",
  "senior-jsts",
  "senior-python",
];

function directories(path) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test("the committed installable tree is a fresh exact build", () => {
  const result = spawnSync(process.execPath, [join(ROOT, "tools", "build-skills.mjs"), "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.deepEqual(directories(SOURCES), EXPECTED);
  assert.deepEqual(directories(OUTPUT), EXPECTED);
  assert.deepEqual(
    readdirSync(OUTPUT, { withFileTypes: true }).filter((entry) => !entry.isDirectory()),
    [],
  );
});

test("frontmatter is portable and names every skill exactly", () => {
  for (const name of EXPECTED) {
    const parsed = frontmatter(readFileSync(join(SOURCES, name, "SKILL.md"), "utf8"));
    assert.ok(parsed.data, `${name}: ${parsed.error}`);
    assert.equal(parsed.data.name, name);
    assert.equal(typeof parsed.data.description, "string");
    for (const key of Object.keys(parsed.data)) assert.ok(ALLOWED_FRONTMATTER.has(key));
  }
});

test("every declared shared file is copied byte-for-byte and never shadowed", () => {
  for (const [skill, entries] of Object.entries(SHARED_PLAN)) {
    for (const [source, destination] of entries) {
      assert.equal(
        existsSync(join(SOURCES, skill, destination)),
        false,
        `${skill} shadows ${source}`,
      );
      const built = readFileSync(join(OUTPUT, skill, destination));
      // A bundled destination is build output, not a copy, so only the copied
      // ones can be compared byte for byte against their source.
      if (!(destination in BUNDLES)) {
        const authored = readFileSync(join(ROOT, "shared", source), "utf8");
        assert.equal(built.toString("utf8"), stripSourceAnchors(authored, source));
      }
    }
  }
});

test("every bundle ships exactly the notices of the roots it pulled", () => {
  for (const [skill, entries] of Object.entries(SHARED_PLAN)) {
    const expected = new Set();
    for (const [, destination] of entries) {
      for (const root of BUNDLES[destination]?.roots ?? []) {
        expected.add(`${licenseSlug(root)}-LICENSE.txt`);
      }
    }
    const directory = join(OUTPUT, skill, "licenses");
    const shipped = new Set(existsSync(directory) ? readdirSync(directory) : []);
    assert.deepEqual([...shipped].sort(), [...expected].sort(), `${skill} licence notices`);
    for (const notice of shipped) {
      assert.ok(readFileSync(join(directory, notice), "utf8").trim().length > 0, notice);
    }
  }
  // Notices are generated from the installed packages, so nothing in the source
  // tree may claim to be one: a stored copy is what silently stops matching.
  assert.equal(existsSync(join(ROOT, "shared", "licenses")), false);
});

test("a root the closure does not name, or may not redistribute, breaks generation", () => {
  // The closure is what makes the licence set provable rather than believed, so
  // it has to fail on both halves: an unexpected root and unacceptable terms.
  for (const [destination, closure] of Object.entries(BUNDLES)) {
    assert.ok(closure.roots.length > 0, `${destination} declares no roots`);
    assert.ok(Number.isInteger(closure.baselineBytes), `${destination} has no measured baseline`);
    const carrier = Object.entries(SHARED_PLAN).find(([, entries]) =>
      entries.some(([, target]) => target === destination),
    );
    assert.ok(carrier, `${destination} reaches no skill`);
    const built = readFileSync(join(OUTPUT, carrier[0], destination)).byteLength;
    assert.ok(
      built <= Math.ceil(closure.baselineBytes * 1.25),
      `${destination} is ${built} bytes against a ${closure.baselineBytes} baseline`,
    );
    for (const root of closure.roots) {
      const declared = JSON.parse(
        readFileSync(join(ROOT, "node_modules", ...root.split("/"), "package.json"), "utf8"),
      ).license;
      assert.ok(
        LICENSE_ALLOWLIST.has(declared) || LICENSE_EXCEPTIONS[root] === declared,
        `${root} is licensed ${declared}`,
      );
    }
  }
});

test("all orchestration skills carry one self-contained model helper and posture probe", () => {
  const backends = EXPECTED.filter((name) => name.startsWith("mo-orchestrate-"));
  const bundles = backends.map((name) =>
    readFileSync(join(OUTPUT, name, "scripts", "mo-models.mjs")),
  );
  for (const bundle of bundles.slice(1)) assert.ok(bundle.equals(bundles[0]));
  for (const name of backends) {
    for (const script of ["mo-models.mjs", "mo-posture.sh"]) {
      assert.notEqual(statSync(join(OUTPUT, name, "scripts", script)).mode & 0o111, 0);
    }
    assert.equal(existsSync(join(OUTPUT, name, "node_modules")), false);
  }
});

test("the model helper is one platform-neutral bundle reproducible through symlinked dependencies", () => {
  const helper = join(OUTPUT, "mo-orchestrate-orca", "scripts", "mo-models.mjs");
  const bundle = readFileSync(helper, "utf8");
  assert.doesNotMatch(
    bundle,
    /(?:from\s*|import\s*\()\s*["']@anthropic-ai\/claude-agent-sdk["']/,
    "the installed helper must not resolve the SDK from ambient node_modules",
  );
  assert.doesNotMatch(
    bundle,
    /@anthropic-ai\/claude-agent-sdk-(?:darwin|linux|win32)-/,
    "a bundle built on one OS must not embed that OS's optional native package",
  );
  assert.doesNotMatch(bundle, new RegExp(ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const portableRoot = mkdtempSync(join(tmpdir(), "meta-o-portable-build-"));
  try {
    for (const item of [
      "tools",
      "shared",
      "src",
      "package.json",
      "apm.yml",
      "README.md",
      "LICENSE",
    ])
      cpSync(join(ROOT, item), join(portableRoot, item), { recursive: true });
    symlinkSync(
      join(ROOT, "node_modules"),
      join(portableRoot, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const rebuilt = spawnSync(process.execPath, [join(portableRoot, "tools", "build-skills.mjs")], {
      cwd: portableRoot,
      encoding: "utf8",
    });
    assert.equal(rebuilt.status, 0, `${rebuilt.stdout}${rebuilt.stderr}`);
    const rebuiltHelper = readFileSync(
      join(portableRoot, "skills", "mo-orchestrate-orca", "scripts", "mo-models.mjs"),
    );
    assert.ok(
      rebuiltHelper.equals(readFileSync(helper)),
      "symlinked dependency layout changed bytes",
    );
    assert.doesNotMatch(
      rebuiltHelper.toString("utf8"),
      new RegExp(portableRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  } finally {
    rmSync(portableRoot, { recursive: true, force: true });
  }
});

test("review and setup packages carry every contract their entry skill routes to", () => {
  for (const backend of ["orca"]) {
    for (const entry of [`mo-review-${backend}`, `mo-orchestrate-${backend}`]) {
      assert.equal(
        existsSync(join(OUTPUT, entry, "references", "purpose-and-architecture.md")),
        true,
      );
      assert.match(
        readFileSync(join(SOURCES, entry, "SKILL.md"), "utf8"),
        /references\/purpose-and-architecture\.md/,
      );
    }
  }
  const setupEntry = readFileSync(join(SOURCES, "mo-setup", "SKILL.md"), "utf8");
  for (const profile of ["qc-python.md", "qc-typescript.md"]) {
    assert.equal(existsSync(join(OUTPUT, "mo-setup", "references", profile)), true);
    assert.match(setupEntry, new RegExp(profile));
  }
  // Setup must prove the stable title capability from its own package, and
  // every helper or reference its shipped prose points to must ship with it.
  const setupRoot = join(OUTPUT, "mo-setup");
  const setupProse = walk(setupRoot)
    .filter((file) => file.endsWith(".md"))
    .map((file) => readFileSync(join(setupRoot, file), "utf8"))
    .join("\n");
  assert.match(setupProse, /visualLayouts\[\]\.root\.tabs\[\]\.title/);
  for (const [, dir, name] of setupProse.matchAll(/\b(scripts|references)\/([\w.-]+\.\w+)/gu))
    assert.equal(existsSync(join(setupRoot, dir, name)), true, `${dir}/${name}`);
  for (const [, name] of setupProse.matchAll(/bundled `([\w.-]+\.\w+)`/gu))
    assert.equal(existsSync(join(setupRoot, "scripts", name)), true, name);
});

test("watchdog is shipped executable and source/build file sets agree", () => {
  assert.notEqual(
    statSync(join(OUTPUT, "mo-watchdog", "scripts", "mo-watchdog.sh")).mode & 0o111,
    0,
  );
  assert.ok(walk(OUTPUT).length > EXPECTED.length);
});

function semantic(node) {
  if (Array.isArray(node)) return node.map(semantic);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => key !== "position")
      .map(([key, value]) => [key, semantic(value)]),
  );
}

function markerSpans(source) {
  const spans = [];
  const visit = (node) => {
    if (node.type === "html" && String(node.value).includes("mo:source-anchor")) {
      spans.push([node.position.start.offset, node.position.end.offset]);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(fromMarkdown(source));
  return spans;
}

/**
 * The published instruction must differ from its source by the marker nodes and
 * nothing else, so this compares the reparsed trees rather than a hand-written
 * expected string: an expectation written by hand is what let the stripper eat
 * the line breaks around a marker and merge two blocks into one.
 */
function assertOnlyMarkersRemoved(source) {
  const result = stripSourceAnchors(source);
  const expected = fromMarkdown(source);
  expected.children = expected.children.filter(
    (node) => !(node.type === "html" && String(node.value).includes("mo:source-anchor")),
  );
  assert.deepEqual(semantic(fromMarkdown(result)), semantic(expected));
  assert.doesNotMatch(result, /mo:source-anchor/);
  let retained = "";
  let cursor = 0;
  for (const [start, end] of markerSpans(source)) {
    retained += source.slice(cursor, start);
    cursor = end;
  }
  retained += source.slice(cursor);
  assert.equal(result, retained);
  return result;
}

test("source anchors are stripped positionally and malformed placements fail closed", () => {
  // Only the span goes, so the line the marker sat on stays behind as one
  // blank line. Authored placement is what bounds that residue: a marker with
  // no blank line before it publishes one extra blank line, while a
  // blank-line-delimited marker publishes three and is not authored anywhere.
  assert.equal(
    assertOnlyMarkersRemoved(
      "Before.\n<!-- mo:source-anchor §A-MEMORY-01 -->\n\nAfter `§A-MEMORY-01`.\n",
    ),
    "Before.\n\n\nAfter `§A-MEMORY-01`.\n",
  );
  assert.equal(
    assertOnlyMarkersRemoved(
      "Before.\n\n<!-- mo:source-anchor §A-MEMORY-01 -->\n\nAfter `§A-MEMORY-01`.\n",
    ),
    "Before.\n\n\n\nAfter `§A-MEMORY-01`.\n",
  );
  // A comment interrupts a paragraph in CommonMark, so these are two blocks in
  // the source and must stay two blocks in the published instruction.
  const tight = assertOnlyMarkersRemoved("Before\n<!-- mo:source-anchor §A-MEMORY-01 -->\nAfter\n");
  assert.equal(tight, "Before\n\nAfter\n");
  assert.throws(
    () => stripSourceAnchors("<!-- mo:source-anchor §A-MEMORY-01 --> \n"),
    /malformed source anchor/,
  );
  assert.throws(
    () => stripSourceAnchors(" <!-- mo:source-anchor §A-MEMORY-01 -->\n"),
    /malformed source anchor/,
  );
  assertOnlyMarkersRemoved(
    "# Title\n\n<!-- mo:source-anchor §A-MEMORY-01 -->\n\n- item\n\n" +
      "<!-- mo:source-anchor §A-EVAL-01 -->\n\nTail.\n",
  );
  for (const relative of walk(join(ROOT, "shared", "references"))) {
    const authored = readFileSync(join(ROOT, "shared", "references", relative), "utf8");
    if (authored.includes("mo:source-anchor")) assertOnlyMarkersRemoved(authored);
  }
  assert.throws(
    () => stripSourceAnchors("Before <!-- mo:source-anchor §A-MEMORY-01 --> after.\n"),
    /outside a standalone HTML marker/,
  );
  assert.throws(
    () => stripSourceAnchors("`<!-- mo:source-anchor §A-MEMORY-01 -->`\n"),
    /outside a standalone HTML marker/,
  );
  assert.throws(
    () => stripSourceAnchors("<!-- mo:source-anchor §A-memory-01 -->\n"),
    /malformed source anchor/,
  );
  // markdownlint and prettier both exclude the generated tree, so the shipped
  // bytes need their own bound on that residue. One blank line is the line the
  // marker occupied and may not be removed; three means a marker was authored
  // between two blank lines, which is the artifact this guard reports.
  for (const relative of walk(OUTPUT).filter((path) => path.endsWith(".md"))) {
    assert.doesNotMatch(readFileSync(join(OUTPUT, relative), "utf8"), /\n\n\n\n/u, relative);
  }
});

test("find-reuse is portable and the retired name is absent", () => {
  // The installed copy is what has to be portable, so both trees are scanned,
  // and every shipped file is, not only the Markdown ones.
  const files = [SOURCES, OUTPUT].flatMap((tree) =>
    walk(join(tree, "find-reuse")).map((path) => ({
      path: join(tree, "find-reuse", path),
      relative: path,
      source: readFileSync(join(tree, "find-reuse", path), "utf8"),
    })),
  );
  assert.ok(files.length >= 10);
  const OWNER = /meta-o|docs\/business\.md|docs\/acceptance\.md|mo-reuse/iu;
  for (const { path, relative, source } of files) {
    // The embedded eval corpus is this project's own test asset and names the
    // corpus contract it is validated against; it carries no instruction the
    // installed skill reads. Everything the skill actually reads must resolve
    // in any project, so it may not name this one in any case.
    if (relative === "evals/cases.json") {
      assert.equal(source.match(OWNER)?.[0], "meta-o", path);
      assert.match(source, /"contract": "meta-o\.skill-eval-cases\.v2"/u, path);
      continue;
    }
    assert.doesNotMatch(source, OWNER, path);
    // Caller-side semantics may be disclaimed but never instructed: an
    // instruction about the feature lifecycle, a destination document or a
    // commit belongs to the caller, not to a portable report producer.
    for (const sentence of source.split(/(?<=[.!?])\s+/u)) {
      if (!/\b(?:lifecycle|destination|commit\w*)\b/iu.test(sentence)) continue;
      assert.match(sentence, /\b(?:no|not|never)\b/iu, `${path}: ${sentence.trim()}`);
    }
  }
  assert.equal(existsSync(join(SOURCES, "mo-reuse")), false);
  assert.equal(existsSync(join(OUTPUT, "mo-reuse")), false);
});
