Прежде чем оценивать, зафиксирую рамку. Это уже вторая редакция: документ явно поглотил findings первого review-раунда (пара `BASE_SHA + CANDIDATE_SHA`, механический freeze, отказ от scroll-stitching, `--no-alt-screen`, non-interactive reviewer panes, bounded retrieval ladder, отложенный `mo-models.mjs`, task-runner precedence вместо обязательного Make, capability matrix, §22 transfer map, §23 audit, §24 guarantees removed, §25 pre-mortem, §3 сравнение трёх уровней, slug-алгоритм, нормализация provider). Поэтому повторять закрытые замечания бессмысленно — ценность даёт только проверка нового материала. Я перепроверил локально всё, что документ утверждает о backend: `herdr 0.8.0` (`agent read/prompt/wait/send-keys/attach`, `terminal`, установленный `herdr --skill`), `codex --help` (наличие `--no-alt-screen` и `exec`), `claude --help` (`-p`, отсутствие inline-режима), `opencode --help` (`run`, `models`, `export`), и подробно `omnigent 0.6.0` (`run`, `resume`, `attach`, `session export`). Именно эта проверка даёт основные новые находки: Herdr- и Git-части документа теперь точны, а Omnigent-часть описывает контракт, которого в CLI 0.6.0 нет.

## Facts & Constraints (White Hat)

**Подтверждено локально и описано верно.**

- `codex --help`: `--no-alt-screen` — «Disable alternate screen mode. Runs the TUI in inline mode, preserving terminal scrollback history». §10.2 ladder step 1 опирается на реальный флаг, а не на предположение.
- `herdr --skill` подтверждает и границы: `--lines` тянет строки из screen + host scrollback, строки, покинувшие alternate screen, не восстанавливаются. §10.2 честно признаёт это и отказывается от stitching — это правильная реакция на реальность backend.
- `herdr agent prompt --wait` действительно «does not track turns»; §10.1 воспроизводит это ограничение дословно по смыслу.
- Herdr agent name regex `[a-z][a-z0-9_-]{0,31}` — §20 совпадает с установленным skill, включая 32-символьный предел.
- `which -a claude codex opencode` даёт `/Users/alex/bin/*` перед Homebrew; §14.4 корректен.
- `opencode models` существует — §18.1 не выдумывает surface.
- **Omnigent export описан точно**: `omnigent session export --id conv_abc123 [--output file]`, и help дословно подтверждает формат — «The first line carries the session metadata (`"record_type": "session_meta"`); every subsequent line is one conversation item (`"record_type": "item"`). The file preserves full turn order». §11.2 построен на реальном контракте. Требование `--output` вне project tree тоже уместно: по умолчанию файл падает в CWD, то есть загрязнил бы worktree и сломал freeze-check.

**Опровергнуто или существенно неполно.**

1. **У Omnigent 0.6.0 нет non-interactive automation surface.** Полный список команд не содержит `send`, `wait`, `status`, `ls`, `logs`. `omnigent run` открывает REPL; `omnigent resume` открывает REPL; `omnigent attach` — «Attach the REPL to a LIVE session — never starts anything», тоже REPL-клиент. Единственная неинтерактивная операция — `session export`. §11.1 подаёт «session creation / follow-up / resume» как baseline contract, хотя ни одна из этих операций не имеет скриптуемой формы: orchestrator не может ни отправить follow-up, ни узнать, что turn завершён. §11.3 перечисляет «follow-up delivery» и «premature idle» среди fixtures, но не называет главного неизвестного — **где вообще живёт процесс REPL и как к нему адресоваться**. Варианты (host внутри Herdr-панелей; HTTP/SSE server API, который в спеке не упомянут; драйвер stdin — запрещённый wrapper) не сравнены и не выбраны.
2. **Из-за этого §1 делает release зависимым от, возможно, структурно недостижимого условия.** «Release требует хотя бы одного полностью поддержанного lifecycle через Herdr и одного через Omnigent». Если Omnigent 0.6 не даёт неинтерактивного prompt/status surface, release заблокирован целиком, хотя Herdr-ветка готова. Исходная задача ставит Omnigent как «следующий implementation target», а не как co-blocker первого релиза.
3. **`omnigent run --log`** пишет JSON dump разговора в `~/.omnigent/logs/` при выходе — ещё один native-полный источник последнего turn, который §11.2 не рассматривает (и который, в отличие от provider-private JSONL, является собственным артефактом Omnigent, то есть не нарушает границу из §2.8).
4. **Инструмент для порога «class: 300 lines» не назван и, судя по всему, не существует в перечисленных стеках.** В §15.1 (Ruff/Pylint) и §15.2 (ESLint core: `complexity`, `max-lines`, `max-lines-per-function`, `max-statements`) нет правила длины класса. Порог объявлен как default, но нечем принудить — либо нужен named plugin, либо порог должен стать reviewer-lens, а не threshold.
5. **«import boundaries реализуются mature ESLint plugin/config»** — единственное место, где для TS инструмент не назван, тогда как для Python явно указан Import Linter. Для weak-model исполнителя это открытый выбор.

