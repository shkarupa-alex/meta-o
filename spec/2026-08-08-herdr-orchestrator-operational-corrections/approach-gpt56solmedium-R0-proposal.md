## 1. Высокоуровневый подход

`mo-herdr` должен стать действительно тонким процессным оркестратором: он создаёт видимые долгоживущие CLI-сессии, маршрутизирует сообщения без смысловой обработки, следит за состояниями и валидностью gate’ов по SHA, но не читает спеку, business framing или код. Исполнитель получает полную ответственность за понимание задачи, feasibility, реализацию и разбор замечаний; два ревьюера работают в отдельных видимых панелях и сохраняют свои интерактивные сессии между раундами.

Новых daemon, state store, adapter layer или orchestration CLI не требуется. Всё реализуется изменениями Markdown-скиллов, существующего `mo-models.mjs`, build-процесса и проверок.

## 2. Целевая архитектура

### 2.1. Граница ответственности оркестратора

Общую роль следует зафиксировать в [shared/references/methodology.md](/Users/alex/Develop/meta-o/shared/references/methodology.md) и усилить в [docs/architecture/skills-first.md](/Users/alex/Develop/meta-o/docs/architecture/skills-first.md).

Оркестратор может:

- определить repository root, текущую ветку, чистоту worktree и полный `HEAD`;
- определить пути к spec/task и business framing, не открывая их содержимое;
- создать нужную Herdr-топологию;
- запустить обычные интерактивные Claude/Codex/OpenCode CLI;
- отправлять атомарные prompts;
- ждать изменения состояния;
- читать статусные ответы акторов и полные reviewer verdicts;
- копировать ответы между акторами дословно;
- сопоставлять SHA, к которому относятся QC, review и E2E;
- инвалидировать все gate’ы после появления нового SHA;
- классифицировать инфраструктурные состояния: working, settled, provider failure, subscription limit, credentials, missing transport;
- завершить процесс одним полным SHA либо `needs_attention`.

Оркестратор не может:

- открывать или пересказывать spec/task;
- открывать business framing;
- читать исходники, diff или тесты;
- проверять feasibility;
- запускать самостоятельный анализ требований;
- оценивать, прав ли reviewer;
- фильтровать, ранжировать, объединять или переписывать findings;
- принимать архитектурные или технические решения за исполнителя;
- создавать документацию, changelog или backlog-записи от имени реализации;
- задавать человеку обычные технические вопросы либо выдавать меню вариантов.

Это намеренно жёстче текущей формулировки methodology, которая разрешает оркестратору читать спеку и технически разрешать споры. Более позднее уточнение пользователя должно заменить эти положения.

### 2.2. Исполнитель

Исполнитель — единственная реализационная роль. Он:

- читает spec/task и business framing полностью;
- проверяет возможность выполнения;
- исследует repository и зависимости;
- делает консервативные технические предположения и фиксирует только те из них, которые действительно становятся долговременным знанием;
- реализует полный scope;
- запускает QC и deterministic smoke;
- создаёт последовательность небольших проверяемых коммитов;
- разбирает каждый reviewer finding;
- исправляет finding либо передаёт reviewer’у доказательный rebuttal;
- сообщает оркестратору только процессный результат: кандидат, продолжение работы или настоящий blocker.

Обычный технический вопрос не должен уходить пользователю. Стартовый prompt прямо возлагает такие решения на исполнителя:

```text
Resolve ordinary technical choices yourself from the specification, project
contract, code, tests, and reviewer evidence. Make the most conservative
implementation-ready assumption, record it only where it becomes durable project
knowledge, and continue. Report NEEDS_ATTENTION only for product meaning,
irreversible actions, credentials/access, subscription changes, or a genuinely
unresolvable dispute.
```

### 2.3. Ревьюеры

`mo-review` остаётся владельцем review lenses, формата verdict и convergence, но не запускает акторов.

Каждый reviewer:

- получает путь к spec и business framing;
- получает полный frozen SHA;
- самостоятельно читает задачу и код;
- не видит первый verdict другого reviewer’а;
- возвращает один компактный законченный verdict;
- остаётся в той же интерактивной сессии для повторных раундов и споров.

Оркестратор не объединяет два verdict’а. Он последовательно передаёт исполнителю два целых блока с явными транспортными заголовками:

```text
REVIEWER A — VERBATIM
<unchanged reviewer output>

REVIEWER B — VERBATIM
<unchanged reviewer output>
```

Заголовок добавляет адресацию, но содержимое verdict не изменяет.

### 2.4. Разрешение споров

Текущий шаг «оркестратор принимает техническое решение» нужно удалить из `mo-review`.

Новый протокол:

1. Исполнитель отвечает на finding исправлением или доказательным rebuttal.
2. Оркестратор дословно передаёт rebuttal исходному reviewer’у.
3. Исходный reviewer подтверждает закрытие либо повторяет finding с доказательствами.
4. При несогласии второй reviewer получает finding и обе позиции и выносит независимый технический verdict.
5. Если reviewers сходятся, исполнитель следует их verdict либо предъявляет новый проверяемый факт.
6. Если после одного targeted fact-check консенсуса нет, actors должны явно классифицировать спор:
   - продуктовый или за пределами спецификации — `NEEDS_ATTENTION`;
   - технически проверяемый — дополнительная проверка в reviewer-сессии;
   - вкусовой, без доказанного влияния — не блокирует.
7. Оркестратор только маршрутизирует эти ответы.

Таким образом, техническая оценка остаётся у ролей, которые прочитали код, а не загрязняет управляющий контекст.

## 3. Herdr-топология

### 3.1. Раскладка

После запуска orchestration skill:

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

Конкретные действия:

1. Получить current pane/tab/workspace из Herdr caller context.
2. Переименовать текущую вкладку в `<slug>-orchestrator`.
3. Разделить текущую панель направо через `pane split --direction right --cwd "$PWD" --no-focus`.
4. Запустить executor через `herdr agent start`.
5. Перед первым review создать вкладку `<slug>-review`.
6. Использовать её root pane для reviewer A.
7. Разделить root pane направо и запустить reviewer B.
8. Не менять пользовательский focus автоматически.
9. Не закрывать созданные panes после каждого раунда; они живут до завершения feature run.

`<slug>` — короткий ASCII slug, нормализованный до ограничения имени Herdr. Имена акторов остаются существующими: `<slug>-exec`, `<slug>-review-a`, `<slug>-review-b`, `<slug>-e2e`.

### 3.2. Только обычные интерактивные CLI

Executor и reviewers запускаются исключительно через:

```text
herdr agent start <name> --kind <kind> --pane <pane-id> -- <native args>
```

Запрещаются для этих ролей:

- `codex exec`;
- `claude -p`;
- `opencode run`;
- provider SDK sessions;
- shell-launched headless reviewer processes;
- hidden subagents;
- provider-private transcripts.

`pane run` остаётся допустимым только для обычной команды вроде теста или сервера, не для запуска реализации или review.

Это сохраняет:

- видимость в Herdr;
- пользовательский доступ к сессии;
- provider subscription route;
- повторное использование cache/context;
- адресуемую интерактивную session continuity.

### 3.3. Надёжная отправка Enter

Любой нормальный actor prompt отправляется только через:

```text
herdr agent prompt <actor> <text> [--wait --timeout <ms>]
```

Эта операция атомарно отправляет текст и Enter. Использование сырого `send-keys`, shell interpolation или раздельных «текст, затем Enter» для обычных prompts следует запретить в `mo-herdr`.

После отправки Herdr должен увидеть переход lifecycle в течение пяти секунд. `agent_prompt_stalled` означает недоставленный prompt; оркестратор читает состояние и повторяет именно отправку, а не начинает ждать несуществующий turn.

Если для редкого provider-specific UI действительно нужны raw keys, контракт требует:

1. отправить управляющие keys;
2. отдельно отправить `enter`;
3. проверить lifecycle transition;
4. не считать ввод доставленным без перехода состояния.

Это устраняет наблюдавшуюся потерю Enter без нового механизма в проекте.

## 4. Стартовые goal-контракты

### 4.1. Prompt для запуска самого оркестратора

В `mo-herdr` следует добавить короткую рекомендацию, которую skill показывает один раз, не останавливая работу:

```text
For future unattended runs, start the orchestrator with:

/goal Use mo-herdr to drive <SPEC_PATH> to one verified full Git SHA. Manage the
visible persistent executor and reviewer sessions yourself; do not read the spec
or code, do not assess findings, and interrupt me only for a real
NEEDS_ATTENTION condition.
```

