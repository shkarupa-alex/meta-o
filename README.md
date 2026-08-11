# meta-o

Seven agent skills that take one feature from a spec to a verified candidate
commit, using tools you already have.

It is a methodology, written down and installable — not a framework. There is no
orchestration or provider-proxy CLI, no daemon, no state store and no adapter
layer. Git, the tracked task/spec, the recorded business framing behind it, your
project instructions and your backend's own sessions are the only durable state,
which is why a restart costs a re-read rather than a recovery protocol.

The framing is the part people skip: your request and every clarification, kept
verbatim in `docs/business.md`, because a spec is a lossy compression of the
conversation that produced it and nobody can find what it dropped without the
original. A run does not start without one. Secrets are the one exception —
credentials and personal data are stored as `[REDACTED: what it was]`, since that
file gets committed and pushed.

The current operational correction is
[`spec/2026-08-08-herdr-orchestrator-operational-corrections/`](spec/2026-08-08-herdr-orchestrator-operational-corrections/spec-review.md).

## What a run looks like

```text
pre-activation — inject project contract and opaque task/spec locator
  → process-only orchestrator creates a visible executor and sends one native goal
  → executor reads the repository and produces one clean candidate commit
  → freeze that SHA
  → reviewer A completes, then independent reviewer B starts on that SHA
  → PASS/PASS proceeds without relay; a FINDINGS barrier releases both first passes atomically
  → the applicable E2E, on that SHA
  → any fix → new SHA → every applicable gate again
  → STATUS / CANDIDATE / SUMMARY
```

One verified result is one full Git SHA. Any new SHA invalidates every gate —
no impact analysis to argue with, and "the reviews passed" can never quietly mean
"the reviews passed on something else".

## Install

**Proven here** — a local checkout, run from the project you want the skills in:

```bash
apm install /path/to/meta-o                     # all seven
apm install /path/to/meta-o --skill mo-review   # protocol artifact only
```

**Not proven yet** — the remote forms. They should work identically, since apm
clones and then resolves the same `skills/` directory, but nobody has run them
against this repository, so they are written here as what to try rather than as
what was verified. Fixtures I3 and I5 in
[`docs/phase-0-fixtures.md`](docs/phase-0-fixtures.md) are exactly these rows:

```bash
npx skills add shkarupa-alex/meta-o
apm install shkarupa-alex/meta-o
```

apm deploys to the harness it detects in the consuming project (`.claude/`,
`CLAUDE.md`, `.codex/`, `.opencode/`, …); in a directory with no marker at all it
asks for `--target claude` rather than guessing. The installed skills need Bash
3.2 or newer specifically at `/bin/bash`; the posture diagnostic also requires
`/usr/bin/printf`, `/usr/bin/false` and `/bin/sleep` at those paths, plus the
standard `mktemp` and `rm` found by `command -p`. A Bash matrix additionally
requires `/usr/bin/env` with `-0`; a requested Zsh matrix needs Zsh.
NixOS/Alpine-style layouts without these absolute paths are outside this helper's
compatibility contract. Building and installing this repository also needs Node
≥ 22 and Git, and its full `make mo-qc` needs Zsh. The repository installs no
orchestration engine, provider proxy or daemon. Its build bundles the
self-contained `.mjs` helper; installation writes the selected skill directories
into the target harness, and a feature workflow then edits and commits the target
project it was asked to develop.

The installed unit is a directory: `SKILL.md` plus the `references/` and
`scripts/` that skill owns. `tests/install.test.mjs` runs a real local `apm
install` and asserts the deployed file list, because a build that produces the
right tree can still be installed from the wrong one — which is exactly what
happened before this layout.

## The skills

| Skill         | Use it when                                                           |
| ------------- | --------------------------------------------------------------------- |
| `mo-herdr`    | run a whole feature through Herdr-managed sessions                    |
| `mo-omnigent` | the same lifecycle through native Omnigent sessions                   |
| `mo-review`   | `mo-herdr` or `mo-omnigent` needs the backend-neutral review protocol |
| `mo-reuse`    | you want to know what already exists before it gets built             |
| `mo-setup`    | a project has no contract yet                                         |
| `mo-e2e`      | the E2E genuinely needs an agent — a benchmark or a browser suite     |
| `mo-watchdog` | a long unattended run should tell you when it needs you               |

The backend is part of the skill's name rather than a flag: session semantics
differ enough between Herdr and Omnigent that one prompt covering both would be
vague about both.

`mo-review` is a protocol component, not a standalone review runtime. It supplies
the lenses, compact outcomes, adjudication and convergence rules used inside
`mo-herdr` and `mo-omnigent`; those backend skills own actor launch, vendor
selection, complete-turn retrieval, finding application, commits and E2E. A
single-skill install is readable protocol material only and is not advertised as
a way to execute reviews.

