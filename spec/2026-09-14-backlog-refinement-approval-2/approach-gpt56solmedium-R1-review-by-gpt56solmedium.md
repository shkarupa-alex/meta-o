## Facts & Constraints (White Hat)

Обе версии правильно выделяют главный инвариант: пустота backlog должна проверяться только на named finalization boundary, а обычный `make mo-qc` обязан оставаться зелёным при корректном временном backlog. Это сохраняет §3.1, §14 и rejected-решение §16 исходной спецификации.

Proposal 2 точнее размещает gate: непосредственно перед native MR-create write и повторно перед merge write, с привязкой к актуальному SHA. Proposal 1 смешивает три разных события: pre-freeze closure, создание/ready-переход MR и CI после создания MR.

Есть общий неразрешённый конфликт с действующим `methodology.md` §7. Сейчас harvest knowledge и удаление spec происходят после review loop, applicable E2E и пользовательского merge decision. Обе версии переносят harvest и удаление spec до создания MR, не фиксируя, какое ранее принятое решение этим изменяется. Это нельзя оставлять неявным: MR часто является поверхностью, на которой человек принимает merge decision.

## Risks & Failure Modes (Black Hat)

Proposal 1 содержит критическое архитектурное противоречие. Исходная спецификация говорит, что test-only evaluator живёт только в `tests/`, не участвует в lifecycle, а любая executable logic сверх таблицы переоткрывает D-19. Здесь `tests/backlog-closure-gate.test.mjs` становится runtime evaluator, напрямую вызываемым `make mo-backlog-empty`. Название «test-only» не меняет фактической роли. Нужно явно авторизовать узкий project-owned checker и скорректировать D-19 либо найти зрелый инструмент; маскировать runtime checker тестом нельзя.

Предложенный Proposal 1 anti-drift check через `make --dry-run mo-qc` внутри самого `mo-qc` рекурсивен: обычный запуск `mo-qc` вызывает проверку, которая снова строит `mo-qc`. Это может уйти в неограниченную рекурсию. Такой assertion должен исследовать статическую модель Makefile без запуска из проверяемой цели либо быть обычным тестом зависимости.

CI-схема Proposal 1 технически не обеспечивает заявленный G3. Pipeline базовой ветки запускается после merge и уже не может его блокировать. Для реального pre-merge enforcement нужен успешный MR pipeline на текущем source SHA либо merged-results/merge-train pipeline на фактически интегрируемом candidate; default-branch job остаётся только post-merge regression signal.

Proposal 1 также противоречит сам себе по Draft MR: G2 объявляет gate перед созданием MR, но затем разрешает ранний Draft и планирует сделать его job `allow_failure`. Это уже другая продуктовая семантика, не подтверждённая формулировкой пользователя.

В Proposal 2 typed exit contract `0/1/2` несовместим с публичным интерфейсом `make mo-backlog-empty`: GNU Make обычно возвращает собственный status `2` при любой ошибке recipe, поэтому caller не сможет отличить дочерние exits `1` и `2`. Следует использовать стабильный typed diagnostic в stdout/stderr либо публично вызывать checker напрямую; различие `BLOCKED`/`UNKNOWN` нельзя обещать через exit status Make без доказанного механизма.

Proposal 2 тоже вводит исполняемый checker с branching, хотя исходный D-19 требует отдельного решения при появлении такой логики. Обоснование «линтер не умеет» полезно, но недостаточно: ledger должен явно отметить узкое superseding/extension прежнего запрета.

## Strengths & Benefits (Yellow Hat)

Обе версии хорошо закрывают важные требования:

- missing, unreadable и malformed backlog не считаются пустыми;
- checker read-only и не выполняет disposition автоматически;
- mid-feature QC не блокируется;
- `mo-setup` только диагностирует и предлагает CI patch;
- dynamic/unresolved includes не дают ложного `covered`;
- наличие CI job не выдаётся за реальное merge enforcement без server-side policy;
- acceptance, deterministic fixtures, E2E и decision ledger предусмотрены.

Сильные стороны Proposal 1 — стабильные typed tokens вместо ненадёжной попытки передать дочерний exit через Make и более осторожная классификация CI include graph.

Сильные стороны Proposal 2 — однозначное `and` между pre-create и pre-merge gates, повторная проверка после изменения SHA, признание того, что CI не способен предотвратить само создание MR, и более корректное расширение существующих `§B-LONGEVITY-04`/`§A-BACKLOG-01` вместо создания второго владельца того же empty-closure инварианта.

## Approved-boundary verification (Green Hat constrained)

Разделение ordinary QC и closure gate переоткрывать не требуется: обе версии в основном его сохраняют.

Конкретные регрессии ранее утверждённых границ всё же есть:

- обе версии молча меняют порядок §7 относительно user merge decision;
- Proposal 1 превращает строго test-only evaluator в production lifecycle consumer вопреки D-19 и §14.1;
- Proposal 1 создаёт `§A-BACKLOG-02`, хотя `§A-BACKLOG-01` уже утверждён как владелец empty closure, создавая пересекающуюся архитектурную ответственность;
- Proposal 2 вводит runtime checker, но не записывает необходимое узкое изменение границы D-19.

