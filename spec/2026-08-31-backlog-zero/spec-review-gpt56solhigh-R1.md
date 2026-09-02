## Итог

Спецификация имеет сильное архитектурное направление, но пока не готова к реализации без новых проектных решений. Главные блокеры — недолговечные входы программы, неполная lossless inventory, исчезающее доказательство closure, цикл зависимостей Specs 2–3 и несколько недоопределённых runtime-контрактов.

Оценка: **5/10, не принимать as-is**.

## Facts & Constraints (White Hat)

Подтверждены заявленные Git-факты:

- `HEAD` действительно равен `41a4898974a6a08eb415cb07ba849575c5964b61`;
- blob `docs/backlog.md` действительно `8d11d1107eb5875235c2830e6503f7e1265317d7`;
- blob `docs/backlog-issues-real-runs.md` действительно `c75859372fa7d794269cc6dcc8834c069ddd8096`;
- `develop` находится на `2eb85bebe14aa35419db192db66938e14e0be6f1`, а Orca-only результат пока живёт только в `feature/orca-only`.

При этом обязательные входы программы не воспроизводимы из заявленного base commit:

- `src/skills/senior-python/`, `src/skills/senior-jsts/` и их generated trees не tracked;
- `docs/research/` также не tracked;
- следовательно, чистый checkout `41a4898` не содержит ни пользовательских senior skills, ни трёх обязательных исследований;
- новая feature branch от текущего `develop` вернёт ещё и Herdr/Paseo, потому что Orca-only ветка туда не интегрирована.

Это блокирующее противоречие между section 3, проектным branch contract и фактической provenance программы.

### FIND-SR-001 — Нет воспроизводимого входного SHA программы

Нужно определить обязательный prerequisite:

1. Orca-only SHA интегрирован в актуальный `develop`;
2. пользовательские senior skills и исследования получают tracked Git ownership либо передаются как явно зафиксированные внешние blob/path inputs;
3. после этого фиксируется новый program input SHA и blob IDs всех обязательных исходников.

Это не означает «создать senior skills заново»: требуется лишь сделать уже созданный пользовательский input доступным исполнителям и CI.

## Risks & Failure Modes (Black Hat)

### FIND-SR-002 — Lossless inventory фактически отложена до реализации

Appendix A не является lossless inventory:

- он пропускает многочисленные самостоятельные bullets начального раздела real-runs: branch/worktree readiness, auth, model discovery, `/goal`, ложные fixture workers, materialization ownership и другие;
- он отображает headings, хотя уникальные инциденты и уточнения часто находятся внутри отдельных list items;
- не показаны дубли с отдельными evidence locators;
- будущему исполнителю Spec 4 оставлено решать, какие узлы являются уникальными и кто ими владеет.

Кроме того, алгоритм §4.5 говорит о nodes «после `## Открыто`», но в `docs/backlog-issues-real-runs.md` такого раздела нет. У него корневой раздел `## 2026-08-24 — ...`. Упоминание «девяти sibling `##` sections» не соответствует frozen blobs.

Нужно включить полную сгенерированную inventory уже в утверждаемую программу либо задать точную заранее проверенную source-selection schema отдельно для каждого blob. Каждая строка должна иметь owner и disposition/proof family до передачи implementer.

### FIND-SR-003 — Доказательство биекции удаляется до final DoD

§4.5 создаёт machine-checkable closure map и test, но §4.7 удаляет оба. На final deletion SHA остаётся только coarse obligation-level acceptance, поэтому утверждение «ни один incident/requirement не потерян» уже нельзя проверить машиной на этом SHA.

Нужен двухфазный proof contract:

- closure SHA: полная биекция frozen blobs → durable obligations/proofs проходит машинно;
- final deletion SHA: два reviewer подтверждают, что delta удаляет только временные closure artifacts и выполняет запланированную миграцию;
- `docs/acceptance.md` сохраняет source blobs, closure proof SHA, final SHA и конкретную проверку lineage/delta.

Это существующий named consumer, а не новый general registry.

