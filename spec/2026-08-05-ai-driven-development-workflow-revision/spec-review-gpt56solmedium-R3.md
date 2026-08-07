## Facts & Constraints — White Hat

Спецификация существенно улучшена и в целом вернулась к skills-first архитектуре. Она больше не маскирует workflow engine под набор helpers, отделяет Herdr и Omnigent releases, восстанавливает обязательный Herdr `agent read` contract и явно допускает `unsupported`, когда native backend не обеспечивает требуемые гарантии.

Технически значимые факты:

- Git identity через `BASE_SHA + CANDIDATE_SHA` и freeze до/после gates достаточно заменяет snapshot receipts для обычного tracked repository.
- Для Herdr 0.8 полнота alternate-screen history не гарантирована. Сама спецификация правильно делает отсутствие безопасного scroll surface release blocker. Это согласуется с тем, что официальная документация Herdr предупреждает о потере alternate-screen output, хотя предлагаемый ею file fallback здесь сознательно запрещён hard constraint. [Herdr agent automation](https://herdr.dev/docs/agent-automation/)
- Omnigent 0.6 не объявляется полноценным backend на основании одного export. Отдельная qualification native server API — корректное fail-closed решение.
- Capability matrix теперь охватывает context, compaction, cache и fallback, но большинство значений остаются `inferred`/`unavailable`. Это честно; практические threshold-based optimizations пока невозможны.
- Python/TypeScript tooling построен вокруг mature tools и project-native commands, что соответствует исходной задаче.

Есть одна фактическая ошибка: алгоритм §18.2 не является compare-and-swap. Два процесса могут прочитать одинаковый исходный hash, оба успешно выполнить повторную проверку, а затем последовательно сделать rename. Последний writer молча перезапишет первого.

## Risks & Failure Modes — Black Hat

### 1. Некорректная конкурентная запись `models.json`

Название «optimistic CAS» обещает гарантию, которой алгоритм не даёт. Между повторным чтением и `rename` остаётся race window.

Требуемое исправление: выбрать один из честных contracts:

- single-writer convention с допустимым last-writer-wins;
- короткая advisory lock;
- lock file через atomic exclusive create;
- маленький deterministic helper с доказанным locking contract.

Необходимо также определить owner записи: сейчас `mo-models.mjs` отложен, но skill должен каждый раз правильно воспроизводить temp/fsync/hash protocol через reasoning.

### 2. Handoff qualification не доказывает losslessness

Три контрольных token и полученная длина не доказывают, что произвольный Markdown между ними не был изменён, нормализован или частично заменён. Формула использует `largest verified lossless input`, но единственный описанный fixture около 60 KiB не ищет реальный предел. Safety factor от одной успешной точки не является capacity discovery.

Нужны:

- несколько размеров до первого failure;
- adversarial Markdown: quotes, backticks, Unicode, NUL rejection, multiline shell-like fragments;
- end-to-end comparison всех переданных bytes либо эквивалентная проверка полного содержимого;
- явное различие между CLI `argv`, socket/API field и agent context admission.

Проверочный digest внутри qualification fixture не обязан становиться runtime verdict protocol и потому не конфликтует с запретом nonce/verdict files.

### 3. Herdr scroll proof остаётся хрупким

Уникальный overlap лучше прежнего неограниченного stitching, но непрерывность всё ещё может разрушаться из-за:

- terminal resize и изменения wrapping;
- repaint между чтениями;
- ANSI/control sequences;
- wide Unicode и различного подсчёта rendered rows;
- повторяющихся строк за пределами 32-row окна.

Не определены фиксированная terminal geometry, нормализация rows и проверка отсутствия resize/repaint. Число 32 также не обосновано fixture evidence. Без этих условий алгоритм может дать ложный `unknown` либо, хуже, собрать соседние визуальные состояния как одну историю.

### 4. Capability suite рискует вернуть tooling bloat

`tests/capabilities/**`, evidence schema, runner, sanitization и matrix-copy pipeline уже образуют новый custom capability framework. Он оправданнее старого runtime, но всё ещё нарушает собственный helper proof principle: не показано, почему Phase 0 нельзя сначала выполнить native commands и сохранить короткие reviewed fixtures без общего runner.

Также отсутствуют:

- общий timeout;
- retry/flakiness policy;
- maximum cost/turn count;
- Node/package dependencies runner;
- правила повторной qualification после backend update;
- критерий устаревания capability evidence;
- проверяемое evidence при удалении transcripts из committed result.

### 5. Неопределённая композиция `mo-review` и backend skill

Спецификация говорит, что `mo-review` требует backend skill, но skills не являются обычными вызываемыми библиотеками. Не определено:

- кто читает и исполняет второй skill;
- кто владеет actor lifecycle;
- как `mo-review` получает полный backend result;
- где заканчивается review methodology и начинается backend execution;
- как возвращается управление после fix loop.

Для сильного агента textual composition может сработать, но для implementation-ready contract это остаётся скрытым архитектурным решением.

Более чистая модель: выбранный backend skill владеет actors и использует `mo-review` как textual review protocol. Standalone invocation сначала активирует backend skill, который затем применяет review protocol.

### 6. URL ingestion плюс permission-bypass создаёт опасную trust boundary

SSRF ограничения полезны, но не определены:

- DNS rebinding и повторная проверка resolved IP после redirect;
- IPv6 private/link-local ranges;
- decompression/page/object limits для PDF;
- prompt-injection treatment fetched content;
- запрет воспринимать команды из fetched document как authority выше task/project instructions.

Это особенно важно, поскольку worker CLI запускаются через wrappers с отключёнными approvals.

### 7. Workflow-specific правила снова попадают в `AGENTS.md`

`spec read-only` и `no push/tag/PR` являются правилами конкретного Meta-O run, а не обязательно постоянными архитектурными принципами проекта. Их безусловное добавление в `AGENTS.md` может ограничить обычные задачи вне Meta-O и противоречит цели не переносить executor methodology в project instructions.

Их следует передавать через goal/task envelope, если сам проект не принял их как постоянную convention.

### 8. Fix-loop counter неоднозначен

Указано «maximum 3 fix rounds per candidate lineage», но каждый round создаёт новый candidate. Термин `candidate lineage` не имеет identity или алгоритма восстановления после restart. Слабая реализация может сбрасывать счётчик при каждом SHA либо потребовать новый скрытый state.

Нужно определить счётчик как число последовательных review/fix cycles одной feature branch после первого candidate и описать stateless reconstruction по commit history либо отказаться от жёсткого числа в пользу bounded session-local policy.

## Strengths & Benefits — Yellow Hat

Сильные стороны спецификации:

- восстановлен прямой Herdr `agent read`/scroll contract для всех трёх harnesses;
- non-interactive panes больше не подменяют обязательный interactive route;
- Omnigent не эмулируется через Herdr или PTY adapter;
- release trains разделены, поэтому неподтверждённый Omnigent не блокирует Herdr;
- candidate freeze учитывает ignored runtime state через cleanup contract;
- исправлена модель reviewer independence: lineage отделена от billing/transport provider;
- `mo-review` имеет Git и non-Git identity;
- real defects нельзя спрятать под severity `minor`;
- reuse privacy теперь conservative/private-by-default;
- offline research не превращается автоматически в `build`;
- knowledge sync получил понятное определение и момент выполнения;
- E2E layouts масштабируются без registry;
- watchdog теперь только будит orchestrator и не притворяется classifier;
- state-origin audit ясно называет потерянные гарантии;
- migration действительно удаляет старую систему без compatibility adapters;
- decision ledger, rejected/deferred alternatives и pre-mortem существуют и содержательны.

Это уже не переименованный `meta-o`: основной runtime действительно заменён skills, Git reality и native backends.

## Alternatives & Creative Ideas — Green Hat

Для уменьшения остаточного tooling:

1. Выполнить первые backend qualifications как documented manual/native spikes. Автоматизировать только те fixtures, которые пришлось повторить минимум дважды.
2. Инвертировать композицию `mo-review`: backend skill владеет сессиями, а `mo-review` предоставляет review protocol и verdict semantics.
3. Для `models.json` выбрать честный single-writer contract. При редких изменениях моделей locking machinery может быть дороже реального риска.
4. Capability evidence для synthetic long output делать полностью public и deterministic, чтобы не требовалась redaction, уничтожающая проверяемость.
5. Вместо фиксированных 32 rows qualification может выбирать overlap как функцию terminal height, но фиксировать geometry на весь retrieval.
6. Хранить workflow-only executor restrictions в initial goal, оставляя `AGENTS.md` только project-owned principles.
7. Для Omnigent preview поставлять исключительно capability/readiness skill, пока server API не квалифицирован, чтобы пользователь не принял preview за частично рабочий orchestrator.

## Completeness & Process — Blue Hat

Несколько обязательных требований всё ещё раскрыты недостаточно:

- Не зафиксировано, что `mo-reuse` запускается именно в отдельном CLI instance и отдельном context, как требует исходная задача.
- Search protocol потерял точные GitHub semantics: stars descending, `archived=false`, commands и registry-specific adoption rules.
- Model discovery не сохраняет обязательные windows «последний месяц» и «последние 10 sessions», не описывает dedup effective models.
- Не определены lifecycle lineage map, dismissed-upgrade expiry и повторное предложение successor.
- `mo-setup` не содержит нормативного правила «показать proposed diff до любых изменений».
- Python profile остаётся набором candidates: для greenfield не выбран default между mypy/Pyright и не заданы минимальные configs/fixtures.
- Standalone artifact review не имеет size/context limits.
- Branch slug/collision behavior не определено.
- Capability evidence update остаётся ручным, но не описано, кто и по каким review criteria переводит fixture evidence в `capabilities.md`.

### Traceability

Decision Ledger существует. Практически все adopted, rejected и deferred decisions присутствуют в основном тексте. Особенно хорошо трассируются Herdr retrieval, Omnigent qualification, candidate identity, reviewer lineage, watchdog и удаление state.

Однако requirement-level traceability неполна:

- отдельный CLI/context для `mo-reuse` отсутствует;
- model history windows и dedup отсутствуют;
- обязательный proposed diff `mo-setup` отсутствует;
- точные registry research rules сокращены;
- custom capability runner не получил полноценного proof, хотя сам helper-proof principle принят.

Ledger согласован с body лучше, чем body с полным Original Task.

### Decomposition Readiness

Хорошо декомпозируются:

- Git lifecycle;
- knowledge layout;
- E2E docs;
- tooling deletion;
- individual Herdr provider fixtures;
- distribution installation;
- TypeScript compatibility fixtures.

Новые архитектурные решения понадобятся implementer в следующих местах:

- механизм композиции `mo-review` и backend skills;
- settings writer/locking;
- safe Herdr scroll normalization;
- Omnigent server API client shape;
- capability runner architecture;
- model discovery/dedup;
- Python greenfield profile.

Следовательно, утверждение §32, что архитектурных choices не осталось, неверно.

### Weak-Model Executability

Слабая модель будет вынуждена угадывать значения следующих директив:

- `qualified rendered prompt boundary`;
- `safe scriptable scroll surface`;
- `target context admission`;
- `materially affects architecture`;
- `qualified backend skill available`;
- `same candidate lineage`;
- `substantial repeated/systemic failure`;
- `proven orchestration-owned temp artifact`;
- `supported existing ESLint major`.

Для них нужны operational predicates, команды или decision tables. В наиболее рискованных местах — retrieval и persistence — одной prose-инструкции недостаточно.

### Contract Completeness

Сильные contracts уже есть для SHA identity, gate order, status vocabulary, watchdog exit codes, URL size limits, artifact digest и verdict structure.

Не завершены:

- настоящий atomic concurrency contract `models.json`;
- capability runner dependencies, timeout и flake policy;
- byte-exact findings transport proof;
- terminal geometry/normalization;
- skill-to-skill execution protocol;
- model history/dedup/upgrade expiry;
- setup apply authorization;
- Python greenfield configuration;
- review-round identity after restart.

Это не косметические TBD: несколько из них затрагивают correctness и architecture, поэтому спецификацию пока нельзя передавать слабой implementation model без дополнительного design work.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "Спецификация стала значительно сильнее: она действительно удаляет workflow engine, восстанавливает обязательный Herdr agent-read contract, разделяет backend releases, уточняет candidate identity, reviewer independence, knowledge sync, E2E, privacy и migration. Однако implementation-ready статус пока преждевременен. Алгоритм persistence ошибочно назван CAS, lossless handoff не доказан, Herdr scrolling не фиксирует terminal geometry, композиция mo-review/backend skills не определена, а capability fixtures рискуют стать новой custom suite. Дополнительно потеряны несколько обязательных деталей reuse, model discovery и mo-setup. После устранения этих gaps архитектуру можно принимать без возвращения к FSM или adapter layer.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "Model settings persistence",
          "description": "Read-check-rename sequence is not atomic compare-and-swap; concurrent writers can both pass the check and overwrite each other.",
          "required_change": "Specify honest single-writer/last-writer-wins semantics or add an atomic lock/exclusive-create mechanism, and identify the component responsible for writes."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Reviewer findings transport",
          "description": "Three marker tokens and a byte-length report do not prove that the complete Markdown payload was transferred losslessly, and one 60 KiB fixture does not establish transport capacity.",
          "required_change": "Define byte-exact end-to-end qualification over adversarial payloads and multiple sizes up to failure; distinguish argv, API-field and context limits."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Herdr full-turn retrieval",
          "description": "The overlap algorithm does not freeze terminal geometry or define ANSI, Unicode, wrapping and repaint normalization, so rendered windows may not form a stable sequence.",
          "required_change": "Add fixed geometry, resize/repaint detection, row normalization and corresponding fixtures; justify or derive overlap size."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Skill architecture",
          "description": "mo-review is said to require and delegate execution to another skill, but no skill-composition or ownership protocol defines actor creation, result retrieval and return of control.",
          "required_change": "Define a concrete textual composition contract, preferably with the selected backend skill owning sessions and applying the mo-review protocol."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Capability qualification",
          "description": "The proposed TypeScript fixture runner, evidence schema and matrix pipeline recreate a custom capability framework without timeout, retry, flake, cost, version-expiry or helper-proof contracts.",
          "required_change": "Specify these operational contracts and justify automation separately, or begin with native/manual fixtures and automate only demonstrated repetition."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Original-task completeness",
          "description": "Mandatory separate-context reuse execution, detailed registry/GitHub search semantics, model-history windows/dedup and pre-apply mo-setup diff are absent or weakened.",
          "required_change": "Restore these requirements explicitly in the normative lifecycle and acceptance criteria."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Security boundaries",
          "description": "Fetched URL content can reach highly permissive provider wrappers without a complete SSRF, prompt-injection and authority-separation contract.",
          "required_change": "Specify DNS/IP validation across redirects, resource-expansion limits and that fetched content is untrusted task data that cannot override user/project authority."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Project instructions",
          "description": "Workflow-specific spec-read-only and no-push rules are proposed as permanent AGENTS.md content, potentially affecting unrelated project work.",
          "required_change": "Move run-specific restrictions into the goal/task envelope unless the project explicitly adopts them as permanent conventions."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Review convergence",
          "description": "The three-round limit depends on an undefined candidate lineage and cannot be reconstructed reliably after restart without guessing or hidden state.",
          "required_change": "Define a stateless feature-cycle identity and reconstruction rule, or make the bound explicitly session-local without claiming durable enforcement."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Git branches",
          "description": "Feature branch slug collision and existing-branch conflict behavior are unspecified.",
          "required_change": "Add deterministic collision handling."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Standalone artifacts",
          "description": "Single-file artifact review has no size or context-admission limit.",
          "required_change": "Add a fail-closed size/context rule."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Python QC",
          "description": "The Python profile lists candidates but does not select a greenfield default or minimum configuration.",
          "required_change": "Provide a small default profile and fallback selection table."
        }
      ],
      "assumptions": [
        "The superseding addendum and the pasted Specification Under Review are authoritative where historical materials conflict.",
        "Herdr 0.8 and Omnigent 0.6 capabilities match the version-qualified facts recorded in the specification and previously inspected local interfaces.",
        "Backend-skill dependency currently means textual skill composition rather than a native skill RPC mechanism.",
        "No repository or external-service modifications were authorized or performed."
      ],
      "round": 3,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
