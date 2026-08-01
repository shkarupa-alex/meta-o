#!/usr/bin/env python3
"""§M-QC-E2E — Validate the E2E catalog and guard its completion metadata.

The catalog is the only place the project says which behaviours it actually
verifies end to end, and it is inside the attested snapshot — so a scenario
quietly renamed after a review would invalidate that review, and a scenario
quietly deleted would remove a check nobody notices is gone.

Two modes:

* default — schema, unique ids, resolvable anchors and business links, at least
  one `always_required` scenario;
* `--metadata-guard` — the completion check: prove the last commit changed only
  `scenarios[*].last_run` and nothing else.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from _common import Report, load_config, project_root, read_json

DEFAULTS = {
    "contract": "docs/architecture/e2e.md",
    "registry": "docs/architecture/e2e.json",
    "business": "docs/knowledge/business.md",
}

SCENARIO_ID = re.compile(r"^[A-Z][A-Z0-9-]*$")
SCENARIO_REF = re.compile(r"^[^#\s]+\.md#[a-z0-9][a-z0-9-]*$")
BUSINESS_ANCHOR = re.compile(r"^§B-[A-Z0-9-]+$")
HEADING_ANCHOR = re.compile(r"^#{1,6}\s+(§B-[A-Z0-9-]+)")
MD_HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*$")
LAST_RUN_FIELDS = (
    "snapshot_digest",
    "provenance_commit",
    "run_id",
    "spec_sha256",
    "verified_at",
    "status",
    "environment",
)


def markdown_anchors(path: Path) -> set[str]:
    """§M-QC-E2E — Slugs of every heading in the E2E contract document."""
    anchors: set[str] = set()
    if not path.is_file():
        return anchors
    for line in path.read_text(encoding="utf-8").splitlines():
        heading = MD_HEADING.match(line)
        if heading:
            slug = re.sub(r"[^a-z0-9]+", "-", heading.group(1).lower()).strip("-")
            anchors.add(slug)
    return anchors


def business_anchors(path: Path) -> set[str]:
    """§M-QC-E2E — Business anchors a scenario is allowed to link to."""
    if not path.is_file():
        return set()
    return {
        match.group(1)
        for match in (HEADING_ANCHOR.match(line) for line in path.read_text(encoding="utf-8").splitlines())
        if match
    }


def validate_registry(registry: Any, config: dict, root: Path, report: Report) -> None:
    """§M-QC-E2E — Check the catalog's schema, uniqueness and outward references."""
    relative = str(config["registry"])
    if not isinstance(registry, dict):
        report.add(relative, 1, "schema", "registry must be a JSON object")
        return
    if registry.get("schema_version") != 1:
        report.add(relative, 1, "schema", "schema_version must be 1")

    scenarios = registry.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        report.add(relative, 1, "schema", "scenarios must be a non-empty array")
        return

    anchors = markdown_anchors(root / str(config["contract"]))
    business = business_anchors(root / str(config["business"]))
    seen: set[str] = set()
    required = 0

    for index, scenario in enumerate(scenarios):
        if not isinstance(scenario, dict):
            report.add(relative, 1, "schema", f"scenarios[{index}] must be an object")
            continue

        identifier = str(scenario.get("scenario_id", ""))
        if not SCENARIO_ID.match(identifier):
            report.add(relative, 1, "scenario-id", f"scenarios[{index}].scenario_id is malformed")
        elif identifier in seen:
            report.add(relative, 1, "duplicate-id", f"{identifier} appears more than once")
        else:
            seen.add(identifier)

        reference = str(scenario.get("scenario_ref", ""))
        if not SCENARIO_REF.match(reference):
            report.add(relative, 1, "scenario-ref", f"{identifier}: scenario_ref is malformed")
        elif anchors:
            slug = reference.split("#", 1)[1]
            if slug not in anchors:
                report.add(
                    relative,
                    1,
                    "dangling-ref",
                    f"{identifier}: {config['contract']} has no anchor #{slug}",
                )

        links = scenario.get("business_links")
        if not isinstance(links, list) or not links:
            report.add(relative, 1, "business-links", f"{identifier}: business_links must be non-empty")
        else:
            for link in links:
                if not BUSINESS_ANCHOR.match(str(link)):
                    report.add(relative, 1, "business-links", f"{identifier}: {link} is malformed")
                elif business and str(link) not in business:
                    report.add(
                        relative,
                        1,
                        "dangling-business-link",
                        f"{identifier}: {link} is not defined in {config['business']}",
                    )

        if scenario.get("always_required") is True:
            required += 1
        elif not isinstance(scenario.get("always_required"), bool):
            report.add(relative, 1, "schema", f"{identifier}: always_required must be a boolean")

        last_run = scenario.get("last_run")
        if last_run is not None:
            if not isinstance(last_run, dict):
                report.add(relative, 1, "schema", f"{identifier}: last_run must be an object")
            else:
                for field in LAST_RUN_FIELDS:
                    if not isinstance(last_run.get(field), str) or not last_run[field]:
                        report.add(relative, 1, "schema", f"{identifier}: last_run.{field} is missing")
                if last_run.get("status") not in {"passed", "failed", "blocked"}:
                    report.add(relative, 1, "schema", f"{identifier}: last_run.status is invalid")

    if required == 0:
        report.add(
            relative,
            1,
            "no-canary",
            "at least one scenario must be always_required, or an empty selection plan becomes possible",
        )


