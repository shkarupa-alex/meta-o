# Синтез approach-консилиума

## Статус

Консилиум `gpt56solmedium + opus1mhigh` прошёл три полных раунда proposal →
cross-review → refinement и завершился без формального convergence. Разногласие
оказалось локальным, а не принципиальным: оба судьи выбрали skills-first и
отказались от workflow engine, но по-разному провели границу допустимого state и
private helpers.

Этот синтез не является финальной спецификацией. Он фиксирует архитектурный
каркас для pre-mortem и последующего обсуждения с пользователем.

## Итоговая позиция

Meta-O vNext — набор самостоятельных skills, прямых вызовов native backend CLI,
Git и project-owned task-runner commands. Собственный публичный CLI, FSM,
run-state, adapters, receipts, digests, manifests и service-style watchdog не
нужны.

Выбирается архитектурный уровень 2 в предельно узком смысле:

- сам feature lifecycle остаётся уровнем 1 — skills + native CLI;
- допустим один private helper для model discovery/preferences, потому что эту
  функцию пользователь явно просит, а она не проксирует agents или workflow;
- отдельный transcript-parser executable не нужен: `mo-herdr` получает rendered
  agent output только через Herdr read/scroll surfaces и reasoning-ом выделяет
  последний завершённый turn;
- watchdog проходит ранний live spike до релиза: если agent loop не может
  надёжно дождаться следующего события и получить новый reasoning turn,
  допускается сразу включить минимальный 1:1 `.mjs` helper без state и takeover.

Уровень 3 — небольшой workflow engine — отвергается: гарантии, ради которых он
существовал, пользователь сознательно ослабил, а native `/goal`, Git и backend
sessions уже дают полезную часть результата.

## Архитектурная граница

### Остаётся текстом и reasoning агента

- порядок lifecycle;
- выбор backend-specific команды;
- continuation, dispute resolution и recovery;
- чтение полного reviewer verdict;
- выбор применимых QC/E2E;
- проверка architecture, necessity, purpose и knowledge;
- сопоставление gate results с candidate SHA.

### Может быть кодом

Только сущность, которая одновременно:

1. предотвращает названный наблюдаемый failure;
2. не может быть надёжно выражена direct CLI + skill instructions;
3. имеет конкретного consumer;
4. не скрывает native backend capabilities;
5. не принимает prompt, не запускает agent и не хранит workflow state;
6. имеет явное поведение при drift чужого формата;
7. может быть удалена без изменения lifecycle.

Baseline проходит этот тест для `mo-models.mjs` и, только при отрицательном
watchdog spike, для минимального watchdog helper. Любой следующий helper
проходит admission review отдельно; длина skill или удобство одинаковых имён не
являются основанием.

## Final skills

| Skill | Trigger | Inputs | Outputs | Самостоятельный смысл |
|---|---|---|---|---|
| `mo-herdr` | Полный workflow через Herdr; без аргументов — понять текущую работу | spec/task/`continue`/ничего | проверенный candidate или точный `needs_attention` | Herdr-specific orchestration lifecycle, не mechanics proxy |
| `mo-omnigent` | Тот же workflow через Omnigent | то же | то же | Использует native conversations/export/resume напрямую |
| `mo-reuse` | Обязательно до implementation; можно напрямую | tracked spec/task + repo | `## Reuse research` + первый spec-only commit | Отдельный research CLI instance и контекст |
| `mo-review` | Из orchestrator или напрямую после быстрого fix | artifact ref, optional spec, revision | полные verdicts и fix/re-review loop | Независимый review code/non-code без full run-state |
| `mo-setup` | Новый проект или недостаточный project contract | repo, existing Make/package/task-runner config, provider PATH | knowledge/docs/instructions, aliases/config и provider preflight после согласования | Идемпотентная инициализация проекта, не runtime orchestration |
| `mo-e2e` | Нужна отдельная tester role | candidate SHA, `docs/e2e*`, selected groups | scenario results + evidence + SHA | Только benchmark/browser agent testing |
| `mo-watchdog` | Пользователь согласился на observer | backend + locator одного orchestrator | notification/attention signal | Опциональный 1:1 observer без takeover |

`mo-herdr` и `mo-omnigent` — полноценные альтернативные orchestrator skills.
Каждый сначала читает установленный native backend skill/help, затем содержит
только lifecycle decisions, exact-response retrieval и проверенные ловушки.
Отдельных mechanics proxy skills и общего executable router/adapter нет. Paseo
не входит в текущую итерацию.

## Minimal feature lifecycle

1. Orchestrator читает Git reality, всю task/spec, `AGENTS.md`/`CLAUDE.md`,
   `Makefile` и применимые package/task-runner configs.
2. Читает native backend skill/help, проверяет installed version и PATH
   resolution provider CLIs.
3. Показывает короткий сохранённый model set и просит подтвердить одной
   репликой; полный catalog — только по запросу или meaningful upgrade signal.
4. Определяет project QC, console smoke и вид E2E.
5. Запускает `mo-reuse` в отдельном top-level CLI process/context.
6. Researcher меняет только `## Reuse research` и делает первый spec-only
   commit. Если исходная задача была текстом/URL, он материализует tracked spec.
7. Executor получает read-only spec, project instructions и native goal; никакой
   methodology skill ему не передаётся.
