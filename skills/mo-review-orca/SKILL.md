---
name: mo-review-orca
description: Use only when the user explicitly requests mo-review-orca or an active mo-orchestrate-orca calls it; independently review one exact candidate through two vendor-diverse Orca workers.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
  source_tree: "f481fd22ee428d61de2ca284eaadc94394156b14"
---

# Review through Orca

This skill starts only when the user names `mo-review-orca` or the active
orchestration skill calls it. A generic code-review request is not activation.
Such a request also has no opaque `Review-Execution` id, which only an Orca
Dispatch issues, so say that the portable report header cannot be produced for
it rather than invent one.

Read [Portable review protocol](references/review-protocol.md),
[Обратная связь о методологии](references/methodology-feedback.md),
[Маршрутизация подтверждённой внешней работы](references/issue-routing.md),
[Review brief](references/review-brief.md),
[Backend contract](references/backend-contract.md),
[Orca native mechanics](references/orca-mechanics.md), and
[Purpose and architecture contract](references/purpose-and-architecture.md)
completely. From the same resolved Orca binary also read the version-matched
`orchestration` and `orca-cli` bundled guides; never install guide copies.

Accept only an exact 40-hex `candidate_sha`, intent source, scope, mode, the
specification line and two user-approved vendor-diverse selections from bundled
`scripts/mo-models.mjs --show --project <root>`. Never choose fallback model,
effort, placement or posture flags. The caller passes `Spec: <path|object>`
when the work followed a specification and `Spec: none` otherwise, and both
reviewers receive the same line; an executor running this review on its own
work is such a caller too, because only it knows which specification it
followed.

Those two selections form the vendor-diverse pair; neither may be substituted.

When the caller is the executor itself and no orchestrator stands behind it,
recommend to that caller once, before the pair starts, a cleanroom self-review:
a fresh subagent that receives only the specification, the diff and the
candidate SHA, fixes checked by the same hot subagent. An executor running this
skill on its own work is that caller, so the recommendation is one line of its
message to the human before the pair; a self-review it already completed
satisfies the recommendation, and the line names that result instead of
repeating the advice. The recommendation never blocks the pair. Record the caller's own statement as
`self_review=<pass|not_done|unavailable>` in the report to the human; a caller
that says nothing is `not_done`, and the value is the caller's claim, not proof.

Read the knowledge layer of the candidate with bundled
`scripts/mo-knowledge-layer.mjs --candidate <sha>` and put its exact output
line into both briefs; a brief without it makes the reviewer's deferral lens
`unknown`. `not_enabled` is an answer, not a gap. `needs_attention` — a missing
`MO-BACKLOG/1` command, papercut document or identifier-history gate in a
project that had or half-declared them — is reported as `needs_attention` with
the helper's reason, and no pair starts. Preparing the project is the human's
own step; this skill never does it and never starts the setup skill for them.

## Pre-pair placement

Before pair artifacts, read `ProjectRegistrationSet/1` from project/repository
inventory and `OwnedResourceSet/1` from worktree, terminal and worker surfaces.
Placement is a ladder, and the first rung is the default rather than one
option among equals:

1. `isolated` — two proven clean isolated worktrees of the current project, or
   attributed Orca `new-child` worktrees of a Git project, each standing at the
   exact SHA.
2. `shared_checkout` — both reviewers start in the exact existing workspace
   (`--worktree id:<repo>::<path>`); creation flags are rejected there.
3. `REVIEW-START … reason=placement_unsupported` — only when not even an exact
   existing workspace is there.

On the isolated rung the workspace stands on the candidate before the brief is
sent: `rev-parse HEAD` equals the exact SHA and the tree is clean. Asked for a
final verdict from a workspace parked on some other commit, a reviewer answers
`UNKNOWN` with `candidate_mismatch` and is right to; the round is then spent
proving what one checkout would have settled. A shared checkout is the case
where the reviewer may not move `HEAD`, so there the brief says the candidate is
read by SHA and says why.

