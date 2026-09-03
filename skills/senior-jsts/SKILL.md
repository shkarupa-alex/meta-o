---
name: senior-jsts
description:
  Apply repository-grounded senior engineering judgment to substantial JavaScript or TypeScript work
  and bounded JS/TS changes with production or cross-boundary risk. Do not use for trivial syntax
  questions, generic tutoring, or tasks with no JS/TS artifact unless explicitly invoked. Use for
  Node, browser, frontend, worker, and edge work where correctness, contracts, state, effects,
  concurrency, compatibility, security, reuse, runtime alignment, or long-term ownership materially
  matters.
---

# Senior JavaScript and TypeScript engineering

Make JS/TS changes and judgments that remain correct, understandable, and economical to support and
extend over the system's expected life. Do not optimize for architectural purity, minimum diff size,
TypeScript adoption, or pattern count. Plain JavaScript, framework-native structure, functions, and
direct code are valid when they protect the required contracts.

## Establish the actual task

Treat the requested function, component, class, module, package, service, application,
configuration, test suite, or subsystem as the task unit. The repository is context, not
automatically the task. Follow the user's and host's requested scope and action posture: review
stays review; diagnosis does not silently become remediation; a bounded change does not become
repository modernization.

Establish only context that can change the answer:

- applicable instructions, target or diff, direct callers/consumers, nearby tests;
- actual runtime(s), package manager/lockfile, module format, compiler, bundler, framework,
  configured checks, and existing facilities;
- public exports/APIs, schemas, stored/event/config formats, browser/server/worker/edge boundaries,
  persistence and operational contracts;
- generated/vendor status and the executable source of truth.

Stop when behavior, affected invariants, material failure scenarios, constraints, and adequate
verification are known. State unknowns rather than guessing. Types and documentation establish
declared contracts; executable artifacts establish current behavior; current primary sources
establish volatile version/library claims.

## Run a cheap concern scan

For every task, scan direct code plus visible wrappers, hooks, aliases, clients, and framework
facilities across six concerns:

- **Trust:** external `unknown`, identity/tenant decisions, browser or privileged sinks.
- **Contracts:** public/stored/configured shapes, compatibility, migration, or mixed versions.
- **State and effects:** persistence, retry/duplicate, message, cache, UI effect, or external side
  effect.
- **Concurrency and resources:** promise/task ownership, cancellation, ordering, streams, listeners,
  fan-out, or scarce lifetime.
- **Runtime and release:** ESM/CJS/build/runtime/environment boundaries, deployment, hydration,
  rollout, or rollback.
- **Proof:** a guarantee that local reasoning cannot establish without integration, browser,
  failure, recovery, accessibility, security, or performance evidence.

With no material signal, keep the investigation local. On that fast path, verify ordinary
correctness and whether:

- names and API shape express domain intent rather than incidental mechanics;
- preconditions, rejected outcomes, and the error contract are explicit enough for callers;
- a maintainer can trace inputs, decisions, state/effects, failures, and outputs without
  reconstructing hidden conventions.

Treat flags, size, nesting, hook count, and duplication as search signals rather than defects.
Extract, comment, or retain transitional code only when the result gains a meaningful owner/name,
preserves a reason or invariant, or has a removal condition. With a material or unclear concern,
load only references that can change the decision. A deeper investigation may correctly produce no
finding.

### Do not miss critical reachable failures

Escalate instead of defaulting to “no findings” when evidence shows a reachable authorization or
cross-tenant bypass, data loss/corruption, unsafe duplicate external effect, secret/code/DOM/process
exposure, unbounded resource exhaustion, or an irreversible compatibility/data migration without a
viable recovery path. Confirm prerequisites and safeguards before assigning severity; this is a
guard against silence, not permission to speculate.

## Use one judgment loop

1. State the intended outcome, task unit, contracts, invariants, environments, and constraints.
2. Trace relevant inputs, state transitions, effects, failures, and ownership through reachable
   paths.
3. Separate facts from assumptions. Derive installed versions before checking official documentation
   for volatile behavior; do not rank tools from memory or popularity.
4. Classify a candidate:
   - A **defect** needs a reachable input, state, or sequence that can cause wrong output, leakage,
     corruption, crash, hang, stale UI, compatibility break, or operational failure.
   - A **structural recommendation** needs demonstrated repeated change pressure, confused
     ownership, inseparable effects, or a materially expensive extension path. File size, missing
     layers, and pattern absence are only search signals.
5. Compare the smallest adequate remedies, including doing nothing. Evaluate
   implementation/migration cost, future support and extension cost, defect and operational risk,
   team comprehensibility, reversibility, and deletion cost over the expected horizon.
6. Implement only when requested, preserving surrounding behavior and framework/project conventions
   unless they cause a demonstrated problem.
7. Verify with the cheapest evidence capable of proving the guarantee, then report result, checks,
   uncertainty, and residual risk.

For architecture or demonstrated long-term pressure, ask selectively: **If we built this task unit,
system, or project from scratch today, knowing we would support and extend it for several years,
what would we do differently?** Use the answer to expose accidental constraints and define an
evolutionary direction—not to authorize a rewrite. Ask other diagnostic questions only when their
answers change the current decision: what changes together, what legacy behavior protects, what can
be reused or deleted, what is hard to reverse, and how the design fails.

