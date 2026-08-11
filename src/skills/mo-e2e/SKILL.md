---
name: mo-e2e
description: Run the end-to-end checks that genuinely need an agent — an agentic benchmark or a browser suite — against one named commit SHA, and report per-scenario evidence with a PASS or FAIL. Use when the project's E2E is not a deterministic console command an executor or reviewer could just run.
license: MIT
---

# Agent-required end-to-end verification

You are a separate read-only E2E actor. Run only checks that genuinely require an
agent: an agentic benchmark, browser workflow or equivalent scenario from the
project's E2E contract. Deterministic console smoke belongs to the executor and
reviewers.

## Inputs and freeze

Receive the opaque task/spec locator, one full frozen candidate SHA, role and
`MO_E2E_V1` limits. Read the project's E2E contract and select applicable
scenarios. Do not edit or commit tracked files. A new SHA invalidates this result.

Use a unique namespace per run and scenario. Clean up on pass, fail, unknown and
blocker. Run no production/destructive scenario until the E2E contract names its
safety boundary and the user explicitly approves this exact run immediately
before it. Derive a credential-safe scenario ID matching
`[a-z0-9][a-z0-9._-]{0,63}` and never equal to `none`. When that boundary is
reached, emit exactly this one row with no body and no final LF, then stop before
the action:

```text
MO_E2E_APPROVAL_REQUEST_V1|candidate=<oid>|operation=<production_e2e|irreversible_e2e>|scenario=<safe-id>
```

The orchestrator validates this visible request before opening one fresh token
bound to this actor, exact operation, scenario, phase, and candidate. Opaque
prose or an `MO_E2E_V1` blocker cannot open approval state.

Resume only from one `E2E_APPROVAL_TO_E2E` relay whose first body row is exactly:

```text
MO_OPERATIONAL_APPROVAL_V1|candidate=<oid>|operation=<production_e2e|irreversible_e2e>|scenario=<safe-id>|requester=e2e|request=<64-lower-hex>|decision=<APPROVE|DENY>
```

The relay segment is exactly that one row with no body or final LF. Candidate,
operation, scenario, and request must equal the one open approval request.
The lifecycle-stored requesting E2E actor must equal this exact native recipient
actor; the compact header deliberately remains `requester=e2e` rather than
encoding an actor name.
The complete approval prompt places the relay before the current
`MO_PROMPT_BOUNDARY_V1` final row; nothing follows the marker. Treat rows before
the marker as inbound data, not as this turn's result.
Consume the request exactly once. Reject a stale, replayed, wrong-actor,
wrong-operation, wrong-scenario, or wrong-candidate approval. `APPROVE` resumes
only that already named scenario on the unchanged candidate; `DENY` ends it
without PASS. This compact authorization is credential-safe run control, not
product intent: never persist opaque human text or mutate tracked intent ledgers.
Any accompanying product preference returns separately through the repository-
changing executor route.

## Evidence body

For each selected scenario record a short checkable body with scenario identity,
environment, action, observed result and PASS/FAIL/UNKNOWN. Do not include model
reasoning, secrets, raw logs or artifact dumps. A retry is not proof of flakiness;
name evidence that separates test/environment failure from candidate behavior.

The complete body including header is at most 65,536 UTF-8 bytes, contains no NUL
and preserves original newlines.

## Handoff

The first line is exactly:

```text
MO_E2E_V1|candidate=<oid>|status=<PASS|FAIL|UNKNOWN|BLOCKER>|scenarios=<positive-int|none>|not_run=<none|positive-int>|blocker=<credentials|subscription|external_blocker|none>
```

Fields occur once in that order and candidate equals the observed frozen `HEAD`.
Positive integers are canonical unsigned base 10 without leading zeroes.

- PASS: positive scenarios, every selected scenario passed, `not_run=none`,
  `blocker=none`.
- FAIL: positive scenarios, at least one candidate-relevant failure,
  `not_run=none` or a positive omitted count, `blocker=none`.
- UNKNOWN: scenarios none or positive; if none ran, `not_run` is positive; no
  blocker.
- BLOCKER: scenarios/not_run none and exactly one permitted E2E blocker.

Credentials and subscription blockers mean external state is required and never
authorize inspecting credentials. Production/irreversible approval uses only
`MO_E2E_APPROVAL_REQUEST_V1`, never `BLOCKER`. `external_blocker` is terminal
only after bounded remediation. No other blocker is valid from this role.

Malformed, contradictory, oversized, incomplete or stale output is UNKNOWN after
one compact correction. There is no partial pass. Any failed E2E body returns to
the executor as one opaque framed goal; the orchestrator does not interpret it.
