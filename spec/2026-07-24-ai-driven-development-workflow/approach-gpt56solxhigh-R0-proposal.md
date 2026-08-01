# Master-spec: AI Feature Integrity Workflow

## 1. Краткий подход

Методология строится вокруг одной неизменяемой feature-спеки, одного сильного исполнителя и трёх независимых проверочных сессий; управление осуществляется тонким CLI-neutral оркестратором поверх Herdr либо Omnigent. Устойчивое знание хранится не в истории feature-документов, а в компактной причинной цепочке `business → architecture → module → symbol`, а готовность определяется аттестациями двух ревьюеров и E2E на одной Git-ревизии.

Главное решение — отделить долговечную истину проекта от временного состояния feature: спецификация, вопросы, findings и промежуточные решения обслуживают текущий run, а после завершения остаются только актуальный код, knowledge layer, тесты и компактное verification state.

---

# 2. Границы системы

## 2.1. Обязательный вход

```ts
interface FeatureSpecRef {
  locator: string;                 // repo-relative path, absolute path or URL
  kind: "tracked" | "local" | "url";
  sha256: string;                  // immutable content digest
  disposition: "delete_after_sync" | "external";
}
```

Оркестратор проверяет только доступность и неизменность содержимого. Он не оценивает полноту, не переписывает и не «улучшает» feature-спеку.

Изменение digest во время run даёт терминальную ошибку `SPEC_MUTATED`. Продолжение возможно только новым run с новой утверждённой спекой.

## 2.2. Вне scope

- создание и утверждение feature-спеки;
- push, PR, merge и межпользовательские блокировки;
- разработка собственного session runtime;
- глобальный периодический архитектурный аудит и очистка feature flags;
- хранение истории review findings;
- CI как обязательная часть завершения;
- быстрые режимы с ослабленными gates.

## 2.3. Репозиторные источники истины

```text
docs/
├── agent-entry.md
├── business/
│   └── <domain>.md
├── architecture/
│   └── <domain>.md
├── todo.md
└── verification-state.json

tools/
├── qc
├── qc-fast
├── purpose_lint.py
├── code_health.py
└── knowledge-lint.mjs

.quality/
└── code-health-baseline.json

pyproject.toml
.importlinter
```

Feature-спеки, run logs, review ledgers, session summaries и screenshots в эту структуру не входят.

---

# 3. Архитектура компонентов

| Компонент | Ответственность | Не делает |
|---|---|---|
| `workflow-orchestrator` | State machine, запуск ролей, маршрутизация сообщений, revision gates, решения технических споров | Не читает весь код, не пишет код, не переписывает спеку |
| `executor` | Исследует проект, выбирает инженерный путь, реализует всю спеку, обновляет знания, тесты и commits | Не уменьшает scope и не закрывает findings как backlog |
| `reviewer-primary` | Независимый review моделью той же vendor/model family | Не получает reasoning исполнителя или findings второго ревьюера |
| `reviewer-cross-vendor` | Независимый review моделью другого производителя | Не считается независимым только из-за другого CLI |
| `e2e-tester` | Проверяет фактическое поведение exact revision | Не меняет tracked files |
| `local-qc` | Детерминированные механические gates | Не оценивает бизнес-смысл purpose |
| `knowledge-layer` | Актуальная причинная модель проекта | Не хранит историю feature |
| `backend-adapter` | Сопоставляет протокол с Herdr либо Omnigent | Не создаёт собственный daemon, очередь или session DB |
| `watchdog` | Опционально обнаруживает quota/stale states и вызывает безопасный reconcile | Не понимает проект и не принимает продуктовые решения |

Herdr и Omnigent являются взаимозаменяемыми backend. Методология зависит только от capability contract.

---

# 4. Lifecycle одной feature

## 4.1. Состояния

```ts
type RunState =
  | "AWAITING_MODEL_SET"
  | "PREFLIGHT"
  | "SOLUTION_SCAN"
  | "EXECUTING"
  | "LOCAL_QC"
  | "CROSS_REVIEW"
  | "E2E"
  | "ATTESTING"
  | "COMPLETE"
  | "PAUSED_EXTERNAL"
  | "PAUSED_QUOTA"
  | "PAUSED_MODEL_UNAVAILABLE"
  | "PAUSED_TECHNICAL_DISPUTE"
  | "STOPPED_SPEC_IMPOSSIBLE"
  | "FAILED_BACKEND";
```

Ни review defects, ни E2E failures не являются терминальным `FAILED`: они возвращают run в `EXECUTING`.

## 4.2. Последовательность

### Шаг 1. Model gate

При каждом пользовательском `start` или `resume` оркестратор показывает четыре модели:

