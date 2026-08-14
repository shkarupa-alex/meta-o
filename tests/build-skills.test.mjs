/** Protect the exact ten-skill distribution and shared source ownership. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

test("watchdog is shipped executable and source/build file sets agree", () => {
  assert.notEqual(
    statSync(join(OUTPUT, "mo-watchdog", "scripts", "mo-watchdog.sh")).mode & 0o111,
    0,
  );
  assert.ok(walk(OUTPUT).length > EXPECTED.length);
});
