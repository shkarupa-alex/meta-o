# Herdr orchestrator operational corrections

Status: council-refined design pending final council document review and user
approval.

## Purpose

Make a Meta-O feature run a visibly managed process over persistent specialist
sessions. The orchestrator is a transport and lifecycle controller. It does not
read the task, specification, business framing, source, tests, review findings,
or other tracked-file contents, and it does not form engineering opinions.

For Herdr, the result is directly observable:

- the executor is an ordinary interactive Claude or Codex CLI in the right pane
  beside the orchestrator;
- two ordinary interactive reviewer CLIs occupy the two right-split panes of a
  separate review tab;
- the same executor and reviewer panes stay warm across every round of one
  uninterrupted feature run;
- every prompt is submitted through Herdr's agent surface, including Enter;
- review output is copied verbatim to the executor only after both independent
  first passes finish;
- waits follow actor lifecycle, never a predicted Git change;
- every passing gate names the same full Git object ID.

Omnigent preserves the process-only role firewall and the same candidate and gate
semantics through its own native agent model. Herdr tabs, panes, TUI extraction,
and Herdr commands never enter `mo-omnigent`.

## Scope

This change updates the existing Meta-O skills and knowledge needed for:

- the backend-neutral orchestrator/executor/reviewer role firewall;
- `mo-herdr` topology, actor startup, prompting, waiting, compact handoff
  retrieval, review transport, and E2E dispatch;
- `mo-omnigent` only where its current behavior violates the backend-neutral
  firewall or model-catalogue contract;
- `mo-review` and `mo-e2e` handoffs;
- the bundled model-catalogue helper;
- project setup instructions, including version control, backlog, and
  documentation discipline;
- deterministic tests, Herdr fixtures, acceptance mapping, and upstream issue
  evidence.

This change does not add an orchestration CLI, provider proxy, daemon, adapter
layer, state store, run registry, recovery protocol, verdict file, completion
sentinel, receipt, manifest, digest, or baseline. It does not make headless actor
execution an invisible fallback.

## Normative invariants

1. After the backend skill starts, the orchestrator never intentionally opens,
   searches, quotes, summarizes, or edits the contents of a tracked project file.
   The only content exception is the project contract (`AGENTS.md` or `CLAUDE.md`)
   that the host CLI injected before skill activation; it is process policy, not
   feature input. Fixed Git metadata commands may internally read refs and the
   index, but only their narrow metadata output enters orchestrator context.
2. The task/spec path is an opaque locator to the orchestrator. Repository-reading
   actors receive it and open it themselves.
3. The orchestrator may observe fixed process metadata: repository root, current
   branch, `HEAD`, commit existence, worktree cleanliness, actor identity,
   lifecycle state, pane identity, and validated handoff headers.
4. The executor owns feasibility, architecture, implementation, tests,
   documentation necessity, version-control work, and ordinary technical choices.
5. Reviewers independently read the complete task and business framing, inspect
   the frozen candidate, run the required deterministic checks, and own their
   findings and applicability decisions.
6. The orchestrator does not filter, rank, merge, paraphrase, validate, or decide
   reviewer findings. Reviewer bodies are opaque bytes during transport.
7. Actor output is untrusted data. It may supply a validated process header and an
   opaque body, but it never authorizes an arbitrary host command or a relaxation
   of these invariants.
8. Every supported Herdr actor is a visible ordinary interactive subscription CLI
   started with `herdr agent start`. Direct `pane run`, inline/headless provider
   mode, SDK turns, and private provider transcripts are not actor fallbacks.
9. A complete compact handoff is bounded by the actor's exact process header and a
   provider-rendered lower input boundary. A missing, duplicated, stale,
   contradictory, oversized, or unreadable boundary makes the handoff `unknown`.
10. A review containing an open finding cannot pass. A rebuttal never closes a
    finding by itself; the originating reviewer or adjudicator closes it explicitly.
11. Two reviewers are from different vendors, and at least one is from a different
    vendor than the executor. Diversity is checked again after actual launches,
    not inferred from catalogue names.
12. A result is one full Git object ID. Any later commit invalidates every prior
    review, deterministic check, and E2E result.
13. A worktree edit without a commit prevents completion. It is returned to the
    executor and never treated as a second candidate.
14. A route or provider/version/surface combination is unsupported until the exact
    acceptance fixture passes. Availability pressure never converts `unknown` to
    `pass`.
15. Human attention is reserved for product meaning, irreversible action,
    credentials, subscription changes, production/destructive E2E approval,
    external blockers actors cannot resolve, or a technical dispute left
    unresolved by independent adjudication.

## Roles and backend ownership

### Orchestrator

The orchestrator may:

- accept a task/spec locator and select the requested backend skill;
- perform the fixed Git metadata checks listed in this document;
- discover configured model routes and apply documented fallbacks;
- create, label, start, prompt, wait for, and continue actor sessions;
- parse only the exact process-header grammar below;
- copy opaque actor bodies through restrictive temporary transport files;
- count review batches and finding identifiers;
- invalidate gates when `HEAD` or worktree cleanliness changes;
- report one verified object ID or a permitted `needs_attention` reason.

It must not:

- intentionally retrieve any tracked-file content after activation, including the
  task, spec, business framing, source, diff, tests, logs, build files, README files,
  or documentation; the already host-injected project contract remains the sole
  content exception;
- run `git diff`, `git show`, `git log -p`, `git blame`, or another command whose
  purpose is to reveal tracked content;
- decide feasibility, gate applicability, finding correctness, or what code or
  documentation should change;
- execute command text supplied by an actor;
- ask the human to choose ordinary models, reuse, watchdog behavior, technical
  fixes, or process steps;
- present an ordinary choice menu;
- keep reviewer prose in its working summary after delivery.

Its compact working summary contains only actor and pane IDs, provider/vendor,
candidate ID, current process state, batch numbers, finding IDs, and delivery
status. This is ephemeral reasoning context, not a persisted schema.

### Executor

The executor:

