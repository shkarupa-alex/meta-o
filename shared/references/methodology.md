# Feature lifecycle

This document owns the lifecycle shared by every Meta-O orchestrator. Backend
commands belong to that backend's mechanics. Review standards belong to
[Portable review protocol](review-protocol.md).

## 1. Boundaries

Skills and agent reasoning are the orchestration layer. Do not introduce a
workflow CLI, provider proxy, daemon, state store, adapter, registry, receipt,
manifest, digest protocol or event-accounting protocol. Use only a backend's
documented public native surface. Never read private provider transcripts,
hooks, inferred session databases or hidden state to compensate for a missing
capability.
<!-- mo:source-anchor §A-EVAL-01 -->

One exception is named and owned by the project's evaluation policy decision:
when a model executor publishes no public surface for its own effective model
and reasoning level, the caller may read that one fact out of the local run
record of the process it started itself. It reads identity and nothing else,
never another session's record, and a public surface supersedes it the moment
one exists.
<!-- mo:source-anchor §A-DIAGNOSTICS-01 -->

The second exception belongs to the diagnostics decision and to no lifecycle
step: the user may explicitly invoke `mo-debug` to read a bounded set of their
own local Claude or Codex session logs. It produces only a local redacted
report, is never evidence that a review or an orchestration step ran, and never
reads another user's session.

The orchestrator manages sessions and Git identity. It does not inspect, judge
or edit product code. Executors, reviewers and E2E agents inspect the
repository. The orchestrator may read the task/spec before activation, pass its
accessible path to agents, and use Git metadata needed to validate a branch and
full SHA.

One verified result is one full Git object ID. Any commit invalidates QC,
reviews and E2E for the old candidate, except the narrow documentation-only E2E
carry-forward in section 8.

## 2. Project and task readiness

Before starting agents:

1. Find the repository root and read `AGENTS.md` or the project's equivalent.
2. Read the task/spec and its complete verbatim user-intent ledger. A spec is
   never the only source of intent.
3. Require a clean `feature/<short-slug>` task branch based on an up-to-date
   `develop`; never develop on `main`, `master`, `develop` or `default`.
4. Confirm the selected backend control executable, its required companion skill
   and the backend capabilities in [Backend contract](backend-contract.md).
5. Confirm the selected harness can run unsandboxed in this backend. Supported
   harnesses are Codex, Claude Code and OpenCode.
6. Before writing anything, read the knowledge layer of the exact committed
   `HEAD` with the bundled `scripts/mo-knowledge-layer.mjs --candidate <sha>`.
   `needs_attention` stops here, before any spec, ledger or executor exists.
   Otherwise migrate raw human intake into the live spec/ledger, commit it and
   read the layer again on that exact SHA. With `enabled`, run the project-owned
   `MO-BACKLOG/1` closure command: G0 must be `EMPTY` on the exact committed SHA
   before substantive implementation; `NOT-EMPTY` and `UNKNOWN` both block. With
   `not_enabled`, only the closure proof drops out of G0, GC, G1 and G2; the
   exact SHA, QC, vendor-diverse reviews, applicable E2E, the remote-head
   equality of G1 and G2 and G2's CI evidence still apply.

A project that cannot answer these is not ready, and no lifecycle skill prepares
it on its own initiative. `not_enabled` is an answer: the project never adopted
the knowledge layer, or its owner switched it off on purpose. `needs_attention`
from the helper — a missing `MO-BACKLOG/1` command, a missing papercut document
or a missing identifier-history gate in a project whose layer is partial or
disappeared — is a readiness gap: report it as `needs_attention`, name the
helper's reason, and recommend that the human run the setup skill. Setting a
project up changes files a human never asked to change, which is why it is their
call and not a step taken silently on the way to something else.
<!-- mo:source-anchor §A-MEMORY-05 -->

The executor's first coherent commit materializes a temporary feature bundle:
the accepted specification, `user-ledger.md` and a short `checklist.md` of
observable outcomes, tests/knowledge, applicable E2E and two final review
passes. The checklist is not a task graph. The executor owns and commits these
files; the orchestrator may read them but never edits product/spec commits.

