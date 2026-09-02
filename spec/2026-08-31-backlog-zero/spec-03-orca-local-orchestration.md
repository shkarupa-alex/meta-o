# Spec 3 — Orca reliability and local-model orchestration

Статус: implementation-ready. Обязательный общий contract, зависимости, eval matrix и decision ledger находятся в [program overview](2026-09-02-backlog-zero-council-brainstorm.md). Эта spec не может ослаблять общий contract.

## 3.1. Outcome

Сделать Orca единственным правдиво поддерживаемым backend, а `mo-orchestrate-orca` — реально запускаемым через локальный Qwen/OpenCode управляющим слоем. Исправления upstream не маскируются Meta-O proxy.

## 3.2. Ownership boundary

Meta-O владеет:

- required capability contract;
- preflight и fail-closed consumption;
- orchestration policy, roles, cadence, recovery ladder;
- acceptance fixtures/E2E;
- точными upstream issues и временными public workarounds только в разрешённых границах.

Orca/upstream `orchestration` владеет native commands, event envelope, delivery, process state, settled responses и effect confirmations. Для каждого gap нужны reproduction + upstream issue, затем upstream fix или qualifying public workaround. Сам факт issue означает только provenance; backlog закрывается лишь работающим proof либо явным architecture rejection.

Работа делится на два зависимых milestone:

- **3A — model configuration и readiness foundation**: расширяет `shared/scripts/mo-models.mjs` ролью `orchestrator`, квалифицирует Orca/OpenCode readiness и даёт deterministic fixtures. Этот milestone зависит только от Program input readiness и может идти параллельно со spec 1.
- **3B — lifecycle reliability и local orchestration**: реализует event/recovery/watchdog contracts и Qwen E2E. Он начинается после portable review lifecycle из spec 2 и foundation 3A.

## 3.3. Readiness contract

Readiness различает provider-native auth, Orca account projection и фактическую способность Orca запустить выбранный harness. Ни один из этих сигналов по отдельности не подменяет остальные.

Единственный project-owned источник выбора моделей — существующий `shared/scripts/mo-models.mjs --show --project` и schema `1` файла `~/.meta-o/models.json`. Milestone 3A добавляет туда роль `orchestrator` рядом с `executor`, `researcher`, `reviewerA`, `reviewerB`, `e2eTester`; project override имеет приоритет над user default. Неизвестная роль, route, model или effort дают typed error, а не fallback. `mo-setup` может предложить пользователю точную команду настройки, но не меняет конфигурацию без разрешения.

```ts
type HarnessReadinessEvidence = {
  harness: "codex" | "claude" | "opencode";
  requested_model: string;
  requested_effort: string;
  native_auth: {
    state: "authenticated" | "unauthenticated" | "unknown";
    observed_at: string;
    command: string;
  };
  orca_account_projection: {
    state: "available" | "missing_credentials" | "unavailable" | "unknown";
    updated_at?: string;
    observed_at: string;
  };
  freshness: "fresh" | "stale" | "unknown";
  live_launch:
    | { state: "verified"; dispatch: string; process_identity: string; effective_model: string; effective_effort: string }
    | { state: "failed"; error: string }
    | { state: "not_run"; reason: string };
};
```

Перед доверием lifecycle message orchestrator доказывает:

1. `orca status --json` относится к ожидаемому instance/worktree;
2. companion `orchestration` доступен;
3. provider-native auth probe выполнен для выбранного harness;
4. `orca account list --json` прочитан вместе с `updatedAt`; projection, наблюдённая до более свежего успешного native auth, считается `stale`, а не доказательством отсутствующих credentials;
5. выбранный harness/model/effort существует и approved;
6. первый реальный role Dispatch либо один bounded disposable health Dispatch запустил настоящий harness process и task принят им, а не shell;
7. `launch.requested` и `launch.effective` совпадают по exact model/effort;
8. returned run/task/dispatch/terminal locators сохранены в текущем reasoning context.

Предпочтительно использовать первый реальный role Dispatch как live launch probe, чтобы не создавать лишние вкладки. Disposable probe допустим только когда реальный role ещё нельзя безопасно запускать; он создаётся по одному harness за раз, не выполняет product work и освобождается exact-target operation после подтверждения результата.

Если свежий provider-native auth расходится со stale Orca projection:

- orchestrator не просит пользователя авторизоваться повторно;
- не объявляет provider недоступным только по cached `missing-credentials|unavailable`;
- применяет только документированный read-only refresh/recheck, если native surface его предоставляет;
- затем выполняет один exact live launch probe на уже approved harness/model/effort;
- verified launch делает readiness успешной с диагностическим `stale_account_cache`;
- credential failure при verified real harness process означает backend integration gap, а не доказательство отсутствующей пользовательской авторизации;
- отсутствие подтверждённого process/effect оставляет readiness `unknown`;
- другой harness/model без user authority не пробуется.

`ready`/`input_accepted` — transport receipts. Untouched harness prompt, bare shell или task text executed by shell означают failed start; orchestrator останавливает только exact failed dispatch и применяет один документированный Orca fallback. Другой harness/model без user authority не пробуется.

