## Facts & Constraints — White Hat

Обе редакции стали строже и исправили часть прежних проблем. Proposal 1 теперь требует upstream issue для каждого workaround и не разрешает обход, ослабляющий backend contract. Proposal 2 перестал принимать `dispatch_capability_invalid` body как gate result и отделил диагностические акселераторы от нормативных доказательств.

При этом точный действующий контракт устанавливает две важные границы:

- §A-RESPONSE-01 разрешает settled response только как полное orchestration message `worker_done`. Whole-session view и terminal preview оставлены только для диагностики.
- §B-SESSION-01 требует отдельные долгоживущие видимые сессии исполнителя, двух ревьюеров и проверяющей роли.

Из этого следуют прямые проблемы Proposal 1: квалифицированный terminal read нельзя ввести как workaround на implementation-уровне, а модель максимум из трёх sessions не покрывает checking/E2E role.

Обе версии всё ещё смешивают автоматически извлекаемые Markdown nodes с вручную выделенными смысловыми требованиями. В `docs/backlog.md` раздел B5 содержит headings, абзацы, списки, цитаты и вложенные группы. Из описанного AST extractor не следует ровно `BW-01..17`. Проверка заранее заданного диапазона IDs доказывает заполнение таблицы, но не исчерпывающее покрытие исходного blob.

## Risks & Failure Modes — Black Hat

В Proposal 1 наиболее опасная регрессия — settled-response fallback. Normal/long fixtures могут доказать, что terminal read иногда возвращает полный текст, но не превращают его в авторитетный settled event конкретной execution. Terminal surface может включить предыдущий turn, повтор, диагностический префикс или вывод соседнего процесса. Это именно тот класс неоднозначности, ради которого §A-RESPONSE-01 закрепил `worker_done`.

Workaround lifecycle Proposal 1 также недоопределён. `removal_probe` рядом с обходом сообщает, когда его следует удалить, но никакой named consumer не обязан запускать probe после обновления Orca. Без cadence/trigger временный обход практически становится вечным, что противоречит требованию §B-PORTABILITY-06 «уходит вместе с исправлением».

Proposal 2 заменяет backend gaps «честной деградацией», но применяет её слишком широко. Инвариант правильно предотвращает ложный успех, однако не закрывает исходные требования о:

- надёжном wakeup;
- восстановлении после временного reconnect;
- ожидании quota без пробуждения человека;
- продолжении ночного процесса;
- восстановлении управления после потери coordinator pane.

§B-UPTIME-01 требует, чтобы временная ошибка провайдера не останавливала ночной процесс, а исчерпанный лимит подписки приводил к ожиданию следующего окна. Неограниченное удержание roles в `unknown` либо перевод в `needs_attention` — безопасное поведение, но не полная реализация этих требований. Такие строки нельзя очищать как закрытые, пока нет безопасного retry/wakeup path или явного вышестоящего решения отказаться от capability.

Исторический gate в обеих версиях имеет разные, но серьёзные дефекты:

- Proposal 1 рассматривает transitions по каждому parent edge. Обычный merge ветки с новым ID образует `absent → present` относительно второго parent и может быть ошибочно принят за reuse.
- Proposal 2 по-прежнему сравнивает только merge base и HEAD, поэтому не видит ID, существовавший и удалённый до merge base.

## Strengths & Benefits — Yellow Hat

Proposal 1 остаётся сильнее как основа программы:

- immutable Git blob locators и byte-identical raw archive существенно уменьшают риск потери ledger;
- workaround требует issue, public native surface, failure behavior и E2E;
- `find-reuse` хорошо отделён от Meta-O lifecycle;
- registry activation зависит от detected ecosystems;
- review разделён на самостоятельные стадии;
- first-executor spec commit и docs-only deletion lifecycle определены достаточно конкретно;
- full-history анализ выбран вместо заведомо недостаточного merge-base snapshot.

Proposal 2 лучше разрешает review semantics:

- `unproven` остаётся residual risk и не превращает любое подозрение в вечный `UNKNOWN`;
- отклонённая доставка больше не считается verdict;
- diagnostic accelerators явно объявлены ненормативными;
- confidence не смешивается с evidence и severity;
- distinct context повторных инцидентов описан содержательно;
- конфликт `3 minor rounds` с §B-REVIEW-03 замечен и не протащен в runtime skill.

Обе версии правильно не возвращают Herdr/Paseo, не создают workflow engine, не пересоздают senior skills и сохраняют два vendor-diverse review как lifecycle gate.

