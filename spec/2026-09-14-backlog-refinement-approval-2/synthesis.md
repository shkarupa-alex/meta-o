# Синтез: blocking empty-backlog gate перед MR и merge

## Полученные предложения

Оба судьи независимо предложили отделить проверку фактической пустоты backlog от обычного mid-feature `make mo-qc`, привязать результат к exact SHA и повторять проверку перед merge. Оба требуют fail-closed поведения для отсутствующего, нечитаемого или неканонического backlog и рассматривают CI как дополнительный merge barrier, а не как способ предотвратить создание MR.

Opus предложил aggregate `make mo-closure`, трёхзначный verdict и подробный CI locator. Sol предложил более узкий публичный target `make mo-backlog-empty`, две обязательные точки lifecycle и отдельный CI job. Cross-review выявил, что runtime assertion нельзя помещать в `tests/*.test.mjs`, потому что `mo-test` входит в `mo-qc`; GNU Make также не сохраняет различие дочерних exit `1` и `2`. Полный `mo-qc` нельзя безусловно рекомендовать для нового CI job: его prerequisites могут отсутствовать в runner, а backlog gate должен иметь самостоятельный и ясный результат.

## Принятый дизайн

1. Ввести project-owned non-mutating command `make mo-backlog-empty`. Он проверяет существующий backlog contract и единственный новый runtime predicate: открытых feature entries нет. Проверка структуры остаётся в обычном QC; реализация переиспользует один project-owned AST reader, а не создаёт второго владельца schema.
2. `make mo-qc` продолжает разрешать корректный непустой backlog во время активной работы. Tests механизма входят в QC, но assertion над живым backlog — нет.
3. Любой Meta-O-managed MR create, включая Draft, блокируется до успешного `make mo-backlog-empty` на чистом committed `HEAD`. Внешне созданный MR не объявляется недействительным, но merge-side gate остаётся обязательным.
4. Перед agent-managed merge или закрытием feature branch через слияние gate повторяется на текущем source/integration candidate. Новый commit инвалидирует результат. `BLOCKED` и `UNKNOWN` запрещают hosting write и дают actionable diagnostic.
5. Публичный Make target имеет `0` для PASS и nonzero для любого отказа. Typed distinction задаётся первой строкой: `MO-BACKLOG-NOT-EMPTY` или `MO-BACKLOG-UNKNOWN`; caller не различает состояния по коду GNU Make.
6. Узкий checker явно разрешается как project quality command с названными consumers: lifecycle skills, Result/MR workflow и CI. Он не является orchestration/report/Issue helper, не пишет hosting, не создаёт state/receipt и не закрывает entries сам.
7. `mo-setup` проверяет наличие и non-mutating contract команды, отсутствие live-empty assertion в ordinary QC, обе lifecycle boundaries и CI coverage. Непустой backlog mid-feature — informational finding, не setup failure.
8. CI определяется по фактическому проекту. Для GitLab проверяются canonical/custom CI entrypoint и statically resolvable local includes; для GitHub — `.github/workflows/*.yml|yaml` и statically resolvable local reusable workflows. Hosting определяется по repository evidence, не по наличию `gh`/`glab`. При обоих hosting surfaces coverage оценивается раздельно; ambiguity или dynamic/remote includes дают `unknown`, а не ложный `covered`.
9. `mo-setup` предлагает отдельный non-allow-failure MR/PR job, вызывающий `make mo-backlog-empty`. Для GitLab он покрывает MR/merge-train или merged-result candidate; для GitHub — pull-request/merge-queue candidate. Default-branch post-merge job — audit, не pre-merge barrier.
10. Изменение CI — обычный tracked setup repair на отдельной `feature/meta-o-setup` после показа proposed patch. Branch protection/required-pipeline settings остаются отдельной человеческой границей; без read-only доказательства такой настройки job называется advisory.

## Rejected / deferred

- Безусловно включать пустоту backlog в `make mo-qc` — rejected: это блокирует нормальный feature notebook.
- Новый aggregate `make mo-closure` — rejected как лишний второй aggregate gate; lifecycle последовательно требует QC и `mo-backlog-empty`.
- Runtime assertion внутри `tests/*.test.mjs` — rejected: glob `mo-test` затянет его в mid-feature QC.
- Версионированный result schema/receipt — rejected: ни одному consumer он не нужен.
- Автоматическая правка CI или branch-protection settings — rejected: это отдельная tracked/external change boundary.
- Проверка только одного hosting provider — rejected после пользовательского уточнения; применимость определяется фактическими GitHub/GitLab surfaces проекта.

## Уточнения после spec-review R1

- Добавлен G0 gate после intake migration и до substantive feature work.
- Gate печатает before/after HEAD и clean-tree evidence; synthetic merge candidate проверяется только в hosting-provided CI checkout, без checkout/fetch в frozen worktree.
- Реальными consumers назначены methodology/`mo-orchestrate-orca`, setup-managed `AGENTS.md`/`CLAUDE.md` для любого agent-owned MR/merge write и CI; абстрактный встроенный MR workflow Meta-O не предполагается.
- В чужом проекте `mo-setup` согласует project-specific backlog path и closure command в местном task runner; универсальный checker в `skills/` не поставляется.
- CI outcomes закрыты как `covered`, `config_present`, `no_ci_surface`, `unknown`; repository YAML без active/required hosting settings не считается barrier.
- Diagnostic grammar получила stream, escaping, reason enum, SHA/tree fields и `internal_error`; dispositions остаются вне пустого backlog.
- Красный required check у внешне созданного раннего Draft разрешён: он блокирует merge, но не commits/pushes. Agent-owned Draft create по U-19 блокируется локально до PASS.

## Уточнения после второй, финальной итерации spec review

Формального convergence не достигнуто: оба судьи дали 6/10 и `would_adopt=false`. Третья итерация не запускается, поскольку пользователь запросил 1–2 итерации. Все findings, не меняющие frozen product decisions, устранены оркестраторской редакцией:

- checker теперь читает committed blob `HEAD:<backlog-path>`; unrelated dirty files не блокируют proof, а divergence самого backlog path даёт typed `UNKNOWN`;
- добавлен безусловный GC перед объявлением completion/передачей SHA, даже если MR не создаётся; G1/G2 сверяют hosting-side source head, а merge требует race-safe expected-head либо exact required-policy binding;
- определён portable `MO-BACKLOG/1` для всех project-specific реализаций, полная AST-семантика пустоты и раздельные `entries`/`content_nodes`;
- ignore probe использует `git check-ignore -v` и доказывает tracked provenance; private `spec/` отделён от canonical tracked spec/ledger под `docs/`;
- CI discovery получил владельца (`mo-setup`), bounded record `CI-Coverage/1`, finite `js-yaml` subset и три proof layers; неизвестные constructs могут только понизить outcome до `unknown`;
- malformed/invalid-byte fixtures выведены из Markdown lint surface, а implementation slices дополнены Make/lint/purpose и commit-evidence obligations;
- зафиксировано текущее self-hosting ограничение Meta-O без CI и условное live GitLab E2E.
