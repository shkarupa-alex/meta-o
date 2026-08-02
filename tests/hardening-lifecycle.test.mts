/**
 * §M-TEST-HARDENING-LIFECYCLE — Bypasses along the run's life: phases, reviews, production.
 *
 * Every test in the four hardening suites corresponds to a way the workflow
 * could be made to say "verified" about something it had not verified: a guard
 * pointed at the wrong commit, a gate set without its evidence, a boundary that
 * covered only thirteen file extensions, a capability comparison whose two
 * sides shared no key. They share a shape — each one passed every other check
 * in the suite while being wrong.
 *
 * This slice covers the run as it advances: phase transitions, reviewer
 * verdicts, the production E2E contract, and the settings the watchdog reads.
 *
 * Verifies §A-SNAPSHOT-ATTESTATION, §A-AUTHORITATIVE-QC and §A-BACKEND-CONTRACT.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  readFileSync,
} from "node:fs";
import { join } from "node:path";

import { createTempHome } from "./helpers.mts";
import {
  cli,
  confirmModels,
  FAKE_HERDR,
  passLocalGates,
  passReviews,
  dispatchWorkers,
  errorCode,
  ok,
  retireSpec,
  seededRepo,
  startRun,
  type CliContext,
} from "./cli-harness.mts";
import { blocker } from "./hardening-fixtures.mts";

test("a spec that was renamed rather than retired still blocks the candidate", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");

    repo.git(["mv", "spec/feature.md", "docs/archived-feature.md"]);
    repo.commit("park the spec instead of retiring it");

    const refused = cli(["run", "set-candidate", "--run-id", runId], context);
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "spec_not_retired");
    assert.match(
      (refused.json["error"] as { message: string }).message,
      /docs\/archived-feature\.md/,
    );
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a secret in a finding never reaches durable state", () => {
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatchWorkers(context, runId);
    ok(
      cli(["run", "open-findings", "--run-id", runId, "--reviewer", "reviewerPrimary"], {
        ...context,
        stdin: JSON.stringify([
          {
            id: "f1",
            severity: "major",
            classification: "defect",
            evidence: [
              {
                kind: "file",
                reference: "src/client.py:12",
                detail: "client = Client(api_key='sk-abcdefghijklmnopqrstuvwxyz012345')",
              },
              {
                // The other half of the rule, and the half that used to be a
                // claim rather than a behaviour: a secret recognised by the
                // name it is bound to rather than by looking like a token.
                // Most real credentials — a database password, an internal
                // service key — match no vendor's pattern at all.
                kind: "command",
                reference: "deploy/run.sh:4",
                detail: "DB_PASSWORD=correct-horse-battery && ./deploy",
              },
            ],
            basis: { type: "engineering", reference: "no credential may be literal" },
            impact: "the key is committed and must be rotated",
            recommendedFix: {
              approach: "read the key from the environment",
              rationale: "keeps the secret out of the tree and out of this state file",
            },
          },
        ]),
      }),
      "open-findings",
    );

    const shown = ok(cli(["run", "show", "--run-id", runId], context), "run show");
    const serialized = JSON.stringify(shown.json);
    assert.ok(!serialized.includes("sk-abcdefghijklmnopqrstuvwxyz012345"), "the token is gone");
    assert.ok(
      !serialized.includes("correct-horse-battery"),
      "and so is the one that looks like nothing in particular",
    );
    assert.ok(serialized.includes("[redacted]"), "and its absence is visible");

    // Not everything that sits next to an `=` — a redactor that masked
    // `--maxfail=1` would make findings unreadable and get itself turned off.
    assert.ok(serialized.includes("src/client.py:12"), "the reference survives");
    assert.ok(serialized.includes("deploy/run.sh:4"), "and so does the other");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("an open blocker cannot be erased by rewriting the findings slot", () => {
  // The slot was written wholesale, so an empty payload deleted every record —
  // and with four gates already attested on an unchanged snapshot, the run then
  // completed. A blocker leaves only through a transition that names authority.
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

    const erased = cli(["run", "open-findings", "--run-id", runId, "--reviewer", "reviewerPrimary"], {
      ...context,
      stdin: "[]",
    });
    assert.equal(erased.code, 1);
    assert.equal(errorCode(erased), "findings_dropped");

    const shown = ok(cli(["run", "show", "--run-id", runId], context), "run show");
    const open = (shown.json["openFindings"] as Record<string, unknown[]>)["reviewerPrimary"];
    assert.equal(open?.length, 1, "the blocker is still there");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a run that tagged or pushed its own work cannot set a candidate", () => {
  // §00 forbids push, remote branch, PR and tag without the user asking, and
  // the rule lived only in the skills: a run could push its candidate, tag it
  // v1.0.0, and reach COMPLETE with four green gates and no remark anywhere.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);
    repo.git(["tag", "v1.0.0"]);

    const refused = cli(["run", "set-candidate", "--run-id", runId], context);
    assert.equal(refused.code, 1);
    assert.equal(errorCode(refused), "published_without_request");
    assert.match((refused.json["error"] as { message: string }).message, /refs\/tags\/v1\.0\.0/);

    // A tag on a commit the run did not author is somebody else's business.
    repo.git(["tag", "-d", "v1.0.0"]);
    repo.git(["tag", "v0.9.0", "HEAD~1"]);
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "an older tag is untouched");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("a second review may not erase the blocker the first one raised", () => {
  // Every designed exit refuses this: `open-findings` with an empty array is
  // `findings_dropped`, `resolve-finding` without a dispatched reviewer is
  // `no_such_session`, `record-gate --status passed` is `evidence_required`.
  // `record-review` wrote the slot wholesale, so one command did what all three
  // refuse — and the executor has the CLI on its PATH.
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
    ).json as unknown as { planDigest: string };
    ok(
      cli(["run", "set-plan", "--run-id", runId], { ...context, stdin: JSON.stringify(plan) }),
      "set-plan",
    );
    passLocalGates(context, runId);

    /** §M-TEST-HARDENING-LIFECYCLE — One reviewer payload, varying only in verdict and findings. */
    const review = (verdict: string, findings: unknown[]): string =>
      JSON.stringify({
        reviewer: "reviewerCrossVendor",
        commitOid,
        snapshotDigest,
        planDigest: plan.planDigest,
        selectionPlanVerdict: "complete",
        verdict,
        findings,
        completedAt: "2026-07-24T12:00:00Z",
      });

    ok(
      cli(["run", "record-review", "--run-id", runId], {
        ...context,
        stdin: review("changes_requested", [
          {
            id: "F-1",
            severity: "blocker",
            classification: "defect",
            evidence: [{ kind: "file", reference: "src/app.py:1", detail: "no error path" }],
            basis: { type: "spec", reference: "spec/feature.md" },
            impact: "the checkout confirmation silently drops failures",
            recommendedFix: { approach: "surface the failure", rationale: "the user must see it" },
          },
        ]),
      }),
      "the blocker is raised",
    );

    const erased = cli(["run", "record-review", "--run-id", runId], {
      ...context,
      stdin: review("passed", []),
    });
    assert.equal(erased.code, 1);
    assert.equal(errorCode(erased), "findings_dropped");

    // Restating it by id is a real re-review, and is allowed.
    const restated = ok(
      cli(["run", "record-review", "--run-id", runId], {
        ...context,
        stdin: review("changes_requested", [
          {
            id: "F-1",
            severity: "major",
            classification: "defect",
            evidence: [{ kind: "file", reference: "src/app.py:1", detail: "still no error path" }],
            basis: { type: "spec", reference: "spec/feature.md" },
            impact: "narrower than first judged, but still real",
            recommendedFix: { approach: "surface the failure", rationale: "the user must see it" },
          },
        ]),
      }),
      "a re-review that restates the finding",
    );
    assert.equal(restated.json["blocking"], 1);
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("an orchestrator can register itself the way the skill tells it to", () => {
  // The skill's literal instruction — `run set-session --role orchestrator
  // --session-id <handle>` — returned `unknown_flag`, and the working form
  // (a whole SessionRef on stdin) was documented nowhere. An orchestrator
  // following the skill never registered, so the watchdog observed
  // `unregistered` for the life of the run and recovered nothing.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    const registered = ok(
      cli(
        ["run", "set-session", "--run-id", runId, "--role", "orchestrator", "--session-id", "mo-1"],
        context,
      ),
      "the documented form",
    );
    assert.equal(
      (registered.json["orchestratorSession"] as { sessionId: string }).sessionId,
      "mo-1",
    );

    const worker = ok(
      cli(
        ["run", "set-session", "--run-id", runId, "--role", "executor", "--session-id", "mo-2"],
        context,
      ),
      "a worker too",
    );
    const sessions = worker.json["sessions"] as Record<string, { sessionId: string } | undefined>;
    assert.equal(sessions["executor"]?.sessionId, "mo-2");

    const bogus = cli(
      ["run", "set-session", "--run-id", runId, "--role", "auditor", "--session-id", "mo-3"],
      context,
    );
    assert.equal(errorCode(bogus), "unknown_role");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("the production contract must be committed, and must be about production", () => {
  // Two ways the same guard was satisfied by nothing. It read the *working
  // tree*, so the contract could be appended, the gate passed and the file
  // reverted a second later; and it matched `production` as a bare substring,
  // so `### Reproduction of a failed scenario` — which says nothing about
  // production — was accepted as the contract.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatchWorkers(context, runId);
    confirmModels(context, runId);
    ok(cli(["run", "transition", "--run-id", runId, "--phase", "EXECUTING"], context), "→ EXECUTING");
    retireSpec(repo);

    /** §M-TEST-HARDENING-LIFECYCLE — Drive one production E2E attempt to the contract check. */
    const attempt = (): ReturnType<typeof cli> => {
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
      passReviews(context, runId, { commitOid, snapshotDigest, planDigest: plan.planDigest });
      ok(
        cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "true"], context),
        "the suite runs isolated",
      );
      return cli(["run", "record-e2e", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          commitOid,
          snapshotDigest,
          planDigest: plan.planDigest,
          selectedScenarioIds: plan.selectedScenarioIds,
          selectionRationale: "the canary always runs",
          scenarios: [{ scenarioId: "E2E-SMOKE-01", status: "passed", evidence: "green" }],
          environment: "production",
          completedAt: "2026-07-24T12:30:00Z",
        }),
      });
    };

    ok(
      cli(["run", "record-decision", "--run-id", runId], {
        ...context,
        stdin: JSON.stringify({
          id: "D-1",
          category: "irreversible",
          question: "may the selected set run against production?",
          answer: "yes, once",
          decidedBy: "user",
          rationale: "there is nowhere else to exercise it",
          decidedAt: "2026-07-24T12:00:00Z",
        }),
      }),
      "record-decision",
    );
    ok(
      cli(["run", "approve-production-e2e", "--run-id", runId, "--decision-id", "D-1"], context),
      "approve-production-e2e",
    );

    // Written, never committed: the candidate does not carry it.
    repo.write(
      "docs/architecture/e2e.md",
      "# E2E\n\n## e2e-smoke-01\n\n## e2e-checkout-01\n\n## Production safety\n\nNamespaced.\n",
    );
    assert.equal(errorCode(attempt()), "no_production_contract");

    // Committed, but the heading only contains the letters.
    repo.write(
      "docs/architecture/e2e.md",
      "# E2E\n\n## e2e-smoke-01\n\n## e2e-checkout-01\n\n" +
        "### Reproduction of a failed scenario\n\nRe-run it locally.\n",
    );
    repo.commit("a heading that merely contains the letters");
    assert.equal(errorCode(attempt()), "no_production_contract");

    // Committed, but the heading is an example inside a fenced block. An
    // example of a contract is not a contract.
    repo.write(
      "docs/architecture/e2e.md",
      "# E2E\n\n## e2e-smoke-01\n\n## e2e-checkout-01\n\n" +
        "Write a section like this one:\n\n```markdown\n## Production safety\n" +
        "what a production run may touch\n```\n",
    );
    repo.commit("show what the contract would look like, without writing one");
    assert.equal(errorCode(attempt()), "no_production_contract");

    // A setext heading is a heading, and refusing it told a project with a
    // perfectly good contract that it had none.
    repo.write(
      "docs/architecture/e2e.md",
      "# E2E\n\n## e2e-smoke-01\n\n## e2e-checkout-01\n\n" +
        "Running against production\n==========================\n\n" +
        "Namespaced per run; every fixture is torn down even on failure.\n",
    );
    repo.commit("write the contract with a setext heading");
    ok(attempt(), "a setext contract counts");

    // Committed, and about production.
    repo.write(
      "docs/architecture/e2e.md",
      "# E2E\n\n## e2e-smoke-01\n\n## e2e-checkout-01\n\n## Running against production\n\n" +
        "Namespaced per run; every fixture is torn down even on failure.\n",
    );
    repo.commit("write down what a production run may do");
    ok(attempt(), "record-e2e");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("`watchdog enable` reaches the switch the watchdog loop actually reads", () => {
  // There were two opt-in switches and the loop read the other one.
  // `project set-settings` — the step the orchestrator skill makes mandatory,
  // and the only way to store a ModelSet — wrote `watchdogEnabled: false`
  // whenever its payload omitted a key no document mentions. Every real
  // project therefore had the watchdog off, and `watchdog enable` printed a
  // success payload naming the project while changing nothing.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    /** §M-TEST-HARDENING-LIFECYCLE — What the project's own settings say about the watchdog. */
    const setting = (): unknown =>
      (ok(cli(["project", "settings"], context), "project settings").json["settings"] as
        | Record<string, unknown>
        | undefined)?.["watchdogEnabled"];

    // `startRun` performs the mandatory `project set-settings`; the watchdog
    // decision must come out absent, not a default nobody asked for.
    startRun(context);
    assert.equal(setting(), undefined, "storing a ModelSet decides nothing about the watchdog");

    const enabled = ok(cli(["watchdog", "enable"], context), "watchdog enable");
    assert.equal(enabled.json["projectSettingUpdated"], true);
    assert.equal(setting(), true);

    // And the mandatory step must not silently reverse it.
    ok(
      cli(["project", "set-settings"], {
        ...context,
        stdin: JSON.stringify({
          schemaVersion: 1,
          backend: "herdr",
          modelSet: (ok(cli(["project", "settings"], context), "settings").json["settings"] as {
            modelSet: unknown;
          }).modelSet,
        }),
      }),
      "re-store the ModelSet",
    );
    assert.equal(setting(), true, "the watchdog decision survives an unrelated settings write");

    ok(cli(["watchdog", "disable"], context), "watchdog disable");
    assert.equal(setting(), false);
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("planned intent may not be written as durable knowledge", () => {
  // §10: "До реализации нельзя писать durable §B-TODO/§A-TODO." The rule was
  // stated in the executor's skill and nowhere else, so a knowledge layer
  // describing what somebody means to build passed the gate whose whole job is
  // to say what is true. Debt goes in `docs/todo.md`, which §00 already requires.
  const repo = seededRepo();
  try {
    const business = readFileSync(join(repo.dir, "docs/knowledge/business.md"), "utf8");
    repo.write(
      "docs/knowledge/business.md",
      `${business}\n## §B-TODO-LOYALTY — Loyalty points, once somebody builds them\n\nNot built.\n`,
    );
    const planned = cli(["knowledge", "validate"], { cwd: repo.dir, home: repo.dir });
    assert.equal(planned.code, 1);
    assert.match(planned.stdout, /§B-TODO-LOYALTY is planned intent, not current truth/);

    // A real anchor whose name merely begins with the same letters is fine.
    repo.write(
      "docs/knowledge/business.md",
      `${business}\n## §B-TODOS-01 — The to-do list is the product\n\nIt exists.\n`,
    );
    ok(
      cli(["knowledge", "validate"], { cwd: repo.dir, home: repo.dir }),
      "the forbidden prefix is matched as a prefix, not as a substring",
    );
  } finally {
    repo.dispose();
  }
});

test("a backend nothing implements is refused at start, not printed and dropped", () => {
  // `run start` resolved the backend from flag, settings and machine defaults,
  // emitted it, and never stored or checked it. `--backend omnigent` answered
  // `"backend": "omnigent"` and then ran every session on herdr — the exact
  // outcome the shared check exists to prevent, reached through the one command
  // that creates runs.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const refused = cli(
      [
        "run",
        "start",
        "--spec-kind",
        "tracked",
        "--spec-locator",
        "spec/feature.md",
        "--backend",
        "omnigent",
      ],
      context,
    );
    assert.equal(errorCode(refused), "unsupported_backend");
    assert.match(refused.stderr, /orchestrate-feature-omnigent/);

    // What the run does use is written down, so a later reader is not left
    // inferring it from which adapter happened to be the default.
    const runId = startRun(context);
    const state = ok(cli(["run", "show", "--run-id", runId], context), "run show").json;
    assert.equal(state["backend"], "herdr");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("cleanup stops the run's workers before it deletes the state that names them", () => {
  // §00 step 5 orders these two, and the acceptance map claimed the ordering
  // was proven by a test that calls the state-store function directly — it
  // never spawns a session and never sees a stop outcome. The behaviour was
  // right and nothing was holding it there: deleting first destroys the only
  // record of the handles, so a leaked reviewer sits in a pane nothing can
  // address, one per abandoned run.
  const repo = seededRepo();
  const home = createTempHome();
  const fakeState = join(home.dir, "fake-herdr.json");
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
    dispatchWorkers(context, runId);

    /** §M-TEST-HARDENING-LIFECYCLE — Panes the scripted backend currently holds. */
    const panes = (): string[] =>
      Object.keys(
        (JSON.parse(readFileSync(fakeState, "utf8")) as { panes: Record<string, unknown> }).panes,
      );
    assert.equal(panes().length, 3, "three workers were dispatched");

    const cleaned = ok(
      cli(["run", "cleanup", "--run-id", runId, "--force"], {
        ...context,
        env: { META_O_HERDR_BIN: FAKE_HERDR, FAKE_HERDR_STATE: fakeState },
      }),
      "run cleanup",
    );

    const sessions = cleaned.json["sessions"] as Record<string, string>;
    assert.deepEqual(
      Object.keys(sessions).sort(),
      ["e2eTester", "reviewerCrossVendor", "reviewerPrimary"],
      "every dispatched worker is accounted for by name",
    );
    for (const [role, outcome] of Object.entries(sessions)) {
      assert.equal(outcome, "stopped", `${role} was stopped, not abandoned`);
    }
    assert.deepEqual(panes(), [], "and the backend is holding nothing for this run");
    assert.deepEqual(ok(cli(["run", "list"], context), "run list").json["runs"], []);
  } finally {
    home.dispose();
    repo.dispose();
  }
});

test("the adjudicator threshold is a number the run keeps, not a memory", () => {
  // §30 lets the orchestrator call a fresh adjudicator "after two fruitless
  // rebuttal turns", and nothing counted them: the rule lived in the skill as
  // prose, so the one number it rests on existed nowhere a recovered
  // orchestrator could read. A run that had argued about a finding six times
  // looked exactly like a run on its first attempt.
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

    /** §M-TEST-HARDENING-LIFECYCLE — Propose one fix, and report what routing now says. */
    const attempt = (commit: string): { action: string; adjudicable: string[] } => {
      const proposed = ok(
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
            commit,
          ],
          {
            ...context,
            stdin: JSON.stringify([
              { kind: "file", reference: "src/app.py:1", detail: "guard added" },
            ]),
          },
        ),
        `propose-fix ${commit}`,
      );
      assert.equal(proposed.json["status"], "fix_proposed");
      // `run route` and not `run show`: the threshold is a routing signal, and
      // routing is what the orchestrator skill is told to read.
      const routed = ok(cli(["run", "route", "--run-id", runId], context), "run route");
      const routing = routed.json["routing"] as { action: string; adjudicable?: string[] };
      return { action: routing.action, adjudicable: routing.adjudicable ?? [] };
    };

    const first = attempt("c1");
    assert.deepEqual(first.adjudicable, [], "one fruitless turn is not two");
    const second = attempt("c2");
    assert.deepEqual(second.adjudicable, ["F-1"], "the second reaches §30's threshold");

    // Reported, never acted on. §30 says the orchestrator *may* call an
    // adjudicator, so crossing the threshold changes what the run can tell the
    // orchestrator and nothing about what it prescribes.
    assert.equal(second.action, first.action, "the threshold reports; it does not route");
  } finally {
    home.dispose();
    repo.dispose();
  }
});
