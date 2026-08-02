# Acceptance map

Every acceptance item the spec set lists, and where it is proven. Seven items are
deliberately marked *not mechanical*: three are judgements about meaning, and four
are rules whose only honest proof is the gate itself or a test elsewhere — in each
case claiming a test of their own would be the exact dishonesty this workflow
exists to prevent, a green gate standing in for a reading nobody did.

Reboot recovery is a third kind and is labelled separately: it is **not
automated**, because restarting the backend from inside a session it hosts cannot
be done safely, so the capability suite grades it `degraded` with instructions.

Test names below are written as prose. For the TypeScript suite that is
verbatim what `node quality/run-tests.mjs` prints. For the Python starter
profile it is the method name with underscores read as spaces —
`a gate that discovered nothing fails` is `test_a_gate_that_discovered_nothing_fails`
in `templates/python/tests/test_quality_gates.py`, which `make e2e` and
`node quality/run-tests.mjs` both run.

## §00 — Master workflow

| Acceptance item | Proven by |
|---|---|
| Crash after any transition recovers from `state.json` without a transcript | `a fresh orchestrator recovers a run from state.json alone` |
| Crash between preparing and confirming a backend operation causes no resend without reconcile | `a stalled delivery stays pending and reconciles to not_applied`, `a delivery that did land reconciles to applied, never to a resend`, `an unprovable effect pauses the run instead of guessing` |
| A mutating gate is invalid | `a gate that rewrites the content it judges is invalid, not green`; `a mutating gate is invalid` (Python) |
| Two reviews of different snapshots never produce a joint PASS | `two reviews of different snapshots never produce a joint pass` |
| An E2E fix does not restart review before the E2E loop stabilises | `an E2E fix does not pull the run back into a review round`, `once E2E is green on the new snapshot the review loop resumes` |
| The final snapshot carries four attestations: QC, Reviewer A, Reviewer B, E2E | `one snapshot with four attestations completes`, `a run walks from start to COMPLETE only with four attestations on one snapshot`, `a QC pass is recomputed from the result, not taken on the caller's word` |
| A rebase or squash of an identical tree invalidates nothing | `an amend that preserves the tree does not invalidate a single gate`, `a plan sealed for other content cannot prove completion` |
| Every gate whose result is banked runs in a fresh detached worktree | `a gate command may carry its own flags after a bare --`, `an E2E result is refused unless a worktree receipt proves it ran isolated`, `a gate that rewrites the content it judges is invalid, not green`. **Scope:** three gates are refused without a worktree receipt — `qc` and `smoke` through `assertGateIsolated`, and `e2e` through `assertE2eIsolated`. A reviewer reads a snapshot rather than running one, so no receipt is demanded of a review; the row used to say "every gate" and overstated by exactly that. The metadata guard demands none either, and correctly: `verifyMetadataCommit` reads Git objects — `listTree`, `readBlob`, `changedPaths` — so no checkout can affect what it sees, and a receipt would be decoration. An earlier rewording of this row said four and counted it in. |
| Push, remote branch, PR and tag without the user asking are forbidden | `a run that tagged or pushed its own work cannot set a candidate` — and a tag on a commit the run did not author is left alone. Implemented and tested since the first audit; the map simply had no row for it. |
| After `COMPLETE` no external run artefacts remain and project settings do | `cleanup removes the run directory but keeps project settings` |
| Cleanup stops the run's remaining worker sessions before deleting anything | `cleanup stops the run's workers before it deletes the state that names them`. The row used to cite `cleanup removes the run directory but keeps project settings` "because the stop outcomes are reported in its output" — that test calls the state-store function directly, never spawns a session and never sees a stop outcome. The behaviour was right and the proof was not there. |
| `PAUSED_MODEL_UNAVAILABLE` exits on resume **or** a newly confirmed ModelSet | `a run paused on an unavailable model can be given a new ModelSet` |
| A failed E2E scenario reaches the executor as a finding | `a derived E2E finding is retired by the gate, not closed by hand`, which records a red scenario and then proves the derived blocker exists and cannot be closed by hand. The row used to cite only `a run walks from start to COMPLETE only with four attestations on one snapshot`, a happy path that never records a failure. |

## §10 — Knowledge layer

| Acceptance item | Proven by |
|---|---|
| A human can read the whole business truth in one file | `a business anchor defined outside the business document is refused` |
| Every `§A`/`§M`/symbol has a valid nearest causal link | `an architecture anchor that cites no business anchor fails`, `a module citing business directly instead of its nearest level fails`, `a valid chain from business to architecture to module passes`; `a symbol must cite its module anchor` and `a module citing nothing is found` (Python) |
| An abort before the candidate commit leaves no planned TODO knowledge | `planned intent may not be written as durable knowledge` — a `§B-TODO-*` anchor is refused by the knowledge gate, by prefix rather than by substring, so `§B-TODOS-01` still passes. Structurally there is also no "planned knowledge" state to leak, and `cleanup removes the run directory but keeps project settings` proves the run's own artefacts go; but the rule itself is enforced by the gate named first. |
| Retiring a spec loses no requirement that touches architecture or module | Half mechanical: `a run walks from start to COMPLETE only with four attestations on one snapshot` proves the tracked spec must be retired inside the candidate window (`spec_not_retired`), so retirement is reviewed content. Whether the *requirements* survived into `§B`/`§A`/`§M` is **not mechanical** — both reviewers judge it. |
| Changing one symbol produces a proportionate, not ritual, knowledge diff | **Not mechanical**, and until now not asked either. No checker can distinguish a proportionate diff from a ritual one, so the rule can only live in the review rubric — and the rubric did not contain it. The word "proportionate" appeared nowhere in `skills/`. Lens 5 asks about *drift*, which is a different question. `skills/review-feature/SKILL.md` now asks it directly, and the honest status is: enforced by a human reading a prompt, provable by nothing. |
| A purpose-debt baseline is not permitted | **Satisfied by absence, and that is all.** `templates/python/quality/purpose_check.py` has no baseline mechanism to abuse — `grep -n baseline` in it returns nothing, unlike `code_health.py` and `import_graph.py`, which have one deliberately. So the rule holds because the feature does not exist, and nothing would catch someone adding it. Recorded here rather than left to look like a tested guarantee. |
| Out-of-scope debt is recorded in `docs/todo.md` as one short entry | **Prose only.** Preflight and the knowledge gate require `docs/todo.md` to *exist* (`preflight performs the state-tree step §00 gives it` covers the file check), and §10's ban on durable `§B-TODO`/`§A-TODO` anchors is enforced by `planned intent may not be written as durable knowledge`. Whether a finding outside this feature's scope actually got written down is asked of the executor by `skills/execute-feature/SKILL.md` and checked by nobody — a checker would have to know what was in scope. |
| A mechanical PASS does not replace semantic review of purpose and business drift | **Not mechanical**, by construction: QC is one of four attestations and cannot complete a run alone — `one snapshot with four attestations completes`. |

## §20 — Orchestration, identity and skills

| Acceptance item | Proven by |
|---|---|
| Two project paths with the same readable form get different keys | `readable path forms that collapse identically still get distinct keys` |
| Moving a project creates a new key; migration is explicit | `moving a project produces a different key`, `a project directory belonging to another canonical path blocks the run` |
| A symlinked state directory is refused | `a symlinked state directory is refused` |
| A crash at any point of a backend side effect creates no duplicate action | The ten tests whose names contain `reconcile` — four in `tests/session-protocol.test.mts` (through the CLI) and six in `tests/herdr-adapter.test.mts` (against the adapter) — plus `spawn does not create a second agent for the same operation`. The row said nine, and named `tests/cli-lifecycle.test.mts`, which contains none of them. |
| Two parallel feature branches do not block each other | `two runs of one project take their locks independently` |
| A fresh orchestrator recovers a run without a narrative handoff | `a fresh orchestrator recovers a run from state.json alone` |
| A backend capability regression stops preflight | `a backend capability regression stops preflight` — including a backend that still answers but has lost `pane split`, `agent read` or `pane close` |
| An orchestrator can register the session that owns the run | `an orchestrator can register itself the way the skill tells it to` |
| Only the herdr adapter ships, and a project cannot be configured onto one that does not exist | Refused at `project set-settings`, and by every session command (`unsupported_backend`). **Scope gap, disclosed:** §20's minimal skill set names an Omnigent adapter skill; this repository implements Herdr only, as the first backend. |
| The user confirms the external model providers for the project | **Collapsed into the ModelSet, deliberately.** A `ModelRef` names its vendor, so confirming the set is confirming the providers, and `the ModelSet leaves AWAITING_MODEL_SET only on a decision the user took` proves that confirmation is a recorded user decision rather than an orchestrator's assumption. There is no separate provider-consent artefact, and a project that wants one would have to add it. |
| The adapter builds the right arguments for the Claude, Codex and OpenCode routes | `model arguments are built per route` — all three routes plus the OpenCode-without-a-provider case. Codex is the cross-vendor reviewer's usual route and was previously exercised only as a ModelSet value, never for the argument vector handed to the backend. |
| After two fruitless rebuttal turns the orchestrator may call a fresh technical adjudicator | `the adjudicator threshold is a number the run keeps, not a memory`. §30's threshold is two and the decision is discretionary (`может`), so routing *reports* the findings that reached it in `adjudicable` and dispatches nothing. Before this, nothing counted rebuttals: the rule lived in the orchestrator skill as prose about a number that existed nowhere, so a recovered orchestrator could not follow it at all. |
| The suite exercises concurrent completions | `two turns issued together are each proved to have landed in their own session`, `a backend that hands one session's turn to another fails the concurrency check`, `a turn that leaves no trace at all is reported, not counted as concurrency` |
| The suite exercises reboot recovery | **Not automated**, and reported as such: restarting the backend server from inside a session it hosts cannot be done safely, so the check is `degraded` with instructions rather than a silent pass. |

