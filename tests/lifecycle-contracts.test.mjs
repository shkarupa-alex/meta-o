/**
 * Execute deterministic projections of the issue, review, session and CI contracts.
 *
 * Protects §A-ISSUE-01, §A-REVIEW-04, §A-RESPONSE-03, §A-SESSION-01,
 * §A-DELIVERY-01 and §A-WAIT-01.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import yaml from "js-yaml";
import MarkdownIt from "markdown-it";

import { stripSourceAnchors } from "../tools/build-skills.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const markdown = new MarkdownIt();

function source(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

/** §A-ISSUE-01 reads the canonical matrix through Markdown parser tokens. */
function firstTable(document) {
  const tokens = markdown.parse(document, {});
  const start = tokens.findIndex(({ type }) => type === "table_open");
  assert.notEqual(start, -1, "normative table missing");
  const rows = [];
  let row = null;
  for (const token of tokens.slice(start + 1)) {
    if (token.type === "table_close") break;
    if (token.type === "tr_open") row = [];
    if (token.type === "inline" && row) row.push(token.content.trim());
    if (token.type === "tr_close") rows.push(row);
  }
  return rows;
}

function markdownTables(document) {
  const tokens = markdown.parse(document, {});
  const tables = [];
  let rows = null;
  let row = null;
  for (const token of tokens) {
    if (token.type === "table_open") rows = [];
    if (token.type === "tr_open") row = [];
    if (token.type === "inline" && row) row.push(token.content.trim());
    if (token.type === "tr_close") rows.push(row);
    if (token.type === "table_close") {
      tables.push(rows);
      rows = null;
      row = null;
    }
  }
  return tables;
}

test("the Issue decision table is rectangular, total and fail-closed", () => {
  const rows = firstTable(source("shared/references/issue-routing.md"));
  assert.deepEqual(rows[0], [
    "scenario_id",
    "disposition_class",
    "inputs",
    "required_action",
    "forbidden_action",
    "evidence",
  ]);
  for (const row of rows) {
    assert.equal(row.length, rows[0].length);
    assert.ok(row.every(Boolean));
  }
  assert.deepEqual(
    rows.slice(1).map(([scenario]) => scenario),
    [
      "ISS-01",
      "ISS-02",
      "ISS-03",
      "ISS-04",
      "ISS-05",
      "ISS-06",
      "ISS-07A",
      "ISS-07B",
      "ISS-07C",
      "ISS-08",
      "ISS-09",
      "ISS-10",
      "ISS-11",
      "ISS-12",
      "ISS-13",
      "ISS-14",
      "ISS-15",
    ],
  );
  const tokens = markdown.parse(source("shared/references/issue-routing.md"), {});
  const vocabulary = tokens.find(
    ({ type, content }) =>
      type === "inline" && content.startsWith("`disposition_class` имеет closed vocabulary"),
  );
  const values = vocabulary.children
    .filter(({ type }) => type === "code_inline")
    .map(({ content }) => content);
  const allowed = new Set(values.slice(1, values.indexOf("required_action")));
  assert.deepEqual(
    [...allowed],
    ["upstream_issue", "project_issue", "unconfirmed", "either", "mixed"],
  );
  for (const [scenario, appliesTo, , action, forbidden] of rows.slice(1)) {
    assert.ok(allowed.has(appliesTo), `${scenario}: invalid route context`);
    assert.ok(action.length > 3, `${scenario}: action missing`);
    if (["ISS-02", "ISS-03", "ISS-12"].includes(scenario)) {
      assert.match(action, /needs_attention/u);
      assert.match(forbidden, /[Gg]uess|origin|tracking|[Pp]ick|infer/u);
    }
  }
});

test("the installable orchestrator carries the complete Issue-routing contract", () => {
  const shared = source("shared/references/issue-routing.md");
  assert.equal(
    source("skills/mo-orchestrate-orca/references/issue-routing.md"),
    stripSourceAnchors(shared),
  );
  assert.match(
    source("skills/mo-orchestrate-orca/SKILL.md"),
    /\[Маршрутизация подтверждённой внешней работы\]\(references\/issue-routing\.md\)/u,
  );
  for (const scenario of ["ISS-01", "ISS-07A", "ISS-10", "ISS-15"]) {
    assert.match(shared, new RegExp(`\\| ${scenario}\\s+\\|`, "u"));
  }
  assert.match(shared, /glab issue note.*glab api --hostname.*--input/su);
});

test("Issue disposition records have the spec-owned fields and closed outcomes", () => {
  const shared = source("shared/references/issue-routing.md");
  for (const field of [
    "Scenario",
    "Class",
    "Repository",
    "Search",
    "Action",
    "Canonical-URL",
    "Outcome",
  ]) {
    assert.ok(shared.includes(`\`${field}\``), `${field}: disposition field missing`);
  }
  for (const outcome of [
    "implemented",
    "commented",
    "created",
    "duplicate",
    "refuted",
    "needs_attention",
  ]) {
    assert.ok(shared.includes(`\`${outcome}\``), `${outcome}: outcome missing`);
  }
  assert.match(shared, /commented.*created.*duplicate.*Canonical-URL.*обязательно/su);
  assert.match(shared, /needs_attention.*обязательна причина/su);
  assert.match(shared, /needs_attention.*failed write/su);
});

