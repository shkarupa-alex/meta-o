# 30 — Cross-review and E2E

## Purpose

Этот документ задаёт два независимых review gates, E2E plan/registry и
стабилизационные циклы. Нормативный источник:
[master-spec §11–§12](./2026-07-24-ai-driven-development-workflow-council-brainstorm.md#11-review-и-adjudication).

## Independent reviews

Reviewer A использует тот же vendor/family, что executor. Reviewer B —
другого vendor. Оба обязательны, работают независимо и получают:

- immutable spec blob;
- clean candidate commit и snapshot digest;
- diff и весь затронутый knowledge;
- QC manifest/result;
- E2E selection plan.

Они не получают executor reasoning, implementation narrative и findings друг
друга.

Единый rubric:

1. spec и business intent;
2. correctness, failures, security, concurrency;
3. architecture, boundaries, coupling, complexity;
4. tests, observability, false-success;
5. purpose semantics и knowledge drift;
6. maintainability и лишние наслоения;
7. полнота E2E selection plan.

Порядок анализа свободный; lenses обязательны.

## Finding contract

Каждый finding содержит:

```ts
interface Finding {
  id: string;
  severity: "blocker" | "major" | "minor" | "suggestion";
  classification: "defect" | "engineering_risk" | "taste";
  evidence: Evidence[];
  basis: {
    type: "spec" | "business" | "architecture" | "engineering";
    reference: string;
  };
  impact: string;
  recommendedFix: {
    approach: string;
    rationale: string;
    alternatives?: string[];
  };
}
```

Reviewer обязан предложить ожидаемый оптимальный способ исправления. Executor
может выбрать другой, если объясняет, почему он лучше.

Все defects/engineering risks, включая minor, исправляются. Taste допустим
только как non-blocking suggestion. PASS невозможен при открытом defect/risk.

Executor ставит только `fix_proposed`. Finding переводит в `resolved` исходный
reviewer, replacement той же роли либо technical adjudicator после проверки
candidate/evidence. Закрытая запись удаляется; findings не коммитятся и не
живут между features.

После двух бесплодных rebuttal turns оркестратор может вызвать fresh technical
adjudicator. Количество review rounds не ограничено и автоматически человеку не
эскалируется.

## E2E selection plan

До первого review E2E tester отдельным planning turn строит:

```ts
interface E2ESelectionPlan {
  schemaVersion: 1;
  commitOid: string;
  selectedScenarioIds: string[];
  selectionRationale: string;
  impactedBusinessLinks: string[];
  impactedTags: string[];
  planDigest: string;
}
```

Plan выводится из immutable spec, business links, E2E catalog/tags и candidate
diff. Оркестратор проверяет только schema/digest. Оба reviewers attest полноту
plan. Выбираются:

- все `always_required` scenarios;
- scenarios с затронутыми business links;
- scenarios с затронутыми tags/areas;
- дополнительные сценарии по рискам diff.

Минимум один scenario проекта имеет `always_required: true`.
Structured review result содержит
`selectionPlanVerdict: complete|incomplete`; reviewer PASS допустим только при
`complete`.

## E2E project contract

`docs/architecture/e2e.md` описывает environment, fixtures, execution,
cleanup/isolation, scenario anchors и failure interpretation. При отсутствии
оркестратор предлагает пользователю разрешить executor создать/настроить его.

`docs/architecture/e2e.json` имеет schema:

```json
{
  "schema_version": 1,
  "scenarios": [{
    "scenario_id": "E2E-CHECKOUT-01",
    "scenario_ref": "docs/architecture/e2e.md#e2e-checkout-01",
    "business_links": ["§B-CHECKOUT-01"],
    "always_required": true,
    "tags": ["checkout"],
    "last_run": {
      "snapshot_digest": "<digest>",
      "provenance_commit": "<oid>",
      "run_id": "<uuid>",
      "spec_sha256": "<digest>",
      "verified_at": "<RFC3339 UTC>",
      "status": "passed",
      "environment": "local:docker-compose"
    }
  }]
}
```

Статусы scenario: `passed|failed|blocked`. Registry не хранит screenshots, raw
logs и model reasoning.

## Execution and isolation

Smoke перед reviews ограничен build/boot/health. Heavy E2E начинается после
PASS обоих reviewers.

E2E tester работает в fresh detached worktree и не меняет tracked files.
Environment имеет уникальный namespace run/scenario и cleanup даже после
failure. Production запрещён без явного contract и подтверждения пользователя.

Результат содержит commit OID, snapshot digest, plan digest, selected IDs,
rationale, status/evidence каждого scenario и completion time.

## Stabilization

Review loop:

```text
two reviews → findings batch → executor fix → make qc → two reviews → …
```

E2E loop:

```text
selected E2E → failures batch → executor fix → make qc → selected E2E → …
```

Review не перезапускается после каждого мелкого E2E fix. После стабилизации E2E
review повторяется на итоговом snapshot. Если review fixes снова меняют
snapshot, E2E затем повторяется. Completion требует четыре PASS одного digest.

Если tester меняет selection plan, E2E сначала стабилизируется по новому plan,
затем оба reviewers повторно attest его полноту.

## Metadata guard

Snapshot digest включает весь tracked tree. Только
`e2e.json.scenarios[*].last_run` исключается через canonical projection;
scenario catalog остаётся attested.

После общего PASS executor обновляет `last_run`, выполняет
`make verify-e2e-metadata` и создаёт local metadata commit. Guard обязан
доказать:

- другие paths не менялись;
- catalog fields не менялись;
- projection digest совпадает с attested snapshot;
- metadata соответствует current `(run, spec, snapshot, scenario results)`.

Mandatory Git tags, receipts и separate completion report не создаются.

## Acceptance tests

- Reviewer timeout не позволяет пройти с одним review.
- Reviewers получают одинаковые digest/plan, но не findings друг друга.
- Finding нельзя закрыть executor-ом.
- Empty plan невозможен благодаря `always_required`.
- Catalog change после review инвалидирует snapshot.
- Изменение только `last_run` не меняет projection digest.
- E2E failures остаются видимы до следующего run.
- Один финальный digest имеет PASS QC, A, B и E2E.
