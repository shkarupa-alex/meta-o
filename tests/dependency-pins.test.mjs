/**
 * Hold the two dependency manifests to one answer about every bundle input.
 *
 * Protects §A-DISTRIBUTION-03.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { BUNDLES } from "../tools/build-skills.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));

/**
 * The two files state the same contract, so a difference is always a defect.
 *
 * `npm install` rewrites the lock to match the manifest, which means any
 * difference here is a dirty worktree waiting for whoever follows the README.
 */
function specMismatches(packageJson, packageLock) {
  const declared = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const root = packageLock.packages[""];
  const locked = { ...root.dependencies, ...root.devDependencies };
  return Object.entries(declared)
    .filter(([name, spec]) => locked[name] !== spec)
    .map(([name, spec]) => `${name}: package.json ${spec}, package-lock.json ${locked[name]}`);
}

test("both manifests state the same specifier for every dependency", () => {
  // The candidate must survive the install step README.md documents: a
  // difference here means `npm install` dirties a tree that was clean.
  assert.deepEqual(specMismatches(manifest, lock), []);
});

test("a floating specifier on a bundled root is caught here, not at the next byte comparison", () => {
  // Without this case the check above only records today's state; the point of
  // the exact pins is that a caret on a bundle input can never come back.
  const bundled = [...new Set(Object.values(BUNDLES).flatMap((closure) => closure.roots))];
  const scoped = bundled.find(
    (root) => root in { ...manifest.dependencies, ...manifest.devDependencies },
  );
  assert.ok(scoped, "no bundle root is a direct dependency");
  const drifted = structuredClone(lock);
  const block = drifted.packages[""].devDependencies?.[scoped] ? "devDependencies" : "dependencies";
  drifted.packages[""][block][scoped] = `^${drifted.packages[""][block][scoped]}`;
  assert.deepEqual(specMismatches(manifest, drifted), [
    `${scoped}: package.json ${manifest.dependencies?.[scoped] ?? manifest.devDependencies[scoped]}, package-lock.json ^${manifest.dependencies?.[scoped] ?? manifest.devDependencies[scoped]}`,
  ]);
});

test("every bundled root resolves to one concrete locked version", () => {
  // The closure is only reproducible if each root it names has a version the
  // lock pins; a root reachable only through a range is reproducible by luck.
  for (const [destination, closure] of Object.entries(BUNDLES)) {
    for (const root of closure.roots) {
      const entry = lock.packages[`node_modules/${root}`];
      assert.ok(entry, `${destination} names ${root}, which the lock does not resolve`);
      assert.match(entry.version, /^\d+\.\d+\.\d+/u, `${root} has no concrete version`);
    }
  }
});
