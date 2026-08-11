## 1. Высокоуровневый подход

`mo-herdr` становится тонким процессным оркестратором: он создаёт видимые долгоживущие CLI-сессии, доставляет сообщения, ждёт lifecycle-события и связывает gate’ы с Git SHA, но не читает spec, business framing, diff или код и не оценивает технические замечания. Исполнитель владеет feasibility, реализацией и разбором findings; два независимых reviewer’а работают в обычных интерактивных Herdr-панелях и сохраняют контекст между раундами.

Новые daemon, state store, adapter layer, orchestration CLI, manifest или receipt не вводятся. Реализация ограничивается существующими skills, двумя dependency-free shipped helpers, их build-процессом и проверками.

## 2. Архитектура и ответственности

### 2.1. Оркестратор

Граница роли фиксируется в `shared/references/methodology.md`, `src/skills/mo-herdr/SKILL.md` и существующем `docs/architecture/skills-first.md`.

Оркестратор может:

- получить repository root, текущую ветку, чистоту worktree и полный `HEAD`;
- принять путь к task/spec от пользователя или передать исполнителю поиск очевидного tracked task/spec;
- создать Herdr tabs и panes;
- запустить обычные интерактивные Claude/Codex/OpenCode CLI;
- отправлять prompts через атомарную Herdr-операцию text+Enter;
- ждать lifecycle-состояния конкретного actor’а;
- читать краткие процессные ответы и reviewer verdict;
- дословно передавать сообщения между sessions;
- проверять, что заявленный candidate соответствует текущему полному SHA и чистому worktree;
- считать gate’ы предыдущего SHA устаревшими после любого нового commit;
- классифицировать только транспортные и инфраструктурные состояния;
- завершить workflow одним verified SHA либо настоящим `needs_attention`.

Оркестратор не может:

- открывать или пересказывать spec/task;
- открывать business framing;
- читать исходники, diff, тестовые файлы или build-конфигурацию;
- самостоятельно определять QC;
- проверять feasibility;
- оценивать правильность реализации;
- решать, прав ли reviewer;
- фильтровать, ранжировать, объединять или переформулировать findings;
- принимать техническое или архитектурное решение за actor’ов;
- создавать реализационную документацию, changelog или backlog-записи;
- превращать обычную техническую развилку в вопрос пользователю.

Оркестратор не пытается заранее найти feature-specific business framing внутри `docs/business/index.md`: это потребовало бы чтения содержимого. Если точный путь не передан, executor получает корень `docs/business/` и сам находит относящийся к задаче framing.

### 2.2. Исполнитель

Исполнитель — единственная реализационная роль. Он:

1. Находит и полностью читает task/spec и связанный business framing.
2. Проверяет feasibility и полноту входов.
3. Изучает проект, Makefile, package scripts, source code и существующие проверки.
4. Принимает обычные технические решения самостоятельно.
5. Реализует весь scope, а не MVP.
6. Запускает project-owned QC и deterministic smoke.
7. Коммитит каждый цельный, самостоятельно проверяемый increment.
8. После review проверяет каждый finding, исправляет его или готовит доказательный rebuttal.
9. Обновляет только действительно затронутое долговременное знание.
10. Сообщает оркестратору процессный результат: продолжение, candidate или допустимый blocker.

Стартовый prompt содержит правило автономности:

```text
Resolve ordinary technical choices yourself from the specification, project
contract, repository evidence, tests, and reviewer feedback. Make the most
conservative implementation-ready assumption and continue. Record it only if it
becomes durable project knowledge. Do not ask the user to choose between ordinary
technical alternatives.
```

Допустимые причины `needs_attention`:

- неясная продуктовая семантика, меняющая наблюдаемое поведение;
- необратимое или production-facing действие;
- credentials или недоступные данные;
- изменение subscription/model route;
- внешний blocker, который actor не может устранить;
- технический спор, который остался неразрешимым после reviewer arbitration и targeted fact-check.

