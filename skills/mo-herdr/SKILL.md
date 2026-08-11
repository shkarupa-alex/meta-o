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
8. If both pass and both say E2E NA, return the unchanged SHA. Otherwise lazily
   create E2E, prompt the E2E actor, and apply the V1 result.
9. Any fix/new SHA invalidates every gate and open ID; repeat the full freeze.

Reviewer/E2E prompts name only locator, candidate, role, protocol version,
row/part/byte limits and exact header grammar. They never embed tracked content.
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
header type, status and open IDs; its second unchanged terminal occurrence stops
the run. Executor RESPONSE `rebuts` must equal the complete current open-ID set
for exactly one origin; subsets, supersets and mixed A/B responses are rejected
globally and handled in separate origin turns. The next
origin handoff accounts for every rebutted ID exactly once across disjoint
`closes` and `disputes`. `PASS` closes them all without new IDs; `FOLLOWUP`
closes them all and adds new IDs; `OUTCOMES` represents a mixed close/dispute
result without new IDs, with canonical `open` exactly equal to canonical
`disputes` after closes; reject retained closed, missing-dispute or extra open
IDs. `DISPUTED` represents all-dispute. Treat every canonical positive-decimal
finding suffix as unbounded and compare it only with `BigInt`, never `Number`,
unary coercion or lexicographic ordering. Keep the full exact
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

Return only the verified unchanged full SHA and a short summary, or a permitted
`needs_attention` naming content-free topology/role/class/candidate identifiers.
Do not create a report, finding archive, screenshot, raw log or completion file.
