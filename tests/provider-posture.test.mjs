/**
 * Semantic checks for the shipped provider-posture diagnostic.
 *
 * The script is copied into three independently installable skills, so these
 * fixtures exercise the source owner directly across real zsh/bash startup
 * modes, including the failure branches that decide whether evidence is known.
 */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "shared", "scripts", "mo-posture.sh");
const temporary = [];

after(() => {
  for (const path of temporary) rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "mo-posture-test-"));
  temporary.push(root);
  const home = join(root, "home");
  mkdirSync(home);
  return { home, root };
}

function providerBin(root, name, providers = ["claude", "codex", "opencode"]) {
  const bin = join(root, name);
  mkdirSync(bin);
  for (const provider of providers) {
    const executable = join(bin, provider);
    writeFileSync(executable, "#!/bin/sh\nexit 0\n");
    chmodSync(executable, 0o755);
  }
  return bin;
}

function runMatrix(shell, environment, providers = [], script = SCRIPT) {
  return spawnSync(script, ["--shell", shell, "--", ...providers], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    timeout: 10_000,
  });
}

function runThroughExportedFunction(functionName, shell, environment, script = SCRIPT) {
  const bootstrap = [
    `${functionName}() { printf '%s\\n' INHERITED_FUNCTION_SENTINEL; }`,
    `export -f ${functionName}`,
    'exec "$1" --shell "$2"',
  ].join("\n");
  return spawnSync("/bin/bash", ["-c", bootstrap, "mo-posture-parent", script, shell], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    timeout: 10_000,
  });
}

function mutant(root, name, original, replacement) {
  const source = readFileSync(SCRIPT, "utf8");
  assert.ok(source.includes(original), `mutation target disappeared: ${name}`);
  const path = join(root, name);
  writeFileSync(
    path,
    source.replace(original, () => replacement),
  );
  chmodSync(path, 0o755);
  return path;
}

function mutantAll(root, name, original, replacement) {
  const source = readFileSync(SCRIPT, "utf8");
  const occurrences = source.split(original).length - 1;
  assert.ok(occurrences > 0, `mutation target disappeared: ${name}`);
  const path = join(root, name);
  writeFileSync(
    path,
    source.replaceAll(original, () => replacement),
  );
  chmodSync(path, 0o755);
  return path;
}

function mutantFrom(root, name, sourcePath, original, replacement) {
  const source = readFileSync(sourcePath, "utf8");
  assert.ok(source.includes(original), `mutation target disappeared: ${name}`);
  const path = join(root, name);
  writeFileSync(
    path,
    source.replace(original, () => replacement),
  );
  chmodSync(path, 0o755);
  return path;
}

function emptyEnvironmentScript(root, name) {
  return mutant(
    root,
    name,
    'if ! /usr/bin/env -0 >"$environment_file" 2>"$environment_error_file"; then',
    'if ! : >"$environment_file" 2>"$environment_error_file"; then',
  );
}

function launchWindowScript(root, name, removeGuard = false) {
  const pidFile = join(root, `${name}.pid`);
  const instrumented = mutant(
    root,
    `${name}-instrumented.sh`,
    '    ) >"$stdout_file" 2>"$stderr_file" </dev/null &\n    active_child_pid=$!',
    '    ) >"$stdout_file" 2>"$stderr_file" </dev/null &\n' +
      `    /usr/bin/printf '%s\\n' "$!" >${JSON.stringify(pidFile)}\n` +
      '    builtin kill -TERM "$$"\n' +
      "    active_child_pid=$!",
  );
  if (!removeGuard) return { pidFile, script: instrumented };
  const script = mutantFrom(
    root,
    name,
    instrumented,
    "  if [[ $creating_work_directory -eq 1 || $launching_child -eq 1 ]]; then\n" +
      "    pending_signal_status=$signal_status\n" +
      "    return\n" +
      "  fi",
    ": # mutation: exit immediately inside a critical launch window",
  );
  return { pidFile, script };
}

function reentrantShutdownScript(root, name, removeGuard = false) {
  const instrumented = mutant(
    root,
    `${name}-instrumented.sh`,
    "stop_active_child() {\n  local process_group",
    "stop_active_child() {\n" +
      "  if [[ ${MO_POSTURE_TEST_REENTRANT:-0} -eq 1 && $shutdown_started -eq 1 ]]; then\n" +
      "    MO_POSTURE_TEST_REENTRANT=0\n" +
      '    builtin kill -HUP "$$"\n' +
      "  fi\n" +
      "  local process_group",
  );
  if (!removeGuard) return instrumented;
  return mutantFrom(
    root,
    name,
    instrumented,
    "  if [[ $shutdown_started -eq 1 ]]; then\n    return\n  fi",
    ": # mutation: allow reentrant shutdown",
  );
}

function forcedUnquiescedScript(root, name, ignoreFailure = false) {
  const instrumented = mutant(
    root,
    `${name}-instrumented.sh`,
    '  return "$stop_status"\n}',
    "  if [[ ${MO_POSTURE_TEST_UNQUIESCED:-0} -eq 1 ]]; then\n" +
      "    stop_status=1\n" +
      "  fi\n" +
      '  return "$stop_status"\n}',
  );
  if (!ignoreFailure) return instrumented;
  return mutantFrom(
    root,
    name,
    instrumented,
    "    stop_active_child || mode_status=2",
    "    stop_active_child || true # mutation: accept unquiesced group",
  );
}

function readOrderScript(root, name, moveQuiescence = false) {
  const instrumented = mutant(
    root,
    `${name}-instrumented.sh`,
    "    fields=()\n    field=",
    '    : >"${record_file%.records}.reading"\n' +
      "    /bin/sleep 0.1\n" +
      "    fields=()\n" +
      "    field=",
  );
  if (!moveQuiescence) return instrumented;
  const removed = mutantFrom(
    root,
    `${name}-removed.sh`,
    instrumented,
    "    stop_active_child || mode_status=2",
    ": # mutation: postpone process-group quiescence",
  );
  return mutantFrom(
    root,
    name,
    removed,
    '    done <"$record_file"',
    '    done <"$record_file"\n    stop_active_child || mode_status=2',
  );
}

