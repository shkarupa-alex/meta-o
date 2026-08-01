## Framing and what this round can establish

Before any verdict, the bounds on this review need stating, because they shape what a high score can mean. This is the third iteration (R2) of a spec that has already survived two rounds of council critique, so the honest test is not "is it perfect" but "can I still break the core, and did the new machinery introduce fresh holes." The artifact remains the *master* spec plus a decomposition plan (§36) and a genuinely strong executable conformance suite (§30); the six subspecs still do not exist, and the graph/purpose/materialization QC checks are still delegated to per-project implementation, so I can verify the orchestration/identity/locking/finalization contracts and their test coverage but cannot verify the subspecs or the project-owned checkers. Backend correctness is deferred to a capability suite the spec now makes release-blocking (§24, D-090). With that framing: my conclusion up front is that R2 closes the two substantive R1 findings (delivery of `R` to the user, and shareability of verification state), and the core correctness machinery — exact-commit identity, lease fencing with PID-death proof, write-ahead effect intents, fresh-worktree gates, crash-safe finalization — held up against my attempts to break it, now backed by concrete conformance cases. The findings I still have are real but concentrated at the margins: two task-mandated deliverables remain absent (and one violates the spec's own acceptance criteria), the heartbeat/deadline-enforcement locus is unspecified, several referenced types were dropped, and the most error-prone components (QC checkers) have neither concrete algorithms nor conformance coverage. That is enough to keep it out of "flawless" territory but the core itself is now hard to break.

## Facts & Constraints (White Hat)

The new mechanisms are technically sound and mostly well-chosen. Exact `commitOid` identity with `snapshotDigest` + `sourceMaterializationDigest` guards (§7.2/§7.3) correctly extends reproducibility to submodules and LFS objects, which a bare tree OID does not capture — a real improvement for brownfield repos. RFC 8785 JCS canonicalization (§8, D-084) is a defensible, standards-based choice for cross-implementation digest stability, and forbidding floating point + requiring bytewise-sorted, dedup'd collections makes `planDigest` deterministic. The lease-lock design (§6.2) is careful: `pid` + `processStartToken` + `hostId` defeats PID reuse, and requiring *provable process death* (not merely lease expiry) before takeover means a live-but-idle owner cannot be stolen — this is what makes the fencing correct rather than merely optimistic. The `CANDIDATE_REF_DRIFT`/`REVISION_DRIFT`/`MATERIALIZATION_MISMATCH` failure codes plus pre/post gate proof (§7.4) close the mutable-checkout hole cleanly. The `active-run.json` marker + linear-history requirement (§6.1, §7.1) is a reasonable serialization primitive. And §30's conformance cases (STATE/LOCK/EFFECT/REV/PLAN/GATE/FINAL/SEC) turn many prose invariants into executable acceptance tests — a large feasibility and decomposition win.

Two feasibility limits persist. First, **the hardest QC components remain project-owned prose**: the import-graph gate (SCC/cycle/boundary/fan ratchet), AST purpose/anchor checks, and `sourceMaterializationDigest` computation of "declared generated source inputs" (§7.3 — how inputs are declared and hashed is never defined) are contracts, not algorithms, and §30's conformance suite conspicuously contains *no* cases for QC-checker correctness (e.g., "graph gate detects a new SCC," "purpose checker flags a missing dunder docstring"). The most error-prone code is the least specified and least tested. Second, **referenced types are undefined and several regressed from R1**: `ModelRef`, `PauseState`, `DecisionRecord`, `DecisionOption`, `Evidence`, `FindingSetRef`, `E2EScenarioResult` are all used in R2 schemas but no longer defined, and the adapter types (`AdapterCapabilities`, `SpawnRequest`, `DeliveryResult`, `SessionStatus`, `SessionOutput`, `EffectStatus`, `ExpectedState`, `WaitResult`, `StopResult`, `EffectContext`) remain undefined. §37 claims "no TBD outside Open Questions," which these technically violate even if deferred to subspecs.

## Risks & Failure Modes (Black Hat)

**1. Heartbeat/lease vs. no-daemon vs. transient orchestrator — enforcement locus unspecified (major, architecture/clarity).** §6.2 requires a 5s heartbeat on a 30s lease, and §14 defines stall/turn deadlines (30 min worker turn, 30 min QC/E2E). But the spec never states whether the orchestrator is a resident process or a per-turn helper that exits, and D-011 forbids a daemon. If the orchestrator is transient, nothing emits heartbeats or enforces the stall deadlines while a 30-minute worker turn runs, so — with the watchdog being *optional* — automatic stall detection cannot happen, quietly undercutting the earlier "liveness must not depend on the optional watchdog" (D-014). If instead a resident process holds the lease and enforces deadlines, that is a daemon in tension with D-011. The correctness of *takeover* is saved by the PID-death requirement, so this is not a split-brain break; but the enforcement agent for heartbeats and deadlines is a genuine unspecified design decision an implementer must invent.

**2. Reviewer terminal-timeout semantics are ambiguous (minor–moderate).** §19 says the executor does not begin fixes "до результата второго либо terminal timeout." Completion requires *both* reviewers PASS on the final `(R,P)`. If reviewer B hits a terminal timeout while A passed, "proceed after timeout" cannot mean "proceed without B" (B's PASS would be permanently missing), so it must mean "replace B and retry" (§12) — but the wording reads as the former. This needs to be pinned, or a stalled reviewer can be read as a path that completes with only one review.

**3. Empty-E2E-selection deadlock persists (minor).** §20/PLAN-04 forbid an empty selected set, and there is no requirement that a project define at least one `always_required` scenario. A legitimate internal refactor touching no `§B`-linked path and no tagged code, in a project with zero always-required scenarios, cannot produce a non-empty selection and cannot complete. Either mandate ≥1 always-required scenario, or provide a reviewer-approved "no applicable E2E" justification path.

**4. Permanent block on unpinnable external dependencies (minor, by design).** `E2E_BLOCKED → PAUSED_EXTERNAL` (§26) plus §21's rule that an unpinnable acceptance-affecting dependency is `blocked` means any always-required scenario with a genuinely unpinnable external dependency can never complete. This is *correct* (you cannot attest what you cannot reproduce) but is a practical dead-end worth calling out for adopters.

**5. Single-active-run rationale overclaims (minor).** D-081/§6.1 serialize mutating runs per `project-key`, but `project-key` derives from the local `realpath`, so the guarantee is per-machine-per-checkout only. The stated rationale — "prevents divergent knowledge/QC state on diverging branches" — is not achieved across teammates' machines (the task's whole point is that cross-user divergence is resolved by ordinary Git/PR, not locks). The mechanism is harmless, but it also newly forbids a developer running two independent features on one checkout, which the task never required — a mild, unjustified scope addition with a misleading rationale.

**6. Secret redaction mechanism undefined (minor).** §25/SEC-03 require redacting/rejecting credential-like fields from evidence and receipts, but no detection heuristic is specified. The fixed receipt schema carries no free-form fields, so the receipt is likely safe; temporary evidence is the real exposure, and "how a secret is detected" is left to the implementer.

## Strengths & Benefits (Yellow Hat)

R2 is the strongest version by a clear margin. The exact-commit + separate candidate-ref design (D-072/D-083) resolves the R1 "how does the user get `R`" hole: the `meta-o/<run-id>` branch persists for user-driven push/PR and the primary checkout is never touched (REV-05). The annotated verification tag mirroring the receipt (§22.2, D-088) directly answers my R1 concern that verification state was unshareable — it now has a Git-associated, portable form pointing at exact `R`, with idempotent re-completion and `ATTESTATION_TAG_CONFLICT` guarding against divergent content. The write-ahead `EffectIntent` with `APPLIED/NOT_APPLIED/UNKNOWN` classification and "never blind resend" (§11, EFFECT-01..06) is a correct minimal crash journal that stays honest about not being a queue. The typed failure taxonomy (§26, D-091) with "unknown failure never becomes generic retry" is exactly the kind of concrete routing a weak model can execute. The finalization order (§22.3) with receipt-before-cleanup and idempotent crash recovery (FINAL-01..06) is crash-safe. And §30's conformance suite plus §36's per-subspec contracts make the decomposition genuinely mechanical for the parts they cover. The spec is also candid in §32 about the costs it accepted (exact-commit rigidity, deleted forensic evidence, possible temporary lack of a usable backend).

## Alternatives & Creative Ideas (Green Hat)

- **For finding #1**, specify the orchestrator process model explicitly: either (a) define a minimal per-turn heartbeat with a lease longer than the max worker turn (so idle gaps between transient invocations never expire mid-run), or (b) carve a narrow exception in D-011 for a heartbeat-only supervisor thread that is not an orchestration daemon. Also state that, without the watchdog, stall deadlines are enforced only at the next orchestrator activation — so users know unattended stall detection requires the (optional) watchdog.
- **For finding #3**, require every project's registry to contain at least one `always_required` smoke-level E2E scenario; this makes empty selection structurally impossible and gives even pure refactors a behavioral floor.
- **For the persistent QC-checker gap**, ship the graph/purpose/materialization checkers as a *versioned reference implementation invoked from the Makefile* (not forked per project) — this reconciles D-039's "QC belongs to the project" (the project still calls it via `make qc`) with weak-model executability and uniform correctness, and lets §30 add conformance cases for the checkers themselves. This crosses D-039's "no bundled QC" line and therefore deserves explicit cost/benefit treatment rather than silent rejection.
- **For finding #5**, drop the per-checkout serialization to per-*spec* (allow concurrent runs whose changed-path manifests and knowledge sections are disjoint), or keep serialization but correct the rationale to "same-machine work-tree safety," not "cross-branch divergence prevention."

## Completeness & Process (Blue Hat)

Two task-mandated deliverables are still missing. The task explicitly required **comparing check placement across QC / pre-commit / pre-push**; R2's §18 has no such comparison and the words "pre-commit"/"pre-push" appear nowhere in the body, even though **D-036 ("Pre-commit optional/fast") is marked adopted** — a direct violation of §37's own acceptance criterion that all adopted decisions be traceable into normative sections. The task also required **comparing deterministic script vs. local model vs. hybrid** for the watchdog; §28/D-016 still assert the deterministic design without the comparative analysis. These are omissions, not architectural flaws, but they are objective gaps against both the task and the spec's self-declared readiness bar.

## Traceability

The Decision Ledger exists (D-001…D-092). All twelve R2 decisions (D-081–D-092) are represented in the body (§6, §7, §8/§9/§22, §12, §7.3, §13/§18, §22.2, §21, §24, §26, §23) — good discipline. **Confirmed persistent failure: D-036 (adopted) has no representation in any normative section.** Minor gaps: D-034 (rejected: knowledge change preserves E2E) and D-044 (rejected: risk-based purpose) are not explicitly listed in §31's rejected list (only implied via D-033 and §32.1). D-053 is now adequately represented (§7.1/§22.2), an improvement over R1.

## Decomposition Readiness

Substantially improved and, for the covered areas, genuinely mechanical: the FSM table (§13.1), loop dispatcher (§13.2), failure taxonomy (§26), finalization order (§22.3), and the §30 conformance IDs give implementers execute-not-decide targets, and §36 ties each subspec to conformance cases. The remaining "figure out the approach" spots are: the QC-checker internals (graph/purpose/materialization algorithms, §17/§18.1 — contracts only, no conformance cases); the orchestrator process/heartbeat/deadline-enforcement model (#1); the generated-source-input declaration and digest scheme (§7.3); and the secret-redaction heuristic (§25).

## Weak-Model Executability

For the orchestration, state, locking, effect, git-identity, and finalization layers, a weak model could follow R2 with little guessing — ordered step lists, explicit schemas, digest formulas, and conformance cases are present. The exceptions are the same as decomposition: a less capable model cannot implement the import-graph SCC/cycle/fan ratchet, the all-symbol AST purpose walker, or `sourceMaterializationDigest` of generated inputs from a contract paragraph without conformance cases to check against; cannot resolve the vendor/family cross-vendor invariant without a defined taxonomy (still absent); and cannot implement the referenced-but-undefined types without the missing subspecs.

## Contract Completeness

State/candidate/plan/finding/result/receipt schemas are specific, digest-bound, and now include a state checksum and receipt digest — strong. The §14 deadlines, §20 registry regex constraints, and §26 taxonomy are concrete. Gaps: the adapter-facing types and several core types (`ModelRef`, `PauseState`, `DecisionRecord`, `DecisionOption`, `Evidence`, `FindingSetRef`, `E2EScenarioResult`) are referenced without definitions in the master; `resultDigest`/`evidenceDigest` computation is not defined; the generated-source-input declaration format is unspecified; and the secret-detection mechanism behind SEC-03 is unspecified. None are fatal, but each is a concrete unfilled contract that §37 claims not to have.

## Verdict rationale

I actively tried to break the core and could not: the identity, lease-fencing (via PID-death proof), effect-intent crash windows, gate isolation, and finalization ordering all survived scrutiny and are now backed by executable conformance cases, and the two substantive R1 defects are genuinely fixed. The findings that remain are real but are completeness, task-conformance, and clarity gaps — the unspecified heartbeat/deadline-enforcement locus, two missing task deliverables (one an acceptance-criteria violation), dropped type definitions, and the enduring under-specification of the project-owned QC checkers with no conformance coverage — rather than correctness breaks in the machinery. All are additive to fix without redesign. That combination lands it at 8: the core is hard to break, and the blocking items are documentation-level completions plus one process-model clarification, so it is adoptable pending those.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 8,
      "would_adopt": true,
      "summary": "R2 is the strongest iteration and the core correctness machinery held up under active attempts to break it: exact-commit identity with snapshot + source-materialization digests (LFS/submodules), lease locking whose takeover requires provable process death (defeating split-brain and PID reuse), write-ahead EffectIntent with APPLIED/NOT_APPLIED/UNKNOWN and no blind resend, fresh-worktree gate proof, crash-safe finalization, a typed failure taxonomy, and — decisively — an executable conformance suite (§30) plus per-subspec contracts (§36) that make the covered areas mechanically decomposable. It also fixes the two substantive R1 defects: the candidate branch now persists for user push/PR with the primary checkout untouched, and verification state is mirrored into a portable annotated Git tag. It falls short of a perfect score because of gaps at the margins, not correctness breaks: (1) the orchestrator process model is unspecified, so who emits the 5s heartbeat and enforces the §14 stall deadlines during long unattended worker turns is undefined and sits in tension with the no-daemon rule and the optional watchdog; (2) the task-required QC/pre-commit/pre-push placement comparison is absent and its adopted ledger entry D-036 appears nowhere in the body, violating the spec's own acceptance criterion; (3) the task-required deterministic/local-model/hybrid watchdog comparison is still not delivered; (4) the most error-prone components (import-graph gate, AST purpose checker, generated-source materialization) remain project-owned prose with no conformance cases; and (5) several referenced types were dropped and remain undefined. All are additive fixes, so the architecture is adoptable pending them.",
      "phase": "spec-review",
      "confidence": "medium",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "orchestrator-liveness",
          "description": "§6.2 mandates a 5s heartbeat on a 30s lease and §14 defines stall/turn/QC/E2E deadlines, but the spec never states whether the orchestrator is a resident process or a transient per-turn helper, nor who emits heartbeats or enforces deadlines during a 30-minute worker turn. With the watchdog optional and D-011 forbidding a daemon, either automatic stall detection cannot occur unattended (undercutting D-014) or a resident heartbeat process is required (tension with D-011). Takeover correctness is preserved by the PID-death requirement, but the enforcement agent is an unresolved design decision.",
          "required_change": "Specify the orchestrator process model: define who maintains the heartbeat and enforces deadlines (e.g., a lease longer than the max worker turn for transient orchestrators, or a narrowly-scoped heartbeat supervisor exempted from D-011), and state explicitly that without the watchdog, stall deadlines are enforced only at next orchestrator activation."
        },
        {
          "id": "",
          "severity": "major",
          "area": "traceability/task-conformance",
          "description": "D-036 (pre-commit optional/fast) is marked adopted but appears in no normative section, and the task-required comparison of check placement across QC/pre-commit/pre-push is entirely absent. This violates §37 ('all adopted decisions traceable into normative sections') and a direct task requirement.",
          "required_change": "Add a normative QC/pre-commit/pre-push (and CI-dup) placement section with a trade-off comparison, satisfying D-036 and the task."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "watchdog/task-conformance",
          "description": "The task explicitly required comparing deterministic script vs. local model vs. hybrid for the watchdog; §28/D-016 assert the chosen deterministic + closed-enum-classifier design without that comparison.",
          "required_change": "Add the three-way comparison (deterministic / local model / hybrid) with costs and consequences, then state the choice."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "qc-checker-verification",
          "description": "The import-graph gate (SCC/cycle/boundary/fan ratchet), AST purpose/anchor checks, and sourceMaterializationDigest of 'declared generated source inputs' (§7.3) are specified only as contracts, and §30's conformance suite contains no cases for their correctness. The most error-prone, weak-model-hostile components are the least specified and untested.",
          "required_change": "Provide concrete algorithms (or a versioned reference implementation invoked from the Makefile) and add conformance cases for graph-gate, purpose-coverage, and materialization-digest behavior; define the generated-source-input declaration and digest scheme."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "contract-completeness",
          "description": "ModelRef, PauseState, DecisionRecord, DecisionOption, Evidence, FindingSetRef, E2EScenarioResult (several present in R1) and the adapter types (AdapterCapabilities, SpawnRequest, DeliveryResult, SessionStatus, SessionOutput, EffectStatus, ExpectedState, WaitResult, StopResult, EffectContext) are referenced but undefined in the master, and resultDigest/evidenceDigest computation is unspecified. §37 claims no TBD outside Open Questions.",
          "required_change": "Define (or explicitly scope to a named subspec) all referenced types and the result/evidence digest computations."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "review-semantics",
          "description": "§19's 'executor does not begin fixes until the second reviewer result or terminal timeout' is ambiguous: completion requires both reviewers PASS, so a reviewer timeout must mean replace-and-retry, not proceed-without, but the wording reads as the latter.",
          "required_change": "State that a reviewer terminal timeout triggers session replacement and re-review, never completion with a single review."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "e2e-selection",
          "description": "§20/PLAN-04 forbid an empty selected set with no requirement that a project define any always_required scenario, so a refactor touching no linked/tagged code in such a project can never complete.",
          "required_change": "Require at least one always_required scenario, or add a reviewer-approved 'no applicable E2E' justification path."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "scope/rationale",
          "description": "D-081/§6.1 serialize mutating runs per project-key, but project-key is per-machine realpath, so the 'prevents divergent knowledge/QC state on diverging branches' rationale is not achieved across teammates; it also newly forbids two independent features on one checkout, which the task never required.",
          "required_change": "Correct the rationale to same-machine work-tree safety and consider allowing concurrent runs with disjoint changed-path manifests."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "security",
          "description": "§25/SEC-03 require redacting credential-like fields from evidence and receipts but specify no detection heuristic; temporary evidence is the real exposure.",
          "required_change": "Define the secret-detection/redaction mechanism for evidence storage."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "model-set-invariant",
          "description": "The cross-vendor invariant relies on free-form vendor/family strings with no authoritative taxonomy, so it is unenforceable and mislabeling silently defeats independence (unchanged across rounds).",
          "required_change": "Define an authoritative vendor/family taxonomy and how ModelRef fields are assigned and validated."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "liveness/cost",
          "description": "Unbounded review<->E2E cycles (D-071) now also require QC + smoke per candidate, raising per-iteration cost with no convergence guarantee; accepted by the user but a real cost/liveness risk for unattended runs.",
          "required_change": "Add a diminishing-returns user notification after K cycles of only minor/taste findings, without auto-completing."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "backend-viability",
          "description": "The completion-critical capability bar (§24) may exclude both named backends; now explicitly release-blocking (D-090) and acknowledged (§35), so honestly handled, but the practical risk of temporarily having no usable backend remains.",
          "required_change": "Schedule an early capability spike against real Herdr/Omnigent versions and define a reference/shim backend that provably passes the suite."
        }
      ],
      "assumptions": [
        "This review targets the master spec only; the six subspecs and per-project QC checkers are out of scope because they are not present in the artifact.",
        "The named council models and their R1/R2 verdicts are treated as provenance, not independently verifiable claims.",
        "I read the spec and original task in full and did not need the reference docs, since every finding is grounded in internal consistency or the quoted task constraints.",
        "would_adopt is set true because the core architecture survived stress-testing and the blocking findings are additive completions/clarifications rather than redesigns.",
        "I assumed the orchestrator is intended to be a transient per-turn helper (not a resident daemon), which is why the heartbeat/deadline-enforcement locus is flagged as unspecified rather than contradictory."
      ],
      "round": 3,
      "reviewer": "fable51mxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 8
would_adopt: true
