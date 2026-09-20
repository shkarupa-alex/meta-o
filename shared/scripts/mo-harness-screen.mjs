#!/usr/bin/env node
/**
 * Classify one rendered harness screen before a single task byte is delivered.
 *
 * §A-DELIVERY-01 lets task bytes reach only a confirmed normal agent prompt, so
 * something has to decide what a frame is. This classifier recognizes recorded
 * screens of known harnesses and nothing else: an unseen frame is `unknown` and
 * refuses, because a guess here delivers work into a shell or a trust dialog.
 */

import { readFileSync } from "node:fs";

/**
 * The composer Claude Code draws around its own prompt row, and what it holds.
 *
 * A bare `❯` is a common shell prompt, and the meter row beside it is painted
 * by a status line the user installed rather than by the harness — so neither
 * belongs to Claude, and a shell that printed both would be handed task bytes.
 * The rule directly above the prompt is the harness's own chrome, and it is
 * what separates a real composer from a line that merely looks like one.
 *
 * Chrome and content are one pattern on purpose. When the anchor proved one row
 * and the reader answered from another, a stray prompt glyph higher in the
 * transcript answered for the composer: the same frame refused without it and
 * injected with it. A single match cannot disagree with itself.
 */
const CLAUDE_COMPOSER = /^─+[ \t]*\n[ \t]*❯[ \t]?(.*)$/mu;

/**
 * The recorded frames this classifier is allowed to recognize.
 *
 * Every entry was captured from a live harness, not written from memory, and
 * `version` names that capture. A foreign TUI changes without warning, so the
 * anchors stay literal: when a harness repaints its frame the entry stops
 * matching and the route closes instead of silently widening.
 */
export const SCREENS = [
  {
    version: "claude-trust-2026-09-18",
    harness: "claude",
    state: "trust_ui",
    anchors: [
      /^\s*Accessing workspace:\s*$/mu,
      /Quick safety check:/u,
      /^\s*❯?\s*No, exit\s*$/mu,
      /^\s*❯?\s*Yes, I trust this folder\s*$/mu,
    ],
  },
  {
    version: "claude-prompt-2026-09-18",
    harness: "claude",
    state: "agent_prompt",
    anchors: [CLAUDE_COMPOSER, /│.*Context /u],
    // `\s` spans newlines, so a composer pattern is written with `[ \t]`: the
    // earlier form matched the prompt row and then captured the row below it.
    input: CLAUDE_COMPOSER,
  },
  {
    // The same harness version, one row wider. What moves the context meter off
    // the status line is the width of that line, not how much context was
    // spent: a long branch label pushes the meter onto its own row, where the
    // `│` anchor above cannot see it. The fill glyph is part of the meter, so
    // the class spans an empty bar and a filled one — a frame recognized while
    // idle must stay recognized after the session has worked.
    version: "claude-prompt-meter-row-2026-09-18",
    harness: "claude",
    state: "agent_prompt",
    anchors: [CLAUDE_COMPOSER, /^\s*Context [░▒▓█]+ \d/mu],
    input: CLAUDE_COMPOSER,
  },
  {
    version: "codex-prompt-2026-09-18",
    harness: "codex",
    state: "agent_prompt",
    anchors: [/^\s*›\s/mu, /Context \d+% used/u],
    input: /^[ \t]*›[ \t]?(.*)$/mu,
    placeholder: /^Ask Codex to do anything$/u,
  },
  {
    version: "opencode-prompt-2026-09-18",
    harness: "opencode",
    state: "agent_prompt",
    anchors: [/^\s*┃\s+Ask anything…/mu, /ctrl\+p commands/u],
    input: /^[ \t]*┃[ \t]+Ask anything…(.*)$/mu,
    // OpenCode prints a rotating suggestion in quotes next to its placeholder.
    // The quotes are what tells a suggestion from something a human typed.
    placeholder: /^"[^"]*"$/u,
  },
  {
    version: "posix-shell-prompt-2026-09-18",
    harness: "shell",
    state: "shell_prompt",
    anchors: [/^\S+@\S+:\S*[$#]\s*$/mu],
  },
];

/**
 * Collapse a frame to the bytes the anchors are written against.
 *
 * §A-DELIVERY-01 requires a rendered screen, but the same rendering arrives
 * with carriage returns, trailing padding and an arbitrary number of blank
 * rows. Only those are removed: a byte that changes what a human would read is
 * left alone so that a changed dialog cannot normalize into a known one.
 */
export function normalizeScreen(text) {
  return String(text)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/^\n+|\n+$/gu, "");
}

