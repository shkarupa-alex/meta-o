# Spec 4 — Knowledge integrity and backlog closure

Статус: implementation-ready. Обязательный общий contract, зависимости, eval matrix и decision ledger находятся в [program overview](2026-09-02-backlog-zero-council-brainstorm.md). Эта spec не может ослаблять общий contract.

## 4.1. Outcome

Закрыть три knowledge-chain deferral и доказуемо удалить текущий backlog/real-runs program material без создания вечного closure registry.

## 4.2. Symbol-level purpose

Для `.mjs` используется mature `eslint-plugin-jsdoc`:

- существующий `jsdoc/require-jsdoc` остаётся baseline; delta включает `jsdoc/match-description` с паттерном `(?:^|\\s)§A-[A-Z][A-Z0-9-]*-[0-9]{2}(?=$|[\\s.,;:)])`;
- named/default exported function и class declarations, а также уже подпадающие под `publicOnly` symbols требуют JSDoc;
- description объясняет purpose и содержит применимый `§A-*` identifier; существующие подходящие public symbols мигрируют в том же increment;
- trivial/private callback helpers исключаются через явную project config, не ad-hoc suppressions;
- config и violation fixtures входят в `make mo-lint`.

Для `.sh` нет зрелого выбранного parser/linter, способного надёжно требовать semantic purpose link у functions. Architecture decision фиксирует границу: module-level machine gate + обязательная symbol-level review для substantive shell functions. Это явное принятое ограничение, а не незакрытый backlog item. Собственный regex/parser не создаётся.

## 4.3. Source-only anchor stripping

§A-MEMORY-01 обновляется: source skills могут использовать architecture anchors, generated skills не содержат их. Единственный специальный source syntax — standalone HTML marker `<!-- mo:source-anchor §A-FOO-01 -->`; обычные упоминания `§A-*` остаются текстом.

`tools/build-skills.mjs` использует positional Markdown parser (`mdast-util-from-markdown`) и удаляет exact source byte spans marker nodes справа налево, без serialize всего документа. Допустимо удалить только один прилегающий ASCII space на той же строке. Marker внутри fenced/inline code, link destination, plain prose либо malformed marker fail-closed.

Build test reparses source и result, удаляет только marker HTML nodes из expected AST и сравнивает semantic AST; отдельно доказывает byte identity всех остальных spans. Gate переносится на source validity + generated absence. Regex и parser без source positions запрещены.

## 4.4. Historical knowledge identifiers

Cutoff — зафиксированный после Program input readiness `program_input_sha`, записанный в §A-MEMORY-01 и потребляемый `tests/knowledge-chain.test.mjs`; provisional Orca-only SHA не является cutoff.

Checker:

1. перечисляет commits через `git rev-list --topo-order --reverse --parents <cutoff>..HEAD` и анализирует каждое commit-parent edge полного DAG;
2. читает historical blobs через Git object interface, не checkout mutation;
3. парсит Markdown real AST;
4. строит историю `§B-*`/`§A-*` id, path, heading text и commit;
5. ловит silent deletion, duplicate/reuse и broken forward/back references;
6. для merge объединяет parent histories, но deletion/reuse на любом parent edge требует явной авторизации; rename не особый случай, потому что id глобальны, revert/cherry-pick обрабатываются обычной DAG семантикой;
7. shallow/unreachable cutoff даёт `history_unavailable`, а merge-base diff остаётся только дешёвым branch guard.

После cutoff intentional removal/reuse требует commit trailer:

```text
Knowledge-ID-Change: remove <id> via <§A-ID>
Knowledge-ID-Change: reuse <id> via <§A-ID>
```

Trailer не является самоавторизацией: он разрешает изменение только если указанный architecture decision в том же commit фиксирует id, причину и новую семантику/границу, а все references обновлены. Без этого checker fail-closed. Тест сначала доказывается green на реальной истории cutoff→current HEAD, затем включается в `mo-qc`.

## 4.5. Temporary lossless closure map

Source of truth — два Git blobs, указанные в общей части. Closure использует два связанных уровня:

1. Appendix A этой программы немедленно фиксирует semantic inventory: каждый backlog item, каждый самостоятельный unheaded incident/wish и каждый именованный real-runs incident family получает owner и proof family.
2. Во временной spec 4 создаётся исчерпывающая AST node map, которая связывает каждый исходный paragraph/list item с semantic obligation или с его distinct evidence/context. Она не позволяет спрятать пропущенный узел внутри широкого heading range.

