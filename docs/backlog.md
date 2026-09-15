# Бэклог

Здесь находится только намеренно отложенная, заблокированная, заведомо
неисправленная или неподдерживаемая работа. Текущий прогресс и временное
состояние gates остаются в локальных планах запуска.

Каждая будущая запись — раздел третьего уровня с полями `Причина.`,
`Практическое влияние.` и `Следующий шаг.`. Пустой раздел открытых записей
означает, что известных реальных deferrals сейчас нет.

## Открыто


Прежде всего скажу: текущая версия получилась прям годной! Минимум пинков приходится делать.
То что ниже конечно надо поправить но главное качество не уронить. Думаю эвалы наши пошли на пользу.


### Ревью и сабагенты

> а почему ты написал что ревью без сабагентов?
> 
> Потому что в брифе был прямой запрет: «Do NOT start another reviewer or subagent»

Пожалуй если это полезно можно разрешить или даже потребовать чтобы ревьюеры а/б первое ревью (с момента их запуска) делали с сабагентами (но ограничить их количество - не больше 8), а уже повторные ревью/проверки исправления в той же сессии - без сабагентов
Надо это или нет - под вопросом, надо подумать. Возможно сосредоточенные на определенных вопросах сабагенты будут лучше работать - это не точно. Надо свериться с deep-research которые входили в эту спеку (или я их куда-то подкладывал, скажи если не найдешь)


### Куда ревьюеры сохраняют отчеты

Вижу что вот такое в исполнителе-оркестраторе cat /tmp/mo-review/reportB.md
Или это оркестратор (а точнее исполнитель где я для краткости запустил скилл ревь) туда сохранил - не очень уникальное имя, вот что меня беспокоит. Надо бы как-то поуникальнее, но без фанатизма


### Названия вкладок

Вроде в прошлом беклоге я просил чтобы оркестратор переименовывал вкладки в соответствии с ролями.
Сейчас я попробовал скилл ревью чисто для небольшой работы прямо из исполнителя - вкладки не переименовывались.
Те эта штука если реализована должна быть правильно разложена между скилом оркестрации и скилом ревью чтобы даже скилл ревью запущенный отдельно переименовывал своих ревьюеров.


## Когда оркестратор/исполнитель закрывает терминалы ревьюера

Вижу вот такую ошибку на месте закрытой вкладки. Надо бы разобраться откуда это и что делать чтобы вкладки закрывались полностью.
Remote terminal was closed.
If this persists, please file an issue.

А иногда он их не закрывает...


## Issues/backlog

Всё больше прихожу к мнению что надо реальные ошибки найденные в проекте писать в github/gitlab issues, а беклог оставить агенту для "записулек" и требовать/добиваться чтобы он был пустым и в начале и в конце работы над спекой

## Нужно чтобы оркестратор и/или исполнитель вызывающий ревьюеров при быстром фиксе знали как с этим работать правильно

```
Accessing workspace:

 /mnt/SMALL/Bitrix/traces

 Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source
 project, or work from your team). If not, take a moment to review what's in this folder first.

 Claude Code'll be able to read, edit, and execute files here.

 Security guide

 ❯ No, exit
   Yes, I trust this folder

 Enter to confirm · Esc to cancel
 ```


 ## Когда ревьюеры заявляют ошибку - пусть говорят ожидаемую глубину/способ исправления

Часто вижу кейсы когда ревью вернуло замечания, исполнитель исправил а ревью повторное говорит что фигово/неглубоко исправили или просто спустил проблему на уровень ниже но не исправил.

Надо проверить/поправить что мы требуем от рвьюеров. По идее не просто замечания надо но и ожидаемый/предлагаемый способ их исправления. Иначе мы долго топчемся на месте с ревью/исправлениями.

## Скилл ревью - только явно

Заметил что пару раз агент у которого был доступ к скилу ревью считал его подхоящим и без моего указания запускал. так не надо.
Скилл ревью должен запускать либо тот кто прочитал скилл оркестрации либо я сам вручную

Вероятно то же применимо и к другим местным скилам (кроме senior) - если будут сомнения задавай вопросы и разберем каждый скилл отдельно


## Пару раз видел проблему с вызовом кодекса

