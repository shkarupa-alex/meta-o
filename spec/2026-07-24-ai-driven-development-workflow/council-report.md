# Council Report

- Rounds: 3
- Converged: no

## Summary

| Rank | Slug | Frozen # | Status | Avg score | Would adopt | Locked at round |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | gpt56solxhigh | 1 | open | 7.3 | 2/3 | - |
| 2 | fable51mxhigh | 2 | open | 5.3 | 1/3 | - |
| - | kimik3reasoning | 3 | dropped | - | - | - |

## Leading proposal (no convergence)

**gpt56solxhigh** (proposal-1):

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

## All proposals

### gpt56solxhigh (proposal-1) — open, score 7.3/10, 2/3 adopt

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

### fable51mxhigh (proposal-2) — open, score 5.3/10, 1/3 adopt

Прежде чем излагать дизайн, зафиксирую рамку — она делает каждое решение нормативным, а не «на вкус», и к ней я привязываю каждый инвариант. Система обязана одновременно удерживать жёсткие ограничения автора (один полный процесс без режимов; тонкий оркестратор, не читающий код; свободный исполнитель без права урезать объём; кросс-ревью двумя ролями — одна той же вендор-семьи, что исполнитель, вторая обязательно другого вендора — плюс отдельный E2E; неизменяемая feature-спека как вход; бизнес-слой как верхняя истина; purpose и **необходимая ссылка на один уровень вверх** механически обязательны для каждой сущности; модели **четырёх рабочих ролей** — сохраняемый default-набор; работа без CI; ядро независимо от CLI и от Herdr/Omnigent; не писать runtime) и защищать инварианты `sdd-issues` (нет спеки-ископаемого, harness-as-goal, false precision, дрейфа). Ниже — нормативный master-spec с шестью подспеками, точными контрактами, exit-кодами, алгоритмами, таблицами переходов и трассами событий; развилки закрыты committed-решениями. Ключевые слова MUST/SHOULD/MAY — в смысле RFC 2119.

---

# `meta-o` — master-spec методологии AI-driven разработки (HELIX)

## 1. Резюме подхода

`meta-o` — тонкий долгоживущий оркестратор поверх Herdr/Omnigent, ведущий одну неизменяемую feature-спеку (закреплённую `spec_digest`) через детерминированный конечный автомат «реализация → чередующиеся контуры cross-review и E2E → сходимость на одной Git-ревизии»; все обязательные требования вынесены из памяти исполнителя в три внешних гейта — механический `meta-o qc` (code-health + purpose/anchor/contract-sweep), два независимых ревьюера (same-family + cross-vendor) с единым rubric и отдельный E2E-тестировщик. Живой слой знаний — компактная grep-цепочка `§B (business) → §A (architecture) → module → symbol`, синхронизируемая пропорционально изменениям кода; эфемерные decision-log и findings и компактный `verification-state.json` дополняют её, старые спеки после интеграции удаляются из поискового контура, а история остаётся в Git. Ядро говорит с сессиями через один абстрактный `SessionAdapter`, где resume идемпотентен благодаря idempotency-key и state-guard (а не одному лишь монотонному `turnSeq`), так что смена backend меняет адаптер, а не методологию.

## 2. Поставка, файловая раскладка и границы ответственности

### 2.1. Документы (master-spec + 6 подспек)

| Файл | Definition of Done |
|---|---|
| `master-spec.md` | Роли, инварианты, глоссарий, taxonomy эскалаций, ownership-таблица, ссылки на контракты §4 |
| `subspecs/lifecycle.md` | `RunState`, `Phase`, полная таблица переходов, критерий DONE, failure/recovery, трассы событий |
| `subspecs/knowledge-layer.md` | anchor-grammar, слои, алгоритм sync, `DecisionLogEntry`, `VerificationRecord`, retirement-gate |
| `subspecs/orchestration.md` | `SessionAdapter`, `SessionEvent`, idempotent-send, retry-политика, reconciliation, model-set, backend-адаптеры, watchdog |
| `subspecs/code-health-qc.md` | `HealthReport`, `pyproject.toml`, алгоритмы purpose-lint/anchor-check/contract-sweep, exit-коды, размещение гейтов |
| `subspecs/review-e2e.md` | rubric, `Finding` + lifecycle, алгоритм разрешения споров, alternation-инвариант, E2E-протокол, completion-check |
| `subspecs/skills-tooling.md` | I/O-контракт каждого skill, install/update-скрипт, TS→JS-сборка, полный CLI-reference |

Методология в прозе — **HELIX**; toolkit, plugin-namespace, CLI — `meta-o`.

### 2.2. Раскладка на диске

```
<repo>/
  docs/knowledge/
    business.md              # L1, якоря §B-*  (человек — владелец авторитета)
    <topic>.md               # L2, якоря §A-*  (напр. runtime.md, evaluation.md)
    verification-state.json  # компактный E2E-стейт (долгоживущий)
  docs/todo.md               # кратко: старый техдолг → отдельная будущая спека
  .meta-o/
    models.json              # ModelSet: 4 рабочие роли (default-набор)
    watchdog.config.json     # WatchdogConfig
    run/<run_id>/
      state.json             # RunState (atomic write: tmp+rename)
      decision-log.md        # эфемерно, удаляется на DONE
      handoff.md             # опционально, выбор пользователя при старте
      relay/                 # findings и payload между сессиями; удаляется на DONE
  pyproject.toml             # [tool.meta-o.*] + конфиги native-анализаторов
```

### 2.3. Ownership (кто и что MAY писать)

| Актор | Пишет | НЕ пишет |
|---|---|---|
| Orchestrator | `run/<id>/state.json`, `decision-log.md`, `relay/*` | `src/**`, `tests/**`, `§B/§A`, docstrings, spec |
| Implementer | `src/**`, `tests/**`, module/symbol docstrings, предложения к `§B/§A` через knowledge-sync, свой `progress` | `verification-state.json`, `state.json`, findings, spec |
| Reviewer-A/B | только `relay/findings-*.json` (payload) | всё в репозитории (read-only на код) |
| Tester | `verification-state.json` (через `meta-o verify-state`), `tests/repro/**` | `src/**`, findings кроме E2E-payload |
| Human | авторитет над L1 `§B-*` (async), `models.json`, spec | — |
| Host | файлы спеки/подспек (артефакты) | — |

Спека — read-only для всех агентов (неизменяемый вход); её целостность закрепляется `spec_digest`. Правка `§B-*` агентом технически возможна как предложение, но авторитет L1 — за человеком (async-ревью diff, §4.4, критика §6.5). Push/PR — только по отдельной просьбе; агент делает лишь локальные коммиты.

## 3. Архитектура и компоненты

### 3.1. Роли

- **Orchestrator** — тонкий управляющий контекст. Держит `RunState`, ведёт FSM, классифицирует вопросы/сбои, передаёт findings **по ссылке** (relay-payload, не втягивая чужой контекст), разрешает споры, эскалирует. MUST NOT читать код. Бюджет контекста конфигурируемый (default 250k, warn 200k). Единственный тяжёлый вход — skill `meta-o:orchestrate`. Модель оркестратора — та, под которой человек запустил управляющую сессию (`orchestrator_model`), и она **не входит** в сохраняемый default-набор четырёх рабочих ролей.
- **Implementer** — сильная модель в goal-сессии. Свобода пути, запрет тихо урезать объём. Ведёт маленький собственный progress (не task-дерево). MAY порождать субагентов для изолированных частей.
- **Reviewer-A (same family)** — сессия той же вендор-семьи, что исполнитель (коррелированный, но глубокий контур), и **Reviewer-B (cross-vendor, MUST другой вендор)** — независимый контур. Обе чистые к реализации на первом проходе; сохраняются между итерациями; заменяются свежими при накоплении bias; работают по разведённым **линзам** (§4.6, §6.3).
- **Tester** — E2E-сессия: сборка, docker, миграции, тесты/бенчмарки, браузер, сценарии, evidence.
- **Adjudicator** — эфемерная read-only-сессия, порождается только для спора: видит спорный регион + пункт спеки (по `spec_digest`) + оба аргумента, возвращает `Verdict`; после ответа уничтожается. Так оркестратор получает понимание кода, не входя в код сам.

### 3.2. Тонкое ядро и шов backend

Ядро (skills + JS-скрипты + протокол) не знает про CLI (Claude/Codex/OpenCode) и meta-framework. Единственный шов — `SessionAdapter` (§4.1); Herdr и Omnigent — две его реализации. Мы НЕ пишем runtime: spawn/resume/доставка событий/управление сессиями — ответственность backend. Наши добавки: (1) **idempotent-send + reconciliation-петля** оркестратора (страховка от потерянного turn-события и от двойного продолжения); (2) внешний **watchdog** восстановления после лимитов. Обе — тонкие обёртки над backend, не новый runtime.

### 3.3. Skills — тонкие «кубики» (namespace-роутеры)

Ничего обязательного не живёт только в необязательном skill: skills — это `GUIDE`; `GATE` — линтеры + ревьюеры + tester; `GOAL` — спека + жёсткая цель. Полные I/O-контракты — §4.7.

## 4. Интерфейсы и модели данных

### 4.1. `SessionAdapter`, события, idempotent-send, retry, reconciliation

