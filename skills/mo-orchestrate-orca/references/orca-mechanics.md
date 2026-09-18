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

Bind a lightweight Run and create all independent tasks first:

```text
orca orchestration run-create --objective <objective> --json
orca orchestration task-create --spec <task> --json
```

Terminal-first is the default route for every agent environment. A composed
start hands Orca both the harness launch and the task bytes in one call, and
nothing in the version-matched surface promises those bytes wait for the agent
to be ready; where they do not, the task is typed into whatever holds the
keyboard. Use a composed start only when `worker-start --help` or the
version-matched `orchestration` guide says in so many words that task input
waits for agent readiness. No such sentence is there today.

```text
orca terminal create --worktree id:<repo>::<path> --title <title> --command "<agent argv>" --json
  # claude: claude --model <id> --effort <e>     codex: codex -m <id> -c model_reasoning_effort=<e>
  # the posture flag is not repeated here: the wrapper owns it
→ record the handle in OwnedResourceSet/1 at once, as the fallback binding for no_owned_resource
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 120000 --json
orca terminal read --terminal <handle> --screen --json \
  | node scripts/mo-harness-screen.mjs --harness <claude|codex|opencode> --expect-path <abs>
  # reads the envelope, requires source=screen, and answers one line:
  # MO-HARNESS-SCREEN/1 state=<...> [trust_path=<json>] [selection=<yes|no|unknown>]
  #                     [path_match=<yes|no>] [screen_version=<id>] action=<inject|accept_trust|confirm_trust|refuse|wait>
  # exit 0 classified, 2 unreadable input or a call it cannot answer
  # trust_ui → the trust procedure; action=inject → continue;
  # anything else → close that exact handle and return needs_attention
ps -o args= -p <pid from orca terminal show --json>   # argv carries the requested model and effort
orca orchestration worker-start --task <id> --worktree id:<repo>::<path> --terminal <handle> --json
```

The handle is written to the owned-resource set before the wait, not after it: a
terminal that exists but is recorded nowhere is the one nothing can close.
`--model` and `--effort` are never passed together with `--terminal`; the argv
already carries them, and a second source of the same fact is a second answer to
"what ran?".

Recovery from `outcome_unknown` or `turn_start_unobserved` runs in one
direction: `worker-stop --dispatch <old>`, prove a settled stop or `blocked`
from the receipt and `worker-show`, create a terminal by the recipe above, then
`worker-start --task <id> --retry-of <old> --worktree id:<repo>::<path> --terminal <handle>`.
When `worker-stop` itself answers `unknown_effect`, both a second stop and a
replacement Dispatch are forbidden: either can leave two executors working the
same task, and two executors of one task is worse than none.

Sending `worker_done` completes the Dispatch, but the agent session behind it
stays hot. A new Dispatch binds to that same session with
`worker-start --task <id> --terminal <handle> --worktree id:<repo>::<path>`;
omitting `--worktree` answers `terminal_worktree_mismatch`. This is what makes a
follow-up review in the same session — with its own prior reasoning still
present — reachable at all.

Use the exact returned run, task, dispatch and terminal identities. Stable
titles are `<feature>:orchestrator`, `<feature>:executor`,
`<feature>:review:<vendor>` and `<feature>:e2e:<n>`; set and verify them through
public surfaces. `terminal create --title` and `terminal rename` set the tab
title; verify it under `visualLayouts[].root.tabs[].title` from
`terminal list --include-visual-layouts --json`, because `terminals[].title` is
the pane title a running harness repaints. The worker's injected lifecycle
preamble is part of Orca's public orchestration surface. Use
`orchestration send --to dispatch:<id>` for ordinary follow-ups.

`worker-start` reporting `ready` and `input_accepted` is only a transport
receipt. Before treating the task as delivered, verify through the public worker
and terminal surfaces that the requested harness is actually running and has
received the task. An untouched harness prompt, a shell prompt, or task text
executed by the shell is a failed composed start, even while Orca still labels
the worker ready. Stop only that exact dispatch.

Verify effective model, effort, process identity, absence of Claude trust UI or
shell prompt and unsandboxed posture before injection. Respect launch wrappers:
do not duplicate a posture flag that the resolved wrapper already supplies. If
this documented fallback also fails, report the backend unsupported rather than
trying unrelated harnesses until one accepts the task. Start all independent
workers successfully before waiting for either result.

## Reading the version-matched references

The compact guide names action gates that live in its bundled references, and
those references are read from the same absolute binary, never installed:

```text
orca skills get orchestration --references --json | jq -er '.references[]'
orca skills get orchestration --reference <name> --json | jq -er '.markdown | select(type=="string" and length>0)'
```

`--json` is not optional here. Without it the output is bare Markdown, `jq`
exits 5 on the first line it cannot parse, and the reason is on stderr.
`2>/dev/null` is forbidden for exactly that: an empty `markdown` or a non-zero
exit is `unknown`, and a discarded stderr turns a readable failure into a silent
empty guide. A reference name may be given bare (`recovery-and-cleanup`) or as
the guide spells it (`references/recovery-and-cleanup.md`); both resolve to the
bare name.

`mo-review-orca` and `mo-orchestrate-orca` require four of them before they act:
`coordinator-loop`, `placement-and-remote`, `recovery-and-cleanup` and
`worker-contract`. A missing name in the list, an empty body or a non-zero exit
for any of the four is `unknown`, not a smaller set of rules to work from.

## Coordinator inside an Orca terminal

A coordinator that Orca itself started has a worktree, so `current` and `active`
resolve to it, `run-create --from <handle>` binds the Run to that terminal, and
the coordinator tab carries the `<feature>:orchestrator` title.

## Coordinator outside an Orca terminal

The same lifecycle runs from an ordinary shell. The sign is exact:
`orca status --json` succeeds, and the realpath of the current directory equals
no `path` in `orca worktree list --json`. Nothing about the backend is degraded
— only the coordinator's own placement is unknown to Orca.

Outside, a relative selector names nothing: a worktree selector is
`id:<repo>::<path>` or `path:<path>`, written out in full. The Run is created
without `--from`, the wait is `orca orchestration check --run <id> --wait`
instead of a terminal-bound check, and no coordinator title is set, because
there is no tab to title. Workers are unaffected: each one still gets its exact
worktree selector and terminal handle.

The watchdog is not a precondition. At start the coordinator establishes whether
a watchdog sees it; if none does, it says once that the limit is accepted — work
stops at the limit until a human returns — and continues. `mo-watchdog`, `jq`
and `flock` are probed only when the user asks for the watchdog, and their
absence is then an ordinary typed gap rather than a failed start.

Temporary specifications, brief drafts and other intermediate coordinator files
live in the project's `.orca/`. Where `.orca/` is not ignored, the coordinator
writes no temporary file into a tracked path and returns `needs_attention`: a
scratch file inside the candidate tree changes the very SHA the lifecycle is
about to certify.

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

## Session warmth

`orca terminal list --json` carries `lastOutputAt`, epoch milliseconds of the
last output. Idle is `now - lastOutputAt`, and it answers the warmth question
only for a terminal publicly proven to be at `agent_prompt`: after its
`worker_done`, or through the screen classifier. A working agent's spinner
updates the field, so it marks the last output rather than the end of a turn,
and a busy terminal looks idle for zero seconds no matter how long the turn has
run.

The prompt cache lives 60 minutes for both vendors, and the working idle
threshold is 50 minutes. Under the threshold, bind the next Dispatch to the same
hot session; over it, prefer a fresh one. Where the installed version returns no
such field, behave exactly as before: an absent observation is not a stale
session.

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