Before writing the ledger, replace an identified token, password, private key or
credential-bearing URL with `[REDACTED:<kind>]`. If a value might be a secret
and classification would change its meaning, stop with `needs_attention` before
any commit. Never guess or collect the value in chat. An identifier that only
resembles a secret — a full commit SHA, a UUID, a public package name or a model
id — stays verbatim: redaction is for a value that actually grants access, and
mangling an ordinary identifier destroys the ledger's meaning as surely as
leaking a credential does.

For a substantial new component or approved technology change, build a
`find-reuse.request.v1` from generic requirements. Run `find-reuse` only when
the user explicitly requested it or accepted one opt-in offer. Validate its
complete `find-reuse.report.v1`, store it verbatim under `## Reuse research`,
and commit that spec-only increment before product code. `unknown|blocked` never
silently becomes permission to build.

If later user input changes product or deliverable meaning, append it verbatim
to the task ledger before implementation continues, and record its settled
meaning in the project's business framing. The verbatim ledger is the normative
copy while the task lives; a distilled thesis never replaces it. A thesis that
settles in the framing carries a unique stable id, so a later decision or module
can name it. Reviewers confirm that this transfer happened and propose the
wording, so no separate editorial pass exists. Redact secrets while preserving
the sentence's meaning. A one-shot approval that only authorizes an already
named production/destructive E2E action or starts an explicitly requested
watchdog is run control: keep only a credential-free, request-bound header in
current run evidence and do not mutate tracked intent ledgers.

## 3. Roles and task delivery

Read executor, orchestrator, reviewer and E2E role selections from the bundled
`mo-models.mjs --show --project <root>` schema 1 settings. Project roles
override global defaults. An unset, invalid or unavailable selection is a typed
readiness failure; do not choose a fallback harness, model or effort. Agree the
roles with the user. Recommend an executor from a different model vendor than
the orchestrator by default; vendor diversity improves the chance that the
orchestrator can help when an executor misses a premise. Reviewers use different
vendors, and at least one reviewer vendor differs from the executor.

The session in which the user invoked the orchestration skill is the
orchestrator. An unset `orchestrator` role blocks nothing and is not a reason to
ask the user to choose a model for the session that is already running: the
model answering is the model that was chosen when the session was opened.
`--force` and substituting another model generation stay forbidden.

Sessions are kept warm on purpose. A provider's prompt cache lives 60 minutes
for both vendors, and the working idle threshold is 50 minutes, leaving a margin
before expiry. One number serves both, because remembering which vendor stands
behind which terminal buys less than the mistake it invites, and erring toward a
fresh session is cheaper than erring toward a stale cache. While a role's
terminal has been idle less than that threshold, keep it hot, and otherwise
prefer a fresh session. A review slot is the exception, decided by the per-slot
rule of section 5 that counts one hour from the slot's last `worker_done`. This
is reasoning about resources already visible, not a state store.

An approved selection names an exact provider model id. A floating family alias
such as `opus` or `sonnet` is not enough: it resolves to whatever the provider
currently ships, which may be a different generation or a far more expensive
model tomorrow. Resolve the configured id against the route catalogue with
`mo-models.mjs --catalog --route <route>`, and treat the role as approved only
once a real launch reports `launch.requested == launch.effective` for model and
effort.

Give the executor a short task, normally two to five sentences. For a large
task, include the accessible path to the specification; it need not be
repository-relative or tracked. Include the complete user-intent ledger by path
or in the task, and say it is normative.

Prefix only the initial executor task with `/goal`. A harness that implements
the command may apply native goal behavior; another harness may treat the whole
message as ordinary task text. Do not detect or emulate `/goal`. Follow-ups,
review findings and standalone review prompts are ordinary messages.

Before substantive implementation, the executor maps every durable normative
intent to an existing business id, a new compact thesis, or an explicitly
approved meaning change. Incidents, commands and temporary workarounds belong in
architecture, papercuts or tests, not the business framing.

