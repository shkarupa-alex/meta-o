# 50 — Optional multi-project watchdog

## Purpose

Этот документ задаёт опциональный watchdog для unattended recovery нескольких
projects. Нормативный источник:
[master-spec §15](./2026-07-24-ai-driven-development-workflow-council-brainstorm.md#15-watchdog).

Watchdog не нужен для correctness основного workflow: FSM имеет собственные
stall deadlines и pause states.

## User opt-in and config

Watchdog включается только пользователем. Один process может наблюдать несколько
project keys.

```json
{
  "schema_version": 1,
  "enabled": true,
  "project_keys": ["…"],
  "poll_interval_seconds": 30,
  "max_backoff_seconds": 300,
  "classifier_mode": "deterministic"
}
```

Config хранится в `~/.meta-o/watchdog.json`, не в проектах. Запуск —
launchd/systemd user service. Single-instance lock защищает только сам watchdog,
не projects/runs.

## Strategy

| Вариант | Плюсы | Риски | Решение |
|---|---|---|---|
| Deterministic `.mjs` | Предсказуем, fake-clock tests | Хуже понимает provider text | Default и authority |
| Local model | Гибко классифицирует tail | Вероятностные опасные actions | Не authority |
| Hybrid | FSM + bounded classifier | Нужны sanitization/fallback | Optional |

Default implementation — dependency-free `watchdog.mjs`, скомпилированный из
TypeScript. Local classifier при hybrid получает ≤8 KiB sanitized tail и
возвращает только:

```text
transient | quota | external | unknown
```

Он не генерирует команды, prompts workers или state transitions.

## Observation loop

Для каждого configured active run watchdog:

1. атомарно читает `state.json`;
2. проверяет phase, `updatedAt`, expected deadline и current orchestrator
   session;
3. вызывает adapter `status/read`;
4. при pending operation вызывает `reconcile`;
5. вычисляет только одно из действий:
   `noop|wake_orchestrator|spawn_orchestrator|backoff|surface_uncertainty`;
6. повторно сверяет `stateVersion` перед действием.

Productive review/E2E loop, даже очень длинный, не является stall только из-за
числа iterations.

## Recovery actions

- Если orchestrator жива, использовать backend-native wake/event delivery.
- Если она доказанно terminal/failed, создать fresh orchestrator generation с
  prompt: «прочитай orchestration skill, state и backend status; продолжи».
- После quota reset сначала `status/read/reconcile`, затем wake.
- При `unknown` side effect перевести через orchestrator в
  `PAUSED_BACKEND_UNCERTAIN`; blind resend запрещён.
- Worker sessions watchdog напрямую не инструктирует и не останавливает.
- FSM watchdog самостоятельно не меняет.

Fresh orchestrator использует уже подтверждённый immutable ModelSet run.
Повторный вопрос «эти?» нужен только при ручном start/resume, не auto-recovery.

## Deadlines and backoff

Deadline определяется ожидаемой backend operation, а не единым wall-clock
лимитом feature. Backoff экспоненциальный до configured maximum и сбрасывается
после наблюдаемого progress (`stateVersion`, cursor или terminal result).

Quota pause использует provider reset time, если он доказуемо получен. Parser
не распознал текст — `unknown`, а не guessed retry.

## Security and logging

- State paths проходят те же owner/mode/symlink checks, что orchestrator.
- Tail санитизируется от secrets, credentials и user data сверх необходимого.
- Durable log содержит timestamp, project/run IDs, observed status, chosen
  closed action и outcome; model text и worker transcripts не сохраняются.
- Rotation ограничивает размер; logs не попадают в repositories.

## Failure behavior

| Failure | Behavior |
|---|---|
| Backend недоступен | Backoff, не менять FSM |
| State corrupt | Не действовать, сообщить пользователю |
| Adapter capability regression | Surface `FAILED_BACKEND` через orchestrator |
| Reconcile unknown | Pause uncertainty, не resend |
| Old orchestrator status unknown | Не spawn replacement |
| Config disabled/project removed | Перестать наблюдать без изменения run |

## Acceptance tests

- Fake clock доказывает poll/backoff/reset.
- Один completion event будит orchestrator не более одного раза.
- Crash watchdog между observe/action не создаёт duplicate worker action.
- Live orchestrator никогда не заменяется.
- Terminal orchestrator получает ровно одну новую generation.
- Unknown operation не resends.
- Productive unlimited review loop не считается stall.
- Два project keys обслуживаются независимо.
- Disabled watchdog никак не влияет на correctness основного workflow.

