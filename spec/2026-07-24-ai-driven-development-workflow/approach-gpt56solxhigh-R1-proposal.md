# Master-spec: AI Feature Integrity Workflow

## 1. Краткий подход

Методология строится вокруг одной неизменяемой feature-спеки, одного сильного исполнителя и трёх независимых проверочных сессий; процессом управляет тонкий CLI-neutral оркестратор поверх Herdr либо Omnigent. Устойчивое знание хранится в компактной причинной цепочке `business → architecture → module → symbol`, а завершение определяется аттестациями local QC, двух reviewer и E2E на одной Git-ревизии.

Временное состояние feature — вопросы, findings, handoff и decision log — принадлежит runtime и удаляется после закрытия. В репозитории остаются только актуальные код, тесты, knowledge layer, технический долг вне scope и компактный verification state.

---

# 2. Границы системы

## 2.1. Обязательный вход

```ts
interface FeatureSpecRef {
  locator: string; // repo-relative path, absolute path or URL
  kind: "tracked" | "local" | "url";
  sha256: string;
  disposition: "delete_after_sync" | "external";
}
```

Оркестратор проверяет только:

- доступность;
- неизменность содержимого по `sha256`;
- возможность передать его четырём ролям.

Оркестратор не проверяет полноту спеки, не переписывает её и не добавляет в неё найденные технические решения.

Изменение digest во время run вызывает терминальную ошибку `SPEC_MUTATED`. Продолжение возможно только новым run с новой утверждённой спекой.

## 2.2. Вне scope

- создание и утверждение feature-спеки;
- push, PR, merge и межпользовательские claims;
- создание собственного session runtime;
- глобальный аудит архитектуры и feature flags;
- постоянное хранение review findings;
- CI как обязательный gate;
- быстрые режимы с ослабленным review или E2E;
- автоматическое обновление или pinning пользовательских skills.

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
├── knowledge-lint.mjs
└── verification-lint.mjs

.quality/
└── code-health-baseline.json

pyproject.toml
.importlinter
```

В постоянный поисковый контур не входят:

- закрытые feature-спеки;
- run logs;
- review ledgers;
- session summaries;
- raw E2E screenshots;
- полные tool transcripts;
- промежуточные планы исполнителя.

---

# 3. Архитектура компонентов

| Компонент | Ответственность | Явная граница |
|---|---|---|
| `workflow-orchestrator` | State machine, запуск ролей, доставка сообщений, revision gates, технические решения | Не пишет код, не переписывает спеку, не проводит собственный code review |
| `feature-executor` | Исследование, реализация всей спеки, tests, knowledge sync, commits | Не уменьшает scope и не переносит подтверждённые дефекты в backlog |
| `review-loop` | Переиспользуемый цикл двух независимых reviewer, corrections и adjudication | Сам по себе не завершает полный feature workflow без E2E |
| `reviewer-primary` | Review моделью той же vendor/model family, что executor | Не видит reasoning executor или вывод другого reviewer |
| `reviewer-cross-vendor` | Review моделью другого производителя | Другой CLI без другого model vendor не считается независимостью |
| `technical-adjudicator` | Одноразовое разрешение затянувшегося технического спора | Не является пятой постоянной ролью и не решает business semantics |
| `e2e-tester` | Проверка фактического поведения exact revision | Не меняет tracked files |
| `local-qc` | Детерминированные механические gates | Не оценивает смысл purpose |
| `knowledge-layer` | Текущая причинная модель проекта | Не хранит историю feature |
| `backend-adapter` | Отображение протокола на Herdr либо Omnigent | Не создаёт собственный daemon, event queue или session DB |
| `watchdog` | Опциональный multi-project reconcile после quota/stale events | Не читает код и не отправляет слепое `continue` |

Herdr и Omnigent взаимозаменяемы только при прохождении одного capability contract.

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
  | "PAUSED_MISSING_TOOLS"
  | "PAUSED_MODEL_UNAVAILABLE"
  | "PAUSED_TECHNICAL_DISPUTE"
  | "STOPPED_SPEC_IMPOSSIBLE"
  | "FAILED_BACKEND";
```

Review defects, QC failures и E2E failures не являются терминальными: они возвращают run в `EXECUTING`.

## 4.2. Model gate

При каждом пользовательском `start` или `resume` оркестратор показывает:

- executor;
- reviewer-primary;
- reviewer-cross-vendor;
- e2e-tester.

Пользователь подтверждает набор либо выбирает новый. Новый набор сохраняется как пользовательский default.

Автоматический backend retry или watchdog wake не является пользовательским resume и продолжает закреплённый model set.

Проверяются инварианты:

```text
reviewer-primary.vendor == executor.vendor
reviewer-primary.family == executor.family
reviewer-cross-vendor.vendor != executor.vendor
```

OpenCode, Claude CLI и Codex CLI — routes. Vendor определяется производителем модели.

## 4.3. Preflight

Оркестратор фиксирует:

- spec digest;
- base revision;
- feature branch;
- чистоту worktree;
- backend capabilities;
- наличие `tools/qc`;
- model set;
- handoff policy;
- solution-scan policy;
- начальные `stateVersion` и `turnSeq`.

