---
name: mo-watchdog
description: Watch exactly one running orchestrator through its backend's native state, and tell the user only when something genuinely needs a human. Use when the user has agreed to start an observer for a long unattended run.
license: MIT
---

# Watch one orchestrator

Start only after the user explicitly requests it. Observe exactly one running
orchestrator through its backend's native event/state surface.

Wait directly for native state change. Read no tracked project content, actor
bodies, findings or private session state. Do not poll, nudge, prompt, resume,
route, retry, start actors, run checks, store state or take over supervision.

A native `done` is not automatically a human boundary: the orchestrator owns its
next ordinary action. Report only when its public process state reaches a valid
methodology `needs_attention` boundary. Include only backend locator, topology,
role, blocker class, candidate and finding/scenario identifier where applicable;
never paraphrase body prose.

If the native surface cannot wake this observer reliably, the optional watchdog
is unsupported. Do not add a polling helper, daemon, service, registry or state
file. Stopping the watchdog never changes the feature run.
