I have what I need. Here is the proposal.

---

# Interactive Herdr sessions, a starved orchestrator, and a contract that carries the executor's rules

## Constraints and considerations before any recommendation

Fourteen complaints arrived as one report, and the tempting move is to treat them as fourteen small fixes. They are not. Reading them against `docs/references/my-opinion.md` and the shipped skills, nine of them collapse into **one root cause**: the orchestrator has both the *permission* and the *material* to behave like an engineer. `shared/references/methodology.md §2.2` orders it to "Read the business framing, then the task or spec **in full**". Once a thin orchestrator has 8k tokens of specification in its window, it forms opinions about feasibility (complaint 2), it evaluates reviewer findings it now feels qualified to judge (complaint 3), and — because it has opinions it cannot act on without permission — it starts holding option dialogs with the user (complaint 6). Complaints 7, 8 and 10 (backlog hygiene, unrequested `changelog.md`, invented `docs/` files) are a *different* root cause with a matching shape: the executor deliberately runs with no methodology skill (`docs/architecture/skills-first.md`), so every rule it must obey has to live in `AGENTS.md`/`CLAUDE.md` — and those rules were never written.

There is also a hard collision I cannot design around silently. Complaint 4 demands that reviewers run as ordinary interactive subscription CLI sessions inside visible Herdr panes, for cache economy and for the visual observability that `my-opinion.md` calls a business requirement. The current `mo-herdr` says the opposite: `references/herdr-mechanics.md` step 7 makes the **inline** surface (`pane run 'sh review-a.sh'` wrapping `claude -p --output-format json`) the default for anything long, and `docs/architecture/full-turn-retrieval.md` justifies it with measurements — a Claude Code TUI above ~250 rows returns a repaint collage, and only a provider-authored JSON envelope mechanically detects a turn truncated mid-answer at exit status 0. That decision is well-reasoned and it is the thing the user is rejecting. So this proposal must either overturn it with a named, honest trade, or fail the request. I overturn it, and §5 states exactly what verification strength is lost and what replaces it.

Two smaller constraints bound the solution space. Herdr agent names must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents, so slugs need a length rule. And the project contract states that everything shipped is Markdown plus two dependency-free helpers — which puts the user's "bundle the SDKs like brain-council does" instruction (complaint 9) in direct conflict with `AGENTS.md`; brain-council is a TypeScript runtime project with a real `node_modules`, and meta-o deliberately is not. I take the conservative path there and record it as an assumption in §6 rather than amending the contract on my own authority.

---

## 1. Approach summary

Make the orchestrator's thinness **structural instead of aspirational**: it may read commit metadata and file *paths*, never file *contents*, and it moves reviewer findings by handing the executor a filesystem path rather than by pasting text it has read — which makes complaints 2, 3 and 6 physically impossible instead of forbidden. Move every actor onto ordinary interactive Herdr agent sessions in a fixed, named pane topology (executor in a sibling vertical pane, reviewers in their own tab split into two vertical panes), and replace the 1000-row transcript-assembly problem with a three-line control-plane footer plus an out-of-band findings file, so long verdicts never have to survive a TUI repaint. Finally, move the executor's behavioural rules — version control, backlog discipline, no unrequested documents — into the `AGENTS.md`/`CLAUDE.md` contract that `mo-setup` authors, because the executor runs with no skill and that file is the only thing it reliably reads.

---

## 2. Architecture and component breakdown

Nothing below adds a daemon, a state store, an adapter layer or a CLI. Every component is prose in an existing authored skill, or a clause in a project's own contract file. `herdr agent list` **is** the registry; Git is the state.

### 2.1 The orchestrator's read budget — the load-bearing change

A new named boundary, recorded in `docs/architecture/orchestrator-read-budget.md`, citing the business reason "the orchestrator's main resource is a clean, durable control context" (`my-opinion.md`, thin-orchestrator section).

