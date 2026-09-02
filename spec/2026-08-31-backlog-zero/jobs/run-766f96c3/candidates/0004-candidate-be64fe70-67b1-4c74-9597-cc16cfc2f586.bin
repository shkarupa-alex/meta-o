Я прочитал репозиторий, оба источника backlog, контрактные документы, тесты, ESLint-конфиг и проверил Git-объекты и команды эмпирически. Ниже — разбор по требуемым перспективам. Замечу сразу: спека сильная по инженерной культуре (fail-closed, закрытый набор dispositions, отказ от вечного registry, Git-anchored provenance), но её центральное обещание — lossless inventory — эмпирически не выполняется, а Definition of Done в текущем виде недостижим.

## Facts & Constraints (White Hat)

Что подтвердилось как верное:

- **Git-якоря точны.** `41a4898…` и `2eb85be…` существуют; blob `8d11d110…` = `docs/backlog.md`, `c7585937…` = `docs/backlog-issues-real-runs.md` — совпадают побайтово с рабочей копией. Это редкая для спек аккуратность.
- **§4.7 шаг 6 попал точно.** `tests/backend-transition.test.mjs:199` действительно содержит `assert.ok(entries.length > 0, "backlog must contain at least one real deferral")`.
- **«documentation carry-forward» не размыт**, как мне сначала показалось: это существующий `methodology.md §8` с жёсткими условиями. Снимаю это как претензию.
- **§A-QUALITY-01 существует** и корректно заякорен; висячих ссылок нет.

Что оказалось фактически неверным или уже сделанным:

- **§4.2 выдаёт уже существующее за новую работу.** `eslint-plugin-jsdoc@64.2.1` уже установлен и сконфигурирован в `eslint.config.mjs` с `jsdoc/require-jsdoc` (`publicOnly`, `FunctionDeclaration`, `ClassDeclaration`) на уровне `error`, и `eslint .` уже входит в `mo-lint`. Реальный незакрытый разрыв — не «требовать JSDoc», а **требовать `§A-*` внутри description**. `require-jsdoc` этого не умеет в принципе. Механизм существует — `jsdoc/match-description` (я проверил: правило есть в установленной версии) — но спека его не называет, не даёт regex, не указывает `contexts`. Исполнитель либо решит, что всё готово, либо напишет свой чекер, что контракт запрещает.
- **§4.3/§4.5 не реализуемы на текущей AST-библиотеке.** Проект использует `markdown-it` (`tests/knowledge-chain.test.mjs`, `tests/backend-transition.test.mjs`). Я проверил напрямую: у inline-детей `map === null` — **позиций у текстовых узлов нет**, и token stream `markdown-it` принципиально не сериализуется обратно в Markdown без потерь. Контракт `stripArchitectureAnchor(node: TextNode) → { start, end }` и локатор «AST node ordinal» с байтовой гарантией требуют либо `remark`/`mdast` с позициями, либо offset-схемы поверх AST-детекции. Спека не называет библиотеку и не признаёт проблему — исполнителю придётся принять новое архитектурное решение.
- **Локальная модель: бюджет контекста не задан.** RTX 4090 — 24 GB; 27–30B в Q4_K_M ≈ 16–18 GB весов, остаток — KV-cache. При этом реестр фиксирует усечения диагностики Orca на **21k и 41k токенов** (строки 9, 15). §3.9 требует, чтобы Qwen довёл фичу до verified SHA, но не задаёт ни минимального контекстного окна, ни стратегии деградации, хотя `compacted` присутствует в §3.4 как lifecycle-состояние.
- **Идентификатор модели выглядит искажённым диктовкой.** «Qwen 3.8 27B UD-Q4-KM» — такой линейки не существует (реальны Qwen3 30B-A3B / 32B, квант `UD-Q4_K_M`). Frozen decision фиксирует формулировку пользователя, и это законно, но §3.9 превращает её в **жёсткий блокирующий gate**, тогда как §2.12 прямо говорит: «Конкретный выбор моделей остаётся user-approved runtime configuration, а не постоянной spec-константой». Это внутреннее противоречие.

## Risks & Failure Modes (Black Hat)

**1. Provenance живёт на одной непушнутой локальной ветке (критично).** Я проверил достижимость: `41a4898` достижим **только** из `refs/heads/feature/orca-only`. Ветка не запушена (`remotes/origin/feature/orca-only` отсутствует), тега нет, и коммит **не является предком `develop`**. Последствия: squash-merge, rebase или удаление ветки делают оба закреплённых blob недостижимыми и подлежащими GC. Тогда `tests/backlog-closure.test.mjs` (§4.5 читает именно эти blob как source of truth) падает необратимо, а §4.4 ломается иначе — обход «cutoff→HEAD по merge DAG» неопределён, если cutoff перестал быть предком HEAD. Спека не требует ни push, ни annotated tag, ни запрета squash/rebase.

**2. Lossless inventory теряет 33 инцидента и целый пласт «не-Orca» (критично).** Appendix A — механический перенос 52 заголовков H3/H4. Реестр содержит **305 буллетов**, и весь блок `## 2026-08-24 — Marta Eval task 730873` (строки 5–37) не покрыт ни одной строкой. Утрачены целые семейства, для которых **ни одна из четырёх спек не имеет scope**:

