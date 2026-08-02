/**
 * §M-TEST-CLI — End-to-end acceptance test of a whole run driven through the CLI.
 *
 * Covers the §00 completion criterion in the only way that really proves it: by
 * walking a real repository from `run start` to `COMPLETE` through the same
 * commands a skill would issue, and by showing that the shortcuts a confused
 * orchestrator might take — completing without four attestations, recording a
 * gate for a superseded snapshot, taking over a live run — are refused.
 *
 * Verifies §A-RUN-LIFECYCLE and §A-SNAPSHOT-ATTESTATION.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempHome, type TempRepo } from "./helpers.mts";
import type { E2ESelectionPlan } from "../dist/core/types.mjs";
import {
  CLI,
  FAKE_HERDR,
  action,
  cli,
  errorCode,
  ok,
  retireSpec,
  seededRepo,
  startRun,
  writeLastRun,
  type CliContext,
  type CliResult,
} from "./cli-harness.mts";

test("a handoff is refused unless the run started with consent", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    const refused = cli(["run", "handoff", "--run-id", runId], { ...context, stdin: "note" });
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "handoff_not_enabled");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a run walks from start to COMPLETE only with four attestations on one snapshot", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };

  try {
    const projectKey = ok(cli(["project", "key"], context), "project key").json[
      "projectKey"
    ] as string;

    const runId = startRun(context);
    const shown = ok(cli(["run", "show", "--run-id", runId], context), "run show");
    const specSha256 = (shown.json["spec"] as { sha256: string }).sha256;
    assert.match(shown.json["specBlob"] as string, /\/input\/spec-[0-9a-f]{64}\.md$/);
    assert.equal(
      action(ok(cli(["run", "route", "--run-id", runId], context), "route")),
      "await_model_set",
      "a fresh run waits for the user to confirm the ModelSet",
    );

    // Preflight probes the backend too, so it runs against the fake Herdr: a
    // project contract the backend cannot execute is not a contract this
    // workflow can honour.
    const backed: CliContext = {
      ...context,
      env: { META_O_HERDR_BIN: FAKE_HERDR, FAKE_HERDR_STATE: join(home.dir, "fake-herdr.json") },
    };
    ok(cli(["preflight"], backed), "preflight");
    ok(cli(["e2e", "validate"], context), "e2e validate");
    ok(cli(["knowledge", "validate"], context), "knowledge validate");

    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");

    // Retirement is part of the candidate window, and the CLI says so.
    const stillTracked = cli(["run", "set-candidate", "--run-id", runId], context);
    assert.equal(stillTracked.code, 1);
    assert.equal(errorCode(stillTracked), "spec_not_retired");
    retireSpec(repo);

    const candidate = ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");
    const snapshotDigest = candidate.json["snapshotDigest"] as string;
    const candidateCommit = candidate.json["provenanceCommit"] as string;
    assert.equal(action(candidate), "await_selection_plan");

    const plan = ok(
      cli(["e2e", "seal-plan"], {
        ...context,
        stdin: JSON.stringify({
          schemaVersion: 1,
          commitOid: candidateCommit,
          selectedScenarioIds: ["E2E-CHECKOUT-01", "E2E-SMOKE-01"],
          selectionRationale: "checkout is impacted; the canary always runs",
          impactedBusinessLinks: ["§B-CHECKOUT-01"],
          impactedTags: ["checkout"],
        }),
      }),
      "e2e seal-plan",
    ).json as unknown as E2ESelectionPlan;

    ok(cli(["e2e", "validate-plan"], { ...context, stdin: JSON.stringify(plan) }), "validate-plan");
    const stored = ok(
      cli(["run", "set-plan", "--run-id", runId], { ...context, stdin: JSON.stringify(plan) }),
      "run set-plan",
    );
    assert.equal(action(stored), "run_qc");

    // Completion before any gate must be refused by the phase machine itself.
    const premature = cli(["run", "transition", "--run-id", runId, "--phase", "COMPLETE"], context);
    assert.equal(premature.code, 1);
    assert.equal(errorCode(premature), "illegal_transition");

    ok(cli(["run", "transition", "--run-id", runId, "--phase", "LOCAL_QC"], context), "→ LOCAL_QC");
    // The real path: `make qc` runs in a fresh detached worktree of the
    // candidate and writes its own result to `$META_O_QC_RESULT`. Nothing here
    // hands the run a verdict; the run recomputes one from that file.
    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "qc", "make", "qc"], context),
      "make qc in an isolated worktree",
    );
    const qc = ok(cli(["qc", "evaluate", "--run-id", runId], context), "qc evaluate");
    assert.equal(qc.json["pass"], true);
    ok(cli(["qc", "weakening", "--run-id", runId], context), "qc weakening");

    const afterQc = ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "qc", "--status", "passed"], context),
      "record qc",
    );
    assert.equal(action(afterQc), "run_smoke", "the smoke gate stands before the reviewers");

    ok(cli(["run", "transition", "--run-id", runId, "--phase", "SMOKE_PREFLIGHT"], context), "→ SMOKE");
    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "smoke", "true"], context),
      "the smoke runs in a worktree too",
    );
    const afterSmoke = ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "smoke", "--status", "passed"], context),
      "record smoke",
    );
    assert.equal(action(afterSmoke), "run_reviews");

    ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "REVIEW_STABILIZATION"], context),
      "→ REVIEW",
    );

    /** §M-TEST-CLI — A passing review payload for one reviewer slot. */
    const review = (reviewer: string): string =>
      JSON.stringify({
        reviewer,
        commitOid: candidateCommit,
        snapshotDigest,
        planDigest: plan.planDigest,
        selectionPlanVerdict: "complete",
        verdict: "passed",
        findings: [],
        completedAt: "2026-07-24T12:00:00Z",
      });

    const afterPrimary = ok(
      cli(["run", "record-review", "--run-id", runId], { ...context, stdin: review("reviewerPrimary") }),
      "record reviewerPrimary",
    );
    assert.equal(action(afterPrimary), "run_reviews", "one review is not two");

    const afterCross = ok(
      cli(["run", "record-review", "--run-id", runId], {
        ...context,
        stdin: review("reviewerCrossVendor"),
      }),
      "record reviewerCrossVendor",
    );
    assert.equal(action(afterCross), "run_selected_e2e");

    ok(cli(["run", "transition", "--run-id", runId, "--phase", "E2E_STABILIZATION"], context), "→ E2E");
    const scenarios = [
      { scenarioId: "E2E-SMOKE-01", status: "passed", evidence: "boot ok" },
      { scenarioId: "E2E-CHECKOUT-01", status: "passed", evidence: "checkout ok" },
    ];
    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "true"], context),
      "the selected set runs in a fresh detached worktree",
    );
    const afterE2e = ok(
      cli(["run", "record-e2e", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          commitOid: candidateCommit,
          snapshotDigest,
          planDigest: plan.planDigest,
          selectedScenarioIds: plan.selectedScenarioIds,
          selectionRationale: plan.selectionRationale,
          scenarios,
          environment: "local",
          completedAt: "2026-07-24T12:30:00Z",
        }),
      }),
      "record e2e",
    );
    assert.equal(action(afterE2e), "finalize_metadata");

    const routed = ok(cli(["run", "route", "--run-id", runId], context), "route");
    assert.equal(routed.json["completionProven"], true);

    ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "FINALIZE_METADATA"], context),
      "→ FINALIZE",
    );

    // COMPLETE is refused until the metadata commit has actually been inspected.
    const withoutMetadata = cli(["run", "transition", "--run-id", runId, "--phase", "COMPLETE"], context);
    assert.equal(withoutMetadata.code, 1);
    assert.equal(errorCode(withoutMetadata), "metadata_not_verified");

    writeLastRun(repo, {
      runId,
      snapshotDigest,
      provenanceCommit: candidateCommit,
      specSha256,
      statuses: scenarios,
    });
    repo.commit("record last_run for the verified scenarios");
    ok(cli(["snapshot", "verify-metadata", "--run-id", runId], context), "verify-metadata");

    const completed = ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "COMPLETE"], context),
      "→ COMPLETE",
    );
    assert.equal(completed.json["phase"], "COMPLETE");

    ok(cli(["run", "cleanup", "--run-id", runId], context), "run cleanup");
    assert.deepEqual(ok(cli(["run", "list"], context), "run list").json["runs"], []);
    assert.equal(ok(cli(["project", "settings"], context), "settings").json["confirmed"], true);
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("an E2E result that skips a selected scenario does not pass", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };

  try {
    const runId = startRun(context);
    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
    retireSpec(repo);
    const candidate = ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");
    const plan = ok(
      cli(["e2e", "seal-plan"], {
        ...context,
        stdin: JSON.stringify({
          schemaVersion: 1,
          commitOid: candidate.json["provenanceCommit"],
          selectedScenarioIds: ["E2E-CHECKOUT-01", "E2E-SMOKE-01"],
          selectionRationale: "both scenarios are in scope",
          impactedBusinessLinks: ["§B-CHECKOUT-01"],
          impactedTags: [],
        }),
      }),
      "seal-plan",
    ).json as unknown as E2ESelectionPlan;
    ok(
      cli(["run", "set-plan", "--run-id", runId], { ...context, stdin: JSON.stringify(plan) }),
      "set-plan",
    );

    const partial = cli(["e2e", "result", "--run-id", runId], {
      ...context,
      stdin: JSON.stringify({
        planDigest: plan.planDigest,
        snapshotDigest: candidate.json["snapshotDigest"],
        scenarios: [{ scenarioId: "E2E-SMOKE-01", status: "passed", evidence: "boot ok" }],
      }),
    });
    assert.equal(partial.code, 1);
    assert.equal(partial.json["pass"], false);
    assert.match(JSON.stringify(partial.json["errors"]), /E2E-CHECKOUT-01 was not executed/);
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a gate result for a superseded snapshot is refused", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };

  try {
    const runId = startRun(context);
    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
    retireSpec(repo);
    const staleDigest = ok(cli(["run", "set-candidate", "--run-id", runId], context), "candidate 1")
      .json["snapshotDigest"] as string;

    repo.write("src/app.py", '"""§M-APP — entry point, revised. Implements §A-APP-01."""\n');
    repo.commit("second candidate");
    const second = ok(cli(["run", "set-candidate", "--run-id", runId], context), "candidate 2");
    assert.notEqual(second.json["snapshotDigest"], staleDigest);

    const stale = cli(
      [
        "run",
        "record-gate",
        "--run-id",
        runId,
        "--gate",
        "qc",
        "--status",
        "passed",
        "--snapshot-digest",
        staleDigest,
      ],
      context,
    );
    assert.equal(stale.code, 1);
    assert.equal(errorCode(stale), "stale_gate_result");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("changing the candidate invalidates attestations of the previous one", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };

  try {
    const runId = startRun(context);
    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
    retireSpec(repo);
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "candidate 1");
    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "qc", "make", "qc"], context),
      "make qc in an isolated worktree",
    );
    ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "qc", "--status", "passed"], context),
      "record qc",
    );

    repo.write("src/app.py", '"""§M-APP — changed again. Implements §A-APP-01."""\n');
    repo.commit("third candidate");
    const updated = ok(cli(["run", "set-candidate", "--run-id", runId], context), "candidate 2");

    const confirmations = updated.json["confirmations"] as Record<string, { status: string }>;
    assert.equal(confirmations["qc"]?.status, "invalidated");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a takeover is refused unless the previous orchestrator is provably terminal", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };

  try {
    const runId = startRun(context);

    // A live orchestrator is refused, and the proof comes from the backend
    // rather than from a flag the caller supplies about itself.
    const fakeState = join(home.dir, "fake-herdr.json");
    const live: CliContext = {
      ...context,
      env: { META_O_HERDR_BIN: FAKE_HERDR, FAKE_HERDR_STATE: fakeState },
    };
    ok(cli(["session", "spawn", "--run-id", runId, "--role", "orchestrator"], live), "spawn");

    const refused = cli(["run", "takeover", "--run-id", runId], live);
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "takeover_unproven");

    ok(cli(["session", "stop", "--run-id", runId, "--role", "orchestrator"], live), "stop");

    const allowed = ok(cli(["run", "takeover", "--run-id", runId], live), "takeover");
    assert.equal(allowed.json["previousStatus"], "absent");
    assert.equal(allowed.json["orchestratorGeneration"], 2);
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a handoff larger than the cap is refused rather than truncated", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };

  try {
    const runId = startRun(context, ["--handoff"]);
    ok(cli(["run", "handoff", "--run-id", runId], { ...context, stdin: "short note" }), "handoff");
    const oversized = cli(["run", "handoff", "--run-id", runId], {
      ...context,
      stdin: "x".repeat(5000),
    });
    assert.equal(oversized.code, 1);
    assert.equal(errorCode(oversized), "handoff_too_large");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("an unknown command and a missing flag both fail with a JSON envelope", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };

  try {
    const unknown = cli(["nonsense", "verb"], context);
    assert.equal(unknown.code, 1);
    assert.equal(errorCode(unknown), "unknown_command");

    const missing = cli(["run", "show"], context);
    assert.equal(missing.code, 1);
    assert.equal(errorCode(missing), "usage");

    const help = cli(["help"], context);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /run route/);
  } finally {
    home.dispose();
    repo.dispose();
  }
});

