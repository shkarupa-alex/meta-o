## Framing: what this review can and cannot establish

Before any judgment, the constraints on this review need stating, because they bound what "approval" can mean here. The artifact under review is a *master* spec that explicitly defers its own substance to six not-yet-written subspecs (§2, §22) and to per-project implementations (§9, §10). So I can only assess (a) the master's internal consistency, (b) whether it faithfully discharges the original task's hard constraints, and (c) whether its decomposition plan is actually mechanical rather than a promissory note. I cannot verify the subspecs (they don't exist) nor the per-project QC code (delegated). I read the spec and the original task in full; I did not need the reference docs to find the issues below, because they are internal-consistency and task-conformance defects, not matters of author intent. The spec is honest, unusually disciplined about residual risk, and mostly coherent — but the "implementation-ready" claim is overstated in exactly the places where implementation is hardest, and there are several concrete correctness/consistency holes. That drives the score below.

## Facts & Constraints (White Hat)

Technical feasibility of the named tooling is solid: Ruff (format/lint/cyclomatic), mypy/pyright, pytest, Import Linter (layer/independence contracts), and a `python -m ast`-based purpose/anchor checker are all real and composable behind `make qc`. The Git-blob-OID `snapshot_digest` is a sound idea and correctly decouples attestation from rebase/squash. The `~/.meta-o` external-state model with atomic `write→fsync→rename→fsync(parent)` and a `<readable>--<sha256[:12]>` project key is a reasonable, collision-resistant design, and the `project.json.canonicalPath` equality check before reuse is a genuinely good defense against key collisions.

Two data/interface gaps are load-bearing, though:

- **Undefined referenced types.** The `SessionAdapter` interface (§13) consumes `AdapterCapabilities`, `SpawnRequest`, `DeliveryResult`, `SessionStatus`, `SessionOutput`, `WaitResult`, and `ExpectedState`; §7 uses `DecisionOption`; §11 uses `Evidence`. None are defined anywhere in the master. Acceptance criterion §23 says "нет `TBD` вне Open Questions," yet these are implicit TBDs at the exact seam (backend adapter) the whole methodology rests on.
- **Vendor/family taxonomy is undefined.** The core independence guarantee is `reviewerCrossVendor.vendor != executor.vendor` and `reviewerPrimary.family == executor.family` (§3), but `vendor`/`family` are free-form strings with no authoritative mapping — especially problematic for OpenCode routing to arbitrary providers. Without a canonical taxonomy, the invariant is unenforceable and can silently be violated (e.g., two rebrands of the same base model labeled as different vendors).

## Risks & Failure Modes (Black Hat)

**1. No clean-working-tree binding — false attestation risk (major).** `make qc` runs against the filesystem/working tree; `snapshot_digest` is computed over committed Git blob OIDs (§12). The spec never requires a clean tree (no uncommitted or untracked changes) before QC/review/E2E attest a snapshot. If the executor has uncommitted edits or untracked files that affect build/tests, QC can PASS on a state that the digest does not describe, and a fresh session or clone will not reproduce it. This directly undermines the central promise that "one snapshot provably received QC + two reviews + E2E." A one-line requirement ("tree must be clean; attestations are void otherwise") closes it, but it is currently absent.

**2. Delegated core checks defeat the mechanical guarantee (major).** The hardest and most correctness-sensitive checks — the full import-graph gate (boundary membership, new-SCC/cycle prohibition, lateral-edge and fan-in/out ratchet, §10), the AST purpose checker over all first-party symbols, and knowledge-anchor integrity (§9) — are declared *project-owned*, implemented per project from "best practices," with bundled implementations explicitly rejected (D-039, §9). This collides with the task's explicit demand for a *concrete Python implementation*, and with D-038 (bundled TS→JS helper scripts) in a way readers will find contradictory. The practical failure: every project reimplements SCC detection and AST traversal from prose, so the mechanical uniformity the methodology sells becomes N divergent, likely-buggy implementations. A weak model cannot produce a correct import-graph SCC/ratchet gate from a contract description.

**3. Watchdog cannot demonstrably make progress, and calls a nonexistent operation (major).** §15 says the watchdog "после quota reset вызывает adapter reconcile," but `SessionAdapter` (§13) has no `reconcile` method. More fundamentally: the watchdog must not wake/instruct sessions (local LLM restricted to a closed enum, D-016), must not change the FSM, and must not send a blind `continue`. It is single-writer-excluded from `state.json`. So for an *unattended* run — its stated reason to exist — the concrete mechanism by which it actually advances a stalled orchestrator is never specified. As written it can essentially only notify a human, which contradicts the "unattended" justification (D-015). Separately, the original task explicitly required a **three-way comparison of deterministic script vs. local model vs. hybrid**; the spec presents the chosen hybrid with rationale but does not deliver that comparison.

**4. FSM inconsistencies (major, in aggregate).** `PAUSED_BACKEND_UNCERTAIN` is in the `Phase` enum, cited by D-014 and §13, but **missing from the §6 cross-cutting list**. `REATTEST_INVALIDATED_GATE` is a defined phase but **orphaned** — no routing-table row ever transitions into or out of it, while the actual reattestation behavior is described as loops inside `REVIEW_STABILIZATION`/`E2E_STABILIZATION`. `PAUSED_MISSING_TOOLS`, `PAUSED_MODEL_UNAVAILABLE`, and `PAUSED_ORCHESTRATOR_BUDGET` appear only as enum values: no entry conditions, no `resumeCondition` semantics, despite `PauseState.resumeCondition` existing as a field. An implementer must invent these.

**5. Non-terminating stabilization loop (real liveness risk, disclosed).** Because *any* code/knowledge/purpose change invalidates the other gate (D-033), all confirmed defects incl. minor must be fixed (D-046), both independent reviewers re-review every new snapshot, and cycles are explicitly unbounded with no auto-escalation (D-048/D-071), two conscientious reviewers can each surface fresh minor findings on each new snapshot indefinitely. There is no diminishing-returns stop condition; for an unattended run this is a genuine non-termination hazard, not merely expensive.

**6. Orchestrator split-brain (minor–major).** "Единственный writer — текущая orchestrator generation" is asserted, but no fencing protocol is specified: how `orchestratorGeneration` is bumped, and how a newly-spawned orchestrator invalidates a still-alive prior one. Atomic rename gives crash-consistency, not mutual exclusion. Two live orchestrators (e.g., user resumes while a paused-but-alive session exists) could both write.

**7. Guarded metadata commit can ship a broken `e2e.json` (minor).** `e2e.json` is excluded from the digest (correct, avoids recursion), but it *is* a QC input (schema + business-link checks, §9/§10). The completion guard only recomputes the digest; it does not re-run QC. So a corrupt/schema-invalid `e2e.json` introduced by the metadata commit passes completion even though QC would have failed it.

**8. E2E selection completeness is semantic-only (minor).** Selected scenarios = `always_required` ∪ (business_links/tags touched by spec/diff), chosen by the tester and merely *checked* by reviewers. A regression in an unlinked/untagged scenario is undetectable mechanically; completion requires only *selected* scenarios to pass. This is a defensible scope choice but a real coverage hole worth naming.

## Strengths & Benefits (Yellow Hat)

The spec is strong where it counts. The immutable spec-blob + sha256 oracle (D-004) correctly solves "acceptance oracle survives tracked-spec retirement." The `snapshot_digest` design (D-031/D-032) is the right fix for rebase/squash instability and self-referential-commit recursion. The refusal to build a runtime/queue/dedup ledger, plus the executable capability suite, `PAUSED_BACKEND_UNCERTAIN`, and explicit "no blind resend" (D-011–D-014), together form an honest capability gate instead of a fake exactly-once guarantee — this is more mature than most orchestration specs. Reviewer isolation (no cross-visibility of findings/reasoning, D-006), the defect-vs-taste classification with "all real defects fixed" (D-046), and the graph gate targeting coupling rather than just LOC (D-042) are all well-judged. The §18 dissent and §19 pre-mortem sections do real adversarial work and disclose the sharpest risks rather than hiding them. The "no planned truth / `KnowledgeImpactPlan` instead of `§B-TODO`" decision (D-023/D-024) is a clean resolution of the projection hypothesis the task asked to evaluate rather than assume.

## Alternatives & Creative Ideas (Green Hat)

- **Ship a reference QC implementation as a versioned, opt-in package**, breaking the D-038/D-039 deadlock: the skill provides a canonical Python `meta-o-qc` (graph gate + AST purpose + anchor integrity) that projects *invoke from their Makefile* but do not fork. This preserves "toolchain lives in the project's Makefile" (the Makefile still calls it) while eliminating N divergent buggy reimplementations. Cost: the skill now owns language-specific code it said it wouldn't; benefit: the mechanical guarantee becomes real and weak-model-executable. This crosses a stated boundary (D-039) but objectively deserves consideration, as the critique requirement demands.
- **Add a bounded convergence rule** for the review↔E2E loop: after K consecutive rounds yielding only new `minor`/`taste` findings with no `blocker`/`major`, auto-notify the user (not auto-complete). Preserves "cycles run as long as needed" while removing the non-termination hazard. Alternative that breaks D-071: escalate churn automatically after a threshold — violates the user's hard "no auto-escalation," but is worth flagging as the safer default for unattended operation.
- **Bind attestation to a real commit + clean-tree assertion**, and define the digest over the *committed* tree only after asserting `git status --porcelain` is empty. One rule, closes Black-Hat #1.
- **Give the watchdog a single legitimate action**: spawn a fresh *orchestrator* session (not a worker) with the current `state.json`, gated by the single-instance lock and the model-set confirmation being pre-approved for auto-recovery (D-007 already permits reuse without re-asking). This makes "unattended" true without letting a probabilistic model instruct workers.

## Completeness & Process (Blue Hat)

Structurally the master is complete and well-sectioned, but two deliverables promised by the original task are not present: the **five/six implementation-ready subspecs** (only the master + §22 decomposition plan exist), and the **watchdog three-way comparison**. Acceptance criterion §23 ("каждый implementation task выводится из одной из шести подспек") is therefore currently unverifiable — it references artifacts that don't exist. The QC-vs-pre-commit-vs-pre-push "comparison" the task requested is present only as a role-assignment table (§10), not a trade-off analysis. `baseRevision` selection semantics and the storage/format of the *graph* baseline (distinct from `.quality/code-health-baseline.json`, which only covers LOC/nesting) are unspecified. The state-migration helper (§5) is named but never contracted.

## Traceability

The Decision Ledger exists (D-001…D-071) and coverage is high. Flags: **D-014**'s `PAUSED_BACKEND_UNCERTAIN` is adopted and appears in §13 but is **absent from the §6 FSM cross-cutting list** — a partial representation of an adopted decision. **D-034** ("knowledge-only changes preserve E2E," rejected) is not explicitly listed in §17 Rejected (only implied via D-033). **D-044** ("risk-based purpose," rejected-under-constraints) surfaces in §18 dissent as an alternative rather than in §17. Several adopted decisions about mechanical checks (D-037/D-042) point to sections that describe *contracts* rather than the *implementation* the decision implies, which is a traceability-vs-substance gap even though the ledger entry technically maps to a section.

## Decomposition Readiness

Partial. Lifecycle/state/FSM/knowledge/review sections are cut-ready. But an implementer of `40-local-qc-python.md` must *design* the graph gate, AST purpose checker, and anchor-integrity checks from prose ("best practices"), not merely execute — that is architecture-during-implementation. The orphaned `REATTEST_INVALIDATED_GATE`, undefined `PAUSED_*` entry/resume conditions, undefined `baseRevision` selection, and undefined graph-baseline format each force a task implementer to make decisions the master claims are settled.

## Weak-Model Executability

Fails in the load-bearing spots. A less capable model cannot correctly implement SCC/cycle detection + fan-in/out ratchet + boundary membership from a contract paragraph, nor the all-symbol AST purpose walker (private/nested/async/property/dunder, with formal exception globs) without guessing. `adapter reconcile` is uncallable (undefined). The vendor/family invariant is unenforceable without a taxonomy the model would have to invent. These are precisely the "described in prose without concrete strategy" cases the instructions flag.

## Contract Completeness

Multiple referenced interfaces are undefined in the master: `AdapterCapabilities`, `SpawnRequest`, `DeliveryResult`, `SessionStatus`, `SessionOutput`, `WaitResult`, `ExpectedState`, `DecisionOption`, `Evidence`, and the `reconcile` operation. `Finding` allows contradictory `severity: "blocker"` + `classification: "taste"` (blocker-severity taste is non-blocking per §11, which is incoherent). `FeatureSpecRef` permits nonsensical combos (`kind: "url"` + `disposition: "delete_after_sync"`) with no validation. The 4 KiB handoff limit has no defined overflow/truncation behavior. These are TBDs outside Open Questions, contradicting §23.

## Bottom line

This is a well-above-average, intellectually honest spec that I could not dismiss on architecture — but I *could* break it: false-attestation via unspecified working-tree state, a watchdog that calls a nonexistent op and can't demonstrably progress an unattended run, an orphaned FSM phase plus a missing pause state, undefined core contracts, and — most importantly — the mechanical guarantees delegated to per-project prose exactly where the task demanded a concrete Python implementation. None require a redesign; all are addressable. That places it below the 8 threshold. I would not adopt as-is until the blocking findings are resolved.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "A disciplined, honest master-spec with a genuinely good state/snapshot/capability-gate design and strong adversarial self-critique, but its 'implementation-ready' claim is overstated where implementation is hardest. The core mechanical checks (import-graph SCC/cycle/fan ratchet, all-symbol AST purpose, anchor integrity) are delegated to per-project prose despite the task demanding a concrete Python implementation and despite D-038/D-039 tension; there is no clean-working-tree requirement binding QC/digest/review/E2E to one committed state (false-attestation risk); the watchdog calls a nonexistent `reconcile` op and has no concrete mechanism to advance an unattended run; the FSM omits PAUSED_BACKEND_UNCERTAIN from §6, orphans REATTEST_INVALIDATED_GATE, and leaves several PAUSED_* states without entry/resume rules; many referenced interfaces (adapter types, DecisionOption, Evidence) are undefined; and the task-required three-way watchdog comparison and the five subspecs are not delivered. All findings are fixable without redesign, so the design is adoptable once the blocking gaps close.",
      "phase": "spec-review",
      "confidence": "medium",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "correctness/attestation",
          "description": "No clean-working-tree requirement. make qc runs on the working tree while snapshot_digest is computed from committed Git blob OIDs; uncommitted/untracked files can make QC/review/E2E attest a state the digest does not describe, defeating the single-snapshot completion guarantee.",
          "required_change": "Require an empty `git status --porcelain` (no uncommitted or untracked files) as a precondition for computing snapshot_digest and for any QC/review/E2E attestation; void attestations otherwise."
        },
        {
          "id": "",
          "severity": "major",
          "area": "decomposition/weak-model",
          "description": "The import-graph gate (boundary membership, SCC/cycle prohibition, edge/fan ratchet), the all-symbol AST purpose checker, and knowledge-anchor integrity checks are declared project-owned and described only as contracts/best-practices (§9,§10) with bundled implementations rejected (D-039). This contradicts the task's demand for a concrete Python implementation, guarantees divergent per-project reimplementations, and cannot be executed by a weak model from prose.",
          "required_change": "Provide a canonical, versioned reference implementation (invoked from the project Makefile) for the graph gate, AST purpose check, and anchor integrity, or move these into 40-local-qc-python.md as complete, runnable code rather than contracts."
        },
        {
          "id": "",
          "severity": "major",
          "area": "watchdog/orchestration",
          "description": "§15 calls `adapter reconcile`, which is absent from the SessionAdapter interface (§13). More fundamentally, the watchdog may not wake sessions, change the FSM, or send continue, and is excluded from writing state.json, so no concrete mechanism advances an unattended stalled run — contradicting its stated purpose. The task-required comparison of deterministic vs local-model vs hybrid is also not delivered.",
          "required_change": "Define the reconcile operation (or remove it), specify the exact action the watchdog takes to make progress unattended (e.g., spawn a fresh orchestrator under the pre-approved model set and single-instance lock), and add the three-way watchdog comparison the task requires."
        },
        {
          "id": "",
          "severity": "major",
          "area": "FSM/consistency",
          "description": "PAUSED_BACKEND_UNCERTAIN is in the Phase enum and §13 but missing from the §6 cross-cutting list; REATTEST_INVALIDATED_GATE is a defined phase with no routing-table transition into or out of it; PAUSED_MISSING_TOOLS/PAUSED_MODEL_UNAVAILABLE/PAUSED_ORCHESTRATOR_BUDGET have no defined entry conditions or resumeCondition semantics.",
          "required_change": "Reconcile §6 with the Phase enum, define entry/exit routing and resumeCondition for every PAUSED_* and STOPPED_* state, and either wire REATTEST_INVALIDATED_GATE into the routing table or fold it into the stabilization loops."
        },
        {
          "id": "",
          "severity": "major",
          "area": "contract-completeness",
          "description": "Referenced types are undefined in the master: AdapterCapabilities, SpawnRequest, DeliveryResult, SessionStatus, SessionOutput, WaitResult, ExpectedState, DecisionOption, Evidence; the reconcile method; vendor/family taxonomy for the cross-vendor invariant. Finding also permits incoherent severity=blocker + classification=taste. These are implicit TBDs outside Open Questions, violating acceptance criterion §23.",
          "required_change": "Define all referenced interfaces (at least stub schemas), specify an authoritative vendor/family taxonomy and how ModelRef fields are assigned/validated, and constrain Finding so classification/severity combinations are coherent."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "liveness",
          "description": "The review<->E2E stabilization loop is unbounded (D-048/D-071) with any change invalidating the other gate (D-033) and all minor defects requiring fixes; two independent reviewers can generate fresh minor findings per snapshot indefinitely, with no diminishing-returns stop for unattended runs.",
          "required_change": "Add a bounded convergence rule (e.g., after K rounds yielding only minor/taste, notify the user) without auto-completing."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "concurrency",
          "description": "Single-writer claim for state.json lacks a fencing/lock protocol; two live orchestrator sessions could both write.",
          "required_change": "Specify generation-fencing (bump-and-check) or a lock file to guarantee single active orchestrator."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "completion-guard",
          "description": "e2e.json is excluded from the digest but is a QC input; the completion guard recomputes the digest but does not re-run QC, so a schema-invalid e2e.json from the metadata commit can pass completion.",
          "required_change": "Re-validate e2e.json schema (or re-run the relevant QC subset) as part of the completion guard."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "coverage",
          "description": "E2E scenario selection completeness is a semantic reviewer judgment only; regressions in unlinked/untagged scenarios are mechanically undetectable and completion requires only selected scenarios to pass.",
          "required_change": "Add a mechanical heuristic or require justification when a diff touches modules without any linked scenario."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "clarity",
          "description": "Relationship between `make e2e` (target list) and the heavy E2E tester session is fuzzy; unclear whether make e2e is inside make qc and how automated E2E results relate to e2e.json.",
          "required_change": "Pin whether make e2e is part of make qc, and how automated vs tester-driven E2E results populate e2e.json."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "spec-input",
          "description": "FeatureSpecRef kind/disposition combinations (e.g., url + delete_after_sync) are unvalidated; the 4 KiB handoff overflow behavior is undefined.",
          "required_change": "Add validation rules for kind/disposition combinations and define handoff overflow behavior."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "decomposition",
          "description": "baseRevision selection semantics and the storage/format of the graph/dependency baseline (distinct from code-health-baseline.json) are unspecified; the state-migration helper is named but not contracted.",
          "required_change": "Define baseRevision derivation, the graph baseline artifact/format, and the migration helper contract."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "traceability",
          "description": "D-034 (rejected) is not explicitly in §17; D-044 appears only as a dissent alternative; D-014's PAUSED_BACKEND_UNCERTAIN is not represented in §6.",
          "required_change": "List all rejected decisions in §17 and represent all adopted FSM states consistently across §6 and the Phase enum."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "deliverable",
          "description": "The five/six implementation-ready subspecs are not delivered (only master + §22 plan), so §23 acceptance criteria referencing them are currently unverifiable; QC/pre-commit/pre-push 'comparison' is a role table, not a trade-off analysis.",
          "required_change": "Deliver the subspecs (or mark them as the next phase) and provide the requested placement trade-off analysis."
        }
      ],
      "assumptions": [
        "This review targets the master-spec only; the six subspecs and per-project QC code are out of scope because they are not present in the artifact.",
        "The named council models (GPT-5.6 Sol, Fable 5, Kimi K3) and their verdicts are taken as provenance metadata, not independently verifiable claims.",
        "I did not read the reference docs under docs/references because every finding is grounded in internal consistency or in the quoted original-task constraints.",
        "would_adopt is set false to signal the listed blocking findings must be resolved first; the underlying architecture is otherwise adoptable."
      ],
      "round": 1,
      "reviewer": "fable51mxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
