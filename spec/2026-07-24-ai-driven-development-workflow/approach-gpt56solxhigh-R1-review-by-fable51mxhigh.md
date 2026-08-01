Before rendering any judgment I want to be explicit about the frame I'm reviewing against, because the task defines a sharp boundary between *hard constraints* the author has already decided and *revisable decisions* a judge may challenge — and a proposal can only be fairly scored against that boundary. From the source documents the non-negotiables are: one full process with no modes; an immutable feature-spec as input that the orchestrator neither validates nor rewrites; a thin orchestrator that stays out of the code and lives longer than everyone else (the author calls its compaction a "critical loss of trust"); one strong executor with path-freedom but no right to shrink scope; exactly two reviewers (one same vendor/family, one mandatory cross-vendor) plus a separate E2E tester; disposable-per-feature sessions; a business-layer top-truth with grep anchors (`§B-*`); mechanically mandatory purpose on every entity including privates via native docstrings; local QC as a standalone mandatory gate that works with no CI; and a completion criterion of one Git revision passing two reviews and E2E with no changes between the final confirmations. The author also flags several *open* items (TODO-projection is an explicit hypothesis "not to be pre-accepted"; solution-scan placement; cache/context thresholds) and one *self-declared critical defect* (lost turn-completion events / double-continuation). I read all six references (with `my-opinion.md` and `sdd-issues.md` in full) to ground this, and I tried to break each proposal against these axes rather than grade presentation.

One procedural note that colours the whole review: **Proposal 3 is the literal token `PONG`** — a non-submission. There is nothing to stress-test; it satisfies none of the mandatory deliverables (no master-spec, no subspecs, no contracts, no critique section). I score it accordingly and spend the rest of the analysis on the two real proposals.

## Facts & Constraints (White Hat)

Both real proposals are technically feasible on top of Herdr/Omnigent and both correctly refuse to build a new runtime, treating the backend as a capability contract. Proposal 1 encodes this as a `SessionBackend` port whose missing capability yields `FAILED_BACKEND/CAPABILITY_MISSING`; Proposal 2 as a `SessionAdapter` with `capabilities()` and explicit graceful degradation (`pushEvents=false` → rely on a `status()` reconciliation loop). Both are consistent with the "core must not depend on a specific CLI/backend" constraint, and both correctly classify OpenCode/Claude/Codex as *routes*, not vendors — a distinction the author cares about for the cross-vendor reviewer rule.

On the code-health / QC deliverable, both give a concrete Python implementation in native config (`pyproject.toml`), both compare pre-commit / QC / pre-push placement and both land on the same defensible answer: `./tools/qc` (or `meta-o qc`) is the single authoritative gate, pre-commit is a fast changed-files subset, pre-push duplicates, CI is optional. Proposal 1 is more implementation-ready here: it prints the literal ordered command sequence (ruff → purpose_lint → knowledge-lint → code_health → lint-imports → mypy → pytest) with a stop-on-first-failure policy, and it correctly notes that **fan-in is not a defect** (a stable core legitimately has many consumers) so only fan-out and forbidden directions are bounded — a subtlety Proposal 2 omits. Both require custom AST work for cognitive complexity (neither wrongly claims radon or ruff provides it), and both handle the purpose linter's exception model with a *conjunction* (glob **and** generator marker **and** generator declaration), which correctly prevents a single glob from disabling coverage.

Data/verification requirements are handled asymmetrically, and this is the most important white-hat fact. The verification-state file must record a Git revision, but writing the file changes the revision — a recursion. **Proposal 1 identifies and solves this explicitly** (§4.10): a metadata-only commit that touches solely `verification-state.json`, records the *parent* executable revision, and is guarded by a mechanical "diff contains only this file" check. **Proposal 2 does not solve it**: its `VerificationRecord.git_rev` plus an auto-`stale` status ("stale when git_rev != HEAD") means the very commit that writes the record immediately marks it stale, and this is never reconciled with its completion invariant.

## Risks & Failure Modes (Black Hat)