For a materially irreversible or high-blast-radius decision, use a compact premortem when useful:
assume it failed; name two or three plausible causes, earliest signals, prevention or containment,
and rollback. Skip this for ordinary local work.

After an incident, regression, or repeated change pain, consider a durable feedback mechanism tied
to the observed cause: a focused test, contract check, useful observability, safer boundary,
rollback, deletion, or simplification. The goal is earlier detection, cheaper recovery, or safer
future change—not generic “antifragility.”

## Prefer reuse and native language/platform facilities

For a substantive capability plausibly solved before, define constraints and consider:

1. an existing repository facility or convention;
2. an ordinary language/platform facility;
3. a native Node/browser/database/runtime guarantee;
4. an already-installed dependency;
5. a suitable maintained dependency;
6. the smallest clear custom implementation.

Do not start package research for a couple of obvious local lines. Do not invent parsers, schema
libraries, schedulers, retry frameworks, caches, DI containers, state systems, or protocol
implementations without showing why prior options fail. A separate reuse skill may deepen ecosystem
research when available; this skill owns repository fit.

Prefer familiar platform mechanisms—promises, `AbortSignal`, async iteration, streams, `URL`,
`Intl`, Web APIs, Node built-ins, package exports, and framework-native lifecycle/state tools—when
they match the deployed environments. Avoid clever type-level or functional machinery that hides
runtime behavior. TypeScript types are erased: they improve static reasoning but do not validate
network, storage, URL, DOM, message, environment, or parsed JSON values.

## Calibrate findings and changes

Severity follows reachable impact and prerequisites; confidence follows evidence. Use P0 only for a
reachable emergency, P1 for probable serious correctness/security/availability/compatibility
failure, P2 for a bounded defect or demonstrated maintenance hazard, and P3 for an optional local
improvement. Architectural taste alone is normally omitted. Tentative concerns become questions or
residual risks, not findings.

For review, order actionable findings by impact. Give the invariant or pressure, evidence, concrete
reachable scenario, smallest fitting remedy, and verification. Cite only inspected locations; use a
component name if no exact line was established. It is valid to report no actionable findings. Cap
unsolicited structural recommendations at three.

For implementation, produce the requested outcome, explain only consequential decisions, run checks
appropriate to repository and risk under the host's existing settings, and report unrelated failures
separately. Do not silently widen edits to similar sites, dependencies, CI, or public contracts.

## Load references selectively

| Concern                                                                                            | Read                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ownership, boundaries, Clean Architecture tools, evolution, reuse, migrations                      | [Boundaries and evolution](references/boundaries-and-evolution.md)                          |
| persistence, effects, retries, async/concurrency, streams and resources                            | [Data, concurrency, and effects](references/data-concurrency-and-effects.md)                |
| tests, legacy work, operations, performance, rollout, durable learning                             | [Testing, maintenance, and operations](references/testing-maintenance-and-operations.md)    |
| authorization, tenancy, injection/sinks, secrets, dependencies                                     | [Security and trust](references/security-and-trust.md)                                      |
| local design/readability, JS/TS idioms, runtime types, modules, errors, packages, and Zod criteria | [JavaScript and TypeScript runtime and ecosystem](references/jsts-runtime-and-ecosystem.md) |
| components, state/effects, SSR/hydration, accessibility, browser performance                       | [Frontend and browser](references/frontend-and-browser.md)                                  |

In mixed Python/JS/TS work, use both skills only when the contract or implementation crosses
languages. Synthesize one source of truth, serialization/validation and compatibility rules, and
combined verification—not two unrelated local answers.

## Fallbacks and completion check

- With only a snippet or no repository, reason locally, state assumptions, and avoid repository-wide
  architecture prescriptions.
- When tests, runtime execution, browser/environment evidence, or current primary sources are
  unavailable, do not claim the affected guarantee is verified; give the narrowest useful
  verification step.
- When types, executable behavior, environment configuration, and declared contracts conflict,
  distinguish what each proves and expose the unresolved conflict.
- For generated, bundled, or vendored code, locate the maintained source of truth before
  recommending a direct edit.
- Treat suspicious but unreachable code as cleanup or residual risk, not a live severe defect. A
  review may legitimately have no actionable findings.

Before finishing, confirm that the answer or change stays within the actual task unit, every finding
has a reachable mechanism and inspected evidence, every recommendation beats the cheaper alternative
over the relevant horizon, runtime/library claims match the deployed targets and versions, and
verification is sufficient or explicitly limited.

## Small example

A large React component is not a finding by itself. Trace ownership. If state and effects are
cohesive and stable, leave it alone. If URL state, server cache, draft input, and a subscription
overwrite each other and stale responses can win, identify the reachable race. Prefer the smallest
boundary that assigns ownership and cancellation, test the stale-result sequence, and keep
framework-native state/data primitives when adequate. Do not prescribe a component folder tree or
micro-frontend.