| The orchestrator MAY read                                                                                                            | The orchestrator MUST NOT read                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `git status --porcelain`, `git rev-parse HEAD`, `git log --oneline -20`, `git branch --show-current`                                  | any diff, any hunk, any source file                                                  |
| the *existence and non-emptiness* of `<SPEC_PATH>` and `<BUSINESS_PATH>` (`test -s`)                                                  | the **body** of the spec or the business framing                                      |
| `Makefile` target names and package-script names (`make -qp`-style listing, or `grep -o '^[a-z-]*:'`)                                 | the bodies of those targets                                                           |
| `herdr agent list`, `agent get`, `tab list`, `pane list` JSON                                                                          | the body of any findings file                                                         |
| the **last 40 rows** of an actor pane, to read the footer defined in §3.3                                                              | a full reviewer turn, a full executor turn, a test log                                |
| the user's own message text, verbatim, when writing the business framing                                                              | `docs/e2e.md` beyond the list of scenario names                                        |

The one deliberate exception survives: §2.1 of the methodology still lets the orchestrator *write* the business framing from the user's own words, because that text is already in its context and the alternative is losing the only copy. Writing what the user just said is not reading a large document.

Two consequences worth naming. First, **"can this spec be implemented?" stops being an orchestrator question** and becomes the executor's first turn — which is also the only actor that can answer it, since it is the one that reads code. Second, the orchestrator can no longer evaluate a reviewer finding even if it wants to, which is complaint 3 closed by construction rather than by discipline.

### 2.2 Pane and tab topology (complaints 1, 11)

Fixed, named, and created by the orchestrator at run start. `<slug>` is lowercase `[a-z][a-z0-9-]{0,19}` — capped at 20 characters so that `<slug>-rev-a` stays inside Herdr's 32-character agent-name limit.

```
tab: "mo:<slug>"                     ← orchestrator renames its OWN tab (complaint 11)
 ├── pane (caller)   orchestrator
 └── pane (right)    <slug>-exec     ← adjacent vertical pane (complaint 1)

tab: "mo:<slug>:review"              ← separate tab, created by the orchestrator
 ├── pane (root)     <slug>-rev-a    ← two vertical panes (complaint 1)
 └── pane (right)    <slug>-rev-b

tab: "mo:<slug>:e2e"                 ← assumption, see §6
 └── pane (root)     <slug>-e2e
```

Responsibilities: the **orchestrator** owns topology creation, naming and renaming, and never closes a tab or pane it did not create. Every actor pane is renamed (`herdr pane rename`) to its role, so the visual observability requirement is satisfied at a glance rather than by decoding pane IDs.

### 2.3 Prompt transport (complaint 5)

The missing `<enter>` is not an agent memory failure; it is a wrong-primitive failure. Herdr's own skill file states that **`agent prompt` atomically submits text and encoded Enter while honouring the pane's live bracketed-paste mode**, and `pane run` does the same for shell commands. `pane send-text` and `send-keys` do not. So the rule is a ban, not a reminder:

- prompt submission → `herdr agent prompt <name> "<text>" --wait --timeout <ms>` **only**;
- shell command in a non-agent pane → `herdr pane run <pane> '<cmd>'` **only**;
- `agent send-keys` is permitted **only** for interactive UI controls (`esc`, `ctrl+c`) and never to submit a prompt;
- `pane send-text` is not used by this workflow at all.

A rule phrased as "remember to press Enter" would be re-forgotten after the next compaction. A rule phrased as "these two commands, never those two" survives, because the wrong command simply is not in the skill.

### 2.4 Findings transport by path, not by paste (complaints 3, 4)

The methodology currently says "Copy findings into the executor's next prompt **verbatim and whole**." That instruction was written to prevent summarisation, but it forces the entire verdict through the orchestrator's context — which is both the cache cost the user objects to and the raw material for complaint 3.

Replace it with **path handoff**. The orchestrator gives each reviewer a findings path before the review; afterwards it hands the executor that path and never opens it. This is strictly *more* verbatim than pasting, since no transcription step exists, and it costs the orchestrator roughly 60 tokens per round instead of several thousand.

### 2.5 The executor's rules live in the project contract (complaints 7, 8, 10, 13)

`mo-setup` §2 currently requires `AGENTS.md`/`CLAUDE.md` to be byte-identical and to carry the desired outcomes and commands. It gains three mandatory clauses, because the executor has no skill and this file is its only durable instruction source. Exact authored text in §3.5.

### 2.6 Waiting (complaint 14)

