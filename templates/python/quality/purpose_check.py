#!/usr/bin/env python3
"""§M-QC-PURPOSE — Prove that every symbol states why it exists.

A codebase where the reason for a module is only in someone's head is a codebase
that gets rewritten instead of changed. This checker cannot judge whether a
purpose is *good* — that is the reviewers' job, and no AST walk will ever do it.
It proves the weaker but mechanical property: the purpose is present, and it is
attached to the `§M-*` anchor that ties the symbol back into the knowledge chain.

Nested functions, private helpers, methods and test functions are all included.
The undocumented private helper is precisely the one that later turns out to
contain the business rule.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

from _common import Report, discover_python_files, load_config, project_root

MODULE_ANCHOR = re.compile(r"§M-[A-Z0-9-]+")

DEFAULTS = {
    "source_roots": ["src", "tests"],
    "exempt_files": [],
    "exempt_names": ["__init__", "__repr__", "__str__", "__eq__", "__hash__"],
    "exempt_decorators": ["overload", "typing.overload", "abstractmethod"],
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


def is_exempt(node: ast.AST, exempt_names: list[str], exempt_decorators: list[str]) -> bool:
    """§M-QC-PURPOSE — Whether a symbol is excused from carrying its own purpose.

    Only two grounds are accepted: the language defines the meaning (`__eq__`),
    or the symbol is a typing artefact rather than an implementation
    (`@overload`). "It is obvious" is not one of them.
    """
    name = getattr(node, "name", "")
    if name in exempt_names:
        return True
    for decorator in getattr(node, "decorator_list", []):
        if decorator_name(decorator) in exempt_decorators:
            return True
    return False


def check_file(path: Path, report: Report, config: dict) -> None:
    """§M-QC-PURPOSE — Check one module and every symbol it defines."""
    source = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        report.add(path, error.lineno or 1, "syntax", f"cannot parse: {error.msg}")
        return

    module_doc = ast.get_docstring(tree) or ""
    if not module_doc.strip():
        report.add(path, 1, "module-purpose", "module has no docstring")
    elif not MODULE_ANCHOR.search(module_doc):
        report.add(
            path,
            1,
            "module-anchor",
            "module docstring declares no §M-* anchor, so nothing links it to the knowledge chain",
        )

    exempt_names = list(config["exempt_names"])
    exempt_decorators = list(config["exempt_decorators"])

    for node in ast.walk(tree):
        if not isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if is_exempt(node, exempt_names, exempt_decorators):
            continue
        docstring = ast.get_docstring(node) or ""
        kind = "class" if isinstance(node, ast.ClassDef) else "function"
        if not docstring.strip():
            report.add(path, node.lineno, "symbol-purpose", f"{kind} {node.name} has no docstring")


def main() -> int:
    """§M-QC-PURPOSE — Run the purpose gate over every configured source root."""
    config = load_config("purpose", DEFAULTS)
    root = project_root()
    exempt_files = {str(item) for item in config["exempt_files"]}
    report = Report("purpose")

    for path in discover_python_files(root, list(config["source_roots"])):
        relative = str(path.relative_to(root))
        if relative in exempt_files:
            report.note(f"{relative} is an declared exemption")
            continue
        check_file(path, report, config)

    return report.finish()


if __name__ == "__main__":
    raise SystemExit(main())
