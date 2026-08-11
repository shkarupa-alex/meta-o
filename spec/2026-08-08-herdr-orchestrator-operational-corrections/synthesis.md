# Synthesis: Herdr orchestration corrections

## Outcome

Revise Meta-O so each backend skill is a process-only orchestrator over ordinary,
persistent subscription-backed CLI sessions. `mo-herdr` alone owns visible Herdr
tabs, panes, and actors; `mo-omnigent` manages agents through Omnigent's own
native paradigm and does not imitate Herdr. The orchestrator does not
read specifications, business framing, source, diffs, tests, or build files and
does not form technical judgements. It owns topology, lifecycle, message
delivery, gate bookkeeping by Git object ID, and human escalation.

The executor owns feasibility, requirements discovery, implementation, QC,
technical decisions, documentation necessity, and responses to findings.
Reviewers own independent criticism and technical adjudication. The orchestrator
transports their messages verbatim; it never checks a finding against code.

No orchestration CLI, daemon, state store, adapter layer, receipt, manifest, or
baseline is added. Existing skills and two existing helpers remain the product
surface.

## 1. Role firewall

### Orchestrator may

- resolve the repository root and read Git metadata such as branch, `HEAD`, and
  worktree cleanliness;
- accept and forward a task/spec path without opening it;
- in `mo-herdr`, create, name, and wait for Herdr tabs, panes, and actors;
- in `mo-omnigent`, manage agents through Omnigent's native backend surface;
- start ordinary provider CLIs through the selected backend's native model;
- send messages atomically with Enter;
- read compact actor status handoffs;
- retrieve a transport-complete reviewer response solely to copy it verbatim
  into the executor session;
- route executor rebuttals and reviewer replies verbatim between the same warm
  sessions;
- bind QC, reviews, and applicable E2E to the exact current Git object ID;
- classify process/infrastructure states and decide process mechanics;
- interrupt the human only for product meaning, an irreversible action,
  credentials, a subscription change, an external blockage, or an unresolved
  technical dispute after actor adjudication.

### Orchestrator must not

- open, quote, summarize, or assess a specification or business-framing file;
- open source, a diff, tests, build configuration, or test logs to reason about
  the implementation;
- decide feasibility, architecture, implementation, QC applicability, E2E
  applicability, or whether a finding is correct;
- filter, merge, rank, paraphrase, or silently drop findings;
- create implementation documentation, changelogs, or backlog entries;
- read or edit the contents of tracked project files at any point in the
  feature-run;
- present menus for ordinary model, reuse, watchdog, or technical choices.

The narrow reviewer-transport exception is not permission to read a tracked file
or reason about actor output. The orchestrator copies complete chunks, labels
their source, sends them,
and then discards them from its working summary. Its durable context contains
only actor names, lifecycle state, current candidate ID, gate states, and short
blockers.

### Executor owns

- locating and reading the complete task/spec and relevant business framing;
- validating input completeness and feasibility;
- reading `AGENTS.md`/`CLAUDE.md`, code, tests, commands, and project knowledge;
- creating the required task branch and making coherent commits;
- resolving ordinary technical choices without user questions;
- implementing the complete production-ready scope;
- deciding and reporting QC, deterministic smoke, and E2E applicability;
- checking every finding, fixing it or producing a concrete rebuttal;
- deciding whether durable knowledge became new or false and updating only that
  existing source of truth;
- returning only compact process handoffs to the orchestrator.

### Technical disputes

The orchestrator never adjudicates a dispute itself. It relays the executor's
rebuttal to the originating reviewer, then routes any unresolved exchange to the
other-vendor reviewer for a targeted judgement. Actor-declared facts are checked
by an actor that may read the repository. The human is contacted only if the
actors still declare the dispute unresolved or it crosses one of the named human
boundaries.

## 2. Visible persistent Herdr topology

The required observable result is semantic; implementation must use the
installed Herdr interface discovered from its current help/schema rather than
blindly copying stale CLI flags.

