/**
 * Hold the review pair's resource rules: which slot is still hot, which
 * worktree is provably this coordinator's to release, and when a fresh deep
 * pair may start at all.
 *
 * Protects §A-SESSION-01 and §A-REVIEW-02.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  HOT_AGE_MS,
  deepPairDecision,
  parseResourceMarker,
  releaseDecision,
  resourceComment,
  slotHot,
} from "../shared/scripts/mo-review-resource.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(ROOT, "shared", "scripts", "mo-review-resource.mjs");
const SHA = "c".repeat(40);
const ready = { alive: true, ready: true, composerEmpty: true };
const minute = 60_000;

test("hot(slot) is one formula: ready, and young or proven small", () => {
  const cases = [
    // A young slot is hot whatever its context says, including nothing.
    [{ ageMs: 10 * minute, context: { kind: "absolute", used: 900_000 } }, true, "age"],
    [{ ageMs: 59 * minute, context: { kind: "unknown" } }, true, "age"],
    // An old slot is hot only on a proven small context.
    [{ ageMs: HOT_AGE_MS, context: { kind: "absolute", used: 100_000 } }, true, "context"],
    [{ ageMs: 2 * HOT_AGE_MS, context: { kind: "absolute", used: 100_001 } }, false, "cold"],
    [
      { ageMs: 2 * HOT_AGE_MS, context: { kind: "percent", usedPercent: 30, window: 272_000 } },
      true,
      "context",
    ],
    // A percentage without a proven window, or a truncated indicator, is unknown.
    [{ ageMs: 2 * HOT_AGE_MS, context: { kind: "percent", usedPercent: 3 } }, false, "cold"],
    [{ ageMs: 2 * HOT_AGE_MS, context: { kind: "absolute", used: Number.NaN } }, false, "cold"],
    // An unknown age is not young.
    [{ ageMs: undefined, context: { kind: "unknown" } }, false, "cold"],
  ];
  for (const [input, hot, reason] of cases) {
    const result = slotHot({ ...ready, ...input });
    assert.equal(result.hot, hot, JSON.stringify(input));
    assert.equal(result.reason, reason, JSON.stringify(input));
  }
  // Readiness is a precondition, not a tiebreaker.
  for (const missing of ["alive", "ready", "composerEmpty"]) {
    const result = slotHot({ ...ready, [missing]: undefined, ageMs: minute });
    assert.deepEqual([result.hot, result.reason], [false, "not_ready"], missing);
  }
});

test("a new deep pair mid-remediation needs one recorded closed reason", () => {
  assert.equal(deepPairDecision({ phase: "first" }).allowed, true);
  assert.equal(deepPairDecision({ phase: "final" }).allowed, true);
  for (const reason of [undefined, "none", "fresh_eyes", "both_slots_unavailable"]) {
    assert.deepEqual(deepPairDecision({ phase: "remediation", reason }), {
      allowed: false,
      reason: "no_recorded_reason",
    });
  }
  for (const reason of [
    "state_transfer_impossible",
    "hypothesis_stuck",
    "requirements_conflict",
    "owner_request",
  ]) {
    assert.equal(deepPairDecision({ phase: "remediation", reason }).allowed, true, reason);
  }
});

const comment = resourceComment({
  pair: "mo-review-0a1b2c-XyZ123",
  slot: "A",
  candidate: SHA,
  project: "proj-1",
  worktree: "wt-7",
  feature: "all-open-issues",
}).text;

const owned = {
  comment,
  worktreeId: "wt-7",
  project: "proj-1",
  sameGitDir: true,
  projectRegistered: true,
  bindingsProven: true,
  liveSession: false,
  coordinatorCheckout: false,
  clean: true,
  dependency: false,
  head: SHA,
  nextCandidate: "d".repeat(40),
};

test("the marker is the first comment line and the second line is for a human", () => {
  const [marker, human] = comment.split("\n");
  assert.equal(
    marker,
    `MO-REVIEW-RESOURCE/1 pair=mo-review-0a1b2c-XyZ123 slot=A candidate=${SHA} project=proj-1 worktree=wt-7`,
  );
  assert.equal(human, `all-open-issues review slot A @ ${SHA.slice(0, 12)}`);
  assert.equal(parseResourceMarker(comment).worktree, "wt-7");
  assert.equal(parseResourceMarker(`note\n${marker}`), null);
  assert.equal(parseResourceMarker(marker.replace(SHA, SHA.slice(0, 12))), null);
});

test("a worktree id whose path holds spaces is written, read and matched exactly", () => {
  // Orca ids are `<repo>::<absolute path>`, and a home directory may hold a space.
  const write = (worktree) =>
    resourceComment({
      pair: "review-space",
      slot: "A",
      candidate: SHA,
      project: "proj-1",
      worktree,
      feature: "all-open-issues",
    });
  for (const worktree of [
    "repo-1::/home/Alex Smith/orca/slot-a",
    "repo-1::/tmp/Acme  Team/slot-a",
  ]) {
    const { text } = write(worktree);
    assert.equal(parseResourceMarker(text).worktree, worktree);
    const facts = {
      ...owned,
      comment: text,
      worktreeId: worktree,
      head: "d".repeat(40),
      nextCandidate: SHA,
    };
    assert.deepEqual(releaseDecision(facts), { action: "release", reason: "owned_orphan" });
    assert.deepEqual(releaseDecision({ ...facts, head: SHA }), {
      action: "reuse",
      reason: "exact_placement",
    });
    assert.deepEqual(
      releaseDecision({ ...facts, worktreeId: worktree.replace("slot-a", "slot-b") }),
      { action: "keep", reason: "marker_mismatch" },
    );
  }
  assert.deepEqual(write("repo-1::/tmp/a\nMO-REVIEW-RESOURCE/1 x"), { error: "invalid_marker" });
  assert.deepEqual(write("repo-1::/tmp/a\rb"), { error: "invalid_marker" });
  assert.equal(parseResourceMarker(comment).worktree, "wt-7");
  const cli = spawnSync(
    process.execPath,
    [
      join(ROOT, "skills", "mo-review-orca", "scripts", "mo-review-resource.mjs"),
      "comment",
      "--pair",
      "review-space",
      "--slot",
      "A",
      "--candidate",
      SHA,
      "--project",
      "proj-1",
      "--worktree",
      "repo-1::/home/Alex Smith/orca/slot-a",
      "--feature",
      "all-open-issues",
    ],
    { encoding: "utf8" },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /worktree=repo-1::\/home\/Alex Smith\/orca\/slot-a\n/u);
});

test("only a proven owned orphan is released, and everything uncertain stays", () => {
  assert.deepEqual(releaseDecision(owned), { action: "release", reason: "owned_orphan" });
  assert.deepEqual(releaseDecision({ ...owned, nextCandidate: SHA }), {
    action: "reuse",
    reason: "exact_placement",
  });
  // The regression: a marker copied onto another worktree is not ownership.
  assert.deepEqual(releaseDecision({ ...owned, worktreeId: "wt-8" }), {
    action: "keep",
    reason: "marker_mismatch",
  });
  assert.equal(releaseDecision({ ...owned, comment: "somebody's notes" }).reason, "foreign");
  assert.equal(releaseDecision({ ...owned, sameGitDir: false }).reason, "foreign");
  assert.equal(releaseDecision({ ...owned, project: "proj-2" }).reason, "foreign");
  assert.equal(releaseDecision({ ...owned, clean: false }).reason, "dirty");
  assert.equal(releaseDecision({ ...owned, dependency: true }).reason, "in_use");
  assert.equal(releaseDecision({ ...owned, coordinatorCheckout: true }).reason, "in_use");
  assert.deepEqual(releaseDecision({ ...owned, liveSession: true }), {
    action: "check_hot",
    reason: "live_session",
  });
  for (const fact of ["sameGitDir", "bindingsProven", "liveSession", "clean", "dependency"]) {
    assert.deepEqual(
      releaseDecision({ ...owned, [fact]: undefined }),
      { action: "keep", reason: "ownership_unknown" },
      fact,
    );
  }
  assert.equal(releaseDecision({ ...owned, bindingsProven: false }).reason, "ownership_unknown");
});

test("the CLI prints one typed line per question", () => {
  const run = (args, input) =>
    spawnSync(process.execPath, [HELPER, ...args], { input, encoding: "utf8" });
  const hot = run(["hot", "--alive", "yes", "--ready", "yes", "--composer", "empty"]);
  assert.equal(hot.status, 1);
  assert.equal(hot.stdout, "MO-REVIEW-SLOT/1 hot=no context=unknown reason=cold\n");
  const young = run([
    "hot",
    "--alive",
    "yes",
    "--ready",
    "yes",
    "--composer",
    "empty",
    "--age-ms",
    "60000",
  ]);
  assert.equal(young.status, 0);
  // An empty or non-numeric observation is unknown, never age zero or zero tokens.
  const ready = ["hot", "--alive", "yes", "--ready", "yes", "--composer", "empty"];
  for (const extra of [
    ["--age-ms", ""],
    ["--age-ms", " "],
    ["--age-ms", "7200000", "--context-tokens", ""],
    ["--age-ms", "7200000", "--context-percent", "", "--context-window", "258000"],
    ["--age-ms", "7200000", "--context-percent", "1", "--context-window", ""],
  ]) {
    const empty = run([...ready, ...extra]);
    assert.equal(empty.status, 1, extra.join(" "));
    assert.equal(
      empty.stdout,
      "MO-REVIEW-SLOT/1 hot=no context=unknown reason=cold\n",
      extra.join(" "),
    );
  }
  const released = run(["release"], JSON.stringify({ ...owned, worktreeId: "wt-8" }));
  assert.equal(
    released.stdout,
    'MO-REVIEW-RESOURCE/1 action=keep reason=marker_mismatch worktree="wt-8"\n',
  );
  const deep = run(["deep", "--phase", "remediation", "--reason", "none"]);
  assert.equal(deep.status, 1);
  assert.equal(deep.stdout, "MO-REVIEW-DEEP/1 allowed=no reason=no_recorded_reason\n");
});

test("the coordinator is told to use these answers, not to reason past them", () => {
  const flat = (path) => readFileSync(join(ROOT, path), "utf8").replace(/\s+/gu, " ");
  const skill = flat("src/skills/mo-review-orca/SKILL.md");
  const method = flat("shared/references/methodology.md");
  for (const text of [skill, method]) {
    assert.match(
      text,
      /hot\(slot\) = alive_and_ready\(slot\) AND \(age < 1h OR context_proven_small\(slot\)\)/u,
    );
    assert.match(text, /state_transfer_impossible/u);
    assert.match(text, /`attempt <n>\/5` and `deep_reads <m>`/u);
  }
  assert.match(skill, /scripts\/mo-review-resource\.mjs release/u);
  assert.match(skill, /Never pass `--activate`/u);
  assert.match(skill, /Only after this pair returned two PASS reports on one SHA/u);
  assert.match(skill, /Review-Preview-Ack: <pair_id> <slot>=<bytes>/u);
  // The old rule closed a hot pair before the final proof regardless of result.
  assert.doesNotMatch(skill, /Before the one final same-SHA proof, release exact-owned/u);
  assert.doesNotMatch(skill, /git worktree prune` is (?:allowed|used)/u);
});

test("a comment call missing an identity is refused, never written with undefined", () => {
  const full = {
    pair: "review-run",
    slot: "A",
    candidate: SHA,
    project: "proj-1",
    worktree: "repo-1::/tmp/Acme Team/slot-a",
    feature: "all-open-issues",
  };
  const argsOf = (values) =>
    Object.entries(values).flatMap(([name, value]) => [`--${name}`, value]);
  const copies = [
    HELPER,
    ...["mo-review-orca", "mo-orchestrate-orca", "mo-convergence"].map((skill) =>
      join(ROOT, "skills", skill, "scripts", "mo-review-resource.mjs"),
    ),
  ];
  for (const helper of copies) {
    const call = (values) =>
      spawnSync(process.execPath, [helper, "comment", ...argsOf(values)], { encoding: "utf8" });
    const whole = call(full);
    assert.equal(whole.status, 0, whole.stderr);
    assert.equal(whole.stdout, resourceComment(full).text, helper);
    const without = (...names) =>
      Object.fromEntries(Object.entries(full).filter(([name]) => !names.includes(name)));
    for (const name of Object.keys(full)) {
      const refused = call(without(name));
      assert.equal(refused.status, 2, `${helper} without --${name}`);
      assert.equal(refused.stdout, "", `${helper} without --${name}`);
      assert.match(refused.stderr, new RegExp(`--${name}\\b`, "u"), name);
      assert.match(refused.stderr, /^usage:/mu, name);
    }
    const three = call(without("pair", "project", "worktree"));
    assert.equal(three.status, 2, helper);
    assert.match(three.stderr, /comment needs --pair, --project, --worktree/u, helper);
  }
  for (const name of ["pair", "project", "worktree"]) {
    const rest = Object.fromEntries(Object.entries(full).filter(([key]) => key !== name));
    assert.deepEqual(resourceComment(rest), { error: "invalid_marker" }, name);
    assert.deepEqual(resourceComment({ ...full, [name]: null }), { error: "invalid_marker" }, name);
  }
});

test("every command refuses a flag it does not read, and deep needs a known phase", () => {
  const copies = [
    HELPER,
    ...["mo-review-orca", "mo-orchestrate-orca", "mo-convergence"].map((skill) =>
      join(ROOT, "skills", skill, "scripts", "mo-review-resource.mjs"),
    ),
  ];
  const hot = ["hot", "--alive", "yes", "--ready", "yes", "--composer", "empty"];
  const identity = [
    "--pair",
    "review-run",
    "--slot",
    "A",
    "--candidate",
    SHA,
    "--project",
    "proj-1",
    "--worktree",
    "repo-1::/tmp/slot-a",
    "--feature",
    "all-open-issues",
  ];
  for (const helper of copies) {
    const call = (args) => spawnSync(process.execPath, [helper, ...args], { encoding: "utf8" });
    for (const [args, named] of [
      [[...hot, "--age", "600000"], /--age\b/u],
      [[...hot, "--age-ms", "600000", "--context-token", "5000"], /--context-token\b/u],
      [["deep"], /deep needs --phase/u],
      [["deep", "--stage", "final"], /--stage\b/u],
      [["deep", "--phase", "Final"], /--phase must be one of first\|final\|remediation/u],
      [["comment", ...identity, "--features", "x"], /--features\b/u],
    ]) {
      const refused = call(args);
      assert.equal(refused.status, 2, `${helper} ${args.join(" ")}`);
      assert.equal(refused.stdout, "", `${helper} ${args.join(" ")}`);
      assert.match(refused.stderr, named, args.join(" "));
      assert.match(refused.stderr, /^usage:/mu, args.join(" "));
    }
    const young = call([...hot, "--age-ms", "600000", "--context-tokens", "5000"]);
    assert.match(young.stdout, /^MO-REVIEW-SLOT\/1 hot=yes /u, young.stderr);
    assert.match(call(["deep", "--phase", "final"]).stdout, /^MO-REVIEW-DEEP\/1 allowed=yes /u);
    assert.equal(call(["comment", ...identity]).status, 0, helper);
  }
});

test("every input the helper reads is printed by --help and stated in the calling skill", () => {
  // The calling skill named the commands but not their inputs, so a coordinator
  // could form the call only from the source, and a guessed key or flag kept an
  // owned worktree as ownership_unknown or replaced a hot slot as not ready.
  const keys = [
    "comment",
    "worktreeId",
    "project",
    "sameGitDir",
    "projectRegistered",
    "bindingsProven",
    "liveSession",
    "coordinatorCheckout",
    "clean",
    "dependency",
    "head",
    "nextCandidate",
  ];
  const flags = [
    "--pair",
    "--slot",
    "--candidate",
    "--project",
    "--worktree",
    "--feature",
    "--alive",
    "--ready",
    "--composer",
    "--age-ms",
    "--context-tokens",
    "--context-percent",
    "--context-window",
  ];
  const help = spawnSync(process.execPath, [HELPER, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  for (const skillPath of [
    "src/skills/mo-review-orca/SKILL.md",
    "skills/mo-review-orca/SKILL.md",
  ]) {
    const skill = readFileSync(join(ROOT, skillPath), "utf8");
    for (const key of keys) {
      assert.match(help.stdout, new RegExp(`"${key}"`, "u"), key);
      assert.match(skill, new RegExp(`"${key}"`, "u"), `${skillPath} ${key}`);
    }
    // A copied skeleton must not carry the booleans that authorize release.
    for (const key of keys.slice(3, 10)) {
      assert.match(skill, new RegExp(`"${key}": <bool>`, "u"), `${skillPath} ${key}`);
      assert.doesNotMatch(
        skill,
        new RegExp(`"${key}": (?:true|false)`, "u"),
        `${skillPath} ${key}`,
      );
    }
    for (const flag of flags) {
      assert.ok(help.stdout.includes(`${flag} `), flag);
      assert.ok(skill.includes(`${flag} `), `${skillPath} ${flag}`);
    }
  }
  // An idle session Orca cannot verify is not a dead one: the slot's own
  // terminal and screen answer --alive, so a young slot is not replaced on it.
  // Every shipped skill that asks the helper whether a slot is hot carries
  // that definition, so a skill added later cannot call hot without it.
  const hotCallers = readdirSync(join(ROOT, "skills")).filter((name) => {
    const skill = join(ROOT, "skills", name, "SKILL.md");
    return (
      existsSync(join(ROOT, "skills", name, "scripts", "mo-review-resource.mjs")) &&
      readFileSync(skill, "utf8").replace(/\s+/gu, " ").includes("mo-review-resource.mjs hot")
    );
  });
  assert.deepEqual(hotCallers.sort(), ["mo-convergence", "mo-review-orca"]);
  for (const name of hotCallers) {
    for (const root of ["skills", "src/skills"]) {
      const skill = readFileSync(join(ROOT, root, name, "SKILL.md"), "utf8");
      assert.ok(skill.replace(/\s+/gu, " ").includes("answers `--alive`"), `${root}/${name}`);
      assert.ok(skill.includes("(references/orca-mechanics.md)"), `${root}/${name}`);
    }
    const mechanics = readFileSync(
      join(ROOT, "skills", name, "references", "orca-mechanics.md"),
      "utf8",
    ).replace(/\s+/gu, " ");
    assert.match(
      mechanics,
      /liveness `unverifiable` on an idle session is missing evidence, not death/u,
      name,
    );
    assert.match(mechanics, /`--alive yes` means the slot's own recorded terminal/u, name);
  }
  // An UNKNOWN for missing grounding says what was missing, or the caller
  // cannot supply it without a second question.
  for (const path of [
    "shared/references/review-protocol.md",
    "skills/mo-reviewer/references/review-protocol.md",
  ]) {
    const flat = readFileSync(join(ROOT, path), "utf8").replace(/\s+/gu, " ");
    assert.match(flat, /its `Unknown-Account` names each missing input/u, path);
  }
  // A missing observation is a call error with the usage, never a verdict.
  const bare = spawnSync(process.execPath, [HELPER, "hot", "--age-ms", "60000"], {
    encoding: "utf8",
  });
  assert.equal(bare.status, 2);
  assert.equal(bare.stdout, "");
  assert.match(bare.stderr, /^hot needs --alive, --ready, --composer\nusage: /u);
  for (const input of ["", "[]", "null", "not json"]) {
    const release = spawnSync(process.execPath, [HELPER, "release"], { input, encoding: "utf8" });
    assert.equal(release.status, 2, input);
    assert.match(release.stderr, /usage: mo-review-resource\.mjs/u, input);
  }
});