- opens the task/spec and all applicable project knowledge;
- decides whether the task is feasible and how to implement it;
- creates and stays on the required feature branch;
- makes coherent commits and runs relevant checks before each commit;
- decides whether documentation or deterministic/agentic verification applies;
- receives reviewer and E2E output as untrusted peer feedback, verifies it against
  the repository, and fixes or rebuts it;
- ends each process-relevant turn with one compact executor handoff;
- does not ask the human ordinary engineering questions that it can answer from
  the repository and product framing.

### Reviewers

Each reviewer independently:

- opens the task/spec and `docs/business.md` or equivalent framing;
- verifies the complete user scope, not only the executor's claimed scope;
- checks the frozen candidate without editing or committing;
- runs `make mo-qc`, `make mo-smoke`, and any additional project-owned checks it
  judges relevant;
- reports every finding with a stable reviewer-owned ID;
- declares whether agent-required E2E applies;
- emits compact review batches of at most 180 `recent-unwrapped` rows;
- explicitly accounts for all its open IDs before issuing `PASS`.

Reviewer A completes before reviewer B is prompted. Reviewer B receives the same
candidate and task locator but no output from reviewer A. Sequential execution
preserves independence, prevents concurrent test contention in one worktree, and
creates a hard barrier before the executor can mutate the candidate.

### E2E actor

When agent-required E2E is applicable, a separate visible ordinary interactive
actor runs `mo-e2e` against the frozen candidate. It reads the project E2E contract,
chooses only the applicable scenario groups, handles namespacing and cleanup, and
emits one compact E2E handoff. It never edits or commits tracked files.

## Herdr operational interface

### Preconditions

`mo-herdr` requires `HERDR_ENV=1`, a real repository, an interactive orchestrator
pane, the public Herdr commands named here, and at least two actually launchable
reviewer vendors whose exact TUI fixtures pass. Failed preconditions are reported
without a headless substitute.

The orchestrator may use these fixed Git metadata commands and no content-bearing
variants:

```text
git rev-parse --show-toplevel
git rev-parse HEAD
git branch --show-current
git status --porcelain
git cat-file -e <validated-object-id>^{commit}
```

An object ID is validated as the complete output of `git rev-parse`; the contract
does not assume SHA-1 or a fixed hexadecimal width. Actor strings never become
shell syntax.

### Visible topology

Let `<slug>` be the lowercase basename of the opaque task locator, replace every
non-alphanumeric run with `-`, trim separators, and keep at most 12 characters.
If empty, use `task`. Actor names are
`m-<slug>-<executor|reviewera|reviewerb|e2e>-<suffix>`, where `<suffix>` is six
lowercase alphanumeric characters derived from the current orchestrator pane.
This reserves enough space for the longest role under Herdr's 32-character limit,
always starts with a letter, and has no recovery meaning. Validate completed names
against `[a-z][a-z0-9_-]{0,31}` and uniqueness before mutating topology; a collision
gets a fresh current-run suffix.

The ordinary startup creates exactly two panes in each tab:

```text
tab "mo:<slug>"
├── orchestrator       left, existing pane
└── executor           right, vertical split

tab "mo:<slug>:review"
├── reviewer A         left, root pane
└── reviewer B         right, vertical split
```

An applicable E2E actor is created lazily in a visible tab `mo:<slug>:e2e`; no
fixed multi-pane E2E layout is required.

Construction uses `pane split --direction right --no-focus`, tab creation/move,
and `herdr tab rename <TAB_ID> <LABEL>` from the installed public CLI. It does not
steal focus, close user panes, replace vertical splits with horizontal ones, or
hide roles. Tab labels remain after the run for observability; there is no restore
step. Rename failure is retried once and then becomes `needs_attention` because
the requested observable topology was not established.

### Actor startup and model arguments

Every role is started in an existing shell pane:

```text
herdr agent start <name> --kind claude --pane <id> -- --model <id> --effort <level>
herdr agent start <name> --kind codex  --pane <id> -- --model <id> --config model_reasoning_effort=<level>
```

These argument forms are supported only after provider/version fixtures prove
that the selected model is active. Other Herdr kinds remain unsupported until
their exact catalogue, argument, lifecycle, and extraction fixtures exist.

`agent start` is the normal route because it resolves the system CLI, verifies the
expected interactive process in the pane, names the actor, and exposes lifecycle.
Directly running `claude` or `codex` is diagnostic only; it is not a feature actor
route.

A catalogue-listed model whose CLI exits before Herdr readiness is `launch_failed`,
not `model_missing`. A ready actor proves launchability for that run. Fallback
launches are checked again for real vendor diversity.

### Atomic prompting

All ordinary work uses one call:

```text
herdr agent prompt <actor> <text> --wait --until idle --until done \
  --until blocked --until unknown --timeout <milliseconds>
```

The actor must be settled before submission. `agent prompt` provides text and Enter
atomically; `pane send-text`, separate `send-keys enter`, terminal typing, and
shell-injected provider commands are forbidden for ordinary prompts.

The recommended user start is deliberately short:

```text
/goal Run mo-herdr for <TASK_OR_SPEC_PATH>.
```

The skill, not the caller, supplies process rules. Its executor goal is also one
line so it works in a single-line slash-command field:

```text
/goal Implement <TASK_OR_SPEC_PATH> to a verified candidate; own repository reading, decisions, branch, checks, commits, and compact Meta-O handoffs without asking ordinary technical questions.
```

Reviewer and E2E prompts similarly name the task locator, candidate, role, compact
handoff version, and maximum batch size without embedding tracked-file contents.

## Compact handoff protocol

### Why a process header is allowed

The first line of a handoff is process metadata, not a completion sentinel. It
does not prove the turn finished. Completion is proven by the provider-rendered
lower input boundary after Herdr observes the actor settle. The header only marks
where the opaque payload begins and provides fields the process-only orchestrator
is allowed to route.

