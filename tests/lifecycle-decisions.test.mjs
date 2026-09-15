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
    "Class",
    "Preconditions",
    "Required action",
    "Forbidden action",
    "Evidence",
  ]);
  return new Map(
    rows
      .slice(1)
      .map(([scenario, issueClass, preconditions, requiredAction, forbiddenAction, evidence]) => [
        scenario,
        { issueClass, preconditions, requiredAction, forbiddenAction, evidence },
      ]),
  );
}

const ISSUE_RULES = [
  [(facts) => facts.forbiddenData, "ISS-08"],
  [(facts) => facts.writeEffect === "ambiguous", "ISS-09"],
  [(facts) => facts.search === "incomplete", "ISS-14"],
  [(facts) => facts.capability === "missing", "ISS-15"],
  [(facts) => facts.writeEffect === "rejected", "ISS-13"],
  [(facts) => facts.mixedWorkaround, "ISS-10"],
  [(facts) => facts.match === "open_exact", "ISS-06"],
  [(facts) => facts.match === "closed_fixed_installed", "ISS-07A"],
  [(facts) => facts.match === "closed_fixed_newer", "ISS-07B"],
  [(facts) => facts.match === "closed_wontfix_alive", "ISS-07C"],
  [(facts) => facts.repositoryKnown && facts.auth === "unavailable", "ISS-11"],
  [(facts) => facts.repositoryRank === "ambiguous", "ISS-12"],
  [(facts) => facts.rootCause === "unknown", "ISS-05"],
  [(facts) => facts.rootCause === "external" && facts.owner === "verified", "ISS-01"],
  [(facts) => facts.rootCause === "external" && facts.owner === "ambiguous", "ISS-02"],
  [(facts) => facts.rootCause === "external" && facts.owner === "project_remotes_only", "ISS-03"],
  [(facts) => facts.rootCause === "project", "ISS-04"],
];

function issueDecision(facts, rows = issueRows()) {
  const matched = ISSUE_RULES.find(([predicate]) => predicate(facts));
  if (!matched) return { status: "needs_attention", reason: "route_unclassified" };
  const [, scenario] = matched;
  const row = rows.get(scenario);
  if (!row) return { status: "needs_attention", reason: "canonical_route_missing" };
  const mayWrite = /(?:comment|create|add one|add sanitized|cross-linked Issues)/iu.test(
    row.requiredAction,
  );
  return { status: "settled", scenario, class: row.issueClass, ...row, mayWrite };
}

function sanitizeIssueBody(body) {
  return body
    .replace(/(?:api[_-]?token|token|secret)=\S+/giu, "[REDACTED_CREDENTIAL]")
    .replace(/\/(?:home|Users|mnt)\/[^\s)]+/gu, "[REDACTED_PATH]")
    .replace(/```transcript[\s\S]*?```/giu, "[REDACTED_TRANSCRIPT]");
}

test("ISS-01 through ISS-15 route distinct facts to canonical actions", () => {
  const fixtures = [
    [{ rootCause: "external", owner: "verified" }, "ISS-01", true],
    [{ rootCause: "external", owner: "ambiguous" }, "ISS-02", false],
    [{ rootCause: "external", owner: "project_remotes_only" }, "ISS-03", false],
    [{ rootCause: "project" }, "ISS-04", true],
    [{ rootCause: "unknown" }, "ISS-05", false],
    [{ match: "open_exact" }, "ISS-06", true],
    [{ match: "closed_fixed_installed" }, "ISS-07A", true],
    [{ match: "closed_fixed_newer" }, "ISS-07B", false],
    [{ match: "closed_wontfix_alive" }, "ISS-07C", true],
    [{ forbiddenData: true }, "ISS-08", false],
    [{ writeEffect: "ambiguous" }, "ISS-09", false],
    [{ mixedWorkaround: true }, "ISS-10", true],
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
  assert.equal(issueDecision({ repositoryRank: "ambiguous" }, rewordedRows).mayWrite, true);
});

test("Issue routing fails closed for overlapping facts, truncated search, unknown effect, and secrets", () => {
  assert.equal(issueDecision({ rootCause: "project", forbiddenData: true }).scenario, "ISS-08");
  assert.equal(issueDecision({ search: "incomplete" }).mayWrite, false);
  assert.match(issueDecision({ writeEffect: "ambiguous" }).requiredAction, /Read-only lookup/u);
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