A new methodology section, `§12 Waiting`. The incident in the report is precisely diagnosed by the user: the orchestrator waited on a **derived** signal (`HEAD != 216eb7b`) that was already unsatisfiable, inside a compound predicate, based on a stale screen reading of "11 of 14". The design rule follows the diagnosis exactly — wait on the actor's own lifecycle, never on a consequence of it.

### 2.7 Model catalogue (complaint 9)

Moved from a run-time surprise to a setup-time check plus a non-blocking run-time line. Detailed in §3.6.

---

## 3. Interfaces and data models

### 3.1 Topology construction

Commands are examples; per the project's own rule the installed `herdr --skill` and `herdr <cmd>` output is the syntactic source of truth. IDs are always parsed from the JSON response, never predicted.

```bash
# 0. Rename the orchestrator's own tab.  Requires HERDR_ENV=1 and $HERDR_TAB_ID.
herdr tab rename "$HERDR_TAB_ID" "mo:<slug>"

# 1. Executor: sibling vertical pane in the orchestrator's tab, user's focus untouched.
EXEC_PANE=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus \
            | jq -r '.result.pane.pane_id')
herdr pane rename  "$EXEC_PANE" "<slug> exec"
herdr agent start  "<slug>-exec" --kind <claude|codex> --pane "$EXEC_PANE" -- <native args>

# 2. Reviewers: own tab, split once to the right → two vertical panes.
TAB_A=$(herdr tab create | jq -r '.result.tab.tab_id')
PANE_A=$(herdr tab create ... | jq -r '.result.root_pane.pane_id')     # same response
herdr tab rename "$TAB_A" "mo:<slug>:review"
PANE_B=$(herdr pane split --pane "$PANE_A" --direction right --cwd "$PWD" --no-focus \
         | jq -r '.result.pane.pane_id')
herdr agent start "<slug>-rev-a" --kind claude --pane "$PANE_A" -- <native args>
herdr agent start "<slug>-rev-b" --kind codex  --pane "$PANE_B" -- <native args>
```

**Error cases, each with a defined orchestrator response:**

| Condition | Signal | Response |
| --- | --- | --- |
| Not running under Herdr | `HERDR_ENV` unset/empty | Stop. `needs_attention`. Never fabricate the variable. |
| `tab create` has no `--cwd` flag | exit status 2 (syntax) | `herdr pane run "$PANE_A" 'cd <repo-root>'`, confirm via `pane get`, then `agent start`. |
| Pane not at an interactive prompt | `agent start` error JSON on stderr, exit 1 | Do not retry blindly: `pane read` the last 20 rows, report `needs_attention`. |
| `agent start` startup timeout (30s default) | error JSON | One retry, then `needs_attention` naming the provider. |
| Name collision | error JSON | A live actor with that name already exists — this is **recovery**, not failure: adopt it (§3.7). |
| CLI syntax error | exit 2 | The installed interface differs from the example. Re-read `herdr --skill`. Never guess a flag twice. |

### 3.2 Prompt submission

```
herdr agent prompt <name> "<text>" --wait --timeout <ms>
  → JSON on stdout; agent settles at idle | done | blocked
  → error "agent_prompt_stalled" when a prompt from a non-working state
    produces no observed lifecycle change within 5s
  → exit 1: server error JSON on stderr;  exit 2: syntax error
```

`--wait` settles the **lifecycle**, not a turn. Before sending, the orchestrator records `state_change_seq` and `revision` from `herdr agent get <name>`; after settling it re-reads both. **A turn boundary is only claimed when `state_change_seq` has increased.** This replaces the current text's flat assertion that no turn boundary is observable — it is a real, machine-readable counter that appears in the live `agent list` response — and it is marked in §6 as needing a fixture before it is relied on as the sole boundary.

Do not narrow with `--until idle`: a finished Claude Code turn settles as `done`, and Herdr's own documentation explains why — `idle` additionally requires the tab to have been *seen* in the focused UI, which a CLI read never does. The default set (`idle`, `done`, `blocked`) is correct.

### 3.3 The reviewer contract — footer plus findings file

`mo-review` owns the prompt; this is the transport it must produce. The orchestrator allocates a scratch directory **outside the repository** (never staged, never committed) and passes both the frozen SHA and the path in.

