## 1. Высокоуровневый подход

`mo-herdr` должен быть тонким процессным оркестратором: создавать видимые долгоживущие CLI-сессии, доставлять сообщения, ждать lifecycle-события и связывать gate’ы с текущим Git commit, но не читать spec, business framing, diff или код и не оценивать технические замечания. Исполнитель владеет feasibility, реализацией, QC и разбором findings; два независимых reviewer’а работают в обычных интерактивных Herdr-панелях и сохраняют контекст между раундами.

Новые daemon, state store, adapter layer, orchestration CLI, manifest, receipt или baseline не вводятся. Изменения ограничиваются существующими skills, `mo-models.mjs`, build-процессом и существующими knowledge/acceptance файлами.

## 2. Архитектура и ответственности

### 2.1. Оркестратор

Граница роли фиксируется в:

- `shared/references/methodology.md`;
- `src/skills/mo-herdr/SKILL.md`;
- `docs/architecture/skills-first.md`.

Оркестратор может:

- определить repository root и Git metadata;
- принять путь к task/spec, не открывая файл;
- передать executor’у поиск очевидного tracked task/spec, если путь не дан;
- создать Herdr tabs и panes;
- запустить обычные интерактивные provider CLI;
- отправлять prompts через атомарную Herdr-операцию text+Enter;
- ждать lifecycle-состояния конкретного actor’а;
- читать краткие процессные ответы и полный reviewer verdict;
- копировать actor output между sessions без смысловой обработки;
- проверить чистоту worktree и получить полный `HEAD`;
- связать QC, reviews и E2E с одним commit;
- инвалидировать все gate’ы после изменения `HEAD`;
- классифицировать транспортные и инфраструктурные состояния;
- завершить workflow одним verified commit ID либо настоящим `needs_attention`.

Оркестратор не может:

- открывать или пересказывать task/spec;
- открывать business framing;
- читать source, diff, tests, Makefile или package/build configuration;
- самостоятельно определять feasibility или QC;
- оценивать правильность реализации;
- проверять findings по коду;
- фильтровать, ранжировать, объединять или переформулировать findings;
- принимать техническое или архитектурное решение за actor’ов;
- создавать реализационную документацию, changelog или backlog-записи;
- предлагать пользователю меню обычных технических вариантов.

Если business framing разбит на `docs/business/index.md` и feature files, оркестратор не открывает index. Executor получает корень `docs/business/`, сам находит относящийся к задаче framing и сообщает точный путь для reviewer prompts.

### 2.2. Исполнитель

Исполнитель — единственная реализационная роль. Он:

1. Находит и полностью читает task/spec.
2. Находит и полностью читает связанный business framing.
3. Проверяет feasibility и полноту входов.
4. Изучает project contract, source, tests, Makefile и package scripts.
5. Создаёт или проверяет task branch.
6. Принимает обычные технические решения самостоятельно.
7. Реализует весь scope, а не MVP.
8. Запускает project-owned QC и deterministic smoke.
9. Коммитит каждый цельный, самостоятельно проверяемый increment.
10. Проверяет каждый reviewer finding.
11. Исправляет finding либо готовит доказательный rebuttal.
12. Обновляет только действительно изменившееся durable knowledge.
13. Сообщает оркестратору candidate или допустимый blocker.

Initial goal прямо устанавливает автономность:

```text
Resolve ordinary technical choices yourself from the specification, project
contract, repository evidence, tests, and reviewer feedback. Make the most
conservative implementation-ready assumption and continue. Record it only if it
becomes durable project knowledge. Do not ask the user to choose between ordinary
technical alternatives.
```

Отсутствие очевидного решения, сложность работы или желание получить подтверждение не являются blocker’ом.

### 2.3. Ревьюеры

`mo-review` владеет:

- review lenses;
- verdict format;
- independence;
- dispute protocol;
- convergence rules.

`mo-herdr` владеет:

- sessions;
- layout;
- prompts;
- waiting;
- complete-turn retrieval;
- verbatim transport.

Каждый reviewer:

- получает frozen commit ID;
- получает путь к task/spec;
- получает точный business framing path, найденный executor’ом;
- самостоятельно читает требования и repository;
- не видит первый verdict другого reviewer’а;
- возвращает компактный самостоятельный verdict;
- остаётся в той же interactive session для следующих раундов;
- проверяет каждый новый candidate заново.

