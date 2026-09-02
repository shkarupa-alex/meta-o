---
name: find-reuse
description: Produce a portable, read-only evidence report about whether to reuse, extend, or build. Run only for an explicit reuse-research request; do not trigger for ordinary package questions.
license: MIT
---

# Find reusable solutions

This skill is a portable report producer. It knows no caller-specific paths, feature
lifecycle, destination document or commit policy. It never writes repository
files, installs tools, logs in, or asks for credential values.

Read [request and report contracts](references/contracts.md) and
[source adapters](references/adapters.md) completely before searching.

## Input

Accept only a Markdown request whose YAML block declares
`contract: find-reuse.request.v1`. Reject an absent or unknown contract before
searching. Preserve every business requirement id and priority.

## Search

1. Detect applicable surfaces from the request, repository remotes, manifests,
   lockfiles and imports. A named private source remains applicable when auth is
   missing.
2. Probe each required tool and exact capability before use. Give OS-aware
   install or login help when unavailable, but do not install or authenticate.
3. Run commands as argument arrays. Never interpolate a query into a shell
   string. Record errors as coverage gaps, not empty results.
4. Perform required discovery on every applicable surface, then enrich each
   finalist from its source host and registry when both exist.
5. Merge identities only with authoritative package metadata or repository-owned
   evidence. Keep forks, mirrors and monorepo members distinct.
6. Compare requirements, integration cost, provenance, license, maintenance,
   adoption and security evidence. Preserve source, observation time and metric
   window; never compare popularity numbers across ecosystems as one scale.

For a new component without a fixed ecosystem, search GitHub and GitLab plus
registries for the two most suitable allowed stacks and record the rationale.

## Output

Return one complete `find-reuse.report.v1` Markdown document and nothing that
claims repository mutation. Include every required section and every applicable
surface, including failures and unknowns.

`build` is allowed only with `coverage: complete`. If any required tool, auth,
source or enrichment is unavailable, return `status: unknown` and
`coverage: partial|blocked`. A genuine empty result is evidence only after a
successful operation.

This skill does not decide where the report is saved or whether implementation
may proceed after `unknown`; those decisions belong to its caller.
