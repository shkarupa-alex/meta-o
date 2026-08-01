## Facts & Constraints

Все три предложения стали содержательнее, но ни одно пока не достигло порога принятия.

`proposal-1` остаётся лучшей основой: появились `stateVersion`, idempotency keys, ordered events, missing-tools protocol, formal dispositions и самостоятельный `review-loop`. Однако два главных блокера прошлого раунда — SHA-рекурсия и непроверенная реализуемость backend contract — не исправлены.

`proposal-2` приобрёл структуру master-spec, но сохранил прямые нарушения hard constraints и добавил lifecycle-противоречия.

`proposal-3` теперь имеет хорошую архитектурную интуицию, особенно glossary и восстановимость оркестратора, но его центральное решение — собственная доставка поверх ненадёжного backend — прямо противоречит запрету писать control layer.

Применённые hard constraints:

- четыре выбираемые рабочие модели — executor, два reviewer и tester;
- same-family reviewer проверяется механически;
- symbol имеет явную машинно распознаваемую ссылку на module-purpose;
- все knowledge changes и retirement спеки происходят до финального проверяемого SHA;
- никакой confirmed defect, включая verification flakiness, не переносится в backlog;
- resume, event delivery и session management принадлежат backend;
- exact SHA нельзя переносить между revisions эвристикой «doc-only».

