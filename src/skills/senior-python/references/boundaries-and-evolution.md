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
- a value type for validated meaning and operations;
- an object when state, invariants, identity, or lifecycle belong together;
- a strategy/protocol/interface when real variants or an independently controlled boundary exist;
- an application operation/use-case object when orchestration, authorization, transaction, and
  effects need explicit ownership;
- a service/package boundary when deployment, ownership, scaling, failure isolation, or release
  independence supplies real pressure.

Procedural code is not automatically weak and classes are not automatically architecture. Flag
procedural sprawl only when durable concepts have no coherent owner and that causes duplication,
invalid transitions, tangled lifecycle, or expensive extension. Conversely, collapse abstraction
when it only forwards calls, predicts hypothetical variants, or obscures framework-native behavior.

## Conditional architecture tools

Use Clean Architecture, ports/adapters, dependency inversion, repositories, Unit of Work, DTOs, DI,
and domain models as a vocabulary of options:

| Tool                        | Pressure it can resolve                                                                                                                      | Smallest useful shape                                          | Cost / do not use when                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Port/adapter                | volatile external technology leaks into stable policy or multiple adapters implement one capability                                          | interface owned by consumer plus adapter                       | extra mapping and indirection; avoid for one stable framework-local operation                  |
| Repository                  | domain/application decisions are tangled with queries or persistence representation; multiple operations need a cohesive collection contract | capability-oriented methods, not CRUD mirror                   | hides useful query semantics and adds mapping; avoid for straightforward framework-native CRUD |
| Unit of Work                | one business operation must atomically coordinate several writes/repositories                                                                | explicit transaction owner and commit/rollback boundary        | ceremony when one local transaction is already obvious                                         |
| DTO / separate schema       | transport, application, persistence, or exposure contracts evolve independently                                                              | separate only the shapes whose trust/exposure/lifecycle differ | conversion burden; reuse one shape when contracts genuinely align                              |
| DI / composition root       | construction, lifecycle, and implementation choice are scattered or tests require controlled substitutes                                     | explicit constructors/functions at the outer boundary          | container magic and hidden dependencies; direct construction is often clearer                  |
| Rich domain/value model     | business invariants and transitions repeat or invalid states escape                                                                          | behavior beside the state it protects                          | anemic wrappers or enterprise ceremony for simple data flow                                    |
| Application/use-case object | authorization, transaction, sequencing, and effects need one owner                                                                           | one operation with explicit inputs/dependencies                | needless class-per-function when a function is cohesive                                        |

Support a repository's deliberate choice of these tools. Recommend adding one only after comparing
it with a local function/module/extraction and showing how verification improves. Missing
repositories, DTOs, DI, UoW, or Clean Architecture is never itself a finding.

A modular monolith is useful when one deployment still benefits from explicit domain/package
ownership, dependency direction, and separately testable contracts. It does not require a canonical
tree or pretend in-process calls have network failure semantics. Extract a service later only when
ownership, deployment, scaling, or failure-isolation pressure outweighs distributed-system cost.

## Evolution and compatibility

Treat public imports/exports, HTTP/RPC contracts, events, database schemas, stored files,
configuration, CLI behavior, and operational dashboards as contracts when consumers depend on them.
Identify the source of truth and actual consumers before changing them.

For compatible evolution, consider:

1. add/expand a backward-compatible shape;
2. deploy code able to read old and new states;
3. migrate/backfill with restartability and measurement;
4. switch producers/consumers;
5. remove/contract only after evidence shows the old path is unused.

Reason explicitly about mixed-version windows, rollback, dual-read/write divergence, partial
backfills, default semantics, and removal criteria. A deprecation without a consumer migration and
deletion condition is unfinished ownership. For a port or replacement, preserve source semantics:
enumerate invariants, error behavior, ordering, side effects, performance constraints, and
compatibility; test equivalence rather than reviewing only the new code.

Incremental tools such as preparatory refactoring, a Mikado-style dependency map, Strangler Fig,
Branch by Abstraction, Parallel Change, or a sacrificial prototype are useful only when they make a
real transition safer. A lightweight ADR is useful for a costly or hard-to-reverse choice when it
records context, alternatives, decision, consequences, and reversal trigger; it is not meeting
paperwork.

## Selective diagnostic questions

Ask only questions whose answers can alter the recommendation:

- **Target state:** If built from scratch today for several years of support and extension, what
  would differ, and which difference matters now?
- **Change pressure:** Which behaviors repeatedly change together? Is that temporal coupling signal
  trustworthy, or just a noisy bulk edit?
- **Alternatives/reuse/delete:** Is this capability differentiating? What existing facility solves
  it? Can the need or old path be deleted instead?
- **Reversibility:** Which decision becomes expensive after data, consumers, or teams depend on it?
  What can safely be deferred?
- **Legacy purpose:** What contract, workaround, migration state, or old consumer might explain
  strange code? Characterize before deletion.
- **Failure:** Under which concrete input/state/sequence does the design fail, and how is recovery
  performed?

For a high-blast-radius or one-way choice, a compact premortem may reveal missing containment or
rollback. For ordinary local work, skip it.

## Non-findings

Do not flag:

- framework imports inside code that is intentionally framework-local and well tested;
- merged models in a small system when trust, exposure, persistence, and evolution contracts align;
- direct dependency construction when lifecycle and substitution are already clear;
- a large cohesive module without mixed ownership or repeated change pain;
- a public-looking export until consumers and compatibility status are known;
- legacy behavior merely because a greenfield version would differ.

Recommend evolution only when the long-horizon reduction in support, development, extension, defect,
or operational cost plausibly exceeds migration and ongoing abstraction cost.

## Focused example

Two FastAPI handlers duplicate the same eligibility rule and transaction sequence. First extract one
application operation with explicit repository/session dependencies; keep FastAPI request/response
mapping in the handlers. Add a port only if another entry point or implementation creates real
variation. Verify the invariant without HTTP and the transaction against the real database. Do not
create four layers or a new service merely because the rule moved.

```python
# Signal: policy is duplicated at two independently reachable entry points.
if user.age >= 18 and not user.suspended:
    session.add(Order(user_id=user.id))
    session.commit()
```

One occurrence inside one cohesive handler is not evidence for a new layer. Search the other entry
point, confirm drift/change pressure, then centralize the policy at the smallest shared owner.
