# Why Meta-O exists

Two halves, and they must not be merged. **Part 1** is the business framing: what
the user asked for, in their own words, kept verbatim and appended to as they say
more. **Part 2** is the durable theses derived from it, in terms that have nothing
to do with how anything is built; every decision in `docs/architecture/` cites one
of those.

The framing is the half that gets quietly "tidied" into a summary, and a summary
is exactly what cannot be re-read after the compression. The rules are in
`shared/references/methodology.md §2.1`.

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
`shared/references/methodology.md §2.1`.

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