No Markdown structure is parsed. Headings, fences, verdict prose, code blocks, and
finding bodies are opaque. The implementation uses no handwritten Markdown parser
and adds no parser helper. Simple exact-line and delimiter processing is limited
to the ASCII grammar below.

### Grammar

Every header is one physical `recent-unwrapped` line:

```text
MO_EXECUTOR_V1|type=<READY|CANDIDATE|RESPONSE|BLOCKER>|candidate=<oid|none>|branch=<name|none>|base=<oid|none>|fixes=<ids|none>|rebuts=<ids|none>|blocker=<class|none>
MO_REVIEW_V1|candidate=<oid>|reviewer=<A|B>|status=<PASS|FINDINGS|DISPUTED|UNKNOWN>|batch=<positive-int>|more=<yes|no>|ids=<ids|none>|open=<ids|none>|closes=<ids|none>|qc=<PASS|FAIL|UNKNOWN>|smoke=<PASS|FAIL|UNKNOWN>|e2e=<REQUIRED|NA|UNKNOWN>|unknown=<transport|environment|evaluation|none>
MO_ADJUDICATION_V1|candidate=<oid>|finding=<id>|reviewer=<A|B>|outcome=<UPHOLD|WITHDRAW|UNRESOLVED>
MO_E2E_V1|candidate=<oid>|status=<PASS|FAIL|UNKNOWN>|scenarios=<positive-int>|not_run=<none|positive-int>
```

Fields appear exactly once in the shown order. Values use restricted character
sets; finding IDs are `A-<positive-int>` or `B-<positive-int>` and comma-separated
without spaces. Unknown fields, duplicates, malformed values, candidate mismatch,
reviewer mismatch, non-monotonic batches, and contradictory values make the
handoff `unknown`.

The body begins on the next row and continues to the provider lower boundary.
Executor, review, and E2E bodies are limited to 180 `recent-unwrapped` rows and
64 KiB of UTF-8 including the header. A larger result is split into numbered
batches; `more=yes` means the orchestrator prompts the same warm actor for the next
compact batch. An over-byte batch is not sliced by the orchestrator: the same actor
is asked once to reissue it as smaller semantic batches, then the handoff is
`unknown`.

`PASS` requires `more=no`, `open=none`, `ids=none`, `qc=PASS`, `smoke=PASS`,
`unknown=none`, and `e2e` equal to `REQUIRED` or `NA`. `FINDINGS` names every
finding introduced in that batch in `ids`. A later `PASS` lists every previously
open ID in `closes`. An `UNKNOWN` header names exactly one non-`none` unknown class.
These are mechanical accounting rules; the orchestrator never interprets the
bodies.

Across all batches for one actor turn, `candidate`, `reviewer`, `status`, `qc`,
`smoke`, `e2e`, and `unknown` are identical; batch numbers are consecutive from 1,
finding IDs are unique, and only the last batch has `more=no`. Executor and E2E
multi-batch handoffs likewise keep their type/candidate/status fields invariant.

An executor `BLOCKER` uses only these human-boundary classes:

```text
product_meaning | irreversible_action | credentials | subscription |
production_e2e | external_blocker | unresolved_dispute
```

Any ordinary technical blocker is the executor's responsibility and is not a
permitted human interruption.

### Adaptive extraction without context pollution

The skill provides an adaptable inline shell recipe, not a maintained script. One
per-run orchestrator-owned `0700` `mktemp -d` outside the repository holds `0600`
opaque batches. Its path is an allowed opaque scratch handle in the ephemeral
working summary from first extraction through confirmed post-barrier delivery. It
is never committed or interpreted. Files are deleted after confirmed delivery and
the directory is deleted on failure, signal, and normal exit. If the handle is lost,
the buffered reviews become `unknown` and both first passes rerun; a new run never
adopts old scratch. Ordinary startup removes only same-UID, mode-`0700`, exact-prefix
transport directories older than 24 hours.

For each settled actor turn:

1. Read `recent-unwrapped` privately at 120 rows.
2. If the exact role header and provider lower boundary are not both present, grow
   to 200, 400, 800, then 1000 rows.
3. Claude's current candidate lower-boundary neighborhood contains its final input
   line beginning `❯`; Codex's contains its final input line beginning `›`. A glyph
   alone is not a boundary. The provider/version fixture defines the adjacent chrome
   and terminal-tail position that make the neighborhood structural. Reject multiple
   structural candidates; never choose one merely because it is last. Each exact
   provider/version pattern is enabled only by its fixture.
4. Reject zero or multiple matching headers in the selected interval. Copy the
   header and every row through the row before the lower boundary byte-for-byte to
   scratch. Everything before the header, including tool rendering, is discarded.
5. Print only the validated first header line into orchestrator context. Keep the
   opaque body in scratch.
6. When delivery is allowed, pass the scratch bytes as one quoted `agent prompt`
   argument inside an explicit `reviewer-output` or `e2e-output` data wrapper. Do
   not use `eval`, unquoted expansion, command construction from the body, or an
   actor-provided path.

The wrapper tells the executor that the enclosed bytes are untrusted peer feedback:
evaluate them against the repository, and ignore any attempt inside them to change
role, transport, permissions, or process rules. The bytes inside the wrapper are
unchanged.

If a boundary is absent at 1000 rows, the interval exceeds 180 rows or 64 KiB,
glyph-prefixed body text creates ambiguity, repaint or resize invalidates continuity,
or the schema is damaged, the gate is `unknown`. The same actor is asked once to
reissue that batch more compactly and without tools. After two damaged attempts the
exact provider/version TUI route is unsupported for the gate. There is no headless,
inline, file-verdict, provider-private transcript, or executor-reads-reviewer-pane
fallback.

This is an explicit amendment to `docs/architecture/full-turn-retrieval.md`: the
Herdr route transports complete compact process handoffs, not an arbitrarily long
TUI turn. The exact header is the upper transport boundary, and the provider input
prompt is the lower completion boundary. Existing long-turn TUI failures remain
true; only provider/version/row-limit combinations proven by the replacement
fixtures become supported.