```text
current tab: mo:<slug>
┌──────────────────────┬──────────────────────┐
│ orchestrator         │ executor             │
│ existing pane        │ <slug>-exec          │
└──────────────────────┴──────────────────────┘

separate tab: mo:<slug>:review
┌──────────────────────┬──────────────────────┐
│ reviewer A           │ reviewer B           │
│ <slug>-review-a      │ <slug>-review-b      │
└──────────────────────┴──────────────────────┘
```

- Rename the orchestrator's current tab at run start.
- Split the current pane to the right for the executor.
- Create the review tab only when the first candidate is frozen, then split it
  to the right for two reviewers.
- Preserve user focus by default and never close a tab or pane the workflow did
  not create.
- Use short stable ASCII actor names recovered from Herdr itself.
- Keep executor and reviewer sessions alive for the whole feature and reuse the
  same actor in every later round.
- Reviewer independence is a process rule, not an access-control wall.

Executor and reviewers must be ordinary interactive `claude`, `codex`, or other
supported CLI sessions started as Herdr-managed actors. Headless `claude -p`,
`codex exec`, `opencode run`, provider SDK sessions, hidden subagents, and a fresh
review process per round are forbidden for these roles. `pane run` remains valid
for ordinary deterministic commands, not for an agent role.

If a required right split or interactive actor cannot be created, fail closed
with a concrete capability gap. Do not silently substitute a down split or a
hidden/headless process.

## 3. Prompt transport and startup goals

All ordinary actor messages use Herdr's atomic prompt operation, which submits
text and Enter together. Raw terminal text writes, a separate text/Enter pair,
and `send-keys` for normal prompt submission are forbidden. `send-keys` is only
for provider UI controls such as escape or interrupt.

On a stalled submission:

1. Read the direct actor state.
2. If it is already working, do not resend; wait for that turn.
3. If it is settled and the prompt did not start, retry the same atomic prompt
   once.
4. A second transport failure becomes `needs_attention`.

Recommended orchestrator goal:

```text
/goal Run mo-herdr for <TASK_OR_SPEC_PATH>.
```

If the user invoked the skill without `/goal`, show that recommendation once for
future unattended work and continue the current run; do not ask the user to
restart or paste messages between actors.

Initial executor goal, sent by the orchestrator:

```text
/goal Locate and read the complete task at <TASK_PATH>, its recorded business
framing, and the project instructions. Verify feasibility, then implement the
full production-ready scope. Resolve ordinary technical choices yourself. Use
the required feature branch, commit coherent independently verifiable increments,
run project-owned checks, and continue until the worktree is clean and the branch
tip is a candidate, or report a real NEEDS_ATTENTION blocker.
```

For a route without a native persistent goal, send the same text as the initial
completion-oriented prompt and name that weaker posture; do not add a goal state
file or emulator.

## 4. Compact actor handoffs

These are human-readable prompt conventions, not persisted schemas or helper-
parsed protocols.

Executor readiness is short and supplies information the orchestrator is not
allowed to derive:

```text
READY
TASK: <absolute path>
BUSINESS: <absolute path>
BRANCH: <feature branch>
E2E: <applicable scenario names or not-applicable>
```

Candidate handoff:

```text
CANDIDATE
COMMIT: <exact git rev-parse HEAD output>
QC: <command and result>
SMOKE: <command and result or not-applicable>
E2E: <applicable scenario names or not-applicable>
```

The orchestrator verifies only metadata: settled executor, explicit candidate
handoff, clean worktree, declared ID equal to `git rev-parse HEAD`, and the object
exists as a commit. It does not assess the checks. Do not assume SHA-1 or a
40-character length.

Any new commit invalidates QC, both reviews, and E2E. The candidate is the branch
tip after a sequence of coherent commits, not necessarily one squashed commit.

## 5. Interactive review retrieval

Visibility and warm interactive continuity are mandatory. Headless inline review
is not a fallback.

