# Boundaries and evolution

Read this when ownership, architecture, public contracts, migration, reuse, or long-term change cost
can change the decision. Do not load it merely because a file is large.

## Start from pressure, not a diagram

A useful boundary protects an invariant, gives state/effects a clear owner, contains volatility, or
lets independently changing parts evolve safely. Detect pressure through duplicated policy, repeated
coordinated edits, circular dependencies, hidden lifecycle, changes that require unrelated
knowledge, or tests that cannot isolate the guarantee. Confirm the pressure from current code,
tests, history when necessary, and known future requirements. Do not infer it from directory names,
import direction, line count, or absence of a familiar pattern.

Prefer the least costly coherent home:

- a function for local stateless transformation;
- a module for cohesive related behavior;
- a value/object when state, invariants, identity, or lifecycle belong together;
- a strategy/type/interface when real variants or an independently controlled boundary exist;
- an application operation/service when orchestration, authorization, transaction, and effects need
  explicit ownership;
- a package/service boundary when ownership, scaling, failure isolation, or release independence
  supplies real pressure.

Direct functions and framework-native components are not weak architecture. Classes and interfaces
are not automatically strong architecture. Extract only when the resulting owner and contract are
clearer than the local code; collapse forwarding layers and speculative interfaces that obscure
runtime behavior.

## Conditional architecture tools

Use Clean Architecture, ports/adapters, dependency inversion, repositories, Unit of Work, DTOs, DI,
and domain models as conditional options:

| Tool                  | Pressure it can resolve                                                                                  | Smallest useful shape                                      | Cost / do not use when                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Port/adapter          | external technology leaks into stable policy or several adapters implement one capability                | consumer-owned interface/type plus adapter                 | mapping and indirection; avoid for one stable framework-local operation       |
| Repository            | decisions are tangled with persistence representation or several operations need one collection contract | capability-oriented methods, not CRUD mirror               | hides query semantics; avoid for straightforward framework-native CRUD        |
| Unit of Work          | one operation atomically coordinates several writes                                                      | explicit transaction owner and commit/rollback boundary    | ceremony when one transaction is already obvious                              |
| DTO / schema          | transport, application, storage, or exposure contracts evolve independently                              | separate only shapes whose trust/exposure/lifecycle differ | conversion burden; reuse when contracts genuinely align                       |
| DI / composition root | construction, lifecycle, and implementation choice are scattered                                         | explicit composition at outer boundary                     | containers/tokens can hide dependencies; direct construction is often clearer |
| Domain/value model    | invariants/transitions repeat or invalid states escape                                                   | behavior beside protected state                            | wrappers and enterprise ceremony for simple data flow                         |
| Application operation | authorization, transaction, sequencing, and effects need one owner                                       | cohesive function or object with explicit dependencies     | class-per-function ceremony                                                   |

Support a repository's deliberate architectural choice. Recommend adding a mechanism only after
comparing it with a local function/module/extraction and showing how the guarantee becomes clearer.
Missing repositories, DTOs, DI, UoW, or Clean Architecture is never itself a finding.
Micro-frontends likewise need real team/release/runtime isolation pressure, not component count.

A modular monolith is useful when one deployment still benefits from explicit package/domain
ownership, dependency direction, and separately testable contracts. It does not require a canonical
tree or imitation network boundaries. Extract a service only when ownership, deployment, scaling, or
failure-isolation pressure outweighs distributed-system cost.

## Evolution and compatibility

Treat package `exports`, public types, HTTP/RPC contracts, events, database schemas, stored browser
data, configuration, URLs, and operational behavior as contracts when consumers depend on them.
TypeScript visibility does not prove runtime privacy; find actual import paths and consumers.

For compatible evolution:

1. add/expand a backward-compatible shape;
2. deploy readers able to consume old and new states;
3. migrate/backfill with restartability and measurement;
4. switch producers/consumers;
5. remove/contract only after evidence shows the old path is unused.

Reason about mixed deployed frontend/backend versions, cached assets, rollback, dual-read/write
divergence, partial backfills, defaults, and deletion criteria. For a port, framework replacement,
JS-to-TS migration, module-format change, or runtime move, enumerate source semantics—errors,
ordering, effects, environment APIs, serialization, and performance—and test equivalence. New code
that is locally clean can still be an incompatible replacement.

Preparatory refactoring, Mikado-style exploration, Strangler Fig, Branch by Abstraction, Parallel
Change, and sacrificial prototypes are transition tools, not prescribed processes. Use a lightweight
ADR only when a costly or hard-to-reverse choice benefits from recorded context, alternatives,
consequences, and a reversal trigger.

## Selective diagnostic questions

Ask only questions whose answers alter the recommendation:

- **Target state:** If built from scratch today for several years of support and extension, what
  would differ, and which difference matters now?
- **Change pressure:** Which behaviors repeatedly change together? Is temporal coupling meaningful
  or a noisy formatting/generated edit?
- **Alternatives/reuse/delete:** Is the capability differentiating? What existing
  platform/repository facility solves it? Can the need or old path be deleted?
- **Reversibility:** What becomes expensive after published packages, stored data, cached clients,
  or teams depend on it?
- **Legacy purpose:** What consumer, browser workaround, compatibility window, or migration state
  explains odd code? Characterize before deletion.
- **Failure:** Which concrete input/state/sequence breaks it, and how does recovery work?

For a high-blast-radius or one-way choice, a compact premortem may expose missing containment or
rollback. Skip it for ordinary local work.

## Non-findings

Do not flag:

- framework imports in intentionally framework-local, adequately verified code;
- plain JavaScript or absence of TypeScript by itself;
- merged runtime/static/application schemas when their trust and evolution contracts align;
- a large cohesive component/module without mixed ownership or demonstrated pressure;
- a public export until consumers and compatibility status are known;
- legacy code merely because a greenfield version would differ.

Recommend evolution only when lower long-term support, development, extension, defect, or
operational cost plausibly exceeds migration and ongoing abstraction cost.

## Focused example

Two Node entry points duplicate order eligibility and transaction sequencing. First centralize one
application operation with explicit persistence/payment collaborators; keep HTTP and queue mapping
at their adapters. Introduce a port only for an actual second implementation or independently
evolving boundary. Verify policy locally and the transaction with the database. Do not create a
service or interface-per-method solely to match a diagram.

```ts
// Signal: policy is duplicated at independently reachable entry points.
if (user.age >= 18 && !user.suspended) {
  await db.orders.insert({ userId: user.id });
}
```

One occurrence in one cohesive route is not evidence for a service or interface. Confirm duplication
or change pressure first, then centralize at the smallest shared owner.