8. Executor реализует весь scope, обновляет durable knowledge, выполняет QC и
   применимый console smoke, затем создаёт чистый candidate commit.
9. Orchestrator независимо перепроверяет SHA, cleanliness и `make mo-qc`.
10. Два независимых reviewers получают один и тот же полный SHA и spec. Первый
    проход каждого изолирован от findings другого.
11. Findings целиком передаются executor; fixes создают новый candidate SHA;
    все gates повторяются.
12. Console smoke выполняет executor. Benchmark/browser E2E выполняет отдельный
    tester на candidate SHA.
13. Завершение возможно, когда QC, оба review и применимый E2E относятся к одному
    финальному SHA; никакой snapshot digest или receipt store не нужен.
14. Существенный повторяемый failure оставляет короткий follow-up в
    `docs/todo.md`; брать его в работу решает пользователь.

Orchestrator читает и управляет, но не становится основным implementer или
подменой независимого reviewer.

## Executor без methodology skill

Отсутствие executor skill — invariant. Полезные outcomes текущего
`execute-feature` переносятся так:

| Outcome | Где задаётся | Где проверяется |
|---|---|---|
| Реализован весь scope, не MVP | spec + goal | оба reviewers |
| Tests constrain новое behavior | project instructions + goal | `mo-test`/`mo-qc` + review |
| QC не ослаблен | project instructions | tracked config diff + review |
| Reuse decision соблюдён | spec | executor rationale + review |
| Durable knowledge обновлено | goal + project instructions | review lens |
| Out-of-scope debt не раздувает feature | project instructions | `docs/todo.md` + review |
| Clean local candidate commit | goal | Git reality |
| Нет push/tag/PR без запроса | project instructions | Git/remotes inspection |
| Findings закрывает reviewer, не executor self-report | `mo-review` | повторный verdict |

Spec после reuse read-only для executor без исключений. Её retirement/deletion не
входит в executor contract. После успешных gates orchestrator может предложить
отдельный docs-only cleanup commit, если project convention требует удалять
завершённые specs и durable knowledge уже перенесено.

## Native goal lifecycle

Goal живёт до первого executor-owned candidate, удовлетворяющего его own DoD.
Во время независимых review/E2E goal не активна: иначе automatic continuation
может изменить candidate, пока gates его проверяют. Fix batches идут обычными
follow-up turns в той же persistent executor session; новая короткая goal нужна
только для крупного автономного batch.

### Codex

- использовать native interactive `/goal`, а не строку внутри ordinary prompt;
- не использовать `codex exec`, MCP или surface, где goal events игнорируются;
- активацию подтверждать documented native UI/app-server/backend interface;
- `~/.codex/goals_1.sqlite` доказывает наличие capability в проверенной версии,
  но private schema не является нормативным стабильным contract;
- version-specific read-only SQLite probe допустим только как diagnostic
  fallback с обязательным сопоставлением `thread_id` конкретной executor
  session.

### Claude Code

В установленной версии подтверждено наличие native `/goal`, реализованной через
session-scoped Stop-hook condition и восстанавливаемой при resume. До
implementation её нужно проверить live end-to-end.

Preflight обязан проверить три условия:

1. provider запущен через ожидаемый PATH wrapper;
2. executor cwd — trusted workspace;
3. hooks не запрещены `disableAllHooks` или `allowManagedHooksOnly`.

Claude goal evaluator не читает files и не запускает commands. Поэтому STATUS
block может быть только liveness/handoff signal, никогда gate evidence. QC,
cleanliness и SHA orchestrator повторно получает из реальности. Goal должна иметь
turn/time bound, чтобы слепой evaluator не зациклил работу.

### OpenCode и неподдерживаемые surfaces

Честный weaker fallback:

- одна persistent executor session;
- completion-oriented initial prompt;
- orchestrator замечает premature idle;
- обычный follow-up/resume до candidate.

Это не называется эквивалентом persisted automatic goal; свой FSM ради
эмуляции не создаётся.

## Backend-specific contracts

### Herdr

- precondition `HERDR_ENV` проверяется, а не подделывается;
- перед реализацией команды сверяются с installed `herdr --skill`/help;
- используются реальные команды/paths installed version, включая
  `.result.pane.pane_id` и `herdr agent attach`;
- slash command отправляется atomic `herdr agent prompt` только после idle;
  `--wait` не считается turn boundary;
- panel tail никогда не считается полным reviewer result;
- `herdr agent read` и Herdr-controlled scrolling являются штатным источником
  verdict; provider session files/hooks не читаются;
- worktree optional и только при реальной необходимости исполнения/изоляции.

### Omnigent

- direct/native harness distinctions фиксируются явно;
- resume/export используются нативно;
- `session export` считается полным только после acceptance fixture длиннее
  default/API limit и доказанной pagination; наличие endpoint с `limit=500`
  само по себе недостаточно;
- `/goal` transport и survival after resume проходят отдельный live spike;
- status semantics честно признаются слабее Herdr, если native done flag нет.

Capability evidence vocabulary едина:

- `available` — проверено на локально установленной версии;
- `inferred` — primary docs/source без локального runtime test;
- `unavailable` — native capability отсутствует/не обнаружена;
- `fallback` — outcome достигается более слабым путём.

## Full reviewer output без Structured JSON

