# §A-REVIEW-04 — Авторитетный ответ ревьюера имеет проверяемую форму

```yaml
knowledge_id_changes:
  - action: reuse
    id: §A-REVIEW-04
    reason: Canonical report уточнён до contextual identity binding, CommonMark AST и bounded self-correction.
    new_boundary: Caller сверяет внешний SHA, Dispatch и modes; только top-level prose задаёт markers, второй malformed report даёт UNKNOWN.
    references_updated: true
  - action: reuse
    id: §B-REVIEW-02
    reason: Память замечаний уточнена до regression test и non-obvious invariant comment.
    new_boundary: Production comments не хранят report-local finding ids.
    references_updated: true
```

## Решение

Каждый ревьюер Orca публикует полный отчёт в `worker_done`. Заголовок содержит
`Review-Execution`, точного кандидата, запрошенный и фактический режимы,
`Delegation: none`, вердикт и целочисленные количества P0–P3. Между
`Evidence report` и
совпадающим последним `End-Review` ровно по одному идут `Grounding`, `Scope and
checks`, `Findings`, `Unknowns` и `Residual risks`; маркеры берутся только из
прозы верхнего уровня CommonMark, а байты кода, цитат и списков ими не становятся.
Вызывающая сторона сверяет `Candidate`, `Review-Execution` и оба режима с внешним
зафиксированным контекстом, а не доверяет самосогласованному заголовку. У
`UNKNOWN` дополнительно есть непустой `Unknown-Account` и ровно один
`Unknown-Reason` из замкнутой таксономии входного скила.

Индекс замечаний использует уникальные монотонные локальные для отчёта
`F-001…`; каждому ключу соответствует ровно одно тело с той же серьёзностью, а
количества равны этому набору. Каждое замечание называет состояние доказательства,
причинный путь, влияние, расположение, инвариант после исправления, направление
и глубину `local patch`, `boundary repair` либо `affected-slice redesign`.
Вызывающая сторона делает одну полную самокоррекцию повреждённого ответа в той же
активной сессии; повторное несовпадение означает `UNKNOWN`.

Человеку показываются только точный SHA, вердикт пары и сумма опубликованных
количеств P0–P3 без дедупликации, ранжирования или пересказа. Исполнитель получает
исходные полные отчёты. Решение служит §B-REVIEW-01, §B-REVIEW-04 и
§B-REVIEW-05. Без §A-REVIEW-04 исчезают фикстуры грамматики, самокоррекция и
безопасная проекция количеств, а сводка терминала снова ошибочно подменяет
авторитетный ответ.
