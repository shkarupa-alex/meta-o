# Review protocol

This document owns the common review semantics used by all three backend entry
skills. Backend mechanics owns session creation, waiting, questions and complete
response retrieval.

## Inputs and independence

Review the current clean full candidate SHA against the same task/spec and
complete verbatim user-intent ledger. Start reviewer A and reviewer B concurrently
in separate sessions. They receive no peer output. Use different model vendors,
and ensure at least one differs from the executor vendor.

Use complementary lenses:

- Reviewer A: correctness, requirements, regressions, tests and operational
  behavior.
- Reviewer B: architecture, simplicity, safety, maintainability, knowledge
  consistency and missing proof.

Both reviewers run applicable non-mutating deterministic checks and bind the
verdict to the exact same full SHA. They do not edit files, commit, apply fixes,
or start another reviewer.

## Required review

Each reviewer independently:

1. derives every requirement from the task/spec and intent ledger;
2. inspects the candidate diff and relevant surrounding implementation;
3. maps each requirement to direct evidence rather than inferring completion
   from a narrow test;
4. runs relevant non-mutating checks;
5. identifies correctness, security, regression, documentation and acceptance
   gaps;
6. performs the backlog lens below;
7. returns one complete settled response with candidate SHA, vendor, lens,
   checks, findings and `PASS`, `FINDINGS` or `UNKNOWN`.

Findings are actionable and cite paths or observable behavior. `PASS` means no
required change remains and every requirement has adequate evidence. Missing,
truncated or unreadable output is `UNKNOWN`; there is no partial pass.

## Backlog lens

After reviewing the feature itself, read all of `docs/backlog.md` and:

- scrutinize every row added or changed during the feature;
- decide whether each deferral is justified;
- check related older rows and flag work logical to include now;
- identify obsolete, false or incomplete entries;
- require a reason, practical impact and next step for every real deferral;
- confirm the backlog is not being used as a progress tracker;
- do not edit the backlog.

## Barrier and delivery

Wait until both settled responses are complete before releasing either. Save
them unchanged in two private temporary files and give the executor both paths
in one ordinary message. Do not merge, rank, summarize, hash, encode, split or
size-limit responses. File creation or complete-read failure is delivery
failure. Cleanup is best effort.

The executor owns fixes and a new commit. A new SHA requires two new independent
reviews. Use judgment rather than finding identifiers, adjudication grammars or
numeric review-round caps; stop with `needs_attention` only when the loop is no
longer making progress or a human decision is genuinely required.
