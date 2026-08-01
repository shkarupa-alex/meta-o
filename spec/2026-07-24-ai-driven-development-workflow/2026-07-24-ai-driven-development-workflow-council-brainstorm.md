# AI-driven development workflow — финальная спецификация

## Статус и назначение

Документ нормативно описывает один обязательный AI-driven workflow разработки
для greenfield и brownfield проектов. Feature-spec создаётся вне методологии и
передаётся ей как immutable input. Workflow должен работать локально без CI,
использовать обычный Git/PR процесс и не создавать собственный session runtime
поверх Herdr/Omnigent.

Требования сформированы пользователем, проверены council из GPT-5.6 Sol xhigh,
Fable 5 xhigh и Kimi K3 reasoning, затем уточнены по результатам cross-review и
трёх независимых pre-mortem. Формальной Delphi-конвергенции proposals не было;
поэтому этот документ фиксирует явно утверждённый пользователем синтез, а не
выбор одного proposal.

Нормативные слова «обязан», «запрещено» и «требует» обозначают hard
requirements. Best-practice профиль Python является обязательной исходной
рекомендацией при создании project-owned QC, но конкретные инструменты и пороги
адаптируются к проекту и версионируются в нём.

### Исходные артефакты

- [my-opinion.md](../../docs/references/my-opinion.md)
- [grace.md](../../docs/references/grace.md)
- [my-memory-layers-scratchpad.md](../../docs/references/my-memory-layers-scratchpad.md)
- [sdd-issues.md](../../docs/references/sdd-issues.md)
- [my-old-methodology-ouroboros.md](../../docs/references/my-old-methodology-ouroboros.md)
- [old-sdd-compare.md](../../docs/references/old-sdd-compare.md)

## 1. Системная формула

```text
immutable feature spec
  → optional reuse scan
  → executor implementation + knowledge sync + local commits
  → clean candidate commit R + E2E selection plan P
  → authoritative local QC and smoke in isolated checkout of R
  → stabilize two independent reviews on (R, P)
  → stabilize all selected E2E scenarios on (R, P)
  → re-attest whichever gate was invalidated, batching fixes inside each loop
  → compact verification metadata for R
  → complete
```

Процессом управляет тонкий оркестратор через adapter skill для Herdr либо
Omnigent. Новый session runtime, очередь событий или собственный daemon не
создаются.

Постоянная истина проекта:

```text
business (§B) → architecture (§A) → module (§M) → symbol
```

Временная истина feature:

```text
immutable spec blob + run state + compact decision log + live session messages
```

После завершения временная истина удаляется. Review findings не архивируются.

## 2. Поставка

Нужны master-spec и шесть implementation-ready подспек:

1. `00-master-workflow.md` — lifecycle, FSM, completion и эскалации.
2. `10-knowledge-layer.md` — бизнес-, архитектурный и code-level context.
3. `20-orchestration-and-skills.md` — роли, skill I/O и backend adapters.
4. `30-review-e2e.md` — rubric, споры, E2E и verification state.
5. `40-local-qc-python.md` — Python gates, конфигурация и ratchet.
6. `50-watchdog.md` — опциональный multi-project watchdog.

Review loop остаётся самостоятельным вызываемым skill, но его нормативный
контракт живёт в `30-review-e2e.md`.

## 3. Роли

Постоянные в пределах run роли:

| Роль | Ответственность | Запрет |
|---|---|---|
| Orchestrator | FSM, адресная доставка, технические решения, эскалации | Не изучает код и не проводит review |
| Executor | Весь scope, тесты, knowledge sync, локальные commits | Не уменьшает scope и не меняет spec |
| Reviewer A | Независимый review; тот же vendor/family, что executor | Не видит reasoning executor |
| Reviewer B | Независимый cross-vendor review | Не видит findings Reviewer A |
| E2E tester | Проверяет реальное поведение exact revision | Не меняет tracked files |

Эфемерные роли:

- reuse researcher — только если пользователь включил опцию;
- technical adjudicator — fresh session одной из уже подтверждённых reviewer
  models, только при неразрешимом техническом споре.

Model set содержит ровно четыре рабочие модели:

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

`vendor` означает организацию-разработчика базовой модели, а не CLI или
API-route; `family` — provider-native base family. Canonical mapping хранится в
project `settings.json` рядом с ModelSet и показывается пользователю при
подтверждении. Alias с неизвестным происхождением нельзя использовать как
cross-vendor reviewer, пока пользователь явно не зафиксирует mapping.

При пользовательском `start` и `resume` сохранённый set показывается и требует
подтверждения. Автоматический retry, quota wake и session replacement используют
уже подтверждённый set без остановки ради повторного вопроса.

Project-specific `ModelSet` хранится в
`~/.meta-o/projects/<project-key>/settings.json`. Глобальный config может дать
default для нового проекта, но после первого подтверждения проект использует
собственный сохранённый набор.

## 4. Вход и immutable spec

```ts
type FeatureSpecRef =
  | {
      kind: "tracked";
      locator: string; // repo-relative path
      sha256: string;
      disposition: "delete_after_sync";
    }
  | {
      kind: "local";
      locator: string; // absolute path
      sha256: string;
      disposition: "external";
    }
  | {
      kind: "url";
      locator: string; // HTTPS URL
      sha256: string;
      disposition: "external";
    };
```

Оркестратор проверяет только доступность и digest. Полноту и качество он не
валидирует.

На preflight байты спеки копируются во временный content-addressed blob вне
репозитория:

```text
~/.meta-o/projects/<project-key>/runs/<run-id>/input/spec-<sha256>.md
```

Blob нужен, чтобы свежая session получила исходный acceptance oracle даже после
удаления tracked-спеки. Он удаляется при cleanup.

URL input допускает только HTTPS, максимум 3 redirects и максимум 10 MiB после
decompression. Credentials, cookies и URL query secrets в state не сохраняются.
Локальный path читается как bytes без выполнения содержимого.

Изменение исходного locator не меняет oracle; расхождение digest фиксируется как
`SPEC_MUTATED`. Текущий run не принимает новые байты: он продолжает только по
сохранённому blob либо останавливается. Чтобы использовать изменённую spec,
пользователь явно создаёт новый run.

## 5. Runtime state без нового runtime

Весь operational state методологии живёт вне репозитория:

```text
~/.meta-o/
  config.json
  watchdog.json
  projects/
    <project-key>/
      project.json
      settings.json
      runs/
        <run-id>/
          state.json
          input/
          findings/
          optional-handoff.md
```

Корень проекта определяется через `git rev-parse --show-toplevel`, приводится к
абсолютному `realpath`, а `project-key` вычисляется детерминированно:

```text
canonical = realpath(git_project_root)
readable  = canonical, где separators и unsafe filename characters заменены "-"
readable  = collapse("-+"), затем UTF-8-safe truncate до 180 bytes
project-key = <readable>--<sha256(canonical)[0:12]>
```

Читаемая часть делает каталог узнаваемым, hash устраняет коллизии путей вроде
`/a-b/c` и `/a/b-c`. `project.json` хранит canonical path и schema version для
проверки разрешения. Каталог `~/.meta-o` создаётся с правами `0700`, state-файлы
— `0600`. Перед использованием существующего key helper обязан проверить, что
`project.json.canonicalPath == canonical`; mismatch считается collision/corrupt
state и блокирует run.

Helper обязан открывать project/run directories без следования symbolic links:
каждый существующий компонент под `~/.meta-o` проверяется через `lstat`, а
создание и замена файлов выполняются относительно уже проверенного directory
descriptor. Symlink, неожиданный владелец или более широкие права считаются
corrupt state и блокируют run до исправления пользователем.

Таким образом skill или bundled script всегда восстанавливает путь к state из
текущего project root. Репозиторию не нужны `.meta-o`, дополнительный
`.gitignore` или иные служебные файлы. При переносе проекта новый absolute path
создаёт новый key; незавершённый run можно явно мигрировать helper-скриптом.

В проекте остаётся только то, что является частью самого продукта и должно
версионироваться: knowledge, verification metadata, код/тесты и native
QC-конфиги вроде `pyproject.toml`. Model set, backend/watchdog preferences,
handoff default и runtime artifacts хранятся под `~/.meta-o`.

Skill оркестратора поддерживает один маленький atomic `state.json`. Это не task
graph, не история и не собственная очередь. Файл отражает уже существующее
состояние Herdr/Omnigent и нужен для восстановления оркестратора.

