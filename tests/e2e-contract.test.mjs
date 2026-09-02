/**
 * Bind agent-required verification docs, acceptance mapping and Make entry point.
 *
 * Protects §A-ORCHESTRATION-03: a gate belongs to one SHA and its evidence is
 * either complete or unknown.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const e2e = readFileSync(join(ROOT, "docs", "e2e.md"), "utf8");
const e2eProse = e2e.replaceAll(/\s+/gu, " ");
const acceptance = readFileSync(join(ROOT, "docs", "acceptance.md"), "utf8");

test("Orca gets the complete B1-B22 acceptance matrix", () => {
  for (let index = 1; index <= 22; index += 1)
    assert.match(e2e, new RegExp(`\\| B${index}\\s+\\|`));
  assert.match(e2eProse, /Выполните эту матрицу для Orca/);
  for (const harness of ["Codex", "Claude Code", "OpenCode"])
    assert.match(e2eProse, new RegExp(harness));
  assert.match(e2eProse, /markers `BEGIN`, `MIDDLE` и `END`/);
  assert.match(e2eProse, /обычный и harness-UI вопрос/);
  assert.match(e2eProse, /Оба public pending states\/requests и оба точных reply paths/);
  assert.match(
    e2eProse,
    /Private provider transcripts, hook stores и inferred session databases запрещены как evidence/,
  );
});

test("watchdog and documentation carry-forward scenarios are explicit", () => {
  for (let index = 1; index <= 4; index += 1) assert.match(e2e, new RegExp(`\\| W${index}\\s+\\|`));
  assert.match(e2eProse, /одно nonblocking exact message/);
  assert.match(e2eProse, /неизменившийся duplicate блокирует delivery/);
  assert.match(e2eProse, /оба reviewer финального SHA явно подтвердили/);
  assert.match(e2eProse, /skill или agent instructions, acceptance или этот контракт/);
});

test("acceptance maps all major requirements to deterministic and live proof", () => {
  for (const phrase of [
    "точный именованный набор скилов",
    "Orchestration и review через Orca",
    "Codex, Claude Code и OpenCode",
    "полной парой",
    "backlog",
    "Pattern watchdog",
    "semantic Markdown labels",
    "Один финальный SHA",
  ])
    assert.match(acceptance, new RegExp(phrase, "i"));
});

test("make mo-e2e names the current scenarios and cannot be mistaken for pass", () => {
  const result = spawnSync("make", ["mo-e2e"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /AGENT_REQUIRED: not executed/);
  assert.match(result.stdout, /B1-B22/);
  assert.match(result.stdout, /W1-W4/);
  assert.doesNotMatch(result.stdout, /phase-0|Omnigent|H13|OM1/);
});
