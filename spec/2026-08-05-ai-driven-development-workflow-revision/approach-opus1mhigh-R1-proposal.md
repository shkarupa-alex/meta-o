# Пересмотр AI-driven development workflow: skills-first, три backend, минимум кода

*Все имена skills, commands, файлов — по-английски; обоснования — по-русски. Каждое утверждение о возможностях инструментов помечено `[V]` (проверено запуском/первоисточником в этой сессии) или `[A]` (допущение, требующее проверки в Phase 0).*

---

## 0. Ограничения, из которых вырастает решение

Прежде чем предлагать архитектуру, нужно зафиксировать, что именно из текущей спецификации опровергается фактами, а что — вкусом. Это различие определяет, какие компоненты можно удалять спокойно, а какие требуют замены.

**Факт 1 — центральный механизм текущей реализации не работает так, как заявлено.** `meta-o session read --complete` объявлен способом получить полный последний ответ worker'а. Фактически `[V]` это чтение терминального буфера: `herdr agent read <name> --source recent-unwrapped --lines N --format text`, окно удваивается 400 → 800 → … → 32000 строк (`herdr-output.mts:54`), и при достижении потолка функция возвращает `text: ""` с `truncated: true`, ни разу не попытавшись извлечь envelope. Собственный skill Herdr `[V]` прямо говорит, что full-last-message API не существует и что строки, ушедшие с alternate screen, не попадают в scrollback хоста вообще — увеличение `--lines` их не вернёт. Доказательство доставки построено на том же 400-строчном хвосте (`herdr-evidence.mts:35` ищет marker подстрокой), и комментарий в самом коде признаёт результат ambiguous.

Это не деталь. Требование «полные reviewer messages не теряются из-за truncation» — hard criterion пользователя, и 15.6k строк кода его **не** обеспечивают. Значит замена нужна не ради простоты, а ради корректности.

**Факт 2 — половина обосновывающих capability просто отсутствует.** По схеме API Herdr `[V]` (`herdr api schema --json`, 251 KB): нет context usage, нет token counts, нет времени последнего turn, нет признаков compaction; поле `AgentInfo.tokens` — это free-form display-метаданные (`^[A-Za-z0-9_-]{1,32}$` → строка), а не токены LLM; grep по `compact*` даёт ноль. `~/.herdr` не существует, per-pane transcripts не пишутся, scrollback живёт только в памяти. Следовательно вся §14 «Context policy» с порогами `55/65/75%` и `100k cold-resume threshold` опирается на телеметрию, которой нет.

**Факт 3 — backends дают разные примитивы, и это не дефект, а данность.** Omnigent 0.6.0 `[V]` имеет `omnigent session export --id <conv> --output transcript.jsonl` — нативную выгрузку полного транскрипта, то есть ровно ту capability, которой у Herdr нет. Herdr 0.8.0 `[V]` имеет статусы `idle|working|blocked|done|unknown`, где `done` означает «фоновая работа закончилась, человек её ещё не видел» — это буквально `needs_attention`, которого нет у Omnigent в такой форме. Paseo на машине не установлен `[V]`. Общий `SessionAdapter` поверх этого обязан приводить всех к худшему общему знаменателю: именно поэтому текущий adapter свёл богатый Herdr к «прочитать хвост панели», и именно поэтому `COMPLETION_CRITICAL` в нём сузился до `["statusRead","stop"]`.

**Факт 4 — abstraction уже протекает.** `HerdrAdapter` несёт семь методов вне интерфейса (`expectedAgentName`, `spawnProbe`, `findSession`, `closeOrphanPane`, `prepareProbe`, `readCompleteTurn`) и более широкую сигнатуру `spawn(request, onPaneCreated?)`, потребляемых через ad-hoc структурные интерфейсы `[V]`. `SessionAdapter` не является реальным контрактом уже сейчас.

**Факт 5 — GRACE не требует того, что от её имени требует текущая спека.** `docs/references/grace.md` формулирует правило плотности: «Любая функция должна быть различима по цели. Полная карточка нужна там, где будущий агент может правдоподобно выбрать неправильное поведение» (L484), и отдельно: «тривиальные private helper'ы не надо превращать в бюрократический проект» (L480), «Тривиальный код не задокументирован ради галочки» (L1843), A/B-эксперимент MIN: разметка 47 «ловушек» сохранила ~80% эффекта (L1425). Про overloads GRACE не говорит **ничего** (grep — ноль совпадений). D-044 (risk-based purpose) отвергнут «under current constraints» при dissent всех трёх судей.

**Факт 6 — экономика подтверждает skills-first.** Собственная старая методология пользователя зафиксировала причину провала multi-agent схемы: «Мультипликация токенов при multi-agent исполнении (4-7x). Каждый сабагент открывает собственный контекст» (ouroboros L713). А `sdd-issues.md` даёт готовый тест на каждый артефакт (L256–262): какую ошибку предотвращает, кто обязан читать, что поддерживает актуальность, как узнаем, что перестал окупаться, можно ли получить ту же защиту меньшим числом артефактов.

Из этих шести фактов следует направление: не «упростить существующее», а **заменить control plane на дисциплину, выраженную в skills, оставив код только там, где он делает то, чего prompt сделать не может**.

---

## 1. Краткое резюме подхода

Методология становится набором из девяти коротких skills и ровно двух исполняемых helper'ов; весь workflow выражается прямыми вызовами `herdr`/`omnigent`/`paseo`, `git` и `make`, а единственная защита от «проверили разные ревизии» — правило одного candidate commit, записанного в обычный git-ref `refs/mo/candidate`. Публичный `meta-o` CLI, FSM, `state.json`, findings store, snapshot digest, write-ahead protocol, capability suite, `SessionAdapter`, watchdog runtime, install/update-скрипты и все project-owned QC-чекеры удаляются целиком (≈15.6k строк TS + 2.2k строк Python), а их функции покрываются либо native CLI, либо готовыми линтерами, либо явно отменяются как гарантии. Executor не получает никакого methodology skill: он получает spec, долгоживущую goal и обычные project instructions, а обязательные свойства результата проверяются QC, двумя независимыми reviewers и E2E.

---

## 2. Сравнение трёх архитектурных уровней

Требование задания — сравнить три уровня, не принимая ни один заранее. Ниже честное сравнение по одному сценарию: «реализовать feature средней величины, два review-цикла, один E2E-цикл, один перезапуск оркестратора посередине».

### Уровень 1 — почти pure skills, прямые вызовы CLI

**Flow.** `mo-orchestrate` → агент читает Herdr-skill → `pane split` → `agent start --kind codex` → `agent prompt` с goal → `agent wait` → читает результат → `make mo-qc` → два reviewer'а → передаёт их полные сообщения executor'у → E2E → done.

**Состав.** 9 skills, 0 scripts.

**Recovery.** Новый orchestrator читает `git log`, `git status`, `herdr agent list`, spec — восстанавливает картину.

**Что теряется.** (а) Model selection превращается в ручной ввод строк каждый раз либо в чтение сотен session-файлов агентом (дорого по токенам, недетерминированно). (б) Полный последний ответ reviewer'а зависит исключительно от того, выполнил ли reviewer инструкцию «запиши ответ в файл» — при compaction reviewer может её потерять, и молчаливо вернётся хвост.

**Стоимость сопровождения.** Минимальная. Изменение CLI backend'а ломает несколько примеров в skill, а не код.

### Уровень 2 — skills + строго обоснованные private helpers *(выбран)*

**Flow.** Тот же, плюс: `mo-models` показывает набор моделей одной строкой; `mo-lastmsg` служит вторым, независимым от послушания агента способом достать полный последний ответ.

**Состав.** 9 skills, 2 скрипта (`mo-models.mjs` ≈ 250 строк, `mo-lastmsg.mjs` ≈ 80 строк), 0 project-owned QC-чекеров.

**Recovery.** Как уровень 1, плюс `git rev-parse refs/mo/candidate` даёт точный candidate без разбора истории.

**Что теряется.** Ничего сверх уровня 1; добавляются два узких обязательства по сопровождению.

**Стоимость сопровождения.** `mo-models` зависит от форматов session-истории Claude/Codex/OpenCode — это реальный риск дрейфа, смягчаемый тем, что скрипт при непонятном формате обязан деградировать в «покажи последний сохранённый набор», а не падать.

### Уровень 3 — небольшой explicit workflow engine

**Flow.** Есть процесс, хранящий фазу, кто чем занят и какие gates закрыты; skills вызывают его.

**Состав.** ~2–4k строк.

**Что покупается.** Ровно три гарантии: (1) exactly-once доставка; (2) автоматическое возобновление без человека; (3) машинно доказуемое «четыре подтверждения на одном содержимом».

**Почему отвергнут.** Все три пользователь явно отменил: crash recovery не цель (§3 задания), ручной перезапуск нормален, а против snapshot digest сформулирован default preference. Кроме того, текущая реализация — это и есть уровень 3, и она даёт эмпирику: 15.6k строк, из которых центральная гарантия (полный ответ) всё равно не достигнута, а `PAUSED_*` состояний накопилось десять. Уровень 3 не дешевеет от того, что его пишут аккуратнее: он дорожает от каждого нового backend.

**Контрольный пример.** Текущий `meta-o` = уровень 3. Соотношение: 25.5k строк (src+tests) кода ради workflow, чей полезный продукт — 976 строк skills.

### Решение

Уровень 2. Уровень 1 отвергается по одной причине — «полные reviewer messages не теряются» является hard criterion, а механизм, целиком зависящий от послушания агента после compaction, hard criterion не обеспечивает. Второй, не-промптовый путь обязан существовать. `mo-models` принят по критерию «время человека дороже токенов»: альтернатива — либо ритуальный ввод четырёх model id при каждом старте, либо агент, читающий десятки МБ session-логов.

---

## 3. Master-spec следующей версии (компактно)

### 3.1 Формула

> Одна прочитанная spec → сильный executor в долгоживущей goal → project QC → два независимых review → E2E → завершение только на одном и том же commit, прошедшем всё подряд без изменений между подтверждениями.

### 3.2 Роли

| Роль | Кто это | Skill | Сессия |
|---|---|---|---|
| orchestrator | агент, читающий `mo-orchestrate` + backend skill | да | долгоживущая |
| reuse researcher | отдельный CLI instance | `mo-reuse` | одноразовая |
| executor | сильная модель в goal-режиме | **нет** | долгоживущая, на всю feature |
| reviewer A | тот же vendor/family, что executor | `mo-review` (как reviewer) | живёт до конца feature |
| reviewer B | обязательно другой vendor | `mo-review` (как reviewer) | живёт до конца feature |
| E2E tester | отдельная сессия — **только** для benchmark/browser | `mo-e2e` | по необходимости |
| watchdog | отдельная сессия, опционально | `mo-watchdog` | 1:1 к оркестратору |

### 3.3 Lifecycle

Никакой FSM. Оркестратор ведёт себя как инженер, а не как автомат:

```text
1. preflight        — понять проект: git, Makefile, docs, backend, модели
2. reuse            — mo-reuse в отдельном instance → раздел spec + первый commit
3. execute          — executor в goal до executor-owned definition of done
4. candidate        — git update-ref refs/mo/candidate <sha>
5. qc + smoke       — make mo-qc (executor уже прогнал; оркестратор верифицирует на candidate)
6. review           — два независимых reviewer на одном candidate
7. fix loop         — полные замечания → executor → новый candidate → повтор 5–6
8. e2e              — по проектному E2E contract, с tester-ролью или без
9. e2e fix loop     — повтор 5, 8
10. cross-check     — если 7 менял candidate после 8 (или наоборот), повторить отставший контур
11. reflection      — только при существенном/повторяющемся сбое
12. done            — один commit, на котором зелены QC, A, B, E2E
```

Пункты 5–10 — это цикл, а не граф состояний. Оркестратору разрешено читать `git status/log/diff --stat`, feature-spec, `Makefile`, `AGENTS.md`/`CLAUDE.md`, `docs/`. Ему запрещено писать код и проводить полный code review.

### 3.4 Гарантии, которые **явно отменяются**

Это самый важный раздел: удаление кода без явного отказа от гарантии — обман.

| Отменяется | Чем заменяется | Что реально теряем |
|---|---|---|
| Exactly-once delivery, write-ahead, generation fencing | Наблюдение: отправил → посмотрел статус/выхлоп | При крайне неудачном крэше между отправкой и подтверждением возможна повторная отправка. Цена: executor получает то же указание дважды и говорит «уже сделано». Приемлемо. |
| Автоматический takeover, watchdog-мутация состояния | Ручной перезапуск оркестратора | Ночной run может простоять до утра, если умрёт и оркестратор, и watchdog. Приемлемо (§3 задания). |
| `snapshot_digest`, attestations, gate receipts | `refs/mo/candidate` + сравнение sha | Rebase/amend с идентичным деревом теперь инвалидирует подтверждения. Цена: один лишний прогон QC. Пользователь явно указал, что сохранение attestations через rebase недостаточное основание. |
| `Finding` JSON schema, findings store, severity-валидация | Полный текст reviewer'а as-is | Нельзя механически посчитать «сколько blocker'ов открыто». Никто этого не считал. |
| FSM, `state.json`, `PAUSED_*` × 7 | Реальность: git, sessions, диалог | Нет машинного «почему стоим». Оркестратор говорит словами. |
| Immutable spec blob, SHA-256, mutation detection | Путь к spec + правило «после reuse-commit spec read-only» | Если человек молча правит spec посреди run — executor и reviewers увидят разное. Митигация: reuse-commit фиксирует spec в git, `git diff` покажет правку. |
| Capability suite | Preflight-проверка присутствия и одна probe-команда | Regression backend'а обнаружится при первом использовании, а не заранее. |
| `KnowledgeImpactPlan` | diff + reviewer lens | Reviewer не может сравнить план с фактом. Он сравнивает spec с фактом — это сильнее. |
| `qc-manifest.json` + machine-readable result | exit code + полный вывод, который читает агент | Нельзя доказать, что внутри `make mo-qc` не пропустили gate. Митигация: `mo-qc` — обычный Makefile-таргет в git, reviewers его читают как код. |
| `e2e.json`, `adoption-manifest.json`, code-health baseline | `docs/e2e.md`/`docs/e2e/` + конфиги линтеров | Нет ratchet для brownfield. Заменяется обычными настраиваемыми порогами + `# noqa`/`eslint-disable` с обоснованием, которые видит reviewer. |
| Ограничение handoff ≤4 KiB | Handoff удалён целиком | Ничего: при живом git, spec и session'е handoff дублировал их. |

