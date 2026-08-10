---
name: mo-review
description: Run two independent reviews of the current change, apply the accepted findings, and repeat rounds until both reviewers pass with nothing actionable left. Use directly in the coding session that just made a small fix, or as the review protocol inside a full mo-herdr / mo-omnigent workflow.
license: MIT
---

# Review, fix, review again

This is a **textual review protocol**, not an actor-launcher API. It says what
reviewers are asked, through which lenses, in what form they answer, and when
the loop ends. Who starts the sessions depends on how you got here.

Read `references/purpose-and-architecture.md` before judging purpose comments or
architecture boundaries — those are the two lenses where a reviewer most often
substitutes taste for a finding.

## Two ways in

**Direct, in the session that just changed the code.** This is the main
standalone case: you made a small fix and you want it checked before it goes
anywhere. This session temporarily wears both hats — orchestrator and executor.
It reads the business framing, the current task/spec and the full Git diff,
launches the independent reviewers, applies the findings it accepts itself, and
re-reviews until the loop converges. No separate executor is created.

Being the shortest way in does not make it the loose one: the framing precondition
below is the same here as in a full workflow. This mode skips the executor, not the
gates.

That is a deliberate exception to "the executor gets no methodology skill". For
a small scope, losing the coding context costs more than the methodology bias
risks. A large feature or a whole spec does **not** use this mode — it uses
`mo-herdr` or `mo-omnigent` with a real separate executor.

**From a full workflow.** The backend skill (`mo-herdr` or `mo-omnigent`) owns
creating the reviewers, waiting on them, retrieving their complete output and
handing control back. This file only supplies the prompts, the lenses and the
convergence rules.

Called directly with no obvious backend, use the one that is unambiguously
available, or ask the user which backend to launch reviewers through.

## Before the first round

- **Resolve the business framing, and fail closed without it.** Name the concrete
  path before the first round: `docs/business.md`, or `docs/business/index.md`
  plus the per-feature file that index names when the project is split — the index
  alone is not the framing. If the project has none, or you cannot read what it
  has, this review returns `needs_attention` naming that; it does not proceed to a
   verdict on completeness. In direct mode the fix you just made is usually small
   enough that recording the framing and mirroring the same words under the spec's
   `## User intents (verbatim)` section is one message and one commit — do that
   rather than reviewing without it. **Both** reviewers get the same resolved
   path: two reviewers judging different framings agree about nothing.
- **Independence.** The two first-pass reviewers must not see each other's
  findings. At least one runs on a different vendor than the coding session or
  executor. The coding session does not occupy a reviewer slot — it is the
  author.
- **Where the two vendors come from.** The `reviewerA` and `reviewerB` roles of
  the saved model set, which a full workflow already confirmed in preflight
  (`mo-models.mjs --show`, owned by `mo-herdr` / `mo-omnigent`). In direct mode
  this skill does not read that file — it is installed without the helper — so
  either the backend skill supplies the routes, or you establish which vendors
  are available and name the two you used.
- **No cross-vendor reviewer means the review cannot complete.** If every
  available route is the author's own vendor, say so and return
  `needs_attention`. Two same-vendor reviewers may still be run, and their
  findings are worth applying — but the result is `needs_attention` with the
  reason named, never a completed review, and two same-vendor PASS verdicts do
  **not** end the loop. A shared blind spot is invisible from inside it, which is
  the entire reason the second vendor is required rather than preferred. Only the
  user may decide to accept a same-vendor review, and that decision belongs to
  them, in that moment — not to this file and not to you.
- **Scope that fits.** If the artefact or the diff will not fit in a reviewer's
  context, do not start a partial review. Either split the scope into explicitly
  listed independent parts with one shared final integration pass, or return
  `needs_attention`. A review that silently saw two thirds of the change is
  worse than no review, because it reports a verdict.
- **In direct mode the worktree may be dirty.** That is fine — the reviewers
  read the diff you show them. In a full workflow the candidate is a frozen SHA
  and stays frozen for the whole round.

## The lenses

Every one of these is mandatory in every review:

1. **Whole spec, and the business framing behind it** — does this do what was
   asked, and does what was asked still make sense? The spec is a lossy
   compression of a conversation, so a reviewer reads the recorded intent at the
   resolved framing path as well and asks what the spec dropped on the way. A
   reviewer first matches every framing entry for this piece of work to the spec's
   `## User intents (verbatim)` section word for word. A missing entry or a
   paraphrase is a blocking finding; a summary, derived requirement or link to the
   framing is not equivalent. A reviewer who was given only the spec can say the
   change matches the spec; it cannot say nothing was lost, and returns `UNKNOWN`
   saying exactly that, instead of a PASS that reads as completeness. A framing
   holding a live credential —
   token, password, key, connection string, customer data — is a finding of its
   own: the value belongs behind a marker like `[REDACTED: deployment token]`, and
   if it has already been pushed it is compromised and needs rotating, which the
   user hears about in this round rather than later.
2. **Correctness** — failure modes, error paths, and concurrency or security
   where they apply.
