I re-derived the Herdr contract from `herdr api schema --json` (protocol 19, schema_version 1) rather than from prose, which confirmed one reviewer's live findings and overturned two of my own claims. The revision below is grounded in those exact parameter definitions.

---

# Interactive Herdr sessions, a starved orchestrator, and a contract that carries the executor's rules

## Constraints and considerations before any recommendation

Fourteen complaints arrived as one report, and the tempting move is to treat them as fourteen small fixes. They are not. Read against `docs/references/my-opinion.md` and the shipped skills, five of them collapse into **one root cause**: the orchestrator has both the *permission* and the *material* to behave like an engineer. `shared/references/methodology.md §2.2` orders it to "Read the business framing, then the task or spec **in full**". Once a thin orchestrator holds several thousand tokens of specification, it forms opinions about feasibility (complaint 2), it feels qualified to grade reviewer findings (complaint 3), and — having opinions it cannot act on unilaterally — it starts holding option dialogs with the user (complaint 6). Complaints 7, 8 and 10 (backlog hygiene, unrequested `changelog.md`, invented `docs/` files) share a different root cause with the same shape: the executor deliberately runs with no methodology skill (`docs/architecture/skills-first.md`), so every durable rule it must obey has to live in `AGENTS.md`/`CLAUDE.md` — and those rules were never written.

There is a hard collision I cannot design around silently. Complaint 4 demands that reviewers run as ordinary interactive subscription CLI sessions in visible Herdr panes, for cache economy and for the visual observability `my-opinion.md` states as a meta-harness requirement. The shipped `mo-herdr` says the opposite: `references/herdr-mechanics.md` step 7 makes the **inline** surface (`pane run 'sh review-a.sh'` around `claude -p --output-format json`) the default for anything long, and `docs/architecture/full-turn-retrieval.md` justifies it with measurements — a Claude Code TUI above roughly 250 rows returns a repaint collage, and only a provider-authored JSON envelope mechanically detects a turn truncated mid-answer at exit status 0. That reasoning is sound, and it is precisely what the user is rejecting. So this proposal must either overturn it with a named, honest trade or fail the request. I overturn it, and §4 states exactly which verification strength is surrendered and what replaces it.

Three smaller constraints bound the solution space. Herdr agent names must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents, so slugs need a length rule. The project contract states that everything shipped is Markdown plus two dependency-free helpers, which puts the user's "bundle the SDKs like brain-council does" instruction (complaint 9) in direct conflict with `AGENTS.md` — brain-council is a TypeScript runtime project with a real `node_modules`, and meta-o deliberately is not. And the two reviewers share one filesystem, so any file-based findings transport has an independence leak that must be closed explicitly rather than assumed away.

### Traceability: every complaint to the mechanism that closes it

| # | Complaint | Mechanism | §  |
| --- | --- | --- | --- |
| 1 | Executor in a sibling vertical pane; reviewers in their own tab, two vertical panes | Fixed topology, `pane.split direction=right`, `tab.create` | 2.2 / 3.2 |
| 2 | Orchestrator reads the spec and judges feasibility | Read budget: existence check only; feasibility is the executor's first turn | 2.1 / 3.1 |
| 3 | Orchestrator grades reviewer findings against code | Findings never enter its context — path handoff | 2.4 / 3.5 |
| 4 | Reviewers launched outside Herdr; cache and visibility lost | Interactive `agent start` sessions, kept alive across rounds; inline demoted to bounded fallback | 2.3 / 4 |
| 5 | Agent forgets `<enter>` | `agent.prompt` / `pane.run` are atomic text+Enter; `send_text`/`send_keys` banned for submission | 2.3 / 3.3 |
| 6 | Orchestrator interrogates the user, offers option menus | Standing-principles decision table; menus banned; questions routed to actors, not the human | 2.5 / 3.7 |
| 7 | Backlog contains completed work | Contract clause (b): one section, delete when done | 2.6 / 3.8 |
| 8 | Unrequested `changelog.md` | Contract clause (c) | 2.6 / 3.8 |
| 9 | Model catalogue unavailable; orchestrator stalled on it | Setup-time capability check; run-time one line, never blocking | 2.8 / 3.10 |
| 10 | Invented `docs/` files | Contract clause (c) | 2.6 / 3.8 |
| 11 | Rename the tab when the orchestrator starts | `tab.rename` on `$HERDR_TAB_ID` at run start | 2.2 / 3.2 |
| 12 | Suggest the short `/goal`; give a start prompt | Both texts ship; orchestrator sends the goal and echoes it | 2.5 / 3.9 |
| 13 | Version-control rules into `AGENTS.md`/`CLAUDE.md` | Contract clause (a), authored by `mo-setup` | 2.6 / 3.8 |
| 14 | Hour-long waits on impossible conditions | Wait on the actor's lifecycle only; 10-minute arms; no compound predicates | 2.7 / 3.6 |

---

## 1. Approach summary

