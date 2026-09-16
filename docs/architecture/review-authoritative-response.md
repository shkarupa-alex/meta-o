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

Каждый Orca reviewer публикует полный отчёт в `worker_done`. Header содержит
`Review-Execution`, exact candidate, requested/effective mode, `Delegation:
none`, verdict и целочисленный census P0–P3. Между `Evidence report` и
совпадающим последним `End-Review` ровно по одному идут `Grounding`, `Scope and
checks`, `Findings`, `Unknowns` и `Residual risks`; markers берутся только из
top-level CommonMark prose, а code/quote/list bytes ими не становятся. Caller
сверяет `Candidate`, `Review-Execution` и оба mode с внешним frozen context, а
не доверяет самосогласованному header. У `UNKNOWN` дополнительно есть непустой
`Unknown-Account` и ровно один `Unknown-Reason` из closed taxonomy entry skill.

Finding index использует уникальные monotonic report-local `F-001…`; каждому
ключу соответствует ровно один body с той же severity, а counts равны этому
набору. Каждая finding называет evidence state, causal path, impact, location,
post-fix invariant, направление и глубину `local patch`, `boundary repair` либо
`affected-slice redesign`. Caller делает одну полную самокоррекцию malformed
response в той же hot session; повторный mismatch означает `UNKNOWN`.

Человеку показываются только exact SHA, pair verdict и сумма authored P0–P3
counts без dedup, ranking или пересказа. Executor получает исходные полные
reports. Решение служит §B-REVIEW-01, §B-REVIEW-04 и §B-REVIEW-05.
Без §A-REVIEW-04 исчезают grammar fixtures, self-correction и безопасная census
projection, а terminal summary снова ошибочно подменяет authoritative response.
