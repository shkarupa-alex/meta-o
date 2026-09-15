# Надёжный review lifecycle и пустой feature backlog Meta-O

Статус: bounded council synthesis после пяти spec-review rounds; R3 blockers
закрыты оркестраторской редакцией внутри согласованного подхода, R4 findings по
малформированным нормативным таблицам и ADR file assignment закрыты в §2.2,
§4.5 и §14, R5 findings по report sections (`PASS`), version-matched guide
locator и фактической native CLI поверхности закрыты в §5, §8 и §4.6.
Реализация в эту работу не входит.

## 1. Outcome

Meta-O должен провести одну фичу от согласованной спецификации до verified
candidate так, чтобы:

- `docs/backlog.md` был временной записной книжкой только активной фичи и был
  пуст в начале и в конце lifecycle;
- подтверждённая внешняя работа не терялась, а автономно попадала в project или
  upstream Issues через native `gh`/`glab`;
- два видимых vendor-diverse reviewer работали одинаково предсказуемо, оставались
  горячими для remediation и отдавали executor полную неизменённую пару;
- человек видел короткий severity census, а не длинный повтор полного review;
- Orca sessions получали стабильные titles, безопасную delivery, точный cleanup
  и редкие blocking waits;
- skill behavior доказывался на обязательных low-effort Codex и Claude profiles
  и, когда доступно, на дополнительных Codex/OpenCode profiles.

Один full Git SHA по-прежнему обязан пройти `make mo-qc`, два независимых final
reviews и applicable E2E. Новый workflow engine, state store, report/Issue
helper, wrapper над `orca`/`gh`/`glab` или обязательный reviewer subagent не
создаётся.

## 2. Authority и semantic changes

Решения применяются в иерархии `business → architecture → implementation`.
Каждое изменение смысла действующего контракта названо здесь явно; низовая
правка, молча расходящаяся с business или ADR, запрещена.

### 2.1 Изменения business layer

| Identifier            | Было                                                                                                 | Становится                                                                                                                                                                                         | Frozen decision |
| --------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `§B-LONGEVITY-04`     | `docs/backlog.md` — долговечный sink всего отложенного, блокированного и сознательно неисправленного | backlog — branch-local notebook активной фичи; долговечный sink подтверждённых out-of-scope defects/improvements — Issues; «в конце фича ничего не увезла в backlog» усиливается до «backlog пуст» | U-02            |
| `§B-HUMAN-04` (новый) | —                                                                                                    | Техническая project/upstream Issue после подтверждённого root cause — заранее авторизованная часть lifecycle без отдельного approval                                                               | U-03            |
| `§B-PORTABILITY-06`   | Дефект чужого инструмента — issue наверх; локальный обход допустим только как дополнение к issue     | смысл не меняется; вводится исполнение: каждый локальный обход публичного пробела backend, введённый этой спекой, обязан нести canonical Issue URL или быть объявлен unsupported                   | —               |
| `§B-EVAL-01`          | Обязательные testing profiles `sonnet5/low`, `gpt-5.6-terra/low`, `deepseek 4 flash`                 | Обязательные `claude/opus[1m]/low` и `codex/gpt-5.6-sol/low`; желательная portability matrix фиксируется как business expectation                                                                  | U-17            |
| `§B-PORTABILITY-08`   | Роль оркестратора обязана работать на локальном Qwen/OpenCode profile                                | смысл не меняется и не считается выполненным §13: желательный eval profile на `llama.cpp` не является доказательством local orchestration capability                                               | U-17            |
| `§B-REVIEW-02`        | Неисправленное замечание объясняется комментарием в коде                                             | смысл сохраняется; §12 уточняет форму: комментарий называет долговечный invariant или причину решения и никогда не содержит finding id                                                             | U-12            |

`§B-HUMAN-04` обязан перечислить, что остаётся человеческой границей: выдача или
использование credentials, спор о product intent, покупка/подписка,
необратимый или неразличимый write effect и named watchdog boundary. Автономия
распространяется только на технический Issue с подтверждённым root cause и
однозначно установленным адресатом: неустановленный адресат — не повод выбрать
ближайший repository.

Все изменения business layer вносятся в `docs/business.md`; производные
упоминания синхронизируются в `README.md`, `docs/glossary.md`,
`docs/acceptance.md` и `docs/e2e.md` тем же коммитом.

### 2.2 Изменения и расширения architecture layer

| Identifier         | Статус    | Owning file                                            | Содержание                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | --------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `§A-REVIEW-02`     | amended   | `docs/architecture/review-ensemble-boundary.md`        | Добровольные reviewer subagents, которые ADR допускал как способ исследования одного reviewer, запрещены в Meta-O lifecycle (U-04). Пара остаётся ровно одной vendor-diverse парой; отмена по-прежнему требует pre-registered differential eval                                                                                                                                                  |
| `§A-RESPONSE-02`   | amended   | `docs/architecture/settled-final-response.md`          | (a) cleanup из «best effort по своим файлам» становится «только после settled acknowledgement потребителя»; (b) запрет на слияние/ранжирование/суммирование content сохраняется, и явно авторизуется единственное исключение — целочисленный census уже опубликованных reviewer counts не является content projection; (c) общий `/tmp/mo-review` путь заменяется уникальным приватным namespace |
| `§A-MEMORY-03`     | unchanged | `docs/architecture/knowledge-identifiers.md`           | Исторический backlog-closure provenance остаётся закрытым доказательством прежней программы и не переиспользуется для этой фичи                                                                                                                                                                                                                                                                  |
| `§A-EVAL-01`       | reused    | `docs/architecture/evaluation-model-policy.md`         | Тот же принцип применимости и approved profile, новый approved set §13                                                                                                                                                                                                                                                                                                                           |
| `§A-REVIEW-04`     | новый     | `docs/architecture/review-authoritative-response.md`   | Служит `§B-REVIEW-01/04/05`: authoritative response, report sections, census/index, remediation depth, самокоррекция и `UNKNOWN`; consumer — `mo-review-orca` и portable review protocol                                                                                                                                                                                                         |
| `§A-RESPONSE-03`   | новый     | `docs/architecture/settled-final-response.md` (раздел) | Служит `§B-REVIEW-01/05` и `§B-SESSION-02`: private namespace, atomic publication, settled pair handoff и bounded acknowledgement; consumer — callers review skill                                                                                                                                                                                                                               |
| `§A-ISSUE-01`      | новый     | `docs/architecture/issue-routing.md`                   | Служит `§B-LONGEVITY-04`, `§B-HUMAN-04`, `§B-PORTABILITY-06/07`: routing, search/dedup, redaction, native CLI surface и unknown-write table; consumer — lifecycle skills                                                                                                                                                                                                                         |
| `§A-SESSION-01`    | новый     | `docs/architecture/orca-session-ownership.md`          | Служит `§B-SESSION-01` и `§B-REVIEW-04`: standalone/full ownership, titles, hot/fresh roles и exact cleanup; consumer — Orca entry skills                                                                                                                                                                                                                                                        |
| `§A-DELIVERY-01`   | новый     | `docs/architecture/trust-safe-delivery.md`             | Служит `§B-PROOF-01`, `§B-PORTABILITY-01/07`: trust-safe delivery, bundled guide locator и single-owner posture; consumer — `mo-setup` и Orca entry skills                                                                                                                                                                                                                                       |
| `§A-WAIT-01`       | новый     | `docs/architecture/blocking-wait-cadence.md`           | Служит `§B-UPTIME-03/05` и `§B-CONTROL-04`: run-wide waiter, cadence и typed failure; consumer — orchestration/review/E2E skills                                                                                                                                                                                                                                                                 |
| `§A-ACTIVATION-01` | новый     | `docs/architecture/skill-activation.md`                | Служит `§B-HUMAN-01` и `§B-PORTABILITY-03`: explicit `mo-*` activation; consumer — all `mo-*` frontmatter/instructions and lint                                                                                                                                                                                                                                                                  |
| `§A-MODELS-01`     | новый     | `docs/architecture/model-recommendation.md`            | Служит `§B-PORTABILITY-07` и `§B-EVAL-01`: catalogs, bounded history и recommendations; consumer — `mo-models.mjs` and selecting skills                                                                                                                                                                                                                                                          |
| `§A-MEMORY-04`     | новый     | `docs/architecture/knowledge-identifiers.md` (раздел)  | Служит `§B-REVIEW-02` и `§B-SELFHOST-02`: regression test/invariant comment; consumer — `mo-setup` project contract                                                                                                                                                                                                                                                                              |
| `§A-BACKLOG-01`    | новый     | `docs/architecture/backlog-notebook.md`                | Служит `§B-LONGEVITY-04`: intake, notebook, Issue sink и empty closure без permanent receipt; consumer — methodology, setup and closure review                                                                                                                                                                                                                                                   |

Owning file нормативен: новый identifier появляется ровно в одном файле, а
identifier, приписанный существующему файлу, добавляется туда разделом по
принятому в этом файле формату (`## §A-*` heading), не раздваивая владение.
Существующие ссылки в `CLAUDE.md`/`README.md` на список ADR обновляются тем же
коммитом, что создаёт файл.

Каждое переиспользование существующего `§B-*`/`§A-*` с новым смыслом требует в
том же коммите trailer `Knowledge-ID-Change: reuse <id> via <architecture-id>` и
YAML-блок `knowledge_id_change` с `action: reuse`, точным `id`, непустыми
`reason`/`new_boundary` и `references_updated: true`, как требует
`docs/architecture/knowledge-identifiers.md`. Это обязательно для
`§B-LONGEVITY-04`, `§B-EVAL-01`, `§A-REVIEW-02`, `§A-RESPONSE-02` и
`§A-EVAL-01`; тезисы, явно отмеченные в таблицах как
«смысл не меняется», authorization не требуют. Новые identifiers проверяются по
всей Git истории; исторически занятые `§A-REVIEW-01`,
`§A-REVIEW-03`, `§A-BOOT-01`, `§A-BOOT-02`, `§A-LEDGER-01`, `§B-TRUST-01`,
`§B-SAFETY-01` и `§B-WORKFLOW-01…03` повторно не используются.

### 2.3 Границы census

Числа P0–P3 являются census уже опубликованных reviewer findings, а не
confidence, adjudication score, приоритетом исправления или новым machine
governance слоем. Оркестратор не выводит из counts решение; решение принимает
человек или executor по полным reports.

### 2.4 Форма нормативных таблиц

Нормативная таблица является входом детерминированной проверки, поэтому обязана
разбираться Markdown AST-библиотекой в прямоугольную матрицу: у каждой строки
ровно столько ячеек, сколько объявленных колонок, ни одна ячейка не пуста, а
любой литерал внутри ячейки не содержит неэкранированный `|`. Альтернатива
значения записывается словом (`или`, `/`) либо отдельным токеном колонки
(`either`), никогда вертикальной чертой. Это правило применяется к §4.5, §5,
§9, §13 и §14.1 и проверяется §14 вместе с их содержимым.

### 2.5 Проверенная поверхность внешних инструментов

Нормативная спека не называет флаг, поле или подкоманду чужого CLI по памяти.
Каждая команда, флаг и JSON-поле в §4.6 и §8 взяты из `--help` установленной
версии и фиксируются recorded fixture (§14.1, слой 2). Проверенные baselines:
`gh 2.100.0`, `glab 1.117.0` и bundled guides установленного `orca`. Если на
машине стоит другая версия и названный флаг/поле отсутствует, route становится
`unsupported`/`needs_attention`, а подстановка похожего флага запрещена.

## 2a. Рассмотренные подходы

| Подход                                                             | Суть                                                                                                                                                                  | Почему не выбран / выбран                                                                                                                                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Skills-first reasoning contracts (выбран)                       | Все новые нормы живут в business/ADR/skills text и доказываются deterministic tests, evals и E2E; единственный код — расширение существующего `mo-models.mjs` и tests | Соответствует `§A-ORCHESTRATION-01` и запрету manifest/receipt без потребителя; не создаёт state store; стоимость — дисциплина формулировок и evidence, которую §13–§14 закрывают                                      |
| B. Тонкий helper-слой (`mo-issue.mjs`, `mo-report.mjs`)            | Issue routing и pair handoff инкапсулируются в скриптах                                                                                                               | Отклонён: `gh`/`glab`/`orca` — native CLI, а проект запрещает project proxy; helper стал бы вторым владельцем posture и routing, который надо версионировать под чужие CLI (`§B-PORTABILITY-05`, `§B-PORTABILITY-07`)  |
| C. Внешний workflow engine/state store для lifecycle и disposition | Состояние backlog/Issue/wait хранится в машинном store                                                                                                                | Отклонён: прямое нарушение `§A-ORCHESTRATION-01` и правила «no manifest/digest/baseline без названного потребителя»; живой consumer disposition — implementation spec и closure review, после harvest receipt не нужен |
| D. Reviewer ensemble/verifier расширение                           | Subagents, clean verifier, review-quality eval                                                                                                                        | Отклонён продуктовыми решениями U-04/U-05; согласуется с архивным выводом `§A-REVIEW-02`                                                                                                                               |

Подход A принят целиком; B и C не применяются частично, чтобы не появилось
скрытого второго владельца состояния. Граница подхода A названа честно в §14.1:
детерминированно проверяется нормативная таблица решений, а применение её
агентом доказывают evals, а не тесты.

## 3. Lossless disposition исходного backlog

Таблица ниже является полным audit trail живой implementation-spec именно для
этого входного документа, а не постоянным registry состояния. `Source`
привязывается к hash и verbatim ledger §19; `Evidence` получает точные
requirement/test/Issue references. Ни одна строка не удаляется до заполнения
evidence, а после harvest вся spec уходит по `§B-MEMORY-03`.

