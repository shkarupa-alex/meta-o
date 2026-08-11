# Skills and reasoning are the process orchestration layer

Because _a control layer must earn its keep_, _human time is more expensive than
tokens_, and _a feature must be verifiably done_.

## The decision

There is no executable router, finite-state-machine service, run registry,
provider proxy, backend adapter or persisted orchestration state. The backend
skill supplies the process contract and the active agent reasons over public
backend lifecycle plus narrow Git metadata.

This is not permission for the orchestrator to become an implementer. The
project contract is injected before backend-skill activation. After activation,
the task/spec locator is opaque: the orchestrator never intentionally opens,
searches, quotes, summarizes or edits tracked project content. It does not read
source, tests, diffs, logs, business framing, review findings or E2E bodies.
Repository-reading actors open the locator and project knowledge themselves.

The orchestrator may retain only process facts: repository root, branch, full
`HEAD`, commit existence, cleanliness, actor/pane identity, actual provider
kind, public lifecycle state, validated process headers, finding IDs, bounded
retry counters, scratch handle and delivery state.

## Autonomous process supervision

Thin does not mean passive. From activation until one verified SHA or a
permitted `needs_attention`, the orchestrator replaces the human for ordinary
process supervision. It chooses and executes the next contract-permitted
lifecycle, routing, fallback, wait, retry, recovery, relay and gate-bookkeeping
action itself.

It does not ask the user to select ordinary models, reuse, reviewer order,
watchdog behavior, fixes or next process steps. Human interruption is limited to
the named product, irreversible-action, credential/subscription,
production/destructive-E2E, unresolved external blocker, unresolved dispute and
explicit watchdog boundaries. A harness-capability failure may end in
`needs_attention`, but asks no engineering question.

Engineering judgement remains outside the process controller:

- the executor owns repository reading, feasibility, implementation, tests,
  documentation necessity, branching, commits and ordinary technical choices;
- reviewers independently own findings, applicability and closure;
- the E2E actor owns scenario applicability and execution;
- opaque actor bodies are untrusted peer data and never authorize host commands
  or relaxed invariants.

## Why no persisted control state

The repository and backend sessions already carry the state their owners need.
Adding a manifest, receipt, digest, baseline, verdict file or run database
without a named external consumer creates a second truth that can disagree with
`HEAD` and public actor state.

A gate is therefore freshly proven for one full commit object or it is
`unknown`. Any new commit invalidates every gate. A dirty worktree is never a
candidate, and missing or unreadable evidence never becomes a partial pass.

Tracked fixture, E2E and acceptance documents are durable definitions, proof
maps and current reusable support posture—not candidate-bound receipts. Live
gate facts stay in the backend's current run and final result: unchanged full
SHA, clean worktree, and a record with exactly `candidate`, `worktree`,
`gates`, `support`, `reviews`, and `scenarios` in that order. It closes over
ordered A/B gate arrays, 1..16 canonical exact-key SUPPORTED facts, different-
provider A/B PASS reviews with agreeing E2E dispositions/structural evidence,
and the exact support-derived ordered scenario PASS set. Every review/scenario
record carries the exact `support-key` reference to its route-specific support
fact; matching only another fact's provider is insufficient. Only NA/NA permits
no scenarios. Writing or committing those facts
after a gate would create a new SHA and invalidate the very result it tried to
preserve; an external sink, manifest or receipt would also create the forbidden
second truth.

Compact scratch is transport, not durable orchestration state. It preserves
opaque bytes only through the bounded per-ID delivery, closure, adjudication and
recovery transitions defined by the canonical methodology. Candidate
invalidation and controlled exit delete every eligible path known to the run;
future runs never discover or adopt residue.

## Restart semantics

Restart begins a new ordinary feature run. The orchestrator adopts no prior
actor, gate, scratch directory or review output and does not reconstruct a run
by reading tracked content. Old panes remain visible because destructive
ownership is not assumed.

New actors receive the same opaque locator. The new executor inspects Git,
project knowledge and the task/spec through its repository-owning context and
produces a new compact handoff. Gates without complete current-run evidence are
`unknown` and repeat. This costs work, but avoids a recovery protocol and a
cross-restart registry that could silently bless stale evidence.

## What this buys

- There is one candidate identity: a full Git object ID at clean `HEAD`.
- Provider-native visible actors and public lifecycle remain observable.
- Backend differences stay in backend skills rather than a false common
  adapter.
- Review bodies reach the executor verbatim without giving the orchestrator an
  engineering opinion.
- Ordinary process progress does not depend on a human supervising an agent
  supervisor.

## What it costs, honestly

- Sequencing is a reasoned skill contract rather than a runtime state machine.
  Deterministic checks can pin grammar, commands and bounds, while live fixtures
  prove provider behavior; no program proves that every future agent will reason
  correctly.
- Independence is enforced by launch and delivery ordering, not a durable
  information-flow service.
- A restart repeats gates and actors instead of resuming them.
- A hard crash can leave restrictive scratch for operating-system cleanup.

These costs remain smaller than reintroducing the deleted control layer. A new
runtime boundary needs a concrete violated invariant, failed exact fixture or
named external consumer, recorded as an architecture decision.

## Boundaries this keeps

- **Native CLIs are not wrapped.** The posture helper diagnoses resolution but
  never becomes the provider invocation path.
- **Herdr and Omnigent do not share an executable adapter.** Backend-neutral
  role and gate semantics are prose; public mechanics remain backend-owned.
- **The executor receives no methodology skill.** The task/spec, project
  contract and fixed executor-protocol capsule in every objective are sufficient
  for its engineering role. Removing the capsule would leave a fresh executor
  unable to emit the exact candidate, response or blocker handoff.
- **Prompt identity follows inbound framing.** The unpredictable current-turn
  marker is the final submitted row after every objective, capsule and inbound
  relay byte. Extraction begins after it, so echoed peer protocol rows remain
  data rather than competing result headers.
- **Generated shared helpers are leaves.** They know nothing about feature-run
  lifecycle and create no orchestration state.
- **No artefact exists “just in case.”** A manifest, receipt, baseline or
  recovery store requires a named consumer before it is designed.