```ts
type Role = "orchestrator"|"implementer"|"reviewer_a"|"reviewer_b"|"tester"|"adjudicator"|"reuse_scan";
type SessionState = "running"|"awaiting_input"|"turn_complete"|"transient_error"|"quota_exhausted"|"external_block"|"dead";
type ErrorClass = "retryable"|"quota_exhausted"|"external_block"|"unknown";

interface SpawnOpts { role: Role; vendor: string; model: string; cwd: string; initialPrompt: string; }
interface SessionStatus {
  id: string; state: SessionState; turnSeq: number; lastTurnAt: string;
  contextTokens?: number; cacheLikelyWarm?: boolean; pendingQuestion?: string;
}
interface Ack { deliveryId: string; idempotencyKey: string; acceptedAtTurnSeq: number; }
type SessionEvent =
  | { kind:"turn_complete"; id:string; turnSeq:number }
  | { kind:"awaiting_input"; id:string; question:string }
  | { kind:"error"; id:string; class:ErrorClass; resetAt?:string }
  | { kind:"dead"; id:string };
interface AdapterCaps { pushEvents:boolean; reportsContextTokens:boolean; canCompact:boolean; canResumeAfterReboot:boolean; nativeIdempotency:boolean; }

interface SessionAdapter {
  capabilities(): Promise<AdapterCaps>;
  spawn(o: SpawnOpts): Promise<string>;                                    // -> sessionId
  send(id: string, msg: string, o: {idempotencyKey:string; expectTurn?:boolean}): Promise<Ack>;
  status(id: string): Promise<SessionStatus>;
  events(): AsyncIterable<SessionEvent>;
  interrupt(id: string): Promise<void>;
  requestSummary(id: string): Promise<string>;                            // предкомпакционное резюме
  compact(id: string): Promise<void>;
  kill(id: string): Promise<void>;
  resume(id: string): Promise<SessionStatus>;                             // после падения/reboot
}
```

**Ошибки адаптера:** `SessionNotFound`, `SpawnFailed`, `DeliveryUnacked`, `BackendUnavailable`, `CapabilityUnsupported`.

**Идемпотентность send — честная модель (kills double-continuation).** `turnSeq` сам по себе НЕ гарантирует идемпотентности: есть окно, где ход уже запущен (`running`), но `turnSeq` ещё не вырос; наивный повтор в этом окне создаёт два хода. Поэтому идемпотентность обеспечивается двумя механизмами вместе:
1. **`idempotencyKey` на каждом `send`.** Адаптер MUST дедуплицировать: `send` с ключом, уже принятым для текущей границы хода, не порождает второго исполнения. Если backend не умеет (`nativeIdempotency=false`) — адаптер ведёт локальный ledger `(id, idempotencyKey) → acceptedAtTurnSeq` и глушит дубликат сам (это адаптерный слой, не runtime).
2. **State-guarded resend-предикат.** Повтор допускается только из терминального стопа, никогда — из `running`/`awaiting_input`:
```
resend(id, lastDelivery):
  s = status(id)
  if s.state == "running":                                  return WAIT           # ход идёт — не трогать
  if s.state == "awaiting_input":                           return ANSWER         # он спросил — отвечаем, не «continue»
  if s.turnSeq > lastDelivery.acceptedAtTurnSeq:            return RESUME_NORMALLY # уже продвинулся
  if s.state in {turn_complete, transient_error}
     and s.turnSeq == lastDelivery.acceptedAtTurnSeq:       return SEND(msg, idempotencyKey = lastDelivery.idempotencyKey)
  return ESCALATE(UNKNOWN_FAILURE)
```
Повтор идёт с **тем же** `idempotencyKey`, поэтому даже если оригинал на самом деле дошёл и вот-вот запустится, backend/адаптер отбросит дубль.

**Reconciliation-петля (kills lost-turn-event):** каждые `RECON_SEC=30` оркестратор опрашивает `status()` активных сессий. Если сессия `turn_complete` с `turnSeq`, не обработанным из `events()` — синтетическое событие ставится в очередь. Все события дедуплицируются ключом `(id, turnSeq)`; почти одновременные завершения не теряются.

**Деградация по capability:** `pushEvents=false` → только reconciliation-poll; `reportsContextTokens=false` → оценка тяжести по `turnSeq` и размеру транскрипта; `canResumeAfterReboot=false` → после reboot новая сессия из spec + `handoff.md`; `nativeIdempotency=false` → адаптерный dedup-ledger.

**Retry-политика:**

| Класс | Действие | Расписание |
|---|---|---|
| `retryable` (429/5xx/overload) | wait → `resend()` (same idempotencyKey) | 60,60,60,300,300,300,600,600s; после 8 попыток → `UNKNOWN_FAILURE` |
| `quota_exhausted` | вычислить `resetAt`; ждать `resetAt+300s` | одна попытка на окно; если исчерпан оркестратор — будит watchdog |
| `external_block` | без авто-retry; PAUSED_EXTERNAL | poll восстановления каждые 300s + notify человеку |
| `unknown` | эскалация человеку с сырым сообщением | — |

### 4.2. `RunState`, model-set, FSM, критерий DONE

```ts
interface ModelRef { vendor:string; family:string; model:string; }
// Сохраняемый default-набор = РОВНО 4 рабочие роли (hard-констрейнт «модели четырёх ролей»).
interface ModelSet {
  implementer: ModelRef;
  reviewer_a:  ModelRef;   // INVARIANT: reviewer_a.vendor === implementer.vendor  (та же вендор-семья)
  reviewer_b:  ModelRef;   // INVARIANT: reviewer_b.vendor !== implementer.vendor  (обязательно другой вендор)
  tester:      ModelRef;
}
type Phase = "INIT"|"REUSE_SCAN"|"KNOWLEDGE_PROJECTION"|"IMPLEMENTING"|"IMPL_READY"
 |"REVIEW"|"REVIEW_FIXING"|"REVIEW_CLEAN"|"E2E"|"E2E_FIXING"|"E2E_CLEAN"|"DONE"
 |"RETRY_WAIT"|"QUOTA_WAIT"|"PAUSED_EXTERNAL"|"ESCALATED"|"FAILED_INFEASIBLE";
type EscalationKind = "BUSINESS_IMPACT"|"SPEC_CONTRADICTION"|"SPEC_INFEASIBLE"|"SPEC_MUTATED"|"IRREVERSIBLE_RISK"|"EXTERNAL_BLOCK"|"UNKNOWN_FAILURE";
interface Escalation { id:string; kind:EscalationKind; detail:string; opened_at:string; }
interface RunState {
  run_id:string;
  spec_ref:string; spec_locator_kind:"repo_path"|"external_untracked";
  spec_digest:string;               // sha256 содержимого спеки; закреплённый acceptance-oracle
  models:ModelSet;                  // 4 рабочие роли
  orchestrator_model:ModelRef;      // наблюдается из launch, вне confirmable-set
  handoff_file?:string; phase:Phase;
  head_rev:string; review_clean_rev?:string; e2e_clean_rev?:string;
  reuse_scan:"skipped"|"done"; sessions:Partial<Record<Role,string>>;
  open_findings_count:number; open_escalations:Escalation[];
  retry?:{ class:ErrorClass; attempts:number; next_at:string };
  cycle_budget:{ review_cycles:number; e2e_cycles:number; max:number };  // default max=6
  touched_business_anchors:string[]; updated_at:string;
}
```

`meta-o models` валидирует оба vendor-инварианта при confirm/set и отказывается сохранить набор, их нарушающий. `RunState` персистится атомарно (tmp+rename) после каждого перехода FSM.

**Целостность спеки:** `spec_digest` вычисляется на INIT из разрешённого содержимого. Перед каждым входом в REVIEW/E2E и на DONE оркестратор пересчитывает digest; несовпадение (особенно для `external_untracked`) → `ESCALATED(SPEC_MUTATED)`, т.к. вход объявлен неизменяемым и изменение требует решения человека. Ревьюеры/tester/adjudicator читают спеку строго на зафиксированном `spec_digest` — это immutable acceptance-oracle.

**Критерий завершения (airtight):**
```
canComplete(s) :=
  s.head_rev == s.review_clean_rev == s.e2e_clean_rev
  ∧ s.open_findings_count == 0                      # нет open blocker/major/minor
  ∧ meta-o qc --all PASS на head_rev
  ∧ meta-o anchor-check --gate done PASS
  ∧ spec_digest не изменился с INIT
  ∧ ∀ VerificationRecord затронутых §B: status==pass ∧ git_rev==head_rev
```

**Инвалидизация:** commit, меняющий `code_globs`, делает `review_clean_rev`/`e2e_clean_rev ≠ head_rev`, обнуляя их применимость. Committed: commit только в `doc_globs` (знания), не трогающий `code_globs`, **не инвалидирует** E2E, но требует дешёвого re-review только diff знаний.

**Таблица переходов:**

| Из | Событие/условие | В | Эффект |
|---|---|---|---|
| INIT | model-set(4) подтверждён + spec_digest вычислен | REUSE_SCAN (или KNOWLEDGE_PROJECTION) | — |
| REUSE_SCAN | ReuseFindings без бизнес-влияния | KNOWLEDGE_PROJECTION | запись в decision-log |
| REUSE_SCAN | находка меняет бизнес-смысл | ESCALATED(BUSINESS_IMPACT) | — |
| KNOWLEDGE_PROJECTION | спроецированы §B-TODO/§A-TODO (только якоря+строка) | IMPLEMENTING | — |
| IMPLEMENTING | вопрос TECH_SIMPLE | IMPLEMENTING | оркестратор отвечает (±adjudicator) |
| IMPLEMENTING | вопрос BUSINESS/CONTRADICTION/INFEASIBLE/IRREVERSIBLE | ESCALATED / FAILED_INFEASIBLE | стоп при infeasible |
| IMPLEMENTING | `IMPL_READY` + `meta-o qc --all` PASS | IMPL_READY | — |
| IMPL_READY | spawn/send reviewer_a+b | REVIEW | rubric + rev + spec_digest |
| REVIEW | ∃ подтверждённые findings | REVIEW_FIXING | relay findings исполнителю |
| REVIEW | оба чисто на head_rev ∧ open==0 | REVIEW_CLEAN | `review_clean_rev=head_rev` |
| REVIEW_FIXING | новый commit (head_rev) | REVIEW | те же ревьюеры перепроверяют |
| REVIEW_CLEAN | первый тяжёлый E2E | E2E | — |
| E2E | найдены проблемы | E2E_FIXING | relay findings |
| E2E | чисто на head_rev | E2E_CLEAN | `e2e_clean_rev=head_rev` |
| E2E_FIXING | новый commit | E2E | review_clean устарел |
| E2E_CLEAN | review_clean_rev≠head_rev | REVIEW | — |
| E2E_CLEAN | canComplete() | DONE | миграция decision-log→§A, final knowledge-sync, retire spec, удалить relay |
| REVIEW/E2E | cycle_budget.max превышен | ESCALATED | анти-loop |
| * | spec_digest изменился | ESCALATED(SPEC_MUTATED) | — |
| * | error `retryable` / `quota_exhausted` / `external_block` | RETRY_WAIT / QUOTA_WAIT / PAUSED_EXTERNAL | §4.1 |

