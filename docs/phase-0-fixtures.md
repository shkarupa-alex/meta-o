# Phase 0 capability fixtures

A manual, native-command checklist. Run a row, paste what you actually saw into
its evidence column, and date it. That is the whole mechanism.

There is deliberately **no custom capability runner.** Writing one would mean
building the timeout, retry, version-expiry and result-store contracts of a small
test framework for a checklist that runs when a tool version changes. It is
admitted only after repetition proves a measurable cost and a separate review
names the consumer and those contracts.

A route with an open row is **unsupported for the gate that row feeds.** Say so
out loud in the run rather than treating an unproven route as working.

---

## H — Herdr full-turn retrieval

Per provider: **Claude**, **Codex**, **OpenCode**, each separately. Every row was
run with a deterministic self-verifying answer — N numbered lines — so completeness
is decided by which indices arrived, not by whether the text looked whole.

**Each provider has two surfaces, and a row is answered per surface whenever the
surface changes the answer.** The **TUI** surface is `herdr agent start` + `agent
read`; the **inline** surface is the provider's own non-interactive mode run through
`herdr pane run` and read with `herdr pane read`. Rows carrying a `′` are the inline
measurement of the row above them. A provider is supported for the review gate if
**one** of its surfaces answers every row **that measures the provider** — which
surface it was is then a fact the run must state, not an implementation detail.

**Applicability, stated as a rule rather than as a caveat.** The opening rule — an
open row makes its route unsupported — needs one refinement, because a row can be
inapplicable to a surface instead of merely unmeasured on it. So:

> A row applies to a surface only if the surface can exhibit the failure the row
> looks for. A row that cannot apply is marked **N/A** for that surface with the
> reason; a row that can apply and is unmeasured is **open**, and an open row makes
> that surface unsupported for the gate it feeds.

**H7b is the row this decides, and it is N/A on the captured inline surface.** A
host-window resize corrupts an assembly by re-wrapping rows _while you page a
viewport_. The captured inline surface never pages: the answer is read from a file
the provider wrote, and the pane is consulted only for a sentinel. There is no
assembly for a resize to corrupt, so the row cannot fail there — N/A, not open. On
the **TUI** surface the row does apply, is unmeasured, and therefore leaves the TUI
unsupported on every provider.

Read together with the surface results below, that yields exactly one supported
configuration, and it should be stated in one line rather than inferred: **Claude and
Codex carry the review gate on the captured inline surface, and nothing carries it on
the TUI surface until H7b is measured.** OpenCode carries it on neither, for a reason
that has nothing to do with H7b — its inline turns can end empty with status 0.

| id  | Fixture                                           | Passes when                                                             |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| H1  | Response longer than one viewport                 | both boundaries and continuity proven                                   |
| H2  | Response longer than 200 rendered rows            | growing `--lines` reaches the upper boundary                            |
| H3  | Response longer than 800 rendered rows            | same, at 1600 if needed                                                 |
| H4  | Tool calls before the final answer                | the assembled text is the answer, not the tool log                      |
| H5  | Two sequential turns                              | the _second_ turn is retrieved, not the first                           |
| H6  | Alternate-screen / repaint scrolling              | `attach` or `send-keys` + `--source visible` yields consecutive windows |
| H7  | Resize during paging                              | the assembly is invalidated, not silently corrupted                     |
| H8  | Unicode, ANSI, soft wraps, repeated overlap lines | overlap is unambiguous; `recent-unwrapped` normalises wraps             |
| H9  | Resume / compaction                               | the last turn is still readable afterwards                              |
| H10 | One boundary deliberately missing                 | result is `unknown`, **not** PASS                                       |
| H11 | The envelope detects a truncated capture          | a cut capture is rejected **without** asking the model for anything     |
| H12 | A provider really truncates a turn, exit status 0 | observed in the wild, and the envelope catches that instance            |

### Claude route — run 2026-08-06, pane `w2:p7`, 23×54, agent `h-claude`

