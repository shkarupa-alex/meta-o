# Сквозная проверка

`make mo-qc` — детерминированный product gate. `make mo-e2e` намеренно не
запускает agentic-сценарии: он печатает точку входа этого документа и выходит с
кодом 2. Live actor выполняет применимые сценарии на одном именованном полном
candidate SHA, не меняет его и сообщает понятное человеку evidence.

## Общее evidence

Каждый сценарий фиксирует backend, версию control, discovery companion skill,
harness/model vendor, точный candidate SHA, действие, наблюдаемый публичный
результат и `PASS`, `FAIL` или `UNKNOWN`. Отсутствующий полный вердикт —
`UNKNOWN`; такой сценарий повторяется, частичного pass нет. Private provider
transcripts, hook stores и inferred session databases запрещены как evidence.

Используйте normal settled-response fixture и fixture на три-четыре экрана с
узнаваемыми markers `BEGIN`, `MIDDLE` и `END`. Whole-session view проверяется
отдельно как диагностика.

## Сценарии backend

Выполните эту матрицу для Herdr, Orca и Paseo:

| ID  | Сценарий                                                      | Доказательство                                                          |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| B1  | Найти точный instance и working directory.                    | Native status/list output идентифицирует оба.                           |
| B2  | Запустить Codex unsandboxed.                                  | Public readiness и effective posture.                                   |
| B3  | Запустить Claude Code unsandboxed.                            | Public readiness и effective posture.                                   |
| B4  | Запустить OpenCode unsandboxed.                               | Public readiness и effective posture.                                   |
| B5  | Передать начальный `/goal` и обычный follow-up.               | Оба появляются ровно один раз и дают разные settled responses.          |
| B6  | Задать и ответить на обычный и harness-UI вопрос.             | Оба public pending states/requests и оба точных reply paths.            |
| B7  | Различить working, completed, pending question и failed/lost. | Native state observations для всех четырёх.                             |
| B8  | Получить полный normal settled response.                      | Точный ожидаемый ответ, не terminal inference.                          |
| B9  | Получить полный long settled response.                        | Начальный, средний и конечный markers целы.                             |
| B10 | Прочитать whole-session output.                               | Документированная diagnostic command достигает видимого output.         |
| B11 | Параллельно запустить двух изолированных reviewers.           | Разные sessions, один SHA, разные vendors, нет peer bytes.              |
| B12 | Атомарно передать пару reviews.                               | Два неизменённых private files доходят executor одним ordinary message. |
| B13 | Выполнить standalone backend review.                          | Backend-specific review entry создаёт только двух reviewers.            |
| B14 | Раздельно обнаружить отсутствующие control и companion.       | Actionable readiness output называет отсутствующий элемент.             |

## Сценарии watchdog

| ID  | Сценарий                        | Доказательство                                                           |
| --- | ------------------------------- | ------------------------------------------------------------------------ |
| W1  | Read-only observe одной сессии. | Точный locator и classified native state; prompt не отправлен.           |
| W2  | Scan всех доступных backend.    | У каждой сессии свой native locator и state; пустая поверхность названа. |
| W3  | Nudge одной разрешённой цели.   | Stable native state разрешает одно nonblocking exact message.            |
| W4  | Подавить небезопасный повтор.   | Изменённое state или неизменившийся duplicate блокирует delivery.        |

## Сценарии установки

Локальная установка в disposable-окружение должна доказать ровно десять
самодостаточных скилов с принадлежащими им references/scripts. Remote installation
выполняет владелец проекта после публикации; workflow не делает push ради fixture.

## Carry-forward только для документации

E2E можно перенести на более поздний docs-only commit, только если оба reviewer
финального SHA явно подтвердили, что изменение не влияет на executable behavior,
skill или agent instructions, acceptance или этот контракт. Финальный отчёт
называет проверенный SHA и причину. При любом сомнении E2E запускается заново.
