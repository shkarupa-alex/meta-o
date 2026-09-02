# Синтез: программа спецификаций для обнуления backlog Meta-O

## Статус консилиума

Два судьи — GPT-5.6 Sol/high и Claude Opus 1M/high — выполнили три раунда proposals, анонимных cross-review и refinements. Формального convergence нет: средняя итоговая оценка обоих направлений 6/10, один из двух судей готов принять Opus R2. Это не даёт права выбрать proposal целиком. Ниже — lossless synthesis сильных частей и исправление общих блокеров.

Обозначения: `[Т]` — принятое требование, `[Р]` — решение synthesis, `[Э]` — гипотеза, которую должен разрешить эксперимент.

## Неизменяемые границы

- [Т] Только Orca; Herdr/Paseo вне области.
- [Т] Skills-first; никакого workflow engine, general state store, run registry или provider/backend proxy.
- [Т] `senior-python` и `senior-jsts` уже существуют; их создание не является работой программы.
- [Т] `mo-reuse` становится независимым `find-reuse`; Meta-O integration живёт снаружи.
- [Т] Два независимых vendor-diverse review на одном полном SHA остаются lifecycle gate.
- [Т] Исходные записи нельзя переписать или удалить до доказанного переноса каждого самостоятельного требования и distinct incident evidence.
- [Т] Повторяющиеся пользовательские оценки хорошего и плохого поведения сводятся в долговечные бизнес-тезисы. Будущие implementation и review применяют их без повторного интервью; изменить бизнес-смысл можно только явным решением пользователя, принятым в текущей работе.
- [Т] Monitoring-heavy orchestration должна уметь работать через подходящую локальную модель в OpenCode, чтобы не расходовать подписочные токены Claude/Codex. Конкретный model profile принимается только после orchestrator eval; текущий основной кандидат — доступный на GPU-машине Qwen 3.8 27B UD-Q4-KM.

## Доктрина закрытия

[Р] Один ledger item закрывается ровно одной основной диспозицией:

1. `implemented`: постоянный контракт Meta-O доказан `make mo-qc` и/или live E2E.
2. `decision_recorded`: владеющее `§A-*` явно принимает либо отклоняет пожелание, называет причину, влияние и условие пересмотра; ссылка и knowledge chain проверяются.
3. `out_of_scope`: доказано, что исходный дефект принадлежит другому продукту и не выражает обязанность Meta-O; извлечённый постоянный урок, если он есть, получает свой owner/proof.

Upstream issue — provenance и выполнение §B-PORTABILITY-06, не самостоятельное доказательство закрытия. Временный workaround может закрыть локальную обязанность лишь когда использует документированную public surface, полностью обеспечивает исходный backend contract, имеет normal/failure live proof и removal probe. Если обязательная capability не обеспечена, пункт остаётся открытым.

## Lossless closure без нового вечного manifest

[Р] Во временной umbrella-spec хранится source inventory, построенный Markdown AST по pinned Git blob текущих `docs/backlog.md` и `docs/backlog-issues-real-runs.md`:

- locator = blob OID + AST path + byte range + content hash;
- каждый самостоятельный paragraph/list item/heading scope получает строку;
- девять sibling `##`-секций после `## Открыто` входят в inventory наравне с пятью `###` entries;
- дубли могут указывать на одного owner, но каждая исходная строка сохраняет собственный locator и evidence;
- extractor проверяет биекцию со всеми содержательными source nodes, а не заранее придуманное количество `BW-*`.

Во время реализации каждая строка указывает spec, owner contract, disposition и proof. Перед удалением umbrella-spec verifier доказывает путь `source node → durable obligation → proof`. `docs/acceptance.md` остаётся на уровне обязанностей Meta-O и не разрастается строкой на каждый инцидент; distinct evidence каждого свёрнутого node живёт в именах/описаниях fixtures, contract tests или E2E-сценариев, доказывающих обязанность. Финальный SHA не хранит отдельный closure index или копию ledger. В acceptance-карте остаётся одна provenance-координата исходного commit `41a4898974a6a08eb415cb07ba849575c5964b61` и blobs `8d11d1107eb5875235c2830e6503f7e1265317d7` / `c75859372fa7d794269cc6dcc8834c069ddd8096`; named consumer — существующая acceptance map и её AST test. Это сохраняет воспроизводимую связь, не создавая новый manifest.

