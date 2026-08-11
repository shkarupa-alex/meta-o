# Acceptance map

This map belongs to
`spec/2026-08-08-herdr-orchestrator-operational-corrections/spec-review.md`.
It names what must prove each requirement without claiming that planned or historical evidence
proves the post-cutover candidate.

Statuses have narrow meanings:

- **PENDING** — the required deterministic or live evidence has not passed one named
  post-cutover SHA.
- **UNSUPPORTED** — the exact live surface has not passed its fixture. This is not a
  permanent product verdict; a passing exact fixture may change it.
- **PASS** — evidence names the unchanged full candidate SHA and satisfies the row completely.

The deterministic implementation exists, but its final post-correction SHA and
review gates are not frozen, so no row in this document is PASS yet. This task is
running without `HERDR_ENV=1`, so no Herdr capability or agentic row can be
executed honestly in the current session. Remote installation I3/I5 and native
Omnigent OM1-OM8 likewise remain pending and unsupported in their own ledgers.

## Normative invariants

| ID   | Requirement                                                                                                                                                                                            | Required proof                                                                                    | Status                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------- |
| NI1  | After activation the orchestrator reads no tracked content except the injected project contract.                                                                                                       | Deterministic command/content-firewall checks plus H31 tracked-read canary.                       | PENDING               |
| NI2  | The task/spec path remains opaque; repository-reading actors open it.                                                                                                                                  | Prompt AST checks and H31.                                                                        | PENDING               |
| NI3  | Only narrow repository metadata, actor identity/lifecycle, pane identity, and validated headers enter orchestrator context.                                                                            | Git-command allowlist and body-silence tests plus H31.                                            | PENDING               |
| NI4  | The executor owns implementation, verification, documentation, version control, and ordinary engineering choices.                                                                                      | Skill ownership checks and both final reviews.                                                    | PENDING               |
| NI5  | Reviewers independently inspect complete scope and the frozen candidate and run their checks.                                                                                                          | Review protocol tests plus H20 and H22.                                                           | PENDING               |
| NI6  | The orchestrator treats finding bodies as opaque bytes and never judges them.                                                                                                                          | Relay byte-identity tests plus H23 and H25.                                                       | PENDING               |
| NI7  | Actor output is untrusted and cannot authorize host commands or relaxed invariants.                                                                                                                    | `shell:false` relay tests plus H24.                                                               | PENDING               |
| NI8  | Every supported Herdr actor is a visible ordinary interactive CLI started by `herdr agent start`.                                                                                                      | Forbidden-surface checks plus P1 and H13-H15.                                                     | PENDING / UNSUPPORTED |
| NI9  | A compact handoff needs an exact header and a fixture-proven provider lower boundary.                                                                                                                  | Header matrix and golden extraction tests plus H17 and H19.                                       | PENDING / UNSUPPORTED |
| NI10 | An open finding cannot pass; only the originating reviewer closes it.                                                                                                                                  | Review-state matrix tests plus H25 and H37.                                                       | PENDING               |
| NI11 | Reviewer vendors differ and at least one differs from the executor.                                                                                                                                    | Route-selection tests plus H33.                                                                   | PENDING / UNSUPPORTED |
| NI12 | Every gate names one unchanged full Git object ID.                                                                                                                                                     | Candidate/invalidation tests plus H26-H27.                                                        | PENDING               |
| NI13 | A dirty worktree is never a candidate or verified result.                                                                                                                                              | Candidate matrix tests plus H21 and H26.                                                          | PENDING               |
| NI14 | A surface support key remains unsupported until its exact fixture passes.                                                                                                                              | Fixture-map consistency checks plus P1-P8 and H7b/H13-H37.                                        | PENDING / UNSUPPORTED |
| NI15 | Human attention stays inside the permitted blocker boundary.                                                                                                                                           | Blocker source/phase matrix tests plus H30.                                                       | PENDING               |
| NI16 | Durable terms have one canonical glossary meaning.                                                                                                                                                     | Glossary AST checks plus final reviews.                                                           | PENDING               |
| NI17 | Retries are bounded per event and cannot form an unchanged-failure loop.                                                                                                                               | Retry/no-progress tests plus H34.                                                                 | PENDING               |
| NI18 | Headers satisfy both syntax and state-specific semantics.                                                                                                                                              | Protocol matrices plus independent approval operation/actor and peer-remaining-budget validation. | PENDING               |
| NI19 | Scope inventory and generated counterparts change in the same increment.                                                                                                                               | `make skills`/`skills-check` and built-tree tests.                                                | PENDING               |
| NI20 | Only an exact isolated fixture changes empirical surface support.                                                                                                                                      | Fixture-map review plus H18.                                                                      | PENDING / UNSUPPORTED |
| NI21 | Completion is impossible with missing, unknown, stale, or other-SHA evidence.                                                                                                                          | Gate-convergence tests plus H26-H27.                                                              | PENDING               |
| NI22 | Architecture changes require a concrete contradiction, violated invariant, or failed exact fixture.                                                                                                    | Architecture/spec review against the final diff.                                                  | PENDING               |
| NI23 | The orchestrator autonomously owns ordinary lifecycle, routing, retry, fallback, and bookkeeping.                                                                                                      | Choice-menu/attention tests plus H30 and H34.                                                     | PENDING               |
| NI24 | Every task/spec and business framing preserve all repository-changing user intents verbatim with credential-safe value redaction; candidate-stable operational approvals are header-only run evidence. | Intent-contract and approval-routing tests plus both final reviews.                               | PENDING               |

