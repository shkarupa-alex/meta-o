# §A-MEMORY-01 — Уровни знаний связаны уникальными идентификаторами

```yaml
knowledge_id_changes:
  - action: reuse
    id: §A-MEMORY-01
    reason: >-
      Historical gate не проверял ссылки на каждом commit, считал deletion
      унаследованным от parent, который просто ответвился до создания id, и
      выключал semantic-проверку по неявно вычисленной границе.
    new_boundary: >-
      Решение задаёт три проверяемых уровня истории: deletion и ссылки от
      cutoff, semantic reuse от явно закреплённого commit, а merge-inheritance
      только при реальном удалении на другой стороне.
    references_updated: true
  - action: reuse
    id: §A-MEMORY-01
    reason: Durable defect memory добавила regression/invariant rules к цепочке знаний.
    new_boundary: Поведенческий defect связан с test, а non-obvious repair — с invariant comment.
    references_updated: true
  - action: reuse
    id: §A-MEMORY-01
    reason: Проверка authorization выбирала первую историческую запись и разрешала ею все последующие semantic reuse.
    new_boundary: Начиная с current_record_enforcement_sha каждый parent edge требует отдельную подходящую запись с содержанием, которого не было в owning decision у parent.
    references_updated: true
  - action: reuse
    id: §A-MEMORY-01
    reason: Resolvable sibling boundary отключала enforcement, а единственное историческое исключение новой границы не было названо.
    new_boundary: Cutoff и обе enforcement boundary обязаны быть ancestors HEAD; current-record pin исключает только 3a292e7..a811313 для §A-DELIVERY-01.
    references_updated: true
  - action: reuse
    id: §A-MEMORY-01
    reason: Ancestry precondition оставалась только в change record, а нормативный текст неверно сводил merge-base к branch guard.
    new_boundary: Решение и invariant comment объясняют, что resolvable sibling отключила бы все per-edge rules и поэтому считается unreachable.
    references_updated: true
  - action: reuse
    id: §A-MEMORY-01
    reason: >-
      Журналу нужна одна проверяемая авторизация для пакета чисто редакторских
      изменений без выдуманной новой границы для каждого идентификатора.
    new_boundary: >-
      Журнал допускает одну запись editorial только для полного набора
      редакторски изменённых секций с неизменными AST-литералами и ссылками на
      §-id; отдельно перечисленные смысловые reuse могут быть в том же коммите,
      а удаления и прочие смысловые изменения требуют remove или reuse.
    references_updated: true
  - action: editorial
    ids:
      - §A-ACTIVATION-01
      - §A-BACKEND-01
      - §A-BACKLOG-01
      - §A-DISTRIBUTION-01
      - §A-DISTRIBUTION-02
      - §A-DISTRIBUTION-03
      - §A-DISTRIBUTION-04
      - §A-DISTRIBUTION-05
      - §A-DISTRIBUTION-06
      - §A-EVAL-01
      - §A-MODELS-01
      - §A-ORCHESTRATION-01
      - §A-ORCHESTRATION-03
      - §A-POSTURE-01
      - §A-RESPONSE-01
      - §A-RESPONSE-02
      - §A-RESPONSE-03
      - §A-REUSE-01
      - §A-REVIEW-02
      - §A-REVIEW-04
      - §A-SESSION-01
      - §A-WAIT-01
      - §A-WATCHDOG-01
      - §A-WATCHDOG-02
      - §B-EVAL-01
      - §B-HUMAN-04
      - §B-LONGEVITY-04
      - §B-PORTABILITY-05
      - §B-PORTABILITY-06
      - §B-PORTABILITY-07
      - §B-PORTABILITY-08
      - §B-REVIEW-02
      - §B-REVIEW-03
      - §B-REVIEW-04
      - §B-SESSION-01
      - §B-SESSION-02
      - §B-UPTIME-02
    reason: >-
      Человекочитаемые знания приведены к русской прозе без изменения границ
      решений и требований; ошибочные сужения терминов из первой редакции
      исправлены до публикации результата.
    references_updated: true
```