Для `docs/backlog.md` source set — каждый непустой block node от первого `## Открыто` до EOF, включая последующие sibling `##`; для `docs/backlog-issues-real-runs.md` — каждый непустой block node после document H1 до EOF. Корневой H1 считается identity документа и в closure rows не входит. Никакой более узкий heading range не допустим.

Во временной spec 4 размещается таблица:

```text
source locator | source digest | node role | obligation id |
owner spec/workstream | disposition | durable obligation | proof id
```

`node role` принимает только:

```text
obligation
evidence
duplicate-evidence
positive-control
superseded-workaround
context
```

Правила:

- `obligation` формулирует самостоятельный incident, wish или требование.
- `evidence` сохраняет отдельный reproduction, consequence или root-cause observation и ссылается на ровно один `obligation id`.
- `duplicate-evidence` не исчезает при объединении: он имеет собственный locator/digest и canonical `obligation id`.
- `positive-control` сохраняет успешный контрольный опыт и связывает его с проверяемым invariant.
- `superseded-workaround` сохраняет исторический workaround и proof того, каким итоговым contract он заменён.
- `context` сохраняет дату, диалоговую рамку или иной несамостоятельный узел и ссылается на конкретный obligation; он не закрывает работу.
- Ни одна роль не является disposition закрытия. Каждый node всё равно должен вести к durable obligation и executable proof либо к принятому architecture rejection.
- Один широкий heading или line range не считается lossless map row для содержащихся в нём разных AST nodes.

`source locator` вычисляется из `blob id + path + heading ancestry + preorder block ordinal`. Digest — SHA-256 от `nodeType + NUL + original source span`, где только CRLF нормализуется в LF; whitespace больше не схлопывается. Line locators в Appendix A — human-readable index к frozen blob; executable map пересчитывает их в AST locators и не использует номера строк как identity.

Inventory включает каждый самостоятельный heading, paragraph и list item после `## Открыто`, включая девять sibling `##` sections, unheaded bullets первого real-runs section и дубли later runs.

`tests/backlog-closure.test.mjs` является временным consumer карты и доказывает биекцию:

```text
каждый source node → ровно одна map row
каждая map row → существующий source node
каждый obligation → owner + durable obligation + proof id
каждый evidence/context node → ровно один obligation id
каждый adopted obligation → executable proof
каждый duplicate → canonical obligation + distinct evidence locator
каждый superseded workaround → replacement contract + proof
ни один heading range не поглощает немаппированные дочерние nodes
```

Фиксированное ожидаемое число nodes запрещено: parser сравнивает полное множество. Во время программы map обновляется вместе с increment. Closure проходит в две фазы:

1. `closure_sha` ещё содержит полную map и test, реализованные specs и все применимые proofs;
2. final deletion commit удаляет raw ledgers и temporary program artifacts, а `docs/acceptance.md` сохраняет source blob ids, `closure_sha`, closure-map blob id и proof command.

Постоянный `tests/backlog-provenance.test.mjs` потребляет эту acceptance row и проверяет, что `closure_sha` — ancestor HEAD, map blob достижим через Git object interface, а deletion delta содержит только разрешённые ledger/spec/map removals и acceptance/schema updates. Это named proof consumer, не новый workflow state registry.

## 4.6. Dispositions

Разрешены:

```text
implemented
merged-duplicate
architecture-rejected
upstream-fixed
public-workaround-proven
```

`reported-upstream`, `documented`, `not-reproduced` и `not-blocking` не закрывают row сами по себе. `merged-duplicate` сохраняет собственный evidence locator и указывает canonical owner. `architecture-rejected` требует owner ADR/business rationale и acceptance proof выбранной границы.

## 4.7. Final migration

После specs 1–3:

1. выполнить closure bijection на source blobs и зафиксировать `closure_sha`;
2. перенести устойчивые business/architecture/papercut знания;
3. сохранить уже добавленные raw review studies как tracked ненормативный archive в `docs/research/`, не превращая их в requirements;
4. удалить `docs/backlog-issues-real-runs.md`;
5. оставить в `docs/backlog.md` заголовок/schema и пустой `## Открыто`;
6. изменить существующий test, который требует non-empty backlog, на schema/future-entry validation;
7. удалить temporary closure map/test/program specs после фиксации их Git blobs; permanent provenance test остаётся;
8. выполнить final proof свежей парой reviewers на deletion SHA: scope включает весь feature intent и узкий deletion delta, а не только удалённые файлы.

