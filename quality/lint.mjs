#!/usr/bin/env node
/**
 * §M-QC-LINT — Forbid the small habits that hide problems from the type checker.
 *
 * Implements §A-AUTHORITATIVE-QC. Each rule here covers a way of making an
 * error disappear from a tool's output without making it disappear from the
 * program: a suppression comment, an escape hatch cast, a leftover debug print,
 * a marker that says the work is unfinished. None of them is caught by `tsc`,
 * and all of them are cheap to grep for.
 *
 * Small on purpose. A linter that also has opinions about style would need a
 * configuration file, and a configuration file is a place to quietly disable a
 * rule that started failing.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  encoding: "utf8",
}).trim();

/** §M-QC-LINT — What is forbidden, and the reason a reader deserves. */
const RULES = [
  { id: "no-ts-ignore", pattern: /@ts-ignore/, why: "silences the checker instead of fixing the type" },
  {
    id: "no-ts-nocheck",
    pattern: /@ts-nocheck/,
    why: "disables checking for a whole file",
  },
  { id: "no-any-cast", pattern: /\bas any\b/, why: "an escape hatch that outlives the reason for it" },
  { id: "no-debugger", pattern: /^\s*debugger\b/, why: "left-over debugging" },
  {
    id: "no-console-log",
    pattern: /console\.(log|debug|dir)\(/,
    why: "the CLI writes through emit()/fail(), so stray output corrupts a JSON envelope",
  },
  {
    id: "no-unfinished-marker",
    // Not preceded by a hyphen or §, so an anchor name like §B-…-TODO that a
    // docstring is warning against does not trip the rule that agrees with it.
    pattern: /(?<![§\w-])(TODO|FIXME|XXX|HACK)\b/,
    why: "unfinished work must be a finding or a task, not a comment nobody reads",
  },
];

/** §M-QC-LINT — Tracked sources this gate applies to. */
function sources() {
  return execFileSync("git", ["ls-files", "src/**/*.mts", "tests/**/*.mts", "quality/*.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

const problems = [];
for (const file of sources()) {
  // The rules table names the very strings it forbids, so it cannot lint itself.
  if (file === "quality/lint.mjs") continue;

  readFileSync(`${ROOT}/${file}`, "utf8")
    .split("\n")
    .forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          problems.push(`${file}:${index + 1}: [${rule.id}] ${rule.why}`);
        }
      }
    });
}

for (const problem of problems) process.stdout.write(`${problem}\n`);
process.stdout.write(problems.length ? `lint: ${problems.length} problem(s)\n` : "lint: ok\n");
process.exitCode = problems.length ? 1 : 0;