Reviewer возвращает обычный Markdown: verdict, findings, evidence, impact,
suggested fix и residual risks. Structured JSON transport не требуется, потому
что внешнего machine consumer нет.

Для `mo-herdr` authoritative surface — сам Herdr:

1. дождаться settled state через `herdr agent prompt --wait`/`agent wait`;
2. читать `herdr agent read <actor> --source recent-unwrapped --lines N`, начиная
   с разумного окна и увеличивая `N`, пока видны обе границы последнего turn либо
   больший запрос перестал добавлять строки;
3. найти в rendered output последний user-prompt boundary и следующий
   completed/idle input boundary; выделить непрерывный интервал между ними и
   скопировать его целиком;
4. если ответ живёт в alternate-screen и `--lines` не вернул историю, использовать
   Herdr attach/terminal scrolling или provider UI scroll через Herdr и читать
   последовательные `--source visible` окна с overlap; overlap обязан доказать,
   что между окнами нет пропуска;
5. если начальная/конечная граница или непрерывность окон не доказана — gate
   `unknown`, review запускается заново; provider JSONL/SQLite fallback нет.

В Herdr 0.8.0 `--lines N` означает последние N rendered rows; отдельного
`from_line/to_line` в CLI/socket schema нет. Поэтому «slice по интервалу» — это
выделение диапазона из полученного Herdr output обычными `nl`/`sed`/reasoning либо
последовательные visible windows при scrolling. Если Herdr добавит native range,
skill должен предпочесть его после version probe.

`mo-omnigent` отдельно использует только доказанно полный native session export;
его правила не протекают в `mo-herdr`.

Оркестратор копирует выделенный полный response прямо в следующий prompt;
отдельный файл, nonce и completion marker не используются.

Retrospective просьба «повтори прошлое сообщение verbatim» является regeneration,
а не retrieval, и не может дать PASS. Усечённый terminal tail тоже не может дать
PASS. Если полный verdict не извлечён, gate unknown и безопасно повторяется.

Отдельный `mo-lastmsg.mjs` в baseline не нужен. Phase 0 проверяет, что Herdr
read/scroll достаточно для длинных Claude/Codex/OpenCode turns. Если это не
получается, backend честно остаётся unsupported для full-review gate до решения
на уровне Herdr; чтение provider-private sessions не добавляется автоматически.

## Review policy

- два независимых first-pass reviewers;
- минимум один reviewer другого vendor относительно executor;
- executor/author не занимает reviewer slot;
- обязательные lenses для всех artifacts: spec/business completeness,
  necessity («зачем это вообще нужно?»), architecture, reuse и durable knowledge;
- для code добавляются correctness/error paths, tests и purpose;
- findings передаются целиком, не пересказываются orchestrator;
- спор: исходный reviewer читает rebuttal → второй reviewer судит конкретный спор
  → при необходимости один targeted fact-check → orchestrator принимает
  техническое решение → пользователь только для product meaning/неразрешимого
  выбора;
- substantive declined finding требует code-adjacent `why`, только если риск
  реален, решение сознательно оставлено и причина не видна из кода;
- non-blocking debt может уйти в `docs/todo.md`; blocking defect требует fix или
  явного технического resolution, а не произвольного round limit.

Subagents не задаются числом строк diff. Reviewer использует их по независимым
risk lenses, novelty и cross-cutting impact: маленький change обычно 0, средний
2–3, крупный/архитектурный до 4–6. Фиксированные 6–9 на любую задачу отвергнуты.

## Candidate identity без state

Baseline — полный Git SHA, передаваемый каждому gate, и проверка чистого дерева.
`refs/mo/candidate` не используется: это operational state с lifecycle,
staleness и collision semantics, хотя тот же outcome даёт явный SHA.

Каждый gate называет:

```text
CANDIDATE: <full SHA>
WORKTREE: clean | dirty
```

Если candidate изменился, все прежние gates stale. После любого fix на новом SHA
повторяются QC, оба review и применимый E2E; перед final completion orchestrator
убеждается, что все свежие PASS относятся к одному SHA.

Worktrees не обязательны. Review diff читается по SHA без checkout. Worktree
нужен, только если gate должен параллельно build/run candidate или основной
worktree меняется. Fresh detached worktree для E2E не является default.

## Recovery и actor status

Новый orchestrator после restart/reboot читает:

- current branch, status, recent log и merge-base diff;
- tracked task/spec и `## Reuse research`;
- Make/task-runner contracts;
- native backend session list/history;
- последние candidate-like commits и их messages;
- при необходимости повторно запускает unknown gates.

Session names включают короткий feature slug и роль (`<slug>-exec`,
`<slug>-review-a`, ...), но отдельный registry не создаётся. Если факты
неоднозначны, orchestrator задаёт один конкретный вопрос. Exact replay,
automatic takeover и восстановление исчезнувшего reasoning context не обещаются.

User-facing classification только:

- `idle` — нет действия для orchestrator/user;
- `needs_attention` — требуется решение, сообщение, recovery или user input.

Native `done` сам по себе не всегда `needs_attention`: orchestrator сначала
читает полный result и самостоятельно продолжает, если человеческое решение не
нужно.

## `~/.meta-o` и model selection

`~/.meta-o` нужен только для редко меняющихся model preferences и ненавязчивого
upgrade memory. Один файл:

```text
~/.meta-o/models.json
```

Он содержит:

- global default role set;
- sparse per-project override keyed by hash of `realpath(project root)`;
- timestamp/ids последнего authoritative catalog observation;
- upgrade suggestions уже показанные/отклонённые, чтобы не спрашивать снова.

Он не содержит runs, candidate, sessions, findings, gates, watchdog или
capability baselines.

`mo-models.mjs`:

- читает authoritative route-specific model catalogs/SDKs;
- отдельно читает recent-history hints (последний месяц + последние 10 sessions)
  и дедуплицирует effective model ids;
- не выдаёт history за available-model catalog;
- не делает network calls, если официальный authenticated local SDK/catalog
  доступен; route-specific failure деградирует к saved default;
- не запускает agents и не принимает prompts;
- предлагает upgrade только при authoritative successor evidence. String
  similarity и `vendor+family` сами по себе lineage не доказывают;
- полный список выводит только по запросу.

Перед реализацией helper проходит source-by-source spike для Claude, Codex и
OpenCode; unsupported source даёт note, а не guessed result.

## Make/QC/setup contract

`mo-setup` — также отдельный, напрямую вызываемый skill инициализации нового
проекта. Отдельный `mo-knowledge` пока не нужен: knowledge layout, project
instructions и QC aliases образуют один onboarding contract и должны
создаваться/проверяться согласованно и идемпотентно.

Сначала он читает существующие `AGENTS.md`/`CLAUDE.md`, Makefile, package scripts,
`pyproject.toml`, native task-runner config и docs. После показа конкретного diff
он создаёт только недостающее:

- `docs/business.md`, `docs/glossary.md`, `docs/todo.md`,
  `docs/architecture/` и при необходимости `docs/e2e.md` либо
  `docs/e2e/index.md` + scenario groups;
- короткий `AGENTS.md` с outcomes, architecture/purpose/knowledge тезисами и
  project commands, без executor methodology;
- `CLAUDE.md` как нативное включение/ссылка на тот же contract, а не вручную
  расходящуюся копию, если установленный Claude это поддерживает;
- Make aliases и минимальную готовую QC-конфигурацию.

Provider preflight в `mo-setup` проверяет `command -v`/`which -a` и фактический
launch path. На текущей машине ожидаемый baseline — пользовательские wrappers:

- Claude → `/Users/alex/bin/claude` с `--dangerously-skip-permissions`;
- Codex → `/Users/alex/bin/codex` с
  `--dangerously-bypass-approvals-and-sandbox`.

Skill не копирует эти абсолютные пути в portable project contract и не
перезаписывает wrappers молча: он показывает resolved path, проверяет required
flags/argument forwarding и предлагает исправление при mismatch. Запуск
абсолютного provider binary в обход PATH считается ошибкой orchestrator skill.

Claude permission bypass не равен workspace trust и не может отменить managed
`allowManagedHooksOnly`/`disableAllHooks`. Поддерживаемого флага «доверять любой
cwd навсегда» в проверенной CLI surface нет. Поэтому `mo-setup`:

1. проверяет trust текущего project root;
2. при необходимости запускает одноразовый нативный interactive trust flow;
3. проверяет user/project/local/managed hook sources (включая `/hooks`);
4. не редактирует приватную `~/.claude.json` ради auto-trust.

Обёртка может всегда включать permission bypass, но не должна автоматически
доверять произвольным каталогам или пытаться переиграть managed policy.

Обязателен один entry:

```text
make mo-qc
```

Условные aliases:

```text
make mo-typecheck
make mo-lint
make mo-test
make mo-build
make mo-smoke
make mo-e2e
```

Если есть семантически эквивалентная команда под другим именем, skill спрашивает,
сделать ли alias. Если проверки нет, предлагает минимальный project-owned config
через готовый инструмент. `mo-qc` не зависит от agent-required `mo-e2e`; короткий
детерминированный `mo-smoke` может входить в `mo-qc`.

Для benchmark/browser `make mo-e2e` печатает явный help с первой строкой
`AGENT_REQUIRED: not executed`, prerequisites, docs/scenario groups, output и
cleanup и завершает кодом 2. Названный consumer — orchestrator: он не принимает
это как PASS и запускает `mo-e2e` tester. Для такого проекта `mo-e2e` никогда не
является dependency `mo-qc`.

### Python default

- Ruff format/lint и подходящие D/DOC/C90/PLR rules;
- existing mypy или Pyright;
- pytest;
- Import Linter для boundaries/cycles;
- Interrogate только в реалистичной coverage policy, не как требование docstring
  на каждый closure/dunder;
- Pylint `too-many-lines`, если нужен file-size gate;
- Deptry при реальной потребности dependency hygiene.

### TypeScript default

Existing project stack сохраняется. Compatibility profile:

- `tsc --noEmit`/`tsc -b` или framework checker как source of truth;
- ESLint flat config + `typescript-eslint` typed lint;
- существующий runner;
- Prettier отдельно от correctness;
- `eslint-plugin-jsdoc` там, где нужен mechanical purpose coverage.

Fast profile для больших repos может добавить type-aware Oxlint, но не заменяет
`tsc` и, пока в нём нет нужных JSDoc/size rules, не устраняет ESLint полностью.
Greenfield Node-only может использовать `node:test`; Vitest выбирается для
Vite/browser/DOM/richer mocking. Jest/Vitest не мигрируют только ради унификации.

