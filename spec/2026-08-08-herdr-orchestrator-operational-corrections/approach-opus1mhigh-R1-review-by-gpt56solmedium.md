## Facts & Constraints (White Hat)

Proposal 1 is substantially closer to the task. Its Herdr assumptions match the installed 0.8.0 interface: tab rename, tab creation with `--cwd`, rightward pane splits, persistent named agents, atomic `agent prompt` submission with Enter, and bounded `agent wait` all exist. Its thin-orchestrator boundary also matches the clarification: paths and Git metadata may be handled, while specification, business framing, code, diffs, feasibility, and technical findings remain actor-owned.

Its weak point is reviewer retrieval. Repository fixtures already show that Claude’s interactive TUI becomes unassemblable around 800–900 lines and can interleave repaint fragments above roughly 250 lines; OpenCode’s TUI is worse. Therefore “verdict ≤700 lines inside a 1000-row window” is not a proven safe contract. The total retained interval also includes prompt/tool activity and boundaries, so even a 700-line final answer can exceed the usable window.

Proposal 1’s bundled-SDK direction is compatible with the user’s explicit request and can still yield a dependency-free shipped `.mjs`. However, the build contract needs more detail: exact authored entrypoint, reproducible esbuild options, bundled license/notice handling, package-lock effects, and separation between deterministic bundle tests and live authenticated catalogue fixtures.

Proposal 2 contains concrete command defects despite broadly correct topology. Its sample evaluates `herdr tab create` twice while commenting that the tab and root pane come from the same response, which would create two tabs. More importantly, its design deliberately replaces verbatim copy/paste with findings-path handoff, contrary to the explicit task.

## Risks & Failure Modes (Black Hat)

Proposal 1 has four material failure modes:

- Treating `agent_prompt_stalled` as proof that a prompt was not delivered is unsafe. Herdr only proves that no lifecycle transition was observed. Blindly resending can duplicate a prompt that reached the TUI but was not detected. Recovery must inspect lifecycle and recent output from a known input-ready state, then retry with an identifiable turn tag only when non-delivery is established.
- A 700-line reviewer ceiling can still produce an apparently complete but corrupted TUI verdict. This risks the exact false PASS that `full-turn-retrieval.md` is designed to prevent.
- “Findings arrive byte-for-byte” is not a realistic acceptance criterion through rendered terminal output: soft-wrap normalization and TUI rendering already transform representation. The required invariant should be complete, ordered, unedited semantic text with proven boundaries, or a mechanically complete logical-turn transport.
- The proposal says E2E proves the orchestrator never read spec/source/diff, but does not define evidence. Since skills-first orchestration has no enforcement wall, this needs an auditable test fixture—such as a controlled command transcript or canary access audit—not merely a Markdown phrase test.

Proposal 2 has more serious structural problems:

- The findings file plus three-line footer is exactly the model-cooperative marker/file protocol rejected by the current retrieval architecture. File existence and a footer do not prove that the file is complete. The executor cannot detect a finding the reviewer omitted from a truncated file, and another review round is not guaranteed to rediscover it.
- Path handoff violates the user’s explicit requirement that the orchestrator copy reviewer output to the executor without evaluating it.
- It retains inline/headless review as a fallback, despite the clarification that reviewers must be ordinary visible subscription-backed CLI sessions.
- Its default-branch fallback directly contradicts the requested “branch from an up-to-date `develop`” policy. Proposal 1 correctly treats missing `develop` as a policy blocker.
- Global SDK installation is neither the requested bundled mechanism nor an unattended solution. It creates personal-machine coupling and reintroduces an offer/question path.
- “Leave a code comment wherever a finding is declined” invents ritual documentation and conflicts with the project’s purpose discipline.
- Several load-bearing elements remain open fixtures or decisions, so the proposal is not implementation-ready.

## Strengths & Benefits (Yellow Hat)

Proposal 1 correctly unifies most complaints around a strong role firewall. It keeps feasibility, implementation, finding assessment, and durable-knowledge decisions with the executor; preserves independent persistent reviewers; removes human babysitting for ordinary technical choices; fixes the wait predicate to use actor lifecycle rather than a predicted future SHA; and treats any new SHA as invalidating every gate.

Its Herdr topology is clear and directly traceable to the request. It also correctly identifies complete logical-turn retrieval as the genuine upstream Herdr gap, while recognizing that tab rename, pane layout, atomic Enter submission, and bounded waiting already exist.

Proposal 1 also handles backlog, changelog, excessive documentation, model discovery, and commit policy coherently without introducing a new daemon, run store, adapter layer, or orchestration CLI.

Proposal 2’s strongest idea is making the orchestrator’s read boundary explicit and keeping all actors visible. Its explanation of why lifecycle—not commit prediction—is the correct wait signal is precise. Its recovery discussion using Herdr’s live actor registry is also useful, but those strengths do not rescue the unsafe findings transport.

## Alternatives & Creative Ideas (Green Hat)

The best revision is based on Proposal 1, with a two-tier retrieval contract:

1. Interactive persistent Herdr sessions are mandatory for executor and reviewers.
2. A TUI verdict is accepted only within a provider-specific, fixture-proven safe bound with upper boundary, lower boundary, and continuity demonstrated.
3. If the safe bound cannot be met, the gate is `UNKNOWN`; repeat compactly in the same session.
4. Until Herdr exposes a complete logical last turn, long or repaint-corrupted interactive verdicts require either human attachment or make the route unsupported for unattended review. Do not manufacture a weaker file/footer proof.
5. Open the proposed upstream `read-turn` issue textually now, but publish it only under separate authorization.

The compact-turn limit should come from fixtures, not a universal 700-line guess. Claude and Codex may need different limits. The reviewer contract can require concise findings and forbid raw logs, but concision is risk reduction, not completeness evidence.

For stalled prompt recovery, attach a transport identifier such as `TURN <run-slug>/<role>/<round>` to each prompt. Inspect the pane for that identifier and lifecycle state before resending. This provides duplicate detection without creating durable run state.

For model discovery, retain Proposal 1’s bundled SDK approach, but treat the bundle as one generated dependency-free helper, include required third-party notices, and test the live Claude handshake separately from byte-reproducible build checks.

## Completeness & Process (Blue Hat)

Proposal 1 needs several additions before decomposition:

- Define restart/adoption behavior for existing tabs, panes, and actor names, including topology mismatch and stale sessions.
- Specify provider-specific safe interactive retrieval fixtures and remove the unjustified 700-line universal bound.
- Define non-duplicating recovery for `agent_prompt_stalled`.
- Replace the impossible byte-for-byte E2E claim with a precise transport invariant.
- Define evidence proving the orchestrator did not inspect forbidden content.
- Preserve `mo-review` direct mode; “does not launch actors” should apply only when a backend orchestrator owns the full workflow.
- Specify bundle licensing and deterministic/live test separation.

Proposal 2 would require redesign rather than amendment: remove file/footer handoff, remove inline fallback, adopt the exact `develop` policy, bundle the Claude SDK, eliminate unresolved load-bearing fixtures, and replace the new documentation file with amendments to existing architecture sources unless a genuinely new boundary cannot fit there.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 3,
      "would_adopt": false,
      "summary": "The proposal diagnoses orchestrator overreach and waiting failures well, and its visible pane topology is close to the requested UX. However, its central findings-file/footer protocol contradicts both the explicit copy-paste requirement and the repository's fail-closed full-turn architecture, while its inline fallback, default-branch fallback, global SDK installation, invented code-comment rule, command example defect, and unresolved load-bearing fixtures make it unsuitable as an implementation-ready design.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "review handoff",
          "description": "Findings-path handoff replaces the explicitly requested verbatim orchestrator-to-executor copy and relies on a model-written file plus footer that cannot prove completeness.",
          "required_change": "Restore verbatim whole-message routing through the orchestrator and use only a transport whose upper boundary, lower boundary, and continuity are independently provable."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "interactive sessions",
          "description": "Retaining inline review as a fallback contradicts the clarified requirement that reviewers run as ordinary visible, persistent, subscription-backed CLI sessions in Herdr.",
          "required_change": "Remove inline/headless actor fallback; unsupported interactive retrieval must yield UNKNOWN or needs_attention until Herdr supplies a complete-turn surface."
        },
        {
          "id": "",
          "severity": "major",
          "area": "version control",
          "description": "Branching from the default branch when develop is absent directly changes the user's requested policy.",
          "required_change": "Require an up-to-date develop branch and classify its absence as a concrete policy blocker."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model discovery",
          "description": "A setup-time global SDK install rejects the requested bundled mechanism, couples capability to personal machine state, and reintroduces a user decision path.",
          "required_change": "Bundle the pinned Claude SDK into the generated dependency-free helper and verify it through deterministic build tests plus a live catalogue fixture."
        },
        {
          "id": "",
          "severity": "major",
          "area": "implementation readiness",
          "description": "State-change semantics, topology behavior, provider footer behavior, and continued use of inline mode are left as open questions or fixtures.",
          "required_change": "Resolve all load-bearing decisions and measurements in the design before decomposition."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Herdr commands",
          "description": "The topology example invokes tab create twice despite requiring tab and root pane IDs from one response.",
          "required_change": "Parse both identifiers from one tab-create response."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "documentation discipline",
          "description": "The mandatory code comment for every declined finding is ritual text and can create inaccurate durable documentation.",
          "required_change": "Require durable rationale only when a future maintainer would otherwise lose a non-obvious accepted risk."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "architecture documentation",
          "description": "A new orchestrator-read-budget architecture document appears unnecessary because the boundary can be recorded in existing skills-first and methodology sources.",
          "required_change": "Amend existing architecture documents unless a genuinely distinct long-lived boundary cannot be expressed there."
        }
      ],
      "assumptions": [
        "The phrase that the orchestrator should only copy-paste findings means a filesystem-path handoff is not an acceptable substitute.",
        "The exact user-supplied develop-branch policy should be preserved rather than generalized.",
        "A model-authored footer or file is cooperative evidence and cannot replace mechanical completeness proof."
      ],
      "round": 1,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 3
would_adopt: false
