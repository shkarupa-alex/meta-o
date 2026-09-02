/**
 * Keep model-backed evals bounded by applicability, approved cost and identity.
 *
 * Protects §A-EVAL-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { testingPolicyError } from "../shared/scripts/mo-models.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

test("durable business and architecture layers preserve the low-cost policy", () => {
  const business = read("docs", "business.md");
  const architecture = read("docs", "architecture", "evaluation-model-policy.md");
  for (const source of [business, architecture]) {
    assert.match(source, /sonnet5\/low/);
    assert.match(source, /gpt-5\.6-terra\/low/);
    assert.match(source, /deepseek 4 flash/);
    assert.match(source, /Qwen\/OpenCode/);
    assert.match(source, /effective\s+identity/);
    assert.match(source, /fallback/);
  }
  assert.match(architecture, new RegExp(`§${"B-EVAL-01"}`));
});

test("lifecycle makes model actors named, applicable and fail closed", () => {
  const methodology = read("shared", "references", "methodology.md");
  assert.match(methodology, /named scenario/);
  assert.match(methodology, /deterministic proof remains\s+preferred/);
  assert.match(methodology, /`blocked\|not_run`/);
  assert.match(methodology, /`not_applicable`/);
  assert.match(methodology, /Never raise\s+model cost\/effort or fall back automatically/);
});

test("generated methodology removes the source-only architecture marker", () => {
  const source = read("shared", "references", "methodology.md");
  const generated = read("skills", "mo-orchestrate-orca", "references", "methodology.md");
  assert.match(source, /mo:source-anchor §A-EVAL-01/);
  assert.doesNotMatch(generated, /mo:source-anchor|§A-EVAL-01/);
});

test("OpenCode testing identity cannot silently select the Qwen orchestrator", () => {
  assert.equal(testingPolicyError("testOpenCode", "opencode/local/deepseek-4-flash/low"), null);
  assert.match(
    testingPolicyError("testOpenCode", "opencode/local/qwen3.8-27b/low"),
    /deepseek 4 flash/,
  );
});

test("the Claude testing profile resolves real Sonnet ids instead of a hard-coded label", () => {
  assert.equal(testingPolicyError("testClaude", "claude/sonnet/low"), null);
  assert.equal(testingPolicyError("testClaude", "claude/claude-sonnet-5/low"), null);
  assert.equal(testingPolicyError("testClaude", "claude/sonnet5/low"), null);
  assert.match(testingPolicyError("testClaude", "claude/sonnet/medium"), /sonnet5\/low/u);
  assert.match(testingPolicyError("testClaude", "claude/opus-5/low"), /sonnet5\/low/u);
});

test("the consumed show path rejects hand-written expensive or invalid selections", () => {
  const home = mkdtempSync(join(tmpdir(), "mo-model-policy-"));
  try {
    const settings = join(home, ".meta-o");
    mkdirSync(settings);
    const run = (defaults) => {
      writeFileSync(join(settings, "models.json"), JSON.stringify({ schemaVersion: 1, defaults }));
      return spawnSync(
        process.execPath,
        [join(ROOT, "shared", "scripts", "mo-models.mjs"), "--show"],
        {
          encoding: "utf8",
          env: { ...process.env, HOME: home },
        },
      );
    };
    let result = run({ testClaude: "claude/opus-5/high" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /testClaude.*sonnet5\/low/u);
    result = run({ testCodex: "codex/gpt-5.6-sol/high" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /testCodex must be/u);
    result = run({ reviewerA: "bogusroute/model/high" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown route/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