Начальные code-health thresholds — configurable warnings/errors, не
архитектурные законы: примерно file 400–500, function 60–80, complexity 10/15,
statements 30–40, depth 4. Generated/declarations/migrations/config имеют явные
exceptions; tests могут иметь более мягкие thresholds.

Custom project-owned purpose/import/E2E metadata checkers не создаются, пока
готовые linters/plugins покрывают outcome.

## Reuse research protocol

`mo-reuse` — отдельный top-level agent instance. Его работа не сводится к одному
фиксированному поисковому запросу. Сначала он определяет используемые языки и
package ecosystems по manifests/configs и проверяет уже имеющиеся зависимости.

Default — три адаптивные итерации поиска:

1. broad capability/domain terminology;
2. новый запрос из названий, описаний, API terms и стандартов, найденных на
   первой странице первого раунда;
3. gap-focused запрос: отсутствующая возможность, alternative architecture,
   binding/FFI terms или compatibility limitation.

В каждом раунде агент должен сам увидеть первую страницу результатов, а не
получить один выбранный скриптом пакет:

- GitHub отдельно для каждого языка проекта, `--sort stars --order desc`, по
  умолчанию 30 результатов, archived исключаются;
- GitHub обязательно для Rust с тем же capability query, даже если проект не на
  Rust: ищутся готовые bindings либо небольшая библиотека со здравым путём через
  C ABI/WASM/N-API/PyO3/UniFFI для текущего языка;
- native registry каждого ecosystem (`npm`, PyPI, crates.io и т.п.), используя
  downloads/dependents/popularity только там, где registry действительно даёт
  такую метрику.

Reference GitHub invocation:

```bash
gh search repos "$QUERY" \
  --language "$LANGUAGE" --sort stars --order desc \
  --archived=false --limit 30 \
  --json fullName,description,stargazersCount,pushedAt,license,url,isArchived
```

Registry ranking остаётся честным и ecosystem-specific:

- npm search/UI может сортировать по downloads или most dependents; `npm view`
  проверяет shortlist metadata/provenance;
- `cargo search --limit 30` даёт textual relevance и descriptions, но не
  объявляется downloads-sort; adoption/maintenance проверяются отдельно для
  finalists;
- у официальных PyPI JSON/Index APIs нет общего popularity-sorted package
  search, поэтому PyPI relevance + metadata дополняются GitHub evidence;
  внешняя download-статистика допустима только с явной пометкой источника, а не
  как официальный PyPI ranking;
- для остальных managers используется их native search и реально доступная
  adoption metric; если её нет — relevance, dependents, repository stars,
  recency и maintainer activity.

После каждого раунда researcher пишет, что узнал и почему следующий запрос
изменился. Raw first page не обязана засорять spec: в `## Reuse research`
сохраняются queries/sources, релевантный shortlist и причины отсева.

Финалисты оцениваются по capability fit, API/docs, license, maintenance/recency,
adoption, compatibility, security/provenance, dependency weight и integration
cost. Для Rust отдельно оценивается стоимость и риск bindings; много stars само
по себе её не окупает. Итог — `reuse`, `extend` или `build`, с явным объяснением.

Три итерации — default, не ритуальный минимум/потолок: можно остановиться раньше
при полностью закрытой задаче с сильным evidence или продолжить при конкретном
неразрешённом вопросе. Первый commit остаётся spec-only.

## Purpose, architecture и durable knowledge

Layout:

```text
docs/business.md
docs/glossary.md
docs/todo.md
docs/architecture/*.md
docs/e2e.md
# либо docs/e2e/index.md + docs/e2e/<group>.md
```

`knowledge sync` означает: перенести из spec в постоянные docs утверждения,
которые останутся правдой после завершения feature, и удалить/исправить факты,
которые feature сделала ложными. Executor делает это до candidate в том же code
commit. `KnowledgeImpactPlan` и слой `docs/knowledge/` не нужны.

Короткий architecture contract хранится в `AGENTS.md`; `CLAUDE.md` ссылается на
него поддерживаемым native include либо содержит короткое согласованное
дублирование. Он требует думать о responsibility boundaries, allowed
dependencies, independently changeable parts, god-files/objects, excess
coupling, fit to existing architecture и simplification stale branches.

Purpose contract:

- объясняет, зачем symbol/module существует, какой invariant/role обслуживает и
  что станет неверным или лишним при удалении;
- пересказ реализации не считается purpose;
- mechanical presence обязательно для first-party modules, public/exported APIs,
  classes, architectural boundaries и каждой overload declaration;
- nontrivial private/test symbols покрываются risk-proportionally;
- trivial accessors, short closures, generated/vendored glue не получают
  ritual prose ради 100%; exceptions фиксируются в lint config;
- linters проверяют presence/shape, reviewers проверяют semantic depth;
- overload declaration не освобождается ссылкой на documented implementation.

## E2E

| Тип | Кто | Contract |
|---|---|---|
| Короткий deterministic console smoke | Executor | `make mo-smoke`, можно включить в `mo-qc` |
| Agentic benchmark | Отдельный tester | project command/help + selected scenarios/evidence |
| Browser E2E | Отдельный tester | `agent-browser` native skill + selected `docs/e2e*` groups |