**Классификация вопроса/сбоя (алгоритм оркестратора):**
```
classify(input):
  if input is error: match .meta-o LimitPattern → {quota_exhausted|retryable|external_block|unknown}
  if input is question:
    changes acceptance criteria | business meaning | new product decision | outside spec → BUSINESS_IMPACT (human)
    internal spec contradiction                                                        → SPEC_CONTRADICTION (human)
    spec technically impossible                                                        → SPEC_INFEASIBLE (stop+human)
    irreversible/destructive/expensive beyond spec                                     → IRREVERSIBLE_RISK (human)
    else                                                                               → TECH_SIMPLE (orchestrator; adjudicator if code understanding needed)
```

### 4.3. Трассы событий (нормативные последовательности)

**Happy path:**
1. Human запускает оркестратора с `spec_ref`. Skill `meta-o:orchestrate` грузится; `orchestrator_model` фиксируется.
2. `meta-o models show` → предъявлен набор из **четырёх** рабочих ролей → human confirm/set (валидация vendor-инвариантов) → `models.json`. Вычисляется `spec_digest`. `phase INIT→REUSE_SCAN`.
3. Spawn `reuse_scan` → `ReuseFindings` в decision-log; бизнес-влияющее → ESCALATED, иначе `phase→KNOWLEDGE_PROJECTION`.
4. `send(implementer, goal, idempotencyKey)` из `meta-o:implement-goal`; step 0 goal — проекция `§B-TODO/§A-TODO` (только якоря + строка намерения). `phase→IMPLEMENTING`.
5. Implementer кодит, локальные коммиты (pre-commit fast-subset), вопросы TECH_SIMPLE → оркестратор. По готовности: `meta-o qc --all` PASS → turn с маркером `IMPL_READY`.
6. Reconciliation/`events` → `turn_complete+IMPL_READY` → `phase→REVIEW`; spawn/send reviewer_a+b (rubric, rev, `spec_digest`, read-only).
7. Ревьюеры кладут `relay/findings-<reviewer>.json`. Оркестратор дедуплицирует по `(file,line,rule)`, классифицирует severity. Findings → `phase REVIEW_FIXING`, relay исполнителю.
8. Implementer по каждому: fix (новый commit) или dispute; dispute → `adjudicator` → оркестратор решает. Новый head → те же ревьюеры перепроверяют (дёшево).
9. Оба чисто ∧ open==0 → `REVIEW_CLEAN` (`review_clean_rev=head`).
10. `phase→E2E`; tester (`meta-o:e2e-verify`) собирает/поднимает/прогоняет; пишет `VerificationRecord`; провалы → findings.
11. E2E findings → `E2E_FIXING` → fix → E2E повтор (review_clean устарел).
12. E2E чисто → `E2E_CLEAN` (`e2e_clean_rev=head`).
13. review_clean_rev≠head → `REVIEW` снова; чередование.
14. `canComplete()` → `DONE`: миграция durable decision-log → `§A`, финальный knowledge-sync, `anchor-check --gate done`, retire старой спеки (§4.4), удаление `relay/` и `decision-log.md`, компактный run-report (в т.ч. `§B`-diff). Push/PR — не выполняются.

**Failure-трассы:**
- **429:** `error retryable` → RETRY_WAIT (расписание) → по истечении `resend()` (state-guard + same idempotencyKey).
- **Quota:** `error quota_exhausted resetAt` → QUOTA_WAIT. Исчерпан сам оркестратор — watchdog будит его после `resetAt+300s`.
- **External block:** PAUSED_EXTERNAL → notify человеку с причиной → перед долгой паузой `requestSummary` активной сессии → poll восстановления → resume.
- **Reboot:** OS-супервизор поднимает watchdog; при старте оркестратора `meta-o:orchestrate` грузит `state.json`, `adapter.resume()` для каждой сессии, reconciliation по `turnSeq`, продолжение.
- **Spec mutated:** пересчёт `spec_digest` ≠ INIT → ESCALATED(SPEC_MUTATED), остановка до решения человека.

### 4.4. Слой знаний

**Anchor-grammar:**
```
anchor      := "§" ("B"|"A") "-" TOPIC "-" NN
TOPIC       := [A-Z][A-Z0-9]*        NN := [0-9]{2,}
todo-anchor := "§" ("B"|"A") "-TODO-" TOPIC "-" NN
grep-all    := rg -o '§[AB](-TODO)?-[A-Z0-9-]+' docs src tests
```

**Слои (redesign scratchpad идеями GRACE, без XML):**

| L | Место | Ссылка вверх (обязательна) | Отвечает | Запрет |
|---|---|---|---|---|
| L1 Business | `docs/knowledge/business.md`, `§B-*` | — (верх) | проблема, для кого, результат, **что станет лишним при отказе** | описывать модули/классы/функции |
| L2 Architecture | `docs/knowledge/<topic>.md`, `§A-*` | ≥1 `§B-*` (прозой) | инварианты, границы, non-goals, что удалить при отмене | служебные блоки `Status/Derived from` |
| L3 Module | module docstring | ≥1 `§A-*` | зачем модуль, какую часть `§A-*`, граница, что мёртво при отмене | ссылаться на L1 напрямую |
| L4 Symbol | docstring символа (incl. private) | один уровень вверх (см. правило ниже) | причина существования (не механика) | восстанавливать очевидную механику |

**Правило up-link для L4 (механически проверяемо, hard-констрейнт «ссылка на один уровень вверх»):** ссылка символа на его модуль (L3) удовлетворяется **неявно** членством в модуле, **если модуль отображается ровно на один `§A-*`** (символ наследует `§A` модуля). Если модуль отображается на **≥2 `§A-*`**, символ MUST явно назвать, какой `§A-*` он реализует. Линтер проверяет именно это (см. §4.5): наличие purpose и наличие необходимой ссылки; смысловую адекватность и дрейф проверяют ревьюеры. Более дальние прямые ссылки допустимы при необходимости.

**Динамическая гранулярность:** одна строка purpose обязательна везде; расширенные поля (invariants, rationale, отвергнутые альтернативы, `SFT_HINT`) добавляются только где будущий агент правдоподобно ошибётся. TODO-проекция принимается **в лёгкой форме** (только якоря + строка), полные контракты/docstrings заранее не пишутся; снятие `§*-TODO-*` гейтится `anchor-check --gate done`.

**Алгоритм knowledge-sync (`meta-o:knowledge-sync`):**
```
BEFORE: rg §B business.md → rg §A docs/knowledge → rg §A src tests → проверить цепочку
AFTER:
  update §B iff бизнес-смысл изменился                       (предложение; авторитет — человек, async)
  update §A iff решение/инвариант/граница изменились
  update module docstring затронутых модулей (+ up-link §A)
  update symbol docstring только где изменилась причина существования (+ up-link по правилу L4)
PROPORTIONALITY (эвристика, enforcement — ревьюер):
  новый §A MUST соответствовать новой границе/инварианту, а не одной функции
  правка в 1 строку → максимум обновление purpose одного символа; новые §A запрещены
```

**Эфемерные и компактные контракты:**
```ts
interface DecisionLogEntry { id:string; ts:string; kind:"orchestrator_answer"|"tech_decision"|"reuse_choice"; question?:string; decision:string; rationale:string; durable_target?:string; }
interface Finding { id:string; severity:"blocker"|"major"|"minor"|"taste"; evidence:string; spec_or_risk_link:string; reviewer:Role; status:"open"|"fixed"|"disputed"|"wontfix_documented"; resolution?:string; } // relay/findings-*.json; ledger не ведётся, на DONE удаляется
interface Verdict { finding_id:string; upheld:boolean; evidence:string; }                       // от adjudicator
interface ReuseFinding { candidate:string; fits:string; risks:string; business_impact:boolean; }
interface VerificationRecord { scenario_id:string; business_link:string; git_rev:string; date:string; status:"pass"|"fail"|"stale"; evidence_ref?:string; } // docs/knowledge/verification-state.json; сырые логи/скриншоты не архивируются; stale авто при git_rev!=HEAD
```

**Retirement-gate старой спеки (repo_path):** удаляется из поискового контура ТОЛЬКО когда (а) все `§*-TODO-*` сняты; (б) `anchor-check` не находит мёртвых ссылок; (в) ≥1 `VerificationRecord` связывает её `§B-*` с фактом. Провенанс — в Git.

### 4.5. Code-health и QC

```ts
interface HealthFinding { tool:string; rule:string; severity:"error"|"warn"; file:string; line?:number; symbol?:string; metric?:string; value?:number; limit?:number; message:string; }
interface HealthReport { ok:boolean; language:string; ran:string[]; missing_tools:string[]; findings:HealthFinding[]; summary:{errors:number; warns:number}; }
```

**`pyproject.toml` (конкретная реализация Python):**
```toml
[tool.ruff.lint]        # C901 cyclomatic
select = ["C901"]
[tool.ruff.lint.mccabe]
max-complexity = 10

[tool.pylint.design]
max-args = 6
max-statements = 50
max-public-methods = 15
max-parents = 5
[tool.pylint.format]
max-module-lines = 400

[tool.meta-o.health]                 # агрегируется meta-o qc
max_file_lines = 400
max_class_lines = 300
max_function_lines = 60
max_nesting_depth = 4
cognitive_max = 15                   # flake8-cognitive-complexity
maintainability_min_grade = "B"      # radon mi
code_globs = ["src/**/*.py"]
doc_globs  = ["docs/**/*.md"]

[tool.importlinter]                  # границы/циклы
root_package = "app"
[[tool.importlinter.contracts]]
name = "layers"; type = "layers"; layers = ["app.api","app.domain","app.infra"]
[[tool.importlinter.contracts]]
name = "no-cycles"; type = "independence"

[tool.meta-o.purpose]
require_docstring = ["module","class","function","method"]   # incl private
purpose_first_line = true
module_requires_anchor = "§A-[A-Z0-9-]+"
symbol_requires_link_one_level_up = true                     # линтер проверяет по правилу L4 (§4.4)
exceptions_markers = ["# meta-o: generated","@generated","@synthetic"]
exceptions_globs   = ["**/migrations/**","**/*_pb2.py"]
native_docstring = "pep257"
```

