## Facts & Constraints (White Hat)

Before judging the amendment I had to pin down what the installed backend actually offers, because the whole amendment is a statement about Orca's public surface, and this spec elsewhere (§2.5) forbids naming a foreign CLI's commands/fields from memory. Grounding I established read-only on this machine (Orca 1.4.198, `gh 2.100.0`, `glab 1.117.0` — the last two match §2.5 exactly):

- `orca project list --json` returns per-project `kind` (`git`/`folder`), `id`, `gitRemoteIdentity`, `sourceRepoIds`; `orca repo list --json` returns `path`/`kind`; `orca worktree list|show|current`, `orca terminal list`, `orca orchestration worker-list` all exist. So the §17 open question "is there a version-matched read-only surface reporting project identity, registration kind and inventory" is substantially *already answerable* — the spec is more pessimistic than reality, and §7.1 could name concrete fields instead of leaving them open.
- `orca orchestration worker-start --help` confirms `--worktree <current|selector|new-child|new-top-level>` where selector includes `identity:`, `id:<repo-id>::<path>`, `name:`, `branch:`, `issue:`, `path:`. So "pre-registered worktree inside the same project" — the route the user himself proposed in the §20 verbatim intake — is a real, selectable route that §7.1 does not enumerate. The same help also states "Remote current and new-child are invalid", i.e. for `--on <server>` both of §7.1's routes 1 and 2 collapse.
- The `Repos:` section of `orca --help` has `repo list|add|show|set-base-ref|search-refs` — **no** deregistration command. The nearest candidates are `project setup-delete` and `worktree rm`, whose semantics for a path added by `repo add` are unverified. §7.1's rollback clause depends on a "подтверждённая public Orca cleanup capability" that installed help does not obviously provide.
- `git hash-object docs/backlog.md` = `4b6a958c…`, SHA-256 = `ce8113b2…` — both match §3 byte-for-byte, so the intake ledger anchor is real and the amendment did not invalidate it.
- Relevant existing contracts the amendment must live with: `src/skills/mo-review-orca/SKILL.md:28` ("Each reviewer proves the full SHA and clean status"), `shared/references/review-protocol.md` ("Dirty or mismatched checkout … is `UNKNOWN`"; the full gate may be run "only after the caller grants the shared lock **or a worktree of your own**"), and `CLAUDE.md` ("Run a potentially mutating diagnostic only in an isolated disposable location, never in the frozen candidate worktree").

The amendment's core normative act — forbidding `git worktree add` + `orca repo add` as a `new-child` fallback and making project inventory invariance a checked precondition — is feasible, cheap and correctly placed. What is *not* yet feasible-as-written is the replacement route it offers.

## Risks & Failure Modes (Black Hat)

**1. Route 2 dissolves worktree isolation into the executor's live worktree, and nothing freezes it.** §7.1 route 2 runs both reviewers "отдельными terminals/sessions на frozen current candidate внутри того же project". In the amendment's own scenario the caller *is* a hot executor that owns fixes and commits remediation. Three existing invariants collide and the spec resolves none: (a) each reviewer must prove clean status and exact SHA — this repo is dirty right now (`M docs/backlog.md`, untracked `spec/**`), and §3 explicitly preserves unrelated dirty files, so route 2 yields routine `dirty_candidate`/`candidate_mismatch` → `UNKNOWN` instead of reviews; (b) the executor stays hot and commits during/after `FINDINGS`, so HEAD moves under the reviewers with no stated freeze obligation, no freeze observation, and no typed outcome for "freeze broken"; (c) review-protocol grants full-gate execution either under a caller lock **or in a worktree of your own** — route 2 removes the second option and CLAUDE.md forbids mutating diagnostics in the candidate worktree, so route 2 silently narrows review depth for folder projects without saying so or requiring it to be declared in `Scope and checks`. The word "frozen" is doing load-bearing work that is nowhere defined as an obligation on the caller-executor.

**2. Route 2's precondition is unprovable, which silently converts the amendment into a ban on executor-launched review in folder projects.** Route 2 is allowed only "если public route доказывает exact candidate identity и **отсутствие write ownership**". No Orca surface can prove absence of write ability for a terminal in a writable worktree; read-only-ness is a contractual property of the reviewer agent, not a capability of the route. Read strictly, every folder project falls to route 3 → `REVIEW-RESOURCE-UNSUPPORTED`. That contradicts the task's explicit instruction to *preserve* current reviewer workers, and it re-creates exactly the pressure that produced the incident: an agent told "unsupported" while the user expects two reviewers is the agent that invents a bypass. Either "write ownership" must be redefined as (candidate identity proof + contractual non-mutation + caller freeze + post-review clean/SHA re-verification), or the spec must state plainly that folder-project review is blocked pending registration change.

