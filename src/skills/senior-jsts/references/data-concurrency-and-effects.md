# Data, concurrency, and effects

Read this when correctness depends on persistence, transactions, retries, messages, promises, effects, streams, shared state, ordering, resources, or partial failure. It changes ownership and verification decisions; it does not make distributed machinery a default.

## Model the guarantee

Name the invariant, authoritative state, actors/environments, operation boundary, allowed interleavings, duplicate/replay behavior, and failure points. Trace wrappers, clients, framework hooks, listeners, queues, and lifecycle—not only the visible call.

Ask:

- Which unit must commit atomically, and who owns commit/rollback?
- Can actors/tabs/workers read the same prior state and both write?
- Which effects occur before, inside, and after commit; what remains after partial failure?
- Can a request/event be retried, duplicated, reordered, or replayed?
- Who owns each promise, cancellation signal, timer, listener, stream, connection, pool slot, and cleanup?

Use real database/broker/protocol tests when substitutes cannot prove constraints, isolation, locks, delivery semantics, ordering, or serialization.

## Transactions and concurrency

Keep transaction ownership with the operation that knows business atomicity. Avoid hidden per-repository commits and network calls inside transactions unless the required consistency justifies lock/latency/failure costs.

Choose from the invariant:

- database constraint and conflict handling for uniqueness;
- atomic conditional update or version check for optimistic concurrency;
- lock only with explicit scope, timeout, crash behavior, and ownership;
- serialized/single-writer processing when ordering and throughput permit;
- persisted idempotency key/outcome for replayable externally visible operations.

JavaScript's single event loop does not prevent races across `await`, multiple requests, workers, processes, tabs, or services. Do not use `number` for money or large identifiers when precision cannot be represented; define decimal/integer/BigInt/string serialization semantics at the boundary.

## Retries, messages, and effects

Retry only transient, safely repeatable work with bounded attempts/deadline, backoff/jitter when useful, terminal failure visibility, and cancellation. Preserve the original error/cause where it matters. Never blindly retry a non-idempotent effect.

Use an outbox when one database commit and message publication must not diverge: store state and outbox record atomically, publish asynchronously, and make consumers duplicate-safe. Account for polling/CDC, ordering, retention, poison records, monitoring, and recovery. Skip it when no such atomic guarantee exists, the platform supplies it, or reconciliation is an accepted cheaper alternative. Inbox/deduplication, dead-letter handling, audit, soft delete, and event sourcing each require a specific guarantee and lifecycle.

During dual-read/write migrations, define source of truth, precedence, divergence detection, repair, and exit. Shadow comparisons must suppress or isolate side effects.

## Promises, cancellation, streams, and resources

- Every promise needs an owner that awaits, returns, observes, or deliberately detaches it with error handling and lifecycle. Floating promises can create unhandled rejection and work after the request/component ends.
- Thread `AbortSignal` through APIs that support cancellation. Distinguish cancellation from failure, clear timers/listeners, and avoid starting work after abort.
- `Promise.all` fails fast but does not automatically cancel siblings. Decide whether partial success, all-settled collection, or explicit sibling cancellation protects the invariant.
- Bound fan-out. Thousands of promises can exhaust sockets, memory, rate limits, or a dependency even though the event loop remains responsive.
- Use stream backpressure and clean up both producer and consumer on error/abort. Do not buffer an unbounded stream for convenience.
- CPU-heavy synchronous code and large JSON parse/stringify block the Node/browser event loop. Measure and move/batch/yield/offload only when latency evidence warrants it.
- Remove listeners/subscriptions and close handles according to the owning environment's lifecycle.

For a long-lived Node service or worker, make shutdown ownership explicit when dropped work or partial effects matter: handle the platform's termination signal at one owner, stop intake and change readiness, drain in-flight work to a bounded deadline, abort or close dependencies in a deliberate order, and expose timeout/forced-exit behavior. Do not add shutdown machinery to a short-lived script whose environment already owns completion.

Example: an HTTP handler calls a payment API, then commits an order, while middleware retries any rejected request. A timeout after the remote charge can duplicate payment. Define an operation idempotency key, persist outcome/reconciliation state, classify retryable failures, and test the timeout-after-effect sequence. An in-memory mock that always resolves cannot prove the guarantee.

## Caches and backpressure

A cache needs key identity, invalidation, staleness tolerance, eviction, stampede behavior, failure fallback, observability, and removal. Do not add one without measurement. Apply bounded concurrency/queues, stream flow control, admission control, or explicit overload responses where producers can exceed sustainable capacity.

## Non-findings

Do not require:

- UoW around one obvious framework-managed transaction;
- real database/broker tests for pure deterministic behavior;
- idempotency for a provably single-shot internal operation;
- outbox for unrelated or acceptably reconcilable effects;
- locks when atomic constraints/updates already protect the invariant;
- concurrency limiting for a small statically bounded set;
- streams/workers merely because a payload or loop is “large” without measured harm.

If reachability or effect ownership is unknown, report what evidence would resolve it rather than assigning severe certainty.

## Detectable signal example

```ts
const order = await db.orders.get(id);
await payment.charge(order.total);
await db.orders.markPaid(id);
```

This prompts tracing retry, duplicate charge, and partial failure after the external effect. It is not automatically defective when the charge uses a persisted idempotency key and reconciliation safely completes the state transition.
