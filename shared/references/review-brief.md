# Review brief

The brief is everything a reviewer is given. It is not a summary of the work: it
is the task bytes, and whatever is missing from it the reviewer either asks
about — costing a turn — or invents, which costs the whole review.

## Fields

Every brief carries all of these, in this order, each on its own line or block:

| Field                  | What it settles                                                           |
| ---------------------- | ------------------------------------------------------------------------- |
| `Target`               | the exact 40-hex candidate SHA, never a branch or a moving ref            |
| `Intent`               | what the change is for, in the requester's words                          |
| `Spec`                 | the specification the work followed, in one of the four forms below       |
| `Intent-Ledger`        | the user's verbatim intent ledger, in the same four forms                 |
| `Scope`                | the task range `<base>..<Target>`, named sections, what is out of scope   |
| `Mode`                 | `fast`, `deep` or `follow_up`, and that self-escalation is the reviewer's |
| `Round`                | `attempt=<n>/<limit> deep_reads=<m> fragment=<id>` the caller counted     |
| `Placement`            | `isolated` or `shared_checkout`, the exact workspace, where its `HEAD` is |
| `Environment`          | that no test, linter or QC is run: reading is by SHA, nothing is executed |
| `Constraints`          | what the reviewer may not do: no writes, no tests, lint, QC or subagents  |
| `Ownership`            | which resources are the reviewer's and which are not                      |
| `Acceptance`           | what a finding must state to be actionable                                |
| `Reviewer-Skill`       | `mo-reviewer` by name only: no path, no version, no hash                  |
| `Report`               | the authoritative response, the grammar that replaces the generic one     |
| `Body-File`            | the one path the reviewer creates, validates and sends, or `none`         |
| `Methodology-Friction` | where to report a rule that got in the way rather than a defect           |
| `Cleanup`              | what to remove, and what to report when removal fails                     |
| `Knowledge-Layer`      | the helper's literal `state=… reason=…` line on the same SHA              |
| `Backlog-Gate`         | the caller's own backlog gate on `Target` and its result, or `not_run`    |
| `E2E`                  | exactly one E2E form: evidence lines, `not_applicable` or `not_evaluated` |

`Scope` names the task, not the last change. `base` is where the task starts:
the point the task branch left the branch it came from, or, when the work has no
branch of its own, the start the caller names — in the simplest case the branch
name, resolved to a full SHA. `Target` is only the upper bound. A `follow_up`
brief carries the same range together with the delta since the previous
candidate; the delta says where to look first, not what may be reported.

`Round: attempt=<n>/<limit> deep_reads=<m> fragment=<fragment-id>` carries the
caller's own counters for this Dispatch, and the reviewer passes the four values
to the validator as `--attempt`, `--attempt-limit`, `--deep-reads` and
`--fragment`, which print and check the body's `Round` line; the reviewer never
copies the line itself. `fragment` is a short id the caller gives the content
fragment under review, `[a-z0-9-]{1,40}`. Both counters belong to that fragment
and to the pair, and include this round: a new SHA, a hot continuation and a
slot replacement reset neither, and only a new fragment starts both again.
`limit` is 5 or the extension the owner approved; `deep_reads` grows by one for
the first deep pair of the fragment and for every fresh independent deep pair
after it, the final one included, while a hot continuation, a slot replacement
and the one repeat after a malformed Dispatch leave it as it was. The caller
checks the body's line against its own values when it stages the report and
again when it pairs both, so a value carried over wrongly is `round_mismatch`
and the report is not published.

`Review-Execution` in the report is the Dispatch id from Orca's own preamble,
copied verbatim; the brief says so rather than supplying a guess. No placeholder
survives into a sent brief: a brief containing `<sha>` or `<range>` is not a
brief, and sending one spends a reviewer on a question.

The `Knowledge-Layer` line is the exact output of
`mo-knowledge-layer.mjs --candidate <sha>` on the `Target` SHA, pasted, never
retold: a brief without it leaves the reviewer's deferral lens `unknown`.

`Backlog-Gate: <G0|GC|G1|G2> <EMPTY|NOT-EMPTY|UNKNOWN|not_run>` carries the
caller's own backlog gate. The gate names where the candidate stands — `G0`
while the task is worked on, `GC` for the closure candidate, `G1` and `G2` right
before an agent's MR/PR and merge — and the result is the literal `MO-BACKLOG/1`
answer of the project's closure command, run by the caller on exactly `Target`.
A gate the caller did not run on that SHA is `not_run`: every candidate between
G0 and GC, a standalone review, a project whose knowledge layer is
`not_enabled`. `not_run` is evidence the caller owns, never a check the reviewer
skipped. Running a gate stays the caller's; the reviewer inspects the committed
backlog and registry statically and gains no right to run the gate, QC, a test
or any other project command.

