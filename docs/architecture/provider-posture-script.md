# Provider posture has one probe and required consumers

## Decision

`shared/scripts/mo-posture.sh` owns the zsh/bash launch-resolution diagnostic.
The build copies it byte-for-byte into all three orchestration skills and
`mo-setup`, making each install standalone without adding a provider proxy.

Consumers run it directly from their installed directory:

```text
scripts/mo-posture.sh --self-check --shell all
scripts/mo-posture.sh --shell <zsh|bash|all> -- <selected-providers>
```

The probe classifies command kind and first path across applicable shell modes.
It never launches a provider, changes configuration, stores run state or decides
backend support. Missing, divergent, malformed or incomplete evidence is not
support. Actual harness readiness, model activation, trust, permission behavior
and unsandboxed posture remain live checks.

## Business reason

Launch posture must be deterministic without wrapping native provider CLIs.
Shipping the same bounded read-only helper to every consumer avoids drift and
keeps personal shell behavior out of a guessed prose recipe.

## Safety boundary

The script owns one process group and reads private NUL-framed child evidence.
It does not print provider secrets or alias/function bodies. Dynamic Claude
catalog discovery separately requires a kernel-owned boundary; its current
platform limitation and next step remain in [Backlog](../backlog.md).

Personal wrapper or shell-profile changes require explicit user confirmation.
The agent never dumps a protected definition; the user provides a confirmed
credential-free or redacted representation.
