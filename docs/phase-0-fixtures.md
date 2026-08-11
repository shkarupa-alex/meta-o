# Capability and agentic fixtures

This document is the durable fixture-definition and current support-posture map for
`spec/2026-08-08-herdr-orchestrator-operational-corrections/spec-review.md`.
It contains planned exact fixtures, not historical anecdotes, candidate PASS receipts, or
inferred support. Running a fixture never appends candidate evidence here.

## Status rules

- **PENDING** means the defined fixture has not yet established reusable support for its exact
  surface key.
- **SUPPORTED** means the current reusable surface posture is supported by its exact repeatable
  fixture. It does not mean that any feature candidate passed.
- **UNSUPPORTED** means no reusable support claim exists for the exact surface key, or an exact
  fixture disproved it.

Actor prose, an incidental live failure, an older provider version, and evidence from another
surface never change a support key. Historical inline/headless captures are deliberately
absent: that Herdr route is removed by the cutover and cannot prove the visible interactive
actor surface.

No exact live Herdr fixture has established a reusable supported surface key. All Herdr fixture
definitions remain PENDING and their current surface support is UNSUPPORTED. No live candidate
result is stored or claimed below.

## Live result boundary

Candidate-bound evidence exists only in ephemeral current-run state and the final answer, obtained
from the backend public surface. Its verified final-result record has exactly:

```text
candidate: <full SHA>
worktree: clean
gates[]: <qc/smoke/checks; reviewer-A then reviewer-B statuses>
support[]: <1..16 canonical exact-key SUPPORTED facts with scenario lists>
reviews[]: <exactly A then B; actor/provider/support-key/PASS/qc/smoke/checks/e2e/evidence>
scenarios[]: <exact support-derived order; actor/provider/support-key/PASS/structural evidence>
```

Never edit or commit this map after a candidate gate, and never create a manifest, external sink,
or receipt for those facts. A dirty tree, changed SHA, missing full result, or unreadable public
surface invalidates every candidate-bound PASS. H7b and H13-H37 still run against one unchanged
full post-cutover SHA, but their evidence returns in that run rather than this file.
The closed schema and structural limits are defined in `docs/e2e.md`. Both reviewer dispositions
must agree: only both NA permits `scenarios=[]`; both REQUIRED derives the exact sorted unique
scenario union from support facts. No external/default scenario list is accepted.
The top-level qc/smoke/checks A/B status arrays byte-equal the corresponding review fields.
Every `support-key` is the exact slash-join of the matched fact's seven safe-ID key values. A
review key resolves to backend Herdr, the same provider, review surface, `review-turn` fixture,
and no scenarios; a scenario key resolves to backend Herdr, the same provider, E2E surface,
the scenario fixture, and exactly that scenario. Same-provider facts do not substitute.

## I3 and I5 — remote installation

These rows verify the advertised repository locator after the candidate has been
pushed by a separately authorized release action. Local-path I1/I2 coverage does
not prove that a remote client discovers the committed generated tree.

| ID  | Exact fixture                                                | Expected observation                                                                   | Fixture posture | Support     |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------- | ----------- |
| I3  | `npx skills add shkarupa-alex/meta-o`                        | All seven generated skills are discovered and installed with their owned files.        | PENDING         | UNSUPPORTED |
| I5  | `apm install shkarupa-alex/meta-o` from a disposable project | The clone resolves committed `skills/`, never authored `src/`, and installs all seven. | PENDING         | UNSUPPORTED |

The current-run result reports the public commit SHA, client/version, disposable target, exact
installed file list, cleanup, and status from the public client surface. It does not write those
facts into this map. Do not publish or change a remote merely to make a fixture runnable.

## P1-P8 — preimplementation external capability probes

These probes run in a scratch Git repository before Herdr topology implementation is treated
as supported. They prove installed external capabilities only.

