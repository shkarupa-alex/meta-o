# Предложение: Meta‑O vNext — skills-first workflow без workflow engine

## 1. Краткий подход

Рекомендую перейти к архитектурному уровню «skills + один узкий model-discovery helper»: весь feature lifecycle управляется короткими skills, Git, project commands и native orchestration interfaces Herdr, Omnigent или Paseo. Текущий `meta-o` CLI, FSM, runtime state, adapters, receipts, digests, registries и service-style watchdog удаляются без compatibility layer; сохраняются сильный executor, обязательный reuse research, независимый review, применимый E2E и проверка одного candidate commit.

Это предложение подготовлено как отдельное экспертное заключение; multi-model council не запускался, файлы и Git-состояние не изменялись.

---

## 2. Выбранный архитектурный уровень

### Сравнение вариантов

| Уровень | Состав | Плюсы | Потери и стоимость | Решение |
|---|---|---|---|---|
| 1. Почти pure skills | Skills, Git, Make/task runner, native backend CLI | Минимальная поверхность, максимальная гибкость | Нет автоматического model catalog; больше reasoning в skills | Допустимый baseline |
| 2. Skills + узкие helpers | Уровень 1 + private model-discovery helper | Сохраняет простоту, автоматизирует реально алгоритмическую задачу | Нужно сопровождать SDK-specific discovery | **Рекомендуемый target** |
| 3. Workflow engine | FSM, state, adapters, receipts, reconcile | Возможны exactly-once и автоматизированное recovery | Большой proxy/control layer, ограничение native CLI, высокая стоимость | Отклонить |

Уровень 2 не является уменьшенной версией текущего `meta-o`. В нём нет общего orchestration executable, backend adapter, FSM, run state или protocol translation.

### Потерянные гарантии, принятые осознанно

Удаляются:

- exact replay управляющей session;
- exactly-once delivery;
- автоматический takeover после crash;
- generation fencing и write-ahead operations;
- immutable spec copy и mutation detection;
- rebase-stable snapshot attestations;
- machine-validated Finding transport;
- формальные gate receipts;
- автоматическая классификация каждой lifecycle phase;
- mandatory detached worktrees;
- гарантированная liveness watchdog.

Остаются практически значимые гарантии:

- один явно названный candidate commit;
- QC, оба reviews и E2E должны относиться к этому commit;
- любое исправление создаёт новый candidate и инвалидирует затронутые проверки;
- полные сообщения reviewers сохраняются при передаче;
- существенный scope проверяется reuse researcher, executor, reviewers и E2E;
- ручной restart восстанавливается по Git/spec/native sessions.

---

## 3. Архитектура и компоненты

```text
User
  └─ one orchestrator skill
      ├─ mo-orchestrate             → Herdr
      ├─ mo-orchestrate-omnigent    → Omnigent
      └─ mo-orchestrate-paseo       → Paseo
           │
           ├─ mo-reuse              → separate research session
           ├─ executor              → no methodology skill
           ├─ mo-review             → standalone review loop
           ├─ project QC / E2E      → Make or native task runner
           └─ mo-watchdog           → optional 1:1 agent session
```

Общая методология является текстом, а не executable abstraction. Каждый orchestration skill самостоятельно переводит смысловые роли в native primitives своего backend.

### Финальный набор skills

| Skill | Trigger | Вход | Результат | Ответственность |
|---|---|---|---|---|
| `mo-orchestrate` | Полный feature flow через Herdr | Spec path, URL, текст task или «continue» | Проверенный candidate commit | Управляет lifecycle через прямые `herdr agent/pane/worktree` |
| `mo-orchestrate-omnigent` | То же через Omnigent | То же | То же | Использует Omnigent conversations, harnesses, resume/export |
| `mo-orchestrate-paseo` | То же через Paseo | То же | То же | Использует `paseo run/ls/logs/wait/send/workspace` |
| `mo-reuse` | Всегда до реализации | Читаемая feature-spec, repo, dependencies | Обновлённый `Reuse research` и отдельный commit | Ищет существующие решения; не проектирует всю feature |
| `mo-review` | Из orchestrator или напрямую | Artifact, acceptance source, revision | Два независимых review verdict и fix loop | Универсальный review кода, spec, docs, slides и иных artifacts |
| `mo-watchdog` | По желанию пользователя | Backend и locator одной orchestrator session | Наблюдение и уведомление | Не восстанавливает run и не мутирует state |

Имена намеренно слегка асимметричны: `mo-orchestrate` остаётся коротким основным Herdr-вызовом, а альтернативы явно называют backend. Generic router не создаётся.

### Чего не будет

- обязательного executor skill;
- `SessionAdapter`;
- общего backend protocol;
- отдельного adjudicator skill;
- обязательного `mo-e2e` skill;
- собственного installer/updater;
- скрытой skill-зависимости, пересказывающей методологию executor.

---

## 4. Минимальный lifecycle feature

### 4.1. Старт и preflight

Orchestrator:

