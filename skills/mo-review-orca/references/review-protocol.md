# Portable review protocol

This document owns evidence-first review semantics. It is portable: backend
session mechanics, reviewer counts, feature lifecycle and report destination
belong to its caller.

## Input and modes

Ground every review in the original intent, accepted specification, repository
instructions, exact full candidate SHA, claimed scope and requested mode.

- `fast` is for bounded low-risk work. Read the complete diff, directly
  reachable callers and callees, related tests/configuration and repository
  instructions.
- `deep` is for a first review or broad/high-risk work. Also inspect schemas,
  relevant history and optional prior-change context when available.
- `follow_up` requires the previous candidate SHA, this reviewer's own complete
  prior report, dispositions of that reviewer's findings and a computable delta.
  Peer reports or reasoning are forbidden.

Modes are coverage profiles, not evidence standards. Escalate `fast` or
`follow_up` to effective `deep` in the same execution for trust/auth,
concurrency, schema/transaction/migration, compatibility, destructive effects,
resource ownership or another broad semantic delta. Missing grounding yields
`UNKNOWN`, never a shortened `PASS`. Report requested and effective mode.

## Ordered algorithm

Perform and retain evidence for these stages in order:

1. Grounding — establish intent, instructions, candidate identity and scope.
2. Change discovery — read the diff before constructing the initial risk map;
   identify changed artifacts, reachable implementation, tests/configuration
   and relevant history.
3. Risk mapping — activate only applicable security/effects,
   concurrency/state, compatibility/data, performance/resources and
   maintainability/test-gap lenses. Expand the map when evidence requires it.
4. Candidate discovery — trace requirements and activated risk surfaces without
   manufacturing findings to fill categories.
5. Candidate verification — try to falsify each candidate with a test, trace,
   contract, guard, caller, configuration or language/framework semantics.
   Classify it as `confirmed`, `strongly_supported`, `unproven` or `refuted`.
6. Causality — a finding must be caused or materially worsened by the candidate.
   Mark a pre-existing blocker only as residual risk.
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

## Deferral lens

An empty backlog is valid and is required at lifecycle closure. Inspect the change
and behavior for postponed, deliberately omitted, blocked or knowingly unfixed
work. A temporary notebook entry needs reason, practical impact and next step;
confirmed out-of-scope work belongs in a correctly routed project/upstream Issue.
An unresolved disposition is `needs_attention`, not permission to leave closure
non-empty. Do not manufacture an entry to fill a category.

## Diagnostics

Targeted read-only checks are always allowed; report their exact command and
environment. The project's full gate is host-sensitive, so run one full gate at
a time, in the foreground, and only after the caller grants the shared lock or a
worktree of your own. A remediation SHA is a new candidate and gets its own run.

Never launch it with `nohup`, `&` or another detached form. Before reading an
exit status, wait for the exact process this review owns and confirm it left no
orphan descendant. A detached, overlapped or unreaped run is `UNKNOWN` for this
reviewer, and a host-sensitive failure under those conditions is not reported as
a candidate finding without clean process evidence.

## Report

Return one complete textual report beginning with:

```text
Review-Execution: <opaque dispatch id>
Candidate: <40-hex SHA>
Mode: requested=<mode> effective=<mode>
Delegation: none
Verdict: <PASS|FINDINGS|UNKNOWN>
Counts: P0=<n> P1=<n> P2=<n> P3=<n>
```

Then include an optional keyed finding index, `Evidence report`, and exactly one
each of `Grounding`, `Scope and checks`, `Findings`, `Unknowns`, `Residual risks`
in that order. `UNKNOWN` additionally includes a non-empty `Unknown-Account`
between Findings and Unknowns and a typed `Unknown-Reason`. End with
`End-Review: <Review-Execution>` as the last non-empty line.

The complete textual report includes:

- exact 40-hex candidate SHA;
- opaque native `Review-Execution` id when supplied by the caller;
- requested and effective mode;
- grounding, checks and stage evidence;
- each finding's textual P0–P3 severity, evidence state, causal path, impact and
  actionable location;
- Unknowns and residual risks;
- exactly one terminal verdict: `PASS`, `FINDINGS` or `UNKNOWN`.

Index keys start at `F-001`, are report-local and match finding body/severity
one-to-one. Counts equal authored findings. `PASS` has zero counts and empty
index/Findings, while grounding, checks, Unknowns and residual risks remain
explicit and non-empty. A finding also states its post-fix invariant, technical
direction, acceptance proof and depth `local patch`, `boundary repair` or
`affected-slice redesign`.

`PASS` means no required change remains and evidence covers the complete scope.
Dirty or mismatched checkout, unknown SHA, truncated/unreadable output or
missing required context is `UNKNOWN`. Never edit the candidate or run a
mutating formatter/fixer in its worktree.

Numeric confidence and adjudication counters remain forbidden. The only numeric
projection outside a report is a component-wise P0–P3 census copied from already
published reviewer counts; it carries no deduplication, ranking or judgment.