### FIND-SR-004 — Specs 2 и 3 образуют скрытый dependency cycle

Заявлено:

- Spec 2 зависит от Orca readiness Spec 3;
- полный Spec 3 E2E включает executor, hot reviewers, remediation и final same-SHA settlement;
- эти lifecycle semantics проектируются только Spec 2.

Значит Spec 3 нельзя полностью доказать до Spec 2, а Spec 2 нельзя начать до завершения Spec 3.

Не добавляя пятую spec, следует формально разделить Spec 3 на:

1. 3A — native capability/readiness probes;
2. Spec 1;
3. Spec 2 — lifecycle/review integration на доказанном 3A;
4. 3B — recovery, Qwen и полный lifecycle E2E;
5. Spec 4 closure.

### FIND-SR-005 — `find-reuse` не отделён от Meta-O операционно

Portable content хорошо отделён, но не хватает ключевых контрактов:

- не сказано прямо, что `find-reuse` сам не создаёт, не редактирует и не коммитит spec/repository artifacts;
- обещанная интеграция в Spec 2 отсутствует: нет trigger/offer policy, преобразования Meta-O intent в `find-reuse.request.v1`, владельца сохранения report и места в temporary feature spec;
- не определён алгоритм applicable surfaces, поэтому неизвестно, когда coverage считается `complete`;
- `AdapterDescriptor` не содержит OS-aware `install_help`, base URL/test override и typed execution/result contract;
- `query_examples` и `enrichment_examples` не являются исполняемым adapter interface;
- многие строки matrix остаются направлениями, а не concrete commands: GitHub advisories, GitLab API search, npm downloads, PyPI `pypistats`, Go proxy/pkg.go.dev, security/adoption enrichment;
- специально требуемый PyPI download path не имеет exact CLI/API invocation и tool probe.

Нужны чистый read-only skill contract, внешний Meta-O integration contract и executable adapter schema с точным argv/result/error mapping.

### FIND-SR-006 — Review modes и severity contract не специфицированы

`fast|deep|follow_up` есть во входной schema, но семантика режимов отсутствует. Implementer должен решить:

- какие paths и history читает каждый режим;
- когда `follow_up` повышается обратно до `deep`;
- получает ли он previous findings и previous reviewed SHA;
- что именно означает `fast` — standalone mode или advisory executor self-review;
- какие проверки обязательны в каждом режиме.

Также portable core не определяет P0–P3. Senior skills содержат definitions, но core прямо не требует их наличия.

Алгоритм ставит `Risk map` до чтения diff в `Discovery`, хотя применимые risk surfaces нельзя надёжно определить до первичного обзора change. Нужна последовательность: grounding → initial diff/scope discovery → risk map → targeted reachable discovery → candidate falsification → severity → report.

Полный report contract должен включать SHA, scope, mode, vendor/lens, checks, result `PASS|FINDINGS|UNKNOWN` и findings. TUI summary должен быть детерминированной проекцией уже доставленного report, а не вторым независимо сгенерированным вердиктом.

### FIND-SR-007 — Источник model configuration вымышлен, но не определён

Spec 2 говорит, что model/provider/effort приходят из `mo-setup posture/config`. Текущий `mo-setup` не владеет persistent model selection, а spec не задаёт:

- schema и storage/absence semantics;
- named consumer;
- standalone `mo-review-orca` selection flow;
- precedence между user choice, dynamic catalogue и saved values;
- invalidation при недоступной модели;
- передачу approved worker models локальному Qwen orchestrator.

Это архитектурное решение, а не command-syntax detail. Либо выбор полностью request-bound и неперсистентный, либо нужен узкий named config contract.

### FIND-SR-008 — Orca observation schema не покрывает собственный incident ledger

`RequiredObservation` не может представить несколько обязательных различий:

- `queued` против `active`;
- `input_blocked` против `output_blocked_after_work`;
- durable send, delivered, consumed и acknowledged;
- accepted content при rejected settlement;
- `unknown_effect`;
- partial/infra-blocked task outcome;
- pending follow-up при пришедшем `worker_done`.

