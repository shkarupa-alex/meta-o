# Architecture — the backend boundary

## §A-BACKEND-CONTRACT — Write ahead, observe the effect, never resend blind

Implements §B-WORKFLOW-02.

meta-o owns no session runtime: no daemon, no event queue, no session database.
Herdr owns panes, lifecycle and native resume; the adapter translates
(`src/adapters/herdr.mts`).

That boundary creates the problem this decision solves. Herdr has no
client-supplied idempotency key and no durable receipt, so a process that dies
during `send` cannot know whether the prompt landed. Retrying risks a duplicate
instruction; not retrying risks a stalled run. Both are silent.

The protocol is therefore: record the intent with a probe of pre-call evidence,
call the backend, observe the effect, and only then clear the record
(`src/cli/commands/session.mts`). After a crash, `reconcile` compares the
agent's monotonic `state_change_seq` and inspects the pane tail. Its answer may
be `unknown`, and `unknown` pauses the run — an honest stop beats a confident
duplicate. At most one operation is in flight at a time, because with two an
observed effect cannot be attributed to an intent.

Capabilities are graded `supported | degraded | unsupported` rather than
claimed, and only `statusRead` and `stop` are completion-critical: everything
else has an honest degradation, but a run that cannot observe its workers cannot
attest anything, and one that cannot stop them leaves orphans behind
(`src/adapters/adapter.mts`).

## §A-DETERMINISTIC-WATCHDOG — Recovery decides from a closed set of actions

Implements §B-WORKFLOW-02.

Unattended recovery is where a helpful process does the most damage. A watchdog
that "nudges" a stuck session, or that asks a model what to do, will eventually
resend a prompt, spawn a second executor, or talk a paused run into continuing.

So the watchdog is a pure function over state with four possible actions —
`noop`, `wake_orchestrator`, `spawn_orchestrator`, `backoff`,
`surface_uncertainty` — and no others (`src/watchdog/watchdog.mts`). It wakes at
most once per `stateVersion` and spawns at most once per
`orchestratorGeneration`, so a wedged run produces a bounded number of attempts
rather than a loop.

It never instructs a worker, never edits the FSM, and never overrules the
classifier: a local model may fill an `unknown` classification, but may not
change one the patterns already decided (`src/watchdog/classifier.mts`). A quota
pause is only left when a machine-readable reset time has demonstrably passed —
"3pm" is not one.
