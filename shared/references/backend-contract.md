# Backend contract

This document defines the minimum public observable behavior required from
Herdr, Orca and Paseo. A backend-specific mechanics file says how its native
surface demonstrates each capability.

## Required capabilities

A supported backend can, through documented public commands:

- identify the intended backend instance and working directory;
- open a visible, user-reachable session without unnecessary focus theft;
- launch Codex, Claude Code and OpenCode with the required unsandboxed posture;
- deliver an initial task and later ordinary messages;
- expose agent and harness-UI questions and accept an answer;
- distinguish working, completed, pending-question, lost and failed states;
- retrieve the entire settled final response;
- retrieve a deliberately long response of roughly three to four screens with
  recognizable beginning, middle and end markers;
- expose a whole-session view for occasional diagnosis.

Only the settled assistant response is the primary retrieval unit. Whole-session
output is diagnostic and cannot replace a missing complete final response.
Bounded previews, private provider transcripts, provider hooks, inferred session
databases and “repeat your answer” prompts do not prove complete retrieval. A
documented public terminal read is also diagnostic by default; it qualifies only
for a specific backend/harness after one live normal fixture and one live long
fixture each return the entire response in a single read. Missing boundary rows,
including rows discarded by an alternate screen, make the result `unknown` and
the backend fails acceptance.

Versions are diagnostic only. Do not pin them or automatically requalify every
release. When an upstream change produces an observed failure, improve the
methodology for that failure.

## Dependencies

Declare and check the control executable separately from the companion skill:

| Backend | Control executable/package | Required companion skill |
| ------- | -------------------------- | ------------------------ |
| Herdr   | `herdr`                    | upstream `herdr`         |
| Orca    | `orca-cli` / `orca`        | upstream `orchestration` |
| Paseo   | `paseo`                    | upstream `paseo`         |

Retain upstream names. In particular, do not invent a Meta-O alias for Orca's
`orchestration` skill.

## Acceptance probe

For each backend, record current-run human-readable evidence for:

1. instance/workspace discovery;
2. all three harness launch postures;
3. initial and follow-up delivery;
4. ordinary and UI-style question/reply;
5. working/completed/question/failed state discrimination;
6. normal settled-response retrieval;
7. long retrieval with `BEGIN`, `MIDDLE` and `END` markers intact;
8. whole-session diagnostics;
9. two isolated concurrent reviewers and atomic release of their complete
   responses;
10. targeted and scan watchdog behavior;
11. actionable missing-control and missing-companion reporting.

Acceptance runs against one named candidate SHA. A missing capability blocks
the feature; it is not silently omitted.
