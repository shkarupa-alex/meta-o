/**
 * §M-PREFLIGHT — Mechanical check that a project can host the workflow at all.
 *
 * Implements §A-PROJECT-CONTRACT. The orchestrator never reads code, so the
 * only thing it can honestly verify before spending four model sessions is that
 * the project's own contract exists: a `Makefile` with `qc`, a QC manifest, an
 * E2E contract and a readable knowledge layer. Discovering their absence three
 * hours into a run, after the reviews, is the failure this prevents.
 *
 * Preflight deliberately does not judge the *quality* of what it finds, and
 * never validates the feature spec.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validateRegistry, danglingBusinessLinks } from "./e2e-registry.mjs";
import { validateManifest } from "./qc.mjs";
import { buildAnchorIndex, businessAnchors } from "./knowledge.mjs";
import { porcelainStatus } from "./git.mjs";
import type { E2ERegistry, QcManifest } from "./types.mjs";

/** §M-PREFLIGHT — Outcome of one individual check. */
export type CheckStatus = "ok" | "missing" | "invalid";

/** §M-PREFLIGHT — One check with everything a user needs to act on it. */
export interface PreflightCheck {
  id: string;
  status: CheckStatus;
  blocking: boolean;
  detail: string;
  remedy?: string;
}

/** §M-PREFLIGHT — Aggregate preflight verdict. */
export interface PreflightReport {
  ok: boolean;
  checks: PreflightCheck[];
  missingContract: string[];
  recommendedPhase: "EXECUTING" | "PAUSED_MISSING_TOOLS";
}

/** §M-PREFLIGHT — Files the project contract requires to exist. */
export const REQUIRED_CONTRACT_FILES = [
  "Makefile",
  ".quality/qc-manifest.json",
  "docs/architecture/e2e.md",
  "docs/architecture/e2e.json",
  "docs/knowledge/business.md",
  "docs/knowledge/glossary.md",
] as const;

/**
 * §M-PREFLIGHT — Collect declared Make targets, following one level of `include`.
 *
 * Parses statically instead of invoking `make`: a dry run can still execute
 * recipes marked with `+`, and preflight must never have side effects on the
 * project it is inspecting.
 */
export function declaredMakeTargets(makefilePath: string, depth = 1): Set<string> {
  const targets = new Set<string>();
  if (!existsSync(makefilePath)) return targets;
  const text = readFileSync(makefilePath, "utf8");

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/#.*$/, "");
    if (line.trim() === "" || /^\s/.test(line)) continue;

    const include = /^\s*(?:-|s)?include\s+(.+)$/.exec(line);
    if (include && depth > 0) {
      for (const candidate of include[1]!.trim().split(/\s+/)) {
        const included = resolve(dirname(makefilePath), candidate);
        for (const target of declaredMakeTargets(included, depth - 1)) targets.add(target);
      }
      continue;
    }

    const rule = /^([^:=]+):(?!=)/.exec(line);
    if (!rule) continue;
    for (const name of rule[1]!.trim().split(/\s+/)) {
      if (name === "" || name.includes("%") || name.startsWith(".")) continue;
      targets.add(name);
    }
  }
  return targets;
}

/** §M-PREFLIGHT — Read and parse a JSON project file, reporting failures as text. */
function readJsonFile<T>(path: string): { value?: T; error?: string } {
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) as T };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

/** §M-PREFLIGHT — Markdown files that together define the knowledge layer. */
function knowledgeFiles(repoDir: string): Array<{ path: string; text: string }> {
  const files: Array<{ path: string; text: string }> = [];
  const businessPath = join(repoDir, "docs/knowledge/business.md");
  if (existsSync(businessPath)) {
    files.push({ path: "docs/knowledge/business.md", text: readFileSync(businessPath, "utf8") });
  }
  const architectureDir = join(repoDir, "docs/knowledge/architecture");
  if (existsSync(architectureDir) && statSync(architectureDir).isDirectory()) {
    for (const entry of readdirSafe(architectureDir)) {
      if (!entry.endsWith(".md")) continue;
      files.push({
        path: `docs/knowledge/architecture/${entry}`,
        text: readFileSync(join(architectureDir, entry), "utf8"),
      });
    }
  }
  return files;
}

