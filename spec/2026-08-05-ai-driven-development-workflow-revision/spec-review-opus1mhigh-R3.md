Прежде чем оценивать, зафиксирую рамку проверки. Это третья редакция, и она поглотила почти все findings предыдущего раунда: разделены release trains, выбран host-model для Omnigent, добавлены §6.3 (context/cache матрица с recommendation/fallback), §7.5 (restart base recovery), §12.6 (сходимость fix-loop), §12.7 (эфемерные reviewers), §14.3 (определение knowledge sync), §14.2 (оба E2E layout), §18.2 (optimistic CAS), §19 (human attention), §23 (удалён handoff), §24 (state-origin audit). Повторять закрытое бессмысленно — ценность даёт только проверка нового. Поэтому я снова опирался на живые probes: `herdr pane|agent|terminal|api` и полный socket schema (`herdr api schema --json`), `codex/claude/opencode --help`, `omnigent run|session export|resume|attach --help`, `apm install --help` (0.27.0). Две проверки оказались решающими и разнонаправленными: заявленный distribution-контракт подтвердился дословно, а обязательный retrieval-контракт опирается на surface, которого в Herdr 0.8.0 нет.

## Facts & Constraints (White Hat)

**Проверено и подтверждено (эти пункты я специально пытался опровергнуть и не смог).**

- `apm install ./dist --skill mo-herdr --target agent-skills` — валиден: в apm 0.27.0 есть `--skill NAME` («Install only named skill(s) from a SKILL_BUNDLE. Repeatable»), есть `-t/--target` со значением `agent-skills`, и `apm install` документирован как поддерживающий «Claude skills (SKILL.md)» и авто-создание `apm.yml` в потребляющем проекте. Отказ от source `apm.yml` (§28, ledger) не противоречит этому: auto-created manifest живёт у потребителя. Это единственная нормативная CLI-строка спеки, которую я мог проверить полностью, и она верна.
- `codex --no-alt-screen` — «Runs the TUI in inline mode, preserving terminal scrollback history». §10.2 корректен для Codex.
- `herdr agent prompt --wait` — «It does not track turns»; §10.1 воспроизводит это точно.
- Herdr actor regex `[a-z][a-z0-9_-]{0,31}` — §21 совпадает.
- Omnigent 0.6: `run`/`resume`/`attach` — интерактивные REPL-клиенты, `session export --id --output` — единственная неинтерактивная операция, формат ровно как в §11.3 («first line ... `session_meta`; every subsequent line is one conversation item ... preserves full turn order»), `--log` существует и пишет JSON dump в `~/.omnigent/logs/`. §11.1 теперь описывает эту реальность честно, а §11.2 корректно объявляет CLI-only automation недостаточной.
- `claude --help` действительно не имеет `--no-alt-screen`, но имеет `--ax-screen-reader` («Render screen-reader friendly output») — это и есть тот самый неназванный «qualified accessibility mode» из §10.2.

**Опровергнуто.**

1. **Herdr-native scroll surface, на котором держится §10.2 шаг 7, в 0.8.0 отсутствует.** Я перебрал все группы: `herdr pane` (list/get/layout/read/split/send-text/send-keys/wait-output/run/…) — команды прокрутки нет; `herdr agent` (read/send-keys/attach/focus/wait/prompt/…) — нет; `herdr terminal` (attach, session control, session observe, title) — нет; top-level — нет. В socket schema (`herdr api schema --json`) есть только **read-only** `PaneScrollInfo {offset_from_bottom, max_offset_from_bottom, viewport_rows}` и событие `pane.scroll_changed` — то есть наблюдение позиции прокрутки, но не управление ею. Единственные способы сдвинуть внутренний TUI — `send-keys`/`send-text` (спека прямо запрещает) или интерактивный `attach` (не скриптуем). Установленный herdr skill подтверждает и физику: «Rows that leave the alternate screen do not enter Herdr's host scrollback, so a larger line count cannot recover them».
2. **Следствие: §1 делает Herdr release недостижимым.** §1 требует «обязательный interactive `herdr agent read`/scroll contract для Claude, Codex и OpenCode»; §10.3 запрещает pane-route удовлетворять acceptance; §12.3 требует двух разных model lineages. Если Claude и OpenCode не получат inline-рендеринг, обе их route → `unavailable`, независимой пары нет, и релиз не наступает никогда. При этом исходная задача (§5) прямо перечисляла «ручное открытие/прочтение session как допустимый fallback» — R3 этот вариант из acceptance убрал.
3. **`Herdr` уже отдаёт сигнал, который спека объявляет недоступным.** §10.4 говорит, что исчерпание окна — это только `inferred`. Но `PaneScrollInfo.max_offset_from_bottom` и `viewport_rows` дают именно позитивное различение «дошли до верха истории» и «история кончилась раньше ответа». Спека этот surface не использует.

