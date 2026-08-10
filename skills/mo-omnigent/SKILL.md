---
name: mo-omnigent
description: Drive a whole feature to a verified candidate commit over native Omnigent sessions — preflight, executor under a completion-oriented prompt objective because this route has no native goal transport, two independent reviews, applicable E2E — and hand back one full SHA or a real needs_attention. Use when the user asks to implement a feature, continue one, or run the Meta-O workflow with Omnigent as the session backend.
license: MIT
---

# Run one feature through Omnigent

Read `references/methodology.md` first. It is the whole lifecycle: preflight,
optional reuse research, the executor, the frozen candidate and its gates, the
native goal, recovery, and when a human is actually needed. This file adds only
Omnigent's mechanics — including the one part of that lifecycle this route cannot
carry.

Read `references/omnigent-mechanics.md` before you retrieve any reviewer output.

This skill does **not** call `mo-herdr` and shares no executable adapter with
it. The two backends differ enough in session semantics that one prompt covering
both would be vague about both.

## Precondition

Read the installed Omnigent skill and its `--help`. Every command in these files
is an example; the installed interface is the syntactic source of truth. Apply
the interactive-versus-non-interactive provider check in
`references/methodology.md §2`, including the lookup inside the actual harness;
an inherited interactive `PATH` is not proof. The verdict belongs to that harness
surface only, and names either its verified wrapper or its verified
provider-native posture, including all required fixed launch behaviour. Never
call an absolute binary behind the proven mechanism.

Before declaring any Omnigent route supported, close the Phase 0 checks in
`references/omnigent-mechanics.md §3`. A route with an unproven full export is
honestly marked unsupported for the review gate.

Before actor creation, run these two commands from this installed skill:

```text
scripts/mo-posture.sh --self-check --shell all
scripts/mo-posture.sh --shell <zsh|bash|all> -- <selected-providers>
```

Reject status 1 or 2, an incomplete or divergent applicable matrix, and every
selected-provider record whose `type` or `path` is `missing`. Only status 0 with
complete non-divergent evidence permits actor creation.

## There is no native goal on this route — say so before you start

Measured 2026-08-06 on Omnigent 0.6.0: `/goal` typed into the Omnigent REPL is
answered `Unknown command: /goal · /help for list`, and the command list that
`/help` prints is the REPL's own. **Slash commands never reach the harness**, so no
goal can be set here even on a harness whose own CLI supports one.

So the goal-driven half of `references/methodology.md §6` does not apply to this
backend. Use the fallback that section already defines under **"OpenCode and
unsupported surfaces"**: one persistent conversation per role, a completion-oriented
first prompt carrying `<SPEC_PATH>` and `<BUSINESS_PATH>` as text, premature idle
answered with an ordinary follow-up, and **the fallback named as weaker out loud**
in the handback. Do not emulate a goal with a home-grown state machine, and do not
report a run here as if a goal had been in force.

What does work on this route, all of it measured rather than assumed — the details
and the numbers are in `references/omnigent-mechanics.md §2`:

- a headless `omnigent run … -p "<prompt>"` prints the **complete** turn on stdout
  and exits, so a single-shot role (each reviewer is one) needs no transcript at all;
- `-c/--continue` continues the most recent conversation **for that harness** — the
  most recent one, not yours, which is how a multi-turn executor works without ever
  holding a conversation id and also how it loses its own conversation to a reviewer;
- `omnigent session export --id <full id>` returns the whole conversation, and §8
  makes it the review gate's evidence here — but no non-interactive surface prints
  that full id and a prefix is refused, so **every review round on this route is a
  `needs_attention`** rather than something a run can complete on its own.

## The shape of a run

```text
preflight
  → (optional, only if the user says yes) mo-reuse as its own top-level agent
  → executor conversation, objective as prompt text (no native goal on this route),
    continued with -c, until a clean candidate commit
  → freeze the SHA
  → reviewer A + reviewer B, independent, same SHA          (mo-review)
  → applicable E2E on the same SHA                          (mo-e2e)
  → any fix → new SHA → every applicable gate again
  → STATUS / CANDIDATE / SUMMARY
```

Called with no arguments, do not start random work: read the repository state
and either offer to continue the obvious current work or ask which spec to run.
`references/methodology.md §1` has the exact wording.

Talk about the roles as `<slug>-exec`, `<slug>-review-a`, `<slug>-review-b`,
`<slug>-e2e` — but know that Omnigent stores no such name, so that is your
vocabulary, not a lookup key. Continue the executor with `-c` rather than starting a
second conversation on the same task.