The reviewer's turn ends with exactly three lines and nothing after them:

```
MO-REVIEW <slug> <rev-a|rev-b> <full-40-char-sha>
VERDICT: PASS | FINDINGS
FINDINGS: <absolute path> | none
```

The orchestrator reads only the last 40 rows of the pane to obtain this. Acceptance requires **all** of:

1. `state_change_seq` increased since the prompt (§3.2);
2. the footer is well-formed and its SHA equals the SHA the orchestrator froze and sent;
3. `VERDICT: FINDINGS` ⟹ the named file exists and is non-empty;
4. `VERDICT: PASS` ⟹ `FINDINGS: none`.

Any other outcome — footer absent, malformed, stale SHA, contradictory, or file missing/empty — is **`unknown`**, and `unknown` repeats the role. There is still no partial PASS.

**Executor handoff, the orchestrator's entire per-round context cost:**

```bash
herdr agent prompt "<slug>-exec" \
"Reviewer A reviewed <sha> and returned findings at <path>. Read that file in \
full and address every finding. Fix what is real; where you decline, leave a \
code comment at the site saying why. Then commit and report the new SHA." \
--wait --timeout 1800000
```

**Dispute routing, without the orchestrator reading code.** If the executor rebuts a finding, the orchestrator does not adjudicate. It writes the executor's rebuttal path to the *other* reviewer — "Reviewer A raised the finding at `<path-a>`; the executor's response is at `<path-r>`; you did not write either; judge which is correct and say so in one line" — and takes that verdict. Human escalation happens only when both reviewers and the executor deadlock, which is exactly `my-opinion.md`'s "при неясности используем независимую критику другой модели".

### 3.4 The wait protocol (`methodology §12`)

```
wait(actor, timeout_ms) -> settled | timeout
  primary:  herdr agent wait <actor> --timeout <ms>     # event-driven, no polling
  fallback: on timeout, ONE herdr agent get; then re-arm
```

Four rules, each traceable to the reported incident:

1. **Wait on the actor, never on a consequence.** The condition is exactly "this actor's lifecycle settled". A new SHA, a commit count, a clean tree, or a progress string read off a screen are **never** wait conditions. They are things you *check after waking*.
2. **No compound predicates.** One actor, one wait. The failure was a three-part AND whose third clause was unsatisfiable at the moment it was written.
3. **Never infer a future event from a rendered screen.** "11 of 14" in a repainting TUI is stale the instant it is read, and it is not a commitment by anyone.
4. **Timeouts are 5–10 minutes of re-arm granularity, and the total budget is bounded.** Concretely: `--timeout 600000` (10 min) per arm, re-armed up to six times (one hour total). On the first *and* every subsequent timeout the orchestrator does not simply re-arm blindly — it reads `agent get` once, and if the actor is not `working`, it asks the actor directly ("status?") rather than continuing to wait. A 55-minute silent wait on an impossible condition cannot recur, because no wait is ever longer than 10 minutes without a direct state check.

Two actors settling at once is not an event-loss hazard here: Herdr exposes **pollable state**, not a consumable event queue, so after handling reviewer A the orchestrator re-reads `agent get <slug>-rev-b` and finds its settled state still true. The cost is latency, not correctness — which is why the corresponding upstream issue (§5, gap 4) is filed as an efficiency request, not a bug.

### 3.5 The three contract clauses for `AGENTS.md` / `CLAUDE.md`

Authored by `mo-setup`, written **identically into both files** (`cmp -s AGENTS.md CLAUDE.md` already gates this).

**(a) Version control** — the user's text, adopted nearly verbatim, with one added sentence covering projects that have no `develop`:

> ## Version control
>
> Never develop directly on `main`, `master`, `develop`, or `default`. Create each task branch from an up-to-date `develop` using `feature/<short-slug>` and use it for the whole task. If the project has no `develop` branch, branch from the default branch and say so in the first commit message.
> Run the relevant checks before committing. Commit every coherent, independently verifiable increment instead of accumulating the whole task in one commit. Use `<type>: <what changed and why>` with `feat`, `fix`, `refactor`, `test`, `docs`, or `chore`. Reference an issue or specification when one exists, but neither is required. End every agent-authored commit with a new line and the executor harness model: `Assisted-by: {model}`
> The final verified result is one full Git SHA. Any subsequent commit invalidates its review and verification gates.

