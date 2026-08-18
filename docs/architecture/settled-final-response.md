# §A-RESPONSE-01 — Settled final responses остаются на публичных поверхностях backend

## Решение

Meta-O получает весь settled assistant response только через документированную
публичную native-поверхность выбранного backend. Orca использует полное
orchestration message `worker_done`. Herdr всё ещё нужна доказанная публичная
поверхность полного agent result. Paseo может использовать complete text activity
item последнего известного prompt лишь после того, как публичная поверхность
докажет эту границу под реальной reviewer-нагрузкой с инструментами. Bounded
окно `wait --json.message` этого не доказало.
`paseo logs <id> --filter text --tail 1` — кандидат, но до заявления поддержки он
должен пройти normal и long tool-using fixtures на каждом harness. Backend-
механика фиксирует точные команды установленной версии.

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

Два независимых review responses без изменений сохраняются в restrictive
temporary files. Только после завершения обоих одно ordinary message передаёт
executor оба path. Orchestrator не объединяет, не ранжирует, не суммирует, не
хеширует, не кодирует, не делит, не обрезает и не оценивает content. Ошибка file
или complete read — `unknown`, а не partial pass. Cleanup best effort и касается
только принадлежащих запуску files.

Неизменённая доставка — §B-REVIEW-01, а барьер до завершения обоих ответов —
§B-REVIEW-05 и §B-PROOF-02. Без §A-RESPONSE-02 исчезают временные файлы и
барьер, а вместе с ними независимость второго ревью.

## Отклонено

- private provider transcripts, hooks, session databases и goal stores;
- inline/headless direct provider invocation как fallback;
- completion markers или verdict files, созданные только ради Meta-O;
- реконструкция из terminal snippets;
- provider-proxy или adapter service.
