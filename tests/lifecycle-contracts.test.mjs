/**
 * Execute deterministic projections of the issue, review, session and CI contracts.
 *
 * Protects §A-ISSUE-01, §A-REVIEW-04, §A-RESPONSE-03, §A-SESSION-01,
 * §A-DELIVERY-01 and §A-WAIT-01.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import yaml from "js-yaml";
import MarkdownIt from "markdown-it";

import { validateReport as validate } from "../shared/scripts/mo-review-report.mjs";
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
      "ISS-16",
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
    ["upstream_issue", "project_issue", "methodology_issue", "unconfirmed", "either", "mixed"],
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
  for (const scenario of ["ISS-01", "ISS-07A", "ISS-10", "ISS-15", "ISS-16"]) {
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
  // The release fallback left with Orca 1.4.217, so its disposition names the
  // closed upstream issue instead of an unsupported workaround.
  const released = rows.find(([sourceId]) => sourceId === "BKL-04")[2];
  assert.match(released, /https:\/\/github\.com\/stablyai\/orca\/issues\/18737/u);
  assert.doesNotMatch(released, /unsupported/u);
});

test("every source issue #18-#43 has one outcome its legend defines", () => {
  const table = markdownTables(source("docs/acceptance.md")).find(
    ([, first]) => first?.[0] === "#18",
  );
  assert.ok(table, "#18-#43 disposition table missing");
  const rows = table.slice(1);
  // #42 was closed before the snapshot and is not a source of this feature.
  const expected = Array.from({ length: 26 }, (_, index) => `#${index + 18}`).filter(
    (id) => id !== "#42",
  );
  assert.deepEqual(
    rows.map(([id]) => id),
    expected,
  );
  // Each value carries its weight for the final outcome in the legend, so an
  // unlisted value would leave that weight unstated.
  const outcomes = new Set(["implemented", "external_blocked", "refuted"]);
  for (const [id, outcome, evidence] of rows) {
    assert.ok(outcomes.has(outcome), `${id}: outcome ${outcome} is not in the legend`);
    if (outcome === "external_blocked") {
      assert.match(evidence, /Orca #\d+/u, `${id}: external owner's issue missing`);
    }
  }
});

/**
 * Why a scenario may type its failure as an external block, or not.
 *
 * `blocked:external_capability` admits an issue into
 * `needs_attention/external_blocked`, which needs a named missing contract and
 * its owner's Issue. An implemented issue has neither, so a failure of its live
 * part is an ordinary failure; an issue blocked on a contract that no longer
 * has a row would name an owner nobody can find.
 */
/**
 * The issue each external typing in one scenario names.
 *
 * The wording around the typing varies («по #33», «с внешним Issue по #29»), so
 * an occurrence is attributed to the one issue named in its own sentence, and
 * one that names none or several is an error rather than a silent skip.
 */
