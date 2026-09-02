# Spec 2 — Feature lifecycle and review settlement

Статус: implementation-ready. Обязательный общий contract, зависимости, eval matrix и decision ledger находятся в [program overview](2026-09-02-backlog-zero-council-brainstorm.md). Эта spec не может ослаблять общий contract.

## 2.1. Outcome

Собрать intent, исполнение и review loop в один skills-first lifecycle. Оркестратор управляет процессом, executor владеет product/spec commits, а `mo-review-orca` владеет двумя независимыми горячими reviewers и импортирует portable protocol из spec 1.

## 2.2. Components

- `shared/references/methodology.md`: общий lifecycle и authority boundaries;
- `src/skills/mo-orchestrate-orca/`: управляющая роль, delegation, waits, settlement;
- `src/skills/mo-review-orca/`: review session lifecycle и pair delivery;
- `src/skills/find-reuse/`: pure report producer из spec 1; lifecycle является его внешним consumer;
- `shared/scripts/mo-models.mjs` и `~/.meta-o/models.json`: единственный узкий источник user-approved role/model/effort;
- `shared/references/review-protocol.md`: portable review behavior из spec 1;
- `docs/business.md`: только новые устойчивые intents, не incident log;
- temporary feature spec, verbatim ledger и outcome checklist: executor-owned tracked artifacts до merge approval.

Новый workflow engine, state store, task database или Meta-O wrapper над Orca не создаются.

### External `find-reuse` integration

Для существенного нового компонента или разрешённой смены технологии executor до implementation:

1. строит `find-reuse.request.v1` из accepted feature intent, generic business requirements и constraints;
2. по §B-FRAMING-04 запускает явно указанный `find-reuse` либо один раз предлагает пользователю opt-in, если исследование не было утверждено постановкой;
3. валидирует `find-reuse.report.v1` и сохраняет его дословно в `## Reuse research` temporary feature spec;
4. коммитит report spec-only increment до product code;
5. при `unknown|blocked` не превращает отсутствие evidence в `build`; решение продолжить принимает только внешний lifecycle/user authority.

Сам `find-reuse` не знает destination и не пишет repository. Invocation/destination полностью остаются здесь.

## 2.3. First-commit artifacts

Минимальный feature bundle:

```text
spec/<feature>/
  <feature>-spec.md
  user-ledger.md
  checklist.md
```

`checklist.md` содержит только observable outcomes:

```markdown
- [ ] <outcome>
- [ ] Tests and knowledge updated
- [ ] Applicable E2E passed on candidate SHA
- [ ] Two reviewers passed final candidate SHA
```

Он не копирует design details и не становится task graph. Executor отмечает выполненное в coherent commits. Orchestrator читает, но не редактирует product/spec commits.

Перед записью `user-ledger.md` materializer заменяет обнаруженный secret на `[REDACTED:<kind>]`. Если классификация значения неоднозначна, он останавливается с `needs_attention`, не коммитит и не угадывает. Эта обязанность переходит из удаляемого `mo-reuse` к lifecycle materialization и проверяется fixtures для token/password/private key/false-positive-like identifier.

## 2.4. Business-intent harvest

До substantive implementation executor сравнивает spec/ledger с `docs/business.md`:

```text
каждое повторяющееся normative ожидание
→ existing §B-* exact link
| new compact §B-* thesis
| explicit user-approved meaning change
```

Incidents, command syntax и временный workaround идут в architecture/papercut/tests, а не раздувают business layer. Review проверяет пропорциональность: маленькая feature не переписывает общую картину проекта.

## 2.5. Executor advisory self-review

Перед `worker_done` executor может запустить один clean-room subagent review собственного candidate. Это явно ограниченное исключение к hot-session preference:

- advisory, не lifecycle gate;
- не заменяет vendor-diverse pair;
- не получает ownership worktree;
- результат полностью отражается в executor `worker_done`;
- executor исправляет material finding либо объясняет disagreement.

Способность executor работать без этого self-review сохраняется; обязательным является readiness собственного результата, а не конкретный subagent mechanism.

Для этого advisory review используется `fast`, если concern scan не обнаружил high-risk/broad semantic delta. Обнаруженный escalation автоматически переводит тот же review в `deep`; mode не разрешает executor пропустить material finding.