Make the orchestrator's thinness **structural rather than aspirational**: it may read commit metadata, actor state and file *paths*, never file *contents*, and it moves reviewer findings by handing the executor a filesystem path instead of pasting text it has read — which makes complaints 2, 3 and 6 largely impossible rather than merely forbidden. Move every actor onto ordinary interactive Herdr agent sessions in a fixed, named pane topology (executor in a sibling vertical pane, reviewers in their own tab split into two vertical panes), and make the reviewer's **findings file its primary artefact** so that a long verdict never has to survive a TUI repaint; the pane carries only a three-line control-plane footer read from the bottom-buffer snapshot. Finally, move the executor's durable behavioural rules — version control, backlog discipline, no unrequested documents — into the `AGENTS.md`/`CLAUDE.md` contract that `mo-setup` authors, because the executor runs with no skill and that file is the only thing it reliably re-reads.

---

## 2. Architecture and component breakdown

Nothing below adds a daemon, a state store, an adapter layer or a CLI. Every component is prose in an existing authored skill, or a clause in a project's own contract file. `herdr agent list` **is** the registry; Git is the state.

### 2.1 The orchestrator's read budget — the load-bearing change

A new named boundary, recorded in `docs/architecture/orchestrator-read-budget.md`, citing the business reason "the orchestrator's main resource is a clean, durable control context" (`my-opinion.md`, thin-orchestrator section).

| MAY read | MUST NOT read |
| --- | --- |
| `git status --porcelain`, `git rev-parse HEAD`, `git log --oneline -20`, `git branch --show-current` | any diff, any hunk, any source file |
| *existence and non-emptiness* of `<SPEC_PATH>` and `<BUSINESS_PATH>` (`test -s`) | the **body** of the spec or the framing |
| `Makefile` target names and package-script names | the bodies of those targets |
| `herdr agent list`/`get`, `tab list`, `pane list` JSON | the body of any findings, rebuttal or question file |
| the last 40 rows of an actor pane, `--source detection`, to read a footer (§3.4) | a full reviewer turn, a full executor turn, a test log |
| the user's own message text, verbatim, when writing the business framing | `docs/e2e.md` beyond its scenario names |

One deliberate exception survives: methodology §2.1 still lets the orchestrator *write* the business framing from the user's own words, because that text is already in its context and the alternative is losing the only copy of the request. Writing what the user just said is not reading a large document.

Two consequences worth naming. **"Can this spec be implemented?" stops being an orchestrator question** and becomes the executor's first turn — which is also the only actor equipped to answer it. And the orchestrator cannot evaluate a reviewer finding even if tempted, which closes complaint 3 by construction.

### 2.2 Pane and tab topology (complaints 1, 11)

Fixed, named, created by the orchestrator. `<slug>` is `[a-z][a-z0-9-]{0,19}` — capped at 20 characters so `<slug>-rev-a` stays inside Herdr's 32-character agent-name limit.

```
tab "mo:<slug>"                 ← orchestrator renames its OWN tab (complaint 11)
 ├─ pane (caller)  orchestrator
 └─ pane (right)   <slug>-exec  ← adjacent vertical pane (complaint 1)

tab "mo:<slug>:review"          ← separate tab (complaint 1)
 ├─ pane (root)    <slug>-rev-a ┐ two vertical panes, ratio 0.5
 └─ pane (right)   <slug>-rev-b ┘

tab "mo:<slug>:e2e"             ← single topology assumption, §6
 └─ pane (root)    <slug>-e2e
```

The orchestrator owns topology creation and naming, and never closes a tab or pane it did not create. Every actor pane is renamed to its role via `pane.rename`, so visual observability is satisfied at a glance instead of by decoding pane IDs. Reviewer sessions are started when the **first candidate is frozen**, not at run start, and then kept alive for every subsequent round — that is where the cache economy of complaint 4 actually lives.

### 2.3 Prompt transport (complaint 5)

The missing `<enter>` is a wrong-primitive failure, not a memory failure. The schema and Herdr's own skill file agree: `agent.prompt` atomically submits text **and** encoded Enter while honouring the pane's live bracketed-paste mode, and `pane.run` does the same for shell commands. `pane.send_text` and `pane.send_keys` do not. So the rule is a ban, not a reminder:

- prompt submission → `herdr agent prompt` **only**;
- shell command in a non-agent pane → `herdr pane run` **only**;
- `agent send-keys` only for interactive UI controls (`esc`, `ctrl+c`), never to submit;
- `pane send-text` is not used by this workflow at all.

"Remember to press Enter" would be re-forgotten after the next compaction. "These two commands, never those two" survives, because the wrong command is simply not in the skill.

### 2.4 The findings file is the reviewer's primary artefact (complaints 3, 4)

The methodology currently says "Copy findings into the executor's next prompt **verbatim and whole**." That was written to prevent summarisation, but it forces the whole verdict through the orchestrator's context — the cache cost the user objects to, and the raw material for complaint 3.

