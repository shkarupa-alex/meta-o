/**
 * Hold the validator that decides whether a review actually arrived.
 *
 * Protects §A-REVIEW-04.
 */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

import {
  FLAGS,
  businessQuestion,
  namespace,
  publicSummary,
  reportLine,
  validateReport,
} from "../shared/scripts/mo-review-report.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(ROOT, "shared", "scripts", "mo-review-report.mjs");
const SHA = "a".repeat(40);
const ROUND = { attempt: 1, limit: 5, deepReads: 1, fragment: "f1" };
const ROUND_LINE = "Round: attempt=1/5 deep_reads=1 fragment=f1";
const ROUND_ARGS = [
  "--attempt",
  "1",
  "--attempt-limit",
  "5",
  "--deep-reads",
  "1",
  "--fragment",
  "f1",
];
const spaces = [];
after(() => {
  for (const path of spaces) rmSync(path, { recursive: true, force: true });
});

function space() {
  const path = mkdtempSync(join(tmpdir(), "mo-review-report-"));
  spaces.push(path);
  return path;
}

function report({
  verdict = "PASS",
  counts = "P0=0 P1=0 P2=0 P3=0",
  index = "",
  findings = "",
  account = "",
  mode = "deep",
  execution = "ctx_fixture",
  candidate = SHA,
} = {}) {
  return (
    `Review-Execution: ${execution}\nCandidate: ${candidate}\n` +
    `Mode: requested=${mode} effective=${mode}\n${ROUND_LINE}\nDelegation: none\n` +
    `Verdict: ${verdict}\n` +
    `Counts: ${counts}\n\n${index}Evidence report\nGrounding\nintent and clean SHA\n` +
    `Scope and checks\nread-only diff and tests\nFindings\n${findings}${account}` +
    `Unknowns\nnone\nResidual risks\nnone\nEnd-Review: ${execution}\n`
  );
}

const context = (mode = "deep") => ({
  execution: "ctx_fixture",
  candidate: SHA,
  requestedMode: mode,
  effectiveMode: mode,
  round: ROUND,
});

const reasonOf = (text, mode = "deep") => validateReport(text, context(mode)).reason;

test("each verdict validates in its own complete shape", () => {
  const pass = validateReport(report(), context());
  assert.equal(pass.status, "valid");
  assert.deepEqual(pass.counts, [0, 0, 0, 0]);
  assert.equal(pass.effective, "deep");
  assert.equal(pass.bytes, Buffer.byteLength(report()));

  const findings = validateReport(
    report({
      verdict: "FINDINGS",
      counts: "P0=0 P1=0 P2=1 P3=0",
      index: "F-001 [P2] Broken boundary.\n\n",
      findings: "F-001\n[P2] confirmed; causal path, impact, location and proof.\n",
    }),
    context(),
  );
  assert.equal(findings.status, "valid");
  assert.equal(findings.verdict, "FINDINGS");

  const unknown = validateReport(
    report({
      verdict: "UNKNOWN",
      account:
        "Unknown-Account\nUnknown-Reason: review_incomplete\n" +
        "covered scope and blocking public observation\n",
    }),
    context(),
  );
  assert.equal(unknown.status, "valid");
});

test("a key repeated inside a finding body is prose, not a second finding", () => {
  // The reviewer restating its own index line while explaining the finding is
  // ordinary writing; treating it as structure would reject a correct report.
  const text = report({
    verdict: "FINDINGS",
    counts: "P0=0 P1=0 P2=0 P3=1",
    index: "F-001 [P3] Guard is evadable.\n\n",
    findings: "F-001\n[P3] confirmed.\nF-001 [P3] Guard is evadable.\nProof and direction.\n",
  });
  assert.equal(validateReport(text, context()).status, "valid");
});

test("a marker inside a container stays body evidence", () => {
  for (const container of [
    "~~~~text\nFindings\nF-002\nResidual risks\nEnd-Review: ctx_fake\n~~~~\n",
    "    Unknowns\n    End-Review: ctx_fake\n",
    "> Evidence report\n> Unknown-Account\n",
    "- Counts: P0=9 P1=9 P2=9 P3=9\n- Evidence report\n",
  ]) {
    const text = report({
      verdict: "FINDINGS",
      counts: "P0=0 P1=0 P2=1 P3=0",
      index: "F-001 [P2] Quoted markers are body bytes.\n\n",
      findings: `F-001\n[P2] confirmed.\n\n${container}\n`,
    });
    assert.equal(validateReport(text, context()).status, "valid", container);
  }
});

