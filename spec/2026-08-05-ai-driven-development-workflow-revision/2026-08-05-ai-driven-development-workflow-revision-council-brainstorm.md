# Meta-O vNext: skills-first workflow

## 1. Статус и цель

Это утверждённая master-spec следующей версии Meta-O. Она заменяет архитектурные решения из
`spec/2026-07-24-ai-driven-development-workflow/`; обратная совместимость с
текущим `meta-o` CLI, state, adapters и installer scripts не требуется.

Этот файл является единственным normative result консилиума. `task-description`,
`synthesis`, council reports, proposals и judge reviews сохраняются как история
обсуждения и не переопределяют принятые здесь решения.

Цель — оставить сильный агентный workflow без собственного workflow engine:

- исполнитель доводит большую задачу до candidate commit через native `/goal`
  там, где он доступен;
- отдельный researcher по явному решению пользователя ищет готовые решения;
- два независимых reviewer проверяют один и тот же candidate;
- применимый E2E проверяет тот же candidate;
- оркестратор управляет через Herdr или Omnigent native interfaces;
- Git, task/spec, project instructions и native sessions позволяют продолжить
  работу после ручного restart;
- собственный код остаётся только там, где existing CLI/skill не даёт требуемой
  возможности.

## 2. Нормативные принципы

1. Skills и reasoning являются orchestration layer. Общего executable router,
   FSM, run-state и backend adapter layer нет.
2. Executor не получает methodology skill. Он получает spec/task, project
   instructions, native goal и конкретные review findings.
3. Spec после reuse research read-only для executor.
4. Один проверяемый результат идентифицируется полным Git SHA.
5. Любой новый candidate SHA инвалидирует все gates.
6. Reviewer output — полный Markdown, без обязательного Structured JSON.
7. Herdr skill использует Herdr output/read/scroll surfaces, а не private
   provider transcripts, hooks или session databases.
8. Native CLI не прячется за proxy scripts. Агент может использовать полный
   Herdr/Git/Make/package-manager interface.
9. Project-owned manifests, receipts, digests и baselines создаются только при
   появлении реального внешнего consumer; в baseline такого consumer нет.
10. Ручное вмешательство и повторный запуск являются нормальным способом
    recovery, а не ошибкой методологии.

## 3. Целевая архитектура

```text
User
  ├─ mo-herdr
  │    ├─ optional suggestion ─> user may invoke mo-reuse
  │    ├─ executor ──> native goal, candidate SHA
  │    ├─ mo-review ─> reviewer A + reviewer B
  │    ├─ executor/reviewers ─> project QC / smoke where useful
  │    ├─ mo-e2e ────> only benchmark/browser cases
  │    └─ mo-watchdog (optional 1:1)
  │
  ├─ mo-omnigent ────> тот же lifecycle через native Omnigent
  ├─ mo-review ──────> текущая coding session: review/fix loop для small fix
  └─ mo-setup ───────> project knowledge/instructions/QC/provider onboarding
```

Общая methodology хранится в одном canonical textual reference. `mo-herdr` и
`mo-omnigent` добавляют только backend mechanics и проверенные ловушки. Dist
может содержать механически созданные одинаковые копии reference, чтобы каждый
skill устанавливался самостоятельно; ручное расхождение копий запрещено.

## 4. Final skills

| Skill | Когда вызывается | Вход | Результат |
|---|---|---|---|
| `mo-herdr` | Полный feature workflow через Herdr | spec path, task text, `continue` или ничего | финальный проверенный SHA либо `needs_attention` |
| `mo-omnigent` | Тот же workflow через Omnigent | то же | то же |
| `mo-reuse` | Только по прямому вызову/подтверждению пользователя | tracked spec/task и repo | обновлённый `## Reuse research`, spec-only commit |
| `mo-review` | В текущей coding session после небольшого fix либо как review protocol полного workflow | текущий task/spec и Git diff | два независимых review и выполняемый этой же session fix/re-review loop |
| `mo-setup` | Новый проект или неполный project contract | repo и локальные provider commands | docs/instructions/Make/QC/provider preflight |
| `mo-e2e` | Нужен agentic benchmark или browser testing | SHA, E2E docs, выбранные scenario groups | evidence и PASS/FAIL на названном SHA |
| `mo-watchdog` | Пользователь согласился запустить observer | backend и locator одного orchestrator | notification либо сообщение orchestrator |

Имена с `-orchestrate-` и Paseo skill в этой версии отсутствуют.

### 4.1. Общий интерфейс backend skills

Вызов без аргументов не начинает случайную работу. Skill читает cwd, Git branch,
status/log и очевидную task/spec. Если текущая работа однозначна, он предлагает
продолжить её; иначе спрашивает: «Какую spec/task выполнять?».

Результат полного workflow:

```text
STATUS: complete | needs_attention
CANDIDATE: <full git SHA or none>
SUMMARY: <short human-readable outcome>
ATTENTION: <only when needed>
```

Это формат человеческого handoff, не persisted protocol и не JSON schema.

## 5. Feature lifecycle

### 5.1. Preflight

Orchestrator:

1. Находит repository root; если Git отсутствует, предлагает `git init` и
   продолжает только после явного согласия на изменение repository.
