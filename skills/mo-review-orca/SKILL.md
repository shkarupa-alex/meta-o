---
name: mo-review-orca
description: Independently review the current candidate through two concurrent Orca orchestration workers, using shared review and backlog lenses, and return complete same-SHA verdicts without editing code.
license: MIT
---

# Review through Orca

Read [Review protocol](references/review-protocol.md),
[Backend contract](references/backend-contract.md), and
[Orca native mechanics](references/orca-mechanics.md) completely.

Create one Orca Run and two review tasks, then start both workers before waiting.
Use their complete `worker_done` bodies; do not use private transcript retrieval.
Never use `/goal`, edit, commit or run mutating diagnostics. Report E2E as not
evaluated unless separately requested.