1. Получает spec/task либо пытается обнаружить очевидную незавершённую работу.
2. Если вызван без входа и однозначной текущей работы нет, спрашивает: новая задача или продолжение.
3. Читает:
   - Git branch, status и историю;
   - feature-spec;
   - `AGENTS.md`, `CLAUDE.md` и связанные project instructions;
   - `Makefile`;
   - затем `package.json`, `pyproject.toml` и native task runner config.
4. Проверяет native backend skill/help и backend version.
5. Показывает компактный model set.
6. Показывает `command -v claude`, `command -v codex`, `command -v opencode`.
7. Не продолжает, если backend намеренно обходит ожидаемый PATH resolution.

Orchestrator имеет право читать проект, запускать проверки и разбирать Git reality. Он не становится основным implementer или ещё одним полноценным reviewer.

### 4.2. Reuse research

`mo-reuse` запускается в отдельной CLI/session context до executor.

Обязательный раздел:

```markdown
## Reuse research

- Existing project capabilities:
- Evaluated solutions:
  - Name, version/source:
  - Maintenance:
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
- product behavior, scope и утверждённые constraints не меняются;
- tracked spec фиксируется первым отдельным spec-only commit;
- executor получает уже обновлённую read-only spec;
- reviewers проверяют соответствие reuse decision;
- отклонение допускается лишь с техническим обоснованием в коде/spec.

Для текстовой или внешней задачи:

- если в проекте есть convention для specs, используется она;
- иначе создаётся обычный `spec/<date>-<slug>.md`, содержащий исходную задачу и `Reuse research`;
- это читаемая рабочая spec, а не content-addressed blob;
- она фиксируется отдельным commit и позднее retire/delete согласно project convention;
- если пользователь явно требует внешнюю spec, researcher создаёт рядом обычную `<name>.researched.md` без отдельного state protocol.

### 4.3. Executor

Executor получает только:

- path к spec/task;
- native goal или completion-oriented prompt;
- project instructions;
- native tools и skills агента;
- полные последующие review/E2E results.

До первого candidate он обязан:

1. Прочитать всю spec и project instructions.
2. Реализовать полный scope.
3. Следовать выбранному reuse decision либо объяснить отклонение.
4. Обновить durable knowledge.
5. Запустить typecheck, lint, tests, build и применимую console smoke.
6. Зафиксировать чистый candidate commit.

### 4.4. Candidate и gates

Conceptual boundary:

```ts
type CandidateRef = {
  repoRoot: string;
  branch: string;
  commitOid: string;   // full Git object ID
  specLocator: string;
};
```

Это передаваемое значение, а не persisted runtime schema.

Правило candidate:

1. Executor создаёт commit `C1`.
2. Orchestrator передаёт `C1` каждому reviewer/tester.
3. Во время проверки `C1` не изменяется.
4. Fixes создают `C2`.
5. Все проверки, которые могли быть затронуты переходом `C1 → C2`, повторяются.
6. Completion возможен, только когда один и тот же финальный commit прошёл:
   - aggregate QC;
   - два независимых reviews;
   - применимый E2E.

Git commit уже обеспечивает identity содержимого. `snapshot_digest` ничего существенно не добавляет, кроме сохранения старых attestations после переписывания истории; это не оправдывает второй identity layer.

### 4.5. Worktrees

Default — feature branch и дисциплина commits.

Worktree используется только если:

- несколько проверок реально идут одновременно;
- текущий worktree может измениться во время review;
- E2E требует изолированного окружения;
- backend естественно создаёт workspace/worktree.

Допустим native `git worktree`, `herdr worktree` или Paseo workspace. Собственный helper не нужен.

---

## 5. Executor goal lifecycle

Рекомендуется вариант №3:

- native feature goal действует до executor-owned candidate;
- во время независимых reviews goal не продолжает бессмысленно генерировать работу;
- review/E2E fixes передаются обычными follow-up turns в той же session;
- отдельная короткая goal создаётся только для действительно большого fix batch.

### Initial goal template

```text
Read the complete task at <SPEC_PATH> and all applicable project instructions
before changing code.

Deliver the full approved scope, not an MVP or a convenient subset. Preserve
the architecture, compatibility and project constraints stated in the task.
Do not defer difficult required work unless an external blocker makes it
impossible.

Before completing:
- implement the full behavior;
- apply the recorded Reuse research decision or leave a durable technical
  rationale for a necessary deviation;
- update durable project knowledge where the implementation makes stable facts
  true;
- run all applicable project typecheck, lint, test, build and QC commands;
- run a short deterministic E2E smoke when applicable;
- produce a clean, reviewable Git candidate commit.

