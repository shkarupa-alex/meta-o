## Итог

Спецификация стала существенно сильнее: exact-commit attestation, immutable detached worktrees, verification-plan binding и crash-safe `EffectIntent` исправляют главные архитектурные дефекты прошлой версии. Но принимать её как implementation-ready ещё рано. Сейчас это качественный master-design, а не полный комплект исполнимых контрактов.

Главные блокеры: отсутствуют сами пять подспек; verification receipt не выполняет исходный командный/per-scenario контракт; не завершены FSM recovery/cancellation semantics; QC, knowledge checks, watchdog и adapter contracts всё ещё требуют самостоятельного проектирования исполнителем.

## Facts & Constraints — White Hat

Технически реализуемы и хорошо определены:

- Attestation полного commit SHA без исключения tracked-файлов.
- Вычисление `treeOid` до commit через staged tree и отсутствие циклического hash при binding verification plan.
- Fresh detached worktree для каждого gate.
- Atomic external state с `fsync → rename → fsync(parent)`.
- Bounded write-ahead intent без полноценной очереди или session database.
- Запрет backend при отсутствии доказуемой correlation/idempotency.
- Static `e2e.json` и внешний completion receipt как способ избежать self-reference.

Однако есть фактические ограничения:

1. Git не имеет единого repository-wide `HEAD`: каждый worktree имеет собственный `HEAD`. Требование «Repository HEAD после completion обязан оставаться R» несовместимо с dedicated executor worktree, который затем удаляется. Основной checkout пользователя может вообще не видеть R.

2. External receipt в `~/.meta-o` привязан к абсолютному пути и компьютеру. Участник команды на другой машине не получает сохранённый verification state через обычный Git/PR workflow.

3. Receipt не сохраняет требуемую исходной задачей связь на уровне сценария. В нём есть отдельные массивы `selected_scenarios` и `business_links`, но нельзя установить:

   - какой business anchor относится к какому сценарию;
   - индивидуальный статус сценария;
   - индивидуальную дату проверки.

4. Backend contract фактически строже большинства CLI: нужны replayable cursor, correlation lookup, idempotent send или доказательство недоставки. Это допустимо, но capability suite вполне может признать и Herdr, и Omnigent unsupported. Спецификация честно fail-closed, однако жизнеспособность workflow остаётся эмпирически недоказанной.

## Risks & Failure Modes — Black Hat

### 1. Недолговечная проверочная история

Receipt удаляет слишком много данных из `E2EResult`. После cleanup нельзя восстановить минимальный требуемый verification state для каждого сценария. Кроме того, receipt — изменяемый локальный JSON, а не переносимая или защищённая attestation.

Требуемое исправление: хранить в receipt массив:

`{ scenarioId, businessLinks, status, verifiedAt, environmentFingerprint }`

с общей exact revision. Для командного workflow нужен нормативный способ экспорта receipt без изменения R, например annotated tag или отдельный Git ref, создаваемый только при разрешённом push.

### 2. Finding удаляется раньше подтверждения исправления

§15 говорит, что finding удаляется «после fix или adjudication». Исполнительское утверждение о fix ещё не закрывает finding. Если reviewer session погибла, fresh reviewer потеряет исходное доказательство и ожидаемый результат исправления.

Нужен lifecycle:

`open → fix_proposed → reviewer_verified → closed/deleted`

Adjudication должна аналогично фиксировать финальный disposition до удаления.

### 3. Незавершённая FSM

Нет полных переходов для:

- `SPEC_MUTATED`;
- пользовательской отмены;
- cleanup stopped/abandoned run;
- `blocked` E2E из-за инфраструктуры;
- исчерпания tooling/backend alternatives;
- failed session stop;
- потери branch/ref при cleanup;
- resume из каждого `PAUSED_*`;
- повреждённого receipt при наличии `COMPLETE`.

`blocked` E2E сейчас направляется к executor как исправляемый дефект, хотя причиной могут быть quota, отсутствующий credential или внешний outage.

### 4. Эфемерные роли не представлены в state

`Role` включает только четыре основные роли. Поэтому `reuseResearcher` и `technicalAdjudicator` нельзя представить в `SessionRef`, `EffectIntent`, generation fencing и recovery. Их crash-safe lifecycle остаётся неопределённым.