function assertRecords(result, shell, expectedStatus, expectedType = /command|file/) {
  assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
  const lines = result.stdout.trim().split("\n");
  const records = lines.filter((line) => line.startsWith(`MO_POSTURE shell=${shell} `));
  assert.equal(records.length, 12, result.stdout);
  for (const record of records) {
    assert.match(
      record,
      new RegExp(
        `^MO_POSTURE shell=${shell} mode=-(?:lc|lic|c|ic) name=(?:claude|codex|opencode) type=(?:${expectedType.source}) path=.+$`,
      ),
    );
  }
  assert.equal(
    lines.filter((line) => line === `MO_POSTURE_MATRIX shell=${shell} status=${expectedStatus}`)
      .length,
    1,
    result.stdout,
  );
  return records;
}

function writeZshProfiles(home, ordinaryPath, options = {}) {
  const common = [
    `export PATH=${JSON.stringify(`${ordinaryPath}:/usr/bin:/bin`)}`,
    "whence() { print -r -- PRIVATE_SENTINEL; }",
    options.stdoutNoise ? `printf '%s\\n' ${JSON.stringify(options.stdoutNoise)}` : "",
    options.zshenvExtra ?? "",
    "",
  ].join("\n");
  writeFileSync(join(home, ".zshenv"), common);
  writeFileSync(
    join(home, ".zprofile"),
    [
      options.loginPath
        ? `export PATH=${JSON.stringify(`${options.loginPath}:/usr/bin:/bin`)}`
        : `export PATH=${JSON.stringify(`${ordinaryPath}:/usr/bin:/bin`)}`,
      options.zprofileExtra ?? "",
      "",
    ].join("\n"),
  );
  writeFileSync(join(home, ".zshrc"), `${common}${options.zshrcExtra ?? ""}\n`);
}

function writeBashProfiles(home, ordinaryPath, options = {}) {
  const common = [
    `export PATH=${JSON.stringify(`${ordinaryPath}:/usr/bin:/bin`)}`,
    "type() { printf '%s\\n' PRIVATE_SENTINEL; }",
    options.bashEnvExtra ?? "",
    "",
  ].join("\n");
  writeFileSync(join(home, ".bash_env"), common);
  writeFileSync(join(home, ".bashrc"), `${common}${options.bashrcExtra ?? ""}\n`);
  writeFileSync(
    join(home, ".bash_profile"),
    [
      "unset BASH_ENV",
      options.loginPath
        ? `export PATH=${JSON.stringify(`${options.loginPath}:/usr/bin:/bin`)}`
        : `export PATH=${JSON.stringify(`${ordinaryPath}:/usr/bin:/bin`)}`,
      "type() { printf '%s\\n' PRIVATE_SENTINEL; }",
      options.profileExtra ?? "",
      "",
    ].join("\n"),
  );
}

function zshExitRecordOverride(records) {
  const fields = records.flatMap(({ name, kind, path }) => [name, kind, path]);
  const format = fields.map(() => "%s\\0").join("");
  const arguments_ = fields.map((field) => JSON.stringify(field)).join(" ");
  return (
    `TRAPEXIT() { (( ZSH_SUBSHELL == 0 )) || return; ` +
    `: >"$MO_POSTURE_RECORD_FILE"; ` +
    `builtin printf ${JSON.stringify(format)} ${arguments_} >>"$MO_POSTURE_RECORD_FILE"; }`
  );
}

function bashExitRecordOverride(records) {
  const fields = records.flatMap(({ name, kind, path }) => [name, kind, path]);
  const format = fields.map(() => "%s\\0").join("");
  const arguments_ = fields.map((field) => JSON.stringify(field)).join(" ");
  return (
    `trap ': >"$MO_POSTURE_RECORD_FILE"; ` +
    `builtin printf ${JSON.stringify(format)} ${arguments_} ` +
    `>>"$MO_POSTURE_RECORD_FILE"' EXIT`
  );
}