Future real deferral снова записывается обычной полной backlog entry с причиной, impact и next step. Live mismatch во время closure становится новой полной entry либо upstream issue + capability-boundary row; канал обратной связи не удаляется.

## 4.8. Final machine-checkable Definition of Done

На одном full SHA:

- `docs/backlog.md` содержит zero substantive AST nodes под `## Открыто`;
- `docs/backlog-issues-real-runs.md` и temporary closure artifacts отсутствуют;
- `docs/acceptance.md` указывает достижимые source blobs, `closure_sha`, closure-map blob и proof command; permanent provenance test проходит;
- semantic inventory Appendix A и executable AST map покрывают unheaded bullets, headings, paragraphs, list items, duplicates, positive controls и superseded workarounds;
- ни один source node не закрыт только принадлежностью к широкому heading range;
- все links/knowledge ids разрешимы;
- historical-id, source-anchor, generated-anchor и symbol-purpose gates проходят;
- `make mo-qc` проходит без mutation;
- все required live E2E specs 1–3 прошли на этом SHA либо имеют допустимый documentation carry-forward;
- два fresh vendor-diverse reviewers дали `PASS` на этом SHA;
- review acceptance доказывает stage order, portable textual P0–P3 semantics, mode escalation и диагностическую TUI/report projection;
- Orca acceptance содержит отдельный proof для stale account cache после свежего provider-native auth;
- scan не находит `mo-reuse`, Herdr/Paseo support, private transcript transport, workflow engine/general state store или orphaned program artifact;
- acceptance map содержит program provenance и реальные obligation-level proof commands/artifacts;
- никакой row не закрыт только upstream issue или временным непроверенным workaround.

Spec 4 также переименовывает постоянный reviewer `Backlog lens` в `Deferral lens`: пустой backlog остаётся валидным, а review ищет новые реальные deferrals в diff/поведении. Обновляются `shared/references/review-protocol.md`, orchestration contract tests и соответствующие строки `docs/acceptance.md`.

## 4.9. Acceptance и evals

- AST fixtures: nested headings, sibling `##`, paragraphs, lists, duplicate text, reordered nodes, malformed map;
- node-role fixtures: unheaded obligation, evidence, duplicate-evidence, positive-control, superseded-workaround и запрещённый orphan context;
- range-loss fixture доказывает, что heading-level row не поглощает немаппированные child nodes;
- Git-history fixtures: rename, merge DAG, silent deletion, semantic reuse, valid/invalid trailer;
- build fixtures: anchor removal only, punctuation/Unicode/inline code, malformed anchor;
- ESLint/JSDoc fixtures для exported symbols;
- end-to-end closure test на frozen source blobs до deletion;
- Qwen runs для skill changes в spec 4 не обязательны, если изменяются только deterministic tooling/docs; если меняется instruction-bearing skill, применяются 2–3 bounded cases общего contract.

## 4.10. Rejected/deferred

- Permanent closure manifest/receipt/baseline отклонён.
- Regex Markdown parsing отклонён.
- Silent deletion сырого ledger без bijection отклонён.
- Heading-only inventory как замена node-level bijection отклонён.
- Самостоятельный custom shell parser отклонён без доказательства отсутствия mature tool/config.
- Upstream issue как самостоятельное закрытие дефекта отклонён.

## 4.11. Open questions

Нет. Уже добавленный raw research остаётся tracked ненормативным archive в `docs/research/`; изменение его расположения не меняет normative design.

## Appendix A — Current-source coverage map

Appendix является semantic inventory, а не заменой executable AST bijection из spec 4.

Locator `RR:L<n>` указывает строку frozen blob `c75859372fa7d794269cc6dcc8834c069ddd8096`. Диапазон у именованного incident family сохраняет human-readable группировку, но каждый Markdown node внутри диапазона получает отдельную строку во временной AST map. Повторные incident families сохраняются отдельными evidence locators, даже если ведут к одному obligation.

### `docs/backlog.md`

