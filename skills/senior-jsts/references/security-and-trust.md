# Security and trust

Read this when data or control crosses a trust boundary, or code touches identity, authorization, tenancy, secrets, privacy, DOM/HTML/URL sinks, deserialization, files, processes, network destinations, dependencies, or privileged effects. Findings need a plausible reachable path and impact—not a disliked API name.

## Trace the boundary

Identify assets, actors/environments, trust levels, entry points, transformations, authorization decisions, sinks/effects, and safeguards. Network/message payloads, `JSON.parse`, URL/search params, storage, DOM attributes, environment/config, database rows, postMessage, worker messages, telemetry, and dependency responses are runtime `unknown` until the relevant boundary establishes otherwise. TypeScript annotations, assertions, generics, and generated types do not validate them.

Parse/validate near the boundary into a representation appropriate for trusted internal use. Validation proves shape and allowed representation; business meaning and authorization remain separate. Prevent mass assignment and define omitted versus explicit `null` semantics for partial updates. On cross-language contracts, choose one schema/source of truth and verify both runtimes' serialization and rejection behavior.

## Authorization and tenancy

Authentication establishes identity; authorization decides action on resource now. Enforce on the trusted server side through every entry point. Scope object queries by tenant/owner where appropriate; do not accept client-supplied tenant/user IDs or hidden UI controls as authority. Browser guards improve UX, not server authorization.

For service/admin/delegated actions, define actor, authority, scope, and audit meaning. Test IDOR/cross-tenant references, allowed/denied paths, and real query constraints. Cache authorization only with correct identity/tenant/policy keys and invalidation.

## Dangerous sinks

- **DOM/HTML:** prefer text/property APIs and framework escaping; sanitize with a suitable maintained sanitizer when intentionally rendering HTML. Trace `innerHTML`, `dangerouslySetInnerHTML`, template injection, scriptable URLs, SVG, and DOM clobbering in their exact contexts.
- **URL/navigation:** allowlist schemes/origins/actions; do not concatenate untrusted redirects, script URLs, or resource URLs.
- **SQL/query:** parameterize values and allowlist dynamic identifiers/operators. Query builders do not make raw fragments safe.
- **Process/shell:** prefer argument arrays and no shell; constrain executable, args, env, cwd, timeout, output, and privilege.
- **Files/archives:** contain resolved paths, symlinks, names, size/count, temporary-file behavior, and decompression.
- **Outbound HTTP:** constrain scheme/host/port/redirects, internal ranges and credentials; set timeout, abort, and response-size limits.
- **Deserialization/code:** avoid `eval`, `Function`, unsafe object revival, prototype-sensitive merging, and trust in parsed JSON. Guard prototype keys when merging dynamic objects.
- **Cross-window messaging:** verify origin and message schema; bind reply/privilege to the intended source.

Show attacker-controlled data reaching the sink and the missing safeguard. A framework's default escaping only covers the contexts it actually owns.

## Browser privacy, secrets, and supply chain

Anything shipped to a browser is observable; build-time “secret” variables included in a client bundle are not secret. Minimize tokens and personal data in URLs, storage, logs, analytics, traces, errors, caches, and third-party scripts. Consider CSP, cookie attributes, CSRF protection, CORS, and token storage according to the actual architecture and threat—not as a checklist.

For dependencies, verify the locked identity/source/integrity, install/build scripts, maintainers/releases/advisories, license, transitive surface, runtime targets, and fit. Avoid executing untrusted research or package scripts merely to inspect them. Popularity is discovery/adoption context, not proof. Bespoke security-sensitive parsing/crypto/sanitization is usually riskier than a well-fitted maintained solution, but dependency count alone is not security.

## Severity and non-findings

Calibrate by attacker capability, reachability, affected asset/tenant, privilege, default deployment, detectability, and recovery. A cast at a proven internal boundary may be harmless; the same cast on a tenant ID, money value, DOM payload, or command can be severe.

Do not emit a security finding when the path is unreachable, trust is enforced earlier, applicable framework protection covers this exact sink, or impact is speculative. Record missing evidence and the verification needed when reachability remains unclear.

## Focused example

A React component renders server-provided markup with `dangerouslySetInnerHTML`. Trace who can influence the value and whether a maintained sanitizer with the correct policy runs after the last transformation. Test an executable payload and benign allowed markup. Do not flag ordinary JSX text interpolation, which the framework escapes for that context.

```tsx
return <article dangerouslySetInnerHTML={{ __html: post.body }} />;
```

The signal becomes a finding only when untrusted markup reaches this sink without a suitable final sanitization/allowlist. Ordinary `{post.body}` text interpolation is a non-flag case for this mechanism.
