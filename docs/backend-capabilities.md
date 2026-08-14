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
prove that an agent knows the backend semantics.