Запуск блокируется при:

- dirty tracked worktree;
- неигнорируемых untracked files;
- отсутствии Git repository;
- отсутствии обязательного QC interface;
- несовместимом backend;
- недоступной feature-spec;
- нарушении model independence.

## 4.4. Solution scan

Solution scan выполняется в начале workflow, поскольку это техническое исследование, а не формирование business contract.

Значение по умолчанию — `auto`. Scan обязателен, если feature включает:

- protocol/parser/auth/crypto/storage/scheduling;
- нетривиальный алгоритм;
- новую инфраструктурную возможность;
- ориентировочно более 200 строк собственного инфраструктурного кода;
- названную библиотеку, которую необходимо проверить;
- capability, для которой существует зрелая внешняя реализация.

```ts
interface SolutionScanResult {
  status: "adopt" | "build" | "not_applicable" | "business_escalation";
  candidates: Array<{
    name: string;
    source: string;
    license?: string;
    compatibility: string;
    maintenanceRisk: string;
    securityRisk: string;
  }>;
  rationale: string;
}
```

Результат сохраняется во временный decision log. Устойчивый выбор зависимости позже интегрируется в architecture layer.

Если найденный путь меняет acceptance behavior или business semantics, решение эскалируется. Спека не редактируется.

## 4.5. Execution

Executor получает:

- полную immutable spec;
- `docs/agent-entry.md`;
- branch и base revision;
- decision log;
- открытые findings;
- опциональный handoff;
- текущие `stateVersion`, `turnSeq` и expected revision.

Executor самостоятельно выбирает инженерный маршрут, но обязан:

- реализовать весь scope;
- не оставлять временные заглушки;
- исправить долг в затронутой области;
- добавить tests и observability;
- обновить knowledge layer;
- удалить tracked feature-spec из рабочего поискового контура;
- делать локальные commits;
- оставить clean worktree.

Executor — единственная роль, имеющая право менять tracked files.

## 4.6. Local QC

После каждого нового commit выполняется полный:

```bash
./tools/qc
```

Ошибка возвращает executor:

- command;
- exit code;
- bounded stdout/stderr;
- failing check IDs;
- revision.

Заявление агента «проверки прошли» evidence не является.

## 4.7. Cross-review barrier

Оба reviewer работают независимо в detached worktrees одной ревизии. Они получают:

- immutable feature-spec;
- repository snapshot;
- knowledge layer;
- diff `baseRevision..targetRevision`;
- local QC attestation.

Они не получают:

- implementation narrative executor;
- hidden reasoning;
- findings другого reviewer;
- предварительную оценку оркестратора.

Оба должны вернуть `PASS` для одного SHA.

## 4.8. E2E

Tester получает exact SHA, spec и business anchors. Он запускает продукт в отдельном runtime namespace и проходит применимые пользовательские сценарии.

Tester не изменяет tracked files. Необходимость постоянного теста, фикса или tooling change возвращается executor как finding.

`SKIPPED` не является успешным завершением. Для backend-only проекта E2E означает реальный consumer/API/CLI scenario.

## 4.9. Revision invariant

```text
EXECUTING
  → commit R
  → LOCAL_QC(R)
  → REVIEW_A(R) + REVIEW_B(R)
  → E2E(R)
  → COMPLETE(R)
```

Любое tracked изменение до `COMPLETE` выполняет:

```ts
function onRevisionChanged(newRevision: string): void {
  currentRevision = newRevision;
  qc = "UNKNOWN";
  reviews = {
    primary: "UNKNOWN",
    crossVendor: "UNKNOWN",
  };
  e2e = "UNKNOWN";
  verifiedRevision = null;
  stateVersion += 1;
}
```

После E2E finding новый commit снова проходит QC и оба review до следующего E2E.

## 4.10. Attestation

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

`COMPLETE` допустим только при равенстве revision во всех аттестациях.

## 4.11. Verification state

После успешной аттестации создаётся metadata-only commit, меняющий исключительно:

```text
docs/verification-state.json
```

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

`git_revision` указывает на проверенный executable revision, а не на metadata commit. Guard проверяет, что metadata diff не содержит иных файлов.

---

# 5. Надёжная доставка turn и resume

## 5.1. Основной инвариант

Для каждой session одновременно существует не более одного незавершённого turn. Каждое сообщение имеет монотонный `turnSeq` и стабильный idempotency key.

```ts
interface TurnEnvelope<T> {
  runId: string;
  role: Role;
  sessionGeneration: number;
  turnSeq: number;
  expectedStateVersion: number;
  specDigest: string;
  expectedRevision: string | null;
  payload: T;
  idempotencyKey: string;
}
```

Формат ключа:

```text
<runId>:<role>:<sessionGeneration>:<turnSeq>
```

## 5.2. Receipt

```ts
interface TurnReceipt {
  idempotencyKey: string;
  status: "accepted" | "duplicate" | "rejected";
  backendTurnId?: string;
  acceptedAt?: string;
  error?: WorkflowError;
}
```

Повторная доставка того же envelope должна вернуть `duplicate`, а не создать второй turn.

## 5.3. Events

