# AI-driven development workflow — финальная спецификация

## Статус и назначение

Документ нормативно описывает единый обязательный AI-driven workflow разработки для greenfield и brownfield проектов.

Feature-spec создаётся вне методологии и передаётся ей как immutable input. Workflow:

- работает локально без обязательного CI;
- использует обычный Git/PR процесс;
- не создаёт собственный session runtime поверх Herdr/Omnigent;
- проверяет одну точную Git-ревизию;
- изолирует каждый gate в fresh checkout;
- не допускает tracked-изменений после attestation;
- безопасно восстанавливается либо останавливается при неоднозначном backend side effect;
- не допускает двух одновременно мутирующих runs одного проекта.

Нормативные слова «обязан», «запрещено» и «требует» обозначают hard requirements.

Python best-practice profile является обязательной исходной рекомендацией при создании project-owned QC, но инструменты и пороги адаптируются к проекту и версионируются в нём.

Консервативные implementation assumptions:

- проект находится в non-bare Git repository;
- основной поддерживаемый host — локальный macOS/Linux filesystem;
- `git`, `make` и project toolchain доступны локально;
- repository object format определяется через `git rev-parse --show-object-format`;
- atomic rename поддерживается filesystem `~/.meta-o`;
- lock lease используется только на одном host; shared/NFS state запрещён;
- backend допускается только после executable capability suite;
- отсутствие доказанной capability означает `unsupported`;
- как минимум один backend обязан пройти completion-critical suite до объявления первой реализации готовой.

## 1. Системная формула

```text
immutable feature spec
  → acquire project run ownership
  → optional reuse scan
  → executor implementation + knowledge sync + local commits
  → construct immutable candidate commit R
  → bind E2E verification plan digest P into R
  → authoritative local QC on isolated checkout of R
  → smoke on isolated checkout of R
  → stabilize two independent reviews on (R, P)
  → stabilize selected E2E scenarios on (R, P)
  → re-attest invalidated gates after each new candidate
  → stop all worker sessions
  → write compact verification receipt
  → mirror receipt into an annotated Git tag pointing to R
  → clean temporary run state
  → complete
```

Completion требует:

```text
QC(R, P) PASS
Smoke(R, P) PASS
Reviewer A(R, P) PASS
Reviewer B(R, P) PASS
E2E(R, P) PASS
```

Где:

- `R` — полный Git commit object ID;
- `P` — digest canonical verification plan;
- `P` связан с commit message `R`;
- весь tracked tree `R`, включая `docs/architecture/e2e.json`, участвует в identity;
- post-attestation tracked commit запрещён;
- rebase, squash, amend или изменение commit metadata создаёт новую ревизию и инвалидирует все gates.

Постоянная истина проекта:

```text
business (§B) → architecture (§A) → module (§M) → symbol
```

Временная истина feature:

```text
immutable spec blob
+ run state
+ compact decision log
+ open findings
+ verification plan
+ temporary evidence
+ live backend sessions
```

После завершения временная истина удаляется. Review findings, raw logs, reasoning и feature-spec bytes не архивируются.

Verification receipt является компактным доказательством завершённой проверки, а не runtime state.

## 2. Поставка

Нужны master-spec и пять implementation-ready подспек:

1. `00-master-workflow.md` — lifecycle, FSM, locking, exact revision, completion и cleanup.
2. `10-knowledge-layer.md` — business-, architecture- и code-level context.
3. `20-orchestration-and-skills.md` — роли, structured envelopes, state, effect journal и adapters.
4. `30-review-e2e.md` — rubric, disputes, verification plan, E2E и receipt.
5. `40-local-qc-python.md` — Python gates, graph checks, configuration и ratchet.
6. `50-watchdog.md` — optional multi-project watchdog.

Review loop остаётся самостоятельным вызываемым skill, но его нормативный контракт живёт в `30-review-e2e.md`.

## 3. Роли

| Роль | Ответственность | Запрет |
|---|---|---|
| Orchestrator | FSM, mechanical validation, delivery, recovery, решения и эскалации | Не изучает код и не проводит review |
| Executor | Scope, код, тесты, knowledge sync, plan proposal и commits | Не меняет spec и не уменьшает scope |
| Reviewer A | Независимый review; тот же vendor/family, что executor | Не видит reasoning executor |
| Reviewer B | Независимый cross-vendor review | Не видит findings Reviewer A |
| E2E tester | Проверяет behavior exact revision | Не меняет tracked files |

Эфемерные роли:

- reuse researcher — только при включённой пользователем опции;
- technical adjudicator — fresh session подтверждённой reviewer model при техническом споре.

```ts
interface ModelSet {
  executor: ModelRef;
  reviewerPrimary: ModelRef;
  reviewerCrossVendor: ModelRef;
  e2eTester: ModelRef;
}
```

Инварианты:

```text
reviewerPrimary.vendor == executor.vendor
reviewerPrimary.family == executor.family
reviewerCrossVendor.vendor != executor.vendor
```

При пользовательском `start` и явном пользовательском `resume` сохранённый set требует подтверждения.

Process recovery, quota wake и session replacement внутри уже подтверждённого run повторного подтверждения не требуют.

Project model set хранится в:

```text
~/.meta-o/projects/<project-key>/settings.json
```

## 4. Immutable feature spec

```ts
interface FeatureSpecRef {
  locator: string;
  kind: "tracked" | "local" | "url";
  sha256: string;
  disposition: "delete_after_sync" | "external";
}
```

Оркестратор проверяет только доступность и digest. Он не оценивает полноту или качество spec.

Во время preflight байты копируются в:

```text
~/.meta-o/projects/<project-key>/runs/<run-id>/input/spec-<sha256>.md
```

Blob:

- записывается до worker sessions;
- повторно хешируется;
- создаётся с mode `0400`;
- никогда не обновляется in place;
- передаётся workers как acceptance oracle.

Изменение locator не меняет oracle. До intentional retirement расхождение digest означает `SPEC_MUTATED`.

После включения удаления tracked-spec в candidate отсутствие исходного tracked locator является ожидаемым.

Новые bytes требуют нового run.

## 5. Project identity и storage

```text
~/.meta-o/
  config.json
  watchdog.json
  projects/
    <project-key>/
      project.json
      settings.json
      active-run.json
      project-owner.lock/
      attestations/
        <commit-oid>--<run-id>.json
      runs/
        <run-id>/
          state.json
          owner.lock/
          input/
          plans/
          findings/
          evidence/
          worktrees/
          optional-handoff.md
```

```text
canonical = realpath(git_project_root)
readable  = sanitize(canonical)
readable  = UTF-8-safe truncate до 180 bytes
project-key = <readable>--<sha256(canonical)[0:12]>
```

```ts
interface ProjectMetadata {
  schemaVersion: 1;
  canonicalPath: string;
  projectKey: string;
  createdAt: string;
}
```

При mismatch canonical path run блокируется как corrupt/collision state.

Требования:

- directories — `0700`;
- state/settings/plans/findings/receipts — `0600`;
- spec blob — `0400`;
- symlink traversal запрещён;
- все referenced paths обязаны быть relative и оставаться внутри run directory;
- неизвестная schema version блокирует чтение;
- state и receipt после записи перечитываются и валидируются.

State на shared filesystem запрещён. Перенос проекта выполняется только migration helper.

## 6. Project ownership и lock fencing

