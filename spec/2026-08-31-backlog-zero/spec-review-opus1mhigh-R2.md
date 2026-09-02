Эта проверка ограничена вопросом закрытия названных findings; архитектуру я заново не исследую. Сначала о том, что вообще изменилось: коррекция затронула ровно четыре области — семантику review modes и стадий (§1.9), portable severity contract и report header (§1.9–§1.10), формальную связку TUI-проекции с authoritative `worker_done` (§2.6–§2.7, §2.10, §3.10) и разбор расхождения свежей provider-native auth со stale Orca account projection (§3.3, §3.7, §3.10). Разделы §4.2, §4.3, §4.5, §4.6, §4.7 и раздел 1 (provenance) байт-в-байт не изменились, Appendix A получил ровно одну новую строку. Отсюда и результат проверки.

## Закрытие названных findings

**FIND-SR-001 … FIND-SR-012 — сертифицировать не могу.** Текст этих findings мне не передан, только идентификаторы. Я не буду объявлять их закрытыми по догадке. Что коррекция демонстрируемо даёт в затронутых областях: modes стали coverage profiles одного evidence contract с обязательной in-place эскалацией и записью `requested`/`effective`; стадии разведены так, что diff читается до risk mapping; введены evidence states `confirmed|strongly_supported|unproven|refuted` с правилом публикации; P0–P3 определены через impact/reachability/prerequisites и явно отделены от confidence; `Review-Execution` оставлен opaque в portable core, а привязка к native Dispatch ID вынесена в spec 2 — это корректное разделение и прямое соблюдение критерия «не переносить orchestration-specific правила внутрь portable skills». Проверено также, что `Verdict: <PASS|FINDINGS|UNKNOWN>` точно совпадает с действующим словарём `review-protocol.md:52,56`, а новые P0–P3 согласованы с уже существующими определениями в `src/skills/senior-*/SKILL.md:81`. Если эти двенадцать findings относились к перечисленному, они выглядят закрытыми качественно; подтвердить это формально можно только по их тексту.

**Закрыты (2 из 13):**

- **STALE-ACCOUNT-SURFACE-09 — закрыт полностью и точно.** `HarnessReadinessEvidence` с полями `native_auth.observed_at`, `orca_account_projection.updated_at` и `freshness`; §3.3 п. 4 объявляет projection, наблюдённую до более свежего native auth, `stale`, а не доказательством отсутствия credentials; §3.7 даёт семишаговую процедуру `stale_account_cache` с запретом re-login, запретом трогать private cache и запретом model fallback; §3.10 требует трёх различимых outcomes (реально неавторизованный provider, stale projection, backend integration credential failure). Это ровно то, чего требовало свидетельство real-runs стр. 22, и решение не ломает рекомендацию стр. 592–597.
- **FINAL-GATE-SCOPE-11 — закрыт по существу.** §2.6 задаёт, что final same-SHA gate выполняется как `follow_up` при наличии original intent, собственного prior report, полного delta и всех изменившихся contracts, с повышением до `deep` при semantic expansion. `follow_up` определён как перепроверка каждой disposition плюс delta — это сходящийся цикл, который при этом аттестует фичу, а не только deletion-diff. Обе половины моей дилеммы сняты.

**Остаются открытыми (10 из 13):**

