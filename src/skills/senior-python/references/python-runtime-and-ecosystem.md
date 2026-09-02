# Python runtime and ecosystem

Read this when Python-specific typing, runtime behavior, packaging, idioms, exceptions, resources,
concurrency, serialization, configuration, or a concrete library choice can change the answer.
Verify version-sensitive claims against the repository's pinned version and current official
documentation.

## Types, contracts, and data models

Annotations support static reasoning; they do not validate runtime data. Distinguish:

- boundary schema: what an external source may send/receive;
- application command/result: what an operation needs or promises;
- domain value/entity: valid business state and behavior;
- persistence model: database mapping, identity, relationships, lazy/eager loading;
- event/stored schema: a compatibility contract over time.

Reuse one representation when trust, exposure, lifecycle, and evolution align. Separate it when they
diverge. Avoid conversion layers created only to satisfy a diagram.

Use `Protocol` for structural collaboration owned by a consumer when multiple
implementations/substitutes or a real boundary exists; use an ABC when shared nominal
identity/behavior and runtime registration matter; use a dataclass/value type for cohesive internal
data; use a plain function/module when state and lifecycle do not need an object. Gradual typing
should target risky boundaries and confusing contracts first. Do not hide unsoundness with broad
`Any`, casts, or ignores; localize and explain unavoidable escapes.

Watch mutable defaults, shared class attributes, shallow copies/aliasing, mutable values used as
keys, descriptor/property side effects, dataclass equality/hash choices, and ORM lazy access after
session lifetime. Business invariants need an entry-point-independent owner; a Pydantic validator
reached only by HTTP is not enough when workers/CLI can bypass it.

## Idiomatic reuse without cleverness

Before writing helpers, check the standard library and ordinary language constructs:

- context managers for paired acquisition/release and transaction-like scopes;
- decorators for orthogonal call policy only when order, signature, state, and failure behavior
  remain clear;
- `functools` for caching/composition/dispatch already modeled by its primitives;
- `itertools` and generators for lazy streaming when it improves memory and clarity;
- comprehensions for straightforward transformations, not deeply nested control flow;
- dataclasses/enums/protocols/pathlib/collections/decimal/datetime/zoneinfo/concurrent and async
  facilities where their semantics fit.

Prefer obvious loops and local functions over contorted iterator pipelines or decorator stacks.
“Pythonic” means ordinary, readable, and semantically correct for this team—not maximally terse.

## Local design and change quality

On the fast path, inspect whether a maintainer can trace inputs, decisions, state changes, failures,
and outputs without reconstructing hidden conventions.

- Name functions, values, errors, and types for domain intent and units, not implementation trivia.
  A precise name beats generic `process`, `data`, or `handle`.
- Keep preconditions and error contracts visible. Guard clauses help when they remove nesting and
  leave one obvious success path; they hurt when scattered exits conceal cleanup or partial
  mutation.
- Treat a boolean parameter as a signal, not a defect. It is fine for one obvious local option;
  replace it with intent-revealing operations, an enum/value, or a policy when it selects distinct
  behavior or keeps multiplying.
- Prefer a cohesive parameter object/dataclass when values travel together, carry
  defaults/invariants, or a public call has become error-prone. Do not wrap two clear arguments
  merely to reduce a count.
- Judge complexity by whether behavior and failure paths can be followed and changed safely.
  Nesting, length, and branch count are prompts to inspect mixed responsibilities—not thresholds.
- Extract only when the result has a stable owner and meaningful name. A helper called once can
  clarify policy; many forwarding helpers can make control flow worse.
- Comments preserve why, invariants, compatibility constraints, non-obvious units, or rejected
  alternatives. Remove comments that narrate syntax or no longer match behavior.
- Distinguish private dead code from a public import, plugin hook, migration bridge, or feature-flag
  path. Transitional code needs an owner, removal condition, and compatibility evidence.
- Use a real parser for nested, escaped, recursive, or standardized formats. A bounded regex is
  appropriate for a deliberately small local grammar with rejection tests.

Keep a functional core and effectful shell when it makes a guarantee easier to test: parse/acquire
at the boundary, make policy decisions in deterministic code, and apply
persistence/network/time/random effects through an explicit owner. Do not force purity when the
operation is inherently stateful or splitting it would duplicate transaction/error context.

```python
# Signal: callers must remember what True means.
def save_invoice(invoice, notify: bool): ...

# Better only when both are real operations in the domain vocabulary.
def save_invoice(invoice): ...
def save_and_notify_invoice(invoice): ...
```

Do not flag `render_page(compact=True)` when the option is obvious, stable, and locally scoped.

## Conditional library choices

