---
name: mo-watchdog
description: Observe one target or scan all reachable Herdr, Orca, and Paseo sessions for limits, overload, failures, questions, work, and completion; nudge only an explicitly authorized exact target.
license: MIT
---

# Watch backend sessions

Read [Watchdog behavior](references/watchdog.md) completely. Start only after the
user explicitly requests observation.

Use `scripts/mo-watchdog.sh target --backend <backend> --session <id>` for one
session or `scripts/mo-watchdog.sh scan` for all reachable supported backends.
Observation is read-only. An explicit nudge additionally requires
`--nudge <message>` and exact target authorization; the script re-reads native
state and suppresses an identical nudge while state is unchanged.

Do not inspect tracked project content or private provider state. Report the
native locator, classified state and action. Pattern misses are refined from
observed failures rather than hidden behind a support claim.