| Source | Исходное наблюдение                                                                   | Outcome                                            | Нормативное место / evidence                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BKL-00 | Преамбула: текущая версия хороша, изменения не должны уронить качество, evals полезны | In scope as non-regression constraint              | `make mo-qc`, required eval matrix, final reviews и applicable E2E одного SHA                                                                                                                               |
| BKL-01 | Ревью и сабагенты; сверить с deep research                                            | Rejected by product decision after research review | Найдены `docs/research/review-deep-research-{1,2,3}.md`: verifier может помогать, но обязательные reviewer subagents не доказаны; frozen decision сохраняет ровно два reviewer без subagents/clean verifier |
| BKL-02 | Неуникальные `/tmp/mo-review/report*.md`                                              | In scope                                           | Unique secure-temp namespace и settled handoff                                                                                                                                                              |
| BKL-03 | Titles отсутствуют в standalone review                                                | In scope                                           | Session ownership/title contract и E2E                                                                                                                                                                      |
| BKL-04 | `Remote terminal was closed`, вкладка не исчезает                                     | Investigate; upstream Issue if confirmed           | Exact-owned cleanup contract; canonical Issue URL после воспроизведения                                                                                                                                     |
| BKL-05 | Issues вместо долговечного backlog                                                    | In scope                                           | `§B-LONGEVITY-04`, backlog/Issue lifecycle                                                                                                                                                                  |
| BKL-06 | Claude workspace trust prompt принял task bytes                                       | In scope + upstream Issue                          | Trust-safe readiness и setup feasibility gate; readiness probe — локальный обход публичного пробела, поэтому обязателен upstream Issue                                                                      |
| BKL-07 | Reviewer не задаёт глубину исправления                                                | In scope                                           | Полный finding contract и eval                                                                                                                                                                              |
| BKL-08 | `mo-review-orca` самозапускается                                                      | In scope                                           | Explicit `mo-*` activation graph и description surface                                                                                                                                                      |
| BKL-09 | Composed Codex task ушёл в shell; duplicate posture flag                              | Investigate; upstream/project Issue by root cause  | Delivery/readiness, provider posture и canonical Issue URL                                                                                                                                                  |
| BKL-10 | Reviewer ошибочно released после `FINDINGS`                                           | In scope                                           | Hot remediation roles, fresh final pair                                                                                                                                                                     |
| BKL-11 | Повтор titles; пожелание цветов                                                       | Merge into BKL-03; color best effort               | Title contract; no mandatory color Issue                                                                                                                                                                    |
| BKL-12 | Wrapper получил duplicate unsandboxed flags                                           | Merge into BKL-09                                  | Single owner of posture arguments                                                                                                                                                                           |
| BKL-13 | Caller показал человеку полный review вместо census                                   | In scope                                           | Human projection contract                                                                                                                                                                                   |
| BKL-14 | Standalone review создал отдельного Claude executor                                   | In scope                                           | Standalone ownership boundary                                                                                                                                                                               |
| BKL-15 | Claude/Codex по-разному пишут TUI summary                                             | In scope, symptom not permanent methodology        | Leading index в authoritative `worker_done`; optional echo не evidence; при подтверждённом публичном пробеле — upstream Issue                                                                               |
| BKL-16 | Meta-O не проверяет Orca guides                                                       | In scope                                           | Version-matched `orchestration` + `orca-cli` readiness через bundled locator                                                                                                                                |
| BKL-17 | Reviewer закрыт до follow-up                                                          | Merge into BKL-10                                  | Hot remediation role lifecycle                                                                                                                                                                              |
| BKL-18 | Найденный defect не остаётся в памяти                                                 | In scope                                           | Regression test + durable invariant guidance                                                                                                                                                                |

Источник intake фиксируется прямо в живой spec, без повторного открытия старого
closure-map: worktree blob id
`4b6a958c1747e76a16439ae1c967b09d9ab76bef`, SHA-256
`ce8113b298ec069cea38e1d5f5bbcd0c7078dffe059ad1a606dd20e50c4bac38` и
verbatim appendix §19. Настоящий Markdown AST test разбирает appendix и требует,
чтобы каждый top-level source block, включая преамбулу, входил ровно в одну
строку BKL-00…BKL-18; merged строки ссылаются на основной BKL id. Пока spec жива,
таблица является ledger и acceptance input. После implementation durable
requirements остаются в business/ADR/acceptance/tests, Issue URL — рядом с
workaround/TODO, а Issue без repo artifact сам является canonical durable home.
Spec и её intake ledger уходят по обычному `§B-MEMORY-03`; второй permanent
closure receipt и изменение исторического `backlog_closure` не создаются.

Сырые пользовательские заметки являются pre-lifecycle intake и могут иметь
произвольную Markdown-форму без трёх полей. Первый migration checkpoint до
substantive implementation замораживает их blob/AST inventory, materialize'ит
эту disposition map и возвращает `docs/backlog.md` к пустой canonical schema.
После checkpoint начинается обычный empty-start lifecycle; новые agent-authored
entries обязаны иметь `Причина.`, `Практическое влияние.` и `Следующий шаг.`.
`tests/backend-transition.test.mjs` меняется в slice 1: raw human intake
разрешён только при наличии живой spec с совпадающими blob/SHA-256 и полной
disposition table, а schema agent entries и пустота named closure остаются
blocking. Первый coherent implementation commit создаётся на
`feature/backlog-review-lifecycle` от актуального `develop`, materialize'ит
intake в spec и очищает только `docs/backlog.md`; другие пользовательские dirty
files не затрагиваются. После checkpoint все следующие slices выполняют зелёный
`make mo-qc`. Final closure требует пустой backlog, harvested knowledge и
удаление реализованной spec; историческая provenance запись остаётся неизменной.

### 3.1 Обязательство `§B-PORTABILITY-06` для локальных обходов

Локальный обход существует только вместе с Issue. Эта спека вводит следующие
обходы, и каждый несёт обязательство:

| Обход                                                            | Публичный пробел backend                                                                                        | Обязательство                                                                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trust-safe readiness probe (BKL-06, §8)                          | Orca/Claude Code не дают публичного сигнала «prompt is trust UI, не normal prompt»                              | Воспроизвести и завести upstream Issue; canonical URL рядом с probe; если публичный сигнал есть — probe упрощается до чтения этого сигнала и Issue не нужен      |
| Rename-after-start для composed start (§7)                       | Нет публичного способа задать title при composed start                                                          | Issue при подтверждении; иначе route unsupported                                                                                                                 |
| Single-owner posture fallback (§8)                               | Wrapper и fallback дублируют flags                                                                              | Issue по подтверждённому root cause (project либо upstream)                                                                                                      |
| Leading index как замена различающемуся TUI summary (BKL-15, §5) | Разные harness по-разному отражают final response в TUI                                                         | Issue только если подтверждён дефект публичной поверхности; иначе это наша норма, а не обход                                                                     |
| Повторное вооружение arm при host wait cap (§9)                  | Host не поддерживает запрошенный timeout                                                                        | Issue наверх; при отсутствии публичного пути route unsupported, тихий переход на polling запрещён                                                                |
| Exact-handle cleanup поверх `no_owned_resource` (BKL-04/10, §7)  | `worker-release` не владеет low-level fallback terminal, вкладка остаётся или даёт `Remote terminal was closed` | Воспроизвести и завести upstream Orca Issue; canonical URL рядом с cleanup-инструкцией; без воспроизведения — `needs_attention`, не тихое закрытие чужого handle |
| Текстовый `Review-Handoff-Ack` (§6.1)                            | Нет публичной поверхности, подтверждающей, что потребитель прочитал payload целиком                             | Issue только если подтверждён дефект/пробел публичной поверхности Orca; иначе строка остаётся нашим узким transport contract, а не обходом                       |
| Публикация GitLab note через `glab api --input` (§4.6)           | `glab issue note` 1.117.0 не принимает body из файла/stdin и без `--message` открывает editor                   | Завести upstream `glab` Issue на body-file поддержку; canonical URL рядом с инструкцией; при появлении публичного body-file флага обход удаляется                |

Любой новый обход, придуманный при реализации, попадает в эту таблицу тем же
правилом. Обход без Issue и без явного `unsupported` — дефект реализации.

После materialization этой таблицы `docs/backlog.md` возвращается к canonical
пустой notebook schema. Во время implementation новая запись допустима только
как временное наблюдение текущей фичи и содержит причину, влияние и следующий
шаг. Перед candidate freeze и completion каждая запись получает disposition, а
`## Открыто` остаётся пустым. Безусловный mid-feature `make mo-qc` не требует
пустоты; named lifecycle closure требует.

## 4. Backlog и autonomous Issues

Disposition имеет только следующие исходы:

- `in_scope`: реализовать и доказать в текущей фиче;
- `unconfirmed`: воспроизвести, затем реализовать, опровергнуть evidence либо
  перевести в Issue;
- `project_issue`: подтверждённый out-of-scope defect/improvement;
- `upstream_issue`: подтверждённый defect внешнего инструмента;
- `duplicate`: canonical reference на основной outcome;
- `needs_attention`: безопасный outcome не установлен; completion запрещён.

Issue lifecycle выполняет reasoning агента, не новый helper. `§A-ISSUE-01`
фиксирует шаги ниже как нормативные, §4.5 делает их машинно проверяемыми, а §4.6
называет точную native CLI поверхность, на которой они исполняются.

### 4.1 Routing precedence

Сначала устанавливается класс disposition, и только потом repository. Правило
асимметрично: подтверждённый дефект чужого инструмента никогда не адресуется в
наш repository, потому что «ближайший доступный remote» — это не владелец
дефекта, а просто то, что оказалось под рукой.

`upstream_issue` — допустимы только два источника адресата:

1. Repository, явно названный пользователем в текущей задаче.
2. Verified upstream ownership metadata установленного инструмента: поля
   `repository`/`bugs`/homepage его package manifest, bundled source metadata,
   документация внутри самой поставки либо ADR/papercut запись проекта,
   ссылающаяся на этот repository.

Если ни один источник не читается однозначно — `needs_attention`, запись не
выполняется. `origin`, upstream tracking ref и любой другой project remote
кандидатами для `upstream_issue` не являются. Вывод repository из имени пакета,
организации, URL документации или похожего названия запрещён
(`§B-PORTABILITY-07`).

`project_issue` — precedence, первый успешный шаг выигрывает:

1. Repository, явно названный пользователем в текущей задаче.
2. Upstream remote tracking ref текущей ветки.
3. `origin`.

Если класс disposition не установлен однозначно — то есть неизвестно, наш это
дефект или инструмента, — запись не выполняется вовсе: `needs_attention` и
воспроизведение до установления владельца. Смешанный случай (наш обход поверх
чужого пробела) даёт две записи с разными адресатами и взаимными ссылками, а не
одну «куда попало».

Hosting определяется по host части URL remote, а не по тому, какой CLI
установлен: `github.com` и GitHub Enterprise host → `gh`; `gitlab.com` и
self-hosted GitLab host → `glab`. Для не-`github.com`/не-`gitlab.com` host
классификация обязана быть доказана §4.6, а не угадана по имени домена.
Несовпадение host и доступных CLI, несколько кандидатов одного ранга,
отсутствие remote или неразрешимый upstream repository дают `needs_attention`
без записи.

Язык: project Issue следует языку проекта, upstream Issue пишется на английском.

### 4.2 Search-before-write и dedup evidence

Перед любой записью выполняется read-only поиск по открытым и закрытым Issues.
Evidence disposition сохраняет exact query strings, найденные ids и время.

Поиск считается заключительным только если он не усечён: явный limit, возврат
меньше limit и отсутствие truncation signal (§4.6). Усечённый, ошибочный или
неполный поиск не доказывает отсутствие дубликата и обрабатывается по ISS-14.

Совпадение root cause доказывается тремя признаками одновременно: та же публичная
поверхность инструмента, тот же нарушенный invariant и тот же класс наблюдаемого
симптома. Текстовое сходство заголовков доказательством не является. В evidence
попадает id и цитата совпавшего фрагмента.

Closed-issue семантика:

- closed как исправленный в версии, которой мы пользуемся, но симптом
  воспроизводится → создаётся новый Issue со ссылкой на закрытый;
- closed как исправленный в версии, которой мы ещё не пользуемся → запись не
  создаётся, disposition ссылается на закрытый Issue и на требуемую версию;
- closed как `wontfix`/stale при живом симптоме → добавляется комментарий с
  подтверждённым use case; reopen автоматически не выполняется и остаётся
  человеческой границей.

При совпадении root cause в открытом Issue добавляется подтверждённый use case;
иначе создаётся новый Issue. Один write на подтверждённый root cause за
lifecycle.

### 4.3 Redaction перед записью

Body собирается allowlist-ом: минимальное воспроизведение на публичных
поверхностях, версии инструментов и harness, ожидаемое и наблюдаемое поведение,
влияние. Запрещены: credentials и tokens, environment dumps, абсолютные приватные
пути и `HOME`, hostnames и имена машин, персональные данные, куски внутренних
спецификаций и клиентского контекста, нерелевантный session transcript. Перед
записью prepared title/body перечитывается и очищается.

### 4.4 Unknown write effect

При неоднозначном результате записи повтор вслепую запрещён: выполняется
read-only lookup созданного/изменённого Issue. Неустановленный результат даёт
`needs_attention`.

Canonical URL хранится рядом с долговечным workaround/TODO до его удаления. Для
исходной записи без code location URL остаётся в disposition-таблице, пока spec
жива; после её harvest сам Issue является canonical durable home и отдельный
локальный registry не сохраняется.

### 4.5 Canonical decision table

Чтобы §4.1–§4.4 не остались прозой, guidance несёт одну canonical decision table
со стабильными колонками: `scenario_id`, `disposition_class`, `inputs`,
`required_action`, `forbidden_action`, `evidence`. Таблица нормативна: агент
обязан выбирать строку и называть её `scenario_id` в disposition evidence, а не
рассуждать заново.

`disposition_class` принимает ровно одно значение из
`upstream_issue`, `project_issue`, `either` (правило одинаково для обоих Issue
классов), `mixed`, `unconfirmed`. Вертикальная черта внутри ячеек запрещена
(§2.4), поэтому альтернативы записаны словами.

Нормативные строки:

| `scenario_id` | `disposition_class` | `inputs`                                                                     | `required_action`                                                                                            | `forbidden_action`                                                  | `evidence`                                                   |
| ------------- | ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| ISS-01        | `upstream_issue`    | Confirmed external root cause; explicit repo или verified ownership metadata | Search open и closed через host-native CLI; comment matching root cause либо create                          | Project remote как upstream fallback                                | Ownership source, queries, candidates, write result, URL     |
| ISS-02        | `upstream_issue`    | Confirmed external root cause; ownership unreadable или ambiguous            | `needs_attention`, no write                                                                                  | Guess repo from tool или package name                               | Attempted sources and ambiguity                              |
| ISS-03        | `upstream_issue`    | Confirmed external root cause; доступны только project remotes               | `needs_attention`, no write                                                                                  | `origin` или tracking ref                                           | Project remotes and missing upstream source                  |
| ISS-04        | `project_issue`     | Confirmed project root cause; explicit repo absent                           | Resolve tracking ref, затем `origin`; search; comment либо create                                            | Choose unrelated installed CLI или repo                             | Remote precedence, host, queries, result, URL                |
| ISS-05        | `unconfirmed`       | Root-cause owner не установлен                                               | Reproduce until project или upstream class established                                                       | Any external write                                                  | Reproduction evidence or `needs_attention`                   |
| ISS-06        | `either`            | Open candidate matches surface, invariant и symptom class                    | Add sanitized confirmed use case once                                                                        | New duplicate Issue; title-only matching                            | Three-part match evidence, comment result, URL               |
| ISS-07A       | `either`            | Closed as fixed in installed version, symptom still reproduces               | Create new Issue linking closed one                                                                          | Comment as if fix were not installed                                | Installed version, reproduction, old and new URLs            |
| ISS-07B       | `either`            | Closed as fixed only in newer version                                        | Reference closed Issue and required version; no write                                                        | Duplicate Issue                                                     | Installed and fixed versions and URL                         |
| ISS-07C       | `either`            | Closed as `wontfix` или stale, symptom alive                                 | Add sanitized use case comment                                                                               | Automatic reopen                                                    | Reproduction, closure reason, comment result, URL            |
| ISS-08        | `either`            | Prepared body contains forbidden data                                        | Redact и rebuild allowlisted body before write; unresolved secret даёт credential boundary                   | Publish original body                                               | Redaction classes and sanitized preview evidence             |
| ISS-09        | `either`            | Write result ambiguous                                                       | Read-only lookup of intended effect; settle URL либо `needs_attention`                                       | Blind retry                                                         | Original write identity, lookup query and result             |
| ISS-10        | `mixed`             | Project workaround over confirmed upstream gap                               | Create или update two correctly routed Issues with cross-links                                               | Collapse both into nearest repo                                     | Both ownership proofs, search and write results, URLs        |
| ISS-11        | `either`            | Repository установлен, но credentials либо native CLI unavailable            | Credential boundary и `needs_attention`; сохранить prepared sanitized intent локально в текущей spec         | Switch host, raw API либо publish without auth proof                | Host, CLI or auth error, prepared-body reference             |
| ISS-12        | `either`            | Несколько repository candidates одного rank либо host не классифицирован     | `needs_attention`, no write                                                                                  | Pick first или closest repository; infer hosting from installed CLI | Candidate URLs and ambiguity                                 |
| ISS-13        | `either`            | Search и read succeed, write rejected unambiguously                          | Report exact failure and `needs_attention`; no retry unless failure states no effect and retry is safe       | Treat rejection as unknown success или silently drop                | Command exit status and canonical error                      |
| ISS-14        | `either`            | Search вернул ровно запрошенный limit, truncation signal либо ошибку         | Повторить с большим explicit limit или уже'ми qualifiers до неусечённого результата, иначе `needs_attention` | Заключить «дубликата нет» по усечённому или неудавшемуся поиску     | Limits used, returned counts, truncation signal, final query |
| ISS-15        | `either`            | Установленная версия CLI не имеет названного §4.6 флага, поля или подкоманды | `needs_attention` либо route unsupported; зафиксировать recorded help evidence и требуемую версию            | Подставить похожий флаг; вызвать write-команду без body flag        | Installed version, help fixture excerpt, missing capability  |

Таблица является субъектом детерминированного доказательства §14.1. Она не
становится машиной состояний и не порождает runtime store: агент читает её и
применяет, ничего не сохраняя между сессиями.

Каждый disposition заканчивается bounded textual record в живой spec/backlog
closure message с полями `Scenario`, `Class`, `Repository`, `Search`, `Action`,
`Canonical-URL`, `Outcome`. `Outcome` — только
`implemented`, `commented`, `created`, `duplicate`, `refuted` либо
`needs_attention`; Issue-class outcome `commented`, `created` и `duplicate`
требует URL, `needs_attention` требует причину и не допускает URL, угаданный из
failed write. Record не является отдельным файлом/schema store и удаляется
вместе со spec после harvest.

`Remote terminal was closed`, retained tabs и Codex delivery являются
implementation investigations. Permanent methodology получает только общий
подтверждённый invariant; конкретный incident и version остаются в upstream
Issue/papercut/evidence.

### 4.6 Native CLI surface

Возражение «routing и search не имеют точного CLI-интерфейса» принято, а
следующее возражение «названный контракт содержит несуществующие флаги и может
открыть editor» принято как более серьёзное: нормативная команда, которую нельзя
выполнить, хуже отсутствия команды. Поэтому все shapes ниже сняты с
установленных версий (`gh 2.100.0`, `glab 1.117.0`), а различия подкоманд
названы явно. Guidance называет команды прямо, агент выполняет их сам; project
wrapper не создаётся (D-19 сохраняется).

Общие требования для обоих CLI:

- перед первой записью фиксируются `gh --version` и `glab --version`; версия,
  отличная от recorded fixture, требует перечитать `--help` и при отсутствии
  флага применить ISS-15;
- ни одна write-команда не вызывается без явного body/description аргумента:
  `gh issue comment` и `gh issue create` без body запрашивают ввод, а
  `glab issue note` и `glab issue create` без body открывают editor. Открытие
  editor или interactive prompt — дефект реализации, а не приемлемый путь;
- body передаётся файлом или stdin; command substitution текста отчёта в argv
  запрещена — именно этот класс ошибки дал BKL-09;
- prepared body пишется во временный файл под `umask 077` и удаляется после
  settled outcome;
- каждый list/search вызов несёт explicit limit (`--limit` у `gh`,
  `--per-page`/`--page` у `glab`);
- структурированный вывод обязателен; парсинг human-column output запрещён;
- набор JSON-полей берётся из `--json`/`--output` help именно этой подкоманды:
  поля не переносятся между подкомандами;
- ссылки в body записываются полными URL, а не короткими ref.

GitHub (`gh 2.100.0`), canonical shapes:

```text
gh --version
gh auth status --hostname <host>
gh issue list --repo <HOST/>OWNER/REPO --state all --search "<query>" --limit <n> --json number,title,state,stateReason,url,updatedAt
gh issue view <number> --repo <HOST/>OWNER/REPO --json number,title,state,stateReason,url,body,comments
gh search issues <bare-qualifier> ... --repo OWNER/REPO --limit <n> --json number,title,state,url,updatedAt,repository
gh issue comment <number> --repo <HOST/>OWNER/REPO --body-file <prepared-body>
gh issue create --repo <HOST/>OWNER/REPO --title "<title>" --body-file <prepared-body>
gh api --hostname <host> --paginate <path>
```

Проверенные ограничения, которые обязана учитывать guidance:

- repo-scoped dedup выполняется `gh issue list --state all`: это единственная из
  трёх read-команд, которая одним вызовом покрывает открытые и закрытые и
  отдаёт `stateReason`;
- `gh search issues` принимает `--state` только `open` либо `closed` и не имеет
  JSON-поля `stateReason`; `--state all` ему не передаётся. Он используется для
  cross-repo поиска без `--state`, а состояние и причина закрытия уточняются
  `gh issue view`;
- `gh search issues --repo` принимает только `OWNER/REPO` без host, поэтому для
  GitHub Enterprise используется `gh issue list --repo <HOST>/<OWNER>/<REPO>`
  либо `gh api --hostname`;
- qualifiers для `gh search issues` передаются отдельными bare tokens
  (`repo:owner/name`, `is:open`), свободный многословный текст закавычивается;
  `gh issue list --search` принимает запрос одним значением флага;
- `--body-file -` читает stdin у `gh issue comment` и `gh issue create`.

GitLab (`glab 1.117.0`), canonical shapes:

```text
glab --version
glab auth status --hostname <host>
glab issue list --repo <target> --search "<text>" --in title,description --all --output json --per-page <n> --page <k>
glab issue view <iid> --repo <target> --output json --comments
glab issue create --repo <target> --title "<title>" --description-file <prepared-body>
glab api --hostname <host> --method POST projects/<url-encoded-path>/issues/<iid>/notes --input <prepared-note.json>
glab api --hostname <host> --paginate <path>
```

Проверенные ограничения, которые обязана учитывать guidance:

- у `glab issue list` нет `--state`: по умолчанию возвращаются только открытые,
  `--all` даёт открытые и закрытые, `--closed` — только закрытые. Dedup требует
  `--all` либо двух явных вызовов;
- флаг вывода различается по подкомандам: `glab issue list` использует
  `-O/--output`, `glab issue view` — `-F/--output`; каждая команда вызывается со
  своим флагом, перенос флага между ними запрещён;
- `glab issue note` не читает body из файла или stdin и без `--message`
  открывает editor. Поэтому многострочный comment публикуется через
  `glab api --input` с JSON `{"body": ...}`, собранным file-safe инструментом
  (`jq -Rs '{body: .}' < body.md > note.json`); это локальный обход §3.1 с
  обязательством upstream Issue. `glab issue note --message` допустим только для
  одной короткой строки без shell metacharacters;
- `glab issue create` поддерживает `--description-file` (и `-` для stdin);
  command substitution `--description "$(cat ...)"` запрещена;
- `--repo` принимает `OWNER/REPO`, `GROUP/NAMESPACE/REPO` либо полный URL;
  для self-hosted host используется полный URL проекта, а не форма
  `host/group/project`.

Truncation и pagination:

- `gh`: результат считается полным, если число строк строго меньше `--limit`;
  равенство limit трактуется как возможное усечение → ISS-14;
- `glab`: страницы перебираются `--page`, пока возвращается ровно `--per-page`
  строк; меньшая страница завершает перебор;
- authoritative перечисление выполняется `gh api --paginate` либо
  `glab api --paginate` с документированным path;
- вывод «дубликата нет» для известного repository делается только из
  `gh issue list --state all`, `glab issue list --all` или paginated API, но не
  из `gh search issues`, чей индекс может вернуть меньше фактического;
- evidence фиксирует limit, число строк и признак усечения каждого запроса.

Классификация host доказывается, а не выводится из имени:

1. `git remote get-url <remote>` даёт URL; host нормализуется (scheme, ssh user,
   port отбрасываются, регистр приводится к нижнему).
2. `github.com` и `gitlab.com` классифицируются сразу.
3. Иной host классифицируется единственным успешным authenticated probe:
   `gh auth status --hostname <host>` для GitHub Enterprise,
   `glab auth status --hostname <host>` для self-hosted GitLab. `--hostname`
   передаётся всегда: без него `glab auth status` берёт host из текущего
   контекста и не доказывает ничего о целевом repository.
4. Успех обоих probe, неуспех обоих, ошибка аутентификации или нечитаемый вывод
   дают `needs_attention` по ISS-12/ISS-11 — выбор «по установленному CLI»
   запрещён.

Bundled skills `gh` и `glab` являются документацией этих поверхностей и читаются
перед первой записью; они не становятся частью Meta-O поставки и не
переписываются.

## 5. Reviewer unit и authoritative response

Review unit — две одновременно созданные, видимые, независимые vendor-diverse
sessions. Reviewer не создаёт subagents, не видит peer report, не меняет
candidate и не запускает mutating diagnostics. Первый lifecycle review —
`deep`; remediation — `follow_up` в тех же hot sessions; final proof — свежая
пара на одном exact SHA. Отдельного clean verifier нет.

Этот раздел добавляет форму поверх `shared/references/review-protocol.md` и
ничего в нём не отменяет. Полный отчёт по-прежнему обязан нести всё, что уже
требует протокол: grounding, заявленный и фактический scope, выполненные checks
и stage evidence, evidence state каждой finding, causal path, impact,
actionable location, а также Unknowns и residual risks. Leading index,
report-local keys и markers — additive обвязка, а не сокращённая замена отчёта.
Требования протокола к severity, запрет numeric confidence и запрет finding id в
production comments сохраняются.

### 5.1 Именованные секции ответа

Ответ состоит из фиксированных секций; «пустота» всегда относится к конкретной
секции, а не к отчёту целиком:

```text
Review-Execution: <opaque dispatch id>
Candidate: <40-hex SHA>
Mode: requested=<fast|deep|follow_up> effective=<fast|deep|follow_up>
Delegation: none
Verdict: <PASS|FINDINGS|UNKNOWN>
Counts: P0=<n> P1=<n> P2=<n> P3=<n>

F-001 [P2] <одно короткое предложение о проблеме>
F-002 [P3] <одно короткое предложение о проблеме>

Evidence report
Grounding
...
Scope and checks
...
Findings
F-001
...
F-002
...
Unknowns
...
Residual risks
...
End-Review: <opaque dispatch id>
```

Секции `Grounding`, `Scope and checks`, `Findings`, `Unknowns` и
`Residual risks` встречаются ровно по одному разу, каждая на отдельной строке и
в этом порядке, между `Evidence report` и `End-Review:`. Для verdict `UNKNOWN`
между `Findings` и `Unknowns` добавляется единственная секция `Unknown-Account`.

Матрица обязательности по verdict:

| Секция             | `PASS`                                           | `FINDINGS`                    | `UNKNOWN`                                  |
| ------------------ | ------------------------------------------------ | ----------------------------- | ------------------------------------------ |
| Header block       | Полный; `Counts` — четыре нуля                   | Полный; counts равны findings | Полный; нули плюс строка `Unknown-Reason:` |
| Finding index      | Пустой                                           | Минимум одна keyed строка     | Пустой                                     |
| `Grounding`        | Непустая: intent, instructions, identity, scope  | Непустая                      | Непустая в достигнутом объёме              |
| `Scope and checks` | Непустая: покрытие, выполненные read-only checks | Непустая                      | Непустая в достигнутом объёме              |
| `Findings`         | Пустая                                           | Keyed entries, равные index   | Пустая                                     |
| `Unknown-Account`  | Отсутствует                                      | Отсутствует                   | Непустая                                   |
| `Unknowns`         | Явная строка, в том числе «none»                 | Явная                         | Непустая                                   |
| `Residual risks`   | Явная строка, в том числе «none»                 | Явная                         | Явная                                      |
| `End-Review:`      | Обязателен                                       | Обязателен                    | Обязателен                                 |

Пустой `PASS` без grounding, scope/checks, Unknowns и residual risks structurally
invalid: именно эти секции делают `PASS` доказательством покрытия, а не
утверждением доверия.

