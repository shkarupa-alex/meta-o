---
name: mo-herdr
description: Drive a whole feature to a verified candidate commit over Herdr-managed agent sessions — preflight, executor under a native goal where the route has one, two independent reviews, applicable E2E — and hand back one full SHA or a real needs_attention. Use when the user asks to implement a feature, continue one, or run the Meta-O workflow with Herdr as the session backend.
license: MIT
---

# Run one feature through Herdr

Read `references/methodology.md` and `references/herdr-mechanics.md` completely.
The first owns role and gate semantics; the second owns exact Herdr transport.

## Activation boundary

Require `HERDR_ENV=1`, Node.js 22+, a Git repository, an interactive orchestrator
pane, named public Herdr commands, and two exact-fixture-proven reviewer vendors.
Do not fabricate Herdr state and do not use this skill outside Herdr.

Before activation, resolve the fixture map as an explicit input: use a
caller-supplied locator when present, otherwise the project-contract path
`docs/phase-0-fixtures.md`. Read it before the firewall closes and retain only
the exact seven-field support keys, reusable posture, explicit Herdr backend
scope, and up to 64 canonical fixture scenario IDs. A missing,
unreadable, malformed, or wrong-backend map is setup attention and prevents activation; it is
never repaired by reading tracked content later. Candidate SHA, verdicts and
live run evidence are not part of this input.
Validate the exact fenced `MO_FIXTURE_MAP_V1` and
`MO_FIXTURE_SCENARIOS_V1` records from methodology §9 while reading the input.
If automating Markdown parsing, use an available real AST and never regex-parse
Markdown. Other-backend rows may coexist; the Herdr scope itself is mandatory.

The project contract is injected before activation. After activation, treat the
task/spec locator as opaque and enforce the methodology firewall. Never open a
tracked file or run a content-revealing Git command. Repository-reading actors
open the locator themselves.

Read installed Herdr help before mutations. Do not infer a private API or use a
provider transcript, goal database, hook, verdict file, direct provider process,
`pane run`, inline/headless invocation, manual attach, or executor-pane read as a
fallback. Every supported actor is an ordinary visible interactive subscription
CLI started with `herdr agent start`.

## Preflight

Run, from this skill's own installed directory, first to validate both embedded
probe programs and then to measure each applicable launch-parent shell:

```text
scripts/mo-posture.sh --self-check --shell all
scripts/mo-posture.sh --shell <zsh|bash|all> -- <selected-providers>
```

Require status 0 for every applicable shell, a complete non-divergent matrix and
no selected provider whose record is `type=missing` or `path=missing` before
topology mutation. Only fixed classification, command kind and first path enter context.
Trust, permission, model activation and entitlement stay live fixture gates.
The resolved pre-activation fixture map defines fixture keys and durable support
posture only; never record this candidate's SHA, PASS verdict or live evidence
there.

Use the bundled `scripts/mo-models.mjs` for preferences/catalogues. It is
self-contained; missing ambient `node_modules` is not a reason to search the
feature repository. Apply the finite fallback in methodology §9 without asking
the user to pick an ordinary route.

Validate repository root, full `HEAD`, branch and cleanliness only through the
allowed Git commands. Validate each object ID before passing it as a distinct
argument.

## Visible topology

Derive `<slug>` from the opaque locator basename: lowercase, replace each
non-alphanumeric run with `-`, cap at 12 characters, trim separators, and use
`task` if empty.

Create this visible layout without focus theft:

```text
tab "mo:<slug>"
├── orchestrator       left
└── executor           right

tab "mo:<slug>:review"
├── reviewer A         left/root
└── reviewer B         right
```

Create `mo:<slug>:e2e` lazily only when E2E is required.

Actor names are:

```text
m-<slug>-executor-<suffix>
m-<slug>-reviewera-<suffix>
m-<slug>-reviewerb-<suffix>
m-<slug>-e2e-<suffix>
```

The six-character lowercase-alphanumeric suffix combines pane identity with
fresh entropy. Validate the entire prospective set against
`[a-z][a-z0-9_-]{0,31}` and existing actors before any mutation. Regenerate the
whole suffix on collision; five collisions produce harness-capability attention.

