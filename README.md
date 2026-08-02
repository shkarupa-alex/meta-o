# meta-o

An implementation of the AI-driven development workflow specified in
[`spec/2026-07-24-ai-driven-development-workflow/`](spec/2026-07-24-ai-driven-development-workflow/README.md):
one immutable feature spec goes in, and what comes out is a local commit that
four independent parties have attested against the same content.

It is a methodology bundle, not a framework. It owns no session runtime, no
daemon and no CI, and it writes nothing into the projects it works on.

## What it actually does

```text
immutable spec
  → preflight (does this project have a quality contract at all?)
  → executor implements everything, syncs knowledge, makes one clean commit
  → E2E tester chooses which scenarios this change requires
  → make qc
  → two independent reviewers, one of them from a different vendor
  → the selected E2E set
  → COMPLETE, only if all four attest one snapshot digest
```

The load-bearing part is the last line. A gate result is stored against the
*content* it checked — a sha256 over the sorted tracked tree, not a commit
OID — so a fix invalidates exactly the attestations it should, an amend or
rebase that preserves the tree invalidates none, and "the reviews passed" can
never quietly mean "the reviews passed on something else".

## Install

```bash
npm install && npm run build
./install.sh --prefix ~/.local --skills-dir ~/.claude/skills
```

The target machine needs Node ≥ 22 and Git. Nothing else: everything installed
is dependency-free `.mjs`, so an install is a copy. No hooks are added to any
project, no version is pinned, and nothing is written into a repository.

```bash
./update.sh          # re-copy, then re-run the backend capability suite
```

The suite runs on update on purpose. A backend that quietly lost a capability
during an upgrade fails mid-run otherwise, as a hang.

## Use

Inside a project, ask your agent to run the orchestrator skill:

> Read the `orchestrate-feature-herdr` skill and implement `spec/checkout.md`.

The orchestrator confirms the ModelSet with you, runs preflight, and drives the
run through `meta-o`. Everything it decides mechanically, you can reproduce:

```bash
meta-o preflight                       # is the project contract there and valid?
meta-o snapshot digest                 # what is this tree's content identity?
meta-o run route --run-id <id>         # what should happen next, and why?
meta-o run show  --run-id <id>         # the whole recoverable state
meta-o session list --run-id <id>      # which workers exist, and any in-flight effect
meta-o qc weakening --run-id <id>      # did anything about "passing" get easier?
meta-o worktree run --run-id <id> --label qc make qc   # run a gate on the candidate alone
meta-o help                            # the real command surface
```

## Skills

| Skill | Role |
|---|---|
| `orchestrate-feature-herdr` | Owns the FSM and addresses work. Reads no code. |
| `execute-feature` | Implements the whole scope, syncs knowledge, makes the candidate |
| `review-feature` | One of the two independent reviews, on a fixed seven-lens rubric |
| `test-e2e` | Selection plan, smoke, then the selected scenario set |
| `adopt-project` | Brings a brownfield repository up to the project contract |
| `research-reuse` | Optional scan for machinery that already exists |
| `adjudicate-technical` | Settles one disputed finding, with fresh eyes |

The backend is part of the orchestrator skill's name rather than a flag. Session
semantics differ enough between backends that a single prompt covering all of
them would be vague about all of them; a second backend gets its own
`orchestrate-feature-<backend>` skill and its own adapter.

## The project contract

meta-o refuses to start a run against a project that cannot say what "good"
means. It requires:

| Artefact | Why |
|---|---|
| `Makefile` with a non-mutating `qc` target | The one authoritative gate, runnable offline |
| `.quality/qc-manifest.json` | Which gates exist, their commands and policies |
| `docs/knowledge/business.md`, `glossary.md` | `§B-*` truth and the project's vocabulary |
| `docs/knowledge/architecture/*.md` | `§A-*` decisions, each citing a `§B-*` |
| `docs/architecture/e2e.md` + `e2e.json` | What is verified end to end, and how |
| `docs/todo.md` | Where debt found outside a feature's scope goes, instead of into the feature |
| `.quality/adoption-manifest.json` | Optional: which roots a brownfield adoption has certified so far |

`templates/python/` is a starter profile to **copy and modify** — purpose,
knowledge, import-graph and code-health checkers, all standard-library only.
It is not a dependency, and deliberately so: a bundled quality gate is one
nobody owns and nobody repairs when it is wrong for their codebase.

Missing pieces route to `PAUSED_MISSING_TOOLS` and ask whether the executor may
create them. See the `adopt-project` skill.

## What it refuses to do

- Complete on four attestations that describe different content.
- Let the executor close a finding raised against its own work.
- Pass with one review because the second timed out.
- Resend a backend instruction it cannot prove was lost.
- Treat a missing QC result, a skipped gate or a missing tool as a pass.
- Weaken a quality gate without the user deciding to — including by raising a
  threshold, disabling a ratchet, widening an exemption or re-freezing a
  baseline.
- Record a gate that rewrote the content it was judging.
- Let a feature change source outside the roots a brownfield adoption certified.
- Complete with the tracked feature spec still in the tree, or delete it after
  the reviews that attested the tree.
- Push, open a PR or tag anything you did not ask for.

## State

Everything a run knows lives outside the repository:

```text
~/.meta-o/
  config.json  watchdog.json
  projects/<readable-path>--<sha256[0:12]>/
    project.json  settings.json
    runs/<run-id>/state.json  input/spec-<sha256>.md  findings/
```

Mode `0700`/`0600`, every path component checked against symlink and ownership
substitution. `state.json` holds current state only — no transcript, no task
graph — because a fresh orchestrator has to be able to resume from it, and a
narrative written by a process that was about to die is not something to resume
from.

After `COMPLETE` the run directory is deleted. Your project settings stay.

## Developing meta-o

```bash
npm install
npm run build        # TypeScript .mts → dependency-free .mjs
make qc              # the same gate this project asks of others
```

The suite builds real Git repositories, real state trees with real permission
bits, and a scripted stand-in that speaks the backend's actual protocol.
[`docs/acceptance-map.md`](docs/acceptance-map.md) lists every acceptance item
in §00–§50 against the test that proves it — including the three that are
judgements about meaning and are marked *not mechanical* instead of being given
a test that would only look like proof.

Its own knowledge lives in [`docs/knowledge/`](docs/knowledge/business.md) and
its own E2E contract in [`docs/architecture/e2e.md`](docs/architecture/e2e.md).

## Known limits

- **Herdr is the only backend.** Omnigent needs an adapter and a skill; the
  interfaces are there, the implementation is not.
- **`reboot-recovery` is graded `degraded`, not proven.** Restarting the backend
  server cannot be automated from inside a session it manages. Run the full
  suite again after a manual restart.
- **Secure state uses component `lstat` plus `O_NOFOLLOW`,** not dirfd-relative
  `openat`, which Node does not expose. This is documented in
  `src/core/safe-fs.mts` rather than hidden.
- **meta-o's own `code-health` gate measures structure from indentation,** not
  from a parsed syntax tree, so its thresholds are looser than the AST-based
  ones the Python template ships.
