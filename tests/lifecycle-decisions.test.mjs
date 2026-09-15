/**
 * Execute the bounded routing, readiness, and waiter decisions from the lifecycle.
 *
 * These test-only projections prove §A-ISSUE-01, §A-DELIVERY-01 and §A-WAIT-01
 * without adding a workflow engine or performing an external write.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import MarkdownIt from "markdown-it";
import { forbiddenPublicDataReason } from "../tools/sensitive-evidence.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const markdown = new MarkdownIt();

function issueRows(
  document = readFileSync(resolve(ROOT, "docs/architecture/issue-routing.md"), "utf8"),
) {
  const tokens = markdown.parse(document, {});
  const start = tokens.findIndex(({ type }) => type === "table_open");
  const rows = [];
  let row = null;
  for (const token of tokens.slice(start + 1)) {
    if (token.type === "table_close") break;
    if (token.type === "tr_open") row = [];
    if (token.type === "inline" && row) row.push(token.content.trim());
    if (token.type === "tr_close") rows.push(row);
  }
  assert.deepEqual(rows[0], [
    "Scenario",
    "Applies to",
    "Write",
    "Preconditions",
    "Required action",
    "Forbidden action",
    "Evidence",
  ]);
  return new Map(
    rows
      .slice(1)
      .map(
        ([
          scenario,
          issueClass,
          writePermission,
          preconditions,
          requiredAction,
          forbiddenAction,
          evidence,
        ]) => [
          scenario,
          { issueClass, writePermission, preconditions, requiredAction, forbiddenAction, evidence },
        ],
      ),
  );
}

const ISSUE_RULES = [
  [(facts) => facts.forbiddenData, "ISS-08"],
  [(facts) => facts.writeEffect === "ambiguous", "ISS-09"],
  [(facts) => facts.search === "incomplete", "ISS-14"],
  [(facts) => facts.capability === "missing", "ISS-15"],
  [(facts) => facts.writeEffect === "rejected", "ISS-13"],
  [(facts) => facts.repositoryKnown && facts.auth === "unavailable", "ISS-11"],
  [(facts) => facts.repositoryRank === "ambiguous", "ISS-12"],
  [(facts) => facts.mixedWorkaround, "ISS-10"],
  [(facts) => facts.match === "open_exact", "ISS-06"],
  [(facts) => facts.match === "closed_fixed_installed", "ISS-07A"],
  [(facts) => facts.match === "closed_fixed_newer", "ISS-07B"],
  [(facts) => facts.match === "closed_wontfix_alive", "ISS-07C"],
  [(facts) => facts.rootCause === "unknown", "ISS-05"],
  [(facts) => facts.rootCause === "external" && facts.owner === "verified", "ISS-01"],
  [(facts) => facts.rootCause === "external" && facts.owner === "ambiguous", "ISS-02"],
  [(facts) => facts.rootCause === "external" && facts.owner === "project_remotes_only", "ISS-03"],
  [(facts) => facts.rootCause === "project", "ISS-04"],
];

function currentWritePermission(facts) {
  const routeBlocker = facts.mixedWorkaround
    ? facts.owner === "verified" &&
      facts.upstreamRepository === "verified" &&
      facts.projectRepository === "verified"
      ? null
      : "mixed_ownership_unproved"
    : facts.rootCause === "external"
      ? facts.owner === "verified" && facts.upstreamRepository === "verified"
        ? null
        : "upstream_ownership_unproved"
      : facts.rootCause === "project"
        ? facts.projectRepository === "verified"
          ? null
          : "project_repository_unproved"
        : "root_cause_unproved";
  const blockers = [
    [routeBlocker !== null, routeBlocker],
    [facts.forbiddenData === true, "forbidden_data"],
    [facts.writeEffect === "ambiguous", "write_effect_ambiguous"],
    [facts.writeEffect === "rejected", "write_rejected"],
    [facts.search !== "complete", "search_unproved"],
    [facts.capability !== "available", "capability_unproved"],
    [facts.auth !== "available", "authorization_unproved"],
    [facts.repositoryRank === "ambiguous", "repository_ambiguous"],
    [facts.projection !== "allowlisted", "projection_unproved"],
  ];
  const blocked = blockers.find(([condition]) => condition);
  return blocked ? { allowed: false, reason: blocked[1] } : { allowed: true, reason: null };
}

function issueDecision(facts, rows = issueRows()) {
  const matched = ISSUE_RULES.find(([predicate]) => predicate(facts));
  if (!matched) return { status: "needs_attention", reason: "route_unclassified" };
  const [, scenario] = matched;
  const row = rows.get(scenario);
  if (!row) return { status: "needs_attention", reason: "canonical_route_missing" };
  if (!new Set(["yes", "no"]).has(row.writePermission)) {
    return { status: "needs_attention", reason: "canonical_write_permission_invalid" };
  }
  const current = currentWritePermission(facts);
  const mayWrite = row.writePermission === "yes" && current.allowed;
  return {
    status: "settled",
    scenario,
    class: row.issueClass,
    ...row,
    mayWrite,
    writeBlocker: mayWrite ? null : current.reason,
  };
}

const ISSUE_BODY_FIELDS = ["summary", "reproduction", "expected", "actual", "versions", "links"];
const ISSUE_PUBLIC_FIELDS = ["title", ...ISSUE_BODY_FIELDS];

function projectIssue(draft) {
  if (typeof draft.title !== "string" || draft.title.trim() === "") {
    return { status: "needs_attention", reason: "projection_unproved" };
  }
  const projected = Object.fromEntries(
    ISSUE_BODY_FIELDS.filter((field) => typeof draft[field] === "string").map((field) => [
      field,
      draft[field],
    ]),
  );
  if (
    [draft.title, ...Object.values(projected)].some((value) => forbiddenPublicDataReason(value))
  ) {
    return { status: "needs_attention", reason: "forbidden_data" };
  }
  return { status: "ready", title: draft.title, body: projected };
}

const WRITE_READY = {
  auth: "available",
  search: "complete",
  capability: "available",
  projection: "allowlisted",
};
const UPSTREAM_READY = {
  ...WRITE_READY,
  rootCause: "external",
  owner: "verified",
  upstreamRepository: "verified",
};
const PROJECT_READY = {
  ...WRITE_READY,
  rootCause: "project",
  projectRepository: "verified",
};

test("ISS-01 through ISS-15 route distinct facts to canonical actions", () => {
  const fixtures = [
    [UPSTREAM_READY, "ISS-01", true],
    [{ rootCause: "external", owner: "ambiguous" }, "ISS-02", false],
    [{ rootCause: "external", owner: "project_remotes_only" }, "ISS-03", false],
    [PROJECT_READY, "ISS-04", true],
    [{ rootCause: "unknown" }, "ISS-05", false],
    [{ ...UPSTREAM_READY, match: "open_exact" }, "ISS-06", true],
    [{ ...UPSTREAM_READY, match: "closed_fixed_installed" }, "ISS-07A", true],
    [{ match: "closed_fixed_newer" }, "ISS-07B", false],
    [{ ...UPSTREAM_READY, match: "closed_wontfix_alive" }, "ISS-07C", true],
    [{ forbiddenData: true }, "ISS-08", false],
    [{ writeEffect: "ambiguous" }, "ISS-09", false],
    [
      {
        ...WRITE_READY,
        mixedWorkaround: true,
        owner: "verified",
        upstreamRepository: "verified",
        projectRepository: "verified",
      },
      "ISS-10",
      true,
    ],
    [{ repositoryKnown: true, auth: "unavailable" }, "ISS-11", false],
    [{ repositoryRank: "ambiguous" }, "ISS-12", false],
    [{ writeEffect: "rejected" }, "ISS-13", false],
    [{ search: "incomplete" }, "ISS-14", false],
    [{ capability: "missing" }, "ISS-15", false],
  ];
  const rows = issueRows();
  for (const [facts, scenario, mayWrite] of fixtures) {
    const result = issueDecision(facts);
    assert.equal(result.status, "settled", scenario);
    assert.equal(result.scenario, scenario);
    assert.ok(rows.has(result.scenario));
    assert.equal(result.class, rows.get(result.scenario).issueClass);
    assert.equal(result.mayWrite, mayWrite, `${scenario}: autonomous write permission`);
    for (const field of ["preconditions", "requiredAction", "forbiddenAction", "evidence"]) {
      assert.equal(result[field], rows.get(result.scenario)[field]);
      assert.ok(result[field].length > 3, `${scenario}: ${field}`);
    }
  }
  assert.equal(new Set(fixtures.map(([, scenario]) => scenario)).size, rows.size);
});

test("the parsed canonical row owns every normative routing field and missing rows fail closed", () => {
  const source = readFileSync(resolve(ROOT, "docs/architecture/issue-routing.md"), "utf8");
  const facts = { search: "incomplete" };
  const original = issueDecision(facts, issueRows(source));
  for (const field of ["preconditions", "requiredAction", "forbiddenAction", "evidence"]) {
    const marker = ` [fixture-${field}]`;
    const mutated = source.replace(original[field], `${original[field]}${marker}`);
    assert.ok(issueDecision(facts, issueRows(mutated))[field].endsWith(marker));
  }
  const withoutScenario = new Map(issueRows(source));
  withoutScenario.delete("ISS-14");
  assert.deepEqual(issueDecision(facts, withoutScenario), {
    status: "needs_attention",
    reason: "canonical_route_missing",
  });
  const rewordedRows = new Map(issueRows(source));
  rewordedRows.set("ISS-12", {
    ...rewordedRows.get("ISS-12"),
    requiredAction: "create needs_attention record",
  });
  assert.equal(issueDecision({ repositoryRank: "ambiguous" }, rewordedRows).mayWrite, false);
  rewordedRows.get("ISS-12").writePermission = "maybe";
  assert.deepEqual(issueDecision({ repositoryRank: "ambiguous" }, rewordedRows), {
    status: "needs_attention",
    reason: "canonical_write_permission_invalid",
  });
});

test("Issue routing fails closed for overlapping facts, truncated search, unknown effect, and secrets", () => {
  assert.equal(issueDecision({ rootCause: "project", forbiddenData: true }).scenario, "ISS-08");
  assert.equal(issueDecision({ search: "incomplete" }).mayWrite, false);
  assert.match(issueDecision({ writeEffect: "ambiguous" }).requiredAction, /Read-only lookup/u);
  for (const blocker of [
    { auth: "unavailable" },
    { search: "incomplete" },
    { capability: "missing" },
    { forbiddenData: true },
    { repositoryRank: "ambiguous" },
  ]) {
    assert.equal(
      issueDecision({ ...WRITE_READY, rootCause: "project", ...blocker }).mayWrite,
      false,
    );
  }
  for (const facts of [
    { ...WRITE_READY, match: "open_exact", rootCause: "unknown" },
    { ...WRITE_READY, match: "open_exact", rootCause: "external", owner: "ambiguous" },
    {
      ...WRITE_READY,
      match: "closed_wontfix_alive",
      rootCause: "external",
      owner: "project_remotes_only",
    },
    { ...WRITE_READY, match: "closed_fixed_installed", rootCause: "project" },
  ]) {
    assert.equal(issueDecision(facts).mayWrite, false);
    assert.match(
      issueDecision(facts).writeBlocker,
      /(?:root_cause|ownership|repository)_unproved/u,
    );
  }
  for (const rootCause of ["external", "project", "unknown", undefined]) {
    const incompleteMixed = {
      ...WRITE_READY,
      mixedWorkaround: true,
      rootCause,
      owner: "verified",
      upstreamRepository: "verified",
    };
    assert.equal(issueDecision(incompleteMixed).mayWrite, false);
    assert.equal(issueDecision(incompleteMixed).writeBlocker, "mixed_ownership_unproved");
  }
  assert.equal(issueDecision({ rootCause: "unknown", auth: "unavailable" }).scenario, "ISS-05");
  assert.equal(
    issueDecision({ rootCause: "external", owner: "ambiguous", auth: "unavailable" }).scenario,
    "ISS-02",
  );
  assert.equal(
    issueDecision({
      rootCause: "external",
      owner: "project_remotes_only",
      auth: "unavailable",
    }).scenario,
    "ISS-03",
  );
  assert.deepEqual(
    projectIssue({
      title: "Bounded defect",
      summary: "bounded defect",
      reproduction: "run public command",
      internalPrompt: "private prompt",
      transcript: "private transcript",
    }),
    {
      status: "ready",
      title: "Bounded defect",
      body: { summary: "bounded defect", reproduction: "run public command" },
    },
  );
  assert.deepEqual(
    projectIssue({ title: "Defect", summary: "token=abc", actual: "/home/alex/private" }),
    {
      status: "needs_attention",
      reason: "forbidden_data",
    },
  );
  for (const forbidden of [
    "Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==",
    "https://alice:s3cr3t@build.example/api",
    "ssh://alice:s3cr3t@build.example/repo",
    "postgresql://alice:s3cr3t@db.example/data",
    "ghp_abcdefghijklmnop",
    "access_token=abcdefghijklmnop",
    "api-token=abcdefghijklmnop",
    "AWS_SECRET_ACCESS_KEY=abcdefghijklmnop",
    "accessToken=abcdefghijklmnop",
    "refresh_token=abcdefghijklmnop",
    "auth-token=abcdefghijklmnop",
    '{"access_token":"abcdefghijklmnop"}',
    '{"api-token":"abcdefghijklmnop"}',
    '{"Authorization":"Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="}',
    '{"Proxy-Authorization":"Digest abcdefghijklmnop"}',
    '{"Authorization":"Negotiate abcdefghijklmnop"}',
    "-----BEGIN PRIVATE KEY-----",
    "SHELL=/bin/bash\nLANG=C\nCI=true",
    "build-host.internal",
    "HOME=/private/place",
    "person@example.com",
    "internal specification excerpt",
    "session transcript excerpt",
    "c:/users/alex/private",
    "\\\\buildserver\\private\\repo",
    "/etc/acme/private.conf",
  ]) {
    for (const field of ISSUE_PUBLIC_FIELDS) {
      assert.equal(
        projectIssue({ title: "Public defect", [field]: forbidden }).status,
        "needs_attention",
        field,
      );
    }
  }
  assert.equal(
    projectIssue({
      title: "Public defect",
      summary: "public defect",
      versions: "gh 2.96.0",
      links: "https://github.com/example/project/issues/1",
    }).status,
    "ready",
  );
  assert.deepEqual(projectIssue({ summary: "missing title" }), {
    status: "needs_attention",
    reason: "projection_unproved",
  });
});

function readiness(observation) {
  if (!observation.guidesSameBinary || !observation.versionMatched) {
    return { status: "unknown", allowDispatch: false };
  }
  if (observation.process !== "normal_agent" || observation.trustUi || observation.shellPrompt) {
    return { status: "unsupported", allowDispatch: false };
  }
  if (!observation.tuiIdle || observation.effectiveModel !== observation.requestedModel) {
    return { status: "unknown", allowDispatch: false };
  }
  if (observation.composed && !observation.payloadHeldUntilReady) {
    return { status: "unsupported", allowDispatch: false };
  }
  return { status: "ready", allowDispatch: true };
}

test("readiness delivers bytes only to a version-matched normal agent prompt", () => {
  const ready = {
    guidesSameBinary: true,
    versionMatched: true,
    process: "normal_agent",
    trustUi: false,
    shellPrompt: false,
    tuiIdle: true,
    requestedModel: "vendor/model",
    effectiveModel: "vendor/model",
    composed: false,
  };
  assert.deepEqual(readiness(ready), { status: "ready", allowDispatch: true });
  for (const unsafe of [
    { ...ready, process: "shell", shellPrompt: true },
    { ...ready, process: "trust", trustUi: true },
    { ...ready, versionMatched: false },
    { ...ready, composed: true, payloadHeldUntilReady: false },
  ]) {
    assert.equal(readiness(unsafe).allowDispatch, false);
  }
});

function waitOutcome({ transport, timedOut = false, events = [], active, retry = 0 }) {
  if (transport === "failure") {
    return retry === 0
      ? { status: "retry", sameArm: true }
      : { status: "UNKNOWN", reason: "transport_failure" };
  }
  const relevant = events.filter(
    ({ type, handle }) =>
      new Set(["worker_done", "escalation", "question"]).has(type) && active.has(handle),
  );
  if (relevant.length > 0) return { status: "event", events: relevant };
  if (timedOut) return { status: "quiet_timeout", snapshot: 1, rearm: true };
  return { status: "rearm", discarded: events.length };
}

test("one run-wide waiter distinguishes event, quiet timeout, retry, and transport failure", () => {
  const active = new Set(["review-a", "review-b"]);
  const batch = [
    { type: "question", handle: "review-a", id: "m1" },
    { type: "worker_done", handle: "review-b", id: "m2" },
  ];
  assert.deepEqual(waitOutcome({ transport: "ok", events: batch, active }), {
    status: "event",
    events: batch,
  });
  assert.deepEqual(waitOutcome({ transport: "ok", timedOut: true, active }), {
    status: "quiet_timeout",
    snapshot: 1,
    rearm: true,
  });
  assert.deepEqual(waitOutcome({ transport: "failure", active }), {
    status: "retry",
    sameArm: true,
  });
  assert.deepEqual(waitOutcome({ transport: "failure", active, retry: 1 }), {
    status: "UNKNOWN",
    reason: "transport_failure",
  });
  assert.deepEqual(
    waitOutcome({
      transport: "ok",
      events: [{ type: "worker_done", handle: "foreign" }],
      active,
    }),
    { status: "rearm", discarded: 1 },
  );
});
