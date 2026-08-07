# Reading a complete turn out of Herdr

Herdr's output surface is this skill's authoritative interface. It does not read
Claude/Codex/OpenCode JSONL, hooks, rollout files or session databases — a
review that reaches into a provider's private session is a review of something
nobody agreed to expose, and it breaks the moment the provider changes it.

The whole difficulty is proving that what you read is the _complete_ last turn.
A truncated reviewer verdict that looks complete is the single most expensive
failure this backend can produce, because it turns "I did not see the blocker"
into a PASS.

---

## 1. The algorithm

1. **Pin the actor and the exact prompt you sent**, then wait for a settled
   state. `agent prompt --wait` settles the lifecycle, not a turn boundary —
   check state before sending so an older turn's completion cannot satisfy your
   wait. Do not narrow the wait to `--until idle`: a finished Claude Code turn
   settles as `done`, and that wait times out while the answer is already on
   screen. The default state set (`idle`, `done`, `blocked`) is the right one.

2. **Take a window:**

   ```bash
   herdr agent read <actor> --source recent-unwrapped --lines 200
   ```

3. **Grow `N`** — 400, 800, then 1000 — until all of these hold:

   - the last user-prompt boundary is visible;
   - the lower completed/idle input boundary is visible;
   - a continuous assistant response sits between them;

   or until increasing `N` stops adding earlier lines. Careful with that last
   condition: **`--lines` caps at 1000 rows**, so "it stopped growing" can mean
   the cap rather than the end of history. Compare with the pane's own
   `max_offset_from_bottom` (`herdr pane get`) — when it is larger than what you
   received, history exists that `read` will not give you, and you are at the cap.

4. **Prove the interval is one continuous rendering, not a repaint collage.** A
   TUI that re-paints while it streams leaves the repainted fragments in the
   scrollback, so a window can contain the same block twice and skip another
   entirely — observed on Claude Code at 800+ rows: 716 distinct lines out of 900,
   270 of them duplicated, the prompt boundary already pushed out. Ask the reviewer
   for a verdict whose structure you can check (headings in order, findings
   numbered), and treat a window whose order is not monotonic as `unknown`. This is
   the failure mode that most looks like success: every individual line is real.

5. **Cut the interval** between the last prompt boundary and the next input/idle
   boundary. `nl -ba`, `sed -n`, `head` and `tail` are fine for inspecting it —
   that is standard shell text handling, not a custom transcript parser.

6. **If the provider paints a full-screen TUI** on the alternate screen and
   progressive `--lines` returns no history, use only real Herdr surfaces:
   `herdr agent attach` for manual page-up / page-down, or — from a provably
   idle state — a provider-qualified `herdr agent send-keys` for that provider's
   scroll controls. After each step read a consecutive window:

   ```bash
   herdr agent read <actor> --source visible
   ```

   Know what this costs before you plan a run around it: Herdr 0.8.0 has **no
   scroll method**. `pane.*` exposes `scroll_changed` and a read-only
   `PaneScrollInfo`, nothing that moves the viewport, and `send-keys pageup` is
   refused as an unsupported key. So "page up" means a human at
   `herdr agent attach`, or a provider whose own keybinding scrolls its view.

