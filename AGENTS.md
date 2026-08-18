# meta-o — project contract

`CLAUDE.md` is a byte-for-byte copy of this file. Change both together, or
`make mo-qc` fails.

## Scope and outcomes

Meta-O is ten agent skills that run a feature from a spec to one verified
candidate commit by using existing tools. It has no orchestration or
provider-proxy CLI, daemon, adapter layer or general state store. The only stored
orchestration-adjacent state is the narrow digest justified by
[§A-WATCHDOG-01 — Deduplication nudge watchdog хранит один private digest](docs/architecture/watchdog-nudge-deduplication.md).

The shipped product is Markdown plus three self-contained helpers: model
settings, provider-posture diagnosis and the pattern watchdog. Build tools and
tests are not shipped.

- A verified result is one full Git SHA. Any new SHA invalidates every gate.
- Two independent reviewers inspect that SHA; at least one uses a different
  vendor from the author.
- An unreadable full verdict is `unknown` and is repeated; there is no partial pass.
- Interrupt a human only for product meaning, irreversible actions, credentials,
  subscription changes, unresolvable disputes or starting the optional watchdog.

## Decision hierarchy and architecture

When wording is ambiguous or a decision must be made, conform first to the
business requirements in [Зачем существует Meta-O](docs/business.md).
Architecture and implementation are subordinate to those requirements.

- [§A-ORCHESTRATION-01 — Скилы и reasoning — слой оркестрации процесса](docs/architecture/skills-first.md):
  skills and reasoning orchestrate; no workflow engine is added.
- [§A-RESPONSE-01 — Settled final responses остаются на публичных поверхностях backend](docs/architecture/settled-final-response.md):
  never substitute private transcripts, hooks or session databases.
- [Один владелец source, самодостаточные generated skills](docs/architecture/distribution.md):
  `shared/` owns common source and `skills/` is built, never hand-edited.
- [§A-MEMORY-01 — Уровни знаний связаны уникальными id](docs/architecture/knowledge-identifiers.md):
  business, decisions, modules and symbols remain traceable.

No native CLI is wrapped in a project proxy. Do not create a manifest, receipt,
digest or baseline without a named external consumer.

## Purpose

Every first-party module, exported API, class, architecture boundary and
overload declaration explains why it exists, what invariant or responsibility
it serves, and what becomes wrong if deleted. It names its `§A-*` decision,
never the business layer directly. Restating implementation is not purpose;
trivial accessors and generated glue need no ritual prose.

## Knowledge

| Document                                              | Role                                         |
| ----------------------------------------------------- | -------------------------------------------- |
| [Зачем существует Meta-O](docs/business.md)           | stable business framing and reasons          |
| [meta-o](README.md)                                   | purpose, use, constraints and entry commands |
| [Глоссарий](docs/glossary.md)                         | one meaning per project term                 |
| [Карта acceptance](docs/acceptance.md)                | requirements and their actual proof          |
| [Сквозная проверка](docs/e2e.md)                      | live scenarios and actors                    |
| [Возможности backend](docs/backend-capabilities.md)   | support boundary and companion map           |
| [Бэклог](docs/backlog.md)                             | real deferrals, never current progress       |
| [Грабли и команды проекта](docs/papercut.md)          | routine commands and failed approaches       |
| [Feature lifecycle](shared/references/methodology.md) | complete orchestration methodology           |

`docs/references/` is source material and archive, never current requirements.
Update knowledge in the same change that made it new or false.

**The spec is never the only source of user intent.** The complete verbatim
ledger contains the original request and every later answer, opinion,
clarification, correction, preference and constraint. It travels with the
task/spec; a summary or a link does not replace that text; each new intent appends to it.
The business framing holds the same intent distilled into stable theses:
meaning survives, wording need not, and only durable intent stays.

**Every stable business thesis carries a unique id.** A thesis uses
`§B-<AREA>-<NN>`; an architecture decision uses `§A-<AREA>-<NN>`, names the
theses it serves and says what becomes redundant if cancelled. Module and symbol
purpose names the architecture decision. IDs are unique, stable and never reused.

User input may come from imperfect dictation. If anomalous wording could
materially change scope or outcome, ask the user instead of guessing.
Preserve confirmed intent verbatim; do not rewrite the original ledger entry to
hide the dictation error.

Anything postponed, deliberately omitted, blocked or left unfixed goes into
[Бэклог](docs/backlog.md) with its reason, practical impact and next step.
Temporary progress and gate state never go there.

Human-facing knowledge uses the user's language. Code, identifiers, commands,
protocol literals and upstream names remain in English.

## Commands

```bash
make mo-qc          # authoritative non-mutating aggregate gate
make mo-lint        # Markdown, formatting, ESLint, syntax and posture self-checks
make mo-test        # node --test over tests/
make mo-smoke       # helpers boot under a throwaway HOME
make skills         # rebuild skills/ from src/skills/ + shared/
make mo-e2e         # print agent-required scenarios and exit 2
```

`mo-qc` and reviewer checks never rewrite the files they judge. Run a
potentially mutating diagnostic only in an isolated disposable location, never
in the frozen candidate worktree.

## Version control

Never develop directly on `main`, `master`, `develop` or `default`. Create
each task branch from an up-to-date `develop` as `feature/<short-slug>`.

Run relevant checks before committing. Commit every coherent, independently
verifiable increment instead of accumulating the whole task. Use
`<type>: <what changed and why>` with `feat`, `fix`, `refactor`, `test`,
`docs` or `chore`. Reference an issue or specification when one exists.

Do not add `Assisted-by`, `Co-authored-by` or other agent/tool attribution.
The final verified result is one full Git object ID; any later commit invalidates
its reviews and verification.

## Repository conventions

- Skill frontmatter allows only `name`, `description`, `license`,
  `compatibility`, `metadata` and `allowed-tools`; directory and `name:`
  must match.
- Never edit `skills/`. Never shadow a `shared/` file from
  `src/skills/<name>/`.
- Prefer a mature tool with project-owned configuration. A custom checker needs
  proof in its commit message that a plugin or configuration cannot solve it.
- Parse Markdown programmatically only with a real AST library, never regex.