`docs/e2e/index.md` описывает environment, prerequisites, selection, cleanup и
каталог групп. Каждый group file объясняет, когда его выбирать. Default —
релевантные группы, не полный прогон.

`e2e.json` не нужен: external machine consumer отсутствует. То же относится к
`adoption-manifest.json`, `.quality/qc-manifest.json` и обязательному
code-health baseline.

## `mo-watchdog`

Baseline 1:1: отдельная agent session наблюдает одного orchestrator и сообщает
только про реальный `needs_attention`. Она не делает takeover, не запускает
feature, не мутирует state и не обслуживает несколько проектов.

Baseline implementation — finite native wait per reasoning turn:

1. прочитать native backend skill;
2. выполнить один bounded wait на изменение/idle/block;
3. после возврата команды проанализировать event;
4. уведомить/написать orchestrator либо начать следующий bounded wait через
   проверенный native goal/loop mechanism.

Бесконечный shell loop внутри одного LLM turn не считается рабочим observer.
До релиза проводится live spike на каждом поддерживаемом backend. Если backend
способен надёжно вернуть watchdog новый reasoning turn, implementation остаётся
skill-only. Если не способен, в этой же итерации добавляется маленький
deterministic `.mjs` watcher: 1 orchestrator ↔ 1 watchdog, native wait/poll,
notification/ping, без state, multi-project mode и takeover. Решение принимается
на Phase 0 fixture, а не откладывается до production failure.

## Human attention

User confirmation требуется только для:

- product scope/meaning;
- irreversible, production или внешне дорогого действия;
- credentials/production data;
- существенной смены subscription route/model set;
- genuinely unresolved ambiguity/dispute;
- optional watchdog launch.

Не спрашиваются ordinary engineering decisions, повтор QC/review, continuation,
использование уже сохранённого model set и очевидные Make aliases без semantic
change. При похожем existing target с другим именем задаётся один конкретный
вопрос.

## Reflection

Trigger — substantial repeated/systemic failure: defect прошёл до E2E/human,
повторяется один root cause, либо понадобилось ручное вмешательство не из-за
внешнего blocker. Никакого обязательного отчёта на каждый run.

Одна запись в `docs/todo.md`:

```text
Area/path | problem/incident | why checks missed it | practical risk | proposed follow-up
```

Она не расширяет текущую feature; пользователь решает, запускать ли улучшение и
применять ли методологию к самой себе.

## Distribution

```text
dist/
  skills/
    mo-herdr/
      SKILL.md
      references/
      scripts/mo-models.mjs
    mo-omnigent/
      SKILL.md
      references/
      scripts/mo-models.mjs
    mo-reuse/
    mo-review/
    mo-setup/
    mo-e2e/
    mo-watchdog/
  README.md
  LICENSE
apm.yml
```

Skills устанавливаются APM или `npx skills`. `install.sh`/`update.sh` отсутствуют.
Каждый independently installable skill self-contained. Маленькое безопасное
дублирование helper/reference дешевле скрытой cross-skill runtime dependency;
на implementation этапе можно выбрать package-manager-supported dependency,
только если она доказана обеими системами.

Используются только canonical frontmatter fields, принимаемые target skill
managers.

## Tooling audit — целевой verdict

### Delete

- public `meta-o` CLI и все workflow commands;
- FSM, state store, run context, ownership/takeover, write-ahead;
- `SessionAdapter` и backend adapters;
- findings/results/decision stores и Structured JSON transport;
- snapshot/digest/attestation/gate receipts;
- QC/E2E/adoption manifests и registries;
- immutable spec blob/hash/mutation protocol;
- knowledge anchors, `KnowledgeImpactPlan` и custom Markdown checker/parser;
- custom import graph and generic code-health/purpose wrappers where standard
  linters apply;
- watchdog daemon/runtime/service files;
- install/update scripts;
- compatibility layer and old adapter tests.

### Replace

- legacy Herdr workflow skill → `mo-herdr` и `mo-omnigent`;
- `research-reuse` → `mo-reuse`;
- `review-feature` → standalone `mo-review`;
- `adopt-project` → `mo-setup`;
- `test-e2e` → conditional `mo-e2e`;
- `execute-feature` → spec + goal + project instructions + QC/review outcomes;
- quality scripts → native Make commands and mature linter configs;
- model-set/config helpers → narrow `mo-models.mjs` + one settings file.

### Keep as direct interfaces

- Git commits/diffs/worktrees;
- Make/package/task-runner commands;
- native Herdr reads/scrolling and Omnigent sessions/exports/resume/UI;
- user PATH wrappers and subscription CLIs;
- human-readable project docs.

### Defer

- general-purpose transcript parser and provider-private transcript readers;
- custom max-class-lines checker;
- brownfield baseline;
- cache economics automation;
- global architecture hygiene tool;
- multi-project watchdog;
- any common executable backend adapter.

## Guarantees consciously removed

- exactly-once prompt delivery;
- exact orchestrator replay;
- automatic takeover/recovery;
- generation fencing/write-ahead;
- immutable spec copy and SHA-256 availability check;
- snapshot digest/rebase-stable attestation;
- gate receipts and structured findings;
- mandatory detached worktrees;
- durable workflow run state;
- deterministic watchdog liveness;
- machine-countable open blockers.

Replacement is observable Git/spec/session reality and safe rerun of unknown
gates. The loss is explicit, not hidden behind a thinner wrapper.