---

## 4. Точный состав final skills

```text
mo-orchestrate     entry point + backend-neutral lifecycle       ~150 строк
mo-herdr           Herdr mechanics                               ~90
mo-omnigent        Omnigent mechanics                            ~80
mo-paseo           Paseo mechanics                               ~80  [A]
mo-reuse           pre-implementation reuse research             ~50
mo-review          standalone review loop (orchestrator+solo)    ~120
mo-e2e             agentic benchmark / browser tester            ~80
mo-setup           project onboarding: Make, QC, docs, AGENTS.md ~120
mo-watchdog        optional 1:1 observer                         ~60
```

Ровно девять. **`mo-execute` отсутствует намеренно и это архитектурное решение, а не упущение.**

| Skill | Trigger | Inputs | Outputs | Ответственность |
|---|---|---|---|---|
| `mo-orchestrate` | «прогони фичу», «продолжи работу», вызов без аргументов | путь к spec / текст задачи / ничего | работающая feature, обновлённые docs, локальные commits | весь lifecycle, выбор backend, вопросы пользователю |
| `mo-herdr` / `mo-omnigent` / `mo-paseo` | из `mo-orchestrate` после выбора backend | роль, модель, cwd, prompt | session handle, статус, полный последний ответ | только механика конкретного backend |
| `mo-reuse` | из `mo-orchestrate`; или напрямую пользователем | путь к spec | правка раздела `## Reuse research` + один commit | найти готовое решение, ничего больше не менять |
| `mo-review` | из `mo-orchestrate`; **или напрямую пользователем** | artifact ref (commit range / файл / документ) + опционально spec | вердикты, переданные автору полными текстами | организовать N независимых review, dispute resolution |
| `mo-e2e` | из `mo-orchestrate`, когда E2E не консольный | `docs/e2e*`, candidate sha | результат сценариев + evidence | benchmark и browser E2E |
| `mo-setup` | из `mo-orchestrate` при нехватке контракта; или напрямую | проект | Make-таргеты, конфиги линтеров, `docs/` layout, фрагмент в `AGENTS.md` | привести проект к обнаружимому интерфейсу |
| `mo-watchdog` | из `mo-orchestrate` по согласию; или напрямую | идентификатор наблюдаемого оркестратора | пинки оркестратору, уведомления | 1:1 наблюдение |

### 4.1 `mo-orchestrate` без аргументов

```text
1. git rev-parse --show-toplevel; git status -sb; git log --oneline -20
2. git rev-parse --verify -q refs/mo/candidate   (есть ли незавершённый candidate)
3. <backend> list sessions                        (живые worker'ы этого проекта?)
4. ls spec/ docs/                                 (есть ли spec без Reuse research?)
5. Сформулировать пользователю ОДИН конкретный вопрос:
   «Вижу ветку feat/x, три коммита, candidate a1b2c3d, живую сессию executor'а
    и spec/2026-08-05-foo.md с заполненным reuse-разделом. Продолжить с review,
    или у тебя другая задача?»
```

Не «что делать?», а гипотеза + вопрос. Это прямое следствие принципа «время человека дороже токенов».

---

## 5. Три backend-specific flow

Общая часть живёт **только** в `mo-orchestrate`; три backend skill'а содержат исключительно механику. Никакого `SessionAdapter`, никакого router'а: `mo-orchestrate` в одном абзаце говорит «определи backend и прочитай соответствующий skill».

Каждый backend skill обязан отвечать ровно на семь вопросов и ни на один больше:

```text
S1  как проверить, что backend доступен и его native skill/docs прочитаны
S2  как поднять worker с нужным CLI и моделью
S3  как отправить сообщение так, чтобы slash-команда осталась slash-командой
S4  как понять статус: idle | needs_attention
S5  как получить ПОЛНЫЙ последний ответ
S6  как изолировать revision, если нужно (worktree)
S7  как пользователь вручную зайдёт в сессию и напишет туда сам
```

### 5.1 `mo-herdr` `[V]` (herdr 0.8.0)

**S1.** `herdr --skill` печатает 195-строчный документ и требует `HERDR_ENV=1`. Skill начинается с: *«Выполни `HERDR_ENV=1 herdr --skill` и прочитай вывод целиком. Установленный бинарник — источник истины; примеры ниже могут устареть.»* Skill Herdr не установлен как файл нигде на машине `[V]` — он существует только как stdout, поэтому его нельзя «предполагать прочитанным».

**S2.** ```bash
PANE=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus | jq -r .pane_id)
herdr agent start exec-1 --kind codex --pane "$PANE" -- --model gpt-5.6-sol-medium
```
`--kind` ∈ {claude, codex, opencode, …21 вариант}. Разрешение имени `claude`/`codex` — обычное, через PATH: agent manifests запускают команду по имени. **Проверка PATH-контракта:** до `agent start` оркестратор выполняет `command -v claude codex` и показывает результат; если резолвится не в `~/bin`, это предупреждение пользователю, а не автоматическая коррекция.

**S3.** `herdr agent prompt <name> "<text>" --wait --timeout 120000` — skill Herdr `[V]` утверждает атомарную отправку текста + Enter с учётом живого bracketed-paste режима панели. Именно это делает `/goal ...` жизнеспособным: строка попадает в поле ввода целиком и submit'ится, а не рвётся на части. Ограничение `[V]`: `--wait` сопоставляется с изменением lifecycle-состояния в течение 5000 мс, а не с границей turn'а — если агент уже работает, ожидание удовлетворит завершение *текущего* turn'а. Поэтому skill обязан требовать: сначала `herdr agent wait <name> --until idle`, потом `prompt`.

**S4.** `herdr agent get <name>` → `agent_status` ∈ `idle|working|blocked|done|unknown` `[V]`. Отображение в операционный вид пользователя:

```text
needs_attention := blocked | done
idle            := idle
работает        := working
неизвестно      := unknown   → не считать завершением, посмотреть глазами
```

`done` — это «фоновая работа закончилась, человек ещё не смотрел». Фокусировка снимает флаг, CLI-чтения — нет `[V]`. Это буквально требуемая семантика, и собственную status-таксономию строить не нужно.

**S5 — критическая часть.** Native full-message API отсутствует `[V]`. Два независимых механизма:

*Основной — file handoff.* Каждый prompt worker'а заканчивается строкой:

```text
When you are done, write your COMPLETE final answer to
  .mo/out/<role>-<n>.md
(create the directory; it is git-ignored) and reply with ONLY that path.
```

Оркестратор читает файл обычным Read. Это не proxy-протокол, а один абзац в prompt'е; это ровно то, что предписывает сам skill Herdr в качестве fallback'а `[V]`, поднятое до основного пути, потому что для reviewer-вердикта хвост панели непригоден в принципе.

*Резервный — `mo-lastmsg`.* Если файла нет (worker потерял инструкцию после compaction): `herdr agent get <name>` возвращает `agent_session {kind: "path", value}` `[V]`, указывающий на `~/.claude/projects/<slug>/<uuid>.jsonl` или `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` — эти указатели проставляет hook `~/.claude/hooks/herdr-agent-state.sh` (v7) `[V]`. `mo-lastmsg` читает JSONL и печатает последнее assistant-сообщение целиком.

*Последний рубеж.* `herdr attach <target>` — человек читает глазами.

**S6.** `herdr worktree create --branch <b> --base <sha> --path <p> --no-focus` `[V]` — native, свой helper не нужен.

**S7.** `herdr agent list` → `herdr attach <name>`; пользователь пишет в сессию напрямую. Документируется одной строкой; никакого своего UI.

**Чего Herdr не даёт `[V]`:** goal-режима, context usage, token counts, времени последнего turn, compaction. Соответствующие решения оркестратора — heuristic, и skill обязан это называть.

### 5.2 `mo-omnigent` `[V]` (omnigent 0.6.0)

**S1.** `omnigent --help`, `omnigent run --help`. Собственного `--skill` нет `[V]`.

**S2.** ```bash
omnigent run --harness codex --model gpt-5.6-sol-medium -p "<prompt>"
```
Harnesses `[V]`: claude, claude-sdk, codex, cursor, kimi, openai-agents, open-responses, pi, antigravity, qwen, goose, copilot. Продолжение: `omnigent run -r <conv_id>` / `-c`. Ветвление: `--fork <id>`.

**S3.** Slash-команда идёт как обычный текст prompt'а; активация `/goal` **не подтверждена** и должна проверяться процедурой §6.3.

**S4.** `omnigent session list` + `omnigent attach <conv_id>` (ошибка, если сессия не живая, — сама по себе сигнал) `[V]`. Отдельного `done`-флага нет: `needs_attention` выводится из содержимого последнего сообщения. Это слабее Herdr, и skill обязан это сказать.

**S5 — сильная сторона.** `omnigent session export --id <conv_id> --output transcript.jsonl` `[V]` — единственная native выгрузка полного транскрипта во всём наборе. File-handoff здесь становится удобством, а не необходимостью; `mo-lastmsg` для Omnigent не нужен.

**S6.** Native worktree-команды нет → `git worktree add --detach <path> <sha>`.

**S7.** `omnigent attach <conv_id>`.

**Дополнительно `[V]`:** `omnigent import --harness claude|codex --session <id> | --last N` втягивает нативные транскрипты Claude/Codex в Omnigent — полезно для recovery. Встроенные агенты `polly` (multi-agent orchestrator) и `debby` (fan-out Claude+GPT) существуют, но методология их **не** использует: они дублировали бы роль оркестратора.

### 5.3 `mo-paseo` `[A]`

Paseo на машине не установлен `[V]`, поэтому skill пишется по официальным docs (github.com/getpaseo/paseo, paseo.sh/docs/cli) и помечается как **unvalidated до первого запуска**. Ожидаемое отображение по заявленному CLI: `run` (S2), `send` (S3), `ls` (S4), `logs`/`wait` (S4/S5), workspaces (S6).

Skill начинается с двух обязательных строк:

```text
1. Прочитай skill, который поставляет сам Paseo (он у него есть).
2. Прогони checklist S1..S7 ниже и запиши, что подтвердилось.
   Пока checklist не пройден, считай S5 непроверенным и используй file handoff.
```

Это честнее, чем описать API по памяти. Phase 0 плана внедрения включает установку Paseo и закрытие checklist'а.

### 5.4 Почему нет общего executable adapter

Три backend различаются ровно в тех местах, ради которых adapter и писался бы: получение полного ответа (Herdr — нет, Omnigent — `session export`, Paseo — `logs` `[A]`), статус (пятизначный у Herdr, выводимый у Omnigent), изоляция (native worktree у Herdr, `git worktree` у остальных). Adapter обязан привести их к минимуму, то есть выбросить `session export` и `done`-семантику — единственные два места, где backend'ы реально сильны. Именно это и произошло в текущей реализации. Общая часть, которую стоит разделять, — это методология, и она текстовая.

---

## 6. Executor: отсутствие skill и жизненный цикл goal

### 6.1 Почему у executor'а нет methodology skill

Обоснование — не вкус, а описанный пользователем механизм отказа (`my-opinion.md` L325): после compaction модель помнит **факт**, что skill прочитан, и не перезагружает его; содержание при этом утрачено. То же независимо утверждает GRACE (L672–682): «Всё действительно обязательное нельзя прятать только в необязательном skill.» Следовательно любое требование, живущее только в executor-skill, имеет ненаблюдаемую вероятность исчезнуть в середине большой feature.

Вывод: обязательные требования переносятся туда, где их нельзя забыть, — в spec (её перечитывают), в project instructions (их читают по протоколу самого CLI), в QC (он падает) и в review (он смотрит на результат).

### 6.2 Карта переноса требований `execute-feature` (144 строки → 0)

| Требование текущего skill | Куда переносится | Как проверяется |
|---|---|---|
| «Реализуй весь scope, не срез» | текст goal | reviewer lens «полнота относительно spec» |
| «Тесты на добавленное поведение» | `AGENTS.md` + goal | `make mo-test`; reviewer lens «tests constrain, not just execute» |
| «`make qc` проходит» | goal («executor-owned checks») | оркестратор перепроверяет на candidate |
| Knowledge sync `§B→§A→§M` | **упраздняется**, см. §11 | reviewer lens «durable knowledge» |
| «Удали tracked spec в том же candidate» | goal | reviewer видит в diff |
| «Один чистый локальный commit» | goal | `git status --porcelain` пуст |
| «Не ослаблять QC» | `AGENTS.md` (постоянный тезис) | reviewer сравнивает diff конфигов; `git diff` по конфигам линтеров виден всегда |
| Debt вне scope → `docs/todo.md` | `AGENTS.md` | reviewer lens |
| Запрет push/tag/PR | `AGENTS.md`; PATH-wrapper и так локален | `git log --branches --not --remotes` у оркестратора |
| Batch-исправления findings | сообщение оркестратора в момент передачи | — |
| «Только reviewer закрывает finding» | `mo-review` (у reviewer'а, а не у executor'а) | reviewer перепроверяет |
| Handoff ≤4 KiB | **удалено** | — |
| `meta-o propose-fix` и т.п. | **удалено**, обычный ответ текстом | — |

Читается это так: из 144 строк ровно ноль требуется держать в голове executor'а как ритуал.

### 6.3 Активация и подтверждение native goal

Ключевой факт `[V]`: `codex 0.146.0 --help` не содержит слова `goal` ни в одном подкоманде. **Это не доказывает отсутствие `/goal`** — slash-команды живут в TUI и в `--help` не перечисляются. Поэтому спецификация не имеет права ни утверждать, ни отрицать наличие; она обязана предписать проверку.

**Процедура активации (Herdr + Codex):**

