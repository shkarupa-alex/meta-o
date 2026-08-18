# §A-QUALITY-01 — JavaScript-границы проверяет ESLint

## Решение

Весь first-party JavaScript проходит ESLint внутри `make mo-lint`. Gate
проверяет recommended correctness rules, cyclomatic complexity, nesting,
размер функции и модуля, а также JSDoc у public API и classes. Generated
`skills/` не проверяется повторно: его bytes уже доказаны
`skills-check` и проверка принадлежит source modules.

Базовые limits — 500 строк на модуль, 80 строк на функцию, complexity
15 и nesting depth 4. Исключения живут в `eslint.config.mjs`, а не в
памяти maintainer:

- самодостаточный `mo-models.mjs` имеет отдельный измеренный ceiling,
  а `mo-models.mjs` и `build-skills.mjs` — ceilings для уже измеренной complexity,
  потому что первый бандлится в installed skill без runtime package, а
  второй целиком владеет атомарной build transaction;
- test fixtures и orchestration simulations допускают больше строк и branches,
  но их отдельные ceilings всё равно блокируют новый неограниченный рост.
  Одна mutation campaign в `provider-posture.test.mjs` имеет отдельный function ceiling:
  её fixtures должны оставаться в одном test lifecycle с общим cleanup.

Gate non-mutating: `eslint .` только судит tracked source. Auto-fix в
`make mo-qc` не входит.

## Бизнес-причина

Решение служит §B-LONGEVITY-02: границы кода должны ломаться в gate,
а не зависеть от внимания ревьюера. Оно также поддерживает
§B-LONGEVITY-01: дешёвое добавление нового branch не должно незаметно
превращать helper в неподдерживаемую границу.

Если §A-QUALITY-01 отменяется, ESLint dependencies, config и его шаг в
`make mo-lint` становятся лишними; вместо них нужен другой mature
non-mutating JavaScript gate с теми же границами.
