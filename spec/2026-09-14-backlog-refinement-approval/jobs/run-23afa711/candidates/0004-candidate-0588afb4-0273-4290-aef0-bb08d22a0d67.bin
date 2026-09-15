## Итог

Спецификация хорошо покрывает пользовательские решения и заметно сильнее обычного design draft, но пока не готова к реализации без новых архитектурных решений. Я насчитал 8 блокирующих проблем: наиболее серьёзные — противоречие business-слою по wait cadence, сломанная нормативная Issue-таблица, неполный native CLI contract, недоказанная lossless-передача reports и внутренне противоречивая eval v3 schema.

При проверке применил требования явно указанного `mo-review-orca`: authoritative `worker_done`, независимость пары, public Orca surfaces и fail-closed трактовку неполного handoff. Orca workers не запускались, поскольку отсутствовали обязательные candidate SHA и reviewer selections, а задача прямо запрещает handoff и внешние действия.

## Facts & Constraints — White Hat

Технически выбранный skills-first подход совместим с текущей архитектурой:

- В репозитории уже есть настоящий Markdown AST tooling, поэтому структурные проверки не требуют самописного regex parser.
- `mo-models.mjs`, `skill-evals.mjs`, embedded cases, B1–B22 и knowledge-history дают реальные точки расширения.
- Проверенные blob id и SHA-256 текущего `docs/backlog.md` совпадают со значениями из §3.
- `§A-REVIEW-02`, `§A-RESPONSE-02`, `§A-EVAL-01` и `§A-MEMORY-03` действительно существуют и требуют заявленной процедуры semantic reuse.
- Отказ от production Issue/report helper сохраняет `§A-ORCHESTRATION-01`, если runtime branching действительно останется инструкцией, а не скрытым test-derived interpreter.

Однако спецификация смешивает три уровня интерфейса: нормативную prose, Markdown-таблицы как program input и будущую JSON schema. Между ними сейчас нет единого непротиворечивого контракта.

## Risks & Failure Modes — Black Hat

### ARCH-HIERARCHY-001 — major

Точная cadence 300000/600000 ms противоречит действующему `§B-UPTIME-05`, где частота прямо объявлена «не порогом в протоколе». Новый `§A-WAIT-01` не может молча превратить это в обязательный порог.

Похожая, хотя менее буквальная проблема есть у explicit activation: `§A-ACTIVATION-01` вводит самостоятельное продуктовое правило, но business changes не добавляют и не переиспользуют тезис, который действительно это правило формулирует.

Нужно:

- либо семантически изменить `§B-UPTIME-05` с полной `Knowledge-ID-Change` authorization;
- либо добавить новый business thesis о cadence, не меняя общий смысл `§B-UPTIME-05`;
- закрепить explicit activation отдельным business thesis либо явно расширить подходящий существующий thesis через разрешённый reuse.

### ISSUE-TABLE-002 — major

Нормативная таблица §4.5 синтаксически повреждена. Начиная с ISS-06 значения вида ``project_issue | upstream_issue`` разбивают Markdown row на дополнительные клетки. Аналогично повреждены ISS-07C и другие строки.

Кроме того, deterministic proof требует покрытие только ISS-01…ISS-10, хотя нормативная таблица содержит ISS-11…ISS-13. Значит credential failure, ambiguous repository и unambiguous write rejection могут регрессировать при зелёном gate.

Нужно исправить Markdown encoding и требовать точный полный набор ISS-01…ISS-13, уникальность `scenario_id`, количество колонок, допустимые enums и fixture для каждой строки.

### ISSUE-NATIVE-CLI-003 — major

Issue flow всё ещё не implementation-ready. Не заданы:

- точные read/write command shapes для `gh` и `glab`;
- pagination/exhaustiveness открытого и закрытого поиска;
- различение GitHub Enterprise и self-hosted GitLab без угадывания по hostname;
- нормализация SSH, HTTPS и enterprise remote URLs;
- получение canonical URL после comment/create;
- идентичность write для unknown-effect lookup;
- трактовка rate limit, partial search и permission-limited visibility.

Фраза «hosting определяется по host части URL» недостаточна: произвольное enterprise hostname не сообщает, GitHub это или GitLab. Исполнитель будет вынужден изобрести новый routing contract.

Нужна version-matched native-command matrix либо обязательная процедура чтения соответствующих `gh`/`glab` guides с точными output fields, pagination и fail-closed host classification.

### HANDOFF-LOSSLESS-004 — major

Размер файла и `End-Review` не доказывают, что payload равен authoritative `worker_done`. Возможны внутренняя потеря, замена или ошибочная сериализация с тем же размером и сохранённым последним marker.

Не определены:

- кодировка и newline policy;
- точная byte boundary `worker_done`;
- проверка byte-for-byte equality после записи;
- формат и уникальность `pair_id`;
- привязка acknowledgement к содержимому, а не только размерам;
- безопасная форма recoverable cleanup command.

Нужно задать canonical UTF-8 serialization, сравнение перечитанного payload с принятым authoritative body и повторную полную grammar validation. Если используется digest, у него уже есть названный consumer, поэтому это не запрещённый бесхозный receipt.

### REVIEW-GRAMMAR-005 — major

Grammar нельзя реализовать однозначно:

- severity body finding не имеет заданного синтаксического места, хотя caller должен сравнить её с index;
- неясно, обязан ли `UNKNOWN` содержать `Evidence report`;
- не задана форма `Unknown-Reason` относительно общего шаблона;
- правила игнорирования markers внутри fenced blocks требуют полноценной fence grammar;
- pair aggregation table сама содержит повреждённую строку `Valid FINDINGS | Valid PASS`.

Нужны либо EBNF/JSON Schema, либо три полностью канонических примера PASS/FINDINGS/UNKNOWN плюс негативные fixtures. Body header должен явно включать key и severity.

### EVAL-SCHEMA-006 — major

§13.1 содержит несовместимые модели данных:

- case v2 имеет `contracts: [...]`, но coordinate требует единственный `contract_id`;
- одна запись объявлена на `(skillRevision, caseId, matrixProfile)`, тогда как наследуемый v2 envelope содержит все cases в `results`;
- заявлено additive наследование v2, но таблица описывает новую плоскую форму полей;
- статусы в таблице lowercase, текущий evidence contract и дальнейший текст используют uppercase;
- не определено, где живут `blocked/not_run/not_available`, если native execution не состоялся и обязательные v2 execution fields отсутствуют;
- не определена duplicate composite-identity semantics для разных cases одного harness execution.

Нужна одна полная JSON Schema v3 с валидными примерами для `PASS`, `NOT_AVAILABLE`, `NOT_RUN`, `BLOCKED`, `UNKNOWN`, migration v2 и aggregation algorithm.

### MODEL-HISTORY-007 — major

U-15 требует учитывать всё читаемое использование моделей за последний месяц, но §11 разрешает остановиться после 5 секунд или 64 MiB и затем не запрещает default recommendation на частичной истории.

Также не определено, что означает «использовалась за последние 31 день»: `mtime` файла или timestamp model event внутри session. `mtime` может измениться от копирования, синхронизации или compaction.

Нужно:

- определять eligibility по session/event timestamp;
- явно решить, что `history_complete:false` не удовлетворяет U-15;
- либо запрещать default recommendation при partial history, либо использовать provider index, позволяющий доказать полный охват без чтения всего transcript;
- определить обработку файлов, изменившихся во время scan.

### DECOMPOSITION-008 — major

Slices 2–10 меняют contracts, а общие deterministic tests/evals добавляются только в slice 11, хотя одновременно заявлено, что каждый slice имеет observable evidence и после checkpoint проходит `make mo-qc`.

Это оставляет исполнителю выбор архитектуры коммитов: временно ослаблять gates, писать тесты раньше плана или объединять почти всю работу в один огромный increment.

Нужно разложить работу в DAG вида `contract + implementation + focused proof + generated sync` для каждого вертикального slice, указав prerequisites, изменяемые interfaces и собственную exit condition.

## Strengths & Benefits — Yellow Hat

Сильные части спецификации:

- Все U-01…U-17 отражены в основном тексте.
- Ledger D-01…D-36 существует и в целом корректно связывает frozen decisions, council findings и выбранные решения.
- Rejected решения действительно перечислены в §16; скрытого возврата reviewer ensemble, clean verifier или workflow engine нет.
- Асимметричный upstream/project routing хорошо защищает от публикации чужого defect в ближайший repository.
- Redaction, unknown-effect lookup и запрет dummy writes сформулированы безопасно.
- Hot remediation reviewers и fresh final pair согласуются и с business layer, и с указанным review skill.
- Universal trust-safe delivery существенно лучше частного Claude-only workaround.
- Run-wide waiter — разумная реализация «один waiter на actor», если business contradiction будет исправлено.
- Разделение skill eval и B22 lifecycle proof правильно предотвращает ложную замену orchestration evidence одним prompt case.
- Verbatim ledger и подтверждённые hashes дают хороший losslessness anchor без повторного использования старого closure artifact.

## Alternatives & Creative Ideas — Green Hat

Без изменения frozen decisions можно упростить реализацию:

1. Сделать нормативные таблицы отдельными fenced YAML/JSON blocks, а Markdown tables оставить human projection. Это устранит pipe escaping и снизит неоднозначность AST evaluator.