- **INVENTORY-LOSS-01 — открыт.** Appendix A получил одну строку («Fresh Claude auth, stale Orca `missing-credentials` cache»). Остальные 32 инцидента блока `## 2026-08-24` (строки 5–37) по-прежнему не отображены: materialization ownership BRIEF (стр. 10, 13), `aidd-spec`/`agent-browser` auth (стр. 8, 9), усечения вывода 21k/41k (стр. 6, 9, 15), worktree binding с ложным `ok:true` (стр. 7, 11, 12, 14), `waiter_exists` без публичного handle (стр. 32), семантика initial `/goal` (стр. 37), дефекты `mo-watchdog` (стр. 59, 62) и `mo-models.mjs` (стр. 34, 61).
- **PROVENANCE-FRAGILE-02 — открыт.** Перепроверено сейчас: `41a4898` достижим только из `refs/heads/feature/orca-only`, тега нет, ветка не запушена. Раздел 1 не изменён, требований push/tag/no-squash не добавлено. `docs/research/` по-прежнему `??`.
- **FIND-REUSE-ORPHAN-03 — открыт.** §2.2 по-прежнему не упоминает `find-reuse`; владелец редактуры секретов в дословном ledger не назначен.
- **DOD-UNREACHABLE-04 — открыт.** `tests/build-skills.test.mjs:29-36` по-прежнему содержит шесть имён без `senior-*`; `senior-python`/`senior-jsts` остаются untracked; `tests/orchestration-contract.test.mjs:55` по-прежнему требует строку ``read all of `docs/backlog.md` ``, а судьба `## Backlog lens` не описана.
- **AST-INFEASIBLE-05 — открыт.** §4.3 не изменён; библиотека не названа, проблема отсутствия inline-позиций у `markdown-it` не признана.
- **JSDOC-ALREADY-DONE-06 — открыт.** §4.2 не изменён; `jsdoc/match-description` по-прежнему не назван.
- **BIJECTION-UNSAT-07 — открыт.** §4.6 не изменён; disposition для узла без нормативного обязательства отсутствует.
- **HOT-REVIEWER-CONTRACT-08 — открыт и стал более явным.** `methodology.md:117` по-прежнему требует «review that new SHA with two **fresh** independent reviews», тогда как `follow_up` теперь формально обязывает передавать reviewer его собственный предыдущий report и dispositions. Изоляция peer-байтов — правильное решение и сохраняет независимость *между* двумя ревьюерами; но независимость того же ревьюера *между SHA* теперь контрактно отменена, а замещаемый текст не объявлен и в ledger не внесён.
- **ADAPTER-CMD-UNGATED-10 — открыт.** Строка §1.10 про fake/local endpoints и опциональные live probes не изменена; строка рисков тоже.
- **QWEN-CONSTANT-12 — открыт.** §3.9 по-прежнему фиксирует «exact Qwen 3.8 27B UD-Q4-KM» как блокирующий критерий при §2.12 «модели — runtime configuration, не spec-константа»; `context_budget` не добавлен, хотя усечения 21k/41k остаются в свидетельствах.
- **LEDGER-GAPS-13 — открыт частично.** Добавлено пять adopted-строк, и это правильные строки. Но ни одна из трёх названных мной не появилась: замещение «no adjudication grammars», переход от fresh-per-SHA к hot/`follow_up`, отклонение зафиксированного пользователем slice-бюджета review/fix (стр. 123, 125).

## Регрессия, вызванная коррекцией

**REGRESSION-SEVERITY-GRAMMAR-20 (major).** Коррекция расширила severity из текстовой пометки в обязательную машинно-проверяемую грамматику: `Projection: <SHA> <verdict> P0=<n> P1=<n> P2=<n> P3=<n>`, чьи числа обязаны точно совпадать с телом, плюс fixtures в §1.10/§2.10 и отдельная строка DoD в §4.8. Действующий контракт `shared/references/review-protocol.md:84` поимённо запрещает именно это: «use judgment rather than finding identifiers, **adjudication grammars** or numeric review-round caps», и то же повторяет `methodology.md:118`. Верхний слой говорит то же самое: §B-CONTROL-03 («протокол не вводит счётчики, пороги и обязательные структуры») и §B-REVIEW-03 («вкусовое замечание не приравнивается к дефекту»). До коррекции конфликт ограничивался политикой P3; теперь он охватывает обязательный формат отчёта, счётчики по каждому уровню и gate в DoD, а амендмент верхнего слоя по-прежнему не заявлен ни в тексте, ни в Decision ledger. Проверил также, что жёсткого падения `mo-qc` тут нет: ни один тест не ассертит фразу про adjudication grammars — поэтому это конфликт иерархии, а не сломанный гейт, и потому major, а не critical. Замечу отдельно: [review-p3-policy] — frozen user decision, я её не переоткрываю; сообщаю только о конкретном противоречии, которое требует явной правки бизнес-слоя решением пользователя.

## Non-blocking notes