### 6.1. Один mutating run

Одновременно разрешён ровно один незавершённый mutating run на `project-key`.

`active-run.json` содержит:

```ts
interface ActiveRunMarker {
  schemaVersion: 1;
  projectKey: string;
  runId: string;
  baseRevision: string;
  createdAt: string;
}
```

Marker создаётся atomic create-if-absent до executor worktree.

Другой run блокируется, пока текущий:

- не завершён;
- не отменён;
- не очищен recovery procedure.

Paused run сохраняет ownership.

Это предотвращает параллельные изменения общего knowledge layer, QC baseline и E2E registry на расходящихся branches.

### 6.2. Lease lock

`owner.lock/` и `project-owner.lock/` являются lock directories, создаваемыми atomic `mkdir`.

```ts
interface LockLease {
  schemaVersion: 1;
  ownerToken: string;
  projectKey: string;
  runId: string;
  pid: number;
  hostId: string;
  processStartToken: string;
  orchestratorGeneration: number;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}
```

Defaults:

```text
heartbeat interval: 5 seconds
lease duration: 30 seconds
takeover quarantine: 30 seconds
```

Перед takeover helper обязан доказать одновременно:

- lease истёк;
- quarantine истёк;
- host совпадает;
- PID/process-start identity больше не существует.

Если смерть owner доказать нельзя, takeover запрещён и run переходит в `PAUSED_EXTERNAL`.

Takeover:

1. атомарно переименовывает stale lock directory в quarantine name;
2. создаёт новый lock directory;
3. увеличивает `orchestratorGeneration`;
4. reconciles state/backend;
5. удаляет quarantine только после успешного takeover.

Перед каждой state replacement и каждым side effect helper повторно проверяет `ownerToken` и generation.

Процесс, потерявший lease, не может:

- записывать state;
- отправлять backend commands;
- принимать results;
- менять project marker.

## 7. Git isolation и exact revision

### 7.1. Base и branch

На preflight фиксируются:

```ts
interface GitIdentity {
  objectFormat: "sha1" | "sha256";
  baseCommitOid: string;
  baseTreeOid: string;
}
```

Uncommitted пользовательские изменения не включаются.

Executor работает в:

```text
runs/<run-id>/worktrees/executor/
```

с ref:

```text
refs/heads/meta-o/<run-id>
```

Основной пользовательский checkout не переключается и не изменяется.

Branch создаётся от `baseRevision`. Candidate обязан быть descendant base и иметь linear history:

```text
git merge-base --is-ancestor <base> <candidate> == success
git rev-list --merges <base>..<candidate> == empty
```

Merge commits внутри run запрещены.

После completion candidate branch сохраняется для последующего push/PR. Удаляется только по явному пользовательскому действию.

### 7.2. Candidate construction

Executor:

1. завершает implementation, tests, knowledge sync и spec retirement;
2. формирует staged tree;
3. вычисляет exact changed-path manifest от base tree;
4. формирует verification plan;
5. canonicalizes plan;
6. вычисляет `planDigest`;
7. создаёт либо amends candidate commit с обязательными trailers;
8. возвращает commit OID;
9. не изменяет candidate ref во время gates.

Trailers обязаны встречаться ровно один раз:

```text
Meta-O-Run-ID: <run-id>
Meta-O-Spec-SHA256: <lowercase-sha256>
Meta-O-E2E-Plan-SHA256: <lowercase-sha256>
```

Parsing выполняется через Git trailer semantics. Duplicate или malformed trailer блокирует candidate.

```ts
interface CandidateRevision {
  objectFormat: "sha1" | "sha256";
  commitOid: string;
  treeOid: string;
  snapshotDigest: string;
  sourceMaterializationDigest: string;
  planDigest: string;
  planRef: string;
  candidateRef: string;
  createdAt: string;
}
```

`snapshotDigest`:

```text
sha256(
  sorted raw entries:
  path NUL mode NUL object-type NUL object-oid NUL
)
```

Включаются все tracked entries без исключений.

Attestation identity — `commitOid`. Остальные digests являются guards и не дают права переиспользовать attestation после commit rewrite.

### 7.3. Submodules и LFS

Gitlink OID входит в tracked digest, но gate также обязан материализовать exact submodule commit.

LFS pointer входит в Git tree, а фактический LFS object проверяется по pointer OID.

`sourceMaterializationDigest` включает:

- root tree OID;
- recursive submodule commit/tree OIDs;
- LFS object SHA-256;
- declared generated source inputs, если generated source создаётся до gate.

Missing submodule/LFS object означает `PAUSED_MISSING_TOOLS` или `PAUSED_EXTERNAL`, но не skip.

### 7.4. Immutable checkout proof

Перед каждым gate создаётся fresh detached worktree exact candidate.

Проверки до и после gate:

1. `HEAD == commitOid`;
2. `HEAD^{tree} == treeOid`;
3. recomputed `snapshotDigest` совпадает;
4. `sourceMaterializationDigest` совпадает;
5. tracked worktree и index clean;
6. candidate ref по-прежнему указывает на `commitOid`;
7. submodules находятся на pinned commits;
8. отсутствуют reused artifacts другой revision.

Gate failed при любом drift.

Untracked outputs разрешены только в declared output roots fresh worktree.

## 8. Verification plan

```ts
interface VerificationPlan {
  schemaVersion: 2;
  selectionPolicyVersion: 1;
  runId: string;
  specSha256: string;
  baseCommitOid: string;
  baseTreeOid: string;
  candidateTreeOid: string;
  registryBlobOid: string;
  changedPaths: string[];
  changedPathManifestDigest: string;
  impactedBusinessAnchors: string[];
  impactedTags: string[];
  selectedScenarioIds: string[];
  selectionRationale: string;
}
```

Plan не содержит future candidate commit OID, поэтому circular hash отсутствует.

Normalization:

- JSON canonicalization — RFC 8785 JCS;
- strings должны быть valid Unicode;
- floating-point values запрещены;
- paths normalizes как repository-relative POSIX paths;
- `changedPaths`, anchors, tags и scenario IDs сортируются bytewise и не содержат duplicates;
- rationale сохраняется как authored UTF-8 string;
- digest вычисляется по canonical UTF-8 bytes.

```text
planDigest = sha256(JCS(plan))
```

Changed-path manifest строится без rename heuristics, external diff и textconv из raw comparison `baseTreeOid → candidateTreeOid`.

Commit OID связывает:

```text
candidate tree
+ plan digest trailer
+ spec digest trailer
+ run ID
```

Если plan отсутствует, повреждён или не совпадает с trailer, candidate invalid.

## 9. Runtime state