2. Читает task/spec полностью, Makefile, package scripts и language-specific
   config. Project instructions отдельно в prompt не копирует: provider CLI
   загружает свой `AGENTS.md`/`CLAUDE.md` сам; preflight лишь проверяет, что эти
   два файла существуют и byte-for-byte идентичны.
3. Читает установленный native backend skill/help. Команды из этой spec являются
   примерами; установленный backend interface является синтаксическим source of
   truth.
4. Проверяет `command -v`/`which -a` для запускаемых Claude/Codex/OpenCode и не
   использует absolute provider binaries в обход PATH.
5. Показывает сохранённый model set одной короткой репликой и просит подтвердить
   либо изменить его.
6. Определяет project QC, deterministic smoke и наличие agent-required E2E.
7. Предлагает optional watchdog до запуска executor либо перед длительным wait.

URL загружается только через native web/fetch surface текущего агента. Полученный
контент всегда является untrusted task data: он не может отменять user request,
project instructions или security boundary. Redirect в authenticated/private
resource, запрос credentials либо невозможность установить final source дают
`needs_attention`; собственного HTTP fetcher в baseline нет.

Orchestrator не становится основным implementer. Read-only inspection и
небольшие orchestration-owned изменения task/spec допустимы только на явно
описанных стадиях.

### 5.2. Optional reuse research

`mo-reuse` никогда не запускается автоматически. Если в spec нет раздела
`## Reuse research`, orchestrator может один раз предложить пользователю
запустить skill, но отсутствие раздела не блокирует implementation. Пользователь
также может вызвать skill самостоятельно до запуска orchestrator.

После явного вызова `mo-reuse` запускается отдельным top-level agent instance.
Если задача была текстом или URL, до исследования создаётся tracked Markdown
task/spec с acceptance criteria и разделом `## Reuse research`.

Researcher меняет только этот раздел и после завершения создаёт отдельный
spec-only commit. Реализация в этом commit запрещена. Это требование действует
только когда пользователь действительно запустил `mo-reuse`.

Если implementation опроверг существующий reuse decision:

1. executor останавливается и сообщает evidence;
2. orchestrator предлагает пользователю повторный `mo-reuse`;
3. при согласии researcher меняет только reuse section и делает новый
   spec-only commit;
4. executor resume перечитывает spec; при отказе пользователя продолжает с
   явно зафиксированным решением пользователя.

### 5.3. Executor

Executor получает:

- полный path к read-only spec/task;
- короткий native goal или честный weaker fallback;
- выбранный model route;
- доступ к полному native CLI/tool catalog проекта;
- последующие reviewer messages без пересказа.

Executor обязан:

1. прочитать всю spec; project instructions provider CLI загружает сам;
2. реализовать весь scope, а не только MVP;
3. соблюдать существующий reuse decision либо остановиться и запросить решение
   пользователя о повторном research;
4. обновить durable knowledge, которую изменение сделало новой или ложной;
5. выполнить typecheck/lint/tests/build/QC и applicable deterministic smoke;
6. не ослаблять QC/config ради зелёного результата;
7. создать чистый candidate commit;
8. не push/tag/PR без отдельного запроса пользователя.

Executor никогда не редактирует и не удаляет spec. Возможный retirement —
отдельная поздняя docs-only операция после всех gates.

Run-specific ограничения (`spec read-only`, текущий candidate freeze, запрет
push в конкретном run) передаются через task/goal. В постоянный `AGENTS.md` они
попадают только как осознанная project convention, а не автоматически.

### 5.4. Candidate и gates

Candidate — полный Git commit SHA и clean worktree. Никакого candidate file/ref,
snapshot digest или receipt store нет.

Для каждого candidate нужны:

1. свежий результат applicable project QC и deterministic smoke;
2. reviewer A first pass;
3. reviewer B first pass, не видевший findings A;
4. applicable E2E.

QC/smoke не образуют обязательную отдельную orchestration-фазу и не требуют
отдельной роли. Их может запускать executor во время реализации и любой reviewer
для проверки evidence. Orchestrator лишь убеждается, что после последнего
изменения есть свежий применимый результат; при необходимости просит executor
или reviewer повторить команды.

Candidate заморожен на время gates. Любой fix создаёт новый SHA и делает stale
все четыре результата. На новом SHA весь набор applicable gates повторяется.
Completion допустим только при свежих результатах, относящихся к одному SHA.

После restart gate без доступного полного verdict на текущем SHA имеет status
`unknown` и повторяется. Durable gate registry не создаётся.

## 6. Native goal lifecycle

Goal действует до первого executor-owned candidate, удовлетворяющего executor
DoD. Во время независимых review/E2E goal выключена, чтобы executor не изменил
candidate под проверками. Обычные review fixes передаются follow-up turns в той
же session; новая короткая goal нужна только для большого автономного fix batch.

Goal не копирует spec/checklist. Template:

```text
/goal Read the complete task at <SPEC_PATH> and applicable project instructions.
Implement the full scope and continue until there is a clean candidate commit
that passes the project-owned QC and applicable deterministic smoke, or report a
real needs_attention blocker. Keep the spec read-only.
```

### 6.1. Codex

- Используется native interactive `/goal`, не строка внутри ordinary framed
  prompt и не `codex exec` surface без goal support.