```ts
type Role =
  | "executor"
  | "reviewerPrimary"
  | "reviewerCrossVendor"
  | "e2eTester"
  | "reuseResearcher"
  | "technicalAdjudicator";

type Phase =
  | "AWAITING_MODEL_SET"
  | "PREFLIGHT"
  | "SOLUTION_SCAN"
  | "EXECUTING"
  | "LOCAL_QC"
  | "SMOKE_PREFLIGHT"
  | "REVIEW_STABILIZATION"
  | "E2E_STABILIZATION"
  | "FINALIZE_METADATA"
  | "COMPLETE"
  | "CANCELLED"
  | "PAUSED_EXTERNAL"
  | "PAUSED_QUOTA"
  | "PAUSED_MISSING_TOOLS"
  | "PAUSED_MODEL_UNAVAILABLE"
  | "PAUSED_TECHNICAL_DISPUTE"
  | "PAUSED_ORCHESTRATOR_BUDGET"
  | "PAUSED_BACKEND_UNCERTAIN"
  | "STOPPED_SPEC_IMPOSSIBLE"
  | "FAILED_BACKEND";

interface ModelRef {
  route: "claude" | "codex" | "opencode";
  vendor: string; // canonical model developer, e.g. openai/anthropic/moonshot
  family: string; // canonical provider-native base family
  model: string;
  effort?: string;
  providerId?: string;
}

interface ProjectMetadata {
  schemaVersion: 1;
  canonicalPath: string;
  projectKey: string;
  createdAt: string; // RFC 3339 UTC
}

interface ProjectSettings {
  schemaVersion: 1;
  modelSet: ModelSet;
  backend: "herdr" | "omnigent";
  watchdogEnabled: boolean;
  handoffDefault: boolean;
  updatedAt: string; // RFC 3339 UTC
}

interface SessionRef {
  backend: "herdr" | "omnigent";
  sessionId: string;
  role: Role;
  generation: number;
}

interface SnapshotRef {
  digest: string; // sha256, lowercase hex
  provenanceCommit: string;
  computedAt: string;
}

interface RevisionResult {
  commitOid: string;
  snapshotDigest: string;
  planDigest?: string;
  status: "passed" | "failed" | "invalidated";
  completedAt: string;
  evidenceRef?: string;
}

interface DecisionRecord {
  id: string;
  category: DecisionRequest["category"];
  question: string;
  answer: string;
  decidedBy: "orchestrator" | "user" | "technicalAdjudicator";
  rationale: string;
  decidedAt: string;
}

interface PauseState {
  reason: string;
  enteredAt: string;
  resumeCondition: string;
}

interface E2ESelectionPlan {
  schemaVersion: 1;
  commitOid: string;
  selectedScenarioIds: string[];
  selectionRationale: string;
  impactedBusinessLinks: string[];
  impactedTags: string[];
  planDigest: string;
}

interface KnowledgeImpactPlan {
  impactedBusinessAnchors: string[];
  impactedArchitectureAnchors: string[];
  impactedModules: string[];
  expectedSpecRetirement: string[];
}

interface PendingOperation {
  operationId: string;
  kind: "spawn" | "send" | "wait" | "stop";
  sessionId?: string;
  requestDigest: string;
  state: "prepared" | "acknowledged" | "observed" | "uncertain";
  backendReceipt?: string;
}

interface RunState {
  schemaVersion: 1;
  runId: string;
  projectKey: string;
  phase: Phase;
  stateVersion: number;
  orchestratorGeneration: number;
  spec: FeatureSpecRef;
  specBlob: string;
  baseRevision: string;
  candidateSnapshot?: SnapshotRef;
  modelSet: ModelSet;
  sessions: Partial<Record<Role, SessionRef>>;
  sessionGeneration: Partial<Record<Role, number>>;
  decisions: DecisionRecord[];
  knowledgeImpactPlan?: KnowledgeImpactPlan;
  e2ePlan?: E2ESelectionPlan;
  pendingOperation?: PendingOperation;
  activeLoop?: {
    kind: "review" | "e2e";
    iteration: number;
    changedSinceOtherGate: boolean;
  };
  confirmations: {
    qc?: RevisionResult;
    reviewerPrimary?: RevisionResult;
    reviewerCrossVendor?: RevisionResult;
    e2e?: RevisionResult;
  };
  openFindings?: Partial<Record<"reviewerPrimary" | "reviewerCrossVendor" | "e2e",
    FindingRecord[]>>;
  paused?: PauseState;
  updatedAt: string;
}
```

`runId` — UUID. `stateVersion` монотонно увеличивается при каждой записи.
Запись выполняется `write temp → fsync(temp) → rename → fsync(parent)` после
каждого transition. Короткий OS advisory lock
`runs/<run-id>/writer.lock` сериализует только state transitions одного run; он
не запрещает другие features, branches, clones или компьютеры. Перед записью
оркестратор проверяет свою `orchestratorGeneration`; takeover допускается только
после доказанного terminal/failed status прежней orchestrator session.
Watchdog читает state, но не меняет FSM. Backend остаётся владельцем session
lifecycle, native resume и событий.

Перед любым backend side effect оркестратор сначала сохраняет
`PendingOperation(state="prepared")`. После crash новый оркестратор запрашивает
backend status/read по `operationId`/receipt. Если результат невозможно
классифицировать как applied или not-applied, операция получает `uncertain`, run
переходит в `PAUSED_BACKEND_UNCERTAIN`, а blind resend запрещён. Это одна
in-flight запись, не очередь и не собственный event runtime.

`ProjectSettings.modelSet` — сохранённый набор проекта. При ручном start/resume
оркестратор показывает его пользователю и спрашивает «эти?». Если ответ «нет»,
предлагается новый набор, который записывается только после подтверждения. В
`RunState.modelSet` сохраняется immutable copy набора, утверждённого для run.

Опциональный executor handoff — отдельный файл до 4 KiB, выбираемый
пользователем. Превышение лимита блокирует запись и требует пересобрать краткое
handoff; silent truncation запрещён. `state.json` не является этим handoff.

Executor делает локальные commits на текущей feature branch. Оркестратор не
создаёт push, PR, remote branch или Git tag без явной просьбы пользователя.
Project не pin'ит и не проверяет версию skills: установкой/обновлением управляет
пользователь, а поломка adapter/skill проявляется через capability/preflight
failure.

После `COMPLETE` оркестратор останавливает оставшиеся worker sessions и удаляет
весь каталог `runs/<run-id>/`; project `settings.json` и tracked project
knowledge остаются. Для остановленного или невозможного run каталог хранится до
явного пользовательского завершения/отмены, после чего удаляется тем же
cleanup. Runtime artifacts не переносятся в следующую feature.

## 6. FSM

```text
AWAITING_MODEL_SET
  → PREFLIGHT
  → [SOLUTION_SCAN]
  → EXECUTING
  → LOCAL_QC
  → SMOKE_PREFLIGHT
  → REVIEW_STABILIZATION
  → E2E_STABILIZATION
  → FINALIZE_METADATA
  → COMPLETE
```

Сквозные состояния:

```text
PAUSED_EXTERNAL
PAUSED_QUOTA
PAUSED_MISSING_TOOLS
PAUSED_MODEL_UNAVAILABLE
PAUSED_TECHNICAL_DISPUTE
PAUSED_ORCHESTRATOR_BUDGET
PAUSED_BACKEND_UNCERTAIN
STOPPED_SPEC_IMPOSSIBLE
FAILED_BACKEND
CANCELLED
```

Внутри `REVIEW_STABILIZATION` findings двух reviewers исправляются батчами,
после чего выполняются `make qc` и следующий review round; E2E в этот момент не
гоняется. Внутри `E2E_STABILIZATION` сначала доводятся до PASS все нужные
сценарии, после каждого batch fixes выполняется `make qc`, но reviewers не
перезапускаются после каждого мелкого E2E-исправления.

Когда один контур стабилизирован, запускается другой. Если fixes изменили
snapshot, ранее полученная attestation другого контура считается
инвалидированной и повторяется только после стабилизации текущего. Completion
по-прежнему требует `QC + Reviewer A + Reviewer B + E2E` на одном snapshot.

Число review rounds и чередований review/E2E не ограничивается. Оркестратор не
эскалирует пользователю длительность или churn автоматически; пользователь сам
запрашивает статус, когда считает нужным.

Нормативная маршрутизация:

| Условие | Следующий шаг |
|---|---|
| Implementation/QC/smoke готовы, review attestation для `S` нет | Запустить обоих reviewers на `S` |
| Один reviewer запросил changes | Собрать оба результата, исправить findings одним batch, `make qc`, повторить оба review |
| Оба reviewer PASS на `S`, E2E PASS на `S` нет | Запустить полный selected E2E set |
| В E2E есть failed/blocked scenarios | Исправить E2E batch, `make qc`, повторять E2E без промежуточного review |
| E2E PASS на новом `S2`, но reviews относятся к старому `S` | Повторять review loop на `S2` |
| Review fixes создали `S3`, а E2E PASS относится к `S2` | Стабилизировать reviews на `S3`, затем повторить E2E |
| QC, оба review и selected E2E PASS на одном `S` | Обновить только `e2e.json`, проверить digest guard, завершить |

Pause/terminal routing:

| State | Entry | Resume/exit |
|---|---|---|
| `PAUSED_EXTERNAL` | Внешняя зависимость или E2E environment недоступны | Повторить соответствующий preflight после доказанного восстановления |
| `PAUSED_QUOTA` | Backend явно сообщил quota/reset time | Backend/watchdog wake после reset, затем `status/read`, без blind resend |
| `PAUSED_MISSING_TOOLS` | Нет `Makefile`, `make qc`, E2E contract или project tool | Пользователь разрешает setup; executor настраивает prerequisite |
| `PAUSED_MODEL_UNAVAILABLE` | Подтверждённая модель недоступна | Resume той же либо пользователь подтверждает новый ModelSet |
| `PAUSED_TECHNICAL_DISPUTE` | Rebuttal не разрешил finding | Fresh adjudicator; затем возврат в review loop |
| `PAUSED_ORCHESTRATOR_BUDGET` | Оркестратор заранее достиг context threshold | Fresh orchestrator принимает generation после проверки старой session |
| `PAUSED_BACKEND_UNCERTAIN` | Side effect нельзя доказать applied/not-applied | Только reconciliation или решение пользователя остановить run; resend запрещён |
| `STOPPED_SPEC_IMPOSSIBLE` | Immutable spec технически невыполнима | Только пользователь создаёт новую spec/run; текущая spec не меняется |
| `FAILED_BACKEND` | Completion-critical capability отсутствует/сломана | Исправить adapter/backend и пройти capability suite |
| `CANCELLED` | Пользователь отменил run | Best-effort stop sessions, затем cleanup после подтверждения |

Timeout одного reviewer никогда не означает продолжение с одним review:
оркестратор заменяет session и повторяет review того же `(commitOid,
snapshotDigest, planDigest)`.

Reuse scan — явный стартовый вопрос пользователя, не auto-эвристика. Результат
живёт в decision log. Выбор, затрагивающий business semantics, эскалируется.

Smoke preflight тестировщика перед первым review ограничен сборкой, boot и
health-check. Он не заменяет тяжёлый E2E и предотвращает дорогое review явно
неподнимающегося продукта.

## 7. Решения и эскалации

Executor не меняет spec. Он отправляет:

```ts
interface DecisionOption {
  id: string;
  description: string;
  tradeoffs: string[];
}

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

Оркестратор решает только если решение обратимо, не меняет acceptance behavior,
`§B-*`, scope и residual defect. Иначе — пользователь.

`SPEC_IMPOSSIBLE` всегда останавливает run и эскалируется человеку.

Существенные ответы пишутся в compact decision log внутри каталога текущего run
под `~/.meta-o/projects/<project-key>/runs/`.
Устойчивые решения переносятся в code rationale или `§A`; новые business
решения появляются только после пользовательской эскалации. Обычное обновление
`§B` по уже утверждённой spec выполняет executor самостоятельно.

## 8. Knowledge layer

```text
docs/knowledge/
  business.md
  architecture/<domain>.md
  glossary.md
docs/architecture/
  e2e.md
  e2e.json
