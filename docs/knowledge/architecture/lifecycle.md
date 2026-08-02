# Architecture — the lifecycle of one feature

## §A-RUN-LIFECYCLE — One explicit phase machine, and routing computed from state

Implements §B-WORKFLOW-01.

The orchestrator is a model. Asked to remember which stabilization loop it is
in, which attestations a fix invalidated, and what should happen next, it will
eventually answer plausibly and wrongly — and the wrong answers are expensive:
two heavy reviews spent on a candidate whose E2E is already broken, or a
completion granted on four attestations belonging to three different snapshots.

So the phase machine is explicit and its transitions are enumerated
(`src/core/fsm.mts`), and the next step is *computed* from state by `routeNext`
rather than recalled. `COMPLETE` is reachable from exactly one phase; every
other terminal state is reachable from anywhere, because failure is not
scheduled but success has a route.

The alternative — letting the prompt hold the state machine — was rejected: it
makes every recovery a matter of how good the summary was.

## §A-IMMUTABLE-SPEC — The spec is pinned to bytes before anything else happens

Implements §B-WORKFLOW-01.

A run's acceptance oracle must not move while the run is judged against it. The
first thing `run start` does is copy the spec's bytes into an immutable blob
inside the run directory and record their sha256 (`src/core/spec-input.mts`).

This is what makes the executor's final act safe: deleting the tracked spec file
once its durable requirements have been absorbed into project knowledge. The
reviewers still have the oracle; the repository is not left with a growing pile
of historical intent documents.

The deletion is enforced where it is reviewable. `run set-candidate` refuses a
candidate that still tracks the spec (`spec_not_retired`), so retirement lands
inside the window the reviewers attest rather than after it. Retiring afterwards
would change the tree that four parties signed, and retiring never would leave
the acceptance oracle in the repository competing with the knowledge layer that
is supposed to have replaced it.

It also bounds the risk of external specs — HTTPS only, at most three redirects,
at most 10 MiB decompressed, never executed.

## §A-E2E-SELECTION — The plan is chosen before review, and reviewed as content

Implements §B-WORKFLOW-01.

Deciding *which* end-to-end scenarios matter for a change is a judgement about
risk, and judgements are what reviewers are for. So the E2E tester produces a
selection plan against the finished candidate, the plan is sealed with a digest,
and both reviewers attest its completeness (`selectionPlanVerdict`).

The orchestrator checks only schema and digest. It has no basis for an opinion
about coverage and must not pretend to one.

The catalog guarantees the floor: at least one scenario is `always_required`, so
an empty plan is not expressible.

## §A-EXECUTABLE-ACCEPTANCE — Acceptance criteria are tests, not prose

Implements §B-WORKFLOW-01.

Almost every claim in this methodology is about behaviour under adverse
conditions: a crash between two effects, a symlinked state directory, a rebase
that preserves a tree, a formatter that mutates the worktree it was judging.
Prose cannot hold those honest, and mocks would only prove the mocks.

The suite therefore builds real Git repositories, real state trees with real
permission bits, and a scripted stand-in that speaks the backend's actual
protocol (`tests/`). Where a spec lists an acceptance test, there is a test with
that name.
