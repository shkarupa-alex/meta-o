Раунд 4. Третья сверка по контрольным точкам подтверждает: тексты идентичны версиям, оценённым в раундах 2–3 (P1: §4.6 «полный QC после каждого commit», §10.6, pipeline §13.2 без verification-lint; P2: `canComplete()` без worktreeClean, `symbol_requires_link_one_level_up=false`, `code_globs=["src/**/*.py"]`, `anchor-check --gate done` по code_globs, RunState без sha256, tester пишет `tests/repro/**`; P3: `E2E_ROUND(pass @ sha) ∧ sha==HEAD → KNOWLEDGE_SYNC → DONE`, `spec_ref` без digest, brownfield bootstrap по затрагиваемым областям, `metao`-футеры). Вердикт детерминирован на неизменном входе и стабилен; ниже — консолидированный пересмотр без изменений оценок.

## Facts & Constraints (White Hat)

- Proposal-1 корректно замыкает инвариант задания («одна и та же Git-ревизия … без последующих изменений»): knowledge sync завершается до финальных gates, post-attestation — ровно один guarded metadata-only commit. Это единственное из трёх предложений, где модель завершения внутренне непротиворечива.
- Proposal-2: `canComplete()` не проверяет чистоту worktree; переход в `DONE` выполняет `final knowledge-sync` и `retire spec` после вычисления критерия — post-attestation коммиты с изменениями `§B/§A` уходят без review и без guard; sha256 спеки нет; `tests/` исключены из purpose/health; `anchor-check --gate done` ищет `§*-TODO-*` в `code_globs`, хотя TODO-якоря живут в `docs/`.
- Proposal-3: фаза `KNOWLEDGE_SYNC` стоит после `E2E_ROUND(pass) ∧ sha==HEAD` — её tracked-коммиты (дистилляция в `§A/§B`, `verification.md`, удаление спеки) не проверяет ни один контур; digest спеки отсутствует; brownfield bootstrap «только затрагиваемые области» конфликтует с механическим all-symbol purpose.
- Capability-контракт Proposal-1 (replayable ordered events, structured run state, safe reconcile) — ставка на непроверенные возможности Herdr/Omnigent при запрете компенсирующего runtime; требует capability spike шагом 0 с точкой решения о деградации.

## Risks & Failure Modes (Black Hat)

- **P2, порядок завершения:** запись `verification-state.json` tester'ом без определённого коммит-пункта → критерий может пройти на грязном worktree; post-DONE sync-коммит сдвигает HEAD; итоговое состояние репозитория не аттестовано.
- **P2, мёртвые механизмы:** carve-out doc-only не подключён к FSM (нет актора cheap re-review); `--gate done` проверяет не ту glob-область.
- **P2/P3, неизменяемость спеки:** ни digest, ни `SPEC_MUTATED`, ни preflight чистоты — hard rule без механизма.
- **P3, память протокола:** §2.1.3 декларирует «роли не обязаны помнить протокол», но turn-dispatch стоит на дисциплине `metao`-футеров сквозь компакции; идемпотентность nudge эвристическая — idle-сессия может принять её за новую задачу.
- **P3, brownfield:** repo-wide purpose-lint либо вечно падает на нетронутом коде, либо constraint тихо разбавляется scoped-конфигом.
- **P1, остаточное:** stateless knowledge-lint с фазово-зависимыми правилами; §4.6 против собственной ledger-строки; `verification-lint.mjs` вне pipeline §13.2; актор metadata-коммита не назван; solution-scan без исполнителя; untracked-спека vs preflight; restart после `FAILED_BACKEND`; самоклассификация DecisionRequest.

## Strengths & Benefits (Yellow Hat)

- **P1:** эталонная согласованность + полный набор механизмов: TurnEnvelope с turnSeq/idempotency, ordered events с gap-reconcile, binding adjudicator (`insufficient_evidence` → deterministic experiment), wontfix без архива дебатов, missing-tools protocol, review-loop с digest-аттестацией, план с failure injection.
- **P2:** лучшая декомпозиция документов; committed-решения; явный `canComplete()` с `open_findings_count==0`; линзы ревьюеров; нормативные трассы; реестр калибруемых параметров.
- **P3:** stateless state file (оркестратор переживает полную смерть — watchdog пересоздаёт его с нуля); expectation/timeout/poll; smoke pre-flight; исключение purpose/anchor из pre-commit; `flake|defect`-классификация; lessons-learned loop без ledger; glossary.

## Alternatives & Creative Ideas (Green Hat)

1. Объединение: ядро P1 + stateless state file P3 (закрывает терминальность `BACKEND_STATE_LOST` у P1) + smoke pre-flight P3 + линзы P2 + лёгкая TODO-проекция P2/P3.
2. Общеобязательный паттерн «sync-before-attestation»: все knowledge/verification записи — до финального cross-review; post-attestation — один guarded metadata commit. Закрывает главную находку раунда в P2 и P3 одной строкой FSM.
3. Pathset-аттестация (SHA + хэш множества путей) как общая замена carve-out P2 и metadata-guard P1.
4. Capability spike шагом 0 для P1 с документированной точкой решения о `DEGRADED_DELIVERY`.
5. Внешний `~/.metao/spec-archive/` из P3 — опция для untracked-спек в P1.

