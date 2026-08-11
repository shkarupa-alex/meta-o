# Council Report

- Rounds: 3
- Converged: no

## Summary

| Rank | Slug | Frozen # | Status | Avg score | Would adopt | Locked at round |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | gpt56solmedium | 1 | open | 6.0 | 0/2 | - |
| 2 | opus1mhigh | 2 | open | 4.5 | 1/2 | - |

## Leading proposal (no convergence)

**gpt56solmedium** (proposal-1):

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

## All proposals

### gpt56solmedium (proposal-1) — open, score 6.0/10, 0/2 adopt

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

### opus1mhigh (proposal-2) — open, score 4.5/10, 1/2 adopt

I re-derived the Herdr contract from `herdr api schema --json` (protocol 19, schema_version 1), and I have taken the sharper criticism seriously: the previous revision solved the retrieval problem by inventing a protocol the project had already, deliberately, rejected. This version removes that protocol rather than defending it.

---

# Interactive Herdr sessions, a starved orchestrator, and a contract that carries the executor's rules

## Constraints and considerations before any recommendation

Fourteen complaints arrived as one report, and the tempting move is to treat them as fourteen small fixes. They are not. Read against `docs/references/my-opinion.md` and the shipped skills, five of them collapse into **one root cause**: the orchestrator has both the *permission* and the *material* to behave like an engineer. `shared/references/methodology.md §2.2` orders it to "Read the business framing, then the task or spec **in full**". Once a thin orchestrator holds several thousand tokens of specification, it forms opinions about feasibility (complaint 2), it feels qualified to grade reviewer findings (complaint 3), and — having opinions it cannot act on unilaterally — it starts holding option dialogs with the user (complaint 6). Complaints 7, 8 and 10 (backlog hygiene, unrequested `changelog.md`, invented `docs/` files) share a different root cause with the same shape: the executor deliberately runs with no methodology skill (`docs/architecture/skills-first.md`), so every durable rule it must obey has to live in `AGENTS.md`/`CLAUDE.md` — and those rules were never written.

Complaint 4 is where the design pressure is. The user wants reviewers as ordinary interactive subscription CLI sessions in visible Herdr panes, for cache economy and for the visual observability `my-opinion.md` states as a meta-harness requirement. The shipped `mo-herdr` prefers the opposite: `references/herdr-mechanics.md` step 7 makes the **inline** surface the default for anything long, because a Claude Code TUI above roughly 250 rows returns a repaint collage and only a provider-authored JSON envelope mechanically detects a turn truncated at exit status 0.

My earlier answer to that pressure was wrong in an instructive way. I proposed that the reviewer write its findings to an orchestrator-supplied file and close its turn with a three-line footer — which is precisely the "verdict file, nonce or completion marker" that `docs/architecture/full-turn-retrieval.md` rejects and that `mo-herdr` bans in the words *"nothing is asked of the reviewer"*. I then argued the ban away. The correct response to a rule you are about to violate for the third time is to ask whether the requirement can be met without violating it at all, and it can: **the orchestrator is not the party that needs the findings.** The executor is. Once the executor retrieves the reviewer's turn itself, the transport problem disappears, nothing is asked of the reviewer, no footer grammar exists, no scratch protocol exists, and the project's retrieval architecture is preserved rather than amended. That inversion is the core of this revision, and it makes the proposal smaller than the one before it.

Three smaller constraints bound the rest. Herdr agent names must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents, so slugs need a length rule. The project contract states that everything shipped is Markdown plus two dependency-free helpers, which puts the user's "bundle the SDKs like brain-council does" instruction (complaint 9) in direct conflict with `AGENTS.md` — brain-council is a TypeScript runtime project with a real `node_modules`, and meta-o deliberately is not. And every actor shares one machine under a yolo posture, so reviewer independence is a rule rather than a wall — which `docs/architecture/skills-first.md` already says out loud, and which this design does not pretend to change.

### Traceability: every complaint to the mechanism that closes it

| # | Complaint | Mechanism | § |
| --- | --- | --- | --- |
| 1 | Executor in a sibling vertical pane; reviewers in their own tab, two vertical panes | Fixed topology, `pane.split direction=right`, `tab.create` | 2.2 / 3.2 |
| 2 | Orchestrator reads the spec and judges feasibility | Read budget: existence check only; feasibility is the executor's first turn | 2.1 / 3.1 |
| 3 | Orchestrator grades reviewer findings against code | Findings never reach it — the executor reads the reviewer directly | 2.4 / 3.4 |
| 4 | Reviewers launched outside Herdr; cache and visibility lost | Interactive `agent start` sessions kept alive across rounds; inline demoted to fallback | 2.4 / 4 |
| 5 | Agent forgets `<enter>` | `agent.prompt` / `pane.run` are atomic text+Enter; `send_text` / `send_keys` banned for submission | 2.3 / 3.3 |
| 6 | Orchestrator interrogates the user, offers option menus | Standing-principles decision table; menus banned; questions routed to actors | 2.5 / 3.6 |
| 7 | Backlog contains completed work | Contract clause (b) | 2.6 / 3.7 |
| 8 | Unrequested `changelog.md` | Contract clause (c) | 2.6 / 3.7 |
| 9 | Model catalogue unavailable; orchestrator stalled on it | Setup-time capability check; run-time one line, never blocking | 2.8 / 3.9 |
| 10 | Invented `docs/` files | Contract clause (c) | 2.6 / 3.7 |
| 11 | Rename the tab when the orchestrator starts | `tab.rename` on `$HERDR_TAB_ID` at run start | 2.2 / 3.2 |
| 12 | Suggest the short `/goal`; give a start prompt | Both texts ship; orchestrator sends the goal and echoes it | 2.5 / 3.8 |
| 13 | Version-control rules into `AGENTS.md` / `CLAUDE.md` | Contract clause (a), authored by `mo-setup` | 2.6 / 3.7 |
| 14 | Hour-long waits on impossible conditions | Wait on lifecycle only; verify with Git; 10-minute arms | 2.7 / 3.5 |

