# §A-EVAL-01 — Model actors запускаются только по применимости и на approved profile

Статус: принято.

```yaml
knowledge_id_changes:
  - action: reuse
    id: §A-EVAL-01
    reason: Решение дополнено проверкой native execution identity и read-path policy.
    new_boundary: Решение определяет и выбор профиля, и доказательство фактического запуска.
    references_updated: true
  - action: reuse
    id: §B-EVAL-01
    reason: Бизнес-тезис уточнён после отделения локальной orchestration capability.
    new_boundary: Тезис относится только к low-cost testing actors, а не к orchestrator.
    references_updated: true
```

## Решение

Детерминированный test/fixture является первым способом доказательства. Model
actor запускается только для named scenario, который нельзя равноценно доказать
детерминированно. Запуск использует выбор из единственного user-owned
`~/.meta-o/models.json`, сверяет requested/effective route, model и effort и не
делает автоматический fallback.

Для testing применяются Claude `sonnet5/low`, Codex `gpt-5.6-terra/low` и
настроенная effective identity профиля OpenCode `deepseek 4 flash`. Более дорогая
модель или effort требуют нового разрешения пользователя. Неприменимый сценарий
имеет `not_applicable`; применимый, но не запущенный — `blocked|not_run`, не
`PASS`.

Критический Qwen/OpenCode profile остаётся отдельной проверкой orchestration и не
заменяется DeepSeek comparator. Evidence хранит scenario id, candidate SHA,
requested/effective identity, harness version и результат, но не secrets или
полные transcripts.

Решение служит §B-EVAL-01, §B-CONTROL-01, §B-PORTABILITY-07 и
§B-PORTABILITY-08.

## Если §A-EVAL-01 отменяется

Станут лишними policy fixtures, проверка effective identity и distinction между
`not_applicable`, `not_run` и `PASS`. Изменение допустимо только вместе с новой
границей расходов и authority.