Use exactly:

```text
herdr pane split --current --direction right --cwd <repo> --no-focus
herdr tab create --cwd <repo> --label "mo:<slug>:review" --no-focus
herdr pane split --pane <root-pane-id> --direction right --cwd <repo> --no-focus
```

The structured `tab create` result must contain `result.root_pane`. Validate
injected `HERDR_TAB_ID` against
`herdr tab list --workspace "$HERDR_WORKSPACE_ID"`, then rename through
`herdr tab rename <TAB_ID> <LABEL>`. No post-start move, tab-move assumption,
pane close or horizontal split is supported.

Verify layout and retry once. Leave partial topology visible on failure because
ownership is insufficient for destructive cleanup. Best-effort
`herdr pane report-metadata --token` may publish content-free role, candidate and
gate badges; badge failure warns and never changes support.

## Start actors

Use the configured model and effort explicitly:

```text
herdr agent start <name> --kind claude --pane <id> --timeout 300000 -- --model <id> --effort <level>
herdr agent start <name> --kind codex --pane <id> --timeout 300000 -- --model <id> --config model_reasoning_effort=<level>
```

Only exact fixtures may claim argument/model activation. Actual kind and
foreground process establish vendor. A listed model that cannot reach readiness
is `launch_failed`; continue the finite fallback and recheck diversity.

## Prompt and wait

Before every prompt capture settled actor status, foreground process and the
provider input-boundary fingerprint. Generate a fresh unpredictable 64-lower-hex
value and include exactly one
`MO_PROMPT_BOUNDARY_V1|fingerprint=<value>` row in every ordinary prompt,
continuation, native `/goal` and relay. It is always the final submitted row with
no trailing LF, after the entire objective, executor capsule and inbound relay.
Reject/regenerate if the exact marker row occurs in an opaque segment. Submit
text and Enter atomically:

```text
herdr agent prompt <actor> <text> --wait --timeout <milliseconds>
```

Prompt acceptance must produce a changed public signal in the fixture-proven
five-second window. Changed state/process/fingerprint means possibly live: never
resubmit. Unchanged or contradictory evidence cannot prove non-delivery and is
harness-capability attention, with no immediate or blind retry. Only a positive
public non-delivery acknowledgement permits one retry.

After an accepted-turn timeout or human unblock, inspect public state and use a
non-submitting direct wait:

```text
herdr agent get <actor>
herdr pane process-info --pane <pane-id>
herdr agent wait <actor> --until idle --until done --until blocked --until unknown --timeout <milliseconds>
```

Executor arms are at most 600000 ms; reviewer/E2E arms at most 300000 ms. Exactly
one waiter exists per actor. Healthy `working` re-arms directly. Never use sleep,
polling, predicted SHA/cleanliness or terminal prose.

## Feature flow

1. Start the executor and send the exact initial `/goal`, byte-identical
   `MO_EXECUTOR_PROTOCOL_CAPSULE_V1` from methodology §2.3, then the fresh current
   prompt-boundary row last. Every later executor objective carries the same
   capsule before any relay and final marker; never assume a warm executor
   remembers the skill.
2. Follow direct lifecycle until a complete executor handoff settles.
3. For a candidate, observe a ten-second non-submitting quiet period using public
   actor/process state. A spontaneous return to `working` means the goal is still
   active: wait again. Only the exact isolated fixture may change support.
4. Validate clean `HEAD`, candidate, branch, commit object and declared `develop`
   base. Freeze the candidate.
5. Start reviewer A. Retrieve every V2 part and recheck candidate metadata. A is
   complete only after its final `more=no` part passes cumulative identity,
   open-set, header-inclusive 1000-row and 61,440-byte accounting.
6. Only after complete A, start B with no A bytes in B's prompt or session.
   Retrieve every B part under an independent 1000-row/61,440-byte budget.
7. At the first-pass barrier, release all A then B segments together in one
   atomic `REVIEW_PAIR_TO_EXECUTOR` goal only when at least one complete
   evaluation is `FINDINGS`. A complete PASS/PASS pair relays neither body and
   proceeds to the applicable gate. If A alone invalidates the
   candidate by a mutating check, use only the phase-bound
   `INVALIDATED_A_CHECK_TO_EXECUTOR` route; never start or fabricate B.