## Решение

Каждый самостоятельный тезис в [Зачем существует Meta-O](../business.md) несёт
идентификатор `§B-<AREA>-<NN>`. Каждое архитектурное решение несёт
`§A-<AREA>-<NN>` и обычным текстом называет тезисы, которым служит. Назначение
модуля и символа называет `§A-*` и не ссылается на бизнес-уровень напрямую:
цепочка уже проходит через решение.

Идентификатор уникален, стабилен и не переиспользуется. Грамматика —
`§[AB]-[A-Z][A-Z0-9-]*-\d{2}`; латиница здесь технический идентификатор, а не
человекочитаемый текст. Служебных блоков вида `Derived from` или `Implemented by`
нет: связь читается как обычное предложение.

Тезис — это раздел третьего уровня бизнес-постановки, решение — заголовок с
якорем в `docs/architecture/`. Гейт опирается на эту структуру, поэтому раздел
третьего уровня без якоря считается забытым тезисом, а не свободной прозой.

Граница поставки проходит по тому, что установит чужой проект:

- source Markdown может содержать standalone HTML marker
  `<!-- mo:source-anchor <architecture-id> -->`. Сборка разбирает Markdown positional AST
  и удаляет точный byte span marker справа налево, не сериализуя документ.
  Обычные упоминания id не удаляются; marker в code/prose/link или malformed
  marker останавливает сборку. Generated skills не содержат project ids;
- helper-скрипты, которые сборка копирует побайтово — `mo-posture.sh` и
  `mo-watchdog.sh`, — несут `§A-*` в чужой проект сознательно. Id здесь
  провенанс кода, поэтому в шапке он всегда назван вместе с проектом-владельцем
  (`meta-o §A-POSTURE-01`): потребитель читает чужую координату, а не висячую
  собственную ссылку, и разрешать её ему не нужно. Это же требует поставляемое
  правило назначения;
- `mo-models.mjs` собирается бандлером, и его шапка в поставку не попадает
  вообще. Назначение этого helper читают по источнику, а не по установленной
  копии;
- недистрибутируемые файлы (`tools/`, `tests/`) называют `§A-*` всегда;
- поставляемая методология требует того же от любого проекта общими словами.
  Конкретные id принадлежат проекту, а не поставке.

Для `.mjs` exported function/class declarations несут JSDoc, который объясняет
purpose и называет `§A-*`; это проверяет `eslint-plugin-jsdoc`. Для `.sh` нет
выбранного зрелого parser/linter, надёжно проверяющего semantic purpose каждой
function. Поэтому shell имеет machine-checked module header и обязательный
symbol-level review substantive functions. Собственный regex parser не создаётся.

Исторический cutoff — reproducible program input commit
`75a95f87efe6cea53167fa3f8d8c3b09a7c7ad96`:

```yaml
program_input_sha: 75a95f87efe6cea53167fa3f8d8c3b09a7c7ad96
```

`tools/knowledge-history.mjs`
перечисляет полный DAG через `git rev-list --topo-order --reverse --parents`,
читает blobs через Git object interface и проверяет каждый parent edge. Silent
deletion или semantic reuse после cutoff требует trailer:

```text
Knowledge-ID-Change: remove <id> via <architecture-id>
Knowledge-ID-Change: reuse <id> via <architecture-id>
Knowledge-ID-Change: editorial <sorted-id>,<sorted-id> via <architecture-id>
```

Trailer разрешает изменение только когда указанное решение существует в том же
commit и добавляет относительно проверяемого parent отдельную machine-readable
YAML-запись с действием, id, непустыми причиной и новой semantic boundary, а
также `references_updated: true`:

```yaml
knowledge_id_change:
  action: reuse
  id: <business-id>
  reason: Требование разделено на две независимо проверяемые части.
  new_boundary: Старый id теперь обозначает только первую часть.
  references_updated: true
```

