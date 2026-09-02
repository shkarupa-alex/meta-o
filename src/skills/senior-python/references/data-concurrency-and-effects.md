# Data, concurrency, and effects

Read this when correctness depends on persistence, transactions, retries, messages, shared state, async/tasks, resources, ordering, or partial failure. It changes ownership and verification decisions; it does not make distributed-systems machinery a default.

## Model the guarantee

Name the invariant, authoritative state, actors, operation boundary, allowed interleavings, duplicate/replay behavior, and failure point. Trace the whole effect path, including decorators, ORM hooks, task queues, client wrappers, and framework lifecycle. An in-memory check does not protect an invariant enforced concurrently by another process.

Ask:

- Which unit must commit atomically, and who owns begin/commit/rollback?
- Can two actors read the same prior state and both write? What prevents lost update or uniqueness races?
- Which effects occur before, inside, and after commit? What happens when any step fails?
- Can a request/message be retried, duplicated, reordered, or replayed? Is the operation naturally or explicitly idempotent?
- Who owns cancellation, deadlines, tasks, sessions, files, sockets, pools, and cleanup?

Verify persistence invariants against the real database semantics that enforce them when mocks/in-memory substitutes cannot prove locks, isolation, constraints, transaction visibility, or query behavior.

## Transactions and concurrency

Keep transaction ownership at the application operation or another explicit unit that knows the business atomicity boundary. A repository should not silently commit each method when the caller expects several changes to succeed together. Avoid network calls inside a database transaction unless consistency requires it and the lock/latency/failure costs are accepted.

Choose a concurrency strategy from the invariant and contention:

- database constraint plus conflict handling for uniqueness;
- atomic conditional update (`... WHERE version = expected`, row-count checked) or ORM version column for optimistic concurrency;
- row/advisory/distributed lock only when its ownership, timeout, crash behavior, and scope are understood;
- serialized processing or single-writer ownership when ordering and throughput permit;
- idempotency key with persisted outcome when the same externally visible operation may be submitted again.

Prefer one authoritative state transition when it can enforce the invariant directly. If an atomic conditional write subsumes an earlier read/check, remove that preliminary observation rather than retaining a stale extra query “for safety.” Keep it only when it preserves a required error distinction or has demonstrated cost value, and treat the atomic result as authoritative. If zero affected rows conflates “missing” with “conflict” or “insufficient,” classify afterward only when the caller contract requires the distinction.

Before declaring a race reachable or fixed, establish any outer transaction, isolation level, serialization, retry wrapper, and repository session ownership that can change the conclusion. If they cannot be inspected, state the conditional conclusion and the missing evidence; do not claim the result holds under every possible wrapper.

Do not add a lock because concurrency exists. Do not claim an entity's version comparison is atomic. For money and other exact quantities, choose representation and rounding rules explicitly; do not let binary float or implicit timezone conversion decide business semantics.

## Retries, messaging, and external effects

Retry only transient, safely repeatable work with a bounded attempt/deadline policy, backoff/jitter where appropriate, and observable terminal failure. Classify errors rather than catching everything. Never blindly retry a non-idempotent effect.

An outbox is useful when a committed database change and message publication must not diverge: write domain state and an outbox record in one transaction, publish asynchronously, and make consumers duplicate-safe. It adds storage, polling/CDC, retention, ordering, monitoring, and recovery cost. Do not use it when no atomic database-plus-message guarantee is required, the platform already supplies one, or reconciliation is cheaper and acceptable. Inbox/deduplication, dead-letter handling, audit trails, soft delete, and event sourcing likewise require a named business/operational guarantee and lifecycle.

For dual-write or migration periods, define source of truth, read precedence, divergence detection, repair, and exit criteria. Shadow or dual-run comparisons must contain side effects; never duplicate real writes merely to compare implementations.

## Async, cancellation, and resources

Python `async` improves cooperative I/O concurrency; it does not make blocking calls non-blocking or CPU work parallel. Confirm the project's concurrency model before mixing `asyncio`, threads, processes, schedulers, or broker workers.

- Keep ownership of created tasks. Prefer structured concurrency/task groups when child lifetimes belong to the operation.
- Propagate cancellation unless crossing a deliberate completion boundary. Cleanup should run under `try/finally` or an async context manager; narrowly shield only cleanup/commit steps whose interruption would corrupt state.
- Bound fan-out and queue growth. A list of thousands of coroutines passed to `gather` can exhaust memory, sockets, or downstream capacity even when logically correct.
- Do not hold database sessions, transactions, locks, or scarce pool slots across unrelated waits.
- Give threads/processes explicit shutdown and error propagation. Processes add serialization/startup constraints; threads do not remove race and lifecycle reasoning.

Example: a handler loads a row, awaits an API, then increments and commits. Two handlers can overwrite each other and the transaction holds resources during the network call. Consider moving the call outside the transaction and using an atomic conditional update; retry only the conflict-safe portion. Prove the outcome with a concurrent real-database test and API failure cases.

## Caches and backpressure

A cache needs ownership of key identity, invalidation, staleness tolerance, eviction, stampede behavior, failure fallback, observability, and removal. Do not add caching before measurement. Backpressure means producers cannot create work faster than bounded consumers/resources can sustain; use bounded queues/concurrency, admission control, stream flow control, or explicit overload responses rather than unbounded buffering.

## Non-findings

Do not require:

- UoW around one obvious framework-managed transaction;
- real-database tests for pure deterministic policy;
- idempotency for a provably single-shot internal operation;
- outbox for unrelated or acceptably reconcilable effects;
- locks when atomic constraints/updates already protect the invariant;
- concurrency limiting for a small, statically bounded set with ample capacity;
- soft deletion or audit history without retention, recovery, compliance, or forensic need.

If reachability or ownership cannot be established, report the unknown and the evidence needed; do not manufacture a high-severity finding.

## Detectable signal example

```python
balance = await repo.get_balance(account_id)
await gateway.reserve(account_id)
await repo.set_balance(account_id, balance - amount)
```

This is a prompt to trace concurrent writers, transaction boundaries, and partial failure: two calls may lose an update, and the external reservation may survive a database failure. It is not a finding if callers are provably serialized and reconciliation/atomic update semantics already protect the invariant.
