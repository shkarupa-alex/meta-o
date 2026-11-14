/**
 * Hold the slot publication of `mo-review-report.mjs`: `namespace`, `stage`,
 * `preview` and `pair`.
 *
 * §A-RESPONSE-03 lets the coordinator carry nothing between these calls but
 * values it owns anyway — the pair id `namespace` printed, its own Dispatch,
 * candidate, vendor and `Round` — while `stage.json` in each slot directory
 * carries what was observed about the report. The tests below run the shipped
 * script the way the skill documents it, and break each link a pair is made
 * of: another namespace, candidate, round, a reused Dispatch, an unproven or
 * repeated vendor, and a report changed after it was staged.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  namespace,
  pair,
  preview,
  readFacts,
  slotIdentity,
  stage,
} from "../shared/scripts/mo-review-report.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(ROOT, "shared", "scripts", "mo-review-report.mjs");
const SHA = "c".repeat(40);
const OTHER_SHA = "d".repeat(40);
const ROUND = { attempt: 2, limit: 5, deepReads: 1, fragment: "stage" };
const ROUND_LINE = "Round: attempt=2/5 deep_reads=1 fragment=stage";
const ROUND_ARGS = ["--attempt", "2", "--attempt-limit", "5", "--deep-reads", "1"];

// Every slot directory a test creates lives under one private TMPDIR, so the
// assertion that no pair directory exists yet looks at a directory nothing
// else writes to.
const TMP = mkdtempSync(join(tmpdir(), "mo-review-stage-test-"));
const ENV = { ...process.env, TMPDIR: TMP };
process.env.TMPDIR = TMP;
after(() => rmSync(TMP, { recursive: true, force: true }));

function report(execution, { candidate = SHA, round = ROUND_LINE } = {}) {
  return (
    `Review-Execution: ${execution}\nCandidate: ${candidate}\n` +
    `Mode: requested=deep effective=deep\n${round}\n` +
    "Delegation: none\nVerdict: PASS\n" +
    "Counts: P0=0 P1=0 P2=0 P3=0\n\nEvidence report\nGrounding\nintent and clean SHA\n" +
    "Scope and checks\nread-only diff\nFindings\nUnknowns\nnone\nResidual risks\nnone\n" +
    `End-Review: ${execution}\n`
  );
}

const expected = (candidate = SHA) => ({
  candidate,
  requestedMode: "deep",
  effectiveMode: "deep",
  round: ROUND,
});

/** Write a reviewer's Body-File into its own slot, as `prepare` would. */
function bodyFile(slotDir, slot, text) {
  const path = join(slotDir, `slot-${slot.toLowerCase()}-r2-d1.md`);
  writeFileSync(path, text, { mode: 0o600, flag: "wx" });
  return path;
}

/** Stage one slot through the library with the values a coordinator holds. */
function stageSlot(created, slot, { dispatch, vendor, candidate = SHA, body, pairId } = {}) {
  const dir = created.slots[slot];
  const file = bodyFile(dir, slot, body ?? report(dispatch, { candidate }));
  return stage({
    slotDir: dir,
    slot,
    pairId: pairId ?? created.pairId,
    dispatch,
    vendor,
    file,
    expected: expected(candidate),
  });
}

const expectPair = (created, overrides = {}) => ({
  pairId: created.pairId,
  candidate: SHA,
  round: ROUND,
  ...overrides,
});

function run(args, input) {
  return spawnSync(process.execPath, [HELPER, ...args], { encoding: "utf8", env: ENV, input });
}

const pairDirs = (pairId) =>
  readdirSync(TMP).filter((name) => name.startsWith(`mo-review-${pairId}-pair`));

test("namespace makes two private slot directories that name their pair and nothing else", () => {
  const created = namespace();
  assert.match(created.pairId, /^[a-f0-9]{12}$/u);
  for (const slot of ["A", "B"]) {
    const dir = created.slots[slot];
    assert.equal(dirname(dir), TMP);
    assert.match(basename(dir), new RegExp(`^mo-review-${created.pairId}-${slot}-[\\w]{6}$`, "u"));
    assert.equal(statSync(dir).mode & 0o777, 0o700, slot);
    assert.deepEqual(readdirSync(dir), [], slot);
    assert.deepEqual(slotIdentity(dir), { pairId: created.pairId, slot });
  }
  // No pair directory and no record exist before both reports are staged.
  assert.deepEqual(pairDirs(created.pairId), []);
  assert.equal(slotIdentity(TMP), null);
});

