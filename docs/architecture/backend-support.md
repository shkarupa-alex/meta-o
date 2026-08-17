# Граница поддержки backend

## Решение

Интеграции Herdr, Orca и Paseo напрямую используют документированные публичные
native-поверхности. Meta-O не добавляет adapter layer, provider proxy, transcript
reader или backend state store. У каждого backend фиксированы orchestration entry
и standalone review entry, потому что семантика сессий различается; lifecycle- и
review-стандарты остаются общими authored references.

## Бизнес-причина

Продукт координирует инструменты, у которых уже есть sessions и control planes,
а не создаёт их заново. Private transcript или inferred database может сделать
интеграцию внешне надёжной, одновременно привязав её к implementation details,
которые backend не обещает сохранять. Раздельные entry-скилы делают native-
механику явной; общие контракты не дают review- и lifecycle-стандартам разойтись.

## Следствия

Backend обязан публично предоставлять полные settled responses, получение long
response, вопросы, lifecycle state и whole-session diagnostics. Отсутствующая
возможность блокирует поддержку, а не включает fallback. Изменения версий лишь
помогают диагностике; наблюдаемый сбой ведёт к улучшению методологии, а не к
автоматической requalification версии.
