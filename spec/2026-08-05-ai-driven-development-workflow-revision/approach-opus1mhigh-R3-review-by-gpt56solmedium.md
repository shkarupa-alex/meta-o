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
      "target_id": "proposal-2",
      "approval_score": 4,
      "would_adopt": false,
      "summary": "Предложение содержит сильное исследование backend, goal, QC, E2E и migration, но пока не годится как нормативная спецификация. Оно нарушает требование трёх alternative orchestrator skills, содержит неработающие Herdr-команды, вводит скрытое состояние через refs/mo/candidate, опирается на private SQLite/JSONL formats и задаёт чрезмерный purpose contract. Его стоит использовать как research appendix к более чистой архитектуре Proposal 1.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "backend architecture",
          "description": "Один generic mo-orchestrate маршрутизирует в mo-herdr, mo-omnigent и mo-paseo, хотя задача требует три alternative backend-specific orchestrator skills без generic router.",
          "required_change": "Сделать три самостоятельных entry skills: mo-orchestrate, mo-orchestrate-omnigent и mo-orchestrate-paseo; общим оставить только небольшой textual reference."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "Herdr integration",
          "description": "Нормативные примеры подделывают HERDR_ENV, читают неверный JSON path и вызывают несуществующий herdr attach.",
          "required_change": "Проверять уже установленный HERDR_ENV без spoofing, читать .result.pane.pane_id и использовать herdr agent attach; проверить весь flow на Herdr 0.8.0."
        },
        {
          "id": "",
          "severity": "major",
          "area": "candidate state",
          "description": "refs/mo/candidate является скрытым operational state; один ref конфликтует с параллельными features, устаревает и требует cleanup.",
          "required_change": "Использовать явный SHA как baseline либо сделать ref optional, namespaced и снабдить owner/cleanup semantics после доказанного recovery failure."
        },
        {
          "id": "",
          "severity": "major",
          "area": "goal recovery",
          "description": "Прямой запрос ~/.codex/goals_1.sqlite опирается на private schema и без thread_id может выбрать goal другой session.",
          "required_change": "Использовать документированный TUI/app-server/backend interface и явное сопоставление session с thread; SQLite оставить только диагностическим version-specific fallback."
        },
        {
          "id": "",
          "severity": "major",
          "area": "complete output",
          "description": "Omnigent export описан как полный при underlying limit=500 без доказанной pagination; Herdr .mo/out загрязняет repository, а mo-lastmsg зависит от private transcript formats.",
          "required_change": "Проверить pagination на длинных sessions, использовать mktemp вне repository и отложить transcript parser до измеренных failures."
        },
        {
          "id": "",
          "severity": "major",
          "area": "spec lifecycle",
          "description": "Spec объявлена read-only после reuse, но executor обязан удалить её в candidate.",
          "required_change": "Не поручать executor удаление read-only spec либо определить отдельный retirement step после успешных gates."
        },
        {
          "id": "",
          "severity": "major",
          "area": "purpose policy",
          "description": "100% docstrings для private, nested, dunder и test symbols создают cargo-cult text и противоречат risk-proportional GRACE; TS exclusions также противоречат общему contract.",
          "required_change": "Определить единый risk-proportional coverage policy с механической проверкой значимых symbols и semantic review глубины."
        },
        {
          "id": "",
          "severity": "major",
          "area": "watchdog",
          "description": "Бесконечный shell loop не даёт LLM observer нового reasoning turn; фактически это недоопределённый runtime.",
          "required_change": "Использовать конечный native wait на один event с проверенным механизмом следующего turn либо defer watchdog."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model discovery",
          "description": "Session history не является authoritative model catalog, а vendor+family matching не доказывает successor release.",
          "required_change": "Разделить preferences, recent history и authoritative route-specific catalogs; предлагать upgrade только при доказанной lineage."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "status semantics",
          "description": "Herdr done автоматически отображается как needs_attention, хотя orchestrator может самостоятельно прочитать результат.",
          "required_change": "Классифицировать needs_attention по требуемому действию, а не только native lifecycle label."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "anti-bloat policy",
          "description": "Пороги три failures, пятый backend, 200 строк skill и 500 строк кода являются произвольными и легко превращаются в новые compliance metrics.",
          "required_change": "Оставить их необязательными heuristics и требовать конкретный failure scenario, consumer и maintenance analysis."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "review subagents",
          "description": "Fan-out только по числу строк diff не учитывает semantic risk.",
          "required_change": "Выбирать subagents по независимым risk lenses, novelty и cross-cutting impact, используя размер diff лишь как один сигнал."
        }
      ],
      "assumptions": [
        "Локальная Codex SQLite schema существует в версии 0.146.0, но не считается стабильным публичным API.",
        "Наличие Claude Code slash-команды goal не считается достаточным доказательством эквивалентности Codex goal без живой проверки transport, resume и termination.",
        "Полный Omnigent export не считается доказанным, пока не подтверждена pagination после 500 items."
      ],
      "round": 3,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 4
would_adopt: false