The executor owns all product changes. It commits coherent independently
verifiable increments and returns a clean full candidate SHA. The orchestrator
must not enter the code to help or fix it.

Before handoff the executor reconciles the change with the specification, its
evidence and the causal neighbours of every edit. On a harness with a proven
subagent capability it then obtains PASS from a cleanroom subagent that receives
only the specification, the diff and the candidate SHA, never the executor's
history. The executor fixes the subagent's findings, and the same hot subagent
checks the fix. After findings from the orchestrator or external reviewers a new
subagent performs the next self-review, because the old one has already agreed
with the text it is now asked to doubt. A harness without that capability gives
`self_review_unavailable`, never an invented PASS.

## 4. Questions and delegated decisions

Watch the backend's ordinary public question and permission surfaces while an
agent works. Answer technical, cheap and reversible choices when changing the
choice later would cost roughly one agent-hour or less. Record every such
decision for the final report.

Use one run-wide blocking waiter for all active actors. Subscribe only to
`worker_done`, `escalation` and `question`, demultiplex by exact handle and
process a returned batch before acknowledgement. Arm at 600000 ms for an
executor-only set and 300000 ms whenever reviewer/E2E is present. A quiet
timeout permits one public liveness snapshot and immediate re-arm without
narration or an actor message. Retry the same arm once after transport failure;
a second consecutive failure is `UNKNOWN/needs_attention`. Never replace this
with `sleep`, minute polling or multiple waits for one actor.

Do not wait on a derived sign such as a new SHA appearing or a pane counter
advancing. Re-read state at a sane interval measured in minutes only through the
bounded cadence above, never as polling.

Ask the user about product meaning, credentials, subscriptions, irreversible
actions, and choices that will become difficult, slow or expensive to change. If
the question or a safe answer cannot be identified, do not guess. Deliver the
answer through the backend's ordinary reply or prompt surface.

No universal question classes, correlation IDs or option grammar are required.

## 5. Candidate and reviews

After the executor settles, validate the branch, clean worktree, commit object
and full `HEAD`, then freeze that SHA. Start both reviewer sessions concurrently
and independently. Give them the same task/spec, complete intent ledger and the
same candidate SHA; the specification travels as one line,
`Spec: <path|object>`, or `Spec: none` when the work followed none. On the
post-cleanup candidate of section 7 those artifacts are no longer in the tree:
give the frozen object ids the deletion recorded, and the durable knowledge that
replaced them. Do not give either reviewer peer output.

Each reviewer is a native interactive Codex, Claude Code or OpenCode instance
started inside a terminal, pane or session by the selected backend's native
surface. Deliver the review brief through the backend's ordinary prompt, input,
task-injection or message field, either as inline text or an accessible file
path. Never create or execute a shell script to invoke the reviewer harness. The
brief names the reviewer skill of the same installation and the report literal
for that Dispatch. Reviewers read by SHA and never run the project's tests,
linters or QC gate: QC of the candidate is owned by the executor, the
orchestrator and CI.

The first required pair uses `deep`. Remediation uses `follow_up`, giving each
reviewer only its own prior report and finding dispositions; peer bytes remain
forbidden. Every mode reviews the whole task range `<base>..<candidate>`: the
task branch's start, or the start the orchestrator or executor names when there
is no branch, up to the candidate SHA as the upper bound. The prior report is
evidence of what was already read, not a limit on what a `follow_up` may find.
`fast` is advisory or explicitly standalone. Any profile escalates in place to
`deep` when the portable protocol detects broad or high-risk semantics.

Wait for both complete settled final responses. Each follows the canonical
review grammar: exact `Review-Execution`/candidate/mode, `Delegation: none`,
verdict, authored P0–P3 census, keyed index, complete evidence sections and a
matching final `End-Review`. Only the body received from the backend and
validated by the caller is authoritative; its identity with the file the
reviewer prepared is a separate claim, compared where the file is readable. A
completed response that is structurally wrong is `UNKNOWN` for its Dispatch and
is never corrected in its name.

