# Карта acceptance

Документ связывает каждое требование фичи с доказательством, которое
действительно его подтверждает. Вердикты текущего запуска остаются в финальном
отчёте, а не в этом отслеживаемом файле.

| Требование                                                                 | Детерминированное доказательство                                     | Live-доказательство                                          |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| Собираются и устанавливаются ровно десять именованных скилов.              | Build- и install-тесты перечисляют точные имена и файлы.             | Local install подтверждает discovery.                        |
| Удалённый backend отсутствует, кроме дословной истории и указателя README. | Repository scan исключает защищённую историю и проверяет точный SHA. | Не требуется.                                                |
| Orchestration и review через Herdr работают.                               | Тесты authored/built contracts.                                      | Backend-сценарии B1–B14 на Herdr.                            |
| Orchestration и review через Orca работают.                                | Тесты механики и имени companion.                                    | Backend-сценарии B1–B14 на Orca.                             |
| Orchestration и review через Paseo работают.                               | Тесты механики и имени companion.                                    | Backend-сценарии B1–B14 на Paseo.                            |
| Codex, Claude Code и OpenCode запускаются unsandboxed.                     | Тесты setup/posture helper.                                          | B2–B4 для каждого backend.                                   |
| Полные normal и long settled responses извлекаются.                        | Contract-тесты markers и запрещённых поверхностей.                   | B8–B10 для каждого backend.                                  |
| Reviews параллельны, независимы и vendor-diverse.                          | Тесты review protocol.                                               | B11–B13 на candidate.                                        |
| Executor получает оба review только полной парой.                          | Assertions методологии.                                              | B12 на каждом orchestration backend.                         |
| Reviewers проверяют фичу и backlog.                                        | Assertions общего review protocol.                                   | Оба финальных ответа показывают обе lenses.                  |
| Setup проверяет substance проекта и backend companions.                    | Тесты setup contract.                                                | B14 и posture probes.                                        |
| Pattern watchdog умеет scan по сессиям и безопасный nonblocking nudge.     | Тесты native JSON, stable envelope и cross-invocation deduplication. | W1–W4.                                                       |
| Knowledge split и semantic Markdown labels корректны.                      | Markdown AST и тесты обязательных документов.                        | Не требуется.                                                |
| Backlog разобран полностью.                                                | Тесты semantic fields и отсутствия удалённых progress rows.          | Финальные reviewers проверяют все строки.                    |
| Один финальный SHA проходит QC и применимые E2E.                           | `make mo-qc` на этом SHA.                                            | E2E matrix или одобренный reviewers docs-only carry-forward. |