---

## 1. Approach summary

Make the orchestrator's thinness **structural rather than aspirational**: it may read commit metadata, actor state and file *paths*, never file *contents*, and it never becomes the courier for reviewer findings at all — it tells the executor which live Herdr agent to read, and the executor reads it. Move every actor onto ordinary interactive Herdr agent sessions in a fixed, named pane topology (executor in a sibling vertical pane, reviewers in their own tab split into two vertical panes), keeping the sessions warm across rounds, and leave the reviewer's output as ordinary Markdown with nothing asked of it. Finally, move the executor's durable behavioural rules — version control, backlog discipline, no unrequested documents — into the `AGENTS.md` / `CLAUDE.md` contract that `mo-setup` authors, because the executor runs with no skill and that file is the only thing it reliably re-reads.

---

## 2. Architecture and component breakdown

Nothing below adds a daemon, a state store, an adapter layer, a CLI, a manifest or a receipt. Every component is prose in an existing authored skill or a clause in a project's own contract file. `herdr agent list` **is** the registry; Git is the state.

### 2.1 The orchestrator's read budget

A new named boundary, recorded in `docs/architecture/orchestrator-read-budget.md`, citing the business reason "the orchestrator's main resource is a clean, durable control context" (`my-opinion.md`, thin-orchestrator section).

| MAY read | MUST NOT read |
| --- | --- |
| `git status --porcelain`, `git rev-parse HEAD`, `git log --oneline -20`, `git branch --show-current` | any diff, any hunk, any source file |
| *existence and non-emptiness* of `<SPEC_PATH>` and `<BUSINESS_PATH>` (`test -s`) | the **body** of the spec or the framing |
| `Makefile` target names and package-script names | the bodies of those targets |
| `herdr agent list` / `get`, `tab list`, `pane list` JSON | any reviewer's findings, in any form |
| the last ~40 rows of an actor pane, to classify a verdict or read a one-line answer | a full reviewer turn, a full executor turn, a test log |
| the user's own message text, verbatim, when writing the business framing | `docs/e2e.md` beyond its scenario names |

Two exceptions, both deliberate. Methodology §2.1 still lets the orchestrator *write* the business framing from the user's own words, because that text is already in its context and the alternative is losing the only copy of the request. And the fail-closed framing check is now split: the orchestrator proves the file **exists and is non-empty**, while the *semantic* check — "is this a real framing or a stub?" — moves into the executor's first turn, which is instructed to read the framing first and stop immediately if it is placeholder text. The gate is not weakened; it is performed by the actor that can actually perform it.

Two consequences worth naming. **"Can this spec be implemented?" stops being an orchestrator question** and becomes the executor's first turn. And the orchestrator cannot evaluate a reviewer finding even if tempted, because no finding ever enters its context.

### 2.2 Pane and tab topology (complaints 1, 11)

Fixed, named, created by the orchestrator. `<slug>` is `[a-z][a-z0-9-]{0,19}` — capped at 20 characters so `<slug>-rev-a` stays inside Herdr's 32-character agent-name limit.

```
tab "mo:<slug>"                 ← orchestrator renames its OWN tab (complaint 11)
 ├─ pane (caller)  orchestrator
 └─ pane (right)   <slug>-exec  ← adjacent vertical pane (complaint 1)

tab "mo:<slug>:review"          ← separate tab (complaint 1)
 ├─ pane (root)    <slug>-rev-a ┐ two vertical panes, ratio 0.5
 └─ pane (right)   <slug>-rev-b ┘

tab "mo:<slug>:e2e"             ← single topology assumption, §6
 └─ pane (root)    <slug>-e2e
```

The orchestrator owns topology creation and naming and never closes a tab or pane it did not create. Every actor pane is renamed to its role, so observability is satisfied at a glance instead of by decoding pane IDs. Reviewer sessions start when the **first candidate is frozen** and stay alive for every later round — that is where the cache economy of complaint 4 actually lives.

### 2.3 Prompt transport (complaint 5)

The missing `<enter>` is a wrong-primitive failure, not a memory failure. Both the schema and Herdr's own skill file are explicit: `agent.prompt` atomically submits text **and** encoded Enter while honouring the pane's live bracketed-paste mode, and `pane.run` does the same for shell commands. `pane.send_text` and `pane.send_keys` do not. So the rule is a ban, not a reminder:

- prompt submission → `herdr agent prompt` **only**;
- shell command in a non-agent pane → `herdr pane run` **only**;
- `agent send-keys` only for interactive UI controls (`esc`, `ctrl+c`), never to submit;
- `pane send-text` is not used by this workflow at all.

"Remember to press Enter" is re-forgotten at the next compaction. "These two commands, never those two" survives, because the wrong command is simply not in the skill.

### 2.4 The executor retrieves the review; the orchestrator never does (complaints 3, 4)

This replaces both the current "copy findings into the executor's next prompt verbatim and whole" and my own earlier file-and-footer protocol.

The reviewer is asked for nothing. Its output stays ordinary Markdown in its own visible, warm, interactive pane — exactly what `mo-herdr` already requires and what complaint 4 asks for. When the round closes, the orchestrator hands the executor a *name*, not a verdict:

> Reviewer A is the live Herdr agent `<slug>-rev-a`, which has just reviewed `<sha>`. Read its last turn yourself and address every finding. Read only — never send a prompt to another agent.

The executor runs `herdr agent read <slug>-rev-a --source recent-unwrapped --lines 1000` and works from what it gets. Three things follow, and they are the whole argument for the inversion:

1. **Nothing is asked of the reviewer**, so `full-turn-retrieval.md` needs a clarification rather than a reversal, and `mo-herdr`'s reviewer-purity rule survives intact.
2. **The retrieval burden lands on the only actor equipped to detect a bad retrieval.** A repaint collage that duplicates one finding and drops another is invisible to an orchestrator holding no code context; it is conspicuous to the executor, which will find a finding referring to a file that does not exist, or a sentence ending mid-word. When the executor says the read was incoherent, that is a first-class signal, not a guess.
3. **There is no intermediate copy at all**, so there is nothing to summarise, and the orchestrator's per-round cost is one sentence instead of several thousand tokens.

**Verdict classification, without a sentinel.** The orchestrator still needs one bit — did this reviewer pass? — to know whether the round converged. It gets that bit twice, from two parties that would have to be wrong in the same direction to produce a false PASS:

- it reads the reviewer's own tail (`agent read --source detection --lines 40`) and, if the verdict is unambiguously visible with its boundaries, takes it. If it is not — a template that puts `## Verdict` near the top often will not be — it asks that reviewer one cheap follow-up in the warm session: *"In one word, PASS or FINDINGS?"* A one-word answer is trivially readable with both boundaries visible, which is the existing `herdr-mechanics.md §1` condition, not a new one;
- and the executor, which read the same turn in full, reports how many findings it found and what it did with each.

A disagreement between those two reads is `unknown`, and `unknown` repeats the role. This is strictly stronger than either a footer or a tail-read alone, and it introduces no artefact.

**The fallback, kept as a fallback.** When the executor reports that it could not assemble a coherent turn, the orchestrator asks that reviewer to write its complete response to a temporary path and reply with the path, and hands the path to the executor. This is exactly the fallback the installed `herdr` skill documents — *"Use this only as a fallback; do not request file output in the initial prompt"* — and it proves nothing about completeness, which is why it is a fallback and why its use is named in the handback rather than passed off as equivalent. The file lives outside the repository and is never staged. If even that fails, the route is `unsupported for the review gate` on that surface, unchanged.

### 2.5 The decision procedure — orchestrator autonomy (complaints 6, 12)

Complaint 6 is the one no topology change fixes. The orchestrator needs a decision procedure it can apply without code and an explicit ban on the behaviour the user named ("выдаёт диалог с вариантами").

**Standing principles**, kept as a short list rather than an essay: implement the whole scope, never an MVP; production-ready over placeholder; difficulty is not a reason to defer; never weaken QC or config to get green; prefer the option that keeps module boundaries intact; when genuinely unsure, ask another model, not the human.

**Hard behavioural rules.** The orchestrator never presents the user with a menu of options — it decides and states the decision in one line. It emits status only at phase boundaries, never a running narration. It never asks the user a question it could answer from the standing principles or obtain from an actor. The routing table is §3.6.

### 2.6 The executor's rules live in the project contract (complaints 7, 8, 10, 13)

`mo-setup` §2 already requires `AGENTS.md` / `CLAUDE.md` to be byte-identical and to carry outcomes and commands. It gains three mandatory clauses, because the executor has no skill and this file is its only durable instruction source. Texts and the one contradiction they force are in §3.7.

### 2.7 Waiting (complaint 14)

A new methodology section, `§12 Waiting`. The user's own post-mortem is the specification: the orchestrator waited on a **derived** signal (`HEAD != 216eb7b`) already unsatisfiable when written, inside a three-part conjunction, on the strength of a stale screen reading of "11 of 14". The rule follows the diagnosis exactly — wait on the actor's lifecycle, verify with Git. Details in §3.5.

### 2.8 Model catalogue (complaint 9)

Moved from a run-time surprise to a setup-time capability check plus a non-blocking run-time line. Details in §3.9.

---

## 3. Interfaces and data models

### 3.1 Verified Herdr contract

Taken from `herdr api schema --json` (protocol 19, schema_version 1) on 2026-08-08, not from prose. Parameter names are the socket API's; the CLI spells flags in kebab-case. The installed `herdr --skill` remains the syntactic source of truth, and IDs are always parsed from JSON responses.

