/**
 * Protect the Orca-only backend boundary, knowledge links, and watchdog helper.
 *
 * Protects §A-BACKEND-01, §A-MEMORY-01 and §A-WATCHDOG-01.
 */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

import { backlogEntries, inspectBacklog } from "../shared/scripts/mo-backlog.mjs";
import { SYSTEM_PATH, exposeFlock, fakeOrca } from "./fixtures/orca-control.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markdown = new MarkdownIt({ html: true, linkify: true });
const temporary = [];
after(() => temporary.forEach((path) => rmSync(path, { recursive: true, force: true })));

function files(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return files(child);
    return entry.isFile() ? [child] : [];
  });
}

function run(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("Herdr and Paseo survive only as README history", () => {
  const forbidden = /\b(?:herdr|paseo)\b/iu;
  for (const root of ["src", "shared", "skills", "tools"]) {
    for (const path of files(join(ROOT, root))) {
      assert.doesNotMatch(readFileSync(path, "utf8"), forbidden, path);
    }
  }
  assert.doesNotMatch(readFileSync(join(ROOT, "apm.yml"), "utf8"), forbidden, "apm.yml");
  for (const path of files(join(ROOT, "docs"))) {
    if (path.startsWith(join(ROOT, "docs", "references"))) continue;
    assert.doesNotMatch(readFileSync(path, "utf8"), forbidden, path);
  }
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.match(readme, /Поддержка Herdr и Paseo удалена/);
  assert.match(readme, /2eb85bebe14aa35419db192db66938e14e0be6f1/);
});

test("internal Markdown links resolve and use target H1 titles as labels", () => {
  const documents = [
    join(ROOT, "AGENTS.md"),
    join(ROOT, "CLAUDE.md"),
    join(ROOT, "README.md"),
    ...files(join(ROOT, "docs")).filter(
      (path) => extname(path) === ".md" && !path.startsWith(join(ROOT, "docs", "references")),
    ),
    ...files(join(ROOT, "shared", "references")).filter((path) => extname(path) === ".md"),
    ...files(join(ROOT, "skills")).filter(
      (path) => extname(path) === ".md" && !path.split("/").includes("licenses"),
    ),
  ];
  for (const path of documents) {
    const tokens = markdown.parse(readFileSync(path, "utf8"), {});
    for (const token of tokens.filter((entry) => entry.type === "inline")) {
      for (let index = 0; index < (token.children ?? []).length; index += 1) {
        const child = token.children[index];
        if (child.type !== "link_open") continue;
        const href = child.attrGet("href");
        if (!href || /^(?:https?:|mailto:|#)/.test(href)) continue;
        const target = resolve(dirname(path), href.split("#")[0]);
        if (extname(target) !== ".md") {
          assert.ok(existsSync(target), `${path}: missing linked asset ${href}`);
          continue;
        }
        const targetTokens = markdown.parse(readFileSync(target, "utf8"), {});
        const h1 = targetTokens.findIndex(
          (entry) => entry.type === "heading_open" && entry.tag === "h1",
        );
        assert.notEqual(h1, -1, `${target}: missing H1`);
        const label = [];
        for (
          index += 1;
          index < token.children.length && token.children[index].type !== "link_close";
          index += 1
        ) {
          if (["text", "code_inline"].includes(token.children[index].type)) {
            label.push(token.children[index].content);
          } else if (["softbreak", "hardbreak"].includes(token.children[index].type)) {
            label.push(" ");
          }
        }
        const normalizedLabel = label.join("").replace(/\s+/gu, " ").trim();
        const normalizedTitle = targetTokens[h1 + 1].content.replace(/\s+/gu, " ").trim();
        assert.ok(
          normalizedLabel.includes(normalizedTitle),
          `${path}: "${normalizedLabel}" does not contain "${normalizedTitle}"`,
        );
      }
    }
  }
});

// The visible text of an inline token: Markdown reaches the same reader
// through `**`, `_` or a code span, so a guard that edits marker bytes out of
// the raw source holds only the spelling it happened to see. Formatting
// open/close tokens carry no content; text and code spans carry all of it.
function visibleText(token) {
  const out = [];
  for (const child of token.children ?? []) {
    if (["text", "code_inline"].includes(child.type)) out.push(child.content);
    else if (["softbreak", "hardbreak"].includes(child.type)) out.push(" ");
  }
  return out.join("").replace(/\s+/gu, " ");
}

// A line that tells a reader part of the authoritative check is optional turns
// the gate into a partial one by instruction. `mo-qc` is the only thing that
// speaks for the candidate, so the document may describe an environment that
// breaks a stage, never permission to leave it out. The posture entry must
// also keep naming its real trigger: the stop needs a controlling terminal,
// and an agent's own tool shell has none, which is why the trap misses exactly
// the reader who runs the gate most often.
function postureFaults(source) {
  const items = markdown
    .parse(source, {})
    .filter((token) => token.type === "inline")
    .map(visibleText);
  const faults = items
    .filter((item) =>
      /достаточно прогнать остальные стадии|можно пропустить стад|стадию можно не/u.test(item),
    )
    .map((item) => `skip_licensed: ${item}`);
  const posture = items.find((item) => item.includes("provider-posture"));
  if (posture === undefined) return [...faults, "posture_absent"];
  if (!/управляющ/u.test(posture)) faults.push("controlling_terminal_unnamed");
  if (!/script|pty|PTY/u.test(posture)) faults.push("reproduction_unnamed");
  // Both positives are satisfied by the remedy sentence alone, so the trigger
  // itself is held by naming what it is not. `\p{L}` rather than `\w`: `\w`
  // stays ASCII-only even under `u`, and an assertion that cannot match a
  // Cyrillic document is an assertion that can never fire.
  if (/агентск\p{L}+ терминал/u.test(posture)) faults.push("agent_terminal_blamed");
  if (/обычн\p{L}+ чекаут/u.test(posture)) faults.push("ordinary_checkout_blamed");
  return faults;
}

test("the commands document never licenses skipping a stage of the gate", () => {
  const source = readFileSync(join(ROOT, "docs", "papercut.md"), "utf8");
  assert.deepEqual(postureFaults(source), []);
  // The committed entry passes, so the guard is held by mutations the raw-byte
  // version let through: underscore emphasis is exactly as visible as `**`.
  assert.deepEqual(
    postureFaults(source.replace("**управляющий** терминал", "_агентский_ терминал")),
    ["agent_terminal_blamed"],
  );
  assert.deepEqual(
    postureFaults(
      source.replace("зелёная. Поэтому", "зелёная, тот же SHA в _обычном_ чекауте. Поэтому"),
    ),
    ["ordinary_checkout_blamed"],
  );
  assert.deepEqual(
    postureFaults(source.replaceAll("tests/provider-posture.test.mjs", "эта стадия")),
    ["posture_absent"],
  );
});

test("entry contracts link every essential knowledge document", () => {
  const expected = [
    "docs/business.md",
    "README.md",
    "docs/glossary.md",
    "docs/acceptance.md",
    "docs/e2e.md",
    "docs/backend-capabilities.md",
    "docs/backlog.md",
    "docs/papercut.md",
    "shared/references/methodology.md",
    "shared/references/purpose-and-architecture.md",
  ];
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const tokens = markdown.parse(readFileSync(join(ROOT, name), "utf8"), {});
    const links = new Set(
      tokens
        .filter((entry) => entry.type === "inline")
        .flatMap((entry) => entry.children ?? [])
        .filter((entry) => entry.type === "link_open")
        .map((entry) => entry.attrGet("href")),
    );
    for (const href of expected) assert.ok(links.has(href), `${name}: missing link ${href}`);
  }
});

test("the backlog schema accepts empty state and validates every future deferral", () => {
  const source = readFileSync(join(ROOT, "docs", "backlog.md"), "utf8");
  const entries = backlogEntries(source);
  assert.ok(
    new Set(["empty", "not_empty"]).has(inspectBacklog(source).kind),
    "ordinary QC validates the live schema without requiring lifecycle closure",
  );

  const future = backlogEntries(
    "# Бэклог\n\n## Открыто\n\n### Deferred\n\n**Причина.** R\n\n" +
      "**Практическое влияние.** I\n\n**Следующий шаг.** N\n",
  );
  assert.equal(future.length, 1);
  for (const entry of [...entries, ...future]) {
    for (const field of ["Причина.", "Практическое влияние.", "Следующий шаг."]) {
      assert.ok(entry.body.includes(field), `${entry.title}: ${field}`);
    }
  }
  const titles = entries.map((entry) => entry.title).join("\n");
  assert.doesNotMatch(titles, /P1-P8|H13-H37|Omnigent|progress tracker|standalone project-entry/i);
});

test("watchdog accepts only Orca targets", () => {
  const script = join(ROOT, "shared", "scripts", "mo-watchdog.sh");
  for (const backend of ["herdr", "paseo"]) {
    const result = spawnSync(script, ["target", "--backend", backend, "--session", "fixture"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 64);
  }
  const missing = spawnSync(script, ["target", "--backend"], { encoding: "utf8", timeout: 1_000 });
  assert.equal(missing.error, undefined);
  assert.equal(missing.status, 64);
});

test("watchdog keeps capacity, quota, reconnecting and refusal distinct", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-states-"));
  temporary.push(root);
  fakeOrca(root);
  const script = join(ROOT, "shared", "scripts", "mo-watchdog.sh");
  const cases = [
    ["Selected model is at capacity. Please try a different model.", "capacity"],
    ["subscription quota limit; reset at 12:00", "quota"],
    ["Reconnecting…", "reconnecting"],
    ["output_blocked_after_work refused", "refused"],
  ];
  for (const [text, expected] of cases) {
    const result = spawnSync(script, ["target", "--backend", "orca", "--session", "ctx_fixture"], {
      env: {
        ...process.env,
        PATH: `${root}:${SYSTEM_PATH}`,
        WATCHDOG_STAGE_TEXT: text,
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`state=${expected}`));
  }
});

test("watchdog validates, nudges, deduplicates, and suppresses changed Orca state", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-orca-target-"));
  temporary.push(root);
  exposeFlock(root);
  fakeOrca(root);
  const log = join(root, "log");
  const env = {
    ...process.env,
    PATH: `${root}:${SYSTEM_PATH}`,
    WATCHDOG_LOG: log,
    WATCHDOG_COUNT: join(root, "count"),
    WATCHDOG_STATE_DIR: join(root, "state"),
  };
  const script = join(ROOT, "shared", "scripts", "mo-watchdog.sh");
  let result = spawnSync(script, ["target", "--backend", "orca", "--session", "ctx_fixture"], {
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /state=working action=observed/);
  const args = ["target", "--backend", "orca", "--session", "ctx_fixture", "--nudge", "continue"];
  result = spawnSync(script, args, { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /action=nudge status=0/);
  result = spawnSync(script, args, { env, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /action=duplicate-suppressed/);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 1);
  const state = readdirSync(join(root, "state")).find((entry) => !entry.endsWith(".lock"));
  assert.ok(state);
  assert.equal(statSync(join(root, "state", state)).mode & 0o777, 0o600);
  result = spawnSync(script, args, { env: { ...env, WATCHDOG_CHANGED: "1" }, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /state=changed action=suppressed/);
  result = spawnSync(script, args, { env: { ...env, WATCHDOG_MALFORMED: "1" }, encoding: "utf8" });
  assert.equal(result.status, 65);
  assert.match(result.stdout, /action=observe-error/);
});

test("a malformed native observation blocks the nudge instead of shaping it", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-orca-malformed-"));
  temporary.push(root);
  exposeFlock(root);
  fakeOrca(root);
  const log = join(root, "log");
  const env = {
    ...process.env,
    PATH: `${root}:${SYSTEM_PATH}`,
    WATCHDOG_LOG: log,
    WATCHDOG_COUNT: join(root, "count"),
    WATCHDOG_STATE_DIR: join(root, "state"),
  };
  const script = join(ROOT, "shared", "scripts", "mo-watchdog.sh");
  const args = ["target", "--backend", "orca", "--session", "ctx_fixture", "--nudge", "continue"];
  // A scalar `observation` satisfies every field the envelope check reads, and
  // then the stability projection cannot index it.
  let result = spawnSync(script, args, {
    env: { ...env, WATCHDOG_SCALAR_OBSERVATION: "1" },
    encoding: "utf8",
  });
  assert.equal(result.status, 65);
  assert.match(result.stdout, /action=observe-error/);
  assert.equal(existsSync(log), false);
  // A member the envelope check does not type still has to fail closed rather
  // than compare two unbuildable snapshots as equal.
  result = spawnSync(script, args, {
    env: { ...env, WATCHDOG_SCALAR_TERMINAL: "1" },
    encoding: "utf8",
  });
  assert.equal(result.status, 65);
  assert.match(result.stdout, /action=observe-error/);
  assert.equal(existsSync(log), false);
});

test("watchdog serializes concurrent nudges and bounds unchanged-state history", async () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-orca-concurrency-"));
  temporary.push(root);
  exposeFlock(root);
  fakeOrca(root);
  const script = join(ROOT, "shared", "scripts", "mo-watchdog.sh");
  const env = {
    ...process.env,
    PATH: `${root}:${SYSTEM_PATH}`,
    WATCHDOG_LOG: join(root, "log"),
    WATCHDOG_COUNT: join(root, "count"),
    WATCHDOG_STATE_DIR: join(root, "state"),
    WATCHDOG_SLOW_SEND: "1",
  };
  const base = ["target", "--backend", "orca", "--session", "ctx_fixture", "--nudge"];
  const first = run(script, [...base, "first"], { env });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const second = await run(script, [...base, "second"], { env });
  const firstResult = await first;
  assert.deepEqual([firstResult.status, second.status].sort(), [0, 2]);
  assert.match(`${firstResult.stdout}\n${second.stdout}`, /action=concurrent-suppressed/);

  const fastEnv = { ...env };
  delete fastEnv.WATCHDOG_SLOW_SEND;
  for (let index = 0; index < 15; index += 1) {
    const result = spawnSync(script, [...base, `distinct-${index}`], {
      env: fastEnv,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  }
  const saturated = spawnSync(script, [...base, "saturated"], {
    env: fastEnv,
    encoding: "utf8",
  });
  assert.equal(saturated.status, 2, saturated.stderr);
  assert.match(saturated.stdout, /action=saturation-suppressed/);
});

test("watchdog requires flock only for nudge delivery", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-no-flock-"));
  temporary.push(root);
  fakeOrca(root);
  symlinkSync("/usr/bin/jq", join(root, "jq"));
  const env = {
    ...process.env,
    PATH: root,
    WATCHDOG_LOG: join(root, "log"),
    WATCHDOG_COUNT: join(root, "count"),
    WATCHDOG_STATE_DIR: join(root, "state"),
  };
  const script = join(ROOT, "shared", "scripts", "mo-watchdog.sh");
  let result = spawnSync(script, ["target", "--backend", "orca", "--session", "ctx_fixture"], {
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  result = spawnSync(
    script,
    ["target", "--backend", "orca", "--session", "ctx_fixture", "--nudge", "continue"],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 69);
  assert.match(result.stderr, /requires flock/);
});

test("watchdog scans Orca workers and terminals and fails closed on malformed shapes", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-orca-scan-"));
  temporary.push(root);
  fakeOrca(root);
  const script = join(ROOT, "shared", "scripts", "mo-watchdog.sh");
  const env = { ...process.env, PATH: `${root}:${SYSTEM_PATH}` };
  let result = spawnSync(script, ["scan"], { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /backend=orca session=ctx_working state=working surface=workers/);
  assert.match(result.stdout, /backend=orca session=term_active state=connected surface=terminals/);
  result = spawnSync(script, ["scan"], {
    env: { ...env, WATCHDOG_BAD_SCAN: "1" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /backend=orca surface=workers state=unclassified action=observe-error/,
  );
});