Human input has two distinct paths. Product meaning, architecture, credentials,
subscription state, and other repository-changing answers return to the
executor for credential-safe verbatim intent recording and a new candidate SHA.
Approval for one already named production/irreversible E2E scenario returns to
that same lifecycle-recorded E2E actor on the unchanged candidate only after its
visible one-row request names the exact operation and credential-safe scenario
ID; an approval addressed to any other native actor fails closed. Optional
watchdog approval stays with the orchestrator. Operational requests and
approvals are header-only and never persist opaque human text.

Only IDs in the validated origin outcome's `disputes` set are requested from the
peer. They run sequentially, but their terminal results are delivered only after
every such target resolves: one ordered atomic set goes to the executor if any
finding is upheld, or to the origin reviewer if all are withdrawn. Closed-only
rebuttal IDs never enter that set, and a partial per-ID history is never released.

## Repository layout

```text
src/skills/      the authored skills — SKILL.md plus what only that skill owns
shared/          source owner: methodology, licences, mo-models.mjs, mo-posture.sh
skills/          the installable tree, built from the two above and committed
tools/           build-skills.mjs — copies prose, bundles the SDK helper, verifies identity
docs/            this project's own contract, knowledge and fixtures
spec/            the council specs, kept verbatim as history
```

The built tree sits at `skills/` because that is where apm and `npx skills` look
in a repository they install, and it is committed because they install what is
committed. The authored tree sits under `src/` for the same reason: so discovery
cannot reach it. An earlier layout published `dist/` instead, as the spec spells
it — a remote install then resolved the authored `skills/` and every skill
arrived without its references, while `apm install ./dist` was refused outright
because the manifest sat one level above the directory being installed.

`make mo-qc` proves the committed tree byte-matches a fresh build, and the build
refuses a source skill that shadows a shared file — which is the only way a
hand-edited copy of the methodology could begin.

## What it refuses to do

- Pass a gate on a partially retrieved reviewer verdict. An unproven boundary is
  `unknown`, never a partial PASS.
- Read a provider's private transcripts, hooks or session database to work around
  a missing backend surface. If the sanctioned surface cannot deliver a complete
  turn, that route is marked unsupported.
- Accept "repeat your last answer verbatim" as retrieval. That tests obedience.
- Summarise a reviewer's findings on the way to the author.
- Ask the human to choose an ordinary route, retry, fix or process step.
- Start an optional watchdog without an explicit request.
- Let the executor arbitrarily rewrite or delete the spec. The one explicit
  exception is the required credential-safe §2.1 verbatim append of each
  repository-changing human intent to every current task/spec before acting.
- Weaken a quality gate to make a candidate green.
- Push, tag or open a PR without being asked.
- Keep run state, gate receipts, digests, manifests or baselines anywhere. The
  only file outside a repository is `~/.meta-o/models.json`, and it holds model
  preferences and nothing else.

## Developing meta-o

```bash
npm install
make mo-qc      # lint, contract identity, built-tree identity, tests, smoke
make skills     # rebuild skills/ after editing src/skills/ or shared/
make format     # the rewriting half, deliberately outside mo-qc
make mo-e2e     # prints what an agent must run, and exits 2
```

Its contract is [`AGENTS.md`](AGENTS.md) — byte-identical to `CLAUDE.md`, because
each provider reads its own file and a divergence means two providers silently
working to different contracts. Its knowledge is in
[`docs/business.md`](docs/business.md), [`docs/glossary.md`](docs/glossary.md) and
[`docs/architecture/`](docs/architecture/skills-first.md).

## Known limits

- **The final Herdr surface is not yet adopted.** This implementation environment
  has no `HERDR_ENV=1`; P1–P8, H7b and H13–H37 therefore remain unsupported rather
  than borrowing old inline/headless evidence.
- **The final Omnigent route is not yet adopted.** OM1–OM8 must prove its native
  firewall, continuity, complete-result and gate behavior independently.
- **A hard crash can leave private scratch until OS cleanup.** New runs do not
  scan for or delete old directories without ownership evidence.
- **A provider profile can detach a posture descendant with `setsid`.** The
  diagnostic quiesces only its owned process group; portable kernel containment
  remains an explicit backlog item, so posture proves resolution rather than
  arbitrary descendant containment.
- **The Claude catalogue SDK is self-contained.** The generated helper bundles
  the pinned SDK, carries its licence, uses system Claude from PATH, and needs no
  ambient runtime `node_modules`; catalogue presence still does not prove
  launchability or subscription entitlement.
- **Nothing mechanically enforces reasoning.** Deterministic gates constrain
  grammar, distribution and observable boundaries; the skills remain the
  orchestration layer by design.

Everything deferred is in [`docs/backlog.md`](docs/backlog.md).
