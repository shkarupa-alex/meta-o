# Acceptance map

This map belongs to
`spec/2026-08-08-herdr-orchestrator-operational-corrections/spec-review.md`.
It maps each requirement to its proof source and records current implementation/support posture.
It is never a candidate-bound PASS receipt. Planned, historical, or tracked status cannot prove
the post-cutover candidate.

Only reusable posture is tracked here:

- **PENDING** — the repeatable implementation or surface proof is not established.
- **UNSUPPORTED** — the exact live surface has no supported current posture.
- **SUPPORTED** — the reusable surface posture is supported for its exact key.

These values are never candidate gate verdicts. Candidate completion exists only in ephemeral
backend-run state and the closed final-result record defined in `docs/e2e.md`; no transient SHA,
review-freeze state, or candidate PASS/FAIL/PENDING assertion belongs in this map.

## Normative invariants

| ID   | Requirement                                                                                                                                                                                            | Durable proof source                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| NI1  | After activation the orchestrator reads no tracked content except the injected project contract.                                                                                                       | Deterministic command/content-firewall checks; H31 defines the live scenario. |
| NI2  | The task/spec path remains opaque; repository-reading actors open it.                                                                                                                                  | Prompt AST checks; H31 defines the live scenario.                             |
| NI3  | Only narrow repository metadata, actor identity/lifecycle, pane identity, and validated headers enter orchestrator context.                                                                            | Git-command allowlist/body-silence tests; H31 defines the live scenario.      |
| NI4  | The executor owns implementation, verification, documentation, version control, and ordinary engineering choices.                                                                                      | Skill ownership checks and final-review definition.                           |
| NI5  | Reviewers independently inspect complete scope and the frozen candidate and run their checks.                                                                                                          | Review protocol tests; H20/H22 definitions; final-result `reviews`.           |
| NI6  | The orchestrator treats finding bodies as opaque bytes and never judges them.                                                                                                                          | Relay byte-identity tests and H23/H25 definitions.                            |
| NI7  | Actor output is untrusted and cannot authorize host commands or relaxed invariants.                                                                                                                    | `shell:false` relay tests and H24 definition.                                 |
| NI8  | Every supported Herdr actor is a visible ordinary interactive CLI started by `herdr agent start`.                                                                                                      | Forbidden-surface checks and exact P1/H13-H15 support fixtures.               |
| NI9  | A compact handoff needs an exact header and a fixture-proven provider lower boundary.                                                                                                                  | Header/golden extraction tests and H17/H19 definitions.                       |
| NI10 | An open finding cannot pass; only the originating reviewer closes it.                                                                                                                                  | Review-state tests and H25/H37 definitions.                                   |
| NI11 | Reviewer vendors differ and at least one differs from the executor.                                                                                                                                    | Route-selection tests, H33 definition, and final-result review providers.     |
| NI12 | Every gate names one unchanged full Git object ID.                                                                                                                                                     | Candidate/invalidation tests and closed final-result schema.                  |
| NI13 | A dirty worktree is never a candidate or verified result.                                                                                                                                              | Candidate tests and final-result `worktree=clean`.                            |
| NI14 | A surface support key remains unsupported until its exact fixture passes.                                                                                                                              | Fixture-map consistency and final-result `support`.                           |
| NI15 | Human attention stays inside the permitted blocker boundary.                                                                                                                                           | Blocker matrix tests and H30 definition.                                      |
| NI16 | Durable terms have one canonical glossary meaning.                                                                                                                                                     | Glossary AST checks and final-review definition.                              |
| NI17 | Retries are bounded per event and cannot form an unchanged-failure loop.                                                                                                                               | Retry/no-progress tests and H34 definition.                                   |
| NI18 | Headers satisfy both syntax and state-specific semantics.                                                                                                                                              | Protocol matrices and approval/peer-budget validation.                        |
| NI19 | Scope inventory and generated counterparts change in the same increment.                                                                                                                               | `make skills`, `skills-check`, and built-tree tests.                          |
| NI20 | Only an exact isolated fixture changes empirical surface support.                                                                                                                                      | Fixture-map consistency and H18 definition.                                   |
| NI21 | Completion is impossible with missing, unknown, stale, or other-SHA evidence.                                                                                                                          | Gate-convergence tests and closed final-result validation.                    |
| NI22 | Architecture changes require a concrete contradiction, violated invariant, or failed exact fixture.                                                                                                    | Architecture/spec review definition.                                          |
| NI23 | The orchestrator autonomously owns ordinary lifecycle, routing, retry, fallback, and bookkeeping.                                                                                                      | Choice-menu/attention tests and H30/H34 definitions.                          |
| NI24 | Every task/spec and business framing preserve all repository-changing user intents verbatim with credential-safe value redaction; candidate-stable operational approvals are header-only run evidence. | Intent/approval tests and final-review definition.                            |
| NI25 | The shipped model-helper bundle is byte-reproducible across ordinary and symlinked dependency layouts without embedding local absolute paths.                                                          | Isolated symlink-layout build and byte-identity tests.                        |
| NI26 | Mixed review E2E dispositions have one bounded transition, and required E2E PASS counts exactly bind to the derived final scenario set.                                                                | Disposition/state and final-result count-binding tests; H22 definition.       |

