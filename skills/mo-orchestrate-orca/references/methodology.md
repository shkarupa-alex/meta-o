# Feature lifecycle

This document owns the lifecycle shared by every Meta-O orchestrator. Backend
commands belong to that backend's mechanics. Review standards belong to
[Review protocol](review-protocol.md).

## 1. Boundaries

Skills and agent reasoning are the orchestration layer. Do not introduce a
workflow CLI, provider proxy, daemon, state store, adapter, registry, receipt,
manifest, digest protocol or event-accounting protocol. Use only a backend's
documented public native surface. Never read private provider transcripts,
hooks, inferred session databases or hidden state to compensate for a missing
capability.

The orchestrator manages sessions and Git identity. It does not inspect, judge
or edit product code. Executors, reviewers and E2E agents inspect the repository.
The orchestrator may read the task/spec before activation, pass its accessible
path to agents, and use Git metadata needed to validate a branch and full SHA.

One verified result is one full Git object ID. Any commit invalidates QC,
reviews and E2E for the old candidate, except the narrow documentation-only E2E
carry-forward in section 8.

## 2. Project and task readiness

Before starting agents:

1. Find the repository root and read `AGENTS.md` or the project's equivalent.
2. Read the task/spec and its complete verbatim user-intent ledger. A spec is
   never the only source of intent.
3. Require a clean `feature/<short-slug>` task branch based on an up-to-date
   `develop`; never develop on `main`, `master`, `develop` or `default`.
4. Confirm the selected backend control executable, its required companion
   skill and the backend capabilities in
   [Backend contract](backend-contract.md).
5. Confirm the selected harness can run unsandboxed in this backend. Supported
   harnesses are Codex, Claude Code and OpenCode.

If later user input changes product or deliverable meaning, append it verbatim
to the task ledger before implementation continues, and record its settled
meaning in the project's business framing. The verbatim ledger is the normative
copy while the task lives; a distilled thesis never replaces it. A thesis that
settles in the framing carries a unique stable id, so a later decision or module
can name it. Redact secrets while preserving
the sentence's meaning. A one-shot approval that only authorizes an already named
production/destructive E2E action or starts an explicitly requested watchdog is
run control: keep only a credential-free, request-bound header in current run
evidence and do not mutate tracked intent ledgers.

## 3. Roles and task delivery

Agree the executor, two reviewers, E2E actor when applicable, models and effort
with the user. Recommend an executor from a different model vendor than the
orchestrator by default; vendor diversity improves the chance that the
orchestrator can help when an executor misses a premise. Reviewers use different
vendors, and at least one reviewer vendor differs from the executor.

Give the executor a short task, normally two to five sentences. For a large
task, include the accessible path to the specification; it need not be
repository-relative or tracked. Include the complete user-intent ledger by path
or in the task, and say it is normative.

Prefix only the initial executor task with `/goal`. A harness that implements
the command may apply native goal behavior; another harness may treat the whole
message as ordinary task text. Do not detect or emulate `/goal`. Follow-ups,
review findings and standalone review prompts are ordinary messages.

The executor owns all product changes. It commits coherent independently
verifiable increments and returns a clean full candidate SHA. The orchestrator
must not enter the code to help or fix it.

## 4. Questions and delegated decisions

Watch the backend's ordinary public question and permission surfaces while an
agent works. Answer technical, cheap and reversible choices when changing the
choice later would cost roughly one agent-hour or less. Record every such
decision for the final report.

Wait on what the backend actually shows: the agent is no longer working and the
worktree is clean. Do not wait on a derived sign such as a new SHA appearing or
a pane counter advancing — a screen is already stale when it is read, and a
condition that was impossible when it was set blocks the run until timeout.
Re-read state at a sane interval measured in minutes, not seconds or hours.

Ask the user about product meaning, credentials, subscriptions, irreversible
actions, and choices that will become difficult, slow or expensive to change.
If the question or a safe answer cannot be identified, do not guess. Deliver
the answer through the backend's ordinary reply or prompt surface.

No universal question classes, correlation IDs or option grammar are required.

## 5. Candidate and reviews

After the executor settles, validate the branch, clean worktree, commit object
and full `HEAD`, then freeze that SHA. Start both reviewer sessions concurrently
and independently. Give them the same task/spec, complete intent ledger and the
same candidate SHA. Do not give either reviewer peer output.

Each reviewer is a native interactive Codex, Claude Code or OpenCode instance
started inside a terminal, pane or session by the selected backend's native
surface. Deliver the review brief through the backend's ordinary prompt, input,
task-injection or message field, either as inline text or an accessible file
path. Never create or execute a shell script to invoke the reviewer harness.

Wait for both complete settled final responses. Save them unchanged in two
private temporary files with restrictive permissions. A failure to retrieve or
write either complete response is `unknown`, never a partial review pass. These
files are inert Markdown response payloads used only for the atomic handoff to
the executor; they are never executable and never launch a reviewer.

If both pass, continue to verification. If either finds work, wait until both
are complete, then send one ordinary message to the executor containing both
temporary-file paths. Do not merge, rank, hash, encode, split, truncate or
summarize their responses. The executor fixes or responds and commits a new SHA;
review that new SHA with two fresh independent reviews. Use judgment rather than
finding IDs, round caps or retry counters. If a loop stops making progress,
clarify the task, change approach or stop with `needs_attention`.

Standalone `mo-review-<backend>` follows the same review barrier on the current
candidate, creates only the two reviewer sessions, never uses `/goal`, and
reports E2E as not evaluated unless separately requested.

## 6. QC and E2E

Run the project's deterministic QC on the frozen candidate without modifying
the worktree. Reviewer diagnostics are non-mutating; any diagnostic capable of
rewriting tracked files runs only in an isolated disposable copy.

Read the project's E2E and acceptance-to-proof documents. Run applicable
agent-required scenarios through `mo-e2e`. Production, destructive, credential
or subscription boundaries require the user's explicit authorization for the
exact named action. An unreadable or incomplete gate is `unknown` and is
repeated; there is no partial pass.

Any executable or instruction change creates a new SHA and invalidates all
gates. Return failures to the executor as ordinary messages and restart from the
new candidate.

## 7. Completion and cleanup

Before success, prove that the same full candidate SHA has:

- a clean worktree;
- passing deterministic QC;
- two complete independent review passes with required vendor diversity;
- passing applicable E2E, or a valid documentation-only carry-forward;
- no unresolved problems hidden by an incomplete backend response.

Clean up only sessions and temporary files whose ownership is certain; cleanup
is best effort and failure is reported rather than broadened destructively.

The human-readable final report contains the full candidate SHA, QC result,
both review results and model vendors, E2E result and tested SHA, any safe
carry-forward explanation, unresolved problems, and decisions made on the
user's behalf. Do not require JSON or create a persisted run record.

## 8. Documentation-only E2E carry-forward

E2E may carry forward over a later documentation-only commit only when both
final-SHA reviewers explicitly confirm that the change cannot affect executable
behavior, skill or agent instructions, acceptance, or the E2E contract. Name
the tested SHA and explain why its result applies to the final SHA. There is no
projection hash, provenance schema or fixed path allowlist. Any doubt reruns
E2E. QC and both reviews always run on the final SHA.