**Адаптеры (разумная основа):** PHP — `phpmd`(cc/npath/length/coupling)+`phpstan`/`psalm`+`deptrac`(слои/циклы)+`phpcs` custom sniff; конфиг `phpmd.xml`/`deptrac.yaml`. JS/TS — `eslint`(`complexity`,`max-lines`,`max-lines-per-function`,`max-depth`,`sonarjs/cognitive-complexity`)+`dependency-cruiser`+`eslint-plugin-jsdoc`; конфиг `.eslintrc`/`.dependency-cruiser.js`. Все нормализуются в один `HealthReport`.

**Алгоритмы скриптов (exit-коды нормативны):**
```
purpose-lint(paths):
  build module→{§A-*} map из module docstrings
  for f in code_globs \ (exceptions_globs ∪ файлы с generated-маркером):
    module: docstring ∧ purpose(first line, len≥12, ≠имя) ∧ ≥1 §A-*
    for each class/function/method (incl nested/private/property):
      docstring ∧ purpose(first line)
      up-link:
        if module→ ровно 1 §A-* : ссылка удовлетворена неявно (наследование модуля)
        if module→ ≥2 §A-*      : символ MUST явно назвать один §A-*  [ERROR если нет]
  exit: 0 ok | 1 missing purpose/anchor/uplink | 2 parse error
anchor-check(--gate dev|done):
  defs = headings '## §B-*' (business.md) ∪ '## §A-*' (docs/knowledge/*)
  refs = rg §… over docs,src,tests
  ERROR: dead ref | duplicate id | src/** ссылается на §B-* напрямую | (--gate done) §*-TODO-* в code_globs
  WARN:  §A без ссылающегося модуля | §B без §A
  exit: 0 | 1 on ERROR
contract-sweep():
  ERROR: module/symbol docstring ссылается на несуществующий §A-*
  WARN:  модуль заявляет §A-X, но нет VerificationRecord, связанного с его §B upstream
  exit: 0 | 1 on ERROR
```

**Размещение гейтов — решение и обоснование:**

| Слой | Состав | Скорость | Роль |
|---|---|---|---|
| `meta-o qc --all` | code-health + purpose-lint + anchor-check + contract-sweep | сек–мин | **авторитетный обязательный gate** |
| pre-commit | `--changed`: format, purpose-lint, anchor-check(dev), ruff C901 | <5с | тесная петля исполнителя |
| pre-push | `meta-o qc --all` | как qc | backstop перед share |
| CI | дубликат `meta-o qc --all` | — | опционально |

Авторитет — `meta-o qc --all`, гейт FSM (перед REVIEW; ревьюеры и tester перезапускают его же). Работает без CI (hard-констрейнт). pre-commit держим быстрым: исполнитель делает много локальных коммитов; тяжёлые проверки там спровоцировали бы `--no-verify`. pre-push не первичен (push — по просьбе). Отсутствие анализатора → `missing_tools` в отчёте и эскалация, а не «молча зелёный». Линтер проверяет **наличие** purpose и необходимой ссылки; **смысловую адекватность и дрейф** — ревьюеры (§4.6).

### 4.6. Review, E2E, завершение

**Единый rubric (порядок свободный):** 1) `§B-*` бизнес-смысл (приоритет); 2) `§A-*` инварианты/границы/связность/циклы/god-файлы; 3) спека и обязательные пожелания (в т.ч. reuse-находки не проигнорированы); 4) корректность/безопасность/регрессии; 5) purpose-дрейф (причина, не механика; up-link адекватен); 6) сопровождаемость (локальность правок, дублирование, временные слои).

**Разведение линз:** Reviewer-B (cross-vendor) → rubric 1–3 (бизнес/архитектура/спека); Reviewer-A (same family) → rubric 4–6 (корректность/безопасность/детали, где знакомство с семьёй исполнителя даёт глубину). Оба свободны выйти за линзу.

**Lifecycle финдинга:** `open → {fixed | disputed → adjudicator → (upheld: open | rejected: закрыт) | wontfix_documented}`. Все подтверждённые дефекты (incl. minor) фиксятся; не блокируют только доказанно вкусовые (`taste`); `wontfix_documented` MUST сопровождаться in-code комментарием «почему так».

**Разрешение споров (алгоритм):**
```
resolveDispute(f):
  needsCode = f требует понимания кода
  if needsCode: v = adjudicator(f, spec@digest);  if !v.upheld → close(f); else keep open
  else: оркестратор сверяет спеку, аргументы, других ревьюеров, тесты, production-ready
  if нет надёжного тех-ответа | продуктовая семантика | необратимость → ESCALATED (human)
```

**E2E-протокол:** собрать; поднять docker/сервисы; миграции; тесты/бенчмарки; браузер/сценарии; интеграции; evidence (команды, статусы, ключевые логи, скриншоты); `VerificationRecord`. Из GRACE: immutable acceptance-oracle (spec@digest, исполнитель не правит критерии), независимый валидатор, запрет «зелёный = успех» без бизнес-evidence, опциональные mutation-тесты со скрытыми от генератора мутантами против overfitting.

**Чередование и завершение:** первый тяжёлый E2E — после первого чистого cross-review; далее REVIEW и E2E чередуются; любое изменение кода инвалидирует подтверждение другого контура; DONE ⇔ `canComplete()` (§4.2) — одна Git-ревизия последовательно прошла оба независимых ревью и E2E без изменений между финальными подтверждениями. Повторное ревью — те же сессии; при накоплении bias — свежие. `review-loop` — самостоятельный skill, вызываемый и вне полного флоу.

### 4.7. Skill I/O-контракты

| Skill | Invoked by | Inputs | Outputs | Side-effects |
|---|---|---|---|---|
| `meta-o:orchestrate` | Orchestrator | `spec_ref`+`spec_digest`, `models.json`, `state.json`\|— | обновлённый `RunState`, relay-сообщения, эскалации | spawn/send через adapter; пишет `run/<id>/*`; NOT `src/**`/spec |
| `meta-o:implement-goal` | Orch→Implementer | spec@digest, goal (жёсткий: всё, не урезать; step0 проекция якорей; vertical-slice) | код, коммиты, ответы/вопросы, `IMPL_READY` | пишет `src/**`,`tests/**`,docstrings |
| `meta-o:review-loop` | Orch / standalone | spec@digest\|task, target rev, read-only код, rubric | `relay/findings-*.json` (`Finding[]`) | read-only на код |
| `meta-o:e2e-verify` | Tester | spec@digest, rev, env-команды | `VerificationRecord`, `Finding[]` при провале | пишет `verification-state.json`, `tests/repro/**` |
| `meta-o:knowledge-sync` | Implementer/Reviewer | diff, `§B/§A` | предложения к `§B/§A`, docstrings (+ up-link) | пишет L2–L4; L1 — предложение |
| `meta-o:reuse-scan` | Orchestrator | spec@digest, домен | `ReuseFinding[]` | read-only; запись в decision-log |

### 4.8. Watchdog

```ts
interface LimitPattern { provider:string; kind:ErrorClass; regex:string; reset_hint_regex?:string; }
interface WatchdogConfig { runs:string[]; poll_interval_sec:number; patterns:LimitPattern[]; classifier_model?:ModelRef; wake_command_template:string; push_notify?:{channel:string}; }
```
```
watchdog loop (под launchd/systemd — «кто стережёт watchdog» = ОС):
  for run in runs: read state.json + session statuses
    stall = detect (turn_complete без реакции | error | awaiting_input)
    class = deterministic match(patterns);  if ambiguous ∧ classifier_model → local-model ТОЛЬКО классификация
    quota → wait resetAt+300s → idempotent wake через resend() + same idempotencyKey
    external/human → push_notify, не будить
    один watchdog обслуживает несколько проектов (runs)
```
Committed: **гибрид** — детерминированный автомат по версионируемой `patterns` + локальная модель только для неоднозначной классификации, никогда для проектного контекста.

## 5. Ключевые компромиссы

- **Enforcement вне памяти исполнителя, не большой обязательный skill.** Цена: инженерия линтеров/hooks. Выигрыш: обязательное переживает компакцию; исполнитель — «художник».
- **`meta-o qc` авторитет, CI дублирует.** Цена: локальный запуск медленнее CI-кэша. Выигрыш: работа без CI + одинаковое поведение у всех ролей.
- **Тонкий оркестратор + adjudicator.** Цена: +1 эфемерная сессия на спор. Выигрыш: чистый управляющий контекст + меньше неверных вердиктов вслепую.
- **Purpose: строка + необходимый up-link везде, расширение по риску.** Цена: адекватность расширенных полей — на ревьюере. Выигрыш: 100% трассируемость без бюрократии.
- **Идемпотентность через key + state-guard, а не только turnSeq.** Цена: адаптерный dedup-ledger при `nativeIdempotency=false`. Выигрыш: нет двойных продолжений в окне `running`.
- **`spec_digest` закрепляет неизменяемый вход.** Цена: пересчёт хэша на границах фаз. Выигрыш: механическая защита acceptance-oracle и детект скрытой мутации внешней спеки.
- **`SessionAdapter` вместо привязки к backend.** Цена: адаптер + reconciliation. Выигрыш: смена backend меняет адаптер, не методологию.

## 6. Критика решений автора (обязательный раздел)

Формат: (1) слабость/отказ; (2) лучший вариант в рамках; (3) альтернатива, возможно нарушающая; (4) hard-констрейнт vs пересматриваемое; (5) цена. «→ решено» — committed.

**6.1. Оркестратор разрешает споры «вслепую».** (1) не читая код, выберет убедительный, но неверный аргумент. (2) обязательный `adjudicator` (read-only, спорный регион + spec@digest + оба аргумента → `Verdict`). (3) точечный read-only бюджет самому оркестратору. (4) hard: чистый управляющий контекст; пересматриваемо: «никогда не касается кода даже точечно». (5) adjudicator: +сессия/латентность; прямой доступ: риск раздувания контекста. → решено: adjudicator.