### 5.2 Распознавание и согласованность

Report-local keys монотонны от `F-001`, уникальны только внутри одного response и
не попадают в production comments. Index распознаётся только между строкой
`Counts:` и единственным heading `Evidence report`; body finding начинается с
точного ключа на отдельной строке внутри секции `Findings`. `End-Review:`
распознаётся только как последняя непустая строка и обязан повторять
`Review-Execution`; цитаты `Counts:`, `Evidence report`, имён секций или
`End-Review:` внутри body/code blocks не являются структурными markers.

Одна index-строка соответствует ровно одной body finding с тем же key; сумма
counts совпадает с числом keys, severity index совпадает с body. `PASS` имеет
нулевые counts и пустые index/`Findings`; `FINDINGS` — хотя бы одну согласованную
finding; `UNKNOWN` не утверждает findings/PASS и объясняет unreadable или
несогласованный contract. Regression получает обычную severity. Для requested
`follow_up` effective остаётся `follow_up`, если review не расширен, и становится
`deep` при semantic escalation.

`mo-review-orca` как caller владеет структурной проверкой response до handoff.
Mismatch index/body, отсутствующая обязательная секция или отсутствующий marker
требует одну полную самокоррекцию в той же hot session; повторный mismatch даёт
`UNKNOWN`. Deterministic test проверяет grammar fixtures, а live eval — что
reviewer следует ей; отдельный production parser/helper не создаётся.

Полная finding содержит проблему, практическое влияние,
`confirmed|strongly_supported` evidence, causal path, actionable location,
reproduction/contract proof, ожидаемое исправление и acceptance proof.
Ожидаемое исправление называет post-fix invariant, техническое направление и
достаточную глубину: `local patch`, `boundary repair` либо
`affected-slice redesign`.

### 5.3 Проекция для человека и pair aggregation

На reviewer tab leading index позволяет человеку быстро понять состояние.
Orchestrator или standalone caller публично сообщает full SHA, pair verdict и
агрегированные P0–P3 counts. Он не дедуплицирует, не ранжирует и не пересказывает
findings; совпавшая finding двух reviewers считается дважды и это явно отмечено.
Полные reports доступны executor, а не размножаются в human-facing update.
Это единственная авторизованная caller-проекция по `§A-RESPONSE-02`: складываются
числа, опубликованные самими reviewers, и никогда не содержание. Frozen decision
U-07 намеренно не разрешает caller ретранслировать leading index:
короткие строки остаются видимыми в reviewer tabs, а caller показывает counts.
`shared/references/review-protocol.md` является изменяемым артефактом slice 4:
секции §5.1 добавляются как форма его же обязательных элементов, а запрет
формулируется как запрет numeric confidence и adjudication grammar с
единственным исключением для целочисленного P0–P3 census опубликованных findings.

Pair aggregation не содержит judgment:

| Report A                                      | Report B                                    | Pair verdict | Public counts                         |
| --------------------------------------------- | ------------------------------------------- | ------------ | ------------------------------------- |
| Valid `PASS`                                  | Valid `PASS`                                | `PASS`       | Нули                                  |
| Valid `FINDINGS`                              | Valid `PASS` либо valid `FINDINGS`          | `FINDINGS`   | Покомпонентная сумма authored counts  |
| Valid `PASS`                                  | Valid `FINDINGS`                            | `FINDINGS`   | Покомпонентная сумма authored counts  |
| `UNKNOWN` либо structural/transport failure   | Любой                                       | `UNKNOWN`    | Не используются как settlement signal |
| Любой                                         | `UNKNOWN` либо structural/transport failure | `UNKNOWN`    | Не используются как settlement signal |
| Разные SHA, duplicate slot или missing report | Любой                                       | `UNKNOWN`    | Не публикуются как полная pair        |

Canonical `PASS` — полный header, четыре нуля, пустые index и `Findings`,
непустые `Grounding`/`Scope and checks`, явные `Unknowns`/`Residual risks` и
valid end marker. Canonical `FINDINGS` — то же плюс минимум один keyed
index/body item. Canonical `UNKNOWN` — полный header с verdict `UNKNOWN`,
нулевыми counts, пустым index, строкой `Unknown-Reason: <typed-code>` и непустой
секцией `Unknown-Account`. Нулевые counts означают только «ни одна finding не
утверждается» и не освобождают от отчёта о проделанной работе:
`Unknown-Account` содержит выполненные stages ordered algorithm, фактически
покрытый scope, точное блокирующее наблюдение с командой или публичной
поверхностью и что именно сняло бы неопределённость. Допустимые typed codes:
`unreadable`, `candidate_mismatch`, `dirty_candidate`, `malformed_report`,
`retrieval_failure`, `handoff_failure`, `review_incomplete`.

## 6. Lossless pair handoff

Для каждой pair caller создаёт platform secure-temp namespace:

```text
${system-temp}/mo-review.<candidate-short>.<secure-random>/
  review-A-<path-safe-vendor-slug>.md
  review-B-<path-safe-vendor-slug>.md
```

Caller устанавливает `umask 077`, создаёт directory через platform `mktemp -d`
с конечным random template минимум в восемь symbols, проверяет `realpath` как
потомка system temp и mode `0700`. Slot `A|B` назначается до запуска reviewers;
vendor slug проходит `^[a-z0-9][a-z0-9-]{0,31}$`, поэтому filenames различны
даже при одном vendor label. Каждый payload сначала пишется exclusive во
временный файл mode `0600` внутри namespace, `fsync`/close завершают запись, а
rename внутри того же directory атомарно публикует final filename. Collision,
symlink/non-regular target, permission/realpath/rename failure дают `UNKNOWN` и
не разрешают handoff. Caller перечитывает file size и `End-Review`, затем одним
ordinary message передаёт потребителю `pair_id`, оба exact paths и sizes.

### 6.1 Потребитель handoff

У handoff всегда есть названный потребитель, и без его acknowledgement namespace
не удаляется.

| Режим                                  | Потребитель                                                       | Settled acknowledgement                                                                       | Cleanup                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Full lifecycle                         | Executor session                                                  | Executor полностью читает оба payload, проверяет sizes/end markers и подтверждает приём обоих | Разрешён немедленно после acknowledgement                                                                             |
| Standalone review из executor          | Вызвавшая executor session (она же caller и владелец исправлений) | То же подтверждение от caller-executor                                                        | Разрешён после acknowledgement                                                                                        |
| Standalone review, вызванный человеком | Человек                                                           | Skill в финальном ответе сообщает оба exact paths, sizes и census                             | Автоматический cleanup запрещён; namespace остаётся, пока человек или следующий явный `mo-*` вызов не распорядится им |

Machine consumer подтверждает точной строкой
`Review-Handoff-Ack: <pair_id> A=<decimal-bytes> B=<decimal-bytes>` после полного
чтения обоих файлов. Любой иной текст не является acknowledgement. Это узкий
transport contract `§A-RESPONSE-03`, а не новый state store; его обязательство по
§3.1 — завести Issue, если подтверждён публичный пробел Orca, вместо которого
эта строка стоит. В human-caller режиме ownership не наследуется автоматически:
namespace считается переданным человеку и агент никогда не удаляет его без
отдельного явного указания exact path в последующем запросе.

### 6.2 Acknowledgement failure

Отсутствующее, частичное или несогласованное acknowledgement (не совпали sizes,
end markers или число прочитанных payload) обрабатывается как typed failure по
образцу §9, а не как мгновенный провал и не как бесконечная переписка:

- ровно один раз повторяется тот же ordinary message с теми же exact paths и
  sizes; новые файлы не создаются, payload не перезаписывается и не
  пересобирается;
- потребитель перечитывает оба payload с диска: источником истины остаётся файл,
  а не текст сообщения;
- второе подряд отсутствующее или несогласованное acknowledgement делает pair
  `UNKNOWN`;
- при `UNKNOWN` namespace не удаляется: он сам является evidence, и его exact
  paths вместе с точной recoverable cleanup command публикуются в статусе для
  человека; caller текущего запуска остаётся единственным владельцем cleanup;
- transport failure самого message отличается от отказа потребителя читать:
  первый покрывается тем же единственным повтором, второй сразу требует
  внимания человека и не маскируется дополнительными попытками;
- повтор не разрешён для retrieval, write, reread и truncation failure самих
  файлов: они делают pair `UNKNOWN` сразу, потому что payload уже не заслуживает
  доверия.

Фонового sweeper нет; удаляется только exact-owned namespace текущего запуска.
Manifest, digest, database и report transport schema не создаются.

## 7. Standalone ownership, sessions и cleanup

`mo-review-orca` создаёт только двух reviewers. При вызове из executor текущий
executor остаётся caller и владельцем исправлений; review skill не создаёт
executor/fixer/orchestrator/verifier и не принимает ownership caller session.

При `FINDINGS` оба reviewers остаются hot для своих follow-ups. Перед fresh
final pair прежние reviewers освобождаются. После final settlement закрываются
только exact-owned Dispatch/terminal handles. Foreign и human-owned tabs не
затрагиваются. Если `worker-release` сообщает `no_owned_resource` для терминала,
созданного этим запуском через low-level route, закрывается именно сохранённый
exact handle этого терминала; handle, владение которым не доказано, не
закрывается, а несоответствие фиксируется по §3.1 как воспроизводимый upstream
дефект.

Visible titles обязательны и в full orchestration, и standalone review:

```text
<work-slug>:orchestrator
<work-slug>:executor
<work-slug>:review:<vendor>
<work-slug>:e2e:<n>
```

Title — label, не identity. Cleanup использует exact handle. Composed start без
title получает public rename с проверочным чтением; low-level terminal получает
title при создании. Route без public set/verify title capability unsupported.
Per-tab color применяется best effort только через публичную capability и не
является gate.

## 8. Trust-safe delivery и upstream guides

Task bytes нельзя отправлять ни в Claude Code, ни в Codex, ни в OpenCode, пока
active input surface выбранного harness не доказана как normal agent prompt.
Для Claude это дополнительно означает отсутствие workspace trust UI; для всех
routes — отсутствие shell prompt. Универсальный безопасный порядок:

1. Создать exact terminal без task bytes и сохранить handle.
2. Дождаться public `tui-idle`.
3. По version-matched public observation доказать process identity, normal
   prompt данного harness и отсутствие trust UI/shell prompt.
4. При unreadable/ambiguous observation вернуть `unknown`, ничего не доставлять.
5. После positive readiness создать/inject Dispatch один раз.
6. Только после появления Dispatch использовать `worker-show` для проверки
   delivery, consumption и `agentWait`.

Composed start разрешён только когда version-matched public Orca capability
доказывает, что task bytes удерживаются до того же positive readiness и не могут
попасть в trust UI/shell; иначе для route обязателен terminal-first порядок выше.
Таким образом rename-after-start остаётся допустим только для доказанно
безопасного composed route. Недостающий readiness marker для любого harness
делает именно этот route unsupported и фиксируется в §17.

`mo-setup` до начала lifecycle выполняет read-only feasibility probe каждой
выбранной Orca version/harness route. Если public surface не различает состояния,
route unsupported заранее. Setup может предложить personal trust configuration,
показывая exact target, workspace scope и security consequence; изменение
личной конфигурации требует подтверждения.

Сам probe является локальным обходом публичного пробела и подпадает под §3.1:
воспроизведённый пробел даёт upstream Issue, а canonical URL живёт рядом с
probe до его удаления.

### 8.1 Version-matched guide locator

Возражение «у двух обязательных guides нет единого locator» принято: требование
«прочитать guide» без адреса не исполнимо и не проверяемо. Locator — публичная
поверхность самого установленного `orca`, которая читает bundled guide локально:

```text
orca skills list --json
orca skills get orchestration --json
orca skills get orca-cli --json
```

Нормативные правила locator:

- обязательные canonical topics — ровно `orchestration` (lifecycle, tasks,
  Dispatch, messages) и `orca-cli` (terminal create/show/read/rename/close/wait
  и low-level operations);
- version match обеспечивается тем, что guides и operational commands берутся из
  одного и того же исполняемого `orca`. Абсолютный путь binary резолвится один
  раз за run, записывается в evidence вместе с версией из `orca status`, и все
  последующие вызовы используют именно его. Если в PATH и в app bundle
  резолвятся разные binaries, это ambiguity: route `needs_attention`, а не выбор
  «какой ближе»;
- readiness доказывается двумя фактами: оба topic присутствуют в
  `orca skills list --json`, и `orca skills get <topic>` возвращает непустой
  Markdown. Отсутствующий topic, пустой или нечитаемый вывод делают route
  unsupported и фиксируются в §17;
- `--full` используется только когда skill'у действительно нужны bundled
  reference documents; по умолчанию читается основной guide;
- копии guides в harness home не устанавливаются: `orca skills install` и
  `orca skills update` для этой цели не вызываются (U-13).

`mo-setup` выполняет этот же read-only locator для установленных harnesses и
сохраняет evidence: resolved binary path, версию, список topics и факт
непустого содержимого. Provider posture имеет одного владельца: fallback не
дублирует flags, уже добавленные Orca wrapper.

### 8.2 Git-ignore posture рабочих артефактов

`mo-setup` в Git-проекте обязан проверить, что оба project-relative пути
`.orca/` и `spec/` покрыты effective ignore rules. Проверка выполняется через
Git, а не поиском буквальных строк в `.gitignore`, чтобы учитывать эквивалентные
patterns и вложенные ignore-файлы:

```text
git check-ignore --no-index -- .orca/
git check-ignore --no-index -- spec/
```

Успех доказывается отдельно для каждого пути. Отсутствие coverage хотя бы для
одного пути — setup gap: `mo-setup` называет непокрытый путь и предлагает
добавить минимальное project-owned правило в `.gitignore`. После принятого
изменения probe повторяется; ложный успех по общему exit code двух путей
запрещён. Глобальный exclude, user-level ignore и изменение tracked state не
используются как замена project-owned правилу: новый checkout должен получать
тот же posture из repository. Само наличие каталогов не требуется, а их
содержимое не читается и не индексируется этой проверкой.

## 9. Blocking wait cadence и liveness

