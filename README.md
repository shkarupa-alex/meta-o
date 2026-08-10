# meta-o

Seven agent skills that take one feature from a spec to a verified candidate
commit, using tools you already have.

It is a methodology, written down and installable — not a framework. There is no
orchestration or provider-proxy CLI, no daemon, no state store and no adapter
layer. Git, the tracked task/spec, the recorded business framing behind it, your
project instructions and your backend's own sessions are the only durable state,
which is why a restart costs a re-read rather than a recovery protocol.

The framing is the part people skip: your request and every clarification, kept
verbatim in `docs/business.md`, because a spec is a lossy compression of the
conversation that produced it and nobody can find what it dropped without the
original. A run does not start without one. Secrets are the one exception —
credentials and personal data are stored as `[REDACTED: what it was]`, since that
file gets committed and pushed.

The current operational correction is
[`spec/2026-08-08-herdr-orchestrator-operational-corrections/`](spec/2026-08-08-herdr-orchestrator-operational-corrections/spec-review.md).

## What a run looks like

```text
preflight — repo root, business framing, spec, Makefile, backend help,
            PATH wrappers, model set
  → optional reuse research, only if you ask for it
  → executor under a native /goal, until one clean candidate commit
  → freeze that SHA
  → reviewer A + reviewer B, independent, on that SHA
  → the applicable E2E, on that SHA
  → any fix → new SHA → every applicable gate again
  → STATUS / CANDIDATE / SUMMARY
```

One verified result is one full Git SHA. Any new SHA invalidates every gate —
no impact analysis to argue with, and "the reviews passed" can never quietly mean
"the reviews passed on something else".

## Install

**Proven here** — a local checkout, run from the project you want the skills in:

```bash
apm install /path/to/meta-o                     # all seven
apm install /path/to/meta-o --skill mo-review   # one, complete on its own
```

**Not proven yet** — the remote forms. They should work identically, since apm
clones and then resolves the same `skills/` directory, but nobody has run them
against this repository, so they are written here as what to try rather than as
what was verified. Fixtures I3–I5 in
[`docs/phase-0-fixtures.md`](docs/phase-0-fixtures.md) are exactly these rows:

```bash
npx skills add shkarupa-alex/meta-o
npx skills add shkarupa-alex/meta-o --skill mo-review
apm install shkarupa-alex/meta-o
```

apm deploys to the harness it detects in the consuming project (`.claude/`,
`CLAUDE.md`, `.codex/`, `.opencode/`, …); in a directory with no marker at all it
asks for `--target claude` rather than guessing. The installed skills need Bash
3.2 or newer specifically at `/bin/bash`; the posture diagnostic also requires
`/usr/bin/printf`, `/usr/bin/false` and `/bin/sleep` at those paths, plus the
standard `mktemp` and `rm` found by `command -p`. A Bash matrix additionally
requires `/usr/bin/env` with `-0`; a requested Zsh matrix needs Zsh.
NixOS/Alpine-style layouts without these absolute paths are outside this helper's
compatibility contract. Building and installing this repository also needs Node
≥ 22 and Git, and its full `make mo-qc` needs Zsh. Nothing is compiled and nothing
is written into the projects the skills work on.

The installed unit is a directory: `SKILL.md` plus the `references/` and
`scripts/` that skill owns. `tests/install.test.mjs` runs a real local `apm
install` and asserts the deployed file list, because a build that produces the
right tree can still be installed from the wrong one — which is exactly what
happened before this layout.

## The skills

| Skill         | Use it when                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `mo-herdr`    | run a whole feature through Herdr-managed sessions                                                  |
| `mo-omnigent` | the same lifecycle through native Omnigent sessions                                                 |
| `mo-review`   | you just made a fix and want two independent reviews — or a full workflow needs the review protocol |
| `mo-reuse`    | you want to know what already exists before it gets built                                           |
| `mo-setup`    | a project has no contract yet                                                                       |
| `mo-e2e`      | the E2E genuinely needs an agent — a benchmark or a browser suite                                   |
| `mo-watchdog` | a long unattended run should tell you when it needs you                                             |

The backend is part of the skill's name rather than a flag: session semantics
differ enough between Herdr and Omnigent that one prompt covering both would be
vague about both.

