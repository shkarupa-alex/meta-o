# Complete handoffs stay on public backend surfaces

Because _one model is not enough_, _a feature must be verifiably done_, and the
orchestrator must remain a process controller rather than a second engineer.

## The problem

The review gate is only sound when the executor receives every byte of each
independent review. A viewport tail can look complete while omitting a later
finding, and letting the orchestrator interpret a review would replace the
reviewer's judgement with an unreviewed semantic filter. Private provider
transcripts solve neither problem: they are unstable implementation details and
can silently identify a different session.

The same boundary protects the feature context. After backend-skill activation,
the task locator and every tracked project file belong to repository-reading
actors. The orchestrator may observe only narrow Git metadata, actor and pane
identity, public lifecycle state, and validated process headers.

## The decision

Each backend uses only its own public actor surface to obtain a complete compact
handoff.

- Herdr actors are visible ordinary interactive subscription CLIs started with
  `herdr agent start`. Herdr public lifecycle and `recent-unwrapped` rendering
  provide the transport evidence described in
  `src/skills/mo-herdr/references/herdr-mechanics.md`.
- Omnigent preserves the same process-only firewall and compact-handoff
  semantics through its native agent model. Herdr panes, TUI extraction and
  command mechanics do not leak into `mo-omnigent`.

Herdr has no direct provider, `pane run`, inline, headless, SDK-turn,
verdict-file, completion-sentinel, manual-attach, private-transcript or
executor-pane-reading fallback. Losing a supported public boundary makes the
handoff `unknown`; pressure to finish never turns that into a partial pass.

## What makes a compact handoff complete

Completeness has two independent pieces:

1. one exact role-specific process header with valid syntax and state semantics;
2. the fixture-proven provider lower boundary showing that the rendered turn
   settled after that header and its body.

The submitted-prompt neighborhood is fingerprinted before the turn. After
settlement, Herdr reads `recent-unwrapped` adaptively through the measured
120/200/400/800/1000-row envelope. The interval after that prompt and before the
new structural lower boundary is accepted only when continuity, identity and
exactly one expected header are unambiguous. If the prompt has scrolled out, an
exactly-one-header fallback is allowed only for a
backend/provider/version/surface key whose isolated fixture proves it.

A glyph by itself is never a boundary. A missing, duplicate, stale,
contradictory, oversized or unreadable boundary or header is `unknown`, as are
invalid UTF-8, NUL, role/candidate mismatch and unproven multipart accounting.
One compact correction can repair actor noncompliance; it cannot repair an
unproven surface.

## Opaque transport

Extraction copies the validated process header and body byte-for-byte into a
private temporary directory outside the repository. Only the header enters
orchestrator context. Review bodies remain opaque: the orchestrator does not
filter, rank, merge, paraphrase, validate or decide them.

Scratch directories use one fixed project-owned prefix containing no task,
actor, model or pane data, mode `0700`, with body files at `0600`. Controlled
exits delete only the known current directory. A new run never discovers,
adopts or deletes prior scratch; hard-crash residue is an explicit open
limitation rather than a hidden recovery protocol.

Every permitted handoff uses an explicit `MO_RELAY_V2` direction. The complete
first-pass pair, failed E2E, A-only invalidating check, executor response,
adjudication request, peer outcome, and post-human decision each bind one phase,
recipient, source, candidate, and target ID. Executor-bound work uses one atomic
native goal; reviewer-bound work is one ordinary prompt. The relay uses a
collision-checked random frame, declared raw UTF-8 byte lengths and a literal
AST-tested Node recipe that invokes `herdr` with argument arrays and
`shell: false`. It prints neither bodies, argv nor raw spawn results. Recipients
validate frame lengths before treating any enclosed bytes as work.

Ambiguous submission or relay delivery is never blindly retried. A changed
public signal means the turn may be live and must be awaited; unchanged or
contradictory evidence is harness-capability attention unless a future public
positive non-delivery acknowledgement or end-to-end deduplication protocol
exists.

## Candidate and support consequences

Every header and gate names the same full commit object. `HEAD` or cleanliness
changing during review invalidates the affected evidence, and any new commit
invalidates every gate and open finding ID. A transport-`UNKNOWN` handoff remains
unknown even if check fields retained from a readable prefix say `PASS`.

Support belongs to the exact backend/provider/version/surface fixture key.
Actor prose or an incidental live failure cannot grant or revoke it. P1-P8 prove
installed external capability only; H7b and H13-H37 prove the implemented
post-cutover surface on one named unchanged candidate SHA.

## Rejected

- **Provider-private transcripts, hooks, session databases or goal stores.**
  They are not the public surface and can silently select the wrong turn.
- **Inline/headless capture or direct provider invocation.** It loses the
  visible native lifecycle required for supported Herdr actors.
- **A model-written completion marker or verdict file.** It proves cooperation,
  not complete retrieval, and introduces a persisted protocol with no consumer.
- **Orchestrator semantic extraction.** Reviewers own findings and
  applicability; transport must not become an engineering opinion.
