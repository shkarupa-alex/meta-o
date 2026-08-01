Раунд 5. Впервые за три доставки тексты реально изменились; proposal-3 выбыло, оцениваю proposal-1 и proposal-2 как новые версии. Все шесть исходных документов у меня в контексте.

## Facts & Constraints (White Hat)

**Верификация исправлений по моим прошлым находкам:**

Proposal-2 закрыл две из четырёх блокирующих находок, причём качественно:
- **Неизменяемость спеки — исправлено:** `spec_digest` (sha256) в `RunState`, вычисляется на INIT, пересчитывается перед REVIEW/E2E и на DONE, несовпадение → `ESCALATED(SPEC_MUTATED)`; роли читают спеку строго на закреплённом digest.
- **Ссылка «один уровень вверх» — исправлено и усилено:** `symbol_requires_link_one_level_up = true` снова, с формальным правилом L4: неявная ссылка через членство, если модуль отображён ровно на один `§A-*`; явный `§A-*` обязателен при ≥2 — линтер строит module→{§A-*} map и проверяет. Это элегантнее моего предложения.
- Бонусом: честная модель идемпотентности (key + state-guarded `resend()` вместо одного `turnSeq` — закрыто окно `running`), `ModelSet` ровно из 4 ролей с машинно валидируемыми vendor-инвариантами, orchestrator_model вне набора.

Proposal-1 закрыл накопившийся стратегический пробел и одну находку:
- **Добавлена §5 «Контекстный бюджет оркестратора»** — first-class подсистема: rotation до compaction (55/65/75%), checksummed `OrchestratorCheckpoint`, successor activation protocol, `contextEpoch`, неожиданная compaction инвалидирует полномочия сессии (`PAUSED_ORCHESTRATOR_UNTRUSTED`), narrative summary не является authority. Это прямой ответ на главный страх автора — тот, ради которого proposal-3 предлагало stateless state file.
- **§4.6 исправлено:** «Для каждого review-candidate commit» вместо «после каждого commit» — снято противоречие с decision ledger.

**Не закрыто:**
- P2, порядок завершения: `canComplete()` по-прежнему без worktreeClean; tester пишет `verification-state.json` без определённого коммит-пункта; переход в `DONE` выполняет `миграция decision-log→§A, final knowledge-sync, retire spec` **после** вычисления критерия — post-attestation коммиты с изменениями `§B/§A` без review и без guard.
- P2, carve-out doc-only по-прежнему не подключён к FSM (нет актора cheap re-review).
- P2, `code_globs = ["src/**/*.py"]` — tests/ по-прежнему вне purpose/health.
- P2, `anchor-check --gate done` ищет `§*-TODO-*` в `code_globs` (TODO-якоря живут в `docs/`).
- P1, knowledge-lint: правила «spec retirement» и «чистота docs/todo.md» (§11.6) фазово-зависимы, линтер stateless — механизм не определён.

## Risks & Failure Modes (Black Hat)

**P2 (блокирующее, сохраняется):** итоговое состояние репозитория после DONE не аттестовано: миграция решений в `§A` и удаление спеки — tracked-коммиты после последнего review; `§B/§A`-дрейф финальных правок не проверяет никто. Tests/ без purpose — прямое нарушение буквы hard constraint. Отдельно: adapter dedup-ledger при `nativeIdempotency=false` — его персистентность не указана; после reboot оркестратора ledger теряется и защита от дубликата ослабевает (minor).

