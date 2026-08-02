#!/usr/bin/env node
/**
 * §M-CLI — Entry point dispatching every meta-o helper command.
 *
 * Implements §A-SKILL-TOOLING. Skills are prompts; anything that must be exact
 * — a digest, a transition, a gate verdict — is delegated to this binary so it
 * is computed once, identically, and testably. The router is deliberately flat:
 * a model reading `meta-o run route --run-id X` in a skill should be able to
 * predict exactly what runs.
 */

import { parseArgs, fail, UsageError, type ParsedArgs } from "./args.mjs";
import {
  commandInit,
  commandKey,
  commandSetSettings,
  commandSettings,
} from "./commands/project.mjs";
import {
  commandCleanup,
  commandConfirmModels,
  commandHandoff,
  commandList,
  commandPending,
  commandRoute,
  commandSetCandidate,
  commandSetPlan,
  commandSetSession,
  commandShow,
  commandStart,
  commandTakeover,
  commandTransition,
} from "./commands/run.mjs";
import {
  commandDismissTaste,
  commandKnowledgePlan,
  commandOpenFindings,
  commandProposeFix,
  commandRecordE2e,
  commandRecordGate,
  commandRecordReview,
  commandResolveFinding,
} from "./commands/results.mjs";
import {
  commandBaselineSelection,
  commandE2eResult,
  commandE2eValidate,
  commandKnowledgeValidate,
  commandPreflight,
  commandQcEvaluate,
  commandQcWeakening,
  commandReviewValidate,
  commandSealPlan,
  commandSnapshotDigest,
  commandSpecDigest,
  commandValidatePlan,
  commandVerifyMetadata,
  commandWorktreeAssertClean,
  commandWorktreeCreate,
} from "./commands/gates.mjs";
import {
  commandList as commandSessionList,
  commandRead as commandSessionRead,
  commandReconcile as commandSessionReconcile,
  commandSend as commandSessionSend,
  commandSpawn as commandSessionSpawn,
  commandStatus as commandSessionStatus,
  commandStop as commandSessionStop,
  commandWait as commandSessionWait,
} from "./commands/session.mjs";
import {
  commandCapabilities,
  commandCapabilitySuite,
  commandWatchdogRun,
  commandWatchdogRuns,
  commandWatchdogStatus,
} from "./commands/backend.mjs";

/** §M-CLI — One dispatchable command. */
type Command = (args: ParsedArgs) => void | Promise<void>;

/**
 * §M-CLI — The complete command surface, keyed by `group verb`.
 *
 * Kept as data rather than a switch so that `meta-o help` can enumerate the
 * real surface instead of a hand-maintained list that drifts from it.
 */
