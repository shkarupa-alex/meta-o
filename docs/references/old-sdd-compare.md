# Сравнение spec-driven / agent-driven методологий

Дата обновления: 2026-05-25  
Фокус прохода: 10 актуальных репозиториев из запроса, локальная презентация GRACE и Ouroboros как точка сравнения.  
Примечание: commit/date для downloaded snapshots взяты из refresh-manifest; часть reference-папок хранится как exported source без собственного `.git`.

## Снимки источников

| Код | Методология | Source | Commit/date |
|---|---|---|---|
| OB | Ouroboros | локальная методология | текущий workspace |
| OSP | OpenSpec | `Fission-AI/OpenSpec` | `e441287`, 2026-05-23 |
| SK | Spec Kit | `github/spec-kit` | `a08af08`, 2026-05-22 |
| BMAD | BMAD-METHOD | `bmad-code-org/BMAD-METHOD` | `189c2b8`, 2026-05-24 |
| GSD | Get Shit Done Redux | active upstream `open-gsd/get-shit-done-redux` | `140c3ed`, 2026-05-25 |
| BDS | Beads | `gastownhall/beads` | `f8b9400`, 2026-05-24 |
| BLG | Backlog.md | `MrLesk/Backlog.md` | `7af19f8`, 2026-05-07 |
| FRG | Forge | `malakhov-dmitrii/forge` | `78f6c94`, 2026-04-19 |
| FPF | First Principles Framework | `ailev/FPF` | `04dd733`, 2026-05-23 |
| MEM | Memento | `mderk/memento` | `88bb490`, 2026-04-29 |
| MBK | memobank | `mrvladd-d/memobank` | `e200fad`, 2026-03-06 |
| GRC | GRACE | local presentation `references/grace/grace_presentation.md` | deck 2026-05-10, copied 2026-05-25 |

Для GSD исходный `gsd-build/get-shit-done` проверен, но README указывает active home в `open-gsd/get-shit-done-redux`; локальная папка обновлена Redux-версией. GRACE не является repo snapshot: это презентационный источник, поэтому numeric/research claims надо отдельно верифицировать.

## Краткая типология

| Тип | Представители | Суть |
|---|---|---|
| Strict execution methodology | OB | Task contracts, role/file scope, QA/E2E/Audit gates |
| Context-engineered execution framework | GSD, FRG, MEM | Runtime surface, parallel execution, verification/recovery |
| Product/spec facilitation | BMAD, SK, OSP | Превратить intent в specs/plans/artifact graph |
| Task/state substrate | BDS, BLG, MBK | Задачи, зависимости, память, handoff, public API |
| Reasoning/governance layer | FPF | Evidence, decisions, gates semantics, publication boundaries |
| Code-level semantic substrate | GRC | In-code contracts, semantic anchors, agent-oriented logs |

Главный вывод: это не один рынок "кто лучше делает SDD". Системы расходятся по слоям. Ouroboros силен как strict execution contract; внешние источники сильнее в ergonomics, state/API, facilitation, runtime engines, reasoning vocabulary и code-level context.

## Главная матрица

