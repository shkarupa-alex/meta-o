---
name: mo-review
description: Run two independent reviews of the current change, apply the accepted findings, and repeat rounds until both reviewers pass with nothing actionable left. Use directly in the coding session that just made a small fix, or as the review protocol inside a full mo-herdr / mo-omnigent workflow.
license: MIT
---

# Review a frozen candidate

This skill owns reviewer judgment, prompts, findings and compact review handoffs.
The selected backend owns actor launch, lifecycle, complete-turn retrieval and
opaque delivery. Read `references/purpose-and-architecture.md` before judging
purpose or architecture.

## Preconditions

Review one full clean candidate SHA. Reviewer A completes before reviewer B
starts; B receives the same task/spec locator and candidate but no A output. Each
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
MO_REVIEW_V2|candidate=<oid>|reviewer=<A|B>|status=<PASS|FINDINGS|DISPUTED|UNKNOWN>|part=<positive-int>|more=<yes|no>|ids=<ids|none>|open=<ids|none>|closes=<ids|none>|qc=<PASS|FAIL|UNKNOWN>|smoke=<PASS|FAIL|UNKNOWN>|checks=<PASS|FAIL|UNKNOWN|NA>|e2e=<REQUIRED|NA|UNKNOWN>|unknown=<transport|environment|evaluation|none>
```

Fields occur once in that order. Candidate equals observed `HEAD`. IDs are unique,
numerically sorted, comma-separated with no spaces. Positive integers have no
sign or leading zero.

State rules:

- `PASS`: `ids=none`, `open=none`, QC/smoke PASS, checks PASS/NA, E2E
  REQUIRED/NA, unknown none; `closes` is none or every origin-open ID.
- `FINDINGS`: introduce at least one new ID across the complete evaluation,
  preserve the cumulative open set and actual check fields.
- `DISPUTED`: one part, no new IDs/closes, disputed origin IDs remain open.
- `UNKNOWN`: one part, no new IDs/closes and exactly one unknown class. Transport
  may retain completed PASS check fields; that does not turn the review into PASS.

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
both first passes before any body reaches the executor. After the barrier all A
parts followed by all B parts are released together as separately framed opaque
segments.

## Resolution and disputes

The executor verifies each claim against the repository, fixes it or emits an
`MO_EXECUTOR_V1|type=RESPONSE` rebuttal for current origin IDs. Only the origin
reviewer can close a finding.

On the next origin turn, every rebutted ID still open must close or be returned
as `DISPUTED`; new findings receive new IDs and do not defer this. An existing
other-vendor reviewer may issue one `MO_ADJUDICATION_V1` on one disputed ID:

```text
MO_ADJUDICATION_V1|candidate=<oid>|finding=<id>|reviewer=<A|B>|outcome=<UPHOLD|WITHDRAW|UNRESOLVED>
```

Adjudication does not close the origin finding. UPHOLD returns work. WITHDRAW
still requires final origin closure/PASS. UNRESOLVED or repeated refusal after
withdrawal is the only technical dispute boundary sent to the human.

## Passing

The review gate passes only when both complete reviews on the unchanged candidate
are `status=PASS`, `unknown=none`, QC/smoke PASS, checks PASS/NA, no IDs remain
open, vendors differ, and both reviewers evaluated full intent. Any commit makes
the round stale and restarts both reviews.
