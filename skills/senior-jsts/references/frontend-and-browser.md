# Frontend and browser

Read this when components, UI state, effects, SSR/hydration, browser APIs, accessibility, client security/privacy, rendering, network performance, or frontend ownership can change the judgment.

## Components and state ownership

Component boundaries should follow cohesive behavior, ownership, reuse, or independent change—not arbitrary size. Colocate code that changes together while keeping public component contracts small. Extract hooks/services/state machines only when they establish a clearer owner or reusable contract; avoid layers that merely rename framework APIs.

For React-style components, a consistent local ordering can aid navigation, but dependency and ownership relationships take priority over one universal hook layout. A custom hook should give related state/effects a declarative contract, isolate a real external synchronization concern, or reuse stateful logic; a short clear effect may stay local. Native elements and composed components may coexist when the JSX remains cohesive and its intent is visible.

Classify state before adding a store:

- server state/cache: remote source of truth, freshness, invalidation, optimistic updates;
- URL/navigation state: shareable/back-forward/bookmark contract;
- persistent client state: storage schema, privacy, version/migration;
- cross-component application state: shared owner and update policy;
- ephemeral UI/draft state: keep local unless real sharing/lifecycle pressure exists;
- derived state: compute from source when feasible instead of synchronizing copies.

Flag multiple writable sources only when they can diverge or overwrite user/remote state. A global store is not inherently senior architecture; neither is local state when multiple owners need coordination.

## Effects and asynchronous UI

An effect should synchronize with something outside rendering, not derive values that could be computed directly. Make dependencies and cleanup reflect actual ownership. Trace timers, subscriptions, observers, DOM mutations, requests, and event listeners through mount/unmount and parameter changes.

Prevent stale-result races by aborting obsolete work, associating results with the current request/version, or using framework data primitives that own this. Cleanup alone may not stop a remote effect. Define optimistic update rollback and conflict behavior. Avoid fire-and-forget promises whose failures disappear after navigation/unmount.

Example: search request B finishes before A, then A overwrites results. Prove reachability from rapid input/network order. Use cancellation or request identity at the owner; test out-of-order resolution. Do not prescribe a new state library if the framework facility already handles it.

## Server, client, edge, and hydration

Know where code executes and which APIs/data are available. Prevent server-only secrets/modules from entering client bundles. Treat server-to-client serialized props and hydrated state as a public trust boundary. SSR HTML and first client render must agree on deterministic content or deliberately isolate client-only differences; clocks, randomness, locale, environment checks, and data races commonly cause hydration mismatch.

Server components/actions, loaders, edge handlers, workers, and browser components have different lifetime, caching, security, and module constraints. Follow the framework's executable model unless a demonstrated issue justifies an additional boundary.

## Accessibility is correctness

Prefer semantic HTML and native controls before ARIA. Ensure keyboard access, visible focus, accessible names, labels/errors, focus management for dialogs/navigation, correct heading/landmark structure, live announcements when needed, contrast, motion preferences, and appropriate touch targets. Automated checks catch only part of this; verify key flows with keyboard and accessibility-tree/screen-reader evidence proportionate to risk.

Do not flag every missing ARIA attribute; unnecessary or incorrect ARIA can reduce accessibility. Name the affected user action and failure.

## Browser security and privacy

Route security-sensitive sinks to [security-and-trust.md](security-and-trust.md). Remember that client code/config is observable, URL/storage/DOM/postMessage values are untrusted by default, third-party scripts share powerful context, and analytics/error capture can leak sensitive data. Decide cookie/CORS/CSRF/CSP/token behavior from the actual server/browser trust model rather than a generic checklist.

## Rendering, network, and bundle performance

Measure user-relevant outcomes: interaction responsiveness, long tasks, layout/paint, network waterfall, cache behavior, hydration cost, memory, and bundle chunks. Inspect why components render, whether work is expensive, list virtualization needs, image/font loading, duplicate dependencies, route splitting, and server/client transfer. Memoization, virtualization, code splitting, prefetching, and caching each add invalidation or complexity cost; use them against measured bottlenecks.

Avoid microbenchmarks or blanket “memoize everything.” A larger bundle may be acceptable for a rarely loaded admin route; a small dependency can be costly if duplicated or executed on every interaction.

Browser-native custom elements can be a useful stable leaf boundary when the same component must work across frameworks or framework-free surfaces. Before choosing them, check accessible semantics, forms and event contracts, server rendering/hydration, styling/theming, upgrade timing, and whether the owning team can support the platform-level implementation. They are not evidence that an application framework should be removed.

For micro-frontends, climb the smallest remedy ladder justified by team and release pressure: first improve module/package ownership, monorepo boundaries, and build caching; then consider route/zone separation; use within-page runtime composition only when independently deployed UI at that seam is a demonstrated requirement. Verify cross-boundary auth, navigation, shared contracts/design, telemetry, SSR/hydration, dependency duplication, integration tests, mixed releases, and rollback. Keep one application when these costs exceed the blocked-team or release benefit.

## Frontend non-findings

Do not flag:

- a large cohesive component with clear state/effect ownership;
- prop drilling over a short stable path;
- framework-native server state instead of a repository/custom client layer;
- controlled or uncontrolled inputs when ownership is deliberate and correct;
- client-only rendering when SEO/first-paint/server requirements do not apply;
- absence of micro-frontends without organizational/release isolation pressure;
- rerenders without measured or visibly reachable cost.

## Detectable signal example

```ts
useEffect(() => {
  fetch(`/search?q=${query}`).then(r => r.json()).then(setResults);
}, [query]);
```

Rapid query changes can let an older response overwrite a newer one and can update after unmount. Trace whether the framework/client already cancels or versions requests; if it does, this shape is not independently a finding. Otherwise add cancellation/request identity and test reversed completion order.