| Аспект | OB | OSP | SK | BMAD | GSD | BDS | BLG | FRG | FPF | MEM | MBK | GRC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Primary object | feat/task contract | specs + deltas | feature spec tree | PRD/spec/story | phase/workstream | issue graph | markdown task/docs | forge work unit | governed reasoning | workflow run | Memory Bank task kit | annotated codebase |
| Execution ownership | strict | delegated | medium | medium | strong | tracker only | tracker only | strong | out of scope | engine-backed | light skills | code-generation guidance |
| Gate model | deterministic QA/E2E/Audit | schema validate + AI verify | prompt/checklist gates | reviewer/QA skills | verify/review hooks | graph integrity + gates | social/DoD | typed claims + auditors | formal gate semantics, no runner | checkpoints/retries | review/verify/MB-SYNC | tests/log validators |
| State persistence | markdown artifacts + gate logs | files | files | artifacts | session/workstream state | Dolt SQL | markdown | `forge.db` + plans | normative records | `.memory_bank` + `.protocols` + `.workflow-state` | Memory Bank + protocols | code comments/contracts/logs |
| Context engineering | strict loading policy | profiles + instruction envelope | templates + presets + resolver | JIT skills + `project-context.md` | profiles/hooks/surface | `prime` SSOT | MCP resources | DB recovery + summaries | entry neighborhoods + bounded contexts | `/prime` + scoped `_context` + relay payloads | MBB/index routers | code as context carrier |
| Concurrency | task/file scope | workspace beta | `[P]` tasks | moderate | waves/worktrees | ready/claim | board/task | stream DAG + overlap | team/agent patterns | parallel blocks | waves + touched files | context collector/architect/coder/tester |
| Extensibility | skills/steerings | schemas/profiles | presets/extensions/workflows | modules/TOML | profiles/SDK/converters | CLI/plugins | MCP/Web/CLI | plugin/hooks | pattern language | Python/YAML DSL | vendored skills | Doxygen/JSDoc/regions |
| Strongest lesson | correctness contract | artifact DAG + schema-aware instructions | extension/preset stack | facilitation + decision log | context economics | DB-backed task graph | public MCP task API | anti-hallucination planning | reasoning rigor | deterministic runtime | docs-first execution kit | semantic anchors in code |
| Main caveat | context weight | weak execution proof, workspace unstable | execution proof weak | social gates | moving target/surface size | tool/DB dependency | weak gates | heavy/plugin-specific | no runtime | plugin-first, trusted workflow code | light verification | presentation-only source |

## Инструментальный слой: утилиты, хуки, runtime

Без этого разреза сравнение неполное: у многих методологий главная ценность живет не в prose-документах, а в CLI, hooks, installers, workflow engines, SDK и state stores.

