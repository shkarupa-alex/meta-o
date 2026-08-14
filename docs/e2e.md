# End-to-end verification

`make mo-qc` is the deterministic product gate. `make mo-e2e` deliberately runs
no agentic scenario: it prints this document's entry point and exits 2. A live
actor runs applicable scenarios against one named full candidate SHA without
changing it and reports human-readable evidence.

## Common evidence

Every scenario records backend, control version, companion-skill discovery,
harness/model vendor, exact candidate SHA, action, observable public result and
`PASS`, `FAIL` or `UNKNOWN`. A missing full verdict is `UNKNOWN` and is repeated;
there is no partial pass. Private provider transcripts, hook stores and inferred
session databases are forbidden evidence.

Use a normal settled-response fixture and a three-to-four-screen fixture with
recognizable `BEGIN`, `MIDDLE` and `END` markers. The whole-session view is
tested separately as a diagnostic.

## Backend scenarios

Run this matrix for Herdr, Orca and Paseo:

| ID  | Scenario                                                          | Proof                                                                |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| B1  | Discover exact instance and working directory.                    | Native status/list output identifies both.                           |
| B2  | Launch Codex unsandboxed.                                         | Public readiness and effective posture.                              |
| B3  | Launch Claude Code unsandboxed.                                   | Public readiness and effective posture.                              |
| B4  | Launch OpenCode unsandboxed.                                      | Public readiness and effective posture.                              |
| B5  | Deliver initial `/goal` and ordinary follow-up.                   | Both appear once and produce distinct settled responses.             |
| B6  | Ask and answer an ordinary or harness-UI question.                | Public pending state/request and exact reply path.                   |
| B7  | Distinguish working, completed, pending question and failed/lost. | Native state observations for all four.                              |
| B8  | Retrieve complete normal settled response.                        | Exact expected response, not terminal inference.                     |
| B9  | Retrieve complete long settled response.                          | Beginning, middle and end markers are intact.                        |
| B10 | Inspect whole-session output.                                     | Documented diagnostic command reaches visible output.                |
| B11 | Run two isolated reviewers concurrently.                          | Separate sessions, same SHA, different vendors, no peer bytes.       |
| B12 | Release review pair atomically.                                   | Both unchanged private files reach executor in one ordinary message. |
| B13 | Run standalone backend review.                                    | Backend-specific review entry creates only two reviewers.            |
| B14 | Detect missing control and companion separately.                  | Actionable readiness output names the missing item.                  |

## Watchdog scenarios

| ID  | Scenario                      | Proof                                                                          |
| --- | ----------------------------- | ------------------------------------------------------------------------------ |
| W1  | Target one session read-only. | Exact locator and classified native state; no prompt sent.                     |
| W2  | Scan all reachable backends.  | Every session has its native locator and own state; an empty surface is named. |
| W3  | Nudge one authorized target.  | Stable native state permits one nonblocking exact message.                     |
| W4  | Suppress an unsafe repeat.    | Changed state or an unchanged duplicate prevents delivery.                     |

## Installation scenarios

Local disposable installation must prove exactly ten standalone skills and their
owned references/scripts. Remote installation runs only after an already
authorized publish; do not push merely to execute the fixture.

## Documentation-only carry-forward

E2E may carry across a later documentation-only commit only when both final-SHA
reviewers explicitly confirm that the change cannot affect executable behavior,
skill or agent instructions, acceptance, or this contract. The final report
names the tested SHA and reason. Any doubt reruns E2E.
