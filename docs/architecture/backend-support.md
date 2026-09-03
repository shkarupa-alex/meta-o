# §A-BACKEND-01 — Граница поддержки backend

## Решение

Интеграция Orca напрямую использует документированную публичную native-поверхность.
Meta-O не добавляет adapter layer, provider proxy, transcript reader или backend
state store. Orchestration и standalone review имеют отдельные entry-skills, а
lifecycle- и review-стандарты остаются общими authored references.

## Бизнес-причина

Продукт координирует инструменты, у которых уже есть sessions и control planes,
а не создаёт их заново. Private transcript или inferred database может сделать
интеграцию внешне надёжной, одновременно привязав её к implementation details,
которые backend не обещает сохранять. Раздельные orchestration и review
entry-skills делают native-механику явной; общие контракты не дают review- и
lifecycle-стандартам разойтись.

Решение опирается на §B-PORTABILITY-07, §B-PORTABILITY-05 и §B-SESSION-02:
поведение берут у самого инструмента, к версиям чужого backend не привязываются,
а полный финальный ответ обязан приходить с публичной поверхности. Если
§A-BACKEND-01 отменяется, раздельные entry-скилы и backend-contract теряют смысл:
их заменяет adapter layer, который придётся чинить при каждом обновлении backend.

## Следствия

Backend обязан публично предоставлять полные settled responses, получение long
response, вопросы, lifecycle state и whole-session diagnostics. Отсутствующая
возможность блокирует поддержку, а не включает fallback. Изменения версий лишь
помогают диагностике; наблюдаемый сбой ведёт к улучшению методологии, а не к
автоматической requalification версии.
