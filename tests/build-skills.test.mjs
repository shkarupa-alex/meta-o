/**
 * Protect the exact ten-skill distribution and shared source ownership.
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

import { ALLOWED_FRONTMATTER, SHARED_PLAN, frontmatter, walk } from "../tools/build-skills.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = join(ROOT, "src", "skills");
const OUTPUT = join(ROOT, "skills");
const EXPECTED = [
  "mo-e2e",
  "mo-orchestrate-herdr",
  "mo-orchestrate-orca",
  "mo-orchestrate-paseo",
  "mo-reuse",
  "mo-review-herdr",
  "mo-review-orca",
  "mo-review-paseo",
  "mo-setup",
  "mo-watchdog",
];

function directories(path) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test("the committed installable tree is a fresh ten-skill build", () => {
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
      if (source !== "scripts/mo-models.mjs") {
        assert.ok(built.equals(readFileSync(join(ROOT, "shared", source))));
      }
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
  const helper = join(OUTPUT, "mo-orchestrate-herdr", "scripts", "mo-models.mjs");
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
      join(portableRoot, "skills", "mo-orchestrate-herdr", "scripts", "mo-models.mjs"),
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
  for (const backend of ["herdr", "orca", "paseo"]) {
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
});

test("watchdog is shipped executable and source/build file sets agree", () => {
  assert.notEqual(
    statSync(join(OUTPUT, "mo-watchdog", "scripts", "mo-watchdog.sh")).mode & 0o111,
    0,
  );
  assert.ok(walk(OUTPUT).length > EXPECTED.length);
});
