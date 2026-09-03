# Исследование: как спроектировать сильный code-review skill для Claude Code и Codex

## Главный вывод

Твоя исходная интуиция в целом правильная, но я бы **не превращал текущую простыню в постоянный системный prompt** и **не делал схему “четыре одинаково полноправных ревьюера всегда”**.

Для моделей класса Claude Opus 5 и GPT-5.6 Sol наиболее перспективная архитектура выглядит так:

> **короткий high-recall core prompt → repo-specific invariants → независимый поиск кандидатов → отдельная фильтрация/валидация → dedupe/ranking**

И отдельно:

> **длинный checklist стоит сохранить не как prompt, а как taxonomy/routing layer и как источник eval-кейсов.**

Это хорошо совпадает сразу с несколькими независимыми сигналами. OpenAI для GPT-5.6 прямо рекомендует более lean prompts: в их внутренних coding-agent evals упрощение system prompts давало примерно **+10–15% к eval score**, при этом сокращая total tokens на **41–66%** и стоимость на **33–67%**; OpenAI отдельно советует формулировать каждую инструкцию один раз и сохранять дополнительные правила только там, где они исправляют измеренный gap. citeturn18view2turn18view3

У Anthropic картина чуть тоньше. Opus 5 действительно хорошо работает с полной постановкой задачи, но Anthropic специально предупреждает, что старые инструкции вроде “double-check”, “final verification” и “use a subagent to verify” могут приводить к **over-verification без улучшения качества**. Модель также сама охотнее делегирует работу субагентам, поэтому Anthropic рекомендует ограничивать delegation задачами, которые действительно крупные, независимые и параллелизуемые. citeturn19view0

При этом важнейшее наблюдение именно для code review: Anthropic рекомендует **не говорить Opus 5 “будь консервативным” или “показывай только high severity” на этапе поиска** — это буквально уменьшает число найденных проблем. Они предлагают позволить модели находить всё, а фильтровать уже отдельным проходом. citeturn19view0

Это почти идеально ложится на production-архитектуру Anthropic Code Review: несколько специализированных агентов ищут разные классы проблем, после чего **отдельный verification step проверяет кандидатов против реального поведения кода**, удаляет false positives, дедуплицирует и ранжирует результаты. citeturn18view4

То есть главный компромисс можно сформулировать так:

**не заставлять discovery-agent одновременно быть exhaustive, conservative, verifier, severity judge, security scanner, architecture reviewer и formatter.**

Пусть сначала он **ищет**, а затем другой этап **доказывает и фильтрует**.

Моя итоговая оценка твоих гипотез:

| Гипотеза | Вердикт |
|---|---|
| «Просто `сделай review` недостаточно» | **Да** |
| «Надо перечислить вообще все категории прямо в prompt» | **Скорее нет** |
| «Большие prompts могут ухудшать сильные модели» | **Да, есть прямое актуальное подтверждение для GPT-5.6** |
| «Нужно принудительно запускать subagents» | **Нет по умолчанию** |
| «Две разные frontier-модели полезнее одного и того же reviewer × N» | **Вероятно да** |
| «Long prompt + short prompt одновременно могут увеличить coverage» | **Хорошая eval-гипотеза, плохой default production design** |
| «Первое review стоит делать дороже последующих» | **Да, но я бы потратил бюджет не просто на четыре одинаковых review** |
| «Consensus двух/четырёх агентов делает finding достоверным» | **Нет** |
| «Нужен отдельный falsification/verification gate» | **Да, это одна из самых сильных идей** |

Последний пункт особенно важен. Исследования multi-LLM систем показывают, что consensus может усиливать общий заблуждающийся паттерн, а не обнаруживать истину. В исследовании ансамблей для generation/repair diversity оказалась существенно полезнее простого consensus; авторы называют проблему consensus “popularity trap”. Отдельная работа по adversarial defect discovery приводит особенно показательный real-world case: большое количество агентов могло единогласно поддержать несуществующую vulnerability, а решающим оказался простой empirical test. Эти результаты не являются прямым benchmark именно твоего будущего reviewer skill, поэтому их стоит трактовать как архитектурный сигнал, а не как доказательство конкретного числа агентов. citeturn17view12turn17view13

## Что актуальные Opus 5 и GPT-5.6 говорят о твоём большом промпте

В твоём prompt на самом деле смешаны **три очень полезные вещи**:

1. цель: «получить надёжный и быстрый инструмент»;
2. требование высокой полноты: «ищи всё, где может сломаться»;
3. taxonomy возможных failure modes.

Первые две я бы оставил почти дословно. Третью — вынес из основной инструкции.

### Почему просто «сделай полное ревью» тоже недостаточно

