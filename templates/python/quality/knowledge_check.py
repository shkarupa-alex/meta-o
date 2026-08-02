#!/usr/bin/env python3
"""§M-QC-KNOWLEDGE — Prove the `§B → §A → §M` chain still holds.

Knowledge that drifts from the code is worse than no knowledge: it is confidently
wrong, and it is read by people making decisions. This gate cannot tell whether a
business truth is true, but it can tell whether the chain is intact — anchors
unique, references resolvable, and each level citing the level immediately above
it rather than reaching past it.

The "nearest level" rule is the one that matters. A module that cites a business
anchor directly has skipped the architecture decision that connects them, and
that decision is exactly what a future change needs to find.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field
from pathlib import Path

from _common import Report, discover_python_files, load_config, project_root

BUSINESS = re.compile(r"§B-[A-Z0-9-]+")
ARCHITECTURE = re.compile(r"§A-[A-Z0-9-]+")
MODULE = re.compile(r"§M-[A-Z0-9-]+")
ANY_ANCHOR = re.compile(r"§[BAM]-[A-Z0-9-]+")
HEADING = re.compile(r"^#{1,6}\s+(§[BAM]-[A-Z0-9-]+)")
FENCE = re.compile(r"^\s*(```|~~~)")

DEFAULTS = {
    "business": "docs/knowledge/business.md",
    "glossary": "docs/knowledge/glossary.md",
    "architecture_dir": "docs/knowledge/architecture",
    "source_roots": ["src"],
}


@dataclass
class Section:
    """§M-QC-KNOWLEDGE — One anchored section of a knowledge document."""

    anchor: str
    path: str
    line: int
    references: set[str] = field(default_factory=set)


def parse_document(path: Path, relative: str) -> list[Section]:
    """§M-QC-KNOWLEDGE — Extract anchored sections from one Markdown document.

    Only headings define anchors. A mention in prose is a reference, and a
    mention inside a fenced block is an example — treating either as a
    definition would let a tutorial silently satisfy the uniqueness check.
    """
    sections: list[Section] = []
    current: Section | None = None
    fenced = False

    for number, text in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if FENCE.match(text):
            fenced = not fenced
            continue
        if fenced:
            continue

        heading = HEADING.match(text)
        if heading:
            current = Section(anchor=heading.group(1), path=relative, line=number)
            sections.append(current)
            continue
        if current is not None:
            current.references.update(ANY_ANCHOR.findall(text))

    for section in sections:
        section.references.discard(section.anchor)
    return sections


def collect_documents(root: Path, config: dict) -> list[tuple[Path, str]]:
    """§M-QC-KNOWLEDGE — List every knowledge document the gate reads."""
    documents: list[tuple[Path, str]] = []
    for key in ("business", "glossary"):
        path = root / str(config[key])
        if path.is_file():
            documents.append((path, str(config[key])))

    architecture = root / str(config["architecture_dir"])
    if architecture.is_dir():
        for path in sorted(architecture.rglob("*.md")):
            documents.append((path, str(path.relative_to(root))))
    return documents


def docstring_line(tree: ast.Module) -> int:
    """§M-QC-KNOWLEDGE — Line the module docstring starts on, for a jumpable report."""
    body = getattr(tree, "body", [])
    if body and isinstance(body[0], ast.Expr):
        return int(getattr(body[0], "lineno", 1))
    return 1


def module_anchors(root: Path, source_roots: list[str], report: Report) -> list[Section]:
    """§M-QC-KNOWLEDGE — Read each module's `§M-*` anchor and what it cites.

    Returned as sections rather than a dict keyed on the anchor: the anchor is
    what may be duplicated, so it cannot also be the identity that silently
    merges two modules claiming it.
    """
    anchors: list[Section] = []
    for path in discover_python_files(root, source_roots):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError as error:
            report.add(path, error.lineno or 1, "syntax", f"cannot parse: {error.msg}")
            continue
        docstring = ast.get_docstring(tree) or ""
        line = docstring_line(tree)
        relative = str(path.relative_to(root))
        for anchor in MODULE.findall(docstring):
            section = Section(anchor=anchor, path=relative, line=line)
            section.references.update(ANY_ANCHOR.findall(docstring))
            section.references.discard(anchor)
            anchors.append(section)
    return anchors


def main() -> int:
    """§M-QC-KNOWLEDGE — Validate anchor uniqueness, resolvability and nearest-level links."""
    config = load_config("knowledge", DEFAULTS)
    root = project_root()
    report = Report("knowledge")

    sections: list[Section] = []
    for path, relative in collect_documents(root, config):
        sections.extend(parse_document(path, relative))

    if not sections:
        report.add(
            config["business"],
            1,
            "no-knowledge",
            "no §B/§A anchors were found; the project has no knowledge layer yet",
        )
        return report.finish()

    module_docs = module_anchors(root, list(config["source_roots"]), report)

    # Uniqueness spans documents *and* modules in one namespace. Two files
    # claiming one §M is the failure that makes `symbol → §M → §A` ambiguous:
    # the chain resolves, but to two different places depending on who reads it.
    seen: dict[str, Section] = {}
    for section in [*sections, *module_docs]:
        first = seen.get(section.anchor)
        if first is not None:
            report.add(
                section.path,
                section.line,
                "duplicate-anchor",
                f"{section.anchor} is already defined at {first.path}:{first.line}",
            )
            continue
        seen[section.anchor] = section

    defined = set(seen)

    for section in sections:
        for reference in sorted(section.references):
            if reference not in defined:
                report.add(
                    section.path,
                    section.line,
                    "dangling-reference",
                    f"{section.anchor} references unknown {reference}",
                )

        if ARCHITECTURE.fullmatch(section.anchor):
            if not any(BUSINESS.fullmatch(item) for item in section.references):
                report.add(
                    section.path,
                    section.line,
                    "missing-business-link",
                    f"{section.anchor} cites no §B-*: an architecture decision must serve a business truth",
                )

    for section in module_docs:
        references = section.references
        cites_architecture = any(ARCHITECTURE.fullmatch(item) for item in references)
        cites_business = any(BUSINESS.fullmatch(item) for item in references)
        if not cites_architecture:
            # Unconditional, not "only when it cites §B". A module that names no
            # §A at all has skipped the level just as thoroughly as one that
            # reaches past it to §B — and it is the commoner of the two, because
            # citing nothing takes no effort.
            report.add(
                section.path,
                section.line,
                "missing-architecture-link",
                f"{section.anchor} cites no §A-*: a module must name the architecture decision it implements",
            )
        if cites_business and not cites_architecture:
            report.add(
                section.path,
                section.line,
                "level-skipped",
                f"{section.anchor} cites a §B-* directly; it must reach business truth through its §A-*",
            )
        for reference in sorted(references):
            if reference not in defined:
                report.add(
                    section.path,
                    section.line,
                    "dangling-reference",
                    f"{section.anchor} references unknown {reference}",
                )

    return report.finish()


if __name__ == "__main__":
    raise SystemExit(main())
