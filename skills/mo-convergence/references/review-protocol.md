# Portable review protocol

This document owns evidence-first review semantics. It is portable: backend
session mechanics, reviewer counts, feature lifecycle and report destination
belong to its caller.

## Input and modes

Ground every review in the original intent, accepted specification, repository
instructions, exact full candidate SHA, claimed scope and requested mode.

The scope is the task, not the last commit: the range `<base>..<candidate>`.
`base` is where the task starts — the point its own branch left the branch it
came from, or the start the caller names when the work has no branch of its own.
The candidate SHA is only the upper bound, the state being judged. Every mode
reviews that whole range.

When the work follows a specification, the brief names it in one line,
`Spec: <form>`, and the user's verbatim intent ledger in another,
`Intent-Ledger: <form>`, and the review checks the requirements against the
code. Each line takes exactly one of four forms: a path tracked in the
candidate's tree; `git <commit>:<path> blob=<40-hex>` for a file closure already
deleted, held by the tree of the named commit;
`file <absolute path> sha256=<64-hex>` for a copy the caller placed in the
reviewer's own slot directory; or `none`. Work without one carries `Spec: none`;
its absence is then not a finding. The caller that starts the review — an
orchestrator, or an executor that runs a standalone review of its own work —
passes both lines, because only the caller knows which specification the work
followed.

Check both lines before reading either source, with the shipped
`mo-review-input.mjs check --candidate <sha> --line '<Spec line>' --line '<Intent-Ledger line>'`
and the brief's own `Body-File` as `--body-file '<Body-File>'`. It compares a
copy's sha256 with the line, accepting a copy only in that file's directory, or
proves that `git rev-parse <commit>:<path>` equals the blob, and writes nothing.
Then read exactly those bytes — the copy, `git cat-file blob <blob>` or
`git show <candidate>:<path>` — and never a truncation or a retelling. A line
answering `external_input_missing` (no such file or path),
`external_input_integrity` (the sha256 or blob differs, or the copy lies in
another slot's directory) or `external_input_unavailable` (the slot directory is
not visible from this placement, or a shallow or partial clone lacks the commit,
a tree or the object) makes the review `UNKNOWN` with
`Unknown-Reason: retrieval_failure`, and its `Unknown-Account` carries that line
verbatim.

- `fast` is for bounded low-risk work. Read the complete diff, directly
  reachable callers and callees, related tests/configuration and repository
  instructions.
- `deep` is for a first review or broad/high-risk work. Also inspect schemas,
  relevant history and optional prior-change context when available.
- `follow_up` requires the previous candidate SHA, this reviewer's own complete
  prior report, dispositions of that reviewer's findings and a computable delta.
  Peer reports or reasoning are forbidden. The delta and the prior report say
  where to look first and what was already read; they do not narrow the scope,
  and a defect found in an unchanged part of the task range is a finding.

Modes are coverage profiles, not evidence standards. Escalate `fast` or
`follow_up` to effective `deep` in the same execution for trust/auth,
concurrency, schema/transaction/migration, compatibility, destructive effects,
resource ownership or another broad semantic delta. Missing grounding yields
`UNKNOWN`, never a shortened `PASS`, and its `Unknown-Account` names each
missing input, for `follow_up` which of the four above is absent, so the caller
supplies exactly those. Report requested and effective mode.

## Ordered algorithm

Perform and retain evidence for these stages in order:

1. Grounding — establish intent, instructions, candidate identity and scope.
2. Change discovery — read the diff before constructing the initial risk map;
   identify changed artifacts, reachable implementation, tests/configuration and
   relevant history.
3. Risk mapping — activate only applicable security/effects, concurrency/state,
   compatibility/data, performance/resources and maintainability/test-gap
   lenses. Expand the map when evidence requires it.
4. Candidate discovery — trace requirements and activated risk surfaces without
   manufacturing findings to fill categories.
5. Candidate verification — try to falsify each candidate with a test, trace,
   contract, guard, caller, configuration or language/framework semantics.
   Classify it as `confirmed`, `strongly_supported`, `unproven` or `refuted`.
6. Causality — a finding must be caused or materially worsened by the task
   range. Mark a blocker that predates `base`, lies outside the task or waits on
   an external owner only as residual risk.