Caller владеет одной run-wide blocking wait point, покрывающей весь текущий set
выставленных actors. Формула «один waiter на actor» означает, что один actor не
может одновременно входить в несколько wait sets; она не требует параллельного
blocking call на каждого reviewer. Public event содержит exact Dispatch/actor
handle, по которому caller детерминированно demultiplex'ит пробуждение.
Waiter подписан только на `worker_done`, `escalation` и `question` текущего run;
events foreign run, released actor или уже settled Dispatch отбрасываются до
выдачи caller и не могут сокращать arm. Если один return содержит batch, caller
обрабатывает все элементы в backend order, по одному exact handle, затем один
раз пересчитывает active set. Retry counter обнуляется после любого штатного
return (`relevant_event` или `quiet_timeout`), но не после partial transport
output. Поток событий одного actor не starving другие: settled handle удаляется,
а actor с незавершённым событием остаётся в следующем run-wide set.

Cadence:

- executor arm — до `600000 ms`;
- reviewer/E2E arm — до `300000 ms`;
- standalone caller ждёт reviewer set arms по `300000 ms`;
- arm run-wide wait равен минимуму cadence классов actors, которые ещё ожидаются:
  reviewer/E2E в set делает arm `300000 ms`, один executor — `600000 ms`; после
  settled/released actor длительность пересчитывается;
- relevant public event будит arm раньше;
- healthy quiet timeout создаёт внутренний checkpoint и перевооружает arm без
  restart, replacement, detailed terminal read и user-facing narration; только
  следующий bounded liveness snapshot разрешён;
- один public event-backed liveness snapshot допустим только на границе arm и не
  чаще его cadence; он не отправляет worker сообщение и не считается progress;
- transport/tool failure waiter отличается от healthy timeout: тот же arm
  повторяется один раз, второй последовательный failure даёт
  `UNKNOWN/needs_attention` без автоматической подмены actor.

Outcome table задаёт единственное разрешённое продолжение:

| Outcome                    | Наблюдение                                                            | Следующее действие                                                                                     |
| -------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `relevant_event`           | Public event exact member wait set                                    | Обработать один event, обновить set, сразу пересчитать/вооружить следующий arm при наличии actors      |
| `quiet_timeout`            | Waiter штатно вернул timeout                                          | Один public liveness snapshot всего set; без сообщения/narration перевооружить тот же рассчитанный arm |
| `transport_failure_first`  | Wait tool/transport завершился ошибкой, terminal state не доказан     | Один повтор того же рассчитанного arm                                                                  |
| `transport_failure_second` | Вторая последовательная ошибка                                        | `UNKNOWN/needs_attention`, actors не restart/release/replace                                           |
| `terminal_state`           | Public event/snapshot доказал question, failure, limit или completion | Выполнить существующий typed recovery для exact actor; timeout сам это состояние не выводит            |

`sleep`, минутный polling, несколько waiters на actor и сообщения вида «первый
60-секундный wait завершился, продолжаю ожидание» запрещены. Реализация обязана
доказать, что requested arm поддерживается host timeout; несовместимый route
нельзя тихо заменить более частым polling — он идёт в §3.1 как unsupported с
upstream Issue.

## 10. Skill activation

Любой `mo-*` запускается только:

1. когда пользователь явно назвал exact skill; либо
2. когда уже активный `mo-*` прямо называет exact callee в собственном
   `SKILL.md`.

### 10.1 Поверхность принуждения

Самозапуск BKL-08 произошёл не из-за графа вызовов, а потому что harness
выбирает skill по полю `description` во frontmatter. Runtime-хука у нас нет,
поэтому контракт принуждается там, где harness читает:

- `description` каждого `mo-*` skill начинается с explicit-invocation clause,
  называющей exact skill name и условие вызова, и не содержит широких trigger
  формулировок вида «use when reviewing code»;
- тело `SKILL.md` повторяет норму и перечисляет literal callees;
- literal call graph кодируется одним AST-recognizable разделом
  `## Meta-O calls`: unordered list содержит только exact inline-code имена
  разрешённых `mo-*` callees; отсутствие вызовов задаётся единственной строкой
  `- none`; дубликаты, неизвестные имена, prose/link вместо inline code и calls
  вне раздела отклоняются;
- frontmatter не получает новых ключей: допустимы только `name`, `description`,
  `license`, `compatibility`, `metadata`, `allowed-tools`;
- deterministic lint настоящей Markdown AST-библиотекой по `src/skills/` и
  собранным `skills/` проверяет ровно один такой раздел, наличие clause в каждом
  `mo-*` description, отсутствие broad-trigger шаблонов и совпадение объявленных
  callees с фактическими exact skill references в вызывающих инструкциях;
- live eval подаёт near-miss prompt («посмотри мой код», «сделай ревью
  изменений») и доказывает, что ни один `mo-*` не активировался.

Внутренний graph состоит только из literal dependencies и проверяется
детерминированно; heuristic hidden edges запрещены. `find-reuse`, `senior-jsts`
и `senior-python` могут срабатывать неявно в своей узкой applicability и
сохраняют свои narrow-applicability descriptions. Существующий forbidden case
`find-reuse` для обычного package question сохраняется: implicit applicability
не разрешает ненужный formal report.

## 11. Reviewer model recommendation

`shared/scripts/mo-models.mjs` остаётся единственным model discovery helper и
не становится selector. Model-selection flow:

1. Получить актуальные provider catalogs.
2. Показать unique model ids из всех читаемых regular session files за последние
   31 день; убрать предел десяти sessions и не выдавать history за catalog.
   Discovery не следует symlink, сортирует candidate files по
   `(mtime desc, normalized path asc)`, читает потоково только поля model id и
   никогда не возвращает prompt/transcript content. Бюджет — `5000 ms` и
   `64 MiB` прочитанных bytes на provider; unreadable/corrupt files считаются и
   перечисляются bounded relative identifiers. При исчерпании бюджета вывод
   сохраняет найденные ids, но ставит `history_complete: false` и точную причину,
   а не утверждает, что это все модели.
3. Для default recommendation выбрать доступные современные powerful coding
   models с подтверждённым coding positioning, нужными capabilities и effort.
   Допустимое positioning/capability evidence: структурированные поля и labels
   актуального provider catalog, version-matched bundled provider metadata либо
   official model description, на которую ссылается catalog. Имя модели,
   популярность и recent use сами по себе не доказывают coding positioning;
   recent use — дополнительный сигнал.
4. Сейчас рекомендовать `codex/gpt-5.6-sol/high` и
   `claude/opus[1m]/high`. Эти ids — текущие ориентиры, не permanent hard-code.
5. Astra/Fable-class models не рекомендовать reviewers по умолчанию, но
   показывать при запросе всех вариантов.
6. Не угадывать positioning неизвестной модели. Если ни одна доступная модель
   провайдера не имеет допустимого evidence, показать catalog и вернуть
   `no_default_recommendation` с причиной. Кратко объяснять критерии рекомендации
   и provenance positioning evidence.
7. Explicit user selection авторитетна; fallback model/effort запрещён.

### 11.1 Discovery interface

Нормативный read-only вызов:

```text
node shared/scripts/mo-models.mjs --catalog --project <absolute-root> --json
```

Он возвращает один JSON object
`{contract:"meta-o.model-discovery.v2", providers:[...]}`. Provider row содержит
`route`, `catalog:{status,exhaustive,models[]}`, `history:{complete,models[],
scannedFiles,unreadableFiles,bytesRead,elapsedMs,stopReason}`; model rows содержат
только catalog `id`, доступные structured `label|description|capabilities|efforts`
и source kind. Arrays сортируются route/id, duplicates удаляются exact id.
`status`/`stopReason` используют только `ok|unavailable|timeout|partial|corrupt`.
Ненулевой exit предназначен для invalid arguments/foreign schema; unavailable
provider остаётся typed row, чтобы full-list не исчезал молча. Helper не имеет
поля `recommended` и не читает содержимое prompts. Existing human-readable
`--catalog` является projection того же object; JSON — test/eval contract.

## 12. Durable defect memory

Setup-managed compact rule в byte-identical `AGENTS.md`/`CLAUDE.md` требует:

- confirmed reproducible behavioral defect получает smallest focused regression
  test, который падает до fix и проходит после;
- test name/description коротко объясняет failure scenario;
- substantial ownership/concurrency/trust/security/compatibility/transaction/
  resource-lifetime change получает рядом комментарий о non-obvious invariant;
- сознательно неисправленное замечание по-прежнему получает комментарий «почему
  так» (`§B-REVIEW-02`), сформулированный как долговечная причина;
- production comment не пересказывает syntax и не содержит finding id.

`mo-setup` проверяет наличие компактной нормы и предлагает её проекту. Executor
получает правило из project contract даже без активного Meta-O skill.

## 13. Eval portability business contract

Model eval проверяет instruction following и correct skill behavior, а не
precision/recall code review и не способность найти seeded bugs.

Обязательный blocking gate для каждого applicable model-backed case:

| Harness     | Requested profile | Требование                                       |
| ----------- | ----------------- | ------------------------------------------------ |
| Codex       | `gpt-5.6-sol/low` | Обязательный; effective identity должна совпасть |
| Claude Code | `opus[1m]/low`    | Обязательный; effective identity должна совпасть |

Желательная portability matrix на машине разработки:

| Harness                      | Requested profile  | Требование                                       |
| ---------------------------- | ------------------ | ------------------------------------------------ |
| Codex                        | `gpt-5.6-luna/max` | Запустить, когда profile доступен                |
| OpenCode + local `llama.cpp` | `qwen 3.8 27b`     | Запустить, когда model/provider/harness доступны |

Недоступный обязательный profile даёт `blocked|not_run`, не `PASS` и не fallback.
Недоступный желательный profile явно фиксируется как `not_available`, не
подменяется и не блокирует обязательный gate. Если желательный profile доступен
и запущен, `FAIL|UNKNOWN` является finding, который нельзя скрыть статусом
advisory.

Владельцы migration: `docs/business.md` и
`docs/architecture/evaluation-model-policy.md` задают policy; optional settings
roles `testCodexDesired`/`testOpenCodeDesired` и изменённые обязательные
`testCodex`/`testClaude` принадлежат `shared/scripts/mo-models.mjs` без изменения
settings schemaVersion 1; `tools/skill-evals.mjs` владеет prompt/evidence v3 и
aggregation; `src/skills/*/evals/cases.json` переходит с
`meta-o.skill-eval-cases.v1` на v2; tests и `docs/acceptance.md`/`docs/e2e.md`
владеют proof map. Optional desired role отсутствует законно и материализуется
как `NOT_AVAILABLE`, не fallback.

Cases v2 по-прежнему содержит ровно `positive`, `forbidden`, `degraded`, но
каждый case добавляет непустой `contracts: [<§A/§B id>...]`; новые требования
встраиваются в соответствующие oracles этих трёх bounded cases, а не создают
неограниченный corpus. Старое поле `policy` сохраняется только как ownership
label (`advisory|critical`) и больше не выбирает model identity. Для всех восьми
skills behavior matrix обязательна на двух required profiles. Отдельный
`critical-orchestration` run для `mo-orchestrate-orca` использует B22 и не
входит в это декартово произведение.

### 13.1 Evidence schema одного eval-прогона

`tools/skill-evals.mjs` вводит
`meta-o.skill-eval-evidence.v3` как additive successor v2. V3 сохраняет поля v2
`candidate`, `skillRevision`, `skill`, `policy`, `repetition`, `requested`,
`harness`, `execution` и `results`, а на уровне envelope добавляет `tier` и
`matrixProfile`. Composite identity равна точному набору
`requested.route/model/effort + harness.name/version/profileVersion/
quantization/context/sampling/toolPermissions`; effective identity берётся
только из native execution evidence и обязана совпасть с requested для `PASS`.

Каждая matrix coordinate
`(skillRevision, caseId, matrixProfile, repetition=1)` производит одну запись со
всеми полями; отсутствие поля делает запись `UNKNOWN`, а не `PASS`:

| Поле                | Значение                                                                  |
| ------------------- | ------------------------------------------------------------------------- |
| `case_id`           | Идентификатор eval case                                                   |
| `contract_id`       | `§A-*`/`§B-*`, который case доказывает                                    |
| `tier`              | `required` либо `desired`                                                 |
| `harness`           | `codex`, `claude-code`, `opencode`                                        |
| `harness_version`   | Версия установленного harness                                             |
| `requested_profile` | Запрошенные model id и effort                                             |
| `effective_model`   | Подтверждённая effective identity                                         |
| `effective_effort`  | Подтверждённый effort                                                     |
| `candidate_sha`     | Full 40-hex SHA                                                           |
| `status`            | `pass`, `fail`, `unknown`, `blocked`, `not_run`, `not_available`          |
| `observed_action`   | Ссылка на наблюдаемое действие (public surface), не на цитату из Markdown |
| `evidence_ref`      | Путь/handle публичной поверхности, откуда снято наблюдение                |

Validator вычисляет ожидаемое декартово произведение полного corpus и двух
required profiles; для каждого applicable case обе coordinates обязаны быть
`PASS`. `NOT_APPLICABLE` допустим только с observation точного правила
применимости и применяется к case, а не как замена недоступного profile.
Отсутствующая required coordinate материализуется как `NOT_RUN` и делает gate
ненулевым; `BLOCKED`, `FAIL` и `UNKNOWN` тоже блокируют. Desired coordinates
присутствуют всегда, минимум как `NOT_AVAILABLE` с availability evidence; если
запущены, `FAIL|UNKNOWN` становятся обычной finding.

Агрегат группирует сначала по `skillRevision/caseId`, затем по фиксированному
порядку required Codex, required Claude, desired Luna, desired OpenCode; общий
`PASS` возможен только когда все applicable required coordinates — `PASS` и нет
дубликатов composite identity. V2 остаётся читаемым только для исторической
диагностики; новый gate принимает исключительно V3. Migration fixtures
доказывают явное `legacy_v2` вместо молчаливого повышения старого evidence.

Embedded/live cases покрывают новые contracts: leading index и полный отчёт со
всеми секциями §5.1, включая непустые `Grounding`/`Scope and checks` при `PASS`
и `Unknown-Account` при `UNKNOWN`; standalone ownership, потребитель handoff и
bounded acknowledgement retry; explicit `mo-*` activation и non-activation на
near-miss prompt; выбор строки decision table §4.5 по `scenario_id` в незнакомом
Issue-сценарии, включая усечённый search (ISS-14), неклассифицированный host
(ISS-12) и отсутствующий CLI capability (ISS-15); default/full-list model
selection; quiet wait; trust prompt; guide locator; hot reviewers; lossless pair
handoff. Deterministic fixture используется вместо модели, когда доказывает тот
же контракт.

