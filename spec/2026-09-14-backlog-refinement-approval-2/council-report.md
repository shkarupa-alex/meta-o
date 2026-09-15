# Council Report

- Rounds: 1
- Converged: no

## Summary

| Rank | Slug | Frozen # | Status | Avg score | Would adopt | Locked at round |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | gpt56solmedium | 2 | open | 6.0 | 0/2 | - |
| 2 | opus1mhigh | 1 | open | 4.0 | 0/2 | - |

## Leading proposal (no convergence)

**gpt56solmedium** (proposal-2):

## 1. Краткий подход

Добавить отдельный project-owned non-mutating gate `make mo-backlog-empty`, обязательный непосредственно перед созданием MR и повторно перед его слиянием. Не включать проверку фактической пустоты backlog в обычный `make mo-qc`: mid-feature QC продолжает принимать корректно оформленные временные записи, а `mo-setup` проверяет наличие gate, его контракт и предлагает defense-in-depth интеграцию в GitLab CI без изменения CI или project settings.

Поправка расширяет, но не отменяет решения исходной спецификации: `docs/backlog.md` остаётся branch-local notebook, Issues — долговечным sink, новый workflow engine/registry/receipt не появляется.

## 2. Нормативное положение gate в lifecycle

Gate обязателен в двух точках. Это именно `and`, а не альтернативные места.

### 2.1 Перед созданием MR

Порядок управляемого Meta-O lifecycle:

1. Executor завершает implementation и disposition всех записей backlog.
2. Durable knowledge переносится в business/architecture/acceptance/tests, подтверждённые out-of-scope работы — в Issues.
3. Временная spec/ledger/checklist удаляется по существующему completion contract.
4. Worktree должен быть чистым, `HEAD` — полным существующим commit.
5. На этом SHA проходит `make mo-qc`.
6. На том же SHA проходит `make mo-backlog-empty`.
7. Только после обоих успешных результатов разрешён write, создающий MR: например, `glab mr create` или эквивалентная native GitHub/hosting операция.

При `BLOCKED` или `UNKNOWN` команда создания MR не вызывается. Создание Draft MR исключением не является: managed Meta-O flow публикует MR только после закрытия feature backlog. Обычные commits, pushes, reviews и mid-feature QC этим не блокируются.

CI не может предотвратить само создание MR — pipeline появляется уже после него. Поэтому pre-create barrier принадлежит lifecycle skill/agent reasoning, а CI является дополнительным merge barrier.

### 2.2 Перед слиянием

Проверка выполняется повторно, даже если она уже прошла перед созданием MR:

1. Устанавливается текущий exact source SHA MR.
2. Подтверждается отсутствие новых commits и чистота соответствующего checkout.
3. На текущем SHA должны быть действительны QC, reviews и applicable E2E по существующим правилам.
4. Повторно выполняется `make mo-backlog-empty`.
5. Только после `PASS` разрешается native merge write.

Любое изменение source SHA инвалидирует оба результата так же, как сейчас инвалидирует QC и reviews. Если применяется merged-result pipeline или merge train, CI обязан проверить checkout фактического интегрируемого candidate, а не устаревший source snapshot.

Наличие человеческого решения «merge» не заменяет gate. Gate является техническим precondition и не даёт агенту самостоятельного разрешения на merge.

### 2.3 Обход управляемого lifecycle

Если MR создан вручную или другим инструментом без pre-create gate, это не делает MR недействительным, но merge остаётся запрещён до успешной повторной проверки. Для Web UI и иных внешних merge paths реальное техническое принуждение обеспечивается только required GitLab pipeline/project policy; локальная инструкция агента сама по себе не может запретить человеку нажать Merge.

## 3. Соотношение с `make mo-qc`

Сохраняется разделение трёх понятий:

| Проверка | Когда применяется | Допускает непустой backlog |
| --- | --- | --- |
| Backlog schema validation внутри `make mo-qc` | Каждый mid-feature запуск | Да, если все записи корректны |
| `make mo-backlog-empty` | Только named finalization transitions | Нет |
| QC плюс empty-backlog gate | Перед созданием MR и перед merge | Нет |

`make mo-qc` остаётся единственным авторитетным aggregate product-quality gate и не получает зависимость от `mo-backlog-empty`. Это сохраняет принятое решение «unconditional empty-backlog check во всяком mid-feature QC — rejected».

Реализация и fixture-тесты самого checker входят в `make mo-test` и тем самым в `make mo-qc`. Но `make mo-qc` проверяет корректность механизма, а не требует пустоты текущего feature backlog.

Не следует вводить `make mo-finalize`: он стал бы вторым aggregate gate и размыл бы существующий контракт. Lifecycle явно выполняет последовательность:

```text
make mo-qc
make mo-backlog-empty
```

Обе команды запускаются foreground, non-mutating и на одном неизменившемся SHA.

## 4. Компоненты и ответственность

### 4.1 Project-owned backlog checker

Для Meta-O это узкий checker в `tools/`, вызываемый Make target `mo-backlog-empty`. Для подключаемого проекта `mo-setup` предлагает эквивалентную project-owned реализацию, но публичное имя контракта остаётся одинаковым:

```text
make mo-backlog-empty
```

Checker:

- читает только `docs/backlog.md`;
- разбирает Markdown настоящей AST-библиотекой;
- ничего не записывает;
- не вызывает Git hosting, сеть или Issue tooling;
- не создаёт manifest, receipt, digest или baseline;
- не пытается сам закрывать записи;
- возвращает typed result через exit status и однострочный diagnostic.

Custom checker оправдан: линтер Markdown может проверить синтаксис, но не способен доказать семантическую пустоту конкретного AST-раздела и различить пустой, malformed и unreadable backlog.

### 4.2 Lifecycle consumers

`shared/references/methodology.md` владеет точками вызова:

- pre-MR-create barrier;
- pre-merge barrier;
- инвалидацией результата после нового commit;
- запретом вызывать write после `BLOCKED`/`UNKNOWN`.

`mo-orchestrate-orca` применяет эти правила в полном lifecycle. Любой Result/MR workflow, который фактически создаёт или сливает MR, обязан применять тот же contract непосредственно перед native write.

### 4.3 `mo-setup`

`mo-setup` не становится владельцем runtime gate. Он проверяет readiness проекта:

- существует ли документированный `make mo-backlog-empty`;
- является ли команда deterministic и non-mutating;
- различает ли она empty, non-empty и unknown states;
- не включена ли фактическая проверка пустоты в обычный `make mo-qc`;
- названы ли обе lifecycle-точки в project instructions;
- имеется ли GitLab CI и покрывает ли он merge-side gate;
- может ли setup доказать, что merge действительно требует успешный pipeline.

`mo-setup` только сообщает gaps и предлагает точные изменения. Tracked repair по-прежнему требует отдельной `feature/meta-o-setup`; CI, repository settings и personal configuration не изменяются автоматически.

## 5. Интерфейсы и модель результата

### 5.1 Внутренний интерфейс checker

Рекомендуемая сигнатура:

```ts
type BacklogGateCode =
  | "backlog_empty"
  | "backlog_not_empty"
  | "backlog_missing"
  | "backlog_unreadable"
  | "backlog_invalid";

type BacklogEntryRef = {
  heading: string;
  line: number;
};

type BacklogGateResult =
  | {
      schema: "meta-o.backlog-empty-gate.v1";
      verdict: "PASS";
      code: "backlog_empty";
      path: "docs/backlog.md";
      entryCount: 0;
    }
  | {
      schema: "meta-o.backlog-empty-gate.v1";
      verdict: "BLOCKED";
      code: "backlog_not_empty";
      path: "docs/backlog.md";
      entryCount: number;
      entries: BacklogEntryRef[];
    }
  | {
      schema: "meta-o.backlog-empty-gate.v1";
      verdict: "UNKNOWN";
      code: "backlog_missing" | "backlog_unreadable" | "backlog_invalid";
      path: "docs/backlog.md";
      detail: string;
    };

function checkBacklogEmpty(options: {
  projectRoot: string;
  backlogPath?: "docs/backlog.md";
}): BacklogGateResult;
```

Это ephemeral process output, не persisted evidence protocol.

### 5.2 CLI contract

```text
make mo-backlog-empty
```

Exit status:

| Exit | Verdict | Значение |
| --- | --- | --- |
| `0` | `PASS` | Canonical backlog доказанно пуст |
| `1` | `BLOCKED` | Backlog корректно прочитан и содержит открытые записи |
| `2` | `UNKNOWN` | Backlog отсутствует, нечитаем или malformed |

Минимальные сообщения:

```text
BACKLOG_GATE PASS code=backlog_empty path=docs/backlog.md entries=0
```

```text
BACKLOG_GATE BLOCKED code=backlog_not_empty path=docs/backlog.md entries=2
Закройте каждую запись: реализуйте её либо перенесите подтверждённую out-of-scope работу в canonical Issue до финализации.
```

```text
BACKLOG_GATE UNKNOWN code=backlog_invalid path=docs/backlog.md
Пустота backlog не доказана; восстановите canonical readable structure до финализации.
```

Заголовки и строки записей можно вывести следующими строками, но в сообщение не включается body: это снижает риск утечки чувствительного intake.

### 5.3 Семантика пустоты

`PASS` допустим только когда одновременно выполнено следующее:

- `docs/backlog.md` существует как читаемый regular file;
- содержимое является валидным UTF-8 Markdown;
- AST содержит ровно canonical `# Бэклог` и `## Открыто`;
- после `## Открыто` нет ни одной `###` entry;
- в открытом разделе нет абзацев, списков, code blocks, HTML comments или иных substantive AST nodes;
- нет дополнительных sibling sections, способных скрыть открытые записи вне canonical раздела.

Если существуют корректные `###` entries с обязательными полями `Причина.`, `Практическое влияние.`, `Следующий шаг.`, результат — `backlog_not_empty`.

Если структура неканонична, entry не содержит обязательного поля, содержимое лежит вне ожидаемого раздела или parser не может однозначно классифицировать документ, результат — `backlog_invalid`, а не `backlog_empty`.