Reviewer A и B запускаются независимо и могут работать одновременно. Физическое соседство панелей не даёт им доступ к output друг друга.

Оркестратор передаёт findings executor’у так:

```text
REVIEWER A — VERBATIM
<complete output without edits>

REVIEWER B — VERBATIM
<complete output without edits>
```

Добавленные заголовки идентифицируют источник. Текст verdict’ов не сокращается и не переставляется.

## 3. Review disputes

Текущий шаг `mo-review`, где техническое решение принимает оркестратор, удаляется.

Новый flow:

1. Executor получает оба полных verdict’а.
2. Для каждого finding executor:
   - исправляет проблему; либо
   - готовит rebuttal с конкретным evidence.
3. Оркестратор дословно передаёт rebuttal исходному reviewer’у.
4. Reviewer подтверждает закрытие либо повторяет finding с новым evidence.
5. При disagreement второй reviewer получает дословно:
   - finding;
   - rebuttal executor’а;
   - повторный ответ первого reviewer’а.
6. Второй reviewer выносит targeted verdict.
7. Если reviewer’ы сходятся, executor следует verdict либо предъявляет новый проверяемый факт.
8. После нового факта выполняется один targeted fact-check.
9. Если спор остаётся, actor классифицирует его:
   - `product` — требуется решение пользователя;
   - `fact-checkable` — выполняется дополнительная проверка;
   - `taste-only` — не блокирует без доказанного impact;
   - `unresolvable` — `needs_attention`.

Оркестратор не классифицирует спор по содержанию и не читает evidence в repository. Он маршрутизирует actor-declared classification.

## 4. Herdr layout

### 4.1. Целевая раскладка

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
2. Прочитать установленный `herdr --help` и relevant `tab`, `pane`, `agent` help.
3. Получить current workspace/tab/pane из caller context.
4. Переименовать текущую вкладку в `<slug>-orchestrator`.
5. Разделить current pane направо:
   ```text
   herdr pane split --current --direction right --cwd "$PWD" --no-focus
   ```
6. Запустить executor в новой панели.
7. Перед первым review создать вкладку `<slug>-review`.
8. Запустить reviewer A в её root pane.
9. Разделить root pane направо.
10. Запустить reviewer B во второй панели.
11. Не закрывать и не пересоздавать sessions между раундами.
12. Не менять пользовательский focus автоматически.

`<slug>` — короткий ASCII slug, совместимый с Herdr actor-name constraints. Все IDs читаются из Herdr JSON.

Если установленный Herdr не предоставляет tab rename/title operation:

- layout всё равно создаётся;
- shell escape sequence не используется;
- workspace не переименовывается вместо tab;
- готовится отдельный upstream issue о tab rename.

### 4.2. Только обычные interactive CLI sessions

Executor и reviewers запускаются только через:

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
- новая session на каждый review round.

`pane run` допустим для обычных команд — теста, server process, build или deterministic smoke — но не как способ запуска executor/reviewer.

Начальная support matrix:

- Codex interactive review route — supported в пределах измеренного compact output;
- Claude interactive review route — supported для compact output, но не для длинных repaint-heavy turns;
- OpenCode interactive review route — `unknown/unsupported` до прохождения tool-use, complete-turn и continuity fixtures.

Наличие provider kind в Herdr не считается доказательством пригодности для gate.

## 5. Prompt delivery и Enter

Все нормальные actor messages отправляются через:

```text
herdr agent prompt <actor> "<prompt>" --wait --timeout <ms>
```

Эта операция атомарно отправляет текст и Enter и проверяет lifecycle transition.

Для рабочих prompts запрещены:

- raw terminal write;
- раздельная отправка текста и Enter;
- prompt interpolation в shell command;
- `send-keys` вместо `agent prompt`;
- отдельный waiter после `agent_prompt_stalled`, пока состояние не проверено.

Обработка `agent_prompt_stalled`:

1. Выполнить `herdr agent get <actor>`.
2. Если actor уже `working`, не дублировать prompt — ждать текущий turn.
3. Если actor settled и prompt не виден в recent output, повторить `agent prompt` один раз.
4. После второго stall вернуть transport `needs_attention`.

`send-keys` используется только для provider-specific UI controls вроде `esc` или `ctrl+c`. Если UI-действие требует Enter, отправляется logical key `enter`, затем проверяется lifecycle state.

