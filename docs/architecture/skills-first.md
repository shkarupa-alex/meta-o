# Skills and reasoning are the process orchestration layer

## Decision

Meta-O has no executable router, finite-state-machine service, run registry,
provider proxy, backend adapter or persisted orchestration state. Entry skills
give the active agent a lifecycle, review standard and concrete native backend
mechanics; agent reasoning selects the next safe action.

The orchestrator manages process and sessions but does not inspect, judge or edit
product code. Executors, reviewers and E2E actors read the repository. The
orchestrator may read task intent before activation and use Git metadata needed
to identify one clean full candidate SHA.

## Business reason

The previous generation accumulated a second workflow engine around tools that
already owned sessions, state and transport. Each extra receipt, registry,
adapter and recovery protocol created another truth that could disagree with Git
or the backend. The product exists to coordinate those tools, not replace them.

## Shared and backend-specific ownership

`shared/references/methodology.md` owns lifecycle, autonomy, questions and
completion. `review-protocol.md` owns common review and backlog semantics.
`backend-contract.md` owns minimum observable capabilities. Herdr, Orca and
Paseo mechanics own exact native commands. Separate fixed entry skills consume
those references so backend semantics remain explicit without duplicating the
standards.

## Evidence and restart

One verified result is one full Git object ID. Any new commit invalidates every
gate. Missing or unreadable evidence is `unknown` and repeated. Run evidence is
human-readable and ephemeral; no manifest, receipt, digest, baseline, registry
or external evidence sink is created. The watchdog's private delivery digest is
not run evidence: it has the single external consumer and deletion semantics
recorded in
[Watchdog nudge deduplication stores one private digest](watchdog-nudge-deduplication.md).

A restart begins a fresh run and reuses no prior gate or scratch state. This can
repeat work, but it avoids a recovery database that might bless stale evidence.

## Human boundary

The orchestrator decides technical, cheap and reversible matters and reports
those decisions at the end. The user handles product meaning, credentials,
subscriptions, irreversible actions and costly-to-change choices. An optional
watchdog starts only by explicit request.