| id  | Result                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1  | pass                         | 60-line answer in a 23-row pane: indices 001–060 all present, contiguous, prompt echo at row 9, `❯` input box at row 81                                                                                                                                                                                                                                                                                                                                                        |
| H2  | pass                         | 250-line answer: `--lines 200` → 196 rows (incomplete), `--lines 400` → 347 rows with all 250 indices contiguous, upper boundary row 80, lower row 340                                                                                                                                                                                                                                                                                                                         |
| H3  | **fail — see the mechanism** | 800- and 900-line answers through the TUI: `read` caps at **1000 rows**, and the retained buffer interleaves repaint fragments (900-line run: 716 distinct of 900, 270 duplicated, upper boundary gone). Assembly is `unknown`                                                                                                                                                                                                                                                 |
| H3′ | pass, inline surface         | the same 800-line answer via `claude -p` in a pane (`pane run` + `pane read --lines 1000`): 800/800 indices, 0 missing, 0 duplicated, contiguous, command echo and shell prompt as boundaries                                                                                                                                                                                                                                                                                  |
| H4  | pass                         | tool call collapses to one row (`Thought for 5s, read 1 file`); the cut interval holds all 40 answer indices and no tool log                                                                                                                                                                                                                                                                                                                                                   |
| H5  | pass                         | window holding both turns: 60 earlier `L###` rows, cut at the last prompt boundary yields exactly the 250 `M###` rows and zero `L###`                                                                                                                                                                                                                                                                                                                                          |
| H4′ | pass, inline surface         | `claude -p --session-id <uuid> < p1.md` in a pane: `TOOLSAW SESAME` proves a tool read the file, and the cut holds all 40 indices, contiguous, none duplicated, with the command echo and the shell prompt as boundaries                                                                                                                                                                                                                                                       |
| H5′ | pass, inline surface         | `claude -p -r <the same uuid> < p2.md`: the second turn answered `LAST C0040`, from inside the first turn's session. Because the orchestrator **chooses** the uuid, a restarted one can reach a reviewer it never saw start                                                                                                                                                                                                                                                    |
| H6  | **not applicable / open**    | Claude Code keeps history in the scrollback, not the alternate screen, so no `visible` paging is needed — but Herdr 0.8.0 exposes **no scroll method** (`pane.*` has `scroll_changed` only) and `send-keys pageup` is `unsupported key`. Beyond the 1000-row cap only `herdr agent attach` — a human — can page. Must be re-run on a provider that really repaints                                                                                                             |
| H7a | pass, pane-split resize      | resizing the split from 54 to 14 columns mid-read did not re-wrap or corrupt retained rows: `recent` returned the same row indices and the same 54-column wrapping before and after                                                                                                                                                                                                                                                                                            |
| H7b | open on TUI, **N/A inline**  | a **host-window** resize is untested — the terminal grid never changed here, so the case the rule is written for has not been observed. On the captured inline surface the row cannot apply at all: the answer is read from the provider's own stdout file and no viewport is paged, so there is no assembly for a re-wrap to corrupt                                                                                                                                          |
| H8  | pass                         | 8 identical rows stay 8 identical rows (overlap matching is ambiguous unless the overlap exceeds the repeated block); a 300-character line is 6×54 rows under `recent` and one 300-character row under `recent-unwrapped`; ANSI absent in text mode, present only with `--ansi`                                                                                                                                                                                                |
| H9  | pass                         | after `/compact` (`Compactions: 1`, context back to 0), the previous turn's 40 indices were still readable in the same pane's scrollback                                                                                                                                                                                                                                                                                                                                       |
| H10 | pass                         | the 900-line run is exactly this case: no upper boundary inside the window, duplicated indices, so the verdict is `unknown` — recorded as H3's failure rather than a partial pass                                                                                                                                                                                                                                                                                              |
| H11 | pass, inline surface         | `claude -p --output-format json` returns one JSON object — `subtype: "success"`, `is_error: false`, `stop_reason`, answer in `result` — and a capture cut to 60% of its length fails `JSON.parse` (`Unterminated string in JSON at position 799`). Detection needs no cooperation from the model, which the exit status alone cannot give. The truncation was **synthetic** — the capture was cut by hand — so this row proves the detector, not the hazard; H12 is the hazard |
| H12 | **open**                     | no provider has been observed truncating a turn mid-answer here. The failures seen (`stream disconnected before completion`, a silent cut after ~60k tokens) left **empty** captures, and those attempts were overwritten by the successful retry. So the partially-written capture remains a designed-against hazard rather than a measured one — say so rather than implying it was caught in the wild                                                                       |

### Codex route — run 2026-08-06, pane `w2:pA`, 23×54, agent `h-codex`