- `unproven` уходит в `Unknowns` и не публикуется как finding. Если все кандидаты `unproven`, публикуется ноль findings → валидный `PASS`, при этом `review-protocol.md:53-55` определяет `PASS` как «no required change remains **and every requirement has adequate evidence**». Стоит явно сказать, даёт ли непустой `Unknowns` `PASS` или `UNKNOWN`.
- §3.3 объявляет `orca_account_projection.updated_at` необязательным, а real-runs стр. 592–597 фиксируют ответ с `accounts=[]`. Поведение freshness при отсутствующем `updated_at` не определено.
- §3.3 п. 7 (`launch.requested == launch.effective`) фактически закрывает инцидент real-runs стр. 23 (плавающий alias модели), но строки в Appendix A для него не появилось. Это хорошая иллюстрация к INVENTORY-LOSS-01: реальные исправления приходят не из карты, значит карта не управляет scope.
- `scope: branch|feature|project` для final gate по-прежнему не выбран; после закрытия FINAL-GATE-SCOPE-11 через mode это остаточная мелочь, но её стоит доопределить одной фразой.
- Положительно: §1.9 P0–P3 согласованы с `senior-*/SKILL.md:81`, а `Verdict` совпадает с `review-protocol.md:52` — коллизия трёх severity-грамматик, о которой я предупреждал, устранена.

## Запрос решения пользователя