**(b) Backlog discipline** (complaint 7):

> `docs/backlog.md` records **only work that is not done**. It has one section. When an entry is completed, delete it — the commit is the record. Never add a "Closed", "Done" or "Completed" section, and never move an entry into one.

**(c) Documentation discipline** (complaints 8, 10):

> Create no file the task did not ask for. In particular: no `CHANGELOG.md` — Git history is the changelog — and no migration note, summary, report or "what I did" document. `docs/architecture/` records a boundary or a decision that constrains future changes; it does not record that you performed a change. Consolidating four READMEs into one is a commit message, not a new document. Update the knowledge that this change made new or false, and add nothing else.

### 3.6 Model catalogue

The failure mode in the report was not only that the Claude catalogue was unreachable — it was that the orchestrator *narrated its uncertainty at the user* mid-preflight. Two changes:

- **Capability, at setup time.** `mo-setup` gains a step that checks whether `@anthropic-ai/claude-agent-sdk` resolves from any of the three locations `mo-models.mjs` already probes (module resolution, project tree, `npm root -g`), and if not, offers `npm i -g @anthropic-ai/claude-agent-sdk` as remediation, recording a `docs/backlog.md` entry if the user declines. This keeps the shipped tree dependency-free while making the catalogue routinely available. It is a deviation from the literal "bundle it like brain-council" instruction; see §6.
- **Behaviour, at run time.** `methodology §2.5` becomes: print the saved roles in one line, name any unavailable catalogue in the *same* line, and **continue**. The orchestrator does not stop, does not ask, and does not editorialise. `--set` validation is unchanged: a route with a complete catalogue still refuses an unknown id, and `--force` remains the escape hatch.

### 3.7 Recovery

Unchanged in spirit, cheaper in practice. `herdr agent list` already returns, per actor, the Herdr `name`, `pane_id`, `tab_id`, `agent_status`, `interactive_ready`, `state_change_seq` **and** `agent_session.value` — the provider's own session id (verified live: a Claude UUID, a Codex UUID, an OpenCode `ses_…`). A restarted orchestrator therefore recovers the full actor set from one JSON call plus Git, with no registry and no state file. An actor whose name it expects but does not find is restarted; an actor it finds is adopted, never duplicated.

---

## 4. Trade-offs considered

