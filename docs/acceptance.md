# Карта acceptance

Документ связывает каждое требование фичи с доказательством, которое
действительно его подтверждает. Требование приходит из спецификации, пока она
жива, и остаётся здесь вместе со своим доказательством после того, как
реализованная спецификация уходит из проекта. Вердикты текущего запуска остаются
в финальном отчёте, а не в этом отслеживаемом файле.

| Требование                                                                 | Детерминированное доказательство                                     | Live-доказательство                                          |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| Собирается и устанавливается точный именованный набор скилов.              | Build- и install-тесты перечисляют точные имена и файлы.             | Local install подтверждает discovery.                        |
| Удалённый backend отсутствует, кроме дословной истории и указателя README. | Repository scan исключает защищённую историю и проверяет точный SHA. | Не требуется.                                                |
| Orchestration и review через Orca работают.                                | Тесты механики и имени companion.                                    | Backend-сценарии B1–B14 на Orca.                             |
| Codex, Claude Code и OpenCode запускаются unsandboxed.                     | Тесты setup/posture helper.                                          | B2–B4 для каждого backend.                                   |
| Полные normal и long settled responses извлекаются.                        | Contract-тесты markers и запрещённых поверхностей.                   | B8–B10 для Orca.                                             |
| Reviews параллельны, независимы и vendor-diverse.                          | Тесты review protocol.                                               | B11–B13 на candidate.                                        |
| Executor получает оба review только полной парой.                          | Assertions методологии.                                              | B12 на каждом orchestration backend.                         |
| Reviewers проверяют фичу и backlog.                                        | Assertions общего review protocol.                                   | Оба финальных ответа показывают обе lenses.                  |
| Setup проверяет substance проекта и backend companions.                    | Тесты setup contract.                                                | B14 и posture probes.                                        |
| Pattern watchdog умеет scan по сессиям и безопасный nonblocking nudge.     | Тесты native JSON, stable envelope и cross-invocation deduplication. | W1–W4.                                                       |
| Knowledge split и semantic Markdown labels корректны.                      | Markdown AST и тесты обязательных документов.                        | Не требуется.                                                |
| Backlog разобран полностью.                                                | Тесты semantic fields и отсутствия удалённых progress rows.          | Финальные reviewers проверяют все строки.                    |
| Каждый бизнес-тезис несёт уникальный id, и цепочка знаний не разорвана.    | Тест цепочки знаний в `make mo-qc`.                                  | Не требуется.                                                |
| Один финальный SHA проходит QC и применимые E2E.                           | `make mo-qc` на этом SHA.                                            | E2E matrix или одобренный reviewers docs-only carry-forward. |
| `find-reuse` переносим и fail-closed при неполном поиске.                  | Build portability и contract fixtures.                               | Named adapter evidence через `make mo-live-adapters`.        |
| Review читает diff до risk map и различает modes/P0–P3.                    | `tests/orchestration-contract.test.mjs`.                             | Два полных `worker_done` с requested/effective mode.         |
| Remediation использует hot roles, final proof — fresh pair.                | Lifecycle contract assertions.                                       | Orca review-loop scenario на exact SHA.                      |
| Model actor запускается только по применимости на low-cost profile.        | `tests/model-testing-policy.test.mjs`.                               | Requested/effective identity named applicable scenario.      |
| Qwen/OpenCode управляет lifecycle, но не пишет product code.               | Ownership и projection fixtures.                                     | Critical Qwen profile suite на exact SHA.                    |

## Провенанс закрытия backlog

| Источник         | Frozen blob                                |
| ---------------- | ------------------------------------------ |
| Backlog ledger   | `8d11d1107eb5875235c2830e6503f7e1265317d7` |
| Real-runs ledger | `c75859372fa7d794269cc6dcc8834c069ddd8096` |

Lossless AST closure зафиксирован коммитом
`163692c833369ca0c5941fa29917366ccbbf908f`; blob полной карты —
`40891dc9e6637ac11f95e67da9c5160424076649`. Постоянное доказательство:
`node --test tests/backlog-provenance.test.mjs`.
