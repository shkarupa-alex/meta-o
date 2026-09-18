/**
 * Guard the public Orca readiness, event, recovery and ownership contracts.
 *
 * Protects §A-BACKEND-01 and §A-ORCHESTRATION-02.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(join(ROOT, "shared", "references", name), "utf8");

test("readiness separates auth, account freshness and exact live launch", () => {
  const mechanics = read("orca-mechanics.md");
  for (const phrase of [
    "provider-native auth",
    "account list --json",
    "updatedAt",
    "stale_account_cache",
    "launch.requested == launch.effective",
    "real harness process consumed the task",
  ]) {
    assert.match(mechanics, new RegExp(phrase.replaceAll(".", "\\.")));
  }
  assert.match(mechanics, /Never switch model or harness/);
});

test("event states preserve delivery, work and effect uncertainty", () => {
  const contract = read("backend-contract.md");
  for (const state of [
    "sent",
    "delivered",
    "consumed",
    "acknowledged",
    "input_blocked",
    "output_blocked_after_work",
    "unknown_effect",
  ]) {
    assert.match(contract, new RegExp(state));
  }
  assert.match(contract, /receipt is not an effect/i);
  assert.match(contract, /never retried automatically/);
});

test("context and ownership recovery remain bounded", () => {
  const mechanics = read("orca-mechanics.md");
  assert.match(mechanics, /32768-token context/);
  assert.match(mechanics, /cap it at 8000 tokens/);
  assert.match(mechanics, /raw 21k\/41k dump/);
  assert.match(mechanics, /Never close unnamed human tabs/);
  assert.match(mechanics, /bare shell or expired Dispatch cannot\s+settle work/);
});

test("terminal-first is the route, and a composed start needs a sentence that does not exist", () => {
  const mechanics = read("orca-mechanics.md");
  assert.match(mechanics, /Terminal-first is the default route for every agent environment/u);
  // The permission is written as a condition on upstream text, not as a
  // preference. A reader who cannot find that sentence has to stay on the
  // terminal-first route rather than weigh the two.
  assert.match(
    mechanics,
    /`worker-start --help` or the\s+version-matched `orchestration` guide says in so many words/u,
  );
  assert.match(mechanics, /No such sentence is there today/u);
  assert.match(mechanics, /orca terminal create --worktree id:<repo>::<path>/u);
  assert.match(
    mechanics,
    /orca orchestration worker-start --task <id> --worktree id:<repo>::<path> --terminal <handle>/u,
  );
  assert.doesNotMatch(mechanics, /Prefer the composed worker start/u);
});

test("the recovery path forbids the two moves that duplicate an executor", () => {
  const mechanics = read("orca-mechanics.md");
  assert.match(mechanics, /--retry-of <old>/u);
  assert.match(
    mechanics,
    /`unknown_effect`, both a second stop and a\s+replacement Dispatch are forbidden/u,
  );
  assert.match(mechanics, /two executors of one task is worse than none/u);
  // The handle is useless as an owned resource if it is recorded after the
  // wait that can fail.
  assert.match(mechanics, /record the handle in OwnedResourceSet\/1 at once/u);
  assert.match(mechanics, /`--model` and `--effort` are never passed together with `--terminal`/u);
});

test("references are read with --json, and discarding stderr is forbidden", () => {
  const mechanics = read("orca-mechanics.md");
  assert.match(mechanics, /orca skills get orchestration --references --json \| jq -er/u);
  assert.match(
    mechanics,
    /--reference <name> --json \| jq -er '\.markdown \| select\(type=="string" and length>0\)'/u,
  );
  assert.match(mechanics, /`2>\/dev\/null` is forbidden/u);
  assert.match(mechanics, /exits 5/u);
  for (const reference of [
    "coordinator-loop",
    "placement-and-remote",
    "recovery-and-cleanup",
    "worker-contract",
  ]) {
    assert.match(mechanics, new RegExp(`\`${reference}\``, "u"), `${reference} is not required`);
  }
});

test("no shipped recipe ever hides a backend's stderr", () => {
  // A discarded stderr is how a readable failure becomes an empty guide, an
  // empty report or an empty screen. Prose may name the string to forbid it;
  // a fenced block is a recipe somebody copies, so that is where it may not
  // appear. Fences are found by parsing, not by matching backticks.
  const offenders = [];
  const scan = (label, source) => {
    for (const node of fromMarkdown(source).children) {
      if (node.type === "code" && node.value.includes("2>/dev/null")) offenders.push(label);
    }
  };
  for (const name of readdirSync(join(ROOT, "shared", "references"))) {
    scan(`shared/references/${name}`, read(name));
  }
  for (const skill of readdirSync(join(ROOT, "src", "skills"))) {
    const path = join(ROOT, "src", "skills", skill, "SKILL.md");
    scan(`src/skills/${skill}`, readFileSync(path, "utf8"));
  }
  assert.deepEqual(offenders, []);
  // The guard has to be able to see one.
  const planted = [];
  for (const node of fromMarkdown("```text\norca skills get x 2>/dev/null\n```\n").children) {
    if (node.type === "code" && node.value.includes("2>/dev/null")) planted.push("seen");
  }
  assert.deepEqual(planted, ["seen"]);
});