## 2.6. Review session contract

`mo-review-orca` получает:

```yaml
candidate_sha: <40-hex full SHA>
intent_source: <Git blob/ref or bounded private input>
scope: branch|feature|project
mode: fast|deep|follow_up
previous_review:
  candidate_sha: <required for follow_up>
  own_report: <required for follow_up; no peer report>
  own_finding_dispositions: <required for follow_up>
reviewers:
  - harness: codex
    model: <exact configured model>
    effort: <exact effort>
  - harness: claude
    model: <exact configured model>
    effort: <exact effort>
```

`previous_review` отсутствует для `fast|deep`. Для `follow_up` каждый reviewer получает только собственный предыдущий report и dispositions своих findings; peer report и peer reasoning не передаются.

Meta-O mode policy:

- первый обязательный lifecycle review выполняется как `deep`;
- remediation review выполняется как `follow_up`, пока portable core не повышает effective mode до `deep`;
- `fast` используется для advisory executor self-review или явно запрошенного standalone fast review и не заменяет первый обязательный deep pair;
- final same-SHA gate может быть `follow_up`, если reviewers видят original intent, свой prior report, полный delta и все изменившиеся contracts; semantic expansion повышает его до `deep`;
- выбор mode не меняет требование двух независимых vendor-diverse reviewers и двух `PASS` на одном SHA.

Model/provider/effort читаются через bundled `mo-models.mjs --show --project <root>` из единственного writer-owned `~/.meta-o/models.json` schema v1: `reviewerA` и `reviewerB` обязательны, `executor` используется orchestrator. Project role имеет приоритет над global default; unset/foreign-schema/invalid catalog selection даёт typed `model_selection_missing|invalid|unavailable`. `mo-setup` предлагает пользователю exact `mo-models --set` command и проверяет catalog, но не выбирает значение. Skill не выбирает fallback harness/model и не добавляет sandbox/posture flags.

Каждый reviewer:

- имеет стабильный title `<feature>:review:<vendor>`;
- работает в immutable checkout exact SHA либо читает SHA-addressed Git objects;
- перед review доказывает full SHA и clean status;
- использует exact native Dispatch ID как `Review-Execution`;
- возвращает полный textual report через Orca `worker_done`;
- после принятого `worker_done` показывает в своей видимой TUI краткую textual severity summary, связанную с `Review-Execution`;
- если native send отклонён, capability потеряна либо delivery не подтверждён, показывает `REVIEW DELIVERY UNKNOWN <Review-Execution>` и не считается settled;
- остаётся горячим в remediation rounds; native retention capability и terminal-level fallback определены в spec 3.

`worker_done` body остаётся единственным authoritative report. TUI summary — отдельный UX acceptance outcome, не второй verdict и не lifecycle evidence. Missing/mismatched summary фиксируется и исправляется как UX defect, но не аннулирует уже принятый полный `worker_done`; terminal text никогда не заменяет отсутствующий или отклонённый report.

Remediation использует горячие vendor-diverse роли без peer bytes. Перед единственным final same-SHA gate прежние reviewer processes освобождаются exact-target способом и запускаются две свежие независимые sessions на final deletion SHA. Это сохраняет дешёвый hot loop, но final proof выполняет действующий fresh-review contract.

Пользовательские unnamed tabs не закрываются. Собственная failed/replaced session освобождается exact-target operation после подтверждения replacement bookkeeping; duplicate visible tabs не оставляются.

## 2.7. Pairing, remediation и settlement

1. Создать обе review tasks до запуска первой.
2. Успешно запустить обе с выбранными профилями.
3. Ждать обе полные выдачи; не посылать findings исполнителю по одной.
4. Проверить exact SHA, `Review-Execution` и report completeness; terminal summary проверяется отдельно как UX.
5. Передать executor исходную пару reports без перефразирования.
6. Executor исправляет findings либо аргументированно возражает.
7. Orchestrator решает спор по contracts/evidence; reviewer может ответить.
8. Любая material code/doc change образует новый candidate SHA.
9. Settlement завершается двумя независимыми `PASS` на одном final full SHA.