```bash
# 1. дождаться готовности приёма ввода
herdr agent wait exec-1 --until idle --timeout 60000

# 2. отправить goal ОДНИМ атомарным prompt'ом; первая строка — команда
herdr agent prompt exec-1 "$(cat goal.txt)" --wait --timeout 120000

# 3. подтвердить активацию наблюдением
herdr agent read exec-1 --source recent-unwrapped --lines 60 --format text
```

**Критерий подтверждения:** в выводе присутствует специфичный для goal-режима отклик CLI (баннер/подтверждение цели), а **не** эхо строки `/goal ...` как обычного пользовательского сообщения. Если видно эхо — режим недоступен, немедленно переходим к fallback. Никакого `goal.json`, никакого FSM: наблюдение и решение.

`goal.txt` начинается со строки `/goal ` и продолжается телом. `herdr agent prompt` заявлен атомарным относительно bracketed-paste `[V]` — это именно та semantics, которая нужна, чтобы slash-команда не распалась.

**Claude Code `[V]`:** эквивалента persisted goal нет. Есть `--bg/--background`, `claude agents --json` (машинный список сессий с состоянием), `--autocompact <auto|tokens>`, `-c/--continue`, `-r/--resume`, `--fork-session`, `--max-budget-usd`. **OpenCode `[V]`:** установлен (1.18.10), эквивалент goal не обнаружен.

**Честный fallback (именно так и называется в spec):**

```text
Долгоживущая session + completion contract в первом prompt'е
+ orchestrator-driven continuation при premature idle.
```

Это **не** эквивалент goal, и spec обязана это писать прямым текстом. Разница операционная: без goal автопродолжения нет, и оркестратор обязан опрашивать `needs_attention` и толкать.

**Детектор premature idle** — единственная вещь, компенсирующая отсутствие goal. Он не требует кода: первый prompt заканчивается контрольным списком, который executor обязан воспроизвести перед завершением:

```text
Before you stop, print this block filled in honestly:
  SCOPE-COMPLETE: yes | no — <what remains>
  TESTS: pass | fail | not-run
  QC (make mo-qc): pass | fail | not-run
  SMOKE: pass | fail | n/a
  CLEAN COMMIT: <sha> | none
  BLOCKED-BY: none | <external blocker>
```

Оркестратор читает блок. Любое `no`/`fail`/`not-run` при `BLOCKED-BY: none` = premature idle → продолжение с указанием невыполненного пункта. Это дёшево, читаемо человеком и не требует парсера — оркестратор просто смотрит.

### 6.4 Granularity goal — сравнение и выбор

| Вариант | Плюс | Минус |
|---|---|---|
| A. Одна feature-level goal через все циклы | ничего не теряется | goal-режим будет автоматически продолжать работу, **пока executor обязан ждать независимый review** — прямой источник бессмысленного авто-продолжения и порчи candidate во время gates |
| B. Goal до candidate, затем короткая goal на каждый batch | нет авто-продолжения в ожидании | каждая новая goal частично сбрасывает установку; много ceremony на мелкие правки |
| **C. Goal до executor-owned DoD, дальше обычные turns в той же сохранённой session** | нет авто-продолжения во время gates; контекст проекта сохранён; следование spec удерживает goal ровно на том участке, где реален риск преждевременного «MVP» | если executor «выйдет» из goal раньше DoD, продолжение — обычный turn (то есть как в fallback) |

**Выбран C.** Обоснование прямое: goal нужен против преждевременного завершения большой spec (риск сосредоточен в фазе реализации), а во время review/E2E executor обязан **ждать** — и авто-продолжение здесь вредно, а не полезно.

Граница «executor-owned definition of done» определяется однозначно: весь scope реализован, тесты написаны, `make mo-qc` зелёный, короткий smoke зелёный, durable docs обновлены, один чистый commit. Всё, что дальше, — реакция на внешние вердикты.

### 6.5 Шаблон initial goal

```text
/goal Implement the whole of SPEC_PATH in this repository.

Read first, before writing any code:
  - SPEC_PATH in full, including its "## Reuse research" section
  - AGENTS.md / CLAUDE.md if present
Do not skim. The spec is the acceptance oracle; it is read-only for you
except for deleting it at the very end (see below).

Use the solution named in "## Reuse research". If you deviate, state the
technical reason in your final message.

Definition of done — all of it, not a convenient subset:
  1. Every requirement of the spec is implemented. Not an MVP, not a slice.
  2. No hard item deferred "for later" unless an external blocker makes it
     impossible right now — and then say which blocker.
  3. Architecture, compatibility and project constraints from AGENTS.md hold.
  4. Tests exist that would fail if the behaviour regressed.
  5. `make mo-qc` passes, unmodified. You may strengthen it; you may not
     weaken it.
  6. The short console smoke check passes, if the project has one.
  7. Durable knowledge is updated: docs/business.md, docs/glossary.md and
     docs/architecture/ describe what is now true. Proportional to the change.
  8. The tracked spec file is deleted in the same commit, once its durable
     content lives in the docs above.
  9. Exactly one clean local commit; `git status --porcelain` is empty.
     Do not push, do not tag, do not open a PR.

Debt you find outside this spec's scope: one row in docs/todo.md
(area, problem, practical risk, shape of the future fix). Do not fix it.

If you hit a real architectural fork where the spec is genuinely ambiguous,
ask — once, concretely. Do not use questions to hand back ordinary
engineering decisions.

Before you stop, print the STATUS block:
  SCOPE-COMPLETE / TESTS / QC / SMOKE / CLEAN COMMIT / BLOCKED-BY
```

Spec передаётся **путём**, не inline-блоком: executor читает файл сам. Это и экономит контекст, и делает spec единственным источником при перечитывании.

---

## 7. `mo-reuse`: обязательное исследование готовых решений

**Запуск.** Отдельный CLI instance, отдельный контекст, до executor'а:

```bash
herdr agent start reuse-1 --kind claude --pane "$P" -- --model <cheap-strong>
herdr agent prompt reuse-1 "Read the mo-reuse skill and follow it. Spec: <path>"
```

**Единственное разрешённое изменение** — раздел spec:

```markdown
## Reuse research

- Existing project capabilities: ...
- Evaluated solutions: ...
- Decision: reuse | extend | build
- Chosen solution and rationale: ...
- Constraints, risks and rejected alternatives: ...
```

**Что исследует:** код и абстракции проекта; прямые и транзитивные зависимости (`pip list`/`npm ls`, реально доступное, а не только заявленное); зрелые библиотеки и OSS-проекты; для каждого кандидата — maintenance status, дата последнего релиза, лицензия, ограничения, стоимость интеграции.

**Commit.** Если spec tracked:

```bash
git add <spec>
git commit -m "spec: reuse research for <feature>"
```

Один commit, только spec. Он становится границей: дальше spec read-only для executor'а. Инвариант проверяется бесплатно: `git log --oneline -- <spec>` показывает ровно один commit до реализации.

**Если spec внешняя или задача дана текстом.** Никакого blob/digest-протокола. Оркестратор просит `mo-reuse` записать spec+reuse-раздел в `spec/<date>-<slug>.md`, коммитит его тем же одним commit'ом. Внешняя spec материализуется в git один раз — и дальше это обычный трекнутый файл. Это проще любого content-addressed storage и решает ту же задачу.

**Против превращения в тяжёлую SDD-стадию.** Жёсткая рамка: одна сессия, один раздел, обязательный вывод `reuse|extend|build` даже при пустом результате. `build` — полноценный ответ. Skill явно запрещает: писать код, менять что-либо кроме своего раздела, оценивать качество spec, проектировать архитектуру. Это и есть ответ на вопрос 27.

**Как reuse-решение доходит до всех.** Executor читает spec (goal требует читать «including its Reuse research section»). Reviewers получают lens: «использовано ли выбранное решение; если нет — убедительно ли техническое основание». Ничего не хранится в session-переписке.

---

## 8. `mo-review`: один skill, два способа вызова

Skill не знает, кто его вызвал. Его вход — **artifact reference**, а не run state.

### 8.1 Входы

```text
mo-review --artifact <ref> [--spec <path>] [--reviewers N] [--author <session|me>]

<ref> := git range   feat/x~3..feat/x   |  <sha>
       | file        docs/plan.md
       | dir         slides/
```

Никакого `state.json`, никакого snapshot registry, никакого E2E-контекста. Именно поэтому skill запускается после быстрого фикса без всякой машинерии.

### 8.2 Алгоритм

```text
1. Определить kind(artifact): code | document | mixed
2. Поднять N независимых reviewer-сессий (default N=2: same-family + cross-vendor)
3. Каждому дать: artifact ref, spec (если есть), обязательные lenses;
   НЕ давать: рассуждения автора, findings другого reviewer'а
4. Собрать ПОЛНЫЕ последние сообщения (§5 S5)
5. Передать автору оба текста целиком, дословно, в fenced-блоках с заголовком
   «--- REVIEWER A (полностью, без сокращений) ---»
6. Автор отвечает: исправлено / оспорено с аргументом
7. Повторить review на новой ревизии
8. Спор → §8.4
```

### 8.3 Lenses

Обязательны для всех артефактов:

1. соответствие spec/задаче и бизнес-смыслу;
2. **необходимость**: зачем эта сущность/абстракция/изменение вообще нужны; решает ли реальную задачу; нельзя ли получить тот же результат проще; не додумал ли автор лишнего там, где spec неполна;
3. **архитектура**: границы, связность, не растёт ли harness быстрее полезной системы;
4. полнота и честность durable knowledge (`docs/business.md`, `docs/architecture/`, purpose рядом с кодом);
5. соблюдено ли reuse-решение.

Условно, только для `kind == code`:

6. корректность, error paths, безопасность, конкурентность;
7. тесты: ограничивают поведение или просто исполняют его; возможен ли silent failure;
8. purpose: объясняет ли «зачем существует», а не пересказывает реализацию.

Code-специфичные lenses — условная часть skill, а не обязательный input contract. Это сохраняет модульность review cube: тот же механизм применим к spec, документу, презентации.

### 8.4 Dispute resolution — вместо `adjudicate-technical`

Исходный failure mode назван честно: затянувшийся спор reviewer↔executor, который тонкий оркестратор не может разрешить сам, потому что для этого нужно читать код. Отдельный skill для этого не нужен — нужна лестница:

```text
1. попросить того же reviewer'а перечитать ответ автора       (дёшево, часто хватает)
2. показать ВТОРОМУ reviewer'у этот конкретный finding + rebuttal автора
   и попросить рассудить                                       (предпочтительно)
3. попросить второго reviewer'а запустить одного subagent'а
   на короткое независимое исследование спорного факта
4. оркестратор принимает техническое решение сам               (на худой конец)
5. эскалация пользователю — только если спор про продуктовый смысл
   либо действительно неразрешим
```

Шаг 2 — точечное исключение из независимости: **первый проход обоих review остаётся полностью независимым**, обмен происходит только внутри разбора уже возникшего конкретного спора. Это targeted dispute resolution, а не обмен findings до вердикта.

`adjudicate-technical` удаляется: за всё время он не был вызван ни разу, а его содержание — три абзаца внутри `mo-review`.

### 8.5 Durable rationale отклонённых замечаний

Правило, различающее шум и потерю знания:

> Комментарий в коде обязателен, когда одновременно: (а) замечание было substantive (defect или engineering risk, не вкус), (б) автор сознательно не исправляет, (в) причина конструкции не видна из самого кода.

Тогда рядом с решением остаётся `why`: ограничение, отвергнутая более безопасная альтернатива, цена. Не механика реализации.

Если замечание вкусовое (naming, порядок, стиль) — комментарий **запрещён**: это и есть засорение.

Проверка простая: следующий reviewer, увидев ту же конструкцию, должен найти ответ рядом. Формулировка «finding отклонён в run-state» не считается — run-state исчезает.

### 8.6 Subagents у reviewers

Сравнение четырёх вариантов из задания:

| Вариант | Оценка |
|---|---|
| не предписывать | Claude активно использует subagents по умолчанию, Codex — часто нет `[A]`. Получаем систематически разную глубину двух review при формально одинаковом задании |
| рекомендовать ограниченное параллельное исследование | сохраняет асимметрию |
| требовать ровно 6–9 по lenses | на однострочный фикс это ритуал и 6–9× стоимость |
| **динамически по размеру diff** | **выбрано** |

Правило в skill:

```text
diff < 200 строк            → без subagents
200–1500 строк              → 2–3 subagent'а по независимым lenses
> 1500 строк или >15 файлов → 4–6 subagent'ов, по одному на lens, без перекрытия
```

Ограничение fan-out: каждый subagent получает **непересекающийся** lens и возвращает findings, а не пересказ diff'а. Запрещено запускать несколько subagent'ов на один и тот же вопрос.

---

## 9. Полный последний ответ: сводные правила

Сравнение четырёх вариантов, которое требует задание:

| Вариант | Herdr | Omnigent | Paseo |
|---|---|---|---|
| backend-native full turn | **нет** `[V]` | **да**, `session export` `[V]` | вероятно `logs` `[A]` |
| prompt envelope / file handoff | **основной** | резервный | основной до проверки |
| backend-specific helper | `mo-lastmsg` (JSONL) | не нужен | не нужен |
| ручное чтение сессии | `herdr attach` | `omnigent attach` | native attach `[A]` |

**Жёсткое правило спецификации:** усечённый хвост панели **никогда** не считается результатом worker'а и не является входом gate. Если полный ответ недоступен ни одним из механизмов — это блокирующая ситуация, оркестратор говорит об этом пользователю, а не принимает частичный текст.

Текстовый marker-envelope (`META_O_RESULT_BEGIN/END`) удаляется: он решал ту же задачу поверх канала, который принципиально теряет данные.

---

## 10. Модели: минимальный `~/.meta-o` и ненавязчивый upgrade

### 10.1 Layout

Единственный файл. Никаких `projects/`, `runs/`, `state.json`, `findings/`, `watchdog.json`, `capability-baseline.json`.

