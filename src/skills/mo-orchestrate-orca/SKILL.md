---
name: mo-orchestrate-orca
description: Use only when the user explicitly requests mo-orchestrate-orca; run one full feature to a verified exact SHA through Orca.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
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

This skill ships its own scripts in `scripts/` beside this `SKILL.md`. Every
`scripts/<name>` this skill and its references name is that file, never a path
in the project checkout, and it runs from this skill's directory with the full
path in double quotes, which also holds for a path with a space:

```text
node "<this skill's directory>/scripts/mo-models.mjs" --help
```

The session the user asked to orchestrate is the orchestrator. An unset
`orchestrator` role does not block the start and is not a reason to ask which
model this session should use; `--force` and another model generation stay
forbidden. Keep a role's terminal hot while its proven idle stays under the
methodology's threshold, and prefer a fresh session past it.

Read role selections with bundled `scripts/mo-models.mjs --show --json
--project <root>`; require exact user-approved values and never select a model,
effort, placement or posture fallback. Launch every role from its
`launch.<role> = {agent, model, effort, vendor}` as three separate flags
`--agent`, `--model`, `--effort`, never the whole `route/model/effort` in
`--model`; every vendor-diversity rule reads `vendor`, not the route, and
`unknown` is never a different vendor. Prove provider-native auth, account
freshness and one real launch: requested/effective identity equal, the provider
accepted the model and the first turn observed to begin. When a provider
refuses the model, run `scripts/mo-models.mjs --catalog --route <agent>` and ask
the human one question with the recommended replacement and the alternatives;
never substitute silently, never report a refusal without a proposal, and never
read an incomplete catalog as proof the model is absent. Task bytes wait for a
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
line. `not_enabled` means the project has no knowledge layer to close: drop only
the `MO-BACKLOG/1` closure proof from G0, GC, G1 and G2. The remote-head
equality of G1 and G2, G2's CI evidence and every other gate still apply.
`needs_attention` — a missing `MO-BACKLOG/1` command, papercut document or
identifier-history gate in a project that had or half-declared them — is
reported with the helper's reason and its `missing=` field as printed, and
running the setup skill stays the human's own step. Read the layer of the
committed `HEAD` before intake migration writes anything, so that a
`needs_attention` request ends with no spec, ledger or executor.

With `enabled`, run G0 through the project's `MO-BACKLOG/1` command after
intake migration and before substantive work. The one hot executor owns all product/spec edits,
regression tests, invariant comments and coherent commits. The orchestrator
does not inspect or edit product code. The executor's task asks for the
methodology's cleanroom self-review before every handoff: PASS from a subagent
that receives only the specification, the diff and the candidate SHA, the same
hot subagent for its own findings, and a new one after findings from you or the
reviewers. Accept the executor's `self_review_unavailable` as its harness's
typed answer and never as PASS; do not run the self-review yourself.

Quota, capacity, reconnecting, compaction, refusal after work, a lost process
and credentials are distinct outcomes, each recovered on the same task, model
and owner by its receipt's action. An unknown outcome climbs one ladder in one
direction: `worker-stop`, a proven stop, then `worker-start --retry-of` with the
same selection; a `worker-stop` answering `unknown_effect` ends it with no
second stop and no replacement. There is no numeric limit: start another
`--retry-of` only on a new basis to expect a different result — the quota window
opened, the connection came back, the cause of refusal was removed, new evidence
of state — and otherwise wait for that event through the one waiter, an
exhausted quota until its next window.

