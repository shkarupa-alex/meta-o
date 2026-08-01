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