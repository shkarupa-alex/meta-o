#!/usr/bin/env node
/**
 * mo-models — the only writer of ~/.meta-o/models.json.
 *
 * It exists because model preferences are the one Meta-O setting that changes
 * rarely, matters every run, and is genuinely tedious to retype per project.
 * Everything else a run knows — candidates, gates, findings, actor state — is
 * deliberately not here: recovery reads Git, the spec and the backend's own
 * sessions, and a settings file that also held run state would become the
 * workflow engine this methodology exists without.
 *
 * It never starts an agent and never reads stdin. It is a settings editor.
 *
 * Implements §A-DISTRIBUTION-02: the installed helper carries its own runtime
 * instead of resolving an ambient `node_modules`. Keeping run state out of the
 * file is §A-ORCHESTRATION-03.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { query as claudeQuery } from "@anthropic-ai/claude-agent-sdk";

/** The role names a run addresses. Anything else is a typo, not a new role. */
const ROLES = [
  "orchestrator",
  "executor",
  "researcher",
  "reviewerA",
  "reviewerB",
  "e2eTester",
  "testClaude",
  "testCodex",
  "testCodexDesired",
  "testOpenCodeDesired",
];

/** Retired keys stay visible so a settings vocabulary change is never silent. */
const RETIRED_ROLES = new Map([
  ["testOpenCode", "configure testOpenCodeDesired for the current optional OpenCode coordinate"],
]);

/** Only this schema is understood; a newer file is left strictly alone. */
const SCHEMA_VERSION = 1;

/** History older than this is not evidence about what the user runs today. */
const HISTORY_MAX_AGE_DAYS = 31;

/** §A-MODELS-01 bounds provider history without silently truncating by file count. */
const configuredHistoryTimeout = Number(process.env.MO_MODELS_HISTORY_TIMEOUT_MS);
const HISTORY_TIMEOUT_MS =
  Number.isSafeInteger(configuredHistoryTimeout) &&
  configuredHistoryTimeout >= 1 &&
  configuredHistoryTimeout <= 5_000
    ? configuredHistoryTimeout
    : 5_000;
const HISTORY_BYTE_BUDGET = 64 * 1024 * 1024;

/** Resolving the project is one local `git` call; it may never be the slow part. */
const GIT_TIMEOUT_MS = 5_000;

/** A catalog probe runs while a human waits; the override keeps fixtures fast. */
const configuredCatalogTimeout = Number(process.env.MO_MODELS_CATALOG_TIMEOUT_MS);
const CATALOG_TIMEOUT_MS =
  Number.isSafeInteger(configuredCatalogTimeout) &&
  configuredCatalogTimeout >= 100 &&
  configuredCatalogTimeout <= 20_000
    ? configuredCatalogTimeout
    : 20_000;

const HOME = homedir();
const SETTINGS_DIR = join(HOME, ".meta-o");
const SETTINGS_FILE = join(SETTINGS_DIR, "models.json");

/**
 * Where each route's authoritative catalog comes from.
 *
 * Each `catalog` descriptor names a surface that was verified to exist and to be
 * a *listing*, never a guess. That distinction is load-bearing: `claude models`
 * is forwarded to the interactive CLI and starts an agent session on a prompt of
 * "models", and `codex models list` is an argument error. A settings editor that
 * can accidentally spend a turn is a worse bug than a missing catalog.
 *
 * Three kinds, because the three routes genuinely differ:
 *
 * - `codex-json` — `codex debug models` prints the model table as JSON, with
 *   visibility and API-support flags. That is the authoritative catalog.
 * - `lines` — `opencode models` prints one `provider/model` per line.
 * - `claude-sdk` — the Claude CLI has no listing subcommand at all. The
 *   authoritative surface is the bundled Agent SDK's
 *   `query(...).supportedModels()`, which is answered from the control-protocol
 *   handshake. Generated helpers inline the pinned SDK, so a copied skill never
 *   depends on ambient `node_modules`.
 *
 * Unavailable is never backfilled from history: presenting ten recently used ids
 * as "the available models" is exactly the lie that makes a user believe a newer
 * model does not exist.
 *
 * `exhaustive` says whether the listing is the complete set of ids the route
 * accepts, which decides whether an unlisted model is an error or a warning. Only
 * `claude-sdk` is not: it answers with aliases (`opus`, `sonnet`, `opus[1m]`)
 * while the CLI also takes versioned ids like `claude-opus-5`, so refusing what it
 * does not list would refuse selections that work.
 */
const ROUTES = {
  claude: {
    catalog: { kind: "claude-sdk", exhaustive: false },
    historyDir: join(HOME, ".claude", "projects"),
  },
  codex: {
    catalog: {
      kind: "codex-json",
      command: "codex",
      args: ["debug", "models"],
      exhaustive: true,
    },
    historyDir: join(HOME, ".codex", "sessions"),
  },
  opencode: {
    catalog: { kind: "lines", command: "opencode", args: ["models"], exhaustive: true },
    historyDir: join(HOME, ".local", "share", "opencode", "storage"),
  },
};

// ---------------------------------------------------------------------------
// Selections
// ---------------------------------------------------------------------------