Each reviewer may investigate freely but must emit compact, actionable final
Markdown. Use a provider/surface limit proven by fixtures, never the raw 1000-row
Herdr ceiling as an untested promise. Start with a conservative cross-provider
chunk limit (at most 180 rendered rows) and raise it only from recorded evidence.

If all findings do not fit, the reviewer emits an ordinary numbered findings
batch and states that more findings remain. After the orchestrator retrieves and
forwards that transport-complete batch verbatim, it prompts the same reviewer for
the next batch. A batch contains evidence, impact, and expected fix; investigation
narration and raw logs stay out. The final batch states that no further findings
remain. This is review content, not a completion sentinel for the transport.

For every batch the orchestrator:

1. waits for the reviewer to settle after the exact current-round prompt;
2. runs an adaptive shell pipeline described in the skill, not a generated or
   shipped script: begin with a small `recent-unwrapped` window (normally 120 or
   200 rows), keep it in a temporary shell value/file outside the repository, and
   grow to 400, 800, then 1000 only when the required boundaries are absent;
3. prints into orchestrator context only the final-answer slice from the last
   review heading (`## Verdict` or `## Review batch`) to the provider's settled
   input boundary; tool activity precedes that heading and is discarded inside
   the pipeline;
4. uses provider/version boundary patterns proven by fixtures — currently Claude
   Code's `❯` input box and Codex's `›` input box — rather than attempting to
   enumerate every possible tool-call rendering; the skill tells the orchestrator
   to adapt the `awk`/`sed` one-liner when the installed rendering differs;
5. proves the current prompt boundary, finished assistant response, lower settled
   boundary, continuous order, and that the row cap did not hide history;
6. treats any unprovable or repaint-damaged batch as `UNKNOWN`;
7. copies the complete text with only a source/chunk label into the executor;
8. never summarizes, ranks, filters, or checks it against the repository.

This keeps the 1000-row ceiling as a maximum capability without paying 1000 rows
of orchestrator context on every turn. The final-answer heading is the stable
content boundary; provider-specific patterns are used only for the surrounding
terminal UI boundaries. The commands remain inline recipes in
`herdr-mechanics.md`, so the orchestrator can change window size and patterns for
the observed provider/version without maintaining a parser script.

If a batch is not transport-complete, request a fresh, shorter re-evaluation of
the same frozen candidate in the same warm reviewer session. Do not ask for a
verbatim repetition, a verdict file, a nonce, or a closing sentinel. If the route
cannot return a complete compact turn, it cannot carry the review gate.

At least one reviewer must be from a different vendor than the executor. Both
first-pass reviewers see the same frozen candidate and not each other's first
verdict. After fixes, both same sessions review the new candidate again.

## 6. Waiting and restart behavior

Wait only on direct lifecycle state, never on a predicted SHA or stale progress
text.

Baseline algorithm:

```text
arm one actor wait for 10 minutes
if settled: read the current turn and continue
if blocked: route the compact blocker
if timeout:
  read actor state and recent detection output once
  if settled: process it immediately
  if working with observable progress: re-arm 10 minutes
  if working with no state/output progress: confirm after 5 minutes, then ask the
     backend to continue or return a concrete stalled/unknown condition
  if unknown: one bounded liveness attempt, then needs_attention
```

- One waiter per actor; no sleeps, handwritten polling loops, or duplicate
  monitors.
- Timeout is not failure when direct state and output show progress.
- No wait predicate contains `HEAD != <old-id>` or assumes another commit must
  appear.
- `HEAD` is read only after the executor settles and declares a candidate.
- Simultaneous reviewer completion is handled by re-reading pollable direct state;
  it is not treated as a consumable one-shot event.
- Transient provider failures retry through the backend after bounded 5- and
  10-minute waits; prompts are not duplicated while the prior turn may be active.

There is no special run-recovery protocol, run identity, registry, or persisted
gate state. After an orchestrator restart, the backend skill follows its ordinary
startup path from the current repository and backend state, starts the roles the
current run needs, and gives the executor the normal goal to inspect the task and
repository and determine where work stopped. The orchestrator does not reconstruct
implementation meaning or historical gate state. It resumes being a transport and
process driver from what the executor and reviewers report next.

