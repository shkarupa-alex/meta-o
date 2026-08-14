# Backend capabilities

Meta-O supports a backend only when its public native surface passes the common
contract and live scenarios in [End-to-end verification](e2e.md). The required
behavior is authored once in
[Backend contract](../shared/references/backend-contract.md); backend mechanics
provides the exact commands.

Current-run support is not persisted here. Versions are diagnostic and are not
pinned. A backend that loses complete settled-response retrieval, question
handling or reliable state discrimination becomes unsupported until the observed
failure is addressed.

## Required companions

| Backend | Control              | Companion skill |
| ------- | -------------------- | --------------- |
| Herdr   | `herdr`              | `herdr`         |
| Orca    | `orca` or `orca-cli` | `orchestration` |
| Paseo   | `paseo`              | `paseo`         |

The control and companion are checked separately. A present executable does not
prove that an agent knows the backend semantics. A backend's documented
version-matched bundle counts as the companion source when the complete guide is
readable and the controlling agent reads it before acting; installation into a
personal harness directory is not required for that capability check.

Control health and per-harness readiness are separate too. Paseo provider
discovery or a direct public launch must prove each selected harness; a daemon
that reports `reachable` does not override a provider server failing to boot.