/**
 * §A-DISTRIBUTION-02 splits `route/model/effort` without breaking model ids with slashes.
 *
 * `opencode/opencode/big-pickle/high` is a real selection: the route is the
 * first segment, the effort the last, and everything between is the model id.
 */
export function parseSelection(value) {
  const parts = String(value).split("/").filter(Boolean);
  if (parts.length < 3) {
    throw new Error(`selection must be route/model/effort, got "${value}"`);
  }
  const route = parts[0];
  // An unknown route is a typo, and a typo stored is a typo a preflight line
  // prints back with a straight face — there is no route to look its models up in.
  if (!Object.hasOwn(ROUTES, route)) {
    throw new Error(
      `unknown route "${route}" in "${value}"; known: ${Object.keys(ROUTES).join(", ")}`,
    );
  }
  return {
    route,
    model: parts.slice(1, -1).join("/"),
    effort: parts[parts.length - 1],
  };
}

// §A-EVAL-01: an approved testing profile has to name one exact provider model
// id at the approved effort. A floating alias resolves to whatever the provider
// ships next — possibly a far more expensive model — and a substring test on the
// generation digit also matches the tail of a release date, which is how
// `claude-sonnet-4-5-20250929` and `deepseek-v3-4-flash` passed as the approved
// generation. Required identities are closed values because an unreviewed
// suffix is a different provider model, not a harmless display variant.
const TESTING_PROFILES = {
  testClaude: {
    route: "claude",
    effort: "low",
    id: /^opus\[1m\]$/u,
    requirement: "testClaude must be claude/opus[1m]/low",
  },
  testCodex: {
    route: "codex",
    effort: "low",
    id: /^gpt-5\.6-sol$/u,
    requirement: "testCodex must be codex/gpt-5.6-sol/low",
  },
  testCodexDesired: {
    route: "codex",
    effort: "max",
    id: /^gpt-5\.6-luna$/u,
    requirement: "testCodexDesired must be codex/gpt-5.6-luna/max",
  },
  testOpenCodeDesired: {
    route: "opencode",
    effort: "low",
    matches: isApprovedQwen38_27bModel,
    requirement:
      "testOpenCodeDesired must name the configured qwen 3.8 27b model id " +
      "through opencode at low effort",
  },
};

/** §A-EVAL-01 recognizes only the configured Qwen 3.8 27B model family. */
export function isApprovedQwen38_27bModel(model) {
  const identifier = String(model).split("/").at(-1)?.toLowerCase() ?? "";
  return /^qwen[-_.]?3[._-]?8[-_.]?27b(?:[-_.][a-z0-9]+)*$/u.test(identifier);
}

/** §A-EVAL-01 rejects testing selections outside the approved low-cost routes. */
export function testingPolicyError(role, value) {
  const profile = TESTING_PROFILES[role];
  if (!profile) return null;
  const selection = typeof value === "string" ? parseSelection(value) : value;
  // An OpenCode selection carries `provider/model`; the id is the last segment.
  const identifier = selection.model.split("/").pop() ?? "";
  const namesApprovedProfile = profile.matches
    ? profile.matches(identifier)
    : profile.id.test(identifier.toLowerCase());
  if (selection.route !== profile.route || selection.effort !== profile.effort) {
    return profile.requirement;
  }
  return namesApprovedProfile ? null : profile.requirement;
}

function validateEffectiveRoles(roles) {
  for (const [role, value] of Object.entries(roles)) {
    const selection = parseSelection(value);
    const policyError = testingPolicyError(role, selection);
    if (policyError) throw new Error(policyError);
  }
}

/**
 * The repository a path belongs to, or the path itself outside a repository.
 *
 * Scoping by the repository is what makes a per-project role stick: a run
 * addressed from `repo/services/api` is the same project as one addressed from
 * `repo`, and keying on the working directory would silently hand it a fresh,
 * empty set of roles and then ask the user to choose models again.
 *
 * `--git-common-dir`, not `--show-toplevel`, because the methodology sanctions a
 * worktree for a parallel build or a destructive E2E: `--show-toplevel` answers
 * with the linked worktree, so an executor running there would arrive at an empty
 * role set — exactly the annoyance this key exists to avoid. The common dir is
 * the shared `.git`, whose parent is the main working tree, so every worktree of
 * one repository resolves to one project.
 *
 * The timeout is not decoration: preflight calls this while a human waits, and a
 * `git` on a hung network mount would otherwise block `--show` indefinitely.
 */