Отсутствие очевидного решения, сложность работы или желание получить подтверждение сами по себе blocker’ом не являются.

### 2.3. Ревьюеры

`mo-review` владеет review lenses, форматом verdict и правилами convergence. `mo-herdr` владеет sessions, доставкой prompts, ожиданием и чтением результата.

Каждый reviewer:

- получает точный frozen SHA;
- получает путь к task/spec;
- получает точный business framing path, найденный executor’ом;
- самостоятельно читает требования и repository;
- не видит первый verdict другого reviewer’а;
- возвращает компактный самостоятельный verdict;
- остаётся в той же interactive session для повторных раундов;
- повторно проверяет новый SHA, не создавая новую session.

Reviewer A и B первой итерации работают параллельно и независимо. Хотя физически sessions расположены рядом, промпты не содержат вывод другого reviewer’а.

Оркестратор передаёт findings исполнителю без изменений:

```text
REVIEWER A — VERBATIM
<exact complete output>

REVIEWER B — VERBATIM
<exact complete output>
```

Добавленные заголовки идентифицируют источник; содержимое между ними не меняется.

## 3. Разрешение review-споров

Текущий шаг `mo-review`, где техническое решение принимает оркестратор, удаляется.

Новый протокол:

1. Executor получает оба полных verdict’а.
2. Executor для каждого finding:
   - исправляет проблему; либо
   - готовит rebuttal с конкретным доказательством.
3. Оркестратор дословно передаёт rebuttal исходному reviewer’у.
4. Исходный reviewer подтверждает закрытие или повторяет finding с новым evidence.
5. Если disagreement сохраняется, второй reviewer получает дословно:
   - исходный finding;
   - rebuttal executor’а;
   - повторный ответ первого reviewer’а.
6. Второй reviewer выносит targeted verdict по спору.
7. Если оба reviewer’а сходятся, executor либо следует verdict, либо предъявляет новый проверяемый факт, после чего выполняется один targeted fact-check.
8. Если спор остаётся:
   - продуктовый — `needs_attention`;
   - основанный на проверяемом факте — targeted check выполняет reviewer;
   - вкусовой и без доказанного practical impact — не блокирует;
   - технически неразрешимый после этих шагов — `needs_attention`.

Оркестратор не классифицирует спор по содержанию. Классификацию возвращает executor или reviewer явной строкой; оркестратор только выбирает следующий процессный маршрут.

## 4. Видимая Herdr-топология

### 4.1. Layout

Целевая раскладка:

```text
Tab: <slug>-orchestrator
┌──────────────────────┬──────────────────────┐
│ orchestrator         │ executor             │
│ current pane         │ <slug>-exec          │
└──────────────────────┴──────────────────────┘

Tab: <slug>-review
┌──────────────────────┬──────────────────────┐
│ reviewer A           │ reviewer B           │
│ <slug>-review-a      │ <slug>-review-b      │
└──────────────────────┴──────────────────────┘
```

Последовательность:

1. Проверить `HERDR_ENV=1`.
2. Прочитать установленный `herdr --help` и relevant `herdr tab`, `pane`, `agent` help.
3. Получить current workspace/tab/pane из caller context.
4. Переименовать текущую вкладку в `<slug>-orchestrator`.
5. Разделить current pane направо, сохранив cwd и focus:
   ```text
   herdr pane split --current --direction right --cwd "$PWD" --no-focus
   ```
6. Запустить executor в созданной панели.
7. Перед первой review-итерацией создать вкладку `<slug>-review`.
8. Запустить reviewer A в её root pane.
9. Разделить root pane направо и запустить reviewer B.
10. Не закрывать и не пересоздавать sessions между раундами.
11. Не менять пользовательский focus автоматически.

`<slug>` — короткий ASCII slug, совместимый с Herdr actor-name constraints. IDs всегда берутся из JSON Herdr, а не вычисляются по расположению панелей.

