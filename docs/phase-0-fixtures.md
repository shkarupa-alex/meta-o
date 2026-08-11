# Capability and agentic fixtures

This document is the evidence ledger for
`spec/2026-08-08-herdr-orchestrator-operational-corrections/spec-review.md`.
It contains planned exact fixtures, not historical anecdotes and not inferred support.

## Status rules

- **PENDING** means the exact fixture has not produced evidence for the named post-cutover
  candidate.
- **PASS** requires complete evidence in this table, including the exact surface support key
  and full SHA when the scenario is candidate-bound.
- **FAIL** means the exact fixture ran and disproved its expected behavior.
- **UNKNOWN** means the fixture ran but its complete result could not be read.
- **UNSUPPORTED** is the support status before PASS, or after an exact fixture proves the
  surface unusable.

Actor prose, an incidental live failure, an older provider version, and evidence from another
surface never change a support key. Historical inline/headless captures are deliberately
absent: that Herdr route is removed by the cutover and cannot prove the visible interactive
actor surface.

The current implementation session does not have `HERDR_ENV=1`. All Herdr fixtures are
therefore PENDING and their current surface support is UNSUPPORTED. No live PASS is claimed
below.

## Evidence record

Each completed row must add:

```text
candidate: <full SHA or preimplementation>
support-key: <backend/provider/provider-version/backend-version/surface/os>
commands: <exact public commands, with secrets omitted>
observed: <complete narrow evidence>
cleanup: <what was stopped or removed>
status: PASS | FAIL | UNKNOWN
date: <YYYY-MM-DD>
```

A preimplementation record never becomes candidate evidence. H7b and H13-H37 require the same full
post-cutover SHA.

## I3 and I5 — remote installation

These rows verify the advertised repository locator after the candidate has been
pushed by a separately authorized release action. Local-path I1/I2 coverage does
not prove that a remote client discovers the committed generated tree.

| ID  | Exact fixture                                                | Expected observation                                                                   | Run status                        | Support     |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------- | ----------- |
| I3  | `npx skills add shkarupa-alex/meta-o`                        | All seven generated skills are discovered and installed with their owned files.        | PENDING — candidate is not remote | UNSUPPORTED |
| I5  | `apm install shkarupa-alex/meta-o` from a disposable project | The clone resolves committed `skills/`, never authored `src/`, and installs all seven. | PENDING — candidate is not remote | UNSUPPORTED |

Evidence for each row records the public commit SHA, client/version, disposable
target, exact installed file list, cleanup, date, and exit status. Do not publish
or change a remote merely to make a fixture runnable.

## P1-P8 — preimplementation external capability probes

These probes run in a scratch Git repository before Herdr topology implementation is treated
as supported. They prove installed external capabilities only.

| ID  | Exact fixture                                                                                                                                                       | Expected observation                                                                                                                             | Run status                     | Support     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ----------- |
| P1  | Launch Claude and Codex through `herdr agent start` in visible panes with explicit model/effort arguments.                                                          | Both actors become ready; actual kind/process establishes different vendors; model activation is observable; direct provider launch is not used. | PENDING — no Herdr environment | UNSUPPORTED |
| P2  | Create a review tab with `herdr tab create --cwd <repo> --label <label> --no-focus`.                                                                                | Structured output contains exactly one valid `.result.root_pane`.                                                                                | PENDING — no Herdr environment | UNSUPPORTED |
| P3  | Split the returned root pane right, rename the injected tab, and report metadata.                                                                                   | Public right split and rename succeed without focus theft; metadata is available or cleanly non-gating.                                          | PENDING — no Herdr environment | UNSUPPORTED |
| P4  | Capture settled state/process/input fingerprint, then submit one prompt through `herdr agent prompt --wait`.                                                        | Text and Enter are delivered atomically and at least one documented acceptance signal changes within five seconds.                               | PENDING — no Herdr environment | UNSUPPORTED |
| P5  | Arm `herdr agent wait` without submitting input for actors that settle idle, done, blocked, and unknown.                                                            | The command returns directly on every requested state; no prompt, sleep, or polling loop is used.                                                | PENDING — no Herdr environment | UNSUPPORTED |
| P6  | Produce long Claude and Codex interactive turns whose final submitted row is the current marker, then read `recent-unwrapped` at 120, 200, 400, 800, and 1000 rows. | Exact final marker and provider lower boundary remain structurally identifiable inside the measured envelope; no marker-free fallback is needed. | PENDING — no Herdr environment | UNSUPPORTED |
| P7  | End a native executor goal, observe ten seconds without input, and separately trigger a spontaneous resume.                                                         | A quiet settled goal remains inactive; a resume returns to working and is never frozen as a candidate.                                           | PENDING — no Herdr environment | UNSUPPORTED |
| P8  | Launch a process with one 130,048-byte UTF-8 argument on the supported local platform and Linux.                                                                    | The complete single argument arrives byte-identically; the next-over-boundary control fails where expected.                                      | PENDING — no Herdr environment | UNSUPPORTED |