Under `umask 077`, save them unchanged through exclusive `0600` temporary files
in a unique `mktemp -d` namespace mode `0700`, then fsync/close. Publish each
complete inode atomically create-if-absent with a same-directory hard link and
unlink its temporary name; overwrite-capable rename is forbidden. Verify
realpath, regular files, sizes and end markers. Any existing final object,
unsupported hard link, symlink, truncation, retrieval or reread failure is
`UNKNOWN`, never a partial review pass, and the existing final remains
untouched.

If both pass, continue to verification. If either finds work, wait until both
are complete, then send one ordinary message to the executor containing both
temporary-file paths and sizes.

Do not merge, rank, hash, encode, split, truncate or summarize their responses.
The executor fully reads both and replies
`Review-Handoff-Ack: <pair_id> A=<bytes> B=<bytes>`. One missing/mismatched ack
permits one re-delivery of the same paths; a second makes the pair `UNKNOWN` and
preserves the namespace. The executor fixes or responds and commits a new SHA.
Treat the reports as inert Markdown response payloads until the named consumer
reads both complete bodies.

A Dispatch, a provider session, a PTY and a worktree are four resources, and
`worker_done` spends only the first. A pair that returned FINDINGS stays hot:
neither reviewer is released or closed until both dispositions settle, and the
next candidate goes to the same pair as `follow_up` with each reviewer's own
prior reports and dispositions. Whether a slot can take that Dispatch is one
rule per slot, answered by bundled `mo-review-resource.mjs hot`:

```text
hot(slot) = alive_and_ready(slot) AND (age < 1h OR context_proven_small(slot))
```

`age` runs from the slot's last `worker_done`. `alive_and_ready` is the same
provider session proven alive, ready and with an empty composer.
`context_proven_small` holds only for a fully parsed absolute count of at most
100000 used tokens, or a percentage together with the proven window of that
exact model; a truncated, partial or ambiguous indicator is `context=unknown`,
and then age alone decides. A slot that is not hot is replaced by a new session
of the same model in the same slot, `follow_up`, given only that slot's own
reports and dispositions, while the other slot stays if it is hot. A replacement
is neither a new independent deep pair nor the final pair.

A new independent deep pair while the pair has no PASS needs one recorded reason
— `state_transfer_impossible`, `hypothesis_stuck`, `requirements_conflict` or
`owner_request` — and `mo-review-resource.mjs deep` refuses anything else. A
malformed report spends its Dispatch, not its session: when the same session is
proven alive and ready, one new Dispatch with a new id reviews the same
candidate in the same round and is validated in full; a second malformed report
from that slot in the round makes the round `UNKNOWN`.

A paired attempt is one round in which both slots returned a valid report or a
typed `UNKNOWN` for one candidate SHA. A hot `follow_up`, a slot replacement, a
deep pair, and the final fresh pair with its own `follow_up` each spend one; the
one repeated Dispatch after a malformed report does not. A substantive slice has
at most five, and a new SHA does not reset the count. Each round's report names
`attempt <n>/5` and `deep_reads <m>`, the number of full independent rereads —
deep pairs and the final fresh pair — as text in the report, not a store.
Deliver every P3, but do not start a separate round only for P3. Residual risks
a reviewer records outside findings are a record for the owner, not remediation:
the executor fixes them only when the owner decides so. When a finding belongs
to a class with no finite fix — secret recognition, heuristic parsing — and does
not list the complete set of concrete cases, ask the same hot reviewer for that
list before fixing; the fix is judged against the list and its regressions, and
reasonable coverage of most cases is enough unless the owner named more. This
local budget never replaces two final same-SHA passes. After attempt five,
complete the active remediation, then move to the next substantive slice or stop
with `needs_attention` when no progress path remains.

