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
      "target_id": "proposal-1",
      "approval_score": 8,
      "would_adopt": true,
      "summary": "Четвёртая проверка подтверждает: текст неизменен, вердикт стабилен. Самое механически цельное предложение консилиума: digest-фиксация спеки, RevisionAttestation на одном SHA, guarded metadata-only commit против SHA-рекурсии, полный протокол доставки (TurnEnvelope, ordered events, gap-reconcile, idempotent resume), binding adjudicator, wontfix с durable rationale, missing-tools protocol, standalone review-loop, capability preflight, план внедрения с failure injection. Блокирующих противоречий нет; остаточное — редакционные пробелы (актор metadata-коммита, исполнитель solution-scan, whitelist untracked-спеки, restart после FAILED_BACKEND, staged adoption) и два содержательных пункта: фазовая зависимость knowledge-lint без механизма и ставка на непроверенные capabilities Herdr/Omnigent при запрете компенсации — нужен capability spike шагом 0 с точкой решения о деградации. Принимать как основу; влить stateless state file и smoke pre-flight из proposal-3 и лёгкую TODO-проекцию из proposal-2/3.",
      "phase": "approach-review",
      "confidence": "high",
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "backend-capabilities",
          "description": "Обязательные capabilities (replayable ordered events, structured run state, safe reconcile) — требовательный контракт: если оба backend не пройдут preflight, методология не запускается, а 'не писать новый runtime' запрещает компенсацию; ставка на непроверенные факты",
          "required_change": "Capability spike как шаг 0 внедрения + документированная точка решения о деградированном режиме (poll с явным статусом DEGRADED_DELIVERY) при частичном покрытии"
        },
        {
          "id": "",
          "severity": "major",
          "area": "knowledge-lint",
          "description": "'Отсутствие закрытой tracked feature-spec' и 'отсутствие завершённых записей в docs/todo.md' фазово-зависимы, но линтер stateless и запускается в ./tools/qc после каждого коммита: либо false-fail в середине run, либо мёртвое правило",
          "required_change": "Определить механизм: удаление tracked-спеки первым коммитом executor, машинный маркер завершения todo-записи или конвенция расположения спек"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "qc-pipeline",
          "description": "§4.6 требует полный ./tools/qc после каждого commit, но decision ledger фиксирует 'full QC для каждого review candidate revision'; verification-lint.mjs объявлен отдельным инструментом, но не включён в последовательность §13.2",
          "required_change": "Унифицировать формулировки и включить verification-lint в pipeline (или явно слить с knowledge-lint)"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "completion",
          "description": "Актор metadata-only коммита verification-state не назван: executor завершил работу, orchestrator 'не пишет код', а 'единственная роль, меняющая tracked files' буквально нарушается",
          "required_change": "Явно назначить оркестратора создателем guarded metadata commit и внести исключение в границу ролей"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "lifecycle",
          "description": "Solution scan без исполняющей роли и без маппинга business_escalation на состояние автомата",
          "required_change": "Назначить эфемерную сессию или executor; маппить эскалацию на PAUSED_EXTERNAL"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "preflight",
          "description": "Гейт 'неигнорируемые untracked files' конфликтует с untracked-спекой внутри репозитория",
          "required_change": "Whitelist локатора спеки"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "failure-semantics",
          "description": "BACKEND_STATE_LOST → FAILED_BACKEND без restart-семантики: новый run на той же ветке ломает baseRevision и preflight",
          "required_change": "Определить restart-from-branch: переякорение base, reuse ветки, перенос openFindings"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "decision-protocol",
          "description": "DecisionRequest.specImpact/reversible заполняет сам executor; оркестратор, не читающий код, не может проверить самоклассификацию — обход пользовательской эскалации",
          "required_change": "Обязательное независимое мнение reviewer при любом сомнении; выборочная adjudication классификации"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "adoption",
          "description": "100% purpose одной adoption-feature неподъёмно для крупного brownfield",
          "required_change": "Staged adoption волнами по source_root с тем же финальным критерием"
        }
      ],
      "assumptions": [
        "Тексты раунда идентичны версиям предыдущих раундов по всем контрольным точкам; оценивал как те же документы",
        "При расхождении текста задания и исходников приоритет — тексту задания",
        "Runtime state в backend/disk вместо репозиторного ledger — осознанный компромисс, не дефект"
      ],
      "round": 2,
      "reviewer": "kimik3reasoning"
    }
  ]
}
```

---REVIEW-META---
approval_score: 8
would_adopt: true