GPT-5.6 действительно стал лучше восстанавливать underlying intent и OpenAI прямо пишет, что теперь часто не нужно расписывать каждый промежуточный шаг. Но та же инструкция говорит продолжать явно задавать **domain context, hard constraints и success criteria**. Поэтому минимальный prompt вида:

```text
сделай ревью этой ветки
```

оставляет несколько существенных решений модели:

- review только diff или trace затронутые call sites?
- искать только correctness regressions или также performance/security?
- проверять assumptions тестами?
- показывать pre-existing bugs?
- считать architectural fragility finding'ом?
- что делать с подозрениями, которые нельзя подтвердить?

То есть модель способна сделать хороший review, но поведение становится менее определённым. citeturn18view2

Есть и более общий экспериментальный результат по underspecified prompts: модели зачастую способны самостоятельно восстановить неявные требования, но такое поведение менее стабильно при изменениях prompt/model; и механическое добавление всех возможных требований тоже не оказалось универсальным решением. Это ещё один аргумент в пользу **короткого явного контракта + измеряемых targeted rules**, а не двух крайностей. citeturn16search2

### Почему твой список всё равно ценен

Список:

```text
архитектура
хрупкость
безопасность
производительность
async
memory leaks
injections
swallowed errors
logic
dead code
...
```

очень полезен как **review ontology**. Но ontology и prompt — разные вещи.

Это хорошо видно на опыте OpenAI с собственными Code Review Rules. В их eval suite наличие repository-specific rules подняло recovery требуемых custom findings с **58.3% baseline до 98%**, то есть дополнительные знания могут драматически помогать. Но OpenAI одновременно обнаружила, что **широкие правила легко создают шум**, тогда как маленькие scoped rule sets с понятным invariant и safe path работают лучше. Они прямо советуют: если удаление правила не меняет review, правило не должно занимать место в guidance. citeturn18view0turn18view1

Очень похожая идея независимо появляется в исследовании iCodeReviewer. Вместо одного giant security prompt система содержит набор узких prompt experts, но **routing выбирает только релевантные к данному коду experts**. Авторы именно этим мотивируют уменьшение false positives от нерелевантных проверок; на их внутреннем security-review dataset такой подход заметно превзошёл исследованные baselines. Это security-specific работа, поэтому цифры нельзя напрямую переносить на general code review, но архитектурный принцип здесь крайне релевантен. citeturn17view9

То есть вместо:

```text
Всегда обязательно думай про
memory leak + SQL injection + races + architecture + ...
```

лучше:

```text
Find material ways this change can fail in production or violate
its intended behavior. Follow relevant execution paths beyond the diff.

Pay particular attention to risk classes that are actually implicated
by the changed code. Do not manufacture a finding merely to cover
a category.
```

А taxonomy оставить внутри `references/review-risks.md` и применять selectively.

### Почему длинный prompt иногда реально ухудшит результат

Здесь теперь есть довольно сильное прямое свидетельство, а не только folklore. Для GPT-5.6 OpenAI получила лучшие результаты coding agents после удаления повторов, примеров и лишнего tool guidance. Это именно современная model-specific рекомендация, а не старое правило времён маленьких context windows. citeturn18view3

Более общий IFScale benchmark тоже обнаружил ухудшение instruction following по мере роста числа одновременно предъявленных требований и bias в пользу ранних инструкций даже у frontier-моделей. Но benchmark использует искусственную задачу с сотнями keyword constraints, поэтому я бы использовал его лишь как supporting evidence, а не как основание для дизайна твоего reviewer. citeturn15search3

Для Opus 5 ситуация не означает «пиши максимально коротко». Anthropic говорит, что модель хорошо работает, когда **полная specification дана upfront**, и сохраняет instruction following в очень длинном контексте. Но это аргумент за полноту *необходимой постановки*, а не за repetition и generic checklists. Anthropic одновременно советует убрать legacy verification scaffolding и ограничить unnecessary delegation. citeturn19view0

Поэтому я бы сформулировал правило так:

> **Prompt должен быть не коротким, а information-dense.**
>
> Каждая строка должна либо менять search space, либо задавать invariant, либо определять evidence/output contract.

Это сильно отличается от «чем меньше слов, тем лучше».

## Как я бы перестроил сам процесс code review

Самая важная идея — сделать не один prompt, а **pipeline с разными objectives**.

### Discovery вместо «сразу выдай идеальные findings»

На первом этапе задача — получить высокий recall.

Reviewer должен понимать intended behavior фичи, посмотреть diff, но **не ограничиваться diff**: surrounding code, callers, callees, configuration, schemas, tests и invariants часто определяют, является изменение ошибкой. Anthropic managed Code Review именно так анализирует изменения в контексте полного codebase; свежие agentic security-review исследования также показывают важность repository-level navigation относительно статического review одного diff. citeturn18view4turn15search7