function projectRoot(path) {
  const resolved = realpathSync(path);
  const result = spawnSync("git", ["-C", resolved, "rev-parse", "--git-common-dir"], {
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.status !== 0) return resolved;
  const commonDir = result.stdout.trim();
  if (!commonDir) return resolved;
  // Relative for the main worktree (plain `.git`), absolute from a linked one.
  const absolute = isAbsolute(commonDir) ? commonDir : join(resolved, commonDir);
  try {
    // A bare repository has no parent working tree, so it identifies itself.
    const real = realpathSync(absolute);
    return basename(real) === ".git" ? realpathSync(dirname(real)) : real;
  } catch {
    return resolved;
  }
}

/** Project identity is the hash of the resolved root, so a move is a new key. */
function projectKey(root) {
  return createHash("sha256").update(projectRoot(root)).digest("hex");
}

/** An empty, valid settings document — the shape every write must preserve. */
function emptySettings() {
  return { schemaVersion: SCHEMA_VERSION, defaults: {}, projects: {}, dismissedUpgrades: {} };
}

/**
 * Read the settings file, refusing to interpret a schema this build predates.
 *
 * Returns `{ settings, foreignVersion }`. A foreign version yields usable
 * defaults for display and blocks every write, which is the only honest
 * behaviour: a downgrade that "fixes" the file by rewriting it loses whatever
 * the newer version was storing.
 */
function readSettings() {
  if (!existsSync(SETTINGS_FILE)) return { settings: emptySettings(), foreignVersion: null };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
  } catch (error) {
    throw new Error(`${SETTINGS_FILE} is not valid JSON: ${error.message}`, { cause: error });
  }
  if (parsed?.schemaVersion !== SCHEMA_VERSION) {
    return { settings: parsed ?? emptySettings(), foreignVersion: parsed?.schemaVersion ?? null };
  }
  return {
    settings: {
      schemaVersion: SCHEMA_VERSION,
      defaults: parsed.defaults ?? {},
      projects: parsed.projects ?? {},
      dismissedUpgrades: parsed.dismissedUpgrades ?? {},
    },
    foreignVersion: null,
  };
}

/**
 * Replace the settings file through a temporary sibling and one rename.
 *
 * This is deliberately not compare-and-swap. Concurrent invocations are not
 * coordinated and the honest semantics are last-successful-writer-wins; the
 * rename only guarantees that no reader ever sees a half-written file. Anything
 * stronger would imply this file is workflow state, which it is not.
 */
