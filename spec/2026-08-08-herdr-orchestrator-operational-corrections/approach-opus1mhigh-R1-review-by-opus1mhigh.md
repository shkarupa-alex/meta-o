## Facts & Constraints (White Hat)

Before judging either proposal I checked the claims that both of them rest on, because this task lives or dies on measured Herdr behaviour rather than on design taste. Four constraints in the repository bound the solution space, and two of them are load-bearing in ways the proposals treat very differently.

First, `docs/architecture/full-turn-retrieval.md` and `src/skills/mo-herdr/references/herdr-mechanics.md §4` record measured fixtures, not opinions: on the **TUI surface** Claude Code is *unusable above roughly 250 rows* (800-row read → 716 distinct lines out of 900, 270 duplicated, upper boundary already pushed out), OpenCode is unusable past one viewport, `agent read --lines` caps at 1000 rendered rows with no truncation signal, and there is no scroll method. The **inline** surface (`claude -p --output-format json`, `codex exec --json`) is the only one that returned an 800-row answer exactly, on all three routes. That is precisely the surface the user is rejecting for visibility and cache reasons — so any honest proposal has to say what replaces the mechanically-detectable envelope.

Second, I verified the Herdr interface directly rather than trusting either author. `herdr tab rename`, `herdr pane rename`, `herdr agent rename` all exist; `tab create` accepts `--cwd`, `--label`, `--focus/--no-focus`; `pane split` accepts `--current`, `--direction right`, `--cwd`, `--no-focus`. And `herdr agent list` really does return `state_change_seq`, `revision`, `interactive_ready` and `agent_session.value` (I see a live Claude UUID, a Codex UUID and an OpenCode `ses_…` in this very session). So Proposal 2's factual claims check out; Proposal 1's hedge that tab rename "needs verification and may need a narrow upstream issue" is unnecessary but harmless. `agent wait <TARGET>` is single-target — P2's "no multi-actor wait" gap is real.

Third, and this one is decisive against Proposal 1 §8: I read the brain-council build the user pointed at. `src/build.ts` sets `bundle: true, platform: "node", format: "esm"` **but keeps the SDKs in `EXTERNAL_SDKS` and vendors them into `dist/<skill>/node_modules`**, with a comment saying exactly why — "claude + codex SDKs resolve platform-native sub-packages at runtime … (e.g. `@openai/codex-sdk` locates its platform-specific `codex` binary)". Proposal 1 describes the opposite of what brain-council does: "bundled Claude SDK, external only for Node built-ins, one dependency-free `.mjs`". Inlining `@anthropic-ai/claude-agent-sdk` into a single file will very likely break its runtime resolution of its own vendored `cli.js`, and the proposed `mo-qc` byte-identical rebuild gate makes that fragility a hard failure across esbuild versions and platforms. The user asked for "как в brain-council" — the mechanism there is **vendoring**, which does break `AGENTS.md`'s "everything shipped is Markdown plus two dependency-free helpers" and therefore needs a recorded `docs/architecture/distribution.md` decision. Neither proposal proposes that: P1 misdescribes the mechanism, P2 declines it.

