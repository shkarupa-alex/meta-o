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
    anchors: [/^\s*❯/mu, /│.*Context /u],
    input: /^\s*❯\s?(.*)$/mu,
    placeholder: "",
  },
  {
    version: "codex-prompt-2026-09-18",
    harness: "codex",
    state: "agent_prompt",
    anchors: [/^\s*›\s/mu, /Context \d+% used/u],
    input: /^\s*›\s?(.*)$/mu,
    placeholder: "Ask Codex to do anything",
  },
  {
    version: "opencode-prompt-2026-09-18",
    harness: "opencode",
    state: "agent_prompt",
    anchors: [/^\s*┃\s+Ask anything…/mu, /ctrl\+p commands/u],
    input: /^\s*┃\s+Ask anything…(.*)$/mu,
    placeholder: "",
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

/** Whether the harness composer holds nothing but its own placeholder. */
function composerEmpty(screen, frame) {
  const typed = screen.input === undefined ? undefined : screen.input.exec(frame)?.[1];
  if (typed === undefined) return false;
  return typed.trim() === "" || typed.trim().startsWith(screen.placeholder) === true;
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
    if (!composerEmpty(screen, frame))
      return { ...common, action: "refuse", reason: "composer_not_empty" };
    return { ...common, action: "deliver" };
  }
  return { ...common, action: "refuse", reason: "shell_prompt" };
}

/**
 * Gate the trust dialog on the three ownership conditions of §5.9.
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

/** §A-DELIVERY-01 states one verdict as a line a caller reads without reparsing. */
export function screenLine(verdict) {
  return [
    "Harness-Screen/1",
    `state=${verdict.state}`,
    `action=${verdict.action}`,
    `harness=${verdict.harness}`,
    `screen_version=${verdict.version}`,
    `path=${JSON.stringify(verdict.path ?? "")}`,
    `reason=${verdict.reason ?? "none"}`,
  ].join(" ");
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  const text =
    file === undefined || file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  const verdict = classifyScreen(text);
  process.stdout.write(`${screenLine(verdict)}\n`);
  process.exitCode = verdict.action === "refuse" ? 3 : 0;
}
