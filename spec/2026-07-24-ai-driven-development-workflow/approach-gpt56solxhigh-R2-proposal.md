# Master-spec: AI Feature Integrity Workflow

## 1. Краткий подход

Методология строится вокруг одной неизменяемой feature-спеки, одного сильного исполнителя и трёх независимых проверочных сессий; процессом управляет тонкий CLI-neutral оркестратор поверх Herdr либо Omnigent. Устойчивое знание хранится в причинной цепочке `business → architecture → module → symbol`, а завершение определяется аттестациями local QC, двух reviewer и E2E на одной Git-ревизии.

Временное состояние feature принадлежит runtime и удаляется после закрытия. Контекст оркестратора считается ограниченным ресурсом: до compaction он передаёт управление свежей сессии через компактное структурированное состояние, а неожиданная compaction немедленно лишает текущую сессию управляющих полномочий.

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
- неизменность по `sha256`;
- возможность передать спеку четырём ролям.

Он не проверяет полноту, не переписывает спеку и не добавляет в неё технические решения.

Изменение digest во время run вызывает терминальную ошибку `SPEC_MUTATED`. Продолжение возможно только новым run.

## 2.2. Вне scope

- создание и утверждение feature-спеки;
- push, PR, merge и межпользовательские claims;
- создание собственного session runtime;
- глобальный аудит архитектуры и feature flags;
- постоянное хранение review findings;
- CI как обязательный gate;
- ослабленные quick/high-stakes режимы;
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
- raw screenshots;
- полные tool transcripts;
- промежуточные планы исполнителя.

---

# 3. Архитектура компонентов

| Компонент | Ответственность | Явная граница |
|---|---|---|
| `workflow-orchestrator` | State machine, доставка сообщений, revision gates, технические решения | Не пишет код, не проводит собственный code review |
| `orchestrator-context-guard` | Бюджет контекста, bounded ingress, rotation до compaction | Не суммаризирует код и не хранит transcript |
| `feature-executor` | Реализация всей спеки, tests, knowledge sync, commits | Не уменьшает scope |
| `review-loop` | Два reviewer, corrections и adjudication | Не создаёт feature `COMPLETE` без E2E |
| `reviewer-primary` | Review той же vendor/model family | Не видит reasoning executor или второго reviewer |
| `reviewer-cross-vendor` | Review другого model vendor | Другой CLI сам по себе не обеспечивает независимость |
| `technical-adjudicator` | Одноразовое разрешение технического спора | Не является постоянной пятой ролью |
| `e2e-tester` | Проверка exact revision | Не меняет tracked files |
| `local-qc` | Детерминированные механические gates | Не оценивает semantic adequacy purpose |
| `knowledge-layer` | Текущая причинная модель | Не хранит историю feature |
| `backend-adapter` | Отображение протокола на Herdr/Omnigent | Не создаёт daemon, event queue или session DB |
| `watchdog` | Multi-project reconcile после quota/stale events | Не читает код и не отправляет слепое `continue` |

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
  | "ROTATING_ORCHESTRATOR"
  | "COMPLETE"
  | "PAUSED_EXTERNAL"
  | "PAUSED_QUOTA"
  | "PAUSED_MISSING_TOOLS"
  | "PAUSED_MODEL_UNAVAILABLE"
  | "PAUSED_TECHNICAL_DISPUTE"
  | "PAUSED_ORCHESTRATOR_BUDGET"
  | "PAUSED_ORCHESTRATOR_UNTRUSTED"
  | "STOPPED_SPEC_IMPOSSIBLE"
  | "FAILED_BACKEND";