2. Представить review response как строгий текстовый envelope с fenced JSON index и свободным evidence body. Тогда census и consistency проверяются штатным JSON parser, а полный report остаётся неизменённым текстом.

3. Для Issue routing использовать не helper, а declarative command matrix в reference-файле:

   `hosting_kind × operation × CLI → command, required fields, pagination, failure class`.

   Это остаётся skills-first и не создаёт proxy.

4. Для history сначала читать provider-owned indexes/metadata; transcript files открывать только там, где index отсутствует. Partial scan тогда честно приводит к `no_default_recommendation`.

5. Pair handoff можно сделать lossless без permanent manifest: caller вычисляет transient digest каждого authoritative body, проверяет его после atomic rename и передаёт digest названному consumer в acknowledgement contract.

## Completeness & Process — Blue Hat

### Traceability

Decision Ledger полный: пропущенных adopted D-entries в body я не нашёл. Rejected D-19/D-20 и связанные продуктовые отказы отражены в §2a и §16.

При этом traceability по hierarchy неполна: U-10 и U-16 присутствуют в spec body, но не имеют бесспорно соответствующего business-level владельца. Это не потеря ledger entry, а неверный уровень закрепления решения.

### Decomposition Readiness

Пока недостаточна. Issue CLI, report grammar, eval v3 и setup-managed project contract требуют самостоятельного проектирования исполнителем. Slices описывают темы, но не независимые вертикальные deliverables.

### Weak-Model Executability

Слабая модель, вероятнее всего:

- неверно распарсит ISS-06…ISS-13;
- выполнит неполный Issue search без pagination;
- угадает enterprise hosting;
- выберет собственную форму evidence v3;
- сочтёт size/end-marker достаточными для lossless;
- сохранит recommendation при partial history;
- по-разному реализует `UNKNOWN` grammar.

То есть ключевые ошибки возникнут не из-за качества кода, а из-за оставленных design choices.

### Contract Completeness

Недостающие контракты вне §17:

- полная review grammar;
- точная JSON schema v3;
- Issue CLI commands и pagination;
- enterprise hosting discovery;
- byte-level handoff identity;
- partial-history recommendation policy;
- managed-block/merge policy для чужих `AGENTS.md`/`CLAUDE.md`;
- Unix-only либо cross-platform semantics для `mktemp`, modes и `realpath`.