- executor;
- reviewer-primary;
- reviewer-cross-vendor;
- e2e-tester.

Пользователь подтверждает набор либо выбирает новый; новый набор сохраняется как пользовательский default. Автоматический retry или watchdog wake не считается пользовательским resume и использует уже закреплённый набор.

Проверяется:

```text
reviewer-primary.vendor == executor.vendor
reviewer-primary.family == executor.family
reviewer-cross-vendor.vendor != executor.vendor
```

OpenCode, Claude CLI и Codex CLI — routes, а не model vendors.

### Шаг 2. Preflight

Оркестратор фиксирует:

- spec digest;
- base revision;
- feature branch;
- чистоту worktree;
- backend capabilities;
- наличие `tools/qc`;
- model set;
- политику handoff;
- политику solution scan.

Запрещён запуск из dirty tracked worktree. Неигнорируемые untracked files также блокируют gate: E2E не должен зависеть от некоммитнутого состояния.

### Шаг 3. Solution scan

Рекомендация: выполнять здесь, а не при создании спеки. Это техническое исследование, а feature-спека уже является immutable business contract.

Значение по умолчанию — `auto`. Scan обязателен, если feature включает:

- протоколы, парсеры, auth, crypto, storage или scheduling;
- нетривиальный алгоритм;
- новую инфраструктурную возможность;
- ориентировочно более 200 строк собственного инфраструктурного кода;
- названную в спеке библиотеку, которую нужно проверить на актуальность.

Результат временный:

```ts
interface SolutionScanResult {
  status: "adopt" | "build" | "not_applicable" | "business_escalation";
  candidates: Array<{
    name: string;
    source: string;
    license?: string;
    compatibility: string;
    maintenanceRisk: string;
  }>;
  rationale: string;
}
```

Если найденный вариант меняет business semantics, run эскалируется. Спека не редактируется.

### Шаг 4. Execution

Executor получает:

- полную immutable spec;
- `docs/agent-entry.md`;
- рабочую ветку;
- текущий decision log;
- открытые findings;
- опциональный handoff.

Он самостоятельно декомпозирует работу, но обязан:

- реализовать весь scope;
- исправить технический долг в затронутой области;
- добавить тесты и observability;
- обновить knowledge layer пропорционально реальному изменению;
- удалить tracked feature-spec из рабочего поискового контура;
- сделать локальные commits;
- оставить clean worktree.

Executor — единственная роль, меняющая tracked files.

### Шаг 5. Local QC

После каждого нового commit выполняется полный `./tools/qc`.

Ошибка возвращает executor только компактный stdout/stderr и exit code. Заявление агента «проверки прошли» не является evidence.

### Шаг 6. Cross-review barrier

Оба reviewer работают независимо на detached worktree одной ревизии. Они получают:

- immutable spec;
- repository snapshot;
- knowledge layer;
- diff от base revision;
- результаты local QC.

Они не получают implementation summary исполнителя и findings друг друга.

Оба должны вернуть `PASS` для одного SHA. При исправлении любого tracked файла все предыдущие review- и E2E-аттестации сбрасываются.

### Шаг 7. E2E

Tester получает exact SHA, feature spec и business anchors. Он запускает систему в отдельном runtime namespace и проверяет пользовательские сценарии.

Tester не имеет права исправлять код или постоянные тесты. Любая необходимость изменения возвращается как finding executor.

### Шаг 8. Revision invariant

Канонический цикл:

```text
EXECUTING
  → commit R
  → LOCAL_QC(R)
  → REVIEW_A(R) + REVIEW_B(R)
  → E2E(R)
  → COMPLETE(R)
```

Любое tracked изменение до завершения выполняет:

```ts
function onRevisionChanged(newRevision: string): void {
  qc = "UNKNOWN";
  reviews = { primary: "UNKNOWN", crossVendor: "UNKNOWN" };
  e2e = "UNKNOWN";
  verifiedRevision = null;
}
```

После E2E finding новый commit обязан снова пройти QC и оба review до следующего E2E.

### Шаг 9. Attestation

```ts
interface RevisionAttestation {
  specDigest: string;
  verifiedRevision: string;
  qc: GateAttestation;
  reviews: [ReviewAttestation, ReviewAttestation];
  e2e: E2EAttestation;
  knowledgeLint: GateAttestation;
  worktreeClean: true;
}
```

`COMPLETE` допустим только если все поля относятся к одному SHA.

### Шаг 10. Verification state

После успешной аттестации создаётся отдельный metadata-only commit, меняющий исключительно `docs/verification-state.json`.

В записи указывается проверенный executable revision, а не SHA metadata commit:

```json
{
  "schema_version": 1,
  "scenarios": {
    "E2E-CHECKOUT-01": {
      "business_links": ["§B-CHECKOUT-01"],
      "description": "Customer completes checkout and receives an order",
      "verified_at": "2026-07-24T18:20:00Z",
      "git_revision": "40-character-executable-revision",
      "status": "passed",
      "environment": "local:docker-compose"
    }
  }
}
```

Механический gate проверяет, что diff metadata commit содержит только этот файл. Это устраняет циклическую проблему: commit не может заранее содержать собственный SHA.

---

# 5. Контракты оркестрации

## 5.1. Run state

```ts
interface FeatureRun {
  runId: string;
  state: RunState;
  projectRoot: string;
  baseRevision: string;
  currentRevision: string | null;
  verifiedRevision: string | null;
  spec: FeatureSpecRef;
  modelSet: ModelSet;
  sessions: Record<Role, SessionRef>;
  sessionGeneration: Record<Role, number>;
  decisions: DecisionRecord[];
  openFindings: Finding[];
  attestations: {
    qc?: GateAttestation;
    reviews?: Partial<Record<ReviewerRole, ReviewAttestation>>;
    e2e?: E2EAttestation;
  };
  handoff: "none" | { path: string; maxBytes: 4096 };
}
```

Run state хранится средствами Herdr/Omnigent. Репозиторный task ledger не создаётся.

## 5.2. Model set

```ts
interface ModelSelection {
  route: "claude" | "codex" | "opencode";
  vendor: string;
  family: string;
  model: string;
  effort?: string;
  safeContextTokens?: number;
  coldResumeTokens?: number;       // default 100000
  cacheTtlSeconds?: number;
}

interface ModelSet {
  executor: ModelSelection;
  reviewerPrimary: ModelSelection;
  reviewerCrossVendor: ModelSelection;
  e2eTester: ModelSelection;
}
```

Default хранится в пользовательской конфигурации backend, не в проекте. API keys там не хранятся.

## 5.3. Decision request

```ts
interface DecisionRequest {
  id: string;
  revision: string;
  category:
    | "local_implementation"
    | "architecture"
    | "business_semantics"
    | "irreversible"
    | "external_dependency";
  question: string;
  options: Array<{
    id: string;
    consequences: string[];
    evidence: string[];
  }>;
  recommendation: string;
  specImpact: "none" | "possible" | "certain";
  reversible: boolean;
}
```

Оркестратор самостоятельно решает только при выполнении всех условий:

```text
specImpact == none
reversible == true
решение не меняет §B-* и acceptance behavior
решение не расширяет scope
```

При сомнении он запрашивает независимое мнение reviewer. Любой возможный business impact передаётся пользователю.

## 5.4. Decision log

```ts
interface DecisionRecord {
  id: string;
  requestId?: string;
  authority: "orchestrator" | "user";
  choice: string;
  rationale: string;
  durability: "run" | "code" | "architecture" | "business";
  knowledgeTargets: string[];
  createdAt: string;
}
```

Decision log временный. При knowledge sync:

- `run` удаляется;
- `code` интегрируется в purpose/rationale рядом с кодом;
- `architecture` интегрируется в `§A-*`;
- `business` допустим только после пользовательского решения и интегрируется в `§B-*`.

## 5.5. Review finding

```ts
type Severity = "blocker" | "major" | "minor" | "suggestion";

interface Finding {
  id: string;
  reviewerRole: "reviewer-primary" | "reviewer-cross-vendor";
  revision: string;
  severity: Severity;
  classification: "defect" | "engineering_risk" | "taste";
  summary: string;
  evidence: Array<{
    path: string;
    line?: number;
    observation: string;
  }>;
  basis: {
    type: "spec" | "business" | "architecture" | "engineering";
    reference: string;
  };
  impact: string;
}
```

Все `defect` и `engineering_risk`, включая `minor`, блокируют завершение. `taste` не блокирует только при явном доказательстве отсутствия влияния на спецификацию, риск и сопровождаемость.

Findings живут только в run state и сессиях. После `COMPLETE` они удаляются.

## 5.6. Backend adapter port

Это skill-level contract, а не новая библиотека или daemon:

```ts
interface SessionBackend {
  capabilities(): Promise<BackendCapabilities>;
  open(request: OpenSessionRequest): Promise<SessionRef>;
  send(request: SendTurnRequest): Promise<TurnReceipt>;
  readEvents(cursor: EventCursor): Promise<EventBatch>;
  inspect(session: SessionRef): Promise<SessionSnapshot>;
  resume(session: SessionRef): Promise<SessionRef>;
  replace(request: ReplaceSessionRequest): Promise<SessionRef>;
  dispose(session: SessionRef): Promise<void>;
  reconcile(runId: string, expectedStateVersion: number): Promise<ReconcileResult>;
}
```

