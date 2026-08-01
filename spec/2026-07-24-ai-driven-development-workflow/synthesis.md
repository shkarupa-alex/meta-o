# Council synthesis: AI-driven development workflow

## Статус Delphi

Формальной конвергенции за три раунда нет.

- Proposal GPT-5.6-Sol: средняя оценка `7.3`, приняли `2/3`.
- Proposal Fable 5: средняя оценка `5.3`, принял `1/3`.
- Proposal Kimi K3: автор выбыл на последнем refinement из-за `fetch failed`;
  последняя целая версия сохранена, Kimi продолжил работу как reviewer.

Синтез использует GPT-proposal как наиболее полный каркас, забирает у Fable
явную идемпотентность, cycle escalation и spec digest, а у Kimi — маленький
runtime state, smoke preflight и минималистичную knowledge-структуру. Найденные
ревьюерами противоречия исправлены ниже, а не перенесены в будущую спеку.

## 1. Системная формула

```text
immutable feature spec
  → optional reuse scan
  → executor implementation + knowledge sync + local commits
  → authoritative local QC
  → stabilize two independent reviews on content revision R
  → stabilize all E2E scenarios on R
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

Нужны master-spec и пять implementation-ready подспек:

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

При пользовательском `start` и `resume` сохранённый set показывается и требует
подтверждения. Автоматический retry, quota wake и session replacement используют
уже подтверждённый set без остановки ради повторного вопроса.

Project-specific `ModelSet` хранится в
`~/.meta-o/projects/<project-key>/settings.json`. Глобальный config может дать
default для нового проекта, но после первого подтверждения проект использует
собственный сохранённый набор.

## 4. Вход и immutable spec

```ts
interface FeatureSpecRef {
  locator: string; // repo path, absolute path or URL
  kind: "tracked" | "local" | "url";
  sha256: string;
  disposition: "delete_after_sync" | "external";
}
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

Изменение исходного locator не меняет oracle; расхождение digest фиксируется как
`SPEC_MUTATED` и требует нового run либо решения пользователя.

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

Корень проекта определяется через Git, приводится к абсолютному `realpath`, а
`project-key` вычисляется детерминированно:

```text
<absolute-path-with-separators-replaced-by-dashes>--<sha256(realpath)[0:12]>
```

Читаемая часть делает каталог узнаваемым, hash устраняет коллизии путей вроде
`/a-b/c` и `/a/b-c`. `project.json` хранит canonical path и schema version для
проверки разрешения. Каталог `~/.meta-o` создаётся с правами `0700`, state-файлы
— `0600`.

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
interface RunState {
  runId: string;
  phase: Phase;
  stateVersion: number;
  orchestratorGeneration: number;
  spec: FeatureSpecRef;
  specBlob: string;
  baseRevision: string;
  contentRevision?: string;
  modelSet: ModelSet;
  sessions: Partial<Record<Role, SessionRef>>;
  sessionGeneration: Partial<Record<Role, number>>;
  decisions: DecisionRecord[];
  confirmations: {
    qc?: RevisionResult;
    reviewerPrimary?: RevisionResult;
    reviewerCrossVendor?: RevisionResult;
    e2e?: RevisionResult;
  };
  openFindings?: Partial<Record<"reviewerPrimary" | "reviewerCrossVendor" | "e2e",
    Finding[]>>;
  paused?: PauseState;
  updatedAt: string;
}
```

Запись выполняется `tmp → fsync → rename` после каждого transition. Backend
остаётся владельцем session lifecycle, native resume и событий.

Опциональный executor handoff — отдельный файл до 4 KiB, выбираемый
пользователем. `state.json` не является этим handoff.

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
  → REATTEST_INVALIDATED_GATE
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
STOPPED_SPEC_IMPOSSIBLE
FAILED_BACKEND
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

Reuse scan — явный стартовый вопрос пользователя, не auto-эвристика. Результат
живёт в decision log. Выбор, затрагивающий business semantics, эскалируется.

Smoke preflight тестировщика перед первым review ограничен сборкой, boot и
health-check. Он не заменяет тяжёлый E2E и предотвращает дорогое review явно
неподнимающегося продукта.

## 7. Решения и эскалации

Executor не меняет spec. Он отправляет:

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

Рекомендуемый публичный target contract:

```text
make format       # mutating formatter, если применимо
make lint         # non-mutating static checks
make typecheck    # если язык/проект использует type checker
make test
make build        # если у проекта есть build/package step
make smoke
make e2e          # если автоматизированный E2E применим
make qc           # non-mutating aggregate обязательных локальных gates
```

Отдельные targets могут отсутствовать, если операция неприменима, но `make qc`
обязателен и агрегирует все релевантные blocking checks.

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

Стартовые значения, обязательно изменяемые проектом в `pyproject.toml`:

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

| Gate | Назначение |
|---|---|
| pre-commit | Опциональный быстрый format/basic lint |
| `make qc` | Обязательный full-repository gate |
| pre-push | Опциональный полный дубль |
| CI | Необязательный дубль |

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
interface Finding {
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
```

Все подтверждённые defects и engineering risks, включая minor, исправляются.
Не блокирует только доказанный taste. Reviewer обязан предложить ожидаемый
оптимальный способ исправления, чтобы executor не тратил отдельный turn на
восстановление замысла finding; рекомендация не является обязательной, и
executor может аргументированно выбрать лучшее решение.

Findings передаются исполнителю максимально близко к исходному виду и не
записываются в отдельный project ledger. Пока finding открыт, его исходный текст
временно хранится во внешнем run-state, чтобы смерть оркестратора не требовала
повторного review. После исправления или adjudication запись удаляется; между
features findings не сохраняются.

