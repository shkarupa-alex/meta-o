/**
 * Protect the Orca-only backend boundary, knowledge links, and watchdog helper.
 *
 * Protects §A-BACKEND-01, §A-MEMORY-01 and §A-WATCHDOG-01.
 */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SYSTEM_PATH = "/usr/bin:/bin";
const FLOCK = spawnSync("/bin/sh", ["-c", "command -v flock"], { encoding: "utf8" }).stdout.trim();
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

function exposeFlock(root) {
  assert.notEqual(FLOCK, "", "test host must provide flock");
  symlinkSync(FLOCK, join(root, "flock"));
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

function fakeOrca(root) {
  const path = join(root, "orca");
  writeFileSync(
    path,
    `#!/bin/sh
case "$*" in
  "orchestration worker-show --dispatch ctx_fixture --json")
    if [ -n "\${WATCHDOG_MALFORMED-}" ]; then echo not-json; exit 0; fi
    if [ -n "\${WATCHDOG_SCALAR_OBSERVATION-}" ]; then
      echo '{"ok":true,"result":{"dispatch":{"id":"ctx_fixture","status":"running"},"worker":{"dispatch_id":"ctx_fixture","state":"working"},"observation":"malformed"}}'
      exit 0
    fi
    if [ -n "\${WATCHDOG_SCALAR_TERMINAL-}" ]; then
      echo '{"ok":true,"result":{"dispatch":{"id":"ctx_fixture","status":"running"},"worker":{"dispatch_id":"ctx_fixture","state":"working"},"terminal":"malformed"}}'
      exit 0
    fi
    stage=\${WATCHDOG_STAGE_TEXT:-active}
    if [ -n "\${WATCHDOG_CHANGED-}" ]; then
      n=$(cat "$WATCHDOG_COUNT" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$WATCHDOG_COUNT"; stage="changed-$n"
    fi
    printf '{"ok":true,"result":{"dispatch":{"id":"ctx_fixture","status":"running"},"worker":{"dispatch_id":"ctx_fixture","state":"working","stage":"%s"},"observation":{"status":"running"}}}\n' "$stage"
    ;;
  "terminal show --terminal term_fixture --json")
    echo '{"ok":true,"result":{"terminal":{"handle":"term_fixture","connected":true,"orphaned":false}}}'
    ;;
  "orchestration send --to dispatch:ctx_fixture --subject Watchdog --body "*" --json"|"terminal send --terminal term_fixture --text "*" --enter --json")
    if [ -n "\${WATCHDOG_SLOW_SEND-}" ]; then sleep 1; fi
    printf '%s\n' "$*" >> "$WATCHDOG_LOG"; echo '{"accepted":true}'
    ;;
  "orchestration worker-list --json")
    if [ -n "\${WATCHDOG_BAD_SCAN-}" ]; then echo '"wrong"'; else echo '{"result":{"workers":[{"dispatchId":"ctx_working","workerState":"working","dispatchStatus":"running"}]}}'; fi
    ;;
  "terminal list --json")
    echo '{"result":{"terminals":[{"handle":"term_active","connected":true,"lastOutputAt":123}]}}'
    ;;
  *) exit 2 ;;
esac
`,
  );
  chmodSync(path, 0o755);
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
          }
        }
        assert.ok(
          label.join("").includes(targetTokens[h1 + 1].content),
          `${path}: "${label.join("")}" does not contain "${targetTokens[h1 + 1].content}"`,
        );
      }
    }
  }
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

function backlogEntries(source) {
  const tokens = markdown.parse(source, {});
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].type !== "heading_open" || tokens[index].tag !== "h3") continue;
    const title = tokens[index + 1].content;
    const body = [];
    for (index += 3; index < tokens.length; index += 1) {
      if (tokens[index].type === "heading_open" && Number(tokens[index].tag.slice(1)) <= 3) {
        index -= 1;
        break;
      }
      if (tokens[index].type === "inline") body.push(tokens[index].content);
    }
    entries.push({ title, body: body.join("\n") });
  }
  return { entries, tokens };
}

test("the backlog schema accepts empty state and validates every future deferral", () => {
  const source = readFileSync(join(ROOT, "docs", "backlog.md"), "utf8");
  const { entries, tokens } = backlogEntries(source);
  const headings = tokens
    .filter((entry) => entry.type === "heading_open")
    .map((entry) => tokens[tokens.indexOf(entry) + 1].content);
  assert.deepEqual(headings, ["Бэклог", "Открыто"]);
  assert.deepEqual(entries, []);

  const future = backlogEntries(
    "# Бэклог\n\n## Открыто\n\n### Deferred\n\n**Причина.** R\n\n" +
      "**Практическое влияние.** I\n\n**Следующий шаг.** N\n",
  ).entries;
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
