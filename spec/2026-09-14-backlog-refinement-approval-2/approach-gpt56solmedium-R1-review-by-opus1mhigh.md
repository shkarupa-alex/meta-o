## Facts & Constraints (White Hat)

Before judging either design I grounded the claims in the actual tree, because both proposals make load-bearing assertions about what Meta-O already owns. The verified constraints that decide this review are:

1. **`mo-qc` executes every file matching a glob.** `Makefile` defines `mo-test: node --test "tests/*.test.mjs"`, and `mo-qc: mo-lint contract skills-check mo-eval-cases mo-test mo-smoke`. Any new file named `tests/*.test.mjs` is inside `mo-qc` by construction, with no Makefile edit.
2. **Canonical backlog schema validation already exists inside `mo-qc`.** `tests/backend-transition.test.mjs` has `backlogEntries()` + the test `"the backlog schema accepts empty state and validates every future deferral"`: it parses with `markdown-it`, asserts the first two headings are exactly `h1 Бэклог` / `h2 Открыто`, asserts every subsequent heading is `h3`, and asserts each entry body contains `Причина.`, `Практическое влияние.`, `Следующий шаг.`. I ran it read-only: it currently **fails** on the intake backlog, listing the 15 stray `h2` sections. So "malformed / non-entry content under Открыто" is an already-owned, already-red invariant.
3. **`markdown-it`, `js-yaml`, `mdast-util-from-markdown`, `unist-util-visit` are already devDependencies**, and the link-presence invariant proposal 1 cites (`docs/backlog.md` linked from both contract files) does exist in `tests/backend-transition.test.mjs`. Proposal 1's repo-factual claims check out.
4. **A backlog-closure checker already existed and was deliberately retired.** `tests/backlog-provenance.test.mjs` pins the authorized retirement delta deleting `tools/backlog-closure.mjs` and `tests/backlog-closure.test.mjs`, and §2.2 of the frozen spec marks `§A-MEMORY-03` as "historical backlog-closure provenance … не переиспользуется для этой фичи".
5. **`make` collapses child exit codes.** Verified empirically: a recipe exiting 1 and a recipe exiting 2 both make `make` exit 2.
6. **`mo-qc` cannot run in a generic CI runner as-is.** `mo-lint` needs `npx --no-install` (installed `node_modules`) plus a posture self-check that hard-fails unless **both** `bash` and `zsh` exist; `mo-test` refuses to start without `zsh`.
7. **§16 of the frozen spec explicitly rejects** "unconditional empty-backlog check во всяком mid-feature QC", and §3.1 states the positive form. §16 also *explicitly allows* "test-only table evaluator в `tests/`, не вызывающий hosting CLI и не входящий в `skills/`". Both proposals read §16 correctly and neither takes the user's "включать в qc" literally — that shared judgment is right.
8. Meta-O genuinely does not own MR creation: `methodology.md` §7 frames merge as the user's decision, and in this environment MR creation lives in the unrelated `aidd-result` skill. Neither spec amendment can bind that skill.

## Risks & Failure Modes (Black Hat)

**Proposal 1 — the design defeats its own central preserved decision.** Its entire architecture rests on "`mo-qc` не изменяется ни одной строкой", yet it specifies the new evaluator as `tests/backlog-closure-gate.test.mjs` and defines `mo-backlog-empty: node --test tests/backlog-closure-gate.test.mjs` — the whole file, including the live-repo `empty` assertion. That filename matches `tests/*.test.mjs`, so `mo-test` → `mo-qc` runs it. The moment the first mid-feature observation is written to the backlog, ordinary `make mo-qc` goes red — precisely the behaviour §16 rejected and precisely the behaviour proposal 1 argues would "наказывать за исполнение собственного правила проекта". Worse, the guard it invents against this drift is `make --dry-run mo-qc | grep -q backlog-closure-gate`, which inspects text that prints as `node --test "tests/*.test.mjs"` — the filename never appears, so the guard passes while the violation is live. This is false assurance layered on the defect. It is not repairable by the proposal's own escape hatches either: an env-var or marker-file suppression is explicitly added to its own §7.11 rejected list.

**Proposal 1 — the CI job is unlikely to ever be green.** Its snippet runs `make mo-closure`, i.e. full `mo-qc`, in a GitLab runner. That requires `node_modules` present, `prettier`/`eslint`/`markdownlint` resolvable offline, and both `bash` and `zsh` installed for the posture self-check. In a stock runner image the job fails for reasons that have nothing to do with the backlog. A merge barrier that is permanently red is a barrier that gets `allow_failure: true`'d or deleted — the classic way a blocking gate becomes decorative. And `mo-setup` is instructed to propose this shape to *other people's* projects.