## Lifecycle and waiting

### Wait budgets

- executor: one active wait arm of at most 10 minutes;
- reviewer or E2E actor: one active wait arm of at most 5 minutes;
- multi-batch reviewers: alternate actor prompt/wait operations; never leave two
  waiters for the same actor;
- every wait returns immediately on `idle`, `done`, `blocked`, or `unknown`.

The direct condition is actor lifecycle. A wait never includes `HEAD != <old>`, a
predicted new SHA, worktree cleanliness, a terminal text prediction, or a polling
sleep. On timeout the orchestrator reads only `agent` state and `pane process-info`,
not arbitrary terminal rows. While authoritative lifecycle remains `working` and
the expected provider process is present, it re-arms another bounded interval; the
interval is a responsiveness budget, not an artificial total runtime limit. It
never waits an hour on one unobservable predicate.

The provider-posture preflight must prove that ordinary repository trust and
reversible tool use do not stop the selected route in a blocked UI. A route that
cannot establish that posture is unsupported for unattended orchestration.

### State handling

| Observed state               | Mechanical action                                                               | Limit / outcome                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `working`                    | Re-arm one bounded wait while the expected process remains present              | No total cap derived from elapsed time; process loss or inconsistent lifecycle follows its own row              |
| `idle` or `done`             | Run compact handoff extraction                                                  | Damaged handoff retries once, then gate `unknown` / route unsupported                                           |
| `blocked`                    | Do not answer or inspect the UI; report the visible tab, pane, and role         | Human inspects and answers the exact provider UI directly; repeat ordinary blocking makes the route unsupported |
| `unknown`                    | Read only lifecycle and process metadata, then wait once more                   | Persistent unknown is `needs_attention`; it is never completion                                                 |
| actor exited                 | Start the same kind in the same visible pane once and resend the full role goal | Warm-session guarantee is lost for that role and the current gate restarts; second exit is `needs_attention`    |
| pane missing/closed          | Recreate the visible role pane once and start a fresh role                      | Current gate restarts; second loss is `needs_attention`                                                         |
| wrong UI / startup not ready | Try the next catalogue-supported route once                                     | Recheck vendor diversity; otherwise `needs_attention`                                                           |

The visible pane is the narrow human blocker channel: it contains the provider's
exact question, target, and risk, while the orchestrator reports only the tab,
pane, role, and `blocked` state. This preserves the no-read firewall and avoids an
orchestrator-authored menu or paraphrase. When the user resolves the visible UI,
direct lifecycle wakes the same wait loop.

The restart after actor loss is local process recovery inside one run. It is not
cross-orchestrator recovery and does not infer repository meaning.

### Orchestrator restart

There is no restoration protocol. A restarted orchestrator performs ordinary
startup from the current repository state, creates and labels the needed panels,
starts new actor sessions, and sends the full role goals. It does not enumerate,
adopt, interrogate, or close sessions from the previous orchestrator run. The new
executor reads the repository and decides where work stopped.

Old visible panes are left untouched. Name collisions receive the ordinary
current-pane suffix. Warm-session continuity is guaranteed only inside one
uninterrupted feature run; restart deliberately begins a new run.

## Candidate, review, gate, and E2E flow

The following state machine is conceptual reasoning in the skill, not a program or
persisted state machine:

```text
preflight
  -> executor_active
  -> candidate_frozen
  -> reviewer_A
  -> reviewer_B
  -> first_pass_barrier
       -> resolution -> executor_active          (findings or failed QC)
       -> e2e                                      (both reviews pass; E2E required)
       -> verified                                 (both reviews pass; E2E jointly NA)
  -> e2e
       -> resolution -> executor_active            (FAIL)
       -> verified                                 (PASS)
       -> needs_attention                          (persistent UNKNOWN)
```

### Candidate freeze

The executor's `CANDIDATE` handoff is accepted only when:

- `git status --porcelain` is empty;
- the declared candidate equals `git rev-parse HEAD` exactly;
- `git cat-file -e <candidate>^{commit}` succeeds;
- the current branch equals the declared branch and matches `feature/<short-slug>`;
- the executor declares the full current `develop` base it used.

The orchestrator does not decide project-specific ancestry policy. Both reviewers
validate the executor's base/update claim from the repository.

Before and after every reviewer and E2E turn, the orchestrator repeats only `HEAD`
and cleanliness checks. A different `HEAD` invalidates all gates and returns to the
executor. A dirty worktree blocks the current gate and is returned as a process fact.

### Independent reviews and deterministic checks

Reviewer A receives the task locator and frozen candidate, completes all batches,
and runs `make mo-qc`, `make mo-smoke`, plus relevant project-owned checks. Its
bytes are buffered outside the repository under the per-run scratch owner. The
executor receives nothing yet.

After A settles and the candidate remains clean and unchanged, reviewer B receives
the same task locator and candidate, with no A output. B completes all batches and
runs its checks. This sequential default prevents two QC processes from contending
in one worktree. Concurrency is allowed only when project-owned tracked instructions
explicitly say those exact checks are concurrency-safe; the default workflow does
not need it.

The orchestrator does not execute deterministic commands or inspect their output.
A deterministic gate passes only when both independent reviewers report `qc=PASS`
and `smoke=PASS` for the same unchanged candidate. `make mo-smoke` is reported
explicitly even when the project's authoritative `make mo-qc` already depends on
it. This deliberately uses independent cross-vendor actor reports rather than
unavailable Herdr metadata for commands executed inside a TUI. The residual risk is
accepted because author self-report alone is insufficient, while reading logs or
running opaque commands would violate the role firewall.

Only when both reviewers have reached a complete terminal outcome does the
first-pass barrier open. If either reports findings or failed/unknown QC, all
complete A and B batches are relayed verbatim to the executor, in reviewer and batch
order. The executor cannot edit the shared worktree while a peer is still reviewing
the frozen candidate.

