/**
 * §M-CLI-BACKEND — CLI surface for the backend adapter.
 *
 * Implements §A-BACKEND-CONTRACT. Capability grading is where the methodology
 * touches a system it does not own, so it is an explicit command a human can
 * run and read rather than behaviour hidden inside a prompt. The watchdog half
 * lives in `watchdog-cli.mts`, which builds on the adapter this file makes.
 */

import { HerdrAdapter } from "../../adapters/herdr.mjs";
import { formatCapabilityReport } from "../../adapters/adapter.mjs";
import {
  baselineOf,
  detectCapabilityRegression,
  formatSuiteReport,
  runFullSuite,
  runSmokeSuite,
  type CapabilityBaseline,
  type SuiteContext,
} from "../../adapters/capability-suite.mjs";
import {
  GENERATION_ENV,
  readSettings,
} from "../../core/state-store.mjs";
import { readSecureJson, writeSecureJson } from "../../core/safe-fs.mjs";
import type { JsonValue } from "../../core/canonical-json.mjs";
import {
  capabilityBaselinePath,
} from "../../core/paths.mjs";
import { resolveProjectIdentity } from "../../core/project-key.mjs";
import { isoTimestamp } from "../../core/clock.mjs";
import type {
  ModelRef,
  ModelSet,
} from "../../core/types.mjs";
import { boolFlag, emit, fail, optionalFlag, type ParsedArgs } from "../args.mjs";

/** §M-CLI-BACKEND — Wake prompt a recovered orchestrator receives. */
export const WAKE_PROMPT =
  "Read the orchestrate-feature-herdr skill, this run's state.json and the backend session " +
  "status, then continue the run from whatever the routing table prescribes.";

/**
 * §M-CLI-BACKEND — What a watchdog-spawned replacement orchestrator is told.
 *
 * A replacement is not a wake: the run it inherits has a generation the
 * watchdog just claimed on its behalf, and until it exports that number the
 * fence in `commitState` reads its writes as "no claim" — which is exactly what
 * a resurrected predecessor's writes would also look like.
 */
export function spawnPrompt(generation: number): string {
  return (
    `export ${GENERATION_ENV}=${generation} before running any meta-o command: you are the ` +
    `replacement orchestrator for this run and that is your generation. ${WAKE_PROMPT}`
  );
}

/**
 * §M-CLI-BACKEND — What an orchestrator is told when an effect cannot be proven.
 *
 * Deliberately different from the wake prompt. "Continue from the routing
 * table" is wrong advice here: the run has an in-flight operation whose effect
 * is unknown, and the only correct next move is to reconcile it and, failing
 * that, pause. A generic wake would invite exactly the blind retry the protocol
 * forbids.
 */
export const UNCERTAINTY_PROMPT =
  "A backend operation on this run cannot be proven applied or not applied. Do not resend " +
  "anything. Run `meta-o session reconcile --run-id <id>`; if it still answers unknown, leave " +
  "the run in PAUSED_BACKEND_UNCERTAIN and tell the user what evidence is missing.";

/** §M-CLI-BACKEND — What an orchestrator is told when the backend lost a capability. */
export const CAPABILITY_REGRESSION_PROMPT =
  "The backend no longer supports a capability this workflow depends on. Do not start new " +
  "sessions. Run `meta-o adapter capabilities`, report the blocking reasons to the user, and " +
  "move the run to FAILED_BACKEND if they cannot be resolved.";

/**
 * §M-CLI-BACKEND — Build the adapter for the backend this project chose.
 *
 * The project's recorded `backend` is consulted, not just the flag. Both were
 * validated and stored and then ignored in favour of a herdr default, so a
 * project configured for omnigent got herdr silently — the one outcome worse
 * than refusing, because the run looked like it was honouring the setting.
 */
export function requireSupportedBackend(configured: string | undefined, flag: string | undefined): void {
  const backend = flag ?? configured ?? "herdr";
  if (backend !== "herdr") {
    // Say which of the two asked for it. The message named the project's
    // settings unconditionally, so `--backend omnigent` against a
    // herdr-configured project reported a misconfiguration that was not there,
    // and sent the reader to edit a file that was already correct.
    const source = flag !== undefined ? "--backend" : "this project's settings";
    fail(
      "unsupported_backend",
      `${source} asks for ${backend}, and only the herdr adapter ships today; ` +
        `${backend} needs its own adapter and an orchestrate-feature-${backend} skill`,
      { configured: configured ?? null, flag: flag ?? null },
    );
  }
}

/** §M-CLI-BACKEND — Build the adapter for the configured backend. */
export function adapterFor(args: ParsedArgs): HerdrAdapter {
  const cwd = optionalFlag(args, "cwd") ?? process.cwd();
  let configured: string | undefined;
  try {
    configured = readSettings(resolveProjectIdentity(cwd).projectKey)?.backend;
  } catch {
    /* outside a known project there is nothing recorded to honour */
  }
  requireSupportedBackend(configured, optionalFlag(args, "backend"));
  return new HerdrAdapter({ binary: process.env["META_O_HERDR_BIN"] });
}

/** §M-CLI-BACKEND — Report what the backend can actually do. */
export async function commandCapabilities(args: ParsedArgs): Promise<void> {
  const report = await adapterFor(args).capabilityReport();
  if (boolFlag(args, "text")) {
    process.stdout.write(`${formatCapabilityReport(report)}\n`);
    if (report.blocked) process.exitCode = 1;
    return;
  }
  emit(report);
  if (report.blocked) process.exitCode = 1;
}