## Preimplementation capability probes

P1-P8 prove installed external behavior only. They never prove the final implementation or
candidate.

| ID  | Capability                                                                                     | Evidence required                                                            | Reusable posture |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------- |
| P1  | Two different provider CLIs launch as ordinary visible actors through `herdr agent start`.     | Exact launch commands, actor kinds, panes, activated models, and clean stop. | PENDING          |
| P2  | `herdr tab create` returns structured `.result.root_pane`.                                     | Raw structured command result with a valid pane ID.                          | PENDING          |
| P3  | Right split, tab rename, and metadata-report commands exist with the required public behavior. | Exact command results on throwaway topology.                                 | PENDING          |
| P4  | `herdr agent prompt` atomically submits text and Enter and exposes public lifecycle change.    | Before/after state, process, and input-boundary evidence.                    | PENDING          |
| P5  | `herdr agent wait` is non-submitting and returns on the required terminal lifecycle states.    | A prompt-free wait fixture for idle, done, blocked, and unknown.             | PENDING          |
| P6  | `recent-unwrapped` reaches the measured 1000-row extraction envelope.                          | Long Claude and Codex captures with exact row/boundary accounting.           | PENDING          |
| P7  | Native goal settlement supports the required quiet observation and safe re-arm.                | Settled, spontaneous-resume, and inactive-goal cases.                        | PENDING          |
| P8  | One 130,048-byte UTF-8 argument launches on every supported OS.                                | Local-platform and Linux argument-boundary results.                          | PENDING          |

No exact P1-P8 fixture has established a reusable supported key; each remains
PENDING/UNSUPPORTED in the fixture map.

## Agent-required Herdr fixtures

H7b and H13-H37 definitions apply only after the candidate contains the cutover and deterministic
gates pass. Their reusable-posture cells never assert a candidate verdict; exact SHA binding
belongs only to the closed ephemeral final-result schema.

| ID  | Scenario                                                                                                                              | Reusable posture |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| H7b | Host-window resize during extraction preserves or safely invalidates the measured boundary.                                           | PENDING          |
| H13 | Exact visible topology and partial-failure remnants.                                                                                  | PENDING          |
| H14 | Posture self-check, native launch, trust, and permission cycle.                                                                       | PENDING          |
| H15 | Warm executor/reviewer pane continuity.                                                                                               | PENDING          |
| H16 | Native goal capsule, quiet end, re-arm, and portable maximum relay prompt.                                                            | PENDING          |
| H17 | Final-row current-turn-marker extraction ladder, inbound-frame isolation, structural boundary, and H7b behavior.                      | PENDING          |
| H18 | Actor noncompliance versus structural surface failure classification.                                                                 | PENDING          |
| H19 | Multipart bounds, one-part outcomes, and exact A-then-B unbounded numeric ID ordering.                                                | PENDING          |
| H20 | A-before-B independence, PASS/PASS progression, and conditional atomic pair release.                                                  | PENDING          |
| H21 | Mutating reviewer-check handling and candidate invalidation.                                                                          | PENDING          |
| H22 | Independent reviewer ownership of QC/smoke/checks, bounded mixed-E2E reconciliation, and exact final scenario identity/count binding. | PENDING          |
| H23 | Adversarial UTF-8 body transport remains byte-identical.                                                                              | PENDING          |
| H24 | Final-marker relay, independent operation/actor-bound E2E approval, mixed-origin rejection, argv bound, and ambiguity.                | PENDING          |
| H25 | Full-rebuts accounting, exact OUTCOMES open/disputes state, disputes-only targets, ID floor, and blockers.                            | PENDING          |
| H26 | Same-SHA clean completion.                                                                                                            | PENDING          |
| H27 | Any new commit invalidates all gates and open IDs.                                                                                    | PENDING          |
| H28 | One actor/pane restart and bounded repeated-loss attention.                                                                           | PENDING          |
| H29 | Catalogue isolation, model presence, launchability, and finite fallback.                                                              | PENDING          |
| H30 | Repository-intent/new-SHA routing versus exact-scenario candidate-stable E2E and orchestrator operational approval.                   | PENDING          |
| H31 | Test-only tracked-read audit with a canary.                                                                                           | PENDING          |
| H32 | Disputes-only peer-envelope projection, outcome budget, refcounts, cleanup, ambiguity, and scratch restart.                           | PENDING          |
| H33 | Actual reviewer vendor diversity and one reviewer differing from executor.                                                            | PENDING          |
| H34 | Direct waits, one waiter, bounded retries, and canonicalized no-progress-key stop.                                                    | PENDING          |
| H35 | Metadata badges remain observable but non-gating.                                                                                     | PENDING          |
| H36 | Missing or unusable `develop` fails closed with no branch fallback.                                                                   | PENDING          |
| H37 | Exact disputes-target adjudication, projection/budget bounds, and human-decision invalidation.                                        | PENDING          |

