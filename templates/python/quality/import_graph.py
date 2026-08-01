#!/usr/bin/env python3
"""§M-QC-IMPORT-GRAPH — Keep the dependency structure from quietly rotting.

Architecture erodes one import at a time, and every individual one looks
reasonable in review. This gate makes the structural consequence visible: a new
strongly connected component of more than one module means two modules now need
each other, which is a decision that should have been made deliberately.

The graph is built from the standard-library `ast`, so it sees exactly what
Python will import — including relative imports and literal
`importlib.import_module("x")`. Non-literal dynamic imports cannot be resolved
statically and are reported as warnings rather than pretended away.

Cycles are found with Tarjan's algorithm, iteratively: a recursive walk would
blow the stack on precisely the large, tangled codebase that needs this gate
most.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

from _common import Report, discover_python_files, load_config, project_root, read_json, write_json

DEFAULTS = {
    "source_roots": ["src"],
    "first_party_prefixes": [],
    "baseline": ".quality/import-graph-baseline.json",
    "layers": [],
    "independent": [],
    "forbidden_edges": [],
}


def module_name(path: Path, root: Path, source_roots: list[str]) -> str:
    """§M-QC-IMPORT-GRAPH — Map a file path to the module name Python will use.

    A `src/` layout means the import name is *not* the path from the repository
    root; getting this wrong would make every first-party module look
    third-party and silently disable the boundary check.
    """
    relative = path.resolve().relative_to(root)
    parts = list(relative.parts)
    for source_root in source_roots:
        prefix = Path(source_root).parts
        if tuple(parts[: len(prefix)]) == prefix:
            parts = parts[len(prefix) :]
            break
    if parts and parts[-1] == "__init__.py":
        parts = parts[:-1]
    elif parts:
        parts[-1] = parts[-1][: -len(".py")]
    return ".".join(parts)


def resolve_relative(current: str, node: ast.ImportFrom, is_package: bool) -> str:
    """§M-QC-IMPORT-GRAPH — Resolve `from ..x import y` against the importing module.

    Whether the importing file is a package matters: inside `pkg/__init__.py` a
    single dot means `pkg` itself, while inside `pkg/mod.py` it means `pkg`, one
    level up from `pkg.mod`. Collapsing the two cases silently misattributes
    every relative import in a package, which is how a cycle hides.
    """
    parts = current.split(".") if current else []
    strip = node.level - 1 if is_package else node.level
    base = parts[: len(parts) - strip] if strip > 0 else list(parts)
    if node.module:
        base = [*base, *node.module.split(".")]
    return ".".join(part for part in base if part)


def literal_dynamic_import(node: ast.Call) -> str | None:
    """§M-QC-IMPORT-GRAPH — Extract the target of a literal dynamic import, if any."""
    name = ""
    if isinstance(node.func, ast.Name):
        name = node.func.id
    elif isinstance(node.func, ast.Attribute):
        name = node.func.attr
    if name not in {"import_module", "__import__"}:
        return None
    if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
        return node.args[0].value
    return None


def build_graph(
    root: Path, source_roots: list[str], report: Report
) -> tuple[dict[str, set[str]], set[str]]:
    """§M-QC-IMPORT-GRAPH — Parse every source file into a module dependency graph."""
    files = discover_python_files(root, source_roots)
    names = {path: module_name(path, root, source_roots) for path in files}
    known = {name for name in names.values() if name}
    graph: dict[str, set[str]] = {name: set() for name in known}

    for path, name in names.items():
        if not name:
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError as error:
            report.add(path, error.lineno or 1, "syntax", f"cannot parse: {error.msg}")
            continue

        for node in ast.walk(tree):
            targets: list[str] = []
            if isinstance(node, ast.Import):
                targets = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                base = (
                    resolve_relative(name, node, path.name == "__init__.py")
                    if node.level
                    else (node.module or "")
                )
                # `from x import y` may import a submodule or a symbol; offering
                # both to the resolver lets it pick whichever the project owns.
                targets = [base, *(f"{base}.{alias.name}".strip(".") for alias in node.names)]
            elif isinstance(node, ast.Call):
                literal = literal_dynamic_import(node)
                if literal:
                    targets = [literal]
                elif isinstance(node.func, (ast.Name, ast.Attribute)):
                    called = node.func.id if isinstance(node.func, ast.Name) else node.func.attr
                    if called in {"import_module", "__import__"}:
                        report.note(
                            f"{path.relative_to(root)}:{node.lineno}: non-literal dynamic import "
                            "cannot be resolved statically; review it by hand"
                        )

            for target in targets:
                resolved = nearest_known(target, known)
                if resolved and resolved != name:
                    graph[name].add(resolved)

    return graph, known


def nearest_known(target: str, known: set[str]) -> str | None:
    """§M-QC-IMPORT-GRAPH — Attribute an import to the first-party module it reaches.

    `from a.b.c import d` may name a module, a package or a symbol inside one;
    walking the dotted prefix down to a module the project actually owns is what
    turns all three into the same edge.
    """
    parts = target.split(".")
    while parts:
        candidate = ".".join(parts)
        if candidate in known:
            return candidate
        parts.pop()
    return None


def tarjan(graph: dict[str, set[str]]) -> list[list[str]]:
    """§M-QC-IMPORT-GRAPH — Strongly connected components, iteratively.

    Iterative on purpose: the codebases where this gate earns its keep are
    exactly the ones deep enough to exceed the recursion limit.
    """
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    components: list[list[str]] = []
    counter = 0

    for start in sorted(graph):
        if start in index:
            continue
        work: list[tuple[str, list[str]]] = [(start, sorted(graph.get(start, ())))]
        index[start] = low[start] = counter
        counter += 1
        stack.append(start)
        on_stack.add(start)

        while work:
            node, successors = work[-1]
            if successors:
                successor = successors.pop()
                if successor not in index:
                    index[successor] = low[successor] = counter
                    counter += 1
                    stack.append(successor)
                    on_stack.add(successor)
                    work.append((successor, sorted(graph.get(successor, ()))))
                elif successor in on_stack:
                    low[node] = min(low[node], index[successor])
                continue

            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
            if low[node] == index[node]:
                component: list[str] = []
                while True:
                    member = stack.pop()
                    on_stack.discard(member)
                    component.append(member)
                    if member == node:
                        break
                components.append(sorted(component))

    return components


def layer_of(module: str, layers: list[str]) -> int | None:
    """§M-QC-IMPORT-GRAPH — Which declared layer a module belongs to, if any."""
    for position, prefix in enumerate(layers):
        if module == prefix or module.startswith(f"{prefix}."):
            return position
    return None


def check_contracts(graph: dict[str, set[str]], config: dict, report: Report) -> None:
    """§M-QC-IMPORT-GRAPH — Enforce layering, independence and forbidden edges."""
    layers = [str(item) for item in config["layers"]]
    forbidden = {tuple(str(item).split("->")) for item in config["forbidden_edges"]}
    forbidden = {(left.strip(), right.strip()) for left, right in forbidden if right}

    for source, targets in sorted(graph.items()):
        for target in sorted(targets):
            if (source, target) in forbidden:
                report.add(source, 1, "forbidden-edge", f"{source} must not import {target}")

            if layers:
                here, there = layer_of(source, layers), layer_of(target, layers)
                if here is not None and there is not None and there < here:
                    report.add(
                        source,
                        1,
                        "layer-violation",
                        f"{source} (layer {layers[here]}) imports {target} (layer {layers[there]}), "
                        "which sits above it",
                    )

    for pair in config["independent"]:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            continue
        left, right = str(pair[0]), str(pair[1])
        for source, targets in graph.items():
            in_left = layer_of(source, [left]) is not None
            in_right = layer_of(source, [right]) is not None
            for target in targets:
                if in_left and layer_of(target, [right]) is not None:
                    report.add(source, 1, "independence", f"{left} and {right} must not depend on each other")
                if in_right and layer_of(target, [left]) is not None:
                    report.add(source, 1, "independence", f"{left} and {right} must not depend on each other")


def main() -> int:
    """§M-QC-IMPORT-GRAPH — Build the graph, apply the contracts, apply the ratchet."""
    config = load_config("import_graph", DEFAULTS)
    root = project_root()
    report = Report("import-graph")

    graph, known = build_graph(root, list(config["source_roots"]), report)
    if not known:
        report.note("no first-party modules were discovered; check source_roots")

    check_contracts(graph, config, report)

    components = [component for component in tarjan(graph) if len(component) > 1]
    self_cycles = sorted(name for name, targets in graph.items() if name in targets)

    baseline_path = root / str(config["baseline"])
    baseline = read_json(baseline_path, default={"cycles": []}) or {"cycles": []}
    known_cycles = {tuple(cycle) for cycle in baseline.get("cycles", [])}

    if "--write-baseline" in sys.argv:
        write_json(baseline_path, {"cycles": [list(component) for component in components]})
        sys.stdout.write(f"baseline written to {baseline_path} with {len(components)} cycle(s)\n")
        return 0

    for component in components:
        if tuple(component) in known_cycles:
            report.note(f"pre-existing cycle tolerated by the baseline: {' → '.join(component)}")
            continue
        report.add(
            component[0],
            1,
            "new-cycle",
            f"new import cycle of {len(component)} modules: {' → '.join(component)}",
        )

    for name in self_cycles:
        report.add(name, 1, "self-import", f"{name} imports itself")

    return report.finish()


if __name__ == "__main__":
    raise SystemExit(main())