Fewer than two passing P1 vendors, a missing P2 root pane, or any other required failed probe
stops adoption of the Herdr actor surface. It does not authorize an inline, headless, SDK-turn,
or private-transcript fallback.

## H7b — host-window resize

| ID  | Exact fixture                                                                                                         | Expected observation                                                                                                                               | Run status                                  | Support     |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------- |
| H7b | Resize the host window while a post-cutover interactive extraction is being assembled, then repeat at fixed geometry. | The implementation either preserves proven row/boundary identity or invalidates the assembly to UNKNOWN; it never emits a partial complete result. | PENDING — no Herdr environment or candidate | UNSUPPORTED |

## H13-H37 — post-cutover Herdr acceptance

### Visible topology and actors

| ID  | Exact fixture                                                                                   | Expected observation                                                                                                                               | Run status | Support     |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| H13 | Build executor-right topology, A-root/B-right review tab, and a partial-failure case.           | Exact commands/layout, no focus theft or moves, valid labels/names, one layout retry, and owned remnants remain visible.                           | PENDING    | UNSUPPORTED |
| H14 | Run posture self-check, launch two providers natively, and exercise trust/permission readiness. | Complete non-divergent resolution matrix and ordinary interactive actors; trust behavior is live evidence rather than inferred from shell posture. | PENDING    | UNSUPPORTED |
| H15 | Give executor and reviewers two role-specific turns without restarting their panes.             | Each role retains only its own warm context and pane identity throughout the uninterrupted run.                                                    | PENDING    | UNSUPPORTED |

### Goals, extraction, and protocol size

| ID  | Exact fixture                                                                                                                                                       | Expected observation                                                                                                                                                                   | Run status | Support     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| H16 | Settle a native goal carrying the exact executor capsule, observe the ten-second quiet period, re-arm after working, and deliver the maximum portable relay prompt. | A fresh executor can emit a valid handoff from the capsule alone; review begins only after quiet inactive settlement; healthy work re-arms; the maximum relay prompt is accepted once. | PENDING    | UNSUPPORTED |
| H17 | Exercise the 120/200/400/800/1000 extraction ladder with echoed inbound protocol rows, final current-turn marker, structural Claude/Codex boundaries, and H7b.      | Only bytes after the final marker are eligible output; exactly one handoff is selected byte-for-byte; absent/stale/duplicate markers or boundaries produce UNKNOWN.                    | PENDING    | UNSUPPORTED |
| H18 | Produce one actor-format violation and one reproducible structural extraction failure.                                                                              | Noncompliance gets one compact reissue without changing support; only the exact isolated structural fixture may change support.                                                        | PENDING    | UNSUPPORTED |
| H19 | Return six first-pass FINDINGS parts at cumulative limits and one-part FOLLOWUP/OUTCOMES/DISPUTED outcomes, then exceed every bound.                                | FINDINGS alone assembles multipart; each response outcome is one part at most 24,576 bytes; exceeded or malformed bounds become UNKNOWN.                                               | PENDING    | UNSUPPORTED |

### Review independence and relay