Replace it with **path handoff**, and — this is the part that matters for correctness — make the file the review itself rather than a copy of a screen answer. `mo-review` instructs the reviewer to write its findings to the supplied path *as it works*, and to print only the footer to the terminal. The pane is therefore never the evidence, so nothing is ever transcribed, re-stated, or paraphrased from a repainted TUI. This is strictly *more* verbatim than pasting, and it costs the orchestrator roughly sixty tokens per round instead of several thousand.

It also makes the footer cheap to re-request. Because the footer carries no evidence — only a verdict word, a SHA and a path — asking a reviewer to print it again is a control-plane repair, not the banned "repeat your last answer verbatim". That distinction is what makes the whole transport recoverable instead of fragile.

### 2.5 The decision procedure — orchestrator autonomy (complaints 6, 12)

Complaint 6 is the one a topology change cannot fix. The orchestrator needs a decision procedure it can apply without code, and an explicit ban on the behaviour the user named ("выдаёт диалог с вариантами").

**Standing principles**, restated compactly in the skill so they survive as a short list rather than an essay: implement the whole scope, never an MVP; production-ready over placeholder; difficulty is not a reason to defer; never weaken QC or config to get green; prefer the option that keeps module boundaries intact; when genuinely unsure, ask another model, not the human.

**Hard behavioural rules.** The orchestrator never presents the user with a menu of options — it decides and states the decision in one line. It emits status only at phase boundaries (executor started, candidate frozen, review round result, gates complete), never a running narration. It never asks the user a question it could answer from the standing principles or obtain from an actor. The routing table is §3.7.

### 2.6 The executor's rules live in the project contract (complaints 7, 8, 10, 13)

`mo-setup` §2 already requires `AGENTS.md`/`CLAUDE.md` to be byte-identical and to carry outcomes and commands. It gains three mandatory clauses, because the executor has no skill and this file is its only durable instruction source. Texts in §3.8. One consequential side effect: methodology §4.7 currently says the executor must "produce one clean candidate commit", which contradicts the new "commit every coherent increment" clause. §3.8 resolves it.

### 2.7 Waiting (complaint 14)

A new methodology section, `§12 Waiting`. The user's own post-mortem is the specification: the orchestrator waited on a **derived** signal (`HEAD != 216eb7b`) already unsatisfiable when written, inside a three-part conjunction, on the strength of a stale screen reading of "11 of 14". The rule follows the diagnosis exactly — wait on the actor's own lifecycle, never on a consequence of it. Details in §3.6.

### 2.8 Model catalogue (complaint 9)

Moved from a run-time surprise to a setup-time capability check plus a non-blocking run-time line. Details in §3.10.

---

## 3. Interfaces and data models

### 3.1 Verified Herdr contract

Taken from `herdr api schema --json` (protocol 19, schema_version 1) on 2026-08-08, not from prose. Parameter names are the socket API's; the CLI spells flags in kebab-case. The installed `herdr --skill` remains the syntactic source of truth, and IDs are always parsed from JSON responses.

| Method | Params | Notes that shape the design |
| --- | --- | --- |
| `tab.create` | `{cwd?, env{}, focus=false, label?, workspace_id?}` | `label` and `cwd` at creation — no separate rename needed; `focus` defaults **false**, so the user's focus is preserved by construction |
| `tab.rename` | `{tab_id, label}` | used for the orchestrator's own tab |
| `pane.split` | `{direction: right\|down (required), cwd?, env{}, focus=false, ratio?, target_pane_id?, workspace_id?}` | `ratio` gives deterministic widths; `env` injects variables into the pane |
| `pane.rename` | `{pane_id, label?}` | role labels for observability |
| `agent.start` | `{name, kind, pane_id, args[], timeout_ms? (>3000, ≤300000)}` | startup timeout is tunable to five minutes |
| `agent.prompt` | `{target, text, wait?{timeout_ms?, until[]}}` | atomic text+Enter |
| `agent.wait` | `{target, timeout_ms?, until[]}` | **single target** — the basis of upstream gap 5 |
| `agent.read` / `pane.read` | `{source: visible\|recent\|recent_unwrapped\|detection, lines?, format, strip_ansi=true}` | `detection` is the plain-text bottom-buffer snapshot |
| `AgentStatus` | `idle \| working \| blocked \| done \| unknown` | |
| agent view fields | `status, workspace_id, tab_id, pane_id, agent, seen, state_change_seq` | `state_change_seq` is a **first-class documented field**, not a private detail |

`env` on `tab.create` and `pane.split` is more useful than it looks: variables injected into an actor's pane are re-readable by that actor at any time with a shell command, so they **survive the actor's own compaction** in a way that prompt text does not. The scratch paths travel that way as well as in the prompt.

### 3.2 Topology construction

