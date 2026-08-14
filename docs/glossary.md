# Glossary

One durable term has one meaning here. Backend commands and acceptance scenarios
live in their normative documents rather than this vocabulary.

**Backend** — Herdr, Orca or Paseo: the system managing agent sessions.

**Harness** — Codex, Claude Code or OpenCode: the interactive coding-agent
program running inside a backend-managed session.

**Companion skill** — an upstream skill required by a backend integration. It is
checked separately from the backend executable and is not interchangeable with
it.

**Orchestrator** — the agent managing process, sessions, questions, candidate
identity and gates. It does not inspect, judge or edit product code.

**Executor** — the repository-reading implementation owner that changes files,
commits coherent increments and produces candidate SHAs.

**Reviewer** — an independent read-only evaluator of one exact candidate SHA.

**E2E actor** — a separate read-only agent running applicable end-to-end
scenarios against one frozen candidate.

**Candidate** — a full Git object ID equal to clean `HEAD` on the task branch.

**Settled final response** — the assistant's completed answer, excluding
tool-call chatter. It is the primary retrieval unit.

**Whole-session view** — optional diagnostic access to visible session output.
It cannot replace a missing complete settled response.

**Gate** — QC, review or E2E evidence bound to one candidate. Missing,
incomplete, unknown, stale or other-SHA evidence does not pass.

**Run evidence** — human-readable current-run facts. It is not a persisted
receipt, event log, support certificate, manifest or registry.

**Route** — provider/model/effort selection. It does not name run evidence.

**`needs_attention`** — a genuine user boundary: product meaning, an
irreversible action, credentials, a subscription, an unresolvable dispute, an
unavailable required backend capability, or explicit watchdog start.
