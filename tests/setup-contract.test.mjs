/** Protect substantive project setup and dependency/posture checks. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const setup = readFileSync(join(ROOT, "src", "skills", "mo-setup", "SKILL.md"), "utf8");
const contract = readFileSync(join(ROOT, "shared", "references", "project-setup.md"), "utf8");

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
  assert.match(setup, /never mix setup\nrepair into the current feature branch/);
  assert.doesNotMatch(setup, /phase-0-fixtures|fixture map|executor task delivery/i);
});

test("setup checks controls, companions and every harness posture separately", () => {
  for (const pair of [
    ["`herdr` plus `herdr`", /herdr/],
    ["`orca`\/`orca-cli` plus upstream `orchestration`", /orchestration/],
    ["`paseo` plus upstream\n`paseo`", /paseo/],
  ])
    assert.match(setup, new RegExp(pair[0]));
  assert.match(contract, /codex claude opencode/);
  assert.match(contract, /Missing, divergent or unreadable posture is not support/);
  assert.match(contract, /Detect the active backend/);
  assert.match(contract, /unsupported or ambiguous environments/);
});

test("knowledge policy covers verbatim intent, language, semantic links and backlog fields", () => {
  assert.match(contract, /original request and every later user intent\n  verbatim/);
  assert.match(contract, /Human-facing project knowledge uses the user's language/);
  assert.match(contract, /label containing the target document's H1 title/);
  assert.match(contract, /mature Markdown AST\/link\ntool, never a regex Markdown parser/);
  for (const field of ["reason", "practical impact", "next step"])
    assert.match(contract, new RegExp(field));
});