| ID  | Exact fixture                                                                                                                                                       | Expected observation                                                                                                                             | Fixture posture | Support     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ----------- |
| P1  | Launch Claude and Codex through `herdr agent start` in visible panes with explicit model/effort arguments.                                                          | Both actors become ready; actual kind/process establishes different vendors; model activation is observable; direct provider launch is not used. | PENDING         | UNSUPPORTED |
| P2  | Create a review tab with `herdr tab create --cwd <repo> --label <label> --no-focus`.                                                                                | Structured output contains exactly one valid `.result.root_pane`.                                                                                | PENDING         | UNSUPPORTED |
| P3  | Split the returned root pane right, rename the injected tab, and report metadata.                                                                                   | Public right split and rename succeed without focus theft; metadata is available or cleanly non-gating.                                          | PENDING         | UNSUPPORTED |
| P4  | Capture settled state/process/input fingerprint, then submit one prompt through `herdr agent prompt --wait`.                                                        | Text and Enter are delivered atomically and at least one documented acceptance signal changes within five seconds.                               | PENDING         | UNSUPPORTED |
| P5  | Arm `herdr agent wait` without submitting input for actors that settle idle, done, blocked, and unknown.                                                            | The command returns directly on every requested state; no prompt, sleep, or polling loop is used.                                                | PENDING         | UNSUPPORTED |
| P6  | Produce long Claude and Codex interactive turns whose final submitted row is the current marker, then read `recent-unwrapped` at 120, 200, 400, 800, and 1000 rows. | Exact final marker and provider lower boundary remain structurally identifiable inside the measured envelope; no marker-free fallback is needed. | PENDING         | UNSUPPORTED |
| P7  | End a native executor goal, observe ten seconds without input, and separately trigger a spontaneous resume.                                                         | A quiet settled goal remains inactive; a resume returns to working and is never frozen as a candidate.                                           | PENDING         | UNSUPPORTED |
| P8  | Launch a process with one 130,048-byte UTF-8 argument on the supported local platform and Linux.                                                                    | The complete single argument arrives byte-identically; the next-over-boundary control fails where expected.                                      | PENDING         | UNSUPPORTED |

Fewer than two passing P1 vendors, a missing P2 root pane, or any other required failed probe
stops adoption of the Herdr actor surface. It does not authorize an inline, headless, SDK-turn,
or private-transcript fallback.

## H7b — host-window resize

| ID  | Exact fixture                                                                                                         | Expected observation                                                                                                                               | Fixture posture | Support     |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- |
| H7b | Resize the host window while a post-cutover interactive extraction is being assembled, then repeat at fixed geometry. | The implementation either preserves proven row/boundary identity or invalidates the assembly to UNKNOWN; it never emits a partial complete result. | PENDING         | UNSUPPORTED |

## H13-H37 — post-cutover Herdr acceptance

### Visible topology and actors

| ID  | Exact fixture                                                                                   | Expected observation                                                                                                                               | Fixture posture | Support     |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- |
| H13 | Build executor-right topology, A-root/B-right review tab, and a partial-failure case.           | Exact commands/layout, no focus theft or moves, valid labels/names, one layout retry, and owned remnants remain visible.                           | PENDING         | UNSUPPORTED |
| H14 | Run posture self-check, launch two providers natively, and exercise trust/permission readiness. | Complete non-divergent resolution matrix and ordinary interactive actors; trust behavior is live evidence rather than inferred from shell posture. | PENDING         | UNSUPPORTED |
| H15 | Give executor and reviewers two role-specific turns without restarting their panes.             | Each role retains only its own warm context and pane identity throughout the uninterrupted run.                                                    | PENDING         | UNSUPPORTED |

### Goals, extraction, and protocol size

| ID  | Exact fixture                                                                                                                                                                            | Expected observation                                                                                                                                                                   | Fixture posture | Support     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- |
| H16 | Settle a native goal carrying the exact executor capsule, observe the ten-second quiet period, re-arm after working, and deliver the maximum portable relay prompt.                      | A fresh executor can emit a valid handoff from the capsule alone; review begins only after quiet inactive settlement; healthy work re-arms; the maximum relay prompt is accepted once. | PENDING         | UNSUPPORTED |
| H17 | Exercise the 120/200/400/800/1000 extraction ladder with echoed inbound protocol rows, final current-turn marker, structural Claude/Codex boundaries, and H7b.                           | Only bytes after the final marker are eligible output; exactly one handoff is selected byte-for-byte; absent/stale/duplicate markers or boundaries produce UNKNOWN.                    | PENDING         | UNSUPPORTED |
| H18 | Produce one actor-format violation and one reproducible structural extraction failure.                                                                                                   | Noncompliance gets one compact reissue without changing support; only the exact isolated structural fixture may change support.                                                        | PENDING         | UNSUPPORTED |
| H19 | Return six first-pass FINDINGS parts and one-part outcomes; exercise adjacent suffixes beyond `Number.MAX_SAFE_INTEGER`, reversed/duplicate IDs, interleaved A/B, and a B-before-A list. | Outcomes stay within bounds; canonical mixed lists are the complete increasing-BigInt A block then B block; reviewer-origin lists are single-prefix; every other order fails closed.   | PENDING         | UNSUPPORTED |

### Review independence and relay

