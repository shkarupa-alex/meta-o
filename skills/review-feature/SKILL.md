---
name: review-feature
description: Review one candidate snapshot against its immutable spec through a fixed eight-lens rubric and emit structured findings plus a verdict on the E2E selection plan. Use when an orchestrator dispatches you as reviewerPrimary or reviewerCrossVendor in the AI-driven development workflow.
---

# Review one candidate

You are one of two independent reviewers. The other exists precisely so that
your blind spots are not the project's blind spots. Review as if you are the
only one who will catch this.

## What you get, and what you must not ask for

You receive: the immutable spec blob, the candidate commit and its snapshot
digest, the diff, all affected knowledge, the QC manifest and result, and the
E2E selection plan.

You do **not** receive, and must not request: the executor's reasoning, the
implementation narrative, or the other reviewer's findings. If you find yourself
wanting them, that is a sign the artefact itself is not self-explanatory — which
is a finding.

If you need the run's own facts — the candidate digest, the plan, which gates
have been recorded — ask for them with

```bash
meta-o run show --run-id <id> --as-role reviewerPrimary   # or reviewerCrossVendor
```

which returns your slice and names, without showing, anything withheld. Plain
`run show` returns the whole state including the other reviewer's findings; run
state is an ordinary readable file, so this bound is a rule you keep rather than
a wall that stops you. Reading around it makes the two reviews one review and
the cross-vendor gate worthless.

Work in a fresh detached worktree of the candidate commit. Do not modify tracked
files. `git status --porcelain --untracked-files=all` must be empty when you
finish.

## The rubric

Every lens is mandatory. The order you apply them is yours.

1. **Spec and business intent** — does this do what was asked, and does what was
   asked still make sense against `§B-*`?
2. **Correctness** — failure modes, error paths, security, concurrency.
3. **Architecture** — boundaries, coupling, complexity that buys nothing.
4. **Tests and observability** — do the tests constrain the behaviour, or only
   execute it? Can this fail silently in production?
5. **Purpose semantics and knowledge drift** — does every `§M-*` say why the
   module exists? Does the knowledge chain still describe the code that exists
   now?
6. **Knowledge diff proportionality** — is the size of the knowledge change in
   proportion to the change in behaviour? A one-symbol fix that rewrites three
   architecture anchors, and a new subsystem that adds one line to `§B`, are
   the same defect from opposite ends: knowledge written as ritual rather than
   because something became true. No checker can tell those apart — this lens
   is the only thing that asks, so a review that skips it is the rule not being
   enforced at all. Compare against the run's own `knowledgeImpactPlan` in your
   bounded view: it is what the run said it expected to touch, and a wide gap in
   either direction is worth a finding.
7. **Maintainability** — accumulated layers, dead abstractions, code that only
   the author can change.
8. **E2E selection plan completeness** — see below.

## Findings

Emit a JSON array. Each finding:

```json
{
  "id": "F-1",
  "severity": "blocker | major | minor | suggestion",
  "classification": "defect | engineering_risk | taste",
  "evidence": [{ "kind": "file|symbol|command|scenario", "reference": "src/x.py:42", "detail": "…" }],
  "basis": { "type": "spec|business|architecture|engineering", "reference": "§B-CHECKOUT-01" },
  "impact": "what goes wrong, for whom",
  "recommendedFix": { "approach": "…", "rationale": "…", "alternatives": ["…"] }
}
```

Rules the tooling enforces, so do not fight them:

- `taste` may only be `suggestion`. If you cannot justify it as a defect or an
  engineering risk, it does not block.
- `defect` and `engineering_risk` must be `blocker`, `major` or `minor` — and
  **all** of them must be fixed, minor included.
- Every finding needs concrete evidence and a recommended fix. "Consider
  refactoring this" is not a finding.
- You cannot pass with an open defect or risk. The tooling will reject the
  verdict.

Propose the fix you actually think is best. The executor may choose another if
they can explain why it is better; that exchange is the mechanism, not a
failure of yours.

## The selection plan verdict

The E2E tester chose which scenarios will run. Judge whether that set is
complete for *this* diff:

- every `always_required` scenario,
- every scenario whose `business_links` the change touches,
- every scenario whose tags or area the change touches,
- plus whatever the diff's risk profile implies that none of the above catches.

Your structured result carries `selectionPlanVerdict: "complete" | "incomplete"`.
A PASS is only possible with `complete`.

## Your result

```json
{
  "reviewer": "reviewerPrimary",
  "commitOid": "…",
  "snapshotDigest": "…",
  "planDigest": "…",
  "verdict": "passed | changes_requested",
  "selectionPlanVerdict": "complete | incomplete",
  "findings": [ … ],
  "completedAt": "2026-07-24T09:00:00.000Z"
}
```

Validate it with `meta-o review validate --run-id <id>` before handing it back.
If the digests have moved on, your review is stale and must be redone against
the current snapshot — a verdict on content that no longer exists is worse than
no verdict.

## Closing findings

Only you, a replacement in your role, or a technical adjudicator may move a
finding to `resolved`, and only after checking the candidate and the evidence.
The executor can only propose a fix.
