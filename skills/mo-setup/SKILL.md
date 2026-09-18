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
Do not create a backend fixture document in an ordinary target project without
a named consumer.

Find the project's documented backlog path and closure command. Verify
`MO-BACKLOG/1` in a disposable fixture: committed-blob identity, empty,
not-empty, typed unknown, dirty declared path, unrelated dirt, malformed UTF-8/
schema/mode and non-mutation. Require G0/GC/G1/G2 in the project contract.
Ordinary QC must test the reader/schema but not assert the current branch empty.

Read [Knowledge id history contract](references/knowledge-id-history.md) and
check current-tree agreement separately from history. Never guess: take the
declared stage from a level-two section whose heading contains
`Knowledge id history`, holding exactly one fenced one-line command, exactly one
line naming the authoritative QC command, and exactly one `history_cutoff_sha`
record. Parse it with a Markdown AST. Any other count is `history=unknown` with
`cutoff=none`. The same contract must name where identifiers live: the business
document and the architecture directory the stage reads. Unnamed, ambiguous or
contradictory locations are `history=unknown cutoff=none` and no fixture is
written at all — a fixture built on a guessed location certifies documents
nobody checks, or edits a clone at random.

Prove the stage by its own behavior, never by the project's full QC, and only in
a disposable clone: `git clone --no-hardlinks --no-local <path> <tmp>` under a
disposable `TMPDIR`, no network. The candidate worktree is never opened for
writing. Budget 600 s for the whole probe and 120 s for one stage run; exceeding
either is `unknown` naming the exhausted budget, never `gate_missing`. The stage
must be a substring of the declared QC command, or it is `gate_missing`: a stage
outside the authoritative check is a stage nobody runs. A red baseline run in the
clean clone is `gate_failing` and stops the probe.

Then two fixtures, in the clone only, touching only the declared locations and
only definitions the AST actually found there. Delete one identifier definition
and commit without a trailer: the stage must exit non-zero and print a typed marker, either
`MO-KNOWLEDGE-HISTORY/1 status=violations` or the project's documented equivalent;
a zero exit or no marker is `gate_missing`. Reset the clone with `git reset --hard`
and `git clean -xdff`, then change a literal with a correct trailer and a matching
`knowledge_id_change` record: the stage must pass, and a failure is `gate_failing`.
Strictness without tolerance and tolerance without strictness each prove only half.
Delete the clone in a `finally`; its path is machine-local and never reported.

Report one record, with `qc` as JSON or `none` and no local paths:

```text
Knowledge-IDs/1 current_tree=<ok|violations|unknown> history=<gate_present|gate_missing|gate_failing|unknown> stale=<yes|no|unknown> qc=<json|none> cutoff=<sha|none>
```

Compute `stale` by hashing, not by trusting the version string: hash the bundle
you ship by the documented rule and compare with the hash in the copy's last-line
`MO-KNOWLEDGE-HISTORY-SOURCE` comment. Equal is `stale=no`; different is
`stale=yes` and both `<semver>` values go in the report; a missing, duplicated or
unparsable line is `stale=unknown`. The version explains a difference to a human
and never decides it.

Find the commands-and-papercuts document by content, not only at
`docs/papercut.md`, and report `Papercut/1 path=<json|none> linked=<yes|no>`
where `linked` means `AGENTS.md` actually links it. Accepted repair starts from
[Commands and papercuts template](references/papercut-template.md).

Accepted repair copies two shipped bundles into the project, each with its
`tools/licenses/`, and both then belong to the project. `scripts/mo-backlog.mjs`
goes to `tools/mo-backlog.mjs`, and the closure command that calls it must name
that project's own `--path`, `--title`, `--open-heading` and every
`--entry-field`: without the whole schema the checker would hold a foreign
notebook to this project's Russian wording, and a partial schema is a call
error. `scripts/mo-knowledge-history.mjs` goes to
`tools/mo-knowledge-history.mjs` with its version line; a stage calling it joins
the project's own QC with the project's own cutoff, and `AGENTS.md` gains the
declaration section plus the trailer grammar with verbs `remove|reuse|editorial`.
Never copy this project's boundaries or commit ids: a foreign cutoff exempts
exactly the history the target needs checked. Propose no CI job naming a path
this repair does not create.

Check `.orca/` and `spec/` independently through
`git check-ignore -v --no-index`; accept only a match from a tracked repository
ignore file proven by `git ls-files --error-unmatch`. Separately require
`git ls-files -- .orca/ spec/` to be empty: an ignore match never proves that
already-indexed private workspace bytes are absent.

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
confirmation; the project root the user named at this call, and this run's own
resources, are that confirmation already.

Probe the named project root live and report one line:

```text
Harness-Trust/1 harness=claude path=<json> state=<trusted|accepted|needs_human|unknown> screen_version=<id>
```

`accepted` is reported only when all three ownership conditions held: the
terminal was created by this run and recorded in `OwnedResourceSet/1`, the
realpath of the path in the dialog equals the realpath of that terminal's
worktree, and that worktree is a run resource or the root the user named.
Confirming the dialog means answering for whatever is in that folder, so a
missing condition is `needs_human` with the recipe — open the tab `<title>` and
choose *Yes, I trust this folder* — and never a retry.

Inspect active hosting/CI settings read-only. Parse GitHub Actions or GitLab CI
only with `js-yaml`, following literal tracked local includes/reusable
workflows. Return one `CI-Coverage/1` record with provider, repository,
entrypoint, resolved graph, job/step, events, required policy, outcome,
unresolved, plus `history=<full|shallow|unknown>` and
`backlog_job=<yes|no|unknown>`: a shallow clone turns the history stage into a
silent skip, and closure needs a job separate from ordinary QC. Outcomes are
`covered|config_present|no_ci_surface|unknown`; dynamic/remote constructs and
unreadable settings cannot yield covered. Compare against the shipped examples in
`assets/ci/` and show an exact proposed YAML patch, but never change tracked CI
or server protection without a separate request.

If tracked repair is accepted, use a separate `feature/meta-o-setup` branch
based on current `develop`; never mix setup
repair into the current feature branch. Preserve unrelated work. Report each missing
control, companion, capability, credential and policy independently.

## Meta-O calls

- none
