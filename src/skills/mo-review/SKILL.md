---
name: mo-review
description: Supply the backend-neutral two-reviewer protocol inside an installed mo-herdr or mo-omnigent feature workflow — independent lenses, compact outcomes, adjudication, and same-SHA convergence. This is a protocol component, not a standalone reviewer launcher or fixing runtime.
license: MIT
---

# Two-reviewer protocol

This skill owns reviewer judgment, prompts, findings and compact review handoffs.
The selected backend owns actor launch, lifecycle, complete-turn retrieval and
opaque delivery. Read `references/purpose-and-architecture.md` before judging
purpose or architecture.

## Invocation boundary

Use this protocol only inside an installed `mo-herdr` or `mo-omnigent` feature
workflow. The enclosing backend already owns the executor, actor creation,
actual vendor selection, lifecycle waits, complete-turn retrieval, opaque relay,
finding application, commits, E2E, and fresh-round scheduling. This skill
supplies reviewer lenses, compact outcome semantics, and convergence rules; it
does not launch reviewers, select a backend, inspect a worktree as author, apply
findings, or provide a standalone fixing loop.

A single-skill `mo-review` installation is therefore a readable/reusable
protocol artifact, not an executable review product. Do not improvise a direct
mode with ambient subagents, private transcripts, headless provider commands, or
an undeclared dependency on another installed skill. A request to run a review
is routed through `mo-herdr` or `mo-omnigent`; if neither qualified backend is
available, report review capability attention.

## Preconditions

Review one full clean candidate SHA supplied by the enclosing backend. Reviewer A
completes before reviewer B starts; B receives the same task/spec locator and
candidate but no A output. Each
reviewer independently reads the complete task/spec, business framing, glossary,
project knowledge and candidate. At least one reviewer vendor differs from the
author, and A/B vendors differ. Actual launched process kinds establish vendors.

Reviewers never edit or commit. Each runs `make mo-qc`, `make mo-smoke` and every
applicable documented non-mutating check. A diagnostic that can mutate tracked
files runs only in an isolated disposable location. If a check dirties the frozen
worktree, report a finding plus `checks=FAIL`; never clean or hide it.

## Mandatory lenses

1. Whole user intent: compare the spec against the verbatim business framing,
   then implementation and acceptance against both. Missing, paraphrased or
   secret-bearing tracked intent is a finding; inability to read framing is
   evaluation UNKNOWN.
2. Correctness: failure paths, concurrency, security and cleanup where relevant.
3. Verification: tests constrain behavior, QC was not weakened, and required
   deterministic/agentic evidence names this SHA.
4. Architecture: every boundary exists for a business reason; no rejected
   runtime component returned under another name.
5. Reuse decision: implementation evidence has not made it false.
6. Durable knowledge: glossary, architecture, backlog, acceptance and generated
   outputs changed in the same increment that changed their truth.
7. Purpose semantics: every first-party module/API/class/boundary/overload says
   why deletion would break an invariant; trivial accessors/generated glue do not
   carry ritual prose.
8. Excess tooling: no proxy, home-grown parser, duplicate source owner, receipt,
   manifest, baseline or narrative without a consumer.

For guards introduced or changed by the candidate, inspect the executor's
mutation sweep. Independently mutate suspicious guards in disposable copies.
A surviving non-equivalent defect is a finding; it is not waived because the
ordinary suite passed.

## Finding bodies

Every finding receives the reviewer-owned stable ID `A-<n>` or `B-<n>` and a
complete opaque body:

```markdown
### A-1 — <severity>: <title>

Evidence: <specific file/behavior/command evidence>
Impact: <what becomes wrong>
Expected fix: <required outcome without dictating implementation>
```

IDs increase monotonically for the feature run and are never reused after a
candidate invalidates them. Findings are not ranked, filtered, merged,
paraphrased or semantically shortened in transport.

## `MO_REVIEW_V2`

The first line of every part is exactly:

```text
MO_REVIEW_V2|candidate=<oid>|reviewer=<A|B>|status=<PASS|FINDINGS|FOLLOWUP|OUTCOMES|DISPUTED|UNKNOWN>|part=<positive-int>|more=<yes|no>|ids=<ids|none>|open=<ids|none>|closes=<ids|none>|disputes=<ids|none>|qc=<PASS|FAIL|UNKNOWN>|smoke=<PASS|FAIL|UNKNOWN>|checks=<PASS|FAIL|UNKNOWN|NA>|e2e=<REQUIRED|NA|UNKNOWN>|unknown=<transport|environment|evaluation|none>
```

Fields occur once in that order. Candidate equals observed `HEAD`. Finding IDs
match `^([AB])-([1-9][0-9]*)$`, are unique and comma-separated with no spaces,
and have no numeric cap. Group by prefix and compare each unbounded decimal
suffix exactly as a `BigInt`; suffixes must be strictly increasing within their
prefix. A mixed list contains the complete A block first and the complete B
block second; an origin-reviewer list has only its own prefix. Never use
`Number`, unary numeric coercion, or lexicographic suffix comparison. Positive
integers have no sign or leading zero.

