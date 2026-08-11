# End-to-end verification

`make mo-qc` is the deterministic product gate. `make mo-e2e` deliberately runs no agentic
scenario: it prints this document's entry point and exits 2. A live actor must name one full
post-cutover candidate SHA and record per-scenario evidence.

Historical inline/headless runs do not prove the current Herdr route. The current route
supports only visible ordinary interactive actors started through `herdr agent start`.

## Evidence contract

Every live result records:

- the unchanged full candidate SHA;
- backend, provider, provider version, Herdr/Omnigent version, OS, and exact surface support key;
- the scenario ID and exact public commands or actor prompts used;
- observed public lifecycle, pane, header, and Git metadata facts;
- cleanup performed, including cleanup after failure;
- `PASS`, `FAIL`, or `UNKNOWN`, with no partial pass.

`PASS` is valid only when the complete expected result can be read and the final `HEAD` still
equals the named candidate with a clean worktree. Missing, truncated, ambiguous, stale, or
other-SHA evidence is `UNKNOWN`.

## Deterministic scenarios

These scenarios run under `make mo-qc`. They do not substitute for live provider rendering,
native lifecycle, vendor diversity, or absence of tracked reads in a real actor run.

| Scenario          | Required behavior                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root contract     | `AGENTS.md` and `CLAUDE.md` are byte-identical and use the self-contained-helper contract.                                                                  |
| Built tree        | `skills/` exactly matches the build from `src/skills/`, `shared/`, the model bundle, and mapped licences.                                                   |
| Setup contract    | `mo-setup` installs the exact version-control and non-mutating-reviewer-check rules.                                                                        |
| Model bundle      | Pinned SDK/esbuild versions, size ceiling, metafile roots, notices, no externals, no runtime `node_modules`.                                                |
| Catalogue         | `catalog_unknown`, `model_missing`, and `launch_failed` remain distinct; history never becomes catalogue.                                                   |
| Header protocols  | Executor, review, adjudication, E2E, E2E approval-request, human-answer, and operational-approval grammar, field order, matrices, IDs, and unknown classes. |
| Review accounting | Consecutive parts, cumulative open IDs, complete-origin-open RESPONSE, total origin outcomes, aggregate adjudication, and forced dispute.                   |
| Candidate gates   | Full object IDs, branch grammar, clean tree, same-SHA gates, commit invalidation, and missing `develop`.                                                    |
| Relay             | Exact framing, marker-last human returns, aggregate peer outcomes, requester-actor approval binding, and body-silent failures.                              |
| Portable argv     | Combined 130,048-byte argument and bounded adjudication subset remain below supported limits.                                                               |
| Prompt ambiguity  | A changed signal is awaited; unchanged or contradictory evidence never causes a blind retry.                                                                |
| Topology          | Exact executor/review commands, structured `root_pane`, collision handling, and partial failure.                                                            |
| Lifecycle         | One waiter, direct wait arms, 10-second quiet period, bounded loss/retry, and no-progress key.                                                              |
| Extraction        | Golden Claude/Codex boundaries, extraction ladder, duplicate/stale/missing boundary rejection.                                                              |
| Scratch           | `0700` directory, `0600` files, content-free prefix, controlled cleanup, and no cross-run adoption.                                                         |
| Posture           | Fixed fake PATH/shell matrix and the exact consumer contract; live posture remains a separate fixture.                                                      |
| Documentation     | Canonical glossary, verbatim intent consistency, open-only backlog, exact acceptance mapping, no unsolicited docs.                                          |
| Cutover           | Shipped Herdr files contain no inline/headless actor fallback, private transcript, or verdict-file path.                                                    |

## Preimplementation Herdr probes

Run P1-P8 from `docs/phase-0-fixtures.md` before treating the Herdr actor surface as
implementable. They use a throwaway repository and prove only installed external capabilities:

1. two provider CLIs launch visibly through `agent start`;
2. tab creation returns a structured root pane;
3. right split, rename, and metadata surfaces work;
4. prompt submission supplies Enter and observable lifecycle change;
5. non-submitting direct wait returns the required states;
6. the rendered retrieval surface reaches the measured extraction envelope;
7. native goal settlement has the required quiet behavior;
8. the maximum portable relay argument launches on every supported OS.

This session has no `HERDR_ENV=1`; therefore none of P1-P8 has been executed for this change.

## Post-cutover Herdr scenarios

Run H7b and H13-H37 only after deterministic QC is green and the candidate already contains
removal of the old inline/headless path.