## Финальная упаковка: четыре спецификации

[Р] Девять областей ниже остаются lossless workstreams: так проще доказать, что ни одна строка исходного backlog/research не потерялась. Но самостоятельных документов и implementation tracks будет четыре:

1. **Portable skills: reuse, review, bounded evals** — WS-01 и переносимая часть WS-03; сюда же входит общий минимальный eval-контракт для изменяемых skills.
2. **Feature lifecycle: intent, execution and review settlement** — WS-02, WS-04 и интеграционная часть WS-03.
3. **Orca reliability and local-model orchestration** — WS-05, WS-06, WS-08 и критический Qwen/OpenCode eval оркестратора.
4. **Knowledge integrity and backlog closure** — WS-07 и WS-09; эта spec завершает миграцию и доказывает пустой backlog.

Umbrella связывает только зависимости и coverage. Детальные adapter matrices, fixtures и proof tables остаются приложениями соответствующей spec, когда действительно нужны; отдельный документ на каждый workstream не создаётся.

Четыре spec выводятся не только из этого синтеза: их coverage проверяется против обоих author proposals, всех cross-reviews R1–R3, premortem и user decision ledger. Следующий проход судей получает эти материалы вместе с четырьмя draft specs и ищет потерянные требования, неверно объединённые ownership boundaries и противоречия; новый generation round без специальной причины не запускается.

## Workstreams внутри четырёх спецификаций

### WS-01 — `find-reuse`

Переносимый skill и собственные generic references. Не знает Meta-O paths, lifecycle, destination, commits или spec layout.

Вход: problem, generic business requirements с приоритетами, applicable constraints, repository root и depth. Выход: Markdown report со status `reuse|extend|build|unknown`, coverage каждой применимой surface, queries, candidate families, requirement fit, provenance, enriched signals, rejected options и residual unknowns.

Adapter descriptor обязан назвать capabilities (`semantic_search`, `name_search`, `exact_lookup`, `downloads`, `releases`, `maintenance`, `reverse_dependencies`, `security`), tools, auth scope и ограничения. Ошибка не превращается в пустую выдачу.

Экономичное ядро запуска: local repository; применимый source host; registry detected ecosystem. Capability/task classifier по бизнес-требованиям добавляет минимальный cross-ecosystem discovery tier для нового компонента или допустимой смены технологии — repository detection не является единственным сигналом. Каталог adapters покрывает GitHub/GitLab, npm, PyPI, crates.io, Go proxy/pkg.go.dev, Maven Central, NuGet, RubyGems и Packagist; optional adapters — Codeberg/Gitea, Bitbucket, Swift, Hex, pub.dev, Conan/vcpkg и private registries. Для каждого обязательны рабочий arbitrary-query example, probe, auth probe/login, enrichment, `last_verified` и honest unavailable fields. Исключённые adapters перечисляются с причиной; неопределённая применимость даёт `unknown`, а не `build`.

PyPI: hosting search для semantic discovery; Simple API только кэшируемый/опциональный name resolver; JSON API exact metadata; pypistats явно внешний downloads source. Go: proxy endpoints или временный module context, не неработающий `go list` вне модуля.

Skill не устанавливает tools и не логинится: предлагает точную OS-aware команду/официальную инструкцию и помечает coverage gap. `build` запрещён, если отсутствовал required source.

Identity: canonical repository host/id; ecosystem-normalized package id; package↔repository provenance; forks/mirrors и monorepo packages не схлопываются без authoritative evidence; uncertain match = `possible_same_as`. Finalists всегда обогащаются registry + source-hosting signals.

