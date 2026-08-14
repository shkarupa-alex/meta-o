# Why Meta-O exists

Two halves, and they must not be merged. **Part 1** is the business framing: what
the user asked for, in their own words, kept verbatim and appended to as they say
more. **Part 2** is the durable theses derived from it, in terms that have nothing
to do with how anything is built; every decision in `docs/architecture/` cites one
of those.

The framing is the half that gets quietly "tidied" into a summary, and a summary
is exactly what cannot be re-read after the compression. The rules are in
`shared/references/methodology.md` section 2.

---

## Part 1 — the business framing

Every request and clarification below is the user's message **as it was sent**:
same language, same line breaks, nothing joined, nothing shortened. Where a
message was a hand-off of review findings rather than a statement of intent, the
instruction is quoted and the findings themselves are not: they are evidence, they
travelled to the author verbatim by their own rule, and they live in the change
that closed them. What is not allowed here is a summary standing in for something
the user actually said.

The first draft of this section broke that on the day it was written — line breaks
replaced by `/`, three of four clarifications rendered as a sentence about them.
It was rewritten from the session transcript. That is worth leaving on the record,
because it is the exact failure the rule exists to prevent, committed by the party
that wrote the rule.

### 1. The request that produced this generation — 2026-08-05

> @spec/2026-07-24-ai-driven-development-workflow/README.md - вот эту спеку мы уже реализовали
> но я просмотрел и в ней были сбиты акценты и получилось слишком "толсто"
>
> вот новая спека @spec/2026-08-05-ai-driven-development-workflow-revision/2026-08-05-ai-driven-development-workflow-revision-council-brainstorm.md
> читай и превращай то что уже есть в то что надо по этой спеке
> ничего не откладывай напотом

### 2. Clarification — the model catalogs

> на всякий случай уточню: для получения списка моделей ты же использовал js/ts sdk наших cli агентов?
> типа как тут /Users/alex/bitrix/skills/dist/brain-council

This corrected a real defect rather than asking a question: two of the three
catalog probes had been guessed, and one of them — `claude models` — starts an
agent turn on the prompt "models".

### 3. Decision — the shipped licence

Asked as a question with three options, because a licence is the user's to choose:

> Новая спека (§19) требует `dist/LICENSE` в поставке, но в репозитории сейчас нет
> файла лицензии (`package.json` говорит UNLICENSED). Какую лицензию класть?

Answer: **MIT**, copyright Shkarupa Alex.

### 4. Standing instruction — review findings

Six rounds of independent reviews were handed over, each introduced only by its
own line and nothing else. The first:

> ниже 2 ревью

The second, and then four more rounds under a bare `## Findings` heading:

> Новые находки

No triage instruction accompanied any of them. Read together with "ничего не
откладывай напотом" from the first message, the standing expectation is that every
real finding is closed in the same change.

### 5. The framing rule itself

From the user's own notes in `docs/references/my-opinion.md`, which is where this
requirement entered the project:

> Поэтому спека не должна быть единственным источником пользовательского намерения.

and, naming the artefact this file is:

> Этот материал я называю **бизнес-постановкой задачи**. В проекте он должен
> попадать в `docs/business.md`. Это не техническая спека и не пересказ будущей
> реализации. Это зафиксированный источник того, что человек хотел получить и
> почему это важно.

The six rules that follow it there are reproduced as the normative text of
`shared/references/methodology.md` section 2.

### 6. Clarification — provider aliases are not wrappers — 2026-08-07

<!-- markdownlint-disable MD013 -->

> при эксплуатации выяснилось что при настройке методологии из этого проекта (mo-setup) надо еще и алиасы проверять (и переделывать)
> см ниже
>
> Значит ошибся не только я — конфигурация тоже неполная, но по-разному в разных случаях. Мой промах: я выполнил ровно то, что предписывает скилл (command -v, which -a) и сделал вывод
> «врапперов нет», хотя эти команды структурно не могут увидеть алиас; корректный вывод был бы «на PATH врапперов нет, надо проверить профиль». Промах конфигурации: интерактивные запуски
> (в том числе эта сессия — приложенный системный промпт пришёл именно из алиаса) работают, а любой запуск провайдера из скрипта, хука или оркестратора (mo-herdr, mo-omnigent, claude -p
> из bash -c) получит бинарник без --dangerously-skip-permissions / --dangerously-bypass-approvals-and-sandbox и может встать на запросе подтверждения. Исключение — бэкенды, которые
> открывают именно интерактивную оболочку в панели (Herdr-панель с login shell): там алиас сработает. Ouroboros эту проблему обходил своим путём — claude_extra_args в ouroboros.yaml, — и
> вместе с ним этот обход ушёл.

<!-- prettier-ignore-start -->
<!-- markdownlint-disable MD009 MD012 MD028 MD031 MD040 -->

### Backend transition and review skills — 2026-08-14

