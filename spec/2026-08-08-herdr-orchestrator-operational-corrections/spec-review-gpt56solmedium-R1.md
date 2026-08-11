The specification now resolves the earlier review-flow, `UNKNOWN`, blocking, route-support, recovery-ID, badge, and branch-contract problems. I still would not adopt it unchanged because its maximum combined prompt exceeds a common OS argv limit, and its “proven safe” retry relies on negative observations that cannot prove non-delivery in an asynchronous terminal.

## Facts & Constraints (White Hat)

The revised design is much closer to implementation-ready:

- Reviews are single-handoff V1 messages.
- A and B feedback is delivered together in one new executor Goal.
- Transport, environment, and evaluation `UNKNOWN` semantics are separated.
- Generic Herdr questions no longer wake the human.
- Live extraction incidents no longer revoke route support.
- Replacement reviewers receive the finding-ID floor.
- Pane badges are best-effort.
- The feature-branch regex is exact.
- Native Goal activation and reactivation are described without inventing a suspend command.
- Posture probing now has a named runtime consumer.
- Backlog handling covers the accepted scratch-residue limitation.
- The impact inventory and traceability are comprehensive.

Herdr’s public semantics support plain `agent prompt --wait`, non-submitting `agent wait`, structured topology results, and `agent read --source recent-unwrapped`.

## Risks & Failure Modes (Black Hat)

### Combined feedback exceeds a common single-argument limit

The maximum combined A+B Goal is 135,168 bytes in one argv element.

On common Linux systems, one argument is limited by `MAX_ARG_STRLEN`, typically 131,072 bytes including its terminating NUL. The proposed maximum can therefore fail with `E2BIG` even when the process-wide `ARG_MAX` is much larger.

This is not covered by requiring Node 22. Either:

- reduce the total framed prompt below the minimum supported per-argument ceiling;
- make OS/kernel part of the surface support key and fixture the exact limit; or
- use a Herdr stdin/file prompt interface if one exists.

The adjudication input has a related missing bound. An originating review plus one or more executor rebuttals can exceed a single safe argv element even though the adjudication output itself is capped.

### Negative observations do not prove prompt non-delivery

The specification permits retry when two observations show unchanged lifecycle, foreground process, and input-boundary fingerprint.

In an asynchronous terminal, unchanged observations cannot prove that input did not land. Examples include:

- input accepted but queued;
- bracketed paste accepted but not yet rendered;
- a very fast turn returning to the same settled state;
- repaint restoring an identical boundary neighborhood;
- delayed provider consumption after the second observation.

A fixture can demonstrate the expected behavior for tested schedules, but it cannot convert absence of observed change into proof of non-delivery. Retrying can duplicate an accepted irreversible or implementation turn.

Without an acknowledgement or deduplication token, ambiguous acceptance should remain fail-closed.

### Framing remains underspecified

The specification says the Node recipe creates separately labelled, length-framed bodies, but does not give the normative frame grammar:

- exact label tokens and order;
- decimal length syntax;
- delimiter syntax;
- candidate and reviewer binding;
- handling if the random delimiter appears in a body;
- adjudication framing;
- maximum goal/wrapper overhead;
- the exact executor response to a declared-length mismatch.

Tests extracted from the eventual implementation only prove that implementation is self-consistent; they do not prove it implemented a predetermined contract. A weaker implementer must still design the interface.

### Native Goal inactivity is inferred from idle lifecycle

Herdr defines `idle` and `done` as readiness states, not native Goal lifecycle states. The specification relies on a provider fixture to prove that idle after a candidate means no further Goal turn will be scheduled.

That is an acceptable fail-closed empirical gate only if the fixture observes a defined quiet period and spontaneous transition behavior. An instantaneous idle observation is insufficient. The required duration and failure criterion are currently absent.

### Mutating-check shortcut contradicts the unconditional barrier statement

The Purpose says review bodies reach the executor only after both first passes finish. Later, a mutating reviewer-A check permits A’s body to reach the executor without running B.

That shortcut is operationally reasonable because the candidate is no longer frozen, but it is a normative exception and must appear in Purpose/invariants rather than only deep in the flow.

## Strengths & Benefits (Yellow Hat)

The central product requirements are now handled well:

- visible native sessions;
- exact pane placement;
- warm-session economics;
- no hidden provider fallback;
- no orchestrator repository reading;
- no semantic review interpretation;
- atomic Enter;
- direct lifecycle waits;
- autonomous model selection;
- narrow human involvement;
- clean candidate and full-object-ID verification;
- open-only backlog;
- no invented narration documents.

The one-combined-feedback Goal is a strong simplification over buffered multi-batch delivery. It preserves the first-pass barrier and prevents premature executor mutation.

The separation of valid actor `BLOCKER` handoffs from provider-native blocked UI is also sound. It gives product questions a mechanically routed path without letting the orchestrator read or paraphrase them.

The distinction between actor noncompliance, a live route incident, and fixture-proven route incapability is now architecturally correct.

The implementation decomposition is generally coherent, with capability proof before Herdr route work and independently deliverable backend-neutral/catalogue increments.

## Alternatives & Creative Ideas (Green Hat)

Set a portable combined-prompt ceiling, for example 120 KiB total including Goal and both frames. Derive each reviewer maximum from the fixed wrapper overhead rather than assigning 64 KiB independently.

Define one exact frame such as:

```text
MO_PEER_FRAME_V1|candidate=<oid>|source=reviewer-A|bytes=<n>|delimiter=<hex>
<exact n UTF-8 bytes>
<delimiter>
```