function waitForExit(child) {
  return new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal })));
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitUntilProcessGone(pid, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  while (processIsAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !processIsAlive(pid);
}

test("the posture script and both child probes have valid syntax", () => {
  const syntax = spawnSync("bash", ["-n", SCRIPT], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
  const selfCheck = spawnSync(SCRIPT, ["--self-check", "--shell", "all"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(selfCheck.status, 0, selfCheck.stderr);
});

test("the process-group ownership anchor is reaped after every PGID operation", () => {
  const source = readFileSync(SCRIPT, "utf8");
  const start = source.indexOf("stop_active_child() {");
  const end = source.indexOf("\n}\n\nexit_on_signal()", start);
  assert.ok(start >= 0 && end > start);
  const stopFunction = source.slice(start, end);
  const waitOffset = stopFunction.indexOf('builtin wait "$active_child_pid"');
  const lastGroupOperation = stopFunction.lastIndexOf('"$process_group"');
  assert.ok(waitOffset > lastGroupOperation, stopFunction);
  assert.doesNotMatch(stopFunction.slice(waitOffset), /builtin kill .*process_group/);
});

test("profile output is summarized as noise and lookup functions cannot shadow builtins", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeZshProfiles(home, bin, { stdoutNoise: "Welcome back, Alex" });

  const result = runMatrix("zsh", {
    HOME: home,
    ZDOTDIR: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  assertRecords(result, "zsh", 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /Welcome back|PRIVATE_SENTINEL/);
  assert.match(result.stderr, /MO_POSTURE_NOISE shell=zsh .*stdout=present/);
});

test("bash profile functions cannot shadow the type builtin", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeBashProfiles(home, bin);

  const result = runMatrix("bash", {
    BASH_ENV: join(home, ".bash_env"),
    HOME: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  assertRecords(result, "bash", 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /PRIVATE_SENTINEL/);
});

test("an outer BASH_ENV is isolated and restored only for measured Bash modes", () => {
  const { home, root } = fixture();
  const ordinary = providerBin(root, "ordinary-bin");
  const fromBashEnv = providerBin(root, "bash-env-bin");
  writeBashProfiles(home, ordinary);
  writeFileSync(
    join(home, ".bash_env"),
    [
      "printf '%s\\n' OUTER_BASH_ENV_SENTINEL",
      `export PATH=${JSON.stringify(`${fromBashEnv}:/usr/bin:/bin`)}`,
      "",
    ].join("\n"),
  );

  const result = runMatrix("bash", {
    BASH_ENV: join(home, ".bash_env"),
    HOME: home,
    PATH: `${ordinary}:/usr/bin:/bin`,
  });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /OUTER_BASH_ENV_SENTINEL/);
  assert.match(result.stdout, new RegExp(`mode=-c .*path=${fromBashEnv}/claude`));
  assert.match(result.stdout, /MO_POSTURE_MATRIX shell=bash status=1/);
});

test("privileged startup ignores an exported trap function and still cleans profile captures", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  const scratch = join(root, "tmp");
  mkdirSync(scratch);
  writeZshProfiles(home, bin, { stdoutNoise: "PRIVATE_PROFILE_OUTPUT" });

  const result = runThroughExportedFunction("trap", "zsh", {
    HOME: home,
    ZDOTDIR: home,
    PATH: `${bin}:/usr/bin:/bin`,
    TMPDIR: scratch,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(
    `${result.stdout}${result.stderr}`,
    /INHERITED_FUNCTION_SENTINEL|PRIVATE_PROFILE_OUTPUT/,
  );
  assert.deepEqual(readdirSync(scratch), []);
});

test("an inherited Bash function makes the Bash matrix explicitly unknown", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  const scratch = join(root, "tmp");
  mkdirSync(scratch);
  writeBashProfiles(home, bin);

  const result = runThroughExportedFunction("read", "bash", {
    BASH_ENV: join(home, ".bash_env"),
    HOME: home,
    PATH: `${bin}:/usr/bin:/bin`,
    TMPDIR: scratch,
  });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stderr,
    /MO_POSTURE_ENVIRONMENT shell=bash status=2 reason=inherited-shell-state/,
  );
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /INHERITED_FUNCTION_SENTINEL/);
  assert.deepEqual(readdirSync(scratch), []);
});

test("the alternate BASH_FUNC naming scheme also makes Bash unknown", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeBashProfiles(home, bin);

  const result = runMatrix("bash", {
    BASH_ENV: join(home, ".bash_env"),
    "BASH_FUNC_legacy()": "() { :; }",
    HOME: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stderr,
    /MO_POSTURE_ENVIRONMENT shell=bash status=2 reason=inherited-shell-state/,
  );
});

test("a failed NUL environment scan makes Bash explicitly unknown", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeBashProfiles(home, bin);
  const script = mutant(root, "broken-env-scan.sh", "/usr/bin/env -0", "/usr/bin/env -Z");

  const result = runMatrix(
    "bash",
    {
      BASH_ENV: join(home, ".bash_env"),
      HOME: home,
      PATH: `${bin}:/usr/bin:/bin`,
    },
    [],
    script,
  );
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stderr,
    /MO_POSTURE_ENVIRONMENT shell=bash status=2 reason=environment-scan-failed/,
  );
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /illegal option|invalid option/);
});

test("a successful but empty Bash environment scan is still unknown", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeBashProfiles(home, bin);
  const script = emptyEnvironmentScript(root, "empty-env-scan.sh");

  const result = runMatrix(
    "bash",
    {
      BASH_ENV: join(home, ".bash_env"),
      HOME: home,
      PATH: `${bin}:/usr/bin:/bin`,
    },
    [],
    script,
  );
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stderr,
    /MO_POSTURE_ENVIRONMENT shell=bash status=2 reason=environment-scan-failed/,
  );
});

test("the Bash-only environment scan is not part of a Zsh matrix", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeZshProfiles(home, bin);
  const script = mutant(root, "broken-unused-env-scan.sh", "/usr/bin/env -0", "/usr/bin/env -Z");

  const result = runMatrix(
    "zsh",
    {
      HOME: home,
      ZDOTDIR: home,
      PATH: `${bin}:/usr/bin:/bin`,
    },
    [],
    script,
  );
  assertRecords(result, "zsh", 0);
  assert.doesNotMatch(result.stderr, /MO_POSTURE_ENVIRONMENT/);
});

test("help uses only Bash builtins even with an empty PATH", () => {
  const result = spawnSync(SCRIPT, ["--help"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, PATH: "/nonexistent" },
    timeout: 10_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^Usage: mo-posture\.sh/);
  assert.equal(result.stderr, "");
});

for (const [variable, value] of [
  ["SHELLOPTS", "xtrace"],
  ["BASHOPTS", "expand_aliases"],
]) {
  test(`inherited ${variable} produces Bash status two without startup output`, () => {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeBashProfiles(home, bin);

    const result = runMatrix("bash", {
      BASH_ENV: join(home, ".bash_env"),
      HOME: home,
      PATH: `${bin}:/usr/bin:/bin`,
      [variable]: value,
    });
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.match(
      result.stderr,
      /MO_POSTURE_ENVIRONMENT shell=bash status=2 reason=inherited-shell-state/,
    );
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /^\+/m);
  });
}

test("zsh alias changes command kind even when the first path is unchanged", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeZshProfiles(home, bin, {
    zshrcExtra: "alias claude='claude --dangerously-skip-permissions'",
  });

  const result = runMatrix("zsh", {
    HOME: home,
    ZDOTDIR: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  assertRecords(result, "zsh", 1, /command|alias/);
  assert.match(result.stdout, /mode=-ic name=claude type=alias /);
});

test("bash function changes command kind even when the first path is unchanged", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeBashProfiles(home, bin, {
    bashrcExtra: `claude() { ${JSON.stringify(join(bin, "claude"))} "$@"; }`,
  });

  const result = runMatrix("bash", {
    BASH_ENV: join(home, ".bash_env"),
    HOME: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  assertRecords(result, "bash", 1, /file|function/);
  assert.match(result.stdout, /mode=-ic name=claude type=function /);
});

for (const shell of ["zsh", "bash"]) {
  for (const primitive of ["builtin", "command", "printf"]) {
    test(`${shell} fails closed when ${primitive} is a profile function`, () => {
      const { home, root } = fixture();
      const bin = providerBin(root, "wrapper-bin");
      const shadow = `${primitive}() { echo PRIVATE_DISPATCH_SENTINEL; }`;
      const environment = { HOME: home, PATH: `${bin}:/usr/bin:/bin` };
      if (shell === "zsh") {
        writeZshProfiles(home, bin, { zshenvExtra: shadow });
        environment.ZDOTDIR = home;
      } else {
        writeBashProfiles(home, bin, { bashEnvExtra: shadow, profileExtra: shadow });
        environment.BASH_ENV = join(home, ".bash_env");
      }

      const result = runMatrix(shell, environment);
      assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, new RegExp(`MO_POSTURE_MATRIX shell=${shell} status=2`));
      assert.match(result.stderr, new RegExp(`MO_POSTURE_SHADOW shell=${shell} mode=`));
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /PRIVATE_DISPATCH_SENTINEL/);
    });
  }
}