**Interactive TUI sessions vs. the inline JSON envelope.** This is the real decision. The inline surface gives a mechanically-verifiable turn boundary: a truncated `claude -p --output-format json` capture fails to parse, and `codex exec --json` ends with an explicit `turn.completed`. Interactive sessions give none of that. I chose interactive anyway, for three reasons the user states and the business framing confirms: cache economy across review rounds (a warm session's round-two prompt is "re-review `<sha>`", not a cold re-read of the project), visual observability with the ability for the user to type into the session himself, and the fact that inline sessions are invisible in Herdr — which `my-opinion.md` lists as a meta-harness requirement, not a nicety. **What replaces the lost envelope is not one check but five** (§3.3): a Herdr-authored `state_change_seq` transition that no model can fake, a SHA echo that catches a stale or confused turn, a file-existence check the orchestrator controls the path of, a PASS/FINDINGS consistency check, and — most importantly — the fact that the *executor* is the actor reading the findings file, so a truncated file surfaces as a real complaint from something that has the context to notice.

**Is the footer the banned sentinel?** `herdr-mechanics.md §3` bans "a closing sentinel requested from the reviewer, under any name", and I should not pretend the footer escapes that on a technicality. It does not; it is a relaxation, and it needs the architecture doc updated rather than quietly ignored. What changes is the *job* the sentinel does. In the banned design, the marker was asked to prove "I have read this entire verdict" — a claim about content the orchestrator had to ingest, where a truncated verdict reads as a whole one and becomes a false PASS. Here the orchestrator ingests no content at all: the footer is a control-plane signal, and the worst case of a lost finding is that the *next* round on the *same* frozen SHA finds it again, costing a round rather than producing a false PASS. A false PASS still requires the reviewer to affirmatively write `VERDICT: PASS`, which is a claim, not a truncation artefact.

**Path handoff vs. verbatim paste.** Paste is what the methodology says today and it has one genuine advantage: the orchestrator can *see* that something was transferred. I gave that up because it is the same property that lets the orchestrator grade findings, and because path handoff removes the transcription step entirely — there is no opportunity to summarise something you never opened.

**Contract clauses vs. a longer executor prompt.** Run-specific constraints travel in the goal text; durable behavioural rules must not, because the goal is re-sent per run and the executor compacts. `my-opinion.md` is explicit that a rule the executor read once and lost after compaction is worse than no rule, since the model still believes it is compliant. `AGENTS.md` is re-read by the provider CLI itself, which is exactly the durability property needed — and it is why complaints 7, 8, 10 and 13 all land in the same file.

**Setup-time SDK install vs. bundling.** Bundling gives a guaranteed catalogue at the cost of breaking "everything shipped is Markdown plus two dependency-free helpers", inflating every one of seven skill installs, and importing an Agent SDK into a project whose business framing explicitly rejects building the flow on Agent SDKs. The setup-time install gets the same capability for one command, and keeps the contract intact.

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| **Weaker completeness proof than the JSON envelope** | The five-part acceptance check in §3.3; failure is `unknown` and repeats. Named honestly in the amended `docs/architecture/full-turn-retrieval.md` rather than presented as equivalent. |
| **Reviewer omits or malforms the footer** | Detected, not silent → `unknown` → repeat the role. `mo-review` places the footer requirement last in its prompt, where recency helps. |
| **A reviewer writes a truncated findings file** | The executor reads it and must answer every finding; truncation surfaces as an executor report. The next round re-reviews the same SHA. Costs a round, not a gate. |
| **`state_change_seq` does not mean what I think** | Flagged as fixture H13 (§6) and gated on it. Until closed, the existing settled-state check remains the primary boundary and `state_change_seq` is corroborating evidence only. |
| **Orchestrator drifts back into reading code** | The read budget is a short two-column table, re-read on every restart, and — crucially — the workflow gives it no reason to: findings arrive as paths it cannot usefully open. |
| **OpenCode long-turn retrieval** | Unchanged: OpenCode remains unsupported for the review gate. This design does not rescue it and does not claim to. |
| **Slug too long → invalid agent name** | Slug rule `[a-z][a-z0-9-]{0,19}` in the skill, so `<slug>-rev-a` ≤ 26 chars. |
| **Orchestrator closes a user's pane or tab** | Herdr's own safety rule adopted verbatim: never close what you did not create. |
| **Version-control clause changes meta-o's own workflow** | Real: this repo is currently *on* `develop`, with `origin/HEAD → master`. Adopting the clause means meta-o's own feature work moves to `feature/<slug>`. Called out so it is a decision, not a surprise. |

### Genuine Herdr capability gaps that should become upstream issues

These are gaps this design **works around rather than depends on** — the workflow functions today without any of them being fixed.

1. **`agent read --lines` caps at 1000 rendered rows and gives no truncation signal.** Measured: `--lines 1600` and `--lines 3200` both returned 996 unwrapped rows while the pane reported `max_offset_from_bottom: 1889`. *Request:* report `truncated: true` and `available_rows` in the response, and add a line-range read (`--from-line` / `--to-line`).
2. **Alternate-screen rows never enter host scrollback, and there is no scroll method.** `pane.*` exposes read-only `PaneScrollInfo`; `send-keys pageup` is refused as an unsupported key. So a full-screen TUI agent's completed long answer is unrecoverable by any programmatic means. *Request:* an opt-in per-pane transcript capture for alternate-screen agents, or a scroll/viewport-move method.
3. **No per-agent context or cost telemetry.** `agent list` reports lifecycle and session identity but nothing about context size, tokens used, or time since last turn. `my-opinion.md` lists context/cache/cost visibility as a meta-harness requirement, and without it the orchestrator cannot make the "warm session vs. new session" decision that the same document specifies. *Request:* surface whatever the provider already reports as agent metadata.
4. **No multi-actor wait.** `agent wait` blocks on one agent, so two reviewers finishing near-simultaneously are handled serially. Correctness is safe because Herdr exposes pollable state rather than a consumable queue, but latency is not. *Request:* `herdr agent wait a,b --any`, or an event-stream subscription.

A fifth, smaller one worth reporting but probably not filing: `idle` versus `done` depends on whether the tab was *seen in the focused UI*, which leaks a UI concept into an automation-facing state machine. It is documented and workable — automation simply accepts both — but it surprises every first-time integrator.

---

## 6. Assumptions and open questions

**Assumptions I have made and am recording rather than asking about:**

1. **SDK bundling is not adopted; setup-time install is.** The user asked for brain-council-style bundling; `AGENTS.md` says the shipped tree is Markdown plus two dependency-free helpers, and `my-opinion.md` rejects building the flow on Agent SDKs. The conservative reading is that the user wants *the capability* (a working model catalogue), not *the mechanism*. If the user in fact wants the mechanism, this becomes an amendment to the distribution contract and a new `docs/architecture/` entry — a decision above my authority here.
2. **The E2E actor gets its own tab.** The user specified topology only for the executor and reviewers. E2E runs Docker and browsers and is noisy, so co-locating it with reviewers would obscure them.
3. **The orchestrator sends the `/goal` itself and echoes it** (complaint 12). Two texts ship: an *orchestrator start prompt* printed when `mo-herdr` is invoked with no arguments, so the user can paste one line instead of being interviewed; and the *executor goal*, which the orchestrator sends as an atomic `agent prompt` and then echoes to the user in one line for observability. "Advise the user which prompt to type" would reintroduce the human as a message bus.
4. **Reviewer scratch files live outside the repository**, in a per-run scratch directory, and are never staged or committed — consistent with the existing capture-file rule.
5. **`herdr tab create` flag set is unverified.** `tab create` returns `.result.tab` and `.result.root_pane`; whether it accepts `--cwd` or a label is not documented in `herdr --skill`, and sub-command `--help` falls back to global help. The `pane run 'cd …'` fallback in §3.1 makes the design work either way.

**Open questions that need a decision or a measurement:**

- **Fixture H13 — does `state_change_seq` increment exactly once per turn?** It appears in the live `agent list` response and is the cheapest available turn boundary, but its semantics are undocumented. Must be measured before it is load-bearing.
- **Fixture H14 — topology under an existing layout.** What happens when the orchestrator's tab is already split, or the pane is too narrow for a right split? Herdr's own guidance warns against repeated same-direction splits producing unusable columns.
- **Fixture H15 — the footer-plus-file handoff, per provider**, including the deliberate negative case: a reviewer that omits the footer must produce `unknown`, not PASS.
- **Does the executor's `Assisted-by: {model}` trailer name the model or the route?** `claude/opus/high` is unambiguous but verbose; `opus` is short and ambiguous across efforts. I lean toward the full route string, but the user's example writes `{model}`.
- **Does this replace or coexist with the inline surface?** My proposal demotes inline to a bounded fallback for a reviewer that cannot produce a readable footer at all. Deleting it outright would discard measured, working machinery; keeping it as the default contradicts the request. Demotion is the middle path, and it is worth confirming that is what the user means.

**File-by-file decomposition** (nine work items, each independently reviewable): `shared/references/methodology.md` §1/§2.2/§2.5/§4/§5/§9/§11 + new §12 · `src/skills/mo-herdr/SKILL.md` topology, transport, start prompt · `src/skills/mo-herdr/references/herdr-mechanics.md` §1 rewrite, §3 amendment · `src/skills/mo-review/SKILL.md` footer and findings-path contract, dispute routing · `src/skills/mo-setup/SKILL.md` three contract clauses + SDK remediation · `src/skills/mo-omnigent/SKILL.md` parity for the backend-neutral parts · `docs/architecture/full-turn-retrieval.md` amendment + new `docs/architecture/orchestrator-read-budget.md` · `docs/phase-0-fixtures.md` H13–H15 · this repo's own `AGENTS.md`/`CLAUDE.md`, which must change together or `make mo-qc` fails. `skills/` is rebuilt by `make skills`, never hand-edited.