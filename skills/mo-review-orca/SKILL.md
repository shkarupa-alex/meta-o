---
name: mo-review-orca
description: Use only when the user explicitly requests mo-review-orca or an active mo-orchestrate-orca calls it; independently review one exact candidate through two vendor-diverse Orca workers.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
---

# Review through Orca

This skill starts only when the user names `mo-review-orca` or the active
orchestration skill calls it. A generic code-review request is not activation.

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

A project without a `MO-BACKLOG/1` command, a papercut document or an
identifier-history gate is reported as `needs_attention` naming the gap.
Preparing the project is the human's own step; this skill never does it and
never starts the setup skill for them.

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

Every reviewer Dispatch names `mo-reviewer` under `Reviewer-Skill` together
with the absolute path of its `SKILL.md` in the installation this skill runs
from — the sibling directory of this skill. Before either Dispatch, read that
file; when it is absent, unreadable from the reviewer's workspace, or not the
same build as this skill, no Dispatch starts and the result is
`needs_attention/skill_unavailable`. Never paste reviewer instructions from a
copy of unknown origin.

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
with no prior reports. That final pair is `deep` as well: `follow_up` needs the
same reviewer's prior report, which a fresh pair does not have, and advisory
`fast` cannot carry a required closure proof.

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

The brief carries all twelve fields of [Review brief](references/review-brief.md)
and no placeholder. Every grounding source it names must be readable from the
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
injected preamble, and carries the literal printed for this Dispatch:

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
`Body-File: <dir>/<dispatch-id>.md`. The reviewer writes the file once through
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
  --candidate <sha> --requested <mode> --prepared <Body-File> \
  --normalization <none|final-newline>
```

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
validation, never a correction.

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

- `mo-reviewer`
