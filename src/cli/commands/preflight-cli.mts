/**
 * §M-CLI-PREFLIGHT — The command that decides whether a run may start at all.
 *
 * Implements §A-RUN-LIFECYCLE. Split from the gate commands because preflight
 * answers a different question from all of them: they ask "is this evidence
 * about this content trustworthy", and this asks "does this project, this
 * machine's state tree and this backend make a run possible in the first
 * place". §00 gives it three parts — the repository contract, the state tree
 * under `~/.meta-o`, and the backend's capabilities — and all three are here
 * so that none of them can be quietly dropped from the answer.
 */

import { existsSync } from "node:fs";
import { HerdrAdapter } from "../../adapters/herdr.mjs";
import {
  detectCapabilityRegression,
  runSmokeSuite,
  unexercised,
  type CapabilityBaseline,
  type SuiteReport,
} from "../../adapters/capability-suite.mjs";
import { readCapabilityBaseline } from "./backend.mjs";
import { runPreflight, type PreflightCheck } from "../../core/preflight.mjs";
import { projectDir, projectMetadataPath } from "../../core/paths.mjs";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { readSecureJson, verifySecureDir } from "../../core/safe-fs.mjs";
import { boolFlag, emit, optionalFlag, type ParsedArgs } from "../args.mjs";

/** §M-CLI-PREFLIGHT — Resolve the repository preflight applies to. */
function repoOf(args: ParsedArgs): { repoDir: string } {
  return { repoDir: resolveProjectIdentity(optionalFlag(args, "cwd") ?? process.cwd()).canonicalPath };
}

/**
 * §M-CLI-PREFLIGHT — Say what the capability comparison actually covered.
 *
 * Naming the unexercised checks matters more than the verdict. The smoke run
 * drives one throwaway agent through spawn, observe and stop; everything a
 * prompt would be needed to prove — acknowledgement, resume, concurrency,
 * routes — is a last-proven fact from the full suite rather than a re-verified
 * one, and a detail line that omitted the difference read as a verification it
 * was not.
 */
function capabilityDetail(
  baseline: CapabilityBaseline | undefined,
  regressions: string[],
  skipped: string[],
): string {
  if (regressions.length > 0) return regressions.join("; ");
  if (!baseline) return "no capability baseline is recorded; run `meta-o capability-suite run --full`";
  const compared = `no reported capability is worse than the baseline of ${baseline.recordedAt}`;
  return skipped.length === 0
    ? compared
    : `${compared}; not re-exercised at preflight: ${skipped.join(", ")}`;
}

/**
 * §M-CLI-PREFLIGHT — §00 preflight step 2: is this project's state tree still ours?
 *
 * Every state-touching command verifies ownership, mode and the absence of a
 * symlink before it reads or writes, so the guarantee held — but the command
 * literally named "preflight" did not perform the step the spec gives it, and
 * reported `ok: true` over a project directory replaced by a symlink. A check
 * whose answer only arrives when something else happens to run is not the
 * check §00 asks for: the point of preflight is to say so before the run
 * starts spending models.
 *
 * A project with no state yet is `ok`, not `missing`: `project init` creates it
 * securely, and there is nothing there to have been substituted.
 */
function stateTreeCheck(repoDir: string): PreflightCheck {
  try {
    const { projectKey, canonicalPath } = resolveProjectIdentity(repoDir);
    const directory = projectDir(projectKey);
    if (!existsSync(directory)) {
      return {
        id: "state-tree",
        status: "ok",
        blocking: true,
        detail: "this project has no state yet; `meta-o project init` will create it",
      };
    }
    verifySecureDir(directory);
    const metadata = readSecureJson<{ canonicalPath?: string }>(projectMetadataPath(projectKey));
    if (metadata && metadata.canonicalPath !== canonicalPath) {
      return {
        id: "state-tree",
        status: "invalid",
        blocking: true,
        detail:
          `project.json claims ${metadata.canonicalPath}, this repository is ${canonicalPath}; ` +
          "the state directory belongs to a different checkout",
        remedy: "move the repository back, or start a fresh project directory for this path",
      };
    }
    return { id: "state-tree", status: "ok", blocking: true, detail: `state tree: ${directory}` };
  } catch (error) {
    return {
      id: "state-tree",
      status: "invalid",
      blocking: true,
      detail: (error as Error).message,
      remedy: "restore ~/.meta-o to a directory you own with mode 0700 and no symlinked components",
    };
  }
}