- ownership материализации спеки/BRIEF из внешнего сервиса (стр. 10, 13) — включая прямое указание пользователя о порядке «feature-ветка → BRIEF под Git → путь исполнителю»;
- внешний spec-сервис `aidd-spec` и `agent-browser` без корпоративной авторизации (стр. 8, 9);
- лимиты усечения вывода (стр. 6, 9, 15) — прямо угрожающие §3.9;
- worktree binding: `orca worktree create` вернул `ok: true`, но ветка и checkout не созданы (стр. 7, 11, 12, 14);
- readiness/auth трёх harness (стр. 16–20); семантика initial `/goal` (стр. 37); `waiter_exists` без публичного handle (стр. 32).

Спека защищается тем, что Appendix A — «coarse map», а строгую биекцию построит §4.5. Но это защищает **проверку**, а не **декомпозицию**: границы четырёх спек спроектированы на неполном входе, поэтому биекция найдёт строки без владельца и потребует внепланового расширения scope.

**3. Требования к собственным компонентам Meta-O не покрыты ни одной строкой.** Реестр формулирует дефекты `mo-watchdog` (стр. 59: `action=nudge` при `delivered_at: null`, а mode-0600 digest затем подавит повтор, которого worker не видел; стр. 62: `unclassified` не даёт порога для nudge), `scripts/mo-models.mjs` (стр. 34, 61) и discoverability `mo-orchestrate-orca/SKILL.md` (стр. 35). §3.8 частично закрывает первый пункт формулировкой «различает `queued` и delivered nudge», остальное — нет.

**4. §3.7 закрепляет решение, которое реестр объявляет ненадёжным.** Ladder шаг 2 — «public account/provider status, включая quota/reset time». Реестр (стр. 592–597) действительно рекомендует `orca account list --json`, но стр. 22 фиксирует, что этот же surface **возвращает stale cached `missing-credentials` с прежним `updatedAt` после успешной авторизации**: «Readiness нельзя решать по этому stale rate-limit cache». Спека взяла рекомендацию без известного ограничения.

**5. Программа ломает `mo-qc` и никто этого не владеет.** `tests/orchestration-contract.test.mjs:55` содержит `assert.match(source, /read all of \`docs\/backlog\.md\`/)`, а `shared/references/review-protocol.md` имеет секцию **`## Backlog lens`**, обязывающую ревьюера прочитать весь backlog. Spec 4 опустошает backlog, Spec 1 переписывает `review-protocol.md` — но ни одна спека не упоминает ни Backlog lens, ни эту ассерцию. Дополнительно `docs/acceptance.md` содержит строки «Reviewers проверяют фичу и backlog» и «Backlog разобран полностью → Финальные reviewers проверяют все строки», которые становятся ложными; §4.5 говорит лишь, что acceptance сохранит provenance, но не требует их пересмотра.

**6. `senior-python`/`senior-jsts` и `docs/research/` не в Git.** `git status` показывает их как `??`. При этом `tests/build-skills.test.mjs` содержит `assert.deepEqual(directories(SOURCES), EXPECTED)`, где `EXPECTED` — 6 имён без `senior-*`, а фактических директорий 8. Регистрация в build/install-списках, README-таблице и frontmatter-гейте `§A-DISTRIBUTION-06` — обязательная работа, но frozen decision [senior-skills] прочитан спекой как «работы нет вовсе»: §1.2 называет их «conditional lenses» и не назначает владельца интеграции. То же для добавления `find-reuse` в те же списки — §1.10 требует лишь **отсутствия** `mo-reuse`. Итог: DoD §4.8 «`make mo-qc` проходит» недостижим по спеке. Отдельно: research-документы, которые Appendix A объявляет сохранённой decision surface, **не имеют Git-якоря вообще**, хотя §1 закрепляет provenance «по Git».

**7. `find-reuse` остаётся сиротой, и теряется security-требование (критично).** §1.1 прямо делегирует Meta-O-интеграцию в spec 2 — а spec 2 **ни разу не упоминает `find-reuse`**: ни в §2.2 (Components), ни в §2.3, ни в Appendix A. Никто не вызывает skill и не определяет destination отчёта. Хуже: действующий `src/skills/mo-reuse/SKILL.md` владеет обязанностями далеко за пределами reuse-research — дословная запись business framing, создание spec с `## User intents (verbatim)`, spec-only commit, правило «оркестратор предлагает один раз», детект layout `docs/business.md` vs `docs/business/index.md` и **обязательная редактура секретов** (`[REDACTED: deployment token]`, остановка с `needs_attention` при сомнении). §2.4 покрывает business-harvest частично; **редактура секретов не упомянута ни в одной из четырёх спек**. Удаление `mo-reuse` без назначенного владельца — потеря security-контроля над дословным пользовательским вводом, который коммитится и пушится.

**8. §4.5 биекция неудовлетворима на реальных данных.** Требуется «каждый source node → ровно одна map row», включая каждый paragraph и list item после `## Открыто`. Но `docs/backlog.md` содержит вставленный сырой транскрипт с репликами вида «а я вроде не закреплял нигде 4.8» и «› а почему у тебя 2 клода запущены для ревью?». Каждому такому узлу нужен disposition из закрытого набора §4.6 — `implemented | merged-duplicate | architecture-rejected | upstream-fixed | public-workaround-proven`. Ни один не описывает «реплика без обязательства», а §4.6 прямо запрещает закрывать строку через `documented` или `not-blocking`. Набор нужно расширить явным `no-obligation` с критерием, иначе гейт заставит фабриковать ложные dispositions.

