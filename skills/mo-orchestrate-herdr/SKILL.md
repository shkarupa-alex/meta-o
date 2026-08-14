---
name: mo-orchestrate-herdr
description: Run a whole feature from task or spec to one verified candidate SHA through visible Herdr-managed Codex, Claude Code, or OpenCode sessions, with two independent reviews and applicable E2E.
license: MIT
---

# Orchestrate a feature through Herdr

Read [Feature lifecycle](references/methodology.md),
[Backend contract](references/backend-contract.md),
[Review protocol](references/review-protocol.md), and
[Herdr native mechanics](references/herdr-mechanics.md) completely.

Use Herdr only. Confirm the control executable, upstream `herdr` companion
skill, intended workspace and all required public capabilities before starting.
Follow the shared lifecycle exactly: a short initial `/goal` for the executor,
ordinary follow-ups, no orchestrator code inspection or edits, one frozen full
SHA, concurrent independent reviews, atomic pair delivery, QC and applicable
E2E. Return the human-readable final report or honest `needs_attention`.
