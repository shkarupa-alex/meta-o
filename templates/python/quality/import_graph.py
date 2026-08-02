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

from _common import Report, assert_discovered, discover_python_files, load_config, project_root, read_json, write_json

DEFAULTS = {
    "source_roots": ["src"],
    "first_party_prefixes": [],
    "baseline": ".quality/import-graph-baseline.json",
    "layers": [],
    "independent": [],
    "forbidden_edges": [],
    "forbid_regressions": True,
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
    root: Path, source_roots: list[str], report: Report, prefixes: list[str]
) -> tuple[dict[str, set[str]], set[str], set[str], set[str]]:
    """§M-QC-IMPORT-GRAPH — Parse every source file into a module dependency graph.

    Returns the graph, the first-party module names, the modules that import
    themselves, and every import target that looked first-party but resolved to
    nothing. The last two are returned separately rather than folded into the
    graph: a self-edge would make Tarjan report a one-module component that the
    cycle rules are not written for, and an unresolved target is not an edge at
    all — it is a module the project claims to own and does not have.
    """
    files = discover_python_files(root, source_roots)
    names = {path: module_name(path, root, source_roots) for path in files}
    known = {name for name in names.values() if name}
    graph: dict[str, set[str]] = {name: set() for name in known}
    self_imports: set[str] = set()
    unresolved: set[str] = set()

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
            optional_base = False
            absolute = True
            if isinstance(node, ast.Import):
                targets = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                base = (
                    resolve_relative(name, node, path.name == "__init__.py")
                    if node.level
                    else (node.module or "")
                )
                # `from x import y` may import a submodule or a symbol. The
                # refinements are tried first; the base is only *required* to
                # exist if none of them did, so a namespace package with no
                # `__init__.py` is not reported as a missing module.
                refinements = [f"{base}.{alias.name}".strip(".") for alias in node.names]
                targets = [base, *refinements]
                optional_base = any(item in known for item in refinements)
                absolute = node.level == 0
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

            for index, target in enumerate(targets):
                # Exact, never nearest. Both `import a.b` and `from a.b import c`
                # give a fully-qualified *module* path, so walking the dotted
                # prefix down until something matched folded `myproject.missing`
                # back onto the package `myproject` — which made the "declared
                # first-party import that resolves to nothing" rule unreachable
                # in any layout with `__init__.py`, and invented an edge to the
                # package while it was there.
                resolved = target if target in known else None
                if resolved is None:
                    # A target under a declared first-party prefix that resolves
                    # to no module is a boundary the project asserted and does
                    # not honour — a rename left behind, or a module that only
                    # exists at runtime. A refinement that does not resolve is
                    # an ordinary symbol import and says nothing.
                    required = index == 0 and not (isinstance(node, ast.ImportFrom) and optional_base)
                    if required and is_first_party(target, prefixes):
                        unresolved.add(target)
                    continue
                if resolved != name:
                    graph[name].add(resolved)
                elif absolute:
                    # `from . import x` inside a package resolves to the package
                    # itself and is ordinary; only an absolute self-import is the
                    # circular definition the rule is about.
                    self_imports.add(name)

    return graph, known, self_imports, unresolved


def is_first_party(target: str, prefixes: list[str]) -> bool:
    """§M-QC-IMPORT-GRAPH — Whether an import names something the project claims to own."""
    return any(target == prefix or target.startswith(f"{prefix}.") for prefix in prefixes)


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


def fan(graph: dict[str, set[str]]) -> tuple[dict[str, int], dict[str, int]]:
    """§M-QC-IMPORT-GRAPH — Fan-out and fan-in of every module.

    Cycles are the loud structural failure; fan-in and fan-out are the quiet
    one. A module that quietly acquires twenty dependents is as hard to change
    as one in a cycle, and nothing in the cycle rules would ever notice it.
    """
    fan_out = {name: len(targets) for name, targets in graph.items()}
    fan_in = {name: 0 for name in graph}
    for targets in graph.values():
        for target in targets:
            fan_in[target] = fan_in.get(target, 0) + 1
    return fan_in, fan_out


def check_ratchet(
    report: Report,
    current: dict[str, int],
    frozen: dict[str, int],
    rule: str,
    forbid_regressions: bool,
) -> None:
    """§M-QC-IMPORT-GRAPH — Fail any module whose coupling grew beyond its baseline."""
    if not forbid_regressions:
        return
    for name in sorted(current):
        before = int(frozen.get(name, 0))
        if current[name] > before and name in frozen:
            report.add(name, 1, rule, f"{name} {rule} grew from {before} to {current[name]}")