Если текущая Herdr version не предоставляет tab rename/title operation, layout всё равно создаётся, а отсутствие rename оформляется отдельным узким upstream issue. Оно не заменяется shell escape sequence, proxy wrapper или переименованием workspace.

### 4.2. Только обычные interactive CLI sessions

Executor и reviewers запускаются только через Herdr agent surface:

```text
herdr agent start <name> --kind <claude|codex|opencode> --pane <pane-id> -- <native-args>
```

Для этих ролей запрещены:

- `claude -p`;
- `codex exec`;
- `opencode run`;
- provider SDK sessions;
- hidden subagents;
- shell-launched headless agents;
- provider-private transcripts;
- новая одноразовая session на каждый review round.

`pane run` остаётся допустимым для обычных команд: тестов, server process или deterministic smoke. Он не используется как обход interactive agent session.

На первом этапе review gate поддерживается только на provider routes, для которых интерактивное чтение компактного verdict доказано fixtures. По текущим данным:

- Codex interactive route — поддерживается в пределах доказанного размера;
- Claude interactive route — поддерживается для компактных verdict’ов, но не для длинных repaint-heavy ответов;
- OpenCode interactive review route — остаётся `unknown/unsupported`, пока tool-using verdict и continuity не будут доказаны на TUI surface.

Наличие OpenCode agent kind в Herdr не считается доказательством пригодности route для review gate.

## 5. Доставка prompt и Enter

Обычные actor messages отправляются только так:

```text
herdr agent prompt <actor> "<prompt>" --wait --timeout <ms>
```

`agent prompt` атомарно отправляет prompt и encoded Enter и сам проверяет lifecycle transition. Поэтому запрещаются для обычной работы:

- `pane send` или raw terminal write;
- отдельная отправка текста и Enter;
- вставка prompt в shell command;
- использование `send-keys` вместо `agent prompt`;
- начало отдельного `wait`, если отправка вернула `agent_prompt_stalled`.

Обработка `agent_prompt_stalled`:

1. Прочитать `herdr agent get <actor>`.
2. Если actor уже `working`, не отправлять дубликат; ждать текущий turn.
3. Если actor settled и prompt не появился в recent output, повторить `agent prompt` один раз.
4. После второго stall вернуть transport `needs_attention`.

`send-keys` разрешается только для provider-specific UI control, например `esc` или `ctrl+c`. Если требуется подтвердить UI-действие Enter’ом, отправляется отдельный logical key `enter`, после чего проверяется новое состояние. Это не используется для рабочих prompts.

## 6. Goal-контракты

### 6.1. Goal оркестратора

В `mo-herdr` добавляется рекомендуемый короткий startup prompt:

```text
/goal Use mo-herdr to drive <SPEC_PATH> to one verified full Git SHA. Manage the
visible persistent executor and reviewer sessions yourself. Do not read the spec,
business framing, diff, or code; do not assess findings. Interrupt me only for a
real NEEDS_ATTENTION condition.
```

Если skill был вызван без такого goal, он один раз показывает эту рекомендацию для будущих unattended runs и продолжает текущий run. Подтверждение пользователя не требуется.

### 6.2. Goal исполнителя

```text
/goal Locate and read the complete task at <SPEC_PATH>, its recorded business
framing, and the project instructions. Verify feasibility, then implement the full
scope. Resolve ordinary technical choices yourself. Keep the task and framing
read-only, commit coherent independently verifiable increments, and continue until
the worktree is clean and the tip commit passes project-owned QC and deterministic
smoke, or report a real NEEDS_ATTENTION blocker.
```

Если business framing split:

```text
Business framing is under <BUSINESS_ROOT>. Resolve the exact per-feature file
yourself before implementation and report its path in your readiness response.
```

Для route без persisted native goal тот же текст отправляется обычным initial prompt. Никакой project-owned goal state не создаётся.