test("namespace, stage, preview and pair carry no requisite but the coordinator's own", () => {
  const ns = run(["namespace", "--slots", "A,B"]);
  assert.equal(ns.status, 0, ns.stderr);
  const printed =
    /^MO-REVIEW-NS\/1 pair_id=([a-f0-9]{12}) slot_a=("[^"]+") slot_b=("[^"]+")\n$/u.exec(ns.stdout);
  assert.ok(printed, ns.stdout);
  const [, pairId, slotA, slotB] = printed;
  const slots = { A: JSON.parse(slotA), B: JSON.parse(slotB) };
  const stageCall = (slot, dispatch, vendor) =>
    run([
      "stage",
      "--slot-dir",
      slots[slot],
      "--slot",
      slot,
      "--pair-id",
      pairId,
      "--dispatch",
      dispatch,
      "--candidate",
      SHA,
      "--requested",
      "deep",
      "--vendor",
      vendor,
      ...ROUND_ARGS,
      "--fragment",
      "stage",
      "--file",
      bodyFile(slots[slot], slot, report(dispatch)),
    ]);
  const stagedA = stageCall("A", "ctx_a", "anthropic");
  assert.equal(stagedA.status, 0, stagedA.stdout + stagedA.stderr);
  assert.match(
    stagedA.stdout,
    /^MO-REVIEW-STAGE\/1 status=staged slot=A sha256=[a-f0-9]{64} bytes=\d+\n$/u,
  );
  const facts = JSON.parse(readFileSync(join(slots.A, "stage.json"), "utf8"));
  assert.equal(statSync(join(slots.A, "stage.json")).mode & 0o777, 0o600);
  assert.deepEqual(Object.keys(facts), [
    "schema_version",
    "pair_id",
    "slot",
    "dispatch",
    "vendor",
    "candidate",
    "execution",
    "round",
    "report",
  ]);
  assert.equal(facts.execution, "ctx_a");
  assert.match(facts.report.dev, /^\d+$/u);
  // The early preview reads slot A's own record; the pair directory does not
  // exist yet, and the preview names no path outside slot A.
  const shown = run(["preview", "--slot-dir", slots.A, "--slot", "A"]);
  assert.equal(shown.status, 0, shown.stdout + shown.stderr);
  assert.equal(
    shown.stdout,
    `Review-Preview: ${pairId} A=${JSON.stringify(join(slots.A, "slot-a-r2-d1.md"))} A_bytes=${facts.report.bytes}\n`,
  );
  assert.deepEqual(pairDirs(pairId), []);
  assert.equal(stageCall("B", "ctx_b", "openai").status, 0);
  const paired = run([
    "pair",
    "--slot-a",
    slots.A,
    "--slot-b",
    slots.B,
    "--expect-pair-id",
    pairId,
    "--expect-candidate",
    SHA,
    "--expect-round",
    ROUND_LINE,
  ]);
  assert.equal(paired.status, 0, paired.stdout + paired.stderr);
  const [summary, line] = paired.stdout.trimEnd().split("\n");
  const ok =
    /^MO-REVIEW-PAIR\/1 status=ok pair_id=(\w+) dir=("[^"]+") a_bytes=(\d+) b_bytes=(\d+)$/u.exec(
      summary,
    );
  assert.ok(ok, summary);
  assert.equal(ok[1], pairId);
  const dir = JSON.parse(ok[2]);
  assert.deepEqual(pairDirs(pairId), [basename(dir)]);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(dir).sort(), ["A-anthropic.md", "B-openai.md"]);
  assert.equal(readFileSync(join(dir, "A-anthropic.md"), "utf8"), report("ctx_a"));
  assert.equal(readFileSync(join(dir, "B-openai.md"), "utf8"), report("ctx_b"));
  assert.equal(Number(ok[3]), facts.report.bytes);
  assert.match(
    line,
    new RegExp(`^Review-Pair: ${pairId} A=".+" A_bytes=${ok[3]} B=".+" B_bytes=${ok[4]}$`, "u"),
  );
  // A second `pair` of the same slots finds the pair already published: it
  // mints no second pair directory and leaves the first one's copies as they were.
  const again = run([
    "pair",
    "--slot-a",
    slots.A,
    "--slot-b",
    slots.B,
    "--expect-pair-id",
    pairId,
    "--expect-candidate",
    SHA,
    "--expect-round",
    ROUND_LINE,
  ]);
  assert.equal(again.status, 1, again.stderr);
  assert.equal(again.stdout, "MO-REVIEW-PAIR/1 status=unknown reason=final_exists\n");
  assert.deepEqual(pairDirs(pairId), [basename(dir)]);
  assert.deepEqual(readdirSync(dir).sort(), ["A-anthropic.md", "B-openai.md"]);
  assert.equal(readFileSync(join(dir, "A-anthropic.md"), "utf8"), report("ctx_a"));
});