```ts
interface WorkflowEvent<T = unknown> {
  eventId: string;
  runId: string;
  role?: Role;
  sessionGeneration?: number;
  turnSeq?: number;
  eventSeq: number;
  stateVersion: number;
  kind:
    | "TURN_ACCEPTED"
    | "TURN_COMPLETED"
    | "TURN_FAILED"
    | "SESSION_PAUSED"
    | "SESSION_RESUMED"
    | "REVISION_CHANGED"
    | "GATE_COMPLETED"
    | "DECISION_REQUIRED"
    | "MISSING_TOOL"
    | "RUN_COMPLETED";
  occurredAt: string;
  payload: T;
}
```

Правила применения:

- duplicate `eventId` игнорируется;
- `eventSeq <= lastAppliedEventSeq` игнорируется;
- gap в `eventSeq` вызывает `reconcile`;
- событие с устаревшим `stateVersion` не меняет state;
- `TURN_COMPLETED` применяется только к соответствующему `turnSeq`;
- событие другой `sessionGeneration` считается stale.

## 5.4. Resume protocol

При неизвестном результате turn оркестратор не отправляет текстовое `continue`.

Алгоритм:

1. `inspect(session)`;
2. сравнить `sessionGeneration`, `turnSeq`, receipt и terminal event;
3. если turn завершён — применить результат один раз;
4. если turn принят, но не завершён — вызвать backend-native `resume`;
5. если receipt потерян — повторить тот же envelope с тем же idempotency key;
6. при несовпадении state вызвать `reconcile(runId, expectedStateVersion)`;
7. только после terminal event увеличить `turnSeq`.

```ts
interface ResumeEnvelope {
  runId: string;
  role: Role;
  sessionGeneration: number;
  expectedTurnSeq: number;
  expectedStateVersion: number;
  expectedRevision: string | null;
  reason: "provider_recovered" | "quota_reset" | "backend_restart" | "manual_resume";
}
```

Это устраняет дублирование работы после обрыва между выполнением side effect и доставкой ответа.

---

# 6. Контракты orchestration state

## 6.1. Run state

```ts
interface FeatureRun {
  runId: string;
  state: RunState;
  stateVersion: number;
  lastAppliedEventSeq: number;

  projectRoot: string;
  baseRevision: string;
  currentRevision: string | null;
  verifiedRevision: string | null;

  spec: FeatureSpecRef;
  modelSet: ModelSet;

  sessions: Record<Role, SessionRef>;
  sessionGeneration: Record<Role, number>;
  turnSeq: Record<Role, number>;
  outstandingTurn: Partial<Record<Role, TurnReceipt>>;

  decisions: DecisionRecord[];
  openFindings: Finding[];
  dispositions: FindingDisposition[];

  attestations: {
    qc?: GateAttestation;
    reviews?: Partial<Record<ReviewerRole, ReviewAttestation>>;
    e2e?: E2EAttestation;
  };

  handoff: "none" | {
    path: string;
    maxBytes: 4096;
  };
}
```

Run state хранится backend. Репозиторный task ledger не создаётся.

## 6.2. Model set

```ts
interface ModelSelection {
  route: "claude" | "codex" | "opencode";
  vendor: string;
  family: string;
  model: string;
  effort?: string;

  safeContextTokens?: number;
  coldResumeTokens?: number; // default 100000
  cacheTtlSeconds?: number;
}

interface ModelSet {
  executor: ModelSelection;
  reviewerPrimary: ModelSelection;
  reviewerCrossVendor: ModelSelection;
  e2eTester: ModelSelection;
}
```

Technical adjudicator использует новый clean session одной из уже подтверждённых reviewer models. Пятой сохраняемой model role нет.

## 6.3. Decision request

```ts
interface DecisionRequest {
  id: string;
  revision: string;
  category:
    | "local_implementation"
    | "architecture"
    | "business_semantics"
    | "irreversible"
    | "external_dependency"
    | "tooling";
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

Оркестратор решает самостоятельно только если:

```text
specImpact == none
reversible == true
решение не меняет §B-* или acceptance behavior
решение не уменьшает scope
решение не принимает подтверждённый residual defect
```

Любой возможный business impact передаётся пользователю.

## 6.4. Decision log

```ts
interface DecisionRecord {
  id: string;
  requestId?: string;
  authority: "orchestrator" | "user" | "adjudicator";
  choice: string;
  rationale: string;
  durability: "run" | "code" | "architecture" | "business";
  knowledgeTargets: string[];
  createdAt: string;
}
```

При knowledge sync:

- `run` удаляется;
- `code` интегрируется рядом с реализацией;
- `architecture` интегрируется в `§A-*`;
- `business` допустим только после пользовательского решения.

---

# 7. Review findings, adjudication и wontfix

## 7.1. Finding

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

Все подтверждённые `defect` и `engineering_risk`, включая `minor`, исправляются. Никакого minor carry-over нет.

## 7.2. Finding disposition

```ts
interface FindingDisposition {
  findingId: string;
  revision: string;
  disposition:
    | "fixed"
    | "rejected_false_positive"
    | "rejected_taste"
    | "rejected_nondefect_tradeoff";
  authority: "reviewer" | "orchestrator" | "adjudicator";
  rationale: string;
  durableRationaleTarget?: {
    path: string;
    anchor?: string;
  };
}
```

`rejected_nondefect_tradeoff` допустим только если:

- поведение соответствует спеке;
- никакой подтверждённый defect не остаётся;
- альтернативное изменение нарушило бы более сильный invariant;
- adjudicator либо оба reviewer подтверждают классификацию.

## 7.3. Technical adjudicator

Adjudicator вызывается после двух rebuttal-циклов между executor и reviewer либо сразу при несовместимых технических verdict двух reviewer.

Это новый clean session, а не постоянная пятая роль:

- при споре с `reviewer-primary` используется модель `reviewer-cross-vendor`;
- при споре с `reviewer-cross-vendor` используется модель `reviewer-primary`;
- создаётся fresh session generation без истории предыдущего reviewer;
- session получает spec, exact revision, finding, ответ executor и проверяемое evidence;
- business questions не рассматриваются.

```ts
interface AdjudicationRequest {
  finding: Finding;
  executorResponse: string;
  reviewerResponse: string;
  spec: FeatureSpecRef;
  revision: string;
  evidencePaths: string[];
}