Обязательные capabilities:

- durable session IDs;
- replayable event cursor;
- delivery acknowledgement или idempotency keys;
- inspectable session state;
- resume/replace;
- per-session working directory;
- exact revision checkout.

Если backend не обеспечивает хотя бы одну capability, preflight завершается `FAILED_BACKEND/CAPABILITY_MISSING`. Методология не дописывает собственную очередь для компенсации.

## 5.7. Ошибки

| Код | Поведение |
|---|---|
| `SPEC_MUTATED` | Текущий run терминально останавливается |
| `SPEC_IMPOSSIBLE` | Два reviewer проверяют evidence; при подтверждении — `STOPPED_SPEC_IMPOSSIBLE` |
| `PROVIDER_TRANSIENT` | Backend retry с idempotency key |
| `QUOTA_EXHAUSTED` | `PAUSED_QUOTA`, resume после reset |
| `AUTH_REQUIRED` | `PAUSED_EXTERNAL` |
| `SESSION_LOST` | Создать session generation +1 и восстановить из spec, Git, decisions и findings |
| `DELIVERY_UNCERTAIN` | Только `reconcile`, никогда слепой повтор команды |
| `MODEL_UNAVAILABLE` | Пользовательский resume с повторным model gate |
| `TECHNICAL_DISPUTE` | До двух rebuttal-циклов, затем решение оркестратора по evidence |
| `BACKEND_STATE_LOST` | `FAILED_BACKEND`; новый runtime разрабатывать запрещено |

---

# 6. Subspec: `knowledge-layer-spec.md`

## 6.1. Слои

### Business

Файлы `docs/business/<domain>.md`.

```markdown
## §B-TIME-01 — Не принимать устаревшее продление аренды

Система должна предотвращать использование аренды после утраты её причинной
актуальности, иначе параллельный worker может перезаписать более новое
состояние.

Если правило отменяется, защита от stale renewal и связанные проверки больше
не нужны.
```

Business layer не описывает классы, базы данных или библиотеки.

### Architecture

Файлы `docs/architecture/<domain>.md`.

```markdown
## §A-TIME-02 — Решение о продлении использует monotonic lease generation

Это решение реализует §B-TIME-01. Поколение аренды сравнивается до любого
побочного эффекта; wall-clock timestamp не является достаточным доказательством
актуальности.

При отмене решения generation checks и соответствующее состояние можно удалить.
```

Каждый `§A-*` обязан ссылаться хотя бы на один существующий `§B-*`.

### Module

Python module docstring:

```python
"""Protect lease renewal from stale causal state.

§M-TIME-01 implements §A-TIME-02. Without this module, a delayed worker could
renew an obsolete lease after a newer owner has already acquired it.
"""
```

Каждый first-party module объявляет ровно один основной `§M-*` и ссылается минимум на один `§A-*`.

### Symbol

```python
def reject_stale_renewal(candidate: Lease, current: Lease) -> None:
    """Prevent an obsolete lease generation from producing side effects (§M-TIME-01)."""
```

Каждый class, function и method, включая private, nested, async, property setter и dunder method, имеет docstring с причиной существования и ссылкой на `§M-*` своего модуля.

Прямые дополнительные ссылки на `§A-*` или `§B-*` допустимы, но не заменяют ссылку на непосредственный parent.

## 6.2. Формальные исключения

Исключаются только:

- lambdas и comprehensions как неименованные выражения;
- методы, автоматически создаваемые интерпретатором или генератором и отсутствующие в source AST;
- `@typing.overload` declarations, если реализация того же символа содержит purpose;
- файлы, удовлетворяющие одновременно explicit glob, generated marker и generator declaration;
- third-party vendored code вне first-party source roots.

Tests являются first-party code и purpose требуют.

Generated-конфигурация:

```toml
[[tool.ai_workflow.generated]]
glob = "src/**/_generated.py"
marker = "Generated file; do not edit."
generator = "python -m tools.generate_models"
```

Одного glob недостаточно.

## 6.3. Knowledge lint

`knowledge-lint` проверяет:

- уникальность anchor declarations;
- отсутствие dangling references;
- `§A → §B`;
- `§M → §A`;
- `symbol → §M` того же модуля;
- наличие purpose у всех first-party entities;
- отсутствие активной tracked feature-spec после sync;
- JSON Schema для verification state;
- отсутствие завершённых записей в `docs/todo.md`.

Orphan anchors выдаются как warning, а missing/dangling parent — error.

## 6.4. Knowledge sync

Гипотезу о предварительном внесении будущих TODO в business/architecture следует отклонить. Она загрязняет текущую истину обещанным поведением, создаёт лишний churn и особенно опасна при параллельных PR.