## Risks & Failure Modes (Black Hat)

**Critical: единственный acceptance-путь опирается на несуществующую capability и не имеет точки принятия решения.** §32 фиксирует, что провал blocker нельзя закрыть adapter’ом, private transcript, partial PASS или weaker review. Но не сказано, что происходит вместо этого: продукт просто не выпускается. Для пользователя, который явно допускал ручной fallback, это худший исход, чем осознанное ослабление. Нужен именованный escalation: «если провайдер не квалифицируется — спросить пользователя, какой из трёх вариантов принять», а не молчаливый вечный `unsupported`.

**Major: «exactly 32 rendered rows of overlap» — тот самый magic number, который спека сама отвергла.** В Rejected прямо стоит «Fixed 64 KiB handoff limit — unqualified magic number», а в Adopted — «Qualified 32-row unique overlap». Никакой квалификации у 32 нет: число не связано с `viewport_rows` (который Herdr отдаёт), алгоритм становится невыполнимым при viewport < 32 строк, а при типичном viewport 40–50 строк каждый шаг прокрутки продвигает всего 8–18 строк, что делает сбор длинного ответа очень долгим. Двойной стандарт по отношению к 64 KiB.

**Major: `MAX_HANDOFF_BYTES` измеряется один раз, а применяется всегда.** Формула §10.5 включает `target context admission` — величину, которая падает по мере заполнения executor-сессии. Fixture меряет её на свежей сессии; доставка findings происходит в сессию, прожившую всю реализацию. Значит «qualified capacity» может быть превышена молча именно тогда, когда findings длиннее всего. Проверка тремя токенами существует только внутри fixture, а не на каждой доставке.

**Major: §7.4 в текущей формулировке делает большинство реальных проектов `unsupported`.** «Ignored configuration, local databases или caches, способные изменить behavior, очищаются или изолируются до каждого gate. Если их влияние неизвестно, gate unsupported». Влияние `node_modules`, `.venv`, `__pycache__`, `.next`, `target/` в подавляющем большинстве проектов нигде не документировано, то есть формально «неизвестно». Правило нужно инвертировать: стандартные dependency/build caches презюмируются безопасными, а строгое требование действует для состояния, которое проект сам объявил behavior-affecting (локальные БД, snapshot-фикстуры, seeded data).

**Major: §8.2 задаёт правила, которые skill не может обеспечить.** Лимиты «максимум 5 redirects», «2 MiB decompressed», запрет loopback/link-local/private — это контракт HTTP-клиента. Orchestrator же фетчит URL нативным tool своего агента, чей redirect/size/SSRF-профиль он не контролирует и не наблюдает. Обеспечить это можно только собственным fetcher-helper, который по §3 требует proof и которого нет. Сейчас это неисполнимая проза в разделе, который в остальном исполним.

**Medium: §9.2 — взаимодействие «safely stopped» и resume-восстановления goal не разобрано.** Если для Claude pause/clear недоступны, executor-процесс останавливается перед gates. Но §9.2 в qualification включает «resume» с восстановлением active goal. Тогда возобновление сессии для передачи findings может само реактивировать автономную работу ровно в момент, когда candidate должен быть заморожен. Правило «после resume goal должна быть повторно проверена/деактивирована до любого prompt» отсутствует.

