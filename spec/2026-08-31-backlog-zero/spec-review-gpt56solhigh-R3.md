Итог целевой проверки: коррекция заметно улучшила semantic inventory `real-runs`, но не закрыла полностью ни один из 25 перечисленных findings.

Ключевой остаток inventory-коррекции: детализирован `docs/backlog-issues-real-runs.md`, однако составная запись `docs/backlog.md:82–152` всё ещё сведена к одной строке. В ней отдельно находятся model configuration, hot-session ownership, `senior-*` integration, first-commit checklist/business harvest и cleanup/fallback — с разными owners и proofs. Кроме того, §4.5 по-прежнему формулирует общий selector как «после `## Открыто`», которого нет в real-runs ledger.

Обе именованные регрессии сохраняются:

- `REGRESSION-TUI-AUTHORITY-01`: диагностическая TUI-проекция всё ещё способна аннулировать authoritative `worker_done`.
- `REGRESSION-SEVERITY-GRAMMAR-20`: counts объявлены machine-checkable, но finding body не имеет однозначно парсируемой структурной грамматики; `[P0]`–`[P3]` могут встретиться в evidence, цитатах или code fences, а связь `Verdict` с findings/unknowns не формализована.

Все исправления остаются bounded-коррекциями утверждённых четырёх specs; смена product boundaries или restart proposals не нужны.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 5,
      "would_adopt": false,
      "summary": "Коррекция существенно улучшила semantic inventory frozen real-runs ledger: добавлены unheaded observations, именованные incident families, duplicate evidence и node roles. Однако lossless inventory остаётся неполным для многосоставной backlog-записи, selector двух разных документов не формализован отдельно, а исполнимую AST map всё ещё откладывают до реализации и удаляют перед final SHA. Остальные ранее открытые contracts не изменены. Именованные TUI-authority и severity-grammar regressions также сохраняются. Нужен bounded fix внутри существующих четырёх specs.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "FIND-SR-001",
          "severity": "major",
          "area": "provenance",
          "description": "Program provenance по-прежнему не фиксирует все обязательные входы воспроизводимыми Git objects.",
          "evidence": "§1 содержит base commit и два backlog blobs, но не задаёт commit/blob identities для senior skills и review research, использованных программой.",
          "required_change": "Добавить существующий commit/blob identity для каждого обязательного input либо единый воспроизводимый input bundle."
        },
        {
          "id": "FIND-SR-002",
          "severity": "major",
          "area": "lossless inventory",
          "description": "Semantic inventory улучшен, но остаётся неполным для составной записи docs/backlog.md.",
          "evidence": "Appendix сводит весь блок backlog lines 82–152 к строке «Реальный запуск review не прошёл», хотя внутри находятся самостоятельные wishes о model config, hot reviewers, senior-skill integration, first-commit artifacts, business harvest и cleanup. §4.5 также не задаёт отдельный root selector для real-runs, где отсутствует ## Открыто.",
          "required_change": "Добавить отдельные semantic obligations и frozen locators для самостоятельных nodes составной backlog-записи и формально определить root selector каждого source blob."
        },
        {
          "id": "FIND-SR-003",
          "severity": "major",
          "area": "closure proof",
          "description": "Доказательство AST bijection всё ещё удаляется перед окончательным SHA.",
          "evidence": "§4.7 удаляет map/test/spec; §4.8 лишь утверждает, что временный test прошёл до удаления, но на final SHA нет machine-checkable consumer, связывающего результат с точным pre-deletion SHA.",
          "required_change": "Определить воспроизводимый final-SHA verifier по frozen blobs либо сохраняемый obligation-level proof, который однозначно ссылается на проверенный SHA и результаты bijection."
        },
        {
          "id": "FIND-SR-004",
          "severity": "major",
          "area": "dependencies",
          "description": "Цикл Specs 2 и 3 не разрезан на исполнимые milestones.",
          "evidence": "Spec 2 зависит от readiness Spec 3, тогда как полный E2E Spec 3 использует lifecycle/review settlement Spec 2.",
          "required_change": "Назвать отдельные readiness и integration outputs и задать односторонние зависимости между ними."
        },
        {
          "id": "FIND-SR-005",
          "severity": "major",
          "area": "find-reuse",
          "description": "find-reuse всё ещё не имеет полного authority, applicability и external integration contract.",
          "evidence": "§1 не запрещает repository writes явно, не определяет deterministic source applicability и не показывает mapping Meta-O intent в request/report destination; многие adapter operations остаются сокращёнными.",
          "required_change": "Добавить read-only authority contract, applicability algorithm, Meta-O consumer mapping и полные executable adapter definitions."
        },
        {
          "id": "FIND-SR-007",
          "severity": "major",
          "area": "model configuration",
          "description": "Authoritative источник approved harness/model/effort не определён.",
          "evidence": "§2.6 ссылается на mo-setup posture/config без schema, location, resolution order или typed missing/invalid outcomes.",
          "required_change": "Определить существующий configuration surface, его schema, lookup/validation и failure behavior."
        },
        {
          "id": "FIND-SR-008",
          "severity": "major",
          "area": "Orca lifecycle",
          "description": "Real-runs inventory называет нужные состояния, но normative event contract их не представляет.",
          "evidence": "RequiredObservation не включает queued/active dispatch, sent/delivered/consumed/acknowledged delivery, input_blocked, output_blocked_after_work или unknown_effect как полную transition model.",
          "required_change": "Расширить native projection и определить допустимые transitions, precedence, confirmation и recovery для всех перечисленных states."
        },
        {
          "id": "FIND-SR-009",
          "severity": "major",
          "area": "skill evals",
          "description": "Program-wide eval inventory всех skills отсутствует.",
          "evidence": "Общий contract требует runs для изменяемых skills; Appendix упоминает отдельные scripts, но не назначает representative cases и owner каждому существующему public skill.",
          "required_change": "Добавить inventory всех skills с positive, negative, degraded cases и blocking/advisory policy."
        },
        {
          "id": "FIND-SR-010",
          "severity": "major",
          "area": "knowledge contracts",
          "description": "Anchor grammar и historical-DAG algorithm остаются недостаточно конкретными.",
          "evidence": "§4.3 не определяет допустимые Markdown contexts/serialization, а §4.4 — cutoff seed, merge-parent semantics, shallow-history failure и точную проверку owning decision.",
          "required_change": "Задать annotation grammar, AST library/serializer invariants и полный Git traversal/error contract."
        },
        {
          "id": "FIND-SR-011",
          "severity": "major",
          "area": "upstream closure",
          "description": "Capability boundary всё ещё неодинаково трактуется как closure и как blocked state.",
          "evidence": "§1 допускает confirmed upstream capability boundary, §4.6 не содержит такого disposition, а §3.12 требует fix или qualifying workaround.",
          "required_change": "Унифицировать boundary как architecture-rejected с ADR/proof либо как блокирующее незавершённое состояние."
        },
        {
          "id": "FIND-SR-012",
          "severity": "major",
          "area": "decomposition",
          "description": "Нет critical-path matrix малых independently verifiable increments.",
          "evidence": "Добавленный inventory назначает owners/proof families, но не implementation increments с входом, артефактом, зависимостью и gate.",
          "required_change": "Добавить milestone matrix внутри четырёх утверждённых specs."
        },
        {
          "id": "INVENTORY-LOSS-01",
          "severity": "major",
          "area": "inventory",
          "description": "Коррекция закрывает большую часть real-runs inventory, но оставляет самостоятельные backlog nodes под одной широкой строкой.",
          "evidence": "В частности, frozen backlog lines 111, 117–120, 132–147 и 149–152 имеют разные obligations/owners, отсутствующие как distinct semantic locators Appendix A.",
          "required_change": "Декомпозировать многосоставную backlog-запись до самостоятельных semantic obligations и distinct evidence locators."
        },
        {
          "id": "PROVENANCE-FRAGILE-02",
          "severity": "major",
          "area": "provenance",
          "description": "Line locators real-runs теперь привязаны к blob, но provenance всей программы остаётся неполной.",
          "evidence": "RR locators воспроизводимы, однако остальные обязательные research/skill inputs не имеют равнозначной frozen identity.",
          "required_change": "Распространить blob/commit provenance contract на каждый обязательный источник."
        },
        {
          "id": "FIND-REUSE-ORPHAN-03",
          "severity": "major",
          "area": "find-reuse integration",
          "description": "У portable report по-прежнему нет именованного Meta-O invocation/destination flow.",
          "evidence": "Spec 2 перечисляет review integration, но не определяет, какой skill вызывает find-reuse, как строится request и куда валидированный report встраивается.",
          "required_change": "Добавить внешний Meta-O integration contract без переноса lifecycle semantics внутрь find-reuse."
        },
        {
          "id": "DOD-UNREACHABLE-04",
          "severity": "major",
          "area": "Definition of Done",
          "description": "Фраза о pre-deletion proof не делает final DoD воспроизводимым на одном SHA.",
          "evidence": "Final SHA не содержит closure consumer/map, допускает неопределённый documentation carry-forward и зависит от конфликтующего upstream-boundary rule.",
          "required_change": "Задать точную final-gate sequence и доступный на deletion SHA набор immutable proof inputs."
        },
        {
          "id": "AST-INFEASIBLE-05",
          "severity": "major",
          "area": "AST transformation",
          "description": "TextNode API не обеспечивает заявленные byte-preservation и normalization guarantees.",
          "evidence": "§4.3 разрешает менять whitespace, требует сохранить остальные bytes, но не определяет token boundaries, source offsets и serializer.",
          "required_change": "Определить concrete syntax, AST/token representation, serializer и canonical byte comparison."
        },
        {
          "id": "JSDOC-ALREADY-DONE-06",
          "severity": "major",
          "area": "symbol purpose",
          "description": "Spec не отделяет существующий JSDoc baseline от новой проверки architecture identifier.",
          "evidence": "§4.2 повторяет общий public-symbol JSDoc gate, но не задаёт точный incremental rule, legacy migration scope и eligibility semantics.",
          "required_change": "Зафиксировать baseline и определить конкретную новую ESLint configuration/rule и fixtures для §A-* content."
        },
        {
          "id": "BIJECTION-UNSAT-07",
          "severity": "major",
          "area": "closure bijection",
          "description": "Расширенная node-role модель всё ещё имеет несогласованные executable semantics.",
          "evidence": "Общий selector сформулирован через ## Открыто для обоих blobs; Appendix cells используют составные роли вроде «obligation + evidence», хотя schema разрешает только одно enum value; test говорит adopted obligation, но adopted отсутствует среди dispositions.",
          "required_change": "Определить отдельные document roots, одну роль на AST row, obligation-level disposition schema и валидные cross-row references."
        },
        {
          "id": "HOT-REVIEWER-CONTRACT-08",
          "severity": "major",
          "area": "review lifecycle",
          "description": "Inventory уточняет retention wish, но normative hot-reviewer contract остаётся условным.",
          "evidence": "§2.6 сохраняет reviewers hot только «если backend capability это поддерживает» и не определяет required terminal-level fallback, re-dispatch semantics или blocking outcome.",
          "required_change": "Закрепить exact retention capability, terminal/Dispatch ownership transitions, replacement и acceptance behavior."
        },
        {
          "id": "ADAPTER-CMD-UNGATED-10",
          "severity": "major",
          "area": "find-reuse adapters",
          "description": "Обязательные adapter commands остаются неполными и version-sensitive.",
          "evidence": "Матрица содержит --json ..., server API, exact package API и другие placeholders; optional live probes не квалифицируют их как поддерживаемое обязательное ядро.",
          "required_change": "Указать exact argv/API requests, minimum versions, parsers и blocking fake-endpoint fixtures."
        },
        {
          "id": "FINAL-GATE-SCOPE-11",
          "severity": "major",
          "area": "final gate",
          "description": "Final gate по-прежнему смешивает pre-cleanup и deletion-SHA proofs.",
          "evidence": "§2.9 и §4.7 удаляют tracked intent/proof artifacts после прежних gates, а §4.8 допускает carry-forward без формального immutability/applicability contract.",
          "required_change": "Определить один deletion SHA, заново выполняемые gates и строгие правила применения immutable external evidence."
        },
        {
          "id": "QWEN-CONSTANT-12",
          "severity": "major",
          "area": "local model profile",
          "description": "Qwen задан display name, а не executable OpenCode profile identity.",
          "evidence": "§3.9 не содержит provider/model locator, weight digest, context parameters или команду проверки effective identity.",
          "required_change": "Задать profile schema и exact requested/effective model verification."
        },
        {
          "id": "LEDGER-GAPS-13",
          "severity": "major",
          "area": "decision ledger",
          "description": "Новые inventory decisions добавлены, но ledger всё ещё не покрывает все normative choices тела.",
          "evidence": "Отсутствуют отдельные entries для shell enforcement boundary, source-only anchors, historical trailers, unknown_effect behavior, hot-session fallback и final-proof retention.",
          "required_change": "Выполнить body-to-ledger bijection для adopted и rejected/deferred decisions."
        },
        {
          "id": "REGRESSION-TUI-AUTHORITY-01",
          "severity": "critical",
          "area": "review delivery",
          "description": "Диагностическая TUI projection всё ещё может аннулировать authoritative worker_done.",
          "evidence": "§2.6 называет worker_done единственным authoritative report, но missing/mismatched terminal projection переводит delivery в UNKNOWN и требует исправления тем же worker после завершения Dispatch.",
          "required_change": "Оставить worker_done authority. Проверять TUI projection как отдельный UX acceptance outcome, не как основание отвергнуть принятый report."
        },
        {
          "id": "REGRESSION-SEVERITY-GRAMMAR-20",
          "severity": "major",
          "area": "review report grammar",
          "description": "Machine-checkable severity counts не поддержаны однозначной структурной грамматикой report body.",
          "evidence": "Finding обозначается строкой [P0|P1|P2|P3], но не определены Findings/Unknowns boundaries, escaping и исключение code fences/цитат. Поэтому literal [P1] в Evidence или вложенном prior report может ошибочно изменить Projection counts; также не определено соотношение PASS/FINDINGS/UNKNOWN с количеством опубликованных findings.",
          "required_change": "Определить AST-parsable Markdown grammar: обязательные sections, отдельное severity field каждого finding, parser scope, escaping/code-fence rules и verdict invariants для zero, nonzero и unknown cases."
        }
      ],
      "assumptions": [
        "Проверка выполнена против frozen blobs 8d11d1107eb5875235c2830e6503f7e1265317d7 и c75859372fa7d794269cc6dcc8834c069ddd8096.",
        "Semantic line ranges Appendix A рассматриваются только как human-readable index; они не считаются заменой обещанной AST node map.",
        "Никакие prior council artifacts под spec/** не читались и не использовались.",
        "Все требуемые изменения являются bounded-коррекциями существующих четырёх specs и не требуют пересмотра frozen product decisions."
      ],
      "round": 3,
      "reviewer": "gpt56solhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 5
would_adopt: false
