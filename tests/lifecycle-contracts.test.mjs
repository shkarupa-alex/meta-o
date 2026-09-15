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

test("the Issue decision table is rectangular, total and fail-closed", () => {
  const rows = firstTable(source("docs/architecture/issue-routing.md"));
  assert.deepEqual(rows[0], [
    "Scenario",
    "Class",
    "Preconditions",
    "Required action",
    "Forbidden action",
    "Evidence",
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
  const allowed = new Set(["upstream_issue", "project_issue", "unconfirmed", "either", "mixed"]);
  for (const [scenario, disposition, , action, forbidden] of rows.slice(1)) {
    assert.ok(allowed.has(disposition), `${scenario}: invalid disposition`);
    assert.ok(action.length > 3, `${scenario}: action missing`);
    if (["ISS-02", "ISS-03", "ISS-12"].includes(scenario)) {
      assert.match(action, /needs_attention/u);
      assert.match(forbidden, /[Gg]uess|origin|tracking|[Pp]ick|infer/u);
    }
  }
});

/** §A-REVIEW-04 validates anchored report sections without parsing finding prose. */
function validateReport(report) {
  const lines = report.trimEnd().split("\n");
  const execution = lines[0]?.match(/^Review-Execution: (\S+)$/u)?.[1];
  const candidate = lines[1]?.match(/^Candidate: ([a-f0-9]{40})$/u)?.[1];
  const mode = lines[2]?.match(
    /^Mode: requested=(fast|deep|follow_up) effective=(fast|deep|follow_up)$/u,
  );
  const verdict = lines[4]?.match(/^Verdict: (PASS|FINDINGS|UNKNOWN)$/u)?.[1];
  const counts = lines[5]?.match(/^Counts: P0=(\d+) P1=(\d+) P2=(\d+) P3=(\d+)$/u);
  assert.ok(execution && candidate && mode && verdict && counts, "invalid header");
  assert.equal(lines[3], "Delegation: none");
  assert.equal(lines.at(-1), `End-Review: ${execution}`);
  const evidence = lines.indexOf("Evidence report");
  const order = ["Grounding", "Scope and checks", "Findings", "Unknowns", "Residual risks"];
  const positions = order.map((heading) => lines.indexOf(heading));
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
  const total = counts.slice(1).reduce((sum, count) => sum + Number(count), 0);
  assert.equal(total, keys.length);
  const severityCounts = [0, 0, 0, 0];
  for (const key of keys) severityCounts[Number(key[2].slice(1))] += 1;
  assert.deepEqual(severityCounts, counts.slice(1).map(Number));
  const body = (heading, next) =>
    lines.slice(lines.indexOf(heading) + 1, lines.indexOf(next)).filter(Boolean);
  assert.ok(body("Grounding", "Scope and checks").length > 0);
  assert.ok(body("Scope and checks", "Findings").length > 0);
  assert.ok(body("Unknowns", "Residual risks").length > 0);
  assert.ok(lines.slice(lines.indexOf("Residual risks") + 1, -1).filter(Boolean).length > 0);
  const findingBody = body("Findings", "Unknowns");
  if (verdict === "PASS") {
    assert.equal(keys.length, 0);
    assert.deepEqual(findingBody, []);
  }
  if (verdict === "FINDINGS") {
    assert.ok(keys.length > 0);
    for (const key of keys) assert.ok(findingBody.includes(key[1]));
  }
  if (verdict === "UNKNOWN") {
    assert.equal(keys.length, 0);
    assert.ok(lines.includes("Unknown-Account"));
    assert.ok(lines.some((line) => /^Unknown-Reason: \w+$/u.test(line)));
  }
  return true;
}

test("PASS, FINDINGS and UNKNOWN fixtures preserve the canonical review envelope", () => {
  const base = (verdict, counts, index, findings, extra = "", mode = "deep") =>
    `Review-Execution: ctx_fixture\nCandidate: ${"a".repeat(40)}\n` +
    `Mode: requested=${mode} effective=${mode}\nDelegation: none\nVerdict: ${verdict}\n` +
    `Counts: ${counts}\n\n${index}Evidence report\nGrounding\nintent and clean SHA\n` +
    `Scope and checks\nread-only diff and tests\nFindings\n${findings}${extra}` +
    "Unknowns\nnone\nResidual risks\nnone\nEnd-Review: ctx_fixture\n";
  assert.ok(validateReport(base("PASS", "P0=0 P1=0 P2=0 P3=0", "", "")));
  assert.ok(
    validateReport(
      base(
        "FINDINGS",
        "P0=0 P1=0 P2=1 P3=0",
        "F-001 [P2] Broken boundary.\n\n",
        "F-001\n[P2] confirmed; causal path, impact, location, boundary repair and proof.\n",
      ),
    ),
  );
  assert.ok(
    validateReport(
      base(
        "FINDINGS",
        "P0=0 P1=0 P2=1 P3=0",
        "F-001 [P2] Boundary remains broken.\n\n",
        "F-001\n[P2] confirmed; causal path, impact, location, boundary repair and proof.\n",
        "",
        "follow_up",
      ),
    ),
  );
  assert.ok(
    validateReport(
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
    () => validateReport(base("PASS", "P0=0 P1=0 P2=0 P3=0", "", "").replace(/End-Review:.+/u, "")),
    /Expected values/u,
  );
});

/** §A-BACKLOG-01 binds one literal GitHub job to its trigger and hosting policy. */
function githubCoverage(documents, hosting) {
  const root = documents[0].parsed;
  const events = Object.keys(root?.on ?? {});
  const jobs = Object.entries(root?.jobs ?? {});
  const commandJobs = jobs.filter(([, { steps = [] }]) =>
    steps.some(({ run = "" }) => run === "make mo-backlog-empty"),
  );
  const automatic = commandJobs.every(([, job]) => {
    const commandSteps = (job.steps ?? []).filter(
      ({ run = "" }) => run === "make mo-backlog-empty",
    );
    return (
      job.if === undefined &&
      job["continue-on-error"] !== true &&
      commandSteps.every((step) => step.if === undefined && step["continue-on-error"] !== true)
    );
  });
  const candidateEvent = events.includes("pull_request") || events.includes("merge_group");
  if (
    !candidateEvent ||
    events.includes("pull_request_target") ||
    commandJobs.length !== 1 ||
    !automatic
  )
    return "unknown";
  const required = hosting.workflowActive === true && hosting.requiredCheck === commandJobs[0][0];
  return required ? "covered" : "config_present";
}

/** §A-BACKLOG-01 binds one literal GitLab job to MR rules and hosting policy. */
function exactGitlabRule(rule, condition) {
  return (
    rule &&
    Object.keys(rule).every((key) => new Set(["if", "when"]).has(key)) &&
    rule.if === condition &&
    new Set([undefined, "always", "on_success"]).has(rule.when)
  );
}

function gitlabWorkflowReachable(workflowRules) {
  return (
    workflowRules === undefined ||
    (Array.isArray(workflowRules) &&
      workflowRules.length === 1 &&
      exactGitlabRule(workflowRules[0], "$CI_MERGE_REQUEST_ID"))
  );
}

function gitlabCoverage(documents, hosting) {
  const reserved = new Set(["include", "stages", "workflow", "default", "variables"]);
  const jobs = documents.flatMap(({ parsed }) =>
    Object.entries(parsed ?? {}).filter(([name, value]) => !reserved.has(name) && value?.script),
  );
  const commandJobs = jobs.filter(([, job]) =>
    (Array.isArray(job.script) ? job.script : [job.script]).includes("make mo-backlog-empty"),
  );
  if (commandJobs.length !== 1) return "unknown";
  const [jobName, job] = commandJobs[0];
  const rules = Array.isArray(job.rules) ? job.rules : [];
  const noCompetingReachability = job.only === undefined && job.except === undefined;
  const supportedRule =
    noCompetingReachability &&
    rules.length === 1 &&
    rules.every((rule) => exactGitlabRule(rule, "$CI_PIPELINE_SOURCE == 'merge_request_event'"));
  const only = Array.isArray(job.only) ? job.only : [job.only];
  const supportedOnly =
    job.rules === undefined &&
    job.except === undefined &&
    only.length === 1 &&
    only[0] === "merge_requests";
  const mergeRequest = supportedRule || supportedOnly;
  const workflowRules = documents[0].parsed?.workflow?.rules;
  const workflowReachable = gitlabWorkflowReachable(workflowRules);
  const automatic = job.allow_failure !== true && new Set([undefined, "on_success"]).has(job.when);
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
    if (seen.has(path)) return;
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

test("CI fixture evaluation covers both hosts and never invents required policy", () => {
  const ordinary =
    "on:\n  pull_request:\n    branches: [develop]\njobs:\n  backlog:\n    steps:\n      - run: make mo-backlog-empty\n";
  assert.equal(
    ciCoverage({ provider: "github", entrypoint: "ci.yml", files: { "ci.yml": ordinary } }),
    "config_present",
  );
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: "ci.yml",
      files: { "ci.yml": ordinary },
      hosting: { workflowActive: true, requiredCheck: "backlog" },
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
  assert.equal(
    ciCoverage({
      provider: "github",
      entrypoint: "ci.yml",
      files: { "ci.yml": ordinary.replace("make mo-backlog-empty", "${{ matrix.command }}") },
    }),
    "unknown",
  );
  const gitlab =
    "include:\n  - local: jobs.yml\nworkflow:\n  rules:\n    - if: $CI_MERGE_REQUEST_ID\n";
  const job =
    "backlog:\n  script:\n    - make mo-backlog-empty\n  rules:\n    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'\n";
  for (const files of [
    {
      ".gitlab-ci.yml": gitlab,
      "jobs.yml":
        "backlog:\n  script: make mo-backlog-empty\n  only: merge_requests\n  except: schedules\n",
    },
    {
      ".gitlab-ci.yml":
        "include:\n  - local: jobs.yml\nworkflow:\n  rules:\n    - if: $CI_MERGE_REQUEST_ID\n      changes: [src/**]\n",
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
          "backlog:\n  script: make mo-backlog-empty\nverify:\n  script: echo ok\n  rules:\n    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'\n",
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
          "jobs.yml": `backlog:\n  script: make mo-backlog-empty\n  rules:\n    ${rejectedRule}\n`,
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
});
