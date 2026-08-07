# Meta‑O vNext: skills-first workflow без workflow engine

## 1. Краткий подход

Meta‑O vNext должен быть набором коротких skills, управляющих Git, project commands и native interfaces выбранного backend — Herdr, Omnigent или Paseo. Текущий `meta-o` CLI, FSM, run state, adapters, receipts, digests, registries и service-style watchdog удаляются без compatibility layer; сохраняются сильный executor без methodology skill, обязательный reuse research, независимые reviews, применимый E2E и проверка одного candidate commit.

Целевая архитектура — почти pure skills плюс условный private helper только для model discovery/preferences. Helper не запускает agents, не проксирует prompts и не участвует в feature lifecycle.

---

## 2. Сравнение архитектурных уровней

| Измерение | 1. Почти pure skills | 2. Skills + ограниченные helpers | 3. Workflow engine |
|---|---|---|---|
| Пользовательский flow | Backend-specific skill, короткое подтверждение моделей, native sessions | Тот же flow; model set обнаруживается автоматически | Общий CLI создаёт run и управляет phases |
| Skills/scripts | 6 skills, custom scripts отсутствуют | Те же skills + условный `model-discovery.mjs` | Skills становятся frontend над CLI/FSM/adapters |
| Recovery | Git, spec, project files, native sessions | То же; сохраняются model preferences | Run state, pending operations, receipts, reconcile |
| Review/E2E | Candidate SHA, Markdown findings, conditional tester | То же | Structured findings, snapshots и gate records |
| Нестандартные проекты | Полный native CLI доступен агенту | То же | Требуются новые adapters/schemas |
| Сопровождение | Низкое | Низкое/среднее | Высокое |
| Гарантии | Нет exactly-once/replay; есть проверка Git reality | Те же workflow guarantees | Возможны транзакционные guarantees ценой control layer |

Рекомендуется уровень 2, но сам feature workflow остаётся уровнем 1. Единственный допустимый helper обслуживает редко меняющиеся model preferences.

Уровень 3 может быть пересмотрен только при накопленных измеренных failures, когда Git, spec, native history и skill instructions доказанно недостаточны.

---

## 3. Гарантии

### Сохраняются

- executor получает полную task/spec и работает до candidate;
- Codex использует native `/goal`, когда activation доказуема;
- executor не читает обязательный methodology skill;
- reuse research выполняется до реализации в отдельном контексте;
- первые два review независимы;
- полные reviewer messages передаются без truncation;
- применимый E2E обязателен;
- финальные QC, reviews и E2E относятся к одному commit;
- manual restart является нормальным recovery flow;
- provider CLI запускаются через пользовательский PATH.

### Удаляются осознанно

- exact orchestrator replay;
- exactly-once prompt delivery;
- automatic takeover;
- generation fencing;
- write-ahead backend operations;
- immutable spec copy;
- snapshot digest;
- rebase-stable attestations;
- gate receipts;
- structured Finding transport;
- mandatory detached worktrees;
- durable run state;
- гарантированная watchdog liveness.

Практический invariant «проверен один результат» сохраняется через Git SHA.

---

## 4. Архитектура

```text
User
  └─ one backend-specific orchestrator skill
      ├─ mo-orchestrate             → Herdr
      ├─ mo-orchestrate-omnigent    → Omnigent
      └─ mo-orchestrate-paseo       → Paseo
           │
           ├─ mo-reuse
           ├─ executor              → no methodology skill
           ├─ mo-review
           ├─ project QC / E2E
           └─ mo-watchdog           → optional 1:1 observer
```

Общая методология является текстом. Общего executable backend adapter нет.

### Skills

| Skill | Trigger | Вход | Выход | Ответственность |
|---|---|---|---|---|
| `mo-orchestrate` | Feature workflow через Herdr | Spec path, URL, task text или `continue` | Проверенный candidate | Прямой Herdr control |
| `mo-orchestrate-omnigent` | Workflow через Omnigent | То же | То же | Native harnesses, conversations, resume/export |
| `mo-orchestrate-paseo` | Workflow через Paseo | То же | То же | Native agents, logs, send, wait, workspaces |
| `mo-reuse` | Всегда до implementation | Spec/task, repo, dependencies | `Reuse research` | Поиск готовых решений |
| `mo-review` | Из orchestrator или напрямую | Artifact, acceptance source, revision | Review/fix loop | Code и non-code review |
| `mo-watchdog` | Опционально | Backend + orchestrator locator | Наблюдение | Не делает takeover |

