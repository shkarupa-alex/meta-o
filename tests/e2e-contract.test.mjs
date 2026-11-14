/**
 * Bind agent-required verification docs, acceptance mapping and Make entry point.
 *
 * Protects §A-ORCHESTRATION-03: a gate belongs to one SHA and its evidence is
 * either complete or unknown.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

test("watchdog scenarios and per-scenario E2E evidence are explicit", () => {
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
  // §A-ORCHESTRATION-03 replaced the documentation-only carry-forward: evidence
  // stays with its scenario's SHA until the final pair says the change touched it.
  assert.match(e2eProse, /Доказательство принадлежит сценарию, а не финальному SHA/);
  assert.match(e2eProse, /находку `e2e_affected` или `e2e_missing`/);
  assert.match(e2eProse, /полный набор запускают только по просьбе пользователя/);
  assert.doesNotMatch(e2eProse, /Перенос проверки только для документации/);
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
  // A named live scenario outside the B and W ranges is announced by its own
  // id, or no agent reading the entry point would know it exists.
  const live = scenarioCells(e2e, "LIVE-");
  assert.ok(live.length >= 1, "the live proof-order scenario disappeared");
  for (const id of live) assert.match(result.stdout, new RegExp(`\\b${id}\\b`, "u"), id);
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

/**
 * The proof order and the per-scenario E2E exception of §A-ORCHESTRATION-03
 * live in instructions, not in a helper: each actor reads only its own skill
 * and the references bundled with it, so the rule has to stand in every one of
 * those texts, source and generated alike, or one actor keeps the old order.
 */
test("every actor reads the E2E proof order and the per-scenario evidence form", () => {
  const read = (path) => readFileSync(join(ROOT, path), "utf8").replaceAll(/\s+/gu, " ");
  const evidence =
    "E2E-Evidence: <scenario-id> sha=<40-hex> result=<pass|not_applicable> source=<dispatch-id>";
  const coverage = "E2E-Coverage: <scenario-id> acceptance=<row-id>[,<row-id>…]";
  // A project with scenarios whose task touches none of them still owes the
  // brief exactly one E2E form; without this line the only choices were a
  // spent UNKNOWN round or a project-wide `not_applicable` that is false.
  const noTaskScenarios =
    "E2E: not_applicable reason=no_task_scenarios sha=<40-hex> source=<dispatch-id> basis=";
  // A scenario the executor cannot fix used to bounce back to it forever and
  // keep the review from starting; only `fail` and `unknown` hold review now.
  const externalBlock = "is an external block";
  // The block travels in the line itself, so a reviewer can tell it from a
  // caller's error without a note only the orchestrator saw.
  const blockedEvidence =
    "E2E-Evidence: <scenario-id> sha=<40-hex> result=<blocked:external_capability|not_run> source=<dispatch-id> cause=<capability|environment|profile>:<name>";
  const expectations = {
    "shared/references/methodology.md": [
      "The two proof loops run in order and never alternate.",
      evidence,
      coverage,
      "`scope=full` runs only on the user's explicit request.",
      "`E2E: not_evaluated reason=standalone`",
      "a new SHA alone reruns nothing",
      noTaskScenarios,
      "`git merge-base --is-ancestor <sha> <candidate>`",
      "A `fail` or `unknown` never reaches a reviewer",
      externalBlock,
      "An exhausted subscription window or a temporary provider refusal is no external block",
    ],
    "shared/references/review-brief.md": [
      // The brief also carries an external block as a known, unproven scenario.
      evidence,
      blockedEvidence,
      externalBlock,
      "never enters a brief",
      coverage,
      "E2E: not_applicable reason=",
      noTaskScenarios,
      "E2E: not_evaluated reason=standalone",
    ],
    "shared/references/review-protocol.md": [
      "`e2e_affected` names the change",
      "`e2e_missing` names the scenario",
      "With `not_evaluated` this lens is off",
      "Overlapping paths are a hint, not a verdict",
      "A `reason=no_task_scenarios` line is checked like an evidence line",
      "is an external block the caller already reported",
      "such a line without that `cause=` is the same `UNKNOWN`",
    ],
    "src/skills/mo-e2e/SKILL.md": [
      evidence,
      coverage,
      "`scope=task` or `scope=full`",
      noTaskScenarios,
      "The caller starts no review while a `fail` or `unknown` stands.",
      blockedEvidence,
      externalBlock,
      "is the caller's own error, never an external block",
    ],
    "src/skills/mo-orchestrate-orca/SKILL.md": [
      "Run the proof loops in order, never alternating.",
      "a new SHA alone reruns nothing",
      "never write that line yourself for a project that has scenarios",
      "`git merge-base --is-ancestor`",
      externalBlock,
      "never send it back and never rerun it while the block stands",
      "an exhausted subscription window or a temporary provider refusal is a wait, not a block",
    ],
    "src/skills/mo-review-orca/SKILL.md": [
      "write `E2E: not_evaluated reason=standalone`",
      "it is a known, unproven scenario, not a malformed form",
    ],
    "src/skills/mo-reviewer/SKILL.md": ["`E2E: not_evaluated reason=standalone` you raise no"],
  };
  for (const [path, phrases] of Object.entries(expectations)) {
    // A shared reference reaches an actor only as the copy bundled into its
    // skill, so the generated copies are where the rule has to be read.
    const generated = path.startsWith("src/skills/")
      ? [path.replace(/^src\//u, "")]
      : ["mo-orchestrate-orca", "mo-review-orca", "mo-reviewer"]
          .map((skill) => `skills/${skill}/references/${path.split("/").at(-1)}`)
          .filter((copy) => existsSync(join(ROOT, copy)));
    for (const file of [path, ...generated]) {
      const text = read(file);
      for (const phrase of phrases) assert.ok(text.includes(phrase), `${file}: ${phrase}`);
      assert.doesNotMatch(text, /documentation-only (E2E )?carry-forward/u, file);
    }
  }
});
