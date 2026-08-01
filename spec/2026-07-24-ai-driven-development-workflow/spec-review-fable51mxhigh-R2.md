## Framing and what this round can establish

This is a substantially revised (R1) specification, and the fair way to judge it is against both the original task and the specific defects a first-pass review would have raised. Before any verdict, the constraints that bound this review need stating: the artifact is still only the *master* spec plus a decomposition plan (§27), so I can verify internal consistency and task-conformance but cannot verify the six subspecs (they do not exist yet); the correctness of the crash-safety and identity mechanisms depends on backend capabilities that the spec itself defers to an executable suite, so I can assess whether the *contract* is sound but not whether any real backend satisfies it; and several of the strongest requirements (effect correlation, worktree-per-gate) are new, so the interesting question is whether they introduced fresh gaps. My conclusion up front so the reasoning below is anchored: this is a markedly stronger document than a typical first draft — the exact-commit identity, write-ahead `EffectIntent`, fresh-worktree-per-gate, and capability gate close most of the holes one would expect — but I did find real breakage: the mechanism that delivers commit `R` back to the user is unspecified, verification state was moved somewhere that silently violates the task's shared-knowledge intent, a task-required comparison (and its adopted ledger entry) has disappeared from the body, and the correctness bar may exceed what the only two named backends provide. That puts it just below the "couldn't break it" line.

## Facts & Constraints (White Hat)

The core identity design is now technically sound. Deriving `planDigest` from `candidateTreeOid` (not the commit) and then binding that digest into the commit trailer (§6.2) genuinely avoids the circular-hash problem, because the tree is fixed before the plan is hashed and the commit is created last. The `snapshotDigest` formula over `git ls-tree -r` with `path/mode/object-type/object-oid` correctly handles symlinks and submodule gitlinks (ls-tree does not recurse into submodules, so gitlink pins are captured as commit OIDs) and is reproducible. Requiring a clean tree (§6.1) and a fresh detached worktree with pre/post revision proof per gate (§6.3) closes the working-tree/TOCTOU hole cleanly. The atomic-write + `owner.lock` + `stateVersion` CAS protocol (§8) and the `write-ahead intent → fsync → call → acknowledge → atomic transition` sequence (§9) are a correct minimal crash journal, and `flock` semantics make the "lock held by dead process" case self-healing.

Two feasibility limits remain. First, **undefined referenced types**: `AdapterCapabilities`, `SpawnRequest`, `DeliveryResult`, `SessionStatus`, `SessionOutput`, `EffectStatus`, `ExpectedState`, `WaitResult` (§18), `DecisionOption` (§11), and `Evidence` (§15) are used but never defined; §27 assigns them to `20-orchestration-and-skills.md`/`30-review-e2e.md`, so this is deferral rather than omission, but the master claims "no TBD outside Open Questions" (§28) and these are implicit TBDs. Second, **the graph gate and AST purpose checker remain project-owned prose** (§13/§14.1, D-039): the hardest, most correctness-sensitive analysis (SCC/cycle detection, boundary membership, fan ratchet, all-symbol AST traversal with exception globs) is described as a contract each project reimplements from "best practices," which is exactly the code a weak model gets wrong.

## Risks & Failure Modes (Black Hat)

**1. Delivery of commit `R` to the user is unspecified (major, correctness).** The executor works in a dedicated worktree on branch `meta-o/<run-id>` built from `baseRevision` (§6.1). §17 step 7 deletes the temporary worktrees via `git worktree remove`, yet §17 also asserts "Repository HEAD после completion обязан оставаться candidate commit `R`. Никакой bookkeeping commit не создаётся." Nothing defines how the *user's* main checkout arrives at `R`, whether the `meta-o/<run-id>` branch is preserved as a durable ref (needed for the later user-initiated push/PR, D-053), or whether `R` becomes unreferenced and GC-eligible once the worktree is removed. An implementer must invent fast-forward/merge/checkout behavior — a genuine decomposition and correctness gap at the most visible seam (what the user actually gets).

