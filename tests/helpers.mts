/**
 * §M-TEST-HELPERS — Disposable repositories and state trees for the test suite.
 *
 * Implements §A-EXECUTABLE-ACCEPTANCE. Most acceptance criteria of this
 * methodology are about real Git trees, real file permissions and real crash
 * points, so testing them against mocks would prove nothing. These helpers make
 * a genuine repository and a genuine `~/.meta-o` cheap enough to create per
 * test; without them the suite would quietly drift towards asserting on stubs.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

/** §M-TEST-HELPERS — A throwaway Git repository with convenience writers. */
export interface TempRepo {
  dir: string;
  write(relative: string, content: string): void;
  remove(relative: string): void;
  commit(message: string): string;
  git(args: string[]): string;
  dispose(): void;
}

/**
 * §M-TEST-HELPERS — Create an initialised repository in a temporary directory.
 *
 * Identity is passed per-invocation rather than configured globally so the
 * suite never depends on, or disturbs, the developer's Git configuration.
 */
export function createTempRepo(): TempRepo {
  const dir = mkdtempSync(join(tmpdir(), "meta-o-repo-"));
  /** §M-TEST-HELPERS — Run one git command in this repository with a fixed identity. */
  const run = (args: string[]): string =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "meta-o tests",
        GIT_AUTHOR_EMAIL: "tests@example.invalid",
        GIT_COMMITTER_NAME: "meta-o tests",
        GIT_COMMITTER_EMAIL: "tests@example.invalid",
      },
    });

  run(["init", "--quiet", "--initial-branch=main"]);

  return {
    dir,
    git: run,
    write(relative, content) {
      const path = join(dir, relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    },
    remove(relative) {
      rmSync(join(dir, relative), { force: true, recursive: true });
    },
    commit(message) {
      run(["add", "-A"]);
      run(["commit", "--quiet", "--allow-empty", "-m", message]);
      return run(["rev-parse", "HEAD"]).trim();
    },
    dispose() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** §M-TEST-HELPERS — A throwaway `~/.meta-o` root. */
export interface TempHome {
  dir: string;
  dispose(): void;
}

/**
 * §M-TEST-HELPERS — Point `META_O_HOME` at a fresh directory for one test.
 *
 * State-tree tests assert on ownership and permission bits, so they must never
 * run against the real home directory: a failing test could otherwise leave a
 * developer's actual run state modified.
 */
export function createTempHome(): TempHome {
  const dir = mkdtempSync(join(tmpdir(), "meta-o-home-"));
  const previous = process.env["META_O_HOME"];
  process.env["META_O_HOME"] = dir;
  return {
    dir,
    dispose() {
      if (previous === undefined) delete process.env["META_O_HOME"];
      else process.env["META_O_HOME"] = previous;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** §M-TEST-HELPERS — Minimal valid E2E registry used by many fixtures. */
export function sampleRegistry(): string {
  return `${JSON.stringify(
    {
      schema_version: 1,
      scenarios: [
        {
          scenario_id: "E2E-SMOKE-01",
          scenario_ref: "docs/architecture/e2e.md#e2e-smoke-01",
          business_links: ["§B-CORE-01"],
          always_required: true,
          tags: ["smoke"],
        },
        {
          scenario_id: "E2E-CHECKOUT-01",
          scenario_ref: "docs/architecture/e2e.md#e2e-checkout-01",
          business_links: ["§B-CHECKOUT-01"],
          always_required: false,
          tags: ["checkout"],
        },
      ],
    },
    null,
    2,
  )}\n`;
}

/** §M-TEST-HELPERS — Minimal business knowledge defining the sample anchors. */
export function sampleBusinessKnowledge(): string {
  return [
    "# Business truth",
    "",
    "## §B-CORE-01 — The product must start",
    "",
    "Users cannot do anything with a product that does not boot.",
    "",
    "## §B-CHECKOUT-01 — Customers must be able to pay",
    "",
    "Without checkout the business has no revenue.",
    "",
  ].join("\n");
}

/** §M-TEST-HELPERS — Minimal valid QC manifest. */
export function sampleManifest(): string {
  return `${JSON.stringify(
    {
      schema_version: 1,
      gates: [
        { id: "lint", command: "ruff check .", policy: "passed" },
        { id: "tests", command: "pytest", policy: "passed" },
      ],
    },
    null,
    2,
  )}\n`;
}

/**
 * §M-TEST-HELPERS — Populate a repository with a complete, valid project contract.
 *
 * Used as the baseline for tests that then break exactly one thing, which is
 * what makes their failure messages meaningful.
 */
export function seedProjectContract(repo: TempRepo): void {
  // `qc` writes the machine-readable result the run reads back, because the
  // attestation is recomputed from that file rather than taken on the caller's
  // word. A target that only exits zero cannot prove a gate ran.
  repo.write(
    "Makefile",
    [
      "qc:",
      "\t@printf '{\"schema_version\":1,\"snapshot_digest\":\"%s\",\"gates\":[" +
        '{\"id\":\"lint\",\"status\":\"passed\",\"command\":\"ruff check .\",' +
        '\"tool_version\":\"ruff 0.6\",\"duration_ms\":10},' +
        '{\"id\":\"tests\",\"status\":\"passed\",\"command\":\"pytest\",' +
        '\"tool_version\":\"pytest 8\",\"duration_ms\":20}]}\' ' +
        '"$$META_O_SNAPSHOT_DIGEST" > "$$META_O_QC_RESULT"',
      "",
      "verify-e2e-metadata:",
      "\t@true",
      "",
    ].join("\n"),
  );
  repo.write(".quality/qc-manifest.json", sampleManifest());
  repo.write("docs/architecture/e2e.md", "# E2E\n\n## e2e-smoke-01\n\n## e2e-checkout-01\n");
  repo.write("docs/architecture/e2e.json", sampleRegistry());
  repo.write("docs/knowledge/business.md", sampleBusinessKnowledge());
  repo.write("docs/knowledge/architecture/app.md", sampleArchitectureKnowledge());
  repo.write("docs/knowledge/glossary.md", "# Glossary\n");
  repo.write("docs/todo.md", "# Debt found outside a feature's scope\n");
}

/**
 * §M-TEST-HELPERS — Minimal architecture layer, so the chain has a middle link.
 *
 * Without it the fixture's own `§M-APP` would have no `§A` to cite, and every
 * test would be exercising a knowledge layer that the real gate rejects.
 */
export function sampleArchitectureKnowledge(): string {
  return [
    "# Architecture",
    "",
    "## §A-APP-01 — The application starts from one entry point",
    "",
    "Implements §B-CORE-01.",
    "",
  ].join("\n");
}

/** §M-TEST-HELPERS — Unique identifier for fixtures that need one. */
export function uniqueId(): string {
  return randomUUID();
}
