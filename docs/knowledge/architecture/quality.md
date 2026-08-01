# Architecture — the mechanical quality gate

## §A-AUTHORITATIVE-QC — `make qc` belongs to the project, and its result is a document

Implements §B-WORKFLOW-03.

meta-o bundles no linter, no test runner and no language profile. It defines a
contract: a `make qc` target that is non-mutating, aggregates the project's
blocking gates, and writes a machine-readable result to `$META_O_QC_RESULT`.

Bundling the implementation was rejected deliberately. It would make every
project's gate identical and unowned — and an unowned gate is one nobody repairs
when it is wrong for their codebase. `templates/python/` is therefore a starter
profile to copy and modify, not a dependency.

What meta-o does own is the refusal to infer a pass (`src/core/qc.mts`). A
missing result is never a pass. A declared gate that produced no result fails. A
gate that reports `not_applicable` without the manifest authorising it fails. A
result attesting a different snapshot fails. Every one of these otherwise looks
exactly like success.

`detectWeakening` compares the manifest against the run's base revision, because
the executor is the party the gate constrains and must not be able to relax it
quietly. A removed gate, a downgraded policy or a rewritten command reaches the
user, who decides.

## §A-PROJECT-CONTRACT — Preflight checks the contract mechanically, and pauses if it is absent

Implements §B-WORKFLOW-03.

A run that starts without a QC target, a knowledge layer or an E2E catalog will
discover the gap several hours later, at the gate, with a worker session already
paid for.

`runPreflight` checks all of it up front (`src/core/preflight.mts`): a clean
worktree, a `qc` target that really exists in the Makefile, a valid manifest, a
valid E2E catalog whose business links resolve, and the knowledge documents. A
missing contract routes to `PAUSED_MISSING_TOOLS` and asks the user whether the
executor may create it — because creating a quality contract on someone's
behalf, unasked, is a larger decision than it looks.

The `verify-e2e-metadata` target is checked but does not block: it is a
recommended guard, and a project without one is behind, not broken.
