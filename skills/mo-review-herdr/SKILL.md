---
name: mo-review-herdr
description: Independently review the current candidate through two concurrent Herdr sessions, using shared review and backlog lenses, and return complete same-SHA verdicts without editing code.
license: MIT
---

# Review through Herdr

Read [Review protocol](references/review-protocol.md),
[Backend contract](references/backend-contract.md),
[Herdr native mechanics](references/herdr-mechanics.md), and
[Purpose and architecture contract](references/purpose-and-architecture.md)
completely. Read the purpose contract before applying reviewer B's architecture
lens.

Operate on the current clean full candidate SHA. Create only reviewer A and B,
start them concurrently with required vendor diversity, and never use `/goal`.
Wait for both complete settled responses before reporting either. Do not edit,
commit or run mutating diagnostics. Report E2E as not evaluated unless the user
separately requested it.
