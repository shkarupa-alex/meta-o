## Facts & Constraints

### Proposal 1

Revised Proposal 1 is materially stronger. It now:

- makes `model-discovery.mjs` conditional on a capability spike;
- adds a file-by-file `.mjs` audit;
- separates pure-skills baseline from helper admission;
- acknowledges unverified `/goal`, output retrieval and context signals;
- gives a realistic destructive migration order.

However, several hard constraints remain only nominally covered.

The review contract still says merely “два reviewers”. The existence of a `reviewerCrossVendor` settings field does not enforce the original requirement that at least one reviewer use a different vendor from the executor and that the executor not occupy a reviewer slot.

“Отдельная CLI/session context” remains ambiguous. A nested subagent or another conversation in the same harness may satisfy “session context” while violating the explicit requirement for a separate CLI instance and independent context.

The backend capability table is still backend-only rather than backend × route. It does not separately classify Claude, Codex and OpenCode behavior for Herdr, Omnigent and Paseo. Several normative claims—Omnigent export boundaries, Paseo last-event extraction, PATH precedence and goal confirmation—remain scheduled for future validation while already appearing in the proposed master-spec.

The tooling audit is now broad, but the required state audit is still absent. “Delete — covered by Git/spec/sessions” does not explain why each state family was introduced, what precise failure it prevented, what is lost, and why that loss is acceptable.

The transfer map from `execute-feature` is also still missing. A single audit row cannot replace the explicitly requested mapping of whole-scope execution, tests, QC weakening, clean-tree behavior, knowledge, debt, remote actions and finding resolution.

### Proposal 2

Proposal 2 contains much more primary investigation, but several verified-looking claims contradict the installed Herdr interface or the task.

The installed Herdr skill documents pane IDs under `.result.pane.pane_id`; Proposal 2 uses `jq -r .pane_id`. It documents `herdr agent attach <target>`, while Proposal 2 repeatedly uses `herdr attach <target>`. Those examples are not cosmetic—they would break the baseline flow.

The instruction `HERDR_ENV=1 herdr --skill` spoofs the environment marker whose purpose is to prove that the caller is actually inside Herdr. The native skill says to test `HERDR_ENV`, not manufacture it.

