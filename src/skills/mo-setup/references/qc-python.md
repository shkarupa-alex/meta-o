# Python QC profile

Mature tools with a project-owned config. Nothing here is a Meta-O dependency,
and none of it is a checker this project wrote — the previous generation shipped
its own purpose, import-graph and code-health checkers, and they were deleted
because a bundled quality gate is one nobody owns and nobody repairs when it is
wrong for their codebase.

Preserve an existing stack. A brownfield project that already has a working type
checker and test runner keeps them if they give an equivalent outcome; churn is
not an outcome.

## Candidates

| Gate                  | Tool                        | Notes                                                                             |
| --------------------- | --------------------------- | --------------------------------------------------------------------------------- |
| format + lint         | **Ruff**                    | one tool for both; enable the doc and complexity rule sets that match the project |
| types                 | **mypy** or **Pyright**     | one of them is the type source of truth, not both                                 |
| tests                 | **pytest**                  |                                                                                   |
| boundaries and cycles | **Import Linter**           | contracts for layers, independence, forbidden edges                               |
| doc/purpose coverage  | **Interrogate**             | only at a threshold that is realistic; a 100% target buys ritual docstrings       |
| file size             | **Pylint `too-many-lines`** | only when a file-size gate is actually wanted                                     |
| dependency hygiene    | **Deptry**                  | only when there is a real dependency-hygiene problem                              |

**Greenfield minimum: Ruff + Pyright + pytest.** Everything else is added when
it has a reason.

## Wiring

```make
mo-lint:
	ruff format --check .
	ruff check .

mo-typecheck:
	pyright

mo-test:
	pytest

mo-qc: mo-lint mo-typecheck mo-test
```

Keep `ruff format` (rewrites) and `ruff format --check` (judges) separate. Only
the judging half may run inside `mo-qc`: a gate that rewrites what it is judging
is invalid rather than green.

```toml
# pyproject.toml — starting point, not a standard
[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "C90", "D", "RUF"]

[tool.ruff.lint.mccabe]
max-complexity = 10

[tool.pyright]
typeCheckingMode = "standard"

[tool.interrogate]
fail-under = 85
```

## Import Linter

This is the gate that replaces a home-grown import-graph checker. Contracts live
in `.importlinter` or `pyproject.toml` and are read by a reviewer, not just by
CI:

```ini
[importlinter]
root_package = myapp

[importlinter:contract:layers]
name = Layered architecture
type = layers
layers =
    myapp.api
    myapp.domain
    myapp.infra
```

If a contract has to be relaxed, that is a decision with a reason, and it belongs
in `docs/architecture/` — not in a silently widened ignore list.

## What not to do

- Do not raise a threshold, disable a rule, widen an exemption or re-freeze a
  baseline to make a candidate pass. That is the change a reviewer is explicitly
  looking for.
- Do not create a brownfield baseline automatically. A baseline is admitted only
  if adoption is otherwise practically impossible.
- Do not write a regex Markdown parser. If Markdown must be parsed
  programmatically, find a real AST library through `mo-reuse`.