/** The trust dialog's highlighted option, or `undefined` when none is marked. */
function highlighted(frame) {
  const marked = frame.split("\n").find((line) => /^\s*❯/u.test(line));
  return marked === undefined ? undefined : marked.replace(/^\s*❯\s*/u, "").trim();
}

/**
 * The workspace path the trust dialog says it is asking about.
 *
 * "The next non-empty line" would happily return the dialog's own prose once
 * the path row is missing, and the caller would then compare its worktree
 * against a sentence. The path lives strictly between the header and the safety
 * question, alone, and looks like a path; anything else is unreadable.
 */
function askedPath(frame) {
  const lines = frame.split("\n");
  const header = lines.findIndex((line) => /^\s*Accessing workspace:\s*$/u.test(line));
  const question = lines.findIndex((line) => /Quick safety check:/u.test(line));
  if (header === -1 || question <= header) return undefined;
  const named = lines.slice(header + 1, question).filter((line) => line.trim() !== "");
  if (named.length !== 1 || !/^[~/]/u.test(named[0].trim())) return undefined;
  return named[0].trim();
}

/** What the trust dialog's own highlight licenses, before any ownership check. */
function trustAction(frame) {
  const choice = highlighted(frame);
  if (choice === "No, exit") return { action: "accept_trust", choice };
  if (choice === "Yes, I trust this folder") return { action: "confirm_trust", choice };
  return { action: "refuse", choice, reason: "choice_unrecognized" };
}

/**
 * Whether the harness composer holds nothing but its own placeholder.
 *
 * A prefix test read every draft as empty: where the recorded placeholder is
 * the empty string every string starts with it, and where it is not, a draft
 * beginning with the placeholder passed too. Task bytes appended to somebody's
 * half-typed line become part of the dispatched task, which is precisely what
 * §A-DELIVERY-01 exists to prevent — so the composer is empty only when it is
 * empty, or exactly the placeholder and nothing else.
 *
 * Every row the entry recognizes is collected rather than the first one. A
 * rendered frame carries scrollback above the composer, and a single line of it
 * that looks like a prompt used to be read instead of the real row — so a frame
 * that offers two candidate rows names no composer and licenses nothing, the
 * same refusal an undecidable frame already gets.
 */
function composerState(screen, frame) {
  if (screen.input === undefined) return { ok: false, reason: "composer_not_empty" };
  const rows = [...frame.matchAll(new RegExp(screen.input.source, `${screen.input.flags}g`))];
  if (rows.length !== 1)
    return { ok: false, reason: rows.length === 0 ? "composer_not_empty" : "composer_ambiguous" };
  const text = rows[0][1].trim();
  if (text === "") return { ok: true };
  if (screen.placeholder !== undefined && screen.placeholder.test(text)) return { ok: true };
  return { ok: false, reason: "composer_not_empty" };
}

/**
 * Decide what one rendered frame is and what it licenses.
 *
 * §A-DELIVERY-01 makes this the only gate before delivery, so two recorded
 * screens matching the same frame is itself a failure: an ambiguous frame is
 * `unknown`, exactly like an unseen one, and neither receives bytes.
 */
export function classifyScreen(text) {
  const frame = normalizeScreen(text);
  const matched = SCREENS.filter((screen) => screen.anchors.every((anchor) => anchor.test(frame)));
  if (matched.length !== 1) {
    const reason = matched.length === 0 ? "screen_unrecognized" : "screen_ambiguous";
    return { state: "unknown", action: "refuse", harness: "unknown", version: "none", reason };
  }
  const [screen] = matched;
  const common = { state: screen.state, harness: screen.harness, version: screen.version };
  if (screen.state === "trust_ui") {
    const path = askedPath(frame);
    if (path === undefined)
      return { ...common, state: "unknown", action: "refuse", reason: "path_unreadable" };
    return { ...common, ...trustAction(frame), path };
  }
  if (screen.state === "agent_prompt") {
    const composer = composerState(screen, frame);
    if (!composer.ok) return { ...common, action: "refuse", reason: composer.reason };
    return { ...common, action: "inject" };
  }
  return { ...common, action: "refuse", reason: "shell_prompt" };
}

