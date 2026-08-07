/**
 * Tests for the shipped settings helper.
 *
 * The pure rules — the selection grammar and the same-family upgrade rule — are
 * tested by import. Everything that touches the settings file is tested through
 * the real CLI with HOME pointed at a temporary directory, because "does not
 * corrupt the user's settings" is a property of the process, not of a function.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  familyAndGeneration,
  findUpgrade,
  parseCodexModels,
  parseSelection,
} from "../shared/scripts/mo-models.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(ROOT, "shared", "scripts", "mo-models.mjs");
const sandboxes = [];

/** A throwaway HOME, so no test can read or write the real settings file. */
function sandbox() {
  const home = mkdtempSync(join(tmpdir(), "mo-models-test-"));
  sandboxes.push(home);
  return home;
}

/**
 * Why almost every `--set` below passes `--force`.
 *
 * A write now checks the selection against the route's own catalog, so an
 * unforced `--set` of a made-up id like `claude/a-1/high` would depend on what
 * this machine's CLIs answer. These tests are about the settings file, not about
 * a live catalog: `--force` is what keeps them hermetic. The catalog check itself
 * is tested separately, and against a real catalog.
 */
function run(home, args, cwd = ROOT) {
  return spawnSync(process.execPath, [HELPER, ...args], {
    encoding: "utf8",
    cwd,
    env: { ...process.env, HOME: home },
  });
}

after(() => {
  for (const home of sandboxes) rmSync(home, { recursive: true, force: true });
});

/**
 * Why the two live-probe tests below are conditional.
 *
 * They assert what a *machine* answers, not what this code does: one needs the
 * `codex` CLI installed, the other needs the Claude SDK to be absent. Run
 * unconditionally they would fail on a correct checkout — a red gate that says
 * nothing about the code is worse than a skip that says what was not proven.
 */
function commandMissing(command) {
  // `/bin/sh -c`, not `shell: true` with an argument array: Node 24 deprecates
  // that combination (DEP0190) and the warning would land inside `make mo-qc`.
  return spawnSync("/bin/sh", ["-c", `command -v ${command}`]).status !== 0
    ? `${command} is not installed on this machine`
    : false;
}

/** True when the optional SDK resolves globally, which defeats the gap test. */
function sdkResolvesGlobally() {
  const result = spawnSync("npm", ["root", "-g"], { encoding: "utf8" });
  if (result.status !== 0) return false;
  return existsSync(join(result.stdout.trim(), "@anthropic-ai", "claude-agent-sdk"));
}

test("a selection needs a route, a model and an effort", () => {
  assert.deepEqual(parseSelection("claude/claude-opus-5/high"), {
    route: "claude",
    model: "claude-opus-5",
    effort: "high",
  });
  assert.throws(() => parseSelection("claude/high"), /route\/model\/effort/);
  assert.throws(() => parseSelection("claude"), /route\/model\/effort/);
});

test("a model id containing slashes survives parsing", () => {
  assert.deepEqual(parseSelection("opencode/opencode/big-pickle/medium"), {
    route: "opencode",
    model: "opencode/big-pickle",
    effort: "medium",
  });
});

test("generation is parsed from the trailing numbers only", () => {
  assert.deepEqual(familyAndGeneration("claude-opus-4-8"), {
    family: "claude-opus",
    generation: [4, 8],
  });
  assert.deepEqual(familyAndGeneration("gpt-5.6"), { family: "gpt", generation: [5, 6] });
  assert.equal(familyAndGeneration("some-model").generation, null);
});

test("an upgrade is proposed only inside the same family", () => {
  const current = parseSelection("claude/claude-opus-4-8/high");
  assert.equal(findUpgrade(current, ["claude-opus-5"]), "claude-opus-5");
  assert.equal(findUpgrade(current, ["claude-sonnet-9"]), null, "sibling family is not an upgrade");
  assert.equal(
    findUpgrade(current, ["claude-opus-4-1"]),
    null,
    "older generation is not an upgrade",
  );
  assert.equal(findUpgrade(current, ["claude-opus-4-8"]), null, "the same generation is not one");
});

test("the highest successor wins when several exist", () => {
  const current = parseSelection("codex/gpt-5.4/high");
  assert.equal(findUpgrade(current, ["gpt-5.5", "gpt-5.6", "gpt-5.4"]), "gpt-5.6");
});

test("show reports every role and writes nothing", () => {
  const home = sandbox();
  const result = run(home, ["--show"]);
  assert.equal(result.status, 0, result.stderr);
  for (const role of ["executor", "researcher", "reviewerA", "reviewerB", "e2eTester"]) {
    assert.match(result.stdout, new RegExp(`${role}=unset`));
  }
  assert.equal(run(home, ["--show"]).status, 0);
  assert.throws(() => readFileSync(join(home, ".meta-o", "models.json")), /ENOENT/);
});

