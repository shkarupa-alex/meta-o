# Поправка: модели для тестирования skills

Статус: implementation-ready solo amendment.

Эта поправка нормативно дополняет [программу обнуления backlog](../2026-08-31-backlog-zero/2026-09-02-backlog-zero-council-brainstorm.md) и её четыре спеки. Она не меняет состав council judges задним числом и не заменяет критический Qwen/OpenCode profile из Spec 3.

## Требование

Если acceptance, eval или E2E конкретного skill действительно требует запуска внешнего model actor, используются следующие user-approved testing profiles:

| Route | Testing profile | Effort | Когда применять |
| --- | --- | --- | --- |
| Claude | `sonnet5` | `low` | только для применимого сценария, которому необходим Claude actor |
| Codex | `gpt-5.6-terra` | `low` | только для применимого сценария, которому необходим Codex actor |
| OpenCode | `deepseek 4 flash` | configured low-cost profile | только для применимого OpenCode comparator/actor scenario |

Имена `sonnet5` и `deepseek 4 flash` выражают выбранные пользователем profiles. Исполнитель хранит их реальные provider/model ids в существующей user-approved model configuration и при запуске записывает effective identity; skill не угадывает и не hardcode'ит неподтверждённый backend id.

## Семантика применимости

- Детерминированный fixture/test всегда предпочтительнее model run, если он доказывает тот же контракт.
- Модель не запускается только ради полноты матрицы: нужен named scenario и объяснение, какое поведение без неё не проверить.
- Если сценарию нужен Claude или Codex, нельзя молча заменить указанный testing profile более дорогим либо более высоким effort.
- Если нужный profile не настроен, readiness сообщает точную недостающую route/model/effort configuration. Автоматический fallback и изменение конфигурации без разрешения запрещены.
- Необходимый, но не запущенный model scenario получает `blocked` или `not_run` с причиной и не считается `PASS`. Неприменимый scenario получает rule-based `not_applicable`.
- Evidence содержит scenario id, candidate SHA, requested и effective route/model/effort, harness version и результат без secrets и полных transcripts.

## Отношение к существующим требованиям

- GPT-5.6 Sol/high и Claude Opus 1M/high остаются только исторически выбранными judges уже завершённого council-run; эта поправка не требует повторного council review.
- Критический orchestration profile по-прежнему выполняется локальным Qwen через OpenCode. `deepseek 4 flash` его не заменяет и используется лишь когда отдельному тесту нужен OpenCode comparator/actor.
- Общий bounded contract сохраняется: по обычным skills выполняются 2–3 representative runs, а не бесконечная калибровка.

## Durable business intent

Первый implementation increment, затрагивающий eval/model policy, обязан добавить в `docs/business.md` компактное требование со следующим смыслом:

> Проверка skills не должна без необходимости расходовать дорогие подписочные модели. Когда model actor действительно нужен, Meta-O использует явно одобренные low-cost testing profiles, подтверждает effective identity и не повышает модель или effort без разрешения пользователя.

Исполнитель назначает свободный `§B-*` identifier по действующим правилам knowledge chain и обновляет связанные architecture/acceptance references в том же commit. Формулировка может быть уточнена без изменения приведённого смысла.

## Acceptance

- Configuration fixtures разрешают Claude `sonnet5/low`, Codex `gpt-5.6-terra/low` и настроенный OpenCode profile для `deepseek 4 flash`.
- Fixture с более дорогой моделью, повышенным effort или неразрешённым fallback завершается fail-closed.
- Fixture `not_applicable` доказывает, что model actor не запускается для полностью детерминированного сценария.
- Live evidence хотя бы одного реально применимого запуска сверяет requested и effective identity; запуск не требуется искусственно, если в программе не осталось такого сценария.
- `docs/business.md` и `docs/acceptance.md` содержат durable intent и его реальное доказательство до закрытия соответствующих program rows.

## Pre-mortem

| Возможный провал | Защита |
| --- | --- |
| Поправку принимают за обязанность запускать все три модели всегда | named applicability rule и допустимый `not_applicable` |
| Alias запускает другой model id | проверка requested/effective identity |
| Cheap profile незаметно заменяется subscription fallback | fail-closed и запрет автоматического fallback |
| DeepSeek вытесняет критический Qwen orchestrator eval | явное разделение orchestrator profile и comparator/actor |
| Решение остаётся только в временной spec | обязательный перенос business intent и acceptance до closure |

## Decision ledger

| Решение | Статус | Причина |
| --- | --- | --- |
| Использовать low-cost profiles только при реальной необходимости model actor | adopted | прямое решение пользователя |
| Claude `sonnet5/low` и Codex `gpt-5.6-terra/low` | adopted | явно заданные testing profiles |
| `deepseek 4 flash` через OpenCode для применимого comparator/actor scenario | adopted | явно заданный OpenCode profile |
| Заменить ими Qwen orchestrator acceptance | rejected | это отдельный критический business capability |
| Автоматически повышать модель/effort при недоступности | rejected | нарушает cost intent и user authority |

Open questions отсутствуют. Реальные backend ids разрешаются существующей model configuration и live effective-identity evidence.