test("the harvested intake has one closed disposition for every BKL source", () => {
  const table = markdownTables(source("docs/acceptance.md")).find(
    ([header]) =>
      JSON.stringify(header) ===
      JSON.stringify(["Источник", "Исход", "Долговечное доказательство"]),
  );
  assert.ok(table, "BKL harvest table missing");
  const rows = table.slice(1);
  assert.deepEqual(
    rows.map(([id]) => id),
    Array.from({ length: 19 }, (_, index) => `BKL-${String(index).padStart(2, "0")}`),
  );
  assert.equal(new Set(rows.map(([id]) => id)).size, 19);
  const outcomes = new Set(["implemented", "refuted", "duplicate", "needs_attention"]);
  for (const [id, outcome, evidence] of rows) {
    assert.ok(outcomes.has(outcome), `${id}: unknown harvested outcome`);
    assert.ok(evidence.length > 8, `${id}: durable evidence missing`);
  }
  for (const id of ["BKL-04", "BKL-06", "BKL-09", "BKL-15"]) {
    const evidence = rows.find(([sourceId]) => sourceId === id)[2];
    assert.match(evidence, /https:\/\/|`unsupported`/u, `${id}: workaround disposition missing`);
  }
});

/** §A-REVIEW-04 gets only top-level prose lines from the CommonMark block AST. */
function topLevelProseLines(report) {
  const positions = new Set();
  for (const token of markdown.parse(report, {})) {
    if (token.type !== "paragraph_open" || token.level !== 0 || !token.map) continue;
    for (let index = token.map[0]; index < token.map[1]; index += 1) positions.add(index);
  }
  return positions;
}

/** §A-REVIEW-04 validates anchored report sections without parsing finding prose. */
function structuralLines(lines, labels, topLevel) {
  const positions = new Map(labels.map((label) => [label, []]));
  for (const index of topLevel) {
    const line = lines[index];
    if (positions.has(line)) positions.get(line).push(index);
  }
  return positions;
}