Здесь особенно хороша твоя фраза:

> «всё, что может усилить цель “надёжный и быстрый инструмент” или помешать ей — включай».

Она задаёт objective function, а не искусственный checklist.

Я бы только заменил «все потенциальные проблемы» на **«все material candidate issues»**. Иначе модель может интерпретировать задачу как необходимость заполнить отчёт.

Например:

```text
Find all material candidate issues you can substantiate.
Do not suppress a candidate merely because it seems low-confidence
or because another issue is more severe.
Do not invent findings to cover categories.
```

Для Opus это хорошо сочетается с рекомендацией Anthropic не отрезать discovery через “high severity only”. citeturn19view0

### Risk mapping вместо постоянного checklist

До или во время discovery агент может определить risk surfaces изменения:

```text
auth / trust boundary
serialization / parsing
DB / migration / transaction
async / concurrency / cancellation
resource lifetime
cache / consistency
external API / compatibility
hot path / performance
filesystem / networking
error propagation / observability
ownership / lifecycle
```

После этого углубляться только в активированные классы.

Например изменение:

```diff
- const result = await foo()
+ void foo()
```

должно активировать:

```text
async lifetime
lost errors
cancellation
ordering
process shutdown
```

но совершенно необязательно тратить reasoning budget на SQL injection или allocator lifetime.

Это практически тот же принцип, который iCodeReviewer применяет к security prompt experts: сначала определить релевантность, затем активировать специализированную проверку. citeturn17view9

### Candidate verification как отдельная логическая стадия

Вот здесь, на мой взгляд, находится самая большая возможность улучшить твой старый prompt.

Не спрашивать:

> «нашёл ли второй reviewer то же самое?»

а спрашивать:

> **«может ли второй reviewer опровергнуть конкретный finding?»**

Для каждого кандидата verifier получает:

```text
claim
file:line
supposed execution path
failure scenario
relevant surrounding code
```

и его задача:

```text
Try to kill this finding.

Trace the actual execution path.
Look for guards, invariants, callers, tests, ownership rules,
framework behavior, configuration, or language semantics that make
the claimed failure impossible.

When feasible, run a minimal non-destructive test/reproducer.

Return:
VALID / INVALID / UNPROVEN
and concrete evidence.
```

Это существенно лучше majority voting. BitsAI-CR пришёл к похожему двухстадийному решению: после генератора review comments отдельный `ReviewFilter` проверяет кандидатов, потому что первый этап производил hallucinations и factual errors. citeturn17view8

Anthropic в своём managed Code Review также параллельно ищет кандидатов, а затем отдельно проверяет их против actual code behavior, после чего dedupe/rank. citeturn18view4

Важно различать этот orchestration layer и инструкцию Opus 5 «сам себя перепроверь». Последнее Anthropic как раз не рекомендует: Opus 5 уже self-verifies и explicit repeated self-verification может лишь увеличить расход. **Cold verifier с отдельной ролью и отдельным контекстом — это другой механизм.** citeturn19view0

### Evidence важнее confidence score

Я бы почти не доверял:

```text
confidence: 95%
```

Самооценка модели мало что доказывает.

Гораздо ценнее требовать:

```text
Location
Failure scenario
Trigger/preconditions
Observed code path
Why existing guards do not prevent it
User/production impact
Validation evidence
```

и разрешить final states:

```text
confirmed
strongly supported
unverified
refuted
```

В final report по умолчанию можно показывать только первые два.

Исследование Refute-or-Promote особенно хорошо иллюстрирует разницу: consensus большого числа reviewers там не спас от общего ложного вывода, тогда как фактическая проверка смогла опровергнуть finding. Авторы сами подчёркивают, что это case-study methodology с confounders, а не controlled general benchmark, но как аргумент за empirical falsification он очень показателен. citeturn17view13

### Не смешивать discovery и severity policy

Есть интересное противоречие между современными рекомендациями поставщиков.

Anthropic для Opus 5 говорит: **на discovery не заставляйте модель быть conservative, иначе она просто не сообщит часть реальных bugs**. citeturn19view0

OpenAI в собственном Code Review делает большой акцент на scoped rules, restraint и отсутствии noise. citeturn18view0turn18view1

На самом деле противоречия нет, если разделить pipeline:

```text
DISCOVER broadly
       ↓
VERIFY aggressively
       ↓
FILTER by product policy
       ↓
RANK
```

То есть recall регулируется первым этапом, precision — вторым и третьим.

Это, на мой взгляд, **самая важная архитектурная идея всего исследования**.

## Сколько ревьюеров запускать и нужны ли subagents

Я **не стал бы делать default “2 модели × short/long prompt = 4 reviewers”**.

Но я обязательно провёл бы именно такой эксперимент на своём eval set.