## §30 — Review and E2E

| Acceptance item | Proven by |
|---|---|
| A reviewer timeout does not let a run pass on one review | `two reviews of different snapshots never produce a joint pass` and `one snapshot with four attestations completes` — `completionProven` reads both reviewer slots, so a missing verdict is a missing attestation and nothing else can stand in for it. The row also cited `QC is demanded before any review of a new candidate`, which is about gate ordering and has nothing to do with a timeout. **What is not mechanical:** §00's remedy — replace the session and re-run the review — is the orchestrator's, and no test drives a reviewer that never answers. |
| Reviewers get identical digest and plan, and not each other's findings | `a review that attested a superseded plan does not count` for the shared digest and plan; `a reviewer's bounded view withholds the other reviewer's findings by name` and `the bounded view is reachable from the CLI and rejects a role it does not know` for the isolation. Partly a rule rather than a wall: run state is a readable file, so `run show --as-role` removes the accident, not the possibility. |
| A finding cannot be closed by the executor | `the executor may propose a fix but never close a finding` |
| An empty plan is impossible because of `always_required` | `an empty selection is impossible because always_required must be included` |
| A catalog change after review invalidates the snapshot | `changing a catalog field of the registry does change the digest`, `changing content invalidates every attestation that described the old one`; `a metadata commit that edits the catalog is rejected` |
| Writing only `last_run` does not change the projection digest | `writing only last_run leaves the digest unchanged`, `a metadata commit writing only last_run passes the guard` |
| The E2E tester works in a fresh detached worktree | `an E2E result is refused unless a worktree receipt proves it ran isolated` |
| A plan covers the impact it declares | `a plan that ignores the impact it declared is rejected`, `an impacted tag pulls in every scenario carrying it` |
| Production needs a written contract as well as consent | `production needs a written contract, not only the user's consent` |
| A reviewer may not withdraw a blocker by re-reviewing | `a second review may not erase the blocker the first one raised` |
| E2E failures stay visible until the next run | `a derived E2E finding is retired by the gate, not closed by hand` — a derived blocker refuses `propose-fix` and `resolve-finding`, so the only thing that clears it is the next run of the gate. The row cited `closed findings are pruned and only blocking ones hold up completion`, a unit test on the pruning helper, which is about a different property. |
| One final digest has PASS from QC, A, B and E2E | `one snapshot with four attestations completes` |