## 6. Startup goals

### 6.1. Goal оркестратора

Рекомендуемый короткий запуск:

```text
/goal Use mo-herdr to drive <SPEC_PATH> to one verified full Git commit ID.
Manage the visible persistent executor and reviewer sessions yourself. Do not
read the specification, business framing, diff, or code; do not assess findings.
Interrupt me only for a real NEEDS_ATTENTION condition.
```

Если skill вызван обычным prompt, он один раз показывает эту рекомендацию для будущих unattended runs и продолжает текущий run. Подтверждение не запрашивается.

### 6.2. Goal исполнителя

```text
/goal Locate and read the complete task at <SPEC_PATH>, its recorded business
framing, and the project instructions. Verify feasibility, then implement the full
scope. Resolve ordinary technical choices yourself. Keep the task and framing
read-only, commit coherent independently verifiable increments, and continue until
the worktree is clean and the tip commit passes project-owned QC and deterministic
smoke, or report a real NEEDS_ATTENTION blocker.
```

При split business framing:

```text
Business framing is under <BUSINESS_ROOT>. Resolve the exact per-feature file
before implementation and report that path for the review handoff.
```

Для route без native persisted goal тот же текст отправляется обычным initial prompt. Эмулятор goal или state file не создаётся.

## 7. Автономный model preflight

Текущий обязательный вопрос «confirm or change models» удаляется. Оркестратор не должен превращать каждый run в model-selection dialogue.

### 7.1. Selection policy

1. Выполнить `mo-models.mjs --show`.
2. Для каждой сохранённой роли проверить route/model через собственный catalog route.
3. Если сохранённая selection доступна, использовать её без вопроса.
4. Если model ID больше не доступен:
   - не записывать новый preference автоматически;
   - запустить соответствующий provider с его native configured default;
   - сообщить одной строкой, что saved model недоступен и используется native default.
5. Если роль не настроена:
   - выбрать provider route по recent successful session history;
   - model ID не навязывать, использовать native configured default.
6. Reviewer routes выбираются так, чтобы хотя бы один reviewer был другого vendor, чем executor.
7. Если доступны только routes одного vendor:
   - reviews можно запустить для получения findings;
   - workflow не может завершиться verified;
   - итог — `needs_attention` с missing cross-vendor gate.
8. `~/.meta-o/models.json` меняется только явным `--set`, не автоматически в feature run.

Это позволяет оркестратору принимать ответственность, не выдумывая универсальный порядок «сильнейших» моделей из catalog, который такого quality ranking не предоставляет.

### 7.2. Никаких опциональных вопросов

В обычном run:

- не спрашивать подтверждение model set;
- не предлагать reuse research;
- не предлагать watchdog;
- не выдавать меню route choices.

`mo-reuse` запускается только если пользователь уже запросил его или task явно содержит принятое reuse-research решение.

Watchdog запускается только если пользователь уже включил его в invocation. Без явного запроса workflow продолжает bounded waits самостоятельно.

## 8. Actor output boundaries

Новый machine protocol или persisted schema не вводится. Используются короткие human-readable headings, чтобы orchestration не требовала технического пересказа.

Executor readiness:

```text
READY
SPEC: <absolute path>
BUSINESS: <absolute path>
BRANCH: <branch>
```

Executor candidate:

```text
CANDIDATE
COMMIT: <exact output of git rev-parse HEAD>
QC: <command and result>
SMOKE: <command and result or not-applicable>
```

Допустимый blocker:

```text
NEEDS_ATTENTION
CLASS: product | irreversible | credentials | subscription | external | dispute
DETAIL: <short concrete blocker>
```

Это textual handoff, а не persisted JSON protocol. Оно не записывается и не парсится отдельным helper.

Reviewer использует существующий Markdown contract:

```text
## Verdict

PASS | FAIL | UNKNOWN

## Findings

...

## Residual risks

...
```

`## Verdict` является содержанием review, а не транспортным completion sentinel.

### 8.1. Git object format

Нельзя предполагать 40-character SHA-1.

Полный candidate ID получается только через:

```text
git rev-parse HEAD
```

Проверка:

```text
declared commit equals exact git rev-parse HEAD output
AND git cat-file -e "<commit>^{commit}" succeeds
AND git status --porcelain is empty
```

Это работает и для SHA-1, и для SHA-256 repositories.