| Method | Params | Notes that shape the design |
| --- | --- | --- |
| `tab.create` | `{cwd?, env{}, focus=false, label?, workspace_id?}` | `label` and `cwd` at creation; `focus` defaults **false**, so the user's focus is preserved by construction |
| `tab.rename` | `{tab_id, label}` | the orchestrator's own tab |
| `pane.split` | `{direction: right\|down (required), cwd?, env{}, focus=false, ratio?, target_pane_id?, workspace_id?}` | `ratio` gives deterministic widths; `env` injects variables into the pane |
| `pane.rename` | `{pane_id, label?}` | role labels for observability |
| `agent.start` | `{name, kind, pane_id, args[], timeout_ms? (>3000, ≤300000)}` | startup timeout tunable to five minutes |
| `agent.prompt` | `{target, text, wait?{timeout_ms?, until[]}}` | atomic text + Enter |
| `agent.wait` | `{target, timeout_ms?, until[]}` | **single target** — the basis of upstream gap 5 |
| `agent.read` / `pane.read` | `{source: visible\|recent\|recent_unwrapped\|detection, lines?, format, strip_ansi=true}` | `detection` is the plain-text bottom-buffer snapshot; CLI reads never mark a tab *seen* |
| `AgentStatus` | `idle \| working \| blocked \| done \| unknown` | |
| agent view fields | `status, workspace_id, tab_id, pane_id, agent, seen, state_change_seq` | `state_change_seq` is a documented field, not a private detail |

`env` on `tab.create` and `pane.split` matters more than it looks: variables injected into an actor's pane are re-readable by that actor at any time with a shell command, so they **survive the actor's own compaction** in a way prompt text does not. The peer agent names travel that way (`MO_REVIEWERS="<slug>-rev-a <slug>-rev-b"`) as well as in the prompt.

### 3.2 Topology construction

```bash
# 0. The orchestrator renames its own tab.  Requires a real HERDR_ENV=1.
herdr tab rename "$HERDR_TAB_ID" "mo:<slug>"

# 1. Executor: sibling vertical pane; focus defaults false, so the user stays put.
EXEC_PANE=$(herdr pane split --current --direction right --ratio 0.5 --cwd "$PWD" \
            | jq -r '.result.pane.pane_id')
herdr pane rename "$EXEC_PANE" "<slug> exec"
herdr agent start "<slug>-exec" --kind <claude|codex> --pane "$EXEC_PANE" \
            --timeout-ms 120000 -- <native args>

# 2. Reviewers: own tab with label and cwd set at creation, then one right split.
REV=$(herdr tab create --label "mo:<slug>:review" --cwd "$PWD")
PANE_A=$(jq -r '.result.root_pane.pane_id' <<<"$REV")
PANE_B=$(herdr pane split --pane "$PANE_A" --direction right --ratio 0.5 --cwd "$PWD" \
            | jq -r '.result.pane.pane_id')
herdr pane rename "$PANE_A" "<slug> review A"
herdr pane rename "$PANE_B" "<slug> review B"
herdr agent start "<slug>-rev-a" --kind claude --pane "$PANE_A" -- <native args>
herdr agent start "<slug>-rev-b" --kind codex  --pane "$PANE_B" -- <native args>
```

| Condition | Signal | Response |
| --- | --- | --- |
| Not running under Herdr | `HERDR_ENV` unset/empty | Stop, `needs_attention`. Never fabricate it. |
| Pane not at an interactive prompt | `agent.start` error JSON, exit 1 | `pane read --source detection --lines 20`, then `needs_attention`. No blind retry. |
| Startup timeout | error JSON | One retry at `--timeout-ms 300000`, then `needs_attention` naming the provider. |
| Name collision | error JSON | A live actor already holds the name — this is **recovery**: adopt it (§3.10), never duplicate. |
| Pane too narrow for a right split | `pane.layout` before splitting | Split `down` instead and say so in one line. |
| Syntax error | exit 2 | The installed interface differs from the example. Re-read `herdr --skill`. Never guess a flag twice. |

### 3.3 Prompt submission and turn boundary

```
herdr agent prompt <target> "<text>" --wait --timeout <ms>
  → JSON; settles at idle | done | blocked
  → "agent_prompt_stalled" when a prompt from a non-working state produces
    no observed lifecycle change within 5s
  → exit 1 server error JSON on stderr; exit 2 syntax error
```

`--wait` settles the **lifecycle**, not a turn. Before sending, the orchestrator records `state_change_seq` from `agent get <target>`; after settling it re-reads it, and claims a turn boundary only when it has increased. The field is documented in the agent view, but "increments exactly once per turn" is an assumption that fixture H13 gates; until then it corroborates the settled-state check rather than replacing it.

Do not narrow with `--until idle`. A finished Claude Code turn settles as `done`, because `idle` additionally requires the tab to have been *seen* in the focused UI and a CLI read never marks it seen. The default set (`idle`, `done`, `blocked`) is correct.

### 3.4 The review round, end to end

