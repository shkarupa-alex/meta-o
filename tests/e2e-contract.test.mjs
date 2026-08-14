/** Bind agent-required verification docs, acceptance mapping and Make entry point. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const e2e = readFileSync(join(ROOT, "docs", "e2e.md"), "utf8");
const acceptance = readFileSync(join(ROOT, "docs", "acceptance.md"), "utf8");

test("each backend gets the complete B1-B14 acceptance matrix", () => {
  for (let index = 1; index <= 14; index += 1)
    assert.match(e2e, new RegExp(`\\| B${index}\\s+\\|`));
  for (const backend of ["Herdr", "Orca", "Paseo"]) assert.match(e2e, new RegExp(backend));
  for (const harness of ["Codex", "Claude Code", "OpenCode"])
    assert.match(e2e, new RegExp(harness));
  assert.match(e2e, /`BEGIN`, `MIDDLE` and `END` markers/);
  assert.match(
    e2e,
    /Private provider transcripts, hook stores and inferred\s+session databases are forbidden evidence/,
  );
});

test("watchdog and documentation carry-forward scenarios are explicit", () => {
  for (let index = 1; index <= 4; index += 1) assert.match(e2e, new RegExp(`\\| W${index}\\s+\\|`));
  assert.match(e2e, /one nonblocking exact message/);
  assert.match(e2e, /unchanged duplicate prevents delivery/);
  assert.match(e2e, /both final-SHA\s+reviewers explicitly confirm/);
  assert.match(e2e, /skill or agent instructions, acceptance, or this contract/);
});

test("acceptance maps all major requirements to deterministic and live proof", () => {
  for (const phrase of [
    "Exactly ten named skills",
    "Herdr orchestration and review",
    "Orca orchestration and review",
    "Paseo orchestration and review",
    "Codex, Claude Code and OpenCode",
    "complete pair",
    "backlog lenses",
    "Pattern watchdog",
    "semantic Markdown labels",
    "One final SHA",
  ])
    assert.match(acceptance, new RegExp(phrase, "i"));
});

test("make mo-e2e names the current scenarios and cannot be mistaken for pass", () => {
  const result = spawnSync("make", ["mo-e2e"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /AGENT_REQUIRED: not executed/);
  assert.match(result.stdout, /B1-B14/);
  assert.match(result.stdout, /W1-W4/);
  assert.doesNotMatch(result.stdout, /phase-0|Omnigent|H13|OM1/);
});