## 7. Actor response boundaries

Новый machine protocol или persisted schema не вводится. Используются короткие human-readable status headings.

Executor завершает значимый turn одним из вариантов:

```text
READY
SPEC: <absolute path>
BUSINESS: <absolute path>
BRANCH: <branch>
```

```text
CANDIDATE
SHA: <full SHA>
QC: <command and result>
SMOKE: <command and result or not-applicable>
```

```text
NEEDS_ATTENTION
CLASS: product | irreversible | credentials | subscription | external | dispute
DETAIL: <short concrete blocker>
```

`CONTINUE` не требуется: если executor ещё работает, lifecycle state уже является источником истины.

Reviewer использует существующий контракт:

```text
## Verdict

PASS | FAIL | UNKNOWN

## Findings

...

## Residual risks

...
```

Это не completion sentinel. Verdict является содержанием review, а полнота транспорта доказывается Herdr boundaries.

Концептуальное runtime-состояние:

```ts
type Candidate = {
  sha: string; // full 40-character SHA
  worktreeClean: true;
};

type GateVerdict = "pass" | "fail" | "unknown" | "stale";

type GateSet = {
  sha: string;
  qc: GateVerdict;
  smoke: GateVerdict | "not-applicable";
  reviewerA: GateVerdict;
  reviewerB: GateVerdict;
  e2e: GateVerdict | "not-applicable";
};
```

Оно существует только в reasoning-контексте:

- не сериализуется;
- не пишется в repository или home;
- не является manifest или receipt;
- после restart восстанавливается из Git и Herdr sessions;
- полностью инвалидируется, если `HEAD !== gateSet.sha`.

## 8. Ожидание акторов

Ожидание строится только на прямом lifecycle state, не на ожидаемом будущем SHA.

```text
waitActor(actor):
    call herdr agent wait actor --timeout 600000

    if settled:
        read actor state and authoritative response
        continue workflow

    if timeout:
        read actor state once
        if working:
            call one new bounded wait
        else:
            read the already-finished response immediately

    if blocked:
        read blocker and route it

    if unknown:
        inspect recent output once
        retry bounded wait or mark transport unknown
```

Правила:

- стандартный interval: 10 минут;
- после transient provider error: 5 минут, затем 10 минут;
- один waiter на actor;
- никаких `sleep`;
- никаких минутных hand-written polling loops;
- timeout не означает failure, пока actor `working`;
- stale on-screen progress не используется как source of truth;
- `HEAD` читается только после settled state;
- ожидание никогда не содержит условие «SHA должен измениться».

Candidate принимается в gate phase только когда одновременно:

```text
executor is settled
AND executor declared CANDIDATE
AND worktree is clean
AND HEAD is a full SHA
AND declared SHA equals HEAD
```

Если SHA совпадает с тем, который оркестратор видел до ожидания, это допустимо. Оркестратор не предполагает, что executor обязан сделать ещё один commit.

## 9. Полнота interactive reviewer verdict

Предыдущий лимит в 700 rendered lines не принимается: fixtures показывают, что Claude TUI начинает смешивать repaint fragments задолго до 1000 строк, а OpenCode TUI требует отдельного доказательства после tool use. Поэтому authoritative verdict должен укладываться в доказанно безопасный компактный диапазон.

### 9.1. Контракт compact verdict

Reviewer final response:

- не более 180 rendered lines;
- только verdict, actionable findings и residual risks;
- без raw logs;
- без полного test output;
- без хронологии исследования;
- каждый finding содержит evidence, impact и expected fix;
- если findings не помещаются, reviewer объединяет только findings с одной причиной, но не удаляет самостоятельные actionable defects.

180 строк выбраны с запасом относительно измеренного 250-line successful retrieval на Claude, Codex и OpenCode H2. Это ограничивает только финальный ответ: reviewer может читать большие материалы и выполнять длинные проверки внутри session.