Отсутствующий и нечитаемый файл всегда дают `UNKNOWN`. Они никогда не интерпретируются как «нет записей».

### 5.4 Привязка к SHA

Сам checker не создаёт Git-state protocol. Caller принимает его результат только если:

- `HEAD` до и после запуска одинаков;
- worktree чист;
- это тот же exact SHA, к которому относятся QC/reviews/E2E или текущий merge candidate.

Evidence остаётся в human-readable final result или CI log. Новый receipt не создаётся.

## 6. Что проверяет и предлагает `mo-setup`

### 6.1 Project contract

`mo-setup` выполняет read-only inspection и выдаёт отдельные setup findings:

| Code | Условие |
| --- | --- |
| `backlog_gate_missing` | Нет документированной команды `make mo-backlog-empty` |
| `backlog_gate_contract_invalid` | Команда не различает exit `0/1/2` или не использует AST |
| `backlog_gate_mutating` | Проверка изменяет worktree или dependencies |
| `backlog_gate_in_midfeature_qc` | `mo-qc` требует фактической пустоты текущего backlog |
| `backlog_lifecycle_gap` | Не названа одна из двух обязательных точек |
| `backlog_currently_nonempty` | Механизм исправен, но текущий backlog пока содержит entries |

`backlog_currently_nonempty` во время активной разработки — informational readiness state, а не запрет продолжать feature work. Blocking он становится только при pre-MR/pre-merge transition.

`mo-setup` предлагает:

- project-owned checker и target;
- fixture tests для всех verdicts;
- lifecycle instruction для обеих точек;
- CI job, если обнаружен GitLab;
- required-pipeline настройку как отдельное предложение, если её нельзя доказать локально.

### 6.2 Проверка non-mutating свойства

Setup фиксирует clean-status snapshot до и после пробного запуска. Для проверки `BLOCKED`/`UNKNOWN` variants используются только существующие unit fixtures или disposable copy — текущий backlog не переписывается.

## 7. GitLab CI discovery и предложение интеграции

### 7.1 Обнаружение

`mo-setup` действует консервативно:

1. По Git remote URLs определяет, что проект использует GitLab. Не делает вывод только из наличия установленного `glab`.
2. Проверяет tracked root candidates `.gitlab-ci.yml` и `.gitlab-ci.yaml`.
3. Если найден canonical entrypoint, разбирает YAML настоящим YAML parser.
4. Рекурсивно следует только по статически разрешимым project-local `include: local`.
5. Remote, project, component, template, wildcard или conditional includes фиксирует как неполную локальную видимость.
6. Если root config отсутствует, но GitLab remote существует, сообщает `gitlab_ci_config_unresolved`: custom CI path может быть задан в project settings, поэтому утверждать «CI отсутствует» нельзя.
7. Multiple candidates, malformed YAML, unreadable include или include cycle дают `UNKNOWN`, а не ложное заключение о coverage.

Содержимое произвольных YAML-файлов не сканируется как CI только по наличию ключей `stages`/`rules`.

### 7.2 Что считается покрытием

Coverage доказан, только если разрешённый effective local config содержит job, который:

- вызывает точный project-owned `make mo-backlog-empty`;
- запускается для merge-request pipelines;
- не помечен `allow_failure`;
- не ограничен только обычным branch push;
- находится в существующей подходящей quality/test stage либо сопровождается предложением добавить stage;
- не имеет очевидного `rules`/`only`/`except`, исключающего целевой MR;
- выполняется на candidate, допускаемом к merge.

Если используются merge trains или merged-result pipelines, job должен покрывать их фактическую pipeline форму. Setup не придумывает version-dependent GitLab variables: exact proposed rules сверяются с документацией/версией конкретного GitLab при реализации.

### 7.3 Форма предложения

`mo-setup` возвращает не общий совет, а proposed patch в отчёте:

- точный обнаруженный entrypoint/include file;
- существующую stage, куда предлагается добавить job;
- точную команду;
- предлагаемые MR rules;
- необходимость required-successful-pipeline policy;
- какие dynamic includes или project settings не позволили доказать enforcement.

Он не редактирует YAML, не вызывает GitLab API и не меняет merge settings.

Рекомендуемый job остаётся отдельным от общего QC job, чтобы failure явно сообщал `BACKLOG_GATE BLOCKED/UNKNOWN`. Если CI уже запускает `make mo-qc`, дублировать его в backlog job не требуется.

## 8. Изменения business и architecture

### 8.1 Business

Расширить планируемое изменение `§B-LONGEVITY-04`:

> Пустота feature backlog является обязательным техническим precondition двух finalization transitions: публикации MR и слияния текущего candidate в base. Обычная разработка и mid-feature QC допускают корректно оформленные временные записи. Отсутствующий, нечитаемый или неоднозначный backlog не считается пустым.

Новый business identifier не нужен: это механизм исполнения уже принятого outcome U-02, а не новая бизнес-цель. Существующая authorization semantic reuse `§B-LONGEVITY-04 via §A-BACKLOG-01` должна охватывать эту границу.

### 8.2 Architecture

Расширить `§A-BACKLOG-01` в `docs/architecture/backlog-notebook.md`:

- canonical AST empty semantics;
- project-owned checker и exit contract;
- две обязательные lifecycle barriers;
- fail-closed поведение;
- разделение schema QC и closure gate;
- CI как defense in depth;
- отсутствие receipt/state store.

В таблице §2.2 исходной спецификации consumer list для `§A-BACKLOG-01` расширить до:

```text
methodology, mo-setup, MR/result workflows, closure review and optional GitLab CI
```

`§A-ORCHESTRATION-01` не меняется: checker является deterministic project-quality command, а не workflow engine.

## 9. Acceptance и E2E

### 9.1 Acceptance mapping

Добавить требования:

| Требование | Детерминированное доказательство | Live-доказательство |
| --- | --- | --- |
| MR write не начинается без empty-backlog PASS на exact SHA | Lifecycle contract test проверяет ordering и abort для exit 1/2 | Skill eval возвращает typed error и не вызывает MR write |
| Merge требует повторной проверки актуального SHA | Contract fixtures моделируют изменившийся MR head | Реальный finalization flow фиксирует повторный PASS |
| Empty checker fail-closed | Temp-repository fixtures для empty, entry, missing, unreadable и malformed | Не требуется |
| Mid-feature QC допускает корректную временную entry | Fixture запускает `make mo-qc` с valid non-empty backlog | Не требуется |
| Setup обнаруживает GitLab CI и предлагает job без записи | YAML fixtures: root, local include, remote include, malformed, absent/custom-unknown | `mo-setup` report на реальном GitLab project |
| CI gate действительно является merge barrier | Static job/rules assertions плюс явная unknown boundary project settings | Реальный MR pipeline, когда существует настоящая feature MR |

### 9.2 Deterministic fixtures

Минимальный набор:

- canonical empty → exit `0`;
- одна valid entry → exit `1`;
- несколько entries → exit `1`;
- missing file → exit `2`;
- unreadable/non-regular file → exit `2`;
- malformed headings → exit `2`;
- paragraph/comment под `## Открыто` без entry → exit `2`;
- entry без одного обязательного поля → exit `2`;
- `make mo-qc` с valid non-empty fixture остаётся зелёным;
- checker не меняет bytes, mode, mtime-relevant tracked state или Git status;
- MR/merge command spy не вызывается после exit `1` или `2`;
- новый SHA требует новый gate run.

### 9.3 Новые E2E scenarios

Добавить после B35:

- **B36 — Managed MR finalization.** При valid non-empty backlog orchestrator получает `backlog_not_empty`, не вызывает MR create и продолжает remediation. После disposition и нового SHA gate проходит, и только затем разрешается реальный MR create.
- **B37 — Merge recheck.** После создания MR source SHA изменяется; старый result отвергается, gate повторяется на новом SHA, merge write не происходит до `PASS`.
- **B38 — GitLab CI setup inspection.** `mo-setup` называет обнаруженный entrypoint/include graph, отличает proven coverage от unreadable/incomplete config и предлагает exact job без изменения файлов или settings.

B36/B37 не требуют dummy external writes. Negative path доказывается до write через observable absence вызова. Positive external write засчитывается только в настоящем feature/MR lifecycle; при отсутствии такого lifecycle live outcome — `NOT_APPLICABLE`, а не синтетический MR.

## 10. Поправки к implementation slices

Существующие slices сохраняются. Дополнить их так:

- Slice 2: включить finalization semantics в `§B-LONGEVITY-04` и `§A-BACKLOG-01`.
- Slice 3: добавить AST empty-check contract и lifecycle error guidance.
- Slice 6: расширить `mo-setup` project/CI inspection.
- Slice 11: добавить checker, lifecycle, CI-discovery fixtures и B36–B38 contracts.
- Slice 13: перед созданием MR и повторно перед merge выполнить `make mo-backlog-empty` на соответствующем exact SHA.

Сам checker является реализацией и в текущую specification-only работу не входит.

## 11. Рассмотренные альтернативы

1. **Включить пустоту в каждый `make mo-qc`.** Отклонено: блокирует нормальные промежуточные записи и противоречит принятому D-18/D-19 и явному rejected решению исходной спеки.

2. **Проверять только один раз перед completion.** Отклонено: backlog или SHA могут измениться между созданием MR и merge.

3. **Проверять только в GitLab CI.** Отклонено: CI не способен предотвратить создание MR и не покрывает GitHub/local workflows.

4. **Использовать pre-commit/pre-push hook.** Отклонено: блокирует активную разработку, зависит от user-local state и не гарантирует server-side merge.

5. **Автоматически очищать backlog или создавать Issues.** Отклонено: checker перестал бы быть non-mutating, а disposition требует evidence и reasoning.

6. **Считать отсутствующий backlog пустым.** Запрещено: отсутствие evidence не является `PASS`.

## 12. Риски и mitigations

