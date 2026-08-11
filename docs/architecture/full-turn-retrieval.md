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
exactly one expected header are unambiguous. Every submitted prompt, goal and
relay contains the exact current-turn marker
`MO_PROMPT_BOUNDARY_V1|fingerprint=<64-lower-hex>` as its final row, after every
objective, capsule and inbound relay byte. Only the interval after that marker
and before the new structural lower boundary is eligible actor output, so echoed
inbound protocol rows cannot collide with the single-result-header check. The
marker must match the fingerprint recorded before submission; there is no
marker-free or exactly-one-header fallback.

A glyph by itself is never a boundary. The current authored Claude/Codex lower
boundary literals and golden captures are synthetic provisional inputs until
P6/H17 confirms or replaces their exact bytes for installed provider versions.
A missing, duplicate, stale,
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

Every permitted handoff uses an explicit `MO_RELAY_V2` direction. At the
first-pass barrier a PASS/PASS pair proceeds to E2E without relay; if at least
one evaluation has findings, the complete A/B pair is released atomically.
An executor `RESPONSE` is valid only when its `rebuts` equals the complete
current open-ID set for exactly one origin. One complete origin outcome then
partitions that exact rebuttal set across disjoint `closes` and `disputes`.
All-close/no-new is `PASS`; close-all-plus-new is `FOLLOWUP`; mixed old-ID
outcomes use `OUTCOMES`; all-dispute uses `DISPUTED`. After canonical validation,
an `OUTCOMES` header's post-outcome `open` is byte-identical to `disputes`, so it
cannot retain a closed ID, omit a disputed ID, or add an unrelated open ID. Only
`FOLLOWUP` uses `ORIGIN_FINDINGS_TO_EXECUTOR`. Different origins use separate
settled turns, and a mixed-origin response is rejected rather than split or
interpreted.

Finding suffixes are unbounded canonical positive decimals. Protocol consumers
require one complete A block followed by one complete B block, with strictly
increasing exact `BigInt` suffix order inside each block. Reviewer-origin lists
have one prefix only. `Number`, unary numeric coercion, and lexicographic suffix
comparison cannot preserve this invariant and are forbidden.
No-progress-key construction canonicalizes its internal global open-ID set this
way before serialization. Raw set iteration and caller order are forbidden, so
equivalent permutations produce one key.

Multi-ID adjudication requests remain sequential, but terminal delivery is
total and atomic. The canonical target set is the validated origin outcome's
exact `disputes`; the full `RESPONSE.rebuts` remains only the set partitioned by
`closes` and `disputes`. Wait until every disputed target has a valid peer
result. If at least one is `UPHOLD`, relay all N ordered `UPHOLD|WITHDRAW` bodies
together to the executor with that exact `disputes` outer ID list. If all are
`WITHDRAW`, relay all N together to the origin with the same list. `UNRESOLVED`
reaches the human; no per-ID terminal relay is released early.
The retained peer bodies for one set have one header-inclusive cumulative
122,880-byte UTF-8 ceiling. Each request names the exact remaining aggregate
budget and caps its next complete body at `min(65536, remaining)`; prior bodies
are never truncated, discarded, summarized, or excluded from the subtraction.
Oversize is rejected before acceptance, and its one compact retry receives the
same remaining value.
Herdr supplies that canonical value to extraction as `peerOutcomeRemaining`
immediately after `expectedOpen` and supplies `none` for every other protocol.
In relay argv, `expectedOpen` remains full `RESPONSE.rebuts`, the following
`aggregateTargets` equals validated `disputes` for request/aggregate routes and
is `none` otherwise, and `peerOutcomeRemaining` follows it. Omnigent binds the
equivalent values through native lifecycle state.
Before accepting the first peer result, both possible final aggregate envelopes
are projected from exact routing inputs and only that `disputes` set/count, with
every body-length field rendered as `bytes=65536`. The larger body-excluded
envelope must fit 7,168 bytes. Final submission rechecks that projection plus
exact cumulative bodies against the 130,048-byte complete-payload ceiling.

Failed E2E, the A-only invalidating check, executor response, adjudication
request, peer outcome, repository-changing human answer, candidate-stable E2E
approval, and post-human decision each bind
one phase, recipient, source, candidate, and target ID/set. Executor-bound work uses one atomic native
goal; reviewer-bound work is one ordinary prompt. The relay uses a
collision-checked random frame, declared raw UTF-8 byte lengths and a literal
AST-tested Node recipe that invokes `herdr` with argument arrays and
`shell: false`. It prints neither bodies, argv nor raw spawn results. Recipients
validate frame lengths before treating any enclosed bytes as work.

The relay recipe returns 0 only for a successful Herdr invocation, 1 only for a
positive pre-spawn rejection where no delivery was attempted, and 2 once an
invocation was attempted but Herdr returned an error or wait failure. Exit 2 is
possibly delivered and is never replayed; the orchestrator waits for lifecycle
settlement.

An unresolved peer outcome may reach the human, but the resulting
`MO_HUMAN_DECISION_V1|candidate=<oid>|finding=<id>|decision=<UPHOLD|WITHDRAW>`
is relayed only through `HUMAN_DECISION_TO_EXECUTOR`. The executor first appends
the human's credential-safe words verbatim to `docs/business.md` and every
current task/spec, then implements the decision. That documentation commit is a
new candidate and therefore invalidates every old gate and finding ID; the
origin reviewer never receives a human decision against the frozen candidate.
The atomic human-return prompt is objective/goal, executor capsule, relay, then
the fresh current-turn marker last. It requires source `human`, `part=none`, and
exact phase/candidate/finding binding.
Every other permitted human answer is requester/phase-bound by
`MO_HUMAN_ANSWER_V1`, follows `HUMAN_ANSWER_TO_EXECUTOR`, and has the same
credential-safe ledger append, new-candidate, and gate-invalidation effect before
any actor acts on it. It uses the same marker-last order with source `human`,
`part=none`, `finding=none`, requester `executor`, and exact phase/candidate
binding.

