---
name: mo-orchestrate-orca
description: Run a whole feature from task or spec to one verified candidate SHA through Orca orchestration workers, with two independent reviews and applicable E2E.
license: MIT
---

# Orchestrate a feature through Orca

Read [Feature lifecycle](references/methodology.md),
[Backend contract](references/backend-contract.md),
[Portable review protocol](references/review-protocol.md),
[Orca native mechanics](references/orca-mechanics.md), and
[Purpose and architecture contract](references/purpose-and-architecture.md)
completely. Read the purpose contract before constructing reviewer prompts.

Use Orca only. Confirm `orca`, its version-matched upstream `orchestration`
companion skill, the bound worktree and all required public capabilities. Follow
the shared lifecycle exactly.

Read role selections with bundled `scripts/mo-models.mjs --show --project
<root>`. Require the configured `orchestrator`, executor, reviewer and applicable
E2E roles; never select a model/effort fallback. Use stable titles
`<feature>:orchestrator`, `<feature>:executor`, `<feature>:review:<vendor>` and
`<feature>:e2e:<n>`.

Verify the expected Orca instance/worktree, provider-native auth, account
projection freshness and one exact real harness launch whose requested/effective
model and effort match. A receipt does not prove a process, task consumption,
message delivery or an effect. Preserve returned run/task/dispatch/terminal
locators in current reasoning, not a project state store.

The orchestrator delegates product/spec commits to one hot executor. It creates
both review tasks before launching either reviewer, keeps remediation roles hot,
and starts fresh reviewers only for the final same-SHA pair. Use blocking public
waits for `worker_done`, questions and escalations; timeout is a checkpoint, not
failure. Process a complete delivery batch before acknowledgement.

The complete `worker_done` message is the settled response; never substitute a
private transcript or terminal preview. Do not automatically retry an
`unknown_effect`, kill foreign resources, or finish while a required task, gate,
review, E2E or user decision remains. The orchestrator does not inspect or edit
product code. Return one verified full SHA or honest `needs_attention`.
