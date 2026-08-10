# Backlog

Only unfinished, deferred, blocked, knowingly unfixed, or unsupported work belongs here. Git
is the history of completed work; resolved narratives are removed rather than retained as
closed backlog entries.

## Open

### Provider-posture profiles can detach descendants with `setsid`

**Reason.** The posture probe owns one process-group leader through quiescence, but a shell
profile can call `setsid` and move a descendant into a different session and process group.
The owned-group shutdown cannot address that escaped process, and process-table discovery
would reintroduce the descendant-race and numeric-PID-reuse hazards that the helper was
designed to avoid.

**Practical impact.** A hostile or accidentally detaching profile process can outlive the
read-only diagnostic and continue using inherited resources after its matrix row is parsed.
The posture result proves command resolution, not containment of arbitrary profile-launched
processes; live provider readiness and support must continue to be established separately.

**Next step.** Run each measured profile under a portable kernel-owned descendant-containment
boundary, or reject session-changing descendants with equivalent fail-closed evidence. Add a
`setsid` escape regression that proves no descendant remains before removing this item; do
not add numeric-PID or process-table signalling as a workaround.

### Claude catalogue discovery is unsupported outside macOS

**Reason.** Safe Claude catalogue discovery currently depends on macOS Seatbelt's
kernel-enforced `deny process-fork` boundary. Linux, Windows, and other POSIX systems have
no implemented equivalent with a passing live compatibility fixture; process groups and
process-table snapshots cannot safely contain detached descendants or prevent PID-reuse
races.

**Practical impact.** On those platforms the Claude catalogue probe fails closed before
starting the provider. Configured-model fallback can report `catalog_unknown`, but cannot
use a live Claude catalogue to distinguish model absence or select a compatible catalogue
pair.

**Next step.** Implement a kernel-owned descendant-containment boundary for each target
platform, prove that ordinary and detached descendant creation cannot escape it, and run a
live catalogue/cleanup compatibility fixture. Remove this item only after the platform's
provider start, catalogue result, timeout, and cleanup paths all pass without numeric-PID
snapshot signalling.

### Remote installation fixtures I3 and I5 have not run

**Reason.** The post-correction candidate has not been pushed by a separately authorized
release action, so the advertised remote locator cannot install that exact tree. Local-path
installation tests prove a different transport and cannot be reused as remote evidence.

**Practical impact.** Remote all-skill `npx skills add` discovery and remote `apm install`
remain unsupported. The README may present their exact commands only as unproven fixtures,
not as verified installation paths. No standalone `mo-review` runtime is advertised.

**Next step.** After the final candidate is pushed on explicit authority, run I3 and I5 from clean
disposable projects, record the public full SHA, client versions and exact installed file lists in
`docs/phase-0-fixtures.md`, then remove this item only if every row passes. Do not push solely to
run these fixtures.

### Standalone `mo-review` execution is unavailable

**Reason.** The shipped `mo-review` package has no qualified executable backend interface for
actor launch, vendor selection, complete-turn retrieval, opaque relay, finding application,
commits, or E2E. Those capabilities exist only inside the installed `mo-herdr` and
`mo-omnigent` feature workflows; inventing an ambient subagent or private/headless fallback
would violate the backend surface contract.

**Practical impact.** `mo-review` is a reusable protocol component only. Installing or invoking
it alone cannot start two reviews or apply findings, so callers must enter through a qualified
backend skill or receive review-capability attention.

**Next step.** Either design and package a real executable review-backend interface and pass
its complete-turn, vendor-diversity, lifecycle, relay, and live fixture contract, or retain the
protocol-only boundary and continue routing executable review requests through `mo-herdr` or
`mo-omnigent`.

### Herdr P1-P8 have not run in a real control plane

**Reason.** The implementation session has no `HERDR_ENV=1`, so it cannot create the required
visible tabs, panes, and ordinary interactive actors or observe Herdr's public lifecycle
honestly. Older inline/headless runs exercise a rejected surface and are not reusable evidence.

**Practical impact.** Every exact Herdr provider/version/surface key remains unsupported. The
Herdr actor surface cannot be adopted, and fewer than two proven reviewer vendors would stop
the Herdr-specific cutover.

**Next step.** From a real interactive Herdr orchestrator pane, run P1-P8 in a scratch
repository and record the exact support key, commands, observations, cleanup, and outcome in
`docs/phase-0-fixtures.md`. A failure stays fail-closed and does not authorize inline,
headless, SDK, or private-transcript fallback.

### H7b and H13-H37 have not run against the post-cutover candidate

**Reason.** These are candidate-bound agentic fixtures. They require the completed cutover, a
green deterministic gate, a real Herdr environment, and one named full SHA. None of those live
results exists yet.

**Practical impact.** Topology, prompt acceptance, quiet goal settlement, interactive
extraction, atomic review barrier, byte-identical relay, tracked-content firewall, waits,
recovery, diversity, and same-SHA completion remain unproved in the installed product. No
candidate can be presented for Herdr adoption.

**Next step.** Freeze the first clean post-cutover SHA that passes `make mo-qc`, then run H7b
and all applicable H13-H37 rows without changing it. Any new commit invalidates the entire
evidence set and starts the run again.

### No final Omnigent route has passed OM1-OM8

**Reason.** The backend-neutral firewall and handoff contract changed. Earlier Omnigent runs
used the old review/output behavior and cannot prove the final native route.

**Practical impact.** Omnigent support for candidate binding, sequential independent review,
opaque finding transport, invalidation, native recovery, vocabulary, and narrow human
attention remains unsupported.

**Next step.** Run OM1-OM8 through one exact installed Omnigent route against the post-cutover
candidate. Use only Omnigent's native session/output surfaces; if native continuity cannot be
proven, keep the route unsupported rather than inventing Herdr-style evidence or reading a
private store.

### Hard-crash scratch residue can remain until operating-system cleanup

**Reason.** Scratch transport deliberately has no run registry, daemon, cross-run ownership
store, or recovery protocol. A controlled exit knows and deletes its one `0700` directory, but
after a hard process or machine crash no new run has sufficient ownership evidence to discover
and delete an older directory safely.

**Practical impact.** Opaque reviewer or E2E bytes may remain in an OS temporary directory
longer than the feature run. The directory is private (`0700`) and its files are private
(`0600`), but deletion is delayed until the operating system's temporary-file policy removes
it.

**Next step.** Revisit only if measured OS cleanup policy is insufficient or a named external
cleanup consumer requires stronger reclamation. Any solution must preserve content-free names
and avoid a run registry or broad cross-run deletion.

### Fixed E2E pane subdivision remains deliberately unspecified

**Reason.** The accepted design requires a visible lazily created E2E actor but does not
require a fixed multi-pane subdivision for its tab. No current consumer needs a stronger
layout contract.

**Practical impact.** E2E remains observable and candidate-bound, but its internal tab
arrangement is not a portable UI promise.

**Next step.** Define a fixed subdivision only when an exact E2E workflow demonstrates that
visibility without it is insufficient.

### Four upstream Herdr issue candidates await exact installed-version reproduction

**Reason.** Logical last-turn retrieval, capture beyond 1000 rows, per-agent token/cache
telemetry, and documented `state_change_seq` freshness would improve the surface, but a
suspected gap is not evidence of an upstream defect.

**Practical impact.** Meta-O must stay inside the current bounded extraction and diagnostic
contract and cannot cite an upstream issue as a substitute for a failed local fixture.

**Next step.** File an issue only after the exact installed version reproduces the specific gap with
credential-safe public-surface evidence. Do not file rename or status claims without reproduction.