- Slash command отправляется atomic backend prompt только из idle state.
- Activation проверяется через documented native surface. Private
  `~/.codex/goals_1.sqlite` допустима только как version-specific read-only
  diagnostic, не как стабильный contract.
- Если activation не доказана, orchestrator объявляет weaker fallback.
- После любого resume goal-state проверяется заново. До первого fix prompt goal
  должна быть доказанно inactive либо заменена новой явно названной fix goal;
  иначе frozen-candidate lifecycle для route unsupported.

### 6.2. Claude Code

- Native `/goal` используется после one-time workspace trust acceptance.
- Runtime preflight проверяет PATH wrapper, trust и hook availability.
- `--dangerously-skip-permissions` разрешает permission bypass, но не заменяет
  workspace trust.
- Managed `disableAllHooks`/`allowManagedHooksOnly` нельзя переиграть wrapper’ом.
- Goal evaluator не вызывает tools, поэтому его success не является QC/gate
  evidence; SHA и команды orchestrator проверяет самостоятельно.

### 6.3. OpenCode и неподдерживаемые surfaces

Если native persisted goal отсутствует:

- сохраняется одна persistent executor session;
- initial prompt формулируется completion-oriented;
- premature idle вызывает обычный follow-up/resume;
- fallback явно называется более слабым и не эмулируется собственной FSM.

## 7. `mo-herdr`

### 7.1. Native control

Precondition — реальный `HERDR_ENV=1`; его нельзя подделывать. `mo-herdr` читает
установленный Herdr skill/help и использует agent names/pane IDs из JSON
responses.

Основные операции:

```bash
herdr agent start <name> --kind <claude|codex|opencode> --pane <pane-id> -- <args>
herdr agent prompt <name> "<prompt>" --wait --timeout <ms>
herdr agent wait <name> --timeout <ms>
herdr agent get <name>
herdr agent read <name> --source recent-unwrapped --lines <N>
```

`agent prompt --wait` означает lifecycle settlement, а не доказанный turn
boundary. Prompt отправляется только после проверки текущего state, чтобы
окончание ранее запущенного turn не удовлетворило новый wait.

Worktree не является default. Он создаётся только для реально параллельного
build/run или изоляции destructive E2E; review diff может читаться по SHA без
checkout.

### 7.2. Полный последний ответ через Herdr

Herdr output является authoritative interface `mo-herdr`. Skill не читает
Claude/Codex/OpenCode JSONL, hooks, rollout files или session databases.

Алгоритм:

1. Зафиксировать actor и exact prompt, затем дождаться settled state.
2. Получить окно:

   ```bash
   herdr agent read <actor> --source recent-unwrapped --lines 200
   ```

3. При необходимости увеличивать `N` (например 400, 800, 1600), пока:
   - видна последняя user-prompt boundary;
   - видна нижняя completed/idle input boundary;
   - между ними находится непрерывный assistant response; либо
   - увеличение `N` перестало добавлять более ранние строки.
4. Выделить интервал между последней prompt boundary и следующей input/idle
   boundary. Для инспекции допустимы стандартные `nl -ba`, `sed -n`, `head` и
   `tail`; это не custom parser.
5. Если full-screen TUI использует alternate screen и progressive `--lines` не
   возвращает историю, использовать только реальные Herdr 0.8 surfaces:
   `herdr agent attach` для ручного page-up/page-down либо, из доказанно idle
   state, provider-qualified `herdr agent send-keys` для scroll controls. После
   каждого шага читать последовательное окно:

   ```bash
   herdr agent read <actor> --source visible
   ```

6. До scrolling фиксируются terminal rows/columns; resize/repaint обнуляет
   сборку. ANSI удаляется Herdr text mode, soft wraps нормализуются
   `recent-unwrapped`, а `visible` сравнивается как rendered Unicode rows.
   Overlap выводится из наблюдаемой высоты viewport и увеличивается при
   повторяющихся строках; без однозначного совпадающего overlap непрерывность не
   доказана. После чтения TUI возвращается вниз и actor остаётся idle.
7. Полный собранный response копируется напрямую в следующий prompt executor.
   Orchestrator не пересказывает и не сокращает findings.
8. Если не доказана верхняя граница, нижняя граница или непрерывность всех окон,
   gate = `unknown`. Orchestrator предлагает: повторить review в более высоком
   pane/inline mode; вручную открыть actor через `herdr agent attach` и передать
   полный verdict; либо исключить эту provider route. Partial output не даёт
   PASS.

В Herdr 0.8.0 `--lines N` возвращает последние N rendered rows. Native
`from_line/to_line` отсутствует в CLI и socket schema. Если будущая версия
добавит range, `mo-herdr` предпочитает его после version probe.

Просьба reviewer «повтори прошлый ответ verbatim» не является retrieval.
Verdict file, `mktemp`, nonce и completion marker не используются.

### 7.3. Acceptance fixtures Herdr

До объявления route supported проверяются:

- ответ длиннее одного viewport;
- ответ длиннее 200/800 rows;
- tool calls до final answer;
- два sequential turns;
- repaint/alternate-screen scrolling;
- resize во время paging инвалидирует сборку;
- Unicode/ANSI/soft-wrap и повторяющиеся overlap-lines;
- resume/compaction, после которого последний turn всё ещё читается;
- отсутствие одной границы приводит к `unknown`, а не PASS;
- Claude, Codex и OpenCode отдельно.