**9. Hot reviewers противоречат действующему контракту, и это не зафиксировано.** `methodology.md §5` и `review-protocol.md` требуют: «A new SHA requires two new independent reviews», «review that new SHA with two **fresh** independent reviews». §2.6 требует, чтобы reviewer «остаётся горячим до settlement всей feature», а §2.10 делает переиспользование hot sessions приёмочным критерием. Ревьюер, уже вынесший findings по SHA-1, не независим при оценке SHA-2 — это якорение на собственных выводах. Спека не обсуждает размен, не объявляет соответствующий текст замещённым, не даёт теста «hot reviewer не штампует собственный прежний вердикт», и в Decision ledger этой смены контракта нет.

**10. Severity-gating тоже меняет контракт молча.** `review-protocol.md` требует «use judgment rather than finding identifiers, **adjudication grammars** or numeric review-round caps». §2.7 вводит «P0–P2 блокируют settlement» — это и есть adjudication grammar. Пожелание пользователя о разбивке по критичности легитимно, но замещение существующей нормы должно быть объявлено. Параллельно спека отвергает numeric caps, ссылаясь на business contract, — но реестр (стр. 123) фиксирует пользовательский контракт «максимум пять циклов review/fix на один substantive slice». Это про продвижение по slice, а не про settlement; §2.11 смешивает их и отбрасывает без разбора.

**11. Корректность adapter-команд не гейтится нигде.** §1.10: фикстуры выполняют argv «against fake/local endpoints», live-probes «не входят в `mo-qc`» и опциональны. Фейковый endpoint проверяет форму argv, но не существование подкоманды. Между тем `dotnet package search` требует .NET 9+, `cargo info` — Cargo ≥1.82, а `python -m pip index versions` — **экспериментальная** команда pip, печатающая warning и не гарантированная к сохранению. Строка рисков обещает митигацию «executable fixture/live probe + `last_verified`», но единственную действенную половину спека делает опциональной.

**12. Scope финального gate не определён.** §2.6 допускает `scope: branch|feature|project`; §2.7/§2.9 требуют финальный gate на deletion-SHA. Если scope = feature, ревьюеры вправе поднять новые findings на каждом витке → цикл не сходится по построению. Если scope = diff-only, два `PASS` на финальном SHA не аттестуют фичу, что подрывает §B-PROOF. Исполнитель обязан выбрать — то есть принять архитектурное решение.

## Strengths & Benefits (Yellow Hat)

Это не слабая работа, и перечисленное ниже — реальные достоинства, а не вежливость.

- **Git как source of truth вместо копии ledger** — правильный ход: устраняет класс «переписали постановку, чтобы сойтись с реализацией», и хеши проверяются за секунду.
- **Закрытый набор dispositions с явным запретом `reported-upstream`/`documented`/`not-reproduced`** — точная защита от главного способа «обнулить» backlog декларативно. Формулировка «upstream issue означает только provenance» бьёт ровно в цель.
- **Временная биекция вместо постоянного registry** — уважает named-consumer rule и не создаёт вечный state layer; требование удалить артефакты в финальном DoD замыкает петлю.
- **Разделение discovery / falsification / causality / severity** в §1.9 и явное «zero findings — валидный PASS» — прямой ответ на false-positive-инфляцию, и `Why introduced` как обязательное поле делает causality проверяемой, а не декларативной.
- **Confidence как диагностика после evidence, а не порог публикации** — верная критика референсного плагина с его «findings ≥80».
- **Отказ от 2×2 ensemble до differential eval** — интеллектуально честно: гипотеза названа гипотезой, а не архитектурным фактом. Именно этого требовала постановка.
- **Fail-closed по умолчанию** — `unknown` при malformed данных, `build` запрещён без проверенного source, `unknown_effect` без автоповтора, запрет вывода из terminal preview.
- **§4.4 с явным cutoff и требованием «доказать green на реальной истории до включения в `mo-qc`»** — правильная последовательность активации гейта.
- **Отказ от Meta-O proxy над Orca и от private transcripts** — последовательное следование §A-ORCHESTRATION-01 и §A-RESPONSE-01.
- **`allowed-tools`/frontmatter-дисциплина и argv-массивы вместо shell-строк** в §1.5 — устраняет инъекции через произвольный `query` по построению.

## Alternatives & Creative Ideas (Green Hat)

- **Закрепить provenance тегом.** `git tag -a program-base-2026-09` на `41a4898` + push, и записать имя тега в спеку рядом с SHA. Стоимость — одна команда, устраняет риск №1 целиком. Дополнительно: `git notes` или просто требование «merge без squash».
- **Применить `find-reuse` к вопросу shell-линтера.** §4.2 объявляет «зрелого parser/linter для `.sh` нет» как данность, а §4.10 требует доказательства отсутствия зрелого инструмента. Программа буквально поставляет skill для такого доказательства — пусть его отчёт и станет artifact, обосновывающим `architecture-rejected`. Это заодно даёт `find-reuse` первого именованного внутреннего потребителя.
- **Расширить §4.6 значением `no-obligation`** с жёстким критерием (узел не содержит нормативного ожидания и не является уникальным свидетельством) и обязательной ссылкой на канонический узел, который контекст поясняет. Без этого биекция вынудит лгать.
- **Заменить «Backlog lens» на «Deferral lens».** Секция не должна умереть вместе с backlog: ревьюер по-прежнему обязан проверять, что новое отложенное оформлено полной записью. Это сохраняет `tests/orchestration-contract.test.mjs` осмысленным после правки строки-ассерции.
- **Ввести `context_budget` в профиль §3.9** — минимальное окно, поведение при исчерпании и требование, чтобы диагностические вызовы Orca шли отфильтрованными (`--json` + проекция полей), напрямую отвечая на инциденты 21k/41k.
- **Один «live smoke» для adapters в отдельной команде** (не в `mo-qc`, чтобы сохранить offline-детерминизм), но **обязательный перед изменением `last_verified`**. Это делает митигацию риска реальной, не меняя посылку об offline-гейте.
- **Для hot reviewers — контролируемый компромисс:** горячая сессия сохраняется для remediation-раундов, но **финальный same-SHA gate выполняется свежими сессиями**. Это примиряет экономию с «two fresh independent reviews» и даёт проверяемый критерий.