/** §M-TEST-CLI — A deliberately strict Python QC policy, as adoption would write it. */
const STRICT_PYPROJECT = `[tool.meta_o.code_health]
source_roots = ["src", "tests"]
max_function_lines = 60
forbid_regressions = true

[tool.meta_o.purpose]
exempt_files = []
`;

test("relaxing a threshold, a ratchet or a frozen baseline needs a user decision", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };

  try {
    repo.write("pyproject.toml", STRICT_PYPROJECT);
    repo.write(
      ".quality/code-health-baseline.json",
      `${JSON.stringify({ "src/app.py::complexity::start": 12 }, null, 2)}\n`,
    );
    const base = repo.commit("declare the quality policy");

    const unchanged = cli(["qc", "weakening", "--base-rev", base], context);
    assert.equal(unchanged.code, 0, unchanged.stdout + unchanged.stderr);
    assert.deepEqual(unchanged.json["weakenings"], []);

    // Every one of these leaves `make qc` green while deleting what it enforced.
    repo.write(
      "pyproject.toml",
      STRICT_PYPROJECT.replace("max_function_lines = 60", "max_function_lines = 600")
        .replace("forbid_regressions = true", "forbid_regressions = false")
        .replace('exempt_files = []', 'exempt_files = ["src/legacy/*.py"]'),
    );
    repo.write(
      ".quality/code-health-baseline.json",
      `${JSON.stringify(
        { "src/app.py::complexity::start": 40, "src/app.py::complexity::stop": 11 },
        null,
        2,
      )}\n`,
    );

    const weakened = cli(["qc", "weakening", "--base-rev", base], context);
    assert.equal(weakened.code, 1);
    assert.equal(weakened.json["requiresUserDecision"], true);
    const kinds = (weakened.json["weakenings"] as Array<{ kind: string }>).map((item) => item.kind);
    assert.deepEqual(new Set(kinds), new Set([
      "threshold_raised",
      "ratchet_disabled",
      "exemption_added",
      "baseline_raised",
      "baseline_added",
    ]));
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a backend capability regression stops preflight", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const fakeState = join(home.dir, "fake-herdr.json");
  const context: CliContext = {
    cwd: repo.dir,
    home: home.dir,
    env: { META_O_HERDR_BIN: FAKE_HERDR, FAKE_HERDR_STATE: fakeState },
  };

  try {
    ok(cli(["preflight"], context), "preflight against a healthy backend");

    // The backend was proven able to do this once; the record of that is what
    // makes a later, quieter failure legible as a regression rather than as an
    // unexplained run that died halfway through.
    writeFileSync(
      join(home.dir, "capability-baseline.json"),
      JSON.stringify({
        backend: "herdr",
        mode: "full",
        recordedAt: "2026-01-01T00:00:00.000Z",
        grades: { capabilities: "supported" },
      }),
      { mode: 0o600 },
    );

    const degraded = cli(["preflight"], {
      ...context,
      env: { ...context.env, FAKE_HERDR_FAIL: "agent list" },
    });
    assert.equal(degraded.code, 1);
    const checks = degraded.json["checks"] as Array<{ id: string; status: string }>;
    assert.equal(checks.find((check) => check.id === "backend-smoke")?.status, "invalid");
    assert.equal(checks.find((check) => check.id === "capability-regression")?.status, "invalid");

    // The project itself is fine, and --no-backend says so without pretending
    // the backend is.
    ok(cli(["preflight", "--no-backend"], { ...context, env: {} }), "preflight --no-backend");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a gate that rewrites the content it judges is invalid, not green", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };

  try {
    const honest = ok(
      cli(["worktree", "run", "--label", "qc", "true"], context),
      "a non-mutating gate",
    );
    assert.equal(honest.json["clean"], true);
    assert.notEqual(honest.json["commitOid"], undefined);

    // A formatter that "fixes" the file it was asked to check is the canonical
    // version of this: the exit status says pass, and the thing that passed is
    // no longer the thing anyone attested.
    const mutating = cli(
      ["worktree", "run", "--label", "format", "sh", "-c", "echo mutated >> src/app.py"],
      context,
    );
    assert.equal(mutating.code, 1);
    assert.equal(errorCode(mutating), "gate_mutated_worktree");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a candidate may not touch source outside the adopted closure", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };

  try {
    repo.write(
      ".quality/adoption-manifest.json",
      `${JSON.stringify({ schema_version: 1, adopted_roots: ["src"] }, null, 2)}\n`,
    );
    repo.commit("certify the adopted closure");

    const runId = startRun(context);
    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
    retireSpec(repo);

    // Inside the closure: ordinary work.
    repo.write("src/app.py", '"""§M-APP — entry point, revised. Implements §A-APP-01."""\n');
    repo.commit("change adopted code");
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "candidate inside the closure");

    // Outside it: uncertified code has no purpose, no owner and no baseline, and
    // reaching into it would widen the adoption boundary by nobody's decision.
    repo.write("vendor/legacy.py", "def go():\n    return 1\n");
    repo.commit("reach outside the closure");
    const refused = cli(["run", "set-candidate", "--run-id", runId], context);
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "outside_adopted_closure");
    assert.match(JSON.stringify(refused.json), /vendor\/legacy\.py/);

    // Documentation is never fenced off: a feature that could not update the
    // knowledge layer outside an adopted root could not keep the chain true.
    repo.remove("vendor/legacy.py");
    repo.write("docs/todo.md", "# Debt\n\n| vendor | untouched legacy | adoption feature |\n");
    repo.commit("record the debt instead");
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "docs outside the closure");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

/** §M-TEST-CLI — Write the QC result the way a project's `make qc` would. */
function writeQcResult(home: string, projectKey: string, runId: string, snapshotDigest: string): void {
  const path = join(home, "projects", projectKey, "runs", runId, "qc-result.json");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(
    path,
    JSON.stringify({
      schema_version: 1,
      snapshot_digest: snapshotDigest,
      gates: [
        { id: "lint", status: "passed", command: "ruff check .", tool_version: "ruff 0.6", duration_ms: 10 },
        { id: "tests", status: "passed", command: "pytest", tool_version: "pytest 8", duration_ms: 20 },
      ],
    }),
    { mode: 0o600 },
  );
}
