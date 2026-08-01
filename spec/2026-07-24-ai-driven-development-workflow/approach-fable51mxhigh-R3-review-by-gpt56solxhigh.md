## Facts & Constraints

Оба предложения стали существенно конкретнее, но ни одно пока нельзя принять как implementation-ready.

Общий критический конфликт не устранён: tracked `verification-state.json` создаётся или изменяется после аттестации revision `R`. Получается новая revision `M`, которая не проходила оба review и E2E. Более того, запись `git_revision == HEAD` в собственном commit принципиально самореферентна. Metadata-only commit ограничивает риск, но не выполняет hard constraint «одна и та же Git-ревизия».

Второй общий пробел — `sha256` защищает содержимое спеки, но не обеспечивает её доступность. После удаления tracked-спеки replacement session, reviewer или tester уже не сможет получить байты по `locator`. На preflight нужен immutable backend-native blob:

```ts
interface ResolvedFeatureSpec {
  source: FeatureSpecRef;
  digest: string;
  blobRef: string;
  byteLength: number;
}
```

Все роли должны читать `blobRef`, а `locator` использовать только как provenance.

Третий предел осуществимости — требования к backend. Replayable events, native idempotency, atomic checkpoint, successor creation и compaction detection нельзя просто объявить возможностями Herdr/Omnigent. Нужна executable capability suite и таблица фактически подтверждённых возможностей. Несовместимый backend следует отклонять; эмуляция delivery/session semantics создаёт запрещённый control layer.

## Risks & Failure Modes

### Proposal 1

Это наиболее сильная база, особенно knowledge model и QC, но остаются серьёзные отказы:

- `OrchestratorCheckpoint` хранит только `TurnReceipt`, а не полный pending `TurnEnvelope` или immutable `payloadRef`. После crash нельзя повторить тот же запрос с тем же ключом.
- Rotation не имеет fencing. Старый и новый orchestrator могут одновременно отправлять turns. `orchestratorGeneration` не включён в `TurnEnvelope` и не проверяется backend CAS.
- Неожиданно скомпактированная сессия объявлена недоверенной, но ей же поручается создавать successor. Recovery должен инициировать backend/watchdog после атомарного лишения старой generation полномочий.
- `contextEpoch` глобален для run, хотя epoch относится к конкретной session. Worker compaction может быть ошибочно принят за compaction orchestrator.
- Pause states не сохраняют `suspendedFrom`; нормативно восстановить предыдущую фазу невозможно.
- Запрет всех untracked files конфликтует с разрешённой local untracked spec и обычным пользовательским worktree. Нужен выделенный per-run worktree и allowlist входной спеки.
- Brownfield adoption стимулирует массовое сочинение правдоподобных, но ложных purpose. Неизвестный смысл должен блокироваться как `UNKNOWN_PURPOSE`, а не заполняться догадкой.
- `code_health.py` не специфицирует разрешение relative/namespace imports, формат baseline, identity изменённой entity и точное вычисление coupling.

### Proposal 2

Здесь сохраняются более фундаментальные противоречия:

- Local dedup ledger не обеспечивает exactly-once. Если backend принял turn, но connection оборвался до записи ledger, повтор создаст второй turn. Это одновременно ненадёжно и нарушает запрет собственного delivery/control layer.
- Same-family инвариант не реализован: проверяется только равенство `vendor`, но не `family`.
- Неявное AST-членство символа в модуле не является машинной ссылкой на уровень вверх. После перемещения символа его purpose бесшумно меняет смысл. Нужен явный стабильный `§M-*`, как в Proposal 1.
- `Tester` пишет `verification-state.json` и `tests/repro/**`. Это изменяет revision после проверки и превращает tester во второго implementer.
- `DONE` сначала проверяет аттестации, а затем выполняет tracked knowledge sync и retirement спеки. Значит, финальный repository state не был проверен.
- Implementer формально не имеет права менять spec, но именно tracked spec необходимо удалить; ответственная роль отсутствует.
- Doc-only commit сохраняет старую E2E-аттестацию, хотя hard constraint требует совпадения полной Git revision.
- Исключения generated-кода допускаются по одному glob или marker. Требуется совместное доказательство `glob + marker + generator declaration`.
- Разделение reviewer по линзам может превратить единый rubric в два половинных review. Линзы допустимы только как приоритет, при обязательном полном coverage обоими.
- Разрешённые implementer subagents размывают hard constraint одного исполнителя. Безопасный вариант — только read-only research subagents.
- `.meta-o/models.json` внутри repo противоречит пользовательскому default-набору на разных компьютерах. Default должен жить в user/backend config.
- `independence` contract Import Linter не является общим детектором всех dependency cycles; необходим отдельный построитель графа и SCC-анализ.

## Strengths & Benefits

Proposal 1 хорошо закрывает purpose-трассировку через `§M-*`, разделяет severity и classification, формализует adjudication, missing-tools protocol, actual-only knowledge sync и project-owned QC. Новый context-budget раздел правильно считает compaction потерей управляющего доверия, а не безусловно безопасным summary.

Proposal 2 улучшил прежнюю версию: добавил `spec_digest`, четыре рабочие модели, поле `family`, idempotency key и признал окно между acceptance и ростом `turnSeq`. Полезны также самостоятельный `review-loop`, конкретная Python-конфигурация и явное сравнение gate placement. Однако найденные механизмы пока не обеспечивают заявленные гарантии.

## Alternatives & Creative Ideas

Совместимый с constraints финальный порядок должен быть таким:

```text
resolve spec to immutable blob
→ execute
→ knowledge sync
→ commit permanent tests
→ retire tracked spec
→ commit candidate R
→ QC(R)
→ review A(R) + review B(R)
→ E2E(R)
→ attach external verification attestation to R
→ COMPLETE(R)
```

Verification state лучше хранить в Git note, signed tag или backend-native durable attestation, не входящем в tree `R`. Цена — notes/tags нужно отдельно распространять при push. Альтернатива, нарушающая исходный инвариант: признать пару `R + metadata commit M` единицей завершения и проверять `M` отдельным metadata gate.

Для rotation нужен lease/fencing contract:

```ts
interface OrchestratorLease {
  runId: string;
  generation: number;
  fencingToken: string;
  expiresAt: string;
}

interface PendingTurn {
  envelopeRef: string;
  envelopeDigest: string;
  receipt?: TurnReceipt;
  terminalEvent?: WorkflowEvent;
}
```

Каждый mutating backend call обязан принимать `fencingToken`. Successor активируется атомарным CAS, после которого старый token отвергается.

В рамках запрета control layer backend без native idempotency/replay/fencing следует считать несовместимым. Альтернатива вне constraints — небольшой durable sidecar с transactional outbox/inbox; это надёжнее adapter-ledger, но фактически является новым control layer.

Для brownfield совместимый вариант — отдельные adoption features по доменам, каждая с полным процессом и запретом выдуманного purpose. Альтернатива вне hard requirement — ratchet, требующий purpose только от затронутых сущностей.

## Completeness & Process

До реализации обеим версиям нужны:

- backend capability matrix с executable conformance tests;
- immutable `specBlobRef`;
- полный attestation schema и внешний verification storage;
- fencing и durable pending envelope;
- `suspendedFrom`/resume transitions;
- HEAD compare-and-swap и защита от внешнего commit;
- E2E environment fingerprint, scenario reference и cleanup contract;
- точный baseline schema и алгоритм dependency graph;
- failure-injection tests для lost receipt, duplicate acceptance, orchestrator race, deleted spec, metadata recursion и unexpected compaction.

Proposal 1 разумно использовать как основу после устранения этих блокеров. Proposal 2 потребует замены нескольких центральных решений, а не локальной редакции.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 3,
      "would_adopt": false,
      "summary": "Версия исправила часть прежних пробелов — появились spec_digest, четыре рабочие модели и idempotency key, — но центральные гарантии остаются недостижимыми. Adapter-local dedup не даёт exactly-once и нарушает границу runtime, финальные tracked изменения происходят после аттестаций, symbol tracing остаётся неявным, а same-family проверяется только по vendor. Требуется существенная перестройка lifecycle, backend contract и knowledge tracing.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "completion-order",
          "description": "Tester и DONE transition меняют verification state, knowledge и spec после аттестаций; doc-only commits при этом наследуют старый E2E verdict.",
          "required_change": "Выполнять все tracked изменения до candidate revision и хранить финальную E2E attestation вне commit tree."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "delivery-semantics",
          "description": "Adapter-local dedup ledger не закрывает окно между backend acceptance и локальной записью acknowledgement и фактически создаёт запрещённый control layer.",
          "required_change": "Требовать native backend idempotency и authoritative inspect/replay либо признать backend несовместимым."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "purpose-tracing",
          "description": "Неявное членство символа в модуле не является обязательной ссылкой на один уровень вверх и не сохраняет смысл при перемещении символа.",
          "required_change": "Ввести стабильный §M-* для каждого модуля и требовать явную symbol-to-§M ссылку у каждой сущности."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model-independence",
          "description": "Same-family invariant проверяет равенство vendor, но не family и не effective model identity.",
          "required_change": "Проверять vendor и family по фактически запущенной backend model identity, включая отсутствие fallback."
        },
        {
          "id": "",
          "severity": "major",
          "area": "spec-recovery",
          "description": "Digest обнаруживает мутацию, но не сохраняет содержимое удалённой или недоступной спеки для replacement sessions.",
          "required_change": "Разрешать spec один раз в immutable backend blob и использовать blobRef во всех role contracts."
        },
        {
          "id": "",
          "severity": "major",
          "area": "role-ownership",
          "description": "Tester пишет tracked tests и verification state, а implementer одновременно лишён права удалить tracked spec.",
          "required_change": "Tester должен возвращать только evidence/findings; все tracked изменения и retirement выполняет executor до финального candidate commit."
        },
        {
          "id": "",
          "severity": "major",
          "area": "generated-exceptions",
          "description": "Purpose lint освобождает файлы по одному glob или marker, что допускает ручное сокрытие обычного кода.",
          "required_change": "Разрешать исключение только при одновременном совпадении glob, generated marker и зарегистрированной generator command."
        },
        {
          "id": "",
          "severity": "major",
          "area": "qc-completeness",
          "description": "Import Linter independence не обеспечивает общий поиск dependency cycles, а Python coupling и baseline semantics не специфицированы.",
          "required_change": "Определить module-resolution algorithm, SCC cycle detection, coupling metrics и versioned baseline schema."
        }
      ],
      "assumptions": [
        "Два reviewer обязаны независимо покрывать весь единый rubric; lenses могут менять приоритет, но не coverage.",
        "Один executor исключает code-writing implementation subagents.",
        "Model defaults являются пользовательской, а не общей repository configuration.",
        "Flaky mandatory E2E является текущим defect, а не допустимым backlog item."
      ],
      "round": 3,
      "reviewer": "gpt56solxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 3
would_adopt: false