### 5. Branch lifecycle противоречив

Создаётся `meta-o/<run-id>`, worktree удаляется, но судьба branch ref не указана. Если ref удалить, commit может стать dangling и позднее попасть под GC. Если оставить — это должно быть нормативно указано. Требование про `HEAD` следует заменить требованием о сохранении конкретного ref или явной передаче SHA пользователю.

### 6. False-green QC остаётся возможным

Executor может изменить `Makefile`, checker или graph script так, чтобы `make qc` завершался с `0`. Сравнение thresholds с `baseRevision` не доказывает, что проверки действительно запускались. Review снижает риск, но mechanical authoritative gate остаётся самоконтролируемым.

Нужны:

- machine-readable QC manifest/result;
- обязательные gate IDs;
- сравнение состава gates с base revision;
- запрет удаления обязательного gate без пользовательского решения;
- reference implementation Python checks либо точный алгоритмический контракт.

### 7. Security contracts неполны

Не определены:

- URL scheme allowlist, redirect policy, максимальный размер и timeout загрузки spec;
- защита credentials и production endpoints в E2E;
- политика передачи proprietary code cross-vendor reviewer;
- безопасные пределы evidence/findings/decision files;
- integrity model receipt;
- точная проверка путей при worktree cleanup.

### 8. Неограниченные циклы без operational guardrail

Hard constraint запрещает автоматическую эскалацию churn по числу циклов, но это не требует отсутствия наблюдаемости. Сейчас нет обязательных метрик churn, repeated-finding detection или deterministic status summary. Workflow может бесконечно расходовать ресурсы, не нарушая FSM.

Совместимое улучшение: не останавливать автоматически, но сохранять compact counters и уведомлять без запроса решения.

## Strengths & Benefits — Yellow Hat

Особенно удачны:

- Полное возвращение к exact Git revision вместо content-equivalence.
- Отсутствие исключений из tracked tree.
- Static scenario registry и binding выбранного плана через commit trailer.
- Независимая проверка plan reviewers до E2E.
- Fresh checkout и pre/post revision proof для каждого gate.
- Чёткий запрет stale results.
- Crash window backend side effects признан и закрыт bounded intent.
- Fail-closed поведение при неопределённости backend.
- Knowledge sync и retirement до review.
- Независимость reviewers сохранена.
- Brownfield adoption отделена от обычных feature.
- Graph health включает SCC, boundaries и ratchet, а не только LOC.
- CI остаётся необязательным, локальный QC — самостоятельным gate.
- Dissent честно отделяет hard constraints от спорных решений.

Это уже архитектурно цельная модель, а не набор prompt-рекомендаций.

## Alternatives & Creative Ideas — Green Hat

### Совместимые с hard constraints улучшения

- Verification sharing: annotated tag или namespaced Git ref, указывающий на R и содержащий receipt. Tree R не меняется, push остаётся отдельным пользовательским действием. Цена — дополнительные refs и правила их доставки.
- QC: project-owned reference checker scaffold, вызываемый через `make qc`, с зафиксированным machine contract. Цена — сопровождение Python reference implementation.
- Watchdog: полностью детерминированная FSM с fake-clock tests; local model используется только для advisory classification. Цена — больше формальных состояний.
- Business knowledge: сохранить единый `business.md`, но добавить размерный budget, стабильный индекс и правила разделения крупных architecture domains.
- Findings: хранить их до reviewer verification, затем немедленно удалять. Это сохраняет запрет cross-feature ledger.
- Backend: явно позволить deterministic replacement вместо resume только при доказуемом fencing старой generation.

### Альтернативы, нарушающие исходные решения, но заслуживающие рассмотрения

- Tracked verification commit после R. Он делает состояние переносимым обычным Git, но создаёт dual-revision semantics и нарушает запрет post-attestation writes.
- Небольшой durable event log вместо одного `EffectIntent`. Recovery становится проще и проверяемее, но это уже приближается к собственному control layer.
- Risk-based purpose вместо all-symbol purpose. Сильно уменьшает cargo-cult documentation, но прямо нарушает hard constraint.
- Центральный versioned QC bundle. Повышает единообразие и защищает от self-disable, но нарушает project-owned/tool-version policy.

