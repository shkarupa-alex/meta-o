Before scoring anything I want to re-anchor on what changed and what the fixed frame is, because all three proposals were revised and one (proposal-3) went from a literal `PONG` non-submission to a full, serious design. The hard constraints are unchanged from my first pass: immutable spec input the orchestrator neither validates nor rewrites; a thin orchestrator kept out of the code whose compaction the author calls a critical trust-loss; one strong executor with path-freedom but no scope-shrinking; exactly two reviewers (one same vendor/family, one mandatory cross-vendor) plus a separate E2E tester; per-feature disposable sessions; a business-layer top-truth with grep anchors; mechanically mandatory purpose on every entity via native docstrings, with the *linter* checking presence-and-reference and *reviewers* checking semantic drift; local QC as the standalone mandatory gate that works with no CI; and completion = one Git revision passing two reviews and E2E with no changes between the final confirmations. The author also flagged two self-declared *critical* reliability defects — lost turn-completion events and double-continuation on resume — and one top fear, orchestrator compaction. I re-read my round-1 findings against the revisions and checked specifically whether each surviving gap was closed, whether new contradictions were introduced, and how the three now differ on the criteria the task says must be airtight (completion, failure/recovery, verification-state).

## Facts & Constraints (White Hat)

All three are now technically feasible, CLI-neutral, backend-abstracted over Herdr/Omnigent, and refuse to build a new runtime. All three ship the required master-spec-plus-subspecs decomposition (proposal-1 inlines the subspecs, proposal-2 lists six with DoD, proposal-3 lists ten numbered `00–90`), the mandatory five-point critique section, concrete Python QC in `pyproject.toml`, PHP/JS adapter sketches, a deterministic-vs-local-vs-hybrid watchdog comparison, and the QC/pre-commit/pre-push placement comparison landing on the same defensible answer (authoritative full QC as the FSM gate, fast changed-files subset in pre-commit, pre-push duplicate, optional CI). Each correctly treats CLIs as routes, not vendors, and each keeps the local QC gate CI-independent.

The single most important white-hat fact is how each handles the verification-state SHA recursion, because the completion criterion is the artifact the task most demands be airtight. **Proposal-1 is the only one that cleanly and explicitly solves it**: §4.11 emits a metadata-only commit *after* `COMPLETE`, guarded to touch only `verification-state.json`, recording the parent executable revision — and because §4.9's invalidation invariant is scoped "до `COMPLETE`," the post-completion metadata commit provably does not re-trigger invalidation. That closes my round-1 consistency worry. **Proposal-2 did not close it and arguably sharpened it**: its `canComplete()` (§4.2) requires `∀ VerificationRecord: status==pass ∧ git_rev==head_rev`, while `VerificationRecord` auto-marks `stale` when `git_rev != HEAD`, and the tester writes the record *during* E2E (§4.3 step 10) — so the commit that persists the record moves HEAD and self-stales it, and the advertised "doc-only commit does not invalidate E2E" cannot actually reach DONE (after a doc-only commit, `e2e_clean_rev ≠ head_rev` and the record is stale, forcing an E2E re-run anyway). The optimization is therefore either void or contradictory. **Proposal-3 sidesteps the recursion better than proposal-2** by writing `verification.md` during KNOWLEDGE_SYNC finalization (§2.5 step 9), after the completion invariant is checked, and by having no doc-only carve-out its completion invariant (§2.4) stays internally consistent — though it never *explicitly* guards the finalization commit the way proposal-1 does.

On reliability, proposal-1 and proposal-2 both now specify monotonic `turnSeq` + idempotency keys/receipts + reconciliation (proposal-1 §5's `TurnEnvelope`/`TurnReceipt`/resume algorithm is the most detailed of the field; proposal-2 §4.1's `turnSeq`-vs-`Ack.acceptedAtTurnSeq` check plus a 30s reconciliation poll is solid). **Proposal-3 is the outlier and the weakest here**: its adapter (§3.1) has no turn counter; idempotency rests on `session_read_tail` + a prose "if you're already working, ignore" nudge (§2.1.2). That is a heuristic where the other two are mechanical, and it sits squarely on one of the two defects the author called *critical*.

