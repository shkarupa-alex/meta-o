# Orca native mechanics

Use the version-matched upstream guide from `orca skills get orchestration` and
the public `orca ... --help` surface. Require a ready `orca status --json`, a
current registered worktree, and the upstream `orchestration` companion skill
listed by `orca skills list --json`.

## Readiness evidence

Run focused, bounded probes rather than one large agent-context dump:

1. verify `orca status --json` belongs to the intended instance/worktree;
2. verify the version-matched `orchestration` companion;
3. run the selected provider's documented provider-native auth status command;
4. read `orca account list --json`, including `updatedAt`, and classify freshness;
5. read the approved selection from bundled `mo-models.mjs`;
6. use the first real role Dispatch as the live launch probe when possible;
7. prove the real harness process consumed the task and
   `launch.requested == launch.effective` for model and effort;
8. retain exact run/task/dispatch/terminal locators in current reasoning.

If fresh native auth is newer than cached `missing-credentials|unavailable`, use
only a documented read-only refresh/recheck and one exact approved live launch.
A verified launch yields readiness with `stale_account_cache`. A credential
failure from the real process is a backend integration gap. Unconfirmed launch
effect remains unknown and is not retried. Never switch model or harness.

A disposable health Dispatch is allowed only before a real role can safely run,
one harness at a time, with no product work and exact-target release.

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
checkpoint, not failure, and the next blocking wait is armed before extended
work continues. An early message must wake the wait. A `question` is answered through `reply`; `escalation`
or a proven failed/lost dispatch is not success.

The worker's complete `worker_done` body is the settled final response for
Meta-O. In every task require the worker to place its full final response in that
message. Validate ordinary and three-to-four-screen begin/middle/end fixtures
before claiming support. Do not use `worker-read --source transcript`: its
hook-reported provider transcript is outside Meta-O's allowed surface.
`worker-read --source terminal` and ordinary terminal commands are bounded
whole-session diagnostics and delivery checks only.

Treat quota, capacity, reconnecting, compaction, refusal, lost process and
credentials as different outcomes. After compaction or approximately 75% of a
32768-token context, start a fresh orchestrator turn/session and re-ground from
the Git spec/checklist plus public Orca state. Sanitize each structured
observation and cap it at 8000 tokens; never inject a raw 21k/41k dump.

Public capability belongs to the exact Dispatch/turn/process and expires on
exit or replacement. `worker_done` from a bare shell or expired Dispatch cannot
settle work. A direct user message contaminates the prior isolated role;
preserve the decision and create an exact replacement when isolation is needed.

## Reviews and cleanup

Create both review tasks before starting either worker, then start both without
waiting. Each worker is a native harness instance; its review brief is the task
text or accessible file path delivered by `worker-start` or the documented
native terminal injection, never a generated or executed shell script that
invokes the reviewer harness. Keep the messages isolated until both
`worker_done` bodies are complete.
Release a settled supervised worker only with
`orca orchestration worker-release`; never substitute a broad terminal close.
A low-level injected terminal is not a supervised worker resource, so close
only its exact returned handle after its Dispatch settles and its response is
delivered. A failed or uncertain worker follows the exact recovery action in its
public receipt.

Keep the executor and remediation reviewers in their exact owned terminals.
Release old reviewers only before the fresh final pair. Stable titles are
`<feature>:orchestrator`, `<feature>:executor`, `<feature>:review:<vendor>` and
`<feature>:e2e:<n>`. Never close unnamed human tabs, neighboring Run resources or
another project container.