**P1 (новое, из новой подсистемы):**
1. Ставка на capabilities выросла: теперь обязательны compaction/context-reset detection и `createOrchestratorSuccessor` (или «гарантированная pause-before-compaction»). Если ни Herdr, ни Omnigent не умеют детектить compaction CLI-агента — preflight блокирует оба backend, а компенсация запрещена. Реальность этой возможности не верифицирована — это самая рискованная точка всей методологии.
2. §5.8: неожиданная compaction → сессия «не принимает решений, не отправляет turns» и при этом «создаёт fresh successor» — актор создания не определён; watchdog — опциональная опция, а без него воскрешение после неожиданной compaction не спроектировано (между «не отправляет turns» и «создаёт successor» — противоречие полномочий).
3. Каденс checkpoint не указан: если checkpoint создаётся только на порогах (55/65%), неожиданная compaction на 50% оставляет run без checkpoint → `FAILED_BACKEND`, хотя run state в backend содержит почти всё содержимое checkpoint — дешёвле писать checkpoint на каждый переход состояния.
4. Rotation при долгом outstanding turn: «дождаться или reconcile» — неопределённо; долгий turn executor может протолкнуть бюджет за 75% → hard pause посреди turn.

**P1 (перенесённое, неисправленное):** knowledge-lint фазовая зависимость; `verification-lint.mjs` вне pipeline §14.2; актор metadata-коммита; исполнитель solution-scan; whitelist untracked-спеки; restart после `FAILED_BACKEND`; самоклассификация DecisionRequest; героический масштаб adoption.

## Strengths & Benefits (Yellow Hat)

**P1:** подсистема контекстного бюджета — лучшая в консилиуме по дисциплине: измерение с консервативной оценкой `bytes/2`, bounded ingress с `PAYLOAD_TOO_LARGE`, пороговые действия, checksummed checkpoint (canonical JSON), протокол successor activation со сверкой spec digest/revision/session generations/event cursor, отказ от compaction summary как authority. Это закрывает последний стратегический пробел прошлых версий. Остальное ядро (аттестация, доставка, adjudication, wontfix, missing-tools, review-loop) не деградировало.

**P2:** исправления хирургически точные: `spec_digest` с пересчётом на границах фаз; правило L4 с неявной/явной ссылкой по числу `§A-*` модуля — механически проверяемо и без docstring-шума; честная модель идемпотентности с state-guarded resend; ModelSet ровно 4 роли с валидацией инвариантов при сохранении. Предложение стало заметно ближе к принятию.

## Alternatives & Creative Ideas (Green Hat)

1. P2 добивают два хода: (а) паттерн «sync-before-attestation» из P1 — knowledge sync до финального cross-review, post-attestation только guarded metadata commit; (б) `code_globs += tests/**` с path_overrides. После них P2 становится adoptable.
2. P1: писать `OrchestratorCheckpoint` на каждый переход состояния (это почти бесплатный снимок run state + checksum) — снимает проблему каденса и усиливает `BACKEND_STATE_LOST`: зеркалировать checkpoint в gitignored файл на диске (как state file proposal-3) — резерв против смерти backend без нарушения «no new runtime».
3. Единый актор неожиданной compaction: при отключённом watchdog — пользовательский `resume` как единственный легитимный создатель successor; прописать явно, устранив противоречие полномочий untrusted-сессии.
4. Adapter dedup-ledger P2 — персистить в `state.json` рядом с outstandingTurn; тогда reboot не ослабляет идемпотентность.

## Completeness & Process (Blue Hat)