**2. Verification state is no longer shareable, contradicting the task's shared-knowledge intent (major, task-conformance).** The task lists persistent E2E verification state (scenario, business link, date, verified revision, status) under the *knowledge layer*, in a context of a team with "общий репозиторный слой знаний" on different machines. R1 correctly removed dynamic `last_run` from tracked `e2e.json` to avoid a second revision (§16.1, D-073), but moved the result into a per-machine external receipt under `~/.meta-o` (§17) that is not committed, not shared, lost on project move (new `project-key`), and whose portability is merely *deferred* (§23.7, Open Q #6). The committed `e2e.json` now carries **no status at all**, so the repository has no shared answer to "which scenarios are verified against HEAD." The exact-revision purity was bought at the cost of the task's shared-verification-state goal. A recommended reconciliation: promote the deferred "export receipt to annotated tag / notes / PR" into an opt-in, committed-outside-the-digest shared artifact.

**3. The capability bar may leave zero viable backends (major, viability).** §18 makes "effect lookup/correlation after client crash," "idempotent send or proof of non-delivery," and a "stable replayable output cursor" *completion-critical*, with `unsupported` blocking the backend, and §18's crash-window tests are demanding. Typical CLI-session backends (including the two named, Herdr/Omnigent) may not natively provide crash-correlatable send idempotency. The spec is honest — it gates rather than pretends — but the practical consequence is that the methodology could be unrunnable on any current backend until one is extended. This should be surfaced as an early spike, not a background deferral.

**4. Non-terminating stabilization loop, now more expensive (real, disclosed).** Every fix produces a new commit + new plan + full gate cycle (§10.2–10.4), and after E2E PASS both reviewers re-run on the final revision (§10.4 step 7), which can re-invalidate E2E. With unbounded cycles by design (D-071) and a fresh worktree + environment rebuild per gate (§6.3), there is no convergence guarantee and the cost per iteration is high. Accepted by the user, but for an "unattended" workflow this is the sharpest liveness/cost risk.

**5. Empty-applicable-E2E deadlock (minor edge case).** §16.2 forbids an empty selected set and classifies "no applicable executable scenario" as `blocked`, never PASS. A legitimate change with no business-linked scenario and no `always_required` entry cannot produce a passing E2E gate, so it can never complete. The spec needs an explicit rule (e.g., a mandatory always-required smoke scenario, or a justified, reviewer-approved E2E exemption).

**6. Under-specified pause/condition wiring (minor).** `SPEC_MUTATED` (§4) is a named condition with no corresponding `Phase` and no defined target state ("либо останавливается" — which one?). `PAUSED_MISSING_TOOLS`, `PAUSED_MODEL_UNAVAILABLE`, `PAUSED_QUOTA`, `PAUSED_EXTERNAL`, `PAUSED_TECHNICAL_DISPUTE`, `PAUSED_ORCHESTRATOR_BUDGET` appear in the enum and §10 list but have no entry/exit/resume rows in the §10.1 table or §10.5 routing. The stall deadline (§18) has no specified value or configuration location — a threshold TBD outside Open Questions.

**7. Vendor/family taxonomy still undefined (minor).** The independence invariant `reviewerCrossVendor.vendor != executor.vendor` (§3) rests on free-form `vendor`/`family` strings with no authoritative mapping, so it is unenforceable and mislabeling silently defeats cross-vendor independence — unchanged from what a first review would flag.

## Strengths & Benefits (Yellow Hat)

The revision is genuinely impressive on the hard parts. Binding all four gates to a single full commit SHA plus a plan digest carried in commit trailers (D-072/D-074) yields a tamper-evident, reproducible attestation subject, and the `RevisionSubject` echoed into every result (`ReviewResult`, `E2EResult`, `RevisionResult`) makes stale results structurally impossible to accept. The `EffectIntent` write-ahead record with `lookupEffect`, explicit "never blind resend," and the enumerated crash-window conformance tests (§9, §18) is a correct, minimal crash-safety design that stays honest about not being a queue/DB (§23.5). Fresh-worktree-per-gate with pre/post proof and QC run on an isolated checkout removes the earlier "executor self-reports QC on the working tree" trust problem entirely. The receipt-as-idempotent-completion-marker written before cleanup (§17, D-080) closes the finalization crash window. And §27 now gives each subspec a concrete required-contents contract — a large improvement in decomposition readiness over a prose "will be decomposed" promise. The document is also unusually candid in §23/§24 about the trade-offs it made (exact-commit strictness, external receipt portability cost).

