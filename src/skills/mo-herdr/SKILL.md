---
name: mo-herdr
description: Drive a whole feature to a verified candidate commit over Herdr-managed agent sessions — preflight, executor under a native goal where the route has one, two independent reviews, applicable E2E — and hand back one full SHA or a real needs_attention. Use when the user asks to implement a feature, continue one, or run the Meta-O workflow with Herdr as the session backend.
license: MIT
---

# Run one feature through Herdr

Read `references/methodology.md` first. It is the whole lifecycle: preflight,
optional reuse research, the executor, the frozen candidate and its gates, the
native goal, recovery, and when a human is actually needed. This file adds only
Herdr's mechanics and the traps that were actually hit here.

Read `references/herdr-mechanics.md` before you retrieve any reviewer output.
Getting a complete last turn out of a terminal multiplexer is the one genuinely
hard mechanic in this backend, and a partial read must never become a PASS.

## Precondition

`HERDR_ENV=1` must be genuinely set by Herdr. Do not fabricate it, and do not
proceed on a route where it is absent — every command below assumes a real
Herdr control plane.

Read the installed `herdr` skill and `herdr --help` before issuing commands.
The commands here are examples; the installed interface is the source of truth.
Take agent names and pane IDs from Herdr's JSON responses, never from memory.

## The shape of a run

```text
preflight
  → (optional, only if the user says yes) mo-reuse as its own top-level agent
  → executor session, native /goal where the route has one — Codex and Claude Code
    do, OpenCode does not (methodology §6) — until a clean candidate commit
  → freeze the SHA
  → reviewer A + reviewer B, independent, same SHA          (mo-review)
  → applicable E2E on the same SHA                          (mo-e2e)
  → any fix → new SHA → every applicable gate again
  → STATUS / CANDIDATE / SUMMARY
```

Called with no arguments, do not start random work: read the repository state
and either offer to continue the obvious current work or ask which spec to run.
`references/methodology.md §1` has the exact wording.

## Session control

```bash
herdr agent start <name> --kind <claude|codex|opencode> --pane <pane-id> -- <args>
herdr agent prompt <name> "<prompt>" --wait --timeout <ms>
herdr agent wait   <name> --timeout <ms>
herdr agent get    <name>
herdr agent read   <name> --source recent-unwrapped --lines <N>
```

Name sessions `<slug>-exec`, `<slug>-review-a`, `<slug>-review-b`, `<slug>-e2e`.
That is what a restarted orchestrator finds; there is no registry.

### Inline retrieval, and why it is the default for anything long

`agent read` returns at most **1000 rendered rows** and Herdr 0.8.0 has no scroll
method, so a TUI turn that overflows the cap cannot be assembled at all — and two of
the three providers interleave repaint fragments well below it. Ask for long output on
the inline surface instead: run the provider non-interactively **in a pane**, capture
its stdout as a structured envelope, and read the pane only for the sentinel.
`references/herdr-mechanics.md` step 7 carries the measurements — including why the
envelope, not the exit status, is what proves the turn ended: a turn cut off
mid-answer still exits 0, and a verdict truncated below its `## Verdict` heading looks
whole.

```bash
herdr pane run  <pane> 'sh <dir>/review-a.sh'
herdr pane read <pane> --source recent-unwrapped --lines 1000
```

Inline is not a session-less mode and it does not cost you recovery or disputes —
each provider addresses its own session, verified on this machine 2026-08-06:

| provider   | first turn                                | same session again                                       |
| ---------- | ----------------------------------------- | -------------------------------------------------------- |
| `claude`   | `claude -p --session-id <uuid> < p1.md`   | `claude -p -r <uuid> < p2.md`                            |
| `codex`    | `codex exec - < p1.md`                    | `codex exec resume <id> - < p2.md`, or `resume --last -`  |
| `opencode` | `opencode run '<constant carrier>'`       | `opencode run -c '<carrier>'`, or `-s <session id>`       |

On Claude **you** choose the id, so a restarted orchestrator can recover a reviewer
it never saw start. Codex prints its session id and also takes `--last`. OpenCode has
`-c` for the most recent session and `-s <id>` for a specific one.

**Never interpolate prompt text into the command string.** A review prompt contains
backticks, quotes and `$`, and `pane run` hands its argument to a shell — the prompt
would be executed, mangled, or truncated at the first quote. Put the prompt in a file
and either redirect it (`< p1.md` — claude and codex both read stdin) or name the file
inside a short **constant** carrier message (`opencode run 'Read ./p1.md in this
directory and follow it exactly.'`). OpenCode accepts no prompt on stdin, and its
`-f` swallows the positional message that follows it, so the carrier form is the one
that works there. Keeping prompts in files is also what makes a rebuttal cheap: the
dispute goes back to the same session with a second file.

`agent prompt --wait` settles the **lifecycle**, not a turn boundary. Check the
current state before sending, or the tail end of a previously running turn will
satisfy your new wait and you will read the wrong answer as the new one.

