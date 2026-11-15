/**
 * Hold that a skill's scripts run from the skill's own directory.
 *
 * A reviewer once ran `node scripts/mo-review-report.mjs` from the candidate
 * checkout, which has no such file, and stopped on `MODULE_NOT_FOUND` until the
 * coordinator pasted an absolute path of its own installation. Every skill that
 * ships `scripts/` therefore says where they live and shows one command that
 * runs from there, with the full path quoted; this test runs that very command
 * from an installation whose path holds a space, out of a directory that has
 * no `scripts/` of its own. §A-DISTRIBUTION-01 makes each skill installable
 * alone, so its own directory is the only place its scripts are.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILT = join(ROOT, "skills");
const PLACEHOLDER = "<this skill's directory>";
const HINT = "This skill ships its own scripts in `scripts/` beside this `SKILL.md`.";
const scratch = [];
after(() => scratch.forEach((path) => rmSync(path, { recursive: true, force: true })));

const withScripts = readdirSync(BUILT).filter((name) => existsSync(join(BUILT, name, "scripts")));

/** The hint paragraph and the one command in the code block right after it. */
function hint(skill) {
  const text = readFileSync(join(BUILT, skill, "SKILL.md"), "utf8");
  const start = text.indexOf(HINT);
  assert.notEqual(start, -1, `${skill} does not say where its scripts live`);
  const block = /```text\n([^\n]+)\n```/u.exec(text.slice(start));
  assert.ok(block, `${skill} shows no command after the hint`);
  return { paragraph: text.slice(start, start + block.index), command: block[1] };
}

test("every skill that ships scripts says they run from its own directory", () => {
  assert.ok(withScripts.length >= 8, "the skills with scripts disappeared");
  for (const skill of withScripts) {
    const { paragraph, command } = hint(skill);
    assert.match(paragraph, /never a path\s+in the project checkout/u, skill);
    // The path is always quoted and names no installation of anybody's.
    assert.match(
      command,
      new RegExp(`^(?:node )?"${PLACEHOLDER}/scripts/[\\w.-]+" --help$`, "u"),
      skill,
    );
    assert.doesNotMatch(`${paragraph}\n${command}`, /(?:^|[\s"'(])(?:\/|~\/)[\w.-]/u, skill);
  }
});

test("the hint's command runs from an installation whose path has a space", () => {
  const base = mkdtempSync(join(tmpdir(), "mo-script-path-"));
  scratch.push(base);
  // A checkout with no scripts of its own, as the reviewer's candidate is.
  const checkout = join(base, "checkout");
  mkdirSync(checkout);
  for (const skill of withScripts) {
    const installed = join(base, "agent skills", skill);
    cpSync(join(BUILT, skill), installed, { recursive: true });
    const command = hint(skill).command.replace(PLACEHOLDER, installed);
    const result = spawnSync("/bin/sh", ["-c", command], { cwd: checkout, encoding: "utf8" });
    assert.equal(result.status, 0, `${skill}: ${command}\n${result.stderr}`);
    assert.notEqual(result.stdout, "", skill);
    assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND|No such file/u, skill);
    assert.deepEqual(readdirSync(checkout), [], `${skill} wrote into the checkout`);
  }
});

test("no shipped command reads a script as a path of the candidate checkout", () => {
  // A bare `node scripts/…` resolves against the working directory, which for
  // a reviewer is the candidate; the brief's own command names the reviewer's
  // installed skill instead of the coordinator's.
  for (const skill of withScripts) {
    for (const file of ["SKILL.md", ...readdirSync(join(BUILT, skill, "references"))]) {
      const path =
        file === "SKILL.md" ? join(BUILT, skill, file) : join(BUILT, skill, "references", file);
      if (!existsSync(path)) continue;
      assert.doesNotMatch(readFileSync(path, "utf8"), /\bnode scripts\//u, `${skill}/${file}`);
    }
  }
  const review = readFileSync(join(BUILT, "mo-review-orca", "SKILL.md"), "utf8");
  assert.equal(
    review.includes(
      `node "<the reviewer's mo-reviewer directory>/scripts/mo-review-report.mjs" template`,
    ),
    true,
  );
});
