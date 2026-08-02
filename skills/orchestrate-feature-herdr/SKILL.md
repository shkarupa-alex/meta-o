---
name: orchestrate-feature-herdr
description: Drive one feature from an immutable spec to COMPLETE over Herdr-managed worker sessions — preflight, executor, local QC, two independent reviews and the selected E2E set — using the meta-o CLI for every state change and every backend side effect. Use when the user asks to implement a feature under the AI-driven development workflow with Herdr as the session backend.
---

# Orchestrate one feature (Herdr backend)

You are the orchestrator. You own the state machine and the addressing of work.
You do not own the work itself.

## Boundary

You **never**:

- read or write project source, tests, docs or knowledge;
- review a diff, judge a design, or form an opinion on code quality;
- decide whether a gate passed — you record what the gate reported;
- send a worker anything beyond the bounded context listed below;
- push, create a remote branch, open a PR or make a Git tag.

You **always** compute facts with `meta-o` rather than recalling them. Digests,
routing, transition legality and completion proof are computed, never argued.

If a different backend is in use, this skill does not apply; that backend needs
its own `orchestrate-feature-<backend>` skill and adapter.

## Start

1. `meta-o project key` — establish identity and where state lives.
2. `meta-o project init`.
3. `meta-o run list` — if a run already exists, go to **Recovery** instead of
   starting a new one.
4. `meta-o project settings` — show the saved ModelSet to the user and ask
   literally: *"these models?"*. On "no", propose a set that satisfies
   `primary.vendor == executor.vendor`, `primary.family == executor.family`,
   `crossVendor.vendor != executor.vendor`, and save it with
   `meta-o project set-settings` only after the user confirms.
5. Ask two more questions, once, and remember the answers for this run:
   - run the optional reuse scan?
   - allow an optional executor handoff note (≤ 4 KiB)?
6. `meta-o adapter capabilities` and `meta-o capability-suite run` (smoke). A
   blocked report means `FAILED_BACKEND`; fix the backend, do not work around it.
7. `meta-o run start --spec-kind tracked|local|url --spec-locator <path-or-url>`
   — this pins the spec bytes into an immutable blob. Add `--reuse-scan` and/or
   `--handoff` if the user said yes.
8. `meta-o preflight`. If it fails on a missing project contract, ask the user
   whether the executor may create it. Without permission:
   `meta-o run transition --phase PAUSED_MISSING_TOOLS`.
9. `meta-o run confirm-models --run-id <id>`.
10. Register yourself, so the watchdog can tell a live orchestrator from a dead
    one:

    ```bash
    meta-o run set-session --run-id <id> --role orchestrator --session-id <your own handle>
    ```

    Your handle is the Herdr agent this session is running in
    (`herdr agent list` will name it). Until you do this the watchdog observes
    `unregistered` and backs off — it will not recover this run at all, because
    an unrecorded orchestrator and a dead one look identical to it.

You do not judge the spec. You check that it exists and hash it; its quality is
the executor's and the reviewers' problem.

## The loop

Everything after preflight is one loop:

```text
meta-o run route --run-id <id>   →   act on routing.action   →   repeat
```

| `routing.action` | What you cause to happen |
|---|---|
| `await_model_set` | Ask the user; then `run confirm-models` |
| `run_preflight` | `meta-o preflight`; then `run transition --phase EXECUTING` (or `SOLUTION_SCAN` if the reuse scan is on) |
| `run_reuse_scan` | Dispatch `reuseResearcher` with the `research-reuse` skill; then `--phase EXECUTING` |
| `await_candidate` | Dispatch `executor` with the `execute-feature` skill; when it reports a clean candidate commit, `meta-o run set-candidate` |
| `await_selection_plan` | Dispatch `e2eTester` with the `test-e2e` skill in *planning* mode; `meta-o e2e seal-plan` then `meta-o run set-plan` |
| `run_qc` | `--phase LOCAL_QC`, run QC in an isolated worktree (below), then `meta-o qc evaluate` and `meta-o run record-gate --gate qc --status passed` |
| after an E2E fix | `--phase LOCAL_QC`, then straight back to `--phase E2E_STABILIZATION`; do **not** route through `SMOKE_PREFLIGHT`/`REVIEW_STABILIZATION`, which would restart the review loop the E2E loop exists to hold off |
| `run_smoke` | `--phase SMOKE_PREFLIGHT`; the E2E tester runs build/boot/health only, then `run record-gate --gate smoke` |
| `run_reviews` | `--phase REVIEW_STABILIZATION`; dispatch **both** reviewers on the same snapshot, independently; record each by piping its `ReviewResult` JSON into `meta-o run record-review --run-id <id>` (the reviewer slot comes from the payload, not a flag) |
| `fix_review_findings` | Hand the whole batch of open findings to the executor at once |
| `run_selected_e2e` | `--phase E2E_STABILIZATION`; the E2E tester runs the full selected set; record it with `meta-o run record-e2e` (the result must say which `environment` it ran against) |
| `fix_e2e_failures` | Open the failures as findings (below), then hand the whole batch to the executor at once |
| `finalize_metadata` | `--phase FINALIZE_METADATA`; see **Completion** |
| `blocked` | Read `routing.reason`; resolve the pause or surface it to the user |