```

QC, review и E2E defects возвращают run в `EXECUTING`; они не являются terminal failure.

## 4.2. Model gate

При пользовательском `start` или `resume` показываются модели:

- executor;
- reviewer-primary;
- reviewer-cross-vendor;
- e2e-tester.

Новый выбор сохраняется как пользовательский default.

Автоматический retry, watchdog wake и orchestrator rotation используют уже закреплённые модели и не являются пользовательским resume.

```text
reviewer-primary.vendor == executor.vendor
reviewer-primary.family == executor.family
reviewer-cross-vendor.vendor != executor.vendor
```

OpenCode, Claude CLI и Codex CLI — routes. Vendor определяется производителем модели.

## 4.3. Preflight

Фиксируются:

- spec digest;
- base revision;
- feature branch;
- чистота worktree;
- backend capabilities;
- наличие `tools/qc`;
- model set;
- handoff policy;
- solution-scan policy;
- `stateVersion`, `turnSeq`, `contextEpoch`;
- orchestrator context budget.

Запуск блокируется при:

- dirty tracked worktree;
- неигнорируемых untracked files;
- отсутствии Git;
- отсутствии QC interface;
- несовместимом backend;
- недоступной spec;
- нарушении model independence;
- невозможности обнаружить или консервативно оценивать context pressure.

## 4.4. Solution scan

Scan выполняется после получения immutable spec как технический этап.

Значение по умолчанию — `auto`. Он обязателен для:

- protocol/parser/auth/crypto/storage/scheduling;
- нетривиальных алгоритмов;
- новой инфраструктурной capability;
- ориентировочно более 200 строк собственного infrastructure code;
- названной сторонней библиотеки;
- capability с вероятной зрелой внешней реализацией.

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

Результат временно хранится в decision log. Устойчивый выбор интегрируется в architecture layer.

## 4.5. Execution

Executor получает:

- immutable spec;
- `docs/agent-entry.md`;
- branch и base revision;
- decision log;
- открытые findings;
- опциональный handoff;
- `stateVersion`, `turnSeq`, expected revision.

Он обязан:

- реализовать весь scope;
- не оставлять заглушки;
- исправить долг в затронутой области;
- добавить tests и observability;
- обновить knowledge layer;
- удалить tracked feature-spec;
- делать локальные commits;
- оставить clean worktree.

Executor — единственная роль, меняющая tracked files.

## 4.6. Local QC

Для каждого review-candidate commit выполняется:

```bash
./tools/qc
```

Во время активной разработки executor может запускать `./tools/qc-fast`, но это не заменяет полный gate.

Ошибка возвращает:

- command;
- exit code;
- bounded stdout/stderr;
- failing check IDs;
- revision.

## 4.7. Cross-review barrier

Оба reviewer работают в независимых detached worktrees одной revision. Они получают:

- immutable spec;
- repository snapshot;
- knowledge layer;
- diff `baseRevision..targetRevision`;
- local QC attestation.

Они не получают:

- implementation narrative;
- hidden reasoning;
- findings друг друга;
- предварительный verdict оркестратора.

## 4.8. E2E

Tester получает exact SHA, spec и business anchors. Он запускает продукт в отдельном runtime namespace и проходит применимые пользовательские сценарии.

Tester не меняет tracked files. `SKIPPED` не является успешным завершением.

## 4.9. Revision invariant

```text
EXECUTING
  → commit R
  → LOCAL_QC(R)
  → REVIEW_A(R) + REVIEW_B(R)
  → E2E(R)
  → COMPLETE(R)
```

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

После E2E finding новый commit снова проходит QC и оба review.

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

Все аттестации обязаны относиться к одному SHA.

## 4.11. Verification state

После аттестации создаётся metadata-only commit, меняющий только:

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

Guard проверяет, что metadata commit не содержит иных изменений.

---

# 5. Контекстный бюджет оркестратора

## 5.1. Принцип доверия

Compaction оркестратора не является нормальным продолжением работы. После неё нельзя доказать, что управляющий skill, state transitions и незакрытые обязательства сохранились полностью.

Поэтому:

- rotation выполняется до compaction;
- новый оркестратор восстанавливается из structured runtime state;
- старый transcript не передаётся;
- неожиданная compaction инвалидирует управляющую сессию.

## 5.2. Бюджет

```ts
interface OrchestratorContextPolicy {
  safeContextTokens: number;
  warningRatio: number;      // default 0.55
  rotationRatio: number;     // default 0.65
  hardPauseRatio: number;    // default 0.75
  minimumReserveTokens: number; // default 32000

