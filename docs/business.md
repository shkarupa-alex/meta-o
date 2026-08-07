# Why Meta-O exists

Two halves, and they must not be merged. **Part 1** is the business framing: what
the user asked for, in their own words, kept verbatim and appended to as they say
more. **Part 2** is the durable theses derived from it, in terms that have nothing
to do with how anything is built; every decision in `docs/architecture/` cites one
of those.

The framing is the half that gets quietly "tidied" into a summary, and a summary
is exactly what cannot be re-read after the compression. The rules are in
`shared/references/methodology.md §2.1`.

---

## Part 1 — the business framing

Every request and clarification below is the user's message **as it was sent**:
same language, same line breaks, nothing joined, nothing shortened. Where a
message was a hand-off of review findings rather than a statement of intent, the
instruction is quoted and the findings themselves are not: they are evidence, they
travelled to the author verbatim by their own rule, and they live in the change
that closed them. What is not allowed here is a summary standing in for something
the user actually said.

The first draft of this section broke that on the day it was written — line breaks
replaced by `/`, three of four clarifications rendered as a sentence about them.
It was rewritten from the session transcript. That is worth leaving on the record,
because it is the exact failure the rule exists to prevent, committed by the party
that wrote the rule.

### 1. The request that produced this generation — 2026-08-05

> @spec/2026-07-24-ai-driven-development-workflow/README.md - вот эту спеку мы уже реализовали
> но я просмотрел и в ней были сбиты акценты и получилось слишком "толсто"
>
> вот новая спека @spec/2026-08-05-ai-driven-development-workflow-revision/2026-08-05-ai-driven-development-workflow-revision-council-brainstorm.md
> читай и превращай то что уже есть в то что надо по этой спеке
> ничего не откладывай напотом

### 2. Clarification — the model catalogs

> на всякий случай уточню: для получения списка моделей ты же использовал js/ts sdk наших cli агентов?
> типа как тут /Users/alex/bitrix/skills/dist/brain-council

This corrected a real defect rather than asking a question: two of the three
catalog probes had been guessed, and one of them — `claude models` — starts an
agent turn on the prompt "models".

### 3. Decision — the shipped licence

Asked as a question with three options, because a licence is the user's to choose:

> Новая спека (§19) требует `dist/LICENSE` в поставке, но в репозитории сейчас нет
> файла лицензии (`package.json` говорит UNLICENSED). Какую лицензию класть?

Answer: **MIT**, copyright Shkarupa Alex.

### 4. Standing instruction — review findings

Six rounds of independent reviews were handed over, each introduced only by its
own line and nothing else. The first:

> ниже 2 ревью

The second, and then four more rounds under a bare `## Findings` heading:

> Новые находки

No triage instruction accompanied any of them. Read together with "ничего не
откладывай напотом" from the first message, the standing expectation is that every
real finding is closed in the same change.

### 5. The framing rule itself

From the user's own notes in `docs/references/my-opinion.md`, which is where this
requirement entered the project:

> Поэтому спека не должна быть единственным источником пользовательского намерения.

and, naming the artefact this file is:

> Этот материал я называю **бизнес-постановкой задачи**. В проекте он должен
> попадать в `docs/business.md`. Это не техническая спека и не пересказ будущей
> реализации. Это зафиксированный источник того, что человек хотел получить и
> почему это важно.

The six rules that follow it there are reproduced as the normative text of
`shared/references/methodology.md §2.1`.

### What that means for the product, in the user's terms

- the previous generation was **too thick** — the fault was misplaced emphasis,
  not missing features, so the fix is deletion plus a written methodology;
- nothing is postponed to make a round look finished;
- authority comes from the tool that owns the answer, never from a plausible
  guess about its interface.

---

## Part 2 — the durable theses

## A feature must be verifiably done, not plausibly done

A model reports success it has not observed — not from malice, from the same
optimism that makes a person say "that should work". The cost lands later, on
whoever trusted the report.

So "done" has to be a property of evidence: one named commit, checked by parties
who each say what they checked. When the checks do not describe the same commit,
the feature is not done, however confident anyone sounds.

## Human time is more expensive than tokens

A human is interrupted for product meaning, an irreversible action, credentials,
a subscription change, a genuinely unresolvable dispute — and for nothing else.
An orchestrator that asks "what should I do?" has pushed its own work onto the
person it exists to serve. It states a hypothesis and asks one question.

## One model is not enough

Two independent reviewers exist so that one model's blind spot is not the
project's blind spot. At least one comes from a different vendor than the author.
The moment the second review is derived from the first, both are one review, and
the cross-vendor property that justified the cost is gone.

## Writing code is cheap; maintaining accumulated layers is not

The expensive failure is not a syntax error. It is a working system that
implements a misunderstood intent, or a second architecture growing quietly
beside the first. So reviews carry an architecture lens and the blunt question
_why does this need to exist at all?_ — and so does this project about its own
code.

## A control layer must earn its keep

The previous generation of Meta-O had a CLI, a state machine, a run store, gate
receipts, snapshot digests, structured findings transport, session adapters, and
installer scripts. Each was defensible on its own. Together they were a workflow
engine that spent its attention on itself, wrapped CLIs the agent could already
use, and had to be recovered before any feature could be.

The capability was already there: native `/goal`, native sessions and resume, a
terminal multiplexer with its own control plane, Git. What was missing was a
methodology, written down, that says who does what and what counts as evidence.
That is what this project ships now.

## Deferred work that nobody wrote down does not exist

Anything postponed, blocked, or knowingly left unfixed goes into
`docs/backlog.md` with its reason, its practical impact, and the next step. A
decision that only lives in a session transcript is a decision the next session
will make differently.

## The methodology is itself a project

It gets the same treatment it prescribes: a contract it can be held to, gates it
actually runs, and reflection only when something really failed — not a ritual
after every change.
