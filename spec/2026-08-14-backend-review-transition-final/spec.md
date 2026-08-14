# Backend transition and review skills

## Status

This specification is the user-approved result of the backend-transition brainstorm,
presentation, premortem and final review. It supersedes the design body of the earlier
council artifact without modifying that immutable artifact.

[User intent](user-intent.md) is a normative part of this specification. Future executors
and reviewers receive this specification and that complete verbatim ledger together.

## Outcome

Meta-O removes Omnigent completely and ships ten skills:

1. `mo-orchestrate-herdr`
2. `mo-orchestrate-orca`
3. `mo-orchestrate-paseo`
4. `mo-review-herdr`
5. `mo-review-orca`
6. `mo-review-paseo`
7. `mo-setup`
8. `mo-e2e`
9. `mo-reuse`
10. `mo-watchdog`

There are no aliases, dispatchers, compatibility entries or deprecation period for
`mo-herdr`, `mo-review`, or `mo-omnigent`. README names full commit
`61c39304a7e80e5350e8ffd43110a2ac1cac62b7` as the last tree containing the removed
Omnigent work. Historical verbatim user intent is not rewritten.

Completion requires working orchestration and standalone review for Herdr, Orca and
Paseo. A backend that fails live acceptance blocks the feature; it is not silently omitted.

## Vocabulary

- **Backend** means Herdr, Orca or Paseo: the system used to manage agent sessions.
- **Harness** means Codex, Claude Code or OpenCode: the interactive coding-agent program
  running inside a backend-managed session.
- **Companion skill** means an upstream skill required by a backend integration. It is not
  interchangeable with the backend executable.
- **Settled final response** means the assistant's completed answer, excluding tool-call
  chatter. It is the primary retrieval unit.
- **Whole-session view** means optional diagnostic access to the visible session output.
- **Run evidence** means the human-readable facts reported for one workflow run. It is not
  a persisted receipt, event log or reusable support certificate.

`route` remains available for provider/model/effort selection and does not name run
evidence.

## Architecture

Skills and agent reasoning are the orchestration layer. This feature adds no orchestration
CLI, provider proxy, daemon, orchestration state store, adapter service, run registry,
manifest, receipt or digest protocol. The watchdog's private nudge-deduplication hashes are
the narrow exception described below; they are not workflow or gate state.

The orchestrator manages the process but does not inspect, judge or edit product code.
Executors, reviewers and E2E agents inspect repository contents. The orchestrator may use
Git metadata needed to identify the candidate and determine whether a new commit exists.

`shared/` remains the single authored owner of common behavior. Generated `skills/` is
never edited by hand.

### Shared ownership

- `methodology.md` owns orchestration lifecycle, gates, autonomy, questions and user
  interaction.
- `review-protocol.md` owns common review semantics and backlog review.
- `backend-contract.md` owns the minimum observable capabilities required of every backend.
- `herdr-mechanics.md`, `orca-mechanics.md` and `paseo-mechanics.md` own concrete native
  commands and backend-specific behavior.
- `project-setup.md` owns the substantive project and environment contract used by
  `mo-setup`.
- `watchdog.md` owns methodology-independent observation and nudging behavior.
- `purpose-and-architecture.md` owns purpose and architecture-review guidance.

There is no `protocol-core.md`, closed JSON protocol, B0-B12 hook taxonomy, operation-event
accounting, multipart framing, intent capsule, payload digest, finding fingerprint, numeric
review-round cap, watchdog cooldown or retry counter.

## Backend contract

Every supported backend must demonstrate through its public native surface that Meta-O can:

- identify the intended backend instance and working directory;
- open a visible, user-reachable session without stealing focus unnecessarily;
- launch Codex, Claude Code and OpenCode with the required unsandboxed posture;
- deliver an initial task and subsequent ordinary messages;
- observe agent questions, including harness UI questions, and submit an answer;
- determine when the agent has completed its response;
- retrieve the entire settled final response;
- retrieve a deliberately long response of roughly three to four screens without truncation,
  proven by recognizable content at the beginning, middle and end;
- expose whole-session output for occasional diagnosis;
- distinguish a working agent, a completed agent, a pending question and a lost or failed
  session well enough to avoid false success.

Private provider transcripts, hook stores, inferred session databases and other private
surfaces cannot establish support.

Versions are diagnostic only. Meta-O does not pin backend or companion versions and does
not implement automatic version requalification. When an upstream change breaks the
workflow, the methodology is improved in response to the observed failure.

### Dependencies

Backend mechanics declares the executable and companion skills separately. `mo-setup`
checks both:

| Backend | Control executable/package | Required companion skill |
| --- | --- | --- |
| Herdr | `herdr` | `herdr` |
| Orca | `orca-cli` / `orca` | upstream `orchestration` |
| Paseo | `paseo` | `paseo` |

Upstream names are retained. No project-owned alias is invented for Orca's
`orchestration` skill.

## Orchestration skills

Each `mo-orchestrate-<backend>` is fixed to one backend and follows the same lifecycle with
that backend's mechanics.

1. Confirm project readiness and a clean task branch.
2. Agree roles and models with the user. By default, recommend an executor from a different
   model vendor than the orchestrator so that the orchestrator has a better chance of
   detecting gaps and helping when the executor is stuck.
3. Give the executor a short task, normally two to five sentences. For a large task, include
   the accessible path to the specification; the path need not be repository-relative or
   tracked.
4. Prefix the initial task with `/goal`. A harness that implements `/goal` may apply its
   native goal behavior; another harness may simply treat the whole message as the task.
   No detection or fallback protocol is needed.
5. Let the executor implement and commit coherent increments. The orchestrator does not
   enter the code.
6. Freeze one candidate full Git SHA and run two independent reviews concurrently.
7. Wait for both complete reviewer responses before releasing either response to the
   executor.
8. If findings require changes, send both responses together as ordinary messages, wait for
   a new SHA, and review that SHA again.
9. Run applicable QC and E2E, then report the verified candidate or a real
   `needs_attention`.

The orchestrator uses judgment rather than mechanical finding IDs or round counters. If an
executor/reviewer loop is no longer making progress, it may clarify the task, change the
approach or stop and explain why.

### Questions and delegated decisions

The orchestrator watches for executor questions and answers through the normal backend or
harness surface.

It may decide technical, cheap and reversible matters on the user's behalf. A practical
default is work that would cost roughly one agent-hour to change later. Every such decision
is listed in the final report.

The user decides product meaning, credentials, subscriptions, irreversible actions, and
choices that will become difficult, slow or expensive to change. If the orchestrator cannot
identify the question or a safe answer, it does not guess.

No universal question classes, correlation IDs, special headers or `option:n` grammar are
required. Backend mechanics records only native details actually needed by that backend.

## Review skills

There are three standalone backend-specific entry skills because a review invoked inside a
Herdr, Orca or Paseo session must understand that backend's session semantics. They all
consume one shared review protocol so their review standards do not drift.

Standalone review operates on the current candidate and does not introduce `/goal` behavior.
It creates only the two reviewer sessions and reports E2E as not evaluated unless E2E was
separately requested.

Review A and Review B:

- start concurrently in separate sessions;
- receive the same task/spec and complete user-intent ledger;
- do not receive peer output;
- use different review lenses;
- use different model vendors, and at least one reviewer vendor differs from the executor;
- bind their verdicts to the same full candidate SHA.

The orchestrator waits until both complete. Full final responses are saved unchanged in two
private temporary files, and one ordinary message gives the executor both paths. Responses
are not merged, ranked, hashed, split, encoded or size-limited. Failure to create or read a
complete file is a delivery failure, never a partial review pass. Cleanup is best effort.

### Backlog lens

After reviewing the feature itself, each reviewer reads all of `docs/backlog.md` and:

- scrutinizes every row added or changed during the feature;
- decides whether deferral is justified;
- checks related older rows and points out work that is logical to include now;
- identifies obsolete, false or incomplete entries;
- requires reason, practical impact and a next step for every real deferral;
- does not edit the backlog.

This lens supplements rather than replaces the ordinary feature review.

## `mo-setup`

`mo-setup` owns initial project and environment readiness. It detects the active backend,
reports unsupported environments, and may explicitly check all three supported backends.

It inspects substance rather than file presence:

- the project business framing and vocabulary;
- architecture decisions and their business reasons;
- backlog boundaries and entry quality;
- E2E scenarios and acceptance-to-proof mapping;
- byte-identical, useful `AGENTS.md` and `CLAUDE.md`;
- language and build configuration such as `pyproject.toml`, `package.json` and equivalents;
- mature linting for cyclomatic complexity and function/module size where the stack supports
  it;
- required purpose explanations for significant modules, APIs and architecture boundaries;
- deterministic project QC that does not rewrite what it judges;
- Herdr, Orca and Paseo controls plus their required companion skills;
- unsandboxed working posture for Codex, Claude Code and OpenCode.

When tracked project setup must change, `mo-setup` performs that work in
`feature/meta-o-setup`. It does not mix setup repair into the user's current feature branch.

