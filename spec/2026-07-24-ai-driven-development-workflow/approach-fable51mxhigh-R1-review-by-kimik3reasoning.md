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
      "target_id": "proposal-2",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "Концептуально глубочайшее прочтение исходников и несколько лучших механизмов всего консилиума: SessionAdapter с монотонным turnSeq и идемпотентным resume, adjudicator для споров без чтения кода оркестратором, missing_tools-эскалация вместо молчаливо-зелёного QC, wontfix с in-code обоснованием, standalone review-loop, OS-супервизор для watchdog. Однако ядро машинных контрактов содержит внутренние противоречия именно в тех артефактах, которые задание требует сделать точными: коммит verification-state.json ломает инвариант завершения и мгновенно делает запись stale по её собственному правилу; doc-only carve-out противоречит строгому равенству ревизий; неизменяемость спеки не обеспечена никаким механизмом; тесты выпадают из purpose/health-покрытия при hard constraint 'каждая сущность'. В текущем виде не принимать; уникальные механизмы обязательно перенести в объединённый вариант.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "verification-state",
          "description": "Запись verification-state.json коммитом создаёт новый HEAD: запись мгновенно 'stale' по собственному правилу (git_rev != HEAD), а e2e_clean_rev ≠ head_rev делает DONE недостижимым либо запускает бесконечный регресс E2E→commit→E2E; писатель tracked-файла не определён",
          "required_change": "Принять модель metadata-only commit с guard и ссылкой на проверенную parent-ревизию (как в proposal-1) либо pathset-применимость аттестаций"
        },
        {
          "id": "",
          "severity": "major",
          "area": "completion-invariant",
          "description": "Carve-out 'doc-only commit не инвалидирует E2E' противоречит строгому равенству review_clean_rev === e2e_clean_rev === head_rev: после knowledge-sync-only коммита равенство ложно; 'дешёвый re-review diff знаний' не имеет ни исполнителя, ни контракта",
          "required_change": "Заменить равенство SHA на модель применимости аттестации (SHA + pathset-hash) с определённым контрактом лёгкого re-review"
        },
        {
          "id": "",
          "severity": "major",
          "area": "spec-immutability",
          "description": "Hard rule 'feature-спека неизменяема' не обеспечено механизмом: нет digest, нет детекции мутации, нет preflight чистоты worktree и изоляции worktree ревьюеров/тестировщика на exact revision",
          "required_change": "Добавить sha256-дigest спеки с терминальной ошибкой при мутации и preflight-гейты чистоты/детаченных worktree"
        },
        {
          "id": "",
          "severity": "major",
          "area": "purpose-coverage",
          "description": "code_globs=['src/**/*.py'] исключает tests/: тестовые модули не получают ни purpose-lint, ни health-метрик при hard constraint 'purpose для каждого модуля, класса, функции и метода'; конъюнкция glob+marker+generator для generated-исключений не требуется",
          "required_change": "Включить tests в покрытие с path_overrides (как в proposal-1) и потребовать одновременное совпадение glob+marker+generator"
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "knowledge-layer",
          "description": "Единый docs/knowledge/business.md в командной работе — источник merge-конфликтов; proposal-1 шардирует по доменам именно по этой причине",
          "required_change": "Шардировать business layer по устойчивым доменам"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "knowledge-layer",
          "description": "Синтаксическая форма ссылки symbol→module ('один уровень вверх') не определена: без §M-якоря ссылка на модуль не grep-стабильна",
          "required_change": "Ввести модульные якоря или точный формат ссылки"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "tooling",
          "description": "Стек pylint+ruff+radon одновременно — избыточные пересекающиеся проверки и двойная поддержка конфигов; radon не считает когнитивную сложность",
          "required_change": "Оставить ruff + один специализированный анализатор или собственный AST-компонент"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "verification-state",
          "description": "evidence_ref — 'указатель, НЕ сырые логи/скриншоты': не определено, где живут сырые артефакты; указатель на несуществующее гниёт",
          "required_change": "Определить retention-правило evidence или отказаться от указателя"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "process",
          "description": "Нет плана валидации отказов (failure injection) и детальной декомпозиции внедрения; model set хранится в meta-o.models.json без указания локации (проект vs пользовательская конфигурация)",
          "required_change": "Добавить план инъекции отказов и явную локацию пользовательских дефолтов"
        },
        {
          "id": "",
          "severity": "minor",
          "area": "terminology",
          "description": "'merged-коде' в anchor-check — термин вне Git-модели методологии (локальные коммиты, PR только по просьбе пользователя)",
          "required_change": "Переформулировать через состояние run/ревизию"
        }
      ],
      "assumptions": [
        "Инвариант завершения задания трактовал буквально ('без последующих изменений' — любых, не только кодовых), поэтому doc-carve-out требует явной модели применимости",
        "Reconciliation-петлю поверх backend считал допустимой прагматичной компенсацией, а не нарушением 'не писать control layer', и не штрафовал за неё",
        "Включение оркестратора в ModelSet (5 ролей вместо 4) считал допустимым надмножеством, а не нарушением"
      ],
      "round": 1,
      "reviewer": "kimik3reasoning"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