| Код | CLI / команды | Hooks / automation | Machine state / API | Внутренние валидаторы и утилиты | Что важно для Ouroboros |
|---|---|---|---|---|---|
| OB | `ob init/update/sync/dev/qc/test/build/smoke/guard/check/audit/review/doctor`; `apm run init/sync/dev` | generated `.claude/.codex`; `subagent-qc`, `bash-safety`, `context-monitor`, `statusline`; `ob audit/review` wrappers | markdown tasks + `.ouroboros/artifacts/**`; context JSONL on Claude; no full query API yet | `workflow-guard`, generated AGENTS/CLAUDE/Codex configs, audit/review cross-model launchers | Strong enforcement, but tooling surface is command/gate-centric rather than query/runtime-centric |
| OSP | `openspec` npm bin; init/config/spec/change/list/view/archive/validate/schema/completion/command-generation surface | postinstall setup, telemetry; no deep runtime hook layer | file-based specs/changes/workspaces; JSON-friendly status/instructions subset | zod schemas, artifact graph, parsers, converters, schema fork/resolution | Schema-defined artifact graph + `instructions/status --json` are directly portable |
| SK | `specify` Python CLI; init/install integrations/extensions/presets/workflows; command templates for agent CLIs | extension hook protocol (`before_*`/`after_*`); bundled git extension can branch/autocommit | feature resolver via env/manifest/branch; workflow YAML has resumable-ish orchestration concepts | bash/PowerShell setup scripts, checklist gates, workflow engine (`command/prompt/shell/gate/if/switch/while/fan-out/fan-in`) | Typed lifecycle hooks + resolver + preset composition are stronger than ad hoc steering edits |
| BMAD | `bmad` / `bmad-method` installer; module/skill/agent/workflow packaging | mostly install-time and skill-time automation; no hard runtime enforcement hooks comparable to GSD/OB | skill artifacts, PRD/review reports, module config; official external module registry | installer, bundlers, doc/link/ref validators, skill validator, customization resolver | Installer/config governance and sparse overrides are the key tooling lesson |
| GSD | `get-shit-done-redux`, `gsd-sdk`, `gsd-tools`; 60+ `/gsd-*` command entries; `/gsd-surface` | `gsd-statusline`, `workflow-guard`, `prompt-guard`, `read-guard`, `context-monitor`, `graphify-update`, `phase-boundary`, `validate-commit` | `.planning/config.json`, workstream/session state, graphify stale status; SDK query handlers | package integrity checks, command/skill lint, state freshness checks, FALLOW integration, SDK runtime bridge | Best reference for runtime ergonomics: profiles, surface control, context health, SDK/status JSON |
| BDS | `bd` Go CLI: create/list/update/close/ready/show/dep/sync/prime/remember/doctor/backup/compact/gate/etc.; `--json` | git hooks; Codex/Claude plugin hooks; SessionStart/UserPromptSubmit inject `bd prime`; stealth mode avoids repo mutation | Dolt/embedded SQL as canonical issue graph; JSONL export is projection; events truth + labels cache | migrations, doctor/fix, backup, stale/duplicate queries, remote integrations, safe refusal/exit-code design | Strongest operational state model: ready/claim/gate issues and `prime` as executable context source |
| BLG | `backlog` CLI; Web UI; `backlog mcp start`; shell completions | dev `.husky`; workflow automation mostly via MCP/tools, not enforcement hooks | markdown backlog/tasks/docs/decisions; MCP resources/tools with roots discovery | tool validators, schema generators, proper-lockfile, workflow guides/resources | Best public MCP/task API reference; useful for `ob://` resources and bounded search/list |
| FRG | Claude plugin `/forge`; operations `--park/--resume/--spawn/--switch/--status/--execute/...` | `forge-hooks`, `forge-crud`, `forge-schema`, `stream-planner`, `integration-runner`, SessionStart/PreCompact tricks | persistent SQLite/global DB + `.omc/plans`, `.omc/hygiene`, `ralph-state` cache | claim validators, Skeptic, overlap/stream DAG tests, code-hygiene summaries, TDD override audit | Best anti-hallucination planning tooling; plugin-specific but claim/overlap machinery is valuable |
| FPF | no packaged CLI/runner in snapshot | no runtime hooks | normative pattern/spec records only | conformance checklists inside patterns; no executable validator | Treat as vocabulary/source for special decision/research skills, not runtime tooling |
| MEM | `memento-workflow-mcp`, `memento-workflow-server`, `memento-pi`; workflow skills | relay watchdog hook; dashboard/server events; workflow runner controls shell/context | `.workflow-state`, `.protocols`, `.memory_bank`; MCP/runtime API `start/submit/next/status/list/open_dashboard` | compiler, checkpoint, sandbox, shell executor, cleanup, dashboard helpers, dry-run tree | Best workflow engine architecture: LLM as relay, engine owns control flow and checkpoints |
| MBK | command-like Codex skills: `mb-init/from-prd/execute/verify/review/garden/harness/map-codebase`; no npm bin | no heavy runtime hooks; skill packaging and vendored shared assets | Memory Bank + protocols + markdown task cards; `.tasks`/evidence boundary | `mb-lint`, harness assets, vendoring script, docs gardening flows | Best lightweight packaging reference for small-project Ouroboros mode |
| GRC | no repo/tool snapshot; presentation-only | conceptual: context collector, validators, agent-oriented logs | code comments/contracts/regions/logs as semantic state | Doxygen/JSDoc/rustdoc conventions, headless handlers, SLM validators as proposed tooling | Only adopt with generator/lint support; manual annotation would drift |

### Tooling maturity ranking

1. **GSD** - strongest combination of installer, profiles, runtime surface, hooks, SDK and context-health automation.
2. **Memento** - best deterministic workflow engine and checkpoint/resume API.
3. **Beads** - best typed operational state and agent task graph CLI.
4. **Spec Kit** - best portable installer/integration ecosystem, preset/extension stack and workflow YAML.
5. **Forge** - strongest verification hooks around claims, streams, recovery and code hygiene, but plugin-specific.
6. **Backlog.md** - best public MCP/task API over simple markdown storage.
7. **OpenSpec** - good schema/CLI foundation, weaker runtime enforcement.
8. **BMAD** - strong installer/module/validator ecosystem, but runtime is more social than deterministic.
9. **Ouroboros today** - strong generated configs, gates and wrappers; weaker surface/query/state APIs.
10. **memobank** - lightweight skill packaging and lint, intentionally not a runtime engine.
11. **FPF / GRACE** - valuable conceptual layers, not packaged tooling in the analyzed sources.

