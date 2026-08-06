Прежде чем оценивать, зафиксирую рамку проверки. Спецификация сознательно отказывается от собственного control layer, поэтому её корректность держится не на внутренней логике документа, а на реальных возможностях трёх внешних интерфейсов: Herdr 0.8.0, native goal modes Codex/Claude и Omnigent 0.6.0. Задача прямо запрещает принимать утверждения о возможностях backend без проверки, поэтому я проверил их локально: `herdr --version`, `herdr --skill`, `herdr agent {start,prompt,wait,read,send-keys,attach} --help`, `herdr terminal`, `codex --help`, `claude --help`, `opencode --help`, `omnigent --help`, `which -a claude codex opencode`. Также я сверил спецификацию с `spec/2026-08-05-.../task-description.md`, `synthesis.md`, текущими `skills/execute-feature/SKILL.md` и `docs/references/grace.md`. Вывод ниже опирается на эти проверки, а не на пересказ документа.

## Facts & Constraints (White Hat)

**Подтверждено локально и корректно отражено в спеке.**

- Herdr 0.8.0 действительно не имеет native line range: `herdr agent read <TARGET> [--source visible|recent|recent-unwrapped|detection] [--lines N]`. Утверждение §7.2 о «последних N rendered rows» верно.
- `herdr agent prompt --wait` действительно не отслеживает turn: справка прямо говорит «It does not track turns: if the agent is already working, that active turn's completion may satisfy it». §7.1 фиксирует это ограничение точно — это сильное место.
- Herdr agent state vocabulary `idle|working|blocked|done|unknown` и семантика `done` («same underlying idle state after unseen background work finishes») совпадают с §17.
- PATH wrappers реальны: `which -a claude` → `/Users/alex/bin/claude`, затем `/opt/homebrew/bin/claude`; аналогично codex. §12.2 корректен.
- Omnigent 0.6.0 существует с `run`, `resume`, `session`, `attach`, `import`, per-harness launchers — то есть §8 не выдумывает интерфейс, но и почти не специфицирует его.

**Опровергнуто или существенно неполно.**

1. **Установленный Herdr skill прямо противоречит §7.2.** Дословно: «Rows that leave the alternate screen do not enter Herdr's host scrollback, so a larger line count cannot recover them. After that failed read, ask the agent to write its complete response as Markdown in a temporary directory and reply only with the file path, then read the file directly.» То есть native-рекомендованный fallback — ровно тот файловый handoff, который addendum задачи и §7.2 запрещают. Спецификация строит главный gate на пути, который сам backend называет невозможным, и удаляет единственный документированный обход, не предложив взамен проверенного механизма.

2. **`herdr agent attach` не является скриптуемым.** Это прямое интерактивное подключение к терминалу (`detach from direct attach with ctrl+b q`). Orchestrator-агент, работающий в другой pane, не может «прокручивать agent UI через attach» в цикле чтения окон — он заблокирует собственный turn. §7.2 шаг 5 в части attach технически неисполним как написан.

3. **`herdr agent send-keys` — это ввод в агента, а не в scrollback multiplexer.** Справка: «Send key presses to an agent». Для Claude Code/OpenCode TUI клавиши прокрутки обрабатывает само приложение; отправка их idle-агенту с непустым input buffer риск загрязнить следующий prompt. Спека не задаёт ни per-kind key mapping, ни защиту от инъекции в поле ввода, ни правило восстановления фокуса.

4. **Codex имеет native `--no-alt-screen`** («Disable alternate screen mode. Runs the TUI in inline mode, preserving terminal scrollback history»), и §7.1 уже разрешает `herdr agent start ... -- <args>`. Это ровно то, что превращает §7.2 из эксперимента в надёжную процедуру для Codex. Спека не упоминает флаг ни разу — это пропуск проверенного готового решения, то есть нарушение собственного reuse-принципа.

5. **У `claude` и `opencode` эквивалента нет** (`claude --help` даёт только `--ax-screen-reader` и `--print`/`--output-format`; `opencode --help` — только `--print-logs`). Значит по правилу §7.3 обе route для review gate останутся `unsupported`, а §10 требует, чтобы «минимум один reviewer использовал другого vendor относительно executor». Спека не разбирает это пересечение: при Codex-executor и unsupported Claude/OpenCode cross-vendor review недостижим, и весь lifecycle встаёт.

