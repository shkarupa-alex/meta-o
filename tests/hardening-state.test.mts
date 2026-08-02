/**
 * §M-TEST-HARDENING-STATE — Bypasses in what the run stores: snapshots, state tree, secrets.
 *
 * Every test in the four hardening suites corresponds to a way the workflow
 * could be made to say "verified" about something it had not verified: a guard
 * pointed at the wrong commit, a gate set without its evidence, a boundary that
 * covered only thirteen file extensions, a capability comparison whose two
 * sides shared no key. They share a shape — each one passed every other check
 * in the suite while being wrong.
 *
 * This slice covers durable state: what the snapshot digest covers, what the
 * state tree refuses to write, and what never reaches disk unredacted.
 *
 * Verifies §A-SNAPSHOT-ATTESTATION, §A-AUTHORITATIVE-QC and §A-BACKEND-CONTRACT.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { createTempHome, createTempRepo } from "./helpers.mts";
import {
  cli,
  confirmModels,
  passReviews,
  dispatchWorkers,
  errorCode,
  ok,
  retireSpec,
  seededRepo,
  SETTINGS,
  startRun,
  type CliContext,
} from "./cli-harness.mts";
import { acquireSingleInstanceLock, appendLog } from "../dist/cli/commands/watchdog-home.mjs";
import { knowledgeDocuments } from "../dist/core/knowledge-files.mjs";
import type { WatchdogLogEntry } from "../dist/watchdog/watchdog.mjs";

/** §M-TEST-HARDENING-STATE — One well-formed watchdog log line. */
const LOG_ENTRY: WatchdogLogEntry = {
  timestamp: "2026-07-24T12:00:00Z",
  projectKey: "p",
  runId: "r",
  phase: "LOCAL_QC",
  observedStatus: "stopped",
  action: "spawn_orchestrator",
  reason: "the orchestrator is terminal",
  outcome: "performed",
};