## Completeness & Process (Blue Hat)

Отсутствуют как разделы или обязанности: владелец интеграции `find-reuse` в методологию; владелец редактуры секретов в дословном ledger; владелец регистрации `senior-*` и `find-reuse` в build/install/README; судьба `## Backlog lens` и трёх строк `docs/acceptance.md`; коммит `docs/research/`; правило сохранности Git-объектов. Пункт 1 постановки («lossless inventory каждого уникального инцидента») выполнен на уровне заголовков, а не инцидентов.

### Traceability

Decision ledger присутствует, структурирован и в основном честен. Проверка каждой adopted-строки против тела: «Четыре specs» ✓ §2; «Только Orca» ✓ §1, §3.1; «find-reuse portable» ✓ §1.1–1.8, **но парная половина «invocation/destination external» не материализована — spec 2 её не содержит**; «Existing senior-*» ✓ §1.2 (без интеграции); «Durable behavior → business» ✓ §3 общего протокола, §2.4; «Qwen orchestration» ✓ §3.9; «Evals embedded» ✓ §4 общего протокола; «Все P3 доходят executor» ✓ §2.7; «Два final PASS» ✓ §2.7; «Upstream issue — provenance» ✓ §3.2, §4.6; «Temporary AST bijection» ✓ §4.5. Rejected-строки все находят соответствие в §1.11/§2.11/§3.11/§4.10.

Пробелы ledger: **не зафиксированы как решения** (а) переход от «fresh reviews per SHA» к hot-сессиям, (б) введение severity-gating поверх нормы «no adjudication grammars», (в) отклонение пользовательского «бюджета пяти review/fix на slice» из реестра. Все три меняют действующий контракт и должны быть в Adopted/Rejected явно.

### Decomposition Readiness

Спеки 1 и 3 нарезаются хорошо: §1.5–1.6 дают по-адаптерную нарезку, §3.10 — по-семейственную. Не готовы к нарезке без принятия новых архитектурных решений: **§4.3/§4.5** (выбор Markdown-библиотеки и схемы позиций — решение уровня зависимости проекта); **§4.2** (какое правило и какой regex обеспечивают `§A-*` в description); **§2.6/§2.7** (scope финального gate); **§2.5** (механизм clean-room subagent описан только как «может запустить»); **§3.9** (что именно означает «representative feature» и каков контекстный бюджет).

### Weak-Model Executability

Хорошо исполнимы: §1.3/§1.4 (frontmatter + перечень обязательных секций), §1.5 (полная TS-структура), §1.6 (конкретные argv), §1.8 (типы identity и правила слияния), §3.4 (`RequiredObservation`), §4.4 (точный формат trailer). Слабый исполнитель споткнётся на: «`stripArchitectureAnchor`… нормализует только непосредственно соседний separator/whitespace» — «непосредственно соседний» не определён для случаев `(§A-X-01)`, `§A-X-01.` в конце предложения, внутри inline code или ссылки; «значимые exported/public symbols» и «trivial/private callback helpers» — критерий не задан, хотя `publicOnly` уже отвечает на это в конфиге; «допустимый documentation carry-forward» — здесь исполнителю нужна явная ссылка на `methodology.md §8`, иначе он её не найдёт; «bounded private input» как `intent_source` — не описан ни формат, ни границы.

### Contract Completeness

Схемы `AdapterDescriptor`, `CandidateIdentity`, `RequiredObservation`, request/report frontmatter и формат finding — специфицированы на уровне, пригодном для реализации. Не хватает: числовых порогов и лимитов почти везде (rate-limit backoff, таймауты probe, максимум кандидатов, «bounded timeout» в §3.5 задан только как «5–10 minute window» для перепроверки, но не для самого wait); ошибочных ветвей для `find-reuse` при частичном отказе enrichment (есть `unknown` как статус, нет правила, когда частичный enrichment делает finalist невалидным); версионных предусловий для CLI (`.NET 9+`, `Cargo 1.82+`, экспериментальность `pip index`); контрактных ожиданий для `tests/backlog-closure.test.mjs` при отсутствии blob. Формальных `TBD` вне Open Questions нет — а сами Open Questions во всех четырёх спеках объявлены пустыми, что при перечисленных выше нерешённых развилках выглядит преждевременно уверенно.

---

