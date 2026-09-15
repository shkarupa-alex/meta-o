# §A-EVAL-01 — Model actors запускаются только по применимости и на approved profile

Статус: принято.

```yaml
knowledge_id_changes:
  - action: reuse
    id: §A-EVAL-01
    reason: Review закрыл ложную неприменимость, required unavailability и непроверяемое происхождение case observations.
    new_boundary: Unavailable envelope не заявляет observed oracle; каждый v3 case связывает public action и bounded evidence locator, а v2 остаётся только typed diagnostic.
    references_updated: true
  - action: reuse
    id: §B-EVAL-01
    reason: Testing policy теперь требует оба vendor-diverse low-effort profiles для каждого applicable case.
    new_boundary: Required Codex/Claude coordinates блокируют; desired Luna/OpenCode coordinates materialize availability.
    references_updated: true
```

## Решение

Детерминированный test/fixture является первым способом доказательства. Model
actor запускается только для named scenario, который нельзя равноценно доказать
детерминированно. Запуск использует выбор из единственного user-owned
`~/.meta-o/models.json`, сверяет requested/effective route, model и effort и не
делает автоматический fallback.

Каждый применимый case запускается на Claude `opus[1m]/low` и Codex
`gpt-5.6-sol/low`. Evidence v3 связывает case, contract id, tier, matrix profile,
candidate, requested/effective model+effort и native harness identity.
Координата evidence фиксирована как
`(skillRevision, caseId, matrixProfile, repetition=1)`: `observedAction` и
`evidenceRef` связывают результат с bounded public surface; повторный запуск не
создаёт дополнительного принимаемого доказательства и не оправдывает лишний
расход model actor.
Неприменимый сценарий имеет доказанный `not_applicable`; недоступная required
coordinate — `blocked|not_run`, не `PASS`. `not_applicable` принимается только
при наличии точного правила применимости в corpus самого case, с этим правилом
в observation и без якобы наблюдённых oracle. Если corpus такого правила не
задаёт, model actor не может объявить case неприменимым. Недоступная required
coordinate сохраняет requested identity, но несёт `effective: null`, typed
availability reason и ненулевой exit code native probe; все её cases остаются
`blocked|not_run` и поэтому блокируют gate. Ни одна unavailable coordinate не
может заявлять satisfied oracle; её action и locator описывают только реальный
availability probe.

Desired coordinates Codex `gpt-5.6-luna/max` и OpenCode/Qwen materialize'ятся
как `not_available`, когда отсутствуют. Запущенный `fail|unknown` блокирует.
Полный required Cartesian product обязателен, duplicate composite identity
запрещён; evidence v2 читается с проверкой старой формы только как
`{status: legacy_v2, accepted: false}` и не может закрыть live gate.

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
