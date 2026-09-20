# Review brief

The brief is everything a reviewer is given. It is not a summary of the work: it
is the task bytes, and whatever is missing from it the reviewer either asks
about — costing a turn — or invents, which costs the whole review.

## Fields

Every brief carries all twelve, in this order, each on its own line or block:

| Field                  | What it settles                                                           |
| ---------------------- | ------------------------------------------------------------------------- |
| `Target`               | the exact 40-hex candidate SHA, never a branch or a moving ref            |
| `Intent`               | what the change is for, in the requester's words                          |
| `Scope`                | the commit range and the named sections; what is out of scope             |
| `Mode`                 | `fast`, `deep` or `follow_up`, and that self-escalation is the reviewer's |
| `Placement`            | `isolated` or `shared_checkout`, the exact workspace, where its `HEAD` is |
| `Environment`          | how a pointed test may be run, or that none may be                        |
| `Constraints`          | what the reviewer may not do: no writes, no full gate in parallel         |
| `Ownership`            | which resources are the reviewer's and which are not                      |
| `Acceptance`           | what a finding must state to be actionable                                |
| `Report`               | the authoritative response, its shape, and where it goes                  |
| `Methodology-Friction` | where to report a rule that got in the way rather than a defect           |
| `Cleanup`              | what to remove, and what to report when removal fails                     |

`Review-Execution` in the report is the Dispatch id from Orca's own preamble,
copied verbatim; the brief says so rather than supplying a guess. No placeholder
survives into a sent brief: a brief containing `<sha>` or `<range>` is not a
brief, and sending one spends a reviewer on a question.

Every SHA in the brief is pasted from the output of `git rev-parse <ref>` and
proved with `git cat-file -t <sha>` before the brief is sent. An abbreviation
expanded by hand looks exactly like a real SHA and names no tree: the reviewer
cannot materialize the candidate, answers `UNKNOWN` with
`Unknown-Reason: retrieval_failure`, and the whole round is spent.

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
it works in, which is the cheapest proof there is, and every pointed check it
runs is a check of the candidate rather than of a neighbouring commit.

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
