The architecture should not be frozen yet. Four implementation-blocking defects remain: the combined prompt can exceed a common OS argument limit, ambiguous delivery is retried without positive non-delivery proof, capability proof is circularly ordered before implementation, and the no-progress guard can be evaded by allocating new finding IDs.

## Facts & Constraints (White Hat)

The specification now handles most original requirements correctly:

- exact visible Herdr topology;
- native persistent subscription-backed sessions;
- atomic Enter delivery;
- process-only orchestration;
- direct lifecycle waits;
- one atomic A+B feedback release;
- narrow blocker routing;
- autonomous model fallback;
- full-SHA gate invalidation;
- open-only backlog;
- no unsolicited documentation;
- setup and generated-output propagation;
- fixture-only support changes.

The Herdr contract supports plain `agent prompt --wait`, standalone `agent wait`, structured pane/tab IDs, and bounded `recent-unwrapped` reads.

However, Herdr documents lifecycle observation, not an exactly-once submission receipt. An unchanged lifecycle and screen fingerprint remain negative observations, not authoritative proof that no input was accepted.

## Risks & Failure Modes (Black Hat)

### Combined prompt is too large for a portable argv contract

The specification permits a 135,168-byte combined A+B Goal in one argv element.

On common Linux systems, one argument is typically limited to 131,072 bytes including its terminating NUL. The prompt can therefore fail with `E2BIG` even when total `ARG_MAX` is much larger.

Node 22 does not remove that kernel limit. The surface support key also omits OS/kernel, even though this behavior is platform-dependent.

### Fingerprint retry can duplicate an accepted turn

Two unchanged observations five seconds apart cannot prove that input did not land. Possible races include:

- accepted input queued inside the terminal or provider;
- delayed bracketed-paste processing;
- a fast turn returning to the same settled state;
- repaint restoring the same boundary;
- provider consumption beginning after the second observation.

A fixture proves tested executions, not absence across asynchronous schedules. Without a positive acknowledgement or deduplication protocol, ambiguous submission must remain at-most-once and fail closed.

This affects ordinary prompts and the combined feedback Goal, where duplicate execution could create duplicate commits or repeated irreversible work.

### Capability proof is circular

Implementation item 1 says to define and run H13–H37 before Herdr topology, lifecycle, transport, and feature-flow items are implemented.

But H13–H37 include:

- combined feedback delivery;
- blocker routing;
- replacement ID floors;
- no-progress handling;
- mutating-check behavior;
- wrapper transport;
- restart behavior;
- commit invalidation;
- peer adjudication.

Those are feature acceptance tests, not pre-existing provider capabilities. Running them against old behavior will fail, potentially triggering the instruction to stop the very implementation needed to make them pass.

Preimplementation capability proof must contain only external assumptions such as TUI capture, native Goal behavior, prompt size, lifecycle transitions, model arguments, and provider rendering. H13–H37 feature acceptance belongs after items 5–7.

### The no-progress bound is not mechanically enforceable

After a second rebuttal, the originating reviewer may close, dispute, or create a “genuinely new finding.”

The orchestrator cannot determine whether a new ID represents a genuinely new issue without interpreting finding meaning, which is forbidden. A reviewer can repeatedly restate the same issue under fresh IDs:

```text
A-1 -> A-2 -> A-3 -> ...
```

Because the canonical event key includes `open-ids`, each new ID changes the key and evades the repeated-event guard. The claimed bounded resolution loop is therefore not actually bounded.

Use a mechanical round limit or force adjudication of every still-open rebutted ID regardless of any additional new IDs.

### Relay framing is still not a complete interface

The specification delegates the exact frame format to an eventual fenced recipe. It does not normatively define:

- frame token order;
- source and candidate fields;
- byte-length syntax;
- delimiter collision handling;
- total fixed overhead;
- adjudication input framing;
- damaged-frame acknowledgement.

Extracting and testing whatever recipe the implementer writes proves internal consistency, not conformance to a predetermined protocol.

### Adjudication input has no bound

Adjudication output is capped, but the “finding and exchange” sent to the peer has no exact selection or size rule. An origin review plus executor response can approach or exceed the same unsafe single-argument boundary.

## Strengths & Benefits (Yellow Hat)

The revised design has resolved many difficult concerns:

- Multi-batch review delivery was removed.
- Both reviewer handoffs now cross the barrier atomically.
- Transport `UNKNOWN` preserves known evaluation fields.
- Generic provider questions do not wake the human.
- Product questions use validated blocker metadata.
- Live extraction incidents do not revoke support.
- Reviewer recovery carries its ID floor.
- Pane badges are non-gating.
- Branch syntax is explicit.
- Native Goal transitions avoid an invented suspension mechanism.
- Posture probing has a real consumer.
- Licence mappings are explicit and checked against esbuild metadata.
- The accepted scratch-residue exposure is recorded honestly in backlog.
- Implementation adoption requires one unchanged SHA with complete evidence.

The role firewall, topology, candidate semantics, and review ordering are now particularly strong.

## Alternatives & Creative Ideas (Green Hat)

Set one portable framed-prompt ceiling, such as 120 KiB including Goal, wrappers, bodies, and terminating NUL. Derive reviewer limits from that total rather than allowing two independent 64 KiB bodies.

Make OS/architecture part of the support key if platform-specific ceilings are intentionally supported.

