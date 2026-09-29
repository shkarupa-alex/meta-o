/**
 * The one grammar of a reviewer's authoritative response.
 *
 * §A-REVIEW-04 makes that body the whole result of a review, so "is this a
 * report?" has to be answerable by a machine, and by the same machine the
 * reviewer can run before it sends the body. Two owners of the shape — prose in
 * a skill and a parser in a helper — drifted apart once and burned a paired
 * round; the template printed here and the validator below are one module so
 * that cannot happen again: whatever `reportTemplate` prints, `validateReport`
 * accepts.
 */

import { fromMarkdown } from "mdast-util-from-markdown";

const MODES = new Set(["fast", "deep", "follow_up"]);
const VERDICTS = ["PASS", "FINDINGS", "UNKNOWN"];
const ORDER = ["Grounding", "Scope and checks", "Findings", "Unknowns", "Residual risks"];
const LABELS = [...ORDER, "Evidence report", "Unknown-Account"];
const SHA = /^[a-f0-9]{40}$/u;
const ENTRY = /^(F-\d{3}) \[(P[0-3])\] .+/u;

/** §A-REVIEW-04 closes the reasons an UNKNOWN report may give for itself. */
export const UNKNOWN_REASONS = new Set([
  "unreadable",
  "candidate_mismatch",
  "dirty_candidate",
  "malformed_report",
  "retrieval_failure",
  "handoff_failure",
  "review_incomplete",
]);

// The six service lines, in the only order they may take. Delegation carries a
// closed value of its own, so a wrong value there is named separately from a
// line that is missing or out of place.
const HEADER = [
  /^Review-Execution: (\S+)$/u,
  /^Candidate: ([a-f0-9]{40})$/u,
  /^Mode: requested=(\S+) effective=(\S+)$/u,
  /^Delegation: .*$/u,
  /^Verdict: (\S+)$/u,
  /^Counts: P0=(\d+) P1=(\d+) P2=(\d+) P3=(\d+)$/u,
];

const fail = (reason, line) => ({ status: "malformed", reason, line: line + 1 });

/**
 * The top-level paragraph nodes, each as its first line and its own rows.
 *
 * §A-REVIEW-04 reads structure from the block AST: a marker inside a code span,
 * a quote or a list is body evidence, and a reviewer quoting `End-Review` while
 * explaining a finding has not ended the report.
 */
export function topLevelParagraphs(text) {
  const lines = text.split("\n");
  return fromMarkdown(text)
    .children.filter((node) => node.type === "paragraph")
    .map((node) => ({
      line: node.position.start.line - 1,
      rows: lines.slice(node.position.start.line - 1, node.position.end.line),
    }));
}

/** §A-REVIEW-04 indexes those same paragraphs by line for the section markers. */
export function topLevelProse(text) {
  return new Set(
    topLevelParagraphs(text).flatMap(({ line, rows }) => rows.map((_, step) => line + step)),
  );
}

/**
 * Read the six service lines from where they actually stand.
 *
 * §A-REVIEW-04 anchors them to the first byte: the body opens with
 * `Review-Execution`, and between two service lines stands at most one empty
 * line. A reviewer formatting the block as Markdown paragraphs wrote exactly
 * that and lost a whole round to a parser that counted rows; a second empty
 * line, prose or a container between them is still not a header.
 */
function readEnvelope(lines, prose) {
  const rows = [];
  let row = 0;
  for (const [step, pattern] of HEADER.entries()) {
    if (step > 0 && lines[row] === "") row += 1;
    if (!prose.has(row) || !pattern.test(lines[row] ?? "")) return fail("header_order", row);
    rows.push(row);
    row += 1;
  }
  const [execution, candidate, mode, delegation, verdict, counts] = rows.map((at, step) =>
    HEADER[step].exec(lines[at]),
  );
  if (delegation[0] !== "Delegation: none") return fail("delegation", rows[3]);
  if (!MODES.has(mode[1]) || !MODES.has(mode[2])) return fail("header_order", rows[2]);
  if (!VERDICTS.includes(verdict[1])) return fail("verdict", rows[4]);
  return {
    execution: execution[1],
    candidate: candidate[1],
    requested: mode[1],
    effective: mode[2],
    verdict: verdict[1],
    counts: counts.slice(1).map(Number),
    countsRow: rows[5],
  };
}

