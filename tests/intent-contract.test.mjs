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
const prose = (source) => source.replace(/\s+/gu, " ");
const contracts = ["AGENTS.md", "CLAUDE.md"].map((name) => [
  name,
  prose(readFileSync(join(ROOT, name), "utf8")),
]);

test("both contract copies keep the dictation rule and its verbatim guarantee", () => {
  for (const [name, source] of contracts) {
    assert.match(source, /неточной диктовки/, name);
    assert.match(source, /Сохраняйте подтверждённое намерение дословно/, name);
    assert.match(source, /не\s+переписывайте исходную запись журнала/, name);
  }
});

test("methodology preserves product intent but excludes narrow run-control approvals", () => {
  const methodology = prose(
    readFileSync(join(ROOT, "shared", "references", "methodology.md"), "utf8"),
  );
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

test("ledger redaction names every kind it handles and the false positive it must not", () => {
  const methodology = prose(
    readFileSync(join(ROOT, "shared", "references", "methodology.md"), "utf8"),
  );
  // Spec 2 moved this duty from the retired reuse skill to lifecycle
  // materialization, and it is only a duty if each named kind is covered.
  for (const kind of [
    /\btoken\b/,
    /\bpassword\b/,
    /private key/,
    /credential-bearing URL/,
    /\[REDACTED:<kind>\]/,
  ]) {
    assert.match(methodology, kind, String(kind));
  }
  assert.match(methodology, /stop with `needs_attention` before any\s+commit/);
  assert.match(methodology, /Never guess or collect the value in chat/);
  // The other half of the rule: an ordinary identifier that merely looks like a
  // credential must survive, or redaction corrupts the normative ledger.
  assert.match(methodology, /only\s+resembles a secret/);
  assert.match(methodology, /stays verbatim/);
  const generated = prose(
    readFileSync(
      join(ROOT, "skills", "mo-orchestrate-orca", "references", "methodology.md"),
      "utf8",
    ),
  );
  assert.match(generated, /\[REDACTED:<kind>\]/);
  assert.match(generated, /only\s+resembles a secret/);
});

test("the business framing says where the verbatim ledger lives and what it keeps", () => {
  const business = prose(readFileSync(join(ROOT, "docs", "business.md"), "utf8"));
  assert.match(business, /Дословные пользовательские интенты ведутся/);
  assert.match(business, /вместе с задачей или\s+спецификацией/);
  assert.match(business, /сохраняется смысл, а не\s+формулировка/);
});

test("the architecture layer owns the split between ledger and framing", () => {
  const decision = prose(
    readFileSync(join(ROOT, "docs", "architecture", "knowledge-identifiers.md"), "utf8"),
  );
  assert.match(decision, /§A-MEMORY-02 — Дословный реестр живёт с задачей/);
  assert.match(decision, /нормативен для исполнителя и ревьюеров/);
  assert.match(decision, /Если §A-MEMORY-02 отменяется/);
});
