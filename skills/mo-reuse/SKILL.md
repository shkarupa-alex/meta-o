---
name: mo-reuse
description: Search the ecosystem for something that already solves the task before it gets built, and write the decision — reuse, extend or build — into the spec's Reuse research section as a spec-only commit. Use only when the user explicitly asks for reuse research or accepts an offer to run it.
license: MIT
---

# Look before you build

You never start on your own. This skill runs only because the user asked for it,
or accepted a single offer to run it. An orchestrator may offer once; a missing
`## Reuse research` section does not block implementation.

You run as a separate top-level agent instance, and you change exactly one thing:
the `## Reuse research` section of a tracked Markdown spec. Then you commit —
spec only. Implementation in that commit is forbidden.

If the task arrived as free text or a URL, you are the first thing that touches
it, so two writes come before any searching:

1. **Record the business framing** — the user's request verbatim: their own words,
   their own line breaks, no summary standing in for anything they said. You are
   holding the only copy. Once this session is compacted, nobody can tell what the
   spec you are about to write dropped.

   It goes in `docs/business.md`, or — when the project already keeps
   `docs/business/index.md` and a file per feature — in this feature's file, with
   the index pointing at it. Check which layout exists before writing; a second
   monolithic `docs/business.md` beside a `docs/business/` tree means two files
   both claim to be the framing.

   **One thing is not recorded verbatim: a secret.** A token, password, key,
   cookie, connection string with credentials, private or authenticated URL,
   customer data or PII is replaced by a marker that keeps its meaning —
   `[REDACTED: deployment token]` — and everything around it stays word for word.
   This file gets committed and pushed; after that a leaked credential is not
   undone by deleting a line. If you cannot tell whether a value is a secret and
   the answer changes what the user meant, stop with `needs_attention` instead of
   guessing.
2. **Create the tracked Markdown spec** from it, with acceptance criteria and an
   empty `## Reuse research` section, and research against that.

Both go in the same spec-only commit as your reuse decision. Recording what the
user said is not implementation, and it is the one write outside the reuse section
you are allowed — because the alternative is losing it.

## Start from what is already here

Before searching outward:

1. Identify the project's languages and ecosystems from its manifests
   (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, …).
2. Read the dependencies that are **already wired in**. Something in the tree
   that solves this costs an import, not a build.
3. Read the project's own `docs/business.md`, `docs/glossary.md` and
   `docs/architecture/`. A decision already recorded there that contradicts the
   task is the single most valuable thing you can find, and it goes straight to
   the user. `docs/business.md` also holds the recorded business framing — the
   user's own words about what they want — and a constraint stated there (a
   language, a licence, a rejected approach) rules out a candidate no matter how
   good its stars look.

## Three adaptive rounds

Three is the default, not a quota. Stop earlier when the evidence is strong and
complete; go further when a specific question is still open.

1. **Broad** — the capability or domain, in the words the task uses.
2. **Sharpened** — the terms, API names and standards you learned from the first
   page of results.
3. **Gap-focused** — the missing capability, an alternative architecture, a
   compatibility constraint, or binding/FFI terms.

Each round does all of this:

1. GitHub search, **separately for each of the project's languages**, sorted by
   stars descending, first page (30), archived excluded;
2. a GitHub Rust search — always, even when the project has no Rust;
3. a search in each ecosystem's native registry;
4. you actually read the names and descriptions of that whole first page;
5. you record what you found and why the next query changed.

```bash
gh search repos "$QUERY" \
  --language "$LANGUAGE" --sort stars --order desc \
  --archived=false --limit 30 \
  --json fullName,description,stargazersCount,pushedAt,license,url,isArchived
```

## Judging Rust candidates

Rust is searched every round because it is where a mature, fast implementation
of a hard problem most often already exists — but stars alone do not make it
usable from another language. Rank by integration path:

1. ready official bindings for your language;
2. a stable C ABI, WASM, N-API, PyO3 or UniFFI path.

Then be honest about the cost: how much wrapper code, whose memory and error
model wins at the boundary, who maintains the binding, and what happens on a
platform you have not tried. A binding that is too expensive is rejected —
saying so is a result, not a failure.

## Registry-specific rules

- **npm** — relevance plus downloads / most-dependents, then `npm view` metadata
  and provenance.
- **crates.io** — `cargo search --limit 30` is textual relevance, **not**
  download ranking. Check adoption and recency on the finalists yourself.
- **PyPI** — the official JSON and Index APIs are not popularity-sorted search.
  Use relevance and metadata, back them with repository evidence, and label any
  external download statistic explicitly as an external source.
- **Anything else** — the ecosystem's native search, and only an adoption metric
  that is genuinely available. Do not invent a ranking.

## What goes in the spec

You saw the whole first page. The spec keeps only what a future reader needs.

```markdown
## Reuse research

### Existing project capabilities

...

### Search iterations

- Round 1: sources, queries, what changed
- Round 2: ...
- Round 3: ...

### Finalists

| Candidate | Fit | License | Maintenance/adoption | Integration/binding cost | Risks |

### Decision

reuse | extend | build

Chosen solution, rejected alternatives and constraints.
```

**build** is a perfectly good decision. A forced reuse that fits badly costs more
than the code it saved, and you are the only role positioned to say so. If the
task turns out to be already implemented in this repository, say so immediately
and loudly — that outcome alone justifies the whole search.

## Boundaries

- Change only the `## Reuse research` section. Do not write code, do not touch
  other files, do not restructure the spec.
- Commit spec-only, once, at the end.
- Do not judge whether the task is worth doing; that is not this turn's question.
- If an implementation later disproves your decision, you may be asked to run
  again. Rewrite only the reuse section and make a new spec-only commit.