/** §A-REVIEW-04 treats quoted envelope words as body bytes, never control markers. */
function validateReport(report, expected) {
  assert.ok(expected, "external review context missing");
  const lines = report.trimEnd().split("\n");
  const execution = lines[0]?.match(/^Review-Execution: (\S+)$/u)?.[1];
  const candidate = lines[1]?.match(/^Candidate: ([a-f0-9]{40})$/u)?.[1];
  const mode = lines[2]?.match(
    /^Mode: requested=(fast|deep|follow_up) effective=(fast|deep|follow_up)$/u,
  );
  const verdict = lines[4]?.match(/^Verdict: (PASS|FINDINGS|UNKNOWN)$/u)?.[1];
  const counts = lines[5]?.match(/^Counts: P0=(\d+) P1=(\d+) P2=(\d+) P3=(\d+)$/u);
  assert.ok(execution && candidate && mode && verdict && counts, "invalid header");
  assert.equal(execution, expected.execution, "review execution mismatch");
  assert.equal(candidate, expected.candidate, "candidate mismatch");
  assert.equal(mode[1], expected.requestedMode, "requested mode mismatch");
  assert.equal(mode[2], expected.effectiveMode, "effective mode mismatch");
  assert.equal(lines[3], "Delegation: none");
  assert.equal(lines.at(-1), `End-Review: ${execution}`);
  const labels = [
    "Evidence report",
    "Grounding",
    "Scope and checks",
    "Findings",
    "Unknown-Account",
    "Unknowns",
    "Residual risks",
  ];
  const topLevel = topLevelProseLines(report);
  const structural = structuralLines(lines, labels, topLevel);
  const unique = (label) => {
    const matches = structural.get(label);
    assert.equal(matches.length, 1, `${label}: needs one unquoted structural marker`);
    return matches[0];
  };
  const evidence = unique("Evidence report");
  const order = ["Grounding", "Scope and checks", "Findings", "Unknowns", "Residual risks"];
  const positions = order.map(unique);
  assert.ok(evidence > 5 && positions.every((position) => position > evidence));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  const index = lines
    .slice(6, evidence)
    .filter((line) => line && !line.startsWith("Unknown-Reason:"));
  const keys = index.map((line) => line.match(/^(F-\d{3}) \[(P[0-3])\] .+/u));
  assert.ok(keys.every(Boolean));
  assert.deepEqual(
    keys.map((key) => key[1]),
    keys.map((_, index) => `F-${String(index + 1).padStart(3, "0")}`),
    "finding index keys must be unique and monotonic",
  );
  const total = counts.slice(1).reduce((sum, count) => sum + Number(count), 0);
  assert.equal(total, keys.length);
  const severityCounts = [0, 0, 0, 0];
  for (const key of keys) severityCounts[Number(key[2].slice(1))] += 1;
  assert.deepEqual(severityCounts, counts.slice(1).map(Number));
  const body = (heading, next) => lines.slice(unique(heading) + 1, unique(next)).filter(Boolean);
  assert.ok(body("Grounding", "Scope and checks").length > 0);
  assert.ok(body("Scope and checks", "Findings").length > 0);
  assert.ok(body("Unknowns", "Residual risks").length > 0);
  assert.ok(lines.slice(unique("Residual risks") + 1, -1).filter(Boolean).length > 0);
  const findingsEnd = verdict === "UNKNOWN" ? "Unknown-Account" : "Unknowns";
  const findingBody = body("Findings", findingsEnd);
  if (verdict === "PASS") {
    assert.equal(keys.length, 0);
    assert.deepEqual(findingBody, []);
  }
  if (verdict === "FINDINGS") {
    assert.ok(keys.length > 0);
    const findingStart = unique("Findings") + 1;
    const findingEnd = unique(findingsEnd);
    const bodyKeys = [...topLevel]
      .filter((position) => position >= findingStart && position < findingEnd)
      .map((position) => ({ match: lines[position].match(/^(F-\d{3})$/u), position }))
      .filter(({ match }) => match);
    assert.deepEqual(
      bodyKeys.map(({ match }) => match[1]),
      keys.map((key) => key[1]),
      "finding bodies must correspond one-to-one with the index",
    );
    for (const [index, { position }] of bodyKeys.entries()) {
      const expectedSeverity = keys[index][2];
      const nextBody = bodyKeys[index + 1]?.position ?? findingEnd;
      const detail = [...topLevel]
        .filter((line) => line > position && line < nextBody && lines[line] !== "")
        .map((line) => lines[line]);
      assert.ok(detail.length > 0, `${keys[index][1]}: finding body is empty`);
      assert.match(detail[0], new RegExp(`^\\[${expectedSeverity}\\](?:\\s|$)`));
    }
  }
  if (verdict === "UNKNOWN") {
    assert.equal(keys.length, 0);
    assert.deepEqual(findingBody, []);
    const account = unique("Unknown-Account");
    assert.ok(account > unique("Findings") && account < unique("Unknowns"));
    assert.ok(
      [...topLevel].some(
        (position) =>
          position > account && position < unique("Unknowns") && lines[position].trim() !== "",
      ),
    );
    const reasons = [...topLevel]
      .map((position) => lines[position])
      .filter((line) => line.startsWith("Unknown-Reason:"));
    assert.equal(reasons.length, 1);
    assert.match(
      reasons[0],
      /^Unknown-Reason: (?:unreadable|candidate_mismatch|dirty_candidate|malformed_report|retrieval_failure|handoff_failure|review_incomplete)$/u,
    );
  } else {
    assert.equal(structural.get("Unknown-Account").length, 0);
    assert.equal(
      [...topLevel].some((position) => lines[position].startsWith("Unknown-Reason:")),
      false,
    );
  }
  return true;
}

function settleReportAttempts(reports, expected) {
  for (const [index, report] of reports.entries()) {
    try {
      validateReport(report, expected);
      return { status: "accepted", attempts: index + 1 };
    } catch {
      if (index === 0 && reports.length > 1) continue;
      return { status: "UNKNOWN", reason: "malformed_report", attempts: index + 1 };
    }
  }
  return { status: "UNKNOWN", reason: "review_incomplete", attempts: 0 };
}