Документация Herdr по-прежнему не подтверждает required contract `proposal-1`: для Claude/Codex lifecycle определяется screen-manifest эвристиками, а restart/handoff не сохраняет transient coordination. [Herdr status authority](https://herdr.dev/docs/agents/), [session restore](https://herdr.dev/docs/session-state/). Поэтому критерий «пройти через оба backend» нельзя основывать на допущении о будущих capabilities.

## Risks & Failure Modes

### Proposal 1

Главный дефект не исправлен: metadata-only commit не разрешает SHA recursion. Он создаёт новый HEAD после `COMPLETE(R)`, а `onRevisionChanged()` обязан сбросить attestations. Guard состава diff не превращает metadata commit в проверенный revision.

Delivery protocol стал значительно лучше, но durable outbox отсутствует. `outstandingTurn` хранит только `TurnReceipt`, а не полный `TurnEnvelope` или `payloadRef`; после смерти оркестратора повторить тот же envelope невозможно. Pause states также не сохраняют `suspendedFrom`, поэтому формально неизвестно, в какую фазу возвращаться.

`FeatureSpecRef` всё ещё не содержит immutable blob snapshot. Особенно разрушителен tracked-spec retirement: после удаления repo-relative locator уже недоступен новым reviewer/session generation.

Preflight продолжает блокировать любой untracked файл, хотя разрешённая пользователем external spec может находиться внутри worktree. Чистота пользовательского checkout ошибочно используется вместо dedicated executor worktree.

Backend contract остаётся желаемым интерфейсом без доказанной реализации. Если оба backend его не проходят, заявленный Definition of Done недостижим.

QC конкретен, но `fan-out` не покрывает связанность полностью; не определены module resolution, coupling fingerprint, baseline schema и связь baseline entries с `docs/todo.md`. Brownfield adoption по-прежнему допускает массовое сочинение purpose без состояния `unknown/blocking`.

### Proposal 2

Финальная последовательность внутренне невозможна:

1. review/E2E подтверждают SHA;
2. затем `DONE` выполняет final knowledge sync, decision migration и retirement спеки;
3. tester отдельно изменяет tracked `verification-state.json`;
4. HEAD меняется без повторения полного цикла.

Дополнительно `VerificationRecord.git_rev == HEAD` невозможно записать в сам tracked commit без самоссылки.

Hard requirement purpose нарушен явно:

```toml
symbol_requires_link_one_level_up = false
```

AST containment не является grep-friendly ссылкой. Стабильный `§M-*` отсутствует.

Остаются прежние проблемы:

- нет spec digest/snapshot;
- `ModelRef` не содержит family;
- сохраняется набор из пяти моделей;
- `turnSeq` без client idempotency key не предотвращает duplicate delivery;
- implementer может порождать других исполнителей;
- tester пишет `tests/repro/**`;
- `wontfix_documented` не ограничен доказанным taste/non-defect;
- reviewer lenses позволяют двум reviewer не провести два полных независимых review.

Brownfield несовместим с собственным QC: полный purpose-lint проверяет весь repository, но bootstrap объявлен локальным и без массовой ретродокументации.

`state.json`, reconciliation loop, relay storage и session recovery фактически образуют самостоятельный control layer, хотя proposal называет их «не runtime».

### Proposal 3

Центральный тезис прямо нарушает границу задачи:

> «Надёжность доставки не доверяется Herdr/Omnigent, а достигается протоколом поверх backend».

Expectation storage, timeout polling, retry, resurrection и durable state — это именно компенсирующий control layer, который исходная задача запрещает.

Фраза «если уже работаешь — проигнорируй» не является идемпотентностью. При потерянном ответе агент может повторить commit, миграцию, external call или изменение файлов. Чтение terminal tail также не является delivery acknowledgement.

`feature-state.json` недостаточен для заявленного полного восстановления: отсутствуют digest спеки, session generations, durable outbound envelopes, полный finding state, pending decision, expected revision CAS и processed-event cursor.

Финальный `KNOWLEDGE_SYNC`, retirement спеки и обновление `verification.md` выполняются после review/E2E, снова нарушая exact-revision invariant.

Трассировка symbol → module подменена containment, а waiver `metao: no-arch-link` расширяет исключения за пределы generated/synthetic code. Same-family reviewer не проверяется: model config хранит vendor, но не family.

Brownfield bootstrap снова невозможен: глобальный purpose-lint требует docstring везде, а proposal предлагает документировать только затронутые области.

Отдельно опасно правило «E2E flake → `docs/todo.md`». Нестабильный обязательный gate — подтверждённый дефект текущего verification contour и должен исправляться до завершения.

## Strengths & Benefits

У `proposal-1` сильны:

- наиболее строгие state и event contracts;
- правильная immediate-parent knowledge chain;
- отсутствие planned truth;
- repo-owned QC;
- finding classification отдельно от severity;
- узкое использование adjudicator;
- missing-tools protocol без ложного `SKIPPED`;
- durable rationale без review-ledger.

У `proposal-2` полезны smoke preflight, relay-by-reference, явная transition table и подробная критика исходных решений. Но эти элементы лучше перенести в `proposal-1`, не принимая остальной lifecycle.

У `proposal-3` особенно полезны:

- `glossary.md` против semantic fan-out;
- идея восстановления оркестратора из компактного состояния;
- явный `scenario path` в verification state;
- отделение smoke от тяжёлого E2E;
- честное признание неполной механической проверки архитектурной концентрации.

## Alternatives & Creative Ideas

Совместимая последовательность lifecycle:

```text
capture immutable spec snapshot
→ execute
→ update all knowledge
→ retire tracked spec
→ commit candidate R
→ QC(R)
→ review A(R) + review B(R)
→ E2E(R)
→ attach verification attestation to R outside commit tree
→ COMPLETE(R)
```

Verification state следует хранить как Git note, signed tag или backend-native durable attestation. Если tracked JSON обязателен, придётся ослабить требование exact SHA и явно аттестовать executable parent revision.

Run state должен содержать durable outbox:

```ts
interface PendingTurn {
  envelope: TurnEnvelope<unknown> | { payloadRef: string };
  receipt?: TurnReceipt;
  terminalEvent?: WorkflowEvent;
}
```

Также необходимы `suspendedFrom`, `effectiveModelIdentity`, `specBlobRef`, `expectedHead`, `sessionGeneration` и per-session event cursor.

Backend policy должна быть бинарной: capability suite прошёл — backend поддерживается; не прошёл — workflow не эмулирует delivery guarantees. Совместимая цена — Herdr может временно не поддерживать полный процесс. Альтернатива вне constraints — маленький durable sidecar с outbox/dedupe.

Для brownfield нужен один bootstrap feature, который заканчивается полным QC, но запрещает выдуманный purpose: `UNKNOWN_PURPOSE` блокирует adoption и передаётся на semantic review. Risk-based purpose остаётся заслуживающей рассмотрения альтернативой, но нарушает текущий hard constraint.

Из `proposal-3` стоит перенести в `proposal-1` glossary и `scenario_ref`; из `proposal-2` — smoke preflight. Остальные ключевые решения лучше не синтезировать.

## Completeness & Process

До принятия `proposal-1` остаются обязательными:

- `spec-snapshot-spec.md`;
- исправленный `verification-attestation-spec.md`;
- backend capability matrix с реальными командами;
- durable outbox/inbox и pause-resume transition table;
- Git worktree/CAS protocol;
- E2E namespace, cleanup и mutation guard;
- coupling/baseline schema;
- brownfield unknown-purpose protocol.

Acceptance suite должна дополнительно проверять:

- удаление tracked spec до создания новой session;
- потерю receipt после side effect;
- crash с pending outbound envelope;
- quota pause из каждой lifecycle phase;
- external HEAD movement;
- tester/reviewer mutation;
- final knowledge update;
- verification self-reference;
- flaky E2E;
- backend, не имеющий authoritative events.

`proposal-2` и `proposal-3` пока требуют не локальных правок, а пересборки нескольких центральных решений.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 3,
      "would_adopt": false,
      "summary": "Предложение стало формальнее, но сохранило прямые нарушения hard constraints: symbol parent-link отключён, spec digest отсутствует, same-family не моделируется, набор содержит пять ролей, а turnSeq выдаётся за идемпотентность. Финальный knowledge sync и tester-owned tracked verification state меняют SHA после review/E2E, поэтому заявленный canComplete недостижим.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "completion-order",
          "description": "Final knowledge sync, decision migration, spec retirement и verification update выполняются после проверенного SHA.",
          "required_change": "Завершить все tracked изменения до финального QC/review/E2E; attestation хранить вне tree."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "purpose-tracing",
          "description": "symbol_requires_link_one_level_up=false прямо нарушает обязательную трассировку и lint ссылки.",
          "required_change": "Ввести стабильный module-purpose anchor и обязательную явную symbol→module ссылку."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "spec-integrity",
          "description": "RunState не содержит digest и immutable snapshot спеки.",
          "required_change": "Добавить mutation gate и content-addressed snapshot."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model-contract",
          "description": "ModelRef не содержит family, а persistent ModelSet включает пять ролей.",
          "required_change": "Механически проверять family и хранить четыре требуемые рабочие model selections."
        },
        {
          "id": "",
          "severity": "major",
          "area": "delivery",
          "description": "Ack.acceptedAtTurnSeq и status polling не дают idempotent send между acceptance и terminal event.",
          "required_change": "Потребовать backend idempotency key/receipt либо признать backend неподдерживаемым."
        },
        {
          "id": "",
          "severity": "major",
          "area": "review-and-ownership",
          "description": "Reviewer lenses ослабляют два полных независимых review, а tester изменяет tracked tests и verification state.",
          "required_change": "Каждый reviewer проверяет полный rubric; tracked files меняет только executor до final gates."
        },
        {
          "id": "",
          "severity": "major",
          "area": "brownfield",
          "description": "Global purpose-lint несовместим с заявленным локальным bootstrap без массовой ретродокументации.",
          "required_change": "Определить полноценную adoption feature или изменить hard all-symbol policy."
        },
        {
          "id": "",
          "severity": "major",
          "area": "finding-lifecycle",
          "description": "wontfix_documented не ограничен доказанными taste/non-defect findings.",
          "required_change": "Запретить завершение с подтверждённым defect или engineering risk."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "watchdog",
          "description": "Wake command template и raw classifier tail создают injection и secret-leak surface.",
          "required_change": "Использовать типизированный backend operation и обязательную sanitization policy."
        }
      ],
      "assumptions": [
        "Orchestrator не входит в четыре модели, которые пользователь обязан выбирать как рабочий набор.",
        "Doc-only revision не может наследовать E2E attestation при требовании exact same Git revision.",
        "Reviewer focus не заменяет полное применение единого rubric."
      ],
      "round": 2,
      "reviewer": "gpt56solxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 3
would_adopt: false