8. Reconcile the two PASS dispositions before E2E. `NA/NA` returns the unchanged
   SHA and `REQUIRED/REQUIRED` lazily creates E2E and applies its V1 result. For
   a mixed pair, re-prompt exactly the NA reviewer once on the unchanged
   candidate with no peer output. A change to REQUIRED proceeds; repeated NA is
   terminal `needs_attention:e2e_disposition_dispute`, never a second retry or
   ordinary user question.
9. Any fix/new SHA invalidates every gate and open ID; repeat the full freeze.

Reviewer prompts name only locator, candidate, role, protocol version,
row/part/byte limits and exact header grammar. The initial E2E prompt additionally
places exact
`MO_E2E_ASSIGNMENT_V1|candidate=<oid>|scenarios=<positive-int>|ids=<safe-id-list>`
containing the reconciled review union's candidate, count and IDs immediately
before the fresh final prompt boundary. It never embeds tracked content.
Continuation prompts name the next part and remaining cumulative budgets.

Origin closure, forced dispute, adjudication, unknown recovery, blocker routing
and no-progress accounting follow methodology exactly. The orchestrator performs
all ordinary follow-up autonomously. One finding receives at most one
adjudication, keyed by its single canonical ID. The existing adjudicator is the
actual peer reviewer identity opposite the finding prefix: A goes to B and B
goes to A. A new candidate invalidates all
prior gates and open IDs but does not reset the feature-run ID floor. An executor
BLOCKER is accepted only before a candidate or during resolution of that frozen
candidate. The canonical no-progress key includes candidate, actor, phase,
header type, status and open IDs; canonicalize its internal global open-ID set by
A-before-B and unbounded-`BigInt` suffix order before serialization, never raw
set/caller order, so equivalent permutations share one key. Its second unchanged
terminal occurrence stops the run. Executor RESPONSE `rebuts` must equal the
complete current open-ID set
for exactly one origin; subsets, supersets and mixed A/B responses are rejected
globally and handled in separate origin turns. The next
origin handoff accounts for every rebutted ID exactly once across disjoint
`closes` and `disputes`. `PASS` closes them all without new IDs; `FOLLOWUP`
closes them all and adds new IDs; `OUTCOMES` represents a mixed close/dispute
result without new IDs, with canonical `open` exactly equal to canonical
`disputes` after closes; reject retained closed, missing-dispute or extra open
IDs. `DISPUTED` represents all-dispute. Treat every canonical positive-decimal
finding suffix as unbounded and compare it only with `BigInt`, never `Number`,
unary coercion or lexicographic ordering. In every global ID list put the entire
A block before the entire B block; reject any interleaving, while reviewer-origin
lists stay single-prefix. Keep the full exact
`RESPONSE.rebuts` set as `expectedOpen`, derive separate canonical
`aggregateTargets` byte-for-byte from the validated outcome's `disputes`, and
never include its closed IDs. Relay each `aggregateTargets` ID sequentially with
the shared exact response/outcome bytes, but deliver no
peer result onward until every disputed ID has resolved. Then atomically send an
all-WITHDRAW aggregate to the origin, or the complete mixed/all-UPHOLD aggregate
to the executor. A `FOLLOWUP` returns to the executor through
`ORIGIN_FINDINGS_TO_EXECUTOR`.

Track retained peer-adjudication handoffs against one header-inclusive 122,880-
byte aggregate budget. Before the first peer turn project the larger of the two
possible final aggregate envelopes from exact `aggregateTargets` only, every fixed
frame, the executor goal/capsule and final marker, with five-digit maximum body
length fields; stop before acceptance unless it is at most 7,168 bytes. Before
each peer turn compute the exact remaining bytes
from validated retained lengths, put that value and `min(65536, remaining)` in
the prompt, and pass the same trusted remaining value to extraction. Reject an
oversize outcome before acceptance without changing retained state; one compact
retry uses the same remaining value. Aggregate relay validation independently
accumulates every peer body and still enforces framing and argv ceilings.
Pass the exact current target separately as extraction `expectedFinding`; require
the `MO_ADJUDICATION_V1` header finding to equal it. Pass `none` for every other
protocol and reject a wrong, duplicate, reordered or off-route value.