Вместо этого executor держит временный `KnowledgeImpactPlan` в run state:

```ts
interface KnowledgeImpactPlan {
  business: Array<{ action: "keep" | "add" | "update"; target?: string }>;
  architecture: Array<{ action: "keep" | "add" | "update"; target?: string }>;
  modules: string[];
  symbols: string[];
  specDisposition: "delete_after_sync" | "external";
}
```

Он применяется вместе с фактической реализацией до финальных gates.

## 6.5. Старые feature-спеки

- `tracked`: удалить из текущего tree после интеграции знаний;
- `local` или `url`: ничего не копировать в репозиторий;
- Git history остаётся историей, но обычный `rg` не находит старую спеку;
- никакой папки `docs/archive/features/` не создаётся.

## 6.6. Технический долг

`docs/todo.md` содержит только старый долг вне текущего scope:

```markdown
## §T-DEBT-014 — Разорвать цикл между billing и notifications

Detected: 2026-07-24
Area: `src/billing`, `src/notifications`
Risk: изменения retry policy требуют одновременного чтения двух доменов
Needed feature: dependency-boundary refactor
```

Долг в изменяемой сущности либо модуле исправляется в текущей feature. Baseline нельзя использовать для его дальнейшего сохранения.

---

# 7. Subspec: `role-skills-spec.md`

Предлагаемый skill bundle:

```text
skills/
├── workflow-orchestrator/
├── feature-executor/
├── solution-scan/
├── review-gate/
├── e2e-gate/
├── knowledge-sync/
├── project-adopt/
└── adapters/
    ├── herdr/
    └── omnigent/

tools-src/
├── knowledge-lint.ts
├── verification-lint.ts
└── watchdog.ts

dist/
├── knowledge-lint.mjs
├── verification-lint.mjs
└── watchdog.mjs

scripts/
└── install-skills.sh
```

TypeScript собирается release-процессом в single-file `.mjs` без runtime dependencies. Проект не хранит и не проверяет версию skills.

Нормативные QC-скрипты после adoption коммитятся в сам проект. Поэтому поведение QC воспроизводимо, даже если у разработчиков разные версии orchestration skills.

## 7.1. `feature-executor`

Вход:

```ts
interface ExecutorInput {
  spec: FeatureSpecRef;
  projectRoot: string;
  baseRevision: string;
  decisions: DecisionRecord[];
  findings: Finding[];
  handoff?: string;
}
```

Выход:

```ts
interface ExecutorResult {
  status:
    | "READY_FOR_QC"
    | "DECISION_REQUIRED"
    | "SPEC_IMPOSSIBLE"
    | "EXTERNAL_BLOCK";
  revision?: string;
  decisionRequest?: DecisionRequest;
  impossibility?: SpecImpossibility;
  changedFiles: string[];
  commits: string[];
}
```

## 7.2. `review-gate`

Единый короткий rubric:

1. coverage feature-spec и business intent;
2. correctness, failure paths, security, concurrency и data integrity;
3. тесты, observability и защита от false-success;
4. boundaries, complexity, coupling и долгосрочная изменяемость;
5. semantic adequacy purpose и отсутствие knowledge drift.

Порядок анализа reviewer выбирает сам.

## 7.3. `e2e-gate`

Tester обязан:

- подтвердить checkout exact SHA;
- поднять реальную локальную среду;
- выполнить каждый применимый acceptance scenario;
- проверить интеграции и runtime errors;
- вернуть business-linked evidence;
- не использовать `SKIPPED` как успешный результат.

Для библиотек или backend-only компонентов E2E означает реальный consumer/import/API scenario. Если end-to-end path объективно отсутствует, это design defect или повод для эскалации, а не автоматический pass.

## 7.4. Handoff

Опциональный, выбирается при старте. Один перезаписываемый файл, максимум 4096 bytes:

```markdown
Goal:
Spec digest:
Current revision:
Implemented:
Decisions:
Open findings:
Next action:
```

Он не является источником истины и не коммитится.

---

# 8. Subspec: `local-qc-python-spec.md`

## 8.1. Обязательные инструменты

- Ruff: format, lint, McCabe;
- mypy: type analysis;
- pytest: deterministic and integration tests;
- Import Linter: dependency boundaries;
- `purpose_lint.py`: AST-based purpose coverage;
- `code_health.py`: sizes, cognitive complexity, coupling and cycles;
- `knowledge-lint.mjs`: anchor graph and verification schema.

## 8.2. Команда

```bash
./tools/qc
```

Внутренняя последовательность:

```bash
python -m ruff format --check .
python -m ruff check .
python tools/purpose_lint.py --config pyproject.toml
node tools/knowledge-lint.mjs --config pyproject.toml
python tools/code_health.py --config pyproject.toml
lint-imports
python -m mypy .
python -m pytest
```

