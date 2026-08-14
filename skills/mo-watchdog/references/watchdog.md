# Watchdog behavior

The watchdog is independent of the feature methodology. Its purpose is to keep
observing backend sessions when cloud-model limits or overloaded inference stop
the orchestrator itself from progressing.

Start it only after the user explicitly asks. It may observe one selected
session (`target`) or enumerate every reachable session on all supported
backends (`scan`). Observation is read-only by default. Match backend-specific
regular expressions for limit, overload, failure, question, working and
completion states.

An explicit `nudge` is allowed only for an authorized target. Re-read native
state immediately before sending. Do not repeat an identical nudge while the
observed state is unchanged. There is deliberately no numeric cooldown or retry
count. Patterns will improve from real failures.

Never inspect provider-private transcripts, credentials or tracked project
content. Report backend, session locator, observed state and action. Do not
start, stop, delete or take ownership of sessions.