| ID  | Exact fixture                                                                                                                                                                                                                 | Expected observation                                                                                                                                                                                 | Run status | Support     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| H20 | Complete all A parts, recheck candidate, then start B with no A bytes; run PASS/PASS and at-least-one-FINDINGS barriers.                                                                                                      | A-before-B independence holds; PASS/PASS proceeds without relay, while a findings barrier atomically releases the complete A/B pair.                                                                 | PENDING    | UNSUPPORTED |
| H21 | Have A mutate the worktree in a check, and separately have B mutate it.                                                                                                                                                       | A reports finding/check failure and short-circuits before B; B preserves both complete results; dirt never becomes a candidate.                                                                      | PENDING    | UNSUPPORTED |
| H22 | Make both reviewers run QC, smoke, and applicable additional checks.                                                                                                                                                          | Each complete PASS independently carries actual PASS/NA fields for the frozen candidate.                                                                                                             | PENDING    | UNSUPPORTED |
| H23 | Relay bodies containing Unicode, repeated frame-like lines, leading/trailing whitespace, and no final newline.                                                                                                                | Executor receives every raw UTF-8 byte unchanged; NUL and invalid UTF-8 are rejected.                                                                                                                | PENDING    | UNSUPPORTED |
| H24 | Exercise every relay direction, final current-turn marker, multi-target adjudication, repository-changing human answer, one-row E2E approval request/approval, mixed-origin rejection, collisions, argv limit, and ambiguity. | Human marker is last; independent approval operation and actor equal the returned header/native recipient; wrong-operation/actor/scenario/replay fails closed.                                       | PENDING    | UNSUPPORTED |
| H25 | For one same-origin complete-open-set multi-ID RESPONSE, exercise subset/superset rejection, all-close PASS, mixed OUTCOMES, all-dispute DISPUTED, and close-all-plus-new FOLLOWUP, plus A-only invalidation and blockers.    | RESPONSE equals the complete current origin-open set; disjoint closes/disputes partition exact rebuts; FOLLOWUP closes all before new IDs; every total outcome, ID floor, and blocker mapping holds. | PENDING    | UNSUPPORTED |

### Candidate lifecycle

| ID  | Exact fixture                                                                                                                            | Expected observation                                                                                                              | Run status | Support     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| H26 | Drive both reviews and applicable E2E to PASS on one clean candidate.                                                                    | Final `HEAD`, every header candidate, and every gate equal the same full object ID.                                               | PENDING    | UNSUPPORTED |
| H27 | Create a new commit after at least one passing gate.                                                                                     | Every old gate and old-candidate open ID is invalidated before further completion.                                                | PENDING    | UNSUPPORTED |
| H28 | Lose an actor once, lose a pane once, then repeat the same loss.                                                                         | New ordinary sessions start in visible panes with the ID floor; first loss restarts the gate and repeated loss reaches attention. | PENDING    | UNSUPPORTED |
| H29 | Test configured, same-route role, first catalogue, and cross-route fallbacks under catalogue unknown, missing model, and launch failure. | Fallback order is finite, failed pairs are skipped, actual launches recheck diversity, and outcome classes remain distinct.       | PENDING    | UNSUPPORTED |

### Firewall, attention, and scratch

| ID  | Exact fixture                                                                                                                                                                                    | Expected observation                                                                                                                                                                                                         | Run status | Support     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| H30 | Trigger every valid/invalid repository-changing human answer, E2E approval request/approval, watchdog-start decision, human dispute decision, generic blocked UI, and harness failure.           | Repository-changing input reaches executor/new SHA; only a validated visible request creates a token; exact-scenario E2E approval resumes unchanged SHA; watchdog stays with orchestrator; invalid combinations fail closed. | PENDING    | UNSUPPORTED |
| H31 | Place canaries in tracked spec/source/test files and audit orchestrator-visible commands/context during a complete run.                                                                          | Repository-reading actors observe required canaries; the orchestrator never opens, searches, quotes, summarizes, or edits them after activation.                                                                             | PENDING    | UNSUPPORTED |
| H32 | Project both final aggregate envelopes, then inspect refcounts and peer outcomes approaching/exceeding the 122,880-byte cumulative ceiling through cleanup, ambiguity, recovery, exit, and loss. | Projection over 7,168 stops before acceptance; each remaining budget decreases by retained bytes; final payload fits 130,048 or fails closed.                                                                                | PENDING    | UNSUPPORTED |