| Group                  | Scenario IDs | What the group proves                                                                                                                         |
| ---------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Visible actors         | H13-H15      | Exact topology, launch posture, model activation, warm panes, and partial failure.                                                            |
| Goals and retrieval    | H7b, H16-H19 | Exact fresh-executor capsule, quiet goal settlement, final-marker inbound isolation, structural failure classification, and multipart limits. |
| Independent review     | H20-H25      | Sequential barrier, conditional pair release, total multi-ID outcomes, byte identity, and blockers.                                           |
| Candidate lifecycle    | H26-H29      | Same-SHA completion, commit invalidation, restart, and model fallback.                                                                        |
| Firewall and attention | H30-H31      | Repository-changing intent/new-SHA routing, visible exact-scenario candidate-stable operational approval, and tracked-read canary.            |
| Transport lifetime     | H32          | Shared-artifact and aggregate-outcome refcounts, ambiguity, controlled cleanup, and lost-scratch recovery.                                    |
| Diversity and waits    | H33-H35      | Actual vendors, direct waits, retry/no-progress bounds, and non-gating badges.                                                                |
| Failure edges          | H36-H37      | Missing `develop` and total existing-peer adjudication.                                                                                       |

The detailed expected observation and current status for every ID live in
`docs/phase-0-fixtures.md`. No row is currently PASS.

## Omnigent scenarios

Run a supported native Omnigent route against the same candidate contract without copying
Herdr evidence or mechanics.

| Scenario         | Required behavior                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| OM1 firewall     | After activation only native process/lifecycle facts, validated headers, and narrow Git metadata enter orchestrator context.             |
| OM2 candidate    | One clean full SHA binds every applicable gate.                                                                                          |
| OM3 independence | A completes before B; PASS/PASS does not relay; a findings pair releases atomically; A mutation skips B.                                 |
| OM4 findings     | RESPONSE covers the complete origin-open set; requests are sequential, then one ordered terminal result set is delivered atomically.     |
| OM5 invalidation | A new commit invalidates every prior gate and open ID.                                                                                   |
| OM6 recovery     | Native session continuity/recovery uses no private store and invents no Herdr-style evidence.                                            |
| OM7 vocabulary   | The weaker prompt objective and byte-identical capsule precede a final-row marker that excludes echoed inbound frames.                   |
| OM8 attention    | Repository-changing input reaches executor/new SHA; one-row approval matches the request and its exact native E2E actor on the same SHA. |

No final Omnigent scenario has been executed for the post-cutover candidate.

## Final workflow scenario

The adoption run is one uninterrupted feature flow:

```text
preflight -> executor -> clean candidate -> A -> B -> barrier
  -> findings pair atomically -> total same-origin outcomes -> sequential requests -> atomic adjudication set -> new candidate -> all gates again
  -> both reviews PASS -> applicable E2E -> unchanged full SHA
```

Required evidence:

1. P1-P8 already support the exact Herdr keys used.
2. `make mo-qc` passes the candidate and rewrites nothing.
3. H7b and every applicable H13-H37 scenario pass that candidate.
4. Both independent reviewers return complete PASS handoffs for that candidate.
5. `mo-e2e` returns `MO_E2E_V1` PASS, or both reviewers independently declare E2E NA.
6. Final `HEAD` equals the candidate and the worktree remains clean.

Any new commit restarts items 2-6.

## Environment and cleanup

Deterministic checks require Node.js 22 or newer, Git, Bash, and Zsh. Tests use throwaway HOME
and temporary directories; they must never inspect or modify the user's real model settings.

Herdr scenarios require a real interactive orchestrator pane with `HERDR_ENV=1`. Create only
the named visible tabs and panes. Scratch files remain only while their mechanically tracked
open IDs, shared-artifact reference counts and delivery/recovery states require them; one
target cannot delete evidence still referenced by another. Invalidation and controlled exit
delete all eligible paths known to that run. Ambiguous maybe-delivery is awaited and never resent.
Partial topology remains visible on failure because ownership is insufficient for destructive
cleanup; hard-crash scratch residue remains the explicit backlog limitation.

E2E actors use a unique namespace per scenario and clean it even on failure.
Production/destructive scenarios require the documented production-safe contract and an exact
one-row `MO_E2E_APPROVAL_REQUEST_V1` naming the operation and credential-safe scenario ID,
followed by a matching one-row `MO_OPERATIONAL_APPROVAL_V1` immediately before that scenario.
The approval returns only to the exact lifecycle-stored requesting E2E actor on
the unchanged candidate; that actor must equal the native recipient even though
the compact header says `requester=e2e`. Its token is consumed once, and a wrong
actor, wrong scenario, or replay fails closed. Neither row has a body or final
LF. Stop every provider session started by the fixture.
Do not store raw reviewer bodies, screenshots, private transcripts, or a gate registry as
evidence.