**`-c` picks the most recent conversation on a harness, and "most recent" is not
"mine".** It is not about what is running: a reviewer that started and _finished_
between two executor turns still becomes the most recent, and the next `-c` silently
lands in it. So before the first review round, make all three persistent roles —
executor, reviewer A, reviewer B — uniquely addressable, by **giving the executor a
harness no reviewer will ever use**. Two usable harnesses and three roles is not a
contradiction, because only the executor continues: reviewers are single-shot `-p`
runs whose stdout is the whole answer, so both may share the other harness as long
as neither is ever resumed with `-c`. If a reviewer does need a follow-up turn on
the executor's harness, or the roles cannot be separated this way, stop and report
`needs_attention` rather than guessing — this route has no id you can pin instead
(§2 of the mechanics), and a misaddressed `-c` does not fail, it just answers as the
wrong role. Fixture O9 in `docs/phase-0-fixtures.md` is this project's own run
getting it wrong; the cost is real and it is silent.

## Reviewers

`mo-review` owns the prompts, the lenses and the convergence rules; this skill
owns the actors, the waiting, the full-output retrieval and the handback.

- Both first-pass reviewers work on the same frozen SHA, independently. Reviewer
  B must not see A's findings.
- At least one reviewer runs on a different vendor than the executor.
- Run each reviewer as its own headless `-p` invocation with **stdout redirected to a
  file**. That file is how you _read_ the answer — it is not what proves the answer
  is whole. Plain stdout has no envelope on this route, and a turn cut off mid-answer
  still exits 0, so the gate's evidence is `session export`, as §8 requires.
- **The export needs a conversation id this route will not give you, so a review
  round here is a `needs_attention`.** Ask the user for the id from Omnigent's own
  picker; prefix resolution does not work. Without it, report the review gate as
  unsupported for this run rather than passing it on captured stdout —
  `references/omnigent-mechanics.md §2` has the measurements and the reasoning.
- Keep every reviewer off the executor's harness — see the `-c` rule above; a review
  that lands on the executor's harness costs the executor its conversation, not the
  reviewer its answer.
- **Nothing is asked of the reviewer**: no verdict file, no nonce, no closing
  sentinel to mark where its answer ends. The harness narrates on stdout before the
  verdict, so locate the verdict by its `## Verdict` heading — a content marker that
  tells you where to read, never evidence that the turn completed.
- Copy findings into the executor's next prompt verbatim and whole.

If a prompt exceeds the backend's limit, split the Markdown only on its own
heading boundaries into numbered verbatim chunks and send each after the
previous is acknowledged from a settled state. A refused chunk yields
`needs_attention`.

## Gates

QC and smoke are not a phase and need no separate role. Any fix creates a new
SHA and invalidates all four results. A gate you cannot read a full verdict for
on the current SHA is `unknown`, and is repeated.

## Handing back

```text
STATUS: complete | needs_attention
CANDIDATE: <full git SHA or none>
SUMMARY: <short human-readable outcome>
ATTENTION: <only when needed>
```

## Model preferences

`scripts/mo-models.mjs` is a path **inside this skill's own directory**, not
inside the project you are working on. Resolve it once, from wherever this
`SKILL.md` was loaded — under a skill manager that is typically
`.claude/skills/mo-omnigent/`, `~/.claude/skills/mo-omnigent/`, or the equivalent
`.codex` / `.opencode` location — and use that absolute path. Run from anywhere;
the helper is scoped to the Git root of the current directory, so `--project` is
only needed to address a different project.

```bash
node <this-skill>/scripts/mo-models.mjs --show
node <this-skill>/scripts/mo-models.mjs --set reviewerB=codex/gpt-5.6-sol/high
node <this-skill>/scripts/mo-models.mjs --catalog
node <this-skill>/scripts/mo-models.mjs --check-upgrades
```

If that file is not where this skill lives, the install is incomplete — say so
and confirm the model set with the user by hand.

A `--set` is checked against the route's own catalog before it is written: an
unknown model on a route whose listing is complete (`codex`, `opencode`), or an
effort that model does not offer, is refused. `--force` stores the value without
consulting the catalog — the escape hatch for an id a listing does not know yet.
Where the catalog cannot be reached the value is stored and the gap is printed.
Say which of the two happened when you confirm the model set; a refusal is the
tool working, not a broken install.

`--catalog` asks each route's own surface: `codex debug models`,
`opencode models`, and for Claude the Agent SDK's `supportedModels()`. The SDK is
an optional peer — where it does not resolve, the helper reports the gap instead
of passing recent session history off as a catalog. Read the gap out loud when
confirming the model set rather than implying the list is complete.