## Risks & Failure Modes (Black Hat)

**Major: «окно перестало добавлять контент» — легальная лазейка в §10.3.** Completeness proof требует, чтобы «увеличение read window перестало добавлять более ранний content **или** достигло доказанной upper boundary». Первая альтернатива неотличима от исчерпания host scrollback: и в случае «мы дошли до начала ответа», и в случае «Herdr больше не хранит строк» рост `--lines` перестаёт что-то давать. Именно так partial output и получит PASS — ровно тот failure mode, против которого написан весь §10. Дизъюнкция должна стать конъюнкцией: положительная верхняя граница (эхо prompt или строка запуска процесса в pane) обязательна всегда.

**Major: нет termination-правила у fix-loop.** §12.5.4 требует после каждого fix повторять оба first-pass review и все gates, а §8.4 — полный набор. Два независимых LLM-reviewer на каждом раунде с ненулевой вероятностью выдают новые findings на уже проверенном коде; критерия сходимости (максимум раундов, правило «новый finding на неизменённой области требует обоснования», эскалация к пользователю с residual-списком) нет. Спека жёстко закрывает infinite retry для retrieval (§10.3 budget), но оставляет открытым куда более вероятный бесконечный цикл review→fix→review.

**Major: доставка больших findings внутрь не покрыта ни контрактом, ни fixture.** §10.4 задаёт предел 64 KiB и «отправляется одним native prompt через tool API без shell interpolation». Практически orchestrator вызывает `herdr agent prompt <TARGET> <TEXT>` из shell-инструмента, то есть interpolation неизбежна, а произвольный Markdown содержит кавычки, backticks и `$`. Отдельно: `agent prompt` «honors the pane's live bracketed-paste mode», а TUI Claude/Codex сворачивают крупные вставки в placeholder — вопрос, доходит ли до модели весь текст, эмпирический. §10.5 перечисляет fixture «output beyond 64 KiB», но ни одного fixture на **входящую** доставку крупного prompt нет. Лоссless-транспорт findings — центральное требование задачи, и он проверяется только в одну сторону.

**Major: dispute-loop несовместим с print-mode reviewers.** §12.5 шаги 5–7 требуют, чтобы original reviewer прочитал rebuttal и ответил, а второй reviewer выступил арбитром — то есть reviewer должен быть адресуемым и сохранять контекст. Но §10.2 step 2 (единственный путь, дающий Claude/OpenCode статус qualified в §6.2) — это эфемерный `claude -p` / `opencode run`, который завершается процессом. Как продолжить именно ту reviewer-сессию (`--resume`, `-c`, session id), спека не описывает; при новом процессе «original reviewer отвечает» становится другим reviewer без памяти о своём finding.

**Major: параллельность gates не определена, а freeze-протокол к ней чувствителен.** §8.4 перечисляет gates списком, §7.4 требует pre/post-проверки вокруг каждого. Можно ли reviewer A и B гонять одновременно в одном worktree — не сказано. Если да, пост-проверка одного gate поймает мутацию, вызванную другим, и оба уйдут в `unknown` без диагностики; если нет — стоимость по времени вырастает, что противоречит принципу «время человека дороже токенов». Это решение архитектурное и его должен принять не исполнитель.

**Minor–major, конкретно:**