test("set then show round-trips through the settings file", () => {
  const home = sandbox();
  assert.equal(run(home, ["--set", "executor=claude/claude-opus-5/high", "--force"]).status, 0);
  const shown = run(home, ["--show"]);
  assert.match(shown.stdout, /executor=claude\/claude-opus-5\/high/);

  const stored = JSON.parse(readFileSync(join(home, ".meta-o", "models.json"), "utf8"));
  assert.equal(stored.schemaVersion, 1);
  assert.deepEqual(Object.keys(stored), [
    "schemaVersion",
    "defaults",
    "projects",
    "dismissedUpgrades",
  ]);
  const [project] = Object.values(stored.projects);
  assert.equal(project.roles.executor, "claude/claude-opus-5/high");
  assert.match(project.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("the settings file holds no run state", () => {
  const home = sandbox();
  run(home, ["--set", "executor=claude/claude-opus-5/high", "--force"]);
  const text = readFileSync(join(home, ".meta-o", "models.json"), "utf8");
  for (const forbidden of ["candidate", "gate", "finding", "runId", "session", "sha"]) {
    assert.ok(!text.toLowerCase().includes(forbidden), `models.json must not mention ${forbidden}`);
  }
});

test("a project override wins over the global default", () => {
  const home = sandbox();
  const other = mkdtempSync(join(tmpdir(), "mo-models-project-"));
  sandboxes.push(other);
  assert.equal(run(home, ["--set", "executor=claude/a-1/high", "--global", "--force"]).status, 0);
  assert.equal(run(home, ["--set", "executor=codex/b-2/high", "--force"]).status, 0);
  assert.match(run(home, ["--show"]).stdout, /executor=codex\/b-2\/high/);
  assert.match(run(home, ["--show"], other).stdout, /executor=claude\/a-1\/high/);
});

test("unset falls back to the layer below", () => {
  const home = sandbox();
  run(home, ["--set", "executor=claude/a-1/high", "--global", "--force"]);
  run(home, ["--set", "executor=codex/b-2/high", "--force"]);
  assert.equal(run(home, ["--unset", "executor"]).status, 0);
  assert.match(run(home, ["--show"]).stdout, /executor=claude\/a-1\/high/);
});

test("an unknown role or a malformed selection is refused before any write", () => {
  const home = sandbox();
  const badRole = run(home, ["--set", "reviewer=claude/a-1/high"]);
  assert.equal(badRole.status, 1);
  assert.match(badRole.stderr, /unknown role/);

  const badValue = run(home, ["--set", "executor=claude/a-1", "--set", "reviewerA=codex/b-2/high"]);
  assert.equal(badValue.status, 1);
  assert.throws(
    () => readFileSync(join(home, ".meta-o", "models.json")),
    /ENOENT/,
    "one bad assignment must not persist the good one beside it",
  );
});

test("an unknown flag is an error, not a silent default", () => {
  const home = sandbox();
  const result = run(home, ["--no-such-flag"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown argument/);
});

test("a newer schemaVersion is never overwritten", () => {
  const home = sandbox();
  run(home, ["--set", "executor=claude/a-1/high", "--force"]);
  const path = join(home, ".meta-o", "models.json");
  const future = { schemaVersion: 99, defaults: { executor: "claude/future-9/high" }, extra: true };
  writeFileSync(path, `${JSON.stringify(future, null, 2)}\n`);

  const write = run(home, ["--set", "executor=claude/a-1/high", "--force"]);
  assert.equal(write.status, 1);
  assert.match(write.stderr, /schemaVersion 99/);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), future, "the file must be untouched");

  const show = run(home, ["--show"]);
  assert.equal(show.status, 0, "reading must still work");
  assert.match(show.stdout, /executor=claude\/future-9\/high/);
  assert.match(
    show.stderr,
    /schemaVersion 99/,
    "a read of a file this build cannot fully interpret must say so",
  );
});

test("invalid JSON is reported, not repaired", () => {
  const home = sandbox();
  run(home, ["--set", "executor=claude/a-1/high", "--force"]);
  const path = join(home, ".meta-o", "models.json");
  writeFileSync(path, "{ not json");
  const result = run(home, ["--show"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not valid JSON/);
  assert.equal(readFileSync(path, "utf8"), "{ not json");
});

test("dismissing an upgrade records it without touching the selection", () => {
  const home = sandbox();
  run(home, ["--set", "executor=claude/a-1/high", "--force"]);
  assert.equal(run(home, ["--dismiss-upgrade", "claude/a-2"]).status, 0);
  const stored = JSON.parse(readFileSync(join(home, ".meta-o", "models.json"), "utf8"));
  assert.ok(stored.dismissedUpgrades["claude/a-2"]);
  assert.equal(Object.values(stored.projects)[0].roles.executor, "claude/a-1/high");
});

test("a catalog probe is never a provider's interactive entry point", () => {
  // `claude models` is forwarded to the interactive CLI and starts an agent turn
  // on the prompt "models"; `codex models list` is an argument error. Every
  // command probed here must be a verified listing, and the Claude route must go
  // through the SDK rather than a subcommand that does not exist.
  const source = readFileSync(join(ROOT, "shared", "scripts", "mo-models.mjs"), "utf8");
  const commands = [...source.matchAll(/command:\s*"([^"]+)",\s*args:\s*\[([^\]]*)\]/g)].map(
    (match) => `${match[1]} ${match[2].replace(/["']/g, "").replace(/,\s*/g, " ")}`,
  );
  assert.deepEqual(commands.sort(), ["codex debug models", "opencode models"]);
  assert.match(source, /kind:\s*"claude-sdk",\s*package:\s*"@anthropic-ai\/claude-agent-sdk"/);

  // Only the Claude route may be non-exhaustive: it answers with aliases while
  // the CLI also accepts versioned ids, so an unlisted model there is a warning.
  // Marking a real listing non-exhaustive would quietly disable the model check.
  assert.match(source, /kind:\s*"claude-sdk"[^}]*exhaustive:\s*false/);
  assert.equal([...source.matchAll(/exhaustive:\s*false/g)].length, 1);
  assert.equal([...source.matchAll(/exhaustive:\s*true/g)].length, 2);
});

test("codex listings keep only the rows the CLI itself would offer", () => {
  const fixture = JSON.stringify({
    models: [
      {
        slug: "gpt-9.9",
        visibility: "list",
        supported_in_api: true,
        supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }],
      },
      { slug: "internal-only", visibility: "hidden", supported_in_api: true },
      { slug: "no-api", visibility: "list", supported_in_api: false },
    ],
  });
  const listing = parseCodexModels(fixture);
  assert.deepEqual(listing.models, ["gpt-9.9"], "hidden and API-unsupported rows are dropped");
  assert.deepEqual(listing.efforts, { "gpt-9.9": ["low", "high"] });
});

