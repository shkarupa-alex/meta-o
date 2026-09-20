/**
 * Hold the warm-session rule and the role of the session that orchestrates.
 *
 * Protects §A-SESSION-01 and §A-MODELS-01.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flat = (text) => text.replace(/\s+/gu, " ");
const reference = (name) => flat(readFileSync(join(ROOT, "shared", "references", name), "utf8"));
const skill = () =>
  flat(readFileSync(join(ROOT, "src", "skills", "mo-orchestrate-orca", "SKILL.md"), "utf8"));

/** Every minute count a document states, in the order it states them. */
const minutes = (text) => [...text.matchAll(/(\d+) minutes/gu)].map(([, value]) => value);

test("one cache lifetime and one idle threshold serve both vendors", () => {
  for (const source of [reference("orca-mechanics.md"), reference("methodology.md")]) {
    // Two numbers, not four: a per-vendor pair would make the coordinator
    // remember which provider stands behind each terminal, and it does not.
    assert.deepEqual(minutes(source), ["60", "50"]);
    assert.match(source, /60 minutes for both vendors/u);
    assert.match(source, /working idle threshold is 50 minutes/u);
  }
});

test("idle is a public observation about a terminal proven to be waiting", () => {
  const mechanics = reference("orca-mechanics.md");
  assert.match(mechanics, /`lastOutputAt`, epoch milliseconds/u);
  assert.match(mechanics, /Idle is `now - lastOutputAt`/u);
  assert.match(mechanics, /only for a terminal publicly proven to be at `agent_prompt`/u);
  // The spinner keeps the field moving, so it is not a turn boundary.
  assert.match(mechanics, /spinner updates the field/u);
  assert.match(
    mechanics,
    /Where the installed version returns no such field, behave exactly as before/u,
  );
});

test("the installed backend really carries the liveness field", () => {
  const fixture = JSON.parse(
    readFileSync(
      join(ROOT, "tests", "fixtures", "recorded-surfaces", "orca-liveness.fixture"),
      "utf8",
    ),
  );
  assert.equal(fixture.contract, "recorded-cli-help.v2");
  const [observation] = fixture.observations;
  assert.match(observation.command, /^orca terminal list --json \|/u);
  const evidence = JSON.parse(observation.output);
  assert.ok(evidence.fields.includes("lastOutputAt"), "the recorded record has no lastOutputAt");
  assert.equal(evidence.lastOutputAt_type, "number");
  assert.equal(evidence.lastOutputAt_digits, 13, "not epoch milliseconds");
  // A recording that leaks a title, a path or a preview is a different kind of
  // evidence than the one this fixture is allowed to be.
  for (const leaked of ["title", "worktreePath", "preview"]) {
    assert.ok(
      !new RegExp(`"${leaked}"\\s*:\\s*"`, "u").test(observation.output),
      `${leaked} leaked into the recording`,
    );
  }
});

test("the orchestrating session needs no role entry to start", () => {
  const source = skill();
  assert.match(source, /session the user asked to orchestrate is the orchestrator/u);
  assert.match(source, /unset `orchestrator` role does not block the start/u);
  assert.match(source, /not a reason to ask which model this session should use/u);
  assert.match(source, /`--force` and another model generation stay forbidden/u);
  assert.match(reference("methodology.md"), /An unset `orchestrator` role blocks nothing/u);
});