> посмотри что у нас лежит в беклоге
> плюс я хочу отказаться от поддержки omnigent - он слишком сырой
> плюс я хочу добавить поддержку (по принципу herdr отдельными скилами) [https://github.com/stablyai/orca](https://github.com/stablyai/orca)  и [https://github.com/getpaseo/paseo](https://github.com/getpaseo/paseo)
> давай через консилиум брейнштормить

> модели эти
> тебе нужны от меня какие-то уточнения сейчас?

> удаляем полностью, в ридми можем указать коммит где были наработки последние по нему

> давай сразу нормально делать

> вот еще кстати вопрос/мысль
> надо подумать стоит ли совмещать все окрестраторы в 1 скилл (ревью то тоже сейчас 1)
> или правильнее/надежнее разделить ревью на несколько скилов по принципу как оркестраторы

> >Не создавать mo-herdr-review, mo-orca-review, mo-paseo-review. Это продублирует один и тот же review-протокол и создаст риск расхождения.
>
> как бы да, но у меня сомнения
> я же хотел этот скилл использовать не только изнутри оркестратора (по идее в buisiness об этом должно быть сказано)
> но еще и бывает я делаю мелкие фиксы (без оркестратора - чисто сессия-исполнитель) и хочу потом поревьюить. я в этот момент буду находитсья внутри herdr/orca/paseo - как ревью-скилл поймет их семантику?
> получается оркестраторы по семантике разведены, а ревью - все в куче?
>
> остальное ок

> давай скилы переназовем
> условно mo-orchestrate-herdr и тд
> mo-review-orca и тд
>
> остальное ок

> никаких breaking changes не надо
> рубим с плеча
>
> ps.
> не забудь все мои указания которые я тут говорил передать в задачу /спеку на следующих этапах

> и еще: если orca/paseo с собой несут скилы (а это обычно так) то надо чтобы спека указывала какие из них должны быть установлены, а mo-setup проверял наличие этих скилов
> это для всех бекендов

> так, а ты полностью по скилу брейншторма прошел?
> там же много этапов было
> и презентация и премпортем и ревью
>
> а еще я просил тебя изначально взять то что в беклоге и это тоже проштормить
>
>
> давай разберемся сначала с тем что сделано/не сделано а уж епотом будем думать как исправлять

> давай доразберемся сначала с этой спекой
> давай пройдем те этапы которые были неправильные/пропущены (те из них которые могут нам помочь)
>
> презентацию по блокам я бы все еще хотел увидеть

> какой скилл у нас отвечает за изначальную настройку проекта (и слоя знаний и agents/claude.md и проверку что claude/codex без песочниц работают) - mo-setup? и все ли из перечисленных обязанностей он поддерживает?
>
> извлечение полного turn // тут наверное нам не полный терн с тулколами нужен а финальный ответ агента?
>
> еще надо не забывать что агенты могут задавать вопросы (в том числе через подобие ui) - надо чтобы оркестраторы могли этим управлять/отвечать за меня
>
> orchestration // это наш скилл или из orca?
>
> mo-setup получает явный backend // наверное он должен сам определять текущий бекенд и ругаться если он не поддерживается
>
> То есть в промежуточных нерелизных коммитах Omnigent может ещё существовать // не айс. лучше сразу его удалить чтобы ревьюеры на него не обращали внимание. и сразу указать последний коммит в ридми где была поддержка
>
>
> остальное утверждаю

> docs/phase-0-fixtures.md - вот это зачем нужно?
> надо пожалуй этому скилу сказать чтобы если он обнаружил что проект надо "донастраивать" то делать он это должен в отдельной ветке feature/meta-o-setup
>
> ```
> orca skills get orchestration
> ```
> этот скилл бы переименовывать... 
> если орка при установке умеет его другим названием называть - "берем"
> если не умеет сслыаемся на текущее название
>
> Нужная единица — settled assistant response // это основное что нам нужно. но еще неплохо бы чтобы оркестратор мог всю сессию (вывод) посмотреть при желании (редко но может потребоваться) хотя не столь критично
>
> еще оркестратору надо бы добавить hint что когда он с пользователем согласовывает какие модели будет за что отвечать то чтобы по умолчанию он советовал для исполнителя модель "другого вендора" - так при возникновении вопросов/тупняков у исполнителя сам оркестратор (модель другого вендора) будет иметь больше шансов увидеть пробелы в логике и ответить правильно/подкинуть идей
>
> остальное ок

> и я напоиминаю что все мои уточнения/мысли/ответы судьи в следующих этапах должны увидеть в своем задании (когда дойдем до них)
>
> docs/phase-0-fixtures.md - его бы назвать по-нормальному и если там много всего смешано то разделить на несколько
> не считать docs/phase-0-fixtures.md безусловно обязательным файлом каждого проекта // да
>
> и вот еще что вспомнил
> агенты любят когда дают ссылки на markdown-файлы внутри markdown-файлов указывать путь к файлу в title -  это неправильно. пожалуй для этого надо какое-то правило где-то изобрести чтобы title ссылки соответствовал title документа
> где - пусть судьи подумают
>
> остальное ок

> утверждаю

> Новая версия backend или companion skill требует bounded requalification, а не автоматического полного доверия. // на самом деле я не хочу завязываться на конкретные версии и ссебя ограничивать. если выйдет новая версия и я пойму что что-то не работает - я просто доработаю методологию
>
> остальное ок

> утверждаю

> Пользователь получает: // то что если не решить сейчас потом будет сложно/долго/дорого исправлять. если же потом исправление это условно "час работы агента" то оркестратор может принять решение за пользователя но в конце реализации обязан сообщить пользователю обо всех таких решениях
>
> в остальном утрвеждаю

> утрвеждаю

> эти

> делай что нужно

> если есть вопросы - задавай

> а расскажи на каком мы сейчас этапе и сколько каких запусков консилиума было уже

> кажется по скилу брейншторма не было цифры 5 (запусков)
> максимум 3 раунда
> а повторны раундов не предусмотрены

> а почему ты начал делать снова и снова раунды?
> какая-то инструкция тебя смутила или скрипты не позволяли что-то сделать?

> вот сюда про эту проблему допиши /Users/alex/bitrix/skills/todo.md

> а по текущей спеке давай двигаться по скилу брейншторма дальше

> да

> вот тут возможно также нужно вообще без привязки к методологии делать
>
> смысл же в том чтобы пинать открытых агентов когда они упираются в лимит или инференс перегружен
> или я что-то упускаю?
> а скрипт может сразу все поддерживаемые бекенды сканировать (все сесси/вкладки/панели) и везде проверять/пинговать
> ну или адресно
> короче тут нужно не только мое мнение
>
> в остальном утверждаю

> не надо судей
> давай здесь объявим альтернативы а когда пойдем на следующие шаги судьи и так нам подскажут

> фиксируем

> да

> утверждаю

> утверждаю
>
> и еще важное пока не забыл
> ревьюеры в том числе должны так же обращать внимание на беклог
> в особенности на те добавки которые появились в ходе текущей фичи - обоснованно ли исполнитель отложил что-то напотом
> а заодно могут и старые смотреть записи и если их логично поправить в рамках текущей фичи - указывать на это

> через /goal

> но оркестратор сам в код не ходит

> тут не понял - мы же параллельно их запускаем. не вижу проблемы дождаться обоих и отдать все что оба нашли вместе

> пожалуй правка доков не должна считаться причиной перезапуска e2e

> помимо непосредственно ревью текущей фичи (а может быть просто после ревью фичи)

> утверждаю

> не понял о чем это

> не понял о чем это

> про мои аннотации ответь о чем это и тогда я скажу утверждаем или нет

> утверждаю

> у нас либо коротко сформулированная задача либо большая постановка в спецификации сохраненной на диске, поэтому объем передаваемой задачи обычно маленький - 2-5 предложений. огромных пейлоадов тут не будет
>
> с учетом этого комментария утверждаю

> не обязательно repository-relative, не обязательно tracked. просто указывает путь к спеке.
>
> не надо в такие формализмы уходить
>
> тоже не надо
>
> с учетом этого утверждаю

> утверждаем

> согласен, не нужен этот лимит

> думаю это можно даже в скиле не упоминать (умолчание - и так не использует)
>
> согласен

> да

> не надо таких сложных подходов
> оркестратор - агент - он может понять когда стоит остановиться (можно ему так и записать мол если ревьюер зациклился - можешь сам решить что делать)
> ну или вообще ничего про это не писать
> но формализмов тут точно не нужно

> достаточно

> согласен

> да

> если goal не поддерживается - можно и нативным. плюс мы решили что замечания ревьюеров тоже без /goal передаются в исполнителя

> бекендом мы называем herdr/orca/paseo,  а тут речь должна быть про harness конкретного агента (codex/claude/opencode)
>
> не надо ему такого описывать. это скилл для первичной настройки проекта/окружения

> давай совсем проще
> будем исходить из того что если харнесс не знает команду /goal то он все равно пойдет делать задачу, просто без доп. пинка от самого харнеса
> короче не надо переусложнять тут

> так лучше

> согласен

> да

> да

> ну и содержимое agent.md/claude.md он должен смотреть и про то правильно ли ораганизован слой знаний, правильно ли настроены pyproject.toml и подобные файлы - мы же изначально хотели чтобы например были линтеры на цикломатическую сложность/размер функции-модуля и обязательный purpose
>
> тут важно чтобы длинные ответы мы точно могли забирать (на 3-4 экрана размером)
>
> утверждаем с замечаниями

> давай и для opencode тоже требовать как для claude/codex

> да

> согласен

> да

> не так страшно, отладим со временем. но я напоминаю что я изначально хотел 2 варианта по watchdog: просто крипт который регулярками/паттернами оперирует и маленький агент который запускается с локальной ллм (ollama/lmstudio) и не зависти от лимитов апи. пока можно только скриптом ограничиться
>
> принимаем

> да

> реализуй spec/2026-08-14-backend-review-transition-final/spec.md , вот тут мои интенты spec/2026-08-14-backend-review-transition-final/user-intent.md (при реализации скилы вроде mo-herdr тебе не нужно использовать)

<!-- markdownlint-enable MD009 MD012 MD028 MD031 MD040 -->
<!-- prettier-ignore-end -->

<!-- markdownlint-enable MD013 -->

Editorial note, 2026-08-07: the quote records the diagnosis supplied in the
operational report; it is not fixture evidence for this machine. Here the
`~/bin/claude` wrapper itself carries the permission and prompt arguments, and
the secret-safe interactive type probe finds no alias or function. The broader
defect is still reproduced: `zsh -lc` bypasses `~/bin`, while `zsh -lic` reaches
it, so Phase 0 P4a/P4b remain incomplete until the real backend environments are
verified. The local cause is ordering, not absence: macOS `/etc/zprofile` runs
before the user's `~/.zprofile`, whose later `brew shellenv` prepends
`/opt/homebrew/bin` before `~/bin` for the login shell.

### 7. Clarification — non-interactive proof and safe remediation — 2026-08-07

<!-- markdownlint-disable MD013 MD029 -->

> Существенное
>
> 1. Закрыт один механизм расхождения из двух. Alias — не единственная причина, по которой хук получает голый бинарник. Вторая, встречающаяся чаще: каталог враппера добавлен в PATH только в интерактивном rc
>    (.zshrc), а не в .zshenv/.zprofile. Тогда враппер существует, алиаса нет, все четыре новых буллета проходят — а claude из скрипта или хука всё равно резолвится в /opt/homebrew/bin/claude. Предписание «put the
>    wrapper in the user's existing leading PATH directory» об этом молчит, и фикстура P4 такой случай не ловит.
>
> Усугубляется тем, что «direct non-interactive lookup» из буллета 1 сейчас нечем выполнить честно: command -v, запущенный агентом, идёт из шелла, инициализированного профилем пользователя, — это не неинтерактивная
> среда. Точная и дешёвая пара для zsh:
>
> zsh -c 'command -v claude codex opencode' # только .zshenv — то, что видит хук
> zsh -lic 'type -a claude; type -a codex; type -a opencode'
>
> 2. Скилл правит файлы вне репозитория без спроса. «Remove the superseded alias or function», «replace that shell-only behaviour with an executable wrapper» — это запись в ~/bin и правка профиля. «Show the profile
>    and wrapper diff, then replace» — показать не равно спросить. Это спорит и с правилом контракта про необратимые действия, и с абзацем двадцатью строками ниже в том же §3, где скилл принципиально отказывается
>    редактировать ~/.claude.json «on the user's behalf». Позиция должна быть одна: либо явное подтверждение пользователя, либо выдать готовые команды и не выполнять их самому.
>
> 3. Запись 6 в docs/business.md противоречит собственным фикстурам. В цитате сказано, что системный промпт сессии пришёл из алиаса. На этой машине это не так: ~/bin/claude (файл от 16 июля) сам содержит
>    --dangerously-skip-permissions --append-system-prompt ... "$@", а живой zsh -lic 'type -a claude' не показывает ни алиаса, ни функции — ровно то, что записано в P4a/P4b. Значит, либо цитата про другую машину
>    («при эксплуатации»), либо исходный диагноз был неверен. Verbatim трогать нельзя и не нужно, но без редакторской сноски вне цитаты ревьюер получает два взаимоисключающих утверждения в одном коммите. По существу
>    правка при этом остаётся верной: command -v действительно структурно не видит alias.
>
> Среднее
>
> 4. Проза и чек-лист расходятся по строгости. Проза осуждает alias, который подставляет permission/approval/sandbox/env/prompt-аргументы; буллет требует, чтобы «no provider alias or function changes that
>    invocation». Alias, указывающий на тот же самый враппер, безвреден и под буллет попадает. Точнее: «no alias or function resolves the provider to anything other than that wrapper».
>
> 5. Нет ветки «пользователь отказался». Methodology говорит «route unsupported until…», но контракт требует, чтобы всё осознанно неисправленное попадало в docs/backlog.md с влиянием и следующим шагом — §3 этого не
>    предписывает. Сам docs/backlog.md в изменении не тронут: запись про OpenCode всё ещё формулирует критерий через P2c/P3c и не упоминает P4c.
>
> 6. Фикстура шумит, и это не описано. На этой же машине "$SHELL" -lic '…' печатает (anon):setopt:7: can't change option: monitor и красный блок ERROR: gitstatus failed to initialize — при exit 0 и корректных
> строках type -a. Стоит сказать, что значимы только строки type -a, а вывод профиля — шум (или добавить 2>/dev/null). Плюс два необработанных случая: $SHELL, отличный от bash/zsh (у tcsh нет type), и профиль,
>    ожидающий ввода, — тогда прифлайт просто зависнет.
>
> Мелочи
>
> - В цитату записи 6 попали артефакты отрисовки TUI: ▕, │ и «new␠␠␠menu│». Это не слова пользователя — verbatim про текст, а не про рамку терминала.
> - Записи 4 и 5 оформлены blockquote, 6 — ```text-фенсом. Фенс безопаснее для markdown, но единообразие стоит выбрать.
> - mo-herdr/SKILL.md теперь утверждает безусловно: «An alias or function is not that wrapper». docs/business.md при этом фиксирует исключение — Herdr-панель с login shell alias подхватит. Консервативное правило
>   разумно, но одной оговоркой исключение стоит признать, иначе скилл спорит с записанной постановкой.
> - В docs/acceptance.md содержательных строк две, остальное — переформатирование таблицы; на прохождение гейта не влияет.

<!-- markdownlint-enable MD013 MD029 -->

Editorial note, 2026-08-07: the two-command suggestion is superseded by the
four-mode matrix in `shared/references/methodology.md §2`. Shell probes remain
diagnostic; a surface is not supported until the lookup is captured inside that
actual backend, hook or harness environment.

### 8. Clarification — `path_helper`, shell surfaces and safe probes — 2026-08-07

<!-- markdownlint-disable MD013 -->

> Главное: рецепт починки не сработает на этой же машине
>
> Причина расхождения — не только «каталог добавлен только в .zshrc». Я её локализовал:
>
> - ~/.zshrc:16 — export PATH=$HOME/bin:…:$PATH, то есть интерактивный слой;
> - /etc/zprofile:11 — eval `/usr/libexec/path_helper -s`, и на login-шелле он переставляет PATH: системные каталоги уходят вперёд, унаследованные — в хвост.
>
> Отсюда zsh -lc 'echo $PATH' даёт /opt/homebrew/bin:…:/Users/alex/bin:… — ~/bin присутствует, но позже бинарника. Два следствия для текста:
>
> 1. Критерий сформулирован через наличие, а не через порядок. «the wrapper directory is added only by an interactive startup file such as .zshrc, so the non-interactive surface resolves the bare provider binary» —
>    проверяющий, читающий это буквально, спросит «каталог добавлен?», получит «да» и пройдёт мимо. Критерий должен быть про то, что резолвится первым, а не про присутствие каталога.
> 2. Предложенное лекарство неполно. «.zshenv for ordinary zsh; .zprofile only helps a zsh login shell» читается как выбор одного из двух, но на macOS .zshenv login-шелл не чинит в принципе: /etc/zprofile
>    выполняется после него и переставляет порядок. Рабочая комбинация — префикс в ~/.zshenv (для non-login) и повторный префикс в ~/.zprofile, который читается после /etc/zprofile. Без этой оговорки P4a/P4b закроют,
>    перепроверят zsh -c, увидят зелёное — и снова получат /opt/homebrew/bin из хука.
>
> Стоит назвать path_helper прямо в mo-setup §3 и в P4: это ровно та деталь, из-за которой правка выглядит сделанной, а дефект остаётся.
>
> Структурное: одна норма в четырёх местах
>
> Процедура (режимы шелла, unknown, шум профиля, подтверждение, запись в backlog) теперь почти дословно повторена в mo-setup/SKILL.md §3, methodology.md §2.4, phase-0-fixtures §P и backlog. Backend-скилы от
> дублирования ушли — они ссылаются на references/methodology.md §2, — а mo-setup не может: в его сборку методология не входит (references/ там только purpose-and-architecture, qc-python, qc-typescript). При этом
> tools/build-skills.mjs:53 — обычная карта, и добавление строки для mo-setup стоит одну правку; собственный комментарий этого файла говорит именно то, что здесь применимо: «A duplicate maintained by hand drifts».
> Либо доставить методологию в mo-setup и оставить в §3 только то, что специфично для настройки (сама ремедиация, подтверждение, backlog), либо признать дублирование осознанным и записать причину. Сейчас §3 вырос с
> 18 до ~70 строк и стал самым длинным разделом скила настройки — для проекта, чей исходный диагноз был «прошлое поколение слишком толстое», это заметно.
>
> Вопрос по последствиям, не дефект
>
> Формулировка methodology — «The route is unsupported until all surfaces resolve the same executable wrapper» — при открытых P4a/P4b делает на этой машине неподдержанными все три маршрута, включая Herdr-панель,
> которая по фактическим данным работает (интерактивный login-шелл доходит до ~/bin). Это честное консервативное чтение, но проверьте, что оно намеренное: сегодня оно блокирует и ту поверхность, у которой
> доказательство есть. Альтернатива — привязать вердикт к поверхности запуска, а не к маршруту целиком.
>
> Мелочи
>
> - «bounded tool timeout» без пояснения: на macOS нет timeout(1), и агент пойдёт его искать. Стоит сказать, что имеется в виду таймаут самого инструмента запуска.
> - В backlog: «zsh -c inherited ~/bin from the current Codex parent». Я воспроизвёл то же самое из Claude Code — наследование не зависит от того, кто именно родитель. Точнее: «от интерактивного родителя, из
>   которого запускалась проба».
> - mo-herdr/SKILL.md: «may load an alias or a wrapper-only PATH» — «wrapper-only PATH» читается неоднозначно; имеется в виду PATH, который собирает только интерактивный профиль.

<!-- markdownlint-enable MD013 -->

Editorial note, 2026-08-07: the quoted local diagnosis was later disproved.
`path_helper` did not introduce `/opt/homebrew/bin`; the user's later
`~/.zprofile` line running `brew shellenv` did. The durable remediation is not
tied to either tool: the last applicable prepend wins, so the wrapper-directory
prepend must follow every other `PATH` initializer in each startup file read by
the surface, then the complete matrix and actual surface must be rechecked.

### 9. Clarification — mandatory login probes and surface evidence — 2026-08-07

<!-- markdownlint-disable MD013 MD029 -->

> 1. Дефолтный набор проб больше не содержит режима, который нашёл дефект
>
> В блоке методологии сейчас zsh -c / zsh -ic (и пара для bash), а -lc/-lic понижены до «add … when login semantics are relevant». Но /etc/zprofile — а с ним path_helper — выполняется только на login-шелле. Именно
> поэтому проблема видна в zsh -lc и невидима в остальных. Прогон ровно документированного блока на этой машине:
>
> zsh -c → /Users/alex/bin/claude ✓
> zsh -ic → /Users/alex/bin/claude ✓
> bash -c → /Users/alex/bin/claude ✓
> zsh -lc → /opt/homebrew/bin/claude ✗ ← необязательная проба
>
> То есть агент, выполнивший предписанный набор буквально, получает четыре зелёных ответа и закрывает P4a — при том что запись в собственном backlog этого же коммита описывает ровно обратное. Плюс обе
> непривилегированные пробы наследуют PATH родителя, о чём методология сама предупреждает двумя абзацами ниже. На macOS login-пробы должны быть в обязательном наборе, а не в примечании; логичнее сделать базовой
> парой -lc/-lic, а -c/-ic держать рядом как контраст, который показывает наследование.
>
> 2. Первое же применение новой схемы даёт «supported» без доказательства поверхности
>
> P4a/P4b записывают «Herdr login pane: wrapper first, posture supported», но в колонке evidence нет ни одного факта, полученного внутри панели — там режим шелла, то есть zsh -lic. Методология, на которую эта
> строка ссылается, говорит прямо: пробы шелла диагностичны, а не окончательны, и лукап надо повторить внутри реального backend/hook/harness. По правилу проекта вердикт, который нельзя прочитать целиком, — unknown.
> Сейчас же поверхность с самым слабым доказательством получила единственный положительный статус в §P, и он же протёк в backlog («retain a supported Herdr login-pane posture») и в acceptance («Phase 0.4 —
> partial»). Либо снять пробу внутри реальной панели и процитировать её, либо поставить панели unknown. Это важно ещё и потому, что per-surface гранулярность — та самая конструкция, из которой в прошлый раз вырос
> «qualified pass»; её единственная защита в том, что каждая поверхность приносит собственное доказательство.
>
> 3. Правило секретности делает обычный случай блокирующим
>
> Запрет на type -a/alias/typeset -f разумен, но следствие такое: как только type-проба вернула alias или function, агент не может двинуться дальше без человека — нужно просить «credential-free, redacted
> definition». На безобидном alias claude='claude --model opus' это всё равно остановка. Контракт разрешает будить человека ради credentials, так что формально всё сходится, но стоит написать, как именно это
> делается дёшево: попросить пользователя выполнить alias claude у себя (в Claude Code — префикс !, вывод придёт в диалог) вместо «пришлите отредактированное определение». Иначе прифлайт будет упираться в
> неопределённый ручной шаг.
>
> Мелочи
>
> - skills/mo-setup/references/methodology.md не добавлен в индекс (?? в статусе). --check сейчас проходит, потому что файл лежит на диске; в свежем клоне built-дерево окажется неполным. Нужен git add.
> - acceptance, строка 11, всё ещё описывает mo-setup как «checks shell-specific wrapper resolution», хотя §3 теперь явно отказывается от диагностики в пользу методологии и владеет только ремедиацией и
>   подтверждением. Формулировку стоит подтянуть, иначе критерий проверяет не то, что написано в скиле.
> - Глоссарий: «A shell alias or function is not a PATH wrapper» соседствует с «Launch posture … possibly through a credential-free forwarding alias or function». Оба утверждения верны в своих терминах, но правило
>   файла — одно значение на термин; в статье про PATH wrapper не хватает отсылки к Launch posture, чтобы читающий по диагонали не вынес противоположный вывод.

<!-- markdownlint-enable MD013 MD029 -->

Editorial note, 2026-08-07: all four modes remain mandatory for zsh and bash in
the canonical matrix. The current probe forces shell builtins, validates each
record, reports path divergence through its exit status, and still requires
evidence from the actual launch surface before a supported verdict.

### 10. Clarification — last-prepend invariant and executable probes — 2026-08-07

<!-- markdownlint-disable MD013 MD029 -->

> 1. Записанная причина неверна, и рецепт из-за этого не сработает
>
> Виноват не path_helper. Проверка на этой машине:
>
> - /etc/paths — /usr/local/bin, /System/Cryptexes/App/usr/bin, /usr/bin, /bin, /usr/sbin, /sbin; в /etc/paths.d только 10-cryptex, 10-pmk-global, 100-rvictl. /opt/homebrew/bin там отсутствует — path_helper
>   физически не может поставить его вперёд.
> - ~/.zprofile состоит из одной строки: eval "$(/opt/homebrew/bin/brew shellenv)". Она выполняется после /etc/zprofile и префиксует /opt/homebrew/bin:/opt/homebrew/sbin. Это и есть решающий prepend.
> - Подтверждение из самой матрицы: bash -lc даёт /Users/alex/bin/claude, а zsh -lc — /opt/homebrew/bin/claude. Bash читает ~/.bash_profile, где строки brew нет, и при том же path_helper враппер выигрывает.
> - Без brew shellenv path_helper отправил бы в хвост и ~/bin, и /opt/homebrew/bin, сохранив их взаимный порядок, — а ~/bin в унаследованном PATH стоит раньше. То есть сам по себе path_helper дефекта не создаёт.
>
> Мой прошлый разбор здесь был неточен, и диагноз разошёлся по четырём местам: mo-setup §3, editorial note в business.md, «Why» в backlog и evidence P4a/P4b. Практическое следствие в §3 серьёзнее формулировки:
> «prepends the user wrapper directory in .zshenv, then prepends it again in .zprofile after /etc/zprofile has run» при буквальном исполнении разрешает вставить префикс первой строкой ~/.zprofile — и следующая же
> строка brew shellenv его перебьёт. Инвариант надо писать не через имя одного виновника, а через правило: выигрывает последний prepend, поэтому строка враппера ставится после всех инициализаторов PATH в каждом
> стартап-файле, который читает поверхность (brew shellenv, mise/asdf/pyenv init, path_helper), и подтверждается повторным прогоном матрицы. Заодно та же правка убирает лишнюю привязку к macOS: ~/.zprofile с brew —
> не системная особенность, а обычная пользовательская конфигурация.
>
> 2. Половина скрипта считает величину, которую документ тут же объявляет недоказательной
>
> rc, MO_MATRIX_STATUS и проверки [[ ... ]] существуют, чтобы «the matrix exits nonzero if any requested provider is missing in any mode», но абзац ниже говорит: «Exit zero means only that every requested name was
> classified; it is never a posture PASS». Отсутствие провайдера и так видно в записях MO_POSTURE — на выходе path=missing. То есть примерно треть кода, которую агенту придётся адаптировать под fish или под другой
> список провайдеров, не приносит информации. Либо убрать это плетение и оставить printf, либо — что полезнее — сделать так, чтобы ненулевой код означал расхождение первых путей между режимами: именно это и есть
> дефект, ради которого вся правка затевалась, и именно его сейчас приходится вылавливать глазами.
>
> 3. Встроенный shell не проверяется ничем
>
> В методологии теперь ~20 строк кода, чувствительного к кавычкам (${kind#*: }, вложенные $(...) внутри одинарных кавычек, переменная режима, передаваемая префиксом окружения), и он механически копируется в три
> скила. mo-lint делает node --check для обоих .mjs, а для shell-блоков нет ничего — единственное доказательство их работоспособности сейчас в том, что ревьюер запустил их руками. markdown-it уже в devDependencies,
> так что извлечь фенсы bash из shared/ через AST и прогнать zsh -n / bash -n — это несколько строк, полностью в рамках контракта (зрелый инструмент, не самописный чекер, без regex-парсинга Markdown).
> Синтаксическую проверку это даёт, семантику — нет, но от опечатки в кавычках защитит.
>
> 4. Записи 7–9 в business.md живут без редакторских сносок
>
> Само по себе размещение ревью в framing оправдано: §4 фиксирует, что раунды находок — часть постановки. Но сноску получила только §6. §7 предлагает пару zsh -c + zsh -lic, §8 — рецепт «.zshenv плюс .zprofile
> после /etc/zprofile» и диагноз через path_helper, §9 — набор из четырёх режимов. Первые два уже заменены текущей матрицей, а диагноз из §8, как показано выше, просто неверен. Verbatim трогать не нужно, но каждой
> записи нужна такая же сноска, как у §6, иначе файл, существующий ради сохранения намерения, выдаёт будущему читателю отменённые инструкции наравне с действующими.
>
> Мелочь
>
> - Абзац «On macOS, zsh -lc and zsh -lic are mandatory … because /etc/zprofile can run path_helper after .zshenv and reorder PATH» — требование правильное, обоснование то же самое неточное. Достаточно сказать
>   «because login-only startup files can re-prepend package-manager directories».

<!-- markdownlint-enable MD013 MD029 -->

### 11. Clarification — profile noise and a shipped posture script — 2026-08-07

<!-- markdownlint-disable MD013 MD029 -->

> 1. Профиль, который печатает в stdout, даёт ложный unknown
>
> Экзотики тут нет: echo в .zshenv/.zshrc, баннер менеджера версий, приветствие — очень распространённая конфигурация. Проверка на синтетическом HOME (три фальшивых провайдера в одном каталоге, echo "Welcome back,
> Alex" в .zshenv):
>
> MO_POSTURE … mode=-lc … path=…/bin/claude (и остальные 11 записей — валидны и одинаковы)
> EXIT = 2
>
> Все двенадцать записей корректны, подписи путей совпадают во всех четырёх режимах — то есть доказательство полное и однозначное, — но внешний цикл ловит лишнюю строку в *) mode_status=2, и матрица сообщает
> «malformed or incomplete». По тексту методологии это unknown, а unknown держит P4 открытым. На такой машине P4 не закроется никогда, независимо от того, как настроены врапперы.
>
> Причина в том, что exit 2 сейчас склеивает две разные ситуации: «запись невалидна или её нет» — это действительно unknown — и «в stdout приехала лишняя строка», что при префиксованных записях и точном счёте
> record_count не мешает ничему. Достаточно не поднимать статус на неизвестной строке, а собрать такие строки отдельно и упомянуть их как шум: критерий полноты уже обеспечен проверками record_count -ne 3 и пустого
> mode_paths. Тогда unknown останется там, где он заслужен, — невалидная запись, пустой вывод, зависший профиль.
>
> 2. Форма: самый сложный код проекта живёт внутри Markdown
>
> Это не дефект, а решение, которое стоит принять осознанно. Сейчас в методологии два фенса по ~28 плотных строк, они механически копируются в три скила, и их корректность держит тест на 160 строк с извлечением
> фенсов из AST. Альтернатива — shared/scripts/mo-posture.sh как обычный файл, доставляемый той же картой сборки, что и mo-models.mjs, а в методологии остаётся имя команды и описание вердиктов. Тогда исчезает
> опасность кавычек внутри Markdown, zsh -n применяется к настоящему файлу, извлечение фенсов из документа не нужно, а тест сокращается до запуска скрипта в подготовленных HOME. Цена честная и её надо назвать:
> фраза контракта «Everything shipped is Markdown plus one dependency-free .mjs» перестаёт быть верной, значит нужны правка CLAUDE.md/AGENTS.md и запись причины в docs/architecture/ — то есть ровно та процедура,
> которую контракт для такого случая и предписывает. Я бы пошёл этим путём; текущий вариант работает, но каждое следующее изменение проб будет редактированием одной строки в 28-строчном one-liner'е внутри трёх
> копий.
>
> 3. Пробелы в тесте
>
> Тест проверяет то, что работает, и не проверяет то, что документ обещает:
>
> - exit 2 не покрыт вообще. Самая запутанная ветка (record_count, пустой mode_paths, catch-all *)) не имеет ни одного случая — а по находке 1 её поведение ещё и требуется изменить, так что тест нужно писать после
>   решения по ней.
> - path=missing не покрыт. Документ отдельно оговаривает: «A path=missing record still fails that provider's posture even when it is consistently missing and the matrix exits 0» — это утверждение сейчас ничем не
>   закреплено, хотя формулировка нетривиальная и легко ломается при правке.
> - Расхождение проверено только для zsh. У bash-матрицы есть тест на подмену type, но нет теста на exit 1; ветки в двух фенсах независимые, и разойтись они могут молча.
>
> 4. Мелочь
>
> tests/provider-posture.test.mjs не в индексе (??). mo-test берёт его с диска, поэтому гейт зелёный локально, но в коммите теста не будет — та же ситуация, что в прошлый раз с built-файлом. Нужен git add.

<!-- markdownlint-enable MD013 MD029 -->

Editorial note, 2026-08-07: the executable matrix now lives in the shipped
`scripts/mo-posture.sh`. Profile stdout/stderr is separated from NUL-framed
evidence and summarized without content; banners do not change the exit status.
The regression suite covers both shells, missing providers, whitespace paths,
malformed and incomplete evidence, status-2 precedence and the named guard
mutations.

### 12. Clarification — command-kind divergence and diagnostic hardening — 2026-08-07

<!-- markdownlint-disable MD013 MD029 -->

> ⏺ Шестой проход: контракт в AGENTS.md и CLAUDE.md изменён одинаково (cmp совпадает), причина вынесена в docs/architecture/provider-posture-script.md с разделом Rejected — это ровно та процедура, которую контракт
> требует для нового shipped-артефакта. Скрипт я гонял и на этой машине, и на синтетических HOME, включая /bin/bash 3.2 (шебанг env bash на macOS попадает именно в него) — работает; заявление про %q проверяется
> буквально: printf '%q' на 3.2 отдаёт $'a\nb', то есть перевод строки действительно не рвёт запись. Бит исполняемости сохраняется в трёх собранных скилах и закреплён тестами сборки и установки, mo-lint получил
> bash -n и --self-check, а мутационный прогон (глушение проверки расхождения, счётчика записей и статуса потомка) — сильная защита от того, что тесты станут зелёными вхолостую. Все находки прошлого раунда закрыты.
> Дальше — то, что вскрылось на новом коде.
>
> 1. Расхождение считается только по пути, поэтому интерактивный алиас даёт exit 0
>
> Подпись режима строится из path, а type в неё не входит: baseline_paths[$provider_index]=$path и сравнение [[ "$path" != "\${baseline_paths[...]}" ]]. Синтетический HOME, где .zshrc содержит alias claude='claude
> --dangerously-skip-permissions', а .zshenv/.zprofile — нет:
>
> mode=-lc name=claude type=command path=…/bin/claude
> mode=-lic name=claude type=alias path=…/bin/claude
> mode=-c name=claude type=command path=…/bin/claude
> mode=-ic name=claude type=alias path=…/bin/claude
> EXIT = 0
>
> Это ровно тот случай, с которого началось всё изменение — запись 6 в business.md, «надо еще и алиасы проверять». Механизм запуска в интерактивных режимах другой, поведение провайдера другое, а статус матрицы
> говорит «identical». Формально документ не врёт («the first paths are identical across all four modes»), но он же поднимает статус матрицы в ранг resolution evidence, и агент, читающий сначала код возврата,
> пройдёт мимо. Правильнее включить kind в подпись: type=alias против type=command — это расхождение режимов, а exit 1 означает не «плохо», а «режимы разошлись, смотри записи». Заодно у тестового набора появляется
> очевидный новый кейс, которого сейчас нет.
>
> 2. Способ запуска скрипта не совпадает с собственным соглашением проекта
>
> Методология показывает scripts/mo-posture.sh --shell zsh и поясняет «Run the script from the installed skill directory». Относительный путь резолвится от текущего каталога, а текущий каталог в реальном прогоне —
> репозиторий фичи, не каталог установленного скила; файла там нет. В этом же репозитории уже есть отработанное соглашение: src/skills/mo-herdr/SKILL.md:187 пишет прямо — «scripts/mo-models.mjs is a path inside
> this skill's own directory, not …» — и все примеры выглядят как node <this-skill>/scripts/mo-models.mjs. Новый скрипт стоит подать так же: <this-skill>/scripts/mo-posture.sh с той же оговоркой.
>
> 3. Мелочи
>
> - Документ велит осмотреть диагностику, которой уже нет. «Inspect any reported diagnostic locally and credential-safely before deciding it is cosmetic» — но stdout/stderr режима лежат в приватном каталоге, а trap
>   cleanup EXIT удаляет его при выходе; наружу выходит только stdout=present. Либо добавить флаг, оставляющий каталог, либо написать, что осматривать нужно повторным ручным запуском конкретного режима.
> - --shell all схлопывает статусы двух шеллов в один. На этой машине zsh даёт 1, bash — 0, итог 1, и какой именно шелл разошёлся, видно только из записей. При том что вся методология построена на вердикте по
>   каждой поверхности, строка вида MO_POSTURE_MATRIX shell=zsh status=1 стоила бы три строки кода и совпадала бы с её гранулярностью.
> - MO_SHELL_MODE мёртв. Переменная экспортируется в каждый дочерний запуск, но ни ZSH_PROBE, ни BASH_PROBE её не читают — режим теперь проставляет родитель. Остаток от прошлой схемы.

<!-- markdownlint-enable MD013 MD029 -->

Editorial note, 2026-08-07: the matrix signature now includes both command kind
and first executable path, `--shell all` emits one summary per shell, and the
dead mode export is gone. Examples resolve the script through
`<this-skill>/scripts/`; profile-noise inspection is an explicit local rerun
because the private capture is deleted. The runner now isolates an outer
`BASH_ENV`, validates dispatch primitives before lookup or record emission,
terminates cleanly on signals, and has regression coverage for those boundaries.

### 13. Clarification — inherited shell state and cleanup integrity — 2026-08-07

<!-- markdownlint-disable MD013 MD029 -->

> 1. Экспортированная функция trap отключает уборку, и приватный каталог остаётся на диске
>
> Bootstrap вычищает три имени — builtin, command, printf, — но родительский скрипт вызывает без префикса ещё и trap, umask, local, cat. Проверка:
>
> /bin/bash -c 'trap() { :; }; export -f trap; shared/scripts/mo-posture.sh --shell zsh'
> tempdirs before=0 after=1
> $TMPDIR/mo-posture.8JiBDc/zsh-lic.stderr 310 байт — захваченный вывод профиля
>
> Вердикт при этом правильный (exit=1), но trap cleanup EXIT не срабатывает, и каталог с захваченными stdout/stderr профиля переживает процесс. Именно этот материал архитектурная записка обещает не сохранять:
> «temporary files are removed through a path-guarded cleanup trap», «a profile cannot leak its banner». Права 0600 спасают от чужих глаз, но не от того, что данные остались, а пользователь об этом не знает.
>
> Денилист из трёх имён закрывает открытый класс, и это же делает правку хрупкой: достаточно однажды добавить в родителя вызов небуквального builtin без префикса — и дыра открывается молча. Раз bootstrap и так
> проходит через env, дешевле и надёжнее вычищать все переменные вида BASH_FUNC_* (обе схемы именования) списком, построенным из env, а не перечислением. Тогда исчезает и необходимость помнить про префиксы.
>
> 2. Подмена диспетчерского примитива даёт unknown без указания причины
>
> builtin() { :; } в .zshenv — проба честно падает в 2, я это воспроизвёл. Но наружу выходят только записи type=invalid path=invalid, то есть ровно то же, что при повреждённой NUL-рамке, а методология описывает
> exit 2 как «a requested shell failed or its NUL-framed evidence was malformed or incomplete». У этого случая есть конкретное лекарство — в профиле переопределён builtin/command/printf, — и оператору его надо
> назвать. Достаточно отдельного маркера рядом с MO_POSTURE_NOISE (например, MO_POSTURE_SHADOW shell=zsh mode=-lic) и одной фразы в перечислении причин exit 2.
>
> 3. Мелочь
>
> Свип подмен в тестах покрывает профили, но не путь «экспортированная функция от вызывающего процесса» — то есть ровно ту дыру из находки 1. Если перейдёте на сплошную чистку BASH_FUNC__, кейс с export -f trap и
> проверкой, что после прогона в TMPDIR не осталось mo-posture._, закроет её ровно.

<!-- markdownlint-enable MD013 MD029 -->

Editorial note, 2026-08-07: the runner now enters through privileged
`/bin/bash -p`, which imports no caller functions at all; an exported
`trap` regression proves cleanup leaves no `mo-posture.*` directory. Unsafe
inherited Bash option/function state returns `MO_POSTURE_ENVIRONMENT` rather
than being silently dropped, profile dispatch shadows return
`MO_POSTURE_SHADOW`, and a direct-PID signal is forwarded to the managed child
before cleanup.

### 14. Clarification — fail-closed environment scan and runtime paths — 2026-08-07

<!-- markdownlint-disable MD013 MD029 -->

> 1. Отказ env -0 открывает ворота, а не закрывает их
>
> Детектор унаследованных функций читает done < <(/usr/bin/env -0) и нигде не проверяет, что эта команда вообще отработала. -0 не POSIX; busybox-овский env его не знает, старые системы тоже. Симуляция отказа (копия
> скрипта с -Z вместо -0, окружение с экспортированной функцией):
>
> мутант: MO_POSTURE_MATRIX shell=bash status=0
> оригинал: MO_POSTURE_MATRIX shell=bash status=2
>
> То есть при неработающем env -0 цикл читает пустоту, inherited_bash_functions остаётся нулём, и bash-матрица измеряется так, будто окружение чистое, — ровно противоположно правилу проекта «вердикт, который нельзя
> прочитать, есть unknown». Всё остальное в этом скрипте падает закрыто; здесь исключение. Достаточно вынести вывод в файл отдельной командой, проверить её статус и при неудаче поднять unsafe_bash_environment.
>
> 2. /bin/bash теперь зашит в шебанг
>
> Раньше был #!/usr/bin/env bash, сейчас #!/bin/bash -p — иначе флаг не передать. Плата в том, что на системах без /bin/bash (NixOS, Alpine, часть контейнеров) единственный диагностический инструмент трёх скилов
> падает с «bad interpreter» ещё до любого сообщения. На этой машине /usr/bin/env -S echo hi работает, так что #!/usr/bin/env -S bash -p — рабочая альтернатива, но она меняет одно допущение на другое (-S требует
> coreutils ≥ 8.30). Я бы оставил как есть и просто записал требование явно — строкой в usage и в архитектурной записке, — чтобы это было решением, а не побочным эффектом флага.

<!-- markdownlint-enable MD013 MD029 -->

Editorial note, 2026-08-07: the environment scan now writes NUL-framed output
to the private directory and checks `/usr/bin/env -0` before parsing; failure is
an explicit `environment-scan-failed` unknown rather than a clean result. The
absolute `/bin/bash -p` startup and every other absolute runtime dependency are
now declared in command usage, methodology, README and the architecture decision.
Signals sent only to the runner terminate and verify the measured shell's process
group, including a TERM-resistant background descendant, before private captures
are removed.

### 15. Clarification — quiescent evidence and deterministic shutdown — 2026-08-07

<!-- markdownlint-disable MD013 MD029 -->

> 1. High — фоновые процессы переживают нормальное завершение
>
> - Evidence: после wait PID/PGID сразу сбрасываются в shared/scripts/mo-posture.sh:375. Воспроизведение: helper завершился с status=0, оба потомка Bash-профиля остались живы.
> - Impact: каждый режим может оставлять процессы; они способны продолжать менять capture-файлы после начала разбора.
> - Expected fix: перед разбором evidence проверять и завершать оставшуюся process group, затем подтверждать её исчезновение. Добавить regression для нормального завершения с background descendant.
>
> 2. Medium — environment scan не полностью fail-closed
>
> - Evidence:
>   - успешный, но пустой вывод env -0 принимается как чистое окружение в shared/scripts/mo-posture.sh:248, хотя архитектура обещает обратное; мутант вернул Bash status=0;
>   - ошибка env -0 влияет только на Bash-ветку в shared/scripts/mo-posture.sh:341: Zsh при env -Z вернул status=0.
> - Impact: неполные или недоступные сведения могут стать известным verdict.
> - Expected fix: отклонять нулевой размер environment-файла; либо считать scan обязательным для любой матрицы, либо выполнять и документировать его только для Bash. Закрепить оба случая тестами.
>
> 3. Medium — signal shutdown не полностью детерминирован
>
> - Evidence:
>   - trap ставится только после создания временного каталога: shared/scripts/mo-posture.sh:176 против shared/scripts/mo-posture.sh:236. Ранний TERM оставил каталог в 3 из 40 запусков;
>   - handler сначала восстанавливает default TERM в shared/scripts/mo-posture.sh:219. Два TERM дали завершение сигналом вместо явного кода 143.
> - Impact: cleanup и форма машинного результата зависят от момента или повторной доставки сигнала.
> - Expected fix: установить безопасный trap до создания каталога и сделать shutdown идемпотентным. Добавить early-signal и double-signal regressions.
>
> 4. High — launch-window guard не закреплён mutation sweep
>
> - Evidence: удаление ветви shared/scripts/mo-posture.sh:229 оставляет весь posture test suite зелёным. Кампания фиксирована на 19 выбранных мутантах в tests/provider-posture.test.mjs:706. Это не эквивалентный
>   дублированный guard из backlog.
>
> - Impact: гонка между запуском процесса и сохранением PID/PGID может вернуться незаметно.
> - Expected fix: добавить детерминированный launch-window test и мутант; отдельно учитывать только действительно эквивалентные survivors.
>
> 5. Low — документация runtime не совпадает с исполнением
>
> - --help вызывает незаявленный cat из PATH в shared/scripts/mo-posture.sh:17: при PATH=/nonexistent печатает cat: command not found, но выходит с кодом 0.
> - docs/architecture/provider-posture-script.md:58 приписывает bounded timeout helper’у, хотя его предоставляет внешний execution tool.
> - Expected fix: использовать builtin printf для usage и уточнить владельца timeout.

<!-- markdownlint-enable MD013 MD029 -->

Editorial note, 2026-08-07: normal completion now quiesces and verifies the
measured process group before any capture is read. The environment scan is
explicitly Bash-only and rejects both command failure and an empty successful
stream. Signal traps precede temporary-directory creation, defer delivery across
the directory and child launch windows, and remain idempotent under repeated
signals. Usage uses only Bash builtins, while the execution tool remains the
owner of the bounded timeout. Deterministic regressions and selected mutants
cover each of these guards.

### 16. Clarification — owned process groups and behavioral shutdown guards — 2026-08-07

<!-- markdownlint-disable MD013 MD029 -->

> коммить, исправляй, коммить
>
> ### High — возможен сигнал чужой переиспользованной process group
>
> Evidence: лидер группы reap’ится в shared/scripts/mo-posture.sh:402, после чего stop_active_child посылает TERM сохранённому PGID в shared/scripts/mo-posture.sh:198. После reap PID/PGID уже может быть
> переиспользован без проверки владения.
>
> Impact: при PID wraparound или интенсивном создании процессов read-only диагностика способна завершить чужую process group.
>
> Expected fix: сохранять ownership anchor до окончания quiescence либо применять механизм, который не адресует переиспользованный PGID. Если это невозможно в compatibility boundary — явно документировать и
> экспонировать ограничение.
>
> ### Medium — три load-bearing shutdown-инварианта не закреплены поведением
>
> Evidence:
>
> - Удаление shutdown_started в shared/scripts/mo-posture.sh:223 оставляет весь posture suite зелёным.
> - Замена stop_active_child || mode_status=2 на || true способна вернуть status=0 с живыми потомками. QC ломается лишь потому, что mutation helper больше не находит исходную строку, а не из-за поведенческого
>   assertion.
> - Перенос stop_active_child ниже чтения evidence также оставляет текущую normal-background fixture зелёной: она проверяет потомков только после возврата helper в tests/provider-posture.test.mjs:768.
>
> Impact: reentrant shutdown, принятие unquiesced group или возврат гонки чтения evidence могут пройти QC.
>
> Expected fix: добавить независимые behavioral mutants для idempotence, unknown-on-unquiesce и порядка «quiesce до первого чтения capture». Исчезновение mutation target не должно считаться доказательством
> поведения.
>
> ### Low — --help всё ещё показывает неполную compatibility boundary
>
> Evidence: shared/scripts/mo-posture.sh:25 не упоминает mktemp и rm, используемые в строках 248 и 185. Архитектура утверждает, что usage и README описывают одинаковую границу.
>
> Impact: пользователь может выполнить все отображённые prerequisites и всё равно получить неподдерживаемый runtime.
>
> Expected fix: добавить в help mktemp и rm из system utility path.

<!-- markdownlint-enable MD013 MD029 -->

Editorial note, 2026-08-07: the measured shell now reports through an unreaped
process-group leader whose PID/PGID remains owned until every group signal has
been sent; no numeric PGID is addressed after the anchor is reaped. Independent
behavioral fixtures and mutants cover reentrant shutdown, unknown-on-unquiesce
and quiescence before the first capture read. Command usage now names `mktemp`
and `rm` from the system utility path.

<!-- markdownlint-disable MD013 -->

<!-- meta-o-later-user-intents-v1:start -->

### 17. Implementation and clean-room convergence request — 2026-08-10

> /goal выполни разработку /Users/alex/Develop/meta-o/spec/2026-08-08-herdr-orchestrator-operational-corrections/spec-review.md и через clean-room subagent review добейся отстуствия замечаний

### 18. Execution-route clarification — 2026-08-10

> тебе не надо использовать скилл mo-herdr сейчас

### 19. Clarification — user intents and the spec — 2026-08-10

> Такой вопросик. В My Opinion посмотри, есть ли там раздел или ещё?
> Про то, что нужно дословно передавать интенты пользователю.
> Смысл в том, что я неоднократно наблюдаю большую проблему, что те интенты, которые пользователь высказывает, они в финальную спеку не попадают. То есть, нужно, чтобы, если пользователь какой-то, на какой-то вопрос ответил или какое-то мнение высказал, чтобы это дословно попадало в спеку обязательно. Вот есть там такое сейчас или нет?

### 20. Decision — every user intent is verbatim in the spec — 2026-08-10

> давай укажем что и в спеку все интенты пользователя должны попадать дословно

### 21. Decision — no agent-attribution commit trailer — 2026-08-10

> я тут долго думал и понял что не нужен нам Assisted by в коммитах
> убери упоминания этого из спеки

### Questions and pause request — 2026-08-10

> объясни что мы так долго делаем? в смысле почему так долго?
> и давай пока сделаем паузу

<!-- separate verbatim turn -->

> а почему у нас образовалось несколько веток herd-orchestrator-candidate-*** ?

<!-- separate verbatim turn -->

> а ты сейчас пока делаешь эту работу и запускаешь тесты при этом используешь клод/кодекс/опенкод? подписки тратятся?

<!-- separate verbatim turn -->

> какой объем работы по спеке еще остался? как-то подозрительно долго делаем
> мы же все еще делаем тонкий оркестратор на скилах (+может небольших скриптах в них) без кучи обвеса?

<!-- separate verbatim turn -->

> лишние ветки поудаляй что ли
> а то висят/шумят

<!-- separate verbatim turn -->

> в нашей спеке есть что-то что подразумевает правки omnigent-скила или его тестирование?

### Two supplied reviews — 2026-08-11

> ниже 2 ревью

```text
  1. Сборка бандла не воспроизводима вне «обычного» node_modules (главное)

  tools/build-skills.mjs:106 вызывает esbuild без preserveSymlinks, поэтому esbuild резолвит входы через realpath и вписывает их в бандл как комментарии относительно рабочего каталога. Если node_modules — не
  настоящий каталог внутри корня репозитория (git worktree с общими зависимостями, pnpm-раскладка, чекаут под симлинком, восстановленный из кеша CI), байты бандла меняются.

  Воспроизвёл: в worktree с симлинком на node_modules HEAD тоже падает на make skills-check (входит в mo-qc) с «skills/ is out of date. Run make skills». А предписанное лечение — make skills — перезаписывает два
  поставляемых бандла, вбивая в них абсолютный путь разработчика:

  // ../../../../../../../Users/alex/Develop/meta-o/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs

  То есть гейт даёт ложный отказ, а «исправление» молча меняет shipped-артефакт и утаскивает локальный путь в репозиторий. Текущие тесты этого не поймают, потому что все они собирают в одной и той же раскладке.

  Проверил и починку: с preserveSymlinks: true сборка в том же worktree побайтово совпадает с закоммиченным бандлом и абсолютных путей не содержит. Предлагаю добавить preserveSymlinks: true в bundleModels и
  детерминированную проверку в build-skills.test.mjs: в выходе не должно быть ни абсолютного пути, ни входного комментария с ... Это ровно то место, где спека требует «byte-identical Herdr/Omnigent output» — сейчас
  идентичность гарантирована только внутри одной машины и одной раскладки.

  2. Легальный исход ревью REQUIRED/NA не имеет определённого следующего шага

  Состояние достижимо: оба ревью status=PASS, у A e2e=REQUIRED, у B e2e=NA (грамматика это разрешает, применимость E2E принадлежит каждому ревьюеру отдельно). Дальше:

  - methodology.md:200 (§2.5) запускает E2E, когда «either reviewer says E2E is required or unknown» — то есть E2E пойдёт и может дать PASS;
  - methodology.md:265 и все прочие дома («one NA is invalid», docs/e2e.md:39, docs/glossary.md:67, mo-herdr/SKILL.md:343) запрещают выдать финальную запись;
  - ни одна граница §7 этот случай не покрывает, это не actor noncompliance, и ключ no-progress не повторяется.

  Итог — прогон fail-closed, но встаёт без разрешённого перехода, что противоречит NI23 и исходному интенту пользователя («оркестратор должен меня заменять»). H22 в docs/phase-0-fixtures.md:119 проверяет только,
  что one-NA невалидна, но не что делать. Нужно назвать переход в §6 (например: переспросить именно NA-ревьюера о финальной диспозиции на неизменённом кандидате; устойчивое расхождение — ограниченный
  needs_attention) и дописать это в H22.

  3. Полнота E2E самоподтверждающаяся: счётчик хода не сверяется с выведенным набором

  Финальная запись выводит требуемые сценарии как объединение support[].scenarios, а support-факты существуют только для того, что прошло. Значит недопокрытый прогон E2E даёт внутренне согласованный PASS: чего не
  запускали — того нет и в объединении. Единственное утверждение о полноте — собственное not_run=none актора, а его scenarios=<n> нигде не сравнивается ни с total, ни с числом записей сценариев (проверил: такого
  правила нет ни в methodology.md, ни в mo-herdr/mo-e2e). Оба числа уже лежат в валидированном состоянии — сверка стоит одну строку в §3 и в разделах Final answer, плюс детерминированный кейс.

  4. Структурные литералы нижней границы зашиты, но не измерены

  herdr-mechanics.md:211 жёстко задаёт ╭─ input ❯ ─╮ и ╭─ input › ─╮, а голдены авторские, не снятые (Claude golden body: готово.). Если реальный рендер отличается на байт — или строка промпта приходит с
  префиксом/переносом, так что line === marker не совпадёт, — каждое извлечение станет UNKNOWN и маршрут будет нерабочим целиком. На уровне постуры это честно: P6/H17 — PENDING/UNSUPPORTED, беклог пишет, что P1–P8
  не запускались. Но ни в рецепте, ни в tests/fixtures/herdr-extraction/ не сказано, что эти два литерала — временные заглушки, ожидающие измерения P6. Достаточно комментария в рецепте, заголовка/README у фикстур и
  строки в беклоге, привязывающей литерал к измеренному значению P6.

  5. Код возврата рецепта релея смешивает «не отправлено» и «отправлено, но истёк wait»

  herdr-mechanics.md:620-621: и отказ валидации до spawnSync, и таймаут herdr agent prompt --wait дают один и тот же молчаливый exit 1. Правило «никогда не пересылать возможно доставленный ход» держится целиком на
  внешнем захвате сигналов оркестратором. Учитывая, что исходная жалоба пользователя была именно про потерянные/повторные отправки, отдельный код возврата после spawnSync сделал бы «уже отправлено» механически
  различимым, а не выводимым.

  6. Мелочи

  - mo-smoke поднимает только копию mo-herdr, хотя спека говорит про «isolated generated helpers»; побайтовая идентичность копий проверяется тестом, так что покрытие транзитивное — но mo-lint/mo-smoke читаются как
  неполные.
  - oid-регексп ^[0-9a-f]{40,64}$ принимает длины 41–63, невозможные для Git. Практически не эксплуатируется (кандидат всегда из git rev-parse), но слабее формулировки «full Git object ID».
  - Гигиена VCS: локальный (непушнутый) develop указывает на 5738907, а этот коммит правит src/skills/mo-review|mo-setup|mo-reuse/SKILL.md — то есть работа делалась прямо на develop, что запрещено собственным
  правилом проекта. Сгенерированные копии в том же коммите присутствуют, так что дерево осталось согласованным.
```

```text
• Нашёл 3 блокирующих замечания.

- [P1] Канонический формат surface support key противоречив. Финальная схема требует 7 компонентов — backend, provider, provider-version, backend-version, surface, os, fixture (shared/references/
  methodology.md:244), но канонический glossary и нижележащие инструкции определяют 5-компонентный ключ backend/provider/version/surface/fixture (docs/glossary.md:126, shared/references/methodology.md:792, src/
  skills/mo-herdr/references/herdr-mechanics.md:770). Это допускает перенос evidence между разными версиями backend и OS, хотя контракт его запрещает. Нужно везде оставить одну точную семикомпонентную форму.

- [P1] Установленный mo-herdr зависит от недоступной ему карты fixtures. Skill ссылается на docs/phase-0-fixtures.md как источник ключей и support posture (src/skills/mo-herdr/SKILL.md:43), но этот файл не входит
  в пакет mo-herdr, а mo-setup не создаёт его в целевом проекте (src/skills/mo-setup/SKILL.md:19). После activation читать tracked project content дополнительно запрещено. В результате отдельно установленный
  skill не может определить, какие exact fixtures имеют SUPPORTED, и честно сформировать финальные support facts. Нужен самодостаточный packaged reference либо явно определённый pre-activation input.

- [P1] Реализация пока не удовлетворяет собственным completion criteria. Все P1–P8, H7b/H13–H37 и OM1–OM8 остаются PENDING/UNSUPPORTED (docs/acceptance.md:53, docs/acceptance.md:67, docs/acceptance.md:102), тогда
  как спека разрешает представлять реализацию к adoption только после этих прогонов на одном SHA (spec/2026-08-08-herdr-orchestrator-operational-corrections/spec-review.md:1074). Это честно отражено в
  документации, но означает, что сейчас можно принять только детерминированную часть, не работоспособность Herdr/Omnigent маршрутов.
```

### Local-only correction request — 2026-08-11

> давай уже без своих сабагентов когда исправишь все найденное
> дальше я буду тебе скидывать замечания

### Review corrections — 2026-08-11

> A. §1 методологии не знает о новом обязательном pre-activation входе. Раздел, который владеет границей активации, по-прежнему перечисляет только контракт проекта, opaque-локатор и §2.1-append: «Activation cannot
> proceed while those copies differ or an applicable intent is absent». Про карту фикстур сказано только в §9 и в двух backend-скилах, хотя она блокирующая. Тот, кто следует §1, активируется без неё. Правка — одно
> предложение в §1.
>
> B. Перечисление «exact layout» промпта не допускает строку задания. methodology.md:175 («…after the whole goal/objective, executor capsule when applicable, and inbound relay when present») и spec-review.md:693
> («goal/objective, capsule when executor-bound, inbound relay when present, and one fresh MO_PROMPT_BOUNDARY_V1») перечисляют состав промпта как исчерпывающий, а §2.5, механика и docs/e2e.md требуют четвёртый
> элемент — MO_E2E_ASSIGNMENT_V1 предпоследней строкой. Правка — по одной оговорке в каждом месте.
>
> Рекомендация (не дефект): контракт проекта требует, чтобы новая граница фиксировалась в docs/architecture/. Про новый входной формат там пока только сквозные упоминания «pre-activation row»; причина живёт в спеке
> и §9. Двух строк в архитектуре хватит, чтобы правило соблюдалось буквально.

### Project-instruction backlog request — 2026-08-12

> в беклог допиши что надо более формально описать что должно быть в agents/claude (то что реально нужно каждому агенту на каждом запуске и то что иначе не попадет в исполнителя)
>
> точно соглашение по коммитам
> возможно базовые команды проекта
> про беклог - вероятно
> возможно ввести еще papercut - писать в доку на каких командах агент ошибался чтобы позже делать из этого выводы для скилов или что-то важное в agents/claude докидывать (чтобы агент не тупил каждый раз на одних и тех же хитрых командах)
> возможно стоит написать про то что пользователь может использовать диктовку а она несовершенна - могут быть странные опечатки/неправильные распознавания
> явно не надо про архитектуру проекта и тд тут писать - только ссылки
>
> но файлы эти надо держать небольшими

### Standalone knowledge and README backlog request — 2026-08-12

> еще в беклог допиши что надо чтобы в ридми тоже были ссылки на docs
> ну и чтобы в readme было человекопонятное описание проекта
>
> а еще надо чтобы наш слой знаний (+agents+claude+readme) не ссылались ни на какие скилы
> те чтобы человек работащий просто с агентами без наших скилов и без нашей методологии не испытывал проблем
> и это надо будет сделать бизнес-правилом текущего проекта-методологии

### Backlog is not progress — 2026-08-12

> а по этому чату допиши еще в беклог наблюдение
> я заметил что агент использует backlog как прогресс, а так не задумано
> в backlog надо писать только то что мы отложили потому что я так решил или потому что агент в рамках реализаци посчитал что в эту итерацию он это делать не хочет/не может
> но явно не надо там фиксировать текущий прогресс (часто)

### Language policy backlog request — 2026-08-12

> еще в беклог допиши что надо навести порядок с языками
> хочу чтобы readme/buisiness/docs писались на языке пользователя (по идее можно понять как раз на основе buisiness/readme)
> а все что к коду относится (комменты и тд) - уже на английском

<!-- meta-o-later-user-intents-v1:end -->

### 22. Recovered original task description — 2026-08-10

The complete task-description payload is retained as one accountable unit so
that no report item, clarification, or project constraint can disappear through
selection or re-heading. A sentence expressly superseded later inside this
payload remains historical intent and has no normative force.

````meta-o-user-intents-v1 task-description.md
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
````

<!-- markdownlint-enable MD013 -->

### What that means for the product, in the user's terms

- the previous generation was **too thick** — the fault was misplaced emphasis,
  not missing features, so the fix is deletion plus a written methodology;
- nothing is postponed to make a round look finished;
- authority comes from the tool that owns the answer, never from a plausible
  guess about its interface.

---

## Part 2 — the durable theses

## A spec keeps the user's words, not only their interpreted requirements

The business framing remains the independent verbatim source, but every task/spec
also carries every user intent word for word. Summaries, derived requirements and
links are useful additions and never replacements. A later clarification appends
to both documents before implementation continues, so a reviewer can detect both
transport loss and a wrong interpretation.

## A feature must be verifiably done, not plausibly done

A model reports success it has not observed — not from malice, from the same
optimism that makes a person say "that should work". The cost lands later, on
whoever trusted the report.

So "done" has to be a property of evidence: one named commit, checked by parties
who each say what they checked. When the checks do not describe the same commit,
the feature is not done, however confident anyone sounds.

## Human time is more expensive than tokens

A human is interrupted for product meaning, an irreversible action, credentials,
a subscription change, a genuinely unresolvable dispute — and for nothing else.
An orchestrator that asks "what should I do?" has pushed its own work onto the
person it exists to serve. It states a hypothesis and asks one question.

## One model is not enough

Two independent reviewers exist so that one model's blind spot is not the
project's blind spot. At least one comes from a different vendor than the author.
The moment the second review is derived from the first, both are one review, and
the cross-vendor property that justified the cost is gone.

## Writing code is cheap; maintaining accumulated layers is not

The expensive failure is not a syntax error. It is a working system that
implements a misunderstood intent, or a second architecture growing quietly
beside the first. So reviews carry an architecture lens and the blunt question
_why does this need to exist at all?_ — and so does this project about its own
code.

## A control layer must earn its keep

The previous generation of Meta-O had a CLI, a state machine, a run store, gate
receipts, snapshot digests, structured findings transport, session adapters, and
installer scripts. Each was defensible on its own. Together they were a workflow
engine that spent its attention on itself, wrapped CLIs the agent could already
use, and had to be recovered before any feature could be.

The capability was already there: native `/goal`, native sessions and resume, a
terminal multiplexer with its own control plane, Git. What was missing was a
methodology, written down, that says who does what and what counts as evidence.
That is what this project ships now.

## Deferred work that nobody wrote down does not exist

Anything postponed, blocked, or knowingly left unfixed goes into
`docs/backlog.md` with its reason, its practical impact, and the next step. A
decision that only lives in a session transcript is a decision the next session
will make differently.

## The methodology is itself a project

It gets the same treatment it prescribes: a contract it can be held to, gates it
actually runs, and reflection only when something really failed — not a ritual
after every change.

## Review feedback received on 2026-08-15

<!-- prettier-ignore-start -->

```text
ниже 2 ревью

---

  1. [P1] Paseo follow-up может заблокировать оркестратор.
     В shared/references/paseo-mechanics.md:52 используется paseo send ... --json без --no-wait. В установленном Paseo 0.3.1 send по
     умолчанию ждёт завершения агента. В результате оркестратор после follow-up не сможет параллельно обслуживать новые вопросы или
     permission requests. Та же проблема есть у watchdog в shared/scripts/mo-watchdog.sh:155: nudge при лимите способен зависнуть,
     ожидая завершения агента. Здесь нужен неблокирующий send --no-wait, после которого состояние отслеживается отдельно.

  2. [P1] Watchdog не реализует подавление повторного идентичного nudge.
     Скрипт сравнивает два чтения только внутри одного запуска (shared/scripts/mo-watchdog.sh:128), но после отправки ничего не
     сохраняет. Повторный запуск с тем же сообщением и неизменным состоянием снова отправит nudge. Более того, src/skills/mo-
     watchdog/SKILL.md:15 прямо перекладывает это на “operator judgment”, хотя spec требует эту возможность от скрипта. Тест
     проверяет лишь изменение состояния между двумя чтениями, а не повтор идентичного nudge между запусками.

  3. [P2] scan классифицирует весь backend одной агрегированной строкой.
     В shared/scripts/mo-watchdog.sh:76 вывод всех сессий передаётся в один classify, после чего печатается один state на backend.
     Например, одна завершённая и одна работающая сессия могут быть представлены как общий completed; locator и состояние каждой
     сессии не сообщаются. Кроме того, у Orca ошибка worker-list маскируется успешным terminal list, поскольку сохраняется статус
     только последней команды. Это не выполняет требование сканировать и сообщать состояние всех сессий/панелей.


---

  Блокирующее

  1. Nudge watchdog для Orca не срабатывает никогда — подтверждено запуском.
  Подавление сравнивает побайтово весь вывод «до/после» (mo-watchdog.sh:140). Но у Orca RPC-конверт содержит свежий UUID id на
  каждый вызов. Два последовательных чтения одной сессии:

  < "id": "7ee2d2e6-2a84-4604-b50c-034d4b6bd952"   < "lastOutputAt": 1786741652302
  > "id": "abbe4945-701c-4afa-a4e4-dccc0672368e"   > "lastOutputAt": 1786741654527

  Следствие: target --backend orca … --nudge всегда печатает state=changed action=suppressed и выходит 2 — для ctx_, task_ и term_
  одинаково, независимо от реального состояния. Тесты это structurally не ловят: nudge проверяется только на фейковом herdr со
  статичным выводом, а orca-тест покрывает лишь observe и scan. Сценарий W3 объявлен живым — для Orca он пройти не мог.

  2. Nudge у Herdr и Paseo блокируется на неопределённое время.
  mo-watchdog.sh:147 вызывает herdr agent prompt … --wait без --timeout, а справка самого Herdr гласит: «Without --timeout, the
  settled-state wait is indefinite». mo-watchdog.sh:155 вызывает paseo send без --no-wait, а он по умолчанию ждёт завершения ответа.
  Наблюдатель, существующий ровно для случая «агент упёрся в лимит или инференс перегружен» (ваш интент), вместо «пнул и продолжил
  наблюдать» повисает на весь ход агента. Наблюдателю ответ вообще не нужен — --wait здесь лишний по смыслу.

  3. У Herdr нечем доказать полный settled-ответ (B8/B9, критерий приёмки 5).
  herdr agent get на установленной версии не содержит поля ответа — только метаданные сессии (проверил: agent, agent_status,
  pane_id, revision, state_change_seq, terminal_*, workspace_id). Значит остаётся только agent read --source recent-unwrapped, то
  есть терминальный снимок, который ваш же backend-contract.md относит к «не доказывает полное извлечение». При этом новая
  herdr-mechanics.md (69 строк) потеряла операционную деталь, без которой длинный ответ физически не забрать: в старой версии была
  лестница --lines (120, 200, 400…), теперь --lines не упомянут вовсе. Плюс справка Herdr предупреждает, что строки, ушедшие с
  alternate screen (а это ровно TUI Codex/Claude/OpenCode), в scrollback не попадают и увеличением --lines не восстанавливаются.
  Детерминированные фикстуры tests/fixtures/herdr-extraction/* при этом удалены без замены.

  4. scan классифицирует бекенд целиком, а не сессии — подтверждено живым прогоном W2.
  Четыре Herdr-агента со статусами done/done/idle/idle дали одно backend=herdr state=completed. У Orca два stopped/failed воркера
  перекрыли реально работающего Claude (✳ Sprouting…) → state=failed. Пустой Paseo → unclassified вместо «нет сессий».
  mo-watchdog/SKILL.md обещает «Report the native locator, classified state and action», но scan не выдаёт локаторов вообще — только
  сырой дамп. Главная ценность scan (найти, какая сессия встала) не достигается.

  Существенное

  5. purpose-and-architecture.md больше не попадает ни в один ревью-скилл. До этой фичи он шипился в mo-review (git show
  1c7d885:tools/build-skills.mjs:83-84), теперь — только в mo-setup. По спеке он владеет guidance для архитектурного ревью, а
  reviewer B по протоколу отвечает за «architecture, simplicity, maintainability», то есть остался без определения правила purpose,
  которое сам же должен требовать. Тест «shared ownership and build distribution are preserved» этот класс не проверяет.

  6. qc-python.md и qc-typescript.md — осиротевший груз. Они уезжают в установленный mo-setup, но на них не ссылается ни SKILL.md,
  ни project-setup.md; агент, которому велено прочитать три другие ссылки, до них не дойдёт. А это именно та субстанция, которой
  спека требует проверять линтеры цикломатической сложности и размера.

  Мелкое

  7. Устаревшая лексика в точке входа. AGENTS.md/CLAUDE.md всё ещё говорят «Full-turn retrieval», и файл называется
  full-turn-retrieval.md, хотя его H1 теперь «Complete responses stay on public backend surfaces», спека ввела «Settled final
  response», а глоссарий термина «full turn» не содержит. Вы прямо возражали против «полного turn» — правка дошла до содержимого, но
  не до заголовка и имени файла.

  8. Тесты вшивают переносы строк прозы (/does not inspect, judge\nor edit product code/). proseWrap: preserve смягчает, но любая
  переформулировка потребует правки тестов — это приглашение их ослаблять; последний коммит ветки был ровно про это.

  Чего я подтвердить не могу

  Критерии приёмки 3–8 и 12 — живые, и docs/acceptance.md сознательно не хранит вердикты («Current-run verdicts stay in the final
  report»). Из дерева они недоказуемы by design, поэтому нужен ваш отчёт по B1-B14 × 3 бекенда и W1-W4. Два места вызывают отдельный
  вопрос: строка беклога 7 (standalone review) по матрице удаляется только после прохождения живой приёмки всеми тремя бекендами, а
  строка 13 — только после воспроизведения всех четырёх Herdr-кандидатов; обе удалены, доказательств в дереве нет. Findings 1 и 3
  заставляют думать, что W3 и B8/B9 в полном объёме не проходили.

  Побочно, из живого скана: у Orca висят два воркера dispatchStatus: failed, terminalState: retained, releaseState: not_requested,
  counts.retained: 2 — по вашей же механике их следовало закрыть worker-release. И у opencode-агента в Herdr стоит
  screen_detection_skipped: true, что прямо ставит под вопрос B4/B7 для OpenCode.
```

<!-- prettier-ignore-end -->
