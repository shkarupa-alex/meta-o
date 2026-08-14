---
name: mo-orchestrate-paseo
description: Run a whole feature from task or spec to one verified candidate SHA through Paseo-managed Codex, Claude Code, or OpenCode agents, with two independent reviews and applicable E2E.
license: MIT
---

# Orchestrate a feature through Paseo

Read [Feature lifecycle](references/methodology.md),
[Backend contract](references/backend-contract.md),
[Review protocol](references/review-protocol.md), and
[Paseo native mechanics](references/paseo-mechanics.md). Before constructing
reviewer prompts, also read
[Purpose and architecture contract](references/purpose-and-architecture.md)
completely.

Use Paseo only. Confirm the control executable, upstream `paseo` companion
skill, intended workspace and all public capabilities. In particular, do not
claim support unless the documented public `wait` result surface passes complete
normal and long settled-response fixtures. Follow the shared
lifecycle without orchestrator code inspection or edits and return one verified
full SHA or honest `needs_attention`.
