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
    assert.match(source, /opus\[1m\]\/low/);
    assert.match(source, /gpt-5\.6-sol\/low/);
    assert.match(source, /gpt-5\.6-luna\/max/);
    assert.match(source, /Qwen\/OpenCode/);
  }
  assert.match(business, /фактической\s+идентичностью/);
  assert.match(business, /резервный путь/);
  assert.match(architecture, /effective\s+identity/);
  assert.match(architecture, /fallback/);
  assert.match(architecture, new RegExp(`§${"B-EVAL-01"}`));
});

test("lifecycle makes model actors named, applicable and fail closed", () => {
  const methodology = read("shared", "references", "methodology.md");
  assert.match(methodology, /named scenario/);
  assert.match(methodology, /deterministic proof remains\s+preferred/);
  assert.match(methodology, /`blocked\|not_run`/);
  assert.match(methodology, /`not_applicable`/);
  assert.match(methodology, /Never fall back/);
  assert.match(methodology, /floating family alias/);
  assert.match(methodology, /launch\.requested == launch\.effective/);
});

test("generated methodology removes the source-only architecture marker", () => {
  const source = read("shared", "references", "methodology.md");
  const generated = read("skills", "mo-orchestrate-orca", "references", "methodology.md");
  assert.match(source, /mo:source-anchor §A-EVAL-01/);
  assert.doesNotMatch(generated, /mo:source-anchor|§A-EVAL-01/);
});

test("desired OpenCode testing identity is Qwen only", () => {
  assert.equal(testingPolicyError("testOpenCodeDesired", "opencode/local/qwen3.8-27b/low"), null);
  for (const model of [
    "deepseek-4-flash",
    "qwen-2.5-27b",
    "qwen-anything-27b",
    "qwen3.80-27b",
    "qwen3.8-anything-27b",
    "qwen38-27b",
    "qwen3.827b",
    "qwen3827b",
    "qwen3.8-27b-preview",
    "qwen3.8-27b-uncensored",
  ]) {
    assert.match(
      testingPolicyError("testOpenCodeDesired", `opencode/local/${model}/low`),
      /qwen3\.8-27b/,
    );
  }
});

test("the testing profiles accept an exact model id and reject a floating alias", () => {
  assert.equal(testingPolicyError("testClaude", "claude/opus[1m]/low"), null);
  // A bare family name is whatever the provider ships next, so it cannot prove
  // the approved profile even though it reads like it.
  assert.match(testingPolicyError("testClaude", "claude/opus/low"), /opus\[1m\]/u);
  // The generation digit must be the model's own, not the tail of a date or of
  // an older generation's version pair.
  assert.match(
    testingPolicyError("testClaude", "claude/claude-opus-5-20250929/low"),
    /opus\[1m\]\/low/u,
  );
  assert.match(testingPolicyError("testClaude", "claude/opus[1m]/medium"), /opus\[1m\]\/low/u);
  assert.match(testingPolicyError("testClaude", "claude/opus-5/low"), /opus\[1m\]\/low/u);
  assert.match(
    testingPolicyError("testClaude", "claude/opus[1m]-totally-unapproved/low"),
    /opus\[1m\]\/low/u,
  );
  assert.match(testingPolicyError("testClaude", "claude/opus-1m/low"), /opus\[1m\]\/low/u);
  assert.match(testingPolicyError("testCodex", "codex/gpt-5.6/low"), /gpt-5\.6-sol/u);
  assert.match(
    testingPolicyError("testOpenCodeDesired", "opencode/deepseek/deepseek-v3-4-flash/low"),
    /qwen3\.8-27b/u,
  );
  assert.equal(testingPolicyError("executor", "codex/gpt-5.6-sol/medium"), null);
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
    assert.match(result.stderr, /testClaude.*opus\[1m\]\/low/u);
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
