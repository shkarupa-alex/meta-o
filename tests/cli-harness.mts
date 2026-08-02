/**
 * §M-TEST-HARNESS — Driving the compiled CLI the way a skill does.
 *
 * Implements §A-EXECUTABLE-ACCEPTANCE. Extracted so that more than one test
 * file can walk a real run without re-implementing the envelope handling.
 * Running the compiled artefact rather than importing the modules is the point:
 * argument parsing, the JSON envelope and the exit status are what a prompt
 * actually depends on, and unit tests never reach them.
 */

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempRepo, seedProjectContract, type TempRepo } from "./helpers.mts";

/** §M-TEST-HARNESS — Path to the compiled CLI under test. */
export const CLI = fileURLToPath(new URL("../dist/cli/meta-o.mjs", import.meta.url));

/** §M-TEST-HARNESS — The scripted backend stand-in, for tests that need a session. */
export const FAKE_HERDR = fileURLToPath(new URL("./fixtures/fake-herdr.mjs", import.meta.url));

/** §M-TEST-HARNESS — Outcome of one CLI invocation. */
export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  json: Record<string, unknown>;
}

/** §M-TEST-HARNESS — Where a command runs and which state tree it uses. */
export interface CliContext {
  cwd: string;
  home: string;
  stdin?: string;
  env?: Record<string, string>;
}

/**
 * §M-TEST-HARNESS — Invoke the CLI the way a skill would.
 *
 * Runs the compiled artefact instead of importing the modules, so the test also
 * covers argument parsing, the JSON envelope and the exit status — the parts a
 * prompt actually depends on and the parts unit tests never reach.
 */
export function cli(args: string[], options: CliContext): CliResult {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      cwd: options.cwd,
      encoding: "utf8",
      input: options.stdin ?? "",
      env: { ...process.env, META_O_HOME: options.home, ...options.env },
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

/** §M-TEST-HARNESS — Parse CLI output, tolerating non-JSON and empty responses. */
export function parseJson(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** §M-TEST-HARNESS — Assert a command succeeded, showing its own error if it did not. */
export function ok(result: CliResult, what: string): CliResult {
  assert.equal(result.code, 0, `${what} failed: ${result.stderr || result.stdout}`);
  return result;
}

/** §M-TEST-HARNESS — The routing action a command reported. */
export function action(result: CliResult): string {
  return (result.json["routing"] as { action: string } | undefined)?.action ?? "(none)";
}

/** §M-TEST-HARNESS — The error code carried by a failure envelope. */
export function errorCode(result: CliResult): string {
  return (result.json["error"] as { code: string } | undefined)?.code ?? "(none)";
}

/** §M-TEST-HARNESS — A confirmed ModelSet satisfying the cross-vendor invariant. */
export const SETTINGS = JSON.stringify({
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

/** §M-TEST-HARNESS — A repository with a valid contract and a tracked feature spec. */
export function seededRepo(): TempRepo {
  const repo = createTempRepo();
  seedProjectContract(repo);
  repo.write("spec/feature.md", "# Feature\n\nAdd a checkout confirmation step.\n");
  repo.write("src/app.py", '"""§M-APP — entry point. Implements §A-APP-01."""\n');
  repo.commit("seed project");
  return repo;
}

/**
 * §M-TEST-HARNESS — Retire the tracked feature spec, as the executor must before a candidate.
 *
 * The spec is deleted inside the candidate window, not after it: a deletion
 * after the reviews would be a semantic change to attested content.
 */
export function retireSpec(repo: TempRepo): void {
  repo.remove("spec/feature.md");
  repo.commit("retire the feature spec into the knowledge chain");
}

/**
 * §M-TEST-HARNESS — Write the completion metadata commit's `last_run` receipts.
 *
 * Kept faithful to what the executor really writes, because the guard the test
 * then runs is only meaningful against a realistic commit: a fixture that
 * skipped a field would prove the guard tolerant rather than correct.
 */
export function writeLastRun(
  repo: TempRepo,
  input: {
    runId: string;
    snapshotDigest: string;
    provenanceCommit: string;
    specSha256: string;
    statuses: Array<{ scenarioId: string; status: string }>;
  },
): void {
  const registry = JSON.parse(readFileSync(join(repo.dir, "docs/architecture/e2e.json"), "utf8")) as {
    scenarios: Array<Record<string, unknown>>;
  };
  const byId = new Map(input.statuses.map((item) => [item.scenarioId, item.status]));
  for (const scenario of registry.scenarios) {
    const status = byId.get(scenario["scenario_id"] as string);
    if (!status) continue;
    scenario["last_run"] = {
      snapshot_digest: input.snapshotDigest,
      provenance_commit: input.provenanceCommit,
      run_id: input.runId,
      spec_sha256: input.specSha256,
      verified_at: "2026-07-24T12:30:00Z",
      status,
      environment: "local",
    };
  }
  repo.write("docs/architecture/e2e.json", `${JSON.stringify(registry, null, 2)}\n`);
}

/** §M-TEST-HARNESS — Bring a project to the point where a run exists. */
export function startRun(context: CliContext, extra: string[] = []): string {
  ok(cli(["project", "init"], context), "project init");
  ok(cli(["project", "set-settings"], { ...context, stdin: SETTINGS }), "project set-settings");
  const started = ok(
    cli(
      ["run", "start", "--spec-kind", "tracked", "--spec-locator", "spec/feature.md", ...extra],
      context,
    ),
    "run start",
  );
  return started.json["runId"] as string;
}

