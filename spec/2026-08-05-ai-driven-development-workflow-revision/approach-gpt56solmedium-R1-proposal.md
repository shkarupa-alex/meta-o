# Meta‑O vNext: skills-first workflow без workflow engine

## 1. Краткий подход

Meta‑O vNext должен быть набором коротких skills, которые управляют Git, project commands и native interfaces выбранного backend — Herdr, Omnigent или Paseo. Текущий `meta-o` CLI, FSM, run state, adapters, receipts, digests, registries и service-style watchdog удаляются без compatibility layer; сохраняются сильный executor без methodology skill, обязательный reuse research, два независимых review, применимый E2E и проверка одного candidate commit.

Целевая архитектура — почти pure skills плюс один узкий private helper для model discovery и model preferences. Helper не запускает agents, не проксирует prompts и не участвует в lifecycle feature.

---

## 2. Сравнение трёх архитектурных уровней

### Полное сравнение по обязательным измерениям

| Измерение | 1. Почти pure skills | 2. Skills + строго ограниченные helpers | 3. Небольшой workflow engine |
|---|---|---|---|
| Пользовательский flow | Пользователь вызывает backend-specific orchestrator skill, подтверждает model set, далее наблюдает native sessions. При crash повторяет исходный вызов | Тот же flow; model set автоматически обнаруживается и редко требует ручной настройки | Пользователь запускает общий CLI/run, создающий state и управляющий lifecycle |
| Skills и scripts | 6 skills; custom scripts отсутствуют | Те же 6 skills; один private `model-discovery.mjs` | Skills становятся frontend над CLI, FSM, adapters, validators и state |
| Recovery | Новый orchestrator читает Git, spec, project files и native sessions; ambiguity эскалируется | То же; model preferences доступны после restart | Engine читает run state, pending operations и receipts; возможен reconcile |
| Review/E2E | Candidate commit, два независимых review, Markdown findings, conditional tester | То же | Structured findings, snapshots, attestations, gate receipts и registries |
| Нестандартные проекты | Агент напрямую использует весь backend/project CLI; contract обнаруживается динамически | То же; helper никак не ограничивает project flow | Новая ситуация часто требует расширить adapter/schema/CLI |
| Сопровождение | Низкое: тексты skills и backend examples | Низкое/среднее: дополнительно SDK-specific model discovery | Высокое: backend changes затрагивают adapters, FSM, schemas, recovery и tests |
| Гарантии | Нет exactly-once, automatic recovery и machine receipts; есть Git identity и проверка реальности | Те же workflow guarantees; плюс устойчивые model preferences | Возможны exactly-once/reconcile, но цена — собственная orchestration platform |

### Выбор

Рекомендуется уровень 2, но feature workflow в нём остаётся уровнем 1. Единственный helper обслуживает редко меняющиеся model preferences и не является частью управления feature.

Уровень 3 отклоняется. Его можно пересмотреть только если накоплены измеренные случаи, где одновременно выполняются условия:

1. Ошибка повторяется и существенно тратит человеческое время.
2. Git, spec и native session history недостаточны.
3. Native backend не может исправить проблему.
4. Skill-инструкция ненадёжна даже после проверки.
5. Требуемый invariant действительно нуждается в детерминированном runtime.
6. Предлагаемый код не скрывает полный backend interface.

---

## 3. Сохраняемые и отменяемые гарантии

### Сохраняются

- executor получает полную task/spec и работает до проверяемого candidate;
- Codex использует native `/goal`, когда surface позволяет доказать activation;
- executor не читает обязательный methodology skill;
- reuse research проводится до реализации в отдельном контексте;
- два первых review независимы;
- полные reviewer messages передаются без terminal truncation;
- применимый E2E обязателен;
- финальные QC, оба review и E2E относятся к одному commit;
- manual restart является нормальным recovery flow;
- backend запускает provider CLI через пользовательский PATH.

### Осознанно отменяются

- exact replay orchestrator context;
- exactly-once prompt delivery;
- automatic takeover;
- generation fencing;
- write-ahead backend operations;
- immutable spec copy и mutation detection;
- snapshot digest;
- rebase-stable attestations;
- gate receipts;
- structured Finding transport;
- mandatory detached worktrees;
- автоматическая классификация lifecycle phase;
- durable run state;
- гарантированная liveness watchdog.

Практический invariant «проверен один результат» сохраняется через Git commit SHA, а не через второй identity и receipt layer.

---

## 4. Архитектура

```text
User
  └─ one backend-specific orchestrator skill
      ├─ mo-orchestrate             → Herdr
      ├─ mo-orchestrate-omnigent    → Omnigent
      └─ mo-orchestrate-paseo       → Paseo
           │
           ├─ mo-reuse              → independent research session
           ├─ executor              → no methodology skill
           ├─ mo-review             → standalone review loop
           ├─ project QC / E2E      → Make or native task runner
           └─ mo-watchdog           → optional 1:1 observer
```

Общая методология является текстом. Общего executable backend adapter нет.

### Финальные skills

| Skill | Trigger | Вход | Выход | Ответственность |
|---|---|---|---|---|
| `mo-orchestrate` | Полный workflow через Herdr | Spec path, URL, task text или `continue` | Проверенный candidate commit | Управляет native `herdr agent/pane/worktree` |
| `mo-orchestrate-omnigent` | Полный workflow через Omnigent | То же | То же | Использует native harnesses, conversations, resume и export |
| `mo-orchestrate-paseo` | Полный workflow через Paseo | То же | То же | Использует `run`, `ls`, `logs`, `wait`, `send`, workspaces |
| `mo-reuse` | Всегда до implementation | Spec/task, repo и dependencies | Обновлённый `Reuse research` | Ищет готовые решения; не перепроектирует product scope |
| `mo-review` | Из orchestrator или напрямую | Artifact, acceptance source, revision | Два review verdict и fix loop | Универсальный review кода и non-code artifacts |
| `mo-watchdog` | Опционально | Backend + orchestrator locator | Наблюдение и уведомление | Не делает takeover и не мутирует state |