Raw `git worktree add`, `orca repo add`, `new-top-level` and unproven remote
placement stay forbidden on every rung. `orca worktree create` on a folder
project can answer `ok:true` with the main checkout's own path and an empty
`head`; placement is accepted from realpath, `isMainWorktree`, `head` and
`rev-parse HEAD`, never from the return code.

In `shared_checkout` the shared working checkout does not change: HEAD, the
index, and tracked and untracked files are byte-for-byte the same after the
pair. `checkout`, `switch`, `stash`, `reset`, `clean`, `commit`, `rebase`, file
edits, formatters and fixers, environment installation and scratch files are all
forbidden there. Changes to the shared **repository** are enumerated and undone:
`git cat-file -e <sha>^{commit}` first, `git fetch --no-write-fetch-head
--no-tags <remote-url> <exact ref or sha>` only when the object is absent
locally, a slot-owned ref `refs/meta-o/review/<slot>/<sha>` deleted with
`git update-ref -d`, and `git worktree add --detach <slot path outside the
working copy> <sha>` removed with exactly `git worktree remove <own path>`.
Nothing else: no `gc`, no `repack`, no `config`, no deleting a ref that is not
the slot's own.

`git worktree prune` is forbidden. It is a repository-level operation: it drops
the administrative record of every worktree whose path is currently
unreachable, including other people's and temporarily unmounted ones. A
reviewer owns one record and removes that one. When `worktree remove` fails the
record stays, the fact goes into the report, and the owner gets
`needs_attention` with the exact command.

How the candidate is read is the reviewer's choice, and the way that writes
nothing is preferred: `git show <sha>:<path>`, `git diff <base>..<sha>`,
`git grep … <sha>`. `Grounding` lists the SHA-bound commands actually used, and
its own checkout path with `rev-parse HEAD` when it made one. A conclusion
drawn from working-copy files with no SHA binding makes the verdict `UNKNOWN`.
The shared checkout may be dirty and may sit on another commit; that is not an
obstacle, because the mode means "the starting directory is shared, the
candidate is read by SHA", and the tree state at start is recorded as an
observation.

The caller snapshots the baseline before and after the pair:

```text
git rev-parse HEAD
git status --porcelain=v1 -z --untracked-files=all --ignored
git worktree list --porcelain -z
git for-each-ref --format='%(refname) %(objectname)' refs/meta-o/
```

A change attributable to a reviewer slot that is still there makes the pair
`UNKNOWN`; an unremoved linked worktree additionally returns `needs_attention`
with the cleanup command. A worktree record that belonged to nobody's slot and
disappeared between snapshots means somebody ran `prune`, and that goes into
`Grounding` and into the report. A change that touches neither slot nor
candidate is somebody working in parallel: it is recorded as an observation and
never undone. The public projection carries `Placement: isolated|shared_checkout`
and no new `REVIEW-START` code.

Before a new pair, inventory the review worktrees this project owns and let
bundled `scripts/mo-review-resource.mjs release` decide each one from facts read
through Orca: the `worktree show` id and comment, the Git common directory
against the source project's, both read with
`git rev-parse --path-format=absolute --git-common-dir` because the main
checkout otherwise answers a relative path that matches nothing, the project's
Orca registration, the terminal and provider session bindings proven through `terminal show/list` and
`worker show/status`, whether a live session or the coordinator's or
executor's checkout uses it, a clean tree, and whether another live resource
depends on it. The facts go to its stdin as one JSON object, each boolean
observed and never assumed; `scripts/mo-review-resource.mjs --help` prints this
and every other command's inputs:

```json
{"comment": "<worktree comment>", "worktreeId": "<orca worktree id>",
 "project": "<project id>", "sameGitDir": true, "projectRegistered": true,
 "bindingsProven": true, "liveSession": false, "coordinatorCheckout": false,
 "clean": true, "dependency": false, "head": "<sha>", "nextCandidate": "<sha>"}
```

It answers one line:

```text
MO-REVIEW-RESOURCE/1 action=<release|reuse|keep|check_hot> reason=<code> worktree="<id>"
```

