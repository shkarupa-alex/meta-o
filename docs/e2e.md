# End-to-end verification

`make mo-qc` is the deterministic product gate. `make mo-e2e` deliberately runs no agentic
scenario: it prints this document's entry point and exits 2. A live actor must name one full
post-cutover candidate SHA and return per-scenario evidence through the backend public surface.

Historical inline/headless runs do not prove the current Herdr route. The current route
supports only visible ordinary interactive actors started through `herdr agent start`.

## Evidence contract

Intermediate E2E handoffs may be PASS, FAIL, or UNKNOWN. The verified final-result
record is closed: top-level keys occur exactly in this order:

```text
candidate, worktree, gates, support, reviews, scenarios
```

- `candidate` is the unchanged full SHA and `worktree` is exactly `clean`.
- `gates` is exactly the ordered array `qc`, `smoke`, `checks`. Each entry has
  exactly `gate,statuses`; statuses are reviewer-A then reviewer-B. QC and smoke
  are `PASS,PASS`; each checks status is `PASS|NA`.
- `support` has 3..67 unique entries, sorted by the exact seven-field key tuple
  `backend,provider,provider-version,backend-version,surface,os,fixture`. Each entry
  has exactly `key,status,scenarios`; `status=SUPPORTED`; `scenarios` is empty or
  a singleton safe ID list. Every safe lowercase identifier matches
  `[a-z0-9][a-z0-9._-]{0,63}`. The facts are exactly one lifecycle-selected
  `executor`/`executor-turn` fact, the two review-referenced facts, and one
  scenario-referenced fact per derived name; no unused fact is allowed.
- `reviews` is exactly A then B. Each entry has exactly
  `reviewer,actor,provider,support-key,status,qc,smoke,checks,e2e,scenarios,evidence`;
  status, qc and smoke are PASS, checks is `PASS|NA`, actor/provider identities
  equal lifecycle state, providers differ, at least one reviewer provider
  differs from the executor, and
  `e2e` is `REQUIRED|NA`. Its exact canonical scenario list has 1..64 IDs for
  REQUIRED and is empty for NA. The top-level gate status arrays byte-equal the A/B
  review `qc`, `smoke`, and `checks` fields. `support-key` is the exact
  slash-join of its matched support fact's seven safe-ID values in key order.
  That fact has the selected route's backend, the same provider, `surface=review`,
  `fixture=review-turn`, and `scenarios=[]`. Evidence has exactly
  `source,protocol,parts,rows,bytes`: source `backend-public-surface`, protocol
  `MO_REVIEW_V2`, and maxima 6 parts, 1000 rows, 61,440 bytes.
- The two final review E2E dispositions agree. Both `NA` requires
  `scenarios=[]`. Both `REQUIRED` derives a nonempty `scenarios` list exactly as
  the sorted unique union of both validated review lists; support facts prove
  each identity but never define applicability. A mixed first pass re-prompts
  exactly the NA reviewer once on the unchanged candidate without peer output;
  a change to REQUIRED proceeds,
  while repeated NA is terminal `needs_attention:e2e_disposition_dispute`.
  For REQUIRED/REQUIRED the initial E2E prompt places exact
  `MO_E2E_ASSIGNMENT_V1|candidate=<oid>|scenarios=<positive-int>|ids=<safe-id-list>`
  for that union immediately before the final prompt boundary; E2E executes
  exactly the assignment rather than selecting applicability.
- Scenario records follow that exact sorted order. Each has exactly
  `scenario,actor,provider,support-key,status,evidence`; status is PASS.
  `support-key` resolves to a fact with the selected route's backend, the same provider,
  `surface=e2e`, `fixture=scenario`, and `scenarios=[scenario]`; a merely
  same-provider fact is insufficient. Evidence has exactly
  `source,protocol,ordinal,total,rows,bytes`: source `backend-public-surface`,
  protocol `MO_E2E_V1`, ordinal 1..total, the same total on every entry, and
  maxima 1000 rows and 65,536 bytes.
- For REQUIRED/REQUIRED, the validated E2E PASS header's positive `scenarios`
  count and exact canonical `ids` list equal the derived scenario identities and
  every evidence `total`, with `not_run=none`. A smaller, repeated, reordered,
  same-size different, or self-selected support/result set cannot prove
  completeness.

Extra keys, prose/generic evidence, missing support/gates/evidence, FAIL/UNKNOWN,
a dirty tree, or a changed SHA cannot produce the verified record.

`PASS` is valid only when the complete expected result can be read and the final `HEAD` still
equals the named candidate with a clean worktree. Missing, truncated, ambiguous, stale, or
other-SHA evidence is `UNKNOWN`.

This result remains in the current run and final response. Never write or commit it into
`docs/phase-0-fixtures.md`, `docs/acceptance.md`, or another tracked file, and create no
manifest, receipt, registry, or external evidence sink. Those documents define fixtures, map
requirements, and state current reusable support posture only.

## Deterministic scenarios

These scenarios run under `make mo-qc`. They do not substitute for live provider rendering,
native lifecycle, vendor diversity, or absence of tracked reads in a real actor run.