```ts
type Role =
  | "executor"
  | "reviewerPrimary"
  | "reviewerCrossVendor"
  | "e2eTester";

type Phase =
  | "AWAITING_MODEL_SET"
  | "PREFLIGHT"
  | "SOLUTION_SCAN"
  | "EXECUTING"
  | "PREPARE_CANDIDATE"
  | "LOCAL_QC"
  | "SMOKE_PREFLIGHT"
  | "REVIEW_STABILIZATION"
  | "E2E_STABILIZATION"
  | "REATTEST_INVALIDATED_GATE"
  | "FINALIZE_METADATA"
  | "CANCELLING"
  | "COMPLETE"
  | "PAUSED_EXTERNAL"
  | "PAUSED_QUOTA"
  | "PAUSED_MISSING_TOOLS"
  | "PAUSED_MODEL_UNAVAILABLE"
  | "PAUSED_TECHNICAL_DISPUTE"
  | "PAUSED_ORCHESTRATOR_BUDGET"
  | "PAUSED_BACKEND_UNCERTAIN"
  | "STOPPED_SPEC_IMPOSSIBLE"
  | "FAILED_BACKEND";

interface RevisionSubject {
  objectFormat: "sha1" | "sha256";
  commitOid: string;
  treeOid: string;
  snapshotDigest: string;
  sourceMaterializationDigest: string;
  specSha256: string;
  planDigest: string;
}

interface RevisionResult {
  subject: RevisionSubject;
  status: "passed" | "failed" | "invalidated";
  completedAt: string;
  resultDigest: string;
  evidenceDigest?: string;
  evidenceRef?: string;
}

interface SessionRef {
  backend: "herdr" | "omnigent";
  sessionId: string;
  role: Role;
  generation: number;
  lastReadCursor?: string;
}

interface EffectIntent {
  effectId: string;
  commandId: string;
  kind:
    | "spawn"
    | "send"
    | "resume"
    | "stop"
    | "publish_attestation_tag";
  role?: Role;
  sessionGeneration?: number;
  requestDigest: string;
  idempotencyKey: string;
  stage: "prepared" | "acknowledged";
  preparedAt: string;
  backendReceipt?: string;
}

interface RunState {
  schemaVersion: 2;
  stateChecksum: string;
  runId: string;
  projectKey: string;
  phase: Phase;
  stateVersion: number;
  orchestratorGeneration: number;
  ownerToken: string;
  spec: FeatureSpecRef;
  specBlob: string;
  baseRevision: string;
  modelSet?: ModelSet;
  sessions: Partial<Record<Role, SessionRef>>;
  sessionGeneration: Partial<Record<Role, number>>;
  candidateRevision?: CandidateRevision;
  decisions: DecisionRecord[];
  activeLoop?: {
    kind: "review" | "e2e";
    iteration: number;
  };
  confirmations: {
    qc?: RevisionResult;
    smoke?: RevisionResult;
    reviewerPrimary?: RevisionResult;
    reviewerCrossVendor?: RevisionResult;
    e2e?: RevisionResult;
  };
  openFindings?: Partial<
    Record<"reviewerPrimary" | "reviewerCrossVendor" | "e2e", FindingSetRef>
  >;
  inFlightEffect?: EffectIntent;
  paused?: PauseState;
  updatedAt: string;
}
```

`stateChecksum` — SHA-256 от JCS state без самого поля `stateChecksum`.

Checksum защищает от accidental corruption, но не от malicious local owner. Повреждённый state не реконструируется предположениями: run переходит в manual recovery path.

## 10. Atomic state protocol

Запись:

```text
validate lock token and generation
→ increment stateVersion
→ compute checksum
→ write temp
→ fsync(temp)
→ atomic rename
→ fsync(parent)
→ read, checksum and schema validate
```

Одновременно разрешён один orchestration side effect. Worker sessions после acknowledgement могут выполняться параллельно.

При recovery:

1. получить project и run lease;
2. проверить active-run marker;
3. проверить state checksum/schema;
4. reconcile `inFlightEffect`;
5. reread backend outputs от persisted cursors;
6. reconcile candidate ref/worktrees;
7. увеличить generation;
8. продолжить FSM.

Atomic write защищает от crash во время replacement. Он не претендует на защиту от disk loss; backup state runtime не создаётся.

## 11. Crash-safe side effects

Для каждого effect:

1. создать `effectId`, `commandId`, `idempotencyKey`;
2. canonicalize request envelope;
3. записать `prepared` intent;
4. fsync state;
5. выполнить effect;
6. получить acknowledgement либо proof;
7. записать applied transition и удалить intent атомарно.

Idempotency key:

```text
meta-o/<project-key>/<run-id>/<orchestrator-generation>/<effect-id>
```

Recovery классифицирует effect:

```text
APPLIED
NOT_APPLIED
UNKNOWN
```

- `APPLIED` — принять существующий receipt;
- `NOT_APPLIED` — повторить тот же request с тем же key;
- `UNKNOWN` — `PAUSED_BACKEND_UNCERTAIN`;
- blind resend запрещён.

Backend output cursor обязан быть replayable и non-destructive. Cursor записывается атомарно вместе с принятым result.

Annotated tag publication использует тот же intent principle, но reconciles через точный tag ref, target commit и receipt digest.

Bounded intent не является queue, session DB или event history.

## 12. Worker command/result envelopes

Каждое сообщение worker получает immutable command envelope:

```ts
interface WorkerCommandEnvelope {
  schemaVersion: 1;
  commandId: string;
  runId: string;
  role: Role;
  sessionGeneration: number;
  commandType:
    | "implement"
    | "fix_findings"
    | "review"
    | "execute_e2e"
    | "rebut"
    | "stop";
  subject?: RevisionSubject;
  payloadDigest: string;
  payloadRefs: string[];
}
```

Worker возвращает:

```ts
interface WorkerResultEnvelope<T> {
  schemaVersion: 1;
  commandId: string;
  runId: string;
  role: Role;
  sessionGeneration: number;
  subject?: RevisionSubject;
  resultType: string;
  payload: T;
  payloadDigest: string;
  completedAt: string;
}
```

Validation:

- все IDs должны совпасть;
- referenced files должны оставаться внутри run directory;
- payload digest проверяется;
- stale generation/result игнорируется;
- duplicate с тем же digest является idempotent;
- duplicate того же `commandId` с другим digest означает `BACKEND_PROTOCOL_VIOLATION`;
- malformed output не меняет FSM.

Допускаются максимум две parse-repair команды в той же session. После этого session заменяется один раз. Повторная ошибка приводит к `PAUSED_MODEL_UNAVAILABLE` или `FAILED_BACKEND` в зависимости от причины.

## 13. FSM

```text
AWAITING_MODEL_SET
  → PREFLIGHT
  → [SOLUTION_SCAN]
  → EXECUTING
  → PREPARE_CANDIDATE
  → LOCAL_QC
  → SMOKE_PREFLIGHT
  → REVIEW_STABILIZATION
  → E2E_STABILIZATION
  → REATTEST_INVALIDATED_GATE
  → FINALIZE_METADATA
  → COMPLETE
```

Каждый новый candidate обязан пройти:

```text
LOCAL_QC → SMOKE_PREFLIGHT
```

до продолжения текущего review или E2E loop.

### 13.1. Transition contract

| Phase | Entry | Success |
|---|---|---|
| `AWAITING_MODEL_SET` | run marker создан | immutable model set stored |
| `PREFLIGHT` | model set present | repository, spec, locks, backend, Makefile и E2E contracts valid |
| `SOLUTION_SCAN` | reuse enabled | decision recorded |
| `EXECUTING` | preflight complete | implementation/knowledge/spec retirement ready |
| `PREPARE_CANDIDATE` | final staged tree ready | plan bound into exact commit |
| `LOCAL_QC` | candidate valid | QC PASS exact `(R,P)` |
| `SMOKE_PREFLIGHT` | QC PASS | smoke PASS exact `(R,P)` |
| `REVIEW_STABILIZATION` | QC/smoke PASS | both reviewers PASS exact `(R,P)` |
| `E2E_STABILIZATION` | reviews PASS | selected E2E PASS exact `(R,P)` |
| `REATTEST_INVALIDATED_GATE` | candidate changed | correct loop selected |
| `FINALIZE_METADATA` | all five gates match | sessions stopped, receipt/tag durable |
| `CANCELLING` | explicit cancel | sessions stopped, temporary state removed |
| `COMPLETE` | receipt and tag valid | terminal |

