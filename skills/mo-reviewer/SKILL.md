---
name: mo-reviewer
description: Use only when the user explicitly requests mo-reviewer or a reviewer Dispatch of an active mo-review-orca names it; review one exact candidate and send one validated report.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
  source_tree: "518788bfe2fe3f79d44956de8d8ee007ecb8ab32"
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

This skill ships its own scripts in `scripts/` beside this `SKILL.md`. Every
`scripts/<name>` this skill and its references name is that file, never a path
in the project checkout, and it runs from this skill's directory with the full
path in double quotes, which also holds for a path with a space:

```text
node "<this skill's directory>/scripts/mo-review-input.mjs" --help
```

## Before reading the change

Take every field of the brief as given: `Target`, `Intent`, `Spec`,
`Intent-Ledger`, `Scope`, `Mode`, `Round`, `Placement`, `Environment`, `Constraints`,
`Ownership`, `Acceptance`,
`Reviewer-Skill`, `Report`, `Body-File`, `Methodology-Friction`, `Cleanup`,
`Knowledge-Layer`, `Backlog-Gate` and `E2E`. A missing field or a placeholder such as `<sha>` is a
question to the caller through the backend's ask surface, not something to
reconstruct. The `Knowledge-Layer: state=… reason=…` line decides the deferral
lens: `enabled` requires the project's knowledge gates, `not_enabled` makes
them `not_applicable`, and `needs_attention` or a missing line makes the lens
`unknown` — never assume an ordinary project. `Backlog-Gate` is the caller's
own gate result on `Target`: inspect the backlog and registry statically, never
run the gate yourself, and take `not_run` as the caller's evidence rather than
a check you owe. The `E2E` field decides the E2E
lens the protocol describes: with `E2E-Evidence` lines or
`E2E: not_applicable` the lens is required, and with
`E2E: not_evaluated reason=standalone` you raise no `e2e_affected` or
`e2e_missing` and never ask for E2E to be run.

`Review-Execution` is the Dispatch id from the backend's own preamble, copied
verbatim. Prove the checkout in the directory you work in: `git rev-parse HEAD`
equals `Target` and `git status --porcelain` prints nothing on the isolated
rung; on `shared_checkout` read the candidate by SHA and record the reads. A
mismatch is `UNKNOWN` with `candidate_mismatch` or `dirty_candidate`, never a
review of whatever happens to be checked out. The proof goes in `Grounding`,
never into a service line.

## What you read and what you never run

Check the brief's `Spec:` and `Intent-Ledger:` lines before reading either
source; the check compares a copy's sha256 or proves the Git blob, and writes
nothing:

```text
node "<this skill's directory>/scripts/mo-review-input.mjs" check --candidate <Target> \
  --line '<Spec line>' --line '<Intent-Ledger line>'
```

Then read exactly those bytes: the copy the `file` form names,
`git cat-file blob <blob>` for the `git` form, `git show <Target>:<path>` for a
tracked path. A line answering `external_input_missing`,
`external_input_integrity` or `external_input_unavailable` makes the report
`UNKNOWN` with `Unknown-Reason: retrieval_failure` and that line verbatim in
`Unknown-Account`; never review from a truncation, a retelling or memory.

Read the complete diff first, then what it reaches: callers and callees,
related tests and configuration, the instructions and the specification and
intent ledger the brief names. With a specification trace each requirement to
the code and report a requirement the change misses; with `Spec: none` a missing
specification is not a finding. Activate only the risk lenses the change
touches — security and external effects, concurrency and state, compatibility
and data, performance and resources, maintainability and test gaps — and apply
the deferral, anchor and E2E lenses the protocol describes. An `E2E-Evidence` line may
name an ancestor of `Target`: judge whether the range from its scenario SHA to
`Target` touches the behavior its `E2E-Coverage` names, and whether the change
made a scenario applicable that has no line, including one of an unchanged
acceptance row whose requirement the task restores.

