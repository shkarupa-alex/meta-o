# Omnigent mechanics

The lifecycle is in `references/methodology.md`. This file holds only what is
specific to driving it through Omnigent's own sessions, resume and export.

Everything below was read from `omnigent --help` on a real installation
(`omnigent` 0.x on this machine's `PATH`). Re-read the installed help before
you rely on any of it: the installed interface is the source of truth, and a
command that moved is a fact about your machine, not about this document.

---

## 1. Sessions

```bash
omnigent run --harness <claude-sdk|codex|cursor|...> --model <model> -p "<prompt>"
omnigent run --harness codex -c                 # continue the most recent conversation
omnigent run --harness codex --resume <conv_id>
omnigent resume <conv_id>          # auto-dispatches by runtime
omnigent attach <conv_id>          # joins a LIVE session; never starts one
omnigent session export --id <conv_id> --output <file>.jsonl
```

`run` starts, `resume` reopens a stored conversation, `attach` joins a live one
and errors loudly when there is nothing live. Do not use `attach` to start work
and do not use `run` where `resume` was meant — a second conversation on the
same task is how two executors quietly edit the same branch.

`-c/--continue` reopens **the most recent conversation for that harness**, and that
scoping was verified in both directions.

It holds _across_ harnesses: a `claude-sdk` run in between did not steal the
continuation — a following `--harness codex -c` still answered from the codex
conversation. So two roles on _different_ harnesses are safely independent.

It gives you nothing _within_ one harness, and this is the trap. "Most recent" is
decided by the clock, not by who started it, and a conversation does not have to be
running to win: a reviewer that started and finished between two executor turns is
now the most recent, and the executor's next `-c` lands inside the review. Measured
2026-08-07, after this project's own Omnigent run had put its executor and reviewer A
both on `codex`: a probe asked the `-c` conversation to quote its own first user
message using no tools, and got back `FIRST: You are an independent reviewer. Another
agent implemented a small feature; you did not write` — `ROLE: reviewer`. Nothing had
errored, nothing had warned, and four rounds of executor turns had gone into a
reviewer's context. It is recorded as fixture O9.

The rule that follows: **the executor gets a harness no reviewer ever uses.** Only
the executor continues, so single-shot reviewers may share the remaining harness
freely — what they must never do is resume with `-c` on the executor's. Where that
separation is impossible, report `needs_attention`; §2 explains why you cannot fall
back on pinning an id instead.

Naming does not help here the way it does on Herdr: there is no `--name`, so
"`<slug>-exec`" is a convention for how you talk about the run, not something
Omnigent stores or you can look up. Addressing a specific stored conversation needs
its id, and §2 says where that can and cannot come from.

## 2. Getting a complete turn

**A headless run is the cheapest surface, and — this is the part that decides the
route — it is not a proven-complete-turn surface.**
`omnigent run --harness <h> -p "<prompt>" < /dev/null` prints the answer on stdout and
exits 0: no viewport, no repaint, no transcript to reassemble. Measured 2026-08-06
with a self-verifying prompt (40 numbered lines): all 40 indices arrived, in order,
none missing, none duplicated. That proves the surface can carry a whole turn. It does
**not** prove that any particular capture holds one, and the difference is the gate.

Plain stdout has no envelope. Omnigent's headless mode offers no structured output at
all — `--log` is refused together with `-p` — so a capture is free text bounded by an
exit status, and an exit status cannot see a turn that was cut off mid-answer. One half of
that hazard is measured here — a turn ending **empty with status 0**, fixture O8 — and
the other half is not: a partially-written capture has never been observed on this
machine (fixture H12), but a verdict template puts `## Verdict` near the top, so a
late truncation would read as a complete verdict with the findings below it gone.

```bash
omnigent run --harness codex -p "<the review prompt>" < /dev/null > "$TMP/review-a.md"
omnigent run --harness codex -c -p "<the next turn>"  < /dev/null   # same conversation
```

Redirect stdin from `/dev/null` and stdout to a file. That removes the viewport, and
it is worth doing — but it bounds the **process**, not the turn, so on its own it is
liveness rather than retrieval. `--log` cannot supply the missing envelope: combined
with `-p` it is refused outright, _"--log is only supported in interactive REPL mode
on this CLI path"_.

**So the review gate on this route runs through `session export`, per §8 of the spec,
and that is not optional.** `addendum-02` permits capturing an orchestrator-owned
stdout stream, but it amends §7.2 only and explicitly does not license replacing a
native export with free text. The export is the structural surface this route has:
one JSON object per line, so a truncated export is invalid JSON on its last line
rather than a plausible short answer (fixture O5).

**And that has a consequence you must not route around.** The export needs a full
conversation id, no non-interactive surface yields one, and **prefix resolution
fails** — `session export --id 9c5745c543874f84` answers `Session '…' not found`
(measured 2026-08-07). Therefore: **this route cannot run the review gate
unattended.** Each review round needs the user to supply the conversation id from
Omnigent's own picker, which is a `needs_attention` handback, not a step you can
automate. If the user cannot or will not supply it, the route is unsupported for the
review gate for that run — say so, and do not substitute captured stdout, which is
exactly the substitution §8 forbids and which this project's own end-to-end run made.

**stdout is not only the answer.** Omnigent's own progress lines
(`omnigent: Starting up…`) do go to stderr, but the harness's running narration does
not: on a real review the codex harness wrote nine sentences of _"I'm checking the
frozen commit against the framing…"_ to stdout ahead of the verdict, with no blank
line between the last of them and the `## Verdict` heading. So you cannot take the
answer as "the first line of stdout" or "the last N lines".

**Do not fix this by asking the reviewer for a closing sentinel.** That is the
completion marker `addendum-02` bans, and it would not even buy what it appears to:
the bottom of the answer is already given by the end of the export item, and the
reviewer emitting a marker only proves the reviewer chose to. The narration problem is
an **upper**-boundary problem — where narration stops and the verdict starts — and the
right instrument for it is the export's own item structure, or, failing that, the
`## Verdict` heading read as a **content** marker: useful for locating the verdict,
never evidence that the turn was complete. Keep those two jobs apart. Completeness is
the envelope's to prove; a heading only tells you where to start reading.

**The conversation id is the one thing no non-interactive surface gives you.** The
REPL prints it truncated (`Resumed conversation 70389384fa41492c…`), `omnigent
session` has only `export`, and `omnigent run -r` / `omnigent resume` with no id open
an **interactive picker** — a human, not a script. So:

- ordinary work needs no id at all: single-shot roles read stdout, and a multi-turn
  executor continues with `-c` **on a harness it does not share with a reviewer**;
- a run that genuinely must address one specific stored conversation — a restarted
  orchestrator, or two same-harness sessions to tell apart — reports
  `needs_attention` and asks the user to pick it from Omnigent's own picker;
- `~/.omnigent/chat.db` is **not** a retrieval surface. It was read once, by hand,
  while closing these fixtures; that is recorded in `docs/phase-0-fixtures.md` and is
  not a licence for a run.

**With an id in hand, the export is complete.** `omnigent session export` writes a
portable JSONL transcript: the first line is `"record_type": "session_meta"`, every
later line is one conversation item, and the file preserves full turn order. It is
not a terminal tail and not truncated by a viewport. Measured on the two-turn
conversation above: `Exported 5 item(s)`, holding all 40 indices of the first turn
_and_ the second turn's answer.

```bash
omnigent session export --id <conv_id> --output "$TMP/review-a.jsonl"
```

Take the items after the last user message and reassemble the assistant's final
answer from them, in order.

One caveat about harnesses that wrap a provider CLI: the `claude-sdk` harness comes
up under this machine's own Claude Code configuration, so user- or project-level
instructions apply to it. Observed here: a prompt demanding "exactly one line" came
back with a paragraph first and the requested line last. Parse a reviewer's answer by
its own markers, never by line count or position.

**Passing the prompt.** There is no `--prompt-file` and `-p` will not read stdin, so
the prompt reaches Omnigent as an argument. Write it to a file and expand it inside a
script — `omnigent run --harness codex -p "$(cat prompt.md)"` — and never paste prompt
text into the command line itself. The quoted substitution is not re-parsed by the
shell, so a prompt full of backticks, quotes and `$` arrives intact; a prompt pasted
inline does not.

**An empty answer with exit status 0 is `unknown`, never "no findings".** Measured on
`--harness claude-sdk`: a review wrote two sentences of narration, produced no verdict
and exited 0. Nothing in the exit status, the stderr or the transcript says the turn
was empty — only your own check that the markers you asked for are present does.
Repeat the run; if it happens twice on the same route, that route is unsupported for
the gate rather than slow.

Three rules hold regardless of how convenient any of these surfaces look:

- **An export whose completeness is not proven does not produce a review PASS.**
  If the last turn in the file does not extend to a clear end-of-turn record, or
  if the session was still producing output when you exported, the gate is
  `unknown` and is repeated.
- **A terminal tail never substitutes for the export.** If the export cannot
  cover the full last turn on some route, that route is honestly marked
  unsupported for the review gate rather than downgraded to screen-scraping.

## 3. Phase 0 — before declaring a route supported

Run each of these by hand and keep the human-readable evidence
(`docs/phase-0-fixtures.md` in the meta-o repository is the checklist form):

1. **Slash-command transport** — **answered, and the answer is no.** On Omnigent
   0.6.0, 2026-08-06: `/goal …` in the REPL returns `Unknown command: /goal · /help
for list`, and `/help` lists only the REPL's own commands. Slash commands are
   consumed by the REPL and never reach the harness. Re-run this row on a new
   Omnigent version before assuming it has changed.
2. **`/goal` survival after resume** — moot while 1 fails: there is nothing to
   survive. Resume itself works and is observable (`Resumed conversation …`).
3. **Direct versus non-TUI harness** — the interactive REPL and a harness driven
   without a TUI do not necessarily behave the same; check the one you will
   actually use.
4. **Full export on a long answer** — produce a response larger than the default
   or API limit and confirm the export still carries all of it.
5. **Pagination and end boundary** — confirm you can tell "the turn ended" from
   "the export stopped".
6. **Status semantics and premature idle** — confirm what "the session is idle"
   means, and that a session which merely paused is not read as finished.
7. **Provider CLI resolution through `PATH`** — `command -v`, `which -a`; the
   harness must come up under the user's wrapper.

A route that fails any of 4 or 5 is unsupported for the frozen-candidate lifecycle.
Say so plainly rather than shipping a route that fails mid-run.

**This route fails 1, and here is what that costs.** 4 and 5 pass, so retrieval is
sound and the frozen-candidate lifecycle still runs here — what is gone is the
_goal_, i.e. the thing that survives a compaction inside the executor's own session.
The objective travels as prompt text instead, which is weaker in exactly one way that
matters: after a long executor stretch the instruction can fall out of context, and
nothing inside the session restates it. So on this route re-state `<SPEC_PATH>` and
`<BUSINESS_PATH>` in the follow-up prompt whenever the executor has been working long
enough to have compacted, and say in the handback that the run used the weaker
prompt-text objective. A route missing a goal is not the same as a route that cannot
be driven; claiming either extreme would be false.

## 4. Boundaries

- This skill never calls `mo-herdr`, and the two share no executable adapter.
- No provider-private session store is read to work around a missing Omnigent
  surface.
- **Nothing is asked of the reviewer**: no verdict file, no nonce, no closing
  sentinel, no "repeat that verbatim". Reviewer output is ordinary Markdown,
  retrieved through the export above. Capturing the provider's own stdout to a file
  is a different act — the shell does it, not the model, and `addendum-02` permits it
  — but on **this** route capture is a convenience for reading, never the gate's
  evidence, because §8 requires the export and plain stdout carries no envelope. The
  two statements are consistent only in that order; do not read the capture in §2 as
  a licence to skip the export.