/**
 * Check the envelope against what this caller asked for.
 *
 * §A-REVIEW-04 keeps the expected values with the caller: a report that is
 * internally consistent but answers a different dispatch, candidate or mode is
 * somebody else's report, and a stale one reads exactly like a fresh one.
 */
function readHeader(lines, prose, expected) {
  const envelope = readEnvelope(lines, prose);
  if (envelope.status === "malformed") return envelope;
  if (envelope.execution !== expected.execution) return fail("execution_mismatch", 0);
  if (envelope.candidate !== expected.candidate) return fail("candidate_mismatch", 1);
  if (envelope.requested !== expected.requestedMode) return fail("mode_mismatch", 2);
  if (expected.effectiveMode !== undefined && envelope.effective !== expected.effectiveMode) {
    return fail("mode_mismatch", 2);
  }
  const last = lines.length - 1;
  if (lines[last] !== `End-Review: ${envelope.execution}` || !prose.has(last)) {
    return fail("footer_mismatch", last);
  }
  return envelope;
}

/** §A-REVIEW-04 requires exactly one unquoted marker per section, in order. */
function readSections(lines, prose, countsRow) {
  const found = new Map(LABELS.map((label) => [label, []]));
  for (const index of prose) {
    if (found.has(lines[index])) found.get(lines[index]).push(index);
  }
  for (const label of ["Evidence report", ...ORDER]) {
    if (found.get(label).length !== 1) return fail("section_missing", found.get(label)[1] ?? 0);
  }
  const evidence = found.get("Evidence report")[0];
  const positions = ORDER.map((label) => found.get(label)[0]);
  if (evidence <= countsRow || positions.some((position) => position < evidence)) {
    return fail("section_order", evidence);
  }
  for (let step = 1; step < positions.length; step += 1) {
    if (positions[step] < positions[step - 1]) return fail("section_order", positions[step]);
  }
  return { evidence, at: new Map(ORDER.map((label, step) => [label, positions[step]])), found };
}

/**
 * §A-REVIEW-04 keeps the index a run of top-level entries and nothing else.
 *
 * Between `Counts` and `Evidence report` stand only index paragraphs, one empty
 * line at most between any two of them and at either end. A container or loose
 * prose there is not an index entry the counts could answer for, so it makes
 * the report malformed rather than silently vanishing from the census.
 */
function readIndexLayout(lines, prose, from, to) {
  for (let row = from; row < to; row += 1) {
    if (lines[row] === "") {
      if (lines[row - 1] === "" && row - 1 >= from) return fail("index_layout", row);
    } else if (!prose.has(row)) return fail("index_layout", row);
  }
  return {};
}

/**
 * §A-REVIEW-04 keys the index monotonically so a body can answer it one to one.
 *
 * Reviewers write the index as consecutive rows, and a long summary wraps. So
 * an entry starts where a row starts with its key, and every row after it that
 * does not is the same entry continued. Reading each row as an entry rejected a
 * wrapped summary; reading each paragraph as one entry rejected every report
 * with two findings. Nothing else stands in the index: `Unknown-Reason`
 * belongs to the UNKNOWN account, where the template prints it.
 */