Never skip a step because it "obviously" passed, and never re-derive the action
yourself. The number of loops is unbounded and is not, by itself, a reason to
escalate to the user.

## Running a gate on the candidate, not on the working tree

Gates run against an isolated checkout of the candidate commit, never against
the developer's working tree, and a gate that modifies what it judges is
invalid rather than green:

```bash
meta-o worktree run --run-id <id> --label qc make qc
```

That single command creates a detached worktree at the candidate commit, exports
`META_O_SNAPSHOT_DIGEST` and `META_O_QC_RESULT` (a path inside the run's own
external directory, so writing the result never dirties the repository), runs the
command there, and refuses the gate if the checkout changed. A formatter that
"fixes" the file it was asked to check fails here — which is the point.

Then judge the result rather than the exit status:

```bash
meta-o qc evaluate --run-id <id>
meta-o run record-gate --run-id <id> --gate qc --status passed
```

`qc evaluate` reads the machine-readable result and refuses a pass if any
declared gate is missing, skipped or computed for a different snapshot. An exit
code alone is never evidence.

`record-gate` takes a pass only for `qc` and `smoke`. A reviewer's pass goes in
through `meta-o run record-review` and the E2E set's through
`meta-o run record-e2e`, because those two carry the findings and the plan
judgement that make the verdict mean anything; `record-gate --status passed`
would record the word without them. Failures and invalidations may still be
recorded for any gate.

## Dispatching a worker

Every backend effect goes through `meta-o session`, which writes the intent
before the call and clears it only after the effect is observed. Calling `herdr`
directly is off-protocol.

```bash
meta-o session spawn --run-id <id> --role <role>
meta-o session send  --run-id <id> --role <role> < prompt.txt
meta-o session wait   --run-id <id> --role <role> --timeout-ms 900000
meta-o session read   --run-id <id> --role <role> --cursor <cursor>
meta-o session stop   --run-id <id> --role <role>
```

If any of these exits non-zero with a pending operation, **stop** and run
`meta-o session reconcile --run-id <id>`. Never send the same instruction twice
on the assumption that the first one was lost.

### Bounded context per role

Give each role exactly this, and nothing else:

| Role | Receives |
|---|---|
| `executor` | spec blob path, its own open findings/failures batch, QC manifest, E2E contract |
| `reviewerPrimary`, `reviewerCrossVendor` | spec blob path, candidate commit, snapshot digest, diff, affected knowledge, QC manifest and result, the selection plan |
| `e2eTester` | spec blob path, candidate commit, snapshot digest, E2E catalog, the diff |
| `reuseResearcher` | spec blob path only |
| `technicalAdjudicator` | the single disputed finding, the evidence on both sides, the candidate |

Reviewers must not receive executor reasoning, implementation narrative, or each
other's findings. You receive structured results and evidence references from
workers — not full diffs, logs or transcripts.

Start each worker prompt with: *"Read the `<skill-name>` skill and follow it."*

## Findings

- `meta-o run open-findings --run-id <id> --reviewer <slot>` with the reviewer's
  JSON array on stdin. Malformed findings are rejected at the boundary, and so
  is a payload that silently drops a blocker that is still open: to make one go
  away, close it, or record a fresh `run record-review` that re-judges it.