Если текущий запуск был обычным prompt, оркестратор всё равно продолжает. Это совет для последующих запусков, не вопрос и не approval gate.

### 4.2. Goal исполнителя

Оркестратор не читает spec, а передаёт путь:

```text
/goal Read the complete task at <SPEC_PATH>, the business framing at
<BUSINESS_PATH>, and the project instructions. First verify the task is
implementable, then implement its full scope. Resolve ordinary technical choices
yourself, keep the task and framing read-only, create coherent verified commits,
and continue until the worktree is clean and the tip commit passes project-owned
QC and deterministic smoke, or report a real NEEDS_ATTENTION blocker.
```

Проверка feasibility происходит внутри той же goal-сессии исполнителя. Отдельный оркестраторский preflight по содержанию документов удаляется.

Для route без native `/goal` используется тот же completion-oriented текст как обычный initial prompt. Никакой самодельный goal state не создаётся.

## 5. Ожидание акторов

Нужен простой event-oriented цикл без ожидания производных предположений.

### Алгоритм

```text
waitActor(actor):
    call herdr agent wait actor --timeout 600000

    if settled:
        read actor state and last complete response
        process its declared state

    if timeout and actor is working:
        repeat one bounded 600000 ms wait

    if timeout and actor is not working:
        read response immediately; do not wait for another SHA

    if blocked:
        read the question/blocker
        route it according to the attention policy

    if unknown:
        inspect recent output once
        retry the wait or declare transport unknown
```

Допустимый интервал — 5–10 минут; базовое значение — 10 минут для implementation/review turns и 5 минут после provider retry. Нельзя использовать:

- `sleep`;
- минутный polling loop;
- условие «HEAD должен стать отличным от ожидаемого старого SHA»;
- предположение по устаревшему progress text;
- параллельные waiters одного actor’а.

Условие готовности исполнителя:

```text
actor state is settled
AND executor declared CANDIDATE
AND git worktree is clean
AND HEAD resolves to a full SHA
```

Текущий SHA читается после пробуждения. Он никогда не включается в условие ожидания как ожидаемое будущее значение.

## 6. Контракты сообщений и эфемерная модель состояния

Новый persisted data model не нужен. Ниже — только концептуальные значения в reasoning-контексте оркестратора.

```ts
type ActorRole = "executor" | "reviewer-a" | "reviewer-b" | "e2e";

type ActorRef = {
  name: string;
  paneId: string;
  tabId: string;
  role: ActorRole;
  vendor: "anthropic" | "openai" | "other";
};

type Candidate = {
  sha: string;          // exactly 40 lowercase hex characters
  worktreeClean: true;
};

type GateVerdict = "pass" | "fail" | "unknown" | "stale";

type GateSet = {
  sha: string;
  qc: GateVerdict;
  smoke: GateVerdict;
  reviewerA: GateVerdict;
  reviewerB: GateVerdict;
  e2e: GateVerdict | "not-applicable";
};
```

Эти объекты:

- не сериализуются;
- не пишутся в repository или home directory;
- восстанавливаются из Git и живых Herdr sessions;
- полностью инвалидируются при `HEAD !== gateSet.sha`.

### Actor output boundary

Исполнитель завершает turn одним из заголовков:

```text
CONTINUE
CANDIDATE: <full SHA>
NEEDS_ATTENTION: <allowed blocker>
```

Reviewer завершает существующим Markdown-контрактом:

```text
## Verdict
PASS | FAIL | UNKNOWN
```

Оркестратор распознаёт только эти процессные маркеры. Текст под ними не интерпретируется технически.

### Ошибки

- `HERDR_ENV` отсутствует: `needs_attention`, никаких Herdr-команд.
- Не удалось создать layout или start actor: повторить один раз после чтения native error; затем `needs_attention`.
- `agent_prompt_stalled`: prompt не считается доставленным; проверить actor и повторить.
- Actor остаётся `working` после timeout: продолжить bounded wait.
- Ответ reviewer не помещается или его границы не доказаны: verdict `unknown`, повторить review в той же session с требованием компактного нового verdict.
- Reviewer route недоступен: сохранить доступные сессии; cross-vendor gate остаётся `unknown`.
- Worktree dirty при заявленном candidate: вернуть исполнителю факт без анализа.
- Появился новый SHA: все gate’ы `stale`.
- Provider transient error: повтор в той же session через 5 минут, затем 10 минут.
- Credentials, subscription change или долгий limit: `needs_attention` либо отдельно согласованный watchdog.

