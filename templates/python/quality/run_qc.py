#!/usr/bin/env python3
"""§M-QC-RUNNER — The authoritative `make qc` aggregator.

Implements the project side of the QC contract. Its job is not to run commands —
a shell can do that — but to make the three silent failures impossible: a tool
that was missing and got skipped, a gate that never ran but was assumed to pass,
and a formatter that quietly rewrote the tree it was supposed to be judging.

Writes a machine-readable result to `$META_O_QC_RESULT` when the orchestrator
set it. A missing result is never a pass on the other side, so writing it
atomically matters as much as computing it.
"""

from __future__ import annotations

import json
import os
import hashlib
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from _common import project_root, read_json, write_json

SCHEMA_VERSION = 1


def git_status(root: Path) -> str:
    """§M-QC-RUNNER — Snapshot the worktree by content, not by its status listing.

    The listing alone was not enough. `git status --porcelain` prints the same
    two characters and the same path whether or not the file behind them
    changed, so a formatter rewriting a file that was *already* dirty left the
    text identical and the mutation check passed — and the run wrote an
    attestable green result for content the gate itself had altered. A clean
    tree caught it and a dirty one did not, which is backwards: a dirty tree is
    where a stray rewrite is hardest to notice.

    So the snapshot is the listing plus the bytes it refers to: the full diff
    against `HEAD` for tracked changes, and a hash per untracked file.
    """
    listing = _git(root, ["status", "--porcelain", "--untracked-files=all"])
    parts = [listing, _git(root, ["diff", "HEAD"])]
    for line in listing.splitlines():
        if not line.startswith("?? "):
            continue
        path = root / line[3:].strip().strip('"')
        try:
            parts.append(f"{line[3:]}:{hashlib.sha256(path.read_bytes()).hexdigest()}")
        except OSError as error:  # a file that vanished mid-run is itself a mutation
            parts.append(f"{line[3:]}:unreadable:{error}")
    return "\n".join(parts)


def _git(root: Path, args: list[str]) -> str:
    """§M-QC-RUNNER — Run one read-only git command and return its stdout."""
    result = subprocess.run(
        ["git", *args],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout


def tool_version(command: str) -> str:
    """§M-QC-RUNNER — Best-effort version of the tool a gate invokes.

    Recorded because "the lint gate passed" means nothing without knowing which
    linter said so; a version bump that silently drops a rule is otherwise
    invisible in the result.
    """
    parts = shlex.split(command)
    if not parts:
        return "unknown"
    executable = parts[0]
    if executable in {"python", "python3"} and len(parts) > 2 and parts[1] == "-m":
        executable = f"{executable} -m {parts[2]}"
    try:
        result = subprocess.run(
            [*shlex.split(executable), "--version"],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
        text = (result.stdout or result.stderr).strip().splitlines()
        return text[0] if text else "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def run_gate(gate: dict[str, Any], root: Path) -> dict[str, Any]:
    """§M-QC-RUNNER — Execute one declared gate and classify its outcome.

    A missing executable is a failure, never a skip. That single decision is the
    difference between a quality gate and a decorative one: the most common way
    for a gate to stop working is for its tool to disappear from the
    environment, and the most tempting way to handle that is to shrug.
    """
    identifier = str(gate["id"])
    command = str(gate["command"])
    started = time.monotonic()

    parts = shlex.split(command)
    if not parts:
        return {
            "id": identifier,
            "status": "failed",
            "command": command,
            "tool_version": "unknown",
            "duration_ms": 0,
            "detail": "empty command",
        }

    if shutil.which(parts[0]) is None:
        return {
            "id": identifier,
            "status": "failed",
            "command": command,
            "tool_version": "unknown",
            "duration_ms": 0,
            "detail": f"tool {parts[0]} is not installed; a missing tool is a failure, not a skip",
        }

    environment = dict(os.environ)
    environment["PYTHONPATH"] = os.pathsep.join(
        [str(root / "quality"), environment.get("PYTHONPATH", "")]
    ).rstrip(os.pathsep)

    result = subprocess.run(parts, cwd=root, env=environment, check=False)
    duration = int((time.monotonic() - started) * 1000)

    return {
        "id": identifier,
        "status": "passed" if result.returncode == 0 else "failed",
        "command": command,
        "tool_version": tool_version(command),
        "duration_ms": duration,
    }


def main() -> int:
    """§M-QC-RUNNER — Run every declared gate and write the attestable result."""
    root = project_root()
    manifest_path = root / ".quality" / "qc-manifest.json"
    manifest = read_json(manifest_path)
    if manifest is None:
        sys.stderr.write(f"{manifest_path} is missing; the QC contract is not declared\n")
        return 1

    before = git_status(root)
    results: list[dict[str, Any]] = []

    for gate in manifest.get("gates", []):
        identifier = str(gate.get("id", "?"))
        if gate.get("policy") == "not_applicable":
            sys.stdout.write(f"== {identifier}: not applicable ({gate.get('rationale', '')})\n")
            results.append(
                {
                    "id": identifier,
                    "status": "not_applicable",
                    "command": str(gate.get("command", "")),
                    "tool_version": "n/a",
                    "duration_ms": 0,
                }
            )
            continue

        sys.stdout.write(f"== {identifier}: {gate.get('command')}\n")
        sys.stdout.flush()
        results.append(run_gate(gate, root))

    after = git_status(root)
    mutated = before != after
    if mutated:
        sys.stderr.write(
            "qc mutated the worktree; a gate that rewrites the tree cannot attest it\n"
        )
        results.append(
            {
                "id": "non-mutating",
                "status": "failed",
                "command": "git status --porcelain --untracked-files=all + git diff HEAD",
                "tool_version": "git",
                "duration_ms": 0,
            }
        )

    destination = os.environ.get("META_O_QC_RESULT")
    if destination:
        write_json(
            Path(destination),
            {
                "schema_version": SCHEMA_VERSION,
                "snapshot_digest": os.environ.get("META_O_SNAPSHOT_DIGEST", ""),
                "gates": results,
            },
        )
        sys.stdout.write(f"qc result written to {destination}\n")
    else:
        sys.stdout.write(f"{json.dumps({'gates': results}, indent=2)}\n")

    failed = [gate["id"] for gate in results if gate["status"] == "failed"]
    if failed:
        sys.stderr.write(f"qc FAILED: {', '.join(failed)}\n")
        return 1
    sys.stdout.write("qc passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