• Проблема была двухчастная; для backlog её лучше разделить на основной Orca defect и fallback/documentation defect.

  1. Основной defect — composed Codex launch доставляет task слишком рано или не туда.

  - Команда: orca orchestration worker-start ... --worktree current --agent codex --model gpt-5.6-sol --effort high.
  - Orca успешно создал terminal и подтвердил launch.requested == launch.effective.
  - Затем дважды подряд завершил Dispatch на стадии dispatch_input с agent_prompt_stalled.
  - В worker-show было видно, что полный текст review-задачи попал не в Codex TUI, а исполнился оболочкой zsh; итог: zsh: parse error near
    ')'.

  - Первый Dispatch: ctx_d169698714b8, replacement через --retry-of: ctx_ee51b716d2df.
  - Оба раза product review не начался.
  - Orca app: 1.4.195, runtime 2282f168-770a-48a7-931d-4f838740816f.

  Ожидаемое поведение: worker-start должен дождаться распознанного Codex TUI, доставить task внутрь него и вернуть input_accepted; при
  невозможности — не отправлять task в shell.

  2. Fallback/documentation defect — неясное владение unsandboxed-флагом.

  - По fallback-рецепту был создан terminal с явным --dangerously-bypass-approvals-and-sandbox.
  - Orca launcher сам уже добавил этот флаг, поэтому Codex завершился с cannot be used multiple times.
  - После удаления явного флага тот же fallback успешно запустился, tui-idle подтвердился, а dispatch --inject доставил задачу.

  Ожидаемое улучшение skill-а: fallback-рецепт должен явно говорить, как определить, что wrapper уже добавляет posture flags, либо давать
  команду без их дублирования для Orca-managed terminal.


## Странное поведение при ревью из исполнителя

Я из исполнителя запустил скилл ревью и 1 раз из кучи таких запусков поймал проблему
Причем это была первая итерация ревью из 5 которые я разрешил исполнителю запускать

```
› а это ты закрыл claude-ревьюера?
  если да то почему (кодекс-ревьюер висит живой)
  в любом случае я бы попросил тебя его восстановить (resume) когда дойдешь до повторного ревью чтобы в горячем контекте проверять
  исправления


• Да, Claude я закрыл через worker-release сразу после его worker_done: так требует $mo-review-orca перед изменением кандидата, а Orca
  сохранил transcript archive. Codex тоже уже завершил отчёт; живым остался только его fallback-терминал, потому что low-level dispatch не
  числится owned resource и worker-release вернул no_owned_resource.
```


## Названия вкладок

В прошлом беклоге вроде бы было требование чтобы оркестратор переименовывал вкладки (а по-хорошему еще и цвета им назначал). Но что-то я не наблюдаю чтобы это было реализовано


## Когда из испольнителя вызвал скилл ревью

• Fallback обнаружил launch-wrapper Orca: он уже добавляет unsandboxed posture, поэтому переданные мной -s/-a конфликтовали с wrapper и
  Codex сразу завершился. Закрываю только созданный мной неуспешный terminal и повторяю fallback без дублирования posture-флагов.


Я уверен что мы уже это исправляли
Напоминаю - клод и кодекс уже должны быть обернуты для запуска без песочниц, наш setup-skill об этом должен заботиться

## Внезапно после десяктков успешных использований ревью-скила из исполнителя (короткие задачи) кодекс стал тупить

Вместо того чтобы получить ревью и пойти исправлять - исполнитель стал мне длинное полотно с найденными замечаниями показывать.
Кажется он невнимательно стал читать скилл, хотя сам скилл не менялся.
В любом случае если уж я попросил этот скилл его прочитать (через $mo-reivew-orca) то он должен его полностью прочитать а не выпендриваться

Мне бы хватило сводки сколько p1/p2/p3 каждый из ревьюеров нашел (регрессии же туда же включаются?)


## Внезапно исполнитель со скилом ревью открыл еще 1 вкладку клода

так, а объясни почему у тебя открыто 2 вкладки клода и 1 кодекса
    ты решил еще 1 клода открыть чтобы он исправлял?

```
• Да. Это три разные изолированные роли:

  - Claude marta-guard-candidates:executor — единственный, кто исправляет код и делает коммиты.
  - Claude marta-guard-candidates:review:claude — только независимое ревью, код не меняет.
  - Codex marta-guard-candidates:review:codex — второе независимое ревью, код не меняет.

  Один и тот же Claude-сеанс нельзя безопасно использовать одновременно как executor и reviewer: reviewer не должен проверять собственные
  изменения и получать чужой review-контекст. Сейчас executor уже закончил первый fix-коммит и оставлен hot; два reviewer выполняют
  follow_up. Лишних ролей или вкладок нет.
```

Но так не надо было делать. Это же скилл ревью а не оркестрации.


## Систематически вижу что claude все равно пытается во вкладке ревьюера писать резюме а кодекс - нет