**Proposal 1's most material gap is the orchestrator's own context budget.** The author's single most emphasized requirement is that the thin orchestrator survive a multi-day super-goal inside a safe window (~250k) and that its compaction be treated as a critical failure — yet Proposal 1 specifies session-level economics (`safeContextTokens`, `coldResumeTokens`) while saying almost nothing about the *orchestrator's* budget, pre-compaction escalation, or the "never let the orchestrator compact" invariant. The watchdog covers quota, not the orchestrator's own context growth. This is a genuine coverage hole against the author's #1 concern. A second, related gap: Proposal 1 bounds *per-finding* disputes ("до двух rebuttal-циклов") but provides **no global bound on the REVIEW↔E2E alternation**. Because the constraint "all confirmed defects including minor must be fixed" forbids deferral, and any code change invalidates both loops and forces full re-review by both reviewers plus re-E2E, a stream of new minor findings on each revision can livelock — precisely the failure the author explicitly fears. Third, a consistency wrinkle: Proposal 1's `onRevisionChanged` says *any* tracked change invalidates all gates, but its own verification-state metadata commit is a tracked change; the "only this file" gate is the intended exemption but the invalidation invariant never states the code-vs-doc carve-out, so the two rules are in latent conflict.

**Proposal 2's most material failure mode sits in the completion criterion itself**, which is the machine artifact the task most demands be airtight. Its invariant is strict SHA equality: `DONE ⇔ review_clean_rev === e2e_clean_rev === head_rev`. But §4.2 also introduces a doc-only optimization where a knowledge/`doc_globs` commit "does not invalidate E2E." These contradict: a doc-only commit advances `head_rev` while leaving `e2e_clean_rev` at the older code revision, so `e2e_clean_rev !== head_rev` and **DONE becomes unreachable** unless E2E is re-attested — the opposite of the stated intent. Worse, writing `verification-state.json` at the end is itself a doc-only commit that trips this, and Proposal 2 (unlike Proposal 1) never addresses the SHA recursion. The instinct behind doc-only-doesn't-invalidate-E2E is *good* (see Green Hat), but as written it breaks the stopping criterion. A softer risk: §6.3 *suggests* splitting the two reviewers into fixed lenses (cross-vendor = business/architecture, same-family = correctness/detail). If ever adopted from the critique into the design, that would mean business logic is cross-checked by only one model, defeating the author's "independence of errors" rationale for two reviewers and conflicting with the "short *unified* rubric, free order" constraint — though to be fair the main design (§3.1/§4.5) keeps both reviewers on the full unified rubric, so this lives only in the critique as a debatable alternative.

Neither proposal fully closes the "spec lost something important" hole, but that is a hard constraint (the orchestrator may not validate spec completeness), so both correctly push it to the reviewers' rubric ("reuse findings and mandatory wishes not ignored") rather than inventing a validation gate.

## Strengths & Benefits (Yellow Hat)

Proposal 1 is the more *decomposition-ready* of the two: it reads like something an implementer could start Monday. It has a firm decision ledger (adopted/rejected/deferred with reasons), an 11-item critique table that cleanly separates hard-constraint from revisable-decision and supplies both a compatible variant and a constraint-violating alternative with costs (exactly the five-point structure the task mandates), literal QC command sequences, brownfield ratchet rules for the code-health baseline, a formal `project-adopt` path that refuses to be a "light mode," and a concrete implementation decomposition with a crisp done-criterion (one feature from immutable spec to attested SHA across *both* backends, including recovery from an artificially lost session). Its verification-state recursion solution is the single cleanest piece of engineering in either document. It also faithfully rejects the TODO-projection hypothesis with a real argument (planned truth pollutes current truth; dangerous under parallel PRs) rather than hand-waving.

