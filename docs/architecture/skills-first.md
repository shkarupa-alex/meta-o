# Скилы и reasoning — слой оркестрации процесса

## Решение

В Meta-O нет executable router, finite-state-machine service, run registry,
provider proxy, backend adapter или persisted orchestration state. Entry-скилы
дают активному агенту lifecycle, review standard и конкретную native-механику
backend; agent reasoning выбирает следующее безопасное действие.

Orchestrator управляет процессом и сессиями, но не читает, не оценивает и не
редактирует product code. Репозиторий читают executors, reviewers и E2E actors.
До активации orchestrator может прочитать task intent и использовать Git metadata,
нужные для идентификации одного чистого полного candidate SHA.

## Бизнес-причина

Предыдущее поколение накопило второй workflow engine вокруг инструментов, уже
владеющих sessions, state и transport. Каждый дополнительный receipt, registry,
adapter и recovery protocol создавал ещё одну правду, способную разойтись с Git
или backend. Продукт существует, чтобы координировать эти инструменты, а не
заменять их.

## Общее и backend-specific владение

`shared/references/methodology.md` владеет lifecycle, autonomy, questions и
completion. `review-protocol.md` владеет общей семантикой review и backlog.
`backend-contract.md` владеет минимальными observable capabilities. Механики
Herdr, Orca и Paseo владеют точными native commands. Отдельные фиксированные
entry-скилы используют эти references: семантика backend остаётся явной, а
стандарты не дублируются.

## Evidence и restart

Один verified result — один полный Git object ID. Новый commit обнуляет каждый
gate. Missing или unreadable evidence — `unknown`, его получают заново. Run
evidence понятно человеку и эфемерно; manifest, receipt, digest, baseline,
registry или external evidence sink не создаются. Private delivery digest
watchdog не является run evidence: у него один внешний consumer и явная семантика
удаления, описанная в
[Deduplication nudge watchdog хранит один private digest](watchdog-nudge-deduplication.md).

Restart начинает новый run и не переиспользует прежний gate или scratch state.
Работа может повториться, зато recovery database не сможет одобрить stale evidence.

## Граница человека

Orchestrator самостоятельно принимает технические, дешёвые и обратимые решения
и сообщает о них в конце. Пользователь решает вопросы product meaning,
credentials, subscriptions, необратимых действий и дорогих в изменении choices.
Необязательный watchdog запускается только по явному запросу.