test("PASS, FINDINGS and UNKNOWN fixtures preserve the canonical review envelope", () => {
  const base = (verdict, counts, index, findings, extra = "", mode = "deep") =>
    `Review-Execution: ctx_fixture\nCandidate: ${"a".repeat(40)}\n` +
    `Mode: requested=${mode} effective=${mode}\nDelegation: none\nVerdict: ${verdict}\n` +
    `Counts: ${counts}\n\n${index}Evidence report\nGrounding\nintent and clean SHA\n` +
    `Scope and checks\nread-only diff and tests\nFindings\n${findings}${extra}` +
    "Unknowns\nnone\nResidual risks\nnone\nEnd-Review: ctx_fixture\n";
  const context = (mode = "deep") => ({
    execution: "ctx_fixture",
    candidate: "a".repeat(40),
    requestedMode: mode,
    effectiveMode: mode,
  });
  const validateFixture = (report, mode = "deep") => validateReport(report, context(mode));
  assert.ok(validateFixture(base("PASS", "P0=0 P1=0 P2=0 P3=0", "", "")));
  assert.ok(
    validateFixture(
      base(
        "FINDINGS",
        "P0=0 P1=0 P2=1 P3=0",
        "F-001 [P2] Broken boundary.\n\n",
        "F-001\n[P2] confirmed; causal path, impact, location, boundary repair and proof.\n",
      ),
    ),
  );
  assert.ok(
    validateFixture(
      base(
        "FINDINGS",
        "P0=0 P1=0 P2=1 P3=0",
        "F-001 [P2] Every CommonMark container is body evidence.\n\n",
        "F-001\n[P2] confirmed.\n\n~~~~text\nFindings\nF-002\nResidual risks\n~~~~\n\n    Unknowns\n    End-Review: ctx_fake\n\n> Evidence report\n> Unknown-Account\n\n",
      ),
    ),
  );
  assert.ok(
    validateFixture(
      base(
        "FINDINGS",
        "P0=0 P1=0 P2=1 P3=0",
        "F-001 [P2] Quoted markers are body bytes.\n\n",
        "F-001\n[P2] confirmed.\n```text\nCounts: P0=9 P1=9 P2=9 P3=9\nEvidence report\nFindings\nUnknown-Account\nEnd-Review: ctx_fake\n```\n",
      ),
    ),
  );
  assert.ok(
    validateFixture(
      base(
        "FINDINGS",
        "P0=0 P1=0 P2=1 P3=0",
        "F-001 [P2] Boundary remains broken.\n\n",
        "F-001\n[P2] confirmed; causal path, impact, location, boundary repair and proof.\n",
        "",
        "follow_up",
      ),
      "follow_up",
    ),
  );
  assert.ok(
    validateFixture(
      base(
        "UNKNOWN",
        "P0=0 P1=0 P2=0 P3=0",
        "Unknown-Reason: review_incomplete\n\n",
        "",
        "Unknown-Account\ncovered scope and blocking public observation\n",
      ),
    ),
  );
  assert.throws(
    () =>
      validateFixture(base("PASS", "P0=0 P1=0 P2=0 P3=0", "", "").replace(/End-Review:.+/u, "")),
    /Expected values/u,
  );
  assert.throws(
    () =>
      validateFixture(
        base(
          "FINDINGS",
          "P0=0 P1=0 P2=2 P3=0",
          "F-001 [P2] First.\nF-002 [P2] Second.\n\n",
          "F-001\n[P2] one body only.\n",
        ),
      ),
    /one-to-one/u,
  );
  assert.throws(
    () =>
      validateFixture(
        base(
          "FINDINGS",
          "P0=0 P1=1 P2=0 P3=0",
          "F-001 [P1] Severe.\n\n",
          "F-001\n[P2] mismatched body severity.\n",
        ),
      ),
    /regular expression/u,
  );
  assert.throws(
    () =>
      validateFixture(
        base(
          "UNKNOWN",
          "P0=0 P1=0 P2=0 P3=0",
          "Unknown-Reason: anything\n\n",
          "",
          "Unknown-Account\ncovered scope and blocking public observation\n",
        ),
      ),
    /regular expression/u,
  );
  for (const [field, replacement] of [
    ["Candidate", `Candidate: ${"b".repeat(40)}`],
    ["Review-Execution", "Review-Execution: ctx_stale"],
    ["Mode", "Mode: requested=fast effective=deep"],
  ]) {
    const valid = base("PASS", "P0=0 P1=0 P2=0 P3=0", "", "");
    assert.throws(
      () => validateFixture(valid.replace(new RegExp(`^${field}:.*`, "mu"), replacement)),
      /mismatch/u,
    );
  }
  const malformed = base("PASS", "P0=0 P1=0 P2=0 P3=0", "", "").replace(/End-Review:.+/u, "");
  const valid = base("PASS", "P0=0 P1=0 P2=0 P3=0", "", "");
  assert.deepEqual(settleReportAttempts([malformed, valid], context()), {
    status: "accepted",
    attempts: 2,
  });
  assert.deepEqual(settleReportAttempts([malformed, malformed], context()), {
    status: "UNKNOWN",
    reason: "malformed_report",
    attempts: 2,
  });
});

test("every first-party test entrypoint preserves provider process isolation", () => {
  const makefile = source("Makefile");
  const pkg = JSON.parse(source("package.json"));
  assert.equal(pkg.scripts.test, "make mo-test");
  assert.match(makefile, /! -name 'provider-posture\.test\.mjs'/u);
  assert.match(makefile, /node --test tests\/provider-posture\.test\.mjs/u);
  assert.doesNotMatch(pkg.scripts.test, /tests\/\*\.test\.mjs/u);
});

/** §A-BACKLOG-01 rejects conditional jobs and prerequisites it cannot prove reachable. */
function githubJobAutomatic(job) {
  const commandSteps = (job.steps ?? []).filter(({ run = "" }) => run === "make mo-backlog");
  return (
    job.if === undefined &&
    job.needs === undefined &&
    job["continue-on-error"] !== true &&
    commandSteps.every((step) => step.if === undefined && step["continue-on-error"] !== true)
  );
}

/** §A-BACKLOG-01 recognizes the literal unfiltered pull-request subset. */
function githubPullRequestReachable(root, events) {
  const pullRequest = root?.on?.pull_request;
  if (!events.includes("pull_request")) return false;
  if (pullRequest === null) return true;
  if (!pullRequest || typeof pullRequest !== "object" || Array.isArray(pullRequest)) return false;
  const pullRequestKeys =
    pullRequest && typeof pullRequest === "object" ? Object.keys(pullRequest) : [];
  if (pullRequestKeys.length === 0) return true;
  const branches = pullRequest.branches;
  return (
    pullRequestKeys.length === 1 &&
    pullRequestKeys[0] === "branches" &&
    Array.isArray(branches) &&
    branches.length === 1 &&
    branches[0] === "develop"
  );
}

