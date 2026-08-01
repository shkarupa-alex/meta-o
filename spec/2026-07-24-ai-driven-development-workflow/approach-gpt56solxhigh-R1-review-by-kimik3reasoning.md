Все шесть исходных документов изучены (`my-opinion.md`, `grace.md`, `my-memory-layers-scratchpad.md`, `sdd-issues.md`, `my-old-methodology-ouroboros.md`, `old-sdd-compare.md`). Ниже — стресс-тест трёх предложений.

## Facts & Constraints (White Hat)

Проверяемые ограничения, против которых меряются оба дизайна:

- Инвариант завершения задания: «одна и та же Git-ревизия последовательно прошла два независимых review и E2E **без последующих изменений**». Любой коммит после аттестации — включая коммит `verification-state.json` — порождает новую ревизию. Это комбинаторное ограничение, а не вкусовой момент.
- Proposal-1 разрешает его корректно: metadata-only commit с механическим guard («diff содержит только этот файл») и записью parent-ревизии в payload. Замкнуто.
- Proposal-2 — нет. Его собственные правила: `VerificationRecord.git_rev` + «`stale` выставляется автоматически при `git_rev != HEAD`» + инвариант `DONE ⇔ review_clean_rev === e2e_clean_rev === head_rev`. Запись состояния коммитом меняет HEAD ⇒ свежая запись мгновенно stale, а `e2e_clean_rev ≠ head_rev` ⇒ `DONE` недостижим на основном пути. Это следствие двух собственных правил, а не моя интерпретация.
- Cognitive complexity для Python не имеет зрелого готового инструмента: Proposal-1 признаёт это отдельным компонентом (`code_health.py`); Proposal-2 ссылается на radon, который когнитивную сложность не считает.
- «Resume, доставка событий и управление сессиями — ответственность Herdr/Omnigent»: Proposal-1 читает буквально (backend без required capabilities отклоняется на preflight, компенсации запрещены); Proposal-2 добавляет reconciliation-петлю поверх backend. Второе формально выходит за рамку, но прямо отвечает критическому дефекту №19 из `my-opinion.md`. Обе трактовки защитимы — выбор должен быть сознательным.
- Hard constraint «purpose для каждого модуля, класса, функции и метода» включает тестовые модули. Proposal-1 покрывает явно («Tests являются first-party code» + path_overrides). Proposal-2 декларирует `code_globs = ["src/**/*.py"]` — `tests/` не покрыт ни purpose-lint, ни health-метриками.
- TODO-проекция — гипотеза «не принятая заранее». Proposal-1 отклоняет (transient `KnowledgeImpactPlan`), Proposal-2 принимает в облегчённой форме (`§B-TODO-*` якоря + запрет на DONE). Оба исхода аргументированы и легитимны; scratchpad автора уже содержит практику `§B-TODO-*`, что косвенно поддерживает лёгкую форму.

## Risks & Failure Modes (Black Hat)

**Proposal-2, критическая цепочка:** E2E прошёл на R → tester пишет `verification-state.json` → коммит R′ → запись stale по собственному правилу → `e2e_clean_rev=R ≠ R′=head_rev` → не DONE → либо бесконечный регресс (E2E на R′ порождает R″…), либо молчаливое нарушение собственного инварианта. Писатель tracked-файла не определён: tester — нарушается дисциплина единственного писателя; executor — он не знает результата E2E заранее.

**Proposal-2, противоречие в инвалидизации:** carve-out «doc-only commit не инвалидирует E2E» несовместим со строгим равенством ревизий: после knowledge-sync-only коммита голова ушла, равенство ложно, а «дешёвый re-review только diff знаний» не имеет ни исполнителя, ни контракта.

**Proposal-2, дыра в hard rule:** неизменяемость спеки не обеспечена ничем — в `RunState` есть `spec_ref`, но нет digest, нет детекции мутации, нет preflight чистоты worktree, не определена изоляция worktree ревьюеров/тестировщика.

**Proposal-1, реальные но уточняемые отказы:**