## 7. Autonomous preflight and model catalogue

Normal feature runs do not ask the user to confirm models, reuse research,
watchdog use, or ordinary technical choices.

- Use saved role preferences when their route catalogue validates them.
- If no preference exists, use the provider's native configured default.
- If a saved model is unavailable, use the native default for this run, report
  one compact status line, and do not rewrite preferences.
- Choose routes so at least one reviewer differs in vendor from the executor.
- If only one vendor is runnable, findings may still be collected, but verified
  completion is impossible and the final result is `needs_attention`.
- Run `mo-reuse` or the optional watchdog only when the user already requested it;
  do not offer a menu during the run.

Bundle the pinned Claude Agent SDK into the generated `mo-models.mjs` using the
current `brain-council` build pattern: esbuild, one self-contained `.mjs`, static
SDK import, `EXTERNAL_SDKS=[]`, Node built-ins external, and the system provider
CLI passed through `pathToClaudeCodeExecutable`. Do not ship `node_modules` and do
not search the current project or global npm root for an ambient SDK.

This deliberately changes the distribution contract from "two dependency-free
helpers" to "two self-contained helpers; `mo-models.mjs` contains a pinned Claude
SDK bundle". Record the named reason in the existing distribution architecture:
installed backend skills must enumerate Claude models without global/project npm
state and without starting a model turn. No provider proxy or orchestration SDK
layer is introduced; the SDK is used only for `supportedModels()` and launches
the user's system subscription CLI.

The deterministic gate must build in a temporary directory, compare generated
bytes, load the helper from an isolated directory with no `node_modules`
ancestor, prove no runtime package lookup is required, and preserve license
requirements. A live authenticated `supportedModels()` check remains an agentic
fixture, not a deterministic `mo-qc` test.

## 8. Project contract additions

`mo-setup` writes these rules byte-identically to `AGENTS.md` and `CLAUDE.md`.
Meta-O's own copies receive the same policy because the executor runs without a
methodology skill.

### Version control

- Never develop on `main`, `master`, `develop`, or `default`.
- Create `feature/<short-slug>` from an up-to-date `develop` and keep the whole
  task on that branch.
- If `develop` is missing or cannot be made current, report a repository-policy
  blocker; do not silently branch from the default branch.
- Run relevant checks before committing.
- Commit every coherent, independently verifiable increment.
- Subjects use `<type>: <what changed and why>` with `feat`, `fix`, `refactor`,
  `test`, `docs`, or `chore`.
- Reference an issue or specification when one exists.
- End every agent-authored commit after a blank line with
  `Assisted-by: <route/model/effort>` supplied by the orchestrator.
- The verified result is the full Git object ID of the branch tip. Any later
  commit invalidates all gates.

### Backlog

`docs/backlog.md` contains only deferred, blocked, deliberately not done, or
knowingly unfixed work, with reason, impact, and next step when known. It has no
Closed/Done/Completed section. Once work is done, delete the entry or narrow it
to the remaining open part; Git history records completion.

### Documentation

Do not create a changelog, migration note, summary, report, or "what I did"
document merely because a change occurred. A new `CHANGELOG.md` requires an
explicit task requirement, an existing release process, or a named external
consumer. Consolidating README files is recorded by the commit, not by another
document.

Update existing business, glossary, architecture, backlog, acceptance, or E2E
knowledge only when the change makes that source new or false. A new document
requires a genuinely new durable boundary/consumer that cannot live in an
existing source of truth. This preserves the project's same-change knowledge
rule without encouraging documentation about routine implementation events.

## 9. Existing project sources to change

- `docs/business.md`: append the user's report and clarifications verbatim.
- `shared/references/methodology.md`: role firewall, autonomous routing, compact
  handoffs, review relay, waiting, recovery, and project rules.