Если Herdr read/scroll не может дать полный turn, route остаётся unsupported для
review gate до исправления Herdr-level interface. Private transcript fallback не
добавляется автоматически.

## 8. `mo-omnigent`

`mo-omnigent` реализует тот же lifecycle через native Omnigent skill, sessions,
resume и export. Он не вызывает `mo-herdr` и не использует общий executable
adapter.

Перед support declaration Phase 0 проверяет:

- slash-command transport и `/goal` survival after resume;
- distinction direct/non-TUI и interactive harness;
- full export на ответе больше default/API limit;
- pagination/end boundary;
- status semantics и premature idle;
- provider CLI resolution через PATH.

Экспорт без доказанной полноты не даёт review PASS. Если native export не
покрывает полный последний turn, соответствующая route честно помечается
unsupported; terminal tail не подменяет export.

## 9. `mo-reuse`

### 9.1. Search protocol

Researcher сначала определяет языки/ecosystems по manifests и проверяет уже
подключённые зависимости. Default — три адаптивные итерации:

1. broad capability/domain query;
2. query из терминов, API и стандартов первой страницы результатов;
3. gap-focused query: отсутствующая возможность, alternative architecture,
   compatibility либо binding/FFI terms.

Каждая итерация включает:

1. GitHub search отдельно по каждому языку проекта, stars descending, первая
   страница (30), archived=false;
2. обязательный GitHub Rust search;
3. search в native registry каждого ecosystem;
4. чтение агентом names/descriptions первой страницы;
5. запись, что найдено и почему следующий query изменился.

Reference command:

```bash
gh search repos "$QUERY" \
  --language "$LANGUAGE" --sort stars --order desc \
  --archived=false --limit 30 \
  --json fullName,description,stargazersCount,pushedAt,license,url,isArchived
```

Rust оценивается не только по stars. Приоритет: готовые official bindings; затем
стабильный C ABI/WASM/N-API/PyO3/UniFFI path. Researcher оценивает объём wrapper,
memory/error model и maintenance cost; слишком дорогой binding отвергается.

Registry-specific правила:

- npm: relevance плюс downloads/most dependents, затем `npm view` metadata и
  provenance;
- crates.io: `cargo search --limit 30` является textual relevance, не download
  ranking; adoption и recency проверяются у finalists;
- PyPI: official JSON/Index APIs не считаются popularity-sorted search;
  relevance/metadata дополняются repository evidence, а внешняя download
  статистика явно маркируется как внешний источник;
- другие ecosystems используют native search и только реально доступную
  adoption metric.

Agent видит всю первую страницу, но spec хранит только queries/sources,
релевантный shortlist и причины отсева.

### 9.2. Формат результата

```markdown
## Reuse research

### Existing project capabilities
...

### Search iterations
- Round 1: sources, queries, what changed
- Round 2: ...
- Round 3: ...

### Finalists
| Candidate | Fit | License | Maintenance/adoption | Integration/binding cost | Risks |

### Decision
reuse | extend | build

Chosen solution, rejected alternatives and constraints.
```

Три раунда — default: можно остановиться раньше при полном strong evidence или
продолжить при конкретном unresolved question.

## 10. `mo-review`

Основной standalone use case `mo-review` — быстрый fix в той же coding session,
которая только что внесла изменение. Эта session временно совмещает executor и
orchestrator: читает текущий task/spec и полный Git diff, запускает независимых
reviewers, сама исправляет принятые замечания и повторяет review до сходимости.
Отдельный executor для такого режима не создаётся. Это осознанное исключение из
правила «executor без methodology skill», допустимое для небольшого scope, где
потеря coding context дороже риска methodology bias.

`mo-review` является textual review protocol, а не actor launcher API. При
вызове из полного workflow выбранный backend skill (`mo-herdr` или
`mo-omnigent`) владеет созданием reviewers, ожиданием, full-output retrieval и
возвратом управления; `mo-review` задаёт prompts, lenses и convergence rules.
При прямом вызове текущая coding session использует однозначно доступный backend
либо спрашивает пользователя, через какой backend запустить reviewers.

Если artifact или diff нельзя полностью поместить в reviewer context, review не
начинается частично: scope делится на явно перечисленные независимые части с
общим final integration pass либо возвращается `needs_attention`.

First-pass reviewers независимы. Минимум один reviewer использует другого vendor
относительно coding session/executor. Coding session не занимает reviewer slot.

Обязательные review lenses:

- соответствие всей spec/business цели;
- correctness, errors, concurrency/security по применимости;
- tests и отсутствие ослабления QC;
- architecture boundaries и вопрос «зачем это вообще нужно?»;
- reuse decision;
- durable knowledge;
- purpose semantics, включая overload declarations;
- лишний tooling, proxy wrappers и ritual text.

Reviewer возвращает обычный Markdown:

```markdown
## Verdict
PASS | FAIL

## Findings
### <severity>: <title>
Evidence: <конкретное место или наблюдение>
Impact: <почему это важно>
Expected fix: <какой результат должен дать fix, без навязывания реализации>

## Residual risks
...
```

