# Watchdog behavior

The watchdog is independent of the feature methodology. Its purpose is to keep
observing backend sessions when cloud-model limits or overloaded inference stop
the orchestrator itself from progressing.

Start it only after the user explicitly asks. It may observe one selected
session (`target`) or enumerate every reachable session on all supported
backends (`scan`). Observation is read-only by default. Match backend-specific
regular expressions for limit, overload, failure, question, working and
completion states.

For Orca, a supervised worker uses its `ctx_` Dispatch locator. A low-level
injected task uses its `task_` locator for read-only state, while its exact
`term_` handle is the authorized nudge target. Scans include both supervised
workers and ordinary terminals so the documented dispatch fallback stays
visible.

An explicit `nudge` is allowed only for an authorized target. Re-read native
state immediately before sending. Do not repeat an identical nudge while the
observed state is unchanged. There is deliberately no numeric cooldown or retry
count. An authorized delivery attempt first reserves only mode-`0600` state and
message digests keyed by backend and locator under the user state directory; a
changed state replaces its prior message set. It stores no prompt, response,
candidate, gate or actor registry. Herdr and Paseo nudges are nonblocking, and
completion is observed separately. The helper requires `jq` so native JSON is parsed per session instead
of with regular expressions, and `flock` so process exit releases per-locator
delivery ownership through the kernel. Classification uses scalar values rather
than key names, and stable comparison excludes volatile Orca envelope IDs and
Paseo `UpdatedAt`. Patterns will improve from real failures.

A status-zero Orca or Paseo target read is trusted only when its native JSON
envelope and locator-specific shape validate. Paseo's returned agent ID must
match the requested full ID or prefix. Malformed or mismatched output is an
`observe-error`; it never reaches state persistence or nudge delivery. Orca
terminal items report native `connected`, `disconnected` or failed-orphaned
process state plus `lastOutputAt`; connection is never promoted to agent
`working`, and raw preview text never overrides those process tokens. A terminal
without native process flags is `unclassified`. Any scan item without a native
locator makes that surface an `observe-error` rather than an observed `unknown`
session.
For a `ctx_` worker envelope, the embedded terminal is diagnostic only: discard
its preview and classify only typed dispatch, worker, observation, error and
permission fields. Paths, launch options and other scalar metadata cannot name a
state. Missing typed dispatch or worker state makes a targeted observation
invalid. Terminal `preview`, `title` and `lastOutputAt` are diagnostics rather
than stable-state inputs, so repainting cannot suppress a nudge forever;
connection and orphaning flags remain semantic inputs.

A nudge requires two successful identical native reads. The helper serializes
the per-locator duplicate check, reservation and delivery. It stores the message
digest before native delivery, so a concurrent invocation or ambiguous crash is
suppressed rather than allowed to duplicate the nudge. After sixteen distinct
messages in one unchanged state, the record collapses to a saturation marker and
suppresses all further nudges until state changes.

Never inspect provider-private transcripts, credentials or tracked project
content. Report backend, session locator, observed state and action. Do not
start, stop, delete or take ownership of sessions.