7. **Prefer the inline surface for anything long, and capture it rather than page
   it.** A reviewer's verdict does not have to arrive inside a TUI at all. Run the
   provider non-interactively in a pane, from a script so no prompt text is ever
   interpolated into a shell command, and take its stdout:

   ```bash
   # scripts/review-a.sh, written by you — capture the ENVELOPE, not bare text:
   #   claude -p --output-format json --session-id "$U" < prompt.md > cap-a.json 2> cap-a.err
   #   printf 'MO-%s-%s\n' REVA "$?"
   herdr pane run  <pane> 'sh <dir>/review-a.sh'
   herdr pane read <pane> --source recent-unwrapped --lines 200   # the sentinel only
   ```

   There is no repaint, so the answer arrives in order. Measured: an 800-row answer
   came back complete, contiguous and duplicate-free on all three routes, where the
   same answer in a TUI pane was unassemblable.

   The capture matters as much as the surface. Read from the pane alone and the
   1000-row cap still governs you — and it bites for a reason nobody predicts: a
   reviewer's own tool activity. In a real round here, a mutation campaign pushed the
   command echo out of the window, so the verdict looked whole and its upper boundary
   was gone; under step 10 that is `unknown`, and it was repeated.

   **Capture the structured envelope, and let it — not the sentinel — be the proof.**
   `claude -p --output-format json` returns one JSON object carrying `subtype`,
   `is_error`, `stop_reason` and the answer in `result`; `codex exec --json` returns
   JSONL whose last event is an explicit `turn.completed`. Both were measured on
   2026-08-07, and in both a truncated capture stops parsing — which is the whole
   point, because the failure this catches is a turn cut off **mid-answer with exit
   status 0**. A verdict template puts `## Verdict` near the top, so a late truncation
   would look perfectly valid in plain text while having dropped the findings below
   it. The exit status cannot see that; the envelope can. Be accurate about the
   evidence: the detector is measured, a provider actually truncating a turn here is
   not (fixtures H11 and H12) — the observed failures ended empty instead. So: parse the capture whole,
   confirm the end-of-turn record, then read the answer out of it. A capture that will
   not parse, reports an error status, ends without its end-of-turn record, or holds
   an empty answer is `unknown` under step 10 and the role is repeated.

   The sentinel keeps a smaller job: it says the process is gone rather than still
   running. That is liveness, not completeness — do not use it as completeness. The
   capture file is the provider's own stdout, which you launched, so it is not a
   private transcript and the ban in §3 is untouched; `addendum-02` records the
   permission and its limits. Keep the pane read for the sentinel, and for observing a
   session you did not launch yourself.

8. **Fix the terminal geometry before scrolling.** Record rows and columns first.
   Then treat a resize or a repaint mid-assembly as invalidating everything collected
   so far, and start over — **this one is fail-closed caution, not an observation.**
   What was actually observed is narrower and is in §2: a pane-split resize from 54
   to 14 columns mid-read changed neither the row indices nor their width, and a
   host-window resize has never been tested (fixture H7b). So the rule is what you do
   while the behaviour is unknown, and it stays until H7b is closed either way.
   ANSI is already stripped by Herdr's text mode, soft wraps are normalised by
   `recent-unwrapped`, and `visible` is compared as rendered Unicode rows. Derive the
   overlap from the observed viewport height and increase it when lines repeat;
   without an unambiguous matching overlap, continuity is **not** proven. If a human
   paged the view for you at `herdr agent attach`, ask them to return it to the
   bottom before you hand control back — you cannot do it yourself, since step 6
   established there is no scroll method to call.

9. **Copy the assembled response straight into the executor's next prompt.** You
   do not retell it, shorten it, or reorder it.

10. **If the upper boundary, the lower boundary or the continuity of any window
   is unproven, the gate is `unknown`.** Not a partial PASS — there is no such
   thing. So is an interval that is **empty** while the command reported success:
   measured on OpenCode, a tool-using turn printed a preamble, called two tools and
   ended with no answer at all, exit status 0. Reading that as "the reviewer had no
   findings" is a PASS invented out of nothing. Offer the user, in this order: re-run
   the review in a taller pane or inline mode; attach to the actor yourself with
   `herdr agent attach` and paste the full verdict in; or drop that provider route
   for this run.

---

## 2. Version facts

Herdr 0.8.0, all of it observed rather than read off a changelog:

- `--lines N` returns the last `N` rendered rows and **caps at 1000**. `--lines
1600` and `--lines 3200` returned the same 996 unwrapped rows while the pane
  reported `max_offset_from_bottom: 1889` — the history was there and `read` would
  not give it. Treat 1000 as the ceiling on any single retrieval.
- There is no native `from_line` / `to_line`, and no scroll method at all, in
  either the CLI or the socket schema.
- `recent` keeps the rendered wrapping (a 300-character line came back as six
  54-column rows); `recent-unwrapped` returns it as one 300-character row. ANSI is
  absent from text mode and present only with `--ansi`.