Acceptance: rename без alias; portability scan запрещает Meta-O vocabulary/paths; versioned `report_contract`; fixture tests на auth gap, malformed/rate limit, dedup, cross-source enrichment и unknown completeness. Opt-in live probes не входят в non-mutating `mo-qc`; они отличают отсутствующий user tool от устаревшего adapter. Meta-O consumer громко отклоняет неизвестную версию report contract.

### WS-02 — intent/spec/executor lifecycle

Первый implementation commit материализует утверждённую spec, verbatim user ledger и короткий outcome checklist; новые durable business intents извлекаются пропорционально изменению, без раздувания `docs/business.md`. Closure inventory отдельно требует проверить каждый повторяющийся good/bad behavior: устойчивое ожидание становится тезисом `§B-*`, если оно ещё не покрыто; уже покрытое получает точную ссылку; изменение смысла допустимо только после явного решения пользователя. Исполнитель, не orchestrator, владеет product/spec commits.

Здесь же внешняя Meta-O policy вызывает `find-reuse`, передаёт generic context и помещает Markdown report в `Reuse research`; `find-reuse` destination не знает. Clean-room advisory self-review допустим только как явно записанное исключение к §B-SESSION-01: он не lifecycle gate, не заменяет двух reviewers, не владеет worktree и полностью отражается в `worker_done`.

Spec/checklist удаляются только после переноса durable knowledge, пользовательского merge decision и повторного proof на deletion SHA. Final review получает intent из parent Git blob/private temporary input, не из нового tracked archive.

### WS-03 — portable evidence-first review core и evaluation

Compact explicit-invocation-only skill: grounding intent/contracts → risk map → broad discovery → falsification/evidence → changed-line causality → severity → concise report. Returning zero findings is valid. Confidence may annotate evidence, never replace it. Review читает immutable checkout exact SHA либо SHA-addressed Git objects; hot остаётся сессия, но не mutable working directory/candidate context. Proof фиксирует HEAD, clean status и отклоняет SHA mismatch.

Repository instructions, reachable surrounding code, tests and relevant history read selectively. Prior PR comments/GitHub are optional adapters, not core coupling. `senior-python`/`senior-jsts` are conditionally loaded lenses for matching artifacts; their creation remains outside scope.

Modes `fast|deep|follow_up` are selected externally. Specialized subagents and 2×2 model/prompt ensembles remain `[Э]`. До WS-04 стабилизируется только нейтральный transport contract; конкретная policy выбирается после дешёвого pre-registered differential eval на существующих regressions + synthetic mutations/clean negatives. Eval defines atomic finding, adjudication, semantic matching, privacy boundary, exact prompt/model/runtime, repetitions, recall/precision/FP/time/tokens и заранее заданное non-inferiority/go-no-go rule. Недостаточный корпус не превращает гипотезу автоматически в «отклонено»: допустим обратимый default с явным rollback signal. Results become a review ADR; no foreign benchmark number is acceptance.

### WS-04 — review orchestration policy

Owns two hot vendor-diverse reviewer sessions, first-review cleanliness, redispatch on each exact SHA, payload integrity, brief TUI summary by severity, remediation Dispatch, QC mutex/isolation and review-loop settlement. It imports the portable core instead of duplicating “what to review”.

Numeric round caps remain forbidden by current §B-REVIEW-03/§B-CONTROL-03. Принятое решение: lifecycle settle требует два независимых `PASS`; оставшиеся P3 не блокируют. Все P3 всё равно передаются исполнителю и должны быть исправлены либо явно отклонены с причиной, но их обработка не запускает отдельный review-round. Final same-SHA gate выполняется один раз в общем завершении задачи.

### WS-05 — Orca readiness and capability truth

Meta-O preflight verifies exact model/provider/effort, wrapper/posture owned by `mo-setup`, and actual harness process before trusting lifecycle messages. Skills never append posture flags. Capability is bound to Dispatch/turn/process, validated on every event and revoked on exit/replacement.

