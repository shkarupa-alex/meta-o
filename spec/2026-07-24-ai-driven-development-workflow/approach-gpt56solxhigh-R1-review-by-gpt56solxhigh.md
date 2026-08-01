## Facts & Constraints

`proposal-1` — единственная пригодная основа, но до implementation-ready master-spec не дотягивает. `proposal-2` содержит полезные идеи, однако оставляет ключевые решения открытыми и местами противоречит собственным инвариантам. `proposal-3` не является предложением.

Непересматриваемые ограничения, которые финальная система обязана сохранить:

- immutable feature-spec с проверяемой идентичностью;
- один исполнитель, два полных независимых review и отдельный E2E;
- один и тот же Git SHA для финальных review и E2E;
- непосредственная трассировка `business → architecture → module → symbol`;
- purpose для всех объявленных сущностей;
- локальный QC как самостоятельный gate;
- отсутствие собственного session runtime;
- четыре пользовательски выбираемые рабочие модели;
- исправление всех подтверждённых defects/risks.

Текущая feasibility backend в обоих предложениях завышена. Herdr действительно предоставляет JSON CLI, ожидание статусов и session restore, но для Claude Code и Codex состояние определяется screen-manifest эвристиками, которые могут пропускать переходы; live handoff не сохраняет transient coordination, waits и streams. Это не эквивалент replayable event cursor и delivery acknowledgement из `proposal-1`. [Herdr CLI reference](https://herdr.dev/docs/cli-reference/), [status authority](https://herdr.dev/docs/agents/), [session restore](https://herdr.dev/docs/session-state/). Omnigent заявляет persistent sessions и REST API, но публично всё ещё обозначен как alpha; доказательства требуемой exactly-once/replay семантики в proposal отсутствуют. [Omnigent architecture](https://omnigent.ai/), [session model](https://omnigent.ai/docs/interact/terminal).

Следовательно, предположение «оба backend предоставят необходимые capabilities» нельзя оставлять в финальной спеке как допущение: это главный feasibility gate.

## Risks & Failure Modes

### Общие критические проблемы

1. **Неразрешённая рекурсия verification state.**  
   В `proposal-1` любой tracked commit инвалидирует attestations, после чего создаётся metadata-only commit. Этот commit сам меняет SHA, поэтому `COMPLETE` уже не относится к текущему HEAD. В `proposal-2` doc-only изменения якобы не инвалидируют E2E, но его собственный инвариант требует `e2e_clean_rev === head_rev`; одновременно выполнить оба правила невозможно.

2. **Digest не делает спеку восстанавливаемой.**  
   `proposal-1` хранит locator и hash, но не immutable snapshot. Local-файл или URL может исчезнуть, измениться либо стать недоступным новой session generation. Восстановление после `SESSION_LOST` тогда невозможно. В `proposal-2` нет даже digest и mutation detection.

3. **Backend state — единая точка без проверенной durability.**  
   Findings и decisions нужны для восстановления, но живут только в backend. В `proposal-1` отсутствуют полные CAS/version semantics; `reconcile(expectedStateVersion)` ссылается на версию, которой нет в `FeatureRun`. В `proposal-2` проверка одного `turnSeq` не предотвращает повторную доставку, если сообщение было принято, но turn ещё не завершился.

4. **Git/worktree protocol непрактичен.**  
   `proposal-1` блокирует любые non-ignored untracked files, хотя feature-spec прямо может быть untracked. Он также требует чистоты пользовательского worktree вместо создания выделенного executor worktree. Не определены external branch movement, CAS по HEAD, crash recovery при незакоммиченном diff и обнаружение изменений, сделанных reviewer/tester.

5. **Неполная E2E-семантика.**  
   Нет стабильного `scenario_ref` на исполняемый test/script, правил namespace allocation, cleanup, destructive test-data policy, environment fingerprint и проверки, что tester не изменил tracked tree. Одной строки `environment: local:docker-compose` недостаточно для воспроизводимости.

### Специфично для `proposal-1`

- `GateAttestation`, `ReviewAttestation`, `E2EAttestation`, event envelope и несколько adapter request types не определены.
- Нет нормативной transition table, `resumePhase`, cancellation semantics и правил обработки внешнего изменения HEAD.
- `fan-out` — недостаточная реализация требования о связанности. Нужны как минимум efferent/afferent coupling, SCC, forbidden edges и instability/change-coupling policy.
- Brownfield adoption может породить тысячи выдуманных purpose docstrings. Не определено, как блокировать `UNKNOWN_PURPOSE`, а не превращать предположение агента в бизнес-истину.
- `knowledge-lint` не может безопасно проверять «отсутствие active feature-spec», пока не определены точный locator и search-contour policy.
- Решение о библиотеке после solution scan не фиксирует version, license conclusion, provenance, security и проверенный compatibility evidence.
- Проверка model family основана на свободных строках конфигурации, а не на effective model identity от backend.

### Специфично для `proposal-2`

- Символу разрешено ссылаться сразу на `§A-*`, что нарушает обязательную ссылку на непосредственный parent module.
- Нет стабильного `§M-*`, поэтому `symbol → module` нельзя надёжно lint’ить.
- `KNOWLEDGE_PROJECTION` встроен в state machine, но TODO-проекция оставлена открытым вопросом.
- `ModelRef` не содержит family, хотя same-family constraint должен проверяться механически.
- Model set расширен до пяти ролей, а adjudicator и implementer subagents размывают заданную модель четырёх рабочих ролей и одного исполнителя.
- `wontfix_documented` допускает потенциальное сохранение подтверждённого дефекта.
- `contract-sweep` обещает семантически сверять prose claims с кодом, не задавая формальной грамматики проверяемых claims.
- Авторитетный `meta-o qc` зависит от непиннутого skill/tool bundle; разные машины могут получить разные gates.
- Watchdog использует shell `wake_command_template`, что создаёт injection и duplicate-execution surface.
- Семь открытых архитектурных вопросов означают, что документ нельзя декомпозировать без нового design round.

## Strengths & Benefits

Сильные стороны `proposal-1`:

- хорошее разделение durable knowledge и transient run state;
- отказ от planned truth в business/architecture;
- exact-revision review barrier до противоречивого metadata commit;
- структурированные findings с evidence и basis;
- project-owned QC scripts;
- разумный brownfield ratchet;
- детерминированный watchdog с advisory-only local model;
- чёткое правило, что defect и engineering risk блокируют завершение.

У `proposal-2` полезны:

- push плюс pull reconciliation как концепция;
- внешний payload вместо копирования контекста в оркестратор;
- явная критика бизнес-дрейфа;
- различение механической и семантической проверки purpose;
- идея simulation для orchestration protocol.

## Alternatives & Creative Ideas

Совместимый вариант:

- хранить verification attestation как Git note или signed tag, прикреплённый к уже проверенному SHA; это не меняет revision;
- сохранять spec как backend-native content-addressed blob: `locator + sha256 + blobRef + byteLength + mediaType`;
- запускать executor в отдельном branch worktree, reviewers/tester — в disposable detached worktrees;
- добавить `stateVersion`, `resumePhase`, client-generated `commandId`, effective model identity и HEAD CAS;
- считать backend conformant только после executable capability suite для конкретной пары backend/CLI;
- для brownfield блокировать неизвестный purpose, а не генерировать правдоподобный текст;
- хранить E2E scenario как исполняемый tracked test/runbook, а verification state — только как компактный результат.

Цена: Git notes/tags требуют явной политики fetch/push; capability suite может временно исключить Herdr+Claude/Codex из полного workflow.

Альтернатива, нарушающая исходные решения:

- небольшой durable sidecar с event journal, dedupe и CAS устранил бы слабости backend, но стал бы запрещённым собственным control layer;
- metadata-only commit с переносом attestations проще Git notes, но нарушает требование exact SHA;
- risk-based purpose значительно дешевле и семантически честнее, но нарушает hard requirement all-symbol purpose;
- human gate на изменения `§B-*` снизил бы риск бизнес-дрейфа, но добавил бы синхронную человеческую точку.

## Completeness & Process

Перед принятием `proposal-1` необходимы отдельные законченные подспеки:

1. `git-revision-and-attestation.md`;
2. `spec-snapshot.md`;
3. `run-state-and-idempotency.md`;
4. реальные capability mappings Herdr/Omnigent;
5. `e2e-isolation-and-evidence.md`;
6. формальная Python module-resolution/coupling spec;
7. brownfield semantic adoption protocol;
8. installer/update failure and integrity semantics.

Обязательная acceptance matrix должна включать: исчезновение внешней спеки, spec mutation, unacked delivery, завершение двух sessions одновременно, reboot, session replacement, external HEAD movement, tester mutation, metadata recursion, generated-marker spoofing, baseline ratchet и E2E fix с полной повторной аттестацией.

`proposal-2` следует использовать только как источник отдельных идей. `proposal-3` не покрывает ни одного требования.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-1",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "Наиболее сильная и близкая к исходным ограничениям основа: хорошо разделяет временное и устойчивое состояние, предлагает конкретный Python QC, строгую трассировку и exact-revision gates. Однако metadata-only commit нарушает финальный SHA-инвариант, spec digest не обеспечивает восстановимый snapshot, backend capabilities не подтверждены, а state/idempotency, E2E isolation и brownfield semantic adoption недостаточно определены.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "revision-attestation",
          "description": "Metadata-only verification commit меняет HEAD после аттестации и противоречит правилу завершения на одном Git SHA.",
          "required_change": "Хранить attestation вне commit tree, например Git note/signed tag или backend-native durable record, либо явно изменить исходный SHA-инвариант."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "backend-feasibility",
          "description": "Required replay cursor, acknowledgement и authoritative lifecycle events не сопоставлены с реальными Herdr/Omnigent capabilities.",
          "required_change": "Добавить executable capability suite и нормативную compatibility matrix для каждого backend/CLI pair."
        },
        {
          "id": "",
          "severity": "major",
          "area": "spec-recovery",
          "description": "Locator и digest не позволяют восстановить точные bytes исчезнувшей local/URL спеки.",
          "required_change": "Создавать immutable content-addressed spec snapshot в backend-native storage."
        },
        {
          "id": "",
          "severity": "major",
          "area": "state-machine",
          "description": "Отсутствуют полная transition table, stateVersion в RunState, resume target и end-to-end idempotency contract.",
          "required_change": "Определить versioned RunEnvelope, CAS transitions, command IDs, acknowledgement states и recovery transitions."
        },
        {
          "id": "",
          "severity": "major",
          "area": "git-worktrees",
          "description": "Preflight конфликтует с допустимой untracked spec и не защищает от внешнего движения branch или мутаций reviewer/tester.",
          "required_change": "Использовать выделенные worktrees, HEAD CAS и pre/post tree-integrity checks."
        },
        {
          "id": "",
          "severity": "major",
          "area": "quality-model",
          "description": "Fan-out не покрывает требование о связанности, а baseline/entity semantics и module resolution недостаточно формальны.",
          "required_change": "Специфицировать coupling metrics, import resolution, entity fingerprints, baseline ratchet и self-tests анализаторов."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "solution-scan",
          "description": "Candidate record не фиксирует version, provenance, license verdict и compatibility evidence.",
          "required_change": "Расширить structured result и decision record."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "model-identity",
          "description": "Vendor/family проверяются по конфигурационным строкам.",
          "required_change": "Записывать effective model identity, подтверждённую backend."
        }
      ],
      "assumptions": [
        "Verification state не обязан находиться в tracked JSON-файле.",
        "Публично документированные возможности backend считаются верхней границей гарантий до прохождения acceptance suite.",
        "Неизвестный purpose в brownfield не разрешено заменять правдоподобной догадкой."
      ],
      "round": 1,
      "reviewer": "gpt56solxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