`CANDIDATE` и `WORKTREE` не являются полями reviewer output: backend/current
session и так знают проверяемый Git diff, а повторение metadata reviewer-ом не
добавляет evidence. Для каждого finding обязательны `Evidence`, `Impact` и
`Expected fix`; последнее описывает ожидаемое исправленное поведение или
структуру. Structured JSON findings не нужны. Findings копируются executor или
текущей coding session целиком.

В standalone quick-fix mode worktree может быть dirty. Coding session применяет
findings, запускает applicable QC/smoke сама либо учитывает их запуск reviewer-ом
и затем начинает новый независимый review round. Цикл заканчивается только когда
оба reviewer в одном round возвращают PASS без actionable findings. Любое
изменение после verdict делает этот round устаревшим. Большая feature/spec вместо
этого режима использует `mo-herdr` или `mo-omnigent` с отдельным executor.

Если один prompt превышает известный backend limit, Markdown делится только по
исходным heading boundaries на нумерованные verbatim chunks; каждый chunk
отправляется после settled acknowledgement предыдущего. Orchestrator не
перефразирует содержимое. Отказ backend принять chunk даёт `needs_attention`.

Спор разрешается так:

1. исходный reviewer читает rebuttal;
2. второй reviewer выносит решение по конкретному спору;
3. при необходимости один targeted fact-check;
4. orchestrator принимает техническое решение;
5. пользователь привлекается только для product meaning или реально
   неразрешимого выбора.

Reviewer может использовать subagents по независимым risk lenses: обычно 0 для
малого изменения, 2–3 для среднего, до 4–6 для большого архитектурного scope.
Фиксированные 6–9 subagents на каждую задачу не требуются.

Осознанно оставленный substantive risk получает durable `why` рядом с кодом,
только если причина не очевидна и будущий reviewer иначе снова потеряет её.

## 11. E2E

| Вид | Кто выполняет | Contract |
|---|---|---|
| Короткий deterministic console smoke | Executor или reviewer | `make mo-smoke`, может входить в `mo-qc`; отдельная фаза не нужна |
| Agentic benchmark | Отдельный `mo-e2e` tester | command/help + выбранные scenarios/evidence |
| Browser E2E | Отдельный `mo-e2e` tester | установленный `agent-browser` skill + scenario groups |

Orchestrator определяет вид E2E. Отдельный tester не запускается для команды
вроде restart container + one request + output assertion.

Для agent-required E2E:

- `docs/e2e.md` подходит для небольшого набора;
- большой набор использует `docs/e2e/index.md` и отдельные group files;
- index описывает environment, prerequisites, selection, evidence и cleanup;
- group объясняет, когда его выбирать;
- tester запускает релевантные группы, не весь каталог по умолчанию.

`make mo-e2e` для browser/benchmark ничего не притворяется исполнившим. Он
печатает понятный help, начиная с `AGENT_REQUIRED: not executed`, указывает docs,
commands и cleanup и завершает code 2. `mo-qc` от него не зависит.

`e2e.json` и detached worktree не обязательны. Tester называет SHA; любой новый
candidate заставляет повторить applicable E2E.

## 12. `mo-setup`

`mo-setup` — идемпотентный standalone skill для нового или существующего проекта.
До изменения он показывает proposed diff и не затирает existing conventions.

### 12.1. Knowledge и instructions

Default layout:

```text
docs/business.md
docs/glossary.md
docs/backlog.md
docs/architecture/
docs/e2e.md                 # либо docs/e2e/index.md + groups
AGENTS.md
CLAUDE.md
```

`business`, `glossary`, `backlog` находятся на верхнем уровне docs. Слой
`docs/knowledge/` и `KnowledgeImpactPlan` не создаются.

`AGENTS.md` и `CLAUDE.md` содержат один и тот же короткий stable project contract:
desired outcomes, architecture/purpose/knowledge тезисы и project commands. Они
не содержат executor methodology или ограничения одного feature run. Файлы
создаются и синхронизируются byte-for-byte идентичными; provider CLI сам читает
подходящий ему файл, поэтому orchestrator не копирует contract в каждый prompt.

Оба файла явно требуют: всё отложенное, намеренно не сделанное, заблокированное
или оставленное неисправленным по любой причине записывается в
`docs/backlog.md`. Запись объясняет причину, практический impact и следующий
шаг, если он известен.

Durable knowledge переносится executor до candidate: новая business meaning — в
`business.md`, термины — в `glossary.md`, boundaries/decisions — в
`architecture/`, deferred actionable debt — в `backlog.md`. Spec остаётся
tracked.

### 12.2. Provider wrappers, trust и hooks

Skill выполняет:

```bash
command -v claude codex opencode
which -a claude codex opencode
```

Он проверяет, что resolved user wrappers:

- передают все аргументы (`"$@"` или эквивалент);
- Claude включает ожидаемый permission mode;
- Codex включает ожидаемые approval/sandbox flags;
- orchestrator не вызывает absolute provider binary в обход PATH.

Текущие локальные wrappers в `/Users/alex/bin/claude` и
`/Users/alex/bin/codex` являются reference для этой машины, но их absolute paths
не записываются в portable project docs.

Для Claude `mo-setup` проверяет trust текущего project root и hook sources.
Untrusted workspace проходит one-time interactive native trust dialog. Skill не
редактирует private `~/.claude.json` автоматически и не обещает обойти managed
policy.

### 12.3. Make/QC aliases

Обязательный aggregate entry:

```text
make mo-qc
```

