# §A-WATCHDOG-02 — Локальный model-classifier не входит в watchdog

Статус: принято, эксперимент отклонён архитектурно.

## Решение

Watchdog классифицирует только типизированное native Orca state
детерминированными правилами `mo-watchdog.sh`. Локальная модель не участвует в
решении о состоянии, выборе target или отправке nudge. Эксперимент с модельным
классификатором отклонён: он добавляет недетерминизм, отдельную доступность
inference и новый источник ложноположительных side effects в контур, где
неизвестное состояние обязано завершаться fail-closed.

Принятая граница проверяется fake-Orca fixtures: одинаковые native reads нужны
до delivery, malformed и stale state дают отдельный typed outcome, changed
target и повторная доставка подавляются. Это доказывает требуемую поддержку без
model inference; улучшение текстовой эвристики не может перевесить потерю
детерминированности authority boundary.

Решение служит §B-UPTIME-02, §B-UPTIME-03, §B-CONTROL-01 и §B-CONTROL-04.

## Если §A-WATCHDOG-02 отменяется

Отмена §A-WATCHDOG-02 требует отдельной спецификации с credential-free corpus,
сравнением против pattern baseline, измеримым снижением ошибок и новой
authority-моделью. До такого решения model-classifier остаётся
`architecture-rejected`, а не отложенной реализацией.
