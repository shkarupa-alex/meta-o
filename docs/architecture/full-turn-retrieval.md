# Retrieving a complete reviewer turn is the load-bearing mechanic

Because _one model is not enough_ and _a feature must be verifiably done_.

## The problem

Two independent reviews are the main quality control. A review is only worth its
cost if the author receives **all** of it. A verdict truncated at a viewport
boundary looks exactly like a complete verdict, so a partial read silently turns
"I never saw the blocker" into a PASS. That is the most expensive failure this
architecture can produce, and it is invisible.

## The decision

Each backend skill retrieves the complete last turn through **that backend's own
output surface, and nothing else**:

- `mo-herdr` — Herdr's `agent read` (`recent-unwrapped`, `visible`), `pane run` +
  `pane read`, `attach` and provider-qualified `send-keys`. Never
  Claude/Codex/OpenCode JSONL, hooks, rollout files or session databases.
- `mo-omnigent` — the stdout of a headless `omnigent run -p`, and `omnigent session
export`, which writes a full-turn-ordered JSONL transcript. Never a terminal tail
  as a substitute for either, and never `~/.omnigent/chat.db`.

**The surface is part of the decision, not an implementation detail** — added
2026-08-06, after the fixtures. Both backends have two: a full-screen **TUI** and the
provider's own non-interactive **inline** mode. A TUI repaints while it streams, so
its scrollback is a collage in which the same block can appear twice and another go
missing — measured on Claude Code above roughly 250 rows and on OpenCode at any
length, where the pane retains nothing at all. An inline answer is written once, in
order, bounded by the command echo and the returned shell prompt, and it was exact on
every route tested. So support is claimed **per surface**: a run names the surface
that produced the verdict it reports, and asking for long output on a TUI is a choice
that needs a reason.

This does not weaken the ban above. Inline mode is still the backend's own surface —
a pane Herdr owns, or Omnigent's own stdout — and the two things it must never become
are a provider's private transcript and a screen-scrape substituted for an export.

Retrieval must prove three things: the upper boundary (the prompt that started
the turn), the lower boundary (the completed/idle state after it), and continuity
between every window in between. If any of the three is unproven the gate is
`unknown` and repeated. **There is no partial PASS.**

## Why not the private session store

It would be easier, and it would work today. It is rejected because a provider's
private transcript format is not a contract: it changes without notice, it is not
the surface the user agreed to expose, and reaching into it means a review can
quietly start reading a different session than the one under test. A route whose
sanctioned surface cannot deliver a complete turn is marked **unsupported for the
review gate** instead — an honest gap rather than a fragile pass.

## Why not "repeat your last answer verbatim"

Because it tests obedience, not retrieval. A model that summarises instead has
replaced the evidence with its own paraphrase, and nothing in the output says so.

## Why not a verdict file, nonce or completion marker

They add a protocol to maintain on both ends and still do not prove the turn was
read whole — they only prove that a cooperating model wrote a marker.

### Why the orchestrator's own stdout capture is not that

Every item above shares one shape: the model is asked to cooperate, and the check
passes whenever it appears to. Redirecting an inline provider's stdout to a file asks
the model for nothing — the shell performs the redirect and reads the exit status —
and the rationale for routing output through Herdr was never "files are forbidden"; it
was _do not read what the provider keeps privately_, which captured stdout of a
process we started ourselves is not.

**But the capture must be a structured envelope, and this is a correction to an
earlier version of this section.** It previously said completeness was bounded by
process termination. That is not true: process exit proves the CLI returned, not that
the provider finished its turn. A turn cut off mid-answer exits 0, and since a verdict
puts its heading near the top, the truncated capture reads as a complete verdict whose
later findings have vanished. So the sanctioned boundary is a **provider-authored
record whose truncation is mechanically detectable**: `claude -p --output-format json`
returns a single object carrying `subtype`/`stop_reason` that fails to parse if cut,
`codex exec --json` ends with an explicit `turn.completed` event, and Omnigent's
`session export` is one JSON object per line. A route with no such envelope reachable
is unsupported for the review gate — which is where Omnigent stands, because its
export needs a conversation id no non-interactive surface yields.

A shell sentinel still has a job: it says the process is gone rather than still
running. That is liveness, and it is not completeness. The permission, its limits, and
the fallback if it is withdrawn are in
`spec/2026-08-05-…/addendum-02-orchestrator-owned-capture.md`; capture files stay
outside the repository and are never committed.

## What must be proven before a route is used

The fixtures are listed in `docs/phase-0-fixtures.md`: responses longer than one
viewport and longer than 200 and 800 rows, tool calls before the final answer,
two sequential turns, alternate-screen repaint, a resize mid-paging invalidating
the assembly, Unicode and soft wraps and repeated overlap lines, resume after
compaction, and a missing boundary producing `unknown` rather than PASS — each
per provider.