6. **Deliverable «per-backend context/cache/compaction capability table `available | inferred | unavailable`»** (task §4.2, требование №18 к итогу) в спецификации отсутствует полностью. Слово `compaction` встречается только один раз, в acceptance fixtures §7.3. В synthesis это было явно перенесено в Deferred («cache/compaction economics automation»), но задача требовала честную таблицу возможностей, а не отказ от неё.

## Risks & Failure Modes (Black Hat)

**Критический: review gate имеет циклический deadlock без выхода.**
§7.2.8 — если границы не доказаны, gate = `unknown`, reviewer запускается заново. Но причина недоказуемости (длинный ответ в alternate screen) детерминирована: повторный запуск того же reviewer на том же diff даст такой же длинный ответ и такой же `unknown`. Спека запрещает и verbatim-повтор, и файловый handoff, и private transcripts. Итог — бесконечный цикл или ручной вывод «route unsupported» уже после того, как executor потратил полную реализацию. Нужен ограниченный ladder: N попыток → смена surface (print-mode/`--no-alt-screen`) → явный `needs_attention` с named cause.

**Критический: §23 «Blocking architecture questions отсутствуют» — неверное утверждение.** Спека сама признаёт, что при провале Phase 0 fixture route становится unsupported. Если это Claude и OpenCode одновременно, меняется не «статус route», а архитектура review (нужны print-mode reviewers либо иной transport). Это определение blocking question. Заявление о его отсутствии создаёт ложное ощущение implementation-readiness.

**Major: review scope не определён.** §10: «читает полный artifact/spec и Git diff названного SHA». У feature из 5 commits `git diff <SHA>` и `git show <SHA>` дают разное, а merge-base с default branch — третье. Reviewer может проверить только последний commit и выдать PASS. Нужна пара `BASE_SHA...CANDIDATE_SHA` и явная команда.

**Major: candidate freeze — только декларация.** §5.4 «Candidate заморожен на время gates», но ни один шаг не проверяет `git rev-parse HEAD` и `git status --porcelain --untracked-files=all` до и после каждого gate. Reviewer с write permissions, formatter, запуск тестов, генерация lock-файла — всё это меняет дерево без нового SHA, и правило «любой SHA инвалидирует gates» не срабатывает, потому что SHA не изменился. Это ровно тот false-completion, ради которого раньше существовал snapshot digest; удаление digest оправданно, но замена (две дешёвые git-команды) не выписана.

**Major: `mo-review` как standalone skill архитектурно не закрыт.** §4 объявляет его вызываемым напрямую, §10 описывает политику, но нигде нет: какой backend он использует, как находит/создаёт двух reviewer actors, как адресует автора для fixes, что делать, если Herdr отсутствует (`HERDR_ENV != 1`) и Omnigent тоже. Для non-code artifacts противоречие ещё жёстче: template verdict требует `CANDIDATE: <full SHA>` и `WORKTREE: clean|dirty`, а задача §5.1 требует применимости к spec/документу/презентации, в том числе untracked. Контракт входа для non-code случая отсутствует.

**Major: goal deactivation не специфицирована.** §6: «Во время независимых review/E2E goal выключена, чтобы executor не изменил candidate под проверками». Каким именно способом? Для Codex это `/goal pause|clear`, для Claude — свой механизм; спека не называет ни команду, ни способ подтвердить, что goal действительно неактивна. Без этого самый опасный сценарий (executor продолжает автономно коммитить во время review) остаётся ничем не предотвращён, а §5.4 freeze опирается именно на него.

**Major: `mo-models.mjs` — кандидат в новый скрытый subsystem.** Нет CLI signature, exit codes, stdout-формата, поведения при повреждённом JSON, atomic write/locking, грамматики строки `"route/model/effort"`, схемы `dismissedUpgrades`, алгоритма отличия successor release от sibling family («доказанное новое release generation» — не алгоритм). Отдельно: helper объявлен использующим «official SDK», но `install.sh` удалён, а APM/skills копируют файлы без установки зависимостей. Откуда возьмётся `node_modules`? Либо helper обязан быть zero-dependency (и тогда источники — CLI вроде `opencode models`), либо distribution требует install step, которого спека не допускает. Это внутреннее противоречие §15 и §19.

**Major: Make-контракт противоречив.** §5.4 безусловно выполняет «orchestrator-owned `make mo-qc`», §12.3 называет `make mo-qc` обязательным aggregate entry, а задача §13.1 требует поддержать проекты без Make через native task runner и «сначала обнаружить существующие package.json scripts». Для Node-проекта без Makefile спека предписывает создать Makefile — это второй параллельный toolchain, прямо запрещённый задачей.

