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
      "target_id": "proposal-1",
      "approval_score": 5,
      "would_adopt": false,
      "summary": "Analytically the strongest document of the two — it correctly refuses the literal 'put it in mo-qc' reading, invents no agent-settable closure marker, handles unresolvable CI includes and ci_config_path with real §2.5/ISS-15 discipline, and refuses to name the GitLab draft variable from memory. But its structural core is broken against this repository: `mo-test` runs `node --test \"tests/*.test.mjs\"`, so the proposed `tests/backlog-closure-gate.test.mjs` is executed by `mo-qc`, silently reinstating the unconditional mid-feature empty-backlog check that §16 rejected and that this very proposal claims to preserve — and the anti-drift guard it invents (`make --dry-run mo-qc | grep backlog-closure-gate`) can never match, because the dry-run prints the glob, producing false assurance. Compounding this, the proposed CI job runs full `mo-qc`, which hard-requires node_modules plus both bash and zsh in the runner, so the merge barrier would be permanently red and therefore disabled. It also duplicates four of its seven reason codes against validation already owned by tests/backend-transition.test.mjs inside mo-qc, and contradicts itself on whether early Draft MRs are allowed.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "p1-test-glob-reopens-s16",
          "severity": "critical",
          "area": "gate placement / frozen decision",
          "description": "The closure evaluator is specified as tests/backlog-closure-gate.test.mjs and mo-backlog-empty runs the whole file, but mo-test executes `node --test \"tests/*.test.mjs\"`, so mo-qc runs the live-repo emptiness assertion. Mid-feature QC then fails the moment a legitimate observation is recorded, reopening the decision §16 rejected and contradicting the proposal's own D-47/D-48.",
          "evidence": "Makefile: `mo-test:\\n\\tnode --test \"tests/*.test.mjs\"` and `mo-qc: mo-lint contract skills-check mo-eval-cases mo-test mo-smoke`. Proposal §3.3: `mo-backlog-empty:\\n\\tnode --test tests/backlog-closure-gate.test.mjs`.",
          "required_change": "Place the live-backlog assertion outside the `tests/*.test.mjs` glob (e.g. a non-matching filename or a tests/closure/ subpath the glob does not reach), and prove the separation by an assertion that enumerates the files node --test actually collects for mo-test — not by grepping the dry-run text."
        },
        {
          "id": "p1-anti-drift-guard-ineffective",
          "severity": "critical",
          "area": "deterministic proof",
          "description": "The guard protecting §16 is `make --dry-run mo-qc | grep -q backlog-closure-gate && exit 1`. The dry-run output contains only the literal glob `tests/*.test.mjs`, never the filename, so the guard passes while the violation is active.",
          "evidence": "Verified Makefile recipe text; the filename appears nowhere in mo-qc's recipe lines.",
          "required_change": "Replace the grep-on-dry-run guard with an assertion over the resolved file set node --test expands for mo-test, asserting the closure evaluator is absent from it."
        },
        {
          "id": "p1-ci-runs-full-mo-qc",
          "severity": "major",
          "area": "CI integration",
          "description": "The proposed GitLab job executes `make mo-closure`, i.e. full mo-qc, inside a CI runner. mo-lint requires installed node_modules for `npx --no-install` and a posture self-check that hard-fails unless both bash and zsh exist; mo-test refuses to run without zsh. The job would be red for reasons unrelated to the backlog, and mo-setup would propose this shape to foreign projects.",
          "evidence": "Makefile mo-lint posture loop: `for shell_name in bash zsh; do ... else echo \"mo-posture self-check blocked\"; exit 1`; mo-test: `command -v zsh || { echo \"mo-test blocked: zsh is required\"; exit 1; }`.",
          "required_change": "Scope the CI job to the backlog-emptiness command alone, state explicitly that CI must not duplicate the full aggregate gate, and record the runner prerequisites for any project that chooses to run mo-qc in CI."
        },
        {
          "id": "p1-duplicate-schema-owner",
          "severity": "major",
          "area": "reuse / existing ownership",
          "description": "parse_error, missing_open_section, duplicate_open_section and non_entry_content duplicate validation already owned by tests/backend-transition.test.mjs inside mo-qc, which parses with markdown-it, requires h1 Бэклог + h2 Открыто, requires every later heading to be h3, and requires the three entry fields. The proposal's headline worked example (a naive counter reporting three entries on today's backlog) is a strawman, because mo-qc already rejects that document.",
          "evidence": "tests/backend-transition.test.mjs `backlogEntries()` and the test 'the backlog schema accepts empty state and validates every future deferral'; executed read-only, it currently fails on the intake backlog listing 15 stray h2 sections.",
          "required_change": "Name that test as the existing owner, reduce the closure gate to the genuinely missing predicate (zero h3 entries under the declared section) plus missing/unreadable handling, and reuse the existing entry-extraction shape instead of re-deriving structure rules."
        },
        {
          "id": "p1-draft-contradiction",
          "severity": "major",
          "area": "lifecycle definition",
          "description": "G2 blocks 'создание/ready-перевод MR' until mo-closure is green, i.e. no Draft MR may be opened at all; §5.3 simultaneously calls an early Draft MR normal practice and designs allow_failure handling for Draft pipelines. A reader cannot determine whether opening a Draft mid-feature is permitted.",
          "evidence": "Proposal §2.1 table row G2 'Блокирует: Создание/ready-перевод MR' vs §5 item 3 'MR, открытый рано как рабочая поверхность, — нормальная практика'.",
          "required_change": "Decide explicitly: either the gate binds only the Draft→Ready transition and merge (leaving Draft creation free), or Draft creation is also blocked and §5 must drop the early-Draft allowance."
        },
        {
          "id": "p1-path-resolution-underspecified",
          "severity": "minor",
          "area": "evaluator specification",
          "description": "The normative algorithm says the backlog path comes from the Knowledge-table link but never states how that row is identified among the ten link rows, adding an undeclared_path failure mode for a path that existing tests already hardcode.",
          "evidence": "tests/backend-transition.test.mjs asserts the literal href 'docs/backlog.md' is present in both contract files; nothing derives the path dynamically today.",
          "required_change": "Either specify the row-identification rule precisely (exact label token and column) and justify the added failure mode, or adopt the existing convention and drop the resolver."
        },
        {
          "id": "p1-retired-checker-unaddressed",
          "severity": "minor",
          "area": "knowledge identifiers / precedent",
          "description": "A backlog-closure checker was deliberately retired and the retirement is pinned by tests/backlog-provenance.test.mjs; §A-MEMORY-03 declares that provenance closed. The proposal reintroduces a near-identically named artefact without mentioning either.",
          "evidence": "tests/backlog-provenance.test.mjs authorized-deletion assertion listing 'tests/backlog-closure.test.mjs' and 'tools/backlog-closure.mjs'; spec §2.2 row §A-MEMORY-03.",
          "required_change": "Name §A-MEMORY-03 and the retirement explicitly, state why this gate is not that program, and choose a name that does not collide with the retired artefacts."
        }
      ],
      "assumptions": [
        "The task naming the brainstorm spec authorises reading it; no other spec/** artefact was inspected.",
        "`node --test \"tests/*.test.mjs\"` expands the glob internally to the same set a shell glob would, so any tests/*.test.mjs file is inside mo-qc.",
        "'Включить в qc' was correctly read by both proposals as non-literal, since a literal reading revokes §16.",
        "Foreign-project CI runners are assumed to be stock images without zsh or a pre-installed node_modules."
      ],
      "round": 1,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 5
would_adopt: false