Чистая редактура нескольких человекочитаемых формулировок может использовать
одну запись `editorial`: её отсортированный список `ids` должен в точности
совпасть со всеми существующими определениями, семантический отпечаток которых
изменился на этом переходе от родителя, кроме идентификаторов с отдельным
валидным трейлером `reuse`. Такая запись содержит непустую причину и
`references_updated: true`, но не выдумывает новую границу. Она не разрешает
удаление идентификатора или изменение, представленное как смысловое. Для каждой
секции checker дополнительно требует неизменные множества inline- и fenced-
литералов и цитируемых `§A-*`/`§B-*`; пробелы внутри литерала нормализуются, а
сами YAML-блоки авторизации в это сравнение не входят.

```yaml
knowledge_id_change:
  action: editorial
  ids:
    - <architecture-id>
    - <business-id>
  reason: Человекочитаемые формулировки приведены к языку проекта.
  references_updated: true
```

Ссылки проверяются на каждом commit диапазона, а не только на текущем `HEAD`:
ссылка — свойство одного дерева, поэтому commit с dangling id, исправленный
более поздним commit, иначе полностью исчезает из результата. Благодаря этому
`references_updated: true` в authorization record перестаёт быть
самоутверждением на уровне двух документов знаний.

Deletion на merge считается унаследованным только когда id отсутствует у другого
parent и присутствовал в их merge-base. Parent, ответвившийся до создания id,
ничего не удалял, и merge в его пользу не имеет права терять id молча.

Semantic reuse проверяется начиная с явно закреплённого commit, добавившего сам
checker:

```yaml
semantic_enforcement_sha: 4127f414a43fee467415db955a2ed19e57ebc159
```

Два перехода между cutoff и этой границей изменили тело секции по правилу,
которого тогда ещё не существовало; история не переписывается, чтобы это скрыть, и
граница не выводится из состояния файлов. Удаления и ссылки проверяются от
cutoff без исключений.

Привязка разрешающей записи к конкретному переходу от родителя применяется
начиная с проверенного кандидата, после которого правило стало исполняемым:

```yaml
current_record_enforcement_sha: 661eaf0f25a3d50c1f5aef686b106eddfe9a9489
```

Граница оставляет в legacy shape-check ровно один старый edge
`3a292e716e9614c9ff71b138d2dc8b10ee2d551f..a8113132c2f7a23d0a7cd18c156de527108dd953`
с semantic reuse §A-DELIVERY-01: он появился до edge-aware правила, и история не
переписывается ради вымышленной authorization record. Сам edge с исправлением
`661eaf0f..2e8dd1a` уже проверяется новым правилом.

Cutoff и обе enforcement boundary обязаны разрешаться в commit из ancestry
`HEAD`; существующий sibling считается недостижимым и даёт
`history_unavailable`. Одного `rev-parse` недостаточно: sibling заставил бы все
последующие per-edge ancestry checks вернуть false и молча отключил бы правило.
`merge-base` также остаётся дешёвым branch guard для feature lifecycle.

## §A-MEMORY-02 — Дословный ledger живёт с задачей, постановка хранит тезисы

Полный дословный ledger пользовательских интентов — исходный запрос и каждое
последующее уточнение, мнение, исправление, предпочтение и ограничение — ведётся
вместе с задачей или спецификацией и нормативен для исполнителя и ревьюеров.
Бизнес-постановка хранит те же интенты сведёнными в устойчивые тезисы: смысл
сохраняется, формулировка — нет, и остаётся только то, что переживает конкретную
реализацию.

Разделение реализует §B-MEMORY-04 и следует §B-FRAMING-01 и §B-MEMORY-03:
дословный ledger нормативен вместе с задачей, намерение хранится отдельно от
выведенных из него требований, а реализованная спецификация вместе со своим
ledger уходит из проекта. Иначе постановка вырастает в нечитаемую переписку, а
отменённый разговор читается будущим агентом как действующее требование. Там,
где дословная запись ещё нормативна, пересказ её не заменяет — этого требует сам
§B-MEMORY-04.

