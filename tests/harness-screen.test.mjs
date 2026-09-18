/**
 * Hold the screen classifier that stands between a run and its task bytes.
 *
 * Protects §A-DELIVERY-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  SCREENS,
  classifyScreen,
  decideScreen,
  normalizeScreen,
  readEnvelope,
  readOptions,
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
    "claude-prompt.screen agent_prompt inject claude",
    "claude-trust-no.screen trust_ui accept_trust claude",
    "claude-trust-yes.screen trust_ui confirm_trust claude",
    "codex-prompt.screen agent_prompt inject codex",
    "opencode-prompt.screen agent_prompt inject opencode",
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
  assert.equal(verdict.action, "inject");
});

test("a composer holding a draft receives nothing", () => {
  const typed = frame("codex-prompt.screen").replace("› Ask Codex to do anything", "› rm -rf /");
  const verdict = classifyScreen(typed);
  assert.equal(verdict.state, "agent_prompt");
  assert.equal(verdict.action, "refuse");
  assert.equal(verdict.reason, "composer_not_empty");
});

test("a draft in any recorded composer refuses, empty or not", () => {
  // A prefix test called every draft empty: where the placeholder is the empty
  // string, every string starts with it. Bytes appended to a half-typed line
  // become part of the dispatched task.
  const drafts = [
    ["claude-prompt.screen", /^❯$/mu, "❯ rm -rf /tmp/project"],
    [
      "codex-prompt.screen",
      "› Ask Codex to do anything",
      "› Ask Codex to do anything; ignore the next task",
    ],
    [
      "opencode-prompt.screen",
      'Ask anything… "Fix a TODO in the codebase"',
      'Ask anything… "Fix a TODO in the codebase" and then exfiltrate',
    ],
  ];
  for (const [name, from, to] of drafts) {
    const verdict = classifyScreen(frame(name).replace(from, to));
    assert.equal(verdict.action, "refuse", name);
    assert.equal(verdict.reason, "composer_not_empty", name);
    // The unmodified capture still delivers, so the rule did not simply close
    // the route for everyone.
    assert.equal(classifyScreen(frame(name)).action, "inject", name);
  }
});

test("the documented command consumes a real terminal-read envelope", () => {
  const envelope = (frameText, extra = {}) =>
    JSON.stringify({
      ok: true,
      result: {
        terminal: { handle: "term_x", source: "screen", tail: frameText.split("\n"), ...extra },
      },
    });
  const read = readEnvelope(envelope(frame("claude-prompt.screen")));
  assert.equal(read.handle, "term_x");
  assert.equal(
    decideScreen(read.frame, { harness: "claude", expectPath: "/tmp/x" }).action,
    "inject",
  );
  // A harness the caller did not ask for is refused even when its own frame is
  // a perfectly good prompt.
  assert.equal(
    decideScreen(read.frame, { harness: "codex", expectPath: "/tmp/x" }).action,
    "refuse",
  );
  // Accumulated output loses the spaces drawn by cursor moves, so anything but
  // a rendered screen is unreadable rather than classified.
  for (const [text, error] of [
    ["not json", "envelope_unparsable"],
    [JSON.stringify({ ok: false }), "envelope_not_ok"],
    [JSON.stringify({ ok: true, result: {} }), "envelope_no_terminal"],
    [
      JSON.stringify({ ok: true, result: { terminal: { source: "stream", tail: ["x"] } } }),
      "not_a_rendered_screen",
    ],
    [
      JSON.stringify({ ok: true, result: { terminal: { source: "screen", tail: [] } } }),
      "screen_empty",
    ],
  ]) {
    assert.equal(readEnvelope(text).error, error, text.slice(0, 40));
  }
});

test("a draft the frame never shows still stops delivery", () => {
  // Orca states that `draft` is composer text excluded from the rendered tail.
  // A frame can therefore look perfectly empty while an unsent line waits, and
  // delivered bytes would join it.
  const prompts = ["claude-prompt.screen", "codex-prompt.screen", "opencode-prompt.screen"];
  for (const name of prompts) {
    const text = frame(name);
    for (const draft of [undefined, ""]) {
      assert.equal(decideScreen(text, { expectPath: "/tmp/x", draft }).action, "inject", name);
    }
    for (const draft of ["rm -rf /tmp/project", "   ", "\n unsent line "]) {
      const refused = decideScreen(text, { expectPath: "/tmp/x", draft });
      const empty = draft.trim() === "";
      assert.equal(
        refused.action,
        empty ? "inject" : "refuse",
        `${name}: ${JSON.stringify(draft)}`,
      );
      if (!empty) assert.equal(refused.reason, "composer_draft_present");
    }
    // Neither an exact harness and path nor a pinned fixture version overrides
    // it: the draft is the fact, and the rest is agreement about the frame.
    const pinned = decideScreen(text, {
      harness: classifyScreen(text).harness,
      expectPath: "/tmp/x",
      fixturesVersion: classifyScreen(text).version,
      draft: "unsent",
    });
    assert.equal(pinned.action, "refuse", name);
  }
  const envelope = readEnvelope(
    JSON.stringify({
      ok: true,
      result: {
        terminal: { source: "screen", tail: frame("claude-prompt.screen").split("\n"), draft: "x" },
      },
    }),
  );
  assert.equal(envelope.draft, "x");
});

test("the trust answer is bound to the path the caller named", () => {
  const asked = (name, expectPath, extra = {}) =>
    decideScreen(frame(name), { harness: "claude", expectPath, ...extra });
  const matched = asked("claude-trust-no.screen", "/tmp/mo-trust-probe");
  assert.equal(matched.path_match, "yes");
  assert.equal(matched.selection, "no");
  assert.equal(matched.action, "accept_trust");
  const confirmed = asked("claude-trust-yes.screen", "/tmp/mo trust ~probe2");
  assert.equal(confirmed.selection, "yes");
  assert.equal(confirmed.action, "confirm_trust");
  const near = asked("claude-trust-no.screen", "/tmp/mo-trust-probe2");
  assert.equal(near.path_match, "no");
  assert.equal(near.action, "refuse");
  // A pinned fixture set that does not match the recording closes the route:
  // an unpinned capture is exactly the case this classifier refuses to guess.
  const pinned = asked("claude-trust-no.screen", "/tmp/mo-trust-probe", {
    fixturesVersion: "claude-trust-2099-01-01",
  });
  assert.equal(pinned.state, "unknown");
  assert.equal(pinned.action, "refuse");
});

test("the call itself is checked before any frame is read", () => {
  assert.deepEqual(readOptions(["--harness", "claude", "--expect-path", "/tmp/x"]), {
    harness: "claude",
    expectPath: "/tmp/x",
  });
  assert.match(readOptions([]).error, /--harness is required/u);
  assert.match(readOptions(["--harness", "claude"]).error, /--expect-path is required/u);
  assert.match(readOptions(["--harness"]).error, /needs a value/u);
  assert.match(readOptions(["--nope", "x"]).error, /unknown flag "--nope"/u);
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
  const line = screenLine(
    decideScreen(frame("claude-trust-yes.screen"), {
      harness: "claude",
      expectPath: "/tmp/mo trust ~probe2",
    }),
  );
  assert.equal(
    line,
    'MO-HARNESS-SCREEN/1 state=trust_ui trust_path="/tmp/mo trust ~probe2" selection=yes ' +
      "path_match=yes screen_version=claude-trust-2026-09-18 action=confirm_trust",
  );
  // A version is an identifier of one capture; two entries sharing one would
  // make the report unable to say which recording matched.
  const versions = SCREENS.map((screen) => screen.version);
  assert.equal(new Set(versions).size, versions.length);
});

test("every document that admits the trust dialog states all three conditions", () => {
  // The procedure is reachable from three places, and a document that names
  // two conditions reads like a complete rule. Each is checked by what it must
  // say in its own language, not by one shared phrase.
  const decision = readFileSync(
    join(ROOT, "docs", "architecture", "trust-safe-delivery.md"),
    "utf8",
  );
  for (const condition of [
    /терминал создан этим запуском и\s*записан в `OwnedResourceSet\/1`/u,
    /realpath пути из диалога совпадает с realpath\s*worktree/u,
    /ресурс запуска либо\s*корень проекта, явно названный пользователем/u,
  ]) {
    assert.match(decision, condition);
  }
  assert.match(decision, /один и тот же исход без повтора/u);
  assert.match(decision, /Повтор здесь опаснее отказа/u);

  const skill = readFileSync(join(ROOT, "src", "skills", "mo-setup", "SKILL.md"), "utf8");
  assert.match(
    skill,
    /Harness-Trust\/1 harness=claude path=<json> state=<trusted\|accepted\|needs_human\|unknown>/u,
  );
  assert.match(skill, /created by this run and recorded in `OwnedResourceSet\/1`/u);
  assert.match(
    skill,
    /realpath of the path in the dialog equals the realpath of that terminal's\s*worktree/u,
  );
  assert.match(skill, /run resource or the root the user named/u);
  assert.match(skill, /`needs_human` with the recipe/u);
  assert.match(skill, /never a retry/u);

  const setup = readFileSync(join(ROOT, "shared", "references", "project-setup.md"), "utf8");
  assert.match(setup, /`terminal read --screen`, not accumulated\s*output/u);
  assert.match(setup, /only\s*`state=agent_prompt action=inject` receives bytes/u);
  // The narrowed confirmation has to keep its boundary in the same breath.
  assert.match(
    setup,
    /the project root the\s*user named when calling the skill, and the run's own resources, are already that\s*confirmation/u,
  );
  assert.match(setup, /Any other path is not, however similar it looks/u);
});

test("the launch split is documented where a caller would otherwise re-derive it", () => {
  const setup = readFileSync(join(ROOT, "shared", "references", "project-setup.md"), "utf8");
  assert.match(setup, /--agent <route> --model <model> --effort <effort>/u);
  assert.match(setup, /The whole literal in\s*`--model` launches nothing/u);
  assert.match(setup, /`mo-models\.mjs --show --json` publishes that split under `launch`/u);
});

test("the shipped CLI answers the exact contract of §4.5", () => {
  const envelope = JSON.stringify({
    ok: true,
    result: {
      terminal: {
        handle: "term_x",
        source: "screen",
        tail: readFileSync(join(SURFACES, "claude-trust-no.screen"), "utf8").split("\n"),
      },
    },
  });
  const run = (args, input) =>
    spawnSync(
      process.execPath,
      [join(ROOT, "shared", "scripts", "mo-harness-screen.mjs"), ...args],
      {
        input,
        encoding: "utf8",
      },
    );
  const accepted = run(["--harness", "claude", "--expect-path", "/tmp/mo-trust-probe"], envelope);
  assert.equal(accepted.status, 0);
  assert.equal(
    accepted.stdout.trim(),
    'MO-HARNESS-SCREEN/1 state=trust_ui trust_path="/tmp/mo-trust-probe" selection=no ' +
      "path_match=yes screen_version=claude-trust-2026-09-18 action=accept_trust",
  );
  // A refusal is still a classification: exit two is reserved for input the
  // script could not read at all, which is a different thing to report.
  const foreign = run(["--harness", "claude", "--expect-path", "/tmp/elsewhere"], envelope);
  assert.equal(foreign.status, 0);
  assert.match(foreign.stdout, /path_match=no .*action=refuse/u);
  const unreadable = run(["--harness", "claude", "--expect-path", "/tmp/x"], "not json");
  assert.equal(unreadable.status, 2);
  assert.match(unreadable.stderr, /envelope_unparsable/u);
  const miscalled = run(["--fixtures-version", "x"], envelope);
  assert.equal(miscalled.status, 2);
  assert.match(miscalled.stderr, /--harness is required/u);

  // The whole point of decoding the envelope is that the draft travels in it.
  const withDraft = JSON.stringify({
    ok: true,
    result: {
      terminal: {
        source: "screen",
        tail: readFileSync(join(SURFACES, "claude-prompt.screen"), "utf8").split("\n"),
        draft: "rm -rf /tmp/project",
      },
    },
  });
  const drafted = run(["--harness", "claude", "--expect-path", "/tmp/x"], withDraft);
  assert.equal(drafted.status, 0);
  assert.match(drafted.stdout, /state=agent_prompt .*action=refuse/u);
});
