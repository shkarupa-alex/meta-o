# End-to-end verification of meta-o itself

This project ships Markdown and two dependency-free helpers (`.mjs` and `.sh`). Most of what
would be an E2E suite elsewhere is a deterministic console check here, so it runs
inside `make mo-qc` and needs no separate tester.

The set is small, so it lives in this one file rather than under
`docs/e2e/index.md` + groups.

## Deterministic, in `mo-qc` — no agent required

| Scenario                      | Command                                       | Asserts                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The helper runs               | `make mo-smoke`                               | `--help` and `--show` answer and exit 0, under a throwaway `HOME`                                                                                                                                                                                                                                                       |
| Posture matrices are readable | `node --test tests/provider-posture.test.mjs` | both shells cover kind/path divergence, framing, malformed evidence, inherited state and scan failure, dispatch shadows, normal and signaled process-group shutdown, launch/temporary-directory races, repeated signals, and 0/1/2 precedence; the selected campaign tries 22 named guard mutations with zero survivors |
| The built tree is in sync     | `node tools/build-skills.mjs --check`         | `skills/` byte-matches a fresh build from `src/skills/` + `shared/`                                                                                                                                                                                                                                                     |
| The contract has not diverged | `cmp -s AGENTS.md CLAUDE.md`                  | the two project-instruction files are byte-identical                                                                                                                                                                                                                                                                    |
| Unit behaviour                | `make mo-test`                                | selection grammar, upgrade rule, settings I/O, build validation                                                                                                                                                                                                                                                         |
| Settings stay untouched       | `make mo-test`                                | `--show` writes nothing; a bad `--set` persists nothing                                                                                                                                                                                                                                                                 |
| A real apm install            | `make mo-test`                                | seven complete skills, and `--skill mo-review` alone with its reference                                                                                                                                                                                                                                                 |

## Agent-required — not executed by `make`

| Scenario                                                        | Where                         |
| --------------------------------------------------------------- | ----------------------------- |
| Full-turn retrieval per Herdr provider route                    | `docs/phase-0-fixtures.md` §H |
| Omnigent goal, resume and full export                           | `docs/phase-0-fixtures.md` §O |
| Native `/goal` activation and survival                          | `docs/phase-0-fixtures.md` §G |
| Watchdog next-turn spike                                        | `docs/phase-0-fixtures.md` §W |
| Installation through `npx skills`, and from a remote repository | `docs/phase-0-fixtures.md` §I |
| A small feature driven end-to-end through `mo-herdr`            | run 2026-08-06/07 — see below |
| The same through `mo-omnigent`                                  | run 2026-08-07 — see below    |

## The end-to-end runs, 2026-08-06 and 07 — one per backend

Phase 1 item 5 of the spec asks for a small feature driven end to end through **both**
backend skills. Both were run, each in its own purpose-built scratch project rather
than in a production repository, with this session as the orchestrator.

**What both runs shared.** Framing recorded verbatim from a request → spec with
acceptance criteria → implementation by a separate executor session → `make qc` green
→ **candidate frozen as a full SHA** → two independent reviewers on that SHA, neither
seeing the other's answer, at least one on a different vendor than the author →
findings copied to the executor verbatim and whole → new SHA → every gate again.

### The Herdr route — a ru-RU budget-string parser

Executor and reviewers ran on the **inline** surface (`herdr pane run` + a prompt
file, stdout captured), which §H had just proved exact where the TUI was not.
Reviewer A on Codex, reviewer B on Claude.

| Round | Candidate | What the reviewers found                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `836cade` | an amount past `MAX_SAFE_INTEGER` silently rounded; `qc` not `.PHONY`, so a stray file would make the gate a no-op; **the parser rejected the separator `ru-RU` actually emits** (U+00A0), i.e. the pipeline's own input; non-string input reported as "empty"; a catch-all test that could not tell one refusal from another                                                                                                                                                                                                                                               |
| 2     | `bd13275` | currency classification depended on the amount already parsing, so a foreign currency — the recorded incident — surfaced as a shape error; the range guard was asserted four orders of magnitude away from its real edge, and a mutant returning `NaN` passed the suite green; errors distinguishable only by matching English prose; leading-zero groups silently normalised                                                                                                                                                                                               |
| 3     | `a8e1403` | the error classes the spec names (`TypeError`, `RangeError`) had been replaced by one `BudgetError`, breaking a stated criterion; the round-trip refusal the commit is named for had no isolating test; comments restating syntax                                                                                                                                                                                                                                                                                                                                           |
| 4     | `2a6cc96` | the range guard accepted a value that had silently lost a kopeck — the exact thing it existed to prevent — proved by walking the top of the safe range; four mutants of the error contract survived the suite; diagnostics pinned for one currency and one input type only                                                                                                                                                                                                                                                                                                  |
| 5     | `0b19b11` | the public error-code contract unpinned; the rejection grammar under-constrained; a short thousands group accepted by a mutant that returns a wrong number with the suite green; the separator set not pinned as closed                                                                                                                                                                                                                                                                                                                                                     |
| 6     | `7bb3370` | both FAIL, and **both found the same defect independently**: a prose budget cell refused as a _currency_ error naming a word that is not a currency. B added that `make qc` cannot run from a checkout whose path contains a space; A added that the documented exactness boundary rejects a uniquely representable amount. Getting A's verdict took three attempts — the first died on `stream disconnected before completion`, the second was cut silently after 60k tokens, and both left `unknown` rather than a verdict                                                |
| 7     | `0bd707b` | the fix round shipped a mutation harness of its own — **101 mutants tried, 4 surviving**, each survivor recorded in the fixture's backlog with the reason it is kept. Both FAIL, and both found the same defect independently: **`make qc` exits 0 after checking 1 of the 101 mutations**, so the harness that was supposed to raise the bar had lowered it. B added an unpinned leading-whitespace fence whose test does not cover it, and a range refusal that may drop the row it refused; A added that the bespoke checker is excessive and incomplete by construction |