- §7.4 «только executor исправляет или удаляет собственный generated output» — но мусор мог оставить reviewer или E2E-процесс (§10.5 прямо предусматривает fixture «provider process mutates worktree»); кто чистит чужой артефакт, не сказано.
- «project cleanup contract» (§7.4) — термин используется, но нигде не определён и не входит в §14 setup contract.
- §7.1.7 создаёт ветку `meta-o/<slug>`, но алгоритм slug задан только для Herdr actor names (§20) с 32-символьным лимитом Herdr; переиспользуется ли он для веток, не сказано.
- §17 печатает `AGENT_REQUIRED: not executed` и завершается кодом `0`. Это лучше прежней двойки для агрегаторов, но теперь CI, вызывающий target, получает зелёный результат при невыполненном E2E; компенсация только текстовая. Компромисс приемлем, но его цена нигде не названа.
- §12.3: PASS запрещён при unresolved `critical`/`major`, а `minor` «может остаться как явно accepted residual risk» — кто именно принимает (author, orchestrator, user), не сказано; это тихая точка, через которую утекают замечания.
- §13.1 при offline/rate-limit разрешает продолжить с «консервативным `build/extend` decision» — то есть отсутствие поиска систематически подталкивает к `build`, ровно к тому, против чего направлен `mo-reuse`. Более честный default — `needs_attention` либо явная пометка «reuse research не выполнен» в spec-разделе.

## Strengths & Benefits (Yellow Hat)

- **Git-контракт стал доказуемым.** Пара `BASE_SHA + CANDIDATE_SHA`, `git diff --find-renames BASE...CANDIDATE`, `git log BASE..CANDIDATE` и две дешёвые команды freeze до/после каждого gate закрывают весь исходный вопрос №9 задачи без snapshot digest, receipts и worktrees. Это лучший раздел документа.
- **§6 превращает неопределённость в продуктовый артефакт.** Разделение `available | inferred | unavailable | unsupported`, требование записывать backend version и fixture name, и явный запрет использовать `inferred` как gate evidence — это ровно то, чего требовала задача §4.2, но в форме, которая не порождает runtime-телеметрию.
- **§10.2 честно отказывается от собственного изобретения.** Отклонение stitching с аргументом «повторяющиеся строки TUI не доказывают continuity» и перевод Claude/OpenCode interactive в `unsupported` — это редкий случай, когда спека предпочитает fail-closed красивому алгоритму.
- **§3, §23, §24, §25 закрывают методологические требования задачи не формально**: сравнение трёх уровней с verdict, аудит с указанием замены, список сознательно снятых гарантий с operational consequences, и pre-mortem с proof-шаблоном для любого будущего helper. Шаблон proof (`Consumer/Native gap/Why reasoning is insufficient/Interface/State written/Removal test`) — практичный анти-bloat механизм.
- **§18.2 — правильный отказ.** Отложить `mo-models.mjs` вместо того, чтобы описывать недоопределённый discovery-subsystem, устраняет конфликт «SDK-зависимости против distribution без installer» и снимает целый класс рисков.
- **§22 transfer map** делает отмену executor skill исполнимой: у каждого полезного требования старого `execute-feature` появился именованный новый владелец, включая тесты, которые в предыдущей редакции терялись.
- **§19 watchdog** получил полный CLI-контракт с exit codes и timeouts — если fixture провалится, исполнителю не придётся ничего домысливать.
- **§16** явно и с обоснованием фиксирует, что именно из GRACE не переносится (`B→A→M`, grep-anchors) — это честное решение, а не молчаливая потеря.

## Alternatives & Creative Ideas (Green Hat)

