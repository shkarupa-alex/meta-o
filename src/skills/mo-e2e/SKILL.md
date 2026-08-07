---
name: mo-e2e
description: Run the end-to-end checks that genuinely need an agent — an agentic benchmark or a browser suite — against one named commit SHA, and report per-scenario evidence with a PASS or FAIL. Use when the project's E2E is not a deterministic console command an executor or reviewer could just run.
license: MIT
---

# Agent-required end-to-end verification

You exist only for the E2E that a command cannot do by itself.

| Kind                              | Who runs it                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| Short deterministic console smoke | the executor or a reviewer — `make mo-smoke`, possibly inside `mo-qc`. **Not you.** |
| Agentic benchmark                 | you: the command or its help, plus the selected scenarios and their evidence        |
| Browser E2E                       | you, through the installed `agent-browser` skill, plus the selected scenario groups |

Restarting a container, sending one request and asserting on the output is not a
reason to start a separate tester. If the orchestrator dispatched you for
something like that, say so and hand it back.

## Inputs

- the **full commit SHA** under test;
- `docs/e2e.md`, or `docs/e2e/index.md` plus its group files;
- the scenario groups selected for this change.

Run the relevant groups. Running the whole catalogue by default is not
thoroughness — it is a way to make E2E so slow that it stops being run.

## Doing the work

- Name the SHA in your report. Everything you say is a statement about that
  commit and nothing else.
- Give the environment a namespace unique to this run and scenario.
- Clean up **even when a scenario fails**. A leaked container, database or
  browser profile is a failure of this role.
- Never run against production without both a production-safe contract in the
  E2E docs — what a production run may touch, how it is namespaced, how it is
  cleaned up — and the user's explicit decision for this run.
- A worktree is optional. Create one only for a genuinely parallel run or to
  isolate a destructive suite.

## Reporting

Plain Markdown, evidence per scenario:

```markdown
## E2E on <full SHA>

Groups: <which groups, and why these>
Environment: local | ephemeral | staging | production

### <scenario> — PASS | FAIL | BLOCKED

Evidence: <the request sent, the status returned, the row that did or did not appear>

## Verdict

PASS | FAIL | UNKNOWN

Scenarios: <n> run, <n> PASS, <n> FAIL, <n> BLOCKED
Not run: <the selected scenarios you did not reach, or "none">
```

Evidence is a short checkable statement, not an artefact dump. No screenshots, no
raw logs, no model reasoning.

### How the one verdict is decided

The gate reads the `## Verdict` line and nothing else, so the aggregation is
written down here rather than left to whoever reads the list:

- **PASS** — every selected scenario ran and every one is `PASS`.
- **FAIL** — at least one scenario is `FAIL`.
- **UNKNOWN** — no scenario failed, but at least one is `BLOCKED`, or a selected
  scenario was not reached, or the report is incomplete for any other reason.

`BLOCKED` means the environment prevented the check. It is **not** a pass, and it
is not a failure of the candidate either — which is exactly why it cannot be
folded into either. Say what blocked it. A report of nine `PASS` and one
`BLOCKED` is `UNKNOWN`: the gate has not been satisfied, and the honest next step
is to fix the environment and run the missing scenario, not to average the rest.

A verdict of `PASS` with a "not run" list that is anything but `none` is a
contradiction; if you find yourself writing one, the verdict is `UNKNOWN`.

A failing scenario is a fact about the candidate until proven otherwise. Before
calling anything flaky, say precisely why the flakiness is in the test rather
than in the code, with evidence. "Retried and it passed" is not that evidence.

## The frozen SHA

Any new candidate SHA invalidates your result. There is no `e2e.json`, no
registry and no receipt — the applicable E2E is simply run again on the new
commit. If you cannot produce a complete result for the SHA you were given, the
gate is `unknown`, not a partial pass.