- `src/skills/mo-herdr/SKILL.md`: visible topology, interactive-only actors,
  atomic prompts, warm continuity, and no option menus.
- `src/skills/mo-herdr/references/herdr-mechanics.md`: compact multi-turn TUI
  retrieval and current support matrix; remove inline/headless default for actor
  roles.
- `src/skills/mo-review/SKILL.md`: actor-owned technical adjudication and compact
  batched verdicts; remove orchestrator technical judgement.
- `src/skills/mo-setup/SKILL.md`: VCS, backlog, documentation, and bundled model
  catalogue installation contract.
- `shared/scripts/mo-models.mjs` and `tools/build-skills.mjs`: self-contained
  Claude SDK bundle and deterministic build/check.
- `AGENTS.md` and `CLAUDE.md`: byte-identical contract changes, including the
  revised shipped-helper wording.
- existing `docs/architecture/skills-first.md` and
  `docs/architecture/distribution.md`: role and bundle boundaries; create no new
  architecture document.
- existing acceptance, fixture, E2E, and backlog files only as their truth
  changes. Do not pre-claim E2E success.

## 10. Genuine Herdr gaps to verify and file upstream

After rechecking the installed Herdr schema/help and reproducing each gap, prepare
upstream issues for:

1. Complete logical last-turn retrieval with explicit `complete/in_progress`, a
   truncation signal, stable pagination/ranges, and correct alternate-screen and
   repaint handling.
2. Programmatic viewport movement or opt-in alternate-screen transcript capture.
3. Per-agent context/token/cache telemetry when the provider exposes it.
4. Documented `state_change_seq` semantics.
5. A multi-actor or multi-match wait that can express several pane IDs and a set
   of settled statuses. Do not incorrectly claim that agent-status events are
   absent; protocol 19 already exposes `pane_agent_status_changed`, but only as a
   single constrained match.

Tab rename is not an issue candidate unless the installed version actually lacks
the operation; protocol 19 exposes `tab.rename`. External issue creation happens
only after the evidence and issue target are confirmed.

## 11. Acceptance evidence

Deterministic `make mo-qc` covers contract equality, generated tree equality,
isolated bundle loading, tests for catalogue parsing/settings behavior, and
absence of forbidden headless actor commands in the authored Herdr route.

Agent-required Herdr E2E proves:

- exact pane/tab topology and tab naming;
- every actor is an ordinary visible interactive CLI;
- round two reuses the same actor/session identities;
- atomic prompt submission starts a turn without a manual Enter;
- orchestrator command history stays inside the role firewall;
- executor discovers requirements, feasibility, QC, and E2E applicability;
- reviewer chunks are transport-complete and relayed byte-for-byte after terminal
  normalization;
- same-SHA settled completion does not wait for a fictional next commit;
- new commits invalidate all gates;
- all gates attach to the same full Git object ID;
- the installed isolated model helper returns the live Claude catalogue;
- no optional model/reuse/watchdog menu appears;
- the feature branch and commit trailers follow the contract.

## Rejected and deferred decisions

- **Rejected: executor reads reviewer panes directly.** It contradicts the user's
  explicit copy-paste requirement, gives the executor unnecessary peer-control
  capability, and does not solve repaint omission or stale-turn addressing.
- **Rejected: headless/inline reviewer fallback.** It loses required visibility
  and the warm interactive session even if it provides a stronger envelope.
- **Rejected: reviewer-authored verdict files, nonces, footers, or sentinels.**
  They are cooperative output, not transport completeness, and recreate a control
  protocol the project deliberately removed.
- **Rejected: a global/ambient Claude SDK installed by `mo-setup`.** The user
  explicitly requested the self-contained brain-council mechanism; ambient npm
  state makes installed behavior non-reproducible.
- **Rejected: orchestrator chooses technical forks.** It chooses process actions
  only; technical judgement belongs to actors that read the task and repository.
- **Rejected: fallback from missing `develop` to the default branch.** It changes
  the explicit repository policy silently.