def check_boundary(
    report: Report,
    known: set[str],
    unresolved: set[str],
    prefixes: list[str],
) -> None:
    """§M-QC-IMPORT-GRAPH — Every first-party module must be inside a declared prefix.

    A declared boundary that nothing checks is a comment. A discovered module
    belonging to none of the declared prefixes is either misplaced or the prefix
    list is stale — and either way the layering and independence contracts below
    are being applied to an incomplete picture.

    §40 states the FAIL unconditionally, so an empty prefix list is refused
    rather than treated as "no boundary to check". With no prefixes nothing is
    first-party, no import can be unresolved, and the gate reported `ok` for
    every possible project — the checker's own default made the requirement
    opt-in and then opted out.
    """
    if not prefixes:
        report.add(
            "pyproject.toml",
            1,
            "no-boundary",
            "[tool.meta_o.import_graph] declares no first_party_prefixes, so no module has a "
            "checkable boundary and no first-party import can be found dangling; declare the "
            "project's own top-level package names",
        )
        return
    for name in sorted(known):
        if not is_first_party(name, prefixes):
            report.add(
                name,
                1,
                "unknown-boundary",
                f"{name} matches no declared first_party_prefixes {prefixes}",
            )
    for target in sorted(unresolved):
        report.add(
            target,
            1,
            "unknown-boundary",
            f"{target} is declared first-party but resolves to no module in source_roots",
        )


def check_adoption_closure(
    report: Report,
    root: Path,
    source_roots: list[str],
    graph: dict[str, set[str]],
) -> None:
    """§M-QC-IMPORT-GRAPH — Adopted roots must be dependency-closed.

    §40's brownfield ratchet requires it, and nothing verified it: the manifest
    said "these roots are certified", meta-o fenced feature changes to them, and
    an adopted module was free to import a module nobody had certified. That is
    the boundary being widened by an import statement rather than by a reviewed
    adoption change — the certified code is only as trustworthy as what it calls.

    A project with no manifest, or one declaring `fully_adopted: true`, has
    nothing to close: everything is inside.

    Every way this check could quietly decline to run is now a violation rather
    than a silent pass: a manifest of the wrong shape, a `fully_adopted` that is
    not a boolean, a root that matches no file, and two files claiming one
    module name. Each of those returned `ok` about a boundary nobody had
    checked, which is the failure mode the whole gate exists to prevent.
    """
    path = root / ".quality/adoption-manifest.json"
    manifest = read_json(path, default=None)
    if manifest is None:
        return
    relative_manifest = str(path.relative_to(root))

    if not isinstance(manifest, dict):
        report.add(relative_manifest, 1, "invalid-manifest", "the adoption manifest must be an object")
        return
    fully = manifest.get("fully_adopted", False)
    if not isinstance(fully, bool):
        report.add(
            relative_manifest, 1, "invalid-manifest", "fully_adopted must be true or false"
        )
        return
    if fully:
        return

    declared = manifest.get("adopted_roots")
    if not isinstance(declared, list) or not declared:
        report.add(
            relative_manifest,
            1,
            "invalid-manifest",
            "adopted_roots must be a non-empty array of repository-relative paths",
        )
        return
    if any(not isinstance(item, str) or not item for item in declared):
        report.add(relative_manifest, 1, "invalid-manifest", "every adopted root must be a path")
        return
    # `./src/app` and `src/app/` name the same directory and neither matched.
    roots = [item.strip("/").removeprefix("./") for item in declared]

    files = discover_python_files(root, source_roots)
    paths: dict[str, list[Path]] = {}
    for file in files:
        paths.setdefault(module_name(file, root, source_roots), []).append(file)

    # Two files claiming one module name make every answer below ambiguous —
    # `src/x.py` adopted and `lib/x.py` not is one module that is both.
    for module, owners in sorted(paths.items()):
        if len(owners) > 1:
            report.add(
                str(owners[0].relative_to(root)),
                1,
                "ambiguous-module",
                f"{module} is claimed by {', '.join(str(o.relative_to(root)) for o in owners)}",
            )

    def inside(file: Path) -> bool:
        """§M-QC-IMPORT-GRAPH — Whether one file sits inside a certified root."""
        relative = str(file.relative_to(root))
        return any(relative == item or relative.startswith(f"{item}/") for item in roots)

    for index, item in enumerate(roots):
        if not any(inside(file) for file in files) or not any(
            str(file.relative_to(root)) == item or str(file.relative_to(root)).startswith(f"{item}/")
            for file in files
        ):
            report.add(
                relative_manifest,
                1,
                "unmatched-root",
                f"adopted_roots[{index}] {declared[index]!r} matches no discovered file; a root "
                "that names nothing certifies nothing",
            )

    def adopted(module: str) -> bool:
        """§M-QC-IMPORT-GRAPH — Whether every file claiming this module is certified."""
        owners = paths.get(module)
        return bool(owners) and all(inside(file) for file in owners)

    for module in sorted(graph):
        if not adopted(module):
            continue
        for target in sorted(graph[module]):
            # An import of `a.b` executes `a/__init__.py` too, so the closure
            # depends on every ancestor package, not only the leaf. Checking the
            # leaf alone let a certified module reach an uncertified package
            # body through one of its submodules.
            parts = target.split(".")
            reached = [".".join(parts[: index + 1]) for index in range(len(parts))]
            for name in reached:
                if name in paths and not adopted(name):
                    report.add(
                        str(paths[module][0].relative_to(root)),
                        1,
                        "closure-broken",
                        f"{module} is inside an adopted root and reaches {name}, which is not; "
                        f"adopt {name}'s root or stop depending on it",
                    )