## Approved-boundary verification — Green Hat constrained

Proposal 1 конкретно нарушает две утверждённые границы:

1. `worker_done` заменяется qualified terminal read без изменения §A-RESPONSE-01.
2. В orchestration одновременно существуют только executor и два reviewers, хотя §B-SESSION-01 требует ещё checking role.

Proposal 2 не нарушает settled-response boundary после последней правки, но нарушает uptime outcome: безопасное `unknown` выдается за полноценное закрытие требования, которое требует автономного ожидания и восстановления.

Обе версии помещают permanent closure index в `docs/references/`, хотя AGENTS.md называет этот каталог архивом, «never current requirements». Как архив исходных bytes он расположен правильно; как нормативный expected inventory для `mo-qc` и acceptance — нет. Нужны два носителя: архивные source locators в `docs/references/` и current closure contract в `docs/acceptance.md` либо другом нормативном документе.

Proposal 2 также сохраняет явно невидимый clean-room subagent как допустимое исключение. §B-SESSION-01 такого исключения не устанавливает: агент должен запускаться нативно в видимой backend session. Advisory статус не отменяет это ограничение.

## Completeness & Process — Blue Hat

Для Proposal 1 нужны следующие изменения перед принятием:

1. Удалить terminal read из допустимых settled-response transports либо сначала отдельно изменить §A-RESPONSE-01 на архитектурном уровне.
2. Добавить checking/E2E session в role ownership.
3. Определить merge-aware history semantics.
4. Вычислять source inventory из полного partition исходных blobs, а не проверять заранее выбранные `BW/RR/RI` ranges.
5. Назначить автоматический consumer для `removal_probe`.
6. Разделить historical archive и нормативный closure contract.
7. Ограничить `UNKNOWN` в review случаями недоступного обязательного evidence; неподтверждённое подозрение после достаточной проверки должно стать residual risk или `refuted`.

Proposal 2 требует более глубокой корректировки:

1. Разложить каждый RC3 incident на два proof obligations: предотвращение ложного успеха и фактическое recovery/wakeup. Honest degradation закрывает только первое.
2. Ввести permanent immutable locator inventory и raw byte-identical archive.
3. Заменить merge-base gate на корректную history-модель.
4. Сохранить preregistration, corpus locators, aggregate results и adjudication S10 как долговечное evidence; одного ADR с итоговыми числами недостаточно.
5. Убрать невидимый review subagent либо запускать его в видимой backend session.
6. Сделать `find-reuse` действительно экономичным: не запускать npm/PyPI/crates/Go на каждой задаче, URL-encode arbitrary query, использовать минимальные auth scopes и разрешить repository-only, package-only и service candidates.
7. Разрешить B5.18 как отклонённое нижнеуровневое пожелание из-за действующего §B-REVIEW-03 либо оставить его в backlog. «Открытое решение в удаляемой spec» несовместимо с пустым backlog.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 5,
      "would_adopt": false,
      "summary": "Proposal 2 правильно исправил обработку отклонённого verdict и сделал upstream reporting обязательным, а его review architecture остаётся сильной. Но honest degradation закрывает только риск ложного успеха, а не исходные требования автономного wakeup/recovery/quota handling; поэтому несколько incident groups всё ещё переименованы в безопасную незавершённость. Кроме того, отсутствует permanent locator-level inventory, history gate остаётся merge-base-only, S10 удаляет собственное доказательство, а обязательный для всех задач find-reuse core неэкономичен.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "P2-DEGRADATION-SCOPE-01",
          "severity": "critical",
          "area": "Orca incident closure",
          "description": "Инвариант honest degradation используется для закрытия не только false-success, но и отсутствующего автономного recovery/wakeup.",
          "evidence": "§B-UPTIME-01 требует переживать временную перегрузку/reconnect без остановки ночного процесса и ждать quota window без пробуждения человека; unknown/needs_attention и бессрочное удержание roles этого не реализуют.",
          "required_change": "Разделить proof obligations: honest degradation закрывает только отсутствие ложного verdict; recovery, wakeup и quota continuation должны иметь отдельный working path/E2E либо оставаться backlog/upstream blocker."
        },
        {
          "id": "P2-LOSSLESS-LOCATORS-02",
          "severity": "critical",
          "area": "lossless inventory",
          "description": "Временные R-A..R-AQ и R-A#N удаляются вместе со specs и не обеспечивают immutable mapping исходного ledger.",
          "evidence": "DoD проверяет биекцию по IDs раздела §3, но после удаления program specs не остаётся канонического множества этих IDs, source byte ranges или byte-identical archive.",
          "required_change": "Создать permanent Git-blob/AST locator inventory, сохранить raw ledger byte-for-byte и вычислять expected rows из полного source partition."
        },
        {
          "id": "P2-HISTORY-RANGE-03",
          "severity": "major",
          "area": "knowledge history",
          "description": "Merge-base/HEAD comparison не обнаруживает ID, который существовал и был удалён до merge base.",
          "evidence": "S8 и DoD по-прежнему описывают только merge-base case, несмотря на исходное требование исторического запрета reuse.",
          "required_change": "Ввести merge-aware reachable-history gate либо эквивалентный Git-derived proof first introduction, retirement и reintroduction."
        },
        {
          "id": "P2-EVAL-PROVENANCE-04",
          "severity": "major",
          "area": "review evaluation",
          "description": "S10 удаляет corpus и preregistration, оставляя только архитектурный вывод с числами.",
          "evidence": "После удаления specification невозможно независимо проверить выбор cases, held-out split, oracle, adjudication и расчёт thresholds.",
          "required_change": "Сохранить credential-safe corpus locators, preregistration, aggregate results и adjudication protocol как durable research evidence с именованным потребителем."
        },
        {
          "id": "P2-REUSE-ECONOMY-05",
          "severity": "major",
          "area": "find-reuse",
          "description": "Ядро GitHub/npm/PyPI/crates/Go объявлено обязательным для каждого запуска, что противоречит требованию экономичного per-scope coverage.",
          "evidence": "PHP, Java или infrastructure task должна будет проверять несвязанные registry sources; одновременно URL query forms не кодируют arbitrary input, а repository-only/service candidates исключаются из finalists.",
          "required_change": "Сделать обязательным local+source-hosting core, а registries активировать только по detected/allowed ecosystems; использовать encoded parameters и type-specific enrichment gates."
        },
        {
          "id": "P2-OPEN-DECISION-06",
          "severity": "major",
          "area": "backlog closure",
          "description": "Пожелание B5.18 оставлено открытым решением во временной S3, которая затем удаляется.",
          "evidence": "Нерешённое изменение §B-REVIEW-03 является postponed work по §B-LONGEVITY-04 и не может исчезнуть вместе со spec при пустом backlog.",
          "required_change": "Либо формально отклонить numeric/minor-round rule из-за действующего business requirement и сохранить disposition, либо изменить §B-REVIEW-03 до closure; не оставлять его открытым в удаляемой spec."
        },
        {
          "id": "P2-INVISIBLE-REVIEW-07",
          "severity": "major",
          "area": "session visibility",
          "description": "Невидимый clean-room subagent объявлен допустимым исключением без основания в §B-SESSION-01.",
          "evidence": "Business contract требует нативные видимые backend sessions и возможность человеку прочитать и продолжить любую agent session.",
          "required_change": "Запускать advisory clean-room review в отдельной видимой backend session либо отказаться от него; implementation-layer exception недопустим."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "P2-CANDIDATE-TYPES-08",
          "severity": "minor",
          "area": "find-reuse",
          "description": "Требование package+repository для каждого finalist исключает законные сервисы и непакетированные инструменты.",
          "evidence": "Generic reuse capability может быть предоставлена standalone repository, executable, hosted API или service без registry package.",
          "required_change": "Ввести candidate kinds и отдельные обязательные signals для package, repository, service и tool."
        },
        {
          "id": "P2-DOD-SCAN-09",
          "severity": "minor",
          "area": "Definition of Done",
          "description": "Repository scan по словам manifest, receipt и digest конфликтует с легитимной документацией и narrow watchdog digest.",
          "evidence": "Проект уже использует эти термины и разрешает один специальный digest.",
          "required_change": "Проверять конкретные запрещённые runtime artifacts/schemas, а не наличие слов."
        }
      ],
      "assumptions": [
        "Безопасная деградация является обязательным инвариантом, но не заменяет отдельное бизнес-требование автономного восстановления.",
        "Program spec удаляется согласно §B-MEMORY-03 и поэтому не может оставаться единственным expected inventory или evidence corpus.",
        "Исходный raw ledger должен быть восстанавливаем и машинно сопоставим без обращения к prior council artifacts."
      ],
      "round": 3,
      "reviewer": "gpt56solhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 5
would_adopt: false