- **Rejected: arbitrary support claims for Claude/Codex TUI.** Support is
  provider/version/surface-specific and must follow recorded compact-turn
  fixtures; open applicability rows remain open.
- **Deferred: fixed topology for a separate E2E actor.** The current task names
  executor and reviewer layout. If E2E uses a persistent actor, it must remain
  visible, but its exact tab layout should follow an observed project scenario
  rather than be invented here.
- **Deferred: creating upstream Herdr issues.** The design names candidates;
  implementation must reproduce them and external publication requires the
  normal explicit write step.

## 12. Pre-mortem amendments

The independent pre-mortem exposed failures that the implementation-ready spec
must close:

1. **Independent scope conformance.** Both reviewers receive the task and
   business-framing paths and independently check complete scope, not only code
   quality. They confirm or reject executor claims that smoke/E2E are
   `not-applicable`. The executor is not the sole grader of its own scope.
2. **Mechanical deterministic evidence.** The executor reports the exact QC/smoke
   commands. For deterministic gates the orchestrator may run the reported
   command in a visible command pane against a recorded before/after Git object
   ID and consume only exit status and mutation status. It does not interpret
   logs or change the command. Agentic E2E remains owned by its actor and is
   independently reviewed against the exact candidate.
3. **Bounded transport retries.** A reviewer batch gets at most two fresh shorter
   retrieval attempts. Failure does not loop forever or silently degrade to
   headless/file transport; it produces an explicit unsupported-surface result
   and an upstream-capability finding. Provider/version/surface fixtures must
   pass before that route is described as supporting the gate.
4. **Bounded dispute repetition.** The same finding/rebuttal may not bounce
   unchanged through ordinary review rounds. On the second unchanged exchange it
   enters targeted other-vendor adjudication; a still-unresolved result is the
   named dispute boundary for human attention.
5. **Simple restart instead of recovery machinery.** A restarted orchestrator
   performs ordinary backend startup and delegates discovery of current work to
   the executor. It does not invent a run binding, restore gate history, or read
   tracked files to reconstruct implementation state.
6. **Relay volume budget.** Compact chunks are capped by provider fixtures and
   relayed immediately. After verifying a chunk, the orchestrator uses a quoted
   direct `herdr agent read` command substitution as the text argument to the
   atomic `herdr agent prompt`, so the second copy is not printed into its
   context. The validation copy still enters context, so excessive chunk count
   is not ordinary: more than the fixture-backed per-round budget triggers a
   targeted request for denser independent findings, not endless relay.
7. **Wait responsiveness.** A 10-minute `agent wait` is a maximum arm that returns
   immediately on settled state, not a polling interval. When handling one actor,
   re-read every peer's pollable direct state before arming another wait. A timed
   out `working` state needs evidence of progress; no state/output change gets a
   five-minute confirmation and same-session recovery rather than another blind
   ten-minute arm.
8. **Catalogue is not entitlement.** Distinguish `catalogue unknown`, `model not
   listed`, and `model listed but launch failed`. After every default/fallback
   launch, re-evaluate actual vendor diversity from the running actors. A fallback
   that collapses the gate to one vendor cannot produce verified completion.
   Record and test SDK/system-CLI compatibility and run an authenticated catalogue
   fixture for supported releases.
9. **Independent firewall evidence.** The agent-required acceptance run has a
    separate reviewer inspect the orchestrator's visible Herdr command interval
    for forbidden document/code reads, headless agent launches, raw prompt writes,
    and wrong split direction. This is evidence about the real run, not a grep of
    correct prose.

## 13. Decision ledger

