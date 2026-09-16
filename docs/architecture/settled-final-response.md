# §A-RESPONSE-01 — Settled final responses остаются на публичных поверхностях backend

```yaml
knowledge_id_changes:
  - action: reuse
    id: §A-RESPONSE-01
    reason: Authoritative worker_done получил обязательную проверяемую grammar.
    new_boundary: Полноту доказывают anchored sections и matching End-Review.
    references_updated: true
  - action: reuse
    id: §A-RESPONSE-01
    reason: No-overwrite handoff уточнил смысл полного settled response на уровне всего решения.
    new_boundary: Settled payload публикуется только create-if-absent и не может заменить ранее опубликованные bytes.
    references_updated: true
```

## Решение

Meta-O получает весь settled assistant response только через документированную
публичную native-поверхность Orca — полное orchestration message `worker_done`.
Orca-механика фиксирует точные команды установленной версии.

Whole-session view остаётся для редкой диагностики, но terminal tail или bounded
preview не доказывают полный final response. Acceptance длинного ответа требует
узнаваемое начало, середину и конец на объёме примерно трёх-четырёх экранов.

## Бизнес-причина

Review достоверен только тогда, когда каждый byte reviewer доходит до executor.
Private provider transcripts, hooks и inferred session databases — нестабильные
implementation details, способные незаметно выбрать не ту сессию или turn.
Просьба агенту повторить ответ проверяет послушание, а не retrieval.

Решение служит §B-SESSION-02, §B-PROOF-01 и §B-PORTABILITY-07: полный финальный
ответ читается только с публичной поверхности backend, нечитаемый целиком вердикт
не проходит gate, а поведение берут у инструмента, а не угадывают. Если
§A-RESPONSE-01 отменяется, квалификация поверхностей и fixtures нормального и
длинного ответа становятся лишними — вместе с уверенностью, что до executor
дошло каждое замечание.

## §A-RESPONSE-02 — Следствие для доставки

```yaml
knowledge_id_change:
  action: reuse
  id: §A-RESPONSE-02
  reason: Delivery получила named consumer, atomic private namespace и acknowledgement boundary.
  new_boundary: Cleanup разрешён только после settled acknowledgement; caller публикует лишь authored severity census.
  references_updated: true
```

Два независимых review responses без изменений сохраняются в restrictive
уникальном private temporary namespace. Только после завершения обоих одно
ordinary message передаёт named consumer оба exact path и size. Orchestrator не
объединяет, не ранжирует, не пересказывает и не оценивает content. Единственное
исключение — сумма уже опубликованных reviewers целочисленных P0–P3 counts;
совпадение finding считается дважды. Ошибка file или complete read — `unknown`,
а не partial pass. Cleanup касается exact-owned namespace и разрешён только
после settled acknowledgement потребителя.

Неизменённая доставка — §B-REVIEW-01, а барьер до завершения обоих ответов —
§B-REVIEW-05 и §B-PROOF-02. Без §A-RESPONSE-02 исчезают временные файлы и
барьер, а вместе с ними независимость второго ревью.

## §A-RESPONSE-03 — Pair handoff атомарен и принадлежит named consumer

```yaml
knowledge_id_change:
  action: reuse
  id: §A-RESPONSE-03
  reason: Review обнаружил, что ordinary rename может перезаписать уже опубликованный final payload.
  new_boundary: Publication использует atomic create-if-absent hard link; любой existing final остаётся неизменным и даёт UNKNOWN.
  references_updated: true
```

Caller под `umask 077` создаёт через secure `mktemp -d` namespace с mode `0700`
в system temp. Slots A/B назначаются до start; path-safe vendor slug не является
identity. Payload эксклюзивно пишется во временный regular file `0600`,
fsync/close, после чего complete inode публикуется атомарным create-if-absent:
same-directory hard link на final slot и удаление временного имени.
Overwrite-capable rename запрещён. Caller перечитывает size и `End-Review`,
затем передаёт `pair_id`, оба path и size.

Machine consumer после полного чтения отвечает ровно
`Review-Handoff-Ack: <pair_id> A=<bytes> B=<bytes>`. Один mismatch допускает
одну re-delivery тех же paths; второй даёт `UNKNOWN` и сохраняет namespace как
evidence. Human-caller получает paths/sizes в финальном ответе, и автоматический
cleanup запрещён. Existing regular file, symlink, nonregular path, неподдержанный
hard link, truncation или reread failure сразу дают `UNKNOWN` без изменения
существующего final и без пересборки payload.

Решение служит §B-REVIEW-01, §B-REVIEW-05 и §B-SESSION-02.
Отмена §A-RESPONSE-03 делает private namespace, atomic publication, acknowledgement retry и
consumer-owned cleanup лишними, но lossless pair delivery снова не
доказуема.

## Отклонено

- private provider transcripts, hooks, session databases и goal stores;
- inline/headless direct provider invocation как fallback;
- completion markers или verdict files, созданные только ради Meta-O;
- реконструкция из terminal snippets;
- provider-proxy или adapter service.
