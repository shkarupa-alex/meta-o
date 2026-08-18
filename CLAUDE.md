# meta-o — project contract

`CLAUDE.md` is a byte-for-byte copy of this file. Change both together, or
`make mo-qc` fails.

## What this project is

Ten agent skills that run a whole feature from a spec to a verified candidate
commit, using tools that already exist. There is no orchestration or
provider-proxy CLI, no daemon, orchestration state store or adapter layer. The
watchdog keeps only the narrow nudge-deduplication digest justified in
`docs/architecture/watchdog-nudge-deduplication.md`; any broader state needs its
own named reason in `docs/architecture/`.

Everything shipped is Markdown plus three self-contained helper files: the
bundled `.mjs` settings helper and `.sh` provider-posture probe copied into the
three orchestration skills, and the pattern watchdog `.sh` copied into
`mo-watchdog`. The watchdog requires mature `jq` and `flock` controls. The posture
helper is also copied into `mo-setup`. The build tool and the tests are not
shipped and do use real parsers, because this contract forbids hand-written ones.

## Desired outcomes

- A verified result is one full Git SHA. Any new SHA invalidates every gate.
- Two independent reviews, at least one from a different vendor than the author.
- A gate whose full verdict cannot be read is `unknown` and is repeated. There is
  no partial pass.
- A human is interrupted only for product meaning, an irreversible action,
  credentials, a subscription change, an unresolvable dispute, or to start the
  optional watchdog.

## Architecture

- **Skills and reasoning are the orchestration layer** — see
  `docs/architecture/skills-first.md`.
- **Settled final responses come through the backend's own surface only** — never a
  provider's private transcripts, hooks or session database. See
  `docs/architecture/settled-final-response.md`.
- **`shared/` has one source owner; `skills/` is built, never hand-edited** — see
  `docs/architecture/distribution.md`.
- No native CLI is wrapped in a proxy script. No manifest, receipt, digest or
  baseline is created without a named external consumer.

## Purpose

Every first-party module, exported API, class, architecture boundary and overload
declaration says **why it exists** — the invariant, responsibility or business
role it serves, and what becomes wrong if it is deleted. It also names the
`§A-*` architecture decision it implements, never the business layer directly.
Restating the implementation is not a purpose. Trivial accessors and generated
glue get no ritual prose.

## Knowledge

| File                           | Holds                                                  |
| ------------------------------ | ------------------------------------------------------ |
| `docs/business.md`             | the recorded business framing, then why this exists    |
| `docs/glossary.md`             | the vocabulary, one meaning per term                   |
| `docs/architecture/`           | decisions, each with its own id and business ids       |
| `docs/backlog.md`              | everything deferred, blocked or knowingly left unfixed |
| `docs/e2e.md`                  | what is verified end to end, and by whom               |
| `docs/backend-capabilities.md` | the supported-backend behavior and companion map       |
| `docs/acceptance.md`           | each spec criterion against what actually proves it    |
| `docs/papercut.md`             | which command does the routine work, and what failed   |
| `docs/references/`             | sources and archive, never current requirements        |

Knowledge is updated in the same change that made it new or false — not
afterwards.

**The spec is never the only source of user intent.** The complete verbatim
ledger — the original request and every later user answer, opinion,
clarification, correction, preference and constraint — travels with the
task/spec, because turning a conversation into a spec is lossy compression. A
summary or a link does not replace that text, and each new intent appends to it.
`docs/business.md` holds the same intent distilled into stable theses: the
meaning survives, the wording need not, and only what outlives one
implementation stays. See `shared/references/methodology.md` section 2.

**Every stable business thesis carries a unique id.** `docs/business.md` gives
each thesis a `§B-<AREA>-<NN>` anchor. Each architecture decision carries its
own `§A-<AREA>-<NN>`, names in ordinary prose the theses it serves and says what
becomes redundant if it is cancelled. A module or symbol purpose names the
architecture id. Ids are unique, stable and never reused, so `rg` walks the
chain in both directions. Shipped skill text carries no project ids; the
non-distributed files and the bundled helper scripts do. See
`docs/architecture/knowledge-identifiers.md`.

A one-shot `APPROVE`/`DENY` that only authorizes an already named
production/destructive E2E action or starts an explicitly requested watchdog is
run control, not product or deliverable intent. Keep only its credential-free,
request-bound compact header in current run evidence; never persist its opaque
body or mutate tracked intent ledgers, because that would invalidate the exact
candidate the action authorizes. Any accompanying preference, correction or
scope change is a separate user intent and still appends verbatim to both
ledgers. See `shared/references/methodology.md` sections 2 and 6.

User input may come from imperfect dictation and contain surprising recognition
errors. When anomalous wording could materially change scope or outcome, ask the
user instead of silently guessing a correction. Preserve confirmed intent
verbatim; do not rewrite the original ledger entry to hide the dictation error.

**Anything postponed, deliberately not done, blocked, or left unfixed for any
reason goes into `docs/backlog.md`**, with its reason, its practical impact, and
the next step if one is known. Current progress and temporary gate state never
go there.

Human-facing knowledge uses the user's language, inferred from the business
framing unless the user asks otherwise. Code, identifiers, commands, protocol
literals and upstream names remain in English.

## Commands

```bash
make mo-qc          # the authoritative gate: lint, contract, built tree, tests, smoke
make mo-lint        # markdown + formatting + node --check
make mo-test        # node --test over tests/
make mo-smoke       # the helper boots and answers, under a throwaway HOME
make skills         # rebuild skills/ from src/skills/ + shared/
make mo-e2e         # prints what an agent must run; exits 2
```

`mo-qc` must never rewrite what it judges. `prettier --write` and any other
mutating command stay out of it.

Reviewer checks are non-mutating. A diagnostic that can rewrite tracked files
runs only in an isolated disposable location, never in the frozen candidate
worktree.

## Version control

Never develop directly on `main`, `master`, `develop`, or `default`. Create each
task branch from an up-to-date `develop` using `feature/<short-slug>` and use it for
the whole task.

Run the relevant checks before committing. Commit every coherent, independently
verifiable increment instead of accumulating the whole task in one commit. Use
`<type>: <what changed and why>` with `feat`, `fix`, `refactor`, `test`, `docs`, or
`chore`. Reference an issue or specification when one exists, but neither is
required.

Do not add an agent-attribution trailer: no `Assisted-by`, no `Co-authored-by`,
no tool advertisement in the message.

The final verified result is one full Git object ID. Any subsequent commit
invalidates its review and verification gates.

## Conventions

- Skill frontmatter uses only `name`, `description`, `license`, `compatibility`,
  `metadata`, `allowed-tools`. Any other key breaks packaging.
- A skill's directory name and its `name:` must match.
- Never edit a file under `skills/` — it is built. Never add a file to
  `src/skills/<name>/` that shadows one in `shared/`.
- Prefer a mature tool with a project-owned config over a checker written here. A
  custom checker needs proof that a plugin or config solution is impossible, in
  the commit message.
- If Markdown must be parsed programmatically, use a real AST library. No regex
  Markdown parsers.