`release` goes through Orca by exact id: the proven dependent terminals first,
then the worktree; force is forbidden, and so is `git worktree prune`. `reuse` is a clean
own tree already at the exact candidate. `check_hot` is a marked live session:
test it as a slot and otherwise leave it. `keep` with `dirty` is named in the
report, with `ownership_unknown` returns `needs_attention/ownership_unknown`,
and with `foreign` or `marker_mismatch` blocks nothing. A name or a short SHA
never stands in for a marker.

Each slot's worktree is marked right after `orca worktree create` or `show`
returns its exact id, with one `worktree set --comment` holding the two lines
`mo-review-resource.mjs comment --pair <id> --slot A|B --candidate <sha>
--project <id> --worktree <orca worktree id> --feature <name>` prints: the
`MO-REVIEW-RESOURCE/1 pair=… slot=… candidate=… project=… worktree=…` marker a
restarted coordinator matches, and `<feature> review slot A|B @ <short sha>`
for a human. `--workspace-status in-review` stays the human-readable status.
After start, tell the human in one line the candidate's Orca project, both
worktree names and both tab titles, and say so separately when the candidate's
project is not the coordinator's own. Never pass `--activate`, and never move
focus without need.

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

Every reviewer Dispatch names `mo-reviewer` under `Reviewer-Skill` together with
the absolute path of its `SKILL.md` in the installation this skill runs from —
the sibling directory of this skill — and the installed version, as
`mo-reviewer <path> source_tree=<40-hex>` followed by
`skill=<id> protocol=<id> validator=<id>`. `source_tree` is that file's build
stamp; it names authored inputs only, not the bundled third-party bytes, and
survives a local edit. So immediately before the Dispatch, take
`git hash-object` of the installed `SKILL.md`, `references/review-protocol.md`
and `scripts/mo-review-report.mjs`: those three ids are the bytes that judge the
report. The round report repeats the whole value next to
`prepared_body_identity`. Before either Dispatch, read that file; when it is
absent, unreadable from the reviewer's workspace, carries no stamp, lacks one of
the three files, or is not the same build as this skill, no Dispatch starts and
the result is `needs_attention/skill_unavailable`. Same build means that its
`protocol` and `validator` ids equal `git hash-object` of this skill's own
`references/review-protocol.md` and `scripts/mo-review-report.mjs`: one build
ships those two files byte for byte in both skills. The two `source_tree`
stamps are not compared, because each hashes its own skill's inputs and they
differ by design. Never paste reviewer
instructions from a copy of unknown origin. The recorded value is not proved
against Meta-O history: an installation does not know its source commit, and the
project under review usually has no Meta-O history at all.

Start each Claude or Codex reviewer on Orca 1.4.217 or later with:

```text
orca orchestration worker-start --task <id> --worktree id:<repo>::<path> \
  --agent <claude|codex> --model <id> --effort <e> --json
```

Orca injects the task only once the harness shows its normal agent prompt, and
its receipt must show `launch.requested` equal to `launch.effective` and
`turnStart: observed`. Record the Dispatch and the
terminal of `effects[kind=terminal].id` at once. A harness whose model
`worker-start` cannot pass starts terminal-first by the recipe in
[Orca native mechanics](references/orca-mechanics.md). The user's setting for
new agent tabs owns unsandboxed posture; never duplicate its flags.

The first lifecycle pair uses `deep`. A Dispatch, the provider session, its PTY
and its worktree are four resources, and `worker_done` spends only the Dispatch:
after FINDINGS neither reviewer is released or closed until both dispositions
settle, and remediation goes to the same pair as `follow_up` with only that
reviewer's own prior reports and dispositions. Every brief, `follow_up`
included, scopes the whole task range `<base>..<candidate>`: `base` is where
the task branch starts, or the start the caller names when there is no branch.
Before each such Dispatch decide every slot separately with
`scripts/mo-review-resource.mjs hot`:

```text
hot(slot) = alive_and_ready(slot) AND (age < 1h OR context_proven_small(slot))
scripts/mo-review-resource.mjs hot --alive yes|no --ready yes|no --composer empty|other \
  [--age-ms <n>] [--context-tokens <n> | --context-percent <n> --context-window <n>]
```

`age` runs from the slot's last `worker_done` by Dispatch events;
`alive_and_ready` is the same provider session proven alive, ready and with an
empty composer. Pass `--context-tokens` only for a fully parsed absolute count,
and `--context-percent` only together with `--context-window` from that same
public surface or the approved model catalogue; anything else is
`context=unknown`, and age alone decides. A slot that is not hot is replaced by
a new session of the same model in that slot with `follow_up`, its own reports
and dispositions — not a new deep pair and not the final pair — while a hot
slot beside it stays. `--alive yes` means the slot's own recorded terminal
still runs its harness: `terminal show` reports it running and its screen is
the harness's prompt. Orca's worker liveness `unverifiable` on an idle session
is missing evidence, not death, and never answers `--alive no` by itself; a
terminal that is gone or shows a shell does. Readiness and an empty composer come from
`scripts/mo-harness-screen.mjs` answering `action=inject`, and its
`context=`/`context_window=` fields are what the context flags take. A refused
screen on an idle session is `session_unavailable` recorded with that line: that
slot returns `needs_attention`, its composer text is left as it is, nothing else
is closed, and it is never by itself a reason for a new deep pair.

A Codex start that fails with `agent-trust-workspace` stays inside the
supported harness: release the failed Dispatch by its exact id, prove trust by
the trust procedure, and start the normal supervised harness again. A Claude start that times out
at `agent_readiness` on Claude's folder-trust dialog is recovered the same way:
answer the dialog in that start's own terminal by the trust procedure, release
the failed Dispatch and start again with `--retry-of`. A terminal running
`codex exec` is never a reviewer.

A new independent deep pair while this pair has no PASS needs a recorded reason
that `scripts/mo-review-resource.mjs deep --phase remediation --reason <r>`
accepts: `state_transfer_impossible`, `hypothesis_stuck`,
`requirements_conflict` or `owner_request`. Each round's report names
`attempt <n>/5` and `deep_reads <m>`: a hot `follow_up`, a slot replacement, a
deep pair and the final fresh pair with its `follow_up` each spend one attempt
of the substantive slice, a new SHA does not reset the count, and fresh pairs
are the costly full rereads.

`fast` is explicitly standalone/advisory, and the portable protocol may
escalate it to `deep`. Only after this pair returned two PASS reports on one
SHA, release its exact-owned resources and create a fresh independent pair on
that same SHA in fresh independent sessions with no prior reports. That final
pair is `deep` as well: `follow_up` needs the same reviewer's prior report,
which a fresh pair does not have, and advisory `fast` cannot carry a required
closure proof. Findings of the fresh pair are remediated in that pair, which
becomes the hot pair; no further fresh pair starts until it passes.

Wait through one run-wide public waiter on both exact Dispatch handles. Use
300000 ms arms for reviewers; a quiet timeout permits one public liveness
snapshot and immediate re-arm without narration or messages. Retry the same arm
once after transport failure; a second consecutive failure is
`UNKNOWN/needs_attention`. Process every event in a returned batch before
acknowledgement.

`worker-release` closes the terminal of a reviewer `worker-start --agent`
started. A terminal this skill created itself answers `retained`; close exactly
the handle recorded for it in `OwnedResourceSet/1`, then re-read the resource
projection. If that handle is absent, close nothing and return
`needs_attention`.

Wait for both full reports before disposition or handoff.

The brief carries every field of [Review brief](references/review-brief.md) and
no placeholder. Every grounding source it names must be readable from the
candidate itself: a path under `.orca/` is in no checkout the reviewer can
obtain, and the accepted specification is tracked under `docs/specifications/`
until closure removes it. On a post-cleanup candidate the brief grounds the pair
in the durable knowledge and cites the removed specification by its frozen
object id together with the commit whose tree still holds it, which a full
clone or worktree resolves with `git cat-file` and a shallow one does not. A reviewer that cannot
reach a cited source either spends a turn asking or reasons from an invented
section, and a verdict grounded in an invented section cannot be told apart from
a real one.

