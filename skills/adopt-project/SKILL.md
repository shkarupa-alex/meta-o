---
name: adopt-project
description: Bring an existing (brownfield) repository up to the project contract this workflow requires — knowledge chain, module purposes, E2E catalog, QC manifest and make targets — incrementally and without inventing history. Use when preflight reports a missing project contract or the user asks to adopt a project into the AI-driven development workflow.
---

# Adopt an existing project

A project that has never used this workflow will fail preflight. Adoption makes
it pass — honestly. The failure mode to avoid is a contract that exists on disk
and describes a codebase that does not exist.

Do this only after the user has agreed to it.

## What the contract is

| Artefact | Purpose |
|---|---|
| `Makefile` with a `qc` target | The project's own definition of "quality passed" |
| `.quality/qc-manifest.json` | Which gates exist, their commands and policies |
| `docs/knowledge/business.md` | `§B-*` — why this product exists, in business terms |
| `docs/knowledge/glossary.md` | The words this project uses and what they mean |
| `docs/knowledge/architecture/*.md` | `§A-*` — decisions, each citing a `§B-*` |
| `docs/architecture/e2e.md` | Environment, fixtures, execution, cleanup, scenario anchors |
| `docs/architecture/e2e.json` | Machine-readable scenario catalog |
| `make verify-e2e-metadata` | Optional but recommended metadata guard |

`meta-o preflight` reports exactly which of these are missing or invalid.

## Order of work

Adopt breadth-first. A shallow chain over the whole system is worth more than a
perfect chain over one module.

1. **Business truth first.** Interview the user. Write `§B-*` anchors for what
   the product must do for whom, and why. Do not derive business truth from
   code: the code tells you what happens, not what was intended.
2. **Glossary.** Capture the words that already mean something specific here.
3. **Architecture.** For each significant subsystem, write one `§A-*` that names
   the decision and cites the `§B-*` it serves. Where you find a decision nobody
   can justify, record it as a decision with an unknown rationale — do not
   invent one.
4. **Module purposes.** Add a `§M-*` docstring to each module: why it exists and
   what breaks without it. Cite the nearest `§A-*`.
5. **E2E catalog.** Write down the scenarios the team already checks by hand.
   At least one must be `always_required: true`.
6. **QC manifest.** Declare the gates the project already runs. Do not invent
   gates it cannot pass today — see below.

Validate as you go: `meta-o knowledge validate`, `meta-o e2e validate`,
`meta-o preflight`.

## Gates the project cannot pass yet

This is the honest part. If a gate would fail today, you have two options and
neither is silence:

- declare it with a `not_applicable` status **and a written rationale**, which
  the manifest requires and reviewers will read; or
- declare it, let it fail, and record the debt with the user.

Never soften a gate's command to make it green. `meta-o qc weakening` compares
the manifest against the base revision, and a relaxation reaches the user.

## What adoption does not do

- It does not refactor. Adoption describes; features change.
- It does not backfill a history of decisions nobody made.
- It does not create runtime files for this methodology inside the repository —
  all run state lives under `~/.meta-o`.

## Finishing

When `meta-o preflight` passes, adoption is done. Commit the contract as an
ordinary local commit. The next feature run will treat it as tracked content
like any other, which means it is inside the snapshot digest and reviewers will
judge it.