1. **Расщепить release gate.** Herdr-релиз не должен ждать Omnigent. `mo-omnigent` логично объявить Phase 2-целью с собственным qualification, оставив в первой поставке один полностью доказанный backend. Это соответствует формулировке задачи («Omnigent — следующий implementation target») и снимает риск №2.
2. **Для Omnigent сначала выбрать host-модель, потом контракт.** Три честных варианта: (a) REPL внутри Herdr pane — прагматично, но делает Omnigent зависимым от Herdr и требует явного признания в §2/§4; (b) server HTTP/SSE API (`omnigent run --server ""` поднимает persistent local server) — это уже non-CLI surface, но native и скриптуемый; (c) отказ от automation и позиционирование Omnigent как ручного backend. Сейчас не выбран ни один.
3. **`omnigent run --log` как второй completeness-источник.** JSON dump на выходе — native артефакт Omnigent, а не provider-private файл; его сверка с `session export` даёт независимое доказательство полноты и закрывает риск silent server-side limit.
4. **Инвертировать доказательство верхней границы.** Вместо «окно перестало расти» — требовать, чтобы в интервале присутствовал стабильный якорь начала: эхо отправленного prompt (его текст известен orchestrator дословно) или строка запуска процесса в pane. Это превращает эвристику в проверяемый факт без нового кода.
5. **Ограничить фикс-цикл дешёвым правилом.** Например: после второго раунда новые findings принимаются только по изменённым в последнем fix файлам или по критичности `critical`; всё остальное уходит в `docs/todo.md` и residual risks. Это текстовое правило, не engine.
6. **Порог размера класса перевести из threshold в review lens** (или назвать конкретный плагин), чтобы §15 не содержал невыполнимого обещания.
7. **Для доставки крупных findings** проверить в Phase 0 не только «влезает ли», но и «дошло ли»: fixture, где executor обязан процитировать маркер из середины 60 KiB findings.

## Completeness & Process (Blue Hat)

Обязательные требования задачи, закрытые в этой редакции: три архитектурных уровня (§3), context/cache матрица (§6.2), subscription-first (§6.3), transfer map (§22), tooling audit (§23), guarantees removed (§24), pre-mortem (§25), distribution (§26), decision ledger (§29). Это существенное продвижение.

Остаются пропуски:

- **Layout сценариев E2E потерян.** Задача §8.1 требует двух масштабируемых форм — `docs/e2e.md` и `docs/e2e/index.md` + group files, с правилом выбора по размеру, описанием environment/prerequisites/cleanup в index и объяснением «когда выбирать эту группу». В §14.2 остался только `docs/e2e.md`, а §17 оперирует полем `SCENARIOS: <groups>`, нигде не определив, откуда группы берутся. Tester не сможет выбрать релевантный subset.
- **`knowledge sync` не определён.** Задача (deliverable 14, вопрос 16) требовала объяснить простыми словами: какие устойчивые факты переносятся, в какой момент, как не скопировать spec целиком, когда старая spec перестаёт быть источником, как быть с task без spec-файла и как reviewers это проверяют. В спеке есть только «обновить durable knowledge» (§8.3.5), layout (§14.2) и строка в §22.
- **Optional handoff (`≤4 KiB`) не рассмотрен.** Задача §14 прямо просит либо удалить его, либо обосновать. В §23 audit его нет ни одной строкой — единственный неклассифицированный компонент из требуемого списка.
- **Практическая рекомендация по context/cache отсутствует.** Матрица §6.2 даёт статусы, но задача просила ещё и «когда выгоднее продолжить старую session, сделать native compact либо поднять fresh actor» с fallback. §23 переводит это в defer, что для *автоматизации* правильно, но текстовая рекомендация всё же требовалась.
- **Параллельность gates и владение cleanup** (см. Black Hat) — процессные пробелы, а не только контрактные.

## Traceability

Ledger есть, он подробен и разделён на Adopted/Rejected/Deferred с rationale и source; прямая трассируемость почти полная. Я проверил каждую adopted-строку: skills-first → §2; два backend → §5; executor без skill → §2.2/§8.3; `mo-reuse` + first commit → §8.2/§13; Herdr-only surfaces → §2.8/§10; Markdown verdict → §12.3; `BASE+CANDIDATE` → §7.2; freeze → §7.4; invalidation → §2.6; clean worktree → §7.3; spec read-only → §8.3.8; conditional tester → §17; task-runner first → §14.1; два режима `mo-review` → §12.1; run-local digest → §12.1; cross-provider independence → §12.2; inline Codex → §10.2; отклонённый stitching → §10.2; bounded ladder → §10.3; Omnigent JSONL → §11.2; goal до candidate + pause → §9; `mo-setup` → §14; `~/.meta-o` → §18; normalized routes → §12.2/§18; watchdog 1:1 → §19; conditional helper → §19; APM/skills → §26; build-time copy check → §4/§26; три раунда reuse → §13.2; subagents 0/3/6 → §12.5; purpose → §16; TS profiles → §15.2/§15.3; naming → §20; Phase 0 как release gate → §1/§6.4/§27; capability matrix → §6.1; subscription-first → §6.3; E2E exit 0 → §17; helper proof → §25. Rejected-строки также присутствуют в теле.

