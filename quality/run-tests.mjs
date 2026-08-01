#!/usr/bin/env node
/**
 * §M-QC-TESTS — Run the whole suite as one gate.
 *
 * Implements §A-EXECUTABLE-ACCEPTANCE. A wrapper rather than a bare
 * `node --test` in the manifest, because the glob has to be expanded by this
 * process: the manifest is executed without a shell on purpose, so a gate
 * cannot chain, redirect or swallow a failure.
 */

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  encoding: "utf8",
}).trim();

const tests = readdirSync(join(ROOT, "tests"))
  .filter((name) => name.endsWith(".test.mts"))
  .sort()
  .map((name) => join("tests", name));

if (tests.length === 0) {
  process.stderr.write("no test files were found; an empty suite is never a pass\n");
  process.exitCode = 1;
} else {
  try {
    execFileSync("node", ["--test", ...tests], { cwd: ROOT, stdio: "inherit" });
  } catch {
    process.exitCode = 1;
  }
}
