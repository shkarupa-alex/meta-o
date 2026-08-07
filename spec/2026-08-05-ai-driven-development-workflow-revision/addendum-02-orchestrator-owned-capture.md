# Addendum 02 — orchestrator-owned capture, and what actually bounds a turn

**Status.** Normative alongside the council brainstorm and `addendum-01`, and listed
as such in this directory's README. Unlike `addendum-01` it was **authored from
measurement rather than from the requester's words**, so it is a separate document
that can be rejected whole; the fallback is at the end.

**Scope.** It amends **§7.2 only** — the retrieval interface. It does **not** touch
§8: where a backend offers a native export, the export remains required, and a
route whose export cannot be reached is unsupported rather than downgraded to
capture. §8's own consequence for Omnigent is spelled out below.

## What §7.2 decided, and why that was right

> Просьба reviewer «повтори прошлый ответ verbatim» не является retrieval. Verdict
> file, `mktemp`, nonce и completion marker не используются.

Every item in that list has one shape: **the model is asked to cooperate.** You tell
the reviewer to write its verdict to a file, or to end with a nonce, or to repeat
itself, then check whether the artefact appeared. A model that paraphrases while
claiming to repeat passes that check; one that writes half a file passes it too. The
protocol proves a cooperative act occurred, not that you received the whole turn.
Rejecting it was correct and stays correct.

## What Phase 0 measured, and why the pane alone is not enough

`herdr agent read --lines` caps at **1000 rendered rows**, Herdr 0.8.0 exposes no
scroll method, and the cap is silent. In round 4 of the Herdr end-to-end run that
stopped being theoretical: a reviewer's own mutation campaign rendered more than a
thousand rows, so by the time the verdict appeared the command echo that opens the
turn had left the buffer. The answer looked complete; its upper boundary was gone.
Under §7.2's own rule that is `unknown`, and no retry recovers it, because the rows
no longer exist.

## What this addendum permits

The orchestrator may run a provider non-interactively and **capture that process's
own stdout**, on any backend. The permission is about the mechanism, not the vendor:
it is the stdout of a process the orchestrator itself started, so the ledger's
rationale for routing output through Herdr — _не лезть в provider-private
sessions/hooks_ — is untouched. Nothing is asked of the model: the shell performs the
redirect and reads the exit status.

## The correction: a shell sentinel does not prove the turn ended

An earlier draft of this addendum claimed a reviewer "cannot half-write the file"
because the shell owns the redirect. **That was wrong, and the error mattered.** A
shell sentinel proves the *CLI process* returned. It does not prove the *provider*
finished its turn. The two come apart exactly where it hurts:

- **measured:** exit 0 with no answer at all (fixture O8, and the same shape on
  OpenCode inline). A sentinel cannot tell that from a real verdict;
- **not measured here, and the more dangerous case:** a non-empty capture truncated
  mid-answer. Reviewer A's round-6 turn was cut silently after roughly 60k tokens, but
  the attempts that failed left empty files and were overwritten by the successful
  retry, so this project has _not_ observed a partially-written capture in the wild.
  The reason to design against it anyway is that a verdict template puts `## Verdict`
  near the **top**: a late truncation would read as a complete verdict with its later
  findings silently gone, and nothing in the exit status distinguishes that from a
  short review. Fixture H12 records the case as open rather than claiming it.

So the sentinel is **necessary and not sufficient**, and a route bounded by nothing
else is exactly the partial PASS this project refuses.

## What does bound a turn: a structural envelope

The sanctioned end-of-turn proof is a **provider-authored structural record whose
truncation is mechanically detectable** — not a marker requested from the model.
Measured 2026-08-07:

| Route          | Envelope                       | End-of-turn evidence                                                |
| -------------- | ------------------------------ | ------------------------------------------------------------------- |
| Claude, inline | `claude -p --output-format json` | one JSON object: `subtype: "success"`, `is_error: false`, `stop_reason`. A truncated capture fails `JSON.parse` |
| Codex, inline  | `codex exec --json`            | JSONL ending in an explicit **`turn.completed`** event; a truncation leaves the last line unparseable |
| Omnigent       | `omnigent session export --id` | JSONL, one item per line, full turn order — but see below           |

The rule that follows, and it is the operative one:

> **A capture is a retrieval only when its envelope parses whole and carries the
> route's own end-of-turn record.** Plain-text stdout plus a sentinel is not a
> retrieval. A capture that parses but reports an error status, or that ends without
> the end-of-turn record, is `unknown` and is repeated.

This is strictly stronger than the pane, and it asks the model for nothing.

## Omnigent: §8 is unchanged, and it has a consequence

Omnigent's native export is the §8 surface and remains required there. But its
headless run offers **no structured output** (`--log` is refused together with `-p`),
and `session export` needs a full conversation id that no non-interactive surface
yields: the REPL prints it truncated, and **prefix resolution fails** — `--id
9c5745c543874f84` returns `Session '…' not found` (measured 2026-08-07).

Therefore, under §8's own rule rather than a new judgement: **the Omnigent route
cannot run the review gate unattended.** A review round there needs a human to supply
the conversation id from Omnigent's own picker, which is `needs_attention`. Capturing
plain stdout instead is *not* licensed by this addendum, because §8 is out of its
scope and because plain stdout has no envelope. This project's own Omnigent run did
capture plain stdout, and `docs/e2e.md` now says so.

## The operational contract

1. **Location.** Capture files live in a scratch directory outside the repository
   under review. They are never written into the working tree, staged, or committed.
2. **Envelope first.** Retrieval means: parse the capture whole, confirm the route's
   end-of-turn record, and only then read the answer out of it. No step of this asks
   the model for anything, and **no closing sentinel is ever requested from a
   reviewer** — that is the banned completion marker, whatever it is called.
3. **The shell sentinel stays, demoted.** `printf '…%s\n' "$?"` still tells you the
   process is gone rather than still running, which is why the pane is still read. It
   is a liveness check, not a completeness proof.
4. **A non-zero status, an unparseable envelope, a missing end-of-turn record, or an
   empty answer with status 0 are all `unknown`,** and the role is repeated from the
   start. A reviewer cannot be resumed: its output is the deliverable.
5. **Recovery.** After a restart an existing capture proves nothing on its own; trust
   it only if its envelope parses and closes. A stale file from a previous SHA is the
   failure mode `docs/backlog.md` exists to prevent.

## What stays banned

Asking a reviewer to write a file, emit a nonce, end with a completion marker, or
repeat its previous answer. Reading a provider's private JSONL, hooks or session
database. Substituting captured stdout for a native export where §8 requires one.

## If this addendum is rejected

Any turn whose rendered output exceeds the 1000-row window is `unknown`, those routes
are unsupported for the review gate at that scope, and reviews are split small enough
to fit the window — which `mo-review` already requires when a scope does not fit. That
is workable and more expensive, and it fails hardest on the reviews that did the most
work.
