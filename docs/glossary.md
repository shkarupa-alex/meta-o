# Глоссарий

У каждого устойчивого термина здесь одно значение. Команды backend и acceptance-
сценарии находятся в своих нормативных документах, а не в словаре.

**Backend** — Orca: система, управляющая агентскими сессиями.

**Harness** — Codex, Claude Code или OpenCode: интерактивный coding agent внутри
сессии под управлением backend.

**Companion skill** — upstream-скил, обязательный для интеграции с backend. Он
проверяется отдельно от executable и не взаимозаменяем с ним.

**Orchestrator** — агент, управляющий процессом, сессиями, вопросами, identity
candidate и gates. Он не читает, не оценивает и не редактирует product code.

**Executor** — читающий репозиторий владелец реализации: меняет файлы, коммитит
связные increments и производит candidate SHA.

**Reviewer** — независимый read-only оценщик одного точного candidate SHA.

**E2E actor** — отдельный read-only агент, выполняющий применимые end-to-end
сценарии на одном frozen candidate.

**Candidate** — полный Git object ID, равный чистому `HEAD` task-ветки.

**Settled final response** — завершённый ответ assistant без tool-call chatter.
Это основная единица извлечения.

**Whole-session view** — необязательный диагностический доступ к видимому выводу
сессии. Он не заменяет отсутствующий полный settled response.

**Gate** — QC, review или E2E evidence, привязанный к одному candidate.
Отсутствующее, неполное, unknown, stale или относящееся к другому SHA evidence не
проходит gate.

**Feature backlog** — временный branch-local notebook активной фичи. После
disposition он пуст; долговечная подтверждённая работа живёт в Issues.

**Closure gate** — project-owned `MO-BACKLOG/1` proof committed backlog blob на
G0, GC, G1 и G2. `NOT-EMPTY` и `UNKNOWN` одинаково блокируют boundary.

**Issue disposition** — один из `in_scope`, `unconfirmed`, `project_issue`,
`upstream_issue`, `duplicate`, `needs_attention`, выбранный до repository.

**Review handoff** — атомарная пара полных reviewer payload в private namespace,
которую named consumer полностью читает до acknowledgement и cleanup.

**Run evidence** — понятные человеку факты текущего запуска. Это не persisted
receipt, event log, support certificate, manifest или registry.

**Route** — выбор provider/model/effort. Он не обозначает run evidence.

**`needs_attention`** — настоящая граница пользователя: product meaning,
необратимое действие, credentials, subscription, неразрешимый спор, недоступная
обязательная возможность backend или явный запуск watchdog.

**Спецификация** — временный документ одного изменения: цель, обязательный
результат, архитектурные границы, рассмотренные альтернативы и причина выбора,
критерии приёмки, риски и открытые решения. Памятью проекта она не является и
после реализации удаляется вместе со своим дословным ledger.

**`§B-*`** — устойчивый идентификатор самостоятельного бизнес-тезиса в
`docs/business.md`. Один тезис — один идентификатор; он не меняется и не
переиспользуется.

**`§A-*`** — устойчивый идентификатор архитектурного решения в
`docs/architecture/`. Решение называет тезисы `§B-*`, которым служит, а
назначение модуля называет `§A-*`, а не бизнес-уровень напрямую.