## §40 — Local QC and the Python profile

The spec requires the *QC project* to own these fixtures, so they live with the
starter profile in `templates/python/tests/test_quality_gates.py`.

| Acceptance item | Proven by |
|---|---|
| A missing tool and a silent skip both FAIL | `a missing tool fails instead of skipping`, `the result records every declared gate` (Python); `a silently skipped gate fails when the manifest requires it to pass` |
| A formatter mutation makes the gate invalid | `a mutating gate is invalid` (Python); `a gate that rewrites the content it judges is invalid, not green` |
| A duplicate or dangling anchor is found | `a duplicate anchor is found`, `a dangling reference is found`, `a module anchor claimed by two files is found` (Python) |
| An undocumented private, nested or test symbol is found | `an undocumented private nested function is found`, `a dunder must state its purpose`, `test code is held to the same rule` (Python) |
| Relative and literal dynamic imports form edges | `a relative import cycle is found`, `a literal dynamic import forms an edge`, `a non literal dynamic import is reported not ignored` (Python) |
| A new cycle and an unknown boundary are blocked | `a relative import cycle is found`, `a self import is a cycle of one`, `an unknown first party boundary is blocked`, `freezing the baseline does not swallow a contract violation` (Python) |
| Threshold and baseline weakening is detected | `raising a threshold, dropping a root or adding an exemption is weakening`, `a re-frozen or newly frozen baseline entry is weakening`, `relaxing a threshold, a ratchet or a frozen baseline needs a user decision` |
| A missing manifest result never yields a false PASS | `a missing QC result is never a pass`, `a declared gate that produced no result fails the run` |
| A change to the E2E catalog after attestation is detected | `the metadata guard rejects a catalog change` (Python), `a metadata commit that edits the catalog is rejected`, `a receipt for a scenario the run never executed is refused` |
| A gate that judged nothing fails instead of passing | `a gate that discovered nothing fails` (Python) |
| A gate that rewrites an already-dirty file is caught | `a gate that rewrites an already-dirty file is invalid` (Python) |
| A `§M` cites its nearest `§A` wherever it is written | `a module anchor written as a heading must cite architecture` (Python) |
| A feature archive is found even with no anchors in it | `a feature archive outside the architecture directory is found` (Python) |
| A first-party import that resolves to nothing is blocked | `a renamed module still imported by name is blocked`, `a symbol imported from a real module is not a missing module` (Python) |