**Medium: `modelLineage` избыточен для теста независимости, но обязателен для валидации.** §12.3 требует различия и `modelVendor`, и `modelLineage`; но разные vendor всегда дают разные lineage, так что второй предикат ничего не добавляет к решающему тесту. При этом §18.1 делает `modelLineage` обязательным непустым полем, а авторитетного источника «lineage» ни один native catalog не публикует — значит поле будет заполняться произвольными строками пользователя, и валидация станет ритуальной. Либо определить lineage операционально (и тогда использовать его для same-vendor случая), либо убрать из required.

**Minor:**
- §6.2 вводит собственный capability-harness (`*.test.mts`, `npm run test:capabilities`, Markdown-evidence с frontmatter) в репозитории, из которого удаляется `src/`, но не называет ни test runner (`node:test`? Vitest?), ни tsconfig, ни способ, которым live-TUI fixture получает pane и provider auth. Иронично, что к этому harness не применён собственный §3 proof-шаблон.
- §8.5 последовательные gates × §12.6 до трёх раундов — это QC+smoke+2 review+E2E, повторённые трижды, строго последовательно. Спека честно называет компромисс, но wall-clock цена для крупной feature — часы-сутки, а watchdog только будит orchestrator.
- §21 задаёт слаг для actor names; для ветки `meta-o/<slug>` (§7.1.7) переиспользование того же алгоритма (с его 32-символьным ограничением Herdr) не оговорено.

## Strengths & Benefits (Yellow Hat)

- **Разделение release trains (§1) — правильная и дорогая по самолюбию поправка.** Herdr больше не заложник Omnigent, а `mo-omnigent` честно поставляется как `unsupported` preview.
- **§11.2 — образцовое решение спорного вопроса.** Выбран один host-model (documented public server API), явно отвергнуты два соблазнительных обхода (REPL внутри Herdr и PTY/stdin-драйвер) с указанием причины, и признано, что при провале квалификации ничего не эмулируется.
- **§7.5 закрывает последнюю дыру recovery**: восстановление `BASE_SHA` через `git log --follow` по spec-файлу с тремя проверяемыми признаками первого spec-commit — это детерминированная процедура, а не эвристика, и она честно запрещает угадывание.
- **§12.6 и §12.4** решают две противоположные патологии review: бесконечное расширение scope и сокрытие дефекта под `minor`. Формулировка «severity не позволяет скрыть defect» с перечнем невозможных для PASS категорий — сильная и проверяемая.
- **§6.3** наконец даёт то, что задача требовала в §4.2: матрицу по backend×harness с `available/inferred/unavailable`, плюс операционную политику resume/compact/fresh и явное «cache/TTL никогда не угадываются по elapsed time».
- **§18.2 optimistic CAS** — редкий случай честной формулировки: описан алгоритм, сказано, что это compare-and-swap, а не сериализация, и явно запрещено удалять чужие orphan temp-файлы.
- **§24 state-origin audit** отвечает ровно на вопрос задачи «зачем это было введено и что теряется» построчно — этого не было ни в одной предыдущей редакции.
- **§19** превращает принцип «время человека дороже токенов» в проверяемый список из двух колонок, а не в лозунг.
- **§23 удаляет handoff** с аргументом «новый summary создаст ещё один потенциально устаревший источник» — последний неклассифицированный компонент из требуемого аудита закрыт.

## Alternatives & Creative Ideas (Green Hat)

