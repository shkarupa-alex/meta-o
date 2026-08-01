/**
 * §M-TEST-CLI — End-to-end acceptance test of a whole run driven through the CLI.
 *
 * Covers the §00 completion criterion in the only way that really proves it: by
 * walking a real repository from `run start` to `COMPLETE` through the same
 * commands a skill would issue, and by showing that the shortcuts a confused
 * orchestrator might take — completing without four attestations, recording a
 * gate for a superseded snapshot, taking over a live run — are refused.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempHome, createTempRepo, seedProjectContract, type TempRepo } from "./helpers.mts";
import type { E2ESelectionPlan } from "../dist/core/types.mjs";

/** §M-TEST-CLI — Path to the compiled CLI under test. */
const CLI = fileURLToPath(new URL("../dist/cli/meta-o.mjs", import.meta.url));

/** §M-TEST-CLI — Outcome of one CLI invocation. */
interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  json: Record<string, unknown>;
}

/** §M-TEST-CLI — Where a command runs and which state tree it uses. */
interface CliContext {
  cwd: string;
  home: string;
  stdin?: string;
}

/**
 * §M-TEST-CLI — Invoke the CLI the way a skill would.
 *
 * Runs the compiled artefact instead of importing the modules, so the test also
 * covers argument parsing, the JSON envelope and the exit status — the parts a
 * prompt actually depends on and the parts unit tests never reach.
 */
function cli(args: string[], options: CliContext): CliResult {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      cwd: options.cwd,
      encoding: "utf8",
      input: options.stdin ?? "",
      env: { ...process.env, META_O_HOME: options.home },
    });
    return { code: 0, stdout, stderr: "", json: parseJson(stdout) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    const stdout = failure.stdout ?? "";
    const stderr = failure.stderr ?? "";
    return {
      code: failure.status ?? 1,
      stdout,
      stderr,
      json: { ...parseJson(stderr), ...parseJson(stdout) },
    };
  }
}

/** §M-TEST-CLI — Parse CLI output, tolerating non-JSON and empty responses. */
function parseJson(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** §M-TEST-CLI — Assert a command succeeded, showing its own error if it did not. */
function ok(result: CliResult, what: string): CliResult {
  assert.equal(result.code, 0, `${what} failed: ${result.stderr || result.stdout}`);
  return result;
}

/** §M-TEST-CLI — The routing action a command reported. */
function action(result: CliResult): string {
  return (result.json["routing"] as { action: string } | undefined)?.action ?? "(none)";
}

/** §M-TEST-CLI — The error code carried by a failure envelope. */
function errorCode(result: CliResult): string {
  return (result.json["error"] as { code: string } | undefined)?.code ?? "(none)";
}

/** §M-TEST-CLI — A confirmed ModelSet satisfying the cross-vendor invariant. */
const SETTINGS = JSON.stringify({
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
});

/** §M-TEST-CLI — A repository with a valid contract and a tracked feature spec. */
function seededRepo(): TempRepo {
  const repo = createTempRepo();
  seedProjectContract(repo);
  repo.write("spec/feature.md", "# Feature\n\nAdd a checkout confirmation step.\n");
  repo.write("src/app.py", '"""§M-APP — entry point."""\n');
  repo.commit("seed project");
  return repo;
}

/** §M-TEST-CLI — Bring a project to the point where a run exists. */
function startRun(context: CliContext): string {
  ok(cli(["project", "init"], context), "project init");
  ok(cli(["project", "set-settings"], { ...context, stdin: SETTINGS }), "project set-settings");
  const started = ok(
    cli(["run", "start", "--spec-kind", "tracked", "--spec-locator", "spec/feature.md"], context),
    "run start",
  );
  return started.json["runId"] as string;
}

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
    assert.match(shown.json["specBlob"] as string, /\/input\/spec-[0-9a-f]{64}\.md$/);
    assert.equal(
      action(ok(cli(["run", "route", "--run-id", runId], context), "route")),
      "await_model_set",
      "a fresh run waits for the user to confirm the ModelSet",
    );

    ok(cli(["preflight"], context), "preflight");
    ok(cli(["e2e", "validate"], context), "e2e validate");
    ok(cli(["knowledge", "validate"], context), "knowledge validate");

    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");

    const candidate = ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");
    const snapshotDigest = candidate.json["snapshotDigest"] as string;
    const commitOid = candidate.json["provenanceCommit"] as string;
    assert.equal(action(candidate), "await_selection_plan");

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
    writeQcResult(home.dir, projectKey, runId, snapshotDigest);
    const qc = ok(cli(["qc", "evaluate", "--run-id", runId], context), "qc evaluate");
    assert.equal(qc.json["pass"], true);
    ok(cli(["qc", "weakening", "--run-id", runId], context), "qc weakening");

    const afterQc = ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "qc", "--status", "passed"], context),
      "record qc",
    );
    assert.equal(action(afterQc), "run_reviews");

    ok(cli(["run", "transition", "--run-id", runId, "--phase", "SMOKE_PREFLIGHT"], context), "→ SMOKE");
    ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "REVIEW_STABILIZATION"], context),
      "→ REVIEW",
    );

    const afterPrimary = ok(
      cli(
        ["run", "record-gate", "--run-id", runId, "--gate", "reviewerPrimary", "--status", "passed"],
        context,
      ),
      "record reviewerPrimary",
    );
    assert.equal(action(afterPrimary), "run_reviews", "one review is not two");

    const afterCross = ok(
      cli(
        [
          "run",
          "record-gate",
          "--run-id",
          runId,
          "--gate",
          "reviewerCrossVendor",
          "--status",
          "passed",
        ],
        context,
      ),
      "record reviewerCrossVendor",
    );
    assert.equal(action(afterCross), "run_selected_e2e");

    ok(cli(["run", "transition", "--run-id", runId, "--phase", "E2E_STABILIZATION"], context), "→ E2E");
    const e2e = ok(
      cli(["e2e", "result", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          planDigest: plan.planDigest,
          snapshotDigest,
          scenarios: [
            { scenarioId: "E2E-SMOKE-01", status: "passed", evidence: "boot ok" },
            { scenarioId: "E2E-CHECKOUT-01", status: "passed", evidence: "checkout ok" },
          ],
        }),
      }),
      "e2e result",
    );
    assert.equal(e2e.json["pass"], true);

    const afterE2e = ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "e2e", "--status", "passed"], context),
      "record e2e",
    );
    assert.equal(action(afterE2e), "finalize_metadata");

    const routed = ok(cli(["run", "route", "--run-id", runId], context), "route");
    assert.equal(routed.json["completionProven"], true);

    ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "FINALIZE_METADATA"], context),
      "→ FINALIZE",
    );
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
    const staleDigest = ok(cli(["run", "set-candidate", "--run-id", runId], context), "candidate 1")
      .json["snapshotDigest"] as string;

    repo.write("src/app.py", '"""§M-APP — entry point, revised."""\n');
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
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "candidate 1");
    ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "qc", "--status", "passed"], context),
      "record qc",
    );

    repo.write("src/app.py", '"""§M-APP — changed again."""\n');
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

    const refused = cli(
      ["run", "takeover", "--run-id", runId, "--previous-status", "running"],
      context,
    );
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "takeover_unproven");

    const allowed = ok(
      cli(["run", "takeover", "--run-id", runId, "--previous-status", "failed"], context),
      "takeover",
    );
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
    const runId = startRun(context);
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