This is the author's curated vocabulary of useful candidates, not a neutral ranking or a default
stack for arbitrary repositories. Apply the stated criteria, prefer a repository's existing suitable
choice, and verify current APIs and repository fit before recommending or adding dependencies.

| Library                   | Consider when                                                                                                                         | Avoid / boundary                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pydantic                  | runtime parsing, validation, serialization, or published schemas at external/config/event boundaries                                  | do not put all domain behavior in validators or wrap already-trusted internal values without benefit                                             |
| `pydantic-settings`       | one typed startup configuration model should combine environment/secrets/files with explicit precedence and fail early                | avoid scattered `os.getenv`; do not force it on a tiny program or a project with an adequate established config system                           |
| SQLAlchemy + Alembic      | relational persistence needs explicit mapping/query/transaction semantics and managed schema migrations                               | do not add repository/ORM layers where direct framework-native data access is clearer; review generated migrations                               |
| `alembic-postgresql-enum` | SQLAlchemy/Alembic uses PostgreSQL native enums and create/alter/drop enum migrations need dedicated support                          | skip for string/check-constraint modeling, non-PostgreSQL systems, or when explicit manual migrations are clearer                                |
| SQLModel                  | Pydantic-friendly relational CRUD benefits from combined mechanics                                                                    | `table=True` should not simultaneously become persistence, public API, and domain by default; reuse is fine when those contracts genuinely align |
| `fast-depends`            | an existing standalone composition/adaptor boundary benefits from declarative dependency resolution                                   | keep it out of pure domain/helpers; do not introduce DI machinery when explicit construction is clear                                            |
| `faststream`              | the system already needs broker/message handling and its integration fits required delivery, serialization, lifecycle, and operations | do not introduce messaging because the library exists; verify broker semantics independently                                                     |
| pytest                    | focused executable examples and fixtures fit the repository                                                                           | do not contort non-Python or system-level guarantees into unit tests                                                                             |
| `pytest-asyncio`          | asyncio tests need event-loop fixtures, cancellation, task lifecycle, and async setup                                                 | synchronize deterministically; do not hide races with arbitrary sleeps                                                                           |
| `pytest-httpx`            | HTTPX client behavior, expected requests, errors, timeouts, and response handling need readable tests                                 | use a real contract/integration environment when wire/proxy/TLS/server behavior is the guarantee                                                 |
| `pytest-mock`             | readable fixtures/spies/patches improve interaction tests                                                                             | prefer fakes over deep mock chains; patch where a name is looked up, not where originally defined                                                |

Do not install a second general linter or complexity metric merely to enforce architectural taste.
Ruff, Pyright, or other configured tools are repository evidence and should be used according to
existing settings; this skill does not prescribe or install them.

## Configuration and startup

Read configuration centrally at startup where possible, validate required fields and cross-field
rules, make precedence explicit, keep secrets out of logs/repr, and pass typed configuration or
relevant values to owners. Avoid import-time environment reads that make tests/order surprising.
Distinguish absent, empty, default, and invalid. Validate URLs, paths, durations, limits,
identifiers, and modes before partial startup.

## Exceptions and resource lifetime

Catch only where code can add policy: translate, retry, compensate, log once with context, or
recover. Preserve causal chains (`raise ... from ...`), avoid broad catch-and-continue, and define
domain/application errors separately from transport mapping when it improves reuse. Exceptions from
cleanup/rollback must not silently replace the primary failure without recording both.

Use context managers for files, locks, sessions, connections, temporary resources, and scoped
context. `ContextVar` is useful for operation-scoped metadata when set/reset tokens and task
inheritance are understood; it is not a general mutable global.

## Time, numbers, paths, and serialization

Use timezone-aware instants and explicit business zones; test DST/ambiguous times where relevant.
Use integer minor units or `Decimal` with explicit rounding for money. Treat external IDs that
exceed consumer precision as strings where needed. Define encoding, timezone, enum, decimal, UUID,
missing/null, and version semantics at serialization boundaries. Use `pathlib`/safe path containment
and explicit text encoding; do not assume platform filesystem/process behavior.

## Runtime and packaging

Derive supported Python versions, package layout, public import paths, build backend, native
dependencies, and deployment entry points from repository contracts. Preserve public re-exports and
import compatibility deliberately. Native extensions add platform/ABI/build constraints. Avoid
import-time I/O and side effects that make discovery, tests, workers, or CLI startup unpredictable.

## Focused example

An agent writes a custom batching iterator with mutable internal indexes. If the requirement is
fixed-size lazy batches and the supported Python version provides a suitable standard-library
primitive, prefer and test that ordinary facility; otherwise keep a small generator with explicit
final-partial-batch behavior. Do not replace a clear five-line loop with a dense `itertools`
composition merely to appear idiomatic.