- **P1:** не закрыты актор metadata-коммита, исполнитель solution-scan, whitelist локатора спеки, restart-семантика `FAILED_BACKEND`, контракт `agent-entry.md`, staged adoption волнами, маппинг эскалации solution-scan на состояние, каденс checkpoint, актор successor при неожиданной compaction без watchdog.
- **P2:** не закрыты порядок sync/attestation, покрытие tests, проводка carve-out в FSM, worktree-чистота в `canComplete()`, состояние missing-tools, границы tester (`tests/repro`), gitignore `.meta-o/`, формат handoff, персистентность dedup-ledger.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "Ревизия хирургически закрыла две из четырёх моих блокирующих находок, причём лучше моих собственных предложений: spec_digest с пересчётом на границах фаз и ESCALATED(SPEC_MUTATED); правило L4 (неявная ссылка при одном §A-* модуля, явная при ≥2) снова под линтером; плюс честная модель идемпотентности (key + state-guarded resend, закрыто окно running) и ModelSet ровно из 4 ролей с валидируемыми vendor-инвариантами. Остаются две блокирующие находки: canComplete() без worktreeClean, tester пишет verification-state.json без коммит-пункта, а переход в DONE выполняет миграцию decision-log→§A, final knowledge-sync и retire spec уже после вычисления критерия — post-attestation коммиты с изменениями §B/§A без единого review и без guard; и code_globs=['src/**/*.py'] исключает tests из purpose/health при hard constraint 'каждая сущность'. Плюс неизменённые: carve-out doc-only без актора в FSM и anchor-check --gate done, ищущий §*-TODO-* в code_globs вместо docs. Два прицельных исправления (sync-before-attestation + code_globs += tests) делают предложение принимаемым.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "completion-order",
          "description": "canComplete() без worktreeClean; запись verification-state.json tester'ом без определённого коммит-пункта; переход в DONE выполняет миграцию decision-log→§A, final knowledge-sync и retire spec ПОСЛЕ критерия — tracked-коммиты с изменениями §B/§A без review и без guard; итоговое состояние репозитория не аттестовано",
          "required_change": "Завершать knowledge sync ДО финальной аттестации; post-attestation разрешить только guarded metadata-only commit; добавить worktreeClean в canComplete()"
        },
        {
          "id": "",
          "severity": "major",
          "area": "purpose-coverage",
          "description": "code_globs=['src/**/*.py'] исключает tests/ из purpose-lint и health-метрик при hard constraint 'purpose для каждого модуля, класса, функции и метода'",
          "required_change": "Включить tests/** в code_globs с path_overrides"
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "invalidation-model",
          "description": "Carve-out 'doc-only не инвалидирует E2E' не подключён к FSM: у 'дешёвого re-review diff знаний' нет актора, контракта и строки в таблице переходов",
          "required_change": "Модель применимости аттестации (SHA + pathset) и контракт лёгкого knowledge re-review с исполнителем и гейтом"
        },
        {
          "id": "",
          "severity": "major",
          "area": "anchor-check",
          "description": "--gate done запрещает §*-TODO-* в code_globs, но TODO-якоря создаются в docs (doc_globs): гейт проверяет не ту область и фактически не работает",
          "required_change": "Проверять doc_globs (и src при желании), не code_globs"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "idempotency",
          "description": "Adapter dedup-ledger при nativeIdempotency=false не имеет указанной персистентности: после reboot оркестратора ledger теряется, защита от дубликата ослабевает",
          "required_change": "Персистить ledger в state.json рядом с outstandingTurn"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "failure-semantics",
          "description": "Missing-tools есть в HealthReport, но отсутствует в Phase/EscalationKind — эскалация без состояния",
          "required_change": "Добавить PAUSED_MISSING_TOOLS или маппинг на ESCALATED с протоколом"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "role-boundaries",
          "description": "Tester пишет tests/repro/** — граница ролей и glob-классификация не определены; .meta-o/ не объявлен gitignored; handoff без формата и лимита",
          "required_change": "Постоянные тесты — только через findings к implementer; объявить .meta-o gitignored; формат handoff"
        }
      ],
      "assumptions": [
        "Правило L4 с неявной ссылкой через членство принял как удовлетворяющее букве 'линтер проверяет необходимую ссылку', поскольку линтер проверяет и карту модуль→§A, и обязательность явной ссылки при неоднозначности",
        "orchestrator_model вне 4-ролевого набора — корректное прочтение 'модели всех четырёх ролей'",
        "Персчёт spec_digest на границах фаз считал достаточной детекцией мутации; непрерывный мониторинг не требовал"
      ],
      "round": 3,
      "reviewer": "kimik3reasoning"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
