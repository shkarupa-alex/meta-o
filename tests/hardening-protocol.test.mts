/**
 * §M-TEST-HARDENING-PROTOCOL — Bypasses at the backend boundary: dispatch, results, sessions.
 *
 * Every test in the four hardening suites corresponds to a way the workflow
 * could be made to say "verified" about something it had not verified: a guard
 * pointed at the wrong commit, a gate set without its evidence, a boundary that
 * covered only thirteen file extensions, a capability comparison whose two
 * sides shared no key. They share a shape — each one passed every other check
 * in the suite while being wrong.
 *
 * This slice covers the wire between the run and its agents: which sessions a
 * result may name, what the adapter reports, and the write-ahead protocol.
 *
 * Verifies §A-SNAPSHOT-ATTESTATION, §A-AUTHORITATIVE-QC and §A-BACKEND-CONTRACT.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";

import { createTempHome } from "./helpers.mts";
import {
  cli,
  confirmModels,
  passLocalGates,
  passReviews,
  dispatch,
  dispatchWorkers,
  errorCode,
  ok,
  retireSpec,
  seededRepo,
  startRun,
  type CliContext,
} from "./cli-harness.mts";
import { detectPolicyWeakening, parseMetaOPolicy } from "../dist/core/policy.mjs";
import { evaluateQc, validateResult } from "../dist/core/qc.mjs";
import { allowedTransitions, completionProven } from "../dist/core/fsm.mjs";
import { outsideClosure } from "../dist/core/adoption.mjs";
import { productionHeadings } from "../dist/cli/commands/results.mjs";
import { detectCapabilityRegression, unexercised } from "../dist/adapters/capability-suite.mjs";
import { listRuns } from "../dist/core/state-store.mjs";
import { roleView } from "../dist/core/role-view.mjs";
import type { CapabilityBaseline } from "../dist/adapters/capability-suite.mjs";
import type { QcManifest, QcResult, RunState } from "../dist/core/types.mjs";
import { attestedState, blocker, report } from "./hardening-fixtures.mts";

test("a policy written with dotted keys is read, not skipped", () => {
  // `[tool.meta_o]` with `code_health.max_function_lines` is what `tomllib`
  // reads, so a parser that only understood table headers reported no weakening
  // for a policy that had been gutted.
  const before = parseMetaOPolicy(
    ["[tool.meta_o]", "code_health.max_function_lines = 60", "purpose.exempt_files = []"].join("\n"),
  );
  const after = parseMetaOPolicy(
    [
      "[tool.meta_o]",
      "code_health.max_function_lines = 100000",
      'purpose.exempt_files = ["**"]',
    ].join("\n"),
  );

  const kinds = detectPolicyWeakening(before, after).map((item) => item.kind).sort();
  assert.deepEqual(kinds, ["exemption_added", "threshold_raised"]);
});

test("a QC result that reports one gate twice is ambiguous, not a pass", () => {
  const manifest: QcManifest = {
    schema_version: 1,
    gates: [
      { id: "lint", command: "ruff check .", policy: "passed" },
      { id: "tests", command: "pytest", policy: "passed" },
    ],
  };
  const result = {
    schema_version: 1,
    snapshot_digest: "abc",
    gates: [
      { id: "lint", status: "failed", command: "ruff check ." },
      { id: "lint", status: "passed", command: "ruff check ." },
      { id: "tests", status: "passed", command: "pytest" },
    ],
  };

  const validation = validateResult(result);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("; "), /reported more than once/);

  const evaluation = evaluateQc(manifest, result as unknown as QcResult, "abc");
  assert.equal(evaluation.pass, false);
});

test("an open blocking finding stops completion even when every gate reads passed", () => {
  const clean = attestedState();
  assert.equal(completionProven(clean), true);

  const blocked = attestedState({
    openFindings: {
      reviewerCrossVendor: [
        {
          finding: {
            id: "f1",
            severity: "blocker",
            classification: "defect",
            evidence: [
              { kind: "file", reference: "src/migrate.py:40", detail: "no guard on re-entry" },
            ],
            basis: { type: "architecture", reference: "§A-MIGRATIONS-01" },
            impact: "a retried deploy corrupts the ledger",
            recommendedFix: {
              approach: "key the migration on its own applied-set",
              rationale: "makes the second run a no-op instead of a second write",
            },
          },
          raisedBy: { backend: "herdr", sessionId: "s", role: "reviewerCrossVendor" },
          status: "open",
        },
      ],
    } as RunState["openFindings"],
  });
  assert.equal(completionProven(blocked), false);
});

test("a plan sealed for other content cannot prove completion", () => {
  // Sealed against a different *tree*, not merely a different commit: an
  // amend, rebase or squash that preserves the tree changes the commit and
  // nothing else, and §00 says explicitly that must not invalidate a gate.
  const stale = attestedState({ e2ePlanSnapshotDigest: "another-digest" });
  assert.equal(completionProven(stale), false);

  const rebased = attestedState({
    candidateSnapshot: { digest: "digest", provenanceCommit: "c1-amended", computedAt: "t" },
    e2ePlan: { ...attestedState().e2ePlan!, commitOid: "c1" },
  });
  assert.equal(completionProven(rebased), true, "the commit moved; the content did not");
});

test("an E2E fix can return to the E2E loop without passing through review", () => {
  // The only legal exit from LOCAL_QC used to run through REVIEW_STABILIZATION,
  // which rewrites `activeLoop` to `review` — so the guard that keeps an E2E fix
  // out of a review round was disarmed by the only route available.
  assert.ok(allowedTransitions("LOCAL_QC").includes("E2E_STABILIZATION"));
});

test("the adoption boundary covers the languages a brownfield repository is written in", () => {
  const manifest = { schema_version: 1 as const, adopted_roots: ["src"] };
  const outside = outsideClosure(
    [
      "src/app.ts",
      "legacy/App.tsx",
      "legacy/deploy.sh",
      "legacy/main.c",
      "legacy/schema.sql",
      "legacy/cfg.cjs",
      "docs/knowledge/business.md",
    ],
    manifest,
  );
  assert.deepEqual(outside, [
    "legacy/App.tsx",
    "legacy/cfg.cjs",
    "legacy/deploy.sh",
    "legacy/main.c",
    "legacy/schema.sql",
  ]);
});

test("a smoke report and a full baseline share the keys the comparison needs", () => {
  const baseline: CapabilityBaseline = {
    backend: "herdr",
    mode: "full",
    recordedAt: "2026-07-01T00:00:00Z",
    grades: { spawn: "supported", "reported:stop": "supported" },
  };
  const smoke = report("smoke", { capabilities: "supported", "reported:stop": "unsupported" });

  assert.deepEqual(detectCapabilityRegression(baseline, smoke), [
    "reported:stop: supported → unsupported (reported:stop)",
  ]);
  // And the behavioural check the smoke run cannot re-prove is named rather
  // than counted as still true.
  assert.deepEqual(unexercised(baseline, smoke), ["spawn"]);
});

test("an unreadable runs directory is reported, not read as an empty project", () => {
  const home = createTempHome();
  try {
    const runs = join(home.dir, "projects", "victim", "runs");
    mkdirSync(join(home.dir, "projects", "victim"), { recursive: true, mode: 0o700 });
    mkdirSync(join(home.dir, "elsewhere"), { recursive: true, mode: 0o700 });
    symlinkSync(join(home.dir, "elsewhere"), runs);
    assert.throws(() => listRuns("victim"));
  } finally {
    home.dispose();
  }
});

test("a finding cannot be closed on the authority of a session that was never dispatched", () => {
  // `--by-role` is a claim. It used to be compared only against the raising
  // role, so the executor had merely to claim the raiser's own role — the
  // check the code comment said made this safe was the check being evaded.
  // What is checkable is dispatch, so only `reviewerPrimary` is spawned here:
  // the close is then attempted on the authority of the reviewer this run
  // never opened a session for.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatch(context, runId, "reviewerPrimary");
    ok(
      cli(["run", "open-findings", "--run-id", runId, "--reviewer", "reviewerPrimary"], {
        ...context,
        stdin: blocker("F-1"),
      }),
      "open-findings",
    );
    ok(
      cli(
        [
          "run",
          "propose-fix",
          "--run-id",
          runId,
          "--reviewer",
          "reviewerPrimary",
          "--finding-id",
          "F-1",
          "--candidate-commit",
          "abc123",
        ],
        {
          ...context,
          stdin: JSON.stringify([
            { kind: "file", reference: "src/app.py:1", detail: "the token is checked now" },
          ]),
        },
      ),
      "propose-fix",
    );

    const impersonated = cli(
      [
        "run",
        "resolve-finding",
        "--run-id",
        runId,
        "--reviewer",
        "reviewerPrimary",
        "--finding-id",
        "F-1",
        "--by-role",
        "reviewerCrossVendor",
      ],
      context,
    );
    assert.equal(impersonated.code, 1);
    assert.equal(errorCode(impersonated), "no_such_session");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a decision cannot be rewritten once it is recorded", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    const payload = JSON.stringify({
      id: "D-1",
      category: "architecture",
      question: "one queue or two?",
      answer: "one",
      decidedBy: "user",
      rationale: "two would need a second failure mode nobody is watching",
    });
    ok(cli(["run", "record-decision", "--run-id", runId], { ...context, stdin: payload }), "first");
    const again = cli(["run", "record-decision", "--run-id", runId], { ...context, stdin: payload });
    assert.equal(again.code, 1);
    assert.equal(errorCode(again), "duplicate_decision");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("the metadata guard may not be pointed at a commit other than the candidate", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");

    const refused = cli(
      ["snapshot", "verify-metadata", "--run-id", runId, "--attested", "HEAD~1"],
      context,
    );
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "attested_commit_mismatch");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("an E2E result is refused unless a worktree receipt proves it ran isolated", () => {
  // §30 requires the tester to work in a fresh detached worktree and to touch
  // no tracked file, and `record-e2e` used to accept whatever JSON arrived on
  // stdin. A suite run in the developer's own checkout — over uncommitted
  // edits, possibly leaving some behind — produced a gate indistinguishable
  // from an isolated one.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatchWorkers(context, runId);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    const candidate = ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");
    const commitOid = candidate.json["provenanceCommit"] as string;
    const snapshotDigest = candidate.json["snapshotDigest"] as string;

    const plan = ok(
      cli(["e2e", "seal-plan"], {
        ...context,
        stdin: JSON.stringify({
          schemaVersion: 1,
          commitOid,
          selectedScenarioIds: ["E2E-CHECKOUT-01", "E2E-SMOKE-01"],
          selectionRationale: "checkout is impacted; the canary always runs",
          impactedBusinessLinks: ["§B-CHECKOUT-01"],
          impactedTags: ["checkout"],
        }),
      }),
      "seal-plan",
    ).json as unknown as { planDigest: string; selectedScenarioIds: string[] };
    ok(
      cli(["run", "set-plan", "--run-id", runId], { ...context, stdin: JSON.stringify(plan) }),
      "set-plan",
    );
    passReviews(context, runId, { commitOid, snapshotDigest, planDigest: plan.planDigest });

    const e2eResult = JSON.stringify({
      commitOid,
      snapshotDigest,
      planDigest: plan.planDigest,
      selectedScenarioIds: plan.selectedScenarioIds,
      selectionRationale: "checkout is impacted; the canary always runs",
      scenarios: plan.selectedScenarioIds.map((scenarioId) => ({
        scenarioId,
        status: "passed",
        evidence: "green",
      })),
      environment: "local",
      completedAt: "2026-07-24T12:30:00Z",
    });

    const unproven = cli(["run", "record-e2e", "--run-id", runId], { ...context, stdin: e2eResult });
    assert.equal(unproven.code, 1);
    assert.equal(errorCode(unproven), "e2e_not_isolated");

    // A receipt for some other commit is no better than none.
    repo.write("docs/notes.md", "# notes\n");
    repo.commit("an unrelated commit the tester might have run against");
    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "--rev", "HEAD", "true"], context),
      "worktree run against the wrong revision",
    );
    const mismatched = cli(["run", "record-e2e", "--run-id", runId], {
      ...context,
      stdin: e2eResult,
    });
    assert.equal(mismatched.code, 1);
    assert.equal(errorCode(mismatched), "e2e_not_isolated");
    assert.match(
      (mismatched.json["error"] as { message: string }).message,
      /but the candidate's content is/,
    );

    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "--rev", commitOid, "true"], context),
      "worktree run against the candidate",
    );
    ok(cli(["run", "record-e2e", "--run-id", runId], { ...context, stdin: e2eResult }), "record-e2e");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a reviewer's bounded view withholds the other reviewer's findings by name", () => {
  // §30: the two reviewers "не получают … findings друг друга". `run show`
  // printed the whole state, so a reviewer that ran it for the candidate digest
  // read the other reviewer's verdict on the way past — and two reviewers who
  // have read each other are one reviewer with extra steps.
  const state: RunState = {
    ...({} as RunState),
    runId: "run-1",
    phase: "REVIEW_STABILIZATION",
    specBlob: "/blob",
    baseRevision: "base",
    confirmations: {},
    updatedAt: "2026-07-24T00:00:00Z",
    openFindings: {
      reviewerPrimary: [{ finding: { id: "F-1" }, status: "open" } as never],
      reviewerCrossVendor: [{ finding: { id: "F-2" }, status: "open" } as never],
      e2e: [{ finding: { id: "E2E-1" }, status: "open" } as never],
    },
  };

  const primary = roleView(state, "reviewerPrimary");
  assert.deepEqual(
    primary.findings.map((record) => record.finding.id),
    ["F-1"],
  );
  assert.deepEqual(
    primary.withheld,
    ["reviewerCrossVendor", "e2e"],
    "withholding is named, because silence would read as `the others found nothing`",
  );

  // The executor is answerable for all of them, so it sees all of them.
  assert.deepEqual(
    roleView(state, "executor").findings.map((record) => record.finding.id),
    ["F-1", "F-2", "E2E-1"],
  );
  assert.deepEqual(roleView(state, "executor").withheld, []);
  assert.deepEqual(
    roleView(state, "e2eTester").findings.map((record) => record.finding.id),
    ["E2E-1"],
  );
  assert.deepEqual(roleView(state, "reuseResearcher").findings, []);
});

test("the bounded view is reachable from the CLI and rejects a role it does not know", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    const view = ok(
      cli(["run", "show", "--run-id", runId, "--as-role", "reviewerCrossVendor"], context),
      "run show --as-role",
    );
    assert.equal(view.json["role"], "reviewerCrossVendor");
    assert.equal(view.json["modelSet"], undefined, "a worker is not told what judges it");
    assert.equal(view.json["sessions"], undefined, "nor how to reach the other workers");

    const refused = cli(["run", "show", "--run-id", runId, "--as-role", "orchestrator"], context);
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "unknown_role");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("an amend that preserves the tree does not invalidate a single gate", () => {
  // §00: "Изменение code, tests, config, knowledge, purpose или E2E catalog
  // инвалидирует attestations. Rebase/squash идентичного tree — нет." The plan
  // was compared to the candidate by commit oid, so an amend — which changes
  // the oid and nothing else — sent the run back for both reviews and the whole
  // selected E2E set.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    const first = ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");
    const commitOid = first.json["provenanceCommit"] as string;
    const digest = first.json["snapshotDigest"] as string;

    const plan = ok(
      cli(["e2e", "seal-plan"], {
        ...context,
        stdin: JSON.stringify({
          schemaVersion: 1,
          commitOid,
          selectedScenarioIds: ["E2E-CHECKOUT-01", "E2E-SMOKE-01"],
          selectionRationale: "checkout is impacted; the canary always runs",
          impactedBusinessLinks: ["§B-CHECKOUT-01"],
          impactedTags: ["checkout"],
        }),
      }),
      "seal-plan",
    ).json as unknown as { planDigest: string };
    ok(
      cli(["run", "set-plan", "--run-id", runId], { ...context, stdin: JSON.stringify(plan) }),
      "set-plan",
    );

    repo.git(["commit", "--amend", "--no-edit", "--date=2020-01-01T00:00:00Z"]);
    const amended = ok(cli(["run", "set-candidate", "--run-id", runId], context), "re-point");
    assert.equal(amended.json["snapshotDigest"], digest, "the tree is unchanged");
    assert.notEqual(amended.json["provenanceCommit"], commitOid, "the commit is not");
    assert.notEqual(
      (amended.json["routing"] as { action: string }).action,
      "await_selection_plan",
      "the plan still describes this content",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("the production contract is read as Markdown, not as a substring search", () => {
  // Every shortcut in this reader was a real wrong answer: an example inside a
  // fence, a commented-out contract and an indented code block all satisfied
  // the gate, while a tab-indented code block opened a fence that never closed
  // and hid a genuine contract for the rest of the document.
  const accepts: [string, string][] = [
    ["a plain heading", "## Production safety\n"],
    ["a setext heading", "Running against production\n==========================\n"],
    ["a single-dash setext underline", "Running against production\n-\n"],
    [
      "a real heading after a tab-indented code block",
      "\t```\ncode\n\n## Running against production\n\nnamespaced per run\n",
    ],
  ];
  const refuses: [string, string][] = [
    ["a fenced example", "```markdown\n## Production safety\n```\n"],
    ["a tilde-fenced example", "~~~\n## Production safety\n~~~\n"],
    ["a fenced example inside a longer fence", "````\n```\n## Production safety\n```\n````\n"],
    ["a fence closed by a line carrying an info string", "```\nx\n```markdown\n## Production safety\n"],
    ["an unclosed fence", "```\n## Production safety\n"],
    ["a commented-out contract", "<!--\n## Production safety\n-->\n"],
    ["an indented code block underlined", "    Production safety\n===\n"],
    ["front matter", "---\ntitle: production runbook\n---\n\n# E2E\n"],
    ["a quoted heading", "> ## Production safety\n"],
    ["a heading that merely contains the letters", "### Reproduction of a failed scenario\n"],
  ];

  for (const [what, text] of accepts) {
    assert.ok(productionHeadings(text).length > 0, `${what} must count as a contract`);
  }
  for (const [what, text] of refuses) {
    assert.deepEqual(productionHeadings(text), [], `${what} must not count as a contract`);
  }
});

test("the machine-wide defaults the error message names can be written", () => {
  // `run start` told users that `~/.meta-o/config.json` could declare a
  // `defaultModelSet`, and no command wrote that file: the documented
  // convenience was reachable only with a text editor.
  const home = createTempHome();
  const context: CliContext = { cwd: process.cwd(), home: home.dir };
  const modelSet = {
    executor: { route: "claude", vendor: "anthropic", family: "claude", model: "opus" },
    reviewerPrimary: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
    reviewerCrossVendor: { route: "codex", vendor: "openai", family: "gpt", model: "gpt-5" },
    e2eTester: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
  };
  try {
    assert.equal(
      ok(cli(["config", "show"], context), "config show on a fresh machine").json["config"],
      null,
      "absence is reported as absence, not as an error",
    );

    // The same invariants as the project settings: a default that violates
    // cross-vendor independence would be re-offered at every start on the machine.
    const sameVendor = { ...modelSet, reviewerCrossVendor: modelSet.reviewerPrimary };
    assert.equal(
      errorCode(
        cli(["config", "set-defaults"], {
          ...context,
          stdin: JSON.stringify({ defaultModelSet: sameVendor }),
        }),
      ),
      "invalid_model_set",
    );

    ok(
      cli(["config", "set-defaults"], {
        ...context,
        stdin: JSON.stringify({ defaultModelSet: modelSet, defaultBackend: "herdr" }),
      }),
      "config set-defaults",
    );
    const shown = ok(cli(["config", "show"], context), "config show").json["config"] as Record<
      string,
      unknown
    >;
    assert.equal(shown["schema_version"], 1);
    assert.deepEqual(shown["defaultModelSet"], modelSet);
  } finally {
    home.dispose();
  }
});

test("a result may only be attributed to a worker this run dispatched", () => {
  // Authority by dispatch, applied where it decides the most. `resolve-finding`
  // has required a real session since the audit that found the fabricated
  // `unrecorded-<role>` stand-in; the commands that *record* a result kept it,
  // so closing one finding was held to a standard that setting two of the four
  // completion attestations was not. A `record-review` against a run with an
  // empty `sessions` map produced them out of nothing.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    const candidate = ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");
    const commitOid = candidate.json["provenanceCommit"] as string;
    const snapshotDigest = candidate.json["snapshotDigest"] as string;
    const plan = ok(
      cli(["e2e", "seal-plan"], {
        ...context,
        stdin: JSON.stringify({
          schemaVersion: 1,
          commitOid,
          selectedScenarioIds: ["E2E-SMOKE-01"],
          selectionRationale: "the canary always runs",
          impactedBusinessLinks: [],
          impactedTags: [],
        }),
      }),
      "seal-plan",
    ).json as unknown as { planDigest: string };
    ok(
      cli(["run", "set-plan", "--run-id", runId], { ...context, stdin: JSON.stringify(plan) }),
      "set-plan",
    );
    // The ordering guard is satisfied first, so what the payload runs into
    // below is the authority check and nothing else.
    passLocalGates(context, runId);

    const undispatched = cli(["run", "record-review", "--run-id", runId], {
      ...context,
      stdin: JSON.stringify({
        reviewer: "reviewerPrimary",
        commitOid,
        snapshotDigest,
        planDigest: plan.planDigest,
        selectionPlanVerdict: "complete",
        verdict: "passed",
        findings: [],
        completedAt: "2026-07-24T12:00:00Z",
      }),
    });
    assert.equal(errorCode(undispatched), "no_such_session");
    assert.match(undispatched.stderr, /session spawn --role reviewerPrimary/);

    const noFindings = cli(["run", "open-findings", "--run-id", runId, "--reviewer", "e2e"], {
      ...context,
      stdin: blocker("X-1"),
    });
    assert.equal(errorCode(noFindings), "no_such_session");

    // Dispatched, the same payload is accepted and names the real session.
    dispatch(context, runId, "reviewerPrimary");
    ok(
      cli(["run", "record-review", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          reviewer: "reviewerPrimary",
          commitOid,
          snapshotDigest,
          planDigest: plan.planDigest,
          selectionPlanVerdict: "complete",
          verdict: "changes_requested",
          findings: JSON.parse(blocker("R-1")),
          completedAt: "2026-07-24T12:00:00Z",
        }),
      }),
      "record a dispatched reviewer's verdict",
    );
    const records = (
      (ok(cli(["run", "show", "--run-id", runId], context), "run show").json[
        "openFindings"
      ] as Record<string, Array<{ raisedBy: { sessionId: string } }>>)["reviewerPrimary"] ?? []
    ).map((record) => record.raisedBy.sessionId);
    assert.equal(records.length, 1);
    assert.ok(
      !records[0]?.startsWith("unrecorded-"),
      `the finding must name a real session, got ${records[0]}`,
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("an E2E result must state the set it ran, and it must be the sealed one", () => {
  // §30 lists the selection and its rationale among the result's fields, and
  // `test-e2e` tells the tester "the selection you actually ran is what the
  // plan-bound gates are checked against" — while nothing read either field. A
  // tester obeying the instruction gained nothing; one ignoring it lost nothing.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatchWorkers(context, runId);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    const candidate = ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");
    const commitOid = candidate.json["provenanceCommit"] as string;
    const snapshotDigest = candidate.json["snapshotDigest"] as string;
    const plan = ok(
      cli(["e2e", "seal-plan"], {
        ...context,
        stdin: JSON.stringify({
          schemaVersion: 1,
          commitOid,
          selectedScenarioIds: ["E2E-CHECKOUT-01", "E2E-SMOKE-01"],
          selectionRationale: "checkout is impacted; the canary always runs",
          impactedBusinessLinks: ["§B-CHECKOUT-01"],
          impactedTags: ["checkout"],
        }),
      }),
      "seal-plan",
    ).json as unknown as { planDigest: string; selectedScenarioIds: string[] };
    ok(
      cli(["run", "set-plan", "--run-id", runId], { ...context, stdin: JSON.stringify(plan) }),
      "set-plan",
    );
    passReviews(context, runId, { commitOid, snapshotDigest, planDigest: plan.planDigest });
    ok(cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "true"], context), "isolated run");

    /** §M-TEST-HARDENING-PROTOCOL — An otherwise valid result with the selection fields overridden. */
    const record = (overrides: Record<string, unknown>) =>
      cli(["run", "record-e2e", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          commitOid,
          snapshotDigest,
          planDigest: plan.planDigest,
          selectedScenarioIds: plan.selectedScenarioIds,
          selectionRationale: "checkout is impacted; the canary always runs",
          scenarios: [
            { scenarioId: "E2E-CHECKOUT-01", status: "passed", evidence: "checkout ok" },
            { scenarioId: "E2E-SMOKE-01", status: "passed", evidence: "boot ok" },
          ],
          environment: "local",
          completedAt: "2026-07-24T12:30:00Z",
          ...overrides,
        }),
      });

    // A result that ran the scenarios but claims a different set is the case
    // the plan-bound digest cannot catch on its own.
    //
    // `e2e result` is the pre-flight check the tester's skill tells it to run
    // before handing anything in. It used to judge a strict subset of what
    // recording judges, so it printed `pass: true` for payloads the run then
    // refused. Both now call one function; these assert they agree.
    /** §M-TEST-HARDENING-PROTOCOL — The same payload, offered to the dry run instead. */
    const dryRun = (overrides: Record<string, unknown>) =>
      cli(["e2e", "result", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          commitOid,
          snapshotDigest,
          planDigest: plan.planDigest,
          selectedScenarioIds: plan.selectedScenarioIds,
          selectionRationale: "checkout is impacted; the canary always runs",
          scenarios: [
            { scenarioId: "E2E-CHECKOUT-01", status: "passed", evidence: "checkout ok" },
            { scenarioId: "E2E-SMOKE-01", status: "passed", evidence: "boot ok" },
          ],
          environment: "local",
          completedAt: "2026-07-24T12:30:00Z",
          ...overrides,
        }),
      });

    for (const [what, overrides, expected] of [
      ["a silent selection", { selectedScenarioIds: [] }, /selectedScenarioIds is required/],
      ["a disagreeing selection", { selectedScenarioIds: ["E2E-SMOKE-01"] }, /the sealed plan selects/],
      ["an unexplained selection", { selectionRationale: "   " }, /selectionRationale is required/],
      ["an unnamed environment", { environment: "somewhere" }, /is not one of/],
    ] as Array<[string, Record<string, unknown>, RegExp]>) {
      const preflight = dryRun(overrides);
      assert.equal(preflight.code, 1, `the dry run refuses ${what}`);
      assert.equal(preflight.json["pass"], false);
      assert.match((preflight.json["errors"] as string[]).join("\n"), expected);
      assert.equal(errorCode(record(overrides)), "invalid_e2e_result", `recording refuses ${what}`);
    }

    assert.equal(ok(dryRun({}), "the dry run accepts what recording accepts").json["pass"], true);
    ok(record({}), "the shape the skill documents is the shape the command accepts");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a solution scan the user did not ask for is refused", () => {
  // §00 step 5 asks the user whether to run the optional reuse scan, and the
  // answer is the `--reuse-scan` flag. The phase has to be unreachable without
  // it, or the question is decoration: the routing table would go on reporting
  // "the user enabled the optional reuse scan" over a run whose recorded
  // consent said the opposite.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const unasked = startRun(context);
    confirmModels(context, unasked);
    const refused = cli(
      ["run", "transition", "--run-id", unasked, "--phase", "SOLUTION_SCAN"],
      context,
    );
    assert.equal(errorCode(refused), "reuse_scan_not_enabled");
    assert.match(refused.stderr, /--reuse-scan/);
    ok(
      cli(["run", "transition", "--run-id", unasked, "--phase", "EXECUTING"], context),
      "the phase is optional, so skipping it is the ordinary path",
    );

    const asked = startRun(context, ["--reuse-scan"]);
    confirmModels(context, asked);
    ok(
      cli(["run", "transition", "--run-id", asked, "--phase", "SOLUTION_SCAN"], context),
      "consent recorded at start is what opens the phase",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("the heavy E2E set may not be banked before both reviews have passed", () => {
  // The ordering was checked on the transition into E2E_STABILIZATION and
  // nowhere else, so the command the E2E tester actually calls accepted a full
  // selected set run against a candidate neither reviewer had read. It cannot
  // produce a false green — completion still needs four attestations on one
  // digest — but the heavy suite gets spent twice, which is the whole reason
  // §30 orders the two.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatchWorkers(context, runId);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    const candidate = ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");
    const commitOid = candidate.json["provenanceCommit"] as string;
    const snapshotDigest = candidate.json["snapshotDigest"] as string;
    const plan = ok(
      cli(["e2e", "seal-plan"], {
        ...context,
        stdin: JSON.stringify({
          schemaVersion: 1,
          commitOid,
          selectedScenarioIds: ["E2E-SMOKE-01"],
          selectionRationale: "the canary always runs",
          impactedBusinessLinks: [],
          impactedTags: [],
        }),
      }),
      "seal-plan",
    ).json as unknown as { planDigest: string; selectedScenarioIds: string[] };
    ok(
      cli(["run", "set-plan", "--run-id", runId], { ...context, stdin: JSON.stringify(plan) }),
      "set-plan",
    );
    ok(cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "true"], context), "isolated");

    const result = JSON.stringify({
      commitOid,
      snapshotDigest,
      planDigest: plan.planDigest,
      selectedScenarioIds: plan.selectedScenarioIds,
      selectionRationale: "the canary always runs",
      scenarios: [{ scenarioId: "E2E-SMOKE-01", status: "passed", evidence: "green" }],
      environment: "local",
      completedAt: "2026-07-24T12:30:00Z",
    });

    const early = cli(["run", "record-e2e", "--run-id", runId], { ...context, stdin: result });
    assert.equal(errorCode(early), "reviews_not_passed");
    assert.deepEqual(
      (early.json["error"] as { missingGates?: string[] }).missingGates,
      ["reviewerPrimary", "reviewerCrossVendor"],
    );

    passReviews(context, runId, { commitOid, snapshotDigest, planDigest: plan.planDigest });
    ok(
      cli(["run", "record-e2e", "--run-id", runId], { ...context, stdin: result }),
      "with both reviews on the record, the same result is banked",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});