test("a report changed after stage is caught by both consumers", () => {
  const created = namespace();
  assert.equal(
    stageSlot(created, "A", { dispatch: "ctx_a", vendor: "anthropic" }).status,
    "staged",
  );
  const staged = stageSlot(created, "B", { dispatch: "ctx_b", vendor: "openai" });
  assert.equal(staged.status, "staged");
  writeFileSync(staged.path, report("ctx_b").replace("none\nResidual", "edited\nResidual"));
  assert.deepEqual(
    pair({ slotA: created.slots.A, slotB: created.slots.B, expect: expectPair(created) }),
    {
      status: "unknown",
      reason: "identity_changed",
      slot: "B",
    },
  );
  assert.equal(preview({ slotDir: created.slots.B, slot: "B" }).reason, "identity_changed");
  assert.deepEqual(pairDirs(created.pairId), []);
  // The same bytes under the same name are another file: a name is not an
  // identity, and the inode is what `stage` observed. The new file exists
  // before the old one goes, so the two can never share an inode number.
  const swapped = `${staged.path}.new`;
  writeFileSync(swapped, report("ctx_b"), { mode: 0o600 });
  renameSync(swapped, staged.path);
  assert.equal(preview({ slotDir: created.slots.B, slot: "B" }).reason, "identity_changed");
});

test("a slot is staged once, and its record is never recreated by a consumer", () => {
  const created = namespace();
  assert.equal(
    stageSlot(created, "A", { dispatch: "ctx_a", vendor: "anthropic" }).status,
    "staged",
  );
  const again = stage({
    slotDir: created.slots.A,
    slot: "A",
    pairId: created.pairId,
    dispatch: "ctx_a",
    vendor: "anthropic",
    buffer: Buffer.from(report("ctx_a"), "utf8"),
    expected: expected(),
  });
  assert.equal(again.reason, "stage_exists");
  assert.equal(preview({ slotDir: created.slots.B, slot: "B" }).reason, "stage_missing");
  const facts = join(created.slots.A, "stage.json");
  writeFileSync(facts, "{ not json");
  assert.equal(preview({ slotDir: created.slots.A, slot: "A" }).reason, "facts_malformed");
  writeFileSync(facts, JSON.stringify({ schema_version: 1 }));
  assert.equal(readFacts(created.slots.A).reason, "facts_malformed");
  rmSync(facts);
  assert.equal(preview({ slotDir: created.slots.A, slot: "A" }).reason, "stage_missing");
  assert.equal(existsSync(facts), false);
});

test("a report received on stdin is published into its own slot first", () => {
  const created = namespace();
  const body = report("ctx_remote");
  const result = run(
    [
      "stage",
      "--slot-dir",
      created.slots.B,
      "--slot",
      "B",
      "--pair-id",
      created.pairId,
      "--dispatch",
      "ctx_remote",
      "--candidate",
      SHA,
      "--requested",
      "deep",
      "--vendor",
      "openai",
      ...ROUND_ARGS,
      "--fragment",
      "stage",
      "--file",
      "-",
    ],
    body,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readdirSync(created.slots.B).sort(), ["stage.json", "worker-done.md"]);
  const published = join(created.slots.B, "worker-done.md");
  assert.equal(readFileSync(published, "utf8"), body);
  assert.equal(statSync(published).mode & 0o777, 0o600);
});