function writeSettings(settings) {
  mkdirSync(SETTINGS_DIR, { recursive: true, mode: 0o700 });
  const temporary = `${SETTINGS_FILE}.tmp-${process.pid}-${Date.now().toString(36)}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, SETTINGS_FILE);
  } catch (error) {
    if (existsSync(temporary)) {
      try {
        unlinkSync(temporary);
      } catch {
        /* the rename already failed; a leftover temp file is the lesser problem */
      }
    }
    throw error;
  }
}

/** Project roles win over defaults; unset roles are simply absent. */
function effectiveRoles(settings, key) {
  const project = key ? (settings.projects?.[key]?.roles ?? {}) : {};
  const merged = {};
  for (const role of ROLES) {
    const value = project[role] ?? settings.defaults?.[role];
    if (value) merged[role] = value;
  }
  return merged;
}

function retiredRoleLocations(settings) {
  const locations = [];
  for (const role of RETIRED_ROLES.keys()) {
    if (settings.defaults?.[role]) locations.push(`defaults.${role}`);
    for (const [project, value] of Object.entries(settings.projects ?? {})) {
      if (value?.roles?.[role]) locations.push(`projects.${project}.roles.${role}`);
    }
  }
  return locations;
}

// ---------------------------------------------------------------------------
// Catalogs and history
// ---------------------------------------------------------------------------

const unavailable = (reason) => ({
  available: false,
  models: [],
  efforts: {},
  details: {},
  reason,
});

/** One `provider/model` per line, comments and blanks dropped. */
function lineListing(descriptor) {
  const result = spawnSync(descriptor.command, descriptor.args, {
    encoding: "utf8",
    timeout: CATALOG_TIMEOUT_MS,
  });
  if (result.error || result.status !== 0) {
    return unavailable(result.error?.message ?? `${descriptor.command} listing failed`);
  }
  const models = dedupe(
    String(result.stdout)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  ).sort();
  return models.length > 0
    ? { available: true, models, efforts: {}, details: {}, reason: null }
    : unavailable("empty listing");
}

/**
 * §A-DISTRIBUTION-02 turns `codex debug models` output into a listing.
 *
 * Only rows the CLI itself would offer are kept: `visibility: "list"` and
 * `supported_in_api`. An internal or retired slug would otherwise be proposed as
 * an upgrade and then fail at session start, which is worse than not knowing
 * about it. Separated from the spawn so the filter can be tested on a fixture.
 */
export function parseCodexModels(text) {
  const source = String(text);
  const json = firstJsonObject(source);
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return unavailable(`codex debug models returned unparseable JSON: ${error.message}`);
  }
  const rows = (parsed?.models ?? []).filter(
    (model) => model?.visibility === "list" && model?.supported_in_api === true,
  );
  const efforts = Object.fromEntries(
    rows
      .map((model) => [
        model.slug,
        (model.supported_reasoning_levels ?? []).map(({ effort }) => effort).filter(Boolean),
      ])
      .filter(([, levels]) => levels.length > 0),
  );
  const details = Object.fromEntries(
    rows.map((model) => [
      model.slug,
      {
        label: model.display_name ?? model.name ?? null,
        description: model.description ?? null,
        capabilities: model.capabilities ?? null,
      },
    ]),
  );
  const models = dedupe(rows.map((model) => model.slug).filter(Boolean)).sort();
  return models.length > 0
    ? { available: true, models, efforts, details, reason: null }
    : unavailable("no listable models");
}

/** Return the first balanced JSON object while ignoring braces inside strings. */
function firstJsonObject(source) {
  const start = source.indexOf("{");
  let end = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index >= 0 && index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      end = index + 1;
      break;
    }
  }
  return start >= 0 && end > start ? source.slice(start, end) : source;
}

function codexJsonListing(descriptor) {
  const result = spawnSync(descriptor.command, descriptor.args, {
    encoding: "utf8",
    timeout: CATALOG_TIMEOUT_MS,
  });
  if (result.error || result.status !== 0) {
    return unavailable(result.error?.message ?? "codex debug models failed");
  }
  return parseCodexModels(result.stdout);
}

/**
 * Resolve the system Claude executable without consulting package-local bins.
 *
 * The bundled SDK contains JavaScript only. Pointing it at the launch posture
 * already selected through PATH prevents its package's optional native Claude
 * payload from becoming a second provider installation with different trust or
 * permission behavior.
 */
function resolveSystemClaude() {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const directory of String(process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `claude${extension}`);
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      } catch {
        /* an unreadable PATH entry is not a usable provider */
      }
    }
  }
  return null;
}

/**
 * `query(...).supportedModels()` — the Claude route's only authoritative list.
 *
 * The prompt is an async generator that never yields, so the SDK completes the
 * control-protocol handshake, answers from it, and no turn is ever sent. The
 * query is then interrupted and returned. This is the one place the helper
 * starts a provider process, and it must stay incapable of spending a token.
 */
async function claudeSdkListing() {
  const claudeExecutable = resolveSystemClaude();
  if (!claudeExecutable) return unavailable("system claude executable not found on PATH");
  const abortController = new AbortController();
  const neverPrompts = async function* () {
    await new Promise(() => {});
    yield undefined;
  };
  const query = claudeQuery({
    prompt: neverPrompts(),
    options: {
      permissionMode: "bypassPermissions",
      maxTurns: 1,
      pathToClaudeCodeExecutable: claudeExecutable,
      abortController,
    },
  });
  let listing;
  let listingFailure = null;
  let cleanupFailure = null;
  try {
    // The prompt never yields on purpose, so a handshake that never answers would
    // hang this process forever. Preflight calls this while a human waits.
    const supported = await Promise.race([
      query.supportedModels(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`no answer within ${CATALOG_TIMEOUT_MS}ms`)),
          CATALOG_TIMEOUT_MS,
        ).unref?.(),
      ),
    ]);
    const efforts = {};
    const details = {};
    for (const model of supported) {
      const levels = model.supportedEffortLevels ?? [];
      if (levels.length > 0) efforts[model.value] = levels;
      details[model.value] = {
        label: model.displayName ?? model.display_name ?? null,
        description: model.description ?? null,
        capabilities: model.capabilities ?? null,
      };
    }
    const models = dedupe(supported.map((model) => model.value).filter(Boolean)).sort();
    listing =
      models.length > 0
        ? { available: true, models, efforts, details, reason: null }
        : unavailable("SDK reported no supported models");
  } catch (error) {
    listingFailure = error;
  } finally {
    abortController.abort();
    const cleanup = [query.interrupt?.(), query.return?.(undefined)].filter(Boolean);
    const cleanupCompleted = await Promise.race([
      Promise.allSettled(cleanup).then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 1_000).unref?.()),
    ]);
    if (!cleanupCompleted) cleanupFailure = new Error("SDK query did not close within 1000ms");
  }
  if (cleanupFailure) {
    return unavailable(`supportedModels() cleanup failed: ${cleanupFailure.message}`);
  }
  if (listingFailure) {
    return unavailable(`supportedModels() failed: ${listingFailure.message}`);
  }
  return listing;
}

/**
 * Ask one route's own tooling what models it offers.
 *
 * A missing binary, a non-zero exit, an unresolvable SDK or an empty listing all
 * mean "this route cannot tell us", which the caller must surface rather than
 * paper over.
 */
async function routeCatalog(route) {
  const descriptor = ROUTES[route]?.catalog;
  if (!descriptor) return unavailable("no listing surface");
  switch (descriptor.kind) {
    case "lines":
      return lineListing(descriptor);
    case "codex-json":
      return codexJsonListing(descriptor);
    case "claude-sdk":
      return claudeSdkListing();
    default:
      return unavailable(`unknown catalog kind "${descriptor.kind}"`);
  }
}

/** Every regular non-symlink `.jsonl` under a directory, newest first. */
function recentSessionFiles(directory, started) {
  const timedOut = () => Date.now() - started >= HISTORY_TIMEOUT_MS;
  if (!directory || !existsSync(directory)) {
    return { files: [], unreadable: [], truncated: [], missing: true, timedOut: false };
  }
  const cutoff = started - HISTORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const found = [];
  const unreadable = [];
  const truncated = [];
  let deadlineReached = timedOut();
  const walk = (path, depth) => {
    if (deadlineReached) return;
    if (depth > 6) {
      truncated.push(relative(directory, path) || ".");
      return;
    }
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      unreadable.push(relative(directory, path) || ".");
      return;
    }
    for (const entry of entries) {
      if (timedOut()) {
        deadlineReached = true;
        return;
      }
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        walk(child, depth + 1);
      } else if (entry.isSymbolicLink()) {
        continue;
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        try {
          const { mtimeMs } = statSync(child);
          if (mtimeMs >= cutoff) found.push({ path: child, mtimeMs });
        } catch {
          unreadable.push(relative(directory, child));
        }
      }
    }
  };
  walk(directory, 0);
  found.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  return {
    files: found.map((entry) => entry.path),
    unreadable,
    truncated,
    missing: false,
    timedOut: deadlineReached,
  };
}

/**
 * Effective model ids seen in a route's recent sessions.
 *
 * These are hints about what the user actually runs — useful for spotting a
 * newer generation the settings have not caught up with. They are never
 * presented as the route's catalog.
 */
function collectModels(route, value, seen) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const candidates = {
    claude: [value.model, value.message?.model],
    codex: [
      value.model,
      new Set(["session_meta", "turn_context"]).has(value.type) ? value.payload?.model : null,
    ],
    opencode: [value.model, value.info?.modelID, value.session?.model],
  }[route];
  for (const model of candidates ?? []) {
    if (typeof model === "string" && model.trim() !== "") seen.push(model);
  }
}

function collectHistoryLine(route, line, state) {
  if (!line.trim()) return;
  try {
    collectModels(route, JSON.parse(line), state.seen);
  } catch {
    state.corrupt = true;
  }
}

async function scanHistoryFile(route, file, state, started) {
  const stream = createReadStream(file);
  stream.setEncoding("utf8");
  let carry = "";
  for await (const chunk of stream) {
    state.bytesRead += Buffer.byteLength(chunk, "utf8");
    if (state.bytesRead > HISTORY_BYTE_BUDGET) {
      state.stopReason = "partial";
      stream.destroy();
      break;
    }
    carry += chunk;
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    lines.forEach((line) => collectHistoryLine(route, line, state));
    if (Date.now() - started >= HISTORY_TIMEOUT_MS) {
      state.stopReason = "timeout";
      stream.destroy();
      break;
    }
  }
  if (carry.trim() && state.stopReason === "ok") collectHistoryLine(route, carry, state);
}

async function routeHistory(route) {
  const directory = ROUTES[route]?.historyDir;
  const started = Date.now();
  const discovery = recentSessionFiles(directory, started);
  const unreadable = [...discovery.unreadable];
  const truncated = [...discovery.truncated];
  let scannedFiles = 0;
  const state = {
    seen: [],
    bytesRead: 0,
    corrupt: false,
    stopReason: discovery.missing ? "unavailable" : discovery.timedOut ? "timeout" : "ok",
  };

  for (const file of discovery.files) {
    if (Date.now() - started >= HISTORY_TIMEOUT_MS) {
      state.stopReason = "timeout";
      break;
    }
    try {
      await scanHistoryFile(route, file, state, started);
      scannedFiles += 1;
    } catch {
      unreadable.push(relative(directory, file));
    }
    if (state.stopReason === "timeout" || state.stopReason === "partial") break;
  }
  if (state.stopReason === "ok" && unreadable.length > 0) state.stopReason = "partial";
  if (state.stopReason === "ok" && truncated.length > 0) state.stopReason = "partial";
  if (state.stopReason === "ok" && state.corrupt) state.stopReason = "corrupt";
  return {
    complete: state.stopReason === "ok",
    models: dedupe(state.seen).sort(),
    scannedFiles,
    unreadableFiles: dedupe(unreadable).sort().slice(0, 20),
    truncatedDirectories: dedupe(truncated).sort().slice(0, 20),
    bytesRead: state.bytesRead,
    elapsedMs: Date.now() - started,
    stopReason: state.stopReason,
  };
}

function dedupe(values) {
  return [...new Set(values)];
}

function eligibleRecommendations(provider) {
  return provider.catalog.models.filter(
    ({ label, description, capabilities, efforts }) =>
      efforts.includes("high") &&
      (/(?:^|[^\p{L}\p{N}_])(?:code|coding|software(?:[ -]engineering)?)(?:$|[^\p{L}\p{N}_])/iu.test(
        [label, description].filter((value) => typeof value === "string").join(" "),
      ) ||
        (Array.isArray(capabilities) ? capabilities : [capabilities])
          .filter((value) => typeof value === "string")
          .map((value) => value.trim().toLowerCase().replace(/[ _]+/gu, "-"))
          .some((value) =>
            new Set(["code", "coding", "software", "software-engineering"]).has(value),
          )),
  );
}

function defaultRecommendation(provider) {
  const eligible = eligibleRecommendations(provider);
  if (eligible.length === 1) return eligible[0];
  const recentlyUsed = new Set(provider.history.models);
  const recent = eligible.filter(({ id }) => recentlyUsed.has(id));
  if (recent.length === 1) return recent[0];
  return null;
}

function noRecommendationReason(provider) {
  const eligible = eligibleRecommendations(provider);
  return eligible.length === 0
    ? "catalog_has_no_admissible_coding_positioning_evidence"
    : `catalog_has_${eligible.length}_ambiguous_admissible_candidates`;
}

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------

/**
 * §A-DISTRIBUTION-02 splits a model id into a family and comparable generation.
 *
 * `claude-opus-4-8` is family `claude-opus` at 4.8; `gpt-5.6` is family `gpt`
 * at 5.6. Anything without a trailing numeric generation has none, and takes no
 * part in upgrade comparison.
 */
export function familyAndGeneration(model) {
  const id = String(model).split("/").pop() ?? "";
  const match = id.match(/^(.*?)[-_]?(\d+(?:[.\-_]\d+)*)$/);
  if (!match) return { family: id, generation: null };
  const family = match[1].replace(/[-_]$/, "");
  const generation = match[2].split(/[.\-_]/).map((part) => Number.parseInt(part, 10));
  return { family, generation };
}

function compareGenerations(a, b) {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/**
 * §A-DISTRIBUTION-02 proposes a successor only within the same family.
 *
 * A newer release generation of what the user already chose is evidence. A
 * sibling family — opus to sonnet, or the reverse — is a different trade-off
 * the user made deliberately, and suggesting it is noise dressed as an upgrade.
 */
export function findUpgrade(current, availableModels) {
  const chosen = familyAndGeneration(current.model);
  if (!chosen.generation) return null;
  let best = null;
  for (const candidate of availableModels) {
    const other = familyAndGeneration(candidate);
    if (other.family !== chosen.family || !other.generation) continue;
    if (compareGenerations(other.generation, chosen.generation) <= 0) continue;
    if (!best || compareGenerations(other.generation, familyAndGeneration(best).generation) > 0) {
      best = candidate;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** One line with every role — the default startup question, not a report. */
function commandShow(settings, key, asJson) {
  const roles = effectiveRoles(settings, key);
  validateEffectiveRoles(roles);
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ roles }, null, 2)}\n`);
    return;
  }
  const parts = ROLES.map((role) => `${role}=${roles[role] ?? "unset"}`);
  process.stdout.write(`${parts.join("  ")}\n`);
}