for (const shell of ["zsh", "bash"]) {
  test(`${shell} exits one when first paths diverge`, () => {
    const { home, root } = fixture();
    const ordinary = providerBin(root, "ordinary-bin");
    const login = providerBin(root, "login-bin");
    const environment = { HOME: home, PATH: `${ordinary}:/usr/bin:/bin` };
    if (shell === "zsh") {
      writeZshProfiles(home, ordinary, { loginPath: login });
      environment.ZDOTDIR = home;
    } else {
      writeBashProfiles(home, ordinary, { loginPath: login });
      environment.BASH_ENV = join(home, ".bash_env");
    }

    const result = runMatrix(shell, environment);
    assertRecords(result, shell, 1);
    assert.match(result.stdout, new RegExp(`path=${ordinary}/claude`));
    assert.match(result.stdout, new RegExp(`path=${login}/claude`));
  });
}

test("a consistently missing provider is explicit while the matrix exits zero", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin", ["claude", "codex"]);
  writeZshProfiles(home, bin);

  const result = runMatrix("zsh", {
    HOME: home,
    ZDOTDIR: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  assertRecords(result, "zsh", 0, /command|missing/);
  assert.equal(
    result.stdout
      .split("\n")
      .filter((line) => line.includes("name=opencode type=missing path=missing")).length,
    4,
  );
});

test("executable paths containing whitespace remain valid and unambiguous", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "Agent Tools");
  writeZshProfiles(home, bin);

  const result = runMatrix("zsh", {
    HOME: home,
    ZDOTDIR: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  assertRecords(result, "zsh", 0);
  assert.match(result.stdout, /Agent\\ Tools\/claude/);
});

test("a forged or malformed record produces status two without disclosure", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeZshProfiles(home, bin, {
    zprofileExtra: `printf '%s\\0' PRIVATE_SENTINEL >>"$MO_POSTURE_RECORD_FILE"`,
  });

  const result = runMatrix("zsh", {
    HOME: home,
    ZDOTDIR: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /PRIVATE_SENTINEL/);
  assert.match(result.stdout, /type=invalid path=invalid/);
});

test("an incomplete shell mode produces status two", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeZshProfiles(home, bin, { zprofileExtra: "exit 7" });

  const result = runMatrix("zsh", {
    HOME: home,
    ZDOTDIR: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /type=invalid path=invalid/);
});

test("status two takes precedence over path divergence", () => {
  const { home, root } = fixture();
  const ordinary = providerBin(root, "ordinary-bin");
  const login = providerBin(root, "login-bin");
  writeBashProfiles(home, ordinary, {
    loginPath: login,
    profileExtra: "trap 'exit 7' EXIT",
  });

  const result = runMatrix("bash", {
    BASH_ENV: join(home, ".bash_env"),
    HOME: home,
    PATH: `${ordinary}:/usr/bin:/bin`,
  });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /type=invalid path=invalid/);
});

for (const [label, records] of [
  [
    "wrong provider order",
    [
      { name: "codex", kind: "command", path: "/tmp/codex" },
      { name: "claude", kind: "command", path: "/tmp/claude" },
      { name: "opencode", kind: "command", path: "/tmp/opencode" },
    ],
  ],
  [
    "invalid command kind",
    [
      { name: "claude", kind: "external", path: "/tmp/claude" },
      { name: "codex", kind: "command", path: "/tmp/codex" },
      { name: "opencode", kind: "command", path: "/tmp/opencode" },
    ],
  ],
  [
    "relative executable path",
    [
      { name: "claude", kind: "command", path: "bin/claude" },
      { name: "codex", kind: "command", path: "/tmp/codex" },
      { name: "opencode", kind: "command", path: "/tmp/opencode" },
    ],
  ],
  [
    "incompatible missing record",
    [
      { name: "claude", kind: "missing", path: "/tmp/claude" },
      { name: "codex", kind: "command", path: "/tmp/codex" },
      { name: "opencode", kind: "command", path: "/tmp/opencode" },
    ],
  ],
  [
    "executable kind without a path",
    [
      { name: "claude", kind: "command", path: "missing" },
      { name: "codex", kind: "command", path: "/tmp/codex" },
      { name: "opencode", kind: "command", path: "/tmp/opencode" },
    ],
  ],
]) {
  test(`${label} produces status two`, () => {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeZshProfiles(home, bin, { zprofileExtra: zshExitRecordOverride(records) });

    const result = runMatrix("zsh", {
      HOME: home,
      ZDOTDIR: home,
      PATH: `${bin}:/usr/bin:/bin`,
    });
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /MO_POSTURE_MATRIX shell=zsh status=2/);
    assert.match(result.stdout, /type=invalid path=invalid/);
  });
}

test("a Bash file kind without a path produces status two", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeBashProfiles(home, bin, {
    profileExtra: bashExitRecordOverride([
      { name: "claude", kind: "file", path: "missing" },
      { name: "codex", kind: "file", path: "/tmp/codex" },
      { name: "opencode", kind: "file", path: "/tmp/opencode" },
    ]),
  });

  const result = runMatrix("bash", {
    BASH_ENV: join(home, ".bash_env"),
    HOME: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MO_POSTURE_MATRIX shell=bash status=2/);
  assert.match(result.stdout, /type=invalid path=invalid/);
});

test("all mode reports a separate status for each shell", () => {
  const { home, root } = fixture();
  const ordinary = providerBin(root, "ordinary-bin");
  const zshLogin = providerBin(root, "zsh-login-bin");
  writeZshProfiles(home, ordinary, { loginPath: zshLogin });
  writeBashProfiles(home, ordinary);

  const result = runMatrix("all", {
    BASH_ENV: join(home, ".bash_env"),
    HOME: home,
    ZDOTDIR: home,
    PATH: `${ordinary}:/usr/bin:/bin`,
  });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MO_POSTURE_MATRIX shell=zsh status=1/);
  assert.match(result.stdout, /MO_POSTURE_MATRIX shell=bash status=0/);
});

