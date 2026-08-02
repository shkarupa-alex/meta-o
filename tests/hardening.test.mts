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
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { createTempHome } from "./helpers.mts";
import { cli, errorCode, ok, retireSpec, seededRepo, startRun, type CliContext } from "./cli-harness.mts";
import { detectPolicyWeakening, parseMetaOPolicy } from "../dist/core/policy.mjs";
import { evaluateQc, validateResult } from "../dist/core/qc.mjs";
import { allowedTransitions, completionProven } from "../dist/core/fsm.mjs";
import { outsideClosure } from "../dist/core/adoption.mjs";
import { detectCapabilityRegression, unexercised } from "../dist/adapters/capability-suite.mjs";
import { listRuns } from "../dist/core/state-store.mjs";
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

test("a plan sealed for another candidate cannot prove completion", () => {
  const stale = attestedState({
    e2ePlan: { ...attestedState().e2ePlan!, commitOid: "c0" },
  });
  assert.equal(completionProven(stale), false);
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
    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
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

    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
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
    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
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

test("a finding cannot be closed on the authority of a session that was never dispatched", () => {
  // `--by-role` is a claim. It used to be compared only against the raising
  // role, so the executor had merely to claim the raiser's own role — the
  // check the code comment said made this safe was the check being evaded.
  const repo = seededRepo();
  const home = createTempHome();
  const context: CliContext = { cwd: repo.dir, home: home.dir };
  try {
    const runId = startRun(context);
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
        "reviewerPrimary",
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
    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
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
    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
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
    ok(cli(["run", "confirm-models", "--run-id", runId], context), "confirm-models");
    ok(
      cli(
        ["run", "transition", "--run-id", runId, "--phase", "PAUSED_MODEL_UNAVAILABLE",
          "--reason", "the executor model was withdrawn",
          "--resume-condition", "a model the user still has"],
        context,
      ),
      "→ PAUSED_MODEL_UNAVAILABLE",
    );

    const rejected = cli(["run", "set-model-set", "--run-id", runId], {
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

    const accepted = cli(["run", "set-model-set", "--run-id", runId], {
      ...context,
      stdin: replacement,
    });
    ok(accepted, "set-model-set");
    assert.equal(
      ((accepted.json["modelSet"] as RunState["modelSet"]).executor).model,
      "haiku",
      "the run now carries the model the user confirmed",
    );

    ok(cli(["run", "transition", "--run-id", runId, "--phase", "PREFLIGHT"], context), "resume");
    const locked = cli(["run", "set-model-set", "--run-id", runId], {
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
