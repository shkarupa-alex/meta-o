# JavaScript and TypeScript runtime and ecosystem

Read this when runtime contracts, static types, modules, packages, errors, environment APIs,
serialization, or a concrete validation choice can change the answer. Derive actual versions and
targets from repository evidence; verify volatile claims with current official documentation.

## Static types and runtime data

JavaScript with tests/JSDoc, TypeScript, and mixed migration states are all legitimate. TypeScript
is erased and structurally typed: assertions (`as T`), generic return types, interfaces, and
generated declarations do not validate runtime values. Treat
network/storage/message/config/URL/DOM/JSON data as `unknown` until a boundary proves otherwise.

Distinguish transport/runtime schema, application command/result, domain value, persistence
representation, event/stored schema, and public TypeScript type. Reuse one representation when
trust, exposure, serialization, lifecycle, and versioning align; separate only where they diverge.
Prevent schema/type drift by choosing an explicit source of truth and testing
serialization/validation.

Structural compatibility may accept objects with extra or semantically invalid fields. Avoid broad
assertions and `any`; narrow with control flow, predicates, discriminated unions, exhaustive checks,
or a runtime schema where the boundary warrants it. Model invalid states out when the added type
complexity remains readable; do not build type-level puzzles that hide runtime behavior.

Never recommend TypeScript migration merely as a quality signal. Name the defect/change pressure it
would address, incremental interoperability, build/runtime cost, third-party type quality, and
completion/removal plan.

## Local design and change quality

On the fast path, inspect whether a maintainer can trace inputs, decisions, effects, failures, and
outputs without reconstructing hidden conventions.

- Name functions, values, errors, types, and events for domain intent and units. Avoid generic
  `handle`, `process`, `data`, and `utils` when a narrower concept exists.
- Make preconditions and rejected outcomes explicit. Early returns help when they leave one obvious
  success path; they hurt when they scatter effect cleanup or hide partial state changes.
- Treat a boolean parameter as a signal, not a defect. It is fine for one obvious option; use
  intent-revealing functions or a discriminated options shape when it selects distinct behavior or
  accumulates combinations.
- Prefer an options object when arguments are optional, same-typed, evolving, or easy to swap. Do
  not replace two stable positional arguments with ceremony.
- Judge complexity by traceability and safe change, not file size, nesting, or branch thresholds.
  Extract only when the result has a coherent owner and useful name.
- Comments preserve why, invariants, browser/runtime workarounds, compatibility constraints, or
  non-obvious units. Remove comments that narrate syntax or contradict behavior.
- Verify “dead” code against package exports, dynamic registration, framework conventions,
  consumers, feature flags, and mixed deployed versions. Transitional paths need an owner and
  removal condition.
- Use a parser or platform API for nested, escaped, or standardized formats. A bounded regex remains
  fine for a small explicit grammar with rejection tests.

Keep a functional core and effectful shell when it clarifies behavior: validate/acquire at the
environment boundary, calculate decisions in deterministic functions, and apply
DOM/network/storage/time effects through an explicit owner. Do not split cohesive framework
lifecycle code merely to claim purity.

Prefer native collection, iteration, and object facilities such as `map`, `filter`, `some`, `every`,
`flatMap`, `Set`, destructuring, iterables, and generators when they directly express the operation
and its evaluation semantics. Do not treat method chaining, currying, generators, or advanced
utility types as senior signals by themselves; an ordinary loop or named local function is better
when it makes control flow, allocation, early exit, or failure easier to see.

```ts
// Signal: call sites must remember what true means.
async function saveInvoice(invoice: Invoice, notify: boolean) {}

// Better only when both are real operations in the domain vocabulary.
async function saveInvoice(invoice: Invoice) {}
async function saveAndNotifyInvoice(invoice: Invoice) {}
```

Do not flag `renderPage({ compact: true })` when the option is obvious, stable, and local.

## Zod as a conditional Pydantic analogue

Consider Zod when the repository uses or can reasonably adopt it and an external `unknown` value
needs runtime parsing/validation: API payloads, environment/config, events, storage, form
submission, URL parameters, or cross-language contracts.

- Define a runtime schema as the source and use `z.infer` when one TypeScript type should derive
  from it.
- Use `safeParse` when validation failure is an expected branch the caller will handle and report
  deliberately.
- Use `parse` when invalid data is a contract violation that should fail fast and the surrounding
  boundary maps the thrown error appropriately.
- Transform/coerce only with explicit input semantics; distinguish missing, empty, `null`, defaults,
  and lossy conversion.
- Keep business authorization and invariants outside a boundary schema when other entry points could
  bypass it.

Do not wrap every trusted internal typed object in Zod. Do not duplicate a framework-owned schema
without deciding which one is authoritative. Do not add Zod if an installed, maintained runtime
schema facility already satisfies the contract. Verify current API and bundle/runtime suitability
before recommending it.

## Modules, packages, and runtimes

