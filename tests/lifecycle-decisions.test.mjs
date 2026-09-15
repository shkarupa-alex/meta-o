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

const ROOT = resolve(import.meta.dirname, "..");
const markdown = new MarkdownIt();

function issueRows() {
  const tokens = markdown.parse(
    readFileSync(resolve(ROOT, "docs/architecture/issue-routing.md"), "utf8"),
    {},
  );
  const start = tokens.findIndex(({ type }) => type === "table_open");
  const rows = [];
  let row = null;
  for (const token of tokens.slice(start + 1)) {
    if (token.type === "table_close") break;
    if (token.type === "tr_open") row = [];
    if (token.type === "inline" && row) row.push(token.content.trim());
    if (token.type === "tr_close") rows.push(row);
  }
  return new Map(rows.slice(1).map((cells) => [cells[0], cells]));
}

const ISSUE_RULES = [
  [(facts) => facts.forbiddenData, "ISS-08", "redact_rebuild", false],
  [(facts) => facts.writeEffect === "ambiguous", "ISS-09", "readonly_lookup", false],
  [(facts) => facts.search === "incomplete", "ISS-14", "narrow_or_attention", false],
  [(facts) => facts.capability === "missing", "ISS-15", "record_help_unsupported", false],
  [(facts) => facts.writeEffect === "rejected", "ISS-13", "report_exact_failure", false],
  [(facts) => facts.mixedWorkaround, "ISS-10", "cross_link_two", true],
  [(facts) => facts.match === "open_exact", "ISS-06", "comment_sanitized", true],
  [(facts) => facts.match === "closed_fixed_installed", "ISS-07A", "create_linked", true],
  [(facts) => facts.match === "closed_fixed_newer", "ISS-07B", "reference_version", false],
  [(facts) => facts.match === "closed_wontfix_alive", "ISS-07C", "comment_sanitized", true],
  [
    (facts) => facts.repositoryKnown && facts.auth === "unavailable",
    "ISS-11",
    "credential_boundary",
    false,
  ],
  [(facts) => facts.repositoryRank === "ambiguous", "ISS-12", "needs_attention", false],
  [(facts) => facts.rootCause === "unknown", "ISS-05", "reproduce", false],
  [
    (facts) => facts.rootCause === "external" && facts.owner === "verified",
    "ISS-01",
    "search_comment_create",
    true,
  ],
  [
    (facts) => facts.rootCause === "external" && facts.owner === "ambiguous",
    "ISS-02",
    "needs_attention",
    false,
  ],
  [
    (facts) => facts.rootCause === "external" && facts.owner === "project_remotes_only",
    "ISS-03",
    "needs_attention",
    false,
  ],
  [(facts) => facts.rootCause === "project", "ISS-04", "project_precedence_search", true],
];

const ACTION_EVIDENCE = {
  "ISS-01": /Search all/u,
  "ISS-02": /needs_attention/u,
  "ISS-03": /needs_attention/u,
  "ISS-04": /Tracking ref/u,
  "ISS-05": /Reproduce/u,
  "ISS-06": /sanitized confirmed use case/u,
  "ISS-07A": /Create new Issue/u,
  "ISS-07B": /Reference required version/u,
  "ISS-07C": /sanitized use case/u,
  "ISS-08": /Redact\/rebuild/u,
  "ISS-09": /Read-only lookup/u,
  "ISS-10": /cross-linked Issues/u,
  "ISS-11": /Credential boundary/u,
  "ISS-12": /needs_attention/u,
  "ISS-13": /Report exact failure/u,
  "ISS-14": /Narrow or enlarge/u,
  "ISS-15": /Record help/u,
};
const ISSUE_CLASS = {
  "ISS-01": "upstream_issue",
  "ISS-02": "upstream_issue",
  "ISS-03": "upstream_issue",
  "ISS-04": "project_issue",
  "ISS-05": "unconfirmed",
  "ISS-06": "either",
  "ISS-07A": "either",
  "ISS-07B": "either",
  "ISS-07C": "either",
  "ISS-08": "either",
  "ISS-09": "either",
  "ISS-10": "mixed",
  "ISS-11": "either",
  "ISS-12": "either",
  "ISS-13": "either",
  "ISS-14": "either",
  "ISS-15": "either",
};

function issueDecision(facts) {
  const matched = ISSUE_RULES.find(([predicate]) => predicate(facts));
  if (!matched) return { status: "needs_attention", reason: "route_unclassified" };
  const [, scenario, action, mayWrite] = matched;
  return { status: "settled", scenario, class: ISSUE_CLASS[scenario], action, mayWrite };
}

function sanitizeIssueBody(body) {
  return body
    .replace(/(?:api[_-]?token|token|secret)=\S+/giu, "[REDACTED_CREDENTIAL]")
    .replace(/\/(?:home|Users|mnt)\/[^\s)]+/gu, "[REDACTED_PATH]")
    .replace(/```transcript[\s\S]*?```/giu, "[REDACTED_TRANSCRIPT]");
}

test("ISS-01 through ISS-15 route distinct facts to canonical actions", () => {
  const fixtures = [
    [{ rootCause: "external", owner: "verified" }, "ISS-01"],
    [{ rootCause: "external", owner: "ambiguous" }, "ISS-02"],
    [{ rootCause: "external", owner: "project_remotes_only" }, "ISS-03"],
    [{ rootCause: "project" }, "ISS-04"],
    [{ rootCause: "unknown" }, "ISS-05"],
    [{ match: "open_exact" }, "ISS-06"],
    [{ match: "closed_fixed_installed" }, "ISS-07A"],
    [{ match: "closed_fixed_newer" }, "ISS-07B"],
    [{ match: "closed_wontfix_alive" }, "ISS-07C"],
    [{ forbiddenData: true }, "ISS-08"],
    [{ writeEffect: "ambiguous" }, "ISS-09"],
    [{ mixedWorkaround: true }, "ISS-10"],
    [{ repositoryKnown: true, auth: "unavailable" }, "ISS-11"],
    [{ repositoryRank: "ambiguous" }, "ISS-12"],
    [{ writeEffect: "rejected" }, "ISS-13"],
    [{ search: "incomplete" }, "ISS-14"],
    [{ capability: "missing" }, "ISS-15"],
  ];
  const rows = issueRows();
  for (const [facts, scenario] of fixtures) {
    const result = issueDecision(facts);
    assert.equal(result.status, "settled", scenario);
    assert.equal(result.scenario, scenario);
    assert.ok(rows.has(result.scenario));
    assert.equal(result.class, rows.get(result.scenario)[1]);
    assert.ok(result.action.length > 3);
    assert.match(rows.get(result.scenario)[3], ACTION_EVIDENCE[result.scenario]);
  }
  assert.equal(new Set(fixtures.map(([, scenario]) => scenario)).size, rows.size);
});

test("Issue routing fails closed for overlapping facts, truncated search, unknown effect, and secrets", () => {
  assert.equal(issueDecision({ rootCause: "project", forbiddenData: true }).scenario, "ISS-08");
  assert.equal(issueDecision({ search: "incomplete" }).mayWrite, false);
  assert.equal(issueDecision({ writeEffect: "ambiguous" }).action, "readonly_lookup");
  const sanitized = sanitizeIssueBody(
    "token=abc /home/alex/private\n```transcript\nprivate prompt\n```",
  );
  assert.equal(sanitized.includes("abc"), false);
  assert.equal(sanitized.includes("/home/"), false);
  assert.equal(sanitized.includes("private prompt"), false);
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
