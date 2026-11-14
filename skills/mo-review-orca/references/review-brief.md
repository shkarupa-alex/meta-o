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
| `Spec`                 | `Spec: <path\|object>` the work followed, or `Spec: none`                 |
| `Scope`                | the task range `<base>..<Target>`, named sections, what is out of scope   |
| `Mode`                 | `fast`, `deep` or `follow_up`, and that self-escalation is the reviewer's |
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
| `E2E`                  | exactly one E2E form: evidence lines, `not_applicable` or `not_evaluated` |

`Scope` names the task, not the last change. `base` is where the task starts:
the point the task branch left the branch it came from, or, when the work has no
branch of its own, the start the caller names — in the simplest case the branch
name, resolved to a full SHA. `Target` is only the upper bound. A `follow_up`
brief carries the same range together with the delta since the previous
candidate; the delta says where to look first, not what may be reported.

`Review-Execution` in the report is the Dispatch id from Orca's own preamble,
copied verbatim; the brief says so rather than supplying a guess. No placeholder
survives into a sent brief: a brief containing `<sha>` or `<range>` is not a
brief, and sending one spends a reviewer on a question.

The `Knowledge-Layer` line is the exact output of
`mo-knowledge-layer.mjs --candidate <sha>` on the `Target` SHA, pasted, never
retold: a brief without it leaves the reviewer's deferral lens `unknown`.

The `E2E` field takes exactly one of three forms, and the lens it opens belongs
to [Portable review protocol](review-protocol.md):

```text
E2E-Evidence: <scenario-id> sha=<40-hex> result=<pass|not_applicable> source=<dispatch-id>
E2E-Coverage: <scenario-id> acceptance=<row-id>[,<row-id>…] signals=<observed signs> paths=<key paths>
E2E: not_applicable reason=<why the project has no scenarios>
E2E: not_evaluated reason=standalone
```

In the orchestrated lifecycle it is one `E2E-Evidence` and one `E2E-Coverage`
line per scenario, copied verbatim from the complete `worker_done` of `mo-e2e`
and never retold; after a partial rerun only the rerun scenarios' lines change,
so the other lines keep their earlier scenario SHA. A project without scenarios
gets `E2E: not_applicable` with its reason. A standalone review without a
separate E2E request gets `E2E: not_evaluated reason=standalone`, which switches
the E2E lens off.

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
command with the brief's candidate and modes, so the service lines are copied
rather than rebuilt from prose. Its `--dispatch` value is the reviewer's to take
from Orca's preamble: the Dispatch id exists only after the task is written, and
naming where a value comes from is not a placeholder.

`Body-File` names one path, `Body-File: <dir>/slot-<a|b>-r<round>-d<n>.md`, in a
directory the caller created for this run outside every worktree. The name is
built from what the caller holds before sending: the Dispatch id reaches only
the reviewer, in Orca's preamble, so it lives inside the body as
`Review-Execution` and never in the file name. `<n>` counts the Dispatches to
that slot within the round, so the one repeat Dispatch after a malformed report
gets a new file and the earlier body stays as the evidence of that round. The
reviewer creates that file exclusively with `mo-review-report.mjs prepare`,
which validates the bytes first and refuses an existing file, and sends exactly
the file's content. The caller then compares what it received with the file byte
for byte. Where the reviewer runs on another host and cannot reach the caller's
directory, the field says `Body-File: none` and the reviewer validates the same
bytes on stdin instead; the caller then accepts the received body on its
structure alone and says that the prepared bytes were not compared.

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

## Grounding sources are reachable from the candidate

Every source the brief names as grounding must be readable from the candidate
itself. A private workspace path is not: `.orca/` is ignored, so a file named
there exists in no checkout the reviewer can obtain, and the reviewer either
stops to ask or reasons from an invented section — and a verdict grounded in an
invented section is indistinguishable from a real one.

The accepted specification of a feature lives in `docs/specifications/`, which
is tracked and therefore reachable at the candidate SHA. Name it there. The same
holds for every other cited document: cite the tracked path, not the copy that
happened to be open.

Closure deletes that specification, so the final same-SHA pair reviews a
candidate whose tree no longer holds it. There the brief names the durable
knowledge instead — the acceptance map, the architecture decisions, the
methodology — and cites the specification by the frozen object id the project
recorded when it removed the file. A blob stays reachable because the tree of
the commit before the deletion still points at it, so the brief cites that
commit together with the object id and the reviewer resolves both with
`git cat-file`. A shallow or partial checkout holds neither, which makes a full
clone or worktree part of the placement; a path that the candidate does not
contain is not a citation but a dead reference, and a brief that names one has
to say so rather than let the reviewer discover it.

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