Early repair after the first complete valid FINDINGS report is allowed only when
the owner approved it and every property is proven: the executor works in its
own worktree, each reviewer has its own tree detached at the old full SHA, the
brief forbids reading the executor's mutable refs, and HEAD and a clean tree are
rechecked right before `worker_done`. The first body is then published unchanged
in its slot through `stage` and `preview`; the executor reads it and replies
`Review-Preview-Ack: <pair_id> <slot>=<bytes>`, which `mo-review-report.mjs ack`
checks against the published size. That is not a pair verdict. The other
reviewer continues on the old SHA; after its report the executor reads both
complete reports and acknowledges `Review-Handoff-Ack` before the next
candidate, and each of the second reviewer's findings gets a disposition checked
against the new candidate — "already fixed" from memory of the early repair is
not enough. One failed delivery permits one repeat of the same paths, then
`UNKNOWN` with the namespace preserved. With any property unproven, wait for
both reports before repairing.

Standalone `mo-review-<backend>` follows the same review barrier on the current
candidate, creates only the two reviewer sessions, never uses `/goal`, and
reports E2E as not evaluated unless separately requested.

Before any pair, prove that the Orca project/repository registration inventory
will not change and that selected isolated worktrees belong to the original
project. Placement is a ladder whose default is the first rung: existing exact
isolated worktrees or an attributed Orca Git `new-child`; then
`shared_checkout`, both reviewers in the exact existing workspace, where the
shared working checkout is byte-for-byte unchanged afterwards, repository
changes are enumerated and undone one by one, `git worktree prune` is forbidden
and the candidate is read by SHA; then `placement_unsupported`, and only when
not even an exact workspace exists. Never use shared current, raw
`git worktree add`, `orca repo add` or `new-top-level` as fallback.
Placement/inventory failure emits one typed `REVIEW-START/1 unsupported` and
creates no pair artifacts.

## 6. QC and E2E

Run the project's deterministic QC on the frozen candidate without modifying the
worktree: the executor or orchestrator runs the project's declared QC command in
a clean checkout of exactly that SHA and names the command and its exit code.
Reviewers never run tests, linters or the QC gate; any diagnostic capable of
rewriting tracked files runs only in an isolated disposable copy.

The full gate is host-sensitive. It runs in the foreground to a terminal exit
status, one run at a time per candidate worktree, and never through `nohup`, `&`
or another detached form whose immediate `0` is not a suite result. A repeated
run is independent proof only once the previous run's descendants are gone.

CI is the gate that guarantees QC before an agent merges. G1, the agent-owned
MR/PR create, needs the local QC result and the hosting provider's source head
equal to the candidate. G2, the agent-owned merge, additionally needs
`CI-Coverage/1 covered` for the candidate from the setup contract and an
observed successful run of every covering QC job that checked out exactly the
candidate: the job prints `git rev-parse HEAD` before QC, and that value, the
pull request's head SHA and the observed remote head all equal the candidate. A
workflow run's own head SHA is not enough, because a pull-request run may belong
to a synthetic merge commit; a merge-queue commit is an integration signal of
its own and never stands in for QC of the candidate. Any other coverage outcome,
another checkout SHA, or a missing or failed run blocks the agent merge with
`needs_attention` naming the gap. Review and delivery of a locally proven
candidate proceed without CI; integrating without CI is a human decision.

Read the project's E2E and acceptance-to-proof documents. Run applicable
agent-required scenarios through `mo-e2e`. Production, destructive, credential
or subscription boundaries require the user's explicit authorization for the
exact named action. An unreadable or incomplete gate is `unknown` and is
repeated; there is no partial pass.
<!-- mo:source-anchor §A-EVAL-01 -->

When a named scenario genuinely needs a model actor, deterministic proof remains
preferred. Every applicable case uses all three required selections: Claude
`opus[1m]`/low, which must actually resolve to `claude-opus-5-5[1m]`, Codex
`gpt-6.1-sol/low` and Codex `gpt-6-luna/high`. The two Codex selections share a
route and are still two obligations: a run on one never covers the other. Record
requested and effective identity, and record the alias resolution whenever the
two model strings differ. Desired Codex `gpt-5.6-luna/max` and OpenCode/Qwen
coordinates are materialized as `not_available` when absent and become blocking
if run as `FAIL|UNKNOWN`. A missing required profile is `blocked|not_run`, and a
deterministic scenario is `not_applicable`. Never fall back. These skill tests
do not replace the critical local Qwen/OpenCode orchestrator lifecycle.