### Diversity, waits, and edge failures

| ID  | Exact fixture                                                                                                                                                             | Expected observation                                                                                                                                         | Run status | Support     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------- |
| H33 | Launch executor and both reviewers with configured routes and inspect actual kinds/processes.                                                                             | Reviewer vendors differ and at least one differs from the executor; labels or configured strings alone do not count.                                         | PENDING    | UNSUPPORTED |
| H34 | Keep one actor healthy beyond several wait arms; exercise unknown retry, prompt ambiguity, repeated terminal key, and concurrent-wait attempt.                            | One direct waiter re-arms without runtime cap; retries/no-progress are bounded; no sleep/polling or duplicate submission occurs.                             | PENDING    | UNSUPPORTED |
| H35 | Make metadata reporting succeed and fail around otherwise identical passing runs.                                                                                         | Content-free badges improve visibility but never change surface support or gate result.                                                                      | PENDING    | UNSUPPORTED |
| H36 | Remove or make `develop` unusable before candidate validation.                                                                                                            | Run ends in attention with no branch fallback and no candidate claim.                                                                                        | PENDING    | UNSUPPORTED |
| H37 | Relay one multi-ID outcome and sequentially obtain mixed, all-withdraw, unresolved, and oversize-then-retry peer results under projected envelopes and shrinking budgets. | Both routes preflight; each prompt states remaining and `min(65536, remaining)`; rejected oversize retry keeps the same remaining; final aggregate rechecks. | PENDING    | UNSUPPORTED |

## Omnigent final fixtures

These fixtures use only native Omnigent sessions and output surfaces. A Herdr fixture cannot
satisfy them.

| ID  | Exact fixture                                                                                                                                                                        | Expected observation                                                                                                                             | Run status | Support     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------- |
| OM1 | Run with tracked canaries after backend activation.                                                                                                                                  | Orchestrator context obeys the same tracked-content firewall.                                                                                    | PENDING    | UNSUPPORTED |
| OM2 | Produce and freeze a clean full-SHA candidate.                                                                                                                                       | All native results and Git metadata bind to that candidate.                                                                                      | PENDING    | UNSUPPORTED |
| OM3 | Run sequential different-vendor A and B first passes, PASS/PASS, findings-barrier, and A-mutating-check cases.                                                                       | B sees no A bytes; PASS/PASS proceeds without relay; a findings pair releases atomically; A invalidation never starts B.                         | PENDING    | UNSUPPORTED |
| OM4 | Relay a complete-origin-open response through total outcomes and sequential adjudication under projected aggregate envelopes and a shrinking retained-body budget.                   | Both envelope routes fit before the first result; exact remaining prompts cap each result; final complete prompt rechecks before atomic routing. | PENDING    | UNSUPPORTED |
| OM5 | Commit a fix after a gate.                                                                                                                                                           | Every gate and old-candidate ID is invalidated.                                                                                                  | PENDING    | UNSUPPORTED |
| OM6 | Continue/recover native role sessions without private state.                                                                                                                         | Role continuity is proven through native surfaces or the route stays unsupported.                                                                | PENDING    | UNSUPPORTED |
| OM7 | Exercise the weaker prompt objective, byte-identical executor capsule, echoed inbound frames, and final current-turn marker through a fresh long executor turn.                      | A fresh executor emits a valid handoff from the capsule; only post-marker bytes are eligible current output without invented Goal transport.     | PENDING    | UNSUPPORTED |
| OM8 | Trigger ordinary choices plus every valid/invalid repository-changing answer and one-row approval-request/approval combination, including wrong operation/actor/scenario and replay. | Body-free approval must equal independently stored operation and requesting native actor on the same SHA once; watchdog remains non-relay.       | PENDING    | UNSUPPORTED |

## Adoption rule

Herdr adoption requires P1-P8, H7b, and every applicable H13-H37 row to PASS one unchanged
post-cutover SHA, followed by two independent PASS reviews and applicable E2E on that SHA.
Omnigent support requires its own OM rows; unsupported Omnigent status does not borrow Herdr
evidence.

Until those records exist, the honest outcome is `needs_attention` for unavailable harness
capability, not a claim that the feature workflow is verified.