Не создаются executor skill, `SessionAdapter`, adjudicator skill, обязательный E2E skill, installer или run-state schema.

---

## 5. Feature lifecycle

### 5.1. Preflight

Orchestrator:

1. Получает spec/task или обнаруживает очевидную незавершённую работу.
2. При отсутствии однозначного входа спрашивает, что требуется сделать.
3. Читает Git branch/status/log, spec, project instructions и Makefile.
4. Затем читает `package.json`, `pyproject.toml` и native task-runner config.
5. Читает native backend skill/help и проверяет version.
6. Показывает model set.
7. Показывает `command -v claude`, `command -v codex`, `command -v opencode`.
8. Определяет применимые QC и E2E.
9. Не запускает worker, если backend обходит ожидаемый PATH wrapper.

Orchestrator может читать проект и выполнять operational checks, но не становится implementer или полноценным reviewer.

### 5.2. Reuse research

`mo-reuse` запускается отдельной CLI/session context.

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
- product scope и behavior не меняются;
- tracked spec фиксируется первым spec-only commit;
- executor получает обновлённую read-only spec;
- reviewers проверяют соблюдение решения;
- отклонение требует durable technical rationale.

Для text task без project convention создаётся `spec/<date>-<slug>.md`. Для внешней spec создаётся обычная соседняя `<name>.researched.md`; digest/state protocol отсутствует.

### 5.3. Executor

Executor получает:

- path к spec/task;
- native goal или weaker completion-oriented prompt;
- project instructions;
- native tool/skill catalog;
- полные review/E2E messages.

До candidate он обязан:

1. Прочитать всю spec и project instructions.
2. Реализовать полный scope.
3. Применить reuse decision либо обосновать отклонение.
4. Обновить durable knowledge.
5. Выполнить typecheck, lint, tests, build, QC и применимую smoke.
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

Это смысловая граница, не persisted JSON.

Lifecycle:

1. Executor создаёт `C1`.
2. Полный SHA передаётся reviewers и tester.
3. `C1` не изменяется во время gates.
4. Fixes создают `C2`.
5. Затронутые проверки повторяются.
6. Completion возможен только после QC, двух reviews и применимого E2E на одном финальном SHA.

Результат без доказуемой revision не является gate.

### 5.5. Worktrees

Default — feature branch и commit discipline.

Native worktree используется при parallel review, меняющемся основном worktree или необходимости isolated E2E. Используются прямые `git worktree`, Herdr worktree или Paseo workspace commands.

---

## 6. Goal lifecycle

Feature-level goal действует до первого executor-owned candidate. Во время независимых gates automatic continuation не нужна. Review/E2E fixes передаются follow-up turns в той же session; новая короткая goal используется только для крупного самостоятельного fix batch.

### Initial goal

```text
Read the complete task at <SPEC_PATH> and all applicable project instructions
before changing code.

Deliver the full approved scope, not an MVP or a convenient subset. Preserve
all architecture, compatibility and project constraints. Do not defer required
work unless an external blocker makes it impossible.

Before completing:
- implement the complete required behavior;
- follow the recorded Reuse research decision or leave durable rationale for a
  necessary deviation;
- update durable project knowledge;
- run all applicable typecheck, lint, test, build and QC commands;
- run deterministic E2E smoke when applicable;
- produce a clean reviewable Git candidate commit.

Continue autonomously until this definition of done is met or a real
needs_attention blocker exists.
```

### Herdr

- Codex запускается интерактивно через PATH.
- `/goal` вводится native key-level input с отдельным Enter.
- Строка `/goal` внутри framed prompt не является доказательством.
- Activation подтверждается visible Codex goal UI.
- При невозможности подтверждения применяется fallback.

### Omnigent

- Native goal используется только через Codex native TUI harness.
- `omnigent run ... -p` считается обычным prompt.
- Resume выполняется через native persisted conversation.
- Direct/non-TUI harness использует fallback.