Последний пункт можно считать minor, если Meta-O официально ограничен POSIX, но такое ограничение должно быть названо.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 5,
      "would_adopt": false,
      "summary": "Спецификация полно и вдумчиво отражает frozen decisions, сохраняет skills-first архитектуру и хорошо закрывает ownership, trust, reviewer lifecycle и backlog disposition. Однако она ещё не decomposition-ready: exact wait cadence конфликтует с действующим business thesis, нормативная Issue-таблица синтаксически повреждена и частично не покрыта acceptance, native gh/glab flow недоопределён, lossless handoff не доказывает тождество authoritative worker_done, review grammar неоднозначна, а eval v3 описана несколькими несовместимыми схемами. Эти проблемы заставят исполнителя принимать новые архитектурные решения и допускают зелёные тесты при нарушении frozen contracts.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "ARCH-HIERARCHY-001",
          "severity": "major",
          "area": "business-architecture hierarchy",
          "description": "Обязательные 5/10-minute thresholds противоречат §B-UPTIME-05, который прямо говорит, что cadence не является protocol threshold; explicit mo-* activation также не имеет ясного business-level владельца.",
          "evidence": "§2.2 объявляет §A-WAIT-01 обслуживающим неизменённый §B-UPTIME-05, тогда как действующий thesis отрицает порог; business changes §2.1 не содержат activation thesis.",
          "required_change": "Добавить или корректно переиспользовать business theses для exact cadence и explicit activation с требуемыми Knowledge-ID-Change authorizations."
        },
        {
          "id": "ISSUE-TABLE-002",
          "severity": "major",
          "area": "Issue decision table and tests",
          "description": "Нормативные rows ISS-06–ISS-13 разбиты неэкранированными pipe characters, а deterministic acceptance требует только ISS-01–ISS-10.",
          "evidence": "Значения disposition_class и inputs в §4.5 образуют лишние Markdown cells; §14.1 и Deterministic proof явно ограничивают coverage ISS-01…ISS-10.",
          "required_change": "Исправить machine-readable representation и проверять точный полный набор ISS-01…ISS-13, enums, column count и fixture каждой строки."
        },
        {
          "id": "ISSUE-NATIVE-CLI-003",
          "severity": "major",
          "area": "native gh/glab contract",
          "description": "Search, routing и write semantics не содержат точных CLI interfaces, pagination и доказуемого способа классифицировать enterprise host.",
          "evidence": "§4 требует search open+closed и host-native CLI, но не задаёт команды/output fields; host portion произвольного enterprise URL сам по себе не различает GitHub и GitLab.",
          "required_change": "Добавить version-matched command matrix или обязательные native guides с exact fields, pagination, host classification, canonical URL retrieval и typed failure behavior."
        },
        {
          "id": "HANDOFF-LOSSLESS-004",
          "severity": "major",
          "area": "review report transport",
          "description": "File size и End-Review marker не доказывают byte-for-byte тождество payload исходному authoritative worker_done.",
          "evidence": "§6 после atomic rename перечитывает только size и end marker; consumer acknowledgement также связывает pair лишь с размерами.",
          "required_change": "Определить canonical byte serialization, exact equality или consumer-bound transient digest, полную reread validation, pair_id grammar и безопасный cleanup contract."
        },
        {
          "id": "REVIEW-GRAMMAR-005",
          "severity": "major",
          "area": "review response protocol",
          "description": "Caller не может однозначно проверить severity/body consistency и canonical UNKNOWN по приведённой grammar.",
          "evidence": "Body finding не имеет формата severity, UNKNOWN не определяет обязательность Evidence report, а aggregation table содержит повреждённую FINDINGS/PASS row.",
          "required_change": "Дать формальную grammar либо полные canonical PASS/FINDINGS/UNKNOWN fixtures с body header syntax и negative cases."
        },
        {
          "id": "EVAL-SCHEMA-006",
          "severity": "major",
          "area": "skill eval evidence v3",
          "description": "V3 одновременно описана как additive multi-case envelope и как одна плоская запись на case coordinate, при этом contracts array сведён к singular contract_id и status casing расходится.",
          "evidence": "§13 задаёт contracts array; §13.1 требует одну запись на caseId, перечисляет плоские поля и lowercase statuses, но заявляет сохранение nested v2 execution/results.",
          "required_change": "Добавить единственную нормативную JSON Schema v3, canonical examples всех statuses, exact contracts mapping и детерминированный aggregation algorithm."
        },
        {
          "id": "MODEL-HISTORY-007",
          "severity": "major",
          "area": "model discovery and recommendation",
          "description": "Ограниченный partial scan может привести к default recommendation, хотя U-15 требует учитывать всё читаемое использование за последний месяц.",
          "evidence": "§11 ограничивает scan 5000 ms/64 MiB и сохраняет partial ids, но не запрещает recommendation при history_complete:false; временная принадлежность session также не определена.",
          "required_change": "Определить event-time eligibility и запретить compliant default recommendation при неполной истории либо использовать полный provider-owned index."
        },
        {
          "id": "DECOMPOSITION-008",
          "severity": "major",
          "area": "implementation plan",
          "description": "Тематические slices не являются независимо проверяемыми vertical increments и конфликтуют с требованием evidence на каждом slice.",
          "evidence": "Contracts меняются в slices 2–10, тогда как общие tests/evals отложены до slice 11; после checkpoint одновременно требуется зелёный mo-qc и observable evidence каждого slice.",
          "required_change": "Перестроить §15 в dependency DAG из вертикальных contract+implementation+proof+generated-sync задач с exit condition для каждой."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "SETUP-MERGE-009",
          "severity": "minor",
          "area": "setup-managed project instructions",
          "description": "Не определены managed block, conflict policy и сохранение существующих пользовательских AGENTS.md/CLAUDE.md.",
          "evidence": "§12 говорит, что mo-setup предлагает компактную норму, но не задаёт точную вставку или поведение при уже существующих различных файлах.",
          "required_change": "Задать bounded managed-section contract и fail-closed conflict behavior."
        },
        {
          "id": "TEMP-PORTABILITY-010",
          "severity": "minor",
          "area": "temporary namespace portability",
          "description": "Platform-neutral формулировка конфликтует с POSIX-specific mktemp, umask и numeric modes.",
          "evidence": "§6 одновременно требует platform secure-temp и конкретные mktemp -d, umask 077, 0700/0600 semantics.",
          "required_change": "Явно ограничить поддерживаемые платформы POSIX либо определить эквивалентный Windows contract."
        }
      ],
      "assumptions": [
        "Проверял переданный текст как точное содержимое будущего spec artifact; повреждённые Markdown tables не считал артефактом отображения.",
        "Не инспектировал никакие прежние council artifacts под spec/**.",
        "Exact candidate SHA и две reviewer selections отсутствуют, поэтому явно указанный mo-review-orca использован как review protocol, но Orca workers не запускались.",
        "Текущая задача разрешает read-only inspection репозитория и запрещает любые изменения файлов, Git state, зависимостей и внешних сервисов."
      ],
      "round": 1,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 5
would_adopt: false