Use the exhaustive `MO_RELAY_V2` direction table in methodology §5 and the
literal mechanics recipe. Route executor `RESPONSE` to its origin reviewer.
Route either human `UPHOLD` or `WITHDRAW` to the executor first with the exact
credential-safe verbatim-intent `/goal` from methodology §7, byte-identical
capsule, human-source relay, and fresh marker last. Require source `human`,
`part=none`, and exact lifecycle candidate/finding before submission. It must
create a new candidate that invalidates all same-candidate gates and open IDs;
no human decision goes directly to the origin. Route any other permitted human
answer through phase/requester-bound `HUMAN_ANSWER_TO_EXECUTOR` in the same exact
goal → capsule → relay → fresh-final-marker order. Require source `human`,
`part=none`, exact lifecycle candidate, requester `executor`, allowed phase and
outer `finding=none`; the executor records it credential-safely before acting and
commits a new candidate.

Do not send operational approvals through that repository-changing route.
An E2E actor requests approval only with the exact header-only/no-final-LF
`MO_E2E_APPROVAL_REQUEST_V1`: `production_e2e` is a named
production/destructive scenario; `irreversible_e2e` is a named irreversible
action without that production claim. Validate its credential-safe scenario ID
before deriving a fresh token/state. Candidate-bound
`production_e2e`/`irreversible_e2e` `APPROVE|DENY` then uses only
`E2E_APPROVAL_TO_E2E` at `e2e-approval-resume`; an approved named scenario may
then return E2E PASS on the unchanged SHA. Pass the independently stored
requester-actor identity to the relay recipe and require exact equality with the
recipient actor, in addition to its `e2e` role, candidate, request-header
operation/scenario and freshly unpredictable one-shot 64-hex request token. Pass
operation independently between scenario and actor argv and require exact
approval-header equality; every non-approval route passes `none` for all four
approval-state arguments;
reject stale, replayed, second-E2E-actor and cross-actor approvals.
`watchdog_start` uses the non-relay
`WATCHDOG_START_TO_ORCHESTRATOR` control route and starts the observer only on
`APPROVE`. These credential-free headers are run authorization, not tracked
product intent; never persist their opaque bodies or create a docs commit.
An operational approval is exactly one header row with no final LF or suffix;
E2E scenario must match the request and watchdog scenario is `none`.

Each relay is bound to its named phase, exact recipient actor, source header,
frozen candidate and target ID.
Never substitute a generic prompt or resend an ambiguously accepted relay.

## Complete handoff retrieval

Use only the adaptive public-TUI extraction in
`references/herdr-mechanics.md`. A compact
handoff is complete only when the exact current unpredictable prompt-boundary
row, its exact validated header and the
fixture-proven provider lower boundary are present. A header alone is never proof
that rendering finished. A stale same-candidate marker is rejected. This route
has no independently proven marker-free fallback.

Opaque bodies stay in restrictive scratch. Print only validated headers into
orchestrator context. For every permitted direction, build exact `MO_RELAY_V2`
framing and use the AST-tested `spawnSync("herdr", argv, { shell: false })` recipe.
Never print body bytes, prompt argv or raw spawn results.

Retention is per file and header/ID-driven, never semantic. Keep all review parts
until confirmed first-pass delivery, then only introducing parts still referenced
by open IDs. Keep a shared RESPONSE plus `OUTCOMES`/`DISPUTED` file under one
pending reference per disputed target; each survives until every sequential
adjudication request has confirmed delivery. Retain every terminal peer outcome
until the one total aggregate is confirmed onward; then release every aggregate
reference together. Confirmed onward delivery, closure or invalidation deletes
each file once its final reference is gone.
Construction/non-delivery failure retains inputs for the bounded retry; ambiguous
delivery retains them, records possibly delivered and stops without replay.
Controlled exit deletes all files in only the validated current scratch directory
and then the directory; cleanup failure is harness attention.