State rules:

- `PASS`: `ids=none`, `open=none`, QC/smoke PASS, checks PASS/NA, E2E
  REQUIRED/NA, unknown none; `closes` is none or every origin-open ID and
  `disputes=none`.
- `FINDINGS`: introduce at least one new ID across the complete evaluation,
  preserve the cumulative open set and actual check fields; this is the
  first-pass, potentially multipart state.
- `FOLLOWUP`: one part after an executor response, with nonempty new `ids`, every
  rebutted ID closed, and `disputes=none`.
- `OUTCOMES`: one part with `ids=none` and both nonempty `closes` and
  `disputes`; it reports a mixed old-ID outcome and, after canonical validation,
  `open` equals `disputes` byte-for-byte.
- `DISPUTED`: one part with `ids=none`, `closes=none`, and nonempty `disputes`;
  every disputed origin ID remains open.
- `UNKNOWN`: one part, no new IDs/closes/disputes and exactly one unknown class.
  Transport may retain completed PASS check fields; that does not turn the
  review into PASS.

`closes` and `disputes` are disjoint. For the one complete origin outcome after
an executor `RESPONSE`, their union equals that response's exact same-origin
`rebuts` set. Closing removes an ID from `open`, disputing retains it, and each
new `ids` entry is added. A `FOLLOWUP` cannot dispute: it closes the whole
rebuttal set before introducing new IDs. Only `FINDINGS` is multipart;
`OUTCOMES`, `DISPUTED`,
`FOLLOWUP`, `PASS`, and `UNKNOWN` are one part. A complete `FINDINGS` evaluation
is at most 61,440 bytes; each one-part response outcome (`FOLLOWUP`, `OUTCOMES`,
or `DISPUTED`) is at most 24,576 bytes.

Only FINDINGS may continue. Parts start at 1, are consecutive, keep
candidate/reviewer/status/check fields identical, and carry cumulative `open`.
Only the last uses `more=no`. Limits: one to six parts, 180 rows per part,
1000 rows and 61,440 UTF-8 bytes total. `ids` names only findings introduced in
that part. Account for every open ID before PASS.

If the body would exceed a limit, finish the current part at a finding boundary
and request the next part. One compacting retry is allowed; then return transport
UNKNOWN rather than dropping a finding.

## Independence barrier

A emits all parts before B starts. Candidate `HEAD` and cleanliness are rechecked
after A. Except when A's check already dirtied/invalidated the candidate, complete
both first passes before any body reaches the executor. A complete PASS/PASS pair
proceeds to the applicable E2E gate without relaying either body. Only when at
least one first pass has `FINDINGS` are all A parts followed by all B parts
released together as separately framed opaque segments.

## Resolution and disputes

The executor verifies each claim against the repository, fixes it or emits an
`MO_EXECUTOR_V1|type=RESPONSE` rebuttal for current origin IDs. Only the origin
reviewer can close a finding.

An executor `RESPONSE` is valid only when `rebuts` equals the complete current
open-ID set for exactly one origin; a subset, superset, or mixed-origin set is
invalid. On the next origin turn, one complete one-part outcome accounts for
that exact `rebuts` set: every ID is in exactly one of `closes` or `disputes`. New findings
receive new IDs in a `FOLLOWUP` outcome only after every rebutted ID closes. An
all-close/no-new outcome is final `PASS`, a mixed close/dispute outcome is
`OUTCOMES`, and an all-dispute outcome is `DISPUTED`. An existing other-vendor
reviewer may issue one `MO_ADJUDICATION_V1` on one disputed ID:

```text
MO_ADJUDICATION_V1|candidate=<oid>|finding=<id>|reviewer=<A|B>|outcome=<UPHOLD|WITHDRAW|UNRESOLVED>
```

Adjudication does not close the origin finding. Resolve every target in the
validated outcome's exact `disputes` before any terminal peer-outcome relay.
`UNRESOLVED`, or repeated refusal after withdrawal, is the only technical
dispute boundary sent to the human.

For multiple disputes from one outcome, adjudicate targets sequentially. Every
request reuses the exact whole executor `RESPONSE`, exact whole origin outcome,
and the introducing part for that target. The canonical adjudication target set
is exactly the validated origin outcome's `disputes`, not its full `rebuts`
accounting set. Backend scratch reference-counts the
shared response/outcome until every referenced adjudication delivery is
terminal; it never deletes shared bytes after only the first target.

Retained peer-adjudication handoffs for one disputed set have a cumulative
122,880-byte UTF-8 ceiling, header included. Before each target, subtract the
exact byte lengths of all earlier retained peer outcomes. The backend submits
this exact sentence with canonical decimal substitutions:

```text
Emit exactly one MO_ADJUDICATION_V1 handoff for <id>; its complete header-inclusive output is at most <min(65536,remaining)> UTF-8 bytes; <remaining> aggregate peer-outcome bytes remain before this turn.
```

The complete next handoff must be at most both 65,536 bytes and that remaining
budget. Do not truncate, summarize, discard an earlier outcome, or reset the
budget between targets. Reject an oversize result before acceptance without
changing retained state; its one compact retry uses the same remaining value.
Herdr passes the same canonical value to extraction as
`peerOutcomeRemaining` immediately after `expectedOpen`; every
non-adjudication protocol supplies `none`. Omnigent binds the same value in
native lifecycle state and validates it before accepting the complete turn. In
Herdr relay argv, `expectedOpen` remains the complete same-origin
`RESPONSE.rebuts`; the following `aggregateTargets` argument is exactly the
validated outcome `disputes` for adjudication requests and terminal aggregate
routes and is `none` otherwise, followed by `peerOutcomeRemaining`. Each
request requires its target in that set and the parsed outcome's `disputes` to
equal it.

Before accepting the first peer outcome, project both possible final aggregate
envelopes from the exact locator, candidate, canonical `disputes` set/count,
recipient, executor goal/capsule, fixed frames, and final marker. Conservatively
render every segment length as `bytes=65536`; the larger body-excluded envelope
must be at most 7,168 UTF-8 bytes or the backend stops before acceptance. Before
the final aggregate relay, recompute that projection with the retained bodies
and require the complete payload to remain at most 130,048 bytes.

After every target has a valid `MO_ADJUDICATION_V1`, deliver terminal outcomes
atomically in exact canonical target order. If at least one outcome is `UPHOLD`,
`ADJUDICATION_UPHOLD_TO_EXECUTOR` uses the validated `disputes` list as outer
`finding` and carries all N peer outcomes, each `UPHOLD` or `WITHDRAW`. If every
outcome is `WITHDRAW`, `ADJUDICATION_WITHDRAW_TO_ORIGIN` uses that same set and
carries all N `WITHDRAW` outcomes. Never include closed-only rebuttal IDs, relay an early
per-ID terminal outcome, or let a projection use the full `rebuts` set; any
`UNRESOLVED` reaches the human instead.

Every repository-changing permitted non-dispute human answer begins exactly:

```text
MO_HUMAN_ANSWER_V1|candidate=<oid|none>|phase=<product|architecture|irreversible|credentials|subscription|external_blocker>|requester=executor
```

The enclosing backend uses `HUMAN_ANSWER_TO_EXECUTOR`. Before acting, its
executor appends the credential-safe human words verbatim to
`docs/business.md` and every current task/spec, commits a new clean candidate,
and invalidates all prior gates and IDs. The dedicated candidate/finding-bound
`MO_HUMAN_DECISION_V1` route remains for unresolved adjudication.

Candidate-stable E2E and watchdog run authorization is not a generic human
answer and never reaches the executor or tracked intent ledgers. The enclosing
backend accepts only this closed operational header and its exact requester,
candidate, and operation combinations:

```text
MO_OPERATIONAL_APPROVAL_V1|candidate=<oid|none>|operation=<production_e2e|irreversible_e2e|watchdog_start>|scenario=<safe-id|none>|requester=<e2e|orchestrator>|request=<64-lower-hex>|decision=<APPROVE|DENY>
```

An E2E approval exactly matches the visible
`MO_E2E_APPROVAL_REQUEST_V1` candidate, operation, and credential-safe scenario,
then resumes only that scenario in the lifecycle-stored requesting E2E actor on
the unchanged candidate. That actor must equal the native recipient even though
the compact header retains `requester=e2e`.
Watchdog approval uses `scenario=none` and is handled by the orchestrator without
an actor relay. Operational request and approval are each exactly one header row
with no body or final LF. Retain only that row and current conversation evidence;
never persist opaque text or create a documentation commit.
The freshly unpredictable request token is bound to the requester, named
operation, phase, and candidate and is consumed exactly once. The backend stores
the operation independently of the compact header and requires exact equality
when the approval returns. Herdr carries that value as `approvalOperation` after
`approvalScenario` and before `approvalActor`; all four approval arguments are
`none` off the E2E-approval route. Reject stale, replayed, wrong-operation, or
cross-actor approval.

## Backend convergence

The enclosing backend delivers a conditional findings pair to its executor.
Any accepted correction creates a new SHA and restarts both reviewers; an
unchanged-SHA rebuttal uses the outcome/adjudication protocol above. Continue
until the backend has two independent PASS outcomes and applicable E2E on one
unchanged candidate. Do not stop after one pass, a partial outcome, `UNKNOWN`,
or a round made stale by a commit.

## Passing

The review gate passes only when both complete reviews on the unchanged candidate
are `status=PASS`, `unknown=none`, QC/smoke PASS, checks PASS/NA, no IDs remain
open, vendors differ, and both reviewers evaluated full intent. Any commit makes
the round stale and restarts both reviews.
