/**
 * Guard the public Orca readiness, event, recovery and ownership contracts.
 *
 * Protects §A-BACKEND-01 and §A-ORCHESTRATION-02.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(join(ROOT, "shared", "references", name), "utf8");

test("readiness separates auth, account freshness and exact live launch", () => {
  const mechanics = read("orca-mechanics.md");
  for (const phrase of [
    "provider-native auth",
    "account list --json",
    "updatedAt",
    "stale_account_cache",
    "launch.requested == launch.effective",
    "real harness process consumed the task",
  ]) {
    assert.match(mechanics, new RegExp(phrase.replaceAll(".", "\\.")));
  }
  assert.match(mechanics, /Never switch model or harness/);
});

test("event states preserve delivery, work and effect uncertainty", () => {
  const contract = read("backend-contract.md");
  for (const state of [
    "sent",
    "delivered",
    "consumed",
    "acknowledged",
    "input_blocked",
    "output_blocked_after_work",
    "unknown_effect",
  ]) {
    assert.match(contract, new RegExp(state));
  }
  assert.match(contract, /receipt is not an effect/i);
  assert.match(contract, /never retried automatically/);
});

test("context and ownership recovery remain bounded", () => {
  const mechanics = read("orca-mechanics.md");
  assert.match(mechanics, /32768-token context/);
  assert.match(mechanics, /cap it at 8000 tokens/);
  assert.match(mechanics, /raw 21k\/41k dump/);
  assert.match(mechanics, /Never close unnamed human tabs/);
  assert.match(mechanics, /bare shell or expired Dispatch cannot\s+settle work/);
});