**Proposal 1 — Draft contradiction.** G2 blocks "создание/ready-перевод MR" until `mo-closure` is green, i.e. you may not open a Draft MR at all. §5.3 then says "MR, открытый рано как рабочая поверхность, — нормальная практика" and designs `allow_failure` handling for Draft pipelines. Both cannot be true; the reader cannot tell whether an early Draft MR is permitted.

**Proposal 1 — path resolution is underspecified and solves a non-problem.** "Путь берётся из ссылки на backlog в таблице Knowledge" never says how the backlog row is identified among ten link rows — by Russian label? by position? The existing test already hardcodes `docs/backlog.md`, so the elaborate resolver buys nothing for Meta-O while adding a new `undeclared_path` failure mode and a dependency on Knowledge-table shape that no other check depends on.

**Proposal 1 — four of seven reason codes duplicate an existing owner.** `parse_error`, `missing_open_section`, `duplicate_open_section`, `non_entry_content` are already decided by `tests/backend-transition.test.mjs` inside `mo-qc`. Its headline "worked example" — that a naive counter would report three entries on today's backlog — is a strawman: today's backlog cannot reach a green tree at all, because `mo-qc` already rejects it. Proposal 1 never names that test as the existing owner, which is exactly the "two owners of one invariant" pattern `purpose-and-architecture.md` exists to prevent.

**Proposal 2 — the documented exit contract is unachievable.** §5.2 publishes `make mo-backlog-empty` with exit `0/1/2` distinguishing PASS/BLOCKED/UNKNOWN. Verified: `make` returns 2 for *any* failing recipe, so BLOCKED and UNKNOWN collapse. An agent or CI rule branching on `$?` after `make` will classify "backlog has two open entries" as "backlog unreadable". The `BACKLOG_GATE …` text line survives and is recoverable, but the normative contract as written is wrong — and ironically proposal 1 reached the right conclusion (stable text token, not exit code) for a slightly wrong reason.

**Proposal 2 — second owner of the backlog schema.** §5.3 makes the checker re-assert canonical `# Бэклог`/`## Открыто`, absence of paragraphs/comments/lists under Открыто, and presence of the three required fields, routing violations to `backlog_invalid` / exit 2. `mo-qc` already fails the identical document via a different code path with a different verdict shape. To its credit §3 *names* the existing `mo-qc` schema layer — and then duplicates it anyway instead of extending it.

**Proposal 2 — a versioned schema literal with no consumer.** `schema: "meta-o.backlog-empty-gate.v1"` is declared in the internal type, never emitted by the CLI surface (§5.2 prints plain lines), and has no named external consumer. `CLAUDE.md` forbids manifests/receipts/digests without a named consumer, and the retired `meta-o.backlog-closure-map.v3` is the local precedent for where this leads. It is dead structure that invites future persistence.

**Proposal 2 — hardcoded path in a portable contract.** `path: "docs/backlog.md"` is typed as a string literal while §4.1 simultaneously claims foreign projects get "эквивалентную project-owned реализацию" under the same public command name.

**Proposal 2 — overclaimed deterministic proof.** §9.1 asserts a "Lifecycle contract test проверяет ordering и abort для exit 1/2". §14.1 and D-26 of the frozen spec drew exactly this boundary: deterministic fixtures prove the table/mechanism, not that an agent applies it. The live column does carry a skill eval, so the claim is fixable by relabelling, but as written it promises deterministic proof of agent behaviour.

**Proposal 2 — forbids early Draft MRs by fiat.** "Managed Meta-O flow публикует MR только после закрытия feature backlog" is a behavioural restriction the user did not ask for; the user asked for a check *at* MR creation, not a prohibition on the working-surface Draft pattern that `aidd-result` and ordinary GitLab practice use.

**Shared blind spot — the retired checker.** Both re-propose a backlog-closure checker in near-identical file positions to the ones deliberately deleted (`tools/backlog-closure.mjs`, `tests/backlog-closure.test.mjs`), and neither mentions `§A-MEMORY-03` or explains why this is not a reopening of the retired program. Proposal 1 additionally names its file `tests/backlog-closure-gate.test.mjs`, one token away from the retired name.