function readIndex(paragraphs, from, to, counts) {
  const entries = [];
  for (const { line, rows } of paragraphs) {
    // Rows are taken by their own line, not by where their paragraph starts:
    // with no empty line after `Counts` the first entry shares the header's
    // paragraph, and the grammar allows exactly that.
    const inside = rows
      .map((row, step) => ({ row, at: line + step }))
      .filter(({ at }) => at > from && at < to);
    for (const [step, { row, at }] of inside.entries()) {
      const match = row.match(ENTRY);
      // An entry opens a paragraph; a row that follows one is that entry
      // continued, however much it looks like structure on its own.
      if (match) entries.push({ key: match[1], severity: match[2], line: at });
      else if (step === 0) return fail("index_key_order", at);
    }
  }
  for (const [step, entry] of entries.entries()) {
    if (entry.key !== `F-${String(step + 1).padStart(3, "0")}`)
      return fail("index_key_order", entry.line);
  }
  const severities = [0, 0, 0, 0];
  for (const entry of entries) severities[Number(entry.severity.slice(1))] += 1;
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total !== entries.length) return fail("counts_mismatch", from);
  for (const [step, count] of counts.entries()) {
    if (severities[step] !== count) return fail("counts_mismatch", from);
  }
  return { keys: entries.map(({ key, severity }) => ({ key, severity })) };
}

/**
 * Decide whether one top-level line opens the body of the next finding.
 *
 * §A-REVIEW-04 accepts exactly two bodies: a line that is only the key with
 * the next non-empty line opening with its bracketed severity, or one line that
 * carries key and severity together. A key already opened and restated while
 * explaining the finding is prose; a bare key line nobody expected, or a key
 * the index never announced, is a body without an entry. A severity with nothing
 * after it opens no body: a truncated report would otherwise settle a finding
 * that carries none of its evidence.
 */
function bodyOpening(line, expected, opened) {
  const bare = /^(F-\d{3})$/u.exec(line);
  // The shape is recognized with or without text after the severity, so an
  // unannounced key stays a stray body even when nothing follows its severity.
  const inline = /^(F-\d{3}) \[(P[0-3])\](?:\s|$)/u.exec(line);
  if (bare === null && inline === null) return { kind: "prose" };
  const key = (bare ?? inline)[1];
  if (expected !== undefined && key === expected.key) {
    if (bare) return { kind: "bare" };
    return /^F-\d{3} \[P[0-3]\] +\S/u.test(line)
      ? { kind: "inline", severity: inline[2] }
      : { kind: "stray" };
  }
  if (inline !== null && opened.has(key)) return { kind: "prose" };
  return { kind: "stray" };
}

/** §A-REVIEW-04 pairs every index key with one body that states its own severity. */
function readFindingBodies(lines, prose, span, keys) {
  const rows = [...prose]
    .filter((position) => position > span.from && position < span.to)
    .sort((left, right) => left - right);
  const opened = new Set();
  for (const [step, position] of rows.entries()) {
    const expected = keys[opened.size];
    const opening = bodyOpening(lines[position], expected, opened);
    if (opening.kind === "prose") continue;
    if (opening.kind === "stray") return fail("index_body_mismatch", position);
    let severity = opening.severity;
    if (opening.kind === "bare") {
      const detail = rows.slice(step + 1).find((row) => lines[row].trim() !== "");
      severity = /^\[(P[0-3])\]\s+\S/u.exec(lines[detail] ?? "")?.[1];
    }
    if (severity !== expected.severity) return fail("index_body_mismatch", position);
    opened.add(expected.key);
  }
  if (opened.size !== keys.length) return fail("index_body_mismatch", span.from);
  return {};
}

/** §A-REVIEW-04 makes an UNKNOWN account for itself rather than only declaring itself. */
function readUnknown(lines, prose, sections, verdict) {
  const account = sections.found.get("Unknown-Account");
  const reasonRows = [...prose].filter((position) => lines[position].startsWith("Unknown-Reason:"));
  const reasons = reasonRows.map((position) => lines[position]);
  if (verdict !== "UNKNOWN") {
    if (account.length > 0) return fail("unknown_account", account[0]);
    if (reasons.length > 0) return fail("unknown_reason", 0);
    return {};
  }
  if (account.length !== 1) return fail("unknown_account", account[1] ?? 0);
  const findings = sections.at.get("Findings");
  const unknowns = sections.at.get("Unknowns");
  if (account[0] < findings || account[0] > unknowns) return fail("unknown_account", account[0]);
  const stated = [...prose].some(
    (position) => position > account[0] && position < unknowns && lines[position].trim() !== "",
  );
  if (!stated) return fail("unknown_account", account[0]);
  if (reasons.length !== 1) return fail("unknown_reason", account[0]);
  // The reason is part of the account it types, not a line found anywhere.
  if (reasonRows[0] < account[0] || reasonRows[0] > unknowns) {
    return fail("unknown_reason", reasonRows[0]);
  }
  const reason = reasons[0].match(/^Unknown-Reason: (\S+)$/u)?.[1];
  if (reason === undefined || !UNKNOWN_REASONS.has(reason))
    return fail("unknown_reason", account[0]);
  return {};
}