/**
 * Gate the trust dialog on its three ownership conditions: the caller created
 * the terminal, the workspace path is the expected one, and both were proved
 * before this call.
 *
 * §A-DELIVERY-01 is about whose folder is being trusted, and the screen cannot
 * answer that: it shows a path, not who created the terminal. The caller
 * resolves both paths before calling; equal strings here mean equal realpaths
 * there, and any doubt is a human's decision rather than a retry.
 */
export function trustStep(screen, ownership) {
  if (screen.state !== "trust_ui") return { action: "needs_human", reason: "screen_not_trust_ui" };
  if (ownership.terminalCreatedByRun !== true) {
    return { action: "needs_human", reason: "terminal_not_owned" };
  }
  if (
    typeof ownership.trustRealPath !== "string" ||
    ownership.trustRealPath !== ownership.terminalWorktreeRealPath
  ) {
    return { action: "needs_human", reason: "path_mismatch" };
  }
  if (ownership.worktreeIsRunResource !== true && ownership.worktreeIsNamedProjectRoot !== true) {
    return { action: "needs_human", reason: "worktree_unclaimed" };
  }
  if (screen.action !== "accept_trust" && screen.action !== "confirm_trust") {
    return { action: "needs_human", reason: screen.reason ?? "choice_unrecognized" };
  }
  return { action: screen.action, reason: "owned" };
}

/**
 * The rendered frame inside one `orca terminal read --screen --json` answer.
 *
 * §A-DELIVERY-01 allows exactly one kind of evidence here: a screen Orca says
 * it rendered. A scrollback stream loses the spaces drawn by cursor moves, so
 * an envelope that is not `source: "screen"` is unreadable rather than
 * classified — reading it anyway would compare a known dialog against text no
 * human ever saw.
 *
 * `draft` travels beside the frame and is deliberately excluded from it: it is
 * composer text the UI holds and the rendering never shows. It is kept here
 * because a frame that looks empty while a draft waits is exactly the case
 * where delivered bytes would join somebody's unsent line.
 */
export function readEnvelope(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return { error: "envelope_unparsable" };
  }
  if (document?.ok !== true) return { error: "envelope_not_ok" };
  const terminal = document?.result?.terminal;
  if (terminal === null || typeof terminal !== "object") return { error: "envelope_no_terminal" };
  if (terminal.source !== "screen") return { error: "not_a_rendered_screen" };
  const { tail } = terminal;
  const frame = Array.isArray(tail) ? tail.join("\n") : tail;
  if (typeof frame !== "string" || frame.trim() === "") return { error: "screen_empty" };
  const { draft } = terminal;
  if (draft !== undefined && typeof draft !== "string") return { error: "draft_unreadable" };
  return { frame, handle: terminal.handle, draft };
}

/**
 * Whether the dialog asks about the path the caller expects.
 *
 * §A-DELIVERY-01 leaves ownership with the caller: the frame may print `~`
 * while the caller holds an absolute path, and only that difference is
 * reconciled here. Resolving symlinks stays with the side that knows which
 * worktree it created.
 */
export function pathMatch(asked, expected, home = process.env.HOME) {
  if (typeof asked !== "string" || typeof expected !== "string") return "no";
  const expand = (value) =>
    value.startsWith("~/") && typeof home === "string" ? `${home}${value.slice(1)}` : value;
  const trim = (value) => expand(value.trim()).replace(/\/+$/u, "");
  return trim(asked) === trim(expected) ? "yes" : "no";
}

/** Which option the trust dialog has highlighted, in the words of the contract. */
function selectionOf(verdict) {
  if (verdict.action === "confirm_trust") return "yes";
  return verdict.action === "accept_trust" ? "no" : "unknown";
}

