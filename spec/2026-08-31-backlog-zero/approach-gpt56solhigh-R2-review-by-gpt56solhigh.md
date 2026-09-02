## Facts & Constraints — White Hat

Обе версии стали заметно сильнее: они отделяют portable skills от Meta-O orchestration, сохраняют Orca единственным backend, не возвращают Herdr/Paseo и не оставляют создание `senior-python`/`senior-jsts` как будущую задачу.

Proposal 1 теперь имеет наиболее реалистичную основу программы: native Orca contract вынесен к владельцу control plane, `bound_to_turn` заменяет недоказуемое «модель потребила сообщение», а permanent closure index пытается связать исходные Git blobs с доказательствами. Full-history gate также исправляет прежний очевидный пробел сравнения только с merge base.

Однако несколько заявленных проверок пока не соответствуют данным, которые они должны проверять:

- В Proposal 1 `BW-01..17` — семантические пожелания, тогда как автоматический extractor описан через Markdown paragraph/list nodes. В соответствующем разделе backlog AST-узлов существенно больше семнадцати. Нет детерминированного правила, которое превращает их именно в 17 требований и доказывает отсутствие пропущенных фрагментов.
- `docs/references/` по проектному контракту — архив, а не current requirements. Proposal 1 делает closure index одновременно историческим архивом, нормативным перечнем ожидаемых требований и входом `mo-qc`. Эти роли нужно разделить.
- В Proposal 2 коды `R-A..R-AQ` и ссылки вида `R-A#7` живут только в удаляемых спеках и не имеют immutable Git/blob locators. После удаления ledger checker уже не сможет независимо восстановить, что все исходные наблюдения представлены.

Матрицы `find-reuse` в обоих предложениях полезны, но требуют технической очистки. В Proposal 1 локальный произвольный query передаётся `rg` как regex, PyPI discovery всё ещё не имеет достаточного executable fixture, а часть optional hosting adapters только названа. В Proposal 2 команды с `<q>` часто не URL-encode ввод; security-команды вроде `npm audit signatures`, `cargo audit`, `pip-audit` требуют отличающихся предпосылок; GitHub login требует избыточный `repo` scope; правило «кандидат без package и repository не может быть финалистом» исключает законные standalone repositories, hosted services и непакетированные CLI.

## Risks & Failure Modes — Black Hat

Главный риск Proposal 1 — ложное ощущение machine-checkable losslessness. Проверка существования test name, E2E ID или architecture anchor доказывает ссылочную целостность, но не то, что proof закрывает соответствующий исходный смысл. Для программы допустим человеческий semantic review поверх машинной полноты, но это нужно прямо включить в closure protocol: reviewer обязан сопоставить полный текст каждого source span с disposition и доказательством.

Full-history алгоритм Proposal 1 некорректно определён для merge DAG. Правило «любой `absent → present` на parent edge после предыдущего появления ID является reuse» отвергнет обычный merge: ID может существовать в одной ветке, отсутствовать в другой и законно появиться в merge result. Аналогично удаление на одной ветви ещё не означает глобальную retirement. Нужна формальная lineage-семантика: например, retirement рассматривается на выбранной first-parent knowledge history, а side branches проверяются относительно точки fork; либо ID считается retired только после отсутствия во всех релевантных потомках. Текущий алгоритм нельзя реализовать без ложных срабатываний.

Proposal 1 по-прежнему ограничивает активные роли тремя sessions: executor и два reviewers. Это не покрывает отдельную видимую checking/E2E role, требуемую §B-SESSION-01. Также `agent_state=detected` не доказывает, что lifecycle events принадлежат действительно запущенному harness: необходима привязка session к процессу/capability, route и execution с последующей revocation при exit/replacement. Запрет классифицировать bare-shell output как `worker_done` сам по себе не описывает, как Orca это надёжно отличает.

В review contract Proposal 1 фраза «любой `unproven`, влияющий на verdict, означает `UNKNOWN`» создаёт бесконечный цикл: reviewer всегда может оставить непроверяемое подозрение. `UNKNOWN` должен возникать только при недоступности обязательного evidence или неполном выполнении review, тогда как неподтверждённый кандидат после достаточной проверки становится `refuted` либо residual risk, не влияющим на gate.

В Proposal 2 наиболее опасна доктрина «постоянного workaround». Она объявляет закрытыми отсутствующие Orca capabilities, если локальное правило якобы останется полезным после upstream fix. Это не соответствует §B-PORTABILITY-06 и не решает ряд инцидентов:

- `dispatch_capability_invalid` предлагается принять как settled response по префиксу `Original body:`. Отклонённое lifecycle-сообщение не становится авторитетным `worker_done`; такой fallback может принять сфабрикованный или повторный текст за gate verdict.
- `worker-retain → dispatch_not_found` заменяется бездействием. Бездействие не доказывает retention, если backend может автоматически освободить ресурс.
- Потеря coordinator pane заканчивается `needs_attention`, хотя требуемый takeover/recovery не реализован.
- Terminal/TUI probe ladder остаётся диагностическим fallback вместо публичных typed states.
- Отсутствие upstream tracker объявлено не блокирующим, хотя бизнес-требование прямо требует отправлять дефекты backend вверх.

Это не постоянные инварианты безопасности, а маскировка незакрытых backend gaps.

## Strengths & Benefits — Yellow Hat

Proposal 1 хорошо исправляет прежние замечания:

- raw ledger сохраняется byte-for-byte;
- источник фиксируется Git commit и blob OID, а не только хрупкой нумерацией;
- duplicate evidence не теряется;
- upstream capability и live E2E становятся условием closure;
- transient execution state не превращается в Meta-O state store;
- Orca schemas разделяют session и execution, receipt и effect, delivery и binding;
- review разделён на grounding, discovery, verification, causality, severity и reporting;
- evaluation не выдаёт ensemble-гипотезу за установленный факт;
- `find-reuse` различает semantic search, name discovery и exact lookup.

Proposal 2 особенно силён как аналитический разбор ledger: хорошо объединены повторяющиеся quota, wakeup, posture, QC-contamination и role-ownership incidents, при этом различия повторов описаны отдельно. Review design ясно отделяет evidence от confidence и сохраняет два vendor-diverse reviewers как обязательный lifecycle gate. Также правильно выявлен конфликт числовых review budgets с действующим бизнес-слоем: implementation действительно не вправе молча внедрять `3 minor rounds` или universal cap.

## Approved-boundary verification — Green Hat constrained

Ни одно предложение не возвращает Herdr/Paseo, не создаёт Meta-O workflow engine и не поручает заново создать пользовательские senior skills.

Конкретные регрессии утверждённых границ всё же есть:

- Proposal 1 нарушает видимую lifecycle-role boundary, ограничивая run тремя sessions без checking/E2E role.
- Proposal 2 фактически обходит Orca public-result boundary, принимая rejected `dispatch_capability_invalid` body как settled result.
- Proposal 2 отказывается считать upstream issue обязательным даже для подтверждённых Orca defects, что противоречит §B-PORTABILITY-06.
- Proposal 2 допускает невидимый executor self-review как «исключение», хотя такого исключения в §B-SESSION-01 не установлено.
- Proposal 2 оставляет shell symbol-purpose только на review, заранее объявив отсутствие mature tooling без выполнения предусмотренного `find-reuse`. Это преждевременно закрывает установленный backlog item архитектурным утверждением.

## Completeness & Process — Blue Hat

Proposal 1 близок к принимаемой основе, но перед реализацией нужны четыре исправления:

1. Вывести source inventory непосредственно из immutable blobs и определить исчерпывающие AST spans без заранее подобранного числа `BW-*`.
2. Оставить raw archive в `docs/references/`, но разместить нормативный requirement/proof contract в `docs/acceptance.md` или ином допустимом current-knowledge source.
3. Исправить history gate для merge DAG и добавить соответствующие fixtures.
4. Добавить checking/E2E role, trusted harness binding и конечную семантику residual review risks.

Proposal 2 требует более глубокой переделки. Нельзя удалять ledger, пока нет постоянного locator-level inventory; нельзя закрывать backend gaps эвристическими fallback; нельзя удалять S10 corpus, оставляя архитектурное решение с числами без воспроизводимого evidence. Его DoD также содержит непроверяемые или ошибочные проверки: поиск слов `manifest`, `receipt` и `digest` конфликтует с легитимным narrow watchdog digest и документацией, а отсутствие маркера `pending-upstream-fix` ничего не доказывает о фактической временности workaround.