### The Omnigent route — the same lifecycle without a goal

This route cannot carry a native goal at all: its REPL answers `Unknown command:
/goal`. So the run used the fallback `methodology.md §6` defines — the objective as
prompt text, the conversation continued with `omnigent run -c`, and the weakness said
out loud. Retrieval was the headless surface: each role is one `-p` invocation whose
stdout is the complete turn. Reviewer A ran on the `codex` harness, reviewer B on
`claude-sdk`.

**Two corrections, both against this run rather than against the route.**

_First, its reviews were retrieved through a surface §8 does not sanction._ Each
reviewer's plain stdout was captured to a file and read. §8 requires the native
`session export`, and `addendum-02` — which permits orchestrator-owned capture — amends
§7.2 only and explicitly does not license swapping a native export for free text. The
export was skipped because it needs a full conversation id that no non-interactive
surface prints and that a prefix cannot stand in for (fixture O10, measured after this
run). The correct handling was a `needs_attention` asking the user for the id; instead
the run continued on captured text. Nothing here suggests the verdicts were wrong —
they were detailed, mutually consistent and repeatedly confirmed by the executor's
own fixes — but they were obtained off-contract, and a verdict off-contract is not a
gate result. `mo-omnigent` now states the `needs_attention` outright.

_Second, this run misaddressed its own executor, and the evidence below is qualified
by it._
The executor also ran on `codex`, so from round 3 on every `omnigent run --harness
codex -c` continued whichever codex conversation was most recent — which, after each
review round, was **reviewer A's**. A probe on 2026-08-07 confirmed it directly: asked
to quote its own first user message with no tools, the `-c` conversation answered
`ROLE: reviewer`. Nothing errored and nothing warned. The rounds still did the work,
because the objective and the findings travel in full in each prompt on this route —
that is the whole point of the prompt-text fallback — but the claim "the executor
continued its own session" is false for rounds 3–6, and any conclusion resting on
executor continuity here is not supported. It is fixture O9, and `mo-omnigent` now
requires the executor to hold a harness no reviewer uses.

| Round | Candidate | Verdicts and what they found                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `bae30e2` | A PASS, B FAIL — negative amounts designed in code and frozen by tests while the framing records them as undecided; the round-trip proven against a parser the change itself shipped; eight of eighteen guard mutations surviving                                                                                                                                                                        |
| 2     | `78781e2` | both FAIL — a leading-zero grouped string accepted as a different number (found independently by both); a reuse of `Intl.NumberFormat('ru-RU')` reverted and recorded nowhere; an unconstrained decimal-parts guard                                                                                                                                                                                      |
| 3     | `4b89539` | A PASS, B FAIL — **an acceptance criterion had been deleted rather than satisfied**, which is the single most valuable finding either run produced; the mirror parser exported as production API; error-code values unpinned                                                                                                                                                                             |
| 4     | `c86aa09` | A FAIL — the public `parseBudget` export dropped, which contradicts B's round-3 finding that exporting it was itself the defect; the orchestrator ruled on that dispute and the ruling travelled into the next round. B's first answer was **empty with exit status 0** — `unknown`, repeated — and the repeat returned FAIL on a deleted `-0,00 RUB` guard and on criterion 3 loosened without a record |
| 5     | `27af9b2` | A PASS with no findings, for the second round running; B FAIL — the "groups of three" guard unconstrained by the suite, the `Intl.NumberFormat` reuse reversal still unrecorded, a guard and the assertions proving it deleted in one commit, and — the finding that matters — **the business symptom the framing actually raised is still live and written down nowhere**                               |
| 6     | `d59a303` | the fix round: `make qc` green, the executor's own sweep reporting 15 mutants killed and 0 surviving. **Not reviewed.** The round-6 reviewers were not launched, because the `-c` defect above was found first and reviewing a candidate produced through a misaddressed executor session would have added a verdict without adding evidence                                                             |

### What the two runs establish

1. **The gate is not ceremonial.** Every round on both routes found something a green
   `make qc` did not — including a defect that would have failed on real `ru-RU` data,
   a guard that had quietly stopped guarding, and a deleted acceptance criterion.