Имена намеренно сохраняют `mo-orchestrate` для основного Herdr flow. Альтернативы явно называют backend; generic router не создаётся.

### Отсутствующие компоненты

Не будет:

- executor skill;
- общего backend/session protocol;
- `SessionAdapter`;
- adjudicator skill;
- обязательного E2E skill;
- installer/updater;
- run-state schema;
- скрытой methodology dependency executor.

---

## 5. Feature lifecycle

### 5.1. Preflight

Orchestrator:

1. Получает spec/task или анализирует очевидную незавершённую работу.
2. При вызове без входа и без однозначного continuation спрашивает, что требуется сделать.
3. Читает:
   - Git branch, status и log;
   - feature-spec;
   - `AGENTS.md`, `CLAUDE.md` и связанные instructions;
   - `Makefile`;
   - затем `package.json`, `pyproject.toml` и native task-runner config.
4. Читает native backend skill/help и проверяет backend version.
5. Показывает компактный model set.
6. Показывает `command -v claude`, `command -v codex`, `command -v opencode`.
7. Не запускает worker, если backend обходит ожидаемый PATH wrapper.
8. Определяет применимые QC и E2E формы.

Orchestrator может читать проект и выполнять operational checks. Он не реализует feature и не заменяет двух reviewers.

### 5.2. Обязательный reuse research

`mo-reuse` запускается отдельной CLI/session context до executor.

```markdown
## Reuse research

- Existing project capabilities:
- Evaluated solutions:
  - Name, version/source:
  - Maintenance status:
  - Compatibility:
  - License:
  - Integration cost:
  - Limitations:
- Decision: reuse | extend | build
- Chosen solution and rationale:
- Constraints, risks and rejected alternatives:
```

Правила:

- researcher меняет только этот раздел;
- product behavior, scope и approved constraints не меняются;
- tracked spec фиксируется первым отдельным spec-only commit;
- executor получает дополненную read-only spec;
- reviewers проверяют, что решение не проигнорировано;
- отклонение требует убедительного технического rationale.

Для task, изначально заданной текстом:

- используется существующий project convention для specs;
- при его отсутствии создаётся `spec/<date>-<slug>.md`;
- файл содержит исходную task и `Reuse research`;
- это обычный readable project artifact, не immutable blob и не run state;
- он фиксируется spec-only commit.

Для внешней spec, которую нельзя или не следует помещать в repo, создаётся обычная соседняя `<name>.researched.md`. Она передаётся executor по path без digest protocol.

### 5.3. Executor

Executor получает:

- path к обновлённой spec/task;
- native goal или явно более слабый completion-oriented prompt;
- обычные project instructions;
- полный native tool/skill catalog;
- последующие полные review/E2E messages.

До первого candidate executor обязан:

1. Прочитать всю spec и project instructions.
2. Реализовать полный scope.
3. Применить reuse decision либо оставить durable rationale отклонения.
4. Обновить durable project knowledge.
5. Выполнить typecheck, lint, tests, build и применимую console smoke.
6. Создать чистый candidate commit.

### 5.4. Candidate contract

```ts
type CandidateRef = {
  repoRoot: string;
  branch: string;
  commitOid: string;
  specLocator: string;
};
```

`CandidateRef` передаётся в prompts и native messages, но не сохраняется как runtime JSON.

Lifecycle:

1. Executor создаёт `C1`.
2. Orchestrator передаёт полный SHA `C1` обоим reviewers и tester.
3. `C1` не меняется во время gates.
4. Fixes создают новый commit `C2`.
5. Проверки, которые могли быть затронуты, повторяются на `C2`.
6. Completion возможен, только если один финальный SHA прошёл:
   - aggregate QC;
   - оба reviews;
   - применимый E2E.

Если нельзя доказать, какой commit проверял actor, его результат не считается gate.

### 5.5. Worktrees

Default — текущая feature branch и commit discipline.

Native worktree создаётся, когда:

- reviewers работают параллельно с потенциально меняющимся worktree;
- E2E нужен isolated environment;
- backend уже предоставляет workspace/worktree;
- project setup допускает воспроизводимую изоляцию.

Используются `git worktree`, `herdr worktree` или Paseo workspace напрямую. Собственный helper не создаётся.

---

## 6. Executor goal lifecycle

Рекомендуемый lifecycle:

- feature-level goal действует до executor-owned candidate;
- independent review и E2E проходят без active executor continuation;
- fix batches отправляются follow-up turns в той же session;
- новая короткая goal используется только для большого самостоятельного fix batch.

Это предотвращает premature completion начальной реализации, но не заставляет executor продолжать работу, пока он должен ждать независимых gates.

### Initial goal

```text
Read the complete task at <SPEC_PATH> and all applicable project instructions
before changing code.

Deliver the full approved scope, not an MVP or a convenient subset. Preserve
all architecture, compatibility and project constraints stated in the task.
Do not defer difficult required work unless an external blocker makes it
impossible.

Before completing:
- implement the complete required behavior;
- follow the recorded Reuse research decision or leave durable technical
  rationale for a necessary deviation;
- update durable project knowledge where the implementation establishes stable
  facts;
- run all applicable typecheck, lint, test, build and QC commands;
- run a short deterministic E2E smoke when applicable;
- produce a clean reviewable Git candidate commit.

Continue autonomously until this executor-owned definition of done is met or a
real needs_attention blocker exists.
```