```json
{
  "schema": 1,
  "default": {
    "executor": "opus-5-high",
    "reviewerPrimary": "opus-5-high",
    "reviewerCross": "gpt-5.6-sol-medium",
    "e2eTester": "gpt-5.6-sol-medium"
  },
  "projects": {
    "3f2a9c1b7e4d": {
      "path": "/Users/alex/Develop/foo",
      "set": { "executor": "gpt-5.6-sol-high" },
      "lastUsedAt": "2026-08-05T10:00:00Z"
    }
  },
  "catalog": {
    "fetchedAt": "2026-08-05T09:00:00Z",
    "models": [
      { "id": "opus-5", "route": "claude", "family": "opus",
        "vendor": "anthropic", "lastSeenInSession": "2026-08-04" }
    ]
  }
}
```

`projects.<key>.set` — **частичный override** поверх `default`. Ключ = первые 12 hex sha256 от `realpath(git root)`; `path` хранится рядом для читаемости человеком.

Сравнение трёх вариантов, которое требует задание:

| Вариант | Оценка |
|---|---|
| только per-project | при десяти проектах десять одинаковых наборов; выход новой модели требует десяти правок |
| только «последний использованный» | не различает «в этом проекте нужен Codex-исполнитель» и «вчера я временно переключился из-за лимитов» |
| **global default + редкий project override** | **выбрано**: типичный проект не имеет записи вообще; override появляется только там, где он осмыслен |

### 10.2 Стартовый диалог

```text
Use this model set or choose another?
  executor:        opus-5-high
  reviewer-1:      opus-5-high
  reviewer-2:      gpt-5.6-sol-medium
  e2e-tester:      gpt-5.6-sol-medium
[Enter] = yes · "reviewer-2 glm-5" · "list"
```

Одна реплика. Полный каталог — только по слову `list`.

### 10.3 `mo-models` — обоснование единственного нетривиального скрипта

Прогоняю через собственный чек-лист задания:

- *Какую операцию нельзя надёжно выполнить прямыми командами?* Перечислить фактически доступные модели, объединив три источника (`claude`, `codex`, `opencode`), и дедуплицировать: модели последнего месяца; модели последних ~10 сессий; **одинаковые effective-модели, увиденные через разные источники одного route**. Источники — это `~/.claude/projects/**/*.jsonl` (27 каталогов `[V]`) и `~/.codex/sessions/**/rollout-*.jsonl` `[V]`, то есть многие МБ JSONL.
- *Почему skill с примерами недостаточен?* Skill заставил бы агента прочитать эти файлы в контекст. Это десятки тысяч токенов на операцию, которая нужна раз в месяц и обязана быть детерминированной.
- *Какие инварианты гарантирует?* Дедупликацию по effective-id; отсутствие сетевых вызовов; отказ вместо угадывания при незнакомом формате.
- *Как часто агент отклонится от happy path?* Никогда: выход — плоский список, дальше решает агент/человек.
- *Не proxy ли это?* Нет: скрипт не запускает и не проксирует ни одной worker-сессии и не знает о workflow.
- *Стоимость сопровождения?* Реальна — форматы session-истории меняются. Митигация в контракте: при неопознанном формате скрипт печатает `{"models": [], "note": "unrecognised session format"}` и **exit 0**, а оркестратор показывает сохранённый набор. Ломкость превращается в деградацию, а не в отказ workflow.

Интерфейс:

```text
mo-models list                  → { models: [...], sources: [...], notes: [...] }
mo-models show [--project PATH] → effective set (default + override)
mo-models save  --project PATH  → пишет override (stdin JSON)
mo-models check                 → { suggestions: [{ from, to, evidence }] }
```

Ошибки: неизвестный формат → пустой список + note, exit 0. Нет прав на `~/.meta-o` → stderr + exit 1. Скрипт не запускает агентов, не ходит в сеть, не хранит ничего кроме `models.json`.

### 10.4 Upgrade suggestion

Отличить настоящего преемника от «другой модели» без выдумок можно только по консервативному правилу:

> Кандидат — преемник, если у него **тот же vendor и то же family**, а отличается только версия/уровень, и он появился в каталоге после `catalog.fetchedAt`.

`opus-4.8 → opus-5` — да. `gpt-5.5 → gpt-5.6-sol` — да (vendor openai, family gpt-5). `opus-5 → gpt-5.6` — нет, это смена семейства и предлагаться не должна. Именно поэтому `catalog` кешируется: без предыдущего снимка невозможно сказать «появилось новое», можно только «существует другое».

Предложение показывается **один раз**, встроенным в обычный стартовый диалог, и никогда не блокирует:

```text
Use this model set or choose another?
  executor:   opus-5-high          (opus-5.1 is now available — switch? "yes exec")
  ...
```

Ложные срабатывания режутся правилом vendor+family и тем, что отказ запоминается как `lastUsedAt`.

---

## 11. Project knowledge: простая структура и понятный `knowledge sync`

### 11.1 Layout

```text
docs/business.md          зачем продукт существует, для кого, что недопустимо
docs/glossary.md          термины проекта
docs/todo.md              найденный вне scope долг и methodological follow-ups
docs/architecture/*.md    решения, границы, инварианты по темам
docs/e2e.md   ИЛИ  docs/e2e/index.md + docs/e2e/<group>.md
```

Уровень `docs/knowledge/` удаляется: кроме architecture в нём ничего самостоятельного не было, а business/glossary/todo — документы, которые человек читает часто и должен находить сразу.

### 11.2 Что удаляется из knowledge-слоя и почему

**Система якорей `§B-*`/`§A-*`/`§M-*` и правило «ссылка на один уровень вверх» — удаляется.** Прогоняю её через тест `sdd-issues.md` L256–262:

- *Какую ошибку предотвращает?* Потерю причинной связи между кодом и бизнес-потребностью.
- *Кто обязан читать?* Человек не читает `§M-CORE-TYPES` — он читает `docs/business.md`. Читает якоря только checker.
- *Что поддерживает актуальность?* Только checker наличия и dangling-ссылок. Механически доказать, что ссылка **осмысленна**, нельзя — это записано в самой спеке (D-022).
- *Можно ли получить ту же защиту меньшим числом артефактов?* Да. Причинная связь сохраняется, если purpose модуля прямо называет, какой продуктовой потребности он служит, обычным текстом. Reviewer проверяет то же самое и делает это лучше.
- *Цена?* 328 строк `knowledge_check.py` + 438 строк `core/knowledge.mts` + `module-anchors.mts` + отдельный markdown-парсер + правило, которое исследование `[V]` подтверждает как принципиально неполное off-the-shelf: `markdownlint MD051` проверяет якоря **только внутри одного документа**, кросс-файловые требуют либо стороннего правила, либо своего кода.

Итог: якоря — самый дорогой артефакт слоя с самым слабым читателем. Удаляются. Что сохраняется: `docs/business.md` как единый читаемый источник верхней истины (D-065 остаётся в силе) и обязанность purpose объяснять «зачем».

### 11.3 `knowledge sync` простыми словами

> **Knowledge sync — это перенести в постоянные документы те утверждения новой spec, которые останутся правдой и после того, как эта feature перестанет быть новостью, и удалить утверждения, которые перестали быть правдой.**

Практически, тремя вопросами к каждому абзацу spec:

1. Будет ли это правдой через год? → да → в `docs/`.
2. Это про **что** делает система или про **как я это сделал сейчас**? → «как» не переносится, оно и так в коде.
3. Противоречит ли это чему-то уже написанному? → тогда старое заменяется, а не дописывается рядом.

**Кто и когда.** Executor, до candidate commit, в том же commit'е. Не отдельной фазой, не по отдельному плану.

**Куда что.** Новая продуктовая потребность / новое недопустимое поведение → `docs/business.md`. Новое архитектурное решение, граница, инвариант → `docs/architecture/<тема>.md`. Новый термин → `docs/glossary.md`. Причина существования модуля/функции → purpose рядом с кодом.

**Как не скопировать spec целиком.** Правило пропорциональности прямо из `my-memory-layers-scratchpad.md` L205: объём дописанного соответствует объёму реального изменения. Изменение одной функции не порождает трёх абзацев архитектуры. Это review lens («knowledge diff proportionality»), а не checker: механически различить пропорциональный и ритуальный diff нельзя, и текущая `docs/acceptance-map.md` это признаёт.

**Когда исчезает tracked spec.** В том же candidate commit'е, где живёт реализация. Это защита от именно того каскада, что описан в `sdd-issues.md` L47–55: устаревшая spec, найденная поиском, порождает правдоподобный неверный план. После удаления spec в поисковом контуре агента её нет.

**Задача текстом без spec-файла.** `mo-reuse` материализует её в `spec/<date>-<slug>.md` первым commit'ом (§7). Дальше — обычный путь.

**Как reviewers проверяют.** Lens: «прочитай `docs/` как незнакомый человек — описывают ли они систему, которая теперь существует; не осталось ли утверждений, которые diff сделал ложными; пропорционален ли объём».

`KnowledgeImpactPlan` удаляется: он существовал, чтобы planned intent не попадал в durable docs, но эта задача решается правилом «пишем факт после реализации», без артефакта.

---

## 12. Архитектурный контракт в `AGENTS.md` / `CLAUDE.md`

Постоянные архитектурные тезисы живут там, где выбранные агенты и так читают. `mo-setup` предлагает вставить компактный фрагмент (одна страница, не энциклопедия):

```markdown
## Architecture rules (read before designing any change)

When you design and implement, think explicitly about:
- what components/modules this change naturally splits into;
- where responsibility boundaries run;
- which dependencies between layers are allowed;
- which parts must be able to change independently;
- whether this creates god-files, god-objects, or excess coupling;
- how the feature fits the existing architecture instead of adding a new layer;
- which stale branches, workarounds or temporary abstractions inside the scope
  can be simplified now.

Also, always:
- keep `make mo-qc` green and never weaken it without the user's decision;
- write purpose next to code: why it exists and what breaks without it —
  not what the code does;
- record out-of-scope debt in docs/todo.md; do not fix it here;
- commit locally; never push, tag or open a PR unless asked.
```

**Против drift между `AGENTS.md` и `CLAUDE.md`.** Сравнение: (а) один canonical файл + symlink — ломается на Windows и в некоторых чекаутах; (б) генератор — новый runtime ради двух файлов; (в) **`CLAUDE.md` состоит из одной строки `See @AGENTS.md`** — Claude Code поддерживает `@`-импорты, `[A]`, проверяется в Phase 0; (г) короткое согласованное дублирование.

Выбран (в) с fallback (г). Никакого instructions-runtime.

Feature-spec отражает архитектурные вопросы, применимые **к конкретному изменению**. `mo-reuse` за общее проектирование не отвечает — его роль узкая. Reviewers получают architecture/necessity как явный lens и проверяют не только соответствие написанной spec, но и качество её архитектурного решения. Оркестратор читает эти файлы, отвечая на вопросы executor'а.

---

## 13. Purpose: сохранить смысл GRACE, а не обязанность иметь docstring

### 13.1 Смысл, который надо сохранить

GRACE: «Описание "что делает код" вторично; описание "зачем он существует и почему устроен именно так" первично» (L25); контракт отвечает «зачем существует, на что влияет, с чем связан, что нельзя нарушить», а не «как устроена реализация» (L494); «Purpose отделён от summary» (L1841).

### 13.2 Прямое противоречие, которое нужно назвать

Задание требует **усилить** требование (overloads тоже обязаны нести purpose, прежнее исключение не принимается автоматически). GRACE в зрелой формулировке требует **обратного** — риск-пропорциональной плотности: «Любая функция должна быть различима по цели. Полная карточка нужна там, где будущий агент может правдоподобно выбрать неправильное поведение» (L484); «тривиальные private helper'ы не надо превращать в бюрократический проект» (L480); «Тривиальный код не задокументирован ради галочки» (L1843). Про overloads GRACE не говорит ничего `[V]`.

Скрывать это противоречие нельзя. Предлагаемое разрешение разделяет два измерения, которые текущая спека смешала:

- **Coverage (присутствие)** — механическое, широкое, дешёвое.
- **Depth (плотность)** — риск-пропорциональная, судится reviewer'ом.

Это сохраняет hard constraint пользователя (никаких «рискованных» дыр в покрытии) и одновременно сохраняет смысл GRACE (никаких одинаково раздутых карточек на тривиальный getter).

### 13.3 Contract

```text
COVERAGE (механически, блокирующе)
  Каждый first-party module, class, function, method, включая private,
  nested, async, property, dunder и tests, имеет непустой docstring/JSDoc.
  Overload-сигнатуры включены. Прежнее исключение
  «overload declaration при документированной реализации» ОТМЕНЕНО.
  Исключения — только явный список файлов в конфиге проекта
  (generated / vendored), каждый с комментарием почему.

DEPTH (reviewer, не механически)
  Одна строка достаточна, когда цель очевидна из имени и сигнатуры.
  Полное объяснение обязательно там, где будущий агент может
  правдоподобно выбрать неправильное поведение: неочевидный компромисс,
  внешнее ограничение, отвергнутая более безопасная альтернатива,
  важный edge case.
  Пересказ реализации не считается purpose и является findings'ом.
  Одинаково раздутые карточки на тривиальный код — тоже findings.
```

### 13.4 Реализация без единой строки собственного кода `[V]`

**TypeScript** — `eslint-plugin-jsdoc` покрывает всё, включая то, чего нет в Python:

```js
'jsdoc/require-jsdoc': ['error', {
  publicOnly: false,                            // private проверяются
  checkConstructors: true,
  checkGetters: true, checkSetters: true,
  exemptEmptyFunctions: false,
  exemptOverloadedImplementations: true,        // документируем сигнатуры…
  skipInterveningOverloadedDeclarations: false, // …и требуем на КАЖДОЙ
  require: { FunctionDeclaration: true, FunctionExpression: true,
             ArrowFunctionExpression: true, MethodDefinition: true,
             ClassDeclaration: true, ClassExpression: true },
  contexts: ['TSInterfaceDeclaration','TSTypeAliasDeclaration','TSEnumDeclaration',
             'TSDeclareFunction','TSMethodSignature','TSPropertySignature'],
}],
'jsdoc/require-file-overview': 'error',
'jsdoc/require-description':   'error',
'jsdoc/informative-docs':      'warn',   // ловит docstring, пересказывающий имя
```