## Где Ouroboros сильнее

1. **End-to-end correctness contract.** Большинство систем отлично планируют или хранят state, но не доказывают выполнение так жестко, как QA -> E2E -> Audit.
2. **Role/file-scope discipline.** Ни Beads, ни Backlog, ни Spec Kit не дают такого строгого "кто что может редактировать".
3. **Machine-readable gate status.** GSD/Forge/Memento близки, но у них больше narrative evidence и меньше normalized gate footers.
4. **Methodology governance.** AGENTS.md как TOC/policy contract, generated-only/source-of-truth правила и stage roles сильнее, чем у большинства.
5. **Clean-room audit habit.** Forge похож, но Ouroboros делает это частью общей task methodology.

## Где Ouroboros отстает

1. **Context tax и runtime surface.** GSD явно лучше работает с profiles, namespace routers, `/gsd-surface` и context health UX.
2. **Operational state/API.** Beads, Backlog.md, GSD и Memento лучше показывают CLI/MCP/SDK/runtime APIs.
3. **Task/state substrate.** Beads показывает, что ready/claim/gate issues/events+labels сильнее markdown state для concurrency.
4. **Extension/preset model.** Spec Kit яснее разделяет bundled/core, presets, extensions, overrides и trust boundary catalogs.
5. **Facilitation UX.** BMAD лучше доводит vague intent до PRD/spec/story without template fatigue.
6. **Workflow runtime.** Memento лучше отделяет deterministic control flow от LLM relay.
7. **Claim-level plan verification.** Forge лучше ловит phantom APIs, schema/path hallucinations, overlap conflicts and KG citation issues.
8. **Reasoning vocabulary.** FPF сильнее в decisions, comparisons, evidence decay, source restoration and publication boundaries.
9. **Code-level context.** GRACE показывает слой, которого у Ouroboros почти нет: PURPOSE/comments/contracts/semantic regions/logs as agent handoff substrate.
10. **Tooling productization.** У Ouroboros есть сильные local wrappers and generated configs, но нет GSD-like SDK, Backlog-like MCP resource surface, Beads-like query CLI, Spec Kit-like extension protocol или Memento-like workflow server.

## Что стоит утащить в Ouroboros

### Высокий приоритет

| Идея | Источник | Как адаптировать |
|---|---|---|
| Profiles/minimal runtime surface | GSD, OSP, SK | `ob init --profile=minimal/standard/full`; runtime `ob surface` |
| Namespace routers | GSD | `ob-workflow`, `ob-review`, `ob-debug`, `ob-docs` как тонкие entry skills |
| Typed hook protocol | SK, GSD, MEM | Declarative `before/after` lifecycle hooks with typed output, not prose-only steering rules |
| Typed plan claims | FRG | В plan-checker добавить `fact/design_bet/strategic` и citation checks |
| Mirage/overlap checks | FRG | Phantom APIs, path/schema mismatch, touched-file overlap, concurrency blindness |
| Decision artifacts | BMAD, FPF | `decision-log.md`, `addendum.md`, optional DRR для high-stakes choices |
| Requirements lint | SK | "unit tests for English" до decomposition/execution |
| JSON/MCP resources | BLG, OSP, GSD | `ob://workflow/...`, `ob status --json`, `ob instructions --json` |
| Ready/claim/gate state | BDS | `ob ready`, atomic claim, gate issues, stale/blocked graph query |
| `ob prime` context command | BDS, MEM | One command/API that returns current operational context instead of forcing agents to read long docs |
| Workflow engine | MEM | Долгосрочно: state machine для loops/retries/checkpoints |
| Code semantic anchors | GRC | Optional PURPOSE/contracts/semantic regions for large AI-authored modules |

### Средний приоритет