test("a superseded orchestrator generation may not write to the run", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    const taken = ok(cli(["run", "takeover", "--run-id", runId], context), "takeover");
    assert.equal(taken.json["orchestratorGeneration"], 2);

    const stale = cli(["run", "transition", "--run-id", runId, "--phase", "PREFLIGHT"], {
      ...context,
      env: { META_O_ORCHESTRATOR_GENERATION: "1" },
    });
    assert.equal(stale.code, 1);
    assert.equal(errorCode(stale), "stale_generation");

    ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "PREFLIGHT"], {
        ...context,
        env: { META_O_ORCHESTRATOR_GENERATION: "2" },
      }),
      "the current generation still writes",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a QC pass is recomputed from the result, not taken on the caller's word", () => {
  // Three of §00's four completion attestations were unforgeable and `qc` was
  // not: `record-gate --gate qc --status passed` was accepted with no `make qc`
  // behind it, no result in the run directory, and `qc evaluate` never called.
  // The command existed and computed a real verdict — nothing wrote its answer
  // into state and nothing read it back.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");

    const bare = cli(
      ["run", "record-gate", "--run-id", runId, "--gate", "qc", "--status", "passed"],
      context,
    );
    assert.equal(bare.code, 1);
    assert.equal(errorCode(bare), "gate_not_isolated");

    // Running it outside a worktree is not enough either: the receipt is what
    // proves the gate judged the candidate rather than the developer's tree.
    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "qc", "make", "qc"], context),
      "make qc in an isolated worktree",
    );
    ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "qc", "--status", "passed"], context),
      "record qc",
    );

    // And a result that does not describe this candidate cannot green it.
    repo.write("src/app.py", '"""§M-APP — changed. Implements §A-APP-01."""\n');
    repo.commit("a new candidate, with the old QC result still on disk");
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate again");
    const stale = cli(
      ["run", "record-gate", "--run-id", runId, "--gate", "qc", "--status", "passed"],
      context,
    );
    assert.equal(stale.code, 1);
    assert.equal(errorCode(stale), "gate_not_isolated", "the receipt names the previous commit");

    // A failure still goes through the plain command: it takes nothing away.
    ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "qc", "--status", "failed"], context),
      "a failing QC gate needs no ceremony",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a gate command may carry its own flags after a bare --", () => {
  // §00 gives every gate a fresh detached worktree, and `worktree run` is the
  // only thing that implements it — but `--` was refused outright and any flag
  // before it was read as meta-o's own. So `pytest -q`, `npm test -- …` and
  // `playwright test --project=ci` could not be run through the sanctioned
  // path at all, and `record-e2e` refuses a result without its receipt.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");

    const ran = ok(
      cli(
        ["worktree", "run", "--run-id", runId, "--label", "e2e", "--", "true", "--maxfail=1"],
        context,
      ),
      "a command with its own flags",
    );
    assert.deepEqual(ran.json["command"], ["true", "--maxfail=1"]);

    // Without the terminator the gate's flag is still meta-o's to reject — but
    // the refusal now says what to do about it.
    const confused = cli(
      ["worktree", "run", "--run-id", runId, "--label", "e2e", "pytest", "--maxfail=1"],
      context,
    );
    assert.equal(errorCode(confused), "unknown_flag");
    assert.match((confused.json["error"] as { message: string }).message, /after a bare `--`/);
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a scenario the E2E gate itself flagged can be fixed and re-run green", () => {
  // The other half of the same rule. What `record-e2e` derives from a scenario
  // status is a projection of the gate, so the next run of the gate re-computes
  // it — treating those like a reviewer's blocker made the ordinary red → fix →
  // green loop impossible, because nobody but the tool ever restates them.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatchWorkers(context, runId);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);

    /** §M-TEST-HARDENING-STATE — Run the whole E2E round once, at whatever HEAD is now. */
    const round = (status: "failed" | "passed"): ReturnType<typeof cli> => {
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
      passReviews(context, runId, { commitOid, snapshotDigest, planDigest: plan.planDigest });
      ok(
        cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "true"], context),
        "isolated run",
      );
      return cli(["run", "record-e2e", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          commitOid,
          snapshotDigest,
          planDigest: plan.planDigest,
          selectedScenarioIds: ["E2E-SMOKE-01"],
          selectionRationale: "the canary always runs",
          scenarios: [{ scenarioId: "E2E-SMOKE-01", status, evidence: `it ${status}` }],
          environment: "local",
          completedAt: "2026-07-24T12:30:00Z",
        }),
      });
    };

    const red = ok(round("failed"), "the first round is red");
    assert.equal((red.json["failures"] as unknown[]).length, 1);

    // A human blocker on the same slot is a different thing, and a reserved id
    // cannot be used to smuggle one into the tool's own records.
    const collision = cli(["run", "open-findings", "--run-id", runId, "--reviewer", "e2e"], {
      ...context,
      stdin: JSON.stringify([
        {
          id: "E2E-E2E-SMOKE-01",
          severity: "blocker",
          classification: "defect",
          evidence: [{ kind: "scenario", reference: "E2E-SMOKE-01", detail: "leaks fixtures" }],
          basis: { type: "spec", reference: "E2E-SMOKE-01" },
          impact: "the canary leaves rows behind",
          recommendedFix: { approach: "namespace them", rationale: "a suite that leaks cannot re-run" },
        },
      ]),
    });
    assert.equal(errorCode(collision), "finding_id_reserved");

    // The executor really fixes it, which moves the candidate.
    repo.write("src/app.py", '"""§M-APP — entry point, fixed."""\n');
    repo.commit("fix the scenario");

    const green = ok(round("passed"), "and the same scenario now passes");
    assert.deepEqual(green.json["failures"], []);
    assert.equal(green.json["status"], "passed");


  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a backend the last full suite found broken may not be driven", () => {
  // §20 blocks a backend whose completion-critical capability is unsupported,
  // and that rule reached preflight and the installer only. The session
  // commands checked the backend's name and nothing else, so a backend that
  // had lost `stop` since the last preflight went on being driven until the
  // run needed the thing it could not do.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    mkdirSync(home.dir, { recursive: true });
    writeFileSync(
      join(home.dir, "capability-baseline.json"),
      JSON.stringify({
        backend: "herdr",
        mode: "full",
        recordedAt: "2026-07-24T09:00:00Z",
        grades: { "reported:statusRead": "supported", "reported:stop": "unsupported" },
      }),
      { mode: 0o600 },
    );

    const blocked = cli(
      ["session", "list", "--run-id", runId],
      context,
    );
    assert.equal(errorCode(blocked), "backend_unavailable");
    assert.match(blocked.stderr, /completion-critical capability stop is unsupported/);
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a derived E2E finding is retired by the gate, not closed by hand", () => {
  // The code said "only the next run of that gate can decide they are gone"
  // and did not enforce it: `propose-fix` plus `resolve-finding` removed the
  // projection of a scenario that was still red, and the router then stopped
  // prescribing `fix_e2e_failures` for it.
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
    passReviews(context, runId, { commitOid, snapshotDigest, planDigest: plan.planDigest });
    ok(cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "true"], context), "isolated");
    ok(
      cli(["run", "record-e2e", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          commitOid,
          snapshotDigest,
          planDigest: plan.planDigest,
          selectedScenarioIds: ["E2E-SMOKE-01"],
          selectionRationale: "the canary always runs",
          scenarios: [{ scenarioId: "E2E-SMOKE-01", status: "failed", evidence: "it failed" }],
          environment: "local",
          completedAt: "2026-07-24T12:30:00Z",
        }),
      }),
      "record a red result",
    );

    const derivedId = "E2E-E2E-SMOKE-01";
    const proposed = cli(
      [
        "run",
        "propose-fix",
        "--run-id",
        runId,
        "--reviewer",
        "e2e",
        "--finding-id",
        derivedId,
        "--candidate-commit",
        commitOid,
      ],
      {
        ...context,
        stdin: JSON.stringify([{ kind: "file", reference: "src/app.py:1", detail: "fixed" }]),
      },
    );
    assert.equal(errorCode(proposed), "derived_finding");

    // And the slot itself must be one the completion check reads.
    const typo = cli(["run", "open-findings", "--run-id", runId, "--reviewer", "e2eTester"], {
      ...context,
      stdin: "[]",
    });
    assert.equal(errorCode(typo), "invalid_reviewer");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a gate whose own receipt records a failure cannot be recorded as passed", () => {
  // The isolation receipt was checked for provenance and content and never for
  // outcome, so `worktree run --label smoke -- false` produced a perfectly
  // valid receipt and `record-gate --status passed` accepted it. The evidence
  // the caller cited said the run failed.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "set-candidate");
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "LOCAL_QC"], context), "→ LOCAL_QC");
    ok(
      cli(["run", "transition", "--run-id", runId, "--phase", "SMOKE_PREFLIGHT"], context),
      "→ SMOKE",
    );

    // `worktree run` reports the failure honestly; it is `record-gate` that
    // must refuse to call it a pass.
    cli(["worktree", "run", "--run-id", runId, "--label", "smoke", "false"], context);
    const claimed = cli(
      ["run", "record-gate", "--run-id", runId, "--gate", "smoke", "--status", "passed"],
      context,
    );
    assert.equal(errorCode(claimed), "gate_did_not_pass");

    // Recording the failure is the plain path, and it stays open.
    ok(
      cli(["run", "record-gate", "--run-id", runId, "--gate", "smoke", "--status", "failed"], context),
      "record the failure",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a green E2E run leaves a blocker raised against the E2E work standing", () => {
  // The reviewer slots carry their open blockers forward; the `e2e` slot was
  // written wholesale, so a run that passed every scenario silently dropped a
  // blocker somebody had raised against the suite itself — a scenario that
  // passes only by luck, an environment that leaks — and the run proved
  // complete.
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

    ok(
      cli(["run", "open-findings", "--run-id", runId, "--reviewer", "e2e"], {
        ...context,
        stdin: JSON.stringify([
          {
            id: "LEAK-01",
            severity: "blocker",
            classification: "defect",
            evidence: [
              { kind: "scenario", reference: "E2E-SMOKE-01", detail: "leaves fixtures behind" },
            ],
            basis: { type: "spec", reference: "E2E-SMOKE-01" },
            impact: "the canary passes but leaves rows in the shared database",
            recommendedFix: {
              approach: "namespace the fixtures and tear them down",
              rationale: "a suite that leaks cannot be re-run",
            },
          },
        ]),
      }),
      "open a blocker on the e2e slot",
    );

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
    passReviews(context, runId, { commitOid, snapshotDigest, planDigest: plan.planDigest });
    ok(
      cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "true"], context),
      "the suite runs isolated",
    );

    const green = ok(cli(["run", "record-e2e", "--run-id", runId], {
      ...context,
      stdin: JSON.stringify({
        commitOid,
        snapshotDigest,
        planDigest: plan.planDigest,
        selectedScenarioIds: plan.selectedScenarioIds,
        selectionRationale: "the canary always runs",
        scenarios: [{ scenarioId: "E2E-SMOKE-01", status: "passed", evidence: "green" }],
        environment: "local",
        completedAt: "2026-07-24T12:30:00Z",
      }),
    }), "the tester may still record the result");

    // The gate passed and the blocker is untouched — and still blocks.
    assert.equal(green.json["status"], "passed");
    const shown = ok(cli(["run", "show", "--run-id", runId], context), "run show");
    const open = (shown.json["openFindings"] as Record<string, { finding: { id: string } }[]>)["e2e"];
    assert.deepEqual(open?.map((record) => record.finding.id), ["LEAK-01"]);
    const routed = ok(cli(["run", "route", "--run-id", runId], context), "route");
    assert.equal(routed.json["completionProven"], false, "an open blocker still blocks");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("the optional handoff is read back, and only by the role it belongs to", () => {
  // §20 gives the run an `optional-handoff.md` and a 4 KiB cap on it, and the
  // implementation wrote one that nothing ever read: a note whose only reader
  // was the filesystem. §30's boundary decides who may read it — it is executor
  // narrative, which is the first thing a reviewer must not be handed.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context, ["--handoff"]);
    const note = "left the retry budget at three; see the comment in checkout.ts";
    ok(cli(["run", "handoff", "--run-id", runId], { ...context, stdin: note }), "write the handoff");

    assert.equal(
      ok(cli(["run", "show", "--run-id", runId], context), "orchestrator view").json["handoff"],
      note,
      "the orchestrator sees the note it is responsible for passing on",
    );
    assert.equal(
      ok(
        cli(["run", "show", "--run-id", runId, "--as-role", "executor"], context),
        "executor view",
      ).json["handoff"],
      note,
      "the successor executor is the reader the handoff exists for",
    );
    for (const role of ["reviewerPrimary", "reviewerCrossVendor", "e2eTester"]) {
      assert.equal(
        ok(cli(["run", "show", "--run-id", runId, "--as-role", role], context), role).json[
          "handoff"
        ],
        undefined,
        `${role} must not be handed executor narrative`,
      );
    }
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("the knowledge gate fails when it discovers nothing to judge", () => {
  // §40 makes an unexpected skip a FAIL, and this gate had the largest possible
  // one: pointed at `--roots` naming a directory that does not exist it reported
  // `ok: true` over zero anchors. The Python profile fails closed here.
  const repo = seededRepo();
  try {
    ok(cli(["knowledge", "validate"], { cwd: repo.dir, home: repo.dir }), "the seeded tree is valid");

    const blind = cli(["knowledge", "validate", "--roots", "nosuchdir"], {
      cwd: repo.dir,
      home: repo.dir,
    });
    assert.equal(blind.code, 1);
    assert.match(blind.stdout, /a gate that judged nothing is a skip, not a pass/);
  } finally {
    repo.dispose();
  }
});

test("the ModelSet leaves AWAITING_MODEL_SET only on a decision the user took", () => {
  // §00 step 4 makes the orchestrator show the stored ModelSet and ask "these?".
  // `run confirm-models` took no evidence at all, so nothing distinguished a
  // user who answered from an orchestrator that skipped the question — in the
  // phase that exists for precisely that question, immediately before four
  // external models start costing money.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);

    const unasked = cli(["run", "confirm-models", "--run-id", runId, "--decision-id", "D-NONE"], context);
    assert.equal(errorCode(unasked), "unknown_decision");
    assert.match(unasked.stderr, /record-decision/);

    ok(
      cli(["run", "record-decision", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          id: "D-SELF",
          question: "run with the stored ModelSet?",
          answer: "yes",
          rationale: "it is what settings.json already says",
          category: "tooling",
          decidedBy: "orchestrator",
        }),
      }),
      "an orchestrator may record its own reasoning",
    );
    const selfApproved = cli(
      ["run", "confirm-models", "--run-id", runId, "--decision-id", "D-SELF"],
      context,
    );
    assert.equal(errorCode(selfApproved), "not_a_user_decision");

    // Still in the phase it started in: a refused confirmation is not a
    // half-confirmation.
    assert.equal(
      ok(cli(["run", "show", "--run-id", runId], context), "run show").json["phase"],
      "AWAITING_MODEL_SET",
    );

    confirmModels(context, runId);
    const confirmed = ok(cli(["run", "show", "--run-id", runId], context), "run show").json;
    assert.equal(confirmed["phase"], "PREFLIGHT");
    assert.equal(confirmed["modelSetConfirmedBy"], "D-MODELS");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("the watchdog's own log and lock get the checks every other state path gets", () => {
  // These three files — log, single-instance lock, per-run memory — live beside
  // run state, are written by a long-lived background process, and were the one
  // group that bypassed the safe filesystem layer: `mkdirSync(..., {recursive:
  // true})` accepts a symlinked parent, and `O_NOFOLLOW` on the final component
  // says nothing about the directories above it.
  const home = createTempHome();
  const previous = process.env["META_O_HOME"];
  try {
    // A home directory anyone on the host can write to is exactly the condition
    // the descriptor-relative requirement exists for, and the one the `0700`
    // rule is supposed to exclude. Saying so is the point: the watchdog used to
    // create it at whatever mode it found and write anyway.
    const loose = join(home.dir, "loose");
    mkdirSync(loose, { recursive: true, mode: 0o777 });
    chmodSync(loose, 0o777);
    process.env["META_O_HOME"] = loose;

    assert.throws(
      () => appendLog({ ...LOG_ENTRY }),
      /group\/world accessible/,
      "a world-writable state home is refused, not repaired and used",
    );
    assert.throws(() => acquireSingleInstanceLock(), /group\/world accessible/);

    // And a home replaced by a symlink is refused rather than followed, which
    // is what redirects every line a watchdog writes for as long as it runs.
    const real = join(home.dir, "elsewhere");
    mkdirSync(real, { recursive: true, mode: 0o700 });
    const planted = join(home.dir, "planted");
    symlinkSync(real, planted);
    process.env["META_O_HOME"] = planted;

    assert.throws(() => appendLog({ ...LOG_ENTRY }), /refusing to follow symlink/);
    assert.throws(() => acquireSingleInstanceLock(), /refusing to follow symlink/);

    // A home that passes both checks still works, or the guard above would be
    // indistinguishable from a watchdog that can never log at all.
    const sound = join(home.dir, "sound");
    mkdirSync(sound, { recursive: true, mode: 0o700 });
    process.env["META_O_HOME"] = sound;
    appendLog({ ...LOG_ENTRY });
    const lock = acquireSingleInstanceLock();
    assert.ok(lock, "the lock is takeable in a sound state tree");
    lock.release();
    assert.match(readFileSync(join(sound, "watchdog.log"), "utf8"), /spawn_orchestrator/);
  } finally {
    if (previous === undefined) delete process.env["META_O_HOME"];
    else process.env["META_O_HOME"] = previous;
    home.dispose();
  }
});

test("a generation claim that cannot be read is refused, not ignored", () => {
  // Unset is "I make no claim" and is allowed. Set-but-unreadable is a claim
  // that cannot be checked, and it was treated as the first: `parseInt` turned
  // `generation-` — what an empty shell variable produces — into NaN and
  // disabled the fence for that command, silently, and precisely for the
  // superseded orchestrator whose environment is most likely to be wrong.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    ok(cli(["run", "takeover", "--run-id", runId], context), "takeover");

    for (const declared of ["", "generation-", "2x", "-1", "two"]) {
      const attempt = cli(["run", "transition", "--run-id", runId, "--phase", "PREFLIGHT"], {
        ...context,
        env: { META_O_ORCHESTRATOR_GENERATION: declared },
      });
      if (declared === "") {
        // An empty variable is indistinguishable from an unset one by the time
        // a child process reads it, so it has to keep meaning "no claim".
        assert.equal(attempt.code, 0, "an empty claim is no claim");
        continue;
      }
      assert.equal(errorCode(attempt), "invalid_generation", `${declared} must be refused`);
    }
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a tracked spec that is a symlink out of the repository is refused", () => {
  // The locator check was lexical, so `spec/current.md → /etc/passwd` passed:
  // the string never leaves the repository even though the read does.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const outside = join(home.dir, "elsewhere.md");
    writeFileSync(outside, "# Not this repository's spec\n");
    symlinkSync(outside, join(repo.dir, "spec/escape.md"));
    repo.git(["add", "-A"]);
    repo.commit("track a spec that is a symlink");

    ok(cli(["project", "init"], context), "project init");
    ok(cli(["project", "set-settings"], { ...context, stdin: SETTINGS }), "set-settings");
    const refused = cli(
      ["run", "start", "--spec-kind", "tracked", "--spec-locator", "spec/escape.md"],
      context,
    );
    assert.equal(refused.code, 1);
    assert.match(
      `${refused.stderr}${refused.stdout}`,
      /resolves outside the repository/,
      "the read is what escapes, and the message says so",
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("preflight and the knowledge gate read the same tree", () => {
  // The gate walked `docs/knowledge` recursively; preflight read `business.md`
  // and one flat listing of `architecture/`. Nothing preflight consumes today
  // makes that visible — it uses the index only for business links, and those
  // are defined in one document by design — so this is the kind of divergence
  // that is free until the day someone adds a check. Both now call one reader,
  // and the test is on that reader: two definitions of "the knowledge layer"
  // is the defect, whether or not it has surfaced yet.
  const repo = seededRepo();
  try {
    repo.write(
      "docs/knowledge/architecture/payments/ledger.md",
      "# Ledger\n\n## §A-LEDGER-01 — Double entry\n\nImplements §B-CHECKOUT-01.\n",
    );
    repo.write("docs/knowledge/archive/retired-feature.md", "# A retired spec\n");
    repo.commit("group the architecture documents into subdirectories");

    const read = knowledgeDocuments(repo.dir).map((file) => file.path);
    assert.deepEqual(read, [
      "docs/knowledge/business.md",
      "docs/knowledge/glossary.md",
      "docs/knowledge/architecture/app.md",
      "docs/knowledge/architecture/payments/ledger.md",
      "docs/knowledge/archive/retired-feature.md",
    ]);

    // The two documents a reader is directed to by name come first, so the
    // gate's `documents` list stays diffable between runs.
    assert.deepEqual(read.slice(0, 2), [
      "docs/knowledge/business.md",
      "docs/knowledge/glossary.md",
    ]);
  } finally {
    repo.dispose();
  }
});

test("a repository with no knowledge layer yet reads as empty, not as a crash", () => {
  const repo = createTempRepo();
  try {
    repo.write("README.md", "# Nothing here yet\n");
    repo.commit("an unadopted repository");
    assert.deepEqual(knowledgeDocuments(repo.dir), []);
  } finally {
    repo.dispose();
  }
});