interface AdjudicationResult {
  verdict:
    | "defect_confirmed"
    | "finding_rejected"
    | "needs_user_business_decision"
    | "insufficient_evidence";
  rationale: string;
  evidence: string[];
  requiredAction?: string;
}
```

`defect_confirmed` обязывает executor исправить код. `finding_rejected` закрывает finding. `insufficient_evidence` требует дополнительного deterministic experiment, а не голосования моделей.

## 7.4. Wontfix comments

Review ledger не сохраняется, однако будущий reviewer не должен регулярно поднимать один и тот же ложный риск.

Комментарий в коде обязателен, если одновременно:

- finding отвергнут как `rejected_nondefect_tradeoff`;
- конструкция выглядит подозрительно без скрытого rationale;
- причина устойчива дольше текущей feature;
- будущий разработчик может правдоподобно «исправить» её неверно.

Комментарий не содержит:

- `WONTFIX`;
- finding ID;
- имени reviewer;
- истории спора.

Он объясняет устойчивую причину:

```python
# Keep the explicit copy here: sharing the retry state would let one provider
# consume another provider's budget during failover (§M-RETRY-02).
```

Для чисто вкусового предложения комментарий не добавляется. Иначе codebase превратится в архив review-дебатов.

---

# 8. Missing-tools protocol

Отсутствующий обязательный tool нельзя превращать в `SKIPPED`, ручное предположение или ослабление проверки.

```ts
interface MissingToolReport {
  role: Role;
  revision: string | null;
  tool: string;
  requiredCapability: string;
  requiredFor:
    | "implementation"
    | "local_qc"
    | "review"
    | "e2e"
    | "knowledge_sync";
  attemptedCommand?: string;
  observedError: string;
  projectDeclared: boolean;
  candidateResolutions: Array<{
    action: string;
    modifiesRepository: boolean;
    modifiesHost: boolean;
    requiresCredentials: boolean;
  }>;
}
```

Политика:

1. Если tool уже объявлен в project lock/config, выполняется штатная project install command.
2. Если tool должен стать частью project development environment, executor добавляет его как обычное техническое изменение и commit.
3. Если требуется системная установка без credentials и это разрешено текущим host policy, оркестратор может поручить установку executor.
4. Если нужны credentials, license, hardware, VPN или внешняя инфраструктура — `PAUSED_MISSING_TOOLS` и пользовательская эскалация.
5. Если несовместима установленная версия skill, агент сообщает фактическую несовместимость; он не обновляет skill автоматически.
6. Отсутствие optional analyzer не блокирует работу, если обязательная capability уже доказана другим утверждённым инструментом.
7. Отсутствие обязательного E2E/QC tool всегда блокирует завершение.

```ts
interface MissingToolResolution {
  status:
    | "installed"
    | "added_to_project"
    | "alternative_capability_verified"
    | "needs_user"
    | "impossible";
  evidence: string[];
}
```

---

# 9. Backend adapter contract

Это skill-level port, а не новый runtime:

```ts
interface SessionBackend {
  capabilities(): Promise<BackendCapabilities>;
  open(request: OpenSessionRequest): Promise<SessionRef>;
  send<T>(request: TurnEnvelope<T>): Promise<TurnReceipt>;
  readEvents(cursor: EventCursor): Promise<EventBatch>;
  inspect(session: SessionRef): Promise<SessionSnapshot>;
  resume(request: ResumeEnvelope): Promise<SessionRef>;
  replace(request: ReplaceSessionRequest): Promise<SessionRef>;
  dispose(session: SessionRef): Promise<void>;
  reconcile(
    runId: string,
    expectedStateVersion: number
  ): Promise<ReconcileResult>;
}
```

Обязательные capabilities:

- durable session IDs;
- replayable ordered events;
- delivery acknowledgement или idempotency keys;
- inspectable session state;
- resume/replace;
- per-session working directory;
- exact revision checkout;
- сохранение small structured run state;
- безопасный `reconcile`.

Backend без capability отклоняется. Методология не реализует компенсирующий daemon или собственную очередь.

## 9.1. Ошибки

| Код | Поведение |
|---|---|
| `SPEC_MUTATED` | Терминальный stop текущего run |
| `SPEC_IMPOSSIBLE` | Два reviewer проверяют evidence; при подтверждении — `STOPPED_SPEC_IMPOSSIBLE` |
| `PROVIDER_TRANSIENT` | Backend retry с тем же idempotency key |
| `QUOTA_EXHAUSTED` | `PAUSED_QUOTA`, resume после reset |
| `AUTH_REQUIRED` | `PAUSED_EXTERNAL` |
| `MISSING_TOOL` | Выполнить missing-tools protocol |
| `SESSION_LOST` | Создать generation +1 и восстановить из spec, Git, decisions и findings |
| `DELIVERY_UNCERTAIN` | Только inspect/reconcile |
| `EVENT_GAP` | Replay либо reconcile; не продолжать вслепую |
| `MODEL_UNAVAILABLE` | Пользовательский resume с новым model gate |
| `TECHNICAL_DISPUTE` | Adjudication |
| `BACKEND_STATE_LOST` | `FAILED_BACKEND`; новый runtime не создаётся |

---

# 10. Subspec: `knowledge-layer-spec.md`

## 10.1. Business

`docs/business/<domain>.md`:

```markdown
## §B-TIME-01 — Не принимать устаревшее продление аренды

