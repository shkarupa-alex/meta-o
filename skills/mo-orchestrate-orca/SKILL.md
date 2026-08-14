---
name: mo-orchestrate-orca
description: Run a whole feature from task or spec to one verified candidate SHA through Orca orchestration workers, with two independent reviews and applicable E2E.
license: MIT
---

# Orchestrate a feature through Orca

Read [Feature lifecycle](references/methodology.md),
[Backend contract](references/backend-contract.md),
[Review protocol](references/review-protocol.md), and
[Orca native mechanics](references/orca-mechanics.md) completely.

Use Orca only. Confirm `orca`, its version-matched upstream `orchestration`
companion skill, the bound worktree and all required public capabilities. Follow
the shared lifecycle exactly. The complete `worker_done` message is the settled
response; never substitute a private hook-reported transcript. The orchestrator
does not inspect or edit product code. Return one verified full SHA or honest
`needs_attention`.
