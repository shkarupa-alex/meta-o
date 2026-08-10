# One source owner, self-contained generated skills

Because _a control layer must earn its keep_ and _deferred work that nobody wrote
down does not exist_ — a divergent methodology copy or a helper that works only
beside an ambient `node_modules` is a broken standalone skill.

## The tension

Two requirements pull in opposite directions:

1. Each skill must install and run on its own. A single-skill install copies one
   directory, so a reference, runtime package or licence outside that directory
   is missing on arrival.
2. Shared contracts and helper source must have one owner. Hand-maintained
   copies drift, and a drifted methodology or executable protocol is worse than
   none because every consumer believes its copy.

## Source ownership and generated output

- `shared/references/` owns canonical shared prose.
- `shared/scripts/mo-models.mjs` owns the model settings and catalogue source.
- `shared/scripts/mo-posture.sh` owns the provider-resolution probe.
- `shared/licenses/` owns the notices required by packages redistributed inside
  a generated helper.
- `src/skills/<name>/` holds only that skill's `SKILL.md` and skill-owned
  references.
- `tools/build-skills.mjs` is the build-time owner of `SHARED_PLAN`, bundling,
  licence mapping and the generated `skills/` tree.

Most shared entries are copied byte-for-byte. `mo-models.mjs` is deliberately
different: the source is bundled into the runtime file placed in `mo-herdr` and
`mo-omnigent`. Both destinations are produced by the same build operation and
must be byte-identical to each other. Generated files are never hand-edited.

`make mo-qc` regenerates into a temporary tree and compares every path and byte
with committed `skills/`. It also refuses source files that shadow a
`SHARED_PLAN` destination. The built tree is committed because package managers
install the repository's committed discovery tree.

## The self-contained model helper

Claude catalogue discovery uses the Agent SDK's
`Query.supportedModels()` surface, but an installed skill has no package-install
step. The generated helper therefore bundles its runtime dependency instead of
resolving a project, global or otherwise ambient `node_modules` at runtime.

The build contract is:

- `esbuild` exactly `0.25.12` as a build-only development dependency;
- `@anthropic-ai/claude-agent-sdk` exactly `0.3.191` as the bundled runtime
  dependency;
- Node.js 22 ESM output, with bundling enabled, no externals, no minification and
  no source map;
- system Claude resolved through the established `PATH` scan; no provider
  executable is vendored;
- macOS Claude runs under a Seatbelt profile whose kernel-enforced
  `deny process-fork` rule is proved by a bounded negative fixture before every
  provider start; the provider therefore cannot create either an ordinary or a
  detached descendant during catalogue discovery;
- a probe-owned supervisor stays outside that no-fork boundary only long enough
  to start the one sandboxed provider. Its private lifecycle fd is the cleanup
  capability: the still-live group leader signals its own group, and no numeric
  PID learned from a process-table snapshot is ever signalled. Catalogue success
  is withheld until the supervisor's close event proves cleanup completed;
- Linux, Windows and other POSIX Claude catalogue discovery fails closed before
  provider start until an equivalent kernel-owned descendant boundary and live
  compatibility fixture exist. A process group or repeated `ps` snapshot is not
  containment because a concurrently spawned process can detach and a numeric
  PID can be reused;
- no unresolved live package import and no runtime `node_modules` requirement;
- byte-identical generated helper output for `mo-herdr` and `mo-omnigent`.

The measured bundle baseline is 999,247 bytes. The current 25% audited ceiling
is 1,249,059 bytes. Crossing it fails the build and requires a fresh size and
dependency audit; it is not silently accepted as ordinary generated churn.

The external brain-council files cited by the specification are design
references only. Source, build, tests, generated skills and runtime must work
when `/Users/alex/bitrix/skills` does not exist.

## Metafile and licence closure

Bundling is accepted only when its dependency set is inspectable. Esbuild's
metafile is reduced to package roots under `node_modules/` and compared exactly
with the explicit build-owned licence plan. An unexpected package root or a
licence-plan entry absent from the bundle fails generation.

The current redistributed package root is
`@anthropic-ai/claude-agent-sdk`, mapped to
`shared/licenses/claude-agent-sdk-LICENSE.md`. The build copies that notice into
each generated skill that receives the bundle. Esbuild itself runs only during
project development and is not embedded in the installed runtime helper.

This mapping is explicit metadata in `SHARED_PLAN`: adding a runtime dependency
must update distribution and licence ownership in the same change, before a
generated tree can exist.

## Provider posture remains a copied leaf

`mo-posture.sh` is copied byte-for-byte into `mo-herdr`, `mo-omnigent` and
`mo-setup`. It is a bounded read-only diagnostic leaf: it starts no provider,
stores no run state and knows nothing about backend sessions. Duplication makes
each skill standalone without creating a runtime shared package or backend
adapter.

## Why the installable tree is `skills/`

The authored tree cannot occupy the discovery path. With apm 0.27.0:

- `apm install ./dist` was refused because the exact directory contained no
  accepted manifest;
- `apm install <repo>` discovered `<root>/skills/<name>/SKILL.md` and therefore
  installed an authored tree that lacked generated shared files.

The installable tree consequently owns `skills/` and authored sources live under
`src/skills/` so discovery cannot reach them. Local and remote installation now
resolve the same layout, and install tests assert both the whole bundle and
single-skill shape.

## Frontmatter

Only `name`, `description`, `license`, `compatibility`, `metadata` and
`allowed-tools` are portable here. The build also requires `name` to match the
directory. Packaging portability is a deterministic gate rather than a
maintainer habit.

## Rejected

- **A runtime shared package.** It breaks standalone skill installation.
- **Ambient SDK resolution.** It makes catalogue behavior depend on the feature
  repository or global machine state.
- **Vendored provider executables or unresolved runtime imports.** They expand
  the shipped trust and compatibility boundary.
- **Unmapped bundle dependencies.** Redistribution without an explicit notice
  owner is not auditable.
- **Hand-maintained generated copies or installer scripts.** Existing package
  managers and mechanical generation already own those responsibilities.