/**
 * §M-PREFLIGHT — List a directory, treating an unreadable one as empty.
 *
 * An unreadable architecture directory is reported by the knowledge checks that
 * follow, so preflight must not abort here and lose the other findings.
 */
function readdirSafe(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

/** §M-PREFLIGHT — Everything preflight needs that it cannot discover itself. */
export interface PreflightInput {
  repoDir: string;
  requireCleanWorktree?: boolean;
}

/** §M-PREFLIGHT — How one check reports itself into the accumulating report. */
type Note = (check: PreflightCheck) => void;

/** §M-PREFLIGHT — The worktree must be pristine before anything is attested. */
function checkWorktree(repoDir: string, note: Note): void {
  const status = porcelainStatus(repoDir);
  note({
    id: "clean-worktree",
    status: status.trim() === "" ? "ok" : "invalid",
    blocking: true,
    detail:
      status.trim() === ""
        ? "working tree is clean"
        : `working tree has uncommitted or untracked changes:\n${status.trim()}`,
    remedy: "commit, stash or remove the listed paths before starting a run",
  });
}

/**
 * §M-PREFLIGHT — The Makefile must really declare `qc`.
 *
 * Parsed statically rather than executed: running an unknown project's Makefile
 * to find out whether a target exists is a side effect nobody asked for.
 */
function checkMakefile(repoDir: string, note: Note): void {
  const makefilePath = join(repoDir, "Makefile");
  if (!existsSync(makefilePath)) {
    note({
      id: "makefile",
      status: "missing",
      blocking: true,
      detail: "Makefile is absent",
      remedy: "allow the executor to create a Makefile exposing the QC contract",
    });
  } else {
    const targets = declaredMakeTargets(makefilePath);
    note({
      id: "makefile",
      status: targets.has("qc") ? "ok" : "invalid",
      blocking: true,
      detail: targets.has("qc")
        ? `Makefile declares qc (${[...targets].sort().join(", ")})`
        : `Makefile declares no qc target (found: ${[...targets].sort().join(", ") || "none"})`,
      remedy: "allow the executor to add an aggregate, non-mutating `qc` target",
    });
    note({
      id: "verify-e2e-metadata",
      status: targets.has("verify-e2e-metadata") ? "ok" : "missing",
      blocking: false,
      detail: targets.has("verify-e2e-metadata")
        ? "Makefile declares verify-e2e-metadata"
        : "Makefile declares no verify-e2e-metadata target; completion cannot verify the metadata commit",
      remedy: "add a fast schema/anchor check target for the last_run update",
    });
  }
}

/** §M-PREFLIGHT — The QC manifest must exist and be well formed. */
function checkQcManifest(repoDir: string, note: Note): void {
  const manifestPath = join(repoDir, ".quality/qc-manifest.json");
  if (!existsSync(manifestPath)) {
    note({
      id: "qc-manifest",
      status: "missing",
      blocking: true,
      detail: ".quality/qc-manifest.json is absent",
      remedy: "allow the executor to declare the blocking gate ids of this project",
    });
  } else {
    const parsed = readJsonFile<QcManifest>(manifestPath);
    const validation = parsed.value
      ? validateManifest(parsed.value)
      : { ok: false, errors: [parsed.error ?? "unreadable"] };
    note({
      id: "qc-manifest",
      status: validation.ok ? "ok" : "invalid",
      blocking: true,
      detail: validation.ok
        ? `${parsed.value!.gates.length} gates declared`
        : validation.errors.join("; "),
      remedy: "fix the manifest so every blocking gate has an id, command and policy",
    });
  }
}

/**
 * §M-PREFLIGHT — The E2E contract and catalog must both exist and agree.
 *
 * Returns the parsed catalog so the business-link check can use it without
 * reading and re-validating the same file.
 */
function checkE2eContract(repoDir: string, note: Note): E2ERegistry | undefined {
  const e2eDocPath = join(repoDir, "docs/architecture/e2e.md");
  note({
    id: "e2e-contract",
    status: existsSync(e2eDocPath) ? "ok" : "missing",
    blocking: true,
    detail: existsSync(e2eDocPath)
      ? "docs/architecture/e2e.md is present"
      : "docs/architecture/e2e.md is absent",
    remedy: "allow the executor to write the environment, fixtures, execution and cleanup contract",
  });

  const registryPath = join(repoDir, "docs/architecture/e2e.json");
  let registry: E2ERegistry | undefined;
  if (!existsSync(registryPath)) {
    note({
      id: "e2e-registry",
      status: "missing",
      blocking: true,
      detail: "docs/architecture/e2e.json is absent",
      remedy: "allow the executor to create the machine-readable scenario catalog",
    });
  } else {
    const parsed = readJsonFile<E2ERegistry>(registryPath);
    const validation = parsed.value
      ? validateRegistry(parsed.value)
      : { ok: false, errors: [parsed.error ?? "unreadable"] };
    registry = parsed.value;
    note({
      id: "e2e-registry",
      status: validation.ok ? "ok" : "invalid",
      blocking: true,
      detail: validation.ok
        ? `${parsed.value!.scenarios.length} scenarios, at least one always_required`
        : validation.errors.join("; "),
      remedy: "fix the catalog so ids are unique and at least one scenario is always_required",
    });
  }
  return registry;
}

/** §M-PREFLIGHT — The knowledge layer must exist and cover every scenario link. */
function checkKnowledge(repoDir: string, registry: E2ERegistry | undefined, note: Note): void {
  for (const relative of ["docs/knowledge/business.md", "docs/knowledge/glossary.md"]) {
    const present = existsSync(join(repoDir, relative));
    note({
      id: relative,
      status: present ? "ok" : "missing",
      blocking: true,
      detail: present ? `${relative} is present` : `${relative} is absent`,
      remedy: "allow the executor to create the knowledge layer, or run adopt-project first",
    });
  }

  const index = buildAnchorIndex(knowledgeFiles(repoDir));
  if (registry) {
    const dangling = danglingBusinessLinks(registry, businessAnchors(index));
    note({
      id: "e2e-business-links",
      status: dangling.length === 0 ? "ok" : "invalid",
      blocking: true,
      detail:
        dangling.length === 0
          ? "every scenario business link resolves to a §B anchor"
          : `dangling business links: ${dangling.join(", ")}`,
      remedy: "add the missing §B anchors or correct the scenario links",
    });
  }
}

/**
 * §M-PREFLIGHT — Run every mechanical project check.
 *
 * Returns all findings rather than stopping at the first, so the user is asked
 * for permission to set up the project once instead of six times in a row.
 */
export function runPreflight(input: PreflightInput): PreflightReport {
  const { repoDir } = input;
  const checks: PreflightCheck[] = [];
  const missingContract: string[] = [];

  const note: Note = (check) => {
    checks.push(check);
    if (check.blocking && check.status !== "ok") missingContract.push(check.id);
  };

  if (input.requireCleanWorktree !== false) checkWorktree(repoDir, note);
  checkMakefile(repoDir, note);
  checkQcManifest(repoDir, note);
  checkKnowledge(repoDir, checkE2eContract(repoDir, note), note);

  const ok = checks.every((check) => !check.blocking || check.status === "ok");
  return {
    ok,
    checks,
    missingContract,
    recommendedPhase: ok ? "EXECUTING" : "PAUSED_MISSING_TOOLS",
  };
}
