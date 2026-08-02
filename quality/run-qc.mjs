#!/usr/bin/env node
/**
 * §M-QC-RUNNER — meta-o's own `make qc` aggregator.
 *
 * Implements §A-AUTHORITATIVE-QC by eating the contract this project defines:
 * the gates come from the tracked manifest, a missing tool is a failure rather
 * than a skip, a mutated worktree invalidates the run, and the machine-readable
 * result goes to `$META_O_QC_RESULT` so nothing has to infer a pass from an
 * exit code.
 *
 * Dependency-free on purpose — a quality gate that cannot run because its own
 * dependency failed to install is a quality gate that gets disabled.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** §M-QC-RUNNER — Repository root, resolved the way the digest defines it. */
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  encoding: "utf8",
}).trim();

/** §M-QC-RUNNER — The worktree state the gate contract compares against. */
function gitStatus() {
  return execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

/**
 * §M-QC-RUNNER — Split a manifest command into argv.
 *
 * Handles the quoting the manifest actually uses and nothing more: a command
 * that needs a shell needs a script, because a shell here would also give a
 * gate the ability to chain, redirect and silently swallow a failure.
 */
function argv(command) {
  const parts = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return parts.map((part) =>
    (part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))
      ? part.slice(1, -1)
      : part,
  );
}

/** §M-QC-RUNNER — Best-effort version of the tool a gate invokes. */
function toolVersion(executable) {
  const probe = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 30_000 });
  const text = `${probe.stdout ?? ""}${probe.stderr ?? ""}`.trim().split("\n")[0];
  return text || "unknown";
}

/**
 * §M-QC-RUNNER — Run one declared gate and classify its outcome.
 *
 * `ENOENT` is reported as a failure. That single decision separates a gate from
 * a decoration: the commonest way for one to stop working is for its tool to
 * disappear, and the most tempting response is to treat that as "not
 * applicable".
 */
function runGate(gate) {
  const command = String(gate.command);
  const [executable, ...args] = argv(command);
  const started = Date.now();

  const result = spawnSync(executable, args, { cwd: ROOT, stdio: "inherit" });

  if (result.error && result.error.code === "ENOENT") {
    return {
      id: gate.id,
      status: "failed",
      command,
      tool_version: "unknown",
      duration_ms: Date.now() - started,
      detail: `${executable} is not installed; a missing tool is a failure, not a skip`,
    };
  }
  if (result.error) throw result.error;

  return {
    id: gate.id,
    status: result.status === 0 ? "passed" : "failed",
    command,
    tool_version: toolVersion(executable),
    duration_ms: Date.now() - started,
  };
}

/**
 * §M-QC-RUNNER — Write the result atomically and durably.
 *
 * Rename alone survives a crashed process; it does not survive a lost machine,
 * and this file is the sole evidence behind one of the four attestations. The
 * run state is fsynced for the same reason, and the gate result had been left
 * out of that rule.
 */
function writeResult(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  rmSync(temporary, { force: true });
  const handle = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  renameSync(temporary, path);
}

/** §M-QC-RUNNER — Run every declared gate and report an attestable result. */
function main() {
  const manifestPath = join(ROOT, ".quality", "qc-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const before = gitStatus();
  const results = [];

  // Clean, not merely unchanged — but only when this run is producing an
  // attestation. An uncommitted edit that happens to fix a lint error makes
  // every gate pass while the digest in the result comes from HEAD, so the
  // attestation would describe content that was never the thing tested. A
  // developer running `make qc` by hand attests nothing, and failing them for a
  // dirty tree would just teach everyone to bypass the gate.
  const attesting = Boolean(process.env["META_O_QC_RESULT"]);
  if (before.trim() !== "" && attesting) {
    process.stderr.write(`the worktree is dirty; qc cannot attest content that is not committed:\n${before}`);
    results.push({
      id: "clean-worktree",
      status: "failed",
      command: "git status --porcelain --untracked-files=all",
      tool_version: "git",
      duration_ms: 0,
    });
  }

  for (const gate of manifest.gates) {
    if (gate.policy === "not_applicable") {
      process.stdout.write(`== ${gate.id}: not applicable (${gate.rationale ?? ""})\n`);
      results.push({
        id: gate.id,
        status: "not_applicable",
        command: String(gate.command),
        tool_version: "n/a",
        duration_ms: 0,
      });
      continue;
    }
    process.stdout.write(`== ${gate.id}: ${gate.command}\n`);
    results.push(runGate(gate));
  }

  if (gitStatus() !== before) {
    process.stderr.write("qc mutated the worktree; a gate that rewrites the tree cannot attest it\n");
    results.push({
      id: "non-mutating",
      status: "failed",
      command: "git status --porcelain --untracked-files=all",
      tool_version: "git",
      duration_ms: 0,
    });
  }

  const destination = process.env["META_O_QC_RESULT"];
  if (destination) {
    writeResult(destination, {
      schema_version: 1,
      snapshot_digest: process.env["META_O_SNAPSHOT_DIGEST"] ?? "",
      gates: results,
    });
    process.stdout.write(`qc result written to ${destination}\n`);
  }

  const failed = results.filter((gate) => gate.status === "failed").map((gate) => gate.id);
  if (failed.length > 0) {
    process.stderr.write(`\nqc FAILED: ${failed.join(", ")}\n`);
    return 1;
  }
  process.stdout.write("\nqc passed\n");
  return 0;
}

process.exitCode = main();