The `E2E` field takes exactly one of three forms, and the lens it opens belongs
to [Portable review protocol](review-protocol.md):

```text
E2E-Evidence: <scenario-id> sha=<40-hex> result=<pass|not_applicable|blocked:external_capability|not_run> source=<dispatch-id>
E2E-Coverage: <scenario-id> acceptance=<row-id>[,<row-id>…] signals=<observed signs> paths=<key paths>
E2E: not_applicable reason=no_task_scenarios sha=<40-hex> source=<dispatch-id> basis=<why no scenario covers the touched behavior>
E2E: not_applicable reason=<why the project has no scenarios>
E2E: not_evaluated reason=standalone
```

In the orchestrated lifecycle it is one `E2E-Evidence` and one `E2E-Coverage`
line per scenario, copied verbatim from the complete `worker_done` of `mo-e2e`
and never retold; after a partial rerun only the rerun scenarios' lines change,
so the other lines keep their earlier scenario SHA. Only `pass` and
`not_applicable` are evidence. A `blocked:external_capability` the project's E2E
contract types, or a `not_run` whose stated reason is an unavailable environment
or profile, is an external block: its line is copied the same way as a known,
unproven scenario, so the reviewers raise no `e2e_missing` for it. A `fail`, an
`unknown`, or a `not_run` for any other reason — a rejected candidate, a wrong
placement — never enters a brief. When the project has scenarios but `mo-e2e`
selected none for the task, the field is the one
`E2E: not_applicable reason=no_task_scenarios` line that `mo-e2e` printed,
copied the same way; it is never written by the caller. A project without
scenarios gets `E2E: not_applicable` with its reason. A standalone review
without a separate E2E request gets `E2E: not_evaluated reason=standalone`,
which switches the E2E lens off.

Every SHA in the brief is pasted from the output of `git rev-parse <ref>` and
proved with `git cat-file -t <sha>` before the brief is sent. An abbreviation
expanded by hand looks exactly like a real SHA and names no tree: the reviewer
cannot materialize the candidate, answers `UNKNOWN` with
`Unknown-Reason: retrieval_failure`, and the whole round is spent.

## The report the reviewer sends

`Report` says two things in so many words. The response is the complete report
in the grammar of [Portable review protocol](review-protocol.md), and that
grammar replaces whatever generic completion format the backend's own preamble
describes — a reviewer that sees two formats and no such sentence has to guess
which one loses the review. It also carries the `mo-review-report.mjs template`
command with the brief's candidate, modes and the four `Round` values, so the
service lines are copied rather than rebuilt from prose. Its `--dispatch` value
is the reviewer's to take from Orca's preamble: the Dispatch id exists only
after the task is written, and naming where a value comes from is not a
placeholder.

`Body-File` names one path, `Body-File: <slot dir>/slot-<a|b>-r<round>-d<n>.md`,
in the directory `mo-review-report.mjs namespace` created for this slot and
round outside every worktree. A brief names only its own slot's directory: until
slot B's report is accepted, its brief never names slot A's directory or the
pair directory, and a new Dispatch gets a new path. The name is built from what
the caller holds before sending: the Dispatch id reaches only the reviewer, in
Orca's preamble, so it lives inside the body as `Review-Execution` and never in
the file name. `<n>` counts the Dispatches to that slot within the round, so the
one repeat Dispatch after a malformed report gets a new file and the earlier
body stays as the evidence of that round. The reviewer creates that file
exclusively with `mo-review-report.mjs prepare`, which validates the bytes first
and refuses an existing file, and sends exactly the file's content. The caller
then compares what it received with the file byte for byte. Where the reviewer
runs on another host and cannot reach the caller's directory, the field says
`Body-File: none` and the reviewer validates the same bytes on stdin instead;
the caller then accepts the received body on its structure alone and says that
the prepared bytes were not compared.

`Reviewer-Skill: mo-reviewer` names the reviewer skill and nothing else: no
path, no build stamp, no hash and no comparison of copies. Meta-O skills are
installed in every agent environment that takes part, and the reviewer uses the
skill its own environment has under that name — it carries the risk lenses, the
no-execution rule and the validator. A path from the caller's installation names
a file of another environment, and two environments' copies compared by hand are
a review nobody asked for. A reviewer whose environment has no skill of that
name says so instead of reviewing, and that slot ends with
`needs_attention/skill_unavailable`; no reviewer instructions are pasted into
the Dispatch from another copy. The reviewer does not start the coordinator's
review skill; calling its validator is not starting a review.

