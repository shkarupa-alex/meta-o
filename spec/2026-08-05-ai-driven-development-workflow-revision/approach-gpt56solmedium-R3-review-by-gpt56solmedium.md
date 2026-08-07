## Facts & Constraints — White Hat

Обе редакции правильно выбрали базовый вектор: workflow engine действительно не нужен для заявленного уровня гарантий. Git commit SHA, native backend sessions, project commands и человечески читаемая spec покрывают большую часть полезных функций старого control plane.

Локальная проверка, однако, выявляет существенную разницу между предложениями.

У Proposal 1 backend capabilities в основном маркированы осторожно (`available | inferred | unavailable`), а Paseo не выдаётся за локально проверенный. Это хороший стандарт доказательности. Но статус `available` для «полного ответа» нельзя присваивать только по наличию export/logs-команды: нужно проверить длинный transcript, pagination и отсутствие лимита. Указанный в Proposal 2 Omnigent endpoint с `limit=500` особенно важен: без доказанной пагинации export не гарантирует полный turn.

Proposal 2 содержит фактически неверные Herdr-команды:

- `HERDR_ENV=1 herdr --skill` подделывает precondition. Native skill требует проверить уже установленный `HERDR_ENV=1` и остановиться, если его нет.
- `herdr pane split` возвращает pane в `.result.pane`, поэтому `.pane_id` на верхнем уровне неверен.
- Attach вызывается как `herdr agent attach`, а не `herdr attach`.

Это не косметические ошибки: Herdr является первым target, а приведённый implementation-ready flow не выполнится как написан.

Codex 0.146.0 действительно показывает feature `goals stable true`, а локальная SQLite содержит описанные поля. Но `~/.codex/goals_1.sqlite` — private storage, а не хороший methodology contract. Кроме того, приведённый recovery-запрос не фильтрует `thread_id`, поэтому при нескольких executor sessions он не устанавливает, какая goal относится к текущей feature. Нормативный путь должен использовать TUI или документированный app-server interface; SQLite допустима лишь как диагностический fallback конкретной проверенной версии.

Claude Code 2.1.222 подтверждает `--autocompact`, resume/fork, agents и budget options. Однако `/goal` не видна в обычной CLI help, поэтому её transport, resume и termination semantics должны быть подтверждены отдельным живым spike. Даже если slash-команда существует, prompt-based Stop hook с самоотчётом `STATUS` слабее Codex completion audit и не должен описываться как эквивалентная гарантия.

## Risks & Failure Modes — Black Hat

### Proposal 1

Главный риск — неполная implementation readiness при хорошем архитектурном направлении.

Три backend-specific orchestrator skills определены правильно, но несколько обязательных решений остаются только декларациями:

- нет полной карты переноса требований из `execute-feature`;
- нет поэлементного state audit: исходная проблема, способ восстановления, конкретная потеря и окончательное решение;
- не проведено требуемое сравнение backend orchestrator skill с вариантом «native backend skill + task/spec + project instructions» без отдельного methodology orchestrator skill;
- `mo-review` не закрепляет недвусмысленно cross-vendor reviewer и запрет self-review;
- «отдельный CLI/session context» для reuse research слабее требования отдельного CLI instance и отдельного контекста.

Размещение model helper рядом с skills, но вне конкретного устанавливаемого skill-каталога, рискует сломать выборочную установку через `npx skills --skill`. Helper должен находиться внутри каталога owning skill либо распространяться отдельным явно устанавливаемым package.

Полное сообщение Herdr нельзя считать обеспеченным формулировкой «записать Markdown». Нужны безопасный временный каталог вне repository, проверка существования/полноты файла и явный fallback. Иначе reviewer загрязнит candidate worktree или файл случайно попадёт в commit.

### Proposal 2

Proposal 2 выглядит подробнее, но в нескольких местах возвращает именно тот control/state thinking, который должно устранить.

`mo-orchestrate` плюс `mo-herdr|mo-omnigent|mo-paseo` — generic textual router. Это противоречит требованию трёх альтернативных backend-specific orchestrator skills. Пользователь должен выбирать `mo-orchestrate`, `mo-orchestrate-omnigent` или `mo-orchestrate-paseo`, а не запускать общий entry, который затем маршрутизирует в mechanics layer.

`refs/mo/candidate` — operational state, несмотря на утверждение об отсутствии state. Один глобальный ref на repository:

- конфликтует с несколькими branches/features;
- может остаться stale после завершения;
- требует lifecycle и cleanup;
- не связывает candidate со spec или backend sessions;
- способен ввести восстановившегося orchestrator в заблуждение.

Для baseline достаточно полного SHA, переданного gates, и проверки текущей branch reality. Если ref действительно понадобится, он должен быть optional, namespaced и обоснован измеренным recovery failure.

Herdr file handoff в `.mo/out` создаёт новый repository artifact, `.gitignore` convention и write permission для reviewer. Это скрытый transport protocol. Native skill рекомендует temporary directory только после неудачного чтения, а не repository-local mandatory handoff. `mo-lastmsg` дополнительно связывает методологию с private Claude/Codex JSONL formats до доказательства, что временного файла недостаточно.

Model design смешивает три разных источника истины:

- сохранённые preferences;
- модели, недавно замеченные в histories;
- текущий authoritative catalog доступных моделей.

История sessions не обнаружит новый ещё не использованный release. Условие «тот же vendor + family» не доказывает successor relationship; `gpt-5.5 → gpt-5.6-sol` нельзя выводить только из строкового family matching. Upgrade suggestions должны поступать из authoritative route-specific catalogs и conservative explicit lineage metadata; иначе их лучше не показывать.

Purpose contract чрезмерен. Обязательный docstring/JSDoc для каждого private, nested, dunder и test symbol создаст cargo-cult prose, против которого направлен GRACE. В тексте также есть внутреннее противоречие: общий контракт включает tests, а TypeScript thresholds позже исключают `tests/**`. `interrogate --fail-under=100` доказывает coverage score, но не semantic purpose каждого overload declaration.

Watchdog с бесконечным shell loop концептуально не является LLM observer: пока loop выполняется, агент не получает новый reasoning turn. Если ветвление и notification делает shell, это уже маленький runtime. Skill должен делать один конечный native wait, анализировать событие и завершать/повторять turn через проверенный native goal/loop mechanism; иначе watchdog следует defer.

Наконец, spec одновременно объявляется read-only после reuse и удаляется executor в candidate. Удаление является изменением. Retirement spec нужно вынести из executor contract либо явно определить как единственное допустимое исключение и объяснить, кто подтверждает сохранение durable knowledge.

## Strengths & Benefits — Yellow Hat

У Proposal 1 сильнее архитектурная чистота:

- действительно три самостоятельных backend-specific orchestrator entry points;
- нет обязательного repository-local operational state;
- candidate описан как смысловой contract, а не JSON artifact;
- capability uncertainty названа явно;
- automatic recovery, receipts, digests и adapters удаляются без маскировки потерянных гарантий.

Proposal 2 существенно сильнее как исследовательский материал:

- хорошо раскрыты backend-specific ловушки получения полного результата;
- правильно отделены Codex goal, weaker fallback и follow-up turns после первого candidate;
- подробно проработаны QC profiles, E2E taxonomy, distribution и migration;
- dispute resolution и durable rationale сформулированы практично;
- объяснена причина отказа от общего executable adapter;
- хорошо показана цена старого tooling в LOC и конкретные замены готовыми инструментами.

Оба предложения правильно сохраняют ключевой смысл исходной задачи: сильный executor без methodology skill, обязательный reuse research, независимые reviews, conditional E2E, PATH-based provider launch, ручной restart и отказ от транзакционного workflow engine.

## Alternatives & Creative Ideas — Green Hat

Лучший итог — взять Proposal 1 как архитектурный каркас и перенести в него проверенные технические детали Proposal 2 после исправления команд и границ.

Предпочтительная структура:

- `mo-orchestrate` — полноценный Herdr orchestrator;
- `mo-orchestrate-omnigent` — полноценный Omnigent orchestrator;
- `mo-orchestrate-paseo` — полноценный Paseo orchestrator;
- небольшой shared textual reference с lifecycle invariants;
- отсутствие общего runtime router и обязательных mechanics skills.

Полный reviewer output:

1. backend-native API/export;
2. обязательный тест transcript длиннее известных API limits;
3. Herdr — повторное чтение и затем файл в `mktemp -d` вне repository;
4. transcript parser — только после зафиксированных failures, как backend-specific optional helper.

Model layer стоит разделить:

- маленький preferences store;
- native route-specific model listing;
- recent-history hints как необязательная информация;
- upgrade suggestion только при authoritative successor evidence;
- отсутствие общего catalog parser до подтверждения стабильных SDK/API.

Для candidate baseline достаточно явно переданного SHA. Optional namespaced ref можно добавить позднее, например после доказанного recovery failure; он должен иметь owner, cleanup rule и защиту от нескольких параллельных features.

Purpose coverage следует определить по semantic risk: modules, exported/public APIs, architectural boundaries, non-obvious private logic и overloads с самостоятельным контрактом. Trivial helpers и тестовые fixtures не должны получать бессмысленные docstrings только ради 100%.

## Completeness & Process — Blue Hat

Ни одно предложение пока нельзя принять как implementation-ready master-spec.

Proposal 1 ближе к требуемой архитектуре, но должен дополнить обязательные аудиты, transfer map и проверяемые backend procedures.

Proposal 2 богаче и полезен как источник research notes, однако нуждается в архитектурном сокращении и исправлении нескольких нормативных ошибок до реализации:

- заменить generic entry/router тремя orchestrator skills;
- исправить Herdr commands и environment precondition;
- убрать SQLite и private JSONL formats из обязательных contracts;
- устранить `refs/mo/candidate` либо сделать его optional и namespaced;
- доказать pagination/full-output semantics;
- устранить конфликт read-only spec с deletion;
- ослабить purpose coverage до risk-proportional policy;
- заменить бесконечный watchdog loop на конечный event-driven turn;
- удалить магические thresholds вроде «три failures», «пятый backend», `≤500 LOC` и line-count-based reviewer fan-out. Они могут быть heuristics, но не архитектурными законами.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-1",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "Предложение имеет правильный skills-first каркас, наиболее чисто выполняет требование трёх самостоятельных backend-specific orchestrator flows и пропорционально ослабляет старые гарантии. Однако оно ещё не implementation-ready: отсутствуют полный state audit, карта переноса execute-feature, сравнение с вариантом без собственного orchestrator skill, жёсткие review independence rules и проверенная гарантия полного output. Также требуется исправить упаковку helper и безопасный Herdr fallback.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "required audits",
          "description": "Нет полного поэлементного state/settings audit и карты переноса требований текущего execute-feature.",
          "required_change": "Для каждого вида state и каждого outcome requirement указать исходную проблему, актуальность, источник восстановления, потерю при удалении и новое место enforcement."
        },
        {
          "id": "",
          "severity": "major",
          "area": "orchestrator necessity",
          "description": "Не выполнено обязательное сравнение backend-specific orchestrator skill с вариантом native backend skill плюс task/spec и project instructions.",
          "required_change": "Показать самостоятельную ценность каждого orchestrator skill и удалить из него простой пересказ native CLI."
        },
        {
          "id": "",
          "severity": "major",
          "area": "review independence",
          "description": "Два reviewer определены, но cross-vendor independence и запрет self-review не закреплены как invariant.",
          "required_change": "Задать минимум одного reviewer другого vendor и запретить автору или executor заменять независимый verdict."
        },
        {
          "id": "",
          "severity": "major",
          "area": "complete output",
          "description": "Наличие export/history не доказывает полный turn при pagination или API limits; Herdr file fallback не имеет безопасного transport contract.",
          "required_change": "Добавить long-transcript acceptance probes, pagination rules и временный файл вне repository с явной проверкой полноты."
        },
        {
          "id": "",
          "severity": "major",
          "area": "distribution",
          "description": "Private helper вне owning skill может не попасть при выборочной установке одного skill.",
          "required_change": "Поместить helper внутрь каталога устанавливаемого skill либо оформить самостоятельный явно устанавливаемый package."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "reuse research",
          "description": "Фраза separate CLI/session context допускает обычную дополнительную session вместо отдельного CLI instance.",
          "required_change": "Закрепить отдельный process/CLI instance и отдельный context как обязательный pre-execution шаг."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "watchdog",
          "description": "Не описано, как observer получает следующий reasoning turn после native wait.",
          "required_change": "Определить конечный event-driven turn либо честно defer watchdog."
        }
      ],
      "assumptions": [
        "Усечённая при передаче часть Proposal 1 не отменяет видимые contracts и не содержит отсутствующих обязательных аудитов.",
        "Backend exports считаются неполными, пока не проверены transcript, превышающий documented/default page limit, и pagination."
      ],
      "round": 3,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