/**
 * §M-CLI-BACKEND — The project's confirmed ModelSet, if there is a project.
 *
 * The suite is meaningful without one: proving what a backend can do needs no
 * project at all, and the installer has none.
 */
function configuredModelSet(cwd: string): ModelSet | undefined {
  try {
    return readSettings(resolveProjectIdentity(cwd).projectKey)?.modelSet;
  } catch {
    return undefined;
  }
}

/**
 * §M-CLI-BACKEND — Which extra routes this suite run should prove.
 *
 * `--also-routes` wins when given, so a caller can probe a route the project
 * has not adopted yet. Otherwise every distinct route in the confirmed ModelSet
 * is proved, which is exactly the set the run will try to launch.
 */
function routesToProve(
  args: ParsedArgs,
  configured: ModelSet | undefined,
  primary: ModelRef["route"],
): ModelRef["route"][] {
  const declared = optionalFlag(args, "also-routes");
  const candidates =
    declared === undefined
      ? configured
        ? (Object.values(configured) as ModelRef[]).map((ref) => ref.route)
        : []
      : declared.split(",").map((route) => route.trim());
  return [...new Set(candidates)].filter(
    (route): route is ModelRef["route"] => route !== "" && route !== primary,
  );
}

/**
 * §M-CLI-BACKEND — Run the executable capability suite.
 *
 * `--smoke` is the cheap preflight variant; `--full` really creates sessions
 * and is what must be run after installing or upgrading a backend.
 */
export async function commandCapabilitySuite(args: ParsedArgs): Promise<void> {
  const adapter = adapterFor(args);
  // Guarded, because this command is the one thing `install.sh` and
  // `update.sh` run — from whatever directory the user happens to be in, which
  // is usually not a repository. An unguarded lookup turned "you are not in a
  // Git repo" into "the backend failed its capability suite", and aborted a
  // perfectly good install.
  const configured = configuredModelSet(optionalFlag(args, "cwd") ?? process.cwd());
  const model: ModelRef = {
    route: (optionalFlag(args, "route") ?? configured?.executor.route ?? "claude") as ModelRef["route"],
    vendor: optionalFlag(args, "vendor") ?? configured?.executor.vendor ?? "unknown",
    family: optionalFlag(args, "family") ?? configured?.executor.family ?? "unknown",
    model: optionalFlag(args, "model") ?? configured?.executor.model ?? "default",
  };
  // The spec asks the full suite to prove *the chosen routes*, plural: a
  // backend can host one CLI perfectly and fail to launch another, and finding
  // that out when the cross-vendor reviewer is spawned costs a whole run.
  //
  // Taken from the project's own ModelSet when the flag is absent, because
  // `install.sh` and `update.sh` pass neither and nobody types `--also-routes`
  // by hand. A suite that only ever proved the default `claude` route recorded
  // a baseline saying nothing about the `codex` the cross-vendor reviewer is
  // pinned to, and preflight then reported no regression against it.
  const additionalModels: ModelRef[] = routesToProve(args, configured, model.route).map((route) => ({
    ...model,
    route,
  }));

  const context: SuiteContext = {
    adapter,
    backend: "herdr",
    cwd: optionalFlag(args, "cwd") ?? process.cwd(),
    model,
    ...(additionalModels.length > 0 ? { additionalModels } : {}),
  };

  const full = boolFlag(args, "full");
  const report = full ? await runFullSuite(context) : await runSmokeSuite(context);

  // Only the full suite may set the baseline. A smoke run proves a subset, and
  // letting it overwrite the record would silently forgive every capability it
  // never checked — which is the same thing as having no baseline at all.
  //
  // A regression blocks the write even when the report is not `blocked`. Most
  // regressions are supported → degraded, which does not block; overwriting on
  // those was how `update.sh` turned a backend that had quietly lost `stop`
  // into the new normal, and reported success while doing it.
  const regressions = full ? detectCapabilityRegression(readCapabilityBaseline(), report) : [];
  let baselineWritten = false;
  if (full && !report.blocked && regressions.length === 0) {
    writeSecureJson(
      capabilityBaselinePath(),
      baselineOf(report, isoTimestamp()) as unknown as JsonValue,
    );
    baselineWritten = true;
  }

  if (boolFlag(args, "text")) {
    process.stdout.write(`${formatSuiteReport(report)}\n`);
    for (const regression of regressions) process.stderr.write(`regression: ${regression}\n`);
  } else {
    emit({ ...report, regressions, baselineWritten, baselinePath: capabilityBaselinePath() });
  }
  if (report.blocked || regressions.length > 0) process.exitCode = 1;
}

/**
 * §M-CLI-BACKEND — Read the recorded capability baseline, tolerating only its absence.
 *
 * A baseline that exists and cannot be read is not the same as no baseline.
 * Swallowing the error returned `undefined`, which the regression check treats
 * as "nothing to compare, therefore fine" — so wrong permissions on one file
 * turned the check off without saying so.
 */
export function readCapabilityBaseline(): CapabilityBaseline | undefined {
  try {
    return readSecureJson<CapabilityBaseline>(capabilityBaselinePath());
  } catch (error) {
    throw new Error(
      `${capabilityBaselinePath()} exists but could not be read: ${(error as Error).message}; ` +
        "re-record it with `meta-o capability-suite run --full` or remove it deliberately",
    );
  }
}