1. `knowledge-lint` — stateless инструмент, но два его правила фазово-зависимы («отсутствие активной tracked feature-spec после sync», «отсутствие завершённых записей в `docs/todo.md`»). Полный `./tools/qc` после каждого коммита: либо ранние коммиты executor падают на ещё-живой спеке, либо правило мертво.
2. `DecisionRequest.specImpact` и `reversible` заполняет сам executor; оркестратор, не читающий код, не может проверить самоклассификацию — ошибочный `specImpact: "none"` обходит пользовательскую эскалацию.
3. Preflight блокирует «неигнорируемые untracked files», но untracked-спека внутри репозитория сама заблокирует запуск.
4. `BACKEND_STATE_LOST` → `FAILED_BACKEND` без семантики рестарта: новый run на той же ветке ломает `baseRevision` и preflight чистоты.

**Оба:** run state целиком в backend — единая точка отказа; purpose cargo cult на тысячах символов brownfield сдерживается только ревьюерами; 100%-покрытие одной adoption-feature практически неподъёмно для крупного legacy.

## Strengths & Benefits (Yellow Hat)

**Proposal-1:** плотная машинная корректность — sha256 + `SPEC_MUTATED`; `RevisionAttestation` на одном SHA; разрешение SHA-рекурсии; capability-preflight; формализованные generated-исключения (glob+marker+generator); ratchet-базлайн; `project-adopt`; девять кодов ошибок; план внедрения с failure injection — единственный вариант, где надёжность проверяется, а не декларируется; доменное шардирование `docs/business/` merge-friendly для команды; честная критическая таблица с выделением самого сомнительного решения (all-symbol purpose).

**Proposal-2:** глубочайшее прочтение исходников и несколько лучших механизмов консилиума, которых нет у Proposal-1: `SessionAdapter` с монотонным `turnSeq` и идемпотентным resume (механический ответ на дефект №19 автора); `adjudicator` — разрешение парадокса «оркестратор не читает код, но разрешает споры»; `missing_tools` → эскалация вместо молчаливо-зелёного QC; wontfix с обязательным in-code обоснованием; standalone `meta-o:review-loop` (пункт 14 «решённого» автора); динамическая гранулярность purpose; OS-супервизор для watchdog («кто стережёт watchdog»); полная пяти-частная критика семи решений автора.

## Alternatives & Creative Ideas (Green Hat)

1. Унифицировать инвариант: аттестация = (SHA, pathset-hash); новый коммит сохраняет аттестацию iff `diff ∩ pathset = ∅` — покрывает и metadata-guard Proposal-1, и doc-carve-out Proposal-2 без противоречий.
2. Мерж: каркас Proposal-1 + `turnSeq`/идемпотентный resume, adjudicator, `missing_tools`-эскалация, wontfix-комментарии, standalone review-loop из Proposal-2.
3. Staged adoption волнами по `source_root` вместо одной feature на 100% символов.
4. Git notes для verification state — Proposal-1 отклонил из-за PR-переносимости, аргумент принят, но при смене CI-политики вернуться.
5. Нарушающая constraint альтернатива для протокола: risk-based scope purpose — сам GRACE-источник фиксирует «тривиальные private helper'ы не надо превращать в бюрократический проект», т.е. источник идей противоречит букве hard constraint.
6. Для Proposal-2: гибрид — capability-preflight Proposal-1 + деградация в poll-режим с явным пользовательски видимым статусом `DEGRADED_DELIVERY` вместо молчаливой компенсации.

## Completeness & Process (Blue Hat)

**Proposal-1:** все четыре измерения на уровне implementation-ready контрактов. Пробелы: `docs/agent-entry.md` без контракта содержимого; исполнитель solution-scan не назван; `verification-lint.mjs` дублирует `knowledge-lint.mjs`; подспеки поставлены inline; standalone review-cube из `my-opinion.md` не адресован; эскалация из solution scan не привязана к состоянию автомата.

**Proposal-2:** лучшая декомпозиция документов (шесть подспек с контрактами). Пробелы: нет preflight-спеки вообще; нет изоляции worktree проверяющих ролей; план внедрения — один абзац против 12 шагов с критерием готовности; нет failure-injection валидации; handoff без формата; `meta-o.models.json` без локации; «merged-коде» — термин вне Git-модели методологии; `evidence_ref` — указатель на неопределённое хранилище.