**6.2. Дисциплина на «спека+результат» при запрете обязательного skill.** (1) без механических гейтов большой diff поздно падает → дорогая переделка. (2) purpose/anchor/knowledge-sync — механические гейты (`meta-o qc`), goal лишь называет их. (3) детерминированный «protocol-reminder» через pre-commit hook (5 строк). (4) hard: обязательное не держится на памяти большого skill; пересматриваемо: «ничего не напоминать в процессе». (5) гейты: стоимость поддержки; reminder: лёгкий шум против позднего дрейфа. → решено: гейты + опциональный hook-reminder (default off).

**6.3. Два ревьюера, same-family избыточен.** (1) same-family коррелирует по ошибкам с исполнителем. (2) сохранить обоих (`reviewer_a.vendor==implementer.vendor`, `reviewer_b.vendor!=implementer.vendor`) и развести по линзам (§4.6). (3) один cross-vendor + усиленная механика (`contract-sweep`+mutation). (4) hard: ≥1 ревьюер другого вендора + один той же семьи + независимость ошибок; пересматриваемо: «ровно две сессии всегда». (5) two-lens: прежняя стоимость, выше отдача; один+механика: дешевле, риск пропуска. → решено: two-lens с явными vendor-инвариантами.

**6.4. TODO-проекция спеки в знания до кода.** (1) риск false precision/дрейфа + запрет заранее писать code-level contract. (2) проецировать только якоря + строку намерения (`§*-TODO-*`), снятие гейтить `anchor-check --gate done`. (3) не проецировать заранее вовсе. (4) гипотеза, не констрейнт; рядом hard: L1 обязателен. (5) лёгкая проекция: минимум дрейфа + навигация; отказ: риск потерять архитектурный фокус. → решено: лёгкая проекция.

**6.5. Async авто-обновление §B без синхронного gate.** (1) молчаливый дрейф самого дорогого слоя. (2) async сохранить, но: `§B`-diff в run-report, `anchor-check` против сиротства, ревьюер проверяет `§B`-дрейф. (3) точечный синхронный ack человека только на создание/смену смысла `§B-*`. (4) hard: L1 обязателен и верхняя истина; пересматриваемо: «только async». (5) guard-only: минимум трения, остаточный риск; ack: редкие точки против ~нулевого дрейфа. → решено: guard-only по умолчанию, ack — config-флаг `business_anchor_ack` (default false).

**6.6. Один исполнитель на всю спеку при лимитах контекста.** (1) на большой brownfield-feature упрётся в контекст/связность. (2) санкционировать паттерн **vertical-slice** (по одному `§B`-сценарию до qc-чистоты) + разрешённые субагенты. (3) лёгкий PBS-gate только для очень больших спек. (4) hard: один сильный исполнитель, свобода пути, запрет урезать; пересматриваемо: «никакой декомпозиции никогда». (5) vertical-slice: почти бесплатно; PBS-gate: возвращает SDD-вес. → решено: vertical-slice; `large_spec_threshold` — advisory-предупреждение.

**6.7. Удаление старых спек из поиска.** (1) «пропорционально» неизмеримо → риск удалить до реального переноса знания. (2) retirement-gate (§4.4). (3) выносить спеки во внешнее untracked-хранилище вместо удаления. (4) hard: старые спеки не остаются в поисковом контуре; пересматриваемо: «именно удалять». (5) gate: лёгкая проверка; внешнее хранилище: накладные, нулевая потеря истории. → решено: retirement-gate.

## 7. Риски и меры

- **Потерянное turn-событие** → push-события + reconciliation-poll + dedup `(id,turnSeq)`.
- **Двойное продолжение** → idempotencyKey + state-guarded `resend()` (не только turnSeq); адаптерный dedup-ledger при `nativeIdempotency=false`.
- **Скрытая мутация неизменяемой спеки** → `spec_digest` на INIT + пересчёт на границах фаз → `SPEC_MUTATED`.
- **Компакция оркестратора** → бюджет контекста в `RunState`, статусы вместо логов, relay-by-reference, эскалация до границы.
- **Спека потеряла важное** → reuse/обязательные пожелания как пункты rubric (полноту методология не валидирует — констрейнт).
- **Код растёт быстрее архитектуры** → блокирующий `meta-o qc` (размеры/сложность/import-linter циклы) + архитектурный rubric; глобальный аудит — отдельный инструмент (out of scope).
- **E2E на словах** → `VerificationRecord` с `git_rev`+evidence-ref; immutable oracle; запрет «зелёный=успех».
- **Бесконечный цикл findings** → severity-классы, `cycle_budget.max`, taste не блокирует, `wontfix_documented` с in-code обоснованием.
- **Неверный model-set** → `meta-o models` валидирует vendor-инварианты (same-family + cross-vendor) до сохранения.
- **Backend/анализатор несовместим** → `capabilities()` + graceful degradation; `missing_tools` → эскалация.
- **Watchdog/оркестратор не проснулись** → гибридный watchdog вне лимита оркестратора, под ОС-супервизором.
- **Дрейф знаний** → `anchor-check` + `contract-sweep` + пропорциональность + ревью `§B/§A`.

## 8. Допущения (записаны) и калибруемые параметры

**Committed-допущения:** backend даёт spawn/resume/события и минимум `status()`-poll (иначе reconciliation); идемпотентность — key+state-guard, при `nativeIdempotency=false` dedup на уровне адаптера; Python — первичный стек, PHP/JS — адаптеры на данной основе; спека неизменяема и закреплена `spec_digest`, нереализуемость → `FAILED_INFEASIBLE`, мутация → `SPEC_MUTATED`; `reuse-scan` — стартовая опция (default on), бизнес-влияющее эскалируется; ModelSet — **ровно 4 рабочие роли** с инвариантами `reviewer_a.vendor==implementer.vendor` и `reviewer_b.vendor!=implementer.vendor`, предъявляется на каждом старте/продолжении; оркестраторская модель — отдельно, вне набора; doc-only commit не инвалидирует E2E; финальные документы — по-русски, идентификаторы/команды/схемы — по-английски.

**Калибруемые эмпирикой (committed-дефолты):** бюджет контекста оркестратора 250k (warn 200k), re-warm-порог 100k; `cycle_budget.max=6`; `RECON_SEC=30`; retry-расписание §4.1; таблица `LimitPattern` по Claude/Codex; пороги code-health §4.5 — все в native-конфиге, не в коде.

Следующий шаг — материализовать §4 в шесть подспек §2, начиная с `orchestration.md` (`SessionAdapter` + idempotent-send) и `code-health-qc.md` (`meta-o qc` + purpose-lint с up-link для Python), поскольку именно они разблокируют механические гейты, на которых держится вся методология.

### kimik3reasoning (proposal-3) — dropped

# Предложение: методология **MetaO** — тонкий stateless-оркестратор, ролевые долгоживущие сессии, цепочка знаний и механические gates

## 1. Краткое резюме подхода

MetaO проектируется как набор **CLI-независимых skills + машинных контрактов + автономных QC-скриптов**, где оркестратор является тонкой state machine, всё процессное состояние которой живёт в `feature-state.json` на диске, а не в её контексте — это делает процесс переживаемым после компакции, перезапуска и даже полной смерти оркестратор-сессии. Контроль результата вынесен в три независимых контура (детерминированный локальный QC, два разновендорных review, E2E) с инвариантом завершения «одна и та же Git-ревизия последовательно прошла review A + review B + E2E без изменений», а знание проекта хранится в четырёхзвенной цепочке `§B → §A → module → symbol` с механически проверяемыми якорями и purpose. Надёжность доставки событий не доверяется Herdr/Omnigent, а достигается протоколом «ожидание с таймаутом + опрос + идемпотентный повтор» поверх потенциально ненадёжного backend, плюс опциональный watchdog гибридного дизайна.

## 2. Архитектура и компоненты

### 2.1. Принципиальные решения верхнего уровня

1. **Stateless-by-design оркестратор.** Главный страх автора — компакция оркестратора — снимается не запретом компакции, а конструкцией: оркестратор обязан восстанавливать полное процессное состояние из `feature-state.json` + skill-файла после любой потери контекста. В его контексте нет ничего, чего нет на диске. Побочный выигрыш: watchdog может **полностью пересоздать** мёртвого оркестратора wake-промптом «прочитай skill + state file, продолжи», а не только «пнуть» его.
2. **Надёжность через протокол, а не через backend.** Автор сам наблюдал потерю событий в Herdr/Omnigent. Поэтому каждое обращение оркестратора к роли порождает в state file **expectation** с таймаутом; по таймауту оркестратор опрашивает сессию (pull), при неопределённости шлёт идемпотентный nudge («если уже работаешь — проигнорируй»). Push-события backend — оптимизация задержки, а не источник корректности.
3. **Роли не обязаны помнить протокол.** Соответствие протоколу проверяется снаружи: исполнитель — через QC и review, ревьюер — через формат findings, тестировщик — через verification state. Skill исполнителя существует как справка, но методология не стоит на его памяти через компакции (прямой урок из my-opinion).
4. **Машинные футеры вместо парсинга прозы.** Каждая роль заканчивает turn блоком ` ```metao ` с key-value полями. Это единственный контракт, который должен соблюдаться жёстко, и он тривиально распознаётся из сырого терминального вывода любого backend.
5. **Оркестратор не читает код.** Ему разрешён только read-only git plumbing (`rev-parse`, `status`, `log -1`) как метаданные процесса. Всё, что требует понимания кода, делегируется исполнителю или ревьюерам; оркестратор оперирует выводами и доказательствами.

### 2.2. Состав системы

| Компонент | Природа | Ответственность |
|---|---|---|
| `metao-orchestrator` | skill (CLI-agnostic) + state file | State machine фичи; dispatch/relay сообщений; ответы на технические вопросы исполнителя; классификация сбоев; эскалации; контекстный бюджет |
| `metao-backend-herdr` / `metao-backend-omnigent` | adapter skills | Отображение примитивов сессий (см. 3.1) на конкретный meta-framework; декларация capabilities |
| Executor goal-template | шаблон goal-текста (не «ритуальный skill») | Цель: вся спека, QC, knowledge sync, протокол вопросов, progress file, запрет тихого недоделывания |
| `metao-reviewer` | skill | Единый короткий rubric + формат findings + протокол перепроверки |
| `metao-e2e-runner` | skill | Smoke pre-flight, тяжёлый E2E, обновление verification state |
| `metao-review-loop` | skill | Самостоятельный кубик cross-review вне полного feature-flow (явное требование автора) |
| `metao-knowledge-sync` | skill | Правила цепочки §B→§A→module→symbol, пропорциональность, retirement спеки |
| QC toolchain | standalone JS (скомпилированные TS-исходники, без runtime-зависимостей) + нативные конфиги | `metao-purpose-lint`, `metao-anchor-lint`, `metao-size-lint`, `metao-verify-state`, агрегатор `metao-qc` |
| `metao-watchdog` | демон (детерминированное ядро + опциональный классификатор на локальной модели) | Multi-project наблюдение: quota-wake, stall detection, воскрешение оркестратора |
| `install.sh` / `update.sh` | shell | Установка skills и scripts в user-level каталоги обнаруженных CLI (Claude/Codex/OpenCode); версии проектом не фиксируются |

### 2.3. Knowledge layer (критический redesign scratchpad — минимальный)

```
docs/knowledge/
  business.md              # уровень 1: §B-<DOMAIN>-NN, обязательная верхняя точка истины
  architecture/<topic>.md  # уровень 2: §A-<TOPIC>-NN, тематические файлы
  glossary.md              # компактный term map (защита от semantic fan-out из sdd-issues)
  verification.md          # компактный E2E verification state (§E2E-*)
