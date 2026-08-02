/**
 * §M-TEST-HARDENING-GATES — Bypasses in the gates themselves: QC, smoke, knowledge, decisions.
 *
 * Every test in the four hardening suites corresponds to a way the workflow
 * could be made to say "verified" about something it had not verified: a guard
 * pointed at the wrong commit, a gate set without its evidence, a boundary that
 * covered only thirteen file extensions, a capability comparison whose two
 * sides shared no key. They share a shape — each one passed every other check
 * in the suite while being wrong.
 *
 * This slice covers what the gates accept as evidence: the QC manifest, the
 * smoke suite, the knowledge chain, and the decisions a gate is allowed to cite.
 *
 * Verifies §A-SNAPSHOT-ATTESTATION, §A-AUTHORITATIVE-QC and §A-BACKEND-CONTRACT.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  readFileSync,
  readdirSync,
  renameSync,
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
import type { RunState } from "../dist/core/types.mjs";
import { blocker } from "./hardening-fixtures.mts";

test("a misspelled flag is refused instead of silently ignored", () => {
  const repo = seededRepo();
  const home = createTempHome();
  try {
    const refused = cli(["preflight", "--nobackend"], { cwd: repo.dir, home: home.dir });
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "unknown_flag");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a tracked spec introduced as a local path is still retired", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    ok(cli(["project", "init"], context), "project init");
    ok(
      cli(["project", "set-settings"], {
        ...context,
        stdin: JSON.stringify({
          schemaVersion: 1,
          modelSet: {
            executor: { route: "claude", vendor: "anthropic", family: "claude", model: "opus" },
            reviewerPrimary: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
            reviewerCrossVendor: { route: "codex", vendor: "openai", family: "gpt", model: "gpt-5" },
            e2eTester: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
          },
          backend: "herdr",
          watchdogEnabled: false,
          handoffDefault: false,
        }),
      }),
      "set-settings",
    );

    const started = ok(
      cli(
        [
          "run",
          "start",
          "--spec-kind",
          "local",
          "--spec-locator",
          join(repo.dir, "spec/feature.md"),
        ],
        context,
      ),
      "run start with an absolute path to a tracked file",
    );
    const runId = started.json["runId"] as string;

    const shown = ok(cli(["run", "show", "--run-id", runId], context), "run show");
    const spec = shown.json["spec"] as { kind: string; locator: string; disposition: string };
    assert.equal(spec.kind, "tracked");
    assert.equal(spec.locator, "spec/feature.md");
    assert.equal(spec.disposition, "delete_after_sync");

    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    const refused = cli(["run", "set-candidate", "--run-id", runId], context);
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "spec_not_retired");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a reviewer gate cannot be passed without the review that produced it", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    const refused = cli(
      ["run", "record-gate", "--run-id", runId, "--gate", "reviewerPrimary", "--status", "passed"],
      context,
    );
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "evidence_required");

    // A failure still goes through the plain command: it takes nothing away.
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");
    const failed = cli(
      ["run", "record-gate", "--run-id", runId, "--gate", "reviewerPrimary", "--status", "failed"],
      context,
    );
    assert.equal(errorCode(failed), "no_plan", "still refused, but for the plan rather than the word");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("an adjudicator can rule a finding real but not blocking", () => {
  // §20 gives the adjudicator three verdicts and the CLI implemented two, so
  // the honest one — "the concern is real, and it is taste" — was the one
  // verdict the tool could not record. An adjudicator who believed it had to
  // either uphold a blocker they disagreed with or call the concern gone.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatchWorkers(context, runId);
    ok(
      cli(["run", "open-findings", "--run-id", runId, "--reviewer", "reviewerPrimary"], {
        ...context,
        stdin: blocker("F-1"),
      }),
      "open-findings",
    );

    const args = [
      "run",
      "reclassify-finding",
      "--run-id",
      runId,
      "--reviewer",
      "reviewerPrimary",
      "--finding-id",
      "F-1",
      "--rationale",
      "the naming argument is real, and it is a preference",
    ];

    // Not before an adjudicator exists: the verdict names an authority.
    assert.equal(errorCode(cli(args, context)), "no_such_session");

    ok(
      cli(
        [
          "run",
          "set-session",
          "--run-id",
          runId,
          "--role",
          "technicalAdjudicator",
          "--session-id",
          "mo-adj",
        ],
        context,
      ),
      "dispatch the adjudicator",
    );

    const ruled = ok(cli(args, context), "reclassify");
    assert.equal(ruled.json["blocking"], 0, "it no longer blocks");

    const shown = ok(cli(["run", "show", "--run-id", runId], context), "run show");
    const open = (shown.json["openFindings"] as Record<string, { finding: Record<string, string> }[]>)[
      "reviewerPrimary"
    ];
    assert.equal(open?.length, 1, "and it is still on the record");
    assert.equal(open?.[0]?.finding["classification"], "taste");
    assert.equal(open?.[0]?.finding["severity"], "suggestion");
    assert.match(open?.[0]?.finding["impact"] ?? "", /reclassified as taste: the naming argument/);
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a proposed fix must say what it changed", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatchWorkers(context, runId);
    ok(
      cli(["run", "open-findings", "--run-id", runId, "--reviewer", "reviewerPrimary"], {
        ...context,
        stdin: blocker("F-1"),
      }),
      "open-findings",
    );

    const empty = cli(
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
      { ...context, stdin: "[]" },
    );
    assert.equal(empty.code, 1);
    assert.equal(errorCode(empty), "invalid_evidence");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("only the user can let an E2E set touch production", () => {
  // `environment` was declared, required non-empty by the registry schema, and
  // compared to nothing. §20 forbids production without an explicit user
  // decision, and until the result said where it ran there was nothing to
  // forbid it against.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);

    /** §M-TEST-HARDENING-GATES — Record one decision attributed to the given role. */
    const decided = (by: string, id: string): void => {
      ok(
        cli(["run", "record-decision", "--run-id", runId], {
          ...context,
          stdin: JSON.stringify({
            id,
            category: "irreversible",
            question: "may the checkout scenarios run against production?",
            answer: "yes, the sandbox tenant only",
            decidedBy: by,
            rationale: "staging has no payment provider, so nothing else exercises the callback",
          }),
        }),
        `record-decision by ${by}`,
      );
    };

    decided("orchestrator", "D-1");
    const notUser = cli(
      ["run", "approve-production-e2e", "--run-id", runId, "--decision-id", "D-1"],
      context,
    );
    assert.equal(notUser.code, 1);
    assert.equal(errorCode(notUser), "not_a_user_decision");

    decided("user", "D-2");
    ok(
      cli(["run", "approve-production-e2e", "--run-id", runId, "--decision-id", "D-2"], context),
      "a user decision is accepted",
    );

    const shown = ok(cli(["run", "show", "--run-id", runId], context), "run show");
    assert.equal((shown.json["decisions"] as unknown[]).length, 2, "and both survive a crash");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a run paused on an unavailable model can be given a new ModelSet", () => {
  // §00 gives PAUSED_MODEL_UNAVAILABLE two exits — resume, or a newly confirmed
  // ModelSet — and only the first existed. `state.modelSet` was written once by
  // `run start` and by nothing afterwards, so a run pinned to a model the user
  // had lost could only be cancelled, which is the exit the spec assigns to a
  // different state entirely.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  const replacement = JSON.stringify({
    executor: { route: "claude", vendor: "anthropic", family: "claude", model: "haiku" },
    reviewerPrimary: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
    reviewerCrossVendor: { route: "codex", vendor: "openai", family: "gpt", model: "gpt-5" },
    e2eTester: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
  });
  try {
    const runId = startRun(context);
    confirmModels(context, runId);
    ok(
      cli(
        ["run", "transition", "--run-id", runId, "--phase", "PAUSED_MODEL_UNAVAILABLE",
          "--reason", "the executor model was withdrawn",
          "--resume-condition", "a model the user still has"],
        context,
      ),
      "→ PAUSED_MODEL_UNAVAILABLE",
    );

    // The replacement is the user's to approve, exactly as the first set was:
    // without this the four models could be swapped for four nobody had been
    // shown, while `modelSetConfirmedBy` went on naming the old ones.
    const unconfirmed = cli(["run", "set-model-set", "--run-id", runId, "--decision-id", "D-NONE"], {
      ...context,
      stdin: replacement,
    });
    assert.equal(errorCode(unconfirmed), "unknown_decision");
    ok(
      cli(["run", "record-decision", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          id: "D-REPLACE",
          question: "run with this replacement ModelSet?",
          answer: "yes",
          rationale: "the withdrawn executor model is replaced by haiku",
          category: "tooling",
          decidedBy: "user",
        }),
      }),
      "record-decision D-REPLACE",
    );

    const rejected = cli(["run", "set-model-set", "--run-id", runId, "--decision-id", "D-REPLACE"], {
      ...context,
      stdin: JSON.stringify({
        executor: { route: "claude", vendor: "anthropic", family: "claude", model: "haiku" },
        reviewerPrimary: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
        reviewerCrossVendor: { route: "claude", vendor: "anthropic", family: "claude", model: "opus" },
        e2eTester: { route: "claude", vendor: "anthropic", family: "claude", model: "sonnet" },
      }),
    });
    assert.equal(rejected.code, 1, "a single-vendor replacement is still refused");
    assert.equal(errorCode(rejected), "invalid_model_set");

    const accepted = cli(["run", "set-model-set", "--run-id", runId, "--decision-id", "D-REPLACE"], {
      ...context,
      stdin: replacement,
    });
    ok(accepted, "set-model-set");
    assert.equal(
      accepted.json["modelSetConfirmedBy"],
      "D-REPLACE",
      "and the run now names the decision that approved *these* models",
    );
    assert.equal(
      ((accepted.json["modelSet"] as RunState["modelSet"]).executor).model,
      "haiku",
      "the run now carries the model the user confirmed",
    );

    ok(cli(["run", "transition", "--run-id", runId, "--phase", "PREFLIGHT"], context), "resume");
    const locked = cli(["run", "set-model-set", "--run-id", runId, "--decision-id", "D-REPLACE"], {
      ...context,
      stdin: replacement,
    });
    assert.equal(locked.code, 1, "a resumed run may not swap models under its own attestations");
    assert.equal(errorCode(locked), "model_set_locked");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("production needs a written contract, not only the user's consent", () => {
  // §20 asks for two things — "явный production-safe contract и подтверждение
  // пользователя" — and only the consent was checked. A user approving a run
  // whose rules nobody has written down is approving nothing in particular.
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
    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "true"], context),
      "the suite runs isolated",
    );

    const result = JSON.stringify({
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
      environment: "production",
      completedAt: "2026-07-24T12:30:00Z",
    });

    const unapproved = cli(["run", "record-e2e", "--run-id", runId], { ...context, stdin: result });
    assert.equal(errorCode(unapproved), "production_e2e_not_approved");

    ok(
      cli(["run", "record-decision", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          id: "D-1",
          category: "irreversible",
          question: "may the selected set run against production?",
          answer: "yes, once, on the staging replica of production data",
          decidedBy: "user",
          rationale: "the checkout flow cannot be exercised anywhere else",
          decidedAt: "2026-07-24T12:00:00Z",
        }),
      }),
      "record-decision",
    );
    ok(
      cli(["run", "approve-production-e2e", "--run-id", runId, "--decision-id", "D-1"], context),
      "approve-production-e2e",
    );

    const uncontracted = cli(["run", "record-e2e", "--run-id", runId], { ...context, stdin: result });
    assert.equal(errorCode(uncontracted), "no_production_contract");

    // With a contract written, the same result is recorded — this run has both
    // halves §20 asks for.
    repo.write(
      "docs/architecture/e2e.md",
      "# E2E\n\n## e2e-smoke-01\n\n## e2e-checkout-01\n\n## Running against production\n\n" +
        "Namespaced per run; every fixture is torn down even on failure.\n",
    );
    const contracted = repo.commit("write down what a production run may do");
    const recandidate = ok(
      cli(["run", "set-candidate", "--run-id", runId], context),
      "re-point at the contract",
    );
    const resealed = ok(
      cli(["e2e", "seal-plan"], {
        ...context,
        stdin: JSON.stringify({
          schemaVersion: 1,
          commitOid: contracted,
          selectedScenarioIds: ["E2E-CHECKOUT-01", "E2E-SMOKE-01"],
          selectionRationale: "checkout is impacted; the canary always runs",
          impactedBusinessLinks: ["§B-CHECKOUT-01"],
          impactedTags: ["checkout"],
        }),
      }),
      "re-seal",
    ).json as unknown as { planDigest: string; selectedScenarioIds: string[] };
    ok(
      cli(["run", "set-plan", "--run-id", runId], { ...context, stdin: JSON.stringify(resealed) }),
      "set-plan again",
    );
    // Writing the contract changed the content, so both reviews were
    // invalidated with it and the heavy set may not run again until they agree
    // about what is now in the tree.
    passReviews(context, runId, {
      commitOid: contracted,
      snapshotDigest: recandidate.json["snapshotDigest"] as string,
      planDigest: resealed.planDigest,
    });
    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "true"], context),
      "and the suite runs isolated against the new candidate",
    );
    ok(
      cli(["run", "record-e2e", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          ...(JSON.parse(result) as Record<string, unknown>),
          commitOid: contracted,
          snapshotDigest: (
            ok(cli(["run", "show", "--run-id", runId], context), "show").json[
              "candidateSnapshot"
            ] as { digest: string }
          ).digest,
          planDigest: resealed.planDigest,
        }),
      }),
      "record-e2e",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("the heavy E2E loop does not open before both reviews have passed", () => {
  // §30: "Heavy E2E начинается после PASS обоих reviewers." The router honoured
  // the second half of the rule — an E2E fix does not drag the run back into a
  // review round — by arming on `activeLoop.kind === "e2e"` alone, and nothing
  // checked how the loop came to be armed. Transitioning into it with zero
  // reviews recorded prescribed the full selected set against a candidate no
  // reviewer had read.
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

    ok(cli(["run", "transition", "--run-id", runId, "--phase", "LOCAL_QC"], context), "→ LOCAL_QC");
    passLocalGates(context, runId);
    const early = cli(["run", "transition", "--run-id", runId, "--phase", "E2E_STABILIZATION"], context);
    assert.equal(errorCode(early), "reviews_not_passed");
    assert.deepEqual((early.json["error"] as { missingGates?: string[] }).missingGates, [
      "reviewerPrimary",
      "reviewerCrossVendor",
    ]);

    /** §M-TEST-HARDENING-GATES — A passing review of the sealed candidate and plan. */
    const review = (reviewer: string): string =>
      JSON.stringify({
        reviewer,
        commitOid,
        snapshotDigest,
        planDigest: plan.planDigest,
        selectionPlanVerdict: "complete",
        verdict: "passed",
        findings: [],
        completedAt: "2026-07-24T12:00:00Z",
      });
    ok(
      cli(["run", "record-review", "--run-id", runId], { ...context, stdin: review("reviewerPrimary") }),
      "first review",
    );
    const stillOne = cli(["run", "transition", "--run-id", runId, "--phase", "E2E_STABILIZATION"], context);
    assert.equal(errorCode(stillOne), "reviews_not_passed", "one review is not two here either");

    ok(
      cli(["run", "record-review", "--run-id", runId], {
        ...context,
        stdin: review("reviewerCrossVendor"),
      }),
      "second review",
    );
    ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "E2E_STABILIZATION"], context),
      "both reviews passed, so the loop may open",
    );

    // And the return leg of an E2E fix still works: the reviews it invalidated
    // are exactly the ones this guard would otherwise demand again.
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "LOCAL_QC"], context), "→ LOCAL_QC");
    ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "E2E_STABILIZATION"], context),
      "the E2E loop is already open, so the fix returns to it",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("preflight performs the state-tree step §00 gives it", () => {
  // §00 preflight step 2 — "проверить ownership, mode и отсутствие symlinks в
  // project state" — was the one step the command named after it did not do.
  // The guarantee held anyway, because every state-touching command re-checks
  // before it reads; what was wrong is that `preflight` reported `ok: true`
  // over a project directory replaced by a symlink, which is the moment the
  // user is supposed to be told.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    ok(cli(["project", "init"], context), "project init");
    const projectKey = ok(cli(["project", "key"], context), "project key").json[
      "projectKey"
    ] as string;

    const honest = ok(cli(["preflight", "--no-backend"], context), "preflight");
    const checks = honest.json["checks"] as Array<{ id: string; status: string }>;
    assert.equal(checks.find((check) => check.id === "state-tree")?.status, "ok");

    const real = join(home.dir, "elsewhere");
    const planted = join(home.dir, "projects", projectKey);
    renameSync(planted, real);
    symlinkSync(real, planted);

    const diverted = cli(["preflight", "--no-backend"], context);
    assert.equal(diverted.code, 1);
    assert.equal(diverted.json["ok"], false);
    assert.deepEqual(diverted.json["missingContract"], ["state-tree"]);
    assert.match(
      (diverted.json["checks"] as Array<{ id: string; detail: string }>).find(
        (check) => check.id === "state-tree",
      )!.detail,
      /refusing to follow symlink in state tree/,
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("§20's findings directory is a view of the open records, not an archive", () => {
  // §20's external layout names `runs/<id>/findings/` and nothing created it.
  // It cannot be a second source of truth — §00 forbids a findings archive and
  // §30 deletes a closed record — so it is a projection of `state.json`,
  // rewritten on every commit, and a record that closes loses its file.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatch(context, runId, "reviewerPrimary");
    const projectKey = ok(cli(["project", "key"], context), "project key").json[
      "projectKey"
    ] as string;
    const dir = join(home.dir, "projects", projectKey, "runs", runId, "findings");
    assert.deepEqual(readdirSync(dir), [], "the directory exists before anything is raised");

    ok(
      cli(["run", "open-findings", "--run-id", runId, "--reviewer", "reviewerPrimary"], {
        ...context,
        stdin: blocker("F-1"),
      }),
      "open-findings",
    );
    assert.deepEqual(readdirSync(dir), ["reviewerPrimary.F-1.json"]);
    const projected = JSON.parse(readFileSync(join(dir, "reviewerPrimary.F-1.json"), "utf8")) as {
      role: string;
      status: string;
      finding: { id: string };
    };
    assert.equal(projected.role, "reviewerPrimary");
    assert.equal(projected.status, "open");
    assert.equal(projected.finding.id, "F-1");

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
    assert.equal(
      (
        JSON.parse(readFileSync(join(dir, "reviewerPrimary.F-1.json"), "utf8")) as {
          status: string;
        }
      ).status,
      "fix_proposed",
      "the view follows the record rather than lagging behind it",
    );

    // The two reviewers number their findings independently and never see each
    // other's, so the same id from both is ordinary. Keyed by id alone, the
    // second overwrote the first and one of two open blockers vanished from the
    // view.
    dispatch(context, runId, "reviewerCrossVendor");
    ok(
      cli(["run", "open-findings", "--run-id", runId, "--reviewer", "reviewerCrossVendor"], {
        ...context,
        stdin: blocker("F-1"),
      }),
      "the other reviewer raises the same id",
    );
    assert.deepEqual(readdirSync(dir).sort(), [
      "reviewerCrossVendor.F-1.json",
      "reviewerPrimary.F-1.json",
    ]);

    // An id that could not be a file name is refused on the way in, rather than
    // accepted into state.json and then silently missing from the view.
    const unusable = cli(["run", "open-findings", "--run-id", runId, "--reviewer", "reviewerPrimary"], {
      ...context,
      stdin: blocker("../../../../evil"),
    });
    assert.equal(errorCode(unusable), "invalid_finding");
    assert.match(unusable.stderr, /a finding id may hold letters/);

    ok(
      cli(
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
          "reviewerPrimary",
        ],
        context,
      ),
      "resolve-finding",
    );
    assert.deepEqual(
      readdirSync(dir),
      ["reviewerCrossVendor.F-1.json"],
      "a closed record is deleted, not archived — and only that one",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a reviewer's PASS is refused until QC and smoke have passed on the snapshot", () => {
  // §00 and §30 order the gates QC → smoke → reviews → heavy E2E, and only the
  // last arrow was enforced. `record-review` asked for a candidate, a plan and
  // a dispatched session, so both reviewers could pass a snapshot `make qc` had
  // never run on; recording QC afterwards left four attestations, all present
  // and all describing one digest, in an order §00 forbids.
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
    ).json as unknown as { planDigest: string };
    ok(
      cli(["run", "set-plan", "--run-id", runId], { ...context, stdin: JSON.stringify(plan) }),
      "set-plan",
    );

    /** §M-TEST-HARDENING-GATES — One reviewer's verdict on the sealed candidate. */
    const review = (verdict: string, reviewer = "reviewerPrimary"): string =>
      JSON.stringify({
        reviewer,
        commitOid,
        snapshotDigest,
        planDigest: plan.planDigest,
        selectionPlanVerdict: "complete",
        verdict,
        findings: verdict === "passed" ? [] : JSON.parse(blocker("B-1")),
        completedAt: "2026-07-24T12:00:00Z",
      });

    const beforeQc = cli(["run", "record-review", "--run-id", runId], {
      ...context,
      stdin: review("passed"),
    });
    assert.equal(errorCode(beforeQc), "gates_not_passed");
    assert.deepEqual((beforeQc.json["error"] as { missingGates?: string[] }).missingGates, [
      "qc",
      "smoke",
    ]);

    // The transition into the review round answers alike, or the guard would be
    // one command away from irrelevant.
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "LOCAL_QC"], context), "→ LOCAL_QC");
    ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "SMOKE_PREFLIGHT"], context),
      "→ SMOKE_PREFLIGHT",
    );
    const earlyRound = cli(
      ["run", "transition", "--run-id", runId, "--phase", "REVIEW_STABILIZATION"],
      context,
    );
    assert.equal(errorCode(earlyRound), "gates_not_passed");

    // A *failing* review is not held to the order: the reviewer who found a
    // blocker before QC ran still knows something, and refusing the record
    // would lose the finding to enforce a sequence it has already settled.
    ok(
      cli(["run", "record-review", "--run-id", runId], {
        ...context,
        stdin: review("changes_requested", "reviewerCrossVendor"),
      }),
      "a blocker is recordable whenever it is found",
    );

    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "qc", "make", "qc"], context),
      "make qc",
    );
    ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "qc", "--status", "passed"], context),
      "record qc",
    );

    // QC alone is not enough: smoke is what makes spending two reviewers and a
    // full E2E set on this candidate worth the money.
    const beforeSmoke = cli(["run", "record-review", "--run-id", runId], {
      ...context,
      stdin: review("passed"),
    });
    assert.equal(errorCode(beforeSmoke), "gates_not_passed");
    assert.deepEqual((beforeSmoke.json["error"] as { missingGates?: string[] }).missingGates, [
      "smoke",
    ]);

    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "smoke", "--", "true"], context),
      "smoke",
    );
    ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "smoke", "--status", "passed"], context),
      "record smoke",
    );
    ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "REVIEW_STABILIZATION"], context),
      "the review round opens once its prerequisites are on the record",
    );
    ok(
      cli(["run", "record-review", "--run-id", runId], { ...context, stdin: review("passed") }),
      "and the PASS is accepted",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a manifest that exempts every gate is not a manifest that declares them", () => {
  // The check compared gate ids, so a Python project could list all ten of the
  // starter profile's gates with `policy: "not_applicable"` — which demands
  // nothing of any of them — and preflight said it declared the whole profile.
  // That is the same failure the check exists to catch, reached by a different
  // route, with a green line saying otherwise.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    repo.write("pyproject.toml", "[project]\nname = \"thing\"\n");
    const gates = [
      "format-check",
      "lint",
      "typecheck-policy",
      "tests",
      "build-policy",
      "purpose",
      "knowledge",
      "import-graph",
      "code-health",
      "e2e-metadata",
    ];
    /** §M-TEST-HARDENING-GATES — A manifest declaring the profile's gates at one policy. */
    const manifest = (policy: string): string =>
      `${JSON.stringify(
        {
          schema_version: 1,
          gates: gates.map((id) => ({
            id,
            command: `make ${id}`,
            policy,
            ...(policy === "not_applicable" ? { rationale: "this project is different" } : {}),
          })),
        },
        null,
        2,
      )}\n`;

    /** §M-TEST-HARDENING-GATES — What preflight says about the Python profile. */
    const profileCheck = (): { status: string; detail: string } => {
      const checks = cli(["preflight"], context).json["checks"] as Array<{
        id: string;
        status: string;
        detail: string;
      }>;
      return checks.find((check) => check.id === "python-profile")!;
    };

    repo.write(".quality/qc-manifest.json", manifest("not_applicable"));
    repo.commit("exempt every gate of the profile");
    const exempted = profileCheck();
    assert.equal(exempted.status, "missing");
    assert.match(exempted.detail, /declared not_applicable: format-check, lint/);

    repo.write(".quality/qc-manifest.json", manifest("passed"));
    repo.commit("require every gate of the profile");
    assert.equal(profileCheck().status, "ok");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a knowledge impact plan is validated, and somebody reads it", () => {
  // It was stored exactly as it arrived, so `{"impactedModules": "src/app.py"}`
  // was accepted — and the reason that never hurt anyone is worse than the bug:
  // nothing consumed the field. §30 asks both reviewers whether the knowledge
  // diff is proportionate, and this is the run's own statement of what it
  // expected to touch.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatchWorkers(context, runId);

    const malformed = cli(["run", "knowledge-plan", "--run-id", runId], {
      ...context,
      stdin: JSON.stringify({
        impactedBusinessAnchors: [],
        impactedArchitectureAnchors: ["§a-lower-01"],
        impactedModules: "src/app.py",
        expectedSpecRetirement: [],
      }),
    });
    assert.equal(errorCode(malformed), "invalid_knowledge_plan");
    const message = (malformed.json["error"] as { message: string }).message;
    assert.match(message, /impactedModules must be an array of strings/);
    assert.match(message, /not a well-formed anchor: §a-lower-01/);

    ok(
      cli(["run", "knowledge-plan", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          impactedBusinessAnchors: ["§B-CHECKOUT-01"],
          impactedArchitectureAnchors: ["§A-APP-01"],
          impactedModules: ["§M-APP"],
          expectedSpecRetirement: ["spec/feature.md"],
        }),
      }),
      "a well-formed plan",
    );

    // The anchors it names need not exist yet — the plan is written before the
    // work and describes what the work will touch.
    for (const role of ["reviewerPrimary", "reviewerCrossVendor", "executor"]) {
      const view = ok(
        cli(["run", "show", "--run-id", runId, "--as-role", role], context),
        `run show --as-role ${role}`,
      ).json["knowledgeImpactPlan"] as { impactedModules: string[] } | undefined;
      assert.deepEqual(view?.impactedModules, ["§M-APP"], `${role} must be able to read it`);
    }
  } finally {
    home.dispose();
    repo.dispose();
  }
});
