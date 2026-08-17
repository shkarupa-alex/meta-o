# Backlog

Only deliberately deferred, blocked, knowingly unfixed or unsupported work
belongs here. Current progress and temporary gate state stay in run-local plans.
Every entry records its reason, practical impact and next step.

## Open

### Paseo complete-response support fails under reviewer tool load

**Reason.** Paseo 0.3.1 `wait --json.message` exposes only its last five activity
items. Real tool-using reviews filled those slots with `[Read]`, `[Shell]`,
`[Thought]`, unlabeled reasoning and final text, either evicting the exact user
prompt or making the response boundary ambiguous. The earlier normal and long
fixtures did not run repository tools and therefore did not qualify real review
load. Public `paseo logs <id> --filter text --tail 1` returned the intact final
text of two observed reviewers, but has not passed tool-using normal and long
fixtures for all three harnesses.

**Practical impact.** Paseo orchestration and standalone review remain
unsupported: the route must report complete-response retrieval as `unknown`
rather than select a reasoning item or a stale/bounded activity item.

**Next step.** Qualify the documented public filtered-log surface, or another
public response field, with tool-using normal and three-to-four-screen
`BEGIN`/`MIDDLE`/`END` fixtures on Codex, Claude Code and OpenCode. Remove this
entry and advertise the routes only when every harness returns exactly its
settled response.

### Orca cannot release ten retained worker records

**Reason.** Public `worker-list` still reports Dispatches `ctx_51a2a3d73a57`,
`ctx_113a0d0eb712`, `ctx_7d5144f020ec` and `ctx_419d0a027239` as
`dispatchStatus: failed`, `workerState: stopped`, `terminalState: retained` and
`releaseState: not_requested`. On 2026-08-15 an exact
`worker-release --dispatch` for the original pair returned
`dispatch_inactive`, saying only a succeeded or failed worker can release. This
contradicts the listed failed state. The B8/B9 run added three stopped failed
composed-start records (`ctx_a05448f53df6`, `ctx_08d582eac77f`,
`ctx_dad8f56f7236`) whose exact terminals were closed by `worker-stop`, plus
three completed fallback records (`ctx_b45a883831c7`, `ctx_70186ba8a7b6`,
`ctx_13bb5aa56425`) whose exact external terminals were closed after settlement.
`worker-release` retains the latter three with reason `external_terminal` even
after their terminals are gone.

**Practical impact.** Orca resource accounting reports ten retained records.
The six B8/B9 terminals no longer run, but scan still reports their records; the
original four stopped terminals and all ten accounting records cannot be
reclaimed through the documented safe commands.

**Next step.** Fix or report both upstream transitions: release must accept a
stopped failed owned Dispatch, and an external Dispatch whose exact terminal is
already closed must leave retained accounting. Reclaim only the ten exact
Dispatches above after the public command reports a safe release.

### Herdr complete-response support remains fixture-bound

**Reason.** Installed Herdr 0.8.0 exposes lifecycle metadata through `agent get`
but no structured settled-response field. Its public `agent read
--source recent-unwrapped` can retrieve only rows retained by the terminal; an
alternate-screen harness may discard or duplicate reconstructed rows. A live
OpenCode 1.18.15 long fixture on Herdr 0.8.0 returned all 220 unique filler rows
but duplicated the beginning fragment and 62 filler rows at 400 lines; a larger
read repositioned beyond the response. Codex and Claude Code passed the same
fixture, but no backend-owned evidence proves an exact complete response for
OpenCode.

**Practical impact.** Complete-response support cannot be advertised for Herdr,
so both orchestration and standalone-review routes remain unsupported. This
durable capability entry supersedes disposition row 7 from the transition spec:
the same missing response surface prevents live qualification of the standalone
review skill.

**Next step.** Request an upstream structured complete-response surface, or fix
Herdr's OpenCode alternate-screen reconstruction so one public read returns each
response byte exactly once. Re-run the normal and long fixtures afterward; do
not substitute private transcripts or agent-authored result files. The rerun
must also reconfirm OpenCode readiness through exact public TUI or effective
posture evidence; `screen_detection_skipped: true` alone is not proof.

### Human-facing project knowledge is not yet in the user's language

**Reason.** The user asked for README, business framing and documentation in the
user's language while code-adjacent text stays English. Existing human-facing
project knowledge remains predominantly English; translating it safely is a
separate broad editorial change, and verbatim intent must remain untouched.

**Practical impact.** Russian-speaking users must read most project guidance in
English, and agents can make inconsistent language choices in mixed artifacts.

**Next step.** Translate README and human-facing knowledge to the current user's
language, preserve verbatim intent and technical literals, then add mixed-artifact
examples to the project setup contract.

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
