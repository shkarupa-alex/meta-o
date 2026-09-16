---
name: mo-review-orca
description: Use only when the user explicitly requests mo-review-orca or an active mo-orchestrate-orca calls it; independently review one exact candidate through two vendor-diverse Orca workers.
license: MIT
---

# Review through Orca

This skill starts only when the user names `mo-review-orca` or the active
orchestration skill calls it. A generic code-review request is not activation.

Read [Portable review protocol](references/review-protocol.md),
[Backend contract](references/backend-contract.md),
[Orca native mechanics](references/orca-mechanics.md), and
[Purpose and architecture contract](references/purpose-and-architecture.md)
completely. From the same resolved Orca binary also read the version-matched
`orchestration` and `orca-cli` bundled guides; never install guide copies.

Accept only an exact 40-hex `candidate_sha`, intent source, scope, mode and two
user-approved vendor-diverse selections from bundled
`scripts/mo-models.mjs --show --project <root>`. Never choose fallback model,
effort, placement or posture flags.

Those two selections form the vendor-diverse pair; neither may be substituted.

## Pre-pair placement

Before pair artifacts, read `ProjectRegistrationSet/1` from project/repository
inventory and `OwnedResourceSet/1` from worktree, terminal and worker surfaces.
Use two proven clean isolated worktrees of the current project or attributed
Orca `new-child` worktrees of a Git project. Shared `current`, raw
`git worktree add`, `orca repo add`, `new-top-level` and unproven remote
placement are forbidden.

For each selected worktree, run the resolved system `realpath -- <path>`
read-only, require exit zero and one absolute output path, and bind the recorded
command and output to that observation. Two lexical paths whose observed
realpaths are equal are one resource and fail with `inventory_changed`; stale,
missing or mismatched command/output evidence fails with `inventory_unreadable`.

If project identity, full inventory, placement or candidate cannot be proved,
create no Run tasks, namespace or reports. Emit exactly:

```text
REVIEW-START version=1 status=unsupported reason=<code> project=<id-or-none> candidate=<sha-or-none>
```

Use one of `no_project_context`, `inventory_unreadable`,
`inventory_partial`, `registration_kind_unknown`, `placement_unsupported`,
`remote_placement_unsupported`, `candidate_unverifiable`,
`inventory_changed`, `partial_start_failed`, `cleanup_incomplete`; include
the observed Orca error and evidence references, then return
`needs_attention`. Partial start releases only exact-owned resources and
rechecks both inventories. Never close or deregister an ambiguous resource.

## Reviewer pair

Create both tasks before launching either worker. The skill creates only two
reviewers, never an executor/fixer/verifier/subagent. Use stable visible titles
`<feature>:review:<vendor>`; title is a label and exact handles own cleanup.

Start each harness without task bytes. Positive version-matched observation must
prove its process, normal agent prompt and absence of trust UI or shell prompt
before one Dispatch injection. A composed start is allowed only when public
Orca evidence proves it holds bytes until that readiness. The Orca wrapper owns
unsandboxed posture; never duplicate its flags.

The first lifecycle pair uses `deep`; remediation uses `follow_up` in the
same hot sessions with only that reviewer's prior report and dispositions.
Keep remediation reviewers hot until both dispositions settle.
`fast` is explicitly standalone/advisory, and the portable protocol may
escalate it to `deep`. Before the one final same-SHA proof, release exact-owned
old reviewers and create a fresh independent pair in fresh independent sessions
with no prior reports.

Wait through one run-wide public waiter on both exact Dispatch handles. Use
300000 ms arms for reviewers; a quiet timeout permits one public liveness
snapshot and immediate re-arm without narration or messages. Retry the same arm
once after transport failure; a second consecutive failure is
`UNKNOWN/needs_attention`. Process every event in a returned batch before
acknowledgement.