/** The full catalog, printed only when asked for, with gaps named as gaps. */
async function commandCatalog(routeFilter, asJson) {
  // Filtering by a route that does not exist would print an empty report, which
  // reads as "this route has no models" rather than "you misspelled it".
  if (routeFilter !== null && !Object.hasOwn(ROUTES, routeFilter)) {
    throw new Error(`unknown route "${routeFilter}"; known: ${Object.keys(ROUTES).join(", ")}`);
  }
  const providers = [];
  for (const route of Object.keys(ROUTES)) {
    if (routeFilter && route !== routeFilter) continue;
    const catalog = await routeCatalog(route);
    const history = await routeHistory(route);
    providers.push({
      route,
      catalog: {
        status: catalog.available ? "ok" : "unavailable",
        exhaustive: ROUTES[route].catalog?.exhaustive === true,
        models: catalog.models.map((id) => ({
          id,
          label: catalog.details[id]?.label ?? null,
          description: catalog.details[id]?.description ?? null,
          capabilities: catalog.details[id]?.capabilities ?? null,
          efforts: catalog.efforts[id] ?? [],
          sourceKind: ROUTES[route].catalog?.kind ?? null,
        })),
        reason: catalog.available ? null : catalog.reason,
      },
      history,
    });
  }
  const report = { contract: "meta-o.model-discovery.v2", providers };
  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  for (const provider of providers) {
    if (provider.catalog.status === "ok") {
      process.stdout.write(
        `${provider.route}: ${provider.catalog.models.length} models ` +
          `(via ${provider.catalog.models[0]?.sourceKind ?? "unknown"})\n`,
      );
      for (const model of provider.catalog.models) {
        process.stdout.write(
          `  ${model.id}${model.efforts.length > 0 ? `  [${model.efforts.join(" ")}]` : ""}\n`,
        );
      }
    } else {
      process.stdout.write(`${provider.route}: catalog unavailable (${provider.catalog.reason})\n`);
    }
    if (provider.history.models.length > 0) {
      process.stdout.write(
        `  recently used (${provider.history.scannedFiles} files, hint only, not a catalog): ` +
          `${provider.history.models.join(", ")}\n`,
      );
    }
    if (!provider.history.complete) {
      process.stdout.write(`  history incomplete (${provider.history.stopReason})\n`);
    }
    const preferred = defaultRecommendation(provider);
    if (preferred) {
      process.stdout.write(
        `  default recommendation: ${provider.route}/${preferred.id}/high ` +
          `(catalog coding-positioning evidence)\n`,
      );
    } else if (new Set(["codex", "claude"]).has(provider.route)) {
      process.stdout.write(`  no_default_recommendation (${noRecommendationReason(provider)})\n`);
    }
  }
}