test("the index holds entries and nothing else", () => {
  // Between the counts and `Evidence report` a container or loose prose is not
  // an entry the counts can answer for. The reviewer validates the exact bytes
  // before sending, so refusing it costs a correction, not a review.
  for (const intruder of [
    "> diagnostic note\n\n",
    "- diagnostic note\n\n",
    "```text\nF-999 [P0] not a finding\n```\n\n",
    "    F-999 [P0] indented, so not a finding\n\n",
  ]) {
    assert.equal(reasonOf(report({ index: intruder })), "index_layout", intruder);
  }
  assert.equal(
    reasonOf(report({ index: "Unknown-Reason: review_incomplete\n\n" })),
    "index_key_order",
  );
  assert.equal(reasonOf(report({ index: "F-002 [P2] out of order.\n\n" })), "index_key_order");
  // A body quoted inside a container answers no key: only top-level lines do.
  const quoted = report({
    verdict: "FINDINGS",
    counts: "P0=0 P1=0 P2=1 P3=0",
    index: "F-001 [P2] a real finding.\n\n",
    findings: "> F-001 [P2] quoted, not a body.\n\n",
  });
  assert.equal(reasonOf(quoted), "index_body_mismatch");
});

test("a wrapped summary is one entry, and two rows are two", () => {
  // Reviewers write the index as consecutive rows and formatters wrap long
  // sentences. Both shapes are ordinary, and both have to keep meaning what
  // their author meant.
  const wrapped = report({
    verdict: "FINDINGS",
    counts: "P0=0 P1=0 P2=1 P3=0",
    index:
      "F-001 [P2] The guard is evadable when the summary is long enough to\nwrap onto a second row.\n\n",
    findings: "F-001\n[P2] confirmed.\nProof and direction.\n",
  });
  assert.equal(validateReport(wrapped, context()).status, "valid");

  const two = report({
    verdict: "FINDINGS",
    counts: "P0=0 P1=0 P2=2 P3=0",
    index:
      "F-001 [P2] The first finding, whose summary also happens to\nwrap.\nF-002 [P2] The second finding, on its own row.\n\n",
    findings: "F-001\n[P2] one.\nF-002\n[P2] two.\n",
  });
  assert.equal(validateReport(two, context()).status, "valid");

  // A paragraph that does not open with a key is still malformed: that is the
  // difference between a continuation and prose nobody keyed.
  assert.equal(
    reasonOf(
      report({
        verdict: "FINDINGS",
        counts: "P0=0 P1=0 P2=1 P3=0",
        index: "A note before the index.\nF-001 [P2] First.\n\n",
        findings: "F-001\n[P2] one.\n",
      }),
    ),
    "index_key_order",
  );
});

test("a report that answers a different call is rejected before its body", () => {
  assert.equal(reasonOf(report({ execution: "ctx_stale" })), "execution_mismatch");
  assert.equal(reasonOf(report({ candidate: "b".repeat(40) })), "candidate_mismatch");
  assert.equal(reasonOf(report({ mode: "fast" })), "mode_mismatch");
  // Self-escalation is the reviewer's to make, so an unstated expectation
  // accepts any valid effective mode while still requiring the requested one.
  const escalated = report().replace(
    "Mode: requested=deep effective=deep",
    "Mode: requested=fast effective=deep",
  );
  assert.equal(
    validateReport(escalated, { ...context("fast"), effectiveMode: undefined }).effective,
    "deep",
  );
  // A reviewer may raise its coverage but never lower it, named or not.
  for (const [requested, effective] of [
    ["deep", "fast"],
    ["deep", "follow_up"],
    ["follow_up", "fast"],
    ["fast", "follow_up"],
  ]) {
    const lowered = report().replace(
      "Mode: requested=deep effective=deep",
      `Mode: requested=${requested} effective=${effective}`,
    );
    const expected = { ...context(requested), effectiveMode: undefined };
    assert.equal(validateReport(lowered, expected).reason, "mode_mismatch", effective);
  }
});