test("all mode gives unknown precedence across shells", () => {
  const { home, root } = fixture();
  const ordinary = providerBin(root, "ordinary-bin");
  const zshLogin = providerBin(root, "zsh-login-bin");
  writeZshProfiles(home, ordinary, { loginPath: zshLogin });
  writeBashProfiles(home, ordinary, { profileExtra: "trap 'exit 7' EXIT" });

  const result = runMatrix("all", {
    BASH_ENV: join(home, ".bash_env"),
    HOME: home,
    ZDOTDIR: home,
    PATH: `${ordinary}:/usr/bin:/bin`,
  });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MO_POSTURE_MATRIX shell=zsh status=1/);
  assert.match(result.stdout, /MO_POSTURE_MATRIX shell=bash status=2/);
});

test("an absent requested shell is reported as unknown", () => {
  const { home, root } = fixture();
  const path = join(root, "minimal-path");
  const scratch = join(root, "tmp");
  mkdirSync(path);
  mkdirSync(scratch);
  symlinkSync("/bin/bash", join(path, "bash"));
  symlinkSync("/usr/bin/mktemp", join(path, "mktemp"));
  symlinkSync("/bin/rm", join(path, "rm"));

  const result = runMatrix("zsh", { HOME: home, PATH: path, TMPDIR: scratch });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MO_POSTURE_MATRIX shell=zsh status=2/);
  assert.match(result.stderr, /requested shell is not installed: zsh/);
});

test("normal Bash completion terminates profile background descendants before parsing", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  const descendantPidFile = join(root, "normal-descendants.pid");
  writeBashProfiles(home, bin, {
    profileExtra: [
      "/bin/sh -c 'trap \"\" HUP TERM; exec sleep 30' &",
      `/usr/bin/printf '%s\\n' $! >>${JSON.stringify(descendantPidFile)}`,
    ].join("\n"),
  });

  const result = runMatrix("bash", {
    BASH_ENV: join(home, ".bash_env"),
    HOME: home,
    PATH: `${bin}:/usr/bin:/bin`,
  });
  const descendantPids = readFileSync(descendantPidFile, "utf8")
    .trim()
    .split("\n")
    .map((value) => Number.parseInt(value, 10));
  try {
    assertRecords(result, "bash", 0);
    assert.equal(descendantPids.length, 2);
    for (const pid of descendantPids) {
      assert.equal(processIsAlive(pid), false, `profile descendant survived normal exit: ${pid}`);
    }
  } finally {
    for (const pid of descendantPids) {
      if (processIsAlive(pid)) process.kill(pid, "SIGKILL");
    }
  }
});

test("a TERM after traps but before temporary-directory creation exits 143 without a leak", () => {
  const { root } = fixture();
  const scratch = join(root, "tmp");
  mkdirSync(scratch);
  const script = mutant(
    root,
    "early-term.sh",
    "builtin trap 'request_signal 143' TERM\n\numask 077",
    "builtin trap 'request_signal 143' TERM\n" + 'builtin kill -TERM "$$"\n\n' + "umask 077",
  );

  const result = spawnSync(script, ["--shell", "zsh"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, TMPDIR: scratch },
    timeout: 10_000,
  });
  assert.equal(result.status, 143, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(readdirSync(scratch), []);
});

test("the launch-window guard captures the child before honoring TERM", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  const scratch = join(root, "tmp");
  mkdirSync(scratch);
  writeZshProfiles(home, bin, { zshenvExtra: "trap '' TERM\nsleep 30" });
  const { pidFile, script } = launchWindowScript(root, "launch-window");

  const result = runMatrix(
    "zsh",
    {
      HOME: home,
      ZDOTDIR: home,
      PATH: `${bin}:/usr/bin:/bin`,
      TMPDIR: scratch,
    },
    [],
    script,
  );
  const measuredShellPid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
  assert.equal(result.status, 143, `${result.stdout}\n${result.stderr}`);
  assert.equal(processIsAlive(measuredShellPid), false, "launch-window child survived TERM");
  assert.deepEqual(readdirSync(scratch), []);
});

test("reentrant shutdown preserves the first signal status", async () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  const scratch = join(root, "tmp");
  mkdirSync(scratch);
  writeZshProfiles(home, bin, { zshenvExtra: "sleep 30" });
  const script = reentrantShutdownScript(root, "reentrant-shutdown");
  const child = spawn(script, ["--shell", "zsh"], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOME: home,
      MO_POSTURE_TEST_REENTRANT: "1",
      PATH: `${bin}:/usr/bin:/bin`,
      TMPDIR: scratch,
      ZDOTDIR: home,
    },
    stdio: "ignore",
  });
  const deadline = Date.now() + 5_000;
  while (!readdirSync(scratch).some((entry) => entry.startsWith("mo-posture."))) {
    assert.ok(Date.now() < deadline, "reentrant fixture did not create its private directory");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  child.kill("SIGTERM");
  const outcome = await waitForExit(child);
  assert.equal(outcome.code, 143, JSON.stringify(outcome));
  assert.deepEqual(readdirSync(scratch), []);
});

test("a reported process-group quiescence failure makes the matrix unknown", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeBashProfiles(home, bin);
  const script = forcedUnquiescedScript(root, "forced-unquiesced");
  const result = runMatrix(
    "bash",
    {
      BASH_ENV: join(home, ".bash_env"),
      HOME: home,
      MO_POSTURE_TEST_UNQUIESCED: "1",
      PATH: `${bin}:/usr/bin:/bin`,
    },
    [],
    script,
  );
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MO_POSTURE_MATRIX shell=bash status=2/);
});

test("process-group quiescence happens before the first evidence read", () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  writeBashProfiles(home, bin, {
    profileExtra:
      '/bin/sh -c \'trap "" HUP TERM; ' +
      'while [ ! -e "${MO_POSTURE_RECORD_FILE%.records}.reading" ]; do sleep 0.01; done; ' +
      '/usr/bin/printf "%s\\0%s\\0%s\\0" extra file /tmp/extra >>"$MO_POSTURE_RECORD_FILE"; ' +
      "exec sleep 30' &",
  });
  const script = readOrderScript(root, "read-order");
  const result = runMatrix(
    "bash",
    {
      BASH_ENV: join(home, ".bash_env"),
      HOME: home,
      PATH: `${bin}:/usr/bin:/bin`,
    },
    [],
    script,
  );
  assertRecords(result, "bash", 0);
});