1. **Использовать `PaneScrollInfo` как позитивное доказательство границы.** `offset_from_bottom`, `max_offset_from_bottom`, `viewport_rows` доступны через socket API и дают именно то, чего §10.4 объявляет недостающим: различение «история исчерпана» и «мы у верхней границы». Это устраняет и magic-32 (overlap выводится из `viewport_rows`), и запрет на вывод полноты из исчерпания окна.
2. **Назвать конкретные inline-кандидаты для Phase 0A**: Codex — `--no-alt-screen` (подтверждён); Claude — `--ax-screen-reader` (существует локально, надо проверить, даёт ли он inline-историю); OpenCode — известного флага нет, следовательно это наиболее вероятный блокер, и по нему нужно решение пользователя заранее, а не по факту провала.
3. **Ввести именованную точку эскалации вместо вечного `unsupported`**: при провале провайдера orchestrator предъявляет пользователю три опции — принять pane-route как acceptance для этого провайдера, принять документированный ручной read (что задача разрешала), либо исключить провайдера из пары. Это сохраняет fail-closed поведение и при этом не делает продукт невыпускаемым.
4. **Проверять capacity на каждой доставке, а не на fixture.** Дешёвый вариант: в конце каждого крупного handoff просить target вернуть длину полученного текста и три токена. Это один короткий turn против риска молчаливой потери findings.
5. **Инвертировать §7.4**: список «ignored paths, влияющих на поведение» объявляет проект (в `AGENTS.md` или `mo-setup`), всё остальное презюмируется нейтральным. Тогда правило защищает от реального риска (локальная БД, seeded fixtures), а не блокирует любой Node/Python-репозиторий.
6. **Свести §8.2 к тому, что реально проверяемо**: HTTPS-only, никаких ambient credentials, обязательная фиксация final URL и извлечённого текста в tracked spec, `needs_attention` при любой неопределённости. Численные лимиты оставить как рекомендацию host-инструменту, а не как контракт skill.

## Completeness & Process (Blue Hat)

Требования задачи к итоговому документу теперь закрыты практически полностью: три уровня (§3), goal lifecycle (§9), reuse (§13), отсутствие executor skill + карта переноса (§23), standalone review (§12), модели (§18), retrieval (§10.2–10.5), task runner (§14.1), три формы E2E и оба layout (§14.2, §17), review/E2E lifecycle и защита от разных ревизий (§7–§8), recovery (§7.5, §21), knowledge layout и sync (§14.2–14.3), instruction contract (§14.4), purpose/GRACE (§16), watchdog (§20), context/cache (§6.3), PATH (§14.5), reflection и durable rationale (§22), QC profiles (§15), distribution (§28), tooling audit (§25), migration (§29), ledger (§31), pre-mortem (§27). Плюс сверх задачи — §24 state-origin audit и §19 attention policy.

Остаточные процессные пробелы:

- нет описания того, **что делает пользователь и проект, если Phase 0A не закрывает retrieval** (см. Critical);
- **§6.2 harness** не имеет технического стека и потому не является исполняемой задачей;
- **acceptance criterion #22** («Both E2E documentation layouts work») не сопровождается fixture, в отличие от QC-профилей (§15.4) и Herdr (§10.6) — единственный acceptance-пункт без проверяющего механизма;
- цена sequential×3 нигде не оценена численно, хотя §19 обещает, что долгие waits автономны.

## Traceability

Ledger есть, он самый полный из трёх редакций, и прямая трассируемость почти безупречна. Я сверил каждую adopted-строку с телом: независимые release trains → §1; mandatory agent-read → §10.2; pane supplemental → §10.3; merge-base rule → §7.2; freeze → §7.4; ignored-state cleanup → §7.4; sequential gates → §8.5; branch `meta-o/<slug>` → §7.1; два E2E layout → §14.2; knowledge sync → §14.3; `mo-review` требует backend → §12.1; override перед discovery → §12.1; lineage → §12.3; inline Codex → §10.2; 32-row overlap → §10.2; positive upper boundary → §10.4; derived capacity → §10.5; direct-argv → §10.5; bounded loops → §10.4/§12.6; strict minor policy → §12.4; Omnigent server API → §11.2; export+log → §11.3; goal до candidate → §9; narrow `models.json` → §18; extended route identity → §18/§12.3; optimistic CAS → §18.2; wake watchdog → §20; bare APM/skills → §28; canonical copy → §4/§28; private-by-default reuse → §13.1; offline incomplete → §13.2; URL ingestion → §8.2; subagents → §12.7; TS profile с сохранением версии → §15.2; `eslint-plugin-boundaries` → §15.2; class size как lens → §15.2; actor names → §21; capability matrix → §6.1; fixture package → §6.2; subscription-first → §6.4; informational E2E exit 0 → §17; attention policy → §19; self-hosting → §14.6; handoff удалён → §23/§25; helper proof → §3/§20. Rejected и Deferred также все находят опору в теле — включая ранее «висевшие» global architecture hygiene (§14.4) и spec retirement (§22).