  maxRoleResultBytes: number;   // default 16384
  maxFindingBytes: number;      // default 8192
  maxQcSummaryBytes: number;    // default 32768
  maxE2ESummaryBytes: number;   // default 16384
  maxDecisionBytes: number;     // default 8192
}
```

`safeContextTokens` — измеренный рабочий предел, а не рекламный maximum модели.

Effective hard threshold:

```ts
const hardThreshold = Math.min(
  safeContextTokens * hardPauseRatio,
  safeContextTokens - minimumReserveTokens
);
```

## 5.3. Измерение

```ts
interface ContextBudgetState {
  source: "backend_reported" | "conservative_estimate";
  observedTokens?: number;
  estimatedTokens: number;
  effectiveTokens: number;
  safeContextTokens: number;
  ratio: number;
  contextEpoch: number;
  measuredAt: string;
}
```

Если backend сообщает usage:

```text
effectiveTokens = max(observedTokens, estimatedTokens)
```

Если usage недоступен:

```text
estimatedTokens = ceil(totalSerializedUtf8Bytes / 2)
```

Оценка намеренно консервативна. Считаются все переданные оркестратору user/tool/role payload, но не файлы, на которые он получил только digest/path reference.

## 5.4. Bounded ingress

Оркестратор не принимает полные logs или большие диффы. Role result выше лимита отклоняется с `PAYLOAD_TOO_LARGE`; роль возвращает:

- compact conclusion;
- structured fields;
- evidence paths;
- content digests;
- команду или диапазон для точечного чтения.

Оркестратор читает релевантный фрагмент спеки или evidence только при решении конкретного вопроса. Полная spec передаётся рабочим ролям напрямую backend, не копируется через каждый orchestrator turn.

## 5.5. Пороговые действия

### Warning — 55%

- записать `CONTEXT_BUDGET_WARNING`;
- запретить unbounded payload;
- потребовать structured results;
- проверить отсутствие закрытых findings и устаревших decisions в active state;
- подготовить successor checkpoint.

### Rotation — 65%

- состояние `ROTATING_ORCHESTRATOR`;
- не создавать новые turns;
- дождаться или reconcile текущих outstanding turns;
- записать атомарный structured checkpoint;
- создать fresh orchestrator generation;
- проверить checksum и state invariants;
- передать event cursor;
- старую сессию остановить.

### Hard pause — 75%

Если безопасная rotation не подтверждена:

- не продолжать workflow;
- перейти в `PAUSED_ORCHESTRATOR_BUDGET`;
- сообщить пользователю до compaction;
- resume выполняется свежим orchestrator.

## 5.6. Orchestrator checkpoint

Это backend state, а не repository file и не опциональный executor handoff.

```ts
interface OrchestratorCheckpoint {
  runId: string;
  checksum: string;
  stateVersion: number;
  state: RunState;

  specDigest: string;
  baseRevision: string;
  currentRevision: string | null;
  verifiedRevision: string | null;

  modelSetDigest: string;

  roleSessions: Record<Role, {
    sessionId: string;
    generation: number;
    lastCompletedTurnSeq: number;
    outstandingTurn?: TurnReceipt;
  }>;

  decisions: DecisionRecord[];
  openFindings: Finding[];
  dispositions: FindingDisposition[];
  attestations: FeatureRun["attestations"];