`mo-review` is the one you will use most. It runs directly in the coding session
that made the change, which temporarily wears both hats — a deliberate exception
to "the executor gets no methodology skill", because for a small fix losing the
coding context costs more than the methodology bias risks.

## Repository layout

```text
src/skills/      the authored skills — SKILL.md plus what only that skill owns
shared/          source owner: methodology, purpose contract, mo-models.mjs, mo-posture.sh
skills/          the installable tree, built from the two above and committed
tools/           build-skills.mjs — copies shared files in, and verifies identity
docs/            this project's own contract, knowledge and fixtures
spec/            the council specs, kept verbatim as history
```

The built tree sits at `skills/` because that is where apm and `npx skills` look
in a repository they install, and it is committed because they install what is
committed. The authored tree sits under `src/` for the same reason: so discovery
cannot reach it. An earlier layout published `dist/` instead, as the spec spells
it — a remote install then resolved the authored `skills/` and every skill
arrived without its references, while `apm install ./dist` was refused outright
because the manifest sat one level above the directory being installed.

`make mo-qc` proves the committed tree byte-matches a fresh build, and the build
refuses a source skill that shadows a shared file — which is the only way a
hand-edited copy of the methodology could begin.

## What it refuses to do

- Pass a gate on a partially retrieved reviewer verdict. An unproven boundary is
  `unknown`, never a partial PASS.
- Read a provider's private transcripts, hooks or session database to work around
  a missing backend surface. If the sanctioned surface cannot deliver a complete
  turn, that route is marked unsupported.
- Accept "repeat your last answer verbatim" as retrieval. That tests obedience.
- Summarise a reviewer's findings on the way to the author.
- Start reuse research, an E2E tester or a watchdog you did not ask for.
- Let the executor edit or delete the spec.
- Weaken a quality gate to make a candidate green.
- Push, tag or open a PR without being asked.
- Keep run state, gate receipts, digests, manifests or baselines anywhere. The
  only file outside a repository is `~/.meta-o/models.json`, and it holds model
  preferences and nothing else.

## Developing meta-o

```bash
npm install
make mo-qc      # lint, contract identity, built-tree identity, tests, smoke
make skills     # rebuild skills/ after editing src/skills/ or shared/
make format     # the rewriting half, deliberately outside mo-qc
make mo-e2e     # prints what an agent must run, and exits 2
```

Its contract is [`AGENTS.md`](AGENTS.md) — byte-identical to `CLAUDE.md`, because
each provider reads its own file and a divergence means two providers silently
working to different contracts. Its knowledge is in
[`docs/business.md`](docs/business.md), [`docs/glossary.md`](docs/glossary.md) and
[`docs/architecture/`](docs/architecture/skills-first.md).

## Known limits

**The loop has been driven end to end on both backends, and neither run converged.**
On 2026-08-06 and 07 a small feature went framing → spec → executor session → QC →
frozen SHA → two independent reviewers with at least one on another vendor → findings
verbatim → new SHA → every gate again: seven rounds through `mo-herdr`, six through
`mo-omnigent`. Every reviewed round returned FAIL on real findings — a parser that
rejected the separator `ru-RU` actually emits, a range guard a reviewer disproved by
mutating the source and watching the suite stay green, once an acceptance criterion
that had been _deleted_ rather than satisfied, and last a mutation harness whose gate
exited 0 after checking 1 of its own 101 mutants. So there is still **no verified
candidate**, and what the runs established is that the gate catches what a green build
does not, that the second vendor is load-bearing (twice one vendor passed a candidate
the other then failed), and that reviewers which probe by mutation raise the bar every
round. Two limits belong in the same breath: **the orchestrator was this session
reading the authored skills, not a packaged skill installed and launched on its own**,
so the methodology is what these runs exercise; and the Omnigent run misaddressed its
own executor for four rounds through `omnigent run -c`, which is now fixture O9 and a
rule in the skill. [`docs/e2e.md`](docs/e2e.md) records every round and both limits.