Также не решены:

- приоритет Orca `ask/reply`, harness UI question и ordinary text;
- точное действие после compaction: reload contracts или invalidate attempt;
- delivery identifiers и batch acknowledgment;
- fallback после safe-summary refusal;
- проверяемая связь account-level quota с конкретным Dispatch.

Нужно расширить native capability requirements и дать transition/recovery table: observed state → allowed actions → forbidden actions → terminal proof.

### FIND-SR-009 — All-skill eval decision реализован только для changed skills

Frozen decision требует evals для всех skills. Общий contract ограничен «изменяемыми skills», поэтому без покрытия остаются как минимум:

- `mo-setup`;
- `mo-e2e`;
- `senior-python`;
- `senior-jsts`;
- возможно неизменённые entry skills после интеграционных правок.

Нужна program-wide skill/eval inventory: каждый installable skill → positive activation → forbidden activation → degraded case → repetitions → oracle → blocking/advisory status.

Для Qwen также не определены exact OpenCode invocation/profile, fixture repository, timeout/resource bounds и связь tested feature SHA с candidate SHA Meta-O.

### FIND-SR-010 — Knowledge gates требуют новых архитектурных решений от implementer

Для anchor stripping не определены:

- exact author annotation grammar;
- допустимые Markdown node/context types;
- поведение в links, inline code, fences, HTML и escaped text;
- AST library с source offsets/round-trip strategy;
- способ сохранить все нецелевые bytes.

Для historical gate не определены:

- seed state из cutoff commit;
- сравнение каждого commit с каждым parent в merge DAG;
- merge semantics;
- обработка shallow/partial clone и отсутствующего cutoff object;
- rename/revert/cherry-pick behavior;
- authority evidence для удаления business intent: самостоятельно написанный trailer не заменяет user-approved meaning change.

Нужен точный graph algorithm и fail-closed error taxonomy.

### FIND-SR-011 — Upstream boundary имеет противоречивую closure semantics

Общая цель разрешает closure через «подтверждённую upstream capability boundary». §4.6 такой disposition не разрешает, а Spec 3 говорит оставаться blocked до upstream fix или workaround. Эти три правила дают разные ответы одному backlog row.

Следует выбрать один контракт:

- `upstream-fixed`;
- `public-workaround-proven`;
- `architecture-rejected` с явной сокращённой support boundary;
- иначе программа остаётся blocked и backlog не очищается.

Само наличие upstream issue closure не даёт — это в spec сформулировано правильно.

## Strengths & Benefits (Yellow Hat)

Сильные стороны программы стоит сохранить:

- четыре specs действительно удерживают девять workstreams без возврата к дереву микроспек;
- Orca-only scope соблюдён;
- нет workflow engine, provider proxy или общего state store;
- `find-reuse` концептуально отделён от Meta-O layout;
- evidence/falsification поставлены выше confidence;
- `PASS` без findings признан валидным;
- vendor diversity и final same-SHA settlement сохранены;
- P3 не теряются и не создают отдельный бессмысленный round;
- unknown effects запрещено автоматически повторять;
- hot-session ownership и preservation чужих tabs хорошо выводятся из реальных инцидентов;
- temporary AST bijection — правильная идея, хотя её proof lifecycle нужно исправить;
- выбор `eslint-plugin-jsdoc` соответствует правилу mature tool first;
- local classifier остаётся bounded experiment и не вытесняет deterministic watchdog.

## Alternatives & Creative Ideas (Green Hat)

Минимальные изменения, сохраняющие утверждённые четыре specs:

1. Добавить «Program input readiness» перед общим change protocol: integrated base SHA, tracked senior skills, research blob IDs, clean working tree.
2. Встроить полную closure inventory в Spec 4 appendix как generated review input; implementer меняет только disposition/proof status, но не проектирует mapping.
3. Сделать `find-reuse` pure report producer. Meta-O adapter в Spec 2 один раз формирует generic request и сохраняет report в `## Reuse research`.
4. Убрать несуществующий implicit model config: передавать полный `ReviewSessionRequest` из runtime user-approved selection. Если нужен reuse между entry skills — отдельно описать узкий config с одним consumer pair.
5. Представить Orca policy таблицей состояний, а не расширяемой прозой.
6. Разделить Spec 3 внутренними gates 3A/3B, устранив цикл без пятой spec.
7. Сохранять final closure evidence через existing `docs/acceptance.md`: source blobs + closure proof SHA + deletion SHA + lineage check.
8. Для history checker использовать per-parent edge comparison: seed cutoff snapshot, затем проверять ID events на каждом DAG edge; отсутствие cutoff в object database даёт отдельный deterministic failure.

## Completeness & Process (Blue Hat)

### Traceability

Decision Ledger существует, но не полон.

В body отсутствуют или неполно реализованы adopted decisions:

- `find-reuse` invocation/destination external;
- evals всех skills;
- senior skills как реально доступный integration input;
- lossless coverage каждого уникального incident.

В `Rejected or deferred` ledger отсутствуют многие решения, уже принятые в body:

- отдельный `review-core` skill;
- prompt wall;
- auto-install/auto-login;
- registry-only applicability;
- confidence threshold;
- fallback harness/model;
- closing hot tabs;
- finding IDs in comments;
- local model вместо patterns;
- permanent version matrix;
- private transcript recovery;
- custom shell parser;
- regex Markdown parsing.

Либо ledger должен стать полным, либо эти пункты не должны называться substantive decisions.

### Decomposition Readiness

Четыре documents как packaging приемлемы, но отсутствует требуемая очередь малых increments. Особенно недекомпозированы:

- adapter core и каждый `find-reuse` adapter;
- review core versus mode policy versus Meta-O integration;
- Orca readiness, delivery, recovery, watchdog и Qwen qualification;
- JSDoc gate, anchor transformer, history gate и closure migration.

Нужна таблица increment → owner → inputs → produced artifact → deterministic proof → live proof → dependency.

### Weak-Model Executability

Слабая модель вынуждена угадывать смысл терминов:

- `applicable surface`;
- `qualifying public workaround`;
- `equivalent fields`;
- `bounded private input`;
- `stable operation id`;
- `OS-aware installation`;
- `non-inferiority`;
- `substantial improvement`;
- `owned resource`;
- `full review mode`;
- `source digest normalized content`.

Это не локальные implementation choices: разные трактовки меняют acceptance.

### Contract Completeness

Не хватает обязательных schemas/contracts:

- complete `find-reuse` adapter execution/result/error interface;
- Meta-O → `find-reuse` integration;
- review severity и mode behavior;
- full reviewer report;
- model selection/config;
- Orca delivery/ack/consumption state;
- question-channel precedence;
- compaction/refusal recovery;
- Qwen runner and bounds;
- all-skill eval matrix;
- closure node selection/digest algorithm;
- Git DAG/history algorithm;
- permanent linkage между closure proof и final deletion SHA.