```bash
# 0. The orchestrator renames its own tab.  Requires a real HERDR_ENV=1.
herdr tab rename "$HERDR_TAB_ID" "mo:<slug>"

# 1. Executor: sibling vertical pane; focus defaults to false, so the user stays put.
EXEC_PANE=$(herdr pane split --current --direction right --ratio 0.5 --cwd "$PWD" \
            --env MO_SCRATCH="$SCRATCH/exec" \
            | jq -r '.result.pane.pane_id')
herdr pane rename "$EXEC_PANE" "<slug> exec"
herdr agent start "<slug>-exec" --kind <claude|codex> --pane "$EXEC_PANE" \
            --timeout-ms 120000 -- <native args>

# 2. Reviewers: own tab with label and cwd set at creation, then one right split.
REV=$(herdr tab create --label "mo:<slug>:review" --cwd "$PWD")
TAB_R=$(jq -r '.result.tab.tab_id'       <<<"$REV")
PANE_A=$(jq -r '.result.root_pane.pane_id' <<<"$REV")
PANE_B=$(herdr pane split --pane "$PANE_A" --direction right --ratio 0.5 --cwd "$PWD" \
            | jq -r '.result.pane.pane_id')
herdr pane rename "$PANE_A" "<slug> review A"
herdr pane rename "$PANE_B" "<slug> review B"
herdr agent start "<slug>-rev-a" --kind claude --pane "$PANE_A" -- <native args>
herdr agent start "<slug>-rev-b" --kind codex  --pane "$PANE_B" -- <native args>
```

| Condition | Signal | Response |
| --- | --- | --- |
| Not running under Herdr | `HERDR_ENV` unset/empty | Stop, `needs_attention`. Never fabricate it. |
| Pane not at an interactive prompt | `agent.start` error JSON, exit 1 | `pane read --source detection --lines 20`, then `needs_attention`. No blind retry. |
| Startup timeout | error JSON | One retry at `--timeout-ms 300000`, then `needs_attention` naming the provider. |
| Name collision | error JSON | A live actor already holds the name — this is **recovery**: adopt it (§3.11), never duplicate. |
| Pane too narrow for a right split | `pane.layout` before splitting | Split `down` instead and say so in one line. Herdr warns against repeated same-direction splits. |
| Syntax error | exit 2 | The installed interface differs from the example. Re-read `herdr --skill`. Never guess a flag twice. |

### 3.3 Prompt submission and turn boundary

```
herdr agent prompt <target> "<text>" --wait --timeout <ms>
  → JSON; settles at idle | done | blocked
  → "agent_prompt_stalled" when a prompt from a non-working state produces
    no observed lifecycle change within 5s
  → exit 1 server error JSON on stderr; exit 2 syntax error
```

`--wait` settles the **lifecycle**, not a turn. Before sending, the orchestrator records `state_change_seq` from `agent get <target>`; after settling it re-reads it. **A turn boundary is claimed only when `state_change_seq` has increased.** The field is a documented agent-view field, so this is not a private detail — but "increments exactly once per turn" is still an assumption, and fixture H13 (§6) gates it. Until H13 closes, `state_change_seq` corroborates the settled-state check rather than replacing it.

Do not narrow with `--until idle`. A finished Claude Code turn settles as `done`, because `idle` additionally requires the tab to have been *seen* in the focused UI and a CLI read never marks it seen. The default set (`idle`, `done`, `blocked`) is correct.

### 3.4 The reviewer contract — file first, footer second

The orchestrator creates a per-run scratch tree **outside the repository**, with a **separate, unguessable subdirectory per reviewer**:

```
$SCRATCH/<slug>/rev-a-<random>/findings-<sha>.md
$SCRATCH/<slug>/rev-b-<random>/findings-<sha>.md
```

Reviewer A is told only its own path, and B only its own. This closes a real independence leak: the two reviewers share one filesystem and one yolo posture, so a predictable sibling path would let B read A's findings and silently destroy the independence the whole gate rests on. Directories are `chmod 700`, and the tree is removed when the run ends. There is no index, no manifest and no digest of these files — they have no external consumer.

`mo-review` instructs the reviewer to write findings to its path as it works and to end its turn with exactly three lines:

```
MO-REVIEW <slug> <rev-a|rev-b> <full-40-char-sha>
VERDICT: PASS | FINDINGS
FINDINGS: <absolute path> | none
```

The orchestrator reads only `agent read <target> --source detection --lines 40`. Using the bottom-buffer snapshot rather than `recent-unwrapped` is deliberate: it is the surface that survives the alternate-screen problem, because it is the *current* viewport rather than scrollback that a full-screen TUI never wrote.

Acceptance requires **all** of:

1. `state_change_seq` increased since the prompt;
2. the footer is well-formed and its SHA equals the SHA the orchestrator froze and sent;
3. `VERDICT: FINDINGS` ⟹ the named file exists, is non-empty, and lies inside that reviewer's own subdirectory;
4. `VERDICT: PASS` ⟹ `FINDINGS: none`.

Anything else — footer absent, malformed, stale SHA, contradictory, wrong directory, empty file — is **`unknown`**. Repair is one cheap follow-up in the same warm session: *"print your MO-REVIEW footer for `<sha>`"*. Two failed repairs make the role `unknown` and it is repeated from a fresh prompt. There is still no partial PASS.