/** §A-REVIEW-04 refuses a section that is announced and then left empty. */
function bodyOf(lines, from, to) {
  return lines.slice(from + 1, to).filter((line) => line.trim() !== "");
}

/** §A-REVIEW-04 checks what each verdict owes in its evidence sections. */
function readEvidence(lines, prose, sections, header, index) {
  const at = sections.at;
  if (bodyOf(lines, at.get("Grounding"), at.get("Scope and checks")).length === 0) {
    return fail("grounding_missing", at.get("Grounding"));
  }
  for (const [label, end] of [
    ["Scope and checks", at.get("Findings")],
    ["Unknowns", at.get("Residual risks")],
    ["Residual risks", lines.length - 1],
  ]) {
    if (bodyOf(lines, at.get(label), end).length === 0)
      return fail("section_missing", at.get(label));
  }
  const unknown = readUnknown(lines, prose, sections, header.verdict);
  if (unknown.status === "malformed") return unknown;
  const findingsEnd =
    header.verdict === "UNKNOWN" ? sections.found.get("Unknown-Account")[0] : at.get("Unknowns");
  const findingBody = bodyOf(lines, at.get("Findings"), findingsEnd);
  if (header.verdict !== "FINDINGS") {
    if (index.keys.length > 0 || findingBody.length > 0) {
      return fail("pass_not_empty", at.get("Findings"));
    }
    return {};
  }
  if (index.keys.length === 0) return fail("counts_mismatch", header.countsRow);
  const span = { from: at.get("Findings"), to: findingsEnd };
  return readFindingBodies(lines, prose, span, index.keys);
}

/**
 * The report's lines, with at most one final line feed allowed after the footer.
 *
 * §A-REVIEW-04 makes `End-Review` the last line, so a second trailing line feed
 * is text after the footer rather than formatting. `null` answers a body that
 * does not end on its footer line.
 */
function reportLines(text) {
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body.split("\n");
}

/**
 * Validate one authoritative response against what the caller asked for.
 *
 * §A-REVIEW-04 lets the caller own the expected values: a report that is
 * internally consistent but answers a different dispatch, candidate or mode is
 * somebody else's report, and reading it as this one is the failure this
 * function exists to prevent.
 */
export function validateReport(text, expected) {
  const lines = reportLines(text);
  const prose = topLevelProse(text);
  const header = readHeader(lines, prose, expected);
  if (header.status === "malformed") return header;
  const sections = readSections(lines, prose, header.countsRow);
  if (sections.status === "malformed") return sections;
  const layout = readIndexLayout(lines, prose, header.countsRow + 1, sections.evidence);
  if (layout.status === "malformed") return layout;
  const index = readIndex(
    topLevelParagraphs(text),
    header.countsRow,
    sections.evidence,
    header.counts,
  );
  if (index.status === "malformed") return index;
  const evidence = readEvidence(lines, prose, sections, header, index);
  if (evidence.status === "malformed") return evidence;
  return {
    status: "valid",
    verdict: header.verdict,
    effective: header.effective,
    counts: header.counts,
    bytes: Buffer.byteLength(text),
  };
}

/** §A-REVIEW-04 states one machine-readable verdict line for the caller. */
export function reportLine(result) {
  if (result.status === "valid") {
    const counts = result.counts.map((count, step) => `P${step}=${count}`).join(",");
    return `MO-REVIEW-REPORT/1 status=valid verdict=${result.verdict} effective=${result.effective} counts=${counts} bytes=${result.bytes}`;
  }
  return `MO-REVIEW-REPORT/1 status=malformed reason=${result.reason} line=${result.line}`;
}