7. Severity — assign impact only after evidence and causality.
8. Reporting — publish `confirmed` and `strongly_supported`; keep `unproven` in
   Unknowns and omit `refuted`. Zero findings is a valid `PASS`.

## Severity

- `P0` — a reachable emergency: active exploitation, occurring or inevitable
  data loss/corruption, broad outage or an immediate prohibition on operation.
- `P1` — a serious correctness, security, availability, data or compatibility
  failure with realistic prerequisites and high impact.
- `P2` — a material bounded failure, regression or maintainability/test gap that
  should be fixed before acceptance.
- `P3` — a real low-impact defect or bounded improvement whose evidence is still
  strong enough to act on.

Severity is textual and separate from confidence. Do not emit numeric
confidence, machine counters or adjudication grammar. Comments in production
code must cite durable business/architecture contracts, never finding ids.

## Anchor lens

Code, tests and comments cite only live anchors: an identifier the candidate's
business document or architecture directory defines, or a section of a document
the candidate tracks as canonical. A citation of a section of the temporary
specification, or of a decision the specification introduced but the change
never moved into the architecture directory, is a finding: the specification is
removed at completion, and the citation then explains nothing. The project's
reference check catches a dangling identifier or section number; a decision that
lives only in the specification is what this lens finds.

## Deferral lens

An empty backlog is valid and is required at lifecycle closure. Inspect the
change and behavior for postponed, deliberately omitted, blocked or knowingly
unfixed work. A temporary notebook entry needs reason, practical impact and next
step; confirmed out-of-scope work belongs in a correctly routed project/upstream
Issue. An unresolved disposition is `needs_attention`, not permission to leave
closure non-empty. Do not manufacture an entry to fill a category.

The brief's `Knowledge-Layer: state=… reason=…` line decides how this lens
applies. With `enabled`, the project's knowledge gates hold. With `not_enabled`,
the project never adopted the knowledge layer or switched it off, and the
backlog-closure part of this lens is `not_applicable`; postponed work still
needs a routed Issue or a stated residual risk. With `needs_attention`, or with
no such line in the brief, the lens is `unknown`: never assume an ordinary
project.

Running the backlog gates belongs to the caller; judging what they guard belongs
to the reviewer. The brief's
`Backlog-Gate: <G0|GC|G1|G2> <EMPTY|NOT-EMPTY|UNKNOWN|not_run>` line is the
caller's own result on the candidate. Inspect the committed backlog and the
registry by SHA and judge them; never run the gate, QC, a test or a linter to
confirm or fill the line. `not_run` is the caller's evidence that it ran no gate
on this SHA, never a duty the reviewer missed: record it in Grounding as given.
On a `GC`, `G1` or `G2` candidate a committed backlog that still holds an entry
is a finding whatever the line says, and a brief without the line is missing
grounding like any other field.

A project with no backlog-closure checker at all, while its knowledge layer is
not `not_enabled`, is a different answer: the absence is a readiness gap
reported as `needs_attention`, and no review prepares the project or writes the
missing checker in passing.

## E2E lens

The caller sets the E2E mode in the brief, in exactly one of three forms:

- `E2E-Evidence` and `E2E-Coverage` lines, one pair per scenario — the
  orchestrated lifecycle;
- `E2E: not_applicable reason=no_task_scenarios sha=<40-hex> source=<dispatch-id> basis=<…>`
  — the project has scenarios and `mo-e2e` selected none for the task, or
  `E2E: not_applicable reason=<…>` — the project has no E2E scenarios;
- `E2E: not_evaluated reason=standalone` — a standalone review with no separate
  E2E request.

With `not_evaluated` this lens is off: never raise `e2e_affected` or
`e2e_missing`, and never ask for E2E to be run. A brief with no E2E form, or
with more than one, is missing grounding.

