## Facts & Constraints — White Hat

Proposal 1 корректнее разделяет три объекта: skill, OpenCode harness и Qwen model. Он фиксирует результат как относящийся к конкретному composite и оставляет первые Qwen-прогоны advisory. Это соответствует пользовательскому вводу: доступность и скорость модели ещё не являются обещанием её поддержки.

Proposal 2 смешивает уровни. `promptfoo` через OpenAI-compatible endpoint тестирует прямой model API, а не Qwen внутри OpenCode. Следовательно, такой прогон не проверяет:

- реальную установку и discovery skills в OpenCode;
- выбор skill самим harness;
- OpenCode tool permissions;
- session behavior;
- выполнение команд через actual agent loop.

Это также расходится с §B-PORTABILITY-01, который ориентирует Meta-O на настроенные subscription harnesses и прямо исключает LLM API как основную поверхность.

Обе версии правильно оставляют model/network runs вне `make mo-qc`; статическая проверка corpus, schemas, fixtures и absence of secrets вполне может быть частью `mo-qc`.

## Risks & Failure Modes — Black Hat

В Proposal 1 не доказана enforceability permissions. Поля `network: denied`, `commands`, `filesystem_roots` и oracle `network_denied` сами по себе ничего не изолируют. OpenCode permission configuration может ограничить предлагаемые tools, но агент всё ещё способен вызвать сеть через shell, package manager, Git или дочерний процесс. Нужен реальный isolation boundary либо честная формулировка «наблюдали отсутствие сетевых вызовов», а не «network denied».

Вторая проблема Proposal 1 — собственный `run-skill-evals.mjs` вводится без обязательного `find-reuse` зрелого eval tooling. Это противоречит как общей политике mature-tool-first, так и новой роли самого `find-reuse`. Возможно, custom runner действительно необходим для OpenCode sessions, tool traces и disposable fixtures, но это сначала надо доказать сравнением `promptfoo`, `inspect_ai`, OpenCode-native facilities и CLI providers.

Trigger evals остаются частично неопределёнными. Если OpenCode не предоставляет public activation evidence, отсутствие или наличие текста, похожего на skill, не доказывает activation. Такие кейсы могут быть advisory proxy-evals описаний, но не release-blocking trigger proof.

Proposal 2 имеет более фундаментальный дефект: deterministic oracle не делает причиной failure именно skill. Если Qwen пять раз неверно решил задачу с однозначной инструкцией, это может быть ограничением модели. Утверждение, что failure слабой модели «почти всегда» означает объективно неоднозначный `description`, не доказано и фактически является проверяемой гипотезой. Сделать Qwen-контур блокирующим можно только после отдельного решения, что Meta-O поддерживает этот exact model/harness profile. Frozen decision такого support commitment не содержит.

`promptfoo`-архитектура Proposal 2 также внутренне противоречива: предложение положительно отмечает его cache и одновременно утверждает, что runner не хранит состояния между запусками. Для nondeterminism repetitions cache должен быть гарантированно отключён, а все promptfoo outputs/databases направлены в disposable directory.

## Strengths & Benefits — Yellow Hat

Proposal 1 наиболее полно покрывает поставленный amendment:

- все восемь skills имеют отдельные suites;
- есть representative task-success fixtures, включая executable tests для senior skills;
- Qwen не судит собственный output;
- DeepSeek остаётся необязательным comparator;
- initial Qwen characterization не блокирует release;
- environment fingerprint относится к одному запуску, а не становится version matrix;
- fake services отделены от live Orca evidence;
- paired skill/no-skill runs позволяют оценивать incremental value;
- nondeterminism измеряется повторами, а не скрывается одним удачным запуском;
- corpus и runner переносятся через Git, а machine profile и raw outputs остаются вне репозитория.

Proposal 2 удачно предлагает deterministic-first policy, confusion pairs для trigger cases, небольшой corpus format и явное правило `blocking ⇒ deterministic oracle`. Идея отделить общий eval foundation от cases, принадлежащих предметным спецификациям, архитектурно здравая.