Разница принципиальная:

> **как research experiment — отличная идея; как permanently hardcoded architecture — пока нет оснований.**

### Почему четыре reviewer'а могут не дать 2× результата относительно двух

LLM findings коррелированы. Ещё один run той же модели с немного другим prompt может найти что-то новое, но также может просто производить ещё одну формулировку того же самого false positive.

На code generation/repair исследование десяти моделей из пяти families обнаружило существенную complementarity между моделями и показало, что небольшие heterogeneous ensembles могут использовать эту complementarity гораздо лучше consensus-based selection. Авторы при этом прямо предупреждают, что их выводы проверялись на generation/repair и требуют отдельной проверки для других software-engineering задач, поэтому перенос на review — разумная гипотеза, а не установленный факт. citeturn17view12

Есть и исследование повторного review, где additional review rounds ухудшали F1 из-за роста false positives; single-pass cross-context review превосходил повторные review variants. Это исследование не тестировало Claude Code или Codex на production PRs, поэтому я бы не делал из него универсальный закон. Но оно хорошо предостерегает против стратегии «просто попросим модель ещё раз поискать проблемы». citeturn16search0

Поэтому дополнительный compute лучше тратить **на orthogonality**, а не просто на repetition.

### Что я бы запускал на первом глубоком review

Мой preferred вариант:

```text
                    ┌─ Opus 5: general bug hunter ─────────┐
diff + intent + repo                                      │
                    └─ GPT-5.6 Sol: independent reviewer ─┤
                                                         ↓
                                                 candidate union
                                                         ↓
                                              dedupe / risk routing
                                                         ↓
                                           cross-model falsification
                                                         ↓
                                               final ranked report
```

Причём discovery reviewers **не видят вывод друг друга**.

Почему две разные модели? Не потому, что «2 > 1» математически, а чтобы получить две разные model families и уменьшить вероятность полностью коррелированных blind spots. Это согласуется с ensemble research, но именно для code review эту гипотезу всё равно нужно проверять на твоих репозиториях. citeturn17view12turn17view13

Если change затрагивает особенно опасную область, после risk mapping можно включить targeted specialist:

```text
security
concurrency
transactions
compatibility
performance
resource lifetime
```

Но **только relevant specialists**.

Это намного более привлекательная трата третьего/четвёртого run, чем:

```text
Opus short
Opus long
Sol short
Sol long
```

### Когда твоя схема из четырёх агентов всё-таки разумна

Есть один сценарий, где я бы именно так и сделал: **период разработки самого skill**.

На каждом eval PR запустить:

```text
Opus 5 + minimal
Opus 5 + current long checklist
GPT-5.6 Sol + minimal
GPT-5.6 Sol + current long checklist
```

Затем не спрашивать «кто написал лучший отчёт», а вычислить:

```text
unique validated bugs found by each lane
false positives unique to each lane
findings common to lanes
severity-weighted recall
tokens
latency
cost
```

Если, скажем, long prompt стабильно обнаруживает дополнительные реальные races, надо выяснить **какая конкретно инструкция это вызвала**.

Допустим:

```text
long prompt:
+14 true findings
+9 are concurrency
+2 resource lifetime
+3 random
```

Тогда правильный результат эксперимента — не обязательно оставить long prompt.

Правильный результат может быть:

```text
Добавить concurrency routing rule.
Удалить остальные 90% checklist.
```

Именно такой iterative removal/measured-gap подход рекомендует OpenAI для GPT-5.6 prompts. citeturn18view3

### Нужно ли skill'у принудительно запускать subagents

**Нет.**

Это один из моментов, где документация обеих платформ сейчас довольно хорошо сходится.

OpenAI пишет, что subagents полезны для независимых, read-heavy parallel tasks, но каждый subagent делает собственную model/tool work и повышает token consumption. Ultra предназначен для действительно разделимых complex tasks, а OpenAI прямо отмечает, что большинству задач Max/Ultra не нужны. citeturn18view8turn17view7

Anthropic для Opus 5 ещё прямее: модель и так стала чаще делегировать работу; subagent выгоден на **genuinely independent, sizeable tracks**, а на мелких задачах multiplies cost and time. Anthropic отдельно рекомендует не создавать subagents исключительно ради double-checking. citeturn19view0

Поэтому вместо:

```text
ALWAYS spawn 5 subagents:
security
performance
logic
architecture
async
```

я бы написал host-level policy:

```text
Use subagents only when the review naturally splits into substantial,
independent investigations that can run in parallel.

Do not spawn subagents merely to satisfy review categories.
Do not spawn a verification subagent solely to repeat your own analysis.

Keep the number of concurrent reviewers low unless the change is broad
enough to justify more.
```

