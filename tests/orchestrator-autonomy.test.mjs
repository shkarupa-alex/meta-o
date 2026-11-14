/**
 * Pin the orchestrator's launch, recovery and observation rules where agents read them.
 *
 * Launching a role, deciding a restart and reconciling a quiet wait are agent
 * judgment, not a script: §A-ORCHESTRATION-01 forbids a process engine. The
 * deterministic proof is therefore the text of the decisions, of the Orca
 * mechanics and of the built skills, and the behaviour is proven by eval cases
 * under §A-EVAL-01.
 *
 * Protects §A-MODELS-01, §A-DELIVERY-01 and §A-WAIT-01.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");

/** Prose wraps anywhere, so rules are matched with whitespace collapsed. */
function flat(path) {
  return readFileSync(join(ROOT, path), "utf8").replace(/\s+/gu, " ");
}

const MECHANICS = [
  "shared/references/orca-mechanics.md",
  "skills/mo-orchestrate-orca/references/orca-mechanics.md",
  "skills/mo-review-orca/references/orca-mechanics.md",
];
const LAUNCHERS = [
  ...MECHANICS,
  "shared/references/methodology.md",
  "skills/mo-orchestrate-orca/SKILL.md",
  "skills/mo-review-orca/SKILL.md",
];

test("worker-start is assembled from launch.<role>, never from a route/model/effort literal", () => {
  for (const path of LAUNCHERS) {
    const text = flat(path);
    assert.match(text, /launch\.<role>/u, path);
    // #65: the whole selection passed to --model launched nothing on either provider.
    for (const [, value] of text.matchAll(/--model (\S+)/gu)) {
      assert.doesNotMatch(value, /route|selection|<id>/u, `${path}: --model ${value}`);
      assert.doesNotMatch(value, /^'?[a-z]+\/[^/\s]+\/[a-z]+'?$/u, `${path}: --model ${value}`);
    }
  }
  for (const path of MECHANICS) {
    const text = flat(path);
    assert.match(text, /--agent <launch\.<role>\.agent> --model <launch\.<role>\.model>/u, path);
    assert.match(text, /`--agent claude --model 'opus\[1m\]' --effort high`/u, path);
  }
});

test("equal requested and effective identity is not a launch, and a refusal asks one question", () => {
  for (const path of [...MECHANICS, "shared/references/methodology.md"]) {
    const text = flat(path);
    assert.match(text, /first turn/u, path);
    assert.match(text, /--catalog --route/u, path);
    assert.match(text, /recommended replacement/u, path);
    assert.match(text, /incomplete catalog does not prove the model absent/u, path);
  }
  for (const path of ["skills/mo-orchestrate-orca/SKILL.md", "skills/mo-review-orca/SKILL.md"]) {
    const text = flat(path);
    assert.match(text, /first turn/u, path);
    assert.match(text, /scripts\/mo-models\.mjs --catalog --route <agent>/u, path);
    assert.match(text, /never by a silent substitute|never substitute silently/u, path);
  }
});

/** Each needle must appear, and in this order, so a reordered ladder fails. */
function assertInOrder(text, needles, label) {
  let from = 0;
  for (const needle of needles) {
    const at = text.indexOf(needle, from);
    assert.notEqual(at, -1, `${label}: "${needle}" missing or out of order`);
    from = at + needle.length;
  }
}

test("the recovery ladder runs one way, ends at unknown_effect and restarts only on a new basis", () => {
  // #47: the eval oracle demanded a bounded ladder that no decision defined.
  const decision = flat("docs/architecture/trust-safe-delivery.md");
  assertInOrder(
    decision,
    ["`worker-stop`", "доказанная остановка", "`worker-start --retry-of`", "`unknown_effect`"],
    "§A-DELIVERY-01",
  );
  assert.match(decision, /Числовых лимитов у лестницы нет/u);
  assert.match(decision, /только при новом основании ожидать другой результат/u);
  assert.match(decision, /исчерпанная квота — следующего окна/u);
  for (const path of [...MECHANICS, "skills/mo-orchestrate-orca/SKILL.md"]) {
    const text = flat(path);
    assertInOrder(
      text,
      ["`worker-stop`", "a proven stop", "`worker-start --retry-of`", "`unknown_effect`"],
      path,
    );
    assert.match(text, /new basis to expect a different result/u, path);
    assert.match(text, /exhausted quota until its next window/u, path);
  }
});

test("a quiet wait is reconciled with public Orca before anyone hears an actor still works", () => {
  // #54: a quiet timeout, then a completed Dispatch the coordinator only saw
  // when the user asked; the ack of a handoff arrives as a status message.
  const decision = flat("docs/architecture/blocking-wait-cadence.md");
  assert.match(decision, /`status`, пока в запуске есть отправленная/u);
  assert.match(decision, /Постоянный `status` в наборе отклонён/u);
  assertInOrder(
    decision,
    ["непрочитанный пакет", "публичное состояние", "дочерней команде", "`unknown/unverifiable`"],
    "§A-WAIT-01",
  );
  assert.match(decision, /`stale_status` живости завершения не отменяют/u);
  assert.match(decision, /Ожидание перевооружается только после этой сверки/u);
  for (const path of MECHANICS) {
    const text = flat(path);
    assert.match(text, /`status` joins it only while/u, path);
    assertInOrder(
      text,
      [
        "orca orchestration check --run <id> --json",
        "`worker-show` for every active Dispatch",
        "An agent's turn is not its child process",
        "`unknown/unverifiable`",
      ],
      path,
    );
    assert.match(text, /does not cancel the completion/u, path);
    assert.match(text, /`--source auto` is not used/u, path);
    assert.match(text, /Re-arm the wait only after this reconciliation/u, path);
  }
  for (const path of ["skills/mo-orchestrate-orca/SKILL.md", "skills/mo-review-orca/SKILL.md"]) {
    const text = flat(path);
    assert.match(text, /plus `status` only while/u, path);
    assert.match(text, /checkpoint of \[Orca native mechanics\]/u, path);
  }
});