### 13.2 Отдельное доказательство local orchestration

`§B-PORTABILITY-08` остаётся отдельным blocking outcome: configured local
Qwen/OpenCode orchestrator управляет bounded lifecycle, waits и Dispatch и не
пишет product code. Его evidence сохраняется в существующем critical profile
suite/B22 и не может быть удовлетворено desired строкой `qwen 3.8 27b` из skill
eval matrix, даже если model id совпадает. Skill eval доказывает instruction
following одного case; B22 доказывает ownership целого lifecycle.

## 14. Acceptance и E2E

### 14.1 Исполнимый субъект детерминированных проверок

Возражение «детерминированные Issue-фикстуры не имеют исполняемого субъекта»
принято: без названного субъекта такой тест проверял бы наличие слов, а не
нормы. Субъект называется явно, и границы каждого слоя тоже:

| Слой                           | Что исполняется                                                                                                                                                         | Что доказано                                                                                                                                                        | Чего не доказывает                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Deterministic table evaluation | Canonical decision table §4.5, разобранная настоящей Markdown AST-библиотекой, и test-only evaluator в `tests/`, который применяет её к fixture-сценариям ISS-01…ISS-15 | Таблица прямоугольна, полна, однозначна, покрывает каждый сценарий, запрещает upstream-запись в project remote и даёт ровно одно `required_action`                  | Что агент её применил                         |
| Recorded-surface conformance   | Сохранённые выводы `gh --version`, `glab --version`, `--help` каждой подкоманды §4.6, `orca skills list --json` и реальных read-only search-запросов как fixtures       | Команды, флаги, JSON-поля, state-семантика и limit/pagination, названные §4.6 и §8.1, существуют в установленных версиях; parsing документированных полей корректен | Что запись действительно произойдёт правильно |
| Live/embedded eval §13         | Агент + реальный skill на required-матрице                                                                                                                              | Агент выбирает строку таблицы, называет `scenario_id` и выполняет её действие на новом сценарии                                                                     | Ничего сверх наблюдённого действия            |

Test-only evaluator живёт исключительно в `tests/`, не поставляется в `skills/`,
никогда не вызывает `gh`/`glab`/сеть и не участвует в lifecycle. Поэтому он не
является project proxy над native CLI и не отменяет отказ от helper-слоя (D-19).
Если когда-нибудь потребуется исполняемая логика сверх таблицы — ветвления,
состояние, вызовы CLI — это будет переоткрытием D-19 и потребует отдельного
решения, а не тихого разрастания тестовой утилиты.

Та же тройка слоёв применяется к другим текстовым контрактам: activation,
waits, titles и review response проверяются на структуре текста детерминированно,
а на поведении — evals и E2E.

### Deterministic proof

- test живой spec-ledger доказывает биекцию каждого frozen source AST block из
  §19, включая BKL-00 и BKL-01…BKL-18, с disposition/proof без потерь;
- backlog schema принимает временные entries, named lifecycle closure требует
  пустоты, обычный mid-feature QC — нет;
- live-spec ledger test требует canonical URL у каждой settled
  `project_issue`/`upstream_issue` disposition и URL либо explicit `unsupported`
  у каждого локального обхода §3.1; после harvest этот временный test input
  удаляется, исторический `§A-MEMORY-03` не меняется;
- каждая нормативная таблица (§4.5, §5.1, §5.3, §9 outcome, §13, §14.1)
  разбирается AST-библиотекой в прямоугольную матрицу без пустых ячеек и без
  неэкранированных `|` внутри значений (§2.4);
- decision table §4.5 присутствует, имеет стабильные колонки, покрывает
  ISS-01…ISS-15, использует только допустимые значения `disposition_class` и не
  содержит строки без `required_action`;
- каждый новый или изменённый `§A-*` identifier резолвится ровно в один owning
  file §2.2, и этот файл содержит его heading; ни один новый identifier не
  появляется в двух файлах;
- Issue fixtures доказывают асимметричный routing: `upstream_issue` разрешается
  только из explicit repository или verified ownership metadata, при их
  отсутствии даёт `needs_attention`, и ни один сценарий не отправляет upstream
  defect в `origin`/tracking ref; `project_issue` использует explicit → tracking
  ref → `origin`; неустановленный класс disposition не пишет никуда;
- Issue fixtures доказывают host-по-URL с authenticated host probe для
  enterprise/self-hosted hosts, search-before-write по открытым и закрытым,
  explicit limit и truncation-aware вывод (ISS-14), три признака root-cause
  match, три closed-issue исхода, запрет автоматического reopen, prepared-body
  redaction, body через file/stdin без shell-интерполяции и lookup после unknown
  effect без публикации dummy Issue;
- recorded-surface fixtures доказывают: `gh issue list` принимает `--state all` и
  отдаёт `stateReason`; `gh search issues` не принимает `--state all` и не имеет
  `stateReason`; `glab issue list` не имеет `--state` и покрывает закрытые через
  `--all`/`--closed`; `glab issue note` не имеет body-file флага, поэтому
  многострочный comment идёт через `glab api --input`; `glab issue create`
  принимает `--description-file`; ни одна нормативная write-команда не
  вызывается без body-флага; отсутствующий флаг даёт ISS-15, а не подстановку;
- guide locator fixtures доказывают, что `orca skills list --json` содержит
  `orchestration` и `orca-cli`, что `orca skills get <topic>` возвращает
  непустой Markdown, что resolved binary path и версия попадают в evidence и что
  установка guides в harness home не выполняется;
- review fixtures доказывают report-local keys, anchored leading index,
  присутствие и порядок секций §5.1, непустые `Grounding`/`Scope and checks` и
  явные `Unknowns`/`Residual risks` при `PASS`, пустоту только index и
  `Findings`, counts/body/end-marker consistency, `follow_up` effective mode, one
  correction, remediation-depth obligation и непустой `Unknown-Account` у каждого
  `UNKNOWN`; `shared/references/review-protocol.md` разрешает только P0–P3 census
  и сохраняет остальные counter prohibitions;
- private namespace уникален/path-safe; handoff ждёт acknowledgement названного
  потребителя, допускает ровно одну bounded re-delivery, при втором отказе даёт
  `UNKNOWN` и сохраняет namespace; human-caller режим namespace не удаляет;
- standalone создаёт ровно pair; hot/fresh lifecycle и exact cleanup сохранены;
  `no_owned_resource` не приводит к закрытию недоказанного handle;
- titles обязательны; оба bundled guide topic обнаруживаются через locator §8.1;
- trust prompt запрещает delivery, posture flag имеет одного владельца;
- waits используют одну run-wide wait point, минимум `600000/300000` по active
  actor classes, deterministic handle demultiplexing, outcome table и bounded
  failure retry без minute polling/narration;
- activation graph literal; каждый `mo-*` description содержит
  explicit-invocation clause и не содержит broad triggers; три non-`mo-*`
  exceptions не расширены;
- model helper показывает catalog и bounded streaming 31-day history, явно
  помечает partial/unreadable input; default recommendation использует только
  admissible positioning evidence, full-list границы различаются;
- byte-identical project contract содержит regression/invariant rule;
- каждый изменённый business/architecture identifier сохраняет корректную
  semantic history, а новые ids не встречаются в Git истории.

### Live skill eval

Каждый применимый case выполняется на обязательной матрице §13 и записывается по
schema §13.1. Желательная матрица запускается по availability policy. Evidence
доказывает observed action, а не наличие фразы в Markdown. Review-quality
benchmark, mutation corpus, reviewer subagents и clean verifier отсутствуют.

### Orca E2E

Существующие B12/B13/B16/B18/B20/B21 расширяются, новые ids после B22 проверяют:

- B23: stable titles и exact-owned cleanup в standalone/full lifecycle;
- B24: Claude trust UI и shell prompt любого harness блокируют task bytes;
  доказанный composed route либо terminal-first positive readiness допускает
  ровно одну Dispatch delivery;
- B25: одна run-wide wait point применяет executor 10-minute и reviewer/E2E
  5-minute cadence к active set; early event, quiet timeout, demultiplexing и
  waiter failure различимы;
- B26: locator §8.1 возвращает оба version-matched topic из одного resolved
  `orca` binary, содержимое непусто, guides применены по ownership, и ни один
  guide не установлен в harness home;
- B27: default coding recommendation и full catalog с Astra/Fable;
- B28: complete review pair прочитана потребителем до namespace cleanup, а в
  human-caller режиме namespace сохранён и его paths сообщены;
- B29: hot reviewers переживают `FINDINGS`, fresh pair проверяет final SHA;
- B30: near-miss prompt не активирует ни один `mo-*` skill;
- B31: молчащий потребитель handoff получает ровно одну re-delivery, затем pair
  становится `UNKNOWN` с сохранённым namespace;
- B32: evidence v3 содержит полное required matrix product, desired availability
  rows и не засчитывает desired Qwen row вместо отдельного critical B22;
- B33: read-only Issue discovery на реальном hosting классифицирует host probe'ом,
  выполняет explicit-limit search по открытым и закрытым нужной командой каждого
  CLI и честно помечает усечение вместо вывода «дубликата нет»;
- B34: реальный `PASS` от обоих reviewers содержит непустые
  `Grounding`/`Scope and checks` и явные `Unknowns`/`Residual risks`, а пусты
  только finding index и `Findings`.
- B35: `mo-setup` отдельно доказывает через `git check-ignore --no-index`, что
  `.orca/` и `spec/` покрыты project-owned ignore rules; отсутствие любого
  правила даёт setup gap и предложение минимальной правки `.gitignore`.

### Доказательство Issue flow без dummy writes

Запрет dummy external writes сохраняется и не противоречит требованию evidence,
потому что доказательство разделено на три уровня §14.1:

1. Read-only против реального hosting: resolution класса disposition и
   repository, host probe, реальные search queries с explicit limits и их
   результаты — выполняются всегда и являются evidence.
2. Fixture-backed write path: prepared title/body, redaction, dedup решение,
   truncation handling, capability gap (ISS-15) и unknown-effect recovery
   проверяются детерминированно, без сети.
3. Реальная запись выполняется только при подтверждённом реальном defect; её
   query, sanitized body, write result и canonical URL становятся evidence.

Если за lifecycle ни один реальный defect не подтверждён, уровни 1–2 являются
достаточным acceptance, а отсутствие write фиксируется явно. Создавать тестовый
Issue ради зелёного gate запрещено.

## 15. Implementation slices

1. Выполнить pre-lifecycle migration checkpoint: проверить worktree hashes и
   AST inventory §19/BKL-00…BKL-18, materialize disposition evidence и очистить
   backlog до substantive implementation без нового closure-map.
2. Изменить business/architecture semantics backlog, Issues, eval portability и
   review projection с проверенными identifiers; создать новые ADR файлы ровно
   по owning-file карте §2.2, внести поправки к `§A-REVIEW-02`,
   `§A-RESPONSE-02` и точные `Knowledge-ID-Change` trailer/YAML authorizations,
   обновить списки ADR в `CLAUDE.md`/`README.md`.
3. Обновить backlog lifecycle, Deferral lens и autonomous Issue guidance вместе
   с canonical decision table §4.5 и native CLI surface §4.6, сняв recorded help
   fixtures установленных `gh`/`glab`.
4. Обновить review response: секции §5.1, private handoff, потребителя handoff,
   bounded acknowledgement retry и caller projection.
5. Исправить standalone ownership, hot/fresh roles, titles и cleanup.
6. Добавить trust-safe delivery, guide locator §8.1, git-ignore probe §8.2 и
   single-owner posture.
7. Восстановить blocking wait cadence и typed waiter failure.
8. Зафиксировать explicit activation graph, description surface и narrow
   implicit exceptions.
9. Расширить model discovery/history и dynamic recommendation instructions.
10. Добавить setup-managed regression/invariant rule.
11. Расширить deterministic tests (включая table evaluator, recorded-surface
    fixtures `gh`/`glab`/`orca skills` и report-section fixtures),
    embedded/live skill evals по schema §13.1 и E2E contracts.
12. Воспроизвести Orca incidents, автономно создать/обновить Issues по
    подтверждённым root causes и закрыть обязательства §3.1.
13. Обновить knowledge, собрать generated skills, очистить backlog, пройти QC,
    final reviews и applicable E2E на одном SHA.

Каждый slice получает observable runtime/eval evidence, отличающее исполненную
норму от простого наличия текста. Coherent increments коммитятся отдельно. Ни
один slice нельзя исключить под видом минимального подмножества.

## 16. Rejected и unsupported

- reviewer subagents, clean verifier и review-quality eval — rejected;
- новый orchestration/report/Issue helper или registry в поставке — rejected;
  test-only table evaluator в `tests/`, не вызывающий hosting CLI и не входящий
  в `skills/`, — allowed;
- approval перед каждым техническим Issue — rejected;
- upstream Issue в project repository по fallback-remote — forbidden;
- автоматический reopen закрытого Issue — rejected, остаётся человеческой
  границей;
- вывод «дубликата нет» из усечённого или неудавшегося search — forbidden;
- классификация hosting по установленному CLI вместо host probe — forbidden;
- нормативная команда, флаг или JSON-поле, не подтверждённые `--help`
  установленной версии, — forbidden;
- вызов write-команды без body-флага, приводящий к editor или prompt, —
  forbidden;
- dummy external write ради E2E — rejected;
- mandatory colors — rejected;
- установка Orca guides в каждый harness home — rejected;
- Astra/Fable как default reviewer recommendation — rejected;
- terminal summary вместо authoritative report — rejected;
- `PASS` без grounding, scope/checks, Unknowns и residual risks — forbidden;
- `UNKNOWN` без account выполненной работы — forbidden;
- unconditional empty-backlog check во всяком mid-feature QC — rejected;
- локальный обход без Issue или без явного `unsupported` — forbidden;
- private provider transcripts или guessed CLI/model capabilities — forbidden;
- неограниченный повтор handoff-сообщения вместо `UNKNOWN` — forbidden;
- route без public trust/title/wait capability — unsupported, без тихого
  fallback.

## 17. Open questions

Продуктовых вопросов нет. Implementation обязана read-only evidence установить:

- public markers normal prompt для Claude/Codex/OpenCode против trust UI/shell
  для установленной Orca/harness версии и proof безопасного composed start;