- **MR создан вне Meta-O.** Merge-side CI и обязательный повторный lifecycle gate сохраняют защиту.
- **Required pipeline не включён в GitLab settings.** Setup сообщает `gitlab_merge_enforcement_unverified`; YAML job не объявляется blocking enforcement без доказательства settings.
- **Dynamic includes скрывают job или rules.** Результат `UNKNOWN`; setup предлагает интеграцию в видимый project-owned entrypoint, но не утверждает coverage.
- **Draft MR нужен для ранней коммуникации.** Managed Meta-O flow его не создаёт до closure; разработка и pushes остаются разрешены. Внешне созданный Draft MR не может быть слит до gate.
- **Base branch изменилась после source check.** Merge-result pipeline/merge train повторяет gate на интегрируемом candidate; при отсутствии такой возможности merge readiness остаётся недоказанной.
- **Malformed backlog маскирует записи.** AST validation возвращает `backlog_invalid`, никогда `PASS`.
- **Checker превращается в workflow helper.** Его граница ограничена одной read-only функцией над одним project file; routing, Issue writes и lifecycle state остаются в skills/reasoning.
- **Два «главных QC».** `mo-qc` остаётся product-quality gate; `mo-backlog-empty` называется lifecycle closure gate и не агрегирует другие проверки.

## 13. Дополнение Decision Ledger

Добавить:

| id | Решение | Статус | Основание |
| --- | --- | --- | --- |
| U-19 | Require a project-owned non-mutating empty-backlog gate before MR creation and again before merge; make mo-setup inspect and propose GitLab CI enforcement without changing CI. | adopted | Новое пользовательское требование |
| D-47 | Обе точки — pre-MR-create и pre-merge — обязательны; результат привязан к exact SHA | adopted | U-19; `§A-BACKLOG-01` |
| D-48 | `make mo-backlog-empty` отделён от ordinary `make mo-qc` | adopted | U-02, U-19; сохранение mid-feature notebook |
| D-49 | Exit `0/1/2` различает empty, non-empty и unknown; missing/unreadable/malformed fail closed | adopted | U-19; `§A-ORCHESTRATION-03` |
| D-50 | `mo-setup` проверяет command/lifecycle/CI readiness и только предлагает изменения | adopted | U-19; существующая setup authority |
| D-51 | GitLab CI job применяется к MR pipeline и становится реальным merge barrier только вместе с required-pipeline policy | adopted | U-19 |
| D-52 | Gate не создаёт receipt, registry или persisted evidence | adopted | `§A-ORCHESTRATION-01/03` |
| D-53 | Пустота во всяком mid-feature `make mo-qc` | rejected | Блокирует активную разработку |
| D-54 | Только CI или только один lifecycle check | rejected | Не покрывает обе finalization boundaries |

## 14. Assumptions и open questions

Открытых продуктовых вопросов нет.

Приняты консервативные assumptions:

- «закрытие ветки» означает merge в base, а не удаление Git ref;
- canonical feature backlog остаётся `docs/backlog.md`;
- managed Meta-O flow не создаёт ранние Draft MR;
- GitLab CI даёт defense in depth для merge, но не может блокировать создание объекта MR;
- точные GitLab `rules` и merge-train variables должны быть проверены против установленной версии при реализации;
- при недоступных project settings `mo-setup` сообщает непроверенное enforcement, а не считает наличие YAML job достаточным.

## All proposals

### opus1mhigh (proposal-1) — open, score 4.0/10, 0/2 adopt

## Ограничения, которые определяют решение

Прежде чем предлагать форму gate, нужно зафиксировать, что в исходной спецификации уже заморожено и не может быть переоткрыто этой поправкой. Во-первых, §16 прямо содержит строку «unconditional empty-backlog check во всяком mid-feature QC — rejected», а §3.1 и §14 повторяют это в позитивной форме: «Безусловный mid-feature `make mo-qc` не требует пустоты; named lifecycle closure требует». Значит запрошенное пользователем «включить в qc» нельзя понимать буквально как добавление проверки в `mo-qc` — это отменило бы принятое решение. Во-вторых, D-18/D-19/D-20 запрещают новый helper в поставке, workflow engine и state store, а проектный контракт требует доказать, что custom checker нельзя заменить плагином или конфигурацией. В-третьих, `§A-ORCHESTRATION-01` и правило «no manifest/receipt/digest без названного потребителя» запрещают заводить новый конфиг-файл под путь backlog. В-четвёртых — и это главное — Meta-O сегодня вообще не владеет созданием MR: `methodology.md` §7 говорит о «the user's merge decision», а MR создаётся внешними средствами. Поэтому gate не может быть реализован как «перехват команды создания MR»; он может быть только (а) обязательством в lifecycle до freeze и (б) проверкой на той поверхности, которая действительно наблюдает MR и merge, то есть в CI.

И ещё одно наблюдение, которое я считаю несущим для всей поправки: блокирующий gate на пустоту допустим только потому, что исходная спека уже сделала автономное создание Issue заранее авторизованным (`U-03`, новый `§B-HUMAN-04`, §4). Без Issue-стока «пустой backlog» был бы требованием, которое честно выполнить нельзя, и агент удалял бы записи. Gate легитимен ровно в той мере, в какой у него всегда есть честный способ пройти: `in_scope` → починить, `project_issue`/`upstream_issue` → вынести, `duplicate` → сослаться, `needs_attention` → закрытие запрещено и записи остаются. Это же даёт правильную семантику отказа: gate не «требует чистого файла», он требует, чтобы у каждой записи была settled disposition.

---

## 1. Подход (сводка)

Ввести **один узкий, read-only, трёхзначный closure gate**, который проверяет только пустоту notebook-раздела активной фичи и живёт на named lifecycle closure boundary, а не в mid-feature QC: новая цель `make mo-closure`, определённая как `mo-qc` плюс одно дополнительное утверждение, исполняемое существующим `node --test` без нового исполняемого файла. Тот же gate становится обязательным на двух внешних точках — создание/снятие Draft у MR и merge в базовую ветку — через CI job, который `mo-setup` **обнаруживает и предлагает read-only**, никогда не изменяя CI без явного подтверждения и вне `feature/meta-o-setup`. Нечитаемый, отсутствующий или неканонический backlog даёт `unknown` и fail-closed, и никогда не засчитывается как пустой.

---

## 2. Архитектура и разграничение ответственности

### 2.1 Три точки gate в lifecycle

| Gate    | Где стоит                                                                                                                 | Владелец                                | Форма                                         | Блокирует                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **G1**  | `methodology.md` §7, до candidate freeze — после harvest знаний и удаления spec, до создания fresh final review pair       | Meta-O (`mo-orchestrate-orca`, executor) | `make mo-closure` на точном SHA               | Переход к final proof                                                                    |
| **G2**  | Создание MR или снятие Draft для feature-ветки, прошедшей Meta-O lifecycle                                                 | Агент, выполняющий действие             | Settled `empty` verdict на exact `HEAD` ветки | Создание/ready-перевод MR                                                                |
| **G3**  | MR pipeline и pipeline базовой ветки                                                                                       | CI проекта                              | CI job, вызывающий `make mo-closure`          | Merge (при включённом server-side «pipelines must succeed» — см. §6 «человеческая граница») |

G1 авторитетен и всегда наш. G2 — обязательство в методологии, потому что Meta-O не владеет созданием MR; его реальное принуждение обеспечивает G3. G3 — единственная поверхность, которая наблюдает merge, и именно поэтому CI-часть просьбы пользователя не «приятное дополнение», а замыкание контура.

**Ключевое соответствие, которое делает дизайн узким:** различие «branch pipeline vs merge-request pipeline» в CI — это ровно то же различие, что «mid-feature vs named closure» в lifecycle. Никакого дополнительного признака «сейчас closure» изобретать не нужно и, что важнее, нельзя: любой признак, который агент выставляет сам (env var, файл-маркер), был бы state store и обходился бы одной строкой.

### 2.2 Порядок внутри §7 (существенно)

Gate ставится **после** harvest и удаления spec, но **до** freeze:

```
remediation → disposition каждой записи (§4.5) → harvest knowledge
→ удаление spec/ledger → backlog пуст → commit → SHA заморожен
→ G1: make mo-closure на этом SHA → fresh final pair → applicable E2E → G2/G3
```

Следствие, которое надо записать явно, потому что у него есть поведенческие зубы: если финальная пара reviewers находит новый deferral, его **нельзя** положить в backlog и пройти закрытие — он либо чинится в scope, либо уходит в Issue по §4, либо даёт `needs_attention` и закрытие запрещено. Именно это превращает поправку из формальности в работающее правило.

### 2.3 Компоненты

| Компонент                                                     | Ответственность                                                                                                           | Чего НЕ делает                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `make mo-closure` (Makefile)                                   | Агрегирует `mo-qc` и `mo-backlog-empty`; единственная документированная команда named closure                              | Не дублирует проверки `mo-qc`, не пишет файлы, не заменяет `mo-qc`                                                                  |
| `mo-backlog-empty` (Makefile → `node --test`)                   | Вычисляет трёхзначный verdict и печатает typed failure                                                                     | Не валидирует поля записей (это делает существующий schema-тест в `mo-qc`), не судит качество Issue, не ходит в сеть               |
| `tests/backlog-closure-gate.test.mjs`                          | Test-only evaluator: резолв пути, AST-разбор, классификация                                                                | Не поставляется в `skills/`, не вызывается lifecycle-скилами, не хранит состояние                                                  |
| `§A-BACKLOG-02` (раздел в `docs/architecture/backlog-notebook.md`) | Нормативное владение: где стоит gate, трёхзначная семантика, CI-поверхность, границы предложения правки CI                | Не описывает Issue routing (это `§A-ISSUE-01`), не описывает posture/delivery                                                      |
| `mo-setup` + `project-setup.md` §CI                             | Проверяет наличие closure-команды, её отсутствие в обычном QC, обнаруживает CI config read-only, классифицирует coverage, предлагает минимальный snippet | Не редактирует CI, не меняет project settings GitLab, не включает approval rules, не угадывает путь конфигурации                    |

---

## 3. Интерфейсы и модель данных

### 3.1 Verdict модель (единственная структура данных поправки)