**Proposal-3:** пустой артефакт («PONG»).

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-1",
      "approval_score": 8,
      "would_adopt": true,
      "summary": "Самое механически цельное предложение: digest-фиксация неизменяемой спеки, RevisionAttestation на одном SHA, корректное разрешение SHA-рекурсии verification state через metadata-only commit, capability-контракт backend вместо компенсирующего runtime, формализованные generated-исключения, ratchet-базлайн и честный путь brownfield-adoption, полная таксономия ошибок и план внедрения с failure injection. Я активно искал внутренние противоречия в инвариантах и не нашёл: все дефекты — уточняемые пробелы спецификации (фазовая зависимость knowledge-lint, самоклассификация DecisionRequest исполнителем, неопределённый исполнитель solution-scan, edge-case untracked-спеки в preflight, семантика рестарта после потери backend state, практический масштаб 100%-purpose adoption). Принимать как основу; перенести из proposal-2 turnSeq/идемпотентный resume, adjudicator, missing_tools-эскалацию, wontfix-комментарии и standalone review-loop.",
      "phase": "approach-review",
      "confidence": "high",
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "knowledge-lint",
          "description": "Правила 'отсутствие активной tracked feature-spec после sync' и 'отсутствие завершённых записей в docs/todo.md' фазово-зависимы, но линтер stateless: полный ./tools/qc после каждого коммита либо падает на ещё-живой спеке в середине run, либо правило мертво",
          "required_change": "Определить механизм: удаление tracked-спеки первым коммитом executor, машинный маркер завершения для todo-записей или конвенция расположения спек, известная линтеру"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "decision-protocol",
          "description": "DecisionRequest.specImpact и reversible заполняет сам executor; оркестратор, не читающий код, не может проверить классификацию — ошибочный specImpact:'none' обходит пользовательскую эскалацию",
          "required_change": "Явно зафиксировать остаточный риск и сделать независимое мнение reviewer обязательным при любом сомнении, а не опциональным"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "lifecycle",
          "description": "Solution scan объявлен шагом со skill'ом, но не названа исполняющая роль/сессия; эскалация business_escalation не привязана к состоянию автомата",
          "required_change": "Назначить исполнителя scan (эфемерная сессия или executor до старта реализации) и маппинг эскалации на PAUSED_EXTERNAL"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "preflight",
          "description": "Гейт 'неигнорируемые untracked files блокируют запуск' конфликтует с untracked-спекой, лежащей внутри репозитория",
          "required_change": "Whitelist локатора спеки в правиле чистоты worktree"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "failure-semantics",
          "description": "BACKEND_STATE_LOST → FAILED_BACKEND без семантики рестарта: новый run на той же ветке ломает baseRevision и preflight чистоты",
          "required_change": "Определить процедуру restart-from-branch: переякорение base, повторное использование ветки, перенос openFindings"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "adoption",
          "description": "100% purpose-покрытие всех first-party символов одной adoption-feature практически неподъёмно для крупного brownfield и непроверяемо двумя ревьюерами",
          "required_change": "Допустить staged adoption волнами по source_root с тем же финальным критерием"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "completeness",
          "description": "docs/agent-entry.md введён без контракта содержимого; verification-lint дублирует knowledge-lint; standalone review-loop-кубик из my-opinion.md не адресован",
          "required_change": "Доопределить артефакты и добавить сценарий автономного вызова review-gate"
        }
      ],
      "assumptions": [
        "Фаза оценки — approach-review: подспеки достаточно специфицировать по содержанию, отдельные файлы артефактов на этом этапе не требуются",
        "При расхождении текста задания и исходных документов приоритет отдавался тексту задания (например, буквальные 'четыре роли' model set)",
        "Backend state как единственная точка хранения run state принят осознанным компромиссом, а не дефектом, поскольку durable-результаты всё равно живут в Git"
      ],
      "round": 1,
      "reviewer": "kimik3reasoning"
    }
  ]
}
```

---REVIEW-META---
approval_score: 8
would_adopt: true