`mo-setup` does not select or document how an orchestrator should deliver an executor task.

## Watchdog

The current feature implements a methodology-independent script used by the `mo-watchdog`
skill. This is a third shipped runtime helper with a named reason: observation must continue
when cloud-model API limits or overloaded inference prevent the orchestrator from making
progress.

The script supports:

- `target`: observe one selected backend session;
- `scan`: enumerate sessions across all reachable supported backends;
- backend-specific patterns or regular expressions for known limit, overload, failure,
  question, working and completion states;
- read-only observation by default;
- an explicit nudge for an authorized target;
- rereading native state before another action;
- avoiding repeated identical nudges while state remains unchanged.

Cross-invocation suppression persists only hashes of normalized native state and messages
for one backend locator. It stores no prompt, response, actor, candidate or gate data, and a
changed state replaces the prior message set. This bounded record exists only because a
separate watchdog invocation is the consumer that must avoid repeating delivery.

No numeric cooldown or attempt count is prescribed. Imperfect patterns are an acceptable
iterative limitation; the script can be refined from observed failures.

A second watchdog implementation using a small local model through Ollama or LM Studio is
deferred to backlog. It is not part of this feature.

## Knowledge documents

`docs/phase-0-fixtures.md` is removed and its mixed responsibilities are separated:

- `docs/backend-capabilities.md` describes required backend behavior and live scenarios;
- `docs/architecture/backend-support.md` explains capability boundaries and the rejection of
  private surfaces or an adapter layer;
- `docs/e2e.md` describes project end-to-end scenarios;
- `docs/acceptance.md` maps requirements to evidence.

`docs/backend-capabilities.md` is Meta-O-specific. `mo-setup` does not create it in ordinary
projects that do not own backend bindings.

Internal links to Markdown documents use a label containing the target document's H1 title,
not its path. For example, `[Backend capabilities](../../docs/backend-capabilities.md)` is
correct; `[docs/backend-capabilities.md](../../docs/backend-capabilities.md)` is not. A mature
Markdown AST/link tool enforces resolution and the project rule.

## Verification

Deterministic tests verify:

- exactly the ten named skills are built and individually installable;
- generated skills match their authored sources;
- Omnigent normative names and entry points are absent;
- only historical intent and the README history pointer remain;
- shared ownership and build distribution are preserved;
- `mo-setup` checks project substance, tooling, companion skills and all three harness
  postures;
- internal Markdown links resolve and use semantic document-title labels;
- backlog entries have the required semantic fields.

Live acceptance on the same product candidate verifies for each backend:

- orchestration and standalone review;
- Codex, Claude Code and OpenCode launch posture;
- initial and follow-up message delivery;
- concurrent isolated reviewers;
- atomic release of both reviewer responses;
- questions and answers through native UI/surfaces;
- a complete normal settled response;
- a complete three-to-four-screen response with beginning, middle and end markers;
- optional whole-session diagnostics;
- targeted and scan watchdog behavior;
- actionable detection of missing controls or companion skills.

`make mo-qc` remains the authoritative deterministic gate.

### Documentation-only E2E carry-forward

An E2E result may carry forward across a later documentation-only commit when both final-SHA
reviewers confirm that the change cannot affect executable behavior, skill or agent
instructions, acceptance, or the E2E contract. The final report names the SHA actually tested
and explains why the result applies to the final candidate.

There is no projection hash, provenance schema or fixed path allowlist. Any doubt reruns E2E.
QC and both reviews still run on the final SHA.

## Human-readable final report

A successful or `needs_attention` report contains only what the user needs:

- full candidate SHA;
- QC result;
- both review results and their model vendors;
- E2E result and the SHA actually tested;
- docs-only carry-forward explanation when applicable;
- unresolved problems;
- decisions made on the user's behalf.

There is no mandatory JSON result, closed failure catalogue, exhaustive native-operation log,
receipt or persisted run record. An unreadable or incomplete gate remains `unknown` and does
not become a partial pass.

## Full backlog disposition

