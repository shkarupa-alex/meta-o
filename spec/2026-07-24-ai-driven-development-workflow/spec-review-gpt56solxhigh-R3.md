## Итог

R2 заметно сильнее предыдущей версии: исправлены branch/`HEAD` semantics, добавлены tag-mirror receipt, per-candidate smoke, deadlines, cancellation, materialization proof и executable conformance cases.

Но implementation-ready статус пока преждевременен. Найден один прямой конфликт с hard constraint и несколько существенных пробелов. Оценка — 7/10, без принятия as-is.

## Facts & Constraints — White Hat

Технически состоятельны:

- Exact commit OID как единый subject всех gates.
- Fresh detached worktree и pre/post proof.
- RFC 8785 для plan/state/receipt.
- LFS/submodule materialization guard.
- Candidate branch, не меняющий основной checkout.
- Annotated tag, не изменяющий tracked tree.
- Bounded `EffectIntent` и запрет blind resend.
- Release-blocking capability suite.
- Fail-closed routing неизвестных ошибок.

Но есть ограничения:

1. `active-run.json` и project-wide lock существуют только под локальным path-derived `project-key`. Они не видят второй clone или компьютер. Поэтому они не предотвращают заявленное расхождение командных branches, зато блокируют две независимые feature на одном компьютере.

2. Annotated tag не распространяется обычным branch push. Спецификация это признаёт, но не делает tag push частью точного user-requested publish contract.

3. После cleanup удаляется canonical verification plan. В commit и receipt остаётся только `planDigest`, который больше не с чем сравнить.

4. Требуемые backend guarantees могут не поддерживаться ни Herdr, ни Omnigent. Release rule честный, но operational feasibility ещё не доказана.

## Risks & Failure Modes — Black Hat

### 1. Project-wide serialization нарушает исходный hard constraint

Оригинал прямо исключает claims/locks между разработчиками и оставляет конфликты обычному Git/PR. D-081 вводит противоположное правило: один mutating run на проект.

Более того, механизм не выполняет заявленную цель между компьютерами: разные absolute paths создают разные `project-key`.

Отказ:

- paused run бессрочно блокирует несвязанную feature;
- потерянный backend stop блокирует весь локальный проект;
- два разработчика всё равно параллельно изменяют knowledge layer в разных clones;
- сложность lease/marker не устраняет Git-конфликт.

Нужно удалить project-wide serialization. Оставить single-writer lock только внутри одного run; параллельные feature вести в отдельных branches, а перед integration делать rebase/merge и повторную attestation при изменении R.

### 2. Поставка всё ещё неполна

§2 и §36 перечисляют будущие подспеки, но сами пять implementation-ready документов отсутствуют. Это прямое невыполнение исходного deliverable.

Особенно не хватает:

- anchor/purpose grammar;
- `KnowledgeImpactPlan` и adoption manifest schemas;
- concrete Python AST/import-graph implementation;
- skill inventory и installer/update protocol;
- complete adapter types и capability tests;
- полноценной watchdog FSM.

### 3. Verification proof теряется при cleanup

Receipt содержит `planDigest`, но не canonical plan. После удаления `runs/<id>/plans` невозможно проверить:

- `changedPaths`;
- impacted anchors/tags;
- selection rationale;
- selection policy input;
- соответствие сохранённого digest исходному plan.

Похожая проблема у result/evidence digests: после удаления preimage они являются provenance claims, но не проверяемыми доказательствами.

Canonical plan достаточно компактен, чтобы включить его целиком в receipt/tag.

### 4. Per-scenario verification state остаётся неявным

Receipt хранит общий E2E PASS и список IDs, но не записи вида «scenario → business links → status → verifiedAt». Их можно частично реконструировать из registry в R, однако schema не выполняет исходный контракт напрямую и противоречит §32.9, где заявлены сохранённые scenario outcomes.

Failed/blocked outcomes после отмены run вообще исчезают.

### 5. Findings lifecycle не имеет closure guard

`FindingRecord` добавлен, но не определено, кто и при каком доказательстве может перевести finding в `resolved`. Слабая реализация может удалить запись сразу после заявления executor о fix.

Нужны поля `resolutionCandidate`, `resolutionEvidence`, `resolvedBy` и invariant: defect удаляется только после подтверждения исходным reviewer generation, replacement reviewer или adjudicator.