Fourth, repository facts both proposals reason about: this repo is on `develop` with `origin/HEAD → origin/master` (P2's risk-table note is accurate), and `mo-review` currently says the orchestrator "takes the technical decision" in disputes (both proposals correctly delete it) and says **"`CANDIDATE` and `WORKTREE` are deliberately *not* reviewer output fields"** — which Proposal 2's SHA-echoing footer contradicts without naming it.

## Risks & Failure Modes (Black Hat)

**Proposal 1 — the retrieval story does not survive its own repository's fixtures.** P1 bans `claude -p`, `codex exec` and any inline capture for reviewers, then instructs the orchestrator to read a **≤700-rendered-line verdict** out of an interactive TUI via `agent read --lines 1000`, requiring proven upper boundary, lower boundary and continuity. On the Claude route that is measured to fail at less than half that length. The failure is not silent — it is `unknown` — but the consequence is a review gate that can never be satisfied on one of the two mandated vendors, i.e. an infinite "produce a new compact verdict" loop with no retry bound and no fallback. P1 justifies 700 lines with "пользователь считает Herdr window в 1000 строк практически достаточным", which conflates the *read cap* with the *repaint collage*; the user's "1000 строк достаточно" was about how much verdict text is enough, not about whether a TUI can be reassembled. And P1's upstream issue (`agent read-turn`) is not a nice-to-have here: the design **depends** on an unshipped Herdr feature to work at all, which the task explicitly did not authorise (it asked to *name* gaps, not to build on them).

Second P1 failure mode: it keeps "copy the whole verdict verbatim into the executor's prompt", so the full reviewer output still transits the orchestrator's context each round. That is exactly the material that produced complaint 3, and it directly contradicts the user's stated purpose ("весь смысл в экономии кеша"). P1 then closes complaint 3 by prohibition alone — a rule that must survive compaction, in the one context most likely to be compacted.

Third: P1 declares `origin/develop` mandatory with **no fallback** ("не изобретать fallback на main; сообщать конкретный policy blocker"). A repo without `develop` — which is the majority case, and is what `origin/HEAD → master` here already hints at — produces a `needs_attention` that is not on the user's allowed interrupt list (product meaning, irreversible action, credentials, subscription, unresolvable dispute, watchdog). That is a new nanny-prompt introduced by the very proposal meant to remove them.

Fourth: P1 bans the orchestrator from opening the business framing but leaves methodology §2.1 — "who writes it: the orchestrator in a full workflow … the executor never writes it" — unaddressed. §10 says `docs/business.md` gets the new clarifications, without saying who may append to a file nobody is allowed to open. That is an unresolved contradiction inside the canonical document P1 is amending.

**Proposal 2 — three concrete holes.** (a) The findings file lives "in a per-run scratch directory **outside the repository**", and *both* the reviewer (write) and the executor (read) must touch it. Codex under its default `workspace-write` sandbox restricts writes outside the workspace; Claude Code in an interactive pane routinely prompts for writes/reads outside the project directory. The realistic outcome is an actor sitting in `blocked` on a permission dialog, which is the exact stall class the design is trying to eliminate — and there is **no fixture** in H13–H15 covering sandbox/permission posture for the scratch path. This is the single most likely way P2 fails on first contact.

(b) P2's defence of the footer against the sentinel ban is honest but its *recovery* argument is weaker than stated: "the worst case is that the next round on the same frozen SHA finds it again". A truncated findings file leads to a new SHA (the executor fixed what it saw and committed), and P2's own cache-economy argument says round two is "re-review `<sha>`" in a warm session — a delta review, not a fresh full pass. The dropped finding is recoverable only because the *reviewer's own context* still holds it, which is a property of session warmth, not of the protocol. That should be stated as the actual mechanism, and the reviewer prompt should require re-asserting unaddressed findings.

(c) Internal inconsistency: §3.3 makes "`state_change_seq` increased" acceptance condition #1, while §5 says that until fixture H13 closes it is "corroborating evidence only". Also, the field counts *state changes*, not turns (a turn is at least `working→done`, and detection flaps can increment it), so it is a necessary, never sufficient, condition — P2 uses it correctly but should say so explicitly, or a future reader will treat an increment as a turn.

(d) P2 deviates from an explicit user instruction (bundle the SDKs like brain-council) and substitutes `npm i -g @anthropic-ai/claude-agent-sdk` at setup time, with a backlog entry if declined. It flags this honestly, but the rationale is partly wrong: brain-council's mechanism is *vendoring into the shipped skill*, not an Agent-SDK-driven flow, so "my-opinion.md rejects Agent SDKs" does not apply to a catalogue query, and a global npm install is a machine-state dependency the user never asked for and which silently rots. The conservative reading of "make the most conservative assumption" here should have been "do the mechanism the user named, and record the `distribution.md` amendment it requires" — or at minimum present vendoring as the option.

**Both:** neither validates that the last 40 rows (P2) or the boundaries (P1) survive Claude Code's large input/status area. Neither addresses `agent wait`'s already-settled race explicitly beyond what already exists ("check state before sending"); P2's `state_change_seq` handles it if H13 closes, P1 does not handle it at all.

## Strengths & Benefits (Yellow Hat)

Both proposals correctly identify that nine of fourteen complaints are one root cause — the orchestrator has both permission and material to act as an engineer — and both delete the "orchestrator takes the technical decision" step from `mo-review` and move feasibility to the executor's first turn. Both correctly diagnose the missing-Enter complaint as a wrong-primitive problem (`agent prompt` is atomic; `send-text`/`send-keys` are not) and fix it by banning the wrong command rather than by adding a reminder. Both fix the waiting incident the way the user's own post-mortem prescribes: wait on the actor's lifecycle, never on a derived future SHA.

Proposal 1's particular strengths are the crisp two-column may/must-not enumeration, an explicitly bounded dispute protocol with a named classification step (product / technically checkable / taste-without-impact), and a well-formed upstream issue with real acceptance criteria.

Proposal 2 is stronger where it counts. Making the orchestrator's thinness *structural* — findings arrive as a path it never opens, so complaint 3 becomes physically impossible rather than forbidden — is the better engineering answer, and it is the only one of the two that actually delivers the cache economy the user named as "весь смысл". It is grounded in facts I could verify live rather than assumed. It confronts the sentinel ban head-on instead of pretending the footer is a different animal, and it explains what changed about the sentinel's *job* (control-plane signal versus content-completeness claim) — that is exactly the kind of named, honest overturn the architecture docs demand. Its four upstream gaps are gaps it *works around*, so the design ships today; that is the difference between a proposal and a wish. Putting the executor's rules into `AGENTS.md`/`CLAUDE.md` (because the executor runs with no skill and that file is the only thing the provider CLI reliably re-reads) is the correct placement and P2 argues it from the compaction-durability angle. And the three authored clauses are usable text, not a description of text.

## Alternatives & Creative Ideas (Green Hat)

There is a middle path neither proposal found, and the data for it is sitting in the `agent list` output I just read: Herdr exposes the **provider's own session id** (`agent_session.value`). That makes it possible to keep the interactive, visible, cache-warm session as the reviewer's thinking surface *and* obtain a provider-authored envelope for the verdict, by emitting the verdict through `claude -p --resume <session-id> --output-format json` (or the Codex equivalent) run via `herdr pane run` in a visible adjacent pane. Cost and caveat: a resumed session forks state, and concurrent access to one session id is unproven — so this needs a fixture before anyone relies on it. But it deserves to be on the table, because it is the only construction that keeps the measured completeness detector without giving up visibility or warmth. P2's "demote inline to a bounded fallback" is a weaker version of the same instinct.

Second alternative, aimed straight at P2's scratch-file hazard: put the findings file **inside the repository under a gitignored path** (`.mo/reviews/<sha>-<role>.md`). Both providers' default sandboxes allow writes there, no permission dialog appears, and "never committed" is enforced by `.gitignore` plus the existing rule that a dirty worktree invalidates a candidate. This does need a decision recorded against the existing "capture files live outside the repository" rule — but that rule was written for provider stdout captures, and the trade (avoiding a blocked actor on every review round) is worth the amendment.

Third: on the SDK question, the option neither proposal states is the one brain-council actually implements — vendor `@anthropic-ai/claude-agent-sdk` into the built skill directory at `make skills` time, keep the authored helper importing it normally, and record the `distribution.md` amendment ("the shipped tree is Markdown, two dependency-free helpers, and one vendored catalogue SDK, because model discovery must not depend on the operator's global npm root"). That satisfies the user's instruction, keeps the helper working after a plain directory-copy install, and does not require esbuild to inline a package that resolves sibling binaries at runtime.

Fourth, small: `herdr tab create --label` exists, so the review tab can be named at creation rather than created-then-renamed — one fewer call and one fewer failure mode.

## Completeness & Process (Blue Hat)

On coverage of the fourteen complaints: both proposals address all of them at least nominally. P2 additionally covers the cache/cost-observability requirement from `my-opinion.md` item 8 by naming the missing per-agent telemetry as upstream gap 3 — P1 never mentions it, despite the user citing cache economy as the whole point.

Gaps worth naming in P2 before implementation: the `mo-review` clause "`CANDIDATE` and `WORKTREE` are deliberately not reviewer output fields" contradicts the footer's SHA echo and is not in the change list, even though the SHA echo is the check that catches a stale-turn read — amend the clause explicitly rather than let the built skill contain both. The `Assisted-by: {model}` open question is real and should be decided (route string, not bare model — otherwise `opus` at two effort levels is one trailer). Fixture H15 should be split so the sandbox/permission posture of the scratch path is its own row. And "does this replace or coexist with the inline surface" is left as an open question at the exact point where the answer determines whether the Claude route has a working review gate at all — that must be decided in the proposal, not deferred; the conservative answer is P2's own demotion (inline as a bounded fallback when no readable footer appears twice), stated as a decision.

Gaps in P1 that block decomposition: the 700-line TUI retrieval must be reconciled with §H fixtures before any of its eleven work items can be scheduled; §8's build design must be rewritten to vendoring plus a `distribution.md` decision; the `origin/develop` blocker needs a fallback; and §2.1's business-framing ownership needs an explicit carve-out. P1's own decomposition claim ("ready for seven independent increments") is optimistic while its central retrieval mechanism is unproven.

Process-wise, both proposals respect the "no new document" instruction reasonably; P2 adds exactly one new architecture file (`orchestrator-read-budget.md`) plus an amendment to an existing one, which is defensible under the contract's "named boundary" rule — although the read budget could equally live as a section in `skills-first.md`, and I would ask the implementer to prefer that if the table is short.

Net: Proposal 2 is the one I would build from, with the scratch-path decision, the SDK decision and the `mo-review` clause conflict fixed first. Proposal 1 has the right diagnosis and several better-written sub-sections (the dispute classification, the upstream issue text), and those are worth grafting in — but its core retrieval and packaging mechanics contradict measured facts in this repository and in the reference project the user named.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 7,
      "would_adopt": true,
      "summary": "The stronger of the two and implementable today: it makes orchestrator thinness structural (findings arrive as a path it never opens), it is grounded in Herdr facts I verified live (tab/pane rename exist, tab create takes --cwd/--label, agent list really returns state_change_seq, revision, interactive_ready and the provider session id), it works around the four upstream gaps instead of depending on them, it confronts the sentinel ban openly rather than sneaking past it, and it puts the executor's rules where the skill-less executor actually reads them. Three things must be fixed before implementation: the findings file 'outside the repository' is the most likely first-contact failure because Codex workspace-write and Claude Code's out-of-project prompts will park an actor in blocked with no fixture covering it; the SHA-echoing footer contradicts mo-review's explicit 'CANDIDATE and WORKTREE are deliberately not reviewer output fields' clause, which is not in the change list; and declining the user's explicit brain-council bundling instruction in favour of a global npm install rests on a rationale that misreads what brain-council does (it vendors, it does not build the flow on Agent SDKs).",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "findings-file transport / sandbox posture",
          "description": "The reviewer must write, and the executor must read, a findings file in a scratch directory outside the repository. Codex under default workspace-write restricts writes outside the workspace, and Claude Code in an interactive pane commonly prompts for reads/writes outside the project directory. The result is an actor sitting in 'blocked' on a permission dialog every review round, and fixtures H13-H15 contain no sandbox/permission row for the scratch path.",
          "required_change": "Decide and verify the path class before implementation: either a gitignored in-repo path such as .mo/reviews/<sha>-<role>.md (with the recorded amendment to the 'capture files live outside the repository' rule), or a directory proven writable/readable under both providers' default sandboxes, and add it as its own phase-0 fixture."
        },
        {
          "id": "",
          "severity": "major",
          "area": "mo-review contract conflict",
          "description": "The footer requires the reviewer to echo the frozen 40-character SHA, while mo-review currently states that CANDIDATE and WORKTREE are deliberately not reviewer output fields because repeating that metadata adds no evidence. The proposal names the sentinel-ban conflict but not this one, so the built skill would carry both rules.",
          "required_change": "Amend that mo-review clause explicitly in the change list, stating why the SHA echo is evidence here (it is the only check that catches a stale or confused turn) rather than metadata repetition."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model catalogue mechanism",
          "description": "Declining the user's explicit instruction ('do it like brain-council') in favour of a setup-time global npm install rests on two shaky premises: brain-council's mechanism is vendoring into the shipped skill (not an Agent-SDK-driven flow, so the my-opinion.md objection does not apply to a catalogue query), and a global npm root is exactly the machine state whose absence caused the reported failure. A backlog entry on decline leaves the original complaint open.",
          "required_change": "Present vendoring the SDK into the built skill directory as the primary option with the docs/architecture/distribution.md amendment it requires, and keep the global install only as the fallback when vendoring is rejected."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "turn-boundary evidence",
          "description": "§3.3 makes 'state_change_seq increased' acceptance condition #1 while §5 says it is corroborating only until fixture H13 closes. The field counts state changes (a turn is at least working->done, and detection flaps can increment it), so it is a necessary but never sufficient signal.",
          "required_change": "State it as a necessary-not-sufficient precondition in §3.3, and make the settled-state check the primary boundary until H13 closes."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "truncated findings recovery",
          "description": "'The next round on the same frozen SHA finds it again' is not what happens: the executor commits a new SHA, and the cache-economy design makes round two a warm delta review. Recovery actually depends on the reviewer's own session context still holding the finding it wrote.",
          "required_change": "State the real mechanism and require the round-two reviewer prompt to re-assert any prior finding it does not see addressed, so recovery is protocol rather than luck."
        }
      ],
      "assumptions": [
        "herdr tab rename, pane rename, tab create --cwd/--label and pane split --current exist as verified in the installed CLI here, and state_change_seq/revision/agent_session appear in agent list as verified live.",
        "'Copy findings verbatim' in the user's report expresses the prohibition on the orchestrator evaluating findings, not a requirement that the text pass through its context; path handoff therefore satisfies the intent.",
        "A new docs/architecture/orchestrator-read-budget.md counts as a named boundary under the contract rather than as invented bookkeeping; if the table stays short, a section in skills-first.md is preferable."
      ],
      "round": 1,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: true