In the other two forms the lens is required. An `E2E-Evidence` line names the
SHA its scenario passed on, which may be an ancestor of the candidate. For each
line ask whether the range `<scenario sha>..<candidate>` touches the behavior
its `E2E-Coverage` line names. Overlapping paths are a hint, not a verdict: the
question is whether the covered behavior can now behave differently. Then ask
whether the candidate made a scenario applicable that has no line — including a
scenario of an unchanged acceptance row whose behavior the task touches,
restores or depends on, as when a regression fix restores an existing
requirement without changing its row — and whether an earlier `not_applicable`
still holds. A `reason=no_task_scenarios` line is checked like an evidence line
whose coverage is empty: if the task or the range `<its sha>..<candidate>`
touches, restores or depends on behavior a scenario covers, that scenario is
missing; a project-wide `not_applicable` no longer holds once the candidate
defines scenarios.

Two findings answer these questions. Each is an ordinary finding with a severity
whose text opens with its class literal, as in `F-001 [P2] e2e_affected: …`:

- `e2e_affected` names the change, the covered behavior it touches, the causal
  link and every scenario to rerun;
- `e2e_missing` names the scenario and the basis on which it applies.

A path overlap with no causal link is not a finding. A line whose result is
`fail` or `unknown` means the E2E loop has not converged: the review is
`UNKNOWN` with `Unknown-Reason: review_incomplete`, and its `Unknown-Account`
names that line. A line with `result=blocked:external_capability` or
`result=not_run` is an external block the caller already reported: the scenario
is known and unproven, not missing. Raise no `e2e_missing` for it, review the
rest as usual, and name it under Residual risks; it never counts as a pass.

## Diagnostics

A reviewer reads; it does not execute the project. Tests, linters, formatters,
type checkers and the project's QC gate are not run by a reviewer, not even a
pointed test: on many projects the suite is thousands of cases or something
heavy, a review that waits for it lets every participant's prompt cache expire,
and the result says nothing the executor's and CI's run of the same SHA did not.
QC of the exact candidate belongs to the executor or coordinator, in a clean
checkout of that SHA, and to CI before an agent merges.

What stays allowed is read-only inspection bound to the candidate SHA —
`git show`, `git diff`, `git grep`, `git log`, reading files of the candidate
checkout — and two shipped helpers: the input check, run on the brief's own
`Spec:` and `Intent-Ledger:` lines, and the report validator, run on the
reviewer's own report. `Scope and checks` lists the commands actually used. A
reviewer that needs an executed check to decide a finding states the check it
would need as the finding's regression case, or records the gap in Unknowns; it
does not run it.

## Report

Return one complete textual report. Its first line — the first byte of the body
— is `Review-Execution:` followed by one space and the bare Dispatch id, nothing
after it. The validator's own output line `MO-REVIEW-REPORT/1 …` is never part
of a body. The seven service lines come in this order, with at most one empty
line between two of them and nothing else:

```text
Review-Execution: <opaque dispatch id>
Candidate: <40-hex SHA>
Mode: requested=<fast|deep|follow_up> effective=<fast|deep|follow_up>
Round: attempt=<n>/<limit> deep_reads=<m> fragment=<fragment-id>
Delegation: none
Verdict: <PASS|FINDINGS|UNKNOWN>
Counts: P0=<n> P1=<n> P2=<n> P3=<n>
```

After `Counts` stand at most one empty line, then the keyed index — only
top-level `F-001 [P2] <one sentence>` entries, at most one empty line between
two of them — then at most one empty line and `Evidence report`. Then exactly
one each of `Grounding`, `Scope and checks`, `Findings`, `Unknowns`,
`Residual risks` in that order, each a top-level line with exactly that text;
empty lines inside a section's prose are fine. `UNKNOWN` additionally includes a
non-empty `Unknown-Account` between Findings and Unknowns holding one typed
`Unknown-Reason: <reason>` line. The last line is `End-Review: <same id>`,
followed by at most one line feed.

`Grounding` is where the proof of the checkout goes: the HEAD printed by
`git rev-parse HEAD`, an empty `git status --porcelain`, or for a shared
checkout the SHA-bound reads used. It never goes into the service lines.

Each finding in `Findings` takes exactly one of two bodies, both top-level:

```text
F-001
[P2] causal path, impact, invariant, direction and regression case…
```

```text
F-001 [P2] causal path, impact, invariant, direction and regression case…
```