Stop on first failure допустим для быстрого feedback; перед review выполняется полный проход с объединённым summary.

## 8.3. Рекомендуемые Python defaults

```toml
[tool.ai_workflow.code_health]
source_roots = ["src", "tests"]
baseline = ".quality/code-health-baseline.json"
max_file_lines = 600
max_function_lines = 60
max_class_lines = 300
max_cyclomatic_complexity = 10
max_cognitive_complexity = 15
max_module_fan_out = 12
max_function_arguments = 8
forbid_dependency_cycles = true

[[tool.ai_workflow.code_health.path_overrides]]
glob = "tests/**"
max_file_lines = 900
max_function_lines = 100
max_class_lines = 400

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM", "C90", "PL", "D"]

[tool.ruff.lint.mccabe]
max-complexity = 10

[tool.ruff.lint.pydocstyle]
convention = "google"

[tool.mypy]
strict = true
```

Числа являются стартовой baseline, а не универсальным стандартом. Изменение лимитов требует обычной feature и review; executor не имеет права поднять threshold для прохождения текущего gate.

## 8.4. Метрики

`code_health.py` использует Python AST:

- file size: physical lines;
- function/class span: `end_lineno - lineno + 1`;
- cyclomatic complexity: branch nodes, handlers, boolean branches, comprehensions и match cases;
- cognitive complexity: nested control flow с penalty за глубину;
- module fan-out: distinct first-party imports;
- cycles: Tarjan SCC по first-party import graph;
- boundary violations: дополнительно Import Linter.

High fan-in сам по себе не считается дефектом: стабильное ядро закономерно имеет много consumers. Ограничивается fan-out и запрещённые направления зависимостей.

## 8.5. Brownfield baseline

`.quality/code-health-baseline.json` допустим только для существующих size/complexity/coupling violations. Purpose debt туда не попадает.

Правила ratchet:

- новые baseline entries запрещены;
- ухудшение существующей метрики запрещено;
- любое baseline violation в изменённой entity становится blocking;
- baseline entries вне scope могут сохраняться и отражаются в `docs/todo.md`;
- dedicated debt feature уменьшает или удаляет baseline.

Это позволяет внедрять code-health в brownfield без требования немедленно переписать весь проект, но не разрешает продолжать наращивать проблемный модуль.

## 8.6. Pre-commit, QC, pre-push

| Размещение | Роль |
|---|---|
| `pre-commit` | `./tools/qc-fast`: формат, Ruff, purpose и knowledge lint по changed files |
| `./tools/qc` | Единственный обязательный authoritative local gate |
| `pre-push` | Дублирует полный QC, но не является частью завершения |
| CI | Опционально повторяет `./tools/qc` без особой логики |

Pre-commit недостаточен: bypassable и обычно работает по diff. Pre-push слишком поздний и вообще не срабатывает, пока пользователь не попросил push.

## 8.7. Будущие адаптеры

| Стек | Основа |
|---|---|
| JS/TS | ESLint `complexity`, `max-lines`, `max-lines-per-function`, `import/no-cycle`, `eslint-plugin-boundaries`, custom JSDoc purpose rule |
| PHP | PHPStan/Psalm, PHPMD codesize/coupling, Deptrac, PHPDoc purpose rule |
| Multi-language | Общий `knowledge-lint.mjs`; language adapters отвечают только за AST и native docs |

---

# 9. Subspec: `watchdog-spec.md`

## 9.1. Выбор

Рекомендуется детерминированный watchdog. Локальная модель как основной контроллер добавляет вероятностный failure domain и способна ошибочно запустить работу дважды.

Гибрид допустим только для классификации неизвестного текста. Локальная модель:

- получает санитизированный error tail без кода и prompts;
- не отправляет сообщения в sessions;
- не меняет state;
- возвращает advisory classification;
- любое действие всё равно проходит детерминированную policy.

## 9.2. Конфигурация

```json
{
  "schema_version": 1,
  "poll_seconds": 30,
  "stale_turn_seconds": 300,
  "max_parallel_wakes": 2,
  "projects": [
    {
      "id": "project-a",
      "backend": "herdr",
      "run_locator": "backend-native-locator",
      "enabled": true
    }
  ],
  "local_classifier": {
    "enabled": false,
    "endpoint": "http://127.0.0.1:11434",
    "model": "local-model",
    "confidence_threshold": 0.95
  }
}
```

Один процесс обслуживает несколько проектов. Используется process lock, чтобы не возникло двух watchdog.

## 9.3. Retry policy