/**
 * Check selections against the routes' own catalogs, where a route can answer.
 *
 * The grammar check alone accepts `codex/gpt-5.6-sol/not-an-effort`, and a stored
 * effort the model does not offer becomes a run that fails at the first prompt —
 * long after the preflight line said the model set was fine. So the authoritative
 * catalog decides, and when it cannot be reached the value is stored with the gap
 * named out loud rather than silently blessed.
 *
 * Throws before anything is written; `--force` skips the probe entirely, which is
 * the honest escape hatch for a model a listing does not know about yet.
 */
async function verifySelections(parsed) {
  const byRoute = new Map();
  for (const entry of parsed) {
    const selection = parseSelection(entry.value);
    if (!byRoute.has(selection.route)) byRoute.set(selection.route, []);
    byRoute.get(selection.route).push({ ...entry, selection });
  }

  for (const [route, entries] of byRoute) {
    const catalog = await routeCatalog(route);
    if (!catalog.available) {
      process.stderr.write(
        `mo-models: the ${route} catalog is unavailable (${catalog.reason}), so ` +
          `${entries.map((entry) => entry.value).join(", ")} ` +
          `${entries.length > 1 ? "were" : "was"} stored unverified\n`,
      );
      continue;
    }
    const exhaustive = ROUTES[route].catalog?.exhaustive === true;
    for (const { selection } of entries) {
      if (!catalog.models.includes(selection.model)) {
        if (exhaustive) {
          throw new Error(
            `"${selection.model}" is not in the ${route} catalog of ${catalog.models.length} ` +
              `models. Run --catalog --route ${route} to see them, or --force to store it anyway.`,
          );
        }
        // The listing is not the whole set of accepted ids, so an unlisted model
        // is unverifiable rather than wrong. Said out loud, and stored.
        process.stderr.write(
          `mo-models: the ${route} listing does not name "${selection.model}", and it is not a ` +
            `complete list of accepted ids, so the selection was stored unverified\n`,
        );
        continue;
      }
      const levels = catalog.efforts[selection.model];
      if (levels && !levels.includes(selection.effort)) {
        throw new Error(
          `${route}/${selection.model} offers effort ${levels.join(", ")} — not ` +
            `"${selection.effort}". Use one of those, or --force to store it anyway.`,
        );
      }
    }
  }
}

