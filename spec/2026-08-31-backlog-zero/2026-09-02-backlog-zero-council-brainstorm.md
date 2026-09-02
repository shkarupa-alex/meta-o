# Программа обнуления текущего backlog Meta-O

Статус: implementation-ready council synthesis; broad review ceiling исчерпан без convergence, bounded findings двух судей включены.

Эта программа состоит из четырёх самостоятельно реализуемых спецификаций. Девять аналитических workstreams из council synthesis сохранены как coverage slices внутри них, а не превращены в девять документов.

## Файлы программы

- [Spec 1 — Portable evidence skills](spec-01-portable-evidence-skills.md)
- [Spec 2 — Feature lifecycle and review settlement](spec-02-feature-lifecycle-review.md)
- [Spec 3 — Orca reliability and local-model orchestration](spec-03-orca-local-orchestration.md)
- [Spec 4 — Knowledge integrity and backlog closure](spec-04-knowledge-backlog-closure.md)
- [Полный inventory 736 frozen Markdown nodes](coverage-inventory.md)
- `spec-review.md` и judge artifacts — diagnostic history, не normative implementation input.

## 1. Общая цель и границы

После выполнения всех четырёх спецификаций:

- `docs/backlog.md` сохраняет schema и пустой `## Открыто`;
- `docs/backlog-issues-real-runs.md` удалён после переноса каждого уникального инцидента в durable requirement и executable proof;
- `docs/research/review-deep-research-{1,2,3}.md` использованы как исследовательский input, но не становятся нормативным слоем;
- каждый applicable пункт исходного backlog закрыт реализацией, `architecture-rejected` решением с явной сокращённой support boundary либо доказанным upstream fix/public workaround;
- один full Git SHA проходит `make mo-qc`, два vendor-diverse review и applicable E2E;
- Herdr/Paseo не возвращаются; поддерживается только Orca;
- `senior-python` и `senior-jsts` считаются существующим пользовательским input, их создание не входит в программу.

Следующие identities описывают исходный Orca-only snapshot, но ещё не являются program input gate:

- program base commit: `41a4898974a6a08eb415cb07ba849575c5964b61`;
- `docs/backlog.md` blob: `8d11d1107eb5875235c2830e6503f7e1265317d7`;
- `docs/backlog-issues-real-runs.md` blob: `c75859372fa7d794269cc6dcc8834c069ddd8096`;
- последний commit с Herdr/Paseo: `2eb85bebe14aa35419db192db66938e14e0be6f1`.

### Program input readiness

Ни одна из четырёх specs не начинает substantive implementation, пока отдельный readiness commit на актуальном `develop` не содержит:

- Orca-only изменение, даже если оно было перенесено merge/cherry-pick и получило новый commit id;
- уже созданные пользователем `src/skills/senior-python/` и `src/skills/senior-jsts/`, их generated outputs и регистрацию в build/install/README contract;
- три `docs/research/review-deep-research-*.md` как ненормативные tracked inputs;
- оба исходных backlog blobs без переписывания содержимого.

После этого в program overview фиксируются `program_input_sha` и blob ids всех пяти обязательных документов плюс tree ids обоих senior skills. `program_input_sha` обязан быть ancestor каждой implementation branch и доступен из `develop`; provisional `41a4898...` не используется как historical cutoff. Missing/untracked/unreachable input даёт `input_not_reproducible` и блокирует начало, не создавая пятую spec.

## 2. Четыре спецификации и зависимости

| Spec | Название | Workstreams | Зависимости |
| --- | --- | --- | --- |
| 1 | Portable evidence skills | WS-01 `find-reuse`, portable WS-03 review core, bounded eval contract | нет |
| 2 | Feature lifecycle and review settlement | WS-02 lifecycle, WS-04 review orchestration, integration WS-03 | стабильные contracts spec 1; milestone 3A |
| 3 | Orca reliability and local-model orchestration | WS-05 capability truth, WS-06 supervision/recovery, WS-08 watchdog | 3A не зависит от spec 2; milestone 3B зависит от spec 2 |
| 4 | Knowledge integrity and backlog closure | WS-07 knowledge, WS-09 closure/migration | закрытые specs 1–3 для final deletion proof |

Односторонний critical path: input readiness → параллельно spec 1, milestone 3A и knowledge foundation spec 4 → spec 2 → milestone 3B → spec 4 closure. `3A` выпускает только native readiness/capability proofs; `3B` использует уже готовый lifecycle для recovery/Qwen/full E2E. Так четыре документа сохраняются без dependency cycle.