## Preimplementation capability probes

P1-P8 prove installed external behavior only. They never prove the final implementation or
candidate.

| ID  | Capability                                                                                     | Evidence required                                                            | Status                |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------- |
| P1  | Two different provider CLIs launch as ordinary visible actors through `herdr agent start`.     | Exact launch commands, actor kinds, panes, activated models, and clean stop. | PENDING / UNSUPPORTED |
| P2  | `herdr tab create` returns structured `.result.root_pane`.                                     | Raw structured command result with a valid pane ID.                          | PENDING / UNSUPPORTED |
| P3  | Right split, tab rename, and metadata-report commands exist with the required public behavior. | Exact command results on throwaway topology.                                 | PENDING / UNSUPPORTED |
| P4  | `herdr agent prompt` atomically submits text and Enter and exposes public lifecycle change.    | Before/after state, process, and input-boundary evidence.                    | PENDING / UNSUPPORTED |
| P5  | `herdr agent wait` is non-submitting and returns on the required terminal lifecycle states.    | A prompt-free wait fixture for idle, done, blocked, and unknown.             | PENDING / UNSUPPORTED |
| P6  | `recent-unwrapped` reaches the measured 1000-row extraction envelope.                          | Long Claude and Codex captures with exact row/boundary accounting.           | PENDING / UNSUPPORTED |
| P7  | Native goal settlement supports the required quiet observation and safe re-arm.                | Settled, spontaneous-resume, and inactive-goal cases.                        | PENDING / UNSUPPORTED |
| P8  | One 130,048-byte UTF-8 argument launches on every supported OS.                                | Local-platform and Linux argument-boundary results.                          | PENDING / UNSUPPORTED |

The current environment has no Herdr control plane, so each exact Herdr support key remains
UNSUPPORTED.

## Agent-required Herdr fixtures

H7b and H13-H37 run only after the candidate already contains the cutover and all
deterministic gates pass. Every row must name that same full SHA.

