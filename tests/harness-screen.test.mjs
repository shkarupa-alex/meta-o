/**
 * Hold the screen classifier that stands between a run and its task bytes.
 *
 * Protects §A-DELIVERY-01.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  SCREENS,
  classifyScreen,
  normalizeScreen,
  screenLine,
  trustStep,
} from "../shared/scripts/mo-harness-screen.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SURFACES = join(ROOT, "tests", "fixtures", "recorded-surfaces");

const frame = (name) => readFileSync(join(SURFACES, name), "utf8");

const OWNED = {
  terminalCreatedByRun: true,
  terminalWorktreeRealPath: "/tmp/mo-trust-probe",
  trustRealPath: "/tmp/mo-trust-probe",
  worktreeIsRunResource: true,
  worktreeIsNamedProjectRoot: false,
};

test("every recorded frame classifies as the surface it was captured from", () => {
  const observed = readdirSync(SURFACES)
    .filter((name) => name.endsWith(".screen"))
    .sort()
    .map((name) => {
      const verdict = classifyScreen(frame(name));
      return `${name} ${verdict.state} ${verdict.action} ${verdict.harness}`;
    });
  assert.deepEqual(observed, [
    "claude-prompt.screen agent_prompt deliver claude",
    "claude-trust-no.screen trust_ui accept_trust claude",
    "claude-trust-yes.screen trust_ui confirm_trust claude",
    "codex-prompt.screen agent_prompt deliver codex",
    "opencode-prompt.screen agent_prompt deliver opencode",
    "shell-prompt.screen shell_prompt refuse shell",
  ]);
});

test("each stored frame says where it came from", () => {
  const provenance = JSON.parse(readFileSync(join(SURFACES, "screen-provenance.json"), "utf8"));
  const recorded = provenance.frames.map((entry) => entry.file).sort();
  const stored = readdirSync(SURFACES)
    .filter((name) => name.endsWith(".screen"))
    .sort();
  assert.deepEqual(recorded, stored);
  for (const entry of provenance.frames) {
    assert.ok(entry.how.length > 20, `${entry.file}: no capture recorded`);
    assert.ok(entry.trimmed.length > 0, `${entry.file}: trimming not stated`);
  }
});

test("the dialog's own highlight decides the next keystroke, not the option order", () => {
  const no = classifyScreen(frame("claude-trust-no.screen"));
  assert.equal(no.action, "accept_trust");
  assert.equal(no.path, "/tmp/mo-trust-probe");
  const yes = classifyScreen(frame("claude-trust-yes.screen"));
  assert.equal(yes.action, "confirm_trust");
  // Captured deliberately in a directory whose name carries both: a path read
  // by column position rather than by content loses exactly these.
  assert.equal(yes.path, "/tmp/mo trust ~probe2");
});

test("a banner above an empty composer is still an agent prompt", () => {
  const banner = `✓ Update available · restarting…\n${frame("claude-prompt.screen")}`;
  const verdict = classifyScreen(banner);
  assert.equal(verdict.state, "agent_prompt");
  assert.equal(verdict.action, "deliver");
});

test("a composer holding a draft receives nothing", () => {
  const typed = frame("codex-prompt.screen").replace("› Ask Codex to do anything", "› rm -rf /");
  const verdict = classifyScreen(typed);
  assert.equal(verdict.state, "agent_prompt");
  assert.equal(verdict.action, "refuse");
  assert.equal(verdict.reason, "composer_not_empty");
});

test("an unseen screen and an ambiguous one both refuse", () => {
  const unknown = classifyScreen("Welcome to Harness 9.\n\nPress any key.\n");
  assert.equal(unknown.state, "unknown");
  assert.equal(unknown.reason, "screen_unrecognized");
  // Two recorded screens in one frame is not twice the evidence; it is a frame
  // no recorded capture describes.
  const both = `${frame("claude-trust-no.screen")}\n${frame("shell-prompt.screen")}`;
  const ambiguous = classifyScreen(both);
  assert.equal(ambiguous.state, "unknown");
  assert.equal(ambiguous.reason, "screen_ambiguous");
});

test("a trust dialog missing its workspace header is unreadable, not empty", () => {
  const cut = frame("claude-trust-no.screen").replace("Accessing workspace:", "Accessing:");
  assert.equal(classifyScreen(cut).state, "unknown");
  const headerOnly = frame("claude-trust-no.screen").replace(" /tmp/mo-trust-probe\n", "");
  const verdict = classifyScreen(headerOnly);
  assert.equal(verdict.state, "unknown");
  assert.equal(verdict.reason, "path_unreadable");
});

test("a similar but foreign path is a human's decision", () => {
  const screen = classifyScreen(frame("claude-trust-no.screen"));
  const near = trustStep(screen, { ...OWNED, terminalWorktreeRealPath: "/tmp/mo-trust-probe2" });
  assert.deepEqual(near, { action: "needs_human", reason: "path_mismatch" });
  assert.deepEqual(trustStep(screen, OWNED), { action: "accept_trust", reason: "owned" });
});

test("each ownership condition refuses on its own", () => {
  const screen = classifyScreen(frame("claude-trust-no.screen"));
  assert.equal(
    trustStep(screen, { ...OWNED, terminalCreatedByRun: false }).reason,
    "terminal_not_owned",
  );
  assert.equal(trustStep(screen, { ...OWNED, trustRealPath: undefined }).reason, "path_mismatch");
  assert.equal(
    trustStep(screen, { ...OWNED, worktreeIsRunResource: false }).reason,
    "worktree_unclaimed",
  );
  // The third condition is a disjunction: a run resource or a root the user
  // named at the call. Either alone is enough, and that has to stay true.
  assert.equal(
    trustStep(screen, { ...OWNED, worktreeIsRunResource: false, worktreeIsNamedProjectRoot: true })
      .action,
    "accept_trust",
  );
  assert.equal(trustStep(classifyScreen("nothing"), OWNED).reason, "screen_not_trust_ui");
});

test("normalization drops padding without merging a changed dialog into a known one", () => {
  const padded = frame("claude-trust-no.screen")
    .split("\n")
    .map((line) => `${line}   \r`)
    .join("\n");
  assert.equal(normalizeScreen(padded), normalizeScreen(frame("claude-trust-no.screen")));
  const reworded = frame("claude-trust-no.screen").replace("No, exit", "No, quit");
  assert.equal(classifyScreen(reworded).state, "unknown");
});

test("the reported line names the version that recognized the frame", () => {
  const line = screenLine(classifyScreen(frame("claude-trust-yes.screen")));
  assert.match(line, /^Harness-Screen\/1 state=trust_ui action=confirm_trust harness=claude /u);
  assert.match(line, /screen_version=claude-trust-2026-09-18 path="\/tmp\/mo trust ~probe2"/u);
  // A version is an identifier of one capture; two entries sharing one would
  // make the report unable to say which recording matched.
  const versions = SCREENS.map((screen) => screen.version);
  assert.equal(new Set(versions).size, versions.length);
});
