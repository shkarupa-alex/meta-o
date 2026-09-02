# Программа спецификаций для обнуления backlog Meta-O

## 0. Ограничения, в которых существует решение

Прежде чем предлагать декомпозицию, надо назвать рамки, потому что почти каждый естественный ответ здесь запрещён верхним уровнем. Иерархия жёсткая и не обсуждается: `docs/business.md` → `docs/architecture/` → реализация, и нижний слой не может переопределить верхний. §A-ORCHESTRATION-01 запрещает workflow engine, run registry, adapter, provider proxy и persisted orchestration state; AGENTS.md запрещает manifest/receipt/digest/baseline без названного внешнего потребителя; §B-CONTROL-03 и §B-REVIEW-03 прямо запрещают заменять суждение счётчиками раундов, а `methodology.md` §5 повторяет это дословно («use judgment rather than finding IDs, round caps or retry counters»). Одновременно ledger реальных запусков примерно наполовину состоит из дефектов чужого инструмента, а §B-PORTABILITY-06 требует, чтобы дефект третьего инструмента становился **issue наверх, а не обходом у себя** — то есть отправка issue является обязанностью, а не украшением. И §A-RESPONSE-01 требует, чтобы settled final response брался с публичной поверхности backend, а не собирался из побочных наблюдений.

Из этого следует, что программа не может быть «списком улучшений». Она обязана быть **переадресацией**: у каждой записи backlog и каждого уникального наблюдения ledger должен появиться легитимный носитель из числа уже существующих в проекте, и способ проверить, что носитель работает. Причём носителем может быть только **положительный инвариант собственного поведения Meta-O**, а не эвристика, компенсирующая чужой дефект. Ниже — доктрина закрытия в этой строгой форме, полная опись, десять спецификаций, отдельные дизайны `find-reuse` и review-архитектуры, решение по Orca-оркестрации, очерёдность, интерфейсы, компромиссы, риски, отклонённые варианты и машинно-проверяемый DoD.

Пометки статуса: **[Т]** — установленное требование (business/architecture/прямое указание пользователя); **[В]** — вывод из evidence (ledger или исследования); **[Г]** — проверяемая гипотеза, не факт.

---

## 1. Высокоуровневый подход

Программа сводит ~160 разрозненных записей `docs/backlog.md` и `docs/backlog-issues-real-runs.md` к одиннадцати root causes и оформляет их в десять независимо реализуемых спецификаций, разделённых по владельцу знания: три переносимых skill без методологической связности (`find-reuse`, `review-core`, интеграция уже существующих `senior-python`/`senior-jsts`), четыре контракта оркестрации внутри `shared/references/`, два набора машинных гейтов и один предзарегистрированный эксперимент, переводящий спорные review-гипотезы в записанные решения. Пункт, рождённый чужим дефектом, закрывается только положительным инвариантом собственного поведения Meta-O — прежде всего инвариантом честной деградации «нечитаемое состояние не превращается в вердикт», — при обязательном issue наверх и при явном запрете тестам и E2E опираться на любую эвристику-компенсацию. Никакого workflow engine, state store, findings.json или run registry не появляется: единственные новые «состояния» — сохранённый wall-clock timestamp последней проверки внутри живого turn и advisory-lock вокруг полного QC, оба с названными потребителями и оба не переживающие запуск.

---

## 2. Доктрина закрытия

Прошлая редакция допускала два послабления, и оба были справедливо отвергнуты: «upstream-issue + записанная граница» как самостоятельное закрытие, а затем — «постоянное правило» в формулировке настолько широкой, что под неё подпадала любая устойчивая эвристика. Ниже доктрина в строгой форме.

### 2.1. Три типа закрытия

| Тип | Что это | Чем доказывается |
|---|---|---|
| **C1 — детерминированное** | строка в `docs/acceptance.md`, чьё доказательство — именованный тест внутри `make mo-qc` | зелёный гейт на финальном SHA |
| **C2 — live** | строка в `docs/acceptance.md`, чьё доказательство — именованный сценарий `docs/e2e.md` | выполненный сценарий на одном замороженном SHA |
| **C3 — записанное решение** | `§A-*`, которое пункт реализует **или явно отклоняет с причиной и последствием отмены**; частный случай — объявление возможности backend неподдержанной | резолвящаяся ссылка + проверка цепочки знаний |

### 2.2. Четыре вопроса, через которые проходит каждый пункт, рождённый чужим дефектом [Т]

**Q1 — инвариантность.** Носитель закрытия обязан быть правилом о том, **что делает сама Meta-O**, сформулированным без упоминания конкретного дефекта, и сохраняемым дословно, если дефект починят завтра. Только такое правило закрывает пункт.

**Q2 — тест на акселератор.** Любая проба, эвристика или косвенное чтение, восстанавливающие состояние, которое backend отказывается публиковать, — это **акселератор**. Акселератор разрешён и документируется, но:
- живёт в отдельном разделе `## Diagnostic accelerators (non-normative)` файла `orca-mechanics.md`;
- **ни один тест, ни один сценарий E2E, ни одна строка `docs/acceptance.md` не имеет права на него ссылаться**;
- его удаление не должно менять ни одного контракта и ни одного зелёного гейта.
Акселератор не закрывает ничего. Он только ускоряет диагностику человека и агента.

**Q3 — обязанность наверх.** §B-PORTABILITY-06 делает отправку issue наверх **обязательной** для каждой записанной границы, а не опциональной. Строка `docs/backend-capabilities.md` без ссылки наверх считается неполной и роняет гейт. Ссылка при этом **не является доказательством закрытия** — это две независимые вещи: issue обязателен и недостаточен. Если у продукта нет публичного трекера, строка несёт литерал `no-public-tracker: <как сообщено и кому>` — отсутствие канала тоже факт, который записывается один раз.

**Q4 — остаток.** Если положительный инвариант написать невозможно, есть ровно два честных исхода: (а) возможность объявляется **неподдержанной** в `docs/backend-capabilities.md` решением `§A-*` (это C3 — продуктовое решение, а не недоделка), либо (б) пункт **остаётся в backlog** с причиной, практическим влиянием и следующим шагом по §B-LONGEVITY-04. Программа не имеет права выдать (б) за закрытие, и DoD это ловит структурно.

### 2.3. Главный инвариант, закрывающий весь класс «backend не публикует состояние»

> **Честная деградация.** Состояние, которое нельзя прочитать на публичной поверхности backend, **не превращается в вердикт**. Meta-O выдаёт `unknown` / `needs_attention`, удерживает сессии и роли, не освобождает и не пересоздаёт ресурсы, и предъявляет человеку, что именно осталось непрочитанным. Ожидание не заканчивается по догадке.

Это не компенсация: правило существовало бы и при идеальном backend (`methodology.md` уже говорит, что нечитаемый вердикт — `unknown`), оно формулируется без упоминания Orca, и оно сохранится дословно после любой починки. Именно оно, а не лестница проб, закрывает quota, refusal, reconnect, compaction и потерю pane.

### 2.4. Повторная проверка всех Orca-дефектов по строгому тесту

| Дефект | Носитель закрытия — положительный инвариант Meta-O | Что здесь акселератор (ничего не закрывает) | Исход |
|---|---|---|---|
| `worktree create` / `worker-start` / `send` / `terminal close` / `worker-release` дают квитанцию без эффекта | эффект команды, меняющей состояние, подтверждается независимым чтением на **другой** публичной поверхности прежде, чем шаг считается выполненным | — | закрыт C1+C2 (§A-BACKEND-02, B22) |
| `--types` не фильтрует | клиент классифицирует каждое сообщение батча сам; серверный фильтр — только оптимизация, на которую нельзя опираться | — | закрыт C1 |
| формы CLI (`ack`, `dispatch-show`, `terminals`, `--type`) | форма команды берётся из `--help` **до** первого применения; диагностические вызовы не сцепляются через `&&`, чтобы одна ошибка не скрывала остальные результаты | сам реестр точных форм в `papercut.md` — справочник, способный устареть; на него не ссылается ни один тест | закрыт C1 (дисциплина проверяется по текстам контрактов) |
| quota / refusal / reconnect / compaction не типизированы | **честная деградация** (§2.3) + запрет заканчивать ожидание по догадке + удержание горячих сессий до явного исхода | лестница проб (`account list`, tail терминала, `orca status`) — **акселератор**, вынесен в non-normative раздел | закрыт C2 (B17 проверяет деградацию, а не лестницу) |
| `worker-retain` → `dispatch_not_found` | удержание роли выражается **отрицательным действием**: пока цикл открыт, роль не освобождается и не закрывается; отсутствие подтверждающего API ничего не меняет | — | закрыт C1+C2 (B21) |
| `dispatch_capability_invalid`: тело доставлено с служебным префиксом | **изменено против прошлой редакции:** gate-проходящим артефактом является только settled response, принятый backend. Отклонённая доставка — это `UNKNOWN`; вердикт запрашивается заново тем же путём у той же горячей сессии; если валидного пути нет — `needs_attention`. Доставленный с префиксом текст показывается человеку **только как диагностика** и не заменяет ответ | распознавание префикса `Original body:` — диагностический разбор | закрыт C2 (B24) |
| потеря coordinator pane → `stable_pane_required` | честная деградация + правило, что оркестрация без управляемой поверхности не продолжается вслепую; результаты worker остаются read-only, человек поднимает новый Run | read-only `run-show`/`worker-show` как способ увидеть остаток | закрыт C2 (B21) |
| bare shell принимает task и порождает ложный `worker_done` | lifecycle-сообщение доверяется только после независимого подтверждения, что назначенный harness действительно работает в этой сессии; иначе сообщение void | конкретные строки распознавания TUI | закрыт C1+C2 (B15) |
| дублирование posture-флага | **это дефект окружения, а не Orca**, и он чинится нами: `mo-setup` приводит окружение к состоянию «ровно один флаг», skills не передают posture вообще | запись PATH-ловушки в `papercut.md` | закрыт C1 |

Ни один пункт не закрывается эвристикой, ни один не закрывается ссылкой наверх, и при этом ни один не обязан остаться в backlog — потому что для каждого нашёлся положительный инвариант. **[В]**

---

## 3. Lossless inventory

### 3.1. Легенда ledger

`docs/backlog-issues-real-runs.md` не имеет собственных id; ввожу устойчивые коды по разделам файла (они живут только на время программы и умирают вместе со спеками).

| Код | Раздел | Код | Раздел |
|---|---|---|---|
| R-A | `2026-08-24 Marta Eval` (33 наблюдения) | R-Q | Claude subscription limit виден только в TUI |
| R-B | Неопределённость каналов вопросов worker→orchestrator | R-R | `--type normal` / `coordinator_guidance` → `Invalid input` |
| R-C | Оркестратор не заметил завершившегося idle executor | R-S | Follow-up создан, но worker settled не потребив |
| R-D | Оркестратор исполнил работу локально вместо управления | R-T | Executor использовал вымышленный полный SHA |
| R-E | Прямой ввод пользователя загрязнил роль executor | R-U | Загрязнение QC фоновым и конкурентным `make check` |
| R-F | Executor закрыт после QC вопреки ожиданию горячей сессии | R-V | `worker_done` расходится с `reportPath`, повреждён shell |
| R-G | Остановка review-loop принята за завершение спеки | R-W | Codex завис в `Reconnecting…` |
| R-H | Две Codex resume-вкладки после exit code 2 | R-X | `dispatch-show` не принимает Dispatch ID позиционно |
| R-I | Coordinator снова не подхватил `worker_done` | R-Y | `bx restore BX_FORCE=1` (чужой продукт) |
| R-J | Hot Claude reviewer завис в `dispatched` при quota | R-Z | Live pilot fail-closed: egress mismatch |
| R-K | Повтор ошибки `ack` + `worker-retain` ×8 | R-AA | Blocking wait → `runtime_unavailable` |
| R-L | Неверно сбрасывался лимит review-итераций | R-AB | Infra-blocked фаза помечена `succeeded` |
| R-M | Не замечена auto-compaction reviewer | R-AC | `eval up` выполнил запрещённый echo-canary |
| R-N | Harness неодинаково показывают финальный ответ | R-AD | Переоткрытый duplicate-flag отказ Codex |
| R-O | Safety refusal Codex: input и output blocked | R-AE | Composed `worker-start` → bare shell + фальшивый `worker_done` |
| R-P | Смешаны work packages, slices и gates | R-AF | Потеря Dispatch capability, `worker_done` отклонён но доставлен |
| R-AG | Executor удалил контейнеры соседнего проекта | R-AL | Ложная тревога: heartbeat-порог ≠ каденция Codex |
| R-AH | Слишком широкий запрет заблокировал живой path | R-AM | Монитор не засеивает базовое состояние |
| R-AI | Пропущен durable decision gate (окно inbox уже потока) | R-AN | `latest cursor` не признак жизни TUI |
| R-AJ | ПОВТОР: снова закрыты обе горячие reviewer-вкладки | R-AO | Quota: ни сообщения, ни времени восстановления в Orca |
| R-AK | Свежая Claude TUI стартует с символом `> B` | R-AP | Потеря coordinator pane делает Run неуправляемым |
| | | R-AQ | Recovery одного Claude-review оставил две вкладки |