Девять из десяти открытых findings закрываются аддитивно внутри утверждённой четырёхспековой структуры и укладываются в **bounded orchestrator fix** — approved approach не меняется. Исключение одно: полное закрытие **INVENTORY-LOSS-01** требует назначить владельцев семействам, которых сейчас нет ни в одной спеке (materialization ownership внешней спеки/BRIEF, внешний spec-сервис и `agent-browser` auth, лимиты усечения диагностики, требования к собственным компонентам `mo-watchdog`/`mo-models.mjs`), и это может расширить границы spec 3/4. Поэтому нужно явное решение: разрешить **bounded orchestrator fix** с правом расширить scope spec 3/4 этими владельцами, либо **restart proposals**, если расширение границ считается изменением утверждённого подхода. Мою рекомендацию фиксирую как bounded fix — структура четырёх спек при этом сохраняется.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 4,
      "would_adopt": false,
      "summary": "Целевая проверка закрытия названных findings. Коррекция качественная, но узкая: она затронула только review modes/стадии (§1.9), portable severity contract и report header, формальную связку TUI-проекции с authoritative worker_done (§2.6-§2.7, §2.10, §3.10) и разбор stale Orca account cache (§3.3, §3.7, §3.10). Из моих тринадцати findings закрыты два: STALE-ACCOUNT-SURFACE-09 закрыт полностью и точно по свидетельству real-runs стр. 22, с тремя различимыми outcomes и запретом re-login/model fallback; FINAL-GATE-SCOPE-11 закрыт по существу, поскольку follow_up как перепроверка dispositions плюс delta делает финальный цикл сходящимся и одновременно аттестующим. Остальные одиннадцать остаются открытыми, причём §4.2, §4.3, §4.6, раздел 1 и строка §1.10 про adapter fixtures не изменены байт-в-байт, а Appendix A получил ровно одну новую строку при 32 всё ещё неотображённых инцидентах блока 2026-08-24. Перепроверено в репозитории: 41a4898 достижим только из локальной непушнутой feature/orca-only и тега нет; EXPECTED в build-skills.test.mjs по-прежнему шесть имён без senior-*, которые остаются untracked; orchestration-contract.test.mjs:55 по-прежнему требует строку про чтение всего docs/backlog.md. Коррекция также внесла регрессию: расширение severity в обязательную машинно-проверяемую грамматику Projection с посчитанными P0-P3 и отдельной строкой DoD углубляет неподтверждённый конфликт с review-protocol.md:84, methodology.md:118, §B-CONTROL-03 и §B-REVIEW-03, которые запрещают adjudication grammars и обязательные структуры; жёсткого падения mo-qc тут нет, поэтому это конфликт иерархии, требующий явной правки бизнес-слоя решением пользователя. Findings FIND-SR-001..012 сертифицировать не могу: их текст не передан, только идентификаторы.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "INVENTORY-LOSS-01",
          "severity": "critical",
          "area": "lossless-inventory/scope",
          "description": "НЕ ЗАКРЫТ. Appendix A получил одну новую строку (stale Orca account cache). Остальные 32 инцидента блока '## 2026-08-24 — Marta Eval task 730873' (строки 5-37) остаются неотображёнными, включая весь пласт не-Orca требований и требования к собственным компонентам Meta-O. Scope четырёх спек по-прежнему выведен из неполного входа.",
          "evidence": "docs/backlog-issues-real-runs.md: стр. 10 и 13 (materialization ownership BRIEF), 8 и 9 (aidd-spec, agent-browser без корпоративной авторизации), 6/9/15 (усечения вывода 21k и 41k токенов), 7/11/12/14 (orca worktree create вернул ok:true без ветки и checkout), 32 (waiter_exists без публичного handle), 37 (семантика initial /goal), 59 и 62 (дефекты mo-watchdog), 34 и 61 (mo-models.mjs), 35 (discoverability bundled-скриптов). Показательно, что §3.3 п. 7 фактически закрывает инцидент стр. 23 (плавающий alias модели), но строки в Appendix A для него не появилось — карта не управляет scope.",
          "required_change": "Построить инвентаризацию на уровне буллетов, а не заголовков, и назначить владельца каждому не-Orca семейству и каждому требованию к собственным компонентам Meta-O, с явными строками в Appendix A. Это единственный из открытых findings, чьё закрытие может расширить границы spec 3/4, поэтому требуется явное решение пользователя: bounded orchestrator fix с правом расширить scope, либо restart proposals."
        },
        {
          "id": "PROVENANCE-FRAGILE-02",
          "severity": "critical",
          "area": "provenance/git",
          "description": "НЕ ЗАКРЫТ. Раздел 1 не изменён. Программа по-прежнему опирается на два Git blob и cutoff-коммит, достижимые только из одной непушнутой локальной ветки без тега. Squash-merge, rebase или удаление ветки уничтожают source of truth для tests/backlog-closure.test.mjs и делают обход cutoff→HEAD в §4.4 неопределённым.",
          "evidence": "Перепроверено в этой сессии: git for-each-ref показывает достижимость 41a4898 только из refs/heads/feature/orca-only; программного тега нет; remotes/origin/feature/orca-only отсутствует. docs/research/ по-прежнему имеет статус '??' (untracked), хотя Appendix A объявляет эти документы сохранённой decision surface.",
          "required_change": "Потребовать annotated tag на базовом коммите и его push до начала работ, записать имя тега в разделе 1, явно запретить squash/rebase для несущей ветки. Закоммитить docs/research/ либо зафиксировать явное решение не хранить их, указав blob-идентификаторы."
        },
        {
          "id": "FIND-REUSE-ORPHAN-03",
          "severity": "critical",
          "area": "find-reuse/integration/security",
          "description": "НЕ ЗАКРЫТ. §2.2 Components не изменён и по-прежнему не упоминает find-reuse, хотя §1.1 прямо делегирует его Meta-O-интеграцию в spec 2. Skill остаётся без вызывающей стороны и без destination отчёта. Владелец обязательной редактуры секретов в дословном пользовательском вводе, которой сейчас владеет удаляемый mo-reuse, по-прежнему не назначен.",
          "evidence": "src/skills/mo-reuse/SKILL.md: 'One thing is not recorded verbatim: a secret… is replaced by a marker… [REDACTED: deployment token]'; 'If you cannot tell whether a value is a secret… stop with needs_attention instead of guessing'. Также создание спеки с '## User intents (verbatim)', spec-only commit, правило 'orchestrator may offer once', детект layout docs/business.md vs docs/business/index.md. В четырёх спеках эти обязанности не встречаются.",
          "required_change": "Добавить в spec 2 раздел интеграции find-reuse: кто вызывает, как передаётся контекст, куда сохраняется отчёт, сохраняется ли правило 'предложить один раз' и неблокирующий характер отсутствия исследования. Назначить владельца редактуре секретов и остановке needs_attention с приёмочной фикстурой."
        },
        {
          "id": "DOD-UNREACHABLE-04",
          "severity": "critical",
          "area": "acceptance/gates",
          "description": "НЕ ЗАКРЫТ. DoD §4.8 требует прохождения make mo-qc, но программа по-прежнему ломает существующие гейты без назначенного владельца: senior-* не в Git и отсутствуют в EXPECTED, find-reuse нигде не добавляется в те же списки, опустошение backlog делает ложной ассерцию review-protocol и строки acceptance.",
          "evidence": "Перепроверено сейчас: tests/build-skills.test.mjs:29-36 EXPECTED содержит шесть имён без senior-*; git status показывает '?? src/skills/senior-jsts/' и '?? src/skills/senior-python/'; tests/orchestration-contract.test.mjs:55 содержит assert.match(source, /read all of `docs\\/backlog.md`/), а shared/references/review-protocol.md сохраняет секцию '## Backlog lens'.",
          "required_change": "Назначить владельца: закоммитить senior-*, добавить senior-* и find-reuse в EXPECTED build/install, README-таблицу и frontmatter-гейт §A-DISTRIBUTION-06; переработать '## Backlog lens' в 'Deferral lens' и синхронно обновить ассерцию orchestration-contract.test.mjs:55; пересмотреть затронутые строки docs/acceptance.md. Внести пункты в Appendix A."
        },
        {
          "id": "REGRESSION-SEVERITY-GRAMMAR-20",
          "severity": "major",
          "area": "hierarchy/review-contract",
          "description": "РЕГРЕССИЯ, ВЫЗВАННАЯ КОРРЕКЦИЕЙ. До правки конфликт с бизнес-слоем ограничивался политикой P3. Коррекция превратила severity в обязательную машинно-проверяемую грамматику: header Projection с посчитанными P0-P3, требование точного совпадения счётчиков с телом, severity fixtures в §1.10 и §2.10, а также отдельная строка в DoD §4.8. Действующий контракт запрещает именно adjudication grammars, а верхний слой запрещает обязательные структуры и счётчики. Амендмент верхнего слоя не заявлен ни в тексте, ни в Decision ledger.",
          "evidence": "shared/references/review-protocol.md:84: 'use judgment rather than finding identifiers, adjudication grammars or numeric review-round caps'. shared/references/methodology.md:118: 'finding IDs, round caps or retry counters'. docs/business.md §B-CONTROL-03: 'протокол не вводит счётчики, пороги и обязательные структуры'. §B-REVIEW-03: 'вкусовое замечание не приравнивается к дефекту'. Проверено, что жёсткого падения нет: grep по tests/ не находит ассерций на фразы adjudication/round caps/judgment, поэтому это конфликт иерархии, а не сломанный гейт.",
          "required_change": "Внести в spec явный пункт: реализация обязана изменить §B-REVIEW-03 и §B-CONTROL-03 и согласовать review-protocol.md:84 как решение пользователя на бизнес-уровне, разрешающее severity-грамматику и обязательный Projection. Добавить соответствующую строку в Decision ledger с указанием замещаемого текста. [review-p3-policy] не переоткрывается; сообщается только противоречие."
        },
        {
          "id": "AST-INFEASIBLE-05",
          "severity": "major",
          "area": "spec-4/tooling",
          "description": "НЕ ЗАКРЫТ. §4.3 не изменён байт-в-байт. Контракт stripArchitectureAnchor с байтовыми смещениями start/end и локатор 'AST node ordinal' в §4.5 по-прежнему не имеют субстрата: tools/build-skills.mjs не импортирует AST-библиотеку и выполняет cpSync без трансформаций, а единственный парсер репозитория markdown-it не даёт позиций inline-узлов и не сериализуется обратно без потерь.",
          "evidence": "tools/build-skills.mjs импортирует node:fs/module/os/path/url плюс js-yaml и esbuild; package.json не содержит remark/unified/mdast/marked. Прямая проверка: MD.parse('Текст §A-MEMORY-01 и `code`.') даёт inline children с map=null. Regex-реализация запрещена CLAUDE.md, purpose-and-architecture.md:103-105 и tests/setup-contract.test.mjs:64.",
          "required_change": "Назвать конкретную библиотеку с позициями как новую build-time зависимость либо описать offset-схему поверх AST-детекции. Определить поведение для якоря в скобках, перед точкой, внутри inline code и внутри link label."
        },
        {
          "id": "JSDOC-ALREADY-DONE-06",
          "severity": "major",
          "area": "spec-4/symbol-purpose",
          "description": "НЕ ЗАКРЫТ. §4.2 не изменён байт-в-байт. Он по-прежнему описывает как новую работу уже сконфигурированное правило и не специфицирует реальный разрыв — требование, чтобы description содержал §A-*, чего require-jsdoc не умеет в принципе.",
          "evidence": "eslint.config.mjs уже подключает eslint-plugin-jsdoc с 'jsdoc/require-jsdoc': ['error', { publicOnly: true, require: { ClassDeclaration: true, FunctionDeclaration: true } }] и заголовком 'Implements §A-QUALITY-01'; Makefile mo-lint уже содержит 'npx --no-install eslint .'. В установленном плагине 64.2.1 присутствует правило match-description, которое спека не называет.",
          "required_change": "Переформулировать §4.2 как дельту к существующей конфигурации: назвать jsdoc/match-description, привести точный matchDescription regex для §A-*, указать contexts и исключения, добавить фикстуры на нарушение контента описания, а не его наличия."
        },
        {
          "id": "BIJECTION-UNSAT-07",
          "severity": "major",
          "area": "spec-4/closure",
          "description": "НЕ ЗАКРЫТ. §4.6 не изменён. Биекция §4.5 требует по одной строке на каждый paragraph и list item, но backlog содержит диалоговый транскрипт с репликами без нормативного обязательства, а закрытый набор dispositions не имеет для них значения; documented и not-blocking явно запрещены как закрывающие.",
          "evidence": "docs/backlog.md содержит фрагменты вида 'а я вроде не закреплял нигде 4.8' и '› а почему у тебя 2 клода запущены для ревью?'. §4.6: 'reported-upstream, documented, not-reproduced и not-blocking не закрывают row сами по себе'.",
          "required_change": "Добавить disposition 'no-obligation' с проверяемым критерием и обязательной ссылкой на канонический узел, контекст которого он поясняет, чтобы distinct evidence не терялся."
        },
        {
          "id": "HOT-REVIEWER-CONTRACT-08",
          "severity": "major",
          "area": "spec-2/review-independence",
          "description": "НЕ ЗАКРЫТ и стал более явным. Коррекция правильно изолирует peer-байты, сохраняя независимость между двумя ревьюерами, но формально обязывает передавать ревьюеру его собственный предыдущий report и dispositions его findings. Независимость того же ревьюера между SHA тем самым контрактно отменена, а замещаемый текст не объявлен и в Decision ledger не внесён.",
          "evidence": "Перепроверено: shared/references/methodology.md:117 по-прежнему гласит 'review that new SHA with two fresh independent reviews'. Новый §2.6: 'Для follow_up каждый reviewer получает только собственный предыдущий report и dispositions своих findings'. В ledger добавлены строки про modes, но строки про замещение правила fresh-per-SHA нет.",
          "required_change": "Зафиксировать замещение в Decision ledger и в methodology.md как явное решение, либо ограничить follow_up remediation-раундами и потребовать свежие сессии для финального same-SHA gate. Добавить фикстуру, доказывающую, что follow_up-ревьюер не подтверждает автоматически собственный прежний вердикт."
        },
        {
          "id": "ADAPTER-CMD-UNGATED-10",
          "severity": "major",
          "area": "spec-1/adapters",
          "description": "НЕ ЗАКРЫТ. Строка §1.10 про adapter fixtures и строка рисков не изменены. Фикстуры против fake/local endpoints проверяют форму argv, но не существование подкоманды, а live-probes по-прежнему выведены из mo-qc и объявлены опциональными, поэтому неверная или переименованная команда не обнаруживается ни одним гейтом.",
          "evidence": "§1.10: 'adapter fixtures выполняют documented argv against fake/local endpoints; optional live probes не входят в mo-qc'. §1.6 предписывает 'dotnet package search' (требует .NET 9+), 'cargo info' (Cargo >= 1.82) и экспериментальную 'python -m pip index versions'.",
          "required_change": "Ввести документированную live-smoke команду вне mo-qc, обязательную перед любым обновлением last_verified, и добавить в AdapterDescriptor поле tool_min_version с install/version probe, включая пометку экспериментального статуса pip index."
        },
        {
          "id": "QWEN-CONSTANT-12",
          "severity": "major",
          "area": "spec-3/local-model",
          "description": "НЕ ЗАКРЫТ. §3.9 не изменён. Точный идентификатор модели и квантование остаются жёстким блокирующим критерием поддержки, противореча §2.12, которая объявляет выбор моделей user-approved runtime configuration. Контекстный бюджет не добавлен, хотя усечения диагностики зафиксированы в свидетельствах, а compacted присутствует в §3.4 как lifecycle-состояние.",
          "evidence": "§3.9: 'OpenCode запускает exact Qwen 3.8 27B UD-Q4-KM'. §2.12: 'Конкретный выбор моделей остаётся user-approved runtime configuration, а не постоянной spec-константой'. docs/backlog-issues-real-runs.md стр. 9 (около 21k tokens усечено) и стр. 15 (около 41k tokens, 6173 строк усечено).",
          "required_change": "Перевести идентификатор модели в user-approved runtime configuration с фиксацией effective model id в evidence, сохранив требование локального профиля. Добавить context_budget: минимальное окно, обязательную фильтрацию диагностических JSON-вызовов и определённое поведение при исчерпании контекста."
        },
        {
          "id": "LEDGER-GAPS-13",
          "severity": "minor",
          "area": "traceability",
          "description": "ЗАКРЫТ ЧАСТИЧНО. Добавлены пять корректных adopted-строк про modes, severity, TUI-проекцию и stale auth. Но ни одна из трёх названных мной не появилась: замещение нормы о запрете adjudication grammars, переход от fresh-per-SHA к hot/follow_up, и разбор зафиксированного пользователем slice-бюджета review/fix.",
          "evidence": "Новые ledger-строки касаются coverage profiles, mode policy, P0-P3, TUI projection и stale account cache. docs/backlog-issues-real-runs.md стр. 123: 'максимум пять циклов review/fix для одного большого функционального куска спеки'; стр. 125 требует двух разных счётчиков (глобальный audit id и пользовательский slice N / attempt M of 5). shared/references/review-protocol.md:84 и methodology.md:117-118 остаются незамещёнными.",
          "required_change": "Добавить три строки в Decision ledger с обоснованием и указанием замещаемого текста. Развести settlement-cap (отклонён обоснованно) и slice-budget (пользовательское требование о продвижении по спеке), назначив последнему владельца или явный rejected-статус с причиной."
        }
      ],
      "assumptions": [
        "Findings FIND-SR-001..012 переданы только идентификаторами без текста; я не объявляю их закрытыми и не угадываю их содержание, а описываю то, что коррекция демонстрируемо делает в затронутых областях.",
        "Мои findings второго раунда (BUSINESS-CONTRADICTION-14, ACCEPTANCE-PROVENANCE-15, KNOWLEDGE-GATE-MECHANICS-16, MEMORY01-EDIT-SURFACE-17, SEVERITY-GRAMMAR-COLLISION-18, DOD-README-TRAP-19) в список верификации не включены. Из них я поднял только тот аспект, который коррекция объективно ухудшила, оформив его как REGRESSION-SEVERITY-GRAMMAR-20; SEVERITY-GRAMMAR-COLLISION-18 отмечен как устранённый в non-blocking notes.",
        "Я трактовал frozen decisions как авторитет пользователя и сообщил только конкретные противоречия, не предлагая альтернатив.",
        "Закрытие FINAL-GATE-SCOPE-11 я засчитал по существу: follow_up как перепроверка dispositions плюс delta делает цикл сходящимся и аттестующим, что снимало обе половины исходной дилеммы, несмотря на неопределённый scope-enum.",
        "Я не выполнял сетевых probe для adapter-команд; выводы о версионных требованиях dotnet/cargo/pip основаны на известных свойствах этих CLI.",
        "Полное закрытие INVENTORY-LOSS-01 может расширить границы spec 3/4, поэтому я запросил явное решение пользователя в тексте ответа, не вызывая инструмент вопроса, и зафиксировал рекомендацию в пользу bounded orchestrator fix."
      ],
      "round": 2,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 4
would_adopt: false