docs/todo.md               # старый техдолг, найденный вне текущей спеки
.metao/<feature-id>/       # gitignored runtime: feature-state.json, decision-log.md,
                           # executor-progress.md, опциональный handoff.md
```

Сознательные отличия от scratchpad: (а) каталог `docs/knowledge/` вместо плоского `docs/` — явная граница поискового контура; (б) добавлен `glossary.md`; (в) файл назван `business.md` (в scratchpad опечатка `_buisiness.md`); (г) уровни 3–4 остаются в коде: module docstring → symbol docstring. Запрет служебных блоков вида `Status`/`Derived from` из scratchpad сохранён: связи пишутся обычным текстом.

### 2.4. State machine фичи (состояния, переходы, критерии остановки)

```
INIT → MODELS_CONFIRMED → SESSIONS_SPAWNED → IMPLEMENTING
IMPLEMENTING ⇄ EXECUTOR_QUESTION            (вопросы → decision log)
IMPLEMENTING → BLOCKED_SPEC → ESCALATED → ABORTED   (спека нереализуема)
IMPLEMENTING → QC_VERIFY → SMOKE_PREFLIGHT → REVIEW_ROUND
REVIEW_ROUND ⇄ FIXING                        (пока A и B не CLEAN на одном sha)
REVIEW_ROUND(clean A+B @ sha) → E2E_ROUND
E2E_ROUND ⇄ FIXING → REVIEW_ROUND            (любое изменение инвалидирует оба контура)
E2E_ROUND(pass @ sha) ∧ sha==HEAD → KNOWLEDGE_SYNC → DONE
Сквозные: PAUSED_QUOTA / PAUSED_EXTERNAL / RETRY_WAIT / ESCALATED
```

**Инвариант завершения (единственный критерий DONE):** существует `rev*`, для которого `reviewA.clean(rev*) ∧ reviewB.clean(rev*) ∧ e2e.pass(rev*) ∧ HEAD == rev*`, и `metao-anchor-lint --no-planned` зелёный. Любой коммит после любого подтверждения стирает подтверждение этого sha — это механически реализует правило «изменение инвалидирует другой контур».

**Safety valves против бесконечных циклов:** (1) находка, оспоренная дважды, решается оркестратором по доказательствам либо эскалируется; (2) `max_review_rounds` (default 5) с новыми BLOCKER в каждом раунде → эскалация человеку как системный симптом; (3) TASTE не блокирует по определению rubric; (4) `stall_timeout` per phase в state file — watchdog видит отсутствие прогресса.

### 2.5. Последовательность событий (happy path)

0. Пользователь запускает оркестратор-сессию со ссылкой на утверждённую спеку (путь или URL; валидации/переписывания спеки нет).
1. Оркестратор показывает default-набор моделей из `~/.metao/models.yaml` → пользователь подтверждает или меняет и сохраняет (gate G1 — единственный синхронный gate процесса). Валидация: `vendor(reviewer_b) != vendor(executor)`.
2. Создаётся `feature-state.json`, feature branch. Опциональный time-boxed reuse-scan (см. 4.6).
3. Spawn исполнителя с goal-текстом: спека целиком, обязанности (QC, knowledge sync с реализацией, протокол вопросов, progress file ≤100 строк в `.metao/`), запрет тихого сокращения объёма.
4. IMPLEMENTING: вопросы → оркестратор. Простые технические — решает сам по зафиксированным принципам; меняющие бизнес-смысл — эскалация человеку; все Q/A → decision log. Knowledge projection (planned-якоря) и конверсия planned→factual идут вместе с реальной реализацией, не заранее (см. 4.2). Purpose и ссылки в docstring обновляются только с реальной реализацией.
5. Исполнитель сообщает `DONE @ sha` + вывод `metao-qc` с exit code. Оркестратор проверяет sha через `rev-parse`.
6. Spawn тестировщика → **smoke pre-flight** (сборка, boot, health-check) на sha. Провал → исполнителю, не тратя review-цикл (см. 4.5).
7. Spawn ревьюеров A (тот же вендор) и B (другой вендор) → review sha по rubric. Findings → исполнителю дословно → фиксы/аргументированные возражения → новый sha → те же ревьюеры перепроверяют (пока это выгодно; замена свежими сессиями допустима). До CLEAN обоих на одном sha.
8. Тяжёлый E2E на sha → находки → исполнителю → возврат к шагу 7 (перепроверка review) → снова E2E. Чередование.
9. Инвариант завершения выполнен → KNOWLEDGE_SYNC: `metao-anchor-lint --no-planned`, дистилляция decision log в §A/§B, обновление `verification.md`, retirement-чеклист спеки, записи старого долга в `docs/todo.md`, техдолг текущей спеки закрыт до завершения.
10. Completion report пользователю: diff-summary, **отдельной секцией — изменения `business.md`**, открытые риски. Локальные коммиты сделаны агентом; push/PR — только по отдельной просьбе. Сессии расходуются; runtime-каталог чистится после sync.
11. Рефлексия: обнаруженный системный дефект методологии/skill/проверки оформляется записью в `docs/todo.md` или отдельной фичей на саму методологию — не случайной правкой.

### 2.6. Декомпозиция на implementation-ready подспеки

| Подспека | Содержание |
|---|---|
| `00-master-spec.md` | Принципы, роли, границы ответственности, инварианты, глоссарий системы |
| `10-feature-lifecycle.md` | State machine, события, expectation/timeout-таблица, failure/recovery semantics, критерии остановки, матрица эскалаций |
| `20-knowledge-layer.md` | Форматы якорей, правила sync, пропорциональность, протокол planned→factual, retirement спеки, brownfield bootstrap |
| `30-purpose-and-tracing.md` | Конвенции purpose по языкам, правила ссылок «один уровень вверх», формализованные исключения для generated-кода |
| `40-orchestration-protocol.md` | Машинные блоки, adapter contract, herdr/omnigent capability matrix, контекст/кэш-политика, идемпотентность |
| `50-review-and-e2e.md` | Rubric, схема findings, правила перепроверки, чередование контуров, verification state, smoke pre-flight |
| `60-qc-toolchain.md` | Конкретные Python-конфиги, сравнение QC/pre-commit/pre-push, PHP/JS adapter-наброски |
| `70-watchdog.md` | Полный дизайн, сравнение вариантов, конфиг, install |
| `80-skills-and-install.md` | Инвентарь skills, packaging per CLI, `install.sh`/`update.sh` |
| `90-decision-log-and-reflection.md` | Схема decision log, дистилляция в knowledge layer, lessons-learned loop |

## 3. Ключевые интерфейсы и модели данных

### 3.1. Backend adapter contract (оркестратор → Herdr/Omnigent)

```
session_create(role: Role, cli: "claude"|"codex"|"opencode", model: string,
               workdir: path, initial_prompt: text) -> session_id
  Errors: BACKEND_UNAVAILABLE, QUOTA_EXHAUSTED(reset_at?)
session_send(session_id, text) -> ack
  Errors: SESSION_LOST, BACKEND_UNAVAILABLE
session_read_tail(session_id, n_lines) -> text
session_status(session_id) -> RUNNING | IDLE | WAITING_INPUT | DEAD | UNKNOWN
session_list() -> [{session_id, role, status}]
# Опциональные capabilities (adapter декларирует; при отсутствии — деградация):
session_compact(session_id) -> ack                  # иначе — progress file
session_context_size(session_id) -> int | UNKNOWN   # иначе — эвристики порогов
```

Устойчивый `UNKNOWN` после повторных опросов → эскалация человеку. При смене backend меняется только adapter skill, ядро методологии и протокол неизменны.

### 3.2. Машинный блок роли (роль → оркестратор), завершает каждый turn

````
```metao
STATUS: WORKING | DONE | QUESTION | BLOCKED_SPEC | FINDINGS | E2E_RESULT
REVISION: a1b2c3d
SUMMARY: <одна строка>
```
````

Типизированные payload: `QUESTION` (варианты + рекомендация + класс `technical|business`), `FINDINGS` (см. 3.3), `BLOCKED_SPEC` (доказательство технической невозможности), `E2E_RESULT` (§E2E-id + PASS/FAIL + краткое evidence + классификация `flake|defect`). Оркестратор отвечает адресно; findings передаются исполнителю **дословно**, без сжатия.

### 3.3. Finding schema (единый короткий rubric-формат)

```
- ID: F-<reviewer>-<round>-NN
  SEVERITY: BLOCKER | MAJOR | MINOR | TASTE
  EVIDENCE: path:line | symbol | command output
  LINK: <параграф спеки | §B/§A-якорь | engineering risk: одна строка>
  CLAIM: <что не так и почему это дефект, а не вкус>
