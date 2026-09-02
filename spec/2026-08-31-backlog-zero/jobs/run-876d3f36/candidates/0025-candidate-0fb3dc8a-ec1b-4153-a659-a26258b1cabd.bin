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
      "target_id": "proposal-1",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "Proposal 1 остаётся наиболее пригодной основой благодаря immutable source locators, byte-identical archive, экономичному find-reuse и явному workaround contract. Однако новая редакция внесла критическую регрессию: public terminal read объявлен допустимым settled-response transport вопреки §A-RESPONSE-01. Дополнительно не покрыта checking role, AST inventory не доказывает именно 17 embedded wishes, history algorithm ошибочен на merge DAG, а removal probes не имеют обязательного автоматического потребителя.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "P1-RESPONSE-BOUNDARY-01",
          "severity": "critical",
          "area": "settled response",
          "description": "Квалифицированный terminal read используется как gate-проходящий settled response вопреки действующему §A-RESPONSE-01.",
          "evidence": "Архитектурное решение разрешает только полное orchestration message worker_done и оставляет whole-session/terminal views для диагностики; SP-04 и DoD допускают worker_done либо terminal read.",
          "required_change": "Удалить terminal read из proof path и возвращать UNKNOWN/unsupported до исправления worker_done либо оформить отдельное изменение §A-RESPONSE-01 на надлежащем архитектурном уровне."
        },
        {
          "id": "P1-SESSION-ROLE-02",
          "severity": "major",
          "area": "session lifecycle",
          "description": "Модель active roles ограничена executor и двумя reviewers и не содержит отдельной checking/E2E role.",
          "evidence": "§B-SESSION-01 требует отдельные сессии исполнителя, двух ревьюеров и проверяющей роли.",
          "required_change": "Добавить bounded visible checking/E2E session и включить её ownership, retention, recovery и cleanup в SP-04."
        },
        {
          "id": "P1-INVENTORY-PARTITION-03",
          "severity": "major",
          "area": "lossless inventory",
          "description": "Диапазон BW-01..17 не выводится из описанного AST extraction и поэтому не доказывает покрытие всего B5 source span.",
          "evidence": "Исходный раздел состоит из большего числа headings, paragraphs и list items, чем семнадцать вручную сведённых пожеланий.",
          "required_change": "Определить детерминированный полный partition исходного blob на source spans; expected IDs и counts должны вычисляться из этого partition, а каждый сгруппированный span обязан быть непрерывным и полностью покрытым."
        },
        {
          "id": "P1-HISTORY-MERGE-04",
          "severity": "major",
          "area": "knowledge history",
          "description": "Проверка absent/present по каждому parent edge ложно классифицирует нормальный merge как повторное использование ID.",
          "evidence": "ID может присутствовать в одном parent и отсутствовать во втором; merge result создаёт absent→present edge без предшествующей retirement в lineage, где ID был введён.",
          "required_change": "Задать merge-aware lifecycle semantics и fixtures для parallel add, branch removal, merge, revert и настоящего reuse после retirement."
        },
        {
          "id": "P1-WORKAROUND-RETIREMENT-05",
          "severity": "major",
          "area": "workaround lifecycle",
          "description": "Removal probe имеет описание, но не имеет обязательного cadence или consumer, который запустит его после обновления Orca.",
          "evidence": "Closure index и colocated contract сохраняют trigger, однако ни install/update/setup/QC path не обязан проверять изменение поведения backend.",
          "required_change": "Назвать автоматический consumer removal probe, например setup/backend qualification при изменении companion behavior, и определить failure, который требует удалить или пересмотреть workaround."
        },
        {
          "id": "P1-KNOWLEDGE-ROLE-06",
          "severity": "major",
          "area": "knowledge architecture",
          "description": "Один файл в docs/references одновременно служит архивом и нормативным expected inventory для acceptance/mo-qc.",
          "evidence": "AGENTS.md определяет docs/references как archive, never current requirements.",
          "required_change": "Оставить raw evidence и locators в архивной области, а current requirement-to-proof contract разместить в docs/acceptance.md или ином нормативном source."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "P1-REUSE-DETAILS-07",
          "severity": "minor",
          "area": "find-reuse",
          "description": "Некоторые concrete query contracts остаются неполными.",
          "evidence": "Local rg трактует произвольный query как regex; Bitbucket только назван; PyPI fixture проверяет exact lookup/download, но не discovery degradation.",
          "required_change": "Задать literal/regex режим, полный descriptor каждого заявленного adapter и acceptance fixture для PyPI discovery."
        },
        {
          "id": "P1-REVIEW-UNKNOWN-08",
          "severity": "minor",
          "area": "review convergence",
          "description": "Фраза о существенном unproven risk допускает вечный UNKNOWN.",
          "evidence": "Не определено различие между недоступным обязательным evidence и подозрением, которое не подтвердилось после проверки.",
          "required_change": "UNKNOWN оставить для неполного scope/evidence; остальные неподтверждённые кандидаты переводить в refuted или non-blocking residual risk."
        }
      ],
      "assumptions": [
        "Локальный workaround может закрыть Meta-O backlog только если полностью выполняет действующий backend contract, имеет upstream issue и реально исполняемый removal lifecycle.",
        "§A-RESPONSE-01 остаётся неизменным в рамках этой программы, поскольку предложение не выделяет его пересмотр в отдельное вышестоящее решение.",
        "Checking role из §B-SESSION-01 соответствует самостоятельной E2E/QC роли, а не одному из reviewer sessions."
      ],
      "round": 3,
      "reviewer": "gpt56solhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