```
1. freeze:     SHA = git rev-parse HEAD, worktree clean
2. prompt:     agent prompt <slug>-rev-a  (mo-review's prompt, unchanged)
               agent prompt <slug>-rev-b  (same SHA, no sight of A)
3. wait:       §3.5, per reviewer
4. classify:   agent read <rev> --source detection --lines 40
               → verdict visible with boundaries?  take it
               → otherwise: agent prompt <rev> "In one word, PASS or FINDINGS?"
5. hand over:  agent prompt <slug>-exec  "Reviewer A is the live Herdr agent
               <slug>-rev-a … read its last turn yourself … read only, never
               prompt another agent."
6. cross-check: executor's reported finding count vs. the reviewer's own word.
                disagreement → unknown → repeat the role
7. new SHA → every applicable gate again
```

Step 5 runs for **both** reviewers, including one that said PASS: the executor confirms the turn really contains nothing actionable. That is what makes step 6 a genuine cross-check rather than a formality — a false PASS now requires the reviewer and the executor to be wrong in the same direction, where a footer required only one model to write one word.

Two constraints on step 5 that must be stated in the skill, because they are the price of giving one actor another actor's name:

- **Read only.** The executor may call `herdr agent read`; it may never call `agent prompt`, `send-keys` or `attach` on another actor. An executor that argues directly with its reviewer has destroyed the independence the gate is made of.
- **Reviewers get no peer names at all.** Reviewer B is never told that `<slug>-rev-a` exists. Both could technically discover each other through `herdr agent list`, and `docs/architecture/skills-first.md` already concedes that "two reviewers' independence is a rule, not a wall". This design does not claim to close that; it declines to hand over the key.

### 3.5 The wait protocol (`methodology §12`)

```
wait(actor, 600000) -> settled | timeout
  primary:  herdr agent wait <actor> --timeout 600000
  on timeout: ONE agent get; classify; then re-arm (max 6 arms = 1 hour)
```

Four rules, each traceable to the reported incident:

1. **Wait on the actor, never on a consequence.** The condition is exactly "this actor's lifecycle settled". A new SHA, a commit count, a clean worktree, or a progress string are **never** wait conditions — they are things you check *after* waking, with a direct command.
2. **No compound predicates.** One actor, one wait. The failure was a three-part conjunction whose third clause was already false-forever when it was written.
3. **Never infer a future event from a rendered screen.** "11 of 14" in a repainting TUI is stale the instant it is read, and it is nobody's commitment.
4. **Ten-minute arms, bounded total.** On *every* timeout the orchestrator reads `agent get` once; if the actor is not `working` it asks the actor directly ("status?") rather than re-arming. After six arms it reports `needs_attention` naming the actor and its last state. A 55-minute silent wait cannot recur, because no wait exceeds ten minutes without a direct state check.

**The candidate comes from Git, not from a claim.** When the executor settles, the orchestrator runs `git rev-parse HEAD` and `git status --porcelain`. A clean tree with a new tip is a candidate; a dirty tree gets one line back — *"the worktree is not clean; finish the candidate"* — not another wait. This is the same rule as (1) applied to itself: an invented completion marker from the executor would have been exactly the derived signal rule (1) forbids, which is why this design has none.

Two actors settling at once is not an event-loss hazard: `agent.wait` observes **pollable state**, not a consumable queue, so after handling reviewer A the orchestrator re-reads `agent get <slug>-rev-b` and its settled state is still true. The cost is latency, which is why upstream gap 5 is an efficiency request rather than a correctness bug.

### 3.6 Question and dispute routing (complaint 6)

| The actor asks… | The orchestrator does |
| --- | --- |
| permission to run a command or tool | Answers "proceed" in one line and records a posture defect in `docs/backlog.md` — under the agreed yolo posture this question should not exist |
| choice between technical implementations | Decides from the standing principles (§2.5), immediately, in one line |
| "is X in scope?" | *"The spec is authoritative. Implement what it says; where it is silent, take the production-ready option."* — answered without reading the spec |
| a fork it cannot resolve technically | Routes to the idle reviewer on the **other vendor**, by name, for a one-paragraph recommendation; the asker is then told to read that reviewer's turn |
| a reviewer finding the executor rebuts | Never adjudicates. Tells the other reviewer: *"`<slug>-rev-a` raised a finding on `<sha>` and `<slug>-exec` answered it. Read both turns and say in one line which is correct."* |
| product meaning, irreversible action, credentials, subscription change, true deadlock | The user — methodology §9, unchanged |

Note that dispute resolution is the one place a peer name is deliberately handed to a reviewer, and only after both parties have already spoken on a frozen SHA, where there is nothing left to contaminate. Escalation to the human happens only when the second reviewer also declines to resolve, or the question is one of the six §9 categories — which is exactly `my-opinion.md`'s "при неясности используем независимую критику другой модели".

### 3.7 The three contract clauses for `AGENTS.md` / `CLAUDE.md`

Authored by `mo-setup`, written identically into both files (`cmp -s AGENTS.md CLAUDE.md` already gates this).

**(a) Version control**

> ## Version control
>
> Never develop directly on `main`, `master`, `develop`, or `default`. Create each task branch from an up-to-date `develop` using `feature/<short-slug>` and use it for the whole task. If the project has no `develop` branch, branch from the default branch and say so in the first commit message.
> Run the relevant checks before committing. Commit every coherent, independently verifiable increment instead of accumulating the whole task in one commit. Use `<type>: <what changed and why>` with `feat`, `fix`, `refactor`, `test`, `docs`, or `chore`. Reference an issue or specification when one exists, but neither is required. End every agent-authored commit with a new line and the executor harness model: `Assisted-by: {model}`
> The final verified result is one full Git SHA. Any subsequent commit invalidates its review and verification gates.

