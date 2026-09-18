---
name: mo-watchdog
description: Use only when the user explicitly requests mo-watchdog or Meta-O watchdog; observe Orca sessions and nudge only an authorized exact target.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
---

# Watch backend sessions

Read [Watchdog behavior](references/watchdog.md) and
[Обратная связь о методологии](references/methodology-feedback.md) completely;
friction you hit belongs in your final answer to the user, never in an Issue. Start only after the
user explicitly names Meta-O watchdog or `mo-watchdog`; a generic monitoring
question does not activate this skill.

Use `scripts/mo-watchdog.sh target --backend orca --session <id>` for one
session or `scripts/mo-watchdog.sh scan` for all reachable Orca sessions.
Observation is read-only. An explicit nudge additionally requires
`--nudge <message>` and exact target authorization; the script re-reads native
state and suppresses the nudge when that state changed. It reserves a bounded
private digest before delivery and suppresses the same message, an ambiguous
attempt, or a saturated unchanged state across later invocations. Nudges return
after native delivery; agent completion is observed separately.

Treat malformed or stale native state as a typed unsafe observation: report it,
fail closed, and do not nudge or guess the target state.

Do not inspect tracked project content or private provider state. Report the
native locator, classified state and action. Pattern misses are refined from
observed failures rather than hidden behind a support claim.

## Meta-O calls

- none