Большая spec не копируется inline, если доступна по path.

### Herdr

- Codex стартует интерактивно командой `codex`, найденной через PATH.
- `/goal` вводится через native interactive input, а не через framed prompt.
- Предпочтителен key-level ввод с отдельным Enter.
- Присутствие строки `/goal` в `herdr agent prompt` не является доказательством.
- Orchestrator проверяет visible goal UI/status.
- Если activation невозможно подтвердить, применяется weaker fallback.

### Omnigent

- Для native goal используется Codex native TUI harness.
- `/goal` вводится в интерактивную Codex surface.
- `omnigent run ... -p` считается обычным prompt, не goal activation.
- Resume выполняется через persisted native conversation.
- Direct non-TUI harness использует fallback.

Omnigent сохраняет conversations, поддерживает несколько coding harnesses, subagents, UI и export; эти primitives используются непосредственно. [Omnigent](https://github.com/omnigent-ai/omnigent)

### Paseo

- Используется версия с native Codex `/goal` support.
- Slash command передаётся через поддерживаемый interactive path.
- Activation подтверждается native timeline/UI.
- Обычный успешный `send` сам по себе недостаточен.
- `run`, `ls`, `logs`, `wait`, `send` и workspace operations используются напрямую.

Перед работой читаются native Paseo skills и CLI docs. [Paseo CLI](https://paseo.sh/docs/cli), [Paseo repository](https://github.com/getpaseo/paseo)

### Fallback

Для Claude Code, OpenCode и неподдерживаемой Codex surface:

- одна persistent executor session;
- completion-oriented initial prompt;
- orchestrator проверяет premature idle;
- незавершённый scope вызывает конкретный follow-up;
- session продолжается через native resume.

Это явно более слабая гарантия, чем persisted automatic goal. Новый FSM для её эмуляции запрещён.

Официальная документация описывает `/goal` в ChatGPT desktop app, interactive Codex CLI и IDE extension; goal одновременно является first prompt и completion criteria и не расширяет permissions. [OpenAI long-running work](https://learn.chatgpt.com/docs/long-running-work)

---

## 7. Backend capabilities

| Возможность | Herdr | Omnigent | Paseo |
|---|---|---|---|
| Native status | Available | Available через conversations/UI | Available через `ls` |
| Полный transcript | Ограничен terminal semantics | Available через export/history | Available через `logs` timeline |
| Полный reviewer turn | Scrollback или verbatim file export | Последнее assistant message из export | Последнее assistant event полного timeline |
| Context fill | Unavailable на Herdr layer | Harness-specific | UI/events; structured CLI требует version check |
| Last-turn time | Inferred | Available в history | Available |
| Compaction signals | Agent-specific | Harness-specific | Codex/OpenCode events |
| Resume | Persistent session | Native conversation resume | Existing agent/workspace |
| Codex goal | Interactive, требует проверки | Native Codex TUI | Native support, version-gated |
| Cache TTL/cold-resume price | Unavailable | Unavailable | Unavailable |
| PATH preservation | Canonical command через PATH | PATH должен выиграть resolver | Provider CLI через PATH |

### Context и cache policy

- Старая session продолжается, пока она coherent и backend не показывает pressure.
- Native compact вызывается только по реальному signal или наблюдаемой деградации.
- Fresh actor создаётся после неудачной compaction, противоречивого context или когда task/spec + Git reality проще восстановления.
- Искусственные turns ради cache warmth запрещены.
- Provider-specific thresholds не переносятся между backends.
- Общий cache tracker не создаётся.

### Получение полного reviewer output

#### Herdr

1. Читать `recent-unwrapped` с достаточным scrollback.
2. Не считать фиксированный tail полным сообщением.
3. При потере alternate-screen output попросить reviewer записать предыдущее сообщение verbatim в Markdown-файл.
4. Прочитать файл полностью.
5. Ручное открытие session допустимо как fallback.

#### Omnigent

1. Экспортировать native conversation.
2. Выбрать последнее завершённое assistant message reviewer.
3. Не извлекать authoritative result из terminal pane.
4. При отсутствии export использовать native conversation UI/API или file export.

#### Paseo

1. Читать полный `paseo logs <agent>` timeline.
2. Найти последнее завершённое assistant event.
3. Не использовать `--tail N` как authoritative transport.
4. При неустойчивой event boundary использовать verbatim Markdown export.

---

## 8. Standalone `mo-review`

### Boundary contract

```ts
type ReviewInput = {
  artifact: string;
  acceptanceSource?: string;
  revision?: string;
  projectInstructions?: string[];
  reviewLenses?: string[];
};

type ReviewOutcome =
  | { kind: "pass"; revision: string; fullMessages: string[] }
  | { kind: "changes_requested"; revision: string; fullMessages: string[] }
  | { kind: "needs_attention"; reason: string; evidence?: string };
```

Это описание смысловых границ, не обязательная JSON schema.

Рекомендуемый reviewer response:

```markdown
## Verdict

PASS | CHANGES REQUESTED

## Findings

### <short title>

- Impact:
- Evidence:
- Why it matters:
- Suggested fix:

## Residual risks
```

### Loop

1. Два reviewers независимо получают artifact и acceptance source.
2. Первый проход не показывает им findings друг друга.
3. Каждый проверяет:
   - completeness;
   - correctness;
   - architecture и необходимость abstractions;
   - reuse decision;
   - failure handling;
   - purpose;
   - durable knowledge;
   - QC/E2E adequacy.
4. Полные ответы передаются автору почти verbatim.
5. После fixes оба reviewers проверяют новую revision.
6. PASS обоих должен относиться к одной revision.

### Non-code artifacts

Для spec, документа, таблицы или презентации:

- code lenses отключаются;
- identity задаётся commit, file version или явно названной artifact revision;
- проверяются полнота, смысл, consistency, structure и artifact-specific quality;
- full feature state и E2E lifecycle не требуются.

### Споры

1. Reviewer проверяет rebuttal автора.
2. Второй reviewer получает конкретный finding, rebuttal и evidence.
3. Orchestrator решает обратимый технический спор.
4. Пользователь привлекается только при product ambiguity, необратимом действии или существенном остаточном риске.

Отдельный adjudicator не нужен.

### Subagents

- маленький diff/spec: 0;
- средний: 2–4 lenses;
- крупный: до 6;
- duplication и fan-out контролируются reviewer;
- оценивается итог review, а не ritual count.

---

## 9. Model discovery и settings

Runtime state удаляется, но редко меняющиеся model preferences сохраняются отдельно.

```text
~/.meta-o/
  settings.json
  projects/
    <sha256(realpath(project-root))>.json
  model-catalog.json
```

В этих файлах запрещены:

- run IDs;
- phase/progress;
- candidate commits;
- session locators;
- findings;
- gate status;
- E2E results.

### Data models

```ts
type Route = "claude" | "codex" | "opencode";

type ModelRef = {
  route: Route;
  model: string;
  vendor: string;
  lineId?: string;
  release?: string;
  effort?: string;
  providerId?: string;
};

type ModelPreferences = {
  schemaVersion: 1;
  roleModels: Partial<Record<
    | "reuseResearcher"
    | "executor"
    | "reviewerPrimary"
    | "reviewerCrossVendor"
    | "e2eTester"
    | "watchdog",
    ModelRef
  >>;
  updatedAt: string;
};

type CatalogEntry = ModelRef & {
  sources: string[];
  lastSeenAt: string;
  recentlyUsed: boolean;
};

type SuccessorSuggestion = {
  current: ModelRef;
  successor: ModelRef;
  confidence: "high";
  reason: string;
};
```

### Private helper API

```ts
discoverModels(options: {
  projectRoot: string;
  lookbackDays: 30;
  recentSessionLimit: 10;
}): Promise<CatalogEntry[]>;

loadPreferences(projectRoot: string): Promise<ModelPreferences | null>;

savePreferences(
  projectRoot: string,
  preferences: ModelPreferences
): Promise<void>;

suggestSuccessors(
  selected: ModelRef[],
  catalog: CatalogEntry[]
): SuccessorSuggestion[];
```

Ошибки:

- `TOOL_NOT_FOUND`: route пропускается.
- `DISCOVERY_UNAVAILABLE`: используются recent sessions и сохранённая модель.
- `AUTH_UNAVAILABLE`: route показывается недоступным; worker не проксируется.
- `CORRUPT_SETTINGS`: файл сохраняется как backup, применяется default.
- `AMBIGUOUS_LINEAGE`: upgrade не предлагается.

### Отдельное обоснование `model-discovery.mjs`

| Проверка необходимости | Ответ |
|---|---|
| Какая операция ненадёжна через prompt? | Сбор нескольких каталогов/history, deduplication одинаковых effective models и сравнение release lineage |
| Почему skill с CLI examples недостаточен? | Результат должен быть устойчивым при разных source formats и повторных запусках |
| Какие invariants гарантируются? | Никаких worker launches; dedupe по effective identity; только high-confidence successor; atomic settings write |
| Как часто нужен отход от happy path? | Новый provider/SDK потребует отдельный discovery adapter внутри helper; workflow не меняется |
| Является ли helper proxy API? | Нет: он не принимает prompts, не создаёт sessions и не вызывает orchestration backend |
| Стоимость сопровождения | Один SDK-specific reader на route и unit tests lineage/dedupe; failure деградирует до сохранённого default |

Это единственный custom executable в baseline vNext.

### Model upgrade

Suggestion показывается, только если:

- совпадают vendor и подтверждённый `lineId`;
- release строго новее;
- successor доступен через тот же route;
- это не preview или ambiguous alias;
- предложение ещё не было подавлено для текущего catalog.

Catalog обновляется не чаще раза в сутки. Повторное предложение можно подавлять на 30 дней или до изменения catalog.

Выбор хранения: global default + редкий project override.

---

## 10. Human attention policy

Обязательные user gates:

- product meaning или scope меняется;
- действие необратимо либо дорого во внешней системе;
- затрагиваются production data или credentials;
- отсутствует внешний доступ;
- технический спор фактически является продуктовым;
- model set при первом интерактивном запуске существенно меняет subscription route.

Не требуют user gate:

- чтение и запуск project tools;
- выбор обратимой implementation detail;
- использование очевидного существующего Make target;
- добавление согласованного alias target в scope feature;
- повторный QC/review после fixes;
- continuation executor после premature idle;
- сохранение ранее подтверждённого model set при restart.

---

## 11. Project QC contract

### Discovery

Сначала используются существующие Make targets, package scripts, workspace runner и tool configs.

Для Make-проекта рекомендуются:

```text
mo-qc
mo-lint
mo-typecheck
mo-test
mo-build
mo-smoke
mo-e2e
```

Правила:

- `mo-qc` — рекомендуемый aggregate target;
- остальные существуют только когда применимы;
- aliases вызывают существующие команды;
- executor, а не orchestrator, добавляет aliases;
- очевидный equivalent используется без gate;
- ambiguous semantic mismatch эскалируется;
- в проекте без Make mapping фиксируется в project instructions.

Agent-required `mo-e2e` печатает `AGENT_REQUIRED`, instructions и завершает работу кодом 2. Он не считается успешным E2E.

### Python profile

- Ruff format/lint и complexity rules;
- существующий mypy или Pyright;
- pytest;
- Import Linter для boundaries/cycles;
- Interrogate для docstring presence;
- reviewers для semantic purpose.

Import Linter уже поддерживает forbidden, layers, independence и acyclic sibling contracts. [Import Linter](https://import-linter.readthedocs.io/en/latest/)

Interrogate проверяет docstring coverage, включая private symbols при соответствующей конфигурации, но не semantic adequacy. [Interrogate](https://interrogate.readthedocs.io/en/latest/)

### TypeScript compatibility profile

Default для existing projects:

- существующий package manager/workspace runner;
- `tsc --noEmit`, `tsc -b` или existing framework checker;
- ESLint flat config;
- `typescript-eslint` `recommendedTypeChecked` и `projectService`;
- существующий test runner;
- optional `eslint-plugin-jsdoc`;
- Prettier отдельно, с `eslint-config-prettier`.

[TypeScript `noEmit`](https://www.typescriptlang.org/tsconfig/noEmit.html), [TypeScript `strict`](https://www.typescriptlang.org/tsconfig/strict.html), [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/)

### TypeScript fast profile

Opt-in для greenfield или совместимого TS7-проекта:

- отдельный `tsc`;
- type-aware Oxlint;
- существующий test runner.

Oxlint type-aware не является основанием удалять отдельный typecheck или автоматически мигрировать существующий ESLint stack. [Oxlint type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)

### Greenfield tests

- `node:test`: Node-only и низкая dependency surface;
- Vitest: Vite/frontend/DOM, richer mocking/watch/coverage;
- существующий Jest не мигрируется.

Runtime TypeScript test execution не заменяет typecheck. [Node test runner](https://nodejs.org/api/test.html), [Vitest](https://vitest.dev/guide/)

### Code-health guidance

Начальные ориентиры:

- cyclomatic complexity: warning 10, error 15;
- function length: warning 60–80 строк;
- file size: warning 400–500 строк;
- statements: warning 30–40.

Исключения задаются для generated, declarations, migrations и declarative config. Tests получают более мягкие thresholds, а не blanket exemption.

ESLint `complexity`, `max-lines`, `max-lines-per-function` и `max-statements` используются до custom AST code.

---

## 12. Purpose, architecture и knowledge

### Layout

```text
docs/
  business.md
  glossary.md
  todo.md
  architecture/
  e2e.md
```

При нескольких независимых E2E groups:

```text
docs/e2e/
  index.md
  <scenario-group>.md
```

### Knowledge sync

Knowledge sync означает перенос только устойчивых фактов, которые реализация сделала частью проекта:

- business behavior → `docs/business.md`;
- terms → `docs/glossary.md`;
- boundaries, invariants, rationale → `docs/architecture/`;
- локальный causal context → purpose/comment рядом с кодом;
- debt вне scope → `docs/todo.md`.

Spec целиком не копируется. После завершения она архивируется или удаляется по project convention после переноса устойчивого смысла.

`KnowledgeImpactPlan` не нужен.

### Project architecture instructions

Canonical подробные принципы хранятся в:

```text
docs/architecture/development-principles.md
```

`AGENTS.md` и `CLAUDE.md` содержат короткое одинаковое требование прочитать этот файл и несколько безусловных правил. Generator или synchronization runtime не создаётся.

Reviewers проверяют:

- границы ответственности;
- допустимые dependencies;
- независимость компонентов;
- god-files/god-objects;
- лишние abstractions;
- интеграцию в существующую архитектуру;
- возможность удалить устаревшие обходы в scope.

### Purpose contract

Purpose объясняет:

- зачем существует сущность;
- её роль в системе;
- сохраняемый invariant или causal context;
- последствия удаления или изменения.

Coverage:

- modules, exported/public API, classes и architectural boundaries — всегда;
- private/test symbols — если они нетривиальны или кодируют domain/fixture invariant;
- overload declarations — без автоматического исключения;
- generated/vendor code, тривиальные accessors и очевидный framework glue — project-level exclusions.

Mechanical tools проверяют наличие и форму. Reviewers проверяют causal meaning, cargo-cult text и drift.

Markdown checker в baseline отсутствует. Если появится доказанный structural invariant, используется Markdown AST parser, не regex.

---

## 13. E2E

| Форма | Исполнитель | Contract |
|---|---|---|
| Короткая console/shell smoke | Executor | Детерминированная команда; может входить в `mo-qc` |
| Agentic benchmark | Отдельный tester | Commands, selection, output и cleanup описаны текстом |
| Browser E2E | Отдельный tester | Читает `agent-browser` skill и релевантную scenario group |

Отдельный tester не создаётся для lint, unit/integration tests или короткой smoke.

`e2e.json` удаляется: у него нет внешнего machine consumer. Markdown scenarios, Make help, command output и commit SHA достаточны.

---

## 14. Recovery, status и permissions

### Manual recovery

Новый orchestrator:

1. Перечитывает task/spec.
2. Проверяет branch, worktree и Git log.
3. Находит candidate commits.
4. Читает Make/task-runner interface.
5. Находит native backend sessions.
6. Читает полные последние outputs.
7. Определяет ближайший очевидный шаг.
8. При противоречии задаёт один конкретный вопрос.

Exact session replay не обещается.

### User-facing status

- `idle`: пользовательское внимание не требуется;
- `needs_attention`: question, approval, blocker, error или непонятный native status после проверки.

Native backend statuses не копируются в отдельную taxonomy или state file.

### PATH

Backend запускает только canonical commands:

```text
claude
codex
opencode
```

Запрещено:

- искать Homebrew/app binary;
- обходить wrapper absolute path;
- копировать permission flags в settings;
- проксировать worker через собственный LLM API.

Preflight показывает resolved path. Backend-specific path overrides, обходящие пользовательский wrapper, считаются configuration failure.

---

## 15. `mo-watchdog`

Baseline:

```text
one watchdog session → one orchestrator session
```

Watchdog:

- знает backend и native locator orchestrator;
- читает native status/output;
- сообщает о `needs_attention`, неожиданном длительном idle или смерти orchestrator;
- может отправить сообщение живому orchestrator;
- не делает takeover;
- не запускает feature;
- не мутирует Git или state;
- не наблюдает несколько projects.

LLM watchdog может сам остановиться; это принятое ограничение. Service units и custom runtime отсутствуют.

---

## 16. Reflection и durable rationale

Reflection запускается, если:

- root cause повторился;
- defect прошёл QC/review и обнаружился в E2E или production-like verification;
- повторный cycle выявил отсутствующий системный contract;
- backend/tooling failure регулярно расходует человеческое время.

```markdown
- Area/path:
  Problem or incident:
  Why earlier checks missed it:
  Practical risk:
  Proposed follow-up:
```

Запись помещается в `docs/todo.md`. Пользователь решает, брать ли её в работу.

Отклонённый substantive finding требует комментария рядом с кодом, если:

- причина конструкции не очевидна;
- constraint сохранится;
- будущий reviewer иначе повторит тот же спор.

Комментарий объясняет `why`, constraint и rejected safer alternative. Вкусовые suggestions не документируются.

---

## 17. Tooling audit по семействам

| Компонент | Решение | Замена |
|---|---|---|
| Public `meta-o` CLI | Delete | Skills, Git, project/native CLI |
| FSM/routing | Delete | Orchestrator reasoning |
| Runtime state | Delete | Git/spec/native sessions |
| Model preferences | Replace with smaller helper | `model-discovery.mjs` + settings |
| Findings/decisions/gates | Delete | Full messages, code rationale, `docs/todo.md` |
| Snapshot/metadata guards | Delete | Candidate SHA |
| Worktree helpers | Replace with direct CLI | Git/backend workspaces |
| Herdr adapter | Delete | Native Herdr |
| `SessionAdapter` | Delete | Three direct skills |
| Capability suite | Delete | Minimal preflight |
| `execute-feature` | Delete | Spec, goal, project instructions, QC/review |
| `research-reuse` | Replace | `mo-reuse` |
| `review-feature` | Replace | `mo-review` |
| `adjudicate-technical` | Delete | Targeted second-reviewer arbitration |
| `test-e2e` | Move into skills/reference | Conditional tester flow |
| Context/cache tracker | Delete | Native signals |
| Installer/updater | Delete | APM/skills |
| Watchdog runtime/services | Replace with skill | `mo-watchdog` |
| QC manifest/results | Delete | Exit codes + full output |
| Knowledge impact plan | Delete | Direct knowledge sync |
| E2E/adoption/verification metadata | Delete | Docs + candidate SHA |
| Baseline | Defer | Thresholds first |
| Custom import graph | Delete | Import Linter |
| Markdown regex parsing | Delete | No checker; AST if later justified |
| Knowledge checker | Delete | Review |
| Lessons ledger | Delete | `docs/todo.md` |
| Handoff protocol | Delete | Git/spec/session reality |

---

## 18. Полный audit текущих `.mjs`

Все файлы под `dist/` являются generated runtime текущей архитектуры. Verdict относится и к их TypeScript/source counterparts: generated artifact не сохраняется, если удаляется исходный компонент.

### Adapters

| Файлы | Verdict | Покрытие функции |
|---|---|---|
| `dist/adapters/adapter.mjs` | Delete | Общий adapter interface не нужен |
| `dist/adapters/capability-suite.mjs` | Delete | Native help/version/path preflight |
| `dist/adapters/herdr-evidence.mjs` | Delete | Full Herdr output или file export |
| `dist/adapters/herdr-output.mjs` | Delete | Прямой `herdr agent read` |
| `dist/adapters/herdr-protocol.mjs` | Delete | Native Herdr protocol |
| `dist/adapters/herdr-stop.mjs` | Delete | Native stop/terminal controls |
| `dist/adapters/herdr.mjs` | Delete | `mo-orchestrate` вызывает Herdr напрямую |

### CLI entrypoints и infrastructure

| Файл | Verdict | Покрытие функции |
|---|---|---|
| `dist/cli/meta-o.mjs` | Delete | Skills являются public interface |
| `dist/cli/args.mjs` | Delete | Нет общего CLI |
| `dist/cli/repo-json.mjs` | Delete | Нет JSON workflow transport |
| `dist/cli/watchdog-main.mjs` | Delete | `mo-watchdog` agent session |

### CLI command modules

| Файл | Verdict | Покрытие функции |
|---|---|---|
| `dist/cli/commands/backend.mjs` | Delete | Backend-specific skills |
| `candidate-guards.mjs` | Delete | Candidate SHA rule |
| `decisions.mjs` | Delete | Code/docs rationale |
| `findings-cli.mjs` | Delete | Full Markdown messages |
| `gate-evidence.mjs` | Delete | Git SHA + command output |
| `gate-order.mjs` | Delete | Orchestrator skill |
| `gates.mjs` | Delete | QC/review/E2E flow |
| `ownership.mjs` | Delete | Role responsibility in skill |
| `preflight-cli.mjs` | Delete | Inline skill preflight |
| `project.mjs` | Delete | Git root/project files |
| `results.mjs` | Delete | Native outputs |
| `run-context.mjs` | Delete | Task/spec/Git reality |
| `run-start.mjs` | Delete | Skill invocation |
| `run.mjs` | Delete | Нет run object |
| `session-state.mjs` | Delete | Native backend state |
| `session.mjs` | Delete | Native backend CLI |
| `watchdog-cli.mjs` | Delete | `mo-watchdog` |
| `watchdog-home.mjs` | Delete | Нет watchdog home/config |
| `weakening.mjs` | Delete | Removed guarantees documented in spec |
| `write-ahead.mjs` | Delete | Exactly-once/reconcile не являются целью |

### Core modules

| Файл | Verdict | Покрытие функции |
|---|---|---|
| `dist/core/adoption.mjs` | Delete | Dynamic project discovery |
| `canonical-json.mjs` | Delete | Нет signed/canonical workflow JSON |
| `clock.mjs` | Delete | Нет workflow timestamps/state |
| `config.mjs` | Delete | Только отдельные model preferences |
| `e2e-registry.mjs` | Delete | Markdown E2E docs |
| `e2e-result.mjs` | Delete | Full tester message + SHA |
| `findings.mjs` | Delete | Markdown review transport |
| `fsm.mjs` | Delete | Orchestrator reasoning |
| `git.mjs` | Delete | Прямой Git CLI |
| `hash.mjs` | Delete | Snapshot/spec hashing не нужен |
| `knowledge-files.mjs` | Delete | Явный docs layout |
| `knowledge.mjs` | Delete | Executor + review |
| `markdown.mjs` | Delete | Baseline Markdown checker отсутствует |
| `model-set.mjs` | Replace, do not retain | Новый узкий `model-discovery.mjs`; старый workflow coupling удаляется |
| `module-anchors.mjs` | Delete | Обязательные anchor chains удаляются |
| `paths.mjs` | Delete | Нет общего runtime layout |
| `policy.mjs` | Delete | Project instructions и skills |
| `preflight.mjs` | Delete | Backend skill выполняет короткий preflight |
| `project-key.mjs` | Replace, do not retain | Минимальная функция hash(realpath) внутри model helper |
| `qc.mjs` | Delete | Make/native commands |
| `redact.mjs` | Delete | Нет transcript/state persistence |
| `role-view.mjs` | Delete | Native status, collapsed textual view |
| `safe-fs.mjs` | Replace, do not retain | Минимальный atomic write только внутри model helper |
| `snapshot.mjs` | Delete | Commit SHA |
| `spec-input.mjs` | Delete | Обычный path/text input |
| `state-store.mjs` | Delete | Runtime state отсутствует |
| `types.mjs` | Delete | Нет общего workflow domain model |
| `worktree.mjs` | Delete | Direct Git/backend worktree commands |

`model-set.mjs`, `project-key.mjs` и `safe-fs.mjs` не переносятся как существующие modules: из них не сохраняется public API или workflow coupling. Нужные несколько операций реализуются заново внутри ограниченного model helper.

### Watchdog runtime

| Файл | Verdict | Покрытие функции |
|---|---|---|
| `dist/watchdog/classifier.mjs` | Delete | Watchdog agent интерпретирует native state |
| `dist/watchdog/decide.mjs` | Delete | Нет deterministic takeover policy |
| `dist/watchdog/watchdog.mjs` | Delete | `mo-watchdog` session |

### Quality scripts

| Файл | Verdict | Покрытие функции |
|---|---|---|
| `quality/bootstrap.mjs` | Delete | Project package manager/config |
| `quality/code-health.mjs` | Replace with native tools | Ruff/ESLint/Oxlint rules |
| `quality/format-check.mjs` | Replace with native tools | Ruff, Prettier, Biome или existing formatter |
| `quality/import-graph.mjs` | Delete | Import Linter |
| `quality/lint.mjs` | Replace with direct commands | Native linter |
| `quality/purpose-check.mjs` | Replace with existing tools + review | Interrogate, eslint-plugin-jsdoc, semantic review |
| `quality/run-qc.mjs` | Delete | `make mo-qc` или native aggregate script |
| `quality/run-tests.mjs` | Delete | pytest, node:test, Vitest, Jest |
| `quality/verify-e2e-metadata.mjs` | Delete | E2E Markdown + candidate SHA |

### Test fixture

| Файл | Verdict | Покрытие функции |
|---|---|---|
| `tests/fixtures/fake-herdr.mjs` | Delete | Adapter/capability tests удаляются; skill acceptance использует disposable native sessions |

### Единственный новый `.mjs`

| Файл | Verdict |
|---|---|
| `dist/skills/_private/model-discovery.mjs` | Add only after SDK capability spike confirms inputs; no workflow/session APIs |

Если discovery можно достаточно надёжно реализовать непосредственными официальными CLI без dedupe/cache code, этот helper также не создаётся и vNext остаётся уровнем 1.

---

## 19. Distribution

```text
dist/
  skills/
    mo-orchestrate/
      SKILL.md
      references/
        workflow.md
        herdr.md
        goal.md
    mo-orchestrate-omnigent/
      SKILL.md
      references/
        workflow.md
        omnigent.md
        goal.md
    mo-orchestrate-paseo/
      SKILL.md
      references/
        workflow.md
        paseo.md
        goal.md
    mo-reuse/
      SKILL.md
      references/
        research-checklist.md
    mo-review/
      SKILL.md
      references/
        review-lenses.md
    mo-watchdog/
      SKILL.md
    _private/
      model-discovery.mjs
  README.md
  LICENSE
```

Каждый installable skill self-contained. Короткий common workflow reference может повторяться в package directories; executable shared adapter не создаётся.

APM распознаёт `skills/<name>/SKILL.md`, а `npx skills add` устанавливает отдельный skill или repository bundle. [Microsoft APM](https://github.com/microsoft/apm), [Vercel skills](https://github.com/vercel-labs/skills)

`install.sh`, `update.sh`, post-install capability suite и service installation отсутствуют.

---

## 20. Implementation и migration plan

### Этап 1. Authoritative specification

- Написать компактную master-spec.
- Зафиксировать removed guarantees.
- Добавить decision ledger.
- Зафиксировать helper admission test.
- Не изменять реализацию до утверждения spec.

### Этап 2. Pure-skills baseline

Реализовать:

1. `mo-reuse`;
2. `mo-review`;
3. `mo-orchestrate` для Herdr;
4. `mo-orchestrate-omnigent`;
5. `mo-orchestrate-paseo`;
6. `mo-watchdog`.

На этом этапе model selection может использовать сохранённый textual default и native discovery вручную.

### Этап 3. Backend validation

На disposable sessions проверить:

- Herdr `/goal` input и observable activation;
- Omnigent native Codex TUI goal/resume;
- Paseo goal, continuation и log event boundary;
- full reviewer output;
- PATH wrappers;
- context/compaction signals;
- manual recovery после остановки orchestrator.

Неподтверждённая capability переводится в fallback.

### Этап 4. Helper admission

Перед реализацией `model-discovery.mjs`:

- зафиксировать реальные Claude/Codex/OpenCode discovery sources;
- убедиться, что native CLI вызовов без кода недостаточно;
- определить effective-model identity;
- проверить отсутствие worker/session launch APIs.

Если доказательство не получено, helper не создаётся.

### Этап 5. QC profiles

- Python reference profile;
- TypeScript compatibility profile;
- TypeScript fast profile;
- Make/native task-runner examples;
- purpose and architecture review lenses.

### Этап 6. Destructive migration

Без compatibility adapters удалить:

- current public CLI;
- FSM/state/spec store;
- adapters;
- receipts/snapshots/registries;
- watchdog runtime и units;
- custom quality scripts, заменённые native tools;
- старые executor/reviewer/adjudicator skills;
- installer/update scripts;
- tests исключительно удалённого control layer;
- generated `dist` artifacts этих компонентов.

### Этап 7. Acceptance

Проверить три независимых flows:

- Herdr;
- Omnigent;
- Paseo.

Для каждого:

- new feature;
- manual restart;
- full reviewer output;
- candidate invalidation после fixes;
- applicable E2E;
- PATH wrapper preservation.

Self-hosting следующих улучшений запускается только по решению пользователя.

---

## 21. Риски и mitigations

| Риск | Mitigation |
|---|---|
| Skills становятся пересказом CLI | Lifecycle decisions + несколько examples; обязательное чтение native skill/help |
| Backend skills расходятся | Общий semantic acceptance checklist |
| `/goal` превращается в текст | Surface-specific activation и visible verification |
| Reviewer output обрезан | Full transcript API или verbatim file export |
| Gates проверяют разные revisions | Full candidate SHA; invalidation после fixes |
| Reuse превращается в ритуал | Обязательные evaluated alternatives, license и integration cost |
| Model helper растёт в launcher | Запрет prompt/session/backend imports |
| Purpose становится cargo-cult | Mechanical presence + semantic review |
| Worktrees осложняют environment | Они conditional, не default |
| Watchdog создаёт ложную уверенность | Никакой liveness guarantee или takeover |
| Recovery делает неверный inference | Использовать только observable Git/spec/session facts |
| Общий textual reference разъезжается | Cross-backend acceptance scenarios |
| `docs/todo.md` становится ledger | Только actionable failures с risk и expected fix |
| Wrapper bloat возвращается под именем helper | Обязательный admission test для каждого executable |

---

## 22. Decision ledger

### Принято

- skills-first;
- executor без methodology skill;
- три direct backend skills;
- mandatory reuse research;
- native goal с доказанной activation;
- persistent-session fallback;
- standalone `mo-review`;
- candidate commit identity;
- conditional tester;
- minimal model preferences;
- optional 1:1 watchdog;
- existing project/tool interfaces first;
- APM/skills distribution.

### Отклонено

- public workflow CLI;
- FSM и run state;
- backend adapter;
- structured findings;
- snapshot digest;
- mandatory worktrees;
- immutable spec store;
- automatic crash recovery;
- manifests/registries;
- custom import graph;
- deterministic watchdog baseline;
- installer/updater;
- fixed subagent count;
- separate adjudicator;
- handoff artifact.

### Отложено

- deterministic watchdog runtime;
- machine-readable E2E registry;
- brownfield baseline;
- custom shared purpose checker;
- global architecture hygiene audit;
- cache economics automation.

---

## 23. Implementation assumptions

- Backend capabilities проверяются по установленной версии, а не переносятся из старой spec.
- Herdr `/goal` требует disposable activation test; до него действует fallback.
- В Omnigent native Codex TUI является baseline surface для `/goal`.
- Paseo event schema проверяется по установленной версии.
- Purpose semantics остаются reviewer responsibility.
- Task без spec материализуется в обычную tracked working spec.
- `model-discovery.mjs` условен: он появляется только после отдельного reuse/capability proof.
- Global architecture audit не входит в feature workflow.

---

## 24. Pre-mortem против нового control layer

Каждый новый executable обязан до реализации ответить:

1. Какой наблюдаемый failure он предотвращает?
2. Почему native CLI и skill недостаточны?
3. Какой deterministic invariant он гарантирует?
4. Кто является consumer результата?
5. Какой ущерб происходит без него?
6. Как часто нужен non-happy path?
7. Ограничивает ли он native interface?
8. Что сломается при изменении backend CLI?
9. Можно ли сначала измерить failure?
10. Можно ли удалить executable без изменения смысла workflow?
11. Имеет ли он imports или commands для prompt/session/worker launch?
12. Не создаёт ли он новый state только потому, что уже существует `~/.meta-o`?

Без конкретного failure, consumer и invariant предложение остаётся skill-инструкцией, прямой CLI-командой либо отклоняется.