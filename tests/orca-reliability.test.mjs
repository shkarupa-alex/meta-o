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
  assert.match(mechanics, /Never close\s+unnamed human tabs/);
  assert.match(mechanics, /bare shell or expired Dispatch cannot\s+settle work/);
  // Naming the degraded outcomes apart is not enough: each needs the recovery
  // that keeps its task and owner, or a reader invents a new task for it.
  assert.match(
    mechanics.replace(/\s+/gu, " "),
    /different outcomes\. Each is recovered on the same task and in the same ownership: .* Never a new task, another model or a second owner\./u,
  );
});

test("worker-start --agent is the route, and terminal-first only where it cannot pass the model", () => {
  const mechanics = read("orca-mechanics.md");
  // Before 1.4.217 Orca never saw a Codex fullscreen composer as ready and
  // could report a closed terminal that kept running, and before 1.4.219 it
  // trusted a guessed repository root instead of the Codex worktree, so the
  // route, the release rule and the trust fallback all depend on that floor.
  assert.match(mechanics, /Orca 1\.4\.219 is the oldest supported version/u);
  assert.match(
    mechanics,
    /`worker-start --agent` is the route for every agent environment whose model and\s+effort it passes/u,
  );
  assert.match(mechanics, /--agent <claude\|codex> --model <id> --effort <e>/u);
  assert.match(
    mechanics,
    /`launch\.requested == launch\.effective`\s+for agent, model and effort/u,
  );
  assert.match(mechanics, /orca terminal create --worktree id:<repo>::<path>/u);
  assert.match(
    mechanics,
    /orca orchestration worker-start --task <id> --worktree id:<repo>::<path> --terminal <handle>/u,
  );
  assert.doesNotMatch(mechanics, /No such sentence is there today/u);
  assert.doesNotMatch(mechanics, /fallback binding for no_owned_resource/u);
});

test("every text that states the supported Orca floor states the same one", () => {
  // A reader takes the floor from whichever text it reads first; two floors
  // let one reader accept a release whose trust or release defect another
  // reader's rules assume is gone.
  const floors = [
    [read("orca-mechanics.md"), /`orca --version` is (\d+\.\d+\.\d+) or later/u],
    [read("orca-mechanics.md"), /Orca (\d+\.\d+\.\d+) is the oldest supported version/u],
    [
      readFileSync(join(ROOT, "src", "skills", "mo-review-orca", "SKILL.md"), "utf8"),
      /reviewer on Orca (\d+\.\d+\.\d+) or later/u,
    ],
    [
      readFileSync(join(ROOT, "docs", "backend-capabilities.md"), "utf8"),
      /Orca (\d+\.\d+\.\d+) — самая старая поддерживаемая версия/u,
    ],
  ].map(([text, pattern]) => pattern.exec(text.replace(/\s+/gu, " "))?.[1]);
  assert.deepEqual(floors, Array(4).fill("1.4.219"));
});

test("Orca's own folder pre-trust is the normal start and the trust procedure its fallback", () => {
  const mechanics = read("orca-mechanics.md").replace(/\s+/gu, " ");
  assert.match(
    mechanics,
    /"Trust the folder when Orca starts an agent" \(Settings → Agents, on by default\)/u,
  );
  assert.match(mechanics, /That write is the owner's setting acting, not a Meta-O answer/u);
  assert.match(mechanics, /applies when the owner has turned that setting off/u);
  const review = readFileSync(
    join(ROOT, "src", "skills", "mo-review-orca", "SKILL.md"),
    "utf8",
  ).replace(/\s+/gu, " ");
  assert.match(
    review,
    /With that setting turned off by the owner, a Codex start that fails with `agent-trust-workspace`/u,
  );
});

test("the papercut audit lists no release fallback that Orca 1.4.217 made obsolete", () => {
  const papercut = readFileSync(join(ROOT, "docs", "papercut.md"), "utf8");
  const nodes = fromMarkdown(papercut).children;
  const heading = nodes.findIndex(
    (node) =>
      node.type === "heading" &&
      node.children.map((child) => child.value ?? "").join("") ===
        "Аудит Issues для обходных решений жизненного цикла",
  );
  assert.ok(heading >= 0, "audit section missing");
  const next = nodes.findIndex((node, index) => index > heading && node.type === "heading");
  const section = nodes.slice(heading + 1, next === -1 ? undefined : next);
  const audit = papercut.slice(
    section[0].position.start.offset,
    section.at(-1).position.end.offset,
  );
  assert.doesNotMatch(audit, /резервного терминала|no_owned_resource/u);
});

test("the recovery path forbids the two moves that duplicate an executor", () => {
  const mechanics = read("orca-mechanics.md");
  assert.match(mechanics, /--retry-of <old>/u);
  assert.match(
    mechanics,
    /`unknown_effect`, both a\s+second stop and a\s+replacement Dispatch are forbidden/u,
  );
  assert.match(mechanics, /two executors of one\s+task is worse than\s+none/u);
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
