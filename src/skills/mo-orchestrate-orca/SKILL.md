---
name: mo-orchestrate-orca
description: Use only when the user explicitly requests mo-orchestrate-orca; run one full feature to a verified exact SHA through Orca.
license: MIT
---

# Orchestrate a feature through Orca

Start only when the user names `mo-orchestrate-orca`; a generic implementation,
planning or review request does not activate this lifecycle.

Read [Feature lifecycle](references/methodology.md),
[Backend contract](references/backend-contract.md),
[Portable review protocol](references/review-protocol.md),
[Orca native mechanics](references/orca-mechanics.md), and
[Purpose and architecture contract](references/purpose-and-architecture.md)
completely. Resolve one Orca binary and read its non-empty version-matched
`orchestration` and `orca-cli` guides.

Read role selections with bundled `scripts/mo-models.mjs --show --project
<root>`; require exact user-approved values and never select a model, effort,
placement or posture fallback. Prove provider-native auth, account freshness and
one real launch with requested/effective identity equal. Task bytes wait for a
publicly proven normal agent prompt, never trust UI or shell.

Use titles `<feature>:orchestrator`, `<feature>:executor`,
`<feature>:review:<vendor>` and `<feature>:e2e:<n>`. Preserve exact
Run/task/Dispatch/terminal identities in reasoning, not a state store. Before
actors, record project registrations/resources; every actor must remain in the
same Orca project and cleanup may touch only exact-owned delta.

Run G0 through the project's `MO-BACKLOG/1` command after intake migration and
before substantive work. The one hot executor owns all product/spec edits,
regression tests, invariant comments and coherent commits. The orchestrator
does not inspect or edit product code.

Use one run-wide blocking waiter: 600000 ms for executor-only and 300000 ms when
reviewer/E2E is active. Demultiplex exact handles, process complete event batches,
re-arm quiet timeouts without narration, and allow only one same-arm retry after
transport failure.

Call `mo-review-orca` for the first deep pair and remediation follow-ups. Give
the executor both immutable reports only through its verified
pair paths/sizes; wait for exact `Review-Handoff-Ack` before cleanup. Keep
remediation reviewers hot, and use a fresh final same-SHA pair. Public updates
contain only candidate, pair verdict and summed authored P0–P3 census.

For a confirmed out-of-scope technical defect, apply the project decision table:
route to project/upstream only after verified ownership, search open+closed with
explicit complete limits, redact a private file-safe body and use native
`gh`/`glab`. A technical Issue with established root cause/owner is
pre-authorized; credentials, product disputes, subscriptions, irreversible or
unknown effects and watchdog remain human boundaries. Never retry an unknown
write effect.

Run foreground serialized QC and call `mo-e2e` for applicable scenarios.
After knowledge harvest and removal of the implemented spec, require GC on the
exact candidate. Immediately before any agent-owned MR/PR create run G1 and
verify remote source head equality. Immediately before merge run G2 and bind the
provider write to that head/required policy; unsupported integration candidate
proof is `needs_attention`.

Return only when one unchanged full SHA has QC, two fresh vendor-diverse PASS
reports, applicable E2E and empty GC. Otherwise return honest
`needs_attention`. Never finish with unacknowledged reports, unresolved backlog,
foreign cleanup or a required question.

## Meta-O calls

- `mo-review-orca`
- `mo-e2e`