Proposal 2 is the stronger on exactly the layer the author calls critical: session reliability. Its `SessionAdapter` with a monotonic `turnSeq`, delivery `Ack`, a push-events-*and*-reconciliation dual path, and an **idempotent resume** ("check turnSeq before re-sending 'continue'") is a direct, concrete answer to the author's self-declared critical defect (lost turn events, double-continuation) — more concrete than Proposal 1's capability-list approach. It is also the only one that seriously honours the orchestrator-context constraint (context budget in `RunState`, relay-by-reference payloads, `requestSummary`/`compact`, escalate-before-the-danger-line), it adds a global `cycle_budget` anti-loop bound that Proposal 1 lacks, it answers "who watches the watchdog" (OS supervisor via launchd/systemd), and its `adjudicator` — an ephemeral read-only subagent that sees only the disputed region + spec clause + both arguments — is a genuinely good resolution of the "orchestrator adjudicates blind" weakness that keeps the orchestrator out of the code while still grounding the verdict in evidence. Its explicit GOAL/PROTOCOL/GUIDE marking and "nothing mandatory hides only in an optional skill" (faithful to GRACE post 3809 and to `sdd-issues`) show it internalized the source critique rather than decorating with it.

Both correctly make repo-owned, committed QC scripts the *normative* reproducibility anchor while leaving skills unpinned — the exact resolution of that tension the author needs — and both keep review findings and decision logs ephemeral, matching the "no ledger" constraint and the anti-artifact-bloat lesson.

## Alternatives & Creative Ideas (Green Hat)

The most valuable cross-pollination is obvious: **the ideal design is a merge.** Take Proposal 1's spine (decision ledger, literal QC commands, brownfield ratchet, verification-state metadata-commit, and the four-role model set that matches the task's literal "четырёх ролей" — Proposal 2 quietly expands this to five by folding in the orchestrator) and graft on Proposal 2's orchestration layer (`turnSeq` idempotency, orchestrator context budget, `cycle_budget`, `adjudicator`, OS-supervised watchdog).

Proposal 2's doc-only-doesn't-invalidate-E2E instinct is worth rescuing rather than discarding: Proposal 1 re-runs *everything* on any tracked change, which needlessly re-runs heavy E2E when only a `§A-*` doc changed. The correct form is a **path-scoped attestation**: E2E attestation is valid for a revision iff the diff since the E2E-clean revision is confined to `doc_globs`; then the completion invariant is stated over the code-relevant tree hash, not the raw HEAD SHA. That simultaneously fixes Proposal 2's completion-invariant bug and keeps the efficiency win.

On the anchor model, the two diverge and the source is decisive: the memory-layers scratchpad has **no `§M` module anchor** — modules reference `§A` directly. Proposal 2 follows this faithfully; Proposal 1 *invents* `§M-*`. That's not wrong (an explicit grep-able module handle is more grep-first, which the author likes), but it adds a fourth anchor type to maintain and drift-check. A lighter alternative worth considering: keep the module-purpose docstring but let "one level up" be satisfied by the module's `§A` reference plus file-locality, reserving new anchors only where a module genuinely needs a stable cross-file identity. Finally, on cross-review independence, a constraint-respecting upgrade neither fully adopts: incremental re-review that hands reviewers the *diff since their last pass* plus their prior findings, which preserves the author's "cheaper re-review from retained context" goal without re-reading the whole tree.

## Completeness & Process (Blue Hat)

Against the deliverable list (master-spec + implementation-ready subspecs; lifecycle; knowledge layer; skills/tools/orchestration; mechanical + semantic QC; mandatory five-point critique; Russian prose with English identifiers), both real proposals are substantially complete and both satisfy the critique-section requirement in full. Proposal 1 is packaged as master-spec plus named subspecs and is the more decisive: it *resolves* the task's open items (solution-scan placement → "here, with auto triggers"; TODO-projection → rejected) instead of returning them. Proposal 2 is organized as a master-spec plus a six-subspec map with per-subspec machine contracts, but it ends by **handing seven decisions back to the council as open questions** (TODO-projection accept/reject, sync ack, two-lens vs one, PBS threshold, reuse-scan placement, doc-only E2E invalidation, retry tables). Some of those are legitimately open per the task's own framing, but the task explicitly asked for "не абстрактная методология, а декомпозиционно готовая система," and on that axis Proposal 2 is a notch less finished than its contract quality suggests.

