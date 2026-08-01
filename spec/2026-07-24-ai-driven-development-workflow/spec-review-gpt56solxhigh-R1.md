# Итог

Спецификация не готова к реализации as-is: 4/10. Концептуальное ядро сильное, но обнаружены четыре критических нарушения доказательности: подмена Git-ревизии собственным digest, изменяемый E2E-каталог вне digest, отсутствие изолированного snapshot checkout и небезопасное восстановление оркестратора после crash. Кроме того, обещанные implementation-ready подспеки фактически отсутствуют.

## Facts & Constraints — White Hat

Hard constraints исходной задачи:

- завершение на одной Git-ревизии;
- два независимых reviewer и отдельный E2E tester;
- all-symbol purpose;
- обязательный локальный QC без CI;
- отсутствие собственного session runtime/control layer;
- неизменяемая feature-spec;
- один полный workflow без quality modes;
- отсутствие push/PR без отдельной просьбы.

Решениями, а не hard constraints, являются `snapshot_digest`, исключение `e2e.json`, один `business.md`, отказ от reference QC implementation и конкретная структура `~/.meta-o`.

Шесть требуемых файлов поставки отсутствуют: существует только master-документ, который обещает последующую декомпозицию. Это уже нарушает Original Task и D-001.

Backend-направление реалистично, но контракт можно сделать значительно конкретнее. Актуальный Herdr уже документирует JSON Schema протокола, event subscription, Git worktrees и атомарный `agent.prompt + wait`; текущий абстрактный adapter не использует эти гарантии. [Herdr Socket API](https://herdr.dev/docs/socket-api/). Omnigent официально обозначен как alpha, поэтому capability suite действительно необходим, но его версия и результаты должны входить в run evidence. [Omnigent](https://omnigent.ai/).

## Risks & Failure Modes — Black Hat

1. **Critical — нарушена Git-revision semantics.** Original Task требует одну Git-ревизию, а §12 заменяет её content digest и допускает отдельный bookkeeping commit. Rebase с теми же байтами всё равно создаёт другую Git-ревизию. D-031/D-032 меняют hard constraint без основания.

   Требуется: attestation на clean commit SHA. Verification metadata хранить вне этого commit — например, во внешнем durable state или annotated tag, с явной политикой публикации.

2. **Critical — `e2e.json` создаёт обход gate.** Из digest исключён весь файл, включая `always_required`, `business_links`, `tags` и `scenario_ref`. После review можно убрать business link или снять `always_required`, не изменив `S`, и законно сократить E2E set.

   Требуется: разделить включённый в revision `e2e-catalog.json` и исключённые результаты либо исключать только строго определённые `last_run` fields с field-level guard.

3. **Critical — полнота E2E selection может остаться непроверенной.** Reviewer проверяет selection при «следующей reattestation». Если первый E2E проходит без code changes, следующего review нет и workflow завершается.

   Требуется: сформировать selected set до review; оба reviewer должны явно attest его полноту на том же commit.

4. **Critical — роли не получают immutable checkout.** Digest не включает untracked files, не определяет index/worktree semantics и не запрещает executor менять workspace во время review. Reviewer или E2E могут фактически исследовать смесь ревизий.

   Требуется: committed clean candidate, отдельный read-only/isolated worktree для каждого reviewer и E2E, запрет concurrent mutation. Herdr уже предоставляет worktree primitives.

5. **Critical — crash recovery небезопасен.** `stateVersion` и `orchestratorGeneration` не обеспечивают single writer: нет lock, lease, fencing или compare-and-swap. Нет `pendingOperation`, backend receipt и read cursor. Crash после `send`, но до записи state, приводит либо к duplicate work, либо к вечной неопределённости.

   Требуется: OS lock с fencing generation и одна recoverable in-flight operation:

   - operation ID и request digest;
   - prepared/acknowledged/observed state;
   - backend message/turn ID;
   - output cursor;
   - таблица reconciliation для crash до/после каждого side effect.

   Это не очередь и не новый runtime; это минимальная атомарность FSM.

6. **Major — `make qc` допускает false PASS.** Executor контролирует `Makefile`, baseline и сами check scripts. Guard сравнивает thresholds, но не обнаружит удаление subgate или замену checker на `exit 0`. Оркестратор получает только общий exit status.

   Требуется: tracked QC manifest и machine-readable report с обязательными gate IDs, версиями tools, scope, exit status и причиной skip. Guard должен сравнивать состав gate с `baseRevision`.

7. **Major — Python QC не является конкретной реализацией.** Не определены:

   - команды Ruff/mypy/pyright/Import Linter;
   - алгоритм полного import graph;
   - schema baseline;
   - обработка dynamic imports и namespace packages;
   - AST-правила purpose;
   - schema `adoption-manifest.json`;
   - правила exemptions и защита от их расширения.

   Каждый проект сейчас должен самостоятельно спроектировать основной checker, что противоречит implementation-ready требованию.

8. **Major — FSM неполна.** Нет `CANCELLED/ABORTED`, точного состояния `SPEC_MUTATED`, переходов pause/resume, retry/backoff policy, stall deadline value и разделения E2E product failure от external/infra block. `PAUSED_BACKEND_UNCERTAIN` отсутствует в нормативном перечне сквозных состояний.

9. **Major — watchdog только обозначен.** Не заданы config schema, polling/backoff, quota reset calculation, stale-lock recovery, signal orchestrator, sanitization limits и тестовый fake-clock protocol. Watchdog вызывает `adapter reconcile`, которого нет в `SessionAdapter`.

10. **Major — security contract отсутствует.** Не определены политика передачи proprietary code cross-vendor, secret scanning, URL-fetch limits/redirects/auth, symlink-safe state writes, E2E credential isolation и запрет тестирования на production state.

## Strengths & Benefits — Yellow Hat

Сильными являются:

- чёткая граница тонкого orchestrator;
- immutable spec blob и digest guard;
- две независимые review-сессии и отдельный tester;
- обязательное исправление всех реальных defects;
- distinction defect/risk/taste;
- knowledge sync до review и запрет post-attestation semantic writes;
- цепочка `§B → §A → §M → symbol`;
- отказ от planned truth;
- локальный QC как самостоятельный gate;
- brownfield ratchet и dependency-closed adoption;
- честный capability gate вместо выдуманной backend надёжности;
- сохранение только открытых findings.

Это хорошая архитектурная основа, но пока не доказательный executable protocol.

## Alternatives & Creative Ideas — Green Hat

- **Совместимо с hard constraints:** commit SHA + isolated worktrees + external/tagged verification record. Цена — отдельная политика публикации verification metadata.  
  **Нарушающая альтернатива:** оставить tree digest и официально ослабить требование «одна Git-ревизия». Цена — более сложная модель provenance.

- **Совместимо с запретом control layer:** один `pendingOperation` и fencing lock. Цена — небольшое усложнение state schema.  
  **Нарушающая альтернатива:** полноценный durable outbox/event log. Надёжнее, но фактически создаёт собственный control layer.

- **Совместимо с all-symbol purpose:** точная Python docstring grammar и закрытый exemption schema. Цена — высокий documentation overhead.  
  **Нарушающая альтернатива:** risk-based purpose по GRACE. Меньше cargo cult, но теряется тотальная трассировка.

- **Совместимо с local-QC constraint:** project-owned `Makefile` плюс tracked standalone reference checker и QC manifest. Цена — обновление сгенерированного checker.  
  **Нарушающая альтернатива:** сделать CI авторитетным. Проще защитить gate, но workflow перестаёт работать автономно локально.

- Один `business.md` не является hard constraint Original Task. Масштабируемая альтернатива — domain files плюс автоматически проверяемый/generated full index. Цена — дополнительный derived artifact; выгода — меньше merge conflicts и bounded context.

## Completeness & Process — Blue Hat

### Traceability

Ledger существует, но traceability не проходит:

- D-001: шесть файлов обещаны, но не поставлены.
- D-024: `KnowledgeImpactPlan` упомянут, но отсутствует в `RunState` и не имеет schema.
- D-038: dependency-free TS/JS helpers есть только в ledger.
- D-051: глобальный architecture/feature-flag audit вне scope указан только в ledger.
- D-053: запрет push/PR без просьбы отсутствует в нормативном lifecycle.
- D-054: отсутствие skill version pin/check отсутствует в нормативном теле.
- D-063 находится только в dissent, а не в completion contract.
- В `Rejected` отсутствуют D-029, D-034, D-044 и D-048.
- D-058 называет context thresholds deferred, но §14 уже нормативно задаёт `55/65/75%`.
- D-031 противоречит исходному hard constraint о Git revision.

### Decomposition Readiness

Декомпозиция требует новых архитектурных решений практически в каждой подспеке:

- `00`: leadership, fencing, crash points, cancellation;
- `10`: точная anchor/docstring grammar и exemption model;
- `20`: недостающие adapter types и delivery reconciliation;
- `30`: безопасная E2E selection и immutable catalog;
- `40`: algorithms и schemas Python checkers;
- `50`: watchdog protocol.

Следовательно, §22 — список будущих design tasks, а не механическая decomposition.

### Weak-Model Executability

Слабая модель будет вынуждена угадывать смысл выражений:

- «affected business links or tags»;
- «prove terminal state»;
- «configured search roots»;
- «full import graph»;
- «effective thresholds»;
- «sanitized tail»;
- «stall deadline»;
- «dependency-closed roots».

Не определены `AdapterCapabilities`, `SpawnRequest`, `DeliveryResult`, `SessionStatus`, `SessionOutput`, `ExpectedState`, `WaitResult`, `Evidence` и `DecisionOption`. Adapter I/O также ошибочно выглядит синхронным, хотя это внешние операции.

### Contract Completeness

Отсутствуют JSON Schemas для state/settings/E2E/adoption/baseline, migration policy, limits на spec/evidence/decision log, retry и timeout values, dirty-worktree policy, untracked/submodule semantics и правила cleanup после partial failure.

Литеральных `TBD` вне Open Questions нет, но остаётся много семантических TBD.

### Test coverage

Кроме backend capability suite тестовый план отсутствует. Нужны как минимум:

- property tests project-key и snapshot serialization;
- crash-point tests atomic state/pending operations;
- concurrent-controller fencing tests;
- immutable-checkout tests;
- Python AST matrix для всех symbol types;
- baseline/graph ratchet fixtures;
- E2E-catalog tampering tests;
- simulated FSM scenarios для quota, backend uncertainty, spec mutation и cancellation;
- watchdog fake-clock и restart tests;
- full local workflow acceptance test на одной commit revision.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 4,
      "would_adopt": false,
      "summary": "Архитектурное направление сильное, но спецификация не готова к реализации: она нарушает hard constraint одной Git-ревизии, позволяет менять selection-critical E2E metadata вне digest, не гарантирует immutable checkout и не может безопасно восстановиться после crash между backend side effect и записью state. Обещанные implementation-ready подспеки отсутствуют, а Python QC, watchdog, adapter contracts и test plan требуют новых архитектурных решений.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "revision-attestation",
          "description": "Content snapshot и bookkeeping commit подменяют требование одной Git-ревизии.",
          "required_change": "Attest clean commit SHA и хранить verification metadata вне attested commit."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "e2e-integrity",
          "description": "Исключённый e2e.json содержит selection-critical fields и позволяет сузить E2E set без invalidation.",
          "required_change": "Включить каталог сценариев в revision и отделить от изменяемых результатов."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "snapshot-isolation",
          "description": "Reviewer и E2E не привязаны к immutable isolated checkout; untracked и concurrent changes не контролируются.",
          "required_change": "Использовать clean committed candidate и отдельные isolated worktrees."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "crash-recovery",
          "description": "Нет fencing single writer, pending operation, backend receipt и output cursor.",
          "required_change": "Добавить lock/fencing и recoverable in-flight operation protocol."
        },
        {
          "id": "",
          "severity": "major",
          "area": "local-qc",
          "description": "Executor может ослабить Makefile или checker и получить общий exit 0.",
          "required_change": "Ввести QC manifest, per-gate structured report и base-revision guard состава проверок."
        },
        {
          "id": "",
          "severity": "major",
          "area": "delivery",
          "description": "Пять implementation-ready подспек не поставлены.",
          "required_change": "Предоставить все шесть нормативных файлов с полноценными contracts и tests."
        },
        {
          "id": "",
          "severity": "major",
          "area": "fsm-watchdog",
          "description": "Не определены cancellation, pause/resume transitions, retry/backoff, deadlines и watchdog signalling.",
          "required_change": "Добавить полную transition/error/recovery matrix и executable watchdog contract."
        },
        {
          "id": "",
          "severity": "major",
          "area": "contract-completeness",
          "description": "Ключевые interfaces, JSON schemas, Python algorithms и limits отсутствуют.",
          "required_change": "Определить все referenced types, schemas, parser rules, thresholds, limits и error mappings."
        },
        {
          "id": "",
          "severity": "major",
          "area": "traceability",
          "description": "D-038, D-051, D-053 и D-054 отсутствуют в нормативном теле; несколько rejected решений отсутствуют в соответствующем разделе.",
          "required_change": "Провести автоматическую ledger-to-body сверку и устранить все пропуски и противоречия."
        },
        {
          "id": "",
          "severity": "major",
          "area": "test-plan",
          "description": "Нет системного плана тестирования FSM, state recovery, knowledge/QC checkers и watchdog.",
          "required_change": "Добавить unit, property, crash-point, conformance и full-workflow acceptance test matrix."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "knowledge-scalability",
          "description": "Один неограниченный business.md станет merge и context bottleneck.",
          "required_change": "Задать предел и стратегию sharding/generated index."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "yagni",
          "description": "Custom snapshot digest сложнее и слабее прямой commit-based attestation.",
          "required_change": "Предпочесть Git-native revision semantics."
        }
      ],
      "assumptions": [
        "Требование одной Git-ревизии считаю hard constraint и не заменяю его content equivalence.",
        "Implementation-ready означает фактическое наличие master-spec и пяти отдельных подспек.",
        "До явного запрета считаю возможными dirty worktree, untracked files и crash в любой точке side effect.",
        "Внешний verification state допустим, поскольку Original Task не требует хранить его в attested commit."
      ],
      "round": 1,
      "reviewer": "gpt56solxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 4
would_adopt: false
