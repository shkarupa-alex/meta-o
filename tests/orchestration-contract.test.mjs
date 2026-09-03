/**
 * Deterministic checks for the shared lifecycle and backend-specific mechanics.
 *
 * Protects §A-ORCHESTRATION-01, §A-ORCHESTRATION-02, §A-RESPONSE-01 and
 * §A-RESPONSE-02.
 */

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
  assert.match(source, /native interactive Codex, Claude Code or OpenCode instance/);
  assert.match(source, /inline text or an accessible file\s+path/);
  assert.match(source, /Never create or execute a shell script to invoke the reviewer harness/);
  assert.match(source, /Wait for both complete settled final responses/);
  assert.match(
    source,
    /send one ordinary message to the executor containing both\s+temporary-file paths/,
  );
  assert.match(source, /Do not merge, rank, hash, encode, split, truncate or\s+summarize/);
  assert.match(source, /inert Markdown response payloads/);
  assert.doesNotMatch(source, /MO_[A-Z0-9_]+/);
});

test("the architecture says how a real-run incident family is regressed", () => {
  const decision = readFileSync(join(ROOT, "docs", "architecture", "skills-first.md"), "utf8");
  // Without this boundary the critical-suite requirement reads as a demand for
  // a fake-Orca replay of agent behaviour, which needs the very driver this
  // decision forbids.
  assert.match(decision, /Fake-контроль воспроизводит/u);
  assert.match(decision, /единственного исполняемого consumer этого проекта — watchdog/u);
  assert.match(decision, /именованное\s+утверждение о конкретном правиле поставляемой инструкции/u);
  assert.match(decision, /принятое ограничение, а не отложенная работа/u);
  const obligations = readFileSync(join(ROOT, "tests", "closure-obligations.test.mjs"), "utf8");
  assert.match(obligations, /fixtures\/orca-control\.mjs/u);
});

test("question and delegated-decision boundaries match the user contract", () => {
  const source = shared("methodology.md");
  assert.match(source, /roughly one agent-hour or less/);
  assert.match(source, /Record every such\s+decision for the final report/);
  assert.match(source, /product meaning, credentials, subscriptions, irreversible\s+actions/);
  assert.match(source, /Recommend an executor from a different model vendor/);
});

test("portable review protocol owns ordered evidence, modes, severity and deferral lens", () => {
  const source = shared("review-protocol.md");
  const stages = [
    "Grounding",
    "Change discovery",
    "Risk mapping",
    "Candidate discovery",
    "Candidate verification",
    "Causality",
    "Severity",
    "Reporting",
  ];
  let offset = -1;
  for (const stage of stages) {
    const next = source.indexOf(stage, offset + 1);
    assert.ok(next > offset, `${stage} follows the previous stage`);
    offset = next;
  }
  for (const phrase of ["fast", "deep", "follow_up", "P0", "P1", "P2", "P3"]) {
    assert.match(source, new RegExp(phrase));
  }
  assert.match(source, /read the diff before constructing the initial risk map/);
  assert.match(source, /An empty backlog is valid/);
  assert.match(source, /reason, practical impact and next step/);
  assert.doesNotMatch(source, /Meta-O|docs\/backlog\.md/);
});

test("lifecycle and Orca review own pair settlement outside the portable core", () => {
  const methodology = shared("methodology.md");
  const review = skill("mo-review-orca");
  assert.match(methodology, /Start both reviewer sessions concurrently/i);
  assert.match(methodology, /same candidate SHA/);
  assert.match(methodology, /both\s+complete settled final responses/);
  assert.match(methodology, /same-SHA passes/);
  assert.match(review, /vendor-diverse pair/);
  assert.match(review, /Wait for both full reports/);
  assert.match(review, /Keep remediation reviewers hot/);
  assert.match(review, /fresh independent sessions/);
  assert.match(review, /five\s+paired review\/fix attempts/);
});

test("Orca entries consume the shared contracts and native mechanics", () => {
  for (const backend of ["orca"]) {
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
  const orca = shared("orca-mechanics.md");
  for (const source of [orca]) {
    assert.match(source, /accessible file path/);
    assert.match(source, /shell script that\s+invokes the\s+reviewer harness/);
  }
  assert.match(orca, /complete `worker_done` body/);
  assert.match(orca, /Do not use `worker-read --source transcript`/);
  assert.match(orca, /`ready` and `input_accepted` is only a transport/);
  assert.match(orca, /terminal wait .*--for tui-idle/);
  assert.match(orca, /dispatch --task <task-id> --to <handle> --inject/);
  assert.match(orca, /do not duplicate a posture flag/);
  for (const source of [orca]) {
    assert.match(source, /three-to-four-screen|three-to-four-screen|three-to-four/);
    assert.match(source, /whole-session|Whole-session|whole session/);
    assert.doesNotMatch(source, /private provider transcript.*use|inferred session database.*use/i);
  }
});