## Completeness & Process — Blue Hat

### Traceability

Decision Ledger существует и подробен, но не полностью синхронизирован с нормативным телом.

Adopted entries, отсутствующие либо недостаточно представленные в body:

- `D-038`: TS → dependency-free JS helpers есть только в ledger.
- `D-051`: global architecture audit outside scope есть только в ledger.
- `D-053`: запрет push/PR без отдельной просьбы не закреплён нормативно.
- `D-054`: project не pin/check skill version не закреплено нормативно.
- `D-024`: `KnowledgeImpactPlan` упомянут, но отсутствует в `RunState` и не имеет schema.
- `D-063`: отсутствие repository completion report выводится косвенно, но не сформулировано как запрет.

Rejected entries, не перечисленные явно в §22:

- `D-029`: full cold archive external specs;
- `D-034`: сохранение E2E attestation после knowledge-only change;
- `D-044`: risk-based purpose;
- `D-048`: limit/automatic escalation alternations.

`D-058` отмечает thresholds deferred, но §19 уже задаёт `55/65/75%`; нужно разделить normative defaults и empirical hypotheses.

### Decomposition Readiness

Основной delivery-критерий не выполнен: представлены обещания шести файлов, но не сами implementation-ready подспеки.

Исполнитель будет вынужден принимать новые архитектурные решения в:

- anchor/docstring grammar;
- adoption manifest schema;
- Python AST traversal;
- import graph и baseline format;
- skill inventory и envelopes;
- lock implementation;
- backend capability tests;
- watchdog configuration и service integration;
- receipt export;
- full pause/cancel/recovery FSM.

Следовательно, §27 — decomposition outline, а не decomposition result.

### Weak-Model Executability

Менее сильная модель не сможет реализовать систему без догадок.

Не определены типы:

- `DecisionOption`;
- `Evidence`;
- `AdapterCapabilities`;
- `SpawnRequest`;
- `DeliveryResult`;
- `SessionStatus`;
- `SessionOutput`;
- `EffectStatus`;
- `ExpectedState`;
- `WaitResult`.

Не хватает:

- `KnowledgeImpactPlan` schema;
- adjudicator/researcher envelopes;
- finding resolution schema;
- output cursor ordering rules;
- lock timeout и platform algorithm;
- stall deadline;
- retry/backoff policy;
- canonical JSON Unicode/duplicate rules;
- environment fingerprint fields;
- artifact digest mapping;
- complete transition table для paused/terminal states.

### Contract Completeness

TBD-подобные пробелы вне Open Questions:

- stall deadline не имеет default или config key;
- `owner.lock` semantics не имеют executable contract;
- no cancellation/abandonment state;
- no branch retention contract;
- no per-scenario receipt result;
- no schema migrations;
- no URL-fetch contract;
- no size limits, кроме handoff;
- no Python baseline schema;
- no boundary declaration schema;
- no watchdog config schema/poll schedule;
- no install/update commands и skill layout;
- no model identity verification algorithm;
- no handling detached commits and Git GC.

### Test coverage

Crash-window adapter tests — сильная часть, но недостаточная для всей системы. Нужны executable cases для:

- atomic state corruption и takeover;
- stale orchestrator fencing;
- plan/trailer tampering;
- odd Git paths, symlinks, modes и submodules;
- branch/worktree cleanup;
- receipt crash recovery;
- per-scenario verification persistence;
- finding lifecycle;
- false-green Makefile/QC modification;
- anchor and purpose parsers;
- graph baseline ratchet;
- E2E infrastructure-blocked routing;
- watchdog fake clock/quota wake;
- spec URL security;
- schema-version rejection/migration;
- full workflow golden path и каждый terminal/pause path.

## Рекомендация