| Идея | Источник | Как адаптировать |
|---|---|---|
| Workspace logical links | OSP | `workspace.yaml/local.yaml` для multi-repo tasks без absolute paths |
| Feature resolver | SK | env/manifest/branch-prefix lookup вместо жесткого branch == feature |
| Preset composition | SK | `prepend/append/wrap` для steerings/role prompts |
| Package legitimacy checkpoint | GSD | Human checkpoint для новых dependencies |
| Code hygiene summaries | FRG, GSD | Tool-first reports, LLM reads summarized JSON |
| Agent instruction hygiene | BDS, MBK | `rules audit/compact`, MB lint, broken links, prompt bloat checks |
| Hook safety/refusal design | BDS, GSD, OB | Stable exit codes, no destructive command echoes, feature-detected trust bypasses |
| Source restoration | FPF | Summary/status/screenshot/badge не доказательство без source relation |
| Evidence freshness windows | FPF, GSD | `valid_until` for research/QA/audit/docs evidence |
| Relay payload externalization | MEM | `context_files`, `schema_file`, `result_dir` for long workflows |
| Roots discovery/bootstrap | BLG | MCP fallback `init-required` style for non-initialized projects |
| Agent-oriented logs | GRC | Logs with class/method/region anchors for debugger/tester agents |
| Docs-first lightweight mode | MBK | Minimal Ouroboros mode with Memory Bank + review/verify/MB-SYNC |

## Методологические archetypes подробнее

### OpenSpec

Лучше всего как **artifact graph and schema system**. Его сила не только в `specs/changes`, но и в strict delta grammar, schema extension model, artifact-local rules and enriched `instructions/apply` contract. CLI human-first, но есть agent-compatible JSON subset. Workspace beta сильный как coordination surface, но unstable и не рекомендуется как основа внешней долгоживущей automation.

Что брать: schema-defined artifact DAG, strict deltas including rename/full-block modified, workspace links, `instructions/status --json`, artifact-local rules.

### Spec Kit

Лучше всего как **public SDD standard with extension ecosystem**. Важны not only commands, but feature resolver, domain checklists, workflow engine, curated catalog trust model and preset composition (`replace/prepend/append/wrap`). Community counts не равны official support.

Что брать: resolution stack для templates, bounded clarify, English unit tests, feature identity resolver, taskstoissues bridge, workflow expressiveness.

### BMAD

Лучше всего как **facilitation methodology**. PRD v6.7, decision log, addendum, project-context, bmad-spec, named agents, stakes calibration and evidence-graded investigate очень сильны. Это не только pre-planning UX: есть solutioning, quick-dev, code review and QA layers, но deterministic proof слабее Ouroboros.

Что брать: concern scan, `.decision-log.md`, `project-context.md`, evidence grades, brownfield context regeneration, review-as-triage.

### GSD Redux

Лучше всего как **context-engineered execution framework**. Profiles, `/gsd-surface`, issue-driven orchestration, context health, package legitimacy, review cost controls, graph/codebase staleness and SDK are the point. FALLOW belongs before code review, not planning; context monitor and `/gsd-health --context` have different thresholds.

Что брать: minimal profile, runtime surface control, package checks, goal-backward verification, graph staleness, sidecar SDK.

### Beads

Лучше всего как **distributed task graph substrate**. It is not literally a graph database engine, but dependency-aware issue tracker over version-controlled SQL. Strong ideas: `ready`, atomic claim, gate issues, `prime` as SSOT, events truth / labels cache, molecules/protos/wisps, safe init errors.

Что брать: task graph/ready/claim, gate issues, `prime`, PostCompact refresh marker, stable exit codes, no destructive command echoes.

### Backlog.md

Лучше всего как **markdown-native task manager with strong MCP overlay**. Not pure MCP-first CRUD: CLI and Web remain first-class, decisions are lightweight, docs are stronger. Strong lessons: MCP workflow resources, roots discovery/fallback bootstrap, AC vs DoD separation, modified-file search, bounded search/list discipline.