/**
 * Apply role assignments — the only path that adds a selection to the file.
 *
 * Everything is decided before the write: the role name, the grammar, and the
 * catalog check. That ordering is the whole point of the function existing rather
 * than each caller assembling its own update, because a half-applied `--set`
 * leaves a settings file that names a model no run can use, and the user has no
 * way to tell which of their two assignments survived.
 */
async function commandSet(settings, key, assignments, useDefaults, force) {
  const parsed = assignments.map((assignment) => {
    const index = assignment.indexOf("=");
    if (index < 0) throw new Error(`--set expects role=route/model/effort, got "${assignment}"`);
    const role = assignment.slice(0, index);
    if (!ROLES.includes(role)) {
      throw new Error(`unknown role "${role}"; roles are ${ROLES.join(", ")}`);
    }
    const value = assignment.slice(index + 1);
    parseSelection(value);
    const policyError = testingPolicyError(role, value);
    if (policyError) throw new Error(policyError);
    return { role, value };
  });

  if (force) {
    process.stderr.write("mo-models: --force, so no catalog was consulted\n");
  } else {
    await verifySelections(parsed);
  }

  const target = useDefaults
    ? (settings.defaults ??= {})
    : ((settings.projects ??= {}),
      (settings.projects[key] ??= { roles: {}, updatedAt: null }),
      (settings.projects[key].roles ??= {}));

  for (const { role, value } of parsed) target[role] = value;
  if (!useDefaults) settings.projects[key].updatedAt = new Date().toISOString();
  writeSettings(settings);
  commandShow(settings, key, false);
}

/** Remove a role override so the layer below it applies again. */
function commandUnset(settings, key, roles, useDefaults) {
  for (const role of roles) {
    if (!ROLES.includes(role) && !RETIRED_ROLES.has(role)) {
      throw new Error(`unknown role "${role}"`);
    }
    if (useDefaults) delete settings.defaults?.[role];
    else delete settings.projects?.[key]?.roles?.[role];
  }
  if (!useDefaults && settings.projects?.[key]) {
    settings.projects[key].updatedAt = new Date().toISOString();
  }
  writeSettings(settings);
  commandShow(settings, key, false);
}

/**
 * Report same-family successors that are not already dismissed.
 *
 * The catalog and the recent-session hints are unioned here on purpose: a route
 * whose catalog is unavailable can still notice that the user has been running a
 * newer generation than their settings name. What is never done is the reverse —
 * calling that union "the catalog".
 */
async function commandCheckUpgrades(settings, key, asJson) {
  const roles = effectiveRoles(settings, key);
  const available = new Map();
  const proposals = [];
  for (const [role, value] of Object.entries(roles)) {
    let current;
    try {
      current = parseSelection(value);
    } catch {
      continue;
    }
    if (!available.has(current.route)) {
      const catalog = await routeCatalog(current.route);
      const history = await routeHistory(current.route);
      available.set(current.route, dedupe([...catalog.models, ...history.models]));
    }
    const successor = findUpgrade(current, available.get(current.route) ?? []);
    if (!successor) continue;
    const id = `${current.route}/${successor}`;
    if (settings.dismissedUpgrades?.[id]) continue;
    proposals.push({ role, from: current.model, to: successor, id });
  }
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ proposals }, null, 2)}\n`);
    return;
  }
  if (proposals.length === 0) {
    process.stdout.write("no successor generation found for any role\n");
    return;
  }
  for (const proposal of proposals) {
    process.stdout.write(
      `${proposal.role}: ${proposal.from} -> ${proposal.to}  (${proposal.id})\n`,
    );
  }
}

/** Silence one proposal permanently; the selection itself is untouched. */
function commandDismissUpgrade(settings, id) {
  settings.dismissedUpgrades ??= {};
  settings.dismissedUpgrades[id] = new Date().toISOString();
  writeSettings(settings);
  process.stdout.write(`dismissed ${id}\n`);
}

const USAGE = `mo-models — read and edit ~/.meta-o/models.json

  mo-models.mjs [--show]                       one line, every role
  mo-models.mjs --catalog [--route <route>]    full catalog, printed on request only
  mo-models.mjs --set <role>=<route/model/effort> [--set ...] [--global] [--force]
  mo-models.mjs --unset <role> [--unset ...] [--global]
  mo-models.mjs --check-upgrades
  mo-models.mjs --dismiss-upgrade <id>

  --project <path>   a path inside the project (default: cwd); roles are scoped
                     to its Git root, so any subdirectory means the same project
  --global           write to defaults instead of this project
  --force            store a selection without consulting the route's catalog
  --json             machine-readable output