### Reviewable increments

| Increment | Owner/output | Required input | Deterministic proof | Live proof | Depends on |
| --- | --- | --- | --- | --- | --- |
| R0 | reproducible `program_input_sha` | user inputs + Orca-only history | ancestry/blob/tree check | — | — |
| S1.1 | rename/register three input skills | R0 | build/install/portability tests | bounded trigger cases | R0 |
| S1.2 | exact reuse adapters and merge/rank | S1.1 | adapter fixtures | `make mo-live-adapters` | S1.1 |
| S1.3 | portable review core | research + S1.1 | schema/severity/mode fixtures | bounded skill evals | S1.1 |
| S3A | model config + readiness | R0 | config/readiness fixtures | exact OpenCode launch | R0 |
| S2.1 | lifecycle artifacts + external reuse consumer/redaction | S1 | contract/secret fixtures | one lifecycle slice | S1, S3A |
| S2.2 | hot remediation + fresh final review pair | S2.1 | settlement/SHA fixtures | vendor-diverse pair | S2.1 |
| S3B.1 | Orca state/recovery contract | S2 | fake-Orca incidents | selected gap smoke | S2, S3A |
| S3B.2 | watchdog + local orchestrator profile | S3B.1 | classifier/critical fake suite | Qwen representative feature | S3B.1 |
| S4.1 | JSDoc purpose + positional anchors | R0 | lint/build fixtures | — | R0 |
| S4.2 | per-parent historical IDs | S4.1 | synthetic/full-history tests | — | S4.1 |
| S4.3 | lossless migration and deletion | S1–S3, S4.2 | closure/provenance/QC | E2E + fresh final pair | all |

## 3. Общий change protocol

Каждая spec реализуется отдельной feature branch и отдельным independently reviewable feature SHA.

Первый implementation commit каждой ветки:

1. материализует утверждённую spec и дословный user ledger;
2. добавляет короткий outcome checklist без повторения нюансов spec;
3. переносит новые устойчивые business intents в `docs/business.md` пропорционально реальному изменению;
4. добавляет или уточняет architecture decision, если меняется ownership или принятое поведение.

Исполнитель отмечает checklist по мере работы. Spec и checklist удаляются только после полного proof, переноса durable knowledge и явного решения пользователя о готовности к merge. Их удаление создаёт новый SHA, поэтому общий final gate выполняется на deletion SHA.

Устойчивое повторение «такое поведение хорошее/плохое» проверяется при каждом increment:

- если ожидание уже покрыто, spec и proof ссылаются на существующий `§B-*`;
- если это новое устойчивое ожидание, оно становится компактным `§B-*`;
- если пользователь явно изменил смысл, обновляется верхний слой и зависимые решения, а старый текст не маскируется тихой правкой ledger.

## 4. Общий eval contract

Отдельная eval-платформа и отдельная пятая spec не создаются. Каждая spec владеет representative cases назначенных ей skills, даже если конкретный skill в этой программе менялся только интеграционно.

- Для `mo-orchestrate-orca` профиль Qwen 3.8 27B UD-Q4-KM через OpenCode критичен: пока он не проходит acceptance, локальная orchestration не считается поддерживаемой.
- Для остальных skills выполняются 2–3 bounded прогона positive, negative и degraded cases. Они advisory, кроме executable safety/contract failures.
- Сначала применяются deterministic/executable oracles; Qwen не оценивает собственный semantic output. Спорные semantic results проверяет vendor-diverse frontier reviewer либо человек.
- DeepSeek 4 Flash — optional comparator после реального подключения к OpenCode; его отсутствие ничего не блокирует.
- `make mo-qc` остаётся offline и deterministic. Живые model runs выполняются отдельной documented командой на GPU machine.
- Evidence фиксирует candidate SHA, skill revision, effective model id, quantization, OpenCode profile/version, context/sampling, tool permissions, case ids, repetitions и результаты. Secrets, абсолютные machine paths, веса и полные transcripts не коммитятся.
- Устойчивый gap становится regression case и правкой. После bounded rerun принимается обычное инженерное решение; бесконечная калибровка запрещена.

