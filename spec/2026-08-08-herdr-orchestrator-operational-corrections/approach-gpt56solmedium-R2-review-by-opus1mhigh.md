## Facts & Constraints (White Hat)

I re-derived the facts both revisions now lean on rather than accepting either author's summary, because this round both proposals cite measurements as load-bearing. Four checks matter.

**The 180-line figure is real, and P1 deserves credit for it.** `docs/phase-0-fixtures.md §H` records H2 (250-line answer) as **pass on the TUI for all three routes**: Claude needed `--lines 400` → 347 rows with all 250 indices contiguous; Codex `--lines 400` → 279 rows, all 250; OpenCode `--lines 400` → 271 rows, all 250. So a 180-line verdict sits inside measured territory, and P1's replacement of its earlier 700 with 180 fixes the flaw I raised last round.

**But the same file contains an applicability rule that neither proposal confronts.** §H states it explicitly: *"an open row makes that surface unsupported for the gate it feeds"*, and then, in one line: **"Claude and Codex carry the review gate on the captured inline surface, and nothing carries it on the TUI surface until H7b is measured."** H7b (host-window resize) is open on the TUI for every provider; H6 is "not applicable / open" on Claude; H9 is open on OpenCode. P1 asserts "Codex interactive route — поддерживается… Claude interactive route — поддерживается для компактных verdict'ов" without closing, or amending, that rule. P2 is in the same position but has a stronger defence it never states: its footer read is a single 40-row snapshot with no paging and no assembly, which is precisely the reasoning §H already used to mark H7b **N/A on the captured inline surface**. Either way, the §H matrix must be re-derived for the new surface in the same change; support cannot be asserted over a rule the repository still publishes.

**P2's Herdr schema table checks out — except for one claim, and that one is the upstream issue.** I dumped `herdr api schema --json` (protocol 19, schema_version 1): `TabCreateParams {cwd, env, focus:false, label, workspace_id}`, `PaneSplitParams {direction required, ratio, env, target_pane_id, focus:false}`, `PaneRenameParams {pane_id, label?}`, `AgentStartParams.timeout_ms` documented as ">3000 and at most 300000", `AgentViewBuiltinField` = `[status, workspace_id, tab_id, pane_id, agent, seen, state_change_seq]`, `ReadSource` = `[visible, recent, recent_unwrapped, detection]`. All accurate. **But gap 5 is not.** P2 writes that `EventMatch` "has **no agent-status variant**". It has two: `pane_agent_detected` and `pane_agent_status_changed`. The real limitation is different and narrower — `pane_agent_status_changed` *requires* both `pane_id` and a single `agent_status`, so `events.wait` still cannot express "either reviewer reaches any of idle|done|blocked". An upstream issue filed on the stated premise would be rejected on sight, and the requested fix ("add an agent-status variant") is the wrong ask.

**`--source detection` behaves roughly as P2 hopes, with a caveat it should own.** Reading the three live agents in this session: detection returns a **fixed ~52-row snapshot** on Claude, Codex and OpenCode alike — including on OpenCode, which the fixtures record as alternate-screen with `max_offset_from_bottom: 0`. That does support P2's key claim that detection survives the alternate-screen problem. But it is Herdr's *state-detection* snapshot, its size is not governed by `--lines` in any obvious way, and on Claude the last ~10 rows are TUI chrome (input box, model/context line, `Compactions: 1`, permission hint). A three-line footer fits comfortably; a claim phrased as "the last 40 rows" does not describe what the flag actually returns.