Two reconciliations this forces, both landing in the same change or the contract self-contradicts:

- **methodology §4.7** currently reads "produce one clean candidate commit". It becomes: *"produce a clean candidate — the branch tip, with an empty `git status --porcelain` — committing each coherent increment along the way."* The candidate was always a SHA with a clean worktree (§5); the old wording merely read like a squash requirement.
- **`{model}` resolves to the full route string** as stored in `~/.meta-o/models.json`, for example `Assisted-by: claude/opus/high`, supplied by the orchestrator in the goal because an executor usually knows its model name but not the effort level it was launched with. A bare `opus` is ambiguous across efforts and useless for the forensic question the trailer exists to answer.

**(b) Backlog discipline** (complaint 7)

> `docs/backlog.md` records **only work that is not done**. It has one section. When an entry is completed, delete it — the commit is the record. Never add a "Closed", "Done" or "Completed" section, and never move an entry into one.

**(c) Documentation discipline** (complaints 8, 10)

> Create no file the task did not ask for. In particular: no `CHANGELOG.md` — Git history is the changelog — and no migration note, summary, report or "what I did" document. `docs/architecture/` records a boundary or a decision that constrains future changes; it does not record that you performed a change. Consolidating four READMEs into one is a commit message, not a new document. Update the knowledge this change made new or false, and add nothing else.

### 3.8 The two canonical texts (complaint 12)

**Orchestrator start prompt**, printed by `mo-herdr` when invoked with no arguments, so the user pastes one line instead of being interviewed:

```
Run the Meta-O Herdr workflow for <SPEC_PATH>. You are the orchestrator: do not
read the spec or any code, decide process and technical forks yourself from the
standing principles, and come back to me only for product meaning, credentials,
an irreversible action, a subscription change, or a genuine deadlock. Report
STATUS / CANDIDATE / SUMMARY when the gates are done.
```

**Executor goal**, sent by the orchestrator as an atomic `agent prompt` from a settled state, then echoed to the user in one line so they can see and reuse it:

```
/goal Read the complete task at <SPEC_PATH>, the recorded business framing at
<BUSINESS_PATH>, and the project instructions. If either is a stub rather than a
real document, stop and say so. Implement the full scope and continue until there
is a clean candidate commit that passes the project-owned QC and applicable
deterministic smoke, or report a real blocker. Keep the spec and the framing
read-only. Sign commits `Assisted-by: <route>`.
```

The orchestrator sends it; it does not instruct the user to type it. Telling the human which prompt to paste would reinstate the human as a message bus, which is the thing `my-opinion.md` is most explicit about removing.

### 3.9 Model catalogue

The reported failure was not only that the Claude catalogue was unreachable — it was that the orchestrator *narrated its uncertainty at the user* mid-preflight.

- **Capability, at setup time.** `mo-setup` checks whether `@anthropic-ai/claude-agent-sdk` resolves from any of the three locations `mo-models.mjs` already probes (module resolution, project tree, `npm root -g`) and, if not, offers `npm i -g @anthropic-ai/claude-agent-sdk` as remediation, recording a `docs/backlog.md` entry if the user declines. The shipped tree stays dependency-free; the catalogue becomes routinely available.
- **Behaviour, at run time.** Methodology §2.5 becomes: print the saved roles in one line, name any unavailable catalogue in the *same* line, and **continue**. No stop, no question, no editorial. `--set` validation is unchanged — a route with a complete catalogue still refuses an unknown id, and `--force` remains the escape hatch.

### 3.10 Recovery

`herdr agent list` returns, per actor, `name`, `pane_id`, `tab_id`, `agent_status`, `interactive_ready`, `state_change_seq` **and** `agent_session.value` — the provider's own session id (verified live: a Claude UUID, a Codex UUID, an OpenCode `ses_…`). A restarted orchestrator recovers the whole actor set from one JSON call plus Git, with no registry and no state file. An expected actor that is absent is restarted; one that is present is adopted, never duplicated. A gate whose verdict it cannot establish on the current SHA is `unknown` and repeated.

---

## 4. Trade-offs considered

**Interactive sessions vs. the inline JSON envelope.** Inline gives a mechanically verifiable turn boundary; interactive gives none. I choose interactive because the business framing demands it — cache economy across warm rounds, a session the user can look at and type into, and the fact that inline processes do not appear in Herdr at all. What I no longer claim is that some substitute proof restores the envelope's guarantee. Nothing does. What changes instead is *who bears the risk*: the completeness burden moves to the executor, which reads the review in full and can recognise an incoherent one, and the residual exposure is bounded — an incomplete read costs a round on the same frozen SHA, and a false PASS now requires two independent parties to agree in the same wrong direction.