```js
/**
 * @typedef {"empty" | "not_empty" | "unknown"} BacklogVerdictKind
 *
 * @typedef {"undeclared_path"        // контракт проекта не называет backlog-документ
 *         | "missing_file"           // ENOENT по объявленному пути
 *         | "unreadable_file"        // не regular file или ошибка чтения
 *         | "parse_error"            // Markdown AST библиотека не разобрала документ
 *         | "missing_open_section"   // нет объявленного раздела открытых записей
 *         | "duplicate_open_section" // объявленный раздел встречается больше одного раза
 *         | "non_entry_content"      // под разделом есть содержимое, не являющееся записью
 *         } BacklogUnknownReason
 *
 * @typedef {{ kind: BacklogVerdictKind,
 *             path: string | null,
 *             entries: string[],                       // заголовки открытых записей
 *             reason: BacklogUnknownReason | null }} BacklogVerdict
 */

/** @param {string} root @returns {BacklogVerdict} */
function readBacklogClosure(root) {}
```

**Алгоритм (нормативный, порядок значим):**

1. **Резолв пути без нового конфига.** Путь берётся из ссылки на backlog в таблице Knowledge файла `CLAUDE.md`, разобранного Markdown AST. Это уже существующий и уже тестируемый инвариант (`tests/backend-transition.test.mjs` требует наличия ссылки `docs/backlog.md` в обоих контрактных файлах), а `make contract` гарантирует байтовое совпадение `AGENTS.md`/`CLAUDE.md`. Новый manifest не заводится — правило «no manifest without a named consumer» соблюдено. Ссылка отсутствует → `unknown/undeclared_path`.
2. Чтение: `ENOENT` → `unknown/missing_file`; не regular file или иная ошибка → `unknown/unreadable_file`.
3. Разбор существующей AST-библиотекой (`markdown-it`, уже зависимость); исключение → `unknown/parse_error`.
4. Раздел открытых записей: ровно один h2 с объявленным заголовком. Ноль → `missing_open_section`, два и более → `duplicate_open_section`.
5. **Содержимое под разделом:** допустимы только блоки `h3` и их тела. Любой абзац, список, code fence, цитата или заголовок уровня ≤ h2 после открывающего h2 → `unknown/non_entry_content`.
6. `entries` = заголовки h3. `entries.length === 0` → `empty`, иначе → `not_empty`.

**Precedence — самое важное правило гейта:** `unknown` ⟶ доминирует над `not_empty`, `not_empty` ⟶ доминирует над `empty`. Verdict `empty` выдаётся **только** когда путь объявлен, файл прочитан, AST разобран, раздел найден ровно один и под ним нет ничего. Невозможность прочитать никогда не превращается в ноль записей.

Проверка на текущем состоянии репозитория как worked example: сегодняшний `docs/backlog.md` содержит под `## Открыто` свободную прозу и h2-заголовки (`## Issues/backlog`, `## Названия вкладок`). Наивный счётчик h3 вернул бы «3 записи»; правильный evaluator возвращает `unknown/non_entry_content`. Это ровно тот класс ложного сигнала, который поправка обязана исключить.

### 3.2 Typed failure и поверхность вывода

Отдельные exit codes не вводятся: цель исполняется существующим `node --test`, который различает только 0/1, а заводить обёртку ради кода возврата означало бы новый исполняемый файл и переоткрытие D-19. Вместо этого typed failure — **стабильный литеральный токен в первой строке сообщения об ошибке**:

| Verdict     | Exit | Первая строка сообщения                                                        |
| ----------- | ---- | ------------------------------------------------------------------------------ |
| `empty`     | 0    | `MO-BACKLOG-EMPTY <path>`                                                        |
| `not_empty` | 1    | `MO-BACKLOG-NOT-EMPTY <path> <n>` + по одной строке на каждый заголовок записи   |
| `unknown`   | 1    | `MO-BACKLOG-UNKNOWN <reason> <path-or-none>`                                     |

Требование «сообщение перечисляет каждый открытый заголовок» не косметическое: оно даёт человеку и финальным reviewers точный список того, что было отложено, и делает «тихое удаление записей» видимым в diff рядом с их dispositions.

Два именованных теста в одном файле, каждый исполним отдельно в стиле уже существующего `tests/closure-obligations.test.mjs`:

```bash
node --test --test-name-pattern "^mo-backlog-gate: readable" tests/backlog-closure-gate.test.mjs
node --test --test-name-pattern "^mo-backlog-gate: empty"    tests/backlog-closure-gate.test.mjs
```

### 3.3 Makefile

```make
.PHONY: mo-closure mo-backlog-empty

# Named lifecycle closure gate: строгий супермножество mo-qc.
# mo-qc остаётся единственным авторитетным correctness-гейтом и намеренно
# НЕ требует пустоты backlog (§16: unconditional mid-feature check rejected).
mo-closure: mo-qc mo-backlog-empty
	@echo "mo-closure ok"

mo-backlog-empty:
	node --test tests/backlog-closure-gate.test.mjs
```

`mo-qc` не изменяется ни одной строкой. Дрейф защищается детерминированно и мимо regex по Makefile:

```bash
make --dry-run mo-qc | grep -q backlog-closure-gate && exit 1
```

— утверждение «`mo-qc` не исполняет closure-проверку» становится частью `mo-qc` и охраняет решение §16 от тихого поглощения.

### 3.4 Интерфейс обнаружения CI (`mo-setup`, read-only)

```js
/**
 * @typedef {{ status: "covered" | "absent" | "unknown",
 *             platform: "gitlab" | "github" | "unsupported",
 *             configPath: string | null,
 *             pathSource: "user_named" | "project_api" | "default_path" | null,
 *             coveringJobs: string[],
 *             unresolvedIncludes: string[],
 *             reason: string | null }} CiGateCoverage
 */
```

**Резолв пути конфигурации — по доказательству, а не по имени файла.** Порядок, первый успешный шаг выигрывает:

1. Путь, явно названный пользователем в текущей задаче.
2. Поле конфигурируемого пути CI в project metadata, прочитанное через установленный `glab` (значение поля и подкоманда берутся из `--help` установленной версии и фиксируются recorded fixture по §2.5; отсутствие поля → ISS-15-подобный `unsupported`, подстановка похожего поля запрещена).
3. Путь по умолчанию в корне репозитория.

Если host ветки не классифицирован как GitLab по правилам §4.1 (host части URL remote, а не по установленному CLI) — `platform: "unsupported"`, без догадок.

**Разбор — настоящей YAML-библиотекой** (`js-yaml`, уже зависимость), никогда не regex. Это прямой аналог проектного правила «Parse Markdown programmatically only with a real AST library».

**Правило графа `include:`** — источник самого опасного ложного «absent»:

- локальные `include: local:` внутри репозитория раскрываются read-only и учитываются;
- любой `include:` вида `remote`, `template`, `project` или `component` **не загружается**; его наличие переводит вердикт в `unknown` с перечислением неразрешённых включений, а не в `absent`.

Это принципиально: «я не нашёл job» и «job точно нет» — разные утверждения, и предлагать правку CI на основании первого нельзя.

**Классификация coverage.** `covered` требует найденного job, который (а) исполняет closure-команду проекта и (б) имеет `rules`, срабатывающие на merge-request pipeline и на pipeline базовой ветки. Частичное покрытие (только MR или только default branch) — `absent` с точным указанием недостающего условия.

### 3.5 Предлагаемый минимальный snippet (текст предложения, не применяемая правка)

```yaml
mo-closure:
  stage: test
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: "$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH"
  script:
    - make mo-closure
```

Draft-исключение (см. §5 «не блокировать активную разработку») добавляется **только** после того, как точное имя и семантика предопределённой переменной draft-состояния подтверждены на установленной версии GitLab и зафиксированы fixture по §2.5. До этого подтверждения snippet остаётся в форме выше, то есть **fail-closed**: Draft MR тоже блокируется. Называть переменную по памяти — ровно тот дефект, который §2.5 и D-45 запрещают.

`mo-setup` печатает snippet, объясняет каждую строку, называет неизвестные места и **не пишет файл**. Применение — только на `feature/meta-o-setup` от актуального `develop`, только после явного подтверждения, и никогда в текущей feature-ветке пользователя (существующее правило `project-setup.md` §«Isolated setup branch»).

---

## 4. Рассмотренные альтернативы и почему выбрано это направление

| Вариант                                                                              | Почему отклонён                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Добавить проверку прямо в `mo-qc`                                                     | Прямо отменяет §16 и §3.1. Практически — ломает работу: mid-feature агент обязан записывать наблюдения, и QC начал бы наказывать за исполнение собственного правила проекта                                                                   |
| Модальный `mo-qc` через env var (`MO_LIFECYCLE=closure`)                               | Признак closure становится переменной, которую агент выставляет сам → это state и обходится молча. Blocking gate, который можно отключить одной переменной, не blocking                                                                        |
| Git `pre-push`/`pre-commit` hook                                                       | Личная конфигурация машины, не переносится в свежий checkout, не наблюдает merge на сервере, и проектный контракт требует явного подтверждения на личные изменения. Не закрывает ни G2, ни G3                                                  |
| Новый скрипт `mo-backlog.mjs` в поставке                                                | Переоткрывает D-19 и нарушает правило custom checker. Существующий `node --test` + `markdown-it` покрывают задачу без нового владельца логики                                                                                                 |
| Новый конфиг-файл с путём backlog                                                      | Manifest без внешнего потребителя — прямо запрещено контрактом. Ссылка в Knowledge-таблице уже существует, уже тестируется и уже байт-идентична между `AGENTS.md`/`CLAUDE.md`                                                                  |
| `mo-setup` сам правит `.gitlab-ci.yml`                                                  | CI-конфигурация исполняет произвольные команды и тратит runner-ресурсы; это ближе к irreversible-границе, чем `.gitignore`. Выбран паттерн §8.2/D-46: probe → named gap → предложенная минимальная правка → подтверждение → отдельная ветка     |
| `mo-setup` включает «Pipelines must succeed» / approval rules через API                | Изменение project settings — необратимое и разрешительное действие на чужом проекте; остаётся человеческой границей по `§B-HUMAN-01`/`§B-HUMAN-04`                                                                                            |
| Двузначный вердикт (пусто / не пусто)                                                   | Отсутствующий файл, сломанный AST или переименованный раздел молча дали бы «пусто». Это худший возможный отказ гейта: он зелёный именно тогда, когда проверять нечего                                                                         |
| Gate проверяет ещё и наличие disposition у каждой снятой записи                        | Требует сравнения состояний между коммитами, то есть ledger/state store → D-20. Вместо этого disposition-полнота остаётся за live-spec ledger test (§14) и Deferral lens финальной пары, а gate печатает список записей, чтобы сделать diff читаемым |