## Authoritative response

Each reviewer proves full SHA and clean status, performs non-mutating review and
places its entire report in authoritative `worker_done`. Say so in the task
bytes, because `worker_done` is what completes the Dispatch: a body holding a
summary, a pointer to the terminal or a promise to send more cannot be repaired
afterwards, and that reviewer is spent. The brief's `Report` field declares the
report grammar of [Portable review protocol](references/review-protocol.md) as
the task-specific body that replaces the generic completion format of Orca's
injected preamble, and carries this command with every value the caller holds.
The Dispatch id does not exist when the task is written and reaches only the
reviewer, in Orca's preamble, so `--dispatch` is the one argument the brief
says to take from there:

```text
scripts/mo-review-report.mjs template --verdict <PASS|FINDINGS|UNKNOWN> \
  --dispatch <id> --candidate <sha> --requested <mode> --effective <mode> \
  [--unknown-reason <reason>]
```

The first body line is the bare `Review-Execution: <id>`; `MO-REVIEW-REPORT/1`
is the validator's output and never part of a body. Service lines may be
separated by one empty line, never two. A finding body is either the bare key
line followed by a line opening `[P2] …`, or one line `F-001 [P2] …`.

Reviewers read and never execute the project: the brief forbids tests, linters
and the QC gate, and allows only SHA-bound reading and their own report
validator. QC of the candidate is the executor's or coordinator's run on a clean
checkout of that exact SHA, and CI's run before an agent merges; a reviewer
running the suite too only spends the time in which every cache expires.

Before the pair, create one run directory outside every worktree with
`scripts/mo-review-report.mjs namespace` and give each reviewer
`Body-File: <dir>/slot-<a|b>-r<round>-d<n>.md`, a name built before the brief is
sent; `<n>` counts that slot's Dispatches in the round, so a repeat Dispatch never
meets the earlier body, and the Dispatch id reaches only the reviewer and stays
in the body as `Review-Execution`. The reviewer writes the file once through
`prepare`, which validates the bytes first and refuses an existing file, and
sends exactly that content. Where Orca runs the reviewer on another host, the
brief says `Body-File: none` and the reviewer validates the same bytes on stdin.

Every finding states `confirmed|strongly_supported` evidence, causal path,
impact, actionable location, proof, post-fix invariant, technical direction,
depth `local patch|boundary repair|affected-slice redesign` and an acceptance
proof named as concrete cases: input and state, expected behavior and where the
check belongs, precise enough to write without a second question to a reviewer
who may no longer exist.

Only the body the coordinator received from Orca is authoritative, and only
after its own validation against caller-owned expected values: exact candidate,
native Dispatch id, requested mode and observed effective mode. A stale but
self-consistent header/footer is `UNKNOWN`. Run the bundled validator rather
than judging the shape by eye, and compare with the prepared file in the same
call:

```text
scripts/mo-review-report.mjs validate --file <received> --dispatch <id> \
  --candidate <sha> --requested <mode> --effective <mode> \
  --prepared <Body-File> --normalization <none|final-newline>
```

`--effective` is the mode this round needs: `deep` for a `deep` request,
including every fresh and final pair, and for a `fast` or `follow_up` request
either the requested mode or `deep` after the reviewer's own escalation. The
validator refuses a downgrade by itself, so `requested=deep effective=fast` is
`mode_mismatch` whatever the caller passes.

`status=malformed reason=<code> line=<n>` is a malformed report and exit 2 is a
call error. Structure and identity are two claims, reported separately: the
`MO-REVIEW-BODY/1 prepared_body_identity=` line is `identical`, `different` or
`unverified`. The normalization is the one the Orca compatibility probe recorded
for the observed version — a body sent as `--body "$(cat <file>)"` loses its
final line feed, which is `final-newline` — and anything else is none. A
`different` body is `UNKNOWN/body_integrity`; an unreadable or absent file is
`prepared_body_identity=unverified`, and the received body is then accepted on
its structure alone unless the brief required the proof, in which case that
Dispatch is `UNKNOWN/body_integrity_unverified`. Screen text never stands in for
either claim, and the body file is deleted when the slot is released.

