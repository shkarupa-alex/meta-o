## Framing: what a seventh pass owes this document

Six passes of findings have now been answered, and the honest constraint on this review is that credit and skepticism have to be separated cleanly. Every one of my pass-6 blocking findings is addressed, several by redesign rather than by patch — so the cheap move (restate old findings as still-open) is unavailable, and the lazy move (approve because the author responded) is exactly what the instructions forbid. The useful work is therefore: verify each closure is real rather than cosmetic, and attack the *new* material hardest, because this revision changed load-bearing numbers and removed a whole protocol layer (multi-batch review) — and a revision that simplifies a protocol is where new arithmetic and new single-point constraints get introduced without the fixtures that guarded the old ones.

That attack succeeded once, on a hard platform limit, and produced two further real defects that are consequences of this revision's own fixes. Grounding is as before, plus a re-read of `docs/glossary.md`, `docs/architecture/full-turn-retrieval.md`, and `docs/architecture/distribution.md` this pass.

---

## Facts & Constraints (White Hat)

**Closures verified as real, not cosmetic.** All six pass-6 majors are genuinely resolved, three of them better than I asked:

- **Goal suspension** was not patched with an invented suspend prompt (which is what I proposed); instead the design observes that the native goal *ends when its first candidate turn settles*, makes that a fixture-backed precondition for starting review, states "no invented suspend command exists", and re-arms with one new `/goal`. That is a stronger answer than mine, and it correctly forced the relay redesign.
- **`BLOCKER` routing** now has a full class × valid-source/phase × human-visible-report × resume table, `READY` is deleted from the grammar entirely, `MO_E2E_V1` gained `status=BLOCKER` with a restricted `blocker=` set, the flow diagram carries `valid_BLOCKER` arrows, and the error table has both valid and invalid-source rows. Invariant 15 was correctly split into actor-initiated boundaries versus terminal harness-capability reporting, which also closes my separate invariant-15/error-table finding.
- **The no-progress guard** now has a defined canonical key `<candidate, actor, phase, header-type, status, open-ids>`, `complete result` and `terminal process event` are glossary entries, and the `FINDINGS`/`RESPONSE` cycle is bounded mechanically: a second `RESPONSE` on an already-rebutted still-open ID is forced into a `DISPUTED` evaluation, with refusal classified as actor noncompliance. This is the escalation rule I asked for three passes running.

Also closed: fixture-proven state/fingerprint disambiguation replacing fail-closed escalation (with the ledger correctly split into "blind retry — rejected" and "fixture-proven retry once — adopted"); AST extraction and execution of the fenced recipe with a body-bytes-on-stdout assertion; explicit `{ package, source, destinations }` licence mappings validated against esbuild's metafile by set equality; a measured size baseline with 25% tolerance replacing the invented 4 MiB; the `## Resolved` section named explicitly; the crash-scratch exposure as a real backlog item with a ledger row rejecting its concealment; the posture probe given a named preflight consumer and a ledger row rejecting its orphan status; recipe output discipline; `^feature/[a-z0-9][a-z0-9._-]{0,62}$` with independence from the topology slug stated; the mutating-check short circuit justified and split by A/B timing; the adjudication rationale corrected to "ordering-only independence … accepted for warm-session cache economics"; the non-mutating-check rule given an installation owner in `mo-setup`; Node 22 in preconditions; item 1's stop scope narrowed to items 5, 6, 8; the wrapper length-mismatch consumer contract; and E2E case 19 given a concrete test-only tool-call-audit mechanism. `docs/business.md` was added to the file inventory — an omission I had not caught.

**Considered and dismissed as defects:** running the shipped posture probe and the model helper does not breach invariant 1, because invariant 1 governs *opening tracked project files for content* and these are executed skill assets whose fixed classification output is explicitly narrowed. Two reviewers independently reporting `checks=NA` remains reviewer-owned by design, tested by case 10, and fail-closed in the directions that matter. `fixes` naming already-`invalidated` IDs is harmless routing metadata. The batch/`more` removal was propagated consistently — the orchestrator's may-list, the ephemeral summary, the size section, QC, and the ledger all agree, with no orphan references left.

---

## Risks & Failure Modes (Black Hat)

### 1. The combined relay exceeds Linux's per-argument limit (major, new — this is the one hard break)

