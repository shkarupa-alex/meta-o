/**
 * §M-TEST-INSTALL — Acceptance test for the delivery format.
 *
 * Covers the §20 installer requirements. The claim being checked is narrow and
 * easy to break by accident: the target machine needs Node and nothing else. An
 * installer that quietly depends on `node_modules`, or that copies a `.d.mts`
 * the runtime cannot use, works perfectly on the machine that built it and
 * fails on every other one.
 *
 * Verifies §A-SKILL-TOOLING.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** §M-TEST-INSTALL — Root of the checkout under test. */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** §M-TEST-INSTALL — Every file below a directory, relative to it. */
function walk(directory: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...walk(join(directory, entry.name), relative));
    else found.push(relative);
  }
  return found;
}

test("install.sh delivers a runnable CLI made only of dependency-free .mjs", () => {
  const prefix = mkdtempSync(join(tmpdir(), "meta-o-prefix-"));
  const skills = mkdtempSync(join(tmpdir(), "meta-o-skills-"));

  try {
    // --skip-suite: the delivery format is what is under test here, and the
    // full capability suite really spawns agents in the developer's terminal.
    execFileSync(
      join(ROOT, "install.sh"),
      ["--prefix", prefix, "--skills-dir", skills, "--skip-suite"],
      { cwd: ROOT, encoding: "utf8" },
    );

    const libraries = walk(join(prefix, "lib", "meta-o"));
    assert.ok(libraries.length > 0, "the installer copied nothing");
    assert.deepEqual(
      libraries.filter((file) => !file.endsWith(".mjs")),
      [],
      "only executable modules belong in the install tree",
    );
    assert.ok(libraries.includes("cli/meta-o.mjs"));
    assert.ok(libraries.includes("cli/watchdog-main.mjs"));

    // The delivered tree must not reach outside itself for code.
    for (const file of libraries) {
      const source = readFileSync(join(prefix, "lib", "meta-o", file), "utf8");
      const bareImports = [...source.matchAll(/^\s*(?:import|export)\b[^"']*?\bfrom\s+"([^"]+)"/gm)]
        .map((match) => match[1]!)
        .filter((specifier) => !specifier.startsWith("node:") && !specifier.startsWith("."));
      assert.deepEqual(bareImports, [], `${file} imports a package: ${bareImports.join(", ")}`);
    }

    const cli = join(prefix, "bin", "meta-o");
    assert.ok(statSync(cli).mode & 0o111, "the entry point must be executable");
    const help = execFileSync(cli, ["help"], { encoding: "utf8" });
    assert.match(help, /run route/);
    assert.match(help, /session reconcile/);

    const installedSkills = readdirSync(skills).sort();
    assert.deepEqual(installedSkills, [
      "adjudicate-technical",
      "adopt-project",
      "execute-feature",
      "orchestrate-feature-herdr",
      "research-reuse",
      "review-feature",
      "test-e2e",
    ]);

    assert.ok(
      walk(join(prefix, "share", "meta-o", "templates")).some((file) =>
        file.endsWith("quality/run_qc.py"),
      ),
      "the Python starter profile must ship with the install",
    );
  } finally {
    rmSync(prefix, { recursive: true, force: true });
    rmSync(skills, { recursive: true, force: true });
  }
});

test("the installer touches no project: no hooks, no config, no version pin", () => {
  const prefix = mkdtempSync(join(tmpdir(), "meta-o-prefix-"));
  const skills = mkdtempSync(join(tmpdir(), "meta-o-skills-"));

  const before = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: ROOT,
    encoding: "utf8",
  });

  try {
    // --skip-suite: the delivery format is what is under test here, and the
    // full capability suite really spawns agents in the developer's terminal.
    execFileSync(
      join(ROOT, "install.sh"),
      ["--prefix", prefix, "--skills-dir", skills, "--skip-suite"],
      { cwd: ROOT, encoding: "utf8" },
    );

    const after = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(after, before, "installing changed the repository it was run from");
  } finally {
    rmSync(prefix, { recursive: true, force: true });
    rmSync(skills, { recursive: true, force: true });
  }
});

test("update.sh --skip-suite actually skips the suite", () => {
  // The flag was consumed and never forwarded, and install.sh defaults to
  // running the suite — so a user who typed --skip-suite got the probe run
  // against their real backend, and the update failed on it. A stub `herdr`
  // that fails on contact makes the difference observable without touching a
  // real backend.
  const prefix = mkdtempSync(join(tmpdir(), "meta-o-prefix-"));
  const skills = mkdtempSync(join(tmpdir(), "meta-o-skills-"));
  const stubDir = mkdtempSync(join(tmpdir(), "meta-o-stub-"));
  const log = join(stubDir, "herdr.log");
  writeFileSync(join(stubDir, "herdr"), `#!/bin/sh\necho "$@" >> ${log}\nexit 1\n`, { mode: 0o755 });

  try {
    execFileSync(join(ROOT, "update.sh"), ["--prefix", prefix, "--skills-dir", skills, "--skip-suite"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, PATH: `${stubDir}:${process.env["PATH"] ?? ""}` },
    });
    assert.equal(existsSync(log), false, "the backend was contacted despite --skip-suite");
  } finally {
    rmSync(prefix, { recursive: true, force: true });
    rmSync(skills, { recursive: true, force: true });
    rmSync(stubDir, { recursive: true, force: true });
  }
});