/** §A-BACKLOG-01 recognizes an unconditional merge-queue trigger. */
function githubMergeGroupReachable(root, events) {
  const mergeGroup = root?.on?.merge_group;
  return (
    events.includes("merge_group") &&
    (mergeGroup === null ||
      (typeof mergeGroup === "object" &&
        !Array.isArray(mergeGroup) &&
        Object.keys(mergeGroup).length === 0))
  );
}

/** §A-BACKLOG-01 binds one literal GitHub job to its trigger and hosting policy. */
function githubCoverage(documents, hosting) {
  const root = documents[0].parsed;
  const events = Object.keys(root?.on ?? {});
  const jobs = Object.entries(root?.jobs ?? {});
  const byPath = new Map(documents.map((document) => [document.path, document.parsed]));
  const jobCoverage = (job, stack = new Set()) => {
    if (typeof job?.uses === "string") {
      if (!job.uses.startsWith("./.github/workflows/")) throw new Error("unsupported workflow use");
      const path = job.uses.slice(2);
      if (stack.has(path) || !byPath.has(path)) throw new Error("workflow cycle or missing file");
      const called = byPath.get(path);
      if (!Object.hasOwn(called?.on ?? {}, "workflow_call")) {
        throw new Error("called workflow is not reusable");
      }
      const next = new Set(stack).add(path);
      const covered = Object.values(called.jobs ?? {}).filter((child) => jobCoverage(child, next));
      return covered.length === 1 && githubJobAutomatic(job) && githubJobAutomatic(covered[0]);
    }
    return (job?.steps ?? []).some(({ run = "" }) => run === "make mo-backlog");
  };
  let commandJobs;
  try {
    commandJobs = jobs.filter(([, job]) => jobCoverage(job));
  } catch {
    return "unknown";
  }
  const automatic = commandJobs.every(([, job]) => githubJobAutomatic(job));
  const pullRequestReachable = githubPullRequestReachable(root, events);
  const mergeGroupReachable = githubMergeGroupReachable(root, events);
  if (
    !pullRequestReachable ||
    events.includes("pull_request_target") ||
    commandJobs.length !== 1 ||
    !automatic
  )
    return "unknown";
  const required =
    hosting.workflowActive === true &&
    hosting.requiredCheck === commandJobs[0][0] &&
    (hosting.mergeQueueEnabled === false ||
      (hosting.mergeQueueEnabled === true && mergeGroupReachable));
  return required ? "covered" : "config_present";
}

/** §A-BACKLOG-01 binds one literal GitLab job to MR rules and hosting policy. */
function exactGitlabRule(rule, condition, allowedWhen) {
  return (
    rule &&
    Object.keys(rule).every((key) => new Set(["if", "when"]).has(key)) &&
    rule.if === condition &&
    allowedWhen.has(rule.when)
  );
}

function gitlabWorkflowReachable(workflowRules) {
  return (
    workflowRules === undefined ||
    (Array.isArray(workflowRules) &&
      workflowRules.length === 1 &&
      exactGitlabRule(workflowRules[0], "$CI_MERGE_REQUEST_ID", new Set([undefined, "always"])))
  );
}

function gitlabCoverage(documents, hosting) {
  const reserved = new Set(["include", "stages", "workflow", "default", "variables"]);
  const jobs = documents.flatMap(({ parsed }) =>
    Object.entries(parsed ?? {}).filter(([name, value]) => !reserved.has(name) && value?.script),
  );
  const commandJobs = jobs.filter(([, job]) =>
    (Array.isArray(job.script) ? job.script : [job.script]).includes("make mo-backlog"),
  );
  if (commandJobs.length !== 1) return "unknown";
  const [jobName, job] = commandJobs[0];
  const rules = Array.isArray(job.rules) ? job.rules : [];
  const noCompetingReachability = job.only === undefined && job.except === undefined;
  const supportedRule =
    noCompetingReachability &&
    rules.length === 1 &&
    rules.every((rule) =>
      exactGitlabRule(
        rule,
        "$CI_PIPELINE_SOURCE == 'merge_request_event'",
        new Set([undefined, "on_success"]),
      ),
    );
  const only = Array.isArray(job.only) ? job.only : [job.only];
  const supportedOnly =
    job.rules === undefined &&
    job.except === undefined &&
    only.length === 1 &&
    only[0] === "merge_requests";
  const mergeRequest = supportedRule || supportedOnly;
  const workflowRules = documents[0].parsed?.workflow?.rules;
  const workflowReachable = gitlabWorkflowReachable(workflowRules);
  const failureBlocks = job.allow_failure === undefined || job.allow_failure === false;
  const hasUnprovedDependency = job.needs !== undefined;
  const automatic =
    failureBlocks && !hasUnprovedDependency && new Set([undefined, "on_success"]).has(job.when);
  if (!mergeRequest || !workflowReachable || !automatic) return "unknown";
  const required =
    hosting.ciEnabled === true &&
    hosting.requiredJob === jobName &&
    hosting.mergeRequestPipelines === true &&
    hosting.mergeTrains === true;
  return required ? "covered" : "config_present";
}

