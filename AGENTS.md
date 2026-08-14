# meta-o — project contract

`CLAUDE.md` is a byte-for-byte copy of this file. Change both together, or
`make mo-qc` fails.

## What this project is

Ten agent skills that run a whole feature from a spec to a verified candidate
commit, using tools that already exist. There is no orchestration or
provider-proxy CLI, no daemon, no state store and no adapter layer, and adding
one back needs a named reason recorded in `docs/architecture/`.

Everything shipped is Markdown plus three self-contained runtime helpers: the
bundled `.mjs` settings helper and `.sh` provider-posture probe copied into the
three orchestration skills, and the pattern watchdog `.sh` copied into
`mo-watchdog`. The posture helper is also copied into `mo-setup`. The build
tool and the tests are not shipped and do use real parsers, because this contract
forbids hand-written ones.

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
- **Full-turn retrieval goes through the backend's own surface only** — never a
  provider's private transcripts, hooks or session database. See
  `docs/architecture/full-turn-retrieval.md`.
- **`shared/` has one source owner; `skills/` is built, never hand-edited** — see
  `docs/architecture/distribution.md`.
- No native CLI is wrapped in a proxy script. No manifest, receipt, digest or
  baseline is created without a named external consumer.

## Purpose

Every first-party module, exported API, class, architecture boundary and overload
declaration says **why it exists** — the invariant, responsibility or business
role it serves, and what becomes wrong if it is deleted. Restating the
implementation is not a purpose. Trivial accessors and generated glue get no
ritual prose.

## Knowledge

| File                           | Holds                                                   |
| ------------------------------ | ------------------------------------------------------- |
| `docs/business.md`             | the recorded business framing, then why this exists     |
| `docs/glossary.md`             | the vocabulary, one meaning per term                    |
| `docs/architecture/`           | boundaries and decisions, each citing a business reason |
| `docs/backlog.md`              | everything deferred, blocked or knowingly left unfixed  |
| `docs/e2e.md`                  | what is verified end to end, and by whom                |
| `docs/backend-capabilities.md` | the supported-backend behavior and companion map        |
| `docs/acceptance.md`           | each spec criterion against what actually proves it     |

Knowledge is updated in the same change that made it new or false — not
afterwards.

**The spec is never the only source of user intent.** `docs/business.md` keeps the
business framing verbatim — the original request and every later user answer,
opinion, clarification, correction, preference and constraint — because turning a
conversation into a spec is lossy compression. Every task/spec also carries all of
those intents verbatim; a summary or a link to the framing does not replace them,
and each new intent appends to both. See
`shared/references/methodology.md` section 2.

A one-shot `APPROVE`/`DENY` that only authorizes an already named
production/destructive E2E action or starts an explicitly requested watchdog is
run control, not product or deliverable intent. Keep only its credential-free,
request-bound compact header in current run evidence; never persist its opaque
body or mutate tracked intent ledgers, because that would invalidate the exact
candidate the action authorizes. Any accompanying preference, correction or
scope change is a separate user intent and still appends verbatim to both
ledgers. See `shared/references/methodology.md` sections 2 and 6.

**Anything postponed, deliberately not done, blocked, or left unfixed for any
reason goes into `docs/backlog.md`**, with its reason, its practical impact, and
the next step if one is known. Current progress and temporary gate state never
go there.

Human-facing knowledge uses the user's language, inferred from the business
framing unless the user asks otherwise. Code, identifiers, commands, protocol
literals and upstream names retain their technical language.

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