### 3.2. Карта `docs/backlog.md`

| Запись backlog | Спека | Способ закрытия | Тип |
|---|---|---|---|
| Watchdog с локальной моделью не реализован | S9 | Time-boxed эксперимент с предзарегистрированным правилом; реализация либо §A-WATCHDOG-02 «отклонено, потому что» с числами | C1+C3 |
| Цепочка id проверяется только до уровня модуля | S8 | ESLint plugin `jsdoc` с проектным regex для `.mjs`; для `.sh` — записанное решение «зрелого инструмента нет, символьный уровень остаётся за ревью» | C1+C3 |
| Якоря не снимаются при сборке | S8 | Снятие отклонено: §5 purpose-контракта уже разрешает дословной копии нести id как provenance; поставка без якорей — решение, а не недоделка | C3 |
| Удаление тезиса и переиспользование id гейт не ловит | S8 | Сравнение множеств id на `merge-base(HEAD, develop)` и `HEAD`; исчезнувший id требует `Retires §…: <причина>` в сообщении коммита. Это Git, а не baseline-файл | C1 |
| Реальный запуск mo-review не прошёл с первого раза (+ весь сырой журнал) | S2–S7, S9, S10 | разложено ниже | — |

Подпункты крупной записи (нумерация по порядку в файле):

| # | Суть | Спека |
|---|---|---|
| B5.1 | Claude не прошёл readiness из-за codex-trust-workspace, нужен fallback | S6 |
| B5.2 | Codex dispatch принял текст в shell и «завершился» без review | S6 |
| B5.3 | codex запущен с full access через wrapper | S6 |
| B5.4 | Review-скилл не сказал проверять готовность раз в 5–10 минут | S3+S4 |
| B5.5 | Кодекс-исполнитель не смог поставить ожидание готовности ревьюеров | S4 |
| B5.6 | После финального ответа агент не продолжает цикл автономно | S4 |
| B5.7 | Review-скилл берёт ту же model-настройку, что оркестратор (только review-роли) | S6 |
| B5.8 | Два Клода; потерянный отчёт из временного файла; вкладка после Connection lost | S5+S3 |
| B5.9 | Просить ревьюера сохранить отчёт, а не пересоздавать сессию | S3 |
| B5.10 | Не закрывать всех после ревью; ограниченно-долгоживущие reviewer-сессии | S5 |
| B5.11 | Оркестратор не содержит своих review-инструкций, грузит из mo-review | S3 |
| B5.12 | Запущен opus 4.6 вместо opus 5; модель «на глаз»; профили | S6 |
| B5.13 | Двойной posture-флаг; настраивать через mo-setup; skills не передают ничего | S6 |
| B5.14 | Skills из python/js-ts howto; куда цеплять | **вход существует** (`senior-python`/`senior-jsts`), остаётся интеграция → S2/S3/S7 |
| B5.15 | Спека первым коммитом + короткий чеклист-план; удаление при мерже | S7 |
| B5.16 | В том же коммите извлекать новые бизнес-интенты пропорционально | S7 |
| B5.17 | Открытые вкладки после неудачного запуска; самовольный OpenCode | S5+S6 |
| B5.18 | Замечания с разбивкой по критичности; **3 итерации только с минорными → закончить** | S2 (severity) + **конфликт с §B-REVIEW-03, см. §3.5** |
| B5.19 | Что делает каждый ревьюер; похожие skills; исследования; большой промпт; 4 ревьюера | S2+S3+S10 |
| B5.20 | В коде легитимны только ссылки на бизнес/архитектуру, не на номера замечаний | S8 |
| B5.21 | Исполнитель добивается утвердительного clean-room review до рапорта | S7 (механика) + S10 (окупаемость) |
| B5.22 | Review-скилл грузится сам на общий запрос — так быть не должно | S2 |
| B5.23 | Названия вкладок; не убивать безымянные чужие | S5 |
| B5.24 | Оба ревьюера шлют в Orca и тезисно показывают в TUI по критичности | S3 |
| B5.25 | Codex «Selected model is at capacity» → в watchdog | S9 |
| B5.26 | Указатель на ledger | закрывается вместе с ledger |

### 3.3. Карта ledger по root causes

| RC | Root cause | Наблюдения | Спека | Доказательство |
|---|---|---|---|---|
| **RC1** | Receipt принимается за эффект | R-A#7,8,10,20,21,22; R-C#45,46,47; R-E; R-F(queued); R-K; R-S; R-AE | S4 | §A-BACKEND-02 + E2E B22 + B15 |
| **RC2** | Нет пробуждения, переживающего конец turn; самодельные мониторы откалиброваны неверно | R-C#37,38,39,53; R-I; R-AI; R-AL; R-AM; R-AN; B5.4–B5.6 | S4 | guardrail на `final` + правила валидации признака + E2E B16 |
| **RC3** | Полезное состояние есть в TUI/провайдере, но не проецируется в lifecycle | R-J; R-M; R-O; R-Q; R-W; R-Z; R-AA; R-AF; R-AO; B5.25 | S4+S9 | **инвариант честной деградации** + матрица recovery + E2E B17, B24 |
| **RC4** | Владение сессиями, ролями и правом писать не определено | R-A#23,24,25,32; R-D; R-E; R-F; R-AJ; R-AQ; R-AP; B5.8,10,17,23 | S5 | контракт retention/naming/replacement + E2E B21 |
| **RC5** | Запуск harness и выбор модели строятся на догадке | R-A#12–19,26,27,29,30,31; R-C#48; R-H; R-AD; R-AE; R-AK; B5.1,2,3,7,12,13 | S6 | обязательный catalogue, чтение wrapper, verification gate + E2E B15 |
| **RC6** | Семантика review недоопределена | R-G; R-L; R-N; R-U; R-V; R-C#50,54; B5.9,11,18,19,21,22,24 | S2+S3 | review-core + review-protocol + E2E B18–B20, RV1–RV4 |
| **RC7** | Дисциплина исполнителя: provenance, границы мутаций, outcome, отчётность | R-P; R-T; R-AB; R-AC; R-AG; R-AH; R-AI(ask-timeout); B5.15,16 | S7 | executor-контракт + E2E B23 |
| **RC8** | Цепочка знаний проверяется неполно; ссылки в коде не ограничены | backlog: chain/anchors/deletion; B5.20 | S8 | `knowledge-chain.test.mjs` + eslint |
| **RC9** | Reuse-исследование связано с layout Meta-O, команды абстрактны | §B-FRAMING-04 + новое требование пользователя | S1 | `find-reuse` + тесты покрытия матрицы + E2E RU1 |
| **RC10** | Дефекты CLI/UX Orca и окружения | R-A#1,2,5,11; R-C#43,51,52; R-F#64; R-R; R-X; R-AA | S4 | дисциплина `--help`-перед-формой + записанные границы |
| **RC11** | Дефект чужого продукта в чужом проекте | R-Y (`bxup`) | S7 | извлечённый урок: непроверенный recovery path считается недоказанным и не проверяется впервые в аварийном окне |

### 3.4. Дубли — показаны, distinct evidence сохранён

| Группа | Наблюдения | Уникальное в каждом |
|---|---|---|
| Закрытие горячих reviewer-вкладок | R-C#54, R-AJ | #54 — **причина**: буквальное чтение review-protocol + cleanup-контракта. R-AJ — **рецидив после прочтения файла ошибок** ⇒ нужна обязательная сверка перед разрушающим действием, а не ещё одна формулировка |
| Дублирование posture-флага | R-H, R-AD, R-AE, B5.3, B5.13 | R-H — осиротевшие пустые shell. R-AD — **механизм**: login-shell Orca ставит `~/bin` первым, `run` резолвит `codex` повторно; голая форма тоже падает. R-AE — **последствие**: Orca печатает task в оставшийся shell и принимает его вывод за lifecycle |
| Несуществующая `ack` | R-C#43, R-K | #43 — discoverability. R-K — рецидив + `&&` скрыл остальные результаты ⇒ отдельное правило про диагностику |
| Quota невидима | R-J, R-Q, R-AO, B5.25 | R-J — `dispatched` + `heartbeat: null`, native auto-continue. R-Q — reset-time в TUI и в supervised `worker-read`. R-AO — terminal projection **повреждена**, `worker-read --source terminal` даёт `dispatch_not_found`, зато `orca account list --json` отдаёт `resetsAt`. B5.25 — другой вендор, другая строка, **без** auto-continue |
| Provider refusal | R-O#80,81,82,86 | #80 блокировка до работы; #81 после дорогой работы; #82 нейтральный rephrase **тоже** блокируется; #86 прошёл только строгий строковый шаблон ⇒ порядок recovery обратен интуитивному |
| Пропущенное пробуждение | R-C#37, R-I, R-AI + 4 повтора | последний особенный: координатор знал контракт, обещал не завершать turn и оборвал живой wait на 5.5 минуте ⇒ нужен guardrail, а не правило |
| `worker-retain` → `dispatch_not_found` | R-K ×8 | совокупно: оба вендора, executor и reviewer, substantive и remediation, до и после barrier ⇒ стабильная граница API, не гонка |
| Загрязнение QC | R-U#92,93,94 | #92 самозагрязнение фоном + ложный exit 0; #93 тест падает и при дисциплинированном foreground ⇒ гипотеза «виноват ревьюер» неполна; #94 два независимых ревьюера в одном worktree ⇒ per-worker prompt принципиально не решает |
| `dispatch-show` | R-F#64, R-X | позиционный **task** id против позиционного **ctx** id ⇒ команда task-centric, имя вводит в заблуждение |
| Широкий/узкий запрет | R-AG, R-AH | R-AG: запрет прочитан и нарушен ⇒ нужна машинная граница. R-AH: защита от R-AG сожгла целый dispatch ⇒ граница по **классу операции**, не по имени проекта |

### 3.5. Конфликт слоёв, который нельзя решить в реализации

Две записи требуют числовых порогов в цикле ревью:

- **R-L**: «пользовательский контракт ограничивает одним бюджетом максимум пять циклов review/fix для одного большого функционального куска спеки»;
- **B5.18**: «если прошло 3 итерации, в которых только минорные замечания — можно заканчивать».

§B-REVIEW-03 говорит прямо противоположное: «Противовесом служит целесообразность, а не счётчик раундов… отдельный счётчик не нужен, оркестратор оценивает целесообразность очередного раунда сам». §B-CONTROL-03 — «формализм не заменяет суждение». `methodology.md` §5 повторяет запрет на round caps и retry counters. **Реализация не имеет права переопределить бизнес-слой**, поэтому счётчиков в `shared/references/` быть не может. **[Т]**

| Наблюдение | Что реально было дефектом | Что делает программа |
|---|---|---|
| R-L | Оркестратор **смешал два понятия** и сбрасывал любой бюджет после каждого remediation-коммита; сквозная нумерация раундов маскировала это | Вводится **словарь**, а не счётчик: `substantive slice` и `review remediation` получают определения в глоссарии и в review-протоколе. Remediation по определению не является новой итерацией кодирования. Числовой бюджет конкретного запуска живёт **в задании запуска**, не в skill |
| B5.18 | Это **пожелание изменить бизнес-правило**, а не деталь реализации | (1) вводится словарь severity, благодаря которому «остались только P3» становится **наблюдаемым** фактом, на который §B-REVIEW-03 уже разрешает опереться суждением; (2) формулировка предлагаемой поправки к §B-REVIEW-03 вносится в раздел «открытые решения» спеки S3 |

Готовая формулировка поправки, если владелец решит её принять:

> К §B-REVIEW-03 добавить: «Наблюдаемое условие завершения — состояние, а не счёт: когда оба ревьюера подряд не находят ничего выше `P3`, оставшееся фиксируется списком, и цикл закрывается. Это не лимит раундов, а признак исчерпания.»

Пока поправка не принята, **skill не содержит ни счётчика, ни порога**.

Остальные числа программы:

| Число | Конфликтует? | Почему |
|---|---|---|
| P0–P3 | нет | словарь тяжести, а не счётчик раундов; B5.18 прямо просит «разбивку по критичности, всё ещё текстом»; тот же словарь уже в `senior-python`/`senior-jsts` |
| 10-минутная отсечка, 30 минут «экран не менялся» | нет, но это **умолчания запуска** в run evidence, а не пороги протокола | §B-UPTIME-05: «это не порог в протоколе, а признание того, что ожидание неверного события стоит дороже лишнего чтения» |
| ≤200 строк ядра `review-core` | нет | §B-LONGEVITY-02: границы проверяются машинно; packaging-граница, а не поведение цикла |
| пороги решения S10 | нет | правило принятия **одноразового эксперимента**; в runtime не попадает ни одно число — только выбранная конфигурация |

