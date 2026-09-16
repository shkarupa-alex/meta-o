# §A-BACKLOG-01 — Backlog — временный notebook с отдельным closure gate

## Решение

`docs/backlog.md` принадлежит активной feature branch. Сырые заметки человека
допустимы только до migration checkpoint; после него agent-authored запись имеет
поля `Причина.`, `Практическое влияние.` и `Следующий шаг.`. Подтверждённая
долговечная работа вне scope переносится в project/upstream Issue, а после
disposition запись удаляется. Пустой notebook в начале и в конце нормален.

Project-owned `make mo-backlog` реализует `MO-BACKLOG/1`. Он дважды
резолвит `HEAD`, читает только regular UTF-8 blob `HEAD:docs/backlog.md`,
разбирает Markdown настоящим AST и печатает один из `MO-BACKLOG-EMPTY`,
`MO-BACKLOG-NOT-EMPTY` или `MO-BACKLOG-UNKNOWN`. Dirty declared path и смена
snapshot дают `UNKNOWN`; unrelated dirt только отражается в `worktree=dirty`.
Обычный `make mo-qc` проверяет reader и schema, но не требует пустоты живой
feature branch.

Gate обязателен на G0 после intake migration, GC перед объявлением completion,
G1 перед agent-owned MR/PR create и G2 перед agent-owned merge. G1/G2 дополнительно
сверяют remote source head; merge требует hosting compare-and-set/required policy.
Synthetic integration candidate принимается только из hosting-provided checkout.
Setup проверяет project contract и CI coverage, но не создаёт CI или protection
без отдельного решения.

Решение служит §B-LONGEVITY-04, §B-PROOF-01, §B-PORTABILITY-03 и
§B-HUMAN-04. Без §A-BACKLOG-01 notebook снова становится долговечным sink,
границы G0/GC/G1/G2 и отдельный closure checker становятся лишними, а
agent-managed hosting write теряет доказательство пустоты exact candidate.

```yaml
knowledge_id_changes:
  - action: reuse
    id: §B-LONGEVITY-04
    reason: Backlog перестал быть долговечным sink и стал notebook активной feature branch.
    new_boundary: Долговечная подтверждённая работа живёт в Issues; пустота проверяется на G0, GC, G1 и G2.
    references_updated: true
  - action: reuse
    id: §A-BACKLOG-01
    reason: Публичная make-цель closure gate переименована без изменения протокола MO-BACKLOG/1.
    new_boundary: Решение определяет closure gate через короткую публичную цель make mo-backlog.
    references_updated: true
```
