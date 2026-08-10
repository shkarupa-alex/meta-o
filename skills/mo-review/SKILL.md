---
name: mo-review
description: Run two independent reviews of the current change, apply the accepted findings, and repeat rounds until both reviewers pass with nothing actionable left. Use directly in the coding session that just made a small fix, or as the review protocol inside a full mo-herdr / mo-omnigent workflow.
license: MIT
---

# Review, fix, and review again

This skill owns reviewer judgment, prompts, findings and compact review handoffs.
The selected backend owns actor launch, lifecycle, complete-turn retrieval and
opaque delivery. Read `references/purpose-and-architecture.md` before judging
purpose or architecture.

## Two entry modes

**Direct mode** is the primary standalone entry. The coding session that just
made the change remains the author and temporarily owns executor work: it reads
the repository and framing, creates a clean candidate commit, selects the review
backend, applies accepted findings, answers rebuttals with evidence, commits each
coherent correction and starts a fresh two-reviewer round after every new SHA.
No separate executor actor is created. This is the deliberate small-fix
exception to the rule that an executor does not receive methodology.

Select the direct review backend without asking the user to make an ordinary
routing choice. Reuse an enclosing backend when one exists. Otherwise prefer a
fixture-proven Herdr surface when the session is inside `HERDR_ENV=1`, then a
fixture-proven native Omnigent surface, then the current harness's native
subagent/session surface only if it proves complete turns and the required
actual vendor diversity. The selected surface owns launch, lifecycle, full-turn
retrieval and opaque delivery. If none qualifies, return content-free
`needs_attention` for review capability; do not invent headless/private capture
or silently accept two same-vendor passes.

**Backend protocol mode** is used inside `mo-herdr` or `mo-omnigent`. The
enclosing backend already has an executor and frozen candidate and owns every
session operation. This skill supplies only reviewer lenses, compact outcome
semantics and convergence rules; it neither launches actors nor edits the
repository in that mode.

## Preconditions

Review one full clean candidate SHA. In direct mode, run the applicable checks
and commit the current change before freezing it; do not review a dirty diff as
if it were candidate evidence. Reviewer A completes before reviewer B
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
MO_REVIEW_V2|candidate=<oid>|reviewer=<A|B>|status=<PASS|FINDINGS|FOLLOWUP|OUTCOMES|DISPUTED|UNKNOWN>|part=<positive-int>|more=<yes|no>|ids=<ids|none>|open=<ids|none>|closes=<ids|none>|disputes=<ids|none>|qc=<PASS|FAIL|UNKNOWN>|smoke=<PASS|FAIL|UNKNOWN>|checks=<PASS|FAIL|UNKNOWN|NA>|e2e=<REQUIRED|NA|UNKNOWN>|unknown=<transport|environment|evaluation|none>
```

Fields occur once in that order. Candidate equals observed `HEAD`. IDs are unique,
numerically sorted, comma-separated with no spaces. Positive integers have no
sign or leading zero.

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
  `disputes`; it reports a mixed old-ID outcome.
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

On the next origin turn, one complete one-part outcome accounts for the exact
`rebuts` set: every ID is in exactly one of `closes` or `disputes`. New findings
receive new IDs in a `FOLLOWUP` outcome only after every rebutted ID closes. An
all-close/no-new outcome is final `PASS`, a mixed close/dispute outcome is
`OUTCOMES`, and an all-dispute outcome is `DISPUTED`. An existing other-vendor
reviewer may issue one `MO_ADJUDICATION_V1` on one disputed ID:

```text
MO_ADJUDICATION_V1|candidate=<oid>|finding=<id>|reviewer=<A|B>|outcome=<UPHOLD|WITHDRAW|UNRESOLVED>
```

Adjudication does not close the origin finding. UPHOLD returns work. WITHDRAW
still requires final origin closure/PASS. UNRESOLVED or repeated refusal after
withdrawal is the only technical dispute boundary sent to the human.

For multiple disputes from one outcome, adjudicate targets sequentially. Every
request reuses the exact whole executor `RESPONSE`, exact whole origin outcome,
and the introducing part for that target. Backend scratch reference-counts the
shared response/outcome until every referenced adjudication delivery is
terminal; it never deletes shared bytes after only the first target.

Every permitted non-dispute human answer begins exactly:

```text
MO_HUMAN_ANSWER_V1|candidate=<oid|none>|phase=<product|architecture|irreversible|credentials|subscription|production_e2e|external_blocker|watchdog>|requester=<executor|e2e|orchestrator>
```

Executor may request every phase except `production_e2e` and `watchdog`; E2E may
request `production_e2e`, `irreversible`, `credentials`, `subscription`, or
`external_blocker`; only orchestrator may request `watchdog`. Backend protocol
mode uses `HUMAN_ANSWER_TO_EXECUTOR`. In direct mode the current author session
is that executor. Before acting, it appends the credential-safe human words
verbatim to `docs/business.md` and every current task/spec, commits a new clean
candidate and invalidates all prior gates and IDs. The dedicated
candidate/finding-bound `MO_HUMAN_DECISION_V1` route remains for unresolved
adjudication.

## Direct convergence loop

1. Freeze the clean candidate and run independent A, then B, through the selected
   backend with no A bytes reaching B.
2. If both pass, relay neither body. Run applicable E2E or accept NA only when
   both independently declared it, then return the unchanged full SHA.
3. If findings exist, deliver the conditional A/B pair to the direct author
   session. Apply every accepted finding, run checks and commit a new clean
   candidate; that SHA invalidates the round and starts again at step 1.
4. For evidence-backed rebuttals on an unchanged SHA, use same-origin
   `RESPONSE` and the complete outcome-set/adjudication protocol above. Any
   accepted correction or permitted human answer is committed and restarts both
   reviewers.
5. Continue until one unchanged candidate has two independent PASS outcomes and
   its applicable E2E gate. Do not stop after one pass, a partial outcome,
   `UNKNOWN`, or a round made stale by a commit.

## Passing

The review gate passes only when both complete reviews on the unchanged candidate
are `status=PASS`, `unknown=none`, QC/smoke PASS, checks PASS/NA, no IDs remain
open, vendors differ, and both reviewers evaluated full intent. Any commit makes
the round stale and restarts both reviews.
