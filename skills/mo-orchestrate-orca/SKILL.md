---
name: mo-orchestrate-orca
description: Use only when the user explicitly requests mo-orchestrate-orca; run one full feature to a verified exact SHA through Orca.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
  source_tree: "58bc4402e36e938aec9b72a33e532ad12aef820f"
---

# Orchestrate a feature through Orca

Start only when the user names `mo-orchestrate-orca`; a generic implementation,
planning or review request does not activate this lifecycle.

Read [Feature lifecycle](references/methodology.md),
[Backend contract](references/backend-contract.md),
[Portable review protocol](references/review-protocol.md),
[Orca native mechanics](references/orca-mechanics.md), and
[Маршрутизация подтверждённой внешней работы](references/issue-routing.md),
[Обратная связь о методологии](references/methodology-feedback.md), and
[Purpose and architecture contract](references/purpose-and-architecture.md)
completely. Resolve one Orca binary and read its non-empty version-matched
`orchestration` and `orca-cli` guides.

The session the user asked to orchestrate is the orchestrator. An unset
`orchestrator` role does not block the start and is not a reason to ask which
model this session should use; `--force` and another model generation stay
forbidden. Keep a role's terminal hot while its proven idle stays under the
methodology's threshold, and prefer a fresh session past it.

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

This lifecycle also runs from an ordinary shell. One predicate decides
placement, the terminal's own handle: `ORCA_TERMINAL_HANDLE` present and
`orca terminal read --terminal "$ORCA_TERMINAL_HANDLE" --screen --json`
readable means inside, and the variable absent or that read refused means
outside. Where the shell stands is not a second sign: a directory inside a
registered worktree owns no terminal, and a terminal Orca created keeps its
handle from any directory. A handle-free terminal read resolves the worktree's
focused terminal, not the caller's, and `--terminal` accepts only a
runtime-issued handle, never a relative word; neither decides placement. Then a
worktree selector is `id:<repo>::<path>`
or `path:<path>` and never `current` or `active`, the Run is created without
`--from`, waiting is `check --run <id> --wait`, and no coordinator title is set.
If no watchdog sees this session, say once that the limit is accepted — work
stops at the limit until a human returns — and continue. Probe the watchdog
helper, `jq` and `flock` only when the user asks for the watchdog; their absence
is then an ordinary typed gap, and starting the watchdog stays a human boundary.
Temporary specifications, brief drafts and intermediate coordinator files live
in the project's `.orca/`; where `.orca/` is not ignored, write no temporary
file into a tracked path and return `needs_attention`.

A project that cannot answer the readiness questions is not ready, and this
skill does not prepare it. Read the knowledge layer of every exact SHA with
bundled `scripts/mo-knowledge-layer.mjs --candidate <sha>` and keep its one
line. `not_enabled` means the project has no knowledge layer to close: drop
only the `MO-BACKLOG/1` closure proof from G0, GC, G1 and G2. The remote-head
equality of G1 and G2, G2's CI evidence and every other gate still apply. `needs_attention` — a missing
`MO-BACKLOG/1` command, papercut document or identifier-history gate in a
project that had or half-declared them — is reported with the helper's reason,
and running the setup skill stays the human's own step.

With `enabled`, run G0 through the project's `MO-BACKLOG/1` command after
intake migration and before substantive work. The one hot executor owns all product/spec edits,
regression tests, invariant comments and coherent commits. The orchestrator
does not inspect or edit product code. The executor's task asks for the
methodology's cleanroom self-review before every handoff: PASS from a subagent
that receives only the specification, the diff and the candidate SHA, the same
hot subagent for its own findings, and a new one after findings from you or the
reviewers. Accept the executor's `self_review_unavailable` as its harness's
typed answer and never as PASS; do not run the self-review yourself.

Use one run-wide blocking waiter: 600000 ms for executor-only and 300000 ms when
reviewer/E2E is active. Demultiplex exact handles, process complete event batches,
re-arm quiet timeouts without narration, and allow only one same-arm retry after
transport failure.

Call `mo-review-orca` for the first deep pair and remediation follow-ups. Give
the executor both immutable reports only through its verified
pair paths/sizes; wait for exact `Review-Handoff-Ack` before cleanup. Keep
remediation reviewers hot, and use a fresh final same-SHA pair. Public updates
contain only candidate, pair verdict and summed authored P0–P3 census.

Confirmed friction in a Meta-O skill, reference or script is `ISS-16`: search
the repository named by this skill's `metadata.repository`, comment on a match
or create one sanitized Issue, and never write it anywhere else. Without that
field there is no addressee, so the observation goes to the human as
`needs_attention`. A worker reports friction to you as one ordinary
`Methodology-Friction:` message; in an eval or E2E run nothing is written
outside at all.

For a confirmed out-of-scope technical defect, apply the bundled Issue-routing
decision table:
route to project/upstream only after verified ownership, search open+closed with
explicit complete limits, then reread and redact the final title and every
allowlisted field of the private file-safe body with the same closed policy. Use native
`gh`/`glab`. A technical Issue with established root cause/owner is
pre-authorized; credentials, product disputes, subscriptions, irreversible or
unknown effects and watchdog remain human boundaries. Never retry an unknown
write effect.

Run the project's declared QC in the foreground in a clean checkout of exactly
the candidate, naming the command and its exit code, and call `mo-e2e` for
applicable scenarios; reviewers never run tests, linters or QC. After knowledge
harvest and removal of the implemented spec, require GC on the exact candidate.
Immediately before any agent-owned MR/PR create run G1 and verify remote source
head equality. Immediately before merge run G2: the closure proof, the remote
head, `CI-Coverage/1 covered` and a successful run of every covering CI QC job
whose printed checkout SHA equals the candidate, then bind the provider write to
that head/required policy. Any other coverage outcome, a missing or failed run,
another checkout SHA or unsupported integration candidate proof is
`needs_attention`; a locally proven candidate is still delivered, but never
merged by the agent without that CI evidence.

Return only when one unchanged full SHA has QC, two fresh vendor-diverse PASS
reports, applicable E2E and, with the knowledge layer `enabled`, an empty GC. Otherwise return honest
`needs_attention`. Never finish with unacknowledged reports, unresolved backlog,
foreign cleanup or a required question.

## Meta-O calls

- `mo-review-orca`
- `mo-e2e`