| Decision | Status | Rationale | Source |
| --- | --- | --- | --- |
| Orchestrator is process-only and never reads task/spec/framing/code for analysis | adopted | Direct user clarification and context-budget invariant | user clarification; both proposals |
| Orchestrator relays complete reviewer chunks verbatim to executor | adopted | Direct user requirement; preserves role ownership | user report; gpt proposal; final cross-review |
| Executor retrieves reviewer panes itself | rejected | Violates explicit courier requirement and peer isolation; does not prove completeness | opus proposal; gpt R3 review |
| Executor owns feasibility, technical choices, QC/E2E applicability, and docs necessity | adopted | It is the role that reads task and repository | both proposals; synthesis |
| Reviewers independently check full task/framing conformance and applicability claims | adopted | Prevents executor self-grading its own reduced scope | premortem-opus scenario 2 |
| Technical disputes are routed among executor/reviewers, not decided by orchestrator | adopted | Keeps code judgement with actors that read code | gpt proposal; user clarification |
| Executor appears to the right of orchestrator; reviewers share a separate right-split tab | adopted | Exact requested observable topology | user report; both proposals |
| Ordinary interactive Herdr actor sessions are mandatory and persistent | adopted | Visibility, user access, cache economy | user report; both proposals |
| Headless/inline provider processes may implement executor/reviewer roles | rejected | They are invisible and lose required interactive continuity | user report; synthesis |
| All normal prompts use Herdr's atomic prompt+Enter primitive | adopted | Removes forgotten-Enter failure by construction | both proposals; live help |
| Wait only on direct actor lifecycle, never predicted SHA changes | adopted | Directly fixes the recorded impossible predicate | user post-mortem; both proposals |
| Ten minutes is a maximum wait arm, with direct peer-state checks and five-minute stall confirmation | adopted | Avoids both one-hour blind waits and needless busy polling | gpt waiting design; both premortems |
| Compact multi-turn reviewer batches replace one arbitrarily long TUI response | adopted | Keeps interactive sessions while bounding retrievable turns | gpt proposal; opus R3 criticism; synthesis |
| Verdict files, footers, nonces, or cooperative completion sentinels establish the gate | rejected | They do not prove transport completeness and recreate a protocol | existing architecture; both proposals' debate |
| Transport retries and unchanged dispute cycles are explicitly bounded | adopted | Prevents UNKNOWN/review livelock | both premortems |
| Add a special run-recovery identity or gate-restoration protocol | rejected | Restart follows ordinary startup; executor determines current implementation state | user clarification after section 1 |
| Add a persisted run/state store for recovery | rejected | No recovery machinery is required | project contract; user clarification |
| Deterministic gates may be executed by orchestrator as commands while it consumes only exit/object metadata | adopted | Separates process evidence from technical interpretation | premortem-gpt scenario 3 |
| Bundle pinned Claude Agent SDK into self-contained `mo-models.mjs` | adopted | Direct request; removes ambient installation dependency | user report; gpt proposal; local brain-council build |
| Install/search an ambient global/project Claude SDK | rejected | Non-reproducible and contrary to requested mechanism | user report; opus proposal rejected |
| Re-evaluate actual vendor diversity after every launch fallback | adopted | Catalogue membership is not entitlement or successful launch | both premortems |
| Normal runs ask the user to confirm models/reuse/watchdog choices | rejected | Orchestrator must replace the user for ordinary process choices | user report; gpt proposal |
| Feature branch must come from up-to-date `develop`; missing develop is a blocker | adopted | Explicit supplied VCS contract | user report; gpt proposal |
| Completed work remains in a Closed backlog section | rejected | Backlog holds only work not done; Git holds history | user report; both proposals |
| Routine changes create changelogs or explanatory docs | rejected | No requirement or durable consumer | user report; both proposals |
| Update existing knowledge made new or false in the same change | adopted | Preserves project contract without documenting routine events | project contract; synthesis |
| Create a new orchestrator-read-budget architecture file | rejected | Existing skills-first architecture can own the boundary | gpt R3 review of opus proposal |
| Verify and prepare five specific upstream Herdr issues | adopted | Genuine harness limitations remain after skill fixes | both proposals; final reviews |
| File upstream issues before reproducing current-version gaps | deferred | External write and evidence target must be confirmed | synthesis |
| Prescribe an E2E actor tab layout in this change | deferred | User specified executor/reviewer topology only | synthesis |