### 3.5 The executor contract

Symmetric, and the piece that makes §3.6 possible without screen-reading:

```
MO-EXEC <slug> <full-sha | none> READY | QUESTION | BLOCKED
NOTE: <absolute path> | none
```

`READY` is a claim, never proof. The orchestrator verifies it with **direct state**: `git rev-parse HEAD` equals the footer's SHA, and `git status --porcelain` is empty. A `READY` that fails either check is answered with one line — *"the worktree is not clean; finish the candidate"* — not with a wait.

Findings handoff, the orchestrator's entire per-round context cost:

```bash
herdr agent prompt "<slug>-exec" \
"Reviewer A reviewed <sha> and wrote its findings to <path>. Read that file in \
full and address every finding: fix what is real, and where you decline, leave a \
code comment at the site saying why. Commit, then print your MO-EXEC footer." \
--wait --timeout 600000
```

### 3.6 The wait protocol (`methodology §12`)

```
wait(actor, 600000) -> settled | timeout
  primary:  herdr agent wait <actor> --timeout 600000     # event-driven
  on timeout: ONE agent get; classify; then re-arm (max 6 arms = 1 hour)
```

Four rules, each traceable to the reported incident:

1. **Wait on the actor, never on a consequence.** The condition is exactly "this actor's lifecycle settled". A new SHA, a commit count, a clean worktree, or a progress string are **never** wait conditions — they are things you check *after* waking, with a direct command.
2. **No compound predicates.** One actor, one wait. The failure was a three-part conjunction whose third clause was already false-forever when it was written.
3. **Never infer a future event from a rendered screen.** "11 of 14" in a repainting TUI is stale the instant it is read, and it is nobody's commitment.
4. **Ten-minute arms, bounded total.** On *every* timeout the orchestrator reads `agent get` once; if the actor is not `working` it asks the actor directly ("status?") rather than re-arming. After six arms it reports `needs_attention` naming the actor and its last state. A 55-minute silent wait cannot recur, because no wait exceeds ten minutes without a direct state check.

Two actors settling simultaneously is not an event-loss hazard: `agent.wait` observes **pollable state**, not a consumable queue, so after handling reviewer A the orchestrator re-reads `agent get <slug>-rev-b` and its settled state is still true. The cost is latency, which is why upstream gap 5 is an efficiency request rather than a correctness bug.

### 3.7 Question and dispute routing (complaint 6)

| The actor asks… | The orchestrator does |
| --- | --- |
| permission to run a command or tool | Answers "proceed" in one line and records a posture defect in `docs/backlog.md` — under the agreed yolo posture this question should not exist |
| choice between technical implementations | Decides from the standing principles (§2.5), immediately, in one line |
| "is X in scope?" | *"The spec is authoritative. Implement what it says; where it is silent, take the production-ready option."* — answered without reading the spec |
| a fork it cannot resolve technically | Routes to the idle reviewer on the **other vendor**: "write a recommendation to `<path>`, one paragraph, name the trade" — then hands that path to the asker |
| a reviewer finding the executor rebuts | Never adjudicates. Sends the other reviewer both paths: *"A raised `<path-a>`; the executor answered `<path-r>`; you wrote neither; say which is correct in one line."* |
| product meaning, irreversible action, credentials, subscription change, true deadlock | The user — methodology §9, unchanged |

Escalation to the human happens only when the second reviewer also declines to resolve, or the question is one of the six §9 categories. This is exactly `my-opinion.md`'s "при неясности используем независимую критику другой модели".

### 3.8 The three contract clauses for `AGENTS.md` / `CLAUDE.md`

Authored by `mo-setup`, written identically into both files (`cmp -s AGENTS.md CLAUDE.md` already gates this).

**(a) Version control**

> ## Version control
>
> Never develop directly on `main`, `master`, `develop`, or `default`. Create each task branch from an up-to-date `develop` using `feature/<short-slug>` and use it for the whole task. If the project has no `develop` branch, branch from the default branch and say so in the first commit message.
> Run the relevant checks before committing. Commit every coherent, independently verifiable increment instead of accumulating the whole task in one commit. Use `<type>: <what changed and why>` with `feat`, `fix`, `refactor`, `test`, `docs`, or `chore`. Reference an issue or specification when one exists, but neither is required. End every agent-authored commit with a new line and the executor harness model: `Assisted-by: {model}`
> The final verified result is one full Git SHA. Any subsequent commit invalidates its review and verification gates.

Two reconciliations this forces, both of which must land in the same change or the contract self-contradicts:

- **methodology §4.7** currently reads "produce one clean candidate commit". It becomes: *"produce a clean candidate — the branch tip, with an empty `git status --porcelain` — committing each coherent increment along the way."* The candidate was always a SHA with a clean worktree (§5), never a squash requirement; the old wording merely read like one.
- **`{model}` is resolved to the full route string** as stored in `~/.meta-o/models.json`, for example `Assisted-by: claude/opus/high`. The orchestrator supplies that string in the goal text, because an executor generally knows its model name but not the effort level it was launched with. A bare `opus` is ambiguous across efforts and would make the trailer useless for exactly the forensic question it exists to answer.

