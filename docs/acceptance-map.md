# Acceptance map

Every acceptance item the spec set lists, and where it is proven. Three items
are deliberately marked *not mechanical*: they are judgements about meaning, and
claiming a test for them would be the exact dishonesty this workflow exists to
prevent — a green gate standing in for a reading nobody did.

Test names are the strings the runners print: `node quality/run-tests.mjs` for
the TypeScript suite, `python3 templates/python/tests/test_quality_gates.py` for
the Python starter profile's own fixtures.

## §00 — Master workflow

| Acceptance item | Proven by |
|---|---|
| Crash after any transition recovers from `state.json` without a transcript | `a fresh orchestrator recovers a run from state.json alone` |
| Crash between preparing and confirming a backend operation causes no resend without reconcile | `a stalled delivery stays pending and reconciles to not_applied`, `a delivery that did land reconciles to applied, never to a resend`, `an unprovable effect pauses the run instead of guessing` |
| A mutating gate is invalid | `a gate that rewrites the content it judges is invalid, not green`; `a mutating gate is invalid` (Python) |
| Two reviews of different snapshots never produce a joint PASS | `two reviews of different snapshots never produce a joint pass` |
| An E2E fix does not restart review before the E2E loop stabilises | `an E2E fix does not pull the run back into a review round`, `once E2E is green on the new snapshot the review loop resumes` |
| The final snapshot carries four attestations: QC, Reviewer A, Reviewer B, E2E | `one snapshot with four attestations completes`, `a run walks from start to COMPLETE only with four attestations on one snapshot` |
| After `COMPLETE` no external run artefacts remain and project settings do | `cleanup removes the run directory but keeps project settings` |

## §10 — Knowledge layer

| Acceptance item | Proven by |
|---|---|
| A human can read the whole business truth in one file | `a business anchor defined outside the business document is refused` |
| Every `§A`/`§M`/symbol has a valid nearest causal link | `an architecture anchor that cites no business anchor fails`, `a module citing business directly instead of its nearest level fails`, `a valid chain from business to architecture to module passes`; `a symbol must cite its module anchor` and `a module citing nothing is found` (Python) |
| An abort before the candidate commit leaves no planned TODO knowledge | Structural: knowledge is written only inside the candidate window, and nothing in this implementation can record "planned" knowledge — there is no such state to leak. `cleanup removes the run directory but keeps project settings` proves the run's own artefacts go. |
| Retiring a spec loses no requirement that touches architecture or module | Half mechanical: `a run walks from start to COMPLETE only with four attestations on one snapshot` proves the tracked spec must be retired inside the candidate window (`spec_not_retired`), so retirement is reviewed content. Whether the *requirements* survived into `§B`/`§A`/`§M` is **not mechanical** — both reviewers judge it. |
| Changing one symbol produces a proportionate, not ritual, knowledge diff | **Not mechanical.** No checker can distinguish a proportionate diff from a ritual one; the reviewers' rubric asks for it directly. |
| A mechanical PASS does not replace semantic review of purpose and business drift | **Not mechanical**, by construction: QC is one of four attestations and cannot complete a run alone — `one snapshot with four attestations completes`. |

## §20 — Orchestration, identity and skills

| Acceptance item | Proven by |
|---|---|
| Two project paths with the same readable form get different keys | `readable path forms that collapse identically still get distinct keys` |
| Moving a project creates a new key; migration is explicit | `moving a project produces a different key`, `a project directory belonging to another canonical path blocks the run` |
| A symlinked state directory is refused | `a symlinked state directory is refused` |
| A crash at any point of a backend side effect creates no duplicate action | The eight `reconcile …` tests, plus `spawn does not create a second agent for the same operation` |
| Two parallel feature branches do not block each other | `two runs of one project take their locks independently` |
| A fresh orchestrator recovers a run without a narrative handoff | `a fresh orchestrator recovers a run from state.json alone` |
| A backend capability regression stops preflight | `a backend capability regression stops preflight` |

## §30 — Review and E2E

