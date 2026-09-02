# Задача консилиума: программа спецификаций для обнуления backlog Meta-O

## Цель

Спроектировать полный, реализуемый другими агентами набор спецификаций, после выполнения которого текущий `docs/backlog.md` и связанный ledger реальных запусков `docs/backlog-issues-real-runs.md` могут стать пустыми без сокрытия, переписывания или потери исходных требований и инцидентов.

Нужна архитектурная проработка, декомпозиция, зависимости, контракты, acceptance и доказательства. Код сейчас не реализовывать.

## Репозиторий и иерархия решений

Рабочая копия: `/Users/alex/Develop/meta-o`.

Обязательные источники, которые надо прочитать:

- `AGENTS.md` — проектный контракт;
- `docs/business.md` — верхнеуровневые бизнес-требования;
- `docs/architecture/*.md` — принятые архитектурные решения;
- `docs/acceptance.md`, `docs/e2e.md`, `docs/backend-capabilities.md`, `docs/glossary.md`;
- `shared/references/methodology.md`;
- весь `docs/backlog.md`;
- весь `docs/backlog-issues-real-runs.md` (это часть текущего backlog, а не справочный архив);
- `docs/research/review-deep-research-1.md`, `review-deep-research-2.md`, `review-deep-research-3.md`;
- локальный Claude Code review plugin:
  - `/Users/alex/.claude/plugins/marketplaces/claude-plugins-official/plugins/code-review/README.md`;
  - `/Users/alex/.claude/plugins/marketplaces/claude-plugins-official/plugins/code-review/commands/code-review.md`;
- существующие пользовательские skills `src/skills/senior-python/` и `src/skills/senior-jsts/`;
- текущий `src/skills/mo-reuse/` и места его интеграции в других skills/knowledge.

Противоречия разрешаются строго: business requirements → architecture decisions → implementation. Backlog нельзя очищать декларативно: для каждого пункта должен появиться план реализации и проверяемое закрытие либо доказанное объединение с другим пунктом.

## Уже принято и не обсуждается

1. Herdr и Paseo больше не поддерживаются и исключены из области этой программы. Поддерживается только Orca. Удаление сделано в отдельной ветке `feature/orca-only`; текущий проверенный HEAD удаления — `41a4898974a6a08eb415cb07ba849575c5964b61`. Последний коммит, где skills Herdr/Paseo ещё существовали, — `2eb85bebe14aa35419db192db66938e14e0be6f1`.
2. `senior-python` и `senior-jsts` уже созданы пользователем в `src/`; их создание нельзя оставлять задачей backlog. Их можно считать существующим входом и проектировать лишь необходимую интеграцию/проверку, если она реально нужна.
3. Для консилиума выбраны два проверенных судьи: GPT-5.6 Sol/high и Claude Opus 1M/high.
4. Проект остаётся skills-first: не предлагать новый workflow engine или general state store. Не создавать manifest/receipt/digest/baseline без именованного внешнего потребителя.
5. Не возвращать поддержку Herdr/Paseo и не тратить анализ на их проблемы.

## Новое обязательное требование: независимый find-reuse

Нужно переименовать `mo-reuse` в `find-reuse` и сделать его переносимым, независимым от методологии Meta-O.

- Сам skill может задавать формат входа/выхода, инструменты, исследовательский процесс и quality gates.
- Он должен опираться на generic «бизнес-требования», ограничения и контекст задачи, а не на `docs/business.md`, `docs/acceptance.md` или иной Meta-O layout.
- Когда вызывать skill, как передавать ему контекст и куда сохранять/встраивать результат — ответственность внешних skills методологии Meta-O.
- Нужен обоснованный coverage matrix для популярных языков, экосистем/package managers и Git/source hosting: где искать, что извлекать, какими concrete CLI/API/library-командами искать произвольный `query`, какие инструменты должны быть установлены.
- Для отсутствующих необходимых инструментов skill должен безопасно предложить установку, не считать её молча выполненной.
- Для источников, где поиск требует авторизации, до поиска проверять auth и при отсутствии давать точную инструкцию авторизации.
- PyPI сейчас недостаточно описан; должны быть реальные команды поиска/метрик, а не абстрактное «поищи в PyPI».
- Кандидаты из разных источников надо дедуплицировать и обогащать перекрёстными метриками: например, найденный GitHub repository сопоставить с package registry и добрать downloads/release/maintenance/adoption signals.
- Судьи должны предложить полный, но экономичный состав экосистем, источников, команд, auth probes, enrichment и dedup identity rules. Нужно явно отделить обязательное ядро от расширяемых adapters, чтобы не превратить skill в бесконечный каталог.