**(b) Backlog discipline** (complaint 7)

> `docs/backlog.md` records **only work that is not done**. It has one section. When an entry is completed, delete it — the commit is the record. Never add a "Closed", "Done" or "Completed" section, and never move an entry into one.

**(c) Documentation discipline** (complaints 8, 10)

> Create no file the task did not ask for. In particular: no `CHANGELOG.md` — Git history is the changelog — and no migration note, summary, report or "what I did" document. `docs/architecture/` records a boundary or a decision that constrains future changes; it does not record that you performed a change. Consolidating four READMEs into one is a commit message, not a new document. Update the knowledge this change made new or false, and add nothing else.

### 3.9 The two canonical texts (complaint 12)

**Orchestrator start prompt**, printed by `mo-herdr` when invoked with no arguments, so the user pastes one line instead of being interviewed:

```
Run the Meta-O Herdr workflow for <SPEC_PATH>. You are the orchestrator: do not
read the spec or any code, decide process and technical forks yourself from the
standing principles, and come back to me only for product meaning, credentials,
an irreversible action, a subscription change, or a genuine deadlock. Report
STATUS / CANDIDATE / SUMMARY when the gates are done.
```

**Executor goal**, sent by the orchestrator as an atomic `agent prompt` from a settled state, then echoed to the user in one line so they can see and reuse it:

```
/goal Read the complete task at <SPEC_PATH>, the recorded business framing at
<BUSINESS_PATH>, and the project instructions. Implement the full scope and
continue until there is a clean candidate commit that passes the project-owned QC
and applicable deterministic smoke, or report a real blocker. Keep the spec and
the framing read-only. Sign commits `Assisted-by: <route>`. When you stop, print
`MO-EXEC <slug> <sha|none> READY|QUESTION|BLOCKED` and `NOTE: <path|none>`.
```

The orchestrator sends it; it does not instruct the user to type it. Telling the human which prompt to paste would reinstate the human as a message bus, which is the thing `my-opinion.md` is most explicit about removing.

### 3.10 Model catalogue

The reported failure was not only that the Claude catalogue was unreachable — it was that the orchestrator *narrated its uncertainty at the user* mid-preflight.

- **Capability, at setup time.** `mo-setup` checks whether `@anthropic-ai/claude-agent-sdk` resolves from any of the three locations `mo-models.mjs` already probes (module resolution, project tree, `npm root -g`) and, if not, offers `npm i -g @anthropic-ai/claude-agent-sdk` as remediation, recording a `docs/backlog.md` entry if the user declines. The shipped tree stays dependency-free; the catalogue becomes routinely available.
- **Behaviour, at run time.** Methodology §2.5 becomes: print the saved roles in one line, name any unavailable catalogue in the *same* line, and **continue**. No stop, no question, no editorial. `--set` validation is unchanged — a route with a complete catalogue still refuses an unknown id, and `--force` remains the escape hatch.

### 3.11 Recovery

`herdr agent list` returns, per actor, `name`, `pane_id`, `tab_id`, `agent_status`, `interactive_ready`, `state_change_seq` **and** `agent_session.value` — the provider's own session id (verified live: a Claude UUID, a Codex UUID, an OpenCode `ses_…`). A restarted orchestrator recovers the whole actor set from one JSON call plus Git, with no registry and no state file. An expected actor that is absent is restarted; one that is present is adopted, never duplicated. A gate whose footer it cannot read on the current SHA is `unknown` and repeated.

---

## 4. Trade-offs considered

