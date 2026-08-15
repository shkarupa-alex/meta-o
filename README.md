# meta-o

Ten installable agent skills define routes that take a feature from a task or
specification to one verified candidate commit using Herdr, Orca or Paseo
sessions. Live route qualification is currently incomplete: Herdr and Paseo
lack a proven public complete-response surface, and Orca's normal and long
response fixtures have no retained current-run verdict. These routes must report
`needs_attention`, not support, until the corresponding [Backlog](docs/backlog.md)
entries are cleared.

Meta-O is a skills-first methodology: it adds no orchestration CLI, provider
proxy, daemon, general workflow state store or adapter layer. The watchdog has
one narrow state exception: bounded message and normalized-state hashes used
only to suppress duplicate nudges across invocations.

The project preserves the user's original request and later clarifications
verbatim because a specification is lossy compression. One verified result is
one full Git SHA; any new commit invalidates its QC, reviews and E2E. Two
independent reviewers use different model vendors, and at least one reviewer
vendor differs from the executor.

The last tree containing the removed Omnigent work is full commit
`61c39304a7e80e5350e8ffd43110a2ac1cac62b7`.

## Install

From the project where the skills are needed, install a local checkout:

```bash
apm install /path/to/meta-o
apm install /path/to/meta-o --skill mo-review-orca
```

The local disposable install is covered by tests. Remote installation remains
unproven until an already-authorized publish makes the exact candidate available:

```bash
npx skills add shkarupa-alex/meta-o
apm install shkarupa-alex/meta-o
```

Building requires Node.js 22 or newer. The provider-posture helper needs Bash
3.2+, standard POSIX utilities, and Zsh when a Zsh launch matrix is requested.
The watchdog additionally requires `jq` for native JSON validation and `flock`
for per-locator nudge serialization.

## Skills

| Skill                  | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `mo-orchestrate-herdr` | Define the Herdr feature route; live acceptance is blocked.       |
| `mo-orchestrate-orca`  | Define the Orca feature route; B8/B9 proof remains outstanding.   |
| `mo-orchestrate-paseo` | Define the Paseo feature route; live acceptance is blocked.       |
| `mo-review-herdr`      | Define standalone Herdr review; live acceptance is blocked.       |
| `mo-review-orca`       | Define standalone Orca review; B8/B9 proof remains outstanding.   |
| `mo-review-paseo`      | Define standalone Paseo review; live acceptance is blocked.       |
| `mo-setup`             | Inspect and repair project/environment readiness.                 |
| `mo-e2e`               | Run E2E scenarios that genuinely require an agent.                |
| `mo-reuse`             | Research reuse before implementation when explicitly requested.   |
| `mo-watchdog`          | Observe one session or scan all backends without cloud inference. |

Backend mechanics is deliberately split between entry skills because Herdr,
Orca and Paseo have different session semantics. Common lifecycle and review
standards have one authored owner in `shared/` so the entries cannot drift.

The control executable and required upstream companion skill are separate
dependencies:

| Backend | Control              | Companion skill |
| ------- | -------------------- | --------------- |
| Herdr   | `herdr`              | `herdr`         |
| Orca    | `orca` or `orca-cli` | `orchestration` |
| Paseo   | `paseo`              | `paseo`         |

## Feature lifecycle

```text
project/task readiness
  → short initial /goal to executor
  → executor commits a clean candidate
  → freeze one full SHA
  → two isolated reviews start concurrently
  → both complete before either is released
  → fixes create a new SHA and restart every gate
  → deterministic QC and applicable E2E
  → human-readable verified result or needs_attention
```

The orchestrator manages the process but does not inspect, judge or edit product
code. Executors, reviewers and E2E agents read the repository. A complete
settled assistant response is the required retrieval unit; a bounded terminal
preview or private provider transcript cannot establish support. Whole-session
output remains available for occasional diagnostics.

## Repository layout

```text
src/skills/   authored entry skills
shared/       single owners of common references and runtime helpers
skills/       generated installable tree, committed and byte-checked
tools/        build tooling, not shipped
docs/         business, vocabulary, architecture, backlog and acceptance
spec/         feature specifications and verbatim intent ledgers
```

`skills/` is built and never edited by hand. Each installed skill is standalone:
its `SKILL.md`, required references, scripts and licenses travel together.

## Development

```bash
npm install
make skills
make mo-qc
make mo-e2e
```

`make mo-qc` is the authoritative deterministic non-mutating gate. `make
mo-e2e` prints the scenarios that require an agent and exits 2 so it cannot be
mistaken for a pass.

Read [Why Meta-O exists](docs/business.md), [Glossary](docs/glossary.md),
[Backend capabilities](docs/backend-capabilities.md),
[End-to-end verification](docs/e2e.md), [Acceptance mapping](docs/acceptance.md),
[Backlog](docs/backlog.md), and
[Skills and reasoning are the process orchestration layer](docs/architecture/skills-first.md)
for the product contract and its reasons.