- совместимость title/rename с `agentWait` и точный ordering;
- фактическую семантику `worker-release` для pane/tab в воспроизведённом incident;
- воспроизводимость §4.6 на версиях, отличных от `gh 2.100.0`/`glab 1.117.0`:
  при расхождении применяется ISS-15, а fixtures пересоздаются;
- существование публичного body-file пути для `glab issue note` в новых версиях,
  чтобы снять обход §3.1;
- читаемый публичный источник upstream ownership для Orca и других задетых
  инструментов, а также existing Issue для каждого подтверждённого root cause;
  при отсутствии такого источника соответствующая запись остаётся
  `needs_attention`;
- фактическую доступность желательных eval profiles на машине разработки;
- максимальный поддерживаемый host wait timeout для requested arms.

Если public-safe path не установлен, соответствующий route остаётся unsupported;
это не разрешает private evidence, invented fallback или пропуск обязательного
gate.

## 18. Decision Ledger

`U-*` — стабильные spec-local keys. Они разрешаются по exact decision text, а не
по runtime-generated UUID конкретного council workspace:

| Key  | Exact frozen decision                                                                                                                                                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-01 | Deliver only an approved specification in this work; implementation is separate.                                                                                                                                                                                                              |
| U-02 | Use docs/backlog.md as a temporary notebook for the active feature and require it to be empty at lifecycle start and completion; move confirmed out-of-scope defects and improvements to Issues.                                                                                              |
| U-03 | Use gh for GitHub and glab for GitLab; search for an existing Issue first, add the confirmed use case when root cause matches, otherwise create a new Issue, without an additional user approval.                                                                                             |
| U-04 | Keep the current two visible vendor-diverse reviewers; do not add reviewer subagents or a separate clean verifier.                                                                                                                                                                            |
| U-05 | Do not add eval experiments that measure code-review quality; do extend ordinary embedded and live skill evals that test instruction following and correct skill behavior.                                                                                                                    |
| U-06 | Each reviewer response begins with P0-P3 counts and one short sentence per finding, then includes the complete evidence report with expected remediation direction and depth.                                                                                                                 |
| U-07 | Deliver complete unchanged review reports to the executor; public orchestrator or standalone-caller updates may show only aggregate P0-P3 counts.                                                                                                                                             |
| U-08 | Investigate Remote terminal was closed and retained tabs during implementation and file or update an upstream Orca Issue when confirmed; do not encode the incident as permanent methodology.                                                                                                 |
| U-09 | Block task delivery while Claude Code is at a workspace trust prompt; mo-setup may offer a personal trust configuration change with explicit confirmation.                                                                                                                                    |
| U-10 | All mo-* skills activate only when explicitly named by the user or by a directly declared call from an active mo-* skill.                                                                                                                                                                     |
| U-11 | find-reuse, senior-jsts, and senior-python may activate implicitly within their scoped applicability.                                                                                                                                                                                         |
| U-12 | A confirmed reproducible defect gets a focused regression test; substantial non-obvious fixes get a durable invariant comment delivered through compact AGENTS.md and CLAUDE.md guidance.                                                                                                     |
| U-13 | Require both version-matched bundled Orca guides: orchestration for lifecycle and Dispatch, and orca-cli for terminal operations; per-harness-home installation is not required.                                                                                                              |
| U-14 | Recommend current powerful coding models for reviewers, currently codex/gpt-5.6-sol/high and claude/opus[1m]/high; do not recommend Astra/Fable-class models by default, but include them when the user asks to see all options.                                                              |
| U-15 | Base reviewer model recommendations on current provider catalogs, all readable model usage from the last month, and agent judgment rather than hard-coded permanent model ids; explicit user selection remains authoritative.                                                                 |
| U-16 | Use one blocking waiter per actor: executor arms up to 10 minutes, reviewer and E2E arms up to 5 minutes, including standalone review; relevant events may wake early and quiet timeout only re-arms without polling narration.                                                               |
| U-17 | Make codex/gpt-5.6-sol/low and claude/opus[1m]/low mandatory skill-eval profiles; additionally run codex/gpt-5.6-luna/max and OpenCode with qwen 3.8 27b through local llama.cpp when available on the development machine, and record this portability expectation in business requirements. |
| U-18 | Require mo-setup to verify that the project-owned Git ignore rules cover both .orca/ and spec/.                                                                                                                                                                                               |

| id   | Решение                                                                                                                                                                                                                                                                                    | Статус   | Основание / источник                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-01 | Доставить только spec, реализацию вынести отдельно                                                                                                                                                                                                                                         | adopted  | U-01                                                                                                                                                         |
| D-02 | Backlog — notebook активной фичи, пустой в начале и конце                                                                                                                                                                                                                                  | adopted  | U-02; `§B-LONGEVITY-04`                                                                                                                                      |
| D-03 | Долговечный sink — Issues через native `gh`/`glab` без отдельного approval                                                                                                                                                                                                                 | adopted  | U-03; новый `§B-HUMAN-04`                                                                                                                                    |
| D-04 | Ровно два видимых vendor-diverse reviewer, без subagents и clean verifier                                                                                                                                                                                                                  | adopted  | U-04; `§A-REVIEW-02` amended                                                                                                                                 |
| D-05 | Никаких eval, измеряющих качество code review; обычные evals расширяются                                                                                                                                                                                                                   | adopted  | U-05                                                                                                                                                         |
| D-06 | Leading P0–P3 census + одно предложение на finding, затем полный отчёт с глубиной исправления                                                                                                                                                                                              | adopted  | U-06; `§A-REVIEW-04`                                                                                                                                         |
| D-07 | Executor получает полные неизменённые reports; человеку — только counts                                                                                                                                                                                                                    | adopted  | U-07; `§A-RESPONSE-02`                                                                                                                                       |
| D-08 | `Remote terminal was closed`/retained tabs — investigation + upstream Issue, не методология                                                                                                                                                                                                | adopted  | U-08                                                                                                                                                         |
| D-09 | Trust prompt блокирует delivery; `mo-setup` предлагает личную настройку с подтверждением                                                                                                                                                                                                   | adopted  | U-09; `§B-PORTABILITY-06`                                                                                                                                    |
| D-10 | `mo-*` запускаются только явно                                                                                                                                                                                                                                                             | adopted  | U-10; frontmatter `description` + call graph                                                                                                                 |
| D-11 | `find-reuse`/`senior-jsts`/`senior-python` — implicit в узкой applicability                                                                                                                                                                                                                | adopted  | U-11                                                                                                                                                         |
| D-12 | Regression test + invariant comment через setup-managed project contract                                                                                                                                                                                                                   | adopted  | U-12; `§B-REVIEW-02`                                                                                                                                         |
| D-13 | Оба version-matched bundled guides обязательны, без установки в harness home                                                                                                                                                                                                               | adopted  | U-13; locator §8.1                                                                                                                                           |
| D-14 | Дефолтные reviewer-модели — современные powerful coding models; Astra/Fable по запросу                                                                                                                                                                                                     | adopted  | U-14                                                                                                                                                         |
| D-15 | Рекомендация строится из catalogs и 31-day history, без permanent hard-code                                                                                                                                                                                                                | adopted  | U-15                                                                                                                                                         |
| D-16 | Один blocking waiter на actor: 10 мин executor, 5 мин reviewers/E2E                                                                                                                                                                                                                        | adopted  | U-16; §9 run-wide realization                                                                                                                                |
| D-17 | Обязательные eval profiles `codex/gpt-5.6-sol/low` и `claude/opus[1m]/low`; желательные — Codex `luna/max` и OpenCode+`llama.cpp`                                                                                                                                                          | adopted  | U-17; §13                                                                                                                                                    |
| D-18 | Подход A (skills-first, без helper и state store)                                                                                                                                                                                                                                          | adopted  | §2a; `§A-ORCHESTRATION-01`                                                                                                                                   |
| D-19 | Тонкий helper-слой для Issue/report в поставке                                                                                                                                                                                                                                             | rejected | §2a, подход B; round 2 подтверждён: test-only evaluator в `tests/` поставкой не является, а любая исполняемая логика сверх таблицы переоткрывает это решение |
| D-20 | Внешний workflow engine/state store                                                                                                                                                                                                                                                        | rejected | §2a, подход C                                                                                                                                                |
| D-21 | Routing precedence, closed-issue семантика, dedup evidence и redaction как нормативные шаги, а не свободное рассуждение                                                                                                                                                                    | adopted  | Council R1 `ISSUE-WRITE-007`; `§A-ISSUE-01`                                                                                                                  |
| D-22 | Названный потребитель pair handoff, включая human-caller режим без автоочистки                                                                                                                                                                                                             | adopted  | Council R1: «standalone handoff не имеет consumer»; `§A-RESPONSE-03`                                                                                         |
| D-23 | Запрет dummy external writes сохранён; evidence разделён на read-only / fixture / real-defect уровни                                                                                                                                                                                       | adopted  | Council R1–R2; §14.1 называет субъект каждого уровня                                                                                                         |
| D-24 | Census как единственная авторизованная числовая caller-проекция, не governance-слой                                                                                                                                                                                                        | adopted  | U-07; §2.3, §5.3; R3 предложение ретранслировать index отклонено                                                                                             |
| D-25 | Асимметричный routing: `upstream_issue` только по explicit repository или verified ownership metadata, иначе `needs_attention`; project remotes — исключительно для `project_issue`                                                                                                        | adopted  | Council R2 `F7-issue-autonomy-without-identifier-and-upstream-duty`; §4.1                                                                                    |
| D-26 | Детерминированное доказательство Issue flow получает названный субъект: полная decision table §4.5 и test-only evaluator с границей «таблица — не поведение агента»                                                                                                                        | adopted  | Council R2–R3 `PROOF-BOUNDARY-008`; §14.1                                                                                                                    |
| D-27 | Bounded acknowledgement failure: ровно одна re-delivery, затем `UNKNOWN` с сохранённым namespace; retrieval/write/reread/truncation повтора не получают                                                                                                                                    | adopted  | Council R2–R3 `F3`; §6.2                                                                                                                                     |
| D-28 | Сырые human notes — pre-lifecycle intake; migration checkpoint предшествует empty-start lifecycle                                                                                                                                                                                          | adopted  | Council R3 `F5`; §3                                                                                                                                          |
| D-29 | Safe delivery универсальна; composed start разрешён только при public proof удержания task bytes до readiness                                                                                                                                                                              | adopted  | Council R3 `F4`; §8                                                                                                                                          |
| D-30 | Review grammar использует report-local keys и anchored markers; проверкой владеет `mo-review-orca` caller                                                                                                                                                                                  | adopted  | Council R3 `F8`; §5.2                                                                                                                                        |
| D-31 | Один caller-owned run-wide waiter покрывает active actor set; arm равен минимальной cadence ожидаемых классов                                                                                                                                                                              | adopted  | Council R3 `F1`/`WAIT-CONTRACT-010`; §9                                                                                                                      |
| D-32 | Живая spec хранит verbatim intake и AST-disposition BKL-00…18; исторический closure-map не переоткрывается                                                                                                                                                                                 | adopted  | Linked council `CLOSURE-REUSE-FICTION`; §3, §19                                                                                                              |
| D-33 | 31-day history scan bounded по времени/bytes, streaming и честно помечает partial result                                                                                                                                                                                                   | adopted  | Council R3 `F13`; §11                                                                                                                                        |
| D-34 | Eval evidence v3 расширяет v2 matrix tier/profile и имеет детерминированный completeness aggregate                                                                                                                                                                                         | adopted  | Council R3 `EVAL-MATRIX-005`; §13.1                                                                                                                          |
| D-35 | Literal call graph — один AST-раздел `## Meta-O calls` с exact inline-code callees либо `none`                                                                                                                                                                                             | adopted  | Council R3 `ACTIVATION-GRAPH-009`; §10.1                                                                                                                     |
| D-36 | Desired Qwen skill eval не заменяет отдельный critical orchestration outcome `§B-PORTABILITY-08`/B22                                                                                                                                                                                       | adopted  | Council R3 `F6`; §13.2                                                                                                                                       |
| D-37 | Нормативные таблицы обязаны быть AST-прямоугольными: альтернативы пишутся словами, `disposition_class` получает токен `either`, §4.5 и §5.3 переписаны, правило вынесено в §2.4                                                                                                            | adopted  | Council R4 `DECISION-TABLE-MALFORMED`, `ISSUE-TABLE-002`; §2.4, §4.5, §5.3, §14                                                                              |
| D-38 | Acceptance decision table покрывает ISS-01…ISS-15, включая truncation поиска и отсутствующую CLI capability                                                                                                                                                                                | adopted  | Council R4 `ISSUE-TABLE-002`, R5 `ISSUE-NATIVE-CLI-003`; §4.2, §4.5, §14                                                                                     |
| D-39 | Native CLI surface §4.6: точные команды `gh`/`glab`, explicit limits и pagination, body через file/stdin, host probe вместо догадки по CLI                                                                                                                                                 | adopted  | Council R4 `ISSUE-NATIVE-CLI-003`; §4.1, §4.6, §14.1                                                                                                         |
| D-40 | `UNKNOWN` сохраняет `Unknown-Account`; §5 объявлен additive к `review-protocol.md` и не отменяет grounding/scope/checks/Unknowns/residual risks                                                                                                                                            | adopted  | Council R4 (UNKNOWN account, protocol-body coverage); §5, §14                                                                                                |
| D-41 | Каждый новый/изменённый `§A-*` получает названный owning file в §2.2, и slice 2 создаёт ровно эти файлы                                                                                                                                                                                    | adopted  | Council R4 `ADR-FILE-ASSIGNMENT-MISSING`; §2.2, §15                                                                                                          |
| D-42 | Exact-handle cleanup поверх `no_owned_resource` и текстовый `Review-Handoff-Ack` внесены в таблицу обходов §3.1 с их обязательствами                                                                                                                                                       | adopted  | Council R4 (§3.1 completeness); §3.1, §6.1, §7                                                                                                               |
| D-43 | Ответ reviewer состоит из именованных секций; пустота `PASS` относится только к finding index и `Findings`, а grounding/scope/checks/Unknowns/residual risks обязательны всегда                                                                                                            | adopted  | Council R5 `PASS-EMPTY-BODY-VS-EVIDENCE`; §5.1, §5.3, §14, B34                                                                                               |
| D-44 | Единый version-matched locator bundled guides — `orca skills list --json` и `orca skills get <topic>` из одного resolved `orca` binary, без установки в harness home                                                                                                                       | adopted  | Council R5 `GUIDE-LOCATOR-MISSING`; §8.1, B26                                                                                                                |
| D-45 | Нормативная CLI поверхность снимается с установленных версий (`gh 2.100.0`, `glab 1.117.0`): нет `--state all` в `gh search issues`, нет `stateReason` там же, нет `--state` у `glab issue list`, GitLab note публикуется через `glab api --input`, write-команда без body-флага запрещена | adopted  | Council R5 `ISSUE-NATIVE-CLI-003`; §2.5, §4.6, §3.1, ISS-15                                                                                                  |
| D-46 | `mo-setup` проверяет project-owned ignore coverage для `.orca/` и `spec/`, а отсутствие любого правила оформляет как setup gap                                                                                                                                                             | adopted  | U-18; §8.2, B35                                                                                                                                              |