**3. No branch for "caller has no Orca project context at all", or unreadable inventory.** §7.1 is defined entirely over "текущий Orca project". On this very machine `orca worktree current --json` returns `{"ok":false,"error":{"code":"selector_not_found"}}` for `/Users/alex/Develop/meta-o`, and meta-o appears in neither `project list` nor `repo list`. The mandatory pre-start snapshot therefore has no object; route 1 and route 2 are both undefined ("same project" is vacuous), and route 3 sends Meta-O's own dogfooding review to `REVIEW-RESOURCE-UNSUPPORTED`. Worse, the only obvious way to obtain a project identity is `orca repo add` — the forbidden command — applied to the main workspace, which §7.1 permits only via `mo-setup` + human confirmation for a *registration kind change*, not for an unregistered workspace. Likewise there is no typed outcome for "runtime unreachable / inventory unreadable", though §2.5's own discipline demands one everywhere else.

**4. Orca's surface is asserted from memory, against §2.5.** §7.1/§14/B41 make normative claims about `new-child` refusal for folder projects, `orca repo add` creating a project, `worker-release` returning `no_owned_resource`, "project inventory", "registration kind (`git`/`folder`/unknown)" and "two reviewer tabs" — none tied to a recorded fixture, and §14.1 layer 2 lists recorded surfaces only for `gh`, `glab` and `orca skills list`. §2.5 is scoped to "§4.6 и §8", so the Orca orchestration/project surface escapes the very rule the council added to stop invented flags. Since the fields exist (`project list --json.kind`, `worktree current`, `terminal list`, `worker-list`), this is cheap to fix and its absence is what makes the section unexecutable by a weak model: "снять read-only snapshot … project inventory" names no command and no field, and "UI должен показывать две reviewer tabs" names an unobservable surface (UI) as the invariant instead of a CLI predicate.

**5. `REVIEW-RESOURCE-UNSUPPORTED` lives outside every closed vocabulary in the spec.** §5.3 defines a closed `Unknown-Reason` enum (`unreadable`, `candidate_mismatch`, `dirty_candidate`, `malformed_report`, `retrieval_failure`, `handoff_failure`, `review_incomplete`) and a pair-aggregation table; §8.3 defines a closed `MO-BACKLOG/1` reason enum. The new token matches neither naming convention nor either enum, and the spec never says what the *caller* publishes when a pair never starts: there is no pair verdict row, no counts semantics, no §6.1 handoff row (no namespace, no consumer, no ack), and no §14 deterministic fixture for it (only E2E B41). An implementer must invent the plumbing.

**6. The prohibition is narrower than the failure mode.** The incident's root cause is "`new-child` refused for a folder project" — which equally hits `mo-orchestrate-orca` executor workers and `mo-e2e` actors. §7.1 is scoped to the reviewer pair, §16's forbidden entry is scoped "как fallback для reviewer pair", and B41 tests only review. Nothing prevents an orchestrator from doing `repo add` for an E2E worktree tomorrow. U-20 authorizes at least the review case; generalizing the inventory-invariance rule to "any Meta-O-started Orca resource" is strictly safer and does not contradict the frozen decision.

**7. Rollback and residue are under-specified.** §7.1 allows automatic rollback of exact-owned registrations "через подтверждённую public Orca cleanup capability" — installed `orca --help` exposes no repo removal, so the clause may be dead text with no typed alternative beyond "передаются человеку". Also: the incident already created two registrations and two worktrees on the user's machine; §15 slice 13 requires reproducing incidents and filing Issues but nothing requires auditing/reporting pre-existing stray reviewer projects, and no rule requires post-rollback proof that inventory returned to the pre-start baseline (only "inventory не меняется ни при старте, ни при cleanup" for the happy path).

**8. §14's folder-project fixture asserts behavior in the deterministic layer.** "folder-project fixture воспроизводит отказ `new-child`: … `orca repo add`/raw worktree fallback не вызываются" is a claim about what an agent does not do — which §14.1 itself assigns to the eval/E2E layer ("Чего не доказывает: что агент её применил") and which R4/R5 forced to have a *named executable subject*. Unless the subject is a recording `orca` stub (unstated), this bullet re-opens the boundary the spec is proud of.

