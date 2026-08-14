/** Prove that apm discovers the generated ten-skill tree and standalone units. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { walk } from "../tools/build-skills.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "skills");
const apm = spawnSync("/bin/sh", ["-c", "command -v apm"], { encoding: "utf8" });
const skip = apm.status === 0 ? false : "apm is not installed";
const temporary = [];
after(() => temporary.forEach((path) => rmSync(path, { recursive: true, force: true })));

function temp(prefix) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(path);
  return path;
}

function run(command, cwd) {
  const result = spawnSync("/bin/sh", ["-c", command], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${command}\n${result.stdout}${result.stderr}`);
  return result;
}

function packageCopy() {
  const target = temp("mo-install-source-");
  const tracked = run("git ls-files -z", ROOT).stdout.split("\0").filter(Boolean);
  const paths = [...new Set([...tracked, ...walk(OUTPUT).map((path) => `skills/${path}`)])].join(
    "\0",
  );
  const result = spawnSync("/bin/sh", ["-c", `tar --null -T - -cf - | tar -xf - -C "${target}"`], {
    cwd: ROOT,
    input: paths,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  run(
    "git init -q . && git add -A && git -c user.email=a@b -c user.name=t commit -qm install",
    target,
  );
  return target;
}

function install(skill) {
  const project = temp("mo-install-target-");
  const extra = skill ? ` --skill ${skill}` : "";
  run(`apm install "${packageCopy()}" --target claude${extra}`, project);
  return join(project, ".claude", "skills");
}

test("apm installs exactly the complete generated tree", { skip }, () => {
  const installed = install();
  assert.equal(existsSync(installed), true);
  assert.deepEqual(walk(installed).sort(), walk(OUTPUT).sort());
});

test("every skill is individually installable with its complete owned files", { skip }, () => {
  for (const skill of [
    "mo-orchestrate-herdr",
    "mo-orchestrate-orca",
    "mo-orchestrate-paseo",
    "mo-review-herdr",
    "mo-review-orca",
    "mo-review-paseo",
    "mo-setup",
    "mo-e2e",
    "mo-reuse",
    "mo-watchdog",
  ]) {
    const installed = install(skill);
    assert.deepEqual(
      walk(installed).sort(),
      walk(join(OUTPUT, skill))
        .map((path) => `${skill}/${path}`)
        .sort(),
    );
  }
});

test("README distinguishes proven local and unproven remote installation", () => {
  const readme = run("sed -n '1,90p' README.md", ROOT).stdout;
  assert.match(readme, /apm install \/path\/to\/meta-o/);
  assert.match(readme, /--skill mo-review-orca/);
  assert.match(readme, /Remote installation remains\s+unproven/);
});
