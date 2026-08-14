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
count. Successful delivery stores only mode-`0600` state and message digests
keyed by backend and locator under the user state directory; a changed state
replaces its prior message set. It stores no prompt, response, candidate, gate or
actor registry. Herdr and Paseo nudges are nonblocking, and completion is observed
separately. The helper requires `jq` so native JSON is parsed per session instead
of with regular expressions. Patterns will improve from real failures.

Never inspect provider-private transcripts, credentials or tracked project
content. Report backend, session locator, observed state and action. Do not
start, stop, delete or take ownership of sessions.
