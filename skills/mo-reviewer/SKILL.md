---
name: mo-reviewer
description: Use only when the user explicitly requests mo-reviewer or a reviewer Dispatch of an active mo-review-orca names it; review one exact candidate and send one validated report.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
  source_tree: "1935718a37e7e1efd66840a6a4946b8370f50093"
---

# Review one candidate as a terminal reviewer

Start only when the user names `mo-reviewer` or a reviewer brief from the
active review coordinator names it under `Reviewer-Skill`. A generic request to
review code does not activate it. You are one reviewer of a pair: you never
start the coordinator's review skill, never create another reviewer, worker or
subagent, and never publish anything but your own report. Running this skill's
validator is not starting a review.

Read [Portable review protocol](references/review-protocol.md) and
[Обратная связь о методологии](references/methodology-feedback.md) completely.
The protocol owns the stages, severities and the report grammar; this page says
how one reviewer turns a brief into one report nobody has to buy twice.

## Before reading the change

Take every field of the brief as given: `Target`, `Intent`, `Spec`, `Scope`,
`Mode`, `Placement`, `Environment`, `Constraints`, `Ownership`, `Acceptance`,
`Reviewer-Skill`, `Report`, `Body-File`, `Methodology-Friction`, `Cleanup` and
`Knowledge-Layer`. A missing field or a placeholder such as `<sha>` is a
question to the caller through the backend's ask surface, not something to
reconstruct. The `Knowledge-Layer: state=… reason=…` line decides the deferral
lens: `enabled` requires the project's knowledge gates, `not_enabled` makes
them `not_applicable`, and `needs_attention` or a missing line makes the lens
`unknown` — never assume an ordinary project.

`Review-Execution` is the Dispatch id from the backend's own preamble, copied
verbatim. Prove the checkout in the directory you work in: `git rev-parse HEAD`
equals `Target` and `git status --porcelain` prints nothing on the isolated
rung; on `shared_checkout` read the candidate by SHA and record the reads. A
mismatch is `UNKNOWN` with `candidate_mismatch` or `dirty_candidate`, never a
review of whatever happens to be checked out. The proof goes in `Grounding`,
never into a service line.

## What you read and what you never run

Read the complete diff first, then what it reaches: callers and callees,
related tests and configuration, the instructions and the specification the
brief names. With `Spec: <path|object>` trace each requirement to the code and
report a requirement the change misses; with `Spec: none` a missing
specification is not a finding. Activate only the risk lenses the change
touches — security and external effects, concurrency and state, compatibility
and data, performance and resources, maintainability and test gaps — and apply
the deferral lens the protocol describes.

Read by SHA and never execute the project: no tests, not even a pointed one, no
linter, formatter, type checker or QC gate. The executor or coordinator runs QC
on the exact candidate and CI runs it before an agent merges; a reviewer who
runs the suite as well spends minutes that let every participant's cache expire
and proves nothing new. When a finding needs an executed check to be decided,
write that check as its regression case or record the gap under Unknowns.
Write nothing in the checkout. When the brief says the executor repairs early,
never read its branch, worktree or any moving ref. In `follow_up` mode you
receive only your own prior reports and the dispositions of their findings;
check each fix and its causal neighbours and never ask for the other reviewer's
report.

Each finding survives an attempt to falsify it and is caused or worsened by the
candidate. It states its evidence state, causal path, impact, location, proof,
the invariant that must hold after the fix, technical direction, depth
`local patch|boundary repair|affected-slice redesign`, and a regression case
named as input and state, expected behavior and where the check belongs.

## One report, validated before it leaves

`worker_done` ends the Dispatch: a summary, a pointer or a promise to send more
cannot be repaired afterwards. The brief's `Report` field declares the full
report grammar as the task-specific body, replacing any generic completion
format of the preamble; if the brief does not say so and the preamble demands
something else, ask before sending.

Print the literal for this very Dispatch and fill it in instead of rebuilding
the service lines:

```text
node scripts/mo-review-report.mjs template --verdict <PASS|FINDINGS|UNKNOWN> \
  --dispatch <id> --candidate <sha> --requested <mode> --effective <mode> \
  [--unknown-reason <reason>]
```

The first byte is `Review-Execution:`; the validator's own `MO-REVIEW-REPORT/1`
line never goes into the body. A finding body is either the bare key line with
the next line opening `[P2] …`, or one line `F-001 [P2] …`, both at top level.

With `Body-File: <path>` in the brief, create that file once through the
validator, which checks the bytes before writing and refuses an existing file:

```text
node scripts/mo-review-report.mjs prepare --file <Body-File> --dispatch <id> \
  --candidate <sha> --requested <mode> --effective <mode>  < report
```

A `status=malformed` line names the reason and line; fix the draft and run it
again — nothing was written. `status=refused reason=exists` means the path is
not yours: stop and ask. Then send exactly that file as the body, for example
`--body "$(cat <Body-File>)"`. With `Body-File: none`, pipe the exact bytes you
are about to send into `validate --file - …` with the same flags.

Right before sending, prove the checkout again: `rev-parse HEAD` still equals
`Target` and the tree is still clean.

## Friction and cleanup

A rule that got in the way is one ordinary `Methodology-Friction:` message to
the caller or a line under Residual risks; you write no Issue. Remove only what
`Cleanup` names as yours and report a removal that failed.

## Meta-O calls

- none