| Source entry | Owner | Closure proof |
| --- | --- | --- |
| Watchdog с локальной моделью | Spec 3 | §3.8 experiment + §3.10 acceptance + §A-WATCHDOG-02 adopt/reject |
| Цепочка id только до модуля | Spec 4 | §4.2 ESLint/JSDoc gate + explicit shell boundary |
| Якоря не снимаются при сборке | Spec 4 | §4.3 AST transform byte/semantic fixtures |
| Удаление/переиспользование id не ловится | Spec 4 | §4.4 full-history cutoff gate |
| Реальный запуск review не прошёл | Specs 2–3 | pair/session/recovery/live E2E |
| Про ревью / ещё про ревью | Specs 1–2 | evidence-first core, defined modes/severity, deferred ensemble eval, pair settlement |
| Ссылки на findings в code comments | Specs 1–2 | purpose/reference policy fixture |
| Быстрое ревью | Spec 2 | bounded advisory executor self-review with `fast → deep` escalation |
| Review skill overtrigger | Specs 1–2 | explicit-invocation negative eval |
| Названия tabs/panels | Specs 2–3 | stable owned role titles, foreign-tab preservation |
| Verbosity reviewers | Spec 2 | full `worker_done` + formally linked brief TUI projection |
| Model capacity message | Spec 3 | deterministic watchdog pattern + recovery scenario |
| Real-runs raw ledger | Specs 2–4 | semantic inventory below + final AST bijection/deletion |

### Unheaded observations and wishes under `2026-08-24 — Marta Eval task 730873`

| Obligation | Source locator(s) | Owner | Closure proof |
| --- | --- | --- | --- |
| Native CLI syntax/version probes are authoritative and diagnostic versions do not block lifecycle | `RR:L5` | Spec 3 | command-probe fixture and exact upstream help/issue boundary |
| Large guides/context are read in bounded independent calls; truncation is not treated as complete input | `RR:L6`, `RR:L9`, `RR:L15` | Specs 2–3 | truncation fixture with separate bounded retrieval and completeness check |
| Lifecycle starts only in a verified clean `feature/*` worktree based on current `develop` | `RR:L7` | Spec 2 | branch/worktree preflight fixture |
| Auth failure in one discovery surface does not authorize credential collection or an arbitrary connector switch | `RR:L8` | Spec 2 | task-source authority fixture with typed credential boundary |
| Canonical BRIEF materialization and first tracked spec/ledger commit belong to executor | `RR:L10`, `RR:L13` | Spec 2 | first-commit ownership E2E |
| `worktree create ok` is a receipt, not proof of Git checkout/branch effect | `RR:L11`, `RR:L12` | Spec 3 | effect-confirmation fixture; ambiguous delete remains `unknown_effect` |
| Blank Orca worktree metadata requires exact Git identity verification before use | `RR:L14` | Spec 3 | same-instance/worktree plus Git metadata proof |
| Provider readiness distinguishes account projection, native auth and selected-harness launch | `RR:L16`, `RR:L17`, `RR:L20` | Spec 3 | three-surface readiness matrix |
| OpenCode auth uses probed current CLI surface; invalid `auth list` or wrapper help is not proof | `RR:L18`, `RR:L19` | Spec 3 | command/auth probe fixture |
| Role, harness, model and effort require prior user-approved configuration | `RR:L21`, `RR:L28`, `RR:L30` | Spec 3 | no-unauthorized-role/model invariant |
| Fresh Claude auth overrides only the credential inference, not the need for a real Orca launch | `RR:L22` | Spec 3 | `stale_account_cache` fixture and exact approved live launch |
| Exact model ID and requested/effective effort must match; floating alias is insufficient | `RR:L23`, `RR:L31`, `RR:L33` | Spec 3 | model catalog plus `launch.requested == launch.effective` |
| `ready/input_accepted` and terminal existence do not prove discoverable real harness/task consumption | `RR:L24`, `RR:L25` | Spec 3 | composed-start false-positive fixture |
| Bare shell cannot fabricate an accepted lifecycle completion | `RR:L26` | Spec 3 | process identity/capability-bound `worker_done` fixture |
| Readiness probes must not create six unsanctioned concurrent workers or obscure the 1 executor → 2 reviewers topology | `RR:L27`, `RR:L28` | Spec 3 | bounded one-at-a-time health probe and role-count E2E |
| `worker-stop` is not resource release; cleanup needs exact inventory confirmation | `RR:L29` | Spec 3 | stop/release/already-absent cleanup fixture |
| A blocking waiter needs a recoverable public handle or idempotent reconnect behavior | `RR:L32` | Spec 3 | `waiter_exists`/lost-client recovery fixture |
| Bundled model discovery script is an explicit preflight dependency, not hidden optional knowledge | `RR:L34`, `RR:L35` | Specs 2–3 | skill inventory/model-selection fixture |
| Orchestrator does not edit task, ledger, business or delivery artifacts | `RR:L36` | Spec 3 | Qwen role-ownership invariant |
| First actually running executor replacement receives initial `/goal`, not an ordinary follow-up | `RR:L37` | Spec 2 | failed-first-launch/replacement initial-delivery fixture |

