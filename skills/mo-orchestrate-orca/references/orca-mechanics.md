# Orca native mechanics

Resolve one absolute Orca binary and use its version-matched upstream guides
from `orca skills get orchestration --json` and
`orca skills get orca-cli --json`, plus the public `orca ... --help` surface.
Require both non-empty topics in `orca skills list --json`, a ready status and
current registered worktree. Do not install guide copies in harness homes.

## Readiness evidence

Run focused, bounded probes rather than one large agent-context dump:

1. verify `orca status --json` belongs to the intended instance/worktree;
2. verify the version-matched `orchestration` companion;
3. run the selected provider's documented provider-native auth status command;
4. read `orca account list --json`, including `updatedAt`, and classify
   freshness;
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

Before a Run, record normalized project/repository registrations and owned
worktree/terminal/worker resources. Meta-O actors may add only exact-owned
resources attributed to the original project; registration inventory must not
change. A folder project without existing attributable isolated worktrees is an
unsupported placement, never permission for raw Git worktrees or
`orca repo add`.

Bind a lightweight Run and create all independent tasks first. Prefer the
composed worker start when it launches and recognizes the requested harness:

```text
orca orchestration run-create --objective <objective> --json
orca orchestration task-create --spec <task> --json
orca orchestration worker-start --task <id> --worktree current --agent <codex|claude|opencode> --model <model> --effort <effort> --json
```

Use the exact returned run, task, dispatch and terminal identities. Stable
titles are `<feature>:orchestrator`, `<feature>:executor`,
`<feature>:review:<vendor>` and `<feature>:e2e:<n>`; set and verify them through
public surfaces. The worker's injected lifecycle preamble is part of Orca's
public orchestration surface. Use `orchestration send --to dispatch:<id>` for
ordinary follow-ups.

`worker-start` reporting `ready` and `input_accepted` is only a transport
receipt. Before treating the task as delivered, verify through the public worker
and terminal surfaces that the requested harness is actually running and has
received the task. An untouched harness prompt, a shell prompt, or task text
executed by the shell is a failed composed start, even while Orca still labels
the worker ready. Stop only that exact dispatch.

Composed start is safe only when its public contract holds task bytes until a
normal agent prompt is proven. Otherwise the version-matched upstream skill
documents one terminal-first fallback: create the exact harness terminal, wait
for `tui-idle`, and inject the task into that terminal:

```text
orca terminal create --worktree active --title <title> --command <harness-command> --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms <ms> --json
orca orchestration dispatch --task <task-id> --to <handle> --inject --json
```

Verify effective model, effort, process identity, absence of Claude trust UI or
shell prompt and unsandboxed posture before injection. Respect launch wrappers:
do not duplicate a posture flag that the resolved wrapper already supplies. If
this documented fallback also fails, report the backend unsupported rather than
trying unrelated harnesses until one accepts the task. Start all independent
workers successfully before waiting for either result.

## State, completion and questions

Wait on public messages rather than terminal polling. Use one caller-owned
run-wide waiter:

```text
orca orchestration check --wait --types worker_done,escalation,question --timeout-ms <ms> --json
orca orchestration reply --id <message-id> --body <answer> --json
orca orchestration worker-show --dispatch <id> --json
```

Process a complete delivery batch before acknowledging it. Use 600000 ms arms
for executor-only sets and 300000 ms when reviewer/E2E remains. A quiet timeout
allows one public liveness snapshot and immediate re-arm without narration. A
transport failure gets one identical retry; the second is
`UNKNOWN/needs_attention`. An early message must wake the wait. A `question` is
answered through `reply`; `escalation` or a proven failed/lost dispatch is not
success.

A timeout is a checkpoint, not failure, and the next blocking wait is armed
before extended work continues.

The worker's complete `worker_done` body is the settled final response for
Meta-O. In every task require the worker to place its full final response in
that message. Validate ordinary and three-to-four-screen begin/middle/end
fixtures before claiming support. Do not use `worker-read --source transcript`:
its hook-reported provider transcript is outside Meta-O's allowed surface.
`worker-read --source terminal` and ordinary terminal commands are bounded
whole-session diagnostics and delivery checks only.

Treat quota, capacity, reconnecting, compaction, refusal, lost process and
credentials as different outcomes. After compaction or approximately 75% of a
32768-token context, start a fresh orchestrator turn/session and re-ground from
the Git spec/checklist plus public Orca state. Sanitize each structured
observation and cap it at 8000 tokens; never inject a raw 21k/41k dump.

Public capability belongs to the exact Dispatch/turn/process and expires on exit
or replacement. `worker_done` from a bare shell or expired Dispatch cannot
settle work. A direct user message contaminates the prior isolated role;
preserve the decision and create an exact replacement when isolation is needed.

## Reviews and cleanup

Create both review tasks before starting either worker, then start both without
waiting. Each worker is a native harness instance; its review brief is the task
text or accessible file path delivered by `worker-start` or the documented
native terminal injection, never a generated or executed shell script that
invokes the reviewer harness. Keep the messages isolated until both
`worker_done` bodies are complete. Release a settled supervised worker only with
`orca orchestration worker-release`; never substitute a broad terminal close. A
`no_owned_resource` result permits exactly one fallback only when the caller
recorded that Dispatch's low-level terminal handle in its run-owned resource
set: close that exact handle and re-read the resource projection. Without that
saved binding, return `needs_attention` and close nothing. This workaround is
currently `unsupported` for durable automation because no authenticated search
confirmed a canonical upstream Issue URL; see the project papercut audit. A
low-level injected terminal is not a supervised worker resource, so close only
its exact returned handle after its Dispatch settles and its response is
delivered. A failed or uncertain worker follows the exact recovery action in its
public receipt.

Keep the executor and remediation reviewers in their exact owned terminals.
Release old reviewers only before the fresh final pair. Stable titles are
defined once in the Run section and reused here. Cleanup follows complete pair
delivery and consumer acknowledgement. A partial start rechecks both inventories
and hands ambiguous handles to the human. Never close unnamed human tabs,
neighboring Run resources or another project container.