## Implementation order

1. Freeze this design only after user discussion.
2. Phase 0, no deletion: live backend/version/capability probes, long-output
   fixtures, `/goal` trust/hooks/resume tests, PATH resolution, APM/skills layout,
   model sources and QC tool spikes.
3. Write the new master-spec and decision ledger.
4. Implement pure skills and references alongside the current flow.
5. Implement `mo-models.mjs` only after its source matrix is closed.
6. Run a real small feature through Herdr, then Omnigent; include long final
   responses from Claude, Codex and OpenCode where supported and retrieve Herdr
   results through read/scroll only.
7. Verify exact completed-turn boundary and complete interval assembly before
   deleting the old flow. Run the watchdog next-turn spike and include a minimal
   helper immediately if skill-only observation fails.
8. Adopt Python and TypeScript QC references and `mo-setup` protocol.
9. Delete old CLI/control plane/state/adapters/manifests/installers and obsolete
   tests without backward compatibility.
10. Verify clean installation and standalone `mo-review` through both package
    managers.

## Decision ledger

### Adopted

- skills-first, no workflow engine;
- two standalone backend-specific orchestrator entries: `mo-herdr` and
  `mo-omnigent`; Paseo is outside this iteration;
- no executor methodology skill;
- mandatory separate-instance reuse research and first spec-only commit;
- native Codex/Claude goals where live-verified; honest persistent-session
  fallback elsewhere;
- goal until first candidate, ordinary follow-ups for review/E2E fixes;
- standalone cross-vendor `mo-review`;
- full Markdown verdicts without mandatory JSON schema;
- explicit candidate SHA instead of snapshot/state/ref;
- any new candidate SHA invalidates every gate;
- conditional E2E tester;
- one model preferences file and one narrow model helper;
- optional 1:1 watchdog;
- simple docs layout and risk-proportional purpose;
- native QC tools and first-class TypeScript profile;
- APM/skills distribution only;
- manual recovery by Git/spec/native sessions;
- PATH/subscription wrappers as backend responsibility.
- `mo-setup` initializes the project knowledge/instruction layer and verifies
  provider wrappers, trust and hooks;
- exact full-response retrieval is copied directly by orchestrator, without
  verdict file or nonce;

### Rejected

- generic `meta-o` CLI/router;
- shared executable backend adapter;
- `state.json`, FSM, run registry and `refs/mo/candidate` baseline;
- structured Finding protocol;
- snapshot digests/receipts/manifests;
- required worktrees;
- executor skill;
- separate adjudicator;
- project-owned AST purpose/knowledge/E2E checkers by default;
- mandatory 100% docstrings for trivial private/dunder/test glue;
- private SQLite/JSONL layouts as stable normative APIs;
- retrospective LLM re-export as verbatim retrieval;
- prospective verdict files, nonce and completion-marker protocol;
- installer/updater scripts;
- magic anti-bloat thresholds as architectural laws.

### Deferred

- a common transcript-parser helper or provider-private transcript reader;
- common adapter after future backends;
- baseline/ratchet for hard brownfield adoption;
- global architecture hygiene auditor;
- cache/compaction economics automation;
- exact model lineage for routes without authoritative successor metadata;
- mandatory spec retirement policy.

## Решённые после pre-mortem вопросы

1. Executor никогда не меняет и не удаляет spec; по умолчанию она остаётся
   tracked. Возможный retirement — отдельная поздняя docs-only операция.
2. `mo-e2e` остаётся отдельным installable skill для agent-required benchmark и
   browser testing, чтобы его можно было запускать вручную.
3. `mo-models.mjs` входит в эту итерацию после source spike.
4. Watchdog helper решается Phase 0 spike и, если нужен, входит сразу.
5. Paseo исключён из текущего scope.

## Pre-mortem questions для отдельного council job

- Где textual orchestration снова незаметно превращается в runtime protocol?
- Как сломается native `/goal` после version update, trust change или hook policy?
- Может ли full-output contract снова принять partial tail за PASS?
- Не станет ли `mo-models.mjs` каталогом/launcher/config system?
- Не создаст ли `mo-setup` новый тяжёлый adoption framework?
- Как не превратить purpose и QC thresholds в cargo-cult compliance?
- Где candidate SHA discipline ломается при параллельной работе?
- Сможет ли отдельный watchdog реально получать следующий reasoning turn?
- Какие оставшиеся current guarantees на самом деле были нужны пользователю?
- Как package-manager installation ломает self-contained standalone skills?

## Результаты отдельного pre-mortem

Pre-mortem выполнен обоими судьями после synthesis. Он не потребовал вернуть
workflow engine, но выявил несколько мест, где текущий текст оставлял опасную
свободу трактовки.

### P1. Любой новый candidate SHA инвалидирует все gates

Оптимизация «повторять только затронутые проверки» отклонена для baseline. Агент
не может надёжно доказать, что review fix не влияет на другой review или долгий
E2E benchmark, особенно после compaction/restart.

Fail-closed contract:

1. Candidate заморожен на время QC/review/E2E.
2. Executor не меняет branch head, пока текущий batch gates не завершён.
3. Любой fix создаёт новый SHA и автоматически делает stale: QC, оба review и
   применимый E2E.
4. Все применимые gates запускаются заново на новом SHA.
5. Непосредственно перед completion orchestrator получает свежий полный result
   каждого gate, явно называющий один и тот же full SHA.