test("each structural failure names itself", () => {
  const cases = [
    [report().replace(/End-Review:.+/u, ""), "footer_mismatch"],
    [report().replace("Delegation: none", "Delegation: subagent"), "delegation"],
    [report().replace("Verdict: PASS", "Verdict: MAYBE"), "verdict"],
    [report().replace("Review-Execution: ", "Execution: "), "header_order"],
    [report({ counts: "P0=0 P1=0 P2=1 P3=0" }), "counts_mismatch"],
    [report().replace("Grounding\nintent and clean SHA\n", "Grounding\n"), "grounding_missing"],
    [report().replace("Evidence report\n", ""), "section_missing"],
    [
      report({
        verdict: "FINDINGS",
        counts: "P0=0 P1=0 P2=2 P3=0",
        index: "F-001 [P2] First.\nF-003 [P2] Third.\n\n",
        findings: "F-001\n[P2] one.\nF-003\n[P2] three.\n",
      }),
      "index_key_order",
    ],
    [
      report({
        verdict: "FINDINGS",
        counts: "P0=0 P1=0 P2=1 P3=0",
        index: "F-001 [P2] First.\n\n",
        findings: "F-001\n",
      }),
      "index_body_mismatch",
    ],
    [report({ index: "F-001 [P2] PASS may not carry a finding.\n\n" }), "pass_not_empty"],
    [
      report({
        verdict: "UNKNOWN",
        account: "Unknown-Account\nUnknown-Reason: made_up\nstated\n",
      }),
      "unknown_reason",
    ],
    [report({ account: "Unknown-Account\nstated\n" }), "unknown_account"],
  ];
  for (const [text, reason] of cases) assert.equal(reasonOf(text), reason, reason);
});

test("every command refuses a flag it does not read, in every shipped copy", () => {
  const dir = space();
  const good = join(dir, "good.md");
  writeFileSync(good, report());
  const prepared = join(dir, "prepared.md");
  writeFileSync(prepared, report());
  const base = ["validate", "--file", good, "--dispatch", "ctx_fixture", "--candidate", SHA];
  const expected = [...base, "--requested", "deep", "--effective", "deep", ...ROUND_ARGS];
  const copies = [
    HELPER,
    ...["mo-reviewer", "mo-review-orca", "mo-orchestrate-orca"].map((skill) =>
      join(ROOT, "skills", skill, "scripts", "mo-review-report.mjs"),
    ),
  ];
  for (const helper of copies) {
    const call = (args) => spawnSync(process.execPath, [helper, ...args], { encoding: "utf8" });
    const typo = call([...expected, "--prepare", prepared]);
    assert.equal(typo.status, 2, helper);
    assert.equal(typo.stdout, "", helper);
    assert.match(typo.stderr, /validate does not take --prepare\b/u, helper);
    const spelled = call([...expected, "--prepared", prepared, "--normalisation", "final-newline"]);
    assert.equal(spelled.status, 2, helper);
    assert.equal(spelled.stdout, "", helper);
    assert.match(spelled.stderr, /--normalisation/u, helper);
    const named = call([...expected, "--prepared", prepared, "--normalization", "final-newline"]);
    assert.equal(named.status, 0, named.stderr);
    assert.match(named.stdout, /^MO-REVIEW-BODY\/1 prepared_body_identity=identical/mu, helper);
  }
});

test("an UNKNOWN keeps the findings it proved, and only a PASS must be empty", () => {
  const account =
    "Unknown-Account\nUnknown-Reason: review_incomplete\ncovered scope and the blocking observation\n";
  const unknown = report({
    verdict: "UNKNOWN",
    counts: "P0=0 P1=1 P2=0 P3=0",
    index: "F-001 [P1] The guard trusts a caller-supplied path.\n\n",
    findings: "F-001 [P1] confirmed; causal path, impact, location and proof.\n",
    account,
  });
  const valid = validateReport(unknown, context());
  assert.equal(valid.status, "valid");
  assert.equal(valid.verdict, "UNKNOWN");
  assert.deepEqual(valid.counts, [0, 1, 0, 0]);
  // The census still answers for the index, and the account is still owed.
  assert.equal(reasonOf(unknown.replace("P1=1", "P1=0")), "counts_mismatch");
  assert.equal(reasonOf(unknown.replace(account, "")), "unknown_account");
  // A keyed body the index never announced is still a stray body.
  assert.equal(
    reasonOf(unknown.replace("[P1] confirmed;", "[P2] confirmed;")),
    "index_body_mismatch",
  );
  // PASS with an indexed finding is not an empty verdict even when the counts
  // agree with the index; FINDINGS without one is a census that answers nothing.
  const pass = report({
    counts: "P0=0 P1=1 P2=0 P3=0",
    index: "F-001 [P1] A finding under a PASS.\n\n",
    findings: "F-001 [P1] confirmed.\n",
  });
  assert.equal(reasonOf(pass), "pass_not_empty");
  assert.equal(reasonOf(report({ verdict: "FINDINGS" })), "counts_mismatch");
});

