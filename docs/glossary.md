# Glossary

One durable term has one meaning here. Protocol grammar, retries, byte limits and
fixture commands live in their normative operational documents, not in this
vocabulary.

**Actor** — persistent specialist participant: a visible ordinary interactive CLI
in Herdr or a native agent in Omnigent. Actor is a role-bearing participant, not a
provider process invocation or fixed name.

**Session** — backend-owned continuity carrier for an actor. It is not a role,
gate, registry entry or Meta-O state record.

**Orchestrator** — process-only transport and lifecycle controller. After
activation it does not intentionally read tracked project content or form
engineering opinions; it autonomously owns ordinary lifecycle, routing, retries,
fallbacks and gate bookkeeping.

**Executor** — repository-reading implementation owner. It decides feasibility,
architecture application, implementation, tests, documentation and version
control, and produces candidate commits.

**Reviewer** — independent read-only candidate evaluator that owns its findings,
applicability and closure. Reviewer A finishes before reviewer B starts.

**E2E actor** — separate read-only participant that runs applicable agent-required
end-to-end scenarios against one frozen candidate.

**Feature run** — one uninterrupted attempt from backend activation to verified
result or permitted attention. Restart begins a new run and adopts no prior state.

**Candidate** — full Git commit object ID equal to clean `HEAD` on the required
feature branch.

**Candidate freeze** — interval in which candidate and cleanliness must remain
unchanged while review and E2E evidence is produced; the executor receives no
prompt during it.

**Gate** — evidence bound to one candidate SHA. A missing, incomplete, unknown,
stale or differently bound verdict does not pass.

**Verified result** — unchanged candidate whose required different-vendor
reviews, QC, smoke, additional checks and E2E all pass.

**Compact handoff** — bounded exact process header plus an opaque UTF-8 body.

**Process header** — validated first line that carries routing, candidate and
mechanical accounting fields; it is not by itself proof of a complete turn.

**Complete result** — valid terminal compact handoff for the expected actor,
candidate and phase, bounded by a fixture-proven provider lower boundary.

**Terminal process event** — mechanical tuple of candidate, actor, phase, header
type, status and open IDs used to detect unchanged-failure loops.

**Opaque body** — actor-produced bytes transported without interpretation,
filtering, ranking, merging, paraphrase or command execution.

**Provider lower boundary** — exact surface/version fixture-proven rendered marker
after a completed provider turn. A glyph without structural context is not one.

**First-pass barrier** — point after complete independent A and B first passes and
before any reviewer body reaches the executor.

**Finding** — reviewer-owned `A-*` or `B-*` issue whose full opaque body contains
Evidence, Impact and Expected fix. Only its origin reviewer closes it.

**Adjudication** — one other-vendor decision on a disputed finding. It can uphold,
recommend withdrawal or declare unresolved; it never closes the origin finding.

**Lifecycle state** — backend-native public actor progress state used for waiting.

**Herdr lifecycle state** — normalized Herdr `working`, `idle`, `done`, `blocked`
or `unknown` state. Provider prose is not lifecycle.

**Route** — existing configured `route/model/effort` preference. It does not own
fixture applicability.

**Surface support key** — exact backend/provider/version/surface/fixture identity
to which empirical support applies. Evidence never transfers to another key.

**Catalogue availability** — whether a provider-owned listing can be read.

**Model presence** — whether an ID occurs in that listing.

**Launchability** — whether the configured actor can start and reach readiness.

**Entitlement** — whether the current subscription/account may use that model.
Catalogue presence proves neither launchability nor entitlement.

**Gate `unknown`** — a complete passing verdict cannot be established. It is
repeated within its bound and never averaged into a pass.

**Herdr lifecycle `unknown`** — public Herdr state cannot be normalized; it is
re-armed once and then becomes harness-capability attention.

**`needs_attention`** — permitted user boundary or unavailable harness capability,
never an ordinary engineering or process choice. Product meaning/architecture,
irreversible action, credentials, subscription, production E2E, external blocker,
unresolved dispute and explicit watchdog are the permitted human boundaries.

**Operational approval** — one request-bound `APPROVE`/`DENY` authorizing an
already named production/destructive E2E action or explicitly requested
watchdog. It is candidate-stable run control, not product intent; only its
credential-free one-row compact header remains in current run evidence. E2E
approval exactly matches the visible request candidate, operation, safe scenario
ID and token; watchdog approval uses `scenario=none`.

**E2E approval request** — an exact one-row, body-free
`MO_E2E_APPROVAL_REQUEST_V1` handoff with no body or final LF from the E2E actor immediately before one
named production/irreversible scenario. Its credential-safe scenario ID makes
the action visible to the process-only orchestrator without reading opaque prose.

**Warm session** — backend-native session retained for role continuity during one
feature run. Warmth is not persisted Meta-O state.

**Scratch transport** — restrictive temporary body storage outside the repository,
owned only for bounded current-run per-ID and delivery transitions and never
adopted across runs.

**PATH wrapper** — executable file selected first by PATH resolution. An alias or
function may be a verified launch mechanism, but it is not a PATH wrapper; see
launch posture.

**Launch posture** — per-surface proof that required permission, approval,
sandbox, environment, prompt and fixed arguments plus caller pass-through reach
the actual provider process through a verified wrapper, credential-free forwarding
mechanism or named provider-native configuration.