Концептуальное runtime-состояние:

```ts
type Candidate = {
  commitId: string;
  worktreeClean: true;
};

type GateVerdict = "pass" | "fail" | "unknown" | "stale";

type GateSet = {
  commitId: string;
  qc: GateVerdict;
  smoke: GateVerdict | "not-applicable";
  reviewerA: GateVerdict;
  reviewerB: GateVerdict;
  e2e: GateVerdict | "not-applicable";
};
```

Оно:

- не сериализуется;
- не пишется в repository или home;
- не является manifest, receipt или state store;
- после restart восстанавливается из Git и native Herdr sessions;
- полностью инвалидируется, если текущий `git rev-parse HEAD` отличается.

## 9. Waiting policy

Ожидание строится только на прямом lifecycle state.

```text
waitActor(actor):
    herdr agent wait actor --timeout 600000

    if settled:
        read actor state and response
        continue workflow

    if timeout:
        read actor state once
        if working:
            start one new bounded wait
        else:
            read the already-finished response

    if blocked:
        read blocker and route it

    if unknown:
        inspect recent output once
        retry bounded wait or mark transport unknown
```

Правила:

- стандартный wait: 10 минут;
- после transient provider error: 5 минут, затем 10 минут;
- один waiter на actor;
- никаких `sleep`;
- никаких hand-written polling loops;
- timeout не означает failure, пока actor `working`;
- stale progress text не является source of truth;
- commit ID читается только после settled state;
- ожидание никогда не содержит условие «commit должен измениться».

Candidate переходит в gate phase только когда:

```text
executor is settled
AND executor declared CANDIDATE
AND git status --porcelain is empty
AND declared commit equals git rev-parse HEAD
AND git cat-file confirms it is a commit
```

Тот факт, что `HEAD` не изменился во время последнего wait, допустим.

## 10. Complete interactive reviewer verdict

### 10.1. Compact verdict contract

Authoritative reviewer response:

- не более 180 rendered lines;
- только verdict, actionable findings и residual risks;
- без raw logs;
- без полного test output;
- без хронологии исследования;
- каждый finding содержит evidence, impact и expected fix;
- самостоятельные actionable defects не удаляются;
- findings с одной root cause могут быть объединены.

180 строк выбраны с запасом относительно измеренного успешного retrieval 250-line TUI turn. Ограничение относится только к final answer: reviewer может выполнять длинное исследование внутри session.

### 10.2. Retrieval

```text
herdr agent read <actor> --source recent-unwrapped --lines 400
```

Должны быть доказаны:

- последняя prompt boundary;
- законченный assistant response;
- нижняя idle/done boundary;
- непрерывный порядок;
- отсутствие repaint duplicates и reordered fragments.

Если хотя бы одно свойство не доказано, verdict — `UNKNOWN`.

Новый authoritative turn после transport failure:

```text
The previous turn was not transport-complete. Re-evaluate the same frozen commit
and produce a new authoritative verdict within 180 rendered lines. Include every
actionable defect, but omit investigation narration and raw output.
```

Это новая review operation, а не просьба повторить старый ответ. Если второй compact turn также не читается полностью, route не несёт gate в этом run. Headless fallback не используется.

### 10.3. Herdr upstream issue

Подготовить issue:

**Title:** `Expose a complete logical last turn for interactive agent panes`

**Required behavior:**

- адресация последнего logical user/assistant turn;
- `complete` или `in_progress`;
- стабильная pagination либо отсутствие row cap;
- корректность при alternate screen и repaint;
- отсутствие provider-private transcript dependency;
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

Gap не блокирует измеренные compact Claude/Codex verdict’ы, но блокирует произвольную длину и поддержку OpenCode до закрытия fixtures.

## 11. Bundled Claude model discovery

Claude catalog переводится с optional ambient dependency на self-contained bundle по доказанной схеме `brain-council`.

### 11.1. Build boundary

- `shared/scripts/mo-models.mjs` остаётся единственным authored source.
- Source использует static import `@anthropic-ai/claude-agent-sdk`.
- SDK и `esbuild` добавляются как pinned development/build dependencies.
- `tools/build-skills.mjs` собирает entry через:
  - `bundle: true`;
  - `platform: "node"`;
  - `format: "esm"`;
  - `target: "node22"`;
  - Node built-ins external;
  - Claude SDK inlined;
  - shebang preserved.
