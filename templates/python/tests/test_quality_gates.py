"""§M-QC-TESTS — Acceptance fixtures for the QC checkers themselves.

Implements the §40 requirement that the QC project prove its own gates. A gate
that has never been shown to fail is indistinguishable from a gate that cannot
fail, and the second kind is the one that quietly passes a broken tree for a
year. Every test here builds a tiny project that is wrong in exactly one way and
asserts that the corresponding checker notices.

Runs on the standard library alone — `python3 -m unittest discover tests` — so
that the gates can be verified before the project's own test tooling exists.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

QUALITY = Path(__file__).resolve().parent.parent / "quality"


def write(root: Path, relative: str, content: str) -> None:
    """§M-QC-TESTS — Write one file of a fixture project."""
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content), encoding="utf-8")


def git(root: Path, *args: str) -> None:
    """§M-QC-TESTS — Run a Git command inside a fixture project."""
    subprocess.run(
        ["git", *args],
        cwd=root,
        check=True,
        capture_output=True,
        env={
            **os.environ,
            "GIT_AUTHOR_NAME": "qc tests",
            "GIT_AUTHOR_EMAIL": "qc@example.invalid",
            "GIT_COMMITTER_NAME": "qc tests",
            "GIT_COMMITTER_EMAIL": "qc@example.invalid",
        },
    )


def run_checker(root: Path, script: str, *args: str) -> subprocess.CompletedProcess[str]:
    """§M-QC-TESTS — Run one checker against a fixture project."""
    return subprocess.run(
        [sys.executable, str(QUALITY / script), *args],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )


class FixtureProject:
    """§M-QC-TESTS — A disposable Git repository with a minimal valid contract."""

    def __init__(self) -> None:
        """§M-QC-TESTS — Create the repository and populate a passing baseline."""
        self._directory = tempfile.TemporaryDirectory()
        self.root = Path(self._directory.name).resolve()
        git(self.root, "init", "--quiet", "--initial-branch=main")

        write(
            self.root,
            "pyproject.toml",
            """
            [tool.meta_o.purpose]
            source_roots = ["src"]

            [tool.meta_o.code_health]
            source_roots = ["src"]
            max_function_lines = 10
            max_file_lines = 100
            max_class_lines = 50
            max_cyclomatic_complexity = 4
            max_nesting_depth = 2

            [tool.meta_o.import_graph]
            source_roots = ["src"]
            # Every module these fixtures create, because an empty prefix list
            # is now itself a violation: with no boundary declared, nothing is
            # first-party, no import can dangle, and the gate passes any tree.
            first_party_prefixes = [
              "alpha", "beta", "boot", "boot_again", "delta", "extra", "gamma", "hub",
              "selfy", "stray",
            ]

            [tool.meta_o.knowledge]
            source_roots = ["src"]
            """,
        )
        write(
            self.root,
            "docs/knowledge/business.md",
            """
            # Business truth

            ## §B-CORE-01 — The product must start

            Nothing else matters if it does not boot.
            """,
        )
        write(
            self.root,
            "docs/knowledge/architecture/boot.md",
            """
            # Boot

            ## §A-BOOT-01 — One supervised entry point

            Implements §B-CORE-01 so startup ordering stays checkable.
            """,
        )
        write(
            self.root,
            "docs/architecture/e2e.md",
            """
            # E2E

            ## e2e-smoke-01

            Boot the app and read /health.
            """,
        )
        write(
            self.root,
            "docs/architecture/e2e.json",
            json.dumps(
                {
                    "schema_version": 1,
                    "scenarios": [
                        {
                            "scenario_id": "E2E-SMOKE-01",
                            "scenario_ref": "docs/architecture/e2e.md#e2e-smoke-01",
                            "business_links": ["§B-CORE-01"],
                            "always_required": True,
                            "tags": ["smoke"],
                        }
                    ],
                },
                indent=2,
            )
            + "\n",
        )
        write(
            self.root,
            "src/boot.py",
            '''
            """§M-BOOT — Start the application. Implements §A-BOOT-01."""


            def start() -> int:
                """§M-BOOT — Start the process and report its exit status."""
                return 0
            ''',
        )
        git(self.root, "add", "-A")
        git(self.root, "commit", "--quiet", "-m", "fixture baseline")

    def dispose(self) -> None:
        """§M-QC-TESTS — Remove the fixture project."""
        self._directory.cleanup()


class PurposeCheckerTests(unittest.TestCase):
    """§M-QC-TESTS — The purpose gate finds symbols that do not say why they exist."""

    def setUp(self) -> None:
        """§M-QC-TESTS — Build a fresh fixture for each test."""
        self.project = FixtureProject()
        self.addCleanup(self.project.dispose)

    def test_a_valid_tree_passes(self) -> None:
        """§M-QC-TESTS — A documented module and function satisfy the gate."""
        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_an_undocumented_private_nested_function_is_found(self) -> None:
        """§M-QC-TESTS — Privacy and nesting are not excuses for a missing purpose."""
        write(
            self.project.root,
            "src/boot.py",
            '''
            """§M-BOOT — Start the application. Implements §A-BOOT-01."""


            def start() -> int:
                """§M-BOOT — Start the process and report its exit status."""

                def _inner() -> int:
                    return 0

                return _inner()
            ''',
        )
        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("_inner", result.stdout)

    def test_a_module_without_an_anchor_is_found(self) -> None:
        """§M-QC-TESTS — A docstring with no §M-* anchor links to nothing."""
        write(
            self.project.root,
            "src/boot.py",
            '''
            """Starts the application."""


            def start() -> int:
                """Start it."""
                return 0
            ''',
        )
        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("module-anchor", result.stdout)

    def test_a_dunder_must_state_its_purpose(self) -> None:
        """§M-QC-TESTS — The language defines `__eq__`'s signature, not what equality means here."""
        write(
            self.project.root,
            "src/boot.py",
            '''
            """§M-BOOT — Start the application. Implements §A-BOOT-01."""


            class Config:
                """§M-BOOT — Startup configuration."""

                def __eq__(self, other: object) -> bool:
                    return True
            ''',
        )
        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("Config.__eq__", result.stdout)

    def test_a_symbol_must_cite_its_module_anchor(self) -> None:
        """§M-QC-TESTS — A docstring that names no §M-* leaves the symbol outside the chain."""
        write(
            self.project.root,
            "src/boot.py",
            '''
            """§M-BOOT — Start the application. Implements §A-BOOT-01."""


            def start() -> int:
                """Start the process and report its exit status."""
                return 0
            ''',
        )
        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("symbol-anchor", result.stdout)

    def test_a_declared_generated_tree_is_exempt_by_glob(self) -> None:
        """§M-QC-TESTS — Generated code is excused by pattern, not one file at a time."""
        write(
            self.project.root,
            "src/generated/api.py",
            """
            # @generated by the schema compiler. DO NOT EDIT.
            def call() -> int:
                return 0
            """,
        )
        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 1, result.stdout)

        write(
            self.project.root,
            "pyproject.toml",
            """
            [tool.meta_o.purpose]
            source_roots = ["src"]
            exempt_files = ["src/generated/*.py"]
            """,
        )
        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("src/generated/*.py", result.stdout)

    def test_an_exemption_without_a_generated_marker_is_refused(self) -> None:
        """§M-QC-TESTS — §10 exempts generated source "with a marker *and* a declared glob"."""
        # Only the glob half was implemented, which made `exempt_files` an
        # unconditional suppression list: one line excused a hand-written module.
        write(
            self.project.root,
            "src/handwritten.py",
            """
            def transfer(amount, src, dst):
                src.balance -= amount
                dst.balance += amount
            """,
        )
        write(
            self.project.root,
            "pyproject.toml",
            """
            [tool.meta_o.purpose]
            source_roots = ["src"]
            exempt_files = ["src/handwritten.py"]
            """,
        )
        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("unmarked-exemption", result.stdout)

    def test_test_code_is_held_to_the_same_rule(self) -> None:
        """§M-QC-TESTS — A test whose purpose is unstated is a test nobody can judge."""
        # The default `source_roots` include `tests` precisely because an
        # undocumented test is the cheapest place to hide a check that asserts
        # the wrong thing; the rest of this fixture narrows the roots to `src`,
        # so without this case nothing would prove the default is honoured.
        write(
            self.project.root,
            "pyproject.toml",
            """
            [tool.meta_o.purpose]
            source_roots = ["src", "tests"]
            """,
        )
        write(
            self.project.root,
            "tests/test_boot.py",
            '''
            """§M-BOOT-TESTS — Boot behaviour. Implements §A-BOOT-01."""


            def test_it_starts() -> None:
                assert True
            ''',
        )
        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("tests/test_boot.py", result.stdout)
        self.assertIn("test_it_starts", result.stdout)


