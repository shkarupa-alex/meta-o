#!/usr/bin/env python3
"""§M-QC-PURPOSE — Prove that every symbol states why it exists.

A codebase where the reason for a module is only in someone's head is a codebase
that gets rewritten instead of changed. This checker cannot judge whether a
purpose is *good* — that is the reviewers' job, and no AST walk will ever do it.
It proves the weaker but mechanical property: the purpose is present, and it is
attached to the `§M-*` anchor that ties the symbol back into the knowledge chain.

Nested functions, private helpers, methods, dunders and test functions are all
included. The undocumented private helper is precisely the one that later turns
out to contain the business rule, and `__eq__` is precisely the dunder whose
notion of equality nobody can reconstruct a year later.

Exactly three grounds excuse a symbol, and all three are declared rather than
inferred: the file is generated, the file is vendored, or the definition is an
`@overload` typing artefact with no body to explain. "It is obvious" and "it is
short" are not among them.
"""

from __future__ import annotations

import ast
import re
from fnmatch import fnmatch
from pathlib import Path

from _common import Report, discover_python_files, load_config, project_root

MODULE_ANCHOR = re.compile(r"§M-[A-Z0-9-]+")

DEFAULTS = {
    "source_roots": ["src", "tests"],
    "exempt_files": [],
    "exempt_decorators": ["overload", "typing.overload"],
}


def decorator_name(node: ast.expr) -> str:
    """§M-QC-PURPOSE — Render a decorator expression as a dotted name."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return f"{decorator_name(node.value)}.{node.attr}"
    if isinstance(node, ast.Call):
        return decorator_name(node.func)
    return ""


def is_exempt(node: ast.AST, exempt_decorators: list[str]) -> bool:
    """§M-QC-PURPOSE — Whether a symbol is excused from carrying its own purpose.

    Only the declared decorator exemption applies here: an `@overload` stub is a
    signature, not an implementation, and has nothing of its own to explain. Name
    based exemptions are deliberately absent — the moment `__init__` is excused,
    the constructor that decides what the object *means* stops being documented.
    """
    for decorator in getattr(node, "decorator_list", []):
        if decorator_name(decorator) in exempt_decorators:
            return True
    return False


def qualify(tree: ast.AST) -> list[tuple[ast.AST, str]]:
    """§M-QC-PURPOSE — Every class and function with its qualified name.

    Qualified so that a violation names `Registry.load` rather than `load`, which
    matters as soon as a file defines the same short name twice.
    """
    found: list[tuple[ast.AST, str]] = []
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            found.append((node, node.name))
            found.extend((child, f"{node.name}.{name}") for child, name in qualify(node))
        else:
            found.extend(qualify(node))
    return found


def check_file(path: Path, report: Report, config: dict) -> None:
    """§M-QC-PURPOSE — Check one module and every symbol it defines."""
    source = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        report.add(path, error.lineno or 1, "syntax", f"cannot parse: {error.msg}")
        return

    module_doc = ast.get_docstring(tree) or ""
    anchors = MODULE_ANCHOR.findall(module_doc)
    if not module_doc.strip():
        report.add(path, 1, "module-purpose", "module has no docstring", "<module>")
    elif not anchors:
        report.add(
            path,
            1,
            "module-anchor",
            "module docstring declares no §M-* anchor, so nothing links it to the knowledge chain",
            "<module>",
        )

    exempt_decorators = list(config["exempt_decorators"])

    for node, symbol in qualify(tree):
        if is_exempt(node, exempt_decorators):
            continue
        kind = "class" if isinstance(node, ast.ClassDef) else "function"
        docstring = ast.get_docstring(node) or ""
        line = getattr(node, "lineno", 1)
        if not docstring.strip():
            report.add(path, line, "symbol-purpose", f"{kind} {symbol} has no docstring", symbol)
            continue
        # The link is the point. A docstring that restates the signature in prose
        # documents nothing; one that names the module anchor states which part of
        # the architecture the symbol serves, and that claim is checkable — the
        # anchor has to exist and to resolve upwards through §A to §B.
        if anchors and not any(anchor in docstring for anchor in anchors):
            report.add(
                path,
                line,
                "symbol-anchor",
                f"{kind} {symbol} cites no §M-* anchor of its module ({', '.join(anchors)})",
                symbol,
            )


def main() -> int:
    """§M-QC-PURPOSE — Run the purpose gate over every configured source root."""
    config = load_config("purpose", DEFAULTS)
    root = project_root()
    patterns = [str(item) for item in config["exempt_files"]]
    report = Report("purpose")

    for path in discover_python_files(root, list(config["source_roots"])):
        relative = str(path.relative_to(root))
        # Globs, because generated and vendored trees are directories, and a
        # literal per-file list of them stops covering the tree the first time
        # the generator emits a file nobody remembered to add to the list.
        matched = next((pattern for pattern in patterns if fnmatch(relative, pattern)), None)
        if matched is not None:
            report.note(f"{relative} is exempt by declared pattern {matched}")
            continue
        check_file(path, report, config)

    return report.finish()


if __name__ == "__main__":
    raise SystemExit(main())