Establish Node/browser/worker/serverless/edge targets, package `type`, file extensions,
`exports`/`imports`, conditional exports, compiler/module/moduleResolution, bundler transforms, test
runner, and deployed runtime. A configuration can type-check yet fail when the emitted module format
or resolver differs from runtime.

For TypeScript executed by Node, determine whether the repository uses native type stripping, `tsc`
output, a loader such as `tsx`, or a bundler. Derive behavior from the deployed Node version:
current native stripping does not itself type-check or read `tsconfig.json`, accepts only syntax
supported by that mode, and does not replace the package's distribution/build contract. Check
type-only imports, extensions, module format, source-versus-built tests, and whether a separate
type-check remains authoritative before simplifying the toolchain.

For ESM/CJS interop, trace the producer format, consumer loader, transpiled output, package
conditions, and runtime version. Check default-versus-named export shape, compiler/bundler synthetic
interop, `require()` of ESM, dynamic `import()` from CJS, top-level await, file-extension rules, and
whether tests execute source or built artifacts. A dual package can create two module instances and
split singleton or class identity when `import` and `require` resolve different builds; prefer one
authoritative implementation and verify both advertised entry points when dual publication is
required.

Treat package exports as compatibility boundaries. Internal-looking files may be consumed through
deep imports; find actual consumers before removal. In workspaces, understand package build order,
duplicate dependency/version behavior, symlinks, type declaration emission, and whether tests run
source or built output.

Treat `type` versus `interface` as a contract choice, not a quality contest. Interfaces fit
deliberately augmentable or implementable object contracts; type aliases fit unions, mapped/branded
types, and explicit composition. Prefer source types beside `.ts`/JSDoc implementation and generate
declarations for package boundaries when practical. Hand-written `.d.ts` remains appropriate for
untyped external behavior, global/module augmentation, or a declaration-only boundary, but give it
an executable drift check and a clear source of truth.

Deprecation is a compatibility change, not a comment tag: identify consumers, provide a supported
replacement and migration window, preserve or version runtime/type behavior as promised, measure
remaining use where possible, and define removal criteria. Cached frontend artifacts and
independently upgraded packages can extend the mixed-version period.

Prefer native platform facilities such as `URL`, `AbortController`/`AbortSignal`, async iteration,
streams, `Intl`, `structuredClone`, Web Crypto, Node built-ins, and framework primitives when their
environment support and semantics fit. Do not polyfill or custom-build from memory; check
target/runtime support and repository conventions.

For dependencies, inspect lockfile identity, package source/integrity, runtime targets, module
formats, types, side effects/tree-shaking, install/build scripts, advisories, maintenance, license,
transitive cost, bundle/server footprint, and fit. Popularity is not correctness. Avoid introducing
a package for a few clearer local lines, but do not hand-roll complex non-differentiating protocols
or security-sensitive parsing.

## Errors and promise ownership

JavaScript may throw any value. Normalize carefully at boundaries while preserving the original
`Error` and `cause` when useful. Do not assume `catch (error)` has a message without narrowing.
Separate expected validation/business rejection from unexpected operational failure so retries,
status mapping, logs, and alerts remain correct.

Choose failure representation as part of the API contract. A discriminated result is useful when
failure is expected, callers own distinct recovery branches, and exhaustiveness/combination repays
the ceremony. Exceptions fit unexpected failures and established public or framework conventions.
Keep one boundary consistent and translate deliberately; do not require every value-returning
function to use `Result`, build a custom monad, or add repository-wide enforcement without repeated
failure-handling pressure and an agreed convention. Reuse an adequate existing facility before
inventing one.

A rejected promise is an asynchronous failure, not a different error taxonomy. Return/await promises
or explicitly own detached work. Preserve failure context once; avoid log-and-rethrow duplication
and catch-and-continue that converts failure to false success. Cancellation should have defined
outward semantics and cleanup.

Node `AsyncLocalStorage` can carry operation-scoped correlation or request context when
initialization, propagation, cleanup, and runtime boundaries are understood. It is not a general
mutable global, and its assumptions do not automatically transfer to browsers, workers, edge
runtimes, or detached background work.

## Serialization and numeric semantics

JSON drops `undefined`, cannot directly represent BigInt, turns dates into strings only through
chosen serialization, and cannot preserve class/prototype/map/set semantics. Define date/timezone,
enum, decimal/money, identifier, missing/null, binary, error, and version behavior at boundaries. Do
not let JavaScript `number` silently corrupt large integers or money.

## Configuration

Validate runtime configuration at startup in the environment that owns it. Separate build-time
public configuration from server secrets; anything bundled to a browser is public. Make
precedence/defaults explicit, avoid scattered `process.env`, and fail before partial initialization
when required contracts are invalid. Edge/serverless environments may not provide Node globals or
stable process lifetime; code to the actual deployed capability set.

## Focused example

An HTTP client casts `await response.json()` to `User`. Replace the assertion at that trust boundary
with the repository's existing runtime schema facility—or Zod when it is the fitting selected
facility—and handle `safeParse` failure as a protocol error. Keep `z.infer` as the static type
source. Do not re-parse a `User` already produced by that validated boundary inside every internal
function.