```

Rubric (фиксированный): 1) соответствие спеке; 2) корректность; 3) архитектура/границы/связность; 4) адекватность purpose и знаний (семантический дрейф); 5) достаточность проверок; 6) сопровождаемость. Порядок анализа свободен; формат вывода — нет. Асимметрия: reviewer A (тот же вендор) делает упор на 1–2 (мыслит как исполнитель — проверяет намерение), reviewer B (чужой вендор) — на 3–4 (независимый взгляд). Все подтверждённые дефекты, включая MINOR, исправляются; TASTE требует доказательства влияния, иначе не блокирует. Отклонённое замечание получает явный ответ в коде («почему так» — комментарий).

### 3.4. `feature-state.json` (атомарная запись tmp+rename)

```json
{
  "feature_id": "2026-07-24-billing-retry",
  "spec_ref": {"kind": "repo_path|external_path|url", "value": "..."},
  "branch": "feature/billing-retry",
  "phase": "REVIEW_ROUND",
  "phase_entered_at": "2026-07-24T18:03Z",
  "models": {"orchestrator": {}, "executor": {}, "reviewer_a": {},
             "reviewer_b": {}, "tester": {}},
  "sessions": {"executor": "sid-1", "reviewer_a": null},
  "confirmations": {"review_a": {"rev": "a1b2c3d", "status": "CLEAN"},
                    "review_b": {"rev": "a1b2c3d", "status": "FINDINGS"},
                    "e2e":      {"rev": null, "status": "NONE"}},
  "expectations": [{"session": "reviewer_b", "expect": "FINDINGS",
                    "deadline": "2026-07-24T18:40Z"}],
  "counters": {"review_round": 2, "e2e_round": 0},
  "paused": null,
  "flags": {"reuse_scan": true, "handoff_file": false}
}
```

### 3.5. Якоря и трассировка

- Форматы: `§B-<DOMAIN>-NN`, `§A-<TOPIC>-NN`, `§E2E-<DOMAIN>-NN`; regex `§[ABE]-[A-Z0-9]+-\d+`; planned-записи помечаются суффиксом `(planned)` в заголовке якоря.
- Правило «один уровень вверх»: module docstring обязан содержать ≥1 `§A`-ссылку; symbol docstring обязан содержать purpose, а связь с модулем даётся самим вложением (контейнмент = механическая ссылка); явный якорь в символе обязателен, только если символ реализует иной `§A`, чем его модуль, или прямую `§B` при необходимости. Это удовлетворяет минимальной трассировке без docstring-шума и соответствует scratchpad (уровень 4 ссылается на уровень 3 либо §A).
- `metao-anchor-lint`: уникальность якорей, разрешимость ссылок, отсутствие сирот, cap длины одной записи (~40 строк default — механическая аппроксимация правила пропорциональности), режим `--no-planned` для KNOWLEDGE_SYNC.

### 3.6. Purpose-lint (Python, нативный PEP-257; без единого XML и обязательного `@purpose`)

Purpose = summary line docstring; стиль (Google/NumPy/reST) конфигурируется. Правила: P001 — module docstring отсутствует; P002 — нет `§A`-ссылки и нет задекларированного waiver (`metao: no-arch-link`; waiver'ы считаются и показываются ревьюерам); P003/P004 — symbol docstring отсутствует (public/private, включая dunder — одна строка достаточна); P005 — dangling ref; P006 — style mismatch. Формализованные исключения (только объективно синтетический код): `[tool.metao] generated_paths`, маркеры generated-заголовков (`@generated`, `DO NOT EDIT`), re-export-only `__init__.py` (объективный критерий: только import + `__all__`; purpose-строка всё равно нужна, `§A`-ссылка — нет).

### 3.7. QC-интерфейс и Python-стек

`metao-qc run [--staged] [--report text|json]` → exit 0/1 + отчёт; сабкоманды `metao-purpose-lint`, `metao-anchor-lint`, `metao-size-lint`, `metao-verify-state`. Конфиг — `[tool.metao]` в `pyproject.toml`; числовые лимиты — в нативных конфигах инструментов.

Python-стек (concrete): ruff (вкл. C901 cyclomatic, PLR09xx), mypy (по конфигу проекта), `metao-size-lint` (файл/класс/функция; стартовые defaults 500/300/60 строк), `metao-purpose-lint`, `flake8-cognitive-complexity` (CCR001 ≤15), `import-linter` (contracts: `layers`, `independence`, `forbidden` — циклы и границы модулей), pytest/build проекта. Концентрацию новой логики в одном месте механика покрывает частично (per-file/per-function лимиты); остаток — архитектурный фокус ревьюеров, это честно фиксируется в спеке.

Будущие адаптеры: PHP → PHPStan/Psalm + PHPMD + **deptrac** + PHPDoc-purpose-lint; JS/TS → eslint (`complexity`, `max-lines`, `max-lines-per-function`) + **dependency-cruiser** + TSDoc-purpose-lint.

### 3.8. Остальные контракты

- **`~/.metao/models.yaml`:** пять ролей → `{cli, model, effort?}` + per-model пороги контекста/rewarm; валидация `vendor(reviewer_b) != vendor(executor)`.
- **decision log** (`.metao/<feature>/decision-log.md`): `## D-NN — date` / Question / Answer / Rationale / Escalated: yes|no / Anchors: §… При KNOWLEDGE_SYNC устойчивое переносится в §A/§B/docstrings, файл удаляется вместе с runtime-каталогом.
- **`verification.md`:** `| §E2E-ORDER-03 | <сценарий> | §B-ORDER-01 | 2026-07-24 | a1b2c3d | PASS |` + колонка `path` к исполняемому сценарию. Обновляет тестировщик; сырые логи и скриншоты не архивируются.
- **Watchdog `~/.metao/watchdog.yaml`:** `projects[]`, `poll_interval: 60s`, `quota_margin: 5m`, `stall_timeout` per phase, `notify: osascript|file|webhook`, `classifier: {mode: off|ollama, model, endpoint}`. Интерфейс классификатора: вход — tail сессии; выход — строго один лейбл из `{QUESTION, TRANSIENT_ERROR, QUOTA(reset_at?), DEAD, UNKNOWN}`; действие всегда вычисляет детерминированный слой; модель никогда не пишет в сессии свободный текст.

### 3.9. Failure/recovery semantics (сводка)

| Сбой | Детекция | Действие |
|---|---|---|
| Временная ошибка провайдера | adapter status / regex известных текстов | `RETRY_WAIT`: backoff 1m→5m→15m→cap 30m; перед повтором — чтение tail (идемпотентность); устойчивость → эскалация |
| Исчерпание квоты | regex + извлечение reset_at | `PAUSED_QUOTA`; watchdog будит после reset + margin; судьба сессий по правилу кэша (4.13) |
| Внешняя блокировка (VPN, API, креды) | классификация оркестратором по доказательствам исполнителя | `PAUSED_EXTERNAL` + эскалация с конкретным требуемым действием; перед долгим ожиданием — фиксация состояния/компакция по правилу 4.13 |
| Смерть ролевой сессии | `session_status = DEAD` | Респавн: спека + progress file + decision log; сессии расходуемы |
| Смерть/компакция оркестратора | watchdog: stall, DEAD | Респавн оркестратора: skill + `feature-state.json` восстанавливают процесс полностью |
| Потерянное событие | expectation timeout | Poll → nudge (no-op-safe) → повтор → эскалация |
| Спека нереализуема | `BLOCKED_SPEC` + независимая оценка | Останов, эскалация; спека не изменяется |

## 4. Ключевые трейдоффы и обязательная критика исходных решений

### 4.1. Stateless-оркестратор vs контекстный

Выбрано: состояние на диске, в контексте — только skill + текущий снимок. Цена: дисциплина записи state file после каждого перехода (контролируется watchdog через `phase_entered_at`/stall). Выигрыш: компакция и смерть оркестратора перестают быть потерей гарантий — прямой риск из my-opinion. Отвергнутая альтернатива (контекстный оркестратор с запретом компакции) хрупка и не восстанавливается после перезагрузки.

### 4.2. Гипотеза TODO-проекции спеки в слои знаний — вердикт: принять в ограниченной форме

Решающий аргумент «за»: ссылки кода на §A требуют, чтобы якоря существовали с первого дня реализации, иначе линтер ссылок неработоспособен до конца фичи. Поэтому в начале фичи исполнитель (в рамках своего планирования) создаёт компактные planned-записи (заголовок + 1–3 строки + ссылка на параграф спеки — не копии спеки) в `business.md`/`architecture/*`. Ограничения: (1) конверсия planned→factual — часть done-критериев исполнителя, вместе с реализацией; (2) `metao-anchor-lint --no-planned` — блокирующий шаг KNOWLEDGE_SYNC; (3) ревьюеры проверяют, что factual-знание не пересказывает planned-загадку; (4) при ABORTED planned-записи удаляются задокументированным recovery-шагом. Отвергнутая альтернатива: planned-якоря только в runtime-файлах, код временно ссылается на ID требований спеки, конверсия в §A/§B в конце — двухфазный rewrite ссылок и сломанная промежуточная проверяемость; цена выше, чем риск забытых planned-записей, закрытый линтером.

### 4.3. Размещение проверок: QC vs pre-commit vs pre-push

Выбрано: **обязателен только QC** (явный `metao-qc`, полный repo-scope, evidence-grade вывод для ревьюеров). Pre-commit — опциональный быстрый поднабор (staged-only lint/format, **без** purpose/anchor-проверок: им нужен repo-контекст ссылок, staged-scope его ломает). Pre-push — опциональный полный дубликат (но workflow может никогда не пушить — push по отдельной просьбе). CI дублирует QC, если есть; методология полноценно работает без CI. Причина выбора: агент коммитит часто, блокирующий полный pre-commit дублировал бы QC и тормозил цикл, а pre-commit полезен в первую очередь для человеческих «внешних» быстрых правок в обход оркестратора.