| Installable skill | Owner | Positive / forbidden / degraded case | Policy |
| --- | --- | --- | --- |
| `find-reuse` | Spec 1 | explicit reuse request / generic package question / required source tool or auth unavailable | 2–3 advisory runs; deterministic contract failures block |
| `senior-python` | Spec 1 | substantial Python change / trivial or non-Python task / missing repository evidence or tooling | 2–3 advisory runs |
| `senior-jsts` | Spec 1 | substantial JS/TS change / trivial or non-JS/TS task / runtime/config mismatch | 2–3 advisory runs |
| `mo-review-orca` | Spec 2 | explicit Meta-O review / generic review request / one reviewer unavailable or SHA mismatch | 2–3 advisory runs; authority/SHA failures block |
| `mo-setup` | Spec 3A | explicit Meta-O setup / generic environment question / missing control or companion/auth | 2–3 advisory runs; unsafe mutation blocks |
| `mo-watchdog` | Spec 3B | explicit observe/nudge / generic monitoring / malformed or stale native state | 2–3 advisory runs; deterministic nudge safety blocks |
| `mo-e2e` | Spec 3B | explicit applicable live proof / documentation-only non-applicable change / missing frozen SHA or environment | 2–3 advisory runs; false success blocks |
| `mo-orchestrate-orca` | Spec 3B | explicit feature lifecycle / answer-only or standalone review / quota, reconnect, compaction and lost coordinator | critical suite, §3.9 |

## 5. Decision ledger

### Adopted

| Decision | Rationale | Source |
| --- | --- | --- |
| Council spec review выполняют GPT-5.6 Sol/high и Claude Opus 1M/high | это явно выбранные и health-checked judges | judges |
| Четыре specs, девять internal workstreams | сохраняет coverage без бюрократии | four-spec-packaging; synthesis |
| Только Orca | пользователь прекратил поддержку Herdr/Paseo | backend-scope |
| `find-reuse` portable, invocation/destination external | reusable skill не должен знать Meta-O methodology | find-reuse |
| Existing `senior-python`/`senior-jsts` — input | создание уже выполнено пользователем | senior-skills |
| Текущий backlog закрывается losslessly до пустого | удаление без proof скрывает работу | backlog-goal |
| Durable good/bad behavior становится business requirements | будущие review не должны повторять интервью | durable-behavior-intent |
| Qwen/OpenCode orchestration — business capability | monitoring turns не должны расходовать subscription tokens | local-qwen-business-intent |
| Evals всех skills embedded и bounded | нужны representative proofs без большой eval subsystem | all-skill-evals; bounded-skill-evals |
| Orchestrator eval critical, остальные desirable | соответствует стоимости/риску ролей | bounded-skill-evals |
| Все P3 доходят executor; нет отдельного P3-round | не терять findings и не плодить бессмысленный loop | review-p3-policy |
| Два final `PASS` на одном SHA | действующий proof contract | §B-PROOF-02/03, §B-REVIEW-03 |
| Upstream issue — provenance, не closure | issue не доказывает работающий результат | council synthesis |
| Temporary AST bijection, no permanent registry | даёт lossless migration без нового state layer | council synthesis/premortem |
| `fast`, `deep`, `follow_up` — profiles одного evidence contract | mode не ослабляет causality, severity, evidence или same-SHA proof | spec-review-R1 |
| Initial lifecycle review — `deep`, remediation — `follow_up`, `fast` — advisory/explicit standalone | превращает enum в проверяемую Meta-O orchestration policy | spec-review-R1; review research |
| P0–P3 определены в portable core отдельно от confidence | все consumers должны одинаково понимать severity, а confidence не заменяет evidence | spec-review-R1; senior skills |
| TUI summary — точная проекция authoritative `worker_done`, связанная через `Review-Execution` | пользователь видит краткий результат без второго источника истины | spec-review-R1; real-runs TUI incident |
| Fresh native auth и stale Orca account cache разрешаются freshness check и exact live launch | cached `missing-credentials` не доказывает отсутствующую авторизацию | real-runs 2026-08-24 line 22; spec-review-R1 |
| Closure использует semantic inventory плюс executable AST node bijection | headings недостаточно: unheaded incidents и distinct evidence должны иметь собственные locators | spec-review-R2; backlog-goal |
| Evidence, duplicates, positive controls и superseded workarounds сохраняются как node roles, а не dispositions | контекст не теряется, но не превращается в отдельный backlog или постоянный state | spec-review-R2; project contract |
| Implementation начинается только с воспроизводимого `program_input_sha` | untracked senior skills/research и provisional branch SHA нельзя выдавать за reviewable baseline | spec-review-R3 |
| `find-reuse` — read-only producer, а Meta-O consumer и secret redaction живут в lifecycle | переносимость требует вынести destination/write policy наружу без потери старой safety обязанности | spec-review-R2/R3 |
| Model routing использует `mo-models.mjs`/schema 1 и отдельную роль `orchestrator` | один реальный configuration authority, typed failure без fallback | spec-review-R3 |
| Hot sessions применяются для remediation, fresh sessions — для final pair | сохраняет контекст исправлений и независимость итогового proof | spec-review-R3 |
| Severity остаётся текстовой; обязательных counters/adjudication grammar нет | portable evidence не превращается в хрупкий machine verdict protocol | user intent; spec-review-R3 |
| Per-slice budget `M ≤ 5` не сбрасывается remediation; final settlement cap отсутствует | сохраняет сырой real-run contract и two-PASS gate одновременно | real-runs; spec-review-R3 |
| Spec 3 разделена на 3A readiness и 3B lifecycle | устраняет цикл со spec 2 без пятой спеки | spec-review-R3 |
| Source-only anchors — отдельные positional HTML markers | точное byte-safe удаление возможно без изменения обычного текста | spec-review-R3 |
| Historical IDs проверяются на каждом parent edge полного DAG | merge/rename/revert не должны скрывать deletion/reuse | spec-review-R3 |
| Closure proof двухфазный и остаётся проверяемым после удаления temporary map | финальный SHA не может ссылаться только на исчезнувшее доказательство | spec-review-R3 |
| Все восемь installable skills имеют owner и bounded eval cases | пользователь просил evals для всех skills, не только изменённых | all-skill-evals; spec-review-R3 |