A reviewer `UNKNOWN` does not open the mutation barrier. `transport` follows the
handoff damage retry; `environment` and `evaluation` each retry the whole evaluation
once in the same warm reviewer session against the same unchanged candidate. A
second `UNKNOWN` is a reviewer-gate `needs_attention`; completed peer findings stay
buffered and are not treated as a complete review round.

### Resolution and finding closure

The orchestrator tracks finding IDs, never finding meaning.

- A fix produces a new coherent commit and `CANDIDATE` handoff. Every review,
  deterministic check, and E2E result restarts for the new object ID.
- A rebuttal without a commit uses `RESPONSE` with the exact `rebuts` IDs and an
  opaque body. It is relayed only to each originating reviewer.
- The originating reviewer either closes the IDs in a final `PASS`, keeps them
  open in `FINDINGS`/`DISPUTED`, or returns `UNKNOWN`.
- A kept disputed finding and the complete opaque exchange go once to the other
  vendor reviewer, which emits `MO_ADJUDICATION_V1`.
- `UPHOLD` returns the finding to the executor. `WITHDRAW` is relayed back to the
  originating reviewer, which must emit a final `PASS` explicitly listing the ID in
  `closes`; adjudication alone does not pass that review. `UNRESOLVED` becomes the
  permitted human `unresolved_dispute` boundary.

There is no orchestrator comparison of arguments, evidence novelty, or technical
equivalence. One independent adjudication replaces an unbounded semantic bounce.

### Agent-required E2E

E2E is skipped only when both final reviewers independently report `e2e=NA` for
the frozen candidate. Any `REQUIRED` or `UNKNOWN` means it is not safely skipped.

When required, the orchestrator lazily creates the visible E2E tab and starts an
ordinary actor with a goal containing the task locator and full candidate ID. The
actor runs `mo-e2e`, obtains any destructive/production approval through the
permitted human boundary, and emits `MO_E2E_V1`.

- `PASS` requires `not_run=none`, unchanged `HEAD`, and a clean worktree.
- `FAIL` is relayed verbatim to the executor; the next commit invalidates all gates.
- `UNKNOWN` is retried once in the same warm E2E session. Persistent unknown is
  `needs_attention`, never a partial pass.

E2E does not trigger a new review when it changes no tracked file. Any commit made
after E2E, for any reason, restarts reviews, deterministic checks, and E2E.

### Verified result

The orchestrator returns one full object ID only when, for that exact unchanged
candidate:

- the worktree is clean;
- reviewer A and reviewer B are different vendors;
- at least one reviewer vendor differs from the executor vendor;
- both final reviewer handoffs are `PASS`, have `open=none`, and report `qc=PASS`
  and `smoke=PASS`;
- every introduced finding ID is explicitly closed or superseded by a new candidate;
- E2E is `PASS`, or both reviewers independently report `NA`;
- a final `git rev-parse HEAD` equals the candidate.

## Model catalogue and self-contained build

Normal startup reads the compact configured selections and never presents a model
menu. Missing or unusable selections follow the documented route fallback and
preserve the vendor-diversity invariant. Catalogue discovery and entitlement are
different facts:

- `catalog_unknown`: the route could not enumerate models;
- `model_missing`: enumeration succeeded and omitted the configured ID;
- `launch_failed`: the catalogue named the ID but the ordinary interactive CLI did
  not reach Herdr readiness with the selected arguments.

Fallback is autonomous. Human attention is required only after no supported set can
actually launch with the required diversity or a subscription/credential change is
needed.

Claude catalogue support follows the working brain-council distribution pattern:

- authored entry: `shared/scripts/mo-models.mjs`;
- exact build dependencies: `esbuild` `0.25.12` and
  `@anthropic-ai/claude-agent-sdk` `0.3.191` in project `devDependencies`;
- the entry statically imports the SDK and points it at the system subscription CLI
  through `pathToClaudeCodeExecutable`;
- `tools/build-skills.mjs` bundles the entry with `bundle: true`, `platform: node`,
  `format: esm`, `target: node20`, `external: []`, and no minification;
- generated outputs are
  `skills/mo-herdr/scripts/mo-models.mjs` and
  `skills/mo-omnigent/scripts/mo-models.mjs`, byte-identical to each other but no
  longer byte-identical copies of the authored entry;
- `SHARED_PLAN` distinguishes this transformed shared entry from verbatim shared
  copies, and the built-tree test verifies the transform deterministically;
- the SDK licence is source-owned at
  `shared/licenses/claude-agent-sdk.LICENSE` and copied beside each generated helper
  under `scripts/licenses/`; this file has the distribution/legal consumer that
  justifies it;
- the generated helper contains no runtime import of the SDK and resolves no ambient
  `node_modules`.

Isolated tests install/copy only the generated skill into a temporary directory with
no project/global `node_modules`, point the SDK at a fake system Claude executable,
enumerate a fixture model catalogue without a conversational model turn, enforce a
timeout, and assert no child process survives. A live fixture repeats catalogue
enumeration against the real system Claude subscription CLI and records catalogue
availability separately from subsequent actor launchability.

Codex continues to use its native `codex debug models` catalogue; OpenCode uses its
native listing. No SDK is bundled without a route that consumes it.

The former “two dependency-free helpers” description becomes “two self-contained
runtime helpers”. The same increment updates all normative occurrences in
`AGENTS.md`, byte-identical `CLAUDE.md`, `docs/e2e.md`, and
`docs/architecture/provider-posture-script.md`. Historical verbatim framing is not
rewritten.

## Project contract changes

### Version control

`mo-setup` installs the following byte-identically in target `AGENTS.md` and
`CLAUDE.md`:

```markdown
## Version control

Never develop directly on `main`, `master`, `develop`, or `default`. Create each
task branch from an up-to-date `develop` using `feature/<short-slug>` and use it for
the whole task.

Run the relevant checks before committing. Commit every coherent, independently
verifiable increment instead of accumulating the whole task in one commit. Use
`<type>: <what changed and why>` with `feat`, `fix`, `refactor`, `test`, `docs`, or
`chore`. Reference an issue or specification when one exists, but neither is
required.

The final verified result is one full Git object ID. Any subsequent commit
invalidates its review and verification gates.
```

