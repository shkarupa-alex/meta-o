## Facts & Constraints

Proposal 1 правильно выбирает целевое направление, но пока смешивает specification decisions с неподтверждёнными capability claims.

Самая опасная область — `/goal`. Официальная документация действительно описывает durable goal, команды pause/resume/clear и многочасовую автономную работу, но одновременно говорит, что при отсутствии команды нужно включить `features.goals`. Следовательно, availability и activation нельзя считать доказанными для любой Codex surface. Документ также не подтверждает предложенный transport через каждый backend. [OpenAI: Follow a goal](https://developers.openai.com/codex/use-cases/follow-goals)

Для установленного Herdr 0.8 подтверждены `agent prompt`, `agent send-keys`, `pane send-text` и terminal reads, но не доказано, что конкретная последовательность вводит `/goal` как slash command и позволяет машинно подтвердить active goal. Proposal честно планирует spike, однако до него не должна утверждать implementation-ready Herdr flow.

Paseo действительно предоставляет `run`, `ls`, `logs`, `wait`, `send`, workspaces и полный timeline. Поддержка Codex `/goal` появилась в релизе 0.1.70, но proposal не задаёт точный minimum version и не доказывает, что CLI `send` сохраняет slash-command semantics или возвращает устойчивую boundary последнего assistant message. [Paseo CLI](https://paseo.sh/docs/cli), [Paseo changelog](https://github.com/getpaseo/paseo/blob/main/CHANGELOG.md)

Omnigent поддерживает native TUI harnesses, persistent conversations и binary overrides. По умолчанию vendor CLI берётся из `PATH`, но environment/config override имеет приоритет. Proposal упоминает это лишь частично и не задаёт исчерпывающий preflight для project-level override. [Omnigent harnesses](https://omnigent.ai/docs/build/harnesses)

Model helper — единственный сохраняемый custom runtime, но именно он обоснован слабее всего. Не показано, какие Claude/Codex/OpenCode SDK или CLI реально предоставляют:

- модельный каталог;
- последние десять sessions;
- effective model и route;
- usage за месяц;
- устойчивую model lineage.

Интерфейс `discoverModels()` сформулирован раньше проверки доступных data sources. Детерминированность deduplication не доказывает необходимость helper: сначала нужен source-by-source capability audit и fixture samples.

Distribution layout в целом реалистичен: современные APM и `npx skills` действительно обнаруживают bare `skills/<name>/SKILL.md`. [Microsoft APM](https://github.com/microsoft/apm), [Vercel skills](https://github.com/vercel-labs/skills)

## Risks & Failure Modes

Главный recovery-дефект Proposal 1: после смерти orchestrator нет устойчивого способа сопоставить feature, backend sessions, роли и candidate. Инструкция «найти native sessions» недостаточна, если одновременно существуют несколько executor/reviewer sessions. Не нужен `state.json`, но нужен хотя бы обязательный naming/locator contract, например feature slug + role, и правило включать candidate SHA в reviewer/tester prompt и final response.

Также не сохраняется доказательство того, какие gates уже прошли. Если backend history недоступна после reboot, Git показывает candidate, но не два PASS и E2E. Допустимо повторить gates или спросить пользователя, однако это должно быть явной recovery policy, а не иллюзией восстановления статуса.

Требование cross-vendor review потеряно. Имена `reviewerPrimary` и `reviewerCrossVendor` есть только в model settings, но `mo-review` требует просто двух reviewers. Это допускает два review той же моделью или тем же vendor, хотя исходное требование прямо требует хотя бы одного reviewer другого vendor и исключения self-review исполнителем.

Фраза «повторяются проверки, которые могли быть затронуты» слишком субъективна. Для code change минимально безопасное правило проще: новый candidate обязан заново пройти aggregate QC и оба review; применимый E2E также повторяется, кроме документированного случая, когда изменение доказуемо не может влиять на выбранный E2E contract.

Reuse stage недостаточно точно соответствует hard constraint:

- «отдельная CLI/session context» допускает обычного subagent вместо отдельного CLI instance;
- не определено, кто создаёт tracked spec из текстовой задачи до researcher;
- нет безопасного поведения при уже грязном worktree;
- нет правила коммитить только spec-файл и не захватывать пользовательские изменения;
- нет определения «первый commit» относительно feature branch.

Watchdog в текущем виде может оказаться дорогой иллюзией. Skill не объясняет, что удерживает LLM session в цикле наблюдения, как она просыпается, какой polling interval допустим и какие native notifications/schedules доступны каждому backend. Признание, что watchdog может уснуть, честное, но его baseline usefulness пока не доказана.

PATH preflight чрезмерно бинарный: «не продолжает, если backend намеренно обходит expected PATH» требует знать expected path. Более точный контракт — показать effective executable и источник resolution; блокировать только подтверждённый override, обходящий пользовательский wrapper, либо явное несовпадение с настроенной политикой.

## Strengths & Benefits

Proposal 1 хорошо восстанавливает основную архитектурную интуицию задачи:

- удаляет публичный workflow CLI, FSM, receipts, adapters и registries;
- не заменяет `execute-feature` другим обязательным executor skill;
- использует Git commit как понятную identity результата;
- оставляет Markdown transport для review;
- выделяет standalone `mo-review`;
- различает console smoke, browser E2E и benchmark;
- не превращает watchdog в service;
- сохраняет model preferences отдельно от runtime state;
- предлагает три прямых backend-specific skill;
- удаляет installer/update scripts;
- возвращает purpose, architecture и durable knowledge в обычные project artifacts.

Особенно удачно выбрана goal granularity: native goal до первого candidate, затем follow-up turns для review/E2E fixes. Это избегает и преждевременного one-shot completion, и бессмысленной automatic continuation во время независимых gates.

Сильны также отказ от snapshot digest в пользу commit SHA и pre-mortem gate для любого нового helper. Это непосредственно атакует причину прежнего tooling bloat.

Proposal 2 не является предложением. Полезен только предварительный inventory масштаба текущей системы и перечень направлений исследования. Архитектуры, trade-offs, lifecycle, audit, migration plan и проверяемых выводов в нём нет.

## Alternatives & Creative Ideas

Вместо немедленного model-discovery helper разумнее принять staged design:

1. vNext baseline сохраняет вручную выбранный model set.
2. Backend skills читают native model lists/recent history там, где это реально доступно.
3. Собираются anonymized fixtures реальных outputs.
4. Helper появляется только для подтверждённого пересечения хотя бы двух источников и имеет отдельные adapters исключительно для discovery, не orchestration.

Для recovery достаточно не state machine, а небольшой textual convention:

```text
session name: <feature-slug>-<role>
every gate prompt: candidate <full-sha>
every gate final message: candidate <full-sha> + PASS/CHANGES REQUESTED
```

Если authoritative result не найден, gate считается неизвестным и повторяется. Это дешевле run state и даёт однозначное поведение.

Для backend packaging можно вынести короткий `workflow-reference.md`, но release-time копирование трёх экземпляров создаёт drift. Лучше генерировать копии только при сборке `dist` из одного source reference либо принимать небольшое явное дублирование и тестировать semantic checklist. Генератор distribution artifact не является runtime adapter.

`mo-watchdog` стоит сначала реализовать backend-by-backend:

- Herdr: agent session с ограниченным polling loop;
- Paseo: проверить native schedule/loop/notification;
- Omnigent: проверить notifications и persisted conversation behavior.

Если backend уже умеет heartbeat/schedule, отдельный LLM watchdog может быть хуже native primitive.

## Completeness & Process

Proposal 1 ещё не выполняет несколько обязательных deliverables исходного задания:

- Нет полного state audit: для каждого вида текущего state не разобраны исходная проблема, восстановимость, точная потеря и остаточная ценность.
- Tooling audit группирует команды слишком крупно и не классифицирует все major command families публичного CLI.
- Нет требуемой карты переноса каждого полезного требования `execute-feature` в spec, project instructions, QC или review.
- Не сравнён вариант «native backend skill + task/spec + project instructions вообще без собственного orchestrator skill».
- Capability table не разбита по backend × Claude/Codex/OpenCode route и не использует строго `available | inferred | unavailable`.
- Omnigent export JSONL и last-message extraction заявлены без подтверждённого schema/command.
- Не определено, как удостоверить full reviewer output, если file-export fallback сам возвращает только truncated path response или пишет файл вне общего filesystem.
- Purpose contract не превращён в проверяемую Python/TypeScript policy: особенно не доказана mechanical coverage overload declarations.
- Python QC profile не содержит implementation-ready native configs, версий и исключений.
- Не описаны atomic writes, concurrent updates и migration/corruption semantics model settings.
- Не определена identity изменяемого non-code artifact вне Git.
- Не указан minimum supported Paseo version для `/goal`.
- Не проверены native Claude Code/OpenCode continuation и compaction capabilities.
- Не разобрана лицензия AGPL-3.0 Paseo как selection/integration constraint.
- Не определено, как feature-spec retirement сохраняет auditability и ссылки из commits/docs.

Итог: Proposal 1 — сильный architectural direction, но пока не implementation-ready master-spec. Его стоит переработать, сохранив выбранную архитектуру и заменив неподтверждённые capability assertions явными versioned contracts и fallback rules.

Proposal 2 нельзя принимать ни как альтернативу, ни как reviewable approach: это промежуточный status message, причём его доказательства ещё не получены.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 1,
      "would_adopt": false,
      "summary": "Это не архитектурное предложение, а промежуточный status update. В нём нет выбранного уровня, lifecycle, skills contract, backend analysis, recovery, QC, tooling audit, migration plan, decision ledger или pre-mortem; четыре ключевых исследования прямо объявлены незавершёнными. Числа LOC могут быть полезны для контекста, но не позволяют оценить или принять подход.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "Completeness",
          "description": "Proposal 2 не содержит proposal и не отвечает ни на один обязательный архитектурный deliverable.",
          "required_change": "Дождаться результатов исследований и представить самостоятельный полный approach с decisions, evidence, trade-offs, lifecycle, tooling audit и migration plan."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Evidence",
          "description": "Ключевые backend, reference, QC и packaging выводы отсутствуют, поскольку исследовательские агенты ещё работают.",
          "required_change": "Включить проверенные результаты с primary-source attribution и явно отделить verified, inferred и unavailable capabilities."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Inventory",
          "description": "LOC и количество artifacts полезны как сигнал масштаба прежней системы, но не объясняют, какие функции следует сохранить.",
          "required_change": "Связать inventory с user goals, failure modes и keep/replace/delete decisions."
        }
      ],
      "assumptions": [
        "Текст Proposal 2 приведён полностью и не является случайно обрезанным отображением готового документа.",
        "Результаты упомянутых четырёх research agents не входят в доступный proposal."
      ],
      "round": 1,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 1
would_adopt: false
