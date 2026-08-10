## Framing: what a compression-plus-freeze revision demands

Two things changed in this revision, and they pull in opposite directions for a reviewer. The document was compressed hard — roughly a third shorter — and it gained a governance layer: an "Architecture freeze and implementation authority" section, invariants 20–21, ten completion/cutover criteria, and three ledger rows including one that rejects reopening architecture on the stated grounds that "no remaining architectural defect was identified." Compression is where normative rules quietly disappear, so the first job is diffing for lost obligations rather than admiring the tighter prose. And a freeze clause asserted inside the artifact under adversarial review has to be checked against the actual state of open findings, because if the premise is false the clause converts a review conclusion into a review premise.

Both checks produced results. Three majors from my previous pass are untouched — including the one hard platform break — the sentence that made that break visible was deleted in compression, two normative rules were lost (one of them the direct answer to the user's headline complaint), and the new completion criteria contradict the new invariant 21 together with invariant 12. Grounding is unchanged: the verified `herdr 0.8.0` surface, `docs/glossary.md`, `docs/architecture/full-turn-retrieval.md`, `distribution.md`, the `Makefile`, `tools/build-skills.mjs`, and `AGENTS.md`.

---

## Facts & Constraints (White Hat)

**Genuinely valuable new material.** The completion and cutover criteria close a real gap I had not raised: previous revisions could be "approved" on prose alone, and criterion 3–5 plus invariant 21 now require named-SHA evidence, item 9 forbids architecture questions disguised as implementation TODOs, and "A failed empirical support gate is a legitimate fail-closed outcome, not incomplete architecture" is exactly the right framing for a fixture-gated design. Invariant 20 is also a clean formalization of last revision's live-incident-versus-isolated-reproduction split, and it composes correctly with invariant 14 rather than fighting it.

**The autonomy clause partially closes one of my prior findings.** "Exact installed command output fields, fixture capture bytes, licence filenames, and equivalent safe quoting details are empirical implementation facts," plus the ledger row "Equivalent safe implementation detail within invariants — adopted," gives an implementer permission to substitute an equivalent discovery mechanism if `HERDR_TAB_ID` or `tab list --workspace` do not exist as asserted. That is a reasonable answer to my pass-7 minor about unhedged Herdr flags, and I downgrade it accordingly.

**What compression removed.** Comparing against the previous revision, four normative statements are gone with no replacement:

- **"A wait never predicts SHA, cleanliness, terminal prose, or sleeps."** The SHA half survives in Purpose ("waits follow actor lifecycle, never predicted Git changes"). The *no-sleep* half does not survive anywhere — not in the lifecycle table, not in the error contract, not in the ledger.
- **"Only one waiter per actor."**
- **"Reviewer/E2E prompts contain locator, candidate, role, protocol version, and limits, but no tracked content."**
- The scratch prefix rule ("Its project-owned prefix contains no actor data") and the explicit "The complete framed goal is one argv element."

**Considered and dismissed as defects.** A surface whose isolated fixture passes but which fails every live gate does not stay supported forever under invariant 20, because repeated identical terminal keys trip the no-progress guard into attention — so invariant 20 is bounded, not a loophole. Running the shipped posture probe and model helper still does not breach invariant 1, since those are executed skill assets whose narrow classification output is explicitly bounded. The blocker table losing its "human-visible report" column is not a loss, because the following sentence enumerates exactly what the orchestrator reports.

---

## Risks & Failure Modes (Black Hat)

### 1. The combined relay still exceeds Linux's per-argument limit, and the sentence that made it visible was deleted (major, unaddressed from pass 7)

"Combined A+B resolution is at most 135,168 bytes including goal and wrappers," delivered through `herdr agent prompt <actor> <text>` via `spawnSync("herdr", argv, { shell: false })`. On Linux a single `argv` string is capped by `MAX_ARG_STRLEN` = `PAGE_SIZE * 32` = 131,072 bytes, and exceeding it fails `execve` with `E2BIG` regardless of total `ARG_MAX` headroom. 135,168 > 131,072, so the maximum-size case this spec mandates as a QC bullet ("combined release bound") and as agentic case 12 cannot execute on Linux. It passes on macOS, so it fails only in CI or on a Linux user's machine, and it fails *size-dependently*: small reviews work, thorough ones do not.

The previous revision at least stated the mechanism plainly — "The complete framed goal is one argv element." This revision removed that sentence while keeping the number, which makes the constraint harder for an implementer to notice without changing it at all. Nothing in the new autonomy clause obviously authorizes lowering the ceiling either: a byte cap on the transport reads as "transport boundary," which the freeze lists among things implementation "does not reopen."

### 2. Completion criteria contradict invariant 21, invariant 12, and decomposition item 8 (major, new)

Criteria 3–5 require that "H7b and all applicable H13–H37 scenarios pass against one named candidate SHA," that "both reviewers pass that same SHA," and that "applicable E2E passes that SHA." Criterion 6 then requires that "the old inline/headless route is removed in the cutover increment," and decomposition item 8 orders it: "Run full flow and remove off-contract behavior **only after** fixture proof."

Removal is a commit. Invariant 12 says every later commit invalidates all prior gates; invariant 21 says no increment may claim completion while its evidence is "stale, or bound to another SHA." So the ordering the spec prescribes guarantees that at the moment of adoption, criteria 3–5 refer to a SHA that criterion 6 has already invalidated. The criteria are jointly unsatisfiable as written, and the failure is not cosmetic: it is the adoption gate, so an implementer must either re-run the entire 25-case agentic suite post-cutover (which the spec does not say) or knowingly present stale evidence (which invariant 21 forbids).

### 3. The 180-row single handoff still collides with the finding definition, and the reviewer is no longer told the limit (major, unaddressed from pass 7)

Each reviewer emits "one handoff of at most 180 rows and 65,536 bytes" for a complete review of an entire feature; oversize gets "one compact correction," then `unknown`, then attention. `docs/glossary.md` as it exists defines a finding as carrying "`Evidence`, `Impact` and `Expected fix`" and being "Copied to the author whole and verbatim. **Never summarised.**" This revision's canonical-vocabulary list reduces the entry to "**finding** — reviewer-owned `A-*` or `B-*` issue" and enumerates five obsolete claims it removes — the never-summarised content requirement is not among them. So either that requirement survives and conflicts with the row cap, or it is being silently dropped by a reconciliation that does not name it. Both are defects, and the second is worse, because it deletes the guarantee `full-turn-retrieval.md` calls the reason the whole mechanic exists.

Compression made this materially worse: the rule that reviewer prompts carry "protocol version, and limits" is gone, so reviewers are now held to a cap nobody tells them about. The predictable result is oversize → correction → `unknown` → the human woken because a reviewer was thorough, with compression pressure as the only feedback signal.

### 4. The no-sleep and single-waiter rules were lost, and the no-sleep rule is the user's headline complaint (major, new regression)

The user's longest quoted passage is a post-mortem of a 55-iteration, 60-second-per-iteration polling loop that wasted 47 minutes, and its stated lesson has two halves: wait on the direct predicate, and do not sit in a sleep loop. Previous revisions carried "A wait never predicts SHA, cleanliness, terminal prose, **or sleeps**." This revision retains the SHA half in Purpose and drops the sleep prohibition entirely — it appears in no invariant, no lifecycle row, no error-contract row, and no ledger entry. Nothing now forbids an implementer from writing exactly the loop the user complained about; the wait-arm timeouts survive only as an inline annotation on one command (`<600000 executor | 300000 other>`), and "only one waiter per actor" is gone too, which matters because two concurrent waiters on one actor would race on the same state transition.

### 5. The freeze clause rests on a false premise and does not classify numeric limits (major, new)

The ledger reads: "Reopen settled architecture during implementation | rejected | **No remaining architectural defect was identified**; implementation must execute the frozen contract." As of this document that rationale is not true — finding 1 is an open, unaddressed transport defect carried from the previous review, and finding 2 is a contradiction inside this revision's own adoption gate. Asserting the absence of findings inside the artifact under adversarial review states the review's conclusion as its premise, and it is the one place in an otherwise disciplined ledger where a rationale is not evidence-backed.

The mechanical consequence is worse than the rhetorical one. The freeze's escape hatch covers "exact installed command output fields, fixture capture bytes, licence filenames, and equivalent safe quoting details" — it does not mention numeric limits, and it declares any change to "transport boundaries" or "completion proof" unauthorized. So an implementer who discovers on Linux that 135,168 cannot execute is told both that they may not reopen architecture and that transport boundaries are frozen. The freeze should be permitting that fix; as drafted it plausibly forbids it.

### 6. Remaining smaller gaps, all carried

The **deterministic-review gate is still satisfiable by an incomplete handoff**: "Both reviewers must report QC/smoke pass and additional checks pass/NA" is literally satisfied by `status=UNKNOWN|unknown=transport|qc=PASS|smoke=PASS|checks=PASS`, because this revision's own (correct) rule is that "Transport retains already completed gate values." The final verified-result list still requires both reviews to pass, so a run cannot complete on it, but `AGENTS.md` is categorical — "There is no partial pass" — and an implementer will encode the sentence as written. The **no-progress key** `<candidate, actor, phase, header-type, status, open-ids>` still names two components that only reviewer headers carry, leaving the guard undefined for executor, E2E, and adjudication events. The **framing budget** is still unstated (135,168 − 2×65,536 = 4,096 bytes for a goal, two adversarial wrappers, four delimiters, labels, and lengths), and the mandated maximum-size fixture has no stated resolution if the authored wrapper exceeds it. **E2E `scenarios` is still unconstrained for `FAIL` and `UNKNOWN`**, so `status=FAIL|scenarios=none|not_run=none` remains a valid header describing nothing. The **forced-dispute prompt** still has no text although it must confine the origin reviewer to three outcomes. **"Recheck external capability"** still names neither owner nor permitted command, and credentials are not observable to the orchestrator at all. The **posture QC bullet** still names no fake-`PATH`/fake-shell fixture for a probe that classifies real shell startup modes. And compression weakened two checkable rules to vaguer prose: "positive integers are canonical" replaced "canonical unsigned base-10 without leading zeros," and the ID rule lost "comma-separated, numerically sorted within prefix."

### 7. Scope ambiguity in the fail-closed path (minor, new)

"Fewer than two passing vendors stops Herdr actor-surface implementation while leaving backend-neutral, knowledge, and catalogue increments independently deliverable" — but completion criterion 1 requires "capability proof establishes two supported reviewer vendors" as a precondition for presenting *implementation* for adoption. Read together, the contract work that answers the user's backlog, changelog, glossary, and model-catalogue complaints becomes unadoptable if a TUI fixture fails, which is plainly not the intent.

---

## Strengths & Benefits (Yellow Hat)

The protocol core continues to hold under direct attack, and everything I confirmed last pass survives compression intact: extraction cannot capture a prior turn, the relay cannot reach a shell and is output-disciplined and length-validated on the consumer side, identity cannot be spoofed, findings cannot drift, the ID floor survives actor replacement, and support cannot be talked up or down. The fixture-proven fingerprint disambiguation, the phase-and-source blocker routing, and the mechanically forced dispute after a second rebuttal all survive with their teeth.

Deriving goal deactivation from observed lifecycle rather than inventing a suspend command remains the best single decision in the document, and the honest consequence is retained: a provider that cannot establish the implication is unsupported. The completion and cutover criteria are a real addition — separating "the architecture is agreed" from "a route is proven" is exactly the discipline this project's contract demands, and invariant 21's ban on evidence "bound to another SHA" is the correct generalization of `AGENTS.md`'s SHA rule. The compression itself is mostly skillful: the blocker table got tighter without losing routing, and the error contract lost words rather than rows.

---

## Alternatives & Creative Ideas (Green Hat)

**A.** Re-derive the caps from the platform limit: combined ceiling ≤ 131,072 bytes including framing, with a stated framing allowance (say 8 KiB) and per-reviewer handoffs at 61,440 bytes; add a QC assertion that the ceiling is strictly below `MAX_ARG_STRLEN` and one Linux boundary case. Alternatively fixture a stdin delivery path, which sidesteps the limit entirely.
**B.** Order cutover *before* the proving run: the cutover increment produces the candidate, and criteria 3–5 then apply to that post-cutover SHA. One reordering makes ten criteria consistent.
**C.** Restore the two lost rules verbatim ("a wait never sleeps"; "only one waiter per actor") and restore "protocol version and limits" to reviewer prompts so the cap is knowable by the party bound to it.
**D.** Replace the freeze rationale with something true — "no architectural defect remains *unaddressed in the ledger*" — and add numeric limits, byte ceilings, and row caps to the explicitly revisable-on-evidence list, so lowering a cap is authorized while changing a boundary is not.
**E.** Either restore the finding-content requirement (Evidence/Impact/Expected fix, never summarised) and add a counted-continuation field, or name it explicitly in the list of glossary claims being removed and record the accepted loss in backlog with a measurement.
**F.** Add `status=PASS` and `unknown=none` to the deterministic-review condition, with a QC case asserting a transport-`UNKNOWN` all-PASS handoff fails it.

---

## Completeness & Process (Blue Hat)

Missing: the platform reconciliation for the combined relay; the cutover/SHA ordering fix; the no-sleep and single-waiter rules; reviewer-visible limits; `status`/`unknown` in the deterministic gate; the key's components for non-reviewer events; the framing allowance; `scenarios` for two E2E states; the forced-dispute text; the capability-recheck owner; the posture test fixture; and a truthful freeze rationale. `Open questions` correctly contains no `TBD`, but item 9 of the completion criteria ("no architecture question remains disguised as an implementation TODO") is now in tension with findings 1 and 2, which are exactly that.

---

## Traceability

The ledger (~75 rows) remains the document's strongest artefact, and all three new rows have body homes: the freeze section, the completion criteria, and the autonomy bullet list. Every rejected row I sampled appears in "Rejected and deferred alternatives," including the new "reopen settled architecture to avoid empirical proof."

Three defects. The rationale "No remaining architectural defect was identified" is false as of this revision and is the only non-evidence-backed rationale in the table. The 135,168-byte ceiling, the 180-row cap's trade-off against finding completeness, and the now-deleted no-sleep and single-waiter rules have no rows, so nothing records that they were decided rather than lost — which is precisely the omission class invariant 19 and the impact inventory exist to prevent. And there is still no row recording the round trip of the provider-posture precondition (dropped in one revision, restored in stronger form in the next), although the ledger's own superseded/adopted pattern for issue candidates shows how to do it.

---

## Decomposition Readiness

Items 2, 4, 5, and 7 are executable. Item 3 is executable given the explicit metafile-to-mapping equality. Item 6 carries an unresolved decision: the byte ceiling must be re-derived against the platform limit, and the freeze does not clearly authorize that. Item 8 is not executable as ordered — it prescribes a sequence that invariant 21 forbids. Item 1's fail-closed scope needs the criterion-1 ambiguity resolved before an implementer knows whether contract work is adoptable without vendor fixtures.

---

## Weak-Model Executability

Still strong for the grammar, both matrices, blocker routing, the ambiguity decision procedure, the extraction ladder, the branch regex, the fallback ladder, and the verbatim goal texts. Newly weakened by compression: "positive integers are canonical" and the ID sorting rule lost their exact statements, so a weak model must reconstruct them; wait arms exist only as an inline annotation with the single-waiter rule gone; and "never sleeps" is absent, which is the single most likely thing a weak model will get wrong given that polling is the obvious implementation. Still guessing: the forced-dispute text, the key's components for three header types, the framing budget, and whether the asserted Herdr flags exist.

---

## Contract Completeness

Specific: full grammar and field order, both matrices, blocker classes with routing, 180 rows / 65,536 bytes, the combined bound, pinned dependency versions, measured size baseline with tolerance, metafile/licence set equality, the branch regex, the extraction ladder, 25 mapped acceptance cases, and ten completion criteria. Incomplete or self-contradictory: the combined ceiling versus the platform limit; criteria 3–6 versus invariants 12 and 21; the deterministic-review condition; the no-progress key's components; the framing allowance; E2E `scenarios` for two states; and the two normative rules lost in compression.

---

## Overall

The governance additions are worth keeping — separating architectural agreement from proven support, and binding evidence to a named SHA, are both right. But this revision addressed none of the three majors from the previous pass, and compression actively degraded two of them: the sentence that exposed the argv-length break was deleted while the number stayed, and the rule telling reviewers their own size limit was dropped while the limit stayed. It then added two new majors of its own — the completion criteria contradict the invariant they were written alongside, and the freeze clause is grounded in a claim of no-remaining-defects that this review contradicts twice — and it lost the explicit no-sleep prohibition, which is the direct textual answer to the user's longest and most concrete complaint. Every item remains a local change and the architecture still holds under attack, but a revision that neither fixes prior findings nor preserves prior rules, while declaring itself frozen, has moved backwards.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 7,
      "would_adopt": false,
      "summary": "The protocol core still holds under direct attack, and the new governance layer is genuinely valuable: the ten completion/cutover criteria and invariant 21 correctly separate 'architecture agreed' from 'route proven' and forbid evidence bound to another SHA, invariant 20 cleanly formalizes live-incident versus isolated-reproduction, and the autonomy clause reasonably closes my prior minor about unhedged Herdr flags by letting an implementer substitute equivalent discovery mechanisms. But this revision addressed none of the three majors from the previous pass, and its compression made two of them worse. The combined A+B resolution ceiling remains 135,168 bytes delivered through one herdr agent prompt text argument via spawnSync, while Linux caps a single argv string at MAX_ARG_STRLEN = PAGE_SIZE*32 = 131,072 bytes with E2BIG above it, so the maximum-size case mandated as a QC bullet and as agentic case 12 cannot execute on Linux, failing size-dependently and only off macOS; the previous revision at least stated 'The complete framed goal is one argv element', and deleting that sentence while keeping the number makes the break harder to notice without fixing it. The 180-row single reviewer handoff still collides with docs/glossary.md's finding definition (Evidence, Impact, Expected fix, 'copied whole and verbatim, never summarised'), which the canonical-vocabulary list silently thins without naming that requirement among the five obsolete claims it removes, and compression deleted the rule that reviewer prompts carry 'protocol version, and limits', so reviewers are now bound to a cap nobody tells them about, with oversize leading to correction, unknown, and a human woken for thoroughness. The deterministic-review gate is still literally satisfied by status=UNKNOWN|unknown=transport|qc=PASS|smoke=PASS|checks=PASS, a partial pass AGENTS.md forbids outright. Two new majors appeared. Completion criteria 3-5 require H7b, H13-H37, both reviews, and E2E to pass one named SHA, while criterion 6 and decomposition item 8 require the off-contract route to be removed after that proof; removal is a commit, so invariant 12 invalidates the evidence and invariant 21 then forbids claiming completion on it, making the adoption gate jointly unsatisfiable as ordered. And the freeze rests on the ledger rationale 'No remaining architectural defect was identified', which is false as of this document given the open argv break and this contradiction, asserting the review's conclusion as its premise; worse, the escape hatch enumerates command output fields, fixture bytes, licence filenames, and quoting details but not numeric limits, while declaring transport boundaries and completion proof frozen, so an implementer who discovers the Linux limit is plausibly forbidden from lowering the cap. Compression also lost two normative rules with no replacement: 'only one waiter per actor', and 'a wait never predicts SHA, cleanliness, terminal prose, or sleeps' whose no-sleep half now appears in no invariant, lifecycle row, error row, or ledger entry, leaving nothing that forbids exactly the 55-iteration 60-second polling loop the user's longest quoted complaint describes. Carried minors: the no-progress key names status and open-ids, which only reviewer headers carry; the 4,096-byte framing allowance is unstated and untested; E2E scenarios is unconstrained for FAIL and UNKNOWN; the forced-dispute prompt has no text; 'recheck external capability' names neither owner nor command; the posture QC bullet needs a fake-shell fixture; 'positive integers are canonical' and the ID sorting rule were weakened from exact statements; and criterion 1 read against the fail-closed scope makes contract work unadoptable if a TUI fixture fails. Every finding is local and the architecture still holds, but a revision that fixes no prior finding, deletes two prior rules, and declares itself frozen has moved backwards.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "Combined relay exceeds the Linux per-argument limit",
          "description": "Unaddressed from the previous review. 'Combined A+B resolution is at most 135,168 bytes including goal and wrappers', delivered through herdr agent prompt <actor> <text> via spawnSync('herdr', argv, { shell: false }). On Linux a single argv string is bounded by MAX_ARG_STRLEN = PAGE_SIZE * 32 = 131,072 bytes, with execve failing E2BIG above it independently of total ARG_MAX headroom. 135,168 exceeds that, so the maximum-size case mandated by the QC bullet 'combined release bound' and by agentic case 12 cannot execute on Linux. The failure is size-dependent (small reviews pass, thorough ones fail) and absent on macOS, so it surfaces only in CI or on a Linux user's machine. This revision additionally deleted the previous sentence 'The complete framed goal is one argv element' while keeping the number, which removes the reader's cue to the constraint without changing it, and the new freeze section lists transport boundaries among things implementation may not reopen.",
          "required_change": "Re-derive the caps from the platform limit: combined framed goal at or below 131,072 bytes including all framing, with an explicit framing allowance and a correspondingly reduced per-reviewer cap (for example 61,440 bytes each with 8 KiB framing). Add a QC assertion that the ceiling is strictly below MAX_ARG_STRLEN and one Linux boundary case, or fixture a stdin delivery path not bounded by it. Restore an explicit statement of how many argv elements the prompt occupies, and add a ledger row for whichever number is chosen."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Completion criteria contradict invariants 12 and 21",
          "description": "Criteria 3-5 require H7b and all applicable H13-H37 scenarios, both reviewer passes, and applicable E2E to pass 'one named candidate SHA'. Criterion 6 requires the old inline/headless route to be removed in the cutover increment, and decomposition item 8 orders that removal 'only after fixture proof'. Removal is a commit; invariant 12 says every later commit invalidates all prior gates and invariant 21 forbids claiming completion on evidence that is stale or bound to another SHA. So at the moment of adoption, criteria 3-5 necessarily reference a SHA that criterion 6 invalidated, making the ten criteria jointly unsatisfiable as ordered. The implementer must either silently re-run the entire 25-case agentic suite post-cutover, which the spec does not say, or present stale evidence, which invariant 21 forbids.",
          "required_change": "Order cutover before the proving run so the cutover increment produces the candidate that criteria 3-5 then prove, or state explicitly that pre-cutover fixture runs are capability evidence rather than gates and that criteria 3-5 apply only to the final post-cutover SHA. Update decomposition item 8 to match."
        },
        {
          "id": "",
          "severity": "major",
          "area": "180-row handoff versus finding completeness, and the limit is no longer told to reviewers",
          "description": "Unaddressed from the previous review and now worse. Each reviewer emits one handoff of at most 180 rows and 65,536 bytes for a complete review of an entire feature, with oversize leading to one compact correction, then unknown, then attention. docs/glossary.md as it exists defines a finding as carrying Evidence, Impact and Expected fix and being 'copied to the author whole and verbatim. Never summarised.' This revision's canonical-vocabulary list reduces the entry to 'reviewer-owned A-* or B-* issue' and enumerates five obsolete claims it removes, none of which is that content requirement, so the requirement either survives and conflicts with the cap or is dropped without being named. Compression additionally deleted the rule that reviewer prompts contain 'protocol version, and limits', so reviewers are bound to a cap they are never told, and the only feedback signal is compression pressure, which is the invisible self-censoring truncation docs/architecture/full-turn-retrieval.md identifies as the most expensive failure this architecture can produce.",
          "required_change": "Restore 'locator, candidate, role, protocol version, and limits' to reviewer and E2E prompts. Then either bound findings per handoff by explicit count with an orchestrator-visible continuation field, or name the finding-content requirement explicitly in the list of glossary claims being changed and record the accepted limitation in docs/backlog.md with a measured row count for a real review."
        },
        {
          "id": "",
          "severity": "major",
          "area": "The no-sleep and single-waiter wait rules were lost in compression",
          "description": "The previous revision carried 'A wait never predicts SHA, cleanliness, terminal prose, or sleeps' and 'only one waiter per actor'. The SHA half survives in Purpose; the no-sleep prohibition survives nowhere, and neither does the single-waiter rule. The user's longest quoted passage is a post-mortem of a 55-iteration, 60-second-per-iteration polling loop that wasted 47 minutes, and its lesson has two halves: wait on the direct predicate, and do not sit in a sleep loop. Nothing in this revision now forbids exactly that loop; the wait arms survive only as an inline annotation on one agent wait command, and two concurrent waiters on one actor would race on the same state transition.",
          "required_change": "Restore both rules verbatim as normative text with ledger rows, and restore the wait-arm bullet list (executor 10 minutes per arm, reviewer/E2E 5 minutes, one waiter per actor, returns on idle/done/blocked/unknown, never sleeps, never predicts SHA or cleanliness). Add a QC or acceptance case asserting no sleep-based polling appears in the shipped skill text."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Freeze clause rests on a false premise and does not classify numeric limits",
          "description": "The ledger row reads 'Reopen settled architecture during implementation | rejected | No remaining architectural defect was identified; implementation must execute the frozen contract.' That rationale is untrue as of this revision: the argv-length break is an open unaddressed transport defect and the completion criteria contradict invariant 21. Asserting the absence of findings inside the artifact under adversarial review states the review's conclusion as its premise, and it is the only non-evidence-backed rationale in an otherwise disciplined ledger. Mechanically, the escape hatch covers 'exact installed command output fields, fixture capture bytes, licence filenames, and equivalent safe quoting details' but not numeric limits, while declaring changes to transport boundaries and completion proof unauthorized, so an implementer who discovers the Linux limit is plausibly forbidden from lowering the very cap that must change.",
          "required_change": "Replace the rationale with a truthful one (for example, no architectural defect remains unaddressed in the ledger) and add numeric limits, byte ceilings, and row caps to the explicitly revisable-on-evidence list, stating that tightening a limit within all invariants is authorized while changing a boundary, role, or completion proof is not."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Deterministic-review gate satisfiable by an incomplete handoff",
          "description": "Unaddressed from the previous review. 'Both reviewers must report QC/smoke pass and additional checks pass/NA' is literally satisfied by a handoff with status=UNKNOWN, unknown=transport, qc=PASS, smoke=PASS, checks=PASS, because this revision's own correct rule is that transport unknown 'retains already completed gate values'. AGENTS.md states categorically that a gate whose full verdict cannot be read is unknown and repeated and that there is no partial pass. The final verified-result list still requires both reviews to pass, so a run cannot complete on this alone, but the named gate leaks and an implementer will encode the sentence as written into QC data cases.",
          "required_change": "Add status=PASS and unknown=none to the deterministic-review pass condition, with a QC data case asserting a transport-UNKNOWN handoff carrying all-PASS gate fields does not satisfy it."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "No-progress key components undefined for three header types",
          "description": "The canonical key is <candidate, actor, phase, header-type, status, open-ids>, but executor headers carry rebuts rather than open, MO_E2E_V1 carries neither, and MO_ADJUDICATION_V1 has no status in the review sense. Two of six components are therefore undefined for three of four header types, and this key is the sole bound on both the response loop and global livelock.",
          "required_change": "Define open-ids as the orchestrator's tracked open-ID set at event time and status as the header's own status field where one exists (otherwise the event kind), and add a QC case per header type."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Framing budget, E2E scenarios, and forced-dispute text",
          "description": "135,168 minus two 65,536-byte handoffs leaves 4,096 bytes for the goal (about 250 bytes as quoted), two adversarial wrappers, four 32-character delimiters, labels, and lengths; the allowance is neither stated nor tested, and the mandated maximum-size fixture has no stated resolution if the authored wrapper exceeds it. E2E constrains the omitted count for FAIL and UNKNOWN but never constrains scenarios, so status=FAIL|scenarios=none|not_run=none remains a valid header describing nothing. The forced-dispute message the orchestrator must send still has no verbatim text, although it must confine the origin reviewer to exactly three outcomes, while every other orchestrator-authored prompt is given verbatim.",
          "required_change": "State the per-frame framing allowance, derive the combined ceiling from it, and make an over-budget wrapper a build failure rather than a run failure. Constrain scenarios for E2E FAIL and UNKNOWN. Give the forced-dispute prompt verbatim text naming the three permitted outcomes."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Capability recheck, posture test determinism, and fail-closed scope",
          "description": "'Recheck external capability, then resume without resubmitting accepted turn' names neither owner nor permitted command, and credentials in particular are not observable to the orchestrator, so resume can only be attempt-and-observe. The QC bullet 'posture consumer' asserts a deterministic non-mutating test of a probe that classifies real shell startup modes and first resolved paths, which is environment-dependent unless a fixed fake-PATH/fake-shell fixture is specified. And completion criterion 1 requires two supported reviewer vendors before implementation may be presented for adoption, while the fail-closed paragraph says backend-neutral, knowledge, and catalogue increments remain independently deliverable; read together, the contract work answering the user's backlog, changelog, glossary, and catalogue complaints becomes unadoptable if a TUI fixture fails.",
          "required_change": "Name the permitted recheck command per class and state that credentials cannot be verified by the orchestrator. Specify the fake-PATH/fake-shell fixture for the posture QC case. State which completion criteria gate only Herdr surface increments and which gate any increment."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Compression weakened checkable rules and lost two smaller ones",
          "description": "'Positive integers are canonical' replaced 'canonical unsigned base-10 without leading zeros', and the ID rule lost 'comma-separated, numerically sorted within prefix', so two mechanically testable statements now require reconstruction. The scratch rule that the temporary-directory prefix contains no actor data was also dropped, which matters because the prefix is derived from the locator basename and a task name would otherwise appear in the system temporary directory.",
          "required_change": "Restore the exact canonical-integer and ID-ordering wording and the scratch-prefix rule, each with its QC case."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Missing ledger rows for decided or lost numbers and rules",
          "description": "The 135,168-byte combined ceiling, the 180-row cap's trade-off against finding completeness, and the now-deleted no-sleep and single-waiter rules have no ledger rows, so nothing records whether they were decided or lost. There is also still no row recording the round trip of the provider-posture precondition, which was dropped in one revision and restored in stronger form in the next, although the ledger's superseded/adopted pattern for issue candidates shows exactly how to record that.",
          "required_change": "Add rows for the relay ceiling, the handoff-size trade-off, the wait rules, and the posture-precondition round trip."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Completion criterion 9 in tension with open findings",
          "description": "Criterion 9 requires that 'no architecture question remains disguised as an implementation TODO', which is the right rule, but the argv-length break and the criteria/invariant-21 contradiction are exactly that shape and are currently unrecorded as open questions.",
          "required_change": "Either resolve both in this revision or record them in Open questions so criterion 9 is checkable rather than aspirational."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Manual gate size",
          "description": "The agentic gate remains 25 cases plus H7b plus per-provider 180-row fixtures for one human observer, correctly sequenced with capability proof first and cutover last, and this revision retains the move of deterministic extraction cases into golden captures, which materially reduces the manual burden.",
          "required_change": "Record per-fixture evidence in docs/phase-0-fixtures.md as each case lands, and state which of the 25 remain irreducibly manual once golden captures exist."
        }
      ],
      "assumptions": [
        "I treated the herdr 0.8.0 surface established earlier in this session as ground truth: agent start/prompt/get/wait with five lifecycle states, tab create --cwd --label --no-focus, tab rename, absence of tab move, pane split --direction right|down --no-focus, pane process-info, pane report-metadata --token as display-only, the [a-z][a-z0-9_-]{0,31} name regex, the documented five-second submission window, state_change_seq as a JSON field with no CLI flag, and no documented --lines maximum. HERDR_ENV is not set here, so no live behaviour was exercised, and I treat HERDR_TAB_ID, HERDR_WORKSPACE_ID, tab list --workspace, the pane split --current/--pane/--cwd forms, and mo-posture.sh --self-check as unverified claims now largely covered by the new equivalent-implementation-detail clause rather than as errors.",
        "I treated Linux MAX_ARG_STRLEN as PAGE_SIZE * 32 = 131,072 bytes per single argv string with E2BIG on excess, and macOS as having no equivalent per-argument cap under a roughly 1 MiB total. I did not execute a test in this environment; the finding rests on the documented kernel constant.",
        "I assumed the combined framed goal occupies one argv element, since herdr agent prompt takes one text argument and this revision deleted the sentence that said so explicitly; if the design intends multiple text arguments concatenated by herdr, that is undocumented and would itself need stating.",
        "I re-read docs/glossary.md, docs/architecture/full-turn-retrieval.md and distribution.md this pass, and relied on earlier reads of docs/acceptance.md, docs/phase-0-fixtures.md, docs/backlog.md including its '## Resolved' heading, the Makefile, tools/build-skills.mjs, and shared/scripts/mo-models.mjs.",
        "I diffed this revision against the immediately preceding one to separate real closures from rewording, and treated statements present there and absent here with no replacement as compression losses rather than deliberate rejections, since no ledger row records their removal.",
        "I assumed AGENTS.md's no-partial-pass rule and its backlog rule apply to this feature's own gates and accepted limitations.",
        "I did not inspect any prior council artifact under spec/**, per instructions, beyond file paths cited by tracked documents.",
        "Two MCP servers (claude.ai, b24-dev-mcp) require interactive authorization and were unavailable in this non-interactive session; no finding depends on them."
      ],
      "round": 2,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 7
would_adopt: false
