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

One window in the protocol is not closed, and is written down here rather than
implied to be. A spawn is two backend calls, and the pane id only exists once
the first has returned; the write-ahead record therefore learns it a moment
after the pane exists. A process killed inside that moment leaves an empty pane
that no record names. Every guarantee the protocol makes still holds — no agent
was started, so `not_applied` is the true answer about the operation and a retry
cannot duplicate a worker — but the pane survives, and repeated crashes at that
exact point accumulate them. Closing it would need Herdr to let the adapter
enumerate panes, or to accept a caller-supplied name at `pane split`, and it
offers neither; the adapter treats a pane id as opaque and will not guess at its
format. Every *other* orphan is reachable: a pane the record does name is closed
by `reconcile` once the start race is provably over, and a live agent the record
names is stopped by `run cleanup` even before any session names it.

## §A-DETERMINISTIC-WATCHDOG — Recovery decides from a closed set of actions

Implements §B-WORKFLOW-02.

Unattended recovery is where a helpful process does the most damage. A watchdog
that "nudges" a stuck session, or that asks a model what to do, will eventually
resend a prompt, spawn a second executor, or talk a paused run into continuing.

So the watchdog is a pure function over state with five possible actions —
`noop`, `wake_orchestrator`, `spawn_orchestrator`, `backoff`,
`surface_uncertainty` — and no others (`src/watchdog/watchdog.mts`). It wakes at
most once per `stateVersion` and spawns at most once per
`orchestratorGeneration`, so a wedged run produces a bounded number of attempts
rather than a loop.

Two of those actions send a prompt without a `PendingOperation`, and that is the
spec's own scoping rather than an exception to it. The write-ahead duty is
written for the *orchestrator*, in the chapter that also caps its state at one
in-flight record; the watchdog's chapter gives it a separate closed action set
whose delivery rule is backend-native wake and whose acceptance test is one wake
per completion event — a dedupe obligation, not a write-ahead one. A second
record could not exist in any case: a wake is decided exactly when an operation
may still be in flight, and an uncertainty prompt exactly when one is
`uncertain`, so recording another would break the one-at-a-time rule that makes
reconciliation decidable at all. What keeps that safe is that both payloads say
"read your own state and continue", so a duplicate costs nothing — unlike an
instruction. The dedupe is `watchdog-memory.json`, written
before the call, taken back only on an observable refusal, and — because it is
the whole guard — distinguishing "unreadable" from "no record": a lost file is
read as *notifications may already have gone out*, not as none have. That
verdict is reached once per tick over the whole file rather than per run,
because the conservative seed is itself a write, and a write repairs the file
for every run considered after it.

It never instructs a worker, never edits the FSM, and never overrules the
classifier: a local model may fill an `unknown` classification, but may not
change one the patterns already decided (`src/watchdog/classifier.mts`). A quota
pause is only left when a machine-readable reset time has demonstrably passed —
"3pm" is not one.
