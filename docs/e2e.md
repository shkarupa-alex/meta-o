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

## Model actors для eval skills

Каждый model-backed case сначала доказывает применимость: named behavior нельзя равноценно проверить
deterministic fixture. Для обычного skill выполняются 2–3 bounded positive/forbidden/degraded cases.
Claude использует `sonnet5/low`, Codex — `gpt-5.6-terra/low`, OpenCode comparator — настроенную
effective identity `deepseek 4 flash`. Неприменимый case получает `not_applicable`; отсутствующая
настройка — `blocked|not_run`. Более дорогого fallback нет. Qwen из B22 остаётся отдельным
критическим orchestration actor.

### Embedded corpus и live-команда

Каждый installable skill владеет `evals/cases.json` с тремя bounded cases:
`positive`, `forbidden`, `degraded`. `make mo-eval-cases` проверяет точный набор
из 8 skills / 24 cases offline и ничего не запускает. Generated skill получает
тот же corpus через обычный `make skills`.

Live-run выполняется из чистого checkout frozen candidate. Сначала runner
создаёт один bounded prompt с instruction bundle и уже заполненной metadata
матрицей; модель должна вернуть только JSON evidence envelope:

```bash
node tools/skill-evals.mjs --prompt <skill> \
  --candidate <full-sha> \
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
  --candidate <full-sha> --require-all
```

Validator связывает evidence с Git tree revision каждого skill, требует ровно
три case result, равенство requested/effective identity, low-cost testing policy,
Qwen/OpenCode для critical orchestrator, полную metadata harness и отсутствие
secret/transcript/absolute-machine-path fields. Любой `FAIL`, `UNKNOWN`,
`NOT_RUN` или `NOT_APPLICABLE` делает live-команду ненулевой; для advisory cases
инженер отдельно решает semantic finding, но executable safety/contract failure
остаётся блокирующим. Evidence хранится в текущем run/final result, не в Git.

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
