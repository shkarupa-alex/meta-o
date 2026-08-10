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

| Scenario          | Required behavior                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Root contract     | `AGENTS.md` and `CLAUDE.md` are byte-identical and use the self-contained-helper contract.                         |
| Built tree        | `skills/` exactly matches the build from `src/skills/`, `shared/`, the model bundle, and mapped licences.          |
| Setup contract    | `mo-setup` installs the exact version-control and non-mutating-reviewer-check rules.                               |
| Model bundle      | Pinned SDK/esbuild versions, size ceiling, metafile roots, notices, no externals, no runtime `node_modules`.       |
| Catalogue         | `catalog_unknown`, `model_missing`, and `launch_failed` remain distinct; history never becomes catalogue.          |
| Header protocols  | Executor, review, adjudication, and E2E grammar, field order, matrices, IDs, and unknown classes.                  |
| Review accounting | Consecutive parts, cumulative open IDs, close ownership, row/byte limits, and forced dispute.                      |
| Candidate gates   | Full object IDs, branch grammar, clean tree, same-SHA gates, commit invalidation, and missing `develop`.           |
| Relay             | Exact framing, collision retries, byte lengths, UTF-8/NUL handling, newline identity, and body-silent failures.    |
| Portable argv     | Combined 130,048-byte argument and bounded adjudication subset remain below supported limits.                      |
| Prompt ambiguity  | A changed signal is awaited; unchanged or contradictory evidence never causes a blind retry.                       |
| Topology          | Exact executor/review commands, structured `root_pane`, collision handling, and partial failure.                   |
| Lifecycle         | One waiter, direct wait arms, 10-second quiet period, bounded loss/retry, and no-progress key.                     |
| Extraction        | Golden Claude/Codex boundaries, extraction ladder, duplicate/stale/missing boundary rejection.                     |
| Scratch           | `0700` directory, `0600` files, content-free prefix, controlled cleanup, and no cross-run adoption.                |
| Posture           | Fixed fake PATH/shell matrix and the exact consumer contract; live posture remains a separate fixture.             |
| Documentation     | Canonical glossary, verbatim intent consistency, open-only backlog, exact acceptance mapping, no unsolicited docs. |
| Cutover           | Shipped Herdr files contain no inline/headless actor fallback, private transcript, or verdict-file path.           |

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

| Group                  | Scenario IDs | What the group proves                                                                                  |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| Visible actors         | H13-H15      | Exact topology, launch posture, model activation, warm panes, and partial failure.                     |
| Goals and retrieval    | H7b, H16-H19 | Quiet goal settlement, extraction boundaries, structural failure classification, and multipart limits. |
| Independent review     | H20-H25      | Sequential barrier, reviewer-owned checks, byte identity, exact relay, findings, and blockers.         |
| Candidate lifecycle    | H26-H29      | Same-SHA completion, commit invalidation, restart, and model fallback.                                 |
| Firewall and attention | H30-H31      | Narrow human channel and test-only tracked-read canary.                                                |
| Transport lifetime     | H32          | Scratch creation, delivery lifetime, cleanup, and lost-scratch recovery.                               |
| Diversity and waits    | H33-H35      | Actual vendors, direct waits, retry/no-progress bounds, and non-gating badges.                         |
| Failure edges          | H36-H37      | Missing `develop` and existing-peer adjudication.                                                      |

The detailed expected observation and current status for every ID live in
`docs/phase-0-fixtures.md`. No row is currently PASS.

## Omnigent scenarios

Run a supported native Omnigent route against the same candidate contract without copying
Herdr evidence or mechanics.

| Scenario         | Required behavior                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| OM1 firewall     | After activation only native process/lifecycle facts, validated headers, and narrow Git metadata enter orchestrator context. |
| OM2 candidate    | One clean full SHA binds every applicable gate.                                                                              |
| OM3 independence | A completes before B starts; vendors differ; B receives no A bytes before the barrier.                                       |
| OM4 findings     | Structured opaque findings preserve origin closure and other-vendor adjudication.                                            |
| OM5 invalidation | A new commit invalidates every prior gate and open ID.                                                                       |
| OM6 recovery     | Native session continuity/recovery uses no private store and invents no Herdr-style evidence.                                |
| OM7 vocabulary   | The route states its weaker prompt objective and uses canonical terms.                                                       |
| OM8 attention    | Only the permitted human boundaries interrupt the user.                                                                      |

No final Omnigent scenario has been executed for the post-cutover candidate.

## Final workflow scenario

The adoption run is one uninterrupted feature flow:

```text
preflight -> executor -> clean candidate -> A -> B -> barrier
  -> combined feedback -> new candidate -> all gates again
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
the named visible tabs and panes. Controlled exits delete only scratch paths created by that
run. Partial topology remains visible on failure because ownership is insufficient for
destructive cleanup.

E2E actors use a unique namespace per scenario and clean it even on failure.
Production/destructive scenarios require the documented production-safe contract and explicit
approval immediately before the named scenario. Stop every provider session started by the
fixture. Do not store raw reviewer bodies, screenshots, private transcripts, or a gate registry
as evidence.