### 9.2. Чтение

```text
herdr agent read <actor> --source recent-unwrapped --lines 400
```

Ожидается:

- последняя prompt boundary;
- законченный assistant response;
- нижняя idle/done input boundary;
- монотонный verdict без repaint duplicates или reordered fragments.

Если границы или continuity не доказаны, verdict — `UNKNOWN`.

Повторный turn формулируется как новая authoritative выдача, а не просьба повторить старый текст:

```text
The previous turn was not transport-complete. Re-evaluate the same frozen SHA and
produce a new authoritative verdict within 180 rendered lines. Include every
actionable defect, but omit investigation narration and raw output.
```

Если второй компактный turn также не читается полностью, route не несёт gate в этом run. Оркестратор не переходит на headless provider mode.

### 9.3. Upstream Herdr issue

Следует подготовить upstream issue:

**Title:** `Expose a complete logical last turn for interactive agent panes`

**Problem:** `agent read` возвращает rendered rows с cap, а alternate-screen и repaint могут дать дубликаты, пропуски или отсутствие scrollback. Видимая persistent session существует, но complete logical turn не всегда программно извлекается.

Предлагаемый контракт может быть любым Herdr-native API, если он обеспечивает:

- адресацию последнего logical user/assistant turn;
- `complete` либо `in_progress`;
- стабильную pagination или отсутствие row cap;
- корректность при repaint и alternate screen;
- отсутствие зависимости от provider-private transcripts;
- read-only поведение без изменения focus/seen;
- сохранение Unicode и порядка output.

Acceptance:

- Claude, Codex и OpenCode;
- tool calls перед final answer;
- ответы 200, 800 и более 1000 rendered rows;
- два последовательных turns;
- resize/repaint;
- background completion;
- incomplete turn никогда не выглядит complete.

Этот gap не блокирует компактные Claude/Codex verdict’ы, но блокирует обещание произвольной длины и полноценную поддержку OpenCode до закрытия fixtures.

## 10. Обнаружение моделей

Claude catalog переводится с optional ambient dependency на self-contained build по реально используемой схеме `brain-council`.

### 10.1. Source и build boundary

- `shared/scripts/mo-models.mjs` остаётся единственным authored source helper.
- В source используется статический import `@anthropic-ai/claude-agent-sdk`.
- SDK и `esbuild` добавляются как pinned development/build dependencies проекта.
- `tools/build-skills.mjs` запускает esbuild для этого entry point:
  - `bundle: true`;
  - `platform: "node"`;
  - `format: "esm"`;
  - target, соответствующий Node requirement meta-o;
  - Node built-ins external;
  - Claude SDK inlined;
  - shebang сохранён.
- Bundle строится во временную директорию.
- Один полученный `mo-models.mjs` копируется в built `mo-herdr` и `mo-omnigent`.
- В shipped skills нет `node_modules` и runtime dependency.
- `skills/` остаётся generated tree и вручную не редактируется.
- `node tools/build-skills.mjs --check` строит ожидаемый bundle во временной директории и только сравнивает bytes.

Новый helper не создаётся: shipped artifacts по-прежнему состоят из Markdown, `mo-models.mjs` и `mo-posture.sh`.

### 10.2. Claude SDK launch

Bundled SDK не должен искать собственный optional native Claude binary. Helper:

1. Разрешает executable `claude` из текущего `PATH`.
2. Передаёт его как `pathToClaudeCodeExecutable`.
3. Создаёт never-yield prompt generator, как в `brain-council`.
4. Вызывает `query(...).supportedModels()`.
5. Ограничивает handshake существующим timeout.
6. В `finally` вызывает `interrupt()` и `return()`.
7. Никогда не отправляет model turn.

Таким образом, bundle содержит SDK JavaScript, а subscription-backed system Claude CLI остаётся исполняемым provider surface.