**Minor–major, но конкретно:**

- Session naming `<slug>-exec`, `<slug>-review-a`: Herdr требует `[a-z][a-z0-9_-]{0,31}` и уникальность. Алгоритма slug, обрезки до 32 символов и collision policy нет; `-review-a` съедает 9 символов. Возможна адресация не того actor при похожих feature.
- Transport findings: полный Markdown reviewer копируется в `herdr agent prompt <TARGET> <TEXT>` как argv. Практический потолок (`ARG_MAX`, quoting, backticks/`$` внутри текста) не назван, а файловый обход запрещён. Нужен хотя бы явный порог и правило разбиения на последовательные prompts.
- `mo-reuse`: `gh` не объявлен prerequisite в `mo-setup`; нет поведения при отсутствии auth, rate limit, offline; нет privacy-правила для private repo (внутренние имена компонентов уходят в GitHub search как queries).
- Reviewer independence через «другого vendor» не проверяема: schema хранит свободную строку `route/model/effort`, нормализованного vendor нет; OpenCode-route может вести к тому же underlying provider, что и executor.
- `make mo-e2e` с exit code 2 сломает любой агрегатор, вызывающий все `mo-*` targets подряд; §11 защищает только `mo-qc`.
- Утеряно требование писать тесты. В `execute-feature` было «Tests exist for the behaviour you added, at the level that actually constrains it»; в §5.3 осталось только «выполнить typecheck/lint/tests». Поскольку executor skill отменён, требование обязано попасть в `AGENTS.md`, но §12.1 описывает содержимое `AGENTS.md` одной фразой без шаблона и без списка переносимых требований.

## Strengths & Benefits (Yellow Hat)

Направление верное, и значительная часть документа действительно implementation-ready.

- Удаление control plane выполнено честно и до конца: нет FSM, state.json, receipts, snapshot digest, SessionAdapter, Structured JSON, installer. Phase 2 перечисляет удаления без compatibility adapters — это ровно то, что просила задача.
- Правило «любой новый SHA инвалидирует все gates» — образцовое fail-closed решение: одна строка вместо impact-анализа и attestation-графа. Оно же делает ненужным digest.
- Отказ от methodology skill для executor реализован последовательно: §5.3 формулирует свойства результата, а не ритуал; §2.2 фиксирует принцип.
- §7.1 честно фиксирует самую опасную ловушку Herdr (`--wait` = lifecycle settlement, не turn boundary) и требует проверять state до отправки prompt. Это редкая точность.
- Разделение mechanical presence (linters) и semantic adequacy (reviewers) для purpose сохраняет смысл GRACE, включая overload declarations, и не превращает требование в 100% docstring coverage.
- Разделение Claude permission bypass и workspace trust (§6.2, §12.2) фактически верно и защищает от автоматической мутации `~/.claude.json`.
- Условная роль tester (§11) точно решает исходную проблему: smoke не порождает отдельной session, browser/benchmark — порождает.
- `~/.meta-o` сведён к одному файлу настроек с явным запретом хранить runs/SHA/gates — это прямой ответ на вопрос 13 задачи.
- Acceptance fixtures §7.3 — правильная идея: они превращают «мы думаем, что Herdr это может» в проверяемое условие. Проблема не в их наличии, а в том, что вывод при их провале не спроектирован.

## Alternatives & Creative Ideas (Green Hat)

1. **Launch-mode mitigation прежде scroll reconstruction.** Для Codex — `herdr agent start exec --kind codex --pane <id> -- --no-alt-screen`: ответ уходит в host scrollback, и `agent read --source recent-unwrapped --lines N` становится надёжным. Для Claude/OpenCode проверить в Phase 0 наличие аналогичных inline/accessibility режимов. Scroll-stitching оставить третьим уровнем, а не baseline.

2. **Non-interactive reviewers.** Reviewer не нуждается в интерактивном TUI. `herdr pane run <pane> 'claude -p "<prompt>" > /dev/stdout'`, `codex exec`, `opencode run` печатают ответ в обычный терминал, который полностью читается `herdr pane read --source recent-unwrapped`. Это остаётся Herdr surface, не трогает provider-private сессии и не требует verdict-файла. Ограничение addendum касается `agent read/scroll` для интерактивных agents; для reviewer-роли pane-режим стоит хотя бы рассмотреть и явно отклонить с причиной, а не молча пропустить.