Дефекты:

- **Две deferred-записи не имеют опоры в теле**: «Global architecture hygiene tool» и «Mandatory spec retirement». В §1–§28 ни глобальный аудит, ни retirement spec не упомянуты вовсе — читатель тела не узнает, что эта граница вообще проведена (задача §11.2 требовала явно сохранить future requirement).
- **Обратная трассируемость всё ещё неполна**, хотя стала заметно лучше. В ledger нет: предела 64 KiB и правил transport (§10.4), retrieval budget «один attempt + один rerun» (§10.3), запрета PASS при unresolved critical/major (§12.3), правила «только executor чистит generated output» (§7.4), создания ветки `meta-o/<slug>` (§7.1.7), конкретных TS-порогов (§15.2), exit codes и timeouts watchdog (§19), ограничения frontmatter двумя полями (§26), поведения при offline reuse (§13.1).

## Decomposition Readiness

Готовы к прямой нарезке без новых архитектурных решений: §7 (Git lifecycle целиком — команды выписаны), §13 (`mo-reuse`, включая privacy и формат), §14 (`mo-setup`), §15.1–§15.2 (за вычетом порога класса и безымянного boundary-плагина), §16, §17 (кроме источника групп), §19 (`mo-watchdog` helper — CLI, коды выхода, таймауты), §20 (naming), §22–§25, §26.

Не готовы:

1. **§11 Omnigent** — отсутствует host/settlement модель; исполнителю придётся выбирать между Herdr-хостингом, server API и ручным режимом. Это архитектурное решение, а не исполнение.
2. **§12.5 dispute loop** для non-interactive reviewers — нужен способ адресовать «того же» reviewer.
3. **§8.4** — последовательность или параллельность gates.
4. **§10.4** — конкретный безопасный механизм передачи 64 KiB Markdown в `herdr agent prompt` (quoting, bracketed paste, поведение TUI).

## Weak-Model Executability

Существенно улучшилось: `models.json` имеет схему и правила записи (atomic rename, corrupt-JSON, inheritance), watchdog — сигнатуру и коды, naming — пошаговый алгоритм, freeze — точные команды с флагами (`--porcelain=v1 --untracked-files=all`), review scope — точные git-команды, Omnigent export — проверяемые условия. Слабая модель это исполнит.

Останутся догадки в:

- «mature ESLint plugin/config» для boundaries (§15.2) — плагин не назван;
- порог «class: 300 lines» — правило не существует в названных стеках;
- «tool API без shell interpolation» (§10.4) — механизм не назван;
- `eslint-plugin-jsdoc` для overload declarations — не указаны AST-контексты (`TSDeclareFunction`, `TSMethodSignature`), без которых правило не сработает на overloads;
- «documented feature surface» для `features.goals` (§9.1) и «documented pause/clear behavior» (§9.2) — команда/вывод-доказательство не назван;
- «project cleanup contract» (§7.4) — термин без определения;
- «однозначный merge-base candidate с detected default upstream» (§7.2) — команда не приведена (`git merge-base --fork-point`? `merge-base HEAD origin/main`?), а от неё зависит весь standalone-режим.

## Contract Completeness

Схемы и лимиты в основном заданы конкретно: `models.json` (§18) с правилами конкурентной записи, effective route (§12.2), verdict-шаблоны (§12.3, §17), watchdog CLI и exit codes (§19), retrieval budget и 64 KiB (§10.3–§10.4), TS-пороги и исключения (§15.2), fixture-списки (§10.5, §11.2, §15.4). `TBD` вне раздела open questions я не нашёл — §30 корректно ограничен внешними qualification blockers и для каждого исхода задаёт поведение.

Незакрытые контракты: host/settlement Omnigent (§11), продолжение reviewer-сессии для dispute (§12.5), порядок выполнения gates (§8.4), источник scenario groups (§17/§14.2), владелец accepted `minor` (§12.3), инструмент для class-size и TS boundaries (§15.2), определение `knowledge sync` (§14/§22), судьба optional handoff (§23).

