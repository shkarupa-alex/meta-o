#!/usr/bin/env node
/**
 * Check the current tree of a project's knowledge layer from the command line.
 *
 * §A-MEMORY-05 ships the portable core as one bundle a project calls from its
 * own QC. The core itself lives in `knowledge-check.mjs`, apart from this
 * entry point, because `mo-vocabulary` runs the same core inside its own
 * bundle: a second entry point bundled there would start on the same command
 * line and answer twice.
 *
 * Implements §A-MEMORY-05.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { checkKnowledge, knowledgeReport, resolveRoot, unknownResult } from "./knowledge-check.mjs";

export { checkKnowledge, knowledgeLine, knowledgeReport, resolveRoot } from "./knowledge-check.mjs";

const USAGE = `usage: mo-knowledge.mjs check [--repo <git-root>] --business <path>
         --architecture <dir> --docs <path> [--docs <path> ...]
         --first-party-root <dir> [--first-party-root <dir> ...]
         [--exclude <tracked-path> ...]
       mo-knowledge.mjs --help

  --repo <git-root>          repository to check (default: Git root of the cwd)
  --business <path>          business document; the only home of §B-* ids
  --architecture <dir>       decision directory; the only home of §A-* ids
  --docs <path>              declared knowledge: a tracked .md file or a
                             directory of them (repeatable)
  --first-party-root <dir>   every tracked .md under it must be declared or
                             excluded (repeatable; "." is the whole repository)
  --exclude <tracked-path>   exact tracked file left out of the check, echoed
                             in the output (repeatable; no wildcards)
  --help                     print this grammar and exit

Paths other than --repo are relative to the Git root.

output: MO-KNOWLEDGE/1 status=<ok|violations|unknown> files=<n> definitions=<n> uncovered=<n>
exit: 0 ok | 1 violations | 2 unknown or call error
`;

function parseArguments(argv) {
  const multiple = { type: "string", multiple: true };
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      repo: multiple,
      business: multiple,
      architecture: multiple,
      docs: multiple,
      "first-party-root": multiple,
      exclude: multiple,
      help: { type: "boolean" },
    },
  });
  if (values.help) return { help: true };
  if (positionals.length !== 1 || positionals[0] !== "check") {
    throw new Error("expected exactly one command: check");
  }
  for (const single of ["repo", "business", "architecture"]) {
    if ((values[single]?.length ?? 0) > 1) throw new Error(`--${single} given more than once`);
  }
  for (const required of ["business", "architecture", "docs", "first-party-root"]) {
    if (!values[required]) throw new Error(`--${required} is required`);
  }
  return {
    repo: values.repo?.[0],
    business: values.business[0],
    architecture: values.architecture[0],
    docs: values.docs,
    firstPartyRoots: values["first-party-root"],
    excludes: values.exclude ?? [],
  };
}

function main(argv) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  const root = resolveRoot(options.repo);
  const result =
    root === null
      ? unknownResult("not_git_repository", options.repo ?? process.cwd())
      : checkKnowledge({ root, ...options });
  if (result.status === "call_error") {
    process.stderr.write(`error: ${result.message}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(knowledgeReport(result));
  process.exitCode = { ok: 0, violations: 1 }[result.status] ?? 2;
}

function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) main(process.argv.slice(2));