Read by SHA and never execute the project: no tests, not even a pointed one, no
linter, formatter, type checker or QC gate. The executor or coordinator runs QC
on the exact candidate and CI runs it before an agent merges; a reviewer who
runs the suite as well spends minutes that let every participant's cache expire
and proves nothing new. When a finding needs an executed check to be decided,
write that check as its regression case or record the gap under Unknowns.
Write nothing in the checkout. When the brief says the executor repairs early,
never read its branch, worktree or any moving ref.

The scope is the whole task range the brief's `Scope` names, `<base>..<Target>`,
in every mode; `Target` is only the upper bound. In `follow_up` mode you
receive only your own prior reports and the dispositions of their findings:
check each fix and its causal neighbours first, and report a defect anywhere in
the task range, changed in this round or not. Never ask for the other
reviewer's report.

Each finding survives an attempt to falsify it and is caused or worsened by the
task range. It states its evidence state, causal path, impact, location, proof,
the invariant that must hold after the fix, technical direction, depth
`local patch|boundary repair|affected-slice redesign`, and a regression case
named as input and state, expected behavior and where the check belongs. For a
class with no finite fix — secret recognition, heuristic parsing — list the
complete set of cases the fix must satisfy, because the fix is judged against
that list. What you saw but do not report — a problem older than `base`, an
external blocker, a known limit of a heuristic — goes under Residual risks; it
is a record for the owner, not work you assign.

## One report, validated before it leaves

`worker_done` ends the Dispatch: a summary, a pointer or a promise to send more
cannot be repaired afterwards. The brief's `Report` field declares the full
report grammar as the task-specific body, replacing any generic completion
format of the preamble; if the brief does not say so and the preamble demands
something else, ask before sending.

Print the literal for this very Dispatch and fill it in instead of rebuilding
the service lines. The brief's
`Round: attempt=<n>/<limit> deep_reads=<m> fragment=<id>` gives four values;
pass them as flags and let the script print the `Round` line — never copy the
line into the body by hand:

```text
node "<this skill's directory>/scripts/mo-review-report.mjs" template \
  --verdict <PASS|FINDINGS|UNKNOWN> \
  --dispatch <id> --candidate <sha> --requested <mode> --effective <mode> \
  --attempt <n> --attempt-limit <limit> --deep-reads <m> --fragment <fragment-id> \
  [--unknown-reason <reason>]
```

The first byte is `Review-Execution:`; the validator's own `MO-REVIEW-REPORT/1`
line never goes into the body. A finding body is either the bare key line with
the next line opening `[P2] …`, or one line `F-001 [P2] …`, both at top level.

With `Body-File: <path>` in the brief, create that file once through the
validator, which checks the bytes before writing and refuses an existing file.
`Body-File` is the only file you write: the report goes to the validator on
stdin through a here-document, never through a draft file beside it. Set the
eight variables from the brief and Orca's preamble first, each value in single
quotes; the delimiter in single quotes keeps `$`, backticks and `\` in the
report exactly as written, and the script path stays in double quotes, which
also holds for a directory with a space. Add `--effective "$EFFECTIVE"` when the
brief names the effective mode:

```bash
node "<this skill's directory>/scripts/mo-review-report.mjs" prepare --file "$BODY_FILE" \
  --dispatch "$DISPATCH_ID" --candidate "$CANDIDATE_SHA" --requested "$MODE" \
  --attempt "$N" --attempt-limit "$LIMIT" --deep-reads "$M" --fragment "$FRAGMENT" <<'MO_REPORT'
…the complete report…
MO_REPORT
```

A `status=malformed` line names the reason and line; fix the draft and run it
again — nothing was written. `status=refused reason=exists` means the path is
not yours: stop and ask. Then send exactly that file as the body, for example
`--body "$(cat <Body-File>)"`. With `Body-File: none`, run the same command as
`validate --file -` instead of `prepare --file "$BODY_FILE"`, on the exact bytes
you are about to send.

Right before sending, prove the checkout again: `rev-parse HEAD` still equals
`Target` and the tree is still clean.

## Friction and cleanup

A rule that got in the way is one ordinary `Methodology-Friction:` message to
the caller or a line under Residual risks; you write no Issue. Remove only what
`Cleanup` names as yours and report a removal that failed.

## Meta-O calls

- none