## §50 — Watchdog

| Acceptance item | Proven by |
|---|---|
| A fake clock proves poll, backoff and reset | `the loop honours a bounded tick count with a fake clock`, `backoff grows exponentially and resets on observed progress`, `backoff is capped by the configured maximum` |
| One completion event wakes the orchestrator at most once | `one settled event wakes the orchestrator at most once`, `a wake is recorded before it is sent, so a crash cannot deliver it twice`, `a wake that observably failed gives its record back` |
| A watchdog crash between observing and acting creates no duplicate worker action | `an action is dropped when the run moved on while the watchdog was deciding`, `an unprovable pending operation is surfaced, never resent` |
| A live orchestrator is never replaced | `a live orchestrator is never replaced, only woken`, `an unknown orchestrator status never produces a replacement` |
| A terminal orchestrator gets exactly one new generation | `a dead orchestrator receives exactly one replacement generation`, `a replacement orchestrator is told the generation it was given` |
| An unknown operation is never resent | `an unprovable effect is surfaced once, then backed off` |
| A productive unlimited review loop is not a stall | `a productive loop is never treated as a stall` |
| Two project keys are served independently | `two project keys are observed independently`, `a backend that cannot be observed backs one run off, not the whole loop` |
| A disabled watchdog affects nothing | `a disabled watchdog performs no ticks at all`, `a project that switched the watchdog off is skipped, and says so` |

## Bypasses

Not acceptance items from the spec set — ways this implementation could have
been made to say "verified" about something it had not verified. Each was found
by reading the code against the spec rather than by a failing test, so each one
now has a test that fails if the hole reopens. They live in
`tests/hardening.test.mts`.

