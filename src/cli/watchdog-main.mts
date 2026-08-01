#!/usr/bin/env node
/**
 * §M-WATCHDOG-MAIN — Standalone entry point for the optional watchdog service.
 *
 * Implements §A-DETERMINISTIC-WATCHDOG. launchd and systemd want a single
 * executable file, not a subcommand of a larger CLI, so the watchdog ships as
 * its own `watchdog.mjs`. Keeping it a thin wrapper means the service and
 * `meta-o watchdog run` can never diverge in behaviour.
 */

import { parseArgs, fail } from "./args.mjs";
import { commandWatchdogRun } from "./commands/backend.mjs";

/** §M-WATCHDOG-MAIN — Parse arguments and run the loop until stopped. */
async function main(): Promise<void> {
  try {
    await commandWatchdogRun(parseArgs(process.argv.slice(2)));
  } catch (error) {
    fail("watchdog_failed", (error as Error).message);
  }
}

await main();
