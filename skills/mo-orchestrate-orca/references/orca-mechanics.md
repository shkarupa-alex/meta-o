# Orca native mechanics

Use the version-matched upstream guide from `orca skills get orchestration` and
the public `orca ... --help` surface. Require a ready `orca status --json`, a
current registered worktree, and the upstream `orchestration` companion skill
listed by `orca skills list --json`.

## Run, tasks and workers

Bind a lightweight Run and create all independent tasks first. Prefer the
composed worker start when it launches and recognizes the requested harness:

```text
orca orchestration run-create --objective <objective> --json
orca orchestration task-create --spec <task> --json
orca orchestration worker-start --task <id> --worktree current --agent <codex|claude|opencode> --model <model> --effort <effort> --json
```

Use the exact returned run, task, dispatch and terminal identities. The worker's
injected lifecycle preamble is part of Orca's public orchestration surface. Use
`orchestration send --to dispatch:<id>` for ordinary follow-ups.

`worker-start` reporting `ready` and `input_accepted` is only a transport
receipt. Before treating the task as delivered, verify through the public worker
and terminal surfaces that the requested harness is actually running and has
received the task. An untouched harness prompt, a shell prompt, or task text
executed by the shell is a failed composed start, even while Orca still labels
the worker ready. Stop only that exact dispatch.

The version-matched upstream skill documents one fallback when composed start
does not establish a recognized harness: create the exact harness terminal,
wait for `tui-idle`, and inject the task into that terminal:

```text
orca terminal create --worktree active --title <title> --command <harness-command> --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms <ms> --json
orca orchestration dispatch --task <task-id> --to <handle> --inject --json
```

Verify effective model, effort and unsandboxed posture in the visible harness
before injection. Respect launch wrappers: do not duplicate a posture flag that
the resolved wrapper already supplies. If this documented fallback also fails,
report the backend unsupported rather than trying unrelated harnesses until one
accepts the task. Start all independent workers successfully before waiting for
either result.

## State, completion and questions

Wait on public messages rather than terminal polling:

```text
orca orchestration check --wait --types worker_done,escalation,question --timeout-ms <ms> --json
orca orchestration reply --id <message-id> --body <answer> --json
orca orchestration worker-show --dispatch <id> --json
```

Process a complete delivery batch before acknowledging it. A timeout is a
checkpoint, not failure. A `question` is answered through `reply`; `escalation`
or a proven failed/lost dispatch is not success.

The worker's complete `worker_done` body is the settled final response for
Meta-O. In every task require the worker to place its full final response in that
message. Validate ordinary and three-to-four-screen begin/middle/end fixtures
before claiming support. Do not use `worker-read --source transcript`: its
hook-reported provider transcript is outside Meta-O's allowed surface.
`worker-read --source terminal` and ordinary terminal commands are bounded
whole-session diagnostics and delivery checks only.

## Reviews and cleanup

Create both review tasks before starting either worker, then start both without
waiting. Keep the messages isolated until both `worker_done` bodies are complete.
Release a settled supervised worker only with
`orca orchestration worker-release`; never substitute a broad terminal close.
A low-level injected terminal is not a supervised worker resource, so close
only its exact returned handle after its Dispatch settles and its response is
delivered. A failed or uncertain worker follows the exact recovery action in its
public receipt.
