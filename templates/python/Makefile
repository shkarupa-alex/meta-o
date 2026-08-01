# §M-QC-MAKEFILE — The project's authoritative quality contract.
#
# `make qc` is the only entry point the workflow requires, and it must work with
# no CI, no network and no orchestrator present. Every other target here exists
# so that a human can run one piece in isolation; `qc` is what a gate runs.
#
# Non-mutating by contract: `qc` may not reformat, regenerate or fetch anything.
# A gate that changes the worktree cannot attest the snapshot it was given.

.PHONY: format format-check lint typecheck test build smoke e2e verify-e2e-metadata qc

PYTHON ?= python3

format:
	ruff format .

format-check:
	ruff format --check .

lint:
	ruff check .

typecheck:
	mypy .

test:
	pytest -q

build:
	$(PYTHON) -m build

smoke:
	@echo "define the project's build/boot/health check here"

e2e:
	@echo "define the project's E2E entry point here; see docs/architecture/e2e.md"

# Rewrites nothing: proves that the last_run metadata commit stayed inside its
# permitted field. Called after the four attestations agree, never before.
verify-e2e-metadata:
	$(PYTHON) quality/e2e_check.py --metadata-guard

# The authoritative gate. Aggregates every declared gate from
# .quality/qc-manifest.json, writes the machine-readable result to
# $META_O_QC_RESULT when the orchestrator set it, and fails on a missing tool,
# an unexpected skip or a mutated worktree.
qc:
	$(PYTHON) quality/run_qc.py
