# Testing, maintenance, and operations

Read this when a claim depends on tests, legacy behavior, runtime evidence, performance,
observability, rollout, recovery, or long-term maintenance. Choose evidence by the guarantee, not by
a preferred test pyramid.

## Match the test to the guarantee

| Guarantee                                      | Useful evidence                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| pure transformation/type-independent invariant | focused unit/property examples                                                                   |
| runtime schema and error mapping               | valid, invalid, missing, adversarial boundary cases                                              |
| SQL constraints, isolation, locks, migrations  | integration tests against applicable database/version                                            |
| HTTP/event protocol behavior                   | contract tests with timeout, abort, retry, duplicate, ordering, partial failure                  |
| promises/effects/streams/resources             | deterministic coordination, stale-result, cancellation, cleanup and unhandled-error assertions   |
| SSR/hydration/browser/accessibility            | server/client render tests, real DOM/browser checks, automated plus human accessibility evidence |
| deployment/mixed client-server versions        | compatibility matrix, staged rollout, telemetry, restartable migration and rollback evidence     |
| performance/capacity                           | representative measurement with an explicit budget                                               |

Mocks prove interaction decisions, not browser, database, broker, event-loop, clock, or network
semantics. Prefer simple fakes for owned stable boundaries and real integrations where platform
behavior is the guarantee. Avoid mocks that mirror every internal call.

A behavioral defect normally deserves the cheapest reliable regression guard, but an existing
covering test, static/runtime contract, database constraint, or explicit reason may suffice.
Type-checking alone does not test runtime `unknown`; a snapshot alone does not prove semantics or
accessibility.

## Legacy and incremental change

Characterization tests capture observed behavior before risky work; they do not make all behavior
correct. Classify it as required contract, browser/runtime compatibility, migration/workaround,
unknown, or defect. Normalize and review snapshots/golden masters; keep focused semantic assertions
for important guarantees.

Introduce seams only for a concrete safe step. Every migration stage should be deployable,
observable, and removable. Feature flags need owner, rollout metric, failure action, safe default,
and expiration. Decommissioning includes importers/consumers, published versions, cached assets,
stored client data, background jobs, credentials, alerts, dependencies, and rollback window.

AI-generated JS/TS often invents APIs/exports, trusts erased types, produces tests that confirm the
bug, misses environment differences, mishandles promise ownership, or assumes package versions.
Verify those mechanisms; do not reject code solely because it was generated.

## Diagnosis and observability

Build a causal chain from symptom through state/events to violated invariant and mechanism. Separate
facts, ruled-out alternatives, and unknowns. Preserve error causes and useful context without
leaking secrets. Do not turn diagnosis-only work into an unrequested fix.

Observability should answer questions such as:

- Which operation, tenant, route, browser/runtime, build, or deployed version failed?
- Is time spent in event-loop blocking, network, database, render, hydration, queueing, or retries?
- Can we see backlog, saturation, duplicate suppression, stale clients, migration progress, and
  rollback signals?

Use bounded-cardinality metrics, privacy-aware logs/events, and traces across meaningful boundaries.
Client telemetry is external input: validate, sample, protect privacy, and expect blocking/loss.
Audit trails require actor/action/subject semantics, retention, access control, tamper expectations,
and privacy.

After observed failure or repeated change pain, add a durable mechanism tied to the cause:
regression test, contract check, architecture fitness rule, actionable telemetry, safer boundary,
rollback, deletion, or simplification. Avoid generic monitoring/testing slogans.

## Performance and capacity

Define representative workload and budgets for responsiveness, latency, throughput, memory,
bundle/network cost, or server capacity. Measure first. Inspect algorithmic work, event-loop long
tasks, render causes, allocations, serialization, query plans, pools, stream buffering, bundle
composition, caching economics, and downstream limits. Optimize the demonstrated bottleneck and
remeasure. Type-level or architectural sophistication is not performance evidence.

## Release and recovery

For risky changes, define readiness/failure signals, staged exposure, compatibility window,
rollback/forward-repair, and removal criteria. Cached frontends and mixed backend versions make
compatibility a real deployment state. Shadow/dual-run comparisons must contain side effects and
compare meaningful outcomes.

Treat flakes as evidence of shared state, timing, order, resource leaks, nondeterminism, environment
differences, or wrong waits. Quarantine only with owner and deadline; blind reruns are not
reliability.

## Non-findings

Do not require end-to-end tests for pure logic, a browser for environment-independent functions,
tracing without an operational question, a performance rewrite without measurement, or release
ceremony for a trivial reversible edit. State evidence limits rather than claiming verification.

## Focused example

A frontend test resolves fetches only in request order, so it cannot reveal stale results. Control
two promises, resolve the newer request first and the older one second, and assert that only the
current result renders and obsolete work is aborted or ignored. Keep a browser test only if
framework/DOM scheduling is part of the guarantee.

```ts
search("old");
search("new");
newRequest.resolve(newResults);
oldRequest.resolve(oldResults); // Must not overwrite the current view.
```

Out-of-order control is unnecessary for a synchronous pure filter; it matters when independently
completing effects can reach the same state owner.