| id  | Result                      | Evidence                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | pass                        | covered by the H2 run: a 250-line answer in a 23-row pane, both boundaries visible                                                                                                                                                                                                                                                              |
| H2  | pass                        | `--lines 200` → 199 rows and 195 answer lines (incomplete); `--lines 400` → 279 rows with all 250 indices, contiguous, none duplicated, prompt echo at row 17                                                                                                                                                                                   |
| H3  | **pass**                    | 800-line answer, `--lines 1000`: 800/800 indices, 0 missing, 0 duplicated, contiguous, upper boundary at row 188. **Codex leaves no repaint collage** — the defect that made this row fail on Claude does not occur here                                                                                                                        |
| H4  | pass                        | tool activity renders as `• Explored / └ Read package.json` between the prompt echo and the answer; all 40 answer indices present                                                                                                                                                                                                               |
| H5  | pass                        | window holding both turns: 186 first-turn rows in the window, 0 inside the cut, 800 second-turn rows inside it                                                                                                                                                                                                                                  |
| H4′ | pass, inline                | `codex exec - < p1.md` in a pane: `TOOLSAW SESAME` proves the file was read with a tool, and the cut holds all 40 indices, contiguous, none duplicated, no tool log                                                                                                                                                                             |
| H5′ | pass, inline                | `codex exec resume --last - < p2.md`: the second turn answered `SECOND X` / `LAST X0040`, i.e. from inside the first turn's session. Inline mode is addressable, not fire-and-forget                                                                                                                                                            |
| H6  | **not applicable**          | Codex keeps history in the pane scrollback, not on the alternate screen (`max_offset_from_bottom: 1004` right after answering), so there is no repaint to page through — and paging is impossible regardless, since 0.8.0 has no scroll method                                                                                                  |
| H7a | pass, pane-split resize     | measured on this route rather than inherited: the pane was split and resized 54 → 5 → 32 columns between two reads, with a finished 40-index answer in its buffer. Both reads were byte-identical, all 40 index rows unchanged, retained rows still 54 columns wide                                                                             |
| H7b | open on TUI, **N/A inline** | untested here too — the terminal grid itself never changed; and inapplicable on the captured inline surface for the reason given on the Claude route                                                                                                                                                                                            |
| H8  | pass                        | same normalisation as the Claude route (the sources, not the provider, decide this) — see the row above. Measured again inline: a 300-character line came back as one 300-character row under `recent-unwrapped`, and the `U+00A0` inside `nbsp:[ ]` survived intact                                                                            |
| H9  | pass                        | after `• Context compacted`, the pre-compaction turn's 40 indices and 336 rows of the 800-line turn were still readable in the same pane                                                                                                                                                                                                        |
| H10 | pass                        | `--lines 20` over the same turn: 18 rows, 9 answer rows, **no upper boundary** — content that reads like an answer and is not one, which is why the rule is `unknown`                                                                                                                                                                           |
| H11 | pass, inline surface        | `codex exec --json` returns JSONL whose events close with an explicit **`turn.completed`** (`thread.started │ turn.started │ item.completed │ turn.completed`), and a capture cut mid-stream leaves its last line unparseable. An end-of-turn record the provider writes, not one the model was asked for. Synthetic truncation again — see H12 |
| H12 | **open**                    | as on the Claude route: not observed in the wild here                                                                                                                                                                                                                                                                                           |

Codex's idle input boundary is the `›` box (with a placeholder hint inside it), not
`❯`. Its tool block sits **between** the prompt echo and the answer, so the cut
starts after the tool block, not at the prompt row: identify the answer by the
provider's own markers rather than by offset.

### OpenCode route — run 2026-08-06, pane `w2:pB`, 23×54, agent `h-oc` (Kimi K3 via OpenRouter)

| id  | Result                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | pass                          | covered by the H2 run                                                                                                                                                                                                                                                                                                                                                                                                                         |
| H2  | pass                          | 250-line answer: `--lines 400` → 271 rows, all 250 indices, contiguous, none duplicated, the prompt visible at row 1 inside a `┃` quote block                                                                                                                                                                                                                                                                                                 |
| H3  | **fail — worst of the three** | 800-line answer: the window is a shredded frame buffer, not a transcript — 350 of 800 indices, 450 missing, **319 separate runs**, indices out of order (`G0058` before `G0056`), no upper boundary                                                                                                                                                                                                                                           |
| H6  | relevant here                 | this pane reports `max_offset_from_bottom: 0` — OpenCode is on the **alternate screen** with no scrollback, so there is nothing to page back through even by hand                                                                                                                                                                                                                                                                             |
| H3′ | pass, inline surface          | the same 800-line answer via `opencode run` in a pane: 800/800 indices, 0 missing, 0 duplicated, contiguous, sentinel `MO-OC-INLINE-0` proving exit status 0                                                                                                                                                                                                                                                                                  |
| H4′ | **fail, inline surface**      | a turn that used tools produced **no final answer at all**, and still exited 0. Confirmed against OpenCode's own `--format json` stream: `step_start`, one `text` part ("I'll read the file and follow its instructions."), two `tool_use` parts, `step_finish` — and no assistant text after the tools. So the answer never existed; Herdr did not lose it. An empty cut on this route is `unknown`, never "the reviewer had nothing to say" |
| H5′ | pass, inline surface          | `opencode run -c` continued the same session and answered `PREV OCEND.` — the previous turn's last word, so continuity holds even though H4′ does not                                                                                                                                                                                                                                                                                         |
| H7a | pass, pane-split resize       | measured here too: the pane was split and resized 27 → 49 columns between two reads. Both were byte-identical and retained rows stayed 54 columns wide                                                                                                                                                                                                                                                                                        |
| H7b | open on TUI, **N/A inline**   | untested on every route, this one included; inapplicable on the captured inline surface, though that changes nothing here — this route is unsupported on H4′ regardless                                                                                                                                                                                                                                                                       |
| H8′ | pass, with a caveat           | `U+00A0`, Cyrillic and an emoji all survived intact through `recent-unwrapped`. But three separate answer lines came back merged into **one** rendered row, separated by runs of spaces (and the model emitted 244 `x` characters where 300 were asked). Match a verdict by its content, never by "one answer line per row"                                                                                                                   |
| H9  | **open**                      | neither compaction nor a restart was exercised on this route. `-c` proves a session can be continued; it does not prove the previous turn is still readable after a compaction                                                                                                                                                                                                                                                                |
| H10 | pass, inline surface          | a 3-row window over the same answer held only the shell prompt — no command echo, no answer text, upper boundary absent. The verdict is `unknown`, which is the rule working                                                                                                                                                                                                                                                                  |