Обратные пробелы (решения тела без записи в ledger):

- **§7.5 restart base recovery** — существенный алгоритм идентификации первого spec-commit, нигде в ledger;
- **§6.3 практическая политика resume/compact/fresh** — в ledger есть только «cache economics deferred», но не сама принятая политика;
- §18.1 required-fields validation и §12.1 правило «оба backend доступны → `needs_attention`» тоже не отражены.

## Decomposition Readiness

Готовы к прямой нарезке: §7 целиком (все команды выписаны), §12.1–12.6, §13, §14, §15, §17, §18 (включая пошаговый CAS), §20, §21, §22, §23, §25, §28.

Не готовы:

1. **§10.2 шаги 7–11** — предполагают surface, которого нет; исполнитель будет вынужден либо изобретать (send-keys — запрещено), либо остановиться.
2. **§6.2** — harness без стека: выбор runner, tsconfig, способ получения живых panes/auth остаются за исполнителем.
3. **§8.2** — исполнитель должен решить, кто фетчит и чем обеспечиваются лимиты.
4. **§11.2** — корректно помечен как qualification-gated, но именно поэтому не декомпозируется до Phase 0B PASS (это осознанно и приемлемо).

## Weak-Model Executability

Уровень заметно выше предыдущей редакции: §7.2/§7.3/§7.4/§7.5 дают точные команды с флагами; §18.2 — восемь пронумерованных шагов; §20 — сигнатуру и коды выхода; §21 — алгоритм имени; §15.2 — конкретные плагины, пороги и требование, чтобы JSDoc-конфиг принимался только если overload-фикстуры падают без документации; §28 — дословные install-команды (проверены).

Догадки останутся в: «qualified Herdr-native scroll surface» (не существует и не назван); «qualified accessibility/inline modes» для Claude/OpenCode (флаг не назван, хотя `--ax-screen-reader` есть); «structured direct-argv/process API» (какой именно surface у host-агента им является — не сказано, а §10.5 прямо признаёт, что shell-строка не годится); «documented native compact command» (§6.3); «modelLineage» (нет определения); test runner в §6.2.

## Contract Completeness

Схемы и лимиты в основном конкретны: `models.json` + правила валидации и персистенции, route identity JSON, verdict-шаблоны, exit codes fixture-runner и watchdog, пороги TS, границы reuse, URL-лимиты, capacity-формула, budget попыток, 3 раунда fix-loop, пороги выбора E2E layout (>5 сценариев, >2 environment classes). `TBD` вне §32 я не нашёл; §32 корректно ограничен внешними qualification blockers.

Незакрытые контракты: scroll surface (§10.2), overlap как функция viewport (§10.2), per-delivery capacity (§10.5), презумпция для ignored state (§7.4), исполнитель URL-политики (§8.2), стек fixture-harness (§6.2), определение `modelLineage` (§12.3/§18.1), поведение goal после resume у Claude (§9.2), fixture для acceptance #22.

---