"The complete framed goal is one argv element", and the combined A+B release prompt is "at most 135,168 bytes including the goal and both wrappers", delivered via `spawnSync("herdr", argv, { shell: false })`.

On Linux, a single `argv` **string** is capped by `MAX_ARG_STRLEN`, defined as `PAGE_SIZE * 32` = 131,072 bytes; exceeding it fails `execve` with `E2BIG` regardless of total `ARG_MAX` headroom. 135,168 > 131,072. So the maximum-size case this spec explicitly mandates as a QC fixture ("one combined maximum A+B release goal under 135,168 bytes") and as E2E case 4 ("one combined maximum A+B release goal") **cannot execute on Linux at all**, and the failure is size-dependent — small reviews work, thorough ones fail — which is the worst shape for a transport bug. macOS is unaffected (no per-argument cap under a 1 MiB total), so this passes on the author's machine and fails in CI or on a Linux user's box.

The number is newly introduced by this revision: the previous 65,536-byte-per-prompt design sat safely under the limit, and combining two handoffs into one argv element is what crossed it. There is a second-order concern too: `herdr` then forwards the prompt onward, so the limit may apply twice.

### 2. The 180-row single handoff is now the binding constraint on review completeness, and it collides with an existing glossary definition (major, new)

Removing multi-batch was correct for barrier integrity — the ledger's reasons ("needs a buffer/ack/release protocol and can wake executor early") are sound. But the consequence was not costed. A reviewer now gets **one** handoff of ≤180 `recent-unwrapped` rows for a complete review of an entire feature, and `docs/glossary.md` defines a finding as carrying "`Evidence`, `Impact` and `Expected fix`" and being "Copied to the author whole and verbatim. Never summarised." Those two constraints fight: 180 rendered rows in a half-width alternate-screen pane is roughly 90–120 wrapped lines of prose, which is a handful of substantive findings with evidence, not a thorough two-vendor review.

The specified failure path makes it worse: oversized output gets "one compact reissue", then `unknown`, then reviewer-`UNKNOWN` retry-once, then `needs_attention`. So a *thorough* reviewer wakes the human, and the pressure the protocol applies is "be more compact" — i.e. summarise — which is precisely the failure `docs/architecture/full-turn-retrieval.md` calls "the most expensive failure this architecture can produce, and it is invisible": the author never learns what was dropped. The 180-row figure is derived from what TUI extraction can *fixture*, not from what a review needs, and nothing in the spec records that trade-off, measures a real review's row count, or gives the reviewer a bounded way to say "there is more".

### 3. The deterministic-review gate is satisfiable by an incomplete handoff (major, new — a consequence of this revision's own `UNKNOWN` fix)

This revision correctly improved the `UNKNOWN` matrix so that a `transport` unknown retains *actual* completed gate values instead of forcing a spurious `UNKNOWN` field. But the gate statement was not updated with it:

> Deterministic review passes only when both reviewers report: `qc=PASS`; `smoke=PASS`; `checks=PASS|NA`.

A `MO_REVIEW_V1` with `status=UNKNOWN`, `unknown=transport`, `qc=PASS`, `smoke=PASS`, `checks=PASS` now satisfies that sentence literally. The final `verified result` list does require "both final reviews are `PASS`", so a run cannot complete on it — but "deterministic review passes" is a named gate, and `AGENTS.md` is unambiguous: "A gate whose full verdict cannot be read is `unknown` and is repeated. There is no partial pass." A gate condition that an incomplete handoff satisfies is a partial pass, and an implementer writing the QC data cases will encode the sentence as written.

### 4. Newly asserted Herdr surface details lack the fixture hedge their sibling received (minor, new)

The tab-ID fix is good, but it introduces `HERDR_TAB_ID`, `HERDR_WORKSPACE_ID`, `herdr tab list --workspace`, `herdr pane split --current`, `herdr pane split --pane <id> --cwd`, and "the plain `--wait` form uses Herdr's documented settled defaults" — none of which I can confirm against the `herdr 0.8.0` surface established in this session (`pane split --direction right|down --no-focus` and `agent prompt --wait --timeout` are verified; these specific flags and env vars are not). Notably, the spec *does* hedge correctly one line earlier: "The exact installed-version fixture requires `tab create` to return that root pane ID; absence makes the surface unsupported rather than inventing a lookup." The same hedge is absent for the env vars and the two `pane split` flag forms, and the precondition "all named public Herdr commands" is not a per-flag check. Same issue for `scripts/mo-posture.sh --self-check -- <selected-providers>`: `docs/glossary.md` documents the probe's per-shell `0/1/2` classification, but this invocation form is invented, and item 3 says only "`mo-posture.sh` consumer instructions", leaving unclear whether the flag exists or must be added.