Orca/public companion work is specified separately from Meta-O policy: capability-negotiated event envelope (без version matrix в Meta-O), truthful start, byte-safe dispatch, settled response, typed quota/refusal/reconnect/compaction, durable wait/wakeup/ack, resource effects, role ownership and coordinator takeover. Для каждой effectful operation задаются stable operation id, idempotency semantics и authoritative confirmation surface; при невозможности подтвердить эффект — typed `unknown_effect`, никакого автоматического повтора. For every upstream gap: reproduction + issue; then upstream fix or qualifying public workaround. Terminal read may only be the already-authorized bounded public fallback in `backend-contract.md`; it cannot override §A-RESPONSE-01 or become private transcript transport.

### WS-06 — Orca supervision, sessions and recovery

Owns wall-clock cadence, baseline seeding, wakeup without user ping, hot-role names, bounded checking/E2E actors, no peer contamination, replacement bookkeeping, idempotent cleanup, direct-user-input authority, question channel, work-package/slice/gate semantics, outcome truthfulness and safe authority envelope.

Recovery ladder uses typed state first, then account-level public status, then authorized bounded terminal projection. Receipt never equals effect; own operations are confirmed on another public surface. Arbitrary nested Docker/filesystem/network effects are not claimed observable under unsandboxed posture; prevention relies on exact task authority, targeted preflight and fail-closed unknown. Unnamed human tabs are never closed.

### WS-07 — knowledge integrity

Symbol-level purpose links use mature language lint/config when possible; `.mjs` may use ESLint/JSDoc with project pattern. Unsupported `.sh` depth receives an explicit owned decision and review obligation rather than a custom parser without proof.

Anchor shipping decision is a change to §A-MEMORY-01, not a competing new owner in distribution. Either implement deterministic source-only anchor stripping with byte proof, or explicitly reject it in that same ADR.

Historical ID guarantee begins at an explicitly adopted cutoff commit recorded in §A-MEMORY-01 and consumed by `knowledge-chain.test.mjs`. The checker uses rename-aware/full-history traversal after cutoff, handles merge DAGs, and is proven green on current history before activation. Removal/reuse after cutoff requires an explicit commit trailer and fails closed. Merge-base diff remains a cheaper per-branch guard, not the whole historical guarantee.

### WS-08 — watchdog

First add deterministic patterns for model capacity, quota/reset time, reconnect and known failure states, plus correct `queued` versus delivered semantics and baseline/cadence behavior. Any change to projection/dedup semantics updates §A-WATCHDOG-01 explicitly.

Local model remains an experiment: exact installed model, network disabled, fixed corpus, false-positive/false-negative/latency/resource thresholds and fail-safe fallback. Adopt/reject result becomes §A-WATCHDOG-02. The local model never interprets private transcript or replaces deterministic high-severity patterns.

### WS-09 — closure and migration

Umbrella inventory and source blob are temporary program artifacts. This spec owns the one-time AST verifier, atomic acceptance mapping, duplicate evidence rules, transition of the existing test that currently requires non-empty backlog, and final deletion of raw backlog/umbrella artifacts. It must not create a permanent new registry.

Final proof: empty `## Открыто`; removed real-runs ledger; all acceptance links resolve; all normal/live gates passed on one full SHA; two vendor-diverse PASS on that SHA; no unqualified temporary workaround; repository scan finds no `mo-reuse`, Herdr/Paseo return, workflow engine/state store or orphaned program artifact. Сам `docs/backlog.md`, его schema/gate и backlog review lens остаются: будущий реальный deferral снова записывается туда. Live-run mismatch обязан стать новой полной backlog-записью либо upstream issue + capability-boundary row; канал обратной связи не удаляется.

## Сквозное требование: skill evals

