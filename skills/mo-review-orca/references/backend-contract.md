# Backend contract

This document defines the minimum public observable behavior required from Orca.
The Orca mechanics file says how its native surface demonstrates each
capability.

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

Every observed lifecycle event must bind the expected instance, Run, task,
Dispatch and optional terminal to one harness process. It exposes transport,
delivery, work and outcome independently. Required values are:

```text
process: running | stopped | lost | unknown
transport: created | queued | active | stopped | unknown
delivery: not_sent | sent | delivered | consumed | acknowledged | unknown
work: idle | working | input_blocked | output_blocked_after_work | completed | failed | unknown
outcome: none | succeeded | failed | quota | capacity | reconnecting | compacted | refused | unknown_effect | unknown
```

Malformed identity or fields are `unknown`. `sent|queued|delivered` never proves
consumption. Acknowledgement follows processing of the complete delivery batch.
`input_blocked` may be rebriefed or replaced; `output_blocked_after_work` must
not repeat product work and needs the settled response or `needs_attention`. A
run that did the work and then refused to deliver it is exactly that state: the
outcome may read `refused`, but work stays `output_blocked_after_work`, because
treating it as an ordinary refusal throws away work already done.

Effectful native operations expose a stable operation/target id, idempotency
semantics and authoritative confirmation. A receipt is not an effect.
`unknown_effect` is never retried automatically.

Readiness keeps three observations separate: provider-native auth, Orca account
projection with `updatedAt`, and a real selected-harness launch whose requested
and effective model/effort match. A projection older than a successful native
auth is stale, not proof of missing credentials.

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

| Backend | Control executable/package | Required companion guides            |
| ------- | -------------------------- | ------------------------------------ |
| Orca    | `orca-cli` / `orca`        | upstream `orchestration`, `orca-cli` |

Retain upstream names. In particular, do not invent Meta-O aliases for Orca's
`orchestration` and `orca-cli` guides.

## Acceptance probe

For Orca, record current-run human-readable evidence for:

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

Acceptance runs against one named candidate SHA. A missing capability blocks the
feature; it is not silently omitted.