**Shared blind spot — default-branch enforcement in foreign projects.** Proposal 1's snippet runs on `$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH`. In any project that still treats its backlog as a durable sink (i.e. every project before Meta-O's U-02 semantics are adopted there), `mo-setup` proposing this leaves `main` permanently red. Proposal 2 scopes the job to merge-request pipelines and is safer here, though it too leaves base-branch drift unexamined.

**Shared blind spot — E2E surface mechanics.** `tests/e2e-contract.test.mjs` asserts `make mo-e2e` prints the `B1-B22` matrix. Adding B36–B38 touches the Makefile echo block and that test; both proposals list the new scenarios without naming the surface, though the parent spec's slice 11 plausibly absorbs it.

## Strengths & Benefits (Yellow Hat)

Both proposals get the hardest judgment right and independently: the user's "включить в qc" cannot be honoured literally without revoking §16, and neither caved. Both correctly refuse to treat a missing/unreadable backlog as empty, both keep the verdict three-valued, both keep `mo-setup` read-only over CI, both keep GitLab project settings (merge checks, approval rules) as a human boundary, and both state plainly that a CI job without server-side "pipelines must succeed" is advisory rather than enforcing. That last point is the one most designs get wrong, and both got it.

Proposal 1's distinctive strengths are real: the observation that "branch pipeline vs merge-request pipeline" is already the objective closure signal, so no agent-settable closure marker is needed (and its explicit rejection of env-var closure markers as disguised state); the `include:` graph rule that unresolvable `remote`/`template`/`project`/`component` includes yield `unknown` with enumeration rather than a false `absent`; resolving `ci_config_path` through `glab` under the §2.5/D-45/ISS-15 discipline instead of assuming `.gitlab-ci.yml`; refusing to name the GitLab draft variable from memory and deliberately shipping a fail-closed snippet until a recorded fixture confirms it; the requirement that a `not_empty` verdict enumerate every open heading so that silent deletion becomes visible in the diff next to its dispositions; and the honest framing that the gate is legitimate only because U-03/§B-HUMAN-04 already gave every entry an honest exit. Its alternatives table and identifier hygiene are the most complete of the two.

Proposal 2's distinctive strengths are equally real and, on the two questions that decide implementability, better. It is the only one that identifies that **CI structurally cannot block MR creation** — the pipeline exists only after the object does — and therefore splits ownership correctly: pre-create barrier is lifecycle-owned, merge barrier is CI-owned. It requires the gate to re-run against the *current* source SHA before merge and to be invalidated by any new commit, which closes the window proposal 1 leaves open between G1's frozen SHA and an MR whose head later moves. It keeps the CI job separate from QC and explicitly says not to duplicate `mo-qc` there — which, given constraint 6 above, is the difference between a job that can run and one that cannot. Its `mo-setup` finding codes are concrete and testable, and `backlog_currently_nonempty` as an *informational* readiness state is a clean, unambiguous answer to "не заблокировать активную разработку". It also correctly declines to mint a new business identifier for what is an enforcement mechanism of an already-adopted outcome — more faithful to the business→architecture→implementation layering than proposal 1's `§B-LONGEVITY-05`, which reads as an architecture statement promoted a layer.

## Approved-boundary verification (Green Hat constrained)

I am not reopening the approved approach (skills-first, no helper layer, no state store, backlog-as-notebook, Issues-as-sink, two vendor-diverse reviewers). Within that boundary there is one **concrete contradiction** and one **critical regression**:

- **Contradiction, proposal 1:** §16's "unconditional empty-backlog check во всяком mid-feature QC — rejected" is violated by proposal 1's own file placement, and D-47/D-48 as it drafts them ("mid-feature `make mo-qc` не изменяется") are contradicted by `mo-test`'s glob. The proposal asserts the preservation it structurally breaks.
- **Regression, both:** `tests/backend-transition.test.mjs` already owns canonical backlog structure and required-field validation inside `mo-qc`. Both amendments create a second owner of that invariant, contrary to the purpose/architecture contract and to `CLAUDE.md`'s custom-checker rule. The correct narrow delta is a single additional predicate — "zero `h3` entries under the declared open section" — plus missing/unreadable handling, reusing the existing `backlogEntries()` shape rather than re-deriving it.
- **Unaddressed frozen decision, both:** `§A-MEMORY-03` and the pinned retirement of `tools/backlog-closure.mjs` / `tests/backlog-closure.test.mjs` must be named explicitly, with a stated reason why this gate is not that program and with names that do not collide.

## Completeness & Process (Blue Hat)

