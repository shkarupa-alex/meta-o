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

from _common import Report, assert_discovered, discover_python_files, load_config, project_root, read_json, write_json

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


def definitions(tree: ast.AST, prefix: str = "") -> list[tuple[ast.AST, str]]:
    """§M-QC-CODE-HEALTH — Every class and function with its qualified name.

    Qualified, because the baseline is keyed on the symbol. Two functions in one
    file are two separate things to ratchet; collapsing them to the file name
    would let one frozen entry forgive every future violation in that file.
    """
    found: list[tuple[ast.AST, str]] = []
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            qualified = f"{prefix}.{node.name}" if prefix else node.name
            found.append((node, qualified))
            found.extend(definitions(node, qualified))
        else:
            found.extend(definitions(node, prefix))
    return found


def measure(path: Path, root: Path, config: dict, report: Report) -> dict[str, int]:
    """§M-QC-CODE-HEALTH — Measure one file and record every threshold it exceeds."""
    relative = str(path.relative_to(root))
    source = path.read_text(encoding="utf-8")
    measurements: dict[str, int] = {}

    def exceeded(node: ast.AST, symbol: str, rule: str, value: int, message: str) -> None:
        """§M-QC-CODE-HEALTH — Record one exceeded threshold under its own key."""
        report.add(path, getattr(node, "lineno", 1), rule, message, symbol)
        measurements[f"{relative}::{rule}::{symbol}"] = value

    lines = len(source.splitlines())
    if lines > int(config["max_file_lines"]):
        report.add(path, 1, "file-lines", f"{lines} lines exceeds {config['max_file_lines']}", "<module>")
        measurements[f"{relative}::file-lines::<module>"] = lines

    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        report.add(path, error.lineno or 1, "syntax", f"cannot parse: {error.msg}", "<module>")
        return measurements

    for node, symbol in definitions(tree):
        if isinstance(node, ast.ClassDef):
            size = span(node)
            if size > int(config["max_class_lines"]):
                exceeded(
                    node,
                    symbol,
                    "class-lines",
                    size,
                    f"class {symbol} spans {size} lines, over {config['max_class_lines']}",
                )
            continue

        size = span(node)
        if size > int(config["max_function_lines"]):
            exceeded(
                node,
                symbol,
                "function-lines",
                size,
                f"{symbol} spans {size} lines, over {config['max_function_lines']}",
            )

        score = complexity(node)
        if score > int(config["max_cyclomatic_complexity"]):
            exceeded(
                node,
                symbol,
                "complexity",
                score,
                f"{symbol} has complexity {score}, over {config['max_cyclomatic_complexity']}",
            )

        depth = nesting_depth(node)
        if depth > int(config["max_nesting_depth"]):
            exceeded(
                node,
                symbol,
                "nesting",
                depth,
                f"{symbol} nests {depth} deep, over {config['max_nesting_depth']}",
            )

    return measurements


def main() -> int:
    """§M-QC-CODE-HEALTH — Measure the tree, then apply the ratchet to what it found."""
    config = load_config("code_health", DEFAULTS)
    root = project_root()
    report = Report("code-health")

    found: dict[str, int] = {}
    roots = list(config["source_roots"])
    discovered = discover_python_files(root, roots)
    assert_discovered(report, root, roots, discovered)
    for path in discovered:
        found.update(measure(path, root, config, report))

    baseline_path = root / str(config["baseline"])
    baseline: dict[str, int] = read_json(baseline_path, default={}) or {}

    if "--write-baseline" in sys.argv:
        return write_baseline(baseline_path, baseline, found, config)

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

    for key in sorted(set(baseline) - set(found)):
        report.note(f"baseline entry {key} is now clean and can be removed")

    return report.finish()


def write_baseline(
    baseline_path: Path,
    baseline: dict[str, int],
    found: dict[str, int],
    config: dict,
) -> int:
    """§M-QC-CODE-HEALTH — Freeze the current measurements, honouring the ratchet.

    With `forbid_new_baseline_entries` set, freezing is allowed to *shrink* the
    debt and never to grow it. Without that rule the flag was decorative and the
    escape from any failing gate was one `--write-baseline` away, which turns a
    ratchet into a suggestion.

    Creating the *first* baseline is the exception, and the whole point of
    adoption: a brownfield project has to be able to record the debt it starts
    with. After that the file exists, and the ratchet only tightens.
    """
    if config["forbid_new_baseline_entries"] and baseline_path.is_file():
        added = sorted(set(found) - set(baseline))
        raised = sorted(key for key in set(found) & set(baseline) if found[key] > int(baseline[key]))
        if added or raised:
            for key in added:
                sys.stderr.write(f"refusing to freeze new violation {key}\n")
            for key in raised:
                sys.stderr.write(f"refusing to raise frozen {key} from {baseline[key]} to {found[key]}\n")
            sys.stderr.write(
                "forbid_new_baseline_entries is set; fix these or change the policy deliberately\n"
            )
            return 1

    write_json(baseline_path, found)
    sys.stdout.write(f"baseline written to {baseline_path} with {len(found)} entr(ies)\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