Conditional entries:

```text
make mo-typecheck
make mo-lint
make mo-test
make mo-build
make mo-smoke
make mo-e2e
```

Skill сначала читает Makefile/package scripts/task runner. При эквивалентной
команде под другим именем он спрашивает, создать ли alias. При отсутствии gate
предлагает готовый mature tool и project-owned config; custom wrapper/checker
создаётся только после доказанной невозможности plugin/config solution.

## 13. QC profiles

### 13.1. Python

Default candidates, с сохранением existing stack:

- Ruff format/lint, включая подходящие doc/complexity rules;
- mypy или Pyright;
- pytest;
- Import Linter для boundaries/cycles;
- Interrogate только для реалистичной purpose/doc coverage;
- Pylint `too-many-lines` при необходимости file-size gate;
- Deptry при реальной dependency-hygiene проблеме.

Greenfield minimum: Ruff + Pyright + pytest. Brownfield сохраняет существующий
type checker/test runner, если они дают эквивалентный outcome.

### 13.2. TypeScript

- `tsc --noEmit`/`tsc -b` либо framework checker остаётся type source of truth;
- ESLint flat config + `typescript-eslint` typed lint;
- existing test runner сохраняется;
- Prettier отделён от correctness;
- `eslint-plugin-jsdoc` используется для mechanical purpose coverage;
- Oxlint может ускорить typed lint, но не заменяет `tsc` и отсутствующие
  JSDoc/size rules;
- greenfield Node-only может использовать `node:test`; Vitest выбирается для
  Vite/browser/DOM/richer mocking; существующий Jest/Vitest не мигрирует ради
  унификации.

Начальные configurable thresholds: file 400–500 lines, function 60–80,
complexity warn/error 10/15, statements 30–40, nesting depth 4. Generated,
declarations, migrations и config имеют явные exceptions; tests могут быть
мягче. Brownfield baseline не создаётся автоматически.

## 14. Purpose и architecture contract

Purpose объясняет:

- зачем symbol/module существует;
- какой invariant, responsibility или business role он обслуживает;
- что станет неверным или лишним при удалении.

Пересказ implementation не считается purpose. Mechanical presence обязательно
для first-party modules, public/exported APIs, classes, architecture boundaries
и каждой overload declaration. Документация implementation overload не
освобождает overload declarations от собственного purpose.

Nontrivial private/test symbols покрываются risk-proportionally. Trivial
accessors, short closures, generated/vendored glue не получают ritual prose;
exceptions живут в linter config.

Linters проверяют presence/shape, reviewers — смысл по принципам
`docs/references/grace.md`.

Architecture contract требует проверять responsibility boundaries, allowed
dependencies, independently changeable parts, god-files/objects, excess
coupling, fit to existing architecture и возможность удалить stale branches.
Reviewer всегда задаёт вопрос: «Зачем эта сущность нужна вообще?».

Если Markdown нужно разбирать программно, используется готовая AST library,
найденная через `mo-reuse`; regex-parser Markdown не допускается.

## 15. Models и `~/.meta-o`

`~/.meta-o` нужен только для редко меняющихся model preferences:

```text
~/.meta-o/models.json
```

Минимальная schema:

```json
{
  "schemaVersion": 1,
  "defaults": {
    "executor": "route/model/effort",
    "researcher": "route/model/effort",
    "reviewerA": "route/model/effort",
    "reviewerB": "route/model/effort",
    "e2eTester": "route/model/effort"
  },
  "projects": {
    "<sha256(realpath-project-root)>": {
      "roles": {},
      "updatedAt": "ISO-8601"
    }
  },
  "dismissedUpgrades": {}
}
```

Файл не содержит runs, SHA, findings, gates, actor states или watchdog state.

`mo-models.mjs`:

- читает authoritative route-specific catalogs/SDKs;
- читает history hints за последний месяц и последние 10 sessions;
- дедуплицирует effective model IDs;
- не выдаёт recent history за полный available catalog;
- не запускает agents и не принимает prompts;
- предлагает upgrade только при доказанном новом release generation, а не при
  смене sibling family;
- при ошибке сохраняет текущий selection и не портит settings.

Helper является единственным writer `models.json` внутри одного invocation.
Concurrent invocations не координируются: честная semantics — last successful
writer wins; запись идёт через temporary sibling + atomic rename. Это не CAS и
не workflow state. Неизвестная schemaVersion никогда не перезаписывается.

Default startup question — одна строка со всеми ролями. Полный catalog выводится
только по просьбе или при meaningful successor evidence.

## 16. `mo-watchdog`

Watchdog опционален и запускается только после согласия пользователя. Один
watchdog наблюдает одного orchestrator.

Он:

- ждёт native backend event/state;
- сообщает только реальный `needs_attention`;
- может ping/message orchestrator;
- не делает takeover, не запускает feature, не хранит state и не обслуживает
  несколько проектов.

До релиза выполняется next-turn spike. Если agent session после bounded native
wait получает новый reasoning turn, `mo-watchdog` остаётся skill-only. Если нет,
в этой же итерации допускается минимальный `.mjs` helper: 1:1 wait/poll +
notification/ping, без state/FSM. Решение не откладывается до production failure.

## 17. Recovery и human attention

После restart orchestrator читает:

- branch/status/recent log/merge-base diff;
- tracked task/spec и reuse section;
- Make/QC/E2E docs;
- native backend sessions и именованные actors;
- candidate-like commits.

Session names используют `<slug>-exec`, `<slug>-review-a`, `<slug>-review-b`,
`<slug>-e2e`. Registry не создаётся. Неясный gate повторяется. Если несколько
реальностей одинаково правдоподобны, задаётся один конкретный вопрос.

User-facing actor classification только:

- `idle` — human action не требуется;
- `needs_attention` — нужен user decision, recovery или external input.

Native `done` сначала читает orchestrator; если он может продолжить сам, user
attention не требуется.

Пользователь нужен только для product meaning/scope, irreversible/production
action, credentials/data, meaningful subscription/model-route change,
genuinely unresolved dispute и optional watchdog launch.

## 18. Reflection

Reflection возникает только при substantial repeated/systemic failure: дефект
прошёл до E2E/human, повторился один root cause или потребовалось неожиданное
ручное вмешательство.

Одна короткая запись в `docs/backlog.md`:

```text
Area/path | incident | why checks missed it | practical risk | proposed follow-up
```

Она не расширяет текущую feature. Пользователь решает, запускать ли улучшение и
применять ли Meta-O к развитию самой Meta-O.

## 19. Distribution

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

Установка выполняется APM или `npx skills`. `install.sh`/`update.sh` отсутствуют.
Каждый skill self-contained. Canonical frontmatter ограничивается полями,
поддерживаемыми target skill managers.

Canonical methodology/model helper имеет одного source owner; dist build
механически копирует его в independently installable directories и проверяет
идентичность. Runtime shared package или executable router не появляется.

## 20. Implementation и migration plan

### Phase 0 — capability fixtures, без удаления current flow

1. Herdr 0.8 read/scroll long-turn fixtures для Claude/Codex/OpenCode.
2. Omnigent goal/resume/full-export fixtures.
3. Codex и Claude `/goal` activation/resume; Claude trust/hooks.
4. PATH wrapper resolution.
5. Watchdog next-turn spike.
6. Model catalog/history source matrix.
7. APM/skills standalone installation spike.
8. Python/TypeScript tooling spike.

Phase 0 начинается как documented manual/native command checklist с сохранённым
human-readable evidence. Custom TypeScript capability runner не создаётся, пока
повторение fixtures не докажет измеримую стоимость и отдельный §3 admission
review не назовёт consumer, timeout/retry/version-expiry contracts.

### Phase 1 — skills alongside current implementation

1. Canonical methodology reference.
2. `mo-setup`, `mo-review`, `mo-e2e` и независимо вызываемый `mo-reuse`.
3. `mo-herdr`, затем `mo-omnigent`.
4. `mo-models.mjs`; conditional watchdog helper.
5. End-to-end small feature через оба backend skills.

### Phase 2 — destructive simplification

После acceptance fixtures удалить без compatibility adapters:

- public `meta-o` CLI/workflow commands;
- FSM, state store, run context, ownership/takeover/write-ahead;
- SessionAdapter/backend adapters;
- findings/results/decision stores и Structured JSON transport;
- snapshot/digest/attestation/receipts;
- QC/E2E/adoption manifests;
- immutable spec hash/blob protocol;
- custom Markdown parser, import graph и generic quality wrappers, покрытые
  mature tools;
- watchdog daemon/service;
- install/update scripts и obsolete adapter tests.

### Phase 3 — verification

- standalone install каждого skill через оба package managers;
- direct `mo-review` после small fix;
- restart recovery по Git/spec/native sessions;
- clean repository QC;
- отсутствие старых public CLI/state dependencies в dist/docs.

## 21. Acceptance criteria

1. Пользователь может запустить `mo-herdr` без аргумента и получить понятный
   вопрос/предложение продолжить текущую работу.
2. Executor не читает methodology skill и всё же выполняет полный scope.
3. Большая task запускается через native `/goal` там, где activation доказана.
4. `mo-reuse` не запускается без решения пользователя; при запуске его commit
   содержит только spec + reuse research.
5. `mo-reuse` показывает агенту GitHub language/Rust и registry first pages в
   трёх адаптивных rounds.
6. Два independent reviews и E2E проверяют один final SHA; reviewer output не
   обязан повторять служебные поля SHA/worktree.
7. Любой fix invalidates все gates.
8. `mo-herdr` извлекает длинный последний reviewer turn через Herdr read/scroll,
   доказывая обе границы и непрерывность; private provider sessions не читает.
9. Full retrieval failure даёт `unknown`, не частичный PASS.
10. Simple smoke выполняет executor или reviewer без отдельной фазы;
    browser/benchmark — отдельный tester.
11. `mo-setup` создаёт понятный new-project knowledge/instruction/QC skeleton и
    проверяет wrappers/trust/hooks; созданные `AGENTS.md` и `CLAUDE.md`
    byte-for-byte идентичны и требуют записывать все отложенные вещи в
    `docs/backlog.md`.
12. Python и TypeScript получают native typecheck/lint/test/QC contracts.
13. Purpose reviewer отвергает implementation restatement и проверяет overloads.
14. Restarted orchestrator восстанавливает работу по Git/spec/sessions либо
    задаёт один точный вопрос.