## Risks & Failure Modes (Black Hat)

**Proposal-1.** The one meaningful gap that survived the revision is the orchestrator's own context budget: despite the author naming orchestrator compaction his top fear, there is still no first-class context-budget field, pre-compaction escalation, or "warn at N tokens" invariant (proposal-2 has `default 250k, warn 200k`; proposal-3 makes the orchestrator stateless outright). It is partially compensated — §9.1 `SESSION_LOST` recreates any role (including the orchestrator) "generation +1" from spec/Git/decisions/findings, so orchestrator loss is *recoverable* — but proactive budget management is absent. Secondary: there is no explicit global bound on the REVIEW↔E2E alternation; the per-finding two-rebuttal→adjudicator rule (§7.3) plus "taste doesn't block" and durable-rationale wontfix (§7.4) bound churn well in practice, but proposal-2 (`cycle_budget.max=6`) and proposal-3 (`max_review_rounds=5`) both make the anti-livelock backstop explicit and proposal-1 does not.

**Proposal-2.** Beyond the completion-criterion contradiction above, the now-*committed* reviewer lens split (§4.6/§6.3: cross-vendor B → rubric 1–3 business/arch, same-family A → rubric 4–6 correctness/security) is a real coverage risk: it routes the correctness/security detail — where implementation bugs live — primarily to the *same-family* reviewer, so the independent cross-vendor check is aimed away from exactly the errors most likely to be model-family-correlated. "Both free to leave their lens" softens it, but a fixed default focus tension-tests against the author's "каждое изменение проверяет модель другого вендора" and the "unified rubric, free order" wording. Third: the durable decision-log→§A migration is a DONE side-effect (§4.3 step 14), applied *after* the last cross-review, so the final architecture-rationale write escapes review — a subtle drift hole in the layer the author cares most about.