Continue autonomously until this executor-owned definition of done is met or a
real needs_attention blocker exists.
```

Spec не дублируется inline, если доступна по path.

### Backend-specific activation

#### Herdr

- Codex стартует интерактивно по имени `codex`, разрешённому через PATH.
- `/goal` вводится как native interactive slash command, а не как framed prompt.
- Предпочтителен key-level ввод через `agent send-keys`/pane input с отдельным Enter.
- Наличие текста `/goal` в `herdr agent prompt` не считается доказательством.
- Orchestrator проверяет visible goal UI/status перед началом реализации.
- Если установленная комбинация Herdr/Codex не позволяет подтвердить activation, используется честный fallback.

#### Omnigent

- Для Codex executor выбирается native TUI harness.
- Slash command вводится в интерактивную Codex surface.
- `omnigent run --harness codex -p ...` или обычный first prompt не считается `/goal`.
- Resume выполняется через сохранённую native conversation.
- Прямая non-TUI harness используется только с weaker fallback.

Omnigent уже предоставляет persistent conversations, несколько harnesses, subagents, UI и export; методология не должна эмулировать поверх него Herdr. [Omnigent repository](https://github.com/omnigent-ai/omnigent)

#### Paseo

- Требуется версия с native Codex `/goal` support.
- Goal отправляется через поддерживаемый Paseo interactive/slash-command path.
- Activation подтверждается по native timeline/UI, а не фактом успешного `send`.
- `paseo send`, `logs` и `wait` применяются напрямую.
- При отсутствии поддержки используется fallback.

Paseo предоставляет native agents, workspaces и полный timeline через `run`, `ls`, `logs`, `wait`, `send`; его собственные skills устанавливаются и читаются до orchestration skill. [Paseo CLI](https://paseo.sh/docs/cli), [Paseo repository](https://github.com/getpaseo/paseo)

### Fallback без native goal

Для Claude Code, OpenCode и неподдерживаемой Codex surface:

- одна долгоживущая persistent session;
- initial prompt с тем же outcome и Definition of Done;
- orchestrator проверяет преждевременный idle;
- если scope не завершён, отправляет конкретное продолжение;
- session возобновляется через native backend resume.

Это слабее persisted automatic goal и так и называется. Новый FSM для эмуляции `/goal` не создаётся.

Актуальная официальная документация подтверждает `/goal` в ChatGPT desktop app, interactive Codex CLI и IDE extension; goal одновременно является первым prompt и completion criteria и не расширяет permissions. [OpenAI: long-running work](https://learn.chatgpt.com/docs/long-running-work)

---

## 6. Три backend-specific flow

### Capability table

| Возможность | Herdr 0.8 | Omnigent 0.6 | Paseo |
|---|---|---|---|
| Native session status | Available | Available через conversation/UI | Available через `ls`, включая structured output |
| Полный transcript | Ограниченно | Available через session export/history | Available через `logs` timeline |
| Полный последний reviewer turn | Terminal read + fallback export file | Последнее assistant message из export | Последнее assistant event из полного timeline |
| Context fill | Unavailable на Herdr layer | Неунифицировано, harness-specific | Available в UI/events; CLI schema проверяется |
| Last-turn timestamp | Inferred/terminal-dependent | Available в persisted history | Available |
| Native compaction signals | Agent-specific, не Herdr contract | Harness-specific | Codex/OpenCode events доступны |
| Resume | Persistent named sessions | Native conversation resume | Existing agent/workspace continuation |
| Goal | Через interactive Codex, activation требует проверки | Через Codex native TUI | Native Codex support, version-gated |
| Cache TTL/cold-resume price | Unavailable | Unavailable | Unavailable |
| PATH preservation | Да, при запуске canonical command | Да, если PATH выигрывает resolution | Provider CLI должен находиться в PATH |

Ни один backend не даёт достаточных данных для общего cache tracker. Поэтому:

- продолжать старую session, пока она coherent и backend не показывает pressure;
- native compact применять только по реальному signal или заметной деградации;
- fresh actor создавать после неудачной compaction, противоречивого context или когда task/spec + Git дешевле восстановления;
- не генерировать искусственные turns ради cache warmth;
- не переносить thresholds между Claude, Codex и OpenCode.

### Полный reviewer result

#### Herdr

1. Читать `recent-unwrapped` с достаточным scrollback.
2. Если alternate-screen уже потерял content, попросить reviewer экспортировать предыдущее сообщение verbatim в Markdown-файл и вернуть только path.
3. Прочитать весь файл.
4. Ручное открытие session остаётся допустимым fallback.

Увеличение числа terminal lines не восстанавливает уже потерянный alternate-screen output, поэтому truncated tail нельзя выдавать за полный ответ.

#### Omnigent

- Экспортировать native conversation JSONL.
- Выбрать полное последнее assistant message нужного reviewer.
- Не парсить terminal pane.
- При отсутствии export у конкретного harness использовать native conversation UI/API, затем file-export fallback.

#### Paseo

- Получить полный `paseo logs <agent>` timeline.
- Выбрать последнее завершённое assistant event.
- `--tail N` запрещён как authoritative transport.
- Если установленная версия не даёт устойчивой structured event boundary, reviewer экспортирует Markdown-файл.

---

## 7. Standalone `mo-review`

### Контракт

```ts
type ReviewInput = {
  artifact: string;             // path, URL, commit, directory or explicit object
  acceptanceSource?: string;    // spec/task/path
  revision?: string;            // commit SHA or human-readable artifact version
  projectInstructions?: string[];
  reviewLenses?: string[];
};