docs/todo.md
```

Бизнес-уровень намеренно хранится в одном `business.md`, чтобы человек мог
гарантированно прочитать верхнюю истину целиком, а не собирать её по domain
files. `glossary.md` обязателен всегда. Архитектурный knowledge-слой можно
делить по доменам и boundaries, поскольку он растёт вместе с проектом.

`docs/architecture/e2e.md` — обязательный project-owned contract: как поднять
environment, подготовить fixtures, выполнить smoke/E2E, найти сценарии,
очистить состояние и интерпретировать failures. Оркестратор проверяет его вместе
с `Makefile`; при отсутствии предлагает пользователю разрешить executor создать
или настроить документ.

`docs/architecture/e2e.json` — машиночитаемый registry результатов. JSON выбран
потому, что `make qc` обязан проверять schema, ссылки сценариев и `§B` anchors.
Нарративные инструкции и описания остаются в `e2e.md`.

### 8.1. Уровни

- `§B-*`: проблема, субъект, нужный outcome, недопустимое поведение, что станет
  лишним при отмене.
- `§A-*`: реализуемые `§B-*`, rationale, invariants, boundaries, non-goals,
  последствия отмены.
- `§M-*`: module docstring, его purpose, `§A-*`, boundary и последствия
  удаления.
- Symbol: native docstring с purpose и ссылкой на `§M-*`.

Минимальная ссылка всегда идёт ровно на один уровень вверх. Дальняя ссылка
разрешена дополнительно, но не заменяет непосредственную.

Purpose обязателен для каждого first-party module, class, function и method,
включая private, nested, async, property и dunder. Tests — first-party code.

Формальные исключения:

- generated source с marker и declared glob;
- runtime-synthetic сущности, отсутствующие в source AST;
- overload declaration при документированной реализации;
- third-party/vendor roots.

Лямбды и comprehensions не считаются именованными symbols.

### 8.2. Никакой planned truth

Гипотеза ранней `§B-TODO/§A-TODO` projection отклоняется. Она смешивает
утверждённую текущую истину с ещё не реализованным намерением и создаёт
recovery-обязанность при abort.

Вместо неё executor ведёт временный `KnowledgeImpactPlan` в run state. Новые
anchors и code links появляются в одном implementation commit, поэтому
промежуточная ссылка не бывает dangling.

### 8.3. Sync и retirement

Knowledge sync происходит до review-candidate commit. Оба reviewers проверяют
код и знания вместе.

Tracked feature spec удаляется в том же candidate window, но immutable blob
остаётся доступен ролям. External spec не копируется в durable project docs.

Перед retirement устойчивые требования спеки распределяются по всем затронутым
слоям причинной цепочки: бизнес-инварианты — в `§B`, архитектурные решения,
границы и системные инварианты — в `§A`, локальная ответственность — в `§M` и
purpose symbols. Это не означает, что всё содержимое спеки обязано попасть в
`§B`.

На финале не допускаются новые `§B`, `§A`, purpose или удаления спеки после
review/E2E. Это устраняет post-attestation semantic writes.

## 9. Mechanical knowledge checks

Проект обязан механически проверять:

- уникальность anchors;
- `§A → §B`;
- `§M → §A`;
- symbol → `§M`;
- dangling references;
- прямые code → `§B` без архитектурного уровня;
- `docs/architecture/e2e.json` schema и business links;
- отсутствие feature archives в configured search roots.

Purpose-check анализирует AST всех configured first-party roots. Конкретная
реализация этих проверок принадлежит проекту и вызывается из его `Makefile`;
skill содержит контракт, best practices и Python-рекомендации, но не подменяет
project toolchain bundled QC-скриптами.

Механика проверяет наличие и ссылку. Ревьюеры проверяют, действительно ли текст
объясняет причину существования, не повторяет механику и не дрейфует от
`§B/§A`.

## 10. Local QC

Авторитетный интерфейс проекта:

```bash
make qc
```

`Makefile` — tracked часть проекта. При preflight оркестратор механически
проверяет наличие `Makefile`, target `qc` и
`docs/architecture/e2e.md`, не пытаясь оценивать реализацию команд. Если
контракт отсутствует, он предлагает пользователю разрешить executor создать или
настроить его. При отказе run ставится на паузу: без project-owned QC/E2E
contract полный workflow невозможен.

`make qc` обязан быть non-mutating: exit code `0` означает полный PASS, любой
non-zero — FAIL. Отсутствующий обязательный tool также даёт non-zero, а не
молчаливый skip. Человекочитаемый stdout/stderr сохраняется только как временное
evidence текущего run и не коммитится. Оркестратор доверяет только exit status и
snapshot digest; содержательную адекватность targets проверяют executor и
reviewers.

Рекомендуемый публичный target contract:

```text
make format       # mutating formatter, если применимо
make lint         # non-mutating static checks
make typecheck    # если язык/проект использует type checker
make test
make build        # если у проекта есть build/package step
make smoke
make e2e          # если автоматизированный E2E применим
make verify-e2e-metadata  # fast schema/anchor check после last_run update
make qc           # non-mutating aggregate обязательных локальных gates
```

Отдельные targets могут отсутствовать, если операция неприменима, но `make qc`
обязателен и агрегирует все релевантные blocking checks.

Tracked `.quality/qc-manifest.json` перечисляет обязательные gate IDs и
project-specific commands. Минимальные IDs для Python:

```text
format-check, lint, typecheck-policy, tests, build-policy,
purpose, knowledge, import-graph, code-health, e2e-metadata
```

`make qc` получает output path через `META_O_QC_RESULT` и атомарно пишет туда
машиночитаемый result с gate ID, `passed|failed|not_applicable`, command,
tool version и duration. Output находится под текущим `~/.meta-o/.../runs/`, а
не в репозитории. Общий PASS допустим только если каждый manifest gate имеет
`passed` либо заранее reviewed `not_applicable`. Удаление gate, расширение
exemption, ослабление command/config или изменение baseline относительно
`baseRevision` требует решения пользователя.

Python best-practice profile, который skill требует адаптировать к проекту:

```text
Ruff format --check + lint
mypy или pyright согласно project policy
pytest и project integration tests
Import Linter contracts
project-owned AST purpose/anchor checks
project-owned knowledge/verification checks
file/class/function size, nesting и regression ratchet
build/package check, если проект собирается как artifact
```

Project-owned code-health check контролирует file/class/function LOC, nesting и
новые baseline regressions. Ruff контролирует cyclomatic complexity и design
rules. Import Linter контролирует layers, forbidden dependencies и
independence.
Cognitive complexity допускается отдельным tool только если проект его явно
установил; отсутствие optional analyzer не превращается в ложный PASS.

Обязательный graph gate строит полный import graph first-party modules:

- каждый module принадлежит declared architectural boundary;
- неизвестный module блокирует QC;
- новые strongly connected components и dependency cycles запрещены;
- новые lateral edges проверяются против dependency baseline;
- fan-in/fan-out имеют project-configurable thresholds и ratchet.

Python reference algorithm:

1. Discover `.py` files только под configured `source_roots`; map path к module
   name с учётом packages и namespace-package policy проекта.
2. Parse stdlib `ast`; syntax error блокирует gate.
3. Добавить edges для `Import`/`ImportFrom`, включая relative imports.
   Literal `importlib.import_module("x")` и `__import__("x")` учитываются;
   non-literal dynamic import попадает в отдельный reviewed warning list.
4. Отфильтровать third-party modules, затем проверить boundary membership и
   forbidden contracts.
5. Вычислить SCC алгоритмом Tarjan; любая новая SCC размера `>1` или self-cycle
   относительно baseline блокирует gate.
6. Сравнить sorted edge set, fan-in и fan-out с baseline; новые запрещённые
   edges и превышение ratchet блокируют.

Purpose-check тем же AST требует module docstring и docstring у каждого
именованного `ClassDef`, `FunctionDef`, `AsyncFunctionDef`, включая nested,
private, property, method и dunder. Он проверяет ссылку `§M-*`; исключения
разрешены только для generated/vendor globs и overload declarations,
перечисленных в tracked config. Lambda/comprehension не считаются symbols.

Knowledge-check парсит Markdown headings по anchor grammar
`§B-[A-Z0-9-]+`, `§A-[A-Z0-9-]+`, `§M-[A-Z0-9-]+`, проверяет уникальность,
dangling links и обязательную связь ровно на ближайший верхний уровень.

Стартовые значения, которые проект обязан явно принять или изменить в
`pyproject.toml`:

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

Brownfield structural debt допускается только как frozen baseline; ухудшение и
новая запись запрещены. Purpose debt baseline не допускается: проект проходит
отдельную adoption feature до использования основного workflow.

QC сравнивает эффективные пороги и baseline с `baseRevision`. Любое ослабление
порогов, изменение существующего baseline в сторону разрешения регрессии или
отключение проверки блокирует gate и требует решения пользователя; executor не
может самостоятельно ослабить контролирующий его контур.

Placement:

| Placement | Плюсы | Минусы | Решение |
|---|---|---|---|
| pre-commit | Ранняя дешёвая обратная связь | Частые agent commits; тяжёлый gate провоцирует bypass | Только optional format/basic lint |
| `make qc` | Одинаково работает без CI и проверяет весь candidate | Дороже, запускается реже | Единственный обязательный authoritative gate |
| pre-push | Не даёт случайно отправить непроверенное | Push делает пользователь; может дублировать недавний QC | Optional полный дубль |
| CI | Командная воспроизводимость | Не гарантирован локально и может отсутствовать | Optional дубль, не источник истины |

## 11. Review и adjudication

Каждый reviewer получает immutable spec blob, exact content revision, diff,
knowledge layer и QC result. Не получает reasoning executor, findings второго
reviewer или implementation narrative.

Rubric:

1. spec и business intent;
2. correctness, failures, security и concurrency;
3. architecture, boundaries, coupling и complexity;
4. tests, observability и false-success;
5. purpose semantics и knowledge drift;
6. maintainability и лишние наслоения.

Finding:

```ts
interface Evidence {
  kind: "file" | "symbol" | "command" | "scenario";
  reference: string;
  detail: string;
}

interface Finding {
  id: string;
  severity: "blocker" | "major" | "minor" | "suggestion";
  classification: "defect" | "engineering_risk" | "taste";
  evidence: Evidence[];
  basis: { type: "spec" | "business" | "architecture" | "engineering";
           reference: string };
  impact: string;
  recommendedFix: {
    approach: string;
    rationale: string;
    alternatives?: string[];
  };
}

interface ReviewResult {
  reviewer: "reviewerPrimary" | "reviewerCrossVendor";
  commitOid: string;
  snapshotDigest: string;
  planDigest: string;
  selectionPlanVerdict: "complete" | "incomplete";
  verdict: "passed" | "changes_requested";
  findings: Finding[];
  completedAt: string;
}

interface E2EScenarioResult {
  scenarioId: string;
  status: "passed" | "failed" | "blocked";
  evidence: string;
}

interface E2EResult {
  commitOid: string;
  snapshotDigest: string;
  planDigest: string;
  selectedScenarioIds: string[];
  selectionRationale: string;
  scenarios: E2EScenarioResult[];
  completedAt: string;
}