**Why the earlier footer-and-file protocol is withdrawn.** It was a real protocol — a footer grammar, per-reviewer scratch directories, a five-clause acceptance predicate, a repair budget — bolted onto a project whose stated identity is that skills and reasoning *are* the orchestration layer and that a control layer must earn its keep. It also violated `mo-herdr`'s "nothing is asked of the reviewer" and `full-turn-retrieval.md`'s rejection of verdict files and completion markers, and I argued the rule away rather than testing whether the requirement could be met inside it. It can. Inverting the courier — the executor reads the reviewer, the orchestrator reads a name — satisfies every user requirement while *removing* machinery: no footer, no scratch tree, no `chmod`, no acceptance predicate, no executor completion marker. The architecture doc needs a clarification (retrieval may be performed by the consuming actor, not only by the orchestrator) instead of a reversal.

**Why the orchestrator still classifies the verdict itself.** The cheapest design would let the executor report both the findings and whether the reviewer passed. I rejected it: the executor grading its own reviewer is the conflict of interest the two-vendor gate exists to prevent. One bit, read independently, is worth one cheap turn in a warm session.

**Read budget vs. methodology §2.2.** The current methodology requires the orchestrator to read the spec and framing in full, and that requirement had a real purpose — fail-closed proof that a framing exists. I am overriding it because the user is explicit that the orchestrator must not read specifications and must not assess feasibility, and because the requirement is what supplies the raw material for complaints 2, 3 and 6. The fail-closed property is preserved rather than dropped: existence and non-emptiness are checked by the orchestrator, and the "is it real?" judgement moves into the executor's first turn where it can actually be made.

**Contract clauses vs. a longer executor prompt.** Run-specific constraints travel in the goal; durable behavioural rules must not, because the goal is re-sent per run and the executor compacts. `my-opinion.md` is explicit that a rule read once and lost to compaction is *worse* than no rule, because the model still believes it is compliant. `AGENTS.md` is re-read by the provider CLI itself — exactly the durability property required.

**Setup-time SDK install vs. bundling.** Bundling guarantees the catalogue at the cost of breaking "everything shipped is Markdown plus two dependency-free helpers", inflating all seven skill installs, and importing an Agent SDK into a project whose framing rejects building the flow on Agent SDKs. A one-command setup step buys the same capability and keeps the contract intact.

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| No mechanical proof of turn completeness on the TUI surface | Accepted and named, not papered over. Executor detects incoherent reads; false PASS requires two parties to agree wrongly; documented file fallback; route stays `unsupported` if even that fails. |
| Executor's read is a repaint collage | It is the party that notices. On its report, the orchestrator invokes the documented file fallback and names its use in the handback. |
| Executor prompts or argues with a reviewer | Explicit read-only rule in the goal and the handover prompt; reviewers are never given peer names except during a post-verdict dispute. |
| Reviewer B discovers reviewer A via `herdr agent list` | Not closed, and not claimed to be — `skills-first.md` already states independence is a rule, not a wall. The design declines to hand over the key rather than pretending to lock the door. |
| Executor misreports a reviewer's verdict | Independent one-bit read from the reviewer itself; disagreement is `unknown` and repeats the role. |
| `state_change_seq` does not mean one-per-turn | Fixture H13 gates it; until then it corroborates the settled-state check. |
| Cache savings are asserted but unmeasured | Fixture H16 measures a warm round-two prompt against a cold restart. The design depends only on the direction, and the claim is not stated as measured until H16 closes. |
| Framing is a stub that passes `test -s` | The executor reads it first and is instructed to stop and say so — the semantic half of the fail-closed check. |
| Orchestrator drifts back into reading code | The read budget is one short table re-read on restart, and the workflow gives it nothing to read: findings never arrive in any form. |
| Contract self-contradiction (increments vs. one commit) | Resolved explicitly in §3.7; both edits land in the same change. |
| OpenCode long-turn retrieval | Unchanged: OpenCode remains unsupported for the review gate. This design neither rescues it nor claims to. |
| Slug overflows the 32-char agent-name limit | Slug rule `[a-z][a-z0-9-]{0,19}`, so `<slug>-rev-a` ≤ 26 chars. |
| Orchestrator closes a user's tab or pane | Herdr's own rule adopted verbatim: never close what you did not create. |
| Version-control clause changes meta-o's own workflow | Real: this repo is on `develop` with `origin/HEAD → master`, so adopting the clause moves its own feature work to `feature/<slug>`. Named so it is a decision, not a surprise. |

### Genuine Herdr capability gaps that should become upstream issues

Worked around, not depended on — the workflow functions today with none of them fixed.

