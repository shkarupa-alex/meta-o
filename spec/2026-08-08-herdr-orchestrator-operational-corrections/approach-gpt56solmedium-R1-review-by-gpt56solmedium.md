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
      "target_id": "proposal-1",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "This is the stronger foundation: it follows the clarified thin-orchestrator boundary, uses the requested visible persistent Herdr topology, fixes waiting and human-attention behavior, and addresses the SDK, backlog, documentation, and version-control complaints coherently. I would adopt it after revision, but not as written, because its universal 700-line TUI retrieval rule is contradicted by existing fixtures, its stalled-prompt retry can duplicate delivered work, and several verification and bundle-distribution contracts remain underspecified.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "review retrieval",
          "description": "A 700-line verdict inside a 1000-row Herdr read is not proven complete on repainting interactive TUIs; existing Claude and OpenCode fixtures demonstrate corruption or loss below that nominal cap.",
          "required_change": "Use provider-specific fixture-proven limits, fail closed to UNKNOWN whenever boundaries or continuity are unproven, and make the upstream complete-logical-turn capability the required solution for longer unattended verdicts."
        },
        {
          "id": "",
          "severity": "major",
          "area": "prompt transport",
          "description": "The proposal equates agent_prompt_stalled with non-delivery and resends, although Herdr only proves that no lifecycle change was observed; this can duplicate a delivered prompt.",
          "required_change": "Inspect lifecycle and recent output from a known input-ready state, use an identifiable turn tag, and resend only after non-delivery is established."
        },
        {
          "id": "",
          "severity": "major",
          "area": "acceptance evidence",
          "description": "Byte-for-byte reviewer handoff is not well-defined through rendered terminal text, and the E2E claim that the orchestrator never read forbidden files has no specified evidence mechanism.",
          "required_change": "Define a complete, ordered, unedited textual transport invariant and an auditable fixture or command trace proving the orchestrator did not inspect spec, framing, code, or diffs."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model bundle",
          "description": "Bundling is directionally correct but omits exact entrypoint ownership, third-party license handling, reproducibility constraints, and separation of deterministic build tests from live authenticated catalogue tests.",
          "required_change": "Specify the generated-helper pipeline, pinned dependency and lockfile policy, esbuild determinism, notices, byte comparison, and separate live handshake fixture."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "review modes",
          "description": "The statement that mo-review does not launch actors is too broad and could break its direct-review use case.",
          "required_change": "Scope backend-owned actor creation to full mo-herdr workflows while preserving direct mo-review behavior."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "recovery",
          "description": "Existing-session adoption is mentioned but topology mismatch, stale actor, and duplicate-tab recovery are not fully specified.",
          "required_change": "Add deterministic restart/adoption rules based on live names, cwd, pane, tab, role, and provider."
        }
      ],
      "assumptions": [
        "The explicit clarification prohibiting orchestrator reads of specifications, business framing, code, and findings assessment supersedes older methodology text.",
        "A bundled single-file helper still satisfies the dependency-free shipped-helper contract when no runtime node_modules are required.",
        "Existing Herdr 0.8.0 fixture evidence remains applicable to the implementation being designed."
      ],
      "round": 1,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