### Backlog

`docs/backlog.md` contains only unfinished, deferred, blocked, knowingly unfixed,
or unsupported work. When an entry is completed it is deleted in the same change.
There is no “Closed” section and no completed-work history; Git is the history.

### Documentation

An executor updates existing knowledge only when its change makes that knowledge
new or false. It does not create `CHANGELOG.md`, migration notes, explanatory
reports, per-subdirectory READMEs, or a document narrating routine cleanup unless
the user requested it or a named durable consumer requires it.

A new architecture document is justified only by a durable boundary with no
existing home. This change updates the existing full-turn-retrieval and distribution
decisions rather than creating narration about the change itself.

`docs/business.md` appends only the user's original report and later user-authored
clarifications verbatim. Derived limits, schemas, fixture choices, and implementation
decisions belong in the existing methodology, architecture, acceptance, or fixture
documents; they are not rewritten as if the user had said them.

## Error contract

| Condition                                    | Automatic action                                   | Terminal outcome                                  |
| -------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Not in Herdr / missing public command        | No actor launch                                    | `needs_attention` with exact capability           |
| Tab rename/layout failure                    | Retry once without changing focus or closing panes | `needs_attention`                                 |
| Catalogue unavailable                        | Try other configured supported route               | `needs_attention` only if diversity cannot launch |
| Configured model absent                      | Select documented same-route fallback              | `needs_attention` only if none launches           |
| Actor startup failure                        | Try one supported fallback, recheck diversity      | `needs_attention`                                 |
| Prompt submission stalls before state change | Retry atomic prompt once while settled             | `needs_attention` on repeat; never manual Enter   |
| Actor remains `working` at interval boundary | Verify expected process and re-arm bounded wait    | Continue while direct state is healthy            |
| Actor `blocked`                              | Report visible tab/pane/role; user reads exact UI  | Continue same session after direct unblock        |
| Actor remains lifecycle `unknown`            | Re-arm once using metadata only                    | `needs_attention`                                 |
| Actor/pane exits                             | Recreate once and restart current gate             | `needs_attention` on repeat                       |
| Handoff boundary/schema damaged              | Same actor reissues shorter batch once             | Gate `unknown`; route unsupported on repeat       |
| Candidate mismatch or dirty tree             | Return process facts to executor                   | New candidate required                            |
| Reviewer QC or smoke fails                   | Finish peer first pass, then relay both bodies     | Executor resolution                               |
| Reviewer evaluation remains `UNKNOWN`        | Retry once in same warm session                    | `needs_attention`; do not open mutation barrier   |
| Review finding                               | Finish peer first pass, then relay all batches     | Executor resolution                               |
| Rebuttal remains disputed                    | One other-vendor adjudication                      | Uphold, withdraw, or `needs_attention`            |
| E2E fail                                     | Relay body to executor                             | New candidate and all gates rerun                 |
| E2E unknown                                  | Retry once in same session                         | `needs_attention` on repeat                       |
| Any new commit                               | Invalidate every gate                              | Restart at candidate freeze                       |

## Herdr upstream issue candidates

Create an upstream issue only after reproducing the exact behavior against the
current installed Herdr version and collecting public-surface evidence. Candidates:

1. a logical last-turn API that distinguishes complete, in-progress, truncated,
   repainted, and alternate-screen output without private transcripts;
2. programmatic scroll or alternate-screen capture beyond the 1000-row terminal
   window;
3. public per-agent context/token/cache telemetry for long-run economics;
4. documented `state_change_seq` freshness semantics usable by prompt/wait clients;
5. multi-actor wait/status sets so one bounded wait can observe several reviewers.

Do not file missing tab rename: `herdr tab rename <TAB_ID> <LABEL>` is verified in
the installed public CLI. Do not claim a missing agent-status event without a
current public-surface reproduction.

## Acceptance and verification

### Deterministic `make mo-qc`

The authoritative deterministic gate remains non-mutating and covers:

- byte-identical `AGENTS.md` and `CLAUDE.md`;
- generated `skills/` exactly matching a fresh build;
- exact pinned bundle dependencies, self-contained generated outputs, copied
  licence, no runtime SDK import, isolated launch, timeout, and no child leak;
- model catalogue outcomes separated into unknown, missing, and launch failure;
- AST-level checks with `markdown-it` for normative skill sections and code blocks;
  no regex Markdown parser and no false failure on prohibition prose;
- the fixed process-header field grammar, QC/smoke/UNKNOWN accounting, cross-batch
  invariants, and 64 KiB validation examples as data tests, without shipping a
  parser helper;
- backlog open-only and absence of an invented closed section;
- the project-contract version-control text and trailer format;
- no unrequested changelog or new-document requirement;
- every source-changing test fixture rebuilding `skills/` in the same increment.

Deterministic tests do not claim TUI behavior, provider continuity, Enter delivery,
or absence of tracked-file reads. Those require the agentic Herdr E2E.

### Agent-required Herdr E2E

Before support is claimed, an independent observer runs a small scratch feature
whose orchestrator command history remains within the public Herdr read window and
verifies:

1. the exact two-tab executor/reviewer topology, labels, vertical panes, unchanged
   focus, and lazy visible E2E tab;
2. normal system Claude/Codex interactive processes launched by `agent start`, with
   the selected model arguments accepted;
3. same actor name and pane ID across later turns, no actor-exit event, and an
   unprompted reference to prior candidate context; no provider-private session ID
   is used as evidence;
4. one single-line `/goal` and one maximum-size multiline relay each arrive as one
   intact turn and start only after atomic Enter;
5. the 120/200/400/800/1000 growth ladder, exact header cut, 64 KiB byte cap, and
   structural provider lower boundary on Claude and Codex at the 180-row maximum,
   with tools, Unicode, soft wraps, duplicate header text, body lines beginning
   `❯`/`›`, missing boundary, repaint, and host-window H7b resize cases;