## Strengths & Benefits (Yellow Hat)

The amendment is unusually well-integrated for a late insert: U-20 → D-60 → §1 outcome bullet → §2.2 (`§A-SESSION-01` content already says "same-project reviewer resources") → §3.1 workaround row → §7.1 normative section → §14 deterministic bullet → B41 → §16 forbidden entry → §17 open question → §20 verbatim source. I looked for an orphaned ledger row and found none for this round.

The central insight is right and non-obvious: it separates *review isolation* (separate agent sessions, Dispatch and terminal handles) from *project registration*, and makes "project inventory unchanged at start and at cleanup" the enforcing invariant rather than enumerating forbidden commands — which is the only formulation that survives an agent inventing a new registration path (`project setup-existing-folder`, `setup-clone`, `--worktree new-top-level`). Refusing to let "worktree isolation" be an end in itself for read-only review is the correct architectural call. Preserving `new-child` for genuine Git projects, routing capability gaps into an upstream Orca Issue via §3.1 rather than into permanent methodology, and forbidding silent low-level fallback ("не имитируя успешный pair") all match the spec's existing posture. The rollback restriction to exact-owned resources, with foreign/ambiguous resources handed to the human with recoverable commands, is the right safety default. B41's two-sided shape (folder-project negative + Git-project positive with Orca-owned child resources) is the right test pair.

Nothing here reopens a frozen decision, and the amendment does not smuggle in a state store, helper or wrapper.

## Alternatives & Creative Ideas (Green Hat)

- **Adopt the user's own third route explicitly.** `worker-start --worktree path:<p>|identity:<id>|branch:<b>` targets an *already-registered* worktree of the current project. For a Git project this gives clean, frozen, per-reviewer checkouts *without* touching inventory — strictly better than route 2. If it is infeasible for folder projects (likely: no git-backed worktrees), say so and open-question it, rather than silently dropping half of what the user wrote in §20.
- **Make "Git-capable registration" the primary remediation, not a footnote.** Route 3 already points at `mo-setup`; invert the emphasis: for folder projects the *recommended* outcome is a human-confirmed registration upgrade, with `REVIEW-RESOURCE-UNSUPPORTED` as the interim state, and an explicit "single-worktree degraded review" mode that is allowed only with a declared caller freeze and a declared scope reduction (no full gate) recorded in `Scope and checks`.
- **Name a freeze token.** A caller-published `Candidate-Freeze: <sha> until <handle-set>` line (same narrow-transport style as `Review-Handoff-Ack`) plus mandatory reviewer re-verification of HEAD+clean at report time turns "frozen" from an adjective into an observable contract, and makes route 2 falsifiable instead of aspirational.
- **Inventory digest instead of prose.** Require a pre/post `orca project list --json` + `orca repo list --json` comparison over the sorted set of project `id`s and repo `path`s as the literal evidence field; any delta is a defect of the run, reported with both sets. That is a two-command, zero-state check, consistent with "no manifest/receipt".
- **Fold the incident into a single stronger invariant** ("no Meta-O skill may change Orca project/repo inventory; only Orca-owned worktree/terminal resources may be created and only within the current project"), owned by `§A-SESSION-01`, referenced by review, orchestration and E2E alike.

## Completeness & Process (Blue Hat)

Missing or under-specified, in priority order: the caller-freeze obligation for route 2; a branch for absent/unreadable project context; the concrete read-only surface and fields for identity/kind/inventory/tab attribution; placement of `REVIEW-RESOURCE-UNSUPPORTED` in the existing typed vocabularies and in §5.3/§6.1; recorded-surface coverage for the Orca commands §7.1 relies on; scope generalization beyond the reviewer pair; the deregistration capability (and the already-existing residue) in §17/§15; and a named subject for the §14 folder-project fixture. The amendment adds one E2E id (B41) and one deterministic bullet, which is proportionate; it does not add a live eval case for the folder-project decision, though §13's embedded list enumerates comparable contracts — a small asymmetry given that "agent chooses route or reports unsupported" is exactly behavior, not text.