### Rejected or deferred

| Decision | Status | Rationale | Source |
| --- | --- | --- | --- |
| Девять самостоятельных spec documents | rejected | overhead больше изменяемых skills | user feedback |
| Новая отдельная eval spec/platform | rejected | требование встраивается в предметные specs | user feedback |
| 2×2 review ensemble и forced subagents | deferred | нужна differential eval evidence | research/council |
| Глобальный numeric settlement cap | rejected | расходится с state-based final settlement; отдельный per-slice budget остаётся | business hierarchy |
| Meta-O Orca proxy | rejected | skills-first и native CLI contract | §A-ORCHESTRATION-01 |
| Permanent backlog closure manifest | rejected | нет постоянного consumer/value | project contract |
| Heading-only closure inventory | rejected | теряет unheaded bullets и distinct evidence внутри многосоставных sections | spec-review-R2 |
| Herdr/Paseo compatibility | rejected | явное scope decision | backend-scope |

## 6. Program risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Укрупнение specs теряет incident | semantic inventory + AST node bijection + raw proposals/reviews/premortem as review input |
| Portable skill снова протекает Meta-O vocabulary | portability scan + external consumer contract |
| Exact command в adapter устаревает | executable fixture/live probe + `last_verified`, failure → `unknown` |
| Qwen проходит happy path, но ломает authority | fake-Orca regressions + three consecutive invariant-clean runs + one live E2E |
| Upstream Orca gap маскируется workaround | capability boundary, issue + proven public workaround only |
| P3 fix invalidates reviewed SHA | один общий final same-SHA gate после всех изменений |
| Knowledge-history gate ломается на старой истории | explicit cutoff + prove green before activation |
| Closure artifacts становятся вечным registry | temporary consumer and required deletion in final DoD |
| Heading-level map скрывает несколько разных incidents или wishes | каждый AST node получает role, obligation id и proof; range-loss fixture запрещает поглощение children |
| Дубликаты удаляются вместе с контекстом повторного инцидента | один canonical obligation, но distinct `duplicate-evidence` locator/digest для каждого повторения |
| `fast` или `follow_up` превращается в способ сократить обязательное proof | общий evidence/severity contract, initial `deep`, in-place escalation и mode fixtures |
| TUI и Orca снова показывают разные verdicts | TUI только diagnostic projection, authoritative settled response остаётся полным |
| Stale Orca account cache ошибочно вызывает re-login или model fallback | timestamp freshness, provider-native auth и один exact approved live launch probe |

## 7. Program open questions

Нет unresolved user decisions, способных изменить четыре architecture tracks. Implementation может уточнять command syntax и fixture mechanics в пределах заданных contracts; изменение ownership, authority или business meaning возвращается пользователю.