| Scenario          | Required behavior                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Root contract     | `AGENTS.md` and `CLAUDE.md` are byte-identical and use the self-contained-helper contract.                                                  |
| Built tree        | `skills/` exactly matches the build from `src/skills/`, `shared/`, the model bundle, and mapped licences.                                   |
| Setup contract    | `mo-setup` installs the exact version-control and non-mutating-reviewer-check rules.                                                        |
| Model bundle      | Pinned SDK/esbuild versions, size ceiling, metafile roots, notices, no externals, no runtime `node_modules`.                                |
| Catalogue         | `catalog_unknown`, `model_missing`, and `launch_failed` remain distinct; history never becomes catalogue.                                   |
| Header protocols  | Exact fields/matrices, A-then-B unbounded BigInt ID-list order, origin single-prefix lists, and unknown classes for every compact protocol. |
| Review accounting | Full-rebuts origin outcomes plus disputes-only target projection, remaining budgets, and aggregate adjudication.                            |
| Candidate gates   | Full object IDs, branch grammar, clean tree, same-SHA gates, commit invalidation, and missing `develop`.                                    |
| Relay             | Exact framing, marker-last human returns, aggregate peer outcomes, independent approval operation/actor binding, and body-silent failures.  |
| Portable argv     | First-pass and both projected aggregate envelopes keep framing/body totals within 7,168/130,048 bytes.                                      |
| Prompt ambiguity  | A changed signal is awaited; unchanged or contradictory evidence never causes a blind retry.                                                |
| Topology          | Exact executor/review commands, structured `root_pane`, collision handling, and partial failure.                                            |
| Lifecycle         | One waiter, direct waits, bounded loss/retry, and a no-progress key that canonicalizes open-ID permutations into one A-then-B order.        |
| Extraction        | Golden Claude/Codex boundaries, extraction ladder, duplicate/stale/missing boundary rejection.                                              |
| Scratch           | `0700` directory, `0600` files, content-free prefix, controlled cleanup, and no cross-run adoption.                                         |
| Posture           | Fixed fake PATH/shell matrix and the exact consumer contract; live posture remains a separate fixture.                                      |
| Documentation     | Canonical glossary, verbatim intent consistency, open-only backlog, exact acceptance mapping, no unsolicited docs.                          |
| Cutover           | Shipped Herdr files contain no inline/headless actor fallback, private transcript, or verdict-file path.                                    |

## Remote installation scenarios

Run I3 and I5 from `docs/phase-0-fixtures.md` only after a separately authorized action has
pushed the exact candidate. They prove that both advertised remote clients discover the
committed generated tree; local-path installation is deterministic coverage, not remote
evidence. Until a current run returns its public SHA, client version, installed file list, and
cleanup facts, the remote installation paths remain unsupported; those facts are not appended
to the fixture map.

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

P1-P8 remain PENDING/UNSUPPORTED in the durable fixture map until their exact
reusable surface keys are established.

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
| Transport lifetime     | H32          | Both aggregate-envelope projections, cumulative peer budget, refcounts, cleanup, and lost-scratch recovery.                                   |
| Diversity and waits    | H33-H35      | Actual vendors, direct waits, retry/no-progress bounds, and non-gating badges.                                                                |
| Failure edges          | H36-H37      | Missing `develop` and total existing-peer adjudication.                                                                                       |

The detailed expected observation and current support posture for every ID live in
`docs/phase-0-fixtures.md`. Candidate PASS exists only in the live run/final result; current
fixture rows remain PENDING/UNSUPPORTED.

## Omnigent scenarios

Run a supported native Omnigent route against the same candidate contract without copying
Herdr evidence or mechanics.

| Scenario         | Required behavior                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| OM1 firewall     | After activation only native process/lifecycle facts, validated headers, and narrow Git metadata enter orchestrator context.     |
| OM2 candidate    | One clean full SHA binds the exact closed gates/support/reviews/derived-scenarios final-result schema.                           |
| OM3 independence | A completes before B; PASS/PASS does not relay; a findings pair releases atomically; A mutation skips B.                         |
| OM4 findings     | RESPONSE accounts for full rebuts; canonical A-then-B BigInt lists feed exact outcome state, while only disputes enter delivery. |
| OM5 invalidation | A new commit invalidates every prior gate and open ID.                                                                           |
| OM6 recovery     | Native session continuity/recovery uses no private store and invents no Herdr-style evidence.                                    |
| OM7 vocabulary   | The weaker prompt objective and byte-identical capsule precede a final-row marker that excludes echoed inbound frames.           |
| OM8 attention    | Repository-changing input reaches executor/new SHA; approval matches independently stored operation and exact native E2E actor.  |

OM1-OM8 remain PENDING/UNSUPPORTED reusable posture in the fixture map; a
candidate verdict exists only in the ephemeral closed final result.

## Final workflow scenario

The adoption run is one uninterrupted feature flow:

```text
preflight -> executor -> clean candidate -> A -> B -> barrier
  -> findings pair atomically -> total same-origin outcomes -> sequential requests -> atomic adjudication set -> new candidate -> all gates again
  -> both reviews PASS -> applicable E2E -> unchanged full SHA
```

Required current-run evidence:

1. P1-P8 already support the exact Herdr keys used.
2. `make mo-qc` passes the candidate and rewrites nothing.
3. H7b and every applicable H13-H37 scenario pass that candidate.
4. Both independent reviewers return complete PASS handoffs for that candidate.
5. `mo-e2e` returns `MO_E2E_V1` PASS, or both reviewers independently declare E2E NA.
6. Final `HEAD` equals the candidate and the worktree remains clean.

Any new commit restarts items 2-6.
The final result returns all six facts with exact actor/provider and per-scenario details; it
does not update or commit a tracked evidence document.

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
the compact header says `requester=e2e`. The operation is stored independently
and must equal the returned header. Its token is consumed once, and a wrong
actor, operation, scenario, or replay fails closed. Neither row has a body or
final LF. Stop every provider session started by the fixture.
Do not store raw reviewer bodies, screenshots, private transcripts, or a gate registry as
evidence.
