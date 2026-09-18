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

## What proves the stage is present

The behavior of the declared stage, never the full QC, and only in a disposable
clone: the candidate worktree stays untouched. The stage must be a substring of
the declared QC command, or it exists but no authoritative check runs it.

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

Supplier boundaries and commit ids are never copied: every project owns its own
cutoff.