кодекс
```
• The review has now falsified several core guarantees with isolated read-only probes: partial-consumption helpers crash without a report,
  default buffer limits can terminate large fast plans, malformed advisory totals are not ignored, and malformed batch correlation is
  accepted. I’m finalizing the evidence-backed report now; the repository remains at the exact candidate SHA with a clean status.

• Ran report=$(cat <<'EOF'
  │ Executive summary: I independently reviewed candidate 8d95823c7879901f9d89f85fd7a123296dee071b against the canonical batched-keyset
  │ restoration specification and the complete deep-review scope, without modifying the repository. The implementation has two P1
  │ … +252 lines
  └ Sent msg_b53722db8acf
```

клод
```
⏺ Review complete and reported (worker_done sent once, outcome succeeded, full report in the body plus --report-path).

  Verdict: FINDINGS on 8d95823c7879901f9d89f85fd7a123296dee071b (deep mode requested and effective; HEAD matched exactly, worktree clean at
  start and end; no repository file created, edited, or deleted).

  P1 — Fast keyset streams raise ValueError: unique_rows cannot exceed emitted_rows and leave report is None on any early close that isn't
  chunk-aligned. OrderedAdmissionState counts unique_rows at admission while emitted_rows counts at delivery, and KernelReport enforces
  unique_rows <= emitted_rows. Reproduced on a healthy transport at n=1, 2, 7 (n=5 passes only because it lands on the page cap — which is
  why none of the 28 committed tests hit it). The baseline sequential path on the identical input returns early_closed with a report, so
  causality is the candidate.

  P2 ×5 — unbounded per-identity + per-row SHA-256 retention where the baseline keyset path deliberately uses an O(1) monotonic store; the
  spec-mandated behavior-neutral extraction never happened, leaving a second parallel traversal implementation (driver.py et al.
  untouched); the "single scheduler" is split into a 387-line self: Any mixin past its allowlisted ceiling with a runtime scheduler→stream
  import; confirmed zero coverage of finalize, SHORT_PAGE_EXHAUSTS, advisory totals, two of four closure witnesses and the trace quotas,
  plus single-cell live admission; and a dead, exported, value-zeroing report builder that is the one the spec names as normative.

  P3 ×5 — wrong preselection_reason for explicit partitioned on overlapping boundaries; a tested: marker naming a nonexistent test (recipes
  markers aren't validated); descending lanes missing LATTICE_FULL; undeclared public raw_rows field; dead branches in _admit_tail.

  Two process notes worth flagging: my first call-path probe rebound keyset_auto module attributes the scheduler had already imported by
  name, which produced two invalid zero-counts — I reran it against the scheduler's own bindings, and the corrected run is what the report
  cites. I also refuted three candidate findings during verification rather than reporting them (the apparent double release_page is safe
  because release_page is idempotent; canaries do catch the simple empty-descending-page case). The one path I could not ground — an
  unguarded min() on an empty descending boundary page — is recorded under Unknowns, not as a finding.
```

я бы сказал что и то и то не очень
нужно по 1 предложению (короткому) на каждую найденную проблему писать чтобы я визуально мог понимать много осталось ошибок или нет


## А наши orca-скилы точно знают про необходимость проверять Orchestration skill?

Когда я делал скилы завязанные на orca я хотел чтобы мы из самой orca использовали ряд скилов которые нам полезны. Чтобы ставили их as is а в наших скилах уже говорили мол "вот тебе shorthands для типовых операций, а эти вот скилы прочитай когда нужно будет больше про orca узнать"

Ну и я думал что это (наличие нужных orca-скилов у нас проверяется для claude/codex/opencode - смотря что установлено). А по факту кажется нет


## Еще 1 пример неправильного управления ревьюерами

> а зачем ты кодекс-ревьюера закрыл?

```
• Это была моя ошибка в управлении ресурсами: я применил общее правило «после worker_done освободи воркер», хотя при FINDINGS по mo-review-
  orca ревьюера надо держать горячим для follow-up на его собственные замечания. Вернуть именно ту сессию уже нельзя; её отчёт сохранён
  Orca, поэтому итерацию 13 Codex начнёт свежим, но получит только свой полный предыдущий отчёт. Дальше при FINDINGS закрывать ревьюеров до
  remediation не буду. Сейчас продолжаю ждать Claude по итерации 12.
```


## Найденные ревьюерами проблемы должны оставаться "в памяти"

Если ревьюеры долго пытхтели и нашли баги нам нужно
- сначала воспроизвести их тестом
- в описании теста объяснить суть проблемы (коротко)
- в местах исправления (где переписываем/дописываем много кода) оставить коммент "почему теперь логика такая"

При этом исправляет исполнитель, а значит оркестратор должен ему этот принцип донести в задании