После исправления этих пунктов базовую архитектуру можно сохранить; перепроектировать программу с нуля не требуется.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 5,
      "would_adopt": false,
      "summary": "Архитектурное направление в основном верное: четыре specs сохраняют skills-first, Orca-only, evidence-first review, same-SHA settlement и временную lossless migration без нового workflow engine. Однако spec пока не implementation-ready: заявленный base SHA не содержит untracked senior skills и research inputs, Specs 2–3 имеют цикл зависимостей, Appendix не является lossless inventory, closure proof удаляется до final DoD, а find-reuse, review modes, model selection, Orca events/recovery, all-skill evals и knowledge-history gates оставляют implementer существенные архитектурные решения. Требуется focused revision, а не смена общего подхода.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "FIND-SR-001",
          "severity": "major",
          "area": "program provenance",
          "description": "Program base не содержит всех обязательных входов и не является актуальным develop.",
          "evidence": "HEAD 41a4898 находится на feature/orca-only, develop остаётся на 2eb85be; senior-python, senior-jsts, их generated trees и docs/research являются untracked.",
          "required_change": "Определить reproducible integrated input SHA после Orca-only integration и tracked ownership либо точной внешней фиксации senior skills/research; зафиксировать blob IDs всех обязательных inputs."
        },
        {
          "id": "FIND-SR-002",
          "severity": "major",
          "area": "lossless inventory",
          "description": "Appendix отображает headings, но не каждый уникальный incident/list item, а будущий parser selector не применим к real-runs ledger.",
          "evidence": "Многочисленные bullets начального real-runs раздела отсутствуют в карте; §4.5 ищет nodes после `## Открыто`, которого в ledger нет, и упоминает несуществующие девять sibling `##` sections.",
          "required_change": "Включить проверенную полную inventory либо точную per-source AST selection schema и заранее назначить owner/disposition/proof family каждой строке."
        },
        {
          "id": "FIND-SR-003",
          "severity": "major",
          "area": "closure proof",
          "description": "Machine-checkable bijection удаляется, поэтому final SHA больше не доказывает отсутствие потерь.",
          "evidence": "§4.5 создаёт closure map/test, §4.7 удаляет их, а final DoD требует одновременно отсутствие temporary artifacts и lossless closure.",
          "required_change": "Определить двухфазный closure SHA/final deletion SHA contract и сохранить в existing acceptance source blobs, closure proof SHA, final SHA и проверяемую lineage/delta связь."
        },
        {
          "id": "FIND-SR-004",
          "severity": "major",
          "area": "dependencies",
          "description": "Specs 2 и 3 имеют скрытый цикл зависимостей.",
          "evidence": "Spec 2 требует Orca readiness Spec 3, но полный Spec 3 E2E требует hot review/remediation/same-SHA lifecycle, проектируемый Spec 2.",
          "required_change": "Формально разделить Spec 3 на 3A readiness и 3B full recovery/Qwen qualification; выполнить Spec 2 между ними."
        },
        {
          "id": "FIND-SR-005",
          "severity": "major",
          "area": "find-reuse",
          "description": "Portable skill и его Meta-O integration contract неполны.",
          "evidence": "Нет явного read-only/no-commit boundary, Spec 2 не описывает invocation/destination, applicability не алгоритмизирована, descriptor не содержит install help или typed result, а PyPI/GitLab/npm/Go enrichment содержит не exact commands.",
          "required_change": "Задать pure report producer contract, внешний Meta-O adapter, deterministic applicability and coverage rules и executable per-adapter probe/query/enrichment/error schema."
        },
        {
          "id": "FIND-SR-006",
          "severity": "major",
          "area": "review architecture",
          "description": "Review modes, severity и полный report contract отсутствуют.",
          "evidence": "`fast|deep|follow_up` присутствуют только как enum; P0–P3 не определены portable core; risk mapping выполняется до чтения diff; TUI summary не связан формально с authoritative report.",
          "required_change": "Определить mode transitions/inputs/scope, portable severity rubric, full PASS/FINDINGS/UNKNOWN report schema и deterministic TUI projection."
        },
        {
          "id": "FIND-SR-007",
          "severity": "major",
          "area": "model configuration",
          "description": "Spec ссылается на user-approved mo-setup config, которого нет и чей ownership не задан.",
          "evidence": "Текущий mo-setup проверяет posture, но не владеет persistent reviewer/executor model selection; spec не задаёт schema, path, consumer, precedence или standalone review flow.",
          "required_change": "Выбрать и специфицировать request-bound model selection либо узкий named config contract с ownership, validation, invalidation и consumer semantics."
        },
        {
          "id": "FIND-SR-008",
          "severity": "major",
          "area": "Orca lifecycle",
          "description": "RequiredObservation и recovery policy не выражают несколько уникальных incident families.",
          "evidence": "Schema не различает queued/active, input/output blocked, sent/delivered/consumed/acked, accepted-content/rejected-settlement и unknown_effect; question channel и post-compaction action не решены.",
          "required_change": "Добавить capability/event mapping и transition table с allowed/forbidden actions, channel precedence, delivery acknowledgement, compaction reload и refusal recovery."
        },
        {
          "id": "FIND-SR-009",
          "severity": "major",
          "area": "skill evals",
          "description": "Frozen all-skill eval decision сужен до изменяемых skills.",
          "evidence": "Общий contract назначает representative cases только specs, меняющим skills; mo-e2e, mo-setup и senior skills не получают program eval coverage.",
          "required_change": "Добавить полную skill-to-eval matrix и exact Qwen/OpenCode runner, fixture, bounds, repetitions and oracle contracts."
        },
        {
          "id": "FIND-SR-010",
          "severity": "major",
          "area": "knowledge integrity",
          "description": "Anchor stripping и historical ID gate недоопределены для реализации слабой моделью.",
          "evidence": "Не определены annotation grammar, eligible AST contexts, source-preserving library, cutoff seed, per-parent DAG semantics, shallow clone behavior и authority evidence для business ID removal.",
          "required_change": "Задать точный AST/source-range transform и per-parent Git graph algorithm с complete error taxonomy and authority requirements."
        },
        {
          "id": "FIND-SR-011",
          "severity": "major",
          "area": "closure dispositions",
          "description": "Upstream capability boundary имеет три несовместимые semantics.",
          "evidence": "Общая цель разрешает confirmed boundary, §4.6 не содержит такого disposition, а Spec 3 требует оставаться blocked до fix/workaround.",
          "required_change": "Разрешить только upstream-fixed, proven public workaround или architecture-rejected boundary; иначе сохранять blocked program state."
        },
        {
          "id": "FIND-SR-012",
          "severity": "major",
          "area": "decomposition readiness",
          "description": "Не задан требуемый critical path малых независимо проверяемых increments.",
          "evidence": "Есть только четыре крупных specs и общий порядок; implementer должен сам разделить adapters, review modes, Orca recovery, watchdog, Qwen и knowledge gates.",
          "required_change": "Добавить increment matrix с owner, dependency, artifact, deterministic proof, live proof и closure rows."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "FIND-SR-013",
          "severity": "minor",
          "area": "decision ledger",
          "description": "Decision Ledger не включает многие rejected/deferred решения, уже присутствующие в body.",
          "evidence": "В ledger отсутствуют отдельный review-core skill, prompt wall, auto-install/login, registry-only applicability, confidence threshold, fallback model, hot-tab cleanup policy, finding IDs, custom shell parser и другие решения.",
          "required_change": "Синхронизировать ledger с каждым substantive adopted/rejected/deferred решением."
        },
        {
          "id": "FIND-SR-014",
          "severity": "minor",
          "area": "comments policy",
          "description": "Фраза о том, что durable comments ссылаются только на business/architecture contracts, может запретить обычный self-contained комментарий причины.",
          "evidence": "§B-REVIEW-02 требует оставить в коде объяснение при отклонённом finding; запрет нужен на review IDs, а не на локальную prose без ссылок.",
          "required_change": "Уточнить: ссылки допустимы только на durable contracts, но самостоятельное объяснение invariant/reason без review ID разрешено."
        },
        {
          "id": "FIND-SR-015",
          "severity": "minor",
          "area": "final scans",
          "description": "Запрет Herdr/Paseo и orphaned artifacts сформулирован семантически, но не определён машинно.",
          "evidence": "README обязан сохранять исторический Herdr/Paseo pointer, поэтому простой text scan даст false positive; orphaned program artifact не имеет определения.",
          "required_change": "Определить точные current-tree prohibited paths/tokens и allowlist исторических указателей/archive material."
        }
      ],
      "assumptions": [
        "Текущее состояние working tree является авторитетным состоянием repository inputs на момент review.",
        "Frozen требование evals для всех skills распространяется и на неизменённые installable skills, включая пользовательские senior skills.",
        "Разные product-specific incidents допустимо объединять под одним durable invariant только при сохранении каждого distinct source locator до доказанного closure.",
        "Не существует внешнего model-selection config, не названного в repository или в тексте спецификации."
      ],
      "round": 1,
      "reviewer": "gpt56solhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 5
would_adopt: false