| # | Existing backlog item | Current-feature decision | Remaining work |
| ---: | --- | --- | --- |
| 1 | The project needs an explicit language policy | Add the minimum mandatory rule now. | Retain only a narrower mixed-artifact policy question with reason, impact and next step. |
| 2 | Backlog must not be used as a progress tracker | Put the boundary in the knowledge contract, AST check and review lens. | Delete the row after those checks pass. |
| 3 | The standalone project-entry layer needs a formal contract | Define autonomous knowledge, entry-file, commit and dictation requirements. Do not add a papercut ledger without a consumer. | Delete the row when the contract is verified. |
| 4 | Provider-posture profiles can detach descendants with `setsid` | Test posture for Codex, Claude Code and OpenCode. | Retain a portable limitation only for a reproduced problem. |
| 5 | Claude catalogue discovery is unsupported outside macOS | Merge it into the general portable posture limitation; versions and OS remain diagnostic. | Keep a fallback only where actually required. |
| 6 | Remote installation fixtures I3 and I5 have not run | Update fixtures for ten skills. | Run remote installation only against an already-published SHA; do not push solely for a fixture. |
| 7 | Standalone `mo-review` execution is unavailable | Implement the three standalone review skills. | Delete only after all three pass live acceptance. |
| 8 | Herdr P1-P8 have not run in a real control plane | Move useful cases into current Herdr launch, question, settled-response and diagnostic scenarios. | Remove the progress row; retain only concrete reproduced failures. |
| 9 | H7b and H13-H37 have not run against the post-cutover candidate | Move useful cases into current orchestration, review, watchdog and E2E scenarios without old hook IDs. | Remove the progress row; retain only exact failures. |
| 10 | No final Omnigent route has passed OM1-OM8 | Remove Omnigent support and obsolete checks immediately. | Preserve verbatim history and README SHA only. |
| 11 | Hard-crash scratch residue can remain until operating-system cleanup | Measure whether temporary review files actually remain after a crash. | Delete if absent; otherwise retain a narrow factual limitation without a registry. |
| 12 | Fixed E2E pane subdivision remains deliberately unspecified | Require a visible user-reachable session. | Keep internal pane layout unspecified until a named consumer needs it. |
| 13 | Four upstream Herdr issue candidates await exact installed-version reproduction | Reproduce all four against installed Herdr. | Delete unconfirmed candidates; retain only credential-safe reproduced gaps. |

The implementation rewrites `docs/backlog.md` in the same candidate so it contains only real
remaining work. New deferrals created during implementation receive the same scrutiny.

## Implementation order

1. Create the task branch from an up-to-date `develop` and establish the final task/spec path.
2. Append any later user intent verbatim to this artifact and `docs/business.md`.
3. Remove Omnigent immediately, add the README history pointer, and regenerate the built tree.
4. Establish the renamed Herdr orchestrate/review pair and the simplified shared ownership.
5. Prove the common backend contract and long-response fixture against Herdr.
6. Add Orca mechanics, dependencies and both Orca skills; pass live acceptance.
7. Add Paseo mechanics, dependencies and both Paseo skills; pass live acceptance.
8. Expand `mo-setup` and verify all backend, companion, project and harness posture checks.
9. Implement the pattern-based watchdog script and record the local-LLM variant in backlog.
10. Replace the fixture document, link rules and knowledge documents.
11. Complete the thirteen-row backlog rewrite.
12. Run build, deterministic tests, smoke, QC and live acceptance for all three backends.
13. Freeze the final full SHA and obtain both final-SHA reviews plus applicable E2E.

Intermediate commits must remain coherent and independently verifiable. Overall completion
waits for all three backend pairs rather than carrying an unsupported claim between commits.

## Premortem conclusions

The primary release risk is that Orca or Paseo cannot expose a complete settled response or
reliable question/session state through public native surfaces. Capability spikes therefore
precede polishing their skills.

The primary project-safety risk is `mo-setup` changing a project too broadly. It inspects
substance, explains deficiencies and isolates tracked setup work in `feature/meta-o-setup`.

Other guarded failures are review-protocol drift, reviewer information leakage, accidental
orchestrator code inspection, hidden Omnigent remnants, misuse of docs-only E2E carry-forward,
watchdog false positives and unjustified backlog deferral.

## Acceptance

The feature is complete when:

1. The ten exact skills build and install.
2. Omnigent is absent except for protected verbatim history and the README SHA pointer.
3. Herdr, Orca and Paseo each pass orchestration and standalone-review live acceptance.
4. Codex, Claude Code and OpenCode pass required unsandboxed posture checks.
5. Each backend returns complete normal and long settled responses and offers whole-session
   diagnostics.
6. Two independent concurrent reviews bind the same final SHA, with required vendor diversity.
7. Reviewer findings reach the executor only as a complete pair.
8. Reviewers perform the feature review and then the backlog lens.
9. `mo-setup`, the watchdog script, knowledge split and semantic Markdown links satisfy this
   specification.
10. The full backlog matrix has been applied to `docs/backlog.md`.
11. `make mo-qc` passes on the final SHA.
12. Applicable E2E passes directly or is explicitly carried across a safe docs-only commit by
    both final reviewers.
