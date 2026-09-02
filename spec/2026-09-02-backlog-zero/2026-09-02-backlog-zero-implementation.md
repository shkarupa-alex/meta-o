# Обнуление backlog Meta-O — implementation package

Статус: canonical implementation entrypoint.

Этот документ связывает неизменяемый council bundle и принятые после его публикации поправки. Исполнитель не должен реализовывать исходный council overview изолированно: нормативный пакет состоит из всех перечисленных ниже документов с указанным precedence.

## Состав пакета

1. [Общий council overview](../2026-08-31-backlog-zero/2026-09-02-backlog-zero-council-brainstorm.md).
2. [Spec 1 — Portable evidence skills](../2026-08-31-backlog-zero/spec-01-portable-evidence-skills.md).
3. [Spec 2 — Feature lifecycle and review](../2026-08-31-backlog-zero/spec-02-feature-lifecycle-review.md).
4. [Spec 3 — Orca и local-model orchestration](../2026-08-31-backlog-zero/spec-03-orca-local-orchestration.md).
5. [Spec 4 — Knowledge и backlog closure](../2026-08-31-backlog-zero/spec-04-knowledge-backlog-closure.md).
6. [Обязательная поправка о testing models](../2026-09-02-backlog-zero-model-testing-amendment/2026-09-02-backlog-zero-model-testing-amendment-brainstorm.md).

Полный [inventory frozen nodes](../2026-08-31-backlog-zero/coverage-inventory.md) остаётся входом Spec 4.

## Precedence

Иерархия проекта сохраняется: актуальные business requirements → architecture decisions → этот implementation package → implementation. Внутри пакета более поздняя явно названная поправка имеет приоритет только в своей узкой области; остальные решения council bundle остаются без изменений.

На момент создания entrypoint существует одна такая поправка: policy выбора моделей для eval/E2E. Она заменяет прежнюю optional-модель testing actors следующим правилом:

- model actor запускается только для named applicable scenario, который нельзя равноценно доказать deterministic test;
- Claude запускается как `sonnet5/low`;
- Codex запускается как `gpt-5.6-terra/low`;
- применимый OpenCode comparator/actor запускается как `deepseek 4 flash` с подтверждённым effective provider/model id;
- более дорогой model/effort и автоматический fallback запрещены без разрешения пользователя;
- критический Qwen/OpenCode orchestration profile из Spec 3 сохраняется и DeepSeek его не заменяет;
- этот cost/authority intent переносится в `docs/business.md` и `docs/acceptance.md` при реализации.

## Completion rule

Ни одна из четырёх specs и ни одна строка исходного backlog не считается закрытой, если применимая model-testing поправка не выполнена. Final same-SHA review читает эту каноническую точку входа, все четыре спеки и все перечисленные amendments.