**Traceability.** The ledger exists (§18) with both a `U-*` frozen-decision table and a `D-*` table. U-20 is verbatim-consistent with the frozen decision block. D-60 is present, adopted, sourced to U-20/incident 2026-09-15, and resolves into §3.1, §7.1 and B41 as claimed. All rejected/forbidden items I checked (D-19, D-20, subagents, clean verifier, the new `repo add` fallback) appear in §16. I found no adopted ledger row without a body location, and no body norm lacking a ledger anchor for this round. One soft gap: D-60's text says "folder project получает доказанный same-project current route либо typed `REVIEW-RESOURCE-UNSUPPORTED`" while §17 simultaneously says whether that route exists is unknown — so D-60 is adopted conditionally on an unresolved fact, which should be visible in the decision row itself.

**Decomposition readiness.** Slices 1–4 and 6–14 are executable. Slice 5 is not: an implementer must decide what "frozen current candidate", "отсутствие write ownership" and "две reviewer tabs" mean operationally, choose the verification commands and fields, decide whether folder-project review is degraded or blocked, and invent the caller-side plumbing for a pair that never starts. Those are architectural decisions, not execution.

**Weak-model executability.** §7.1 is the weakest section in an otherwise very concrete document. Compare §8.1 (three exact commands, explicit readiness predicate), §8.2 (`git check-ignore -v --no-index` plus `git ls-files --error-unmatch`), §8.3 (`MO-BACKLOG/1` token grammar with a closed reason enum) with §7.1's "снять read-only snapshot identity … и project inventory", "public route доказывает … отсутствие write ownership", "UI должен показывать две reviewer tabs". A weak model will guess — and the most available guess is the bypass the amendment exists to forbid. The prohibition itself (do not run `git worktree add` / `orca repo add`) is executable; the positive path is not.

**Contract completeness.** No TBDs leak outside §17. But three contracts are declared without shape: the inventory snapshot (no fields, no comparison rule), the unsupported outcome (no enum membership, no caller publication rule, no deterministic fixture), and the rollback capability (no command, no post-state assertion). Everything else in this spec that reached this maturity level got a token grammar or a closed enum; §7.1 did not.

