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

import { testingEffectiveIdentityError, testingPolicyError } from "../shared/scripts/mo-models.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

test("durable business and architecture layers preserve the low-cost policy", () => {
  const business = read("docs", "business.md");
  const architecture = read("docs", "architecture", "evaluation-model-policy.md");
  for (const source of [business, architecture]) {
    // The required Claude coordinate is stored as a catalogue alias, so the
    // durable layers have to carry both halves: what is written down and what
    // must actually have run. One literal alone would let the other drift.
    assert.match(source, /`sonnet`\/low/u);
    assert.match(source, /gpt-5\.6-luna\/low/u);
    assert.match(source, /gpt-5\.6-luna\/max/u);
    assert.match(source, /Qwen\/OpenCode/u);
    assert.doesNotMatch(source, /opus\[1m\]\/low/u);
    assert.doesNotMatch(source, /gpt-5\.6-sol\/low/u);
  }
  assert.match(business, /фактической\s+идентичностью/);
  assert.match(business, /резервный путь/);
  assert.match(architecture, /фактическ(?:ую|ой)\s+идентичност/u);
  assert.match(architecture, /не применяет автоматический резервный\s+вариант/u);
  // The exact effective id belongs to the architecture layer, not the business
  // thesis: the thesis owns the rule, the decision owns the literal it resolves
  // to, and only the decision may be the place a drifting alias is caught.
  assert.match(architecture, /claude-sonnet-5/u);
  assert.doesNotMatch(business, /claude-sonnet-5/u);
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

test("the stored coordinate and the model that actually ran are closed separately", () => {
  // What a user may store. U7 requires the catalogue alias here, so `sonnet` is
  // the approved value and the exact id is not: storing the id would bypass the
  // owner's rule, and storing anything else is simply a different model.
  assert.equal(testingPolicyError("testClaude", "claude/sonnet/low"), null);
  assert.match(testingPolicyError("testClaude", "claude/opus/low"), /sonnet/u);
  assert.match(testingPolicyError("testClaude", "claude/claude-sonnet-5/low"), /sonnet\/low/u);
  assert.match(testingPolicyError("testClaude", "claude/sonnet/medium"), /sonnet\/low/u);
  assert.match(
    testingPolicyError("testClaude", "claude/sonnet-totally-unapproved/low"),
    /sonnet\/low/u,
  );
  assert.match(testingPolicyError("testCodex", "codex/gpt-5.6/low"), /gpt-5\.6-luna/u);
  assert.match(testingPolicyError("testClaude", "claude/anything/sonnet/low"), /sonnet\/low/u);
  assert.match(
    testingPolicyError("testOpenCodeDesired", "opencode/deepseek/deepseek-v3-4-flash/low"),
    /qwen3\.8-27b/u,
  );
  assert.equal(testingPolicyError("executor", "codex/gpt-5.6-sol/medium"), null);

  // What must actually have run. The generation digit must be the model's own,
  // not the tail of a release date, which is how `claude-sonnet-4-5-20250929`
  // once passed as the approved generation.
  assert.equal(testingEffectiveIdentityError("testClaude", "sonnet", "claude-sonnet-5"), null);
  for (const observed of [
    "sonnet",
    "claude-sonnet-5-20250929",
    "claude-sonnet-6",
    "claude-opus-5",
    // Only OpenCode qualifies an id with a provider. Tolerating the prefix
    // everywhere would let the envelope name any provider it liked in front of
    // the approved generation and still be believed.
    "anything/claude-sonnet-5",
  ]) {
    assert.match(
      testingEffectiveIdentityError("testClaude", "sonnet", observed),
      /alias_resolution_changed/u,
    );
  }
  // Both values appear in the reason, because a person has to decide whether the
  // literal moves; the checker never migrates it.
  const drift = testingEffectiveIdentityError("testClaude", "sonnet", "claude-sonnet-6");
  assert.match(drift, /sonnet/u);
  assert.match(drift, /claude-sonnet-6/u);
  assert.match(drift, /claude-sonnet-5/u);

  // An exact-id route resolves nothing, so both halves name the same literal.
  assert.equal(testingEffectiveIdentityError("testCodex", "gpt-5.6-luna", "gpt-5.6-luna"), null);
  assert.match(
    testingEffectiveIdentityError("testCodex", "gpt-5.6-luna", "gpt-5.6-sol"),
    /alias_resolution_changed/u,
  );

  // Nothing requires two roles to name different models: after U1 the required
  // and desired Codex coordinates differ only in effort, and a rule demanding
  // distinct models would make the approved matrix unsatisfiable.
  assert.equal(testingPolicyError("testCodex", "codex/gpt-5.6-luna/low"), null);
  assert.equal(testingPolicyError("testCodexDesired", "codex/gpt-5.6-luna/max"), null);
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
    assert.match(result.stderr, /testClaude.*sonnet\/low/u);
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
