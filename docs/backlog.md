# Backlog

Only deliberately deferred, blocked, knowingly unfixed or unsupported work
belongs here. Current progress and temporary gate state stay in run-local plans.
Every entry records its reason, practical impact and next step.

## Open

### Orca worker readiness can precede harness task delivery

**Reason.** Live acceptance against Orca 1.4.182 reported both `ready` and
`input_accepted`, while a Codex dispatch sent the task text to the shell and an
OpenCode dispatch remained at its untouched input prompt. One bounded
cross-harness probe reproduced the delivery gap, so this is not accepted as a
harness-specific transient.

**Practical impact.** Orca cannot currently support Meta-O orchestration or
standalone review: a task may never reach the worker even though the public
receipt looks successful.

**Next step.** Reproduce with the Orca maintainers, make public readiness prove
that the harness received its task, then rerun every Orca scenario in
`docs/e2e.md` against one frozen candidate SHA.

### Paseo companion skill is unavailable in the active harness

**Reason.** The Paseo control plane and complete public `wait` response passed
normal and long live fixtures, but no upstream `paseo` companion skill was
available in the active Codex, Claude Code or OpenCode skill directories.
Installing personal harness configuration was outside this task's authority.

**Practical impact.** Paseo's native session mechanics work, but Meta-O cannot
claim a supported Paseo route because the required upstream agent guidance is
absent.

**Next step.** Obtain or publish the upstream companion, install it with explicit
authorization, then rerun every Paseo scenario in `docs/e2e.md` against one
frozen candidate SHA.

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

### Portable provider-posture containment remains limited

**Reason.** The posture probe owns its process group, but a profile can detach a
descendant with `setsid`. Claude catalogue discovery additionally has no proven
kernel-owned containment equivalent on every supported OS.

**Practical impact.** Posture proves command resolution and ordinary launch
behavior, not containment of hostile detached profile descendants; non-macOS
Claude catalogue discovery may remain unknown even while configured-model launch
is tested directly.

**Next step.** Reproduce the limitation on a target OS, add a portable
kernel-owned containment boundary, and retain only platforms where the exact
start, timeout and cleanup fixture passes. Do not use PID snapshots as a
workaround.

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
