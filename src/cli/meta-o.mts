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
import { commandPreflight } from "./commands/preflight-cli.mjs";
import {
  commandConfigSetDefaults,
  commandConfigShow,
  commandInit,
  commandKey,
  commandSetSettings,
  commandSettings,
} from "./commands/project.mjs";
import {
  commandCleanup,
  commandConfirmModels,
  commandSetModelSet,
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
import { commandApproveProductionE2e, commandRecordDecision } from "./commands/decisions.mjs";
import {
  commandKnowledgePlan,
  commandRecordE2e,
  commandRecordGate,
  commandRecordReview,
} from "./commands/results.mjs";
import {
  commandDismissTaste,
  commandOpenFindings,
  commandProposeFix,
  commandReclassifyFinding,
  commandResolveFinding,
} from "./commands/findings-cli.mjs";
import {
  commandBaselineSelection,
  commandE2eResult,
  commandE2eValidate,
  commandKnowledgeValidate,
  commandQcEvaluate,
  commandReviewValidate,
  commandSealPlan,
  commandSnapshotDigest,
  commandSpecDigest,
  commandValidatePlan,
  commandVerifyMetadata,
  commandWorktreeAssertClean,
  commandWorktreeCreate,
  commandWorktreeRun,
} from "./commands/gates.mjs";
import { commandQcWeakening } from "./commands/weakening.mjs";
import {
  commandList as commandSessionList,
  commandRead as commandSessionRead,
  commandReconcile as commandSessionReconcile,
  commandSend as commandSessionSend,
  commandSpawn as commandSessionSpawn,
  commandStatus as commandSessionStatus,
  commandStop as commandSessionStop,
  commandResume as commandSessionResume,
  commandWait as commandSessionWait,
} from "./commands/session.mjs";
import {
  commandCapabilities,
  commandCapabilitySuite,
} from "./commands/backend.mjs";
import {
  commandWatchdogDisable,
  commandWatchdogEnable,
  commandWatchdogRun,
  commandWatchdogRuns,
  commandWatchdogStatus,
} from "./commands/watchdog-cli.mjs";

/** §M-CLI — One dispatchable command. */
type Command = (args: ParsedArgs) => void | Promise<void>;

/**
 * §M-CLI — The complete command surface, keyed by `group verb`.
 *
 * Kept as data rather than a switch so that `meta-o help` can enumerate the
 * real surface instead of a hand-maintained list that drifts from it.
 */
const COMMANDS: Record<string, { flags: string[]; run: Command; help: string }> = {
  "project key": {
    flags: [],
    run: commandKey,
    help: "print the project key and state directory",
  },
  "project init": {
    flags: [],
    run: commandInit,
    help: "create or validate the project state directory",
  },
  "project settings": {
    flags: [],
    run: commandSettings,
    help: "show the saved ModelSet and preferences",
  },
  "project set-settings": {
    flags: [],
    run: commandSetSettings,
    help: "store confirmed settings from a JSON payload on stdin",
  },
  "config show": {
    flags: [],
    run: commandConfigShow,
    help: "show the machine-wide defaults in ~/.meta-o/config.json",
  },
  "config set-defaults": {
    flags: [],
    run: commandConfigSetDefaults,
    help: "store machine-wide defaults from a JSON payload on stdin",
  },

  "run start": {
    flags: ["backend", "handoff", "reuse-scan", "spec-kind", "spec-locator", "spec-sha256"],
    run: commandStart,
    help: "pin a spec and create a new run",
  },
  "run list": {
    flags: [],
    run: commandList,
    help: "list runs of this project",
  },
  "run show": {
    flags: ["as-role", "run-id"],
    run: commandShow,
    help: "print a run's state, whole or bounded to one worker role with --as-role",
  },
  "run route": {
    flags: ["run-id"],
    run: commandRoute,
    help: "print the next step the routing table prescribes",
  },
  "run transition": {
    flags: ["phase", "reason", "resume-condition", "run-id"],
    run: commandTransition,
    help: "move a run to another phase",
  },
  "run confirm-models": {
    flags: ["run-id"],
    run: commandConfirmModels,
    help: "record the user's ModelSet confirmation",
  },
  "run set-model-set": {
    flags: ["run-id"],
    run: commandSetModelSet,
    help: "replace a paused run's ModelSet with a newly confirmed one (stdin)",
  },
  "run set-candidate": {
    flags: ["rev", "run-id"],
    run: commandSetCandidate,
    help: "point the run at a candidate revision",
  },
  "run set-plan": {
    flags: ["run-id"],
    run: commandSetPlan,
    help: "store the E2E selection plan from stdin",
  },
  "run record-gate": {
    flags: ["commit", "evidence", "gate", "run-id", "snapshot-digest", "status"],
    run: commandRecordGate,
    help: "record one gate's result",
  },
  "run record-review": {
    flags: ["run-id"],
    run: commandRecordReview,
    help: "record a validated review verdict and its findings from stdin",
  },
  "run record-e2e": {
    flags: ["run-id"],
    run: commandRecordE2e,
    help: "record a validated E2E result and its per-scenario statuses from stdin",
  },
  "run open-findings": {
    flags: ["reviewer", "run-id"],
    run: commandOpenFindings,
    help: "store a reviewer's findings from stdin",
  },
  "run propose-fix": {
    flags: ["candidate-commit", "finding-id", "reviewer", "run-id"],
    run: commandProposeFix,
    help: "mark a finding as having a proposed fix",
  },
  "run resolve-finding": {
    flags: ["by-role", "finding-id", "reviewer", "run-id"],
    run: commandResolveFinding,
    help: "close a finding as reviewer or adjudicator",
  },
  "run reclassify-finding": {
    flags: ["cwd", "finding-id", "rationale", "reviewer", "run-id"],
    run: commandReclassifyFinding,
    help: "demote a finding to taste on an adjudicator's verdict",
  },
  "run dismiss-taste": {
    flags: ["by-role", "finding-id", "reviewer", "run-id"],
    run: commandDismissTaste,
    help: "drop a declined taste suggestion",
  },
  "run record-decision": {
    flags: ["run-id"],
    run: commandRecordDecision,
    help: "append one compact decision record from stdin",
  },
  "run approve-production-e2e": {
    flags: ["decision-id", "run-id"],
    run: commandApproveProductionE2e,
    help: "let this run's E2E set touch production, on a recorded user decision",
  },
  "run knowledge-plan": {
    flags: ["run-id"],
    run: commandKnowledgePlan,
    help: "store the KnowledgeImpactPlan from stdin",
  },
  "run pending": {
    flags: ["clear", "run-id"],
    run: commandPending,
    help: "write or clear the in-flight backend operation",
  },
  "run set-session": {
    flags: ["generation", "role", "run-id", "session-id"],
    run: commandSetSession,
    help: "register a session handle (--role/--session-id, or a SessionRef on stdin)",
  },
  "run takeover": {
    flags: ["backend", "run-id"],
    run: commandTakeover,
    help: "claim a run with a fresh orchestrator generation",
  },
  "run handoff": {
    flags: ["run-id"],
    run: commandHandoff,
    help: "write the optional 4 KiB executor handoff",
  },
  "run cleanup": {
    flags: ["force", "run-id"],
    run: commandCleanup,
    help: "delete all temporary artefacts of a run",
  },

  preflight: {
    flags: ["allow-dirty", "no-backend"],
    run: commandPreflight,
    help: "check the project contract mechanically",
  },
  "snapshot digest": {
    flags: ["rev"],
    run: commandSnapshotDigest,
    help: "compute a revision's snapshot digest",
  },
  "snapshot verify-metadata": {
    flags: ["attested", "metadata", "run-id"],
    run: commandVerifyMetadata,
    help: "prove a completion metadata commit touched only last_run",
  },

  "e2e validate": {
    flags: [],
    run: commandE2eValidate,
    help: "validate the E2E registry and its links",
  },
  "e2e seal-plan": {
    flags: [],
    run: commandSealPlan,
    help: "attach a digest to a selection plan draft",
  },
  "e2e validate-plan": {
    flags: [],
    run: commandValidatePlan,
    help: "validate a sealed plan against the catalog",
  },
  "e2e baseline-selection": {
    flags: ["business-links", "tags"],
    run: commandBaselineSelection,
    help: "suggest a baseline scenario set",
  },
  "e2e result": {
    flags: ["run-id"],
    run: commandE2eResult,
    help: "validate an E2E result against the stored plan",
  },

  "qc evaluate": {
    flags: ["result", "run-id", "snapshot-digest"],
    run: commandQcEvaluate,
    help: "decide whether a QC run really passed",
  },
  "qc weakening": {
    flags: ["base-rev", "run-id"],
    run: commandQcWeakening,
    help: "detect QC contract relaxation since baseRevision",
  },

  "review validate": {
    flags: ["run-id"],
    run: commandReviewValidate,
    help: "validate a reviewer's structured result",
  },
  "knowledge validate": {
    flags: ["roots"],
    run: commandKnowledgeValidate,
    help: "validate anchors and causal links",
  },

  "worktree create": {
    flags: ["label", "rev"],
    run: commandWorktreeCreate,
    help: "create a fresh detached gate worktree",
  },
  "worktree run": {
    flags: ["label", "rev", "run-id"],
    run: commandWorktreeRun,
    help: "run a gate command in a fresh worktree and prove it changed nothing",
  },
  "worktree assert-clean": {
    flags: ["path"],
    run: commandWorktreeAssertClean,
    help: "assert a worktree is pristine",
  },
  "spec digest": {
    flags: ["spec-kind", "spec-locator"],
    run: commandSpecDigest,
    help: "fetch a spec and report its sha256",
  },

  "session spawn": {
    flags: ["backend", "replace", "role", "run-id", "worker-cwd"],
    run: commandSessionSpawn,
    help: "start a worker session for a role",
  },
  "session send": {
    flags: ["backend", "role", "run-id"],
    run: commandSessionSend,
    help: "deliver a prompt from stdin to a role",
  },
  "session status": {
    flags: ["backend", "role", "run-id"],
    run: commandSessionStatus,
    help: "report the backend's view of a session",
  },
  "session read": {
    flags: ["backend", "cursor", "role", "run-id"],
    run: commandSessionRead,
    help: "read new output from a session",
  },
  "session wait": {
    flags: ["backend", "role", "run-id", "terminal", "timeout-ms"],
    run: commandSessionWait,
    help: "wait for a session to settle",
  },
  "session resume": {
    flags: ["backend", "role", "run-id"],
    run: commandSessionResume,
    help: "confirm a worker survived a backend restart",
  },
  "session stop": {
    flags: ["backend", "role", "run-id"],
    run: commandSessionStop,
    help: "terminate a session this run created",
  },
  "session reconcile": {
    flags: ["backend", "role", "run-id"],
    run: commandSessionReconcile,
    help: "decide what became of the pending backend operation",
  },
  "session list": {
    flags: ["backend", "run-id"],
    run: commandSessionList,
    help: "list this run's sessions and pending operation",
  },

  "adapter capabilities": {
    flags: ["backend", "text"],
    run: commandCapabilities,
    help: "grade what the backend can do",
  },
  "capability-suite run": {
    flags: ["also-routes", "backend", "family", "full", "model", "route", "text", "vendor"],
    run: commandCapabilitySuite,
    help: "run the smoke or full capability suite",
  },

  "watchdog enable": {
    flags: ["classifier-mode", "cwd", "max-backoff-seconds", "poll-interval-seconds", "project-key"],
    run: commandWatchdogEnable,
    help: "switch the watchdog on for this project",
  },
  "watchdog disable": {
    flags: ["all", "cwd", "project-key"],
    run: commandWatchdogDisable,
    help: "stop watching this project, or all of them",
  },
  "watchdog status": {
    flags: [],
    run: commandWatchdogStatus,
    help: "show watchdog configuration",
  },
  "watchdog runs": {
    flags: [],
    run: commandWatchdogRuns,
    help: "list runs a watchdog would observe",
  },
  "watchdog run": {
    flags: ["backend", "max-ticks", "once"],
    run: commandWatchdogRun,
    help: "run the deterministic observation loop",
  },
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
function resolve(args: ParsedArgs): { name: string; run: Command; rest: ParsedArgs } | undefined {
  const [first, second] = args.positional;
  if (first !== undefined && second !== undefined) {
    const name = `${first} ${second}`;
    const twoWord = COMMANDS[name];
    if (twoWord) {
      return { name, run: twoWord.run, rest: { positional: args.positional.slice(2), flags: args.flags } };
    }
  }
  if (first !== undefined) {
    const oneWord = COMMANDS[first];
    if (oneWord) {
      return { name: first, run: oneWord.run, rest: { positional: args.positional.slice(1), flags: args.flags } };
    }
  }
  return undefined;
}

/**
 * §M-CLI — Flags every command accepts, whatever it does with them.
 *
 * `--cwd` selects the repository and therefore the project key, so it is
 * meaningful even for commands that never read it directly.
 */
const UNIVERSAL_FLAGS = ["cwd"];

/**
 * §M-CLI — Refuse a flag the command does not have.
 *
 * The callers here are skills composing shell from a prompt, and a typo used to
 * be free: `--terminl` silently performed a non-terminal wait, `--nobackend`
 * silently ran the backend checks. A misspelled flag is not a smaller mistake
 * than a misspelled command, and it fails much later.
 */
function assertKnownFlags(name: string, args: ParsedArgs): void {
  const allowed = new Set([...(COMMANDS[name]?.flags ?? []), ...UNIVERSAL_FLAGS]);
  const unknown = [...args.flags.keys()].filter((flag) => !allowed.has(flag)).sort();
  if (unknown.length === 0) return;
  fail(
    "unknown_flag",
    `${name} does not accept ${unknown.map((flag) => `--${flag}`).join(", ")}` +
      (args.positional.length > 0
        ? "; if these belong to the command being run, put them after a bare `--`"
        : ""),
    { accepted: [...allowed].sort() },
  );
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

  assertKnownFlags(resolved.name, resolved.rest);

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