The official Codex documentation confirms `/goal` but also says it may need `features.goals` enabled. A normal prompt containing `/goal` is not enough to prove activation, and “some goal-specific banner appears” is not a versioned observable contract. [OpenAI: Follow a goal](https://developers.openai.com/codex/use-cases/follow-goals)

Paseo’s official material confirms CLI orchestration, full timelines and a released Codex `/goal` feature, but Proposal 2 appropriately marks its local behavior unvalidated. That means Paseo cannot yet be advertised as an accepted backend implementation—only as a Phase 0 target. [Paseo CLI](https://paseo.sh/docs/cli), [Paseo changelog](https://github.com/getpaseo/paseo/blob/main/CHANGELOG.md)

## Risks & Failure Modes

### Proposal 1

Recovery still has no stable mapping from feature to backend sessions and roles. After a restart, “find native sessions” is under-specified when several projects or feature runs coexist. A lightweight naming convention is enough; a state machine is not required.

Gate recovery is similarly vague. If the candidate exists but review/E2E evidence is unavailable, the safe default must be “gate unknown, rerun automatically”, not inferred PASS or a routine user question.

The helper distribution layout is internally inconsistent. It says each skill is self-contained, yet places `_private/model-discovery.mjs` as a sibling of installable skills. Installing only `mo-orchestrate` through a skill manager may omit that sibling. The helper must either live inside the consuming skill package, be an explicit package dependency, or remain absent.

The full-message fallback does not specify a safe shared temporary location. A reviewer writing into the repository can dirty the candidate, interfere with gates or require a methodology-specific `.gitignore` entry.

The optional watchdog still has no reliable wake/poll mechanism. Admitting that it may stop is good, but the design does not establish enough utility to justify shipping it rather than deferring it.

### Proposal 2

The largest architectural regression is the single generic `mo-orchestrate` that selects one of `mo-herdr`, `mo-omnigent` or `mo-paseo`. The task explicitly asks for three alternative backend-specific orchestrator skills/flows. Proposal 2 instead creates one textual router and three mechanics layers—the same separation the task asks the council to justify rather than assume.

`refs/mo/candidate` is operational state hidden inside Git. A single repository-wide ref:

- is stale unless explicitly cleaned;
- cannot represent two concurrent feature branches;
- can point to another branch’s candidate;
- is overwritten by a second run;
- adds little beyond `HEAD` plus the full SHA already passed to gates.

The proposal calls it “not state”, but persistence outside commits with lifecycle-dependent meaning is state. It requires the same proof-of-need demanded of `state.json`.

The full-message design adds a fragile parser over private Claude/Codex JSONL formats before measuring whether the native Herdr-recommended file-export fallback is insufficient. This creates exactly the backend-coupled maintenance surface the revision is intended to remove. It also scans potentially sensitive transcripts and emits their contents without defining file permissions, redaction boundaries or symlink/path validation.

Using `.mo/out/` for reviewer messages dirties the repository unless a new ignore rule is installed. That also conflicts with the clean-worktree invariant. A per-run `mktemp` directory outside the repository is safer and simpler.

The model helper cannot meet its stated contract using only historical session logs. Logs can show models previously used; they cannot reliably enumerate currently available models or discover a newly released successor that has never appeared in a session. The proposed upgrade logic therefore cannot deliver the user’s intended proactive upgrade suggestion. Its `vendor + family` rule also makes unsafe lineage assumptions—for example, treating all `gpt-5` variants as successors.

The purpose policy overcorrects into cargo-cult documentation. Requiring a docstring/JSDoc for every private, nested, test and trivial symbol conflicts with the task’s request for realistic coverage and with GRACE’s risk-proportional density. Proposal 2 even becomes internally inconsistent: §13 includes tests universally, while the TypeScript profile later exempts tests from `require-jsdoc`.

The watchdog loop is not executable as described. If an LLM invokes an infinite shell `while` loop, it does not regain control between events to interpret output semantically. If the shell loop itself interprets and notifies, it has become the deterministic runtime the proposal claims not to have. A finite wait followed by a new agent turn is possible, but its continuation/liveness mechanism remains unspecified.

The executor is told that the researched spec is read-only and later instructed to delete it. Deletion is a mutation and violates the explicit post-research read-only contract. Retirement should occur in a separate cleanup action after gates, or the read-only rule must be narrowed explicitly.

## Strengths & Benefits

Proposal 1 remains the cleaner architectural base. Its strongest improvements are conditional helper admission, direct backend skills, removal of the executor skill, comprehensive deletion inventory, and refusal to disguise fallback sessions as native goals.

Proposal 2 contributes valuable concrete work:

- identifies the actual Herdr truncation failure;
- exposes the leaking `SessionAdapter`;
- gives an explicit `execute-feature` transfer map;
- makes cross-vendor review normative;
- supplies concrete state-loss trade-offs;
- investigates Python and TypeScript tooling in substantially greater depth;
- clearly separates console smoke, benchmark and browser E2E;
- explains knowledge sync in plain language;
- provides a strong dispute-resolution ladder;
- gives a useful S1–S7 checklist for backend mechanics.

Its best contribution is analytical rather than architectural: it shows why the current control plane fails to guarantee the properties used to justify it.

Both proposals correctly reject:

- public workflow CLI;
- FSM and run-state machinery;
- structured findings transport;
- snapshot digests;
- mandatory detached worktrees;
- automatic crash takeover;
- project-owned import-graph code;
- installer/update scripts.

## Alternatives & Creative Ideas

The strongest synthesis would use Proposal 1’s three backend-specific orchestrator entry points and Proposal 2’s deeper evidence, transfer map and QC research.

For candidate identity, use no persistent ref initially:

```text
candidate = full SHA named in the current orchestrator prompt
gate result is valid only if its response names that SHA
after restart, unknown gate evidence is rerun
```

If repeated recovery incidents prove that discovering the candidate from branch history is expensive, introduce a namespaced ref such as `refs/mo/<branch-key>/candidate` with explicit cleanup—but only after measurement.

For Herdr full output, start with the native-skill fallback:

1. Read `recent-unwrapped`.
2. If completeness cannot be established, ask the actor to export the complete previous response to a `mktemp` directory.
3. Treat failure to obtain the file as `needs_attention`.
4. Admit a JSONL parser only after measured export failures show that this is insufficient.

For watchdog, ship no baseline implementation until one of these is verified:

- native backend notifications already cover blocked/done;
- a persisted goal can perform finite wait–inspect iterations;
- a small deterministic observer has a clearly justified liveness benefit.

For model selection, separate three capabilities:

- preferences persistence: small deterministic helper is justified;
- recent-model extraction: optional local reader;
- available-model discovery and successor detection: native CLI/SDK-specific and disabled where no authoritative source exists.

One helper should not pretend all three have equally reliable inputs.

For purpose, use tiered coverage:

- mandatory mechanical presence for modules, public/exported API, classes, architectural boundaries and overload declarations;
- private/test symbols mandatory only when nontrivial, domain-bearing or misleading without causal context;
- semantic adequacy entirely reviewed;
- trivial glue explicitly exempted by policy, not flooded with one-line restatements.

## Completeness & Process

Proposal 1 still needs before adoption:

- explicit cross-vendor/self-review rules;
- separate-CLI wording for reuse;
- a full state-purpose/loss audit;
- the `execute-feature` transfer map;
- backend × route capability tables;
- a comparison against no custom orchestrator skill;
- session naming and unknown-gate recovery rules;
- self-contained helper packaging;
- implementation-ready purpose/QC configurations.

Proposal 2 still needs more fundamental changes:

- replace generic `mo-orchestrate` routing with three alternative backend-specific orchestrator skills;
- remove or fully justify `refs/mo/candidate`;
- correct Herdr commands and stop spoofing `HERDR_ENV`;
- defer `mo-lastmsg` until native/file fallback failure is measured;
- redesign temporary output outside the repo;
- split model preferences from unsupported catalog/upgrade claims;
- replace universal purpose coverage with risk-based coverage;
- resolve spec read-only versus deletion;
- replace the impossible watchdog loop;
- remove arbitrary bloat rules such as “fifth backend”, “three failures” and “≤500 LOC”.

The “≤500 lines of methodology code” rule is especially counterproductive. It incentivizes dense god-files, shell logic hidden in skills, or moving code out of the counted directory. The correct control is proof-of-need per executable, not a global line budget.

Proposal 2 is more complete as research, but Proposal 1 is closer to the requested architecture. Neither is ready to adopt unchanged.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-1",
      "approval_score": 6,
      "would_adopt": false,
      "summary": "Proposal 1 is now a strong architectural foundation: it keeps the feature workflow nearly pure-skills, conditionally admits the model helper, removes the old control plane comprehensively, and presents a credible migration sequence. It is still not implementation-ready because cross-vendor review is not normative, reuse isolation remains ambiguous, recovery lacks session/role identification, backend capabilities are not analyzed per route, and the required state audit and execute-feature transfer map remain missing.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "Review independence",
          "description": "Two reviewers are required, but a different-vendor reviewer and prohibition of executor self-review are not enforced by the mo-review contract.",
          "required_change": "Require at least one reviewer from a different vendor than the executor, prohibit the executor session/model instance from filling a reviewer slot, and preserve independent first passes."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Reuse isolation",
          "description": "The phrase separate CLI/session context permits a nested subagent or non-independent conversation.",
          "required_change": "Require a separate top-level native CLI instance/session with an independent context, and define safe spec-only staging when the worktree already contains user changes."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Recovery contract",
          "description": "The proposal does not define how a restarted orchestrator maps a feature to native sessions and roles or handles missing gate evidence.",
          "required_change": "Add a feature-and-role session naming convention and make unknown gate evidence automatically trigger rerun rather than inferred success."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Required audits",
          "description": "The file audit is comprehensive, but the original purpose and precise loss of each state family are not analyzed, and execute-feature outcomes are not mapped individually.",
          "required_change": "Add state purpose/recoverability/loss tables and an explicit execute-feature requirement transfer map."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Backend capabilities",
          "description": "The capability analysis is not backend-by-route and contains normative flows that remain deferred to validation spikes.",
          "required_change": "Provide versioned Herdr, Omnigent and Paseo tables separately for Claude, Codex and OpenCode with available, inferred and unavailable classifications plus exact fallbacks."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Orchestrator necessity",
          "description": "The proposal still assumes three methodology orchestrator skills without comparing them against native backend skill plus task/spec and project instructions.",
          "required_change": "Perform the required comparison and identify the minimal non-obvious lifecycle value retained in each orchestrator skill."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Helper packaging",
          "description": "A sibling private helper may not be installed when a user installs only the consuming skill, contradicting the self-contained distribution claim.",
          "required_change": "Keep the helper inside the consuming package, declare an installable dependency supported by both package managers, or omit it."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Reviewer file export",
          "description": "No safe shared temporary path is specified.",
          "required_change": "Use an explicit temporary directory outside the repository and never require a methodology-specific ignored output directory."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Watchdog",
          "description": "The observer has no demonstrated continuation or wake mechanism.",
          "required_change": "Defer it or specify a verified backend-specific finite wait and continuation lifecycle."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Candidate invalidation",
          "description": "The phrase checks that could be affected remains subjective.",
          "required_change": "Add a conservative invalidation matrix for source, test, docs-only and E2E-contract changes."
        }
      ],
      "assumptions": [
        "A gate whose authoritative result cannot be recovered may be rerun without user confirmation.",
        "Installed backend behavior overrides stale specification text.",
        "Individual skills may be installed separately through APM or npx skills.",
        "No concurrent feature-run support is required unless the design introduces shared persistent identifiers."
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