Required coordinates are constant except for one named valve: a skill whose own
cases are provably unstable raises **its own** required Codex coordinate one
step to a target the project's evaluation policy names, and only once the
reason, date and instability observation are written there; with no target
named, the valve is closed. The orchestrator skill is never raised, the Claude
coordinate never moves, and one skill's valve never moves the matrix. Until that
record exists, repetition stays at one and the skill text is what changes, never
the profile: an unrecorded raise is profile-shopping for a green result, and the
proof is bound to the profile it ran on.

Any executable or instruction change creates a new SHA and invalidates all
gates. Return failures to the executor as ordinary messages and restart from the
new candidate.

## 7. Completion and cleanup

After the review loop and applicable E2E, the executor harvests durable
knowledge, routes every confirmed out-of-scope item to a canonical
project/upstream Issue, and removes the temporary spec, ledger and checklist. It
then runs GC through the project-owned `MO-BACKLOG/1` command; completion cannot
be announced while the committed exact SHA is `NOT-EMPTY` or `UNKNOWN`. A
project whose knowledge layer is `not_enabled` on that SHA owes no closure proof
at GC, G1 or G2, while G1's and G2's remote head and G2's CI evidence still
bind; the helper is read again on the final SHA, because a change can enable or
break the layer. Repeat deterministic gates on the deletion SHA, and let the hot
pair review it. Only after that pair has returned two PASS reports on one SHA,
release its owned resources and create two fresh independent reviewers with no
prior reports on that same SHA for the final proof. Findings of the fresh pair
are remediated in that pair, which becomes the hot pair; no further fresh pair
starts until it passes. Repeat only E2E that cannot carry forward under
section 8.

Before success, prove that the same full candidate SHA has:

- a clean worktree;
- passing deterministic QC;
- two complete independent review passes with required vendor diversity;
- passing applicable E2E, or a valid documentation-only carry-forward;
- no unresolved problems hidden by an incomplete backend response.

Clean up only sessions and temporary files whose ownership is certain and whose
exact identity was retained, and only after their consumer acknowledged settled
delivery. Before a new pair, inventory the review worktrees this project owns:
one is released only when its Orca comment marker names the worktree Orca shows
now, it shares the source project's Git directory and Orca registration, no live
session or coordinator checkout uses it, and it is clean and nobody's
dependency. Release goes through Orca by exact id, dependent terminals first;
force is forbidden, and so is `git worktree prune`. An unknown binding keeps the
resource with `needs_attention/ownership_unknown`, a dirty own tree is kept and
named, and an unmarked or foreign one does not block the next pair. Human-owned
review namespaces remain until explicitly removed. Ambiguous or incomplete
cleanup is reported rather than broadened destructively.

Immediately before an agent-owned MR/PR create, rerun the same closure proof as
G1 and read the hosting provider's source head; both must equal the expected
SHA. Immediately before an agent-owned merge, repeat G2 — the closure proof, the
remote head and the CI evidence of section 6 for exactly that SHA — and bind the
write to the observed head with a provider compare-and-set/required policy. A
hosting-provided integration candidate is proved only in its exact checkout.
Human-created MRs do not waive G2; server-side CI/protection changes remain a
separate human decision.

The human-readable final report contains the full candidate SHA, QC result, both
review results and model vendors, E2E result and tested SHA, any safe
carry-forward explanation, unresolved problems, and decisions made on the user's
behalf. Do not require JSON or create a persisted run record.

## 8. Documentation-only E2E carry-forward

E2E may carry forward over a later documentation-only commit only when both
final-SHA reviewers explicitly confirm that the change cannot affect executable
behavior, skill or agent instructions, acceptance, or the E2E contract. Name the
tested SHA and explain why its result applies to the final SHA. There is no
projection hash, provenance schema or fixed path allowlist. Any doubt reruns
E2E. QC and both reviews always run on the final SHA.