A --set is checked against the route's own catalog: an unknown model, or an
effort the model does not offer, is refused before anything is written. Where the
catalog cannot be reached the value is stored and the gap is printed.

Roles: ${ROLES.join(", ")}

Catalog sources, in the routes' own words:
  codex     codex debug models          (JSON; listable, API-supported rows only)
  opencode  opencode models
  claude    @anthropic-ai/claude-agent-sdk -> query(...).supportedModels()
            The pinned SDK is bundled into generated skills and drives the first
            system claude on PATH. No turn is ever sent: the prompt never yields.

This tool sends no prompt, runs no agent turn, and reads no stdin.
`;

function parseArgv(argv) {
  const options = {
    show: false,
    catalog: false,
    checkUpgrades: false,
    dismissUpgrade: null,
    set: [],
    unset: [],
    route: null,
    project: process.cwd(),
    global: false,
    force: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${argument} needs a value`);
      index += 1;
      return value;
    };
    switch (argument) {
      case "--show":
        options.show = true;
        break;
      case "--catalog":
        options.catalog = true;
        break;
      case "--check-upgrades":
        options.checkUpgrades = true;
        break;
      case "--dismiss-upgrade":
        options.dismissUpgrade = next();
        break;
      case "--set":
        options.set.push(next());
        break;
      case "--unset":
        options.unset.push(next());
        break;
      case "--route":
        options.route = next();
        break;
      case "--project":
        options.project = next();
        break;
      case "--global":
        options.global = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`unknown argument "${argument}"`);
    }
  }
  return options;
}

/**
 * Entry point.
 *
 * Every failure leaves the settings file exactly as it was: validation happens
 * before the single write, and the write itself is a rename. A helper that
 * corrupts the one preference the user maintains by hand would cost more than
 * it ever saved.
 */
async function main() {
  let options;
  try {
    options = parseArgv(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${basename(process.argv[1])}: ${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  let settings;
  let foreignVersion;
  try {
    ({ settings, foreignVersion } = readSettings());
  } catch (error) {
    process.stderr.write(`mo-models: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const writes = options.set.length > 0 || options.unset.length > 0 || options.dismissUpgrade;
  if (foreignVersion !== null) {
    // Said out loud even when only reading. Without this, `--show` prints
    // whatever version 1 recognises in a newer file and looks exactly like a
    // complete answer — so a user confirms a role set that may be missing
    // everything the newer version stores differently.
    process.stderr.write(
      `mo-models: ${SETTINGS_FILE} has schemaVersion ${foreignVersion}, this build understands ` +
        `${SCHEMA_VERSION}. ${
          writes
            ? "Refusing to write; your settings are untouched.\n"
            : "Reading only the fields version 1 knows; anything newer is ignored.\n"
        }`,
    );
    if (writes) {
      process.exitCode = 1;
      return;
    }
  }

  for (const location of retiredRoleLocations(settings)) {
    const role = location.split(".").at(-1);
    process.stderr.write(
      `mo-models: retired settings role ${location} is ignored; ${RETIRED_ROLES.get(role)}.\n`,
    );
  }

  try {
    // Resolved on demand: `--catalog` and `--dismiss-upgrade` are not scoped to a
    // project, and neither should pay for a `git` call to learn which one it is.
    let cached = null;
    const key = () => (cached ??= projectKey(options.project));

    if (options.catalog) await commandCatalog(options.route, options.json);
    else if (options.checkUpgrades) await commandCheckUpgrades(settings, key(), options.json);
    else if (options.dismissUpgrade) commandDismissUpgrade(settings, options.dismissUpgrade);
    else if (options.set.length > 0) {
      await commandSet(settings, key(), options.set, options.global, options.force);
    } else if (options.unset.length > 0) {
      commandUnset(settings, key(), options.unset, options.global);
    } else commandShow(settings, key(), options.json);
  } catch (error) {
    process.stderr.write(`mo-models: ${error.message}\n`);
    process.exitCode = 1;
  }
}

/**
 * Run only when invoked as a program.
 *
 * The pure helpers above are exported so tests can exercise the selection
 * grammar and the upgrade rule without a subprocess and without a real HOME.
 */
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  // A rejected top-level promise would exit 0 on some Node versions; a settings
  // editor that reports success after failing is the one outcome to rule out.
  main().catch((error) => {
    process.stderr.write(`mo-models: ${error.message}\n`);
    process.exitCode = 1;
  });
}
