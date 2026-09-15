# §A-REVIEW-02 — Обязательная review-единица — одна vendor-diverse пара

Статус: принято; reviewer subagents и отдельный clean verifier отклонены.

```yaml
knowledge_id_change:
  action: reuse
  id: §A-REVIEW-02
  reason: Incident уточнил, что даже добровольная delegation нарушает проверяемую review unit.
  new_boundary: Lifecycle reviewer не создаёт subagents; независимость даёт ровно vendor-diverse pair.
  references_updated: true
```

## Решение

Финальный Feature lifecycle требует ровно одну независимую vendor-diverse пару
на одном полном SHA. Четыре обязательных initial reviewer и принудительные
2×2 ensembles не являются дополнительным acceptance gate. Reviewer subagents в
Meta-O lifecycle запрещены: они размывают provenance одного authored report и
делают peer isolation непроверяемой. Это не запрещает отдельно запрошенный
clean-room review вне Meta-O reviewer unit.

Архивное исследование показывает, что одинаковые дополнительные voters
повышают стоимость и задержку, но не дают независимости модели; consensus может
скрыть minority-correct finding. Практический failure этой программы подтвердил
границу: произвольная пара, не соответствующая vendor-diverse lifecycle
contract, дала ложный `PASS`, тогда как одна правильная Claude/Codex пара нашла
блокирующие дефекты. Поэтому принят ровно проверяемый контракт пары, а
differential eval остаётся условием только для будущего пересмотра границы, не
отложенной обязательной работой.

Решение служит §B-PROOF-02, §B-REVIEW-03, §B-CONTROL-01 и
§B-SELFHOST-01.

## Если §A-REVIEW-02 отменяется

Отмена §A-REVIEW-02 требует pre-registered differential eval, который покажет
измеримое улучшение над одной vendor-diverse парой при сопоставимых ложных
срабатываниях и стоимости. Тогда exact pair assertions и ограничение одного
verdict на reviewer становятся лишними и заменяются новым lifecycle contract.