### 4.4. Watchdog: скрипт vs локальная модель vs гибрид — выбран гибрид с deterministic-only дефолтом

| Вариант | Плюсы | Отказ |
|---|---|---|
| Детерминированный скрипт | Дёшево, предсказуемо, не зависит от квоты | Хрупок к новым текстам ошибок провайдеров |
| Локальная модель | Понимает нестандартные состояния | Вероятностный агент, за которым самим нужно следить; может зависнуть или выдать неверный переход |
| Гибрид | Детерминизм для известных ~95% состояний; модель — только классификатор хвоста | Сложнее установка при включённом classifier |

Ключевая граница безопасности гибрида: модель выдаёт лейбл из фиксированного множества, действие всегда вычисляет детерминированный слой, при неуверенности — консервативное действие (уведомить человека). Ошибка модели ограничена мисклассификацией, а не произвольными командами. Multi-project: один демон над реестром проектов. «Кто следит за watchdog»: launchd/systemd KeepAlive + heartbeat-файл + append-only `watchdog.log`. Watchdog входит в спеку как полностью спроектированная, но **выключенная по умолчанию** опция.

### 4.5. Критика: первый E2E только после чистого cross-review (решение автора, не hard constraint)

Слабость: если окружение сломано (миграции, docker, порты), полный двухвендорный review-цикл пройдёт впустую — первый же E2E упадёт на «не поднимается». Отказ: потерянный дорогой review-раунд + инвалидация подтверждений. Улучшение в рамках ограничений: **smoke pre-flight** тестировщика перед первым review (сборка + boot + health-check, минуты; это не «тяжёлое E2E», ограничение не нарушается). Альтернатива вне ограничений: полный E2E параллельно с первым review — отвергнута, дублирует работу на заведомо сыром коде. Цена smoke: один более ранний spawn тестировщика.

### 4.6. Критика: поиск готовых библиотек внутри workflow (решение отложено автором)

Позиция: **лёгкий time-boxed reuse-scan** (≤1 час агентного времени) как стартовая опция оркестратора, включена по умолчанию, если спека не фиксирует библиотеки; результат — записи в decision log; выбор, меняющий бизнес-смысл, эскалируется. Глубокая оценка библиотек рекомендуется к переносу в фазу создания спеки (вне методологии) — иначе исследование дублируется или, хуже, исполнитель пишет велосипед до того, как кто-либо посмотрел рынок. Ревьюеры проверяют, что находки не проигнорированы (требование автора).

### 4.7. Критика: «агент сам обновляет бизнес-слой, человек читает diff потом» (решение автора, не constraint)

Слабость: `business.md` — верхняя точка истины; неверно понятая спека → неверная §B → следующие фичи строятся на ней (усиление дрейфа, механизм №1 из sdd-issues). Митигация в рамках решения: (1) completion report выделяет diff `business.md` отдельной секцией; (2) ревьюеры семантически проверяют §B против спеки; (3) недельный аудит имеет чек-лист §B; (4) cap длины записи в `anchor-lint` против раздувания. Альтернатива, нарушающая решение: изменения бизнес-слоя — отдельный асинхронный human-approved PR после фичи. Цена: возвращается человеческий gate и риск backlog несинхронизированной истины; выгода: защита верхнего слоя. Оставляю решение автора с митигациями; альтернативу фиксирую для пересмотра после первых инцидентов дрейфа.

### 4.8. Критика: показ модельного набора «при каждом старте или продолжении» (пробел в формулировке constraint)

Противоречие: автоматическое продолжение ночью после квоты, требующее подтверждения набора, остановило бы процесс до утра. Трактовка: подтверждение обязательно при **старте фичи** и при **инициированном пользователем** продолжении; **автоматическое** возобновление (watchdog, quota reset) использует сохранённый набор молча — это тот же набор, который пользователь уже подтвердил. Считаю это уточнением, а не нарушением.

### 4.9. Критика: «быстрый фикс в обход оркестратора — внешний процесс» (осознанное решение автора)

Слабость: внешние правки обходят knowledge sync и purpose-дисциплину — дрейф входит через боковую дверь, а методология делает вид, что её нет. Митигация без новых режимов: QC + `purpose-lint` + `anchor-lint` — repo-level и срабатывают на любую правку (pre-commit/pre-push/CI при наличии), недельный аудит ловит знаниевый дрейф. Цена: внешние фиксы не получают cross-review — это осознанно принятый автором риск, фиксируется явно в master-spec.

### 4.10. Критика: отсутствие review-findings ledger (constraint)

В рамках ограничения: findings исчезают после закрытия; рефлексия в конце фичи извлекает **классы** находок (не содержание) в lessons-learned → `docs/todo.md` или фичу методологии. Совместимое усиление (опционально): анонимный счётчик находок по категориям rubric в knowledge layer — числа не создают дрейфа и дают тренды для аудита. Альтернатива вне ограничения: полный ledger с retention — отвергнута, это именно тот artifact bloat, против которого sdd-issues.

### 4.11. Критика: retirement спеки удалением (constraint)

В рамках ограничения: tracked-спека удаляется completion-коммитом (история в Git); completion-чеклист обязывает исполнителя и ревьюеров подтвердить, что каждое требование спеки имеет либо knowledge-якорь, либо явную пометку «нет устойчивого знания». Улучшение: для untracked-спек оркестратор предлагает переместить файл в `~/.metao/spec-archive/` — вне repo, недоступно агентному поиску (предупреждение sdd-issues: `archive/` внутри repo агент всё равно читает). Цена: ещё одно внешнее место; выгода: человек сохраняет доступ к исходным приёмочным критериям без загрязнения поискового контура агентов.

### 4.12. Критика: два ревьюера, один — тот же вендор (constraint)

В рамках ограничения: асимметричный rubric (3.3) — same-vendor проверяет намерение и соответствие, cross-vendor — архитектуру и дрейф; это превращает избыточность в разнообразие проверок. Альтернатива вне ограничения: один cross-vendor ревьюер + второй только по спору — дешевле вдвое, но теряет избыточность против систематических слепых зон вендора; не рекомендуется при принципе «нельзя доверять одной модели».

### 4.13. Выбранная стратегия контекста исполнителя

Из трёх вариантов автора выбрано: **управляемая компакция в естественных точках + малый progress file (≤100 строк, владеет исполнитель)**. Автокомпакция может выбросить критичную связь; один progress file рискует разрастанием; управляемая компакция на границах фаз (после fix-раундов) с предкомпакционным резюме, которое оркестратор сохраняет и ре-инжектит, контролируема и дешевле полного rewarm. Экономическое правило автора сохранено и формализовано: живой кэш — продолжаем; протухший кэш и контекст < rewarm-порога (default ~100k токенов, в `models.yaml` per model) — прогреваем; больше — свежая сессия со спекой + progress file + decision log. Порог — калибруемая стартовая точка, не закон.

## 5. Риски и митигации

| Риск | Отказ | Митигация |
|---|---|---|
| Оркестратор втягивается в код | Раздутие контекста, деградация управления | Жёсткое правило skill: только read-only git plumbing; исследования делегируются; ревьюер собирает «за/против» по спорным вопросам |
| Gaming: исполнитель декларирует QC pass | Ложная готовность | QC-артефакт с exit code; ревьюеры сами перезапускают `metao-qc` (детерминированно, дёшево) |
| Бесконечный review loop | Стоимость, стагнация | TASTE не блокирует; двойной спор → решение оркестратора; `max_review_rounds` → эскалация; явный ответ в коде на отклонённые замечания |
| Дрейф `business.md` | Неверная верхняя истина | См. 4.7: выделенный diff, семантическая проверка ревьюерами, аудит |
| Потерянное событие backend | Ночная стагнация | Expectation+timeout+poll протокол; watchdog как вторая сеть |
| Двойная отправка «продолжай» | Дублирующие действия | Перед повтором — чтение tail и проверка активности; no-op-safe формулировки wake-сообщений |
| Purpose-бойлерплейт | Шум, дрейф docstring | Одна строка достаточна; линтер проверяет наличие/ссылку, ревьюеры — адекватность и дрейф; waiver-счётчик |
| E2E-флакинес инвалидирует контур | Ложные циклы | Тестировщик классифицирует `flake|defect` с repro; flake → запись в `docs/todo.md`, а не фикс-код |
| Конфликт номеров якорей в команде | Дубликаты §B/§A после merge | Доменная нумерация; `anchor-lint` ловит дубликаты в QC/CI |
| Skill version skew | Несовместимость скриптов | Версии не пинятся (constraint); реальная несовместимость эскалируется агентом — задокументированный путь |
| Взрыв стоимости при rewarm | Лимиты | Правила 4.13; фиксация состояния перед долгим ожиданием при простое > cache TTL |
| Контекст оркестратора всё же раздут | Некачественные решения | Компактные статусы; decision log хранит детали; watchdog видит stall через `phase_entered_at`; spot-check человеком |

## 6. Открытые вопросы и допущения

**Допущения (консервативные, implementation-ready):** Node и `rg` доступны на машинах команды; референс-стек — Python; одна оркестратор-сессия ведёт одну фичу (параллельные фичи = параллельные оркестраторы, координация через обычный Git/PR без claims и блокировок); спека — свободный Markdown по пути/ссылке, оркестратор её не парсит; capabilities Herdr/Omnigent не верифицированы — adapter декларирует их, методология деградирует к polling при отсутствии capability; watchdog ставится как launchd/systemd-user сервис; brownfield bootstrap — без массовой ретро-документации: §B/§A создаются только для областей, затрагиваемых фичами.

**Открытые вопросы:** точная механика кэша/лимитов Codex (нужно исследование; пороги вынесены в `models.yaml`); верификация capability matrix Herdr vs Omnigent на macOS/Linux (критерий выбора backend — покрытие примитивов 3.1); значения по умолчанию лимитов размера/сложности — стартовые, калибруются на первых фичах; мобильный интерфейс и инструмент еженедельного архитектурного аудита — осознанно вне scope; окончательное место reuse-scan (time-boxed внутри workflow vs фаза создания спеки) — рекомендуется пересмотреть после 2–3 фич.

