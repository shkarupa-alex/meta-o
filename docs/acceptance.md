# Acceptance mapping

This document maps each feature requirement to the evidence that actually proves
it. Current-run verdicts stay in the final report rather than this tracked file.

| Requirement                                                                   | Deterministic evidence                                                        | Live evidence                                            |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Exactly ten named skills build and install.                                   | Build and install tests enumerate the exact names and files.                  | Local install scenario confirms discovery.               |
| The removed backend is absent except verbatim history and the README pointer. | Repository scan excludes protected history and asserts the exact pointer SHA. | None.                                                    |
| Herdr orchestration and review work.                                          | Authored/built contract tests.                                                | Backend scenarios B1-B14 on Herdr.                       |
| Orca orchestration and review work.                                           | Mechanics and companion-name tests.                                           | Backend scenarios B1-B14 on Orca.                        |
| Paseo orchestration and review work.                                          | Mechanics and companion-name tests.                                           | Backend scenarios B1-B14 on Paseo.                       |
| Codex, Claude Code and OpenCode run unsandboxed.                              | Setup/posture helper tests.                                                   | B2-B4 for each backend.                                  |
| Complete normal and long settled responses are retrievable.                   | Marker and forbidden-surface contract tests.                                  | B8-B10 for each backend.                                 |
| Reviews are concurrent, independent and vendor-diverse.                       | Review-protocol tests.                                                        | B11-B13 on the candidate.                                |
| Both reviews reach the executor only as a complete pair.                      | Methodology assertions.                                                       | B12 on each orchestrator backend.                        |
| Reviewers perform feature and backlog lenses.                                 | Shared review-protocol assertions.                                            | Both final responses show both lenses.                   |
| Setup checks project substance and backend companions.                        | Setup contract tests.                                                         | B14 plus posture probes.                                 |
| Pattern watchdog supports per-session scan and safe nonblocking nudge.        | Native-JSON, stable-envelope and cross-invocation deduplication tests.        | W1-W4.                                                   |
| Knowledge split and semantic Markdown labels are correct.                     | Markdown AST link/title and required-document tests.                          | None.                                                    |
| Backlog disposition is complete.                                              | Backlog semantic-field tests and absence of removed progress rows.            | Final reviewers inspect all rows.                        |
| One final SHA passes QC and applicable E2E.                                   | `make mo-qc` on that SHA.                                                     | E2E matrix or reviewer-approved docs-only carry-forward. |