test("two TERM signals to only the runner keep code 143 and stop its descendant group", async () => {
  const { home, root } = fixture();
  const bin = providerBin(root, "wrapper-bin");
  const scratch = join(root, "tmp");
  const descendantPidFile = join(root, "descendant.pid");
  mkdirSync(scratch);
  writeZshProfiles(home, bin, {
    zprofileExtra: [
      "/bin/sh -c 'trap \"\" TERM; while :; do sleep 1; done' &",
      `printf '%s\\n' $! >${JSON.stringify(descendantPidFile)}`,
      "wait",
    ].join("\n"),
  });

  const child = spawn(SCRIPT, ["--shell", "zsh"], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOME: home,
      ZDOTDIR: home,
      PATH: `${bin}:/usr/bin:/bin`,
      TMPDIR: scratch,
    },
    stdio: "ignore",
  });
  const deadline = Date.now() + 5_000;
  let descendantPid;
  while (descendantPid === undefined) {
    try {
      descendantPid = Number.parseInt(readFileSync(descendantPidFile, "utf8"), 10);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    assert.ok(Date.now() < deadline, "profile did not report its descendant PID");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 1);
  assert.ok(processIsAlive(descendantPid), "profile descendant was not running before TERM");
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 10));
  child.kill("SIGTERM");
  const outcome = await waitForExit(child);
  assert.equal(outcome.code, 143, JSON.stringify(outcome));
  assert.deepEqual(readdirSync(scratch), []);
  assert.equal(
    await waitUntilProcessGone(descendantPid),
    true,
    "profile descendant survived runner TERM",
  );
});