Итог: это лучшая из трёх редакций и, за одним исключением, документ, который можно отдавать в работу. Я пытался сломать Git-контракт, freeze, fix-convergence, CAS-персистенцию, distribution-команды и Omnigent-раздел — и не смог: `apm --skill/--target` подтвердился дословно, Omnigent-реальность описана точнее, чем в его собственном README-стиле help, а §7 и §12 закрывают ранее найденные дыры. Сломалось ровно одно, но центральное: обязательный acceptance-путь §10.2 требует Herdr-native scroll surface, которого в 0.8.0 нет ни в одной команде и который в socket API представлен только read-only состоянием; вместе с §1 (все три провайдера обязательны), §10.3 (pane-route не засчитывается) и удалённым ручным fallback это делает Herdr release структурно недостижимым без решения пользователя, которое спека не предусматривает. Плюс четыре локальные, но реальные поправки: magic-32 overlap, capacity, измеренная один раз, слишком строгое правило ignored state и неисполнимая URL-политика.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 7,
      "would_adopt": true,
      "summary": "Третья редакция закрывает почти всё, что оставалось: разделены Herdr/Omnigent release trains, выбран и обоснован host-model для Omnigent с явным отказом от REPL-в-Herdr и PTY-адаптера, добавлены детерминированное восстановление BASE_SHA через git log --follow, сходимость fix-loop в три раунда, строгая политика minor, определение knowledge sync, оба E2E layout с порогом выбора, optimistic CAS для models.json, state-origin audit и human-attention policy. Живые probes подтвердили ключевые внешние утверждения: apm 0.27.0 действительно имеет --skill NAME и -t agent-skills, codex --no-alt-screen существует, Omnigent 0.6 действительно REPL-only с единственной неинтерактивной session export и записью формата session_meta/item, herdr agent prompt --wait не отслеживает turn. Однако центральный acceptance-путь сломан фактами: §10.2 шаг 7 требует «qualified Herdr-native scroll surface», которого в Herdr 0.8.0 нет ни в pane, ни в agent, ни в terminal, ни в top-level, а socket schema отдаёт только read-only PaneScrollInfo (offset_from_bottom, max_offset_from_bottom, viewport_rows) и событие pane.scroll_changed; вместе с §1 (обязательный interactive agent-read для Claude, Codex и OpenCode), §10.3 (pane-route не удовлетворяет acceptance) и удалением разрешённого задачей ручного fallback это делает Herdr release недостижимым, а §32 не задаёт точки эскалации к пользователю. Дополнительно: «exactly 32 rendered rows of overlap» — тот самый unqualified magic number, который спека сама отвергла в случае 64 KiB, и он игнорирует уже доступный viewport_rows; MAX_HANDOFF_BYTES включает target context admission, но измеряется один раз на свежей сессии и применяется к executor-сессии с почти полным контекстом; §7.4 в формулировке «если влияние ignored state неизвестно — gate unsupported» делает unsupported практически любой Node/Python-репозиторий; §8.2 задаёт лимиты HTTP-клиента, которые skill не контролирует, поскольку фетчит нативный tool агента.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "§10.2 / §1 / §32 — обязательный retrieval-путь",
          "description": "§10.2 шаг 7 опирается на «qualified Herdr-native scroll surface that does not send keys into agent input». В Herdr 0.8.0 такой команды нет: проверены группы pane (list/get/layout/read/split/send-text/send-keys/wait-output/run/…), agent (read/send-keys/attach/focus/wait/prompt), terminal (attach, session control, session observe, title) и top-level; socket schema содержит только read-only PaneScrollInfo и событие pane.scroll_changed, то есть наблюдение позиции, но не управление. Единственные способы сдвинуть внутренний TUI — send-keys (запрещено спекой) или интерактивный attach (не скриптуем). Поскольку §1 требует mandatory interactive agent-read для Claude, Codex и OpenCode, §10.3 запрещает pane-route удовлетворять acceptance, а §12.3 требует двух разных lineages, провал Claude и OpenCode одновременно делает Herdr release недостижимым. При этом исходная задача §5 прямо допускала «ручное открытие/прочтение session как допустимый fallback», и R3 этот вариант из acceptance убрал; §32 фиксирует только запреты, не описывая, что происходит вместо релиза.",
          "required_change": "1) Явно назвать кандидатов inline-режима для Phase 0A: Codex --no-alt-screen (подтверждён), Claude --ax-screen-reader (существует локально), для OpenCode честно зафиксировать отсутствие известного флага. 2) Убрать опору на несуществующий scroll surface: либо ограничить acceptance теми провайдерами, у которых история попадает в host scrollback, либо использовать read-only PaneScrollInfo как доказательство границы. 3) Добавить именованную точку эскалации: при невозможности квалифицировать провайдера orchestrator предъявляет пользователю выбор (принять pane-route для этого провайдера, принять документированный ручной read, исключить провайдера), вместо бессрочного unsupported."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§10.2 шаг 8 — 32-row overlap",
          "description": "Требование «exactly 32 rendered rows of overlap» — unqualified magic number, ровно того класса, который спека отвергает в Rejected («Fixed 64 KiB handoff limit — unqualified magic number»). Число не связано с высотой viewport, делает алгоритм невыполнимым при viewport < 32 строк и при типичных 40–50 строках оставляет всего 8–18 строк продвижения за шаг. При этом Herdr уже отдаёт viewport_rows, max_offset_from_bottom и offset_from_bottom, из которых overlap и признак достижения верха выводятся объективно.",
          "required_change": "Вывести overlap из наблюдаемого viewport_rows (например, не менее четверти viewport и не менее фиксированного минимума), а исчерпание истории и достижение верхней границы доказывать через offset_from_bottom/max_offset_from_bottom, а не через фиксированную константу."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§10.5 — capacity измеряется один раз",
          "description": "Формула MAX_HANDOFF_BYTES включает target context admission — величину, убывающую по мере заполнения executor-сессии. Fixture измеряет её на свежей сессии, а доставка findings происходит в сессию, прожившую всю реализацию, то есть именно тогда, когда риск молчаливого усечения максимален. Проверка тремя уникальными токенами описана как fixture, а не как процедура каждой доставки.",
          "required_change": "Сделать проверку доставки процедурой runtime, а не только fixture: после каждой крупной передачи findings target обязан вернуть три токена и длину полученного текста; при несовпадении — needs_attention. Либо явно ограничить применимость измеренной capacity свежими сессиями и требовать fresh actor при превышении."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§7.4 — правило ignored state",
          "description": "«Ignored configuration, local databases или caches, способные изменить behavior, очищаются или изолируются до каждого gate. Если их влияние неизвестно, gate unsupported» — в реальных проектах влияние node_modules, .venv, __pycache__, .next, target/ нигде не документировано, то есть формально неизвестно. Буквальное применение делает unsupported практически любой репозиторий и обесценивает весь freeze-контракт.",
          "required_change": "Инвертировать презумпцию: стандартные dependency/build caches считаются нейтральными по умолчанию; строгое требование очистки/изоляции применяется к состоянию, которое проект явно объявил behavior-affecting (локальные БД, seeded fixtures, snapshot-хранилища) в AGENTS.md или через mo-setup."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§8.2 — неисполнимая URL-политика",
          "description": "Лимиты «максимум 5 redirects», «2 MiB decompressed», «10 MiB PDF», запрет loopback/link-local/private — это контракт HTTP-клиента. Orchestrator получает URL через нативный fetch-tool своего агента, чей redirect/size/SSRF-профиль он не задаёт и не наблюдает. Обеспечить эти лимиты можно только собственным fetcher-helper, который по §3 требует proof и в спеке отсутствует.",
          "required_change": "Указать, какой surface выполняет загрузку, и разделить требования на проверяемые (HTTPS-only, отсутствие ambient credentials, фиксация final URL и извлечённого текста, needs_attention при любой неопределённости) и рекомендательные для host-инструмента; либо обосновать fetcher-helper по §3."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§9.2 — goal после resume у Claude",
          "description": "Если pause/clear недоступны, executor-сессия «safely stopped» перед gates, но qualification §9.2 включает resume с восстановлением active goal. Возобновление сессии для передачи findings может реактивировать автономную работу в момент, когда candidate должен быть заморожен. Правило повторной проверки/деактивации goal сразу после resume отсутствует.",
          "required_change": "Добавить правило: после любого resume executor-сессии goal-состояние проверяется заново и деактивируется до отправки первого prompt; недоказуемая деактивация после resume делает route unsupported для frozen lifecycle."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§12.3 / §18.1 — modelLineage",
          "description": "Независимость требует различия и modelVendor, и modelLineage, но разные vendor всегда дают разные lineage, поэтому второй предикат ничего не добавляет к решающему тесту. При этом §18.1 делает modelLineage обязательным непустым полем, а authoritative-источника «lineage» ни один native catalog не публикует — поле будет заполняться произвольными строками.",
          "required_change": "Либо дать операциональное определение lineage и использовать его для same-vendor случая (два маршрута одного vendor), либо убрать его из обязательных полей валидации и оставить как optional hint."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§6.2 — стек capability-harness",
          "description": "Введены tests/capabilities/*.test.mts и npm run test:capabilities в репозитории, из которого удаляется src/, но не назван test runner, tsconfig, package.json-контракт и способ, которым live-TUI fixture получает pane, HERDR_ENV и provider auth. К самому harness не применён §3 proof-шаблон, хотя он является новым исполняемым инструментом.",
          "required_change": "Назвать runner и минимальный build-контракт fixture-пакета, описать требования к окружению для live-фикстур и добавить короткий §3 proof для harness как для любого нового исполняемого компонента."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Traceability — решения тела без ledger",
          "description": "В ledger отсутствуют: §7.5 restart base recovery (алгоритм идентификации первого spec-commit по git log --follow и трём признакам), §6.3 положительная политика resume/compact/fresh, §18.1 обязательные поля валидации route, §12.1 правило «оба backend доступны → needs_attention».",
          "required_change": "Добавить перечисленные решения в Adopted с rationale и source, чтобы реализация не могла изменить их бесшумно."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "§30 acceptance #22",
          "description": "«Both E2E documentation layouts work» — единственный acceptance-пункт без проверяющего fixture, в отличие от §10.6 и §15.4."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§8.5 + §12.6 — wall-clock цена",
          "description": "Строго последовательные gates, повторяемые до трёх раундов, дают часы-сутки на крупной feature; спека честно называет компромисс, но численной оценки и рекомендаций по autonomous overnight run не даёт."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§7.1.7 vs §21",
          "description": "Ветка meta-o/<slug> не оговаривает, используется ли тот же slug-алгоритм, что и для Herdr actor names, включая 32-символьное ограничение и hash-суффикс."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§28 — распознавание SKILL_BUNDLE",
          "description": "apm --skill NAME подтверждён и работает «from a SKILL_BUNDLE»; не проверено, распознаёт ли apm корнем бандла ./dist или ожидает ./dist/skills. Phase 0A пункт 10 это покрывает, но стоит зафиксировать ожидаемый корень явно."
        }
      ],
      "assumptions": [
        "Проверял установленные локально версии: herdr 0.8.0 (включая полный socket schema через herdr api schema --json), omnigent 0.6.0, apm 0.27.0, claude/codex/opencode из PATH пользователя; выводы об отсутствующих surfaces относятся именно к этим версиям.",
        "WebFetch к docs Claude /goal, Codex goals, Oxlint и vercel-labs/skills не выполнялся; ни один blocking finding на них не опирается — все основаны на локальных probes либо на внутренних противоречиях документа.",
        "Формулировку задачи §5 («ручное открытие/прочтение session как допустимый fallback») считаю действующей, поскольку superseding addendum ограничивает интерфейс извлечения, но не отменяет допустимость ручного участия.",
        "Раздел «Требования к итоговой спецификации» трактую как обязательный чек-лист полноты; по нему R3 закрыт полностью, поэтому findings касаются исполнимости, а не отсутствующих разделов."
      ],
      "round": 3,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: true