interface FindingRecord {
  finding: Finding;
  raisedBy: SessionRef;
  status: "open" | "fix_proposed" | "resolved" | "taste_dismissed";
  resolutionCandidate?: string;
  resolutionEvidence?: Evidence[];
  resolvedBy?: SessionRef;
}
```

Все подтверждённые defects и engineering risks, включая minor, исправляются.
Не блокирует только доказанный taste. Reviewer обязан предложить ожидаемый
оптимальный способ исправления, чтобы executor не тратил отдельный turn на
восстановление замысла finding; рекомендация не является обязательной, и
executor может аргументированно выбрать лучшее решение.

`classification == "taste"` допустим только с `severity == "suggestion"`.
`blocker/major/minor` применимы только к defect или engineering risk.

`ReviewResult.verdict == "passed"` допустим только при отсутствии findings с
classification `defect` или `engineering_risk` и
`selectionPlanVerdict == "complete"`. Результат с другим
`snapshotDigest` или `planDigest` считается stale и не меняет FSM. `commitOid`
хранится как provenance конкретного isolated checkout; rebase/squash с
идентичным `snapshotDigest` не требует повторного gate. `E2EResult` считается
PASS только если каждый selected scenario имеет status `passed`.

Findings передаются исполнителю максимально близко к исходному виду и не
записываются в отдельный project ledger. Пока finding открыт, `FindingRecord`
временно хранится во внешнем run-state, чтобы смерть оркестратора не требовала
повторного review. Executor может поставить только `fix_proposed`; `resolved`
ставит исходный reviewer generation, replacement reviewer либо adjudicator
после проверки `resolutionCandidate` и evidence. После подтверждения запись
удаляется; между features findings не сохраняются.

После двух безрезультатных rebuttal cycles оркестратор может вызвать fresh
technical adjudicator, но не эскалирует review churn пользователю автоматически.
Отвергнутый подозрительный trade-off получает code rationale; taste — нет.

## 12. E2E и snapshot semantics

Первый heavy E2E начинается только после PASS обоих независимых reviewers на
одном snapshot. Оба review можно выполнять параллельно, если backend это
поддерживает; их findings друг другу не раскрываются.

Перед gates executor создаёт локальный candidate commit `R`. Candidate обязан
иметь clean index/worktree; untracked files запрещены. Оркестратор создаёт для
QC, каждого reviewer и E2E fresh detached worktree `R`. Перед и после gate
`git status --porcelain --untracked-files=all` обязан быть пустым; иначе результат
invalid. Gate result всегда содержит одновременно `commitOid`, `snapshotDigest`
и `planDigest`.

Candidate snapshot `S` и plan `P` должны получить:

```text
QC(R, S) PASS
Reviewer A(R, S, P) PASS
Reviewer B(R, S, P) PASS
E2E(R, S, P) PASS
```

`S` идентифицируется не commit SHA, а стабильным `snapshot_digest`: hash
отсортированного списка `path + mode + Git blob OID` для всех tracked files,
кроме поля `scenarios[*].last_run` в `docs/architecture/e2e.json`. Для этого
файла в digest входит canonical JSON projection без `last_run`; все
selection-critical поля (`scenario_id`, `scenario_ref`, `business_links`,
`always_required`, `tags`) attested и не могут меняться после review. Canonical
JSON использует UTF-8, lexicographically sorted object keys и сохраняет array
order. Commit SHA сохраняется как provenance. Rebase/squash с тем же tree не
инвалидирует content attestation, но каждый gate всё равно исполняется на
конкретном immutable candidate commit.

Любое изменение executable code, tests, configs, business/architecture
knowledge, purpose или tracked spec меняет `snapshot_digest` и сбрасывает
подтверждения.

E2E tester отдельным planning turn формирует `E2ESelectionPlan P` до первого
review из immutable spec, business links, tags и diff candidate; оркестратор
только проверяет schema/digest и не анализирует diff. Каждый проект обязан иметь
минимум один `always_required` scenario. Оба reviewers явно attest полноту
selected IDs и `planDigest`; E2E использует ровно этот plan. Если tester
обнаружил пропущенный сценарий, plan обновляется, после стабилизации E2E оба
reviewers повторно attest новый `P`.

E2E tester возвращает результаты оркестратору, но не меняет tracked files.
После каждой завершённой попытки executor обновляет только
`docs/architecture/e2e.json`; failed status остаётся видимым до следующего
прогона. После общего PASS executor делает guarded metadata commit. Registry
имеет следующий нормативный schema:

```json
{
  "schema_version": 1,
  "scenarios": [
    {
      "scenario_id": "E2E-CHECKOUT-01",
      "scenario_ref": "docs/architecture/e2e.md#e2e-checkout-01",
      "business_links": ["§B-CHECKOUT-01"],
      "always_required": false,
      "tags": ["checkout"],
      "last_run": {
        "snapshot_digest": "<S>",
        "provenance_commit": "<commit-at-verification>",
        "run_id": "<run-id>",
        "spec_sha256": "<spec-digest>",
        "verified_at": "2026-07-24T18:20:00Z",
        "status": "passed",
        "environment": "local:docker-compose"
      }
    }
  ]
}
```

Для feature выбираются все `always_required` scenarios плюс сценарии, чьи
`business_links` или tags затронуты spec/diff. Completion требует `passed` на
текущих `(R, S, P)` для каждого selected scenario. Допустимые статусы: `passed`,
`failed`, `blocked`. Screenshots, raw logs и model reasoning в registry не
записываются.

Completion attests `S`; repository HEAD может включать bookkeeping commit.
Guard повторно вычисляет `S` с field-level исключением только `last_run` и
проверяет, что metadata commit не меняет другие paths или catalog fields.
Project-owned `make verify-e2e-metadata` проверяет schema/anchors после записи.
Любое другое изменение инвалидирует прежние attestations и маршрутизируется FSM
через соответствующие stabilization loops.

Альтернатива, если команда считает dual-revision semantics слишком сложной:
держать verification registry во внешнем durable state. Git notes отвергнуты
как плохо обнаруживаемые агентами и ненадёжно переносимые обычным clone/push.

## 13. Backend adapters

Core использует capability contract, но не предполагает поддержку capability:

```ts
interface AdapterCapabilities {
  deliveryReceipt: boolean;
  idempotencyKey: boolean;
  statusRead: boolean;
  wait: boolean;
  nativeResume: boolean;
  stop: boolean;
  concurrentSessions: boolean;
}

interface SpawnRequest {
  operationId: string;
  role: Role;
  model: ModelRef;
  prompt: string;
  cwd: string;
}

type SessionStatus =
  | "starting"
  | "running"
  | "waiting"
  | "complete"
  | "failed"
  | "stopped"
  | "unknown";

interface DeliveryResult {
  operationId: string;
  status: "acknowledged" | "rejected" | "unknown";
  receipt?: string;
}

interface SessionOutput {
  cursor: string;
  text: string;
  terminal: boolean;
}

interface ExpectedState {
  terminal: boolean;
  deadlineAt: string;
}

interface WaitResult {
  status: SessionStatus;
  cursor?: string;
}

interface ReconcileResult {
  operationId: string;
  effect: "applied" | "not_applied" | "unknown";
  receipt?: string;
}

