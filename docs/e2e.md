# Сквозная проверка

`make mo-qc` — детерминированный product gate. `make mo-e2e` намеренно не запускает
agentic-сценарии: он печатает точку входа этого документа и выходит с кодом 2. Live actor выполняет
применимые сценарии на одном именованном полном candidate SHA, не меняет его и сообщает понятное
человеку evidence.

## Общее evidence

Каждый сценарий фиксирует backend, версию control, discovery companion skill, harness/model vendor,
requested/effective route/model/effort, точный candidate SHA, действие, наблюдаемый публичный
результат и `PASS`, `FAIL` или `UNKNOWN`. Отсутствующий полный вердикт — `UNKNOWN`; такой сценарий
повторяется, частичного pass нет. Private provider transcripts, hook stores и inferred session
databases запрещены как evidence.

Используйте normal settled-response fixture и fixture на три-четыре экрана с узнаваемыми markers
`BEGIN`, `MIDDLE` и `END`. Whole-session view проверяется отдельно как диагностика.

## Сценарии backend

Выполните эту матрицу для Orca:

| ID  | Сценарий                                                       | Доказательство                                                                    |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| B1  | Найти точный instance и working directory.                     | Native status/list output идентифицирует оба.                                     |
| B2  | Запустить Codex unsandboxed.                                   | Public readiness и effective posture.                                             |
| B3  | Запустить Claude Code unsandboxed.                             | Public readiness и effective posture.                                             |
| B4  | Запустить OpenCode unsandboxed.                                | Public readiness и effective posture.                                             |
| B5  | Передать начальный `/goal` и обычный follow-up.                | Оба появляются ровно один раз и дают разные settled responses.                    |
| B6  | Задать и ответить на обычный и harness-UI вопрос.              | Оба public pending states/requests и оба точных reply paths.                      |
| B7  | Различить working, completed, pending question и failed/lost.  | Native state observations для всех четырёх.                                       |
| B8  | Получить полный normal settled response.                       | Точный ожидаемый ответ, не terminal inference.                                    |
| B9  | Получить полный long settled response.                         | Начальный, средний и конечный markers целы.                                       |
| B10 | Прочитать whole-session output.                                | Документированная diagnostic command достигает видимого output.                   |
| B11 | Параллельно запустить двух изолированных reviewers.            | Разные sessions, один SHA, разные vendors, нет peer bytes.                        |
| B12 | Атомарно передать пару reviews.                                | Два неизменённых private files доходят executor одним ordinary message.           |
| B13 | Выполнить standalone backend review.                           | Backend-specific review entry создаёт только двух reviewers.                      |
| B14 | Раздельно обнаружить отсутствующие control и companion.        | Actionable readiness output называет отсутствующий элемент.                       |
| B15 | Различить native auth, account cache и live launch.            | Freshness и exact effective identity; stale cache не требует re-login.            |
| B16 | Разбудить blocking wait early и обработать quiet timeout.      | Event будит wait; timeout создаёт один checkpoint без restart.                    |
| B17 | Различить quota, capacity, reconnect, compaction и refusal.    | Для каждого состояния отдельный typed outcome и recovery.                         |
| B18 | Сохранить hot executor/reviewers в remediation.                | Follow-up приходит в те же exact sessions без peer bytes.                         |
| B19 | Запустить fresh final review pair.                             | Новые sessions не получают prior reports и дают два PASS одному SHA.              |
| B20 | Сверить TUI projection с полным `worker_done`.                 | Один `Review-Execution`, SHA и verdict; полный report остаётся source.            |
| B21 | Не повторить `unknown_effect` и не затронуть foreign resource. | Effect остаётся unknown; exact-owned cleanup сохраняет соседние ресурсы.          |
| B22 | Выполнить critical Qwen/OpenCode profile.                      | Три deterministic runs и один live small-feature lifecycle без invariant failure. |
| B23 | Сохранить stable titles и exact-owned cleanup.                 | Standalone/full lifecycle не затрагивает foreign resources.                       |
| B24 | Заблокировать delivery в trust UI или shell prompt.            | Task bytes отправлены ровно один раз только после positive readiness.             |
| B25 | Применить run-wide wait cadence.                               | Early event, quiet timeout и два transport failures различены.                    |
| B26 | Прочитать два version-matched Orca guides.                     | Один binary отдаёт непустые `orchestration` и `orca-cli`; install не вызван.      |
| B27 | Показать default recommendation и полный catalog.              | Coding evidence объяснено; Astra/Fable доступны только в full list.               |
| B28 | Передать pair до cleanup.                                      | Consumer проверяет оба size/end marker и подтверждает acknowledgement.            |
| B29 | Сохранить hot remediation и fresh final pair.                  | FINDINGS sessions живы; final sessions не видели prior reports.                   |
| B30 | Не активировать `mo-*` на near-miss prompt.                    | Generic review/setup request не создаёт Meta-O actors.                            |
| B31 | Ограничить повтор handoff.                                     | Одна re-delivery, затем `UNKNOWN` с сохранённым namespace.                        |
| B32 | Собрать eval evidence v3.                                      | Required matrix полна; desired availability не заменяет critical B22.             |
| B33 | Выполнить read-only Issue discovery.                           | Host, limits, open/closed search и truncation доказаны native CLI.                |
| B34 | Получить canonical reviewer PASS.                              | Непустые grounding/checks/unknowns/risks и пусты только finding sections.         |
| B35 | Доказать tracked ignore для `.orca/` и `spec/`.                | `check-ignore` source подтверждён через `git ls-files`.                           |
| B36 | Применить G0.                                                  | Non-empty/unknown блокирует substantive implementation после migration.           |
| B37 | Применить GC и G1.                                             | Completion/MR create блокируются; remote head обязан совпасть.                    |
| B38 | Применить G2.                                                  | Merge связан с current head; synthetic candidate проверен в hosting checkout.     |
| B39 | Проверить GitLab CI coverage.                                  | Typed `CI-Coverage/1`, exact patch, без mutation.                                 |
| B40 | Проверить GitHub Actions coverage.                             | PR/merge_group и required policy различены, YAML не меняется.                     |
| B41 | Сохранить same-project reviewer resources.                     | Registration set неизменен; folder negative case typed unsupported.               |
| B42 | Убрать только owned partial start.                             | Foreign handles сохранены, incomplete cleanup передан человеку.                   |