## Grounding sources reach the reviewer as exact bytes

Every source the brief names as grounding must reach the reviewer as exact
bytes. A private workspace path does not: `.orca/` is ignored, so a file named
there exists in no checkout the reviewer can obtain, and the reviewer either
stops to ask or reasons from an invented section — and a verdict grounded in an
invented section is indistinguishable from a real one.

`Spec:` and `Intent-Ledger:` each take exactly one of four forms:

```text
Spec: <tracked repo path>
Spec: git <commit-40-hex>:<path> blob=<40-hex>
Spec: file <absolute path> sha256=<64-hex>
Spec: none
```

The accepted specification of a feature lives in `docs/specifications/`, which
is tracked and therefore reachable at the candidate SHA. Name it there by its
tracked path. The same holds for every other cited document: cite the tracked
path, not the copy that happened to be open.

Closure deletes that specification, so the final same-SHA pair reviews a
candidate whose tree no longer holds it. There the brief names the durable
knowledge instead — the acceptance map, the architecture decisions, the
methodology — and cites the specification by the frozen object id the project
recorded when it removed the file, in the `git` form. A blob stays reachable
because the tree of the commit before the deletion still points at it, so the
form names that commit, the path and the object id together; an object id alone
lasts only until the next `gc` and exists on no other host. A shallow or partial
checkout may hold neither, which makes a full clone or worktree part of the
placement; a path that the candidate does not contain is not a citation but a
dead reference, and a brief that names one has to say so rather than let the
reviewer discover it.

A standalone review whose specification or ledger is outside Git — never
committed, or kept in an ignored directory — gets the `file` form. The caller
reads the exact bytes once, outside the candidate, and copies them into each
slot's own directory, the one that holds that slot's `Body-File`, with the
bundled `mo-review-input.mjs copy`; each brief takes the line printed for its
slot, with the path and sha256 of its own copy. The copy lives as long as that
directory. Nothing is copied into the candidate's tree, which would make it
dirty, and nothing travels as base64 in the Dispatch body, which a model
rewrites. A reviewer on another host cannot see the directory; there the honest
answer is a full clone with the specification committed to the task branch.

`copy` refuses a directory whose name carries another slot letter, or another
pair id than the second slot's, with `slot_mismatch`, so a slot's line can only
ever name its own directory.

Before reading either source the reviewer runs `mo-review-input.mjs check` on
the brief's own line with the brief's own `Body-File` as `--body-file`; a copy
outside that file's directory is `external_input_integrity`, whatever its
sha256. It compares a copy's sha256, or `git rev-parse` of the commit and path
with the blob, and the reviewer then reads exactly those bytes — never a
truncation or a retelling. A check answering `external_input_missing`,
`external_input_integrity` or `external_input_unavailable` makes the review
`UNKNOWN`. On `external_input_unavailable` the caller recommends a full clone,
or committing the specification to the task branch.

## The workspace stands where the brief says it stands

An isolated workspace is checked out at the candidate, clean, before the brief
is sent. The reviewer then proves the SHA with `rev-parse HEAD` in the directory
it works in, which is the cheapest proof there is, and everything it reads is
the candidate rather than a neighbouring commit.

When the owner approved an early repair, the executor keeps working while the
second reviewer is still reading. The brief then says so: the reviewer's own
tree is detached at the old full SHA, it never reads the executor's branch,
worktree or any other ref that moves, and it rechecks `rev-parse HEAD` and a
clean tree right before `worker_done`. A reviewer that followed a moving ref
would review a candidate nobody froze.

Parking the reviewer on another commit and telling it to read the candidate by
SHA costs a round whenever the reviewer takes the protocol at its word: a
workspace whose `HEAD` is not the candidate is `candidate_mismatch`, and a final
`PASS` from it would be a verdict about a tree nobody checked out. Reading by
SHA is the `shared_checkout` answer, where `HEAD` belongs to somebody else and
the reviewer may not move it. The brief names which of the two it is, so the
reviewer does not have to guess whether a mismatch is a mistake or the design.

## What may be said to a human requester

A human requester who asks for business questions receives, at most: one
verbatim index line, its slot and vendor, the path to the full report, and one
product question with a recommended hypothesis. The finding body is neither
quoted nor paraphrased, findings are not ranked and not merged, and two
reviewers finding the same thing stay two findings.

This projection is for a human who asked. It is forbidden in an Issue, in a
merge-request comment, in a message to an executor, and in orchestrator mode,
where the same bytes stop being an answer to a question and become a claim on
the record.