Что брать: resource docs, `get_instructions` fallback, AC/DoD separation, modified-file search, final summary discipline, soft-delete archive caution.

### Forge

Лучше всего как **runtime/verification-first anti-hallucination planner**. Forge is now the brand, but snapshot still has Beast/Beast-Plan legacy drift. The operational truth is in `skills/forge/SKILL.md` and hooks. Strong ideas: typed claims, Skeptic, DAG JSON, overlap matrix, evidence collector/auditor contamination rules, integration re-plan, PreCompact recovery.

Что брать: claim-level plan validation, mirage patterns, stream DAG, code hygiene summaries, recovery hooks, typed override audit.

### FPF

Лучше всего как **reasoning/governance layer**, not a runner. It supplies vocabulary and semantics for work, gates, decisions, evidence decay, source restoration, temporal/causal adequacy, publication boundaries and partly-said language state. It has russophone intellectual lineage but English-first normative spec surface.

Что брать: DRR, Boundary Norm Square, CharacteristicSpace, source restoration, validity windows, partly-said governance, publication-use boundaries.

### Memento

Лучше всего как **workflow runtime architecture**. It combines file-first knowledge (`.memory_bank`, `.protocols`) with machine runtime state (`.workflow-state`). Strong lessons: LLM as relay, engine as deterministic state machine, block DSL, scoped `_context`, relay payload externalization, watchdog hooks, sandbox caveats.

Что брать: deterministic engine, checkpoints, retry/conditional/parallel DSL, dry-run tree, runtime API, tiered context loading.

### memobank

Лучше всего как **lightweight docs-first execution kit**. It has no Memento engine, Beads DB truth or Backlog MCP surface, but has disciplined MBB, Memory Bank, markdown task cards with `Depends on`/`Touched files`, `/review -> /execute -> /verify -> /mb-sync`, clean-session prompts and vendored skills.

Что брать: skill packaging, PRD-less guard, MB lint, terminal state taxonomy, MBB status/lifecycle discipline, durable memory vs runtime evidence boundary.

### GRACE

Лучше всего как **code-level semantic context substrate**. It is not task management and not SDD workflow. Its primary contribution is making code itself carry agent-relevant context: app graph, module/function contracts, PURPOSE comments, semantic regions, logs linked to classes/methods, AI-friendly tests and validators.

Что брать: code as context carrier, PURPOSE over DESCRIPTION, stable semantic regions, context collector role, agent-oriented logs, Doxygen/JSDoc/rustdoc over custom tags.

## Recommended Ouroboros roadmap

1. **Reduce context tax first.** Minimal/standard/full profiles, namespace routers, runtime `ob surface`.
2. **Strengthen plan-checker.** Forge-like typed claims, mirage patterns, overlap matrix, Spec Kit requirements lint.
3. **Add decision/evidence artifacts.** BMAD decision-log/addendum, FPF DRR/source restoration/freshness windows.
4. **Expose API surface.** `ob status --json`, `ob instructions --json`, MCP resources and fallback bootstrap.
5. **Introduce operational state.** Start with ready/claim/stale graph; later decide between Beads-like substrate and Memento-like workflow engine.
6. **Add optional code-level context layer.** For large generated modules: GRACE-style PURPOSE/contracts/semantic regions/logs, with lint to prevent drift.
7. **Package a lightweight mode.** memobank-style docs-first mode for small projects that cannot afford full Ouroboros ceremony.

## Итог

На 2026-05-25 сильные публичные методологии двигаются не в одну сторону, а в пять:

- легче runtime surface через profiles, routers, resources and marketplaces;
- сильнее operational state через DBs, claims, workflow engines and SDKs;
- лучше facilitation через decision logs, concern scans and bounded clarify;
- строже reasoning semantics через evidence, source restoration and publication boundaries;
- ближе к коду через semantic anchors and agent-oriented logs.

Ouroboros все еще силен как strict execution/audit pipeline. Следующий скачок качества должен быть не в добавлении еще одного gate-файла, а в связке: **lighter runtime surface, typed plan evidence, operational state/API, and optional code-level semantic anchors**.