// Placeholders are ordinary prose inside sections, and no line starts with `<`:
// a line opening with an HTML block tag name such as `<head` would turn the
// rest of the section into an HTML block instead of prose.
const TEMPLATE_FINDING = [
  "F-001",
  "[P2] confirmed. Causal path: <what the candidate does, step by step, until it fails>.",
  "Impact: <who or what breaks, and when>. Location: <path:line at the candidate SHA>.",
  "Proof: <SHA-bound command or trace that shows it>. Invariant after the fix: <the property",
  "that must hold>. Direction: <technical direction>; depth: local patch. Regression",
  "case: <input and state>, <expected behavior>, <where the check belongs>.",
];

/** The sections every verdict fills; only `Findings` and the UNKNOWN account differ. */
function templateSections(verdict, unknownReason) {
  const findings = verdict === "FINDINGS" ? ["", ...TEMPLATE_FINDING] : [];
  const account =
    verdict === "UNKNOWN"
      ? [
          "",
          "Unknown-Account",
          `Unknown-Reason: ${unknownReason}`,
          "Account: <completed stages, covered scope, the blocking public observation and",
          "the recovery evidence>.",
        ]
      : [];
  return [
    "Evidence report",
    "",
    "Grounding",
    "HEAD: <output of `git rev-parse HEAD`>; `git status --porcelain`: <empty>.",
    "Read: <intent, instructions, specification and scope>.",
    "",
    "Scope and checks",
    "Read by SHA: <the read-only commands used>. No tests, lint or QC were run.",
    "",
    "Findings",
    ...findings,
    ...account,
    "",
    "Unknowns",
    "Unproven: <what stayed unproven, or none>.",
    "",
    "Residual risks",
    "Risks: <pre-existing or out-of-scope risks, or none>.",
  ];
}

/**
 * Print a complete body that this module's own validator accepts.
 *
 * §A-REVIEW-04 gives the reviewer a literal to copy instead of a description to
 * reconstruct: two rounds burned on a header rebuilt from prose. The
 * placeholders are prose inside sections, so the template validates as printed
 * and a reviewer who fills it in cannot break the structure by filling it in.
 */
export function reportTemplate({ verdict, dispatch, candidate, requested, effective, reason }) {
  if (!VERDICTS.includes(verdict)) return { error: "--verdict must be PASS, FINDINGS or UNKNOWN" };
  if (typeof dispatch !== "string" || !/^\S+$/u.test(dispatch)) return { error: "--dispatch" };
  if (!SHA.test(candidate ?? "")) return { error: "--candidate must be a full 40-hex SHA" };
  if (!MODES.has(requested) || !MODES.has(effective)) {
    return { error: "--requested and --effective must be fast, deep or follow_up" };
  }
  if ((verdict === "UNKNOWN") !== (reason !== undefined)) {
    return { error: "--unknown-reason is required for UNKNOWN and only for UNKNOWN" };
  }
  if (reason !== undefined && !UNKNOWN_REASONS.has(reason)) {
    return { error: `--unknown-reason must be one of ${[...UNKNOWN_REASONS].join("|")}` };
  }
  const p2 = verdict === "FINDINGS" ? 1 : 0;
  const lines = [
    `Review-Execution: ${dispatch}`,
    `Candidate: ${candidate}`,
    `Mode: requested=${requested} effective=${effective}`,
    "Delegation: none",
    `Verdict: ${verdict}`,
    `Counts: P0=0 P1=0 P2=${p2} P3=0`,
    "",
    ...(verdict === "FINDINGS" ? ["F-001 [P2] <One sentence naming the defect>.", ""] : []),
    ...templateSections(verdict, reason),
    "",
    `End-Review: ${dispatch}`,
  ];
  return { text: `${lines.join("\n")}\n` };
}
