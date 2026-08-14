/** Protect the hard backend cutover, knowledge rules, and watchdog helper. */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markdown = new MarkdownIt({ html: true, linkify: true });
const temporary = [];
after(() => temporary.forEach((path) => rmSync(path, { recursive: true, force: true })));

function files(path) {
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

test("removed backend and standalone legacy entry names survive only in protected history", () => {
  const roots = ["src", "shared", "skills", "tools", "docs"].flatMap((name) =>
    files(join(ROOT, name)),
  );
  for (const path of roots) {
    if (path === join(ROOT, "docs", "business.md")) continue;
    if (path.startsWith(join(ROOT, "docs", "references"))) continue;
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(
      source,
      /mo-omnigent|src\/skills\/mo-herdr|skills\/mo-herdr|`mo-review`(?!-)/i,
      path,
    );
    assert.doesNotMatch(source, /\bOmnigent\b/i, path);
  }
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.equal((readme.match(/\bOmnigent\b/g) ?? []).length, 1);
  assert.match(readme, /61c39304a7e80e5350e8ffd43110a2ac1cac62b7/);
});

test("internal Markdown links resolve and use target H1 titles as labels", () => {
  const documents = [
    join(ROOT, "README.md"),
    ...files(join(ROOT, "docs")).filter(
      (path) => extname(path) === ".md" && !path.startsWith(join(ROOT, "docs", "references")),
    ),
    ...files(join(ROOT, "shared", "references")).filter((path) => extname(path) === ".md"),
    ...files(join(ROOT, "skills")).filter(
      (path) => extname(path) === ".md" && !path.split("/").includes("licenses"),
    ),
    join(ROOT, "spec", "2026-08-14-backend-review-transition-final", "spec.md"),
    join(ROOT, "spec", "2026-08-14-backend-review-transition-final", "user-intent.md"),
  ].filter((path) => path !== join(ROOT, "docs", "business.md"));

  for (const path of documents) {
    const tokens = markdown.parse(readFileSync(path, "utf8"), {});
    for (const token of tokens.filter((entry) => entry.type === "inline")) {
      for (let index = 0; index < (token.children ?? []).length; index += 1) {
        const child = token.children[index];
        if (child.type !== "link_open") continue;
        const href = child.attrGet("href");
        if (!href || /^(?:https?:|mailto:|#)/.test(href)) continue;
        const target = resolve(dirname(path), href.split("#")[0]);
        assert.equal(extname(target), ".md", `${path}: non-Markdown internal link ${href}`);
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
          if (
            token.children[index].type === "text" ||
            token.children[index].type === "code_inline"
          ) {
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

test("every backlog deferral has reason, practical impact, and next step", () => {
  const tokens = markdown.parse(readFileSync(join(ROOT, "docs", "backlog.md"), "utf8"), {});
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
  assert.ok(entries.length > 0, "backlog must contain at least one real deferral");
  for (const entry of entries) {
    for (const field of ["Reason.", "Practical impact.", "Next step."]) {
      assert.match(entry.body, new RegExp(field.replace(".", "\\.")), `${entry.title}: ${field}`);
    }
  }
  const titles = entries.map((entry) => entry.title).join("\n");
  assert.doesNotMatch(titles, /P1-P8|H13-H37|Omnigent|progress tracker|standalone project-entry/i);
});

test("watchdog observes, rereads before nudge, and suppresses changed state", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-test-"));
  temporary.push(root);
  const log = join(root, "log");
  const count = join(root, "count");
  const fake = join(root, "herdr");
  writeFileSync(
    fake,
    `#!/bin/sh\nif [ "$1 $2" = "agent get" ]; then\n  if [ -n "\${WATCHDOG_CHANGE-}" ]; then\n    n=$(cat "$WATCHDOG_COUNT" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$WATCHDOG_COUNT"; echo "working-$n"\n  else echo working\n  fi\nelif [ "$1 $2" = "agent prompt" ]; then echo "$*" >> "$WATCHDOG_LOG"; echo sent\nelse exit 2\nfi\n`,
  );
  chmodSync(fake, 0o755);
  const script = join(ROOT, "shared", "scripts", "mo-watchdog.sh");
  const env = {
    ...process.env,
    PATH: `${root}:/usr/bin:/bin`,
    WATCHDOG_LOG: log,
    WATCHDOG_COUNT: count,
    WATCHDOG_STATE_DIR: join(root, "state"),
  };
  let result = spawnSync(script, ["target", "--backend", "herdr", "--session", "a"], {
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /state=working action=observed/);
  result = spawnSync(
    script,
    ["target", "--backend", "herdr", "--session", "a", "--nudge", "continue"],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /action=nudge status=0/);
  assert.match(readFileSync(log, "utf8"), /continue/);
  assert.doesNotMatch(readFileSync(log, "utf8"), /--wait/);
  result = spawnSync(
    script,
    ["target", "--backend", "herdr", "--session", "a", "--nudge", "continue"],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.match(result.stdout, /action=duplicate-suppressed/);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 1);
  result = spawnSync(
    script,
    ["target", "--backend", "herdr", "--session", "a", "--nudge", "other"],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const stateDirectory = join(root, "state");
  const stateEntries = readdirSync(stateDirectory);
  assert.equal(stateEntries.length, 1);
  assert.equal(statSync(stateDirectory).mode & 0o777, 0o700);
  const stateRecord = join(stateDirectory, stateEntries[0]);
  assert.equal(statSync(stateRecord).mode & 0o777, 0o600);
  assert.doesNotMatch(readFileSync(stateRecord, "utf8"), /continue|other/);
  chmodSync(stateDirectory, 0o755);
  result = spawnSync(
    script,
    ["target", "--backend", "herdr", "--session", "a", "--nudge", "third"],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(statSync(stateDirectory).mode & 0o777, 0o755);
  result = spawnSync(
    script,
    ["target", "--backend", "herdr", "--session", "a", "--nudge", "continue"],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.match(result.stdout, /action=duplicate-suppressed/);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 3);
  result = spawnSync(
    script,
    ["target", "--backend", "herdr", "--session", "a", "--nudge", "again"],
    { env: { ...env, WATCHDOG_CHANGE: "1" }, encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.match(result.stdout, /state=changed action=suppressed/);
});

test("watchdog does not mistake empty Paseo permission metadata for a question", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-paseo-test-"));
  temporary.push(root);
  const fake = join(root, "paseo");
  const log = join(root, "log");
  const count = join(root, "count");
  writeFileSync(
    fake,
    `#!/bin/sh
if [ "$1" = inspect ]; then
  n=$(cat "$WATCHDOG_COUNT" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$WATCHDOG_COUNT"
  printf '{"Status":"idle","UpdatedAt":"tick-%s","PendingPermissions":[],"AvailableModes":[{"label":"Default Permissions"}]}\\n' "$n"
elif [ "$1" = send ]; then
  printf '%s\\n' "$*" >> "$WATCHDOG_LOG"
  printf '%s\\n' '{"accepted":true}'
else exit 2
fi
`,
  );
  chmodSync(fake, 0o755);
  const env = {
    ...process.env,
    PATH: `${root}:/usr/bin:/bin`,
    WATCHDOG_LOG: log,
    WATCHDOG_COUNT: count,
    WATCHDOG_STATE_DIR: join(root, "state"),
  };
  let result = spawnSync(
    join(ROOT, "shared", "scripts", "mo-watchdog.sh"),
    ["target", "--backend", "paseo", "--session", "a"],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /state=completed action=observed/);
  result = spawnSync(
    join(ROOT, "shared", "scripts", "mo-watchdog.sh"),
    ["target", "--backend", "paseo", "--session", "a", "--nudge", "continue"],
    { env, encoding: "utf8", timeout: 1_000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(log, "utf8"), /send a --prompt continue --no-wait --json/);
  result = spawnSync(
    join(ROOT, "shared", "scripts", "mo-watchdog.sh"),
    ["target", "--backend", "paseo", "--session", "a", "--nudge", "continue"],
    { env, encoding: "utf8", timeout: 1_000 },
  );
  assert.equal(result.status, 2);
  assert.match(result.stdout, /action=duplicate-suppressed/);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 1);
});

test("watchdog rejects failed observations and serializes identical concurrent nudges", async () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-lock-test-"));
  temporary.push(root);
  const fake = join(root, "herdr");
  const log = join(root, "log");
  writeFileSync(
    fake,
    `#!/bin/sh
if [ "$1 $2" = "agent get" ]; then
  if [ -n "\${WATCHDOG_READ_FAILURE-}" ]; then echo failed >&2; exit 7; fi
  echo working
elif [ "$1 $2" = "agent prompt" ]; then
  sleep 1
  printf '%s\\n' "$*" >> "$WATCHDOG_LOG"
  echo sent
else exit 2
fi
`,
  );
  chmodSync(fake, 0o755);
  const script = join(ROOT, "shared", "scripts", "mo-watchdog.sh");
  const args = ["target", "--backend", "herdr", "--session", "a", "--nudge", "continue"];
  const env = {
    ...process.env,
    PATH: `${root}:/usr/bin:/bin`,
    WATCHDOG_LOG: log,
    WATCHDOG_STATE_DIR: join(root, "state"),
  };
  const failed = spawnSync(script, args, {
    env: { ...env, WATCHDOG_READ_FAILURE: "1" },
    encoding: "utf8",
  });
  assert.equal(failed.status, 7);
  assert.match(failed.stdout, /status=7 state=failed action=observe-error/);
  assert.equal(readdirSync(root).includes("log"), false);

  const results = await Promise.all([
    run(script, args, { env, encoding: "utf8" }),
    run(script, args, { env, encoding: "utf8" }),
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [0, 2]);
  assert.match(results.map(({ stdout }) => stdout).join("\n"), /action=concurrent-suppressed/);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 1);
});

test("watchdog rejects missing flag values instead of hanging", () => {
  const result = spawnSync(
    join(ROOT, "shared", "scripts", "mo-watchdog.sh"),
    ["target", "--backend"],
    { encoding: "utf8", timeout: 1_000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 64);
  assert.match(result.stderr, /usage: mo-watchdog\.sh/);
});

test("watchdog normalizes Orca envelopes and reports every worker and terminal", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-orca-test-"));
  temporary.push(root);
  const log = join(root, "log");
  const fake = join(root, "orca");
  writeFileSync(
    fake,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$WATCHDOG_LOG"
case "$*" in
  "orchestration dispatch-show --task task_fixture --json") echo '{"status":"completed"}' ;;
  "orchestration worker-show --dispatch ctx_fixture --json")
    n=$(wc -l < "$WATCHDOG_LOG" | tr -d ' ')
    printf '{"id":"request-%s","ok":true,"result":{"dispatchId":"ctx_fixture","workerState":"stopped","dispatchStatus":"failed"},"_meta":{"runtimeId":"runtime-%s"}}\\n' "$n" "$n"
    ;;
  "orchestration send --to dispatch:ctx_fixture --subject Watchdog --body continue --json") echo '{"accepted":true}' ;;
  "orchestration worker-list --json") echo '{"result":{"workers":[{"dispatchId":"ctx_failed","workerState":"stopped","dispatchStatus":"failed","resource":{"releaseError":null}},{"dispatchId":"ctx_working","workerState":"working","dispatchStatus":"running","resource":{"releaseError":null}}]}}' ;;
  "terminal list --json") echo '{"result":{"terminals":[{"handle":"term_active","connected":true,"preview":"working"},{"handle":"term_done","connected":false,"preview":"completed"},{"handle":"term_disconnected","connected":false,"orphaned":true,"preview":"$ "}]}}' ;;
  *) exit 2 ;;
esac
`,
  );
  chmodSync(fake, 0o755);
  const script = join(ROOT, "shared", "scripts", "mo-watchdog.sh");
  const env = {
    ...process.env,
    PATH: `${root}:/usr/bin:/bin`,
    WATCHDOG_LOG: log,
    WATCHDOG_STATE_DIR: join(root, "state"),
  };
  let result = spawnSync(script, ["target", "--backend", "orca", "--session", "task_fixture"], {
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /state=completed action=observed/);
  result = spawnSync(
    script,
    ["target", "--backend", "orca", "--session", "ctx_fixture", "--nudge", "continue"],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /action=nudge status=0/);
  result = spawnSync(script, ["scan"], { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const expected of [
    /backend=orca session=ctx_failed state=failed/,
    /backend=orca session=ctx_working state=working/,
    /backend=orca session=term_active state=working/,
    /backend=orca session=term_done state=completed/,
    /backend=orca session=term_disconnected state=unclassified/,
  ]) {
    assert.match(result.stdout, expected);
  }
  const calls = readFileSync(log, "utf8");
  assert.match(calls, /orchestration worker-list --json/);
  assert.match(calls, /terminal list --json/);
});

test("watchdog does not mask an Orca scan surface failure", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-orca-error-test-"));
  temporary.push(root);
  const fake = join(root, "orca");
  writeFileSync(
    fake,
    `#!/bin/sh
case "$*" in
  "orchestration worker-list --json") echo 'worker list failed' >&2; exit 7 ;;
  "terminal list --json") echo '{"result":{"terminals":[]}}' ;;
  *) exit 2 ;;
esac
`,
  );
  chmodSync(fake, 0o755);
  const result = spawnSync(join(ROOT, "shared", "scripts", "mo-watchdog.sh"), ["scan"], {
    env: { ...process.env, PATH: `${root}:/usr/bin:/bin` },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /backend=orca surface=workers status=7 state=control-error/);
  assert.match(result.stdout, /backend=orca surface=terminals state=no-sessions/);
});

test("watchdog fails closed when a scan surface changes JSON shape", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-shape-test-"));
  temporary.push(root);
  const commands = {
    herdr: "#!/bin/sh\necho '\"ok\"'\n",
    orca: `#!/bin/sh
case "$*" in
  "orchestration worker-list --json") echo '{"result":{"workers":[]}}' ;;
  "terminal list --json") echo '{"result":{"terminals":[]}}' ;;
  *) exit 2 ;;
esac
`,
    paseo: "#!/bin/sh\necho '[]'\n",
  };
  for (const [name, source] of Object.entries(commands)) {
    writeFileSync(join(root, name), source);
    chmodSync(join(root, name), 0o755);
  }
  const result = spawnSync(join(ROOT, "shared", "scripts", "mo-watchdog.sh"), ["scan"], {
    env: { ...process.env, PATH: `${root}:/usr/bin:/bin` },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /backend=herdr surface=agents state=unclassified action=observe-error/,
  );
});

test("watchdog reports Herdr agents separately and names an empty Paseo surface", () => {
  const root = mkdtempSync(join(tmpdir(), "mo-watchdog-mixed-scan-test-"));
  temporary.push(root);
  const commands = {
    herdr: `#!/bin/sh
if [ "$*" = "agent list" ]; then
  echo '{"result":{"agents":[{"name":"h-done","agent_status":"done"},{"name":"h-working","agent_status":"working"}]}}'
else exit 2
fi
`,
    orca: `#!/bin/sh
case "$*" in
  "orchestration worker-list --json") echo '{"result":{"workers":[]}}' ;;
  "terminal list --json") echo '{"result":{"terminals":[]}}' ;;
  *) exit 2 ;;
esac
`,
    paseo: `#!/bin/sh
if [ "$*" = "ls --json" ]; then echo '[]'; else exit 2; fi
`,
  };
  for (const [name, source] of Object.entries(commands)) {
    writeFileSync(join(root, name), source);
    chmodSync(join(root, name), 0o755);
  }
  const result = spawnSync(join(ROOT, "shared", "scripts", "mo-watchdog.sh"), ["scan"], {
    env: { ...process.env, PATH: `${root}:/usr/bin:/bin` },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /backend=herdr session=h-done state=completed/);
  assert.match(result.stdout, /backend=herdr session=h-working state=working/);
  assert.match(result.stdout, /backend=paseo surface=agents state=no-sessions/);
});
