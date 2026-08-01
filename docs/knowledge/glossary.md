# Glossary

Words this project uses in a narrower sense than English does.

**Attestation** — a recorded statement that one gate checked one specific
snapshot digest and reached a verdict. Not a claim about "the code"; a claim
about identifiable content.

**Backend** — the system that owns model sessions: panes, lifecycle, resume,
delivery. Herdr today, others later. meta-o never implements one.

**Candidate** — the clean local commit the executor offers for verification.
Provenance is its commit OID; identity is its snapshot digest.

**Effect** — an observable consequence of a backend call: a session that now
exists, a prompt that was delivered. The protocol reasons about effects, never
about whether a function returned.

**Executor** — the single role permitted to write to the repository.

**Finding** — a structured, evidenced objection raised by a reviewer, with a
classification (`defect`, `engineering_risk`, `taste`) and a recommended fix.

**Gate** — one mechanical or model-driven check whose verdict is recorded
against a digest: QC, reviewer A, reviewer B, the selected E2E set.

**ModelSet** — the four models a run uses, confirmed by the user: executor,
primary reviewer, cross-vendor reviewer, E2E tester.

**Orchestrator** — the role that owns the FSM and addresses work. It reads no
code and forms no opinion about it.

**Pending operation** — the write-ahead record of a backend side effect that has
been intended but not yet proven. At most one exists per run.

**Projection** — the canonical-JSON view of the E2E registry with
`scenarios[*].last_run` removed. It is what the snapshot digest covers, so
recording a verification result does not invalidate the verification.

**Reconcile** — determining, from evidence rather than assumption, whether an
interrupted effect happened. Its honest answer may be `unknown`, which pauses
the run.

**Run** — one attempt to take one immutable spec to `COMPLETE`.

**Selection plan** — the set of E2E scenarios chosen for a candidate, sealed
with a digest, and attested for completeness by both reviewers.

**Snapshot digest** — the content identity of a tracked tree: sha256 over sorted
`mode + identity + path` lines. A rebase that preserves the tree preserves the
digest; changing any tracked byte does not.

**Stabilization loop** — the review loop and the E2E loop. They are separate so
that a small behavioural fix does not restart two expensive reviews.

**Worker** — any non-orchestrator session: executor, reviewer, E2E tester, reuse
researcher, adjudicator. Workers are expendable and are replaced, never nursed.