Но есть важное исключение: **external orchestrator**, запускающий независимый Opus и Sol, — это уже не то же самое, что просить самого Opus автоматически породить пять своих детей. Такой orchestrator я считаю хорошей идеей для deep mode.

## Предлагаемый дизайн portable skill

Claude Code skills сейчас следуют открытому Agent Skills standard, добавляя свои extensions для invocation, subagent execution и dynamic context. Codex тоже строит skills вокруг `SKILL.md` с `name` и `description` и использует progressive disclosure: сначала в контекст попадает краткое описание, а полный skill загружается после выбора. Поэтому имеет смысл сделать **один vendor-neutral core skill**, а orchestration-specific поведение держать отдельно. citeturn17view2turn17view5

Это также означает, что `description` должна быть короткой и хорошо определять trigger, а сам skill — решать одну конкретную задачу. OpenAI прямо рекомендует focused skills с явными inputs/outputs и тестировать trigger behavior. citeturn18view7

Я бы начал примерно с такого `SKILL.md`.

```md
---
name: deep-code-review
description: Review a project, branch, feature, commit, or working tree for material correctness, reliability, security, performance, and maintainability problems. Use when the user asks for a thorough code review, bug hunt, pre-merge audit, or review against an implementation spec.
---

# Deep code review

Review the requested change or scope. Do not modify the code unless the
user explicitly asks for fixes.

## Objective

Find material problems that could make the system:

- incorrect,
- unsafe,
- fragile,
- unexpectedly slow or resource-heavy,
- difficult to operate or diagnose,
- incompatible with existing behavior,
- likely to regress.

Optimize for useful defect discovery, not for producing a large number
of comments.

## Understand intent

First determine what the change is supposed to accomplish.

Use the user's specification or context when provided. Inspect relevant
repository documentation, tests, interfaces, configuration, and nearby
implementation when needed to understand intended behavior.

Distinguish:
- regressions introduced by the reviewed change;
- pre-existing issues exposed while reviewing it.

## Inspect beyond the diff

Treat the diff as the starting point, not the complete review surface.

Follow relevant:
- callers and callees;
- data and control flow;
- public/API contracts;
- state and ownership transitions;
- error paths;
- configuration and feature flags;
- tests and assumptions encoded elsewhere in the repository.

Use repository search and non-destructive checks when they materially
help establish whether a suspected problem is real.

## Find material candidate issues

Search broadly for concrete ways the implementation can fail or violate
its intended behavior.

Consider risk classes that are relevant to the changed code, including
correctness and edge cases, security and trust boundaries, concurrency
and asynchronous behavior, resource lifetime, error propagation,
compatibility, performance, architecture, and operational robustness.

Do not manufacture a finding merely to cover a category.

Do not suppress a real candidate only because another finding is more
severe.

## Evidence standard

A reported finding must identify:

1. the exact relevant location;
2. a concrete failure scenario or violated invariant;
3. the code path or mechanism that permits the failure;
4. the likely impact;
5. enough evidence that another engineer can verify the claim.

Prefer demonstrated behavior, executable evidence, repository
invariants, and concrete execution paths over speculation.

Do not report purely hypothetical concerns when no plausible trigger
can be established.

## Output

Deduplicate findings that share the same root cause.

Order findings by expected impact.

For every finding provide:

### [severity] concise title

Location: `path/to/file:line`

Problem:
A precise explanation of what is wrong.

Failure scenario:
The concrete inputs, state, timing, or execution path that triggers it.

Impact:
What can happen in practice.

Evidence:
Why the current implementation permits the failure and any validation
performed.

Fix direction:
The smallest useful description of how the invariant could be restored.

Mark pre-existing findings explicitly.

If no material findings survive investigation, say that no material
findings were found. Do not invent issues to make the review look
complete.

## Review context

$ARGUMENTS
```

Это заметно короче твоего checklist, но сохраняет его **семантическую цель**.

Я сознательно оставил только несколько broad families:

```text
correctness
security
concurrency
resource lifetime
error propagation
compatibility
performance
architecture/robustness
```

а не:

```text
SQL injection
command injection
memory leak
event listener leak
goroutine leak
promise rejection
...
```

Потому что второй уровень лучше сделать reference/routing data, а не permanent instruction.

Например:

```text
references/
  concurrency.md
  security.md
  resource-lifetime.md
  performance.md
  compatibility.md
  database.md
```

и подгружать их только при наличии соответствующего risk surface.

Progressive-disclosure модель skills на обеих платформах как раз делает такой подход естественным: основной контекст можно оставить компактным, а specialised guidance держать отдельно. citeturn17view5turn18view6

### Чего я намеренно не написал в skill

Я бы **не добавлял**:

```text
Think extremely hard.
Think step by step.
Double check everything.
Verify everything twice.
Use maximum reasoning.
Always use subagents.
Have another agent critique your work.
```

Для GPT-5.6 OpenAI рекомендует задавать outcome, context, constraints, evidence и success criteria, а reasoning effort регулировать отдельно и измерять на workload. Для Opus 5 Anthropic прямо говорит убрать redundant verification instructions. citeturn18view2turn18view3turn19view0

Я также не стал бы ставить:

```text
ONLY report P0/P1
be conservative
```

в discovery skill для Opus 5 из-за прямой model-specific рекомендации Anthropic. Фильтрацию лучше делать дальше. citeturn19view0

И я бы не превращал formatting/style/dead-code lint в главный фокус. Anthropic managed reviewer по умолчанию концентрируется на correctness problems, которые способны реально ломать production, а OpenAI советует deterministic formatting/mechanical checks оставлять CI/linters и использовать review rules для вещей, требующих инженерного judgment. citeturn18view5turn18view1

Это не значит игнорировать dead code. Если dead code скрывает старый path, оставляет security surface, меняет bundle/runtime cost или свидетельствует о неправильной реализации — это material finding. Просто `unused import` не должен конкурировать за attention с race condition.

## Как должен работать orchestration поверх skill

Я бы сделал **три режима**, а не одну фиксированную схему.

### Fast review

Для обычной небольшой фичи:

```text
1 frontier reviewer
↓
final findings
```

Например Opus 5 или GPT-5.6 Sol на не максимальном effort.

Это не означает «дешёвая модель». Opus 5 documentation сообщает, что code-review accuracy хорошо сохраняется на более низких effort settings; OpenAI аналогично рекомендует использовать минимальный reasoning effort, который реально проходит твои evals. citeturn19view0turn17view7

### Deep review

Для первой проверки крупной ветки:

```text
                     Opus 5 discovery
                    /
intent + repo + diff
                    \
                     GPT-5.6 Sol discovery

                           ↓

                     candidate union

                           ↓

                normalize + deduplicate

                           ↓

                targeted investigation
                 only when warranted

                           ↓

              cross-model verification

                           ↓

                    final report
```

Я бы сделал именно этот режим ответом на твою идею:

> «если в ветке ещё не было fix commits, может запускать четыре reviewer'а».

**Да идее “first review gets more compute”; нет обязательному “four generic reviewers”.**

На первом проходе максимальная marginal value обычно в **coverage**. После discovery marginal value смещается в **verification**.

Поэтому условные четыре units compute я бы распределил скорее как:

```text
1 × Opus general discovery
1 × Sol general discovery
1 × targeted investigation of highest-risk surfaces
1 × cross-model verification / falsification
```

а не:

```text
Opus short
Opus long
Sol short
Sol long
```

Так ты получаешь разные функции, а не четыре попытки выполнить почти одну функцию.

Архитектура parallel-specialists → verification → dedupe близка к тому, как Anthropic описывает собственный managed Code Review. citeturn18view4

### Follow-up review после фиксов

Здесь я бы **не делал полный expensive review с нуля автоматически каждый раз**.

Входом должны стать:

```text
previous review findings
+
commits/diff since that review
+
original intent/spec
```

И задача:

```text
1. Check whether previous findings were actually resolved.
2. Review the fixes for regressions or incomplete fixes.
3. Review newly changed behavior.
4. Revisit surrounding areas only where the fixes changed assumptions.
5. Do not search harder merely because the previous review already
   exhausted obvious findings.
```

Если изменения маленькие:

```text
one frontier reviewer
+
targeted check for affected invariants
```

Если fix затронул concurrency/auth/schema/transaction semantics или существенно переписал решение:

```text
promote back to deep mode
```

Такой adaptive policy также снижает риск «review pressure», когда дополнительные раунды начинают генерировать проблемы просто потому, что им снова сказали найти проблемы. Контролируемая работа по cross-context verification обнаружила именно такой рост false positives при повторных review rounds; поскольку это не production code-review benchmark, здесь я рассматриваю результат как cautionary evidence, а не как жёсткое правило. citeturn16search0

Ещё одна практическая деталь: я бы не пытался определять «первое review» по commit messages вроде `fix:`. Лучше orchestrator хранит review state:

```json
{
  "base_sha": "...",
  "reviewed_head_sha": "...",
  "review_id": "...",
  "open_findings": ["CR-001", "CR-004"]
}
```

Тогда режим определяется состоянием:

```text
no previous review state → deep discovery

previous review + small delta → follow-up

large semantic delta / risky surfaces → deep again
```

Это гораздо надёжнее эвристики «есть ли fix commits».

## Как решить long-vs-short и два-vs-четыре не мнением, а eval'ом

Здесь я бы вообще не принимал окончательного решения до собственного benchmark.