### Named real-run incident families

| Obligation | Source locator | Node role | Owner | Closure proof |
| --- | --- | --- | --- | --- |
| Define authoritative ordinary/UI/Orca question channels and preserve both backend acceptance paths | `RR:L39-L45` | obligation + evidence | Spec 3 | ordinary and UI question/reply E2E; no silent harness-setting change |
| Detect completed idle executor before status claims and resume bounded supervision after user turns | `RR:L47-L68` | obligation + distinct evidence | Spec 3 | early wakeup, start-of-turn state check, cadence and delivery fixtures |
| Orchestrator role cannot be overwritten by an injected executor task | `RR:L69-L76` | obligation + evidence | Spec 3 | role-conflict fail-closed and Qwen ownership fixture |
| Direct user input contaminating executor requires fenced exact replacement | `RR:L77-L82` | obligation + evidence | Spec 3 | addressing/authority/replacement and idempotent cleanup fixture |
| Executor remains a real hot assigned role throughout remediation, not an empty standby TUI | `RR:L83-L89` | obligation + evidence | Specs 2–3 | 1 executor + 2 reviewer lifecycle; queued-vs-active dispatch proof |
| Stopping current review churn is distinct from completing the specification | `RR:L90-L95` | obligation + evidence | Spec 2 | settlement/completion state-transition fixture |
| Failed Codex resume with duplicate posture flags leaves no unowned visible tab | `RR:L96-L101` | obligation + evidence | Spec 3 | wrapper posture and exact failed-start cleanup fixture |
| Ready `worker_done` must wake coordinator without a user ping | `RR:L102-L108` | duplicate-evidence of wakeup obligation | Spec 3 | turn-persistent wait E2E |
| Claude quota does not leave an apparently working reviewer forever | `RR:L109-L115` | obligation + evidence | Spec 3 | typed quota/reset/same-session recovery |
| Delivery batch is processed before acknowledgment and is not acknowledged twice | `RR:L116-L120` | obligation + evidence | Spec 3 | batch/ack idempotency fixture |
| Review progress is state-based; remediation не сбрасывает максимум пяти pair review/fix attempts на substantive slice, а final settlement остаётся без глобального cap | `RR:L121-L127` | obligation + evidence | Spec 2 | per-slice budget/no-reset и separate settlement fixtures |
| Compaction is observable and forces reread of file-backed role contracts | `RR:L128-L137` | obligation + evidence | Spec 3 | typed compaction and post-compact reload fixture |
| TUI final is a diagnostic projection of authoritative `worker_done` | `RR:L138-L146` | obligation + positive control | Specs 2–3 | `Review-Execution`/`Projection` identity E2E |
| Low-level injected hot workers need terminal-level retention ownership when Dispatch retention is unavailable | `RR:L147-L152` | obligation + evidence | Spec 3 | capability-bound retention fixture |
| Defensive review refusal distinguishes `input_blocked` from `output_blocked_after_work` | `RR:L153-L161` | obligation + evidence | Specs 1–3 | typed refusal, same-attempt recovery and `UNKNOWN` settlement |
| Repeated `worker-retain dispatch_not_found` preserves every affected executor/reviewer context as distinct evidence | `RR:L162-L173` | duplicate-evidence of retention obligation | Spec 3 | repeated cross-role retention fixture |
| Durable mailbox success is distinct from coordinator wakeup/cadence | `RR:L174-L186` | obligation + positive control | Spec 3 | FIFO delivery, early wakeup, timeout and replay fixtures |
| `worker_done` is complete, byte-safe and contains no hidden `reportPath` appendix | `RR:L187-L193` | obligation + evidence | Spec 3 | `--body-file`/stdin byte-roundtrip and report-completeness fixture |
| Endless `Reconnecting…` is distinct from progress and supports bounded same-task recovery | `RR:L194-L201` | obligation + evidence | Spec 3 | typed reconnect/resume fixture |
| `dispatch-show` exact syntax is probed, documented and diagnostic on misuse | `RR:L202-L207` | obligation + evidence | Spec 3 | native command probe/upstream capability proof |
| Work packages, reviewable slices, locally implemented work and external gates remain separate | `RR:L208-L215` | obligation + evidence | Spec 3 | outcome map and gate-semantics fixture |
| Claude subscription limit is a typed per-Dispatch wait, not inferred only from TUI | `RR:L216-L223` | obligation + evidence | Spec 3 | quota/reset public-surface E2E |
| Ordinary coordinator follow-up does not use undocumented `--type normal` | `RR:L224-L229` | obligation + evidence | Spec 3 | native enum/help fixture |
| Successful follow-up receipt does not prove worker consumption | `RR:L230-L236` | obligation + evidence | Spec 3 | pending-follow-up/consumption barrier fixture |
| Full SHAs are copied and verified, never reconstructed from memory | `RR:L237-L243` | obligation + evidence | Specs 2–3 | `git cat-file`/range verification fixture |
| Reviewer cannot background or overlap full QC | `RR:L244-L251` | obligation + evidence | Spec 2 | foreground completion and QC isolation fixture |
| Output filtering after completed review work becomes typed lifecycle state | `RR:L252-L258` | duplicate-evidence of refusal obligation | Spec 3 | `output_blocked_after_work` fixture |
| Reap test/process cleanup must remain hermetic even under foreground QC | `RR:L259-L265` | obligation + corrective evidence | Specs 2–3 | process namespace/descendant cleanup fixture |
| Neutral safe-summary retry is not assumed reliable; structured fallback is bounded | `RR:L266-L275` | obligation + positive control + superseded workaround | Spec 3 | native typed escalation target; schema fallback fixture |
| Unsupported `coordinator_guidance` type yields actionable enum diagnostics | `RR:L276-L282` | duplicate-evidence of message-type obligation | Spec 3 | invalid-type error contract fixture |
| Executor leaves no untracked background terminal/process after final QC | `RR:L283-L289` | obligation + evidence | Spec 3 | owned-resource final inventory |
| Vendor-diverse reviewers cannot run host-sensitive full QC concurrently | `RR:L290-L296` | duplicate-evidence of QC isolation obligation | Spec 2 | QC mutex fixture |
| Destructive restore validates exact effect ordering before mutation | `RR:L297-L303` | obligation + evidence | Spec 3 | preflight/backup/effect-confirmation fixture |
| Discovery origin and pinned egress inventory mismatch fails closed before external calls | `RR:L304-L310` | obligation + evidence | Spec 3 | same-instance/origin authority fixture |
| Long-poll `runtime_unavailable` with a live runtime recovers without restarting workers | `RR:L311-L317` | obligation + evidence | Spec 3 | idempotent reconnect/FIFO replay fixture |
| Infra-blocked mandatory phase cannot report whole-task success | `RR:L318-L324` | obligation + evidence | Spec 3 | outcome truthfulness fixture |
| Diagnostic commands account for implicit side effects before execution | `RR:L325-L332` | obligation + evidence | Spec 3 | zero-budget side-effect preflight fixture |
| Known duplicate posture failure is applied, not rediscovered through repeated launches | `RR:L333-L343` | duplicate-evidence of wrapper posture obligation | Spec 3 | wrapper/PATH regression fixture |
| Composed Codex start cannot fall through to shell and fabricate success | `RR:L344-L351` | duplicate-evidence of process-identity obligation | Spec 3 | real harness/process validation |
| Expired Dispatch capability separates accepted content from rejected settlement and deduplicates retries | `RR:L352-L358` | obligation + evidence | Spec 3 | per-event capability revocation fixture |
| Executor cannot delete neighboring project containers/resources | `RR:L359-L367` | obligation + evidence | Spec 3 | exact destructive allowlist invariant |
| Authority envelope must be exact enough to permit required live work without broad unsafe prohibition | `RR:L368-L395` | obligation + evidence | Spec 3 | bounded authority/effect-plan fixture |
| Durable product decision gate cannot be skipped after local implementation | `RR:L396-L414` | obligation + evidence | Specs 2–3 | business-intent harvest and outcome truthfulness |
| Repeated closure of hot reviewer tabs preserves separate recurrence evidence | `RR:L415-L445` | duplicate-evidence of hot-session obligation | Spec 2 | hot pair retained through `PASS+PASS` |
| Fresh Claude TUI input must be empty before injection | `RR:L446-L468` | obligation + evidence | Spec 3 | prompt-state readiness/PTY reproduction |
| Heartbeat promise is not a calibrated liveness threshold | `RR:L469-L491` | obligation + corrective evidence | Spec 3 | wall-clock/native-activity liveness fixture |
| Monitor seeds current state before reporting change | `RR:L492-L512` | obligation + three duplicate reproductions | Spec 3 | seed-before-alert fixture |
| `latest cursor` is not direct TUI liveness evidence | `RR:L513-L536` | obligation + corrective evidence | Spec 3 | direct-signal classifier fixture |
| Quota/reset unavailable on public Dispatch surface remains `unknown`, not transcript inference | `RR:L537-L569` | obligation + evidence | Spec 3 | public account/lifecycle capability proof |
| Provider transcript reset time is non-authoritative; account-level surface is preferred but insufficient alone | `RR:L570-L602` | evidence + superseded workaround | Spec 3 | transcript exclusion and account-to-Dispatch binding fixture |
| Lost coordinator pane requires public authorized Run takeover | `RR:L603-L629` | obligation + evidence | Spec 3 | coordinator takeover E2E |
| Replacement Claude reviewer cleanup preserves accepted result and removes superseded exact tab | `RR:L630-L664` | obligation + evidence | Specs 2–3 | replacement bookkeeping and exact cleanup E2E |