## Model actors для eval skills

Каждый model-backed case сначала доказывает применимость: named behavior нельзя
равноценно проверить deterministic fixture. Для обычного skill выполняются три
bounded positive/forbidden/degraded cases на `claude/opus[1m]/low` и
`codex/gpt-5.6-sol/low`. Desired Codex `gpt-5.6-luna/max` и OpenCode/Qwen
coordinates всегда materialize'ятся минимум как `not_available`. Неприменимый
case получает `not_applicable`; отсутствующая required настройка —
`blocked|not_run`. Fallback нет. Qwen из B22 остаётся отдельным критическим
orchestration actor.

### Embedded corpus и live-команда

Каждый installable skill владеет `evals/cases.json` v2 с тремя bounded cases:
`positive`, `forbidden`, `degraded`, каждый со списком `contracts`.
`make mo-eval-cases` проверяет точный набор
из 8 skills / 24 cases offline и ничего не запускает. Generated skill получает
тот же corpus через обычный `make skills`.

Live-run выполняется из чистого checkout frozen candidate. Сначала runner
создаёт один bounded prompt с instruction bundle, неизменяемыми входными
metadata и незаполненными execution/result полями. Модель получает effective
identity только из native harness result и возвращает JSON evidence v3 envelope
с `tier` и `matrixProfile`:

```bash
node tools/skill-evals.mjs --prompt <skill> \
  --candidate <full-sha> \
  --tier <required|desired|critical> --matrix-profile <name> \
  --route <route> --model <provider/model> --effort <level> \
  --harness <name> --harness-version <version> \
  --profile-version <profile-version> --quantization <value> \
  --context <value> --sampling <value> \
  --tool-permissions <comma-separated> --repetition 1
```

Prompt передают user-approved harness без изменения checkout. Ответ сохраняют
во внешнем untracked JSON-файле и проверяют:

```bash
node tools/skill-evals.mjs --validate-evidence <evidence.json> \
  --candidate <full-sha> --require-all \
  --critical-profile <configured-orchestrator-route/model/effort>
```

Validator связывает evidence с Git tree revision каждого skill и digest точных
case/requested/harness inputs, требует native execution id/interval/exit status,
observed effective identity и отдельное evidence для каждого `must`/`mustNot`
oracle. `--require-all` требует все 32 coordinates: required и desired для
каждого из 8 skills; desired отсутствие сохраняется envelope с
`NOT_AVAILABLE`, а не пропуском. Такой envelope несёт `effective: null`,
ненулевой exit code native availability probe и typed reason; он не выдумывает
harness version или effective model. `PASS` не предзаполняется и невозможен при
пустом observation или неподтверждённом oracle. Critical identity сравнивается
с явно переданным user-owned orchestrator profile, а не с hard-coded display
label. Полные
transcripts, secrets и absolute machine paths запрещены. Любой `FAIL`, `UNKNOWN` или
`NOT_RUN` делает live-команду ненулевой. Обоснованный
`NOT_APPLICABLE` обязан содержать observation с применённым правилом и остаётся
валидным завершением неприменимого case; для advisory cases инженер отдельно
решает semantic finding, но executable safety/contract failure остаётся
блокирующим. Evidence хранится в текущем run/final result, не в Git.

## Сценарии watchdog

| ID  | Сценарий                        | Доказательство                                                           |
| --- | ------------------------------- | ------------------------------------------------------------------------ |
| W1  | Read-only observe одной сессии. | Точный locator и classified native state; prompt не отправлен.           |
| W2  | Scan доступных Orca-сессий.     | У каждой сессии свой native locator и state; пустая поверхность названа. |
| W3  | Nudge одной разрешённой цели.   | Stable native state разрешает одно nonblocking exact message.            |
| W4  | Подавить небезопасный повтор.   | Изменённое state или неизменившийся duplicate блокирует delivery.        |

## Сценарии установки

Локальная установка в disposable-окружение должна доказать точный набор самодостаточных скилов с
принадлежащими им references/scripts. Remote installation выполняет владелец проекта после
публикации; workflow не делает push ради fixture.

## Carry-forward только для документации

E2E можно перенести на более поздний docs-only commit, только если оба reviewer финального SHA явно
подтвердили, что изменение не влияет на executable behavior, skill или agent instructions,
acceptance или этот контракт. Финальный отчёт называет проверенный SHA и причину. При любом сомнении
E2E запускается заново.
