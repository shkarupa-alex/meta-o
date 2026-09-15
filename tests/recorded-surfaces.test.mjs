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
  assert.match(document.resolvedBinary, /^\//u);
  assert.equal(typeof document.version, "string");
  assert.ok(document.version.length > 0);
  assert.ok(Array.isArray(document.observations));
  assert.ok(document.observations.length > 0);
  const commands = new Set();
  for (const observation of document.observations) {
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
  assert.match(
    help.output("orca orchestration --help"),
    /check[\s\S]*reply[\s\S]*worker-start[\s\S]*worker-list[\s\S]*worker-release/u,
  );
});

test("recording metadata and field provenance fail closed under mutation", () => {
  const valid = JSON.parse(
    readFileSync(join(ROOT, "tests", "fixtures", "recorded-surfaces", "gh-2.96.0.fixture"), "utf8"),
  );
  for (const mutate of [
    (value) => delete value.resolvedBinary,
    (value) => delete value.observations[0].provenance,
    (value) => (value.observations[0].exitStatus = 1),
    (value) => (value.observations[0].command = "glab issue list --help"),
  ]) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.throws(() => recording("mutated.fixture", JSON.stringify(changed)));
  }
});