---

## 4. Декомпозиция: десять спецификаций

| ID | Название | Цель одной фразой | Зависит от | Волна |
|---|---|---|---|---|
| S1 | `find-reuse` | переносимое исследование готовых решений, независимое от Meta-O | — | 0 |
| S2 | `review-core` | переносимое ядро код-ревью: стадии, evidence-стандарт, routing рисков | — | 0 |
| S6 | launch-and-route-readiness | доказанный запуск harness с точной моделью и posture | — | 0 |
| S8 | knowledge-gates | символьная цепочка, якоря, удаление id, ссылки в коде | — | 0 |
| S4 | orca-supervision | пробуждение, «receipt ≠ эффект», честная деградация, recovery | S6 | 1 |
| S5 | session-and-role-ownership | именование, retention, замена, авторитет роли, канал вопросов | S4 | 2 |
| S9 | watchdog-extension | новые паттерны, честная доставка nudge, решение по локальной модели | S4 | 2 |
| S3 | review-orchestration | lifecycle-политика ревью поверх S2 | S2,S4,S5 | 3 |
| S7 | executor-contract | спека-первым-коммитом, provenance, границы мутаций, outcome | S2,S4 | 3 |
| S10 | review-evaluation | предзарегистрированный эксперимент по спорным гипотезам | S2,S3 | 4 |

### S1 — `find-reuse`

**Цель.** Переименовать `mo-reuse` → `find-reuse` и сделать пригодным вне Meta-O: skill получает generic бизнес-требования и контекст задачи, возвращает решение и отчёт, ничего не знает про `docs/business.md`, `docs/acceptance.md` и spec-layout.
**Границы.** Владеет форматом входа/выхода, процессом, источниками, командами, auth-пробами, обогащением, дедупликацией и собственными quality gates. Не владеет: моментом вызова, сбором контекста из проекта, местом записи результата, git-коммитом.
**Владелец истины.** `src/skills/find-reuse/SKILL.md` + `references/`. Внешний контракт — одна секция `shared/references/methodology.md`.
**Миграция.** `mo-reuse` удаляется в том же изменении; `README.md:57`, `tests/build-skills.test.mjs`, `tests/install.test.mjs`, `src/skills/mo-setup/references/qc-python.md` правятся одним коммитом. **Обязательная часть миграции:** две записи, которые сейчас делает `mo-reuse` — дословная бизнес-постановка и создание спеки — переносятся **в** методологию Meta-O, иначе §B-FRAMING-01 потеряет носителя вместе со skill.
**Тесты/E2E.** C1: в тексте skill нет ни одного Meta-O-специфичного пути/термина (`docs/business.md`, `spec/`, `§B-`, `mo-`, `Reuse research` как обязательный путь записи); каждая обязательная экосистема ядра имеет discovery-команду, metadata-команду, adoption-метрику и auth-пробу; каждая перечисленная команда синтаксически валидна как shell-строка (парсер, без сетевых вызовов). C2: `RU1`.
**Критерий закрытия.** RC9; §B-FRAMING-04 получает работающего носителя; строка `mo-reuse` исчезает отовсюду.

### S2 — `review-core`

**Цель.** Один vendor-neutral skill: короткое information-dense ядро, разделение стадий, evidence-стандарт вместо confidence, taxonomy рисков в подгружаемых references.
**Границы.** Ядро описывает, **как ревьюировать одну заданную область**. Оно не знает про Orca, `worker_done`, двух вендоров, barrier, backlog-lens — это S3.
**Миграция.** `shared/references/review-protocol.md` теряет часть «что искать» и оставляет lifecycle-семантику; дублирование запрещено — у каждого правила один автор.
**Тесты/E2E.** C1: `description` не срабатывает на общий «сделай ревью проекта» (B5.22); ядро ≤200 строк; в ядре нет числового поля уверенности; нет ни одного упоминания GitHub/PR/`gh`. C2: `RV1`–`RV4`.
**Критерий закрытия.** B5.18 (словарь), B5.19, B5.22, часть B5.14.

### S3 — `review-orchestration`

