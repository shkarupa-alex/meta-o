# Watchdog nudge deduplication stores one private digest

## Decision

The pattern watchdog stores one mode-`0600` record per backend locator before an
authorized nudge attempt. The record contains a digest of the backend, locator and
normalized native state plus digests of messages already delivered in that
state. A later invocation suppresses any repeated message while that state is
unchanged. A new state replaces the prior message set. It stores no message,
response, actor registry, candidate identity or gate result.

The helper parses backend list JSON with `jq`, reports each native locator
separately, and compares a backend-specific semantic projection. For Orca that
projection keeps typed dispatch, worker, observation and permission state plus
terminal connection/orphaning, while excluding RPC IDs and terminal
`preview`, `title` and `lastOutputAt`: those fields describe presentation and
repainting, not a state transition that should suppress delivery. Paseo excludes
its refreshed `UpdatedAt`. Herdr and Paseo delivery is nonblocking; subsequent
observation owns completion.

The helper accepts a nudge only after two successful identical reads. A mature
`flock` advisory lock covers the per-locator duplicate check, reservation and
native delivery, and the kernel releases ownership when a process exits. The
message digest is reserved before delivery; a crash or nonzero backend result is
ambiguous and remains suppressed until native state changes rather than risking
a duplicate nudge. Sixteen distinct message digests in one unchanged state
collapse to one saturation marker, keeping the record bounded while failing
closed until state changes.

## Business reason

The user requires a watchdog that can nudge an agent stalled by an API limit or
overloaded inference without itself waiting on that agent, and that does not
repeat an identical nudge when separate watchdog invocations observe no state
change. Without a durable fingerprint, a restarted observer cannot meet the
second requirement. Without per-session parsing, a failed session can mask a
working one and the user cannot identify the target that needs attention.

## Boundary

This narrow delivery fingerprint is the named exception to the project's
general prohibition on state stores. It is not orchestration state and cannot
resume or choose workflow work. Deleting it can cause a duplicate nudge but
cannot lose product work or invalidate a candidate. The directory may be
overridden with `WATCHDOG_STATE_DIR` for disposable testing.