Обе версии не требуют DeepSeek, не принимают 115 tokens/s за quality evidence и не возвращают запрещённый workflow state.

## Approved-boundary verification — Green Hat constrained

Proposal 1 не пересматривает frozen decisions.

Proposal 2 нарушает их в двух местах:

- называет идентичность `Qwen 3.8 27B` вероятной ошибкой диктовки и предлагает возможную подмену на другую модель;
- аналогично трактует `DeepSeek 4 Flash` как вероятный артефакт.

Frozen decision требует воспринимать эти названия как пользовательскую authority. Допустимо считать их opaque identifiers и проверять runtime-reported identity; недопустимо предлагать альтернативную модель.

Proposal 2 также меняет статус Qwen с «дешёвого основного кандидата» на обязательный release profile без отдельного evidence-backed adoption decision.

## Completeness & Process — Blue Hat

Proposal 1 можно принять после четырёх основных исправлений:

1. Добавить обязательный `find-reuse` этап выбора eval framework и критерий, когда custom runner оправдан.
2. Специфицировать реальный isolation mechanism для network/filesystem/process effects.
3. Разделить actual OpenCode activation eval и advisory description-classification proxy.
4. Указать, что GPT/Claude judges запускаются через утверждённые native subscription harnesses, а не API, и что durable ADR хранит методику и агрегированный вывод, но не run receipt.

Дополнительно `secret_absence` следует проверять через синтетические canary secrets, а не обещать обнаружение произвольных секретов.

Proposal 2 требует перестроить центральный execution path:

- `promptfoo` можно использовать для prompt-level advisory experiments, но actual blocking suite должен запускать OpenCode как harness;
- Tier 2 должен наблюдать реальные OpenCode tool calls к isolated stub binaries;
- initial Qwen results должны быть advisory до ratified support profile;
- senior suites должны содержать executable repository fixtures и task-success oracles, а не только labels/forbidden strings;
- cache и persistent output promptfoo должны быть отключены или изолированы;
- tracked `docs/eval-environment.md` не должен фиксировать единственную поддерживаемую версию OpenCode: exact versions принадлежат run fingerprint, а документ — схеме и процедуре qualification.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-2",
      "approval_score": 4,
      "would_adopt": false,
      "summary": "Proposal 2 содержит полезные corpus и deterministic-oracle идеи, но центральная архитектура тестирует Qwen через OpenAI-compatible endpoint вместо OpenCode, поэтому не проверяет фактическое skill discovery, permissions и tool loop. Он также преждевременно делает Qwen blocking release profile, ошибочно приписывает failures слабой модели неоднозначности skill, недостаточно покрывает task success senior skills и прямо ставит под сомнение frozen model identifiers.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "EVAL-P2-HARNESS-01",
          "severity": "critical",
          "area": "model and harness separation",
          "description": "Promptfoo вызывает model endpoint напрямую и обходит OpenCode, который должен быть harness-under-test.",
          "evidence": "Архитектура использует MO_EVAL_BASE_URL/OpenAI-compatible provider, тогда как frozen input задаёт Qwen через OpenCode; прямой endpoint не исполняет OpenCode skill discovery, sessions, permissions и tools.",
          "required_change": "Запускать actual OpenCode CLI/session из eval harness и собирать его public activation/tool/final-output evidence; promptfoo оставить только как возможный внешний case driver или advisory prompt comparator."
        },
        {
          "id": "EVAL-P2-PROFILE-02",
          "severity": "critical",
          "area": "release policy",
          "description": "Qwen Tier 1/2 немедленно объявлен обязательным release gate без принятого support profile.",
          "evidence": "Frozen decision называет Qwen дешёвым основным кандидатом для evals, но не устанавливает обязанность каждого Meta-O skill работать на этом composite.",
          "required_change": "Сделать первые Qwen runs advisory characterization; blocking status разрешать только после отдельного evidence-backed adopt decision с точным profile и reversal condition."
        },
        {
          "id": "EVAL-P2-CAUSALITY-03",
          "severity": "major",
          "area": "eval interpretation",
          "description": "Failure слабой модели ошибочно считается доказательством дефекта или неоднозначности skill.",
          "evidence": "Даже при deterministic oracle неверный output может быть вызван model capability, harness behavior или tool failure; оракул определяет результат, но не причинность.",
          "required_change": "Использовать paired skill/no-skill и, при споре, stronger model/harness control; маркировать attribution как hypothesis до подтверждения."
        },
        {
          "id": "EVAL-P2-TOOL-TRACE-04",
          "severity": "major",
          "area": "tool-level evals",
          "description": "Stub Orca argv trace не связан с выбранным promptfoo execution path.",
          "evidence": "Model endpoint сам не запускает shell binary на PATH; поэтому tools/stub-orca не увидит argv без actual agent harness, выполняющего tool calls.",
          "required_change": "Исполнять Tier 2 внутри disposable OpenCode agent session с isolated PATH и проверяемым tool-event stream."
        },
        {
          "id": "EVAL-P2-TASK-SUCCESS-05",
          "severity": "major",
          "area": "suite completeness",
          "description": "Suites senior-python и senior-jsts почти не измеряют task success.",
          "evidence": "Предложены trigger labels, forbidden strings и severity vocabulary, но нет repository fixtures, generated patch, tests, behavioral oracle или mutation-resolution checks.",
          "required_change": "Добавить bounded disposable repositories с seeded defects и clean negatives; проверять tests, diff allowlist, invariant restoration и отсутствие unrelated rewrites."
        },
        {
          "id": "EVAL-P2-PERSISTENCE-06",
          "severity": "major",
          "area": "runner state",
          "description": "Использование cache promptfoo противоречит one-shot/no-state и искажает nondeterminism repetitions.",
          "evidence": "Proposal перечисляет cache как преимущество promptfoo, но не определяет его отключение, изоляцию output/database или очистку между повторами.",
          "required_change": "Отключить cache для repetitions, направить все promptfoo state/output в disposable directory и проверить cleanup."
        },
        {
          "id": "EVAL-P2-FROZEN-ID-07",
          "severity": "major",
          "area": "approved boundary",
          "description": "Proposal пересматривает замороженные идентификаторы Qwen и DeepSeek как возможные ошибки диктовки.",
          "evidence": "Раздел допущений предлагает альтернативные семейства моделей, хотя frozen decisions требуют не переоткрывать их.",
          "required_change": "Считать обе строки opaque user-authoritative identifiers и только записывать расхождение с runtime-reported identity без угадывания замены."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "EVAL-P2-VERSION-08",
          "severity": "minor",
          "area": "reproducibility",
          "description": "Одна mutable строка docs/eval-environment.md превращает конкретную версию OpenCode/model в текущий support contract.",
          "evidence": "Смена версии требует правки tracked документа, хотя §B-PORTABILITY-05 не связывает проект с версиями чужих tools.",
          "required_change": "Хранить tracked schema и qualification procedure, а exact versions и quantization — в fingerprint конкретного run."
        },
        {
          "id": "EVAL-P2-ORACLE-STRENGTH-09",
          "severity": "minor",
          "area": "deterministic oracles",
          "description": "Forbidden strings и decision-word часто проверяют форму, но не фактическое соблюдение инструкции.",
          "evidence": "Ответ может содержать UNKNOWN и одновременно выполнить запрещённый side effect либо дать неверное объяснение.",
          "required_change": "Для blocking safety/task cases использовать observable tool/effect/end-state oracles; текстовые проверки оставить contract-level."
        }
      ],
      "assumptions": [
        "Тестировать требуется реальное поведение skills внутри OpenCode, а не только ответы той же модели через отдельный API client.",
        "Frozen Qwen decision не является неявным обещанием поддерживать Qwen как release-blocking Meta-O model.",
        "Prompt-level proxy routing может быть полезным advisory исследованием, но не доказательством actual host activation."
      ],
      "round": 1,
      "reviewer": "gpt56solhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 4
would_adopt: false
