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
      "target_id": "proposal-1",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "Наиболее сильная и близкая к принятию версия: хорошо спроектированы knowledge chain, explicit §M tracing, QC, findings, adjudication и context-budget policy. Однако metadata commit нарушает exact-revision invariant, удаляемая спека не сохраняется как immutable blob, а orchestrator rotation не имеет durable outbox и fencing. Кроме того, заявленные backend capabilities пока не доказаны для обоих backend.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "revision-attestation",
          "description": "Metadata-only verification commit создаёт новую HEAD revision после review и E2E; собственный SHA нельзя записать в содержимое этого же commit.",
          "required_change": "Завершать все tracked изменения до candidate R, а verification attestation хранить вне commit tree, например в Git note, signed tag или backend durable store."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "backend-feasibility",
          "description": "Методология требует replayable events, native idempotency, atomic checkpoints, successor creation и compaction detection без доказательства поддержки Herdr и Omnigent.",
          "required_change": "Добавить executable capability suite и отклонять backend при отсутствии любой обязательной capability; не эмулировать её собственным control layer."
        },
        {
          "id": "",
          "severity": "major",
          "area": "orchestrator-fencing",
          "description": "При rotation старая и новая orchestrator sessions могут одновременно выполнять mutating actions.",
          "required_change": "Ввести атомарный leadership lease и fencing token во все send, reconcile, checkpoint и transition operations."
        },
        {
          "id": "",
          "severity": "major",
          "area": "durable-delivery",
          "description": "Checkpoint хранит receipt, но не полный pending envelope или payload reference, поэтому exact replay после crash невозможен.",
          "required_change": "Хранить durable PendingTurn с envelopeRef, digest, idempotency key, receipt и terminal event."
        },
        {
          "id": "",
          "severity": "major",
          "area": "spec-recovery",
          "description": "После удаления tracked spec новые role sessions не смогут получить её байты по locator.",
          "required_change": "На preflight сохранять immutable content-addressed spec blob и передавать всем ролям blobRef."
        },
        {
          "id": "",
          "severity": "major",
          "area": "state-machine",
          "description": "Pause states не содержат suspendedFrom, а contextEpoch ошибочно моделируется как глобальный run field.",
          "required_change": "Хранить resume target и per-session contextEpoch; unexpected compaction должен обрабатываться внешним fenced recovery actor."
        },
        {
          "id": "",
          "severity": "major",
          "area": "git-isolation",
          "description": "Blanket-запрет untracked files конфликтует с допустимой local spec и не защищает от внешнего изменения HEAD.",
          "required_change": "Использовать dedicated per-run worktree, allowlist spec path и compare-and-swap expected HEAD."
        }
      ],
      "assumptions": [
        "Требование одной Git-ревизии относится ко всем tracked files, а не только executable code.",
        "External local spec может находиться внутри repository worktree.",
        "Backend adapter не вправе эмулировать delivery/session guarantees собственным runtime.",
        "Ссылка на уровень вверх должна быть явной и машинно распознаваемой."
      ],
      "round": 3,
      "reviewer": "gpt56solxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
