# §A-REUSE-01 — Reuse discovery опирается на исполнимые descriptors

Статус: принято.

## Решение

Переносимый `find-reuse` хранит обязательные source adapters как данные с
фиксированными production base URL, argv/URL templates, probes, типизированными
ошибками и датой live-проверки. Offline gate валидирует schema и исполняет те же
templates против локальных doubles; отдельный network-enabled gate проверяет
production endpoints и только его evidence разрешает менять `last_verified`.

Descriptor не является runtime adapter layer: скилл остаётся read-only
методологией и запускает доступные инструменты напрямую. Структурированный
контракт нужен, чтобы prose, fixtures и фактическая команда не расходились.

Решение служит §B-FRAMING-04, §B-PROOF-01 и §B-PORTABILITY-03.

## Если §A-REUSE-01 отменяется

Станут лишними descriptors, их schema/fixture/live gates и проверка дат. Prose
снова станет единственным источником команд, поэтому принять такую отмену можно
только вместе с другим машинно проверяемым доказательством полноты поиска.
