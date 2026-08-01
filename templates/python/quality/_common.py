"""§M-QC-COMMON — Shared configuration loading and reporting for the QC checkers.

Every checker needs the same three things: the project root, its slice of
`[tool.meta_o.*]`, and a way to report violations that a human and a machine can
both read. Duplicating that in five files guarantees five slightly different
answers to "where is the project root", which is exactly the kind of drift a
quality gate must not have.

Standard library only, by design: a gate that cannot run because its own
dependency failed to install is a gate that will be disabled.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def project_root() -> Path:
    """§M-QC-COMMON — Locate the repository root the checkers operate on.

    Uses Git rather than walking up for a marker file, because the snapshot the
    workflow attests is defined by Git's view of the tree and nothing else.
    """
    try:
        output = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            check=True,
        )
        return Path(output.stdout.strip()).resolve()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return Path.cwd().resolve()


def load_config(section: str, defaults: dict[str, Any] | None = None) -> dict[str, Any]:
    """§M-QC-COMMON — Read one `[tool.meta_o.<section>]` table from pyproject.toml.

    Missing configuration falls back to the defaults so that a freshly adopted
    project runs the checkers immediately; a *malformed* table raises, because
    silently ignoring a typo would silently disable a gate.
    """
    merged: dict[str, Any] = dict(defaults or {})
    path = project_root() / "pyproject.toml"
    if not path.is_file():
        return merged

    with path.open("rb") as handle:
        data = tomllib.load(handle)

    table = data.get("tool", {}).get("meta_o", {}).get(section, {})
    if not isinstance(table, dict):
        raise SystemExit(f"[tool.meta_o.{section}] must be a table, got {type(table).__name__}")
    merged.update(table)
    return merged


def discover_python_files(root: Path, source_roots: list[str]) -> list[Path]:
    """§M-QC-COMMON — Find the `.py` files a checker is responsible for.

    Restricted to the configured source roots so that virtual environments,
    build outputs and vendored trees never enter a gate's judgement — and so
    that adding a directory to the gate is an explicit, reviewable act.
    """
    files: list[Path] = []
    for relative in source_roots:
        base = root / relative
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*.py")):
            parts = set(path.parts)
            if parts & {".venv", "venv", "__pycache__", "build", "dist", ".tox"}:
                continue
            files.append(path)
    return files


@dataclass
class Violation:
    """§M-QC-COMMON — One concrete, addressable problem found by a checker."""

    path: str
    line: int
    rule: str
    message: str

    def key(self) -> str:
        """§M-QC-COMMON — Stable identity of a violation across runs.

        Deliberately excludes the line number: a violation that merely moved
        down the file is the same violation, and a baseline keyed on line
        numbers would expire on every unrelated edit.
        """
        return f"{self.path}::{self.rule}"

    def render(self) -> str:
        """§M-QC-COMMON — Render a violation the way an editor can jump to it."""
        return f"{self.path}:{self.line}: [{self.rule}] {self.message}"


@dataclass
class Report:
    """§M-QC-COMMON — The outcome of one checker, ready to print and to exit on."""

    name: str
    violations: list[Violation] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def add(self, path: Path | str, line: int, rule: str, message: str) -> None:
        """§M-QC-COMMON — Record one violation, with a path relative to the root."""
        root = project_root()
        text = str(path)
        try:
            text = str(Path(path).resolve().relative_to(root))
        except ValueError:
            pass
        self.violations.append(Violation(text, line, rule, message))

    def note(self, message: str) -> None:
        """§M-QC-COMMON — Record something a reviewer should see but that does not fail."""
        self.notes.append(message)

    def finish(self) -> int:
        """§M-QC-COMMON — Print the report and return the process exit status.

        Notes are printed even on success: a warning nobody prints is a warning
        nobody acts on, and the dynamic-import list is exactly such a warning.
        """
        for note in self.notes:
            sys.stdout.write(f"note: {note}\n")
        for violation in sorted(self.violations, key=lambda item: (item.path, item.line)):
            sys.stdout.write(f"{violation.render()}\n")
        if self.violations:
            sys.stdout.write(f"{self.name}: {len(self.violations)} violation(s)\n")
            return 1
        sys.stdout.write(f"{self.name}: ok\n")
        return 0


def read_json(path: Path, default: Any = None) -> Any:
    """§M-QC-COMMON — Read a JSON file, distinguishing absent from malformed.

    An absent baseline is a legitimate state — the project has none yet. A
    malformed one is not, and must stop the gate rather than be treated as an
    empty baseline, which would silently forgive every existing violation.
    """
    if not path.is_file():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: Any) -> None:
    """§M-QC-COMMON — Write JSON atomically, so a crash cannot leave half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
    temporary.replace(path)