Use one run-wide blocking waiter: 600000 ms for executor-only and 300000 ms when
reviewer/E2E is active. Wake on `worker_done,escalation,question`, plus `status`
only while a report preview or pair handoff you sent has no matching
`Review-Preview-Ack` or `Review-Handoff-Ack` in the Run's messages. Demultiplex
exact handles, process complete event batches, and allow only one same-arm retry
after transport failure. After every quiet timeout, before any status answer to
the user and before any repeated message to an actor, run the checkpoint of
[Orca native mechanics](references/orca-mechanics.md): the Run's unread batch
without `--wait`, `worker-show` for each active Dispatch — a `completed` one is
processed through its `worker_done` before anyone hears it still works, and
`stale_status` does not cancel that — an idle input over a running child
reported as two facts with the instruction queued once in the same terminal, and
`unknown/unverifiable` instead of a truncated preview. Re-arm without narration
only after that, and never say you are waiting while no wait is armed.

After a compaction — Claude Code's continuation summary at the start of the
context, Codex's compaction notice, or, where neither is recognizable, a summary
of earlier work instead of the original messages at the start of a turn — act on
nothing first. Reread this `SKILL.md` completely and every reference it names,
then restore the run from public Orca, never from the summary: the checkpoint of
the one wait, every `E2E-Evidence` and `E2E-Coverage` line from `mo-e2e`'s
complete `worker_done` messages, and the `Round` line of the last review brief.
Until both are done send no task, follow-up or brief and release no resource.

Answer an actor's technical, cheap and reversible question yourself and name
the decision in the final report. Without a confident answer, and outside the
human boundaries, consult before asking the human, as
[Feature lifecycle](references/methodology.md) section 4 says: a one-off
Dispatch of `reviewerA` or `reviewerB` chosen by `launch.<role>.vendor` — first
a known vendor other than yours, then one also other than the executor's,
otherwise `reviewerA` with vendor difference reported unproven; `unknown` is
never different. Start it read-only in the asking actor's worktree with
`worker-start --task <id> --worktree id:<repo>::<executor worktree>` and that
role's `launch` flags, wait for it in the one waiter at 300000 ms, then
`worker-stop`, prove the stop and release it after its single `worker_done`. It
edits and commits nothing, is no review and never reaches the final pair. Then
decide and report the decision, or ask the human one question with your
hypothesis and `Критика от <agent>/<model> (vendor=<…>): …`.

Run the proof loops in order, never alternating. When the executor settles and
its deterministic checks pass, E2E comes first, and only if the project has
scenarios in `docs/e2e.md` or the E2E document `AGENTS.md` names: call `mo-e2e`
with `scope=task` — it chooses the task's scenarios by the behavior the task
touches, including unchanged acceptance rows the task restores or depends on —
return a failure to the executor and rerun only the failed scenarios with
`scenarios=<id,…>` until every one passes. Without scenarios the evidence is
`E2E: not_applicable reason=<…>` and review starts at once. `scope=full` runs
only on the user's explicit request. Keep each scenario's `E2E-Evidence` and
`E2E-Coverage` line exactly as `mo-e2e`'s complete `worker_done` printed it,
replace only the lines of a rerun scenario, and after compaction reread them
from Orca's responses; a result other than `pass|not_applicable` never reaches
a reviewer, and there is no shared E2E SHA.

Call `mo-review-orca` for the first deep pair and remediation follow-ups, and
give every brief the current E2E lines verbatim, or the one
`E2E: not_applicable` line. An `e2e_affected` or `e2e_missing` finding is an
ordinary finding of the round: after its fix rerun through `mo-e2e` only the
scenarios it lists on the new candidate, replace only their lines, and continue
the review; a new SHA alone reruns nothing. Give
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
the candidate, naming the command and its exit code; reviewers never run tests,
linters or QC. After knowledge
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
reports and, with the knowledge layer `enabled`, an empty GC, and every
applicable scenario has E2E evidence on that SHA or an ancestor with no
`e2e_affected` or `e2e_missing` from the final pair. The final report names the final SHA for QC
and reviews and copies every `E2E-Evidence` line with its own scenario SHA;
never present an earlier scenario pass as a pass of the final SHA. Otherwise return honest
`needs_attention`. Never finish with unacknowledged reports, unresolved backlog,
foreign cleanup or a required question.

## Meta-O calls

- `mo-review-orca`
- `mo-e2e`