interface SessionAdapter {
  capabilities(): Promise<AdapterCapabilities>;
  spawn(request: SpawnRequest): Promise<SessionRef>;
  send(session: SessionRef, operationId: string, message: string):
    Promise<DeliveryResult>;
  status(session: SessionRef): Promise<SessionStatus>;
  read(session: SessionRef, cursor?: string): Promise<SessionOutput>;
  wait(session: SessionRef, expected: ExpectedState): Promise<WaitResult>;
  resume(session: SessionRef): Promise<SessionRef>;
  reconcile(operation: PendingOperation): Promise<ReconcileResult>;
  stop(session: SessionRef): Promise<"stopped" | "already_terminal" | "unknown">;
}
```

Adapter skill не реализует durable queue, local dedup ledger или session DB.
Если backend не даёт native idempotency, повторная отправка запрещена, пока
`status/read` не докажут terminal state. Неопределённость эскалируется или
разрешается fresh session с новой generation только после доказательства, что
предыдущая операция не была применена либо прежний worker terminal и не может
продолжить работу.

До реализации обязателен executable capability suite для обоих backend:

- delivery acknowledgement;
- status `running / waiting / complete / failed`;
- wait/poll reconciliation;
- native resume;
- session replacement;
- concurrent completions;
- reboot/server restart;
- CLI coverage Claude/Codex/OpenCode.

Suite запускается:

- при первой установке adapter;
- после обновления Herdr/Omnigent;
- в preflight run как короткий smoke контрактов, критичных для выбранного
  workflow;
- полностью по ручной диагностической команде.

FSM имеет обязательный stall deadline даже при выключенном watchdog. Если
backend не даёт доказуемого terminal state до deadline, run переходит в
`PAUSED_BACKEND_UNCERTAIN` и уведомляет пользователя; он не висит бесконечно и
не делает слепой resend.

Текущая проверка первичных источников показывает:

- Herdr документирует background sessions, agent-aware statuses, socket API,
  `wait`, `pane read` и native agent resume:
  https://github.com/ogulcancelik/herdr
- Omnigent документирует persistent sessions, web/mobile collaboration,
  built-in Claude/Codex harnesses, custom agents и policy layer:
  https://omnigent.ai/

Недоказанная capability не объявляется обязательной «на бумаге». Adapter matrix
имеет `supported / degraded / unsupported`, а unsupported completion-critical
capability блокирует выбор backend.

Skills устанавливаются и обновляются отдельным маленьким `install.sh` /
`update.sh` по выбранному пользователем пути. Скрипты копируют skill manifests,
prompts и заранее скомпилированные из TypeScript dependency-free `.mjs`
helpers; `npm install` на машине-получателе не требуется. Они не ставят
project hooks, не меняют репозитории и не pin'ят skill version в проекте.
Момент и способ обновления определяет разработчик. После обновления adapter
обязан пройти capability suite; failure эскалируется как поломка skill/backend,
а не маскируется fallback-поведением.

Перед передачей кода, diff, spec или logs внешней модели пользователь один раз
подтверждает разрешённые providers для проекта. Credentials и значения
переменных, похожих на secrets/tokens/keys, удаляются из prompts/evidence.
Артефакты run имеют `0600`; E2E не направляется в production, если
`docs/architecture/e2e.md` не содержит явного, подтверждённого пользователем
production-safe сценария.

## 14. Context policy

Оркестратор получает только bounded structured results и evidence references.
Он не принимает полные logs, transcripts или diffs.

Состояние на диске обновляется после каждого transition, поэтому свежая
orchestrator session восстанавливается из `state.json`, immutable spec и
backend status, а не из narrative summary.

При доступной telemetry thresholds настраиваются в user settings; `55/65/75%`
служат только стартовой рекомендацией warning/prepare/rotate, а не
универсальным нормативом. Без telemetry оркестратор ведёт консервативный byte
counter и заранее заменяет session до предполагаемой compaction.

Неожиданную compaction нельзя считать надёжно обнаруживаемой без capability
backend. Поэтому она остаётся известным residual risk; методология не притворяется
exactly-once control plane.

Worker sessions заменяются свежими при loss, длинной холодной паузе или
невыгодном rewarm. Default `100k` cold-resume threshold — калибруемая гипотеза,
не универсальный закон.

## 15. Watchdog

Watchdog опционален и включается пользователем. Один процесс обслуживает
несколько projects/runs.

Сравнение вариантов:

| Вариант | Плюсы | Риски | Решение |
|---|---|---|---|
| Deterministic script | Предсказуем, тестируется fake clock, не галлюцинирует actions | Хуже распознаёт нестандартный текст provider | Основа и единственный authority |
| Local model | Лучше понимает неструктурированный tail | Вероятностные решения могут разбудить/остановить не ту session | Не допускается как authority |
| Hybrid | Deterministic FSM + model только для закрытой классификации | Нужны sanitization и fallback | Опциональное расширение default script |

Default — deterministic standalone `watchdog.mjs`; локальная модель получает не
более 8 KiB санитизированного tail, возвращает только
`transient|quota|external|unknown` и никогда не генерирует команды.

Watchdog:

- poll/wait backend state;
- обнаруживает завершённый turn без реакции;
- классифицирует transient/quota/external/unknown;
- после quota reset или потерянного completion event вызывает adapter
  `status/read/reconcile`;
- если прежняя orchestrator session доказанно terminal/failed — создаёт fresh
  orchestrator с подтверждённым для run ModelSet и wake prompt «прочитай skill,
  state и backend status; продолжи»;
- если orchestrator session жива — использует backend-native wake/event
  delivery, не инструктуя worker напрямую;
- не отправляет слепой `continue`;
- не меняет FSM самостоятельно;
- защищён single-instance lock;
- запускается через launchd/systemd user service.

`~/.meta-o/watchdog.json` хранит `enabled`, список project keys,
`pollIntervalSeconds` (default 30), `maxBackoffSeconds` (default 300) и
classifier mode. Productive unlimited review/E2E loops не считаются stall и не
порождают уведомление пользователю только из-за числа итераций.

## 16. Adoption и технический долг

Greenfield сразу создаётся со strict knowledge/QC skeleton.

Brownfield сначала проходит отдельную adoption feature. Hard constraint
all-symbol purpose означает, что silent forever-baseline здесь невозможен.
Adoption идёт по dependency-closed source roots, описанным в
`adoption-manifest.json`. Feature может затрагивать только уже adopted closure;
граница расширяется отдельным reviewed adoption change. Проект считается
полностью adopted только при 100% first-party coverage.

Debt в scope текущей spec исправляется. Старый внешний debt кратко добавляется
в `docs/todo.md` с area, risk и формой будущей feature; он не расширяет текущую
spec.

## 17. Rejected и deferred

Rejected:

- ранняя durable TODO projection feature-спеки;
- собственный runtime, daemon, event queue или dedup ledger;
- один giant skill исполнителя как носитель обязательного workflow;
- review-findings archive;
- Git notes как основной verification registry;
- local LLM, способная самостоятельно будить или инструктировать sessions;
- bundled language-specific QC вместо project-owned `Makefile` toolchain;
- post-attestation knowledge/business changes;
- автоматический reuse scan без стартового выбора пользователя;
- project-wide lock или запрет параллельных feature branches/runs;
- обязательные Git tags, verification receipts и отдельный completion report;
- автоматическая эскалация пользователю только из-за числа review/E2E cycles;
- risk-based purpose coverage вместо принятого all-symbol coverage;
- dual behavioral/knowledge digest и повторное использование старого E2E PASS
  после knowledge-only change.

Deferred / empirical:

- конкретный default Herdr или Omnigent после capability spike;
- точные thresholds Python code health после пилота;
- Codex/Claude cache TTL и safe context thresholds;
- PHP/JS implementation adapters;
- сохранение external feature specs вне project search scope.

## 18. Главный dissent

1. All-symbol purpose. Выполнимо и принято как hard constraint, но остаётся риск
   cargo-cult docstrings. Митигация — одна причинная строка плюс review
   адекватности; альтернатива — risk-based purpose после измеренного пилота.
2. Автономное обновление `§B`. Совместимо с workflow, но усиливает ошибочное
   понимание спеки. Митигация — оба reviewers сверяют `§B` с immutable spec и
   целым `docs/knowledge/business.md`. Отдельный completion report не создаётся:
   человек при необходимости читает knowledge-файл или обычный Git diff.
3. Два reviewer, один same-family. Сохраняется как hard constraint; rubric не
   делит ответственность жёстко, чтобы критическая область не имела одного
   владельца.
4. Удаление feature specs. Сохраняется; immutable run blob предотвращает потерю
   acceptance oracle во время feature, Git хранит provenance tracked-спек.
5. Отсутствие собственного control layer. Сохраняется ценой честного
   capability gate и residual risk вместо выдуманной exactly-once гарантии.

## 19. Pre-mortem corrections

Две независимые clean-session позиции дали общие темы:

1. Backend ambiguity и capability rot. Принято: повторяемая conformance suite,
   FSM stall deadline и `PAUSED_BACKEND_UNCERTAIN`. Собственная durable queue
   по-прежнему rejected.
2. Git SHA нестабилен при rebase/squash. Принято: `snapshot_digest` по Git blobs,
   commit SHA только provenance.
3. Structural QC может пропустить связанность. Принято: полный graph inventory,
   SCC/cycle, boundary membership, edge/fan ratchet.
4. All-symbol purpose рискует стать compliance theatre. Принято:
   dependency-closed adoption manifest и semantic sampling в rubric.
   Risk-based purpose остаётся альтернативой вне hard constraint.
5. Cross-feature `§B` consistency не имела владельца. Принято: cross-vendor
   reviewer сравнивает business diff со всем `docs/knowledge/business.md`, а
   verification registry хранит compact `anchor/run/spec digest` provenance.
6. External acceptance oracle после cleanup теряется. Полный cold archive
   rejected как нарушение решения удалять старые спеки. Принимается осознанная
   потеря bytes; сохраняются digest, provenance и требования, перенесённые в
   подходящие слои `§B → §A → §M → symbol`, а не только в бизнес-слой.
7. Spec ambiguity может создать очередь эскалаций. Preflight spec validation
   rejected как out of scope и прямое нарушение границы оркестратора.
   Review rubric проверяет misclassification technical/business decisions;
   process writing specs улучшается отдельно.


## 20. Decision Ledger

| ID | Decision | Status | Rationale | Source |
|---|---|---|---|---|
| D-001 | Поставка состоит из master-spec и шести implementation-ready подспек | adopted | Система велика, но подспеки должны иметь единый lifecycle и терминологию | user interview; synthesis |
| D-002 | Один полный workflow без quality modes | adopted | Экономия на глубине и cross-review не является целью | user interview |
| D-003 | Feature-spec создаётся вне workflow и является immutable input | adopted | Оркестратор не должен становиться spec author или validator | user interview |
| D-004 | Spec закрепляется `sha256` и временным immutable blob | adopted | Свежим sessions нужен acceptance oracle после retirement tracked-спеки | gpt/r2; premortem-gpt |
| D-005 | Оркестратор управляет процессом и не изучает код | adopted | Его ограниченный контекст должен жить дольше рабочих ролей | my-opinion; user interview |
| D-006 | Рабочий model set содержит executor, same-family reviewer, cross-vendor reviewer и E2E tester | adopted | Две независимые ошибки review плюс отдельная поведенческая проверка | user interview |
| D-007 | Model set подтверждается при user start/resume; auto-recovery его переиспользует | adopted | Иначе ночной quota wake остановится на человеческом gate | fable/r2; user interview |
| D-008 | Sessions расходны и не переносятся между features | adopted | Долговечность роли полезна только пока контекст актуален и экономичен | user interview |
| D-009 | Executor handoff-файл опционален и ограничен 4 KiB | adopted | Пользователь выбирает цену дополнительного артефакта | user interview; gpt/r2 |
| D-010 | Runtime использует один atomic `~/.meta-o/projects/<project-key>/runs/<id>/state.json` | adopted | Fresh orchestrator должен восстановить FSM без task graph и transcript, не создавая служебных файлов в репозитории | kimi/r1; user correction |
| D-011 | Собственный daemon, session DB, durable queue и dedup ledger не создаются | adopted | Session lifecycle и delivery принадлежат Herdr/Omnigent | user interview |
| D-012 | Backend допускается только после повторяемой capability suite | adopted | Разовый spike не защищает от capability rot | gpt/r3 reviews; premortem-kimi |
| D-013 | Неопределённый delivery не вызывает blind resend | adopted | Без native idempotency повтор способен создать двойную работу | gpt/r2; fable/r2; premortem |
| D-014 | FSM имеет stall deadline и `PAUSED_BACKEND_UNCERTAIN` без watchdog | adopted | Liveness основного workflow не должна зависеть от опционального компонента | premortem-kimi |
| D-015 | Watchdog опционален, включается пользователем и наблюдает несколько projects | adopted | Он нужен для unattended runs, но не всем пользователям | user interview |
| D-016 | Watchdog deterministic; local LLM только закрытый classifier | adopted | Вероятностная модель не должна самостоятельно возобновлять sessions | gpt/r2; fable/r2; kimi/r1 |
| D-017 | Reuse scan — явная стартовая опция | adopted | Его правильное место между spec creation и execution пока не решено | user interview |
| D-018 | Business `§B-*` — верхняя точка истины | adopted | Код не сохраняет исходную потребность и причину поведения | user interview; scratchpad |
| D-019 | Knowledge chain: `§B → §A → §M → symbol` | adopted | Даёт причинную трассировку с минимальной ссылкой на один уровень вверх | gpt/r2; grace; scratchpad |
| D-020 | Purpose обязателен у всех first-party modules/classes/functions/methods, включая private/tests | adopted | Через много итераций должна сохраняться причина существования | user interview |
| D-021 | Native docstring style, без обязательного XML/`@purpose` | adopted | Формат вторичен, если lint надёжен и стиль языка сохранён | user interview |
| D-022 | Механика проверяет наличие/links; reviewers — смысл и drift | adopted | Семантику purpose нельзя надёжно свести к regex | user interview; all proposals |
| D-023 | Planned `§B-TODO/§A-TODO` до реализации не пишутся | rejected | Future truth загрязняет текущий источник истины и требует cleanup при abort | gpt/r2; synthesis |
| D-024 | План knowledge changes временно живёт в `KnowledgeImpactPlan` | adopted | Даёт planning без смешивания planned и factual knowledge | gpt/r2 |
| D-025 | Knowledge sync и retirement tracked-spec входят в review candidate | adopted | Post-attestation semantic writes сделали бы review недействительным | round-3 reviews |
| D-026 | Review findings не сохраняются в project ledger | adopted | Они нужны только текущим sessions; архив создаёт artifact bloat | user interview |
| D-027 | Существенные решения живут во временном compact decision log | adopted | Уменьшает копипаст и переносит устойчивый rationale в knowledge/code | user interview |
| D-028 | `docs/architecture/e2e.json` связывает E2E scenario с `§B`, snapshot, датой и status | adopted | Registry читается `make qc`, а инструкции и сценарии живут рядом в `e2e.md`; сырые логи/скриншоты не сохраняются | user correction |
| D-029 | Полный cold archive external specs не создаётся | rejected | Пользователь требует retirement, а архив снова становится скрытым источником | user interview; premortem-gpt alternative |
| D-030 | Verification хранит compact `run_id/spec_digest/anchor` provenance | adopted | Это помогает восстановить происхождение без хранения старой спеки | premortem-kimi |
| D-031 | Completion attests stable `snapshot_digest`, не commit SHA | adopted | Rebase/squash меняют SHA без изменения проверенного содержимого | premortem-gpt |
| D-032 | Из snapshot digest исключается только `e2e.json.scenarios[*].last_run`; catalog fields остаются attested | adopted | Устраняет self-reference, не позволяя менять selection catalog после review | synthesis; final council review |
| D-033 | Любое изменение code/tests/config/knowledge/purpose инвалидирует attestations; повторные gates батчатся внутри review- и E2E-loops | adopted | Один итоговый snapshot получает все подтверждения без бессмысленного cross-review каждого мелкого E2E-fix | user correction; final council review |
| D-034 | Knowledge-only изменения сохраняют E2E attestation | rejected | Dual behavioral/knowledge revisions сложнее и ослабляют строгий процесс | premortem-kimi alternative |
| D-035 | Local `make qc` — обязательный authoritative gate; CI не требуется | adopted | Workflow должен полноценно работать без CI через project-owned интерфейс | user correction |
| D-036 | Pre-commit быстрый и опциональный; pre-push/CI дублируют full QC | adopted | Частые agent commits не должны провоцировать `--no-verify` | fable/r2; user interview |
| D-037 | Skill задаёт Python QC best practices: Ruff, type policy, pytest, Import Linter, purpose/knowledge/code-health checks | adopted | Конкретный набор адаптируется к проекту и реализуется через его Makefile | user correction; gpt/r2 |
| D-038 | Непроектные helper scripts skills пишутся на TS и компилируются в dependency-free JS | adopted | Переносимый bundle не должен тащить runtime npm install; project QC сюда не входит | user interview; user correction |
| D-039 | Bundled language-specific QC/AST adapter | rejected | Реализация lint/test/build принадлежит проекту и вызывается через Makefile | user correction |
| D-040 | Code health thresholds project-configurable в `pyproject.toml` | adopted | Универсальные числа не подходят всем Python-проектам | user interview |
| D-041 | Brownfield использует structural ratchet, но не purpose baseline | adopted | Старые метрики можно заморозить; причинная документация — hard constraint | gpt/r2; user interview |
| D-042 | Graph gate требует boundary membership, запрещает новые SCC/cycles и ratchet edges/fan | adopted | LOC/complexity не ловят связанность и cascade-change cost | premortem-gpt |
| D-043 | Brownfield adoption идёт dependency-closed roots через manifest | adopted | Делает 100% purpose выполнимым по проверяемым этапам | premortem-gpt |
| D-044 | Risk-based purpose вместо all-symbol purpose | rejected under current constraints | Снижает cargo cult, но прямо нарушает hard decision пользователя | all judges dissent |
| D-045 | Review rubric обязателен, порядок анализа свободный | adopted | Конкретные lenses дают стабильнее результаты без микроменеджмента модели | user interview |
| D-046 | Finding обязан иметь severity, evidence и basis; все реальные defects включая minor исправляются | adopted | Это отделяет дефект от вкуса и предотвращает тихий debt | user interview |
| D-047 | После двух rebuttal cycles возможен fresh technical adjudicator | adopted | Оркестратор не должен разрешать code-heavy спор вслепую | gpt/r2; fable/r2 |
| D-048 | Лимит review/E2E alternations и автоматическая эскалация churn пользователю | rejected | Циклы продолжаются сколько нужно; пользователь сам запрашивает статус | user correction; fable alternative |
| D-049 | Перед первым review выполняется короткий smoke preflight tester | adopted | Не тратить два reviews на продукт, который не собирается или не стартует | kimi/r1 |
| D-050 | Первый heavy E2E начинается после PASS обоих reviewers | adopted | Полный E2E на сырой реализации слишком дорог; дальнейшие review/E2E идут отдельными stabilization loops | user interview; user correction |
| D-051 | Полный архитектурный аудит проекта и stale feature flags вне scope | adopted | Это отдельный инструмент, а feature workflow содержит только local gates | user interview |
| D-052 | Debt в scope исправляется; старый внешний debt идёт в `docs/todo.md` | adopted | Не расширять spec, но не терять реальную проблему | user interview |
| D-053 | Agent commits locally; push/PR только по просьбе пользователя | adopted | Git sharing остаётся человеческим действием | user interview |
| D-054 | Project не pin'ит и не проверяет skill version | adopted | Пользователь управляет установкой; поломка эскалируется | user interview |
| D-055 | Herdr и Omnigent остаются backend alternatives | adopted | Методология зависит от capability contract, не бренда | user interview |
| D-056 | Default backend выбирается после capability suite | deferred | Реальные возможности и семантика меняются по версиям | web verification; premortem |
| D-057 | PHP/JS adapters | deferred | Сначала нужен concrete Python path, остальные языки проектируются отдельно | user interview |
| D-058 | Точные context/cache/code-health thresholds | deferred | Требуют измерения на реальных проектах и подписках | my-opinion; all proposals |
| D-059 | Gate cycle использует единый content snapshot; dual behavioral/semantic digest не вводится | adopted | Оба review завершаются до heavy E2E, а semantic writes после E2E запрещены; E2E-инвалидация нужна только после реального исправления | lifecycle approval; premortem-fable alternative |
| D-060 | Ослабление QC-конфига или baseline относительно `baseRevision` требует решения пользователя | adopted | Executor не должен иметь возможность незаметно ослабить контролирующий его gate | premortem-fable; lifecycle approval |
| D-061 | Только открытые findings временно сохраняются во внешнем run-state | adopted | Это переживает смерть оркестратора, не создавая project ledger или cross-feature архив | premortem-fable; lifecycle approval |
| D-062 | При retirement требования распределяются по подходящим слоям `§B → §A → §M → symbol` | adopted | Спека может менять не только бизнес-истину, но и архитектурные или локальные инварианты | user correction; premortem-fable |
| D-063 | Отдельный completion report не создаётся | adopted | Человек читает knowledge-файлы или обычный Git diff; дополнительный артефакт не нужен | user correction |
| D-064 | Все непроектные настройки и runtime artifacts хранятся под `~/.meta-o/projects/<readable-path>--<path-hash>/` | adopted | Любой проект работает без служебных файлов и изменений `.gitignore`, а skills восстанавливают state по canonical absolute path | user correction |
| D-065 | Бизнес-уровень хранится в одном `docs/knowledge/business.md`, glossary обязателен | adopted | Человек должен иметь возможность гарантированно прочитать всю верхнюю истину и единый словарь | user correction |
| D-066 | Tracked `Makefile` является контрактом lint/test/build/QC; оркестратор проверяет его на preflight | adopted | Методология задаёт интерфейс и best practices, а конкретный toolchain остаётся частью проекта | user correction |
| D-067 | Project ModelSet хранится в `~/.meta-o/projects/<project-key>/settings.json` | adopted | Набор должен восстанавливаться детерминированно по пути проекта и не попадать в репозиторий | user correction |
| D-068 | `docs/architecture/e2e.md` обязателен; оркестратор предлагает создать/настроить его при отсутствии | adopted | E2E tester должен иметь project-owned инструкции по environment, сценариям и cleanup | user correction |
| D-069 | Reviewer обязан приложить рекомендуемый оптимальный способ исправления к finding | adopted | Это сокращает дополнительные turns, сохраняя право executor выбрать лучшее аргументированное решение | user correction |
| D-070 | Review-fix и E2E-fix — отдельные stabilization loops без взаимного перезапуска после каждого мелкого fix | adopted | Сначала стабилизируется текущий контур; другой повторяется только для итогового изменённого snapshot | user correction |
| D-071 | Число review/E2E cycles не ограничивается и само по себе не эскалируется пользователю | adopted | Пользователь сам решает, когда запросить объяснение длительности | user correction |
| D-072 | Gates исполняются на clean candidate commit в отдельных detached worktrees | adopted | Результат нельзя случайно получить на разных или мутировавших рабочих деревьях | final council review |
| D-073 | E2E tester формирует selection plan до reviews, а оба reviewers проверяют его полноту | adopted | Иначе реализация может пройти reviews и неполный набор сценариев | final council review |
| D-074 | В каждом проекте есть минимум один `always_required` E2E scenario | adopted | Изменения без очевидных business links всё равно получают поведенческий canary | final council review |
| D-075 | External run-state имеет короткий per-run writer lock и одну write-ahead `PendingOperation`, но не project-wide serialization | adopted | Crash recovery не должен превращаться в собственную очередь или мешать обычным параллельным branches | final council review |
| D-076 | Finding закрывает reviewer/replacement/adjudicator, executor только предлагает fix | adopted | Самоаттестация исполнителя не доказывает устранение исходной проблемы | final council review |
| D-077 | Project-owned QC manifest и внешний result обязательны для защиты от false-green `make qc` | adopted | Один exit code не доказывает, что все обязательные gates реально исполнялись | final council review |
| D-078 | Watchdog восстанавливает только через `status/read/reconcile`, будит живого orchestrator или создаёт fresh после terminal | adopted | Он не должен напрямую управлять workers или дублировать backend control plane | final council review |
| D-079 | Project-wide locks, mandatory tags/receipts и separate completion report отвергнуты | rejected | Они усложняют обычный Git/PR и создают новые артефакты без утверждённой пользы | user decisions; final council review |
| D-080 | Skill delivery — manifests/prompts плюс dependency-free JS helpers; install/update остаются выбором пользователя | adopted | Методология переносима и не внедряет скрытый package/runtime lifecycle в проекты | user interview; final council review |


## 21. Open Questions

Ниже перечислены только вопросы, которые разрешаются эмпирически или в будущих
language/backend подспеках. Они не блокируют реализацию core workflow.

1. Какой backend — Herdr или Omnigent — станет default после повторяемой
   capability suite на актуальных версиях.
2. Какие стартовые thresholds code health оптимальны для конкретного Python
   проекта после первого adoption run.
3. Какие context/cache thresholds фактически доступны выбранным CLI и моделям.
4. Какие Makefile/QC profiles нужны для PHP и JavaScript/TypeScript проектов.
5. Нужно ли пользователю сохранять external feature-spec вне project search
   scope; core workflow не создаёт такой архив автоматически.

## 22. Implementation decomposition

Нормативный документ должен быть механически разложен без новых архитектурных
решений на шесть файлов реализации:

1. `00-master-workflow.md` — preflight, FSM, snapshot attestation, completion,
   cleanup и error states.
2. `10-knowledge-layer.md` — `§B → §A → §M → symbol`, retirement, purpose,
   glossary, debt и project E2E knowledge.
3. `20-orchestration-and-skills.md` — role contracts, external state,
   project-key resolution, sessions, model set и backend adapters.
4. `30-review-e2e.md` — finding schema, review stabilization, adjudication,
   E2E stabilization и `e2e.json`.
5. `40-local-qc-python.md` — Makefile contract, Python best practices,
   structural ratchet и adoption.
6. `50-watchdog.md` — optional multi-project deterministic watchdog.

Каждая подспека обязана повторить применимые hard requirements, определить
входы/выходы и failure states и ссылаться на master invariants. Дублирование
нормативных правил между подспеками разрешено только вместе с ссылкой на
master-section; при конфликте master имеет приоритет.

## 23. Acceptance criteria документа

Спецификация готова к реализации, когда:

- все adopted decisions присутствуют в нормативных разделах;
- rejected/deferred решения перечислены явно;
- нет `TBD` вне Open Questions;
- lifecycle можно восстановить из external state после смерти оркестратора;
- один snapshot может доказуемо получить QC, два review и E2E attestations;
- ни один служебный runtime artifact не требуется добавлять в project Git;
- project-owned Makefile и E2E contract остаются обязательными;
- каждый implementation task выводится из одной из шести подспек без нового
  продуктового или архитектурного решения.

## 24. Council audit status

Spec-review достиг лимита трёх раундов без формальной сходимости. Fable дал
`8/10, would_adopt=true`, GPT-5.6 Sol — `7/10, would_adopt=false`, финальный
turn Kimi завершился provider error. Это оценки автоматически изменявшегося
рабочего `spec-review.md`, а не утверждение exact bytes текущего документа.

После ceiling master-spec вручную пересобрана из пользовательских hard decisions
и применимых findings. В частности, приняты isolated gate worktrees, E2E plan
до reviews, field-level metadata digest, write-ahead pending operation,
reviewer-confirmed finding closure, QC manifest и conformance fixtures.
Отвергнуты предложенные рабочим draft project-wide serialization, mandatory Git
tags/receipts и отдельный completion report. Финальный gate принадлежит
пользователю.

```json
{
  "council_mode": "full",
  "spec_review_run_id": "run-877f80fb",
  "rounds": 3,
  "formal_convergence": false,
  "round_3": {
    "fable51mxhigh": {"approval_score": 8, "would_adopt": true},
    "gpt56solxhigh": {"approval_score": 7, "would_adopt": false},
    "kimik3reasoning": {"status": "provider_error", "error": "fetch failed"}
  },
  "finalization": "manual_reconciliation_after_round_ceiling",
  "user_final_approval_required": true
}
```
