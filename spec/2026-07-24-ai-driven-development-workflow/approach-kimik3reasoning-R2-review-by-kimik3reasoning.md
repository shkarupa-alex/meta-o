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
      "target_id": "proposal-3",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "Текст неизменен; вердикт стабилен. Уникальные и ценные вклады: stateless-оркестратор с состоянием в feature-state.json (сильнейший ответ на страх компакции/смерти оркестратора — watchdog пересоздаёт его с нуля), expectation/timeout/poll-протокол, smoke pre-flight перед первым review, исключение purpose/anchor из pre-commit, flake|defect-классификация, lessons-learned loop без ledger, glossary. Блокирующее: фаза KNOWLEDGE_SYNC стоит после E2E-pass/аттестации, и её tracked-коммиты (дистилляция в §A/§B, verification.md, удаление спеки) не проходит ни один контур; digest неизменяемой спеки отсутствует; brownfield bootstrap 'только затрагиваемые области' конфликтует с механическим all-symbol purpose без спроектированного механизма. Плюс системное противоречие: turn-dispatch стоит на дисциплине metao-футеров — на памяти ролей сквозь компакции, которую §2.1.3 объявляет ненужной. Не принимать в текущем виде; stateless state file и smoke pre-flight — обязательно перенести в объединённый вариант.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "completion-order",
          "description": "FSM: E2E_ROUND(pass @ sha) ∧ sha==HEAD → KNOWLEDGE_SYNC → DONE; sync-коммиты (дистилляция decision log в §A/§B, обновление verification.md, retirement спеки) выполняются после аттестации и не проверяются ни review, ни E2E — включая изменения бизнес-слоя",
          "required_change": "Завершать knowledge sync до финального cross-review/E2E; post-attestation оставить только guarded metadata commit (модель proposal-1)"
        },
        {
          "id": "",
          "severity": "major",
          "area": "spec-immutability",
          "description": "spec_ref без sha256; мутация спеки недетектируема; preflight чистоты worktree отсутствует",
          "required_change": "Digest + SPEC_MUTATED + preflight-гейт чистоты"
        },
        {
          "id": "",
          "severity": "major",
          "area": "brownfield",
          "description": "Bootstrap '§B/§A только для затрагиваемых фичами областей' противоречит механическому all-symbol purpose: repo-wide purpose-lint либо вечно падает на нетронутом коде, либо constraint тихо разбавляется scoped-конфигом; механизм не спроектирован",
          "required_change": "Определить admission-модель: staged adoption по source_root с явным waiver-реестром либо полная adoption feature (модель proposal-1)"
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "protocol-memory",
          "description": "§2.1.3 декларирует 'роли не обязаны помнить протокол', но turn-dispatch полностью стоит на дисциплине metao-футеров — это и есть память протокола сквозь компакции; идемпотентность nudge эвристическая, idle-сессия может понять его как новую задачу",
          "required_change": "Ввести механический turnSeq в футер или признать футер-контракт исключением с watchdog-парсером и re-inject правил после компакции"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "purpose-coverage",
          "description": "Scope purpose/size-lint относительно tests/ не определён",
          "required_change": "Явно включить tests с overrides (или зафиксировать решение совета)"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "role-isolation",
          "description": "Механика review/E2E на exact sha не определена: нет detached worktree/изоляции сессий; tester обновляет tracked verification.md — граница писателей размыта",
          "required_change": "Detached worktrees для проверяющих ролей; единый писатель tracked files + guarded verification commit"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "failure-semantics",
          "description": "Missing-tool сценарий сведён к эскалации без протокола; verification.md как markdown-таблица слабее проверяема схемой, чем JSON (metao-verify-state частично закрывает)",
          "required_change": "Протокол missing-tools по модели proposal-1; JSON Schema для verification state"
        }
      ],
      "assumptions": [
        "Тексты раунда идентичны версиям предыдущих раундов по всем контрольным точкам; оценивал как те же документы",
        "Containment как механическую ссылку symbol→module принял как удовлетворяющее духу 'один уровень вверх'",
        "Параллельные фичи = параллельные оркестраторы принял как консервативное допущение, совместимое с Git/PR workflow"
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