`skipInterveningOverloadedDeclarations: false` — это и есть механическая реализация усиленного требования по overloads.

**Python** — `ruff` D-правила покрывают только `public` по построению `[V]`, поэтому пробел закрывается `interrogate`:

```toml
[tool.interrogate]
fail-under = 100
ignore-init-module = false
ignore-magic = false
ignore-private = false
ignore-semiprivate = false
ignore-nested-functions = false
ignore-nested-classes = false
ignore-overloaded-functions = false     # overloads НЕ освобождаются
omit-covered-files = true
exclude = ["build"]
```

При `fail-under = 100` любой пропущенный символ роняет gate, а `interrogate -vv` печатает какой именно. Собственный AST-checker не нужен.

Отменяется: `project-owned AST purpose checker` (196 строк), требование ссылки `symbol → §M-*`, `knowledge_check.py` (328 строк), собственный markdown-парсер.

---

## 14. QC: готовые инструменты вместо своего кода

Все данные ниже — `[V]` с первоисточниками (см. §21 «источники исследования»), кроме отмеченного.

### 14.1 Project-facing contract (language-neutral)

```text
make mo-qc          ОБЯЗАТЕЛЕН — агрегирует применимые проверки
make mo-typecheck   опционально
make mo-lint        опционально
make mo-test        опционально
make mo-build       опционально
make mo-smoke       опционально
make mo-e2e         опционально (может печатать help — см. §15)
```

Обязателен ровно один. Остальные — конвенция для человека и для быстрого разбора, что именно упало. Отсутствие таргета допустимо, если проверка объективно неприменима **и это явно согласовано** (одна строка в `docs/architecture/quality.md` или в комментарии Makefile).

`.quality/qc-manifest.json` **удаляется**. Обоснование прямое: задание требует назвать конкретного consumer'а. В новом процессе machine-consumer отсутствует — Makefile читают оркестратор, executor и reviewers, все трое читают полный вывод и exit code. Manifest защищал от false-green `make qc`; та же защита теперь даёт другое, более дешёвое средство: `mo-qc` — обычный трекнутый Makefile-таргет, входящий в diff, и reviewers читают его как код. Ослабление gate становится видимым замечанием, а не молчаливым JSON-полем.

### 14.2 Python profile

| Требование | Инструмент | Статус |
|---|---|---|
| формат | `ruff format --check` | покрыто |
| lint | `ruff check` | покрыто |
| docstring presence, public | `ruff` D100–D107 | покрыто |
| docstring presence, private/nested/dunder/overload | `interrogate`, `fail-under=100` | покрыто |
| docstring shape | `ruff` D200/D205/D400/D415 + `convention="google"` | покрыто |
| docstring↔signature | `ruff` DOC-правила (**требуют `preview = true`**) | покрыто |
| cyclomatic | `ruff` C901 (**не в default select — включать явно**) | покрыто |
| branches / statements | `ruff` PLR0912 / PLR0915 | покрыто |
| nesting depth | `ruff` PLR1702 (**preview**) | покрыто |
| max module lines | `pylint` C0302, `disable=["all"], enable=["too-many-lines"]` | покрыто; ruff эквивалента **не имеет** |
| max class lines | — | **не покрыто** → см. §14.4 |
| layering / cycles | `import-linter` (`layers`, `forbidden`, `independence`, `acyclic_siblings`) | покрыто, best-in-class |
| declared vs used deps | `deptry` | покрыто |
| типы | `mypy` или `pyright` по политике проекта | покрыто |
| тесты | `pytest` | покрыто |

Стартовый `pyproject.toml` (сокращённо, полный — в `mo-setup/references/qc-python.md`):

```toml
[tool.ruff]
target-version = "py312"
preview = true                      # обязателен для PLR1702 и DOC-правил

[tool.ruff.lint]
select = ["E","F","W","I","B","UP","RUF","D","DOC","C90",
          "PLR0912","PLR0915","PLR1702","PLR0913"]

[tool.ruff.lint.pydocstyle]
convention = "google"

[tool.ruff.lint.mccabe]
max-complexity = 10

[tool.ruff.lint.pylint]
max-statements = 40
max-branches = 12
max-nested-blocks = 4
max-args = 5

[tool.pylint.main]
disable = ["all"]
enable = ["too-many-lines"]
[tool.pylint.format]
max-module-lines = 400
```

Отменяются: `import_graph.py` (621 строка собственного Tarjan/SCC — `import-linter` делает это лучше и уже проверен), `code_health.py` (249), `purpose_check.py` (196), `knowledge_check.py` (328), `e2e_check.py` (283), `run_qc.py` (225), `_common.py` (340). Итого **2242 строки удаляются**, а покрытие требований при этом **растёт** (docstring↔signature consistency и deptry в текущем наборе отсутствовали).

Custom Import Graph Algorithm из §40 текущей спеки не принимается: `import-linter` покрывает layers, forbidden edges, independence и циклы контрактами, а не кодом.

### 14.3 TypeScript profile (first-class)

Два профиля, как требует задание:

**Profile 1 — compatibility (default для существующих проектов):**
`tsc --noEmit` + ESLint 10 flat + `typescript-eslint` `strictTypeChecked` c `parserOptions.projectService: true` + существующий test runner. Причина default'а: `typescript-eslint` — эталон покрытия typed-правил, и он не требует TypeScript 7.

**Profile 2 — fast (для больших монорепо, где lint-время реально болит):**
`tsc --noEmit` + `oxlint --type-aware` + существующий runner. Type-aware linting Oxlint стал stable 22.07.2026 и покрывает 59 из 61 type-aware-правил `typescript-eslint`, с опубликованными бенчмарками 12–18×. Но: Oxlint **требует TypeScript 7.0+**, у него высокое потребление памяти на больших базах, и — решающее — **у него нет ни JSDoc-presence правил, ни `max-lines`/`max-statements`/`max-depth`**. Значит Profile 2 не самодостаточен: либо ESLint остаётся рядом ради A/B/C-требований, либо эти требования теряются.

**`tsc --noEmit` не удаляется, даже когда есть `oxlint --type-check`.** Oxlint сам позиционирует `--type-check` как замену шага в CI, но источником истины по типам остаётся компилятор; `--type-check` — ускоритель.

**Правило выбора runner'а для greenfield Node-only:** `node:test`. Runner стабилен с Node 20, `mock.timers` и snapshots стабильны, зависимостей ноль (против ~41 MB / 64 пакетов у Vitest). Единственный настоящий пробел — module mocking (в Node всё ещё early development, за флагом), и он закрывается DI/фикстурами. Vitest выбирается, когда проект уже на Vite, нужен богатый browser-mode либо тяжёлый module mocking. **Существующий stack не мигрируется ради стандартизации** — Jest остаётся Jest.

**Runtime-тесты не выдаются за typecheck.** Это не стилистика: Node 26 **удалил** `--experimental-transform-types`, из-за чего `enum`, декораторы и параметр-свойства стали неисправимыми runtime-ошибками. Отсюда высокоценный флаг:

```jsonc
{ "compilerOptions": {
  "noEmit": true, "target": "esnext", "module": "nodenext",
  "rewriteRelativeImportExtensions": true,
  "erasableSyntaxOnly": true,     // превращает ту самую ошибку в ошибку tsc
  "verbatimModuleSyntax": true,
  "strict": true,
  "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true, "noPropertyAccessFromIndexSignature": true,
  "noFallthroughCasesInSwitch": true, "noImplicitReturns": true,
  "noUnusedLocals": true, "noUnusedParameters": true,
  "isolatedModules": true } }
```