test("PASS with a body is not an empty verdict", () => {
  const text = report({ findings: "F-001\n[P2] a finding under a PASS.\n" });
  assert.equal(reasonOf(text), "pass_not_empty");
});

test("the CLI answers with one line and a status a caller can branch on", () => {
  const dir = space();
  const good = join(dir, "good.md");
  writeFileSync(good, report());
  const ok = spawnSync(process.execPath, [
    HELPER,
    "validate",
    "--file",
    good,
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
    ...ROUND_ARGS,
  ]);
  assert.equal(ok.status, 0, ok.stderr.toString());
  assert.equal(
    ok.stdout.toString().trim(),
    `MO-REVIEW-REPORT/1 status=valid verdict=PASS effective=deep counts=P0=0,P1=0,P2=0,P3=0 bytes=${Buffer.byteLength(report())}`,
  );

  const bad = join(dir, "bad.md");
  writeFileSync(bad, report().replace(/End-Review:.+/u, ""));
  const malformed = spawnSync(process.execPath, [
    HELPER,
    "validate",
    "--file",
    bad,
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
    ...ROUND_ARGS,
  ]);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stdout.toString(), /status=malformed reason=footer_mismatch line=\d+/u);

  // A call error is neither a valid report nor a malformed one.
  const misuse = spawnSync(process.execPath, [HELPER, "validate", "--file", good]);
  assert.equal(misuse.status, 2);
  assert.match(
    misuse.stderr.toString(),
    /--dispatch, --candidate, --requested, --attempt, --attempt-limit, --deep-reads, --fragment are required/u,
  );
});

test("a source that is not a plain file is refused rather than followed", () => {
  const dir = space();
  const real = join(dir, "real.md");
  writeFileSync(real, report());
  const link = join(dir, "link.md");
  symlinkSync(real, link);
  const followed = spawnSync(process.execPath, [
    HELPER,
    "validate",
    "--file",
    link,
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
    ...ROUND_ARGS,
  ]);
  assert.equal(followed.status, 1);
  assert.match(followed.stdout.toString(), /reason=symlink/u);

  const directory = spawnSync(process.execPath, [
    HELPER,
    "validate",
    "--file",
    dir,
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
    ...ROUND_ARGS,
  ]);
  assert.equal(directory.status, 1);
  assert.match(directory.stdout.toString(), /reason=not_regular_file/u);
});

