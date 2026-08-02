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

The manifest is only half of the contract, so `src/core/policy.mts` compares the
other half: the `[tool.meta_o.*]` thresholds the gates enforce and the ratchet
baselines they were allowed to forgive. Comparing commands alone proves the same
script still runs while saying nothing about the numbers inside it — and a gate
whose limit moved to meet the code has stopped being a limit. A key the TOML
subset cannot read is reported as an unread key rather than skipped, because a
key this cannot read is a key whose weakening it cannot detect.

Gates run through `withGateWorktree` (`src/core/worktree.mts`), reached from
`meta-o worktree run`: a detached checkout of the candidate, `$META_O_QC_RESULT`
pointing into the run's external directory, and a post-condition that the
checkout is unchanged. The formatter that "fixes" the file it was asked to check
is the canonical failure here — its exit status says pass, and the thing that
passed is no longer the thing anyone attested.

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

`docs/todo.md` is part of the required contract for an unobvious reason. A run
regularly finds real debt in code its spec never mentioned, and both available
responses are bad: fixing it widens a reviewed change past what was approved,
and ignoring it loses the finding. A file to write one line in is what makes the
third response possible.

`.quality/adoption-manifest.json` (`src/core/adoption.mts`) is optional and
records which dependency-closed roots a brownfield adoption has certified.
Where it exists, `run set-candidate` refuses a candidate that changes source
outside them: adoption is incremental, but a boundary that any feature may widen
in passing is not a boundary. Documentation and the knowledge layer are never
fenced off, because a feature that could not update the chain outside an adopted
root could not keep the chain true.

Preflight also probes the backend and compares it to the baseline the full
capability suite recorded at install time. A backend that quietly lost a
capability produces a run that dies hours later for reasons nobody connects to
last week's upgrade; naming the regression at preflight is the difference
between a diagnosis and a mystery.