test("selected mutation campaign reports every tried guard and zero survivors", async () => {
  const survivors = [];
  let tried = 0;
  const recordMutation = (name, killed) => {
    tried += 1;
    if (!killed) survivors.push(name);
  };

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    const scratch = join(root, "tmp");
    mkdirSync(scratch);
    writeZshProfiles(home, bin, { zshenvExtra: "sleep 30" });
    const script = reentrantShutdownScript(root, "ignore-shutdown-idempotence.sh", true);
    const child = spawn(script, ["--shell", "zsh"], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOME: home,
        MO_POSTURE_TEST_REENTRANT: "1",
        PATH: `${bin}:/usr/bin:/bin`,
        TMPDIR: scratch,
        ZDOTDIR: home,
      },
      stdio: "ignore",
    });
    const deadline = Date.now() + 5_000;
    while (!readdirSync(scratch).some((entry) => entry.startsWith("mo-posture."))) {
      assert.ok(Date.now() < deadline, "idempotence mutant did not create its private directory");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    child.kill("SIGTERM");
    const outcome = await waitForExit(child);
    recordMutation("shutdown-idempotence", outcome.code !== 143);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeBashProfiles(home, bin);
    const script = forcedUnquiescedScript(root, "ignore-unquiesced-status.sh", true);
    const result = runMatrix(
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        MO_POSTURE_TEST_UNQUIESCED: "1",
        PATH: `${bin}:/usr/bin:/bin`,
      },
      [],
      script,
    );
    recordMutation("unquiesced-status", result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeBashProfiles(home, bin, {
      profileExtra:
        '/bin/sh -c \'trap "" HUP TERM; ' +
        'while [ ! -e "${MO_POSTURE_RECORD_FILE%.records}.reading" ]; do sleep 0.01; done; ' +
        '/usr/bin/printf "%s\\0%s\\0%s\\0" extra file /tmp/extra >>"$MO_POSTURE_RECORD_FILE"; ' +
        "exec sleep 30' &",
    });
    const script = readOrderScript(root, "postpone-quiescence.sh", true);
    const result = runMatrix(
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
      },
      [],
      script,
    );
    recordMutation("quiescence-before-read", result.status !== 0);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    const descendantPidFile = join(root, "normal-mutation-descendants.pid");
    writeBashProfiles(home, bin, {
      profileExtra: [
        "/bin/sh -c 'trap \"\" HUP TERM; exec sleep 30' &",
        `/usr/bin/printf '%s\\n' $! >>${JSON.stringify(descendantPidFile)}`,
      ].join("\n"),
    });
    const script = mutant(
      root,
      "ignore-normal-group.sh",
      "    stop_active_child || mode_status=2",
      "    active_child_pid=\n    active_child_pgid= # mutation: abandon normal descendants",
    );
    const result = runMatrix(
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
      },
      [],
      script,
    );
    const descendantPids = readFileSync(descendantPidFile, "utf8")
      .trim()
      .split("\n")
      .map((value) => Number.parseInt(value, 10));
    const descendantsSurvived = descendantPids.some(processIsAlive);
    recordMutation("normal-group-quiescence", result.status === 0 && descendantsSurvived);
    for (const pid of descendantPids) {
      if (processIsAlive(pid)) process.kill(pid, "SIGKILL");
    }
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    const scratch = join(root, "tmp");
    mkdirSync(scratch);
    writeZshProfiles(home, bin, { zshenvExtra: "trap '' TERM\nsleep 30" });
    const { pidFile, script } = launchWindowScript(root, "ignore-launch-window.sh", true);
    const result = runMatrix(
      "zsh",
      {
        HOME: home,
        ZDOTDIR: home,
        PATH: `${bin}:/usr/bin:/bin`,
        TMPDIR: scratch,
      },
      [],
      script,
    );
    const measuredShellPid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
    const childSurvived = processIsAlive(measuredShellPid);
    recordMutation("launch-window", result.status === 143 && childSurvived);
    if (childSurvived) process.kill(-measuredShellPid, "SIGKILL");
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeBashProfiles(home, bin);
    const script = mutant(
      root,
      "ignore-env-scan-failure.sh",
      '  if ! /usr/bin/env -0 >"$environment_file" 2>"$environment_error_file"; then\n' +
        "    environment_scan_ok=0\n" +
        "  fi",
      "  { /usr/bin/printf 'PATH=/bin\\0'; /usr/bin/false; } " +
        '>"$environment_file" 2>"$environment_error_file" || true',
    );
    const result = runMatrix(
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
      },
      [],
      script,
    );
    recordMutation("environment-scan-status", result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeBashProfiles(home, bin);
    const emptyScript = emptyEnvironmentScript(root, "empty-env-instrumented.sh");
    const script = mutantFrom(
      root,
      "ignore-empty-env.sh",
      emptyScript,
      '  [[ -s "$environment_file" ]] || environment_scan_ok=0',
      ": # mutation: accept an empty environment scan",
    );
    const result = runMatrix(
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
      },
      [],
      script,
    );
    recordMutation("empty-environment-scan", result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeBashProfiles(home, bin);
    const script = mutant(
      root,
      "ignore-percent-function-name.sh",
      "BASH_FUNC_*%% | BASH_FUNC_*'()') inherited_bash_functions=1 ;;",
      "BASH_FUNC_*'()') inherited_bash_functions=1 ;;",
    );
    const result = runThroughExportedFunction(
      "read",
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
      },
      script,
    );
    recordMutation("percent-function-name", result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeBashProfiles(home, bin);
    const script = mutant(
      root,
      "ignore-parenthesis-function-name.sh",
      "BASH_FUNC_*%% | BASH_FUNC_*'()') inherited_bash_functions=1 ;;",
      "BASH_FUNC_*%%) inherited_bash_functions=1 ;;",
    );
    const result = runMatrix(
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        "BASH_FUNC_legacy()": "() { :; }",
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
      },
      [],
      script,
    );
    recordMutation("parenthesis-function-name", result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeBashProfiles(home, bin);
    const script = mutant(
      root,
      "ignore-exported-options.sh",
      "*x*) inherited_bash_options=1 ;;",
      "*x*) : ;; # mutation: accept exported option state",
    );
    const result = runMatrix(
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
        SHELLOPTS: "xtrace",
      },
      [],
      script,
    );
    recordMutation("exported-option", result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeZshProfiles(home, bin, { zshrcExtra: "alias claude='claude --model opus'" });
    const script = mutant(
      root,
      "no-kind-divergence.sh",
      '"$kind" != "${baseline_kinds[$provider_index]}" ||',
      "0 -eq 1 || # mutation: ignore command-kind divergence",
    );
    const result = runMatrix(
      "zsh",
      { HOME: home, ZDOTDIR: home, PATH: `${bin}:/usr/bin:/bin` },
      [],
      script,
    );
    recordMutation("kind-divergence", result.status !== 1);
  }

  {
    const { home, root } = fixture();
    const ordinary = providerBin(root, "ordinary-bin");
    const login = providerBin(root, "login-bin");
    writeBashProfiles(home, ordinary, { loginPath: login });
    const script = mutant(
      root,
      "no-divergence.sh",
      "matrix_status=1\n      fi",
      ": # mutation: ignore divergence\n      fi",
    );
    const result = runMatrix(
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        PATH: `${ordinary}:/usr/bin:/bin`,
      },
      [],
      script,
    );
    recordMutation("path-divergence", result.status !== 1);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeZshProfiles(home, bin, {
      zprofileExtra:
        `TRAPEXIT() { (( ZSH_SUBSHELL == 0 )) && ` +
        `printf '%s\\0%s\\0%s\\0' extra command /tmp/extra ` +
        `>>"$MO_POSTURE_RECORD_FILE"; }`,
    });
    const script = mutant(
      root,
      "no-record-count.sh",
      '[[ -z "$field" && $field_count -eq $expected_fields ]] || malformed=1',
      ": # mutation: ignore exact record count",
    );
    const result = runMatrix(
      "zsh",
      { HOME: home, ZDOTDIR: home, PATH: `${bin}:/usr/bin:/bin` },
      [],
      script,
    );
    recordMutation("record-count", result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeBashProfiles(home, bin, { profileExtra: "trap 'exit 7' EXIT" });
    const script = mutant(
      root,
      "no-child-status.sh",
      "[[ $mode_status -eq 0 ]] || malformed=1",
      ": # mutation: ignore child status",
    );
    const result = runMatrix(
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
      },
      [],
      script,
    );
    recordMutation("child-status", result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    const scratch = join(root, "tmp");
    mkdirSync(scratch);
    writeZshProfiles(home, bin, { stdoutNoise: "PRIVATE_PROFILE_OUTPUT" });
    const script = mutant(root, "no-privileged-start.sh", "#!/bin/bash -p", "#!/bin/bash");
    const result = runThroughExportedFunction(
      "read",
      "zsh",
      {
        HOME: home,
        ZDOTDIR: home,
        PATH: `${bin}:/usr/bin:/bin`,
        TMPDIR: scratch,
      },
      script,
    );
    recordMutation(
      "privileged-bootstrap",
      /INHERITED_FUNCTION_SENTINEL/.test(`${result.stdout}${result.stderr}`) ||
        readdirSync(scratch).some((name) => name.startsWith("mo-posture.")),
    );
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeBashProfiles(home, bin);
    const script = mutant(
      root,
      "ignore-inherited-state.sh",
      "unsafe_bash_environment=1\nfi",
      "unsafe_bash_environment=0 # mutation: accept inherited state\nfi",
    );
    const result = runMatrix(
      "bash",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
        SHELLOPTS: "xtrace",
      },
      [],
      script,
    );
    recordMutation("environment-policy", result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeZshProfiles(home, bin, { zshenvExtra: "builtin() { echo PRIVATE_SENTINEL; }" });
    const script = mutant(
      root,
      "no-dispatch-guard.sh",
      "if (( ${+functions[builtin]} || ${+aliases[builtin]} ||\n" +
        "      ${+functions[command]} || ${+aliases[command]} ||\n" +
        "      ${+functions[printf]} || ${+aliases[printf]} )); then",
      "if (( 0 )); then # mutation: skip dispatch validation",
    );
    const result = runMatrix(
      "zsh",
      { HOME: home, ZDOTDIR: home, PATH: `${bin}:/usr/bin:/bin` },
      [],
      script,
    );
    recordMutation("dispatch-validation", !/MO_POSTURE_SHADOW/.test(result.stderr));
  }

  for (const [name, target, records] of [
    [
      "provider-name",
      '[[ "$name" == "${providers[$provider_index]}" ]] || malformed=1',
      [
        { name: "codex", kind: "command", path: "/tmp/codex" },
        { name: "claude", kind: "command", path: "/tmp/claude" },
        { name: "opencode", kind: "command", path: "/tmp/opencode" },
      ],
    ],
    [
      "kind-validity",
      'kind_is_valid "$shell_name" "$kind" || malformed=1',
      [
        { name: "claude", kind: "external", path: "/tmp/claude" },
        { name: "codex", kind: "command", path: "/tmp/codex" },
        { name: "opencode", kind: "command", path: "/tmp/opencode" },
      ],
    ],
    [
      "absolute-path",
      '[[ "$path" == missing || "$path" == /* ]] || malformed=1',
      [
        { name: "claude", kind: "command", path: "bin/claude" },
        { name: "codex", kind: "command", path: "/tmp/codex" },
        { name: "opencode", kind: "command", path: "/tmp/opencode" },
      ],
    ],
    [
      "missing-path-consistency",
      '[[ "$path" != missing || "$kind" == missing ||\n' +
        '           "$kind" == alias || "$kind" == function ]] || malformed=1',
      [
        { name: "claude", kind: "command", path: "missing" },
        { name: "codex", kind: "command", path: "/tmp/codex" },
        { name: "opencode", kind: "command", path: "/tmp/opencode" },
      ],
    ],
  ]) {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    writeZshProfiles(home, bin, { zprofileExtra: zshExitRecordOverride(records) });
    const script = mutant(root, `no-${name}.sh`, target, `: # mutation: skip ${name}`);
    const result = runMatrix(
      "zsh",
      { HOME: home, ZDOTDIR: home, PATH: `${bin}:/usr/bin:/bin` },
      [],
      script,
    );
    recordMutation(name, result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const ordinary = providerBin(root, "ordinary-bin");
    const zshLogin = providerBin(root, "zsh-login-bin");
    writeZshProfiles(home, ordinary, { loginPath: zshLogin });
    writeBashProfiles(home, ordinary);
    const script = mutant(
      root,
      "no-zsh-summary.sh",
      "printf 'MO_POSTURE_MATRIX shell=zsh status=%s\\n' \"$shell_status\"",
      ": # mutation: omit zsh summary",
    );
    const result = runMatrix(
      "all",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        ZDOTDIR: home,
        PATH: `${ordinary}:/usr/bin:/bin`,
      },
      [],
      script,
    );
    recordMutation("per-shell-summary", !/MO_POSTURE_MATRIX shell=zsh/.test(result.stdout));
  }

  {
    const { home, root } = fixture();
    const ordinary = providerBin(root, "ordinary-bin");
    const zshLogin = providerBin(root, "zsh-login-bin");
    writeZshProfiles(home, ordinary, { loginPath: zshLogin });
    writeBashProfiles(home, ordinary, { profileExtra: "trap 'exit 7' EXIT" });
    const script = mutant(
      root,
      "no-overall-precedence.sh",
      "printf 'MO_POSTURE_MATRIX shell=bash status=%s\\n' \"$shell_status\"\n" +
        "  if [[ $shell_status -eq 2 ]]; then\n" +
        "    overall_status=2",
      "printf 'MO_POSTURE_MATRIX shell=bash status=%s\\n' \"$shell_status\"\n" +
        "  if [[ $shell_status -eq 2 ]]; then\n" +
        "    : # mutation: ignore Bash status-two precedence",
    );
    const result = runMatrix(
      "all",
      {
        BASH_ENV: join(home, ".bash_env"),
        HOME: home,
        ZDOTDIR: home,
        PATH: `${ordinary}:/usr/bin:/bin`,
      },
      [],
      script,
    );
    recordMutation("overall-precedence", result.status !== 2);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    const scratch = join(root, "tmp");
    mkdirSync(scratch);
    writeZshProfiles(home, bin, { zprofileExtra: "sleep 0.5" });
    const script = mutant(
      root,
      "ignore-term.sh",
      "builtin trap 'request_signal 143' TERM",
      "builtin trap ':' TERM",
    );
    const child = spawn(script, ["--shell", "zsh"], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOME: home,
        ZDOTDIR: home,
        PATH: `${bin}:/usr/bin:/bin`,
        TMPDIR: scratch,
      },
      stdio: "ignore",
    });
    const deadline = Date.now() + 5_000;
    while (!readdirSync(scratch).some((entry) => entry.startsWith("mo-posture."))) {
      assert.ok(Date.now() < deadline, "signal mutant did not create its private directory");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    child.kill("SIGTERM");
    const outcome = await waitForExit(child);
    recordMutation("signal-handler", outcome.code !== 143);
  }

  {
    const { home, root } = fixture();
    const bin = providerBin(root, "wrapper-bin");
    const scratch = join(root, "tmp");
    const descendantPidFile = join(root, "mutation-descendant.pid");
    mkdirSync(scratch);
    writeZshProfiles(home, bin, {
      zprofileExtra: [
        "/bin/sh -c 'trap \"\" TERM; while :; do sleep 1; done' &",
        `printf '%s\\n' $! >${JSON.stringify(descendantPidFile)}`,
        "wait",
      ].join("\n"),
    });
    const script = mutantAll(
      root,
      "ignore-kill-escalation.sh",
      'builtin kill -KILL -- "$process_group" 2>/dev/null || stop_status=1',
      ": # mutation: omit KILL escalation",
    );
    const child = spawn(script, ["--shell", "zsh"], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOME: home,
        ZDOTDIR: home,
        PATH: `${bin}:/usr/bin:/bin`,
        TMPDIR: scratch,
      },
      stdio: "ignore",
    });
    const deadline = Date.now() + 5_000;
    let descendantPid;
    while (descendantPid === undefined) {
      try {
        descendantPid = Number.parseInt(readFileSync(descendantPidFile, "utf8"), 10);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      assert.ok(Date.now() < deadline, "KILL mutant did not report its descendant PID");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    child.kill("SIGTERM");
    const outcome = await waitForExit(child);
    const descendantSurvived = processIsAlive(descendantPid);
    recordMutation("kill-escalation", outcome.code === 143 && descendantSurvived);
    if (descendantSurvived) process.kill(descendantPid, "SIGKILL");
  }

  assert.equal(tried, 25);
  assert.deepEqual(survivors, [], `mutation sweep: tried=${tried} survived=${survivors.length}`);
});
