---
name: mo-quiz
description: Use only when the user explicitly requests mo-quiz; read the current branch, its specification and the owner's recorded intent, and ask the owner a short numbered set of business and architecture questions about the agent's decisions that intent does not cover.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
  source_tree: "ed5edcaf2f91eb76610117d651bc2048a52a998e"
---

# Quiz the owner on what the agent decided

Start only when the user names `mo-quiz`. A question such as "what did we do?",
a request for a summary, a changelog or a review does not activate it: answer
that directly. No other skill calls it. The quiz is not a review and not a
lifecycle step: it judges no candidate, gates nothing and replaces no check. It
exists so the owner keeps the thread of decisions the agent made on the way and
can answer them in one message.


Read [Обратная связь о методологии](references/methodology-feedback.md)
completely: friction you hit goes to the user in your answer.

The quiz only reads. It commits, stashes, checks out, edits and publishes
nothing; until the owner answers and consents to a specific record, it writes
nowhere.

## Inputs

- The range `<base>..HEAD` with its commits, messages and diff, where `<base>`
  is `git merge-base develop HEAD`. When there is no `develop` branch, or the
  range is empty because `HEAD` is on it, ask the owner for the base instead of
  guessing one.
- Uncommitted changes from `git status` and `git diff HEAD`. Report them in
  their own marked section; never commit or stash them for the quiz.
- The accepted specification the owner names, or the one the range adds or
  changes. A branch without a specification is normal: then the questions come
  from the diff and the history alone.
- The owner's verbatim intent: the intent ledger the specification carries, and
  the owner's own messages in the current conversation.
- Changes to `docs/business.md` and `docs/architecture/`, where the project
  keeps them: these are business and architecture decisions by definition.

Never open a session log yourself. If the owner wants past sessions considered,
running the session-diagnostics skill is their own call, and its local redacted
report can then be handed to the quiz as one more input.

## Gather

Start three fresh subagents that do not inherit your context — never a fork of
this conversation. Give each one the repository path, the base, the
specification and ledger paths or `none`, and the owner's messages from this
conversation copied verbatim, because they cannot see it:

1. scope and architecture — size and shape of the change: new modules,
   boundaries, data formats, dependencies, public interfaces and configuration;
   a changed approach or architecture; hand-written code where a mature library
   or a platform feature usually does the job, naming which;
2. history and fixes — changes of direction, reverted or deleted work, the same
   area fixed again and again, existing code rewritten;
3. intent — every explicit owner intent with its reference: a ledger entry, an
   owner message, an option the owner picked from an earlier question; and every
   specification statement without an owner source.

Each returns facts with their source — a commit, a path, a ledger entry or a
message — and no questions. Where the harness cannot start subagents, make the
same three passes one after another, each from the raw sources rather than from
the previous pass, and say so in the answer: "three sequential passes, no
subagents".

## Reconcile attribution

Merge the facts into decisions and give each exactly one attribution:

- `owner_intent(<ref>)` — the owner's own words cover it;
- `agent_choice` — no owner source exists, so the agent decided;
- `unclear` — the sources disagree or the owner's words do not settle it.

The specification text alone never proves the owner's origin: the agent wrote
it. A specification statement is `owner_intent` only when it quotes or cites an
owner source. Where collectors disagree, read the cited source yourself; a
decision still undecided is `unclear`. A decision the owner explicitly chose
from earlier questions is `owner_intent` too. A change that departs from a
recorded intent is not covered by it: the departure is an `agent_choice`, and
that departure is what you ask about.

Drop every `owner_intent` decision. The rest are the candidates.

## Ask

Rank the candidates by reach × irreversibility × deviation from intent: how much
of the product or its users it touches, how costly it is to undo — data
formats, public interfaces, deletions, new dependencies — and how far it moves
from what the owner asked for.

Ask usually three to ten questions, in the owner's language, at the level of
business meaning and architecture, never at the level of how a function is
written. Use one continuous numbering so the owner can answer every question in
one message. Each question gives:

- the fact — what was done, in one sentence;
- the consequence — what it changes for the product, its users or its upkeep;
- the source — commit, path or ledger reference, and its attribution
  `agent_choice` or `unclear`;
- the options — two or three, keeping it as it is among them, each with its
  cost;
- your recommendation and why.

Fewer than three qualifying decisions give fewer than three questions; say so
and never pad the list. With more than ten, ask the top ten and list the rest in
one line each so the owner can ask for them.

After the questions, give a separate process block, never phrased as
questions: rejected directions with their commits, fixes and repeated fixes per
area, and the size of the range in commits and changed files. Derive it only
from the data you read. Commit dates are not working time: give no share of
time or effort unless a source records it.

## After the answers

Explain every divergence between an answer and the branch: what the owner
expected, what the branch does and what aligning them would take. Changing the
code is not the quiz's step; it goes back to the owner's decision.

Offer each follow-up record with its exact text and destination: a verbatim
ledger entry, a backlog entry or an Issue in the repository the owner names.
Write a record only after the owner's explicit consent to that record; a file
record stays an uncommitted change in the working tree.

## Meta-O calls

- none
