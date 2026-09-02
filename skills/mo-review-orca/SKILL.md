---
name: mo-review-orca
description: Independently review one exact candidate with two vendor-diverse Orca workers and return a complete same-SHA pair without editing code.
license: MIT
---

# Review through Orca

Read [Portable review protocol](references/review-protocol.md),
[Backend contract](references/backend-contract.md),
[Orca native mechanics](references/orca-mechanics.md), and
[Purpose and architecture contract](references/purpose-and-architecture.md) completely.

Accept only an exact 40-hex `candidate_sha`, intent source, scope, mode and two
user-approved reviewer selections. Read selections through bundled
`scripts/mo-models.mjs --show --project <root>` when it is available; never pick
a fallback model, effort or posture flag. A dirty/mismatched checkout or invalid
selection is `UNKNOWN`.

Create both review tasks before launching either worker. Start one Codex and one
Claude reviewer (or another explicitly approved vendor-diverse pair) with stable
titles `<feature>:review:<vendor>`. Each receives original intent and candidate,
but no peer bytes. The first lifecycle pair uses `deep`; remediation uses
`follow_up` with only that reviewer's own prior report and dispositions. `fast`
is only an explicitly requested standalone/advisory mode. The portable protocol
may escalate any mode to `deep`.

Each reviewer proves the full SHA and clean status, performs non-mutating review,
and returns the entire textual report in authoritative Orca `worker_done`. Its
native Dispatch id is the opaque `Review-Execution`. After accepted delivery,
show a brief TUI severity summary linked to that id. A missing summary is a UX
defect, but never invalidates a complete `worker_done`; terminal text never
replaces a missing/rejected report. If delivery is not confirmed, display
`REVIEW DELIVERY UNKNOWN <Review-Execution>` and return `UNKNOWN`.

Wait for both full reports before releasing either to the caller. Preserve the
original bodies without merging, ranking, paraphrasing or exposing peer output.
Keep remediation reviewers hot. Before the one final same-SHA proof, release
only owned old sessions and create two fresh independent sessions with no prior
reports. Never close unnamed or foreign tabs.

P0–P2 block settlement. Deliver every P3 for fixing or reasoned rejection, but
do not create a separate P3-only round. A substantive slice permits at most five
paired review/fix attempts; remediation does not reset that budget. This limit
does not weaken the final requirement: settlement still needs two independent
`PASS` reports on one exact SHA, or an honest `needs_attention`.

Never use `/goal`, edit/commit, start another reviewer, or run concurrent full
QC. Report E2E as not evaluated unless separately requested.