For ambiguous submission, keep the status and fingerprint observations for diagnosis but never use them to authorize retry. Return a harness-capability `needs_attention`.

Split verification into:

1. Preimplementation provider-capability fixtures: topology commands, lifecycle transitions, TUI boundaries, Goal inactivity, model arguments, prompt-size limit.
2. Postimplementation H13–H37 feature acceptance.

For finding loops, use a fixed mechanical policy, for example:

- one executor rebuttal;
- one origin response;
- if the original ID remains open, adjudicate it immediately;
- new IDs do not reset the original ID’s resolution counter.

## Completeness & Process (Blue Hat)

### Traceability

The Decision Ledger exists and adopted/rejected/deferred choices mostly appear in the body.

Traceability problems remain:

- “Architecture is frozen” and “no remaining architectural defect” are ledger decisions contradicted by unresolved transport and sequencing contracts.
- Combined A+B delivery is adopted without a portable argv-limit decision.
- Fixture-proven retry is adopted without positive acknowledgement semantics.
- “Genuinely new finding” has no mechanical ledger rule compatible with the semantic firewall.
- Adjudication input framing and size have no ledger entry.

### Decomposition Readiness

Items 2–5 and 7 are mostly decomposable.

Items 1 and 6 are not:

- Item 1 mixes external capability proof with tests of unimplemented behavior.
- Item 6 still requires frame grammar, platform byte limits, fingerprint definition, and adjudication packaging.

### Weak-Model Executability

A weaker model could implement most topology, catalogue, schema, lifecycle, documentation, and candidate behavior.

It would still have to invent:

- a portable prompt ceiling;
- exact frame grammar;
- safe ambiguity semantics;
- the split between capability and acceptance fixtures;
- adjudication input selection;
- a semantic-free resolution-loop bound.

### Contract Completeness

Most schemas, dependencies, retry budgets, and tests are specific. The remaining omissions are core interfaces, not ordinary implementation details.

The architecture-freeze section should be removed until these contracts are resolved.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "The specification now strongly satisfies the original topology, visibility, warm-session, thin-orchestrator, lifecycle-waiting, candidate, model-catalogue, blocker, backlog, and documentation requirements. It should not be frozen or adopted yet because the combined A+B argv can exceed a common Linux per-argument limit, fingerprint-based negative observations cannot safely authorize retry, preimplementation capability proof circularly includes unimplemented feature behavior, and the supposedly bounded finding loop can be evaded through fresh IDs without semantic interpretation.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "Prompt size",
          "description": "The permitted 135,168-byte combined Goal can exceed the typical Linux MAX_ARG_STRLEN limit of 131,072 bytes including NUL.",
          "required_change": "Define a portable total framed-prompt ceiling below the minimum supported per-argument limit, reduce reviewer limits accordingly, or include OS/kernel in the support key and fixture the exact limit."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Submission safety",
          "description": "Unchanged lifecycle, process, and TUI fingerprints are negative evidence and cannot prove asynchronous input was never accepted. Retrying may duplicate a live turn.",
          "required_change": "Remove ambiguity retries unless Herdr supplies a positive non-delivery acknowledgement or an end-to-end deduplication mechanism."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Verification sequencing",
          "description": "Capability-proof item 1 requires running H13–H37 even though many scenarios depend on topology, transport, and feature-flow behavior implemented only in items 5–7.",
          "required_change": "Separate preimplementation external-capability fixtures from postimplementation feature acceptance; run H13–H37 only after the corresponding behavior exists."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Resolution boundedness",
          "description": "A reviewer may evade the repeated-event guard by restating the same semantic issue under a fresh ID. The orchestrator cannot decide whether the finding is genuinely new without violating its role firewall.",
          "required_change": "Use a mechanical per-ID or per-candidate round limit; new IDs must not reset adjudication of an already rebutted still-open ID."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Transport contract",
          "description": "Combined-review and adjudication frames have no exact normative grammar, fixed overhead, collision rule, or input-size contract.",
          "required_change": "Specify the complete versioned frame grammar and portable byte bounds, including the exact adjudication exchange subset."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Native Goal lifecycle",
          "description": "Idle/done is a Herdr readiness state, not a native Goal status; the fixture lacks a defined quiet-period duration.",
          "required_change": "Specify the observation window and spontaneous-resume failure condition."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Barrier wording",
          "description": "The A-mutating-check short circuit releases A without B despite the Purpose stating an unconditional two-pass barrier.",
          "required_change": "Document this invalidated-candidate exception in the normative barrier rule."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Architecture status",
          "description": "The architecture-freeze declaration prevents implementation from correcting unresolved protocol defects.",
          "required_change": "Mark the design pending final resolution rather than frozen."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Model fallback",
          "description": "Canonical same-route role order remains referenced but not enumerated.",
          "required_change": "Name the exact ordered role list or its existing normative schema."
        }
      ],
      "assumptions": [
        "The supported deployment set includes Linux or another platform with an approximately 128 KiB single-argument limit.",
        "Herdr provides no positive non-delivery acknowledgement beyond lifecycle and terminal observations.",
        "No prior council artifact under spec/** was inspected or reused.",
        "H13–H37 describe feature behavior that does not exist before implementation items 5–7."
      ],
      "round": 2,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 6
would_adopt: false