- **Most Phase 0 fixtures now have evidence, and support is per surface, not per
  provider.** Run on 2026-08-06/07: §H for all three providers on both surfaces, §G
  except the trust step, §O except its open rows, §W, §M, §R in full, and the `PATH`
  rows for Claude and Codex. **§H is not closed** — H7b is open on the TUI surface of
  every route and N/A on the captured inline surface, so the one supported
  configuration for the review gate is Claude or Codex, captured inline. What the
  evidence says is sharper than "it works":
  **`agent read` caps at 1000 rows** and there is no scroll method, so a long **TUI**
  answer is `unknown` — and the TUI carries the review gate only on Codex, because
  Claude Code interleaves repaint fragments above roughly 250 rows and OpenCode
  retains no scrollback at all. The **inline** surface (`claude -p`, `codex exec`,
  `opencode run` through `herdr pane run`) returned an 800-row answer exactly on every
  route, keeps its own addressable session for rebuttals, and is the recommended path
  — with its stdout captured **as a structured envelope**, which
  [`addendum-02`](spec/2026-08-05-ai-driven-development-workflow-revision/addendum-02-orchestrator-owned-capture.md)
  had to permit explicitly, because the shell writing that file is a different thing
  from the reviewer-written verdict file the spec bans. The envelope, not the exit
  status, is what proves the turn ended: `claude -p --output-format json` returns one
  parseable object and `codex exec --json` ends in a `turn.completed` event, whereas
  a turn cut off mid-answer exits 0 like any other and a verdict truncated below its
  heading looks whole.
  Its one measured failure mode is a provider that ends a turn empty: a tool-using
  OpenCode turn produced no answer and still exited 0, and so did an Omnigent
  `claude-sdk` review — which is `unknown`, never "no findings". That failure is why
  **OpenCode is unsupported for the review gate on both of its surfaces**: a reviewer
  that goes silent as soon as it uses a tool cannot hold a gate.
  **Omnigent's REPL answers `Unknown command: /goal`** and never
  forwards slash commands to the harness, so that route runs the lifecycle with the
  weaker prompt-text objective. It has a second limit that is easy to miss: its
  headless output is free text with no envelope, so the review gate there must go
  through `session export` — which needs a full conversation id no non-interactive
  surface yields, and a prefix is refused. **Every Omnigent review round is therefore
  a `needs_attention`**, not something an unattended run completes.
  Details and the rows still open are in
  [`docs/phase-0-fixtures.md`](docs/phase-0-fixtures.md).
- **There is no OpenCode wrapper on this machine** (rows P2c/P3c). On that route
  nothing in `PATH` carries a permission or sandbox posture, so it comes from
  OpenCode's own configuration — which nobody has verified — or from nowhere.
- **The remote installs are unverified.** What is proven is a local-path `apm
install`, by `tests/install.test.mjs`. `npx skills` and the remote form (I3–I5)
  need this repository pushed first.
- **The Claude model catalog needs an optional peer SDK.** The Claude CLI has no
  listing subcommand, so the authoritative list comes from
  `@anthropic-ai/claude-agent-sdk`'s `supportedModels()`. These skills install by
  directory copy with no `npm install`, so the SDK is resolved at runtime and its
  absence is reported as a gap rather than filled in from session history. Codex
  and OpenCode need no SDK.
- **`/goal` works on Codex and Claude Code, and does not exist on the other two.**
  Codex reports `Goal active` / `Pursuing goal` and survives `codex resume` with an
  explicit status; Claude Code reports `◎ /goal active`. OpenCode answers the line as
  ordinary text, and Omnigent's REPL rejects it outright — both get a prompt-level
  convention that must be called weaker. The one part still unobserved is Claude's
  first-time workspace-trust prompt, because this repository was already trusted.
- **`mo-watchdog` stays skill-only.** Fixture W1 ran: a session performed a bounded
  native wait (`sleep 25`) and then produced another reasoning turn in the same
  session. No helper `.mjs` is admitted.
- **Nothing mechanically enforces the methodology.** The previous generation could
  refuse an illegal transition; this one can only be read and followed. The trade
  is argued in
  [`docs/architecture/skills-first.md`](docs/architecture/skills-first.md), and
  the honest summary is: the enforcement covered sequencing, never judgement, and
  it cost a control layer that had to be recovered before any feature could be.

Everything deferred is in [`docs/backlog.md`](docs/backlog.md).