| Событие | Действие |
|---|---|
| structured transient provider failure | 1m, 5m, 15m, 30m, затем 60m; максимум 6 часов |
| quota с `retry_at` | `retry_at + 5m`, затем `reconcile` |
| auth/VPN/external dependency | уведомление и pause, без бесконечных retry |
| backend reports busy but no event >5m | безопасный `reconcile(expectedStateVersion)` |
| delivery status unknown | никогда не посылать `continue`; только reconcile |
| unknown error | notify; advisory local classification при включённом hybrid |

Watchdog не читает repository и не возобновляет child sessions напрямую. Он будит оркестратор через idempotent backend operation.

---

# 10. Project adoption

Hard requirement «purpose для каждой сущности» создаёт тяжёлый brownfield admission cost. Поэтому новый проект сразу создаётся со строгими gates, а существующий должен пройти отдельную approved adoption feature.

`project-adopt` создаёт:

- knowledge skeleton;
- `tools/qc` и lint tools;
- project-specific limits;
- dependency contracts;
- generated-code declarations;
- business/architecture anchors;
- module anchors;
- purpose docstrings для 100% first-party symbols;
- code-health baseline только для старой structural debt.

Adoption не является облегчённым режимом. В конце repository обязан пройти тот же local QC и два review. До этого он не считается совместимым с методологией.

---

# 11. Ключевая критика исходных решений

| Решение | Статус | Слабость и возможный отказ | Совместимый вариант | Альтернатива, нарушающая constraint |
|---|---|---|---|---|
| Purpose у каждого private symbol | Hard | Массовые бессодержательные docstrings и высокий drift tax | Минимум одна причинная строка + `§M-*`; semantics проверяются только review | Purpose только для modules, public API и high-risk symbols; дешевле и ближе к зрелому GRACE |
| Immutable feature-spec | Hard | Исполнитель может обнаружить объективно лучший продуктовый путь, но обязан остановиться | Строгая классификация technical/business impact и новый run при невозможности | Версионируемые amendments с human gate; гибче, но сложнее traceability |
| Reviewer той же model family | Hard | Ошибки исполнителя и reviewer могут быть коррелированы | Полная session isolation плюс обязательный cross-vendor reviewer | Оба reviewer другого vendor либо три reviewer; выше независимость и стоимость |
| Оркестратор далеко от кода, но решает технические споры | Hard intent | Убедительный summary может скрывать неверную локальную картину | Decision envelope с evidence и независимым counter-review | Отдельный technical arbiter, читающий код; точнее, но добавляет пятую роль |
| Sessions сохраняются внутри feature | Revisitable | Reviewer закрепляется на старой mental model | Сохранять, пока полезно; заменять после двух неудачных циклов, длинной паузы или context pressure | Fresh reviewer каждый round; дороже, но независимее |
| Skills не pin’ятся проектом | Hard | Разные машины могут исполнять разные protocols | Репозиторные QC scripts являются нормативными; skills только оркестрируют | Skill lockfile и compatibility check; воспроизводимее, но нарушает правило |
| Workflow без CI | Hard | Локальное окружение может быть уникальным или gate можно обойти | Exact local command, clean revision, independent sessions | Protected CI как обязательный final authority |
| Verification state в tracked file | Requirement | Запись SHA меняет SHA и создаёт рекурсию | Metadata-only commit, ссылающийся на проверенный parent revision | Git notes или внешнее attestation storage; технически чище, хуже переносится через PR |
| TODO-проекция feature до реализации | Hypothesis | Планируемое начинает выглядеть текущей истиной | Только transient `KnowledgeImpactPlan` | Явные planned sections в docs; удобнее планировать, но увеличивает drift |
| Findings исчезают после feature | Hard | Теряется материал для process learning | Устойчивый урок становится knowledge/todo; finding content удаляется | Анонимизированный defect ledger; полезнее для аналитики, но создаёт новый архив |

Самое сомнительное исходное решение — обязательный purpose для каждого private helper. Оно выполнимо, но противоречит требованию пропорциональности документации. Если пилот покажет большое число формальных, быстро протухающих docstrings, следует объективно рассмотреть risk-based scope, даже несмотря на текущий hard constraint.

---

# 12. Риски и защиты

## Purpose cargo cult

Защита: reviewer применяет counterfactual test — docstring должен объяснять, какая потребность или invariant исчезнет при удалении сущности. Пересказ имени считается defect.

## Knowledge drift

Защита: parent-link lint, отсутствие planned truth, knowledge sync до review, удаление feature-spec.

## Коррелированные model errors

Защита: разные vendors, независимые contexts, одинаковая spec и exact revision, отсутствие обмена findings между reviewer.

## Бесконечный review loop