### 5. The canonical no-progress key names a field only reviewers carry (minor, new)

The key is `<candidate, actor, phase, header-type, status, open-ids>`. Executor headers have `rebuts`, not `open`; `MO_E2E_V1` has neither, and `MO_ADJUDICATION_V1` has no `status` in the review sense. So for three of four header types two key components are undefined, and the guard that now bounds the rebuttal cycle depends on them. The natural resolution — `open-ids` means *the orchestrator's tracked open set at that moment*, and `status` means the header's own status field where one exists — is well-defined for every actor, but it is not stated.

### 6. Smaller gaps

The **framing budget is unstated**: 135,168 − 2×65,536 leaves 4,096 bytes for the goal text (~250 bytes as quoted), two adversarial wrappers, four delimiters, two labels, and two declared lengths. That is probably feasible at ~1.9 KiB per wrapper, but nothing states the allowance or what gives if the authored wrapper exceeds it — and the max-size QC fixture will fail with no specified resolution. **`scenarios` is unconstrained for E2E `FAIL` and `UNKNOWN`**, so `status=FAIL|scenarios=none|not_run=none` is a valid header describing nothing. **The forced-dispute prompt has no specified text**, unlike every other orchestrator-authored prompt, although it must mechanically constrain the reviewer to exactly three outcomes. **"recheck capability and resume"** for `credentials`/`subscription` does not say whose capability or by what permitted command — subscription is checkable via the helper, credentials generally are not. **The posture-probe QC bullet risks a flaky gate**: `mo-posture.sh` classifies real shell startup modes, so asserting "posture probe invocation and structural output classification" under `mo-qc` needs a fixed fake-`PATH`/fake-shell fixture, which is not stated. And "explicit approval resumes that E2E turn" is loose — the turn ended; a new prompt to the same warm actor is what happens.

---

## Strengths & Benefits (Yellow Hat)

I attacked the protocol core again and it held everywhere except the argv arithmetic. Extraction still cannot capture a prior turn (pre-prompt fingerprint, bounded interval, single-header requirement, explicit rejection of zero/multiple/ambiguous candidates, fixture-only fallback). The relay still cannot reach a shell, and it is now also output-disciplined, length-validated on the consumer side, and AST-extracted into a real test — closing the last soft spot in the transport. Identity still cannot be spoofed. Accounting is stronger than before: run-scoped monotonic IDs now survive actor replacement via an explicit ID floor passed to the replacement reviewer, which is a failure mode I had not raised.

Two changes are genuinely architectural improvements rather than fixes. Deriving goal deactivation from observed lifecycle rather than inventing a suspend command removes a whole class of invented protocol, and it is honest about the consequence ("If a provider cannot establish that implication, its surface is unsupported"). And the live-incident-versus-isolated-reproduction split for `route_incapable` is a real epistemic upgrade: a flaky live repaint now fails a gate and preserves evidence without silently revoking a surface, and only an isolated exact-fixture reproduction can change support or justify an upstream issue. That distinction is what keeps invariant 14 from being either too trigger-happy or too lenient.

The blocker routing table is the best-specified section in the document — it gives a weak model a row-by-row decision procedure for the one place where the firewall must deliberately point a human at actor prose, and it does so without the orchestrator reading a byte. All fourteen of the user's original bullets remain addressed structurally, and the two easiest to lose (backlog open-only, no unsolicited docs) now have QC bullets naming the exact existing heading to delete.

---

## Alternatives & Creative Ideas (Green Hat)

