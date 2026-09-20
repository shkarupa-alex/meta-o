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

import MarkdownIt from "markdown-it";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const e2e = readFileSync(join(ROOT, "docs", "e2e.md"), "utf8");
const e2eProse = e2e.replaceAll(/\s+/gu, " ");
const acceptance = readFileSync(join(ROOT, "docs", "acceptance.md"), "utf8");

/**
 * The first-column scenario cells a document claims for one prefix.
 *
 * The range was a literal in three places for a whole feature, so ten new
 * scenarios were announced to no agent and pinned by no check. The cells are
 * returned verbatim and in document order, and a cell is collected on the
 * weakest possible evidence that it means to be one: the prefix and a digit
 * after nothing but markup. A cell that merely looks wrong must reach the
 * judgement below, because a filter here would hide exactly the rows a printed
 * range cannot name — an id in backticks or emphasis is such a row.
 */
function scenarioCells(document, prefix) {
  const cells = [];
  let firstCell = false;
  for (const token of new MarkdownIt().parse(document, {})) {
    if (token.type === "tr_open") firstCell = true;
    else if (token.type === "inline" && firstCell) {
      firstCell = false;
      const cell = token.content.trim();
      if (new RegExp(`^[^\\p{L}\\p{N}]*${prefix}\\d`, "u").test(cell)) cells.push(cell);
    }
  }
  return cells;
}

/**
 * The scenario numbers `B1-B<n>` is allowed to stand for.
 *
 * A suffixed id such as `B53a` and a number written twice both read as a row
 * the announcement covers, and both are invisible to a check that keeps only
 * well-formed ids in a set. They are refused here instead, because the point
 * of the range is that every documented row is inside it.
 */
function scenarioNumbers(document, prefix) {
  const cells = scenarioCells(document, prefix);
  for (const cell of cells)
    assert.match(
      cell,
      new RegExp(`^${prefix}\\d+$`, "u"),
      `${cell} is not a canonical scenario id`,
    );
  assert.equal(new Set(cells).size, cells.length, `a ${prefix} scenario id is written twice`);
  return cells.map((cell) => Number(cell.slice(prefix.length))).sort((left, right) => left - right);
}

test("Orca gets the complete acceptance matrix the document defines", () => {
  const scenarios = scenarioNumbers(e2e, "B");
  assert.ok(scenarios.length >= 42, "the backend matrix shrank");
  // Contiguity is what lets a printed range stand for the set: a gap or a
  // suffixed id would make `B1-B<n>` a claim the document does not support.
  assert.deepEqual(
    scenarios,
    scenarios.map((_, step) => step + 1),
    "scenario ids are not contiguous from 1",
  );
  for (const index of scenarios) assert.match(e2e, new RegExp(`\\| B${index}\\s+\\|`));
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
  const watchdog = scenarioNumbers(e2e, "W");
  assert.deepEqual(
    watchdog,
    watchdog.map((_, step) => step + 1),
    "watchdog ids are not contiguous from 1",
  );
  assert.ok(watchdog.length >= 4, "the watchdog matrix shrank");
  for (const index of watchdog) assert.match(e2e, new RegExp(`\\| W${index}\\s+\\|`));
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
  // The announcement is checked against the document, not against a literal:
  // this is the exact pair that drifted apart while both sides stayed green.
  assert.match(result.stdout, new RegExp(`B1-B${scenarioNumbers(e2e, "B").at(-1)}\\b`, "u"));
  assert.match(result.stdout, new RegExp(`W1-W${scenarioNumbers(e2e, "W").at(-1)}\\b`, "u"));
  assert.doesNotMatch(result.stdout, /phase-0|Omnigent|H13|OM1/);
});

test("a scenario row the announced range cannot name is refused", () => {
  const rows = (ids) =>
    ["| Id | Что |", "| -- | --- |", ...ids.map((id) => `| ${id} | что-то |`)].join("\n");
  const canonical = Array.from({ length: 52 }, (_, step) => `B${step + 1}`);
  assert.deepEqual(
    scenarioNumbers(rows(canonical), "B"),
    canonical.map((_, step) => step + 1),
  );
  // Both rows below are documented scenarios that `B1-B52` does not cover, and
  // both used to disappear silently: the first fails the shape, the second
  // collapses into the number it repeats.
  assert.throws(() => scenarioNumbers(rows([...canonical, "B53a"]), "B"), /canonical scenario id/u);
  assert.throws(() => scenarioNumbers(rows([...canonical, "B52"]), "B"), /written twice/u);
  // A formatted id is the same drift wearing markup: the document defines the
  // row, the announcement cannot name it, and the cell never reaches the shape
  // assertion unless it is collected first.
  for (const written of ["`B53`", "**B53**", "_B53_", "[B53](#b53)"])
    assert.throws(
      () => scenarioNumbers(rows([...canonical, written]), "B"),
      /canonical scenario id/u,
      `${written} left the reader unjudged`,
    );
  // The widening stops at markup: an ordinary sentence that happens to mention
  // a scenario is not a scenario row.
  assert.deepEqual(
    scenarioNumbers(rows([...canonical, "Повторить B7 после правки"]), "B"),
    canonical.map((_, step) => step + 1),
  );
});