## Completeness & Process (Blue Hat)

- **P1:** остаток редакционный — актор metadata-коммита, исполнитель solution-scan, whitelist локатора спеки, restart-семантика `FAILED_BACKEND`, контракт `agent-entry.md`, staged adoption волнами, маппинг эскалации solution-scan.
- **P2:** не закрыты digest спеки, preflight, покрытие tests, проводка carve-out в FSM, worktree-чистота в `canComplete()`, состояние missing-tools, границы tester, gitignore `.meta-o/`, формат handoff.
- **P3:** не закрыты порядок sync/attestation, digest спеки, brownfield purpose-coverage, scope purpose-lint для tests, изоляция worktree проверяющих ролей, missing-tools, схемная проверяемость `verification.md`.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "Текст неизменен; вердикт стабилен. Сильный master-spec с committed-решениями, явным canComplete(), линзами ревьюеров и нормативными трассами, но четыре блокирующие находки стоят: canComplete() не проверяет чистоту worktree, запись verification-state.json tester'ом не имеет определённого коммит-пункта, а переход в DONE выполняет final knowledge-sync и retire spec уже после вычисления критерия — post-attestation коммиты с изменениями §B/§A без review и без guard; carve-out doc-only не подключён к FSM (нет актора cheap re-review); digest неизменяемой спеки отсутствует; tests исключены из purpose/health при hard constraint 'каждая сущность'. Плюс механическая ошибка: anchor-check --gate done ищет §*-TODO-* в code_globs, хотя TODO-якоря живут в docs. Дизайн близок к принятию, но контракты завершения требуют ещё одной итерации.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "completion-order",
          "description": "canComplete() без worktreeClean; запись verification-state.json tester'ом без определённого коммит-пункта; переход в DONE выполняет final knowledge-sync + spec retirement ПОСЛЕ критерия — tracked-коммиты с изменениями §B/§A без review и без guard; итоговое состояние репозитория не аттестовано",
          "required_change": "Завершать knowledge sync ДО финальной аттестации; post-attestation разрешить только guarded metadata-only commit; добавить worktreeClean в canComplete()"
        },
        {
          "id": "",
          "severity": "major",
          "area": "invalidation-model",
          "description": "Carve-out 'doc-only не инвалидирует E2E' не подключён к FSM: у 'дешёвого re-review diff знаний' нет актора, контракта и строки в таблице переходов — механизм мёртв, а строгое равенство ревизий остаётся",
          "required_change": "Ввести модель применимости аттестации (SHA + pathset) и контракт лёгкого knowledge re-review с исполнителем и гейтом"
        },
        {
          "id": "",
          "severity": "major",
          "area": "spec-immutability",
          "description": "Нет sha256-спеки, нет детекции SPEC_MUTATED, нет preflight-фазы чистоты worktree (INIT сразу в REUSE_SCAN)",
          "required_change": "Digest в RunState + терминальная ошибка при мутации + preflight-гейт"
        },
        {
          "id": "",
          "severity": "major",
          "area": "purpose-coverage",
          "description": "code_globs=['src/**/*.py'] исключает tests/ из purpose-lint и health-метрик при hard constraint 'каждая сущность'",
          "required_change": "Включить tests с path_overrides"
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "anchor-check",
          "description": "--gate done запрещает §*-TODO-* в code_globs, но TODO-якоря создаются в docs (doc_globs): гейт проверяет не ту область и фактически не работает",
          "required_change": "Проверять doc_globs (и src при желании), не code_globs"
        },
        {
          "id": "",
          "severity": "major",
          "area": "traceability",
          "description": "symbol_requires_link_one_level_up=false переводит обязательную ссылку 'один уровень вверх' с линтера на ревьюера, а задание требует 'линтер проверяет наличие purpose и необходимой ссылки'",
          "required_change": "Вернуть линтеру проверку ссылки либо зафиксировать отступление как осознанное решение совета с правилом containment-as-link"
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
          "description": "Tester пишет tests/repro/** — граница ролей и glob-классификация (code? doc?) не определены; .meta-o/ не объявлен gitignored; handoff без формата и лимита",
          "required_change": "Постоянные тесты — только через findings к implementer; объявить .meta-o gitignored; формат handoff"
        }
      ],
      "assumptions": [
        "'Дешёвый re-review diff знаний' трактовал как требующий явного контракта, а не как риторический приём",
        "Включение orchestrator в ModelSet — допустимое надмножество",
        "Reconciliation поверх backend не штрафовал — она отвечает критическому дефекту автора №19"
      ],
      "round": 2,
      "reviewer": "kimik3reasoning"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