def main() -> int:
    """§M-QC-IMPORT-GRAPH — Build the graph, apply the contracts, apply the ratchet."""
    config = load_config("import_graph", DEFAULTS)
    root = project_root()
    report = Report("import-graph")
    prefixes = [str(item) for item in config["first_party_prefixes"]]

    graph, known, self_imports, unresolved = build_graph(
        root, list(config["source_roots"]), report, prefixes
    )
    assert_discovered(
        report,
        root,
        list(config["source_roots"]),
        [Path(name) for name in sorted(known)],
    )

    check_contracts(graph, config, report)
    check_boundary(report, known, unresolved, prefixes)
    check_adoption_closure(report, root, list(config["source_roots"]), graph)

    components = [component for component in tarjan(graph) if len(component) > 1]
    fan_in, fan_out = fan(graph)

    for name in sorted(self_imports):
        report.add(name, 1, "self-import", f"{name} imports itself")

    baseline_path = root / str(config["baseline"])
    baseline = read_json(baseline_path, default={}) or {}
    known_cycles = {tuple(cycle) for cycle in baseline.get("cycles", [])}

    # The ratchet runs before the freeze branch, not after it: a coupling
    # regression is the single most likely reason someone reaches for
    # --write-baseline, so it has to be in the report the freeze consults.
    forbid = bool(config["forbid_regressions"])
    check_ratchet(report, fan_in, baseline.get("fan_in", {}), "fan-in", forbid)
    check_ratchet(report, fan_out, baseline.get("fan_out", {}), "fan-out", forbid)

    if "--write-baseline" in sys.argv:
        return write_baseline(baseline_path, baseline, components, fan_in, fan_out, config, report)

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

    return report.finish()


def write_baseline(
    baseline_path: Path,
    baseline: dict,
    components: list[list[str]],
    fan_in: dict[str, int],
    fan_out: dict[str, int],
    config: dict,
    report: Report,
) -> int:
    """§M-QC-IMPORT-GRAPH — Freeze the structure, refusing to freeze new cycles.

    As with code health, the first baseline records whatever debt the project
    starts with; after that, freezing may only record improvement. Otherwise the
    documented way past a failing structural gate is to re-freeze it.

    Any violation already in the report — a forbidden edge, a layering breach,
    an unresolved first-party import, a self-import, a coupling number that grew
    past what was frozen — blocks the freeze. The first two kinds have no frozen
    form to take at all; the last has one, and re-freezing it is precisely the
    escape this ratchet exists to close. Writing the file anyway would exit 0
    while printing none of them, which is how a project comes to believe a
    structural contract holds that never did.
    """
    if report.violations:
        sys.stderr.write(
            f"refusing to freeze {baseline_path}: the graph contract is violated, "
            "and a baseline can forgive cycles and coupling but not these\n"
        )
        return report.finish()

    if config["forbid_regressions"] and baseline_path.is_file():
        added = [
            component
            for component in components
            if tuple(component) not in {tuple(cycle) for cycle in baseline.get("cycles", [])}
        ]
        if added:
            for component in added:
                sys.stderr.write(f"refusing to freeze new cycle {' → '.join(component)}\n")
            return 1

    write_json(
        baseline_path,
        {
            "cycles": [list(component) for component in components],
            "fan_in": fan_in,
            "fan_out": fan_out,
        },
    )
    sys.stdout.write(f"baseline written to {baseline_path} with {len(components)} cycle(s)\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