`--catalog --route claude` больше не ищет SDK:

- в cwd;
- выше skill install;
- в global npm root;
- в случайном project `node_modules`.

Catalog может быть unavailable только из-за:

- отсутствующего Claude CLI;
- auth/trust failure;
- handshake timeout;
- несовместимости pinned SDK с установленным CLI;
- ошибки `supportedModels()`.

Существующие команды сохраняются:

```text
mo-models.mjs --show
mo-models.mjs --set <role>=<route>/<model>/<effort>
mo-models.mjs --catalog
mo-models.mjs --check-upgrades
```

`~/.meta-o/models.json` остаётся settings-only файлом.

## 11. Version control contract

Новый раздел добавляется byte-for-byte в `AGENTS.md` и `CLAUDE.md` meta-o и в шаблон/инструкции `mo-setup`.

Правила:

- не разрабатывать на `main`, `master`, `develop`, `default`;
- task branch: `feature/<short-slug>`;
- база: актуальный `develop`;
- использовать configured upstream ветки `develop`, не hardcoded `origin/develop`;
- если upstream настроен, сначала fetch и fast-forward;
- если upstream отсутствует, локальный `develop` является доступным repository authority;
- если `develop` отсутствует, policy не заменяется автоматическим стартом от `main`;
- каждый coherent independently verifiable increment коммитится отдельно;
- перед коммитом запускаются relevant checks;
- subject:
  ```text
  <type>: <what changed and why>
  ```