## 3.4. Capability/event contract

Meta-O не вводит собственный envelope, но требует от native surface эквивалент следующих полей для каждого observed event:

```ts
type RequiredObservation = {
  instance: string;
  run: string;
  task: string;
  dispatch: string;
  terminal?: string;
  harness: "codex" | "claude" | "opencode";
  process: { identity: string; state: "running" | "stopped" | "lost" | "unknown" };
  transport: "created" | "queued" | "active" | "stopped" | "unknown";
  delivery: "not_sent" | "sent" | "delivered" | "consumed" | "acknowledged" | "unknown";
  work: "idle" | "working" | "input_blocked" | "output_blocked_after_work" | "completed" | "failed" | "unknown";
  outcome: "none" | "succeeded" | "failed" | "quota" | "capacity" | "reconnecting" | "compacted" | "refused" | "unknown_effect" | "unknown";
  message_id?: string;
  full_response?: string;
  observed_at: string;
};
```

Capability привязана к конкретным Dispatch/turn/process и проверяется на каждом событии; после exit/replacement она отзывается. Malformed/mismatched data даёт `unknown`, не inference из terminal preview.

Effectful native operations должны давать stable operation/target id, idempotency semantics и authoritative confirmation surface. Receipt не равен effect. Если effect нельзя подтвердить, состояние — `unknown_effect`; автоматический повтор запрещён.

Переходы трактуются буквально:

- `sent|queued|delivered` не доказывают `consumed`; acknowledgement допустим только после обработки всего delivery batch;
- `input_blocked` до product work допускает rebrief/replacement, `output_blocked_after_work` запрещает повтор product work и требует settled public response либо `unknown`/`needs_attention`;
- `compacted` требует re-grounding из Git spec/checklist и public Orca state до продолжения; потеря существенного контекста создаёт exact replacement;
- `unknown_effect` никогда не ретраится автоматически;
- question определяется typed Orca state, затем public harness UI; ordinary terminal text не превращается inference в question/completion.

## 3.5. Wait, wakeup и cadence

Основной механизм — blocking public wait на `worker_done,question,escalation` с bounded timeout. Timeout означает checkpoint, не failure.

- полный delivery batch обрабатывается до acknowledgment;
- early message обязан разбудить wait;
- quiet timeout создаёт один осмысленный checkpoint, не terminal polling loop;
- следующий wait ставится до продолжения длительной orchestration;
- cadence измеряется wall clock и backend event activity, а не количеством turns или repaint cursor;
- readiness/long work перепроверяется не реже одного bounded 5–10 minute window, если native wait не дал события;
- orchestrator не отправляет final, пока есть незакрытая spec, task, review, E2E или user-decision gate.

## 3.6. Roles, sessions и authority

Стабильные titles:

```text
<feature>:orchestrator
<feature>:executor
<feature>:review:codex
<feature>:review:claude
<feature>:e2e:<n>
```

Orchestrator не реализует feature локально. Executor остаётся hot до завершения remediation. Его low-level terminal остаётся exact-owned и видимым; следующий remediation Dispatch направляется в ту же session/terminal. Если native surface не может доказуемо сохранить этот context, hot-remediation capability считается blocked, а не симулируется новым cold worker. Review workers принадлежат spec 2; два финальных same-SHA verdict всегда дают свежие sessions. Bounded E2E actors освобождаются после доказанного результата. Unnamed human tabs и sessions вне текущего run не изменяются.

Прямой user input в worker имеет высший authority, но делает его контекст contaminated для прежней изолированной роли; orchestrator фиксирует decision и при необходимости создаёт replacement с явным bookkeeping.

Work package, reviewable slice и gate — разные понятия. `worker_done` закрывает только свой Dispatch. `outcome=succeeded` запрещён, если обязательная часть infra-blocked, E2E не выполнен или durable decision gate пропущен.

## 3.7. Recovery ladder

1. typed Dispatch/worker state;
2. provider-native auth и public account/provider status с отдельной freshness classification;
3. exact live launch evidence для расхождения native auth и Orca account projection;
4. заранее квалифицированный bounded terminal projection;
5. user interruption только на named credential/subscription/dispute/irreversible boundary.

Quota, capacity, reconnecting, compaction, refusal, lost process, actual missing credentials и `stale_account_cache` не смешиваются.

Для `stale_account_cache`:

1. сравнить native auth observation time с Orca `updatedAt`;
2. выполнить документированный read-only refresh/recheck, если он существует;
3. не перезапускать живой Orca Run и не трогать private cache;
4. выполнить один exact approved live launch probe;
5. при успехе продолжить с диагностической отметкой и upstream reproduction;
6. при credential failure живого harness process зафиксировать backend integration gap;
7. при неподтверждённом effect оставить `unknown` и не повторять start автоматически.

Для остальных состояний policy выбирает wait, nudge, exact replacement или human escalation. Terminal/private transcript не используется как primary settled-response transport.