Система должна предотвращать использование аренды после утраты её причинной
актуальности, иначе параллельный worker может перезаписать более новое
состояние.

Если правило отменяется, stale-renewal protection и связанные проверки больше
не нужны.
```

Business layer не описывает модули, классы, базы данных или библиотеки.

## 10.2. Architecture

`docs/architecture/<domain>.md`:

```markdown
## §A-TIME-02 — Продление использует monotonic lease generation

Это решение реализует §B-TIME-01. Поколение аренды проверяется до любого
побочного эффекта; wall-clock timestamp не доказывает актуальность.

При отмене решения generation checks и связанное состояние можно удалить.
```

Каждый `§A-*` ссылается минимум на один `§B-*`.

## 10.3. Module

```python
"""Protect lease renewal from stale causal state.

§M-TIME-01 implements §A-TIME-02. Without this module, a delayed worker could
renew an obsolete lease after a newer owner has acquired it.
"""
```

Каждый first-party module:

- объявляет один основной `§M-*`;
- ссылается минимум на один `§A-*`;
- объясняет причину существования и границу ответственности.

## 10.4. Symbol

```python
def reject_stale_renewal(candidate: Lease, current: Lease) -> None:
    """Prevent an obsolete lease generation from producing side effects (§M-TIME-01)."""
```

Каждый class, function и method, включая private, nested, async, property setter и dunder method, имеет purpose и parent module link.

Дополнительные прямые ссылки на `§A-*` или `§B-*` допустимы, но не заменяют `§M-*`.

## 10.5. Формальные исключения

Исключаются только:

- lambdas и comprehensions как неименованные выражения;
- методы, автоматически создаваемые интерпретатором или генератором и отсутствующие в source AST;
- `@typing.overload` declarations при наличии документированной реализации;
- generated files, одновременно удовлетворяющие glob, marker и generator declaration;
- third-party vendored code вне first-party roots.

Tests являются first-party code и purpose требуют.

```toml
[[tool.ai_workflow.generated]]
glob = "src/**/_generated.py"
marker = "Generated file; do not edit."
generator = "python -m tools.generate_models"
```

Одного glob недостаточно.

## 10.6. Knowledge lint

Проверяются:

- уникальность declarations;
- отсутствие dangling references;
- `§A → §B`;
- `§M → §A`;
- `symbol → §M` того же модуля;
- purpose coverage first-party AST;
- generated exceptions;
- отсутствие закрытой tracked feature-spec;
- verification JSON Schema;
- отсутствие завершённых записей в `docs/todo.md`.

Missing/dangling parent — error. Orphan anchor — warning и review evidence.

## 10.7. Knowledge sync

Future behavior не записывается в knowledge layer заранее. Вместо planned TODO executor держит transient:

```ts
interface KnowledgeImpactPlan {
  business: Array<{
    action: "keep" | "add" | "update";
    target?: string;
  }>;
  architecture: Array<{
    action: "keep" | "add" | "update";
    target?: string;
  }>;
  modules: string[];
  symbols: string[];
  durableDecisionIds: string[];
  durableFindingDispositions: string[];
  specDisposition: "delete_after_sync" | "external";
}
```

Он применяется вместе с фактической реализацией до финальных gates.

## 10.8. Feature-spec retirement

- `tracked`: удалить после knowledge sync;
- `local` или `url`: не копировать в repository;
- Git history остаётся историей;
- `docs/archive/features/` запрещён.

## 10.9. Technical debt

```markdown
## §T-DEBT-014 — Разорвать цикл между billing и notifications

