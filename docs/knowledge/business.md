# Business truth

Why meta-o exists, in terms that have nothing to do with how it is built. Every
architecture decision in `docs/knowledge/architecture/` cites one of these.

## §B-WORKFLOW-01 — A feature must be verifiably done, not plausibly done

A model will report success it has not observed. Not from malice — from the same
optimism that makes a human say "that should work". The cost lands later, on
whoever trusted the report.

The product therefore has to make "done" a property of evidence rather than of
narration: a specific content identity, checked by specific parties, each of
whom recorded what they checked. If the four checks do not describe the same
content, the feature is not done, regardless of how confident anyone sounds.

## §B-WORKFLOW-02 — A crash must never cost work, and must never duplicate it

Sessions die. Laptops sleep. Quotas run out mid-turn. A workflow that only works
when nothing goes wrong is a demo.

Two failures matter and they pull in opposite directions. Losing the run means
redoing hours of work. Duplicating an effect — a second executor, a second
delivery of the same instruction — means two agents fighting over one worktree,
which is worse than losing the run because nobody notices immediately. Recovery
must therefore be conservative: prove what happened, or stop and ask.

## §B-WORKFLOW-03 — The developer's machine is the authority

Quality that lives in CI is quality the developer meets after they thought they
were finished. Worse, an agent-driven loop that has to wait for CI is an
agent-driven loop that spends most of its life idle.

Everything the workflow needs to say "this passed" must run locally, offline,
under the project's own control. CI may duplicate it; CI may not define it.

## §B-KNOWLEDGE-01 — Why the code exists must outlive the people who wrote it

The expensive question in an old codebase is never "what does this do" — the
code answers that. It is "why is it like this, and what breaks if I change it".
When nobody can answer, the change is made timidly or not at all, and the system
calcifies.

Knowledge is therefore a first-class, checkable artefact with a causal chain
from business truth down to the individual module, not a folder of documents
that drifts quietly out of date.

## §B-TRUST-01 — No party may certify its own work

A reviewer that shares the executor's model shares its blind spots, and a
reviewer that has read the executor's reasoning is no longer independent of it.
An executor that can close its own finding has not been reviewed at all.

Independence is structural, not a matter of good intentions: different vendors,
bounded context, and closing rights that belong to the party that raised the
concern.

## §B-SAFETY-01 — Nothing leaves the machine that the user did not intend

Model sessions send text to third parties. Prompts and evidence pass through
this workflow constantly, and the interesting parts of a codebase are exactly
where the credentials are.

The user confirms which providers a project may use. Secrets are removed from
anything a worker or a log will see. External specs are fetched under explicit
limits and are never executed.

## §B-CONTROL-01 — The developer decides what is installed, and where

A methodology that installs hooks, pins versions or writes runtime files into a
repository becomes that repository's problem — and a problem shared by everyone
who clones it.

meta-o keeps all of its state outside the project, installs where the developer
says, and can be removed by deleting what it copied.
