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
      "target_id": "proposal-1",
      "approval_score": 8,
      "would_adopt": true,
      "summary": "Ревизия добавила first-class подсистему контекстного бюджета оркестратора — rotation до compaction с порогами 55/65/75%, checksummed OrchestratorCheckpoint, протокол successor activation со сверкой digest/revision/generations/cursor, инвалидация полномочий сессии при неожиданной compaction и отказ от narrative summary как authority; это закрывает последний стратегический пробел прошлых версий (главный страх автора) и снимает мою находку о противоречии QC-политики (теперь 'review-candidate commit'). Блокирующих противоречий нет. Остаточное: ставка на capabilities выросла (обязательные compaction detection и successor creation при запрете компенсации — если Herdr/Omnigent не умеют детектить compaction CLI-агента, методология не запускается нигде; нужен capability spike шагом 0 с точкой решения о деградации); знание-lint по-прежнему содержит фазово-зависимые правила без механизма; не определены каденс checkpoint (рекомендую на каждый переход), актор successor при неожиданной compaction без watchdog и ряд редакционных пунктов. Принимать как основу; довести перечисленное до начала реализации.",
      "phase": "approach-review",
      "confidence": "high",
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "backend-capabilities",
          "description": "Список обязательных capabilities вырос (compaction/context-reset detection, createOrchestratorSuccessor или гарантированная pause-before-compaction, atomic checkpoint, ordered replayable events, structured run state): если оба backend не покрывают их, preflight блокирует всё, а 'не писать новый runtime' запрещает компенсацию — экзистенциальная ставка на непроверенные возможности Herdr/Omnigent",
          "required_change": "Capability spike шагом 0 внедрения + документированная точка решения о деградации (poll-режим с явным статусом DEGRADED_DELIVERY; rotation-only-when-detectable)"
        },
        {
          "id": "",
          "severity": "major",
          "area": "knowledge-lint",
          "description": "Правила §11.6 'spec retirement' и 'чистота docs/todo.md' фазово-зависимы, но линтер stateless и исполняется в ./tools/qc на каждом review-candidate: либо false-fail до sync, либо мёртвое правило",
          "required_change": "Определить механизм: удаление tracked-спеки первым коммитом executor, машинный маркер завершения todo-записи или конвенция расположения спек"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "context-budget",
          "description": "Каденс OrchestratorCheckpoint не указан: если checkpoint создаётся только на порогах 55/65%, неожиданная compaction ниже порога оставляет run без восстановления (FAILED_BACKEND), хотя run state содержит почти всё содержимое checkpoint",
          "required_change": "Писать checkpoint на каждый переход состояния (снимок run state + checksum)"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "context-budget",
          "description": "§5.8: untrusted-сессия 'не принимает решений, не отправляет turns' и при этом 'создаёт fresh successor' — противоречие полномочий; при отключённом watchdog актор воскрешения не определён",
          "required_change": "Явно назначить создателя successor: watchdog, backend или пользовательский resume как единственный легитимный путь без watchdog"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "context-budget",
          "description": "Rotation при долгом outstanding turn: 'дождаться или reconcile' неопределённо — долгий turn executor может протолкнуть бюджет за 75% в hard pause посреди turn",
          "required_change": "Определить политику: deadline rotation vs принудительный reconcile с наследованием outstandingTurn successor'ом"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "qc-pipeline",
          "description": "verification-lint.mjs объявлен отдельным инструментом, но не включён в последовательность §14.2 (verification schema при этом проверяется knowledge-lint — дублирование или пробел)",
          "required_change": "Включить в pipeline или слить с knowledge-lint"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "completion",
          "description": "Актор metadata-only коммита verification-state не назван; 'единственная роль, меняющая tracked files' буквально нарушается",
          "required_change": "Назначить оркестратора создателем guarded metadata commit; внести исключение в границу ролей"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "failure-semantics",
          "description": "BACKEND_STATE_LOST терминален: checkpoint хранится в backend и гибнет вместе с ним; диск-зеркало не предусмотрено",
          "required_change": "Зеркалировать checkpoint в gitignored файл на диске (по модели state file proposal-3) как резерв без нового runtime"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "lifecycle",
          "description": "Solution scan без исполняющей роли и маппинга эскалации; гейт untracked files конфликтует с untracked-спекой в репозитории; DecisionRequest самоклассифицируется исполнителем; adoption одной feature неподъёмен для крупного brownfield",
          "required_change": "Эфемерная сессия scan + маппинг на PAUSED_EXTERNAL; whitelist локатора спеки; обязательное второе мнение reviewer при сомнении; staged adoption по source_root"
        }
      ],
      "assumptions": [
        "Тексты этого раунда — новые версии; оценивал их, а не накопленные впечатления",
        "При расхождении текста задания и исходников приоритет — тексту задания",
        "Checkpoint в backend вместо диска — осознанный компромисс, не дефект; диск предложен как усиление, не как замена"
      ],
      "round": 3,
      "reviewer": "kimik3reasoning"
    }
  ]
}
```

---REVIEW-META---
approval_score: 8
would_adopt: true
