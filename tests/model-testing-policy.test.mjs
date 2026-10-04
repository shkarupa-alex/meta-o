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
    assert.match(source, /claude\/opus\[1m\]\/low/u);
    assert.match(source, /codex\/gpt-6\.1-sol\/low/u);
    assert.match(source, /codex\/gpt-6-luna\/high/u);
    assert.match(source, /gpt-5\.6-luna\/max/u);
    assert.match(source, /Qwen\/OpenCode/u);
  }
  // The replaced pair survives only in the decision's append-only records; the
  // thesis names the current matrix and nothing else.
  assert.doesNotMatch(business, /`sonnet`\/low|gpt-5\.6-luna\/low/u);
  assert.match(business, /фактической\s+идентичностью/);
  assert.match(business, /резервный путь/);
  assert.match(architecture, /фактическ(?:ую|ой)\s+идентичност/u);
  assert.match(architecture, /не применяет автоматический резервный\s+вариант/u);
  // The exact effective id belongs to the architecture layer, not the business
  // thesis: the thesis owns the rule, the decision owns the literal it resolves
  // to, and only the decision may be the place a drifting alias is caught.
  assert.match(architecture, /claude-opus-5-5\[1m\]/u);
  assert.doesNotMatch(business, /claude-opus-5-5/u);
  assert.match(architecture, new RegExp(`§${"B-EVAL-01"}`));
});