6. damaged or over-limit output becomes `unknown` after bounded retry, never a
   partial pass or headless fallback;
7. executor `READY`/`CANDIDATE`/`RESPONSE` and E2E handoffs use the same extraction
   contract as reviewer handoffs;
8. reviewer A completes before B starts, B receives no A output, both see the same
   clean candidate, and the executor cannot mutate until the first-pass barrier;
9. reviewer QC and smoke run sequentially and their failed output is interpreted
   by reviewers, not the orchestrator;
10. a known adversarial reviewer body is byte-identical inside the executor data
    wrapper and cannot inject shell commands or role changes;
11. every finding ID is either still open, explicitly closed, adjudicated, or
    invalidated by a new candidate;
12. waits wake on same-SHA actor completion and never require a future SHA;
13. any new commit invalidates both reviews, QC, and E2E; the returned result is the
    one unchanged full object ID;
14. a restarted orchestrator creates new ordinary sessions and the new executor
    discovers current repository state without a restoration protocol;
15. live Claude catalogue discovery uses the bundled SDK and system subscription
    CLI without ambient `node_modules`, while actual launches still determine
    entitlement and diversity;
16. no menus appear during ordinary progress and no prompt requires a separate
    Enter operation;
17. after skill activation, an instrumented tool harness rejects every intentional
    tracked-content retrieval action by the orchestrator while allowing the fixed
    Git metadata forms; a canary tracked-file value never enters orchestrator tool
    output or model context. Host-preloaded `AGENTS.md`/`CLAUDE.md` and Git's internal
    ref/index opens are outside that action audit and are the only stated exceptions;
18. reviewer A scratch remains available through reviewer B and confirmed barrier
    delivery, then is deleted; lost scratch makes the round `unknown`, and stale
    exact-prefix same-UID scratch is cleaned without adopting it.

The exact TUI route remains unsupported until H7b and the Claude/Codex 180-row
replacement fixtures pass. If fewer than two vendors pass, `mo-herdr` cannot produce
a verified result: it reports `needs_attention` and the failed fixture supplies the
evidence for the applicable Herdr/provider issue. There is no invisible fallback.

### Omnigent acceptance

The Omnigent E2E independently proves the same role firewall, candidate, reviewer
independence, finding accounting, gate invalidation, and human-boundary rules through
native Omnigent agents. It does not assert Herdr layout or reuse Herdr extraction.
Until Omnigent's native full-turn route satisfies its existing architecture contract,
that backend remains fail-closed rather than using headless free-text as an
off-contract substitute.

## Implementation decomposition

Every increment that changes `src/skills/` or `shared/` also runs `make skills`,
includes the regenerated `skills/` tree, and passes the relevant checks before its
commit. There is no final catch-up rebuild commit.

1. **Project contract and knowledge.** Append the verbatim business clarifications;
   add the byte-identical version-control, backlog, and documentation rules; update
   existing architecture/acceptance files and their deterministic tests.
2. **Self-contained catalogue.** Add the exact build dependencies and SDK licence;
   make the shared helper a bundled build entry; update `SHARED_PLAN`, isolated
   catalogue tests, all four helper-description locations, generated skills, and
   pass `make mo-qc` in the same increment.
3. **Backend-neutral role and handoff contract.** Update methodology, `mo-review`,
   `mo-e2e`, and the relevant `mo-omnigent` boundaries; add header grammar examples,
   finding closure, adjudication, E2E semantics, AST-level content tests, generated
   skills, and `make mo-qc` together.
4. **Herdr topology, launch, and lifecycle.** Implement the exact tabs/panes,
   `agent start` model arguments, atomic one-line goals, wait status sets, restart
   semantics, error table, deterministic doc checks, generated skill, and
   `make mo-qc` together.
5. **Compact TUI transport.** Add the adaptive inline command recipe, restrictive
   scratch lifecycle, row/byte bounds, opaque relay wrapper, all role handoffs,
   bounded damage behavior, and the same-increment amendment to
   `docs/architecture/full-turn-retrieval.md`; rebuild and pass `make mo-qc`.
6. **Acyclic feature flow.** Add sequential independent review, first-pass barrier,
   dual reviewer QC/smoke, UNKNOWN recovery, final post-adjudication closure, lazy
   visible E2E, candidate invalidation, and deterministic state/traceability tests;
   rebuild and pass `make mo-qc`.
7. **Agentic evidence and upstream triage.** Run H7b and the exact 180-row Claude and
   Codex fixtures plus the full scratch feature. Record only observed passes and
   open failures; create upstream issues only for current reproducible Herdr gaps;
   keep every unproven route unsupported and record unfinished work only in backlog.

The executor may split an item further when each split stays independently green.
It may combine adjacent items when an invariant cannot be green in isolation. It
may not defer generated output or knowledge made false to a later commit.

## Decision ledger

