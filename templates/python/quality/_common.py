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
import os
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

    That last sentence was only half true. A misspelled key was merged in and
    ignored, and a value of the wrong shape was accepted whole — `skip_dirs =
    "venv"` became the five directory names `v`, `e`, `n`, `v`, so discovery
    quietly shrank and the gate reported `ok` about files it never opened. Both
    are now refused: the defaults are the schema, and the type of each default
    is the type the override must have.
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

    for key, value in table.items():
        if key not in merged:
            known = ", ".join(sorted(merged)) or "(none)"
            raise SystemExit(
                f"[tool.meta_o.{section}] has no key {key!r}; known keys are {known}. "
                "A misspelled key would silently leave the gate on its default."
            )
        _assert_same_shape(section, key, merged[key], value)
    merged.update(table)
    return merged


def _assert_same_shape(section: str, key: str, default: Any, value: Any) -> None:
    """§M-QC-COMMON — Refuse an override whose type is not the default's type."""
    if isinstance(default, bool) != isinstance(value, bool):
        raise SystemExit(f"[tool.meta_o.{section}] {key} must be a boolean")
    if isinstance(default, list):
        if not isinstance(value, list):
            raise SystemExit(f"[tool.meta_o.{section}] {key} must be a list, got {type(value).__name__}")
        if any(not isinstance(item, str) for item in default) or all(
            isinstance(item, str) for item in value
        ):
            return
        raise SystemExit(f"[tool.meta_o.{section}] every entry of {key} must be a string")
    if isinstance(default, bool):
        return
    if isinstance(default, int) and not isinstance(value, int):
        raise SystemExit(f"[tool.meta_o.{section}] {key} must be an integer, got {type(value).__name__}")
    if isinstance(default, str) and not isinstance(value, str):
        raise SystemExit(f"[tool.meta_o.{section}] {key} must be a string, got {type(value).__name__}")


def discover_python_files(root: Path, source_roots: list[str]) -> list[Path]:
    """§M-QC-COMMON — Find the `.py` files a checker is responsible for.

    Restricted to the configured source roots so that virtual environments,
    build outputs and vendored trees never enter a gate's judgement — and so
    that adding a directory to the gate is an explicit, reviewable act.

    The skip list is matched against the path *below the source root*, never
    the absolute path. Matching the whole path meant a checkout living under
    `~/dist/`, `/build/` or any `venv`-named parent discovered no files at all
    and every gate reported `ok` on a tree it had not opened.

    `build` and `dist` name output directories in most projects and real
    packages in some. A directory of either name carrying an `__init__.py` is
    treated as a package, because dropping it is under-coverage of exactly the
    silent kind §40 calls a FAIL. That heuristic cannot see a PEP 420 namespace
    package, and it cannot see a generated tree that happens to carry an
    `__init__.py`, so the whole list is configurable:

        [tool.meta_o.discovery]
        skip_dirs = [".venv", "venv", "__pycache__", ".tox"]

    naming the directories to skip outright, and

        package_dirs = ["build", "dist"]

    naming those that are skipped only where they are not packages.
    """
    config = load_config("discovery", DISCOVERY_DEFAULTS)
    always = {str(name) for name in config["skip_dirs"]}
    conditional = {str(name) for name in config["package_dirs"]}
    files: list[Path] = []
    for relative in source_roots:
        base = root / relative
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*.py")):
            if _skipped(base, path, always, conditional):
                continue
            files.append(path)
    return files


# Names that are output directories everywhere, and names that are output
# directories only where they are not also packages. Overridable, because no
# name is reliably one or the other in every project.
DISCOVERY_DEFAULTS = {
    "skip_dirs": [".venv", "venv", "__pycache__", ".tox"],
    "package_dirs": ["build", "dist"],
}


def _skipped(base: Path, path: Path, always: set[str], conditional: set[str]) -> bool:
    """§M-QC-COMMON — Decide whether one discovered file sits in a skipped directory."""
    walked = base
    for part in path.relative_to(base).parts[:-1]:
        walked = walked / part
        if part in always:
            return True
        if part in conditional and not (walked / "__init__.py").is_file():
            return True
    return False


def assert_discovered(report: "Report", root: Path, source_roots: list[str], files: list[Path]) -> None:
    """§M-QC-COMMON — Fail a gate that found nothing to judge.

    §40 makes an unexpected skip a FAIL, and a gate whose file discovery came
    back empty is the largest possible skip: it reports `ok` about a tree it
    never opened. That happened for real — a checkout under a path with a
    `build`, `dist` or `venv` component matched the skip list on its *absolute*
    path — and four gates attested nothing at all, silently.
    """
    if files:
        return
    for relative in source_roots:
        if not (root / relative).is_dir():
            report.add(relative, 1, "missing-source-root", "configured source root does not exist")
    report.add(
        "pyproject.toml",
        1,
        "nothing-discovered",
        "no .py files were found under "
        + ", ".join(source_roots)
        + "; a gate that judged nothing is a skip, not a pass",
    )


@dataclass
class Violation:
    """§M-QC-COMMON — One concrete, addressable problem found by a checker."""

    path: str
    line: int
    rule: str
    message: str
    symbol: str = ""

    def key(self) -> str:
        """§M-QC-COMMON — Stable identity of a violation across runs.

        Excludes the line number, because a violation that merely moved down the
        file is the same violation and a baseline keyed on lines would expire on
        every unrelated edit. It includes the *symbol*, because without it every
        violation of one rule in one file collapses to a single key: one frozen
        entry would then forgive an unbounded number of new violations in that
        file, and a regression in one function would be masked by whichever
        function the walk happened to measure last.
        """
        return f"{self.path}::{self.rule}::{self.symbol}" if self.symbol else f"{self.path}::{self.rule}"

    def render(self) -> str:
        """§M-QC-COMMON — Render a violation the way an editor can jump to it."""
        return f"{self.path}:{self.line}: [{self.rule}] {self.message}"


@dataclass
class Report:
    """§M-QC-COMMON — The outcome of one checker, ready to print and to exit on."""

    name: str
    violations: list[Violation] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def add(
        self,
        path: Path | str,
        line: int,
        rule: str,
        message: str,
        symbol: str = "",
    ) -> None:
        """§M-QC-COMMON — Record one violation, with a path relative to the root."""
        root = project_root()
        text = str(path)
        try:
            text = str(Path(path).resolve().relative_to(root))
        except ValueError:
            pass
        self.violations.append(Violation(text, line, rule, message, symbol))

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
    """§M-QC-COMMON — Write JSON atomically and durably.

    `flush` pushes the bytes out of Python and no further; `fsync` is what makes
    them survive the machine. This file is a gate's baseline or its result — the
    evidence behind an attestation — so it is held to the same rule as the run
    state, which has always been fsynced.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)