test("bytes that are not UTF-8 are not a report", () => {
  const dir = space();
  const path = join(dir, "latin.md");
  writeFileSync(path, Buffer.concat([Buffer.from(report(), "utf8"), Buffer.from([0xff, 0xfe])]));
  const result = spawnSync(process.execPath, [
    HELPER,
    "validate",
    "--file",
    path,
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
    ...ROUND_ARGS,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stdout.toString(), /reason=invalid_utf8/u);
});

test("the reported line states every field a caller reads", () => {
  assert.equal(
    reportLine({ status: "malformed", reason: "header_order", line: 3 }),
    "MO-REVIEW-REPORT/1 status=malformed reason=header_order line=3",
  );
});

test("the brief template carries every field and no placeholder", () => {
  const brief = readFileSync(join(ROOT, "shared", "references", "review-brief.md"), "utf8");
  for (const field of [
    "Target",
    "Intent",
    "Scope",
    "Mode",
    "Placement",
    "Environment",
    "Constraints",
    "Ownership",
    "Acceptance",
    "Report",
    "Methodology-Friction",
    "Cleanup",
  ]) {
    assert.match(brief, new RegExp(`\`${field}\``, "u"), `${field} is not in the template`);
  }
  assert.match(brief, /copied verbatim/u);
  assert.match(brief, /a brief containing `<sha>` or `<range>` is not a\s*brief/u);
});

test("a brief may only cite what the candidate can reach", () => {
  // The cost is one reviewer turn when it asks, and an invented section when
  // it does not. Both documents that instruct a caller have to say so.
  const brief = readFileSync(join(ROOT, "shared", "references", "review-brief.md"), "utf8");
  const skill = readFileSync(join(ROOT, "src", "skills", "mo-review-orca", "SKILL.md"), "utf8");
  for (const document of [brief, skill]) {
    assert.match(document, /`\.orca\/`/u);
    assert.match(document, /`docs\/specifications\/`/u);
    assert.match(document, /invented section/u);
  }
});

test("a public summary carries counts and never a finding", () => {
  const line = publicSummary({
    candidate: SHA,
    verdict: "FINDINGS",
    counts: [
      [0, 1, 2, 0],
      [0, 0, 2, 1],
    ],
  });
  assert.equal(line, `Review-Pair-Verdict/1 candidate=${SHA} verdict=FINDINGS P0=0 P1=1 P2=4 P3=1`);
  // Two reviewers finding the same thing stay two findings: summing is the
  // whole operation, and deduplicating would be a judgement made here.
  assert.doesNotMatch(line, /F-\d{3}/u);
});

test("the one permitted business question names its slot, its key and where to read the rest", () => {
  const asked = businessQuestion({
    slot: "A",
    vendor: "claude",
    indexLine: "F-002 [P2] The retention window contradicts the stated guarantee.",
    path: "/tmp/mo-review-x/A-claude.md",
    question: "Which of the two is the product promise?",
    hypothesis: "the stated guarantee, and the window is the defect",
  });
  assert.equal(asked.status, "asked");
  // mo-vocabulary-ok: a report-local finding key is fixture data, not a work item.
  assert.match(asked.text, /^A:F-002 \(claude\) F-002 \[P2\] /u);
  assert.match(asked.text, /Full report: \/tmp\/mo-review-x\/A-claude\.md$/mu);
  // A line that is not an index line cannot be projected: there is nothing to
  // key it by, and paraphrasing it here is exactly what is forbidden.
  assert.equal(
    businessQuestion({
      slot: "A",
      vendor: "claude",
      indexLine: "the reviewer thinks retention is wrong",
      path: "/tmp/x",
      question: "?",
      hypothesis: "?",
    }).reason,
    "index_line",
  );
});

// Every `mo-review-report.mjs <command> …` call a document writes, as the
// tokens after the command name: one entry per call, continuation lines joined.
function documentedCalls(text) {
  const calls = [];
  const visit = (node) => {
    if (node.type === "code" || node.type === "inlineCode") {
      const value = node.value
        .replace(/\\\n/gu, " ")
        .replace(/\n/gu, node.type === "code" ? "\n" : " ");
      for (const line of value.split("\n")) {
        for (const match of line.matchAll(/mo-review-report\.mjs"?[ \t]+([a-z]+)([^\n]*)/gu)) {
          calls.push({ command: match[1], words: match[2].split(/[ \t]+/u).filter(Boolean) });
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(fromMarkdown(text));
  return calls;
}

// The flags a call names, or the word that stands for flags it does not name.
function namedFlags({ words }) {
  const flags = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index].replace(/^\[|\]$/gu, "");
    if (word === "<" || word === "|" || word === ">" || word.startsWith("<<")) break;
    if (!word.startsWith("--")) return { flags, unnamed: word };
    flags.push(word.slice(2));
    if (words[index + 1] !== undefined && !words[index + 1].replace(/^\[/u, "").startsWith("--"))
      index += 1;
    // A placeholder of several words, `<slot A dir>`, is one value.
    if (/^'?<[^>]*$/u.test(words[index]))
      while (index + 1 < words.length && !words[index].includes(">")) index += 1;
  }
  return { flags };
}

// `--b-…` and `--<a|b>-…` name a family of flags; each member must exist.
function flagAccepted(command, flag) {
  const accepted = FLAGS[command];
  const family = /^(?:<([a-z|]+)>|([a-z]+))-…$/u.exec(flag);
  if (family === null) return accepted.includes(flag);
  const prefixes = (family[1] ?? family[2]).split("|");
  return prefixes.every((prefix) => accepted.some((name) => name.startsWith(`${prefix}-`)));
}

test("every documented helper call names only flags its command takes", () => {
  const listed = spawnSync("git", ["ls-files", "*.md"], { cwd: ROOT, encoding: "utf8" });
  const documents = listed.stdout
    .split("\n")
    .filter((path) => path !== "" && !/^(?:skills|docs\/references)\//u.test(path));
  const seen = new Set();
  for (const path of documents) {
    for (const call of documentedCalls(readFileSync(join(ROOT, path), "utf8"))) {
      const where = `${path}: ${call.command} ${call.words.join(" ")}`;
      assert.ok(Object.hasOwn(FLAGS, call.command), `unknown command in ${where}`);
      const { flags, unnamed } = namedFlags(call);
      assert.equal(unnamed, undefined, `a placeholder stands for unnamed flags in ${where}`);
      for (const flag of flags)
        assert.ok(flagAccepted(call.command, flag), `--${flag} in ${where}`);
      seen.add(call.command);
    }
  }
  // The skill texts show these calls; a parser that found none would pass vacuously.
  for (const command of [
    "namespace",
    "template",
    "prepare",
    "validate",
    "stage",
    "pair",
    "preview",
    "ack",
  ]) {
    assert.ok(seen.has(command), command);
  }
  assert.deepEqual(namedFlags({ words: ["--dir", "<ns>", "<validate", "flags>"] }), {
    flags: ["dir"],
    unnamed: "<validate",
  });
});

test("the stage call the skill documents is accepted, and validate-only flags are refused", () => {
  const created = namespace();
  spaces.push(created.slots.A, created.slots.B);
  const valid = report();
  const base = ["stage", "--slot-dir", created.slots.A, "--slot", "A", "--pair-id", created.pairId];
  const expected = [
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
    "--vendor",
    "openai",
    ...ROUND_ARGS,
    "--effective",
    "deep",
    "--file",
    "-",
  ];
  const extra = [
    "--prepared",
    join(created.slots.A, "body.md"),
    "--normalization",
    "final-newline",
  ];
  const refused = spawnSync(process.execPath, [HELPER, ...base, ...expected, ...extra], {
    input: valid,
    encoding: "utf8",
  });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /stage does not take --prepared, --normalization/u);
  assert.deepEqual(readdirSync(created.slots.A), []);
  const staged = spawnSync(process.execPath, [HELPER, ...base, ...expected], {
    input: valid,
    encoding: "utf8",
  });
  assert.equal(staged.status, 0, staged.stderr);
  assert.match(staged.stdout, /^MO-REVIEW-STAGE\/1 status=staged slot=A /u);
});

// Run one call in its own empty cwd and TMPDIR with a stdin that never ends:
// a helper that read stdin or made a directory before refusing would hang here
// or leave something behind.
async function isolatedCall(args) {
  const cwd = space();
  const temp = space();
  const child = spawn(process.execPath, [HELPER, ...args], {
    cwd,
    env: { ...process.env, TMPDIR: temp },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  const [status] = await once(child, "close");
  clearTimeout(timer);
  return { status, stdout, stderr, left: [...readdirSync(cwd), ...readdirSync(temp)] };
}

test("every command answers --help with its inputs and an example, and creates nothing", async () => {
  assert.deepEqual(Object.keys(FLAGS).sort(), [
    "ack",
    "namespace",
    "pair",
    "prepare",
    "preview",
    "stage",
    "template",
    "validate",
  ]);
  for (const command of Object.keys(FLAGS)) {
    const help = await isolatedCall([command, "--help"]);
    assert.equal(help.status, 0, `${command} ${help.stderr}`);
    assert.match(help.stdout, new RegExp(`^usage: mo-review-report\\.mjs ${command}\\b`, "u"));
    assert.match(
      help.stdout,
      new RegExp(`^example:\\n  node mo-review-report\\.mjs ${command}\\b`, "mu"),
    );
    for (const flag of FLAGS[command]) assert.match(help.stdout, new RegExp(`--${flag}\\b`, "u"));
    assert.deepEqual(help.left, [], command);
  }
});

test("an unknown or repeated flag is a call error before stdin or the filesystem", async () => {
  for (const command of Object.keys(FLAGS)) {
    const unknown = await isolatedCall([command, "--bogus", "x"]);
    assert.equal(unknown.status, 2, command);
    assert.equal(unknown.stdout, "", command);
    assert.match(unknown.stderr, new RegExp(`${command} does not take --bogus`, "u"));
    assert.deepEqual(unknown.left, [], command);
  }
  for (const args of [
    ["template", "--verdict", "PASS", "--verdict", "PASS"],
    ["prepare", "--file", "body.md", "--file", "other.md"],
    ["validate", "--file", "-", "--dispatch", "a", "--dispatch", "b"],
    ["stage", "--slot", "A", "--slot", "B"],
    ["ack", "--kind", "Handoff", "--kind", "Preview"],
  ]) {
    const repeated = await isolatedCall(args);
    assert.equal(repeated.status, 2, args.join(" "));
    assert.match(repeated.stderr, /is given twice/u, args.join(" "));
    assert.deepEqual(repeated.left, [], args.join(" "));
  }
  // A missing flag is found before the body is read: prepare would otherwise
  // wait on stdin, and a later refusal would not undo the read.
  const missing = await isolatedCall(["prepare", "--file", "body.md"]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /are required/u);
  assert.deepEqual(missing.left, []);
});

test("the Round line carries the attempt, its limit, the deep reads and the fragment", () => {
  const at = (line) => report().replace(ROUND_LINE, line);
  const custom = (line, round) => validateReport(at(line), { ...context(), round });
  // An owner-approved extension is a larger limit, and it is the flags that say so.
  const extended = { attempt: 6, limit: 10, deepReads: 2, fragment: "f1" };
  assert.equal(custom("Round: attempt=6/10 deep_reads=2 fragment=f1", extended).status, "valid");
  assert.equal(reasonOf(report().replace(`${ROUND_LINE}\n`, "")), "round_missing");
  assert.equal(reasonOf(at("Round: attempt=6/5 deep_reads=1 fragment=f1")), "round_exceeds_budget");
  for (const line of [
    "Round: attempt=1/5",
    "Round: attempt=0/5 deep_reads=0 fragment=f1",
    "Round: attempt=01/5 deep_reads=1 fragment=f1",
    "Round: attempt=1/5 deep_reads=2 fragment=f1",
    "Round: attempt=1/5 deep_reads=1 fragment=F1",
    `Round: attempt=1/5 deep_reads=1 fragment=${"f".repeat(41)}`,
    "Round: attempt=1/5 deep_reads=1 fragment=f1 extra",
  ]) {
    assert.equal(reasonOf(at(line)), "round_malformed", line);
  }
  // A well-formed line that answers another round is somebody else's report.
  for (const line of [
    "Round: attempt=2/5 deep_reads=1 fragment=f1",
    "Round: attempt=1/6 deep_reads=1 fragment=f1",
    "Round: attempt=1/5 deep_reads=0 fragment=f1",
    "Round: attempt=1/5 deep_reads=1 fragment=f2",
  ]) {
    assert.equal(reasonOf(at(line)), "round_mismatch", line);
  }
  // Out of place is missing at its place: the counters never float in the header.
  const moved = report()
    .replace(`${ROUND_LINE}\n`, "")
    .replace("Delegation: none\n", `Delegation: none\n${ROUND_LINE}\n`);
  assert.equal(reasonOf(moved), "round_missing");
});

test("the round flags are the caller's, and a budget they break is a call error", () => {
  const args = (round) => [
    "template",
    "--verdict",
    "PASS",
    "--dispatch",
    "ctx_fixture",
    "--candidate",
    SHA,
    "--requested",
    "deep",
    "--effective",
    "deep",
    ...round,
  ];
  for (const round of [
    ["--attempt", "6", "--attempt-limit", "5", "--deep-reads", "1", "--fragment", "f1"],
    ["--attempt", "1", "--attempt-limit", "5", "--deep-reads", "2", "--fragment", "f1"],
    ["--attempt", "x", "--attempt-limit", "5", "--deep-reads", "1", "--fragment", "f1"],
    ["--attempt", "1", "--attempt-limit", "5", "--deep-reads", "1", "--fragment", "F 1"],
  ]) {
    const refused = spawnSync(process.execPath, [HELPER, ...args(round)], { encoding: "utf8" });
    assert.equal(refused.status, 2, round.join(" "));
    assert.equal(refused.stdout, "", round.join(" "));
  }
  const printed = spawnSync(process.execPath, [HELPER, ...args(ROUND_ARGS)], { encoding: "utf8" });
  assert.equal(printed.status, 0, printed.stderr);
  assert.match(printed.stdout, new RegExp(`^${ROUND_LINE}$`, "mu"));
});
