#!/usr/bin/env python3
"""§M-QC-CODE-HEALTH — Hold the line on size, nesting and branching complexity.

None of these numbers is a truth about software. They are a truth about
attention: past a certain size a function stops being read and starts being
skimmed, and the bug that hides there is found in production. The thresholds are
therefore the project's to choose — this gate only makes the choice explicit and
keeps the codebase from drifting past it one commit at a time.

The ratchet exists for brownfield adoption. Legacy violations can be frozen, but
only downwards: a baselined value may improve or disappear, never grow, and a
file that was clean may not become dirty.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

from _common import Report, discover_python_files, load_config, project_root, read_json, write_json

DEFAULTS = {
    "source_roots": ["src", "tests"],
    "max_file_lines": 600,
    "max_class_lines": 300,
    "max_function_lines": 60,
    "max_cyclomatic_complexity": 10,
    "max_nesting_depth": 4,
    "baseline": ".quality/code-health-baseline.json",
    "forbid_new_baseline_entries": True,
    "forbid_regressions": True,
}

BRANCHING = (
    ast.If,
    ast.For,
    ast.AsyncFor,
    ast.While,
    ast.ExceptHandler,
    ast.With,
    ast.AsyncWith,
    ast.Assert,
    ast.IfExp,
    ast.Match,
)

NESTING = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.With, ast.AsyncWith, ast.Try, ast.Match)


def span(node: ast.AST) -> int:
    """§M-QC-CODE-HEALTH — Line count of a definition, decorators excluded."""
    end = getattr(node, "end_lineno", None) or getattr(node, "lineno", 0)
    return int(end) - int(getattr(node, "lineno", end)) + 1


def complexity(node: ast.AST) -> int:
    """§M-QC-CODE-HEALTH — Cyclomatic complexity: one plus every decision point.

    Boolean operators count each additional operand, because `a and b and c` is
    three ways to leave the expression, not one.
    """
    score = 1
    for child in ast.walk(node):
        if isinstance(child, BRANCHING):
            score += 1
        elif isinstance(child, ast.BoolOp):
            score += len(child.values) - 1
        elif isinstance(child, ast.comprehension):
            score += 1 + len(child.ifs)
    return score


def nesting_depth(node: ast.AST, depth: int = 0) -> int:
    """§M-QC-CODE-HEALTH — Deepest block nesting inside a definition."""
    deepest = depth
    for child in ast.iter_child_nodes(node):
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        step = depth + 1 if isinstance(child, NESTING) else depth
        deepest = max(deepest, nesting_depth(child, step))
    return deepest


def measure(path: Path, root: Path, config: dict, report: Report) -> dict[str, int]:
    """§M-QC-CODE-HEALTH — Measure one file and record every threshold it exceeds."""
    relative = str(path.relative_to(root))
    source = path.read_text(encoding="utf-8")
    measurements: dict[str, int] = {}

    lines = len(source.splitlines())
    if lines > int(config["max_file_lines"]):
        report.add(path, 1, "file-lines", f"{lines} lines exceeds {config['max_file_lines']}")
        measurements[f"{relative}::file-lines"] = lines

    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        report.add(path, error.lineno or 1, "syntax", f"cannot parse: {error.msg}")
        return measurements

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            size = span(node)
            if size > int(config["max_class_lines"]):
                report.add(
                    path,
                    node.lineno,
                    "class-lines",
                    f"class {node.name} spans {size} lines, over {config['max_class_lines']}",
                )
                measurements[f"{relative}::class-lines"] = size

        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            size = span(node)
            if size > int(config["max_function_lines"]):
                report.add(
                    path,
                    node.lineno,
                    "function-lines",
                    f"{node.name} spans {size} lines, over {config['max_function_lines']}",
                )
                measurements[f"{relative}::function-lines"] = size

            score = complexity(node)
            if score > int(config["max_cyclomatic_complexity"]):
                report.add(
                    path,
                    node.lineno,
                    "complexity",
                    f"{node.name} has complexity {score}, over {config['max_cyclomatic_complexity']}",
                )
                measurements[f"{relative}::complexity"] = score

            depth = nesting_depth(node)
            if depth > int(config["max_nesting_depth"]):
                report.add(
                    path,
                    node.lineno,
                    "nesting",
                    f"{node.name} nests {depth} deep, over {config['max_nesting_depth']}",
                )
                measurements[f"{relative}::nesting"] = depth

    return measurements


def main() -> int:
    """§M-QC-CODE-HEALTH — Measure the tree, then apply the ratchet to what it found."""
    config = load_config("code_health", DEFAULTS)
    root = project_root()
    report = Report("code-health")

    found: dict[str, int] = {}
    for path in discover_python_files(root, list(config["source_roots"])):
        found.update(measure(path, root, config, report))

    baseline_path = root / str(config["baseline"])
    if "--write-baseline" in sys.argv:
        write_json(baseline_path, found)
        sys.stdout.write(f"baseline written to {baseline_path} with {len(found)} entr(ies)\n")
        return 0

    baseline: dict[str, int] = read_json(baseline_path, default={}) or {}

    # Anything the baseline forgives stops being a violation — but only at a
    # value no worse than the one that was frozen.
    forgiven: list[str] = []
    for violation in list(report.violations):
        key = violation.key()
        if key not in baseline:
            continue
        current, frozen = found.get(key, 0), int(baseline[key])
        if config["forbid_regressions"] and current > frozen:
            violation.message = f"{violation.message}; baseline froze this at {frozen}"
            continue
        forgiven.append(key)
        report.violations.remove(violation)

    if forgiven:
        report.note(f"{len(forgiven)} pre-existing violation(s) tolerated by {config['baseline']}")

    if config["forbid_new_baseline_entries"]:
        for key in sorted(set(baseline) - set(found)):
            report.note(f"baseline entry {key} is now clean and can be removed")

    return report.finish()


if __name__ == "__main__":
    raise SystemExit(main())