- Bundle сначала создаётся во временной директории.
- Один bundle копируется в built `mo-herdr` и `mo-omnigent`.
- Shipped skills не содержат `node_modules`.
- `skills/` остаётся generated tree.
- `build-skills --check` строит временный expected bundle и только сравнивает bytes.
- Normal `make skills` остаётся единственной mutating build operation.

Новый shipped helper не появляется: остаются только `mo-models.mjs` и `mo-posture.sh`.

### 11.2. SDK launch boundary

Helper:

1. Разрешает system `claude` из `PATH`.
2. Передаёт путь через `pathToClaudeCodeExecutable`.
3. Использует never-yield async prompt generator.
4. Вызывает `query(...).supportedModels()`.
5. Применяет bounded handshake timeout.
6. В `finally` вызывает `interrupt()` и `return()`.
7. Не отправляет model turn.

Bundled SDK не пытается использовать собственный optional native provider binary.

Удаляется runtime search SDK:

- в cwd;
- выше skill install;
- в global npm root;
- в project `node_modules`.

Catalog unavailable означает реальную runtime-проблему:

- Claude CLI отсутствует;
- auth/trust failure;
- handshake timeout;
- SDK/CLI incompatibility;
- `supportedModels()` error.

`~/.meta-o/models.json` остаётся settings-only файлом.

## 12. Version control contract

Правила добавляются byte-for-byte в `AGENTS.md` и `CLAUDE.md` и в инструкции `mo-setup`.

- Не разрабатывать на `main`, `master`, `develop`, `default`.
- Task branch: `feature/<short-slug>`.
- База: актуальный `develop`.
- Remote name не hardcode’ится; используется configured upstream `develop`.
- Если upstream настроен, executor выполняет fetch и fast-forward до создания task branch.
- Если upstream отсутствует, локальный `develop` считается доступной repository authority.
- Если `develop` отсутствует, executor не подменяет его `main`.
- Relevant checks запускаются перед каждым commit.
- Каждый coherent independently verifiable increment коммитится отдельно.
- Subject:
  ```text
  <type>: <what changed and why>
  ```
- Type: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Issue/spec reference добавляется, когда существует.
- Commit заканчивается после пустой строки:
  ```text
  Assisted-by: <executor-harness-model>
  ```

Финальный candidate — tip commit всей последовательности. Формулировка «one clean candidate commit» заменяется на «one clean candidate tip identified by its full Git object ID».

Любой новый commit инвалидирует QC, оба review verdict и E2E.

## 13. Backlog и documentation discipline

### 13.1. Backlog

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

Исправленный entry удаляется либо сужается до реально оставшегося хвоста. Историей выполненного остаётся Git.

### 13.2. Changelog

Новый `CHANGELOG.md` создаётся только если:

- spec прямо требует его;
- проект уже использует changelog в release process;
- назван внешний consumer.

Candidate commit, refactor или объединение README сами по себе changelog не требуют.

### 13.3. Proportional documentation

Новый документ допустим, только если изменение:

- вводит долговременную архитектурную границу;
- делает существующий business/glossary/architecture/E2E источник ложным;
- вводит новый operational contract;
- прямо запрошено;
- нужно существующему external consumer.

Не являются основанием:

- переименование файла;
- объединение нескольких README;
- локальный refactor;
- пересказ diff;
- отчёт о завершении feature;
- желание сохранить рассуждения actor’а.

`mo-setup` создаёт baseline только при явном запуске. `mo-herdr` не запускает setup и не расширяет `docs/` автоматически.

## 14. Error contract

| Состояние | Действие |
|---|---|
| `HERDR_ENV` отсутствует | `needs_attention`; не выполнять Herdr control commands |
| Actor start failed | Прочитать native error, повторить один раз, затем `needs_attention` |
| `agent_prompt_stalled` | Проверить state; не дублировать working turn; один retry из settled |
| Wait timeout + `working` | Новый bounded wait |
| Wait timeout + settled | Сразу читать response |
| Reviewer response incomplete | `UNKNOWN`; новый compact review turn |
| Второй incomplete turn | Route unsupported for this gate |
| Dirty worktree при candidate | Дословно вернуть executor’у факт |
| Declared commit не равен `HEAD` | Candidate rejected, executor resolves |
| Новый commit после gate | Все gate’ы stale |
| Transient provider error | Retry same session через 5, затем 10 минут |
| Subscription limit | Ждать, если reset известен и orchestrator route жив; иначе `needs_attention` |
| Credentials/access | `needs_attention` |
| Один vendor | Findings применяются, verified completion невозможен |
| Saved model unavailable | Native provider default без изменения settings |
| Missing `develop` | Repository-policy blocker |
| Missing tab rename | Продолжить layout; подготовить upstream issue |