**A.** Re-derive the relay caps from the platform limit rather than from convenience: set the combined framed goal ceiling at 131,072 bytes *including* framing, back out a stated framing allowance (say 8 KiB), and cap each reviewer handoff at 61,440 bytes. Add a QC case asserting the ceiling is below `MAX_ARG_STRLEN` and an E2E case at the exact boundary on Linux.
**B.** If the row cap must stay at 180, avoid the summarisation trap by bounding findings *per handoff by count* with an explicit, orchestrator-visible continuation field — one more field, no buffering protocol, and the barrier stays closed because the orchestrator simply does not release until the reviewer reports terminal. Alternatively measure a real review's row count as a fixture and record the trade-off in backlog rather than leaving it implicit.
**C.** Deliver the framed goal on stdin to `herdr agent prompt` if the surface supports it, which sidesteps `MAX_ARG_STRLEN` entirely — worth one fixture before accepting a smaller cap.
**D.** Add `status=PASS` and `unknown=none` to the deterministic-review condition, and add a QC data case asserting a `transport`-`UNKNOWN` handoff with all-PASS fields does *not* satisfy it.
**E.** Give the newly asserted env vars and flags the same one-line hedge `tab create` received: exact installed-version fixture required, absence makes the surface unsupported rather than inventing a lookup.
**F.** Define the key components once: `open-ids` = the orchestrator's tracked open set at event time; `status` = the header's own status where the type has one, else the event kind.

---

## Completeness & Process (Blue Hat)

Missing: the platform-limit reconciliation for the combined relay; the framing-overhead budget; `status`/`unknown` in the deterministic-review condition; `scenarios` constraints for E2E `FAIL`/`UNKNOWN`; the forced-dispute prompt text; the key components for non-reviewer events; the fixture hedge for the new env vars and flags; the posture-probe test fixture; and a stated position on review size versus finding completeness. Everything else I looked for is present. The agentic gate is 25 cases mapped one-to-one to H13–H37 with H7b retained, correctly sequenced with capability proof first and cutover last, and case 19 now names a mechanism.

---

## Traceability

The ledger (~70 rows) is the strongest process artefact in the document. Every adopted row I sampled has a body home; every rejected/deferred row appears in the prohibitions or deferral section. This revision's new rows all trace: native goal ends at candidate, fixture-proven retry, one combined A+B release goal, review V1 multi-batch rejected, phase/source blocker routing, canonical terminal event and forced dispute, generic provider question rejected, best-effort badges, fixed fallback order, `checks` field, posture-probe-orphan rejected, crash-leftover concealment rejected. The `superseded`/`adopted` pair for issue candidates remains the right pattern. One gap remains: no row records the earlier *removal* of the provider-posture precondition, which is now moot since the precondition returned in stronger form — but the ledger's own purpose argues for recording the round trip. The false "contamination bounded to old candidate" rationale is fixed.

---

## Decomposition Readiness

Items 2, 4, 5, 7, and 8 are executable. Item 1's stop scope is now explicit and correctly excludes items 2–4. Item 3 is executable now that licence mapping is a concrete `{ package, source, destinations }` structure validated against the metafile — the prior design gap is gone. Item 6 has two residual decisions rather than executions: the relay cap must be re-derived against the platform limit (finding 1), and the framing budget must be settled. Item 5 must invent the exact form of two Herdr invocations whose flags are asserted rather than fixtured.

---

## Weak-Model Executability

Substantially stronger than any prior revision. The blocker routing table, the review and executor matrices, the unknown-class-specific rules, the fingerprint disambiguation procedure (two observations, five seconds apart, three named outcomes), the extraction ladder, the recipe's output contract, the branch regex, the fallback ladder, and the verbatim goal texts are all directly implementable. Remaining guessing points: the forced-dispute prompt text; the key components for executor/E2E/adjudication events; whether the asserted Herdr flags and env vars exist; the `mo-posture.sh` invocation form; and the framing budget arithmetic.

---

## Contract Completeness

Specific and checkable: full grammar with field order and value sets, canonical integers, sorted unique run-scoped IDs, the closed blocker-class list with per-class routing, 180 rows / 65,536 bytes per handoff, the combined-release ceiling, wait arms, pinned dependency versions, `target: node22`, `external: []`, a measured size baseline with tolerance, metafile-to-mapping set equality, the branch regex, the extraction ladder, and 25 acceptance cases mapped to fixtures. No `TBD` outside Open Questions.

