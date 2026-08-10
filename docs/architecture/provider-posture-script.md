# Provider posture has one probe and a required consumer

Because _a gate whose full verdict cannot be read is unknown_ and _the previous
generation was too thick_ — launch resolution must be deterministic without
becoming a provider proxy or orchestration runtime.

## Decision

`shared/scripts/mo-posture.sh` owns the zsh/bash launch-resolution protocol. The
build copies it byte-for-byte into `mo-herdr`, `mo-omnigent` and `mo-setup` so
each installed skill is self-contained. The script diagnoses command kind and
first executable path; it never launches a provider, changes configuration,
stores run state or decides that an actor surface is supported.

The backend skill is the consumer. Before actor creation it performs two
separate commands from its own installed directory:

```text
scripts/mo-posture.sh --self-check --shell all
scripts/mo-posture.sh --shell <zsh|bash|all> -- <selected-providers>
```

The first command syntax-checks both embedded child probes with the interpreters
that will execute them. It does not inspect profiles and cannot substitute for
the matrix. The second command measures every shell startup mode applicable to
the planned launch parent.

Topology mutation requires both commands to succeed, a complete status-0 matrix
for every applicable shell, and no selected provider whose accepted record says
`type=missing` or `path=missing`. Status 1 is a real kind/path divergence; status
2 is incomplete or unreadable evidence. Only the fixed classification, decoded
command kind and first resolved path enter orchestrator context.

This consumer closes a former architecture gap: shipping a probe without making
preflight use it left posture as advice. It still does not conflate resolution
with launchability. Provider readiness, model activation, entitlement,
workspace trust and permission behavior remain separate exact live fixtures.

## Evidence contract

Each requested shell measures four explicit startup modes. A child records NUL
framed provider name, command kind and first executable path into a private
channel. The parent validates framing and emits unambiguous `MO_POSTURE` records
with Bash `%q` encoding, plus one `MO_POSTURE_MATRIX` status per requested shell.

Exit meanings are:

- 0 — command kinds and first paths are identical across all measured modes;
- 1 — at least one accepted kind or path differs;
- 2 — evidence is incomplete, malformed or unsafe to obtain.

A consistently missing provider can be structurally well-formed and still makes
that selected provider unusable to the backend consumer. Matrix structure and
launch support are deliberately separate judgements.

Profile stdout and stderr travel outside the evidence channel and are reported
only as presence markers. A greeting does not corrupt a matrix, and its bytes
are never reproduced. A blocking profile, material initialization error or
unreadable lookup makes the affected evidence unknown.

## Startup safety

The script is executed directly so its privileged `/bin/bash -p` shebang takes
effect before caller-controlled Bash startup state can run. Prefixing it with
`bash` bypasses that boundary and is unsupported.

The runner requires `/bin/bash` 3.2+, `/usr/bin/printf`,
`/usr/bin/false` and `/bin/sleep` at those absolute paths, with `mktemp` and
`rm` from the system utility path. A requested Bash matrix also requires
`/usr/bin/env -0`. Absence of that compatibility boundary is unknown rather than
permission to substitute a different interpreter.

`BASH_ENV` remains exported into measured child Bash modes. Inherited
`SHELLOPTS`, `BASHOPTS` or exported Bash functions make a Bash matrix unknown:
replaying arbitrary caller code is unsafe, while silently dropping it would
measure a different launch. Validated builtins prevent profile functions,
aliases or dispatch shadows from forging accepted records.

Each measured shell runs under a process-group ownership anchor. Normal
completion quiesces the group before captures are read; signal and failure paths
terminate its members before the anchor is reaped. A descendant that cannot be
quiesced makes the result unknown. The private directory is removed through
path-guarded cleanup.

## Verification split

Deterministic tests use a fixed fake `PATH`, fake shell/profile fixtures,
malformed framing, inherited-state cases, dispatch shadows, process-group
shutdown and status precedence. `make mo-lint` also runs the first self-check.

Those tests prove the consumer and parser contract, not a real subscription
surface. The live posture fixture separately records the exact provider,
version, backend launch parent, trust/permission cycle and first executable
actually used. Neither kind of evidence inherits the other's conclusion.

## Rejected

- **Prose-only shell snippets.** Fragile quoting needs one executable owner.
- **A probe with no backend consumer.** Diagnostics that never gate topology do
  not protect a run.
- **Treating matrix status as provider launchability.** Resolution cannot prove
  readiness, model activation, entitlement or trust.
- **Wrapping provider CLIs.** The probe observes resolution and never becomes
  the invocation path.
- **Printing aliases, functions, profiles or wrapper bodies.** They may contain
  credentials or private prompts and are unnecessary to classify kind/path.