1. **`agent read --lines` caps at 1000 rendered rows with no truncation signal.** Measured: `--lines 1600` and `--lines 3200` both returned 996 unwrapped rows while the pane reported `max_offset_from_bottom: 1889`. *Request:* return `truncated: true` and `available_rows`, and add a line range (`--from-line` / `--to-line`). This is now the single highest-value fix for this workflow, because the executor's read of a reviewer's turn is the one place a long answer must survive.
2. **Alternate-screen rows never enter host scrollback, and there is no scroll method.** `pane.*` exposes `pane.scroll_changed` and a read-only `PaneScrollInfo`; nothing moves the viewport, and `send-keys pageup` is refused. A full-screen TUI agent's completed long answer is unrecoverable programmatically. *Request:* opt-in per-pane transcript capture for alternate-screen agents, or a viewport-move method.
3. **No per-agent context or cost telemetry.** The agent view exposes status, `seen`, `state_change_seq` and identity, but nothing about context size, tokens consumed, or time since the last turn. `my-opinion.md` lists context/cache/cost visibility as a meta-harness requirement, and without it the orchestrator cannot make the "warm session vs. new session" decision the same document specifies. *Request:* surface whatever the provider already reports as agent metadata.
4. **`state_change_seq` has no documented semantics.** It is a first-class agent-view field, which implies it is meant to be consumed, but nothing states whether it increments once per turn or once per internal transition. *Request:* document it — the cheapest of the five and the one that most improves third-party orchestration.
5. **No multi-actor wait, although the protocol nearly has one.** `agent.wait` takes a single `target`. `events.wait` takes a single `EventMatch`, whose union covers workspace/tab/pane lifecycle plus `pane_output_changed` and `pane_exited` — but has **no agent-status variant**. `events.subscribe` *does* accept an array including `pane.agent_status_changed`, but it is a persistent push stream a CLI-invoking agent cannot consume. So an orchestrator driving two reviewers waits serially. *Request:* add an agent-status variant to `EventMatch`, and/or expose `herdr agent wait --target a --target b --any`.

A sixth, worth reporting but probably not filing: `idle` versus `done` depends on whether the tab was *seen in the focused UI* (`seen` is an exposed field), which leaks a UI concept into an automation-facing state machine. It is documented and workable — automation accepts both — but it surprises every first-time integrator.

---

## 6. Decisions, assumptions and fixtures

**Decisions taken here rather than deferred:**

1. **The executor retrieves the review; the orchestrator retrieves a name.** Nothing is asked of the reviewer, and no new artefact exists in the normal path.
2. **`Assisted-by:` carries the full route string** (`claude/opus/high`), supplied by the orchestrator in the goal.
3. **The inline surface is demoted, not deleted**, and the reviewer-authored file returns to being what the installed `herdr` skill already calls it: a fallback used after a failed read, never requested up front.
4. **Reviewer sessions start when the first candidate is frozen** and live until the run ends. Earlier would warm context but risk reviewing a moving target.
5. **The E2E actor gets its own tab.** The user specified topology only for executor and reviewers; E2E drives Docker and browsers and would obscure the reviewer panes. This is the single topology element not taken directly from the request.

**Assumptions recorded rather than asked about:**

1. **SDK bundling is not adopted; setup-time install is.** The user asked for brain-council-style bundling; `AGENTS.md` says the shipped tree is Markdown plus two dependency-free helpers, and `my-opinion.md` rejects building the flow on Agent SDKs. The conservative reading is that the user wants *the capability*, not *the mechanism*. If the mechanism is what is wanted, that is an amendment to the distribution contract plus a new `docs/architecture/` entry — above this proposal's authority.
2. **An executor in a Herdr-managed pane can call `herdr agent read` on a peer.** `HERDR_ENV` and the socket are injected into managed panes and agent commands accept a live agent name, so this follows from the documented model; fixture H15 proves it per provider before the design relies on it.
3. **Fallback files live outside the repository** and are never committed, consistent with the existing capture-file rule.

**Fixtures that gate the claims** (added to `docs/phase-0-fixtures.md`):

- **H13** — does `state_change_seq` increment exactly once per turn, per provider? Gates §3.3.
- **H14** — topology under an existing layout: an already-split orchestrator tab, and a pane too narrow for a right split.
- **H15** — the executor reads a peer reviewer's completed turn, per provider, at 200 / 800 / 1200 rows, including the negative case: an incoherent read must be reported as incoherent, not worked from.
- **H16** — cache economy: a warm round-two prompt versus a cold restart with the same instruction, per provider. Gates the claim in §4.
- **H17** — the fallback path: after a failed read, a reviewer-written file reaches the executor intact.

**File-by-file decomposition**, nine independently reviewable items: `shared/references/methodology.md` (§1 read budget and no-menus, §2.2 existence-only check with the semantic half delegated, §2.5 catalogue line, §4 goal text and candidate-vs-increments wording, §5 review round by name, §9 routing table, §11 backlog, new §12 Waiting) · `src/skills/mo-herdr/SKILL.md` (topology, transport ban, start prompt, the review round of §3.4) · `src/skills/mo-herdr/references/herdr-mechanics.md` (§1 gains the consuming-actor read; §2 refreshed from the protocol-19 schema; §3 unchanged, since nothing is asked of the reviewer) · `src/skills/mo-review/SKILL.md` (dispute routing by agent name; the reviewer prompt itself is untouched) · `src/skills/mo-setup/SKILL.md` (three contract clauses, SDK remediation) · `src/skills/mo-omnigent/SKILL.md` (parity on the backend-neutral parts: read budget, no menus, waiting, contract clauses) · `docs/architecture/full-turn-retrieval.md` (clarification that retrieval may be performed by the consuming actor) · new `docs/architecture/orchestrator-read-budget.md` · `docs/phase-0-fixtures.md` (H13–H17), plus this repository's own `AGENTS.md` and `CLAUDE.md`, which must change together or `make mo-qc` fails. `skills/` is rebuilt with `make skills` and never hand-edited.

