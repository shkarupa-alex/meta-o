/**
 * Hold the reviewer's side of the report grammar: the literal it copies, the
 * spacing it may use, the two finding bodies, and the file it proves before the
 * irreversible `worker_done`.
 *
 * Protects §A-REVIEW-04.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  bodyIdentity,
  prepareBody,
  reportTemplate,
  validateReport,
} from "../shared/scripts/mo-review-report.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(ROOT, "shared", "scripts", "mo-review-report.mjs");
const SHA = "b".repeat(40);
const spaces = [];
after(() => {
  for (const path of spaces) rmSync(path, { recursive: true, force: true });
});

function space() {
  const path = mkdtempSync(join(tmpdir(), "mo-review-grammar-"));
  spaces.push(path);
  return path;
}

const expected = (mode = "deep") => ({
  execution: "ctx_a",
  candidate: SHA,
  requestedMode: mode,
  effectiveMode: mode,
});

const call = (args, input) =>
  spawnSync(process.execPath, [HELPER, ...args], { input, encoding: "utf8" });

const flags = (mode = "deep") => [
  "--dispatch",
  "ctx_a",
  "--candidate",
  SHA,
  "--requested",
  mode,
  "--effective",
  mode,
];

const header = [
  "Review-Execution: ctx_a",
  `Candidate: ${SHA}`,
  "Mode: requested=deep effective=deep",
  "Delegation: none",
  "Verdict: FINDINGS",
  "Counts: P0=0 P1=0 P2=1 P3=0",
];

function findingsReport({ head = header.join("\n"), body = "F-001\n[P2] causal path.\n" } = {}) {
  return (
    `${head}\n\nF-001 [P2] One defect.\n\nEvidence report\nGrounding\nHEAD and clean tree\n` +
    `Scope and checks\nread by SHA\nFindings\n${body}Unknowns\nnone\nResidual risks\nnone\n` +
    "End-Review: ctx_a\n"
  );
}

const reasonOf = (text) => validateReport(text, expected()).reason;

test("every template validates unchanged with the same expected flags", () => {
  for (const [verdict, extra] of [
    ["PASS", []],
    ["FINDINGS", []],
    ["UNKNOWN", ["--unknown-reason", "review_incomplete"]],
  ]) {
    for (const mode of ["fast", "deep", "follow_up"]) {
      const printed = call(["template", "--verdict", verdict, ...flags(mode), ...extra]);
      assert.equal(printed.status, 0, printed.stderr);
      const checked = call(["validate", "--file", "-", ...flags(mode)], printed.stdout);
      assert.equal(checked.status, 0, `${verdict}/${mode}: ${checked.stdout}`);
      assert.match(checked.stdout, new RegExp(`status=valid verdict=${verdict} `, "u"));
    }
  }
  const findings = reportTemplate({
    verdict: "FINDINGS",
    dispatch: "ctx_a",
    candidate: SHA,
    requested: "deep",
    effective: "deep",
  }).text;
  assert.match(findings, /^Counts: P0=0 P1=0 P2=1 P3=0$/mu);
  assert.match(findings, /^F-001 \[P2\] /mu);
  const unknown = reportTemplate({
    verdict: "UNKNOWN",
    dispatch: "ctx_a",
    candidate: SHA,
    requested: "deep",
    effective: "deep",
    reason: "retrieval_failure",
  }).text;
  assert.match(unknown, /^Unknown-Reason: retrieval_failure$/mu);
  assert.match(unknown, /^Unknown-Account$/mu);
  assert.ok(findings.startsWith("Review-Execution: ctx_a\n"));
  assert.doesNotMatch(findings, /MO-REVIEW-REPORT/u);
});

test("a template call that cannot be answered is a call error, not a template", () => {
  for (const extra of [
    ["--verdict", "UNKNOWN"],
    ["--verdict", "PASS", "--unknown-reason", "unreadable"],
    ["--verdict", "UNKNOWN", "--unknown-reason", "made_up"],
    ["--verdict", "FAIL"],
  ]) {
    const printed = call(["template", ...extra, ...flags()]);
    assert.equal(printed.status, 2, extra.join(" "));
    assert.equal(printed.stdout, "");
  }
});

test("the template prints exactly the mode pairs its own validator accepts", () => {
  const modes = ["fast", "deep", "follow_up"];
  const pair = (requested, effective) => [
    "--dispatch",
    "ctx_a",
    "--candidate",
    SHA,
    "--requested",
    requested,
    "--effective",
    effective,
  ];
  for (const [verdict, extra] of [
    ["PASS", []],
    ["FINDINGS", []],
    ["UNKNOWN", ["--unknown-reason", "review_incomplete"]],
  ]) {
    for (const requested of modes) {
      for (const effective of modes) {
        const label = `${verdict} ${requested}/${effective}`;
        const flagsOf = pair(requested, effective);
        const printed = call(["template", "--verdict", verdict, ...flagsOf, ...extra]);
        if (effective === requested || effective === "deep") {
          assert.equal(printed.status, 0, `${label}: ${printed.stderr}`);
          const checked = call(["validate", "--file", "-", ...flagsOf], printed.stdout);
          assert.equal(checked.status, 0, `${label}: ${checked.stdout}`);
          continue;
        }
        assert.equal(printed.status, 2, label);
        assert.equal(printed.stdout, "", label);
        assert.notEqual(printed.stderr, "", label);
        // The same pair written by hand is still refused by the reader.
        const written = reportTemplate({
          verdict,
          dispatch: "ctx_a",
          candidate: SHA,
          requested,
          effective: requested,
          ...(verdict === "UNKNOWN" ? { reason: "review_incomplete" } : {}),
        }).text.replace(
          `Mode: requested=${requested} effective=${requested}`,
          `Mode: requested=${requested} effective=${effective}`,
        );
        assert.equal(
          validateReport(written, { ...expected(requested), effectiveMode: undefined }).reason,
          "mode_mismatch",
          label,
        );
      }
    }
  }
});

test("one empty line between service lines is formatting, two are not", () => {
  // The incident body: each service line its own Markdown paragraph.
  assert.equal(
    validateReport(findingsReport({ head: header.join("\n\n") }), expected()).status,
    "valid",
  );
  const twice = [header[0], "", "", ...header.slice(1)].join("\n");
  assert.equal(reasonOf(findingsReport({ head: twice })), "header_order");
  const prose = [header[0], "a sentence in between", ...header.slice(1)].join("\n");
  assert.equal(reasonOf(findingsReport({ head: prose })), "header_order");
  const listed = [header[0], "", `- ${header[1]}`, ...header.slice(2)].join("\n");
  assert.equal(reasonOf(findingsReport({ head: listed })), "header_order");
  assert.equal(reasonOf(`\n${findingsReport()}`), "header_order");
});

test("the first line is the bare dispatch id and nothing before or after it", () => {
  // The incident: an explanation after the id, and the validator's own prefix
  // pasted in front of the body by a brief that confused the two.
  const explained = [`${header[0]} (explanation)`, ...header.slice(1)].join("\n");
  assert.deepEqual(validateReport(findingsReport({ head: explained }), expected()), {
    status: "malformed",
    reason: "header_order",
    line: 1,
  });
  const prefixed = `MO-REVIEW-REPORT/1\n${findingsReport()}`;
  assert.equal(reasonOf(prefixed), "header_order");
  assert.equal(validateReport(findingsReport(), expected()).status, "valid");
});

test("both finding bodies are accepted and nothing else is", () => {
  assert.equal(validateReport(findingsReport(), expected()).status, "valid");
  const inline = findingsReport({ body: "F-001 [P2] causal path, impact and case.\n" });
  assert.equal(validateReport(inline, expected()).status, "valid");
  const blank = findingsReport({ body: "F-001\n\n[P2] causal path after a blank line.\n" });
  assert.equal(validateReport(blank, expected()).status, "valid");
  for (const body of [
    "- F-001 [P2] inside a list.\n\n",
    "> F-001 [P2] inside a quote.\n\n",
    "F-001 [P3] severity differs from the index.\n",
    "F-001\n[P1] severity differs from the index.\n",
    "F-001\n[P2] one body.\nF-001\n[P2] a second body for the same key.\n",
    "F-002 [P2] a key the index never announced.\n",
    // A severity alone carries no evidence, so it opens no body.
    "F-001 [P2]\n",
    "F-001\n[P2]\n",
    "F-001\n\n[P2]   \n",
    // An unannounced key stays a stray body whatever follows its severity.
    "F-001 [P2] the announced body.\nF-002 [P1]\nevidence for a finding the index hides.\n",
    // The severity line follows the bare key directly, not past a container.
    "F-001\n\n> a quote between key and severity.\n\n[P2] causal path.\n",
    "F-001\n\n- a list between key and severity.\n\n[P2] causal path.\n",
  ]) {
    assert.equal(reasonOf(findingsReport({ body })), "index_body_mismatch", body);
  }
});

test("a marker inside a multi-line inline literal is quoted text, not structure", () => {
  const pass = reportTemplate({
    verdict: "PASS",
    dispatch: "ctx_a",
    candidate: SHA,
    requested: "deep",
    effective: "deep",
  }).text;
  for (const quoted of ["`git show\nGrounding\nHEAD`", "`a\nFindings\nb`"]) {
    const text = pass.replace("Read: <intent", `Quoted: ${quoted}.\nRead: <intent`);
    assert.equal(validateReport(text, expected()).status, "valid", quoted);
  }
  const body = "F-001\n[P2] causal path `a\nF-002\nb` continues.\n";
  assert.equal(validateReport(findingsReport({ body }), expected()).status, "valid");
  const opened = "F-001 [P2] causal path `a\nb` continues.\n";
  assert.equal(validateReport(findingsReport({ body: opened }), expected()).status, "valid");
});

test("the index takes one empty line between entries and at either end", () => {
  const two = findingsReport().replace(
    "F-001 [P2] One defect.\n\n",
    "\nF-001 [P2] One defect.\n\n",
  );
  assert.equal(reasonOf(two), "index_layout");
  const tail = findingsReport().replace(
    "F-001 [P2] One defect.\n\n",
    "F-001 [P2] One defect.\n\n\n",
  );
  assert.equal(reasonOf(tail), "index_layout");
});

test("the footer is the last line, with at most one line feed after it", () => {
  const text = findingsReport();
  assert.equal(validateReport(text.slice(0, -1), expected()).status, "valid");
  assert.equal(reasonOf(`${text}\n`), "footer_mismatch");
  assert.equal(reasonOf(`${text}trailing prose\n`), "footer_mismatch");
});

test("UNKNOWN without its account is malformed", () => {
  const text = reportTemplate({
    verdict: "UNKNOWN",
    dispatch: "ctx_a",
    candidate: SHA,
    requested: "deep",
    effective: "deep",
    reason: "review_incomplete",
  }).text;
  const stripped = text.replace(/\nUnknown-Account\n[^\n]*\n[^\n]*\n[^\n]*\n/u, "\n");
  assert.equal(reasonOf(stripped), "unknown_account");
});

test("the Unknown-Reason stands inside the account it types", () => {
  const text = reportTemplate({
    verdict: "UNKNOWN",
    dispatch: "ctx_a",
    candidate: SHA,
    requested: "deep",
    effective: "deep",
    reason: "review_incomplete",
  }).text;
  const reason = "Unknown-Reason: review_incomplete";
  const without = text.replace(`${reason}\n`, "");
  for (const label of ["Grounding", "Scope and checks", "Unknowns", "Residual risks"]) {
    const moved = without.replace(`\n${label}\n`, `\n${label}\n${reason}\n`);
    assert.notEqual(moved, without, label);
    assert.equal(reasonOf(moved), "unknown_reason", label);
  }
  // The compact layout of section markers stays valid: §A-REVIEW-04 reads
  // markers from top-level prose rows so a report is not lost to formatting.
  assert.equal(
    reasonOf(text.replace("Evidence report\n\nGrounding", "Evidence report\nGrounding")),
    undefined,
  );
});

test("prepare writes a valid body once and a malformed draft not at all", () => {
  const dir = space();
  const path = join(dir, "ctx_a.md");
  const good = Buffer.from(findingsReport());
  const bad = Buffer.from(findingsReport().replace("Delegation: none", "Delegation: sub"));
  assert.equal(prepareBody({ path, buffer: bad, expected: expected() }).reason, "delegation");
  assert.equal(existsSync(path), false);
  const prepared = prepareBody({ path, buffer: good, expected: expected() });
  assert.equal(prepared.status, "prepared");
  assert.equal(prepared.bytes, good.length);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.ok(readFileSync(path).equals(good));
  // An existing file belongs to some other Dispatch; its bytes stay.
  assert.deepEqual(prepareBody({ path, buffer: good, expected: expected() }), {
    status: "refused",
    reason: "exists",
  });
  const cli = call(["prepare", "--file", path, ...flags()], findingsReport());
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /^MO-REVIEW-BODY\/1 status=refused reason=exists$/mu);
  const fresh = join(dir, "ctx_b.md");
  const made = call(["prepare", "--file", fresh, ...flags()], findingsReport());
  assert.equal(made.status, 0, made.stdout);
  assert.match(made.stdout, /status=valid verdict=FINDINGS/u);
  assert.match(made.stdout, /^MO-REVIEW-BODY\/1 status=prepared path=".+" bytes=\d+$/mu);
});

test("received bytes are compared with the prepared file, and the two claims stay apart", () => {
  const dir = space();
  const path = join(dir, "ctx_a.md");
  writeFileSync(path, findingsReport());
  const same = Buffer.from(findingsReport());
  assert.equal(bodyIdentity(same, path).identity, "identical");
  const stripped = Buffer.from(findingsReport().slice(0, -1));
  assert.equal(bodyIdentity(stripped, path).identity, "different");
  assert.equal(bodyIdentity(stripped, path, "final-newline").identity, "identical");
  // Another valid report of the same length is still another report.
  const other = Buffer.from(findingsReport().replace("causal path", "casual path"));
  assert.equal(bodyIdentity(other, path).identity, "different");
  assert.equal(bodyIdentity(same, join(dir, "absent.md")).identity, "unverified");

  // A prepared file damaged after prepare into invalid UTF-8 is another file,
  // even where decoding would turn both sides into the same replacement text.
  const witness = findingsReport().replace("read by SHA", "read by SHA \ufffd");
  const damaged = join(dir, "damaged.md");
  const received = Buffer.from(witness);
  const at = received.indexOf(Buffer.from("\ufffd"));
  for (const bytes of [
    [0xff, 0x20, 0x20],
    [0xf0, 0x9f, 0x92],
  ]) {
    const copy = Buffer.from(received);
    copy.set(bytes, at);
    writeFileSync(damaged, copy);
    for (const mode of ["none", "final-newline"]) {
      assert.equal(bodyIdentity(received, damaged, mode).identity, "different", `${bytes} ${mode}`);
    }
    const cli = call(["validate", "--file", "-", ...flags(), "--prepared", damaged], witness);
    assert.equal(cli.status, 1, cli.stdout);
    assert.match(cli.stdout, /prepared_body_identity=different/u);
  }
  // A plain character changed at the same length differs in both modes.
  writeFileSync(damaged, findingsReport().replace("causal path", "causal patH"));
  for (const mode of ["none", "final-newline"]) {
    assert.equal(bodyIdentity(same, damaged, mode).identity, "different", mode);
  }
  // Invalid UTF-8 on the received side stays a malformed report.
  const broken = Buffer.from(received);
  broken.set([0xff, 0x20, 0x20], at);
  const invalid = call(["validate", "--file", "-", ...flags(), "--prepared", path], broken);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /status=malformed reason=invalid_utf8/u);

  const valid = call(["validate", "--file", "-", ...flags(), "--prepared", path], findingsReport());
  assert.equal(valid.status, 0);
  assert.match(valid.stdout, /status=valid/u);
  assert.match(valid.stdout, /^MO-REVIEW-BODY\/1 prepared_body_identity=identical reason=none$/mu);
  const drift = findingsReport().replace("read by SHA", "read by SHA again");
  const differs = call(["validate", "--file", "-", ...flags(), "--prepared", path], drift);
  assert.equal(differs.status, 1);
  assert.match(differs.stdout, /status=valid/u);
  assert.match(differs.stdout, /prepared_body_identity=different/u);
  const missing = call(
    ["validate", "--file", "-", ...flags(), "--prepared", join(dir, "absent.md")],
    findingsReport(),
  );
  assert.equal(missing.status, 0);
  assert.match(missing.stdout, /prepared_body_identity=unverified/u);
  const unnamed = call(
    ["validate", "--file", "-", ...flags(), "--prepared", path, "--normalization", "trim"],
    findingsReport(),
  );
  assert.equal(unnamed.status, 2);
});

test("the index may follow Counts with no empty line", () => {
  // The first entry then shares the header's paragraph; reading entries by
  // paragraph start once counted zero of them and threw the report away.
  const tight = findingsReport().replace("P3=0\n\nF-001", "P3=0\nF-001");
  assert.notEqual(tight, findingsReport());
  assert.equal(validateReport(tight, expected()).status, "valid");
  const miscounted = tight.replace("P2=1", "P2=2");
  assert.equal(reasonOf(miscounted), "counts_mismatch");
});

test("a key quoted inside a multi-line code span in the index is summary text", () => {
  const indexed = (summary, report = findingsReport()) =>
    report.replace("F-001 [P2] One defect.\n", `${summary}\n`);
  for (const summary of [
    "F-001 [P2] A single finding quotes `the literal\nF-002 [P2] example key\ninside its summary`.",
    "F-001 [P2] A quote ``with a ` tick\nF-002 [P2] example key\ninside``.",
    "F-001 [P2] The closing row `starts\nF-002 [P2] inside the span`.",
    "F-001 [P2] Repeated and out of order `a\nF-001 [P0] b\nF-999 [P3] c\nF-002 [P1] d`.",
  ]) {
    const result = validateReport(indexed(summary), expected());
    assert.equal(result.status, "valid", summary);
    // A valid report has exactly as many entries as its counts.
    assert.deepEqual(result.counts, [0, 0, 1, 0], summary);
  }
  const two = findingsReport({
    head: header.join("\n").replace("P2=1", "P2=2"),
    body: "F-001\n[P2] causal path.\nF-002\n[P2] another path.\n",
  });
  const quoted = indexed(
    "F-001 [P2] One defect quoting `x\nF-999 [P3] y\nz`.\n\nF-002 [P2] Another defect.",
    two,
  );
  const result = validateReport(quoted, expected());
  assert.equal(result.status, "valid");
  assert.deepEqual(result.counts, [0, 0, 2, 0]);
  // Without the delimiters the second key is a real entry and must be counted.
  const bare = "F-001 [P2] A single finding quotes the literal\nF-002 [P2] example key";
  assert.equal(reasonOf(indexed(bare)), "counts_mismatch");
  const counted = indexed(bare, two);
  assert.equal(validateReport(counted, expected()).status, "valid");
});

test("the closing row of a multi-line code span is quoted text for every prefix reader", () => {
  const template = (verdict, extra = {}) =>
    reportTemplate({
      verdict,
      dispatch: "ctx_a",
      candidate: SHA,
      requested: "deep",
      effective: "deep",
      ...extra,
    }).text;
  const closing = "F-001\n[P2] causal path `a\nF-002 [P2] quoted` continues.\n";
  const result = validateReport(findingsReport({ body: closing }), expected());
  assert.equal(result.status, "valid");
  assert.deepEqual(result.counts, [0, 0, 1, 0]);
  const inline = "F-001 [P2] causal path `a\nF-002 [P2] quoted` continues.\n";
  assert.equal(validateReport(findingsReport({ body: inline }), expected()).status, "valid");
  const two = findingsReport({
    head: header.join("\n").replace("P1=0 P2=1", "P1=1 P2=1"),
    body: "F-001\n[P2] path `a\nF-002 [P2] x`.\nF-002\n[P1] path.\n",
  }).replace("F-001 [P2] One defect.\n", "F-001 [P2] One defect.\n\nF-002 [P1] Another defect.\n");
  const counted = validateReport(two, expected());
  assert.equal(counted.status, "valid");
  assert.deepEqual(counted.counts, [0, 1, 1, 0]);
  const quoted = "Quoted `x\nUnknown-Reason: retrieval_failure` here.\n";
  const pass = template("PASS").replace("\nResidual risks\n", `\nResidual risks\n${quoted}`);
  assert.equal(validateReport(pass, expected()).status, "valid");
  const unknown = template("UNKNOWN", { reason: "review_incomplete" }).replace(
    "\nUnknowns\n",
    `\nUnknowns\n${quoted}`,
  );
  assert.equal(validateReport(unknown, expected()).status, "valid");
  // Without the delimiters the same rows are structure again.
  assert.equal(
    reasonOf(findingsReport({ body: closing.replaceAll("`", "") })),
    "index_body_mismatch",
  );
  assert.equal(reasonOf(pass.replace(quoted, quoted.replaceAll("`", ""))), "unknown_reason");
});

test("a key quoted on a closing code row neither answers the index nor opens a stray body", () => {
  const bundles = ["mo-reviewer", "mo-review-orca", "mo-orchestrate-orca"].map((skill) =>
    join(ROOT, "skills", skill, "scripts", "mo-review-report.mjs"),
  );
  const dir = space();
  const judged = (text, label) => {
    const reason = validateReport(text, expected()).reason ?? "valid";
    const path = join(dir, "report.md");
    writeFileSync(path, text);
    for (const script of [HELPER, ...bundles]) {
      const run = spawnSync(process.execPath, [script, "validate", "--file", path, ...flags()], {
        encoding: "utf8",
      });
      const printed = run.stdout.match(/status=(\w+)(?: reason=(\w+))?/u);
      assert.equal(printed[1] === "valid" ? "valid" : printed[2], reason, `${script} ${label}`);
    }
    return reason;
  };
  const two = (body) =>
    findingsReport({ head: header.join("\n").replace("P2=1", "P2=2"), body }).replace(
      "F-001 [P2] One defect.\n",
      "F-001 [P2] One defect.\n\nF-002 [P2] Another defect.\n",
    );
  for (const [open, close] of [
    ["`", "`"],
    ["`` a ` tick", "``"],
  ]) {
    const quoteOnly = `Example literal: ${open} opening row\nF-001 [P2] quoted text${close}.\n`;
    assert.equal(judged(findingsReport({ body: quoteOnly }), "quote only"), "index_body_mismatch");
    for (const severity of ["P0", "P1", "P2", "P3"]) {
      const stray = `F-001 [P2] evidence quotes ${open} opening row\nF-999 [${severity}] quoted${close}.\n`;
      assert.equal(judged(findingsReport({ body: stray }), `stray ${severity}`), "valid");
    }
    const early = `F-001 [P2] path ${open} a\nF-002 [P2] quoted text${close}.\n`;
    assert.equal(judged(two(early), "early"), "index_body_mismatch");
    assert.equal(judged(two(`${early}F-002 [P2] the real body.\n`), "both"), "valid");
  }
  const opened = "F-001 [P2] causal path `a\nplain text` continues.\n";
  assert.equal(judged(findingsReport({ body: opened }), "opened"), "valid");
});