| Decision                                                                              | Status   | Rationale                                                                                                                      |
| ------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Orchestrator performs no intentional tracked-content retrieval after skill activation | adopted  | Explicit user clarification; host-preloaded project contract and fixed Git metadata internals are the narrow stated exceptions |
| Herdr mechanics belong only to `mo-herdr`                                             | adopted  | Omnigent manages native agents in its own paradigm                                                                             |
| Executor owns spec reading, feasibility, implementation, and ordinary choices         | adopted  | Engineering judgment stays with repository-reading actor                                                                       |
| Restart creates a new ordinary run; executor discovers repository state               | adopted  | Explicit user clarification; no recovery machinery                                                                             |
| Cross-restart session adoption/registry/state restoration                             | rejected | Unrequested and contrary to ordinary restart                                                                                   |
| Executor-right plus separate two-reviewer right-split tab                             | adopted  | Exact requested visual topology                                                                                                |
| Review tab contains exactly reviewer A root pane plus reviewer B right split          | adopted  | “Two vertical panels” means two panels, not an extra anchor                                                                    |
| Actor names reserve role/suffix space and validate before layout mutation             | adopted  | Herdr requires a leading letter, uniqueness, and at most 32 characters                                                         |
| Persistent visible native TUI sessions inside one uninterrupted run                   | adopted  | Observability and warm-session cache economics                                                                                 |
| `herdr agent start` as normal actor launch                                            | adopted  | Public readiness, naming, and lifecycle around the system CLI                                                                  |
| Direct `pane run`, inline/headless, or SDK actor fallback                             | rejected | Invisible/off-contract and loses warm TUI continuity                                                                           |
| Atomic `agent prompt` for ordinary messages                                           | adopted  | Enter is delivered by construction                                                                                             |
| Short caller goal names only the skill and task path                                  | adopted  | Process rules belong in the skill                                                                                              |
| Adaptive 120/200/400/800/1000 private reads                                           | adopted  | Bounds orchestrator context and respects Herdr's cap                                                                           |
| Exact ASCII handoff header plus provider lower boundary                               | adopted  | Trims tool rendering without parsing Markdown; lower boundary proves completion                                                |
| Completion footer, verdict file, nonce, or model-written end sentinel                 | rejected | Does not prove a complete provider turn and adds protocol state                                                                |
| Opaque body, no Markdown parsing                                                      | adopted  | Satisfies role firewall and real-parser contract                                                                               |
| Compact batches capped at 180 rows                                                    | adopted  | Fixtureable safe envelope below the 1000-row ceiling                                                                           |
| Compact batches also capped at 64 KiB UTF-8                                           | adopted  | Row counts alone do not bound one atomic CLI argument                                                                          |
| Per-run restrictive scratch survives through the first-pass barrier                   | adopted  | Keeps opaque bodies out of model context while permitting delayed verbatim relay                                               |
| Sequential A then B review with first-pass barrier                                    | adopted  | Preserves independence and frozen worktree; prevents QC contention                                                             |
| Immediate relay before peer finishes                                                  | rejected | Lets executor tear the candidate under the peer review                                                                         |
| Both reviewers independently run QC and smoke                                         | adopted  | Independent cross-vendor evidence without orchestrator log/code reading                                                        |
| Orchestrator executes actor-supplied or inferred gate commands                        | rejected | Unsafe and violates process-only role                                                                                          |
| Backend-observed internal TUI command exit status as required evidence                | rejected | Current public Herdr surface does not provide it; dual independent reviewer reports are the adopted evidence                   |
| Stable reviewer finding IDs and explicit closure/adjudication                         | adopted  | Makes routing mechanical without judging semantics                                                                             |
| Adjudication withdrawal still requires originating-reviewer final PASS                | adopted  | Every reviewer owns closure of its gate                                                                                        |
| Reviewer UNKNOWN retries once in the same session and never opens mutation barrier    | adopted  | Incomplete evaluation is not a review result                                                                                   |
| Agentic E2E after two passing reviews, rerun after any commit                         | adopted  | Acyclic fail-closed flow on one candidate                                                                                      |
| Direct lifecycle waits, never predicted SHA changes                                   | adopted  | Fixes the observed impossible wait predicate                                                                                   |
| Ten-minute executor and five-minute reviewer/E2E wait arms                            | adopted  | Responsive without busy polling                                                                                                |
| Healthy `working` lifecycle re-arms bounded waits without an elapsed-time cap         | adopted  | Interval bounds observability, not legitimate actor runtime                                                                    |
| Blocked provider UI is relayed by visible pane location, not interpreted text         | adopted  | Human sees the exact approval/question while orchestrator preserves the no-read firewall                                       |
| Tab labels remain after completion                                                    | adopted  | Preserves visual history; no restore operation was requested                                                                   |
| Bundle Claude SDK into generated helpers                                              | adopted  | Reproducible catalogue matching the working brain-council pattern                                                              |
| Ambient/global/project SDK lookup at runtime                                          | rejected | Non-reproducible and caused the observed catalogue gap                                                                         |
| Catalogue equals entitlement                                                          | rejected | Actual interactive launch is the entitlement check                                                                             |
| Feature branch from up-to-date `develop`, coherent commits, full object ID            | adopted  | Explicit version-control requirement                                                                                           |
| Completed entries remain in backlog                                                   | rejected | Git is history; backlog is open work only                                                                                      |
| Routine changelog or explanatory documents                                            | rejected | No user request or durable consumer                                                                                            |
| Update existing knowledge made new or false                                           | adopted  | Project knowledge contract                                                                                                     |
| Amend existing full-turn retrieval decision                                           | adopted  | Compact TUI handoffs replace the old long-turn assumption only after fixtures                                                  |
| Claim TUI support before H7b and 180-row fixtures                                     | rejected | Existing Claude repaint evidence must remain fail-closed                                                                       |
| Five evidence-backed Herdr issue candidates                                           | adopted  | They represent real remaining harness gaps                                                                                     |
| Claim missing tab rename/status event without reproduction                            | rejected | Rename is verified in public CLI; issues require current evidence                                                              |
| Fixed E2E multi-pane layout                                                           | deferred | E2E remains visible; physical layout follows actual scenario need                                                              |

## Rejected and deferred alternatives

The ledger is normative. In particular, implementation must not regain convenient
review retrieval by launching new headless instances, moving reviewer-pane reading
into the executor, parsing Markdown headings with `awk`/`sed`, or writing verdict
files. It must not interpret findings, invent cross-restart state, ask the human
ordinary questions, preserve completed backlog entries, or create narration files
about routine work.

The only deferred design choice is a fixed multi-pane E2E layout. The E2E role,
handoff, lifecycle, candidate binding, visibility, approval boundary, and ordering
are fully specified; only its unnecessary physical subdivision is deferred.

## Open questions

There are no unresolved product or architecture choices. H7b, the exact 180-row
Claude/Codex TUI limits, and live model entitlement are empirical support gates. A
failed fixture leaves the route unsupported and triggers evidence-backed issue
triage; it does not authorize an architectural fallback.
