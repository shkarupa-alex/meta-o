---
name: mo-e2e
description: Use only when the user explicitly requests mo-e2e or an active mo-orchestrate-orca calls it; verify agent-required scenarios on one frozen exact SHA.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
---

# Agent-required end-to-end verification

Start only when the user names `mo-e2e` or the active orchestration skill calls
it. A generic request to run tests does not activate this agent lifecycle.

Read [Обратная связь о методологии](references/methodology-feedback.md)
completely: friction you hit is reported to the caller as one ordinary
`Methodology-Friction:` message, and this actor writes no Issue itself.

This skill ships its own scripts in `scripts/` beside this `SKILL.md`. Every
`scripts/<name>` this skill and its references name is that file, never a path
in the project checkout, and it runs from this skill's directory with the full
path in double quotes, which also holds for a path with a space:

```text
node "<this skill's directory>/scripts/mo-knowledge-layer.mjs" --help
```

Read the knowledge layer of the candidate with bundled
`scripts/mo-knowledge-layer.mjs --candidate <sha>`. `not_enabled` is no gap: the
project never adopted the layer or switched it off. `needs_attention` — a
missing `MO-BACKLOG/1` command, papercut document or identifier-history gate in
a project that had or half-declared them — is a readiness gap: record the
helper's reason and copy its `missing=` field as printed, never a list derived
from the tree, return `needs_attention`, and leave running the setup skill to
the human.

Act as a separate read-only E2E actor. Receive one full frozen candidate SHA,
the task/spec locator and `scope=task` or `scope=full`, optionally with
`scenarios=<id,…>` for a partial rerun. Read the project's E2E contract and
acceptance-to-proof mapping. Run only scenarios that genuinely need an agent;
deterministic console checks belong to QC.

With `scope=task` you choose the task's scenarios by the behavior the task
touches, not by which acceptance rows its diff edits: the scenarios of the rows
the specification changes or adds, and the scenarios of unchanged rows whose
behavior the task touches, restores or depends on — a regression fix restores
an existing requirement without changing its row. With `scenarios=<id,…>` run
exactly those, and only those. `scope=full` runs every scenario and only when
the caller says the user asked for it; never widen `task` to `full` on your own.

Reject a candidate that is not an exact frozen 40-hex SHA before launching an
actor, preserve it unchanged, and record `NOT_RUN` with the exact validation
reason. When a required environment or approved actor profile is unavailable,
record `NOT_RUN` with the exact reason; never guess a SHA or silently change the
model, route or effort. A pass on an earlier SHA is that SHA's evidence: never
report it as a pass of the candidate.

Do not edit or commit tracked files. Use a unique namespace and clean up exact
resources on pass, fail and unknown. Trust a harness or Orca writes for a
fixture path into a personal or account configuration — `~/.claude.json`,
`~/.codex/config.toml`, the Orca Codex account's `config.toml` — is not yours to
edit while live sessions share that file: list each entry in the cleanup status
with the exact command that removes it, and the human removes it. Never run a production, destructive,
credential or subscription action until the user explicitly authorizes that
exact named action for this candidate. Authorization is current-run control,
not product intent, and does not mutate tracked intent ledgers.

For every scenario report the full candidate SHA, ID, the exact actor (its Orca
terminal handle and its route, model and effort), environment, action, observed
result and `PASS`, `FAIL`, `UNKNOWN`, `NOT_RUN` or `NOT_APPLICABLE`, or
`blocked:external_capability` where the project's E2E contract itself types that
scenario's result for a named external capability; that typed result is reported
as typed and is never `PASS`. Do not include secrets, reasoning or raw artifact
dumps. A complete run passes only when every selected applicable scenario passes
on the unchanged SHA. Missing or incomplete evidence is `UNKNOWN`; there is no
partial pass.

Return a short human-readable result with the exact tested SHA, scenario results,
unresolved problems and cleanup status. Every selected scenario also gets one
evidence line and one coverage trace in the complete `worker_done`, which the
caller copies verbatim into the review brief and the final report:

```text
E2E-Evidence: <scenario-id> sha=<40-hex> result=<pass|not_applicable> source=<dispatch-id>
E2E-Coverage: <scenario-id> acceptance=<row-id>[,<row-id>…] signals=<observed signs> paths=<key paths>
```

`sha` is the candidate you ran on and `source` is your own Dispatch id.
`E2E-Coverage` is the basis of applicability: the acceptance rows the scenario
proves, the signs you observed and the key paths of the behavior, so a reviewer
can judge whether a later change touches it. A scenario that did not pass still
gets its line, with `result=` naming its lowercase result such as `fail`,
`unknown` or `not_run`; only `pass` and `not_applicable` are evidence, and the
caller starts no review while any other result stands.

Do not create a receipt, manifest, registry, digest, tracked evidence ledger or
external sink.

Use one run-wide 300000 ms blocking waiter for active E2E actors. A quiet
timeout permits one public reconciliation and re-arm without narration: read
the Run's unread messages, and for each actor's Dispatch treat `completed` as
done whatever its liveness says, processing its final message first; a
truncated terminal preview proves no outcome. One repeated transport failure
gives `UNKNOWN`.

After a compaction — Claude Code's continuation summary at the start of the
context, Codex's compaction notice, or, where neither is recognizable, a summary
of earlier work instead of the original messages at the start of a turn — act on
nothing first. Reread this `SKILL.md` completely and every reference it names,
then restore the run from public Orca, never from the summary: each actor's
Dispatch state and complete final message, and the `E2E-Evidence` lines of the
scenarios already finished. Until both are done start, message or release
nothing, and never report a scenario result the summary alone remembers. Task bytes wait for
a proven normal agent prompt and every resource must preserve the initial Orca
project-registration inventory. A disposable fixture that Orca has to place is
registered only on the human's confirmation for this run and removed with
`orca project setup-delete`, so the inventory after the run equals the one
before.

An actor whose scenario starts workers, such as a reviewer pair or an executor,
runs as an ordinary Orca tab. Orca refuses a worker that another worker starts,
so an actor dispatched as a worker records every such scenario `NOT_RUN`.

## Meta-O calls

- none
