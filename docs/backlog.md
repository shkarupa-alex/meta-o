# Backlog

Only deliberately deferred, blocked, knowingly unfixed or unsupported work
belongs here. Current progress and temporary gate state stay in run-local plans.
Every entry records its reason, practical impact and next step.

## Open

### Orca cannot release two retained failed workers

**Reason.** Public `worker-list` reports Dispatches `ctx_51a2a3d73a57` and
`ctx_113a0d0eb712` as `dispatchStatus: failed`, `workerState: stopped`,
`terminalState: retained` and `releaseState: not_requested`. On 2026-08-15 an
exact `worker-release --dispatch` for each returned `dispatch_inactive`, saying
only a succeeded or failed worker can release. This contradicts the listed
failed state, and a broad terminal close would violate ownership mechanics.

**Practical impact.** Two stopped terminals remain retained in Orca resource
accounting. They do not run work, but scan continues to report them and their
resources cannot be reclaimed through the documented safe command.

**Next step.** Reproduce the state tuple and rejection against Orca's current
version, then fix or report the upstream transition so `worker-release` accepts
a stopped failed Dispatch. Release only these two exact Dispatches after the
public command accepts them.

### Herdr complete-response support remains fixture-bound

**Reason.** Installed Herdr 0.8.0 exposes lifecycle metadata through `agent get`
but no structured settled-response field. Its public `agent read
--source recent-unwrapped` can retrieve only rows retained by the terminal; an
alternate-screen harness may discard earlier rows. The current agent is not
inside a Herdr-managed pane, so the corrected long boundary-marker fixture
cannot be rerun honestly for the new candidate.

**Practical impact.** Herdr B8 and B9 remain `UNKNOWN` for the new candidate, so
the Herdr orchestration and standalone-review routes cannot be called verified
even though the mechanics now restore the 120/200/400-line ladder and fail
closed on missing markers.

**Next step.** From a Herdr-managed pane, run normal and three-to-four-screen
`BEGIN`/`MIDDLE`/`END` fixtures against Codex, Claude Code and OpenCode. Remove
this entry only if one public read contains all markers for every harness; on a
failure, request an upstream complete settled-response surface rather than using
private transcripts or agent-authored result files.

### Herdr OpenCode readiness lacks public detection evidence

**Reason.** The live Herdr agent record supplied with the review reports
`screen_detection_skipped: true` for OpenCode. That flag is not evidence of the
exact TUI or effective unsandboxed posture.

**Practical impact.** Herdr B4 and the OpenCode part of B7 remain `UNKNOWN` for
the current installed control plane.

**Next step.** Re-run OpenCode launch from a Herdr-managed pane and capture exact
public TUI and posture evidence. If no public Herdr surface can provide it, keep
the harness unsupported and raise the missing detection capability upstream.

### Mixed-artifact language policy needs examples

**Reason.** Human-facing knowledge now follows the user's language, while code,
identifiers, commands, protocol literals and upstream names retain their
technical language. Mixed artifacts such as API examples and diagnostics still
have no agreed catalogue of examples.

**Practical impact.** An agent may make a locally reasonable but inconsistent
language choice inside a mixed document; the core human/code boundary remains
clear and usable.

**Next step.** Collect concrete confusing mixed artifacts and add examples to
the project setup contract without rewriting verbatim user intents.

### Claude catalog containment is macOS-only

**Reason.** The model helper deliberately refuses live Claude catalog discovery
outside macOS because its kernel-owned process containment currently uses a
macOS-specific mechanism.

**Practical impact.** On other operating systems, configured Claude models can
still be launch-tested directly, but dynamic Claude catalog discovery remains
explicitly unavailable rather than risking leaked profile descendants.

**Next step.** Add and test a kernel-owned containment boundary on one target OS,
then enable that platform only after exact start, timeout and cleanup fixtures
pass. Do not use PID snapshots as a workaround.

### Hard crashes can leave temporary review responses behind

**Reason.** Review delivery intentionally uses two private temporary files and
best-effort cleanup. A process killed before its cleanup handler runs cannot
remove those files; no registry or daemon owns later cleanup. A local macOS
`SIGKILL` fixture on 2026-08-14 confirmed that a mode-`0600` review file remained
after its owning process died.

**Practical impact.** Complete reviewer text can remain in the operating
system's temporary directory until normal OS cleanup, even though it is never
tracked in the repository or persisted as workflow state.

**Next step.** Exercise an abrupt-process-exit fixture on each supported
platform, document the observed OS cleanup boundary, and narrow or remove this
entry if the files are proven not to outlive the process materially.

### Remote installation is not yet proven

**Reason.** The exact post-transition candidate has not been published, and the
user did not authorize pushing solely to test installation.

**Practical impact.** Local-path installation is deterministic and tested, but
the advertised GitHub forms remain unverified for this ten-skill tree.

**Next step.** After an independently authorized publish, install the exact
public SHA with `npx skills add shkarupa-alex/meta-o` and
`apm install shkarupa-alex/meta-o` from clean disposable projects. Remove this
entry after both installed file lists match the built tree.

### Local-model watchdog is not implemented

**Reason.** This feature deliberately ships the pattern-based shell observer
first. A second watchdog driven by a small local model through Ollama or LM
Studio needs a concrete model/runtime contract and measured benefit.

**Practical impact.** Known limit, overload, question and failure text can be
classified without cloud inference; novel or ambiguous states still require a
human to interpret the native output.

**Next step.** Prototype one local-only classifier against captured
credential-free backend states, compare it with the pattern script, then specify
an implementation only if it materially improves detection without adding a
daemon or persistent run state.