### 13.2. Loop dispatcher

```text
on new candidate:
  invalidate every confirmation
  run QC
  run smoke
  resume active loop

if active loop == review:
  stabilize both reviewers
  if E2E missing/stale:
    switch to E2E

if active loop == e2e:
  stabilize selected E2E
  if reviews missing/stale:
    switch to review

complete only when every confirmation matches exact subject
```

### 13.3. Review fixes

1. дождаться обоих independent review results;
2. сохранить open findings;
3. executor принимает либо rebut findings;
4. исправить accepted findings одним batch;
5. sync knowledge;
6. новый candidate;
7. QC;
8. smoke;
9. повторить обоих reviewers.

Heavy E2E в review loop не выполняется.

### 13.4. E2E fixes

1. выполнить полный selected set;
2. собрать failed/blocked scenarios;
3. исправить одним batch;
4. новый candidate и plan;
5. QC;
6. smoke;
7. продолжить E2E loop;
8. после E2E PASS повторить stale reviews.

### 13.5. Stale results

Result stale, если не совпадает хотя бы одно:

- commit OID;
- tree OID;
- snapshot digest;
- materialization digest;
- spec digest;
- plan digest;
- role generation.

Stale result сохраняется только как временное diagnostic evidence и не меняет FSM.

## 14. Deadlines и retries

Default deadlines, если project contract не задаёт более строгие:

```text
adapter acknowledgement: 60 seconds
backend status reconciliation: 5 minutes
worker turn stall: 30 minutes
make qc: 30 minutes
make smoke: 5 minutes
single E2E scenario: 30 minutes
cleanup/stop reconciliation: 5 minutes
```

Project может увеличить QC/E2E timeout в tracked contract. Уменьшение не требует решения, увеличение более чем в 4 раза требует tooling decision.

Failed QC/E2E не получает automatic retry ради PASS.

Повтор без tracked change допускается только для диагностики transient/flaky behavior. Обнаруженная flakiness классифицируется как engineering risk и исправляется до completion.

Backend transport retry разрешён только когда adapter доказал `NOT_APPLIED` либо использует native idempotency key.

## 15. Решения и findings lifecycle

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
  options: DecisionOption[];
  recommendation: string;
  specImpact: "none" | "possible" | "certain";
  reversible: boolean;
}
```

Оркестратор решает только обратимые local decisions, не меняющие:

- acceptance behavior;
- `§B`;
- scope;
- residual defect;
- QC strictness.

Иначе требуется пользовательское решение.

```ts
interface FindingRecord {
  finding: Finding;
  sourceRole: "reviewerPrimary" | "reviewerCrossVendor" | "e2e";
  state:
    | "open"
    | "accepted"
    | "rebutted"
    | "adjudication_required"
    | "resolved"
    | "taste_dismissed";
  rebuttalCycles: number;
  updatedAt: string;
}
```

После двух безрезультатных rebuttal cycles finding переходит в adjudication.

Resolved и dismissed records удаляются. Между features findings не сохраняются.

`SPEC_IMPOSSIBLE` всегда останавливает run.

## 16. Knowledge layer

```text
docs/knowledge/
  business.md
  architecture/<domain>.md
  glossary.md
  adoption-manifest.json
docs/architecture/
  e2e.md
  e2e.json
docs/todo.md
```

`business.md` хранит полный business-level source of truth.

`glossary.md` обязателен.

`e2e.md` определяет:

- prerequisites;
- environment setup;
- fixtures;
- smoke;
- E2E commands;
- isolation namespace;
- external resources;
- cleanup;
- timeouts;
- revision/artifact proof;
- failure interpretation.

### 16.1. Knowledge chain

- `§B-*`: проблема, субъект, outcome, недопустимое поведение, последствия отмены.
- `§A-*`: rationale, реализуемые `§B`, invariants, boundaries, non-goals.
- `§M-*`: module purpose, `§A`, boundary и последствия удаления.
- Symbol: native docstring с purpose и `§M` link.

Минимальная ссылка идёт ровно на один уровень вверх.

Purpose обязателен для всех first-party modules, classes, functions и methods, включая private, nested, async, properties, dunders и tests.

Исключения:

- generated source с marker и declared glob;
- runtime-synthetic entity вне AST;
- overload declaration при документированной реализации;
- third-party/vendor roots.

### 16.2. Planned truth

`§B-TODO/§A-TODO` запрещены.

Временный `KnowledgeImpactPlan` живёт только в run state.

### 16.3. Sync и retirement

Knowledge sync и spec retirement входят в candidate до review.

Requirements распределяются по:

```text
§B → §A → §M → symbol
```

Post-attestation semantic writes запрещены. Любой write требует нового candidate и gates.

## 17. Mechanical knowledge checks

Проект механически проверяет:

- unique anchors;
- `§A → §B`;
- `§M → §A`;
- symbol → `§M`;
- dangling references;
- direct code → `§B` without architecture;
- purpose coverage;
- adoption boundaries;
- `e2e.json` schema;
- scenario IDs и refs;
- business links;
- absence of feature archives.

Reviewers проверяют semantic adequacy.

## 18. Local QC

Обязательные tracked Makefile targets:

```text
make qc
make smoke
```

`make qc`:

- full-repository;
- non-mutating для tracked files;
- exit `0` только при полном PASS;
- missing mandatory tool — FAIL;
- silent skip запрещён.

`make smoke`:

- non-mutating;
- проверяет minimal build/import/boot/health behavior;
- обязателен даже для library проекта;
- для library может быть import/package/API initialization smoke.

Preflight проверяет target resolution через dry-run. Реальная достаточность команд проверяется QC и review, а не оркестратором.

Рекомендуемые targets:

```text
make format
make lint
make typecheck
make test
make build
make smoke
make e2e
make qc
```

### 18.1. Python profile

```text
Ruff format --check + lint
mypy или pyright
pytest + integration tests
Import Linter
AST purpose/anchor checks
knowledge/E2E schema checks
size/nesting/complexity ratchet
full import graph
build/package check
dependency lock validation
```

```toml
[tool.meta_o.code_health]
source_roots = ["src", "tests"]
max_file_lines = 600
max_class_lines = 300
max_function_lines = 60
max_cyclomatic_complexity = 10
max_nesting_depth = 4
baseline = ".quality/code-health-baseline.json"
forbid_new_baseline_entries = true
forbid_regressions = true
```

Graph gate:

- every module belongs to a boundary;
- unknown module blocks QC;
- new SCC/cycles forbidden;
- new lateral edge checked against baseline;
- fan-in/fan-out ratcheted.

Ослабление QC относительно base требует пользовательского решения.

## 19. Review contract

Reviewer получает:

- immutable spec blob;
- exact commit and isolated checkout;
- fixed base;
- complete diff;
- knowledge layer;
- canonical plan;
- matching trailers;
- QC/smoke results;
- relevant approved decisions.

Не получает:

- executor reasoning;
- findings другого reviewer;
- implementation narrative.

Rubric:

1. spec/business intent;
2. correctness/security/concurrency;
3. architecture/coupling/complexity;
4. tests/observability/false-success;
5. purpose/knowledge drift;
6. E2E selection completeness;
7. dependency/environment reproducibility;
8. maintainability.

```ts
interface Finding {
  findingId: string;
  severity: "blocker" | "major" | "minor" | "suggestion";
  classification: "defect" | "engineering_risk" | "taste";
  evidence: Evidence[];
  basis: {
    type: "spec" | "business" | "architecture" | "engineering";
    reference: string;
  };
  impact: string;
  recommendedFix: {
    approach: string;
    rationale: string;
    alternatives?: string[];
  };
}

