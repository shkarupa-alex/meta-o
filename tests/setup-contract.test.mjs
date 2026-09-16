/**
 * Protect substantive project setup and dependency/posture checks.
 *
 * Protects §A-BACKEND-01, §A-POSTURE-01 and §A-MEMORY-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const setup = readFileSync(join(ROOT, "src", "skills", "mo-setup", "SKILL.md"), "utf8");
const contract = readFileSync(join(ROOT, "shared", "references", "project-setup.md"), "utf8");
const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");

test("setup inspects project substance and isolates tracked repair", () => {
  for (const phrase of [
    "business framing",
    "glossary",
    "architecture decisions",
    "backlog",
    "acceptance-to-proof",
    "README",
    "byte-identical `AGENTS.md` and `CLAUDE.md`",
    "complexity and function/\\s*module size",
    "purpose explanations",
    "deterministic non-mutating aggregate QC",
  ]) {
    const expression = phrase.includes("\\s*")
      ? phrase
      : phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(contract, new RegExp(expression, "i"));
  }
  assert.match(setup, /`feature\/meta-o-setup`/);
  assert.match(setup, /never mix setup\s+repair into the current feature branch/);
  assert.doesNotMatch(setup, /phase-0-fixtures|fixture map|executor task delivery/i);
});

test("setup checks controls, companions and every harness posture separately", () => {
  for (const pair of [
    ["`orca`/`orca-cli` separately from the upstream\\s+`orchestration`", /orchestration/],
  ])
    assert.match(setup, new RegExp(pair[0]));
  assert.match(contract, /codex claude opencode/);
  assert.match(contract, /Missing, divergent or unreadable posture is not support/);
  assert.match(contract, /Detect Orca/);
  assert.match(contract, /unsupported\s+or ambiguous environments/);
  assert.match(contract, /Orca exposes\s+its version-matched `orchestration` guide/);
  assert.match(contract, /Backend-wide health does not prove harness readiness/);
  assert.match(setup, /check mature `jq` and `flock` dependencies/);
  assert.match(contract, /require `jq` and `flock` separately\s+from the Orca control/);
});

test("private Orca and specification workspaces are ignored and absent from the index", () => {
  const indexed = spawnSync("git", ["ls-files", "--", ".orca/", "spec/"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(indexed.status, 0, indexed.stderr);
  assert.equal(indexed.stdout, "");
  for (const path of [".orca/probe", "spec/probe"]) {
    const ignored = spawnSync("git", ["check-ignore", "-v", "--no-index", path], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(ignored.status, 0, ignored.stderr);
    assert.match(ignored.stdout, /^\.gitignore:\d+:/u);
  }
});

test("knowledge policy covers verbatim intent, language, semantic links and backlog fields", () => {
  assert.match(contract, /preserves the meaning of the original request/);
  assert.match(contract, /every\s+later user intent/);
  assert.match(contract, /complete verbatim ledger stays with the task or spec/);
  assert.match(contract, /Human-facing project knowledge uses the user's language/);
  assert.match(contract, /upstream names remain in English/);
  assert.match(contract, /label containing the target document's H1 title/);
  assert.match(contract, /mature Markdown AST\/link\s+tool, never a regex Markdown parser/);
  for (const field of ["reason", "practical impact", "next step"])
    assert.match(contract, new RegExp(field));
});

test("entry files treat material dictation anomalies as questions, not silent corrections", () => {
  assert.equal(agents, claude);
  assert.match(
    contract,
    /dictation rule:[\s\S]*materially change scope or[\s\S]*clarified with the user/,
  );
  assert.match(
    agents,
    /неточной диктовки[\s\S]*существенно изменить область или результат[\s\S]*спросите\s+пользователя/,
  );
  assert.match(agents, /Сохраняйте подтверждённое намерение дословно/);
});

test("entry files define the contradiction-resolution hierarchy", () => {
  for (const source of [agents, claude]) {
    assert.match(source, /Разрешайте противоречия в таком порядке/);
    assert.match(source, /бизнес-требования[\s\S]*архитектурные решения[\s\S]*реализация/);
    assert.match(source, /\[Зачем существует Meta-O\]\(docs\/business\.md\)/);
    assert.match(source, /Нижний слой не может переопределять верхний/);
  }
});

test("entry files preserve the mandatory branch and commit contract", () => {
  for (const source of [agents, claude]) {
    assert.match(
      source,
      /Никогда не разрабатывайте напрямую в `main`, `master`, `develop` или `default`/,
    );
    assert.match(source, /от актуальной `develop` ветку\s+`feature\/<short-slug>`/);
    assert.match(source, /Коммитьте каждое связное,\s+независимо проверяемое приращение/);
    assert.match(source, /`<type>: <what changed and why>`/);
    for (const type of ["feat", "fix", "refactor", "test", "docs", "chore"])
      assert.match(source, new RegExp("`" + type + "`"));
    assert.match(source, /Не добавляйте `Assisted-by`, `Co-authored-by`/);
  }
});
