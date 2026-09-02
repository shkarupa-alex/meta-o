# meta-o

Устанавливаемые агентские скилы ведут фичу от задачи или спецификации до одного
проверенного candidate-коммита через сессии Orca. Meta-O поддерживает только
Orca: его публичная поверхность ответа квалифицирована, но каждый candidate всё
равно требует нового вердикта текущего запуска.

Поддержка Herdr и Paseo удалена как невостребованная до появления надёжных
публичных поверхностей полного ответа. Последнее дерево, содержащее их
orchestration и review skills, находится в полном коммите
`2eb85bebe14aa35419db192db66938e14e0be6f1`.

Meta-O — методология skills-first: она не добавляет orchestration CLI, provider
proxy, daemon, общее хранилище workflow state или adapter layer. У watchdog есть
единственное узкое исключение: ограниченные хеши сообщения и нормализованного
состояния, нужные только для подавления повторного nudge между запусками.

Проект хранит исходный запрос пользователя и последующие уточнения дословно,
потому что спецификация — это сжатие с потерями. Один проверенный результат —
один полный Git SHA; новый коммит обнуляет его QC, review и E2E. Два независимых
ревьюера работают на моделях разных вендоров, и хотя бы один вендор отличается
от вендора executor.

Последнее дерево с удалённым Omnigent находится в полном коммите
`61c39304a7e80e5350e8ffd43110a2ac1cac62b7`.

## Установка

Из проекта, которому нужны скилы, установите локальный checkout:

```bash
apm install /path/to/meta-o
apm install /path/to/meta-o --skill mo-review-orca
```

Локальная установка в disposable-окружение покрыта тестами. Публикация и
проверка remote installation остаются ответственностью владельца проекта:

```bash
npx skills add shkarupa-alex/meta-o
apm install shkarupa-alex/meta-o
```

Для сборки нужен Node.js 22 или новее. Provider-posture helper требует Bash
3.2+, стандартные POSIX utilities и Zsh, если запрошена Zsh launch matrix.
Watchdog дополнительно требует `jq` для проверки native JSON и `flock` для
сериализации nudge по locator.

## Скилы

| Скил                  | Назначение                                                  |
| --------------------- | ----------------------------------------------------------- |
| `mo-orchestrate-orca` | Маршрут фичи через полный Orca `worker_done`.               |
| `mo-review-orca`      | Standalone review через Orca с получением полного ответа.   |
| `mo-setup`            | Проверка и исправление готовности проекта и окружения.      |
| `mo-e2e`              | E2E-сценарии, которым действительно нужен агент.            |
| `mo-reuse`            | Поиск готового решения перед реализацией по явному запросу. |
| `mo-watchdog`         | Наблюдение Orca-сессий без cloud inference.                 |

Orca-механика отделена от общих lifecycle- и review-правил. Общие правила имеют
одного автора в `shared/`, чтобы orchestration и standalone review не
расходились.

Control executable и обязательный upstream companion skill — разные зависимости:

| Backend | Control              | Companion skill |
| ------- | -------------------- | --------------- |
| Orca    | `orca` or `orca-cli` | `orchestration` |

## Жизненный цикл фичи

```text
готовность проекта/задачи
  → короткий начальный /goal для executor
  → executor коммитит чистый candidate
  → фиксируется один полный SHA
  → параллельно стартуют два изолированных review
  → оба завершаются до освобождения любого из них
  → исправления создают новый SHA и перезапускают все gates
  → deterministic QC и применимые E2E
  → понятный человеку verified result или needs_attention
```

Оркестратор управляет процессом, но не читает, не оценивает и не редактирует
product code. Репозиторий читают executors, reviewers и E2E agents. Единицей
извлечения служит полный settled assistant response; bounded terminal preview или
private provider transcript не доказывают поддержку. Whole-session output
остаётся доступным для редкой диагностики.

## Структура репозитория

```text
src/skills/   авторские entry-скилы
shared/       единые владельцы общих references и runtime helpers
skills/       сгенерированное устанавливаемое дерево, закоммичено и byte-checked
tools/        инструменты сборки, не поставляются
docs/         бизнес-контекст, словарь, архитектура, backlog и acceptance
spec/         спецификации фич и дословные intent-ledgers
```

`skills/` строится автоматически и никогда не редактируется вручную. Каждый
установленный скил самодостаточен: вместе поставляются его `SKILL.md`, нужные
references, scripts и licenses.

## Разработка

```bash
npm install
make skills
make mo-qc
make mo-e2e
```

`make mo-qc` — авторитетный deterministic non-mutating gate. `make mo-e2e`
печатает сценарии, которым нужен агент, и завершается с кодом 2, поэтому его
невозможно принять за успешный прогон.

Каждый устойчивый бизнес-тезис постановки несёт id `§B-*`, каждое архитектурное
решение — свой `§A-*` и имена тезисов, которым служит, а назначение модуля
называет решение. Поэтому путь от строки кода до бизнес-смысла проходится
обычным `rg`.

Продуктовый контракт и его причины описаны в документах
[Зачем существует Meta-O](docs/business.md), [Глоссарий](docs/glossary.md),
[Возможности backend](docs/backend-capabilities.md),
[Сквозная проверка](docs/e2e.md), [Карта acceptance](docs/acceptance.md),
[Бэклог](docs/backlog.md), [Грабли и команды проекта](docs/papercut.md) и
[§A-ORCHESTRATION-01 — Скилы и reasoning — слой оркестрации процесса][skills-first].

[skills-first]: docs/architecture/skills-first.md