Защита: максимум два rebuttal-цикла на finding, затем решение оркестратора по evidence. Цикл не имеет механизма «принять дефект из-за усталости».

## Gaming тестов

Защита: reviewer проверяет изменения oracle; tester read-only; acceptance tests нельзя ослаблять без decision request.

## Потерянное backend event

Защита: replayable cursor, acknowledgement, reconcile и capability preflight. Backend без этих гарантий не поддерживается.

## Session poisoning

Защита: после двух повторов одной провалившейся гипотезы session заменяется. Fresh session получает spec, Git, decisions и открытые findings, а не полный transcript.

## Knowledge-file merge conflicts

Защита: business и architecture шардируются по устойчивым доменам, а не по feature. `verification-state.json` сортируется по scenario ID.

## Локальная environment drift

Защита: project-owned QC command, lockfiles для обычных dev dependencies, exact environment description в E2E result. CI может полностью дублировать gate.

## Artifact bloat

Защита: нет task tree, review ledger, session summaries, feature archive или сохранённых screenshots. Каждый постоянный артефакт должен предотвращать конкретный класс ошибки.

---

# 13. Decision ledger

| Решение | Статус | Причина |
|---|---|---|
| Thin orchestrator поверх Herdr/Omnigent | adopted | Не создавать новый runtime |
| Runtime state вне repository | adopted | Не возвращаться к task/checkpoint bloat |
| Business → architecture → module → symbol | adopted | Минимальная полная causal chain |
| Предварительные TODO не писать в knowledge layer | adopted | Не смешивать planned и actual truth |
| Solution scan выполнять в начале workflow | adopted | Это технический, а не business-spec этап |
| Review и E2E аттестуют exact revision | adopted | Однозначный критерий завершения |
| Любое tracked изменение инвалидирует gates | adopted | Исключает stale approval |
| Verification state писать metadata-only commit | adopted | Разрешает SHA recursion и сохраняет team visibility |
| Deterministic watchdog | adopted | Меньше вероятностных failure modes |
| Repo-owned QC scripts, unpinned skills | adopted | Совместимость с запретом skill pinning |
| Полный artifact graph и task decomposition | rejected | Высокий context/artifact tax |
| Feature-spec archive в repository | rejected | Создаёт competing truth |
| Local LLM как autonomous watchdog | rejected | Может ошибочно возобновить или продублировать turn |
| Risk-based purpose вместо all-symbol purpose | rejected under current constraints | Архитектурно предпочтительно, но нарушает hard requirement |
| Полная реализация PHP/JS adapters | deferred | Сначала нужен измеримый Python pilot |

---

# 14. Implementation decomposition

1. Реализовать TypeScript schemas, state reducer и revision invalidation tests.
2. Реализовать capability acceptance suite для Herdr и Omnigent.
3. Реализовать `workflow-orchestrator` и оба adapter skills.
4. Реализовать четыре role contracts и structured result parsers.
5. Реализовать `knowledge-lint.mjs`, `purpose_lint.py` и `code_health.py`.
6. Создать Python reference `pyproject.toml`, `.importlinter`, `tools/qc`.
7. Реализовать verification-state schema и metadata commit guard.
8. Реализовать deterministic multi-project watchdog.
9. Реализовать `project-adopt`.
10. Провести пилоты на пустом Python-проекте и brownfield-проекте.
11. Инъектировать failures: quota, потеря event, session replacement, mutated spec, conflicting reviewer findings, E2E fix.
12. Только после пилота проектировать полноценные JS/TS и PHP adapters.

Критерий готовности реализации методологии: одна feature без CI проходит от immutable spec до аттестованного SHA через оба backend, включая успешное восстановление после искусственно потерянной session.

---

# 15. Допущения и открытые вопросы

Приняты консервативные допущения:

- Herdr и Omnigent имеют либо смогут предоставить required capabilities; если нет, соответствующий backend отклоняется, а не компенсируется новым runtime.
- Tracked feature-spec разрешено удалить в завершающем commit; external spec остаётся вне repository.
- Git repository и отдельная feature branch обязательны.
- Все четыре роли имеют доступ к одному commit, но review/test работают в detached worktrees.
- Пользовательский `resume` всегда проходит model gate; автоматическое инфраструктурное восстановление — нет.
- Порог `100000` cold-resume tokens является пользовательски настраиваемой экономической default, а не свойством конкретного vendor.
- `docs/verification-state.json` хранит только компактные последние результаты, не raw evidence.
- Brownfield допускается в workflow только после строгой adoption feature; постоянного purpose-baseline не существует.

Остаётся эмпирически проверить только значения Python thresholds, session refresh thresholds и фактическое capability mapping Herdr/Omnigent. Контракты и failure semantics от этих измерений не зависят.