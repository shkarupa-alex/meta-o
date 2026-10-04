/**
 * Prove which shell commands `mo-debug` counts as a helper run.
 *
 * Protects §A-DIAGNOSTICS-01: a helper run is read from command text at a
 * command position, and these cases pin that boundary in all three extractors.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createClaudeExtractor } from "../shared/scripts/mo-debug-claude.mjs";
import { createCodexExtractor } from "../shared/scripts/mo-debug-codex.mjs";
import { helperNames } from "../shared/scripts/mo-debug-text.mjs";

const CLAUDE_ID = "5b0c3a52-7f6e-4d1a-9c2b-3e4f5a6b7c8d";
const CODEX_ID = "01a0f000-0000-7000-8000-000000000001";

test("a helper named in an argument of another program is not a call", () => {
  const printed = "printf '%s\\n' 'node scripts/mo-backlog.mjs'";
  const searched = "rg -n 'node scripts/mo-backlog.mjs' README.md";
  const ran = "node scripts/mo-backlog.mjs";
  const empty = "MO-BACKLOG-EMPTY version=1 sha=x worktree=clean entries=0\n";
  assert.deepEqual(helperNames(printed), []);
  assert.deepEqual(helperNames(searched), []);
  assert.deepEqual(helperNames(ran), ["mo-backlog"]);
  assert.deepEqual(helperNames("env -u CODEX_HOME timeout 60 node ./scripts/mo-backlog.mjs"), [
    "mo-backlog",
  ]);
  const helperEvents = (evidence) =>
    evidence.events.filter((event) => event.kind.startsWith("helper_")).map((event) => event.kind);
  const claude = (command, output) => {
    const { evidence, feed } = createClaudeExtractor(CLAUDE_ID);
    const base = { sessionId: CLAUDE_ID, cwd: "/repo", timestamp: "2026-09-01T10:00:00.000Z" };
    const tool = { type: "tool_use", id: "b1", name: "Bash", input: { command } };
    feed(
      { ...base, type: "assistant", uuid: "a1", message: { role: "assistant", content: [tool] } },
      1,
    );
    const result = { type: "tool_result", tool_use_id: "b1", content: output };
    feed({ ...base, type: "user", uuid: "u1", message: { role: "user", content: [result] } }, 2);
    return helperEvents(evidence);
  };
  const codexCall = (command, output) => {
    const { evidence, feed } = createCodexExtractor(CODEX_ID);
    const at = "2026-09-01T11:00:00.000Z";
    const args = JSON.stringify({ cmd: command });
    const call = { type: "function_call", name: "exec_command", arguments: args, call_id: "c1" };
    feed({ timestamp: at, type: "response_item", payload: call }, 1);
    const answer = { type: "function_call_output", call_id: "c1", output };
    feed({ timestamp: at, type: "response_item", payload: answer }, 2);
    return helperEvents(evidence);
  };
  const codexExecution = (command, output) => {
    const { evidence, feed } = createCodexExtractor(CODEX_ID);
    const item = {
      type: "CommandExecution",
      id: "exec-1",
      command: ["/bin/bash", "-lc", command],
      cwd: "file:///repo",
      status: "completed",
      stdout: output,
      stderr: "",
      aggregated_output: output,
      exit_code: 0,
    };
    const payload = { type: "item_completed", thread_id: CODEX_ID, turn_id: "t1", item };
    feed({ timestamp: "2026-09-01T11:00:00.000Z", type: "event_msg", payload }, 1);
    return helperEvents(evidence);
  };
  // A reserved word, a negation, a group or a substitution opens a command
  // position too; the same words inside an argument still do not.
  const positions = [
    "if node scripts/mo-backlog.mjs; then echo ok; fi",
    "if ! node scripts/mo-backlog.mjs --candidate x; then exit 1; fi",
    "for i in 1; do node scripts/mo-backlog.mjs; done",
    "while node scripts/mo-backlog.mjs; do sleep 1; done",
    "true && { node scripts/mo-backlog.mjs; }",
    "x=$(node scripts/mo-backlog.mjs)",
    "x=`node scripts/mo-backlog.mjs`",
    "if true; then :; else node scripts/mo-backlog.mjs; fi",
    'echo "ok: `node scripts/mo-backlog.mjs`"',
    'x="`node scripts/mo-backlog.mjs`"',
    "cat <<EOF\n`node scripts/mo-backlog.mjs`\nEOF",
    "cat <<'EOF' > f\ntext\nEOF\nnode scripts/mo-backlog.mjs",
    "echo a # note\nnode scripts/mo-backlog.mjs",
    'echo "$(node scripts/mo-backlog.mjs)"',
    'x="$(node scripts/mo-backlog.mjs)"',
    "cat <<EOF\n$(node scripts/mo-backlog.mjs)\nEOF",
    "LABEL='note x' node scripts/mo-backlog.mjs",
    'env LABEL="note x" node scripts/mo-backlog.mjs',
    "LABEL=note\\ x node scripts/mo-backlog.mjs",
    "env LABEL=$'note x' node scripts/mo-backlog.mjs",
    "cd x \\\n  && node scripts/mo-backlog.mjs",
    // A line continuation joins the halves of one word, as the shell does.
    "no\\\nde scripts/mo-backlog.mjs",
    "node scripts/mo-back\\\nlog.mjs",
    "node \\\n scripts/mo-backlog.mjs",
    'node "scripts/mo-backlog.mjs"',
    "scripts/mo-backlog.mjs --repo /repo",
    "node scripts/mo-backlog.mjs; printf ok",
  ];
  const arguments_ = [printed, searched, "echo do node scripts/mo-backlog.mjs"];
  arguments_.push("printf '%s\\n' 'if node scripts/mo-backlog.mjs'");
  // A backtick quoted as text, escaped or inside single quotes, is no
  // substitution, which is how commit messages and PR bodies name helpers.
  arguments_.push(
    'git commit -m "fix: run \\`mo-backlog.mjs\\` at closure"',
    "git commit -m 'fix: run `mo-backlog.mjs` at closure'",
    'gh pr create --body "Run \\`node scripts/mo-backlog.mjs\\` before merge"',
    "echo 'see `shared/scripts/mo-backlog.mjs`'",
    "printf '%s\\n' \"it's \\`mo-backlog.mjs\\`\"",
    "printf '%s\\n' '`node scripts/mo-backlog.mjs`'",
    "printf '%s\\n' $'`node scripts/mo-backlog.mjs`'",
    "printf '%s\\n' \\`node scripts/mo-backlog.mjs\\`",
    ": # `node scripts/mo-backlog.mjs`",
    "cat <<'EOF'\n`node scripts/mo-backlog.mjs`\nEOF",
    "cat <<'EOF'\nnode scripts/mo-backlog.mjs\nEOF",
    "printf 'a\nnode scripts/mo-backlog.mjs'",
  );
  // A separator the shell reads as data, quoted, escaped or in a
  // here-document body, opens no command position either.
  arguments_.push(
    "rg -n 'mo-review-report.mjs|mo-backlog.mjs' shared/",
    'git grep -nE "helperNames|mo-backlog.mjs"',
    'git commit -m "fix: drop stale state; mo-backlog.mjs answers empty"',
    "git commit -m 'docs: run it; node scripts/mo-backlog.mjs before merge'",
    'gh pr create --body "Closure (mo-backlog.mjs) passed"',
    'echo "a && node scripts/mo-backlog.mjs"',
    "echo 'a & mo-backlog.mjs'",
    "printf '%s\\n' $'a; node scripts/mo-backlog.mjs'",
    "cat <<'EOF'\nsee (mo-backlog.mjs); then mo-backlog.mjs | x\nEOF",
    "git commit -F - <<'EOF'\nfix: x (mo-backlog.mjs)\nEOF",
    "git commit -m \"$(cat <<'EOF'\nfix: let mo-debug read it (mo-backlog.mjs)\nEOF\n)\"",
    "cat <<EOF\nnote; mo-backlog.mjs answers\nEOF",
    "grep mo-a.mjs\\|mo-backlog.mjs src",
  );
  // A quoted or escaped blank keeps an assignment one word, so a helper
  // named inside its value is no command.
  arguments_.push(
    "LABEL='note scripts/mo-backlog.mjs' printf 'ok\\n'",
    "LABEL=\"note scripts/mo-backlog.mjs\" printf 'ok\\n'",
    "LABEL=$'note scripts/mo-backlog.mjs' printf 'ok\\n'",
    "LABEL=note\\ scripts/mo-backlog.mjs printf 'ok\\n'",
    "env LABEL='note scripts/mo-backlog.mjs' printf 'ok\\n'",
    "env LABEL=\"note scripts/mo-backlog.mjs\" printf 'ok\\n'",
    "env LABEL=$'note scripts/mo-backlog.mjs' printf 'ok\\n'",
    "env LABEL=note\\ scripts/mo-backlog.mjs printf 'ok\\n'",
  );
  // A continuation inside a word joins it, and bytes after `.mjs` in the same
  // word name another file.
  arguments_.push(
    "LABEL=notes\\\nscripts/mo-backlog.mjs printf ok",
    'LABEL="notes\\\nscripts/mo-backlog.mjs" printf ok',
    "env LABEL=notes\\\nscripts/mo-backlog.mjs printf ok",
    'env LABEL="notes\\\nscripts/mo-backlog.mjs" printf ok',
    "LABEL='notes\\\nscripts/mo-backlog.mjs' printf ok",
    "node scripts/mo-backlog.mjs.bak",
    "node scripts/mo-backlog.mjs-old",
    "node scripts/mo-backlog.mjs/child",
    "node scripts/mo-backlog.mjs#suffix",
    'node "scripts/mo-backlog.mjs"suffix',
    'node "scripts/mo-backlog.mjs extra"',
    "node scripts/mo-backlog.mjs\\ extra",
  );
  // Blank runs and comment lines are read in linear time.
  const started = performance.now();
  helperNames("\n".repeat(40000));
  helperNames("#\n".repeat(20000));
  assert.ok(performance.now() - started < 1000, "backtracking");
  for (const [name, extract] of [
    ["claude", claude],
    ["codex function_call", codexCall],
    ["codex CommandExecution", codexExecution],
  ]) {
    for (const command of [ran, ...positions]) {
      assert.deepEqual(helperNames(command), ["mo-backlog"], command);
      assert.deepEqual(
        extract(command, empty),
        ["helper_call", "helper_result"],
        `${name} ${command}`,
      );
    }
    for (const command of arguments_) {
      assert.deepEqual(helperNames(command), [], command);
      assert.deepEqual(extract(command, "node scripts/mo-backlog.mjs\n"), [], `${name} ${command}`);
    }
  }
});
