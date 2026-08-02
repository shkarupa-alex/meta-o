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

from _common import Report, assert_discovered, discover_python_files, load_config, project_root

BUSINESS = re.compile(r"§B-[A-Z0-9-]+")
ARCHITECTURE = re.compile(r"§A-[A-Z0-9-]+")
MODULE = re.compile(r"§M-[A-Z0-9-]+")
ANY_ANCHOR = re.compile(r"§[BAM]-[A-Z0-9-]+")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
FENCE = re.compile(r"^\s*(```|~~~)")

# Deliberately greedy where the grammar is strict. `§B-BAD_ANCHOR` matches the
# anchor pattern only as far as `§B-BAD`, so a checker built from the grammar
# alone silently registers a *different* anchor than the author wrote, and
# `§a-lower-01` registers nothing at all. Both are typos a knowledge layer must
# fail on rather than quietly reinterpret.
ANCHOR_TOKEN = re.compile(r"§[^\s`\"'(),;:.\]/]+")
WELL_FORMED = re.compile(r"^§[BAM](?:-(?:\*|[A-Z0-9]+(?:-[A-Z0-9]+)*))?$")

# Path segments that mark a document as parked rather than current. A feature
# spec filed under `docs/knowledge/archive/` instead of being retired recreates
# the problem retirement exists to remove: a second, stale source of truth whose
# anchors are all perfectly well formed.
ARCHIVE_SEGMENT = re.compile(r"(^|/)(archive|archives|archived|old|legacy-specs|specs?)(/|$)", re.I)

DEFAULTS = {
    "business": "docs/knowledge/business.md",
    "glossary": "docs/knowledge/glossary.md",
    "architecture_dir": "docs/knowledge/architecture",
    # Matches the purpose gate. A narrower default let a test module declare a
    # §M anchor citing an architecture anchor that did not exist, and pass.
    "source_roots": ["src", "tests"],
}


@dataclass
class Section:
    """§M-QC-KNOWLEDGE — One anchored section of a knowledge document."""

    anchor: str
    path: str
    line: int
    heading_level: int = 0
    references: set[str] = field(default_factory=set)


def parse_document(path: Path, relative: str, report: Report) -> list[Section]:
    """§M-QC-KNOWLEDGE — Extract anchored sections from one Markdown document.

    Only headings define anchors. A mention in prose is a reference, and a
    mention inside a fenced block is an example — treating either as a
    definition would let a tutorial silently satisfy the uniqueness check, and
    would fail a tutorial that shows `§b-wrong` as the counter-example it is
    teaching about.

    A section ends at the next heading that defines an anchor, or at the next
    heading of the same or a higher level. Without the first rule a parent
    absorbs its children's citations and `## §A-ONE` citing nothing passes on a
    `### §A-TWO` that cites a §B.
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

        for token in ANCHOR_TOKEN.findall(text):
            if not WELL_FORMED.match(token):
                report.add(relative, number, "malformed-anchor", f"malformed anchor {token}")

        heading = HEADING.match(text)
        if heading:
            level = len(heading.group(1))
            found = ANY_ANCHOR.search(heading.group(2))
            if found:
                current = Section(
                    anchor=found.group(0), path=relative, line=number, heading_level=level
                )
                sections.append(current)
            elif current is not None and level <= current.heading_level:
                current = None
            continue
        if current is not None:
            current.references.update(ANY_ANCHOR.findall(text))

    for section in sections:
        section.references.discard(section.anchor)
    return sections


def collect_documents(root: Path, config: dict) -> list[tuple[Path, str]]:
    """§M-QC-KNOWLEDGE — List every knowledge document the gate reads.

    The whole knowledge tree, not three configured locations. Reading only
    `business`, `glossary` and `architecture_dir` meant a retired feature spec
    parked one directory over in `docs/knowledge/archive/` was never opened at
    all — so the archive rule could not fire on it, a `§B-*` defined there
    escaped the one-document rule, and a duplicated anchor there escaped the
    uniqueness rule. A document nobody reads is exactly where a stale second
    source of truth survives.
    """
    documents: list[tuple[Path, str]] = []
    seen: set[Path] = set()

    def take(path: Path) -> None:
        """§M-QC-KNOWLEDGE — Record one document once, by resolved path."""
        resolved = path.resolve()
        if resolved in seen or not path.is_file():
            return
        seen.add(resolved)
        documents.append((path, str(path.relative_to(root))))

    for key in ("business", "glossary"):
        take(root / str(config[key]))

    for base in {
        (root / str(config["business"])).parent,
        (root / str(config["glossary"])).parent,
        root / str(config["architecture_dir"]),
    }:
        if base.is_dir():
            for path in sorted(base.rglob("*.md")):
                take(path)
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
    discovered = discover_python_files(root, source_roots)
    assert_discovered(report, root, source_roots, discovered)
    for path in discovered:
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
    business_document = str(config["business"])
    for path, relative in collect_documents(root, config):
        sections.extend(parse_document(path, relative, report))
        if ARCHIVE_SEGMENT.search(relative):
            report.add(
                relative,
                1,
                "feature-archive",
                "a feature archive inside the knowledge search roots; retire the spec by "
                "distributing its durable requirements into §B/§A/§M and deleting it",
            )

    # Business truth lives in exactly one document. Without this rule an
    # architecture note quietly becomes a business anchor, every other checker
    # still passes, and "a human can read the whole business truth in one file"
    # stops being true without anything saying so.
    for section in sections:
        if section.anchor.startswith("§B-") and section.path != business_document:
            report.add(
                section.path,
                section.line,
                "business-outside-document",
                f"{section.anchor} is defined outside {business_document}",
            )

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

    # §10: planned intent is not current truth, so a durable `§B-TODO`/`§A-TODO`
    # anchor is refused. Debt belongs in `docs/todo.md`, which the workflow
    # already requires; a knowledge document describing what someone means to
    # build is the one thing the knowledge layer must never say.
    for section in sections:
        if re.match(r"^§[BA]-TODO(-|$)", section.anchor):
            report.add(
                section.path,
                section.line,
                "planned-anchor",
                f"{section.anchor} is planned intent, not current truth; "
                "record it in docs/todo.md and write the anchor when the thing exists",
            )

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

        # A `§M` written as a Markdown heading is as much a module anchor as one
        # in a docstring, and only the docstring half was held to the
        # nearest-level rule — so `## §M-ORPHAN` in an architecture document
        # cited nothing and passed, which is the drift the chain exists to show.
        if MODULE.fullmatch(section.anchor):
            if not any(ARCHITECTURE.fullmatch(item) for item in section.references):
                report.add(
                    section.path,
                    section.line,
                    "missing-architecture-link",
                    f"{section.anchor} cites no §A-*: a module must cite its nearest level up",
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