2. **A fix earns its own round.** Round 2's currency fix created round 3's error-class
   regression; the Omnigent route's round 3 fix deleted a criterion. That is exactly
   why a new SHA invalidates every gate rather than inheriting the previous verdict.
3. **Cross-vendor is not a formality.** Twice a reviewer returned PASS with no findings
   on a candidate the other vendor then failed on a real defect. A same-vendor pair
   would have converged on a defective candidate both times.
4. **Reviewers that mutate set a moving bar.** Once a reviewer deletes each guard in
   turn, PASS requires the suite to pin every branch, and each round surfaces the next
   unpinned one. The severity fell round over round — blocking defects, then contract
   holes, then unpinned guards — which is what convergence looks like here, and it is
   slower than "two rounds and done".
5. **Invisible characters do not survive tooling.** A literal U+00A0 in the source
   degraded into a plain space between two edits; the fix was `\u00a0` escapes, and a
   reviewer had predicted the class of failure.
6. **The 1000-row cap bites in real rounds, not just in fixtures.** In round 4 a
   reviewer's own mutation campaign pushed the command echo out of the readable
   window, so a complete-looking verdict had no provable upper boundary. Under this
   project's own rule that is `unknown`; the retrieval was repeated with stdout
   captured to a file, which is now what the mechanics recommend and what
   `addendum-02` had to be written to permit.
7. **Provider failures are a normal event in a long round, and only one of them is
   recoverable.** Round 6's executor died on `API Error: … (ENOTFOUND)` with a
   half-edited worktree; resuming by the uuid the orchestrator had chosen finished the
   same work — fixture R7. Reviewer A's round-6 turn then died **twice** before
   succeeding on the third attempt: first `stream disconnected before completion`,
   then a silent cut mid-output after 60k tokens. A reviewer cannot be resumed the way
   an executor can, because its output _is_ the deliverable: each failed attempt left
   an empty file, which is `unknown` and is repeated from the start. Long
   mutation-driven review turns are where this surfaces, and a run should expect to
   pay for a retry or two rather than treat the first failure as a route defect.
8. **The worst session defect makes no noise at all.** Every failure above announced
   itself — a stack trace, an empty file, a missing boundary. The `-c` misaddressing
   did not: it produced plausible work, in the wrong conversation, for four rounds,
   and was found only by asking a session what its own first message had been. Route
   knowledge that cannot be checked from the outside has to be checked deliberately,
   before the run, and turned into a rule the skill enforces rather than a caution
   the operator is expected to remember.
9. **"The process exited" is not "the turn finished", and the gap is where a partial
   PASS gets in.** Both runs bounded a captured answer with a shell sentinel and an
   exit status. That catches a crash and an empty answer; it cannot catch a turn cut
   off mid-answer, which exits 0 like any other — and because a verdict template puts
   `## Verdict` near the top, such a capture would read as a complete FAIL with its
   later findings silently missing. That case has **not** been observed here — the
   round-6 failures left empty captures — so it is a hazard designed against rather
   than one caught, and fixture H12 says so instead of implying otherwise. The
   answer is not a marker asked of the model, which is what the spec bans and what
   `omnigent-mechanics.md` had drifted into recommending, but a provider-authored
   envelope: `claude -p --output-format json` parses whole or not at all, and `codex
exec --json` closes with `turn.completed` (fixture H11). Omnigent offers neither,
   which is what makes its review gate a `needs_attention` rather than a job a run
   can finish alone.

**Scope, stated plainly — what these runs do not prove.** Both ran in scratch
projects, and **the orchestrator in both was this coding session reading the authored
skills, not a packaged `mo-herdr` / `mo-omnigent` launched from an install.** So the
methodology has been exercised and the shipped artefact has not: nothing here shows a
fresh agent, given only the installed skill, reaching the same behaviour. Neither run
reached two PASS on one SHA, so there is no verified candidate on either route.
Together those are what still stands between "the loop demonstrably works, on both
backends" and "the workflow is proven", and they are carried in `docs/backlog.md`
rather than counted as done.

`make mo-e2e` prints the help for these and exits 2. It does not pretend to have
run anything, and `mo-qc` does not depend on it.

## Environment and cleanup

The deterministic scenarios need Node ≥ 22, Git, Bash and Zsh, and touch nothing
outside the repository. `mo-models.mjs` writes only `~/.meta-o/models.json`; the tests and
`make mo-smoke` both point `HOME` at a temporary directory, so the real settings
file is never read or written by the gate — and a corrupt one cannot make an
unmodified checkout fail.

The install scenario needs `apm` on `PATH` and is **skipped** without it, which is
reported as a skip rather than a pass. It builds a copy of the repository holding
only the tracked files, installs into a temporary project, and deletes both. It
writes nothing to `~/.apm` and needs no network.

The agent-required scenarios run against live provider sessions. Whoever runs
them stops the sessions they started, even on failure, and records the evidence
in the fixture table rather than in a log file.
