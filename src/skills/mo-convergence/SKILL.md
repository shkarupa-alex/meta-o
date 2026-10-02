---
name: mo-convergence
description: Use only when the user explicitly requests mo-convergence; ask the current agent and available hot reviewers why stalled work is not converging, and recommend continue, redesign, narrow, accept-limitation or stop.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
---

# Diagnose work that does not converge

Start only when the user names `mo-convergence`. A remark that work is slow, a
long review loop or a failed attempt does not activate it, and no other skill
calls it.

Read [Feature lifecycle](references/methodology.md) and
[Обратная связь о методологии](references/methodology-feedback.md) completely:
friction you hit goes to the user in your answer, and this skill writes no
Issue.

## Gather positions

Ask the agent doing the work, and every reviewer whose slot is still hot, one
ordinary message each through the surface the lifecycle already uses: what is
blocking convergence, what they themselves contributed to the delay, and what
single change would unblock it. Do not start a new session to get an opinion,
and do not wake a cold slot; a participant that is gone is recorded as
unavailable, not reconstructed.
<!-- mo:source-anchor §A-DELIVERY-01 -->

Neither step is a judgement call. Whether a reviewer slot is hot is answered
per slot by bundled `scripts/mo-review-resource.mjs hot`, whose flags its `--help`
lists, from the age since its
last `worker_done` and the context its screen shows, as
[Orca native mechanics](references/orca-mechanics.md) describes; a slot it does
not answer hot is cold. Bytes reach a live agent only through its proven empty
composer: right before each message, bundled
`scripts/mo-harness-screen.mjs` reads that exact terminal's current screen and
must answer `action=inject`. A draft, a suggestion, a trust dialog, a shell
prompt or any other answer sends nothing, and that participant is recorded as
unavailable with the classifier's line.

Then check the sequence yourself from public evidence only: the candidates in
order, each round's verdict, `attempt <n>/5` and `deep_reads <m>`, the findings
that returned after being marked fixed, and the requirements they touch. A
finding that keeps coming back in a new shape usually names a boundary, not a
patch.

## Recommend

Give the user one recommendation with its reason, and the alternatives you
rejected:

- `continue` — the remaining findings are local and shrinking;
- `redesign` — the same boundary keeps failing and one slice has to change;
- `narrow` — part of the scope can ship proven while the rest waits;
- `accept-limitation` — a documented residual risk is cheaper than more rounds;
- `stop` — the premise is wrong or the cost no longer pays.

A reversible technical correction inside the current scope belongs to the
active role, and you hand it back to that role. Changing the product boundary,
narrowing the scope, accepting a limitation or stopping is the human's
decision: you recommend and never decide it, and you never change a
specification, a candidate or a review verdict yourself.

This skill writes no Issue. Confirmed friction in a Meta-O text goes to the
user as a recommendation, and filing it is the user's decision.

## Meta-O calls

- none