On `worker-release: no_owned_resource`, close only the exact fallback-terminal
handle already stored for that Dispatch in `OwnedResourceSet/1`, then re-read
the resource projection. If that binding is absent, close nothing and return
`needs_attention`. The project records this workaround as `unsupported` until
an authenticated duplicate search establishes its canonical upstream Issue.

Wait for both full reports before disposition or handoff.

## Authoritative response

Each reviewer proves full SHA and clean status, performs non-mutating review and
places its entire report in authoritative `worker_done`. Require this exact
shape and anchored order:

```text
Review-Execution: <opaque dispatch id>
Candidate: <40-hex SHA>
Mode: requested=<fast|deep|follow_up> effective=<fast|deep|follow_up>
Delegation: none
Verdict: <PASS|FINDINGS|UNKNOWN>
Counts: P0=<n> P1=<n> P2=<n> P3=<n>

F-001 [P2] <one short sentence>

Evidence report
Grounding
...
Scope and checks
...
Findings
...
Unknown-Account
... only for UNKNOWN
Unknowns
...
Residual risks
...
End-Review: <opaque dispatch id>
```

`PASS` has four zero counts, an empty index and empty `Findings`, but
non-empty grounding/checks and explicit Unknowns/residual risks. `FINDINGS`
has matching monotonic report-local keys in index/body and counts. `UNKNOWN`
has zero counts, empty findings, `Unknown-Reason:` with one of
`unreadable|candidate_mismatch|dirty_candidate|malformed_report|retrieval_failure|handoff_failure|review_incomplete`,
and a non-empty account of completed stages, covered scope, blocking public
observation and recovery evidence.

Every finding states `confirmed|strongly_supported` evidence, causal path,
impact, actionable location, proof, post-fix invariant, technical direction,
acceptance proof and depth `local patch|boundary repair|affected-slice redesign`.
On structural mismatch request one complete corrected report in that hot
session; a second mismatch is `UNKNOWN`. Terminal text never replaces
`worker_done`.

Validate the report against caller-owned expected values: exact candidate,
native Dispatch id, requested mode and observed effective mode. A stale but
self-consistent header/footer is `UNKNOWN`. Parse structural markers as
top-level CommonMark prose with an AST; marker-looking bytes inside any code or
quote container remain body evidence.

## Lossless handoff and projection

After both valid reports, create one unique namespace with `umask 077` and
platform `mktemp -d` random suffix of at least eight symbols. Prove its realpath
is below system temp and mode `0700`. Assign slots A/B before launch and accept
only vendor slugs matching `^[a-z0-9][a-z0-9-]{0,31}$`.

Write each payload exclusively to a regular `0600` sibling and fsync/close.
Publish it atomically create-if-absent by hard-linking that complete sibling to
the final same-directory slot, then unlink the sibling. Never use
overwrite-capable rename. Existing regular, symlink or nonregular final paths,
unsupported hard links, permission, publication, reread, size or end-marker
failure are `UNKNOWN` and leave the existing final path untouched. Send the
named consumer one ordinary message with `pair_id`, both exact paths and decimal
sizes. A machine consumer acknowledges only after reading both:

```text
Review-Handoff-Ack: <pair_id> A=<decimal-bytes> B=<decimal-bytes>
```

One absent/mismatched acknowledgement permits one re-delivery of the same paths;
the next failure makes the pair `UNKNOWN` and preserves the namespace.
Human-caller review reports both paths/sizes and never auto-cleans them.

Publicly show exact SHA, pair verdict and component-wise sum of authored P0–P3
counts. Duplicate findings count twice. Do not expose index/content, deduplicate,
rank or paraphrase. P0–P2 block; deliver every P3 for fix or reasoned rejection
without a P3-only round. One substantive slice permits no more than
five paired review/fix attempts and still requires two fresh independent `PASS` reports on
one final SHA.

Never use `/goal`, edit/commit, run concurrent full QC, close foreign tabs or
retry `unknown_effect`. Report E2E as not evaluated unless separately requested.

## Meta-O calls

- none