Before starting the provider, apply `references/methodology.md §2` to the exact
launch surface. A TUI pane may be supported while inline or hook launches are not;
do not transfer the verdict. An interactive login pane may load an alias or a
`PATH` assembled only by interactive startup files and therefore happen to work.
Use the verified wrapper or named provider-native posture for this surface. An
absolute binary behind that mechanism can silently change permission, sandbox,
environment, prompt or other required fixed launch behaviour.

A worktree is not the default here either. Create one only for a genuinely
parallel build/run or to isolate a destructive E2E; a review diff reads fine by
SHA.

## Reviewers

`mo-review` owns the prompts, the lenses and the convergence rules. This skill
owns the actors: creating them, waiting on them, retrieving the **complete**
last turn, and handing control back.

- Both first-pass reviewers work on the same frozen SHA, independently. Reviewer
  B must not see A's findings.
- At least one reviewer runs on a different vendor than the executor.
- Reviewer output is ordinary Markdown: **nothing is asked of the reviewer** — no
  verdict file, no nonce, no closing sentinel, and no "repeat your last answer
  verbatim", which is obedience rather than retrieval. This is about what the
  reviewer must produce, not about how you read it: the inline surface captures the
  provider's own stdout to a file, and on that path the transport **is** structured
  (`--output-format json`, `codex exec --json`) precisely so that completeness is
  proven by the envelope instead of by anything the model was told to emit. That is
  why the capture in `references/herdr-mechanics.md §1.7` is named for what it holds
  — a parseable envelope — rather than for a verdict a reviewer was asked to write.
- Copy findings into the executor's next prompt **verbatim and whole**. You do
  not summarise, rank or filter them.

If one prompt exceeds the backend's known limit, split the Markdown only on its
own heading boundaries into numbered verbatim chunks, and send each chunk after
the previous one has been acknowledged from a settled state. Never paraphrase to
fit. A backend that refuses a chunk yields `needs_attention`.

## Gates

QC and smoke are not a phase and have no role of their own — the executor runs
them while implementing, a reviewer may re-run them to check the evidence, and
you only make sure a fresh applicable result exists for the current SHA.

Any fix creates a new SHA and invalidates all four results. After a restart, a
gate whose full verdict you cannot read on the current SHA is `unknown` and is
repeated.

## When a route is not good enough

A shredded or truncated read is usually not a broken route. Two things must be true
before you declare one unsupported, because after the 2026-08-06 fixtures the second
one is normally the actual fix:

1. **The cap is not what you hit.** `agent read --lines` stops at 1000 rendered rows
   and says nothing about it. Compare what you received with the pane's own
   `max_offset_from_bottom` (`herdr pane get`): if that number is larger, history
   exists which `read` will not hand over, and no amount of retrying changes it.
2. **You asked on the wrong surface.** Measured on Claude and OpenCode: the same
   800-row answer that the TUI could not assemble came back complete, in order and
   duplicate-free through the inline surface (`herdr pane run` + `herdr pane read`).
   Re-ask inline before giving up — see the table above and mechanics step 7.

Only when the content cannot be retrieved **inline either** does that route stay
**unsupported for the review gate**, and then it is a fact about the provider's
surfaces, not something to wait on a Herdr release for. Do not reach for
provider-private transcripts, hooks, rollout files or session databases: this skill's
authoritative interface is Herdr's own output surface, and going around it is how a
review starts silently reading someone else's session.

## Handing back

```text
STATUS: complete | needs_attention
CANDIDATE: <full git SHA or none>
SUMMARY: <short human-readable outcome>
ATTENTION: <only when needed>
```

No completion report, no findings archive, no screenshots, no raw logs. A human
reads the project docs or an ordinary Git diff.

## Model preferences

`scripts/mo-models.mjs` is a path **inside this skill's own directory**, not
inside the project you are working on. Resolve it once, from wherever this
`SKILL.md` was loaded — under a skill manager that is typically
`.claude/skills/mo-herdr/`, `~/.claude/skills/mo-herdr/`, or the equivalent
`.codex` / `.opencode` location — and use that absolute path. Run from anywhere;
the helper is scoped to the Git root of the current directory, so `--project` is
only needed to address a different project.

```bash
node <this-skill>/scripts/mo-models.mjs --show          # one line, all roles
node <this-skill>/scripts/mo-models.mjs --set executor=claude/opus/high
node <this-skill>/scripts/mo-models.mjs --catalog       # only on request
node <this-skill>/scripts/mo-models.mjs --check-upgrades
```

If that file is not where this skill lives, the install is incomplete — say so
and confirm the model set with the user by hand. Do not go looking for a copy in
the project, and do not write `~/.meta-o/models.json` any other way.

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

`~/.meta-o/models.json` holds model preferences and nothing else — no runs, no
SHAs, no findings, no gates, no actor state.