## Alternatives & Creative Ideas (Green Hat)

- **For finding #1**, specify completion delivery explicitly: keep `meta-o/<run-id>` as a durable branch ref (do not delete it with the worktree), and define whether completion fast-forwards the user's branch to `R` or leaves the branch for the user's push. One paragraph closes the hole.
- **For finding #2**, adopt the deferred idea now: an opt-in `git notes`-free, committed "verification digest" file placed *outside* the snapshot-digest path set (a whitelisted, explicitly-excluded bookkeeping file) — the very thing R1 rejected (D-032) — but reconciled by making that file's write a *separate, non-attesting* commit that the FSM never treats as part of `R`. This crosses the "no path excluded from identity" hard line (§6.2) and deserves consideration precisely because it restores shared verification state; the cost is re-introducing a controlled dual-artifact, which the spec must weigh against the team-sharing requirement it currently misses.
- **For finding #4**, add a *diminishing-returns notification* (not an auto-stop): after K consecutive cycles yielding only `minor`/`taste`, notify the user — preserves D-071's "cycles run as long as needed" while giving unattended runs an escape signal.
- **For finding #3**, define a documented "reference backend" shim (even a local process manager) that provably satisfies the capability suite, so the methodology has at least one supported target independent of Herdr/Omnigent maturity.

## Completeness & Process (Blue Hat)

Two task-mandated deliverables are still missing from the body. First, the task explicitly required **comparing check placement across QC / pre-commit / pre-push**; R1 not only omits the comparison but appears to have *dropped the placement discussion entirely* — "pre-commit"/"pre-push" do not appear in §14 or anywhere in the body, even though **D-036 ("Pre-commit быстрый и optional") is marked adopted**. That is a direct violation of the spec's own acceptance criterion §28 ("все adopted decisions присутствуют в нормативных разделах") and of the task. Second, the task required **comparing deterministic script vs. local model vs. hybrid** for the watchdog; §20/D-016 still assert the chosen design without the comparative analysis. Otherwise the document is well-structured and the §27 subspec contracts materially improve process readiness.

## Traceability

The Decision Ledger exists (D-001…D-080), and R1 correctly records status changes ("rejected in R1," "adopted, strengthened R1") — good discipline. The new R1 decisions (D-072–D-080) all appear in the body (§6, §16, §17). **Confirmed traceability failure: D-036 (adopted) has no representation in any normative section** — the pre-commit/pre-push placement it encodes is absent from the body. Minor gaps: D-034 (rejected: knowledge-only preserves E2E) and D-044 (rejected: risk-based purpose) are not explicitly listed in §22's rejected list (only implied via D-033 and §23.1 respectively). D-053 (push/PR only by explicit user request) is reflected only obliquely via the intro's "обычный Git/PR процесс," not stated as a normative rule in the body.

## Decomposition Readiness