## 15. Изменения по компонентам

| Компонент | Изменение |
|---|---|
| `shared/references/methodology.md` | Role firewall, executor ownership, autonomous preflight, waiting, VCS, docs |
| `src/skills/mo-herdr/SKILL.md` | Layout, persistent interactive actors, atomic prompts, no optional questions |
| `src/skills/mo-herdr/references/herdr-mechanics.md` | Compact TUI retrieval, support matrix, upstream gaps |
| `src/skills/mo-review/SKILL.md` | Reviewer arbitration вместо orchestrator judgement |
| `src/skills/mo-setup/SKILL.md` | VCS и proportional documentation |
| `shared/scripts/mo-models.mjs` | Bundled Claude discovery и system CLI path |
| `tools/build-skills.mjs` | Deterministic esbuild bundle |
| `AGENTS.md`, `CLAUDE.md` | Byte-identical VCS/backlog/docs rules |
| `docs/business.md` | Новые clarifications пользователя |
| `docs/architecture/skills-first.md` | Запрет чтения task/code оркестратором |
| `docs/backlog.md` | Только незакрытое |
| `docs/acceptance.md` | Requirement-to-evidence mapping |
| `docs/phase-0-fixtures.md` | Interactive layout, retrieval и discovery fixtures |
| `docs/e2e.md` | Installed-skill evidence, только после реального run |

Новый architecture document не создаётся.

## 16. Acceptance traceability

| Исходная проблема | Реализационное решение | Доказательство |
|---|---|---|
| Executor не в соседней панели | Right split current tab | Herdr E2E layout fixture |
| Reviewers невидимы | Separate review tab, two right/left panes | Herdr E2E layout fixture |
| Orchestrator читает spec/code | Role firewall | Contract test + observed installed run |
| Orchestrator проверяет findings | Reviewer/executor arbitration | Prompt transcript through Herdr surface |
| Headless reviewer launches | Interactive-only `agent start` | Live actor/pane inspection |
| Забытый Enter | Only `agent prompt` | Lifecycle transition fixture |
| Много вопросов пользователю | Autonomous model/reuse/watchdog policy | Installed run without optional prompts |
| Backlog содержит сделанное | Open-only backlog contract | Markdown AST contract test |
| Создаётся changelog | Explicit consumer/spec requirement | Contract test |
| Лишние docs | Proportional documentation rule | Reviewer lens + acceptance |
| Модели не обнаруживаются | Bundled Claude SDK | Isolated install + live catalog fixture |
| Tab не переименована | Native tab rename or upstream issue | Layout fixture |
| Executor преждевременно idle | Native goal/autonomy prompt | Executor lifecycle fixture |
| Неверное ожидание нового SHA | Lifecycle-only wait | Same-SHA settled fixture |
| Branch/commit discipline отсутствует | Version control contract | Scratch repository E2E |

## 17. Verification

### 17.1. Deterministic `make mo-qc`

Проверяет:

- `AGENTS.md` и `CLAUDE.md` byte-identical;
- built tree соответствует fresh temporary build;
- backend copies `mo-models.mjs` byte-identical;
- bundle загружается без ambient `node_modules`;
- нет live SDK import;
- helper передаёт system Claude executable;
- `--show` ничего не записывает;
- invalid `--set` ничего не сохраняет;
- role firewall присутствует в canonical methodology;
- Herdr actor route не содержит headless provider commands;
- `mo-review` не назначает оркестратору technical arbitration;
- backlog contract не допускает completed sections;
- changelog не является baseline artifact;
- Markdown анализируется real AST tooling.

Live provider catalog не входит в deterministic gate.

### 17.2. Agent-required Herdr E2E

Должен доказать:

1. Tab rename либо точный capability gap.
2. Executor расположен справа.
3. Reviewers находятся в отдельной вкладке рядом.
4. Все actors — ordinary interactive CLI sessions.
5. User может открыть каждую session.
6. Review round 2 продолжает те же sessions.
7. Prompt начинает turn без ручного Enter.
8. Orchestrator не читает spec, framing, diff или source.
9. Executor сам находит business framing и QC.
10. Verdict’ы укладываются в 180 строк и читаются полностью.
11. Findings доставляются без изменений.
12. Same-commit settled executor не вызывает лишнее ожидание.
13. Новый commit инвалидирует все gate’ы.
14. QC, reviews и E2E относятся к одному Git object ID.
15. Model catalog работает из isolated installed skill.
16. Run не задаёт optional model/reuse/watchdog questions.
17. Task branch создаётся от актуального `develop`.
18. Несколько coherent commits заканчиваются правильным trailer.

## 18. Trade-offs

- **Interactive sessions вместо inline/headless:** ограничивают размер verdict, но сохраняют visibility, direct access и session cache.
- **180-line verdict:** основан на измеренном TUI диапазоне; длинным остаётся исследование, а не final response.
- **OpenCode fail-closed:** route не объявляется поддержанным по одному факту запуска.
- **Role firewall:** actor round-trips предпочтительнее раздувания orchestrator context.
- **Reviewer arbitration:** техническое решение остаётся у sessions, читавших код.
- **Native provider default при отсутствующей selection:** лучше недетерминированного выдуманного рейтинга моделей и не требует user dialogue.
- **Bundled SDK + system CLI:** воспроизводимое discovery без shipping provider binary.
- **Human-readable headings:** дают устойчивый handoff без отдельного parser, schema или state store.
- **Repository-native Git object ID:** не предполагает SHA-1.
- **Нет нового process documentation:** меняются только существующие sources of truth.

## 19. Риски и mitigation

- **180 строк недостаточно:** убрать narration/raw logs; если самостоятельные findings всё равно не помещаются, `UNKNOWN`, а не partial PASS.
- **Compact Claude turn повреждён repaint’ом:** проверять boundaries/order; повторить как новую review operation.
- **OpenCode теряет tool-using response:** не использовать для gate до fixture.
- **Orchestrator снова читает task:** запрет в methodology, backend skill и acceptance.
- **Executor эскалирует обычные решения:** autonomy prompt и возврат responsibility reminder.
- **Review loop зацикливается:** evidence обязателен; taste не блокирует; один arbitration и один targeted fact-check.
- **Model catalog есть, но ranking нет:** использовать saved selection либо native default; не изобретать ranking.
- **Bundled SDK не находит CLI:** explicit `pathToClaudeCodeExecutable`.
- **SDK/CLI несовместимы:** pinned SDK, isolated load test, live fixture.
- **Remote develop устарел:** использовать configured upstream, не hardcoded remote.
- **Repository использует SHA-256:** сравнивать exact `rev-parse`, не длину.
- **Лишние docs возвращаются через review:** отсутствие документа не finding без названного изменившегося durable knowledge.
- **Optional workflow снова требует пользователя:** reuse/watchdog/model questions удаляются из default path.

## 20. Принятые предположения

- Новые clarifications имеют приоритет над старым `my-opinion.md`.
- Version control contract применяется к meta-o и проектам после `mo-setup`.
- `develop` обязателен; remote name не предполагается.
- 180 rendered lines — начальный поддерживаемый verdict limit.
- Codex и Claude — начальные interactive review routes; OpenCode требует fixtures.
- Bundling повторяет `brain-council`: SDK JavaScript inlined, provider CLI system-owned.
- Native provider default допустим, когда model preference отсутствует или устарела.
- Feature run не изменяет model settings автоматически.
- Watchdog и reuse research запускаются только по уже выраженному запросу.
- Upstream issues здесь только проектируются.
- Выполненные backlog entries удаляются.
- `CHANGELOG.md` не является baseline artifact.
- Никакой durable orchestration state не создаётся.

## 21. Декомпозиция реализации

1. Role firewall и human-attention policy.
2. Executor autonomy, feasibility, QC и business-path ownership.
3. Herdr layout, tab naming и persistent sessions.
4. Atomic prompt delivery и bounded lifecycle waits.
5. Compact review retrieval и reviewer arbitration.
6. Autonomous model selection и bundled Claude discovery.
7. Version control, backlog и documentation contract.
8. Deterministic tests, Herdr fixtures, acceptance traceability и upstream issue text.