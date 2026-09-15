---
name: mo-setup
description: Use only when the user explicitly requests mo-setup; inspect or bring a project and its environment to the Meta-O contract.
license: MIT
---

# Set up a project for Meta-O

Start only when the user names `mo-setup`; a generic environment or tooling
question does not activate setup mutation.

Read [Project setup contract](references/project-setup.md),
[Backend contract](references/backend-contract.md), and
[Purpose and architecture contract](references/purpose-and-architecture.md)
completely. For Python read [Python QC profile](references/qc-python.md); for
JavaScript/TypeScript read
[TypeScript QC profile](references/qc-typescript.md). Read both for a mixed
project.

Inspect substance: business/architecture ids, glossary, README, byte-identical
agent contracts, temporary feature backlog, acceptance/E2E, purpose, mature
language gates and one deterministic non-mutating aggregate QC. Require the
smallest regression test for a confirmed behavioral defect and an invariant
comment for substantial ownership/concurrency/trust/security/compatibility/
transaction/resource-lifetime repair.

Find the project's documented backlog path and closure command. Verify
`MO-BACKLOG/1` in a disposable fixture: committed-blob identity, empty,
not-empty, typed unknown, dirty declared path, unrelated dirt, malformed UTF-8/
schema/mode and non-mutation. Require G0/GC/G1/G2 in the project contract.
Ordinary QC must test the reader/schema but not assert the current branch empty.

Check `.orca/` and `spec/` independently through
`git check-ignore -v --no-index`; accept only a match from a tracked repository
ignore file proven by `git ls-files --error-unmatch`.

Resolve one absolute Orca binary. Require non-empty version-matched bundled
`orchestration` and `orca-cli` guides via `orca skills list/get --json`;
never install guide copies. Separately prove native status/project identity,
provider auth, account freshness, selected-harness launch, normal prompt versus
trust UI/shell, stable title capability, one owner of unsandboxed posture, and
supported blocking-wait duration.

Check `orca`/`orca-cli` separately from the upstream
`orchestration` companion. Also check mature `jq` and `flock` dependencies.

Read `ProjectRegistrationSet/1` and `OwnedResourceSet/1`. A folder/no-project
workspace without an existing same-project isolated route is a setup gap. Never
register a temporary path as a review workaround. Any project/repository
registration or personal trust/posture change requires separate human
confirmation.

Inspect active hosting/CI settings read-only. Parse GitHub Actions or GitLab CI
only with `js-yaml`, following literal tracked local includes/reusable
workflows. Return one `CI-Coverage/1` record with provider, repository,
entrypoint, resolved graph, job/step, events, required policy, outcome and
unresolved. Outcomes are `covered|config_present|no_ci_surface|unknown`;
dynamic/remote constructs and unreadable settings cannot yield covered. Show an
exact proposed YAML patch, but never change tracked CI or server protection
without a separate request.

If tracked repair is accepted, use a separate `feature/meta-o-setup` branch
based on current `develop`; never mix setup
repair into the current feature branch. Preserve unrelated work. Report each missing
control, companion, capability, credential and policy independently.

## Meta-O calls

- none