- type: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`;
- issue/spec reference добавляется, когда существует;
- каждый agent-authored commit заканчивается trailer после пустой строки:
  ```text
  Assisted-by: <executor-harness-model>
  ```

Финальный candidate — tip SHA всей последовательности коммитов. Формулировка «one clean candidate commit» заменяется на «one clean candidate tip identified by a full SHA».

Любой новый commit после gate:

- делает QC stale;
- делает оба review verdict stale;
- делает E2E stale;
- требует полного нового gate set.

## 12. Backlog и документация

### 12.1. Backlog

`docs/backlog.md` содержит только:

- deferred;
- blocked;
- deliberately not done;
- knowingly left unfixed.

Запрещены:

- `Closed`;
- `Done`;
- история исправленных пунктов;
- выполненные acceptance items;
- итоги feature run;
- changelog внутри backlog.

После исправления entry:

- удаляется целиком; либо
- сужается до фактически оставшейся незакрытой части.

История сделанного остаётся в Git.

### 12.2. Changelog

Новый `CHANGELOG.md` создаётся только когда:

- spec прямо требует его;
- проект уже использует changelog как часть release process;
- назван внешний consumer.

Сам факт изменения кода, выпуска candidate SHA или объединения README changelog не создаёт.

### 12.3. Proportional documentation

Новый документ допустим только если изменение:

- вводит долговременную архитектурную границу;
- делает существующий business/glossary/architecture/E2E источник ложным;
- требует нового operational contract;
- прямо запрошено;
- необходимо существующему external consumer.

Не являются причиной для отдельного документа:

- переименование файла;
- объединение нескольких README;
- локальный refactor;
- описание уже очевидного diff;
- отчёт о том, что feature run завершился;
- желание сохранить рассуждения actor’а.

`mo-setup` создаёт свой минимальный baseline только при явном запуске setup. Обычный `mo-herdr` run не запускает setup и не расширяет `docs/` самостоятельно.

## 13. Изменения по компонентам

| Компонент | Ответственность изменения |
|---|---|
| `shared/references/methodology.md` | Role firewall, executor-owned feasibility/QC, human attention, waiting, VCS, backlog/docs |
| `src/skills/mo-herdr/SKILL.md` | Видимый layout, persistent interactive actors, prompt delivery, bounded waiting |
| `src/skills/mo-herdr/references/herdr-mechanics.md` | Compact TUI retrieval, route support matrix, upstream gap; inline actor route удаляется |
| `src/skills/mo-review/SKILL.md` | Executor/reviewer dispute arbitration; orchestrator semantic decision удаляется |
| `src/skills/mo-setup/SKILL.md` | Version control и proportional documentation contract |
| `shared/scripts/mo-models.mjs` | Static bundled Claude SDK integration |
| `tools/build-skills.mjs` | Deterministic esbuild step и check-only comparison |
| `AGENTS.md`, `CLAUDE.md` | Byte-identical VCS/backlog/docs rules |
| `docs/business.md` | Новые пользовательские уточнения как business framing |
| `docs/architecture/skills-first.md` | Явная граница: orchestrator не читает task/code |
| `docs/backlog.md` | Только фактически открытые пункты |
| `docs/acceptance.md` | Criteria и доказательства новой границы |
| `docs/phase-0-fixtures.md` | Interactive layout/retrieval/model-discovery fixtures |
| `docs/e2e.md` | Только подтверждённый installed-skill run |

Новый architecture document не требуется: меняется уже существующая skills-first boundary.

## 14. Проверки

### 14.1. Deterministic

`make mo-qc` должен доказать:

- `AGENTS.md` и `CLAUDE.md` byte-identical;
- built skills byte-identical свежей временной сборке;
- обе copies `mo-models.mjs` byte-identical;
- bundled helper загружается из isolated directory без `node_modules`;
- bundle не содержит live import `@anthropic-ai/claude-agent-sdk`;
- Claude catalog route передаёт system executable;
- `--show` ничего не записывает;
- invalid `--set` ничего не сохраняет;
- methodology запрещает orchestrator читать spec, framing, diff и code;
- `mo-herdr` не использует headless provider commands для actors;
- `mo-review` не назначает оркестратору technical arbitration;
- backlog contract не допускает completed sections;
- changelog не является baseline artifact;
- Markdown проверяется существующим AST tooling, не hand-written regex parser.

Live catalog test не входит в deterministic `mo-qc`, потому что зависит от installed CLI и auth. Он остаётся manual/provider fixture.

### 14.2. Agent-required Herdr E2E

Installed `mo-herdr` должен доказать:

1. Orchestrator tab переименован либо зафиксирован точный missing Herdr capability.
2. Executor запущен справа в текущей вкладке.
3. Reviewers запущены рядом в отдельной вкладке.
4. Все actors — обычные interactive CLI sessions.
5. User может открыть любую session и написать в неё.
6. Review round 2 использует те же session names и panes.
7. Prompt начинает turn без ручного Enter.
8. Orchestrator не открывает spec, framing, diff или source.
9. Executor сам сообщает resolved business path и QC.
10. Оба reviewer verdict помещаются в 180 строк и читаются полностью.
11. Findings передаются executor’у без byte changes.
12. Settled executor с clean worktree обрабатывается без ожидания нового SHA.
13. Любой fix создаёт новый SHA и инвалидирует все gate’ы.
14. Два PASS, QC, smoke и E2E относятся к одному полному SHA.
15. Model catalog работает после установки skill в isolated location.

## 15. Trade-offs

- **Interactive sessions вместо inline/headless.** Это ограничивает безопасный размер verdict, но сохраняет визуальную наблюдаемость, user access и session cache — основные бизнес-требования.
- **180 строк вместо прежних 700.** Ограничение основано на измеренном безопасном диапазоне, а не на номинальном Herdr cap. Длинное исследование остаётся внутри session; компактным является только verdict.
- **OpenCode не объявляется поддержанным заранее.** Наличие agent kind недостаточно; сначала должны пройти TUI tool-use и continuity fixtures.
- **Жёсткий role firewall.** Дополнительные actor round-trips дешевле потери orchestrator context и скрытого превращения управляющего слоя в разработчика.
- **Reviewer arbitration вместо решения оркестратора.** Техническое решение принимают sessions, которые прочитали код и evidence.
- **Bundled SDK.** Shipped helper становится значительно больше, но установка получает воспроизводимый Claude catalog без ambient dependency.
- **System Claude binary плюс bundled SDK JavaScript.** Это повторяет доказанную boundary reference implementation и не пытается ship provider executable.
- **Нет state machine.** Git и native Herdr sessions остаются единственными durable sources.
- **Нет новых process docs.** Обновляются существующие источники истины.

## 16. Риски и mitigation

- **Reviewer не помещает findings в 180 строк.** Prompt требует убрать narration/raw logs и объединить только findings с одной root cause; если полноценный verdict всё равно не помещается, gate `UNKNOWN`, а не частичный PASS.
- **Claude repaint повреждает даже компактный turn.** Проверяются boundaries, порядок и отсутствие duplicates; при сомнении выполняется новый compact review turn.
- **OpenCode выглядит рабочим, но теряет tool-using answer.** Route не используется для gate до прохождения конкретной fixture.
- **Orchestrator снова начинает читать task “для удобства”.** Прямой запрет дублируется в canonical methodology, backend skill и deterministic contract tests.
- **Executor задаёт слишком много вопросов.** Initial goal требует conservative decision; ordinary technical prompt получает autonomy reminder, не user handoff.
- **Review loop становится бесконечным.** Evidence обязателен, taste не блокирует, disagreement ограничен second-reviewer arbitration и одним targeted fact-check.
- **Bundled SDK не находит executable.** `pathToClaudeCodeExecutable` всегда передаётся явно; отсутствие CLI даёт named catalog gap.
- **SDK/CLI несовместимы.** Version pin, isolated load test и отдельная live provider fixture.
- **VCS policy ломается в repository без develop.** Не подменять policy другой base branch; executor возвращает конкретный repository-policy blocker.
- **Tab rename отсутствует.** Подготовить узкий Herdr issue; не вводить терминальные escape hacks.
- **Старые sessions ошибочно переиспользованы.** Проверять live actor name, pane ID, cwd, kind и settled state перед каждым prompt.
- **Лишняя документация возвращается через reviewer lens.** Reviewer проверяет proportionality: отсутствие нового документа не является finding без конкретно изменившегося durable knowledge.

## 17. Принятые предположения

- Новые уточнения пользователя имеют приоритет над старым `my-opinion.md`, где оркестратору ещё разрешалось читать spec и разрешать технические споры.
- Version control section применяется к meta-o и к проектам, подготовленным через `mo-setup`.
- `develop` обязателен как base branch; remote name не предполагается.
- 180-line verdict — стартовый поддерживаемый предел, основанный на текущих fixtures; он может быть повышен только после нового измерения.
- Codex и Claude являются начальными interactive review routes; OpenCode требует дополнительного доказательства.
- Bundling повторяет `brain-council`: SDK JavaScript inlined, provider CLI берётся из system installation.
- Upstream issue здесь только проектируется; внешняя публикация требует отдельного явного действия.
- Выполненные backlog entries удаляются, а не архивируются.
- `CHANGELOG.md` не является стандартным Meta-O artifact.
- Никакой новый durable orchestration state не создаётся.

## 18. Декомпозиция реализации

1. **Role boundary:** methodology, skills-first architecture и acceptance.
2. **Executor autonomy:** readiness, feasibility, QC ownership и human-attention contract.
3. **Herdr topology:** tab naming, executor split, reviewer tab и persistent sessions.
4. **Transport:** atomic prompt+Enter, bounded waits и restart recovery.
5. **Review protocol:** compact verdict, verbatim relay и reviewer arbitration.
6. **Model discovery:** bundled Claude SDK с explicit system CLI path.
7. **Project contract:** VCS, backlog-only-unfinished, no unsolicited changelog/docs.
8. **Verification:** deterministic tests, interactive Herdr fixtures и подготовленный upstream issue.