Если §A-MEMORY-02 отменяется, сведение становится лишним: постановка снова растёт
дословной перепиской, и проект теряет единственный документ, который человек
действительно читает целиком.

## §A-MEMORY-03 — Удалённый backlog сохраняет проверяемый Git-провенанс

Временная closure map существует только в checkpoint-коммите и связывает каждый
AST node frozen ledger с явно назначенным obligation, owner, disposition и
реальным proof. После удаления program artifacts `docs/acceptance.md` сохраняет
source blob ids, closure commit, map blob и постоянную команду проверки.
`tests/backlog-provenance.test.mjs` проверяет достижимость объектов, точную
разрешённую deletion delta и существование каждого durable proof path. Он не
считает структурную биекцию доказательством семантического закрытия.

Это решение служит §B-MEMORY-03, §B-MEMORY-04, §B-PROOF-01 и
§B-LONGEVITY-04. Если §A-MEMORY-03 отменяется, временная map, ссылки на Git
objects и постоянный provenance test удаляются вместе: оставлять непроверяемый
receipt без потребителя запрещено.

## §A-MEMORY-04 — Behavioral defect оставляет regression и invariant

Подтверждённый воспроизводимый behavioral defect получает минимальный focused
regression test, падающий до fix. Существенная правка ownership, concurrency,
trust, security, compatibility, transaction или resource lifetime сохраняет в
production code комментарий о non-obvious invariant и причине границы.
Комментарий не пересказывает syntax и не содержит report-local finding id.

Решение служит §B-REVIEW-02 и §B-SELFHOST-02: повторный класс сбоя должен ловиться
раньше и быть понятен следующей сессии. Без §A-MEMORY-04 setup-managed contract,
регрессионная норма и invariant comments становятся лишними, а найденный дефект
снова остаётся только в transcript.

## Бизнес-причина

Решение служит §B-MEMORY-01 и §B-MEMORY-02: уровни знаний существуют, чтобы агент
шёл маршрутом, а связи между ними работали в обе стороны. Без имени у тезиса
маршрут проходится только сплошным чтением, а совпадение формулировок ломается
при первой же редактуре — тогда снизу вверх дойти до бизнес-смысла нельзя.

§B-LONGEVITY-02 требует, чтобы такая граница проверялась машинно и блокирующе:
надежда на внимательность ревьюера не переживает нескольких лет разработки.
§B-PORTABILITY-04 определяет язык идентификатора, а §B-PORTABILITY-03 — почему
поставка остаётся без наших якорей: знание, читаемое только вместе со скилом,
делает проект непередаваемым.

## Что проверяет gate

`tests/knowledge-chain.test.mjs` в `make mo-qc` разбирает Markdown настоящим AST
и требует: у каждого тезиса есть якорь, все id уникальны, каждое `§A-*` называет
существующий `§B-*`, каждый первичный модуль кода называет существующий `§A-*` и
не ссылается на `§B-*` напрямую, висячих ссылок нет, а дистрибутируемый текст
generated skills якорей не содержит, а source использует только positional
markers. `tests/knowledge-history.test.mjs` проверяет полный DAG от cutoff.
Отдельная проверка требует, чтобы в шапке побайтово
копируемого скрипта рядом с каждым `§A-*` стояло имя проекта-владельца.

## Чего решение не требует

Обязательного покрытия «у каждого тезиса есть своё решение» нет. Тезис, который
продукт реализует самим текстом методологии, не получает архитектурного документа
ради формальной полноты: документ без названного потребителя запрещает
§B-CONTROL-04. Gate ловит разорванную цепочку, а не отсутствие решения.

## Что станет лишним при отмене

Если §A-MEMORY-01 отменяется, удаляются якоря в бизнес-постановке и архитектуре,
ссылки наверх в заголовках назначения и сам тест цепочки. Связь уровней
возвращается к совпадению слов, и цену этого платит тот, кто через год спросит,
зачем код вообще существует.