test("a codex listing with nothing offerable is unavailable, not empty-but-fine", () => {
  const listing = parseCodexModels(JSON.stringify({ models: [] }));
  assert.equal(listing.available, false);
  assert.match(listing.reason, /no listable models/);
});

test("unparseable codex output is reported, not treated as a catalog", () => {
  const listing = parseCodexModels("codex: something went wrong");
  assert.equal(listing.available, false);
  assert.match(listing.reason, /unparseable JSON/);
});

test(
  "codex reports a real catalog on this machine, with its effort levels",
  {
    skip: commandMissing("codex"),
  },
  () => {
    const home = sandbox();
    const result = run(home, ["--catalog", "--route", "codex", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.codex.source, "codex-json");
    assert.ok(Array.isArray(report.codex.catalog) && report.codex.catalog.length > 0);
    const [first] = report.codex.catalog;
    assert.ok(Array.isArray(report.codex.efforts[first]) && report.codex.efforts[first].length > 0);
  },
);

test(
  "an unresolvable optional SDK is reported as a gap, not filled from history",
  {
    skip: sdkResolvesGlobally() ? "the Claude SDK is installed globally here" : false,
  },
  () => {
    const home = sandbox();
    // A cwd with no node_modules above it, so the peer SDK cannot resolve.
    const result = run(home, ["--catalog", "--route", "claude", "--json"], home);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.claude.source, "claude-sdk");
    assert.equal(report.claude.catalog, null);
    assert.match(report.claude.catalogUnavailableReason, /@anthropic-ai\/claude-agent-sdk/);
    assert.ok(
      Array.isArray(report.claude.recentlyUsed),
      "history stays a separate, labelled field",
    );
  },
);