Что попадает в default, а что нет (вопрос 23). **Default:** `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `isolatedModules`, `strictTypeChecked`, размерные и complexity-правила, `jsdoc/require-jsdoc`. **Не в default для brownfield:** `exactOptionalPropertyTypes` и `noPropertyAccessFromIndexSignature` — на существующем коде дают шквал правок с низкой отдачей; включаются осознанно. `import-x/no-cycle` — по собственной документации «computationally expensive»; в CI полезен, в watch-режиме нет.

**Пороги не копируются из Python.** Предлагаемый старт для TS: `max-lines 400`, `max-lines-per-function 60`, `max-statements 30`, `complexity 10`, `max-depth 4`, `max-params 5`. Исключения: `tests/**` (без `require-jsdoc` и без `max-lines-per-function`), `*.d.ts`, generated, config-файлы. Против превращения метрик в самоцель — правило в `mo-setup`: порог, который проект уже нарушает более чем в 10% файлов, не поднимается вверх «чтобы прошло», а либо принимается как есть с записью в `docs/todo.md`, либо чинится отдельной feature.

Formatting отделён от correctness: Prettier + `eslint-config-prettier/flat` **последним** в конфиге. Оговорка `[V]`: `eslint-config-prettier` последний раз публиковался 18.07.2025, до выхода ESLint 10; пакет декларативный и без зависимостей, но upstream-тестов на v10 нет — это записывается как известный риск, а не замалчивается.

**Собственного JS/TS QC wrapper'а не создаётся.** Результат выражается обычными `package.json` scripts / Make-таргетами и нативными конфигами.

### 14.4 Единственный непокрытый пункт — max class lines

Ни ruff, ни pylint, ни ESLint, ни Biome не имеют правила «максимум строк в классе» `[V]`. Единственная находка — `flake8-small-entities` `FSE101`: версия 0.1.0, один релиз (19.04.2024), домашняя страница на личном git-сервере.

Решение: **defer, не писать код.** Замена — `max-lines` на файл плюс проектная конвенция «один основной класс на файл», которую проверяет reviewer. Это честно закрывает исходную боль пользователя («100 000 строк в десяти файлах»), потому что предельный размер файла её и ловит. Если через реальные проекты обнаружится, что god-объекты просачиваются внутри допустимых файлов, вопрос вернётся с доказательством.

### 14.5 Baseline

`.quality/code-health-baseline.json` **удаляется**. Он вводился ради brownfield, но заданием прямо запрещено вводить baseline только ради adoption. Начинаем с обычных настраиваемых порогов: `mo-setup` замеряет фактическое распределение (`ruff check --statistics`, `eslint --format json`) и предлагает пороги, которые проект проходит **сегодня** или с небольшим числом правок. Дальше пороги двигаются вниз отдельными осознанными изменениями. Вечного разрешения старого долга не возникает, потому что нет файла, куда его записать.

`adoption-manifest.json` удаляется вместе с `adoption.mts` и правилом «менять код только внутри certified roots»: оно защищало 100%-purpose-требование, которое теперь достигается сразу конфигом линтера, без поэтапного расширения.

---

## 15. E2E: три формы и условная роль tester'а

### 15.1 Классификация и владельцы

| Форма | Пример | Кто выполняет | Где живёт |
|---|---|---|---|
| **console smoke** — короткая детерминированная | перезапустить docker, дёрнуть endpoint, сверить вывод | **executor** | `make mo-smoke`, может входить в `mo-qc` |
| **agentic benchmark** — недетерминированное поведение | прогон бенчмарка агента, много времени | **отдельная сессия tester'а** | `make mo-e2e` печатает help |
| **browser E2E** | `agent-browser` + его skill | **отдельная сессия tester'а** | `docs/e2e*` |

Отдельный tester **не создаётся** для lint/typecheck/unit/integration и для короткого smoke. Решает оркестратор — по проектному E2E contract и по фактическому способу выполнения, а не по типу изменения.

`agent-browser` установлен `[V]` (0.33.2), и его skills лежат **внутри CLI**, не в каталоге skills: `agent-browser skills list` → `agentcore, core, derive-client, dogfood, electron, slack, vercel-sandbox`; получение — `agent-browser skills get core --full`. `mo-e2e` обязан требовать прочитать нужный из них, а не пересказывать.

### 15.2 `make mo-e2e` как help

Для benchmark/browser таргет не обязан выполнять E2E без агента:

```make
mo-e2e:
	@echo "E2E in this project = browser scenarios, run by an agent."
	@echo "Prereqs : docker compose up -d && make seed"
	@echo "Read    : docs/e2e/index.md, then the relevant group file"
	@echo "Skill   : agent-browser skills get core --full"
	@echo "Result  : ./e2e-out/  ·  Cleanup: make e2e-clean"
```

Это наглядно, тривиально и не требует ни registry, ни schema.

### 15.3 Хранение сценариев

По размеру, а не по навязанной структуре:

```text
несколько коротких сценариев      → docs/e2e.md
несколько независимых групп       → docs/e2e/index.md + docs/e2e/<group>.md
```

`index.md`: environment, prerequisites, запуск, cleanup, каталог групп. Каждый файл группы обязан объяснить, **когда её выбирать**, чтобы tester брал релевантный subset. Полный прогон всех групп не является default.

Benchmark описывается текстом рядом: команды, время, правила выбора. Наличие benchmark не требует JSON.

### 15.4 `e2e.json` — удаляется

Задание требует оставить JSON только если judges покажут функцию, которую нельзя достаточно хорошо выполнить через читаемые docs, Make help и agent selection. Проверяю обе функции:

- *Selection plan по business_links/tags.* Заменяется: tester читает diff и `docs/e2e/`, где каждая группа объясняет свою применимость, и выбирает subset словами. Reviewers получают lens «полон ли выбранный набор для этого diff». Это ровно то, что делали `E2ESelectionPlan` + `planDigest`, но без 289 строк `e2e-registry.mts`, `sealPlan`, `computePlanDigest` и без metadata guard.
- *`last_run` метаданные.* Заменяются `git log`: если E2E проходил на candidate, это видно по истории и по последнему сообщению tester'а. Отдельный commit, меняющий одно поле JSON, плюс `verify-e2e-metadata`, плюс canonical-JSON-projection в digest — это вся конструкция, существовавшая ради self-reference, которого без `last_run` просто нет.

Вместе с `e2e.json` удаляются: `verify-e2e-metadata` таргет, `snapshot.mts:verifyMetadataCommit`, canonical-JSON projection, `e2e_check.py`.

`always_required` как поле исчезает, но идея сохраняется текстом: `docs/e2e/index.md` обязан назвать сценарий-канарейку, который запускается всегда.

---

## 16. Review/E2E lifecycle и защита от проверки разных ревизий

### 16.1 Конкретные failure scenarios (задание требует показать их, а не постулировать)

| # | Сценарий | Ловит ли `refs/mo/candidate` + сверка sha |
|---|---|---|
| 1 | Reviewer A закончил на `a1`, executor успел закоммитить `a2`, Reviewer B смотрит `a2` | **да**: B сообщает `a2`, A сообщил `a1`, оркестратор видит расхождение и перезапускает A |
| 2 | Executor чинит findings во время открытого E2E | **да**: tester сообщает sha, на котором прогонял; он != текущего candidate → результат stale |
| 3 | Reviewer работал в грязном рабочем дереве и видел незакоммиченные правки | **да**: reviewer обязан отчитаться `git rev-parse HEAD` и `git status --porcelain`; непустой status делает review невалидным |
| 4 | Rebase/amend с идентичным деревом | **нет**: sha меняется → подтверждения инвалидируются. Цена — один лишний прогон QC. Пользователь явно сказал, что сохранение attestations через rebase недостаточное основание для digest |
| 5 | Formatter внутри `mo-qc` переписал файлы, которые сам же проверял | **частично**: `git status --porcelain` после gate обязан быть пуст — это правило skill, а не receipt. Достаточно: mutation виден сразу |
| 6 | Два gate шли параллельно на разных worktree с разных sha | **да**: оба отчитываются sha |

Ни один из шести не требует криптографического ledger'а. Пятый — единственный, где digest давал что-то сверх, и то же даёт одна команда `git status`.

### 16.2 Минимальный механизм

```bash
# executor сделал чистый commit
git rev-parse HEAD                       # → a1b2c3d
git update-ref refs/mo/candidate a1b2c3d

# каждому gate передаётся sha; каждый gate возвращает свой
# reviewer / tester / qc-runner обязан начать ответ с:
#   CANDIDATE: <git rev-parse HEAD>
#   WORKTREE:  <clean|dirty>

# оркестратор перед объявлением готовности:
git rev-parse refs/mo/candidate          # то, что должно быть подтверждено
# и сверяет, что все четыре ответа назвали именно этот sha
```

`refs/mo/*` не попадает под `git push` (пушатся `refs/heads` и `refs/tags`), не показывается в `git tag`/`git branch`, но читается одной командой и **переживает смерть оркестратора**. Это единственный факт, который методология сохраняет вне сессий.

Дисциплина: пока открыты gates, executor ждёт. Если он всё же закоммитил — расхождение sha это покажет.

### 16.3 Worktrees — сравнение четырёх вариантов

| Вариант | Оценка |
|---|---|
| всё в feature branch с дисциплиной commits | reviewer'у checkout не нужен вовсе: `git show <sha>`, `git diff <base>..<sha>` работают независимо от HEAD |
| отдельный worktree только для детерминированных gates | нужен там, где gate **исполняет** код |
| отдельные worktrees для reviewers и E2E | reviewers — избыточно, E2E — обоснованно |
| **полный отказ от обязательных worktrees** | **выбрано как default**, с точечным исключением |

Правило: **worktree создаётся тогда и только тогда, когда gate должен собрать или запустить код параллельно с продолжающейся работой executor'а.** Практически это E2E tester и иногда QC. Reviewers работают чтением. Для E2E — `herdr worktree create` (Herdr) или `git worktree add --detach`. `worktree.mts`, `worktree run`, gate receipts и `META_O_*` env-переменные удаляются.

Fresh detached worktree **не** объявляется обязательным для E2E tester'а — это решение оркестратора по ситуации.

### 16.4 Порядок

```text
candidate → make mo-qc → короткий smoke → два review (параллельно, независимо)
  → батч замечаний → executor → новый candidate → mo-qc → два review …
  → после чистого review: E2E
  → батч E2E-падений → executor → новый candidate → mo-qc → E2E …
  → если E2E-фиксы изменили candidate, повторить review; и наоборот
  → готово, когда один sha назван всеми четырьмя
```

Review не перезапускается после каждой мелкой E2E-правки — сначала стабилизируется текущий контур. Число циклов не ограничено и само по себе не эскалируется.

---

## 17. Recovery после ручного перезапуска и после reboot

Пользователь запускает `mo-orchestrate` с тем же исходным prompt'ом. Дальше — обычное инженерное расследование:

```bash
git rev-parse --abbrev-ref HEAD          # где мы
git log --oneline -20                    # что уже сделано
git status --porcelain                   # чисто ли
git rev-parse --verify -q refs/mo/candidate
git diff --stat $(git merge-base HEAD main)..HEAD
ls spec/ && grep -l "## Reuse research" spec/*.md
herdr agent list                         # живые worker'ы + их статусы
herdr agent read <name> --source recent-unwrapped --lines 200
make mo-qc                               # реальность, а не воспоминание
cat docs/todo.md
```

Из этого восстанавливается: есть ли spec и прошла ли она reuse; есть ли candidate; работает ли ещё executor; проходят ли проверки. Дальше — либо продолжение, либо **один конкретный вопрос** пользователю («вижу candidate `a1b2c3d` и мёртвую сессию reviewer-2 — перезапустить review-2 или ты уже видел его вердикт?»).

Exact session-fidelity, checkpoint replay и автоматическое восстановление всех actors **не обещаются**. Native сохранение сессий полезно и используется, если backend его даёт (`omnigent resume`, `claude -r`, `codex resume` `[V]`), но не является требованием.

Если реальность недостаточна или противоречива — конкретный вопрос, а не симуляция уверенности.

---

## 18. `mo-watchdog`

**Baseline 1:1.** Одна watchdog-сессия наблюдает одного оркестратора. Multi-project — отдельное доказанное расширение, не baseline: он усложняет идентификацию, recovery и реализацию, а выигрыш неочевиден.

**Flow.** `mo-orchestrate` перед запуском executor'а спрашивает один раз; при согласии:

```bash
P=$(herdr pane split --current --direction down --cwd "$PWD" --no-focus | jq -r .pane_id)
herdr agent start wd-1 --kind claude --pane "$P" -- --model <cheap>
herdr agent prompt wd-1 "Read the mo-watchdog skill. Watch agent 'orch-1' in
  workspace $HERDR_WORKSPACE_ID, project $PWD. Report to the user, not to me."
```

**Что делает — и, главное, чего не делает.** Цикл:

```bash
while :; do
  herdr agent wait orch-1 --until idle --timeout 900000 || true
  S=$(herdr agent get orch-1 | jq -r .agent_status)
  case "$S" in
    blocked) herdr notification show "orchestrator blocked" --sound request ;;
    done|idle)
      # прочитать хвост; если оркестратор явно ждёт человека — уведомить;
      # если он просто замолчал в середине работы — один короткий пинок
      ;;
  esac
done
```

Существенно: `herdr agent wait --until idle --timeout 900000` **блокирует**, поэтому агент не крутит опрос и не жжёт токены. Один turn на событие, а не на секунду.

**Пределы.** Watchdog не мутирует состояние (мутировать нечего), не инструктирует worker'ов, не создаёт replacement-оркестратора автоматически, не имеет config'а, не имеет systemd/launchd, не имеет своего runtime. Максимум — разбудить и уведомить человека.

**Что при его собственной смерти?** Ничего не ломается: watchdog — удобство. Пользователь может проверить: `herdr agent get wd-1`. Skill обязан это сказать прямым текстом, а не делать вид, что наблюдатель бессмертен.

**Нужен ли standalone `.mjs`?** Нет. Единственная функция, которую LLM-сессия может выполнять хуже детерминированного процесса, — точный таймер; она заменяется блокирующим `agent wait --timeout`, то есть таймером самого backend'а. Удаляются: `watchdog/*` (1015 строк), `watchdog-cli.mts` (615), `watchdog-home.mts` (142), `classifier.mts`, `decide.mts`, `watchdog.json`, `watchdog-memory.json`, `watchdog.lock`, `watchdog.log`, оба service-юнита.

---

## 19. Context / cache / compaction: честная таблица по каждому backend

Задание требует таблицы `available | inferred | unavailable`, практической рекомендации и fallback'а. Никаких перенесённых порогов.

### Herdr `[V]`

| Сигнал | Статус | Основание |
|---|---|---|
| размер/заполненность контекста | **unavailable** | в `AgentInfo` нет; `tokens` — display-метаданные |
| время последнего turn | **unavailable** | во всей схеме только `started/finished/installed_unix_ms` у плагинов; выводится извне |
| признаки native compaction | **unavailable** | grep `compact*` по схеме — ноль |
| cache TTL / цена cold resume | **unavailable** | Herdr про подписки ничего не знает |
| сохранение состояния при resume | **available** | native resume агента + `agent_session` указатель на транскрипт |
| статус для решений | **available** | `idle/working/blocked/done/unknown` |

**Рекомендация:** решения о ротации сессии принимаются **эвристически по наблюдаемым фактам** — сколько сообщений было, сколько прошло времени, начал ли агент повторяться или терять инструкции. Спека обязана называть это heuristic. **Fallback:** если поведение агента деградировало, поднять свежего worker'а с task/spec и Git-реальностью — это дёшево именно потому, что spec читается по пути, а состояние проекта живёт в git. Собственный cache-tracker **не создаётся**: у Herdr нет исходных данных, из которых его можно построить честно.

Частичное усиление `[V]`: `~/.claude/hooks/herdr-agent-state.sh` уже прокидывает `transcript_path`; размер этого JSONL — грубый, но **реальный** прокси накопленного контекста, доступный через `wc -c`. Это `inferred`, не `available`, и годится только как «пора подумать о ротации», а не как порог.

### Claude Code route `[V]`

| Сигнал | Статус |
|---|---|
| роспись живых сессий с состоянием | **available** — `claude agents --json` |
| управление компакцией | **available** — `--autocompact <auto\|tokens>` |
| продолжение / ветвление | **available** — `-c`, `-r`, `--fork-session` |
| бюджет | **available** — `--max-budget-usd` |
| текущее заполнение контекста числом | **unavailable** через CLI |

Это самый информативный route, и он единственный даёт машинную роспись сессий вне backend'а.

### Codex route `[V]`

`exec resume --last`, `resume`, `fork`, `archive` — есть. Context/compaction телеметрии в `--help` нет. `[A]` В TUI показатели контекста могут отображаться визуально; это `inferred` и годится только для человека.

### Omnigent `[V]`

| Сигнал | Статус |
|---|---|
| полный транскрипт | **available** — `session export` |
| размер контекста числом | **unavailable** |
| сохранение при resume | **available** — `resume`, `--fork` |
| импорт нативных транскриптов | **available** — `import --harness claude\|codex` |

Размер экспортированного транскрипта — тот же `inferred` прокси, но здесь он получается штатной командой.

### Paseo `[A]`

Всё — **unverified**. Skill начинается с checklist'а, а спека не имеет права предполагать иное.

### Общее правило

> Ни один порог не переносится между провайдерами без измерения. Пока измерений нет, решение «продолжать старую сессию / native compact / поднять свежую» принимается по наблюдаемому поведению агента, и это записывается как heuristic. Собственный cache tracker не создаётся ни для одного backend, где нет исходных данных.

«Тёплый контекст без искусственных пустых turns» достигается единственным честным способом: не растягивать паузы между turn'ами там, где это можно, и не делать вид, что мы измеряем TTL, которого не видим.

---

## 20. PATH-wrappers и permissions

Проверено на этой машине `[V]`:

```text
claude → /Users/alex/bin/claude  → exec /opt/homebrew/bin/claude \
           --dangerously-skip-permissions --append-system-prompt '<…>' "$@"
codex  → /Users/alex/bin/codex   → exec /opt/homebrew/bin/codex \
           --dangerously-bypass-approvals-and-sandbox "$@"
```

**Контракт:**

1. Backend и skills запускают агентов **по имени** (`claude`, `codex`, `opencode`) через обычный `PATH`. Явно запрещено: искать бинарник в `/opt/homebrew/bin`, в `/Applications/ChatGPT.app/Contents/Resources/`, в Caskroom по абсолютному пути.
2. Запрещено добавлять свои permission/sandbox-флаги: методология не конструирует набор approval-флагов вообще.
3. Preflight выполняет `command -v claude codex opencode` и **показывает** результат. Если резолвится не туда, где пользователь держит wrapper'ы, — предупреждение, не автоматическое исправление.
4. Содержимое wrapper'а **не копируется** ни в какой конфиг методологии.
5. Если backend всё же обошёл wrapper и агент выдал approval-prompt — это **configuration failure**, о котором оркестратор сообщает, а не стадия workflow, которую надо обрабатывать.

Permission policy принадлежит локальному окружению; методология отвечает ровно за то, чтобы его не обходить. Это же снимает целый класс несуществующих проблем: `--dangerously-skip-permissions` в wrapper'е означает, что «обычные tool approvals» в goal-режиме уже сняты.

Отдельная деталь `[V]`: wrapper Claude добавляет `--append-system-prompt` с собственным текстом пользователя. Ещё одна причина не обходить wrapper — обход молча выключил бы личные настройки поведения.

---

## 21. Рефлексия после существенных сбоев

**Trigger — минимальный и конкретный.** Ровно три условия, любое из которых достаточно:

1. Дефект прошёл через QC и оба review и был пойман только на E2E (или человеком).
2. Один и тот же класс замечаний возникает в **третьем** батче подряд.
3. Executor встал так, что потребовалось ручное вмешательство человека, не связанное с внешней блокировкой.

Всё остальное рефлексии не требует. Обычный run завершается без ретроспективы.

**Формат — одна строка в существующем файле.** Никакого lessons database, никаких transcripts:

```markdown
| Area | Problem | Why checks missed it | Proposed change |
|---|---|---|---|
| mo-qc / TS | typed lint не ловил unchecked index access | strictTypeChecked включён, noUncheckedIndexedAccess — нет | отдельная feature: включить флаг и починить ~40 мест |
```

Запись достаточно содержательна, чтобы позже превратиться в spec без восстановления исчезнувшей сессии: area/path, проблема, практический риск, ожидаемая форма исправления.

**Рефлексия не расширяет текущую feature.** Либо локальное исправление в пределах scope, либо строка в `docs/todo.md`. Оркестратор не берёт methodological follow-up в работу самовольно — это делает пользователь отдельным запуском (§6.3 задания: self-hosting принцип, но не автоматическая рекурсия).

---

## 22. Distribution: apm / skills без своих скриптов

`install.sh` (203 строки) и `update.sh` (51) удаляются. Проверено `[V]`: `apm` 0.27.0 установлен, `skills` (vercel-labs) — нет.

`apm install --help` `[V]` сообщает: *«supports APM packages, **Claude skills (SKILL.md)**, and plugin collections (plugin.json); auto-creates apm.yml»*. Есть `apm pack`, `apm publish`, `apm.lock.yaml`, `apm audit`, и `--target/--runtime` со значениями `agent-skills, claude, codex, opencode, cursor, …`. То есть репозиторий с skill-каталогами устанавливается штатно.

**Layout:**

```text
skills/
  mo-orchestrate/SKILL.md
                 references/goal-templates.md
                 references/lifecycle.md
  mo-herdr/SKILL.md
  mo-omnigent/SKILL.md
  mo-paseo/SKILL.md
  mo-reuse/SKILL.md
  mo-review/SKILL.md
  mo-e2e/SKILL.md
  mo-setup/SKILL.md
           references/qc-python.md
           references/qc-typescript.md
           references/makefile-contract.md
           references/agents-md-fragment.md
  mo-watchdog/SKILL.md
scripts/
  mo-models.mjs
  mo-lastmsg.mjs
apm.yml
README.md
```

Скрипты лежат **рядом** со skills, а не внутри них: их использует `mo-orchestrate`, и дублировать их в каждый skill не нужно. `mo-setup/SKILL.md` объясняет, как добавить `scripts/` в PATH одной строкой, либо вызывать по абсолютному пути от места установки.

`[A]` Точная схема `apm.yml` и то, требует ли apm skill-каталоги на верхнем уровне или допускает `skills/`, проверяется в Phase 0 командой `apm install --dry-run .`. Дизайн не зависит от ответа: при необходимости каталоги поднимаются на верхний уровень репозитория.

**Чего категорически нет:** собственного package/update lifecycle, скрытых capability suites при установке, project version pin, git hooks, изменения проектов при установке.

---

## 23. Tooling audit

Полная классификация. Для каждого `delete`/`replace` названо, чем покрывается функция; для каждого `keep` — конкретный риск.

| Компонент | LOC | Решение | Обоснование / замена |
|---|---|---|---|
| Публичный `meta-o` CLI (router, 531) | 531 | **delete** | Все verbs заменяются прямыми `herdr`/`git`/`make` |
| `run/*` (start, list, show, route, transition, cleanup…) | 848 | **delete** | git + диалог |
| `session/*` + write-ahead + session-state | 1101 | **replace with direct CLI** | `herdr agent start/prompt/wait/get/read` напрямую |
| `results/*`, `findings-cli`, `decisions` | 895 | **delete** | Полный текст reviewer'а → executor'у; решения — в коде и `docs/` |
| `gates/*` (snapshot, e2e, qc, review, worktree, spec) | 502 | **delete** | `git rev-parse` + `make` + `git worktree` |
| `preflight-cli` + `core/preflight` | 631 | **keep but move into skill** | Preflight = чтение Makefile/docs/PATH; это 15 строк инструкции |
| `weakening` + `core/policy` (TOML-парсер) | 580 | **delete** | Ослабление конфига видно в `git diff`; reviewers смотрят |
| `ownership` (takeover, generation fencing) | 145 | **delete** | Одновременных оркестраторов не бывает; пользователь запускает одного |
| `candidate-guards`, `gate-order`, `gate-evidence` | 447 | **delete** | Порядок — правило в skill; изоляция — `git status` |
| `core/fsm` | 509 | **delete** | Рассуждение вместо графа состояний |
| `core/state-store` | 495 | **delete** | `refs/mo/candidate` — всё, что переживает смерть оркестратора |
| `core/findings` | 448 | **delete** | Structured JSON не требуется |
| `core/snapshot` | 300 | **delete** | commit sha |
| `core/e2e-registry` | 289 | **delete** | `docs/e2e*` |
| `core/knowledge` + `knowledge-files` + `module-anchors` | 641 | **delete** | Система якорей упраздняется (§11.2) |
| `core/adoption` | 131 | **delete** | Adoption manifest упраздняется |
| `core/qc` | 239 | **delete** | exit code + вывод |
| `core/spec-input` (HTTPS fetch, SHA-256, blob) | 254 | **delete** | Путь к файлу; внешняя spec материализуется reuse-commit'ом |
| `core/model-set` | 87 | **replace with smaller helper** | `mo-models` + `models.json` |
| `core/config`, `paths`, `project-key`, `safe-fs` | 706 | **replace with smaller helper** | Один `~/.meta-o/models.json`; hash пути внутри `mo-models` |
| `core/git`, `clock`, `hash`, `canonical-json`, `markdown`, `redact`, `role-view`, `e2e-result` | ~800 | **delete** | Прямой `git`; остальное обслуживало удалённые механизмы |
| `SessionAdapter` абстракция | — | **delete** | §5.4: приводит три backend к худшему знаменателю; уже протекает семью методами |
| Herdr adapter (`herdr*.mts`) | 1355 | **replace with direct CLI** | Прямые команды в `mo-herdr` |
| Marker-envelope `META_O_RESULT_BEGIN/END` | — | **delete** | Решал задачу поверх канала, теряющего данные |
| `capability-suite` | 592 | **delete** | Одна probe-команда на preflight; регрессия видна при первом использовании |
| Direct integration flows Herdr / Omnigent / Paseo | — | **keep but move into skill** | Три тонких skill'а (§5) |
| `execute-feature` SKILL | 144 | **delete** | Карта переноса §6.2 |
| `orchestrate-feature-herdr` SKILL | 327 | **replace** | `mo-orchestrate` + `mo-herdr` |
| `review-feature` SKILL | 134 | **replace** | `mo-review` (полный loop, а не одна роль) |
| `adjudicate-technical` SKILL | 69 | **delete** | Лестница §8.4 внутри `mo-review` |
| `research-reuse` SKILL | 58 | **keep but move into skill** | → `mo-reuse`, теперь обязателен и коммитит раздел spec |
| `test-e2e` SKILL | 119 | **replace** | `mo-e2e`, только benchmark/browser |
| `adopt-project` SKILL | 125 | **replace** | `mo-setup` |
| `install.sh` / `update.sh` | 254 | **delete** | apm / skills |
| Watchdog (`watchdog/*`, CLI, home) | 1772 | **replace with skill** | `mo-watchdog` (§18) |
| `service/*.plist`, `*.service` | — | **delete** | Сессия вместо демона |
| `quality/*.mjs` (собственный QC этого проекта) | 1196 | **replace** | ruff/ESLint-эквиваленты по §14 |
| `.quality/qc-manifest.json` | — | **delete** | Consumer'а нет (§14.1) |
| `KnowledgeImpactPlan` | — | **delete** | Факт после реализации |
| `e2e.json` + verification metadata | — | **delete** | §15.4 |
| `adoption-manifest.json` | — | **delete** | §14.5 |
| `code-health-baseline.json` | — | **delete** | Настраиваемые пороги от текущего состояния |
| Custom import graph (621 Python + 175 mjs) | 796 | **replace** | `import-linter` / `dependency-cruiser` |
| Markdown parsing (`markdown.mts`, парсер в knowledge_check) | ~380 | **delete** | Проверять нечего после отмены якорей |
| Python QC template | 2242 | **replace** | `pyproject.toml` + готовые инструменты |
| TypeScript QC recommendations | — | **keep but move into skill** | `mo-setup/references/qc-typescript.md` |
| Purpose / knowledge checks | 524 | **replace** | `interrogate` + `ruff D` / `jsdoc/require-jsdoc` |
| Reflection / lessons flow | — | **keep but move into skill** | Три trigger'а + строка в `docs/todo.md` |
| Durable rationale отклонённых findings | — | **keep but move into skill** | Правило трёх условий §8.5 |
| `mo-models` | новый ~250 | **keep** | Риск: ритуальная конфигурация или дорогое чтение логов при каждом старте |
| `mo-lastmsg` | новый ~80 | **keep** | Риск: потеря полного вердикта reviewer'а при truncation — hard criterion |

**Итог:** удаляется ≈15.6k строк `src/` + 9.9k строк tests + 2.2k Python-шаблона + 1.2k `quality/` + 254 строки installer'ов. Добавляется ≈330 строк скриптов и ≈840 строк markdown-skills.

---

## 24. Интерфейсы и контракты

Дизайн почти не содержит API, поэтому границы описаны как конкретные вход/выход.

### 24.1 `mo-models.mjs`

```text
mo-models list [--json]
  in  : —
  out : {"models":[{"id","route","family","vendor","lastSeenAt","sources":[]}],
         "sources":[{"kind":"claude-sessions","scanned":N}],
         "notes":[]}
  err : неопознанный формат → {"models":[],"notes":["unrecognised …"]}, exit 0
        нет ~/.meta-o или нет прав → stderr, exit 1
  инвариант: без сети; без запуска агентов; дедуп по effective id

mo-models show [--project PATH] [--json]
  out : effective set = default ⊕ projects[key].set

mo-models save --project PATH        (stdin: JSON частичного набора)
  out : {"saved":true,"key":"3f2a9c1b7e4d"}
  err : невалидный JSON → exit 2

mo-models check [--json]
  out : {"suggestions":[{"role","from","to","evidence"}]}
  правило: to.vendor == from.vendor && to.family == from.family
           && to впервые виден после catalog.fetchedAt
```

### 24.2 `mo-lastmsg.mjs`

```text
mo-lastmsg --transcript PATH [--role assistant] [--json]
  in  : путь к JSONL (Claude projects | Codex rollout)
  out : полный текст последнего сообщения роли, на stdout
  err : файл не найден → exit 1
        формат не распознан → stderr «unrecognised transcript format», exit 3
  инвариант: только чтение; не запускает агентов; не знает о workflow;
             никогда не усекает — либо полный текст, либо ошибка
```

### 24.3 Границы skill↔skill

```text
mo-orchestrate → mo-herdr|mo-omnigent|mo-paseo
  in : роль, модель, cwd, текст prompt'а
  out: session handle; статус idle|needs_attention; полный последний ответ

mo-orchestrate → mo-reuse
  in : путь к spec
  out: изменённый раздел «## Reuse research» + один commit

mo-orchestrate → mo-review   |   пользователь → mo-review
  in : artifact ref (+ spec, + число reviewer'ов)
  out: полные тексты вердиктов, переданные автору дословно

mo-orchestrate → mo-e2e
  in : candidate sha, docs/e2e*
  out: статусы сценариев + evidence + sha, на котором прогоняли

любой gate → mo-orchestrate
  out (первые две строки ответа, обязательны):
      CANDIDATE: <sha>
      WORKTREE:  clean | dirty
```

### 24.4 Файлы, которые методология создаёт

```text
~/.meta-o/models.json          единственный persistent artifact вне репозитория
refs/mo/candidate              git-ref; единственное, что переживает оркестратора
.mo/out/<role>-<n>.md          временные полные ответы worker'ов, git-ignored
```

Три позиции. Ни `state.json`, ни `runs/`, ни `findings/`, ни `receipts/`, ни `watchdog.*`.

---

## 25. Trade-offs

**Дисциплина вместо принуждения.** Правило «gate называет sha» держится на послушании агента, а не на коде. Принято, потому что цена нарушения — один лишний прогон, а цена принуждения — тот control plane, который удаляется. Смягчение: правило проверяемо в один взгляд, а нарушение видно немедленно.

**Дублирование против drift.** Три backend skill'а повторяют структуру S1–S7. Альтернатива — общий skill с ветвлениями — читается хуже и всё равно требует по ветке на backend. Дублируется **форма**, не методология: методология живёт только в `mo-orchestrate`.

**Отмена якорей против трассируемости.** Теряется машинная проверка «каждый модуль ссылается на архитектурное решение». Принято, потому что checker проверял наличие ссылки, а не её осмысленность (D-022 это признаёт), при цене ~640 строк и постоянного ритуала. Причинность сохраняется тем, что purpose обязан объяснять «зачем», а reviewers это судят.

**`mo-models` против чистого skills-first.** Единственный скрипт, у которого есть внешняя зависимость от чужих форматов. Принят по «время человека дороже токенов» и обезврежен контрактом деградации.

**Goal только до DoD (вариант C).** Теряется автопродолжение через review-циклы. Принято намеренно: автопродолжение в момент, когда executor обязан **ждать** независимый вердикт, — это не польза, а порча candidate.

**Coverage 100% при риск-пропорциональной глубине.** Компромисс между hard constraint пользователя и текстом GRACE. Каждый символ обязан быть различим по цели (механически), но одна строка достаточна там, где цель очевидна (судит reviewer). Ни одна из двух позиций не выигрывает целиком, и это названо прямо, а не замаскировано.

---

## 26. Риски и митигации

| Риск | Вероятность | Митигация |
|---|---|---|
| Worker не пишет полный ответ в файл (потерял инструкцию после compaction) | средняя | Второй независимый путь `mo-lastmsg` по JSONL; третий — `herdr attach`. Усечённый хвост **никогда** не считается результатом |
| `/goal` у Codex CLI не существует или недоступен через Herdr | **высокая** (в `--help` его нет `[V]`) | Процедура §6.3 проверяет наблюдением до старта работы; fallback описан как более слабый и назван так; premature-idle детектор через STATUS-блок |
| Формат session JSONL меняется → `mo-lastmsg`/`mo-models` ломаются | средняя | Оба обязаны деградировать, а не падать: `mo-models` → пустой список + note + exit 0; `mo-lastmsg` → явная ошибка, оркестратор переходит к `attach` |
| Executor коммитит во время открытых gates | низкая | Сверка sha ловит; gate перезапускается |
| Reviewer читает грязное дерево | низкая | Обязательная строка `WORKTREE: clean\|dirty` в ответе |
| Скрытое ослабление QC executor'ом | средняя | Конфиги линтеров трекнуты; `git diff` их показывает; reviewer lens требует смотреть |
| Три backend skill расходятся | средняя | Общий checklist S1–S7 как обязательная структура; методология не дублируется |
| Paseo окажется несовместимым с дизайном | средняя `[A]` | Skill помечен unvalidated; Phase 0 закрывает checklist до объявления поддержки |
| `apm` не примет layout | низкая `[A]` | `apm install --dry-run .` в Phase 0; layout правится без изменения дизайна |
| Оркестратор превращается в implementer'а (ему разрешили читать) | средняя | Явная граница: читать git/spec/Makefile/`AGENTS.md`/`docs/` — да; писать код и проводить полный review — нет |
| Bloat возвращается | **высокая** | Pre-mortem §28 |
| Пороги линтеров превращаются в самоцель | средняя | Правило §14.3: порог, нарушаемый >10% файлов, не поднимается «чтобы прошло» |
| `refs/mo/candidate` забыт при ручных манипуляциях | низкая | Он подсказка, а не источник истины; `git log` восстанавливает картину |

---

## 27. Implementation / migration plan

Обратная совместимость не сохраняется; adapters ради неё не пишутся.

**Phase 0 — верификация допущений (2–3 часа, только чтение и dry-run).** Закрыть все `[A]`: `apm install --dry-run .` на черновом layout; установить Paseo и пройти checklist S1–S7; проверить, поддерживает ли `CLAUDE.md` импорт `@AGENTS.md`; на живой Codex-сессии в Herdr проверить `/goal` процедурой §6.3 и записать наблюдение; прогнать `ruff --preview` c предложенным select на текущем коде и посмотреть объём правок; прогнать `interrogate --fail-under=100 -vv`. **Ни одна строка не удаляется, пока Phase 0 не закрыта** — иначе можно снести механизм до того, как замена подтверждена.

**Phase 1 — skills (день).** Написать девять SKILL.md и references. Ничего не удалять. `mo-orchestrate` пока сосуществует со старым skill.

**Phase 2 — два скрипта (день).** `mo-models.mjs`, `mo-lastmsg.mjs`, с тестами на деградацию (неопознанный формат → корректный отказ).

**Phase 3 — прогон на живой feature (1–2 дня).** Реальная небольшая feature целиком по новому пути, старая система не используется. Это и есть приёмка: если полный вердикт reviewer'а хоть раз потерялся — возврат в Phase 1.

**Phase 4 — удаление (день).** Один commit `remove: meta-o control plane`, удаляющий `src/`, `tests/`, `dist/`, `service/`, `install.sh`, `update.sh`, `quality/`, `templates/python/quality/`, `.quality/`, старые skills. Второй commit — `docs/`: перенос `docs/knowledge/business.md` → `docs/business.md`, `glossary.md` → `docs/glossary.md`, `docs/knowledge/architecture/` → `docs/architecture/`, удаление `e2e.json`, снятие якорей `§B/§A/§M`.

**Phase 5 — самоприменение QC (день).** Этот репозиторий переводится на TS Profile 1 (`tsc --noEmit` + ESLint flat + `node:test`) c конфигом §14.3, `make mo-qc` агрегирует. После Phase 4 в репозитории остаётся ~330 строк JS — QC становится тривиальным.

**Phase 6 — распространение (полдня).** `apm.yml`, `README.md`, публикация; проверка установки на чистой машине через `apm install`.

**Порядок неслучаен.** Удаление идёт **после** доказанного прогона, а не до, — иначе теряется контрольный пример.

---

## 28. Pre-mortem: почему bloat вернётся и что этому мешает

Представим, что через полгода мы снова имеем 10k строк control plane. Как это произошло?

1. **«Агент иногда забывает правило — обернём его в скрипт».** Первое обёртывание всегда выглядит дёшево. → **Правило:** скрипт не пишется, пока правило не нарушалось трижды и не зафиксировано тремя строками в `docs/todo.md`. Двух раз мало: два раза — это совпадение.
2. **«Скрипту нужно знать, что было раньше — добавим маленький JSON».** Так родился `state.json`. → **Правило:** ни один скрипт методологии не пишет файлов, кроме `~/.meta-o/models.json`. Нужно состояние — значит нужен git-ref или ничего.
3. **«Четвёртый backend — пора выделить общий интерфейс».** → **Правило:** общий executable adapter не создаётся раньше пятого backend'а, и только с показанным списком операций, идентичных во всех пяти. Текущие три расходятся именно в существенном (§5.4).
4. **«Reviewer вернул неструктурированный текст — введём schema».** → **Правило:** structured transport вводится только когда появится **машинный** consumer, который что-то делает с полем. Валидируемость сама по себе — не причина.
5. **«Skill стал длинным — вынесем в scripts/».** Ровно то, что задание называет «разбить proxy layer на большее число scripts и объявить skills-first». → **Правило:** длина skill'а лечится удалением, а не переносом в код. Порог: skill длиннее 200 строк требует объяснения, что из него можно выбросить.
6. **«Пользователь попросил гарантию — добавим gate».** → **Правило:** новый обязательный gate обязан назвать пользовательский failure scenario, который без него уже происходил.

**Проверяемый индикатор здоровья:** суммарный объём кода методологии (не skills) не превышает **500 строк**. Сегодня — 330. Превышение — сигнал провести аудит, а не повод повысить порог.

---

## 29. Decision ledger новой версии

| ID | Решение | Статус | Обоснование |
|---|---|---|---|
| N-001 | Skills-first; уровень 2 (skills + 2 helper'а) | adopted | §2; уровень 3 — контрольный пример стоимостью 25k строк |
| N-002 | Публичный `meta-o` CLI, FSM, `state.json` удаляются | adopted | Их функции покрываются git + backend CLI + диалогом |
| N-003 | Общий `SessionAdapter` не создаётся | adopted | Приводит три backend к худшему знаменателю; уже протекает |
| N-004 | Три backend skill по общему checklist S1–S7 | adopted | Дублируется форма, не методология |
| N-005 | `mo-orchestrate` — единый entry, три backend skill'а — механика | adopted | Даёт короткое имя без generic router'а |
| N-006 | У executor'а нет methodology skill | adopted | Compaction делает skill ненадёжным носителем обязательных требований |
| N-007 | Goal живёт до executor-owned DoD (вариант C) | adopted | Избегает и premature completion, и авто-продолжения в ожидании gates |
| N-008 | `/goal` подтверждается наблюдением, а не предположением | adopted | В `codex --help` слова `goal` нет `[V]`; отрицать тоже нельзя |
| N-009 | Fallback без goal называется более слабым явно | adopted | Запрет задания выдавать fallback за эквивалент |
| N-010 | `mo-reuse` обязателен, пишет раздел spec, один первый commit | adopted | Защита от повторного поиска и от бездоказательного `build` |
| N-011 | Внешняя/текстовая задача материализуется в `spec/` тем же commit'ом | adopted | Проще любого blob/digest-протокола |
| N-012 | Structured `Finding` JSON не требуется | adopted | Transport не должен зависеть от парсинга |
| N-013 | Полный ответ = file handoff (осн.) + `mo-lastmsg` (рез.) + attach | adopted | Native full-message у Herdr нет `[V]`; хвост теряет данные |
| N-014 | Хвост панели никогда не является результатом gate | adopted | Hard criterion пользователя |
| N-015 | `refs/mo/candidate` + сверка sha вместо snapshot digest | adopted | Шесть failure scenarios §16.1 закрываются; digest добавлял только rebase-выживание |
| N-016 | Worktree только когда gate исполняет код | adopted | Reviewer'у checkout не нужен |
| N-017 | `~/.meta-o` = один `models.json` | adopted | Настройки и runtime не смешиваются, потому что runtime'а нет |
| N-018 | Global default + редкий project override | adopted | §10.1 |
| N-019 | Upgrade suggestion только при том же vendor+family | adopted | Единственное правило, отличающее преемника от другой модели |
| N-020 | Якоря `§B/§A/§M` упраздняются | adopted | Слабый читатель, высокая цена, неполное off-the-shelf покрытие |
| N-021 | `docs/business.md`, `glossary.md`, `todo.md`, `architecture/` | adopted | Часто читаемое — сразу под `docs/` |
| N-022 | `KnowledgeImpactPlan` удаляется | adopted | Факт после реализации решает ту же задачу без артефакта |
| N-023 | Purpose: 100% coverage механически + риск-пропорциональная глубина у reviewer'а | adopted | Разрешение противоречия hard constraint ↔ GRACE, названное прямо |
| N-024 | Overloads не освобождаются от purpose | adopted | Требование задания; реализуется конфигом `[V]` |
| N-025 | Ноль project-owned QC-чекеров | adopted | Готовые инструменты покрывают всё, кроме max-class-lines |
| N-026 | max class lines — defer | adopted | Единственный готовый инструмент — одна версия 2024 г. на личном git |
| N-027 | `qc-manifest.json`, baseline, `e2e.json`, `adoption-manifest.json` удаляются | adopted | Consumer'а нет; замены названы |
| N-028 | TS default = compatibility profile; fast — по потребности | adopted | Oxlint не имеет JSDoc/size/depth правил `[V]` |
| N-029 | greenfield Node-only → `node:test` | adopted | Стабилен, ноль зависимостей; module mocking — единственный пробел |
| N-030 | Существующий test runner не мигрируется | adopted | Стандартизация не окупает миграцию |
| N-031 | `mo-review` — standalone loop, code-lenses условны | adopted | Сохраняет модульность review cube |
| N-032 | Adjudicator — лестница внутри `mo-review` | adopted | Частота не доказана; содержание — три абзаца |
| N-033 | Второму reviewer'у можно показать спорный finding + rebuttal | adopted | Первый проход остаётся независимым |
| N-034 | Durable rationale по правилу трёх условий | adopted | Сохраняет знание, не создавая шума на вкусовые правки |
| N-035 | Subagents — динамически по размеру diff | adopted | Убирает асимметрию Claude/Codex без ритуального числа |
| N-036 | E2E tester только для benchmark/browser | adopted | Явный anti-goal задания |
| N-037 | `mo-watchdog` — сессия, 1:1, без кода | adopted | Блокирующий `agent wait` заменяет таймер |
| N-038 | Multi-project watchdog | deferred | Только как доказанное расширение |
| N-039 | Context/cache — честная таблица, никаких порогов без измерений | adopted | Telemetry отсутствует `[V]` |
| N-040 | PATH-контракт; wrapper'ы не обходятся; approval-prompt = configuration failure | adopted | §20 |
| N-041 | Рефлексия — три trigger'а, одна строка в `docs/todo.md` | adopted | Без lessons database и отчётного ритуала |
| N-042 | Self-hosting только по воле пользователя | adopted | Оркестратор не расширяет feature собственным workflow |
| N-043 | `install.sh`/`update.sh` удаляются; apm/skills | adopted | `apm install` принимает SKILL.md `[V]` |
| N-044 | Обратная совместимость не сохраняется | adopted | Требование задания |
| N-045 | Порог здоровья: код методологии ≤ 500 строк | adopted | Проверяемый индикатор против bloat |
| N-046 | Paseo помечен unvalidated до Phase 0 | adopted | Не установлен `[V]`; честнее, чем API по памяти |
| N-047 | Общий executable adapter | rejected | §5.4 |
| N-048 | Automatic crash recovery, exactly-once, takeover | rejected | §3 задания |
| N-049 | Spec blob / SHA-256 / mutation detection | rejected | Reuse-commit фиксирует spec в git |
| N-050 | Cognitive complexity в default для Python | deferred | `flake8-cognitive-complexity` — 16 коммитов, pinned на Python 3.7 `[V]` |

---

## 30. Допущения и открытые вопросы

**Допущения, которые я фиксирую и продолжаю (Phase 0 их закрывает):**

- `[A]` `apm` устанавливает skills из репозитория с каталогом `skills/<name>/SKILL.md`. Если требуется верхний уровень — каталоги поднимаются; дизайн не меняется.
- `[A]` `CLAUDE.md` поддерживает `@AGENTS.md`-импорт. Если нет — короткое согласованное дублирование одной страницы.
- `[A]` Paseo CLI имеет `run/ls/logs/wait/send` и собственный skill. Skill помечен unvalidated.
- `[A]` Codex `/goal` может существовать как TUI-команда. Не утверждается ни в одну сторону; проверяется процедурой §6.3 в начале каждого run'а.
- `[A]` `herdr agent start --kind claude` резолвит команду через PATH. Проверяется в Phase 0 сравнением `command -v claude` с фактически запущенным процессом; если Herdr обходит PATH — это блокирующий вопрос к Herdr, а не повод строить свой permission layer.
- `[A]` У Codex нет машинного эквивалента `claude agents --json`. Если найдётся — `mo-omnigent`/`mo-herdr` его используют для статуса.

**Открытые вопросы, требующие данных, а не решения на бумаге:**

1. Насколько надёжно worker'ы соблюдают file-handoff после compaction. Ответ даст Phase 3; если ниже ~90%, `mo-lastmsg` повышается из резервного в основной для Herdr.
2. Оправдан ли `mo-models` на практике или пользователь всё равно печатает id руками. Метрика: если за месяц `mo-models list` вызывался реже трёх раз — скрипт удаляется.
3. Просачиваются ли god-объекты внутри файлов допустимого размера (вопрос max-class-lines). Решается наблюдением, а не заранее.
4. Достаточно ли эвристики «поведение агента деградировало» для решения о ротации сессии, или нужна прокси-метрика по размеру транскрипта.
5. Не окажется ли отмена якорей потерей для очень больших проектов. Признак возврата к обсуждению: reviewers систематически не могут ответить «зачем этот модуль существует» по коду и docs.

**Что я сознательно не решаю в этой итерации:** глобальный архитектурный аудит (отдельный будущий инструмент, §11.2 задания), PHP-профиль QC, multi-project watchdog, точные context/cache-пороги.