Remaining gaps to close in either direction: neither specifies the *language* discipline cleanly for the mixed-language deliverable at the artifact level (both assert it, both comply in body); neither gives a concrete algorithm for the cold-resume decision (cache-alive → resume; dead & <100k → re-warm; else fresh-with-state) that the author sketched, though Proposal 1 at least fixes the 100k threshold as a knob; and both underspecify how the generic knowledge-lint *identifies* "the active tracked feature-spec" it must assert is gone after sync (it needs the spec path threaded in from run state). Process-wise, Proposal 1's missing orchestrator context budget and missing global alternation bound are the two additions I'd require before adoption; Proposal 2's completion-invariant/doc-only contradiction and unaddressed verification-state recursion are the two I'd require there. None of these is fatal; all are the difference between a 7 and a 9.

Net: two strong, adoptable-with-changes designs and one non-submission. Proposal 1 edges ahead on internal consistency of the stopping criterion and sheer implementation-readiness; Proposal 2 edges ahead on the orchestration-reliability layer the author cares most about but carries a real logical defect in its completion criterion. I score Proposal 1 slightly higher because a spec whose gaps are *omissions* is safer to build from than one whose core stopping criterion is *self-contradictory*.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-1",
      "approval_score": 7,
      "would_adopt": true,
      "summary": "A highly decomposition-ready master-spec + subspecs that faithfully honours the hard constraints, makes firm decisions (decision ledger, literal QC command sequence, brownfield ratchet, four-role model set matching the task), and uniquely solves the verification-state SHA recursion with a guarded metadata-only commit. It is internally consistent on its completion criterion (all attestations on one SHA). Its real weaknesses are omissions rather than contradictions: it barely addresses the orchestrator's own context budget and compaction avoidance (the author's single most emphasized concern), it lacks a global bound on the REVIEW↔E2E alternation (risking the livelock the author explicitly fears, given no-defer-minor + full re-review on any change), and its 'any tracked change invalidates all gates' rule is in latent conflict with its own verification-state metadata commit. Strong enough to adopt as the spine, but needs the orchestration-longevity and anti-loop layers added.",
      "phase": "approach-review",
      "confidence": "medium",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "orchestration",
          "description": "The orchestrator's own context budget, pre-compaction escalation, and 'never compact the orchestrator' invariant are essentially unspecified, despite this being the author's foremost requirement for a thin, long-lived controller.",
          "required_change": "Add an explicit orchestrator context budget to run state, relay-by-reference of findings, and escalate-before-danger-line semantics; specify how the orchestrator avoids its own compaction over a multi-day goal."
        },
        {
          "id": "",
          "severity": "major",
          "area": "stopping-criteria",
          "description": "No global bound on the alternating REVIEW/E2E cycle. With 'all confirmed defects incl. minor must be fixed' and full re-review by both reviewers + re-E2E on any code change, a stream of new minor findings can livelock.",
          "required_change": "Introduce a global cycle budget with escalation-on-exceed, distinct from the per-finding two-rebuttal cap."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "consistency",
          "description": "onRevisionChanged invalidates on 'any tracked change', but the verification-state metadata commit is a tracked change; the 'only this file' guard is the intended exemption but the invalidation invariant never states the code-vs-doc carve-out.",
          "required_change": "State the invalidation rule as code-path-scoped (doc/state-only commits do not invalidate) so the metadata commit is formally exempt."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "knowledge-layer",
          "description": "Introduces a §M module anchor not present in the source memory-layers model (which has module→§A directly). Defensible as more grep-first, but adds a fourth anchor type to drift-check."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "tooling",
          "description": "How the generic knowledge-lint identifies 'the active tracked feature-spec' it must assert is removed after sync is unspecified; it needs the spec path threaded from run state."
        }
      ],
      "assumptions": [
        "The four-role model set (executor, two reviewers, tester) is taken as literal compliance with the task's 'четырёх ролей'; the orchestrator's model is chosen separately when the user launches it.",
        "'local' feature-specs are placed outside the worktree, so the preflight untracked-file block does not conflict with them."
      ],
      "round": 1,
      "reviewer": "fable51mxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: true