Выбранное направление даёт максимум принуждения на минимуме новых сущностей: **ноль новых исполняемых файлов, ноль новых форматов состояния, один новый Make target, один новый тестовый файл, один новый `§A-*`, один новый `§B-*`.**

---

## 5. Как это не блокирует активную разработку

Четыре независимых механизма, каждый из которых достаточен сам по себе:

1. **`make mo-qc` не меняется.** Весь mid-feature цикл — правки, коммиты, промежуточные reviews, remediation — идёт на прежнем гейте; записи в backlog остаются легальными и не красят QC.
2. **CI не трогает branch pipelines.** `rules` включают job только на merge-request pipeline и на pipeline базовой ветки. Обычный push в feature-ветку не блокируется.
3. **Draft MR.** MR, открытый рано как рабочая поверхность, — нормальная практика. После подтверждения draft-переменной (см. §3.5) job на Draft становится `allow_failure: true` и жёстким при снятии Draft. До подтверждения действует fail-closed вариант, и это осознанный выбор: лучше временно строже, чем нормативно назвать несуществующую переменную.
4. **У гейта всегда есть честный выход.** `in_scope` → починить; `project_issue`/`upstream_issue` → вынести через `gh`/`glab` без отдельного approval (`U-03`, `§B-HUMAN-04`); `duplicate` → сослаться; `needs_attention` → закрытие и так запрещено §4, и gate лишь согласованно повторяет запрет. Ни один сценарий не требует удалить информацию, чтобы пройти.

Дополнительно: `make mo-closure` разрешено запускать mid-feature добровольно — как раннюю диагностику. Он read-only и безопасен в frozen worktree.

---

## 6. Риски и их митигация

| Риск                                                                                   | Митигация                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Главный: gate провоцирует тихое удаление записей вместо disposition**                  | Gate печатает каждый заголовок → список виден в отчёте; методология требует, чтобы опустошение backlog и запись dispositions происходили **в одном коммите**, что проверяемо в diff; финальная пара применяет Deferral lens к этому diff; live-spec ledger test требует canonical URL у каждой settled Issue-disposition. Deterministic gate намеренно узок — это названо честно, а не замаскировано |
| Нечитаемый backlog засчитан как пустой                                                   | Трёхзначный вердикт с жёстким precedence `unknown > not_empty > empty` и семью явными reason-кодами; fixtures на каждый reason в детерминированном слое                                                                                               |
| `mo-qc` со временем «впитает» проверку и отменит §16                                     | Assertion `make --dry-run mo-qc` не содержит closure-теста, исполняемая внутри самого `mo-qc`                                                                                                                                                         |
| Ложное `absent` по CI из-за нераскрытых `include:`                                        | Неразрешимые включения переводят вердикт в `unknown` с их перечислением; предложение правки не выдаётся по `unknown`                                                                                                                                  |
| Ложное `covered`/`absent` из-за regex по YAML или совпадения имени файла                 | Разбор только YAML-библиотекой; путь конфигурации резолвится по precedence §3.4, а не по имени; несоответствие версии `glab` → `unsupported` по правилу ISS-15                                                                                        |
| Несанкционированное изменение CI                                                          | `mo-setup` никогда не пишет CI: только текст предложения; применение — явное подтверждение + `feature/meta-o-setup`; project settings и approval rules не трогаются вовсе                                                                             |
| Gate в CI не блокирует merge, потому что «Pipelines must succeed» выключено               | `mo-setup` обязан сказать это прямо: без server-side merge check job **advisory**, и включение — человеческая граница. Молча считать CI-job блокирующим запрещено                                                                                     |
| Поправка ломает slice 1 (текущий backlog полон сырого intake)                             | `make mo-closure` вводится **после** migration checkpoint §3 и не обязан быть зелёным до его завершения; обязательность фиксируется начиная со slice, который его вводит                                                                              |
| Второй «авторитетный гейт» размывает формулу «одна авторитетная команда»                  | `mo-closure` определён как строгое супермножество `mo-qc` (`mo-closure: mo-qc mo-backlog-empty`), а не как параллельный гейт; формулировка в контрактных файлах это называет явно                                                                     |
| `unknown` в чужом проекте, где backlog ведётся иначе                                      | `mo-setup` фиксирует это как setup gap с названным недостающим элементом, а не как «проект не поддерживается»; при принципиально другой модели знаний route `unsupported` без тихого fallback                                                         |

---

## 7. Требуемые изменения в спецификации (точный список)

### 7.1 Business layer — добавить строку в таблицу §2.1

| Identifier                 | Было | Становится                                                                                                                                                                                              | Frozen decision |
| -------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `§B-LONGEVITY-05` (новый) | —    | Пустой backlog доказывается на границе интеграции, а не обещается: closure проверяется машинно перед MR и merge; нечитаемый или необъявленный backlog — `unknown`, а не пустой                          | U-19            |

Новый раздел `### §B-LONGEVITY-05 — Пустой бэклог доказывают на границе интеграции` в `docs/business.md` рядом с `§B-LONGEVITY-04`. Идентификатор проверен: в текущем дереве и во всей Git-истории не встречается.

`§B-LONGEVITY-04` этой поправкой **не переиспользуется с новым смыслом сверх уже авторизованного U-02**, поэтому дополнительный `Knowledge-ID-Change` для него не требуется; новый `§B-LONGEVITY-05` — обычное добавление.

### 7.2 Architecture layer — добавить строку в таблицу §2.2

| Identifier       | Статус | Owning file                                                      | Содержание                                                                                                                                                                                       |
| ---------------- | ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `§A-BACKLOG-02` | новый  | `docs/architecture/backlog-notebook.md` (раздел `## §A-BACKLOG-02`) | Служит `§B-LONGEVITY-04/05` и `§B-HUMAN-04`: closure boundary G1/G2/G3, трёхзначный вердикт и typed failure, отсутствие проверки в mid-feature QC, read-only обнаружение CI и границы предложения правки; consumer — methodology, `mo-setup`, CI проекта |

Владение неразделённое: и gate, и CI-поверхность — один инвариант («пустота доказывается на границе интеграции»), поэтому второй идентификатор не заводится. `§A-BACKLOG-02` свободен во всей истории.

### 7.3 Новые разделы спецификации

- **§4.7 «Blocking empty-backlog closure gate»** — G1/G2/G3, порядок внутри §7, verdict-модель, precedence, reason-коды, typed failure, `make mo-closure`, явная ссылка на сохранённое решение §16, правило «gate проходится disposition, а не удалением», согласование с `needs_attention`.
- **§8.3 «CI-поверхность closure gate и обнаружение конфигурации»** — рядом с §8.2 (git-ignore probe), потому что это тот же паттерн mo-setup-probe: precedence резолва пути, YAML AST, правило `include:`, классификация `covered/absent/unknown`, форма предложения, запрет записи, человеческая граница server-side merge checks.

### 7.4 §3.1 — новых строк обхода не добавляется

Явно зафиксировать почему: нечитаемый `ci_config_path`, нераспознанная draft-переменная и выключенный server-side merge check дают `unknown`/`unsupported`/человеческую границу соответственно, то есть честные отказы, а не локальные обходы публичного пробела. Ни один из них не требует Issue по `§B-PORTABILITY-06`. Если при реализации выяснится, что draft-состояние принципиально нечитаемо на поддерживаемых версиях GitLab — строка в §3.1 добавляется тем же правилом.

### 7.5 §14 Deterministic proof — добавить пункты

- три вердикта closure gate различимы: `empty` только при объявленном пути, прочитанном файле, разобранном AST и единственном пустом разделе; каждый из семи reason-кодов имеет fixture и даёт `unknown`;
- `unknown` никогда не деградирует в `empty`, а `not_empty` перечисляет каждый заголовок;
- `make --dry-run mo-qc` не исполняет closure-проверку, а `make --dry-run mo-closure` исполняет и `mo-qc`, и её;
- путь backlog резолвится из Knowledge-таблицы контрактного файла через Markdown AST; отсутствие ссылки даёт `undeclared_path`, а не путь по умолчанию;
- сегодняшний dirty-backlog fixture (проза и h2 под `## Открыто`) даёт `unknown/non_entry_content`, а не «три записи»;
- CI-fixtures: YAML разбирается библиотекой; job признаётся covering только при покрытии обоих условий `rules`; нераскрытый `remote`/`template`/`project`/`component` include даёт `unknown` с перечислением; путь конфигурации, не совпадающий с default, резолвится из project metadata, а не угадывается;
- `mo-setup` fixtures доказывают, что предложение CI-правки выдаётся только при `absent`, никогда не записывается и никогда не касается project settings.

### 7.6 §14 Orca E2E — два новых сценария после B35

- **B36:** на живой ветке с одной открытой записью `make mo-qc` зелёный, а `make mo-closure` на том же SHA падает с `MO-BACKLOG-NOT-EMPTY`, называя запись; после disposition (Issue или fix) и опустошения обе команды зелёные на новом SHA; удалённый backlog-файл на третьем SHA даёт `MO-BACKLOG-UNKNOWN missing_file`, а не pass.
- **B37:** `mo-setup` на реальном GitLab-проекте резолвит путь CI-конфигурации доказательством, классифицирует coverage, печатает минимальный snippet при `absent`, оставляет `unknown` при нераскрытом remote-include, не изменяет ни одного файла и ни одной настройки проекта, и отдельно сообщает, что без server-side merge check job остаётся advisory.