Much improved. The FSM transition table (§10.1), invalidation rules (§10.2), stabilization loops (§10.3/10.4), and the §27 per-subspec required-contents lists make most of the document executable rather than interpretive. Remaining spots where an implementer must *decide* rather than *execute*: the commit-`R` delivery/HEAD/branch handling (finding #1); the graph-gate and AST-purpose algorithms (project-owned prose, §14.1); the pause-state entry/resume wiring and `SPEC_MUTATED` target state (finding #6); and the empty-E2E-selection rule (finding #5).

## Weak-Model Executability

The identity, worktree, effect-intent, and receipt mechanisms are now concrete enough (explicit ordered steps, digest formulas, schemas) for a weak model to follow. The exceptions are the same as decomposition: a less capable model cannot implement the import-graph SCC/cycle/fan ratchet or the all-symbol AST purpose walker from a contract paragraph, cannot resolve the vendor/family invariant without a taxonomy, and cannot implement completion delivery of `R` without inventing the branch/HEAD policy. The scenario-selection step 4 ("additional scenarios for changed boundaries and failure modes," §16.2) is an inherently semantic judgment the model must make, mitigated only by reviewer check.

## Contract Completeness

Schemas for state, candidate, plan, findings, results, and receipt are specific and digest-bound — strong. Gaps: the adapter-facing types and `EffectStatus`/`DecisionOption`/`Evidence` are referenced without definitions (deferred to subspecs but used in the master); the FSM `stall deadline` value/config is unspecified (a threshold TBD outside Open Questions); `RevisionResult.resultDigest` is declared but its computation is never defined; and `idempotencyKey` derivation ("stable") is described operationally (persisted in `inFlightEffect`) but not as a computation rule. None of these are fatal, but each is a concrete TBD the acceptance criteria claim to forbid.

## Verdict rationale

I actively tried to break it. The crash-safety and identity core held up under scrutiny — those are the parts I most expected to fracture and they did not. But I found one real correctness hole (commit-`R` delivery), one real task-conformance regression (verification state is no longer shared and its committed status vanished), one dropped task deliverable with a broken ledger link (D-036/placement comparison), a still-missing watchdog comparison, and a viability risk (the capability bar may exclude both named backends). These are addressable without redesign, which is why the score is high — but they are enough that "couldn't break it" is not true, so it lands at 7 rather than 8+.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "A strong R1 revision that closes most first-pass defects: exact-commit-SHA identity with plan-digest trailers, write-ahead EffectIntent crash journaling with no blind resend, fresh-detached-worktree-per-gate with pre/post revision proof, owner.lock single-writer takeover, an external idempotent completion receipt, and per-subspec contracts in the decomposition plan. The core identity and crash-safety mechanisms held up under stress. It falls just short of 'couldn't break it' because: (1) the mechanism that delivers the candidate commit R back to the user's repository (HEAD/branch/ref preservation after worktree deletion) is unspecified; (2) verification state was moved to a per-machine, uncommitted, cleanup-surviving-but-unshared external receipt, and tracked e2e.json now carries no status at all, which conflicts with the task's shared-knowledge intent for a team; (3) the task-required QC/pre-commit/pre-push placement comparison is absent from the body even though its ledger entry D-036 is marked adopted, violating the spec's own acceptance criterion; (4) the task-required deterministic/local-model/hybrid watchdog comparison is still not delivered; and (5) the completion-critical capability bar may exceed what Herdr/Omnigent actually provide, risking zero viable backends. All findings are fixable without redesign.",
      "phase": "spec-review",
      "confidence": "medium",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "completion/git-delivery",
          "description": "The executor builds R on branch meta-o/<run-id> in a dedicated worktree; §17 step 7 deletes temporary worktrees while asserting repository HEAD must remain R with no bookkeeping commit. How the user's main checkout reaches R, whether the meta-o/<run-id> ref is preserved for later user push/PR, and whether R stays referenced (not GC-eligible) after worktree removal are all undefined.",
          "required_change": "Specify completion delivery: preserve meta-o/<run-id> as a durable branch ref, define whether the user's branch/HEAD is fast-forwarded/checked out to R, and how the user obtains R for the separate push/PR step (D-053)."
        },
        {
          "id": "",
          "severity": "major",
          "area": "verification-state/knowledge-layer",
          "description": "The task lists persistent E2E verification state (scenario, business link, date, verified revision, status) under the shared knowledge layer for a team on different machines. R1 removed dynamic status from tracked e2e.json and placed results only in a per-machine external receipt under ~/.meta-o that is uncommitted, unshared, lost on project move, with portability merely deferred (Open Q #6). The committed e2e.json carries no status, so the repo has no shared record of what is verified.",
          "required_change": "Provide a shareable, committed verification-state mechanism (e.g., promote the deferred export-to-tag/notes/PR into an opt-in shared artifact, or a whitelisted bookkeeping file excluded from the attestation digest) so the team's shared knowledge layer retains E2E verification state."
        },
        {
          "id": "",
          "severity": "major",
          "area": "traceability/task-conformance",
          "description": "D-036 (pre-commit fast and optional) is marked adopted but appears nowhere in the body; the task-required comparison of check placement across QC/pre-commit/pre-push is absent entirely. This violates acceptance criterion §28 ('all adopted decisions present in normative sections') and a direct task requirement.",
          "required_change": "Restore a normative QC/pre-commit/pre-push (and CI-dup) placement section with trade-off comparison, satisfying D-036 and the task."
        },
        {
          "id": "",
          "severity": "major",
          "area": "backend-viability",
          "description": "§18 makes crash-correlatable effect lookup, idempotent-send-or-proof-of-non-delivery, and stable replayable output cursor completion-critical, with unsupported blocking the backend. Typical CLI-session backends, including the two named (Herdr/Omnigent), may not satisfy these natively, risking that no backend qualifies and the methodology is unrunnable until one is extended.",
          "required_change": "Add an early mandatory capability spike against real Herdr/Omnigent versions and define a reference/shim backend that provably passes the suite, so at least one supported target exists independent of third-party maturity."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "watchdog/task-conformance",
          "description": "The task explicitly required comparing deterministic script vs. local model vs. hybrid for the watchdog; §20/D-016 assert the chosen deterministic+closed-enum design without the comparative analysis.",
          "required_change": "Add the three-way comparison (deterministic / local-model / hybrid) with costs and consequences, then state the choice."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "fsm-completeness",
          "description": "SPEC_MUTATED (§4) has no corresponding Phase or defined target state; PAUSED_MISSING_TOOLS/MODEL_UNAVAILABLE/QUOTA/EXTERNAL/TECHNICAL_DISPUTE/ORCHESTRATOR_BUDGET have no entry/exit/resume rows in §10.1/§10.5; the §18 stall deadline has no value or config location.",
          "required_change": "Add entry/exit/resumeCondition rows for every pause/stop state, map SPEC_MUTATED to a concrete state, and specify the stall deadline value and where it is configured."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "e2e-selection",
          "description": "§16.2 forbids an empty selected set and treats 'no applicable executable scenario' as blocked (never PASS), so a legitimate change with no business-linked or always_required scenario can never complete.",
          "required_change": "Define an explicit rule for changes with no applicable E2E scenario (mandatory smoke scenario or a reviewer-approved, justified exemption)."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "contract-completeness",
          "description": "AdapterCapabilities, SpawnRequest, DeliveryResult, SessionStatus, SessionOutput, EffectStatus, ExpectedState, WaitResult, DecisionOption, Evidence are referenced but undefined; RevisionResult.resultDigest computation is unspecified; idempotencyKey derivation is described only operationally.",
          "required_change": "Provide at least stub schemas for referenced types in the master (or explicitly scope them to a named subspec), and define resultDigest and idempotencyKey computation."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "weak-model-executability",
          "description": "The import-graph gate (SCC/cycle/boundary/fan ratchet) and all-symbol AST purpose checker remain project-owned prose (§13/§14.1, D-039); a weak model cannot implement them without guessing, and per-project reimplementation invites divergence in the methodology's core mechanical guarantee.",
          "required_change": "Have 40-local-qc-python.md ship a canonical, versioned reference implementation invoked from the Makefile (without forking), rather than only a contract."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "model-set-invariant",
          "description": "vendor/family in ModelRef are free-form strings with no authoritative taxonomy, so the cross-vendor independence invariant is unenforceable and silent mislabeling defeats it.",
          "required_change": "Define an authoritative vendor/family taxonomy and how ModelRef fields are assigned and validated."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "liveness/cost",
          "description": "Every fix yields a new commit + new plan + full gate cycle with a fresh worktree and environment rebuild, and post-E2E reviewer re-runs can re-invalidate E2E; with unbounded cycles (D-071) there is no convergence guarantee and per-iteration cost is high.",
          "required_change": "Add a diminishing-returns user notification after K cycles of only minor/taste findings, without auto-completing."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "traceability",
          "description": "D-034 and D-044 (both rejected) are not explicitly listed in §22; D-053 (push/PR only on explicit user request) is only obliquely reflected in the intro rather than stated normatively.",
          "required_change": "List all rejected decisions in §22 and state D-053 as a normative rule."
        }
      ],
      "assumptions": [
        "This review targets the master spec only; the six implementation subspecs and per-project QC code are out of scope because they are not present in the artifact.",
        "The named council models and their R1 verdicts are treated as provenance, not independently verifiable claims.",
        "I read the spec and original task in full and did not need the reference docs, since every finding is grounded in internal consistency or the quoted task constraints.",
        "would_adopt is set false to signal the listed blocking findings must be resolved first; the underlying architecture is close to adoptable and the gaps are addressable without redesign.",
        "The verification-state finding assumes the task's placement of E2E verification state under the shared knowledge layer implies it should be shareable across the team, not merely persisted on one machine."
      ],
      "round": 2,
      "reviewer": "fable51mxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