---

Итог: по сравнению с предыдущей редакцией это другой документ по качеству — Git-контракт, retrieval ladder, capability qualification, audit, guarantees и pre-mortem действительно закрывают исходные требования, и я не смог сломать §7 и §10.2–§10.3 иначе, чем через одну конкретную дизъюнкцию в completeness proof. Но Omnigent-раздел описывает автоматизационный контракт, которого в установленном CLI 0.6.0 нет (нет `send`/`wait`/`status`, всё — REPL), и при этом §1 делает Omnigent co-blocker релиза; плюс отсутствует правило сходимости fix-loop, не проверена доставка крупных findings внутрь, и dispute-loop несовместим с единственным путём, дающим Claude/OpenCode статус qualified. Это четыре точечные, но блокирующие правки в §1/§11, §10.3–§10.4 и §12.5 плюс два восстановленных требования задачи (E2E group layout, определение `knowledge sync`) — не редизайн.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "Редакция радикально сильнее предыдущей: Git-контракт стал доказуемым (пара BASE_SHA+CANDIDATE_SHA, точные git-команды diff/log, механический freeze до и после каждого gate с --porcelain=v1 --untracked-files=all), retrieval ladder честно отказался от недоказуемого scroll-stitching в пользу проверенного `codex --no-alt-screen` и dedicated non-interactive panes, capability qualification превращает неизвестность в версионированный продуктовый reference вместо runtime-телеметрии, а §3/§22/§23/§24/§25 закрывают ранее отсутствовавшие обязательные разделы задачи. Локальная проверка подтвердила почти все backend-утверждения: herdr 0.8.0 surfaces и 32-символьный regex имён, codex --no-alt-screen, PATH wrappers, opencode models, и дословно формат Omnigent export (session_meta + item, full turn order). Однако Omnigent 0.6.0 не имеет ни одной неинтерактивной команды управления сессией — нет send/wait/status/ls/logs, а run/resume/attach открывают REPL, — поэтому §11.1 описывает automation contract, которого не существует, не выбирая между Herdr-хостингом, server HTTP/SSE и ручным режимом; при этом §1 делает Omnigent co-blocker релиза, что может заблокировать готовую Herdr-ветку. Дополнительно: §10.3 допускает признать полноту по признаку «окно перестало расти», что неотличимо от исчерпания scrollback и легализует partial PASS; у fix-loop нет критерия сходимости при двух LLM-reviewer, повторно проверяющих каждый новый SHA; доставка до 64 KiB findings внутрь агента не имеет ни механизма без shell interpolation, ни fixture; dispute-loop §12.5 требует адресуемого original reviewer, тогда как единственный qualified путь для Claude/OpenCode — эфемерный print-процесс. Также потеряны два требования задачи: масштабируемый layout docs/e2e/index.md + group files (при том что §17 оперирует полем SCENARIOS: groups) и определение knowledge sync.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "§11 mo-omnigent / §1 release gate",
          "description": "Установленный omnigent 0.6.0 не имеет неинтерактивного управления сессией: список команд не содержит send/wait/status/ls/logs; `omnigent run --harness X -p ...` и `omnigent resume <id>` открывают REPL, `omnigent attach` — тонкий REPL-клиент («never starts anything»). Единственная скриптуемая операция — `session export`. §11.1 подаёт creation/follow-up/resume как baseline contract, а §11.3 перечисляет fixtures, не называя главного неизвестного: где хостится REPL-процесс и как orchestrator к нему адресуется и понимает завершение turn. При этом §1 требует для релиза полностью поддержанный lifecycle через Omnigent, то есть готовая Herdr-ветка блокируется структурной особенностью другого backend.",
          "required_change": "Явно выбрать и описать host/settlement модель Omnigent из трёх названных вариантов (REPL внутри Herdr pane с признанием зависимости; native server HTTP/SSE через `omnigent run --server \"\"`; ручной backend без automation), добавить соответствующие fixtures в §11.3 и §27, и разделить release gate: Herdr-релиз не должен зависеть от Omnigent qualification."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "§10.3 completeness proof",
          "description": "Условие полноты содержит дизъюнкцию «увеличение read window перестало добавлять более ранний content ИЛИ достигло доказанной upper boundary». Первая ветвь неотличима от исчерпания host scrollback Herdr: и «дошли до начала ответа», и «Herdr больше не хранит строк» выглядят одинаково. Это ровно тот partial-PASS, против которого написан весь §10, и он проходит все остальные пункты proof.",
          "required_change": "Убрать дизъюнкцию: положительная верхняя граница обязательна всегда — эхо отправленного prompt (текст известен orchestrator дословно) для inline interactive или строка запуска процесса/шелл-промпт в pane для non-interactive. «Окно перестало расти» перевести в разряд `inferred`, не дающий PASS."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§12.5 fix loop",
          "description": "После каждого fix повторяются оба first-pass review и все gates, но критерия сходимости нет. Два независимых LLM-reviewer с ненулевой вероятностью выдают новые findings на уже проверенном коде при каждом новом SHA, что даёт неограниченный цикл review→fix→review. Спека закрывает infinite retry для retrieval (§10.3), но не для гораздо более вероятного цикла review.",
          "required_change": "Добавить текстовое правило сходимости: например, начиная с третьего раунда новые findings принимаются только по файлам, изменённым последним fix, либо при severity critical; остальное уходит в residual risks и docs/todo.md; после N раундов — один точный вопрос пользователю с остаточным списком."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§10.4 findings transport (входящее направление)",
          "description": "Задан предел 64 KiB и требование «одним native prompt через tool API без shell interpolation», но orchestrator вызывает `herdr agent prompt <TARGET> <TEXT>` из shell-инструмента, где interpolation неизбежна для произвольного Markdown с кавычками, backticks и `$`. Кроме того, `agent prompt` honors bracketed-paste, а TUI Claude/Codex сворачивают крупные вставки в placeholder — доходит ли весь текст до модели, эмпирически не проверено. Fixtures §10.5 покрывают только исходящий output >64 KiB.",
          "required_change": "Назвать конкретный безопасный механизм передачи (точное quoting-правило либо native non-shell surface) и добавить в §10.5/§27 fixture входящей доставки: executor обязан процитировать маркер из середины ~60 KiB findings."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§12.5 vs §10.2 адресуемость reviewer",
          "description": "Dispute-loop требует, чтобы original reviewer прочитал rebuttal и ответил, а второй выступил арбитром — то есть reviewer должен сохранять контекст и быть адресуемым. Но единственный путь, дающий Claude/OpenCode статус qualified (§6.2 + §10.2 step 2), — эфемерный `claude -p` / `opencode run`, завершающийся вместе с процессом. Механизм продолжения именно той reviewer-сессии (session id, --resume/-c) не описан.",
          "required_change": "Описать continuation-контракт для non-interactive reviewers (сохранение session id и способ resume) либо явно разрешить, что арбитраж выполняет новый process, получающий полный контекст спора текстом, и зафиксировать это как сознательное ослабление."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§8.4 порядок gates / §7.4 владение cleanup",
          "description": "Не сказано, выполняются ли reviewer A, reviewer B, QC и E2E последовательно или параллельно в одном worktree. При параллельном исполнении post-check одного gate поймает мутацию, вызванную другим, и оба уйдут в `unknown` без диагностики; при последовательном заметно растёт время, что противоречит принципу «время человека дороже токенов». Отдельно §7.4 назначает уборку generated output только executor, хотя §10.5 прямо предусматривает мутацию worktree provider-процессом reviewer/E2E.",
          "required_change": "Зафиксировать порядок исполнения gates (или условия допустимой параллельности с изоляцией) и правило, кто устраняет артефакты, оставленные не-executor процессами; определить используемый термин «project cleanup contract»."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§14.2 / §17 E2E scenario layout",
          "description": "Задача требовала два масштабируемых layout (`docs/e2e.md` либо `docs/e2e/index.md` + group files) с правилом выбора по размеру, описанием environment/prerequisites/cleanup в index и объяснением «когда выбирать группу». В спеке остался только `docs/e2e.md`, тогда как §17 оперирует полем `SCENARIOS: <groups>` — источник групп не определён, и tester не сможет выбрать релевантный subset.",
          "required_change": "Вернуть оба layout, правило перехода по размеру и обязательное поле «когда выбирать эту группу» в group file."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Knowledge sync и optional handoff",
          "description": "Задача (deliverable 14, вопрос 16) требовала определить `knowledge sync` простыми словами: какие факты переносятся, когда, как не скопировать spec целиком, когда старая spec перестаёт быть источником, как быть с task без spec-файла и как reviewers это проверяют. В спеке есть только «обновить durable knowledge» (§8.3.5), layout (§14.2) и строка в §22. Отдельно optional handoff (`≤4 KiB`) не классифицирован ни в §23 audit, ни где-либо ещё, хотя задача требовала его либо удалить, либо обосновать.",
          "required_change": "Добавить короткое определение knowledge sync с моментом выполнения и критерием проверки reviewers; добавить строку про optional handoff в §23 audit с решением delete/keep."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§15.2 неисполнимые пороги и безымянные инструменты",
          "description": "Порог «class: 300 lines» не поддерживается ни одним из перечисленных инструментов (ESLint core имеет complexity/max-lines/max-lines-per-function/max-statements, но не длину класса; Ruff и Pylint также не дают class-LOC gate). Import boundaries для TypeScript описаны как «mature ESLint plugin/config» без имени, тогда как для Python явно назван Import Linter. Для overload declarations не указаны AST-контексты eslint-plugin-jsdoc, без которых правило не сработает.",
          "required_change": "Назвать конкретный plugin для class-size и boundaries либо перевести class-size из threshold в reviewer lens; указать контексты (`TSDeclareFunction`, `TSMethodSignature`) для JSDoc-правила на overloads."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Traceability ledger",
          "description": "Две deferred-записи («Global architecture hygiene tool», «Mandatory spec retirement») не имеют ни одного упоминания в теле спецификации, хотя задача §11.2 требовала явно сохранить эту границу как future requirement. Обратная трассируемость остаётся неполной: в ledger нет предела 64 KiB и правил transport, retrieval budget, запрета PASS при unresolved critical/major, правила уборки generated output, создания ветки meta-o/<slug>, конкретных TS-порогов, exit codes watchdog, ограничения frontmatter двумя полями и поведения reuse при offline.",
          "required_change": "Добавить в тело короткие абзацы про отложенный глобальный архитектурный аудит и spec retirement; дополнить ledger перечисленными решениями тела."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "§13.1 offline reuse",
          "description": "При offline/rate-limit разрешено продолжить с «консервативным build/extend decision», что систематически смещает результат к build — против цели mo-reuse. Честнее пометить research как невыполненный либо вернуть needs_attention."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§11.2 альтернативный источник полноты",
          "description": "`omnigent run --log` пишет JSON dump разговора в ~/.omnigent/logs — это native артефакт Omnigent, а не provider-private файл, и он мог бы служить независимой проверкой полноты export против silent server-side limit. В спеке не рассмотрен."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§12.3 accepted minor",
          "description": "Не сказано, кто именно принимает оставшийся minor как residual risk (author, orchestrator или пользователь) — это тихая точка утечки замечаний."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§7.2 merge-base rule",
          "description": "«Однозначный merge-base candidate с detected default upstream» — точная команда не приведена, а от неё зависит весь standalone-режим mo-review."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§17 exit code 0",
          "description": "Informational target с кодом 0 корректен для агрегаторов, но делает невыполненный agent-required E2E зелёным в CI; компенсация только текстовая, цена компромисса не названа."
        }
      ],
      "assumptions": [
        "Проверял установленные локально версии: herdr 0.8.0, omnigent 0.6.0, codex/claude/opencode из PATH пользователя; выводы о недоступных surfaces относятся именно к этим версиям.",
        "WebFetch к docs Claude /goal, Codex goals, APM и vercel-labs/skills не выполнялся; все блокирующие findings опираются на локально проверяемые факты или на внутренние противоречия документа, а не на внешнюю документацию.",
        "Раздел «Требования к итоговой спецификации» из task-description трактую как обязательный чек-лист полноты; отсюда findings о потерянном E2E group layout, knowledge sync и optional handoff.",
        "Считаю, что запрет на verdict-файлы и provider-private transcripts из addendum остаётся в силе, поэтому альтернативы предлагаю в пределах native surfaces соответствующего backend (включая собственный omnigent --log)."
      ],
      "round": 2,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
