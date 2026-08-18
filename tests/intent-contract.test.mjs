/**
 * Protect how user intent survives: verbatim with the task, distilled in the framing.
 *
 * The finished feature's own ledger left the repository together with its spec,
 * so these checks bind the rule to the permanent documentation instead of to one
 * historical conversation, which is the only part that outlives an implementation.
 *
 * Protects §A-MEMORY-02.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = ["AGENTS.md", "CLAUDE.md"].map((name) => [
  name,
  readFileSync(join(ROOT, name), "utf8"),
]);

test("both contract copies keep the spec from becoming the only source of intent", () => {
  for (const [name, source] of contracts) {
    assert.match(source, /\*\*The spec is never the only source of user intent\.\*\*/, name);
    assert.match(source, /complete verbatim\s+ledger/, name);
    assert.match(source, /travels with the\s+task\/spec/, name);
    assert.match(source, /summary or a link does not replace that text/, name);
    assert.match(source, /each new intent appends to it/, name);
  }
});

test("both contract copies keep the distilled framing and its ids", () => {
  for (const [name, source] of contracts) {
    assert.match(source, /holds the same intent distilled into stable theses/, name);
    assert.match(source, /\*\*Every stable business thesis carries a unique id\.\*\*/, name);
  }
});

test("both contract copies keep the dictation rule and its verbatim guarantee", () => {
  for (const [name, source] of contracts) {
    assert.match(source, /imperfect dictation/, name);
    assert.match(source, /Preserve confirmed intent\s+verbatim/, name);
    assert.match(source, /do not rewrite the original ledger entry/, name);
  }
});

test("methodology preserves product intent but excludes narrow run-control approvals", () => {
  const methodology = readFileSync(join(ROOT, "shared", "references", "methodology.md"), "utf8");
  assert.match(
    methodology,
    /append it verbatim\s+to the task ledger before implementation continues/,
  );
  assert.match(methodology, /record its settled\s+meaning in the project's business framing/);
  assert.match(methodology, /verbatim ledger is the normative\s+copy while the task lives/);
  assert.match(methodology, /Redact secrets while preserving\s+the sentence's meaning/);
  assert.match(methodology, /one-shot\s+approval.*is\s+run control/is);
  assert.match(methodology, /do not mutate\s+tracked intent ledgers/);
});

test("the business framing says where the verbatim ledger lives and what it keeps", () => {
  const business = readFileSync(join(ROOT, "docs", "business.md"), "utf8");
  assert.match(business, /Дословные пользовательские интенты ведутся/);
  assert.match(business, /вместе с задачей или спекой/);
  assert.match(business, /сохраняется смысл, а не формулировка/);
});

test("the architecture layer owns the split between ledger and framing", () => {
  const decision = readFileSync(
    join(ROOT, "docs", "architecture", "knowledge-identifiers.md"),
    "utf8",
  );
  assert.match(decision, /§A-MEMORY-02 — Дословный ledger живёт с задачей/);
  assert.match(decision, /нормативен для исполнителя и ревьюеров/);
  assert.match(decision, /Если §A-MEMORY-02 отменяется/);
});