3. **Пара BASE/CANDIDATE + freeze-проверка.** Каждому gate передавать `BASE_SHA` и `CANDIDATE_SHA`; до и после gate orchestrator выполняет `git rev-parse HEAD` и `git status --porcelain -uall`. Это два вызова, не state layer, и они закрывают весь остаток задачи №9 исходного task.

4. **Textual run plan вместо hardcoded `make mo-qc`.** Одна строка в сообщении orchestrator: `QC_COMMAND: make mo-qc | npm run mo:qc | just qc`, `SMOKE_COMMAND:`, `E2E_MODE: none|console|benchmark|browser`. Не persisted, не manifest, снимает противоречие §5.4/§12.3 и поддерживает проекты без Make.

5. **`mo-models.mjs` первой версией без SDK.** Источники — то, что уже есть локально (`opencode models`, provider CLI, ранее выбранный набор). Zero dependencies снимает конфликт с distribution-без-installer; SDK-based discovery выносится в deferred до закрытия source matrix.

6. **Capability matrix как поставляемый reference-файл.** Вместо отсутствующей таблицы context/cache/compaction — `references/backend-capabilities.md` со столбцами `available|inferred|unavailable`, который Phase 0 заполняет, а skills читают. Это текст, не runtime, и оно закрывает deliverable №18 без нового кода.

7. **`AGENTS.md` template как артефакт спеки.** Раз executor skill отменён, единственный носитель обязательных свойств — project instructions. Готовый короткий шаблон (outcomes, architecture theses, tests requirement, QC non-weakening, no push/tag, debt → `docs/todo.md`) делает отмену executor skill реально исполнимой, а не декларативной.

## Completeness & Process (Blue Hat)

Отсутствуют прямо перечисленные в задаче обязательные разделы итогового документа:

- **№18** — per-backend context/cache/compaction capability analysis с таблицей и fallback rules: отсутствует полностью.
- **«Требования к вариантам»** — сравнение трёх архитектурных уровней (pure skills / skills+helpers / small workflow engine) с flow, recovery, стоимостью и потерянными гарантиями: отсутствует.
- **№6** — карта переноса требований `execute-feature` в spec/project instructions/QC/review: отсутствует; §5.3 — это список обязанностей, а не карта переноса, и как минимум требование писать тесты по дороге потерялось.
- **№23** — tooling audit с решениями `keep/replace/delete/defer` по перечисленному в задаче списку компонентов: подменён списком удалений Phase 2 и таблицами ledger. Не классифицированы, в частности, capability suite, Herdr adapter/evidence слои, ModelSet upgrade suggestions, code-health baseline (только косвенно), Markdown parsing (косвенно).
- **№26** — pre-mortem против повторного wrapper/control-layer bloat: отсутствует, хотя premortem проводился и его результаты есть в `synthesis.md`.
- **«Guarantees consciously removed»** — в `synthesis.md` этот раздел есть (exactly-once delivery, exact replay, automatic takeover, fencing/write-ahead, immutable spec copy, snapshot digest, receipts, mandatory worktrees, durable run state, deterministic watchdog liveness, machine-countable blockers). В спеке он выпал. Критерий качества задачи требует, чтобы потерянная гарантия была названа явно; сейчас она названа только косвенно через Rejected-таблицу.
- **Subscription-first (task §2.2)** — требование проверить и честно описать поведение каждого backend не отражено нигде; §12.2 покрывает только PATH wrappers.
- Нет test matrix по skills и failure paths (есть только Herdr fixtures §7.3 и Omnigent Phase 0 §8).

## Traceability

Decision ledger присутствует и структурно корректен (Adopted/Rejected/Deferred, с rationale и source). **Прямая трассируемость хорошая**: каждый adopted-пункт я нашёл в теле — skills-first (§2), только `mo-herdr`/`mo-omnigent` (§4), executor без skill (§5.3), mandatory `mo-reuse` + spec-only commit (§5.2), Herdr read/scroll (§7.2), Markdown verdict (§10), SHA invalidates gates (§5.4), read-only spec (§5.3), conditional tester (§11), `mo-setup` ownership (§12), `~/.meta-o` только models (§15), optional 1:1 watchdog (§16), APM/skills (§19), no backward compatibility (§1). Rejected-пункты также отражены (нет CLI, нет FSM, нет adapters, нет verdict-файла, нет worktrees, нет adjudicator, Paseo исключён). Deferred-пункты присутствуют (§16 watchdog helper, §7.2 отсутствие transcript parser, §13.2 baseline, §5.3 retirement, §16 multi-project).

