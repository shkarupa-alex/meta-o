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

test("Orca gets the complete B1-B42 acceptance matrix", () => {
  for (let index = 1; index <= 42; index += 1)
    assert.match(e2e, new RegExp(`\\| B${index}\\s+\\|`));
  assert.match(e2eProse, /Выполните эту матрицу для Orca/);
  for (const harness of ["Codex", "Claude Code", "OpenCode"])
    assert.match(e2eProse, new RegExp(harness));
  assert.match(e2eProse, /маркерами `BEGIN`, `MIDDLE` и `END`/);
  assert.match(e2eProse, /обычный вопрос и вопрос интерфейса среды агента/);
  assert.match(e2eProse, /Оба публичных ожидающих состояния и оба точных пути ответа/);
  assert.match(
    e2eProse,
    /Закрытые расшифровки поставщика, хранилища hooks и выведенные из наблюдений базы сессий запрещены как доказательства/,
  );
});

test("watchdog and documentation carry-forward scenarios are explicit", () => {
  for (let index = 1; index <= 4; index += 1) assert.match(e2e, new RegExp(`\\| W${index}\\s+\\|`));
  assert.match(e2eProse, /одно неблокирующее точное сообщение/);
  assert.match(e2eProse, /неизменившийся дубликат блокирует доставку/);
  assert.match(e2eProse, /оба ревьюера финального SHA явно подтвердили/);
  assert.match(e2eProse, /скил, инструкции агента, критерии приёмки или этот контракт/);
});

test("acceptance maps all major requirements to deterministic and live proof", () => {
  for (const phrase of [
    "точный именованный набор скилов",
    "Оркестрация и ревью через Orca",
    "Codex, Claude Code и OpenCode",
    "полной парой",
    "`Deferral lens`",
    "Наблюдатель по шаблонам состояния",
    "смысловые подписи Markdown",
    "Один финальный SHA",
  ])
    assert.match(acceptance, new RegExp(phrase, "i"));
});

test("make mo-e2e names the current scenarios and cannot be mistaken for pass", () => {
  const result = spawnSync("make", ["mo-e2e"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /AGENT_REQUIRED: not executed/);
  assert.match(result.stdout, /B1-B42/);
  assert.match(result.stdout, /W1-W4/);
  assert.doesNotMatch(result.stdout, /phase-0|Omnigent|H13|OM1/);
});