test("roles are scoped to the Git root, so any subdirectory is the same project", () => {
  const home = sandbox();
  const repo = mkdtempSync(join(tmpdir(), "mo-models-repo-"));
  sandboxes.push(repo);
  assert.equal(
    spawnSync(
      "/bin/sh",
      ["-c", "git init -q . && git -c user.email=a@b -c user.name=t commit -q --allow-empty -m t"],
      {
        cwd: repo,
        encoding: "utf8",
      },
    ).status,
    0,
  );
  const nested = join(repo, "services", "api");
  mkdirSync(nested, { recursive: true });

  assert.equal(run(home, ["--set", "executor=codex/gpt-5.6/high", "--force"], repo).status, 0);
  assert.match(run(home, ["--show"], nested).stdout, /executor=codex\/gpt-5\.6\/high/);

  const stored = JSON.parse(readFileSync(join(home, ".meta-o", "models.json"), "utf8"));
  assert.equal(
    Object.keys(stored.projects).length,
    1,
    "a subdirectory must not create a second project entry",
  );

  // Outside a repository the path itself is the identity, so an unrelated
  // directory does not inherit the repository's roles.
  const elsewhere = mkdtempSync(join(tmpdir(), "mo-models-elsewhere-"));
  sandboxes.push(elsewhere);
  assert.match(run(home, ["--show"], elsewhere).stdout, /executor=unset/);
});

test(
  "an effort the model does not offer is refused before anything is written",
  { skip: commandMissing("codex") },
  () => {
    const home = sandbox();
    const listed = JSON.parse(run(home, ["--catalog", "--route", "codex", "--json"]).stdout).codex;
    const model = Object.keys(listed.efforts)[0];
    assert.ok(model, "this test needs one codex model that publishes effort levels");

    const badEffort = run(home, ["--set", `executor=codex/${model}/not-an-effort`]);
    assert.equal(badEffort.status, 1);
    assert.match(badEffort.stderr, /offers effort/);
    assert.throws(
      () => readFileSync(join(home, ".meta-o", "models.json")),
      /ENOENT/,
      "an unsupported effort must not be stored",
    );

    const badModel = run(home, ["--set", "executor=codex/no-such-model-9/high"]);
    assert.equal(badModel.status, 1);
    assert.match(badModel.stderr, /is not in the codex catalog/);

    // The real thing is accepted, and the same value goes through with --force.
    const good = run(home, ["--set", `executor=codex/${model}/${listed.efforts[model][0]}`]);
    assert.equal(good.status, 0, good.stderr);
    assert.equal(run(home, ["--set", "executor=codex/no-such-model-9/high", "--force"]).status, 0);
  },
);

test("a selection is stored with the gap named when the catalog cannot answer", () => {
  const home = sandbox();
  // Run from a directory with no node_modules above it, so the Claude route's
  // optional SDK cannot resolve and the route genuinely cannot answer.
  const result = run(home, ["--set", "executor=claude/whatever-it-is/high"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /the claude catalog is unavailable/);
  assert.match(result.stderr, /stored unverified/);
  assert.match(run(home, ["--show"], home).stdout, /executor=claude\/whatever-it-is\/high/);
});

test("every worktree of one repository is one project", () => {
  const home = sandbox();
  const repo = mkdtempSync(join(tmpdir(), "mo-models-wt-"));
  sandboxes.push(repo);
  const main = join(repo, "main");
  const linked = join(repo, "linked");
  const git = [
    `git init -q "${main}"`,
    `git -C "${main}" -c user.email=a@b -c user.name=t commit -q --allow-empty -m t`,
    `git -C "${main}" worktree add -q -b side "${linked}"`,
  ].join(" && ");
  assert.equal(spawnSync("/bin/sh", ["-c", git], { encoding: "utf8" }).status, 0);

  assert.equal(run(home, ["--set", "executor=codex/gpt-5.6/high", "--force"], main).status, 0);
  // A linked worktree is the methodology's own answer to a parallel build or a
  // destructive E2E, so an executor started there must not be asked to choose
  // models again.
  assert.match(run(home, ["--show"], linked).stdout, /executor=codex\/gpt-5\.6\/high/);
  const stored = JSON.parse(readFileSync(join(home, ".meta-o", "models.json"), "utf8"));
  assert.equal(Object.keys(stored.projects).length, 1, "a worktree is not a second project");
});

test("an unknown route is refused, in a selection and in a catalog filter", () => {
  const home = sandbox();
  const typo = run(home, ["--set", "executor=cladue/claude-opus-5/high"]);
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /unknown route "cladue"/);
  assert.match(typo.stderr, /claude, codex, opencode/);
  assert.throws(
    () => readFileSync(join(home, ".meta-o", "models.json")),
    /ENOENT/,
    "a route typo must not be stored",
  );

  const filter = run(home, ["--catalog", "--route", "openrouter"]);
  assert.equal(filter.status, 1);
  assert.match(filter.stderr, /unknown route "openrouter"/);
});

test("the helper never reads stdin", () => {
  const home = sandbox();
  const result = spawnSync(process.execPath, [HELPER, "--show"], {
    encoding: "utf8",
    cwd: ROOT,
    input: "executor=claude/should-be-ignored/high\n",
    env: { ...process.env, HOME: home },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /executor=unset/);
});
