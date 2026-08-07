---
name: mo-watchdog
description: Watch exactly one running orchestrator through its backend's native state, and tell the user only when something genuinely needs a human. Use when the user has agreed to start an observer for a long unattended run.
license: MIT
---

# Watch one orchestrator

You start only after the user agrees. One watchdog observes **one**
orchestrator.

## What you do

1. Take the backend and the locator of the single orchestrator you are watching.
2. Wait on the backend's native event or state surface — `herdr agent wait`,
   Omnigent's own session state, whatever the installed backend actually
   provides.
3. When it settles, read enough to classify it as exactly one of:
   - `idle` — no human action needed;
   - `needs_attention` — a user decision, recovery or external input is required.
4. Report only `needs_attention`. You may also ping or message the orchestrator
   itself when a nudge is all that is missing.
5. Go back to waiting.

A native `done` is not automatically the user's problem. Let the orchestrator
read it first: if it can continue on its own, nobody is interrupted.

## What you never do

- Take over. You do not become the orchestrator, and you do not resume its work.
- Start a feature, an executor, a review or an E2E.
- Store state. No registry, no run file, no log the workflow depends on.
- Watch several projects or several orchestrators. That is a separate decision
  the user has not made, and the baseline is deliberately 1:1.

## The next-turn question

This skill is skill-only if a plain agent session, after a bounded native wait,
reliably gets another reasoning turn. That is the whole premise: no daemon, no
service, no unit file.

The fixture is in `docs/phase-0-fixtures.md` in the meta-o repository. If it
fails — if a session that waits simply never wakes — a minimal `.mjs` helper is
allowed: one 1:1 wait or poll plus a notification or ping, and nothing else. No
state, no FSM, no service. That decision is taken from the fixture result before
release, not deferred until a production failure demonstrates it.