**Обратная трассируемость нарушена.** Существенные решения тела отсутствуют в ledger, а значит могут быть безнаказанно изменены реализацией:

- goal живёт до первого candidate и выключается на время gates (§6);
- обязательный clean worktree как часть определения candidate (§5.4);
- `make mo-qc` как универсальный обязательный entry (§5.4/§12.3);
- exit code 2 и префикс `AGENT_REQUIRED: not executed` (§11);
- schema `models.json` и существование `mo-models.mjs` как единственного оставшегося `.mjs` (§15);
- лимиты reviewer subagents 0/2–3/4–6 (§10);
- purpose coverage и список исключений (§14);
- механическое копирование canonical reference в dist с проверкой идентичности (§3/§19);
- три раунда reuse-поиска и обязательный Rust search (§9);
- convention именования sessions (§17);
- начальные thresholds 400–500/60–80/10–15/30–40/4 (§13.2).

Плюс расхождение с `synthesis.md`: раздел «Guarantees consciously removed» и tooling audit в спеку не перенесены.

## Decomposition Readiness

Готовы к прямой нарезке на задачи: §12 (`mo-setup` layout, wrappers, trust), §13 (QC profiles), §14 (purpose contract), §9 (reuse protocol — есть reference command и правила по registry), §18 (reflection), §11 (E2E classification), §5.2 (reuse commit).

**Не готовы — исполнителю придётся принимать архитектурные решения самому:**

1. §7.2 шаги 3–8: «увеличивать N», «прокручивать agent UI», «несколько одинаковых overlap-lines» — нет ни точного числа overlap, ни правила завершения, ни per-kind способа прокрутки, ни поведения при повторяющихся строках (overlap по идентичным строкам не доказывает непрерывность при повторяющемся тексте вроде пустых строк или рамок TUI).
2. §8 целиком: Omnigent-контракт делегирован Phase 0. Session creation, addressing, follow-up, status, pagination, выбор нужного turn в export — всё открыто. Это не задача на реализацию, это второй дизайн.
3. §10 standalone-режим: backend, spawn, author locator отсутствуют.
4. §15 `mo-models.mjs`: интерфейс, источники, алгоритм successor, packaging.
5. §16 conditional `.mjs` helper: критерий «bounded native wait» не задан численно, интерфейс helper не определён.
6. §6 механизм включения/выключения goal для каждой surface.

## Weak-Model Executability

Слабая модель уверенно реализует §12, §13, §14, §9, §11, §19-layout. Она **гарантированно начнёт угадывать** в следующих местах:

- «При необходимости увеличивать `N` (например 400, 800, 1600)» — до какого предела? Что считать «увеличение перестало добавлять более ранние строки» при мигающем TUI?
- «Соседние окна собираются с несколькими одинаковыми overlap-lines» — сколько это? 3? 10? Что при несовпадении?
- «Activation проверяется через documented native surface» (§6.1) — какая именно команда/вывод является доказательством?
- «Goal выключена» — какой командой?
- «Предлагает upgrade только при доказанном новом release generation» — по какому признаку строки модели?
- «`CLAUDE.md` использует supported native include/link» — какой синтаксис? Проверялся ли он?
- «Canonical frontmatter ограничивается полями, поддерживаемыми target skill managers» (§19) — список полей не приведён, а APM и vercel-labs/skills имеют разные ожидания.
- «`mo-review` читает полный artifact/spec и Git diff названного SHA» — какая команда diff.
- «dist build механически копирует и проверяет идентичность» — кто и чем; целевого скрипта/target нет, а `install.sh`/`update.sh` запрещены.

## Contract Completeness

Конкретные пробелы контрактов (все — вне раздела Open questions, что усугубляет проблему, поскольку §23 объявляет открытых вопросов нет):