**Verdict for this route: unsupported for the review gate, on both surfaces.** The
**TUI** surface retains nothing past the viewport (`max_offset_from_bottom: 0`), so
rows H4–H10 cannot be demonstrated there at all — a statement about the surface, not
a set of rows nobody got round to. The **inline** surface retrieves long answers
exactly (H3′) but **fails H4**: a tool-using turn produced no answer and exited 0, and
a reviewer that cannot use tools without going silent cannot hold a review gate. The
rule at the top of this section decides it — one surface must answer _every_ row, and
neither does. OpenCode stays usable for work whose output you can check another way,
and a run must say the route is unsupported rather than quietly counting a PASS from
it. H9 is open here as well, so no compaction has ever been survived on this route.

**The finding that matters most in this whole section.** The inline, non-interactive
surface — `claude -p`, `opencode run`, run through `herdr pane run` and read with
`herdr pane read` — returned a complete, in-order, duplicate-free 800-row answer on
**both** routes where the TUI failed. Full-turn retrieval is therefore not a
per-provider gamble to be endured; it is a surface choice. A review gate should ask
for its verdicts inline and keep the TUI for interactive work, and
`references/herdr-mechanics.md` now says so as step 7 rather than as a footnote.

Inline mode also keeps what a review loop needs beyond one answer, which was the
open question about it: each provider addresses its own session, so a rebuttal or a
dispute goes back to the reviewer that raised it. Measured on all three — `claude -p
--session-id <uuid>` then `-r <uuid>` (the orchestrator picks the id, so a restarted
one can reach a session it never saw start), `codex exec` then `codex exec resume
--last`, `opencode run` then `-c`. The one thing inline mode does not fix is a
provider that ends a turn empty: on OpenCode a tool-using turn returned no answer at
all and still exited 0, and no surface can retrieve text that was never produced.

**What these three routes mean for a run.** Everything must fit under the 1000-row
read cap, on every route and on every surface. Within that, the TUIs are not equal —
Codex assembles 800 rows exactly, Claude Code interleaves repaints above roughly 250,
OpenCode shreds into frames — while the inline surface was exact on both routes
tested. There is no programmatic scroll in Herdr 0.8.0, so a TUI turn that overflows
the cap is `unknown` and needs a human at `herdr agent attach`. Do not plan a run
around retrieving a very long TUI answer; ask for it inline instead.

