# Карта acceptance

Документ связывает каждое требование фичи с доказательством, которое
действительно его подтверждает. Требование приходит из спецификации, пока она
жива, и остаётся здесь вместе со своим доказательством после того, как
реализованная спецификация уходит из проекта. Вердикты текущего запуска остаются
в финальном отчёте, а не в этом отслеживаемом файле.

| Требование                                                                               | Детерминированное доказательство                                                  | Live-доказательство                                               |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Собирается и устанавливается точный именованный набор скилов.                            | Build- и install-тесты перечисляют точные имена и файлы.                          | Local install подтверждает discovery.                             |
| Удалённый backend отсутствует, кроме дословной истории и указателя README.               | Repository scan исключает защищённую историю и проверяет точный SHA.              | Не требуется.                                                     |
| Orchestration и review через Orca работают.                                              | Тесты механики и имени companion.                                                 | Backend-сценарии B1–B14 на Orca.                                  |
| Codex, Claude Code и OpenCode запускаются unsandboxed.                                   | Тесты setup/posture helper.                                                       | B2–B4 для каждого backend.                                        |
| Полные normal и long settled responses извлекаются.                                      | Contract-тесты markers и запрещённых поверхностей.                                | B8–B10 для Orca.                                                  |
| Reviews параллельны, независимы и vendor-diverse.                                        | Тесты review protocol.                                                            | B11–B13 на candidate.                                             |
| Executor получает оба review только полной парой.                                        | Assertions методологии.                                                           | B12 на каждом orchestration backend.                              |
| Reviewers применяют Deferral lens к diff и поведению фичи.                               | Protocol проверяет обязательную Deferral lens и валидность пустого backlog.       | Оба финальных ответа называют новые deferrals либо их отсутствие. |
| Setup проверяет substance проекта и backend companions.                                  | Тесты setup contract.                                                             | B14 и posture probes.                                             |
| Pattern watchdog умеет scan по сессиям и безопасный nonblocking nudge.                   | Тесты native JSON, stable envelope и cross-invocation deduplication.              | W1–W4.                                                            |
| Knowledge split и semantic Markdown labels корректны.                                    | Markdown AST и тесты обязательных документов.                                     | Не требуется.                                                     |
| Feature backlog пуст на G0/GC/G1/G2, но ordinary QC принимает valid entries.             | `tests/backlog-empty.test.mjs` и public `make mo-backlog`.                        | B36–B38 на exact local/remote/integration SHA.                    |
| Подтверждённая внешняя работа уходит в правильный project/upstream Issue.                | Executable ISS-01…ISS-15 routing/redaction и recorded `gh`/`glab` fixtures.       | B33 read-only discovery; real write только для реального defect.  |
| Review response структурно полон, а человеку показывается только authored census.        | Grammar/count/end-marker/self-correction fixtures.                                | B34 и pair projection на точном SHA.                              |
| Pair handoff атомарен и cleanup ждёт acknowledgement named consumer.                     | Private namespace, retry и human-ownership fixtures.                              | B28/B31.                                                          |
| Orca actors не создают побочные project registrations.                                   | Recording stub сравнивает registration/resource projections.                      | B41/B42.                                                          |
| Trust UI/shell не получают task bytes; оба bundled guide прочитаны из одного Orca.       | Executable readiness decision и recorded locator fixtures.                        | B24/B26.                                                          |
| Один run-wide waiter различает event, quiet timeout и transport failure.                 | Executable event/timeout/retry/foreign-handle outcomes.                           | B25.                                                              |
| `mo-*` запускаются только явно по literal call graph.                                    | AST activation lint source/generated tree.                                        | B30 near-miss prompt.                                             |
| Model discovery даёт bounded 31-day history, catalog и evidence-based recommendation.    | Streaming/budget/privacy fixtures.                                                | B27.                                                              |
| Каждый бизнес-тезис несёт уникальный id, и цепочка знаний не разорвана.                  | Тест цепочки знаний в `make mo-qc`.                                               | Не требуется.                                                     |
| Один финальный SHA проходит QC и применимые E2E.                                         | `make mo-qc` на этом SHA.                                                         | E2E matrix или одобренный reviewers docs-only carry-forward.      |
| Host-sensitive full gate сериализован, foreground и без orphan-процессов.                | Obligations O-RR-046, O-RR-048 и O-RR-052 в `tests/closure-obligations.test.mjs`. | B11–B13 с двумя одновременными reviewers.                         |
| `find-reuse` переносим и fail-closed при неполном поиске.                                | Build portability и contract fixtures.                                            | Named adapter evidence через `make mo-live-adapters`.             |
| Review protocol задаёт порядок стадий; actor различает modes/P0–P3.                      | `tests/orchestration-contract.test.mjs` проверяет структуру protocol.             | Mode/severity eval cases и два полных `worker_done`.              |
| Remediation использует hot roles, final proof — fresh pair.                              | Lifecycle contract assertions.                                                    | Orca review-loop scenario на exact SHA.                           |
| Каждый applicable eval case проходит required Codex и Claude profiles.                   | V2 corpus contracts и V3 matrix validator fixtures.                               | Полный required product и desired availability rows exact SHA.    |
| Локальная orchestration §B-PORTABILITY-08 управляет lifecycle, но не пишет product code. | Ownership, projection и critical-corpus fixtures.                                 | Critical Qwen profile suite на exact SHA.                         |

