# §A-ORCHESTRATION-01 — Скилы и рассуждения — слой оркестрации процесса

```yaml
knowledge_id_changes:
  - action: reuse
    id: §A-ORCHESTRATION-01
    reason: >-
      Решение запрещало собственный proxy/driver, но не говорило, чем тогда
      доказываются real-run incident families, и §3.9 читалась как требование
      несуществующего fake-Orca replay для поведения агента.
    new_boundary: >-
      Решение теперь задаёт границу детерминированной регрессии: fake-контроль
      покрывает публично наблюдаемые families, остальные — именованное
      утверждение о правиле инструкции плюс named live E2E.
    references_updated: true
```

## Решение

В Meta-O нет executable router, finite-state-machine service, run registry,
provider proxy, backend adapter или persisted orchestration state. Entry-скилы
дают активному агенту lifecycle, review standard и конкретную native-механику
backend; agent reasoning выбирает следующее безопасное действие.

Orchestrator управляет процессом и сессиями, но не читает, не оценивает и не
редактирует product code. Репозиторий читают executors, reviewers и E2E actors.
До активации orchestrator может прочитать task intent и использовать Git metadata,
нужные для идентификации одного чистого полного candidate SHA.

Отсюда следует граница детерминированной регрессии. Fake-контроль воспроизводит
ровно те real-run incident families, которые видны на публичной поверхности
backend через единственного исполняемого consumer этого проекта — watchdog.
Остальные families принадлежат поведению агента: их регрессия — именованное
утверждение о конкретном правиле поставляемой инструкции плюс named live E2E
scenario. Собственный driver, replay proxy или state machine для их
воспроизведения запрещены этим же решением, поэтому «нет fake-Orca прогона» —
принятое ограничение, а не отложенная работа.

## Бизнес-причина

Предыдущее поколение накопило второй workflow engine вокруг инструментов, уже
владеющих sessions, state и transport. Каждый дополнительный receipt, registry,
adapter и recovery protocol создавал ещё одну правду, способную разойтись с Git
или backend. Продукт существует, чтобы координировать эти инструменты, а не
заменять их.

Решение служит §B-CONTROL-04, §B-CONTROL-01 и §B-CONTROL-03: управляющий слой
обязан оправдывать своё существование, оркестратор управляет процессом, а не
кодом, и там, где достаточно суждения, протокол не заводит счётчики и структуры.
Если §A-ORCHESTRATION-01 отменяется, entry-скилы и общие references перестают
быть носителями lifecycle: их место занимает отдельный workflow engine, а вместе
с ним возвращаются run registry и recovery-протокол.

## §A-ORCHESTRATION-02 — Общее и backend-specific владение

`shared/references/methodology.md` владеет lifecycle, autonomy, questions и
completion. `review-protocol.md` владеет общей семантикой review и backlog.
`backend-contract.md` владеет минимальными observable capabilities.
`orca-mechanics.md` владеет точными native commands. Отдельные orchestration и
review entry-skills используют эти references: механика backend остаётся явной,
а стандарты не дублируются.

Раздельные entry при общем протоколе — это §B-REVIEW-04, а запрет дублировать
стандарты — §B-CONTROL-04. Без §A-ORCHESTRATION-02 общие references лишаются
владельца, и каждая backend-механика начинает хранить свою копию lifecycle.

## §A-ORCHESTRATION-03 — Evidence и restart

Один verified result — один полный Git object ID. Новый commit обнуляет каждый
gate. Missing или unreadable evidence — `unknown`, его получают заново. Run
evidence понятно человеку и эфемерно; manifest, receipt, digest, baseline,
registry или external evidence sink не создаются. Private delivery digest
watchdog не является run evidence: у него один внешний consumer и явная семантика
удаления, описанная в
[§A-WATCHDOG-01 — Дедупликация подсказок watchdog хранит один закрытый дайджест][watchdog].

Restart начинает новый run и не переиспользует прежний gate или scratch state.
Работа может повториться, зато recovery database не сможет одобрить stale evidence.

Эфемерное evidence — §B-PROOF-01 и §B-CONTROL-04, а отказ от механики
восстановления — §B-UPTIME-04. Единственное исключение из обнуления — узкий
перенос результата сквозной проверки через документарную правку по §B-PROOF-05:
он требует подтверждения обоих финальных ревьюеров и никогда не переносит ревью
или детерминированные проверки. Отмена §A-ORCHESTRATION-03 сразу требует
хранилища прогонов и протокола инвалидации, которых сейчас нет.

## §A-ORCHESTRATION-04 — Граница человека

Orchestrator самостоятельно принимает технические, дешёвые и обратимые решения
и сообщает о них в конце. Пользователь решает вопросы product meaning,
credentials, subscriptions, необратимых действий и дорогих в изменении choices.
Необязательный watchdog запускается только по явному запросу.

Граница взята из §B-HUMAN-01 и §B-HUMAN-02: человека зовут только туда, где без
него нельзя, и не назначают нянькой процесса.
Если §A-ORCHESTRATION-04 отменяется, классификация human-only questions и
ограничение на старт watchdog становятся лишними; процессу нужен другой
явный owner решений и прерываний.

[watchdog]: watchdog-nudge-deduplication.md