Incomplete: the combined ceiling contradicts a platform limit; the framing allowance is unstated; `scenarios` for two E2E states; the deterministic-review condition's missing fields; the key's undefined components; and the posture-probe test fixture.

---

## Overall

This is the first revision where the architecture is not the problem. Six passes of majors are closed, three by redesign that is better than the fix I proposed, and the transport, firewall, accounting, and human-boundary contracts all survived direct attack. What I could break is arithmetic and one unpriced trade-off: the combined A+B relay's 135,168-byte single argv element exceeds Linux's 131,072-byte `MAX_ARG_STRLEN`, so the maximum-size case the spec mandates as both a QC fixture and an E2E case cannot execute on Linux and will fail exactly on the thorough reviews it exists to carry; removing multi-batch made a 180-row single handoff the binding limit on review completeness, which applies summarisation pressure against `docs/glossary.md`'s "never summarised" and against the failure `full-turn-retrieval.md` names as the most expensive one this architecture can produce; and this revision's own improvement to the `transport`-`UNKNOWN` matrix left the deterministic-review gate satisfiable by an incomplete handoff, which `AGENTS.md` forbids as a partial pass. All three are local — one constant, one recorded trade-off or one counted-continuation field, one clause — and none invalidates the design. That is why the score rises to 8 while adoption still waits: I tried hard to break it and got one hard break plus two consequences of its own fixes, which is a materially different position from any prior pass.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 8,
      "would_adopt": false,
      "summary": "The architecture is no longer the problem. Every pass-6 blocking finding is closed, three of them by redesign that is better than the fix I proposed: native goal deactivation is now derived from observed lifecycle at candidate settlement instead of an invented suspend command (which correctly forced the relay redesign), BLOCKER gained a full class-by-phase-by-report-by-resume routing table with READY deleted from the grammar and MO_E2E_V1 extended with a restricted blocker set, and the no-progress guard now has a defined canonical key plus a mechanical bound on the FINDINGS/RESPONSE cycle via a forced DISPUTED evaluation on a second rebuttal of a still-open ID. Also genuinely closed: fixture-proven state/fingerprint disambiguation replacing fail-closed escalation with the ledger correctly split from blind retry; AST extraction and execution of the fenced recipe with a body-bytes assertion; explicit per-package licence mappings validated against esbuild's metafile by set equality; a measured size baseline replacing the invented 4 MiB; the '## Resolved' heading named; the crash-scratch exposure as a real backlog item; the posture probe given a named preflight consumer; recipe output discipline; the branch regex with slug independence; the mutating-check short circuit justified and split by A/B timing; the corrected ordering-only adjudication rationale; invariant 15 split into actor-initiated boundaries versus harness-capability reporting; Node 22 in preconditions; item 1's stop scope narrowed to items 5, 6, 8; the length-mismatch consumer contract; a concrete tool-call-audit mechanism for case 19; and docs/business.md added to the inventory, an omission I had not caught. I attacked the core again and it held everywhere except arithmetic. Three real defects remain, one of them a hard platform break. First, the combined A+B release prompt is capped at 135,168 bytes and delivered as ONE argv element via spawnSync, but Linux caps a single argv string at MAX_ARG_STRLEN = PAGE_SIZE*32 = 131,072 bytes and fails execve with E2BIG above it, so the maximum-size case this spec mandates as both a QC fixture and E2E case 4 cannot execute on Linux; the failure is size-dependent, passing on small reviews and failing on thorough ones, and it is newly introduced because the prior 65,536-byte-per-prompt design sat safely under the limit. Second, removing multi-batch was right for barrier integrity but its cost was not priced: one 180-row handoff is now the binding constraint on a complete two-vendor review, docs/glossary.md defines a finding as carrying Evidence, Impact and Expected fix and being copied whole and 'never summarised', and the specified path for oversized output (one compact reissue, then unknown, then attention) applies summarisation pressure and wakes the human for being thorough, which is precisely the invisible failure docs/architecture/full-turn-retrieval.md calls the most expensive this architecture can produce; the 180 figure is derived from what extraction can fixture, not from what a review needs, and no measurement or backlog record captures the trade. Third, this revision's own improvement to the transport-UNKNOWN matrix (retaining actual completed gate values) left the gate sentence unchanged, so a handoff with status=UNKNOWN, unknown=transport, qc=PASS, smoke=PASS, checks=PASS now literally satisfies 'deterministic review passes only when both reviewers report qc=PASS; smoke=PASS; checks=PASS|NA' — a partial pass, which AGENTS.md forbids outright; the final verified-result list still requires status PASS, so a run cannot complete on it, but the named gate leaks. Minors: the framing allowance left by 135,168 minus 2x65,536 is 4,096 bytes for the goal, two adversarial wrappers, four delimiters, labels and lengths, unstated and untested for feasibility; several newly asserted Herdr details (HERDR_TAB_ID, HERDR_WORKSPACE_ID, tab list --workspace, pane split --current and --pane/--cwd forms, the plain --wait settled defaults, mo-posture.sh --self-check) lack the exact-installed-version fixture hedge that tab create's root_pane correctly received; the canonical key's open-ids and status components are undefined for executor, E2E and adjudication events; scenarios is unconstrained for E2E FAIL and UNKNOWN; the forced-dispute prompt has no specified text unlike every other orchestrator-authored prompt; 'recheck capability and resume' for credentials/subscription names neither owner nor permitted command; and the posture-probe QC bullet needs a fake-shell fixture or it becomes environment-dependent. Every finding is local; none invalidates the design.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "Combined relay exceeds the Linux per-argument limit",
          "description": "The combined A+B release prompt is 'at most 135,168 bytes including the goal and both wrappers' and 'The complete framed goal is one argv element', delivered via spawnSync('herdr', argv, { shell: false }). On Linux a single argv string is bounded by MAX_ARG_STRLEN = PAGE_SIZE * 32 = 131,072 bytes, and exceeding it fails execve with E2BIG independently of total ARG_MAX headroom. 135,168 exceeds that, so the maximum-size case the spec mandates both as a QC fixture ('one combined A+B release goal under 135,168 bytes') and as E2E case 4 cannot execute on Linux. The failure is size-dependent: small reviews succeed and thorough ones fail, which is the worst shape for a transport defect, and it passes on macOS (no per-argument cap) so it surfaces only in CI or on a Linux user's machine. The limit may also apply a second time where herdr forwards the prompt onward. This constant is new in this revision; the prior 65,536-byte-per-prompt design sat safely below the limit and combining two handoffs into one argv element is what crossed it.",
          "required_change": "Re-derive the caps from the platform limit: set the combined framed goal ceiling at or below 131,072 bytes including all framing, back out an explicit framing allowance, and reduce the per-reviewer handoff cap accordingly (for example 61,440 bytes each with an 8 KiB framing allowance). Add a QC assertion that the ceiling is strictly below MAX_ARG_STRLEN and an E2E case exercising the exact boundary on Linux. Alternatively prove a delivery path not bounded by MAX_ARG_STRLEN (prompt bytes on stdin) with its own fixture, and state the platform assumption explicitly either way."
        },
        {
          "id": "",
          "severity": "major",
          "area": "180-row single handoff versus finding completeness",
          "description": "Removing multi-batch was correct for barrier integrity, and the ledger's reasons are sound, but the consequence was not priced. A reviewer now gets one handoff of at most 180 recent-unwrapped rows and 65,536 bytes for a complete review of an entire feature, while docs/glossary.md defines a finding as carrying Evidence, Impact and Expected fix and being 'copied to the author whole and verbatim. Never summarised.' In a half-width alternate-screen pane 180 rendered rows is roughly 90-120 wrapped lines, which is a handful of substantive findings with evidence rather than a thorough two-vendor review. The specified failure path (one compact reissue, then unknown, then reviewer-UNKNOWN retry once, then needs_attention) both wakes the human for thoroughness and applies compression pressure on the reviewer, which is exactly the invisible self-censoring truncation docs/architecture/full-turn-retrieval.md identifies as 'the most expensive failure this architecture can produce'. The 180-row figure is derived from what TUI extraction can fixture, not from what a review requires, and nothing records the trade-off, measures a real review's row count, or gives a reviewer a bounded way to signal that more exists.",
          "required_change": "Either bound findings per handoff by explicit count with an orchestrator-visible continuation field (no buffering protocol needed, since the orchestrator simply does not release until the reviewer reports terminal), or measure a real review's row count as a fixture and record the accepted limitation in docs/backlog.md with reason, practical impact, and next step. Reconcile with the glossary's 'never summarised' finding definition so the reviewer instruction does not silently ask for summarisation."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Deterministic-review gate satisfiable by an incomplete handoff",
          "description": "This revision correctly improved the UNKNOWN matrix so a transport unknown retains actual completed gate values rather than forcing a spurious UNKNOWN field, but the gate statement was not updated with it. 'Deterministic review passes only when both reviewers report: qc=PASS; smoke=PASS; checks=PASS|NA' is now literally satisfied by a handoff with status=UNKNOWN, unknown=transport, qc=PASS, smoke=PASS, checks=PASS. AGENTS.md is unambiguous that a gate whose full verdict cannot be read is unknown and repeated and that there is no partial pass. The final verified-result list still requires both final reviews to be PASS, so a run cannot complete on this alone, but 'deterministic review passes' is a named gate and an implementer encoding the sentence into QC data cases will reproduce the leak.",
          "required_change": "Add status=PASS and unknown=none to the deterministic-review pass condition, and add a QC data case asserting that a transport-UNKNOWN handoff carrying all-PASS gate fields does not satisfy it."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Newly asserted Herdr surface details lack the fixture hedge",
          "description": "The tab-ID fix introduces HERDR_TAB_ID, HERDR_WORKSPACE_ID, 'herdr tab list --workspace', 'herdr pane split --current --direction right --cwd --no-focus', 'herdr pane split --pane <id> --direction right --cwd --no-focus', and 'the plain --wait form uses Herdr's documented settled defaults'; the posture preflight introduces 'scripts/mo-posture.sh --self-check -- <selected-providers>'. None of these flags, env vars, or invocation forms is confirmed against the verified herdr 0.8.0 surface or the probe's documented per-shell 0/1/2 interface. The spec hedges correctly one line earlier for tab create ('The exact installed-version fixture requires tab create to return that root pane ID; absence makes the surface unsupported rather than inventing a lookup') but not for these, and the precondition 'all named public Herdr commands' is not a per-flag or per-env-var check. Item 3 lists only 'mo-posture.sh consumer instructions', leaving unclear whether --self-check exists or must be added.",
          "required_change": "Apply the tab-create hedge uniformly: name each env var, flag, and invocation form as requiring an exact installed-version fixture, with absence making the surface unsupported rather than substituting a lookup. State whether mo-posture.sh --self-check exists today or is added in item 3, and enumerate the exact flags the precondition check covers."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Canonical no-progress key components undefined for three header types",
          "description": "The key is <candidate, actor, phase, header-type, status, open-ids>, but executor headers carry rebuts rather than open, MO_E2E_V1 carries neither, and MO_ADJUDICATION_V1 has no status in the review sense. Two of six components are therefore undefined for three of four header types, and this key is what now bounds the FINDINGS/RESPONSE cycle and the global livelock guard.",
          "required_change": "Define open-ids as the orchestrator's tracked open-ID set at event time and status as the header's own status field where the type has one (otherwise the event kind), so the key is total across all actors, and add a QC case per header type."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Framing budget unstated; E2E scenarios unconstrained; forced-dispute prompt missing",
          "description": "135,168 minus two 65,536-byte handoffs leaves 4,096 bytes for the goal text (about 250 bytes as quoted), two adversarial-framing wrappers, four 32-character delimiters, two labels, and two declared lengths. That is probably feasible at roughly 1.9 KiB per wrapper but is neither budgeted nor tested, and the mandated maximum-size fixture will fail with no stated resolution if the authored wrapper exceeds it. Separately, the E2E rules constrain not_run for FAIL and UNKNOWN but never constrain scenarios, so status=FAIL|scenarios=none|not_run=none is a valid header describing nothing. And the forced-dispute message the orchestrator must send has no specified text, although it must mechanically constrain the origin reviewer to exactly three outcomes (return DISPUTED, close the ID, or produce a new finding) while every other orchestrator-authored prompt in the spec is given verbatim.",
          "required_change": "State the per-frame framing allowance explicitly, derive the combined ceiling from it, and make an over-budget wrapper a build failure rather than a run failure. Constrain scenarios for E2E FAIL and UNKNOWN. Give the forced-dispute prompt verbatim text naming the three permitted outcomes."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Capability recheck and posture-probe test determinism",
          "description": "The credentials/subscription resume row says 'recheck capability and resume without resending an accepted turn' without naming whose capability or which permitted command performs the recheck; subscription is checkable through the model helper, but credentials generally are not observable to the orchestrator. Separately, the QC bullet 'posture probe invocation and structural output classification' asserts a deterministic non-mutating test of a probe that classifies real shell startup modes and first resolved paths, which is environment-dependent under mo-qc unless a fixed fake-PATH/fake-shell fixture is specified. Also 'explicit approval resumes that E2E turn' is loose: the turn ended when the actor settled and emitted BLOCKER, so what happens is a new prompt to the same warm actor.",
          "required_change": "Name the permitted recheck command per class and state that credentials cannot be verified by the orchestrator, so resume is attempt-and-observe. Specify the fake-PATH/fake-shell fixture the posture QC case runs against. Reword E2E blocker resume as a new prompt to the same warm actor."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Ledger does not record a reverted decision",
          "description": "The provider-posture precondition was present, silently dropped in an earlier compression, and now returns in stronger form as a named preflight consumer. The ledger records the current position ('Shipped provider-posture probe has no runtime consumer | rejected') but not the round trip, and recording reversals is the ledger's stated purpose, as the superseded/adopted issue-candidate pair demonstrates.",
          "required_change": "Add a superseded row recording that a posture precondition was briefly absent and why it returned, matching the pattern already used for the issue-candidate count."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Manual gate size",
          "description": "The agentic gate remains 25 cases plus H7b plus per-provider 180-row fixtures for one human observer, though correctly sequenced with capability proof first and cutover last, and this revision explicitly moves every extraction case that does not need live alternate-screen repaint into deterministic golden recent-unwrapped captures, which materially reduces the manual burden.",
          "required_change": "Record per-fixture evidence in docs/phase-0-fixtures.md as each case lands, and state which of the 25 remain irreducibly manual after the golden captures exist."
        }
      ],
      "assumptions": [
        "I treated the herdr 0.8.0 surface established earlier in this session as ground truth: agent start/prompt/get/wait with the five lifecycle states, tab create --cwd --label --no-focus, tab rename, absence of tab move, pane split --direction right|down --no-focus, pane process-info, pane report-metadata --token as display-only, the [a-z][a-z0-9_-]{0,31} name regex, the documented five-second submission window and agent_prompt_stalled, state_change_seq as a JSON field with no CLI flag, and no documented --lines maximum. HERDR_ENV is not set here, so no live behaviour was exercised, and I treat HERDR_TAB_ID, HERDR_WORKSPACE_ID, tab list --workspace, the pane split --current/--pane/--cwd forms, and mo-posture.sh --self-check as unverified claims rather than errors.",
        "I treated Linux MAX_ARG_STRLEN as PAGE_SIZE * 32 = 131,072 bytes per single argv string, with E2BIG on excess, and macOS as having no equivalent per-argument cap under a roughly 1 MiB total. I did not execute a test to confirm this in the current environment; the finding rests on the documented kernel constant.",
        "I re-read docs/glossary.md, docs/architecture/full-turn-retrieval.md, and docs/architecture/distribution.md this pass, and relied on earlier reads of docs/acceptance.md, docs/phase-0-fixtures.md, docs/backlog.md including its '## Resolved' heading, the Makefile, tools/build-skills.mjs and its explicit file-pair SHARED_PLAN, and shared/scripts/mo-models.mjs.",
        "I compared this revision against the immediately preceding one to separate real closures from rewording, and verified each closure against the body rather than the ledger claim.",
        "I estimated 180 rendered half-width rows as roughly 90-120 wrapped prose lines; the finding is that the spec records no measurement, not that my estimate is authoritative.",
        "I assumed AGENTS.md's no-partial-pass rule and its backlog rule apply to this feature's own gates and accepted limitations.",
        "I did not inspect any prior council artifact under spec/**, per instructions, beyond file paths cited by tracked documents.",
        "Two MCP servers (claude.ai, b24-dev-mcp) require interactive authorization and were unavailable; no finding depends on them."
      ],
      "round": 1,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 8
would_adopt: false