class KnowledgeCheckerTests(unittest.TestCase):
    """§M-QC-TESTS — The knowledge gate finds broken and skipped causal links."""

    def setUp(self) -> None:
        """§M-QC-TESTS — Build a fresh fixture for each test."""
        self.project = FixtureProject()
        self.addCleanup(self.project.dispose)

    def test_a_valid_chain_passes(self) -> None:
        """§M-QC-TESTS — §B → §A → §M with resolvable references is accepted."""
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_a_module_anchor_written_as_a_heading_must_cite_architecture(self) -> None:
        """§M-QC-TESTS — A §M is a §M wherever it is written.

        The nearest-level rule was applied only to anchors harvested from
        docstrings, so `## §M-ORPHAN` in an architecture document cited nothing
        and passed — which is exactly the drift the chain exists to surface.
        """
        write(
            self.project.root,
            "docs/knowledge/architecture/boot.md",
            """
            # Boot

            ## §A-BOOT-01 — One supervised entry point

            Implements §B-CORE-01 so startup ordering stays checkable.

            ## §M-ORPHAN — a module anchor with no architecture link

            This module exists. It cites nothing.
            """,
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("missing-architecture-link", result.stdout)

    def test_a_feature_archive_outside_the_architecture_directory_is_found(self) -> None:
        """§M-QC-TESTS — The gate reads the whole knowledge tree, not three paths.

        Only `business`, `glossary` and `architecture_dir` were opened, so a
        retired spec parked one directory over was never parsed: the archive
        rule could not fire on it, a `§B-*` defined there escaped the
        one-document rule, and a duplicate anchor there escaped uniqueness.
        """
        write(
            self.project.root,
            "docs/knowledge/archive/retired-feature.md",
            """
            # Feature: checkout (retired 2026-06)

            ## Requirements

            The cart total must include tax before the confirmation step.
            """,
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("feature-archive", result.stdout)

    def test_a_duplicate_anchor_is_found(self) -> None:
        """§M-QC-TESTS — The same anchor defined twice makes references ambiguous."""
        write(
            self.project.root,
            "docs/knowledge/architecture/again.md",
            """
            # Again

            ## §A-BOOT-01 — A second definition

            Implements §B-CORE-01.
            """,
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("duplicate-anchor", result.stdout)

    def test_a_dangling_reference_is_found(self) -> None:
        """§M-QC-TESTS — A citation of an anchor nobody defined is a broken link."""
        write(
            self.project.root,
            "docs/knowledge/architecture/boot.md",
            """
            # Boot

            ## §A-BOOT-01 — One supervised entry point

            Implements §B-ABSENT-99.
            """,
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("dangling-reference", result.stdout)

    def test_a_module_may_not_skip_its_nearest_level(self) -> None:
        """§M-QC-TESTS — A module citing §B directly bypasses the decision that connects them."""
        write(
            self.project.root,
            "src/boot.py",
            '''
            """§M-BOOT — Start the application. Implements §B-CORE-01."""


            def start() -> int:
                """§M-BOOT — Start the process."""
                return 0
            ''',
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("level-skipped", result.stdout)

    def test_a_module_citing_nothing_is_found(self) -> None:
        """§M-QC-TESTS — Citing no §A-* skips the level as surely as reaching past it."""
        write(
            self.project.root,
            "src/boot.py",
            '''
            """§M-BOOT — Start the application."""


            def start() -> int:
                """§M-BOOT — Start the process."""
                return 0
            ''',
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("missing-architecture-link", result.stdout)

    def test_a_module_anchor_claimed_by_two_files_is_found(self) -> None:
        """§M-QC-TESTS — One §M-* in two modules makes `symbol → §M` resolve to both."""
        write(
            self.project.root,
            "src/boot_again.py",
            '''
            """§M-BOOT — Also claims to start the application. Implements §A-BOOT-01."""


            def start_again() -> int:
                """§M-BOOT — Start the process a second time."""
                return 0
            ''',
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("duplicate-anchor", result.stdout)
        self.assertIn("src/boot_again.py", result.stdout)

    def test_a_business_anchor_defined_outside_the_business_document_is_refused(self) -> None:
        """§M-QC-TESTS — The whole business truth must be readable in one file."""
        write(
            self.project.root,
            "docs/knowledge/architecture/boot.md",
            """
            # Boot

            ## §A-BOOT-01 — One supervised entry point

            Implements §B-CORE-01 so startup ordering stays checkable.

            ## §B-SNEAK-01 — A business truth filed under architecture

            Nobody reading business.md will ever see this.
            """,
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("business-outside-document", result.stdout)

    def test_a_malformed_anchor_is_refused_not_reinterpreted(self) -> None:
        """§M-QC-TESTS — `§A-BAD_ONE` must fail, not silently register `§A-BAD`."""
        write(
            self.project.root,
            "docs/knowledge/architecture/boot.md",
            """
            # Boot

            ## §A-BOOT_01 — One supervised entry point

            Implements §B-CORE-01 so startup ordering stays checkable.
            """,
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("malformed-anchor", result.stdout)

    def test_a_parent_section_does_not_borrow_its_child_s_business_link(self) -> None:
        """§M-QC-TESTS — A citation under `### §A-TWO` belongs to §A-TWO alone."""
        write(
            self.project.root,
            "docs/knowledge/architecture/boot.md",
            """
            # Boot

            ## §A-BOOT-01 — A parent decision that cites no business truth

            ### §A-BOOT-02 — A child decision

            Implements §B-CORE-01 so startup ordering stays checkable.
            """,
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("missing-business-link", result.stdout)
        self.assertIn("§A-BOOT-01", result.stdout)

    def test_a_parked_feature_archive_is_refused(self) -> None:
        """§M-QC-TESTS — A retired spec filed under archive/ is a second source of truth."""
        write(
            self.project.root,
            "docs/knowledge/architecture/archive/feature-42.md",
            """
            # Feature 42

            ## §A-OLD-42 — A decision nobody has retired

            Implements §B-CORE-01, allegedly.
            """,
        )
        result = run_checker(self.project.root, "knowledge_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("feature-archive", result.stdout)


class ImportGraphTests(unittest.TestCase):
    """§M-QC-TESTS — The import gate sees relative and literal dynamic imports."""

    def setUp(self) -> None:
        """§M-QC-TESTS — Build a fresh fixture for each test."""
        self.project = FixtureProject()
        self.addCleanup(self.project.dispose)

    def test_an_acyclic_graph_passes(self) -> None:
        """§M-QC-TESTS — A tree with no cycle satisfies the gate."""
        result = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_adopted_roots_must_be_dependency_closed(self) -> None:
        """§M-QC-TESTS — §40's brownfield ratchet, which nothing used to check.

        A manifest saying "these roots are certified" while a certified module
        imports an uncertified one has widened the boundary by an import
        statement rather than by a reviewed adoption change.
        """
        write(
            self.project.root,
            "src/adopted.py",
            '''
            """§M-ADOPTED — Certified code. Implements §A-BOOT-01."""

            import stray


            def use() -> object:
                """§M-ADOPTED — Reach outside the certified boundary."""
                return stray
            ''',
        )
        write(
            self.project.root,
            "src/stray.py",
            '''
            """§M-STRAY — Uncertified code. Implements §A-BOOT-01."""


            def helper() -> int:
                """§M-STRAY — Do something nobody has reviewed under the contract."""
                return 1
            ''',
        )
        write(
            self.project.root,
            "pyproject.toml",
            """
            [tool.meta_o.import_graph]
            source_roots = ["src"]
            first_party_prefixes = ["adopted", "boot", "stray"]
            """,
        )
        write(
            self.project.root,
            ".quality/adoption-manifest.json",
            json.dumps({"schema_version": 1, "adopted_roots": ["src/adopted.py"]}, indent=2) + "\n",
        )
        result = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("closure-broken", result.stdout)
        self.assertIn("stray", result.stdout)

        # Adopting what it depends on closes the boundary.
        write(
            self.project.root,
            ".quality/adoption-manifest.json",
            json.dumps(
                {"schema_version": 1, "adopted_roots": ["src/adopted.py", "src/stray.py"]}, indent=2
            )
            + "\n",
        )
        closed = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(closed.returncode, 0, closed.stdout + closed.stderr)

    def test_a_closure_check_that_cannot_run_says_so(self) -> None:
        """§M-QC-TESTS — Every way this check could decline to run was a silent pass.

        A manifest of the wrong shape, a `fully_adopted` that is not a boolean,
        a root that matches no file — each returned `ok` about a boundary
        nobody had checked, which is precisely what the gate exists to prevent.
        """
        write(
            self.project.root,
            "src/adopted.py",
            '''
            """§M-ADOPTED2 — Certified code. Implements §A-BOOT-01."""

            import stray


            def use() -> object:
                """§M-ADOPTED2 — Reach outside the certified boundary."""
                return stray
            ''',
        )
        write(
            self.project.root,
            "src/stray.py",
            '''
            """§M-STRAY2 — Uncertified code. Implements §A-BOOT-01."""
            ''',
        )
        write(
            self.project.root,
            "pyproject.toml",
            """
            [tool.meta_o.import_graph]
            source_roots = ["src"]
            first_party_prefixes = ["adopted", "boot", "stray"]
            """,
        )

        for manifest, expected in [
            ({"schema_version": 1, "adopted_roots": "src/adopted.py"}, "invalid-manifest"),
            ([{"adopted_roots": ["src"]}], "invalid-manifest"),
            (
                {"schema_version": 1, "adopted_roots": ["src/adopted.py"], "fully_adopted": "no"},
                "invalid-manifest",
            ),
            ({"schema_version": 1, "adopted_roots": ["src/nowhere.py"]}, "unmatched-root"),
            # `./src/adopted.py` names the adopted file and used to match nothing.
            ({"schema_version": 1, "adopted_roots": ["./src/adopted.py"]}, "closure-broken"),
        ]:
            with self.subTest(manifest=manifest):
                write(
                    self.project.root,
                    ".quality/adoption-manifest.json",
                    json.dumps(manifest, indent=2) + "\n",
                )
                result = run_checker(self.project.root, "import_graph.py")
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn(expected, result.stdout)

    def test_an_adopted_module_may_not_reach_an_uncertified_package_body(self) -> None:
        """§M-QC-TESTS — `import a.b` executes `a/__init__.py`, so `a` is a dependency too.

        Certifying `src/pkg/sub.py` and not `src/pkg/__init__.py` looked closed
        while every import of the submodule ran uncertified code first.
        """
        write(
            self.project.root,
            "src/adopted.py",
            '''
            """§M-ADOPTED3 — Certified code. Implements §A-BOOT-01."""

            import stray.sub


            def use() -> object:
                """§M-ADOPTED3 — Reach the certified submodule."""
                return stray.sub
            ''',
        )
        write(
            self.project.root,
            "src/stray/__init__.py",
            '''
            """§M-STRAYPKG — Uncertified package body. Implements §A-BOOT-01."""
            ''',
        )
        write(
            self.project.root,
            "src/stray/sub.py",
            '''
            """§M-STRAYSUB — Certified submodule. Implements §A-BOOT-01."""
            ''',
        )
        write(
            self.project.root,
            "pyproject.toml",
            """
            [tool.meta_o.import_graph]
            source_roots = ["src"]
            first_party_prefixes = ["adopted", "boot", "stray"]
            """,
        )
        write(
            self.project.root,
            ".quality/adoption-manifest.json",
            json.dumps(
                {
                    "schema_version": 1,
                    "adopted_roots": ["src/adopted.py", "src/stray/sub.py"],
                },
                indent=2,
            )
            + "\n",
        )
        result = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("reaches stray", result.stdout)

    def test_a_relative_import_cycle_is_found(self) -> None:
        """§M-QC-TESTS — `from . import x` forms a real edge, so it can form a real cycle."""
        write(
            self.project.root,
            "src/alpha.py",
            '''
            """§M-ALPHA — One half of a cycle. Implements §A-BOOT-01."""

            from . import beta


            def use() -> object:
                """§M-ALPHA — Touch the other module."""
                return beta
            ''',
        )
        write(
            self.project.root,
            "src/beta.py",
            '''
            """§M-BETA — The other half of a cycle. Implements §A-BOOT-01."""

            from . import alpha


            def use() -> object:
                """§M-BETA — Touch the other module."""
                return alpha
            ''',
        )
        result = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("new-cycle", result.stdout)

    def test_a_literal_dynamic_import_forms_an_edge(self) -> None:
        """§M-QC-TESTS — `import_module("x")` with a literal is as real as an import statement."""
        write(
            self.project.root,
            "src/alpha.py",
            '''
            """§M-ALPHA — One half of a cycle. Implements §A-BOOT-01."""

            import importlib


            def use() -> object:
                """§M-ALPHA — Reach the other module dynamically."""
                return importlib.import_module("beta")
            ''',
        )
        write(
            self.project.root,
            "src/beta.py",
            '''
            """§M-BETA — The other half of a cycle. Implements §A-BOOT-01."""

            import importlib


            def use() -> object:
                """§M-BETA — Reach the other module dynamically."""
                return importlib.import_module("alpha")
            ''',
        )
        result = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("new-cycle", result.stdout)

    def test_a_non_literal_dynamic_import_is_reported_not_ignored(self) -> None:
        """§M-QC-TESTS — What cannot be resolved statically must still be visible."""
        write(
            self.project.root,
            "src/alpha.py",
            '''
            """§M-ALPHA — Dynamic loader. Implements §A-BOOT-01."""

            import importlib


            def use(name: str) -> object:
                """§M-ALPHA — Import whatever the caller names."""
                return importlib.import_module(name)
            ''',
        )
        result = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(result.returncode, 0)
        self.assertIn("non-literal dynamic import", result.stdout)

    def test_a_self_import_is_a_cycle_of_one(self) -> None:
        """§M-QC-TESTS — A module importing itself is the smallest cycle, and still a cycle."""
        write(
            self.project.root,
            "src/selfy.py",
            '''
            """§M-SELFY — Imports itself. Implements §A-BOOT-01."""

            import selfy


            def go() -> int:
                """§M-SELFY — Do nothing useful."""
                return selfy.go()
            ''',
        )
        result = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("self-import", result.stdout)

    def test_a_renamed_module_still_imported_by_name_is_blocked(self) -> None:
        """§M-QC-TESTS — The half of the boundary rule that had become unreachable.

        Imports were attributed to the *nearest* known module, walking the
        dotted prefix down until something matched — so `boot.missing` folded
        back onto the package that contains it, no boundary violation was
        recorded, and a spurious edge to the package was invented on the way.
        In any layout with `__init__.py`, which is most of them, the rule could
        not fire at all.
        """
        write(self.project.root, "src/__init__.py", "")
        write(
            self.project.root,
            "src/boot_again.py",
            '''
            """§M-BOOT-AGAIN — Import something that was renamed away. Implements §A-BOOT-01."""

            from boot.missing import gone
            ''',
        )
        result = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("boot.missing", result.stdout)
        self.assertIn("unknown-boundary", result.stdout)

    def test_a_symbol_imported_from_a_real_module_is_not_a_missing_module(self) -> None:
        """§M-QC-TESTS — The refinement `from x import y` offers is a symbol, not a claim."""
        write(
            self.project.root,
            "src/boot_again.py",
            '''
            """§M-BOOT-AGAIN — Use a symbol from a module that exists. Implements §A-BOOT-01."""

            from boot import start
            ''',
        )
        result = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_an_unknown_first_party_boundary_is_blocked(self) -> None:
        """§M-QC-TESTS — A module matching no declared prefix has no boundary to be inside."""
        write(
            self.project.root,
            "pyproject.toml",
            """
            [tool.meta_o.import_graph]
            source_roots = ["src"]
            first_party_prefixes = ["app"]
            """,
        )
        result = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("unknown-boundary", result.stdout)

    def test_freezing_the_baseline_does_not_swallow_a_contract_violation(self) -> None:
        """§M-QC-TESTS — The baseline forgives cycles and coupling, and nothing else."""
        write(
            self.project.root,
            "pyproject.toml",
            """
            [tool.meta_o.import_graph]
            source_roots = ["src"]
            first_party_prefixes = ["app"]
            """,
        )
        result = run_checker(self.project.root, "import_graph.py", "--write-baseline")
        self.assertEqual(result.returncode, 1)
        self.assertIn("unknown-boundary", result.stdout)
        self.assertFalse((self.project.root / ".quality" / "import-graph-baseline.json").exists())

    def test_freezing_the_baseline_does_not_forgive_a_coupling_regression(self) -> None:
        """§M-QC-TESTS — Re-freezing grown coupling is the escape the ratchet exists to close."""
        for name in ("alpha", "beta", "gamma"):
            write(
                self.project.root,
                f"src/{name}.py",
                f'''
                """§M-{name.upper()} — A leaf module. Implements §A-BOOT-01."""


                def use() -> int:
                    """§M-{name.upper()} — Do nothing in particular."""
                    return 0
                ''',
            )
        write(
            self.project.root,
            "src/hub.py",
            '''
            """§M-HUB — Depends on one leaf. Implements §A-BOOT-01."""

            from . import alpha


            def use() -> int:
                """§M-HUB — Touch the leaf."""
                return alpha.use()
            ''',
        )
        frozen = run_checker(self.project.root, "import_graph.py", "--write-baseline")
        self.assertEqual(frozen.returncode, 0, frozen.stdout + frozen.stderr)

        write(
            self.project.root,
            "src/hub.py",
            '''
            """§M-HUB — Depends on three leaves now. Implements §A-BOOT-01."""

            from . import alpha, beta, gamma


            def use() -> int:
                """§M-HUB — Touch every leaf."""
                return alpha.use() + beta.use() + gamma.use()
            ''',
        )
        grown = run_checker(self.project.root, "import_graph.py")
        self.assertEqual(grown.returncode, 1)
        self.assertIn("fan-out grew", grown.stdout)

        refrozen = run_checker(self.project.root, "import_graph.py", "--write-baseline")
        self.assertEqual(refrozen.returncode, 1, refrozen.stdout + refrozen.stderr)
        self.assertIn("fan-out grew", refrozen.stdout)
        baseline = json.loads(
            (self.project.root / ".quality" / "import-graph-baseline.json").read_text("utf-8")
        )
        self.assertEqual(baseline["fan_out"]["hub"], 1)


class CodeHealthTests(unittest.TestCase):
    """§M-QC-TESTS — The structural gate holds thresholds and ratchets the baseline."""

    def setUp(self) -> None:
        """§M-QC-TESTS — Build a fresh fixture for each test."""
        self.project = FixtureProject()
        self.addCleanup(self.project.dispose)

    def test_a_small_tree_passes(self) -> None:
        """§M-QC-TESTS — Code inside every threshold satisfies the gate."""
        result = run_checker(self.project.root, "code_health.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_an_overlong_function_is_found(self) -> None:
        """§M-QC-TESTS — A function past the configured length is reported."""
        body = "\n".join(f"    value_{index} = {index}" for index in range(30))
        write(
            self.project.root,
            "src/boot.py",
            '"""§M-BOOT — Start the application. Implements §A-BOOT-01."""\n\n\n'
            "def start() -> int:\n"
            '    """§M-BOOT — Start the process."""\n'
            f"{body}\n"
            "    return 0\n",
        )
        result = run_checker(self.project.root, "code_health.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("function-lines", result.stdout)

    def test_a_baseline_forgives_only_what_it_froze(self) -> None:
        """§M-QC-TESTS — A frozen violation may not grow; the ratchet turns one way."""
        body = "\n".join(f"    value_{index} = {index}" for index in range(30))
        write(
            self.project.root,
            "src/boot.py",
            '"""§M-BOOT — Start the application. Implements §A-BOOT-01."""\n\n\n'
            "def start() -> int:\n"
            '    """§M-BOOT — Start the process."""\n'
            f"{body}\n"
            "    return 0\n",
        )
        frozen = run_checker(self.project.root, "code_health.py", "--write-baseline")
        self.assertEqual(frozen.returncode, 0, frozen.stdout + frozen.stderr)

        tolerated = run_checker(self.project.root, "code_health.py")
        self.assertEqual(tolerated.returncode, 0, tolerated.stdout)
        self.assertIn("tolerated", tolerated.stdout)

        longer = "\n".join(f"    value_{index} = {index}" for index in range(60))
        write(
            self.project.root,
            "src/boot.py",
            '"""§M-BOOT — Start the application. Implements §A-BOOT-01."""\n\n\n'
            "def start() -> int:\n"
            '    """§M-BOOT — Start the process."""\n'
            f"{longer}\n"
            "    return 0\n",
        )
        regressed = run_checker(self.project.root, "code_health.py")
        self.assertEqual(regressed.returncode, 1)
        self.assertIn("baseline froze this at", regressed.stdout)


class BoundaryDefaultTests(unittest.TestCase):
    """§M-QC-TESTS — A boundary nobody declared is not a boundary that passes."""

    def test_an_empty_prefix_list_is_a_violation_not_a_free_pass(self) -> None:
        """§M-QC-TESTS — §40 states the unknown-boundary FAIL unconditionally."""
        # With no prefixes, nothing is first-party, no import can be found
        # dangling, and the gate reported ok for every possible project — the
        # checker's own default made the requirement opt-in and then opted out.
        project = FixtureProject()
        self.addCleanup(project.dispose)
        write(
            project.root,
            "pyproject.toml",
            """
            [tool.meta_o.import_graph]
            source_roots = ["src"]
            """,
        )
        result = run_checker(project.root, "import_graph.py")
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn("no-boundary", result.stdout)


class E2ECheckerTests(unittest.TestCase):
    """§M-QC-TESTS — The catalog gate protects the selection plan and the metadata commit."""

    def setUp(self) -> None:
        """§M-QC-TESTS — Build a fresh fixture for each test."""
        self.project = FixtureProject()
        self.addCleanup(self.project.dispose)

    def test_a_valid_catalog_passes(self) -> None:
        """§M-QC-TESTS — A well-formed registry with a canary satisfies the gate."""
        result = run_checker(self.project.root, "e2e_check.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_a_catalog_without_a_canary_is_rejected(self) -> None:
        """§M-QC-TESTS — Without an always_required scenario an empty plan becomes possible."""
        registry = json.loads((self.project.root / "docs/architecture/e2e.json").read_text())
        registry["scenarios"][0]["always_required"] = False
        write(self.project.root, "docs/architecture/e2e.json", json.dumps(registry, indent=2) + "\n")
        result = run_checker(self.project.root, "e2e_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("no-canary", result.stdout)

    def test_a_missing_reference_document_is_a_failure_not_a_skip(self) -> None:
        """§M-QC-TESTS — A check that cannot resolve its target must not report ok."""
        # Both link checks were guarded on the anchor set being non-empty, and
        # an unreadable file yields an empty set — so moving either document
        # turned its check off and a registry of dangling references passed.
        for document in ("docs/knowledge/business.md", "docs/architecture/e2e.md"):
            with self.subTest(document=document):
                project = FixtureProject()
                self.addCleanup(project.dispose)
                (project.root / document).unlink()
                result = run_checker(project.root, "e2e_check.py")
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn("missing-document", result.stdout)

    def test_a_screenshot_or_raw_log_may_not_enter_the_catalog(self) -> None:
        """§M-QC-TESTS — §10 confines this file to a catalog and compact last-run metadata."""
        registry = json.loads((self.project.root / "docs/architecture/e2e.json").read_text())
        registry["scenarios"][0]["screenshots"] = ["shot.png"]
        registry["scenarios"][0]["reasoning"] = "it looked right to me"
        registry["scenarios"][0]["last_run"] = {
            "snapshot_digest": "d",
            "provenance_commit": "c",
            "run_id": "r",
            "spec_sha256": "s",
            "verified_at": "2026-07-24T00:00:00Z",
            "status": "passed",
            "environment": "local",
            "raw_stdout": "2000 lines of pytest output",
        }
        write(self.project.root, "docs/architecture/e2e.json", json.dumps(registry, indent=2) + "\n")
        result = run_checker(self.project.root, "e2e_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("'screenshots'", result.stdout)
        self.assertIn("'reasoning'", result.stdout)
        self.assertIn("'raw_stdout'", result.stdout)

    def test_the_registry_root_is_a_closed_schema_too(self) -> None:
        """§M-QC-TESTS — Unknown-field rejection stopped at the scenario boundary.

        `scenarios[*]` and `last_run` were closed and the root object was not,
        so `screenshots` and `notes` beside `scenarios` were accepted — in the
        one file §10 says holds only a machine-readable catalog and compact
        last-run metadata.
        """
        registry = json.loads((self.project.root / "docs/architecture/e2e.json").read_text())
        registry["screenshots"] = {"E2E-SMOKE-01": "shot.png"}
        registry["notes"] = "reasoning about the run"
        write(self.project.root, "docs/architecture/e2e.json", json.dumps(registry, indent=2) + "\n")
        result = run_checker(self.project.root, "e2e_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("'screenshots'", result.stdout)
        self.assertIn("'notes'", result.stdout)

    def test_a_gate_that_discovered_nothing_fails(self) -> None:
        """§M-QC-TESTS — §40 makes an unexpected skip a FAIL, and this is the largest one.

        The skip list was matched against the *absolute* path, so a checkout
        living under any directory named `build`, `dist`, `venv` or `.tox`
        discovered no files and four gates reported `ok` about a tree they had
        never opened.
        """
        write(
            self.project.root,
            "pyproject.toml",
            """
            [tool.meta_o.purpose]
            source_roots = ["not_a_directory"]
            """,
        )
        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("nothing-discovered", result.stdout)

    def test_a_package_named_build_is_judged_and_an_output_tree_is_not(self) -> None:
        """§M-QC-TESTS — Skipping `build` by name hid source the gate must judge.

        `build` and `dist` are output directory names, and they are also
        perfectly ordinary package names. Skipping both meant a real package
        under `src/build/` was never opened and the gate said `ok` about it —
        the silent under-coverage §40 makes a FAIL. An `__init__.py` is what
        tells the two apart.
        """
        write(self.project.root, "src/build/__init__.py", "")
        write(self.project.root, "src/build/module.py", "def undocumented():\n    return 1\n")
        write(self.project.root, "src/dist/artifact.py", "def generated():\n    return 1\n")

        result = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("src/build/module.py", result.stdout)
        self.assertNotIn("src/dist/artifact.py", result.stdout)

    def test_a_malformed_config_stops_the_gate_instead_of_shrinking_it(self) -> None:
        """§M-QC-TESTS — `load_config` promised this and delivered half of it.

        `skip_dirs = "venv"` is a string, and a string iterates character-wise:
        discovery quietly started skipping directories named `v`, `e` and `n`,
        and the gate reported `ok` about files it had never opened. A misspelled
        key was merged in and ignored for the same reason — nothing checked that
        the key existed.
        """
        for table, expected in [
            ('[tool.meta_o.discovery]\npackage_dirs = "build"', "must be a list"),
            ("[tool.meta_o.discovery]\nskip_dirs = [1, 2]", "must be a string"),
            ('[tool.meta_o.purpose]\nsource_root = ["src"]', "has no key 'source_root'"),
        ]:
            with self.subTest(table=table):
                write(self.project.root, "pyproject.toml", table + "\n")
                result = run_checker(self.project.root, "purpose_check.py")
                self.assertEqual(result.returncode, 1)
                self.assertIn(expected, result.stdout + result.stderr)

    def test_a_project_may_say_which_directories_are_output_trees(self) -> None:
        """§M-QC-TESTS — The `__init__.py` heuristic cannot see every real package.

        A PEP 420 namespace package under `src/build/` carries no `__init__.py`
        and was skipped silently; a generated tree that happens to carry one was
        judged. Neither is decidable from the name, so the list is configurable
        and this proves the override actually reaches discovery.
        """
        write(self.project.root, "src/build/sub/__init__.py", "")
        write(self.project.root, "src/build/sub/real_source.py", "def undocumented():\n    return 1\n")

        silent = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(silent.returncode, 0, silent.stdout)

        write(
            self.project.root,
            "pyproject.toml",
            """
            [tool.meta_o.discovery]
            package_dirs = []
            """,
        )
        judged = run_checker(self.project.root, "purpose_check.py")
        self.assertEqual(judged.returncode, 1)
        self.assertIn("src/build/sub/real_source.py", judged.stdout)

    def test_a_dangling_business_link_is_rejected(self) -> None:
        """§M-QC-TESTS — A scenario must verify a business truth that actually exists."""
        registry = json.loads((self.project.root / "docs/architecture/e2e.json").read_text())
        registry["scenarios"][0]["business_links"] = ["§B-ABSENT-99"]
        write(self.project.root, "docs/architecture/e2e.json", json.dumps(registry, indent=2) + "\n")
        result = run_checker(self.project.root, "e2e_check.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("dangling-business-link", result.stdout)

    def test_the_metadata_guard_accepts_a_last_run_only_commit(self) -> None:
        """§M-QC-TESTS — Recording a verification result is the one permitted late change."""
        registry = json.loads((self.project.root / "docs/architecture/e2e.json").read_text())
        registry["scenarios"][0]["last_run"] = {
            "snapshot_digest": "a" * 64,
            "provenance_commit": "b" * 40,
            "run_id": "00000000-0000-4000-8000-000000000000",
            "spec_sha256": "c" * 64,
            "verified_at": "2026-01-01T00:00:00Z",
            "status": "passed",
            "environment": "local:docker-compose",
        }
        write(self.project.root, "docs/architecture/e2e.json", json.dumps(registry, indent=2) + "\n")
        git(self.project.root, "add", "-A")
        git(self.project.root, "commit", "--quiet", "-m", "record last_run")

        result = run_checker(self.project.root, "e2e_check.py", "--metadata-guard")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_the_metadata_guard_rejects_a_catalog_change(self) -> None:
        """§M-QC-TESTS — Renaming a scenario after attestation invalidates the snapshot."""
        registry = json.loads((self.project.root / "docs/architecture/e2e.json").read_text())
        registry["scenarios"][0]["tags"] = ["smoke", "sneaky"]
        write(self.project.root, "docs/architecture/e2e.json", json.dumps(registry, indent=2) + "\n")
        git(self.project.root, "add", "-A")
        git(self.project.root, "commit", "--quiet", "-m", "sneak a catalog change through")

        result = run_checker(self.project.root, "e2e_check.py", "--metadata-guard")
        self.assertEqual(result.returncode, 1)
        self.assertIn("catalog fields", result.stdout)

    def test_the_metadata_guard_rejects_an_unrelated_change(self) -> None:
        """§M-QC-TESTS — The metadata commit may touch the registry and nothing else."""
        write(self.project.root, "src/extra.py", '"""§M-EXTRA — Implements §A-BOOT-01."""\n')
        git(self.project.root, "add", "-A")
        git(self.project.root, "commit", "--quiet", "-m", "smuggle a source change")

        result = run_checker(self.project.root, "e2e_check.py", "--metadata-guard")
        self.assertEqual(result.returncode, 1)
        self.assertIn("also changed", result.stdout)


class RunnerTests(unittest.TestCase):
    """§M-QC-TESTS — The aggregator refuses the three silent ways to pass."""

    def setUp(self) -> None:
        """§M-QC-TESTS — Build a fresh fixture for each test."""
        self.project = FixtureProject()
        self.addCleanup(self.project.dispose)

    def _manifest(self, gates: list[dict[str, object]]) -> None:
        """§M-QC-TESTS — Install a QC manifest into the fixture project."""
        write(
            self.project.root,
            ".quality/qc-manifest.json",
            json.dumps({"schema_version": 1, "gates": gates}, indent=2) + "\n",
        )

    def test_a_missing_tool_fails_instead_of_skipping(self) -> None:
        """§M-QC-TESTS — The commonest way for a gate to die is for its tool to vanish."""
        self._manifest([{"id": "lint", "command": "definitely-not-installed --check", "policy": "passed"}])
        result = run_checker(self.project.root, "run_qc.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("not installed", result.stdout + result.stderr)

    def test_a_mutating_gate_is_invalid(self) -> None:
        """§M-QC-TESTS — A gate that rewrites the tree cannot attest the tree."""
        self._manifest(
            [
                {
                    "id": "format-check",
                    "command": f"{sys.executable} -c \"open('mutated.txt','w').write('x')\"",
                    "policy": "passed",
                }
            ]
        )
        result = run_checker(self.project.root, "run_qc.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("mutated the worktree", result.stdout + result.stderr)

    def test_a_gate_that_rewrites_an_already_dirty_file_is_invalid(self) -> None:
        """§M-QC-TESTS — The dirty tree is where a stray rewrite hides best.

        Mutation used to be inferred from the text of `git status --porcelain`,
        which prints the same two characters and the same path whether or not
        the file behind them changed. A formatter rewriting a file that was
        already modified left that text identical, so the check passed and the
        run wrote an attestable green result for content the gate had altered.
        """
        target = self.project.root / "src" / "boot.py"
        formatter = (
            f"{sys.executable} -c \"from pathlib import Path; "
            "p=Path('src/boot.py'); p.write_text(p.read_text() + '# rewritten by the gate\\n')\""
        )
        self._manifest([{"id": "format-check", "command": formatter, "policy": "passed"}])

        target.write_text(target.read_text() + "# work in progress\n", encoding="utf-8")
        result = run_checker(self.project.root, "run_qc.py")

        self.assertEqual(result.returncode, 1)
        self.assertIn("mutated the worktree", result.stdout + result.stderr)
        self.assertIn("# rewritten by the gate", target.read_text(encoding="utf-8"))

    def test_the_result_records_every_declared_gate(self) -> None:
        """§M-QC-TESTS — A gate absent from the result is never treated as a pass."""
        self._manifest(
            [
                {"id": "tests", "command": f"{sys.executable} -c \"pass\"", "policy": "passed"},
                {
                    "id": "build-policy",
                    "command": "python3 -m build",
                    "policy": "not_applicable",
                    "rationale": "no distributable artifact",
                },
            ]
        )
        destination = self.project.root / "qc-result.json"
        environment = {
            **os.environ,
            "META_O_QC_RESULT": str(destination),
            "META_O_SNAPSHOT_DIGEST": "d" * 64,
        }
        result = subprocess.run(
            [sys.executable, str(QUALITY / "run_qc.py")],
            cwd=self.project.root,
            capture_output=True,
            text=True,
            check=False,
            env=environment,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        written = json.loads(destination.read_text(encoding="utf-8"))
        self.assertEqual(written["schema_version"], 1)
        self.assertEqual(written["snapshot_digest"], "d" * 64)
        self.assertEqual(
            sorted((gate["id"], gate["status"]) for gate in written["gates"]),
            [("build-policy", "not_applicable"), ("tests", "passed")],
        )


if __name__ == "__main__":
    unittest.main()
