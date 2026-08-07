# Skills and reasoning are the orchestration layer

Because _a control layer must earn its keep_ and _a feature must be verifiably
done_.

## The decision

There is no executable router, no finite state machine, no run state and no
backend adapter layer. Orchestration is a skill the agent reads plus the
reasoning it does. The only things that survive a restart are Git, the tracked
task/spec, the project instructions and the backend's own sessions.

## What that buys

A restart costs a re-read, not a recovery protocol. There is no state file that
can disagree with the repository, because there is no state file. A gate is
either freshly proven on the current SHA or it is `unknown` and gets repeated —
one fail-closed rule instead of impact analysis nobody can audit.

## What it costs, honestly

- Nothing mechanically prevents an orchestrator from skipping a step. The
  previous generation could refuse a transition; this one can only be read and
  followed. The trade was deliberate: the enforcement cost a control layer that
  had to be recovered before any feature could be, and the enforcement it bought
  was over sequencing, never over judgement.
- Two reviewers' independence is a rule, not a wall. It always was — run state
  was a readable file.
- There is no audit trail beyond Git history and what the reviewers said in their
  sessions.

## Boundaries this keeps

- **Native CLIs are not wrapped.** No proxy script stands between the agent and
  `herdr`, `git`, `make` or a package manager. A wrapper both narrows what the
  agent can do and hides what it actually did.
- **The executor gets no methodology skill.** A large spec plus the project
  contract is the input; a methodology skill would trade implementation
  attention for ritual, and the executor's job is the implementation.
- **One skill per backend, no shared adapter.** `mo-herdr` and `mo-omnigent` do
  not call each other and share no executable. Their session semantics differ
  enough that a single generic prompt would be vague about both — and a generic
  adapter is exactly the layer this project deleted.
- **Project-owned manifests, receipts, digests and baselines are created only
  when a real external consumer can be named.** In the baseline there is none.