interface ReviewResult {
  reviewer: "reviewerPrimary" | "reviewerCrossVendor";
  subject: RevisionSubject;
  verdict: "passed" | "changes_requested";
  findings: Finding[];
  completedAt: string;
}
```

`passed` допустим только без defect/engineering-risk findings.

Если один reviewer завершился раньше, executor не начинает fixes до результата второго либо terminal timeout. Это сохраняет независимость и batch semantics.

## 20. E2E registry

```json
{
  "schema_version": 3,
  "selection_policy_version": 1,
  "scenarios": [
    {
      "scenario_id": "E2E-CHECKOUT-01",
      "scenario_ref": "docs/architecture/e2e.md#e2e-checkout-01",
      "business_links": ["§B-CHECKOUT-01"],
      "always_required": false,
      "tags": ["checkout"]
    }
  ]
}
```

Rules:

- scenario IDs уникальны и соответствуют `[A-Z][A-Z0-9-]{2,63}`;
- tags lowercase и соответствуют `[a-z0-9][a-z0-9._-]{0,63}`;
- arrays уникальны и bytewise sorted;
- `scenario_ref` обязан указывать на существующий anchor;
- каждый business link существует;
- registry входит в candidate tree целиком;
- dynamic result fields запрещены.

Выбираются:

1. все `always_required`;
2. scenarios затронутых `§B`;
3. scenarios затронутых tags;
4. scenarios изменённых boundaries/failure modes.

Пустой selected set запрещён.

Reviewers проверяют selection до heavy E2E.

## 21. E2E environment и result

```ts
interface E2EResult {
  subject: RevisionSubject;
  selectedScenarioIds: string[];
  selectionRationale: string;
  revisionProof: {
    commitOid: string;
    treeOid: string;
    sourceMaterializationDigest: string;
    artifactDigests: string[];
    environmentFingerprint: string;
    isolationNamespace: string;
  };
  scenarios: E2EScenarioResult[];
  completedAt: string;
}
```

Environment namespace:

```text
meta-o-<project-hash>-<run-id>-<commit-prefix>-<attempt>
```

Shared resource, который нельзя namespace-isolate, требует exclusive environment lock.

Environment fingerprint включает применимые:

- OS/runtime versions;
- container image digests;
- dependency lock digests;
- database/schema version;
- external endpoint class без credentials;
- fixture version;
- locale/timezone.

Unpinned external dependency, влияющая на acceptance behavior, означает `blocked`, если её version/artifact digest нельзя записать.

PASS требует:

- selected IDs exact match plan;
- каждый scenario `passed`;
- revision proof valid;
- cleanup завершён;
- tracked tree unchanged;
- stale artifacts отсутствуют.

## 22. Completion receipt и Git tag

### 22.1. Receipt

```text
~/.meta-o/projects/<project-key>/attestations/
  <commit-oid>--<run-id>.json
