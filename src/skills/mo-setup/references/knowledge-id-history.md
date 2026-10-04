<!-- Every identifier below is an example of the grammar: mo-vocabulary-ok file -->

# Knowledge id history contract

Checking the current tree and checking history are different things. The tree
shows that identifiers agree now; history shows that no value was silently
redefined or deleted along the way. Neither is provable without the other.

## How a project declares the stage

Guessing is forbidden: an absent declaration is `unknown`, never "probably no".
The project's `AGENTS.md`, or a document `AGENTS.md` names as its quality
contract, must hold a level-two section whose heading contains
`Knowledge id history`, and inside it:

- exactly one fenced block holding exactly one command line — the history stage;
- exactly one line naming the project's authoritative QC command;
- exactly one YAML record with key `history_cutoff_sha` — the project's floor;
- the locations identifiers live in: the business document and the architecture
  directory the stage reads.

A missing section, or any other count of blocks or lines, is `history=unknown`
with `cutoff=none`. Parse it with a real AST library, never with a regular
expression over the document. Locations are read, never assumed: this project's
own `docs/business.md` and `docs/architecture/` are its convention, not a
default anyone else agreed to, and a probe that guesses them either certifies
documents the gate never reads or rewrites whichever file happened to match.

## The grammar the stage enforces

These are the expressions the shipped code uses, quoted verbatim. An identifier
in a heading, from `knowledge-documents.mjs`:

```text
^§([AB])-[A-Z][A-Z0-9-]*-\d{2}(?=\s|$)
```

An identifier mentioned anywhere in the text, from the same module:

```text
§[AB]-[A-Z][A-Z0-9-]*-\d{2}
```

A definition is a Markdown heading of any level whose text starts with an
identifier followed by whitespace or the end of the heading; its section runs
to the next heading of the same or a higher level. A heading such as
`## B2 — Title` or `## D24 — Title` defines nothing, and neither does an
identifier followed by a colon. A project on such an older notation migrates
its definitions and every reference explicitly first; adapting the stage to
an empty set is not an option, because the stage prints `definitions=<n>` and
refuses zero for the scope it was declared to read.

The authorization trailer, from `mo-knowledge-history.mjs`, at most one per
identifier per commit:

```text
^Knowledge-ID-Change: (remove|reuse|editorial) (\S+) via (\S+)$
```

`via` always names an architecture decision identifier, never a commit SHA. For
`remove` and `reuse` the trailer names exactly one identifier, and the named
decision's section holds a YAML record with `action`, `id`, a non-empty
`reason`, a non-empty `new_boundary` and `references_updated: true`. For
`editorial` the trailer names every changed identifier of the commit, sorted and
comma-separated without spaces; the record has `action: editorial`, the same
`ids` in the same order, a non-empty `reason` and `references_updated: true`,
and neither `id` nor `new_boundary`. `editorial` never deletes and never covers
a change of meaning: only heading text, link labels and whitespace may differ,
while ordinary prose, inline and fenced code and citations stay as they were.

The record is a fenced YAML block with the key `knowledge_id_change` (one
record) or `knowledge_id_changes` (a list) inside the section of the decision
the trailer names. A record explains only its own parent edge, and records are
append-only: a later commit adds its own and never edits an old one.

By default the stage reads the business document `docs/business.md` and the
architecture directory `docs/architecture/`; a project names its own with
`--business` and `--architecture`.

## Worked examples

Every example below starts from the same history: the business document
defines two theses, and one decision in the architecture directory serves the
first. Each example's record goes into that decision's section.

A change of meaning of one thesis:

```text
Knowledge-ID-Change: reuse §B-RUNTIME-01 via §A-RUNTIME-01
```

```yaml
knowledge_id_change:
  action: reuse
  id: §B-RUNTIME-01
  reason: The thesis now covers restarts as well.
  new_boundary: A restart keeps the promise the first start made.
  references_updated: true
```

Removing a thesis, together with every citation of it:

```text
Knowledge-ID-Change: remove §B-RUNTIME-02 via §A-RUNTIME-01
```

```yaml
knowledge_id_change:
  action: remove
  id: §B-RUNTIME-02
  reason: The second thesis merged into the first.
  new_boundary: Only the first thesis states the runtime promise.
  references_updated: true
```

Retitling both theses without touching their text:

```text
Knowledge-ID-Change: editorial §B-RUNTIME-01,§B-RUNTIME-02 via §A-RUNTIME-01
```

```yaml
knowledge_id_change:
  action: editorial
  ids: [§B-RUNTIME-01, §B-RUNTIME-02]
  reason: Plainer titles for both theses.
  references_updated: true
```

The same stage refuses `B2`-style headings as an empty scope, a decision
heading whose identifier is followed by a colon as a deleted definition,
`via <sha>`, an `editorial` record carrying `new_boundary`, and an `editorial`
trailer whose identifiers are not sorted.

## Where the gates run

The history stage belongs to the project's authoritative QC. The closure proofs
G0, GC, G1 and G2 run the project's `MO-BACKLOG/1` command on the exact committed
SHA: G0 after intake and before substantive work, GC before completion is
announced, G1 right before an agent creates a merge request and G2 right before
an agent merges. A project whose knowledge layer is `not_enabled` runs none of
them for the layer.

## What proves the stage is present

The behavior of the declared stage, never the full QC, and only in a disposable
clone: the candidate worktree stays untouched. The stage must also be part of
the authoritative check, and the declaration says which way it is: either the
stage command appears verbatim in the declared QC command, or the line naming
that command also names this stage and the tracked runner definition it points
at — a `Makefile` target list, a `package.json` script — contains it. Reading a
tracked runner file is deterministic and changes nothing, while running the full
QC to find out is forbidden here. Neither proof is `gate_missing`: a stage
outside the authoritative check is a stage nobody runs. An aggregate command
that reaches its stages indirectly is the ordinary case, not a gap.

Two fixtures decide it, and both touch only the declared locations. A silent
deletion of a definition the AST found there, committed without a trailer, must
exit non-zero and print a typed line. An authorized reuse — literal changed,
trailer set, `knowledge_id_change` record added — must pass. The first without
the second proves only strictness, the second without the first only tolerance.

## The copy inside a project

Accepted repair copies the bundle to `tools/mo-knowledge-history.mjs` together
with its `tools/licenses/` and a version line as the very last line of the file:

```text
// MO-KNOWLEDGE-HISTORY-SOURCE <semver> <sha256>
```

`<semver>` is the literal `version` of the package the bundle came from.
`<sha256>` hashes the file's bytes **without that line**: it is last, and the
hash covers everything preceding it, so the copy hashes exactly what the
supplier hashes and re-stamping the line changes nothing. `tools/licenses/` is
outside the hash.

Staleness is a comparison: the supplier hashes its own bundle by the same rule.
Equal is `stale=no`. Different is `stale=yes`, and both versions go into the
report. A missing, duplicated or unparsable line is `stale=unknown`. The version
decides nothing — it explains a difference to a human.

A project that owns the tool has nothing to compare against. When the project is
the supplier itself — its `package.json` names the same package this bundle was
built from — the declared stage runs the source the bundle is built from, and
the record is `stale=no`: the absent version line is the absence of a copy, not
an unreadable stamp. Anywhere else the absent line stays `stale=unknown`.

Supplier boundaries and commit ids are never copied: every project owns its own
cutoff.
