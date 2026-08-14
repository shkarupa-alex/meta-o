# Backlog

Only deliberately deferred, blocked, knowingly unfixed or unsupported work
belongs here. Current progress and temporary gate state stay in run-local plans.
Every entry records its reason, practical impact and next step.

## Open

### Paseo cannot launch OpenCode when its managed serve directory is absent

**Reason.** Live acceptance against Paseo 0.3.1 on 2026-08-14 reproduced an
OpenCode startup failure: Paseo launches `opencode --auto serve` with
`~/.paseo/opencode-home/serve` as its working directory, but that managed
directory does not exist. Codex and Claude launch successfully through the same
daemon. Creating personal Paseo state or upgrading/restarting the desktop-owned
daemon requires explicit confirmation.

**Practical impact.** Paseo cannot satisfy the required OpenCode posture check,
vendor-diverse standalone review, or complete B1-B14 live matrix, so the Paseo
route blocks feature completion.

**Next step.** With explicit authorization, create only the missing managed
directory or upgrade Paseo, then rerun OpenCode launch plus every affected Paseo
scenario against one newly frozen candidate SHA. Do not restart the daemon while
unrelated agents are active.

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
