/**
 * Verify the installed CLI help snapshots that constrain Issue and Orca calls.
 *
 * The fixtures are bounded observations rather than a native-CLI proxy. They
 * protect §A-ISSUE-01, §A-SESSION-01 and §A-DELIVERY-01.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
function recording(name, source = null) {
  const document = JSON.parse(
    source ?? readFileSync(join(ROOT, "tests", "fixtures", "recorded-surfaces", name), "utf8"),
  );
  assert.equal(document.contract, "recorded-cli-help.v2");
  assert.match(document.binary, /^[a-z][a-z0-9-]*$/u);
  assert.match(document.binaryIdentity, /^home-relative:[A-Za-z0-9._/-]+$/u);
  assert.match(document.resolution, /one absolute .*home prefix redacted/u);
  assert.doesNotMatch(document.binaryIdentity, /\/(?:home|Users|mnt)\//u);
  assert.equal(typeof document.version, "string");
  assert.ok(document.version.length > 0);
  assert.ok(Array.isArray(document.observations));
  assert.ok(document.observations.length > 0);
  const commands = new Set();
  for (const observation of document.observations) {
    assert.equal(observation.invokedBinary, document.binaryIdentity);
    assert.match(observation.command, new RegExp(`^${document.binary} `, "u"));
    assert.equal(observation.exitStatus, 0);
    assert.match(observation.provenance, /^stdout(?: |$)/u);
    assert.equal(typeof observation.output, "string");
    assert.ok(observation.output.length > 0 && Buffer.byteLength(observation.output) <= 4096);
    assert.equal(commands.has(observation.command), false);
    commands.add(observation.command);
  }
  return {
    ...document,
    output(command) {
      const observation = document.observations.find((item) => item.command === command);
      assert.ok(observation, `${name}: missing ${command}`);
      return observation.output;
    },
  };
}

test("recorded GitHub surfaces preserve asymmetric issue search and body files", () => {
  const help = recording("gh-2.96.0.fixture");
  assert.match(help.output("gh issue list --help"), /\{open\|closed\|all\}[\s\S]*stateReason/u);
  assert.match(help.output("gh search issues --help"), /\{open\|closed\}/u);
  assert.doesNotMatch(help.output("gh search issues --help"), /stateReason/u);
  assert.match(help.output("gh issue create --help"), /--body-file/u);
  assert.match(help.output("gh issue comment --help"), /--body-file/u);
});

test("recorded GitLab surfaces preserve pagination and safe body capabilities", () => {
  const help = recording("glab-1.117.0.fixture");
  const list = help.output("glab issue list --help");
  assert.match(list, /--all[\s\S]*--closed[\s\S]*--per-page/u);
  assert.doesNotMatch(list, /--state/u);
  assert.match(help.output("glab issue create --help"), /--description-file/u);
  assert.doesNotMatch(help.output("glab issue note --help"), /--body-file/u);
  assert.match(help.output("glab api --help"), /--header[\s\S]*--input/u);
});

test("recorded Orca surfaces expose both guides and owned-resource operations", () => {
  const help = recording("orca-installed.fixture");
  assert.match(help.output("orca skills list --json"), /orca-cli/u);
  assert.match(help.output("orca skills list --json"), /orchestration/u);
  for (const section of ["project", "repo", "worktree", "terminal", "orchestration"]) {
    assert.match(help.output(`orca ${section} --help`), /Commands:/u);
  }
  for (const guide of ["orchestration", "orca-cli"]) {
    const command = help.observations.find(({ command: value }) =>
      value.startsWith(`orca skills get ${guide} --json |`),
    );
    assert.ok(command, `${guide}: retrieval observation missing`);
    const evidence = JSON.parse(command.output);
    assert.equal(evidence.name, guide);
    assert.ok(evidence.markdown_bytes > 1000);
    assert.deepEqual(evidence.markdown_prefix.slice(0, 2), ["---", `name: ${guide}`]);
  }
  const expectedCommands = [
    "run-create",
    "run-use",
    "run-current",
    "run-list",
    "run-show",
    "send",
    "check",
    "reply",
    "inbox",
    "task-create",
    "task-list",
    "task-update",
    "worker-start",
    "worker-show",
    "worker-read",
    "worker-stop",
    "worker-abandon",
    "worker-release",
    "worker-retain",
    "worker-list",
    "dispatch",
    "dispatch-show",
    "ask",
    "coordinator-start",
    "coordinator-stop",
    "gate-create",
    "gate-resolve",
    "gate-list",
    "reset",
  ];
  const observedCommands = help
    .output("orca orchestration --help")
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/u)[0]);
  assert.deepEqual(observedCommands, expectedCommands);
});

test("Orca guide and ordered-help evidence fails closed under mutation", () => {
  const source = readFileSync(
    join(ROOT, "tests", "fixtures", "recorded-surfaces", "orca-installed.fixture"),
    "utf8",
  );
  const valid = JSON.parse(source);
  for (const mutate of [
    (value) => {
      value.observations = value.observations.filter(
        ({ command }) => !command.startsWith("orca skills get orchestration"),
      );
    },
    (value) => {
      const guide = value.observations.find(({ command }) =>
        command.startsWith("orca skills get orca-cli"),
      );
      guide.output = guide.output.replace('"markdown_bytes":24457', '"markdown_bytes":0');
    },
    (value) => {
      const help = value.observations.find(
        ({ command }) => command === "orca orchestration --help",
      );
      help.output = help.output.replace(
        / {2}worker-release[^\n]+\n {2}worker-retain/u,
        "  worker-retain",
      );
    },
  ]) {
    const changed = structuredClone(valid);
    mutate(changed);
    const parsed = recording("mutated-orca.fixture", JSON.stringify(changed));
    assert.throws(() => {
      for (const guide of ["orchestration", "orca-cli"]) {
        const observation = parsed.observations.find(({ command }) =>
          command.startsWith(`orca skills get ${guide} --json |`),
        );
        assert.ok(observation);
        assert.ok(JSON.parse(observation.output).markdown_bytes > 1000);
      }
      const commands = parsed
        .output("orca orchestration --help")
        .split("\n")
        .slice(1)
        .map((line) => line.trim().split(/\s+/u)[0]);
      assert.equal(commands.length, 29);
      assert.equal(commands[17], "worker-release");
      assert.equal(commands[18], "worker-retain");
    });
  }
});

test("recording metadata and field provenance fail closed under mutation", () => {
  const valid = JSON.parse(
    readFileSync(join(ROOT, "tests", "fixtures", "recorded-surfaces", "gh-2.96.0.fixture"), "utf8"),
  );
  for (const mutate of [
    (value) => delete value.binaryIdentity,
    (value) => delete value.observations[0].provenance,
    (value) => (value.observations[0].exitStatus = 1),
    (value) => (value.observations[0].command = "glab issue list --help"),
    (value) => (value.observations[0].invokedBinary = "home-relative:.local/bin/other"),
  ]) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.throws(() => recording("mutated.fixture", JSON.stringify(changed)));
  }
});
