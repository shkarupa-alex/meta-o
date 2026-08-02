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

/** §M-QC-TESTS — Repository root, resolved from this script rather than the caller. */
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

// The Python starter profile's own fixtures are scenario E2E-QC-TEMPLATES-01,
// and nothing ran them: this file enumerated `tests/*.test.mts` only, so a
// scenario the registry declares — and the E2E gate therefore counts as
// selectable — had no way to execute. A shipped template whose acceptance
// fixtures never run is a template nobody is checking.
/** §M-QC-TESTS — The Python starter profile's fixtures, scenario E2E-QC-TEMPLATES-01. */
const PYTHON_FIXTURES = join("templates", "python", "tests", "test_quality_gates.py");
try {
  execFileSync("python3", [PYTHON_FIXTURES], { cwd: ROOT, stdio: "inherit" });
} catch (error) {
  const missing = /** @type {{ code?: string }} */ (error).code === "ENOENT";
  process.stderr.write(
    missing
      ? `python3 is not on PATH, so ${PYTHON_FIXTURES} could not run; a skipped scenario is not a pass\n`
      : `${PYTHON_FIXTURES} failed\n`,
  );
  process.exitCode = 1;
}