[Omnigent repository](https://github.com/omnigent-ai/omnigent)

### Paseo

- Требуется Paseo release с documented Codex `/goal` support.
- Goal передаётся через documented interactive/slash-command path.
- Activation подтверждается native timeline/UI.
- Успешный `paseo send` сам по себе не доказывает activation.
- До локальной установки все Paseo claims считаются inferred, а не verified.

[Paseo CLI](https://paseo.sh/docs/cli), [Paseo repository](https://github.com/getpaseo/paseo)

### Fallback

Для Claude Code, OpenCode и неподдерживаемой Codex surface:

- одна persistent executor session;
- completion-oriented initial prompt;
- orchestrator обнаруживает premature idle;
- незавершённый scope вызывает follow-up;
- continuation выполняется через native resume.

Это слабее persisted automatic goal и не эмулируется FSM.

Официальная документация описывает `/goal` в ChatGPT desktop app, interactive Codex CLI и IDE extension. [OpenAI long-running work](https://learn.chatgpt.com/docs/long-running-work)

---

## 7. Capability evidence policy

### Статусы

Каждая capability получает один статус:

- `available` — проверена на локально установленной версии;
- `inferred` — заявлена primary docs/source, но не проверена на локальной установке;
- `unavailable` — native interface не предоставляет capability либо она не обнаружена;
- `fallback` — требуемый outcome достигается более слабым способом.

Основание исследования:

| Backend | Основание |
|---|---|
| Herdr | Локально установленный `herdr 0.8.0`, `herdr --skill` и native help |
| Omnigent | Локально установленный `omnigent 0.6.0`, native help, package source и official repository |
| Paseo | Локально не установлен; official repository, CLI docs и changelog, snapshot 2026-08-05 |

Ни одна положительная Paseo capability ниже не считается локально подтверждённой.

---

## 8. Backend control-plane capabilities

| Capability | Herdr 0.8.0 | Omnigent 0.6.0 | Paseo, docs snapshot 2026-08-05 |
|---|---|---|---|
| Agent/session status | `available` — `agent list/get/wait` | `available` — conversation/UI primitives | `inferred` — documented `paseo ls`, structured output |
| Persistent session/resume | `available` — named Herdr sessions; harness state зависит от actor | `available` — conversation resume | `inferred` — existing agent/workspace continuation |
| Full transcript | `unavailable` как общая terminal guarantee | `available` — session export/history | `inferred` — documented full `logs` timeline |
| Full last assistant turn | `fallback` — scrollback или verbatim file export | `available` — последнее message из export | `inferred` — последнее assistant event из full logs |
| Last-turn timestamps | `unavailable` как стабильный Herdr API | `available` в persisted history | `inferred` по documented timeline/events |
| Backend-level context fill | `unavailable` | `unavailable` как единый cross-harness field | `inferred` в UI/events; structured CLI contract не подтверждён |
| Cache TTL | `unavailable` | `unavailable` | `unavailable` |
| Cold-resume subscription price | `unavailable` | `unavailable` | `unavailable` |
| Native workspace/worktree | `available` | `available` через workspace/conversation environment | `inferred` — documented workspace/worktree modes |
| PATH-based worker launch | `available`, если используется canonical command | `available`, если PATH выигрывает resolver | `inferred` по provider CLI requirements |

---

## 9. Route-specific capability matrix

### 9.1. Herdr 0.8.0

Herdr является terminal orchestration backend и не нормализует context semantics underlying harnesses.

| Capability | Claude Code route | Codex route | OpenCode route |
|---|---|---|---|
| Запуск через PATH/subscription CLI | `available` | `available` | `available` |
| Persistent backend session | `available`; native Claude resume отдельно | `available`; native Codex session отдельно | `available`; native OpenCode persistence отдельно |
| Persisted automatic goal | `unavailable` — equivalent не подтверждён | `available` только после interactive `/goal` activation test | `unavailable` — equivalent не подтверждён |
| Completion fallback | Persistent session + orchestrator continuation | То же, если `/goal` не подтверждена | Persistent session + orchestrator continuation |
| Context occupancy | `unavailable` на Herdr API | `unavailable` на Herdr API | `unavailable` на Herdr API |
| Native compaction signal | `unavailable` на Herdr API; можно наблюдать harness UI | `unavailable` на Herdr API; можно наблюдать Codex UI | `unavailable` на Herdr API; можно наблюдать harness UI |
| Last-turn time | `unavailable` как stable API | `unavailable` как stable API | `unavailable` как stable API |
| Full reviewer turn | `fallback` через verbatim file export | `fallback` через verbatim file export | `fallback` через verbatim file export |
| Cache TTL | `unavailable` | `unavailable` | `unavailable` |

`herdr agent read --source recent-unwrapped` используется как удобный first attempt, но не является full-turn guarantee из-за alternate-screen behavior.

### 9.2. Omnigent 0.6.0

Omnigent имеет direct и native TUI harnesses. Capabilities нельзя переносить между ними автоматически.

| Capability | Claude route | Codex route | OpenCode route |
|---|---|---|---|
| Запуск через PATH/subscription CLI | `available` для native harness при отсутствии override | `available` для native harness при отсутствии override | `available` для native harness при отсутствии override |
| Persistent conversation/resume | `available` | `available` | `available` |
| Persisted automatic goal | `unavailable` — equivalent не подтверждён | `available` только в native TUI после `/goal` verification | `unavailable` — equivalent не подтверждён |
| Completion fallback | Persistent conversation + continuation | То же для direct harness | Persistent conversation + continuation |
| Full reviewer turn | `available` через export/history | `available` через export/history | `available` через export/history |
| Context occupancy | `unavailable` как стабильный единый field | `unavailable` как стабильный единый field | `unavailable` как стабильный единый field |
| Last-turn time | `available` в history | `available` в history | `available` в history |
| Native compaction event | `inferred` harness-specific; не общий contract | `inferred` harness-specific | `inferred` harness-specific |
| Goal survival after resume | `unavailable` — goal отсутствует | `inferred`; требует resume spike | `unavailable` — goal отсутствует |
| Cache TTL | `unavailable` | `unavailable` | `unavailable` |

Если `OMNIGENT_*_PATH` или fallback resolver обходит пользовательский wrapper, worker не запускается до исправления resolution.

### 9.3. Paseo — official docs snapshot 2026-08-05, локально не установлен

Все положительные claims имеют статус `inferred`.

| Capability | Claude route | Codex route | OpenCode route |
|---|---|---|---|
| Запуск через PATH/subscription CLI | `inferred` | `inferred` | `inferred` |
| Persistent agent/workspace | `inferred` | `inferred` | `inferred` |
| Persisted automatic goal | `unavailable` — equivalent не найден | `inferred` для release с documented `/goal` support | `unavailable` — equivalent не найден |
| Completion fallback | `inferred` persistent agent + `send/wait` | `inferred`, если goal не активирована | `inferred` persistent agent + `send/wait` |
| Full reviewer turn | `inferred` через полный `logs` timeline | `inferred` через полный `logs` timeline | `inferred` через полный `logs` timeline |
| Context occupancy | `inferred` в UI/events; CLI schema не подтверждена | `inferred` в UI/events | `inferred` в UI/events |
| Last-turn timestamp | `inferred` | `inferred` | `inferred` |
| Compaction observation | `unavailable` для Claude как подтверждённый CLI contract | `inferred` по documented Codex compaction events | `inferred` по documented OpenCode compaction events |
| Native compact action | `unavailable` как проверенный Paseo CLI operation | `inferred` через underlying Codex capability | `inferred` через underlying OpenCode capability |
| Goal survival after resume | `unavailable` | `inferred`; требует local validation | `unavailable` |
| Cache TTL | `unavailable` | `unavailable` | `unavailable` |

До локального validation Paseo backend не должен заявляться как production-ready implementation target. Он остаётся specification-ready target с обязательным installation/version spike в migration plan.

---

## 10. Context, compaction и cache policy

Для каждой пары backend × route решение принимается по таблицам выше.

- `available`: использовать native structured signal.
- `inferred`: проверить installed version до автоматического решения.
- `unavailable`: не выдумывать telemetry; оценивать coherent output и task progress.
- Native compact вызывается только при подтверждённой capability или через underlying interactive harness.
- Fresh actor создаётся после неудачной compaction, противоречивого context или когда task/spec + Git reality проще восстановления.
- Искусственные turns для cache warmth запрещены.
- Provider thresholds не переносятся между routes.
- Cache TTL и subscription cold-resume price считаются неизвестными для всех девяти комбинаций.
- Общий cache tracker не создаётся.

---

## 11. Полный reviewer result

### Herdr

1. Читать `recent-unwrapped`.
2. Не считать фиксированный terminal tail полным ответом.
3. При возможной потере output попросить reviewer записать предыдущее сообщение verbatim в Markdown-файл.
4. Прочитать файл полностью.
5. Ручное открытие session допустимо.

### Omnigent

1. Экспортировать native conversation.
2. Выбрать последнее завершённое assistant message.
3. Не использовать terminal pane как authoritative source.
4. При отсутствии export у конкретного harness использовать native UI/API или file export.

### Paseo

До локальной проверки flow имеет статус `inferred`:

1. Получить полный `paseo logs <agent>` timeline.
2. Выделить последнее завершённое assistant event.
3. Не использовать `--tail N`.
4. Если installed schema не даёт устойчивую event boundary, использовать verbatim Markdown export.
5. Только после локального fixture test изменить статус на `available`.

---

## 12. Standalone `mo-review`

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

Типы описывают границы, но не требуют JSON transport.

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

Loop:

1. Два независимых reviewers получают artifact.
2. Первый проход не раскрывает findings другого.
3. Проверяются completeness, correctness, architecture, necessity, reuse, purpose, knowledge и verification.
4. Полные messages передаются автору.
5. После fixes оба reviewer проверяют новую revision.
6. PASS должен относиться к одной revision.

Для non-code artifacts code-specific lenses отключаются.

Споры сначала возвращаются исходному reviewer, затем второму reviewer как targeted arbitration. Отдельный adjudicator не создаётся.

Subagent fan-out: 0 для маленькой задачи, 2–4 для средней, до 6 для крупной.

---

## 13. Model discovery и settings

```text
~/.meta-o/
  settings.json
  projects/
    <sha256(realpath(project-root))>.json
  model-catalog.json
```

Запрещено сохранять run progress, candidate, sessions, findings и gates.

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
```

### Private helper

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

- `TOOL_NOT_FOUND`;
- `DISCOVERY_UNAVAILABLE`;
- `AUTH_UNAVAILABLE`;
- `CORRUPT_SETTINGS`;
- `AMBIGUOUS_LINEAGE`.

### Helper justification

| Вопрос | Ответ |
|---|---|
| Ненадёжная prompt-операция | Multi-source catalog/history, dedupe и release lineage |
| Почему skill недостаточен | Source formats различаются и меняются |
| Invariants | Нет worker launch; deterministic dedupe; только high-confidence successor; atomic write |
| Non-happy path | Новый route требует отдельного reader, не изменения workflow |
| Proxy risk | Helper не принимает prompts и не создаёт sessions |
| Maintenance | SDK readers + unit tests; failure деградирует до saved default |

Helper создаётся только после capability spike. Если прямых официальных CLI достаточно, vNext остаётся pure-skills.

---

## 14. Human attention policy

User gate нужен только для:

- product scope/meaning;
- irreversible или внешне дорогого действия;
- production data/credentials;
- внешней блокировки;
- неразрешимого product dispute;
- существенной смены subscription route.

Не требуют gate:

- project tool execution;
- обратимые implementation decisions;
- очевидные Make aliases;
- повторный QC/review;
- executor continuation;
- reuse existing model set после restart.

---

## 15. Project QC

### Contract

Сначала переиспользуются Make targets, package scripts и native task runner.

```text
mo-qc
mo-lint
mo-typecheck
mo-test
mo-build
mo-smoke
mo-e2e
```

`mo-qc` рекомендуется как aggregate. Остальные targets условны. Executor добавляет aliases; orchestrator их только обнаруживает.

Agent-required `mo-e2e` печатает `AGENT_REQUIRED` и завершается кодом 2, чтобы help не считался PASS.

### Python

- Ruff;
- existing mypy/Pyright;
- pytest;
- Import Linter;
- Interrogate;
- semantic review purpose.

[Import Linter](https://import-linter.readthedocs.io/en/latest/), [Interrogate](https://interrogate.readthedocs.io/en/latest/)

### TypeScript compatibility profile

- `tsc --noEmit`, `tsc -b` или existing framework checker;
- ESLint flat config;
- `typescript-eslint` typed lint;
- existing test runner;
- optional `eslint-plugin-jsdoc`;
- Prettier отдельно.

[TypeScript `noEmit`](https://www.typescriptlang.org/tsconfig/noEmit.html), [TypeScript `strict`](https://www.typescriptlang.org/tsconfig/strict.html), [typescript-eslint](https://typescript-eslint.io/getting-started/typed-linting/)

### TypeScript fast profile

- отдельный `tsc`;
- type-aware Oxlint;
- existing test runner.

Oxlint не является основанием автоматически мигрировать existing ESLint stack или удалить typecheck. [Oxlint](https://oxc.rs/docs/guide/usage/linter/type-aware.html)

### Tests

- `node:test` для простого Node-only greenfield;
- Vitest для Vite/frontend/DOM и richer tooling;
- existing Jest сохраняется.

[Node test runner](https://nodejs.org/api/test.html), [Vitest](https://vitest.dev/guide/)

### Code health

Ориентиры:

- complexity warning 10, error 15;
- function 60–80 строк;
- file 400–500 строк;
- statements 30–40.

Используются native Ruff/ESLint/Oxlint rules. Generated, declarations, migrations и declarative config получают exclusions; tests — более мягкие thresholds.

---

## 16. Purpose, architecture и knowledge

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
  <scenario-group>.md
```

Knowledge sync переносит только устойчивые факты:

- business behavior → `business.md`;
- terminology → `glossary.md`;
- boundaries/invariants/rationale → `architecture/`;
- local causal context → purpose/comment;
- debt → `todo.md`.

`KnowledgeImpactPlan` не нужен.

Canonical architecture principles хранятся в `docs/architecture/development-principles.md`; `AGENTS.md` и `CLAUDE.md` коротко требуют его читать.

Purpose объясняет why, role, invariant и последствия удаления. Modules, public API, classes, architectural boundaries и overload declarations покрываются всегда; nontrivial private/test symbols — по risk-based policy. Mechanical tools проверяют наличие, reviewers — смысл.

---

## 17. E2E

| Форма | Исполнитель | Contract |
|---|---|---|
| Console smoke | Executor | Детерминированная команда |
| Agentic benchmark | Отдельный tester | Text instructions, selection, output, cleanup |
| Browser E2E | Отдельный tester | `agent-browser` skill + relevant scenarios |

`e2e.json` удаляется: machine consumer отсутствует.

---

## 18. Recovery, status и PATH

Recovery использует task/spec, Git branch/status/log, Make/task-runner output и native sessions. Exact replay не обещается.

User-facing status:

- `idle`;
- `needs_attention`.

Backend запускает canonical `claude`, `codex`, `opencode` через inherited PATH. Absolute Homebrew/app binaries, duplicated permission flags и LLM API proxies запрещены.

---

## 19. `mo-watchdog`

Baseline — одна watchdog session на одну orchestrator session.

Watchdog читает native state, сообщает о `needs_attention` и может написать живому orchestrator. Он не делает takeover, не запускает features, не мутирует state и не обслуживает несколько проектов.

Собственный runtime и service units отсутствуют.

---

## 20. Reflection

Trigger:

- повторённый root cause;
- defect прошёл до E2E;
- повторный cycle выявил системный пробел;
- backend failure регулярно расходует human time.

```markdown
- Area/path:
  Problem or incident:
  Why earlier checks missed it:
  Practical risk:
  Proposed follow-up:
```

Запись помещается в `docs/todo.md`. Пользователь решает, брать ли follow-up.

Substantive отклонённый finding оставляет code-adjacent rationale, если будущий reviewer иначе потеряет важный constraint.

---

## 21. Tooling audit

| Компонент | Решение | Замена |
|---|---|---|
| Public CLI | Delete | Skills/native CLI |
| FSM/run state | Delete | Git/spec/sessions |
| Model preferences | Replace | Conditional model helper |
| Findings/gates | Delete | Full messages + SHA |
| Snapshot digest | Delete | Commit SHA |
| Worktree helpers | Direct CLI | Git/backend workspaces |
| Backend adapters | Delete | Three direct skills |
| Capability suite | Delete | Minimal preflight |
| `execute-feature` | Delete | Spec, goal, instructions, QC/review |
| Reuse skill | Replace | `mo-reuse` |
| Review skill | Replace | `mo-review` |
| Adjudicator | Delete | Targeted arbitration |
| E2E skill | Move into references | Conditional tester |
| Context tracker | Delete | Route-specific native signals |
| Installer/updater | Delete | APM/skills |
| Watchdog runtime | Replace | `mo-watchdog` |
| QC manifest/results | Delete | Commands/output |
| Knowledge plan | Delete | Direct sync |
| E2E/adoption metadata | Delete | Docs + SHA |
| Baseline | Defer | Thresholds first |
| Import graph | Delete | Import Linter |
| Markdown regex parser | Delete | AST only if later needed |
| Lessons ledger | Delete | `docs/todo.md` |
| Handoff protocol | Delete | Git/spec/session reality |

---

## 22. Audit текущих `.mjs`

Verdicts распространяются на source counterparts generated `dist` files.

### Delete: adapters и CLI

- `dist/adapters/adapter.mjs`
- `capability-suite.mjs`
- `herdr-evidence.mjs`
- `herdr-output.mjs`
- `herdr-protocol.mjs`
- `herdr-stop.mjs`
- `herdr.mjs`
- `dist/cli/meta-o.mjs`
- `args.mjs`
- `repo-json.mjs`
- `watchdog-main.mjs`

Замена: skills и direct native CLI.

### Delete: CLI commands

- `backend.mjs`
- `candidate-guards.mjs`
- `decisions.mjs`
- `findings-cli.mjs`
- `gate-evidence.mjs`
- `gate-order.mjs`
- `gates.mjs`
- `ownership.mjs`
- `preflight-cli.mjs`
- `project.mjs`
- `results.mjs`
- `run-context.mjs`
- `run-start.mjs`
- `run.mjs`
- `session-state.mjs`
- `session.mjs`
- `watchdog-cli.mjs`
- `watchdog-home.mjs`
- `weakening.mjs`
- `write-ahead.mjs`

Замена: orchestrator reasoning, candidate SHA, project commands и native sessions.

### Delete: core

- `adoption.mjs`
- `canonical-json.mjs`
- `clock.mjs`
- `config.mjs`
- `e2e-registry.mjs`
- `e2e-result.mjs`
- `findings.mjs`
- `fsm.mjs`
- `git.mjs`
- `hash.mjs`
- `knowledge-files.mjs`
- `knowledge.mjs`
- `markdown.mjs`
- `module-anchors.mjs`
- `paths.mjs`
- `policy.mjs`
- `preflight.mjs`
- `qc.mjs`
- `redact.mjs`
- `role-view.mjs`
- `snapshot.mjs`
- `spec-input.mjs`
- `state-store.mjs`
- `types.mjs`
- `worktree.mjs`

### Replace, do not retain

- `model-set.mjs` → conditional `model-discovery.mjs`;
- `project-key.mjs` → минимальная hash(realpath) function;
- `safe-fs.mjs` → минимальный atomic settings write.

Существующие APIs и workflow coupling не сохраняются.

### Delete: watchdog runtime

- `dist/watchdog/classifier.mjs`
- `decide.mjs`
- `watchdog.mjs`

Замена: `mo-watchdog`.

### Quality scripts

| Файл | Verdict |
|---|---|
| `quality/bootstrap.mjs` | Delete |
| `code-health.mjs` | Replace with Ruff/ESLint/Oxlint |
| `format-check.mjs` | Replace with native formatter |
| `import-graph.mjs` | Replace with Import Linter |
| `lint.mjs` | Replace with direct lint command |
| `purpose-check.mjs` | Replace with Interrogate/eslint-plugin-jsdoc/review |
| `run-qc.mjs` | Replace with Make/native aggregate |
| `run-tests.mjs` | Replace with native test runner |
| `verify-e2e-metadata.mjs` | Delete |

`tests/fixtures/fake-herdr.mjs` удаляется вместе с adapter tests.

Единственный условный новый executable:

```text
dist/skills/_private/model-discovery.mjs
```

Он допускается только после capability spike и не импортирует prompt/session/worker APIs.

---

## 23. Distribution

```text
dist/
  skills/
    mo-orchestrate/
      SKILL.md
      references/{workflow,herdr,goal}.md
    mo-orchestrate-omnigent/
      SKILL.md
      references/{workflow,omnigent,goal}.md
    mo-orchestrate-paseo/
      SKILL.md
      references/{workflow,paseo,goal}.md
    mo-reuse/
      SKILL.md
      references/research-checklist.md
    mo-review/
      SKILL.md
      references/review-lenses.md
    mo-watchdog/
      SKILL.md
    _private/
      model-discovery.mjs
  README.md
  LICENSE
```

Каждый skill self-contained. Runtime installer отсутствует.

[Microsoft APM](https://github.com/microsoft/apm), [Vercel skills](https://github.com/vercel-labs/skills)

---

## 24. Implementation и migration

1. Написать новую authoritative master-spec и decision ledger.
2. Реализовать pure-skills baseline.
3. Проверить Herdr goal/output/PATH/recovery.
4. Проверить Omnigent goal/export/resume/PATH.
5. Установить Paseo в disposable environment и перевести capabilities из `inferred` в `available` либо `unavailable`.
6. Провести model-helper admission spike.
7. Подготовить Python/TypeScript QC references.
8. Удалить CLI, FSM, state, adapters, receipts, registries, watchdog runtime и installers.
9. Удалить generated artifacts и obsolete tests.
10. Провести по одному реальному acceptance flow на каждом backend.

Paseo skill не объявляется завершённым, пока локальная validation matrix не зафиксирует:

- installed version;
- PATH resolution каждого route;
- full last-message retrieval;
- `/goal` activation;
- resume;
- status;
- context/compaction signals.

---

## 25. Риски

| Риск | Mitigation |
|---|---|
| Backend docs расходятся с runtime | Versioned capability matrix |
| Paseo claims принимаются без установки | Все claims `inferred`; mandatory installation spike |
| Route differences скрываются backend table | Отдельная матрица Claude/Codex/OpenCode |
| Goal становится обычным текстом | Interactive activation + visible verification |
| Full result теряется | Transcript API/file export |
| Проверяются разные revisions | Candidate SHA |
| Model helper растёт в launcher | Import/API prohibition |
| Wrapper bloat возвращается | Helper admission test |
| Skills расходятся | Semantic acceptance checklist |
| Purpose становится формальностью | Review causal meaning |
| Recovery ошибается | Только observable facts |
| Watchdog создаёт ложную уверенность | Нет takeover/liveness promise |

---

## 26. Decision ledger

### Принято

- skills-first;
- отсутствие executor skill;
- direct backend skills;
- route-specific capability assessment;
- mandatory reuse;
- native goal only when verified;
- persistent-session fallback;
- standalone review;
- candidate SHA;
- conditional E2E tester;
- minimal model settings;
- optional watchdog;
- native QC tools;
- standard skill distribution.

### Отклонено

- workflow CLI;
- FSM/run state;
- generic adapter;
- structured findings;
- snapshots/receipts;
- mandatory worktrees;
- automatic recovery;
- manifests/registries;
- custom import graph;
- service watchdog;
- fixed reviewer fan-out;
- separate adjudicator;
- installer/updater.

### Отложено

- deterministic watchdog;
- machine E2E registry;
- brownfield baseline;
- custom purpose checker;
- architecture hygiene auditor;
- cache economics automation.

---

## 27. Assumptions

- Herdr evidence относится к локальной версии 0.8.0.
- Omnigent evidence относится к локальной версии 0.6.0.
- Paseo локально отсутствует; все положительные claims основаны на official docs snapshot 2026-08-05 и имеют статус `inferred`.
- Goal survival после resume не считается доказанным без отдельного backend × route test.
- Cache TTL и cold-resume economics считаются unavailable для всех routes.
- Task без spec материализуется в readable tracked spec.
- Model helper остаётся условным.
- Global architecture audit не входит в feature workflow.

---

## 28. Pre-mortem против control-layer bloat

Любой новый executable до реализации обязан ответить:

1. Какой наблюдаемый failure он предотвращает?
2. Почему direct CLI и skill недостаточны?
3. Какой invariant требует кода?
4. Кто consumer результата?
5. Каков ущерб без helper?
6. Как часто нужен non-happy path?
7. Не ограничивает ли helper native interface?
8. Какова цена backend update?
9. Можно ли сначала измерить failure?
10. Можно ли удалить helper без изменения workflow?
11. Имеет ли он prompt/session/worker APIs?
12. Не создаёт ли он operational state под видом settings?

Без конкретного failure, consumer и invariant решение остаётся skill-инструкцией, прямой CLI-командой либо отклоняется.