/** §A-BACKLOG-01 evaluates only the finite literal GitHub/GitLab CI subset. */
function ciCoverage({ provider, entrypoint, files, hosting = {} }) {
  if (!entrypoint || !Object.hasOwn(files, entrypoint)) return "no_ci_surface";
  const seen = new Set();
  const documents = [];
  const visit = (path) => {
    if (seen.has(path)) throw new Error("include cycle");
    seen.add(path);
    const text = files[path];
    if (typeof text !== "string" || text.includes("${{")) throw new Error("unknown construct");
    const parsed = yaml.load(text);
    documents.push({ path, parsed });
    const includes = Array.isArray(parsed?.include)
      ? parsed.include
      : parsed?.include
        ? [parsed.include]
        : [];
    for (const include of includes) {
      const local = typeof include === "string" ? include : include?.local;
      if (!local || !Object.hasOwn(files, local)) throw new Error("remote or dynamic include");
      visit(local);
    }
    if (provider === "github") {
      for (const job of Object.values(parsed?.jobs ?? {})) {
        if (job?.uses === undefined) continue;
        if (
          typeof job.uses !== "string" ||
          !job.uses.startsWith("./.github/workflows/") ||
          job.uses.includes("..")
        ) {
          throw new Error("remote or dynamic workflow use");
        }
        const local = job.uses.slice(2);
        if (!Object.hasOwn(files, local)) throw new Error("missing reusable workflow");
        visit(local);
      }
    }
  };
  try {
    visit(entrypoint);
  } catch {
    return "unknown";
  }
  if (provider === "github") return githubCoverage(documents, hosting);
  if (provider === "gitlab") return gitlabCoverage(documents, hosting);
  return "unknown";
}

test("the hosted workflow stays provable and gives mo-qc the full history", () => {
  const path = ".github/workflows/mo-qc.yml";
  const text = source(path);
  assert.equal(
    ciCoverage({ provider: "github", entrypoint: path, files: { [path]: text } }),
    "config_present",
  );
  // mo-qc reads historical objects (backlog provenance, knowledge history,
  // legacy eval evidence), which a default depth-1 checkout does not contain.
  const checkout = yaml
    .load(text)
    .jobs["mo-qc"].steps.find((step) => String(step.uses).startsWith("actions/checkout@"));
  assert.equal(checkout?.with?.["fetch-depth"], 0);
});

test("GitHub CI fixtures never invent candidate reachability or required policy", () => {
  const ordinary =
    "on:\n  pull_request:\n    branches: [develop]\njobs:\n  backlog:\n    steps:\n      - run: make mo-backlog\n";
  assert.equal(
    ciCoverage({ provider: "github", entrypoint: "ci.yml", files: { "ci.yml": ordinary } }),
    "config_present",
  );
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: "ci.yml",
      files: { "ci.yml": ordinary },
      hosting: { workflowActive: true, requiredCheck: "backlog", mergeQueueEnabled: false },
    }),
    "covered",
  );
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: "ci.yml",
      files: { "ci.yml": ordinary.replace("- run:", "- if: false\n        run:") },
      hosting: { workflowActive: true, requiredCheck: "backlog" },
    }),
    "unknown",
  );
  const protectedHosting = {
    workflowActive: true,
    requiredCheck: "backlog",
    mergeQueueEnabled: false,
  };
  for (const invalidTrigger of [
    ordinary.replace("  pull_request:\n    branches: [develop]", "  pull_request: false"),
    ordinary.replace("branches: [develop]", "branches: develop"),
    ordinary.replace("branches: [develop]", "branches: [develop, '!develop']"),
  ]) {
    assert.equal(
      ciCoverage({
        provider: "github",
        entrypoint: "ci.yml",
        files: { "ci.yml": invalidTrigger },
        hosting: protectedHosting,
      }),
      "unknown",
    );
  }
  const pathFiltered = ordinary.replace(
    "    branches: [develop]",
    "    branches: [develop]\n    paths-ignore: [docs/backlog.md, shared/scripts/mo-backlog.mjs]",
  );
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: "ci.yml",
      files: { "ci.yml": pathFiltered },
      hosting: protectedHosting,
    }),
    "unknown",
  );
  const skippedDependency =
    "on:\n  pull_request:\n    branches: [develop]\njobs:\n" +
    "  prepare:\n    if: false\n    steps:\n      - run: echo skipped\n" +
    "  backlog:\n    needs: prepare\n    steps:\n      - run: make mo-backlog\n";
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: "ci.yml",
      files: { "ci.yml": skippedDependency },
      hosting: protectedHosting,
    }),
    "unknown",
  );
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: "ci.yml",
      files: { "ci.yml": ordinary },
      hosting: { ...protectedHosting, mergeQueueEnabled: true },
    }),
    "config_present",
  );
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: "ci.yml",
      files: { "ci.yml": ordinary.replace("jobs:", "  merge_group:\njobs:") },
      hosting: { ...protectedHosting, mergeQueueEnabled: true },
    }),
    "covered",
  );
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: "ci.yml",
      files: { "ci.yml": ordinary.replace("jobs:", "  merge_group: []\njobs:") },
      hosting: { ...protectedHosting, mergeQueueEnabled: true },
    }),
    "config_present",
  );
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: "ci.yml",
      files: { "ci.yml": ordinary.replace("make mo-backlog", "${{ matrix.command }}") },
    }),
    "unknown",
  );
});

