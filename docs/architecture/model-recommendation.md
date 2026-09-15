# §A-MODELS-01 — Recommendation выводится из catalog и bounded history

```yaml
knowledge_id_change:
  action: reuse
  id: §A-MODELS-01
  reason: Cleanroom review уточнил допустимые catalog fields и обязательную проверку offered effort.
  new_boundary: Recommendation требует coding positioning из label, description или capabilities и реально offered high effort.
  references_updated: true
```

## Решение

`mo-models.mjs --catalog --project <root> --json` публикует
`meta-o.model-discovery.v2`: authoritative catalog каждого route и уникальные
model ids из regular non-symlink session files за 31 день. Scan сортируется по
mtime/path, ограничен 5000 ms и 64 MiB на provider, не возвращает prompt bytes и
честно сообщает unreadable/corrupt/partial input.

Default recommendation требует catalog/bundled/official coding positioning в
`label`, `description` или `capabilities` и реально offered `high` effort. Текущие ориентиры —
`codex/gpt-5.6-sol/high` и `claude/opus[1m]/high`; это не selector и не permanent
hard-code. Astra/Fable показываются в full list, но не рекомендуются по умолчанию.
Без допустимого evidence результат `no_default_recommendation`; explicit выбор
пользователя остаётся авторитетным и fallback запрещён.

Решение служит §B-PORTABILITY-07 и §B-EVAL-01. Без §A-MODELS-01 recent history
снова выдаётся за catalog, recommendation становится догадкой по имени модели,
а bounded privacy/resource contract scan теряет владельца.
