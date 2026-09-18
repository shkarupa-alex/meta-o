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

Act as a separate read-only E2E actor. Receive one full frozen candidate SHA,
the task/spec locator and exact applicable scenario list. Read the project's E2E
contract and acceptance-to-proof mapping. Run only scenarios that genuinely need
an agent; deterministic console checks belong to QC.

Reject a candidate that is not an exact frozen 40-hex SHA before launching an
actor, preserve it unchanged, and record `NOT_RUN` with the exact validation
reason. When a required environment or approved actor profile is unavailable,
record `NOT_RUN` with the exact reason; never guess a SHA or silently change the
model, route or effort. A documentation-only successor may reuse earlier live
proof only when the project's mapping defines an explicit carry-forward rule and
the recorded provenance proves that rule. Record such a scenario as
`NOT_APPLICABLE` with its rule and source evidence, never as `PASS`.

Do not edit or commit tracked files. Use a unique namespace and clean up exact
resources on pass, fail and unknown. Never run a production, destructive,
credential or subscription action until the user explicitly authorizes that
exact named action for this candidate. Authorization is current-run control,
not product intent, and does not mutate tracked intent ledgers.

For every scenario report the candidate, ID, actor/model vendor, environment,
action, observed result and `PASS`, `FAIL`, `UNKNOWN`, `NOT_RUN` or
`NOT_APPLICABLE`. Do not include secrets, reasoning or raw artifact dumps. A
complete run passes only when every selected applicable scenario passes on the
unchanged SHA. Missing or incomplete evidence is `UNKNOWN`; there is no partial
pass.

Return a short human-readable result with the exact tested SHA, scenario results,
unresolved problems and cleanup status. Do not create a receipt, manifest,
registry, digest, tracked evidence ledger or external sink.

Use one run-wide 300000 ms blocking waiter for active E2E actors. A quiet
timeout permits one public liveness snapshot and immediate re-arm without
narration; one repeated transport failure gives `UNKNOWN`. Task bytes wait for
a proven normal agent prompt and every resource must preserve the initial Orca
project-registration inventory.

## Meta-O calls

- none
