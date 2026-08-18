---
name: mo-review-paseo
description: Independently review the current candidate through two concurrent Paseo agents, using shared review and backlog lenses, and return complete same-SHA verdicts without editing code.
license: MIT
---

# Review through Paseo

Read [Review protocol](references/review-protocol.md),
[Backend contract](references/backend-contract.md),
[Paseo native mechanics](references/paseo-mechanics.md), and
[Purpose and architecture contract](references/purpose-and-architecture.md)
completely. Read the purpose contract before applying reviewer B's architecture
lens.

Start two background review agents before waiting. Require complete public
settled-response retrieval from both. Never use `/goal`, edit, commit or run
mutating diagnostics. Report E2E as not evaluated unless separately requested.