Это особенно важно, потому что официальный OpenAI результат про lean prompts сам OpenAI называет directional и прямо рекомендует повторять eval на representative workload. citeturn18view3

### Gold set должен проверять баг, а не похожесть текста

Не стоит оценивать reviewer по тому, насколько его comment похож на human comment.

c-CRAB — свежий benchmark code-review agents — как раз уходит от text similarity: human review findings превращаются в **executable tests, фиксирующие underlying defect**, и reviewer получает credit за обнаружение самой проблемы. Авторы отмечают, что LLM-as-judge оценки могут быть нестабильными и зависеть от prompt, поэтому executable oracle даёт более воспроизводимый сигнал. citeturn17view10

Для внутреннего benchmark я бы собрал четыре типа случаев:

| Тип | Откуда брать |
|---|---|
| Реальные regressions | старые PR, после которых были bug-fix commits |
| Реальные review bugs | accepted comments ваших коллег |
| Adversarial/seeding cases | controlled mutations существующего кода |
| Clean negatives | PR, где соответствующего bug действительно нет |

Особенно важны clean negatives. Иначе победит prompt:

```text
найди минимум двадцать проблем
```

у которого recall высокий просто потому, что он обвиняет всё подряд.

### Главные метрики

Я бы не оптимизировал одну `recall`.

Основной scoreboard:

```text
material issue precision
material issue recall

severity-weighted recall
unique validated findings

false positives / review
duplicate findings / review

time to first validated finding
total wall-clock time
input/output tokens
cost

validated unique findings / $
validated unique findings / minute
```

И ещё одна очень важная метрика:

```text
retention
```

То есть:

> когда ты добавил targeted security/concurrency rule, не перестала ли модель замечать обычные logic bugs?

OpenAI именно такую метрику использовала при оценке своих repository review rules наряду с coverage, restraint и actionability. citeturn18view0

### Конкретный эксперимент с твоим prompt

Сначала **никаких ансамблей**.

Запускаешь каждый вариант отдельно:

```text
             Minimal
             Concise-core
Opus 5  ×   Current-long

             Minimal
             Concise-core
Sol     ×   Current-long
```

Где:

**Minimal**

```text
Review this branch thoroughly against its intended behavior.
Find material problems and report them with concrete evidence.
```

**Concise-core**

— предложенный выше skill.

**Current-long**

— твой исходный prompt практически без изменений.

Это позволит ответить на самый интересный вопрос:

> **сам checklist помогает или просто перераспределяет attention?**

Следующий анализ — не только overall score, а category deltas:

```text
                        minimal   core   long

logic                     18       24     21
concurrency                 2        7      9
security                    3        5      6
error handling              4        8     10
performance                 2        4      5

false positives             5        7     18
```

Предположим long действительно оказался лучшим по async.

Не надо сразу выбирать long.

Нужно провести ablation:

```text
core
+
one concise concurrency instruction
```

Если он сохраняет дополнительные async bugs без +11 false positives, ты получил настоящую информацию из эксперимента.

Именно таким образом prompt постепенно становится **минимальным sufficient prompt**.

### Затем проверить ensemble

После выбора лучшего prompt per model:

```text
A = best Opus run
B = best Sol run
```

Сравни:

```text
A
B
union(A,B)
verified_union(A,B)
```

Самая важная строка здесь:

```text
verified_union(A,B)
```

а не:

```text
intersection(A,B)
```

Потому что finding, найденный лишь одной моделью, вполне может быть самым ценным; ensemble research показывает, что consensus способен выбрасывать minority-correct outputs. citeturn17view12

После этого сравни marginal value:

```text
Opus + Sol
vs
Opus + Opus(second prompt)
vs
Sol + Sol(second prompt)
vs
Opus + Sol + specialists
vs
Opus + Sol + verifier
vs
4-way discovery
```

И твоя production policy буквально получится из:

```text
Δ validated findings
--------------------
Δ cost × Δ latency
```

а не из ощущения, что четыре агента «должны быть надёжнее».

### Самый полезный long-term feedback loop

После каждого реального review сохранять:

```text
finding id
category
model
prompt version
review mode
validated/refuted
severity
developer accepted/rejected
escaped-to-production?
fix commit
tokens
latency
```

У Anthropic managed review уже есть похожая product feedback идея: findings получают 👍/👎 и реакции используются для улучшения reviewer. citeturn18view4

Через несколько сотен reviews станет возможно отвечать на гораздо более интересные вопросы:

```text
Does Opus add anything after Sol on Go concurrency code?

Does the security specialist pay for itself on backend PRs?

Does deep mode discover more P1 bugs, or merely more P3 comments?

Does reviewer #3 ever produce unique validated findings?

Which instructions improve recall but destroy precision?

Which repository rules have become obsolete?

Which review categories almost never fire?
```

