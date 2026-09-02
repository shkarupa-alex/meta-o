# Security and trust

Read this when data or control crosses a trust boundary, or code touches identity, authorization, tenancy, secrets, privacy, deserialization, files, processes, network destinations, templates, dependencies, or privileged effects. Security findings need a plausible reachable path and impact—not a disliked API name.

## Trace the boundary

Identify assets, actors, trust levels, entry points, transformations, authorization decisions, sinks/effects, and safeguards. Treat HTTP/message payloads, parsed JSON/YAML, environment/config, database rows, caches, files, CLI input, webhook claims, model output, and dependency responses according to their actual provenance. Python annotations, `TypedDict`, dataclasses, casts, and ORM types do not validate runtime input.

Validation proves shape and allowed representation. Domain/application code still owns business meaning and authorization. Parse untrusted data once near the boundary into a trustworthy representation when useful; reject or safely normalize ambiguity. Avoid mass assignment: distinguish fields a caller may send from stored/internal/admin fields and define omitted versus explicit-null behavior for partial updates.

## Authorization and tenancy

Authentication establishes an identity claim; authorization decides whether that actor may perform this action on this resource now. Enforce authorization on the trusted server side at a boundary that all entry points use. Check object ownership/tenant scope in the data access or operation path so a fetched identifier cannot escape its tenant. UI hiding and client-supplied tenant/user IDs are not authorization.

For elevated/service actions, make actor, delegated authority, scope, and audit meaning explicit. Cache authorization only with correct invalidation and scope. Test cross-tenant/object references and both allowed/denied paths using the real query constraints where isolation depends on them.

## Dangerous sinks

- **SQL/query:** use parameterization and allowlisted identifiers/operators; ORM use does not make dynamically assembled clauses safe.
- **Process/shell:** prefer argument arrays with `shell=False`; allowlist executable/operation; constrain environment, cwd, timeout, output, and privilege. Quoting user input into a shell command is fragile.
- **Files/archives:** resolve against an allowed root, reject traversal/symlink escape as appropriate, bound size/count, use safe temporary files, and avoid trusting filenames/content types. Archive extraction needs path and decompression-bomb controls.
- **Outbound HTTP:** constrain schemes/hosts/ports and redirect behavior; protect credentials and internal metadata/network ranges where user-controlled URLs are possible; set timeouts and response-size limits.
- **Deserialization/templates:** avoid unsafe pickle/eval/exec and unsafe YAML/object loaders for untrusted data; use safe formats/loaders and explicit types. Escape for the actual output context.
- **Secrets:** do not log or serialize secrets; use secret storage/config facilities, least privilege, rotation and revocation. Redaction needs tests for structured and exception paths.

Do not merely ban an API: show attacker-controlled data reaching the sink, the missing safeguard, and the consequence. Conversely, do not dismiss a dangerous operation because input “should be internal” without tracing how that trust is established.

## Privacy and dependencies

Minimize collected/exposed data, purpose, retention, access, and propagation. Logs, traces, analytics, error reports, fixtures, and backups are data stores. Use identifiers and bounded metadata instead of payloads where possible.

For dependencies, verify the actual locked package, source/registry, integrity/lock behavior, maintainer/release/advisory state, license, transitive/native/build risk, and repository fit. Do not install or execute research artifacts to inspect them. Popularity is only adoption context. Prefer existing or standard facilities when they meet the security and maintenance constraints; fewer dependencies is not automatically safer than bespoke security-sensitive code.

## Severity and non-findings

Calibrate by attacker capability, reachability, affected asset/tenant, privilege, default deployment, detectability, and recovery. Missing runtime validation may be critical at an authorization, tenant, money, destructive-command, persistence-key, or code-execution boundary, and irrelevant for a value already established inside a trusted path.

Do not emit a security finding when the suspicious path is unreachable, input is proven trusted by an enforced boundary, a framework safeguard is active for this exact sink, or impact is speculative. Record the missing evidence and a verification step when trust/reachability remains unclear.

## Focused example

An export endpoint joins a configured directory with a request filename and opens it. Trace whether the filename is external, resolve the candidate path, and prove containment beneath the allowed root while accounting for symlinks and platform behavior. Add size/access checks and traversal tests. Do not flag a constant internal filename passed through the same helper without an attacker-controlled path.

```python
path = export_root / request.query_params["name"]
return FileResponse(path)
```

The signal becomes a finding only when an external name can escape the allowed root or access an unauthorized file and no effective containment check exists.