**Interactive sessions vs. the inline JSON envelope.** This is the real decision. Inline gives a mechanically verifiable turn boundary: a truncated `claude -p --output-format json` capture fails to parse, and `codex exec --json` ends with an explicit `turn.completed`. Interactive sessions give none of that. I choose interactive anyway, for three reasons the business framing states outright: cache economy across rounds (a warm reviewer's round-two prompt is "re-review `<sha>`", not a cold re-read of the project), visibility with the ability for the user to type into the session himself, and the fact that inline processes do not appear in Herdr at all. **What replaces the envelope is not one check but five** (§3.4): a Herdr-authored `state_change_seq` transition no model can fake; a SHA echo that catches a stale or confused turn; a file-existence check on a path the orchestrator alone chose; a PASS/FINDINGS consistency check; and the fact that the *executor* — the actor with the context to notice — is the one reading the findings file, so a truncated file surfaces as a real complaint.

**Is the footer the banned sentinel?** `herdr-mechanics.md §3` bans "a closing sentinel requested from the reviewer, under any name", and I will not pretend the footer escapes on a technicality. It is a relaxation, and it requires amending `docs/architecture/full-turn-retrieval.md` rather than quietly ignoring it. What changes is the sentinel's *job*. In the banned design the marker was asked to prove "you have read this entire verdict" — a claim about content the orchestrator had to ingest, where a truncated verdict reads as a whole one and becomes a false PASS. Here the orchestrator ingests no content: the review lives in a file it never opens, and the footer is pure control plane. A lost line in the file costs a round on the same frozen SHA; it cannot manufacture a PASS, because PASS requires the reviewer to affirmatively write the word. And because the footer carries no evidence, it can be re-requested freely — a repair path the banned design did not have.

**Path handoff vs. verbatim paste.** Paste has one genuine advantage: the orchestrator can see that something was transferred. I surrender that because it is the same property that lets the orchestrator grade findings, and because path handoff deletes the transcription step entirely — you cannot summarise what you never opened.

**Contract clauses vs. a longer executor prompt.** Run-specific constraints travel in the goal; durable behavioural rules must not, because the goal is re-sent per run and the executor compacts. `my-opinion.md` is explicit that a rule read once and lost to compaction is *worse* than no rule, because the model still believes it is compliant. `AGENTS.md` is re-read by the provider CLI itself — exactly the durability property required — which is why complaints 7, 8, 10 and 13 all land in one file.

**Setup-time SDK install vs. bundling.** Bundling guarantees the catalogue at the cost of breaking "everything shipped is Markdown plus two dependency-free helpers", inflating all seven skill installs, and importing an Agent SDK into a project whose framing explicitly rejects building the flow on Agent SDKs. A one-command setup step buys the same capability and keeps the contract intact.

**Separate scratch subdirectories vs. one shared directory.** A shared directory is simpler and would have been my instinct. It is wrong here: two reviewers with yolo filesystem access and predictable sibling paths means B can read A's findings, and reviewer independence is the single assumption the entire two-vendor gate rests on. The cost is one `mktemp -d` per reviewer.

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Weaker completeness proof than the JSON envelope | Five-part acceptance check (§3.4); failure is `unknown` and repeats. Stated plainly in the amended `docs/architecture/full-turn-retrieval.md`, not presented as equivalent. |
| Reviewer omits or malforms the footer | Detected, never silent. One cheap re-request in the warm session; two failures → `unknown` → repeat the role. |
| Reviewer writes a truncated findings file | The executor must answer every finding and surfaces the gap; the next round re-reviews the same SHA. Costs a round, not a gate. |
| Reviewer B reads reviewer A's findings | Per-reviewer unguessable subdirectory, `chmod 700`, each told only its own path (§3.4). |
| `state_change_seq` does not mean one-per-turn | Fixture H13 gates it; until then it corroborates rather than replaces the settled-state check. |
| Claimed cache savings are unmeasured | Fixture H16 measures round-two cost in a warm session against a cold restart. The design does not depend on a specific ratio, only on the direction, but the claim is not asserted as measured until H16 closes. |
| Orchestrator drifts back into reading code | The read budget is one short table re-read on restart, and the workflow gives it no reason to: findings arrive as paths it has no use for. |
| Contract self-contradiction (increments vs. one commit) | Resolved explicitly in §3.8; both edits land in the same change. |
| OpenCode long-turn retrieval | Unchanged: OpenCode remains unsupported for the review gate. This design neither rescues it nor claims to. |
| Slug overflows the 32-char agent-name limit | Slug rule `[a-z][a-z0-9-]{0,19}`, so `<slug>-rev-a` ≤ 26 chars. |
| Orchestrator closes a user's tab or pane | Herdr's own rule adopted verbatim: never close what you did not create. |
| Scratch files leak into the repository | Scratch tree lives outside the repo, is never staged, and is removed at run end. No index, manifest or digest — no external consumer exists. |
| Version-control clause changes meta-o's own workflow | Real: this repo is on `develop` with `origin/HEAD → master`, so adopting the clause moves its own feature work to `feature/<slug>`. Named so it is a decision, not a surprise. |

### Genuine Herdr capability gaps that should become upstream issues

These are worked around, not depended on — the workflow functions today with none of them fixed.

1. **`agent read --lines` caps at 1000 rendered rows with no truncation signal.** Measured: `--lines 1600` and `--lines 3200` both returned 996 unwrapped rows while the pane reported `max_offset_from_bottom: 1889`. *Request:* return `truncated: true` and `available_rows`, and add a line range (`--from-line` / `--to-line`).
2. **Alternate-screen rows never enter host scrollback, and there is no scroll method.** `pane.*` exposes `pane.scroll_changed` and a read-only `PaneScrollInfo`; nothing moves the viewport, and `send-keys pageup` is refused. A full-screen TUI agent's completed long answer is therefore unrecoverable by any programmatic means. *Request:* opt-in per-pane transcript capture for alternate-screen agents, or a viewport-move method.
3. **No per-agent context or cost telemetry.** The agent view exposes `status`, `seen`, `state_change_seq` and identity, but nothing about context size, tokens consumed, or time since last turn. `my-opinion.md` lists context/cache/cost visibility as a meta-harness requirement, and without it the orchestrator cannot make the "warm session vs. new session" decision that the same document specifies. *Request:* surface whatever the provider already reports as agent metadata.
4. **`state_change_seq` has no documented semantics.** It is a first-class agent-view field, which strongly implies it is meant to be consumed, but nothing states whether it increments once per turn or once per internal state transition. *Request:* document it — this is the cheapest of the five to fix and the one that would most improve third-party orchestration.
5. **No multi-actor wait, although the protocol nearly has one.** `agent.wait` takes a single `target`. `events.wait` takes a single `EventMatch`, and the `EventMatch` union covers workspace/tab/pane lifecycle plus `pane_output_changed` and `pane_exited` — but has **no agent-status variant**. `events.subscribe` *does* accept an array of subscriptions including `pane.agent_status_changed`, but it is a persistent push stream a CLI-invoking agent cannot consume. So an orchestrator driving two reviewers must wait serially. *Request:* add an agent-status variant to `EventMatch` so `events.wait` can serve it, and/or expose `herdr agent wait --target a --target b --any`.

A sixth, worth reporting but probably not filing: `idle` versus `done` depends on whether the tab was *seen in the focused UI* (`seen` is an exposed field), which leaks a UI concept into an automation-facing state machine. It is documented and workable — automation accepts both — but it surprises every first-time integrator.

---

## 6. Decisions, assumptions and fixtures

**Decisions taken here rather than deferred:**

1. **`Assisted-by:` carries the full route string** (`claude/opus/high`), supplied by the orchestrator in the goal because the executor typically does not know its own effort setting.
2. **The inline surface is demoted, not deleted.** It remains the bounded fallback for a route that cannot produce a readable footer at all, and it stays the documented mechanism in `full-turn-retrieval.md` with its status changed from default to fallback. Deleting measured, working machinery would be waste; leaving it as the default contradicts the request.
3. **Reviewer sessions start when the first candidate is frozen** and live until the run ends. Starting them earlier would warm context but risks a review of a moving target.
4. **Scratch artefacts are bounded**: one findings file per reviewer per round, plus optional rebuttal/question/recommendation files, all under a per-run tree removed at the end. No index, no manifest, no receipt.

**Assumptions recorded rather than asked about:**

1. **SDK bundling is not adopted; setup-time install is.** The user asked for brain-council-style bundling; `AGENTS.md` says the shipped tree is Markdown plus two dependency-free helpers, and `my-opinion.md` rejects building the flow on Agent SDKs. The conservative reading is that the user wants *the capability*, not *the mechanism*. If the mechanism is what is wanted, that is an amendment to the distribution contract plus a new `docs/architecture/` entry — a decision above this proposal's authority.
2. **The E2E actor gets its own tab.** The user specified topology only for executor and reviewers; E2E drives Docker and browsers and would obscure the reviewer panes. This is the single topology element not taken directly from the request.
3. **Reviewer scratch files live outside the repository** and are never committed, consistent with the existing capture-file rule.

**Fixtures that gate the claims** (added to `docs/phase-0-fixtures.md`):

- **H13** — does `state_change_seq` increment exactly once per turn, on each provider? Gates §3.3.
- **H14** — topology under an existing layout: an already-split orchestrator tab, and a pane too narrow for a right split.
- **H15** — footer-plus-file handoff per provider, including the negative case: a reviewer that omits the footer must yield `unknown`, never PASS.
- **H16** — cache economy: cost of a round-two prompt into a warm reviewer session versus a cold restart with the same instruction, per provider. Gates the claim in §4.
- **H17** — independence: reviewer B, given only its own path, cannot locate reviewer A's findings directory.

**File-by-file decomposition**, ten independently reviewable items: `shared/references/methodology.md` (§1 read budget and no-menus, §2.2 existence-only check, §2.5 catalogue line, §4 goal text and candidate-vs-increments wording, §5 findings by path, §9 routing table, §11 backlog, new §12 Waiting) · `src/skills/mo-herdr/SKILL.md` (topology, transport ban, start prompt, footers) · `src/skills/mo-herdr/references/herdr-mechanics.md` (§1 rewritten around file-first retrieval, §2 refreshed from the protocol-19 schema, §3 amended) · `src/skills/mo-review/SKILL.md` (findings-file-as-primary-artefact, footer, dispute routing) · `src/skills/mo-setup/SKILL.md` (three contract clauses, SDK remediation) · `src/skills/mo-omnigent/SKILL.md` (parity on the backend-neutral parts: read budget, no menus, waiting, contract clauses) · `docs/architecture/full-turn-retrieval.md` (amendment) · new `docs/architecture/orchestrator-read-budget.md` · `docs/phase-0-fixtures.md` (H13–H17) · this repository's own `AGENTS.md` and `CLAUDE.md`, which must change together or `make mo-qc` fails. `skills/` is rebuilt with `make skills` and never hand-edited.