test("a report outside its own slot, or answering another round, is not staged", () => {
  const created = namespace();
  const elsewhere = bodyFile(created.slots.A, "B", report("ctx_b"));
  const outside = stage({
    slotDir: created.slots.B,
    slot: "B",
    pairId: created.pairId,
    dispatch: "ctx_b",
    vendor: "openai",
    file: elsewhere,
    expected: expected(),
  });
  assert.equal(outside.reason, "report_outside_slot");
  const stale = stageSlot(created, "B", {
    dispatch: "ctx_b",
    vendor: "openai",
    body: report("ctx_b", { round: "Round: attempt=1/5 deep_reads=1 fragment=stage" }),
  });
  assert.equal(stale.reason, "round_mismatch");
  assert.equal(existsSync(join(created.slots.B, "stage.json")), false);
});

test("a report that is not a report, or would replace one, is never published", () => {
  const created = namespace();
  const call = (buffer, vendor = "openai") =>
    stage({
      slotDir: created.slots.B,
      slot: "B",
      pairId: created.pairId,
      dispatch: "ctx_b",
      vendor,
      buffer,
      expected: expected(),
    });
  const malformed = call(Buffer.from(report("ctx_b").replace(/End-Review:.+/u, ""), "utf8"));
  assert.equal(malformed.reason, "malformed");
  assert.equal(malformed.verdict.reason, "footer_mismatch");
  const latin = Buffer.concat([Buffer.from(report("ctx_b"), "utf8"), Buffer.from([0xff])]);
  assert.equal(call(latin).reason, "invalid_utf8");
  assert.equal(call(Buffer.from(report("ctx_b"), "utf8"), "Claude Opus").reason, "vendor");
  assert.deepEqual(readdirSync(created.slots.B), []);
  // Bytes already received into the slot stay what they were, and the claim
  // on `stage.json` is given back, so the slot reads as never staged.
  const received = join(created.slots.B, "worker-done.md");
  writeFileSync(received, "foreign\n", { mode: 0o600 });
  assert.equal(call(Buffer.from(report("ctx_b"), "utf8")).reason, "final_exists");
  assert.equal(readFileSync(received, "utf8"), "foreign\n");
  assert.deepEqual(readdirSync(created.slots.B), ["worker-done.md"]);
});

test("a slot whose directory names another pair or letter is refused", () => {
  const created = namespace();
  const other = namespace();
  for (const [slot, pairId] of [
    ["A", other.pairId],
    ["B", created.pairId],
  ]) {
    const result = stage({
      slotDir: created.slots.A,
      slot,
      pairId,
      dispatch: "ctx_a",
      vendor: "anthropic",
      buffer: Buffer.from(report("ctx_a"), "utf8"),
      expected: expected(),
    });
    assert.equal(result.reason, "slot_identity_mismatch", `${slot} ${pairId}`);
  }
  assert.deepEqual(readdirSync(created.slots.A), []);
});