**Proposal-3.** Two structural risks. First, the machine footer is declared "the single hard contract that must be strictly obeyed" (§2.1.4) while §2.1.3 says roles need not remember the protocol — but a compaction-prone executor that drops its ```metao footer (precisely when compaction has occurred) forces the orchestrator back onto scraping prose from terminal tail, the very fragility the design set out to avoid, and the missing-footer fallback is underspecified. Terminal-tail parsing itself (§3.2) is brittle against interleaved tool output/ANSI/wrapping — structured events exist for this reason. Second, proposal-3 has *no adjudicator*: disputes are resolved by the blind orchestrator "по доказательствам" or escalated (§2.4 valve 1), which is exactly the "orchestrator picks the more convincing but wrong argument" failure the author flagged and that both other proposals independently converged on a fresh read-only adjudicator to fix. Like proposal-2, its final decision-log distillation into §A/§B (§2.5 step 9) lands post-review.

Shared minor risk across proposal-2 and proposal-3: both accept the TODO-projection hypothesis (light planned anchors in the shared `business.md`/architecture files), which the task said not to pre-accept. Both gate anchor removal (`anchor-check --gate done` / `--no-planned`) and both keep planned markers out of code docstrings, so the "future code-level contract in docstring" constraint is respected; feature-branch isolation plus the removal gate keep the multi-developer drift risk low, so I do not treat this as blocking — but proposal-1's rejection (transient `KnowledgeImpactPlan` in run state, §10.7) remains the safer stance for a team sharing one knowledge layer.

## Strengths & Benefits (Yellow Hat)

Proposal-1 is the most internally consistent and the most decomposition-ready. Round 2 folded in nearly everything I and the field wanted: a rigorous turn-delivery/resume protocol (§5), a fresh cross-model `technical-adjudicator` that resolves disputes by evidence and demands a deterministic experiment on `insufficient_evidence` rather than model voting (§7.3), a standalone reusable `review-loop` that explicitly cannot mint `COMPLETE` without E2E (§11), a genuinely thoughtful `missing-tools` protocol that refuses to turn an absent analyzer into a silent pass (§8, `PAUSED_MISSING_TOOLS`), and in-code wontfix rationale that deliberately omits `WONTFIX`/finding-id/reviewer-name to avoid turning the codebase into a debate archive (§7.4). It alone matches the literal "four roles" model set (§6.2, adjudicator reuses a confirmed reviewer model, no fifth saved role), it enforces the symbol→`§M` link in the linter (§10.6) — the most literal reading of "linter checks the necessary reference at each layer" — and it integrates+reviews knowledge during execution so only the tiny verification-state metadata escapes review.

Proposal-2 is the strongest on the orchestration/economics layer: explicit orchestrator context budget with a warn threshold, a clean ownership table (§2.3), committed retry schedules and a classification algorithm (§4.1–4.2), normative event traces for happy and failure paths (§4.3), and exit-coded lint algorithms (§4.5). It closed round-1's biggest weakness — the pile of open questions — by converting each into a "→ решено" committed decision (§6) with recorded assumptions (§8). Its `adjudicator` and idempotent resume are concrete and correct.

Proposal-3 brings the freshest thinking and the best answer to the author's top fear. The stateless-by-design orchestrator (§2.1.1) reframes compaction from "must be prevented" to "fully survivable" — the watchdog can *recreate* a dead orchestrator from `feature-state.json` + skill, which is strictly more robust than avoiding compaction. Its smoke pre-flight before the first heavy E2E (§4.5) is a genuine, unique contribution: it catches broken-environment cases without wasting a full two-vendor review round and without violating "first heavy E2E after clean cross-review." It adds a `glossary.md` term map (§2.3) directly targeting `sdd-issues`' semantic fan-out, it moves untracked spec retirement to an out-of-repo archive (§4.11) heeding the sdd-issues warning that in-repo `archive/` still gets read, it honestly names and mitigates the external-quick-fix drift the constraint creates (§4.9), and it fixes the scratchpad's `_buisiness.md` typo. Its completion invariant is clean.

## Alternatives & Creative Ideas (Green Hat)

The clear synthesis: proposal-1's spine (verification-state metadata commit, turn-envelope protocol, missing-tools escalation, adjudicator, knowledge-reviewed-during-execution, four-role set) + proposal-3's stateless orchestrator and smoke pre-flight + proposal-2's explicit context budget. Proposal-3's stateless design is the right fix for proposal-1's one real gap: persist the orchestrator's run state as a reconstructable on-disk file (proposal-1 currently offloads it to a backend capability), so orchestrator compaction/death becomes a recovery event rather than a trust-loss. Proposal-3's smoke pre-flight should be adopted by all three — it is cheap, does not touch the "heavy E2E after clean review" rule, and prevents the wasted-review-round failure. Conversely, proposal-3 should adopt proposal-1/2's monotonic `turnSeq` idempotency (retiring the prose-nudge) and their fresh adjudicator, both of which harden exactly its two weakest points.

On the reviewer question, both proposal-2 and proposal-3 independently reached the asymmetric-lens idea, and both should reconsider making it the *default fixed* assignment: a safer variant is both reviewers run the full unified rubric (satisfying "free order, unified rubric") while the orchestrator merely *notes* which model is more likely to catch which class — preserving cross-vendor coverage of correctness. And the doc-only-doesn't-invalidate-E2E optimization proposal-2 wants is worth rescuing correctly for all three: define the completion invariant over a *code-tree hash* (E2E attestation valid iff the diff since the E2E-clean revision is confined to `doc_globs`), which both fixes proposal-2's contradiction and lets proposal-1/3 avoid re-running heavy E2E after a pure knowledge commit.

## Completeness & Process (Blue Hat)

Against the deliverable list, all three are now substantially complete, decisive, and implementation-ready — a strong field. Remaining gaps are specific rather than structural. Proposal-1: add a first-class orchestrator context budget / pre-compaction escalation and an explicit global alternation bound; state that the durable-knowledge integration is reviewed (it is, during execution, but say so). Proposal-2: repair the `canComplete()`/doc-only/`VerificationRecord`-stale contradiction and the verification-state write timing (both currently self-inconsistent), and reconsider the committed lens split; its context budget and event traces are otherwise the best in the field. Proposal-3: replace prose-nudge idempotency with a monotonic turn counter, add an adjudicator, specify the missing-footer fallback, and move the final decision-log distillation into the reviewed window. Two process points recur in proposal-2 and proposal-3 that proposal-1 gets right: the final knowledge distillation should not land after the last review, and the "linter checks the necessary reference" constraint is most literally met when the symbol→module link is machine-checked (proposal-1) rather than delegated to reviewers (proposal-2 sets `symbol_requires_link_one_level_up=false`; proposal-3 relies on containment) — the delegated reading is defensible via containment but is a genuine divergence worth a decision record.

Net: proposal-1 is now the most consistent and complete on the criteria the task insists be airtight, and I could not break its core mechanics — its residual issues are enhancement-level omissions with compensating recovery. Proposal-3 is the most creative and the most robust against the author's top fear, held back by the weakest reliability mechanism on a critical axis and a missing adjudicator. Proposal-2 has the best orchestration/economics layer but carries a persistent logical contradiction in its central stopping criterion and an unaddressed verification recursion that the other two handle better.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 6,
      "would_adopt": true,
      "summary": "The strongest orchestration and economics layer in the field — explicit orchestrator context budget (250k/warn 200k), a clean ownership table, committed retry schedules, a classification algorithm, normative event traces, and exit-coded lint algorithms — and it closed round-1's open-questions problem by converting each into a committed decision. But the central stopping criterion is self-inconsistent and this persisted through the revision: canComplete() requires every VerificationRecord to have git_rev==head_rev and status==pass, while records auto-mark 'stale' when git_rev!=HEAD and the tester writes the record during E2E, so the advertised doc-only-doesn't-invalidate-E2E optimization cannot actually reach DONE and the verification-state write self-stales (a recursion proposal-1 solves and proposal-2 does not). The now-committed reviewer lens split routes correctness/security review primarily to the same-family reviewer, aiming the independent cross-vendor check away from the errors most likely to be family-correlated, and the final decision-log→§A migration lands after the last review. Strong base, but the core criterion must be repaired before adoption.",
      "phase": "approach-review",
      "confidence": "medium",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "stopping-criteria",
          "description": "canComplete() (§4.2) requires VerificationRecord git_rev==head_rev ∧ status==pass, but records auto-stale on git_rev!=HEAD and the 'doc-only commit does not invalidate E2E' rule leaves e2e_clean_rev behind head_rev — so DONE is unreachable after any doc-only commit and the optimization is void/contradictory.",
          "required_change": "Express the completion invariant over a code-tree hash (E2E attestation valid iff the diff since the E2E-clean revision is confined to doc_globs), and define which revision the VerificationRecord binds to relative to its own commit."
        },
        {
          "id": "",
          "severity": "major",
          "area": "verification-state",
          "description": "The verification-state SHA recursion is unaddressed: the tester writes the VerificationRecord during E2E (§4.3 step 10), so committing it moves HEAD and self-stales the record.",
          "required_change": "Adopt a metadata-only commit that records the parent executable revision (as proposal-1 does) or write verification-state as a post-completion finalization step."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "review",
          "description": "The committed reviewer lens split assigns correctness/security to the same-family reviewer and business/architecture to the cross-vendor one, reducing independent cross-vendor coverage of the bug classes most likely to be family-correlated.",
          "required_change": "Keep both reviewers on the full unified rubric; treat lens emphasis as advisory rather than a fixed focus assignment."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "knowledge-review",
          "description": "Durable decision-log→§A migration is a DONE side-effect (§4.3 step 14), so the final architecture-rationale write escapes cross-review."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "purpose-lint",
          "description": "symbol_requires_link_one_level_up=false delegates the symbol link to reviewers, a defensible-via-containment but literal deviation from 'linter checks the necessary reference'."
        }
      ],
      "assumptions": [
        "The five-role ModelSet (including orchestrator) is a conscious, acknowledged extension of the task's 'four roles' and not an oversight.",
        "Knowledge sync during REVIEW_FIXING means most durable content is reviewed before DONE, limiting the impact of the deferred final migration."
      ],
      "round": 2,
      "reviewer": "fable51mxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: true
