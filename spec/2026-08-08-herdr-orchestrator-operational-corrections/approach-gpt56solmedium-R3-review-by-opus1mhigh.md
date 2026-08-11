## Facts & Constraints (White Hat)

Both proposals now rest on claims I can check against the installed tooling and the repository's own recorded measurements, so I checked the load-bearing ones rather than the decorative ones.

**P2's two new grounding quotes are verbatim accurate.** The installed `herdr` skill, line 185, really does say: *"After that failed read, ask the agent to write its complete response as Markdown in a temporary directory and reply only with the file path, then read the file directly. Use this only as a fallback; do not request file output in the initial prompt."* And `docs/architecture/skills-first.md:27` really does say *"Two reviewers' independence is a rule, not a wall. It always was — run state was a readable file."* So P2's withdrawal of its own footer protocol in favour of a fallback the vendor's skill already sanctions is not a rhetorical move — it lands exactly on the documented mechanism, and its independence caveat is quoting the project rather than excusing itself. That is a genuine improvement, and the accompanying admission ("the correct response to a rule you are about to violate for the third time is to ask whether the requirement can be met without violating it") is the strongest reasoning in this council so far.

**The retrieval measurements have not moved, and they still bound both designs.** `docs/phase-0-fixtures.md §H`: H2 (250-line answer) passes on the TUI for Claude (`--lines 400` → 347 rows, all 250 indices contiguous), Codex and OpenCode; H3 (800–900 lines) fails on Claude (716 distinct of 900, 270 duplicated, upper boundary gone) and catastrophically on OpenCode (350 of 800, 319 runs, out of order). The §H applicability rule still reads *"an open row makes that surface unsupported for the gate it feeds"*, and the section still concludes in one line that **nothing carries the review gate on the TUI surface until H7b is measured**. Neither proposal has yet re-derived that matrix for the surface it actually uses. P1 needs to, because it reads a 180-line verdict off the TUI with full boundary discipline. P2 needs to at least as much, because it moved that same read to the executor.

**The Herdr schema facts I verified last round are unchanged, including the one P2 still gets wrong.** `herdr api schema --json` (protocol 19) shows `EventMatch` containing both `pane_agent_detected` and `pane_agent_status_changed` — the latter requiring `pane_id` *and* a single `agent_status`. P2's gap 5 still asserts the union "has **no agent-status variant**". I reported this last round; it survived the revision verbatim. The conclusion (no multi-actor wait) is right; the stated evidence is false, and the requested fix ("add an agent-status variant") asks for something that exists.

**The model helper's own semantics contradict P1's new autonomous-selection rules.** `shared/scripts/mo-models.mjs` marks the Claude route `exhaustive: false` with the reason spelled out: the SDK answers with aliases (`opus`, `sonnet`, `opus[1m]`) while the CLI also accepts versioned ids like `claude-opus-5`, "so refusing what it does not list would refuse selections that work". P1's §7.4 — "если model ID больше не доступен … запустить provider с native configured default" — would silently downgrade a perfectly valid versioned Claude id, because absence from a non-exhaustive catalogue is not evidence of unavailability. The same file also states, as a deliberate design rule, *"Unavailable is never backfilled from history: presenting ten recently used ids as 'the available models' is exactly the lie…"*, and its `historyDir` for the Claude route is `~/.claude/projects` — the provider's private session store. P1's §7.5 makes automatic route selection depend on that directory. It is a route hint rather than a catalogue, so it is not a violation of the retrieval ban, but making it load-bearing for an unattended decision deserves to be named rather than slipped in.

