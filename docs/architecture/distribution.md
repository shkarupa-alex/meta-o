# One source owner, mechanical copies, no runtime sharing

Because _a control layer must earn its keep_ and _deferred work that nobody wrote
down does not exist_ — a divergent methodology copy is exactly the kind of debt
nobody notices they took on.

## The tension

Two things are both required and pull opposite ways:

1. Each skill must install **on its own**. An install with `--skill mo-review`
   copies one directory; a skill that references a file outside it is broken on
   arrival, and a direct `mo-review` after a small fix is the single most-used
   entry point.
2. The methodology must have **one owner**. Seven hand-maintained copies drift,
   and a drifted methodology is worse than none, because each reader believes
   theirs.

## The decision

- Source of truth lives in `shared/`: `references/methodology.md`,
  `references/purpose-and-architecture.md`, `scripts/mo-models.mjs`.
- `src/skills/<name>/` holds only what that skill owns — its `SKILL.md` and its
  own backend or profile references.
- `tools/build-skills.mjs` copies the shared files into each skill that declares
  them and emits `skills/`, the installable tree.
- `make mo-qc` runs `build-skills.mjs --check`, which refuses a `skills/` that
  does not byte-match a fresh build.
- The build also refuses a source skill that _shadows_ a shared file. That is the
  only way a hand-edited copy can begin, so it is where it is stopped.

`skills/` is committed, because the package managers install what the repository
has committed.

**No runtime shared package and no executable router appears.** The duplication
is a build artefact, not an import graph.

## Why the built tree is `skills/` and the sources are under `src/`

The spec spells the installable tree `dist/`. That layout does not install, and
both halves of the failure were reproduced with apm 0.27.0 before this was
changed:

- `apm install ./dist` is refused — `no apm.yml, SKILL.md, or plugin.json found`.
  apm validates the exact directory it is given, and the manifest sat one level
  above it.
- `apm install <path-to-repo>` succeeds and installs the **wrong** tree. Skill
  discovery resolves `<root>/skills/<name>/SKILL.md`, which at the time was the
  authored tree, so `mo-herdr` arrived with no `references/methodology.md` and no
  `scripts/mo-models.mjs`. Every build check passed while the installed product
  was broken. There is no subpath option for a Git shorthand to point discovery
  elsewhere; `apm install --help` offers none.

So the built tree took the name discovery looks for, and the authored tree moved
under `src/` — not as a convention, but so that discovery **cannot** reach it. A
remote install and a local-path install now resolve the same directory, and
`tests/install.test.mjs` runs a real `apm install` and asserts the deployed file
list, both for the whole bundle and for `--skill mo-review` alone. A build gate
could not have caught the original defect; only an install can.

One side effect is worth knowing: apm needs a harness marker in the consuming
project (`.claude/`, `CLAUDE.md`, `.codex/`, `.opencode/`, …) and asks for an
explicit `--target` in a bare directory. That is apm's behaviour, not something
this layout can change, so the README states it instead of pretending otherwise.

## Frontmatter

Only the canonical keys — `name`, `description`, `license`, `compatibility`,
`metadata`, `allowed-tools`. Claude Code accepts roughly eighteen more and
packaging for the Skills API fails hard on any of them; apm additionally requires
`name` to match the directory and silently resolves a mismatch in the
directory's favour. The build checks both, so portability is a gate rather than a
habit.

## Rejected

- **`install.sh` / `update.sh`.** Two package managers already do this, and a
  hand-rolled installer is a second thing to keep correct on every platform.
- **A runtime shared package.** It would make single-skill installation
  impossible, which is the requirement this whole design exists to satisfy.
- **Hand-maintained duplicate references.** See the tension above.