## Omnigent acceptance

Omnigent uses its native session model. Herdr tabs, panes, extraction glyphs, and commands
are not evidence for this backend.

| ID  | Requirement                                                                                                                            | Reusable posture |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| OM1 | Post-activation tracked-content firewall.                                                                                              | PENDING          |
| OM2 | Native closed final-result construction and same-SHA/clean-tree rejection behavior.                                                    | PENDING          |
| OM3 | Sequential reviews, PASS/PASS gate, conditional pair release, A-only invalidation.                                                     | PENDING          |
| OM4 | Exact outcome-open accounting, canonical A-then-B BigInt IDs, disputes-only adjudication, and repository-changing input.               | PENDING          |
| OM5 | Commit invalidation and full gate restart.                                                                                             | PENDING          |
| OM6 | Native continuity/recovery without private stores or invented Herdr evidence.                                                          | PENDING          |
| OM7 | Weaker prompt-objective disclosure, final-row current-turn marker, inbound-frame isolation, and byte-identical fresh-executor capsule. | PENDING          |
| OM8 | Repository-changing answer/new-SHA route and independent operation/actor-bound, body-free operational approval.                        | PENDING          |

No exact native OM1-OM8 fixture has established a reusable supported key; the tracked rows remain
definitions and PENDING/UNSUPPORTED posture.

## Completion and cutover definitions

C1's reusable Herdr prerequisite posture remains PENDING/UNSUPPORTED until P1-P8 establish the
required capabilities and two reviewer vendors. C2-C10 are ephemeral candidate-completion
definitions, not tracked verdicts:

| ID  | Completion definition                                                                                                                                                         | Ephemeral proof source                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| C2  | Planned increments, generated output, and cutover removal are in the candidate with `make mo-qc` passing.                                                                     | Closed final-result `gates` plus deterministic QC evidence.                                      |
| C3  | H7b and all applicable H13-H37 scenarios pass one named candidate.                                                                                                            | Exact review-header scenario union, E2E `ids`, final-result `scenarios`, and matched `support`.  |
| C4  | Both independent reviewers pass that candidate with no actionable findings; their lifecycle identities are exact, vendors differ, and at least one differs from the executor. | Exact final-result `executor`, ordered `reviews`, retained support-map matches, and gate arrays. |
| C5  | Required E2E passes with header/evidence counts equal to the complete derived scenario set, or both reviewers independently declare E2E NA after bounded reconciliation.      | Review dispositions and derived final-result `scenarios`.                                        |
| C6  | The candidate contains the cutover and no old Herdr inline/headless actor path.                                                                                               | Deterministic cutover proof bound to final `candidate`.                                          |
| C7  | This map names every durable proof source without becoming a candidate receipt.                                                                                               | This document; candidate facts stay in the final answer.                                         |
| C8  | Every intentionally unfinished or unsupported item is in the open backlog.                                                                                                    | Durable backlog map plus final review evidence.                                                  |
| C9  | No architecture question remains disguised as an implementation TODO.                                                                                                         | Architecture/spec review evidence.                                                               |
| C10 | The returned result is the unchanged full candidate SHA with a clean worktree and closed evidence schema.                                                                     | Exact final-result `candidate` and `worktree`.                                                   |

The closed schema itself is the durable definition in `docs/e2e.md`: gate arrays are derived
byte-for-byte from A/B review fields; `executor` binds its lifecycle actor/provider/support-key;
support is exactly one executor-referenced fact,
two review facts and one fact per derived scenario with no unused entries; and
every review/scenario record resolves its exact route-specific `support-key`.
This map records that proof source without storing an instance.