Detected: 2026-07-24
Area: `src/billing`, `src/notifications`
Risk: retry-policy changes require simultaneous reasoning across two domains
Needed feature: dependency-boundary refactor
```

Долг в изменяемой сущности исправляется сейчас. В `docs/todo.md` попадает только старый долг вне текущего scope.

---

# 11. Subspec: `review-loop-spec.md`

`review-loop` — самостоятельный переиспользуемый skill. Полный workflow вызывает его как обязательный этап, но он также может применяться отдельно после внешнего quick fix или для review документа.

Standalone вызов не является облегчённым режимом полного workflow и не создаёт `COMPLETE` без E2E.

## 11.1. Вход

```ts
interface ReviewLoopInput {
  target:
    | {
        kind: "git_revision";
        projectRoot: string;
        baseRevision: string;
        targetRevision: string;
      }
    | {
        kind: "artifact";
        locator: string;
        sha256: string;
      };

  objective: FeatureSpecRef | {
    locator: string;
    sha256: string;
  };

  modelSet: Pick<
    ModelSet,
    "reviewerPrimary" | "reviewerCrossVendor"
  >;

  correctionSession?: SessionRef;
  qc?: GateAttestation;
}
```

## 11.2. Процесс

1. Подтвердить model set.
2. Создать два независимых clean sessions.
3. Передать objective и exact target.
4. Получить structured findings.
5. Передать подтверждённые findings correction session.
6. При изменении revision сбросить оба verdict.
7. Повторить review.
8. При споре вызвать adjudicator.
9. Завершить только двумя `PASS` на одном digest/revision.

## 11.3. Выход

```ts
interface ReviewLoopAttestation {
  targetDigest: string;
  targetRevision?: string;
  primary: ReviewAttestation;
  crossVendor: ReviewAttestation;
  unresolvedFindings: [];
}
```

Для artifact review digest выполняет роль revision. Review findings после завершения удаляются.

---

# 12. Subspec: `role-skills-spec.md`

```text
skills/
├── workflow-orchestrator/
├── feature-executor/
├── solution-scan/
├── review-loop/
├── review-gate/
├── technical-adjudicator/
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

TypeScript release build создаёт автономные single-file `.mjs`. Проект не записывает версию skills.

Нормативные QC scripts коммитятся в проект и обновляются только отдельной feature.

## 12.1. Executor contract

```ts
interface ExecutorInput {
  spec: FeatureSpecRef;
  projectRoot: string;
  baseRevision: string;
  expectedRevision: string | null;
  decisions: DecisionRecord[];
  findings: Finding[];
  dispositions: FindingDisposition[];
  turn: TurnEnvelope<unknown>;
  handoff?: string;
}

interface ExecutorResult {
  status:
    | "READY_FOR_QC"
    | "DECISION_REQUIRED"
    | "SPEC_IMPOSSIBLE"
    | "MISSING_TOOL"
    | "EXTERNAL_BLOCK";
  revision?: string;
  decisionRequest?: DecisionRequest;
  impossibility?: SpecImpossibility;
  missingTool?: MissingToolReport;
  changedFiles: string[];
  commits: string[];
}
```

## 12.2. Review rubric

1. feature-spec и business intent;
2. correctness, failure paths, security, concurrency, data integrity;
3. tests, observability, false-success protection;
4. boundaries, complexity, coupling, maintainability;
5. purpose semantics, parent links и knowledge drift.

## 12.3. E2E contract

Tester обязан:

- подтвердить exact SHA;
- использовать отдельный runtime namespace;
- выполнить business-linked scenarios;
- проверить runtime errors и integrations;
- вернуть structured evidence;
- вызвать `MISSING_TOOL`, а не `SKIPPED`;
- не менять tracked files.

## 12.4. Handoff

Опциональный файл, максимум 4096 bytes:

```markdown
Goal:
Spec digest:
State version:
Session generation:
Last completed turn:
Current revision:
Implemented:
Decisions:
Open findings:
Next action:
```

Он перезаписывается, не коммитится и не является источником истины.

---

# 13. Subspec: `local-qc-python-spec.md`

## 13.1. Инструменты

- Ruff;
- mypy;
- pytest;
- Import Linter;
- `purpose_lint.py`;
- `code_health.py`;
- `knowledge-lint.mjs`;
- `verification-lint.mjs`.

## 13.2. Authoritative command

```bash
./tools/qc
```

Последовательность:

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

Перед review выполняется полный проход с объединённым summary.

## 13.3. Python defaults

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

Изменение thresholds требует отдельной feature. Executor не поднимает лимит ради текущего gate.

## 13.4. Метрики

`code_health.py` использует AST:

- physical file lines;
- function/class spans;
- cyclomatic complexity;
- cognitive complexity с nesting penalty;
- module fan-out;
- Tarjan SCC dependency cycles;
- first-party import graph.

High fan-in не является автоматическим defect: стабильное ядро может иметь много consumers. Ограничиваются fan-out, cycles и forbidden directions.

## 13.5. Brownfield ratchet

`.quality/code-health-baseline.json` допускается только для старых structural violations.

- новые entries запрещены;
- ухудшение запрещено;
- violation в изменённой entity становится blocking;
- debt вне scope отражается в `docs/todo.md`;
- dedicated debt feature уменьшает baseline;
- purpose debt в baseline не допускается.