**Цель.** Всё, что переносимое ядро не имеет права знать: два независимых vendor-diverse ревьюера как gate, горячие сессии, barrier и atomic handoff, remediation как Dispatch, целостность payload, изоляция QC, backlog-lens, интеграция `senior-*`.
**Границы.** Не переопределяет, что искать. Не создаёт findings.json. **Не вводит счётчиков** (§3.5).
**Миграция.** Амендмент `methodology.md` §5: «дать executor оба пути одним обычным сообщением» уточняется до «одним Dispatch с обоими путями», потому что ordinary `send` доказанно не создаёт отслеживаемого work item и способен не доставиться (R-C#45, R-S).
**Тесты/E2E.** C1: barrier не освобождает один ответ; неполный payload — `UNKNOWN`; словарь `substantive slice`/`review remediation` присутствует и не сопровождается порогом. C2: `B18`, `B19`, `B20`, `B24`.
**Критерий закрытия.** RC6.

### S4 — `orca-supervision`

**Цель.** Единственный примитив ожидания; §A-BACKEND-02 «receipt ≠ эффект»; §A-BACKEND-03 честная деградация и граница возможностей; матрица recovery; дисциплина форм команд; семантика доставки и ack; work-package против gate.
**Границы.** Ни одного нового процесса, демона, файла-таймера или счётчика в репозитории. Состояние — только внутри живого turn и в человекочитаемом финальном отчёте. Все пробы, восстанавливающие непубликуемое состояние, помещаются в non-normative раздел и не участвуют ни в одном доказательстве.
**Тесты/E2E.** C1: контрактные assertions по текстам (наличие правил, отсутствие `&&`-цепочек в примерах, отсутствие ссылок из normative-частей на non-normative раздел). C2: `B15`, `B16`, `B17`, `B22`.
**Критерий закрытия.** RC1, RC2, RC3 (часть), RC10.

### S5 — `session-and-role-ownership`

**Цель.** Именование панелей, retention ролей, bookkeeping замены, идемпотентный cleanup, авторитет роли против injected preamble, канал вопросов, владение записями.
**Тесты/E2E.** C2: `B21`.
**Критерий закрытия.** RC4, B5.8, B5.10, B5.17, B5.23, R-B, R-AP, R-AQ.

### S6 — `launch-and-route-readiness`

**Цель.** Доказанный запуск harness с точной моделью и правильной posture до того, как хоть одно lifecycle-сообщение будет принято на веру.
**Миграция.** Skills перестают передавать posture-флаги; проверенная форма запуска и PATH-ловушка записываются в `docs/papercut.md`; дефект окружения чинится через `mo-setup`.
**Тесты/E2E.** C1: skills не содержат posture-флагов; `mo-models.mjs` имеет устойчивый cleanup/timeout Claude-каталога и различает `proved-by-catalogue` и `recently-used`; каждый `SKILL.md` называет свои bundled scripts. C2: `B15`.
**Критерий закрытия.** RC5.

### S7 — `executor-contract`

**Цель.** Спека первым коммитом + чекбокс-план; извлечение новых интентов; provenance SHA; граница мутаций по классу операции; дисциплина QC; семантика outcome; per-requirement disposition; поведение при таймауте `ask`; clean-room self-review до рапорта; урок R-Y.
**Тесты/E2E.** C1: расширение `intent-contract.test.mjs`. C2: `B23`.
**Критерий закрытия.** RC7, RC11, B5.15, B5.16, B5.21.

### S8 — `knowledge-gates`

**Цель.** Закрыть «якорные» пункты backlog машинными проверками или записанными отклонениями; ограничить легитимные ссылки в коде.
**Тесты.** C1 целиком: `knowledge-chain.test.mjs` + `eslint.config.mjs`.
**Критерий закрытия.** RC8 — четыре из пяти открытых записей `backlog.md`.

### S9 — `watchdog-extension`

**Цель.** Новые паттерны (capacity, session limit + `reset_at`, reconnect, refusal), честная семантика доставки nudge, классификация low-level injected dispatch, решение по локальной модели.
**Тесты/E2E.** C1: тест на неподавление недоставленного сообщения. C2: `W1`–`W4` дополняются кейсом `queued`.
**Критерий закрытия.** B1, B5.25, R-C#46, R-C#49, часть RC3.

### S10 — `review-evaluation`

**Цель.** Перевести спорные гипотезы (длинный vs короткий промпт; 2 vs 4 ревьюера; окупаемость ансамбля; окупаемость clean-room self-review) в записанное решение с предзарегистрированными порогами.
**Границы.** Эксперимент живёт в disposable-каталоге и в спеке; **выживает только вывод** — как §A-решение (§B-MEMORY-03).
**Критерий закрытия.** B5.19 в части «сделать исследования» превращается в измеренный ответ, а не в новую отложенную запись.

---

## 5. Детальный дизайн `find-reuse`

### 5.1. Интерфейс (вход/выход, ошибки)

Вход — **reuse brief**. Ни одно поле не ссылается на Meta-O.

```yaml
capability: >                 # ОБЯЗАТЕЛЬНО. Что должно уметь решение, в терминах задачи
constraints:                  # ОБЯЗАТЕЛЬНО (может быть пустым, но не отсутствовать)
  licence_policy: >           # "permissive only; no AGPL"
  runtime_targets: []         # ["node>=22", "linux/amd64", "offline install"]
  hard_exclusions: []         # ["no native build toolchain"]
  security_posture: >         # "no network at runtime"
context:
  languages: []
  package_managers: []        # npm|pnpm|uv|poetry|cargo|go|maven|composer|…
  existing_dependencies: >    # путь к манифесту/лок-файлу ИЛИ inline-список
  prior_decisions: >          # что уже отвергнуто и почему
budget:
  depth: quick | standard | deep      # 1 | 3 | до 5 раундов
  max_wall_clock_minutes: 20
  max_source_calls: 120
output:
  form: markdown_report
```

Выход — **только текст**; вызывающая сторона решает, что с ним делать.

```yaml
status: complete | degraded | needs_attention
decision: reuse | extend | build
degradation:
  - {source: pypi_search, kind: tool_missing|auth_missing|rate_limited|api_changed,
     lost_coverage: "…", remediation: "<точная команда>"}
install_requests:                     # предложения, НЕ выполненные действия
  - {tool: gh, detected_platform: darwin, command: "brew install gh",
     unlocks: ["github repo search", "github code search"], required: true}
auth_requests:
  - {source: github, probe: "gh auth status", observed: "not logged in",
     remediation: "gh auth login --hostname github.com --scopes repo,read:org"}
markdown_report: |
  ## Reuse research
  ### Existing capabilities in the given context
  ### Search log (round, source, query, what changed)
  ### Candidates (deduplicated, with merge log)
  ### Finalists
  ### Decision and rejected alternatives
  ### Gaps and unverified claims
```

**Ошибочные исходы [Т]:** отсутствует `capability` → `needs_attention` без поиска; нулевое покрытие всех источников ядра → `needs_attention`, **никогда не `build`**; неотличимый секрет в brief, меняющий смысл ответа → `needs_attention`; превышен `max_source_calls` → `degraded` с перечнем невыполненных раундов. **`build` с доказательствами — это `complete`, а не провал.**

### 5.2. Внешний Meta-O integration contract (живёт снаружи)

| Обязанность | Владелец |
|---|---|
| Решить, что исследование нужно; предложить один раз | `mo-orchestrate-orca` |
| Собрать `capability` из задачи и дословного ledger | `mo-orchestrate-orca` |
| Собрать `constraints` из `docs/business.md` и `docs/architecture/` | `mo-orchestrate-orca` |
| Собрать `context` из манифестов репозитория | orchestrator read-only или executor |
| **Записать дословную бизнес-постановку** (перенесено из `mo-reuse`) | шаг spec-authoring Meta-O; коммитит executor |
| Создать спеку и пустую секцию `## Reuse research` | executor |
| Вставить `markdown_report` и сделать spec-only коммит | executor |
| Проверить, что находки не проигнорированы | ревьюеры (§B-FRAMING-04) |

Это прямое следствие §B-PORTABILITY-03: слой знаний обязан работать без Meta-O, и симметрично — переносимый skill не должен знать про layout проекта.

### 5.3. Матрица: ядро

Ядро обязательно всегда; недоступность — `degraded`, а не молчание.

| Экосистема | Discovery | Metadata | Adoption | Security | Auth-проба |
|---|---|---|---|---|---|
| **GitHub** | `gh search repos "<q>" --language <L> --sort stars --order desc --archived=false --limit 30 --json fullName,description,stargazersCount,forksCount,pushedAt,updatedAt,license,url,isArchived,openIssuesCount`; по символам — `gh search code "<symbol>" --limit 30` | `gh api repos/{o}/{r}`; `gh api repos/{o}/{r}/releases/latest` | stars, `subscribers_count`, `network_count`, `gh api repos/{o}/{r}/contributors -X GET -f per_page=100 --jq length` | `gh api repos/{o}/{r}/security-advisories` | `gh auth status` |
| **npm** | `curl -s "https://registry.npmjs.org/-/v1/search?text=<q>&size=30"` (отдаёт компоненты score) или `npm search <q> --json --searchlimit=30` | `npm view <pkg> --json` → `license`, `repository`, `time`, `deprecated`, `dist.attestations` | `curl -s "https://api.npmjs.org/downloads/point/last-month/<pkg>"`; зависящие — `search?text=depends:<pkg>&size=1` → `total` | `npm audit signatures`, OSV | нет |
| **PyPI** | **официального search API нет; `pip search` отключён навсегда — не притворяться, что он работает.** Discovery: `curl -s "https://packages.ecosyste.ms/api/v1/registries/pypi.org/packages?q=<q>&sort=downloads&order=desc&per_page=30"`; и/или `api.deps.dev`; и/или `gh search code "import <module>" --limit 30` | `curl -s https://pypi.org/pypi/<name>/json` → `info.summary`, `info.license`, `info.classifiers` (Development Status / License / Python), `info.requires_dist`, `info.yanked`, `urls[].upload_time_iso_8601`, ключи `releases` | `curl -s https://pypistats.org/api/packages/<name>/recent` (помечать как внешний источник); deps.dev → dependents | `curl -s -X POST https://api.osv.dev/v1/query -d '{"package":{"name":"<n>","ecosystem":"PyPI"}}'`; `pip-audit` | ecosyste.ms / deps.dev / pypi.org / OSV — без auth; libraries.io — `[ -n "$LIBRARIES_IO_API_KEY" ]` |
| **crates.io** | `curl -s -H "User-Agent: find-reuse (<contact>)" "https://crates.io/api/v1/crates?q=<q>&per_page=30&sort=downloads"`; `cargo search <q> --limit 30` — **текстовая релевантность, не популярность** | `curl -s https://crates.io/api/v1/crates/<name>` → `downloads`, `recent_downloads`, `max_stable_version`, `repository` | те же поля | `cargo audit`, OSV | нет (обязателен `User-Agent`) |
| **Go** | `curl -s "https://api.deps.dev/v3/systems/go/packages/<module>"`; discovery через `gh search code`/ecosyste.ms (у pkg.go.dev нет публичного search API) | `curl -s "https://proxy.golang.org/<module>/@latest"`, `.../@v/list`; `go list -m -versions <module>` | deps.dev dependents + GitHub-метрики | `govulncheck`, OSV | нет |
| **Локальный контекст** | манифесты и лок-файлы; графы уже подключённых зависимостей (`npm ls`, `uv pip list`, `cargo tree`, `go list -m all`) | — | — | — | — |

**Кросс-режущее ядро (обогащение и идентичность):**

| Источник | Роль | Команда |
|---|---|---|
| **deps.dev** | канонический линк package → source repo, лицензии, OpenSSF Scorecard, счётчик зависящих. **Главный ключ дедупликации** | `curl -s "https://api.deps.dev/v3/systems/<npm\|pypi\|cargo\|go\|maven\|nuget>/packages/<name>"` |
| **ecosyste.ms** | кросс-реестровый поиск и метрики там, где у реестра нет search API (PyPI, Go) | `curl -s "https://packages.ecosyste.ms/api/v1/packages/lookup?purl=<purl>"` |
| **OSV.dev** | уязвимости по (ecosystem, name, version) | `curl -s -X POST https://api.osv.dev/v1/querybatch -d @queries.json` |
| **OpenSSF Scorecard** | сопровождаемость/безопасность с разбивкой | `curl -s "https://api.securityscorecards.dev/projects/github.com/<o>/<r>"` |

### 5.4. Матрица: адаптеры

Адаптер включается, только если экосистема присутствует в `context` либо явно запрошена.

| Экосистема | Discovery | Adoption |
|---|---|---|
| Maven Central | `curl -s "https://search.maven.org/solrsearch/select?q=<q>&rows=30&wt=json"` | deps.dev dependents |
| NuGet | `curl -s "https://azuresearch-usnc.nuget.org/query?q=<q>&take=30"` → `totalDownloads` | там же |
| Packagist (PHP) | `curl -s "https://packagist.org/search.json?q=<q>&per_page=30"` → `downloads`, `favers` | там же |
| RubyGems | `curl -s "https://rubygems.org/api/v1/search.json?query=<q>"` → `downloads` | там же |
| pub.dev | `curl -s "https://pub.dev/api/search?q=<q>"`; `/api/packages/<n>/score` | `likeCount`, `popularityScore` |
| Hex | `curl -s "https://hex.pm/api/packages?search=<q>&sort=recent_downloads"` | `downloads` |
| CRAN | `curl -s https://crandb.r-pkg.org/-/desc` | `https://cranlogs.r-pkg.org/downloads/total/last-month/<pkg>` |
| Hackage, CPAN, LuaRocks, SwiftPM index, Julia General | нативный индекс | по наличию |
| vcpkg / Conan | `vcpkg search <q>`; `conan search "<q>*" -r conancenter` | GitHub-метрики upstream |
| nixpkgs | `nix search nixpkgs <q> --json` | — |
| Homebrew | `brew search <q>`; `brew info --json=v2 <f>` → `analytics.install` | там же |
| Debian/Ubuntu | `apt-cache search <q>`; `apt-cache show <p>` | popcon (внешний) |
| Docker Hub | `curl -s "https://hub.docker.com/v2/search/repositories/?query=<q>&page_size=25"` | `pull_count` |
| GitLab | `glab api "/search?scope=projects&search=<q>&order_by=star_count&sort=desc"` | `star_count` |
| Codeberg / Gitea | `curl -s "https://codeberg.org/api/v1/repos/search?q=<q>&sort=stars&order=desc&limit=30"` | `stars_count` |
| Bitbucket, Sourcehut, Software Heritage | нативный API/GraphQL | ограниченно |

**Правило против бесконечного каталога [Т].** Ядро фиксировано и меняется только архитектурным решением. Адаптер добавляется, только если (а) экосистема присутствует в `context` конкретной задачи и (б) у неё есть хотя бы discovery-команда и одна честная adoption-метрика. Адаптер без метрики допустим, но обязан помечать кандидатов `adoption: unavailable` — выдумывать ранжирование запрещено.

### 5.5. Auth-пробы и предложение установки

Правило [Т]: **проба до поиска, инструкция вместо молчания, предложение вместо установки.**

| Источник | Проба | Успех | Точная инструкция при отказе |
|---|---|---|---|
| GitHub | `gh auth status` | exit 0, назван host | `gh auth login --hostname github.com --scopes repo,read:org` |
| GitHub code search | `gh api /search/code -X GET -f q=test -f per_page=1` | exit 0 | тот же login; анонимно недоступен |
| GitLab | `glab auth status` | exit 0 | `glab auth login --hostname gitlab.com` |
| libraries.io | `[ -n "$LIBRARIES_IO_API_KEY" ]` | непусто | «получите ключ на libraries.io/account и экспортируйте `LIBRARIES_IO_API_KEY`» |
| GHCR / приватные реестры | запись в `~/.docker/config.json` | наличие | `echo $TOKEN \| docker login ghcr.io -u <user> --password-stdin` |
| npm / PyPI / crates / deps.dev / OSV / ecosyste.ms | не требуется | — | — |

Отсутствующий инструмент **никогда не устанавливается молча**: skill формирует `install_requests` с определённой платформой, точной командой и перечнем теряемого покрытия, затем продолжает с явной деградацией. Это применение урока R-A#4: изолированная сессия без корпоративной авторизации показала login form, и правильным ходом было назвать канал, а не гадать.

### 5.6. Обогащение и дедупликация — правила идентичности

```yaml
candidate:
  identity:
    purl: "pkg:pypi/pillow"                            # сильный ключ
    repo: "github.com/python-pillow/Pillow"            # сильный ключ (нормализованный)
    depsdev_project: "github.com/python-pillow/Pillow" # сильный ключ
  aliases: []
  sources_seen: [pypi, github, depsdev]
  licence_spdx: "MIT-CMU"
  licence_conflicts: []
  last_release_at / last_commit_at
  adoption: {metric: "downloads/month", value: …, source: "pypistats.org"}
  security: {osv_open: 0, scorecard: 7.4}
  integration: {path: native|binding|ffi|wasm|subprocess|service, cost_notes: "…"}
  disqualifiers: []
```

**Нормализация [В].** repo: нижний регистр, снять схему, `www.`, `.git`, хвостовой `/`; редиректы GitHub разрешать через `gh api repos/{o}/{r} --jq .full_name` — иначе переименованный проект даст двух «разных» кандидатов. PyPI: PEP 503 (нижний регистр, серии `-_.` → `-`). npm: сохранить scope, нижний регистр. crates: нижний регистр, но **не схлопывать `-` и `_`** — crates.io считает их разными именами, хотя резервирует оба; фиксировать оба и метку `name_ambiguity`.

**Правила слияния [Т].**
1. Слияние — только по совпадению **сильного** ключа (repo / purl / depsdev_project).
2. Слабые сигналы (общая организация, fork-отношение, общий homepage, «одно — биндинг другого») **связывают** записи в семейство, но не сливают.
3. Совпадение имени или описания — не основание никогда.
4. Fork — отдельный кандидат, только если у него есть собственные релизы **или** родитель архивирован; иначе сворачивается в родителя с пометкой.
5. Монорепозиторий: пакеты остаются отдельными кандидатами, репозиторные метрики помечаются `shared` — иначе четыре пакета одного репо выглядят как четыре независимых доказательства зрелости.
6. Расхождение источников по лицензии или сопровождению **не разрешается тихо**: оба значения сохраняются с источником, кандидат помечается `conflicting_evidence` и не может быть финалистом до разрешения.

**Обогащение [Т].** Найденный на GitHub репозиторий обязан быть сопоставлен с реестром (deps.dev/ecosyste.ms/`purl`) и добрать downloads / последний релиз / dependents / OSV / Scorecard; и наоборот — найденный пакет обязан добрать репозиторные сигналы (последний коммит, число контрибьюторов, archived). Кандидат без обеих половин не может быть финалистом.

### 5.7. Процесс и собственные quality gates

Три адаптивных раунда: R1 — язык задачи; R2 — выученный словарь (имена API, стандарты, RFC, названия алгоритмов); R3 — пробел, альтернативная архитектура, термины биндингов. Плюс стоп-правила и бюджет из входа.

**Одно осознанное изменение относительно текущего `mo-reuse` [В].** Правило «GitHub Rust-поиск всегда» обобщается до **cross-language sweep** по компилируемому ядру (Rust, C/C++, Go) и включается по форме задачи (вычисления, парсинг, протоколы, форматы, кодеки), а не безусловно: безусловный Rust-раунд на задаче-склейке сжигает бюджет, а для парсера пропуск C/C++ хуже пропуска Rust. Модель стоимости биндинга сохраняется дословно: готовые официальные биндинги → стабильный C ABI/WASM/N-API/PyO3/UniFFI, затем честная цена обёртки, владения памятью, модели ошибок и сопровождения. «Слишком дорогой биндинг отвергнут» — это результат, а не провал.

| Gate | Условие прохождения |
|---|---|
| G1 покрытие | каждая экосистема из `context` обыскана либо помечена `skipped(<причина>)` |
| G2 доказательства | у каждого финалиста есть SPDX-лицензия, дата последнего релиза, дата последнего коммита, adoption с названным источником и результат security-запроса |
| G3 идентичность | у каждого кандидата ≥1 сильный ключ; журнал слияний присутствует |
| G4 фальсифицируемость | у каждого отвергнутого финалиста назван конкретный дисквалификатор, а не «хуже подходит» |
| G5 честность | каждый отсутствующий инструмент/auth/метрика виден как gap, а не как молчание |
| G6 «уже сделано» | если возможность уже есть в переданном контексте — это немедленный громкий результат, а не строка таблицы |

---

## 6. Детальный дизайн review architecture

### 6.1. Разрешение спорных вопросов контрактами

**(а) Короткое переносимое ядро против простыни.** Короткое **information-dense** ядро (≤200 строк) + taxonomy рисков в `references/`, подгружаемая по risk routing. Длинный чеклист пользователя сохраняется целиком, но меняет роль: становится (1) router knowledge и (2) картой покрытия для eval. Основание: OpenAI по GPT-5.6 фиксирует выигрыш lean-промптов; Anthropic по Opus 5 предупреждает про over-verification и прямо не рекомендует ограничивать discovery словами «только high severity»; context rot подтверждён на 18 моделях **[В]**. Величина эффекта на этих репозиториях — **[Г]**, измеряется S10. Три свойства исходного промпта сохраняются по смыслу дословно: цель («надёжный и быстрый инструмент»), требование полноты, указание замысла/спеки.

**(б) Какие стадии раздельны.** Пять логических стадий с разными целевыми функциями:

```
ground → map → discover → verify → report
```

- **ground** (детерминированно, без модели): `git rev-parse HEAD` совпадает со SHA из брифа **байт в байт**; `git cat-file -e <sha>^{commit}`; `git status --porcelain` пуст; `git diff <base>..<head>` с картой изменённых строк; статус существующих проверок. Несобирающийся кандидат прерывает ревью.
- **map**: по диффу определить активированные risk surfaces (auth/trust, сериализация/парсинг, БД/транзакции/миграции, async/отмена, время жизни ресурсов, кэш/консистентность, внешние API/совместимость, горячий путь, ФС/сеть, распространение ошибок, владение/lifecycle). Углубляться только в активированные.
- **discover**: высокая полнота. **Запрещено** фильтровать по severity, «быть консервативным» или подавлять кандидата из-за низкой уверенности.
- **verify**: попытка **опровергнуть** каждого кандидата — проследить реальный путь исполнения, найти guard/инвариант/владельца/поведение фреймворка/конфигурацию, делающие отказ невозможным; при возможности — минимальный неразрушающий воспроизводитель.
- **report**: дедуп по общей первопричине, классификация причинности, порядок по влиянию.

**Стадии логические, не обязательно разные агенты.** Внутри одного ревьюера они идут последовательно. Кросс-вендорная фальсификация возникает естественно: два независимых ревьюера уже фальсифицируют каждый своих кандидатов, а адъюдикация — обязанность оркестратора.

**(в) Evidence standard против confidence scoring.** Числового confidence нет вообще. Вместо него дискретное состояние верификации:

| Состояние | Требуется | В findings |
|---|---|---|
| `confirmed` | воспроизведено ИЛИ назван путь исполнения и перечислены проверенные guard'ы, которые его не закрывают | да |
| `supported` | назван путь исполнения, воспроизведения нет | да |
| `unproven` | подозрение без пути | **нет** — только в «остаточных рисках и вопросах» |

Прямой ответ на вопрос «можно ли confidence использовать только как фильтр после evidence»: **не нужен и вреден**. Самооценка модели не является доказательством, а рубрика референсного плагина смешивает две оси: 25 — «может быть настоящей», 50 — «настоящая, но незначительная». Второе — severity, а не уверенность; в одной шкале они уничтожают друг друга, и порог 80 начинает отбрасывать настоящие мелкие дефекты **[В]**. Порядок задаётся severity, допуск в отчёт — состоянием верификации.

Словарь severity (текстом, не JSON — прямое требование B5.18): `P0` достижимая авария; `P1` вероятный серьёзный отказ корректности/безопасности/доступности/совместимости; `P2` ограниченный дефект или доказанная эксплуатационная опасность; `P3` необязательное локальное улучшение. Совпадает со словарём `senior-python`/`senior-jsts` — третьего словаря в проекте не появляется.

**(г) Два vendor-diverse ревьюера против дополнительных subagents.** Два независимых vendor-diverse ревьюера остаются **lifecycle gate** — это уровень бизнес-требований (§B-PROOF-02, §B-REVIEW-03), и реализация не может его пересматривать. Внутри ревьюера subagents **разрешены, но не предписаны**: ядро говорит «делить только на существенные независимые исследования, реально идущие параллельно», и **запрещает** порождать subagent ради покрытия категории или перепроверки самого себя. Дополнительный довод сверх исследований: §B-SESSION-01 требует, чтобы человек мог открыть любую сессию глазами и написать в неё; массовый внутренний fan-out эту гарантию обнуляет. **[Т]**

**(д) fast / deep / follow-up — общее ядро, внешняя политика.**

| Режим | Когда | Состав |
|---|---|---|
| **fast** | clean-room self-review исполнителя перед рапортом; мелкая правка вне оркестратора | один проход всех пяти стадий, невысокий effort |
| **deep** | первое ревью ветки/крупного slice | два независимых vendor-diverse ревьюера, полный набор стадий, risk-модули по routing |
| **follow-up** | новый SHA после remediation | вход: предыдущие findings + `git diff <prev_reviewed_sha>..<new_sha>` + исходный замысел; задача — закрыты ли находки, нет ли регрессий |

**Где живёт «состояние ревью» без state store.** Носитель — Git и живой turn: предыдущий проверенный SHA известен, потому что оркестратор его замораживал; дельта вычисляется `git diff`; предыдущие findings лежат в двух приватных временных файлах текущего запуска. `findings.json` из research-2 **отклонён**: нет названного потребителя, переживающего запуск; если запуск умер — новый законно начинается с deep. Правило возврата в deep: дельта затрагивает concurrency/auth/схему/транзакции/публичный контракт либо решение переписано существенно. Эвристика «есть ли коммиты `fix:`» отвергается: она путает переименование с переработкой. **[В]**

**(е) Что читать.** Обязательно: замысел/спека **и дословный ledger** (нормативен), дифф, достижимый окружающий код, инструкции репозитория, тесты, конфигурация. Опционально как evidence: `git log -L`, `git blame`, `git log --follow` по изменённым областям — host-agnostic. PR и комментарии предыдущих PR — **только адаптер**, когда forge присутствует и авторизован.

Критическая оценка референсного плагина. Самая жёсткая непереносимость — **coupling к GitHub**: он требует `gh`, номер PR и публикацию ссылками вида `https://github.com/o/r/blob/<full-sha>/path#L4-L7`. Meta-O ревьюирует **замороженный локальный SHA**, у которого PR может не существовать, а §B-SESSION-02 требует полный settled response, а не комментарий в чужой системе. Второе расхождение: README обещает **4** агента, команда запускает **5** — ровно тот класс расхождения документации и исполнения, который §B-PORTABILITY-07 велит разрешать в пользу инструмента. Заимствуется: явный список классов ложных срабатываний; «ноль находок — корректный результат»; повторная проверка применимости перед публикацией; отказ дублировать линтер и компилятор. Отвергается: числовой confidence, порог 80, обязательный fan-out, GitHub-специфичный вывод. **[Т]**

**(ж) Контроль ложных срабатываний и причинность изменённых строк.**

| Класс | Требование | Может блокировать |
|---|---|---|
| `introduced-by-candidate` | назван конкретный изменённый hunk, делающий отказ достижимым | да |
| `exposed-by-candidate` | дефект существовал, но изменение сделало его достижимым/вероятным; назван механизм | да |
| `pre-existing` | причинно не связан с диффом | нет — отдельный список; по §B-LONGEVITY-04 становится решением про backlog |

Не сумел назвать hunk — не имеешь права называть это `introduced`. Явно исключённые классы (делегируются QC и линтерам): форматирование, порядок импортов, ошибки типов, «мало тестов» без конкретного непокрытого инварианта, стилистика. **«Ноль находок» — валидный вердикт** со своим обязательным содержанием: что проверено, что не проверено, почему покрытие достаточно.

### 6.2. Lifecycle-часть (S3)

- **Same-full-SHA.** Ревьюер в начале и в конце: SHA из брифа взят байт в байт (не префикс, не по памяти — следствие R-T), коммит существует, дерево чистое. Любое расхождение — `UNKNOWN`, частичного pass нет.
- **Горячие сессии.** Один executor и два reviewer harness удерживаются до `PASS+PASS` либо `needs_attention`. Новый SHA — **новое review execution в той же сессии**. Первое ревью ветки идёт из сессии, чистой относительно реализации. Settled Dispatch означает «готов принять следующий Dispatch». Закрытие вкладки во время открытого loop требует основания сильнее, чем «Dispatch settled», **с обязательной сверкой перед действием** — урок R-AJ в том, что правило было прочитано и всё равно нарушено.
- **Итерации — словарь, не счётчик** (§3.5).
- **Barrier и доставка.** Оба полных ответа сохраняются неизменёнными в двух приватных файлах `0600`; исполнитель получает **оба пути в одном Dispatch**. Тела не сливаются, не ранжируются, не сокращаются (§B-REVIEW-01, §B-REVIEW-05).
- **Целостность payload и отклонённая доставка.** Gate-проходящим артефактом является **только settled response, принятый backend**. Полный ответ целиком в body; `reportPath`-приложения, отсутствующие в body, — нарушение; неполный payload — `UNKNOWN`. Если доставка отклонена (`dispatch_capability_invalid`), вердикт считается **не полученным**: тот же вердикт запрашивается заново у той же горячей сессии через валидный путь, а доставленный с служебным префиксом текст показывается человеку только как диагностика и **не заменяет** ответ. Нет валидного пути — `needs_attention`. Тело передаётся shell-safe (`--body-file`/stdin, иначе одинарные кавычки/heredoc, никогда двойные кавычки с backticks).
- **Изоляция QC.** Ревьюеры по умолчанию гоняют только focused non-mutating проверки. Полный детерминированный suite на кандидате выполняет исполнитель — один раз, foreground. Ревьюеру, которому полный suite действительно нужен, требуется advisory-lock: `flock` по пути во временном каталоге ОС, ключ — путь worktree + SHA. `flock` уже является зависимостью проекта (watchdog), потребитель назван (конкурентные ревьюеры), файл не переживает запуск — это mutex, а не state store. Запрет `nohup`, `&`, detached QC; после прогона — проверка отсутствия осиротевших потомков. Отдельно: suite, не независимый под конкуренцией, — это **находка про suite**, а не про кандидата (урок R-U#93).
- **Proof artifact.** Новых артефактов нет: доказательство — два полных settled response плюс человекочитаемый финальный отчёт.
- **Модели ревью.** Review-скилл берёт ту же model-настройку, что оркестратор, заполняя только review-роли (B5.7); ни одна модель не выбирается «на глаз».
- **TUI-верхний ярус (B5.24).** Оба ревьюера сначала отправляют полный `worker_done` в Orca, затем печатают в своей TUI короткий тезисный итог **с разбивкой по критичности**, явно помеченный как проекция, а не второй результат. Различие поведения Claude/Codex подтверждается контролируемым fixture, а не выводится из одного раунда (R-N).

### 6.3. Интеграция `senior-python` / `senior-jsts` (B5.14)

| Роль | Правило |
|---|---|
| executor | **может** загрузить применимый skill, не обязан |
| reviewer | **обязан** загрузить применимый skill, когда кандидат затрагивает этот язык; словарь severity уже совпадает |
| спека | **может** назвать эти критерии как предмет ревью |
| `review-core` | ссылается на них в routing-таблице как на языковые risk-модули, не копируя содержимое |

Три строки в `review-protocol.md` и одна строка routing в ядре. Переписывания существующих skills не требуется — прямое требование пользователя.

---

## 7. Решение по Orca orchestration failures

Два новых архитектурных решения закрывают RC1–RC5 без обвязки:

> **§A-BACKEND-02 — Receipt не является эффектом.** Любой ответ команды, изменяющей состояние, — транспортная квитанция. Прежде чем шаг считается выполненным, эффект подтверждается независимым чтением на **другой** публичной поверхности. Служит §B-PORTABILITY-07 и §B-UPTIME-05. Если отменяется — исчезают обязательные вторые чтения, а с ними защита от сфабрикованного `worker_done`, несозданного worktree и недоставленного сообщения.

> **§A-BACKEND-03 — Честная деградация и записанная граница.** Состояние, которое нельзя прочитать на публичной поверхности backend, не превращается в вердикт: Meta-O выдаёт `unknown`/`needs_attention`, удерживает роли и предъявляет непрочитанное. Каждая такая граница записывается строкой `docs/backend-capabilities.md` с обязательной ссылкой наверх (§B-PORTABILITY-06) и с указанием инварианта и его доказательства. Пробы, восстанавливающие непубликуемое состояние, живут в non-normative разделе `orca-mechanics.md`, ничего не доказывают и удаляемы без изменения контрактов. Служит §B-PORTABILITY-06, §B-CONTROL-04 и §A-RESPONSE-01.

### 7.1. Ownership, cadence, wakeup

- **Единственный примитив ожидания:** `orca orchestration check --wait --types worker_done,escalation,question --timeout-ms <ms> --json` с семантикой «вернись при первом подходящем сообщении либо на ближайшей отсечке — что раньше».
- **Guardrail (главный):** координатор **не выдаёт `final`, пока существует активный Dispatch или незакрытое terminal condition**, кроме явной паузы по просьбе пользователя. Между отсечками — никаких дополнительных mailbox/Dispatch/terminal/Git-опросов. Это единственный дефект, воспроизведённый пять раз подряд, включая случай, где координатор знал правило и всё равно оборвал живой wait на 5.5 минуте **[В]**.
- **Каденция считается по сохранённому `date -u`**, а не по факту автоматического goal-continuation. Величина интервала — умолчание запуска, записываемое в run evidence, а не порог протокола (§B-UPTIME-05).
- **`--types` не доверяем:** наблюдалась доставка `heartbeat` при явном фильтре; батч классифицируется на стороне клиента; `question`/`decision_gate`/`escalation` обрабатываются приоритетно независимо от окна. Окно inbox всегда шире наблюдаемого потока — фиксированный `--limit 4` при потоке heartbeat раз в пять минут арифметически не может не терять вопросы.
- **Валидация признака жизни — три правила, каждое куплено отдельной ошибкой:**
  1. монитор на старте снимает baseline **теми же фильтрами**, что и цикл;
  2. признак допускается в тревогу, только если доказано, что он **меняется при заведомо нормальной работе** (`latest cursor` не меняется — Codex перерисовывает экран на месте);
  3. тревога конъюнктивна: содержимое экрана не менялось дольше согласованного интервала **И** Dispatch всё ещё `dispatched`.
- **`last_heartbeat_at` — не liveness:** внутри длинного turn worker не возвращается к инструментам оркестрации; наблюдённые интервалы 45–70 минут против обещанных в preamble пяти. Порог по обещанной каденции строить запрещено.

### 7.2. Слепые зоны: инвариант и акселераторы

**Нормативная часть — одна.** Пока состояние Dispatch не прочитано на публичной поверхности, оно `unknown`: ожидание продолжается, роль удерживается, вердикт не выдаётся, ресурсы не освобождаются, а человек получает явное сообщение о том, что именно непрочитано и как долго.

**Ненормативная часть — акселераторы** (раздел `## Diagnostic accelerators (non-normative)`; на них не ссылается ни один тест, ни один сценарий, ни одна строка acceptance; их удаление ничего не ломает):

| Симптом | Порядок проб | Что подсказывает |
|---|---|---|
| `dispatched`, heartbeat null, прогресса нет | typed event → `orca account list --json` (`rateLimits.<vendor>.session.usedPercent`, `resetsAt`, `resetDescription`) → `worker-show` → ограниченный `terminal read` | quota_wait с `reset_at` / работает / заблокирован |
| `This content can't be shown` / Trusted Access | `terminal read` tail | `input_blocked` (до работы) или `output_blocked_after_work` |
| Повторяющийся `Reconnecting…` | `terminal read` tail + `orca status --json` | transport stall |
| Резкое падение % контекста | `terminal read` tail | подозрение на compaction |
| `check --wait` → `runtime_unavailable` | `orca status --json` → `worker-show` | transient close; новый check; **не перезапускать Orca** |
| coordinator `stable_pane_required` | read-only `run-show`, `worker-show` | pane потерян |

Заметка о `worker-read`: для supervised worker `--dispatch <id>` даёт транскрипт с точным reset-time; для low-level injected Dispatch он возвращает `dispatch_not_found`. Поэтому `account list` — более широкий акселератор. Но ни один из них не является условием ни одного гейта: если ни одна ступень не сработала, действует инвариант честной деградации, и именно он проверяется E2E.

### 7.3. Матрица recovery (нормативная)

| Ситуация | Разрешено | Запрещено |
|---|---|---|
| нечитаемое состояние любой природы | ждать, удерживать роли, эскалировать человеку с перечнем непрочитанного | выдавать вердикт, освобождать роль, закрывать горячую TUI, пересоздавать Run |
| quota (когда прочитана) | ждать reset в той же сессии; после reset один обычный follow-up | заменять ревьюера, выпускать один verdict |
| `input_blocked` | один узкий доброкачественный rephrase в **том же** attempt | считать refusal вердиктом |
| `output_blocked_after_work` | **сразу** требовать строгий строковый шаблон `severity; file:line; invariant; observed; expected; defensive fix` | повторное свободное «перескажи нейтрально» — доказанно блокируется тоже и стоило ~20 минут supervision |
| `Reconnecting…` | одно ограниченное окно, native recovery | дублирующий worker, reinject |
| compaction | пометить attempt `context-changed`, потребовать доказанное повторное чтение всех назначенных skills/references и frozen SHA/task contract; иначе аннулировать attempt | считать retained terminal равным retained review authority |
| `dispatch_capability_invalid` | считать вердикт неполученным (`UNKNOWN`), запросить тот же вердикт заново через валидный путь у той же горячей сессии; отклонённое тело показать человеку как диагностику | использовать отклонённый payload как settled result; редактировать тело ревьюера; принять автоматический повтор за второе независимое ревью |
| bare shell / сфабрикованный `worker_done` | верификация harness в терминале до первого доверия | доверять composed receipt `ready/input_accepted` |
| потерянный coordinator pane | read-only диагностика, честный `needs_attention`, передача человеку | продолжать оркестрацию вслепую, трогать чужие ресурсы |

### 7.4. Доставка, ack, work-package vs gate, небезопасные side effects

- **`ok: true` от `send` — не доставка.** `delivered_at: null` после отсечки означает «не доставлено». Всё, что worker обязан потребить до settle, доставляется **Dispatch'ем**; ordinary `send` остаётся для необязательных подсказок, чья потеря приемлема.
- **Дисциплина форм команд (нормативно).** Форма команды берётся из `--help` до первого применения; диагностические вызовы не сцепляются через `&&`, потому что одна неверная форма скрывает остальные результаты. Конкретные наблюдённые формы (`check --ack <delivery_id>` вместо несуществующей `ack`; `dispatch-show --task <task_id>`; `terminal list` в единственном числе; `worker-release` после `worker-stop`; `worker-retain` не принимает low-level injected Dispatch и отвечает `dispatch_not_found` — ожидаемый неблокирующий исход; ordinary follow-up получается опусканием `--type`) записываются в `docs/papercut.md` как справочник **[В]**, который может устареть и на который не опирается ни один тест.
- **Work package против gate.** Каждый существенный `worker_done` несёт по каждому требованию одну из четырёх диспозиций: `implemented-locally` | `remaining-local-slice` | `external-evidence-gate` | `authority-decision`. Gate означает необходимость узкой авторизации на конкретную операцию, а **не** разрешение объявить остаток спеки неисполнимым. Оркестратор не называет «сколько осталось» по списку спеки без такого отчёта.
- **Небезопасные side effects.** Граница мутаций задаётся **классом операции**, не именем проекта: запрещено разрушающее и постоянное вне назначенного worktree (`rm`, `docker compose rm/down/stop`, пересборка образов, правка чужих файлов, drop БД, push); разрешён обратимый подъём уже существующей зависимости с обязательством вернуть исходное состояние. Запрет, выведенный из прошлого инцидента, проверяется на фактических зависимостях задачи **до** отправки исполнителю. Изменяющая состояние CLI читается через `--help` на предмет неявных сетевых side effects, когда бюджет вызовов равен нулю.
- **Same-SHA completion** — как в `methodology.md` §7, плюс provenance-правило для исполнителя и ревьюера.

### 7.5. Терминалы, роли, замена (S5)

Именование: `mo/<role>/<vendor>-<model>/<short-sha>`, `role` ∈ `coordinator|executor|reviewer-a|reviewer-b|e2e`. Безымянные вкладки, созданные человеком, не трогаются никогда. Перед первым inject в свежую TUI проверяется **пустота строки ввода** — наблюдался посторонний символ `> B`, который припишет весь preamble к мусорному префиксу; обход — `orca terminal send --terminal <h> --interrupt` и повторное чтение. Создание замены атомарно порождает cleanup debt старого точного handle; после принятого полного результата замены старый handle закрывается либо докладывается `cleanup_pending`. `tab_not_found` после settlement трактуется как `already_absent`, подтверждается одним чтением инвентаря и докладывается, а не повторяется разрушительно. Injected preamble **не переопределяет** роль, назначенную пользователем: конфликт — немедленная публичная эскалация и полная остановка, без кода, QC и артефактов. Прямой ввод пользователя в панель worker: бриф исполнителя говорит, что обращённые к роли координатора реплики не являются его инструкциями, и при неоднозначности он спрашивает через lifecycle-канал. Материализация внешней спеки: оркестратор делает read-only pull вне репозитория и передаёт путь; коммитит файл первым инкрементом исполнитель.

**Канал вопросов (R-B).** Orca `ask`/`reply` — авторитетный канал для всего, что блокирует worker и подлежит аудиту; нативный question-UI harness и обычный текст наблюдаются, но не являются каналом settlement. При таймауте `ask` worker отправляет `escalation` и продолжает незаблокированную работу, а не сворачивает задачу.

---

## 8. Knowledge-chain, якоря, история и watchdog

| Пункт | Решение | Почему законно |
|---|---|---|
| Символьный уровень цепочки | ESLint plugin `jsdoc`: `require-jsdoc` для экспортов/классов + `match-description` с проектным regex, требующим ссылку `§A-*`. Для `.sh` — записанное решение «зрелого инструмента нет, символьный уровень остаётся за ревью» | Контракт разрешает зрелый инструмент с проектной конфигурацией и требует доказательства перед своим чекером; для shell доказательство и есть отсутствие инструмента |
| Якоря при сборке | Снятие отклонено. §5 purpose-контракта уже разрешает дословной копии нести id как provenance; поставка без якорей — решение | Отдельный этап очистки способен незаметно разойтись с источником; названного потребителя у якорей внутри поставки нет |
| Удаление тезиса / переиспользование id | Гейт сравнивает множества `§B-*`/`§A-*` на `merge-base(HEAD, develop)` и на `HEAD`; исчезнувший id требует `Retires §…: <причина>` в сообщении коммита | Это **не** baseline-файл: сравнение с историей Git, потребитель — гейт и ревьюер; цена — один `git show` за прогон |
| Ссылки в коде (B5.20) | В `AGENTS.md`/`CLAUDE.md`: легитимны только `§B-*`/`§A-*`; ссылки на номера замечаний запрещены. Проверка — ESLint `no-warning-comments` с проектным списком терминов | Зрелый инструмент + проектная конфигурация |
| Watchdog: новые паттерны | `Selected model is at capacity`, `You've hit your session limit · resets …`, `Usage limit reached · continuing automatically at …`, `Reconnecting…`, `This content can't be shown` с извлечением `reset_at`, где строка его несёт | §B-UPTIME-02: наблюдатель существует ради лимитов и перегрузки |
| Watchdog: доставка nudge | Helper обязан либо дождаться/проверить `delivered_at`, либо называть действие `queued`; недоставленное сообщение не подавляется digest'ом | Реальный дефект R-C#46, закрывается тестом |
| Watchdog: low-level dispatch | `unclassified` недопустим для Dispatch с живым exact terminal: fallback на семантику точного терминала | R-C#49 |
| Локальная модель (B1) | Time-boxed эксперимент с **предзарегистрированным** правилом: классификатор на сохранённых credential-free состояниях должен превзойти pattern-скрипт по заранее названной величине, без демона и persistent state. Не превзошёл — §A-WATCHDOG-02 «отклонено, потому что» с числами | §B-UPTIME-02 прямо называет локальную модель «возможным продолжением, но не условием». Отклонение с измерением — законное закрытие |

---

## 9. Эксперимент S10: конкретика

- **Gold set 20–40 кейсов**, четыре типа: (а) исторические регрессии — коммит `fix:`, чьи строки по `git blame` восходят к идентифицируемому более раннему коммиту; (б) реальные принятые замечания коллег; (в) посеянные мутации (инверсия условия, off-by-one, проглоченное исключение, снятая проверка, гонка); (г) **clean negatives** — кандидаты без дефекта. Без (г) побеждает промпт «найди двадцать проблем». **[Т]**
- **Оракул:** заранее записанное однострочное утверждение о дефекте и файл/строка, куда лёг фикс. Попадание — находка называет то же место **и** тот же механизм отказа. Судья-модель не является единственным оракулом архитектурного решения.
- **Плечи:** `minimal` / `core` / `core+risk-модули` / `current-long` × {Claude Opus 5 high, GPT-5.6 Sol high}, по три прогона на кейс.
- **Метрики:** recall по оракулу, precision по адъюдицированным, marginal unique validated findings над лучшим одиночным плечом, FP на ревью, wall-clock, токены, стоимость и **retention** — не перестала ли модель находить обычные логические баги после добавления security/concurrency-модуля.
- **Предзарегистрированные правила принятия:** второе discovery-плечо принимается, только если даёт ≥15% уникальных подтверждённых находок при noise не выше заданного потолка; risk-модуль включается по умолчанию, только если поднимает severity-weighted recall без падения precision ниже цели; «4 ревьюера на первом заходе» — по тому же барьеру. Не прошедшее порог остаётся в тексте skill помеченным как гипотеза. **В runtime не переносится ни одно число** — только выбранная конфигурация (§3.5).
- **Куда девается корпус:** disposable-каталог + спека; удаляется вместе со спекой. Выживает только вывод — как §A-решение.

---

## 10. Ключевые интерфейсы и модели данных (сводка)

Проект skills-first, поэтому «API» здесь — контракты сообщений и текстовые границы, а не сигнатуры функций.

**`find-reuse`** — единственный настоящий структурированный контракт: вход `reuse brief`, выход `find-reuse result` (§5.1) с перечисленными ошибочными исходами.

**Review finding** (текст, не JSON — §B-REVIEW-01 и B5.18):

```
### [P0|P1|P2|P3] <короткий заголовок>
Location: path/to/file:line
Causality: introduced-by-candidate | exposed-by-candidate | pre-existing   (для первых двух — назван hunk)
Verification: confirmed | supported
Problem: <нарушенный инвариант>
Failure scenario: <конкретные входы, состояние, тайминг или путь исполнения>
Impact: <что произойдёт на практике>
Evidence: <почему существующие guard'ы не закрывают путь; какие проверки выполнены>
Fix direction: <наименьшее достаточное исправление>
```

Вердикт ревьюера: `PASS` | `FINDINGS` | `UNKNOWN`, с обязательным SHA, вендором, линзой и списком выполненных проверок. `PASS` при нулевых находках обязан нести перечень проверенного, непроверенного и обоснование достаточности покрытия.

**Structured fallback после output-block** (единственная форма, доказанно прошедшая фильтр):
`severity; file:line; invariant; observed; expected; defensive fix` — по строке на находку.

**Executor `worker_done`** несёт по каждому требованию диспозицию `implemented-locally | remaining-local-slice | external-evidence-gate | authority-decision`; `outcome=succeeded` невозможен при невыполненной обязательной фазе; успешный restore — отдельное поле, не апгрейд outcome.

**Строка границы возможностей** в `docs/backend-capabilities.md` — машинно разбираемая таблица из пяти обязательных колонок:
`capability | observed gap | Meta-O invariant (ссылка §A-* или §-раздел контракта) | proof (имя теста или id сценария E2E) | upstream ref (URL или `no-public-tracker: <как сообщено>`)`.

**Ошибочные исходы оркестрации, определённые явно:** `delivered_at: null` → не доставлено; `dispatch_not_found` от `worker-retain` для low-level Dispatch → ожидаемый неблокирующий исход; `tab_not_found` после settlement → `already_absent`; `runtime_unavailable` от wait → transient close, повторный check после `status`; `dispatch_capability_invalid` → вердикт не получен (`UNKNOWN`), повторный запрос через валидный путь; `stable_pane_required` → `needs_attention` и передача человеку; отсутствие подтверждённого harness → любое lifecycle-сообщение этого Dispatch void; непрочитанное состояние любой природы → `unknown`, удержание ролей.

---

## 11. Компромиссы и почему выбрано это направление

| Развилка | Выбор | Цена и почему принята |
|---|---|---|
| Один большой «фикс-всё» спек vs десять | десять | Один спек невозможно провести через lifecycle: один SHA, один QC, два ревью. Цена — десять веток и финальных SHA; выигрыш — каждый инкремент проверяем |
| Эвристики как носитель закрытия vs инвариант честной деградации | инвариант | Цена — часть слепых зон остаётся видимой только человеку и только через акселераторы, а вердикт становится `unknown` чаще. Причина — иначе «закрытие» опирается на догадку и разрушается при первом изменении Orca |
| Использовать отклонённый payload как settled result vs повторный запрос | повторный запрос | Цена — лишний круг и риск `needs_attention`. Причина — §A-RESPONSE-01: доказательством является только принятый backend settled response |
| Issue наверх необязателен vs обязателен-и-недостаточен | обязателен-и-недостаточен | Цена — гейт падает на неполной строке границы. Причина — §B-PORTABILITY-06 формулирует отправку наверх как обязанность |
| Числовые бюджеты ревью vs словарь + суждение | словарь + суждение | Числа противоречат §B-REVIEW-03 и §B-CONTROL-03. Цена — риск churn; смягчение: severity делает «остались только P3» наблюдаемым, поправка подготовлена |
| Длинный чеклист как промпт vs как taxonomy | taxonomy + routing | Цена — возможная потеря recall на неактивированных классах; смягчение: S10 меряет retention, чеклист сохраняется как карта покрытия |
| `findings.json` vs Git + живой turn | Git + turn | Цена — умерший запуск начинает с deep. Выигрыш — нет второго носителя истины |
| Subagents обязательны vs разрешены | разрешены | Цена — возможно меньшая полнота на широких диффах. Причина — §B-SESSION-01 и рекомендации обоих вендоров |
| Полный QC у каждого ревьюера vs mutex | mutex | Цена — сериализация удлиняет barrier. Причина — параллельные полные прогоны в одном worktree доказанно влияют друг на друга |
| «Мягкая» портируемость `mo-reuse` vs полный разрыв | полный разрыв | Цена — обязательный перенос verbatim-записи в методологию. Причина — прямое требование пользователя и §B-PORTABILITY-03 |

---

## 12. Риски и смягчения

| Риск | Смягчение |
|---|---|
| **Эвристика просачивается в доказательство** | Акселераторы живут в одном явно названном non-normative разделе; тест проверяет, что ни один proof (тест, сценарий, строка acceptance) не ссылается на этот раздел и что normative-тексты не содержат ссылок в него |
| **Честная деградация делает `unknown` слишком частым** | `unknown` не заканчивает запуск: роли удерживаются, человеку предъявляется точный перечень непрочитанного; акселераторы уменьшают частоту, не участвуя в доказательстве. Частота фиксируется в run evidence и становится аргументом для issue наверх |
| **Программа сама раздувает обвязку** | Ни одна спека не создаёт нового носителя знания; закрытие идёт в существующие `acceptance.md`, `backend-capabilities.md`, `architecture/`, `papercut.md`. Временный прогресс живёт в чекбокс-плане спеки, удаляемом при мерже |
| **Потеря дословного ledger при удалении файла** | Файл удаляется **последним** коммитом программы, только после того как тест закрытия доказал резолвимость каждого указателя; до этого он не переписывается (§B-FRAMING-01) |
| **Пункт без инварианта выдадут за закрытый** | Q4 и структурный тест: строка границы без резолвящегося инварианта и proof роняет гейт; такой пункт обязан либо стать решением «неподдержано», либо остаться в backlog |
| **Числовые пороги вернутся через заднюю дверь** | Контрактный тест: в `shared/references/` и текстах skills нет числовых лимитов итераций/раундов/попыток |
| **Review-архитектура ошибается в непроверенном** | Всё непроверенное помечено `[Г]` прямо в тексте skill; S10 имеет предзарегистрированные правила |
| **Двухвендорный gate экономически не окупается** | Это уровень бизнес-требований; S10 не вправе его отменить, но обязан измерить стоимость и опубликовать |
| **`find-reuse` вырождается в бесконечный каталог** | Ядро фиксировано архитектурным решением; адаптер требует присутствия экосистемы в `context` и честной метрики; бюджет — часть входа |
| **API третьих реестров меняются** | §B-PORTABILITY-07: авторитетен инструмент. Точные параметры сверяются с `--help`/OpenAPI при реализации; тест проверяет наличие и синтаксическую валидность команды, **не** удачу живого вызова |
| **QC-mutex превращается в state store** | `flock` во временном каталоге ОС, ключ worktree+SHA, ничего не переживает запуск, потребитель назван |
| **Расширение E2E делает матрицу неподъёмной** | Сценарий добавляется только там, где детерминированный тест принципиально невозможен; остальное — контрактные тесты |
| **Программа не влезает в один цикл** | Каждая спека — своя ветка и свой финальный SHA; `docs/backlog.md` чистится построчно по мере закрытия |

---

## 13. Отклонённые варианты

| Вариант | Причина отклонения |
|---|---|
| «Upstream-issue + граница» как самостоятельное закрытие | Не доказывает, что работа не отложена |
| «Устойчивая эвристика» как закрытие | Компенсирует чужой дефект, а не описывает наше поведение; разрушается при изменении backend. Заменена инвариантом честной деградации, эвристика понижена до non-normative акселератора |
| Использовать отклонённый (`dispatch_capability_invalid`) payload как settled result | §A-RESPONSE-01: доказательством является только принятый backend settled response. Заменено повторным запросом вердикта и `UNKNOWN`/`needs_attention` |
| Считать issue наверх необязательным | §B-PORTABILITY-06 формулирует это как обязанность; ссылка теперь обязательное поле строки границы |
| `findings.json` / машиночитаемый store находок | Нет названного потребителя, переживающего запуск |
| Обязательный fan-out специализированных subagents | Противоречит §B-SESSION-01 и рекомендациям вендоров; цифры research-3 (92% recall, <5% FPR) опираются на блог-посты и непроверяемые ссылки |
| Числовой confidence 0–100 с порогом 80 | Самооценка не доказательство; рубрика смешивает severity и уверенность |
| Публикация находок inline-комментариями в PR с GitHub-ссылками | Ревьюируется замороженный локальный SHA; §B-SESSION-02 требует полный settled response |
| Счётчик «5 итераций» и «3 минорных» внутри skill | Прямо противоречит §B-REVIEW-03, §B-CONTROL-03 и `methodology.md` §5 |
| Снятие `§A-*` якорей на этапе сборки | Дополнительный этап, способный разойтись с источником; названного потребителя нет |
| Baseline-файл множества id | Запрещён контрактом; заменён сравнением с `merge-base` |
| Компенсирующий state machine над Orca | §A-ORCHESTRATION-01 |
| Свой чекер символьной цепочки для shell | Контракт требует доказательства невозможности конфигурации; доказательство есть — записывается решение |
| Эвристика «первое ревью = нет коммитов `fix:`» | Путает переименование с переработкой |

---

## 14. Допущения и решения, которые обязана нести спека как открытые

Вопросов пользователю не задаётся; каждый неопределённый пункт закрыт консервативным допущением и одновременно записан как открытое решение спеки.

| # | Неопределённость | Консервативное допущение | Где записано как открытое |
|---|---|---|---|
| 1 | Публикация `find-reuse` отдельно от meta-o | остаётся в этом репозитории, собирается тем же pipeline, но без единой Meta-O-связи в тексте | S1 |
| 2 | Состав адаптеров | ядро = JS/TS, Python, Rust, Go + GitHub; первые адаптеры = PHP, Java, .NET | S1 |
| 3 | Перенос verbatim-записи из skill в методологию | переносится явно, иначе §B-FRAMING-01 теряет носителя | S1 |
| 4 | Бюджет «5 итераций» | контракт конкретного запуска, а не правило Meta-O; в skill попадает только словарь | S3 |
| 5 | Правило «3 минорных итерации → стоп» | **не реализуется** как счётчик; готовится поправка к §B-REVIEW-03 (§3.5) | S3 |
| 6 | Clean-room self-review исполнителя невидим человеку | допускается: не является lifecycle gate, его результат целиком отражён в `worker_done`, он не заменяет ни одного из двух vendor-diverse ревью | S7 |
| 7 | Бюджет и данные S10 | только репозиторий meta-o и синтетические мутации; корпоративные репозитории — без отдельного разрешения не используются | S10 |
| 8 | Канал upstream-issue | **исправлено:** ссылка наверх обязательна для каждой строки границы (§B-PORTABILITY-06). Если публичного трекера нет, строка несёт `no-public-tracker: <как и кому сообщено>`; пустое поле роняет гейт. Ссылка при этом не является доказательством закрытия | S4 |
| 9 | Судьба `bx restore BX_FORCE=1` (R-Y) | вне области Meta-O; сохраняется только извлечённый урок в executor-контракте — непроверенный recovery path считается недоказанным и не проверяется впервые в аварийном окне | S7 |
| 10 | Точные параметры сторонних API | фиксируется намеренная форма вызова, точные параметры сверяются с `--help`/OpenAPI при реализации (§B-PORTABILITY-07) | S1 |

Прочие допущения: Orca остаётся единственным backend; harness'ы — Codex, Claude Code, OpenCode; `senior-python`/`senior-jsts` не переписываются; новых runtime-зависимостей в поставке нет, кроме `curl`/`jq`/`git` для `find-reuse` (`jq` уже требуется watchdog).

---

## 15. Очерёдность, критический путь, инкременты

```
Волна 0 (стартуют одновременно)     S6 launch-and-route-readiness  ← критический путь
                                    S8 knowledge-gates
                                    S1 find-reuse
                                    S2 review-core
Волна 1                             S4 orca-supervision            ← критический путь
Волна 2                             S5 session-and-role-ownership  ← критический путь
                                    S9 watchdog-extension
Волна 3                             S3 review-orchestration        ← критический путь
                                    S7 executor-contract
Волна 4                             S10 review-evaluation
```

**Критический путь: S6 → S4 → S5 → S3 → S10.** S1, S2, S8 вне его и стартуют немедленно. Обоснование S6 первым **[В]**: пока harness не доказан, любой прогон недействителен по построению — сфабрикованный `worker_done` из bare shell автоматически закрывает Task и проходит дальше по lifecycle без единого признака в typed state.

| Спека | Независимо проверяемые инкременты |
|---|---|
| S6 | (1) skills перестают передавать posture-флаги + тест; (2) устойчивый cleanup/timeout `mo-models.mjs` + различение catalogue/recently-used; (3) SKILL.md называют bundled scripts; (4) harness verification gate + E2E B15; (5) запись PATH-ловушки в papercut |
| S8 | (1) eslint jsdoc для `.mjs`; (2) решение по shell + §A; (3) merge-base id-gate; (4) `no-warning-comments`; (5) §A-DISTRIBUTION-07 |
| S1 | (1) переименование + разрыв связей + тест; (2) ядро матрицы + auth-пробы; (3) обогащение и dedup; (4) адаптеры и правило расширения; (5) перенос verbatim-записи в методологию; (6) обновление README/тестов/`qc-python.md` |
| S2 | (1) ядро + триггер; (2) risk-модули + routing; (3) evidence/verification и причинность; (4) routing на `senior-*`; (5) фикстуры «ноль находок» и structured fallback |
| S4 | (1) единственный wait + guardrail на `final`; (2) §A-BACKEND-02; (3) §A-BACKEND-03 + разделение normative/акселераторы; (4) матрица recovery; (5) таблица границ с обязательным upstream ref; (6) диспозиции work-package/gate |
| S5 | (1) именование; (2) retention; (3) bookkeeping замены и идемпотентный cleanup; (4) авторитет роли и прямой ввод; (5) канал вопросов и поведение при таймауте `ask` |
| S3 | (1) вынос «что искать» в S2; (2) горячие ревьюеры и re-dispatch; (3) словарь slice/remediation без счётчиков; (4) целостность payload + отклонённая доставка + фикстуры; (5) QC-mutex; (6) remediation как Dispatch |
| S7 | (1) спека первым коммитом + план; (2) извлечение интентов; (3) provenance SHA; (4) граница мутаций; (5) дисциплина QC; (6) семантика outcome; (7) clean-room self-review |
| S9 | (1) новые паттерны + `reset_at`; (2) честная семантика nudge; (3) классификация low-level dispatch; (4) эксперимент с локальной моделью и его запись |
| S10 | (1) gold set + clean negatives; (2) предзарегистрированные правила; (3) прогон матрицы; (4) ablation модулей; (5) запись §A-решения |

---

## 16. Что меняется в каждом файле

| Файл | Кто | Что появляется |
|---|---|---|
| `docs/business.md` | S3, S7 | новых тезисов **не добавляем без нужды**; ожидается 0–2, включая возможную поправку к §B-REVIEW-03 |
| `docs/architecture/backend-support.md` | S4 | §A-BACKEND-02 (receipt ≠ эффект), §A-BACKEND-03 (честная деградация, граница, обязательный upstream ref, статус акселераторов) |
| `docs/architecture/knowledge-identifiers.md` | S8 | §A-MEMORY-03 (символьный уровень), merge-base правило |
| `docs/architecture/distribution.md` | S8, S1 | §A-DISTRIBUTION-07 (якоря отклонены с причиной); план поставки `find-reuse` |
| `docs/architecture/watchdog-nudge-deduplication.md` | S9 | §A-WATCHDOG-02 (локальная модель: принято/отклонено с числами); семантика `queued` vs delivered |
| новый `docs/architecture/review-pipeline.md` | S2, S3, S10 | §A-REVIEW-01 (стадии и evidence вместо confidence), §A-REVIEW-02 (переносимое ядро vs lifecycle-политика), §A-REVIEW-03 (результат S10) |
| `shared/references/methodology.md` | S4, S5, S7, S1 | guardrail на `final`; каденция по wall-clock; материализация внешней спеки; remediation как Dispatch; диспозиции; граница мутаций; вызов `find-reuse` и запись verbatim-постановки |
| `shared/references/review-protocol.md` | S2, S3 | теряет «что искать»; получает словарь slice/remediation, retention горячих ревьюеров, целостность payload и правило отклонённой доставки, QC-mutex, интеграцию `senior-*` |
| `shared/references/orca-mechanics.md` | S4, S5, S6 | нормативная часть: verification gate, честная деградация, recovery, retention/replacement, идемпотентный cleanup, дисциплина `--help`-перед-формой; отдельный раздел `## Diagnostic accelerators (non-normative)` |
| `shared/references/backend-contract.md` | S4, S6 | quota/refusal/reconnect/compaction как требуемые наблюдаемые состояния; их отсутствие — записанная граница |
| `shared/references/project-setup.md` | S6 | mo-setup владеет posture; проверка резолвящегося wrapper; запрет posture-флагов в skills |
| `shared/references/watchdog.md` | S9 | новые паттерны, `reset_at`, классификация low-level dispatch, честная доставка |
| `shared/scripts/mo-watchdog.sh` | S9 | ожидание/проверка `delivered_at` либо `action=queued` |
| `shared/scripts/mo-models.mjs` | S6 | устойчивый cleanup/timeout; различение `proved-by-catalogue` / `recently-used` |
| `src/skills/find-reuse/` | S1 | новый skill + references матрицы |
| `src/skills/review-core/` | S2 | новый skill + `references/risk-*.md` |
| `src/skills/mo-reuse/` | S1 | удаляется |
| `src/skills/mo-*/SKILL.md` | S6 | называют свои bundled scripts |
| `docs/acceptance.md` | все | по строке на каждый закрытый пункт §3, с резолвящимся proof id |
| `docs/backend-capabilities.md` | S4 | машинно разбираемая таблица границ из пяти обязательных колонок (§10) |
| `docs/e2e.md` | S3–S6, S1 | сценарии `B15`–`B24`, `RV1`–`RV4`, `RU1` |
| `docs/papercut.md` | S6, S4 | проверенная форма запуска Codex/Claude, PATH-ловушка, справочник наблюдённых форм CLI |
| `docs/glossary.md` | S2, S3 | `severity`, `verification state`, `substantive slice`, `review remediation`, `diagnostic accelerator`, `honest degradation` |
| `eslint.config.mjs` | S8 | `jsdoc` с проектным regex; `no-warning-comments` |
| `tests/` | все | новый `backlog-closure.test.mjs`, новый `capability-boundary.test.mjs`; расширение `knowledge-chain`, `orchestration-contract`, `setup-contract`, `mo-models`, `build-skills`, `install`, `intent-contract` |
| `README.md` | S1, S2 | таблица скилов: `mo-reuse` → `find-reuse`, добавлен `review-core` |
| `Makefile` | — | без изменений: гейт уже агрегирующий |

---

## 17. Новые E2E-сценарии

| ID | Сценарий | Доказательство |
|---|---|---|
| B15 | Composed `worker-start`, приведший к bare shell, распознан до доверия любому lifecycle-сообщению | Публичная terminal-проверка называет отсутствующий harness; `worker_done` такого Dispatch отвергнут как void |
| B16 | Turn-persistent wait: ранний message будит раньше дедлайна; пустой timeout даёт ровно один checkpoint | Два прогона; между отсечками ни одного дополнительного опроса |
| B17 | **Честная деградация.** Состояние Dispatch недоступно на публичной поверхности | Вердикт не выдан, роли удержаны, ресурсы не освобождены, человеку предъявлен перечень непрочитанного; прогон повторяется с **отключёнными акселераторами** и даёт тот же исход |
| B18 | Byte-for-byte round-trip payload | Тело с backticks, `$()`, кавычками, Unicode и длинным Markdown доходит неизменённым; `reportPath`-приложений нет |
| B19 | Переиспользование двух горячих ревьюеров на двух последовательных SHA | Те же exact handles, новые Dispatch, ноль байт peer output, первое ревью из сессии, чистой относительно реализации |
| B20 | Cross-worker QC mutex | Два ревьюера, один worktree: полный suite по очереди, holder и waiter наблюдаемы, ни одного осиротевшего потомка |
| B21 | Bookkeeping замены и удержание при потере pane | После recovery ровно одна видимая сессия на роль; безымянная вкладка человека не тронута; `tab_not_found` доложен как `already_absent`; при `stable_pane_required` результаты worker остаются читаемыми, Run помечен `needs_attention` |
| B22 | Receipt ≠ эффект | Для `worktree create`, `send`, `terminal close`, `worker-release` эффект подтверждён вторым чтением на другой поверхности |
| B23 | Семантика outcome | `worker_done` с невыполненной обязательной фазой не может нести `outcome=succeeded`; успешный restore отражён отдельным полем |
| B24 | **Отклонённая доставка вердикта** | При `dispatch_capability_invalid` вердикт считается неполученным; тот же вердикт запрошен повторно через валидный путь у той же горячей сессии; отклонённое тело фигурирует только как диагностика и не попадает в barrier как результат |
| RV1 | «Ноль находок» — валидный вердикт | Ответ содержит перечень проверенного, непроверенного и обоснование достаточности покрытия |
| RV2 | Классификация причинности | `introduced` называет конкретный hunk; `pre-existing` не блокирует и уходит отдельным списком |
| RV3 | Evidence gate | Кандидат без пути исполнения не попал в findings и виден в «остаточных рисках» |
| RV4 | Structured fallback после output-block | Строгий строковый шаблон проходит с первой попытки; вкладка, модель и attempt не менялись |
| RU1 | `find-reuse` без авторизации GitHub | Точная инструкция логина, ничего не установлено молча, продолжение с помеченной деградацией, и **не** `build` при нулевом покрытии ядра |

---

## 18. Machine-checkable Definition of Done программы

1. Раздел «Открыто» в `docs/backlog.md` пуст; `docs/backlog-issues-real-runs.md` отсутствует.
2. `docs/acceptance.md` содержит строку для **каждого** пункта карты §3. `tests/backlog-closure.test.mjs` (Markdown-AST, не regex) проверяет **биекцию**: каждый инвентарный id §3 → ровно одна строка acceptance → существующий proof; лишних и осиротевших строк нет.
3. Каждая строка acceptance объявляет тип C1/C2/C3 и **резолвящийся proof**: для C1 — имя теста, существующее в `tests/`; для C2 — id сценария, существующий в `docs/e2e.md`; для C3 — `§A-*`, существующий и разрешающийся по цепочке знаний. Строка, чьё единственное доказательство — URL наверх, отвергается.
4. `tests/capability-boundary.test.mjs` разбирает таблицу `docs/backend-capabilities.md` и требует по каждой строке пять непустых колонок; проверяет, что `Meta-O invariant` резолвится в существующий `§A-*` или раздел контракта, что `proof` резолвится как в п. 3, и что `upstream ref` — либо URL, либо литерал `no-public-tracker: …`.
5. **Разделение нормативного и акселераторов проверяется структурно:** тест извлекает раздел `## Diagnostic accelerators (non-normative)` из `orca-mechanics.md` и требует, чтобы (а) ни одна строка acceptance, ни один сценарий `docs/e2e.md` и ни один тест не ссылались на его заголовки, (б) нормативные разделы `shared/references/` не содержали ссылок внутрь него как на обязательный шаг.
6. Дубль закрыт ссылкой на строку выжившего пункта, **и** его distinct-evidence фраза сохранена в колонке доказательств выжившего. Тест проверяет, что для каждой группы §3.4 в acceptance присутствует более одной фразы evidence.
7. Контрактный тест «нет числовых порогов цикла»: в `shared/references/` и в текстах skills отсутствуют лимиты итераций, раундов и попыток (§3.5).
8. `tests/knowledge-chain.test.mjs` проходит с merge-base кейсом: исчезнувший `§B-*`/`§A-*` без строки `Retires` роняет гейт.
9. `git grep -n "mo-reuse"` пуст вне защищённой истории; тест непортируемости `find-reuse` зелёный.
10. Ни один поставляемый skill не содержит числового поля уверенности и не требует `gh`/PR как обязательных.
11. Repository-scan подтверждает, что не появилось workflow engine, state store, `findings.json`, run registry, manifest, receipt, digest или baseline-файла.
12. `make mo-qc` зелёный на одном полном SHA; два независимых vendor-diverse ревью вернули `PASS` на **том же** SHA; применимые E2E пройдены, включая `B15`–`B24`, `RV1`–`RV4`, `RU1`; `make mo-e2e` печатает расширенную матрицу и по-прежнему выходит с кодом 2.

---

## 19. Итог

Backlog Meta-O не «разбирается» — он переадресуется в носители, которые проект уже имеет, и носителем может быть только положительный инвариант собственного поведения Meta-O: строка `docs/acceptance.md` с резолвящимся детерминированным или live-доказательством, либо архитектурное решение, которое пункт реализует или явно отклоняет. Весь класс «backend не публикует состояние» закрывается одним инвариантом честной деградации — нечитаемое состояние не превращается в вердикт, роли удерживаются, человеку предъявляется непрочитанное, — а лестницы проб понижены до non-normative акселераторов, на которые структурно запрещено ссылаться любому доказательству; отклонённая доставка вердикта больше не принимается за settled result, а issue наверх стал обязательным полем строки границы и одновременно перестал быть доказательством. Числовые бюджеты ревью не попадают в skills, потому что бизнес-слой запрещает счётчики: вместо них вводится словарь, делающий «остались только P3» наблюдаемым, а пожелание про три минорные итерации оформлено как готовая поправка к §B-REVIEW-03. Десять спецификаций реализуемы независимо, критический путь `S6 → S4 → S5 → S3 → S10` начинается с недоказанного запуска harness как самого дорогого класса ошибок, а `find-reuse` и `review-core` полностью отвязаны от методологии и стартуют параллельно с первого дня.