test("the private-state exception stays as narrow as the decision that owns it", () => {
  // The prohibition and the recipe that needs it must be one statement, not
  // two: for a whole feature the papercut told the next caller to read a
  // provider session log while the lifecycle forbade exactly that, and both
  // documents passed every check.
  const life = read("shared", "references", "methodology.md");
  const policy = read("docs", "architecture", "evaluation-model-policy.md");
  const papercut = read("docs", "papercut.md");
  assert.match(life, /One exception is named and owned by the project's evaluation policy/u);
  // Its three limits, each stated where the exception is granted.
  assert.match(life, /reads identity and nothing else/u);
  assert.match(life, /never another\s+session's record/u);
  assert.match(life, /a public surface supersedes it the moment\s+one exists/u);
  // The decision carries the observation the exception rests on, including the
  // version: an exception with no falsifiable ground never expires.
  assert.match(policy, /codex-cli 0\.155\.0/u);
  assert.match(policy, /codex-cli 0\.158\.0/u);
  // Only the thread id of one's own run selects the file: the newest file in
  // the directory can belong to another session.
  assert.match(policy, /идентификатору\s+треда/u);
  assert.match(policy, /turn_context/u);
  assert.match(policy, /узкое исключение/u);
  // The operational recipe points at the decision instead of restating it.
  assert.match(papercut, /узкое\s+исключение\s+§A-EVAL-01/u);
  assert.match(papercut, /журнале\s+собственного\s+запуска/u);
  // Claude keeps its public route, so the exception covers one executor only.
  assert.match(papercut, /Фактическую модель у Claude берут из события `init`/u);
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
  // What a user may store. The owner requires the catalogue alias here, so
  // `opus[1m]` is the approved value and the exact id is not: storing the id
  // would bypass the owner's rule, and storing anything else is simply a
  // different model.
  assert.equal(testingPolicyError("testClaude", "claude/opus[1m]/low"), null);
  assert.match(testingPolicyError("testClaude", "claude/opus/low"), /opus\[1m\]\/low/u);
  assert.match(testingPolicyError("testClaude", "claude/sonnet/low"), /opus\[1m\]\/low/u);
  assert.match(
    testingPolicyError("testClaude", "claude/claude-opus-5-5[1m]/low"),
    /opus\[1m\]\/low/u,
  );
  assert.match(testingPolicyError("testClaude", "claude/opus[1m]/high"), /opus\[1m\]\/low/u);
  assert.match(testingPolicyError("testClaude", "claude/anything/opus[1m]/low"), /opus\[1m\]/u);
  assert.match(testingPolicyError("testCodexSol", "codex/gpt-6.1-sol/high"), /gpt-6\.1-sol\/low/u);
  assert.match(testingPolicyError("testCodexSol", "codex/gpt-6-luna/low"), /gpt-6\.1-sol\/low/u);
  // The owner replaced gpt-6-sol with gpt-6.1-sol; the old model no longer fills the role.
  assert.match(testingPolicyError("testCodexSol", "codex/gpt-6-sol/low"), /gpt-6\.1-sol\/low/u);
  assert.match(testingPolicyError("testCodexLuna", "codex/gpt-6-luna/low"), /gpt-6-luna\/high/u);
  assert.match(testingPolicyError("testCodexLuna", "codex/gpt-6/high"), /gpt-6-luna\/high/u);
  assert.match(
    testingPolicyError("testOpenCodeDesired", "opencode/deepseek/deepseek-v3-4-flash/low"),
    /qwen3\.8-27b/u,
  );
  assert.equal(testingPolicyError("executor", "codex/gpt-5.6-sol/medium"), null);

  // What must actually have run. The id is closed whole, so a release-date tail
  // or a context suffix dropped by the harness is a different model, not the
  // approved one.
  assert.equal(
    testingEffectiveIdentityError("testClaude", "opus[1m]", "claude-opus-5-5[1m]"),
    null,
  );
  for (const observed of [
    "opus[1m]",
    "claude-opus-5-5",
    "claude-opus-5-5-20260901[1m]",
    "claude-opus-5-6[1m]",
    "claude-sonnet-5-5",
    // Only OpenCode qualifies an id with a provider. Tolerating the prefix
    // everywhere would let the envelope name any provider it liked in front of
    // the approved generation and still be believed.
    "anything/claude-opus-5-5[1m]",
  ]) {
    assert.match(
      testingEffectiveIdentityError("testClaude", "opus[1m]", observed),
      /alias_resolution_changed/u,
    );
  }
  // Both values appear in the reason, because a person has to decide whether the
  // literal moves; the checker never migrates it.
  const drift = testingEffectiveIdentityError("testClaude", "opus[1m]", "claude-opus-5-6[1m]");
  assert.match(drift, /opus\[1m\]/u);
  assert.match(drift, /claude-opus-5-6\[1m\]/u);
  assert.match(drift, /claude-opus-5-5\[1m\]/u);

  // An exact-id route resolves nothing, so both halves name the same literal.
  assert.equal(testingEffectiveIdentityError("testCodexSol", "gpt-6.1-sol", "gpt-6.1-sol"), null);
  assert.equal(testingEffectiveIdentityError("testCodexLuna", "gpt-6-luna", "gpt-6-luna"), null);
  assert.match(
    testingEffectiveIdentityError("testCodexSol", "gpt-6.1-sol", "gpt-6-luna"),
    /alias_resolution_changed/u,
  );

  // Two roles may share a route and differ in model and effort; the desired
  // coordinate stays its own role and literal.
  assert.equal(testingPolicyError("testCodexSol", "codex/gpt-6.1-sol/low"), null);
  assert.equal(testingPolicyError("testCodexLuna", "codex/gpt-6-luna/high"), null);
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
    assert.match(result.stderr, /testClaude.*opus\[1m\]\/low/u);
    result = run({ testCodexSol: "codex/gpt-6.1-sol/high" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /testCodexSol must be/u);
    result = run({ testCodexLuna: "codex/gpt-6.1-sol/high" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /testCodexLuna must be/u);
    // The replaced single Codex role is named, not silently dropped, so a
    // stored `testCodex` tells its owner which two roles took its place.
    result = run({ testCodex: "codex/gpt-5.6-luna/low" });
    assert.match(result.stderr, /testCodex .*testCodexSol and testCodexLuna/u);
    result = run({ reviewerA: "bogusroute/model/high" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown route/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