On coverage of the seven questions the task posed: both answer all seven. Proposal 1 is stronger on CI discovery mechanics, verdict precedence, rejected-alternatives discipline, identifier hygiene and slice mapping; proposal 2 is stronger on lifecycle placement (two barriers, SHA rebinding, merge-train/merged-results), on the practical shape of the CI job, and on the "don't block active development" answer. Neither reconciles its amendment with the existing `mo-qc` backlog test or with the retired closure checker, and neither states what happens when the base branch's own backlog is non-empty in a project that has not yet adopted notebook semantics.

Process-wise, both are correctly scoped as specification-only, both add ledger entries as `U-19` plus new `D-*` rows starting at D-47 (consistent with D-46 being the current last), both append E2E scenarios after B35 (correct — B35 is the last in the frozen spec), and both preserve U-01…U-18 / D-01…D-46. Proposal 2's §14 "Открытых продуктовых вопросов нет" sits awkwardly beside its own admission that GitLab `rules` and merge-train variables must be verified against the installed version — §2.5 makes that a recorded-fixture obligation, which proposal 1 handles explicitly and proposal 2 handles only as an assumption.

My overall judgment: proposal 2's skeleton survives contact with the repository, with three fixable defects (make exit-code contract, duplicate schema ownership, unused versioned schema literal) and one scope overreach (Draft prohibition). Proposal 1 has the better prose and the better CI-discovery section but a defect at its structural core — the evaluator lands inside the very gate it promises not to touch, guarded by a check that cannot detect it — plus a CI job that will not run in a normal runner. I would rebuild from proposal 2's lifecycle placement and CI-job scoping, import proposal 1's include-graph rule, `ci_config_path` resolution, fail-closed draft handling, stable text tokens instead of exit codes, and the enumerate-every-heading requirement, and reduce the checker to the single missing predicate on top of the existing `mo-qc` schema test.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "The skeleton survives contact with the repository. It is the only proposal that identifies that CI structurally cannot block MR creation (the pipeline exists only after the object does) and therefore splits ownership correctly — lifecycle owns the pre-create barrier, CI owns the merge barrier — and it is the only one that re-binds the gate to the current source SHA before merge, closing the window a frozen pre-freeze verdict leaves open. Keeping the CI job separate from mo-qc is the difference between a job that can run in a stock runner and one that cannot, and `backlog_currently_nonempty` as informational readiness is a clean answer to 'don't block active development'. Three defects block adoption as written: the published `make mo-backlog-empty` exit contract 0/1/2 is unachievable because make returns 2 for any failing recipe (verified), so BLOCKED and UNKNOWN collapse; the checker re-validates canonical structure and required fields already owned by tests/backend-transition.test.mjs inside mo-qc, creating two owners with two verdict shapes for one document; and a versioned `meta-o.backlog-empty-gate.v1` schema literal is declared with no named consumer and never actually emitted. It also forbids early Draft MRs by fiat, which the user did not ask for.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "p2-make-collapses-exit-codes",
          "severity": "major",
          "area": "CLI contract",
          "description": "§5.2 publishes `make mo-backlog-empty` with exit 0/1/2 distinguishing PASS/BLOCKED/UNKNOWN, but GNU make exits 2 for any failing recipe. An agent or CI rule branching on $? after make classifies 'two open entries' as 'backlog unreadable'.",
          "evidence": "Verified empirically: a recipe exiting 1 and one exiting 2 both produce `make` exit status 2.",
          "required_change": "Either make the typed verdict a stable literal token on the first output line (and say so normatively), or document that the exit-code contract holds only when the checker is invoked directly, never through the make target that the spec publishes as the public surface."
        },
        {
          "id": "p2-duplicate-schema-owner",
          "severity": "major",
          "area": "reuse / existing ownership",
          "description": "§5.3 has the new checker re-assert canonical `# Бэклог`/`## Открыто`, absence of paragraphs/comments/lists under Открыто, and presence of Причина./Практическое влияние./Следующий шаг., routing violations to backlog_invalid. mo-qc already fails the identical document through tests/backend-transition.test.mjs with a different verdict shape. §3 correctly names that existing layer and then duplicates it anyway.",
          "evidence": "tests/backend-transition.test.mjs asserts exactly those structural and field invariants with markdown-it; executed read-only it currently fails on the intake backlog.",
          "required_change": "Reduce the closure checker to the one predicate mo-qc deliberately does not assert (zero open entries) plus missing/unreadable handling, reusing the existing entry-extraction logic, and state that structure and field validation remain owned by the mo-qc schema test."
        },
        {
          "id": "p2-unused-versioned-schema",
          "severity": "minor",
          "area": "architecture constraint",
          "description": "`schema: \"meta-o.backlog-empty-gate.v1\"` is a versioned schema literal with no named external consumer, and the CLI surface in §5.2 emits plain text lines, so the structure is never actually produced. The project contract forbids manifests/receipts/digests without a named consumer, and the retired meta-o.backlog-closure-map.v3 is the local precedent for where such literals lead.",
          "evidence": "Proposal §5.1 type definition vs §5.2 output samples; CLAUDE.md 'Do not create a manifest, receipt, digest or baseline without a named external consumer'; tests/backlog-provenance.test.mjs pins the retired v3 closure map.",
          "required_change": "Drop the schema literal and version tag, or name the external consumer that reads it and show the surface on which it is emitted."
        },
        {
          "id": "p2-draft-mr-prohibition",
          "severity": "major",
          "area": "scope / lifecycle",
          "description": "§2.1 states the managed flow publishes an MR only after backlog closure and that Draft MRs are not an exception, prohibiting the early-Draft working-surface pattern. The user asked for a check at MR creation and at merge, not for a prohibition on Draft MRs; in this environment MR creation is owned by an unrelated skill that uses Draft MRs.",
          "evidence": "Proposal §2.1 'Создание Draft MR исключением не является' and §12 'Managed Meta-O flow его не создаёт до closure'.",
          "required_change": "Bind the gate to the Draft→Ready transition and to merge, leaving Draft creation permitted, or state explicitly that this prohibition is a new product decision requiring its own ledger row rather than an implication of U-19."
        },
        {
          "id": "p2-overclaimed-deterministic-proof",
          "severity": "minor",
          "area": "acceptance",
          "description": "§9.1 claims a deterministic 'Lifecycle contract test проверяет ordering и abort для exit 1/2'. §14.1 and D-26 of the frozen spec explicitly draw the line that deterministic fixtures prove the table/mechanism, not that the agent applies it; agent application is proved by evals.",
          "evidence": "Spec §14.1 layer table and D-26 'таблица — не поведение агента'.",
          "required_change": "Relabel the deterministic column to what a fixture can actually assert (checker verdict for a given tree) and move ordering/abort entirely into the live eval column."
        },
        {
          "id": "p2-hardcoded-path-vs-portability",
          "severity": "minor",
          "area": "portability",
          "description": "The result type pins `path: \"docs/backlog.md\"` as a string literal while §4.1 simultaneously promises foreign projects an equivalent project-owned implementation under the same public command name.",
          "evidence": "Proposal §5.1 type definition; §4.1 portability claim.",
          "required_change": "Make the path a project-contract input with an explicit fallback, and state that a project whose contract does not declare a backlog document yields UNKNOWN rather than a guessed default."
        },
        {
          "id": "p2-retired-checker-unaddressed",
          "severity": "minor",
          "area": "knowledge identifiers / precedent",
          "description": "The proposal reintroduces a tools/ backlog checker without mentioning that tools/backlog-closure.mjs was deliberately retired and that §A-MEMORY-03 declares that provenance closed and not reusable for this feature.",
          "evidence": "tests/backlog-provenance.test.mjs authorized-deletion assertion; spec §2.2 row §A-MEMORY-03.",
          "required_change": "Address §A-MEMORY-03 explicitly, justify why a tools/ checker is not the retired program returning, and confirm the name does not collide."
        },
        {
          "id": "p2-binds-unowned-mr-creation",
          "severity": "minor",
          "area": "ownership boundary",
          "description": "§2.1 states the pre-create ordering as a hard lifecycle requirement owned by methodology.md, but Meta-O does not own MR creation; in this environment MR creation lives in an unrelated skill that Meta-O's spec cannot bind. §2.3 concedes the point only for externally created MRs.",
          "evidence": "shared/references/methodology.md frames merge as the user's decision; MR creation is performed by a separate non-Meta-O skill in this workspace.",
          "required_change": "State plainly that the pre-create barrier is an obligation binding only Meta-O-owned skills, that the enforceable barrier is the CI/merge side, and that an MR created outside Meta-O is covered only by the merge-side recheck."
        }
      ],
      "assumptions": [
        "The task naming the brainstorm spec authorises reading it; no other spec/** artefact was inspected.",
        "`make mo-backlog-empty` is the published public surface, so its exit semantics are the contract agents will read.",
        "GNU make (not a BSD/other make) is the target, consistent with the existing Makefile.",
        "Foreign-project CI runners are stock images, so a CI job limited to the backlog command is far more likely to stay green than one running the full aggregate gate."
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