type ReviewOutcome =
  | { kind: "pass"; revision: string; fullMessages: string[] }
  | { kind: "changes_requested"; revision: string; fullMessages: string[] }
  | { kind: "needs_attention"; reason: string; evidence?: string };
```

Типы описывают границы, но не требуют JSON transport.

Рекомендуемый Markdown reviewer response:

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

### Review loop

1. Два reviewers получают artifact независимо.
2. Первый проход не показывает им findings друг друга.
3. Проверяются:
   - acceptance completeness;
   - architecture и необходимость abstraction;
   - reuse decision;
   - correctness и failure handling;
   - purpose;
   - durable knowledge;
   - QC/E2E adequacy.
4. Полные ответы передаются автору почти verbatim.
5. После fixes оба reviewer проверяют новую revision.
6. Completion требует двух PASS на одной revision.

### Non-code artifacts

Для spec, документа или презентации:

- code-specific lenses отключаются;
- identity задаётся path + version/commit;
- проверяются смысл, структура, полнота, consistency и artifact-specific quality;
- full-feature run, E2E registry и runtime state не требуются.

### Споры

Порядок:

1. Reviewer перепроверяет rebuttal и evidence автора.
2. Если спор остаётся, второй reviewer получает конкретный finding и rebuttal.
3. Orchestrator решает обратимый технический спор.
4. Пользователь подключается только при product ambiguity, необратимом решении или реальном остаточном риске.

Отдельный adjudicator не нужен.

Subagents выбираются динамически:

- маленькая задача: 0;
- средняя: 2–4 независимых lenses;
- крупная: до 6;
- фиксированное требование 6–9 запрещено.

---

## 8. Model discovery и `~/.meta-o`

Полностью удалить settings layer не следует: model preferences меняются редко и имеют самостоятельную пользовательскую ценность. Runtime state с ними не смешивается.

### Layout

```text
~/.meta-o/
  settings.json
  projects/
    <sha256(realpath(project-root))>.json
  model-catalog.json
```

Здесь нет run IDs, findings, phases, commits, sessions или gates.

### Data models

```ts
type Route = "claude" | "codex" | "opencode";

type ModelRef = {
  route: Route;
  model: string;
  vendor: string;
  lineId?: string;       // e.g. "claude-opus", "gpt-sol"
  release?: string;      // parsed release, when reliable
  effort?: string;
  providerId?: string;
};