После двух безрезультатных rebuttal cycles оркестратор может вызвать fresh
technical adjudicator, но не эскалирует review churn пользователю автоматически.
Отвергнутый подозрительный trade-off получает code rationale; taste — нет.

## 12. E2E и snapshot semantics

Первый heavy E2E начинается только после PASS обоих независимых reviewers на
одном snapshot. Оба review можно выполнять параллельно, если backend это
поддерживает; их findings друг другу не раскрываются.

Candidate snapshot `S` должен последовательно получить:

```text
QC(S) PASS
Reviewer A(S) PASS
Reviewer B(S) PASS
E2E(S) PASS
```

`S` идентифицируется не commit SHA, а стабильным `snapshot_digest`: hash
отсортированного списка `path + mode + Git blob OID` для всех tracked files,
кроме единственного bookkeeping-файла
`docs/architecture/e2e.json`. Commit SHA сохраняется только как provenance.
Поэтому rebase/squash не инвалидирует подтверждение при бит-в-бит идентичном
содержимом.

Любое изменение executable code, tests, configs, business/architecture
knowledge, purpose или tracked spec меняет `snapshot_digest` и сбрасывает
подтверждения.

После PASS executor делает строго guarded metadata commit, меняющий только
`docs/architecture/e2e.json`. Запись содержит `snapshot_digest: S`,
provenance commit и compact origin mapping:

```json
{
  "scenario_id": "E2E-CHECKOUT-01",
  "scenario_ref": "docs/architecture/e2e.md#e2e-checkout-01",
  "business_links": ["§B-CHECKOUT-01"],
  "snapshot_digest": "<S>",
  "provenance_commit": "<commit-at-verification>",
  "origin": {
    "run_id": "<run-id>",
    "spec_sha256": "<spec-digest>"
  },
  "verified_at": "2026-07-24T18:20:00Z",
  "status": "passed",
  "environment": "local:docker-compose"
}
```

Completion attests `S`; repository HEAD может включать bookkeeping commit.
Guard повторно вычисляет `S` с исключением verification registry. Любое другое
изменение меняет digest и требует нового full cycle.

Альтернатива, если команда считает dual-revision semantics слишком сложной:
держать verification registry во внешнем durable state. Git notes отвергнуты
как плохо обнаруживаемые агентами и ненадёжно переносимые обычным clone/push.

## 13. Backend adapters

Core использует capability contract, но не предполагает поддержку capability:

```ts
interface SessionAdapter {
  capabilities(): AdapterCapabilities;
  spawn(request: SpawnRequest): SessionRef;
  send(session: SessionRef, message: string): DeliveryResult;
  status(session: SessionRef): SessionStatus;
  read(session: SessionRef, cursor?: string): SessionOutput;
  wait(session: SessionRef, expected: ExpectedState): WaitResult;
  resume(session: SessionRef): SessionRef;
  stop(session: SessionRef): void;
}
```

Adapter skill не реализует durable queue, local dedup ledger или session DB.
Если backend не даёт native idempotency, повторная отправка запрещена, пока
`status/read` не докажут terminal state. Неопределённость эскалируется или
разрешается созданием fresh session с новой generation.

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

## 14. Context policy

Оркестратор получает только bounded structured results и evidence references.
Он не принимает полные logs, transcripts или diffs.

Состояние на диске обновляется после каждого transition, поэтому свежая
orchestrator session восстанавливается из `state.json`, immutable spec и
backend status, а не из narrative summary.

При доступной telemetry используются warning/rotation thresholds `55/65/75%`.
Без telemetry оркестратор ведёт консервативный byte counter и просит
пользовательский resume свежей session до предполагаемой compaction.

Неожиданную compaction нельзя считать надёжно обнаруживаемой без capability
backend. Поэтому она остаётся известным residual risk; методология не притворяется
exactly-once control plane.

Worker sessions заменяются свежими при loss, длинной холодной паузе или
невыгодном rewarm. Default `100k` cold-resume threshold — калибруемая гипотеза,
не универсальный закон.

## 15. Watchdog

Watchdog опционален и включается пользователем. Один процесс обслуживает
несколько projects/runs.

Default — deterministic standalone `watchdog.mjs`; локальная модель может
только классифицировать санитизированный tail в закрытый enum и никогда не
генерирует команды.

Watchdog:

- poll/wait backend state;
- обнаруживает завершённый turn без реакции;
- классифицирует transient/quota/external/unknown;
- после quota reset вызывает adapter reconcile;
- не отправляет слепой `continue`;
- не меняет FSM самостоятельно;
- защищён single-instance lock;
- запускается через launchd/systemd user service.

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
- автоматический reuse scan без стартового выбора пользователя.

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
   всем затронутым domain-файлом. Отдельный completion report не создаётся:
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
   reviewer сравнивает business diff со всем текущим domain file, а
   verification registry хранит compact `anchor/run/spec digest` provenance.
6. External acceptance oracle после cleanup теряется. Полный cold archive
   rejected как нарушение решения удалять старые спеки. Принимается осознанная
   потеря bytes; сохраняются digest, provenance и требования, перенесённые в
   подходящие слои `§B → §A → §M → symbol`, а не только в бизнес-слой.
7. Spec ambiguity может создать очередь эскалаций. Preflight spec validation
   rejected как out of scope и прямое нарушение границы оркестратора.
   Review rubric проверяет misclassification technical/business decisions;
   process writing specs улучшается отдельно.
