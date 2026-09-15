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
      "target_id": "proposal-1",
      "approval_score": 3,
      "would_adopt": false,
      "summary": "Предложение хорошо сохраняет разделение mid-feature QC и closure gate, вводит fail-closed verdict и осторожно относится к CI discovery, но не может быть принято из-за прямого превращения запрещённого test-only evaluator в runtime lifecycle checker, рекурсивного anti-drift assertion, ложного заявления о блокировке merge pipeline базовой ветки и противоречивой семантики Draft MR.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "P1-RUNTIME-TEST-D19",
          "severity": "critical",
          "area": "architecture",
          "description": "Test-only evaluator фактически становится production closure checker.",
          "evidence": "Исходная §14.1 и D-19 требуют, чтобы evaluator из tests никогда не участвовал в lifecycle; proposal вызывает tests/backlog-closure-gate.test.mjs из make mo-backlog-empty и make mo-closure.",
          "required_change": "Ввести явно авторизованный узкий project-owned checker либо зрелый настроенный инструмент и записать точное изменение границы D-19; не выдавать runtime evaluator за test-only."
        },
        {
          "id": "P1-CI-POSTMERGE",
          "severity": "major",
          "area": "GitLab CI",
          "description": "Pipeline default branch не может блокировать merge, который уже произошёл.",
          "evidence": "Snippet запускает job для CI_COMMIT_BRANCH == CI_DEFAULT_BRANCH, а таблица G3 утверждает, что эта поверхность блокирует merge.",
          "required_change": "Определить blocking coverage через MR pipeline текущего source SHA либо merged-results/merge-train pipeline фактического candidate; default-branch job назвать post-merge проверкой."
        },
        {
          "id": "P1-QC-SELF-RECURSION",
          "severity": "major",
          "area": "quality gate",
          "description": "Предложенный anti-drift assertion рекурсивно вызывает проверяемую цель mo-qc из mo-qc.",
          "evidence": "Текст предлагает сделать make --dry-run mo-qc частью самого mo-qc.",
          "required_change": "Использовать нерекурсивный статический contract test или удалить этот механизм."
        },
        {
          "id": "P1-DRAFT-CONTRADICTION",
          "severity": "major",
          "area": "MR lifecycle",
          "description": "Proposal одновременно требует gate перед созданием MR и разрешает ранний Draft MR без blocking gate.",
          "evidence": "G2 включает создание MR, тогда как §5 предлагает allow_failure для Draft и называет ранний Draft нормальной практикой.",
          "required_change": "Выбрать одну нормативную семантику; консервативно применять gate перед любым managed MR create, пока отдельное Draft-исключение не авторизовано."
        },
        {
          "id": "P1-COMPLETION-ORDER",
          "severity": "major",
          "area": "approved lifecycle",
          "description": "Harvest и удаление spec перенесены до MR без согласования с существующим порядком user merge decision.",
          "evidence": "Действующий methodology.md §7 помещает harvest после review loop, E2E и пользовательского merge decision; proposal помещает его до freeze и MR.",
          "required_change": "Явно определить новый порядок и записать, какое прежнее решение уточняется или изменяется."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "P1-OVERLAPPING-ADR",
          "severity": "minor",
          "area": "knowledge ownership",
          "description": "Новый §A-BACKLOG-02 пересекается с уже утверждённым владельцем empty closure §A-BACKLOG-01.",
          "evidence": "Исходная таблица §2.2 уже назначает §A-BACKLOG-01 ответственность за empty closure.",
          "required_change": "Предпочтительно расширить §A-BACKLOG-01 либо провести чёткую непересекающуюся границу ответственности."
        },
        {
          "id": "P1-UNDECLARED-OPEN-HEADING",
          "severity": "minor",
          "area": "backlog schema",
          "description": "Алгоритм требует объявленный heading открытого раздела, но описывает только источник пути файла.",
          "evidence": "Резолв выполняется из Knowledge-ссылки, источник canonical h2 не определён.",
          "required_change": "Зафиксировать heading в существующем backlog contract или сделать его частью canonical Meta-O schema."
        }
      ],
      "assumptions": [
        "Создание MR означает создание любого managed MR, включая Draft, пока спецификация явно не авторизует исключение.",
        "Pipeline базовой ветки запускается после принятия merge и потому не является pre-merge barrier.",
        "Новый пользовательский интент может узко изменить D-19, но такое изменение должно быть явным в ledger."
      ],
      "round": 1,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 3
would_adopt: false