### 7.7 `docs/acceptance.md` — одна новая строка

| Требование                                                                 | Детерминированное доказательство                                      | Live-доказательство |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------- |
| Пустота backlog доказывается на closure boundary и не может быть ложно зелёной. | `tests/backlog-closure-gate.test.mjs`; `mo-qc` не содержит эту проверку. | B36, B37.           |

### 7.8 `AGENTS.md`/`CLAUDE.md` (байт-идентично, охраняется `make contract`)

- В блоке Commands: `make mo-closure   # named lifecycle closure gate: mo-qc + пустой backlog`.
- В «Version control»: MR не создаётся и не выводится из Draft, пока `make mo-closure` не зелёный на точном `HEAD` ветки.
- В «Knowledge»: строка про backlog дополняется тем, что документ обязан оставаться разборным по canonical schema, потому что он вход детерминированной проверки.

### 7.9 `docs/papercut.md`, `docs/glossary.md`

- papercut: `make mo-closure` в «Проверки и сборка» с пояснением, почему `mo-qc` намеренно не требует пустоты (это ровно тот грабель, который иначе «починят» неправильно).
- glossary: термин **Closure gate** — «блокирующая проверка на границе named lifecycle closure; строгое супермножество `mo-qc`; трёхзначный вердикт».

### 7.10 §15 Implementation slices — распределение без новых slices

- slice 2: `§B-LONGEVITY-05` + раздел `§A-BACKLOG-02` в `docs/architecture/backlog-notebook.md`; обновление списка ADR в `CLAUDE.md`/`README.md`.
- slice 3: §4.7 в backlog-lifecycle guidance и `methodology.md` §7; `make mo-closure`; контрактные файлы.
- slice 6: §8.3 в `project-setup.md` и `mo-setup/SKILL.md` (рядом с guide locator и git-ignore probe).
- slice 11: `tests/backlog-closure-gate.test.mjs`, CI-fixtures, anti-drift assertion, B36/B37.
- slice 13: финальное закрытие исполняет `make mo-closure`, а не `make mo-qc`.
- Ограничение порядка: gate вводится строго после slice 1 (migration checkpoint §3).

### 7.11 §16 Rejected и unsupported — добавить

- трактовка отсутствующего, нечитаемого или неканонического backlog как пустого — **forbidden**;
- unconditional empty-backlog check во всяком mid-feature QC — **rejected** (решение сохранено, §4.7 ссылается на него явно);
- признак «сейчас closure», выставляемый самим агентом (env var, файл-маркер, флаг) — **rejected** как скрытый state;
- изменение CI-конфигурации проекта агентом без явного подтверждения или вне `feature/meta-o-setup` — **forbidden**;
- изменение GitLab project settings, approval rules и merge checks агентом — **rejected**, человеческая граница;
- вывод coverage CI по имени файла, regex по YAML или по нераскрытому `include:` — **forbidden**;
- нормативная предопределённая CI-переменная, не подтверждённая на установленной версии, — **forbidden** (расширение §2.5 на CI-поверхность);
- новый исполняемый checker или конфиг-файл под путь backlog — **rejected** (D-19/D-20 сохранены).

### 7.12 §17 Open questions — добавить (read-only evidence при реализации)

- точное имя и семантика предопределённой переменной draft-состояния MR на установленной версии GitLab, а также источник pipeline для merged-results и merge-train пайплайнов; до подтверждения действует fail-closed вариант snippet;
- доступно ли поле конфигурируемого пути CI через установленную версию `glab` и под какой подкомандой;
- включён ли в целевом проекте server-side merge check; если нет — job advisory, и это сообщается человеку явно;
- имеет ли смысл симметрично распространить §8.3 на GitHub Actions (`pull_request` + push в default branch) тем же кодом резолва; по умолчанию — да, если конфигурация присутствует, но нормативен GitLab по формулировке пользователя.

### 7.13 §18 Decision Ledger

Новый `U-19`:

> Check the backlog for emptiness when a merge request is created and when a branch is merged into its base, return an error to the agent that the backlog must be closed before finalizing the work, wire this into QC or something similar at the mo-setup level, and recommend that mo-setup inspect GitLab CI YAML configs and propose adding this quality check there too.

Новые `D-*`:

| id   | Решение                                                                                                                                          | Статус   | Основание                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------- |
| D-47 | Blocking empty-backlog gate стоит на named closure boundary G1/G2/G3; mid-feature `make mo-qc` не изменяется                                     | adopted  | U-19; §4.7; §16 сохранён                           |
| D-48 | `make mo-closure` = `mo-qc` + одно утверждение о пустоте, исполняемое существующим `node --test`; новый исполняемый файл и конфиг не создаются     | adopted  | U-19; D-18/D-19/D-20; правило custom checker        |
| D-49 | Вердикт трёхзначный с precedence `unknown > not_empty > empty` и семью reason-кодами; typed failure — стабильный токен, не exit code             | adopted  | U-19; §4.7; §14                                     |
| D-50 | `mo-setup` обнаруживает CI-конфигурацию read-only с резолвом пути по доказательству и YAML AST, классифицирует coverage и предлагает минимальный snippet без записи | adopted  | U-19; §8.3; прецедент §8.2/D-46                     |
| D-51 | Server-side merge checks и project settings GitLab остаются человеческой границей; без них CI-job объявляется advisory явно                       | adopted  | U-19; `§B-HUMAN-01`, `§B-HUMAN-04`                  |
| D-52 | Признак closure не выставляется агентом: им служит объективная граница MR/merge и явный вызов named команды                                        | adopted  | U-19; D-20 (запрет state store)                     |

Ни одно из `U-01`…`U-18` и `D-01`…`D-46` не изменяется и не отменяется. Наиболее близкое, `D-02`, усиливается способом доказательства, но не меняет смысл: backlog как был notebook активной фичи, пустой в начале и конце, так и остался.

---

## 8. Допущения и открытые вопросы

**Допущения (взяты как наиболее консервативные, реализация обязана их подтвердить):**

1. Целевой репозиторий — Git с одним читаемым remote, host которого классифицируется по §4.1; иначе `platform: unsupported`.
2. Draft-состояние MR может оказаться нечитаемым публично; **по умолчанию считаем, что нечитаемо**, и snippet блокирует в том числе Draft. Это строже запрошенного, но не создаёт ложного зелёного.
3. Server-side «Pipelines must succeed» считается **выключенным**, пока обратное не прочитано; CI-job в отчёте называется advisory.
4. Раздел открытых записей в чужом проекте может называться иначе; заголовок берётся из контракта проекта, а не хардкодится, и его отсутствие — `missing_open_section`, а не попытка угадать синоним.
5. `make mo-closure` в чужом проекте реализуется в идиоме этого проекта; Meta-O нормирует контракт (трёхзначность, non-mutating, одна документированная команда, отсутствие проверки в обычном QC), а не реализацию — это следствие skills-first и распределения «один владелец source».
6. `markdown-it` и `js-yaml` уже зависимости репозитория; новые зависимости поправка не вводит.
7. Идентификаторы `§B-LONGEVITY-05`, `§A-BACKLOG-02`, `U-19`, `D-47`…`D-52` проверены на отсутствие во всей Git-истории; реализация обязана перепроверить их на момент коммита (§2.2).

**Открытые вопросы** перечислены в §7.12 и все имеют определённый fail-safe по умолчанию, поэтому ни один из них не блокирует принятие поправки в спецификацию.

### gpt56solmedium (proposal-2) — open, score 6.0/10, 0/2 adopt

## 1. Краткий подход

Добавить отдельный project-owned non-mutating gate `make mo-backlog-empty`, обязательный непосредственно перед созданием MR и повторно перед его слиянием. Не включать проверку фактической пустоты backlog в обычный `make mo-qc`: mid-feature QC продолжает принимать корректно оформленные временные записи, а `mo-setup` проверяет наличие gate, его контракт и предлагает defense-in-depth интеграцию в GitLab CI без изменения CI или project settings.

Поправка расширяет, но не отменяет решения исходной спецификации: `docs/backlog.md` остаётся branch-local notebook, Issues — долговечным sink, новый workflow engine/registry/receipt не появляется.

## 2. Нормативное положение gate в lifecycle

Gate обязателен в двух точках. Это именно `and`, а не альтернативные места.

### 2.1 Перед созданием MR

Порядок управляемого Meta-O lifecycle:

1. Executor завершает implementation и disposition всех записей backlog.
2. Durable knowledge переносится в business/architecture/acceptance/tests, подтверждённые out-of-scope работы — в Issues.
3. Временная spec/ledger/checklist удаляется по существующему completion contract.
4. Worktree должен быть чистым, `HEAD` — полным существующим commit.
5. На этом SHA проходит `make mo-qc`.
6. На том же SHA проходит `make mo-backlog-empty`.
7. Только после обоих успешных результатов разрешён write, создающий MR: например, `glab mr create` или эквивалентная native GitHub/hosting операция.

При `BLOCKED` или `UNKNOWN` команда создания MR не вызывается. Создание Draft MR исключением не является: managed Meta-O flow публикует MR только после закрытия feature backlog. Обычные commits, pushes, reviews и mid-feature QC этим не блокируются.

CI не может предотвратить само создание MR — pipeline появляется уже после него. Поэтому pre-create barrier принадлежит lifecycle skill/agent reasoning, а CI является дополнительным merge barrier.

### 2.2 Перед слиянием

Проверка выполняется повторно, даже если она уже прошла перед созданием MR:

1. Устанавливается текущий exact source SHA MR.
2. Подтверждается отсутствие новых commits и чистота соответствующего checkout.
3. На текущем SHA должны быть действительны QC, reviews и applicable E2E по существующим правилам.
4. Повторно выполняется `make mo-backlog-empty`.
5. Только после `PASS` разрешается native merge write.

Любое изменение source SHA инвалидирует оба результата так же, как сейчас инвалидирует QC и reviews. Если применяется merged-result pipeline или merge train, CI обязан проверить checkout фактического интегрируемого candidate, а не устаревший source snapshot.

