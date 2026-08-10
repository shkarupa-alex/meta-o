# Task description

The following is the user's problem statement, preserved without choosing a
solution in advance.

## Initial report

- когда в herdr создаем исполнителя/ревьюреов хочу чтобы исполнитель запускался в соседней вертикальной панели, а ревьюеры в отдельной вкладке в двух вертикальных панелях
- оркестратор стал сам читать спеку и проверять можно ли ее выполнить - так не надо, это должен делать исполнитель
- а потом когда оркестратор забрал замечания от ревьюера - стал их проверять по коду сам // так не надо, он только копипастить должен в исполнителя
- herdr оркестратор вместо запуска клода/кодекса для ревью внутри новых herdr-панелей запустил их как-то иначе что я их в herdr не вижу (видимо силами своего shell exec) - это неправильно. даже если мы можем прочитать только 1000 строк этого достаточно. весь смысл в экономии кеша - повторный запрос в ту же интерактивную сессию сильно дешевле чем новый инстанс. если есть еще проблемы - давай обсуждать. и опять же ui/визуальную наблюадемость - об этом яявно написано в бизнес-требованиях. а если в herdr нас что-то не устраивает - надо понять что и создать issues
- еще заметил что часто агент когда в herdr что-то отправляет забывает отправить <enter>
- оркестратор ведет сейчас себя как исполнитель: он постоянно меня спрашивает, выдает диалог с вариантами - это плохо. оркестратор долежен меня заменять, я не хочу быть ему нянькой. пусть принимает ответственность и управляет процессом
- агент в беклог пишет и сделанное и не сделанное, а надо только несделанное ("Инструкции такой нет — раздел «Закрытые» я придумал сам")
- агент создал changelog.md хотя я его не просил - по идее не нужен этот файл
- оркестратор не смог определить доступные модели

  > Про модели честно: codex/gpt-5.6-sol/medium проверен по каталогу codex, а claude/opus/high записан непроверенным — @anthropic-ai/claude-agent-sdk не установлен, каталог claude недоступен, так что это пробел в листинге, а не подтверждённый id.

  надо делать также как сделано в нашем скиле брейншторма - там все sdk бандлятся нормально /Users/alex/bitrix/skills/src/brain-council
- агент в docs/ начал создавать кучу ненужного: например в одном проекте я заменял 4 readme в подпапках на 1 корневой - он и про это доку создал
- когда мы в herdr запускаем скилл оркестратора хочу чтобы он переименовывал вкладку?
- похоже надо в оркестраторе когда он запустил исполнителя первый раз в работу чтоб оркестратор сам советовал пользователю каким (коротким) промптом с `/goal` надо его заставлять делать задачу (возможно это сократит количество вопросов к пользователю), или вообще стартовый промпт какой-то придумать и им запускать оркестратор в работу
- вот такое я бы добавил в правила, вероятно в agents.md/claude.md поскольку исполнитель работает у нас без скилов

  ```text
  ## Version control

  Never develop directly on `main`, `master`, `develop`, or `default`. Create each task branch from an up-to-date `develop` using `feature/<short-slug>` and use it for the whole task.
  Run the relevant checks before committing. Commit every coherent, independently verifiable increment instead of accumulating the whole task in one commit. Use `<type>: <what changed and why>` with `feat`, `fix`, `refactor`, `test`, `docs`, or `chore`. Reference an issue or specification when one exists, but neither is required. End every agent-authored commit with new line and executor harness model: `Assisted-by: {model}`
  The final verified result is one full Git SHA. Any subsequent commit invalidates its review and verification gates.
  ```

- надо продумать правильные рекоммендации как оркестратору ждать исполнителя/ревьюреов чтобы он по часу не тупил (думаю если нужны интервалы то адекватные - 5-10 минут)

  > Что я сделал не так. Я взвёл ожидание в 20:06 с условием из трёх частей: исполнитель не working, дерево чистое и HEAD != 216eb7b. Последнее условие было невыполнимым уже в момент постановки: коммит 216eb7b датирован 20:05:11, и он же оказался финальным кандидатом, а не промежуточным. Я прочитал в панели «11 из 14» и сделал вывод, что впереди ещё один коммит, — экран был устаревшим на момент чтения. Дальше цикл честно ждал события, которого не могло произойти. Сколько бы я ждал. Цикл — 55 итераций по 60 секунд, то есть до 21:01. Там он напечатал бы TIMEOUT и разбудил меня принудительно. Так что да, я бы сам увидел — но примерно на 47 минут позже, чем следовало, и увидел бы через отчёт о неудачном ожидании, а не через нормальное срабатывание. Почему это вообще произошло. Я ждал производный признак (появление нового SHA) вместо прямого (исполнитель остановился и дерево чистое). Два из трёх моих условий выполнились почти сразу; я сам добавил третье, ложное, и оно всё заблокировало. Правильное условие здесь — «состояние не working и дерево чистое», а какой при этом SHA — я и так вижу, когда просыпаюсь.

The relevant existing business framing is in
`docs/references/my-opinion.md`, especially the sections about the thin
orchestrator, persistent visible sessions, meta-harness requirements, review
handoff, and human involvement.

## Clarifications

The user previously launched ordinary Claude or Codex CLI processes in Herdr
panes and asked the orchestrator to manage them. The desired result is ordinary
subscription-backed CLI sessions that remain visible and directly accessible to
the user; the design must not assume that a particular current Herdr command is
itself the requirement.

The orchestrator must not read specifications. It manages the process only, and
its context must not be filled with large documents. It must not read code or
independently assess implementation feasibility or review findings.

Latest user clarification, superseding the commit-attribution sentence in the
initial report:

> я тут долго думал и понял что не нужен нам Assisted by в коммитах
> убери упоминания этого из спеки

## Project constraints

Follow the repository contract in `AGENTS.md`. In particular, skills and
reasoning are the orchestration layer; no new orchestration CLI, daemon, state
store, adapter layer, manifest, receipt, digest, or baseline is introduced
without a named external consumer and a recorded architecture reason. Authored
skill sources live under `src/skills/`; `skills/` is built and never edited.

This is a design task. Produce an implementation-ready, decomposition-ready
proposal that decides how the affected requirements should fit together, names
any genuine Herdr capability gap that should become an upstream issue, and avoids
inventing project documentation or bookkeeping that the user did not request.

## Later user intents (verbatim)

> /goal выполни разработку /Users/alex/Develop/meta-o/spec/2026-08-08-herdr-orchestrator-operational-corrections/spec-review.md и через clean-room subagent review добейся отстуствия замечаний

> тебе не надо использовать скилл mo-herdr сейчас

> Такой вопросик. В My Opinion посмотри, есть ли там раздел или ещё?
> Про то, что нужно дословно передавать интенты пользователю.
> Смысл в том, что я неоднократно наблюдаю большую проблему, что те интенты, которые пользователь высказывает, они в финальную спеку не попадают. То есть, нужно, чтобы, если пользователь какой-то, на какой-то вопрос ответил или какое-то мнение высказал, чтобы это дословно попадало в спеку обязательно. Вот есть там такое сейчас или нет?

> давай укажем что и в спеку все интенты пользователя должны попадать дословно

> я тут долго думал и понял что не нужен нам Assisted by в коммитах
> убери упоминания этого из спеки