- `models.json`: `roles: {}` и `dismissedUpgrades: {}` без схемы; формат `"route/model/effort"` без грамматики; нет правил миграции при `schemaVersion` ≠ 1; нет atomic write/lock; нет поведения при отсутствии файла и при corrupt JSON (сказано только «сохраняет текущий selection»).
- `mo-models.mjs`: нет argv, exit codes, stdout-контракта, зависимостей.
- Gate-контракт: нет `BASE_SHA`, нет команд freeze-проверки, нет определения «clean» (tracked/untracked/ignored?) — при том что §5.4 требует clean worktree, а §10 verdict печатает `WORKTREE: clean|dirty`.
- Reviewer transport: нет предела размера, нет правила разбиения.
- Herdr retrieval: нет overlap size, retry budget, timeout-значений (в примерах `--timeout <ms>` без чисел).
- Session naming: нет slug-алгоритма и лимита 32 символов.
- `mo-e2e`: exit code 2 задан, но контракт evidence («evidence и PASS/FAIL на названном SHA») формата не имеет.
- Thresholds §13.2 даны диапазонами (400–500, 60–80, 30–40) без правила выбора конкретного значения — исполнитель выберет произвольно, и два проекта разойдутся.
- Prerequisites не перечислены нигде единым списком: `gh`, `jq` (примеры §7.1 подразумевают чтение JSON), Node-версия для `.mjs`, `agent-browser` skill.

---