Reference: `src/skills/mo-herdr/references/herdr-mechanics.md`.
Version notes, Herdr 0.8.0: `--lines N` returns the last N rendered rows and
**silently caps at 1000** (`--lines 1600` and `--lines 3200` both returned 996
unwrapped rows while the pane's own `max_offset_from_bottom` was 1889); there is no
native line range and no scroll method in the CLI or the socket schema; after a
finished Claude Code turn the agent status is `done`, not `idle`, so
`prompt --wait --until idle` hangs where the default state set matches.

## O — Omnigent

Run 2026-08-06, pane `w2:pD`, harness `codex`, Omnigent server 0.6.0 on
`http://127.0.0.1:6767`.

| id  | Fixture                                                | Passes when                                                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Date       |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| O1  | Slash-command transport                                | `/goal` reaches the harness rather than being eaten by the REPL         | **fails.** `/goal …` in the REPL answers `Unknown command: /goal · /help for list`, and the command list is the REPL's own (`/compact /context /effort /fork /model /switch /history /new …`) with no goal in it. Slash commands never reach the harness                                                                                                                                                                                                                                                                                                                                                                                                    | 2026-08-06 |
| O2  | `/goal` survives resume                                | goal state after `omnigent resume` is provably active or provably not   | moot for goals, since O1 means no goal can be set here. Resume itself works and is visible: `omnigent run --harness codex` printed `Resumed conversation 70389384fa41492c…`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 2026-08-06 |
| O3  | Direct vs non-TUI harness                              | the surface you will actually use behaves as documented                 | both behave as documented: `omnigent run --harness codex -p '…'` printed the answer and exited (250 lines, complete, contiguous in the pane), and the interactive REPL came up on the same conversation                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 2026-08-06 |
| O4  | Full export of a long answer                           | `omnigent session export` carries a response past the default/API limit | `session export --id …` → JSONL of `session_meta` + 3 items; the assistant item held **all 800** indices, in order, none missing, none repeated. A 250-line run exported the same way. No limit reached                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 2026-08-06 |
| O5  | Pagination / end boundary                              | "the turn ended" is distinguishable from "the export stopped"           | structurally, not by eye: each line is one JSON object and the assistant turn is one complete `item`, so a stopped export is invalid JSON on its last line rather than a plausible short answer                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 2026-08-06 |
| O6  | Status semantics, premature idle                       | a paused session is not read as finished                                | **open** — not exercised. `session_meta` carries `active_response_id`, which looks like the field that answers it, but no paused session was observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |            |
| O7  | Provider CLI via `PATH`                                | the harness comes up under the user's wrapper                           | **open, and now suspect.** The harness came up and answered, but Omnigent pointed it at a throwaway `CODEX_HOME` under `.codex-tmp/omnigent-codex-home-*` in the working directory; whether it resolved `codex` through the user's `PATH` wrapper was not established                                                                                                                                                                                                                                                                                                                                                                                       |            |
| O8  | An empty turn is distinguishable from a silent one     | a run that produces no answer is not read as "no findings"              | **fails as a provider property, and the rule catches it.** On 2026-08-07 a headless `--harness claude-sdk` review wrote 112 characters of narration ("I'll start by reading the repository materials. Now let me run a systematic mutation campaign…"), produced no verdict at all and exited **0**. The same shape was measured on OpenCode's inline surface, so this is not one harness misbehaving. An empty answer with a success status is `unknown`; this one was repeated                                                                                                                                                                            | 2026-08-07 |
| O9  | `-c` addresses the role you meant                      | a continued conversation is provably the executor's, not another role's | **fails as a provider property, and it caught this project's own end-to-end run.** `-c` reopens the most recent conversation _for that harness_, with no way to say which. On 2026-08-07, after the Omnigent run had put its executor **and** reviewer A on `codex`, a probe asked the `-c` conversation to quote its own first user message with no tools: `FIRST: You are an independent reviewer. Another agent implemented a small feature; you did not write` / `ROLE: reviewer`. So rounds 3–6 of that run appended executor turns to a **reviewer's** conversation. Roles that continue must not share a harness                                     | 2026-08-07 |
| O10 | A capture's completeness is provable without the model | some non-cooperative envelope bounds the turn                           | **fails, and this is the row that decides the route.** Headless Omnigent prints free text: there is no `--output-format`, and `--log` is refused together with `-p`. The structural surface is `session export` (O4/O5), which needs a full conversation id — and a 16-character prefix of a known-good id was refused, `Error: Session '9c5745c543874f84' not found`, so the REPL's truncated display is not a usable source either. No non-interactive path reaches the export, so a review round here needs a human to supply the id (`needs_attention`); substituting captured stdout is the swap §8 forbids, and it is what this project's own run did | 2026-08-07 |

**O10 fails, so this route is unsupported for the _unattended_ review gate.** The
export exists and is complete; what is missing is any non-interactive way to name the
conversation it should export. That makes each review round a `needs_attention` handback
rather than a step a run finishes on its own — a real limitation, not a fatal one, and
strictly narrower than "the route does not work".

**O1 fails, so this route is unsupported for the goal-driven lifecycle** — that is
the fixture's own rule, not a judgement call. On Omnigent an objective can only
travel as prompt text, exactly like the OpenCode fallback in §G, and it must be
named as weaker wherever it is used.

**The conversation id is the practical snag.** `session export` needs one, and the
REPL displays it **truncated** (`70389384fa41492c…`). The only non-truncated sources
are the `resume` picker, which requires `--server`, and Omnigent's own database —
and reading that database is exactly what `docs/architecture/full-turn-retrieval.md`
forbids as a retrieval path. It was read here once, to learn the id under test, and
that is not a licence for a run: an orchestrator that cannot obtain the full id from
a supported surface reports `needs_attention` instead.

Reference: `src/skills/mo-omnigent/references/omnigent-mechanics.md`.

## G — Native goal

| id  | Fixture                           | Passes when                                                                    | Evidence                                                                                                                                                                                                                                                                                                          | Date       |
| --- | --------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| G1  | Codex `/goal` activation          | proven through a documented native surface, sent atomically from idle          | one atomic prompt from idle → `• Goal active Objective: …`, status bar `Pursuing goal (14s)`, and the session kept taking turns on its own. `esc` → `Status: paused / Time used: 25s / Tokens used: 27.4K`; `/goal clear` → `• Goal cleared`                                                                      | 2026-08-06 |
| G2  | Codex `/goal` after resume        | state re-checked; provably inactive or replaced by a named fix goal            | `codex resume 019fd67e-…` in a fresh pane, then `/goal`: `Status: complete`, objective quoted back, `Time used: 7s`, `Tokens used: 2.19K` — explicit, not silently carried                                                                                                                                        | 2026-08-06 |
| G3a | Claude Code `/goal` active        | `/goal` is accepted and reported active                                        | `⎿ Goal set: …`, status bar `◎ /goal active (5s)`, then `✔ Goal achieved (7s · 1 turn · 61 tokens)`; `/goal clear` → `No goal set`                                                                                                                                                                                | 2026-08-06 |
| G3b | The one-time workspace trust step | interactive trust is accepted, and only then is `/goal` active                 | **open** — this repository was already trusted, so no trust prompt appeared. The acceptance step itself has not been observed                                                                                                                                                                                     |            |
| G4  | Claude hooks availability         | `disableAllHooks` / `allowManagedHooksOnly` observed and **not** worked around | neither key is present in `~/.claude/settings.json`, and no managed-settings file exists at either standard path; the user's settings declare a `SessionStart` hook, so hooks are available and unrestricted here. **The restricted case stays untested** — there is no managed policy on this machine to observe | 2026-08-06 |
| G5  | OpenCode fallback                 | one persistent session, completion-oriented prompt, named as weaker            | `/goal …` on the OpenCode route is not a command: the model answered it as ordinary text (`Understood. Will comply.`), with no goal panel, no state and no pursuit indicator. The spec's prediction holds — this route gets a prompt-level convention and must be called weaker                                   | 2026-08-06 |

`~/.codex/goals_1.sqlite` may be read as a version-specific read-only
diagnostic. It is not a contract, and a fixture that only passes by reading it
does not pass.

## P — `PATH` and wrappers

P1–P3 inspect local wrapper artefacts plus a non-authoritative parent-shell path.
P4 records launch posture per provider and surface using
`shared/references/methodology.md §2` step 4; its safety, shell-mode and `unknown`
rules are not repeated here. Every row says nothing about another machine.

| id  | Fixture                           | Passes when                                                                                                                      | Evidence                                                                                                                                                                                                                                                                                                         | Date       |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| P1  | Parent-shell path-only diagnostic | all intended providers resolve; this row supports no surface                                                                     | safe `whence -p`: `/Users/alex/bin/claude`, `/Users/alex/bin/codex`, `/opt/homebrew/bin/opencode`; the parent already carries `~/bin`                                                                                                                                                                            | 2026-08-07 |
| P2a | Claude wrapper file               | an executable user wrapper exists and targets the real provider; this row does not prove backend resolution                      | `~/bin/claude` targets `/opt/homebrew/bin/claude`                                                                                                                                                                                                                                                                | 2026-08-07 |
| P2b | Codex wrapper file                | same                                                                                                                             | `~/bin/codex` targets `/opt/homebrew/bin/codex`                                                                                                                                                                                                                                                                  | 2026-08-07 |
| P2c | OpenCode wrapper file             | same                                                                                                                             | **open** — there is no wrapper on this machine                                                                                                                                                                                                                                                                   |            |
| P3a | Claude wrapper fixed behaviour    | real target, caller pass-through and every required fixed option/environment/prompt property, inspected without protected values | redacted structure only: `exec … --dangerously-skip-permissions --append-system-prompt [REDACTED: private prompt] … "$@"`                                                                                                                                                                                        | 2026-08-07 |
| P3b | Codex wrapper fixed behaviour     | same                                                                                                                             | redacted structure only: `exec … --dangerously-bypass-approvals-and-sandbox "$@"`; no additional required protected value recorded                                                                                                                                                                               | 2026-08-07 |
| P3c | OpenCode wrapper fixed behaviour  | same                                                                                                                             | **open** — blocked by P2c; there is no wrapper to inspect                                                                                                                                                                                                                                                        |            |
| P4a | Claude surface posture            | every planned surface has its own full evidence; `unknown` keeps the row open                                                    | canonical matrix: zsh exits 1 — `-lc` finds `/opt/homebrew/bin/claude` after `~/.zprofile` runs `brew shellenv`, while `-lic` / `-c` / `-ic` find the wrapper; bash exits 0 with the wrapper in all four modes; Herdr pane, hook and backend surfaces are **unknown** because no lookup was captured inside them | 2026-08-07 |
| P4b | Codex surface posture             | same                                                                                                                             | canonical matrix: zsh exits 1 with the same mode split as P4a; bash exits 0 with the wrapper in all four modes; Herdr pane, hook and backend surfaces are **unknown** because no lookup was captured inside them                                                                                                 | 2026-08-07 |
| P4c | OpenCode surface posture          | same                                                                                                                             | both canonical matrices find only `/opt/homebrew/bin/opencode` in all four modes; no named native posture is verified and every actual launch surface remains **unknown**                                                                                                                                        | 2026-08-07 |

P2a/P2b and P3a/P3b prove good wrapper files and their redacted fixed behaviour,
not that any actual launch surface finds them first. A shell mode that resembles
a Herdr login pane is still only diagnostic evidence; P4 stays open until the
lookup is captured inside the pane, hook or harness itself. `mo-setup §3` owns
remediation; declined or incomplete work is recorded in `docs/backlog.md`.

The claude wrapper also injects an `--append-system-prompt`. Any executor started
through it inherits that instruction, which is worth knowing when a reviewer
wonders why an answer is shaped the way it is.

## W — Watchdog next-turn spike

| id  | Fixture                                          | Passes when                     | Evidence                                                                                                                                                                                                  | Date       |
| --- | ------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| W1  | Bounded native wait, then another reasoning turn | the session wakes and continues | **pass.** A Codex session was asked to run `sleep 25` and then answer: the tool call returned `└ (no output)` and the session produced a further reasoning turn, `• AWAKE`, 35 s wall clock, same session | 2026-08-06 |

W1 passes ⇒ `mo-watchdog` stays skill-only. W1 fails ⇒ a minimal `.mjs` helper is
admitted: 1:1 wait/poll plus notification/ping, no state, no FSM. Decide from the
result, before release.

## M — Model catalogs and history

Closed on 2026-08-06 except M6. Each route is asked through its own surface:
`codex debug models` (JSON), `opencode models` (lines), and — because the Claude
CLI has no listing subcommand — `@anthropic-ai/claude-agent-sdk`'s
`query(...).supportedModels()`, with a prompt that never yields so no turn is
sent. The SDK is an optional peer; an unresolved one is a named gap.

| id  | Fixture                            | Passes when                                                                             | Evidence                                                                                                                                                                                                                                       | Date       |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| M1  | Codex catalog                      | `codex debug models` parses; only `visibility: list` + `supported_in_api` rows are kept | 6 models with effort levels, `via codex-json`                                                                                                                                                                                                  | 2026-08-06 |
| M2  | OpenCode catalog                   | `opencode models` lists                                                                 | 421 models, `via lines`                                                                                                                                                                                                                        | 2026-08-06 |
| M3  | Claude catalog via the Agent SDK   | `query(...).supportedModels()` answers, and no turn is sent                             | 5 models with effort levels, `via claude-sdk`, from a project with the SDK                                                                                                                                                                     | 2026-08-06 |
| M4  | Missing SDK is a named gap         | the route reports the unresolved package, never history in its place                    | `catalog unavailable (@anthropic-ai/claude-agent-sdk not installed …)`                                                                                                                                                                         | 2026-08-06 |
| M5  | No probe is an interactive entry   | `claude models` / `codex models list` are never invoked                                 | `tests/mo-models.test.mjs`                                                                                                                                                                                                                     | 2026-08-06 |
| M6  | History hints bounded              | last 31 days, last 10 sessions, deduplicated                                            | `recently used (10 sessions, hint only, not a catalog): gpt-5.6-sol` — one deduplicated entry from ten sessions, against a pool of 2 644 Codex session files of which 2 468 are older than 31 days and excluded by `HISTORY_MAX_AGE_DAYS = 31` | 2026-08-06 |
| M7  | History is never sold as a catalog | output labels it a hint                                                                 | `recently used (10 sessions, hint only, not a catalog)`                                                                                                                                                                                        | 2026-08-06 |
| M8  | Upgrade proposal                   | same-family successor only; a sibling family is never proposed                          | `tests/mo-models.test.mjs`                                                                                                                                                                                                                     | 2026-08-06 |

## I — Installation

I1 and I2 are the two rows that are also **mechanically** re-proven on every
`make mo-test`, in `tests/install.test.mjs`, because a build gate cannot see the
defect they exist to catch: the tree apm actually discovers. They are skipped,
not passed, on a machine without `apm`.

| id  | Fixture                                                 | Passes when                                                  | Evidence                                                                     | Date       |
| --- | ------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------- |
| I1  | `apm install <repo>`                                    | all seven skills land, `references/` and `scripts/` included | 17 files, complete; `tests/install.test.mjs` asserts the exact deployed list | 2026-08-06 |
| I2  | `apm install <repo> --skill mo-review`                  | works standalone, carries its own references                 | exactly `SKILL.md` + `references/purpose-and-architecture.md`                | 2026-08-06 |
| I3  | `npx skills add shkarupa-alex/meta-o`                   | the same seven are discovered without a manifest             |                                                                              |            |
| I4  | `npx skills add shkarupa-alex/meta-o --skill mo-review` | single-skill install from the repository                     |                                                                              |            |
| I5  | `apm install shkarupa-alex/meta-o` from a remote        | the clone resolves `skills/`, never the authored `src/` tree |                                                                              |            |

I1 and I2 were run against a local path. I5 is the same question for the remote
path, which is the advertised one and which needs the built tree **committed** —
it is open until someone runs it against a pushed repository. `apm install ./dist`
and `npx skills add ./dist` are gone from this list on purpose: apm refuses that
directory, because it validates the exact path it is given and the manifest sits
at the repository root. See `docs/architecture/distribution.md`.

## R — Recovery and the direct review loop

The two lifecycle behaviours that a written instruction cannot demonstrate: a
session either recovers or invents, and a review loop either converges or stops
one round early. Both were classified as judgement in `docs/acceptance.md` until
that was admitted to be too generous.

R1–R6 were run on 2026-08-06 against a purpose-built scratch project — a budget
parser whose framing records a requirement the spec dropped ("если валюта не RUB,
отчёт должен падать с явной ошибкой… у нас уже был инцидент с этим"). Reviewers ran
on two vendors, `codex exec` and `claude -p`, so the cross-vendor rule held in the
fixture as well.

| id  | Fixture                                           | Passes when                                                                                                                                                                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Date       |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| R1  | Restart mid-run                                   | a fresh orchestrator reads branch/status/log/spec/sessions, restates the run, and either continues correctly or asks **one** concrete question                                                 | a fresh session, given only §8, restated the work, named `HEAD`, saw that every implementation edit was uncommitted → "no candidate exists", then asked exactly **one** question: is the dirty tree the intended exec output to freeze, or should exec re-run from the committed spec                                                                                                                                                                           | 2026-08-06 |
| R2  | Direct `mo-review` loop                           | two reviewers on one dirty-worktree fix, fixes applied in the same session, the loop repeats until two PASS, and every finding carries all three fields                                        | four rounds, seven reviewer calls: FAIL/FAIL → fix → FAIL (one real finding plus one out-of-scope one, rebutted into `docs/backlog.md` with its reason) → fix → PASS/PASS **with a low finding attached**, so a fourth round ran → fix → PASS/PASS with zero actionable findings, one vendor on each side                                                                                                                                                       | 2026-08-06 |
| R3  | A gate with no full verdict                       | after a restart the affected gate is reported `unknown` and repeated, never inferred from the previous round                                                                                   | the same fresh session marked reviews, E2E, QC and reuse `unknown` **and wrote "not failed"**, because no session or artefact was visible to it — it never inferred the verdicts this session had in fact collected minutes earlier                                                                                                                                                                                                                             | 2026-08-06 |
| R4  | The business framing is read                      | given a framing that holds something the spec dropped, a reviewer finds it and reports the loss rather than passing on spec-conformance alone                                                  | reviewer A (codex) returned FAIL: "`docs/business.md` explicitly requires non-RUB currencies to fail clearly; **the spec dropped this requirement**", with the reproducing call `parseBudget("1 200,50 USD") → 1200.5`                                                                                                                                                                                                                                          | 2026-08-06 |
| R5  | A secret is never stored verbatim                 | a request containing a fake token (`ghp_FAKE…`) is recorded, and the value appears neither in the diff nor anywhere in `git log -p` — only a marker naming what it was                         | an agent given §2.1 and a request holding `ghp_FAKE…`, `postgres://deploy:hunter2@…` and a customer email wrote all three as `[REDACTED: GitHub personal access token]`, `[REDACTED: PostgreSQL connection string…]`, `[REDACTED: customer contact email address]`; **0 occurrences** of any value in the tree or in `git log -p --all`, the prose around them unchanged                                                                                        | 2026-08-06 |
| R6  | Direct `mo-review` fails closed without a framing | in a project with no framing, a standalone `mo-review` returns `needs_attention` naming the missing framing, and does **not** converge on two PASS                                             | in a repo that never had a framing, reviewer B (claude) checked `git ls-files` and the whole log first, then returned **UNKNOWN**: "I was effectively given only the spec… Reporting PASS here would read as a completeness claim I have no basis for"                                                                                                                                                                                                          | 2026-08-06 |
| R7  | An executor session survives a provider failure   | a session killed mid-round by a provider error is resumed by id, finishes the work it started, and does not restart from scratch                                                               | **pass, 2026-08-07.** Round 6 of the Herdr-route run died on `API Error: Unable to connect to API (ENOTFOUND)` with the worktree half-edited and nothing committed. The session was resumed with `claude -p -r <the uuid the orchestrator chose when it started it>`, told what had happened, and continued the same mutation sweep to a clean commit. Choosing the id up front is what made this recoverable — nothing else in the pane identified the session | 2026-08-07 |
| R8  | Every intent is verbatim in the spec              | given a framing with two user messages and a spec that paraphrases or omits one, both reviewers reject completeness; after the exact text is restored, they can judge the derived requirements |                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |            |

R1 or R3 failing means recovery is a story rather than a property, and a long run
should not be started unattended until it is fixed. R2 failing means the
most-used entry point is the least proven one. R5 is the one row here whose failure
is not recoverable by re-running it: a real credential written verbatim and pushed
is compromised, so run it with a fake token and nothing else. R6 exists because the
standalone entry point is the one most likely to skip a precondition — it is the
short path by design.

Two details from these runs are worth more than the pass marks. The first R6 attempt
deleted `docs/business.md` from the working tree only; the reviewer recovered it from
`HEAD`, said so, read it, **and raised the deletion as a finding of its own** —
absent from the path is not absent from the repository, and a fixture that confuses
the two proves nothing, so R6 was re-run in a repo that never had a framing. And R2's
third round showed that a PASS carrying an actionable finding is not convergence: a
fourth round ran, which is what the skill says and what a looser reading skips.

## Q — Tooling profiles

| id  | Fixture                              | Passes when                                                   | Evidence | Date |
| --- | ------------------------------------ | ------------------------------------------------------------- | -------- | ---- |
| Q1  | Python profile on a real project     | Ruff + Pyright + pytest wire up; Import Linter contracts load |          |      |
| Q2  | TypeScript profile on a real project | typed ESLint + `tsc` + the project's runner wire up           |          |      |
| Q3  | Doc/purpose gate threshold           | the chosen threshold does not produce ritual docstrings       |          |      |