## Duplicate obligations retained with distinct evidence

| Canonical obligation | Distinct source evidence |
| --- | --- |
| Wake coordinator on lifecycle event | `RR:L47-L68`, `RR:L102-L108`, `RR:L174-L186` |
| Preserve hot executor/reviewer sessions through the loop | `RR:L67`, `RR:L83-L89`, `RR:L147-L173`, `RR:L415-L445` |
| Reject bare-shell/fabricated completion | `RR:L24-L26`, `RR:L344-L351` |
| Do not duplicate provider posture flags | `RR:L96-L101`, `RR:L333-L343` |
| Distinguish quota from working/lost | `RR:L109-L115`, `RR:L216-L223`, `RR:L537-L602` |
| Distinguish refusal stages and complete settlement | `RR:L153-L161`, `RR:L252-L258`, `RR:L266-L275` |
| Serialize and isolate full QC | `RR:L244-L251`, `RR:L259-L265`, `RR:L283-L296` |
| Require effect/consumption confirmation, not receipt | `RR:L11-L12`, `RR:L29`, `RR:L58-L60`, `RR:L230-L236`, `RR:L297-L303` |
| Calibrate monitoring only on direct validated signals | `RR:L47-L68`, `RR:L469-L536` |
| Clean only exact owned replacement resources | `RR:L29`, `RR:L77-L82`, `RR:L96-L101`, `RR:L630-L664` |

## Research and prior council artifacts

| Input | Preserved decision surface |
| --- | --- |
| `review-deep-research-1.md` | §1.9 staged review, evidence/falsification, concrete mode semantics, §1.11 ensemble hypothesis |
| `review-deep-research-2.md` | portable skill shape, false-positive control, bounded experiment |
| `review-deep-research-3.md` | deterministic grounding, specialization hypothesis, adversarial verification deferred to eval |
| proposals/reviews R0–R3 | four-spec body, Decision ledger, rejected/deferred choices |
| both premortems | Program risks, fail-closed coverage, temporary AST bijection |

Focused spec reviewers получили весь review candidate вместе с frozen user decisions и проверили также отсутствие потерь относительно перечисленных prior artifacts.
После исчерпания broad review ceiling выполнены только перечисленные в overview bounded corrections; повторная свободная generation не выполнялась.

Executable input: [full frozen node inventory](coverage-inventory.md).