| ID  | Exact fixture                                                                                                                                                                                                                      | Expected observation                                                                                                                                                                                                               | Fixture posture | Support     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- |
| H20 | Complete all A parts, recheck candidate, then start B with no A bytes; run PASS/PASS and at-least-one-FINDINGS barriers.                                                                                                           | A-before-B independence holds; PASS/PASS proceeds without relay, while a findings barrier atomically releases the complete A/B pair.                                                                                               | PENDING         | UNSUPPORTED |
| H21 | Have A mutate the worktree in a check, and separately have B mutate it.                                                                                                                                                            | A reports finding/check failure and short-circuits before B; B preserves both complete results; dirt never becomes a candidate.                                                                                                    | PENDING         | UNSUPPORTED |
| H22 | Make both reviewers run QC, smoke and checks; exercise agreeing REQUIRED and NA dispositions plus both one-NA mismatch directions.                                                                                                 | Ordered gate arrays and A/B structural review evidence obey 6/1000/61,440 limits; a mismatch re-prompts only the NA reviewer once, change-to-REQUIRED proceeds, and repeated NA returns `needs_attention:e2e_disposition_dispute`. | PENDING         | UNSUPPORTED |
| H23 | Relay bodies containing Unicode, repeated frame-like lines, leading/trailing whitespace, and no final newline.                                                                                                                     | Executor receives every raw UTF-8 byte unchanged; NUL and invalid UTF-8 are rejected.                                                                                                                                              | PENDING         | UNSUPPORTED |
| H24 | Exercise every relay direction, final current-turn marker, multi-target adjudication, repository-changing human answer, one-row E2E approval request/approval, mixed-origin rejection, collisions, argv limit, and ambiguity.      | Human marker is last; independent approval operation and actor equal the returned header/native recipient; wrong-operation/actor/scenario/replay fails closed.                                                                     | PENDING         | UNSUPPORTED |
| H25 | For one complete-open-set RESPONSE, exercise subset/superset rejection, mixed close/dispute with retained-closed, missing-dispute and extra-open variants, all-dispute, all-close, close-all-plus-new, invalidation, and blockers. | RESPONSE equals full origin-open rebuts; mixed OUTCOMES has byte-exact `open=disputes`; only validated disputes become targets, and every divergent open set fails closed.                                                         | PENDING         | UNSUPPORTED |

### Candidate lifecycle

| ID  | Exact fixture                                                                                                                                                       | Expected observation                                                                                                                             | Fixture posture | Support     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ----------- |
| H26 | Build the closed final-result record, then mutate field order/keys, clean SHA, gates, support, review evidence, scenario derivation/order/ordinals and limits.      | Exact six-field schema passes only for clean unchanged HEAD; every extra/missing/generic/FAIL/UNKNOWN or non-derived scenario fact fails closed. | PENDING         | UNSUPPORTED |
| H27 | Create a new commit after at least one passing gate.                                                                                                                | Every old gate and old-candidate open ID is invalidated before further completion.                                                               | PENDING         | UNSUPPORTED |
| H28 | Lose an actor once, lose a pane once, then repeat the same loss.                                                                                                    | New ordinary sessions start in visible panes with the ID floor; first loss restarts the gate and repeated loss reaches attention.                | PENDING         | UNSUPPORTED |
| H29 | Test fallback outcomes and 1..16 exact seven-field support facts, including unsafe IDs, duplicates, key misordering, >32 scenarios, and missing topology providers. | Fallback outcomes remain distinct; only canonical SUPPORTED facts cover the selected topology and may derive final scenarios.                    | PENDING         | UNSUPPORTED |

### Firewall, attention, and scratch

| ID  | Exact fixture                                                                                                                                                                          | Expected observation                                                                                                                                                                                                         | Fixture posture | Support     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- |
| H30 | Trigger every valid/invalid repository-changing human answer, E2E approval request/approval, watchdog-start decision, human dispute decision, generic blocked UI, and harness failure. | Repository-changing input reaches executor/new SHA; only a validated visible request creates a token; exact-scenario E2E approval resumes unchanged SHA; watchdog stays with orchestrator; invalid combinations fail closed. | PENDING         | UNSUPPORTED |
| H31 | Place canaries in tracked spec/source/test files and audit orchestrator-visible commands/context during a complete run.                                                                | Repository-reading actors observe required canaries; the orchestrator never opens, searches, quotes, summarizes, or edits them after activation.                                                                             | PENDING         | UNSUPPORTED |
| H32 | Project both final aggregate envelopes from a mixed close/dispute outcome, then inspect refcounts/outcomes through cumulative limits, cleanup, ambiguity, recovery, exit, and loss.    | Projection/count use only validated disputes, never closed rebuttal IDs; over-limit framing/body fails closed and exact shared references survive.                                                                           | PENDING         | UNSUPPORTED |

