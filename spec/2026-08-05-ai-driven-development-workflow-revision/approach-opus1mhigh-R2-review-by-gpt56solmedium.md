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
      "target_id": "proposal-2",
      "approval_score": 4,
      "would_adopt": false,
      "summary": "Proposal 2 is excellent investigative material and contributes the stronger execute-feature transfer map, QC research, cross-vendor rule and backend evidence. As an architecture it regresses several hard constraints: it replaces three alternative orchestrator skills with a generic textual router, introduces hidden run state through refs/mo/candidate, adds parsers over private transcript formats prematurely, mandates cargo-cult 100% purpose coverage, and proposes a watchdog loop that cannot work as an LLM observation cycle. Several Herdr commands are also factually wrong. I would mine it for evidence and merge that evidence into a corrected Proposal 1 architecture rather than adopt it.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "Backend architecture",
          "description": "A single mo-orchestrate selects mo-herdr, mo-omnigent or mo-paseo, contrary to the required three alternative backend-specific orchestrator skills and direct flows.",
          "required_change": "Expose three complete alternative orchestrator skills, with shared methodology as textual reference only and no generic routing entry point required for execution."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Herdr correctness",
          "description": "Examples use the wrong pane-split JSON path, the wrong attach command, and manufacture HERDR_ENV instead of verifying it.",
          "required_change": "Regenerate every Herdr example from installed 0.8.0 help/skill: parse .result.pane.pane_id, use herdr agent attach, and test rather than set HERDR_ENV."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Candidate state",
          "description": "refs/mo/candidate is lifecycle-dependent persistent state with stale, concurrent-run and cross-branch ambiguity, while ordinary full commit SHA already covers candidate identity.",
          "required_change": "Remove the ref for baseline vNext and pass full SHA directly. If later retained, namespace it, define ownership and cleanup, and document the measured recovery failure that justifies it."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Complete-message helper",
          "description": "mo-lastmsg parses undocumented provider transcript formats before native/file-export fallback failure has been measured and without privacy, path or file-permission controls.",
          "required_change": "Use native export or a temporary verbatim file first. Admit the parser only after measured failures and then define supported schemas, fixtures, safe path handling and failure behavior."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Model discovery",
          "description": "Historical session logs cannot enumerate currently available models or discover an unused new release, so the proposed catalog and successor flow do not meet their stated contract.",
          "required_change": "Separate preferences persistence, recent-model extraction and authoritative availability discovery; disable upgrade suggestions for routes without a verified catalog/lineage source."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Purpose policy",
          "description": "Universal docstrings for all private, nested, trivial and test symbols recreate compliance text and conflict with the task's realistic coverage requirement; the TypeScript test exemption also contradicts the universal contract.",
          "required_change": "Use mandatory coverage for public/exported and architectural symbols plus overload declarations, and risk-based coverage for private/test symbols with explicit generated/glue exceptions."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Watchdog feasibility",
          "description": "An LLM cannot remain inside an infinite shell loop and also regain reasoning control between events; moving decisions into the loop would create the deterministic runtime the design denies.",
          "required_change": "Specify finite backend wait turns with verified automatic continuation, use native notifications, or defer mo-watchdog until a reliable mechanism is demonstrated."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Spec ownership",
          "description": "The executor is told that the researched spec is read-only and also required to delete it in its candidate.",
          "required_change": "Keep the spec read-only for the executor and perform retirement as a separate post-gate cleanup, or explicitly narrow the read-only contract and justify deletion ownership."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Distribution",
          "description": "Root-level scripts may not accompany an individually installed skill, leaving mo-orchestrate without mo-models or mo-lastmsg.",
          "required_change": "Verify both APM and npx skills single-skill installs and package helpers inside the consuming skill or through explicit supported dependencies."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "Actor status",
          "description": "Herdr done is mapped directly to user-facing needs_attention even though the orchestrator should normally inspect completed background work without waking the user.",
          "required_change": "Treat done as orchestrator attention; expose needs_attention to the user only for a question, approval, blocker or unresolved error."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Reviewer subagents",
          "description": "Hard line-count thresholds ignore semantic risk and generated diffs.",
          "required_change": "Use diff size only as a hint and let security, concurrency, architecture breadth and novelty override it."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Bloat controls",
          "description": "The fifth-backend rule, three-failure rule and 500-line ceiling are arbitrary metrics that can be gamed and may suppress justified code.",
          "required_change": "Replace all magic thresholds with the per-executable proof-of-need test already defined elsewhere in the proposal."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Temporary artifacts",
          "description": ".mo/out introduces repository-local operational artifacts and clean-tree friction.",
          "required_change": "Use a secured temporary directory outside the repository and clean it after the result is consumed."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "Recovery attention",
          "description": "The recovery example asks whether the user saw a missing reviewer verdict instead of automatically rerunning an unknown gate.",
          "required_change": "Default unknown gate state to rerun; ask the user only when rerun is expensive, destructive or externally blocked."
        }
      ],
      "assumptions": [
        "The installed Herdr 0.8.0 skill and command help are authoritative for local command syntax.",
        "Provider JSONL formats are not stable public APIs unless primary documentation says otherwise.",
        "The baseline workflow need not support concurrent runs, but it must not introduce shared state that silently breaks them.",
        "Unknown review or E2E evidence may be regenerated automatically.",
        "The hard requirement that the researched spec is read-only applies to deletion as well as content edits."
      ],
      "round": 2,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 4
would_adopt: false