/**
 * Decide what one frame licenses for this caller, harness and path.
 *
 * §A-DELIVERY-01 keeps ownership with the caller, so this answers only what the
 * screen itself can prove: which harness repainted it, whether the composer is
 * free, and whether the dialog names the expected path. Everything else refuses.
 */
export function decideScreen(text, { harness, expectPath, fixturesVersion, draft } = {}) {
  const verdict = classifyScreen(text);
  const record = { state: verdict.state, screen_version: verdict.version, action: "refuse" };
  // A waiting draft is invisible in the frame by construction, so no amount of
  // agreement about the frame can license delivery while one exists. Whitespace
  // is bytes too: Orca never promises the composer is empty when it trims empty,
  // and a newline decides how appended input is framed.
  if (draft !== undefined && draft !== "") {
    return { ...record, reason: "composer_draft_present" };
  }
  if (fixturesVersion !== undefined && verdict.version !== fixturesVersion) {
    return { ...record, state: "unknown", reason: "screen_version_unpinned" };
  }
  if (verdict.state === "unknown") return { ...record, reason: verdict.reason };
  if (harness !== undefined && verdict.harness !== harness) {
    return { ...record, reason: "harness_mismatch" };
  }
  if (verdict.state === "trust_ui") return { ...record, ...trustRecord(verdict, expectPath) };
  if (verdict.state === "busy") return { ...record, action: "wait", reason: "none" };
  const licensed = verdict.state === "agent_prompt" && verdict.action === "inject";
  return { ...record, action: licensed ? "inject" : "refuse", reason: verdict.reason ?? "none" };
}

/** §A-DELIVERY-01 licenses a trust answer only on the path the caller named. */
function trustRecord(verdict, expectPath) {
  const selection = selectionOf(verdict);
  const path_match = pathMatch(verdict.path, expectPath);
  const licensed = path_match === "yes" && selection !== "unknown";
  return {
    trust_path: verdict.path,
    selection,
    path_match,
    action: licensed ? verdict.action : "refuse",
    reason: path_match === "no" ? "path_mismatch" : (verdict.reason ?? "none"),
  };
}

/** §A-DELIVERY-01 states one verdict as the line the caller reads without reparsing. */
export function screenLine(record) {
  const parts = ["MO-HARNESS-SCREEN/1", `state=${record.state}`];
  if (record.trust_path !== undefined)
    parts.push(`trust_path=${JSON.stringify(record.trust_path)}`);
  if (record.selection !== undefined) parts.push(`selection=${record.selection}`);
  if (record.path_match !== undefined) parts.push(`path_match=${record.path_match}`);
  if (record.screen_version !== undefined) parts.push(`screen_version=${record.screen_version}`);
  parts.push(`action=${record.action}`);
  return parts.join(" ");
}

/** §A-DELIVERY-01 accepts only the exact call the mechanics document writes. */
export function readOptions(argv) {
  const options = {};
  const names = {
    "--harness": "harness",
    "--expect-path": "expectPath",
    "--fixtures-version": "fixturesVersion",
  };
  for (let step = 0; step < argv.length; step += 1) {
    const key = names[argv[step]];
    if (key === undefined) return { error: `unknown flag "${argv[step]}"` };
    const value = argv[step + 1];
    if (value === undefined || value.startsWith("--"))
      return { error: `${argv[step]} needs a value` };
    options[key] = value;
    step += 1;
  }
  if (options.harness === undefined) return { error: "--harness is required" };
  if (options.expectPath === undefined) return { error: "--expect-path is required" };
  return options;
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const options = readOptions(process.argv.slice(2));
  if (options.error !== undefined) {
    process.stderr.write(`mo-harness-screen: ${options.error}\n`);
    process.exitCode = 2;
  } else {
    const envelope = readEnvelope(readFileSync(0, "utf8"));
    if (envelope.error !== undefined) {
      process.stderr.write(`mo-harness-screen: ${envelope.error}\n`);
      process.exitCode = 2;
    } else {
      const verdict = decideScreen(envelope.frame, { ...options, draft: envelope.draft });
      process.stdout.write(`${screenLine(verdict)}\n`);
      process.exitCode = 0;
    }
  }
}