I actively tried to find that these concerns were non-issues. Two candidates dissolved: the `--worktree new-top-level` / `project setup-*` loophole is genuinely covered by "или эквивалентную регистрацию" plus the inventory invariant, and the §3.1 row's conditional Issue obligation is consistent with how the other nine rows are written. The remaining items did not dissolve, and the route-2 ones are load-bearing for the exact scenario the user reported.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "The amendment's prohibition is correct, well-traced (U-20 → D-60 → §1/§2.2/§3.1/§7.1/§14/B41/§16/§17/§20) and architecturally sound: it separates review isolation from Orca project registration and makes project-inventory invariance the enforcing check rather than a blacklist of commands. The replacement route, however, is not implementable as written. Route 2 puts both reviewers in the caller-executor's live worktree while imposing no freeze obligation, colliding with the existing clean-status/exact-SHA precondition (this repo is dirty right now, and §3 preserves unrelated dirty files), with the hot executor's remediation commits, and with review-protocol's full-gate rule that grants gate execution only under a caller lock or 'a worktree of your own'. Its precondition 'public route proves absence of write ownership' is unprovable by any Orca surface, so read strictly every folder project falls to REVIEW-RESOURCE-UNSUPPORTED — which would kill the use case the task says to preserve and re-create the exact pressure that produced the incident. §7.1 also has no branch for a caller with no Orca project context at all (verified: `orca worktree current` returns selector_not_found for /Users/alex/Develop/meta-o and meta-o is absent from project/repo inventory) or for unreadable inventory; it asserts Orca commands, typed errors and 'two reviewer tabs' without the recorded-surface discipline §2.5 imposes elsewhere and without naming the fields that do exist (`orca project list --json.kind`, `repo list`, `worktree current`, `terminal list`, `worker-list`); the new REVIEW-RESOURCE-UNSUPPORTED token sits outside every closed enum in the spec with no caller-publication or handoff semantics; the prohibition is scoped to the reviewer pair although the same folder-project failure hits orchestrator and E2E workers; and the rollback clause presumes a public deregistration capability that installed `orca --help` does not expose, with no audit duty for the two registrations the incident already created. One more bounded editing round on §7.1 (plus §5.3/§6.1/§14/§16/§17 touch-ups) would make this adoptable without reopening any frozen decision.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "R6-ROUTE2-FREEZE-CONFLICT",
          "severity": "critical",
          "area": "§7.1 same-project reviewer route vs review-protocol",
          "description": "Route 2 runs both reviewers as separate terminals on the caller's current worktree, but the caller in the amended scenario is a hot executor that owns fixes and commits remediation. The spec imposes no freeze obligation on the caller, no freeze observation, no typed outcome for a broken freeze, and does not reconcile the loss of per-reviewer worktrees with the full-gate/mutating-diagnostic rules.",
          "evidence": "src/skills/mo-review-orca/SKILL.md:28 'Each reviewer proves the full SHA and clean status'; shared/references/review-protocol.md 'Dirty or mismatched checkout ... is UNKNOWN' and 'only after the caller grants the shared lock or a worktree of your own'; CLAUDE.md 'Run a potentially mutating diagnostic only in an isolated disposable location, never in the frozen candidate worktree'; spec §5.3 typed code `dirty_candidate`; spec §3 keeps unrelated dirty files (this worktree is currently dirty: M docs/backlog.md, untracked spec/**); spec §7 keeps both reviewers hot for follow-up while the executor commits.",
          "required_change": "Define 'frozen current candidate' as an explicit caller obligation for the whole review window (no writes, no commits, no checkout, no mutating diagnostics in that worktree), with a stated observable proof (HEAD + clean status re-verified by each reviewer at report time) and a typed outcome when the freeze cannot be held or is broken. State explicitly that route-2 reviewers may not run the project's full gate (or name the disposable location they may use) and require that reduction to be declared in `Scope and checks`."
        },
        {
          "id": "R6-ROUTE2-UNPROVABLE-PRECONDITION",
          "severity": "critical",
          "area": "§7.1 route selection",
          "description": "Route 2 is gated on a public route proving 'отсутствие write ownership', which no Orca surface can establish for a terminal in a writable worktree; read-only-ness is a contractual property of the reviewer, not a route capability. Strictly applied, every folder project therefore lands on REVIEW-RESOURCE-UNSUPPORTED, blocking the executor-launched review the task requires to be preserved and re-creating the incentive that produced the incident.",
          "evidence": "Spec §7.1 route 2 wording; `orca orchestration worker-start --help` offers only placement selectors (current/new-child/new-top-level/identity/path/branch) with no read-only or write-restricted mode; spec §7.1 route 3 forces typed unsupported when 'same-project current route не даёт нужной изоляции или exact-SHA proof'.",
          "required_change": "Replace the unprovable precondition with a concrete, checkable conjunction (exact candidate identity proof by named command/field + contractual reviewer non-mutation + caller freeze token + post-review HEAD/clean re-verification), or state honestly that folder-project review is unsupported until registration is upgraded, and say which of the two the implementation must deliver."
        },
        {
          "id": "R6-NO-PROJECT-CONTEXT-BRANCH",
          "severity": "major",
          "area": "§7.1 preconditions / §17",
          "description": "The invariant is defined entirely over 'текущий Orca project', with no branch for a caller that is not inside any Orca-managed project or worktree, and no typed outcome for unreadable inventory (runtime unreachable, partial graph). In that state routes 1 and 2 are undefined and route 3 blocks review, while the only obvious way to obtain a project identity is the forbidden `orca repo add`.",
          "evidence": "`orca worktree current --json` in /Users/alex/Develop/meta-o returns {\"ok\":false,\"error\":{\"code\":\"selector_not_found\"}}; meta-o appears in neither `orca project list --json` nor `orca repo list --json` (four unrelated projects only); spec §7.1 mandates a pre-start snapshot of current project identity, kind, candidate worktree and inventory with no failure branch.",
          "required_change": "Add explicit branches for (a) caller not inside any Orca-managed project/worktree and (b) unreadable or partially readable inventory/runtime: both must produce a typed needs_attention/unsupported outcome with the observed error code, must forbid obtaining a project by registering the workspace without the §7.1 route-3 human-confirmed `mo-setup` path, and must not be satisfiable by `repo add`."
        },
        {
          "id": "R6-ORCA-SURFACE-NOT-RECORDED",
          "severity": "major",
          "area": "§2.5, §7.1, §14.1 layer 2, B41",
          "description": "§7.1 makes normative claims about Orca's surface (new-child refusal for folder projects, `orca repo add` creating a project, `worker-release` returning no_owned_resource, registration kind git/folder/unknown, project inventory, 'two reviewer tabs' in the UI) without naming the commands/fields and without the recorded-surface discipline §2.5 applies to §4.6/§8. 'UI должен показывать' is not an agent-observable predicate.",
          "evidence": "Spec §2.5 scopes the recorded-fixture rule to §4.6 and §8 only; §14.1 layer 2 lists fixtures only for gh/glab/`orca skills list --json`; verified existing surfaces that the spec fails to name: `orca project list --json` (field `kind`: git/folder, `id`, `sourceRepoIds`), `orca repo list --json` (`path`, `kind`), `orca worktree current|list|show`, `orca terminal list`, `orca orchestration worker-list`.",
          "required_change": "Extend §2.5/§14.1 layer 2 to the Orca orchestration/project surfaces used by §7.1, and rewrite §7.1 and B41 in terms of named read-only commands and fields (e.g. sorted set of project ids from `orca project list --json` plus repo paths from `orca repo list --json` compared pre/post; reviewer handle attribution via a named terminal/worker listing), replacing the UI-tab phrasing with a CLI-checkable predicate."
        },
        {
          "id": "R6-UNSUPPORTED-CODE-OUTSIDE-CONTRACTS",
          "severity": "major",
          "area": "§5.1/§5.3 typed codes, §6.1 handoff, §14",
          "description": "REVIEW-RESOURCE-UNSUPPORTED is introduced without membership in any closed vocabulary and without caller-side semantics: it is absent from the §5.3 Unknown-Reason enum, has no row in the pair-aggregation table, no §6.1 handoff/consumer/cleanup row (no namespace is ever created), no counts/verdict publication rule, and no deterministic fixture (only E2E B41).",
          "evidence": "Spec §5.3 closed enum: unreadable, candidate_mismatch, dirty_candidate, malformed_report, retrieval_failure, handoff_failure, review_incomplete; §5.3 aggregation table rows cover only UNKNOWN/structural/transport/missing-report cases; §8.3 shows the spec's own convention for closed reason enums; §14 review fixtures enumerate the enum without the new code.",
          "required_change": "Either add a typed code (e.g. `resource_unsupported`) to the §5.3 enum and a pair-aggregation row, or state explicitly that REVIEW-RESOURCE-UNSUPPORTED is a pre-review start failure outside the response grammar and define what the caller publishes (no pair, no counts, no namespace, no ack) plus a deterministic fixture for it."
        },
        {
          "id": "R6-PROHIBITION-SCOPE-NARROW",
          "severity": "major",
          "area": "§7.1, §16, §14/B41 scope",
          "description": "The root cause (new-child refused for a folder project) applies equally to orchestrator executor workers and E2E actors, but the inventory-invariance rule, the forbidden-fallback entry and the tests are all scoped to the reviewer pair, leaving the same bypass available to mo-orchestrate-orca and mo-e2e.",
          "evidence": "Spec §7.1 heading 'Same-project reviewer resource invariant'; §16 entry 'raw git worktree add + orca repo add ... как fallback для reviewer pair'; B41 covers standalone/executor review only; `worker-start --worktree new-child` is used for any worker class, and `--worktree` selectors plus `repo add`/`project setup-existing-folder`/`setup-clone` are global.",
          "required_change": "Generalize the norm in §7.1/§16 to all Meta-O-started Orca resources (no Meta-O skill may change Orca project/repo inventory; only Orca-owned worktree/terminal resources inside the current project may be created), own it in §A-SESSION-01, and extend at least one existing orchestration/E2E scenario to assert inventory invariance for non-reviewer workers."
        },
        {
          "id": "R6-ROLLBACK-CAPABILITY-AND-RESIDUE",
          "severity": "minor",
          "area": "§7.1 rollback, §15 slice 13, §17",
          "description": "The rollback clause presumes a confirmed public Orca cleanup capability for exact-owned registrations, but installed help exposes no repo deregistration command; the spec neither names a candidate, nor open-questions its existence, nor requires post-rollback proof that inventory returned to the pre-start baseline, nor requires reporting the two stray registrations the incident already created on the user's machine.",
          "evidence": "`orca --help` Repos section: repo list | add | show | set-base-ref | search-refs (no remove); nearest candidates `project setup-delete`, `worktree rm` are unverified for repo-add paths; §20 transcript states the agent intended to delete the two temporary registrations and worktrees; §15 slice 13 requires reproducing incidents but no residue audit.",
          "required_change": "Add to §17 the open question whether a public deregistration capability exists for a path added by `orca repo add`; require rollback to end with a pre/post inventory equality proof or an explicit handover of exact handles plus a recoverable command; and add to slice 13 a read-only audit that reports any pre-existing stray reviewer project/worktree registrations to the human without deleting them."
        },
        {
          "id": "R6-FOLDER-FIXTURE-NO-SUBJECT",
          "severity": "minor",
          "area": "§14 deterministic proof vs §14.1 layer boundary",
          "description": "The new deterministic bullet claims a folder-project fixture proves that `orca repo add` and raw worktree fallback 'не вызываются' — a statement about agent behavior, which §14.1 assigns to the eval/E2E layer and which the council's own rule requires to have a named executable subject.",
          "evidence": "Spec §14 bullet 'folder-project fixture воспроизводит отказ new-child: inventory остаётся неизменным, orca repo add/raw worktree fallback не вызываются'; §14.1 layer 1 'Чего не доказывает: что агент её применил'; contrast with the backlog bullets that name `make mo-backlog-empty` as the subject.",
          "required_change": "Name the executable subject (e.g. a test-only recording `orca` stub under tests/ with an explicit statement that it is not shipped in skills/ and never calls the real CLI), or move the 'fallback not invoked' assertion entirely into B41/live eval and keep only the structural/inventory-comparison claim in the deterministic layer."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "R6-PREREGISTERED-WORKTREE-ROUTE-DROPPED",
          "severity": "minor",
          "area": "§7.1 route table vs §20 intake",
          "description": "The user's own remediation proposal in the verbatim amendment ('заранее зарегистрированные worktree внутри одного проекта') is a real selectable route and is neither adopted nor explicitly refuted; §7.1 jumps from new-child to shared-current to unsupported.",
          "evidence": "`orca orchestration worker-start --help` --worktree selectors include identity:, id:<repo-id>::<path>, name:, branch:, issue:, path:; §20 verbatim text proposes exactly this route; §7.1 lists only three routes.",
          "required_change": "Add the pre-registered same-project worktree route to §7.1 with its own proof requirements, or record in §17 why it is infeasible for folder projects."
        },
        {
          "id": "R6-REMOTE-HOST-CASE",
          "severity": "minor",
          "area": "§7.1 route table",
          "description": "For workers started on a connected Orca server both `current` and `new-child` are invalid, so routes 1 and 2 collapse and only new-top-level remains — which the amendment implicitly forbids as inventory-changing.",
          "evidence": "`orca orchestration worker-start --help` note: 'Remote current and new-child are invalid; discover an exact remote selector or use new-top-level.'",
          "required_change": "State that remote reviewer placement is out of scope, or give it an explicit typed unsupported outcome."
        },
        {
          "id": "R6-D60-CONDITIONAL",
          "severity": "minor",
          "area": "§18 ledger row D-60 vs §17",
          "description": "D-60 is recorded as adopted while §17 still leaves open whether the same-project route it depends on exists, so the row hides its own conditionality.",
          "evidence": "D-60 text 'folder project получает доказанный same-project current route либо typed REVIEW-RESOURCE-UNSUPPORTED'; §17 open question on the version-matched Orca surface and multiple same-project terminals on one frozen candidate.",
          "required_change": "Mark D-60's route-2 half as conditional on the §17 finding, so an implementer cannot read it as a settled capability."
        }
      ],
      "assumptions": [
        "The Orca surfaces I probed read-only (orca --help, status, project list --json, repo list --json, worktree current/list, worker-start --help) on 1.4.198 are representative of the version this spec targets; the spec pins no orca version, so a different installed version could change the new-child/folder facts but not the structural findings.",
        "I treated 'проработать этот incident при реализации' as requiring an implementable positive route plus the prohibition, not the prohibition alone; if the user's intent were only to forbid the bypass and accept blocked review in folder projects, findings R6-ROUTE2-UNPROVABLE-PRECONDITION and R6-ROUTE2-FREEZE-CONFLICT would reduce to 'say so explicitly'.",
        "I did not read or reuse anything under spec/** (two untracked council bundles are present); all grounding came from tracked repo files and live read-only CLI probes.",
        "The dirty state of this worktree (M docs/backlog.md, untracked spec/**) is the normal pre-migration state described in §3 rather than an anomaly, which is why I treated route 2's clean-status collision as a routine rather than exotic failure."
      ],
      "round": 1,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