Итог: документ радикально и правильно сокращает прежнюю систему, и большая его часть — готовый к исполнению текст. Но единственный механизм, на котором держится весь review gate (полное последнее сообщение через Herdr), проверкой не подтверждается, противоречит собственной документации Herdr, игнорирует существующее native-решение (`--no-alt-screen`) и не имеет спроектированного поведения при провале. Плюс отсутствует шесть обязательных deliverables задачи и около десяти конкретных контрактов. Это не «почти готово с косметикой» — это спека, которую нельзя начинать реализовывать с §7 и §8, но можно с §9, §12–§14, §19.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 5,
      "would_adopt": false,
      "summary": "Спецификация делает правильный и честный шаг: удаляет FSM, state, receipts, snapshot digest, adapters, Structured JSON и installer, оставляя Git SHA, native CLI и reasoning в качестве control layer; правило «любой новый SHA инвалидирует все gates», отмена executor skill, разделение permission bypass и workspace trust, условная роль E2E tester и сведение ~/.meta-o к одному файлу model preferences — сильные, проверяемые решения. Однако центральный механизм всей методологии — извлечение полного последнего сообщения reviewer через Herdr — проверкой не подтверждается: установленный herdr skill 0.8.0 прямо утверждает, что строки, покинувшие alternate screen, не попадают в host scrollback и рекомендует именно тот файловый fallback, который спека запрещает; `herdr agent attach` интерактивен и не скриптуем; `send-keys` шлёт клавиши в сам агент; при этом native `codex --no-alt-screen` (inline mode, preserving scrollback) в спеке не упомянут вовсе, а у claude/opencode эквивалента нет, из-за чего по правилу §7.3 эти route станут unsupported и сделают недостижимым обязательный cross-vendor reviewer из §10. Отдельно: gate «unknown → перезапустить reviewer» детерминированно зацикливается, §23 ложно объявляет отсутствие blocking questions, отсутствуют шесть обязательных deliverables задачи (per-backend context/cache/compaction таблица, сравнение трёх архитектурных уровней, список сознательно удалённых гарантий, карта переноса execute-feature, pre-mortem против bloat, subscription-first проверка), а review scope (BASE SHA), candidate freeze verification, goal deactivation, standalone-контракт mo-review и весь интерфейс mo-models.mjs (включая противоречие SDK-зависимостей и distribution без installer) остаются неопределёнными.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "§7.2 Herdr full-turn retrieval",
          "description": "Главный gate построен на механизме, который установленный herdr skill 0.8.0 объявляет невозможным: «Rows that leave the alternate screen do not enter Herdr's host scrollback, so a larger line count cannot recover them», а его штатный fallback (агент пишет полный ответ в файл) спека запрещает. `herdr agent attach` — интерактивное подключение с detach по ctrl+b q, оно не скриптуемо для цикла scroll+read; `herdr agent send-keys` шлёт клавиши в сам агент и может загрязнить его input buffer. Per-kind scroll keys, размер overlap, правило завершения и защита фокуса не заданы. При этом `codex --help` локально показывает `--no-alt-screen` («Runs the TUI in inline mode, preserving terminal scrollback history»), а §7.1 уже допускает `agent start -- <args>` — проверенное готовое решение проигнорировано.",
          "required_change": "Ввести ladder: (1) launch-mode mitigation — для Codex `--no-alt-screen` через `herdr agent start ... -- --no-alt-screen`, для Claude/OpenCode проверить inline/accessibility режимы в Phase 0; (2) non-interactive reviewer surface (`claude -p`, `codex exec`, `opencode run` в обычной pane, читаемой `herdr pane read --source recent-unwrapped`) как явно рассмотренная альтернатива с решением принять или отклонить; (3) scroll-stitching только третьим уровнем с точным overlap (число строк), retry budget и правилом завершения; (4) ограниченный бюджет попыток и переход в named `needs_attention` вместо бесконечного перезапуска reviewer."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "§23 Open questions / §10 cross-vendor review",
          "description": "§23 утверждает, что blocking architecture questions отсутствуют, но провал Herdr fixture для Claude и OpenCode одновременно делает недостижимым требование §10 «минимум один reviewer другого vendor относительно executor» и требует смены архитектуры review, а не только пометки route unsupported. Взаимодействие «unsupported route × обязательный cross-vendor reviewer» нигде не разобрано.",
          "required_change": "Признать retrieval-контракт blocking open question; описать поведение при единственном retrievable vendor (деградация до одного reviewer недопустима — либо print-mode surface, либо `needs_attention` с явной причиной), и связать статус supported route с возможностью выполнить cross-vendor правило."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§5.4 candidate freeze / §10 review scope",
          "description": "Freeze candidate существует только как инструкция: нет проверок `git rev-parse HEAD` и `git status --porcelain --untracked-files=all` до и после каждого gate, поэтому мутация дерева без нового commit (formatter, тесты, lock-файл, сам reviewer) не инвалидирует ничего. Одновременно review scope задан как «Git diff названного SHA» без BASE/merge-base, из-за чего reviewer многокоммитной feature может проверить только последний commit и выдать PASS.",
          "required_change": "Передавать каждому gate пару BASE_SHA + CANDIDATE_SHA с точной командой diff (`git diff BASE...CANDIDATE`); добавить обязательные две git-команды проверки HEAD и чистоты дерева до и после каждого gate; определить, что именно считается clean (tracked/untracked/ignored)."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§6 goal lifecycle",
          "description": "Спека требует, чтобы goal была «выключена» на время независимых review/E2E, но не называет ни команду деактивации для Codex (`/goal pause|clear`?) и Claude, ни способ подтвердить, что goal неактивна. Без этого главный риск (executor автономно коммитит поверх проверяемого candidate) ничем не предотвращён, а freeze §5.4 опирается именно на это.",
          "required_change": "Указать конкретные команды активации, паузы/очистки и проверки состояния goal для каждой поддерживаемой surface, включая ожидаемое observable evidence, и поведение при недоказанной деактивации."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§10 mo-review standalone",
          "description": "Standalone-режим объявлен, но не спроектирован: не заданы backend, механизм создания/поиска двух reviewer actors, адресация автора для fixes, поведение при отсутствии Herdr (HERDR_ENV != 1) и Omnigent. Для non-code artifacts template verdict требует полный SHA и WORKTREE clean|dirty, что несовместимо с untracked документом/презентацией, которых требует задача §5.1.",
          "required_change": "Описать два явных режима (orchestrated: caller передаёт backend/actors/BASE+CANDIDATE; standalone: skill выбирает доступный backend и фиксирует author/fix target) и отдельный минимальный identity-контракт для non-Git artifacts вместо обязательного SHA."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Отсутствующие обязательные deliverables",
          "description": "Не выполнены прямо перечисленные требования задачи к итоговому документу: (18) per-backend context/cache/compaction capability table `available|inferred|unavailable` с fallback rules — отсутствует полностью; сравнение трёх архитектурных уровней — отсутствует; (6) карта переноса требований execute-feature — отсутствует (в частности потеряно требование писать тесты для добавленного поведения); (23) tooling audit с keep/replace/delete/defer по перечисленному списку компонентов — подменён списком Phase 2; (26) pre-mortem против wrapper/control-layer bloat — отсутствует; раздел «Guarantees consciously removed», присутствующий в synthesis.md, в спеку не перенесён; subscription-first проверка backend (task §2.2) не отражена.",
          "required_change": "Добавить перечисленные разделы; как минимум capability matrix оформить поставляемым reference-файлом, а карту переноса execute-feature — вместе с готовым шаблоном AGENTS.md, поскольку без него отмена executor skill не исполнима."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§15 mo-models.mjs / §19 distribution",
          "description": "Единственный оставшийся .mjs не имеет CLI signature, exit codes, stdout-контракта, atomic write/locking, поведения при corrupt JSON, грамматики `route/model/effort`, схемы `dismissedUpgrades` и алгоритма отличия successor release от sibling family. Одновременно он объявлен использующим official SDK, тогда как install.sh удалён и APM/skills копируют файлы без установки зависимостей — источник node_modules не определён.",
          "required_change": "Либо задать zero-dependency источники (локальные CLI вроде `opencode models`, ранее сохранённый набор) и полный интерфейс helper, либо перенести SDK-based discovery в Deferred до закрытия source matrix; в обоих случаях выписать argv, exit codes, формат вывода и поведение при ошибках."
        },
        {
          "id": "",
          "severity": "major",
          "area": "§5.4 / §12.3 Make contract",
          "description": "§5.4 безусловно выполняет `make mo-qc`, §12.3 называет его обязательным aggregate entry, тогда как задача требует поддерживать проекты без Make через native task runner и сначала обнаруживать существующие package.json scripts. Для Node-проекта без Makefile спека фактически предписывает завести второй параллельный toolchain.",
          "required_change": "Заменить обязательный `make mo-qc` на run-local текстовый план команд (QC_COMMAND/SMOKE_COMMAND/E2E_MODE), где Make — лишь один из вариантов, и явно описать эквивалент для npm/pnpm/just."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§17 session naming",
          "description": "Herdr требует имена агентов `[a-z][a-z0-9_-]{0,31}` и уникальность среди живых агентов; спека предлагает `<slug>-exec`/`<slug>-review-a` без алгоритма slug, правил обрезки до 32 символов и collision policy. Возможна адресация не того actor при похожих feature.",
          "required_change": "Задать алгоритм slug (источник, нормализация, максимальная длина), правило суффиксов и поведение при коллизии с уже живым агентом."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Traceability ledger",
          "description": "Обратная трассируемость нарушена: в ledger отсутствуют существенные решения тела — goal lifetime и деактивация на время gates, обязательный clean worktree, `make mo-qc` как универсальный entry, exit code 2 и префикс AGENT_REQUIRED, schema models.json и существование mo-models.mjs, лимиты reviewer subagents, purpose coverage/exceptions, механическое копирование canonical reference, три раунда reuse и обязательный Rust search, convention именования sessions, начальные thresholds §13.2.",
          "required_change": "Дополнить ledger перечисленными решениями с rationale и source, чтобы реализация не могла изменить их бесшумно."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "§10 reviewer transport",
          "description": "Полный Markdown verdict копируется в `herdr agent prompt <TARGET> <TEXT>` как argv; предел размера, quoting и правило разбиения на последовательные prompts не заданы, а файловый обход запрещён."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§9 mo-reuse prerequisites",
          "description": "`gh` не объявлен prerequisite в mo-setup; нет поведения при отсутствии auth, rate limit и offline; нет privacy-правила для private repositories (внутренние имена компонентов уходят в публичный search)."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§11 make mo-e2e exit code",
          "description": "Exit code 2 сломает агрегатор, вызывающий все mo-* targets подряд; защищён явно только mo-qc."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§13.2 thresholds",
          "description": "Диапазоны 400–500 / 60–80 / 10–15 / 30–40 без правила выбора конкретного значения приведут к расхождению между проектами."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§10 reviewer independence",
          "description": "Правило «другого vendor» не проверяемо: models.json хранит свободную строку route/model/effort без нормализованного vendor/provider."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "§14 vs docs/references/grace.md",
          "description": "Из GRACE сохранено ядро purpose, но осознанно отброшены модульная причинная цепочка (§B→§A→§M) и grep-friendly семантические якоря; это может быть верным решением, но оно нигде не названо как сознательно удалённая гарантия."
        }
      ],
      "assumptions": [
        "Спека под ревью — актуальная редакция; существующий spec-review-gpt56solmedium-R1.md я использовал только для сверки после собственной проверки, а все ключевые факты подтвердил локально (herdr 0.8.0, codex/claude/opencode/omnigent --help, which -a).",
        "Addendum задачи о запрете verdict-файлов и provider-private transcripts остаётся в силе, поэтому альтернативы предлагаю в пределах Herdr surfaces (включая pane read для non-interactive режимов).",
        "Отсутствие WebFetch-проверки официальных docs Codex/Claude /goal и APM/skills не меняет выводов: все blocking findings опираются на локально проверяемые факты либо на внутренние противоречия документа.",
        "Требования «Требования к итоговой спецификации» из task-description считаю обязательным чек-листом полноты, а не пожеланием."
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