**On bundling, the SDK package itself settles the argument.** `@anthropic-ai/claude-agent-sdk@0.3.191` declares **peerDependencies** on `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk` and `zod`; eight platform-native `optionalDependencies`; a 894 KB `sdk.mjs`; two `import.meta.url` uses; and — decisively — `createRequire` with literal `require("ajv/dist/runtime/equal")`-style calls inside. esbuild does not follow `createRequire()(...)`, so those survive bundling as runtime requires that will fail in a skill directory with no `node_modules` if that code path executes. `pathToClaudeCodeExecutable` is a real option (P1's §10.2 mitigation is genuine and correct for the *binary*), but it does nothing for the peer/ajv resolution. And brain-council still does **not** inline these SDKs: `src/build.ts` keeps them in `EXTERNAL_SDKS` and vendors them into `dist/<skill>/node_modules`, with a comment naming exactly this hazard. P1's §17 assumption "Bundling повторяет brain-council: SDK JavaScript inlined" describes the opposite of the reference implementation it cites.

## Risks & Failure Modes (Black Hat)

**P1's hardest failure is the one its own constraints create: a thorough review cannot pass the gate.** `mo-review` requires `Evidence`, `Impact` and `Expected fix` on *every* finding, and the recorded history in this repo is six rounds with severity descending from wrong behaviour to unpinned guards. A 180-rendered-line budget covers roughly eight to twelve such findings including headings and residual risks. When a reviewer legitimately has more, P1's rule is: compact once, then "route не несёт gate в этом run", **and inline fallback is explicitly forbidden** ("Оркестратор не переходит на headless provider mode"). So a rich first-round review deterministically ends the run with no gate, and the only way for a reviewer to avoid that outcome is to under-report — the exact incentive a review gate must not create. There is no chunking escape, even though `mo-review` already has a chunking rule for over-long *prompts* that could have been mirrored for verdicts.

**P1's bundling bet is unvalidated and simultaneously made into a hard gate.** `mo-qc` would byte-compare a freshly built bundle, so the build must be deterministic across esbuild versions and platforms, while the bundle must inline three peer packages and survive a `createRequire` path esbuild leaves behind. P1's own deterministic test — "bundled helper загружается из isolated directory без node_modules" — proves load, not the `supportedModels()` path, and P1 explicitly moves the live catalogue test out of `mo-qc`. So the exact reported failure ("оркестратор не смог определить доступные модели") remains uncovered by anything deterministic; it is covered only by agent-required E2E item 15, which is honest but late.

**P1 leaves the orchestrator no lawful way to learn whether an agent-required E2E applies.** It may not read documents; §2.1 forbids even determining QC. Yet §7's `GateSet` carries `e2e`, and §14.2 item 14 requires E2E to attach to the same SHA. Nothing says who tells the orchestrator that `docs/e2e.md` names an agent-required scenario. P2 solves this with a narrow carve-out (scenario names only).

**P1's `develop` policy still escalates outside the allowed set.** It softened to "configured upstream, local `develop` is authority", but absence of `develop` remains a "repository-policy blocker" returned to the human — which is not one of the six categories the user authorised for interrupting him, and it is the common case.

**P2's worst interaction is one it never mentions: the orchestrator writing to the repository mid-run.** §3.7 says that when an actor asks permission, the orchestrator "records a posture defect in `docs/backlog.md`". That is a tracked-file edit made while the executor is working. It dirties the worktree, so either the executor's `MO-EXEC … READY` fails the `git status --porcelain` check the orchestrator itself applies (§3.5), or the orchestrator's edit is swept into the executor's next commit and lands in a candidate nobody reviewed. The same hazard exists for the framing write in §2.1, which is at least a pre-executor action. This needs an explicit rule: the orchestrator writes tracked files only before the executor starts or after the worktree is verified clean, and never during a turn.

**P2's five-part acceptance check has one soft joint left.** The findings file is checked for existence, non-emptiness and correct directory — never for completeness. A reviewer whose file write is cut mid-way yields a valid footer and a plausible file. P2's stated recovery ("the next round re-reviews the same SHA") is still not what happens: the executor fixes and commits, so round two is a *new* SHA in a warm session. Recovery actually depends on the reviewer's own context still holding what it wrote, which is a property of session warmth, not of the protocol. Say so, and require the round-two reviewer prompt to re-assert any prior finding it does not see addressed.

**Freshness of the detection snapshot is unproven.** If detection is refreshed on Herdr's own detection cycle rather than on read, a footer read immediately after `agent wait` returns settled could miss the final render — producing spurious `unknown` and a re-request every round. H15 should test the footer read *immediately* on settle, not after an unspecified pause.

**Shared-filesystem independence is now handled, but only for reads of the sibling directory.** Per-reviewer `mktemp -d` with `chmod 700` closes the obvious leak. Two reviewers under the same UID can still read each other's directories if either goes looking (`chmod 700` protects against other users, not the same user), so H17's negative case ("given only its own path, cannot locate A's directory") is testing obscurity, not permission. Worth stating plainly rather than implying a permission boundary exists.

**Both:** the global-npm remediation P2 chose is fragile in a way the user will hit — an `nvm`/`fnm`/Homebrew Node switch changes `npm root -g`, and the catalogue gap silently returns, which is exactly complaint 9 recurring. P1's instinct (ship it) is right; its mechanism is the wrong one.

## Strengths & Benefits (Yellow Hat)

Both revisions are materially better than the versions I saw. P1 replaced an unmeasured 700-line limit with one anchored to H2, added the `pathToClaudeCodeExecutable` boundary (which correctly keeps the subscription-backed system CLI as the provider surface), removed the "no fallback ever" rigidity from its VCS clause, defined `agent_prompt_stalled` handling as a concrete four-step procedure rather than a sentence, and made the candidate condition a *post-wake check* rather than a wait predicate — with the crucial line that an unchanged SHA is acceptable, which is the direct fix for the reported incident. Its dispute protocol is the cleaner of the two on paper: classification strings come *from* the actors and the orchestrator only routes, which is a sharper statement of the firewall than P2's routing table. And P1 satisfies the user's literal instruction ("он только копипастить должен") while keeping the relayed volume affordable — a 180-line cap makes verbatim relay cost ~5k tokens a round, and it keeps the findings visible in the orchestrator pane where the user is looking.

P2's strengths are structural rather than procedural, and they are the ones that survive contact. Making the findings **file** the review itself — written as the reviewer works, with the pane carrying only control plane — retires the entire full-turn-retrieval problem for the review gate instead of shrinking it, and it is the only construction here where a long, thorough review is not penalised. The consequence P2 draws is the important one: because the footer carries no evidence, re-requesting it is a control-plane repair rather than the banned "repeat your answer verbatim", which gives the transport a recovery path the old design never had. The traceability table (fourteen complaints → mechanism → section) is exactly what a decomposition-ready proposal owes the reader. The `env` injection on `pane.split` as compaction-durable storage for scratch paths is a genuinely clever use of a verified schema field. And P2 is the only one of the two that names the two contract self-contradictions it creates (methodology line 353 "produce one clean candidate commit"; `{model}` ambiguity) and resolves both in the same change — I verified line 353 exists exactly as quoted.

Where I expected to break P2 and could not: the read-budget table is not merely a prohibition, because the workflow genuinely gives the orchestrator nothing to read; the `state_change_seq` claim is properly demoted to corroboration behind fixture H13; the topology commands match the schema field-for-field; the "never close what you did not create" rule closes the destructive case; and the escalation set is unchanged from methodology §9, so the human-interruption contract is not quietly widened.

## Alternatives & Creative Ideas (Green Hat)

The best unexplored option is still the hybrid neither proposal takes: `herdr agent list` exposes `agent_session.value` — the provider's own session id — and fixtures H5′ on both Claude and Codex prove a chosen session id can be resumed inline (`claude -p -r <uuid>`, `codex exec resume --last`). So the reviewer can *think* in the visible warm interactive session and *emit* its verdict through a resumed inline turn run via `herdr pane run` in an adjacent visible pane, giving back the provider-authored envelope (`stop_reason` / `turn.completed`) that both proposals surrender — while remaining a Herdr pane, visible, subscription-backed, and cache-warm. The open question is whether resuming forks session state; that is one fixture, and it is a cheaper experiment than either proposal's central bet.

Second: for P1's over-long-verdict deadlock, mirror `mo-review`'s existing prompt-chunking rule onto verdicts — the reviewer emits findings in numbered turns of ≤180 lines, each acknowledged from a settled state before the next. Continuity is proven per turn, which is exactly what H2 measured, and no finding has to be dropped to fit.

Third, on the SDK: the mechanism the user actually pointed at is **vendoring**, and it is available to meta-o without inlining anything — `tools/build-skills.mjs` can copy the SDK's dependency closure into `skills/mo-herdr/scripts/node_modules/` the way `src/build.ts` does, keeping `mo-models.mjs` an authored file with a plain import. It requires amending `docs/architecture/distribution.md` and the "Markdown plus two dependency-free helpers" sentence in `AGENTS.md`/`CLAUDE.md` — which is a decision worth recording rather than a reason to avoid it, and it survives an `nvm` switch, which the global install does not.

Fourth, small and free: `tab create --label` sets the review tab's name at creation, so P2's rename call there is redundant; and `events.wait` on `pane_agent_status_changed {pane_id, agent_status}` already gives a per-pane, per-status event wait — three concurrent matches would approximate a settled-state wait without polling, which is worth measuring before declaring serial waiting unavoidable.

## Completeness & Process (Blue Hat)

P1's decomposition (eight items) and P2's (ten file-scoped items) are both actionable. P1's remaining process gaps are: no fixture named for the §H applicability re-derivation, no `docs/architecture/distribution.md` entry for a change that converts a copied authored helper into a multi-megabyte generated bundle containing third-party code (§13 explicitly says no architecture document is required — that is the one place it is required), and no owner for E2E applicability. P2's are: the false premise inside upstream gap 5, the un-stated §H re-derivation, the mid-run repository-write hazard, and two carried items from the previous round it did not pick up — the `mo-review` clause "CANDIDATE and WORKTREE are deliberately not reviewer output fields" that its SHA-echoing footer contradicts, and a sandbox/permission fixture for the out-of-repo scratch tree (partially excused by the yolo posture it references, but not stated).

On the one requirement where the two diverge on principle — complaint 9 — P1 is right about the destination and wrong about the route; P2 is right about the contract and wrong to substitute a mechanism the user did not ask for and that a Node version switch silently defeats. Whichever proposal is adopted should take vendoring, and record the contract amendment.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-1",
      "approval_score": 5,
      "would_adopt": false,
      "summary": "Substantially improved: the 180-line verdict cap is genuinely anchored in fixture H2 (250 lines retrieved cleanly on all three TUI routes, verified), the pathToClaudeCodeExecutable boundary is a real and correct mitigation, the wait protocol now checks the candidate after waking instead of predicting a future SHA, and the dispute protocol keeps classification in the actors' hands. Three defects still block it. First, the 180-line cap collides with mo-review's mandatory Evidence/Impact/Expected-fix per finding, and the only escape paths are forbidden (no chunked verdict, no inline fallback), so a thorough first-round review deterministically ends the run with no gate and pressures reviewers to under-report. Second, the bundling section misstates its own reference implementation — brain-council keeps these SDKs external and vendors them precisely because of runtime resolution — and ignores that the SDK carries three peerDependencies plus createRequire-based require('ajv/dist/runtime/...') calls that esbuild leaves as runtime requires, all while making a byte-identical bundle a hard mo-qc gate and moving the only test that exercises supportedModels() out of the deterministic suite. Third, it asserts TUI review-gate support against the applicability rule its own docs/phase-0-fixtures.md publishes ('nothing carries it on the TUI surface until H7b is measured') without closing or amending that rule.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "review gate throughput",
          "description": "A 180-rendered-line authoritative verdict fits roughly eight to twelve findings once mo-review's required Evidence, Impact and Expected fix are included, yet this repository's own recorded history is six rounds of substantive findings. When a legitimate review does not fit, §9.2 permits one compact retry and then declares the route unable to carry the gate, while §4.2 forbids any inline fallback. A thorough review therefore ends the run with no gate, and the reviewer's only way to avoid that is to report less than it found.",
          "required_change": "Add a bounded escape that does not drop findings: mirror mo-review's existing prompt-chunking rule onto verdicts (numbered turns of <=180 lines, each acknowledged from a settled state), or retain the inline surface as an explicitly demoted fallback for a verdict that cannot be compacted without deleting an actionable defect."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model catalogue build",
          "description": "brain-council's src/build.ts keeps the provider SDKs in EXTERNAL_SDKS and vendors them into dist/<skill>/node_modules, with a comment naming runtime resolution of platform-native sub-packages as the reason; §17 claims the opposite is the proven reference boundary. Inspecting @anthropic-ai/claude-agent-sdk@0.3.191 shows peerDependencies on @anthropic-ai/sdk, @modelcontextprotocol/sdk and zod, and createRequire-based literal requires of ajv runtime modules that esbuild does not follow, so a single-file bundle in a node_modules-free skill directory can fail at first use of that path. The proposal nonetheless makes a byte-identical rebuild a mo-qc gate and keeps the live catalogue test out of the deterministic suite.",
          "required_change": "Either prove the inline bundle with a spike that answers supportedModels() from an isolated directory with no node_modules before adopting the byte-identical gate, or switch to vendoring the dependency closure into the built skill as the reference implementation actually does. In either case add the change to docs/architecture/distribution.md and to the 'Markdown plus two dependency-free helpers' sentence in AGENTS.md and CLAUDE.md, which §13 currently says needs no amendment."
        },
        {
          "id": "",
          "severity": "major",
          "area": "route support vs recorded fixtures",
          "description": "docs/phase-0-fixtures.md §H states the rule 'an open row makes that surface unsupported for the gate it feeds' and concludes in one line that nothing carries the review gate on the TUI surface until H7b is measured (H6 also open/N-A on Claude, H9 open on OpenCode). §4.2 declares Codex and Claude interactive routes supported for compact verdicts without measuring H7b or re-deriving applicability for a single-window compact read.",
          "required_change": "Re-derive §H applicability for the compact-TUI surface in the same change: state per row whether it applies to a single 400-line window with no paging, close or explicitly mark N/A the rows that block support today, and only then claim route support."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "E2E applicability ownership",
          "description": "The orchestrator may not read documents and may not determine QC, yet the GateSet carries e2e and §14.2 requires E2E to attach to the same SHA. Nothing states how the orchestrator learns that an agent-required E2E scenario exists.",
          "required_change": "Assign it: either the executor reports E2E applicability and scenario names in its READY footer, or grant a narrow carve-out to read scenario names from docs/e2e.md."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "version-control clause",
          "description": "Absence of a develop branch remains a repository-policy blocker returned to the human, which is not one of the six conditions the user authorised for interrupting him and is the common case in real repositories.",
          "required_change": "Define a deterministic fallback (branch from the default branch and record that in the first commit message) so the run continues without a human."
        }
      ],
      "assumptions": [
        "docs/phase-0-fixtures.md §H remains authoritative for the installed Herdr 0.8.0 and provider versions; I re-read it rather than re-running the fixtures.",
        "The SDK package I inspected (0.3.191, via brain-council's pnpm store) is the version that would be pinned.",
        "'Interrupt the human only for the six named conditions' outranks a literal reading of the user's version-control text."
      ],
      "round": 2,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 5
would_adopt: false