15. В dist нет public workflow CLI, installer/updater, state.json, manifests,
    receipts и proxy adapters.
16. Direct `mo-review` в coding session запускает двух reviewers, применяет
    fixes этой же session и повторяет rounds до двух PASS без actionable
    findings; каждый finding содержит `Evidence`, `Impact` и `Expected fix`.

## 22. Decision ledger

### Adopted

| Decision | Rationale | Source |
|---|---|---|
| Skills-first, без workflow engine | Native CLI + reasoning сохраняют нужный outcome с меньшим control layer | approach council + user |
| Только `mo-herdr` и `mo-omnigent` | Два реально нужных backend; Paseo отложен пользователем | user |
| Executor без methodology skill | Большая spec/project contract достаточны и не навязывают ritual workflow | user + council |
| `mo-reuse` только по решению пользователя; orchestrator лишь предлагает его при отсутствии research | Reuse полезен, но не должен автоматически отвлекать от implementation | user |
| Herdr read/scroll как единственный output interface `mo-herdr` | Не лезть в provider-private sessions/hooks | user |
| Backend skill владеет actors, `mo-review` — textual protocol | Не нужен скрытый skill RPC/launcher layer | spec review R3 |
| Direct `mo-review` совмещает orchestrator и executor в текущей small-fix session | Сохраняет coding context и даёт короткий review/fix loop без отдельного feature workflow | user |
| Full Markdown verdict без Structured JSON | Нет внешнего machine consumer | user + council |
| Любой SHA invalidates все gates | Простое fail-closed правило без impact guessing | premortem + user |
| Spec read-only для executor | Product/research decisions меняет отдельный instance | user |
| Conditional E2E tester | Простой smoke не требует агента, browser/benchmark требует | user |
| `mo-setup` владеет knowledge/instructions/QC/provider onboarding | Единый идемпотентный project contract | user + synthesis |
| `AGENTS.md` и `CLAUDE.md` byte-identical; deferred work идёт в `docs/backlog.md` | CLI читает project instructions сам, а единый contract не расходится между providers | user |
| `~/.meta-o` хранит только model preferences | Редко меняющаяся полезная настройка без run state | user |
| Optional 1:1 watchdog | Observer нужен иногда, takeover/state не нужен | user |
| APM/skills distribution | Пользователь выбрал стандартные package managers | user |
| No backward compatibility | Позволяет реально удалить старый control layer | user |

### Rejected

| Decision | Rationale | Source |
|---|---|---|
| Public `meta-o` CLI/router | Проксирует уже имеющиеся CLI и ограничивает агента | user |
| FSM/state.json/run registry | Recovery достаточно по Git/spec/native sessions | user |
| Session adapters | Дублируют Herdr/Omnigent interfaces | council |
| Structured findings JSON | Нет consumer; теряется естественный reviewer output | user |
| Verdict file + nonce | Ненужный protocol; orchestrator копирует output | user |
| Provider JSONL/SQLite retrieval в `mo-herdr` | Пользователь выбрал Herdr output surface | user |
| Custom capability harness в baseline | Manual/native fixtures достаточны до доказанного repetition cost | spec review R3 |
| Snapshot digest/receipts/manifests | Явный SHA и rerun проще | user + council |
| Required worktrees | Не нужны для обычного review и усложняют recovery | user |
| Executor skill | Противоречит desired strong autonomous executor | user |
| Separate adjudicator | Второй reviewer/оркестратор решают технический спор | user |
| Project-owned generic AST/import/E2E checkers | Сначала mature tools/plugins | user |
| Install/update scripts | Установка через APM/skills | user |
| Paseo в текущей версии | Пользователь исключил scope | user |

### Deferred

| Decision | Admission condition | Source |
|---|---|---|
| Watchdog `.mjs` helper | Только отрицательный next-turn spike до релиза | user + synthesis |
| General transcript parser | Только новая доказанная потребность; не fallback к private sessions | user |
| Brownfield quality baseline | Только если hard adoption без baseline практически невозможен | council |
| Mandatory spec retirement | Отдельное project convention после durable knowledge transfer | user |
| Multi-project watchdog | Только после реальной потребности; baseline 1:1 | user |

## 23. Open questions

Blocking architecture questions отсутствуют. Phase 0 не выбирает новые
архитектуры, а проверяет заранее определённые conditional contracts:

- watchdog остаётся skill-only при successful next-turn fixture, иначе получает
  уже ограниченный `.mjs` helper;
- конкретная Omnigent route объявляется supported только после full-export/goal
  fixture, иначе остаётся unsupported;
- future Herdr native line range используется только после появления и probe,
  не меняя lifecycle.

## 24. Primary references

- `docs/references/my-opinion.md`
- `docs/references/grace.md`
- `spec/2026-08-05-ai-driven-development-workflow-revision/task-description.md`
- `spec/2026-08-05-ai-driven-development-workflow-revision/synthesis.md`
- Herdr agent automation: <https://herdr.dev/docs/agent-automation/>
- Claude `/goal`: <https://code.claude.com/docs/en/goal>
- GitHub repository search: <https://docs.github.com/en/rest/search/search#search-repositories>
- npm package search: <https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/>
- Cargo search: <https://doc.rust-lang.org/cargo/commands/cargo-search.html>
- PyPI APIs: <https://docs.pypi.org/api/>