Recovery освобождает exact owned failed resource после подтверждения; broad close/cleanup запрещён. Соседние containers/files/network resources не затрагиваются без точной authority. Неопределённый effect fail-closed.

## 3.8. Watchdog

Deterministic classifier остаётся primary и добавляет patterns для:

- `Selected model is at capacity`;
- quota/limit и reset time;
- endless reconnecting;
- question/refusal/failure/completion;
- lost coordinator/worker и stale baseline distinctions.

Он seed'ит baseline до alerts, различает `queued` и delivered nudge, использует только typed native state и соблюдает §A-WATCHDOG-01 dedup. Изменение projection/dedup требует обновления ADR.

Local classifier — bounded experiment для неоднозначных credential-free states:

- exact installed model, network denied;
- input — sanitized structured observation, не transcript;
- output enum плюс evidence fields;
- deterministic high-severity patterns имеют приоритет;
- false positive/negative, latency и resource use сравниваются с pattern baseline;
- при non-inferiority failure experiment отклоняется в §A-WATCHDOG-02, а backlog всё равно закрывается принятым решением.

## 3.9. Qwen/OpenCode orchestration profile

Локальный Qwen выполняет роль orchestrator, а не semantic judge. Произнесённое пользователем имя `Qwen 3.8 27B UD-Q4-KM` фиксирует intent и hardware profile, но не подменяет реальный provider/model id. Exact route, provider, model и effort берутся из user-approved роли `orchestrator` в `~/.meta-o/models.json`; OpenCode live launch обязан вернуть совпадающую effective identity. Если точную identity подтвердить нельзя, profile остаётся unsupported, а display label не hardcode'ится в skill.

Profile является поддерживаемым только если на GPU machine:

- OpenCode запускает exact configured local model и подтверждает effective identity;
- orchestrator не пишет product code и не присваивает executor ownership;
- корректно создаёт/называет roles и использует approved worker models;
- ставит blocking waits, обрабатывает early wakeups и quiet checkpoints;
- доставляет questions/reviews, соблюдает authority и recovery ladder;
- не заканчивает turn до terminal lifecycle state;
- не убивает unnamed/foreign resources;
- доводит representative feature до одного verified SHA.

Минимальный подтверждённый context budget — 32768 tokens. Каждое Orca observation передаётся как sanitized structured projection не более 8000 tokens; raw diagnostics на 21k/41k не инжектируются. При оценке использования context ≥75% либо после compaction orchestrator открывает fresh turn/session и re-ground'ится из Git spec/checklist и public Orca state. Fixture сворачивает 41k raw state до ≤8k, сохраняя typed error, evidence и все locators.

Critical suite:

1. fake-Orca regressions для всех unique real-run incident families;
2. три последовательных deterministic/fake прогона core safety/lifecycle scenarios без invariant failure;
3. один live small-feature E2E с executor, двумя vendor-diverse reviewers и applicable E2E;
4. exact environment/evidence record без secrets/transcripts.

Любой authority/destructive/premature-final/same-SHA failure блокирует поддержку профиля. Latency/tokens report-only. DeepSeek comparator optional.

## 3.10. Acceptance families

- fabricated `worker_done` из bare shell отвергнут;
- byte-safe task/report с quotes, newlines и shell metacharacters доставлен без интерполяции;
- early message wakes wait; timeout даёт один checkpoint;
- complete `worker_done` совпадает с public report surface;
- reviewer TUI projection диагностически совпадает с authoritative `worker_done` по `Review-Execution`, full SHA и verdict, но не может отменить полный settled response;
- reconnect/quota/capacity/compaction/refusal имеют разные typed outcomes;
- fresh `claude auth status` плюс более старый cached Orca `missing-credentials|unavailable` классифицируются как `stale_account_cache`, не вызывают повторный login или model fallback;
- exact approved live launch разрешает stale-account mismatch только после проверки real harness process, task consumption и `launch.requested == launch.effective`;
- actual unauthenticated provider, stale projection и backend integration credential failure дают три разные outcomes;
- duplicate flag не добавляется поверх wrapper posture;
- follow-up receipt без consumption не считается delivery;
- fake SHA и wrong candidate отвергаются;
- concurrent QC contamination предотвращена;
- own background terminals очищены, foreign resources сохранены;
- lost coordinator takeover восстанавливает управление через public run state;
- Qwen critical suite проходит на exact candidate SHA.

## 3.11. Rejected/deferred

- Meta-O proxy над Orca CLI отклонён.
- Private provider transcripts и inferred session databases отклонены.
- Автоматический retry `unknown_effect` отклонён.
- Произвольный fallback harness/model отклонён.
- Local model как замена deterministic watchdog patterns отклонён.
- Постоянная version compatibility matrix отклонена; versions диагностические, requalification incident-driven.

## 3.12. Open questions

Нет product decisions. Если required native capability отсутствует, implementation создаёт upstream issue и возвращает spec в blocked state до fix/qualifying workaround; это не повод ослаблять acceptance.
