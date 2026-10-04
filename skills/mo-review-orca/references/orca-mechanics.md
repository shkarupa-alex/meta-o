# Orca native mechanics

Resolve one absolute Orca binary and use its version-matched upstream guides
from `orca skills get orchestration --json` and
`orca skills get orca-cli --json`, plus the public `orca ... --help` surface.
Require both non-empty topics in `orca skills list --json`, a ready status and
current registered worktree. Do not install guide copies in harness homes.

## Readiness evidence

Run focused, bounded probes rather than one large agent-context dump:

1. verify `orca status --json` belongs to the intended instance/worktree and
   `orca --version` is 1.4.219 or later;
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
change. A folder project without existing attributable isolated worktrees takes
the next rung of the caller's placement ladder, the exact existing project
workspace read by SHA, and is unsupported only when not even that workspace is
there; it is never permission for raw Git worktrees or `orca repo add`.

Bind a lightweight Run and create all independent tasks first:

```text
orca orchestration run-create --objective <objective> --json
orca orchestration task-create --spec <task> --json
```

Orca 1.4.219 is the oldest supported version. Before 1.4.217 `worker-start`
never saw a Codex 0.157+ fullscreen composer as ready, and `worker-release`
could report a closed terminal that kept running; before 1.4.219 Orca wrote
Codex trust for a guessed repository root rather than the worktree itself, so a
Codex worker in a worktree of a bare repository failed with
`agent-trust-workspace`. The workarounds those defects required are gone from
this document.

`worker-start --agent` is the route for every agent environment whose model and
effort it passes — Claude and Codex. One call composes placement, the harness
launch, readiness, one prompt injection and supervised ownership, and the
version-matched `orchestration` guide names it the normal path. Task input waits
for the agent's readiness, so no terminal is created first and no screen is read
before the injection.

```text
orca orchestration worker-start --task <id> --worktree id:<repo>::<path> \
  --agent <claude|codex> --model <id> --effort <e> --timeout-ms 240000 --json
  # the posture flag is not passed: the user's own setting for new agent tabs owns it
→ record the dispatch id and the created terminal of `effects[kind=terminal].id`
  in OwnedResourceSet/1 at once
```

The receipt carries what was launched: `launch.requested == launch.effective`
for agent, model and effort, and `turnStart: observed`. A mismatch is a failed
start of that exact Dispatch, never a model to accept.

Orca refuses a worker that another worker starts: `nested_worker_depth_exceeded`
at the default nested depth of one, and that default stays. A role that starts
workers itself — a coordinator, a review caller, an E2E actor exercising a
reviewer pair — runs as an ordinary Orca tab and never as a Dispatch.

`orca worktree create` without `--agent` also opens one shell terminal that its
receipt does not name. Find it with `orca terminal list` on that worktree and
record its handle in OwnedResourceSet/1 with the worktree, so that release
closes it first rather than leaving a tab nobody owns.

A harness whose model `worker-start` cannot pass, such as OpenCode, starts
terminal-first, and so does a start whose readiness the installed version does
not observe:

```text
orca terminal create --worktree id:<repo>::<path> --title <title> --command "<agent argv>" --json
→ record the handle in OwnedResourceSet/1 at once: the caller created it, so the caller closes it
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 120000 --json
orca terminal read --terminal <handle> --screen --json \
  | node scripts/mo-harness-screen.mjs --harness <claude|codex|opencode> --expect-path <abs>
  # reads the envelope, requires source=screen, refuses while `draft` holds any
  # composer bytes the frame does not show — a space or a newline is such a byte —
  # and answers one line:
  # MO-HARNESS-SCREEN/1 state=<...> [trust_path=<json>] [selection=<yes|no|unknown>]
  #                     [path_match=<yes|no>] [screen_version=<id>]
  #                     [context=<tokens:<n>|percent:<n>|unknown> context_window=<n|unknown>]
  #                     action=<inject|accept_trust|confirm_trust|refuse|wait>
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
"what ran?". A bind to a caller-created terminal may answer
`turnStart: unsupported` (Orca 1.4.217 did on a first bind); consumption is then
proven from that terminal's screen, never assumed from `input_accepted`.

Recovery from `outcome_unknown` or `turn_start_unobserved` runs in one
direction: `worker-stop --dispatch <old>`, prove a settled stop or `blocked`
from the receipt and `worker-show`, then
`worker-start --task <id> --retry-of <old> --worktree id:<repo>::<path>` with
the same `--agent`, `--model` and `--effort`, or `--terminal <handle>` of a new
terminal-first start. When `worker-stop` itself answers `unknown_effect`, both a
second stop and a replacement Dispatch are forbidden: either can leave two
executors working the same task, and two executors of one task is worse than
none.

The screen classifier knows each harness's composer by its own chrome: Claude's
rule above `❯`, and Codex's `›` row directly above its footer, whose context
segment reads `Context <n>% used` or, in a narrow pane, `Context …`. An agent
prompt line carries the context indicator the harness painted, for the hot-slot
rule: Claude's status line gives used tokens over the window, Codex a percentage
and, after its first turn, the window beside it; anything cut or absent is
`context=unknown`. A suggestion the harness paints in its composer — Claude's
`Try "…"` on a fresh session, or one that only the envelope's `draft` carries —
is not an empty composer: a rendered screen loses the attribute that marks it
and Orca reports no origin for composer text, so it refuses like typed text and
is never erased to make room. Claude Code paints that suggestion only sometimes
(2.1.287 painted none on a fresh session), so live evidence of a refusal may
come from a real draft instead.

Sending `worker_done` completes the Dispatch, but the agent session behind it
stays hot. A new Dispatch binds to that same session with
`worker-start --task <id> --terminal <handle> --worktree id:<repo>::<path>`,
where the handle is `worker.agentTerminalHandle` from `worker-show`; omitting
`--worktree` answers `terminal_worktree_mismatch`. This is what makes a
follow-up review in the same session — with its own prior reasoning still
present — reachable at all. Reattach only where public surfaces prove the same
provider session id, the same supervised harness and a mailbox that still
delivers `worker_done`; `--continue` and a live terminal prove none of these.

Orca's setting "Trust the folder when Orca starts an agent" (Settings → Agents,
on by default) writes the harness's trust for the exact folder of the start
before the harness launches, so a Claude or Codex start into a run worktree
meets no trust UI. That write is the owner's setting acting, not a Meta-O
answer, and Orca leaves it behind after the worktree is gone
([Orca #24697](https://github.com/stablyai/orca/issues/24697)). The next two
paragraphs, the trust procedure and the trust-failure recovery, apply when the
owner has turned that setting off; every other rule here holds either way.

The trust procedure answers a trust dialog only when three ownership conditions
hold: this run created the terminal and recorded it in OwnedResourceSet/1, the
realpath of the path the dialog names equals the realpath of that terminal's
worktree, and that worktree is a run resource or the root the user named. Then
the dialog's own highlight decides the answer. A missing condition, or a trust
prompt `scripts/mo-harness-screen.mjs` does not recognize — Codex's is one — is
`needs_human` with the recipe: open the tab `<title>` and confirm trust for that
folder. It is never a retry, because confirming trust answers for whatever is in
the folder.

A Codex start that fails with `agent-trust-workspace` is recovered inside the
supported harness: release the failed Dispatch by its exact id, prove the
worktree's trust through the trust procedure, then start the normal supervised
Codex harness again with `worker-start --agent codex`. A Claude start into a
worktree Claude has not trusted stops on Claude's folder-trust dialog and fails
only when readiness times out (`failedStage=agent_readiness`, no task
delivered). Read that start's own terminal through
`scripts/mo-harness-screen.mjs`; when it shows the trust UI and the trust
procedure's conditions hold, answer it there, release the failed Dispatch by its
exact id and start again with `worker-start --retry-of <id>`.

Whether or not Orca pre-trusts the folder,
`orca terminal create --command "codex exec …"` is never a reviewer: it has
neither the harness input nor the mailbox, and its output would have to be
carried by hand.

Use the exact returned run, task, dispatch and terminal identities. Stable
titles are `<feature>:orchestrator`, `<feature>:executor`,
`<feature>:review:<vendor>` and `<feature>:e2e:<n>`; set and verify them through
public surfaces. `terminal create --title` and `terminal rename` set the tab
title; verify it under `visualLayouts[].root.tabs[].title` from
`terminal list --include-visual-layouts --json`, because `terminals[].title` is
the pane title a running harness repaints. A terminal that `worker-start`
created keeps the tab title `worker-task_<id>` on Orca 1.4.219 whatever
`terminal rename` sets, so there the stable title is a label recorded with the
exact handle; its absence is never an ownership or cleanup failure, because the
handle owns cleanup. The worker's injected lifecycle preamble is part of Orca's
public orchestration surface. Use `orchestration send --to dispatch:<id>` for
ordinary follow-ups.

`worker-start` reporting `ready` and `input_accepted` is only a transport
receipt. Before treating the task as delivered, verify through the public worker
and terminal surfaces that the requested harness is actually running and has
received the task. An untouched harness prompt, a shell prompt, or task text
executed by the shell is a failed composed start, even while Orca still labels
the worker ready. Stop only that exact dispatch.

On the terminal-first route, verify effective model, effort, process identity,
absence of Claude trust UI or shell prompt and unsandboxed posture before
injection. Respect launch wrappers: do not duplicate a posture flag that the
resolved wrapper already supplies. If a documented route fails, report the
backend unsupported rather than trying unrelated harnesses until one accepts the
task. Start all independent workers successfully before waiting for either
result.

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

The same lifecycle runs from an ordinary shell. Nothing about the backend is
degraded — only the coordinator's own placement is unknown to Orca.

One predicate decides that placement, and it is the terminal's own
runtime-issued handle: `ORCA_TERMINAL_HANDLE` in the environment plus one
readable `orca terminal read --terminal "$ORCA_TERMINAL_HANDLE" --screen --json`
together mean inside. The variable absent, or that read refused, means outside,
whatever the path said.

Where the process stands is not a second sign and decides nothing in either
direction. An ordinary shell started inside a registered worktree stands on a
registered `path` and still owns no terminal, while a terminal Orca created
keeps its handle when its working directory is a scratch clone or `/tmp`. A
comparison of directories answers both of those backwards, so the question is
never where the process stands but whether it holds a terminal.

Two probes look like this one and are not. `--terminal` takes a runtime-issued
handle and nothing else, so the relative words that select a worktree are not
handles at all: given one, Orca answers `terminal_handle_stale` on both sides of
the boundary. The handle-free `orca terminal read --screen --json` resolves the
worktree's focused terminal, which is a property of the application's tab focus
rather than of the calling process — it answers `no_active_terminal` to a
coordinator that does hold a terminal, and where it does answer it may name a
terminal the caller does not own. Neither form decides placement.

Outside, the Run still comes back with a `coordinator_handle`, and it may name a
terminal belonging to somebody else's session: Orca fills the field from its own
view of the app, not from the caller. The coordinator neither trusts nor closes
that handle; it waits by run id and owns only the resources it created.

A worker bound to a terminal the caller created is a caller-owned resource too.
`worker-release` then answers `state=retained processAction=none`, because Orca
released a Dispatch it never owned a process for, and the exact handle is closed
by whoever opened it.

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
credentials as different outcomes. Each is recovered on the same task and in the
same ownership: follow the exact recovery action in that Dispatch's public
receipt, and when the outcome is unknown or its turn start unobserved, use the
one-direction stop-then-`--retry-of` ladder above with the same selection, which
ends at a `worker-stop` answering `unknown_effect`. Work done before a refusal
stays `output_blocked_after_work`. Never a new task, another model or a second
owner.

After compaction or approximately 75% of a 32768-token context, start a fresh
orchestrator turn/session and re-ground from the Git spec/checklist plus public
Orca state. Sanitize each structured observation and cap it at 8000 tokens;
never inject a raw 21k/41k dump.

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

A review slot is decided differently, by `mo-review-resource.mjs hot`: its age
runs from the slot's last `worker_done`, not from `lastOutputAt`, and the owner
set that bound at one hour; a proven small context keeps an older slot hot. Its
`--alive yes` means the slot's own recorded terminal still runs its harness:
`terminal show` reports it `connected:true` and `orphaned:false` (Orca 1.4.219
has no running field there) and its screen is the harness's prompt. Orca's
worker liveness `unverifiable` on an idle session is missing evidence, not
death, and never answers `--alive no` by itself; a terminal that is gone or
shows a shell does.

## Reviews and cleanup

Create both review tasks before starting either worker, then start both without
waiting. Each worker is a native harness instance; its review brief is the task
text or accessible file path delivered by `worker-start` or the documented
native terminal injection, never a generated or executed shell script that
invokes the reviewer harness. Keep the messages isolated until both
`worker_done` bodies are complete. Release a settled supervised worker only with
`orca orchestration worker-release`; never substitute a broad terminal close.
For a worker `worker-start --agent` created, release answers `released` with
`processAction=closed_agent_terminal` and the terminal is gone. For a worker
bound to a terminal the caller created, it answers `retained` with
`external_terminal` or `no_owned_resource`: Orca never owned that process, and
the caller closes exactly the handle it recorded when it created the terminal.
Without that recorded handle, return `needs_attention` and close nothing. A
low-level injected terminal is not a supervised worker resource, so close only
its exact returned handle after its Dispatch settles and its response is
delivered. A failed or uncertain worker follows the exact recovery action in its
public receipt.

Keep the executor and remediation reviewers in their exact owned terminals.
Release old reviewers only once they returned two PASS reports on one SHA,
before the fresh final pair on that SHA. A review worktree carries its
`MO-REVIEW-RESOURCE/1` marker in its Orca comment, and a restarted coordinator
releases only what `mo-review-resource.mjs release` proves is its own orphan.
Stable titles are defined once in the Run section and reused here. Cleanup
follows complete pair delivery and consumer acknowledgement. A partial start
rechecks both inventories and hands ambiguous handles to the human. Never close
unnamed human tabs, neighboring Run resources or another project container.
