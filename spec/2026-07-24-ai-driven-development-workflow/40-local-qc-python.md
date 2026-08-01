# 40 — Local QC and Python profile

## Purpose

Этот документ задаёт обязательный project-owned QC contract и конкретный
стартовый профиль для Python. Нормативный источник:
[master-spec §9–§10](./2026-07-24-ai-driven-development-workflow-council-brainstorm.md#9-mechanical-knowledge-checks).

## Authority boundary

Workflow должен полностью работать без CI. Единственный обязательный
authoritative entry point:

```bash
make qc
```

`Makefile`, tool configs и QC implementation — tracked часть проекта. Skills не
бандлят language-specific lint/test/build implementation; они задают contract,
best practices и помогают executor настроить проект после разрешения
пользователя.

## Make targets

Рекомендуемый public contract:

```text
make format
make lint
make typecheck
make test
make build
make smoke
make e2e
make verify-e2e-metadata
make qc
```

Отдельный target может отсутствовать, если неприменим. `make qc` обязателен,
non-mutating и агрегирует все релевантные blocking gates. Missing tool,
unexpected skip, mutated worktree или non-zero child command дают FAIL.

## Manifest and result

Tracked `.quality/qc-manifest.json` перечисляет gate IDs, commands и
`passed|not_applicable` policy. Python minimum:

```text
format-check
lint
typecheck-policy
tests
build-policy
purpose
knowledge
import-graph
code-health
e2e-metadata
```

Оркестратор задаёт `META_O_QC_RESULT` внутри external run directory.
`make qc` атомарно пишет machine-readable result:

```json
{
  "schema_version": 1,
  "snapshot_digest": "<digest>",
  "gates": [{
    "id": "lint",
    "status": "passed",
    "command": "ruff check .",
    "tool_version": "ruff …",
    "duration_ms": 1234
  }]
}
```

Общий PASS допустим, только если каждый manifest ID имеет `passed` либо заранее
reviewed `not_applicable`. Удаление gate, расширение exemption, ослабление
command/config или baseline относительно `baseRevision` требует решения
пользователя.

## Python starter profile

- Ruff format `--check` и lint;
- mypy либо pyright согласно policy проекта;
- pytest плюс project integration tests;
- Import Linter contracts;
- project-owned AST purpose checker;
- project-owned knowledge/E2E metadata checker;
- file/class/function size, nesting и regression ratchet;
- build/package check, если есть distributable artifact.

Проект обязан явно принять или изменить стартовые thresholds:

```toml
[tool.meta_o.code_health]
source_roots = ["src", "tests"]
max_file_lines = 600
max_class_lines = 300
max_function_lines = 60
max_cyclomatic_complexity = 10
max_nesting_depth = 4
baseline = ".quality/code-health-baseline.json"
forbid_new_baseline_entries = true
forbid_regressions = true
```

Это starter values, не универсальные истины. Effective values и baseline
сравниваются с `baseRevision`; ослабление блокируется до решения пользователя.

## Import graph algorithm

1. Discover `.py` только под configured `source_roots`.
2. Map paths в module names с project namespace-package policy.
3. Parse stdlib `ast`; syntax error блокирует gate.
4. Добавить edges `Import`/`ImportFrom`, включая relative imports.
5. Добавить literal `importlib.import_module("x")` и `__import__("x")`;
   non-literal dynamic imports записать в reviewed warning list.
6. Отделить third-party и проверить boundary membership каждого first-party
   module.
7. Проверить forbidden/layer/independence contracts.
8. Вычислить SCC алгоритмом Tarjan.
9. Запретить новую SCC размера `>1`, self-cycle, forbidden edge или regression
   fan-in/fan-out относительно baseline.

Unknown first-party boundary даёт FAIL.

## Purpose checker

AST traversal проверяет:

- module docstring;
- каждый `ClassDef`;
- каждый `FunctionDef`/`AsyncFunctionDef`, включая nested/private/method/dunder;
- tests как first-party;
- ссылку symbol → `§M-*`;
- declared исключения generated/vendor/overload.

Lambda/comprehension не считаются symbols. Checker доказывает наличие/link, но
не качество формулировки; это обязанность reviewers.

## Knowledge and E2E metadata checker

Markdown parser извлекает heading anchors по grammar `§B-*`, `§A-*`, `§M-*`.
Он проверяет uniqueness, dangling references и ближайшую causal link:

```text
§A → §B
§M → §A
symbol → §M
```

E2E checker валидирует JSON schema, unique scenario IDs, `scenario_ref`,
existing business links, минимум один `always_required` и field-level metadata
guard.

## Brownfield ratchet

Legacy structural metrics можно зафиксировать, но:

- новая baseline entry запрещена;
- существующее значение нельзя ухудшить;
- новый cycle/SCC запрещён;
- purpose baseline запрещён;
- adopted roots dependency-closed.

## Where gates run

| Placement | Policy |
|---|---|
| pre-commit | Optional fast format/basic lint |
| `make qc` | Обязательный полный authoritative gate |
| pre-push | Optional полный дубль |
| CI | Optional командный дубль; не источник истины |

Agent commits не должны автоматически запускать тяжёлый hook, провоцирующий
`--no-verify`. Push выполняет пользователь.

## Acceptance fixtures

QC project обязан иметь fixtures/tests, доказывающие:

- missing tool и silent skip дают FAIL;
- formatter mutation делает gate invalid;
- duplicate/dangling anchor обнаруживается;
- undocumented private/nested/test symbol обнаруживается;
- relative и literal dynamic imports образуют edges;
- новый cycle и unknown boundary блокируются;
- threshold/baseline weakening обнаруживается;
- отсутствующий manifest result не даёт false PASS;
- изменение E2E catalog после attestation обнаруживается.

