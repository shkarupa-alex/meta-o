# Testing, maintenance, and operations

Read this when a claim depends on tests, legacy behavior, runtime evidence, performance, observability, rollout, recovery, or long-term maintenance. Choose evidence by the guarantee, not by a preferred test pyramid.

## Match the test to the guarantee

| Guarantee | Useful evidence |
|---|---|
| pure invariant/transformation | focused unit/property examples |
| boundary parsing and error mapping | contract/component tests with valid, invalid, missing, and adversarial inputs |
| SQL constraints, isolation, locks, query shape, migrations | integration tests against the applicable database/version |
| external protocol/client behavior | contract tests plus controlled failure/timeout/retry cases |
| async cancellation/resource lifetime | deterministic coordination, cancellation, timeout, cleanup assertions; leak/task checks when available |
| deployment/mixed version/backfill | staged environment, compatibility matrix, restartable migration rehearsal, telemetry and rollback evidence |
| performance/capacity | representative measurement with a budget and bottleneck evidence |

Mocks prove interaction decisions, not the semantics of the database, broker, filesystem, clock, scheduler, or network they replace. Prefer simple fakes for owned stable ports; use real integrations where infrastructure semantics are the subject. Avoid deep mock chains that encode implementation details.

A behavioral defect normally deserves a regression guard at the cheapest reliable level. An existing covering test, static contract, database constraint, or explicit reason can satisfy this; do not demand a new test mechanically. A passing test written around the same mistaken assumption as the implementation is not independent evidence.

## Legacy and incremental change

Characterization tests record observed behavior before risky change; they do not declare every behavior correct. Classify observations as required contract, compatibility/workaround, unknown, or confirmed defect. For approval/golden-master tests, normalize nondeterminism, review the baseline, and use them only when broad output fidelity matters; snapshots are not a substitute for semantic assertions.

Create a seam only when it enables a concrete safe step. Sequence migrations so each stage is deployable, observable, reversible where required, and has a deletion condition for transitional paths. Feature flags need owner, rollout metric, failure action, expiration/removal condition, and safe default. Decommissioning must address callers, data retention, jobs, alerts, credentials, dependencies, and rollback window—not just delete source files.

AI-generated code deserves the same mechanism-level review, with extra suspicion for invented APIs/files, plausible but wrong control flow, fake tests, obsolete package behavior, swallowed errors, and unverified dependency capabilities. Do not reject code because it is generated; verify claims it tends to fabricate.

## Diagnosis and observability

Build a causal chain: observed symptom → relevant state/events → violated invariant → mechanism. Separate facts, ruled-out alternatives, and unknowns. Correlation is not ownership or causation. Avoid remediation during a diagnosis-only request.

Observability should answer an operational question:

- Can we tell which operation/tenant/version failed and where time went?
- Can we distinguish validation, dependency, capacity, concurrency, and business rejection?
- Can we measure backlog, saturation, retries, duplicate suppression, migration progress, and rollback criteria?

Use structured events/metrics/traces with bounded cardinality, privacy-aware fields, and actionable ownership. A trace is valuable across meaningful boundaries; tracing every function is noise. An audit trail requires clear subject, actor, action, before/after or event meaning, retention, access control, tamper expectations, and privacy handling.

After an observed failure or change pressure, choose one durable feedback loop tied to the mechanism: focused regression test, invariant/contract check, architecture fitness constraint, actionable telemetry, safer boundary, rollback, deletion, or simplification. The system need not “benefit from stress” universally; make the specific failure class less likely or cheaper.

## Performance and capacity

Measure before restructuring. Define workload, latency/throughput/memory/cost budget, current baseline, and environment. Inspect algorithmic work, allocations, serialization, query count/plans/indexes, connection pools, blocking I/O, cache hit/miss economics, and downstream limits. Optimize the bottleneck and remeasure. A microbenchmark cannot prove end-to-end capacity; production telemetry without controlled context cannot isolate cause.

## Release and recovery

For risky changes, state readiness and failure signals, staged exposure, compatibility window, rollback feasibility, and who/what triggers action. A rollback that cannot reverse a schema/data effect is not a rollback plan; use forward repair or expand/migrate/contract. Canary/shadow evidence is useful only when traffic is representative and side effects are contained.

Treat flaky tests as product feedback: identify shared state, timing, order, resource leaks, nondeterminism, external instability, or incorrect waits. Quarantine only with owner and deadline; repeated blind reruns hide risk.

## Non-findings

Do not require a real database for pure logic, a unit test for every line, tracing without an operational question, a performance rewrite without measurement, or a premortem/release apparatus for a trivial reversible edit. Report missing evidence honestly instead of claiming verification.

## Focused example

A flaky asyncio test uses `sleep(0.1)` and sometimes misses a task transition. Replace elapsed-time guessing with events/barriers that establish when the task starts and may finish; assert cancellation and cleanup explicitly. Repeatedly run that focused test, then the configured suite. Do not “fix” it by increasing the sleep or enabling blanket retries.

```python
task = asyncio.create_task(worker())
await asyncio.sleep(0.1)  # Signal: timing is being used as synchronization.
assert task.done()
```

The sleep is not a finding in a deliberate timing/backoff test with a controlled clock. In a lifecycle test, prefer an event/barrier or fake clock that proves the intended state.
