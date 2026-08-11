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
      "target_id": "proposal-2",
      "approval_score": 7,
      "would_adopt": true,
      "summary": "The stronger proposal and the one I would build from. Its central move — the findings file is the review itself, written as the reviewer works, with the pane carrying only a three-line control-plane footer — retires the full-turn-retrieval problem for the review gate instead of shrinking it, and it is the only design here where a thorough review is not penalised by a line budget. Its schema table checks out field-for-field against herdr api schema --json (protocol 19), the detection source really does return a bottom-buffer snapshot on all three routes including alternate-screen OpenCode, and it is the only proposal that names and resolves the contract self-contradictions it creates. Four things must be fixed before implementation: upstream gap 5 states a fact that is false (EventMatch does contain pane_agent_status_changed; the real limit is that it requires one pane_id and one agent_status), the orchestrator writing docs/backlog.md mid-run dirties the worktree and collides with its own clean-worktree candidate check, the §H applicability matrix is not re-derived for the new footer-only surface even though the repository still publishes 'nothing carries the gate on the TUI surface', and the setup-time global npm install is defeated by an ordinary Node version switch while the user explicitly named vendoring as the mechanism he wanted.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "upstream issue accuracy",
          "description": "Gap 5 asserts that EventMatch 'has no agent-status variant'. The schema contains both pane_agent_detected and pane_agent_status_changed; the actual limitation is that pane_agent_status_changed requires a single pane_id and a single agent_status, so events.wait cannot express 'either reviewer reaches any settled state'. Filed as written, the issue would be rejected, and the design overlooks that a per-pane, per-status event wait already exists.",
          "required_change": "Correct gap 5 to describe the real constraint (single pane_id plus single agent_status, no multi-match), change the request accordingly (accept a status set and/or multiple matches, or omit pane_id), and evaluate whether three concurrent events.wait matches already remove the serial-wait cost."
        },
        {
          "id": "",
          "severity": "major",
          "area": "orchestrator writes during a turn",
          "description": "§3.7 has the orchestrator record a posture defect in docs/backlog.md when an actor asks for permission. That is a tracked-file edit made while the executor is working: it dirties the worktree, so either the executor's MO-EXEC READY fails the orchestrator's own git status --porcelain check, or the edit is swept into a commit nobody reviewed. The framing write in §2.1 has the same shape.",
          "required_change": "State that the orchestrator writes tracked files only before the executor is started or after the worktree has been verified clean, never during an actor turn; and if a defect is observed mid-run, hold it until the candidate is frozen."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "truncated findings recovery",
          "description": "The five-part check never tests the findings file for completeness, and the stated recovery ('the next round re-reviews the same SHA') is not what happens: the executor commits, so round two is a new SHA in a warm session. Recovery in fact depends on the reviewer's own context still holding what it wrote.",
          "required_change": "State the real mechanism and require the round-two reviewer prompt to re-assert any earlier finding it does not see addressed."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "carried-over contract conflict",
          "description": "mo-review states that CANDIDATE and WORKTREE are deliberately not reviewer output fields; the footer requires the reviewer to echo the frozen SHA. The conflict is still unnamed, though the SHA echo is the check that catches a stale turn.",
          "required_change": "Amend that mo-review clause explicitly in the change list, stating why the SHA echo is evidence rather than metadata repetition."
        }
      ],
      "assumptions": [
        "herdr api schema --json (protocol 19, schema_version 1) as installed here is the version the design targets; I verified TabCreateParams, PaneSplitParams, PaneRenameParams, AgentStartParams.timeout_ms bounds, AgentViewBuiltinField, ReadSource and the EventMatch union directly.",
        "chmod 700 on a per-reviewer scratch directory protects against other users, not against a same-UID sibling reviewer, so H17 tests obscurity rather than a permission boundary.",
        "'Copy findings verbatim' in the user's report expresses the prohibition on the orchestrator grading findings, not a requirement that the text pass through its context."
      ],
      "round": 2,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: true