| Bypass | Closed by |
|---|---|
| A policy gutted through dotted keys (`code_health.max_function_lines = 100000` under `[tool.meta_o]`) reads as unchanged | `a policy written with dotted keys is read, not skipped` |
| A QC result reporting one gate twice — once failed, once passed — is scored on the second | `a QC result that reports one gate twice is ambiguous, not a pass` |
| Four green gates complete a run that still carries an unresolved blocker | `an open blocking finding stops completion even when every gate reads passed` |
| A plan sealed against an earlier candidate satisfies the plan-bound gates | `a plan sealed for other content cannot prove completion` |
| The only exit from `LOCAL_QC` runs through review, disarming the E2E-loop guard | `an E2E fix can return to the E2E loop without passing through review` |
| A brownfield change escapes the adoption boundary by being written in `.tsx`, `.sh`, `.c` or `.sql` | `the adoption boundary covers the languages a brownfield repository is written in` |
| A smoke run and a full baseline share no check ids, so the comparison always finds nothing | `a smoke report and a full baseline share the keys the comparison needs` |
| A runs directory replaced by a symlink reads as a project with no runs | `an unreadable runs directory is reported, not read as an empty project` |
| A misspelled flag (`--nobackend`) is ignored, so the command runs with the opposite meaning | `a misspelled flag is refused instead of silently ignored` |
| A superseded orchestrator keeps writing after losing a takeover | `a superseded orchestrator generation may not write to the run` |
| A tracked spec is "retired" by renaming it out of `spec/` | `a spec that was renamed rather than retired still blocks the candidate` |
| A tracked spec introduced as a local path escapes retirement entirely | `a tracked spec introduced as a local path is still retired` |
| A reviewer gate is set to `passed` by `record-gate`, with no review behind it | `a reviewer gate cannot be passed without the review that produced it` |
| A secret quoted in a finding is written verbatim into durable state | `a secret in a finding never reaches durable state` — both halves: a value that looks like a token, and a value that looks like nothing but is bound to a name like `DB_PASSWORD`. The second is the common case for a real credential and was the half the row claimed without exercising. |
| `--attested` lets the metadata guard verify one tree and record the verdict against another | `the metadata guard may not be pointed at a commit other than the candidate` |
| A backend that hands one session's completion to another passes the concurrency check | `a backend that hands one session's turn to another fails the concurrency check` |
| A selection plan declares an impact and then ignores it | `a plan that ignores the impact it declared is rejected` |
| An E2E result is accepted with no proof the suite ran outside the developer's checkout | `an E2E result is refused unless a worktree receipt proves it ran isolated` |
| A reviewer reads the other reviewer's findings out of `run show` | `a reviewer's bounded view withholds the other reviewer's findings by name` |
| A run pinned to a model the user has lost can only be cancelled | `a run paused on an unavailable model can be given a new ModelSet` |
| A project that switched the watchdog off is watched anyway | `a project that switched the watchdog off is skipped, and says so` |
| The `qc` attestation is recorded on the caller's word alone | `a QC pass is recomputed from the result, not taken on the caller's word` |
| A second `record-review` erases the blocker the first one raised | `a second review may not erase the blocker the first one raised` |
| A metadata commit invents a `last_run` for a scenario nobody ran | `a receipt for a scenario the run never executed is refused` |
| An amend or rebase of an identical tree forces both reviews and the whole E2E set to re-run | `an amend that preserves the tree does not invalidate a single gate` |
| The only isolated-gate command cannot run a gate that takes a flag | `a gate command may carry its own flags after a bare --` |
| Following the orchestrator skill literally never registers the orchestrator | `an orchestrator can register itself the way the skill tells it to` |
| A checkout under a `build`, `dist` or `venv` path makes four Python gates attest nothing | `a gate that discovered nothing fails` (Python) |
| A formatter rewriting an already-dirty file passes the non-mutation check | `a gate that rewrites an already-dirty file is invalid` (Python) |
| `update.sh --skip-suite` runs the suite it was told to skip | `update.sh --skip-suite actually skips the suite` |
| A watchdog crash between the wake and its record delivers the prompt twice | `a wake is recorded before it is sent, so a crash cannot deliver it twice` |
| A green E2E run erases a blocker raised against the E2E work itself | `a green E2E run leaves a blocker raised against the E2E work standing` |
| The production contract is satisfied by an uncommitted file, or by any heading containing the letters | `the production contract must be committed, and must be about production` |
| A real package named `build` under a source root is never opened by the Python gates | `a package named build is judged and an output tree is not` (Python) |
| A gate receipt matched by commit oid is discarded by an amend of an identical tree | `an amend that preserves the tree does not invalidate a single gate` |
| A key-sorting serialiser reordering an untouched receipt reads as forgery | `a re-serialised receipt for a scenario nobody ran is not forgery` |
| `install.sh` reports a backend failure when run outside a Git repository | `the capability suite runs outside a Git repository` |
| A scenario the E2E gate itself flagged can never be re-run green | `a scenario the E2E gate itself flagged can be fixed and re-run green` |
| A human blocker raised under an id the E2E gate derives is overwritten by the next run | `a scenario the E2E gate itself flagged can be fixed and re-run green` (the `finding_id_reserved` half) |
| The production contract is satisfied by an example inside a fenced block, or a setext heading is refused | `the production contract must be committed, and must be about production` |
| A gate whose own receipt records a non-zero exit is recorded as passed | `a gate whose own receipt records a failure cannot be recorded as passed` |
| The adjudicator's third verdict — real, but taste — cannot be recorded | `an adjudicator can rule a finding real but not blocking` |
| §40's "adopted roots dependency-closed" is declared and never verified | `adopted roots must be dependency-closed` (Python) |
| A PEP 420 namespace package named `build` is skipped and a generated tree is judged | `a project may say which directories are output trees` (Python) |
| §50 makes the watchdog opt-in and gives no way to opt in | `install.sh delivers a runnable CLI made only of dependency-free .mjs` (the `watchdog enable` and service-unit half) |
| meta-o's own `make qc` cannot run in the detached worktree §00 requires | `meta-o's own gates run in the isolated worktree its protocol requires` |
| `E2E-QC-TEMPLATES-01` is declared and no target runs it | the Python fixtures now run inside `node quality/run-tests.mjs` and `make e2e` |
| `run pending` writes the proof it exists to go and get | `` `run pending` cannot write the proof it is supposed to go and get `` |
| A stale QC result lets a failing gate be re-run as `true` and recorded passed | `a QC pass is recomputed from the result, not taken on the caller's word` (the `startedAt` half) |
| A blocker filed into a slot the completion check never reads | `a derived E2E finding is retired by the gate, not closed by hand` (the `invalid_reviewer` half) |
| A derived E2E finding closed by hand while its scenario is still red | `a derived E2E finding is retired by the gate, not closed by hand` |
| The production contract satisfied by a fenced example, an HTML comment or front matter | `the production contract is read as Markdown, not as a substring search` |
| A backend the last full suite found broken is driven anyway | `a backend the last full suite found broken may not be driven` |
| A worker cannot be resumed after a backend restart, only replaced | `resume confirms a live worker and refuses to pretend about a dead one` |
| A malformed `[tool.meta_o.*]` value silently shrinks discovery | `a malformed config stops the gate instead of shrinking it` (Python) |
| The closure check declines to run and reports `ok` | `a closure check that cannot run says so` (Python) |
| `import a.b` reaches an uncertified package body through a certified submodule | `an adopted module may not reach an uncertified package body` (Python) |
| `watchdog enable` writes a switch and the loop reads a different one | `` `watchdog enable` reaches the switch the watchdog loop actually reads `` |
| §50's hybrid classifier is optional and nothing proves it stays non-authoritative | `a hybrid local model may only break a tie, never overrule the evidence` |
| §20's `optional-handoff.md` is written and never read by anybody | `the optional handoff is read back, and only by the role it belongs to` |
| `~/.meta-o/config.json` is named by an error message and creatable only by hand | `the machine-wide defaults the error message names can be written` |
| meta-o's own `make qc` misses a mutation of a file that was already dirty | *not mechanical* — `a gate that rewrites an already-dirty file is invalid` (Python) proves the rule; `quality/run-qc.mjs` now computes the same listing-plus-bytes fingerprint, and a test would have to run meta-o's whole gate set twice to observe it |
| `quality/lint.mjs` reports success over a set of files it never discovered | *not mechanical* — the gate proves itself: it fails when any declared root yields no files, so an empty discovery is a red gate rather than a green one, and no separate test can assert that without disabling the check it is asserting |
| §40's `independent` contract is declared, unusable in one form and silently ignored in the other | `the three declared structural contracts are enforced` (Python) |
| A module placed directly under `src/` is outside the cycle, layer and size gates | *not mechanical* — `quality/import-graph.mjs` and `quality/code-health.mjs` now list paths instead of globbing, and `a gate that discovered nothing fails` (Python) proves the rule; both gates resolve their root from their own location, so a test would have to relocate the repository to observe it |
| A JS gate reports `ok` having discovered nothing to judge | `the knowledge gate fails when it discovers nothing to judge`; the same floor is in `purpose-check`, `code-health`, `import-graph` and `format-check`, each of which fails its own root |
| §10's ban on durable `§B-TODO`/`§A-TODO` is stated in prose and checked nowhere | `planned intent may not be written as durable knowledge`; `planned intent may not be written as durable knowledge` (Python) |
| A review verdict or an E2E result is attributed to a worker the run never dispatched | `a result may only be attributed to a worker this run dispatched` |
| Heavy E2E is prescribed before either reviewer has passed | `the heavy E2E loop does not open before both reviews have passed` |
| §30's `selectedScenarioIds` and `selectionRationale` are demanded by the skill and read by nobody | `an E2E result must state the set it ran, and it must be the sealed one` |
| §00 preflight step 2 — ownership, mode and symlinks under `~/.meta-o` — is not performed by `preflight` | `preflight performs the state-tree step §00 gives it` |
| §20's URL-spec limits (HTTPS, ≤3 redirects, ≤10 MiB decompressed) are implemented and proven by nothing | `a spec URL that is not https is refused before any socket is opened`, `a spec URL is followed for three redirects and no further`, `a compressed spec is bounded by its decompressed size, not its transfer size` |
| The watchdog log promises it records no model text and quotes adapter errors verbatim | *not mechanical* — `redactDeep` is applied to every entry on the one code path that writes the log; `a secret in a finding never reaches durable state` proves the redaction itself |
| §20's smoke could only see a regression the adapter's own source caused | `a backend capability regression stops preflight` (the three lost-verb cases) |
| `agent wait` disappearing from the backend reads as a successful wait | `a backend that no longer has \`agent wait\` says so instead of polling` |
| §00 preflight step 4 — show the ModelSet and ask "these?" — is unfalsifiable | `the ModelSet leaves AWAITING_MODEL_SET only on a decision the user took` |
| `run start --backend <unimplemented>` reports that backend and uses herdr | `a backend nothing implements is refused at start, not printed and dropped` |
| §20's `runs/<id>/findings/` is named in the layout and never created | `§20's findings directory is a view of the open records, not an archive` |
| `meta-o e2e result` pre-flights a payload `run record-e2e` then refuses | `an E2E result must state the set it ran, and it must be the sealed one` (the dry-run parity cases) |
| §00 preflight steps 4, 5 and 7's *asking* is prompt-level | *not mechanical* — step 4 is now evidenced by a recorded user decision, and step 5's answers are `--reuse-scan`/`--handoff` flags whose consent is enforced downstream (`a handoff is refused unless the run started with consent`, `a solution scan the user did not ask for is refused`); the questions themselves live in the orchestrator skill, because a CLI cannot ask them |
| The watchdog spawns a replacement orchestrator with no write-ahead record, so a crash orphans the agent | `the watchdog writes its replacement spawn down before it makes one`, `the watchdog reconciles an interrupted operation instead of only reporting it` |
| Both reviewers pass a snapshot `make qc` never ran on, and QC is recorded afterwards | `a reviewer's PASS is refused until QC and smoke have passed on the snapshot` |
| The watchdog's own log and lock skip the ownership, mode and symlink checks every other state path gets | `the watchdog's own log and lock get the checks every other state path gets` |
| An unreadable `META_O_ORCHESTRATOR_GENERATION` silently disables the fence for that command | `a generation claim that cannot be read is refused, not ignored`. The fence is opt-in by construction: a writer that sets nothing makes no claim and is not checked, which is what lets a human run a command by hand. |
| A tracked spec locator that is a symlink out of the repository passes the containment check | `a tracked spec that is a symlink out of the repository is refused` |
| Preflight and the knowledge gate disagree about which files are the knowledge layer | `preflight and the knowledge gate read the same tree` |
| An anchor inside a nested fenced block vanishes from the index and inverts the rest of the document | `a fence inside a fence does not swallow the document` |
| meta-o's own four attestations rest on four distinct executions | **Not true of meta-o itself, and worth saying here.** `make e2e` is `node quality/run-tests.mjs`, which is also the `tests` gate inside `make qc` (`Makefile:37`, `Makefile:44`). For this repository the E2E attestation and the QC attestation therefore run the same command, so the four attestations rest on three distinct executions. That is a property of meta-o's own contract, not of the workflow: a project whose E2E suite is genuinely separate gets four. The Makefile comment said so; nothing user-facing did. |
| A gate receipt is the one state-tree write that skips safe-fs | `a gate receipt cannot be diverted out of the state tree` |
| An own `__proto__` key hides a field from every validator that enumerates own keys | `a __proto__ key cannot smuggle a knowledge plan past validation` |
| `run cleanup` cannot stop an agent that only the write-ahead probe names | `run cleanup stops what only the write-ahead record names` |
| An interrupted spawn adopted by reconcile is mute, and freezes recovery for the run | `an adopted orchestrator is finished, not left mute` |
| A spawn interrupted between the pane and the agent wedges the run for good | `a spawn whose start race is over reconciles instead of waiting forever` |
| A spawn interrupted before the pane id is recorded leaks that pane | **Not closed, and disclosed.** `not_applied` is the true answer about the operation — no agent was started, so no retry can duplicate one — but an empty pane no record names survives, and repeated crashes at that exact point accumulate them. Closing it needs pane enumeration or a caller-supplied pane name, and Herdr offers neither; the adapter treats a pane id as opaque rather than guessing at its format. `docs/knowledge/architecture/backend.md` states the window and what *is* reachable: a pane the record names, and a live agent the record names. |
| Every backend `spawn/send/wait/stop` is written ahead and reconciled | True of every effect that advances a run. **Two exceptions, and they are exceptions:** the watchdog's wake prompt and its uncertainty prompt are sent without a `PendingOperation`. They cannot have one. A wake is decided *precisely* when an operation may still be in flight — the `waiting` branch reads that operation's own `deadlineAt` to judge the run overdue — and an uncertainty prompt is by definition sent while one is `uncertain`. One pending operation at a time is what makes reconciliation decidable, so recording a second would trade a possible duplicate prompt for a state nothing can resolve. What makes the exception safe is the payload: both messages say "read your own state and continue", so delivering one twice cannot corrupt a run, unlike an instruction or a charter. Their dedupe is `watchdog-memory.json`, written before the call and taken back only on an observable refusal — see the next row. |
| The watchdog's dedupe fails in the safe direction when it is lost | `bookkeeping the watchdog cannot read is not read as nothing sent`, `a lost record suppresses the capability regression prompt too`. An unreadable memory file used to answer `{}`, which says "no wake has been delivered to any run" — the one answer that causes an effect, and for every live run at once. It is now distinguished from "no record for this run", and every run's slot is seeded as though the notifications for the current state had already gone out. **The verdict is taken once per tick over the whole file, and that is the load-bearing part:** the seed's own write repairs the file, so asking per key protected whichever run came first and woke all the others. The seed covers all three dedupes — the two keyed by state version, and `surfacedRegression`, which is keyed by the regression's own text and so can only be seeded with the one that is current. The spawn guard is deliberately not seeded: a spawn has a write-ahead record in durable run state and does not depend on this file. |
| §30's adjudicator threshold is reachable through the loop it is written for | `the adjudicator threshold survives the rebuttal it is counting`. `fixAttempts` used to be rebuilt from the payload whenever a reviewer restated a finding — and restating is the only way a reviewer can reject a fix, so the single action that makes a turn a rebuttal was the action that reset the count. `restateRecord` carries it. The previous test proposed two fixes in a row: the one sequence in which the counter survived, and the only one containing no rebuttal. |
| §20 forbids a daemon and §50 specifies one | *not mechanical* — a contradiction between two specs, not a defect in either implementation; `README.md`'s **Known limits** records which reading meta-o took and how to opt out of it |