type ModelPreferences = {
  schemaVersion: 1;
  roleModels: Partial<Record<
    "reuseResearcher" |
    "executor" |
    "reviewerPrimary" |
    "reviewerCrossVendor" |
    "e2eTester" |
    "watchdog",
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

### Private helper interface

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

- `TOOL_NOT_FOUND`: route отсутствует; остальные routes продолжают работать.
- `DISCOVERY_UNAVAILABLE`: SDK/CLI не предоставляет catalog; используются recent sessions и сохранённая модель.
- `AUTH_UNAVAILABLE`: route помечается недоступным, worker не запускается через proxy.
- `CORRUPT_SETTINGS`: повреждённый файл переименовывается в backup, используется default.
- `AMBIGUOUS_LINEAGE`: upgrade не предлагается.

Helper разрешён, потому что deduplication, lineage comparison, cache и работа с несколькими разными SDK являются повторяемым детерминированным алгоритмом. Он не запускает agents, не проксирует prompts и не знает workflow phases.

Upgrade предлагается только если:

- совпадают vendor и явно установленный `lineId`;
- release строго новее;
- модель доступна через тот же route;
- это не preview/alias с неясной семантикой;
- предложение ещё не было отклонено для того же catalog version.

При сомнении предложение не показывается. Catalog можно обновлять раз в сутки, повторное предложение подавлять примерно на 30 дней.

Выбранная стратегия: global default + редкий project override. «Только последний набор» не различает сознательный default и случайный обход лимитов; только per-project создаёт лишнее дублирование.

---

## 9. Project QC contract

### Discovery

Orchestrator сначала читает существующий project interface. Он не устанавливает второй stack поверх работающего.

Если проект использует Make, рекомендуется:

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

- `mo-qc` — единственный рекомендуемый aggregate target;
- остальные существуют только если проверка применима;
- aliases могут вызывать существующие targets;
- executor добавляет aliases в scope feature adoption;
- orchestrator сам Makefile не редактирует;
- если эквивалент очевиден, используется без user gate;
- если semantic equivalence сомнительна, требуется уточнение;
- в проекте без Make используется native runner, а mapping кратко фиксируется в project instructions.

`mo-e2e`, требующий агента, должен печатать `AGENT_REQUIRED` и instructions, но не считаться PASS. Exit code 2 предотвращает ложный зелёный gate.

### Python profile

Рекомендуемый состав:

- Ruff для format/lint, complexity и code-health;
- существующий mypy или Pyright для typecheck;
- pytest;
- Import Linter для layers, forbidden dependencies, independence и cycles;
- Interrogate для docstring presence/coverage;
- reviewer для semantic adequacy purpose.

Import Linter уже поддерживает `forbidden`, `layers`, `independence` и acyclic sibling contracts, поэтому custom import graph/Tarjan implementation не нужен. [Import Linter](https://import-linter.readthedocs.io/en/latest/)

Interrogate умеет считать docstrings, включая private symbols при соответствующей конфигурации; он проверяет наличие, но не смысл. [Interrogate](https://interrogate.readthedocs.io/en/latest/)

### TypeScript compatibility profile — default для existing projects

- существующий package manager и workspace runner;
- `tsc --noEmit`, `tsc -b` или framework checker, уже принятый проектом;
- ESLint flat config;
- `typescript-eslint` typed lint через `recommendedTypeChecked` и `projectService`;
- существующий Jest/Vitest/node:test runner;
- optional `eslint-plugin-jsdoc`;
- Prettier отдельно от correctness lint, с `eslint-config-prettier`.

`noEmit` оставляет `tsc` typechecker, а `strict` объединяет семейство strict checks. [TypeScript `noEmit`](https://www.typescriptlang.org/tsconfig/noEmit.html), [TypeScript `strict`](https://www.typescriptlang.org/tsconfig/strict.html)

Typed lint требует отдельной настройки и имеет стоимость, поэтому включается для source packages, а generated/config files получают overrides. [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/)

### TypeScript fast profile — opt-in

- отдельный `tsc`;
- Oxlint type-aware;
- существующий test runner.

На август 2026 type-aware Oxlint объявлен stable, но основан на TypeScript 7 tooling и ещё не гарантирует полное совпадение rule coverage. Поэтому он подходит greenfield или уже совместимому TS7-проекту, но не является автоматической миграцией существующего TS5/6 stack. Отдельный `tsc` пока сохраняется. [Oxlint type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)

### Test runner для greenfield

- `node:test`: Node-only library/service, простой runner, минимальная dependency surface;
- Vitest: Vite, frontend/DOM, richer mocking, watch и coverage workflow;
- существующий Jest или другой runner не мигрируется ради методологии.

Vitest transpiles TypeScript, но обычный test run не заменяет typecheck. [Vitest](https://vitest.dev/guide/), [Node test runner](https://nodejs.org/api/test.html)

### Code-health defaults

Начальные ориентиры, а не игровые метрики:

- cyclomatic complexity: warning около 10, error 15;
- function length: warning 60–80 строк;
- file size: warning 400–500 строк;
- statements: warning 30–40;
- исключения: generated, declarations, migrations и declarative config;
- tests не исключаются полностью, но могут иметь более мягкие thresholds.

ESLint уже содержит `complexity`, `max-lines`, `max-lines-per-function` и `max-statements`; custom TS AST checker не нужен.

Coverage включается по риску критичных modules, не как обязательные 100%.

---

## 10. Purpose, architecture и knowledge

### Project layout

```text
docs/
  business.md
  glossary.md
  todo.md
  architecture/
  e2e.md
```

При росте E2E:

```text
docs/e2e/
  index.md
  authentication.md
  checkout.md
```

Каждая группа объясняет, когда её выбирать. Полный прогон всех групп не является default.

### Knowledge sync

Простое определение:

> Перед candidate executor переносит из feature-spec только устойчивые факты, которые реализация сделала частью проекта.

Распределение:

- product behavior и business rules → `docs/business.md`;
- terminology → `docs/glossary.md`;
- boundaries, invariants и architectural rationale → `docs/architecture/`;
- локальный causal context → purpose/comment рядом с кодом;
- debt вне scope → `docs/todo.md`.

Feature-spec целиком не копируется. После завершения она либо архивируется по project convention, либо удаляется после переноса устойчивого смысла. `KnowledgeImpactPlan` не нужен.

### Architecture instructions

Canonical подробный текст хранится, например, в:

```text
docs/architecture/development-principles.md
```

`AGENTS.md` и `CLAUDE.md` содержат короткое одинаковое требование прочитать этот файл и несколько критичных безусловных правил. Это устраняет drift без generator/runtime.

Feature-spec обязана описывать применимые boundaries. Reviewers проверяют:

- естественность компонентов;
- ответственность и допустимые зависимости;
- независимость изменений;
- god-files/god-objects;
- существующие abstractions и лишние новые layers;
- возможность удаления устаревшего branching в scope.

### Purpose contract

Purpose отвечает:

- зачем сущность существует;
- какую роль она играет;
- какой invariant или causal context она сохраняет;
- почему её нельзя бездумно удалить или изменить.

Coverage:

- modules, public/exported API, classes и architectural boundaries — всегда;
- first-party private/test symbols — если они нетривиальны, кодируют domain rule, fixture invariant или неочевидное решение;
- overload declarations — не освобождаются автоматически;
- generated/vendor code, тривиальные accessors и очевидные framework glue допускают явное project-level исключение.

Mechanical tools проверяют присутствие и базовую форму. Semantic adequacy, cargo-cult text и drift проверяют reviewers. Для Markdown baseline-проверка не нужна; если позже появится доказанный structural check, используется Markdown AST parser, а не regex.

---

## 11. E2E

| Форма | Исполнитель | Контракт |
|---|---|---|
| Короткая console/shell smoke | Executor | Детерминированная команда; может входить в `mo-qc` |
| Agentic benchmark | Отдельный tester | Project docs задают команды, selection, результаты и cleanup |
| Browser E2E | Отдельный tester | Читает `agent-browser` skill и релевантную scenario group |

Отдельный tester не создаётся для lint, unit/integration tests или короткого endpoint smoke.

`e2e.json` удаляется: человеко-читаемые scenarios, Make help, command output и commit SHA дают достаточный contract. Machine registry появится только при реальном внешнем consumer.

---

## 12. Recovery, actor status и permissions

### Recovery после restart/reboot

Новый orchestrator:

1. Перечитывает исходную task/spec.
2. Проверяет branch, status, log и candidate commits.
3. Смотрит Make/task-runner commands и их output.
4. Находит native backend sessions.
5. Читает их полный последний output.
6. Определяет, есть ли:
   - незавершённый research;
   - working executor;
   - candidate без reviews;
   - fixes после старого candidate;
   - неповторённый E2E.
7. Продолжает очевидный следующий шаг.
8. При противоречии задаёт один конкретный вопрос.

Никакой exact fidelity старого orchestrator context не обещается.

### Operational status

Пользователю показываются только:

- `idle`: пользовательское внимание не требуется;
- `needs_attention`: question, approval, blocker, error либо непонятный native status после проверки.

Orchestrator внутри читает native `working/done/blocked/...`, но не сохраняет новую status taxonomy.

### PATH contract

Backend обязан запускать:

```text
claude
codex
opencode
```

через inherited PATH.

Запрещено:

- искать Homebrew/app binary и запускать его напрямую;
- копировать permission flags в methodology config;
- подменять пользовательские wrappers;
- использовать SDK proxy вместо subscription CLI worker.

Preflight показывает resolved paths. Для Omnigent отдельно проверяются path override environment variables: если они обходят wrapper, это configuration failure.

---

## 13. Optional `mo-watchdog`

Baseline:

```text
one watchdog session → one orchestrator session
```

Watchdog:

- получает backend и native locator orchestrator;
- периодически читает native state/output;
- сообщает пользователю о `needs_attention`, длительном неожиданном idle или смерти orchestrator;
- может разбудить живого orchestrator native message;
- не делает takeover;
- не запускает новую feature;
- не мутирует Git/FSM/state;
- не управляет несколькими projects.

Собственный `.mjs`, launchd/systemd units и global config не нужны. LLM watchdog сам может остановиться; это честное ограничение, пользователь может открыть и перезапустить session.

Standalone runtime рассматривается позже только при измеренном повторяющемся failure, который native notifications и agent session не покрывают.

---

## 14. Reflection и durable rationale

Reflection срабатывает, если:

- один root cause повторился в одной feature;
- defect прошёл QC/review и обнаружился только в E2E или production-like verification;
- повторный review/E2E cycle выявил системно отсутствующий contract;
- backend/tooling failure регулярно расходует человеческое время.

Формат одной записи в `docs/todo.md`:

```markdown
- Area/path:
  Problem or incident:
  Why earlier checks missed it:
  Practical risk:
  Proposed follow-up:
```

Reflection не расширяет текущую feature автоматически.

Отклонённый finding требует комментария рядом с кодом только если:

- finding substantive;
- конструкция остаётся подозрительной без исчезнувшего discussion context;
- constraint будет важен будущему maintainer.

Комментарий объясняет `why`, constraint и rejected safer alternative. Вкусовые замечания, очевидный код и временные rebuttals не документируются.

---

## 15. Tooling audit

| Текущий компонент | Решение | Чем покрывается функция |
|---|---|---|
| Публичный `meta-o` CLI | **Delete** | Skills + Git + native backend/project CLI |
| `run/project/config` commands | **Delete** | Git reality и минимальные model settings |
| FSM/routing core | **Delete** | Orchestrator reasoning и candidate rule |
| Runtime `~/.meta-o` state | **Delete** | Git, spec, native sessions |
| Model preferences | **Replace with smaller helper** | Узкий settings/catalog helper |
| Findings/decisions/gates records | **Delete** | Полные native messages, Git, durable comments/todo |
| Snapshot digest | **Delete** | Commit SHA |
| Metadata guard | **Delete** | Review current commit/spec |
| Detached worktree helpers | **Replace with direct CLI** | `git worktree`, Herdr/Paseo native workspace |
| Herdr adapter | **Delete** | Прямой Herdr skill/CLI |
| `SessionAdapter` | **Delete** | Три backend-specific textual flows |
| Herdr integration | **Replace with direct CLI** | `mo-orchestrate` |
| Omnigent integration | **Direct native flow** | `mo-orchestrate-omnigent` |
| Paseo integration | **Direct native flow** | `mo-orchestrate-paseo` |
| Capability suite | **Delete** | Минимальный version/path/native smoke preflight |
| `execute-feature` | **Delete** | Spec, goal, project instructions, QC, review |
| `research-reuse` | **Replace** | Mandatory `mo-reuse`, spec edit + commit |
| `review-feature` | **Replace** | Standalone `mo-review` |
| `adjudicate-technical` | **Delete** | Targeted second-reviewer arbitration |
| `test-e2e` | **Keep but move into orchestrator references** | Project E2E docs + conditional tester |
| Goal-mode state | **No new artifact** | Native goal UI/session |
| PATH/permissions layer | **Delete/forbid** | User wrappers and `command -v` |
| Context/cache tracker | **Delete** | Native signals + backend-specific heuristics |
| Reviewer output parser | **Delete** | Full native transcript/file export |
| `install.sh`, `update.sh` | **Delete** | APM/`skills` |
| Watchdog runtime/services | **Replace with skill** | `mo-watchdog` session |
| Project QC helpers | **Mostly delete** | Ruff, ESLint, Oxlint, Import Linter, Interrogate |
| `.quality/qc-manifest.json` | **Delete** | Make/scripts, exit codes, full output |
| Machine-readable QC results | **Delete** | Нет consumer |
| `KnowledgeImpactPlan` | **Delete** | Executor knowledge sync + review |
| `e2e.json` | **Delete** | Markdown scenarios + Make help |
| Verification metadata | **Delete** | Candidate SHA |
| `adoption-manifest.json` | **Delete** | Project instructions/config |
| Code-health baseline | **Defer** | Настраиваемые thresholds; baseline лишь при доказанном brownfield need |
| Custom import graph | **Delete** | Import Linter |
| Regex Markdown parsing | **Delete** | AST parser только при будущей необходимости |
| Python QC templates | **Replace** | Native tool configs/reference profile |
| TypeScript QC templates | **Add as textual profiles** | Native configs/scripts, без wrapper |
| Knowledge checker | **Delete** | Review + existing link/docs tooling |
| Purpose checker | **Replace with existing tools** | Interrogate/Ruff, eslint-plugin-jsdoc, review |
| Lessons ledger | **Delete** | `docs/todo.md` |
| Handoff artifact/4 KiB limit | **Delete** | Git/spec/session reality |

---

## 16. Distribution

Рекомендуемый layout:

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
  README.md
  LICENSE
```

Каждый skill self-contained. Короткий общий workflow reference допускается скопировать в три package directories при release; это предпочтительнее runtime dependency или executable adapter.

APM распознаёт bare `skills/<name>/SKILL.md`, а `npx skills add` умеет устанавливать отдельный skill или весь repository. [Microsoft APM](https://github.com/microsoft/apm), [Vercel skills CLI](https://github.com/vercel-labs/skills)

`install.sh`, `update.sh`, post-install capability suite и service installation отсутствуют.

---

## 17. Implementation и migration plan

### Этап 1. Новая authoritative spec

- Написать компактную master-spec по решениям выше.
- Добавить новый decision ledger.
- Зафиксировать explicitly removed guarantees.
- Не менять текущий код до утверждения новой spec.

### Этап 2. Skills

Реализовать и вручную проверить:

1. `mo-reuse`;
2. `mo-review`;
3. `mo-orchestrate` для Herdr;
4. `mo-orchestrate-omnigent`;
5. `mo-orchestrate-paseo`;
6. optional `mo-watchdog`.

Acceptance tests должны быть сценариями поведения skills, а не новым capability engine.

### Этап 3. Backend validation spikes

На disposable sessions проверить:

- Herdr key-level `/goal` activation и observable confirmation;
- Omnigent native TUI goal и resume;
- Paseo `/goal`, `logs` event boundary и continuation;
- полный reviewer output для каждого backend;
- фактическое сохранение PATH wrappers;
- native compaction/context signals.

Неподтверждённая capability переводится в явно названный fallback.

### Этап 4. Model helper

- Реализовать только discovery/preferences/successor logic.
- Добавить unit tests deduplication и lineage.
- Запретить imports из orchestration/session modules.
- Helper не должен иметь command для запуска agent.

### Этап 5. QC references

- Python profile на Ruff, Interrogate, Import Linter и существующем typechecker/test runner.
- TypeScript compatibility и fast profiles.
- Make/native task-runner examples.
- Purpose review lens.

### Этап 6. Удаление старой системы

Без compatibility adapters удалить:

- public CLI;
- FSM, state, spec store, receipts и snapshots;
- adapters;
- watchdog runtime и units;
- JSON manifests/registries;
- project-owned quality checkers, заменённые зрелыми tools;
- старые executor/reviewer/adjudicator skills;
- install/update scripts;
- tests исключительно старого control layer.

### Этап 7. Самопроверка

- Запустить новый flow на одной небольшой реальной feature через Herdr.
- Затем отдельно через Omnigent и Paseo.
- Проверить crash/restart вручную.
- Self-hosting дальнейших улучшений выполнять только по отдельному решению пользователя.

---

## 18. Ключевые trade-offs

1. **Reasoning вместо FSM.** Теряется автоматическая транзакционность, но Git и native sessions уже содержат достаточно reality для поддерживаемого manual restart.

2. **Commit SHA вместо snapshot digest.** Не сохраняются attestations через amend/rebase, зато identity понятна всем tools и людям.

3. **Markdown вместо Finding JSON.** Теряется schema validation, но сохраняются аргументы, evidence и caveats без parser failure.

4. **Три skills вместо adapter.** Небольшая текстовая повторяемость дешевле общего API, который неизбежно скрывает backend-specific возможности.

5. **Native persistent session fallback вместо эмуляции goal.** Он слабее `/goal`, но честен и не создаёт ещё один workflow engine.

6. **Risk-based purpose coverage.** Это ослабляет прежнее mechanically-all-symbols правило, зато уменьшает бессмысленные docstrings. Overloads и неочевидные private/test symbols остаются обязательными.

7. **No automatic recovery.** Время разработки tooling не тратится на редкий crash scenario; пользователь вручную запускает orchestrator с той же task.

---

## 19. Риски и mitigations

| Риск | Mitigation |
|---|---|
| Backend skill превращается в пересказ CLI | Ограничить skill lifecycle decisions и несколькими примерами; требовать native skill/help |
| Разные backend skills расходятся | Один короткий semantic checklist и cross-backend acceptance scenarios |
| `/goal` отправлен как обычный текст | Surface-specific activation и visible confirmation |
| Reviewer output обрезан | Full transcript API либо verbatim file export; terminal tail не authoritative |
| Проверены разные revisions | Явный candidate SHA; fixes инвалидируют проверки |
| Reuse research становится ритуалом | Требовать конкретные evaluated solutions, compatibility, license и integration cost |
| Model upgrade suggestions шумят | Только high-confidence same-line successor, suppression cache |
| Purpose превращается в cargo-cult | Mechanical presence + обязательная semantic critique reviewers |
| Watchdog сам уснул | Не обещать liveness; native visibility и ручной restart |
| Wrapper layer снова растёт | Для каждого helper обязательна отдельная proof-of-need секция |
| `docs/todo.md` становится мусором | Запись только с symptom/risk/fix shape; пользователь выбирает follow-up |
| Model helper расширяется до launcher | Архитектурный запрет на session/prompt/worker APIs |

---

## 20. Decision ledger

### Принято

- skills-first;
- отсутствие executor skill;
- три прямых backend-specific orchestrator skills;
- mandatory reuse research;
- native Codex goal с проверяемой activation;
- weaker persistent-session fallback;
- standalone `mo-review`;
- Git commit identity;
- conditional E2E tester;
- minimal model settings;
- optional agent watchdog;
- Make/native task-runner discovery;
- простая knowledge structure;
- existing QC tools before custom code;
- APM/skills distribution.

### Отклонено

- public workflow CLI;
- FSM/run state;
- generic backend adapter;
- structured Finding requirement;
- snapshot digest;
- mandatory worktrees;
- immutable spec store;
- automatic crash recovery;
- QC/E2E/adoption manifests;
- project-owned import graph;
- service watchdog;
- installer/update scripts;
- fixed reviewer subagent count;
- separate adjudicator;
- handoff size protocol.

### Отложено

- deterministic watchdog runtime;
- machine-readable E2E registry;
- brownfield code-health baseline;
- shared purpose checker beyond mature linters;
- global architectural hygiene auditor;
- automatic cache economics.

---

## 21. Предпосылки и implementation validation points

Приняты консервативные предположения:

- Herdr, Omnigent и Paseo версии могут меняться; каждый skill проверяет native help/version, а не доверяет старой specification.
- Точная Herdr-последовательность `/goal` и способ подтвердить active goal требуют disposable capability test. До подтверждения используется weaker fallback.
- Для Omnigent native Codex TUI считается единственной surface, где interactive slash command можно считать настоящим `/goal`.
- Paseo structured schema последнего assistant event проверяется по установленной версии; при отсутствии устойчивой boundary используется полный timeline или Markdown export.
- Purpose semantics остаются review responsibility: существующие linters надёжно проверяют форму, но не causal meaning.
- Global architecture audit остаётся отдельной будущей feature.
- Для текстовой task без spec создаётся обычная tracked working spec, а не runtime artifact.

---

## 22. Pre-mortem против повторного bloat

Любое новое предложение о custom code должно письменно ответить:

1. Какой наблюдаемый failure оно предотвращает?
2. Почему native CLI или короткий skill недостаточны?
3. Какой invariant требует детерминированного исполнения?
4. Кто является consumer результата?
5. Что произойдёт без этого кода?
6. Как часто нужен non-happy path?
7. Не ограничивает ли helper полный native interface?
8. Какова стоимость обновления при изменении backend?
9. Можно ли сначала измерить failure?
10. Можно ли удалить helper, не меняя смысл workflow?

Если нет конкретного failure, consumer и invariant, решение остаётся текстовой инструкцией либо отклоняется. Это и есть основная защита vNext от повторного превращения methodology bundle в собственную orchestration platform.