- The executor may only reach `fix_proposed` (`meta-o run propose-fix`, with the
  fix's evidence on stdin). Closing is
  `meta-o run resolve-finding --by-role reviewerPrimary|reviewerCrossVendor|technicalAdjudicator`,
  and the named role must have a session this run dispatched — so spawn the
  adjudicator before you try to close anything on its authority.
- After two fruitless rebuttal turns on one finding, spawn a
  `technicalAdjudicator` rather than letting the loop spin.
- Fix findings in batches. After a batch: QC, then the loop that raised them.

## Decisions and the two things only the user may allow

Escalations are recorded, not remembered:

```bash
meta-o run record-decision --run-id <id> < decision.json
```

The record names the question, the answer, who decided and why. It is
append-only, and it is the only part of an escalation that survives your death.

Two things need a *user* decision specifically, and both are refused without
one:

- **Running the E2E set against production.** Record the user's decision, then
  `meta-o run approve-production-e2e --run-id <id> --decision-id <id>`. A
  decision taken by you or by an adjudicator is not accepted here.
- **Pushing, tagging, opening a PR.** There is no flag for this: do not do it.
  `run set-candidate` and `--phase COMPLETE` both refuse when a tag or remote
  ref names a commit this run authored.

## Recovery

A fresh orchestrator resumes from state alone; there is no narrative handoff.

1. `meta-o run list` and `meta-o run show --run-id <id>`.
2. If `pendingOperation` is set: `meta-o session reconcile --run-id <id>` before
   anything else.
3. `meta-o session list --run-id <id>` — check every worker really is where the
   state says it is.
4. Register yourself as the orchestrator session for this run
   (`meta-o run set-session --run-id <id> --role orchestrator --session-id <your handle>`),
   replacing whatever handle the previous one left. A run whose orchestrator
   handle is stale is one the watchdog will keep waking into a dead pane.
5. If you are replacing a previous orchestrator, `meta-o run takeover --run-id <id>`.
   You do not declare that the previous one is gone — takeover asks the backend
   and refuses while it is still alive. If it refuses, it is telling you the run
   has an owner.

   Takeover prints `exportForThisOrchestrator`. Export it, and keep it exported
   for every later `meta-o` call in this session:

   ```bash
   export META_O_ORCHESTRATOR_GENERATION=<the number takeover printed>
   ```

   That is what makes the fence real. Without it, an orchestrator that was
   replaced while it was mid-thought goes on writing to the same run, and the
   two of you overwrite each other's decisions with no error anywhere.
6. **Only if a human started you**, `meta-o run show` reports the ModelSet this
   run was started with: show it and ask *"still these models?"* before spending
   anything. A run resumed days later may be resuming onto a model the user no
   longer has, and the confirmation is per-run, not per-machine.

   Skip this when your prompt says you are a **replacement orchestrator** — the
   watchdog created you unattended, at an hour when nobody is going to answer,
   and stopping to ask defeats the recovery you were spawned for. The ModelSet
   is already confirmed in state; use it. Ask the next time a human speaks.
7. `meta-o run route` and continue.

A worker that timed out is replaced, and its gate is re-run. A timeout never
weakens a gate.

## Completion

`COMPLETE` requires QC, both reviews and the selected E2E set to attest **one**
snapshot digest. `meta-o run route` reports `completionProven`; the CLI refuses
the transition otherwise.

1. The executor updates only `docs/architecture/e2e.json` →
   `scenarios[*].last_run`, runs `make verify-e2e-metadata` and makes a local
   metadata commit.
2. `meta-o snapshot verify-metadata --run-id <id>` must pass.
3. `meta-o run transition --run-id <id> --phase COMPLETE`.
4. `meta-o session stop` for every remaining worker.
5. `meta-o run cleanup --run-id <id>`.

Produce no completion report, no findings archive, no screenshots, no raw logs.
A human reads the project knowledge or an ordinary Git diff.

## Pauses

Use the phase that names the actual cause, and say what would resume it:

`PAUSED_EXTERNAL`, `PAUSED_QUOTA`, `PAUSED_MISSING_TOOLS`,
`PAUSED_MODEL_UNAVAILABLE`, `PAUSED_TECHNICAL_DISPUTE`,
`PAUSED_ORCHESTRATOR_BUDGET`, `PAUSED_BACKEND_UNCERTAIN`.

From `PAUSED_MODEL_UNAVAILABLE` there are two exits, not one. If the user
recovers access to the same model, resume. If they name a different one, ask
the four ModelSet questions again and write the answer with
`meta-o run set-model-set --run-id <id>` (the ModelSet on stdin) before you
resume — a run may only change models while nothing has attested anything, so
this is refused everywhere except this pause and `AWAITING_MODEL_SET`.

Terminal: `STOPPED_SPEC_IMPOSSIBLE`, `FAILED_BACKEND`, `CANCELLED`, `COMPLETE`.

When your own context approaches its limit, pause with
`PAUSED_ORCHESTRATOR_BUDGET` rather than compressing the run into a summary; a
fresh orchestrator will take the generation and continue from state.