`worker_done` ends a Dispatch, so a structurally wrong body is `UNKNOWN` with
`malformed_report` for that Dispatch and is never corrected in its name. A
further Dispatch on the same candidate is a new review with its own id and full
validation, never a correction. The session outlived the Dispatch: when the
same provider session is proven alive and ready, send that one new Dispatch to
it in the same round, without closing its terminal and without spending an
attempt; a second malformed body from that slot in the round makes the round
`UNKNOWN`. A terminal is closed only for a named phase or owner reason.

## Lossless handoff and projection

After both valid reports, publish them with the bundled script rather than by
hand:

```text
scripts/mo-review-report.mjs namespace
scripts/mo-review-report.mjs stage --dir <ns> --slot <A|B> --vendor <slug> <validate flags>   < report bytes
scripts/mo-review-report.mjs pair --dir <ns> --a-vendor … --a-bytes … --a-dev … --a-ino … --a-sha256 … --b-…
```

The namespace is mode `0700` under system temp with at least eighteen random
characters in its name. Slots A/B are assigned before launch and vendor slugs
match `^[a-z0-9][a-z0-9-]{0,31}$`. Each payload is validated as the exact buffer
that gets written, goes to a regular `0600` sibling, is fsynced, and is
published create-if-absent by hard-linking that complete sibling into the
slot — never by an overwrite-capable rename. `final_exists`, `link_unsupported`, `permission`,
`identity_changed`, `symlink`, `malformed` and `invalid_utf8` are each
`UNKNOWN` and leave the existing final path untouched. Send the
named consumer one ordinary message with `pair_id`, both exact paths and decimal
sizes. A machine consumer acknowledges only after reading both:

```text
Review-Handoff-Ack: <pair_id> A=<decimal-bytes> B=<decimal-bytes>
```

One absent/mismatched acknowledgement permits one re-delivery of the same paths;
the next failure makes the pair `UNKNOWN` and preserves the namespace. Check an
acknowledgement with `scripts/mo-review-report.mjs ack --kind Handoff --line
<text> --pair-id <id> --a-bytes <n> --b-bytes <n>` rather than by eye.

Early repair is the one exception to waiting for both reports, and only when
the owner approved it and every property is proven: the executor works in its
own worktree; each reviewer has its own tree detached at the old full SHA; the
brief forbids reading the executor's mutable refs; HEAD and a clean tree are
rechecked right before `worker_done`. Then stage the first complete valid
FINDINGS body in its slot and hand it over unchanged with
`scripts/mo-review-report.mjs preview --dir <ns> --slot <A|B> --<a|b>-…`; the
executor replies `Review-Preview-Ack: <pair_id> <slot>=<bytes>`, checked with
`ack --kind Preview`. A preview is not a pair verdict: the other reviewer
continues on the old SHA, the pair handoff above still follows its report
before the next candidate, and every one of its findings gets a disposition
checked against the new candidate. With any property unproven, wait for both
reports.
Human-caller review reports both paths/sizes and never auto-cleans them; a
review an executor called on its own also reports its
`self_review=<pass|not_done|unavailable>`.

Publicly show exact SHA, pair verdict and component-wise sum of authored P0–P3
counts. Duplicate findings count twice. Do not expose index/content, deduplicate,
rank or paraphrase. P0–P2 block; deliver every P3 for fix or reasoned rejection
without a P3-only round. One substantive slice permits no more than
five paired review/fix attempts and still requires two fresh independent `PASS` reports on
one final SHA.

Never use `/goal`, edit/commit, run QC as a reviewer, close foreign tabs or
retry `unknown_effect`. Report E2E as not evaluated unless separately requested.

## Meta-O calls

- `mo-reviewer`