## Harvest исходного intake BKL-00…BKL-18

Это часть существующей карты acceptance, а не второй registry/receipt. Она
сохраняет только durable disposition и доказательство после удаления живой
spec; исходные bytes остаются в frozen Git blob, указанном ниже.

| Source | Outcome     | Durable evidence                                                                                                  |
| ------ | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| BKL-00 | implemented | `make mo-qc`, exact-SHA reviews и eval matrix                                                                     |
| BKL-01 | refuted     | `shared/references/review-protocol.md`: delegation не является обязательной                                       |
| BKL-02 | implemented | `tests/review-handoff.test.mjs`: private unique namespace и collision-safe publication                            |
| BKL-03 | implemented | `docs/architecture/orca-session-ownership.md`: stable visible role titles                                         |
| BKL-04 | implemented | exact-handle fallback проверен тестом; upstream write пока `unsupported`, см. `docs/papercut.md`                  |
| BKL-05 | implemented | `shared/references/issue-routing.md` и `tests/backlog-empty.test.mjs`                                             |
| BKL-06 | implemented | trust-safe readiness реализована; upstream write пока `unsupported`, см. `docs/papercut.md`                       |
| BKL-07 | implemented | actionable finding contract в `shared/references/review-protocol.md`                                              |
| BKL-08 | implemented | explicit activation в `src/skills/mo-review-orca/SKILL.md`                                                        |
| BKL-09 | implemented | delivery/posture guards реализованы; incidents ведёт [Orca #16527](https://github.com/stablyai/orca/issues/16527) |
| BKL-10 | implemented | hot remediation и fresh final pair в `src/skills/mo-review-orca/SKILL.md`                                         |
| BKL-11 | duplicate   | BKL-03; color остаётся best effort                                                                                |
| BKL-12 | duplicate   | BKL-09; posture flags имеют одного owner                                                                          |
| BKL-13 | implemented | authored census и lossless handoff в `tests/lifecycle-contracts.test.mjs`                                         |
| BKL-14 | implemented | standalone review создаёт только reviewer pair                                                                    |
| BKL-15 | implemented | canonical worker response реализован; upstream write пока `unsupported`, см. `docs/papercut.md`                   |
| BKL-16 | implemented | version-matched `orchestration` и `orca-cli` fixtures                                                             |
| BKL-17 | duplicate   | BKL-10; reviewer сохраняется hot до follow-up                                                                     |
| BKL-18 | implemented | regression tests и durable architecture ids                                                                       |

## Провенанс закрытия backlog

| Источник         | Frozen blob                                |
| ---------------- | ------------------------------------------ |
| Backlog ledger   | `8d11d1107eb5875235c2830e6503f7e1265317d7` |
| Real-runs ledger | `c75859372fa7d794269cc6dcc8834c069ddd8096` |

Итоговый lossless AST closure зафиксирован коммитом
`2608df64ca6a54ece2abf6b858c49567bca19c1f`; blob полной карты —
`2698b1898c8cb00ab9a736cff339b8820287bab6`. Карта даёт каждому obligation
собственную executable proof command вида
`node --test --test-name-pattern "^<id> " tests/closure-obligations.test.mjs`.
Те же координаты доступны гейту без разбора prose или Markdown-таблиц:

```yaml
backlog_closure:
  backlog_blob: 8d11d1107eb5875235c2830e6503f7e1265317d7
  real_runs_blob: c75859372fa7d794269cc6dcc8834c069ddd8096
  closure_sha: 2608df64ca6a54ece2abf6b858c49567bca19c1f
  deletion_sha: 80e7e1e9e43f1a071abce7801829080e7d290195
  map_blob: 2698b1898c8cb00ab9a736cff339b8820287bab6
```

Постоянное доказательство: `node --test tests/backlog-provenance.test.mjs`. Оно
проверяет фиксированную deletion delta `closure_sha..deletion_sha`, а не всё
после закрытия, и не сравнивает число узлов с записанной здесь константой.