Сохранить текущую архитектурную основу, но не начинать реализацию runtime adapters до выпуска самих пяти подспек. В первую очередь следует закрыть четыре контракта: durable per-scenario verification, branch/ref lifecycle, complete FSM including cancellation/recovery и machine-verifiable QC composition.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "Переработанная версия исправляет главные архитектурные ошибки: attestation теперь относится к одному полному commit SHA, все tracked-файлы входят в revision, gates работают в fresh detached worktrees, verification plan связан с commit, а backend side effects имеют bounded crash journal. Однако документ остаётся сильным master-design, а не implementation-ready поставкой: отсутствуют сами пять подспек, внешний receipt не сохраняет требуемый per-scenario и командно переносимый verification state, lifecycle branch/finding/cancellation неполон, а QC, knowledge, watchdog и adapter contracts всё ещё требуют новых архитектурных решений от исполнителя.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "Delivery and decomposition",
          "description": "Вместо пяти implementation-ready подспек дан только перечень того, что они в будущем обязаны определить.",
          "required_change": "Предоставить все шесть нормативных файлов со schemas, commands, algorithms, failure states и executable acceptance cases."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Verification state",
          "description": "Receipt теряет индивидуальные scenario status/date/business mappings и недоступен другим участникам команды через обычный Git workflow.",
          "required_change": "Хранить per-scenario records и определить переносимый export, не изменяющий attested commit, например annotated tag или namespaced Git ref."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Git lifecycle",
          "description": "Требование сохранить repository HEAD на R некорректно для multi-worktree Git, а retention рабочей branch/ref после удаления executor worktree не определён.",
          "required_change": "Заменить HEAD-инвариант точным branch/ref contract и определить retention, cleanup, GC protection и handoff commit SHA."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Review recovery",
          "description": "Finding удаляется после заявленного fix до reviewer verification; fresh reviewer после сбоя теряет исходное доказательство.",
          "required_change": "Ввести lifecycle open, fix_proposed, reviewer_verified, closed и удалять finding только после verification или окончательного adjudication."
        },
        {
          "id": "",
          "severity": "major",
          "area": "FSM and recovery",
          "description": "Нет полных переходов для cancellation, SPEC_MUTATED, stopped-run cleanup, infrastructure-blocked E2E, failed stop и resume каждого PAUSED state.",
          "required_change": "Добавить исчерпывающую transition table с entry guards, side effects, resume conditions и terminal cleanup."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Local QC",
          "description": "Project-owned Makefile и checker могут быть ослаблены до ложного PASS; состав обязательных gates и baseline algorithms не имеет machine-readable контракта.",
          "required_change": "Определить QC manifest/result schema, обязательные gate IDs, base-revision comparison и concrete Python reference algorithms."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Knowledge layer",
          "description": "Отсутствуют schemas и algorithms для KnowledgeImpactPlan, anchors, native purpose parsing, generated exceptions и adoption manifest.",
          "required_change": "Зафиксировать grammar, schemas, Python AST semantics и executable conformance fixtures."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Orchestration contracts",
          "description": "Эфемерные роли не представлены в Role/SessionRef, многие adapter types не определены, а stall deadline, locking и cursor ordering остаются расплывчатыми.",
          "required_change": "Завершить type contracts, role union, lock/fencing algorithm, deadline configuration и replay semantics."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Watchdog",
          "description": "Watchdog описан как набор свойств, но отсутствуют требуемое сравнение deterministic/local/hybrid, config schema, timing, sanitization и executable service contracts.",
          "required_change": "Выпустить полноценную watchdog подспеку с state machine, config, launchd/systemd units и fake-clock tests."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Traceability",
          "description": "Несколько adopted/rejected решений присутствуют только в ledger или dissent, но не в соответствующих нормативных разделах.",
          "required_change": "Синхронизировать D-024, D-029, D-034, D-038, D-044, D-048, D-051, D-053 и D-054 с body и Rejected/Deferred."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Security",
          "description": "Не определены URL-fetch policy, cross-vendor data policy, E2E production guards и integrity model receipt.",
          "required_change": "Добавить security boundaries и negative acceptance tests."
        }
      ],
      "assumptions": [
        "Оценивался только приведённый документ; отдельные подспеки считаются отсутствующими, поскольку их содержимое не предоставлено.",
        "External receipt должен удовлетворять исходному требованию долговечного командного verification state, а не быть только локальным recovery marker.",
        "Backend capability suite ещё не доказала пригодность актуальных Herdr и Omnigent.",
        "Advisory locking поддерживается только на локальной файловой системе, как заявлено в assumptions."
      ],
      "round": 2,
      "reviewer": "gpt56solxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