3. **Tests, and no weakened QC** — do the tests constrain behaviour or merely
   execute it? Did anything about "passing" get easier — a raised threshold, a
   disabled rule, a widened exemption, a re-frozen baseline?
4. **Architecture boundaries**, and the blunt question: _why does this thing need
   to exist at all?_
5. **The reuse decision** — is it still true after what the implementation
   learned?
6. **Durable knowledge** — did the change make something in the framing,
   `docs/glossary.md` or `docs/architecture/` new or false, and was that
   written down? Is the size of the knowledge change proportional to the change
   in behaviour, in both directions?
7. **Purpose semantics**, including every overload declaration — see
   `references/purpose-and-architecture.md`.
8. **Excess tooling** — proxy wrappers, ritual text, a home-grown checker where a
   mature tool exists.

A reviewer may use subagents along independent risk lenses: usually 0 for a small
change, 2–3 for a medium one, up to 4–6 for a large architectural scope. A fixed
6–9 subagents on every task is ceremony, not rigour.

## What a reviewer returns

Ordinary Markdown. No structured JSON, no verdict file, no nonce.

```markdown
## Verdict

PASS | FAIL | UNKNOWN

## Findings

### <severity>: <title>

Evidence: <the specific place or observation>
Impact: <why it matters>
Expected fix: <what the fixed behaviour or structure should be, without dictating the implementation>

## Residual risks

...
```

`UNKNOWN` is the verdict for a review that could not be completed as asked —
most often lens 1 without the business framing, or a scope that did not fit. It is
not a soft FAIL and not a hedge: it says which lens could not be answered, and it
never converges the loop.

`Evidence`, `Impact` and `Expected fix` are required on every finding. "Consider
refactoring this" is not a finding. `Expected fix` describes the outcome, not
the patch — the author may reach it another way and explain why.

`CANDIDATE` and `WORKTREE` are deliberately **not** reviewer output fields. The
backend, or the current session, already knows which diff is under review, and a
reviewer repeating that metadata adds no evidence.

Findings are copied to the author **whole and verbatim**. Nobody summarises,
ranks or filters them on the way.

**A verdict you cannot read in full is `unknown`, never PASS.** Whoever collects
a reviewer's answer proves it is complete — both boundaries and the continuity
between them, by the mechanics in the backend skill's own reference. A missing
`## Verdict` heading, a truncated last finding, a paged read whose windows do not
demonstrably overlap: all of them are `unknown`, the gate is not satisfied, and
the retrieval is repeated or the route is declared unsupported. Asking the
reviewer to "repeat that verbatim" is not retrieval — it tests obedience, and a
model that paraphrases while claiming to repeat will pass that test. In direct
mode the same rule holds for a reviewer running as a subagent: an answer that
arrives cut off is not a verdict.

## The loop

1. Both reviewers pass independently over the same change.
2. The author — the executor, or this session in direct mode — applies the
   findings it accepts, and rebuts the ones it does not, with evidence.
3. Applicable QC and smoke run again, either by the author or by a reviewer.
4. A **new independent round** starts.

**Beat the reviewers to the mutation sweep.** A reviewer that probes by deleting or
inverting each guard in turn will find the next unpinned one every round, so a loop
driven only by "fix what they named" converges slowly — measured here: six rounds,
with severity falling from wrong behaviour to unpinned guards but never reaching two
PASS on the first five. Before freezing a candidate, do that sweep yourself: enumerate
the guards, break each one, run the suite, and add a test wherever nothing failed.
Report how many you tried and how many survived. A survivor you keep is a backlog
entry with a reason, not a silence.

Any change after a verdict makes that round stale. The loop ends only when all
three hold in the _same_ round: both reviewers return PASS with no actionable
findings, **at least one of them ran on a vendor other than the author's**, and
**both had the business framing**, and both confirmed that every intent for this
piece of work appears verbatim in the spec, so their PASS covers completeness and not only
spec-conformance. Anything short of that — two PASS from one vendor, a PASS from a
reviewer that never saw the framing, a missing or paraphrased spec intent, a single
`UNKNOWN` — is `needs_attention`, not a pass. Completeness that nobody could judge
is not completeness that passed.

If one prompt exceeds the backend's known limit, split the Markdown only on its
own heading boundaries into numbered verbatim chunks, and send each after the
previous one has been acknowledged from a settled state. Never paraphrase to
fit. A backend that refuses a chunk yields `needs_attention`.

## Disputes

1. The original reviewer reads the rebuttal.
2. The second reviewer rules on that specific dispute.
3. One targeted fact-check, if the disagreement is about a fact.
4. The orchestrator takes the technical decision.
5. The user is pulled in only for product meaning, or a genuinely unresolvable
   choice.

A substantive risk that is knowingly accepted gets a durable `why` next to the
code — but only when the reason is not obvious and a future reviewer would
otherwise lose it again. Not every accepted risk earns a comment; a comment
nobody needed is the same ritual text lens 8 exists to catch.