function externalBlockIssues(scenario, text, errors) {
  const issues = [];
  for (const match of text.matchAll(/`blocked:external_capability`/gu)) {
    const rest = text.slice(match.index);
    const end = rest.search(/\.(?:\s|$)/u);
    const named = [...(end === -1 ? rest : rest.slice(0, end)).matchAll(/#\d+/gu)].map(
      ([id]) => id,
    );
    if (named.length === 1) issues.push(named[0]);
    else errors.push(`${scenario}: blocked:external_capability names ${named.length} issues`);
  }
  return issues;
}

function externalBlockErrors(dispositions, scenarios, contracts) {
  const outcome = new Map(dispositions.map(([id, value]) => [id, value]));
  const errors = [];
  for (const [id, value] of outcome) {
    if (value === "external_blocked" && !contracts.has(id)) {
      errors.push(`${id}: external_blocked without an external-contract row`);
    }
  }
  for (const [scenario, ...cells] of scenarios) {
    for (const issue of externalBlockIssues(scenario, cells.join(" "), errors)) {
      if (outcome.get(issue) !== "external_blocked" || !contracts.has(issue)) {
        errors.push(
          `${scenario}: blocked:external_capability for ${issue}, which is ${outcome.get(issue) ?? "absent"}`,
        );
      }
    }
  }
  return errors;
}

function externalBlockSources() {
  const dispositions = markdownTables(source("docs/acceptance.md"))
    .find(([, first]) => first?.[0] === "#18")
    .slice(1);
  const scenarios = markdownTables(source("docs/e2e.md"))
    .flat()
    .filter(([id]) => /^B\d+$/u.test(id ?? ""));
  const contracts = new Set(
    markdownTables(source("docs/backend-capabilities.md"))
      .flat()
      .map(([first]) => /^(#\d+) \(\[Orca #\d+\]/u.exec(first ?? "")?.[1])
      .filter(Boolean),
  );
  return { dispositions, scenarios, contracts };
}

test("only an external_blocked issue with a named contract types a scenario failure as external", () => {
  const { dispositions, scenarios, contracts } = externalBlockSources();
  assert.deepEqual(externalBlockErrors(dispositions, scenarios, contracts), []);
  // #43 is implemented, and its live part B63 fails as an ordinary failure.
  assert.equal(dispositions.find(([id]) => id === "#43")[1], "implemented");
  const b63 = scenarios.find(([id]) => id === "B63").join(" ");
  assert.doesNotMatch(b63, /blocked:external_capability/u);
  // The two blocked issues keep the contract rows their owner can be found by,
  // and both of their scenarios are read, whatever words surround the typing.
  assert.deepEqual([...contracts].sort(), ["#29", "#33"]);
  const typed = scenarios.filter((row) => row.join(" ").includes("blocked:external_capability"));
  assert.deepEqual(
    typed.map(([id, ...cells]) => [id, externalBlockIssues(id, cells.join(" "), [])]),
    [
      ["B53", ["#29"]],
      ["B62", ["#33"]],
    ],
  );
  // #29 implemented while B53 still types its failure as external is named,
  // with the contract row kept or removed.
  const unblocked = dispositions.map((row) =>
    row[0] === "#29" ? [row[0], "implemented", row[2]] : row,
  );
  const b53 = scenarios.filter(([id]) => id === "B53");
  for (const rows of [contracts, new Set(["#33"])]) {
    assert.deepEqual(externalBlockErrors(unblocked, b53, rows), [
      "B53: blocked:external_capability for #29, which is implemented",
    ]);
  }
  // A typing that names no issue is an error, not a skip.
  const unattributed = [["B99", "x", "Иначе — `blocked:external_capability`."]];
  assert.deepEqual(externalBlockErrors(dispositions, unattributed, contracts), [
    "B99: blocked:external_capability names 0 issues",
  ]);
  for (const id of ["#29", "#33"]) {
    assert.equal(dispositions.find(([row]) => row === id)[1], "external_blocked", id);
  }
  // Switching #43 back without a contract row, or typing B63 as external again,
  // is caught and named.
  const reverted = dispositions.map((row) =>
    row[0] === "#43" ? [row[0], "external_blocked", row[2]] : row,
  );
  assert.deepEqual(externalBlockErrors(reverted, [], contracts), [
    "#43: external_blocked without an external-contract row",
  ]);
  const retyped = [["B63", "x", "Иначе — `blocked:external_capability` по #43."]];
  assert.deepEqual(externalBlockErrors(dispositions, retyped, contracts), [
    "B63: blocked:external_capability for #43, which is implemented",
  ]);
});

/**
 * The production validator, read through the assertion style of this suite.
 *
 * The rule itself lives in `mo-review-report.mjs`, where the shipped skills can
 * run it; a second copy here would be a second contract that drifts from the
 * one reviewers are actually judged by.
 */
function validateReport(report, expected) {
  const result = validate(report, expected);
  assert.equal(result.status, "valid", `${result.reason ?? "?"} at line ${result.line ?? "?"}`);
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
  // A rejected report now says why, so the negatives below name the reason
  // instead of matching whatever sentence an assertion happened to print.
  const reasonOf = (report, mode = "deep") => validate(report, context(mode)).reason;
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
        "",
        "",
        "Unknown-Account\nUnknown-Reason: review_incomplete\ncovered scope and blocking public observation\n",
      ),
    ),
  );
  assert.equal(
    reasonOf(base("PASS", "P0=0 P1=0 P2=0 P3=0", "", "").replace(/End-Review:.+/u, "")),
    "footer_mismatch",
  );
  assert.equal(
    reasonOf(
      base(
        "FINDINGS",
        "P0=0 P1=0 P2=2 P3=0",
        "F-001 [P2] First.\nF-002 [P2] Second.\n\n",
        "F-001\n[P2] one body only.\n",
      ),
    ),
    "index_body_mismatch",
  );
  assert.equal(
    reasonOf(
      base(
        "FINDINGS",
        "P0=0 P1=1 P2=0 P3=0",
        "F-001 [P1] Severe.\n\n",
        "F-001\n[P2] mismatched body severity.\n",
      ),
    ),
    "index_body_mismatch",
  );
  assert.equal(
    reasonOf(
      base(
        "UNKNOWN",
        "P0=0 P1=0 P2=0 P3=0",
        "",
        "",
        "Unknown-Account\nUnknown-Reason: anything\ncovered scope and blocking public observation\n",
      ),
    ),
    "unknown_reason",
  );
  for (const [field, replacement, reason] of [
    ["Candidate", `Candidate: ${"b".repeat(40)}`, "candidate_mismatch"],
    ["Review-Execution", "Review-Execution: ctx_stale", "execution_mismatch"],
    ["Mode", "Mode: requested=fast effective=deep", "mode_mismatch"],
  ]) {
    const valid = base("PASS", "P0=0 P1=0 P2=0 P3=0", "", "");
    assert.equal(reasonOf(valid.replace(new RegExp(`^${field}:.*`, "mu"), replacement)), reason);
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

/**
 * §A-BACKLOG-01 admits one GitHub expression: the checkout ref that pins a
 * pull-request run to the candidate instead of its synthetic merge commit. It
 * selects what is checked out, never whether the job runs.
 */
const CHECKOUT_REF = "${{ github.event.pull_request.head.sha || github.sha }}";

function expressionOutsideCheckoutRef(provider, parsed) {
  const admitted = new Set();
  if (provider === "github") {
    for (const job of Object.values(parsed?.jobs ?? {})) {
      for (const step of job?.steps ?? []) {
        if (String(step?.uses).startsWith("actions/checkout@") && step.with?.ref === CHECKOUT_REF) {
          admitted.add(step.with);
        }
      }
    }
  }
  const walk = (value, owner, key) => {
    if (typeof value === "string") {
      return value.includes("${{") && !(key === "ref" && admitted.has(owner));
    }
    if (value && typeof value === "object") {
      return Object.entries(value).some(([name, child]) => walk(child, value, name));
    }
    return false;
  };
  return walk(parsed, null, null);
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
    if (typeof text !== "string") throw new Error("unknown construct");
    const parsed = yaml.load(text);
    if (expressionOutsideCheckoutRef(provider, parsed)) throw new Error("unknown construct");
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

test("an isolated reviewer workspace stands on the candidate", () => {
  // Three reviewers in a row reported this as friction and the fourth spent a
  // whole round on it: told to judge a final SHA from a workspace parked on
  // another commit, a reviewer that takes the protocol literally answers
  // candidate_mismatch. The rule now says where HEAD is before the brief goes.
  const brief = source("shared/references/review-brief.md").replace(/\s+/gu, " ");
  assert.match(brief, /checked out at the candidate, clean, before the brief is sent/u);
  assert.match(brief, /`candidate_mismatch`/u);
  // Reading by SHA keeps its own case, so the two are not confused again.
  assert.match(brief, /Reading by SHA is the `shared_checkout` answer/u);
  for (const path of ["src/skills/mo-review-orca/SKILL.md", "skills/mo-review-orca/SKILL.md"]) {
    const review = source(path).replace(/\s+/gu, " ");
    assert.match(review, /the workspace stands on the candidate before the brief is sent/u, path);
    assert.match(review, /`UNKNOWN` with `candidate_mismatch`/u, path);
  }
});

test("the coordinator and the reviewer ship the same protocol and validator bytes", () => {
  // The same-build check compares these two files, so one build must ship them
  // byte for byte in both skills.
  for (const file of ["references/review-protocol.md", "scripts/mo-review-report.mjs"]) {
    assert.equal(
      source(`skills/mo-reviewer/${file}`),
      source(`skills/mo-review-orca/${file}`),
      file,
    );
  }
});

test("the coordinator's validate command binds the effective mode it needs", () => {
  // Without the flag the documented call checked the requested mode only, so a
  // closure report that declared a lower coverage was never compared.
  for (const path of ["src/skills/mo-review-orca/SKILL.md", "skills/mo-review-orca/SKILL.md"]) {
    const command = /scripts\/mo-review-report\.mjs validate [^`]*/u.exec(source(path))?.[0] ?? "";
    assert.match(command, /--requested <mode> --effective <mode>/u, path);
    assert.match(source(path).replace(/\s+/gu, " "), /`deep` for a `deep` request/u, path);
  }
});

test("a Codex trust failure is recovered inside the supported harness, never by codex exec", () => {
  // #43's implemented outcome rests on this rule staying inside the supported
  // harness: without the check, dropping or inverting it passed every gate.
  for (const path of ["src/skills/mo-review-orca/SKILL.md", "skills/mo-review-orca/SKILL.md"]) {
    const review = source(path).replace(/\s+/gu, " ");
    assert.match(
      review,
      /fails with `agent-trust-workspace` stays inside the supported harness/u,
      path,
    );
    assert.match(review, /release the failed Dispatch by its exact id/u, path);
    assert.match(review, /prove trust by the trust procedure/u, path);
    assert.match(review, /start the normal supervised harness again/u, path);
    assert.match(review, /A terminal running `codex exec` is never a reviewer\./u, path);
  }
  for (const path of [
    "shared/references/orca-mechanics.md",
    "skills/mo-review-orca/references/orca-mechanics.md",
  ]) {
    const mechanics = source(path).replace(/\s+/gu, " ");
    assert.match(
      mechanics,
      /`orca terminal create --command "codex exec …"` is never a reviewer/u,
      path,
    );
  }
  const cases = JSON.parse(source("src/skills/mo-review-orca/evals/cases.json")).cases;
  const degraded = cases.find(({ id }) => id === "mo-review-orca.degraded");
  assert.match(degraded.scenario, /agent-trust-workspace/u);
  assert.equal(degraded.mustNot.includes("start a raw `codex exec` terminal as a reviewer"), true);
});

test("the Body-File name uses only what the caller holds before sending", () => {
  // The Dispatch id reaches only the reviewer, so a name built from it is a
  // placeholder that no sent brief can fill.
  // The Dispatch ordinal keeps the one repeat Dispatch of a round off the
  // earlier body, which `prepare` would refuse as existing.
  const form = "`Body-File: <dir>/slot-<a|b>-r<round>-d<n>.md`";
  for (const path of [
    "shared/references/review-brief.md",
    "src/skills/mo-review-orca/SKILL.md",
    "skills/mo-review-orca/SKILL.md",
  ]) {
    const text = source(path).replace(/\s+/gu, " ");
    assert.equal(text.includes(form), true, path);
    assert.doesNotMatch(text, /Body-File: <dir>\/<dispatch-id>/u, path);
  }
});

test("every reviewer Dispatch records the installed reviewer version", () => {
  // The body carries no version header by design, so the Dispatch context is
  // the only place that can say which grammar accepted a report once the
  // installation moves on.
  const brief = source("shared/references/review-brief.md").replace(/\s+/gu, " ");
  const form = "mo-reviewer <path> source_tree=<40-hex> skill=<id> protocol=<id> validator=<id>";
  assert.equal(brief.includes(`\`Reviewer-Skill: ${form}\``), true);
  assert.match(brief, /no Dispatch starts from it/u);
  // The stamp names authored inputs only: bundled package bytes and a local
  // edit leave it unchanged, so the installed bytes are named by object id.
  assert.match(brief, /does not cover the bytes of the bundled third-party packages/u);
  assert.match(brief, /`git log --find-object=<id>`/u);
  // A record, not a provenance proof: the project under review has no Meta-O
  // history, so a proof there would refuse every review.
  assert.match(brief, /a record, not a proof of provenance/u);
  for (const path of ["src/skills/mo-review-orca/SKILL.md", "skills/mo-review-orca/SKILL.md"]) {
    const review = source(path).replace(/\s+/gu, " ");
    const [stamp, ids] = [
      "mo-reviewer <path> source_tree=<40-hex>",
      "skill=<id> protocol=<id> validator=<id>",
    ];
    assert.equal(review.includes(`\`${stamp}\` followed by \`${ids}\``), true, path);
    assert.match(review, /immediately before the Dispatch, take `git hash-object`/u, path);
    assert.match(review, /carries no stamp, lacks one of the three files/u, path);
    // "Same build" is decidable from the record and this skill's own files.
    assert.match(review, /Same build means that its `protocol` and `validator` ids equal/u, path);
    assert.match(review, /The two `source_tree` stamps are not compared/u, path);
    assert.match(review, /repeats the whole value next to `prepared_body_identity`/u, path);
  }
  // The stamp can name all three only while the skill bundles the other two.
  for (const bundled of ["references/review-protocol.md", "scripts/mo-review-report.mjs"]) {
    assert.equal(existsSync(join(ROOT, "skills", "mo-reviewer", bundled)), true, bundled);
  }
  assert.match(source("skills/mo-reviewer/SKILL.md"), /^ {2}source_tree: "[0-9a-f]{40}"$/mu);
});

test("the final pair is told where its grounding went after cleanup", () => {
  // Closure deletes the specification, and the fresh final pair reads the SHA
  // that no longer holds it. Without a second route the brief must cite a path
  // the candidate does not contain, which is how a reviewer ends up reasoning
  // from a section it never read.
  const brief = source("shared/references/review-brief.md").replace(/\s+/gu, " ");
  assert.match(brief, /Closure deletes that specification/u);
  assert.match(brief, /frozen object id/u);
  // The reason matters as much as the rule: the object survives because the
  // pre-deletion commit's tree still holds it, which is also why a shallow
  // checkout cannot resolve the citation.
  assert.match(brief, /the tree of the commit before the deletion still points at it/u);
  assert.match(brief, /shallow or partial checkout/u);
  const methodology = source("shared/references/methodology.md").replace(/\s+/gu, " ");
  assert.match(methodology, /give the frozen object ids the deletion recorded/u);
  for (const path of ["src/skills/mo-review-orca/SKILL.md", "skills/mo-review-orca/SKILL.md"]) {
    const review = source(path).replace(/\s+/gu, " ");
    assert.match(review, /until closure removes it/u, path);
    assert.match(review, /cites the removed specification by its frozen object id/u, path);
    assert.match(review, /together with the commit whose tree still holds it/u, path);
  }
  // The route only works if the project really records those ids on deletion.
  const acceptance = source("docs/acceptance.md");
  assert.match(acceptance, /issue_fixes_closure:/u);
  assert.match(acceptance, /spec_blob: [0-9a-f]{40}/u);
  assert.match(acceptance, /source_sha: [0-9a-f]{40}/u);
});

test("every reviewer wave has a mode the protocol can actually issue", () => {
  // A wave whose mode is unnamed is not a free choice, it is three impossible
  // ones: `follow_up` needs a prior report the fresh pair has none of, `fast`
  // is advisory, and a closure proof is required. The skill has to say `deep`.
  for (const path of ["src/skills/mo-review-orca/SKILL.md", "skills/mo-review-orca/SKILL.md"]) {
    const review = source(path).replace(/\s+/gu, " ");
    assert.match(review, /The first lifecycle pair uses `deep`/u, path);
    assert.match(review, /remediation goes to the same pair as `follow_up`/u, path);
    assert.match(review, /That final pair is `deep` as well/u, path);
    assert.match(review, /`follow_up` needs the same reviewer's prior report/u, path);
    assert.match(review, /advisory `fast` cannot carry a required closure proof/u, path);
  }
  // The protocol's own reason for each exclusion, so the skill sentence above
  // stays a consequence of the contract rather than a second opinion.
  const protocol = source("shared/references/review-protocol.md").replace(/\s+/gu, " ");
  assert.match(protocol, /follow_up/u);
  assert.match(protocol, /prior report/u);
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
  assert.match(protocol, /Validate the exact bytes before sending them/u);
  assert.match(
    review,
    /Say so in the task\s+bytes, because `worker_done` is what completes the Dispatch/u,
  );

  // `worker_done` ends the Dispatch, so there is no repair path in its name;
  // the old "same hot session" wording promised one Orca does not have.
  assert.match(
    review,
    /`UNKNOWN` with\s+`malformed_report` for that Dispatch and is never corrected in its name/u,
  );
  assert.match(review, /new review with its own id and full\s+validation, never a correction/u);
  assert.doesNotMatch(review, /corrected report in that hot\s+session/u);

  // Acceptance that cannot be turned into a check sends remediation guessing,
  // and each guess buys another full round of the same reviewers.
  for (const document of [protocol, review]) {
    assert.match(document, /acceptance\s+proof[\s\S]{0,40}concrete cases/u);
    assert.match(document, /input and state, expected behavior/u);
  }
  assert.match(decision, /конкретные случаи и ситуации, покрытие которых его\s+снимает/u);
});
