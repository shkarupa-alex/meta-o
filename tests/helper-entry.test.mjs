/**
 * Hold that a shipped helper runs as a program however its path is spelled.
 *
 * A helper that answers by exit status must never exit 0 in silence: through a
 * symlinked install or a directory with a space in its name, a textual
 * entry-point check skipped `main` and the caller read success. The deep-pair
 * gate and the hot-slot rule (§A-SESSION-01), the report validator
 * (§A-REVIEW-04), the screen classifier (§A-DELIVERY-01) and the closure check
 * (§A-BACKLOG-01) all answer that way.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = [];
after(() => scratch.forEach((path) => rmSync(path, { recursive: true, force: true })));

// One invocation per helper whose answer is known and not silent.
const CASES = [
  ["mo-review-orca", "mo-review-resource.mjs", ["deep", "--phase", "remediation"]],
  ["mo-review-orca", "mo-review-report.mjs", []],
  ["mo-review-orca", "mo-harness-screen.mjs", ["--no-such-flag"]],
  ["mo-setup", "mo-backlog.mjs", []],
];

function run(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("a helper reached through a symlink in a spaced directory answers as when run directly", () => {
  const base = mkdtempSync(join(tmpdir(), "mo-entry-"));
  scratch.push(base);
  const spaced = join(base, "sp ace");
  mkdirSync(spaced);
  for (const [skill, name, args] of CASES) {
    const real = join(ROOT, "skills", skill, "scripts", name);
    const link = join(spaced, name);
    symlinkSync(real, link);
    // Outside Git, so the closure check answers its typed failure, not a project's state.
    const direct = run(real, args, base);
    assert.notEqual(`${direct.stdout}${direct.stderr}`, "", `${name} is silent when run directly`);
    assert.deepEqual(run(link, args, base), direct, name);
  }
});