[Р] Отдельная крупная eval-подсистема или десятая спецификация не создаётся. Каждая предметная spec владеет representative eval cases изменяемого skill; небольшой общий формат/runner допустим только если reuse research покажет, что зрелая конфигурация действительно уменьшает дублирование.

- `mo-orchestrate-orca`: eval на локальном Qwen через OpenCode критичен и входит в acceptance. Он проверяет trigger, соблюдение управляющей роли, wait/cadence, delivery, recovery, authority, отсутствие преждевременного `final` и representative real-runs regressions. До прохождения профиля Qwen не заявляется поддерживаемой моделью оркестратора.
- Остальные skills: eval желателен; выполняются 2–3 ограниченных прогона representative positive/negative/degraded cases перед их принятием. Отсутствие бесконечной калибровки — часть контракта: найденный устойчивый gap превращается в case/правку, после bounded rerun работа завершается обычным инженерным суждением.
- Qwen — одновременно дешёвый high-volume model-under-test и кандидат на реальное orchestration. Он не судит собственный semantic output: сначала deterministic/executable oracles, спорные результаты — frontier/human review.
- DeepSeek 4 Flash — optional comparator после фактического подключения к OpenCode; его отсутствие ничего не блокирует.
- `make mo-qc` остаётся offline и deterministic. Живые model evals запускаются на GPU development machine отдельной командой и отражаются как E2E evidence для exact full SHA.
- Фиксируются effective model id, quantization, OpenCode profile, context/sampling/tool permissions и число повторов текущего прогона, но не поддерживается вечная version matrix. Secrets, абсолютные machine paths, веса и полные transcripts не коммитятся.
- Заявленные ~115 tokens/s — основание считать bounded repetitions дешёвыми, но не доказательство качества.

## Critical path четырёх спецификаций

Первая волна: spec 1 целиком, readiness slice spec 3 и knowledge foundations spec 4 могут идти параллельно. Затем spec 3 доказывает Orca capability/supervision/watchdog и критический Qwen orchestration profile; spec 2 интегрирует стабильные portable contracts в lifecycle и review settlement. Независимые части spec 2 и spec 4 можно готовить раньше, но spec 4 закрывает программу последней на deletion SHA.

Каждая из четырёх spec — отдельный independently reviewable feature SHA. Девять workstreams — это coverage/commit slices внутри них, а не девять spec-файлов. Upstream Orca code changes, public issues, tool installation/auth, model choice and destructive/live environments remain explicit authority boundaries.

## Required E2E families

- fabricated `worker_done` from bare shell is rejected before lifecycle trust;
- early message wakes a persistent wait; quiet deadline makes one checkpoint, not a poll loop;
- quota/reconnect/refusal ladder reaches typed or account reset data without private transcript;
- dispatch body containing backticks, `$()`, quotes, Unicode and long Markdown arrives byte-identically;
- same hot reviewers inspect sequential SHA without implementation contamination;
- full QC serializes across workers and leaves no background child;
- replacement leaves one named session per role and never touches unnamed human tabs;
- receipt/effect divergence is detected for create/send/close/release;
- mandatory incomplete phase cannot report succeeded;
- review zero-findings, causality and evidence gates work;
- `find-reuse` auth/tool gaps produce instructions, degraded coverage and `unknown` when required.

## Decisions explicitly rejected

- Herdr/Paseo support;
- monolithic mega-spec or one spec per incident;
- confidence threshold as proof;
- mandatory four/five reviewers or forced subagents before eval;
- automatic install/login/provider fallback;
- GitHub-only review core;
- private transcript as response source;
- upstream issue alone as closure;
- full-history gate over pre-policy history without cutoff;
- separate permanent raw-ledger archive/closure manifest;
- literal numeric review stop rule without business-layer change.

## Remaining user decision

Открытых product-layer решений на этом этапе нет: пользователь принял трактовку «оба независимых PASS; P3 передаются исполнителю, но не запускают отдельный review-round» и зафиксировал локальную orchestration как бизнес-цель экономии подписочных токенов.
