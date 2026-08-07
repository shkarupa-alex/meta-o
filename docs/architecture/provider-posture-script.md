# Provider posture is a shipped diagnostic script

Because _a gate whose full verdict cannot be read is unknown_ and _the previous
generation was too thick_ — the narrow resolution probe must be deterministic
without becoming a new orchestration layer.

## Decision

`shared/scripts/mo-posture.sh` owns the zsh/bash launch-resolution matrix. The
build copies it into `mo-herdr`, `mo-omnigent` and `mo-setup`; the canonical
methodology owns the meaning of its records and exit statuses.

This deliberately changes the shipped baseline from Markdown plus one `.mjs` to
Markdown plus two dependency-free helpers. The alternative was denser and less
reliable: two shell programs embedded in Markdown, copied into three skills and
tested by extracting fenced code through a Markdown AST. A real script gives the
protocol one executable owner, an ordinary syntax gate and direct semantic tests.

The helper is not a provider proxy or workflow runtime. It never launches a
provider, changes configuration, stores state or makes a support decision. It
only classifies command kinds and first executable paths in four startup modes,
emits credential-safe evidence, and exits 0/1/2 for identical, divergent or
unreadable matrices. A change from command to alias/function is divergent even
when the first executable path stays the same.

## Framing and safety

Each mode writes NUL-framed evidence to a private temporary file. Profile stdout
and stderr are captured separately and represented only by presence markers, so
a greeting cannot falsify the matrix and a profile cannot leak its banner into
the transcript. User-visible paths use Bash `%q` encoding, preserving whitespace
and newlines without ambiguous records.

A privileged `/bin/bash -p` shebang prevents `BASH_ENV`, inherited shell-option
variables and every exported function from executing in the diagnostic runner.
It has no marker that the caller can spoof. `BASH_ENV` remains exported for the
measured child modes. If the caller exported `SHELLOPTS`, `BASHOPTS` or any Bash
function, the Bash matrix returns unknown: silently dropping that state would
change the launch being measured, while replaying arbitrary inherited code would
break the credential boundary. The child probes either bypass profile-defined
lookup/record functions through validated builtins or emit a
`MO_POSTURE_SHADOW` marker and fail closed before evidence is accepted.

The absolute shebang is intentional. Passing `-p` through `/usr/bin/env` would
instead require the non-portable `env -S`, so the helper's compatibility boundary
is `/bin/bash` 3.2+, `/usr/bin/printf`, `/usr/bin/false` and `/bin/sleep`, plus
`mktemp` and `rm` on the system utility path. A Bash matrix additionally requires
`/usr/bin/env` with NUL-output support. Systems such as NixOS or Alpine that do
not expose those absolute paths are unsupported rather than failing later with
an unexplained bad-interpreter error. The command usage and README expose the
same boundary.

Only a requested Bash matrix performs the inherited-function scan: that state is
specific to what ordinary non-privileged Bash would import and is not evidence
for Zsh. The scan first writes `/usr/bin/env -0` into the private directory and
checks both its status and nonzero size before parsing it. An unavailable `-0`, a
failed command, an empty stream or incomplete NUL framing returns
`MO_POSTURE_ENVIRONMENT` with `environment-scan-failed`.

The execution tool, not the helper, supplies the bounded timeout. The helper
disconnects stdin and removes temporary files through a path-guarded cleanup
trap. Each measured shell starts in its own process group. After normal shell
exit, the helper terminates and verifies that group before reading any capture,
so profile-started background descendants cannot race evidence parsing. Signal
handlers are installed before temporary-directory creation, cover the launch
window, remain idempotent under repeated delivery, forward TERM to the group,
escalate to KILL, reap the direct child and verify that the group disappeared
before cleanup and a defined nonzero exit. This includes ordinary background
descendants created by a profile, not only the immediate shell PID. Each
requested shell emits its own summary status.

## Rejected

- **Keep executable matrices in Markdown.** This makes dense quoting part of the
  documentation contract and requires AST extraction just to syntax-check it.
- **Treat arbitrary profile stdout as malformed evidence.** The evidence already
  has a private framed channel; common banners are noise, not an unknown verdict.
- **Wrap provider CLIs.** The script diagnoses resolution and never becomes the
  invocation path.
