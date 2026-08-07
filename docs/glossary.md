# Glossary

One meaning per term. If a term needs two meanings, it needs two terms.

**Actor** — one agent session with one role, named `<slug>-exec`,
`<slug>-review-a`, `<slug>-review-b` or `<slug>-e2e`. There is no registry of
actors; the backend's own session list is the record.

**Backend** — Herdr or Omnigent: the thing that owns agent sessions. Meta-O has
one skill per backend and no adapter between them, because their session
semantics differ enough that a single prompt covering both would be vague about
both.

**Backlog** — `docs/backlog.md`. Everything deferred, blocked or knowingly left
unfixed, with its reason, practical impact and next step. Not a groomed plan.

**Business framing** — the recorded user intent behind a piece of work, kept
verbatim in `docs/business.md` (or in `docs/business/index.md` plus the file for
that piece of work, once one file stopped being readable): the original request,
every later clarification, the corrections of a misread intent, and the preferences
and constraints that sounded secondary at the time. It is not a spec and not a
summary. A spec is a lossy compression of a conversation, and without the
uncompressed source the loss is undetectable later — which is why the spec is never
the only source of intent. A model-written summary may sit beside it and never
replace it. Verbatim stops at secrets: a credential or personal datum is stored as
a marker naming what it was, because this file is committed and pushed.

**Candidate** — a full Git commit SHA with a clean worktree. Not a file, not a
ref, not a digest. It is frozen while its gates run.

**Durable knowledge** — `docs/business.md`, `docs/glossary.md` and
`docs/architecture/`. Transferred by the executor _before_ the candidate commit,
because knowledge written after the fact is written as ritual. `docs/business.md`
holds two things that must not be confused: the durable theses, and the business
framing they were derived from.

**Executor** — the actor that implements the whole scope. It is deliberately
given no methodology skill: a large spec and the project contract are enough.

**Finding** — one reviewer objection carrying `Evidence`, `Impact` and
`Expected fix`. Copied to the author whole and verbatim. Never summarised.

**Gate** — a check whose result belongs to exactly one SHA: project QC, the
deterministic smoke, reviewer A, reviewer B, the applicable E2E. Any new SHA
makes all of them stale.

**Handoff block** — the `STATUS / CANDIDATE / SUMMARY / ATTENTION` lines a full
workflow prints for a human. A human-readable handoff, not a persisted protocol
and not a schema.

**Goal** — a provider's native persisted objective (`/goal`). In force until the
first candidate; off while the candidate is under review. Where no native goal
exists, the fallback is named as weaker rather than emulated. Omnigent has no goal on
any harness — its REPL consumes slash commands — so every Omnigent run uses that
weaker fallback and says so.

**Inline surface** — a provider's own non-interactive mode (`claude -p`, `codex
exec`, `opencode run`, a headless `omnigent run -p`) driven inside a pane and read
from it, as opposed to the **TUI surface** of a full-screen provider UI. The
distinction is load-bearing rather than stylistic: a TUI repaints, so its scrollback
can hold the same block twice and miss another, while an inline answer is written
once in order. Support is claimed per surface, and a run states which one produced
the verdict it is reporting.

**needs_attention** — one of the two user-facing actor states. It means a user
decision, recovery or external input is genuinely required. The other state is
`idle`.

**Orchestrator** — the thin role that addresses work and does not do it. It reads
the repository and runs commands; it never becomes the implementer.

**Project contract** — `AGENTS.md` and `CLAUDE.md`, byte-for-byte identical, plus
`make mo-qc` and its gates. The provider CLI loads the instruction file itself,
which is why an orchestrator never copies it into a prompt.

**Reuse decision** — `reuse | extend | build`, recorded in the spec's
`## Reuse research` section by `mo-reuse` and only by `mo-reuse`, in a spec-only
commit.

**Route** — a provider path a role runs on, written `route/model/effort`. A route
is _supported_ only after its acceptance fixtures pass; otherwise it is honestly
unsupported for the gate in question.

**Shared file** — a file with exactly one source owner under `shared/`, copied
mechanically into each skill that needs it. Editing a copy is forbidden and
`make mo-qc` refuses it.

**Smoke** — a short deterministic console check. Run by the executor or a
reviewer; never a phase of its own and never a reason to start a tester.

**Spec** — the tracked Markdown task. Read-only for the executor. Changed only by
`mo-reuse`, and only in its reuse section. Derived from the business framing and
checked against it — never a replacement for it.

**unknown** — a gate whose full verdict cannot be read for the current SHA. It is
repeated. It is never a partial pass.