The sender should regenerate the delimiter if it occurs in the captured body, even though a 128-bit accidental collision is extremely unlikely.

For prompt ambiguity, retain the observations for diagnosis but never use them to authorize retry. Return `needs_attention` with actor/pane location and no ordinary choice. This preserves at-most-once behavior.

For native Goal inactivity, define a fixture observation window longer than the longest expected automatic continuation delay and fail the provider surface if it resumes without a new prompt.

For adjudication, impose a separate compact-input contract: one finding frame, one latest response frame, and one dispute frame, all within the portable combined ceiling. Earlier prose should be semantically compacted by the originating reviewer, not by the orchestrator.

## Completeness & Process (Blue Hat)

### Traceability

The Decision Ledger exists and adopted, rejected, superseded, and deferred decisions are generally reflected in the body.

Remaining gaps:

- Fixture-proven ambiguous retry is adopted, but its safety assumption is stronger than Herdr’s documented contract.
- Combined A+B relay is adopted without a portable argv-limit decision.
- The mutating-A short-circuit is not represented as an exception to the adopted first-pass barrier.
- Adjudication input framing and size have no ledger decision.
- `docs/business.md` is now correctly included in Scope, and `my-opinion.md` is correctly classified as a source reference.

### Decomposition Readiness

Items 1–5 and 7 are decomposition-ready.

Item 6 still requires new interface decisions:

- exact frame grammar;
- portable total argv ceiling;
- adjudication input bounds;
- delimiter collision behavior;
- Goal-inactivity observation window;
- whether ambiguity is at-most-once failure or retryable.

Those decisions must precede implementation.

### Weak-Model Executability

A weaker model can implement most of the specification without architectural guessing. It still cannot safely choose:

- the wrapper grammar;
- portable byte limits;
- adjudication packaging;
- fingerprint algorithm;
- Goal quiet-period duration;
- why negative evidence is sufficient to retry.

### Contract Completeness

Most schemas, thresholds, dependencies, error cases, and tests are now unusually specific.

The remaining incomplete contracts are material: portable prompt sizing, exact framing, adjudication input, and native-Goal/ambiguous-submission timing. The Open Questions assertion is therefore still too strong.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "The specification now resolves the major role, topology, review-barrier, UNKNOWN, blocker, recovery, route-support, model-catalogue, backlog, and traceability problems and closely matches the original task. Adoption remains blocked because the 135,168-byte combined Goal can exceed the common Linux single-argument ceiling, unchanged state and TUI fingerprints cannot prove that an ambiguous prompt was not accepted, and the exact combined-review and adjudication framing contracts remain for the implementer to invent.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "Prompt size portability",
          "description": "The maximum combined A+B Goal is 135,168 bytes in one argv element, exceeding the typical Linux MAX_ARG_STRLEN limit of 131,072 bytes including NUL.",
          "required_change": "Define a portable total prompt ceiling below the minimum supported per-argument limit, reduce per-reviewer limits accordingly, or make OS/kernel part of the support key and fixture the exact argv ceiling."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Ambiguous submission",
          "description": "Two unchanged lifecycle/process/fingerprint observations are negative evidence, not proof that asynchronous terminal input was never accepted. Retrying can duplicate a live turn.",
          "required_change": "Do not retry ambiguous prompt or relay acceptance without a positive acknowledgement or deduplication mechanism; retain state/fingerprint observations only for diagnosis."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Transport framing",
          "description": "The combined review wrapper is described behaviorally but has no exact grammar, delimiter collision rule, fixed overhead, candidate/source binding syntax, or normative damaged-frame response.",
          "required_change": "Specify the complete versioned frame grammar and add independent data fixtures defined from that contract rather than extracted only from the eventual implementation."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Adjudication input",
          "description": "Adjudication output is bounded, but the complete disputed exchange sent to the peer has no framing, selection, or total-byte contract and can exceed one safe argv element.",
          "required_change": "Define exactly which finding, response, and dispute frames are sent for adjudication and cap their combined framed size within the portable prompt limit."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Native Goal lifecycle",
          "description": "Herdr idle/done denotes readiness, not native Goal completion; the fixture lacks a defined quiet-period duration proving that no automatic continuation follows.",
          "required_change": "Specify the observation window and spontaneous-resume failure criterion for Goal-inactivity fixtures."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Barrier semantics",
          "description": "The reviewer-A mutating-check short circuit relays A without B despite the Purpose stating that review bodies are delivered only after both first passes.",
          "required_change": "Add the invalidated-candidate short circuit as an explicit normative exception or relay only the dirty-tree process fact."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Extraction contract",
          "description": "The fingerprint algorithm and exact recent-unwrapped structured output field remain unspecified.",
          "required_change": "Define the bytes hashed, hash algorithm, output field, and normalization rules in Herdr mechanics."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Model fallback",
          "description": "Canonical role order is referenced but not enumerated in this specification.",
          "required_change": "Name the exact role order or point to one existing normative ordered schema."
        }
      ],
      "assumptions": [
        "The deployment target includes Linux or another platform where a single argv element may be limited to approximately 128 KiB.",
        "Herdr lifecycle and boundary observations do not provide a positive non-delivery acknowledgement beyond the documented agent_prompt_stalled behavior.",
        "No prior council artifact under spec/** was inspected or reused.",
        "The existing native Goal mechanism may schedule an automatic continuation after a transient idle state unless a fixture proves otherwise."
      ],
      "round": 1,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