## 7. Полнота reviewer output и Herdr gap

Reviewer prompt должен требовать компактный конечный ответ:

- не более 700 rendered lines;
- только verdict, actionable findings и residual risks;
- raw logs и длинные test outputs не копировать;
- доказательства обозначать точными путями/командами, а не вставлять весь вывод.

Чтение выполняется через:

```text
herdr agent read <actor> --source recent-unwrapped --lines 1000
```

Нужны верхняя prompt boundary, нижняя settled boundary и непрерывный ответ между ними. Если они не доказаны, это `UNKNOWN`.

Повтор — не просьба «повтори прежний ответ дословно». Reviewer получает новый turn:

```text
Your previous transport was not completely readable. Produce a new authoritative
verdict for the same SHA, limited to 700 rendered lines. Preserve every actionable
finding, but omit raw logs.
```

### Genuine upstream Herdr issue

Следует создать upstream issue:

**Title:** `Expose complete logical last turn for interactive agent panes`

**Problem:** `agent read` ограничен 1000 rendered rows, не имеет range/cursor API, а alternate-screen/repaint у интерактивных Claude/OpenCode sessions может не попадать в нормальный scrollback. Из-за этого видимая и сохранённая интерактивная session существует, но управляющий агент не всегда может доказать полноту её последнего turn.

**Required contract:**

```text
herdr agent read-turn <agent> --turn last --format text
```

либо эквивалентное расширение `agent read` со следующими свойствами:

- адресация одного логического user/assistant turn;
- стабильная пагинация или отсутствие row cap;
- одинаковая семантика для normal и alternate screen;
- признак complete/in-progress;
- отсутствие зависимости от provider-private transcripts;
- чтение не меняет seen/focus state;
- Unicode и repaint не создают дубликатов или пропусков.

**Acceptance:**

- Claude, Codex и OpenCode;
- ответ более 1000 rendered rows;
- tool calls перед final answer;
- resize и repaint;
- два последовательных turns;
- complete turn доступен после background completion;
- незавершённый turn никогда не выглядит complete.

Это реальный Herdr gap. Раскладка, persistent panes, atomic prompt+Enter и bounded wait уже доступны и upstream issue не требуют. Возможность tab rename нужно проверить на целевой установленной версии; issue создаётся только если `herdr tab` действительно не предоставляет rename/title operation.

## 8. Обнаружение моделей

Текущая optional-peer схема для Claude должна быть заменена self-contained bundle по образцу `brain-council`.

### Build design

- Добавить pinned `@anthropic-ai/claude-agent-sdk` в build dependencies.
- Добавить `esbuild` в dev dependencies.
- Оставить один authored source owner для helper под `shared/scripts/`.
- `tools/build-skills.mjs` собирает source helper в один ESM `.mjs` с:
  - `platform: "node"`;
  - `format: "esm"`;
  - bundled Claude SDK;
  - external только для Node built-ins;
  - сохранённым shebang.
- Полученный dependency-free `mo-models.mjs` механически копируется в `mo-herdr` и `mo-omnigent`.
- `skills/` по-прежнему не редактируется вручную.
- `mo-qc --check` строит bundle во временной директории и byte-сравнивает его с committed `skills/`; gate ничего не переписывает.

`--catalog --route claude` больше не ищет SDK в текущем project или global npm root. Он использует bundled `query(...).supportedModels()`.

Каталог может быть unavailable только из-за реальной runtime-проблемы:

- Claude CLI отсутствует;
- auth/trust не готовы;
- handshake timeout;
- SDK/CLI compatibility error.

Отсутствие случайного `node_modules` больше не является штатным результатом.

Следует сохранить:

```text
node mo-models.mjs --show
node mo-models.mjs --set executor=...
node mo-models.mjs --catalog
node mo-models.mjs --check-upgrades
```

и существующий settings-only файл `~/.meta-o/models.json`. Никакого нового model service или registry не вводится.

## 9. Version control и документационная дисциплина

