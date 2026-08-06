# 10 — Knowledge layer

## Purpose

Этот документ определяет project-owned причинный слой знаний и его синхронизацию
в feature workflow. Нормативный источник:
[master-spec §8–§9](./2026-07-24-ai-driven-development-workflow-council-brainstorm.md#8-knowledge-layer).

## Required layout

```text
docs/knowledge/business.md
docs/knowledge/architecture/<domain>.md
docs/knowledge/glossary.md
docs/architecture/e2e.md
docs/architecture/e2e.json
docs/todo.md
```

Business knowledge намеренно хранится одним файлом: пользователь должен иметь
возможность прочитать верхнюю истину целиком. Glossary существует всегда.
Architecture разрешено делить по доменам/boundaries.

## Causal chain

```text
business (§B) → architecture (§A) → module (§M) → symbol
```

- `§B-*`: проблема, субъект, outcome, недопустимое поведение и причина
  существования.
- `§A-*`: реализуемые business anchors, rationale, invariants, boundaries,
  non-goals и последствия отмены.
- `§M-*`: purpose module, architecture link, boundary и последствия удаления.
- Symbol: native docstring, объясняющий purpose и содержащий ссылку на `§M-*`.

Минимальная ссылка всегда идёт на ближайший верхний уровень. Дополнительная
дальняя ссылка разрешена, но не заменяет непосредственную.

Нормативная грамматика anchors:

```text
§B-[A-Z0-9-]+
§A-[A-Z0-9-]+
§M-[A-Z0-9-]+
```

Пример:

```markdown
## §B-CONTEXT-01 — Что оценивает проект
### §B-TIME-01 — Сценариям нужна единая управляемая точка времени
```

## Purpose coverage

Purpose обязателен для каждого first-party:

- module;
- class;
- function и nested function;
- method, включая private, async, property и dunder;
- test code.

Используется native docstring style языка. XML и специальный `@purpose`
не требуются. Текст обязан объяснять, зачем сущность существует и что сломается
или станет лишним при её удалении, а не пересказывать реализацию.

Формальные исключения:

- generated source с marker и declared glob;
- runtime-synthetic сущности вне source AST;
- overload declaration при документированной реализации;
- third-party/vendor roots.

Lambda и comprehension не считаются именованными symbols.

Mechanical checker проверяет coverage, grammar и links. Reviewers проверяют
адекватность смысла и drift.

## Feature knowledge protocol

До реализации нельзя писать durable `§B-TODO`/`§A-TODO`: planned intent не
является текущей истиной. Executor ведёт внешний `KnowledgeImpactPlan`:

```ts
interface KnowledgeImpactPlan {
  impactedBusinessAnchors: string[];
  impactedArchitectureAnchors: string[];
  impactedModules: string[];
  expectedSpecRetirement: string[];
}
```

До candidate commit executor:

1. реализует поведение;
2. интегрирует устойчивые требования feature-spec во все затронутые уровни;
3. заменяет устаревшую knowledge, не оставляя competing truth;
4. добавляет/обновляет purpose;
5. удаляет tracked feature-spec в том же candidate window.

Размер knowledge diff пропорционален изменению. Одна функция не требует десяти
страниц текста, но обязана сохранить причинную цепочку.

External spec не копируется в durable project docs. Immutable run blob живёт
только до cleanup.

## E2E knowledge

`docs/architecture/e2e.md` описывает:

- environment и prerequisites;
- fixtures/data setup;
- smoke и E2E execution;
- scenario anchors;
- cleanup/isolation;
- интерпретацию failures;
- явные ограничения production.

`e2e.json` — только машиночитаемый catalog и compact last-run metadata.
Сценарии связываются с `§B-*`; минимум один имеет `always_required: true`.
Screenshots, raw logs и reasoning туда не попадают.

## Mechanical gates

Project-owned `make qc` обязан блокировать:

- duplicate или malformed anchors;
- `§A` без `§B`;
- `§M` без `§A`;
- symbol без `§M`;
- dangling links;
- прямую symbol/module → `§B` как замену ближайшему уровню;
- invalid E2E schema или business links;
- missing purpose в adopted first-party roots;
- feature archives в configured search roots.

Парсер Markdown работает по структурным headings/anchors, а не по свободному
поиску похожих строк.

## Brownfield adoption and debt

Brownfield сначала получает отдельную adoption feature. Tracked
`adoption-manifest.json` перечисляет dependency-closed source roots. Основная
feature может менять только adopted closure; расширение — отдельное reviewed
adoption change.

Structural legacy debt допускается frozen baseline. Purpose debt baseline не
допускается.

Долг в scope feature исправляется. Старый внешний долг записывается одной
краткой записью в `docs/todo.md`: area, risk, форма будущей feature.
Полный аудит архитектуры и stale features выполняет отдельный инструмент вне
этой методологии.

## Acceptance tests

- Человек может прочитать всю business truth в одном файле.
- Каждый `§A`/`§M`/symbol имеет валидную ближайшую причинную ссылку.
- Abort до candidate commit не оставляет planned TODO knowledge.
- Retirement spec не теряет требования, затрагивающие architecture/module.
- Изменение одного symbol создаёт пропорциональный, а не ритуальный knowledge
  diff.
- Mechanical PASS не заменяет semantic review purpose/business drift.