### 6. Cancellation может навсегда заблокировать проект

Если backend stop невозможно подтвердить, run остаётся `PAUSED_BACKEND_UNCERTAIN`, а project ownership не освобождается. При окончательно исчезнувшем backend нет terminal escape.

Нужен явный пользовательски санкционированный `ABANDONED_WITH_ORPHANS`: активная блокировка снимается, а компактный tombstone с session IDs остаётся для последующего cleanup.

### 7. False-green QC не закрыт

Executor способен изменить `Makefile` или checker так, чтобы `make qc` возвращал `0`. Фраза «ослабление требует решения» не сопровождается machine algorithm.

Нужны:

- QC manifest с обязательными gate IDs;
- сравнение состава gates с base;
- schema structural baseline;
- защищённое обнаружение удаления/ослабления checks;
- конкретный Python reference implementation.

### 8. Control-plane разрастается

Два lease locks, heartbeat, quarantine takeover, marker, generation fencing, effect journal, cursors и watchdog приближаются к собственному control layer — именно тому, чего исходные ограничения и `sdd-issues.md` просили избегать.

На local macOS/Linux проще использовать OS-released advisory process lock для writer одного run. Lease нужен только для распределённого ownership, которое здесь одновременно запрещено и фактически не реализовано.

## Strengths & Benefits — Yellow Hat

Сильные стороны R2:

- Корректно разделены candidate ref и пользовательский checkout.
- Branch сохраняется после completion.
- Tag решает переносимость receipt без нового commit.
- Smoke теперь повторяется для каждого candidate.
- Plan canonicalization больше не оставлена реализации.
- Revision включает materialized LFS/submodule state.
- Worker envelopes защищают от stale/conflicting results.
- Deadlines и запрет retry-for-PASS снижают false success.
- Failure taxonomy значительно улучшает recovery.
- Security boundary явно считает model output недоверенным.
- Capability suite стала настоящим release gate.
- Conformance cases покрывают основные crash windows.
- Dissent честно фиксирует цену строгих решений.

Exact-revision и crash-safety ядро выдерживает стресс-тест существенно лучше ранних версий.

## Alternatives & Creative Ideas — Green Hat

| Проблема | Совместимый вариант | Вариант с нарушением исходных решений | Цена |
|---|---|---|---|
| Concurrency | Run-local lock, отдельные Git branches, integration re-attestation | Центральный cross-machine claim service | Первый допускает Git-конфликты; второй создаёт control layer |
| Crash locking | OS advisory lock + generation + один `EffectIntent` | Durable event log и lease coordinator | Event log надёжнее, но превращается в runtime |
| Verification | Хранить canonical plan и per-scenario records внутри annotated tag | Tracked bookkeeping commit после R | Commit проще обнаружить, но возвращает dual revision |
| QC | Project-owned manifest и reference checker | Центральный version-pinned QC bundle/mandatory CI | Bundle единообразнее, но нарушает project-owned policy |
| Purpose | Точная grammar, fixtures и semantic review | Risk-based purpose | Второй уменьшает cargo cult, но нарушает hard constraint |
| Watchdog | Deterministic authority, optional advisory classifier | Autonomous local-model watchdog | Автономность выше, предсказуемость и безопасность ниже |

## Completeness & Process — Blue Hat

### Traceability

Ledger существует и хорошо фиксирует R1/R2 corrections. Но остаются разрывы.

Adopted, но отсутствуют или недостаточно представлены в нормативном body:

- `D-009`: лимит handoff 4 KiB.
- `D-024`: `KnowledgeImpactPlan` отсутствует в `RunState` и не имеет schema.
- `D-036`: placement pre-commit/pre-push.
- `D-038`: TS → dependency-free JS helpers.
- `D-051`: full project audit outside scope.
- `D-053`: общий запрет push/PR без просьбы пользователя.
- `D-054`: отсутствие project skill-version pin/check.
- `D-071`: unlimited cycles явно не закреплены.

Rejected, но не перечислены в §31:

- `D-034`: knowledge-only E2E reuse;
- `D-044`: risk-based purpose;
- `D-048`: automatic churn limit.

`D-029` помечен rejected, тогда как external spec archive указан deferred; следует различить automatic cold archive и user-managed archive.

D-081 присутствует в body, но конфликтует с исходным hard constraint.

