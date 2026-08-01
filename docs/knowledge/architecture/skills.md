# Architecture — skills, tooling and safety

## §A-SKILL-TOOLING — Prompts decide; a binary computes

Implements §B-TRUST-01.

The skills under `skills/` are prompts. Everything in them that has to be
*exact* — a digest, a transition, a routing decision, a gate verdict, a
completion proof — is delegated to the `meta-o` CLI, which computes it once,
identically, and testably (`src/cli/`).

This is a division of labour, not distrust of models. A model asked to recompute
a sha256 over a sorted file list will produce something that looks like a
digest. A model asked whether a run may complete will reason its way to a
defensible-sounding yes. Neither failure is visible in the output. Both vanish
when the answer comes from code with a test behind it.

The router is deliberately flat and data-driven: reading `meta-o run route
--run-id X` in a skill should tell you exactly what will run, and `meta-o help`
enumerates the real surface rather than a hand-maintained list that drifts.

The backend appears in the orchestrator skill's *name* —
`orchestrate-feature-herdr` — rather than as a parameter. Session semantics
differ enough between backends that one prompt pretending to cover all of them
would be vague about all of them; a second backend gets a second skill and a
second adapter, and the two can disagree honestly.

## §A-SECURITY — Redact at the boundary, and confirm what leaves the machine

Implements §B-SAFETY-01.

Redaction runs where text crosses out of the machine's trust boundary: session
output the orchestrator reads, error messages the CLI reports, tails the
watchdog classifies (`src/core/redact.mts`). It is both name-based
(`*_API_KEY`, `password`, `token`) and value-based (`sk-`, `ghp_`, `AKIA`, JWTs,
PEM blocks, URL credentials).

Doing it at the boundary rather than at each call site is the point: a redaction
that must be remembered is a redaction that will be forgotten in the one code
path that mattered.

The remaining rules are refusals rather than mitigations. The user confirms the
model providers a project may use. External specs are HTTPS only, at most three
redirects and 10 MiB decompressed, and their bytes are never executed.
Production E2E requires an explicit production-safe contract *and* the user's
confirmation for that run — there is no flag that skips it.
