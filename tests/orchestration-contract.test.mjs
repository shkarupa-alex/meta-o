/** Deterministic checks for the shared lifecycle and backend-specific mechanics. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shared = (name) => readFileSync(join(ROOT, "shared", "references", name), "utf8");
const skill = (name) => readFileSync(join(ROOT, "src", "skills", name, "SKILL.md"), "utf8");

test("lifecycle keeps the orchestrator out of product code and binds every gate to one SHA", () => {
  const source = shared("methodology.md");
  assert.match(source, /does not inspect, judge\s+or edit product code/);
  assert.match(source, /One verified result is one full Git object ID/);
  assert.match(source, /Prefix only the initial executor task with `\/goal`/);
  assert.match(source, /two to five sentences/);
  assert.match(source, /need not be\s+repository-relative or tracked/);
  assert.match(source, /start both reviewer sessions concurrently/i);
  assert.match(source, /Wait for both complete settled final responses/);
  assert.match(
    source,
    /send one ordinary message to the executor containing both\s+temporary-file paths/,
  );
  assert.match(source, /Do not merge, rank, hash, encode, split, truncate or\s+summarize/);
  assert.doesNotMatch(source, /MO_[A-Z0-9_]+/);
});

test("question and delegated-decision boundaries match the user contract", () => {
  const source = shared("methodology.md");
  assert.match(source, /roughly one agent-hour or less/);
  assert.match(source, /Record every such\s+decision for the final report/);
  assert.match(source, /product meaning, credentials, subscriptions, irreversible\s+actions/);
  assert.match(source, /Recommend an executor from a different model vendor/);
});

test("shared review protocol owns concurrency, diversity, atomic delivery and backlog lens", () => {
  const source = shared("review-protocol.md");
  assert.match(source, /Start reviewer A and reviewer B concurrently/);
  assert.match(source, /different model vendors/);
  assert.match(source, /at least one differs from the executor vendor/);
  assert.match(source, /read all of `docs\/backlog.md`/);
  for (const phrase of [
    "reason",
    "practical impact",
    "next step",
    "not being used as a progress tracker",
  ]) {
    assert.match(source, new RegExp(phrase));
  }
  assert.match(source, /Wait until both settled responses are complete before releasing either/);
});

test("each fixed backend entry consumes the same shared contracts and its native mechanics", () => {
  for (const backend of ["herdr", "orca", "paseo"]) {
    const orchestrator = skill(`mo-orchestrate-${backend}`);
    const review = skill(`mo-review-${backend}`);
    assert.match(orchestrator, /references\/methodology\.md/);
    assert.match(orchestrator, /references\/review-protocol\.md/);
    assert.match(orchestrator, new RegExp(`references/${backend}-mechanics\\.md`));
    assert.match(review, /references\/review-protocol\.md/);
    assert.match(review, new RegExp(`references/${backend}-mechanics\\.md`));
    assert.match(review, /never use `\/goal`|Never use `\/goal`/);
  }
});

test("backend mechanics use only the intended public result and diagnostic surfaces", () => {
  const herdr = shared("herdr-mechanics.md");
  const orca = shared("orca-mechanics.md");
  const paseo = shared("paseo-mechanics.md");
  assert.match(herdr, /herdr agent (?:get|read|wait|prompt)/);
  assert.match(herdr, /`--lines 120`, then increase to 200 and\s+400/);
  assert.match(herdr, /discarded by a harness alternate screen/);
  assert.match(herdr, /result\s+is `unknown`/);
  assert.match(orca, /complete `worker_done` body/);
  assert.match(orca, /Do not use `worker-read --source transcript`/);
  assert.match(orca, /`ready` and `input_accepted` is only a transport/);
  assert.match(orca, /terminal wait .*--for tui-idle/);
  assert.match(orca, /dispatch --task <task-id> --to <handle> --inject/);
  assert.match(orca, /do not duplicate a posture flag/);
  assert.match(paseo, /public `wait --json` result's settled assistant message/);
  assert.match(paseo, /paseo send <agent-id> --prompt <message> --no-wait --json/);
  assert.match(paseo, /never turn `send` into the wait/);
  assert.match(paseo, /`inspect` is a\s+metadata and state surface/);
  assert.match(paseo, /version-matched public application bundle/);
  assert.match(paseo, /Read the discovered companion guide completely/);
  assert.match(paseo, /paseo provider models <codex\|claude\|opencode> --json/);
  assert.match(paseo, /provider-discovery failure is actionable readiness evidence/);
  assert.match(herdr, /`herdr agent read --source recent-unwrapped`/);
  assert.match(herdr, /prompt receipt is not\s+delivery proof/i);
  for (const source of [herdr, orca, paseo]) {
    assert.match(source, /three-to-four-screen|three-to-four-screen|three-to-four/);
    assert.match(source, /whole-session|Whole-session|whole session/);
    assert.doesNotMatch(source, /private provider transcript.*use|inferred session database.*use/i);
  }
});
