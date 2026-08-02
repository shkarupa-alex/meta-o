/**
 * §M-TEST-HARDENING — The bypasses a clean-room reading of this implementation found.
 *
 * Every test here corresponds to a way the workflow could be made to say
 * "verified" about something it had not verified: a guard pointed at the wrong
 * commit, a gate set without its evidence, a boundary that covered only thirteen
 * file extensions, a capability comparison whose two sides shared no key. They
 * live together because they share a shape — each one passed every other check
 * in the suite while being wrong.
 *
 * Verifies §A-SNAPSHOT-ATTESTATION, §A-AUTHORITATIVE-QC and §A-BACKEND-CONTRACT.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { createTempHome } from "./helpers.mts";
import {
  cli,
  confirmModels,
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
import type { CapabilityBaseline, SuiteReport } from "../dist/adapters/capability-suite.mjs";
import type { QcManifest, QcResult, RunState } from "../dist/core/types.mjs";

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

/** §M-TEST-HARDENING — A state whose four gates all attest one snapshot and plan. */
function attestedState(overrides: Partial<RunState> = {}): RunState {
  const gate = {
    commitOid: "c1",
    snapshotDigest: "digest",
    planDigest: "plan",
    status: "passed" as const,
    completedAt: "2026-07-24T12:00:00Z",
  };
  return {
    schemaVersion: 1,
    runId: "r1",
    projectKey: "p1",
    phase: "FINALIZE_METADATA",
    stateVersion: 1,
    orchestratorGeneration: 1,
    spec: { kind: "tracked", locator: "spec.md", sha256: "s", disposition: "delete_after_sync" },
    specBlob: "/tmp/spec",
    baseRevision: "c0",
    modelSet: {} as RunState["modelSet"],
    sessions: {},
    sessionGeneration: {},
    decisions: [],
    candidateSnapshot: { digest: "digest", provenanceCommit: "c1", computedAt: "t" },
    e2ePlan: {
      schemaVersion: 1,
      commitOid: "c1",
      planDigest: "plan",
      selectedScenarioIds: ["E2E-SMOKE-01"],
      selectionRationale: "the canary always runs",
      impactedBusinessLinks: [],
      impactedTags: [],
    },
    e2ePlanSnapshotDigest: "digest",
    confirmations: { qc: gate, reviewerPrimary: gate, reviewerCrossVendor: gate, e2e: gate },
    updatedAt: "t",
    ...overrides,
  } as RunState;
}

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

/** §M-TEST-HARDENING — A suite report carrying the given check grades. */
function report(mode: "smoke" | "full", grades: Record<string, string>): SuiteReport {
  const checks = Object.entries(grades).map(([id, grade]) => ({
    id,
    grade: grade as SuiteReport["checks"][number]["grade"],
    detail: id,
    durationMs: 0,
    completionCritical: false,
  }));
  return { mode, backend: "herdr", checks, blocked: false, blockingReasons: [] };
}

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
    assert.ok(serialized.includes("[redacted]"), "and its absence is visible");
  } finally {
    home.dispose();
    repo.dispose();
  }
});

/** §M-TEST-HARDENING — A well-formed blocking finding, ready for stdin. */
function blocker(id: string): string {
  return JSON.stringify([
    {
      id,
      severity: "blocker",
      classification: "defect",
      evidence: [{ kind: "file", reference: "src/app.py:1", detail: "the guard is missing" }],
      basis: { type: "architecture", reference: "§A-APP-01" },
      impact: "the endpoint accepts unauthenticated writes",
      recommendedFix: { approach: "check the token first", rationale: "nothing else does" },
    },
  ]);
}

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

    /** §M-TEST-HARDENING — Record one decision attributed to the given role. */
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

    /** §M-TEST-HARDENING — One reviewer payload, varying only in verdict and findings. */
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

    /** §M-TEST-HARDENING — Drive one production E2E attempt to the contract check. */
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

    /** §M-TEST-HARDENING — Run the whole E2E round once, at whatever HEAD is now. */
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
    /** §M-TEST-HARDENING — What the project's own settings say about the watchdog. */
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
    ok(cli(["run", "set-candidate", "--run-id", runId], context), "re-point at the contract");
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
    const early = cli(["run", "transition", "--run-id", runId, "--phase", "E2E_STABILIZATION"], context);
    assert.equal(errorCode(early), "reviews_not_passed");
    assert.deepEqual((early.json["error"] as { missingGates?: string[] }).missingGates, [
      "reviewerPrimary",
      "reviewerCrossVendor",
    ]);

    /** §M-TEST-HARDENING — A passing review of the sealed candidate and plan. */
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
    ok(cli(["worktree", "run", "--run-id", runId, "--label", "e2e", "true"], context), "isolated run");

    /** §M-TEST-HARDENING — An otherwise valid result with the selection fields overridden. */
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
    /** §M-TEST-HARDENING — The same payload, offered to the dry run instead. */
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
