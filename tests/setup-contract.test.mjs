/** Protect substantive project setup and dependency/posture checks. */

import assert from "node:assert/strict";
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
    ["`herdr` plus `herdr`", /herdr/],
    ["`orca`\/`orca-cli` plus upstream `orchestration`", /orchestration/],
    ["`paseo` plus upstream\\s+`paseo`", /paseo/],
  ])
    assert.match(setup, new RegExp(pair[0]));
  assert.match(contract, /codex claude opencode/);
  assert.match(contract, /Missing, divergent or unreadable posture is not support/);
  assert.match(contract, /Detect the active backend/);
  assert.match(contract, /unsupported or ambiguous environments/);
  assert.match(contract, /Orca exposes its\s+version-matched `orchestration` guide/);
  assert.match(contract, /Paseo may expose\s+its version-matched `paseo` guide/);
  assert.match(setup, /installed or version-matched bundled\s+Paseo guide/);
  assert.match(contract, /Backend-wide health does not prove harness readiness/);
  assert.match(contract, /native\s+provider discovery for Codex, Claude Code and OpenCode/);
  assert.match(setup, /daemon health alone is insufficient/);
});

test("knowledge policy covers verbatim intent, language, semantic links and backlog fields", () => {
  assert.match(contract, /original request and every later user intent\s+verbatim/);
  assert.match(contract, /Human-facing project knowledge uses the user's language/);
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
    /imperfect dictation[\s\S]*materially change scope or outcome[\s\S]*ask the\s+user/,
  );
  assert.match(agents, /Preserve confirmed intent\s+verbatim/);
});