**P1's SHA-256 point is correct and is the one thing in this round that neither reviewer nor the other proposal had.** `git rev-parse HEAD` plus `git cat-file -e <id>^{commit}` is object-format-agnostic; a 40-hex assumption is not. P2's contract clause still says "one full Git SHA" (the user's own words, so fair), but P1's §8.1 is strictly better engineering.

## Risks & Failure Modes (Black Hat)

**P2's inversion moves the load-bearing mechanic onto the actor the architecture deliberately keeps unequipped, and the argument for why that is safe does not cover the expensive case.** `skills-first.md` states as a boundary: *"The executor gets no methodology skill."* `herdr-mechanics.md §1` is an eleven-step discipline — prove the upper prompt boundary, prove the lower idle/done boundary, prove continuity, compare against `max_offset_from_bottom` to detect the 1000-row cap, treat non-monotonic order as `unknown`, cut the interval at the *last* prompt boundary. P2 hands the retrieval to an actor that has none of that and then argues the executor "can recognise an incoherent read". It can recognise **truncation** (a sentence ending mid-word, a finding citing a nonexistent file). It cannot recognise **omission**, and omission is precisely what the measured Claude failure produces: 716 real, well-formed, coherent lines in which 184 indices silently vanished and 270 are duplicated. Every dropped finding reads as a review that simply did not raise it. That is the exact failure `full-turn-retrieval.md` calls "the most expensive failure this architecture can produce, and it is invisible" — and P2's design now runs it through the one actor with no instructions on how to detect it.

**P2's step-6 cross-check cannot detect that failure either, by construction.** It compares "the executor's reported finding count" against "the reviewer's own word", where the word is `PASS` or `FINDINGS`. A count and a polarity word can only disagree on the PASS-versus-nonzero axis. Six findings written, four retrieved, executor reports four, reviewer says FINDINGS: full agreement, one blocker lost, round converges. P2 describes this as "strictly stronger than either a footer or a tail-read alone"; against omission it is not stronger than anything.

**P2 lost the SHA binding it previously had, and nothing replaced it.** The withdrawn footer echoed the frozen SHA, which caught a reviewer answering about the wrong commit. Now the executor is told to "read its last turn", `mo-review` explicitly forbids `CANDIDATE`/`WORKTREE` as reviewer output fields, and a warm reviewer's pane after round two contains several turns. Fixture H5 exists precisely because "the second turn is retrieved, not the first" is a thing that has to be proven, and cutting at the last prompt boundary is the skill discipline the executor does not have. A stale round-one verdict consumed as round-two evidence is a realistic path to a gate that passes on the wrong commit.

**P2's handover prompt does not contain the command it depends on, and does not ban the one that would hang the run.** §2.4 shows `herdr agent read <name> --source recent-unwrapped --lines 1000` in the design text, but the quoted prompt says only "Read its last turn yourself". An executor with no Herdr skill will improvise, and the installed skill warns at line 42 that bare `herdr` "launches or attaches the TUI"; `herdr agent attach` from a tool call would seize the executor's pane. The prompt must carry the exact read command and an explicit ban on `attach`, `prompt` and `send-keys`.

**P1's 180-line ceiling still deadlocks a thorough review, and the escape hatches are all closed.** `mo-review` requires `Evidence`, `Impact` and `Expected fix` on every finding; this repository's own recorded history is six rounds of substantive findings. When a legitimate verdict exceeds 180 rendered lines, §10.2 permits one compact retry and then declares the route unable to carry the gate; §4.2 forbids inline; §14 confirms "второй incomplete turn → route unsupported". There is no chunking, even though `mo-review` already has a chunking rule for over-long *prompts* that could have been mirrored. The result is a run that fails because the review was too good, and a standing incentive for reviewers to under-report to fit.

**P1's bundling section is unchanged where I showed it to be wrong.** brain-council's `src/build.ts` keeps these SDKs in `EXTERNAL_SDKS` and vendors them into `dist/<skill>/node_modules`, with a comment naming runtime resolution of platform-native sub-packages as the reason; P1 §20 still says "Bundling повторяет brain-council: SDK JavaScript inlined". The package itself declares peerDependencies on `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk` and `zod`, and contains `createRequire`-based literal `require("ajv/dist/runtime/…")` calls that esbuild does not follow — so a single-file bundle in a `node_modules`-free skill can fail at first use of that path, while P1's deterministic tests only prove the module *loads* and the live catalogue test is explicitly excluded from `mo-qc`. Making a byte-identical rebuild a hard gate on top of an unvalidated bundle is the wrong order of operations. And `docs/architecture/distribution.md` — whose recorded decision is that `build-skills.mjs` **copies** the shared files — is absent from P1's §15 component table while P1 asserts "новый architecture document не создаётся"; the point is not a new document, it is that an existing one becomes false.

**Both, still:** P2's §3.6 continues to have the orchestrator write a posture defect into `docs/backlog.md` mid-run. I raised this last round; it is unchanged. That is a tracked-file edit while the executor works: it dirties the worktree, so either the orchestrator's own clean-tree candidate check (§3.5) rejects a legitimate candidate, or the edit is swept into a commit nobody reviewed.

## Strengths & Benefits (Yellow Hat)

P2's revision is the best single move made in this council. Withdrawing a protocol you invented, naming exactly which rule it violated, and then showing the requirement can be met *inside* the rule by inverting the courier — that is the discipline the repository's own architecture documents demand of themselves, and the result is smaller than what it replaces: no footer grammar, no scratch tree, no `chmod`, no five-clause predicate, no executor completion marker. It also removes the derived-signal hazard from the executor side: the candidate comes from `git rev-parse HEAD` and `git status --porcelain` rather than from a claim, which is rule (1) of its own wait protocol applied reflexively. The orchestrator's per-round cost drops to one sentence, complaint 3 becomes structurally impossible rather than forbidden, and the two-party verdict read (reviewer's own word, executor's independent report) is a genuinely better shape than one model writing one word — it just needs to carry a count instead of a polarity.

P1's revision earned real ground too, and on two axes it is ahead. Its §7 autonomous model preflight is the most complete answer to complaint 6 anywhere in this council: it deletes the mandatory "confirm or change models" dialogue, the reuse offer and the watchdog offer from the default path, and it refuses to invent a model quality ranking the catalogue does not provide — falling back to the provider's native default instead. That is exactly "оркестратор должен меня заменять". Its §8.1 commit-identity rule is object-format-correct where everyone else assumed hex-40. Its §14 error contract and §16 acceptance traceability table are the most decomposition-ready artefacts on offer, and its dispute protocol — where actors emit the classification and the orchestrator only routes it — is a sharper statement of the firewall than P2's routing table.

Where I tried to break P2 and could not: the topology commands match the protocol-19 schema field for field; `tab.create --label --cwd` and `focus=false` really do preserve user focus by construction; the read budget gives the orchestrator nothing to read rather than merely forbidding it; the wait protocol's four rules map one-to-one onto the user's own post-mortem; the framing fail-closed check is genuinely preserved (existence to the orchestrator, "is it a stub?" to the executor) rather than dropped; and the contract clauses land in the one file the skill-less executor re-reads, with the `methodology §4.7` contradiction found and resolved in the same change.

## Alternatives & Creative Ideas (Green Hat)

The fix for P2's omission blindness is cheap and already half-present in the project. `herdr-mechanics.md §1` step 4 says: *"Ask the reviewer for a verdict whose structure you can check (headings in order, findings numbered), and treat a window whose order is not monotonic as unknown."* Numbering is already required of reviewers, so requiring the verdict to open with `Findings: N` and number them `1..N` asks nothing new of the model beyond structure the protocol already mandates — and it converts omission from invisible to arithmetic. Then the orchestrator's one-word follow-up becomes "PASS, or how many findings?", the executor reports which indices it received, and step 6 becomes a real cross-check: 6 claimed, 4 received, contiguity broken → `unknown` → repeat. That single change closes the largest hole in P2's revision without adding an artefact or a sentinel.

Second, for P2: give the executor a five-line retrieval checklist inside the handover prompt — exact command, "the turn you want starts after the last prompt echo", "if indices are non-monotonic or duplicated, say so and stop", "never `attach`, `prompt` or `send-keys` another agent". That is not a methodology skill; it is the run-specific instruction the goal is allowed to carry, and it is re-sent every round so compaction cannot eat it.

Third, for P1: mirror `mo-review`'s existing prompt-chunking rule onto verdicts — numbered turns of ≤180 lines each, acknowledged from a settled state before the next. Continuity is proven per turn, which is exactly what H2 measured, and no finding has to be deleted to fit. That converts the deadlock into latency.

Fourth, on the SDK, the mechanism the user actually pointed at is available to both: `tools/build-skills.mjs` can vendor the dependency closure into `skills/<name>/scripts/node_modules/` exactly as `src/build.ts` does, leaving `mo-models.mjs` an authored file with a plain import. It survives an `nvm` switch (which silently defeats P2's `npm root -g` remediation and re-opens complaint 9), it avoids P1's `createRequire`/peer-dependency bet, and its price is one honest amendment to `distribution.md` and the shipped-artifact sentence in `AGENTS.md`/`CLAUDE.md`. Both proposals should take it.

## Completeness & Process (Blue Hat)

P2's decomposition is nine file-scoped items and is implementable as written once four things are added: the numbered-findings count, the retrieval checklist in the handover prompt, a rule that the orchestrator makes no tracked-file edit while an actor turn is running, and a corrected gap 5. The §H applicability re-derivation is the one structural gap left: P2 changes *who* reads, not *what the surface can deliver*, so the matrix that currently says "nothing carries the gate on the TUI surface" must be re-derived for an executor-performed read, with H15 explicitly covering 1200 rows (it does) and the omission case (it does not — it covers "incoherent", which is the detectable half).

P1's process gaps are narrower in count but heavier in consequence: no fixture named for the §H re-derivation, no `distribution.md` amendment for converting a copied helper into a generated bundle containing third-party code, no owner for E2E applicability (the orchestrator may read neither `docs/e2e.md` nor the Makefile, yet its `GateSet` carries `e2e` and §17.2 requires E2E to attach to the same commit — P2 solves this with a scenario-names carve-out), and the new §7 model rules conflict with the documented `exhaustive: false` semantics of the route they most affect.

On the requirement where the two diverge on principle — complaint 9 — P1 is right about the destination and still wrong about the route; P2 is right about the contract and wrong to substitute a mechanism the user named against one a Node version switch defeats. Whichever is adopted should vendor and record the amendment.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "proposal-1",
      "approval_score": 5,
      "would_adopt": false,
      "summary": "This revision adds real value — the §7 autonomous model preflight is the best answer to complaint 6 in this council (no model-confirmation dialogue, no reuse or watchdog offers, no invented model ranking), §8.1 correctly refuses to assume a 40-hex SHA, and the §14 error contract plus §16 traceability table are the most decomposition-ready artefacts on offer. But the three defects I raised last round are unchanged and a fourth has appeared. The 180-line verdict ceiling still deadlocks a thorough review, with chunking absent and inline fallback explicitly forbidden, so a run fails because the review was too good. TUI review-gate support is still asserted against the repository's own applicability rule, which currently concludes that nothing carries the gate on the TUI surface until H7b is measured. The bundling section still claims to repeat brain-council while describing the opposite of what src/build.ts does, and ignores the SDK's peerDependencies and createRequire('ajv/...') calls that esbuild will not follow, while making a byte-identical rebuild a hard gate and excluding the live catalogue test from mo-qc; distribution.md is not amended. New: §7.4 and §7.5 conflict with mo-models.mjs's documented exhaustive:false semantics for the Claude route and with its stated rule that availability is never backfilled from session history.",
      "phase": "approach-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "major",
          "area": "review gate throughput",
          "description": "A 180-rendered-line authoritative verdict fits roughly eight to twelve findings once mo-review's mandatory Evidence, Impact and Expected fix are included, while this repository's own recorded history is six rounds of substantive findings. §10.2 allows one compact retry and then declares the route unable to carry the gate; §4.2 forbids inline fallback; §14 confirms 'second incomplete turn -> route unsupported'. A legitimately thorough review therefore ends the run with no gate, and the reviewer's only way to avoid that is to report less than it found.",
          "required_change": "Add a bounded escape that drops no finding: mirror mo-review's existing prompt-chunking rule onto verdicts (numbered turns of <=180 lines, each acknowledged from a settled state), or keep the inline surface as an explicitly demoted fallback for a verdict that cannot be compacted without deleting an actionable defect."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model catalogue build",
          "description": "brain-council's src/build.ts keeps these SDKs in EXTERNAL_SDKS and vendors them into dist/<skill>/node_modules, naming runtime resolution of platform-native sub-packages as the reason; §20 still asserts the inlined variant is what brain-council does. @anthropic-ai/claude-agent-sdk declares peerDependencies on @anthropic-ai/sdk, @modelcontextprotocol/sdk and zod, and contains createRequire-based literal requires of ajv runtime modules that esbuild leaves unresolved, so a single-file bundle in a node_modules-free skill can fail at first use. §17.1 proves only that the module loads, and the live catalogue test is excluded from mo-qc. docs/architecture/distribution.md, whose recorded decision is that the build copies shared files, is not in the §15 component table.",
          "required_change": "Either prove the bundle with a spike that answers supportedModels() from an isolated directory with no node_modules before adopting the byte-identical gate, or vendor the dependency closure into the built skill as the reference implementation actually does. Either way, amend docs/architecture/distribution.md and the shipped-artifact sentence in AGENTS.md and CLAUDE.md in the same change."
        },
        {
          "id": "",
          "severity": "major",
          "area": "route support vs recorded fixtures",
          "description": "docs/phase-0-fixtures.md §H states 'an open row makes that surface unsupported for the gate it feeds' and concludes that nothing carries the review gate on the TUI surface until H7b is measured (H6 open/N-A on Claude, H9 open on OpenCode). §4.2 declares Codex and Claude interactive routes supported for compact output without measuring H7b or re-deriving applicability for a single-window 400-line read with no paging.",
          "required_change": "Re-derive §H per row for the compact-TUI surface in the same change — mark each row applicable, N/A with a reason, or open — and claim route support only on that basis."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "E2E applicability ownership",
          "description": "The orchestrator may read neither documents nor the Makefile and may not determine QC, yet the GateSet carries e2e and §17.2 requires E2E to attach to the same commit. Nothing states how it learns that an agent-required E2E scenario exists.",
          "required_change": "Assign it: the executor reports E2E applicability and scenario names in its READY block, or grant a narrow carve-out to read scenario names only."
        }
      ],
      "assumptions": [
        "docs/phase-0-fixtures.md §H remains authoritative for Herdr 0.8.0 and the installed provider versions; I re-read it rather than re-running the fixtures.",
        "@anthropic-ai/claude-agent-sdk 0.3.191, inspected via brain-council's store, is the version that would be pinned.",
        "'Interrupt the human only for the six named conditions' outranks a literal reading of the user's version-control text."
      ],
      "round": 3,
      "reviewer": "opus1mhigh"
    }
  ]
}
```

---REVIEW-META---
approval_score: 5
would_adopt: false