Это дороже по tokens/time, но существенно проще и надёжнее receipts/digest и
субъективной impact-оптимизации. Оптимизация может вернуться только после
отдельного доказательства.

После restart никакая durable gate registry не создаётся: gate без полного
восстановленного verdict на текущем SHA считается `unknown` и повторяется.

### P2. Prospective file handoff и nonce отклонены пользователем

Reviewer не получает обязанность писать отдельный verdict file. В `mo-herdr`
orchestrator читает Herdr-rendered output, находит обе границы последнего turn и
копирует весь непрерывный интервал. Completion nonce и marker не нужны: это новый
protocol/state, хотя внешний machine consumer отсутствует.

Phase 0 обязана доказать retrieval на длинных ответах, tool-call repaint,
compaction/resume и нескольких sequential turns для Claude, Codex и OpenCode.
Проверяются progressive `--lines` reads и alternate-screen scrolling с overlap.
Отсутствие одной границы или непрерывного overlap делает gate `unknown`.
Provider-private JSONL/SQLite не используется.

### P3. Goal activation проверяется в каждом run

Phase 0 доказывает capability конкретной версии, но не заменяет runtime preflight.
Каждый executor run:

1. проверяет PATH, provider/backend version, workspace trust и hook policy;
2. отправляет slash command native способом;
3. получает positive activation evidence из documented surface;
4. при отсутствии evidence громко выбирает named weaker fallback;
5. не принимает `idle`/`done` без explicit executor-owned DoD handoff как
   candidate.

Если установленная версия не совпадает с проверенной capability matrix, status
до новой probe — `inferred`, а не `available`. Fallback не считается ошибкой, но
называется пользователю одной строкой.

Acceptance fixture для каждого поддерживаемого backend × harness должна
проверить не только видимость goal, но и automatic continuation после намеренно
неполного turn и survival after resume.

Для Claude wrapper с `--dangerously-skip-permissions` решает permission prompts,
но не workspace trust. Официальный `/goal` требует однажды принять trust dialog;
managed `disableAllHooks` может сделать goal unavailable, а
`allowManagedHooksOnly` не отменяется пользовательским wrapper. Поэтому
`mo-setup` выполняет explicit native trust onboarding и проверку hooks; private
auto-edit `~/.claude.json` отвергнут.

### P4. Reuse decision можно исправить только отдельным researcher turn

Product requirements и остальная spec остаются read-only для executor. Если во
время implementation обнаружено проверяемое evidence, опровергающее reuse
decision:

1. executor останавливается с конкретным evidence;
2. orchestrator запускает новый отдельный `mo-reuse` CLI instance;
3. researcher меняет только `## Reuse research`;
4. создаёт второй spec-only commit с причиной;
5. executor resume читает обновлённую spec.

Так read-only invariant сохраняется, но ошибочное раннее исследование не
становится догмой. Для короткой текстовой task допустим tracked task/research
note вместо искусственно большой SDD-spec; обязательны acceptance text и reuse
section, а не объём документа.

### P5. Goal и project instructions получают owner и anti-ritual lens

Запрет executor skill сам по себе не мешает ритуалу переехать в длинный goal и
`AGENTS.md`. Поэтому:

- stable project outcomes принадлежат короткому project instruction contract,
  которым управляет `mo-setup`;
- feature-specific outcomes принадлежат spec;
- goal содержит path, короткую completion condition и только те runtime facts,
  которых нет в двух предыдущих источниках;
- goal не дублирует checklist целиком;
- reviewers проверяют не только код, но и изменение instructions: не растёт ли
  methodology text быстрее полезной системы;
- повторяемый failure не автоматически добавляет новую строку в goal; сначала
  определяется правильный owner — spec, project instruction, QC или review.

Жёсткий byte/line limit не вводится. Критерий — goal должен помещаться в один
короткий читаемый handoff и ссылаться на authoritative files, а не копировать их.

### P6. Один canonical source для общей методологии и helper

Отказ от executable adapter не означает отказ от single source of truth для
текста. В repository общая lifecycle/review/candidate методология хранится в
одном canonical reference. Backend-specific skills добавляют только mechanics и
verified traps.

Для independently installable packages build/dist step копирует canonical
reference и `mo-models.mjs` в self-contained skill directories и механически
проверяет идентичность generated copies. Runtime dependency и generic router не
появляются; source code не дублируется вручную.

`models.json` имеет одного schema owner и version. Helper при неизвестной schema
fail-closed: не переписывает файл и предлагает текущий saved model set. History
hints не могут сами породить upgrade prompt.

Build-time copy — допустимый rigid packaging workflow, а не user-facing proxy
CLI. Для него достаточно стандартной Make/package command; отдельный публичный
installer по-прежнему запрещён.

### P7. Что не возвращается после pre-mortem

Не возвращаются:

- `state.json` или FSM;
- gate receipt store;
- `refs/mo/candidate`;
- snapshot digest;
- structured findings;
- automatic takeover/recovery;
- общий executable backend adapter.

Durable связь `{gate, SHA, verdict}` после restart восстанавливается не записью
нового state, а консервативным правилом: нет свежего полного result на current
SHA — повторить gate. Это соответствует пользовательскому приоритету простоты и
готовности вручную перезапускать orchestrator.
