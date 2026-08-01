# Architecture — knowledge as a checkable chain

## §A-CAUSAL-KNOWLEDGE — Anchors form a chain, and each level cites the one above it

Implements §B-KNOWLEDGE-01.

Knowledge is stored as anchored sections with a strict causal shape:

```text
§B-* business truth  →  §A-* architecture decision  →  §M-* module purpose  →  symbol
```

Every `§A-*` cites at least one `§B-*`; every `§M-*` cites its nearest `§A-*`
and not a `§B-*` directly (`src/core/knowledge.mts`). The nearest-level rule is
the one that does the work: a module citing business truth directly has skipped
the decision that connects them, and that decision is exactly what someone
changing the module needs to find.

Anchors are defined by headings only. A mention in prose is a reference and a
mention inside a fenced block is an example, so a tutorial cannot accidentally
redefine an anchor.

The checks are mechanical — uniqueness, resolvability, nearest level — and
deliberately say nothing about whether a purpose is well written. That judgement
belongs to reviewers, and a checker that pretended to make it would produce
docstrings written for the checker.

While planning, intended knowledge changes live in the run's
`KnowledgeImpactPlan` rather than as placeholder anchors in the real documents.
On abort there is then nothing to clean up — and, usefully, the anchor checker
treats a placeholder as the dangling reference it is, so the shortcut fails
loudly rather than accumulating.

## §A-CONTRACT-TYPES — One typed module holds every shape crossing a boundary

Implements §B-KNOWLEDGE-01.

`src/core/types.mts` declares every interface the workflow exchanges: run state,
findings, plans, capability grades, adapter contracts. Nothing crossing a
boundary is typed inline at the call site.

The reason is drift. These shapes are written by a CLI, read by a prompt, and
re-read by a different process after a crash; the moment two modules each hold
their own idea of `RunState`, recovery starts working by luck. One declaration
also makes the deviations visible and reviewable — the three additions this
implementation makes over the master spec (`Role: "orchestrator"`,
`RunState.orchestratorSession`, `PendingOperation.probe`) are documented where
they are declared, not buried in a changelog.