### Decomposition Readiness

Master хорошо делится на подсистемы, но реализационные задачи всё ещё потребуют design work в:

- lock/marker crash reconciliation;
- knowledge parser;
- adoption closure;
- QC baseline/graph algorithms;
- scenario-impact selection;
- adapter capability schemas;
- ephemeral-role lifecycle;
- watchdog;
- installer/updater;
- tag publication contract.

§36 — план написания подспек, не сами подспеки.

### Weak-Model Executability

Не определены либо используются до определения:

- `ModelRef`;
- `DecisionRecord`;
- `DecisionOption`;
- `FindingSetRef`;
- `PauseState`;
- `KnowledgeImpactPlan`;
- `Evidence`;
- `E2EScenarioResult`;
- `AdapterCapabilities`;
- `SpawnRequest`;
- `EffectContext`;
- `DeliveryResult`;
- `SessionStatus`;
- `SessionOutput`;
- `EffectStatus`;
- `ExpectedState`;
- `WaitResult`;
- `StopResult`.

`reuseResearcher` и `technicalAdjudicator` отсутствуют в `Role`, `SessionRef` и worker envelopes.

Не определены формулы `resultDigest`, `evidenceDigest`, `changedPathManifestDigest`, `sourceMaterializationDigest` и structured `environmentFingerprint`.

### Contract Completeness

TBD-подобные пробелы вне Open Questions:

- порядок захвата project/run locks;
- atomic lifecycle `active-run.json`;
- heartbeat storage и clock-jump behavior;
- crash после удаления run directory до удаления marker;
- force-abandon semantics;
- non-UTF-8 Git paths;
- URL spec size/scheme/redirect policy;
- complete plan retention;
- QC manifest/baseline schemas;
- purpose and anchor grammar;
- watchdog config/polling/service contracts;
- skill names, inputs, outputs и installation commands;
- model vendor/family taxonomy;
- schema migration policy.

### Test coverage

§30 — хорошее начало, но отсутствуют conformance cases для:

- active-marker crash windows;
- lease race, clock jump, PID reuse и lock ordering;
- cancellation с permanently unreachable backend;
- findings resolution/adjudication;
- knowledge anchors/purpose/adoption;
- QC weakening и false-green Makefile;
- graph baseline ratchet;
- watchdog fake clock и quota wake;
- URL spec security;
- per-scenario receipt и retained plan;
- non-UTF-8 paths;
- ephemeral roles;
- полный golden path и resume из каждого `PAUSED_*`.

## Рекомендация

Сохранить exact-commit, detached gates, plan binding, tag receipt и `EffectIntent`. Перед принятием:

1. удалить D-081/project-wide serialization;
2. включить полный plan и per-scenario state в receipt/tag;
3. выпустить пять реальных подспек;
4. завершить findings/cancellation contracts;
5. дать concrete Python QC и полноценную watchdog spec.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "R2 существенно укрепляет exact-revision и crash-safety ядро: candidate ref больше не смешан с пользовательским HEAD, каждый candidate проходит QC/smoke в fresh checkout, plan canonicalized, LFS/submodules включены в materialization proof, worker envelopes и failure taxonomy конкретны, а receipt зеркалируется annotated tag. Однако as-is спецификацию принимать нельзя: project-wide active-run lock прямо противоречит hard constraint об отсутствии interuser claims и при этом не работает между clones/машинами; отсутствуют сами пять implementation-ready подспек; cleanup удаляет canonical verification plan, оставляя непроверяемый digest; receipt не хранит явный per-scenario verification state; findings/cancellation имеют незакрытые terminal semantics; concrete Python QC, skills и watchdog всё ещё требуют нового design work.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "Concurrency and hard constraints",
          "description": "D-081 вводит один project-wide mutating run и project ownership locks вопреки исходному требованию использовать обычный Git/PR без claims и блокировок. Механизм локален по absolute path и всё равно не предотвращает параллельные runs на других компьютерах.",
          "required_change": "Удалить project-wide active-run serialization; оставить single-writer fencing внутри одного run, разрешить отдельные feature branches и требовать integration re-attestation после Git conflict/rebase."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Required delivery",
          "description": "Документ только перечисляет пять будущих implementation-ready подспек; сами нормативные файлы, требуемые исходной задачей, не предоставлены.",
          "required_change": "Предоставить 00-master-workflow.md и пять отдельных подспек с полными schemas, algorithms, commands, failure states и acceptance cases."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Verification durability",
          "description": "После cleanup удаляется canonical verification plan, тогда как commit и receipt сохраняют только planDigest. Receipt также не содержит явных записей scenario/business-links/status/verifiedAt, несмотря на исходный контракт и заявление §32 о сохранении scenario outcomes.",
          "required_change": "Включить canonical VerificationPlan и массив per-scenario verification records в receipt и annotated tag."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Findings lifecycle",
          "description": "FindingRecord имеет состояние resolved, но не определяет, кто подтверждает исправление и какой guard разрешает удаление; executor implementation может преждевременно закрыть finding.",
          "required_change": "Определить reviewer/adjudicator-verified transition с resolutionCandidate, resolvedBy и resolution evidence; удалять запись только после этого transition."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Cancellation and liveness",
          "description": "Неподтверждённый backend stop оставляет run и project ownership заблокированными навсегда, если backend больше не восстановится.",
          "required_change": "Добавить явно санкционируемый terminal ABANDONED_WITH_ORPHANS с durable session tombstone и освобождением mutation ownership."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Local QC and knowledge",
          "description": "Конкретная Python implementation отсутствует; Makefile/checker может быть ослаблен до false PASS, а KnowledgeImpactPlan, anchor grammar, purpose parser и adoption manifest не имеют контрактов.",
          "required_change": "Выпустить 10-knowledge-layer.md и 40-local-qc-python.md с schemas, algorithms, fixtures, QC manifest и reference project-owned checker."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Orchestration and skills",
          "description": "Эфемерные роли не представлены в state/envelopes, многие используемые типы не определены, а concrete skill inventory, installer/update commands и backend request/result contracts отсутствуют.",
          "required_change": "Завершить 20-orchestration-and-skills.md: определить все types, роли, skill names/I/O, state transitions, adapter envelopes и installation protocol."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Watchdog",
          "description": "§28 остаётся списком свойств, а не полностью спроектированной опцией; отсутствуют требуемое сравнение deterministic/local/hybrid, config schema, polling/wake semantics, sanitization и service acceptance tests.",
          "required_change": "Предоставить полноценную 50-watchdog.md с трёхсторонним сравнением, deterministic state machine, config, launchd/systemd contracts и fake-clock tests."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Traceability",
          "description": "D-009, D-024, D-036, D-038, D-051, D-053, D-054 и D-071 недостаточно представлены в normative body; D-034, D-044 и D-048 отсутствуют в Rejected.",
          "required_change": "Синхронизировать body, Rejected/Deferred и ledger перед финальной публикацией."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Locking contract",
          "description": "Не заданы порядок двух locks, heartbeat write protocol, clock-jump/PID-reuse handling и crash reconciliation active-run marker.",
          "required_change": "Либо упростить до OS advisory run lock, либо полностью определить lease algorithm и negative tests."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Git contracts",
          "description": "Plan требует Unicode paths, хотя Git допускает non-UTF-8 names; changed-path и materialization digest serializations определены неполно.",
          "required_change": "Установить UTF-8 repository invariant либо определить reversible byte encoding и точные digest preimages."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Audit semantics",
          "description": "Result/evidence/environment digests остаются после удаления соответствующих bytes и не могут быть независимо перепроверены.",
          "required_change": "Либо сохранять compact canonical preimages, либо называть эти поля provenance records, а не проверяемым доказательством."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Test coverage",
          "description": "Conformance suite хорошо покрывает core crash windows, но не knowledge/QC/watchdog/findings/cancellation/full-FSM paths.",
          "required_change": "Расширить executable cases на каждый нормативный subsystem и pause/terminal transition."
        }
      ],
      "assumptions": [
        "Оценивался только предоставленный master document; перечисленные, но не предоставленные подспеки считаются отсутствующими.",
        "Project-key и active-run state локальны конкретному absolute path и не синхронизируются между компьютерами.",
        "Canonical verification plan удаляется вместе с run directory и не хранится в annotated tag сверх показанного receipt schema.",
        "Ни один backend capability-suite result не был предоставлен как доказательство operational feasibility.",
        "Annotated tag не считается автоматически опубликованным при обычном branch push."
      ],
      "round": 3,
      "reviewer": "gpt56solxhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