**Итог.** Программа архитектурно здравая и в ряде мест образцовая, но три дефекта блокируют принятие как есть: инвентаризация теряет 33 инцидента и весь не-Orca пласт, из-за чего scope четырёх спек спроектирован на неполном входе; provenance всей программы держится на непушнутой локальной ветке; `find-reuse` остаётся без вызывающей стороны, а вместе с `mo-reuse` исчезает необъявленное требование редактуры секретов. Плюс DoD «`make mo-qc` проходит» недостижим, пока никто не владеет регистрацией `senior-*`/`find-reuse` и судьбой `Backlog lens`.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 5,
      "would_adopt": false,
      "summary": "Технически грамотная и во многом образцовая программа: Git-anchored provenance (хеши проверены — верны), закрытый набор dispositions с явным запретом закрывать строку одним upstream issue, временная AST-биекция вместо вечного registry, evidence-first review без confidence-порога, честное откладывание ensemble-гипотезы до differential eval. Однако центральное обещание — lossless inventory — эмпирически не выполняется: Appendix A является механическим переносом 52 заголовков H3/H4, тогда как реестр содержит 305 буллетов, и весь блок '2026-08-24 Marta Eval' (строки 5-37, 33 инцидента) не покрыт ничем, включая целые не-Orca семейства (materialization ownership внешнего BRIEF, aidd-spec/agent-browser auth, усечения вывода 21k/41k токенов, worktree binding с ложным ok:true) и требования к собственным компонентам Meta-O (mo-watchdog, mo-models.mjs). Границы четырёх спек спроектированы на этом неполном входе, поэтому строгая биекция §4.5 найдёт строки без владельца. Дополнительно: provenance держится на непушнутой локальной ветке feature/orca-only (проверено — коммит недостижим ни из develop, ни из origin, тега нет), что при squash-merge уничтожает source of truth; find-reuse остаётся сиротой (spec 1 делегирует интеграцию в spec 2, spec 2 его не упоминает), а вместе с удалением mo-reuse исчезает необъявленное требование редактуры секретов в дословном ledger; §4.2 выдаёт уже сконфигурированный eslint-plugin-jsdoc за новую работу, не называя реальный механизм (match-description); §4.3/§4.5 не реализуемы на инкумбентном markdown-it (у inline-узлов map===null); программа ломает orchestration-contract.test.mjs и Backlog lens, чем делает собственный DoD 'make mo-qc проходит' недостижимым.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "INVENTORY-LOSS-01",
          "severity": "critical",
          "area": "lossless-inventory/scope",
          "description": "Appendix A покрывает только 52 заголовка H3/H4 реестра, тогда как реестр содержит 305 буллет-инцидентов. Полностью утрачен блок '## 2026-08-24 — Marta Eval task 730873' (строки 5-37, 33 инцидента) и весь пласт не-Orca требований. Минимум в 9 разделах формулировка строки теряет материально иное требование. Это не только дефект карты: scope четырёх спек спроектирован на неполном входе.",
          "evidence": "docs/backlog-issues-real-runs.md: строки 6/9/15 (усечения вывода 21k и 41k токенов), 10/13 (materialization ownership BRIEF + прямое указание пользователя о порядке feature-ветка → BRIEF под Git → путь), 8 (agent-browser без корпоративной авторизации, переход на aidd-spec), 7/11/12/14 (orca worktree create вернул ok:true при отсутствии ветки и checkout), 16-20 (readiness/auth трёх harness), 32 (waiter_exists без публичного handle), 37 (семантика initial /goal), 59/62 (дефекты mo-watchdog: action=nudge при delivered_at:null, 0600-digest подавляет невиданный нудж; state=unclassified), 34/61 (mo-models.mjs), 35 (discoverability bundled-скриптов). Ни одна строка Appendix A им не соответствует.",
          "required_change": "Построить инвентаризацию на уровне буллетов, а не заголовков, до фиксации границ спек. Явно назначить владельца каждому не-Orca семейству (materialization ownership внешней спеки, внешний spec-сервис/agent-browser auth, лимиты усечения диагностики) и каждому требованию к собственным компонентам Meta-O (mo-watchdog, mo-models.mjs, SKILL.md discoverability), либо добавить пятую область, либо расширить scope spec 3/4 с явной строкой в Appendix A."
        },
        {
          "id": "PROVENANCE-FRAGILE-02",
          "severity": "critical",
          "area": "provenance/git",
          "description": "Вся программа опирается на два Git blob и cutoff-коммит, достижимые только из одной непушнутой локальной ветки. Squash-merge, rebase или удаление ветки делают их недостижимыми и подлежащими GC, что необратимо ломает tests/backlog-closure.test.mjs (§4.5 читает эти blob как source of truth) и делает обход 'cutoff→HEAD по merge DAG' (§4.4) неопределённым, так как cutoff перестанет быть предком HEAD.",
          "evidence": "git merge-base --is-ancestor 41a4898... develop → NO. git for-each-ref: коммит достижим только из refs/heads/feature/orca-only; remotes/origin/feature/orca-only отсутствует; git tag показывает только 0.1.0-0.4.1. Кроме того docs/research/ имеет статус '??' (untracked), хотя Appendix A объявляет эти документы сохранённой decision surface, а §1 закрепляет provenance 'по Git'.",
          "required_change": "Потребовать annotated tag на базовом коммите и его push перед началом работ; записать имя тега рядом с SHA в §1. Явно запретить squash/rebase для ветки, несущей закреплённые объекты, либо перенести оба blob под тег. Закоммитить docs/research/ (или зафиксировать явное решение не хранить их в репозитории) и указать их blob-идентификаторы."
        },
        {
          "id": "FIND-REUSE-ORPHAN-03",
          "severity": "critical",
          "area": "find-reuse/integration/security",
          "description": "Spec 1 §1.1 прямо делегирует Meta-O-интеграцию find-reuse в spec 2, но spec 2 не упоминает find-reuse ни в §2.2 Components, ни где-либо ещё, и в Appendix A нет соответствующей строки. Skill остаётся без вызывающей стороны и без destination отчёта. Дополнительно действующий mo-reuse владеет обязанностями за пределами reuse-research, в том числе обязательной редактурой секретов в дословном пользовательском вводе, и ни одна из четырёх спек не назначает им владельца.",
          "evidence": "src/skills/mo-reuse/SKILL.md: 'Record the business framing — the user's request verbatim'; 'One thing is not recorded verbatim: a secret. A token, password, key, cookie, connection string with credentials... is replaced by a marker... [REDACTED: deployment token]'; 'If you cannot tell whether a value is a secret... stop with needs_attention instead of guessing'; также создание спеки с '## User intents (verbatim)', spec-only commit, правило 'orchestrator may offer once', детект layout docs/business.md vs docs/business/index.md. Spec 2 §2.4 покрывает business-harvest частично; редактура секретов не упомянута нигде.",
          "required_change": "Добавить в spec 2 явный раздел интеграции find-reuse: кто и когда вызывает, как передаётся контекст, куда сохраняется отчёт, сохраняется ли правило 'предложить один раз' и неблокирующий характер отсутствия исследования. Отдельно назначить владельца редактуры секретов и остановки needs_attention для дословного ledger (§2.3/§2.4) с приёмочной фикстурой, иначе удаление mo-reuse теряет security-контроль."
        },
        {
          "id": "DOD-UNREACHABLE-04",
          "severity": "critical",
          "area": "acceptance/gates",
          "description": "DoD §4.8 требует прохождения make mo-qc, но программа ломает существующие гейты и не назначает владельца необходимой регистрационной работе. senior-python/senior-jsts не в Git и отсутствуют в EXPECTED build/install-списках; find-reuse нигде не добавляется в те же списки (§1.10 требует лишь отсутствия mo-reuse); опустошение backlog делает ложной ассерцию review-protocol и три строки acceptance.",
          "evidence": "git status: '?? src/skills/senior-jsts/', '?? src/skills/senior-python/'. tests/build-skills.test.mjs:29-36 EXPECTED содержит 6 имён без senior-*, фактических директорий 8 (проверено скриптом: SOURCES==EXPECTED? false). tests/install.test.mjs:70-76 — тот же список. tests/orchestration-contract.test.mjs:55 assert.match(source, /read all of `docs\\/backlog.md`/). shared/references/review-protocol.md содержит секцию '## Backlog lens' с 'read all of docs/backlog.md'. docs/acceptance.md содержит строки 'Reviewers проверяют фичу и backlog' и 'Backlog разобран полностью → Финальные reviewers проверяют все строки'.",
          "required_change": "Назначить владельца (spec 1 для skills, spec 4 для knowledge) следующим пунктам: закоммитить senior-*, добавить senior-* и find-reuse в EXPECTED build/install, README-таблицу и frontmatter-гейт §A-DISTRIBUTION-06; переработать '## Backlog lens' в 'Deferral lens' и синхронно обновить ассерцию orchestration-contract.test.mjs; пересмотреть три затронутые строки docs/acceptance.md. Добавить эти пункты в Appendix A."
        },
        {
          "id": "AST-INFEASIBLE-05",
          "severity": "major",
          "area": "spec-4/tooling",
          "description": "§4.3 задаёт контракт stripArchitectureAnchor с байтовыми смещениями start/end и байт-сохраняющей проверкой, а §4.5 — локатор 'AST node ordinal'. Инкумбентная библиотека проекта markdown-it не предоставляет позиций для inline-узлов и не сериализуется обратно в Markdown без потерь. Спека не называет библиотеку и не признаёт проблему, вынуждая исполнителя принять новое решение об архитектуре зависимостей.",
          "evidence": "package.json содержит markdown-it@^14.3.0; tests/knowledge-chain.test.mjs:17-20 использует MarkdownIt. Прямая проверка: MD.parse('Текст §A-MEMORY-01 и `code`.') → inline children имеют map=null (text, code_inline, text), позиции только у блочных токенов через token.map. CLAUDE.md запрещает regex-парсинг Markdown.",
          "required_change": "Назвать конкретную библиотеку с позициями (например remark/mdast-util-from-markdown) либо описать схему offset-recovery поверх AST-детекции с сохранением исходных байтов. Определить поведение для граничных случаев: якорь в скобках, якорь перед точкой в конце предложения, якорь внутри inline code и внутри link label."
        },
        {
          "id": "JSDOC-ALREADY-DONE-06",
          "severity": "major",
          "area": "spec-4/symbol-purpose",
          "description": "§4.2 описывает как новую работу то, что уже сделано, и не специфицирует реальный незакрытый разрыв. eslint-plugin-jsdoc уже установлен и подключён с require-jsdoc в publicOnly-режиме, а eslint входит в mo-lint. Незакрытым остаётся требование, чтобы description содержал применимый §A-* идентификатор — чего require-jsdoc не умеет в принципе. Механизм существует (jsdoc/match-description), но не назван, regex не задан, contexts не указаны.",
          "evidence": "eslint.config.mjs: 'import jsdoc from \"eslint-plugin-jsdoc\"', rules 'jsdoc/require-jsdoc': ['error', { publicOnly: true, require: { ClassDeclaration: true, FunctionDeclaration: true } }]; header 'Implements §A-QUALITY-01'. package.json: eslint-plugin-jsdoc ^64.2.1. Makefile mo-lint содержит 'npx --no-install eslint .'. Проверка установленного плагина: правило match-description присутствует среди 76 правил.",
          "required_change": "Переформулировать §4.2 как дельту к существующей конфигурации: назвать jsdoc/match-description (или обоснованную альтернативу), привести точный matchDescription regex для §A-*, указать contexts и перечень исключений через publicOnly/ignore, и добавить фикстуры на нарушение именно контента описания, а не его наличия."
        },
        {
          "id": "BIJECTION-UNSAT-07",
          "severity": "major",
          "area": "spec-4/closure",
          "description": "§4.5 требует биекции 'каждый source node → ровно одна map row' для каждого paragraph и list item, но docs/backlog.md содержит вставленный сырой диалоговый транскрипт с репликами, не несущими нормативного обязательства. Закрытый набор dispositions §4.6 не содержит значения для такого узла, а 'documented' и 'not-blocking' явно запрещены как закрывающие. Контракт неудовлетворим и вынудит присваивать ложные dispositions.",
          "evidence": "docs/backlog.md содержит фрагменты вида 'а я вроде не закреплял нигде 4.8', '› а почему у тебя 2 клода запущены для ревью? или 1 не для ревью?', 'и кстати пожалуй стоит сразу же в том же первом коммите...'. §4.6: 'reported-upstream, documented, not-reproduced и not-blocking не закрывают row сами по себе'.",
          "required_change": "Добавить в §4.6 disposition 'no-obligation' с проверяемым критерием (узел не содержит нормативного ожидания и не является уникальным свидетельством) и обязательной ссылкой на канонический узел, контекст которого он поясняет, чтобы distinct evidence не терялся."
        },
        {
          "id": "HOT-REVIEWER-CONTRACT-08",
          "severity": "major",
          "area": "spec-2/review-independence",
          "description": "§2.6 требует держать ревьюеров горячими до settlement всей фичи, а §2.10 делает переиспользование hot sessions приёмочным критерием. Действующий контракт требует для каждого нового SHA двух свежих независимых ревью. Ревьюер, уже вынесший findings по предыдущему SHA, якорён на собственных выводах. Смена контракта не объявлена, не обоснована размен-анализом, не отражена в Decision ledger и не имеет теста на отсутствие самоподтверждения.",
          "evidence": "shared/references/methodology.md §5: 'The executor fixes or responds and commits a new SHA; review that new SHA with two fresh independent reviews.' shared/references/review-protocol.md 'Barrier and delivery': 'A new SHA requires two new independent reviews.' Decision ledger спеки не содержит строки об этой замене.",
          "required_change": "Зафиксировать смену в Decision ledger как adopted-решение с обоснованием, либо принять компромисс: горячие сессии для remediation-раундов, свежие независимые сессии для финального same-SHA gate. В любом случае добавить приёмочный тест, доказывающий, что горячий ревьюер не подтверждает автоматически собственный прежний вердикт."
        },
        {
          "id": "STALE-ACCOUNT-SURFACE-09",
          "severity": "major",
          "area": "spec-3/recovery-ladder",
          "description": "§3.7 ставит 'public account/provider status, включая quota/reset time' вторым шагом recovery ladder, опираясь на рекомендацию реестра, но не учитывает зафиксированное там же ограничение: тот же surface возвращает устаревший кэш после успешной авторизации. Recovery может принять решение по stale-данным.",
          "evidence": "docs/backlog-issues-real-runs.md стр. 22: после авторизации claude auth status подтверждает loggedIn: true, но 'orca account list --json продолжает возвращать старый cached missing-credentials/unavailable с прежним updatedAt. Readiness нельзя решать по этому stale rate-limit cache'. Стр. 592-597 рекомендуют тот же surface для quota reset time.",
          "required_change": "Добавить в §3.7 и §3.10 явное требование проверять свежесть (updatedAt) account-surface и правило fail-closed в unknown при устаревшем или несогласованном с harness-level probe значении; добавить приёмочную фикстуру на stale-кэш."
        },
        {
          "id": "ADAPTER-CMD-UNGATED-10",
          "severity": "major",
          "area": "spec-1/adapters",
          "description": "Таблица рисков обещает митигацию устаревания adapter-команд через 'executable fixture/live probe + last_verified', но §1.10 исполняет argv только против fake/local endpoints и выводит live-probes за пределы mo-qc как опциональные. Фикстура против фейкового endpoint проверяет форму argv, но не существование подкоманды, поэтому несуществующая или переименованная команда не будет обнаружена ни одним гейтом.",
          "evidence": "§1.10: 'adapter fixtures выполняют documented argv against fake/local endpoints; optional live probes не входят в mo-qc'. При этом §1.6 предписывает 'dotnet package search' (требует .NET 9+), 'cargo info' (Cargo >= 1.82) и 'python -m pip index versions' — экспериментальную команду pip, печатающую warning и не гарантированную к сохранению.",
          "required_change": "Ввести отдельную документированную live-smoke команду вне mo-qc, обязательную к прохождению перед любым обновлением last_verified, и зафиксировать в дескрипторе минимальные версии инструментов (tool_min_version) с install/version probe, включая пометку экспериментального статуса pip index."
        },
        {
          "id": "FINAL-GATE-SCOPE-11",
          "severity": "major",
          "area": "spec-2/settlement",
          "description": "Не определён scope финального same-SHA gate на deletion-SHA. §2.6 допускает три значения scope. При scope=feature ревьюеры вправе поднимать новые findings на каждом витке, и цикл не сходится по построению; при scope=diff-only два PASS не аттестуют фичу целиком, что подрывает контракт доказательства. Исполнитель обязан принять это решение сам.",
          "evidence": "§2.6: 'scope: branch|feature|project'. §2.7: 'Final gate выполняется один раз после удаления temporary spec/checklist и всех последних правок.' §2.9 шаг 4: 'запускает единый final same-SHA review/E2E gate, если deletion вошёл после предыдущего proof'. §3 общего протокола: 'Их удаление создаёт новый SHA, поэтому общий final gate выполняется на deletion SHA.'",
          "required_change": "Явно задать scope финального gate и правило допустимости findings на deletion-diff (например: scope=feature, но findings принимаются только при доказанной causality относительно удаления либо при ранее пропущенном P0-P2), чтобы цикл был сходящимся и при этом аттестовал фичу."
        },
        {
          "id": "QWEN-CONSTANT-12",
          "severity": "major",
          "area": "spec-3/local-model",
          "description": "§3.9 закрепляет точный идентификатор модели и квантование как жёсткий блокирующий критерий поддержки, что противоречит §2.12, объявляющей выбор моделей user-approved runtime configuration, а не постоянной spec-константой. Сам идентификатор выглядит искажённым диктовкой. Кроме того профиль не задаёт контекстного бюджета, хотя реестр фиксирует усечения диагностики Orca, а compaction присутствует как lifecycle-состояние.",
          "evidence": "§3.9: 'OpenCode запускает exact Qwen 3.8 27B UD-Q4-KM'; §2.12: 'Конкретный выбор моделей остаётся user-approved runtime configuration, а не постоянной spec-константой'. Реестр стр. 9 (~21k tokens усечено) и стр. 15 (~41k tokens/6173 строк усечено). §3.4 содержит lifecycle-состояние 'compacted'. Публичной линейки 'Qwen 3.8' не существует; UD-Q4-KM соответствует нотации UD-Q4_K_M.",
          "required_change": "Перевести идентификатор модели в user-approved runtime configuration с фиксацией фактического effective model id в evidence (как уже требует §4 общего eval-контракта), сохранив требование локального профиля как таковое. Добавить в §3.9 обязательный context_budget: минимальное окно, требование фильтрации диагностических JSON-вызовов и определённое поведение при исчерпании контекста."
        },
        {
          "id": "LEDGER-GAPS-13",
          "severity": "minor",
          "area": "traceability",
          "description": "Три изменения действующего контракта не зафиксированы в Decision ledger: введение severity-gating поверх нормы, запрещающей adjudication grammars; переход к hot reviewers вместо fresh-per-SHA; отклонение зафиксированного в реестре пользовательского бюджета review/fix на substantive slice, который спека смешивает с numeric round cap для settlement.",
          "evidence": "shared/references/review-protocol.md: 'use judgment rather than finding identifiers, adjudication grammars or numeric review-round caps'. §2.7 вводит 'P0-P2 блокируют settlement'. docs/backlog-issues-real-runs.md стр. 123: 'Пользовательский контракт ограничивает одним бюджетом максимум пять циклов review/fix для одного большого функционального куска спеки... после исчерпания бюджета executor нужно снова явно пнуть делать следующий большой slice'; стр. 125 требует двух разных счётчиков.",
          "required_change": "Добавить три строки в Decision ledger с обоснованием и указанием замещаемого текста. Отдельно развести settlement-cap (отклонён обоснованно) и slice-budget (пользовательское требование о продвижении по спеке), назначив последнему владельца или явный rejected-статус с причиной."
        }
      ],
      "assumptions": [
        "Я трактовал frozen decision [senior-skills] ('создание не является backlog-работой') как не отменяющее необходимость регистрации этих skills в build/install/README, поскольку DoD программы явно требует прохождения make mo-qc.",
        "Я не переоткрывал frozen decisions как альтернативы; расхождение по идентификатору модели Qwen я подал как противоречие между §3.9 и §2.12, а не как предложение сменить модель.",
        "Я предположил, что 'Appendix A — coarse map' не снимает требование постановки о lossless inventory, поскольку границы четырёх спек выводятся именно из этой карты, а строгая биекция строится позже и лишь проверяет результат.",
        "Я предположил, что ветка feature/orca-only предназначена к слиянию в develop; риск GC закреплённых объектов оценивался исходя из обычных практик squash-merge и удаления ветки после слияния.",
        "Я не запускал сетевые probe для adapter-команд; выводы о версионных требованиях dotnet/cargo/pip основаны на известных свойствах этих CLI, а не на локальной проверке.",
        "Отчёт второго фонового аудита (business/architecture) не поступил до завершения обзора; соответствующие проверки (eslint-конфиг, markdown-it, ссылки mo-reuse, knowledge-chain, review-protocol, methodology, тесты на backlog, acceptance) я выполнил самостоятельно и на них опираюсь."
      ],
      "round": 1,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 5
would_adopt: false