## Loss and attention

Lifecycle `unknown` retries once. Actor/pane loss recreates the same role/kind
once with the current ID floor and leaves old panes visible. Wrong UI gets one
fixture-supported route fallback. Route discovery preserves the distinct
`catalog_unknown`, `model_missing` and `launch_failed` outcomes while exhausting
the finite configured/catalogue/provider order without ordinary user choice. A
repeated loss, repeated terminal process key, ambiguous submission/delivery,
missing root pane, persistent layout failure or missing required public
capability is harness attention and asks no engineering choice.

Only the blocker classes in methodology §7 or an explicitly requested watchdog
reach the human. Generic/unclassified blocked UI is unsupported, not a reason to
wake the user.

## Final answer

Return the verified unchanged full SHA and a short summary backed by the
ephemeral current-run final-result record. Emit its exact top-level order
`candidate`, `worktree`, `gates`, `support`, `reviews`, `scenarios` and no other
fields as one JSON object, followed only by a short human summary. Require the
unchanged full SHA and `worktree=clean`.

Emit gates exactly in `qc`, `smoke`, `checks` order with A-then-B `statuses`;
require PASS for both QC/smoke and PASS or NA for each applicable-check status.
Require each pair to equal the two reviews' correspondingly named header fields.
Emit 3..67 canonical sorted support facts, each exactly `key`, `status`,
`scenarios`: its key is exactly backend, provider, provider-version,
backend-version, surface, os, fixture; status is SUPPORTED; all IDs are lower safe
IDs of at most 64 bytes; and each scenario-name list is empty or a singleton.
Slash-join those seven values as its canonical reference. Cover
every exact actor surface on the selected Herdr topology. Require exactly one
lifecycle-selected `executor`/`executor-turn` fact with no scenarios, exactly the
two review-referenced facts, and one scenario-referenced fact per derived name;
reject unused facts. Bind every actor/provider to lifecycle state and require at
least one reviewer provider to differ from the executor.

Emit exactly A then B review records with reviewer, actor, provider, exact
`support-key`, PASS status, QC, smoke, checks, E2E disposition, exact scenario
list and evidence in
that order. QC/smoke are PASS and checks is PASS or NA. Bind that reference to
the same provider's Herdr `review`/`review-turn` fact with no scenarios. Both
dispositions must be REQUIRED or both NA; reject one NA. A REQUIRED review has
a nonempty canonical list of at most 64 safe scenario IDs; NA has none. Review evidence is
exactly source `backend-public-surface`, protocol `MO_REVIEW_V2`, and positive
parts/rows/bytes bounded by 6/1,000/61,440. Different reviewer providers remain
mandatory. Both NA requires an empty scenario list. Both REQUIRED derives the
nonempty scenario list only as the sorted unique union of both review scenario
lists; support proves every derived name but never defines the required set. No
default or out-of-band name is accepted. Each derived scenario record is
ordered by name and carries actor, provider, PASS, exact `support-key` and exact
structural evidence. Bind its reference to the same provider's Herdr `e2e` fact
whose fixture and sole scenario both equal the record name. Evidence source is
`backend-public-surface`, protocol is `MO_E2E_V1`, ordinal/total is exact, and
the validated PASS header's `scenarios` count equals both the derived list
length and every evidence `total`, its `ids` byte-equals the complete derived
list, and `not_run=none`. Positive rows/bytes are
bounded by 1,000/65,536. Reject missing or unrelated
support keys, gates/dispositions, extra fields, FAIL/UNKNOWN or arbitrary
prose/generic evidence.

Recheck the same clean `HEAD` immediately before return; a dirty tree, new SHA,
missing evidence or unreadable evidence invalidates PASS.

Keep candidate-bound live evidence only in current-run state and the final
answer. Never edit or commit `docs/phase-0-fixtures.md` or another tracked file
to record it, and never create a report, manifest, receipt, verdict file,
external evidence sink, finding archive, screenshot, raw log or completion file.
Otherwise return a permitted `needs_attention` naming only content-free
topology/role/class/candidate identifiers.