Operational authorization is a different class. The E2E actor first emits an
exact one-row, body-free `MO_E2E_APPROVAL_REQUEST_V1` containing the candidate,
operation, and credential-safe scenario ID. A matching one-row, body-free
`production_e2e` or `irreversible_e2e` `MO_OPERATIONAL_APPROVAL_V1` then follows
`E2E_APPROVAL_TO_E2E` back to the exact requesting E2E actor and resumes only
that scenario on the unchanged SHA. `watchdog_start` follows the
non-relay `WATCHDOG_START_TO_ORCHESTRATOR` control route. These events retain
only their exact header and current conversation evidence: no body is accepted,
no tracked intent ledger changes, and no new candidate is created. A freshly
unpredictable request token binds each approval to its exact requester,
operation, safe scenario, phase, candidate, and lifecycle-stored requesting E2E
actor and is consumed once. That actor must equal the native recipient even
though the compact header says `requester=e2e`; the trusted relay argv carries
the independently stored operation as `approvalOperation` immediately after
`approvalScenario`, followed by `approvalActor`. Both must exactly match the
returned header/native recipient state; every non-E2E-approval route carries
`none` for all approval arguments. Stale, replayed, wrong-operation, or
cross-actor approval fails closed.

Ambiguous submission or relay delivery is never blindly retried. A changed
public signal means the turn may be live and must be awaited; unchanged or
contradictory evidence is harness-capability attention unless a future public
positive non-delivery acknowledgement or end-to-end deduplication protocol
exists.

Scratch lifetime follows mechanically tracked IDs and delivery state. Before
confirmed pair delivery all A/B parts remain. Afterward a first-pass part
remains only while an ID it introduced is open; a PASS or no-open part is
deleted. A shared same-origin executor `RESPONSE` and its exact
`OUTCOMES`/`DISPUTED` body carry one pending-direction reference per disputed
target. Each survives earlier requests and is deleted only after the final
target's adjudication-request delivery becomes terminal. The target introducing
part remains while its ID is open. A `FOLLOWUP` remains through confirmed
new-finding delivery. Peer outcomes remain until all targets resolve and their
single aggregate terminal relay is confirmed; human outcomes remain only until
confirmed onward delivery. Closing every
introduced ID deletes its source files; candidate invalidation deletes all
files for that candidate. Definitive failure or unknown retains files only
through bounded recovery, after which controlled exit deletes them. Ambiguous
maybe-delivery is never resent: retain its files until the actor settles, then
delete or exit. Every controlled exit deletes all scratch paths known to that
run; only a hard crash can leave the separately recorded backlog residue.

## Candidate and support consequences

Every header and gate names the same full commit object. `HEAD` or cleanliness
changing during review invalidates the affected evidence, and any new commit
invalidates every gate and open finding ID. A transport-`UNKNOWN` handoff remains
unknown even if check fields retained from a readable prefix say `PASS`.

Complete-turn evidence remains ephemeral in the backend run and final result.
That closed record has exact top-level order
`candidate,worktree,gates,support,reviews,scenarios` and binds one unchanged full
SHA/clean worktree to:

- ordered QC, smoke and checks A/B status arrays;
- 1..67 unique facts sorted by the exact seven-field support-key tuple, each
  with outer keys `key,status,scenarios`, SUPPORTED status, an empty or singleton
  safe scenario-ID list and together covering every selected-topology
  provider;
- exact A-then-B different-provider PASS reviews with REQUIRED|NA dispositions
  and exact
  `reviewer,actor,provider,support-key,status,qc,smoke,checks,e2e,scenarios,evidence` keys;
  status, qc and smoke are PASS, checks is PASS|NA, and top-level gate arrays
  byte-equal the corresponding A/B review fields;
  `support-key` is the slash-join of the matched fact's seven safe-ID values and
  resolves to backend Herdr, the same provider, review surface, `review-turn`
  fixture and no scenarios; structural evidence is
  `source,protocol,parts,rows,bytes`, `MO_REVIEW_V2`, and bounded by 6 parts, 1000
  rows and 61,440 bytes; and
- when both reviews require E2E, the nonempty exact sorted union of both validated
  review scenario lists, with support proving every identity and exact
  `scenario,actor,provider,support-key,status,evidence`
  keys. The support key resolves to backend Herdr, the same provider, E2E
  surface, scenario fixture and exactly that scenario; a merely same-provider
  fact is invalid. Structural `source,protocol,ordinal,total,rows,bytes`
  `MO_E2E_V1` evidence is bounded by 1000 rows and 65,536 bytes. Ordinals are
  1..one consistent total. For REQUIRED/REQUIRED, the validated PASS-header
  scenario count and exact canonical IDs equal the derived scenario list and every evidence
  total, with none omitted. NA/NA alone permits an empty list. A mixed first
  pass re-prompts exactly the NA reviewer once on the unchanged candidate
  without peer output; a change to REQUIRED proceeds, while repeated NA is
  terminal `needs_attention:e2e_disposition_dispute`.

Every nested key/order is closed; extra prose/generic evidence, missing facts,
FAIL/UNKNOWN, dirty state or a changed SHA cannot pass. Tracked fixture, E2E and
acceptance documents remain definitions/maps/support posture and are never
edited or committed as candidate PASS receipts; no manifest, registry, receipt
or external sink is introduced.

Support belongs to the exact
backend/provider/provider-version/backend-version/surface/os/fixture key.
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