def catalog_projection(registry: Any) -> Any:
    """§M-QC-E2E — The catalog with `last_run` removed, i.e. the attested part."""
    if not isinstance(registry, dict):
        return registry
    scenarios = []
    for scenario in registry.get("scenarios", []):
        if isinstance(scenario, dict):
            scenarios.append({key: value for key, value in scenario.items() if key != "last_run"})
        else:
            scenarios.append(scenario)
    return {**{k: v for k, v in registry.items() if k != "scenarios"}, "scenarios": scenarios}


def metadata_guard(config: dict, root: Path, report: Report) -> None:
    """§M-QC-E2E — Prove the completion commit touched only `last_run`.

    This is the one moment a tracked file may change after the snapshot was
    attested. If anything else moved, the four attestations no longer describe
    what is in the tree, and the run must not complete.
    """
    relative = str(config["registry"])
    changed = subprocess.run(
        ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if changed.returncode != 0:
        report.add(relative, 1, "guard", "cannot diff HEAD~1..HEAD; is this the metadata commit?")
        return

    paths = [line for line in changed.stdout.splitlines() if line.strip()]
    for path in paths:
        if path != relative:
            report.add(path, 1, "guard", f"the metadata commit also changed {path}")

    previous = subprocess.run(
        ["git", "show", f"HEAD~1:{relative}"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if previous.returncode != 0:
        report.add(relative, 1, "guard", "cannot read the registry at HEAD~1")
        return

    before = catalog_projection(json.loads(previous.stdout))
    after = catalog_projection(read_json(root / relative, default={}))
    if json.dumps(before, sort_keys=True) != json.dumps(after, sort_keys=True):
        report.add(
            relative,
            1,
            "guard",
            "the metadata commit changed catalog fields, not only scenarios[*].last_run",
        )


def main() -> int:
    """§M-QC-E2E — Validate the catalog, or guard the completion metadata commit."""
    config = load_config("e2e", DEFAULTS)
    root = project_root()
    report = Report("e2e-metadata")

    registry_path = root / str(config["registry"])
    registry = read_json(registry_path)
    if registry is None:
        report.add(str(config["registry"]), 1, "missing", "the E2E registry does not exist")
        return report.finish()

    if "--metadata-guard" in sys.argv:
        metadata_guard(config, root, report)
    else:
        validate_registry(registry, config, root, report)

    return report.finish()


if __name__ == "__main__":
    raise SystemExit(main())