### Diversity, waits, and edge failures

| ID  | Exact fixture                                                                                                                                                           | Expected observation                                                                                                                                 | Fixture posture | Support     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- |
| H33 | Launch executor and both reviewers with configured routes and inspect actual kinds/processes.                                                                           | Reviewer vendors differ and at least one differs from the executor; labels or configured strings alone do not count.                                 | PENDING         | UNSUPPORTED |
| H34 | Keep one actor healthy beyond wait arms; exercise unknown retry, ambiguity, equivalent permuted open-ID sets for a repeated terminal key, and concurrent wait.          | One waiter re-arms without runtime cap; A-then-B canonicalization makes permutations one key; retry/no-progress bounds prevent duplicate submission. | PENDING         | UNSUPPORTED |
| H35 | Make metadata reporting succeed and fail around otherwise identical passing runs.                                                                                       | Content-free badges improve visibility but never change surface support or gate result.                                                              | PENDING         | UNSUPPORTED |
| H36 | Remove or make `develop` unusable before candidate validation.                                                                                                          | Run ends in attention with no branch fallback and no candidate claim.                                                                                | PENDING         | UNSUPPORTED |
| H37 | Relay a mixed close/dispute outcome, then obtain mixed, all-withdraw, unresolved, and oversize-then-retry peer results under projected envelopes and shrinking budgets. | Requests, projection, outer finding, count, and ordered results equal outcome disputes only; full rebuts remains accounting; routing/budgets hold.   | PENDING         | UNSUPPORTED |

## Omnigent final fixtures

These fixtures use only native Omnigent sessions and output surfaces. A Herdr fixture cannot
satisfy them.

| ID  | Exact fixture                                                                                                                                                                        | Expected observation                                                                                                                             | Fixture posture | Support     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ----------- |
| OM1 | Run with tracked canaries after backend activation.                                                                                                                                  | Orchestrator context obeys the same tracked-content firewall.                                                                                    | PENDING         | UNSUPPORTED |
| OM2 | Produce a clean full-SHA candidate and assemble the exact six-field final-result record with gates, support, reviews and derived scenarios.                                          | Native public facts obey all closed keys/orders/limits; dirty/new HEAD, missing support/evidence, generic prose, FAIL or UNKNOWN is invalid.     | PENDING         | UNSUPPORTED |
| OM3 | Run sequential different-vendor A and B first passes, PASS/PASS, findings-barrier, and A-mutating-check cases.                                                                       | B sees no A bytes; PASS/PASS proceeds without relay; a findings pair releases atomically; A invalidation never starts B.                         | PENDING         | UNSUPPORTED |
| OM4 | Relay A-then-B unbounded adjacent numeric IDs through a mixed complete-origin-open outcome and disputes-only adjudication; reject interleaved/reversed-prefix lists.                 | Mixed OUTCOMES has exact `open=disputes`; global A-block/B-block and within-block BigInt ordering are exact; only disputes enter atomic routing. | PENDING         | UNSUPPORTED |
| OM5 | Commit a fix after a gate.                                                                                                                                                           | Every gate and old-candidate ID is invalidated.                                                                                                  | PENDING         | UNSUPPORTED |
| OM6 | Continue/recover native role sessions without private state.                                                                                                                         | Role continuity is proven through native surfaces or the route stays unsupported.                                                                | PENDING         | UNSUPPORTED |
| OM7 | Exercise the weaker prompt objective, byte-identical executor capsule, echoed inbound frames, and final current-turn marker through a fresh long executor turn.                      | A fresh executor emits a valid handoff from the capsule; only post-marker bytes are eligible current output without invented Goal transport.     | PENDING         | UNSUPPORTED |
| OM8 | Trigger ordinary choices plus every valid/invalid repository-changing answer and one-row approval-request/approval combination, including wrong operation/actor/scenario and replay. | Body-free approval must equal independently stored operation and requesting native actor on the same SHA once; watchdog remains non-relay.       | PENDING         | UNSUPPORTED |

## Adoption rule

Herdr adoption requires the current run to demonstrate P1-P8, H7b, and every applicable H13-H37
scenario on one unchanged post-cutover SHA, followed by two independent PASS reviews and
applicable E2E on that SHA. Omnigent support requires its own OM scenarios; unsupported Omnigent
posture does not borrow Herdr evidence. The map rows remain definitions/posture, not gate verdicts.

Until current-run evidence exists, the honest outcome is `needs_attention` for unavailable
harness capability, not a claim that the feature workflow is verified. The final result reports
the exact SHA and per-review/per-scenario actor/provider facts without updating this map.