```

```json
{
  "schema_version": 2,
  "project_key": "<project-key>",
  "run_id": "<run-id>",
  "spec_sha256": "<spec-digest>",
  "base_revision": "<base-oid>",
  "candidate": {
    "object_format": "sha1",
    "commit_oid": "<R>",
    "tree_oid": "<tree>",
    "snapshot_digest": "<digest>",
    "source_materialization_digest": "<digest>",
    "plan_digest": "<P>",
    "candidate_ref": "refs/heads/meta-o/<run-id>"
  },
  "models": {
    "executor": "<vendor/family/model>",
    "reviewer_primary": "<vendor/family/model>",
    "reviewer_cross_vendor": "<vendor/family/model>",
    "e2e_tester": "<vendor/family/model>"
  },
  "selected_scenarios": ["E2E-CHECKOUT-01"],
  "business_links": ["§B-CHECKOUT-01"],
  "results": {
    "qc": {
      "status": "passed",
      "result_digest": "<sha256>",
      "completed_at": "<utc>"
    },
    "smoke": {
      "status": "passed",
      "result_digest": "<sha256>",
      "completed_at": "<utc>"
    },
    "reviewer_primary": {
      "status": "passed",
      "result_digest": "<sha256>",
      "completed_at": "<utc>"
    },
    "reviewer_cross_vendor": {
      "status": "passed",
      "result_digest": "<sha256>",
      "completed_at": "<utc>"
    },
    "e2e": {
      "status": "passed",
      "result_digest": "<sha256>",
      "environment_fingerprint": "<sha256>",
      "completed_at": "<utc>"
    }
  },
  "tag_ref": "refs/tags/meta-o/verified/<run-id>",
  "completed_at": "<utc>",
  "receipt_digest": "<sha256>"
}
```

`receipt_digest` вычисляется по JCS receipt без самого поля.

Receipt не содержит spec bytes, findings, reasoning, raw logs, screenshots, credentials или session transcripts.

### 22.2. Annotated tag

После atomic receipt write создаётся annotated tag:

```text
refs/tags/meta-o/verified/<run-id>
```

Tag:

- указывает exact candidate commit;
- создаётся с cleanup mode `verbatim`;
- содержит canonical receipt JSON;
- проверяется через `git cat-file tag`;
- не меняет candidate commit;
- не переключает основной checkout.

Existing tag:

- с тем же target и receipt digest считается idempotent success;
- с другим content означает `ATTESTATION_TAG_CONFLICT` и блокирует completion.

При последующем user-requested push оркестратор сообщает, что receipt tag переносится только при явном tag push или `--follow-tags`.

Tag является repository-associated mirror. External receipt остаётся recovery source.

### 22.3. Finalization order

1. проверить all five confirmations;
2. проверить candidate ref, commit, tree и plan;
3. остановить worker sessions;
4. повторно проверить candidate ref;
5. atomic write receipt;
6. publish annotated tag через effect intent;
7. validate tag target/message;
8. записать `COMPLETE`;
9. удалить detached worktrees;
10. удалить run directory;
11. удалить `active-run.json`;
12. освободить project lock.

Crash после receipt/tag восстанавливается idempotently.

Primary checkout HEAD не обязан указывать на `R`; неизменным остаётся candidate ref.

## 23. Cancellation

Explicit cancellation переводит run в `CANCELLING`.

Порядок:

1. получить project/run lock;
2. прекратить новые sends;
3. остановить known sessions;
4. удалить temporary detached worktrees;
5. сохранить `meta-o/<run-id>` branch по умолчанию;
6. удалить run state только после подтверждённой остановки sessions;
7. удалить active-run marker.

Если backend stop нельзя подтвердить, run остаётся `PAUSED_BACKEND_UNCERTAIN`; silent abandonment запрещён.

Tracked user data и candidate branch автоматически не удаляются.

## 24. Backend adapters

```ts
interface SessionAdapter {
  capabilities(): AdapterCapabilities;
  spawn(request: SpawnRequest, effect: EffectContext): SessionRef;
  send(
    session: SessionRef,
    message: string,
    effect: EffectContext
  ): DeliveryResult;
  status(session: SessionRef): SessionStatus;
  read(session: SessionRef, afterCursor?: string): SessionOutput;
  lookupEffect(effect: EffectContext): EffectStatus;
  wait(session: SessionRef, expected: ExpectedState): WaitResult;
  resume(session: SessionRef, effect: EffectContext): SessionRef;
  stop(session: SessionRef, effect: EffectContext): StopResult;
}
```

Completion-critical capabilities:

- acknowledged spawn;
- lookup/correlation after crash;
- idempotent delivery либо proof of non-delivery;
- replayable output cursor;
- non-destructive reread;
- exact working-directory targeting;
- session generation tagging;
- running/waiting/complete/failed status;
- deterministic resume/replacement;
- stop reconciliation;
- concurrent completion;
- backend restart recovery;
- exact model routing.

`unsupported` completion-critical capability блокирует backend.

Phase-0 release rule:

```text
core workflow cannot be declared operational
until at least one real backend/version passes the full suite
```

Если ни Herdr, ни Omnigent не проходят suite, реализация adapters считается заблокированной; спецификация не разрешает имитировать guarantees локальной queue.

## 25. Security и trust boundary

Model output, spec text и repository content считаются untrusted data для orchestrator helpers.

Helpers обязаны:

- передавать arguments как argv, не shell-concatenate model values;
- валидировать paths и reject `..`, absolute escape и NUL;
- не исполнять команды из model result;
- запускать только project-owned Makefile targets и explicit adapter commands;
- redaction credentials перед evidence storage;
- запрещать secrets в receipt/tag;
- проверять file owner/mode;
- не follow symlinks в external state.

Project code и tests по своей природе выполняются локально. Это действие входит в scope workflow, но доступ к irreversible external services требует отдельного decision.

Receipt является local provenance record, а не криптографической защитой от malicious local user. Signed tags deferred.

## 26. Failure taxonomy

| Code | Routing |
|---|---|
| `SPEC_MUTATED` | pause или новый run |
| `SPEC_IMPOSSIBLE` | `STOPPED_SPEC_IMPOSSIBLE` |
| `PROJECT_RUN_ACTIVE` | `PAUSED_EXTERNAL` |
| `LOCK_UNCERTAIN` | `PAUSED_EXTERNAL` |
| `STATE_CORRUPT` | manual recovery, без blind reconstruction |
| `GIT_DIRTY_INPUT` | `PAUSED_EXTERNAL` |
| `CANDIDATE_REF_DRIFT` | `PAUSED_EXTERNAL` |
| `PLAN_DIGEST_MISMATCH` | `PREPARE_CANDIDATE` |
| `REVISION_DRIFT` | gate FAIL |
| `MATERIALIZATION_MISMATCH` | gate FAIL |
| `QC_FAILED` | executor fix loop |
| `SMOKE_FAILED` | executor fix loop |
| `REVIEW_CHANGES_REQUESTED` | review fix loop |
| `E2E_FAILED` | E2E fix loop |
| `E2E_BLOCKED` | `PAUSED_EXTERNAL` |
| `BACKEND_EFFECT_UNKNOWN` | `PAUSED_BACKEND_UNCERTAIN` |
| `BACKEND_PROTOCOL_VIOLATION` | `FAILED_BACKEND` |
| `RESULT_CONFLICT` | `FAILED_BACKEND` |
| `ATTESTATION_TAG_CONFLICT` | `PAUSED_EXTERNAL` |
| `MISSING_TOOL` | `PAUSED_MISSING_TOOLS` |
| `MODEL_UNAVAILABLE` | `PAUSED_MODEL_UNAVAILABLE` |

Unknown failure не превращается в generic retry; он сохраняется как bounded diagnostic и переводит run в безопасную pause.

## 27. Context policy

Оркестратор получает только:

- structured envelopes;
- digests;
- evidence references;
- statuses;
- approved decisions.

Он не принимает полные logs, transcripts или diffs.

Fresh orchestrator восстанавливается из:

```text
state
+ locks/active marker
+ immutable spec
+ candidate Git objects/ref
+ verification plan
+ effect intent
+ backend cursors
+ optional receipt/tag
```

Telemetry thresholds `55/65/75%` сохраняются. Без telemetry используется conservative byte counter.

Worker sessions заменяются при loss или cold context. `100k` threshold остаётся empirical.

## 28. Watchdog

Watchdog:

- optional;
- multi-project;
- read-only относительно FSM;
- deterministic;
- не отправляет worker commands;
- не делает blind resend;
- может запускать orchestrator entrypoint;
- не получает owner lease за orchestrator;
- использует single-instance lock;
- запускается launchd/systemd user service.

Локальная модель допускается только как sanitized closed-enum classifier.

## 29. Adoption и debt

Greenfield создаётся strict.

Brownfield сначала выполняет adoption feature по dependency-closed roots:

```text
docs/knowledge/adoption-manifest.json
```

Feature может затрагивать только adopted closure.

Structural debt допускается frozen baseline. Purpose debt baseline запрещён.

Debt текущего scope исправляется. Внешний debt записывается в `docs/todo.md`.

## 30. Executable conformance cases

### State и locking

- `STATE-01`: crash до rename оставляет предыдущий valid state.
- `STATE-02`: crash после rename восстанавливает новый state.
- `STATE-03`: checksum mismatch блокирует transition.
- `LOCK-01`: два orchestrators не получают lease одновременно.
- `LOCK-02`: stale process после takeover не может записать state.
- `LOCK-03`: второй run одного project получает `PROJECT_RUN_ACTIVE`.

### Backend effects

- `EFFECT-01`: crash до backend call не создаёт operation.
- `EFFECT-02`: crash после spawn восстанавливает один session.
- `EFFECT-03`: crash после send не создаёт duplicate command.
- `EFFECT-04`: `UNKNOWN` никогда не resend.
- `EFFECT-05`: output reread после crash возвращает тот же result.
- `EFFECT-06`: conflicting duplicate result блокирует backend.

### Git revision

- `REV-01`: tracked change после QC инвалидирует gate.
- `REV-02`: amend с тем же tree инвалидирует gates.
- `REV-03`: changed `e2e.json` инвалидирует gates.
- `REV-04`: candidate ref drift блокирует completion.
- `REV-05`: primary checkout остаётся неизменным.
- `REV-06`: missing LFS/submodule object не даёт PASS.

### Verification plan

- `PLAN-01`: plan digest совпадает с trailer.
- `PLAN-02`: изменение selected IDs требует нового commit.
- `PLAN-03`: duplicate/malformed trailer rejected.
- `PLAN-04`: empty selected set rejected.
- `PLAN-05`: omitted always-required scenario rejected.

### Gates

- `GATE-01`: каждый gate получает fresh detached worktree.
- `GATE-02`: tracked mutation во время gate даёт FAIL.
- `GATE-03`: новый candidate всегда проходит QC и smoke.
- `GATE-04`: stale reviewer/E2E result не меняет FSM.
- `GATE-05`: flaky failure не превращается в PASS automatic retry.

### Finalization

- `FINAL-01`: receipt содержит пять matching result digests.
- `FINAL-02`: tag указывает exact candidate commit.
- `FINAL-03`: crash после receipt до tag безопасно возобновляется.
- `FINAL-04`: existing matching tag idempotent.
- `FINAL-05`: conflicting tag блокирует completion.
- `FINAL-06`: run cleanup происходит только после receipt/tag.

### Security

- `SEC-01`: path traversal в worker result rejected.
- `SEC-02`: shell metacharacters не интерпретируются helper.
- `SEC-03`: credential-like fields redacted/rejected из receipt.
- `SEC-04`: symlink state path rejected.

## 31. Rejected и deferred

Rejected:

- planned durable feature TODO projection;
- parallel mutating runs одного проекта;
- собственный session runtime/queue/session DB;
- blind resend;
- dynamic E2E status в tracked registry;
- tracked path exclusions из revision;
- post-attestation commit;
- reuse attestation после rewrite;
- empty E2E selection PASS;
- findings archive;
- Git notes как primary registry;
- local LLM, управляющая sessions;
- bundled language-specific project QC;
- automatic reuse scan;
- silent cancellation с unknown live sessions.

Deferred:

- default backend;
- exact project thresholds;
- PHP/JS profiles;
- external spec archive;
- signed verification tags;
- automatic remote receipt publication;
- перенос external receipts между machines;
- support shared/NFS state.

## 32. Главный dissent

1. **All-symbol purpose** сохраняется как hard constraint. Semantic review и dependency-closed adoption уменьшают cargo-cult risk.
2. **Автономный `§B` sync** разрешён только для already-approved spec semantics.
3. **Same-family reviewer** сохраняется вместе с cross-vendor reviewer.
4. **Spec retirement** сохраняется; blob живёт до completion.
5. **Нет собственного runtime.** Bounded effect intent и lock leases являются минимальным safety state, а не общей orchestration platform.
6. **Exact commit identity.** Потеря rebase-stable attestations принята ради однозначной revision.
7. **Annotated tag.** Он добавляет Git metadata, но не меняет tracked tree или candidate commit и даёт переносимый receipt mirror.
8. **Strict backend capability gate.** Он может временно оставить систему без usable backend, но недоказанная crash safety хуже честного implementation blocker.
9. **External evidence удаляется.** Receipt сохраняет compact result digests и scenario outcomes, но не обеспечивает полный forensic audit; это осознанный результат запрета findings/log archive.

## 33. Pre-mortem corrections

1. Exact commit, full tree и detached worktrees сохраняются.
2. Owner locking усилен generation fencing, lease takeover и project-wide active-run marker.
3. Primary checkout больше не обязан указывать на candidate; сохраняется отдельный candidate ref.
4. Smoke обязателен для каждого нового candidate.
5. Plan canonicalization закреплена RFC 8785 и normalized collections.
6. LFS/submodule materialization входит в proof.
7. Worker command/result protocol получил stable IDs, duplicate handling и parse limits.
8. Receipt теперь содержит result digests и зеркалируется annotated tag.
9. E2E environment получил namespace, fingerprint и shared-resource lock.
10. Capability suite стала release-blocking, а не бумажной рекомендацией.
11. Cancellation не удаляет branch и не забывает uncertain sessions.
12. Typed failure taxonomy запрещает generic retry неизвестных ошибок.

## 34. Decision Ledger

| ID | Decision | Status | Rationale | Source |
|---|---|---|---|---|
| D-001 | Master-spec и пять implementation-ready подспек | adopted | Единый lifecycle при разделённой реализации | user interview; synthesis |
| D-002 | Один полный workflow без quality modes | adopted | Проверки не optional | user interview |
| D-003 | Feature-spec immutable и создаётся вне workflow | adopted | Оркестратор не author | user interview |
| D-004 | SHA-256 spec blob | adopted | Стабильный oracle | gpt/r2; premortem |
| D-005 | Оркестратор не изучает код | adopted | Bounded context | user interview |
| D-006 | Четыре рабочие роли | adopted | Independent checks | user interview |
| D-007 | Model set подтверждается при user start/resume | adopted | Recovery использует fixed set | fable/r2 |
| D-008 | Sessions не переносятся между features | adopted | Исключает stale context | user interview |
| D-009 | Handoff optional, 4 KiB | adopted | Ограничивает artifact | user interview |
| D-010 | Atomic external state | adopted | Crash recovery без repo files | kimi/r1 |
| D-011 | Runtime/queue/session DB запрещены | adopted | Backend владеет sessions | user interview |
| D-012 | Capability suite обязательна | adopted | Capability rot | premortem |
| D-013 | Blind resend запрещён | adopted | Duplicate safety | council R1 |
| D-014 | Stall deadline и backend-uncertain pause | adopted | Bounded liveness | premortem |
| D-015 | Watchdog optional/multi-project | adopted | Не всем нужен | user interview |
| D-016 | Watchdog deterministic | adopted | Модель не управляет | all proposals |
| D-017 | Reuse scan explicit | adopted | Без скрытой эвристики | user interview |
| D-018 | `§B` — верхняя истина | adopted | Причина behavior | user interview |
| D-019 | `§B → §A → §M → symbol` | adopted | Causal traceability | synthesis |
| D-020 | All-symbol purpose | adopted | Hard constraint | user interview |
| D-021 | Native docstrings | adopted | Style-neutral | user interview |
| D-022 | Mechanics links, reviewers semantics | adopted | Meaning не regex | all proposals |
| D-023 | Planned knowledge TODO | rejected | Загрязняет truth | synthesis |
| D-024 | Temporary KnowledgeImpactPlan | adopted | Planning без durable future truth | gpt/r2 |
| D-025 | Knowledge/spec retirement до review | adopted | Нет semantic post-write | reviews |
| D-026 | Findings archive | rejected | Artifact bloat | user interview |
| D-027 | Temporary decision log | adopted | Stable rationale переносится | user interview |
| D-028 | Dynamic result в tracked `e2e.json` | rejected in R1 | Dual revision/self-reference | council R1 |
| D-029 | Cold archive external specs | rejected | Hidden source | user interview |
| D-030 | Compact verification provenance | adopted | Receipt без spec bytes | premortem |
| D-031 | Rebase-stable digest как identity | rejected in R1 | Нужна exact revision | council R1 |
| D-032 | Исключение `e2e.json` из digest | rejected in R1 | Selection metadata tracked | council R1 |
| D-033 | Любой tracked change инвалидирует gates | adopted | One revision | user interview |
| D-034 | Knowledge change сохраняет E2E | rejected | Ослабляет contract | premortem |
| D-035 | `make qc` authoritative | adopted | CI optional | user correction |
| D-036 | Pre-commit optional/fast | adopted | Не провоцировать bypass | fable/r2 |
| D-037 | Python QC profile | adopted | Project-owned toolchain | user correction |
| D-038 | Helpers TS → dependency-free JS | adopted | Portable bundle | user interview |
| D-039 | Bundled project QC | rejected | Принадлежит project | user correction |
| D-040 | Configurable thresholds | adopted | Нет universal values | user interview |
| D-041 | Structural ratchet, no purpose baseline | adopted | Purpose hard | gpt/r2 |
| D-042 | Full graph gate | adopted | Coupling checks | premortem |
| D-043 | Dependency-closed adoption | adopted | Incremental coverage | premortem |
| D-044 | Risk-based purpose | rejected | Нарушает constraint | dissent |
| D-045 | Fixed rubric, free analysis order | adopted | Stable review | user interview |
| D-046 | Structured finding, all defects fixed | adopted | Defect vs taste | user interview |
| D-047 | Adjudicator after two rebuttals | adopted | Technical dispute | reviewers |
| D-048 | Automatic churn limit | rejected | Continue to quality | user correction |
| D-049 | Smoke preflight | adopted, strengthened R2 | Каждый новый candidate обязан пройти smoke | kimi/r1; council R2 |
| D-050 | Heavy E2E after both reviews | adopted | Review before expensive behavior gate | user correction |
| D-051 | Full project audit out of scope | adopted | Separate tool | user interview |
| D-052 | Scope debt fixed, external debt todo | adopted | Scope control | user interview |
| D-053 | Local commits; push/PR by request | adopted | Human sharing | user interview |
| D-054 | Project не pin’ит skill version | adopted | User-managed install | user interview |
| D-055 | Herdr/Omnigent alternatives | adopted | Capability-based | user interview |
| D-056 | Default backend | deferred | Requires suite | premortem |
| D-057 | PHP/JS profiles | deferred | Python first | user interview |
| D-058 | Exact context/quality thresholds | deferred | Empirical | proposals |
| D-059 | One content revision | adopted, strengthened R1 | Exact commit OID | council R1 |
| D-060 | QC weakening needs user decision | adopted | Executor cannot weaken gate | premortem |
| D-061 | Only open findings persisted | adopted | Crash recovery without archive | premortem |
| D-062 | Requirements distributed across chain | adopted | Layered truth | user correction |
| D-063 | No tracked completion report | adopted, clarified R2 | Annotated tag is metadata, not tracked file | council R2 |
| D-064 | Runtime under `~/.meta-o/projects` | adopted | Clean repo tree | user correction |
| D-065 | Single business.md + glossary | adopted | Readable top truth | user correction |
| D-066 | Makefile QC contract | adopted | Project-owned interface | user correction |
| D-067 | External project ModelSet | adopted | Deterministic recovery | user correction |
| D-068 | `e2e.md` mandatory | adopted | Environment contract | user correction |
| D-069 | Reviewer recommends fix | adopted | Reduces turns | user correction |
| D-070 | Separate review/E2E stabilization loops | adopted | Batch and reattest | user correction |
| D-071 | Unlimited cycles | adopted | Quality terminal | user correction |
| D-072 | Exact candidate commit identity | adopted | One Git revision | council R1 |
| D-073 | Tracked static scenario registry | adopted | Included in revision | council R1 |
| D-074 | Plan digest bound to commit | adopted | Immutable selection | council R1 |
| D-075 | Fresh detached worktree per gate | adopted | Checkout proof | council R1 |
| D-076 | Bounded write-ahead EffectIntent | adopted | Crash window | council R1 |
| D-077 | Effect correlation/replay cursor critical | adopted | Deterministic recovery | council R1 |
| D-078 | Post-attestation tracked writes forbidden | adopted | No dual revision | council R1 |
| D-079 | External compact receipt | adopted, strengthened R2 | Recovery source plus Git tag mirror | council R1/R2 |
| D-080 | Receipt before cleanup | adopted | Crash-safe finalization | council R1 |
| D-081 | Project-wide single active mutating run | adopted | Prevents divergent knowledge/QC state | council R2 |
| D-082 | Lease lock с generation fencing | adopted | Prevents split-brain owner | council R2 |
| D-083 | Candidate branch separate; primary checkout untouched | adopted | Dedicated worktree semantics | council R2 |
| D-084 | RFC 8785 plan/state/receipt canonicalization | adopted | Cross-implementation digest consistency | council R2 |
| D-085 | Structured command/result envelopes | adopted | Stale/duplicate/conflict handling | council R2 |
| D-086 | Source materialization digest для LFS/submodules | adopted | Tree OID недостаточен для external objects | council R2 |
| D-087 | Smoke повторяется для каждого candidate | adopted | Не review/E2E broken revision | council R2 |
| D-088 | Annotated verification tag mirrors receipt | adopted | Portable Git-associated provenance без нового commit | council R2 |
| D-089 | E2E namespace/fingerprint/shared lock | adopted | Prevents cross-run environment contamination | council R2 |
| D-090 | Backend suite blocks operational release until one backend passes | adopted | Не заявлять unproven workflow | council R2 |
| D-091 | Typed failure taxonomy и no generic retry | adopted | Weak-model executability и safe routing | council R2 |
| D-092 | Cancellation preserves branch and requires session-stop proof | adopted | Не терять work и не забывать live agents | council R2 |

## 35. Open Questions

Не блокируют core design:

1. Какой backend/version первым пройдёт full capability suite.
2. Какие starting code-health thresholds оптимальны для конкретного проекта.
3. Какие context/cache thresholds доступны CLI.
4. Какие QC profiles нужны PHP/JS.
5. Нужен ли user-managed external spec archive.
6. Нужны ли signed verification tags.
7. Нужна ли automatic remote publication receipt/tag.
8. Нужна ли будущая поддержка shared filesystem state.

Если ни один backend не проходит suite, это implementation blocker с известным критерием разрешения, а не Open Question core semantics.

## 36. Implementation decomposition

### `00-master-workflow.md`

Определяет FSM, locks, active-run marker, Git refs, invalidation, cancellation, finalization и failure routing.

### `10-knowledge-layer.md`

Определяет anchors, purpose, sync, retirement, glossary, adoption и debt.

### `20-orchestration-and-skills.md`

Определяет state schemas, lease helper, envelopes, effect protocol, cursors, adapter capabilities и recovery.

### `30-review-e2e.md`

Определяет findings, adjudication, registry, JCS plan, scenario selection, E2E proof, receipt и tag.

### `40-local-qc-python.md`

Определяет Makefile targets, Python gates, graph inventory, thresholds, ratchet, dependencies и materialization checks.

### `50-watchdog.md`

Определяет read-only monitoring, wake protocol, quota handling и single-instance operation.

Каждая подспека обязана:

- повторить применимые hard requirements;
- ссылаться на master invariants;
- определить inputs/outputs/errors;
- содержать соответствующие conformance case IDs;
- не оставлять новые архитектурные решения implementation task;
- при конфликте уступать master.

## 37. Acceptance criteria документа

Спецификация implementation-ready, когда:

- все adopted/rejected/deferred decisions трассируются;
- нет `TBD` вне Open Questions;
- один project не допускает два mutating runs;
- lease takeover имеет fencing;
- exact candidate ref и primary checkout различены;
- plan canonicalization детерминирована;
- каждый candidate проходит QC и smoke;
- все gates используют fresh exact checkout;
- LFS/submodules входят в materialization proof;
- stale и conflicting worker results имеют нормативное поведение;
- backend crash window покрыт EffectIntent;
- неизвестный effect не resend;
- как минимум один backend проходит full capability suite до operational release;
- QC, smoke, оба reviews и E2E подтверждают один `(R,P)`;
- receipt и annotated tag указывают exact `R`;
- cleanup выполняется только после durable receipt/tag;
- cancellation не удаляет candidate branch;
- conformance cases выводятся из шести подспек без нового design work.