## 13.6. Hook placement

| Место | Назначение |
|---|---|
| `pre-commit` | `./tools/qc-fast` по changed files |
| `./tools/qc` | Обязательный authoritative gate |
| `pre-push` | Дублирование полного QC |
| CI | Необязательное точное повторение `./tools/qc` |

## 13.7. Будущие adapters

| Стек | Основа |
|---|---|
| JS/TS | ESLint complexity/size, `import/no-cycle`, boundaries, custom JSDoc purpose rule |
| PHP | PHPStan/Psalm, PHPMD, Deptrac, PHPDoc purpose rule |
| Multi-language | Общий knowledge/verification lint; AST остаётся language-specific |

---

# 14. Subspec: `watchdog-spec.md`

## 14.1. Выбор

Основной watchdog детерминирован. Локальная модель может только классифицировать неизвестный санитизированный error tail и не имеет права менять state или отправлять turns.

## 14.2. Конфигурация

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

Один процесс обслуживает несколько проектов и использует process lock.

## 14.3. Retry policy

| Событие | Действие |
|---|---|
| transient provider failure | 1m, 5m, 15m, 30m, затем 60m; максимум 6 часов |
| quota с `retry_at` | `retry_at + 5m`, затем `reconcile` |
| auth/VPN/external dependency | pause и notification |
| busy без event более 5m | `reconcile(expectedStateVersion)` |
| delivery uncertain | inspect/reconcile, не `continue` |
| event gap | replay/reconcile |
| unknown error | notify; advisory local classification |

Watchdog не увеличивает `turnSeq`, не создаёт sessions и не отправляет payload child role. Он только вызывает idempotent reconcile основного оркестратора.

---

# 15. Project adoption

Требование purpose для каждой сущности создаёт значительную brownfield admission cost. Новый проект сразу создаётся со строгими gates; существующий проходит отдельную approved adoption feature.

`project-adopt` создаёт:

- knowledge skeleton;
- project-owned QC scripts;
- language-specific configs;
- dependency contracts;
- generated declarations;
- business и architecture anchors;
- module anchors;
- purpose для 100% first-party symbols;
- structural baseline;
- initial `docs/todo.md`.

Adoption не является облегчённым постоянным режимом. В конце repository проходит local QC и два review. До этого обычные feature runs не запускаются.

---

# 16. Ключевая критика исходных решений

| Решение | Статус | Возможный отказ | Совместимый вариант | Альтернатива вне constraints |
|---|---|---|---|---|
| Purpose у каждого private symbol | Hard | Формальные и быстро протухающие docstrings | Одна причинная строка + `§M-*`; semantic counterfactual review | Risk-based purpose только для module/public/high-risk entities |
| Immutable spec | Hard | Найден лучший business path, но run обязан остановиться | Technical/business classification и новый run | Версионируемый spec amendment |
| Same-family reviewer | Hard | Коррелированные ошибки | Clean isolation плюс обязательный cross-vendor reviewer | Оба reviewer другого vendor или третий reviewer |
| Оркестратор решает технические споры, не читая код | Hard intent | Ошибка из-за убедительного summary | Structured evidence и fresh adjudicator | Постоянный technical architect как пятая роль |
| Сохранение reviewer session | Revisitable | Закрепление stale mental model | Замена после двух неудачных циклов, долгой паузы или context pressure | Fresh reviewer каждый round |
| Unpinned skills | Hard | Разное поведение на разных машинах | Нормативные QC tools принадлежат repository | Skill lockfile |
| Без CI | Hard | Environment drift и возможность обхода | Exact local commands и independent gates | Protected CI final authority |
| Verification state в tracked file | Requirement | SHA recursion | Guarded metadata-only commit | Git notes или external attestation store |
| Planned TODO в knowledge | Hypothesis | Future truth выглядит current truth | Transient `KnowledgeImpactPlan` | Planned sections в persistent docs |
| Findings удаляются | Hard | Повторные ложные findings | Durable rationale в code/architecture без review history | Анонимизированный defect ledger |
| Watchdog на local model | Revisitable | Вероятностный duplicate resume | Deterministic reconcile; model advisory only | Полностью agentic supervisor |
| Full QC после каждого commit | Chosen | Высокая latency | `qc-fast` во время работы, full QC для каждого review candidate revision | Только final QC, но хуже feedback |
| Technical adjudicator | Chosen | Дополнительные токены и latency | Только после двух rebuttal rounds, fresh session из подтверждённого model set | Решение большинства без adjudication, но слабее evidence discipline |

Самое спорное hard requirement — purpose каждого private helper. Совместимая реализация возможна, но пилот обязан измерять долю бессодержательных docstrings и стоимость их сопровождения.

---

# 17. Риски и защиты

## Duplicate resume

Защита: `turnSeq`, `sessionGeneration`, idempotency key, one outstanding turn, ordered events и reconcile.

## Purpose cargo cult

Защита: counterfactual test. Docstring должен объяснять, какая потребность или invariant исчезнет при удалении сущности.

## Knowledge drift

Защита: parent-link lint, knowledge sync до review, отсутствие planned truth, удаление feature-spec.