test("pair refuses every way two staged slots are not one pair", () => {
  const cases = [
    {
      name: "two namespaces with one Round",
      reason: "pair_mismatch",
      build() {
        const first = namespace();
        const second = namespace();
        stageSlot(first, "A", { dispatch: "ctx_a", vendor: "anthropic" });
        stageSlot(second, "B", { dispatch: "ctx_b", vendor: "openai" });
        return { slotA: first.slots.A, slotB: second.slots.B, expect: expectPair(first) };
      },
    },
    {
      name: "two candidates",
      reason: "candidate_mismatch",
      build() {
        const created = namespace();
        stageSlot(created, "A", { dispatch: "ctx_a", vendor: "anthropic" });
        stageSlot(created, "B", { dispatch: "ctx_b", vendor: "openai", candidate: OTHER_SHA });
        return { slotA: created.slots.A, slotB: created.slots.B, expect: expectPair(created) };
      },
    },
    {
      name: "another expected Round",
      reason: "round_mismatch",
      build() {
        const created = namespace();
        stageSlot(created, "A", { dispatch: "ctx_a", vendor: "anthropic" });
        stageSlot(created, "B", { dispatch: "ctx_b", vendor: "openai" });
        const round = { ...ROUND, attempt: 3 };
        return {
          slotA: created.slots.A,
          slotB: created.slots.B,
          expect: expectPair(created, { round }),
        };
      },
    },
    {
      name: "one Dispatch in both slots",
      reason: "dispatch_reused",
      build() {
        const created = namespace();
        stageSlot(created, "A", { dispatch: "ctx_same", vendor: "anthropic" });
        stageSlot(created, "B", { dispatch: "ctx_same", vendor: "openai" });
        return { slotA: created.slots.A, slotB: created.slots.B, expect: expectPair(created) };
      },
    },
    {
      name: "an unknown vendor",
      reason: "vendor_unproven",
      build() {
        const created = namespace();
        stageSlot(created, "A", { dispatch: "ctx_a", vendor: "unknown" });
        stageSlot(created, "B", { dispatch: "ctx_b", vendor: "unknown" });
        return { slotA: created.slots.A, slotB: created.slots.B, expect: expectPair(created) };
      },
    },
    {
      name: "one vendor on two routes",
      reason: "vendor_not_diverse",
      build() {
        const created = namespace();
        stageSlot(created, "A", { dispatch: "ctx_a", vendor: "openai" });
        stageSlot(created, "B", { dispatch: "ctx_b", vendor: "openai" });
        return { slotA: created.slots.A, slotB: created.slots.B, expect: expectPair(created) };
      },
    },
    {
      name: "slot A given twice",
      reason: "pair_mismatch",
      build() {
        const created = namespace();
        stageSlot(created, "A", { dispatch: "ctx_a", vendor: "anthropic" });
        return { slotA: created.slots.A, slotB: created.slots.A, expect: expectPair(created) };
      },
    },
    {
      name: "slot B never staged",
      reason: "stage_missing",
      build() {
        const created = namespace();
        stageSlot(created, "A", { dispatch: "ctx_a", vendor: "anthropic" });
        return { slotA: created.slots.A, slotB: created.slots.B, expect: expectPair(created) };
      },
    },
  ];
  for (const { name, reason, build } of cases) {
    const call = build();
    const result = pair(call);
    assert.equal(result.status, "unknown", name);
    assert.equal(result.reason, reason, name);
    assert.deepEqual(pairDirs(call.expect.pairId), [], name);
  }
});

test("the round a pair expects is the coordinator's whole line, and a broken one is a call error", () => {
  const created = namespace();
  const args = [
    "pair",
    "--slot-a",
    created.slots.A,
    "--slot-b",
    created.slots.B,
    "--expect-pair-id",
    created.pairId,
    "--expect-candidate",
    SHA,
    "--expect-round",
  ];
  for (const broken of [
    "attempt=2/5 deep_reads=1 fragment=stage",
    "Round: attempt=6/5 deep_reads=1 fragment=stage",
  ]) {
    const result = run([...args, broken]);
    assert.equal(result.status, 2, broken);
    assert.equal(result.stdout, "", broken);
  }
  assert.deepEqual(pairDirs(created.pairId), []);
});

test("slot B learns no path of slot A or of the pair before its own report is staged", () => {
  // §A-REVIEW-02 makes the pair's independence instructional under one OS
  // account, so the only thing a tool can hold is that nothing it prints for
  // slot B names slot A or a pair directory.
  const created = namespace();
  const slotA = created.slots.A;
  stageSlot(created, "A", { dispatch: "ctx_a", vendor: "anthropic" });
  const stagedB = stageSlot(created, "B", { dispatch: "ctx_b", vendor: "openai" });
  const shownB = preview({ slotDir: created.slots.B, slot: "B" });
  for (const output of [JSON.stringify(stagedB), shownB.line]) {
    assert.equal(output.includes(slotA), false, output);
    assert.equal(output.includes(`${created.pairId}-pair`), false, output);
  }
  const brief = readFileSync(join(ROOT, "shared", "references", "review-brief.md"), "utf8");
  const skill = readFileSync(join(ROOT, "src", "skills", "mo-review-orca", "SKILL.md"), "utf8");
  const boundary = readFileSync(
    join(ROOT, "docs", "architecture", "review-ensemble-boundary.md"),
    "utf8",
  );
  for (const [name, text] of [
    ["review-brief", brief],
    ["mo-review-orca", skill],
  ]) {
    const flat = text.replace(/\s+/gu, " ");
    assert.match(flat, /`Body-File: <slot dir>\/slot-<a\|b>-r<round>-d<n>\.md`/u, name);
    assert.match(flat, /never names slot A's directory or the pair directory/u, name);
  }
  const flat = boundary.replace(/\s+/gu, " ");
  assert.match(flat, /независимость участников пары инструкционная/u);
  assert.match(flat, /Удалённый хост сам по себе изоляцию не доказывает/u);
});