  lastAppliedEventSeq: number;
  eventCursor: EventCursor;
  contextEpoch: number;
  createdAt: string;
}
```

Checksum вычисляется по canonical JSON без поля `checksum`.

## 5.7. Successor activation

Fresh orchestrator:

1. читает checkpoint;
2. проверяет checksum;
3. повторно проверяет spec digest;
4. проверяет Git revision и worktree;
5. проверяет session generations и outstanding turns;
6. читает события после cursor;
7. вызывает `reconcile`;
8. увеличивает `orchestratorGeneration`;
9. продолжает только после успешной сверки.

## 5.8. Неожиданная compaction

Backend обязан эмитить compaction/context-reset event либо изменять `contextEpoch`.

Если обнаружено:

```text
event.contextEpoch != run.contextEpoch
```

текущая сессия:

- не принимает решений;
- не отправляет turns;
- переходит в `PAUSED_ORCHESTRATOR_UNTRUSTED`;
- создаёт fresh successor из последнего pre-compaction checkpoint;
- если checkpoint отсутствует или невалиден — `FAILED_BACKEND`.

Сжатое narrative summary не используется как authority.

## 5.9. Context budget рабочих ролей

```ts
interface WorkerContextPolicy {
  warningRatio: number;  // default 0.70
  replaceRatio: number;  // default 0.85
  coldResumeTokens: number; // default 100000
  repeatedFailedHypothesisLimit: number; // default 2
}
```

Worker/reviewer/tester можно заменить generation +1. Оркестратор заменяется раньше, потому что потеря его protocol memory опаснее потери локального implementation context.

---

# 6. Надёжная доставка turn и resume

## 6.1. Инвариант

Для каждой session существует не более одного незавершённого turn.

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

```text
idempotencyKey =
  <runId>:<role>:<sessionGeneration>:<turnSeq>
```

## 6.2. Receipt

```ts
interface TurnReceipt {
  idempotencyKey: string;
  status: "accepted" | "duplicate" | "rejected";
  backendTurnId?: string;
  acceptedAt?: string;
  error?: WorkflowError;
}
```

Повтор того же envelope обязан вернуть `duplicate`.

## 6.3. Events

```ts
interface WorkflowEvent<T = unknown> {
  eventId: string;
  runId: string;
  role?: Role;
  sessionGeneration?: number;
  turnSeq?: number;

  eventSeq: number;
  stateVersion: number;
  contextEpoch?: number;

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
    | "CONTEXT_BUDGET_WARNING"
    | "ORCHESTRATOR_ROTATION_REQUIRED"
    | "ORCHESTRATOR_COMPACTED"
    | "RUN_COMPLETED";

  occurredAt: string;
  payload: T;
}
```

Правила:

- duplicate `eventId` игнорируется;
- `eventSeq <= lastAppliedEventSeq` игнорируется;
- gap вызывает `reconcile`;
- stale `stateVersion` не меняет state;
- `TURN_COMPLETED` применяется только к соответствующему `turnSeq`;
- другое `sessionGeneration` считается stale;
- изменение `contextEpoch` инвалидирует orchestrator session.

## 6.4. Resume protocol

При неизвестном результате turn текстовое `continue` запрещено.

1. `inspect(session)`;
2. сравнить generation, turnSeq, receipt и terminal event;
3. завершённый turn применить один раз;
4. принятый, но незавершённый turn восстановить backend-native `resume`;
5. при потере receipt повторить тот же envelope с тем же key;
6. при несовпадении вызвать `reconcile`;
7. `turnSeq` увеличить только после terminal event.

```ts
interface ResumeEnvelope {
  runId: string;
  role: Role;
  sessionGeneration: number;
  expectedTurnSeq: number;
  expectedStateVersion: number;
  expectedRevision: string | null;
  reason:
    | "provider_recovered"
    | "quota_reset"
    | "backend_restart"
    | "manual_resume";
}
```

---

# 7. Orchestration state

```ts
interface FeatureRun {
  runId: string;
  state: RunState;
  stateVersion: number;
  lastAppliedEventSeq: number;