## Коррелированные model errors

Защита: cross-vendor reviewer, clean contexts, exact revision и fresh adjudication session.

## Бесконечный спор

Защита: два rebuttal rounds, затем binding technical adjudication. Business uncertainty эскалируется.

## Повторяющиеся ложные findings

Защита: устойчивый rationale переносится в native code comment или architecture anchor без review ID.

## Missing tools превращаются в skip

Защита: отдельный blocking protocol и `PAUSED_MISSING_TOOLS`.

## Gaming tests

Защита: reviewer проверяет oracle changes; tester read-only; acceptance behavior нельзя ослабить локальным техническим решением.

## Session poisoning

Защита: fresh generation после двух повторов одной неудачной гипотезы. Новая session получает факты, а не transcript.

## Event loss

Защита: replayable sequence, gap detection, idempotent receipts и backend capability preflight.

## Local environment drift

Защита: project-owned QC command, dependency lockfiles, exact E2E environment description. CI может полностью дублировать команды.

## Artifact bloat

Защита: отсутствуют task tree, review archive, session summaries и raw E2E evidence. Standalone review-loop тоже не создаёт постоянный ledger.

---

# 18. Decision ledger

| Решение | Статус | Причина |
|---|---|---|
| Thin orchestrator поверх Herdr/Omnigent | adopted | Не создавать новый runtime |
| `turnSeq` + idempotent delivery | adopted | Предотвратить duplicate work после resume |
| Runtime state вне repository | adopted | Не возвращаться к task/checkpoint bloat |
| Business → architecture → module → symbol | adopted | Минимальная causal chain |
| Не писать planned TODO в knowledge | adopted | Не смешивать future и actual truth |
| Solution scan в начале workflow | adopted | Технический этап после immutable spec |
| Reusable standalone review-loop | adopted | Один механизм review для full workflow и внешних изменений |
| Fresh technical adjudicator по спору | adopted | Разрешать споры evidence, а не усталостью |
| Missing-tools escalation | adopted | Не превращать отсутствующую проверку в pass |
| Durable rationale вместо review ledger | adopted | Предотвратить повторный ложный finding без artifact bloat |
| Exact-revision review и E2E | adopted | Однозначный критерий завершения |
| Любое tracked изменение инвалидирует gates | adopted | Исключить stale approval |
| Metadata-only verification commit | adopted | Разрешить SHA recursion |
| Deterministic watchdog | adopted | Минимизировать вероятностные failure modes |
| Repo-owned QC, unpinned skills | adopted | Воспроизводимость при заданном constraint |
| Полный task/artifact graph | rejected | Высокий context tax |
| Feature archive в repository | rejected | Competing truth |
| Local LLM как autonomous watchdog | rejected | Риск ошибочного resume |
| Risk-based purpose | rejected under current constraints | Предпочтительно, но нарушает hard requirement |
| Полные PHP/JS adapters | deferred | После Python pilot |

---

# 19. Implementation decomposition

1. Реализовать schemas, state reducer, `stateVersion`, `turnSeq` и event-sequence tests.
2. Реализовать duplicate-delivery, event-gap и uncertain-delivery test cases.
3. Создать capability suite для Herdr и Omnigent.
4. Реализовать `workflow-orchestrator` и adapters.
5. Реализовать `review-loop` как самостоятельный skill.
6. Реализовать role contracts и structured parsers.
7. Реализовать technical adjudication protocol.
8. Реализовать missing-tools protocol.
9. Реализовать finding disposition и durable rationale rules.
10. Реализовать knowledge, purpose и verification lints.
11. Создать Python reference QC.
12. Реализовать metadata commit guard.
13. Реализовать deterministic multi-project watchdog.
14. Реализовать `project-adopt`.
15. Провести greenfield и brownfield pilots.
16. Инъектировать failures: duplicate resume, event gap, quota, session loss, missing tool, mutated spec, reviewer dispute, E2E correction.
17. После пилота реализовать JS/TS и PHP adapters.

Критерий готовности: feature без CI проходит от immutable spec до аттестованного SHA через оба backend, переживает потерю ответа после side effect без повторного выполнения и сохраняет корректность после замены любой рабочей session.

---

# 20. Допущения и открытые вопросы

Приняты следующие implementation-ready допущения:

- Herdr и Omnigent должны предоставить required capabilities; несовместимый backend отклоняется.
- Tracked feature-spec разрешено удалить после knowledge sync.
- Git repository и отдельная branch обязательны.
- Reviewer и tester используют detached worktrees.
- Пользовательский resume проходит model gate; автоматический infrastructure recovery — нет.
- Technical adjudicator использует fresh session одной из четырёх уже подтверждённых models.
- `100000` cold-resume tokens — настраиваемая экономическая default.
- Verification state содержит компактный последний результат без raw evidence.
- Brownfield допускается после adoption feature.
- Обязательная project dependency может быть установлена штатной project command без отдельного business решения.
- Host-level credentials, licenses, hardware и VPN всегда требуют внешнего устранения.
- Exact command mapping Herdr/Omnigent определяется adapter implementation, но state, idempotency и error contracts остаются неизменными.