## Особо важные вопросы по code review

Новые исследования и реальный backlog содержат конкурирующие идеи. Нужно их разрешить через контракты и проверяемые гипотезы, не через вкусовой выбор:

- короткое portable review core против длинного checklist/prompt wall;
- discovery, risk mapping, candidate verification, severity policy и reporting — какие стадии должны быть раздельными;
- evidence standard против confidence scoring; можно ли confidence использовать только как фильтр после evidence;
- два независимых vendor-diverse reviewer как lifecycle gate против дополнительных специализированных subagents внутри одного review;
- fast review, deep review и follow-up after fixes: нужен ли общий core с внешней orchestration policy;
- чтение intent/spec, diff, surrounding reachable code, git history, prior PRs/comments и repository instructions;
- false-positive control, changed-lines causality, отсутствие finding как валидный результат;
- same-full-SHA guarantee, hot reviewer lifecycle, iteration budget, remediation, QC isolation и proof artifact;
- как экспериментально проверить recall/precision/latency/cost и не объявить непроверенную ensemble-гипотезу архитектурным фактом.

Claude Code plugin — референс, не источник истины: он запускает специализированных агентов, confidence scorers и публикует findings >=80, но его расхождение README/command (4 против 5 reviewers), GitHub-specific coupling и evidence semantics надо критически оценить.

## Что должен вернуть каждый судья

1. Lossless inventory: карта каждого открытого backlog item и каждого уникального инцидента/пожелания из real-runs ledger к предлагаемому workstream/spec и acceptance proof. Покажите дубли, но не теряйте их distinct evidence/context.
2. Предлагаемая декомпозиция на минимальное число независимо реализуемых спецификаций. Для каждой: цель, границы, owner/source of truth, зависимости, migration/compatibility, тесты/E2E, критерий закрытия связанных backlog entries.
3. Отдельный детальный дизайн `find-reuse`, включая ecosystem/source/tool/auth/query/enrichment/dedup matrix и внешний Meta-O integration contract.
4. Отдельный детальный дизайн review architecture на основании research + real incidents.
5. Решение для Orca orchestration failures: ownership/cadence/wakeup, hot sessions, delivery/ack, reconnect/quota, recovery, terminal lifecycle, work-package vs gate semantics, unsafe side effects, evidence and same-SHA completion — без изобретения project workflow engine.
6. Решения для knowledge-chain/anchor/history gates и local-model watchdog wish с учётом архитектурных запретов и named-consumer rule.
7. Очерёдность реализации с критическим путём и небольшими независимо проверяемыми инкрементами.
8. Риски, альтернативы, rejected options, unknowns и вопросы, которые действительно требуют решения пользователя.
9. Machine-checkable Definition of Done программы: как доказать, что backlog можно очистить полностью и что требования не потеряны.

## Критерии качества ответа

- Не ограничиваться пересказом headings; прочитать тексты и объединить root causes.
- Не превращать временные progress/gate states в backlog или долговечный project state.
- Не переносить orchestration-specific правила внутрь portable skills.
- Не предлагать поддержку Herdr/Paseo.
- Не оставлять расплывчатые «проработать», «улучшить», «исследовать»: у каждого результата должен быть owner, artifact/contract и проверка.
- Отмечать, что является установленным требованием, выводом из evidence или ещё проверяемой гипотезой.
- Ответ дать по-русски; code identifiers, commands и protocol literals оставить на английском.
