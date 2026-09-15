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