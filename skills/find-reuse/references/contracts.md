# Request and report contracts

## Request

The logical input is human-readable Markdown containing this YAML shape:

```yaml
contract: find-reuse.request.v1
problem: <problem to solve>
business_requirements:
  - id: BR-1
    text: <generic requirement>
    priority: must|should|could
constraints:
  - <constraint>
repository_root: <optional path>
depth: quick|standard|deep
```

Unknown contract versions are rejected before discovery. Business requirements
must not depend on a repository-specific document being available to this
portable skill.

## Report

The response is Markdown with this frontmatter:

```yaml
---
contract: find-reuse.report.v1
status: reuse|extend|build|unknown
coverage: complete|partial|blocked
---
```

It has exactly these top-level sections:

1. `Decision` — status and a short evidence-backed reason.
2. `Requirement fit` — every must and should requirement mapped to candidates.
3. `Search coverage` — surface, query, tool, auth, result or exact error.
4. `Candidates` — canonical identity, provenance, license, release,
   maintenance, adoption and security signals.
5. `Rejected candidates` — candidate-specific reason.
6. `Unknowns` — missing evidence and its consequence.
7. `Recommended next step` — advice without repository mutation.

Coverage is complete only when every applicable surface completed required
discovery and every finalist completed required enrichment, or a surface has a
rule-based `not_applicable` entry with evidence. Missing tools, auth, rate limits,
unavailable sources and malformed output make coverage partial or blocked and
forbid `build`.

## Identity

Represent source repository identity with canonical host, owner and name, and
package identity with ecosystem plus normalized package id. Relationships are
one of `authoritative_same_project`, `possible_same_as`, `fork`, `mirror` or
`monorepo_member`, each with evidence.

Package and repository records merge only through authoritative registry
metadata, repository-owned manifest/release evidence, or an explicit upstream
relationship. A matching name or description is only `possible_same_as`.
