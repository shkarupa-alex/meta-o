The “architecture frozen” declaration is not supported by the contract itself. Concrete contradictions remain, so correcting them qualifies under the specification’s own architecture-change threshold.

## Facts & Constraints (White Hat)

The design now handles the original product intent well:

- exact visible executor/reviewer topology;
- native warm Herdr sessions;
- process-only orchestration;
- atomic Enter;
- lifecycle rather than SHA waiting;
- one combined A+B feedback release;
- narrow blocker routing;
- autonomous model selection;
- full-SHA gate invalidation;
- backlog and documentation discipline;
- generated skill and setup propagation;
- fixture-bound support claims.

Herdr supports the selected basic surfaces: plain `agent prompt --wait`, non-submitting `agent wait`, structured creation responses, and `recent-unwrapped` reads.

It does not document a positive non-delivery acknowledgement. Lifecycle and terminal fingerprints are observations, not an exactly-once submission protocol.

## Risks & Failure Modes (Black Hat)

### Combined prompt exceeds a common OS limit

The contract permits a 135,168-byte combined A+B Goal in one argv element.

On common Linux systems, one argument is typically limited to 131,072 bytes including its terminating NUL. The specified maximum can therefore fail with `E2BIG`.

This is an exact contradiction between the transport contract and the claimed portable Node 22 runtime. Quoting details cannot fix a kernel argument limit.

### Negative evidence cannot prove non-delivery

The contract treats two unchanged lifecycle/process/fingerprint observations as proof that input did not land.

That conclusion does not follow in an asynchronous system. Input may be:

- accepted but queued;
- buffered by bracketed paste;
- consumed after the observation window;
- processed in a fast turn that returns to the same state;
- obscured by repaint.

A fixture can show that tested executions behaved safely. It cannot prove the absence of all delayed-delivery schedules. Retrying can duplicate an accepted Goal, commit-producing turn, or irreversible request.

### Capability proof is circularly sequenced

Implementation item 1 requires running H13–H37 before items 5–7 implement the behavior those scenarios test.

H13–H37 include feature behavior such as:

- combined feedback delivery;
- blocker routing;
- ID-floor recovery;
- mutating-check handling;
- no-progress enforcement;
- wrapper transport;
- restart and invalidation;
- adjudication.

Failure of old behavior can therefore stop the implementation required to make those tests pass. External provider capability fixtures must be separated from postimplementation feature acceptance.

### The response loop is not mechanically bounded

A second rebuttal forces the origin reviewer to close, dispute, or create a “genuinely new finding.”

The orchestrator cannot determine whether a fresh ID is genuinely new without interpreting finding meaning. A reviewer can restate the same issue under `A-2`, `A-3`, and so on. Because `open-ids` changes, the canonical event key also changes and the no-progress guard does not fire.

The contract either requires forbidden semantic judgment or fails to provide its claimed bound.

### Relay framing remains undesigned

The exact combined frame is still delegated to implementation. Missing normative details include:

- field order;
- candidate and source binding;
- byte-length representation;
- delimiter placement and collision handling;
- fixed overhead;
- damaged-frame response;
- adjudication input framing and maximum size.

Testing the eventual fenced recipe proves that implementation is internally consistent, not that it conforms to a previously specified interface.

### Adjudication input remains unbounded

The adjudication output is compact, but the disputed “finding and exchange” supplied to the peer has no exact selection or total-byte limit. The review plus executor rebuttal may itself approach or exceed the unsafe argv ceiling.

## Strengths & Benefits (Yellow Hat)

Most earlier design risks are now handled soundly:

- Review V1 is single-body.
- A+B feedback crosses the barrier atomically.
- Transport `UNKNOWN` preserves known evaluation values.
- Generic question UIs do not wake the human.
- Product questions use a validated `BLOCKER`.
- Live extraction incidents do not revoke support.
- Reviewer recovery carries the ID floor.
- Badges are non-gating.
- Branch syntax is exact.
- Scratch residue is honestly recorded as open work.
- Model bundling, licence mapping, isolation, and posture consumption are concrete.
- Adoption requires one unchanged SHA with complete deterministic, review, and E2E evidence.

The role firewall and candidate invalidation model are particularly strong.

## Alternatives & Creative Ideas (Green Hat)

Use a portable total combined-prompt ceiling such as 120 KiB, including the Goal, frames, bodies, and terminating NUL. Derive each reviewer limit from that total.

Define the exact frame in the specification, for example:

```text
MO_PEER_FRAME_V1|candidate=<oid>|source=<reviewer-A|reviewer-B>|bytes=<n>|delimiter=<hex>
<exact bytes>
<delimiter>
```

Regenerate the delimiter if it appears in the captured body.

For ambiguity, retain state/fingerprint observations for diagnosis but never use them to authorize resubmission. Without a positive Herdr acknowledgement or end-to-end deduplication, return harness `needs_attention`.

Split verification into:

1. Preimplementation capability probes: public commands, TUI boundaries, lifecycle transitions, Goal inactivity, model arguments, portable prompt size.
2. Postimplementation H13–H37 acceptance.

Bound finding resolution mechanically: once a rebutted ID remains open after the origin’s next response, adjudicate that ID regardless of any additional IDs introduced.

## Completeness & Process (Blue Hat)

### Traceability

The ledger is extensive and most decisions appear in normative sections.

Remaining traceability defects:

- “Architecture frozen” conflicts with unresolved transport and sequencing contradictions.
- The adopted combined Goal has no portable argv-limit decision.
- The adopted negative-proof retry exceeds Herdr’s documented guarantees.
- “Genuinely new finding” lacks a semantic-free enforcement rule.
- Adjudication input framing and size lack ledger decisions.

### Decomposition Readiness

Items 2–5 and most of item 7 are decomposable.

Items 1 and 6 are not:

- Item 1 mixes provider capability proof with acceptance of unimplemented behavior.
- Item 6 leaves frame grammar, platform byte limits, ambiguity safety, and adjudication packaging to the implementer.

### Weak-Model Executability

A weaker model can implement most topology, lifecycle, schema, catalogue, candidate, blocker, and documentation behavior.

It must still invent:

- a portable prompt ceiling;
- exact frame syntax;
- safe ambiguity behavior;
- preflight-versus-acceptance fixture separation;
- adjudication packaging;
- a semantic-free resolution bound.

### Contract Completeness

Most limits, dependencies, schemas, and error cases are specific. The remaining omissions affect core correctness rather than local implementation style.

The specification’s own test for reopening architecture is satisfied: these are concrete contradictions with transport safety, boundedness, and decomposition.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "The specification strongly captures the requested visible warm Herdr workflow, thin orchestrator, lifecycle waiting, review barrier, blocker routing, model discovery, candidate invalidation, and project discipline. It cannot yet be frozen or adopted because its 135,168-byte single argv element exceeds a common Linux limit, fingerprint observations cannot prove ambiguous input was not accepted, capability proof circularly includes unimplemented H13–H37 behavior, fresh finding IDs evade the semantic-free no-progress guard, and combined-review/adjudication framing remains unspecified.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "Prompt transport",
          "description": "The permitted 135,168-byte combined Goal can exceed the typical Linux 131,072-byte single-argument limit including NUL.",
          "required_change": "Set a portable total framed-prompt ceiling below the minimum supported per-argument limit, reduce reviewer limits accordingly, or explicitly scope and fixture support by OS/kernel."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Submission safety",
          "description": "Unchanged lifecycle, process, and terminal fingerprints are negative observations and cannot prove that asynchronous input was never accepted. Retrying can duplicate a live turn.",
          "required_change": "Remove ambiguity retries unless Herdr supplies a positive non-delivery acknowledgement or an end-to-end deduplication mechanism."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Verification sequencing",
          "description": "Implementation item 1 runs H13–H37 before items 5–7 implement many of the behaviors those scenarios verify, making the stop condition circular.",
          "required_change": "Separate preimplementation external-capability probes from postimplementation feature acceptance and run H13–H37 only after the relevant behavior exists."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Resolution boundedness",
          "description": "A reviewer can evade the repeated-event guard by restating the same issue under a new ID. The orchestrator cannot determine whether it is genuinely new without forbidden semantic interpretation.",
          "required_change": "Adjudicate every rebutted ID that remains open after the origin's next response; additional new IDs must not reset that ID's mechanical resolution counter."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Framing contract",
          "description": "Combined review and adjudication input frames have no exact normative grammar, fixed overhead, collision rule, or portable total-byte bound.",
          "required_change": "Specify the complete versioned frame grammar and the exact bounded adjudication exchange subset before implementation."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Native Goal lifecycle",
          "description": "Herdr idle/done is readiness rather than native Goal status, and the inactivity fixture has no defined quiet-period duration.",
          "required_change": "Specify the observation window and spontaneous-resume failure condition."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Barrier semantics",
          "description": "The A-mutating-check shortcut releases A without B despite the Purpose stating an unconditional two-pass release rule.",
          "required_change": "State the invalidated-candidate shortcut as an explicit normative exception."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Architecture status",
          "description": "The freeze declaration and ledger claim no remaining architectural defect despite concrete unresolved protocol contradictions.",
          "required_change": "Return the status to pending final architecture review until the blocking contracts are corrected."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Model fallback",
          "description": "The same-route canonical role order remains unnamed.",
          "required_change": "Enumerate the role order or cite one existing normative ordered schema."
        }
      ],
      "assumptions": [
        "The supported deployment set includes Linux or another platform with an approximately 128 KiB single-argument limit.",
        "Herdr provides no positive non-delivery acknowledgement beyond lifecycle and terminal observations.",
        "No prior council artifact under spec/** was inspected or reused.",
        "H13–H37 include feature behavior unavailable before implementation items 5–7."
      ],
      "round": 3,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