Наличие человеческого решения «merge» не заменяет gate. Gate является техническим precondition и не даёт агенту самостоятельного разрешения на merge.

### 2.3 Обход управляемого lifecycle

Если MR создан вручную или другим инструментом без pre-create gate, это не делает MR недействительным, но merge остаётся запрещён до успешной повторной проверки. Для Web UI и иных внешних merge paths реальное техническое принуждение обеспечивается только required GitLab pipeline/project policy; локальная инструкция агента сама по себе не может запретить человеку нажать Merge.

## 3. Соотношение с `make mo-qc`

Сохраняется разделение трёх понятий:

| Проверка | Когда применяется | Допускает непустой backlog |
| --- | --- | --- |
| Backlog schema validation внутри `make mo-qc` | Каждый mid-feature запуск | Да, если все записи корректны |
| `make mo-backlog-empty` | Только named finalization transitions | Нет |
| QC плюс empty-backlog gate | Перед созданием MR и перед merge | Нет |

`make mo-qc` остаётся единственным авторитетным aggregate product-quality gate и не получает зависимость от `mo-backlog-empty`. Это сохраняет принятое решение «unconditional empty-backlog check во всяком mid-feature QC — rejected».

Реализация и fixture-тесты самого checker входят в `make mo-test` и тем самым в `make mo-qc`. Но `make mo-qc` проверяет корректность механизма, а не требует пустоты текущего feature backlog.

Не следует вводить `make mo-finalize`: он стал бы вторым aggregate gate и размыл бы существующий контракт. Lifecycle явно выполняет последовательность:

```text
make mo-qc
make mo-backlog-empty
```

Обе команды запускаются foreground, non-mutating и на одном неизменившемся SHA.

## 4. Компоненты и ответственность

### 4.1 Project-owned backlog checker

Для Meta-O это узкий checker в `tools/`, вызываемый Make target `mo-backlog-empty`. Для подключаемого проекта `mo-setup` предлагает эквивалентную project-owned реализацию, но публичное имя контракта остаётся одинаковым:

```text
make mo-backlog-empty
```

Checker:

- читает только `docs/backlog.md`;
- разбирает Markdown настоящей AST-библиотекой;
- ничего не записывает;
- не вызывает Git hosting, сеть или Issue tooling;
- не создаёт manifest, receipt, digest или baseline;
- не пытается сам закрывать записи;
- возвращает typed result через exit status и однострочный diagnostic.

Custom checker оправдан: линтер Markdown может проверить синтаксис, но не способен доказать семантическую пустоту конкретного AST-раздела и различить пустой, malformed и unreadable backlog.

### 4.2 Lifecycle consumers

`shared/references/methodology.md` владеет точками вызова:

- pre-MR-create barrier;
- pre-merge barrier;
- инвалидацией результата после нового commit;
- запретом вызывать write после `BLOCKED`/`UNKNOWN`.

`mo-orchestrate-orca` применяет эти правила в полном lifecycle. Любой Result/MR workflow, который фактически создаёт или сливает MR, обязан применять тот же contract непосредственно перед native write.

### 4.3 `mo-setup`

`mo-setup` не становится владельцем runtime gate. Он проверяет readiness проекта:

- существует ли документированный `make mo-backlog-empty`;
- является ли команда deterministic и non-mutating;
- различает ли она empty, non-empty и unknown states;
- не включена ли фактическая проверка пустоты в обычный `make mo-qc`;
- названы ли обе lifecycle-точки в project instructions;
- имеется ли GitLab CI и покрывает ли он merge-side gate;
- может ли setup доказать, что merge действительно требует успешный pipeline.

`mo-setup` только сообщает gaps и предлагает точные изменения. Tracked repair по-прежнему требует отдельной `feature/meta-o-setup`; CI, repository settings и personal configuration не изменяются автоматически.

## 5. Интерфейсы и модель результата

### 5.1 Внутренний интерфейс checker

Рекомендуемая сигнатура:

```ts
type BacklogGateCode =
  | "backlog_empty"
  | "backlog_not_empty"
  | "backlog_missing"
  | "backlog_unreadable"
  | "backlog_invalid";

type BacklogEntryRef = {
  heading: string;
  line: number;
};

type BacklogGateResult =
  | {
      schema: "meta-o.backlog-empty-gate.v1";
      verdict: "PASS";
      code: "backlog_empty";
      path: "docs/backlog.md";
      entryCount: 0;
    }
  | {
      schema: "meta-o.backlog-empty-gate.v1";
      verdict: "BLOCKED";
      code: "backlog_not_empty";
      path: "docs/backlog.md";
      entryCount: number;
      entries: BacklogEntryRef[];
    }
  | {
      schema: "meta-o.backlog-empty-gate.v1";
      verdict: "UNKNOWN";
      code: "backlog_missing" | "backlog_unreadable" | "backlog_invalid";
      path: "docs/backlog.md";
      detail: string;
    };

function checkBacklogEmpty(options: {
  projectRoot: string;
  backlogPath?: "docs/backlog.md";
}): BacklogGateResult;
```

Это ephemeral process output, не persisted evidence protocol.

### 5.2 CLI contract

```text
make mo-backlog-empty
```

Exit status:

| Exit | Verdict | Значение |
| --- | --- | --- |
| `0` | `PASS` | Canonical backlog доказанно пуст |
| `1` | `BLOCKED` | Backlog корректно прочитан и содержит открытые записи |
| `2` | `UNKNOWN` | Backlog отсутствует, нечитаем или malformed |

Минимальные сообщения:

```text
BACKLOG_GATE PASS code=backlog_empty path=docs/backlog.md entries=0
```

```text
BACKLOG_GATE BLOCKED code=backlog_not_empty path=docs/backlog.md entries=2
Закройте каждую запись: реализуйте её либо перенесите подтверждённую out-of-scope работу в canonical Issue до финализации.
```

```text
BACKLOG_GATE UNKNOWN code=backlog_invalid path=docs/backlog.md
Пустота backlog не доказана; восстановите canonical readable structure до финализации.
```

Заголовки и строки записей можно вывести следующими строками, но в сообщение не включается body: это снижает риск утечки чувствительного intake.

### 5.3 Семантика пустоты

`PASS` допустим только когда одновременно выполнено следующее:

- `docs/backlog.md` существует как читаемый regular file;
- содержимое является валидным UTF-8 Markdown;
- AST содержит ровно canonical `# Бэклог` и `## Открыто`;
- после `## Открыто` нет ни одной `###` entry;
- в открытом разделе нет абзацев, списков, code blocks, HTML comments или иных substantive AST nodes;
- нет дополнительных sibling sections, способных скрыть открытые записи вне canonical раздела.

Если существуют корректные `###` entries с обязательными полями `Причина.`, `Практическое влияние.`, `Следующий шаг.`, результат — `backlog_not_empty`.

Если структура неканонична, entry не содержит обязательного поля, содержимое лежит вне ожидаемого раздела или parser не может однозначно классифицировать документ, результат — `backlog_invalid`, а не `backlog_empty`.

Отсутствующий и нечитаемый файл всегда дают `UNKNOWN`. Они никогда не интерпретируются как «нет записей».

### 5.4 Привязка к SHA

Сам checker не создаёт Git-state protocol. Caller принимает его результат только если:

- `HEAD` до и после запуска одинаков;
- worktree чист;
- это тот же exact SHA, к которому относятся QC/reviews/E2E или текущий merge candidate.

Evidence остаётся в human-readable final result или CI log. Новый receipt не создаётся.

## 6. Что проверяет и предлагает `mo-setup`

### 6.1 Project contract

`mo-setup` выполняет read-only inspection и выдаёт отдельные setup findings:

| Code | Условие |
| --- | --- |
| `backlog_gate_missing` | Нет документированной команды `make mo-backlog-empty` |
| `backlog_gate_contract_invalid` | Команда не различает exit `0/1/2` или не использует AST |
| `backlog_gate_mutating` | Проверка изменяет worktree или dependencies |
| `backlog_gate_in_midfeature_qc` | `mo-qc` требует фактической пустоты текущего backlog |
| `backlog_lifecycle_gap` | Не названа одна из двух обязательных точек |
| `backlog_currently_nonempty` | Механизм исправен, но текущий backlog пока содержит entries |

`backlog_currently_nonempty` во время активной разработки — informational readiness state, а не запрет продолжать feature work. Blocking он становится только при pre-MR/pre-merge transition.

`mo-setup` предлагает:

- project-owned checker и target;
- fixture tests для всех verdicts;
- lifecycle instruction для обеих точек;
- CI job, если обнаружен GitLab;
- required-pipeline настройку как отдельное предложение, если её нельзя доказать локально.

### 6.2 Проверка non-mutating свойства

Setup фиксирует clean-status snapshot до и после пробного запуска. Для проверки `BLOCKED`/`UNKNOWN` variants используются только существующие unit fixtures или disposable copy — текущий backlog не переписывается.

## 7. GitLab CI discovery и предложение интеграции

### 7.1 Обнаружение

`mo-setup` действует консервативно:

1. По Git remote URLs определяет, что проект использует GitLab. Не делает вывод только из наличия установленного `glab`.
2. Проверяет tracked root candidates `.gitlab-ci.yml` и `.gitlab-ci.yaml`.
3. Если найден canonical entrypoint, разбирает YAML настоящим YAML parser.
4. Рекурсивно следует только по статически разрешимым project-local `include: local`.
5. Remote, project, component, template, wildcard или conditional includes фиксирует как неполную локальную видимость.
6. Если root config отсутствует, но GitLab remote существует, сообщает `gitlab_ci_config_unresolved`: custom CI path может быть задан в project settings, поэтому утверждать «CI отсутствует» нельзя.
7. Multiple candidates, malformed YAML, unreadable include или include cycle дают `UNKNOWN`, а не ложное заключение о coverage.

Содержимое произвольных YAML-файлов не сканируется как CI только по наличию ключей `stages`/`rules`.

### 7.2 Что считается покрытием

Coverage доказан, только если разрешённый effective local config содержит job, который:

- вызывает точный project-owned `make mo-backlog-empty`;
- запускается для merge-request pipelines;
- не помечен `allow_failure`;
- не ограничен только обычным branch push;
- находится в существующей подходящей quality/test stage либо сопровождается предложением добавить stage;
- не имеет очевидного `rules`/`only`/`except`, исключающего целевой MR;
- выполняется на candidate, допускаемом к merge.

Если используются merge trains или merged-result pipelines, job должен покрывать их фактическую pipeline форму. Setup не придумывает version-dependent GitLab variables: exact proposed rules сверяются с документацией/версией конкретного GitLab при реализации.

### 7.3 Форма предложения

`mo-setup` возвращает не общий совет, а proposed patch в отчёте:

- точный обнаруженный entrypoint/include file;
- существующую stage, куда предлагается добавить job;
- точную команду;
- предлагаемые MR rules;
- необходимость required-successful-pipeline policy;
- какие dynamic includes или project settings не позволили доказать enforcement.

Он не редактирует YAML, не вызывает GitLab API и не меняет merge settings.

Рекомендуемый job остаётся отдельным от общего QC job, чтобы failure явно сообщал `BACKLOG_GATE BLOCKED/UNKNOWN`. Если CI уже запускает `make mo-qc`, дублировать его в backlog job не требуется.

## 8. Изменения business и architecture

### 8.1 Business

Расширить планируемое изменение `§B-LONGEVITY-04`:

> Пустота feature backlog является обязательным техническим precondition двух finalization transitions: публикации MR и слияния текущего candidate в base. Обычная разработка и mid-feature QC допускают корректно оформленные временные записи. Отсутствующий, нечитаемый или неоднозначный backlog не считается пустым.

Новый business identifier не нужен: это механизм исполнения уже принятого outcome U-02, а не новая бизнес-цель. Существующая authorization semantic reuse `§B-LONGEVITY-04 via §A-BACKLOG-01` должна охватывать эту границу.

### 8.2 Architecture

Расширить `§A-BACKLOG-01` в `docs/architecture/backlog-notebook.md`:

- canonical AST empty semantics;
- project-owned checker и exit contract;
- две обязательные lifecycle barriers;
- fail-closed поведение;
- разделение schema QC и closure gate;
- CI как defense in depth;
- отсутствие receipt/state store.

В таблице §2.2 исходной спецификации consumer list для `§A-BACKLOG-01` расширить до:

```text
methodology, mo-setup, MR/result workflows, closure review and optional GitLab CI
```

`§A-ORCHESTRATION-01` не меняется: checker является deterministic project-quality command, а не workflow engine.

## 9. Acceptance и E2E

### 9.1 Acceptance mapping

Добавить требования:

| Требование | Детерминированное доказательство | Live-доказательство |
| --- | --- | --- |
| MR write не начинается без empty-backlog PASS на exact SHA | Lifecycle contract test проверяет ordering и abort для exit 1/2 | Skill eval возвращает typed error и не вызывает MR write |
| Merge требует повторной проверки актуального SHA | Contract fixtures моделируют изменившийся MR head | Реальный finalization flow фиксирует повторный PASS |
| Empty checker fail-closed | Temp-repository fixtures для empty, entry, missing, unreadable и malformed | Не требуется |
| Mid-feature QC допускает корректную временную entry | Fixture запускает `make mo-qc` с valid non-empty backlog | Не требуется |
| Setup обнаруживает GitLab CI и предлагает job без записи | YAML fixtures: root, local include, remote include, malformed, absent/custom-unknown | `mo-setup` report на реальном GitLab project |
| CI gate действительно является merge barrier | Static job/rules assertions плюс явная unknown boundary project settings | Реальный MR pipeline, когда существует настоящая feature MR |

### 9.2 Deterministic fixtures

Минимальный набор:

- canonical empty → exit `0`;
- одна valid entry → exit `1`;
- несколько entries → exit `1`;
- missing file → exit `2`;
- unreadable/non-regular file → exit `2`;
- malformed headings → exit `2`;
- paragraph/comment под `## Открыто` без entry → exit `2`;
- entry без одного обязательного поля → exit `2`;
- `make mo-qc` с valid non-empty fixture остаётся зелёным;
- checker не меняет bytes, mode, mtime-relevant tracked state или Git status;
- MR/merge command spy не вызывается после exit `1` или `2`;
- новый SHA требует новый gate run.

### 9.3 Новые E2E scenarios

Добавить после B35:

- **B36 — Managed MR finalization.** При valid non-empty backlog orchestrator получает `backlog_not_empty`, не вызывает MR create и продолжает remediation. После disposition и нового SHA gate проходит, и только затем разрешается реальный MR create.
- **B37 — Merge recheck.** После создания MR source SHA изменяется; старый result отвергается, gate повторяется на новом SHA, merge write не происходит до `PASS`.
- **B38 — GitLab CI setup inspection.** `mo-setup` называет обнаруженный entrypoint/include graph, отличает proven coverage от unreadable/incomplete config и предлагает exact job без изменения файлов или settings.

B36/B37 не требуют dummy external writes. Negative path доказывается до write через observable absence вызова. Positive external write засчитывается только в настоящем feature/MR lifecycle; при отсутствии такого lifecycle live outcome — `NOT_APPLICABLE`, а не синтетический MR.

## 10. Поправки к implementation slices

Существующие slices сохраняются. Дополнить их так:

- Slice 2: включить finalization semantics в `§B-LONGEVITY-04` и `§A-BACKLOG-01`.
- Slice 3: добавить AST empty-check contract и lifecycle error guidance.
- Slice 6: расширить `mo-setup` project/CI inspection.
- Slice 11: добавить checker, lifecycle, CI-discovery fixtures и B36–B38 contracts.
- Slice 13: перед созданием MR и повторно перед merge выполнить `make mo-backlog-empty` на соответствующем exact SHA.

Сам checker является реализацией и в текущую specification-only работу не входит.

## 11. Рассмотренные альтернативы

1. **Включить пустоту в каждый `make mo-qc`.** Отклонено: блокирует нормальные промежуточные записи и противоречит принятому D-18/D-19 и явному rejected решению исходной спеки.

2. **Проверять только один раз перед completion.** Отклонено: backlog или SHA могут измениться между созданием MR и merge.

3. **Проверять только в GitLab CI.** Отклонено: CI не способен предотвратить создание MR и не покрывает GitHub/local workflows.

4. **Использовать pre-commit/pre-push hook.** Отклонено: блокирует активную разработку, зависит от user-local state и не гарантирует server-side merge.

5. **Автоматически очищать backlog или создавать Issues.** Отклонено: checker перестал бы быть non-mutating, а disposition требует evidence и reasoning.

6. **Считать отсутствующий backlog пустым.** Запрещено: отсутствие evidence не является `PASS`.

## 12. Риски и mitigations

- **MR создан вне Meta-O.** Merge-side CI и обязательный повторный lifecycle gate сохраняют защиту.
- **Required pipeline не включён в GitLab settings.** Setup сообщает `gitlab_merge_enforcement_unverified`; YAML job не объявляется blocking enforcement без доказательства settings.
- **Dynamic includes скрывают job или rules.** Результат `UNKNOWN`; setup предлагает интеграцию в видимый project-owned entrypoint, но не утверждает coverage.
- **Draft MR нужен для ранней коммуникации.** Managed Meta-O flow его не создаёт до closure; разработка и pushes остаются разрешены. Внешне созданный Draft MR не может быть слит до gate.
- **Base branch изменилась после source check.** Merge-result pipeline/merge train повторяет gate на интегрируемом candidate; при отсутствии такой возможности merge readiness остаётся недоказанной.
- **Malformed backlog маскирует записи.** AST validation возвращает `backlog_invalid`, никогда `PASS`.
- **Checker превращается в workflow helper.** Его граница ограничена одной read-only функцией над одним project file; routing, Issue writes и lifecycle state остаются в skills/reasoning.
- **Два «главных QC».** `mo-qc` остаётся product-quality gate; `mo-backlog-empty` называется lifecycle closure gate и не агрегирует другие проверки.

## 13. Дополнение Decision Ledger

Добавить:

| id | Решение | Статус | Основание |
| --- | --- | --- | --- |
| U-19 | Require a project-owned non-mutating empty-backlog gate before MR creation and again before merge; make mo-setup inspect and propose GitLab CI enforcement without changing CI. | adopted | Новое пользовательское требование |
| D-47 | Обе точки — pre-MR-create и pre-merge — обязательны; результат привязан к exact SHA | adopted | U-19; `§A-BACKLOG-01` |
| D-48 | `make mo-backlog-empty` отделён от ordinary `make mo-qc` | adopted | U-02, U-19; сохранение mid-feature notebook |
| D-49 | Exit `0/1/2` различает empty, non-empty и unknown; missing/unreadable/malformed fail closed | adopted | U-19; `§A-ORCHESTRATION-03` |
| D-50 | `mo-setup` проверяет command/lifecycle/CI readiness и только предлагает изменения | adopted | U-19; существующая setup authority |
| D-51 | GitLab CI job применяется к MR pipeline и становится реальным merge barrier только вместе с required-pipeline policy | adopted | U-19 |
| D-52 | Gate не создаёт receipt, registry или persisted evidence | adopted | `§A-ORCHESTRATION-01/03` |
| D-53 | Пустота во всяком mid-feature `make mo-qc` | rejected | Блокирует активную разработку |
| D-54 | Только CI или только один lifecycle check | rejected | Не покрывает обе finalization boundaries |

## 14. Assumptions и open questions

Открытых продуктовых вопросов нет.

Приняты консервативные assumptions:

- «закрытие ветки» означает merge в base, а не удаление Git ref;
- canonical feature backlog остаётся `docs/backlog.md`;
- managed Meta-O flow не создаёт ранние Draft MR;
- GitLab CI даёт defense in depth для merge, но не может блокировать создание объекта MR;
- точные GitLab `rules` и merge-train variables должны быть проверены против установленной версии при реализации;
- при недоступных project settings `mo-setup` сообщает непроверенное enforcement, а не считает наличие YAML job достаточным.