test("GitHub local reusable workflows are resolved through a finite literal call graph", () => {
  const entry =
    "on:\n  pull_request:\n    branches: [develop]\njobs:\n  backlog:\n    uses: ./.github/workflows/backlog.yml\n";
  const called =
    "on:\n  workflow_call:\njobs:\n  gate:\n    steps:\n      - run: make mo-backlog\n";
  const files = {
    ".github/workflows/ci.yml": entry,
    ".github/workflows/backlog.yml": called,
  };
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: ".github/workflows/ci.yml",
      files,
      hosting: { workflowActive: true, requiredCheck: "backlog", mergeQueueEnabled: false },
    }),
    "covered",
  );
  for (const uses of [
    "./.github/workflows/missing.yml",
    "./.github/workflows/../secret.yml",
    "owner/repo/.github/workflows/backlog.yml@main",
    "${{ inputs.workflow }}",
  ]) {
    assert.equal(
      ciCoverage({
        provider: "github",
        entrypoint: ".github/workflows/ci.yml",
        files: {
          ...files,
          ".github/workflows/ci.yml": entry.replace("./.github/workflows/backlog.yml", uses),
        },
      }),
      "unknown",
    );
  }
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: ".github/workflows/ci.yml",
      files: {
        ...files,
        ".github/workflows/backlog.yml":
          "on:\n  workflow_call:\njobs:\n  again:\n    uses: ./.github/workflows/backlog.yml\n",
      },
    }),
    "unknown",
  );
});

test("GitLab CI fixtures never invent candidate reachability or required policy", () => {
  const gitlab =
    "include:\n  - local: jobs.yml\nworkflow:\n  rules:\n    - if: $CI_MERGE_REQUEST_ID\n";
  const job =
    "backlog:\n  script:\n    - make mo-backlog\n  rules:\n    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'\n";
  for (const files of [
    {
      ".gitlab-ci.yml": gitlab,
      "jobs.yml":
        "backlog:\n  script: make mo-backlog\n  only: merge_requests\n  except: schedules\n",
    },
    {
      ".gitlab-ci.yml":
        "include:\n  - local: jobs.yml\nworkflow:\n  rules:\n    - if: $CI_MERGE_REQUEST_ID\n      changes: [src/**]\n",
      "jobs.yml": job,
    },
    {
      ".gitlab-ci.yml": `${gitlab}      when: on_success\n`,
      "jobs.yml": job,
    },
  ]) {
    assert.equal(
      ciCoverage({
        provider: "gitlab",
        entrypoint: ".gitlab-ci.yml",
        files,
        hosting: {
          ciEnabled: true,
          requiredJob: "backlog",
          mergeRequestPipelines: true,
          mergeTrains: true,
        },
      }),
      "unknown",
    );
  }
  assert.equal(
    ciCoverage({
      provider: "gitlab",
      entrypoint: ".gitlab-ci.yml",
      files: { ".gitlab-ci.yml": gitlab, "jobs.yml": job },
    }),
    "config_present",
  );
  assert.equal(
    ciCoverage({
      provider: "gitlab",
      entrypoint: ".gitlab-ci.yml",
      files: {
        ".gitlab-ci.yml": gitlab,
        "jobs.yml":
          "backlog:\n  script: make mo-backlog\nverify:\n  script: echo ok\n  rules:\n    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'\n",
      },
    }),
    "unknown",
  );
  assert.equal(
    ciCoverage({
      provider: "gitlab",
      entrypoint: ".gitlab-ci.yml",
      files: { ".gitlab-ci.yml": gitlab, "jobs.yml": job },
      hosting: {
        ciEnabled: true,
        requiredJob: "backlog",
        mergeRequestPipelines: true,
        mergeTrains: true,
      },
    }),
    "covered",
  );
  for (const unsafeJobSuffix of ["  allow_failure:\n    exit_codes: [2]\n", "  needs: prepare\n"]) {
    assert.equal(
      ciCoverage({
        provider: "gitlab",
        entrypoint: ".gitlab-ci.yml",
        files: {
          ".gitlab-ci.yml": gitlab,
          "jobs.yml":
            `${job}${unsafeJobSuffix}` +
            (unsafeJobSuffix === "  needs: prepare\n"
              ? "prepare:\n  script: echo ok\n  when: never\n"
              : ""),
        },
        hosting: {
          ciEnabled: true,
          requiredJob: "backlog",
          mergeRequestPipelines: true,
          mergeTrains: true,
        },
      }),
      "unknown",
    );
  }
  for (const rejectedRule of [
    "- if: $CI_PIPELINE_SOURCE == 'merge_request_event'\n      when: never",
    "- if: $CI_PIPELINE_SOURCE != 'merge_request_event'",
  ]) {
    assert.equal(
      ciCoverage({
        provider: "gitlab",
        entrypoint: ".gitlab-ci.yml",
        files: {
          ".gitlab-ci.yml": gitlab,
          "jobs.yml": `backlog:\n  script: make mo-backlog\n  rules:\n    ${rejectedRule}\n`,
        },
        hosting: {
          ciEnabled: true,
          requiredJob: "backlog",
          mergeRequestPipelines: true,
          mergeTrains: true,
        },
      }),
      "unknown",
    );
  }
  assert.equal(
    ciCoverage({
      provider: "gitlab",
      entrypoint: ".gitlab-ci.yml",
      files: {
        ".gitlab-ci.yml": `${gitlab}      when: never\n`,
        "jobs.yml": job,
      },
      hosting: {
        ciEnabled: true,
        requiredJob: "backlog",
        mergeRequestPipelines: true,
        mergeTrains: true,
      },
    }),
    "unknown",
  );
  assert.equal(
    ciCoverage({
      provider: "gitlab",
      entrypoint: ".gitlab-ci.yml",
      files: { ".gitlab-ci.yml": "include: https://example.invalid/remote.yml\n" },
    }),
    "unknown",
  );
  assert.equal(ciCoverage({ provider: "gitlab", entrypoint: null, files: {} }), "no_ci_surface");
  assert.match(source("src/skills/mo-setup/SKILL.md"), /no_ci_surface.*unknown/u);
});