| Acceptance item | Proven by |
|---|---|
| A reviewer timeout does not let a run pass on one review | `one snapshot with four attestations completes` (both reviewer slots are required), `QC is demanded before any review of a new candidate` |
| Reviewers get identical digest and plan, and not each other's findings | Mechanically: `a review that attested a superseded plan does not count`. The isolation of findings is a dispatch rule the orchestrator skill states and the CLI never violates — nothing writes one reviewer's findings into the other's context. |
| A finding cannot be closed by the executor | `the executor may propose a fix but never close a finding` |
| An empty plan is impossible because of `always_required` | `an empty selection is impossible because always_required must be included` |
| A catalog change after review invalidates the snapshot | `changing a catalog field of the registry does change the digest`, `changing content invalidates every attestation that described the old one`; `a metadata commit that edits the catalog is rejected` |
| Writing only `last_run` does not change the projection digest | `writing only last_run leaves the digest unchanged`, `a metadata commit writing only last_run passes the guard` |
| E2E failures stay visible until the next run | `closed findings are pruned and only blocking ones hold up completion`, `an E2E result that skips a selected scenario does not pass` |
| One final digest has PASS from QC, A, B and E2E | `one snapshot with four attestations completes` |

## §40 — Local QC and the Python profile

The spec requires the *QC project* to own these fixtures, so they live with the
starter profile in `templates/python/tests/test_quality_gates.py`.

| Acceptance item | Proven by |
|---|---|
| A missing tool and a silent skip both FAIL | `a missing tool fails instead of skipping`, `the result records every declared gate` (Python); `a silently skipped gate fails when the manifest requires it to pass` |
| A formatter mutation makes the gate invalid | `a mutating gate is invalid` (Python); `a gate that rewrites the content it judges is invalid, not green` |
| A duplicate or dangling anchor is found | `a duplicate anchor is found`, `a dangling reference is found`, `a module anchor claimed by two files is found` (Python) |
| An undocumented private, nested or test symbol is found | `an undocumented private nested function is found`, `a dunder must state its purpose` (Python) |
| Relative and literal dynamic imports form edges | `a relative import cycle is found`, `a literal dynamic import forms an edge`, `a non literal dynamic import is reported not ignored` (Python) |
| A new cycle and an unknown boundary are blocked | `a relative import cycle is found` (Python), plus the import-graph gate's `self-import` and `unknown-boundary` rules |
| Threshold and baseline weakening is detected | `raising a threshold, dropping a root or adding an exemption is weakening`, `a re-frozen or newly frozen baseline entry is weakening`, `relaxing a threshold, a ratchet or a frozen baseline needs a user decision` |
| A missing manifest result never yields a false PASS | `a missing QC result is never a pass`, `a declared gate that produced no result fails the run` |
| A change to the E2E catalog after attestation is detected | `the metadata guard rejects a catalog change` (Python), `a metadata commit that edits the catalog is rejected` |

## §50 — Watchdog

| Acceptance item | Proven by |
|---|---|
| A fake clock proves poll, backoff and reset | `the loop honours a bounded tick count with a fake clock`, `backoff grows exponentially and resets on observed progress`, `backoff is capped by the configured maximum` |
| One completion event wakes the orchestrator at most once | `one settled event wakes the orchestrator at most once` |
| A watchdog crash between observing and acting creates no duplicate worker action | `an action is dropped when the run moved on while the watchdog was deciding`, `an unprovable pending operation is surfaced, never resent` |
| A live orchestrator is never replaced | `a live orchestrator is never replaced, only woken`, `an unknown orchestrator status never produces a replacement` |
| A terminal orchestrator gets exactly one new generation | `a dead orchestrator receives exactly one replacement generation` |
| An unknown operation is never resent | `an unprovable effect is surfaced once, then backed off` |
| A productive unlimited review loop is not a stall | `a productive loop is never treated as a stall` |
| Two project keys are served independently | `two project keys are observed independently`, `a backend that cannot be observed backs one run off, not the whole loop` |
| A disabled watchdog affects nothing | `a disabled watchdog performs no ticks at all` |