A key already opened and restated later in its own body is prose. A body inside
a list, quote or code block answers nothing, a severity differing from the index
is malformed, and every index key has exactly one body.

The complete textual report includes:

- exact 40-hex candidate SHA;
- opaque native `Review-Execution` id when supplied by the caller;
- requested and effective mode;
- grounding, checks and stage evidence;
- each finding's textual P0–P3 severity, evidence state, causal path, impact and
  actionable location;
- Unknowns and residual risks;
- exactly one terminal verdict: `PASS`, `FINDINGS` or `UNKNOWN`.

Deliver the whole report inside the single authoritative response the caller
named. A summary of it, a pointer to where its full text can be read, and a
promise to send it separately are each a malformed report. On some backends
delivering that response is exactly what ends the session, so whatever stayed
outside it is the part nobody can retrieve afterwards, and the review has to be
bought again. A backend's generic completion format — a short summary, say —
yields to this grammar when the brief declares it; a reviewer that sees both and
no declaration asks before sending.

Validate the exact bytes before sending them. The shipped
`mo-review-report.mjs template` prints a complete body this grammar accepts for
the brief's own Dispatch, candidate, modes and round; fill it in rather than
rebuild it. The `Round` line comes from the four values of the brief's `Round`
field passed as `--attempt`, `--attempt-limit`, `--deep-reads` and `--fragment`
to `template`, `prepare` and `validate`; a missing line is `round_missing`, a
misspelled one `round_malformed`, an attempt over its limit
`round_exceeds_budget`, and a line other than the flags say `round_mismatch`.
`mo-review-report.mjs prepare --file <Body-File>` validates the bytes, then
creates the file the brief named exclusively and writes them once; the response
carries exactly that file's content. Without a `Body-File`,
`mo-review-report.mjs validate --file -` checks the same bytes from stdin. A
malformed result is fixed before sending; assume there is no second chance.

Structure is read from the block AST: only a top-level node can carry a
structural marker, and the contents of a code block, a quote or a list are never
index or finding body. `mo-review-report.mjs validate` applies exactly this
grammar, so a report that reads correctly to a human is not rejected for quoting
its own markers.

Index keys start at `F-001`, are report-local and match finding body/severity
one-to-one. Counts equal authored findings. `PASS` has zero counts and empty
index/Findings, while grounding, checks, Unknowns and residual risks remain
explicit and non-empty. `FINDINGS` has at least one finding. `UNKNOWN` keeps the
findings it did prove: its index, counts and bodies follow the same rules, its
`Unknown-Account` says what stayed unreviewed, and without an index its Findings
section is empty. A finding also states its post-fix invariant, technical
direction and depth `local patch`, `boundary repair` or
`affected-slice redesign`. Its acceptance proof is named as concrete cases —
input and state, expected behavior, and where the check belongs — precise enough
to write them without asking the reviewer a second question. A finding whose
acceptance is "make it correct" sends remediation guessing, and every guess
costs another full review round.

Some classes of finding have no finite fix: recognizing secrets in free text,
parsing a foreign format by heuristics, sanitizing arbitrary input. There each
fix meets a new shape, and a review that raises one more shape per round never
converges. A finding of such a class lists the complete set of concrete cases
the fix must satisfy, and the fix is judged against that list and its regression
tests. A shape outside the list raised in a later round is a new finding only
when it is a different class or a regression; otherwise it is a residual risk.

`Residual risks` records what the reviewer saw and deliberately did not report
as a finding: a pre-existing problem outside the task range, an external
blocker, an unverified live part, a known limit of a heuristic. That record is
the correct outcome, not unfinished work: it informs the owner, who decides
whether it becomes work, and the executor does not turn it into part of the task
without that decision. Confirmed work outside the task is routed as an Issue.

`PASS` means no required change remains and evidence covers the complete scope.
Dirty or mismatched checkout, unknown SHA, truncated/unreadable output or
missing required context is `UNKNOWN`. Never edit the candidate or run a
mutating formatter/fixer in its worktree.

Numeric confidence and adjudication counters remain forbidden. The only numeric
projection outside a report is a component-wise P0–P3 census copied from already
published reviewer counts; it carries no deduplication, ranking or judgment.