/**
 * §M-CLI-PREFLIGHT — Ask the backend what it can still do, and compare that to the record.
 *
 * The smoke variant: one throwaway agent, no prompt, so a preflight before every
 * feature costs a pane for a few seconds and no tokens. It has to actually use
 * the verbs — a comparison against a self-report the adapter hardcodes can only
 * fail when the adapter's own source changes, which is not what §20 means by a
 * capability regression. Two things can go wrong and they are reported apart:
 * the backend cannot answer at all, and the backend answers *worse than it used
 * to*. The second is the one worth the machinery — a silently degraded backend
 * produces a run that fails four hours later for reasons nobody connects to an
 * upgrade that happened last week.
 */
async function backendChecks(repoDir: string): Promise<PreflightCheck[]> {
  const adapter = new HerdrAdapter({ binary: process.env["META_O_HERDR_BIN"] });
  let report: SuiteReport;
  try {
    report = await runSmokeSuite({ adapter, backend: "herdr", cwd: repoDir, model: PROBE_MODEL });
  } catch (error) {
    return [
      {
        id: "backend-smoke",
        status: "invalid",
        blocking: true,
        detail: `the backend could not be probed: ${(error as Error).message}`,
        remedy: "install or start the backend, or pass --no-backend to check the project alone",
      },
    ];
  }

  let baseline: CapabilityBaseline | undefined;
  try {
    baseline = readCapabilityBaseline();
  } catch (error) {
    return [
      {
        id: "capability-regression",
        status: "invalid",
        blocking: true,
        detail: (error as Error).message,
        remedy: "re-record the baseline with `meta-o capability-suite run --full`",
      },
    ];
  }

  const regressions = detectCapabilityRegression(baseline, report);
  const skipped = unexercised(baseline, report);
  return [
    {
      id: "backend-smoke",
      status: report.blocked ? "invalid" : "ok",
      blocking: true,
      detail: report.blocked
        ? report.blockingReasons.join("; ")
        : `backend answers and reports every completion-critical capability`,
      remedy: "run `meta-o capability-suite run --full` and resolve what it reports",
    },
    {
      id: "capability-regression",
      status: regressions.length === 0 ? "ok" : "invalid",
      blocking: true,
      // Says what it compared, not merely that it found nothing. The smoke run
      // re-reads the backend's self-report; it does not re-spawn an agent, so
      // the behavioural checks the full suite proved are named as last-proven
      // rather than silently counted as still true.
      detail: capabilityDetail(baseline, regressions, skipped),
      remedy:
        "this backend lost a capability the workflow depends on; fix or downgrade it, then " +
        "re-record the baseline with `meta-o capability-suite run --full`",
    },
  ];
}

/** §M-CLI-PREFLIGHT — The identity a capability probe presents; it never does real work. */
const PROBE_MODEL = {
  route: "claude",
  vendor: "probe",
  family: "probe",
  model: "default",
} as const;

/**
 * §M-CLI-PREFLIGHT — Run every mechanical project contract check.
 *
 * Includes the backend, because a project contract the backend cannot execute
 * is not a contract this workflow can honour. `--no-backend` checks the
 * repository alone, which is what adoption needs before a backend exists.
 */
export async function commandPreflight(args: ParsedArgs): Promise<void> {
  const { repoDir } = repoOf(args);
  const report = runPreflight({
    repoDir,
    // `boolFlag`, not `optionalFlag`: a bare `--allow-dirty` parses as `true`
    // rather than a string, so testing for `undefined` read it as absent and
    // silently kept preflight strict. Failing safe is not the same as working.
    requireCleanWorktree: !boolFlag(args, "allow-dirty"),
  });

  const checks = [...report.checks, stateTreeCheck(repoDir)];
  const missingContract = [
    ...report.missingContract,
    ...(checks.at(-1)!.status === "ok" ? [] : ["state-tree"]),
  ];
  if (!boolFlag(args, "no-backend")) {
    for (const check of await backendChecks(repoDir)) {
      checks.push(check);
      if (check.blocking && check.status !== "ok") missingContract.push(check.id);
    }
  }

  const ok = checks.every((check) => !check.blocking || check.status === "ok");
  emit({
    ok,
    checks,
    missingContract,
    recommendedPhase: ok ? "EXECUTING" : "PAUSED_MISSING_TOOLS",
  });
  if (!ok) process.exitCode = 1;
}