const COMMANDS: Record<string, { run: Command; help: string }> = {
  "project key": { run: commandKey, help: "print the project key and state directory" },
  "project init": { run: commandInit, help: "create or validate the project state directory" },
  "project settings": { run: commandSettings, help: "show the saved ModelSet and preferences" },
  "project set-settings": {
    run: commandSetSettings,
    help: "store confirmed settings from a JSON payload on stdin",
  },

  "run start": { run: commandStart, help: "pin a spec and create a new run" },
  "run list": { run: commandList, help: "list runs of this project" },
  "run show": { run: commandShow, help: "print the full state of a run" },
  "run route": { run: commandRoute, help: "print the next step the routing table prescribes" },
  "run transition": { run: commandTransition, help: "move a run to another phase" },
  "run confirm-models": { run: commandConfirmModels, help: "record the user's ModelSet confirmation" },
  "run set-candidate": { run: commandSetCandidate, help: "point the run at a candidate revision" },
  "run set-plan": { run: commandSetPlan, help: "store the E2E selection plan from stdin" },
  "run record-gate": { run: commandRecordGate, help: "record one gate's result" },
  "run record-review": {
    run: commandRecordReview,
    help: "record a validated review verdict and its findings from stdin",
  },
  "run record-e2e": {
    run: commandRecordE2e,
    help: "record a validated E2E result and its per-scenario statuses from stdin",
  },
  "run open-findings": { run: commandOpenFindings, help: "store a reviewer's findings from stdin" },
  "run propose-fix": { run: commandProposeFix, help: "mark a finding as having a proposed fix" },
  "run resolve-finding": { run: commandResolveFinding, help: "close a finding as reviewer or adjudicator" },
  "run dismiss-taste": { run: commandDismissTaste, help: "drop a declined taste suggestion" },
  "run knowledge-plan": { run: commandKnowledgePlan, help: "store the KnowledgeImpactPlan from stdin" },
  "run pending": { run: commandPending, help: "write or clear the in-flight backend operation" },
  "run set-session": { run: commandSetSession, help: "register a worker session handle" },
  "run takeover": { run: commandTakeover, help: "claim a run with a fresh orchestrator generation" },
  "run handoff": { run: commandHandoff, help: "write the optional 4 KiB executor handoff" },
  "run cleanup": { run: commandCleanup, help: "delete all temporary artefacts of a run" },

  preflight: { run: commandPreflight, help: "check the project contract mechanically" },
  "snapshot digest": { run: commandSnapshotDigest, help: "compute a revision's snapshot digest" },
  "snapshot verify-metadata": {
    run: commandVerifyMetadata,
    help: "prove a completion metadata commit touched only last_run",
  },

  "e2e validate": { run: commandE2eValidate, help: "validate the E2E registry and its links" },
  "e2e seal-plan": { run: commandSealPlan, help: "attach a digest to a selection plan draft" },
  "e2e validate-plan": { run: commandValidatePlan, help: "validate a sealed plan against the catalog" },
  "e2e baseline-selection": { run: commandBaselineSelection, help: "suggest a baseline scenario set" },
  "e2e result": { run: commandE2eResult, help: "validate an E2E result against the stored plan" },

  "qc evaluate": { run: commandQcEvaluate, help: "decide whether a QC run really passed" },
  "qc weakening": { run: commandQcWeakening, help: "detect QC contract relaxation since baseRevision" },

  "review validate": { run: commandReviewValidate, help: "validate a reviewer's structured result" },
  "knowledge validate": { run: commandKnowledgeValidate, help: "validate anchors and causal links" },

  "worktree create": { run: commandWorktreeCreate, help: "create a fresh detached gate worktree" },
  "worktree assert-clean": { run: commandWorktreeAssertClean, help: "assert a worktree is pristine" },
  "spec digest": { run: commandSpecDigest, help: "fetch a spec and report its sha256" },

  "session spawn": { run: commandSessionSpawn, help: "start a worker session for a role" },
  "session send": { run: commandSessionSend, help: "deliver a prompt from stdin to a role" },
  "session status": { run: commandSessionStatus, help: "report the backend's view of a session" },
  "session read": { run: commandSessionRead, help: "read new output from a session" },
  "session wait": { run: commandSessionWait, help: "wait for a session to settle" },
  "session stop": { run: commandSessionStop, help: "terminate a session this run created" },
  "session reconcile": {
    run: commandSessionReconcile,
    help: "decide what became of the pending backend operation",
  },
  "session list": { run: commandSessionList, help: "list this run's sessions and pending operation" },

  "adapter capabilities": { run: commandCapabilities, help: "grade what the backend can do" },
  "capability-suite run": { run: commandCapabilitySuite, help: "run the smoke or full capability suite" },

  "watchdog status": { run: commandWatchdogStatus, help: "show watchdog configuration" },
  "watchdog runs": { run: commandWatchdogRuns, help: "list runs a watchdog would observe" },
  "watchdog run": { run: commandWatchdogRun, help: "run the deterministic observation loop" },
};

/** §M-CLI — Print the real command surface. */
function printHelp(): void {
  const lines = ["meta-o — helpers for the AI-driven development workflow", "", "commands:"];
  for (const [name, command] of Object.entries(COMMANDS)) {
    lines.push(`  ${name.padEnd(28)} ${command.help}`);
  }
  lines.push("", "every command prints JSON on stdout; errors print JSON on stderr with exit 1");
  process.stdout.write(`${lines.join("\n")}\n`);
}

/**
 * §M-CLI — Resolve a command from the leading positional words.
 *
 * Tries the two-word form first so that `run route` never collides with a
 * hypothetical single-word `run`.
 */
function resolve(args: ParsedArgs): { run: Command; rest: ParsedArgs } | undefined {
  const [first, second] = args.positional;
  if (first !== undefined && second !== undefined) {
    const twoWord = COMMANDS[`${first} ${second}`];
    if (twoWord) {
      return { run: twoWord.run, rest: { positional: args.positional.slice(2), flags: args.flags } };
    }
  }
  if (first !== undefined) {
    const oneWord = COMMANDS[first];
    if (oneWord) {
      return { run: oneWord.run, rest: { positional: args.positional.slice(1), flags: args.flags } };
    }
  }
  return undefined;
}

/** §M-CLI — Parse, dispatch and translate every failure into the JSON envelope. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help") {
    printHelp();
    return;
  }

  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    fail("usage", (error as Error).message);
  }

  const resolved = resolve(args);
  if (!resolved) {
    fail("unknown_command", `unknown command: ${args.positional.join(" ") || "(none)"}`);
  }

  try {
    await resolved.run(resolved.rest);
  } catch (error) {
    if (error instanceof UsageError) fail("usage", error.message);
    const name = (error as Error).name || "error";
    fail(snakeCase(name), (error as Error).message);
  }
}

/** §M-CLI — Turn an error class name into a stable machine-readable code. */
function snakeCase(name: string): string {
  return name
    .replace(/Error$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase() || "error";
}

await main();