test("session, delivery, handoff and waiter invariants remain executable instructions", () => {
  const review = source("src/skills/mo-review-orca/SKILL.md");
  for (const pattern of [
    /ProjectRegistrationSet\/1/u,
    /REVIEW-START version=1/u,
    /normal agent prompt/u,
    /Review-Handoff-Ack:/u,
    /one re-delivery/u,
    /300000 ms/u,
    /fresh independent pair/u,
  ]) {
    assert.match(review, pattern);
  }
  assert.doesNotMatch(review, /git worktree add.*allowed|orca repo add.*fallback/iu);
  const setup = source("src/skills/mo-setup/SKILL.md");
  assert.match(setup, /orca-cli/u);
  assert.match(setup, /git check-ignore -v --no-index/u);
  assert.match(setup, /git ls-files -- \.orca\/ spec\//u);
});

test("shipped handoff and live-eval instructions match their fail-closed callers", () => {
  const review = source("src/skills/mo-review-orca/SKILL.md");
  const methodology = source("shared/references/methodology.md");
  const response = source("docs/architecture/settled-final-response.md");
  for (const document of [review, methodology, response]) {
    assert.match(document, /hard[- ]link/u);
    assert.match(document, /create-if-absent/u);
    assert.match(document, /overwrite-capable rename|Переименование с возможностью перезаписи/iu);
  }
  assert.match(
    source("docs/e2e.md"),
    /--execution-observations <all-coordinate-executions\.json>/u,
  );
  assert.match(
    source("docs/e2e.md"),
    /Вызывающая сторона\s+отдельно, не копируя вывод модельного исполнителя/u,
  );
});

test("report completeness is required before delivery, not repaired after it", () => {
  const protocol = source("shared/references/review-protocol.md");
  const review = source("src/skills/mo-review-orca/SKILL.md");
  const decision = source("docs/architecture/review-authoritative-response.md");

  // A backend that completes the session by delivering the response leaves no
  // second chance, so the demand has to reach the reviewer in the task bytes.
  assert.match(protocol, /Deliver the whole report inside the single authoritative response/u);
  assert.match(protocol, /promise to send it separately are each a malformed report/u);
  assert.match(protocol, /Read the body back before delivering it/u);
  assert.match(
    review,
    /Say so in the task\s+bytes, because `worker_done` is what completes the Dispatch/u,
  );

  // Correction is bounded by observed liveness rather than assumed; the old
  // "same hot session" wording promised a repair path Orca does not have.
  assert.match(review, /only while public evidence still shows\s+that Dispatch active/u);
  assert.match(review, /`UNKNOWN` with `malformed_report`/u);
  assert.match(review, /new review with its own cost, never a correction/u);
  assert.doesNotMatch(review, /corrected report in that hot\s+session/u);

  // Acceptance that cannot be turned into a check sends remediation guessing,
  // and each guess buys another full round of the same reviewers.
  for (const document of [protocol, review]) {
    assert.match(document, /acceptance\s+proof[\s\S]{0,40}concrete cases/u);
    assert.match(document, /input and state, expected behavior/u);
  }
  assert.match(decision, /конкретные случаи и ситуации, покрытие которых его\s+снимает/u);
});