И это даст гораздо больше, чем любое универсальное prompt-engineering правило.

## Рекомендуемая финальная архитектура

Если бы я сегодня собирал первую production-версию этого skill под Opus 5 / GPT-5.6 Sol, я бы остановился на такой схеме.

**Core skill:** один компактный vendor-neutral `SKILL.md`, примерно как предложенный выше. Claude Code и Codex оба поддерживают skill-модель с progressive disclosure, а Claude Code следует Agent Skills standard, поэтому portable core сейчас вполне естественен. citeturn17view2turn17view5

**Repository knowledge:** не запихивать все accumulated lessons в core prompt. Держать рядом scoped invariants вроде:

```text
auth/session.md
db/transactions.md
api/backward-compat.md
async/lifetimes.md
```

или в repo-level `AGENTS.md` / `CLAUDE.md` / review guidance, насколько это соответствует конкретному host. Опыт OpenAI с custom review rules показывает одновременно огромную пользу релевантных local invariants и вред overly broad guidance. citeturn18view0turn18view1

**Default mode:** один сильный reviewer; subagents не форсировать.

**Initial deep mode:** две независимые frontier families — Opus 5 и GPT-5.6 Sol — с коротким outcome-focused review contract.

**Routing:** по diff/repository context определить risk surfaces и запускать только релевантные deep checks.

**Verification:** объединить candidates, затем отдельным cold context попытаться каждый finding опровергнуть; для дорогих/high-impact findings использовать cross-model verifier и, где возможно, реальный test/reproducer.

**Reporting:** показывать пользователю не сырой candidate pool, а deduplicated verified findings. Pre-existing bugs маркировать отдельно. Это соответствует архитектурному паттерну, используемому Anthropic Code Review, и двухстадийному filtering pattern из промышленного BitsAI-CR. citeturn18view4turn17view8

**Follow-up:** delta review fixes + проверка unresolved invariants; не запускать четыре fresh bug hunters на каждый небольшой patch.

**Long checklist:** оставить. Но переименовать мысленно из:

```text
THE PROMPT
```

в:

```text
REVIEW TAXONOMY / ROUTER KNOWLEDGE / EVAL COVERAGE MAP
```

Именно там твой текущий список будет наиболее ценен.

В результате система получится примерно такой:

```text
                        ┌──────────────────┐
                        │ intent / spec    │
                        │ diff / branch    │
                        │ repository rules │
                        └────────┬─────────┘
                                 │
                                 ▼
                      ┌─────────────────────┐
                      │   risk mapping      │
                      └─────────┬───────────┘
                                │
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
        ┌─────────────────┐         ┌─────────────────┐
        │ Opus 5          │         │ GPT-5.6 Sol     │
        │ independent     │         │ independent     │
        │ discovery       │         │ discovery       │
        └────────┬────────┘         └────────┬────────┘
                 │                           │
                 └─────────────┬─────────────┘
                               ▼
                    ┌────────────────────┐
                    │ candidate union    │
                    │ + deduplication    │
                    └─────────┬──────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │ triggered specialists   │
                │ only if risk warrants   │
                └────────────┬────────────┘
                             │
                             ▼
                  ┌───────────────────────┐
                  │ falsify / reproduce   │
                  │ cross-model verifier  │
                  └───────────┬───────────┘
                              │
                              ▼
                     ┌────────────────┐
                     │ policy filter  │
                     │ severity rank  │
                     └────────┬───────┘
                              │
                              ▼
                  ┌──────────────────────┐
                  │ concise final report │
                  └──────────────────────┘
```

В этой конструкции **больше compute используется там, где он создаёт новую информацию**: другая model family, другой risk lens или попытка опровергнуть finding. Это более сильная ставка, чем механическое увеличение количества одинаковых reviewers. Исследования ансамблей, промышленного code review и современные рекомендации Anthropic/OpenAI сходятся именно вокруг специализации, contextual grounding, validation и контроля noise, хотя точное оптимальное число reviewers всё равно остаётся workload-specific и должно определяться собственными evals. citeturn18view4turn18view3turn17view8turn17view9turn17view12

Если свести всё исследование к одной формуле, я бы сделал её такой:

> **Не пытайся написать prompt, который заставит одного LLM одновременно “помнить все возможные баги”. Построй reviewer, который коротко понимает цель, широко ищет, selectively углубляется и безжалостно пытается опровергнуть собственный candidate pool перед тем, как беспокоить разработчика.**

Именно это, вероятно, даст твоей цели — **«надёжный и быстрый инструмент»** — лучший баланс recall, precision, latency и стоимости на нынешнем поколении Opus 5 / GPT-5.6 Sol. citeturn19view0turn18view3turn18view4