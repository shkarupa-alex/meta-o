/**
 * Tests that a real skill manager installs these skills, complete.
 *
 * The build test proves the tree is what a build produces. It cannot prove that
 * apm *finds* that tree: the previous layout passed every build check and still
 * installed skills without their references, because apm resolved the authored
 * directory instead. Only a real install answers that, so this file runs one.
 *
 * It is skipped when `apm` is not on `PATH`, which is honest about what was
 * proven on the machine that ran it — a skipped installation gate is not a
 * passing one.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { walk } from "../tools/build-skills.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "skills");

// `/bin/sh -c` rather than `shell: true` with an argument array, which Node 24
// deprecates (DEP0190) and would print a warning inside the authoritative gate.
const apm = spawnSync("/bin/sh", ["-c", "command -v apm"], { encoding: "utf8" });
const noApm = apm.status !== 0 ? "apm is not installed on this machine" : false;

const temporaries = [];
after(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true });
});

function temporary(prefix) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporaries.push(path);
  return path;
}

function run(command, cwd) {
  const result = spawnSync("/bin/sh", ["-c", command], { encoding: "utf8", cwd });
  assert.equal(result.status, 0, `${command}\n${result.stdout}${result.stderr}`);
  return result;
}

/**
 * A copy of this repository holding only the files a Git clone would carry.
 *
 * apm copies the directory it is given, `node_modules` included, and then warns
 * about hidden characters in dependencies nobody ships. A remote install clones,
 * so the tracked shape is the one under test.
 */
function packageCopy() {
  const target = temporary("mo-install-src-");
  const tracked = run("git ls-files -z", ROOT).stdout.split("\0").filter(Boolean);
  const built = walk(OUTPUT).map((path) => `skills/${path}`);
  const paths = [...new Set([...tracked, ...built])].join("\0");
  const result = spawnSync("/bin/sh", ["-c", `tar --null -T - -cf - | tar -xf - -C "${target}"`], {
    cwd: ROOT,
    input: paths,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  // apm resolves a local path through Git, so the copy has to be a repository.
  run(
    `git init -q . && git add -A && git -c user.email=a@b -c user.name=t commit -qm install`,
    target,
  );
  return target;
}

/** Install into a bare project and return the deployed skill tree. */
function install(source, extra = "") {
  const project = temporary("mo-install-");
  // A bare directory has no harness marker, so the target is named explicitly;
  // in a real project apm detects it from `.claude/`, `CLAUDE.md` and friends.
  const result = run(`apm install "${source}" --target claude ${extra}`, project);
  const skills = join(project, ".claude", "skills");
  return {
    stdout: result.stdout,
    directory: skills,
    files: existsSync(skills) ? walk(skills) : [],
  };
}

test("apm installs all seven skills with every file they reference", { skip: noApm }, () => {
  const installed = install(packageCopy());
  assert.deepEqual(installed.files.sort(), walk(OUTPUT).sort());

  const directories = readdirSync(installed.directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(directories, [
    "mo-e2e",
    "mo-herdr",
    "mo-omnigent",
    "mo-reuse",
    "mo-review",
    "mo-setup",
    "mo-watchdog",
  ]);

  // The methodology arrives as the copy the build made, not as a stub or a link.
  const shipped = readFileSync(
    join(installed.directory, "mo-herdr", "references", "methodology.md"),
  );
  const owner = readFileSync(join(ROOT, "shared", "references", "methodology.md"));
  assert.ok(shipped.equals(owner));

  // The authored tree lives under `src/`; discovering it too would install seven
  // more, incomplete skills — the failure this layout exists to prevent.
  assert.ok(!installed.files.some((path) => path.startsWith("skills/")));
});

test("apm installs one skill on its own, with its references", { skip: noApm }, () => {
  const installed = install(packageCopy(), "--skill mo-review");
  assert.deepEqual(installed.files.sort(), [
    "mo-review/SKILL.md",
    "mo-review/references/purpose-and-architecture.md",
  ]);
});

test("the README's first install block is the one these tests actually run", () => {
  // Deliberately only the *first* block. The README separates "proven here" from
  // "not proven yet"; this test speaks for the first and must not be read as
  // covering the second, which is a remote install nothing here has performed.
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const block = readme.match(/## Install\n[\s\S]*?```bash\n([\s\S]*?)```/);
  assert.ok(block, "README has no install block");
  const commands = block[1].split("\n").filter((line) => line.trim());
  assert.ok(
    commands.every((line) => line.startsWith("apm install /path/to/")),
    "the first install block must hold only the local-path installs this file runs",
  );
  assert.ok(
    commands.some((line) => line.includes("--skill mo-review")),
    "the first install block does not show the single-skill install this file proves",
  );
  // The prose elsewhere explains why `./dist` was abandoned, and must keep
  // saying so; what may not come back is a *command* nobody can run.
  for (const line of readme.match(/```bash\n([\s\S]*?)```/g) ?? []) {
    assert.ok(
      !line.includes("apm install ./dist"),
      "a code block advertises apm install ./dist, which apm refuses: the manifest is one level up",
    );
  }
});