- Retained rows keep the wrapping they were written with: resizing a split from 54
  to 14 columns mid-read changed neither the row indices nor their width. A
  host-window resize has not been tested.
- A finished Claude Code turn settles as `done`. `agent explain` may still say
  `state: idle` for the same moment — that is the detection rule talking, not the
  lifecycle status.

If a future version adds a line range or a scroll method, probe for it and prefer
it — the lifecycle above does not change, only steps 3 and 6 get cheaper.

---

## 3. What is not a retrieval mechanism

- Asking the reviewer to "repeat your previous answer verbatim". That is
  obedience, and a model that summarises instead has just replaced your evidence
  with its own paraphrase, silently.
- A verdict file, `mktemp`, a nonce or a completion marker **that the model is
  asked to produce**. They add a protocol to maintain and still do not prove you
  read the whole turn: a reviewer that writes half a file, or forgets the marker,
  or paraphrases while claiming to repeat, passes every one of those checks.
- A provider's private JSONL, hooks or session database.

- **A closing sentinel requested from the reviewer**, under any name. Asking the
  model to "end with `<<<END>>>`" so you can find the bottom of its answer is the
  banned completion marker, even when the file it lands in was opened by your shell.

**The exception, and the line it turns on.** Step 7 of §1 redirects an inline
provider's stdout to a file. That is not the verdict file banned above, because
nothing in it is asked of the model: the shell performs the redirect and reads `$?`.
The verification value is the difference — a cooperative marker proves a model chose
to emit it, while a **provider-authored structural envelope** proves the turn closed.
That distinction is the whole permission, so do not spend it on a plain-text capture:
a bare-stdout file bounded only by the exit status is no better than a nonce, because
a turn can be cut off mid-answer and still exit 0. Capture the envelope (§1 step 7),
parse it whole, and confirm its end-of-turn record. Capture files live in a scratch
directory outside the repository and are never staged or committed. The reasoning,
the measured envelopes and the correction to an earlier, weaker version of this rule
are in `spec/2026-08-05-…/addendum-02-orchestrator-owned-capture.md`; if that addendum
is rejected the fallback is to split reviews small enough to fit the 1000-row window
rather than to keep the file quietly.

---

## 4. Acceptance fixtures

**These have been run, and the answers are recorded per provider and per surface in
`docs/phase-0-fixtures.md §H`.** In one line each, as of 2026-08-06 on Herdr 0.8.0:
the **TUI** surface is sound on Codex up to the 1000-row cap, unusable on Claude Code
above roughly 250 rows and unusable on OpenCode at any length past a viewport; the
**inline** surface (`pane run` + `pane read`) returned an 800-row answer exactly on
all three and keeps its own addressable session for a second turn — but "exact" is
not "supported": on OpenCode a tool-using inline turn ended with no answer at all and
exit status 0, so that route carries the gate on neither surface. **No provider yet
answers every §H row on any surface** — H7b, resume after a compaction, is open
everywhere — so the honest reading of §H today is Codex and Claude supported for the
gate _with H7b outstanding_, OpenCode unsupported outright. Read the route's own rows
before you plan a run, and re-run them when a provider or Herdr changes version — a
version is a new route.

A provider route is not declared supported until every one of these has been run
by hand and its human-readable evidence saved (the checklist form is in
`docs/phase-0-fixtures.md`):

- a response longer than one viewport;
- a response longer than 200 rows, and one longer than 800;
- tool calls before the final answer;
- two sequential turns;
- repaint / alternate-screen scrolling;
- a resize during paging — it must invalidate the assembly, not corrupt it;
- Unicode, ANSI, soft wraps and repeated overlap lines;
- resume/compaction after which the last turn is still readable;
- a missing boundary producing `unknown` rather than PASS;
- Claude, Codex and OpenCode, separately.

If Herdr's read/scroll cannot produce a complete turn on a route, that route
stays unsupported for the review gate. A private-transcript fallback is not
added automatically; it needs a new, proven need and a deliberate decision.