P0–P2 блокируют settlement. Все P3 также передаются executor и должны быть исправлены либо явно отклонены с причиной. Отдельный follow-up round только ради P3 не запускается; после обработки всех изменений один общий final same-SHA gate даёт два `PASS`.

Settlement не имеет numeric cap и всё равно требует два final `PASS`. Отдельно сохраняется пользовательский per-slice budget: после substantive slice допускается не более пяти парных review/fix attempts; remediation SHA не сбрасывает `M`. После attempt 5 orchestrator завершает уже начатую remediation, затем либо возвращает hot executor к следующему substantive slice и начинает новый budget, либо при отсутствии следующего slice останавливается с `needs_attention` как loop without progress. Идентификаторы `slice N / review attempt M of 5` живут в Orca task titles/messages и reasoning context, восстанавливаются из public run history и не создают Meta-O state store.

Final gate выполняется один раз после удаления temporary spec/checklist и всех последних правок. Reviewers получают intent из parent Git blob или bounded private input, поэтому deletion SHA остаётся проверяемым без tracked archive.

## 2.8. QC isolation

- reviewers не запускают mutating formatter/fixer;
- full QC не запускается одновременно в одном worktree;
- orchestrator/executor владеет mutex/sequencing full QC;
- потенциально mutating diagnostic выполняется в disposable checkout;
- reviewer может запускать read-only targeted tests, но сообщает command и environment;
- candidate mismatch или dirty checkout даёт `unknown`, не `PASS`.

## 2.9. Completion cleanup

После двух `PASS`, applicable E2E и user merge decision executor:

1. переносит durable knowledge;
2. удаляет feature spec, ledger и checklist;
3. повторяет required deterministic gates;
4. запускает две свежие independent reviewer sessions на deletion SHA и повторяет только E2E, для которого carry-forward недопустим по methodology §8;
5. освобождает только owned Orca workers/terminals после delivery confirmation.

Оркестратор не путает review-loop settlement с завершением всей spec и не закрывает executor после промежуточного QC.

## 2.10. Acceptance и evals

Deterministic fixtures/contracts:

- unknown/short SHA отклонён;
- dirty/mismatched checkout не может дать `PASS`;
- один report не доставляется как пара;
- P3 передаётся, но не создаёт отдельный minor-only loop;
- first lifecycle review использует `deep`, remediation использует `follow_up`, advisory self-review может использовать `fast`;
- `follow_up` получает только own prior report/dispositions, не peer bytes;
- high-risk или broad delta повышает `fast|follow_up` до effective `deep`;
- textual severity присутствует у каждого finding, но machine counters/adjudication grammar отсутствуют;
- TUI summary связан с `Review-Execution`, но его mismatch не отменяет authoritative `worker_done`;
- rejected/incomplete `worker_done` даёт `UNKNOWN`, а terminal text не принимается вместо report;
- remediation roles hot, final same-SHA pair fresh; fresh pair не получает prior reports;
- attempt 5 не превращается в attempt 6 того же slice и не заменяет final two-PASS settlement;
- failed launch не меняет approved model и очищает только owned failed session;
- full access wrapper не получает duplicate flag;
- user unnamed tab остаётся;
- two reviewers не запускают full QC одновременно;
- comments с review finding ids отклоняются policy/lint review.

Agent E2E:

- 2–3 bounded Qwen runs проверяют explicit trigger/no overtrigger и pair protocol;
- live Orca scenario: два vendor-diverse reviewers exact SHA, brief diagnostic TUI summaries, full `worker_done`, hot remediation, fresh final pair и два final `PASS`;
- executor self-review scenario доказывает advisory status и полную передачу результата.

## 2.11. Rejected/deferred

- Четыре обязательных initial reviewers, 2×2 prompts и specialized subagents deferred до pre-registered differential eval.
- Confidence threshold вместо evidence отклонён.
- Автоматический fallback на иной harness/model отклонён.
- Закрытие всех reviewer tabs после каждого round отклонено.
- Review finding identifiers в production comments отклонены.

## 2.12. Open questions

Нет. Конкретный выбор моделей остаётся user-approved runtime configuration, а не постоянной spec-константой.