Консервативно предполагаю, что upstream Orca repository доступен исполнителям программы, но никакое изменение или issue там ещё не совершено; поэтому все зависящие от него closure rows должны оставаться открытыми до released/tested capability.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-1",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "Предложение стало хорошей основой программы: исправлены lossless provenance, full-history intent, native Orca contract, evidence-first review и переносимость find-reuse. До принятия остаются существенные контрактные дефекты: семантические BW-единицы не выводятся детерминированно из AST, closure index помещён в архивную область как нормативный источник, history algorithm некорректен для merge DAG, отсутствует checking/E2E role и не доказана привязка lifecycle events к настоящему harness.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "P1-INV-AST-01",
          "severity": "major",
          "area": "lossless inventory",
          "description": "Ожидаемые BW-01..17 являются вручную выделенными смыслами, тогда как extractor и checker оперируют paragraph/list AST nodes; эти множества не совпадают.",
          "evidence": "SP-08 обещает покрытие каждого expected source AST node и одновременно фиксирует ровно BW-01..17, но не задаёт машинного правила выбора семнадцати узлов из многопараграфного Orca backlog item.",
          "required_change": "Определить исчерпывающий AST-span partition исходного backlog blob, разрешить явно проверяемые grouped contiguous spans либо назначить locator каждому исходному содержательному узлу; expected count должен вычисляться из blob, а не задаваться заранее."
        },
        {
          "id": "P1-KNOWLEDGE-PLACEMENT-02",
          "severity": "major",
          "area": "knowledge architecture",
          "description": "Closure index в docs/references одновременно объявлен архивом и нормативным входом acceptance/mo-qc.",
          "evidence": "AGENTS.md определяет docs/references как source material/archive, never current requirements; Proposal 1 называет index каноническим requirement-to-proof contract и обязательным потребителем mo-qc.",
          "required_change": "Оставить в docs/references только raw historical evidence, а нормативную closure map разместить в docs/acceptance.md либо другом current-knowledge source; checker должен ссылаться на immutable source blobs."
        },
        {
          "id": "P1-HISTORY-DAG-03",
          "severity": "major",
          "area": "knowledge history gate",
          "description": "Absent/present transitions по каждому parent edge дают ложное reintroduction на обычных merge commits.",
          "evidence": "ID, добавленный в feature branch и отсутствующий в другом parent, при merge образует absent→present edge, хотя никогда не был retired в своей lineage.",
          "required_change": "Задать формальную merge-aware lifecycle semantics и fixtures для параллельного add, branch-only removal, merge, revert и true post-retirement reuse."
        },
        {
          "id": "P1-ROLE-BOUNDARY-04",
          "severity": "major",
          "area": "orchestration",
          "description": "Лимит из executor и двух reviewer sessions исключает отдельную checking/E2E role.",
          "evidence": "SP-04 разрешает максимум три active sessions, тогда как §B-SESSION-01 требует отдельную видимую checking role.",
          "required_change": "Добавить отдельную bounded checking/E2E session или доказать через изменение вышестоящего требования, что она не применима; review sessions не должны совмещать эту роль."
        },
        {
          "id": "P1-HARNESS-AUTH-05",
          "severity": "major",
          "area": "Orca public contract",
          "description": "agent_state=detected не является достаточным доказательством происхождения lifecycle events.",
          "evidence": "Контракт запрещает bare-shell worker_done, но не задаёт process/capability binding, ownership token или revocation при exit/replacement.",
          "required_change": "Связать session и execution с проверенным harness process/effective route, а events — с этой execution; определить invalidation при потере процесса, replacement и stale generation."
        },
        {
          "id": "P1-REVIEW-UNKNOWN-06",
          "severity": "major",
          "area": "review convergence",
          "description": "Любой влияющий на verdict unproven candidate переводит gate в UNKNOWN и позволяет бесконечно блокировать lifecycle недоказуемым подозрением.",
          "evidence": "SP-03 не различает недоступное обязательное evidence и обычный кандидат, который не удалось подтвердить после достаточной falsification.",
          "required_change": "UNKNOWN оставить для неполного review или недоступного обязательного evidence; неподтверждённые кандидаты после заданной проверки переводить в refuted/residual risk без блокировки."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "P1-REUSE-CMDS-07",
          "severity": "minor",
          "area": "find-reuse",
          "description": "Несколько команд не полностью реализуют arbitrary literal query и optional adapters.",
          "evidence": "rg запускается без -F; Bitbucket назван без concrete command/auth; PyPI semantic discovery не имеет самостоятельного acceptance fixture.",
          "required_change": "Уточнить literal/regex semantics, дать полный adapter descriptor для каждого поддерживаемого source и добавить fixture degraded PyPI discovery."
        }
      ],
      "assumptions": [
        "Исходные backlog blobs в 41a4898974a6a08eb415cb07ba849575c5964b61 являются базой инвентаря, пока не доказан более поздний lossless descendant.",
        "Upstream Orca можно специфицировать в рамках программы, но его capabilities не считаются реализованными до native tests и Meta-O live E2E.",
        "Semantic adequacy requirement-to-proof mapping проверяется двумя final reviewers, поскольку одна ссылочная проверка этого доказать не может."
      ],
      "round": 2,
      "reviewer": "gpt56solhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