### Project contract

Предложенный пользователем раздел добавляется в генерируемый `AGENTS.md`/`CLAUDE.md` и в собственные byte-identical файлы meta-o.

Практическая трактовка:

- запрещена разработка на `main`, `master`, `develop`, `default`;
- task branch: `feature/<short-slug>`;
- база: актуальный `origin/develop`;
- если `origin/develop` отсутствует или обновление невозможно, это blocker политики, а не повод тихо стартовать от другой ветки;
- каждый логически цельный и самостоятельно проверяемый increment коммитится отдельно;
- формат subject: `<type>: <what changed and why>`;
- разрешённые type: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`;
- каждый agent-authored commit заканчивается trailer:

```text
Assisted-by: <executor-harness-model>
```

- финальный candidate — tip SHA всей последовательности, а не требование squash в один commit;
- любой новый commit инвалидирует QC, reviews и E2E предыдущего SHA.

Формулировку methodology «produce one clean candidate commit» следует заменить на «produce a clean candidate tip commit after coherent verified increments».

### Backlog

`docs/backlog.md` содержит только:

- deferred;
- blocked;
- deliberately not done;
- knowingly left unfixed.

Запрещаются:

- `Closed`;
- `Done`;
- история исправленных пунктов;
- перенос выполненного из changelog;
- описание результатов feature run.

После исправления backlog entry удаляется в том же изменении либо сужается до реально оставшегося хвоста. Историей выполненного остаётся Git.

### Changelog и лишняя документация

Executor не создаёт `CHANGELOG.md`, если одновременно не выполнено одно из условий:

- файл уже является частью release process;
- spec прямо требует его;
- назван внешний consumer, которому нужен changelog.

Удаление или объединение четырёх README не создаёт отдельного architecture document само по себе. Новая документация допустима только когда изменение:

- делает существующее durable knowledge ложным;
- вводит новую долговременную архитектурную границу;
- меняет business framing или glossary;
- требуется acceptance/E2E контрактом;
- прямо запрошено пользователем.

`mo-setup` может создать свой минимальный baseline только при явном запуске setup; обычный feature run не вызывает его и не расширяет `docs/` автоматически.

## 10. Изменения по компонентам

| Компонент | Изменение |
|---|---|
| `shared/references/methodology.md` | Запрет чтения spec/code оркестратором; executor-owned feasibility; новая dispute flow; waiting; VCS; backlog/docs rules |
| `src/skills/mo-herdr/SKILL.md` | Видимая topology, tab naming, interactive-only actors, atomic prompt, bounded waits, compact retrieval |
| `src/skills/mo-herdr/references/herdr-mechanics.md` | Удалить inline reviewer как default; описать interactive retrieval и upstream gap |
| `src/skills/mo-review/SKILL.md` | Убрать технический verdict оркестратора; закрепить reviewer/executor dispute protocol |
| `src/skills/mo-setup/SKILL.md` | Добавить Version control и запрет лишней документации/changelog |
| `shared/scripts/mo-models.*` | Статический bundled Claude SDK вместо optional resolution |
| `tools/build-skills.mjs` | Детерминированная esbuild-сборка helper |
| `AGENTS.md`, `CLAUDE.md` | Byte-identical Version control и документационные правила |
| `docs/business.md` | Добавить данные уточнения пользователя как новое business framing |
| `docs/architecture/skills-first.md` | Уточнить, что orchestration reasoning не включает чтение spec/code |
| `docs/backlog.md` | Удалить выполненное; оставить только реальные открытые хвосты |
| `docs/acceptance.md`, `docs/e2e.md`, fixtures | Зафиксировать новые доказательства без нового вида документа |

## 11. Проверки

### Deterministic

Добавить проверки, что:

- built `mo-models.mjs` работает без `node_modules` рядом;
- bundled helper содержит Claude route и не выполняет runtime module search;
- `--show` ничего не пишет;
- invalid `--set` ничего не сохраняет;
- authored helper собирается byte-identically;
- обе backend copies идентичны;
- `AGENTS.md` и `CLAUDE.md` byte-identical;
- methodology запрещает orchestrator spec/code inspection;
- Herdr skill не содержит `claude -p`, `codex exec` или `opencode run` как actor route;
- backlog contract не разрешает completed sections;
- Markdown contracts проверяются через существующий AST parser, не regex-парсером.

Итоговый gate: `make mo-qc`.

### Agent-required Herdr E2E

Один установленный `mo-herdr` должен доказать:

1. текущая вкладка переименована;
2. executor виден справа от orchestrator;
3. reviewers видны в отдельной вкладке, рядом;
4. все три — обычные интерактивные CLI sessions;
5. повторный review идёт в те же reviewer sessions;
6. prompt без ручного Enter начинает turn;
7. orchestrator ни разу не открывает spec, diff или source;
8. reviewer findings доходят executor’у byte-for-byte;
9. settled executor с clean worktree будит orchestrator без ожидания нового SHA;
10. два PASS и E2E относятся к одному полному SHA.

## 12. Trade-offs и отклонённые варианты

- **Выбраны интерактивные Herdr sessions вместо headless provider commands.** Это немного усложняет доказательство полноты turn, но возвращает главные бизнес-свойства: видимость, доступ пользователя и дешёвое продолжение прогретой session.
- **Выбран жёсткий role firewall вместо “оркестратор может быстро посмотреть”.** Иногда дополнительная actor round-trip дороже, но предотвращает превращение оркестратора в исполнителя и сохраняет его контекст.
- **Выбрано разрешение споров reviewers+executor вместо semantic arbitration оркестратором.** Решение принимают роли, которые реально прочитали материалы.
- **Выбран bundled SDK вместо optional peer lookup.** Репозиторий и shipped helper становятся больше, зато model discovery воспроизводим после обычной установки.
- **Не вводится автомат состояний.** Native Herdr sessions и Git остаются единственными durable sources; это сохраняет skills-first architecture.
- **Не создаётся дополнительная документация процесса.** Изменяются только существующие источники истины и acceptance evidence.

## 13. Риски и смягчение

- **Interactive TUI не отдаёт полный verdict.** Ограничить authoritative verdict 700 строками, повторять как новый компактный turn, fail closed в `UNKNOWN`, открыть upstream issue.
- **Role boundary снова размоется.** Закрепить прямые запреты в canonical methodology и проверить их contract tests.
- **Executor начнёт эскалировать обычные решения.** Completion prompt обязывает принимать консервативные решения; оркестратор возвращает autonomy reminder, а не переносит вопрос человеку.
- **Review loop зациклится.** Reviewer должен предъявлять evidence и impact; вкусовой finding без влияния не блокирует; технический спор проходит один targeted fact-check.
- **Bundled SDK перестанет соответствовать Claude CLI.** Pin версии, добавить live catalog fixture и обновлять bundle только вместе с compatibility test.
- **Commit policy конфликтует с repository без `develop`.** Не изобретать fallback на `main`; сообщать конкретный policy blocker.
- **Tab rename отсутствует в установленном Herdr.** Остальной layout всё равно запускается; отсутствие подтверждается через native help и оформляется отдельным узким upstream issue.
- **Старые sessions будут ошибочно переиспользованы.** Адресовать actors по уникальному name из live Herdr JSON и сверять cwd/role перед prompt.

## 14. Предположения и открытые вопросы

Приняты следующие консервативные предположения:

- Новые уточнения о том, что оркестратор не читает spec и код, имеют приоритет над более старым текстом `my-opinion.md`, где ему ещё разрешалось технически разрешать споры.
- Требование Version control относится и к контракту meta-o, и к проектам, подготовленным через `mo-setup`.
- `origin/develop` является обязательной базой; отсутствие этой ветки не даёт права автоматически выбрать другую.
- Ограничения в 700 строк для reviewer verdict достаточно, поскольку пользователь считает Herdr window в 1000 строк практически достаточным.
- Текущая Herdr version предоставляет создание вкладки и split; наличие rename проверяется при реализации через установленный CLI.
- Upstream issue создаётся только текстом отдельной задачи и затем публикуется по явному запросу; данный design не авторизует внешнюю запись.
- Выполненные backlog entries удаляются, а не перемещаются в закрытый раздел.
- `CHANGELOG.md` не является обязательным артефактом Meta-O.

Предложение готово к декомпозиции на семь независимых increments: role boundary, Herdr layout/session transport, review dispute flow, waiting/retrieval, bundled model discovery, project/VCS contract и verification/upstream issue.