## Completeness & Process (Blue Hat)

Proposal 1 чрезмерно детализирован в местах, где контракт ещё не определён. Он ссылается на «объявленный заголовок» открытого раздела, но описывает только извлечение пути из Knowledge table — источник canonical heading не задан. Его G1 одновременно назван стоящим «до freeze» и запускаемым на уже замороженном SHA. Эти противоречия следует устранить до включения в финальную спецификацию.

Proposal 2 ближе к исполнимому дополнению, но требует четырёх обязательных исправлений:

1. Согласовать pre-MR gate с существующим порядком §7 и явно изменить соответствующее ledger-решение.
2. Заменить недостижимый Make exit `0/1/2` на проверяемый typed-output contract или прямой CLI.
3. Явно авторизовать узкий runtime checker относительно D-19.
4. Нормировать, что default-branch pipeline не является pre-merge barrier; enforcement доказывается на MR/merged-result/merge-train candidate и отдельно — настройкой required successful pipeline.

После этих исправлений Proposal 2 является лучшей основой. Proposal 1 потребует более глубокой переработки архитектуры checker и CI semantics.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "Это более сильная основа: две обязательные точки, exact-SHA invalidation, отсутствие Draft-исключения, read-only setup и корректное признание ограничений CI сформулированы ясно. До принятия необходимо исправить технически недостижимый exit 0/1/2 через Make, явно согласовать runtime checker с D-19 и разрешить конфликт нового pre-MR порядка с утверждённым completion lifecycle.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "P2-MAKE-EXIT-COLLAPSE",
          "severity": "major",
          "area": "command contract",
          "description": "Публичный make target не сохраняет различие дочерних exit 1 и 2, поэтому обещанный typed result недостижим.",
          "evidence": "Proposal назначает make mo-backlog-empty exits 0, 1 и 2, хотя Make при ошибке recipe возвращает собственный failure status, обычно 2.",
          "required_change": "Использовать стабильный typed diagnostic token и один nonzero status через Make либо определить прямой project-owned CLI как typed interface."
        },
        {
          "id": "P2-D19-NARROW-SUPERSESSION",
          "severity": "major",
          "area": "architecture",
          "description": "Runtime checker содержит executable branching, но proposal не фиксирует требуемое изменение границы D-19.",
          "evidence": "Исходная §14.1 говорит, что любая executable logic сверх таблицы переоткрывает D-19; proposal вводит tools checker и утверждает сохранение прежних решений.",
          "required_change": "Добавить явное ledger-решение, авторизующее только read-only deterministic backlog checker и исключающее workflow, hosting writes и persisted state."
        },
        {
          "id": "P2-COMPLETION-ORDER",
          "severity": "major",
          "area": "approved lifecycle",
          "description": "Spec deletion и harvest перенесены до MR create без согласования с существующим user merge decision ordering.",
          "evidence": "Proposal §2.1 удаляет spec до MR; действующий methodology.md §7 делает это после review loop, E2E и пользовательского merge decision.",
          "required_change": "Нормативно определить, когда принимается user merge decision и какие proof artifacts остаются доступны в MR; явно обновить затронутое прежнее решение."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "P2-OUTPUT-SCHEMA-YAGNI",
          "severity": "minor",
          "area": "interface design",
          "description": "Версионированный JSON-подобный schema contract шире потребности, если lifecycle и CI используют только exit и diagnostic.",
          "evidence": "Назван meta-o.backlog-empty-gate.v1, но не назван consumer, который парсит структуру.",
          "required_change": "Оставить минимальные стабильные tokens либо явно назвать parser-consumer и необходимость schema."
        },
        {
          "id": "P2-UTF8-DETECTION",
          "severity": "minor",
          "area": "backlog parsing",
          "description": "Требование валидного UTF-8 не сопровождается fail-closed способом обнаружения invalid byte sequences.",
          "evidence": "Обычное Node UTF-8 decoding может заменить ошибочные байты вместо failure.",
          "required_change": "В implementation contract потребовать fatal UTF-8 decoding перед Markdown AST parse."
        },
        {
          "id": "P2-CUSTOM-CI-PATH",
          "severity": "minor",
          "area": "GitLab CI discovery",
          "description": "Custom CI path остаётся unresolved даже там, где его можно безопасно прочитать через project metadata.",
          "evidence": "Discovery ограничена tracked root candidates и local includes, а отсутствие root сразу даёт unresolved.",
          "required_change": "Разрешить доказательное read-only получение custom path через установленную поддерживаемую GitLab surface; при недоступности оставить UNKNOWN."
        }
      ],
      "assumptions": [
        "Canonical Meta-O backlog после реализации исходной спецификации останется docs/backlog.md с # Бэклог и ## Открыто.",
        "Managed Meta-O MR creation является native write, который lifecycle способен не вызывать после BLOCKED или UNKNOWN.",
        "Required GitLab pipeline policy остаётся отдельной человеческой границей и не может считаться включённой только по YAML."
      ],
      "round": 1,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