| ID  | Scenario                                                                                                                     | Status                |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| H7b | Host-window resize during extraction preserves or safely invalidates the measured boundary.                                  | PENDING / UNSUPPORTED |
| H13 | Exact visible topology and partial-failure remnants.                                                                         | PENDING / UNSUPPORTED |
| H14 | Posture self-check, native launch, trust, and permission cycle.                                                              | PENDING / UNSUPPORTED |
| H15 | Warm executor/reviewer pane continuity.                                                                                      | PENDING / UNSUPPORTED |
| H16 | Native goal capsule, quiet end, re-arm, and portable maximum relay prompt.                                                   | PENDING / UNSUPPORTED |
| H17 | Final-row current-turn-marker extraction ladder, inbound-frame isolation, structural boundary, and H7b behavior.             | PENDING / UNSUPPORTED |
| H18 | Actor noncompliance versus structural surface failure classification.                                                        | PENDING / UNSUPPORTED |
| H19 | Multipart FINDINGS and one-part FOLLOWUP/OUTCOMES/DISPUTED size bounds.                                                      | PENDING / UNSUPPORTED |
| H20 | A-before-B independence, PASS/PASS progression, and conditional atomic pair release.                                         | PENDING / UNSUPPORTED |
| H21 | Mutating reviewer-check handling and candidate invalidation.                                                                 | PENDING / UNSUPPORTED |
| H22 | Independent reviewer ownership of QC, smoke, and applicable checks.                                                          | PENDING / UNSUPPORTED |
| H23 | Adversarial UTF-8 body transport remains byte-identical.                                                                     | PENDING / UNSUPPORTED |
| H24 | Final-marker relay, independent operation/actor-bound E2E approval, mixed-origin rejection, argv bound, and ambiguity.       | PENDING / UNSUPPORTED |
| H25 | Complete-origin-open RESPONSE and total multi-ID close/dispute/new-ID outcomes, ID floor, A-only invalidation, and blockers. | PENDING / UNSUPPORTED |
| H26 | Same-SHA clean completion.                                                                                                   | PENDING / UNSUPPORTED |
| H27 | Any new commit invalidates all gates and open IDs.                                                                           | PENDING / UNSUPPORTED |
| H28 | One actor/pane restart and bounded repeated-loss attention.                                                                  | PENDING / UNSUPPORTED |
| H29 | Catalogue isolation, model presence, launchability, and finite fallback.                                                     | PENDING / UNSUPPORTED |
| H30 | Repository-intent/new-SHA routing versus exact-scenario candidate-stable E2E and orchestrator operational approval.          | PENDING / UNSUPPORTED |
| H31 | Test-only tracked-read audit with a canary.                                                                                  | PENDING / UNSUPPORTED |
| H32 | Peer-envelope projection, cumulative outcome budget, refcounts, cleanup, ambiguity, and lost-scratch restart.                | PENDING / UNSUPPORTED |
| H33 | Actual reviewer vendor diversity and one reviewer differing from executor.                                                   | PENDING / UNSUPPORTED |
| H34 | Direct waits, one waiter, bounded retries, and no-progress stop.                                                             | PENDING / UNSUPPORTED |
| H35 | Metadata badges remain observable but non-gating.                                                                            | PENDING / UNSUPPORTED |
| H36 | Missing or unusable `develop` fails closed with no branch fallback.                                                          | PENDING / UNSUPPORTED |
| H37 | Projected and remaining-budget-bound multi-target adjudication plus human-decision invalidation.                             | PENDING / UNSUPPORTED |

## Omnigent acceptance

Omnigent uses its native session model. Herdr tabs, panes, extraction glyphs, and commands
are not evidence for this backend.

| ID  | Requirement                                                                                                                            | Status                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| OM1 | Post-activation tracked-content firewall.                                                                                              | PENDING / UNSUPPORTED |
| OM2 | Clean full-SHA candidate and candidate-bound gates.                                                                                    | PENDING / UNSUPPORTED |
| OM3 | Sequential reviews, PASS/PASS gate, conditional pair release, A-only invalidation.                                                     | PENDING / UNSUPPORTED |
| OM4 | Complete-origin-open RESPONSE, total outcomes, cumulative-budget aggregate adjudication, and repository-changing human input.          | PENDING / UNSUPPORTED |
| OM5 | Commit invalidation and full gate restart.                                                                                             | PENDING / UNSUPPORTED |
| OM6 | Native continuity/recovery without private stores or invented Herdr evidence.                                                          | PENDING / UNSUPPORTED |
| OM7 | Weaker prompt-objective disclosure, final-row current-turn marker, inbound-frame isolation, and byte-identical fresh-executor capsule. | PENDING / UNSUPPORTED |
| OM8 | Repository-changing answer/new-SHA route and independent operation/actor-bound, body-free operational approval.                        | PENDING / UNSUPPORTED |

No supported Omnigent route has yet passed these rows against the post-cutover candidate.

## Completion and cutover

| ID  | Completion criterion                                                                                                       | Status                |
| --- | -------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| C1  | P1-P8 establish required Herdr capabilities and two reviewer vendors.                                                      | PENDING / UNSUPPORTED |
| C2  | Every planned increment, generated output, and removal of inline/headless behavior is committed with `make mo-qc` passing. | PENDING               |
| C3  | H7b and all applicable H13-H37 rows pass one named candidate.                                                              | PENDING / UNSUPPORTED |
| C4  | Both independent reviewers pass that same candidate with no actionable findings.                                           | PENDING               |
| C5  | Applicable agent-required E2E passes that same candidate.                                                                  | PENDING               |
| C6  | The candidate already contains the cutover and no old Herdr inline/headless actor path.                                    | PENDING               |
| C7  | This acceptance map names evidence for every applicable requirement.                                                       | PENDING               |
| C8  | Every intentionally unfinished or unsupported item is in the open backlog.                                                 | PENDING               |
| C9  | No architecture question remains disguised as an implementation TODO.                                                      | PENDING               |
| C10 | The returned result is the unchanged full candidate SHA.                                                                   | PENDING               |
