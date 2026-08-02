---
name: test-e2e
description: Build the E2E selection plan for a candidate, run the pre-review smoke, and execute the selected scenario set in an isolated environment with per-scenario evidence. Use when an orchestrator dispatches you as the e2eTester in the AI-driven development workflow.
---

# End-to-end verification

You have three separate jobs in one feature, and the orchestrator will ask for
them at three different moments. Do the one you were asked for.

## 1. The selection plan (before any review)

Read the immutable spec blob, the candidate diff, `docs/architecture/e2e.md` and
`docs/architecture/e2e.json`. Then choose the scenarios that will run:

- **every** scenario with `always_required: true` — no exceptions, this is why
  an empty plan is impossible;
- every scenario whose `business_links` the change touches;
- every scenario whose tags or area the change touches. Both are checked
  mechanically against the `impactedBusinessLinks` and `impactedTags` you
  declare: a plan that names an impact and then omits a scenario carrying it is
  refused. Whether the impact you declared is the right one stays the
  reviewers' judgement;
- additional scenarios the diff's risk profile implies. This is the part no
  mechanical rule produces, and it is the reason a model does this job.

`meta-o e2e baseline-selection` gives you the mechanical part as a starting
point. It is a starting point, not an answer.

Emit the draft and seal it:

```bash
meta-o e2e seal-plan <<'JSON'
{ "schemaVersion": 1, "commitOid": "<candidate>", "selectedScenarioIds": ["…"],
  "selectionRationale": "why these and not others",
  "impactedBusinessLinks": ["§B-…"], "impactedTags": ["…"] }
JSON
```

Both reviewers will judge whether this set is complete, so the rationale has to
carry your reasoning, not just your conclusion.

If you later change the plan, the E2E loop stabilises against the **new** plan
first, and then both reviewers must attest it again.

## 2. The smoke (before the reviews)

Build, boot, health check. Nothing more. Its only job is to stop two expensive
reviews from being spent on a candidate that does not start.

## 3. The selected set (after both reviews pass)

Run every scenario in the plan.

- Work in a fresh detached worktree of the candidate commit. Do not modify
  tracked files. Ask the orchestrator to launch the suite through
  `meta-o worktree run --run-id <id> --label e2e --rev <candidate> -- <command>`,
  or run it that way yourself if you hold the run id: `run record-e2e` refuses
  a result for which no such receipt exists, because a suite run in the
  developer's checkout is indistinguishable from an isolated one once it is
  reduced to JSON. A non-zero exit from your harness is fine — the per-scenario
  statuses decide the gate, not the exit code.
- Give the environment a namespace unique to this run and scenario.
- Clean up **even when a scenario fails**. A leaked container or database is a
  failure of this role.
- **Never** run against production without an explicit production-safe contract
  in `docs/architecture/e2e.md` — a section that says what a production run may
  touch, how it is namespaced and how it is cleaned up — and the user's
  confirmation for this run. `run record-e2e` refuses on both counts; the
  contract check only proves the document says *something* about production,
  and whether what it says is adequate is the reviewers' reading. Say
  `"environment": "production"` in your report if you did; the orchestrator's
  `run record-e2e` refuses it unless the user's decision is already recorded
  against this run, and lying about where you ran breaks the metadata guard at
  the last step instead of here.

Report:

```json
{
  "planDigest": "…",
  "snapshotDigest": "…",
  "environment": "local|ephemeral|staging|production",
  "scenarios": [
    { "scenarioId": "E2E-CHECKOUT-01", "status": "passed|failed|blocked", "evidence": "what you observed" }
  ]
}
```

Validate it with `meta-o e2e result --run-id <id>`, which checks that every
selected scenario actually ran and that the digests still match the candidate.

`blocked` means the environment prevented the check. It is not a pass. Say what
blocked it.

## Evidence, not artefacts

Evidence is a short, checkable statement: the request you sent, the status you
got, the row that did or did not appear. The registry stores no screenshots, no
raw logs and no model reasoning — and neither should your report.

## Interpreting failures

A failing scenario is a fact about the candidate until proven otherwise. Before
you call it flaky, say precisely why the flakiness is in the test and not in the
code — with evidence. "Retried and it passed" is not that evidence.