## 19. Verbatim source ledger

Ниже дословно сохранён текст пользовательского intake после canonical
`## Открыто`; единственная нормализация — завершающий EOF newline. Полные
исходные bytes проверяются SHA-256 из §3. Ledger нормативен только как источник
BKL-00…BKL-18; решения зафиксированы в §3 и §18.

<!-- prettier-ignore-start -->
<!-- verbatim-backlog-start -->

Прежде всего скажу: текущая версия получилась прям годной! Минимум пинков приходится делать.
То что ниже конечно надо поправить но главное качество не уронить. Думаю эвалы наши пошли на пользу.


### Ревью и сабагенты

> а почему ты написал что ревью без сабагентов?
> 
> Потому что в брифе был прямой запрет: «Do NOT start another reviewer or subagent»

Пожалуй если это полезно можно разрешить или даже потребовать чтобы ревьюеры а/б первое ревью (с момента их запуска) делали с сабагентами (но ограничить их количество - не больше 8), а уже повторные ревью/проверки исправления в той же сессии - без сабагентов
Надо это или нет - под вопросом, надо подумать. Возможно сосредоточенные на определенных вопросах сабагенты будут лучше работать - это не точно. Надо свериться с deep-research которые входили в эту спеку (или я их куда-то подкладывал, скажи если не найдешь)


### Куда ревьюеры сохраняют отчеты

Вижу что вот такое в исполнителе-оркестраторе cat /tmp/mo-review/reportB.md
Или это оркестратор (а точнее исполнитель где я для краткости запустил скилл ревь) туда сохранил - не очень уникальное имя, вот что меня беспокоит. Надо бы как-то поуникальнее, но без фанатизма


### Названия вкладок

Вроде в прошлом беклоге я просил чтобы оркестратор переименовывал вкладки в соответствии с ролями.
Сейчас я попробовал скилл ревью чисто для небольшой работы прямо из исполнителя - вкладки не переименовывались.
Те эта штука если реализована должна быть правильно разложена между скилом оркестрации и скилом ревью чтобы даже скилл ревью запущенный отдельно переименовывал своих ревьюеров.


## Когда оркестратор/исполнитель закрывает терминалы ревьюера

Вижу вот такую ошибку на месте закрытой вкладки. Надо бы разобраться откуда это и что делать чтобы вкладки закрывались полностью.
Remote terminal was closed.
If this persists, please file an issue.

А иногда он их не закрывает...


## Issues/backlog

Всё больше прихожу к мнению что надо реальные ошибки найденные в проекте писать в github/gitlab issues, а беклог оставить агенту для "записулек" и требовать/добиваться чтобы он был пустым и в начале и в конце работы над спекой

## Нужно чтобы оркестратор и/или исполнитель вызывающий ревьюеров при быстром фиксе знали как с этим работать правильно

```
Accessing workspace:

 /mnt/SMALL/Bitrix/traces

 Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source
 project, or work from your team). If not, take a moment to review what's in this folder first.

 Claude Code'll be able to read, edit, and execute files here.

 Security guide

 ❯ No, exit
   Yes, I trust this folder

 Enter to confirm · Esc to cancel
 ```


 ## Когда ревьюеры заявляют ошибку - пусть говорят ожидаемую глубину/способ исправления

Часто вижу кейсы когда ревью вернуло замечания, исполнитель исправил а ревью повторное говорит что фигово/неглубоко исправили или просто спустил проблему на уровень ниже но не исправил.

Надо проверить/поправить что мы требуем от рвьюеров. По идее не просто замечания надо но и ожидаемый/предлагаемый способ их исправления. Иначе мы долго топчемся на месте с ревью/исправлениями.

## Скилл ревью - только явно

Заметил что пару раз агент у которого был доступ к скилу ревью считал его подхоящим и без моего указания запускал. так не надо.
Скилл ревью должен запускать либо тот кто прочитал скилл оркестрации либо я сам вручную

Вероятно то же применимо и к другим местным скилам (кроме senior) - если будут сомнения задавай вопросы и разберем каждый скилл отдельно


## Пару раз видел проблему с вызовом кодекса

• Проблема была двухчастная; для backlog её лучше разделить на основной Orca defect и fallback/documentation defect.

  1. Основной defect — composed Codex launch доставляет task слишком рано или не туда.

  - Команда: orca orchestration worker-start ... --worktree current --agent codex --model gpt-5.6-sol --effort high.
  - Orca успешно создал terminal и подтвердил launch.requested == launch.effective.
  - Затем дважды подряд завершил Dispatch на стадии dispatch_input с agent_prompt_stalled.
  - В worker-show было видно, что полный текст review-задачи попал не в Codex TUI, а исполнился оболочкой zsh; итог: zsh: parse error near
    ')'.

  - Первый Dispatch: ctx_d169698714b8, replacement через --retry-of: ctx_ee51b716d2df.
  - Оба раза product review не начался.
  - Orca app: 1.4.195, runtime 2282f168-770a-48a7-931d-4f838740816f.

  Ожидаемое поведение: worker-start должен дождаться распознанного Codex TUI, доставить task внутрь него и вернуть input_accepted; при
  невозможности — не отправлять task в shell.

  2. Fallback/documentation defect — неясное владение unsandboxed-флагом.

  - По fallback-рецепту был создан terminal с явным --dangerously-bypass-approvals-and-sandbox.
  - Orca launcher сам уже добавил этот флаг, поэтому Codex завершился с cannot be used multiple times.
  - После удаления явного флага тот же fallback успешно запустился, tui-idle подтвердился, а dispatch --inject доставил задачу.

  Ожидаемое улучшение skill-а: fallback-рецепт должен явно говорить, как определить, что wrapper уже добавляет posture flags, либо давать
  команду без их дублирования для Orca-managed terminal.


## Странное поведение при ревью из исполнителя

Я из исполнителя запустил скилл ревью и 1 раз из кучи таких запусков поймал проблему
Причем это была первая итерация ревью из 5 которые я разрешил исполнителю запускать

```
› а это ты закрыл claude-ревьюера?
  если да то почему (кодекс-ревьюер висит живой)
  в любом случае я бы попросил тебя его восстановить (resume) когда дойдешь до повторного ревью чтобы в горячем контекте проверять
  исправления


• Да, Claude я закрыл через worker-release сразу после его worker_done: так требует $mo-review-orca перед изменением кандидата, а Orca
  сохранил transcript archive. Codex тоже уже завершил отчёт; живым остался только его fallback-терминал, потому что low-level dispatch не
  числится owned resource и worker-release вернул no_owned_resource.
```


## Названия вкладок

В прошлом беклоге вроде бы было требование чтобы оркестратор переименовывал вкладки (а по-хорошему еще и цвета им назначал). Но что-то я не наблюдаю чтобы это было реализовано


## Когда из испольнителя вызвал скилл ревью

• Fallback обнаружил launch-wrapper Orca: он уже добавляет unsandboxed posture, поэтому переданные мной -s/-a конфликтовали с wrapper и
  Codex сразу завершился. Закрываю только созданный мной неуспешный terminal и повторяю fallback без дублирования posture-флагов.


Я уверен что мы уже это исправляли
Напоминаю - клод и кодекс уже должны быть обернуты для запуска без песочниц, наш setup-skill об этом должен заботиться

## Внезапно после десяктков успешных использований ревью-скила из исполнителя (короткие задачи) кодекс стал тупить

Вместо того чтобы получить ревью и пойти исправлять - исполнитель стал мне длинное полотно с найденными замечаниями показывать.
Кажется он невнимательно стал читать скилл, хотя сам скилл не менялся.
В любом случае если уж я попросил этот скилл его прочитать (через $mo-reivew-orca) то он должен его полностью прочитать а не выпендриваться

Мне бы хватило сводки сколько p1/p2/p3 каждый из ревьюеров нашел (регрессии же туда же включаются?)


## Внезапно исполнитель со скилом ревью открыл еще 1 вкладку клода

так, а объясни почему у тебя открыто 2 вкладки клода и 1 кодекса
    ты решил еще 1 клода открыть чтобы он исправлял?

```
• Да. Это три разные изолированные роли:

  - Claude marta-guard-candidates:executor — единственный, кто исправляет код и делает коммиты.
  - Claude marta-guard-candidates:review:claude — только независимое ревью, код не меняет.
  - Codex marta-guard-candidates:review:codex — второе независимое ревью, код не меняет.

  Один и тот же Claude-сеанс нельзя безопасно использовать одновременно как executor и reviewer: reviewer не должен проверять собственные
  изменения и получать чужой review-контекст. Сейчас executor уже закончил первый fix-коммит и оставлен hot; два reviewer выполняют
  follow_up. Лишних ролей или вкладок нет.
```

Но так не надо было делать. Это же скилл ревью а не оркестрации.


## Систематически вижу что claude все равно пытается во вкладке ревьюера писать резюме а кодекс - нет

кодекс
```
• The review has now falsified several core guarantees with isolated read-only probes: partial-consumption helpers crash without a report,
  default buffer limits can terminate large fast plans, malformed advisory totals are not ignored, and malformed batch correlation is
  accepted. I’m finalizing the evidence-backed report now; the repository remains at the exact candidate SHA with a clean status.

• Ran report=$(cat <<'EOF'
  │ Executive summary: I independently reviewed candidate 8d95823c7879901f9d89f85fd7a123296dee071b against the canonical batched-keyset
  │ restoration specification and the complete deep-review scope, without modifying the repository. The implementation has two P1
  │ … +252 lines
  └ Sent msg_b53722db8acf
```

клод
```
⏺ Review complete and reported (worker_done sent once, outcome succeeded, full report in the body plus --report-path).

  Verdict: FINDINGS on 8d95823c7879901f9d89f85fd7a123296dee071b (deep mode requested and effective; HEAD matched exactly, worktree clean at
  start and end; no repository file created, edited, or deleted).

  P1 — Fast keyset streams raise ValueError: unique_rows cannot exceed emitted_rows and leave report is None on any early close that isn't
  chunk-aligned. OrderedAdmissionState counts unique_rows at admission while emitted_rows counts at delivery, and KernelReport enforces
  unique_rows <= emitted_rows. Reproduced on a healthy transport at n=1, 2, 7 (n=5 passes only because it lands on the page cap — which is
  why none of the 28 committed tests hit it). The baseline sequential path on the identical input returns early_closed with a report, so
  causality is the candidate.

  P2 ×5 — unbounded per-identity + per-row SHA-256 retention where the baseline keyset path deliberately uses an O(1) monotonic store; the
  spec-mandated behavior-neutral extraction never happened, leaving a second parallel traversal implementation (driver.py et al.
  untouched); the "single scheduler" is split into a 387-line self: Any mixin past its allowlisted ceiling with a runtime scheduler→stream
  import; confirmed zero coverage of finalize, SHORT_PAGE_EXHAUSTS, advisory totals, two of four closure witnesses and the trace quotas,
  plus single-cell live admission; and a dead, exported, value-zeroing report builder that is the one the spec names as normative.

  P3 ×5 — wrong preselection_reason for explicit partitioned on overlapping boundaries; a tested: marker naming a nonexistent test (recipes
  markers aren't validated); descending lanes missing LATTICE_FULL; undeclared public raw_rows field; dead branches in _admit_tail.

  Two process notes worth flagging: my first call-path probe rebound keyset_auto module attributes the scheduler had already imported by
  name, which produced two invalid zero-counts — I reran it against the scheduler's own bindings, and the corrected run is what the report
  cites. I also refuted three candidate findings during verification rather than reporting them (the apparent double release_page is safe
  because release_page is idempotent; canaries do catch the simple empty-descending-page case). The one path I could not ground — an
  unguarded min() on an empty descending boundary page — is recorded under Unknowns, not as a finding.
```

я бы сказал что и то и то не очень
нужно по 1 предложению (короткому) на каждую найденную проблему писать чтобы я визуально мог понимать много осталось ошибок или нет


## А наши orca-скилы точно знают про необходимость проверять Orchestration skill?

Когда я делал скилы завязанные на orca я хотел чтобы мы из самой orca использовали ряд скилов которые нам полезны. Чтобы ставили их as is а в наших скилах уже говорили мол "вот тебе shorthands для типовых операций, а эти вот скилы прочитай когда нужно будет больше про orca узнать"

Ну и я думал что это (наличие нужных orca-скилов у нас проверяется для claude/codex/opencode - смотря что установлено). А по факту кажется нет


## Еще 1 пример неправильного управления ревьюерами

> а зачем ты кодекс-ревьюера закрыл?

```
• Это была моя ошибка в управлении ресурсами: я применил общее правило «после worker_done освободи воркер», хотя при FINDINGS по mo-review-
  orca ревьюера надо держать горячим для follow-up на его собственные замечания. Вернуть именно ту сессию уже нельзя; её отчёт сохранён
  Orca, поэтому итерацию 13 Codex начнёт свежим, но получит только свой полный предыдущий отчёт. Дальше при FINDINGS закрывать ревьюеров до
  remediation не буду. Сейчас продолжаю ждать Claude по итерации 12.
```


## Найденные ревьюерами проблемы должны оставаться "в памяти"

Если ревьюеры долго пытхтели и нашли баги нам нужно
- сначала воспроизвести их тестом
- в описании теста объяснить суть проблемы (коротко)
- в местах исправления (где переписываем/дописываем много кода) оставить коммент "почему теперь логика такая"

При этом исправляет исполнитель, а значит оркестратор должен ему этот принцип донести в задании
<!-- verbatim-backlog-end -->
<!-- prettier-ignore-end -->