  orchestratorGeneration: number;
  contextEpoch: number;
  orchestratorContext: ContextBudgetState;
  orchestratorPolicy: OrchestratorContextPolicy;

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

Run state хранится средствами backend. Репозиторный task ledger не создаётся.

## 7.1. Model set

```ts
interface ModelSelection {
  route: "claude" | "codex" | "opencode";
  vendor: string;
  family: string;
  model: string;
  effort?: string;
  safeContextTokens?: number;
  coldResumeTokens?: number;
  cacheTtlSeconds?: number;
}

interface ModelSet {
  executor: ModelSelection;
  reviewerPrimary: ModelSelection;
  reviewerCrossVendor: ModelSelection;
  e2eTester: ModelSelection;
}
```

Technical adjudicator использует fresh session одной из уже подтверждённых reviewer models.

## 7.2. Decision request

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
не меняются §B-* и acceptance behavior
scope не уменьшается
не принимается residual defect
```

## 7.3. Decision log

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

- `run` удаляется;
- `code` интегрируется рядом с кодом;
- `architecture` интегрируется в `§A-*`;
- `business` допустим только после пользовательского решения.

---

# 8. Findings, adjudication и durable rationale

## 8.1. Finding

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

Все подтверждённые defects и engineering risks, включая minor, исправляются.

## 8.2. Disposition

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

`rejected_nondefect_tradeoff` допустим только если альтернативное изменение нарушило бы более сильный invariant и defect не остаётся.

## 8.3. Technical adjudicator

Вызывается после двух rebuttal-циклов либо при несовместимых verdict reviewer.

Fresh session:

- использует модель противоположного reviewer;
- не получает предыдущую reviewer session;
- получает spec, exact revision, finding, ответы и evidence;
- не решает business semantics.

```ts
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

`insufficient_evidence` требует deterministic experiment.

## 8.4. Durable rationale

Комментарий обязателен, если отвергнутый nondefect tradeoff:

- выглядит подозрительно;
- основан на скрытом устойчивом ограничении;
- вероятно будет «исправлен» неверно в будущем.

Комментарий не содержит review ID или `WONTFIX`:

```python
# Keep the explicit copy here: sharing retry state would let one provider
# consume another provider's budget during failover (§M-RETRY-02).
```

Для вкусового предложения комментарий не создаётся.

---

# 9. Missing-tools protocol

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

1. Project-declared tool устанавливается штатной project command.
2. Новый project tool добавляет executor обычным commit.
3. Разрешённую host installation без credentials выполняет executor.
4. Credentials/license/hardware/VPN вызывают `PAUSED_MISSING_TOOLS`.
5. Несовместимый skill не обновляется автоматически.
6. Optional analyzer можно заменить доказанно эквивалентной capability.
7. Отсутствующий обязательный QC/E2E tool блокирует завершение.

---

# 10. Backend adapter contract

```ts
interface SessionBackend {
  capabilities(): Promise<BackendCapabilities>;
  open(request: OpenSessionRequest): Promise<SessionRef>;
  send<T>(request: TurnEnvelope<T>): Promise<TurnReceipt>;
  readEvents(cursor: EventCursor): Promise<EventBatch>;
  inspect(session: SessionRef): Promise<SessionSnapshot>;
  resume(request: ResumeEnvelope): Promise<SessionRef>;
  replace(request: ReplaceSessionRequest): Promise<SessionRef>;
  createOrchestratorSuccessor(
    checkpoint: OrchestratorCheckpoint
  ): Promise<SessionRef>;
  contextUsage(session: SessionRef): Promise<ContextUsage | null>;
  dispose(session: SessionRef): Promise<void>;
  reconcile(
    runId: string,
    expectedStateVersion: number
  ): Promise<ReconcileResult>;
}
```

Обязательные capabilities:

- durable sessions;
- ordered replayable events;
- acknowledgement/idempotency;
- inspect/resume/replace;
- exact revision checkout;
- structured run state;
- atomic checkpoint;
- orchestrator successor либо гарантированная pause-before-compaction;
- compaction/context-reset detection;
- reconcile.

Context usage telemetry необязательна, поскольку допускается conservative estimate. Обнаружение compaction обязательно.

## 10.1. Ошибки

| Код | Поведение |
|---|---|
| `SPEC_MUTATED` | Terminal stop |
| `SPEC_IMPOSSIBLE` | Проверка двумя reviewer |
| `PROVIDER_TRANSIENT` | Retry с тем же idempotency key |
| `QUOTA_EXHAUSTED` | `PAUSED_QUOTA` |
| `AUTH_REQUIRED` | `PAUSED_EXTERNAL` |
| `MISSING_TOOL` | Missing-tools protocol |
| `SESSION_LOST` | Generation +1 |
| `DELIVERY_UNCERTAIN` | Inspect/reconcile |
| `EVENT_GAP` | Replay/reconcile |
| `ORCHESTRATOR_BUDGET_EXHAUSTED` | Rotation либо pause |
| `ORCHESTRATOR_COMPACTED` | Текущая session untrusted |
| `CHECKPOINT_INVALID` | `FAILED_BACKEND` |
| `MODEL_UNAVAILABLE` | User resume с model gate |
| `TECHNICAL_DISPUTE` | Adjudication |
| `BACKEND_STATE_LOST` | `FAILED_BACKEND` |

---

# 11. Subspec: `knowledge-layer-spec.md`

## 11.1. Business

```markdown
## §B-TIME-01 — Не принимать устаревшее продление аренды

Система должна предотвращать использование аренды после утраты её причинной
актуальности, иначе параллельный worker может перезаписать более новое
состояние.

Если правило отменяется, stale-renewal protection и связанные проверки больше
не нужны.
```

## 11.2. Architecture

```markdown
## §A-TIME-02 — Продление использует monotonic lease generation

Это решение реализует §B-TIME-01. Поколение аренды проверяется до любого
побочного эффекта; wall-clock timestamp не доказывает актуальность.

При отмене решения generation checks и связанное состояние можно удалить.
```

## 11.3. Module

```python
"""Protect lease renewal from stale causal state.

§M-TIME-01 implements §A-TIME-02. Without this module, a delayed worker could
renew an obsolete lease after a newer owner has acquired it.
"""
```

## 11.4. Symbol

```python
def reject_stale_renewal(candidate: Lease, current: Lease) -> None:
    """Prevent an obsolete lease generation from producing side effects (§M-TIME-01)."""
```

Каждый first-party class/function/method, включая private, nested, async, property и dunder, имеет purpose и `§M-*`.

## 11.5. Исключения

- lambdas/comprehensions;
- generated runtime methods, отсутствующие в source AST;
- `@typing.overload` при документированной реализации;
- generated files с glob + marker + generator;
- third-party vendor roots.

Tests являются first-party code.

## 11.6. Knowledge lint

Проверяются:

- уникальность anchors;
- dangling references;
- `§A → §B`;
- `§M → §A`;
- `symbol → §M`;
- purpose coverage;
- generated exceptions;
- spec retirement;
- verification schema;
- чистота `docs/todo.md`.

## 11.7. Knowledge sync

Future behavior не пишется в durable knowledge заранее.

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

## 11.8. Feature-spec retirement

- tracked spec удаляется;
- local/url spec не копируется;
- feature archive запрещён.

## 11.9. Technical debt

```markdown
## §T-DEBT-014 — Разорвать цикл между billing и notifications

Detected: 2026-07-24
Area: `src/billing`, `src/notifications`
Risk: retry-policy changes require simultaneous reasoning across two domains
Needed feature: dependency-boundary refactor
```

В todo попадает только debt вне текущего scope.

---

# 12. Subspec: `review-loop-spec.md`

`review-loop` используется внутри полного workflow и самостоятельно. Standalone review не может mint `COMPLETE` без E2E.

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

Процесс:

1. подтвердить reviewer models;
2. создать clean sessions;
3. передать exact target;
4. получить findings;
5. передать findings correction session;
6. после изменения сбросить verdict;
7. повторить review;
8. при споре вызвать adjudicator;
9. завершить двумя `PASS`.

```ts
interface ReviewLoopAttestation {
  targetDigest: string;
  targetRevision?: string;
  primary: ReviewAttestation;
  crossVendor: ReviewAttestation;
  unresolvedFindings: [];
}
```

---

# 13. Subspec: `role-skills-spec.md`

```text
skills/
├── workflow-orchestrator/
├── orchestrator-context-guard/
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

TypeScript release build создаёт автономные `.mjs`. Проект не записывает версию skills.

## 13.1. Executor result

```ts
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

## 13.2. Review rubric

1. feature-spec и business intent;
2. correctness, failure paths, security, concurrency;
3. tests, observability, false-success;
4. boundaries, complexity, coupling;
5. purpose semantics и knowledge drift.

## 13.3. E2E contract

Tester обязан:

- подтвердить SHA;
- использовать отдельный namespace;
- выполнить business-linked scenarios;
- проверить runtime errors;
- вернуть structured evidence;
- сообщить `MISSING_TOOL`, а не `SKIPPED`;
- не менять tracked files.

## 13.4. Optional worker handoff

Максимум 4096 bytes:

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

Это не orchestrator checkpoint и не source of truth.

---

# 14. Subspec: `local-qc-python-spec.md`

## 14.1. Инструменты

- Ruff;
- mypy;
- pytest;
- Import Linter;
- `purpose_lint.py`;
- `code_health.py`;
- `knowledge-lint.mjs`;
- `verification-lint.mjs`.

## 14.2. Authoritative command

```bash
./tools/qc
```

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

## 14.3. Defaults

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

[tool.mypy]
strict = true
```

## 14.4. Brownfield ratchet

- новые baseline entries запрещены;
- ухудшение запрещено;
- violation изменённой entity блокирует;
- debt вне scope идёт в todo;
- purpose debt baseline не допускается.

## 14.5. Hook placement

| Место | Назначение |
|---|---|
| `pre-commit` | `./tools/qc-fast` |
| `./tools/qc` | Authoritative local gate |
| `pre-push` | Дублирование QC |
| CI | Необязательное повторение |

---

# 15. Subspec: `watchdog-spec.md`

Основной watchdog детерминирован. Local model может только классифицировать санитизированную ошибку.

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
  ]
}
```

| Событие | Действие |
|---|---|
| transient failure | 1m, 5m, 15m, 30m, затем 60m |
| quota | `retry_at + 5m`, затем reconcile |
| auth/VPN | pause |
| busy без event >5m | reconcile |
| delivery uncertain | inspect/reconcile |
| context budget warning | проверить rotation state |
| orchestrator compacted | разбудить fresh successor, не старую session |

Watchdog не меняет `turnSeq`, stateVersion или checkpoint.

---

# 16. Project adoption

Brownfield проходит отдельную approved adoption feature.

`project-adopt` создаёт:

- knowledge skeleton;
- project-owned QC;
- language configs;
- dependency contracts;
- generated declarations;
- business/architecture/module anchors;
- purpose для first-party symbols;
- structural baseline;
- initial todo.

В конце выполняются полный QC и два review. Постоянного relaxed mode нет.

---

# 17. Критические trade-offs

| Решение | Статус | Возможный отказ | Совместимая защита | Альтернатива вне constraints |
|---|---|---|---|---|
| Purpose каждого private symbol | Hard | Бессодержательные docstrings | Короткий causal purpose + semantic review | Risk-based coverage |
| Immutable spec | Hard | Нельзя принять лучший business path | Новый run | Versioned amendments |
| Same-family reviewer | Hard | Коррелированные ошибки | Cross-vendor reviewer | Оба reviewer другого vendor |
| Thin orchestrator | Hard intent | Ошибка по слабому summary | Structured evidence и adjudicator | Постоянный architect |
| Orchestrator без compaction | Chosen | Более частые rotations | Early budget thresholds | Доверять compaction summary |
| Unpinned skills | Hard | Разные protocols | Project-owned QC | Skill lockfile |
| Без CI | Hard | Environment drift | Exact local gates | Protected CI |
| Tracked verification state | Requirement | SHA recursion | Metadata-only commit | Git notes |
| Findings удаляются | Hard | Повторные ложные findings | Durable rationale | Defect archive |
| Full QC review candidates | Chosen | Latency | `qc-fast` during work | Только final QC |
| Context estimate без telemetry | Fallback | Ранняя rotation | Conservative bytes/2 estimate | Требовать vendor telemetry |

Доверять compaction summary оркестратора не рекомендуется: цена редкой лишней rotation ниже цены незаметно потерянного process invariant.

---

# 18. Риски и защиты

## Orchestrator compaction

Budget guard, bounded ingress, early rotation, checksummed checkpoint и context epoch.

## Duplicate resume

`turnSeq`, generation, idempotency key и reconcile.

## Purpose cargo cult

Counterfactual semantic review.

## Knowledge drift

Parent lint, actual-only sync и spec retirement.

## Коррелированные ошибки

Cross-vendor review и fresh adjudicator.

## Бесконечный спор

Два rebuttal rounds, затем adjudication.

## Missing tools как skip

Blocking protocol.

## Gaming tests

Read-only tester и review oracle changes.

## Session poisoning

Fresh generation после двух повторов гипотезы.

## Event loss

Replay, sequence gaps и reconcile.

## Artifact bloat

Нет task tree, review archive, transcripts или raw E2E evidence.

---

# 19. Decision ledger

| Решение | Статус |
|---|---|
| Thin backend-neutral orchestrator | adopted |
| First-class orchestrator context budget | adopted |
| Rotation до compaction | adopted |
| Unexpected compaction invalidates authority | adopted |
| Checksummed structured successor checkpoint | adopted |
| Bounded orchestrator ingress | adopted |
| `turnSeq` и idempotent resume | adopted |
| Runtime state вне repository | adopted |
| Business → architecture → module → symbol | adopted |
| No planned TODO in durable knowledge | adopted |
| Solution scan после immutable spec | adopted |
| Standalone review-loop | adopted |
| Fresh technical adjudicator | adopted |
| Missing-tools escalation | adopted |
| Durable rationale without review history | adopted |
| Exact-revision gates | adopted |
| Metadata-only verification commit | adopted |
| Deterministic watchdog | adopted |
| Repo-owned QC with unpinned skills | adopted |
| Full artifact graph | rejected |
| Feature archive | rejected |
| Autonomous local-model watchdog | rejected |
| Compaction summary as orchestrator authority | rejected |
| Risk-based purpose | rejected under current constraints |
| Full PHP/JS adapters | deferred |

---

# 20. Implementation decomposition

1. Реализовать state schemas и reducer.
2. Реализовать context budget accounting.
3. Реализовать bounded payload validation.
4. Реализовать atomic orchestrator checkpoint и checksum.
5. Реализовать successor activation и context-epoch invalidation.
6. Реализовать `turnSeq`, idempotency и event replay.
7. Создать backend capability suite.
8. Реализовать Herdr/Omnigent adapters.
9. Реализовать standalone review-loop.
10. Реализовать role contracts и adjudication.
11. Реализовать missing-tools protocol.
12. Реализовать knowledge/purpose/verification lints.
13. Создать Python reference QC.
14. Реализовать metadata commit guard.
15. Реализовать watchdog.
16. Реализовать project adoption.
17. Провести greenfield и brownfield pilots.
18. Инъектировать failures: duplicate delivery, event gap, lost receipt, quota, session loss, context threshold, unexpected compaction, invalid checkpoint, missing tool, reviewer dispute и E2E correction.
19. После пилота реализовать JS/TS и PHP adapters.

Критерий готовности: feature проходит полный цикл через оба backend, переживает потерю ответа без duplicate side effects и безопасно заменяет orchestrator до compaction без потери findings, decisions, revision gates или outstanding turns.

---

# 21. Допущения

- Backend обязан обнаруживать compaction/context reset; usage telemetry может отсутствовать.
- При отсутствии telemetry используется консервативная оценка.
- Orchestrator successor использует ту же модель и не требует нового model gate.
- Если successor нельзя создать автоматически, run ставится на паузу до compaction.
- Tracked feature-spec разрешено удалить после knowledge sync.
- Git branch обязательна.
- Reviewer и tester используют detached worktrees.
- Technical adjudicator использует одну из подтверждённых reviewer models.
- `100000` cold-resume tokens — настраиваемая default.
- Verification state не содержит raw evidence.
- Brownfield допускается после adoption feature.
- Host credentials, license, hardware и VPN требуют внешнего устранения.
